import { loadConfig, discoverCampaigns, sortCampaignsByFile } from '../src/core/discovery.ts'
import { resolveProviders, getProvider } from '../src/core/providers.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import { resolveAllMarkers } from '../src/ai/resolve.ts'
import { resolveAssets } from '../src/core/asset.ts'
import type { AssetResolution } from '../src/core/asset.ts'
import type { Changeset, Resource, AdsConfig } from '../src/core/types.ts'
import type { DiscoveredCampaign } from '../src/core/discovery.ts'
import type { ProviderModule } from '../src/core/providers.ts'
import type { GlobalFlags } from './init.ts'
import type { PerformanceData, PerformancePeriod, AnalysisResult, PerformanceTargets } from '../src/performance/types.ts'
import type { FetchPerformanceInput } from '../src/performance/fetch.ts'
import { extractTargets, resolveTargetInheritance } from '../src/performance/resolve.ts'
import { analyze } from '../src/performance/analyze.ts'

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
    case 'sharedBudget': return 'shared budget'
    case 'sharedSet': return 'shared set'
    case 'sharedCriterion': return 'shared negative'
    case 'conversionAction': return 'conversion action'
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
    case 'sharedBudget': {
      const name = props['name'] as string ?? resource.path
      const amount = props['amount'] as number | undefined
      const currency = props['currency'] as string | undefined
      const period = props['period'] as string | undefined
      const budgetStr = amount != null && currency ? ` (${period ?? 'daily'} ${currencySymbol(currency)}${amount.toFixed(2)})` : ''
      return `${padded} ${name}${budgetStr}`
    }
    case 'conversionAction': {
      const name = props['name'] as string ?? resource.path
      const type = props['type'] as string | undefined
      return `${padded} ${name}${type ? ` (${type})` : ''}`
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
    // Use appropriate header for shared resources vs campaigns
    const header = slug.startsWith('budget:') ? 'Shared Budget'
      : slug.startsWith('shared:') ? 'Shared Set'
      : slug.startsWith('conversion:') ? 'Conversion Action'
      : 'Campaign'
    lines.push(`${header} "${displayName}"`)

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
  assets: AssetResolution[]
}

// sortCampaignsByFile is imported from src/core/discovery.ts

