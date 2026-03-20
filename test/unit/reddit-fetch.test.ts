import { describe, test, expect } from 'bun:test'
import { fetchRedditAll } from '../../src/reddit/fetch'
import type { RedditClient } from '../../src/reddit/api'
import type { RedditProviderConfig } from '../../src/reddit/types'

// ─── Mock API Responses ──────────────────────────────────

const mockCampaigns = [
  {
    id: 'camp_1',
    name: 'Traffic Campaign',
    objective: 'TRAFFIC',
    configured_status: 'ACTIVE',
    effective_status: 'PAUSED', // should be ignored — we use configured_status
    daily_budget_micro: 5_000_000, // $5.00
    currency: 'USD',
  },
  {
    id: 'camp_2',
    name: 'Awareness Campaign',
    objective: 'BRAND_AWARENESS_AND_REACH',
    configured_status: 'PAUSED',
    daily_budget_micro: 10_000_000,
    currency: 'USD',
    spend_cap_micro: 100_000_000, // $100.00 spend cap
  },
]

const mockAdGroups = [
  {
    id: 'ag_1',
    name: 'Tech Subreddits',
    campaign_id: 'camp_1',
    configured_status: 'ACTIVE',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST',
    targeting: {
      subreddits: ['r/technology', 'r/programming'],
      geo: { locations: ['US', 'CA'] },
      age: { min: 18, max: 45 },
      gender: 'ALL',
      device_types: ['MOBILE', 'DESKTOP'],
    },
    placement: 'FEED',
    start_time: '2026-04-01T00:00:00Z',
    end_time: '2026-05-01T00:00:00Z',
  },
  {
    id: 'ag_2',
    name: 'Interest Group',
    campaign_id: 'camp_1',
    configured_status: 'PAUSED',
    optimization_goal: 'LANDING_PAGE_VIEWS',
    bid_strategy: 'COST_CAP',
    bid_micro: 3_000_000, // $3.00
    targeting: {
      interests: ['Technology', 'Science'],
      keywords: ['typescript', 'javascript'],
      geo: { locations: ['US'] },
      os: ['IOS', 'ANDROID'],
      custom_audience_id: 'aud_123',
      expansion: true,
    },
    placement: 'ALL',
  },
]

const mockAds = [
  {
    id: 'ad_1',
    name: 'Hero Image Ad',
    ad_group_id: 'ag_1',
    configured_status: 'ACTIVE',
    post: {
      type: 'IMAGE',
      headline: 'Check this out!',
      body: 'Amazing product for devs',
      click_url: 'https://example.com',
      cta: 'LEARN_MORE',
      thumbnail_url: 'https://cdn.reddit.com/thumb.jpg',
      media_url: 'https://cdn.reddit.com/hero.jpg',
    },
  },
  {
    id: 'ad_2',
    name: 'Demo Video',
    ad_group_id: 'ag_1',
    configured_status: 'PAUSED',
    post: {
      type: 'VIDEO',
      headline: 'Watch the demo',
      body: 'See it in action',
      click_url: 'https://example.com/demo',
      cta: 'WATCH_MORE',
      thumbnail_url: 'https://cdn.reddit.com/vthumb.jpg',
      media_url: 'https://cdn.reddit.com/demo.mp4',
    },
  },
  {
    id: 'ad_3',
    name: 'Product Carousel',
    ad_group_id: 'ag_2',
    configured_status: 'ACTIVE',
    post: {
      type: 'CAROUSEL',
      cards: [
        { image_url: 'https://cdn.reddit.com/c1.jpg', headline: 'Card 1', url: 'https://example.com/1', caption: 'Caption 1' },
        { image_url: 'https://cdn.reddit.com/c2.jpg', headline: 'Card 2', url: 'https://example.com/2' },
      ],
      click_url: 'https://example.com',
      cta: 'SHOP_NOW',
    },
  },
]

// ─── Mock Client ─────────────────────────────────────────

function createMockClient(data: {
  campaigns?: unknown[]
  adGroups?: unknown[]
  ads?: unknown[]
} = {}): RedditClient {
  return {
    get: async () => ({} as any),
    post: async () => ({} as any),
    put: async () => ({} as any),
    delete: async () => ({} as any),
    fetchAll: async <T>(endpoint: string): Promise<T[]> => {
      if (endpoint.includes('/campaigns')) return (data.campaigns ?? []) as T[]
      if (endpoint.includes('/ad_groups')) return (data.adGroups ?? []) as T[]
      if (endpoint.includes('/ads')) return (data.ads ?? []) as T[]
      return [] as T[]
    },
    upload: async () => ({} as any),
  }
}

const config: RedditProviderConfig = { accountId: 'acc_123' }

