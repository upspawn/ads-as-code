/**
 * Meta Ads Insights API — performance data fetcher.
 *
 * Queries the Graph API Insights endpoint at campaign, ad set, and ad levels,
 * then normalizes the results into the provider-agnostic PerformanceData format.
 *
 * Meta quirks handled here:
 * - All numeric values come as strings from the API
 * - Conversions are buried in an `actions` array under `offsite_conversion`
 * - Conversion values are in a separate `action_values` array
 * - Daily breakdown via `time_increment=1` produces one row per day per resource
 */

import type { MetaClient } from './api.ts'
import type { PerformanceData, PerformanceMetrics } from '../performance/types.ts'
import { computeMetrics } from '../performance/types.ts'
import { slugify } from '../core/flatten.ts'

// ---------------------------------------------------------------------------
// Types — Meta Insights API response shape
// ---------------------------------------------------------------------------

type MetaAction = {
  readonly action_type: string
  readonly value: string
}

type MetaInsightsRow = {
  readonly campaign_id: string
  readonly campaign_name: string
  readonly adset_id?: string
  readonly adset_name?: string
  readonly ad_id?: string
  readonly ad_name?: string
  readonly impressions: string
  readonly clicks: string
  readonly spend: string
  readonly actions?: readonly MetaAction[]
  readonly action_values?: readonly MetaAction[]
  readonly cpm: string
  readonly frequency: string
  readonly reach: string
  readonly date_start: string
  readonly date_stop: string
  // Breakdown fields (present when queried with breakdowns param)
  readonly age?: string
  readonly gender?: string
  readonly publisher_platform?: string
  readonly platform_position?: string
}

type InsightsResponse = {
  readonly data: readonly MetaInsightsRow[]
}

type InsightsLevel = 'campaign' | 'adset' | 'ad'

// ---------------------------------------------------------------------------
// Conversion extraction — Meta stores conversions in a typed actions array
// ---------------------------------------------------------------------------

const CONVERSION_ACTION_TYPE = 'offsite_conversion'

/** Extract conversion count from Meta's actions array. Returns 0 if absent. */
export function extractConversions(actions?: readonly MetaAction[]): number {
  if (!actions) return 0
  const entry = actions.find(a => a.action_type === CONVERSION_ACTION_TYPE)
  return entry ? Number(entry.value) : 0
}

/** Extract conversion value from Meta's action_values array. Returns 0 if absent. */
export function extractConversionValue(actionValues?: readonly MetaAction[]): number {
  if (!actionValues) return 0
  const entry = actionValues.find(a => a.action_type === CONVERSION_ACTION_TYPE)
  return entry ? Number(entry.value) : 0
}

// ---------------------------------------------------------------------------
// Metric normalization — string fields → PerformanceMetrics
// ---------------------------------------------------------------------------

/** Normalize a single Meta Insights row into PerformanceMetrics with Meta-specific fields. */
export function normalizeMetaMetrics(row: MetaInsightsRow): PerformanceMetrics {
  const base = computeMetrics({
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    cost: Number(row.spend),
    conversions: extractConversions(row.actions),
    conversionValue: extractConversionValue(row.action_values),
  })

  return {
    ...base,
    frequency: Number(row.frequency),
    reach: Number(row.reach),
  }
}

// ---------------------------------------------------------------------------
// Resource path builders — slugified hierarchical paths
// ---------------------------------------------------------------------------

function campaignPath(row: MetaInsightsRow): string {
  return slugify(row.campaign_name)
}

function adSetPath(row: MetaInsightsRow): string {
  return `${slugify(row.campaign_name)}/${slugify(row.adset_name!)}`
}

function adPath(row: MetaInsightsRow): string {
  return `${slugify(row.campaign_name)}/${slugify(row.adset_name!)}/${slugify(row.ad_name!)}`
}

// ---------------------------------------------------------------------------
// Daily aggregation — merge time_increment=1 rows into a single resource
// ---------------------------------------------------------------------------

