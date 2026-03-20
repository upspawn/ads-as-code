import { describe, test, expect } from 'bun:test'
import { reddit, RedditCampaignBuilder } from '../../src/reddit/index'
import { flattenReddit } from '../../src/reddit/flatten'
import { codegenReddit } from '../../src/reddit/codegen'
import { deduplicateResourceSlugs } from '../../src/core/flatten'
import { diff } from '../../src/core/diff'
import type { Resource } from '../../src/core/types'
import type { RedditCampaign, RedditTargetingRule, RedditBidStrategy } from '../../src/reddit/types'

// ─── Helpers ─────────────────────────────────────────────

/**
 * Simulate the provider.flatten() path: build from builder, flatMap through
 * flattenReddit, then deduplicate slugs — exactly what provider.ts does.
 */
function providerFlatten(campaigns: unknown[]): Resource[] {
  const built = campaigns.map((c) =>
    c instanceof RedditCampaignBuilder ? (c as RedditCampaignBuilder<any>).build() : c as RedditCampaign,
  )
  return deduplicateResourceSlugs(built.flatMap(flattenReddit))
}

/**
 * Build mock fetched resources that look exactly like what fetchRedditAll
 * returns — i.e. resources with platformId and the same property shapes.
 */
function mockFetchedResources(): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'retargeting-us',
      properties: {
        name: 'Retargeting - US',
        objective: 'TRAFFIC',
        status: 'ACTIVE',
        budget: { amount: 50, currency: 'USD', period: 'daily' },
      },
      platformId: 'camp_123',
    },
    {
      kind: 'adGroup',
      path: 'retargeting-us/tech-subreddits',
      properties: {
        name: 'Tech Subreddits',
        status: 'ACTIVE',
        targeting: [
          { _type: 'subreddits', names: ['r/technology', 'r/programming'] },
          { _type: 'geo', locations: ['US'] },
        ],
        optimization: 'LINK_CLICKS',
        bid: { type: 'COST_CAP', amount: 2.5 },
        placement: 'FEED',
      },
      platformId: 'ag_456',
    },
    {
      kind: 'ad',
      path: 'retargeting-us/tech-subreddits/hero-banner',
      properties: {
        format: 'image',
        headline: 'Check out our product',
        clickUrl: 'https://example.com',
        body: 'The best product ever',
        cta: 'LEARN_MORE',
      },
      platformId: 'ad_789',
    },
  ] as Resource[]
}

// ─── Build → Flatten ────────────────────────────────────

