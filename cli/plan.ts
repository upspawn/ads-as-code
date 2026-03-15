import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { flattenAll } from '../src/core/flatten.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import { createGoogleClient } from '../src/google/api.ts'
import { resolveAllMarkers } from '../src/ai/resolve.ts'
import type { GoogleSearchCampaign } from '../src/google/types.ts'
import type { Changeset, Change, Resource } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'

// ─── Plan Output Formatting ─────────────────────────────────────

/** Extract campaign name from a resource path (first segment before "/"). */
function campaignFromPath(path: string): string {
  return path.split('/')[0] ?? path
}

/** Format a property value for human-readable display. */
function formatValue(value: unknown): string {
  if (value === undefined) return '(none)'
  if (value === null) return '(null)'
  if (typeof value === 'object' && value !== null && 'amount' in value && 'currency' in value && 'period' in value) {
    const b = value as { amount: number; currency: string; period: string }
    return `${b.currency} ${b.amount}/${b.period}`
  }
  if (typeof value === 'string') return `"${value}"`
  if (Array.isArray(value)) return `[${value.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}]`
  return JSON.stringify(value)
}

/** Format a resource kind + key info for display. */
function describeResource(resource: Resource): string {
  const props = resource.properties
  switch (resource.kind) {
    case 'campaign':
      return `campaign "${props['name'] ?? resource.path}"`
    case 'adGroup':
      return `ad group "${resource.path.split('/').pop()}"`
    case 'keyword': {
      const text = props['text'] as string | undefined
      const matchType = props['matchType'] as string | undefined
      return `keyword: "${text}" (${matchType?.toLowerCase() ?? 'unknown'})`
    }
    case 'ad':
      return `ad (RSA)`
    case 'sitelink': {
      const text = props['text'] as string | undefined
      return `sitelink: "${text}"`
    }
    case 'callout': {
      const text = props['text'] as string | undefined
      return `callout: "${text}"`
    }
    case 'negative': {
      const text = props['text'] as string | undefined
      const matchType = props['matchType'] as string | undefined
      return `negative: "${text}" (${matchType?.toLowerCase() ?? 'unknown'})`
    }
    default:
      return `${resource.kind}: ${resource.path}`
  }
}

