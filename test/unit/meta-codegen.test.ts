import { describe, expect, test } from 'bun:test'
import { codegenMeta, metaCampaignToFilename } from '../../src/meta/codegen.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Test Data Builders ─────────────────────────────────

function makeMetaCampaign(overrides: Partial<Resource['properties']> = {}): Resource {
  return {
    kind: 'campaign',
    path: 'retargeting-us',
    properties: {
      name: 'Retargeting - US',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      budget: { amount: 5, currency: 'EUR', period: 'daily' },
      ...overrides,
    },
  }
}

function makeAdSet(
  path: string,
  name: string,
  overrides: Partial<Resource['properties']> = {},
): Resource {
  return {
    kind: 'adSet',
    path,
    properties: {
      name,
      status: 'PAUSED',
      targeting: {
        geo: [{ type: 'geo', countries: ['US', 'GB'] }],
        age: { min: 25, max: 65 },
      },
      optimization: 'LINK_CLICKS', // default for traffic
      bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
      placements: 'automatic',
      ...overrides,
    },
  }
}

function makeCreative(
  path: string,
  overrides: Partial<Resource['properties']> = {},
  metaOverrides: Record<string, unknown> = {},
): Resource {
  return {
    kind: 'creative',
    path,
    properties: {
      name: 'hero',
      format: 'image',
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually.',
      cta: 'SIGN_UP',
      url: 'https://renamed.to',
      ...overrides,
    },
    meta: {
      imagePath: './assets/imported/hero-abc123.png',
      ...metaOverrides,
    },
  }
}

// ─── Tests ──────────────────────────────────────────────

describe('metaCampaignToFilename', () => {
  test('slugifies campaign name', () => {
    expect(metaCampaignToFilename('Retargeting - US')).toBe('retargeting-us')
    expect(metaCampaignToFilename('Cold Traffic: High Intent')).toBe('cold-traffic-high-intent')
  })
})