describe('reddit integration: build → flatten', () => {
  test('builder produces valid Resources with correct kinds', () => {
    const campaign = reddit.traffic('My Campaign', {
      budget: { amount: 25, currency: 'USD', period: 'daily' },
      status: 'enabled',
    })
      .adGroup('Broad Targeting', {
        targeting: [{ _type: 'interests', names: ['technology'] }] as RedditTargetingRule[],
        bid: { type: 'LOWEST_COST' } as RedditBidStrategy,
      }, [
        { format: 'image', filePath: './hero.jpg', config: { headline: 'Hello', clickUrl: 'https://example.com' } },
      ])

    const resources = providerFlatten([campaign])

    // Should produce 3 resources: campaign + adGroup + ad
    expect(resources).toHaveLength(3)
    expect(resources[0]!.kind).toBe('campaign')
    expect(resources[1]!.kind).toBe('adGroup')
    expect(resources[2]!.kind).toBe('ad')
  })

  test('campaign properties are correctly mapped', () => {
    const campaign = reddit.conversions('Sales Campaign', {
      budget: { amount: 100, currency: 'EUR', period: 'daily' },
      status: 'enabled',
      spendCap: 5000,
    })

    const resources = providerFlatten([campaign])
    const campaignResource = resources[0]!

    expect(campaignResource.properties.name).toBe('Sales Campaign')
    expect(campaignResource.properties.objective).toBe('CONVERSIONS')
    expect(campaignResource.properties.status).toBe('ACTIVE')
    expect(campaignResource.properties.budget).toEqual({ amount: 100, currency: 'EUR', period: 'daily' })
    expect(campaignResource.properties.spendCap).toBe(5000)
  })

  test('ad group properties include targeting, optimization, bid', () => {
    const campaign = reddit.traffic('Test', {})
      .adGroup('My Group', {
        targeting: [
          { _type: 'subreddits', names: ['r/tech'] } as RedditTargetingRule,
          { _type: 'age', min: 18, max: 35 } as RedditTargetingRule,
        ],
        bid: { type: 'COST_CAP', amount: 3 } as RedditBidStrategy,
        placement: 'FEED',
        status: 'enabled',
      }, [])

    const resources = providerFlatten([campaign])
    const adGroup = resources.find((r) => r.kind === 'adGroup')!

    expect(adGroup.properties.name).toBe('My Group')
    expect(adGroup.properties.status).toBe('ACTIVE')
    expect(adGroup.properties.targeting).toEqual([
      { _type: 'subreddits', names: ['r/tech'] },
      { _type: 'age', min: 18, max: 35 },
    ])
    expect(adGroup.properties.bid).toEqual({ type: 'COST_CAP', amount: 3 })
  })

  test('ad paths are nested under campaign/adGroup', () => {
    const campaign = reddit.traffic('My Campaign')
      .adGroup('Group One', {
        targeting: [],
      }, [
        { format: 'image', filePath: './banner.png', config: { headline: 'Hi', clickUrl: 'https://a.com' } },
      ])

    const resources = providerFlatten([campaign])
    const ad = resources.find((r) => r.kind === 'ad')!

    expect(ad.path).toBe('my-campaign/group-one/banner')
    expect(ad.properties.format).toBe('image')
    expect(ad.properties.headline).toBe('Hi')
  })

  test('multiple ad groups produce correct resource tree', () => {
    const campaign = reddit.awareness('Brand Push', {
      budget: { amount: 10, currency: 'USD', period: 'daily' },
    })
      .adGroup('Gamers', { targeting: [] }, [
        { format: 'video', filePath: './intro.mp4', config: { headline: 'Watch', clickUrl: 'https://b.com' } },
      ])
      .adGroup('Tech', { targeting: [] }, [
        { format: 'image', filePath: './tech.jpg', config: { headline: 'Read', clickUrl: 'https://c.com' } },
      ])

    const resources = providerFlatten([campaign])

    // 1 campaign + 2 adGroups + 2 ads = 5
    expect(resources).toHaveLength(5)
    expect(resources.filter((r) => r.kind === 'campaign')).toHaveLength(1)
    expect(resources.filter((r) => r.kind === 'adGroup')).toHaveLength(2)
    expect(resources.filter((r) => r.kind === 'ad')).toHaveLength(2)
  })

  test('deduplicates campaigns with the same slug', () => {
    const a = reddit.traffic('Retargeting')
    const b = reddit.conversions('Retargeting')

    const resources = providerFlatten([a, b])
    const campaigns = resources.filter((r) => r.kind === 'campaign')

    expect(campaigns).toHaveLength(2)
    // One gets the base slug, the other gets -2
    const paths = campaigns.map((c) => c.path).sort()
    expect(paths).toEqual(['retargeting', 'retargeting-2'])
  })
})

// ─── Flatten → Diff = Zero Changes ────────────────────

describe('reddit integration: flatten → diff = zero changes', () => {
  test('identical desired and actual produces empty changeset', () => {
    const campaign = reddit.traffic('My Campaign', {
      budget: { amount: 50, currency: 'USD', period: 'daily' },
      status: 'enabled',
    })
      .adGroup('Tech', {
        targeting: [{ _type: 'subreddits', names: ['r/technology'] }] as RedditTargetingRule[],
      }, [
        { format: 'image', filePath: './hero.jpg', config: { headline: 'Hello', clickUrl: 'https://example.com' } },
      ])

    const desired = providerFlatten([campaign])

    // Simulate "actual" by adding platformIds — diff ignores platformId for comparison
    const actual: Resource[] = desired.map((r, i) => ({
      ...r,
      platformId: `id_${i}`,
    }))

    const managedPaths = new Set(desired.map((r) => r.path))
    const pathToPlatformId = new Map(actual.map((r) => [r.path, r.platformId!]))

    const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

    expect(changeset.creates).toHaveLength(0)
    expect(changeset.updates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)
    expect(changeset.drift).toHaveLength(0)
  })

  test('detects property changes as updates', () => {
    const campaign = reddit.traffic('My Campaign', {
      budget: { amount: 50, currency: 'USD', period: 'daily' },
      status: 'enabled',
    })

    const desired = providerFlatten([campaign])

    // Actual has a different budget
    const actual: Resource[] = desired.map((r) => ({
      ...r,
      platformId: 'camp_1',
      properties: { ...r.properties, budget: { amount: 25, currency: 'USD', period: 'daily' } },
    }))

    const managedPaths = new Set(desired.map((r) => r.path))
    const pathToPlatformId = new Map(actual.map((r) => [r.path, r.platformId!]))

    const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

    expect(changeset.updates.length).toBeGreaterThan(0)
    expect(changeset.creates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)
  })

  test('new resource in desired produces a create', () => {
    const desired: Resource[] = [
      { kind: 'campaign', path: 'new-campaign', properties: { name: 'New', objective: 'TRAFFIC', status: 'ACTIVE' } },
    ]
    const actual: Resource[] = []

    const changeset = diff(desired, actual)

    expect(changeset.creates).toHaveLength(1)
    expect(changeset.creates[0]!.resource.path).toBe('new-campaign')
  })
})

