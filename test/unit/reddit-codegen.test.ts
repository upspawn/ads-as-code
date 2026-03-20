import { describe, test, expect } from 'bun:test'
import { codegenReddit } from '../../src/reddit/codegen'
import type { Resource } from '../../src/core/types'

// ---------------------------------------------------------------------------
// Helpers — build Resources matching what flatten/fetch would produce
// ---------------------------------------------------------------------------

function campaignResource(
  name: string,
  objective: string,
  overrides: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
): Resource {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return {
    kind: 'campaign',
    path: slug,
    properties: {
      name,
      objective,
      status: 'PAUSED',
      ...overrides,
    },
    meta,
  }
}

function adGroupResource(
  campaignSlug: string,
  name: string,
  overrides: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
): Resource {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return {
    kind: 'adGroup',
    path: `${campaignSlug}/${slug}`,
    properties: {
      name,
      status: 'PAUSED',
      placement: 'ALL',
      optimizationGoal: 'LINK_CLICKS',
      targeting: [],
      ...overrides,
    },
    meta,
  }
}

function adResource(
  campaignSlug: string,
  adGroupSlug: string,
  name: string,
  format: string,
  overrides: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
): Resource {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return {
    kind: 'ad',
    path: `${campaignSlug}/${adGroupSlug}/${slug}`,
    properties: {
      name,
      format,
      status: 'PAUSED',
      ...overrides,
    },
    meta,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reddit codegen', () => {
  test('single campaign with one ad group and one image ad', () => {
    const resources: Resource[] = [
      campaignResource('My Traffic Campaign', 'TRAFFIC', {
        budget: { amount: 50, currency: 'USD', period: 'daily' },
      }),
      adGroupResource('my-traffic-campaign', 'US Audience', {
        targeting: [
          { _type: 'geo', locations: ['US'] },
          { _type: 'interests', names: ['technology', 'gaming'] },
        ],
        bid: { type: 'MANUAL_BID', amount: 150_000 },
      }),
      adResource('my-traffic-campaign', 'us-audience', 'Hero Image', 'image', {
        filePath: './assets/hero.jpg',
        headline: 'Check this out',
        body: 'Amazing product',
        clickUrl: 'https://example.com',
        cta: 'LEARN_MORE',
      }),
    ]

    const code = codegenReddit(resources)

    // Should contain reddit import
    expect(code).toContain("import {")
    expect(code).toContain("from '@upspawn/ads'")
    expect(code).toContain('reddit')

    // Should use reddit.traffic()
    expect(code).toContain("reddit.traffic('My Traffic Campaign'")

    // Should have budget
    expect(code).toContain('daily(50')

    // Should have .adGroup() call
    expect(code).toContain(".adGroup('US Audience'")

    // Should have targeting
    expect(code).toContain("geo('US')")
    expect(code).toContain("interests('technology', 'gaming')")

    // Should have bidding
    expect(code).toContain('manualBid(150000)')

    // Should have image ad
    expect(code).toContain("image('./assets/hero.jpg'")
    expect(code).toContain("headline: 'Check this out'")
    expect(code).toContain("clickUrl: 'https://example.com'")
    expect(code).toContain("cta: 'LEARN_MORE'")
  })

  test('omits default values (status=PAUSED, default optimization, placement=ALL)', () => {
    const resources: Resource[] = [
      campaignResource('Defaults Campaign', 'TRAFFIC', {
        status: 'PAUSED',
      }, {
        _defaults: { status: true },
      }),
      adGroupResource('defaults-campaign', 'Default Group', {
        status: 'PAUSED',
        placement: 'ALL',
        optimizationGoal: 'LINK_CLICKS',
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }, {
        _defaults: { status: true, placement: true, optimizationGoal: true },
      }),
    ]

    const code = codegenReddit(resources)

    // Should NOT contain status since it's the default
    expect(code).not.toMatch(/status:\s*'PAUSED'/)
    expect(code).not.toMatch(/status:\s*'paused'/)

    // Should NOT contain placement since ALL is default
    expect(code).not.toContain("placement:")

    // Should NOT contain optimizationGoal since LINK_CLICKS is default for traffic
    expect(code).not.toContain("optimizationGoal:")
  })

  test('includes non-default status', () => {
    const resources: Resource[] = [
      campaignResource('Active Campaign', 'TRAFFIC', {
        status: 'ACTIVE',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("status: 'enabled'")
  })

  test('multiple ad groups produce chained .adGroup() calls', () => {
    const resources: Resource[] = [
      campaignResource('Multi Group', 'ENGAGEMENT'),
      adGroupResource('multi-group', 'Group A', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adGroupResource('multi-group', 'Group B', {
        targeting: [{ _type: 'subreddits', names: ['technology'] }],
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain(".adGroup('Group A'")
    expect(code).toContain(".adGroup('Group B'")
  })

  test('only imports used helpers', () => {
    const resources: Resource[] = [
      campaignResource('Import Test', 'TRAFFIC', {
        budget: { amount: 100, currency: 'USD', period: 'daily' },
      }),
      adGroupResource('import-test', 'Test Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('daily')
    expect(code).toContain('geo')
    expect(code).toContain('reddit')
    // Should NOT import helpers we didn't use
    expect(code).not.toContain('manualBid')
    expect(code).not.toContain('costCap')
    expect(code).not.toContain('subreddits')
  })

  test('video ad format', () => {
    const resources: Resource[] = [
      campaignResource('Video Campaign', 'VIDEO_VIEWS'),
      adGroupResource('video-campaign', 'Video Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('video-campaign', 'video-group', 'Promo Video', 'video', {
        filePath: './assets/promo.mp4',
        headline: 'Watch Now',
        clickUrl: 'https://example.com',
        thumbnail: './assets/thumb.jpg',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("video('./assets/promo.mp4'")
    expect(code).toContain("headline: 'Watch Now'")
    expect(code).toContain("thumbnail: './assets/thumb.jpg'")
  })

  test('carousel ad format', () => {
    const resources: Resource[] = [
      campaignResource('Carousel Campaign', 'TRAFFIC'),
      adGroupResource('carousel-campaign', 'Carousel Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('carousel-campaign', 'carousel-group', 'My Carousel', 'carousel', {
        cards: [
          { image: './card1.jpg', headline: 'Card 1', url: 'https://example.com/1' },
          { image: './card2.jpg', headline: 'Card 2', url: 'https://example.com/2' },
        ],
        clickUrl: 'https://example.com',
        cta: 'SHOP_NOW',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('carousel(')
    expect(code).toContain("headline: 'Card 1'")
    expect(code).toContain("headline: 'Card 2'")
  })

  test('freeform ad format', () => {
    const resources: Resource[] = [
      campaignResource('Freeform Campaign', 'ENGAGEMENT'),
      adGroupResource('freeform-campaign', 'Free Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('freeform-campaign', 'free-group', 'Custom Post', 'freeform', {
        headline: 'Big Announcement',
        body: 'Check out our new product line',
        images: ['./img1.jpg', './img2.jpg'],
        clickUrl: 'https://example.com',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('freeform(')
    expect(code).toContain("headline: 'Big Announcement'")
    expect(code).toContain("body: 'Check out our new product line'")
  })

  test('product ad format', () => {
    const resources: Resource[] = [
      campaignResource('Product Campaign', 'CONVERSIONS'),
      adGroupResource('product-campaign', 'Product Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('product-campaign', 'product-group', 'Catalog Ad', 'product', {
        catalogId: 'cat_123',
        headline: 'Shop Our Collection',
        clickUrl: 'https://example.com/shop',
        cta: 'SHOP_NOW',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('product(')
    expect(code).toContain("catalogId: 'cat_123'")
    expect(code).toContain("headline: 'Shop Our Collection'")
  })

  test('all targeting rule types generate correct helpers', () => {
    const resources: Resource[] = [
      campaignResource('Targeting Test', 'TRAFFIC'),
      adGroupResource('targeting-test', 'Full Targeting', {
        targeting: [
          { _type: 'geo', locations: ['US', 'CA'] },
          { _type: 'subreddits', names: ['technology', 'programming'] },
          { _type: 'interests', names: ['tech'] },
          { _type: 'keywords', terms: ['saas', 'software'] },
          { _type: 'age', min: 18, max: 34 },
          { _type: 'gender', value: 'all' },
          { _type: 'device', types: ['mobile', 'desktop'] },
          { _type: 'os', types: ['ios', 'android'] },
          { _type: 'customAudience', id: 'aud_123' },
          { _type: 'expansion', enabled: true },
        ],
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("geo('US', 'CA')")
    expect(code).toContain("subreddits('technology', 'programming')")
    expect(code).toContain("interests('tech')")
    expect(code).toContain("keywords('saas', 'software')")
    expect(code).toContain("age(18, 34)")
    expect(code).toContain("gender('all')")
    expect(code).toContain("device('mobile', 'desktop')")
    expect(code).toContain("os('ios', 'android')")
    expect(code).toContain("customAudience('aud_123')")
    expect(code).toContain("expansion(true)")
  })

  test('bidding strategies codegen correctly', () => {
    const resources: Resource[] = [
      campaignResource('Bid Campaign', 'TRAFFIC'),
      adGroupResource('bid-campaign', 'Lowest', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
        bid: { type: 'LOWEST_COST' },
      }, { _defaults: { bid: true } }),
      adGroupResource('bid-campaign', 'Cost Cap', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
        bid: { type: 'COST_CAP', amount: 500_000 },
      }),
      adGroupResource('bid-campaign', 'Manual', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
        bid: { type: 'MANUAL_BID', amount: 200_000 },
      }),
    ]

    const code = codegenReddit(resources)
    // LOWEST_COST with _defaults should be omitted
    expect(code).toContain('costCap(500000)')
    expect(code).toContain('manualBid(200000)')
  })

  test('schedule with dayparting', () => {
    const resources: Resource[] = [
      campaignResource('Schedule Campaign', 'TRAFFIC'),
      adGroupResource('schedule-campaign', 'Scheduled Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
        schedule: {
          start: '2026-04-01',
          end: '2026-04-30',
          dayparting: [
            { days: ['mon', 'tue', 'wed'], startHour: 9, endHour: 17 },
          ],
        },
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("start: '2026-04-01'")
    expect(code).toContain("end: '2026-04-30'")
    expect(code).toContain('dayparting')
  })

  test('FEED placement is emitted when non-default', () => {
    const resources: Resource[] = [
      campaignResource('Placement Campaign', 'TRAFFIC'),
      adGroupResource('placement-campaign', 'Feed Only', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
        placement: 'FEED',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("placement: feed()")
  })

  test('multiple campaigns generate separate export blocks', () => {
    const resources: Resource[] = [
      campaignResource('Campaign A', 'TRAFFIC'),
      campaignResource('Campaign B', 'LEAD_GENERATION'),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("reddit.traffic('Campaign A'")
    expect(code).toContain("reddit.leads('Campaign B'")
    expect(code).toContain('export const campaignA')
    expect(code).toContain('export const campaignB')
  })

  test('objective mapping covers all types', () => {
    const objectives: [string, string][] = [
      ['BRAND_AWARENESS_AND_REACH', 'awareness'],
      ['TRAFFIC', 'traffic'],
      ['ENGAGEMENT', 'engagement'],
      ['VIDEO_VIEWS', 'videoViews'],
      ['APP_INSTALLS', 'appInstalls'],
      ['CONVERSIONS', 'conversions'],
      ['LEAD_GENERATION', 'leads'],
    ]

    for (const [apiObj, method] of objectives) {
      const resources: Resource[] = [
        campaignResource(`Test ${method}`, apiObj),
      ]
      const code = codegenReddit(resources)
      expect(code).toContain(`reddit.${method}(`)
    }
  })

  test('export name handles numeric-prefixed campaign names', () => {
    const resources: Resource[] = [
      campaignResource('123 Campaign', 'TRAFFIC'),
    ]

    const code = codegenReddit(resources)
    // JS identifiers cannot start with a digit — should be prefixed with underscore
    expect(code).toContain('export const _123Campaign')
  })

  test('freeform ad format includes images and videos arrays', () => {
    const resources: Resource[] = [
      campaignResource('Freeform Full', 'ENGAGEMENT'),
      adGroupResource('freeform-full', 'Rich Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('freeform-full', 'rich-group', 'Rich Post', 'freeform', {
        headline: 'Announcement',
        body: 'Full details here',
        images: ['./img1.jpg', './img2.jpg'],
        videos: ['./vid1.mp4'],
        clickUrl: 'https://example.com',
        cta: 'LEARN_MORE',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('freeform({')
    expect(code).toContain("headline: 'Announcement'")
    expect(code).toContain("body: 'Full details here'")
    expect(code).toContain("images: ['./img1.jpg', './img2.jpg']")
    expect(code).toContain("videos: ['./vid1.mp4']")
    expect(code).toContain("clickUrl: 'https://example.com'")
    expect(code).toContain("cta: 'LEARN_MORE'")
  })

  test('product ad format includes catalogId and all fields', () => {
    const resources: Resource[] = [
      campaignResource('Product Full', 'CONVERSIONS'),
      adGroupResource('product-full', 'Catalog Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
      adResource('product-full', 'catalog-group', 'Catalog Ad', 'product', {
        catalogId: 'cat_abc',
        headline: 'Our Best Products',
        clickUrl: 'https://shop.example.com',
        cta: 'SHOP_NOW',
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('product({')
    expect(code).toContain("catalogId: 'cat_abc'")
    expect(code).toContain("headline: 'Our Best Products'")
    expect(code).toContain("clickUrl: 'https://shop.example.com'")
    expect(code).toContain("cta: 'SHOP_NOW'")
  })

  test('monthly budget uses monthly() helper', () => {
    const resources: Resource[] = [
      campaignResource('Monthly Budget Campaign', 'TRAFFIC', {
        budget: { amount: 300, currency: 'USD', period: 'monthly' },
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain('monthly(300)')
    expect(code).toContain('monthly')
  })

  test('campaign with ad group but no ads generates empty ads array', () => {
    const resources: Resource[] = [
      campaignResource('Empty Ads Campaign', 'TRAFFIC', {
        budget: { amount: 10, currency: 'USD', period: 'daily' },
      }),
      adGroupResource('empty-ads-campaign', 'No Ads Group', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain(".adGroup('No Ads Group'")
    // Should end with empty ads array
    expect(code).toContain(', [])')
    // Should still build
    expect(code).toContain('.build()')
  })

  test('lookalike targeting', () => {
    const resources: Resource[] = [
      campaignResource('LAL Campaign', 'TRAFFIC'),
      adGroupResource('lal-campaign', 'LAL Group', {
        targeting: [
          { _type: 'lookalike', sourceId: 'src_456', config: { country: 'US', ratio: 0.05 } },
        ],
      }),
    ]

    const code = codegenReddit(resources)
    expect(code).toContain("lookalike('src_456'")
    expect(code).toContain("country: 'US'")
    expect(code).toContain("ratio: 0.05")
  })
})
