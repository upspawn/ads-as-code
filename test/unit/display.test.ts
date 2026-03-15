import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { flattenDisplay, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import { landscape, square, logo } from '../../src/google/image-assets.ts'
import type { Budget, Targeting, Resource } from '../../src/core/types.ts'
import type {
  GoogleDisplayCampaign,
  GoogleDisplayAd,
  ResponsiveDisplayAd,
} from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 10, currency: 'EUR', period: 'daily' }

const usTargeting: Targeting = {
  rules: [{ type: 'geo', countries: ['US'] }],
}

const displayAd: GoogleDisplayAd = {
  type: 'responsive-display',
  headlines: ['Rename Files Fast', 'AI Powered'],
  longHeadline: 'Rename All Your Files in Seconds with AI',
  descriptions: ['Try renamed.to free', 'No credit card required'],
  businessName: 'renamed.to',
  finalUrl: 'https://renamed.to',
  marketingImages: [landscape('./hero.png')],
  squareMarketingImages: [square('./hero-square.png')],
}

function makeDisplayCampaign(overrides?: Partial<GoogleDisplayCampaign>): GoogleDisplayCampaign {
  return {
    provider: 'google',
    kind: 'display',
    name: 'Display - Remarketing',
    status: 'enabled',
    budget,
    bidding: { type: 'maximize-conversions' },
    targeting: usTargeting,
    negatives: [],
    groups: {
      'remarketing': {
        ads: [displayAd],
      },
    },
    ...overrides,
  }
}

// ─── google.display() builder ───────────────────────────────

describe('google.display()', () => {
  test('produces a valid GoogleDisplayCampaign', () => {
    const campaign = google.display('Display - Remarketing', {
      budget,
      bidding: 'maximize-conversions',
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('display')
    expect(campaign.name).toBe('Display - Remarketing')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'maximize-conversions' })
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('targeting defaults to empty rules', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.targeting).toEqual({ rules: [] })
  })

  test('negatives defaults to empty array', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.negatives).toEqual([])
  })

  test('groups starts as empty object', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.groups).toEqual({})
  })

  test('optional fields are omitted when not provided', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-conversions' })
    expect(campaign.startDate).toBeUndefined()
    expect(campaign.endDate).toBeUndefined()
    expect(campaign.trackingTemplate).toBeUndefined()
    expect(campaign.finalUrlSuffix).toBeUndefined()
    expect(campaign.networkSettings).toBeUndefined()
  })

  test('optional fields are passed through when provided', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      trackingTemplate: '{lpurl}?src=display',
      finalUrlSuffix: 'utm_medium=display',
    })
    expect(campaign.startDate).toBe('2026-04-01')
    expect(campaign.endDate).toBe('2026-06-30')
    expect(campaign.trackingTemplate).toBe('{lpurl}?src=display')
    expect(campaign.finalUrlSuffix).toBe('utm_medium=display')
  })

  test('bidding string shorthand normalizes to object', () => {
    const campaign = google.display('Test', { budget, bidding: 'maximize-clicks' })
    expect(campaign.bidding).toEqual({ type: 'maximize-clicks' })
  })
})

// ─── .group() for Display ──────────────────────────────────

describe('display .group()', () => {
  test('adds a group with display ad', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('remarketing', { ad: displayAd })

    expect(campaign.groups['remarketing']).toBeDefined()
    expect(campaign.groups['remarketing']!.ads).toHaveLength(1)
    expect(campaign.groups['remarketing']!.ads[0]!.type).toBe('responsive-display')
  })

  test('single ad normalizes to array', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { ad: displayAd })

    expect(Array.isArray(campaign.groups['main']!.ads)).toBe(true)
  })

  test('ad array is preserved', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('main', { ad: [displayAd, displayAd] })

    expect(campaign.groups['main']!.ads).toHaveLength(2)
  })

  test('multiple groups accumulate via chaining', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
      .group('remarketing', { ad: displayAd })
      .group('in-market', { ad: displayAd })

    expect(Object.keys(campaign.groups)).toEqual(['remarketing', 'in-market'])
  })

  test('original campaign is not mutated by chaining', () => {
    const base = google.display('Test', { budget, bidding: 'maximize-conversions' })
    const withGroup = base.group('main', { ad: displayAd })

    expect(Object.keys(base.groups)).toEqual([])
    expect(Object.keys(withGroup.groups)).toEqual(['main'])
  })

  test('group status is preserved', () => {
    const campaign = google.display('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).group('paused-group', { ad: displayAd, status: 'paused' })

    expect(campaign.groups['paused-group']!.status).toBe('paused')
  })
})

// ─── flattenDisplay ────────────────────────────────────────

