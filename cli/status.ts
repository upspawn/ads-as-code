import { loadConfig } from '../src/core/discovery.ts'
import { createGoogleClient } from '../src/google/api.ts'
import { createMetaClient } from '../src/meta/api.ts'
import type { MetaClient } from '../src/meta/api.ts'
import type { GoogleConfig, GoogleAdsRow } from '../src/google/types.ts'
import type { AdsConfig, MetaProviderConfig } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'

// ─── Shared Types ──────────────────────────────────────────

type StatusOptions = {
  json?: boolean
  filter?: string
  provider?: string
}

// ─── Google Status ─────────────────────────────────────────

type GoogleCampaignRow = {
  name: string
  status: string
  dailyBudget: string
  bidding: string
  adGroups: number
  keywords: number
}

/** Enum maps for gRPC numeric values from the Google Ads API. */
const GOOGLE_STATUS_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED',
}
// Official BiddingStrategyType enum from google/ads/googleads/v23/enums/bidding_strategy_type.proto
const GOOGLE_BIDDING_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENHANCED_CPC', 3: 'MANUAL_CPC',
  4: 'MANUAL_CPM', 5: 'PAGE_ONE_PROMOTED', 6: 'TARGET_CPA',
  7: 'TARGET_OUTRANK_SHARE', 8: 'TARGET_ROAS', 9: 'TARGET_SPEND',
  10: 'MAXIMIZE_CONVERSIONS', 11: 'MAXIMIZE_CONVERSION_VALUE',
  12: 'PERCENT_CPC', 13: 'MANUAL_CPV', 14: 'TARGET_CPM',
  15: 'TARGET_IMPRESSION_SHARE', 16: 'COMMISSION', 17: 'INVALID',
  18: 'MANUAL_CPA', 19: 'FIXED_CPM', 22: 'FIXED_SHARE_OF_VOICE',
}

function resolveEnum(v: unknown, map: Record<number, string>): string {
  if (typeof v === 'number') return map[v] ?? 'UNKNOWN'
  if (typeof v === 'string') return v
  return 'UNKNOWN'
}