describe('codegenMeta', () => {
  test('simple campaign with one ad set and one ad', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/website-visitors-30d', 'Website Visitors 30d'),
      makeCreative('retargeting-us/website-visitors-30d/hero/cr'),
    ]

    const code = codegenMeta(resources)

    // Should contain the import
    expect(code).toContain("from '@upspawn/ads'")
    // Should contain meta.traffic entry point
    expect(code).toContain("meta.traffic('Retargeting - US'")
    // Should contain daily budget
    expect(code).toContain('daily(5)')
    // Should contain .adSet chain
    expect(code).toContain(".adSet('Website Visitors 30d'")
    // Should contain targeting
    expect(code).toContain("targeting(geo('US', 'GB'), age(25, 65))")
    // Should contain the image creative
    expect(code).toContain("image('./assets/imported/hero-abc123.png'")
    expect(code).toContain("headline: 'Rename Files Instantly'")
    expect(code).toContain("primaryText: 'Stop wasting hours organizing files manually.'")
  })

  test('default omission — bidding (LOWEST_COST_WITHOUT_CAP)', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    // Should NOT contain lowestCost — it's the default
    expect(code).not.toContain('lowestCost')
    expect(code).not.toContain('bidding:')
  })

  test('non-default bidding is emitted', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        bidding: { type: 'COST_CAP', cap: 10 },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain('bidding: costCap(10)')
    expect(code).toContain('costCap')
    // costCap should be in imports
    expect(code).toMatch(/import.*costCap.*from/)
  })

  test('default omission — placements (automatic)', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        placements: 'automatic',
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).not.toContain('placements:')
    expect(code).not.toContain('automatic')
  })

  test('non-default placements are emitted', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        placements: {
          platforms: ['facebook', 'instagram'],
          positions: ['feed', 'story'],
        },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain('placements: manual(')
    expect(code).toContain("'facebook'")
    expect(code).toContain("'instagram'")
  })

  test('default omission — optimization matching objective default', () => {
    // Traffic objective default = LINK_CLICKS
    const resources: Resource[] = [
      makeMetaCampaign({ objective: 'OUTCOME_TRAFFIC' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        optimization: 'LINK_CLICKS',
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).not.toContain('optimization:')
  })

  test('non-default optimization is emitted', () => {
    // LANDING_PAGE_VIEWS is not the default for traffic (LINK_CLICKS is)
    const resources: Resource[] = [
      makeMetaCampaign({ objective: 'OUTCOME_TRAFFIC' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        optimization: 'LANDING_PAGE_VIEWS',
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("optimization: 'LANDING_PAGE_VIEWS'")
  })

  test('default omission — status PAUSED', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ status: 'PAUSED' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        status: 'PAUSED',
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    // Status should be omitted for both campaign and ad set
    expect(code).not.toContain("status:")
  })

  test('ACTIVE status is emitted', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ status: 'ACTIVE' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        status: 'ACTIVE',
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("status: 'ACTIVE'")
  })

  test('URL/CTA hoisting — all ads share same url and cta', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      makeCreative('retargeting-us/visitors/hero/cr', {
        url: 'https://renamed.to',
        cta: 'SIGN_UP',
      }),
      makeCreative('retargeting-us/visitors/comparison/cr', {
        name: 'comparison',
        image: './assets/imported/comparison.png',
        headline: 'Before & After',
        primaryText: 'See the difference.',
        url: 'https://renamed.to',
        cta: 'SIGN_UP',
      }),
    ]

    const code = codegenMeta(resources)

    // URL and CTA should appear once at the ad set content level
    // Count occurrences — should be hoisted, not repeated per ad
    const urlMatches = code.match(/url: 'https:\/\/renamed\.to'/g)
    const ctaMatches = code.match(/cta: 'SIGN_UP'/g)

    // Hoisted: appears once at content level, not in individual ads
    expect(urlMatches?.length).toBe(1)
    expect(ctaMatches?.length).toBe(1)
  })

  test('URL/CTA not hoisted when ads differ', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      makeCreative('retargeting-us/visitors/hero/cr', {
        url: 'https://renamed.to',
        cta: 'SIGN_UP',
      }),
      makeCreative('retargeting-us/visitors/comparison/cr', {
        name: 'comparison',
        image: './assets/imported/comparison.png',
        headline: 'Before & After',
        primaryText: 'See the difference.',
        url: 'https://renamed.to/tour',
        cta: 'LEARN_MORE',
      }),
    ]

    const code = codegenMeta(resources)

    // Both URLs should appear — different values, not hoisted
    expect(code).toContain("'https://renamed.to'")
    expect(code).toContain("'https://renamed.to/tour'")
    expect(code).toContain("'SIGN_UP'")
    expect(code).toContain("'LEARN_MORE'")
  })

  test('import statement only includes used helpers', () => {
    // Simple campaign: just meta, daily, targeting, geo, age, image
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    // Extract the import line
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).toContain('meta')
    expect(importLine).toContain('daily')
    expect(importLine).toContain('targeting')
    expect(importLine).toContain('geo')
    expect(importLine).toContain('age')
    expect(importLine).toContain('metaImage as image')

    // Should NOT contain unused helpers
    expect(importLine).not.toContain('metaVideo')
    expect(importLine).not.toContain('costCap')
    expect(importLine).not.toContain('bidCap')
    expect(importLine).not.toContain('manual')
    expect(importLine).not.toContain('lowestCost')
  })

  test('video creative uses video helper', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      {
        kind: 'creative',
        path: 'retargeting-us/visitors/demo/cr',
        properties: {
          name: 'demo',
          format: 'video',
          headline: 'See It In Action',
          primaryText: 'Watch the demo.',
          cta: 'WATCH_MORE',
          url: 'https://renamed.to',
        },
        meta: {
          videoPath: './assets/imported/demo.mp4',
        },
      },
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("video('./assets/imported/demo.mp4'")
    expect(code).toContain("headline: 'See It In Action'")
    // import should include video, not image
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).toContain('metaVideo as video')
    expect(importLine).not.toContain('metaImage')
  })

  test('multiple ad sets generate correct chaining', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors-30d', 'Website Visitors 30d'),
      makeCreative('retargeting-us/visitors-30d/hero/cr'),
      makeAdSet('retargeting-us/cart-abandoners', 'Cart Abandoners', {
        targeting: {
          geo: [{ type: 'geo', countries: ['US'] }],
        },
        optimization: 'LANDING_PAGE_VIEWS', // non-default
      }),
      makeCreative('retargeting-us/cart-abandoners/urgency/cr', {
        name: 'urgency',
        image: './assets/imported/urgency.png',
        headline: 'Complete Your Setup',
        primaryText: 'Your files are waiting.',
        url: 'https://renamed.to/pricing',
        cta: 'SIGN_UP',
      }),
    ]

    const code = codegenMeta(resources)

    // Both ad sets should appear as chained .adSet() calls
    expect(code).toContain(".adSet('Website Visitors 30d'")
    expect(code).toContain(".adSet('Cart Abandoners'")

    // The second ad set's non-default optimization should appear
    expect(code).toContain("optimization: 'LANDING_PAGE_VIEWS'")

    // Both creatives should appear
    expect(code).toContain("'Rename Files Instantly'")
    expect(code).toContain("'Complete Your Setup'")
  })

  test('sales objective maps to meta.sales()', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ objective: 'OUTCOME_SALES' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        optimization: 'OFFSITE_CONVERSIONS', // default for sales
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("meta.sales('Retargeting - US'")
    // Default optimization should be omitted
    expect(code).not.toContain('optimization:')
  })

  test('awareness objective maps to meta.awareness()', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ objective: 'OUTCOME_AWARENESS' }),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        optimization: 'REACH', // default for awareness
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("meta.awareness('Retargeting - US'")
  })

  test('bid cap bidding emits bidCap helper', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        bidding: { type: 'BID_CAP', cap: 5 },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain('bidding: bidCap(5)')
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).toContain('bidCap')
  })

  test('minRoas bidding emits minRoas helper', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        bidding: { type: 'MINIMUM_ROAS', floor: 2.5 },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain('bidding: minRoas(2.5)')
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).toContain('minRoas')
  })

  test('interests in targeting are emitted with explicit ids', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        targeting: {
          geo: [{ type: 'geo', countries: ['US'] }],
          interests: [
            { id: '6003370250981', name: 'Construction' },
            { id: '6003020834693', name: 'BIM' },
          ],
        },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("interests(")
    expect(code).toContain("id: '6003370250981'")
    expect(code).toContain("name: 'Construction'")
  })

  test('campaign with no ad sets produces valid output', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("meta.traffic('Retargeting - US'")
    expect(code).toContain('daily(5)')
    // Should still be valid TS — no adSet chains
    expect(code).not.toContain('.adSet')
  })

  test('USD currency is emitted explicitly', () => {
    const resources: Resource[] = [
      makeMetaCampaign({
        budget: { amount: 10, currency: 'USD', period: 'daily' },
      }),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("daily(10, 'USD')")
  })

  test('export variable name is camelCase slug', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ name: 'Cold Traffic - High Intent' }),
    ]

    // The export should be camelCase
    const code = codegenMeta(resources)
    expect(code).toContain('export const coldTrafficHighIntent')
  })

  test('export name handles hyphens before digits (e.g. Feb 2026)', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ name: 'Cold - Accounting Vertical - Feb 2026' }),
    ]

    const code = codegenMeta(resources)

    // Slugify produces "cold-accounting-vertical-feb-2026"
    // CamelCase must also handle -2 (hyphen before digit)
    expect(code).toContain('export const coldAccountingVerticalFeb2026')
    // Must NOT contain a bare hyphen in the identifier
    expect(code).not.toMatch(/export const [a-zA-Z0-9]*-/)
  })

  test('export name prefixed with underscore when starting with digit', () => {
    const resources: Resource[] = [
      makeMetaCampaign({ name: '[09/01/2025] Promoting https://renamed.to' }),
    ]

    const code = codegenMeta(resources)

    // Slugify produces "09-01-2025-promoting-https-renamed-to"
    // CamelCase produces "09012025PromotingHttpsRenamedTo" — starts with digit
    // Must be prefixed with _ to be valid JS
    expect(code).toContain('export const _09012025PromotingHttpsRenamedTo')
  })

  test('multiline primaryText uses template literal (backticks)', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      makeCreative('retargeting-us/visitors/hero/cr', {
        primaryText: 'Line one.\n\nLine two.\n\nLine three.',
      }),
    ]

    const code = codegenMeta(resources)

    // Should use backticks for multiline, not single quotes
    expect(code).toContain('`Line one.')
    expect(code).not.toContain("'Line one.")
  })

  test('creative with no properties omits empty object', () => {
    // Use a name that matches the filename to avoid an explicit name: property
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      makeCreative('retargeting-us/visitors/hero-abc123/cr', {
        name: 'hero-abc123',
        headline: undefined,
        primaryText: undefined,
        description: undefined,
        cta: undefined,
        url: undefined,
      }),
    ]

    const code = codegenMeta(resources)

    // Should not produce empty object with trailing comma
    expect(code).not.toContain('{,')
    expect(code).not.toContain('{\n      ,')
    // Should just be image('path') with no second argument
    expect(code).toContain("image('./assets/imported/hero-abc123.png')")
    expect(code).not.toContain("image('./assets/imported/hero-abc123.png',")
  })

  test('boosted post creative (no format) uses object literal instead of image()', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors'),
      {
        kind: 'creative',
        path: 'retargeting-us/visitors/boosted-page-post/cr',
        properties: {
          name: 'Boosted Page Post',
          // No format, headline, primaryText — this is a boosted post
        },
      },
    ]

    const code = codegenMeta(resources)

    // Should NOT use image() or video() helpers
    expect(code).not.toContain('image(')
    expect(code).not.toContain('video(')
    // Should contain the name in a raw object
    expect(code).toContain("name: 'Boosted Page Post'")
    // Should not import metaImage or metaVideo
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).not.toContain('metaImage')
    expect(importLine).not.toContain('metaVideo')
  })

  test('custom audiences in targeting', () => {
    const resources: Resource[] = [
      makeMetaCampaign(),
      makeAdSet('retargeting-us/visitors', 'Visitors', {
        targeting: {
          geo: [{ type: 'geo', countries: ['US'] }],
          customAudiences: ['Website Visitors 30d'],
          excludedAudiences: ['Existing Customers'],
        },
      }),
      makeCreative('retargeting-us/visitors/hero/cr'),
    ]

    const code = codegenMeta(resources)

    expect(code).toContain("audience('Website Visitors 30d')")
    expect(code).toContain("excludeAudience('Existing Customers')")
    const importLine = code.split('\n').find((l) => l.startsWith('import'))!
    expect(importLine).toContain('audience')
    expect(importLine).toContain('excludeAudience')
  })
})
