import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { flattenSmart, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Budget, Resource } from '../../src/core/types.ts'
import type { GoogleSmartCampaign, SmartCampaignAd } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 5, currency: 'EUR', period: 'daily' }

const smartAdFixture: SmartCampaignAd = {
  type: 'smart',
  headlines: ['Rename Files Fast', 'AI File Renaming', 'Try Free'],
  descriptions: ['Rename all your files in seconds', 'No credit card required'],
}

function makeSmartCampaign(overrides?: Partial<GoogleSmartCampaign>): GoogleSmartCampaign {
  return {
    provider: 'google',
    kind: 'smart',
    name: 'Smart - Local Business',
    status: 'enabled',
    budget,
    businessName: 'renamed.to',
    finalUrl: 'https://renamed.to',
    language: 'en',
    keywordThemes: ['file renaming', 'batch rename', 'pdf tools'],
    ad: smartAdFixture,
    ...overrides,
  }
}

// ─── google.smart() builder ──────────────────────────────────

describe('google.smart()', () => {
  test('produces a valid GoogleSmartCampaign with correct kind', () => {
    const campaign = google.smart('Smart - Local Business', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming', 'batch rename'],
      ad: smartAdFixture,
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('smart')
    expect(campaign.name).toBe('Smart - Local Business')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.businessName).toBe('renamed.to')
    expect(campaign.finalUrl).toBe('https://renamed.to')
    expect(campaign.keywordThemes).toEqual(['file renaming', 'batch rename'])
    expect(campaign.ad).toEqual(smartAdFixture)
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
    })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('language defaults to "en"', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
    })
    expect(campaign.language).toBe('en')
  })

  test('language can be overridden', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
      language: 'de',
    })
    expect(campaign.language).toBe('de')
  })

  test('businessProfile is optional and passed through', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      businessProfile: 'locations/123456',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
    })
    expect(campaign.businessProfile).toBe('locations/123456')
  })

  test('businessProfile is undefined when not provided', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
    })
    expect(campaign.businessProfile).toBeUndefined()
  })

  test('returns a plain campaign object, not a builder', () => {
    const campaign = google.smart('Test', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming'],
      ad: smartAdFixture,
    })
    // Smart campaigns are flat — no .group() method
    expect((campaign as Record<string, unknown>).group).toBeUndefined()
  })
})

// ─── smartAd helper ─────────────────────────────────────────

describe('smartAd()', () => {
  test('creates a SmartCampaignAd with type "smart"', async () => {
    const { smartAd } = await import('../../src/helpers/ads.ts')
    const ad = smartAd({
      headlines: ['One', 'Two', 'Three'],
      descriptions: ['Desc one', 'Desc two'],
    })
    expect(ad.type).toBe('smart')
    expect(ad.headlines).toEqual(['One', 'Two', 'Three'])
    expect(ad.descriptions).toEqual(['Desc one', 'Desc two'])
  })
})

// ─── flattenSmart ────────────────────────────────────────────

describe('flattenSmart()', () => {
  test('produces campaign resource with smart channelType', () => {
    const campaign = makeSmartCampaign()
    const resources = flattenSmart(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes).toBeDefined()
    expect(campaignRes!.properties.channelType).toBe('smart')
    expect(campaignRes!.properties.name).toBe('Smart - Local Business')
    expect(campaignRes!.properties.status).toBe('enabled')
    expect(campaignRes!.properties.businessName).toBe('renamed.to')
    expect(campaignRes!.properties.finalUrl).toBe('https://renamed.to')
    expect(campaignRes!.properties.language).toBe('en')
    expect(campaignRes!.properties.keywordThemes).toEqual(['file renaming', 'batch rename', 'pdf tools'])
  })

  test('produces an ad group resource', () => {
    const campaign = makeSmartCampaign()
    const resources = flattenSmart(campaign)

    const adGroups = resources.filter(r => r.kind === 'adGroup')
    expect(adGroups).toHaveLength(1)
    expect(adGroups[0]!.properties.adGroupType).toBe('smart')
  })

  test('produces an ad resource with smart ad info', () => {
    const campaign = makeSmartCampaign()
    const resources = flattenSmart(campaign)

    const ads = resources.filter(r => r.kind === 'ad')
    expect(ads).toHaveLength(1)
    expect(ads[0]!.properties.adType).toBe('smart')
    expect(ads[0]!.properties.headlines).toEqual(smartAdFixture.headlines)
    expect(ads[0]!.properties.descriptions).toEqual(smartAdFixture.descriptions)
  })

  test('includes businessProfile when present', () => {
    const campaign = makeSmartCampaign({ businessProfile: 'locations/123' })
    const resources = flattenSmart(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes!.properties.businessProfile).toBe('locations/123')
  })

  test('omits businessProfile when not present', () => {
    const campaign = makeSmartCampaign()
    const resources = flattenSmart(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes!.properties.businessProfile).toBeUndefined()
  })

  test('flattenAll dispatches smart campaigns', () => {
    const campaign = makeSmartCampaign()
    const resources = flattenAll([campaign])

    expect(resources.some(r => r.kind === 'campaign')).toBe(true)
    expect(resources.find(r => r.kind === 'campaign')!.properties.channelType).toBe('smart')
  })
})

