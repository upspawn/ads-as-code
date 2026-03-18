import type { GoogleAdsClient, GoogleAdsRow } from './types.ts'
import type { PerformanceData, PerformanceMetrics, PerformancePeriod } from '../performance/types.ts'
import { computeMetrics } from '../performance/types.ts'

// ─── Match Type Map (gRPC numeric enums) ─────────────────────

const MATCH_TYPE_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD',
}

const DEVICE_MAP: Record<number, 'mobile' | 'desktop' | 'tablet'> = {
  2: 'mobile', 3: 'desktop', 4: 'tablet',
}

import { slugify } from '../core/flatten.ts'

// ─── Raw Metrics Extraction ──────────────────────────────────

type RawGoogleMetrics = {
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  conversions_value: number
  search_impression_share?: number
  quality_score?: number
}

/** Safe number extraction from GAQL row fields. */
function num(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  return 0
}

/** Extract raw metrics from a GAQL row's `metrics` object. */
function extractRawMetrics(row: GoogleAdsRow): RawGoogleMetrics {
  const m = row.metrics as Record<string, unknown> | undefined
  if (!m) return { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, conversions_value: 0 }

  return {
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    cost_micros: num(m.cost_micros),
    conversions: num(m.conversions),
    conversions_value: num(m.conversions_value),
    ...(m.search_impression_share !== undefined ? { search_impression_share: num(m.search_impression_share) } : {}),
  }
}

// ─── Public: Normalize Raw Google Metrics ────────────────────

/**
 * Convert raw Google Ads metric fields (with micros) into provider-agnostic PerformanceMetrics.
 * Divides cost_micros by 1,000,000 and computes derived metrics via computeMetrics.
 */
export function normalizeGoogleMetrics(raw: RawGoogleMetrics): PerformanceMetrics {
  return computeMetrics({
    impressions: raw.impressions,
    clicks: raw.clicks,
    cost: raw.cost_micros / 1_000_000,
    conversions: raw.conversions,
    conversionValue: raw.conversions_value,
    ...(raw.search_impression_share !== undefined ? { impressionShare: raw.search_impression_share } : {}),
    ...(raw.quality_score !== undefined ? { qualityScore: raw.quality_score } : {}),
  })
}

// ─── GAQL Query Builders ─────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function campaignQuery(start: string, end: string): string {
  return `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, segments.date FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status != 'REMOVED'`
}

function deviceQuery(start: string, end: string): string {
  return `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, segments.device FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status != 'REMOVED'`
}

function adGroupQuery(start: string, end: string): string {
  return `SELECT campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM ad_group WHERE segments.date BETWEEN '${start}' AND '${end}'`
}

function keywordQuery(start: string, end: string): string {
  return `SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM keyword_view WHERE segments.date BETWEEN '${start}' AND '${end}'`
}

function searchTermQuery(start: string, end: string): string {
  return `SELECT campaign.name, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM search_term_view WHERE segments.date BETWEEN '${start}' AND '${end}'`
}

// ─── Row Field Accessors ─────────────────────────────────────

function getCampaignName(row: GoogleAdsRow): string {
  const c = row.campaign as Record<string, unknown> | undefined
  return (c?.name as string) ?? ''
}

function getAdGroupName(row: GoogleAdsRow): string {
  const ag = row.ad_group as Record<string, unknown> | undefined
  return (ag?.name as string) ?? ''
}

function getDate(row: GoogleAdsRow): string {
  const s = row.segments as Record<string, unknown> | undefined
  return (s?.date as string) ?? ''
}

function getKeywordText(row: GoogleAdsRow): string {
  const c = row.ad_group_criterion as Record<string, unknown> | undefined
  const kw = c?.keyword as Record<string, unknown> | undefined
  return (kw?.text as string) ?? ''
}

function getKeywordMatchType(row: GoogleAdsRow): string {
  const c = row.ad_group_criterion as Record<string, unknown> | undefined
  const kw = c?.keyword as Record<string, unknown> | undefined
  const mt = kw?.match_type
  if (typeof mt === 'number') return MATCH_TYPE_MAP[mt] ?? 'UNKNOWN'
  if (typeof mt === 'string') return mt
  return 'UNKNOWN'
}

