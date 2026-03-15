import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { defineConfig } from '../../src/core/config.ts'
import type { Headline, Description, Keyword, Budget, Targeting, CalloutText } from '../../src/core/types.ts'
import type { GoogleAd, Sitelink, BiddingStrategy, StructuredSnippet, CallExtension, PriceExtension, PromotionExtension, ImageExtension } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────────────

const budget: Budget = { amount: 20, currency: 'EUR', period: 'daily' }

const headline = (s: string) => s as Headline
const desc = (s: string) => s as Description
const callout = (s: string) => s as CalloutText

const ad: GoogleAd = {
  type: 'rsa',
  headlines: [headline('Rename Files'), headline('AI Powered'), headline('Try Free')],
  descriptions: [desc('Rename files in seconds'), desc('Try it free')],
  finalUrl: 'https://renamed.to',
}

const keywords: Keyword[] = [
  { text: 'rename files', matchType: 'EXACT' },
  { text: 'file renamer', matchType: 'PHRASE' },
]

const usTargeting: Targeting = {
  rules: [{ type: 'geo', countries: ['US'] }],
}

const deTargeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['DE', 'AT', 'CH'] },
    { type: 'language', languages: ['de'] },
  ],
}

// ─── google.search() ────────────────────────────────────────────────

describe('google.search()', () => {
  test('produces a valid GoogleSearchCampaign', () => {
    const campaign = google.search('Exact Match', {
      budget,
      bidding: { type: 'maximize-conversions' },
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('search')
    expect(campaign.name).toBe('Exact Match')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'maximize-conversions' })
  })

  test('bidding string shorthand normalizes to object', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    })

    expect(campaign.bidding).toEqual({ type: 'maximize-conversions' })
  })

  test('bidding string "maximize-clicks" normalizes correctly', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-clicks',
    })

    expect(campaign.bidding).toEqual({ type: 'maximize-clicks' })
  })

  test('bidding object with extra fields is preserved', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: { type: 'maximize-clicks', maxCpc: 2.5 },
    })

    expect(campaign.bidding).toEqual({ type: 'maximize-clicks', maxCpc: 2.5 })
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.search('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('targeting defaults to empty rules', () => {
    const campaign = google.search('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.targeting).toEqual({ rules: [] })
  })

  test('negatives defaults to empty array', () => {
    const campaign = google.search('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.negatives).toEqual([])
  })

  test('negatives can be provided', () => {
    const negs: Keyword[] = [{ text: 'free', matchType: 'BROAD' }]
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      negatives: negs,
    })
    expect(campaign.negatives).toEqual(negs)
  })

  test('groups starts as empty object', () => {
    const campaign = google.search('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.groups).toEqual({})
  })
})

// ─── .locale() ──────────────────────────────────────────────────────

describe('.locale()', () => {
  test('adds a group with targeting override', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).locale('en-us', usTargeting, { keywords, ad })

    expect(campaign.groups['en-us']).toBeDefined()
    expect(campaign.groups['en-us']!.targeting).toEqual(usTargeting)
    expect(campaign.groups['en-us']!.keywords).toEqual(keywords)
    expect(campaign.groups['en-us']!.ads).toHaveLength(1)
  })

  test('single ad normalizes to array', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).locale('en-us', usTargeting, { keywords, ad })

    expect(Array.isArray(campaign.groups['en-us']!.ads)).toBe(true)
    expect(campaign.groups['en-us']!.ads[0]).toEqual(ad)
  })

  test('ad array is preserved', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).locale('en-us', usTargeting, { keywords, ad: [ad, ad] })

    expect(campaign.groups['en-us']!.ads).toHaveLength(2)
  })
})

// ─── .group() ───────────────────────────────────────────────────────

describe('.group()', () => {
  test('adds a group without targeting override', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { keywords, ad })

    expect(campaign.groups['main']).toBeDefined()
    expect(campaign.groups['main']!.targeting).toBeUndefined()
    expect(campaign.groups['main']!.keywords).toEqual(keywords)
  })

  test('preserves ad group targeting from input', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { keywords, ad, targeting: usTargeting })

    expect(campaign.groups['main']!.targeting).toEqual(usTargeting)
  })
})

