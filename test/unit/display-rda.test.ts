import { describe, expect, test } from 'bun:test'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import { normalizeDisplayAdRow } from '../../src/google/fetch.ts'
import { landscape, square, logo } from '../../src/google/image-assets.ts'
import type { Resource, Change } from '../../src/core/types.ts'
import type { GoogleAdsRow } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const CUSTOMER_ID = '1234567890'

function displayAdResource(overrides?: Partial<Record<string, unknown>>): Resource {
  return {
    kind: 'ad',
    path: 'display-remarketing/remarketing/rda:abc123',
    properties: {
      adType: 'responsive-display',
      headlines: ['AI Powered', 'Rename Files Fast'],
      longHeadline: 'Rename All Your Files in Seconds with AI',
      descriptions: ['No credit card required', 'Try renamed.to free'],
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      marketingImages: [],
      squareMarketingImages: [],
      ...overrides,
    },
  }
}

// ─── Apply: RDA create ──────────────────────────────────────

describe('apply: Responsive Display Ad create', () => {
  test('creates ad_group_ad with responsive_display_ad structure', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    expect(mutations).toHaveLength(1)
    const mutation = mutations[0]!
    expect(mutation.operation).toBe('ad_group_ad')
    expect(mutation.op).toBe('create')
  })

  test('sets correct ad_group reference', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    const mutation = mutations[0]!
    expect(mutation.resource.ad_group).toBe(`customers/${CUSTOMER_ID}/adGroups/200`)
  })

  test('includes responsive_display_ad text fields', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    const ad = mutations[0]!.resource.ad as Record<string, unknown>
    const rda = ad.responsive_display_ad as Record<string, unknown>
    expect(rda).toBeDefined()
    expect(rda.headlines).toEqual([{ text: 'AI Powered' }, { text: 'Rename Files Fast' }])
    expect(rda.long_headline).toEqual({ text: 'Rename All Your Files in Seconds with AI' })
    expect(rda.descriptions).toEqual([{ text: 'No credit card required' }, { text: 'Try renamed.to free' }])
    expect(rda.business_name).toBe('renamed.to')
  })

  test('sets final_urls on the ad', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    const ad = mutations[0]!.resource.ad as Record<string, unknown>
    expect(ad.final_urls).toEqual(['https://renamed.to'])
  })

  test('image arrays are passed through (empty for now)', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    const ad = mutations[0]!.resource.ad as Record<string, unknown>
    const rda = ad.responsive_display_ad as Record<string, unknown>
    expect(rda.marketing_images).toEqual([])
    expect(rda.square_marketing_images).toEqual([])
  })

  test('optional fields are included when present', () => {
    const resource = displayAdResource({
      mainColor: '#1a1a2e',
      accentColor: '#16a34a',
      callToAction: 'Sign Up',
    })
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    const ad = mutations[0]!.resource.ad as Record<string, unknown>
    const rda = ad.responsive_display_ad as Record<string, unknown>
    expect(rda.main_color).toBe('#1a1a2e')
    expect(rda.accent_color).toBe('#16a34a')
    expect(rda.call_to_action_text).toBe('Sign Up')
  })

  test('status defaults to ENABLED (2)', () => {
    const resource = displayAdResource()
    const change: Change = { op: 'create', resource }
    const resourceMap = new Map([
      ['display-remarketing', '100'],
      ['display-remarketing/remarketing', '200'],
    ])
    const mutations = changeToMutations(change, CUSTOMER_ID, resourceMap)

    expect(mutations[0]!.resource.status).toBe(2)
  })
})

// ─── Fetch: RDA normalization ───────────────────────────────

