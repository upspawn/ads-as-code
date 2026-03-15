import { loadConfig, discoverCampaigns, sortCampaignsByFile } from '../src/core/discovery.ts'
import { getProvider, resolveProviders } from '../src/core/providers.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import type { Changeset, Change, Resource, ApplyResult } from '../src/core/types.ts'
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
        if (pc.field === 'budgetResourceName') continue  // internal metadata
        console.log(`  ~ ${describeResource(change.resource)}: ${pc.field}: ${formatValue(pc.from)} -> ${formatValue(pc.to)}`)
      }
    }

    for (const change of campaignDeletes) {
      console.log(`  - ${describeResource(change.resource)}`)
    }

    if (campaignDrift.length > 0) {
      console.log()
      console.log('  Drift (changed in platform UI):')
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

/** Merge multiple changesets into one. */
function mergeChangesets(changesets: Changeset[]): Changeset {
  return {
    creates: changesets.flatMap(c => c.creates),
    updates: changesets.flatMap(c => c.updates),
    deletes: changesets.flatMap(c => c.deletes),
    drift: changesets.flatMap(c => c.drift),
  }
}

/** Build a slug -> display name map from desired resources. */
function buildCampaignNames(desired: Resource[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const r of desired) {
    if (r.kind === 'campaign' && typeof r.properties['name'] === 'string') {
      names.set(r.path, r.properties['name'])
    }
  }
  return names
}

/** Convert drift changes into updates that overwrite platform with code values. */
function reconcileChangeset(changeset: Changeset): Changeset {
  const reconciledUpdates: Change[] = changeset.drift.map(change => {
    if (change.op !== 'drift') return change
    return {
      op: 'update' as const,
      resource: change.resource,
      changes: change.changes.map(pc => ({
        field: pc.field,
        from: pc.from,
        to: pc.to,
      })),
    }
  })

  return {
    creates: changeset.creates,
    updates: [...changeset.updates, ...reconciledUpdates],
    deletes: changeset.deletes,
    drift: [],
  }
}

// ─── Apply Command ───────────────────────────────────────────────

type ApplyOptions = {
  json?: boolean
  yes?: boolean
  dryRun?: boolean
  reconcile?: boolean
  verbose?: boolean
  provider?: string
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

  // 3. Group campaigns by provider, respecting --provider filter
  const providerGroups = resolveProviders(discovery.campaigns, options.provider)

  // 4. Open cache
  const cachePath = config.cache ?? `${rootDir}/.ads/cache.db`
  const cacheDir = cachePath.substring(0, cachePath.lastIndexOf('/'))
  await Bun.write(`${cacheDir}/.keep`, '')
  const cache = new Cache(cachePath)

  // 5. For each provider: flatten, fetch, diff
  const allDesired: Resource[] = []
  const providerChangesets: Changeset[] = []
  const campaignNames = new Map<string, string>()

  for (const [providerName, campaigns] of providerGroups) {
    if (!options.json) {
      const label = providerGroups.size > 1 ? `[${providerName}] ` : ''
      console.log(`${label}Loading ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}...`)
    }

    const provider = await getProvider(providerName)

    // Sort campaigns so base files come before dedup variants (-2, -3, etc.)
    // This ensures flatten assigns the same suffixes as fetch (which sorts by platform ID).
    const sortedCampaigns = sortCampaignsByFile(campaigns)

    // Flatten desired state
    const desired = provider.flatten(sortedCampaigns.map(c => c.campaign))
    allDesired.push(...desired)

    // Build campaign name map for display
    for (const [slug, name] of buildCampaignNames(desired)) {
      campaignNames.set(slug, name)
    }

    // Fetch live state from platform
    let actual: Resource[] = []
    try {
      actual = await provider.fetchAll(config, cache)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('Cannot find module') || errMsg.includes('Module not found') ||
          errMsg.includes('not implemented yet')) {
        console.warn(`Warning: ${providerName} fetch not available — comparing against empty state.`)
      } else {
        throw err
      }
    }

    // Seed cache with platform IDs from live state — ensures apply can
    // resolve parent IDs even if import didn't seed the cache properly
    for (const r of actual) {
      if (r.platformId) {
        cache.setResource({
          project: 'default',
          path: r.path,
          platformId: r.platformId,
          kind: r.kind,
          managedBy: providerName,
        })
      }
    }

    // Get managed paths and platformId mapping from cache
    const resourceMap = cache.getResourceMap('default')
    const managedPaths = new Set(resourceMap.map(r => r.path))
    const pathToPlatformId = new Map<string, string>()
    for (const row of resourceMap) {
      if (row.platformId) {
        pathToPlatformId.set(row.path, row.platformId)
      }
    }

    // Run diff
    const changeset = diff(desired, actual, managedPaths, pathToPlatformId)
    providerChangesets.push(changeset)
  }

  // 6. Merge all provider changesets
  let changeset = mergeChangesets(providerChangesets)

  // 7. Check if there are any changes
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

  // 8. Display plan
  if (!options.json) {
    printPlan(changeset, campaignNames)
    console.log()
  }

  // 9. Dry run — show exact API payloads, then stop
  if (options.dryRun) {
    // Generate per-provider API call previews
    for (const [providerName, campaigns] of providerGroups) {
      const provider = await getProvider(providerName)

      if (provider.dryRunChangeset) {
        // Build provider-scoped changeset
        const providerDesired = provider.flatten(campaigns.map(c => c.campaign))
        const providerSlugs = new Set(providerDesired.filter(r => r.kind === 'campaign').map(r => r.path))
        const belongsToProvider = (change: Change): boolean => {
          const slug = campaignFromPath(change.resource.path)
          return providerSlugs.has(slug)
        }
        const providerChangeset: Changeset = {
          creates: changeset.creates.filter(belongsToProvider),
          updates: changeset.updates.filter(belongsToProvider),
          deletes: changeset.deletes.filter(belongsToProvider),
          drift: changeset.drift.filter(belongsToProvider),
        }

        const calls = provider.dryRunChangeset(providerChangeset, config, cache, 'default')

        if (options.json) {
          console.log(JSON.stringify({ status: 'dry_run', provider: providerName, calls }, null, 2))
        } else {
          console.log(`DRY RUN — no changes made [${providerName}]`)
          console.log()
          for (const call of calls) {
            const label = call.op.toUpperCase()
            const name = call.resource.name ?? call.resource.path
            console.log(`  ${label} ${call.resource.kind} "${name}"`)
            console.log(`    ${call.method} /${call.endpoint}`)
            if (call.params && Object.keys(call.params).length > 0) {
              for (const [key, value] of Object.entries(call.params)) {
                // Pretty-print JSON values, keep short strings inline
                let displayValue: string
                try {
                  const parsed = JSON.parse(value)
                  displayValue = JSON.stringify(parsed, null, 2).split('\n').join('\n      ')
                } catch {
                  displayValue = value
                }
                console.log(`      ${key}: ${displayValue}`)
              }
            }
            console.log()
          }
          console.log(`${calls.length} API call${calls.length !== 1 ? 's' : ''} would be made.`)
        }
      } else {
        if (!options.json) {
          console.log(`DRY RUN — no changes made [${providerName}] (detailed payload preview not available)`)
        }
      }
    }

    cache.close()
    return
  }

  // 10. Reconcile mode — convert drift to updates
  if (options.reconcile) {
    const driftCount = changeset.drift.length
    changeset = reconcileChangeset(changeset)
    if (!options.json) {
      console.log(`Reconcile mode: ${driftCount} drift change${driftCount !== 1 ? 's' : ''} will be overwritten with code values.`)
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

  // 11. Confirm
  if (!options.yes) {
    const confirmed = await confirm(`Apply ${actionableCount} change${actionableCount !== 1 ? 's' : ''}? (y/N)`)
    if (!confirmed) {
      console.log('Aborted.')
      cache.close()
      return
    }
  }

  // 12. Apply via provider modules, grouped by provider
  type ResultEntry = { path: string; op: string; success: boolean; error?: string; platformId?: string }
  const results: ResultEntry[] = []

  for (const [providerName, campaigns] of providerGroups) {
    const provider = await getProvider(providerName)

    // Build a provider-scoped changeset by filtering to paths that belong to this provider's campaigns
    const providerDesired = provider.flatten(campaigns.map(c => c.campaign))
    const providerSlugs = new Set(providerDesired.filter(r => r.kind === 'campaign').map(r => r.path))

    const belongsToProvider = (change: Change): boolean => {
      const slug = campaignFromPath(change.resource.path)
      return providerSlugs.has(slug)
    }

    const providerChangeset: Changeset = {
      creates: changeset.creates.filter(belongsToProvider),
      updates: changeset.updates.filter(belongsToProvider),
      deletes: changeset.deletes.filter(belongsToProvider),
      drift: changeset.drift.filter(belongsToProvider),
    }

    const providerActionable = providerChangeset.creates.length + providerChangeset.updates.length + providerChangeset.deletes.length
    if (providerActionable === 0) continue

    try {
      const applyResult: ApplyResult = await provider.applyChangeset(providerChangeset, config, cache, 'default')

      for (const change of applyResult.succeeded) {
        results.push({ path: change.resource.path, op: change.op, success: true, platformId: change.resource.platformId })
      }
      for (const { change, error } of applyResult.failed) {
        results.push({ path: change.resource.path, op: change.op, success: false, error: error.message })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('not implemented yet')) {
        console.error(`Error: ${providerName} apply is not implemented yet. Skipping.`)
        continue
      }
      throw err
    }
  }

  // 13. Print results
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

  // 14. Update cache with results
  for (const result of results) {
    if (result.success && result.platformId) {
      const resource = allDesired.find(r => r.path === result.path)
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
    verbose: args.includes('--verbose') || args.includes('-v'),
    provider: flags.provider,
  })
}