describe('flattenDisplay()', () => {
  const campaign = makeDisplayCampaign()
  const resources = flattenDisplay(campaign)

  test('produces correct total resource count', () => {
    // 1 campaign + 1 ad group + 1 ad = 3 (no keywords, no negatives)
    expect(resources).toHaveLength(3)
  })

  test('all paths are unique', () => {
    const paths = resources.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  test('campaign resource has channelType: display', () => {
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.channelType).toBe('display')
    expect(c.properties.name).toBe('Display - Remarketing')
    expect(c.properties.status).toBe('enabled')
  })

  test('campaign resource has correct path', () => {
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.path).toBe('display-remarketing')
  })

  test('ad group resource has adGroupType: display', () => {
    const ag = resources.find(r => r.kind === 'adGroup')!
    expect(ag.properties.adGroupType).toBe('display')
    expect(ag.path).toBe('display-remarketing/remarketing')
  })

  test('ad resource has responsive-display type marker', () => {
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.adType).toBe('responsive-display')
    expect(ad.path).toMatch(/^display-remarketing\/remarketing\/rda:[0-9a-f]+$/)
  })

  test('ad resource contains all RDA fields', () => {
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.longHeadline).toBe('Rename All Your Files in Seconds with AI')
    expect(ad.properties.businessName).toBe('renamed.to')
    expect(ad.properties.finalUrl).toBe('https://renamed.to')
    expect(ad.properties.marketingImages).toEqual([landscape('./hero.png')])
    expect(ad.properties.squareMarketingImages).toEqual([square('./hero-square.png')])
  })

  test('headlines and descriptions are sorted', () => {
    const ad = resources.find(r => r.kind === 'ad')!
    const hl = ad.properties.headlines as string[]
    const desc = ad.properties.descriptions as string[]
    expect(hl).toEqual([...hl].sort())
    expect(desc).toEqual([...desc].sort())
  })

  test('optional ad fields are omitted when not present', () => {
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties).not.toHaveProperty('logoImages')
    expect(ad.properties).not.toHaveProperty('squareLogoImages')
    expect(ad.properties).not.toHaveProperty('mainColor')
    expect(ad.properties).not.toHaveProperty('accentColor')
    expect(ad.properties).not.toHaveProperty('callToAction')
  })

  test('optional ad fields are included when present', () => {
    const adWithExtras: GoogleDisplayAd = {
      ...displayAd,
      logoImages: [logo('./logo.png')],
      mainColor: '#FF0000',
      accentColor: '#0000FF',
      callToAction: 'Sign Up',
    }
    const c = makeDisplayCampaign({
      groups: { main: { ads: [adWithExtras] } },
    })
    const res = flattenDisplay(c)
    const ad = res.find(r => r.kind === 'ad')!
    expect(ad.properties.logoImages).toEqual([logo('./logo.png')])
    expect(ad.properties.mainColor).toBe('#FF0000')
    expect(ad.properties.accentColor).toBe('#0000FF')
    expect(ad.properties.callToAction).toBe('Sign Up')
  })
})

// ─── flattenDisplay — negatives ────────────────────────────

describe('flattenDisplay() negatives', () => {
  test('campaign-level negatives produce negative resources', () => {
    const c = makeDisplayCampaign({
      negatives: [
        { text: 'free', matchType: 'BROAD' },
        { text: 'cheap', matchType: 'EXACT' },
      ],
    })
    const resources = flattenDisplay(c)
    const negatives = resources.filter(r => r.kind === 'negative')
    expect(negatives).toHaveLength(2)
    expect(negatives.map(n => n.path).sort()).toEqual([
      'display-remarketing/neg:cheap:EXACT',
      'display-remarketing/neg:free:BROAD',
    ])
  })
})

// ─── flattenDisplay — RDA hash stability ───────────────────

describe('flattenDisplay() RDA hash stability', () => {
  test('same headlines/longHeadline/url produce identical hash regardless of order', () => {
    const ad1: GoogleDisplayAd = {
      ...displayAd,
      headlines: ['B', 'A'],
    }
    const ad2: GoogleDisplayAd = {
      ...displayAd,
      headlines: ['A', 'B'],
    }
    const c1 = makeDisplayCampaign({ groups: { test: { ads: [ad1] } } })
    const c2 = makeDisplayCampaign({ groups: { test: { ads: [ad2] } } })
    const r1 = flattenDisplay(c1).find(r => r.kind === 'ad')!
    const r2 = flattenDisplay(c2).find(r => r.kind === 'ad')!
    expect(r1.path).toBe(r2.path)
  })

  test('different longHeadline produces different hash', () => {
    const ad1: GoogleDisplayAd = { ...displayAd, longHeadline: 'Version A' }
    const ad2: GoogleDisplayAd = { ...displayAd, longHeadline: 'Version B' }
    const c1 = makeDisplayCampaign({ groups: { test: { ads: [ad1] } } })
    const c2 = makeDisplayCampaign({ groups: { test: { ads: [ad2] } } })
    const r1 = flattenDisplay(c1).find(r => r.kind === 'ad')!
    const r2 = flattenDisplay(c2).find(r => r.kind === 'ad')!
    expect(r1.path).not.toBe(r2.path)
  })
})

