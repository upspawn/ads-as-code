/**
 * Reddit Ads reporting API — performance data fetcher.
 *
 * Queries the Reddit Ads reporting endpoint, normalizes results into the
 * provider-agnostic PerformanceData format.
 *
 * Reddit quirks handled here:
 * - Monetary values are in micros (1 USD = 1,000,000 micros)
 * - Reddit has engagement-specific metrics (upvotes, downvotes)
 * - Video metrics (views, completions) are first-class
 * - Breakdowns: date, country, community (subreddit), placement, device_os
 */

import type { RedditClient } from './api.ts'
import type { RedditProviderConfig } from './types.ts'
import type { PerformanceData, PerformanceMetrics, PerformancePeriod } from '../performance/types.ts'
import { computeMetrics } from '../performance/types.ts'
import { slugify } from '../core/flatten.ts'

// ---------------------------------------------------------------------------
// Types — Reddit reporting API response shape
// ---------------------------------------------------------------------------

export type RedditReportRow = {
  readonly campaign_id: string
  readonly campaign_name: string
  readonly ad_group_id?: string
  readonly ad_group_name?: string
  readonly ad_id?: string
  readonly ad_name?: string
  readonly impressions: number
  readonly clicks: number
  readonly spend_micros: number
  readonly conversions: number
  readonly conversion_value_micros: number
  readonly video_views: number
  readonly video_completions: number
  readonly upvotes: number
  readonly downvotes: number
  readonly date: string
  // Breakdown fields (present when requested)
  readonly country?: string
  readonly community?: string
  readonly placement?: string
  readonly device_os?: string
}

type ReportResponse = {
  readonly data: readonly RedditReportRow[]
}

// ---------------------------------------------------------------------------
// Micros conversion — Reddit uses 1,000,000 micros = 1 currency unit
// ---------------------------------------------------------------------------

const MICROS_DIVISOR = 1_000_000

function fromMicros(micros: number): number {
  return micros / MICROS_DIVISOR
}

// ---------------------------------------------------------------------------
// Metric normalization
// ---------------------------------------------------------------------------

/** Normalize a Reddit report row into PerformanceMetrics. */
export function normalizeRedditMetrics(row: RedditReportRow): PerformanceMetrics {
  return computeMetrics({
    impressions: row.impressions,
    clicks: row.clicks,
    cost: fromMicros(row.spend_micros),
    conversions: row.conversions,
    conversionValue: fromMicros(row.conversion_value_micros),
  })
}

// ---------------------------------------------------------------------------
// Resource path builders
// ---------------------------------------------------------------------------

function campaignPath(row: RedditReportRow): string {
  return slugify(row.campaign_name)
}

function adGroupPath(row: RedditReportRow): string {
  return `${slugify(row.campaign_name)}/${slugify(row.ad_group_name!)}`
}

function adPath(row: RedditReportRow): string {
  return `${slugify(row.campaign_name)}/${slugify(row.ad_group_name!)}/${slugify(row.ad_name!)}`
}

// ---------------------------------------------------------------------------
// Aggregation — group rows by resource path, sum daily data
// ---------------------------------------------------------------------------

type AggregatedResource = {
  readonly resource: string
  readonly kind: 'campaign' | 'adGroup' | 'ad'
  readonly metrics: PerformanceMetrics
  readonly dailyBreakdown: readonly { readonly date: string; readonly metrics: PerformanceMetrics }[]
}

function aggregateRows(
  rows: readonly RedditReportRow[],
  kind: 'campaign' | 'adGroup' | 'ad',
  pathFn: (row: RedditReportRow) => string,
): AggregatedResource[] {
  const groups = new Map<string, RedditReportRow[]>()

  for (const row of rows) {
    const path = pathFn(row)
    const existing = groups.get(path)
    if (existing) {
      existing.push(row)
    } else {
      groups.set(path, [row])
    }
  }

  const results: AggregatedResource[] = []

  for (const [resource, groupRows] of groups) {
    const dailyBreakdown = groupRows.map((row) => ({
      date: row.date,
      metrics: normalizeRedditMetrics(row),
    }))

    if (groupRows.length === 1) {
      results.push({
        resource,
        kind,
        metrics: normalizeRedditMetrics(groupRows[0]!),
        dailyBreakdown,
      })
      continue
    }

    // Sum raw metrics across daily rows
    let totalImpressions = 0
    let totalClicks = 0
    let totalSpendMicros = 0
    let totalConversions = 0
    let totalConversionValueMicros = 0

    for (const row of groupRows) {
      totalImpressions += row.impressions
      totalClicks += row.clicks
      totalSpendMicros += row.spend_micros
      totalConversions += row.conversions
      totalConversionValueMicros += row.conversion_value_micros
    }

    const aggregateMetrics = computeMetrics({
      impressions: totalImpressions,
      clicks: totalClicks,
      cost: fromMicros(totalSpendMicros),
      conversions: totalConversions,
      conversionValue: fromMicros(totalConversionValueMicros),
    })

    results.push({ resource, kind, metrics: aggregateMetrics, dailyBreakdown })
  }

  return results
}

// ---------------------------------------------------------------------------
// API query
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function queryReport(
  client: RedditClient,
  accountId: string,
  period: PerformancePeriod,
): Promise<readonly RedditReportRow[]> {
  const response = await client.get<ReportResponse>(
    `/accounts/${accountId}/reports`,
    {
      start_date: formatDate(period.start),
      end_date: formatDate(period.end),
      group_by: 'date,campaign,ad_group,ad',
    },
  )
  return response.data
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch performance data from Reddit Ads reporting API.
 *
 * Queries with daily granularity, then aggregates daily rows into
 * PerformanceData with byDay breakdowns. Produces campaign, ad group,
 * and ad level entries.
 */
export async function fetchRedditPerformance(
  config: RedditProviderConfig,
  client: RedditClient,
  period: PerformancePeriod,
): Promise<PerformanceData[]> {
  const accountId = config.accountId
  const rows = await queryReport(client, accountId, period)

  if (rows.length === 0) return []

  // Separate rows by level — a row has ad_group_id/ad_id depending on granularity
  // Since we request all levels at once, every row has campaign info,
  // but we aggregate at each level separately.

  // Campaign level: aggregate all rows by campaign
  const campaignData = aggregateRows(rows, 'campaign', campaignPath)

  // Ad group level: only rows with ad_group_id
  const adGroupRows = rows.filter((r) => r.ad_group_id && r.ad_group_name)
  const adGroupData = aggregateRows(adGroupRows, 'adGroup', adGroupPath)

  // Ad level: only rows with ad_id
  const adRows = rows.filter((r) => r.ad_id && r.ad_name)
  const adData = aggregateRows(adRows, 'ad', adPath)

  // Convert to PerformanceData
  const results: PerformanceData[] = []

  for (const entry of campaignData) {
    results.push({
      resource: entry.resource,
      provider: 'reddit' as const,
      kind: entry.kind,
      period: { start: period.start, end: period.end },
      metrics: entry.metrics,
      violations: [],
      breakdowns: {
        byDay: entry.dailyBreakdown.length > 0 ? entry.dailyBreakdown : undefined,
      },
    })
  }

  for (const entry of [...adGroupData, ...adData]) {
    results.push({
      resource: entry.resource,
      provider: 'reddit' as const,
      kind: entry.kind,
      period: { start: period.start, end: period.end },
      metrics: entry.metrics,
      violations: [],
      breakdowns: {
        byDay: entry.dailyBreakdown.length > 0 ? entry.dailyBreakdown : undefined,
      },
    })
  }

  return results
}