function getQualityScore(row: GoogleAdsRow): number | undefined {
  const c = row.ad_group_criterion as Record<string, unknown> | undefined
  const qi = c?.quality_info as Record<string, unknown> | undefined
  const qs = qi?.quality_score
  return typeof qs === 'number' ? qs : undefined
}

function getSearchTerm(row: GoogleAdsRow): string {
  const stv = row.search_term_view as Record<string, unknown> | undefined
  return (stv?.search_term as string) ?? ''
}

function getDevice(row: GoogleAdsRow): 'mobile' | 'desktop' | 'tablet' | undefined {
  const s = row.segments as Record<string, unknown> | undefined
  const deviceEnum = Number(s?.device ?? 0)
  return DEVICE_MAP[deviceEnum]
}

// ─── Aggregation Helpers ─────────────────────────────────────

type RawAccumulator = {
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  conversions_value: number
  // For averaging impression share across days
  impressionShareSum: number
  impressionShareCount: number
}

function emptyAccumulator(): RawAccumulator {
  return { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, conversions_value: 0, impressionShareSum: 0, impressionShareCount: 0 }
}

function addToAccumulator(acc: RawAccumulator, raw: RawGoogleMetrics): void {
  acc.impressions += raw.impressions
  acc.clicks += raw.clicks
  acc.cost_micros += raw.cost_micros
  acc.conversions += raw.conversions
  acc.conversions_value += raw.conversions_value
  if (raw.search_impression_share !== undefined) {
    acc.impressionShareSum += raw.search_impression_share
    acc.impressionShareCount += 1
  }
}

function accumulatorToMetrics(acc: RawAccumulator): PerformanceMetrics {
  const raw: RawGoogleMetrics = {
    impressions: acc.impressions,
    clicks: acc.clicks,
    cost_micros: acc.cost_micros,
    conversions: acc.conversions,
    conversions_value: acc.conversions_value,
    ...(acc.impressionShareCount > 0
      ? { search_impression_share: acc.impressionShareSum / acc.impressionShareCount }
      : {}),
  }
  return normalizeGoogleMetrics(raw)
}

// ─── Public: Fetch Google Performance ────────────────────────

/**
 * Run GAQL queries for campaign, keyword, and search term metrics.
 * Returns provider-agnostic PerformanceData[] with:
 * - One entry per campaign (aggregated across days, with byDay breakdown)
 * - One entry per keyword
 * - Search terms stored as bySearchTerm breakdown on campaign entries
 *
 * Violations are left empty — they are computed by the analysis engine,
 * not at fetch time.
 */
