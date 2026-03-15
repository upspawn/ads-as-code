import { describe, expect, test, mock } from 'bun:test'
import { fetchMetaAll } from '../../src/meta/fetch.ts'
import type { MetaClient } from '../../src/meta/api.ts'
import type { MetaProviderConfig, Resource } from '../../src/core/types.ts'

// ─── Test Data ──────────────────────────────────────────────

const TEST_CONFIG: MetaProviderConfig = {
  accountId: 'act_123456',
  pageId: '999',
}

function makeApiCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 'camp_1',
    name: 'Retargeting - US',
    objective: 'OUTCOME_TRAFFIC',
    status: 'ACTIVE',
    daily_budget: '500', // 500 cents = €5.00
    ...overrides,
  }
}

function makeApiAdSet(overrides?: Record<string, unknown>) {
  return {
    id: 'adset_1',
    name: 'Website Visitors 30d',
    campaign_id: 'camp_1',
    status: 'ACTIVE',
    targeting: { geo_locations: { countries: ['US', 'DE'] } },
    daily_budget: '300',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    billing_event: 'IMPRESSIONS',
    ...overrides,
  }
}

function makeApiAd(overrides?: Record<string, unknown>) {
  return {
    id: 'ad_1',
    name: 'Hero Ad',
    adset_id: 'adset_1',
    status: 'ACTIVE',
    creative: {
      id: 'cr_1',
      name: 'Hero Creative',
      object_story_spec: {
        link_data: {
          image_hash: 'abc123def456',
          message: 'Stop wasting time renaming files.',
          link: 'https://renamed.to',
          name: 'Rename Files Instantly',
          description: 'AI-powered file organization',
          call_to_action: { type: 'SIGN_UP', value: { link: 'https://renamed.to' } },
        },
      },
      url_tags: 'utm_source=facebook&utm_medium=cpc',
    },
    ...overrides,
  }
}

/** Create a mock MetaClient that returns the provided data for each endpoint. */
function createMockClient(data: {
  campaigns?: unknown[]
  adSets?: unknown[]
  ads?: unknown[]
}): MetaClient {
  return {
    graphGet: mock(async () => ({})),
    graphPost: mock(async () => ({})),
    graphDelete: mock(async () => ({})),
    graphGetAll: mock(async (endpoint: string) => {
      if (endpoint.includes('/campaigns')) return data.campaigns ?? []
      if (endpoint.includes('/adsets')) return data.adSets ?? []
      if (endpoint.includes('/ads')) return data.ads ?? []
      return []
    }),
  }
}

// ─── Basic Fetch ────────────────────────────────────────────

describe('fetchMetaAll()', () => {
  test('returns empty array for empty account', async () => {
    const client = createMockClient({ campaigns: [], adSets: [], ads: [] })
    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources).toEqual([])
  })

  test('fetches campaigns, ad sets, and ads in parallel', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)

    // Should call graphGetAll 3 times (campaigns, adsets, ads)
    expect(client.graphGetAll).toHaveBeenCalledTimes(3)
  })

  test('passes correct fields to each endpoint', async () => {
    const client = createMockClient({
      campaigns: [],
      adSets: [],
      ads: [],
    })

    await fetchMetaAll(TEST_CONFIG, client)

    const calls = (client.graphGetAll as ReturnType<typeof mock>).mock.calls
    const campaignCall = calls.find((c: unknown[]) => (c[0] as string).endsWith('/campaigns'))
    const adSetCall = calls.find((c: unknown[]) => (c[0] as string).endsWith('/adsets'))
    const adCall = calls.find((c: unknown[]) => (c[0] as string).endsWith('/ads'))

    expect((campaignCall as unknown[])[1]).toEqual({ fields: expect.stringContaining('name,objective') })
    expect((adSetCall as unknown[])[1]).toEqual({ fields: expect.stringContaining('targeting') })
    expect((adCall as unknown[])[1]).toEqual({ fields: expect.stringContaining('creative') })
  })
})

// ─── Campaign Normalization ─────────────────────────────────

