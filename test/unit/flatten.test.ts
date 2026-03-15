import { describe, expect, test } from 'bun:test'
import { flatten, flattenAll, slugify } from '../../src/core/flatten.ts'
import type { GoogleSearchCampaign } from '../../src/google/types.ts'
import type { Headline, Description, CalloutText } from '../../src/core/types.ts'

// ─── Helpers ──────────────────────────────────────────────

function makeCampaign(overrides?: Partial<GoogleSearchCampaign>): GoogleSearchCampaign {
  return {
    provider: 'google',
    kind: 'search',
    name: 'Search - PDF Renaming',
    status: 'enabled',
    budget: { amount: 20, currency: 'EUR', period: 'daily' },
    bidding: { type: 'maximize-conversions' },
    targeting: {
      rules: [
        { type: 'geo', countries: ['US', 'DE'] },
        { type: 'language', languages: ['en'] },
      ],
    },
    negatives: [
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'EXACT' },
    ],
    groups: {
      'pdf-core': {
        keywords: [
          { text: 'rename pdf', matchType: 'EXACT' },
          { text: 'pdf renaming tool', matchType: 'PHRASE' },
        ],
        ads: [
          {
            type: 'rsa',
            headlines: [
              'Rename PDFs Fast' as Headline,
              'AI-Powered Tool' as Headline,
              'Try It Free' as Headline,
            ],
            descriptions: [
              'Rename your PDFs in seconds with AI.' as Description,
              'No more manual renaming.' as Description,
            ],
            finalUrl: 'https://renamed.to/pdf-renamer',
          },
        ],
      },
      'pdf-bulk': {
        keywords: [
          { text: 'bulk rename pdf', matchType: 'EXACT' },
        ],
        ads: [
          {
            type: 'rsa',
            headlines: [
              'Bulk Rename PDFs' as Headline,
              'AI File Renamer' as Headline,
              'Free Trial' as Headline,
            ],
            descriptions: [
              'Rename hundreds of PDFs at once.' as Description,
              'Powered by AI for smart names.' as Description,
            ],
            finalUrl: 'https://renamed.to/pdf-renamer',
            utm: { source: 'google', medium: 'cpc', campaign: 'pdf' },
          },
        ],
      },
    },
    extensions: {
      sitelinks: [
        { text: 'Pricing', url: 'https://renamed.to/pricing', description1: 'See our plans' },
        { text: 'Features', url: 'https://renamed.to/features' },
      ],
      callouts: [
        'Free Trial' as CalloutText,
        '24/7 Support' as CalloutText,
      ],
    },
    ...overrides,
  }
}

// ─── slugify ──────────────────────────────────────────────