type AggregatedResource = {
  readonly resource: string
  readonly kind: 'campaign' | 'adSet' | 'ad'
  readonly metrics: PerformanceMetrics
  readonly dailyBreakdown: readonly { readonly date: string; readonly metrics: PerformanceMetrics }[]
}

/**
 * Group rows by resource path and aggregate daily data.
 * When multiple rows share the same resource path (from time_increment=1),
 * they become daily breakdown entries with summed aggregate metrics.
 */
function aggregateRows(
  rows: readonly MetaInsightsRow[],
  kind: 'campaign' | 'adSet' | 'ad',
  pathFn: (row: MetaInsightsRow) => string,
): AggregatedResource[] {
  // Group rows by resource path
  const groups = new Map<string, MetaInsightsRow[]>()
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
    // Build daily breakdown from each row
    const dailyBreakdown = groupRows.map(row => ({
      date: row.date_start,
      metrics: normalizeMetaMetrics(row),
    }))

    // Single row — no aggregation needed
    if (groupRows.length === 1) {
      results.push({
        resource,
        kind,
        metrics: normalizeMetaMetrics(groupRows[0]!),
        // A single row is only a daily breakdown entry when it represents exactly one day
        dailyBreakdown: groupRows[0]!.date_start === groupRows[0]!.date_stop
          ? dailyBreakdown
          : [],
      })
      continue
    }

    // Multiple rows — sum raw metrics and recompute derived
    let totalImpressions = 0
    let totalClicks = 0
    let totalCost = 0
    let totalConversions = 0
    let totalConversionValue = 0
    // Note: Summing daily reach overcounts because the same user can be reached
    // on multiple days. Meta provides deduplicated reach for the full period,
    // but with time_increment=1, each row's reach is per-day only. The aggregated
    // reach and derived frequency will be approximate.
    let totalReach = 0

    for (const row of groupRows) {
      totalImpressions += Number(row.impressions)
      totalClicks += Number(row.clicks)
      totalCost += Number(row.spend)
      totalConversions += extractConversions(row.actions)
      totalConversionValue += extractConversionValue(row.action_values)
      totalReach += Number(row.reach)
    }

    const aggregateMetrics: PerformanceMetrics = {
      ...computeMetrics({
        impressions: totalImpressions,
        clicks: totalClicks,
        cost: totalCost,
        conversions: totalConversions,
        conversionValue: totalConversionValue,
      }),
      // Frequency and reach are aggregated across daily rows
      frequency: totalReach > 0 ? totalImpressions / totalReach : undefined,
      reach: totalReach,
    }

    results.push({ resource, kind, metrics: aggregateMetrics, dailyBreakdown })
  }

  return results
}

// ---------------------------------------------------------------------------
// API query — fetch insights at a given level
// ---------------------------------------------------------------------------

const CAMPAIGN_FIELDS = 'campaign_id,campaign_name,impressions,clicks,spend,actions,action_values,cpm,frequency,reach'
const ADSET_FIELDS = `${CAMPAIGN_FIELDS},adset_id,adset_name`
const AD_FIELDS = `${ADSET_FIELDS},ad_id,ad_name`