describe('fetchMetaAll() campaign normalization', () => {
  test('maps to Resource with kind=campaign', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const campaign = resources.find(r => r.kind === 'campaign')!

    expect(campaign.kind).toBe('campaign')
    expect(campaign.platformId).toBe('camp_1')
  })

  test('path is slugified campaign name', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ name: 'Cold - Construction Vertical' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.path).toBe('cold-construction-vertical')
  })

  test('converts daily_budget from cents to Budget type', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ daily_budget: '500' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.budget).toEqual({
      amount: 5,
      currency: 'EUR',
      period: 'daily',
    })
  })

  test('converts lifetime_budget from cents to Budget type', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ daily_budget: undefined, lifetime_budget: '10000' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.budget).toEqual({
      amount: 100,
      currency: 'EUR',
      period: 'lifetime',
      endTime: '',
    })
  })

  test('includes objective as API string', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ objective: 'OUTCOME_TRAFFIC' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.objective).toBe('OUTCOME_TRAFFIC')
  })

  test('maps ACTIVE status correctly', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ status: 'ACTIVE' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.status).toBe('ACTIVE')
  })

  test('maps PAUSED status correctly', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ status: 'PAUSED' })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.status).toBe('PAUSED')
  })

  test('includes special_ad_categories when present', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ special_ad_categories: ['HOUSING', 'CREDIT'] })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties.specialAdCategories).toEqual(['HOUSING', 'CREDIT'])
  })

  test('omits special_ad_categories when empty', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign({ special_ad_categories: [] })],
      adSets: [],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    expect(resources[0]!.properties).not.toHaveProperty('specialAdCategories')
  })
})

// ─── Ad Set Normalization ───────────────────────────────────

describe('fetchMetaAll() ad set normalization', () => {
  test('ad set path includes campaign slug', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const adSet = resources.find(r => r.kind === 'adSet')!

    expect(adSet.path).toBe('retargeting-us/website-visitors-30d')
    expect(adSet.platformId).toBe('adset_1')
  })

  test('includes targeting object', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet({ targeting: { geo_locations: { countries: ['US'] } } })],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.targeting).toEqual({ geo: [{ type: 'geo', countries: ['US'] }] })
  })

  test('maps bid strategy', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet({ bid_strategy: 'COST_CAP', bid_amount: 500 })],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.bidding).toEqual({ type: 'COST_CAP', cap: 5 })
  })

  test('defaults bid strategy to LOWEST_COST_WITHOUT_CAP', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet({ bid_strategy: undefined })],
      ads: [],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.bidding).toEqual({ type: 'LOWEST_COST_WITHOUT_CAP' })
  })
})

// ─── Ad + Creative Normalization ────────────────────────────

describe('fetchMetaAll() ad + creative normalization', () => {
  test('each ad produces both a creative and an ad resource', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creatives = resources.filter(r => r.kind === 'creative')
    const ads = resources.filter(r => r.kind === 'ad')

    expect(creatives).toHaveLength(1)
    expect(ads).toHaveLength(1)
  })

  test('creative path ends with /cr', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    // Path uses creative name (not ad name) for consistency with flatten
    expect(creative.path).toBe('retargeting-us/website-visitors-30d/hero-creative/cr')
    expect(creative.platformId).toBe('cr_1')
  })

  test('ad path matches ad set path + slugified creative name', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const ad = resources.find(r => r.kind === 'ad')!

    // Path uses creative name (not ad name) for consistency with flatten
    expect(ad.path).toBe('retargeting-us/website-visitors-30d/hero-creative')
    expect(ad.platformId).toBe('ad_1')
  })

  test('ad references its creative path', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const ad = resources.find(r => r.kind === 'ad')!

    expect(ad.meta?.creativePath).toBe('retargeting-us/website-visitors-30d/hero-creative/cr')
  })

  test('extracts creative properties from link_data', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd()],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    // imageHash is in meta (platform-internal), not properties
    expect(creative.meta?.imageHash).toBe('abc123def456')
    expect(creative.properties.headline).toBe('Rename Files Instantly')
    expect(creative.properties.primaryText).toBe('Stop wasting time renaming files.')
    expect(creative.properties.description).toBe('AI-powered file organization')
    expect(creative.properties.cta).toBe('SIGN_UP')
    expect(creative.properties.url).toBe('https://renamed.to')
    expect(creative.properties.urlParameters).toBe('utm_source=facebook&utm_medium=cpc')
  })

  test('extracts creative properties from video_data', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_2',
          name: 'Demo Video',
          object_story_spec: {
            video_data: {
              video_id: 'vid_123',
              image_hash: 'thumb_hash',
              message: 'Watch our demo',
              title: 'renamed.to Demo',
              link_description: 'See how it works',
              call_to_action: {
                type: 'WATCH_MORE',
                value: { link: 'https://renamed.to/demo' },
              },
            },
          },
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    // videoId and imageHash are in meta (platform-internal)
    expect(creative.meta?.videoId).toBe('vid_123')
    expect(creative.meta?.imageHash).toBe('thumb_hash')
    expect(creative.properties.headline).toBe('renamed.to Demo')
    expect(creative.properties.primaryText).toBe('Watch our demo')
    expect(creative.properties.description).toBe('See how it works')
    expect(creative.properties.cta).toBe('WATCH_MORE')
    expect(creative.properties.url).toBe('https://renamed.to/demo')
  })

  test('handles ad with no creative gracefully', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({ creative: undefined })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    // Should still produce a creative resource, just with empty props
    expect(creative).toBeDefined()
    expect(creative.properties.name).toBe('Hero Ad')
  })
})