// ─── Chaining ───────────────────────────────────────────────────────

describe('chaining', () => {
  test('multiple .locale() calls accumulate groups', () => {
    const campaign = google.search('Multi-Locale', {
      budget,
      bidding: 'maximize-conversions',
    })
      .locale('en-us', usTargeting, { keywords, ad })
      .locale('de-dach', deTargeting, { keywords, ad })

    expect(Object.keys(campaign.groups)).toEqual(['en-us', 'de-dach'])
    expect(campaign.groups['en-us']!.targeting).toEqual(usTargeting)
    expect(campaign.groups['de-dach']!.targeting).toEqual(deTargeting)
  })

  test('.locale() + .sitelinks() chaining works', () => {
    const links: Sitelink[] = [
      { text: 'Pricing', url: '/pricing' },
      { text: 'Features', url: '/features' },
    ]

    const campaign = google.search('Chained', {
      budget,
      bidding: 'maximize-conversions',
    })
      .locale('en-us', usTargeting, { keywords, ad })
      .sitelinks(...links)

    expect(campaign.groups['en-us']).toBeDefined()
    expect(campaign.extensions?.sitelinks).toEqual(links)
  })

  test('.locale() + .group() + .sitelinks() + .callouts() full chain', () => {
    const campaign = google.search('Full', {
      budget,
      bidding: 'maximize-conversions',
    })
      .locale('en-us', usTargeting, { keywords, ad })
      .group('broad', { keywords, ad })
      .sitelinks({ text: 'Pricing', url: '/pricing' })
      .callouts('Free Trial', 'AI Powered')

    expect(Object.keys(campaign.groups)).toEqual(['en-us', 'broad'])
    expect(campaign.extensions?.sitelinks).toHaveLength(1)
    expect(campaign.extensions?.callouts).toEqual([callout('Free Trial'), callout('AI Powered')])
  })

  test('original campaign is not mutated by chaining', () => {
    const base = google.search('Base', { budget, bidding: 'maximize-conversions' })
    const withGroup = base.locale('en-us', usTargeting, { keywords, ad })

    expect(Object.keys(base.groups)).toEqual([])
    expect(Object.keys(withGroup.groups)).toEqual(['en-us'])
  })
})

// ─── Ad Group Negatives ─────────────────────────────────────────────

describe('ad group negatives in builder', () => {
  test('.group() passes through ad group negatives', () => {
    const agNegatives: Keyword[] = [
      { text: 'free trial', matchType: 'BROAD' },
      { text: 'open source', matchType: 'EXACT' },
    ]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { keywords, ad, negatives: agNegatives })

    expect(campaign.groups['main']!.negatives).toEqual(agNegatives)
  })

  test('.locale() passes through ad group negatives', () => {
    const agNegatives: Keyword[] = [{ text: 'cheap', matchType: 'BROAD' }]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).locale('en-us', usTargeting, { keywords, ad, negatives: agNegatives })

    expect(campaign.groups['en-us']!.negatives).toEqual(agNegatives)
  })

  test('ad group without negatives has no negatives field', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { keywords, ad })

    expect(campaign.groups['main']!.negatives).toBeUndefined()
  })
})

// ─── .sitelinks() ──────────────────────────────────────────────────

describe('.sitelinks()', () => {
  test('sets sitelink extensions', () => {
    const links: Sitelink[] = [
      { text: 'Pricing', url: '/pricing', description1: 'See plans' },
    ]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).sitelinks(...links)

    expect(campaign.extensions?.sitelinks).toEqual(links)
  })
})

// ─── .callouts() ────────────────────────────────────────────────────