describe('fetch: normalizeDisplayAdRow', () => {
  test('normalizes a RESPONSIVE_DISPLAY_AD row into a Resource', () => {
    const row: GoogleAdsRow = {
      ad_group_ad: {
        ad: {
          id: '9001',
          type: 'RESPONSIVE_DISPLAY_AD',
          responsive_display_ad: {
            headlines: [{ text: 'Rename Files Fast' }, { text: 'AI Powered' }],
            long_headline: { text: 'Rename All Your Files in Seconds with AI' },
            descriptions: [{ text: 'Try free' }, { text: 'No credit card' }],
            business_name: 'renamed.to',
            marketing_images: [{ asset: 'customers/123/assets/456' }],
            square_marketing_images: [{ asset: 'customers/123/assets/789' }],
          },
          final_urls: ['https://renamed.to'],
        },
        status: 2, // ENABLED
      },
      ad_group: { id: '200', name: 'Remarketing' },
      campaign: { id: '100', name: 'Display - Remarketing' },
    }

    const resource = normalizeDisplayAdRow(row)

    expect(resource.kind).toBe('ad')
    expect(resource.path).toMatch(/^display-remarketing\/remarketing\/rda:[0-9a-f]+$/)
    expect(resource.platformId).toBe('9001')
  })

  test('extracts text fields correctly', () => {
    const row: GoogleAdsRow = {
      ad_group_ad: {
        ad: {
          id: '9001',
          type: 'RESPONSIVE_DISPLAY_AD',
          responsive_display_ad: {
            headlines: [{ text: 'B' }, { text: 'A' }],
            long_headline: { text: 'Long Headline' },
            descriptions: [{ text: 'Desc 1' }],
            business_name: 'Test Co',
          },
          final_urls: ['https://example.com'],
        },
        status: 2,
      },
      ad_group: { id: '200', name: 'Main' },
      campaign: { id: '100', name: 'Test Campaign' },
    }

    const resource = normalizeDisplayAdRow(row)
    expect(resource.properties.adType).toBe('responsive-display')
    expect(resource.properties.headlines).toEqual(['A', 'B']) // sorted
    expect(resource.properties.longHeadline).toBe('Long Headline')
    expect(resource.properties.descriptions).toEqual(['Desc 1'])
    expect(resource.properties.businessName).toBe('Test Co')
    expect(resource.properties.finalUrl).toBe('https://example.com')
  })

  test('extracts image asset references', () => {
    const row: GoogleAdsRow = {
      ad_group_ad: {
        ad: {
          id: '9001',
          type: 'RESPONSIVE_DISPLAY_AD',
          responsive_display_ad: {
            headlines: [{ text: 'H1' }],
            long_headline: { text: 'Long' },
            descriptions: [{ text: 'D1' }],
            business_name: 'Test',
            marketing_images: [{ asset: 'customers/123/assets/456' }],
            square_marketing_images: [{ asset: 'customers/123/assets/789' }],
            logo_images: [{ asset: 'customers/123/assets/111' }],
          },
          final_urls: ['https://example.com'],
        },
        status: 2,
      },
      ad_group: { id: '200', name: 'Main' },
      campaign: { id: '100', name: 'Test' },
    }

    const resource = normalizeDisplayAdRow(row)
    expect(resource.properties.marketingImages).toEqual(['customers/123/assets/456'])
    expect(resource.properties.squareMarketingImages).toEqual(['customers/123/assets/789'])
    expect(resource.properties.logoImages).toEqual(['customers/123/assets/111'])
  })

  test('extracts optional style fields', () => {
    const row: GoogleAdsRow = {
      ad_group_ad: {
        ad: {
          id: '9001',
          type: 'RESPONSIVE_DISPLAY_AD',
          responsive_display_ad: {
            headlines: [{ text: 'H1' }],
            long_headline: { text: 'Long' },
            descriptions: [{ text: 'D1' }],
            business_name: 'Test',
            main_color: '#FF0000',
            accent_color: '#00FF00',
            call_to_action_text: 'Try Free',
          },
          final_urls: ['https://example.com'],
        },
        status: 2,
      },
      ad_group: { id: '200', name: 'Main' },
      campaign: { id: '100', name: 'Test' },
    }

    const resource = normalizeDisplayAdRow(row)
    expect(resource.properties.mainColor).toBe('#FF0000')
    expect(resource.properties.accentColor).toBe('#00FF00')
    expect(resource.properties.callToAction).toBe('Try Free')
  })

  test('maps paused status', () => {
    const row: GoogleAdsRow = {
      ad_group_ad: {
        ad: {
          id: '9001',
          type: 'RESPONSIVE_DISPLAY_AD',
          responsive_display_ad: {
            headlines: [{ text: 'H1' }],
            long_headline: { text: 'Long' },
            descriptions: [{ text: 'D1' }],
            business_name: 'Test',
          },
          final_urls: ['https://example.com'],
        },
        status: 3, // PAUSED
      },
      ad_group: { id: '200', name: 'Main' },
      campaign: { id: '100', name: 'Test' },
    }

    const resource = normalizeDisplayAdRow(row)
    expect(resource.properties.status).toBe('paused')
  })
})

// ─── Codegen: RDA ────────────────────────────────────────────

