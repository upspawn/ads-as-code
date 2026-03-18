import { describe, test, expect } from 'bun:test'
import { computeMetrics } from '../../src/performance/types.ts'
import {
  extractConversions,
  extractConversionValue,
  normalizeMetaMetrics,
  fetchMetaPerformance,
} from '../../src/meta/performance.ts'
import type { MetaClient } from '../../src/meta/api.ts'
import {
  campaignInsightsResponse,
  adSetInsightsResponse,
  adInsightsResponse,
  dailyInsightsResponse,
  ageGenderBreakdownResponse,
  placementBreakdownResponse,
  noConversionsRow,
  emptyActionsRow,
} from '../fixtures/performance/meta-insights.ts'

// ---------------------------------------------------------------------------
// extractConversions
// ---------------------------------------------------------------------------

describe('extractConversions', () => {
  test('extracts offsite_conversion count from actions array', () => {
    const actions = [
      { action_type: 'link_click', value: '400' },
      { action_type: 'offsite_conversion', value: '30' },
      { action_type: 'landing_page_view', value: '380' },
    ]
    expect(extractConversions(actions)).toBe(30)
  })

  test('returns 0 when no offsite_conversion action present', () => {
    const actions = [{ action_type: 'link_click', value: '400' }]
    expect(extractConversions(actions)).toBe(0)
  })

  test('returns 0 for undefined actions', () => {
    expect(extractConversions(undefined)).toBe(0)
  })

  test('returns 0 for empty actions array', () => {
    expect(extractConversions([])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// extractConversionValue
// ---------------------------------------------------------------------------

describe('extractConversionValue', () => {
  test('extracts offsite_conversion value from action_values array', () => {
    const actionValues = [{ action_type: 'offsite_conversion', value: '1800.00' }]
    expect(extractConversionValue(actionValues)).toBe(1800)
  })

  test('returns 0 when no offsite_conversion value present', () => {
    const actionValues = [{ action_type: 'link_click', value: '50.00' }]
    expect(extractConversionValue(actionValues)).toBe(0)
  })

  test('returns 0 for undefined action_values', () => {
    expect(extractConversionValue(undefined)).toBe(0)
  })

  test('returns 0 for empty action_values array', () => {
    expect(extractConversionValue([])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// normalizeMetaMetrics
// ---------------------------------------------------------------------------

describe('normalizeMetaMetrics', () => {
  test('normalizes a campaign insights row to PerformanceMetrics', () => {
    const row = campaignInsightsResponse[0]!
    const metrics = normalizeMetaMetrics(row)

    expect(metrics.impressions).toBe(15000)
    expect(metrics.clicks).toBe(450)
    expect(metrics.cost).toBe(600)
    expect(metrics.conversions).toBe(30)
    expect(metrics.conversionValue).toBe(1800)
    expect(metrics.frequency).toBe(2.5)
    expect(metrics.reach).toBe(6000)
    // Derived metrics computed by computeMetrics
    expect(metrics.ctr).toBeCloseTo(450 / 15000)
    expect(metrics.cpc).toBeCloseTo(600 / 450)
    expect(metrics.cpa).toBeCloseTo(600 / 30)
    expect(metrics.roas).toBeCloseTo(1800 / 600)
  })

  test('handles row with no conversions', () => {
    const metrics = normalizeMetaMetrics(noConversionsRow)
    expect(metrics.conversions).toBe(0)
    expect(metrics.conversionValue).toBe(0)
    expect(metrics.cpa).toBeNull()
  })

  test('handles row with empty actions arrays', () => {
    const metrics = normalizeMetaMetrics(emptyActionsRow)
    expect(metrics.conversions).toBe(0)
    expect(metrics.conversionValue).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// fetchMetaPerformance
// ---------------------------------------------------------------------------

describe('fetchMetaPerformance', () => {
  function mockClient(responses: Record<string, unknown>): MetaClient {
    return {
      graphGet: async <T>(endpoint: string, params?: Record<string, string>): Promise<T> => {
        const level = params?.['level'] ?? 'campaign'
        const breakdowns = params?.['breakdowns'] ?? ''
        // Include breakdowns in key to differentiate breakdown queries
        const key = breakdowns
          ? `${endpoint}:${level}:${breakdowns}`
          : `${endpoint}:${level}`
        const response = responses[key]
        if (!response) {
          // Fall back to a key without breakdowns for backwards compat
          const fallback = responses[`${endpoint}:${level}`]
          if (fallback) return fallback as T
          throw new Error(`Unexpected graphGet call: ${key} (params: ${JSON.stringify(params)})`)
        }
        return response as T
      },
      graphPost: async () => { throw new Error('Not expected') },
      graphDelete: async () => { throw new Error('Not expected') },
      graphGetAll: async () => { throw new Error('Not expected') },
    }
  }

  const period = { start: new Date('2026-03-11'), end: new Date('2026-03-18') }

  /** Build a full response map with empty breakdowns by default. */
  function fullResponses(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      'act_12345/insights:campaign': { data: campaignInsightsResponse },
      'act_12345/insights:adset': { data: adSetInsightsResponse },
      'act_12345/insights:ad': { data: adInsightsResponse },
      'act_12345/insights:campaign:age,gender': { data: [] },
      'act_12345/insights:campaign:publisher_platform,platform_position': { data: [] },
      ...overrides,
    }
  }

  test('fetches campaign, ad set, and ad level data', async () => {
    const client = mockClient(fullResponses())

    const results = await fetchMetaPerformance(client, '12345', period)

    // Should produce campaign + ad set + ad entries
    const campaigns = results.filter(r => r.kind === 'campaign')
    const adSets = results.filter(r => r.kind === 'adSet')
    const ads = results.filter(r => r.kind === 'ad')

    expect(campaigns).toHaveLength(2)
    expect(adSets).toHaveLength(2)
    expect(ads).toHaveLength(1)
  })

  test('sets provider to meta on all results', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    for (const r of results) {
      expect(r.provider).toBe('meta')
    }
  })

  test('builds correct resource paths', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: adSetInsightsResponse.slice(0, 1) },
      'act_12345/insights:ad': { data: adInsightsResponse.slice(0, 1) },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)

    const campaignResult = results.find(r => r.kind === 'campaign')!
    expect(campaignResult.resource).toBe('retargeting-campaign')

    const adSetResult = results.find(r => r.kind === 'adSet')!
    expect(adSetResult.resource).toBe('retargeting-campaign/website-visitors-30d')

    const adResult = results.find(r => r.kind === 'ad')!
    expect(adResult.resource).toBe('retargeting-campaign/website-visitors-30d/dynamic-product-ad')
  })

  test('includes Meta-specific metrics (frequency, reach)', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results[0]!
    expect(campaign.metrics.frequency).toBe(2.5)
    expect(campaign.metrics.reach).toBe(6000)
  })

  test('sets period correctly', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results[0]!
    expect(campaign.period.start).toEqual(new Date('2026-03-11'))
    expect(campaign.period.end).toEqual(new Date('2026-03-18'))
  })

  test('returns empty array when no data', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: [] },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    expect(results).toEqual([])
  })

  test('handles daily breakdown data', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: dailyInsightsResponse },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)

    // Daily rows for the same campaign should be merged into one PerformanceData
    // with byDay breakdown
    const campaign = results.find(r => r.kind === 'campaign' && r.resource === 'retargeting-campaign')!
    expect(campaign).toBeDefined()
    expect(campaign.breakdowns.byDay).toHaveLength(2)
    expect(campaign.breakdowns.byDay![0]!.date).toBe('2026-03-11')
    expect(campaign.breakdowns.byDay![1]!.date).toBe('2026-03-12')

    // Aggregate metrics should be sum of daily rows
    expect(campaign.metrics.impressions).toBe(4500)
    expect(campaign.metrics.clicks).toBe(135)
    expect(campaign.metrics.cost).toBe(180)
    expect(campaign.metrics.conversions).toBe(9)
    expect(campaign.metrics.conversionValue).toBe(540)
  })

  test('passes correct time_range params to API', async () => {
    const capturedParams: Record<string, string>[] = []
    const client: MetaClient = {
      graphGet: async <T>(_endpoint: string, params?: Record<string, string>): Promise<T> => {
        if (params) capturedParams.push(params)
        return { data: [] } as T
      },
      graphPost: async () => { throw new Error('Not expected') },
      graphDelete: async () => { throw new Error('Not expected') },
      graphGetAll: async () => { throw new Error('Not expected') },
    }

    await fetchMetaPerformance(client, '12345', period)

    // Should have made 5 calls (campaign, adset, ad, age+gender breakdown, placement breakdown)
    expect(capturedParams).toHaveLength(5)

    // All calls should have the same time_range
    for (const params of capturedParams) {
      const timeRange = JSON.parse(params['time_range']!)
      expect(timeRange.since).toBe('2026-03-11')
      expect(timeRange.until).toBe('2026-03-18')
    }

    // Check levels
    const levels = capturedParams.map(p => p['level'])
    expect(levels).toContain('campaign')
    expect(levels).toContain('adset')
    expect(levels).toContain('ad')

    // Check breakdown params
    const breakdownParams = capturedParams.filter(p => p['breakdowns'])
    expect(breakdownParams).toHaveLength(2)
    const breakdowns = breakdownParams.map(p => p['breakdowns']).sort()
    expect(breakdowns).toEqual(['age,gender', 'publisher_platform,platform_position'])
  })

  test('includes age breakdown on campaign data', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
      'act_12345/insights:campaign:age,gender': { data: ageGenderBreakdownResponse },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results.find(r => r.kind === 'campaign')!

    expect(campaign.breakdowns.byAge).toBeDefined()
    // Age '25-34' should aggregate male + female rows
    const age2534 = campaign.breakdowns.byAge!['25-34']!
    expect(age2534).toBeDefined()
    expect(age2534.impressions).toBe(11000) // 5000 + 6000
    expect(age2534.clicks).toBe(330)        // 150 + 180
    expect(age2534.cost).toBe(440)          // 200 + 240

    // Age '35-44' has only one row
    const age3544 = campaign.breakdowns.byAge!['35-44']!
    expect(age3544).toBeDefined()
    expect(age3544.impressions).toBe(4000)
  })

  test('includes gender breakdown on campaign data', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
      'act_12345/insights:campaign:age,gender': { data: ageGenderBreakdownResponse },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results.find(r => r.kind === 'campaign')!

    expect(campaign.breakdowns.byGender).toBeDefined()
    // 'male' should aggregate across age groups (25-34 + 35-44)
    const male = campaign.breakdowns.byGender!['male']!
    expect(male).toBeDefined()
    expect(male.impressions).toBe(9000)  // 5000 + 4000
    expect(male.clicks).toBe(270)        // 150 + 120

    // 'female' has only the 25-34 row
    const female = campaign.breakdowns.byGender!['female']!
    expect(female).toBeDefined()
    expect(female.impressions).toBe(6000)
  })

  test('includes placement breakdown on campaign data', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
      'act_12345/insights:campaign:publisher_platform,platform_position': { data: placementBreakdownResponse },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results.find(r => r.kind === 'campaign')!

    expect(campaign.breakdowns.byPlacement).toBeDefined()

    const fbFeed = campaign.breakdowns.byPlacement!['facebook:feed']!
    expect(fbFeed).toBeDefined()
    expect(fbFeed.impressions).toBe(8000)
    expect(fbFeed.cost).toBe(320)

    const igStory = campaign.breakdowns.byPlacement!['instagram:story']!
    expect(igStory).toBeDefined()
    expect(igStory.impressions).toBe(4000)

    const fbRhc = campaign.breakdowns.byPlacement!['facebook:right_hand_column']!
    expect(fbRhc).toBeDefined()
    expect(fbRhc.impressions).toBe(3000)
  })

  test('no breakdown data when breakdown responses are empty', async () => {
    const client = mockClient(fullResponses({
      'act_12345/insights:campaign': { data: campaignInsightsResponse.slice(0, 1) },
      'act_12345/insights:adset': { data: [] },
      'act_12345/insights:ad': { data: [] },
    }))

    const results = await fetchMetaPerformance(client, '12345', period)
    const campaign = results.find(r => r.kind === 'campaign')!

    // Empty breakdown responses should not produce undefined/empty objects
    expect(campaign.breakdowns.byAge).toBeUndefined()
    expect(campaign.breakdowns.byGender).toBeUndefined()
    expect(campaign.breakdowns.byPlacement).toBeUndefined()
  })
})
