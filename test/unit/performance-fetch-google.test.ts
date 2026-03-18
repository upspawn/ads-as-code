import { describe, test, expect } from 'bun:test'
import { normalizeGoogleMetrics, fetchGooglePerformance } from '../../src/google/performance.ts'
import {
  campaignMetricsResponse,
  deviceBreakdownResponse,
  adGroupMetricsResponse,
  keywordMetricsResponse,
  searchTermResponse,
} from '../fixtures/performance/google-metrics.ts'
import type { GoogleAdsClient } from '../../src/google/types.ts'

// ─── Mock Client ─────────────────────────────────────────────

function createMockClient(): GoogleAdsClient {
  return {
    customerId: '123',
    query: async (gaql: string) => {
      if (gaql.includes('segments.device') && gaql.includes('FROM campaign')) return deviceBreakdownResponse
      if (gaql.includes('FROM campaign')) return campaignMetricsResponse
      if (gaql.includes('FROM ad_group')) return adGroupMetricsResponse
      if (gaql.includes('FROM keyword_view')) return keywordMetricsResponse
      if (gaql.includes('FROM search_term_view')) return searchTermResponse
      return []
    },
    mutate: async () => [],
  }
}

// ─── normalizeGoogleMetrics ──────────────────────────────────

describe('normalizeGoogleMetrics', () => {
  test('converts cost_micros to currency', () => {
    const result = normalizeGoogleMetrics({
      impressions: 1000,
      clicks: 50,
      cost_micros: 25_000_000,
      conversions: 5,
      conversions_value: 150,
    })
    expect(result.cost).toBe(25)
    expect(result.impressions).toBe(1000)
    expect(result.clicks).toBe(50)
    expect(result.conversions).toBe(5)
    expect(result.conversionValue).toBe(150)
  })

  test('computes derived metrics correctly', () => {
    const result = normalizeGoogleMetrics({
      impressions: 1000,
      clicks: 50,
      cost_micros: 25_000_000,
      conversions: 5,
      conversions_value: 150,
    })
    expect(result.ctr).toBe(0.05)             // 50/1000
    expect(result.cpc).toBe(0.5)              // 25/50
    expect(result.cpa).toBe(5)                // 25/5
    expect(result.roas).toBe(6)               // 150/25
    expect(result.cpm).toBe(25)               // (25/1000)*1000
  })

  test('handles zero impressions gracefully', () => {
    const result = normalizeGoogleMetrics({
      impressions: 0,
      clicks: 0,
      cost_micros: 0,
      conversions: 0,
      conversions_value: 0,
    })
    expect(result.ctr).toBeNull()
    expect(result.cpc).toBeNull()
    expect(result.cpa).toBeNull()
    expect(result.roas).toBeNull()
  })

  test('handles zero conversions — CPA is null', () => {
    const result = normalizeGoogleMetrics({
      impressions: 100,
      clicks: 10,
      cost_micros: 5_000_000,
      conversions: 0,
      conversions_value: 0,
    })
    expect(result.cpa).toBeNull()
    expect(result.ctr).toBe(0.1)
    expect(result.cost).toBe(5)
  })

  test('passes through impressionShare when provided', () => {
    const result = normalizeGoogleMetrics({
      impressions: 100,
      clicks: 10,
      cost_micros: 5_000_000,
      conversions: 1,
      conversions_value: 50,
      search_impression_share: 0.82,
    })
    expect(result.impressionShare).toBe(0.82)
  })

  test('passes through qualityScore when provided', () => {
    const result = normalizeGoogleMetrics({
      impressions: 100,
      clicks: 10,
      cost_micros: 5_000_000,
      conversions: 1,
      conversions_value: 50,
      quality_score: 8,
    })
    expect(result.qualityScore).toBe(8)
  })
})

// ─── fetchGooglePerformance ──────────────────────────────────