// ─── Boosted Post Normalization ──────────────────────────────

describe('fetchMetaAll() boosted post normalization', () => {
  test('creative without object_story_spec omits format/headline/primaryText', async () => {
    // Boosted posts use object_story_id instead of object_story_spec,
    // so link_data and video_data are both absent.
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_boosted',
          name: 'Boosted Page Post',
          // No object_story_spec — this is a boosted post
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative).toBeDefined()
    expect(creative.properties.name).toBe('Boosted Page Post')
    // These fields should NOT exist — they don't exist on the API side
    expect(creative.properties).not.toHaveProperty('format')
    expect(creative.properties).not.toHaveProperty('headline')
    expect(creative.properties).not.toHaveProperty('primaryText')
    expect(creative.properties).not.toHaveProperty('cta')
    expect(creative.properties).not.toHaveProperty('url')
  })

  test('creative with empty object_story_spec omits format/headline/primaryText', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_boosted2',
          name: 'Another Boosted Post',
          object_story_spec: {},
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative.properties).not.toHaveProperty('format')
    expect(creative.properties).not.toHaveProperty('headline')
    expect(creative.properties).not.toHaveProperty('primaryText')
  })

  test('boosted post with url_tags still includes urlParameters', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_boosted3',
          name: 'Boosted With Tags',
          url_tags: 'utm_source=facebook',
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative.properties).not.toHaveProperty('format')
    expect(creative.properties.urlParameters).toBe('utm_source=facebook')
  })
})

// ─── Carousel Ad Normalization ──────────────────────────────

describe('fetchMetaAll() carousel ad normalization', () => {
  test('detects carousel from link_data with child_attachments', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_carousel',
          name: 'Product Carousel',
          object_story_spec: {
            link_data: {
              message: 'Check out our features',
              link: 'https://renamed.to',
              call_to_action: { type: 'LEARN_MORE', value: { link: 'https://renamed.to' } },
              child_attachments: [
                { image_hash: 'hash_card1', link: 'https://renamed.to/feature-1', name: 'Feature 1', description: 'First feature' },
                { image_hash: 'hash_card2', link: 'https://renamed.to/feature-2', name: 'Feature 2' },
                { image_hash: 'hash_card3', link: 'https://renamed.to/feature-3', name: 'Feature 3', description: 'Third feature' },
              ],
            },
          },
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative.properties.format).toBe('carousel')
    expect(creative.properties.primaryText).toBe('Check out our features')
    expect(creative.properties.cta).toBe('LEARN_MORE')
    expect(creative.properties.url).toBe('https://renamed.to')

    const cards = creative.properties.cards as Array<Record<string, unknown>>
    expect(cards).toHaveLength(3)
    expect(cards[0]!.headline).toBe('Feature 1')
    expect(cards[0]!.url).toBe('https://renamed.to/feature-1')
    expect(cards[0]!.description).toBe('First feature')
    expect(cards[0]!.image).toBe('hash:hash_card1')
    expect(cards[1]!.headline).toBe('Feature 2')
    expect(cards[1]!).not.toHaveProperty('description')
  })

  test('carousel with empty child_attachments falls through to image', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_not_carousel',
          name: 'Not A Carousel',
          object_story_spec: {
            link_data: {
              image_hash: 'abc123',
              message: 'Regular image ad',
              name: 'Image Headline',
              child_attachments: [],
            },
          },
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative.properties.format).toBe('image')
    expect(creative.properties.headline).toBe('Image Headline')
  })
})

