import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { flattenAll } from '../src/core/flatten.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import { createGoogleClient } from '../src/google/api.ts'
import type { GoogleSearchCampaign } from '../src/google/types.ts'
import type { Changeset, Change, Resource } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'

// ─── Helpers ─────────────────────────────────────────────────────

/** Extract campaign name from a resource path. */
function campaignFromPath(path: string): string {
  return path.split('/')[0] ?? path
}

/** Format a resource for brief display. */
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
    case 'sitelink':
      return `sitelink: "${props['text']}"`
    case 'callout':
      return `callout: "${props['text']}"`
    case 'negative': {
      const text = props['text'] as string | undefined
      return `negative: "${text}"`
    }
    default:
      return `${resource.kind}: ${resource.path}`
  }
}

/** Format a value for display. */
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

/** Print the plan in human-readable format. */
function printPlan(changeset: Changeset, campaignNames: Map<string, string>): void {
  const allChanges = [...changeset.creates, ...changeset.updates, ...changeset.deletes, ...changeset.drift]
  const campaignSlugs = new Set<string>()

  for (const change of allChanges) {
    campaignSlugs.add(campaignFromPath(change.resource.path))
  }
  for (const slug of campaignNames.keys()) {
    campaignSlugs.add(slug)
  }

  const sortedSlugs = [...campaignSlugs].sort()

  for (const slug of sortedSlugs) {
    const displayName = campaignNames.get(slug) ?? slug
    console.log(`Campaign "${displayName}"`)

    const campaignCreates = changeset.creates.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignUpdates = changeset.updates.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignDeletes = changeset.deletes.filter(c => campaignFromPath(c.resource.path) === slug)
    const campaignDrift = changeset.drift.filter(c => campaignFromPath(c.resource.path) === slug)

    const hasChanges = campaignCreates.length + campaignUpdates.length + campaignDeletes.length + campaignDrift.length > 0

    if (!hasChanges) {
      console.log('  (no changes)')
      console.log()
      continue
    }

    for (const change of campaignCreates) {
      console.log(`  + ${describeResource(change.resource)}`)
    }

    for (const change of campaignUpdates) {
      if (change.op !== 'update') continue
      for (const pc of change.changes) {
        console.log(`  ~ ${describeResource(change.resource)}: ${pc.field}: ${formatValue(pc.from)} -> ${formatValue(pc.to)}`)
      }
    }

    for (const change of campaignDeletes) {
      console.log(`  - ${describeResource(change.resource)}`)
    }

    if (campaignDrift.length > 0) {
      console.log()
      console.log('  Drift (changed in Google Ads UI):')
      for (const change of campaignDrift) {
        if (change.op !== 'drift') continue
        for (const pc of change.changes) {
          console.log(`    ~ ${describeResource(change.resource)}: ${pc.field}: ${formatValue(pc.from)} -> ${formatValue(pc.to)}`)
        }
      }
    }

    console.log()
  }

  // Summary
  const totalCreates = changeset.creates.length
  const totalUpdates = changeset.updates.length
  const totalDeletes = changeset.deletes.length
  const totalDrift = changeset.drift.length
  const totalChanges = totalCreates + totalUpdates + totalDeletes + totalDrift
  const changedCampaigns = new Set(allChanges.map(c => campaignFromPath(c.resource.path))).size

  const parts: string[] = []
  if (totalCreates > 0) parts.push(`${totalCreates} create`)
  if (totalUpdates > 0) parts.push(`${totalUpdates} update`)
  if (totalDeletes > 0) parts.push(`${totalDeletes} delete`)
  if (totalDrift > 0) parts.push(`${totalDrift} drift`)

  if (totalChanges === 0) {
    console.log('All campaigns in sync. 0 changes.')
  } else {
    console.log(`Summary: ${changedCampaigns} campaign${changedCampaigns !== 1 ? 's' : ''} changed | ${parts.join(' | ')}`)
  }
}