async function planForProvider(
  provider: string,
  campaigns: DiscoveredCampaign[],
  providerModule: ProviderModule,
  config: AdsConfig,
  _rootDir: string,
  cache: Cache,
  refreshAssets = false,
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

  // 1b. Resolve asset markers (all providers)
  const assetResults = await Promise.all(
    campaignObjects.map(c => resolveAssets(c, { refreshAssets }))
  )
  campaignObjects = assetResults.map(r => r.resolved)
  const allAssets = assetResults.flatMap(r => r.assets)

  // 2. Flatten desired state
  const desired = providerModule.flatten(campaignObjects)

  // 3. Build campaign/resource slug -> name map for display
  const campaignNames = new Map<string, string>()
  const TOP_LEVEL_KINDS = new Set(['campaign', 'sharedBudget', 'sharedSet', 'conversionAction'])
  for (const r of desired) {
    if (TOP_LEVEL_KINDS.has(r.kind)) {
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

  return { provider, changeset, desired, campaignNames, assets: allAssets }
}

// ─── Performance Integration ─────────────────────────────────────

/** Default period for performance data in plan output: last 7 days. */
function defaultPlanPeriod(): PerformancePeriod {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

/**
 * Build provider clients for performance fetch.
 * Best-effort — returns empty input if credentials are unavailable.
 */
async function buildPerfFetchInput(
  config: AdsConfig,
  period: PerformancePeriod,
  providerFilter?: string,
): Promise<FetchPerformanceInput> {
  const input: {
    google?: FetchPerformanceInput['google']
    meta?: FetchPerformanceInput['meta']
    period: PerformancePeriod
  } = { period }

  if (config.google && (!providerFilter || providerFilter === 'google')) {
    try {
      const { createGoogleClient } = await import('../src/google/api.ts')
      const client = await createGoogleClient({ type: 'env' })
      input.google = { client }
    } catch {
      // Non-fatal — performance is informational
    }
  }

  if (config.meta && (!providerFilter || providerFilter === 'meta')) {
    try {
      const { createMetaClient } = await import('../src/meta/api.ts')
      const client = createMetaClient(config.meta)
      input.meta = { client, accountId: config.meta.accountId }
    } catch {
      // Non-fatal — performance is informational
    }
  }

  return input
}

/**
 * Fetch raw performance data (no analysis). Returns empty array on failure
 * since performance is informational and must never break plan.
 */
async function fetchRawPerformanceData(
  config: AdsConfig,
  providerFilter?: string,
): Promise<PerformanceData[]> {
  try {
    const period = defaultPlanPeriod()
    const fetchInput = await buildPerfFetchInput(config, period, providerFilter)

    if (!fetchInput.google && !fetchInput.meta) return []

    const { fetchPerformance } = await import('../src/performance/fetch.ts')
    return fetchPerformance(fetchInput)
  } catch {
    // Performance is best-effort — silently skip on any failure
    return []
  }
}

/**
 * Single-pass analysis: merge targets from desired resources, compute violations, detect signals.
 * Called once after both raw performance data and desired resources are available.
 */
function analyzePerformanceData(
  rawData: PerformanceData[],
  desired: Resource[],
): AnalysisResult | null {
  if (rawData.length === 0) return null

  try {
    const allTargets = extractTargets(desired)

    // Resolve inheritance so child resources inherit parent targets
    const resolvedTargets = new Map<string, PerformanceTargets>()
    for (const [path] of allTargets) {
      const resolved = resolveTargetInheritance(path, allTargets)
      if (resolved) resolvedTargets.set(path, resolved)
    }

    return analyze(rawData, resolvedTargets)
  } catch {
    return null
  }
}

/**
 * Format performance section for plan output.
 * Compact format: violations per campaign, budget recommendations, signals.
 */
function formatPerformanceSection(analysis: AnalysisResult, currency = 'USD'): string {
  const lines: string[] = []

  // Campaign-level performance data only
  const campaigns = analysis.data.filter(d => d.kind === 'campaign')
  if (campaigns.length === 0) return ''

  lines.push('Performance (last 7d)')

  for (const d of campaigns) {
    const violations = d.violations
    const hasViolation = violations.length > 0

    if (hasViolation) {
      // Show the most important violation (CPA first, then ROAS, etc.)
      const v = violations[0]!
      const icon = v.severity === 'critical' ? '\u2717' : '\u25b2'
      const pct = Math.abs(v.deviation) === Infinity
        ? '\u221e'
        : `${v.deviation > 0 ? '+' : ''}${(v.deviation * 100).toFixed(0)}%`
      const actualStr = v.actual === Infinity ? '\u221e' : `${currencySymbol(currency)}${v.actual.toFixed(2)}`
      const targetStr = `${currencySymbol(currency)}${v.target.toFixed(2)}`
      lines.push(`  ${icon} ${d.resource.padEnd(24)} ${v.metric.toUpperCase()} ${actualStr}  target: ${targetStr}  (${pct})`)
    } else {
      // No violations — show a green check with top metric
      const cpaStr = d.metrics.cpa !== null
        ? `CPA ${currencySymbol(currency)}${d.metrics.cpa.toFixed(2)}`
        : `${d.metrics.impressions} impressions`
      const targetStr = d.targets?.targetCPA !== undefined
        ? `  target: ${currencySymbol(currency)}${d.targets.targetCPA.toFixed(2)}`
        : ''
      lines.push(`  \u2713 ${d.resource.padEnd(24)} ${cpaStr}${targetStr}`)
    }
  }

  // Budget recommendations
  const budgetRecs = analysis.recommendations.filter(
    r => r.type === 'scale-budget' || r.type === 'reduce-budget',
  )
  for (const r of budgetRecs) {
    if (r.type === 'scale-budget' || r.type === 'reduce-budget') {
      lines.push(`  \u25b2 ${r.resource.padEnd(24)} ${r.reason}`)
    }
  }

  // Signals (warning/critical only)
  const importantSignals = analysis.signals.filter(s => s.severity !== 'info')
  if (importantSignals.length > 0) {
    lines.push('')
    lines.push('Signals')
    for (const s of importantSignals) {
      const icon = s.severity === 'critical' ? '\u2717' : '\u26a0'
      lines.push(`  ${icon} ${s.resource} \u2014 ${s.message}`)
    }
  }

  return lines.join('\n')
}

// ─── Plan Command ────────────────────────────────────────────────

export async function runPlan(
  rootDir: string,
  options: { json?: boolean; provider?: string; refreshAssets?: boolean } = {},
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

  // 5. Run plan for each provider + fetch performance data in parallel.
  //    Performance fetch starts early and runs concurrently with the structural plan.
  //    Analysis is deferred until desired resources (with targets) are available.
  const sortedProviders = [...grouped.keys()].sort()

  // Start performance fetch early — returns raw data, no analysis yet
  const perfFetchPromise = fetchRawPerformanceData(config, options.provider)

  const results: ProviderPlanResult[] = []
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
      options.refreshAssets,
    )
    results.push(result)
  }

  // Single-pass analysis: desired resources are now available, so we can
  // extract targets and compute violations in one pass (no two-pass waste).
  const allDesiredResources = results.flatMap(r => r.desired)
  const rawPerfData = await perfFetchPromise
  const perfAnalysis = analyzePerformanceData(rawPerfData, allDesiredResources)

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

  // 8. Print asset resolution summary (if any assets were resolved)
  const mergedAssets = results.flatMap(r => r.assets)
  if (mergedAssets.length > 0 && !options.json) {
    console.log('\nAssets:')
    for (const a of mergedAssets) {
      if (a.status === 'cached') console.log(`  \u2713 ${a.name} \u2014 cached`)
      else if (a.status === 'generated') console.log(`  \u25b8 ${a.name} \u2014 generated (${a.durationMs}ms)`)
      else console.log(`  \u2717 ${a.name} \u2014 failed: ${a.error}`)
    }
    const failed = mergedAssets.filter(a => a.status === 'failed')
    if (failed.length > 0) {
      console.log(`\n\u26a0 ${failed.length} asset(s) failed \u2014 affected ads show as unresolved`)
    }
    console.log('')
  }

  // 9. Print output
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

    // 10. Print performance section (informational, after structural diff)
    if (perfAnalysis !== null) {
      const perfCurrency = config?.meta?.currency ?? config?.google ? 'USD' : 'USD'
      const perfOutput = formatPerformanceSection(perfAnalysis, perfCurrency)
      if (perfOutput) {
        console.log('')
        console.log(perfOutput)
      }
    }
  }

  return mergedChangeset
}

/** CLI entry point -- called from cli/index.ts */
export async function runPlanCommand(
  args: string[],
  flags: GlobalFlags,
): Promise<void> {
  const rootDir = process.cwd()
  const refreshAssets = args.includes('--refresh-assets')
  await runPlan(rootDir, { json: flags.json, provider: flags.provider, refreshAssets })
}