describe('.callouts()', () => {
  test('sets callout extensions', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).callouts('Free Trial', 'No Credit Card')

    expect(campaign.extensions?.callouts).toEqual([callout('Free Trial'), callout('No Credit Card')])
  })

  test('throws on callout exceeding 25 characters', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    })

    expect(() => {
      campaign.callouts('This callout is way too long for Google Ads')
    }).toThrow(/exceeds 25 character limit/)
  })

  test('allows exactly 25 character callouts', () => {
    const text = 'a'.repeat(25)
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).callouts(text)

    expect(campaign.extensions?.callouts).toHaveLength(1)
  })
})

// ─── .snippets() ───────────────────────────────────────────────────

describe('.snippets()', () => {
  test('sets structured snippet extensions', () => {
    const snippets: StructuredSnippet[] = [
      { header: 'Types', values: ['Files', 'Folders', 'Documents'] },
    ]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).snippets(...snippets)

    expect(campaign.extensions?.structuredSnippets).toEqual(snippets)
  })
})

// ─── .calls() ──────────────────────────────────────────────────────

describe('.calls()', () => {
  test('sets call extensions', () => {
    const calls: CallExtension[] = [
      { phoneNumber: '+1-800-555-0123', countryCode: 'US' },
    ]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).calls(...calls)

    expect(campaign.extensions?.calls).toEqual(calls)
  })
})

// ─── .prices() ─────────────────────────────────────────────────────

describe('.prices()', () => {
  test('sets price extensions', () => {
    const prices: PriceExtension[] = [{
      items: [
        { header: 'Starter', description: 'For individuals', price: '$9/mo', url: '/pricing' },
        { header: 'Pro', description: 'For teams', price: '$29/mo', url: '/pricing' },
        { header: 'Enterprise', description: 'Custom', price: '$99/mo', url: '/pricing' },
      ],
    }]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).prices(...prices)

    expect(campaign.extensions?.prices).toEqual(prices)
  })
})

// ─── .promotions() ─────────────────────────────────────────────────

describe('.promotions()', () => {
  test('sets promotion extensions', () => {
    const promos: PromotionExtension[] = [{
      discountType: 'percent',
      discountPercent: 20,
      url: 'https://renamed.to/pricing',
    }]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).promotions(...promos)

    expect(campaign.extensions?.promotions).toEqual(promos)
  })
})

// ─── .images() ─────────────────────────────────────────────────────

describe('.images()', () => {
  test('sets image extensions', () => {
    const imgs: ImageExtension[] = [
      { imageUrl: 'https://example.com/ad.png', altText: 'Product screenshot' },
    ]

    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).images(...imgs)

    expect(campaign.extensions?.images).toEqual(imgs)
  })
})

// ─── Builder chaining with new extensions ──────────────────────────

describe('chaining with new extensions', () => {
  test('full chain with all extension types', () => {
    const campaign = google.search('Full Extensions', {
      budget,
      bidding: 'maximize-conversions',
    })
      .group('main', { keywords, ad })
      .sitelinks({ text: 'Pricing', url: '/pricing' })
      .callouts('Free Trial')
      .snippets({ header: 'Types', values: ['Files', 'Folders', 'Docs'] })
      .calls({ phoneNumber: '+1-800-555-0123', countryCode: 'US' })
      .prices({
        items: [
          { header: 'Starter', description: 'For individuals', price: '$9/mo', url: '/p' },
          { header: 'Pro', description: 'For teams', price: '$29/mo', url: '/p' },
          { header: 'Enterprise', description: 'Custom', price: '$99/mo', url: '/p' },
        ],
      })
      .promotions({ discountType: 'percent', discountPercent: 20, url: '/pricing' })
      .images({ imageUrl: 'https://example.com/ad.png' })

    expect(campaign.extensions?.sitelinks).toHaveLength(1)
    expect(campaign.extensions?.callouts).toHaveLength(1)
    expect(campaign.extensions?.structuredSnippets).toHaveLength(1)
    expect(campaign.extensions?.calls).toHaveLength(1)
    expect(campaign.extensions?.prices).toHaveLength(1)
    expect(campaign.extensions?.promotions).toHaveLength(1)
    expect(campaign.extensions?.images).toHaveLength(1)
    expect(Object.keys(campaign.groups)).toEqual(['main'])
  })
})