describe('slugify()', () => {
  test('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Search PDF Renaming')).toBe('search-pdf-renaming')
  })

  test('handles dashes and special chars', () => {
    expect(slugify('Search - PDF Renaming')).toBe('search-pdf-renaming')
  })

  test('strips leading/trailing hyphens', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world')
  })

  test('collapses consecutive special chars into single hyphen', () => {
    expect(slugify('a & b @ c')).toBe('a-b-c')
  })

  test('handles pure alphanumeric', () => {
    expect(slugify('rename123')).toBe('rename123')
  })

  test('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

// ─── flatten — single campaign ────────────────────────────

describe('flatten()', () => {
  const campaign = makeCampaign()
  const resources = flatten(campaign)

  test('produces correct total resource count', () => {
    // 1 campaign + 2 ad groups + 3 keywords + 2 ads + 2 sitelinks + 2 callouts + 2 negatives = 14
    expect(resources).toHaveLength(14)
  })

  test('all paths are unique', () => {
    const paths = resources.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  test('campaign resource has correct path and properties', () => {
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.path).toBe('search-pdf-renaming')
    expect(c.properties.name).toBe('Search - PDF Renaming')
    expect(c.properties.status).toBe('enabled')
    expect(c.properties.budget).toEqual({ amount: 20, currency: 'EUR', period: 'daily' })
    expect(c.properties.bidding).toEqual({ type: 'maximize-conversions' })
    expect(c.properties.targeting).toBeDefined()
  })

  test('ad group resources have correct paths', () => {
    const groups = resources.filter(r => r.kind === 'adGroup')
    expect(groups).toHaveLength(2)
    const paths = groups.map(r => r.path).sort()
    expect(paths).toEqual(['search-pdf-renaming/pdf-bulk', 'search-pdf-renaming/pdf-core'])
  })

  test('ad group properties include status', () => {
    const group = resources.find(r => r.kind === 'adGroup' && r.path.endsWith('/pdf-core'))!
    // Default status when not specified
    expect(group.properties.status).toBe('enabled')
  })

  test('keyword paths are case-normalized', () => {
    const keywords = resources.filter(r => r.kind === 'keyword')
    expect(keywords).toHaveLength(3)

    const kwPaths = keywords.map(r => r.path).sort()
    expect(kwPaths).toContain('search-pdf-renaming/pdf-core/kw:rename pdf:EXACT')
    expect(kwPaths).toContain('search-pdf-renaming/pdf-core/kw:pdf renaming tool:PHRASE')
    expect(kwPaths).toContain('search-pdf-renaming/pdf-bulk/kw:bulk rename pdf:EXACT')
  })

  test('keyword properties contain text and matchType', () => {
    const kw = resources.find(r => r.kind === 'keyword' && r.path.includes('kw:rename pdf'))!
    expect(kw.properties.text).toBe('rename pdf')
    expect(kw.properties.matchType).toBe('EXACT')
  })

  test('RSA ad paths use stable hash', () => {
    const ads = resources.filter(r => r.kind === 'ad')
    expect(ads).toHaveLength(2)

    // All ad paths should start with rsa:
    for (const ad of ads) {
      expect(ad.path).toMatch(/\/rsa:[0-9a-f]+$/)
    }
  })

  test('RSA properties have sorted headlines and descriptions', () => {
    const ad = resources.find(r => r.kind === 'ad' && r.path.includes('pdf-core'))!
    const hl = ad.properties.headlines as string[]
    const desc = ad.properties.descriptions as string[]

    // Should be sorted
    expect(hl).toEqual([...hl].sort())
    expect(desc).toEqual([...desc].sort())
    expect(ad.properties.finalUrl).toBe('https://renamed.to/pdf-renamer')
  })

  test('RSA with UTM includes utm in properties', () => {
    const ad = resources.find(r => r.kind === 'ad' && r.path.includes('pdf-bulk'))!
    expect(ad.properties.utm).toEqual({ source: 'google', medium: 'cpc', campaign: 'pdf' })
  })

  test('sitelink paths use lowercased text', () => {
    const sitelinks = resources.filter(r => r.kind === 'sitelink')
    expect(sitelinks).toHaveLength(2)

    const paths = sitelinks.map(r => r.path).sort()
    expect(paths).toContain('search-pdf-renaming/sl:pricing')
    expect(paths).toContain('search-pdf-renaming/sl:features')
  })

  test('sitelink properties include optional descriptions', () => {
    const sl = resources.find(r => r.path.includes('sl:pricing'))!
    expect(sl.properties.text).toBe('Pricing')
    expect(sl.properties.url).toBe('https://renamed.to/pricing')
    expect(sl.properties.description1).toBe('See our plans')
  })

  test('callout paths use lowercased text', () => {
    const callouts = resources.filter(r => r.kind === 'callout')
    expect(callouts).toHaveLength(2)

    const paths = callouts.map(r => r.path).sort()
    expect(paths).toContain('search-pdf-renaming/co:free trial')
    expect(paths).toContain('search-pdf-renaming/co:24/7 support')
  })

  test('negative paths include text and matchType', () => {
    const negatives = resources.filter(r => r.kind === 'negative')
    expect(negatives).toHaveLength(2)

    const paths = negatives.map(r => r.path).sort()
    expect(paths).toContain('search-pdf-renaming/neg:cheap:EXACT')
    expect(paths).toContain('search-pdf-renaming/neg:free:BROAD')
  })

  test('negative properties contain text and matchType', () => {
    const neg = resources.find(r => r.path.includes('neg:free'))!
    expect(neg.properties.text).toBe('free')
    expect(neg.properties.matchType).toBe('BROAD')
  })
})

// ─── RSA hash stability ──────────────────────────────────

describe('RSA hash stability', () => {
  test('same headlines/descriptions/url produce identical hash regardless of order', () => {
    const campaign1 = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['A' as Headline, 'B' as Headline, 'C' as Headline],
            descriptions: ['X' as Description, 'Y' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
    })

    const campaign2 = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['C' as Headline, 'A' as Headline, 'B' as Headline],
            descriptions: ['Y' as Description, 'X' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
    })

    const resources1 = flatten(campaign1)
    const resources2 = flatten(campaign2)

    const ad1 = resources1.find(r => r.kind === 'ad')!
    const ad2 = resources2.find(r => r.kind === 'ad')!

    expect(ad1.path).toBe(ad2.path)
  })

  test('different URLs produce different hashes', () => {
    const campaign1 = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com/a',
          }],
        },
      },
    })

    const campaign2 = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com/b',
          }],
        },
      },
    })

    const ad1 = flatten(campaign1).find(r => r.kind === 'ad')!
    const ad2 = flatten(campaign2).find(r => r.kind === 'ad')!

    expect(ad1.path).not.toBe(ad2.path)
  })
})