describe('codegen: Responsive Display Ad', () => {
  function displayCampaignResources(adOverrides?: Record<string, unknown>): Resource[] {
    return [
      {
        kind: 'campaign',
        path: 'display-remarketing',
        properties: {
          name: 'Display - Remarketing',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [{ type: 'geo', countries: ['US'] }] },
          channelType: 'display',
        },
      },
      {
        kind: 'adGroup',
        path: 'display-remarketing/remarketing',
        properties: {
          status: 'enabled',
          adGroupType: 'display',
        },
      },
      {
        kind: 'ad',
        path: 'display-remarketing/remarketing/rda:abc123',
        properties: {
          adType: 'responsive-display',
          headlines: ['AI Powered', 'Rename Files Fast'],
          longHeadline: 'Rename All Your Files in Seconds with AI',
          descriptions: ['No credit card required', 'Try renamed.to free'],
          businessName: 'renamed.to',
          finalUrl: 'https://renamed.to',
          marketingImages: [landscape('./hero.png')],
          squareMarketingImages: [square('./hero-square.png')],
          ...adOverrides,
        },
      },
    ]
  }

  test('emits responsiveDisplay() helper call', () => {
    const code = generateCampaignFile(
      displayCampaignResources(),
      'Display - Remarketing',
    )
    expect(code).toContain('responsiveDisplay(')
    expect(code).toMatch(/import .* responsiveDisplay/)
  })

  test('emits all required RDA text fields', () => {
    const code = generateCampaignFile(
      displayCampaignResources(),
      'Display - Remarketing',
    )
    expect(code).toContain("'AI Powered'")
    expect(code).toContain("'Rename Files Fast'")
    expect(code).toContain("'Rename All Your Files in Seconds with AI'")
    expect(code).toContain("'renamed.to'")
    expect(code).toContain("'https://renamed.to'")
  })

  test('emits image helper calls', () => {
    const code = generateCampaignFile(
      displayCampaignResources(),
      'Display - Remarketing',
    )
    expect(code).toContain("landscape('./hero.png')")
    expect(code).toContain("square('./hero-square.png')")
    expect(code).toMatch(/import .* landscape/)
    expect(code).toMatch(/import .* square/)
  })

  test('emits optional style fields when present', () => {
    const code = generateCampaignFile(
      displayCampaignResources({
        mainColor: '#1a1a2e',
        accentColor: '#16a34a',
        callToAction: 'Sign Up',
      }),
      'Display - Remarketing',
    )
    expect(code).toContain("mainColor: '#1a1a2e'")
    expect(code).toContain("accentColor: '#16a34a'")
    expect(code).toContain("callToAction: 'Sign Up'")
  })

  test('omits optional style fields when not present', () => {
    const code = generateCampaignFile(
      displayCampaignResources(),
      'Display - Remarketing',
    )
    expect(code).not.toContain('mainColor')
    expect(code).not.toContain('accentColor')
    expect(code).not.toContain('callToAction')
  })

  test('uses google.display() builder', () => {
    const code = generateCampaignFile(
      displayCampaignResources(),
      'Display - Remarketing',
    )
    expect(code).toContain("google.display('Display - Remarketing'")
  })
})

// ─── Codegen: responsiveDisplay helper ───────────────────────

describe('responsiveDisplay() helper', () => {
  // The helper itself should be importable and produce a valid ResponsiveDisplayAd
  test('is exported from helpers', async () => {
    const { responsiveDisplay } = await import('../../src/helpers/display-ads.ts')
    expect(typeof responsiveDisplay).toBe('function')
  })

  test('produces a valid ResponsiveDisplayAd', async () => {
    const { responsiveDisplay } = await import('../../src/helpers/display-ads.ts')
    const ad = responsiveDisplay({
      headlines: ['H1', 'H2'],
      longHeadline: 'Long headline here',
      descriptions: ['D1'],
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      marketingImages: [landscape('./hero.png')],
      squareMarketingImages: [square('./square.png')],
    })

    expect(ad.type).toBe('responsive-display')
    expect(ad.headlines).toEqual(['H1', 'H2'])
    expect(ad.longHeadline).toBe('Long headline here')
    expect(ad.descriptions).toEqual(['D1'])
    expect(ad.businessName).toBe('renamed.to')
    expect(ad.finalUrl).toBe('https://renamed.to')
    expect(ad.marketingImages).toEqual([landscape('./hero.png')])
    expect(ad.squareMarketingImages).toEqual([square('./square.png')])
  })

  test('includes optional fields when provided', async () => {
    const { responsiveDisplay } = await import('../../src/helpers/display-ads.ts')
    const ad = responsiveDisplay({
      headlines: ['H1'],
      longHeadline: 'Long',
      descriptions: ['D1'],
      businessName: 'Test',
      finalUrl: 'https://test.com',
      marketingImages: [],
      squareMarketingImages: [],
      logoImages: [logo('./logo.png')],
      mainColor: '#FF0000',
      accentColor: '#00FF00',
      callToAction: 'Try Free',
    })

    expect(ad.logoImages).toEqual([logo('./logo.png')])
    expect(ad.mainColor).toBe('#FF0000')
    expect(ad.accentColor).toBe('#00FF00')
    expect(ad.callToAction).toBe('Try Free')
  })
})
