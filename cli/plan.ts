import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { resolveProviders, getProvider } from '../src/core/providers.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import { resolveAllMarkers } from '../src/ai/resolve.ts'
import type { Changeset, Resource, AdsConfig } from '../src/core/types.ts'
import type { DiscoveredCampaign } from '../src/core/discovery.ts'
import type { ProviderModule } from '../src/core/providers.ts'
import type { GlobalFlags } from './init.ts'

// ─── Currency Formatting ────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20ac',
  USD: '$',
  GBP: '\u00a3',
}

function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code + ' '
}

// ─── Plan Output Formatting ─────────────────────────────────────

/** Extract campaign name from a resource path (first segment before "/"). */
function campaignFromPath(path: string): string {
  return path.split('/')[0] ?? path
}

/** Format a budget value with resolved currency symbol. */
function formatBudget(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)
  const b = value as Record<string, unknown>
  if ('amount' in b && 'currency' in b && 'period' in b) {
    const sym = currencySymbol(String(b.currency))
    const amount = Number(b.amount).toFixed(2)
    return `${b.period} ${sym}${amount}`
  }
  return JSON.stringify(value)
}

/** Format a property value for human-readable display. */
function formatValue(value: unknown): string {
  if (value === undefined) return '(none)'
  if (value === null) return '(null)'
  if (typeof value === 'object' && value !== null && 'amount' in value && 'currency' in value && 'period' in value) {
    return formatBudget(value)
  }
  if (typeof value === 'string') return `"${value}"`
  if (Array.isArray(value)) return `[${value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]`
  return JSON.stringify(value)
}

/** Human-readable label for a resource kind. */
function kindLabel(kind: string): string {
  switch (kind) {
    case 'campaign': return 'campaign'
    case 'adGroup': return 'ad group'
    case 'adSet': return 'ad set'
    case 'keyword': return 'keyword'
    case 'ad': return 'ad'
    case 'creative': return 'creative'
    case 'sitelink': return 'sitelink'
    case 'callout': return 'callout'
    case 'negative': return 'negative'
    default: return kind
  }
}

/**
 * Build a human-readable hierarchy string for a resource.
 * Uses `name` properties from parent resources resolved via `allResources`,
 * joined with the arrow separator.
 */
function buildHierarchy(resource: Resource, allResources: Resource[]): string {
  const segments = resource.path.split('/')
  const parts: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const partialPath = segments.slice(0, i + 1).join('/')
    const parent = allResources.find(r => r.path === partialPath)
    if (parent) {
      const name = parent.properties['name'] as string | undefined
      parts.push(name ?? segments[i]!)
    } else {
      parts.push(segments[i]!)
    }
  }

  return parts.join(' \u2192 ')
}

/** Format a resource kind + key info for display. */
function describeResource(resource: Resource, allResources: Resource[]): string {
  const props = resource.properties
  const kind = kindLabel(resource.kind)
  const padded = kind.padEnd(12)

  switch (resource.kind) {
    case 'campaign': {
      const name = props['name'] as string ?? resource.path
      const budgetStr = props['budget'] ? ` (${formatBudget(props['budget'])})` : ''
      return `${padded} ${name}${budgetStr}`
    }
    case 'adGroup':
    case 'adSet':
      return `${padded} ${buildHierarchy(resource, allResources)}`
    case 'keyword': {
      const text = props['text'] as string | undefined
      const matchType = props['matchType'] as string | undefined
      return `${padded} ${buildHierarchy(resource, allResources)}: "${text}" (${matchType?.toLowerCase() ?? 'unknown'})`
    }
    case 'ad':
      return `${padded} ${buildHierarchy(resource, allResources)}`
    case 'creative': {
      const headline = props['headline'] as string | undefined
      const format = props['format'] as string | undefined
      const suffix = headline ? ` (${format ?? 'creative'}, "${headline}")` : ''
      return `${padded} ${buildHierarchy(resource, allResources)}${suffix}`
    }
    case 'sitelink': {
      const text = props['text'] as string | undefined
      return `${padded} "${text}"`
    }
    case 'callout': {
      const text = props['text'] as string | undefined
      return `${padded} "${text}"`
    }
    case 'negative': {
      const text = props['text'] as string | undefined
      const matchType = props['matchType'] as string | undefined
      return `${padded} "${text}" (${matchType?.toLowerCase() ?? 'unknown'})`
    }
    default:
      return `${padded} ${resource.path}`
  }
}

