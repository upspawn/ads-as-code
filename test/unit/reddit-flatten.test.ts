import { describe, test, expect } from 'bun:test'
import { flattenReddit } from '../../src/reddit/flatten'
import type { RedditCampaign } from '../../src/reddit/types'

// ─── Fixtures ─────────────────────────────────────────────

function makeCampaign(overrides?: Partial<RedditCampaign>): RedditCampaign {
  return {
    provider: 'reddit',
    kind: 'traffic',
    name: 'My Campaign',
    config: {},
    adGroups: [],
    ...overrides,
  }
}

describe('flattenReddit', () => {
  describe('campaign resource', () => {
    test('produces a single campaign resource for empty campaign', () => {
      const resources = flattenReddit(makeCampaign())
      expect(resources).toHaveLength(1)
      expect(resources[0]!.kind).toBe('campaign')
      expect(resources[0]!.path).toBe('my-campaign')
    })

    test('maps objective using OBJECTIVE_MAP', () => {
      const resources = flattenReddit(makeCampaign({ kind: 'conversions' }))
      expect(resources[0]!.properties.objective).toBe('CONVERSIONS')
    })

    test('defaults status to PAUSED and tracks in _defaults', () => {
      const resources = flattenReddit(makeCampaign())
      expect(resources[0]!.properties.status).toBe('PAUSED')
      expect(resources[0]!.meta?._defaults).toContain('status')
    })

    test('uses explicit status when provided', () => {
      const resources = flattenReddit(makeCampaign({ config: { status: 'enabled' } }))
      expect(resources[0]!.properties.status).toBe('ACTIVE')
      expect(resources[0]!.meta?._defaults ?? []).not.toContain('status')
    })

    test('includes budget when provided', () => {
      const budget = { amount: 50, currency: 'USD' as const, period: 'daily' as const }
      const resources = flattenReddit(makeCampaign({ config: { budget } }))
      expect(resources[0]!.properties.budget).toEqual(budget)
    })

    test('includes spendCap when provided', () => {
      const resources = flattenReddit(makeCampaign({ config: { spendCap: 1000 } }))
      expect(resources[0]!.properties.spendCap).toBe(1000)
    })

    test('slugifies campaign name', () => {
      const resources = flattenReddit(makeCampaign({ name: 'My Awesome Campaign!!!' }))
      expect(resources[0]!.path).toBe('my-awesome-campaign')
    })
  })

  describe('ad group resources', () => {
    test('produces ad group with campaign/adgroup path', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'Tech Lovers',
          config: { targeting: [{ _type: 'subreddits', names: ['r/tech'] }] },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')
      expect(adGroup).toBeDefined()
      expect(adGroup!.path).toBe('my-campaign/tech-lovers')
    })

    test('defaults adGroup status to PAUSED', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.status).toBe('PAUSED')
      expect(adGroup.meta?._defaults).toContain('status')
    })

    test('uses explicit adGroup status', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }], status: 'enabled' },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.status).toBe('ACTIVE')
    })

    test('defaults optimization goal from DEFAULT_OPTIMIZATION', () => {
      const resources = flattenReddit(makeCampaign({
        kind: 'traffic',
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.optimization).toBe('LINK_CLICKS')
      expect(adGroup.meta?._defaults).toContain('optimization')
    })

    test('uses explicit optimization goal', () => {
      const resources = flattenReddit(makeCampaign({
        kind: 'traffic',
        adGroups: [{
          name: 'AG1',
          config: {
            targeting: [{ _type: 'geo', locations: ['US'] }],
            optimizationGoal: 'LANDING_PAGE_VIEWS',
          },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.optimization).toBe('LANDING_PAGE_VIEWS')
      expect(adGroup.meta?._defaults ?? []).not.toContain('optimization')
    })

    test('includes targeting rules', () => {
      const targeting = [
        { _type: 'subreddits' as const, names: ['r/technology'] },
        { _type: 'geo' as const, locations: ['US'] },
      ]
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.targeting).toEqual(targeting)
    })

    test('includes bid strategy when provided', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: {
            targeting: [{ _type: 'geo', locations: ['US'] }],
            bid: { type: 'COST_CAP', amount: 5.00 },
          },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.bid).toEqual({ type: 'COST_CAP', amount: 5.00 })
    })

    test('includes placement when provided', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: {
            targeting: [{ _type: 'geo', locations: ['US'] }],
            placement: 'FEED',
          },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.placement).toBe('FEED')
    })

    test('includes schedule when provided', () => {
      const schedule = { start: '2026-04-01', end: '2026-05-01' }
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: {
            targeting: [{ _type: 'geo', locations: ['US'] }],
            schedule,
          },
          ads: [],
        }],
      }))
      const adGroup = resources.find(r => r.kind === 'adGroup')!
      expect(adGroup.properties.schedule).toEqual(schedule)
    })
  })

  describe('ad resources', () => {
    test('produces ad with campaign/adgroup/ad-name path', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'image',
            filePath: './hero.jpg',
            config: { headline: 'Check this', clickUrl: 'https://example.com' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')
      expect(ad).toBeDefined()
      // Ad name derived from file path: hero.jpg -> hero
      expect(ad!.path).toBe('my-campaign/ag1/hero')
    })

    test('includes ad format and properties', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'image',
            filePath: './hero.jpg',
            config: { headline: 'Title', body: 'Body', clickUrl: 'https://example.com', cta: 'LEARN_MORE' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.properties.format).toBe('image')
      expect(ad.properties.headline).toBe('Title')
      expect(ad.properties.body).toBe('Body')
      expect(ad.properties.clickUrl).toBe('https://example.com')
      expect(ad.properties.cta).toBe('LEARN_MORE')
    })

    test('stores filePath in meta for image ads', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'image',
            filePath: './hero.jpg',
            config: { headline: 'Title', clickUrl: 'https://example.com' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.meta?.filePath).toBe('./hero.jpg')
    })

    test('stores filePath in meta for video ads', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'video',
            filePath: './demo.mp4',
            config: { headline: 'Watch', clickUrl: 'https://example.com' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.meta?.filePath).toBe('./demo.mp4')
    })

    test('carousel ad uses content-hash-based name', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'carousel',
            cards: [
              { image: './a.jpg', headline: 'A', url: 'https://a.com' },
              { image: './b.jpg', headline: 'B', url: 'https://b.com' },
            ],
            config: {},
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      // Should have a deterministic path based on carousel content
      expect(ad.path).toMatch(/^my-campaign\/ag1\/carousel-/)
    })

    test('freeform ad derives name from headline', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'freeform',
            config: { headline: 'My Freeform Post', body: 'Content' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.path).toBe('my-campaign/ag1/my-freeform-post')
    })

    test('product ad derives name from headline', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [{
            format: 'product',
            config: { catalogId: 'cat_1', headline: 'Shop Products' },
          }],
        }],
      }))
      const ad = resources.find(r => r.kind === 'ad')!
      expect(ad.path).toBe('my-campaign/ag1/shop-products')
    })
  })

  describe('resource ordering', () => {
    test('produces resources in correct order: campaign, adGroup, ads', () => {
      const resources = flattenReddit(makeCampaign({
        adGroups: [
          {
            name: 'AG1',
            config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
            ads: [
              { format: 'image', filePath: './a.jpg', config: { headline: 'A', clickUrl: 'https://a.com' } },
              { format: 'image', filePath: './b.jpg', config: { headline: 'B', clickUrl: 'https://b.com' } },
            ],
          },
          {
            name: 'AG2',
            config: { targeting: [{ _type: 'geo', locations: ['DE'] }] },
            ads: [
              { format: 'video', filePath: './c.mp4', config: { headline: 'C', clickUrl: 'https://c.com' } },
            ],
          },
        ],
      }))

      const kinds = resources.map(r => r.kind)
      expect(kinds).toEqual(['campaign', 'adGroup', 'ad', 'ad', 'adGroup', 'ad'])
    })
  })

  describe('determinism', () => {
    test('same input always produces same output', () => {
      const campaign = makeCampaign({
        adGroups: [{
          name: 'AG1',
          config: { targeting: [{ _type: 'geo', locations: ['US'] }] },
          ads: [
            { format: 'image', filePath: './hero.jpg', config: { headline: 'Title', clickUrl: 'https://example.com' } },
          ],
        }],
      })

      const a = flattenReddit(campaign)
      const b = flattenReddit(campaign)
      expect(a).toEqual(b)
    })
  })
})