function fieldsForLevel(level: InsightsLevel): string {
  switch (level) {
    case 'campaign': return CAMPAIGN_FIELDS
    case 'adset': return ADSET_FIELDS
    case 'ad': return AD_FIELDS
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function queryInsights(
  client: MetaClient,
  accountId: string,
  level: InsightsLevel,
  period: { readonly start: Date; readonly end: Date },
): Promise<readonly MetaInsightsRow[]> {
  const response = await client.graphGet<InsightsResponse>(`act_${accountId}/insights`, {
    fields: fieldsForLevel(level),
    time_range: JSON.stringify({ since: formatDate(period.start), until: formatDate(period.end) }),
    level,
    time_increment: '1',
  })
  return response.data
}

// ---------------------------------------------------------------------------
// Breakdown queries — separate API calls (Meta doesn't allow combining)
// ---------------------------------------------------------------------------

async function queryAgeGenderBreakdown(
  client: MetaClient,
  accountId: string,
  period: { readonly start: Date; readonly end: Date },
): Promise<readonly MetaInsightsRow[]> {
  const response = await client.graphGet<InsightsResponse>(`act_${accountId}/insights`, {
    fields: CAMPAIGN_FIELDS,
    time_range: JSON.stringify({ since: formatDate(period.start), until: formatDate(period.end) }),
    level: 'campaign',
    breakdowns: 'age,gender',
  })
  return response.data
}

async function queryPlacementBreakdown(
  client: MetaClient,
  accountId: string,
  period: { readonly start: Date; readonly end: Date },
): Promise<readonly MetaInsightsRow[]> {
  const response = await client.graphGet<InsightsResponse>(`act_${accountId}/insights`, {
    fields: CAMPAIGN_FIELDS,
    time_range: JSON.stringify({ since: formatDate(period.start), until: formatDate(period.end) }),
    level: 'campaign',
    breakdowns: 'publisher_platform,platform_position',
  })
  return response.data
}

// ---------------------------------------------------------------------------
// Breakdown normalization — age/gender/placement into campaign-keyed maps
// ---------------------------------------------------------------------------

type BreakdownAccumulator = {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
}

function emptyBreakdownAcc(): BreakdownAccumulator {
  return { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
}

function addBreakdownRow(acc: BreakdownAccumulator, row: MetaInsightsRow): void {
  acc.impressions += Number(row.impressions)
  acc.clicks += Number(row.clicks)
  acc.cost += Number(row.spend)
  acc.conversions += extractConversions(row.actions)
  acc.conversionValue += extractConversionValue(row.action_values)
}

function breakdownAccToMetrics(acc: BreakdownAccumulator): PerformanceMetrics {
  return computeMetrics({
    impressions: acc.impressions,
    clicks: acc.clicks,
    cost: acc.cost,
    conversions: acc.conversions,
    conversionValue: acc.conversionValue,
  })
}

/**
 * Process age/gender breakdown rows into per-campaign maps.
 * Since Meta returns combined age+gender rows, we accumulate across genders
 * for byAge and across ages for byGender.
 */
function processAgeGenderBreakdown(rows: readonly MetaInsightsRow[]): {
  ageByCampaign: Map<string, Record<string, PerformanceMetrics>>
  genderByCampaign: Map<string, Record<string, PerformanceMetrics>>
} {
  // Accumulate raw values, then compute derived metrics at the end
  const ageAccByCampaign = new Map<string, Map<string, BreakdownAccumulator>>()
  const genderAccByCampaign = new Map<string, Map<string, BreakdownAccumulator>>()

  for (const row of rows) {
    const slug = slugify(row.campaign_name)

    if (row.age) {
      let ageMap = ageAccByCampaign.get(slug)
      if (!ageMap) {
        ageMap = new Map()
        ageAccByCampaign.set(slug, ageMap)
      }
      let acc = ageMap.get(row.age)
      if (!acc) {
        acc = emptyBreakdownAcc()
        ageMap.set(row.age, acc)
      }
      addBreakdownRow(acc, row)
    }

    if (row.gender) {
      let genderMap = genderAccByCampaign.get(slug)
      if (!genderMap) {
        genderMap = new Map()
        genderAccByCampaign.set(slug, genderMap)
      }
      let acc = genderMap.get(row.gender)
      if (!acc) {
        acc = emptyBreakdownAcc()
        genderMap.set(row.gender, acc)
      }
      addBreakdownRow(acc, row)
    }
  }

  // Convert accumulators to metrics
  const ageByCampaign = new Map<string, Record<string, PerformanceMetrics>>()
  for (const [slug, ageMap] of ageAccByCampaign) {
    const record: Record<string, PerformanceMetrics> = {}
    for (const [age, acc] of ageMap) {
      record[age] = breakdownAccToMetrics(acc)
    }
    ageByCampaign.set(slug, record)
  }

  const genderByCampaign = new Map<string, Record<string, PerformanceMetrics>>()
  for (const [slug, genderMap] of genderAccByCampaign) {
    const record: Record<string, PerformanceMetrics> = {}
    for (const [gender, acc] of genderMap) {
      record[gender] = breakdownAccToMetrics(acc)
    }
    genderByCampaign.set(slug, record)
  }

  return { ageByCampaign, genderByCampaign }
}

/** Process placement breakdown rows into per-campaign placement maps. */
function processPlacementBreakdown(
  rows: readonly MetaInsightsRow[],
): Map<string, Record<string, PerformanceMetrics>> {
  const placementByCampaign = new Map<string, Record<string, PerformanceMetrics>>()

  for (const row of rows) {
    const slug = slugify(row.campaign_name)
    const platform = row.publisher_platform ?? 'unknown'
    const position = row.platform_position ?? 'unknown'
    const key = `${platform}:${position}`

    let placements = placementByCampaign.get(slug)
    if (!placements) {
      placements = {}
      placementByCampaign.set(slug, placements)
    }
    placements[key] = normalizeMetaMetrics(row)
  }

  return placementByCampaign
}

// ---------------------------------------------------------------------------
// Public API — fetch all performance data for a Meta account
// ---------------------------------------------------------------------------

/**
 * Fetch performance data from Meta Insights API across campaign, ad set, and ad levels.
 *
 * Queries with `time_increment=1` for daily granularity, then aggregates
 * daily rows into PerformanceData with byDay breakdowns.
 */
export async function fetchMetaPerformance(
  client: MetaClient,
  rawAccountId: string,
  period: { readonly start: Date; readonly end: Date },
): Promise<PerformanceData[]> {
  // Normalize — config may include 'act_' prefix, but query helpers add it
  const accountId = rawAccountId.replace(/^act_/, '')

  // Fetch all levels + demographic/placement breakdowns in parallel
  const [campaignRows, adSetRows, adRows, ageGenderRows, placementRows] = await Promise.all([
    queryInsights(client, accountId, 'campaign', period),
    queryInsights(client, accountId, 'adset', period),
    queryInsights(client, accountId, 'ad', period),
    queryAgeGenderBreakdown(client, accountId, period),
    queryPlacementBreakdown(client, accountId, period),
  ])

  // Process breakdown data
  const { ageByCampaign, genderByCampaign } = processAgeGenderBreakdown(ageGenderRows)
  const placementByCampaign = processPlacementBreakdown(placementRows)

  // Aggregate daily rows per resource
  const campaignData = aggregateRows(campaignRows, 'campaign', campaignPath)
  const adSetData = aggregateRows(adSetRows, 'adSet', adSetPath)
  const adData = aggregateRows(adRows, 'ad', adPath)

  // Convert to PerformanceData
  const results: PerformanceData[] = []

  for (const entry of campaignData) {
    const ageData = ageByCampaign.get(entry.resource)
    const genderData = genderByCampaign.get(entry.resource)
    const placementData = placementByCampaign.get(entry.resource)

    results.push({
      resource: entry.resource,
      provider: 'meta',
      kind: entry.kind,
      period: { start: period.start, end: period.end },
      metrics: entry.metrics,
      violations: [],
      breakdowns: {
        byDay: entry.dailyBreakdown.length > 0 ? entry.dailyBreakdown : undefined,
        ...(ageData && Object.keys(ageData).length > 0 ? { byAge: ageData } : {}),
        ...(genderData && Object.keys(genderData).length > 0 ? { byGender: genderData } : {}),
        ...(placementData && Object.keys(placementData).length > 0 ? { byPlacement: placementData } : {}),
      },
    })
  }

  for (const entry of [...adSetData, ...adData]) {
    results.push({
      resource: entry.resource,
      provider: 'meta',
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