/**
 * Format default annotations for a create operation.
 * Reads `_defaults` from resource.meta (SDK-internal data).
 */
function formatDefaultAnnotations(resource: Resource): string[] {
  const defaults = resource.meta?.['_defaults'] as
    | Array<{ field: string; value: unknown; source?: string }>
    | undefined
  if (!defaults || defaults.length === 0) return []

  const lines: string[] = []
  for (const d of defaults) {
    const source = d.source
      ? ` (default${d.source !== 'default' ? ' from ' + d.source : ''})`
      : ' (default)'
    lines.push(`                  ${String(d.field).padEnd(16)}${formatValue(d.value)}${source}`)
  }
  return lines
}

/** Provider display header. */
function providerHeader(provider: string, config: AdsConfig): string {
  switch (provider) {
    case 'google': {
      const customerId = config.google?.customerId ?? ''
      return `Google Ads \u2014 ${customerId}`
    }
    case 'meta': {
      const accountId = config.meta?.accountId ?? ''
      return `Meta Ads \u2014 ${accountId}`
    }
    default:
      return provider
  }
}

/** Group changes by campaign slug and produce human-readable plan output. */
function formatChangeset(
  changeset: Changeset,
  campaignNames: Map<string, string>,
  allDesired: Resource[],
  provider: string,
  config: AdsConfig,
): string {
  const lines: string[] = []

  // Provider header
  lines.push(providerHeader(provider, config))
  lines.push('')

  // Collect all campaign slugs involved
  const allChanges = [
    ...changeset.creates,
    ...changeset.updates,
    ...changeset.deletes,
    ...changeset.drift,
  ]
  const campaignSlugs = new Set<string>()

  for (const change of allChanges) {
    campaignSlugs.add(campaignFromPath(change.resource.path))
  }

  // Also add campaigns with no changes
  for (const slug of campaignNames.keys()) {
    campaignSlugs.add(slug)
  }

  const sortedSlugs = [...campaignSlugs].sort()

  for (const slug of sortedSlugs) {
    const displayName = campaignNames.get(slug) ?? slug
    lines.push(`Campaign "${displayName}"`)

    const campaignCreates = changeset.creates.filter(
      c => campaignFromPath(c.resource.path) === slug,
    )
    const campaignUpdates = changeset.updates.filter(
      c => campaignFromPath(c.resource.path) === slug,
    )
    const campaignDeletes = changeset.deletes.filter(
      c => campaignFromPath(c.resource.path) === slug,
    )
    const campaignDrift = changeset.drift.filter(
      c => campaignFromPath(c.resource.path) === slug,
    )

    const hasChanges =
      campaignCreates.length +
      campaignUpdates.length +
      campaignDeletes.length +
      campaignDrift.length > 0

    if (!hasChanges) {
      lines.push('  (no changes)')
      lines.push('')
      continue
    }

    // Creates with default annotations on subsequent lines
    for (const change of campaignCreates) {
      lines.push(`  + ${describeResource(change.resource, allDesired)}`)
      const annotations = formatDefaultAnnotations(change.resource)
      for (const annotation of annotations) {
        lines.push(annotation)
      }
    }

    // Updates with property-level diffs on subsequent lines
    for (const change of campaignUpdates) {
      if (change.op !== 'update') continue
      lines.push(`  ~ ${describeResource(change.resource, allDesired)}`)
      for (const pc of change.changes) {
        if (pc.field === 'budgetResourceName') continue // internal metadata
        lines.push(
          `                  ${pc.field.padEnd(16)}${formatValue(pc.from)}  \u2192  ${formatValue(pc.to)}`,
        )
      }
    }

    // Deletes
    for (const change of campaignDeletes) {
      lines.push(`  - ${describeResource(change.resource, allDesired)}`)
    }

    // Drift
    if (campaignDrift.length > 0) {
      const uiLabel =
        provider === 'google'
          ? 'Google Ads'
          : provider === 'meta'
            ? 'Meta Ads'
            : provider

      lines.push('')
      lines.push(`  Drift (changed in ${uiLabel} UI):`)
      for (const change of campaignDrift) {
        if (change.op !== 'drift') continue
        lines.push(`    ~ ${describeResource(change.resource, allDesired)}`)
        for (const pc of change.changes) {
          lines.push(
            `                    ${pc.field.padEnd(16)}${formatValue(pc.from)}  \u2192  ${formatValue(pc.to)}`,
          )
        }
      }
    }

    lines.push('')
  }

  // Summary line
  const totalCreates = changeset.creates.length
  const totalUpdates = changeset.updates.length
  const totalDeletes = changeset.deletes.length
  const totalDrift = changeset.drift.length
  const totalChanges = totalCreates + totalUpdates + totalDeletes + totalDrift
  const changedCampaigns = new Set(
    allChanges.map(c => campaignFromPath(c.resource.path)),
  ).size

  const parts: string[] = []
  if (totalCreates > 0) parts.push(`${totalCreates} create`)
  if (totalUpdates > 0) parts.push(`${totalUpdates} update`)
  if (totalDeletes > 0) parts.push(`${totalDeletes} delete`)
  if (totalDrift > 0) parts.push(`${totalDrift} drift`)

  if (totalChanges === 0) {
    lines.push('All campaigns in sync. 0 changes.')
  } else {
    lines.push(
      `Summary: ${changedCampaigns} campaign${changedCampaigns !== 1 ? 's' : ''} changed | ${parts.join(' | ')}`,
    )
    lines.push('Run "ads apply" to push code changes')
    if (totalDrift > 0) {
      lines.push('Run "ads pull" to update code with UI changes')
    }
  }

  return lines.join('\n')
}