// ─── flatten — keyword overrides ─────────────────────────

describe('flatten() keyword overrides', () => {
  test('keyword with bid override is included in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [
            { text: 'rename pdf', matchType: 'EXACT', bid: 1.50 },
          ],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const kw = resources.find(r => r.kind === 'keyword')!
    expect(kw.properties.bid).toBe(1.50)
  })

  test('keyword with finalUrl override is included in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [
            { text: 'rename pdf', matchType: 'EXACT', finalUrl: 'https://renamed.to/pdf' },
          ],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const kw = resources.find(r => r.kind === 'keyword')!
    expect(kw.properties.finalUrl).toBe('https://renamed.to/pdf')
  })

  test('keyword with status override is included in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [
            { text: 'rename pdf', matchType: 'EXACT', status: 'paused' },
          ],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const kw = resources.find(r => r.kind === 'keyword')!
    expect(kw.properties.status).toBe('paused')
  })

  test('keyword without overrides omits extra properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [
            { text: 'rename pdf', matchType: 'EXACT' },
          ],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const kw = resources.find(r => r.kind === 'keyword')!
    expect(kw.properties).not.toHaveProperty('bid')
    expect(kw.properties).not.toHaveProperty('finalUrl')
    expect(kw.properties).not.toHaveProperty('status')
  })
})

// ─── flatten — RSA pinning and paths ─────────────────────