/** Group changes by campaign slug and produce human-readable plan output. */
function formatChangeset(changeset: Changeset, campaignNames: Map<string, string>): string {
  const lines: string[] = []

  // Collect all campaign slugs involved
  const allChanges = [...changeset.creates, ...changeset.updates, ...changeset.deletes, ...changeset.drift]
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

    const campaignCreates = changeset.creates.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignUpdates = changeset.updates.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignDeletes = changeset.deletes.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignDrift = changeset.drift.filter(c => campaignFromPath(c.resource.path) === slug)

    const hasChanges = campaignCreates.length + campaignUpdates.length + campaignDeletes.length + campaignDrift.length > 0

    if (!hasChanges) {
      lines.push('  (no changes)')
      lines.push('')
      continue
    }

    // Creates
    for (const change of campaignCreates) {
      lines.push(`  + ${describeResource(change.resource)}`)
    }

    // Updates
    for (const change of campaignUpdates) {
      if (change.op !== 'update') continue
      for (const pc of change.changes) {
        lines.push(`  ~ ${describeResource(change.resource)}: ${pc.field}: ${formatValue(pc.from)} -> ${formatValue(pc.to)}`)
      }
    }

    // Deletes
    for (const change of campaignDeletes) {
      lines.push(`  - ${describeResource(change.resource)}`)
    }

    // Drift
    if (campaignDrift.length > 0) {
      lines.push('')
      lines.push('  Drift (changed in Google Ads UI):')
      for (const change of campaignDrift) {
        if (change.op !== 'drift') continue
        for (const pc of change.changes) {
          lines.push(`    ~ ${describeResource(change.resource)}: ${pc.field}: ${formatValue(pc.from)} -> ${formatValue(pc.to)}`)
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
  const changedCampaigns = new Set([...allChanges.map(c => campaignFromPath(c.resource.path))]).size

  const parts: string[] = []
  if (totalCreates > 0) parts.push(`${totalCreates} create`)
  if (totalUpdates > 0) parts.push(`${totalUpdates} update`)
  if (totalDeletes > 0) parts.push(`${totalDeletes} delete`)
  if (totalDrift > 0) parts.push(`${totalDrift} drift`)

  if (totalChanges === 0) {
    lines.push('All campaigns in sync. 0 changes.')
  } else {
    lines.push(`Summary: ${changedCampaigns} campaign${changedCampaigns !== 1 ? 's' : ''} changed | ${parts.join(' | ')}`)
    lines.push('Run "ads apply" to push code changes')
    if (totalDrift > 0) {
      lines.push('Run "ads pull" to update code with UI changes')
    }
  }

  return lines.join('\n')
}

// ─── Plan Command ────────────────────────────────────────────────

export async function runPlan(rootDir: string, options: { json?: boolean } = {}): Promise<Changeset> {
  // 1. Load config
  const config = await loadConfig(rootDir)
  if (!config) {
    console.error('No ads.config.ts found. Run "ads init" first.')
    process.exit(1)
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

  // 3. Resolve AI markers (substitute lock file values for marker placeholders)
  const googleDiscovered = discovery.campaigns
    .filter(c => c.provider === 'google')

  const googleCampaigns = await resolveAllMarkers(
    googleDiscovered.map(c => ({ file: c.file, campaign: c.campaign })),
  )

  // 4. Flatten desired state
  const desired = flattenAll(googleCampaigns)

  // Build campaign slug -> name map for display
  const campaignNames = new Map<string, string>()
  for (const c of googleCampaigns) {
    const slug = desired.find(r => r.kind === 'campaign' && r.properties['name'] === c.name)?.path
    if (slug) {
      campaignNames.set(slug, c.name)
    }
  }

  // 5. Create Google client
  // The client factory resolves credentials via config, credentials file, or env vars.
  // We always pass { type: 'env' } and let it resolve — the ads.config.ts customerId/managerId
  // are picked up through env vars or ~/.ads/credentials.json.
  const client = await createGoogleClient({ type: 'env' })

  // 6. Open cache
  const cachePath = config.cache ?? `${rootDir}/.ads/cache.db`
  // Ensure .ads directory exists
  const cacheDir = cachePath.substring(0, cachePath.lastIndexOf('/'))
  await Bun.write(`${cacheDir}/.keep`, '')
  const cache = new Cache(cachePath)

  // 7. Fetch live state
  let actual: Resource[] = []
  try {
    const { fetchAllState } = await import('../src/google/fetch.ts')
    actual = await fetchAllState(client)
  } catch (err) {
    // fetch module may not exist yet (being built by another agent)
    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes('Cannot find module') || errMsg.includes('Module not found')) {
      console.warn('Warning: src/google/fetch.ts not available — comparing against empty state.')
      console.warn('The fetch module is being built by another agent. Proceeding with local-only plan.')
    } else {
      throw err
    }
  }

  // 8. Get managed paths and platformId mapping from cache
  const resourceMap = cache.getResourceMap('default')
  const managedPaths = new Set(resourceMap.map(r => r.path))
  const pathToPlatformId = new Map<string, string>()
  for (const row of resourceMap) {
    if (row.platformId) {
      pathToPlatformId.set(row.path, row.platformId)
    }
  }

  // 9. Run diff
  const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

  // 10. Save snapshot to cache
  cache.saveSnapshot({
    project: 'default',
    source: 'plan',
    state: { desired, actual, changeset },
  })

  // Update resource map with desired resources
  for (const r of desired) {
    cache.setResource({
      project: 'default',
      path: r.path,
      platformId: r.platformId ?? undefined,
      kind: r.kind,
      managedBy: 'ads-as-code',
    })
  }

  cache.close()

  // 11. Print output
  if (options.json) {
    console.log(JSON.stringify(changeset, null, 2))
  } else {
    console.log(formatChangeset(changeset, campaignNames))
  }

  return changeset
}

/** CLI entry point — called from cli/index.ts */
export async function runPlanCommand(args: string[], flags: GlobalFlags): Promise<void> {
  const rootDir = process.cwd()
  await runPlan(rootDir, { json: flags.json })
}