// ─── Round-Trip Concept: Fetch → Codegen → Flatten → Diff ─

describe('reddit integration: round-trip concept', () => {
  test('fetched resources → codegen produces valid TypeScript', () => {
    const fetched = mockFetchedResources()
    const code = codegenReddit(fetched)

    // Codegen should produce valid-looking TypeScript with reddit import
    expect(code).toContain('reddit.traffic')
    expect(code).toContain("'Retargeting - US'")
    expect(code).toContain('adGroup')
    expect(code).toContain('subreddits')
    expect(code).toContain("'Check out our product'")
  })

  test('codegen includes budget and targeting helpers', () => {
    const fetched = mockFetchedResources()
    const code = codegenReddit(fetched)

    // Should include budget helper
    expect(code).toContain('daily(50')
    // Should include geo targeting
    expect(code).toContain('geo(')
    // Should include bidding (cost cap)
    expect(code).toContain('costCap(2.5)')
    // Should include placement
    expect(code).toContain('feed()')
  })

  test('codegen omits default values', () => {
    const fetched: Resource[] = [
      {
        kind: 'campaign',
        path: 'test',
        properties: {
          name: 'Test',
          objective: 'TRAFFIC',
          status: 'PAUSED',
        },
        platformId: 'c1',
        meta: { _defaults: { status: true } },
      } as Resource,
      {
        kind: 'adGroup',
        path: 'test/group',
        properties: {
          name: 'Group',
          status: 'PAUSED',
          targeting: [],
          optimization: 'LINK_CLICKS',
        },
        platformId: 'ag1',
        meta: { _defaults: { status: true } },
      } as Resource,
    ]

    const code = codegenReddit(fetched)

    // Default status should not appear in codegen output
    expect(code).not.toContain("status: 'enabled'")
    expect(code).not.toContain("status: 'paused'")
  })

  test('resources from fetch match flatten output shape', () => {
    // Build a campaign that produces the same resources as our mock fetch
    const campaign = reddit.traffic('Retargeting - US', {
      budget: { amount: 50, currency: 'USD', period: 'daily' },
      status: 'enabled',
    })
      .adGroup('Tech Subreddits', {
        targeting: [
          { _type: 'subreddits', names: ['r/technology', 'r/programming'] },
          { _type: 'geo', locations: ['US'] },
        ] as RedditTargetingRule[],
        optimizationGoal: 'LINK_CLICKS',
        bid: { type: 'COST_CAP', amount: 2.5 } as RedditBidStrategy,
        placement: 'FEED',
        status: 'enabled',
      }, [
        {
          format: 'image' as const,
          filePath: './hero-banner.jpg',
          config: { headline: 'Check out our product', clickUrl: 'https://example.com', body: 'The best product ever', cta: 'LEARN_MORE' as any },
        },
      ])

    const flattenedDesired = providerFlatten([campaign])
    const fetchedActual = mockFetchedResources()

    // Paths should match
    expect(flattenedDesired.map((r) => r.path)).toEqual(fetchedActual.map((r) => r.path))

    // Campaign properties should match
    const desiredCampaign = flattenedDesired.find((r) => r.kind === 'campaign')!
    const actualCampaign = fetchedActual.find((r) => r.kind === 'campaign')!
    expect(desiredCampaign.properties.name).toBe(actualCampaign.properties.name)
    expect(desiredCampaign.properties.objective).toBe(actualCampaign.properties.objective)
    expect(desiredCampaign.properties.status).toBe(actualCampaign.properties.status)
    expect(desiredCampaign.properties.budget).toEqual(actualCampaign.properties.budget)

    // AdGroup properties should match
    const desiredAdGroup = flattenedDesired.find((r) => r.kind === 'adGroup')!
    const actualAdGroup = fetchedActual.find((r) => r.kind === 'adGroup')!
    expect(desiredAdGroup.properties.targeting).toEqual(actualAdGroup.properties.targeting)
    expect(desiredAdGroup.properties.optimization).toBe(actualAdGroup.properties.optimization)
    expect(desiredAdGroup.properties.bid).toEqual(actualAdGroup.properties.bid)

    // Ad properties should match (excluding filePath which is meta)
    const desiredAd = flattenedDesired.find((r) => r.kind === 'ad')!
    const actualAd = fetchedActual.find((r) => r.kind === 'ad')!
    expect(desiredAd.properties.format).toBe(actualAd.properties.format)
    expect(desiredAd.properties.headline).toBe(actualAd.properties.headline)
    expect(desiredAd.properties.clickUrl).toBe(actualAd.properties.clickUrl)
    expect(desiredAd.properties.body).toBe(actualAd.properties.body)
    expect(desiredAd.properties.cta).toBe(actualAd.properties.cta)
  })

  test('flatten output diff against matching fetch = zero changes', () => {
    // This proves that if the platform state matches the code definition,
    // the diff engine produces no changes — the core round-trip guarantee.
    const campaign = reddit.traffic('Retargeting - US', {
      budget: { amount: 50, currency: 'USD', period: 'daily' },
      status: 'enabled',
    })
      .adGroup('Tech Subreddits', {
        targeting: [
          { _type: 'subreddits', names: ['r/technology', 'r/programming'] },
          { _type: 'geo', locations: ['US'] },
        ] as RedditTargetingRule[],
        optimizationGoal: 'LINK_CLICKS',
        bid: { type: 'COST_CAP', amount: 2.5 } as RedditBidStrategy,
        placement: 'FEED',
        status: 'enabled',
      }, [
        {
          format: 'image' as const,
          filePath: './hero-banner.jpg',
          config: { headline: 'Check out our product', clickUrl: 'https://example.com', body: 'The best product ever', cta: 'LEARN_MORE' as any },
        },
      ])

    const desired = providerFlatten([campaign])
    const actual = mockFetchedResources()

    const managedPaths = new Set(desired.map((r) => r.path))
    const pathToPlatformId = new Map(actual.map((r) => [r.path, r.platformId!]))

    const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

    expect(changeset.creates).toHaveLength(0)
    expect(changeset.updates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)
  })
})