// ─── Google-Specific Pre-Processing ─────────────────────────────

/**
 * Google campaigns may contain AI markers that need resolution before
 * flattening. Reads companion .gen.json lock files and substitutes
 * marker placeholders with generated values.
 */
async function preprocessGoogle(
  campaigns: DiscoveredCampaign[],
): Promise<unknown[]> {
  return resolveAllMarkers(
    campaigns.map(c => ({ file: c.file, campaign: c.campaign })),
  )
}

// ─── Per-Provider Plan Pipeline ─────────────────────────────────

type ProviderPlanResult = {
  provider: string
  changeset: Changeset
  desired: Resource[]
  campaignNames: Map<string, string>
}

/**
 * Sort campaigns so that base files come before their dedup variants.
 * ASCII sorts "foo-2.ts" before "foo.ts" because '-' < '.', but the
 * dedup logic needs "foo.ts" (no suffix) first to assign the plain slug.
 *
 * Extracts the filename stem, separates the dedup suffix (e.g., "-2"),
 * and sorts: first by stem, then by suffix number (0 for no suffix).
 */
function sortCampaignsByFile(campaigns: DiscoveredCampaign[]): DiscoveredCampaign[] {
  return [...campaigns].sort((a, b) => {
    const nameA = a.file.split('/').pop()?.replace(/\.ts$/, '') ?? ''
    const nameB = b.file.split('/').pop()?.replace(/\.ts$/, '') ?? ''

    // Extract dedup suffix: "retargeting-website-visitors-2" -> stem="retargeting-website-visitors", num=2
    const matchA = nameA.match(/^(.+)-(\d+)$/)
    const matchB = nameB.match(/^(.+)-(\d+)$/)

    const stemA = matchA ? matchA[1]! : nameA
    const stemB = matchB ? matchB[1]! : nameB
    const numA = matchA ? parseInt(matchA[2]!, 10) : 0
    const numB = matchB ? parseInt(matchB[2]!, 10) : 0

    // Sort by stem first, then by suffix number (0 = no suffix = first)
    const stemCmp = stemA.localeCompare(stemB)
    return stemCmp !== 0 ? stemCmp : numA - numB
  })
}