/** Prompt the user for yes/no confirmation. Returns true if confirmed. */
async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} `)
  const response = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8')
    process.stdin.once('data', (data: string) => {
      resolve(data.trim().toLowerCase())
    })
    process.stdin.resume()
  })
  process.stdin.pause()
  return response === 'y' || response === 'yes'
}

// ─── Apply Command ───────────────────────────────────────────────

type ApplyOptions = {
  json?: boolean
  yes?: boolean
  dryRun?: boolean
  reconcile?: boolean
}

export async function runApply(rootDir: string, options: ApplyOptions = {}): Promise<void> {
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
    return
  }

  // 3. Flatten desired state
  const googleCampaigns = discovery.campaigns
    .filter(c => c.provider === 'google')
    .map(c => c.campaign as GoogleSearchCampaign)

  const desired = flattenAll(googleCampaigns)

  // Build campaign slug -> name map
  const campaignNames = new Map<string, string>()
  for (const c of googleCampaigns) {
    const slug = desired.find(r => r.kind === 'campaign' && r.properties['name'] === c.name)?.path
    if (slug) {
      campaignNames.set(slug, c.name)
    }
  }

  // 4. Create Google client
  const client = await createGoogleClient({ type: 'env' })

  // 5. Open cache
  const cachePath = config.cache ?? `${rootDir}/.ads/cache.db`
  const cacheDir = cachePath.substring(0, cachePath.lastIndexOf('/'))
  await Bun.write(`${cacheDir}/.keep`, '')
  const cache = new Cache(cachePath)

  // 6. Fetch live state
  // Dynamic import path constructed at runtime to avoid compile-time resolution errors
  // when the fetch module doesn't exist yet (being built by another agent).
  let actual: Resource[] = []
  try {
    const fetchModulePath = ['..', 'src', 'google', 'fetch.ts'].join('/')
    const fetchModule = await import(fetchModulePath) as Record<string, unknown>
    if (typeof fetchModule['fetchAllState'] === 'function') {
      actual = await (fetchModule['fetchAllState'] as (client: unknown) => Promise<Resource[]>)(client)
    } else if (typeof fetchModule['fetchKnownState'] === 'function') {
      const cachedPaths = cache.getManagedPaths('default', 'ads-as-code')
      actual = await (fetchModule['fetchKnownState'] as (client: unknown, paths: string[]) => Promise<Resource[]>)(client, cachedPaths)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND' ||
        (err as Error)?.message?.includes('Cannot find module') ||
        (err as Error)?.message?.includes('Module not found')) {
      console.warn('Warning: src/google/fetch.ts not available — comparing against empty state.')
      console.warn('The fetch module is being built by another agent. Proceeding with local-only plan.')
    } else {
      throw err
    }
  }

  // 7. Get managed paths and platformId mapping from cache
  const resourceMap = cache.getResourceMap('default')
  const managedPaths = new Set(resourceMap.map(r => r.path))
  const pathToPlatformId = new Map<string, string>()
  for (const row of resourceMap) {
    if (row.platformId) {
      pathToPlatformId.set(row.path, row.platformId)
    }
  }

  // 8. Run diff
  let changeset = diff(desired, actual, managedPaths, pathToPlatformId)

  // 9. Check if there are any changes
  const totalChanges = changeset.creates.length + changeset.updates.length + changeset.deletes.length + changeset.drift.length
  if (totalChanges === 0) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'in_sync', changes: 0 }))
    } else {
      console.log('All campaigns in sync. 0 changes.')
    }
    cache.close()
    return
  }

  // 10. Display plan
  if (!options.json) {
    printPlan(changeset, campaignNames)
    console.log()
  }

  // 11. Dry run — stop here
  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'dry_run', changeset }, null, 2))
    } else {
      console.log('Dry run — no changes applied.')
    }
    cache.close()
    return
  }

  // 12. Reconcile mode — convert drift to updates
  if (options.reconcile) {
    const reconciledUpdates: Change[] = changeset.drift.map(change => {
      if (change.op !== 'drift') return change
      // Swap from/to: we want to overwrite platform with code values
      const reversedChanges = change.changes.map(pc => ({
        field: pc.field,
        from: pc.from,
        to: pc.to,
      }))
      return { op: 'update' as const, resource: change.resource, changes: reversedChanges }
    })

    changeset = {
      creates: changeset.creates,
      updates: [...changeset.updates, ...reconciledUpdates],
      deletes: changeset.deletes,
      drift: [],
    }

    if (!options.json) {
      console.log(`Reconcile mode: ${reconciledUpdates.length} drift change${reconciledUpdates.length !== 1 ? 's' : ''} will be overwritten with code values.`)
      console.log()
    }
  }

  // Count actionable changes (creates + updates + deletes, not drift)
  const actionableCount = changeset.creates.length + changeset.updates.length + changeset.deletes.length

  if (actionableCount === 0) {
    if (!options.json) {
      console.log('No actionable changes. Only drift detected — run with --reconcile to overwrite platform state.')
    }
    cache.close()
    return
  }

  // 13. Confirm
  if (!options.yes) {
    const confirmed = await confirm(`Apply ${actionableCount} change${actionableCount !== 1 ? 's' : ''}? (y/N)`)
    if (!confirmed) {
      console.log('Aborted.')
      cache.close()
      return
    }
  }

  // 14. Execute via google/apply.ts
  type ApplyResult = { path: string; op: string; success: boolean; error?: string; platformId?: string }
  const results: ApplyResult[] = []

  try {
    const applyModulePath = ['..', 'src', 'google', 'apply.ts'].join('/')
    const applyModule = await import(applyModulePath) as Record<string, unknown>
    if (typeof applyModule['applyChangeset'] === 'function') {
      const applyFn = applyModule['applyChangeset'] as (client: unknown, changeset: Changeset) => Promise<ApplyResult[]>
      const applyResults = await applyFn(client, changeset)
      results.push(...applyResults)
    } else {
      throw new Error('applyChangeset not found in module')
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND' ||
        (err as Error)?.message?.includes('Cannot find module') ||
        (err as Error)?.message?.includes('Module not found') ||
        (err as Error)?.message === 'applyChangeset not found in module') {
      console.error('Error: src/google/apply.ts not available.')
      console.error('The apply module is being built by another agent. Cannot apply changes yet.')
      cache.close()
      process.exit(1)
    } else {
      throw err
    }
  }

  // 15. Print results
  if (options.json) {
    console.log(JSON.stringify({ status: 'applied', results }, null, 2))
  } else {
    console.log()
    console.log('Results:')
    let successCount = 0
    let failCount = 0
    for (const result of results) {
      if (result.success) {
        successCount++
        const idInfo = result.platformId ? ` (${result.platformId})` : ''
        console.log(`  ✓ ${result.op} ${result.path}${idInfo}`)
      } else {
        failCount++
        console.log(`  ✗ ${result.op} ${result.path}: ${result.error ?? 'unknown error'}`)
      }
    }
    console.log()
    console.log(`${successCount} succeeded, ${failCount} failed.`)
  }

  // 16. Update cache with results
  for (const result of results) {
    if (result.success && result.platformId) {
      const resource = desired.find(r => r.path === result.path)
      if (resource) {
        cache.setResource({
          project: 'default',
          path: result.path,
          platformId: result.platformId,
          kind: resource.kind,
          managedBy: 'ads-as-code',
        })
      }
    }
  }

  // Save operation to cache history
  cache.saveOperation({
    project: 'default',
    changeset: changeset as unknown as Record<string, unknown>,
    results: results as unknown as Record<string, unknown>[],
    user: process.env['USER'] ?? 'unknown',
  })

  cache.close()
}

/** CLI entry point — called from cli/index.ts */
export async function runApplyCommand(args: string[], flags: GlobalFlags): Promise<void> {
  const rootDir = process.cwd()
  await runApply(rootDir, {
    json: flags.json,
    yes: args.includes('--yes') || args.includes('-y'),
    dryRun: args.includes('--dry-run'),
    reconcile: args.includes('--reconcile'),
  })
}
