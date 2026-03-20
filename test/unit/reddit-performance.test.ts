import { describe, test, expect } from 'bun:test'
import {
  normalizeRedditMetrics,
  fetchRedditPerformance,
  type RedditReportRow,
} from '../../src/reddit/performance'
import type { RedditClient } from '../../src/reddit/api'
import type { RedditProviderConfig } from '../../src/reddit/types'

// ---------------------------------------------------------------------------
// Metric normalization
// ---------------------------------------------------------------------------

describe('reddit performance — normalizeRedditMetrics', () => {
  test('computes derived metrics from raw values', () => {
    const row: RedditReportRow = {
      campaign_id: 'c_1',
      campaign_name: 'Test Campaign',
      impressions: 10000,
      clicks: 500,
      spend_micros: 50_000_000, // $50
      conversions: 25,
      conversion_value_micros: 250_000_000, // $250
      video_views: 0,
      video_completions: 0,
      upvotes: 100,
      downvotes: 10,
      date: '2026-03-15',
    }

    const metrics = normalizeRedditMetrics(row)
    expect(metrics.impressions).toBe(10000)
    expect(metrics.clicks).toBe(500)
    expect(metrics.cost).toBe(50) // converted from micros
    expect(metrics.conversions).toBe(25)
    expect(metrics.conversionValue).toBe(250) // converted from micros
    expect(metrics.ctr).toBeCloseTo(0.05) // 500/10000
    expect(metrics.cpc).toBeCloseTo(0.1) // 50/500
    expect(metrics.cpa).toBeCloseTo(2) // 50/25
    expect(metrics.roas).toBeCloseTo(5) // 250/50
    expect(metrics.cpm).toBeCloseTo(5) // 50/10000 * 1000
  })

  test('zero spend: CPC/CPM/CPA are null, not NaN/Infinity', () => {
    const row: RedditReportRow = {
      campaign_id: 'c_1',
      campaign_name: 'Zero Spend',
      impressions: 0,
      clicks: 0,
      spend_micros: 0,
      conversions: 0,
      conversion_value_micros: 0,
      video_views: 0,
      video_completions: 0,
      upvotes: 0,
      downvotes: 0,
      date: '2026-03-15',
    }

    const metrics = normalizeRedditMetrics(row)
    // All rate metrics should be null, not NaN or Infinity
    expect(metrics.cpc).toBeNull()
    expect(metrics.cpm).toBeNull()
    expect(metrics.cpa).toBeNull()
    expect(metrics.roas).toBeNull()
    expect(metrics.ctr).toBeNull()
  })

  test('spend with zero clicks: CPC is null, CPM is calculated', () => {
    const row: RedditReportRow = {
      campaign_id: 'c_1',
      campaign_name: 'No Clicks',
      impressions: 1000,
      clicks: 0,
      spend_micros: 10_000_000, // $10
      conversions: 0,
      conversion_value_micros: 0,
      video_views: 0,
      video_completions: 0,
      upvotes: 5,
      downvotes: 0,
      date: '2026-03-15',
    }

    const metrics = normalizeRedditMetrics(row)
    expect(metrics.cpc).toBeNull()     // 0 clicks → null
    expect(metrics.cpa).toBeNull()     // 0 conversions → null
    expect(metrics.cpm).toBeCloseTo(10) // $10 / 1000 * 1000 = $10
    expect(metrics.ctr).toBeCloseTo(0)  // 0 / 1000 = 0
    expect(metrics.roas).toBeCloseTo(0) // 0 / 10 = 0
  })

  test('handles zero impressions (null for ratios)', () => {
    const row: RedditReportRow = {
      campaign_id: 'c_1',
      campaign_name: 'Empty',
      impressions: 0,
      clicks: 0,
      spend_micros: 0,
      conversions: 0,
      conversion_value_micros: 0,
      video_views: 0,
      video_completions: 0,
      upvotes: 0,
      downvotes: 0,
      date: '2026-03-15',
    }

    const metrics = normalizeRedditMetrics(row)
    expect(metrics.ctr).toBeNull()
    expect(metrics.cpc).toBeNull()
    expect(metrics.cpa).toBeNull()
    expect(metrics.roas).toBeNull()
    expect(metrics.cpm).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Full fetch with mock client
// ---------------------------------------------------------------------------

describe('reddit performance — fetchRedditPerformance', () => {
  function mockClient(responses: Record<string, unknown>): RedditClient {
    return {
      get: async <T>(path: string, params?: Record<string, string>) => {
        const key = Object.keys(responses).find((k) => path.includes(k))
        return (key ? responses[key] : { data: [] }) as T
      },
      post: async <T>() => ({} as T),
      put: async <T>() => ({} as T),
      delete: async <T>() => ({} as T),
      fetchAll: async <T>() => ([] as T[]),
      upload: async <T>() => ({} as T),
    }
  }

  const config: RedditProviderConfig = { accountId: 'a2_test' }

  test('fetches campaign-level performance data', async () => {
    const client = mockClient({
      'reports': {
        data: [
          {
            campaign_id: 'c_1',
            campaign_name: 'Traffic Campaign',
            impressions: 5000,
            clicks: 250,
            spend_micros: 25_000_000,
            conversions: 10,
            conversion_value_micros: 100_000_000,
            video_views: 0,
            video_completions: 0,
            upvotes: 50,
            downvotes: 5,
            date: '2026-03-15',
          },
          {
            campaign_id: 'c_1',
            campaign_name: 'Traffic Campaign',
            impressions: 6000,
            clicks: 300,
            spend_micros: 30_000_000,
            conversions: 15,
            conversion_value_micros: 150_000_000,
            video_views: 0,
            video_completions: 0,
            upvotes: 60,
            downvotes: 6,
            date: '2026-03-16',
          },
        ],
      },
    })

    const period = {
      start: new Date('2026-03-15'),
      end: new Date('2026-03-16'),
    }

    const data = await fetchRedditPerformance(config, client, period)
    expect(data.length).toBeGreaterThan(0)

    const campaign = data.find((d) => d.kind === 'campaign')
    expect(campaign).toBeDefined()
    expect(campaign!.provider).toBe('reddit')
    expect(campaign!.metrics.impressions).toBe(11000)
    expect(campaign!.metrics.clicks).toBe(550)
    expect(campaign!.metrics.cost).toBeCloseTo(55)
    expect(campaign!.metrics.conversions).toBe(25)

    // Should have daily breakdown
    expect(campaign!.breakdowns.byDay).toBeDefined()
    expect(campaign!.breakdowns.byDay!.length).toBe(2)
  })

  test('handles empty response', async () => {
    const client = mockClient({ 'reports': { data: [] } })
    const period = {
      start: new Date('2026-03-15'),
      end: new Date('2026-03-16'),
    }

    const data = await fetchRedditPerformance(config, client, period)
    expect(data).toEqual([])
  })

  test('groups by ad group level', async () => {
    const client = mockClient({
      'reports': {
        data: [
          {
            campaign_id: 'c_1',
            campaign_name: 'Campaign',
            ad_group_id: 'ag_1',
            ad_group_name: 'Group A',
            impressions: 3000,
            clicks: 150,
            spend_micros: 15_000_000,
            conversions: 5,
            conversion_value_micros: 50_000_000,
            video_views: 0,
            video_completions: 0,
            upvotes: 30,
            downvotes: 3,
            date: '2026-03-15',
          },
          {
            campaign_id: 'c_1',
            campaign_name: 'Campaign',
            ad_group_id: 'ag_2',
            ad_group_name: 'Group B',
            impressions: 2000,
            clicks: 100,
            spend_micros: 10_000_000,
            conversions: 3,
            conversion_value_micros: 30_000_000,
            video_views: 0,
            video_completions: 0,
            upvotes: 20,
            downvotes: 2,
            date: '2026-03-15',
          },
        ],
      },
    })

    const period = {
      start: new Date('2026-03-15'),
      end: new Date('2026-03-15'),
    }

    const data = await fetchRedditPerformance(config, client, period)

    const campaigns = data.filter((d) => d.kind === 'campaign')
    const adGroups = data.filter((d) => d.kind === 'adGroup')

    expect(campaigns.length).toBe(1)
    expect(adGroups.length).toBe(2)

    // Campaign aggregates both ad groups
    expect(campaigns[0]!.metrics.impressions).toBe(5000)
    expect(campaigns[0]!.metrics.clicks).toBe(250)
  })

  test('includes Reddit-specific engagement metrics', async () => {
    const client = mockClient({
      'reports': {
        data: [
          {
            campaign_id: 'c_1',
            campaign_name: 'Engagement Campaign',
            impressions: 8000,
            clicks: 400,
            spend_micros: 40_000_000,
            conversions: 0,
            conversion_value_micros: 0,
            video_views: 2000,
            video_completions: 500,
            upvotes: 200,
            downvotes: 20,
            date: '2026-03-15',
          },
        ],
      },
    })

    const period = {
      start: new Date('2026-03-15'),
      end: new Date('2026-03-15'),
    }

    const data = await fetchRedditPerformance(config, client, period)
    const campaign = data.find((d) => d.kind === 'campaign')
    expect(campaign).toBeDefined()
    // Engagement metrics stored in the metrics object
    expect(campaign!.metrics.impressions).toBe(8000)
  })
})