describe('fetchRedditAll', () => {
  test('returns empty array for empty account', async () => {
    const client = createMockClient()
    const resources = await fetchRedditAll(config, client)
    expect(resources).toEqual([])
  })

  describe('campaign normalization', () => {
    test('maps objective using REVERSE_OBJECTIVE_MAP', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[0]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      expect(campaign.properties.objective).toBe('TRAFFIC')
    })

    test('uses configured_status, not effective_status', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[0]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      // configured_status is ACTIVE, effective_status is PAUSED — we should use configured
      expect(campaign.properties.status).toBe('ACTIVE')
    })

    test('converts daily_budget_micro to Budget', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[0]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      expect(campaign.properties.budget).toEqual({
        amount: 5,
        currency: 'USD',
        period: 'daily',
      })
    })

    test('converts spend_cap_micro', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[1]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      expect(campaign.properties.spendCap).toBe(100)
    })

    test('slugifies campaign name for path', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[0]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      expect(campaign.path).toBe('traffic-campaign')
    })

    test('stores platformId', async () => {
      const client = createMockClient({ campaigns: [mockCampaigns[0]] })
      const resources = await fetchRedditAll(config, client)
      const campaign = resources.find(r => r.kind === 'campaign')!
      expect(campaign.platformId).toBe('camp_1')
    })
  })

  describe('ad group normalization', () => {
    test('builds correct parent-child path', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.path).toBe('traffic-campaign/tech-subreddits')
    })

    test('maps configured_status', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.status).toBe('ACTIVE')
    })

    test('normalizes targeting', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      const targeting = adGroup.properties.targeting as any[]
      expect(targeting).toEqual(expect.arrayContaining([
        { _type: 'subreddits', names: ['r/technology', 'r/programming'] },
        { _type: 'geo', locations: ['US', 'CA'] },
        { _type: 'age', min: 18, max: 45 },
        { _type: 'gender', value: 'all' },
        { _type: 'device', types: ['mobile', 'desktop'] },
      ]))
    })

    test('normalizes bid strategy', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[1]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.bid).toEqual({ type: 'COST_CAP', amount: 3 })
    })

    test('normalizes optimization goal', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.optimization).toBe('LINK_CLICKS')
    })

    test('normalizes placement', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.placement).toBe('FEED')
    })

    test('normalizes schedule', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.schedule).toEqual({
        start: '2026-04-01T00:00:00Z',
        end: '2026-05-01T00:00:00Z',
      })
    })

    test('includes complex targeting (interests, keywords, custom audience, expansion)', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[1]],
      })
      const resources = await fetchRedditAll(config, client)
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      const targeting = adGroup.properties.targeting as any[]
      expect(targeting).toEqual(expect.arrayContaining([
        { _type: 'interests', names: ['Technology', 'Science'] },
        { _type: 'keywords', terms: ['typescript', 'javascript'] },
        { _type: 'geo', locations: ['US'] },
        { _type: 'os', types: ['ios', 'android'] },
        { _type: 'customAudience', id: 'aud_123' },
        { _type: 'expansion', enabled: true },
      ]))
    })
  })

  describe('ad normalization', () => {
    test('normalizes image ad', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
        ads: [mockAds[0]],
      })
      const resources = await fetchRedditAll(config, client)
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.path).toBe('traffic-campaign/tech-subreddits/hero-image-ad')
      expect(ad.properties.format).toBe('image')
      expect(ad.properties.headline).toBe('Check this out!')
      expect(ad.properties.body).toBe('Amazing product for devs')
      expect(ad.properties.clickUrl).toBe('https://example.com')
      expect(ad.properties.cta).toBe('LEARN_MORE')
      expect(ad.platformId).toBe('ad_1')
    })

    test('normalizes video ad', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
        ads: [mockAds[1]],
      })
      const resources = await fetchRedditAll(config, client)
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.properties.format).toBe('video')
      expect(ad.properties.headline).toBe('Watch the demo')
      expect(ad.properties.clickUrl).toBe('https://example.com/demo')
    })

    test('normalizes carousel ad', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[1]],
        ads: [mockAds[2]],
      })
      const resources = await fetchRedditAll(config, client)
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.properties.format).toBe('carousel')
      expect(ad.properties.cards).toEqual([
        { image: 'https://cdn.reddit.com/c1.jpg', headline: 'Card 1', url: 'https://example.com/1', caption: 'Caption 1' },
        { image: 'https://cdn.reddit.com/c2.jpg', headline: 'Card 2', url: 'https://example.com/2' },
      ])
      expect(ad.properties.clickUrl).toBe('https://example.com')
      expect(ad.properties.cta).toBe('SHOP_NOW')
    })

    test('uses configured_status for ad status', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [mockAdGroups[0]],
        ads: [mockAds[1]],
      })
      const resources = await fetchRedditAll(config, client)
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.properties.status).toBe('PAUSED')
    })
  })

  describe('full account fetch', () => {
    test('produces all resources in correct order', async () => {
      const client = createMockClient({
        campaigns: mockCampaigns,
        adGroups: mockAdGroups,
        ads: mockAds,
      })
      const resources = await fetchRedditAll(config, client)

      const campaigns = resources.filter(r => r.kind === 'campaign')
      const adGroups = resources.filter(r => r.kind === 'adGroup')
      const ads = resources.filter(r => r.kind === 'ad')

      expect(campaigns).toHaveLength(2)
      expect(adGroups).toHaveLength(2)
      expect(ads).toHaveLength(3)

      // All campaigns come first, then ad groups are mixed with their ads
      const kinds = resources.map(r => r.kind)
      const firstAdGroupIdx = kinds.indexOf('adGroup')
      const lastCampaignIdx = kinds.lastIndexOf('campaign')
      expect(firstAdGroupIdx).toBeGreaterThan(lastCampaignIdx)
    })

    test('orphan ad groups (no parent campaign) are skipped', async () => {
      const client = createMockClient({
        campaigns: [],
        adGroups: [mockAdGroups[0]],
        ads: [],
      })
      const resources = await fetchRedditAll(config, client)
      // Ad group references camp_1 which doesn't exist
      expect(resources.filter(r => r.kind === 'adGroup')).toHaveLength(0)
    })

    test('orphan ads (no parent ad group) are skipped', async () => {
      const client = createMockClient({
        campaigns: [mockCampaigns[0]],
        adGroups: [],
        ads: [mockAds[0]],
      })
      const resources = await fetchRedditAll(config, client)
      expect(resources.filter(r => r.kind === 'ad')).toHaveLength(0)
    })
  })
})