// ─── flattenAll with mixed campaign types ──────────────────

describe('flattenAll() with mixed types', () => {
  test('handles both Search and Display campaigns', () => {
    const searchCampaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Search - Main',
      status: 'enabled' as const,
      budget,
      bidding: { type: 'maximize-conversions' as const },
      targeting: { rules: [] },
      negatives: [],
      groups: {},
    }
    const displayCampaign = makeDisplayCampaign({ name: 'Display - Main' })

    const resources = flattenAll([searchCampaign, displayCampaign])
    const campaigns = resources.filter(r => r.kind === 'campaign')
    expect(campaigns).toHaveLength(2)

    // Search campaign has no channelType property (existing behavior)
    const search = campaigns.find(r => r.path === 'search-main')!
    expect(search.properties).not.toHaveProperty('channelType')

    // Display campaign has channelType: display
    const display = campaigns.find(r => r.path === 'display-main')!
    expect(display.properties.channelType).toBe('display')
  })
})

// ─── Apply: campaign create uses correct channel type ──────

describe('apply: Display campaign create', () => {
  test('campaign create uses advertising_channel_type 3 for Display', () => {
    const campaignResource: Resource = {
      kind: 'campaign',
      path: 'display-remarketing',
      properties: {
        name: 'Display - Remarketing',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        channelType: 'display',
      },
    }
    const change = { op: 'create' as const, resource: campaignResource }
    const mutations = changeToMutations(change, '1234567890', new Map())

    // Find the campaign create mutation (not the budget one)
    const campaignMutation = mutations.find(m => m.operation === 'campaign')!
    expect(campaignMutation.resource.advertising_channel_type).toBe(3) // DISPLAY
  })

  test('campaign create uses advertising_channel_type 2 for Search (no channelType)', () => {
    const campaignResource: Resource = {
      kind: 'campaign',
      path: 'search-main',
      properties: {
        name: 'Search - Main',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
      },
    }
    const change = { op: 'create' as const, resource: campaignResource }
    const mutations = changeToMutations(change, '1234567890', new Map())

    const campaignMutation = mutations.find(m => m.operation === 'campaign')!
    expect(campaignMutation.resource.advertising_channel_type).toBe(2) // SEARCH
  })

  test('ad group create uses type 7 for Display', () => {
    const agResource: Resource = {
      kind: 'adGroup',
      path: 'display-remarketing/remarketing',
      properties: {
        status: 'enabled',
        adGroupType: 'display',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const resourceMap = new Map([['display-remarketing', '12345']])
    const mutations = changeToMutations(change, '1234567890', resourceMap)

    const agMutation = mutations.find(m => m.operation === 'ad_group')!
    expect(agMutation.resource.type).toBe(7) // DISPLAY_STANDARD
  })

  test('ad group create uses type 2 for Search (no adGroupType)', () => {
    const agResource: Resource = {
      kind: 'adGroup',
      path: 'search-main/pdf-core',
      properties: {
        status: 'enabled',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const resourceMap = new Map([['search-main', '12345']])
    const mutations = changeToMutations(change, '1234567890', resourceMap)

    const agMutation = mutations.find(m => m.operation === 'ad_group')!
    expect(agMutation.resource.type).toBe(2) // SEARCH_STANDARD
  })
})

// ─── Codegen: Display campaigns use google.display() ───────

describe('codegen: Display campaigns', () => {
  test('generates google.display() for Display campaign resources', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'display-remarketing',
        properties: {
          name: 'Display - Remarketing',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
          channelType: 'display',
        },
      },
    ]

    const code = generateCampaignFile(resources, 'Display - Remarketing')
    expect(code).toContain("google.display('Display - Remarketing'")
    expect(code).not.toContain('google.search')
  })

  test('generates google.search() for Search campaign resources (no channelType)', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'search-main',
        properties: {
          name: 'Search - Main',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
        },
      },
    ]

    const code = generateCampaignFile(resources, 'Search - Main')
    expect(code).toContain("google.search('Search - Main'")
    expect(code).not.toContain('google.display')
  })
})