// ─── Provider Module Wiring ─────────────────────────────

describe('reddit integration: provider module', () => {
  test('provider module exports flatten, fetchAll, applyChangeset, codegen', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    expect(typeof provider.flatten).toBe('function')
    expect(typeof provider.fetchAll).toBe('function')
    expect(typeof provider.applyChangeset).toBe('function')
    expect(typeof provider.codegen).toBe('function')
    expect(typeof provider.dryRunChangeset).toBe('function')
    expect(typeof provider.postImportFetch).toBe('function')
  })

  test('provider.flatten works with builder instances', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    const campaign = reddit.traffic('Test Campaign')
      .adGroup('Group', { targeting: [] }, [
        { format: 'image', filePath: './test.jpg', config: { headline: 'Test', clickUrl: 'https://test.com' } },
      ])

    const resources = provider.flatten([campaign])

    expect(resources).toHaveLength(3)
    expect(resources[0]!.kind).toBe('campaign')
    expect(resources[0]!.properties.name).toBe('Test Campaign')
  })

  test('provider.flatten works with plain campaign objects', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    const campaign: RedditCampaign = {
      provider: 'reddit',
      kind: 'traffic',
      name: 'Plain Campaign',
      config: { status: 'enabled' },
      adGroups: [],
    }

    const resources = provider.flatten([campaign])

    expect(resources).toHaveLength(1)
    expect(resources[0]!.properties.name).toBe('Plain Campaign')
  })

  test('provider.codegen produces TypeScript from resources', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    const resources = mockFetchedResources()
    const code = provider.codegen(resources, 'retargeting-us')

    expect(code).toContain('reddit.traffic')
    expect(code).toContain("'Retargeting - US'")
  })

  test('provider.fetchAll throws when reddit config is missing', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    await expect(provider.fetchAll({ project: 'test' } as any, {} as any))
      .rejects.toThrow('Reddit provider config missing')
  })

  test('provider.applyChangeset throws when reddit config is missing', async () => {
    const mod = await import('../../src/reddit/provider')
    const provider = mod.default

    const changeset = { creates: [], updates: [], deletes: [], drift: [] }
    await expect(provider.applyChangeset(changeset, { project: 'test' } as any, {} as any, 'test'))
      .rejects.toThrow('Reddit provider config missing')
  })

  test('provider is registered in PROVIDERS', async () => {
    const { getProvider } = await import('../../src/core/providers')
    const provider = await getProvider('reddit')

    expect(typeof provider.flatten).toBe('function')
    expect(typeof provider.fetchAll).toBe('function')
  })
})