async function planForProvider(
  provider: string,
  campaigns: DiscoveredCampaign[],
  providerModule: ProviderModule,
  config: AdsConfig,
  _rootDir: string,
  cache: Cache,
): Promise<ProviderPlanResult> {
  // 0. Sort campaigns so base files come before dedup variants (-2, -3, etc.)
  //    This ensures the flatten-side dedup assigns the same suffixes as the
  //    fetch side (which sorts by platform ID, and import writes base slug first).
  const sortedCampaigns = sortCampaignsByFile(campaigns)

  // 1. Pre-process campaigns (provider-specific marker resolution)
  let campaignObjects: unknown[]
  if (provider === 'google') {
    campaignObjects = await preprocessGoogle(sortedCampaigns)
  } else {
    campaignObjects = sortedCampaigns.map(c => c.campaign)
  }

  // 2. Flatten desired state
  const desired = providerModule.flatten(campaignObjects)

  // 3. Build campaign slug -> name map for display
  const campaignNames = new Map<string, string>()
  for (const r of desired) {
    if (r.kind === 'campaign') {
      const name = r.properties['name'] as string | undefined
      if (name) {
        campaignNames.set(r.path, name)
      }
    }
  }

  // 4. Fetch live state from the ad platform
  let actual: Resource[] = []
  try {
    actual = await providerModule.fetchAll(config, cache)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (
      errMsg.includes('Cannot find module') ||
      errMsg.includes('Module not found') ||
      errMsg.includes('not implemented')
    ) {
      console.warn(
        `Warning: ${provider} fetch not available \u2014 comparing against empty state.`,
      )
    } else {
      throw err
    }
  }

  // 5. Get managed paths and platformId mapping from cache
  const resourceMap = cache.getResourceMap('default')
  const managedPaths = new Set(resourceMap.map(r => r.path))
  const pathToPlatformId = new Map<string, string>()
  for (const row of resourceMap) {
    if (row.platformId) {
      pathToPlatformId.set(row.path, row.platformId)
    }
  }

  // 6. Run diff
  const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

  return { provider, changeset, desired, campaignNames }
}

// ─── Plan Command ────────────────────────────────────────────────

export async function runPlan(
  rootDir: string,
  options: { json?: boolean; provider?: string } = {},
): Promise<Changeset> {
  // 1. Load config
  const config = await loadConfig(rootDir)
  if (!config) {
    console.error('No ads.config.ts found. Run "ads init" first.')
    process.exit(1)
    return { creates: [], updates: [], deletes: [], drift: [] } // unreachable, satisfies TS
  }

  // 2. Discover campaigns
  const discovery = await discoverCampaigns(rootDir)
  if (discovery.errors.length > 0) {
    console.error('Campaign discovery errors:')
    for (const err of discovery.errors) {
      console.error(`  ${err.file}: ${err.message}`)
    }
    process.exit(1)
  }

  if (discovery.campaigns.length === 0) {
    console.log('No campaigns found in campaigns/**/*.ts')
    return { creates: [], updates: [], deletes: [], drift: [] }
  }

  // 3. Group campaigns by provider, optionally filtering
  const grouped = resolveProviders(discovery.campaigns, options.provider)

  // 4. Open cache
  const cachePath = config.cache ?? `${rootDir}/.ads/cache.db`
  const cacheDir = cachePath.substring(0, cachePath.lastIndexOf('/'))
  await Bun.write(`${cacheDir}/.keep`, '')
  const cache = new Cache(cachePath)

  // 5. Run plan for each provider
  const results: ProviderPlanResult[] = []
  const sortedProviders = [...grouped.keys()].sort()

  for (const providerName of sortedProviders) {
    const providerCampaigns = grouped.get(providerName)!
    const providerModule = await getProvider(providerName)

    const result = await planForProvider(
      providerName,
      providerCampaigns,
      providerModule,
      config,
      rootDir,
      cache,
    )
    results.push(result)
  }

  // 6. Merge all changesets for the combined return value
  const mergedChangeset: Changeset = {
    creates: results.flatMap(r => r.changeset.creates),
    updates: results.flatMap(r => r.changeset.updates),
    deletes: results.flatMap(r => r.changeset.deletes),
    drift: results.flatMap(r => r.changeset.drift),
  }

  // 7. Save snapshot and update resource map
  cache.saveSnapshot({
    project: 'default',
    source: 'plan',
    state: {
      desired: results.flatMap(r => r.desired),
      actual: [],
      changeset: mergedChangeset,
    },
  })

  for (const result of results) {
    for (const r of result.desired) {
      cache.setResource({
        project: 'default',
        path: r.path,
        platformId: r.platformId ?? undefined,
        kind: r.kind,
        managedBy: 'ads-as-code',
      })
    }
  }

  cache.close()

  // 8. Print output
  if (options.json) {
    console.log(JSON.stringify(mergedChangeset, null, 2))
  } else {
    const outputParts: string[] = []
    for (const result of results) {
      outputParts.push(
        formatChangeset(
          result.changeset,
          result.campaignNames,
          result.desired,
          result.provider,
          config,
        ),
      )
    }
    console.log(outputParts.join('\n\n'))
  }

  return mergedChangeset
}

/** CLI entry point -- called from cli/index.ts */
export async function runPlanCommand(
  args: string[],
  flags: GlobalFlags,
): Promise<void> {
  const rootDir = process.cwd()
  await runPlan(rootDir, { json: flags.json, provider: flags.provider })
}