export async function fetchGooglePerformance(
  client: GoogleAdsClient,
  period: PerformancePeriod,
): Promise<PerformanceData[]> {
  const start = formatDate(period.start)
  const end = formatDate(period.end)

  // Run all five queries in parallel
  const [campaignRows, deviceRows, adGroupRows, keywordRows, searchTermRows] = await Promise.all([
    client.query(campaignQuery(start, end)),
    client.query(deviceQuery(start, end)),
    client.query(adGroupQuery(start, end)),
    client.query(keywordQuery(start, end)),
    client.query(searchTermQuery(start, end)),
  ])

  const results: PerformanceData[] = []

  // ── Campaign-level: aggregate daily rows per campaign ──

  const campaignMap = new Map<string, {
    acc: RawAccumulator
    byDay: { date: string; raw: RawGoogleMetrics }[]
  }>()

  for (const row of campaignRows) {
    const name = getCampaignName(row)
    const slug = slugify(name)
    const date = getDate(row)
    const raw = extractRawMetrics(row)

    let entry = campaignMap.get(slug)
    if (!entry) {
      entry = { acc: emptyAccumulator(), byDay: [] }
      campaignMap.set(slug, entry)
    }

    addToAccumulator(entry.acc, raw)
    entry.byDay.push({ date, raw })
  }

  // ── Device breakdown: group by campaign, then by device ──

  const deviceByCampaign = new Map<string, Map<string, RawAccumulator>>()

  for (const row of deviceRows) {
    const slug = slugify(getCampaignName(row))
    const device = getDevice(row)
    if (!device) continue

    let devices = deviceByCampaign.get(slug)
    if (!devices) {
      devices = new Map()
      deviceByCampaign.set(slug, devices)
    }

    let acc = devices.get(device)
    if (!acc) {
      acc = emptyAccumulator()
      devices.set(device, acc)
    }

    addToAccumulator(acc, extractRawMetrics(row))
  }

  // ── Search terms: group by campaign slug ──

  const searchTermsByCampaign = new Map<string, { term: string; metrics: PerformanceMetrics }[]>()

  for (const row of searchTermRows) {
    const campaignSlug = slugify(getCampaignName(row))
    const term = getSearchTerm(row)
    const raw = extractRawMetrics(row)
    const metrics = normalizeGoogleMetrics(raw)

    let terms = searchTermsByCampaign.get(campaignSlug)
    if (!terms) {
      terms = []
      searchTermsByCampaign.set(campaignSlug, terms)
    }
    terms.push({ term, metrics })
  }

  // ── Build campaign PerformanceData entries ──

  for (const [slug, { acc, byDay }] of campaignMap) {
    // Build device breakdown for this campaign
    const deviceAccs = deviceByCampaign.get(slug)
    let byDevice: Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics> | undefined
    if (deviceAccs && deviceAccs.size > 0) {
      const partial: Partial<Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics>> = {}
      for (const [device, deviceAcc] of deviceAccs) {
        partial[device as 'mobile' | 'desktop' | 'tablet'] = accumulatorToMetrics(deviceAcc)
      }
      byDevice = partial as Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics>
    }

    results.push({
      resource: slug,
      provider: 'google',
      kind: 'campaign',
      period: { start: period.start, end: period.end },
      metrics: accumulatorToMetrics(acc),
      violations: [],
      breakdowns: {
        byDay: byDay.map(d => ({
          date: d.date,
          metrics: normalizeGoogleMetrics(d.raw),
        })),
        ...(byDevice ? { byDevice } : {}),
        ...(searchTermsByCampaign.has(slug)
          ? { bySearchTerm: searchTermsByCampaign.get(slug)! }
          : {}),
      },
    })
  }

  // ── Ad-group-level entries ──

  // Aggregate across date segments (GAQL returns per-date rows when filtering by date range)
  const adGroupMap = new Map<string, RawAccumulator>()

  for (const row of adGroupRows) {
    const campaignSlug = slugify(getCampaignName(row))
    const groupSlug = slugify(getAdGroupName(row))
    const path = `${campaignSlug}/${groupSlug}`

    let acc = adGroupMap.get(path)
    if (!acc) {
      acc = emptyAccumulator()
      adGroupMap.set(path, acc)
    }

    addToAccumulator(acc, extractRawMetrics(row))
  }

  for (const [path, acc] of adGroupMap) {
    results.push({
      resource: path,
      provider: 'google',
      kind: 'adGroup',
      period: { start: period.start, end: period.end },
      metrics: accumulatorToMetrics(acc),
      violations: [],
      breakdowns: {},
    })
  }

  // ── Keyword-level entries ──

  for (const row of keywordRows) {
    const campaignSlug = slugify(getCampaignName(row))
    const groupSlug = slugify(getAdGroupName(row))
    const kwText = getKeywordText(row)
    const matchType = getKeywordMatchType(row)
    const qualityScore = getQualityScore(row)

    const kwSlug = slugify(kwText)
    const path = `${campaignSlug}/${groupSlug}/kw:${kwSlug}:${matchType}`

    const raw = extractRawMetrics(row)
    if (qualityScore !== undefined) {
      raw.quality_score = qualityScore
    }

    results.push({
      resource: path,
      provider: 'google',
      kind: 'keyword',
      period: { start: period.start, end: period.end },
      metrics: normalizeGoogleMetrics(raw),
      violations: [],
      breakdowns: {},
    })
  }

  return results
}