// ─── Collection Ad Normalization ────────────────────────────

describe('fetchMetaAll() collection ad normalization', () => {
  test('detects collection from template_data', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [makeApiAd({
        creative: {
          id: 'cr_collection',
          name: 'Product Collection',
          object_story_spec: {
            template_data: {
              description: 'Browse our collection',
              format_option: 'collection',
              elements: [{ id: 'elem1' }, { id: 'elem2' }],
            },
          },
        },
      })],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const creative = resources.find(r => r.kind === 'creative')!

    expect(creative.properties.format).toBe('collection')
    expect(creative.properties.instantExperience).toBe('unknown')
    expect(creative.meta?.templateData).toBeDefined()
  })
})

// ─── Full Account Normalization ─────────────────────────────

describe('fetchMetaAll() full account', () => {
  test('handles multiple campaigns with multiple ad sets and ads', async () => {
    const client = createMockClient({
      campaigns: [
        makeApiCampaign({ id: 'camp_1', name: 'Retargeting - US' }),
        makeApiCampaign({ id: 'camp_2', name: 'Cold - Construction' }),
      ],
      adSets: [
        makeApiAdSet({ id: 'adset_1', name: 'Website Visitors', campaign_id: 'camp_1' }),
        makeApiAdSet({ id: 'adset_2', name: 'Lookalike 1%', campaign_id: 'camp_2' }),
      ],
      ads: [
        makeApiAd({ id: 'ad_1', name: 'Hero', adset_id: 'adset_1',
          creative: { ...makeApiAd().creative, id: 'cr_1', name: 'Hero' } }),
        makeApiAd({ id: 'ad_2', name: 'Comparison', adset_id: 'adset_1',
          creative: { ...makeApiAd().creative, id: 'cr_2', name: 'Comparison' } }),
        makeApiAd({ id: 'ad_3', name: 'Demo Video', adset_id: 'adset_2',
          creative: { ...makeApiAd().creative, id: 'cr_3', name: 'Demo Video' } }),
      ],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)

    // 2 campaigns + 2 ad sets + 3 creatives + 3 ads = 10
    expect(resources).toHaveLength(10)

    expect(resources.filter(r => r.kind === 'campaign')).toHaveLength(2)
    expect(resources.filter(r => r.kind === 'adSet')).toHaveLength(2)
    expect(resources.filter(r => r.kind === 'creative')).toHaveLength(3)
    expect(resources.filter(r => r.kind === 'ad')).toHaveLength(3)

    // Check paths are correct — paths use creative name (not ad name)
    const adPaths = resources.filter(r => r.kind === 'ad').map(r => r.path).sort()
    expect(adPaths).toEqual([
      'cold-construction/lookalike-1/demo-video',
      'retargeting-us/website-visitors/comparison',
      'retargeting-us/website-visitors/hero',
    ])
  })

  test('orphan ads (ad set not in response) are excluded', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet({ id: 'adset_1' })],
      ads: [
        makeApiAd({ id: 'ad_1', adset_id: 'adset_1' }),
        makeApiAd({ id: 'ad_orphan', adset_id: 'adset_missing' }),
      ],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const ads = resources.filter(r => r.kind === 'ad')

    // Only the ad with a known ad set should appear
    expect(ads).toHaveLength(1)
    expect(ads[0]!.platformId).toBe('ad_1')
  })

  test('all paths are unique', async () => {
    const client = createMockClient({
      campaigns: [makeApiCampaign()],
      adSets: [makeApiAdSet()],
      ads: [
        makeApiAd({ id: 'ad_1', name: 'Ad One',
          creative: { ...makeApiAd().creative, id: 'cr_1', name: 'Creative One' } }),
        makeApiAd({ id: 'ad_2', name: 'Ad Two',
          creative: { ...makeApiAd().creative, id: 'cr_2', name: 'Creative Two' } }),
      ],
    })

    const resources = await fetchMetaAll(TEST_CONFIG, client)
    const paths = resources.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