// ─── Codegen ────────────────────────────────────────────────

describe('Smart codegen', () => {
  test('emits google.smart() with all fields', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'smart-local-business',
        properties: {
          name: 'Smart - Local Business',
          status: 'enabled',
          budget: { amount: 5, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          channelType: 'smart',
          businessName: 'renamed.to',
          finalUrl: 'https://renamed.to',
          language: 'en',
          keywordThemes: ['file renaming', 'batch rename'],
        },
      },
      {
        kind: 'adGroup',
        path: 'smart-local-business/default',
        properties: { status: 'enabled', adGroupType: 'smart' },
      },
      {
        kind: 'ad',
        path: 'smart-local-business/default/smart:abc',
        properties: {
          adType: 'smart',
          headlines: ['Rename Files Fast', 'AI File Renaming', 'Try Free'],
          descriptions: ['Rename all your files in seconds', 'No credit card required'],
        },
      },
    ]

    const output = generateCampaignFile(resources, 'Smart - Local Business')

    expect(output).toContain("google.smart('Smart - Local Business'")
    expect(output).toContain("businessName: 'renamed.to'")
    expect(output).toContain("finalUrl: 'https://renamed.to'")
    expect(output).toContain("language: 'en'")
    expect(output).toContain("'file renaming'")
    expect(output).toContain("'batch rename'")
    expect(output).toContain("from '@upspawn/ads'")
  })

  test('emits ad with headlines and descriptions', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'smart-test',
        properties: {
          name: 'Smart - Test',
          status: 'enabled',
          budget: { amount: 5, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          channelType: 'smart',
          businessName: 'Test Biz',
          finalUrl: 'https://test.com',
          language: 'en',
          keywordThemes: ['test'],
        },
      },
      {
        kind: 'adGroup',
        path: 'smart-test/default',
        properties: { status: 'enabled', adGroupType: 'smart' },
      },
      {
        kind: 'ad',
        path: 'smart-test/default/smart:abc',
        properties: {
          adType: 'smart',
          headlines: ['H1', 'H2', 'H3'],
          descriptions: ['D1', 'D2'],
        },
      },
    ]

    const output = generateCampaignFile(resources, 'Smart - Test')

    expect(output).toContain("'H1'")
    expect(output).toContain("'H2'")
    expect(output).toContain("'H3'")
    expect(output).toContain("'D1'")
    expect(output).toContain("'D2'")
  })
})

// ─── Apply ──────────────────────────────────────────────────

describe('Smart apply', () => {
  test('creates campaign with advertising_channel_type = 9 (SMART)', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'smart-local-business',
      properties: {
        name: 'Smart - Local Business',
        status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
        channelType: 'smart',
        businessName: 'renamed.to',
        finalUrl: 'https://renamed.to',
        language: 'en',
        keywordThemes: ['file renaming', 'batch rename'],
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    expect(campaignOp).toBeDefined()
    expect((campaignOp!.resource as Record<string, unknown>).advertising_channel_type).toBe(9)
  })

  test('creates campaign with smart_campaign_setting', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'smart-local-business',
      properties: {
        name: 'Smart - Local Business',
        status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
        channelType: 'smart',
        businessName: 'renamed.to',
        businessProfile: 'locations/123',
        finalUrl: 'https://renamed.to',
        language: 'en',
        keywordThemes: ['file renaming'],
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    const campaignResource = campaignOp!.resource as Record<string, unknown>
    const smartSetting = campaignResource.smart_campaign_setting as Record<string, unknown>
    expect(smartSetting).toBeDefined()
    expect(smartSetting.business_name).toBe('renamed.to')
    expect(smartSetting.business_profile_location).toBe('locations/123')
    expect(smartSetting.final_url).toBe('https://renamed.to')
    expect(smartSetting.advertising_language_code).toBe('en')
  })
})

// ─── Round-trip ─────────────────────────────────────────────

describe('Smart round-trip', () => {
  test('builder → flatten → codegen produces consistent output', () => {
    const campaign = google.smart('Smart - Local Business', {
      budget,
      businessName: 'renamed.to',
      finalUrl: 'https://renamed.to',
      keywordThemes: ['file renaming', 'batch rename'],
      ad: smartAdFixture,
    })

    const resources = flattenSmart(campaign)
    const output = generateCampaignFile(resources, 'Smart - Local Business')

    expect(output).toContain("google.smart('Smart - Local Business'")
    expect(output).toContain("businessName: 'renamed.to'")
    expect(output).toContain("finalUrl: 'https://renamed.to'")
    expect(output).toContain("'file renaming'")
    expect(output).toContain("'batch rename'")
  })
})
