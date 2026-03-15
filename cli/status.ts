import { discoverCampaigns, loadConfig } from '../src/core/discovery.ts'
import { createGoogleClient } from '../src/google/api.ts'
import type { GoogleConfig, GoogleAdsRow } from '../src/google/types.ts'
import type { GlobalFlags } from './init.ts'

type CampaignRow = {
  name: string
  status: string
  dailyBudget: string
  bidding: string
  adGroups: number
  keywords: number
}

/**
 * Fetch campaigns from the Google Ads API and display a status table.
 */
export async function runStatus(rootDir: string, options: { json?: boolean; filter?: string }): Promise<void> {
  // Load config
  const config = await loadConfig(rootDir)
  if (!config?.google) {
    console.error('No Google provider configured in ads.config.ts')
    console.error('Run `ads init` and configure your Google Ads credentials.')
    process.exit(1)
  }

  // Create client
  const googleConfig: GoogleConfig = config.google.credentials
    ? { type: 'oauth', ...JSON.parse('{}') } as GoogleConfig // fall through to env
    : { type: 'env' }

  let client: Awaited<ReturnType<typeof createGoogleClient>>
  try {
    client = await createGoogleClient(googleConfig)
  } catch (err) {
    console.error('Failed to connect to Google Ads API:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Fetch campaigns with ad group and keyword counts
  const gaql = `
    SELECT
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      campaign.bidding_strategy_type,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status != "REMOVED"
    ORDER BY campaign.name
  `

  let campaignRows: GoogleAdsRow[]
  try {
    campaignRows = await client.query(gaql)
  } catch (err) {
    console.error('Failed to fetch campaigns:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Fetch ad group counts per campaign
  const adGroupGaql = `
    SELECT
      campaign.name,
      ad_group.name
    FROM ad_group
    WHERE campaign.status != "REMOVED"
      AND ad_group.status != "REMOVED"
  `

  let adGroupRows: GoogleAdsRow[] = []
  try {
    adGroupRows = await client.query(adGroupGaql)
  } catch {
    // Non-fatal — we just won't have ad group counts
  }

  // Fetch keyword counts per campaign
  const keywordGaql = `
    SELECT
      campaign.name,
      ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE campaign.status != "REMOVED"
      AND ad_group.status != "REMOVED"
  `

  let keywordRows: GoogleAdsRow[] = []
  try {
    keywordRows = await client.query(keywordGaql)
  } catch {
    // Non-fatal
  }

  // Enum maps for gRPC numeric values
  const STATUS_MAP: Record<number, string> = {
    0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED',
  }
  const BIDDING_MAP: Record<number, string> = {
    0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENHANCED_CPC', 3: 'MANUAL_CPC',
    6: 'TARGET_CPA', 8: 'TARGET_ROAS', 9: 'TARGET_SPEND',
    10: 'MAXIMIZE_CONVERSIONS', 11: 'MAXIMIZE_CONVERSION_VALUE',
    15: 'TARGET_IMPRESSION_SHARE',
  }
  function resolveEnum(v: unknown, map: Record<number, string>): string {
    if (typeof v === 'number') return map[v] ?? 'UNKNOWN'
    if (typeof v === 'string') return v
    return 'UNKNOWN'
  }

  // Build ad group count map
  const adGroupCounts = new Map<string, number>()
  for (const row of adGroupRows) {
    const name = (row as Record<string, Record<string, unknown>>).campaign?.name as string | undefined
    if (name) {
      adGroupCounts.set(name, (adGroupCounts.get(name) ?? 0) + 1)
    }
  }

  // Build keyword count map
  const keywordCounts = new Map<string, number>()
  for (const row of keywordRows) {
    const name = (row as Record<string, Record<string, unknown>>).campaign?.name as string | undefined
    if (name) {
      keywordCounts.set(name, (keywordCounts.get(name) ?? 0) + 1)
    }
  }

  // Build display rows
  let rows: CampaignRow[] = campaignRows.map((row) => {
    const r = row as Record<string, Record<string, unknown>>
    const name = (r.campaign?.name as string) ?? '(unknown)'
    // gRPC returns numeric enums; resolve to string
    const status = resolveEnum(r.campaign?.status, STATUS_MAP)
    // gRPC returns snake_case: campaign_budget; REST returns camelCase: campaignBudget
    const budgetObj = r.campaign_budget ?? r.campaignBudget
    const budgetMicros = budgetObj?.amount_micros ?? budgetObj?.amountMicros
    const dailyBudget = budgetMicros
      ? `$${(Number(budgetMicros) / 1_000_000).toFixed(2)}`
      : '—'
    // gRPC returns snake_case: bidding_strategy_type; REST: biddingStrategyType
    const biddingRaw = r.campaign?.bidding_strategy_type ?? r.campaign?.biddingStrategyType
    const bidding = resolveEnum(biddingRaw, BIDDING_MAP)

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
  if (options.filter) {
    const pattern = options.filter.toLowerCase()
    rows = rows.filter((r) => {
      // Simple glob: * matches any chars
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      )
      return regex.test(r.name.toLowerCase())
    })
  }

  if (options.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  // Print table
  if (rows.length === 0) {
    console.log('No campaigns found.')
    return
  }

  // Column widths
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

  const separator = '─'.repeat(header.length)

  console.log(header)
  console.log(separator)

  for (const row of rows) {
    console.log(
      [
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
  console.log(`${rows.length} campaign(s)`)
}