// ─── New Bidding Strategies ─────────────────────────────────────────

describe('new bidding strategies', () => {
  test('target-roas string shorthand normalizes with default targetRoas', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'target-roas',
    })

    expect(campaign.bidding).toEqual({ type: 'target-roas', targetRoas: 1.0 })
  })

  test('target-roas object preserves targetRoas value', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: { type: 'target-roas', targetRoas: 4.0 },
    })

    expect(campaign.bidding).toEqual({ type: 'target-roas', targetRoas: 4.0 })
  })

  test('target-impression-share string shorthand normalizes with defaults', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'target-impression-share',
    })

    expect(campaign.bidding).toEqual({
      type: 'target-impression-share',
      location: 'anywhere',
      targetPercent: 50,
    })
  })

  test('target-impression-share object preserves all fields', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: {
        type: 'target-impression-share',
        location: 'absolute-top',
        targetPercent: 90,
        maxCpc: 5.0,
      },
    })

    expect(campaign.bidding).toEqual({
      type: 'target-impression-share',
      location: 'absolute-top',
      targetPercent: 90,
      maxCpc: 5.0,
    })
  })

  test('maximize-conversion-value string shorthand normalizes correctly', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversion-value',
    })

    expect(campaign.bidding).toEqual({ type: 'maximize-conversion-value' })
  })

  test('maximize-conversion-value object with targetRoas is preserved', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: { type: 'maximize-conversion-value', targetRoas: 3.5 },
    })

    expect(campaign.bidding).toEqual({ type: 'maximize-conversion-value', targetRoas: 3.5 })
  })
})

// ─── Campaign Config Fields ────────────────────────────────────────

describe('campaign config fields', () => {
  test('startDate and endDate are passed through', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    })

    expect(campaign.startDate).toBe('2026-04-01')
    expect(campaign.endDate).toBe('2026-06-30')
  })

  test('trackingTemplate is passed through', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      trackingTemplate: '{lpurl}?source=google&campaign={campaignid}',
    })

    expect(campaign.trackingTemplate).toBe('{lpurl}?source=google&campaign={campaignid}')
  })

  test('finalUrlSuffix is passed through', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      finalUrlSuffix: 'utm_source=google&utm_medium=cpc',
    })

    expect(campaign.finalUrlSuffix).toBe('utm_source=google&utm_medium=cpc')
  })

  test('customParameters are passed through', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      customParameters: { channel: 'search', variant: 'a' },
    })

    expect(campaign.customParameters).toEqual({ channel: 'search', variant: 'a' })
  })

  test('networkSettings are passed through', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
      networkSettings: {
        searchNetwork: true,
        searchPartners: false,
        displayNetwork: false,
      },
    })

    expect(campaign.networkSettings).toEqual({
      searchNetwork: true,
      searchPartners: false,
      displayNetwork: false,
    })
  })

  test('optional fields are omitted when not provided', () => {
    const campaign = google.search('Test', {
      budget,
      bidding: 'maximize-conversions',
    })

    expect(campaign.startDate).toBeUndefined()
    expect(campaign.endDate).toBeUndefined()
    expect(campaign.trackingTemplate).toBeUndefined()
    expect(campaign.finalUrlSuffix).toBeUndefined()
    expect(campaign.customParameters).toBeUndefined()
    expect(campaign.networkSettings).toBeUndefined()
  })
})

// ─── defineConfig() ─────────────────────────────────────────────────

describe('defineConfig()', () => {
  test('returns the same config object', () => {
    const config = {
      google: { customerId: '123-456-7890', managerId: '098-765-4321' },
      cache: '.ads-cache',
    }

    const result = defineConfig(config)
    expect(result).toEqual(config)
  })

  test('works with empty config', () => {
    const result = defineConfig({})
    expect(result).toEqual({})
  })

  test('works with meta provider config', () => {
    const config = {
      meta: { accountId: 'act_12345', pageId: '772782699246452' },
    }
    const result = defineConfig(config)
    expect(result).toEqual(config)
  })
})