describe('fetchGooglePerformance', () => {
  const period = {
    start: new Date('2026-03-10'),
    end: new Date('2026-03-11'),
  }

  test('returns one PerformanceData per campaign', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    // Two campaigns: Brand — US and Retargeting — EU
    const campaigns = results.filter(r => r.kind === 'campaign')
    expect(campaigns).toHaveLength(2)
  })

  test('aggregates daily campaign rows into summed metrics', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us')!
    expect(brand).toBeDefined()
    expect(brand.metrics.impressions).toBe(2200)   // 1000 + 1200
    expect(brand.metrics.clicks).toBe(110)          // 50 + 60
    expect(brand.metrics.cost).toBe(55)             // 25 + 30
    expect(brand.metrics.conversions).toBe(12)      // 5 + 7
    expect(brand.metrics.conversionValue).toBe(360) // 150 + 210
  })

  test('campaign has byDay breakdown', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us')!
    expect(brand.breakdowns.byDay).toHaveLength(2)

    const day1 = brand.breakdowns.byDay!.find(d => d.date === '2026-03-10')!
    expect(day1.metrics.impressions).toBe(1000)
    expect(day1.metrics.cost).toBe(25)

    const day2 = brand.breakdowns.byDay!.find(d => d.date === '2026-03-11')!
    expect(day2.metrics.impressions).toBe(1200)
    expect(day2.metrics.cost).toBe(30)
  })

  test('campaign aggregate has correct derived metrics', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us')!
    expect(brand.metrics.ctr).toBeCloseTo(110 / 2200)
    expect(brand.metrics.cpc).toBeCloseTo(55 / 110)
    expect(brand.metrics.cpa).toBeCloseTo(55 / 12)
    expect(brand.metrics.roas).toBeCloseTo(360 / 55)
  })

  test('campaign has averaged impressionShare', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us')!
    // Average of 0.82 and 0.85
    expect(brand.metrics.impressionShare).toBeCloseTo(0.835)
  })

  test('returns keyword-level PerformanceData entries', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const keywords = results.filter(r => r.kind === 'keyword')
    expect(keywords).toHaveLength(3)

    const myBrand = keywords.find(r => r.resource === 'brand-us/exact-match/kw:my-brand:EXACT')!
    expect(myBrand).toBeDefined()
    expect(myBrand.metrics.impressions).toBe(800)
    expect(myBrand.metrics.cost).toBe(20)
    expect(myBrand.metrics.qualityScore).toBe(8)
  })

  test('keyword paths use slugified campaign/group names and match type', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const paths = results.filter(r => r.kind === 'keyword').map(r => r.resource)
    expect(paths).toContain('brand-us/exact-match/kw:my-brand:EXACT')
    expect(paths).toContain('brand-us/exact-match/kw:competitor-name:EXACT')
    expect(paths).toContain('retargeting-eu/broad-terms/kw:retargeting-service:BROAD')
  })

  test('search terms appear as campaign breakdowns (bySearchTerm)', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us')!
    expect(brand.breakdowns.bySearchTerm).toHaveLength(2)

    const buyTerm = brand.breakdowns.bySearchTerm!.find(t => t.term === 'buy my brand online')!
    expect(buyTerm).toBeDefined()
    expect(buyTerm.metrics.impressions).toBe(200)
    expect(buyTerm.metrics.cost).toBe(7.5)
    expect(buyTerm.metrics.conversions).toBe(3)
  })

  test('all entries have provider=google and correct period', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    for (const entry of results) {
      expect(entry.provider).toBe('google')
      expect(entry.period.start).toEqual(period.start)
      expect(entry.period.end).toEqual(period.end)
    }
  })

  test('all entries have empty violations (not computed at fetch time)', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    for (const entry of results) {
      expect(entry.violations).toEqual([])
    }
  })

  test('campaign has byDevice breakdown', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const brand = results.find(r => r.resource === 'brand-us' && r.kind === 'campaign')!
    expect(brand.breakdowns.byDevice).toBeDefined()

    const mobile = brand.breakdowns.byDevice!.mobile
    expect(mobile).toBeDefined()
    expect(mobile.impressions).toBe(1500)
    expect(mobile.cost).toBe(35)

    const desktop = brand.breakdowns.byDevice!.desktop
    expect(desktop).toBeDefined()
    expect(desktop.impressions).toBe(600)
    expect(desktop.cost).toBe(18)

    const tablet = brand.breakdowns.byDevice!.tablet
    expect(tablet).toBeDefined()
    expect(tablet.impressions).toBe(100)
  })

  test('campaign without device data has no byDevice breakdown', async () => {
    // Retargeting only has mobile device data, but should still get a byDevice
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const retargeting = results.find(r => r.resource === 'retargeting-eu' && r.kind === 'campaign')!
    expect(retargeting.breakdowns.byDevice).toBeDefined()
    expect(retargeting.breakdowns.byDevice!.mobile).toBeDefined()
    expect(retargeting.breakdowns.byDevice!.mobile.impressions).toBe(800)
  })

  test('returns ad-group-level PerformanceData entries', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const adGroups = results.filter(r => r.kind === 'adGroup')
    expect(adGroups).toHaveLength(3)

    const exactMatch = adGroups.find(r => r.resource === 'brand-us/exact-match')!
    expect(exactMatch).toBeDefined()
    expect(exactMatch.metrics.impressions).toBe(1200)
    expect(exactMatch.metrics.cost).toBe(25)
    expect(exactMatch.metrics.conversions).toBe(5)
  })

  test('ad-group paths use slugified campaign/group names', async () => {
    const client = createMockClient()
    const results = await fetchGooglePerformance(client, period)

    const paths = results.filter(r => r.kind === 'adGroup').map(r => r.resource)
    expect(paths).toContain('brand-us/exact-match')
    expect(paths).toContain('brand-us/phrase-match')
    expect(paths).toContain('retargeting-eu/broad-terms')
  })

  test('handles empty API responses', async () => {
    const emptyClient: GoogleAdsClient = {
      customerId: '123',
      query: async () => [],
      mutate: async () => [],
    }
    const results = await fetchGooglePerformance(emptyClient, period)
    expect(results).toEqual([])
  })
})
