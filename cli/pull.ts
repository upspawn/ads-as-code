import { discoverCampaigns, loadConfig } from '../src/core/discovery.ts'
import { createGoogleClient } from '../src/google/api.ts'
import { flatten } from '../src/core/flatten.ts'
import { diff } from '../src/core/diff.ts'
import { Cache } from '../src/core/cache.ts'
import type { GoogleConfig, GoogleSearchCampaign } from '../src/google/types.ts'
import type { Change, Resource } from '../src/core/types.ts'
import { join } from 'node:path'

// ─── Helpers ──────────────────────────────────────────────

function formatChange(change: Change): string {
  if (change.op === 'drift') {
    const lines = [`  ${change.resource.kind} ${change.resource.path}`]
    for (const c of change.changes) {
      lines.push(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
    }
    return lines.join('\n')
  }
  if (change.op === 'create') {
    return `  + ${change.resource.kind} ${change.resource.path}`
  }
  if (change.op === 'delete') {
    return `  - ${change.resource.kind} ${change.resource.path}`
  }
  if (change.op === 'update') {
    const lines = [`  ~ ${change.resource.kind} ${change.resource.path}`]
    for (const c of change.changes) {
      lines.push(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
    }
    return lines.join('\n')
  }
  return `  ? ${(change as Change).op} ${(change as Change).resource.path}`
}

/**
 * Pull live platform state and detect drift from local campaign files.
 * If drift is found, offer to regenerate campaign code from live state.
 *
 * NOTE: Full codegen integration depends on src/core/codegen.ts being available.
 * Until codegen is implemented, pull shows drift but cannot regenerate files.
 */
export async function runPull(rootDir: string): Promise<void> {
  // Load config
  const config = await loadConfig(rootDir)
  if (!config?.google) {
    console.error('No Google provider configured in ads.config.ts')
    process.exit(1)
  }

  // Create client
  const googleConfig: GoogleConfig = { type: 'env' }

  let client: Awaited<ReturnType<typeof createGoogleClient>>
  try {
    client = await createGoogleClient(googleConfig)
  } catch (err) {
    console.error('Failed to connect to Google Ads API:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Discover local campaigns
  const discovery = await discoverCampaigns(rootDir)
  if (discovery.errors.length > 0) {
    console.error('Campaign loading errors:')
    for (const e of discovery.errors) {
      console.error(`  ${e.file}: ${e.message}`)
    }
  }

  const localCampaigns = discovery.campaigns
    .filter((c) => c.provider === 'google')
    .map((c) => c.campaign as GoogleSearchCampaign)

  if (localCampaigns.length === 0) {
    console.log('No Google campaigns found locally.')
    return
  }

  // Flatten local state into resources
  const desiredResources = localCampaigns.flatMap(flatten)

  // Fetch live campaigns from API
  console.log('Fetching live state from Google Ads...')

  const gaql = `
    SELECT
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      campaign.bidding_strategy_type
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `

  let liveRows: Record<string, unknown>[]
  try {
    liveRows = await client.query(gaql) as Record<string, unknown>[]
  } catch (err) {
    console.error('Failed to fetch live state:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Build actual resources from live state (simplified — full fetch.ts will do this properly)
  const actualResources: Resource[] = liveRows.map((row) => {
    const r = row as Record<string, Record<string, unknown>>
    const name = (r.campaign?.name as string) ?? '(unknown)'
    const status = ((r.campaign?.status as string) ?? 'UNKNOWN').toLowerCase()
    const budgetMicros = r.campaignBudget?.amountMicros ?? r.campaign_budget?.amount_micros
    const bidding = ((r.campaign?.biddingStrategyType as string) ?? '').toLowerCase().replace(/_/g, '-')

    return {
      kind: 'campaign' as const,
      path: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      properties: {
        name,
        status,
        budgetMicros: budgetMicros ? Number(budgetMicros) : undefined,
        bidding,
      },
    }
  })

  // Open cache for managed paths
  const cachePath = join(rootDir, '.ads', 'cache.db')
  let managedPaths: Set<string> | undefined
  try {
    const cache = new Cache(cachePath)
    const paths = cache.getManagedPaths('default', 'ads-cli')
    if (paths.length > 0) {
      managedPaths = new Set(paths)
    }
    cache.close()
  } catch {
    // Cache unavailable — skip managed paths
  }

  // Compute diff (drift = platform changed things we defined in code)
  const changeset = diff(desiredResources, actualResources, managedPaths)

  const driftCount = changeset.drift.length
  const totalChanges = changeset.creates.length + changeset.updates.length + changeset.deletes.length + driftCount

  if (totalChanges === 0) {
    console.log('No drift detected. Local state matches platform.')
    return
  }

  // Show drift
  console.log()
  console.log(`Drift detected: ${totalChanges} change(s)`)
  console.log()

  if (changeset.drift.length > 0) {
    console.log('Platform drift (platform changed values you defined):')
    for (const change of changeset.drift) {
      console.log(formatChange(change))
    }
    console.log()
  }

  if (changeset.creates.length > 0) {
    console.log('Resources on platform not in code:')
    for (const change of changeset.creates) {
      console.log(formatChange(change))
    }
    console.log()
  }

  if (changeset.deletes.length > 0) {
    console.log('Resources in code not on platform:')
    for (const change of changeset.deletes) {
      console.log(formatChange(change))
    }
    console.log()
  }

  if (changeset.updates.length > 0) {
    console.log('Updates needed:')
    for (const change of changeset.updates) {
      console.log(formatChange(change))
    }
    console.log()
  }

  // Prompt to apply changes to code
  process.stdout.write('Apply changes to code? (y/N) ')

  const response = await new Promise<string>((resolve) => {
    // Read one line from stdin
    const chunks: Buffer[] = []
    process.stdin.setEncoding('utf-8')
    process.stdin.once('data', (chunk) => {
      resolve(String(chunk).trim().toLowerCase())
    })
    // Handle non-interactive case
    if (!process.stdin.isTTY) {
      resolve('n')
    }
  })

  if (response !== 'y' && response !== 'yes') {
    console.log('Aborted. No changes written.')
    return
  }

  // Attempt codegen import — this module is being built concurrently
  try {
    const codegen = await import('../src/core/codegen.ts') as Record<string, unknown>
    const generateFn = codegen['generateCampaignFile']
    if (typeof generateFn === 'function') {
      // For each campaign with drift, regenerate the file
      for (const discovered of discovery.campaigns.filter((c) => c.provider === 'google')) {
        const relFile = discovered.file.replace(rootDir + '/', '')
        console.log(`  Regenerating ${relFile}...`)
        const code = (generateFn as (campaign: unknown, resources: Resource[]) => string)(
          discovered.campaign,
          actualResources,
        )
        await Bun.write(discovered.file, code)
        console.log(`  Written: ${relFile}`)
      }
      console.log()
      console.log('Done. Review the changes with `git diff`.')
    } else {
      console.log('Codegen module found but generateCampaignFile() not available yet.')
      console.log('Run `ads pull` again once codegen is implemented.')
    }
  } catch {
    console.log('Codegen module (src/core/codegen.ts) not available yet.')
    console.log('Drift has been detected but automatic code regeneration requires codegen.')
    console.log('Run `ads pull` again once codegen is implemented.')
  }
}