async function fetchGoogleStatus(config: AdsConfig, filter?: string): Promise<{ rows: GoogleCampaignRow[] }> {
  const googleConfig: GoogleConfig = config.google?.credentials
    ? { type: 'oauth', ...JSON.parse('{}') } as GoogleConfig // fall through to env
    : { type: 'env' }

  const client = await createGoogleClient(googleConfig)

  // Fetch campaigns
  const campaignRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      campaign.bidding_strategy_type,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status != "REMOVED"
    ORDER BY campaign.name
  `)

  // Fetch ad group counts (non-fatal)
  let adGroupRows: GoogleAdsRow[] = []
  try {
    adGroupRows = await client.query(`
      SELECT campaign.name, ad_group.name
      FROM ad_group
      WHERE campaign.status != "REMOVED" AND ad_group.status != "REMOVED"
    `)
  } catch { /* non-fatal */ }

  // Fetch keyword counts (non-fatal)
  let keywordRows: GoogleAdsRow[] = []
  try {
    keywordRows = await client.query(`
      SELECT campaign.name, ad_group_criterion.keyword.text
      FROM keyword_view
      WHERE campaign.status != "REMOVED" AND ad_group.status != "REMOVED"
    `)
  } catch { /* non-fatal */ }

  // Build count maps
  const adGroupCounts = buildCountMap(adGroupRows, 'campaign')
  const keywordCounts = buildCountMap(keywordRows, 'campaign')

  // Build display rows
  let rows: GoogleCampaignRow[] = campaignRows.map((row) => {
    const r = row as Record<string, Record<string, unknown>>
    const name = (r.campaign?.name as string) ?? '(unknown)'
    const status = resolveEnum(r.campaign?.status, GOOGLE_STATUS_MAP)
    const budgetObj = r.campaign_budget ?? r.campaignBudget
    const budgetMicros = budgetObj?.amount_micros ?? budgetObj?.amountMicros
    const dailyBudget = budgetMicros
      ? `$${(Number(budgetMicros) / 1_000_000).toFixed(2)}`
      : '—'
    const biddingRaw = r.campaign?.bidding_strategy_type ?? r.campaign?.biddingStrategyType
    const bidding = resolveEnum(biddingRaw, GOOGLE_BIDDING_MAP)

    return {
      name,
      status: status.toLowerCase(),
      dailyBudget,
      bidding: bidding.toLowerCase().replace(/_/g, '-'),
      adGroups: adGroupCounts.get(name) ?? 0,
      keywords: keywordCounts.get(name) ?? 0,
    }
  })

  // Apply glob filter
  if (filter) {
    const pattern = filter.toLowerCase()
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    )
    rows = rows.filter((r) => regex.test(r.name.toLowerCase()))
  }

  return { rows }
}

/** Count occurrences of a campaign name across GAQL rows. */
function buildCountMap(rows: GoogleAdsRow[], topKey: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const name = (row as Record<string, Record<string, unknown>>)[topKey]?.name as string | undefined
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return counts
}

function printGoogleTable(rows: GoogleCampaignRow[]): void {
  if (rows.length === 0) {
    console.log('  No campaigns found.')
    return
  }

  const cols = {
    name: Math.max(8, ...rows.map((r) => r.name.length)),
    status: Math.max(6, ...rows.map((r) => r.status.length)),
    budget: Math.max(6, ...rows.map((r) => r.dailyBudget.length)),
    bidding: Math.max(7, ...rows.map((r) => r.bidding.length)),
    adGroups: 9,
    keywords: 8,
  }

  const header = [
    'Campaign'.padEnd(cols.name),
    'Status'.padEnd(cols.status),
    'Budget'.padEnd(cols.budget),
    'Bidding'.padEnd(cols.bidding),
    'Ad Groups'.padEnd(cols.adGroups),
    'Keywords'.padEnd(cols.keywords),
  ].join('  ')

  console.log(`  ${header}`)
  console.log(`  ${'─'.repeat(header.length)}`)

  for (const row of rows) {
    console.log(
      '  ' + [
        row.name.padEnd(cols.name),
        row.status.padEnd(cols.status),
        row.dailyBudget.padEnd(cols.budget),
        row.bidding.padEnd(cols.bidding),
        String(row.adGroups).padEnd(cols.adGroups),
        String(row.keywords).padEnd(cols.keywords),
      ].join('  '),
    )
  }

  console.log()
  console.log(`  ${rows.length} campaign(s)`)
}

// ─── Meta Status ───────────────────────────────────────────

type MetaCampaignStatus = {
  id: string
  name: string
  status: string
  objective: string
  dailyBudget: string
  lifetimeBudget: string
  adSets: MetaAdSetStatus[]
}

type MetaAdSetStatus = {
  id: string
  name: string
  status: string
  optimization: string
  dailyBudget: string
  ads: MetaAdStatus[]
}

type MetaAdStatus = {
  id: string
  name: string
  status: string
  creativeId: string
}

type MetaGraphCampaign = Record<string, unknown> & {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly objective?: string
  readonly daily_budget?: string
  readonly lifetime_budget?: string
}

type MetaGraphAdSet = Record<string, unknown> & {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly optimization_goal?: string
  readonly daily_budget?: string
}

type MetaGraphAd = Record<string, unknown> & {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly creative?: { readonly id: string }
}

async function fetchMetaStatus(client: MetaClient, accountId: string, filter?: string): Promise<{ campaigns: MetaCampaignStatus[] }> {
  // Fetch campaigns
  const rawCampaigns = await client.graphGetAll<MetaGraphCampaign>(
    `${accountId}/campaigns`,
    { fields: 'id,name,status,objective,daily_budget,lifetime_budget' },
  )

  // Fetch ad sets with campaign ID
  const rawAdSets = await client.graphGetAll<MetaGraphAdSet & { campaign_id: string }>(
    `${accountId}/adsets`,
    { fields: 'id,name,status,optimization_goal,daily_budget,campaign_id' },
  )

  // Fetch ads with adset ID
  const rawAds = await client.graphGetAll<MetaGraphAd & { adset_id: string }>(
    `${accountId}/ads`,
    { fields: 'id,name,status,creative{id},adset_id' },
  )

  // Group ads by ad set
  const adsByAdSet = new Map<string, MetaAdStatus[]>()
  for (const ad of rawAds) {
    const adSetId = ad.adset_id
    const list = adsByAdSet.get(adSetId) ?? []
    list.push({
      id: ad.id,
      name: ad.name ?? '(unnamed)',
      status: (ad.status ?? 'UNKNOWN').toLowerCase(),
      creativeId: ad.creative?.id ?? '—',
    })
    adsByAdSet.set(adSetId, list)
  }

  // Group ad sets by campaign
  const adSetsByCampaign = new Map<string, MetaAdSetStatus[]>()
  for (const adSet of rawAdSets) {
    const campaignId = adSet.campaign_id
    const list = adSetsByCampaign.get(campaignId) ?? []
    list.push({
      id: adSet.id,
      name: adSet.name ?? '(unnamed)',
      status: (adSet.status ?? 'UNKNOWN').toLowerCase(),
      optimization: (adSet.optimization_goal ?? '—').toLowerCase().replace(/_/g, '-'),
      dailyBudget: adSet.daily_budget ? `$${(Number(adSet.daily_budget) / 100).toFixed(2)}` : '—',
      ads: adsByAdSet.get(adSet.id) ?? [],
    })
    adSetsByCampaign.set(campaignId, list)
  }

  // Build campaign list
  let campaigns: MetaCampaignStatus[] = rawCampaigns.map((c) => ({
    id: c.id,
    name: c.name ?? '(unnamed)',
    status: (c.status ?? 'UNKNOWN').toLowerCase(),
    objective: (c.objective ?? '—').toLowerCase().replace(/_/g, '-'),
    dailyBudget: c.daily_budget ? `$${(Number(c.daily_budget) / 100).toFixed(2)}` : '—',
    lifetimeBudget: c.lifetime_budget ? `$${(Number(c.lifetime_budget) / 100).toFixed(2)}` : '—',
    adSets: adSetsByCampaign.get(c.id) ?? [],
  }))

  // Apply glob filter
  if (filter) {
    const pattern = filter.toLowerCase()
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    )
    campaigns = campaigns.filter((c) => regex.test(c.name.toLowerCase()))
  }

  return { campaigns }
}

function printMetaTree(campaigns: MetaCampaignStatus[]): void {
  if (campaigns.length === 0) {
    console.log('  No campaigns found.')
    return
  }

  for (const campaign of campaigns) {
    const budgetStr = campaign.dailyBudget !== '—'
      ? campaign.dailyBudget + '/day'
      : campaign.lifetimeBudget !== '—'
        ? campaign.lifetimeBudget + ' lifetime'
        : 'no budget'

    console.log(`  ${campaign.name}  [${campaign.status}]  ${campaign.objective}  ${budgetStr}`)

    if (campaign.adSets.length === 0) {
      console.log('    (no ad sets)')
      continue
    }

    for (let i = 0; i < campaign.adSets.length; i++) {
      const adSet = campaign.adSets[i]!
      const isLastAdSet = i === campaign.adSets.length - 1
      const adSetPrefix = isLastAdSet ? '└─' : '├─'

      const adSetBudget = adSet.dailyBudget !== '—' ? `  ${adSet.dailyBudget}/day` : ''
      console.log(`    ${adSetPrefix} ${adSet.name}  [${adSet.status}]  ${adSet.optimization}${adSetBudget}`)

      for (let j = 0; j < adSet.ads.length; j++) {
        const ad = adSet.ads[j]!
        const isLastAd = j === adSet.ads.length - 1
        const branchPrefix = isLastAdSet ? '   ' : '│  '
        const adPrefix = isLastAd ? '└─' : '├─'

        console.log(`    ${branchPrefix} ${adPrefix} ${ad.name}  [${ad.status}]`)
      }
    }
    console.log()
  }

  const totalAdSets = campaigns.reduce((sum, c) => sum + c.adSets.length, 0)
  const totalAds = campaigns.reduce((sum, c) => sum + c.adSets.reduce((s, a) => s + a.ads.length, 0), 0)
  console.log(`  ${campaigns.length} campaign(s), ${totalAdSets} ad set(s), ${totalAds} ad(s)`)
}

// ─── Main Entry Point ──────────────────────────────────────

/**
 * Fetch live status from all configured providers and display it.
 *
 * Multi-provider: shows status for each configured provider in order.
 * Use `--provider google` or `--provider meta` to filter to one.
 */
export async function runStatus(rootDir: string, options: StatusOptions): Promise<void> {
  const config = await loadConfig(rootDir)
  if (!config) {
    console.error('No ads.config.ts found. Run "ads init" first.')
    process.exit(1)
  }

  // Determine which providers to query
  const configuredProviders: string[] = []
  if (config.google) configuredProviders.push('google')
  if (config.meta) configuredProviders.push('meta')

  if (configuredProviders.length === 0) {
    console.error('No providers configured in ads.config.ts')
    console.error('Add google: { ... } or meta: { ... } to your config.')
    process.exit(1)
  }

  // Filter by --provider flag if set
  const providerFilter = options.provider
  const providers = providerFilter
    ? configuredProviders.filter((p) => p === providerFilter)
    : configuredProviders

  if (providers.length === 0 && providerFilter) {
    console.error(`Provider "${providerFilter}" is not configured in ads.config.ts`)
    console.error(`Configured providers: ${configuredProviders.join(', ')}`)
    process.exit(1)
  }

  // Collect results for JSON output
  const jsonResult: Record<string, unknown> = {}
  const showHeaders = providers.length > 1

  for (const provider of providers) {
    try {
      if (provider === 'google') {
        if (showHeaders && !options.json) {
          console.log('Google Ads')
          console.log('─'.repeat(40))
        }

        const { rows } = await fetchGoogleStatus(config, options.filter)

        if (options.json) {
          jsonResult.google = rows
        } else {
          printGoogleTable(rows)
        }
      } else if (provider === 'meta') {
        if (showHeaders && !options.json) {
          console.log()
          console.log('Meta Ads')
          console.log('─'.repeat(40))
        }

        const metaConfig = config.meta!
        const client = createMetaClient(metaConfig)
        const { campaigns } = await fetchMetaStatus(client, metaConfig.accountId, options.filter)

        if (options.json) {
          jsonResult.meta = campaigns
        } else {
          printMetaTree(campaigns)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (options.json) {
        jsonResult[provider] = { error: message }
      } else {
        console.error(`\n${provider}: Failed to fetch status`)
        console.error(`  ${message}`)
      }
    }
  }

  if (options.json) {
    // If single provider, unwrap for backward compatibility
    const output = providers.length === 1 && !providerFilter
      ? jsonResult[providers[0]!]
      : jsonResult
    console.log(JSON.stringify(output, null, 2))
  }
}