describe('flatten() RSA pinning and paths', () => {
  test('RSA with pinned headlines includes them in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
            pinnedHeadlines: [{ text: 'H1', position: 1 }],
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.pinnedHeadlines).toEqual([{ text: 'H1', position: 1 }])
  })

  test('RSA with path1/path2 includes them in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
            path1: 'rename',
            path2: 'files',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.path1).toBe('rename')
    expect(ad.properties.path2).toBe('files')
  })

  test('RSA with mobileUrl includes it in properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
            mobileUrl: 'https://m.example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.mobileUrl).toBe('https://m.example.com')
  })

  test('RSA without extra fields omits them from properties', () => {
    const campaign = makeCampaign({
      groups: {
        test: {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties).not.toHaveProperty('pinnedHeadlines')
    expect(ad.properties).not.toHaveProperty('pinnedDescriptions')
    expect(ad.properties).not.toHaveProperty('path1')
    expect(ad.properties).not.toHaveProperty('path2')
    expect(ad.properties).not.toHaveProperty('mobileUrl')
  })
})

// ─── flatten — ad group negatives ─────────────────────────

describe('flatten() ad group negatives', () => {
  test('ad group negatives produce negative resources under the ad group path', () => {
    const campaign = makeCampaign({
      groups: {
        'pdf-core': {
          keywords: [
            { text: 'rename pdf', matchType: 'EXACT' },
          ],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
          negatives: [
            { text: 'free pdf', matchType: 'BROAD' },
            { text: 'pdf viewer', matchType: 'EXACT' },
          ],
        },
      },
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const negatives = resources.filter(r => r.kind === 'negative')
    expect(negatives).toHaveLength(2)

    const paths = negatives.map(r => r.path).sort()
    expect(paths).toContain('search-pdf-renaming/pdf-core/neg:free pdf:BROAD')
    expect(paths).toContain('search-pdf-renaming/pdf-core/neg:pdf viewer:EXACT')
  })

  test('ad group negatives are separate from campaign negatives', () => {
    const campaign = makeCampaign({
      groups: {
        'pdf-core': {
          keywords: [],
          ads: [{
            type: 'rsa',
            headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
            descriptions: ['D1' as Description, 'D2' as Description],
            finalUrl: 'https://example.com',
          }],
          negatives: [
            { text: 'ag negative', matchType: 'BROAD' },
          ],
        },
      },
      extensions: undefined,
      negatives: [
        { text: 'campaign negative', matchType: 'BROAD' },
      ],
    })
    const resources = flatten(campaign)
    const negatives = resources.filter(r => r.kind === 'negative')
    expect(negatives).toHaveLength(2)

    // Ad group negative is under the ad group path
    const agNeg = negatives.find(r => r.path.includes('pdf-core/neg:'))!
    expect(agNeg.path).toBe('search-pdf-renaming/pdf-core/neg:ag negative:BROAD')

    // Campaign negative is at campaign level
    const cNeg = negatives.find(r => !r.path.includes('pdf-core/neg:'))!
    expect(cNeg.path).toBe('search-pdf-renaming/neg:campaign negative:BROAD')
  })
})

// ─── flatten — edge cases ─────────────────────────────────

describe('flatten() edge cases', () => {
  test('campaign with no groups, no extensions, no negatives', () => {
    const campaign = makeCampaign({
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    expect(resources).toHaveLength(1)
    expect(resources[0]!.kind).toBe('campaign')
  })

  test('paused campaign preserves status', () => {
    const campaign = makeCampaign({ status: 'paused' })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.status).toBe('paused')
  })
})

// ─── flatten — new campaign config fields ────────────────

describe('flatten() campaign config fields', () => {
  test('includes startDate and endDate in campaign properties', () => {
    const campaign = makeCampaign({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.startDate).toBe('2026-04-01')
    expect(c.properties.endDate).toBe('2026-06-30')
  })

  test('includes trackingTemplate and finalUrlSuffix in campaign properties', () => {
    const campaign = makeCampaign({
      trackingTemplate: '{lpurl}?src=google',
      finalUrlSuffix: 'utm_source=google',
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.trackingTemplate).toBe('{lpurl}?src=google')
    expect(c.properties.finalUrlSuffix).toBe('utm_source=google')
  })

  test('includes customParameters in campaign properties', () => {
    const campaign = makeCampaign({
      customParameters: { channel: 'search' },
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.customParameters).toEqual({ channel: 'search' })
  })

  test('includes networkSettings in campaign properties', () => {
    const campaign = makeCampaign({
      networkSettings: { searchNetwork: true, searchPartners: true, displayNetwork: false },
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.networkSettings).toEqual({
      searchNetwork: true,
      searchPartners: true,
      displayNetwork: false,
    })
  })

  test('omits new fields from campaign properties when not set', () => {
    const campaign = makeCampaign({
      groups: {},
      extensions: undefined,
      negatives: [],
    })
    const resources = flatten(campaign)
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties).not.toHaveProperty('startDate')
    expect(c.properties).not.toHaveProperty('endDate')
    expect(c.properties).not.toHaveProperty('trackingTemplate')
    expect(c.properties).not.toHaveProperty('finalUrlSuffix')
    expect(c.properties).not.toHaveProperty('customParameters')
    expect(c.properties).not.toHaveProperty('networkSettings')
  })
})

// ─── flattenAll ───────────────────────────────────────────

describe('flattenAll()', () => {
  test('combines resources from multiple campaigns', () => {
    const c1 = makeCampaign({ name: 'Campaign One', groups: {}, extensions: undefined, negatives: [] })
    const c2 = makeCampaign({ name: 'Campaign Two', groups: {}, extensions: undefined, negatives: [] })

    const resources = flattenAll([c1, c2])
    expect(resources).toHaveLength(2)

    const paths = resources.map(r => r.path)
    expect(paths).toContain('campaign-one')
    expect(paths).toContain('campaign-two')
  })

  test('combines full campaigns with all children', () => {
    const c1 = makeCampaign({ name: 'Alpha' })
    const c2 = makeCampaign({ name: 'Beta' })

    const resources = flattenAll([c1, c2])
    // Each full campaign produces 14 resources
    expect(resources).toHaveLength(28)

    // All paths unique (campaign names differ so slugs differ)
    const paths = resources.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  test('empty array returns empty', () => {
    expect(flattenAll([])).toEqual([])
  })
})
