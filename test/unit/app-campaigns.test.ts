import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { flattenApp, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Budget, Targeting, Resource } from '../../src/core/types.ts'
import type { GoogleAppCampaign, AppAdInfo } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 10, currency: 'EUR', period: 'daily' }

const usTargeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['US', 'DE'] },
    { type: 'language', languages: ['en', 'de'] },
  ],
}

const appAdFixture: AppAdInfo = {
  type: 'app',
  headlines: ['Rename Files Fast', 'AI File Renaming'],
  descriptions: ['Rename all your files in seconds', 'No credit card required'],
}

function makeAppCampaign(overrides?: Partial<GoogleAppCampaign>): GoogleAppCampaign {
  return {
    provider: 'google',
    kind: 'app',
    name: 'App - Install Campaign',
    status: 'enabled',
    budget,
    bidding: { type: 'target-cpa', targetCpa: 5.0 },
    targeting: usTargeting,
    appId: 'com.renamed.to',
    appStore: 'google',
    goal: 'installs',
    ad: appAdFixture,
    ...overrides,
  }
}

// ─── google.app() builder ────────────────────────────────────

describe('google.app()', () => {
  test('produces a valid GoogleAppCampaign with correct kind', () => {
    const campaign = google.app('App - Install Campaign', {
      budget,
      bidding: { type: 'target-cpa', targetCpa: 5.0 },
      targeting: usTargeting,
      appId: 'com.renamed.to',
      appStore: 'google',
      ad: appAdFixture,
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('app')
    expect(campaign.name).toBe('App - Install Campaign')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'target-cpa', targetCpa: 5.0 })
    expect(campaign.targeting).toEqual(usTargeting)
    expect(campaign.appId).toBe('com.renamed.to')
    expect(campaign.appStore).toBe('google')
    expect(campaign.ad).toEqual(appAdFixture)
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
    })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('goal defaults to "installs"', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
    })
    expect(campaign.goal).toBe('installs')
  })

  test('goal can be set to "in-app-actions"', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
      goal: 'in-app-actions',
    })
    expect(campaign.goal).toBe('in-app-actions')
  })

  test('targeting defaults to empty rules', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
    })
    expect(campaign.targeting).toEqual({ rules: [] })
  })

  test('apple app store is supported', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: '123456789',
      appStore: 'apple',
      ad: appAdFixture,
    })
    expect(campaign.appStore).toBe('apple')
  })

  test('startDate and endDate are passed through', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    })
    expect(campaign.startDate).toBe('2026-04-01')
    expect(campaign.endDate).toBe('2026-06-30')
  })

  test('optional fields are omitted when not provided', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
    })
    expect(campaign.startDate).toBeUndefined()
    expect(campaign.endDate).toBeUndefined()
  })

  test('returns a plain campaign object, not a builder', () => {
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: appAdFixture,
    })
    expect((campaign as Record<string, unknown>).group).toBeUndefined()
  })

  test('ad with images and videos is preserved', () => {
    const adWithMedia: AppAdInfo = {
      type: 'app',
      headlines: ['H1', 'H2'],
      descriptions: ['D1'],
      images: [{ type: 'image-ref' as const, path: './hero.png', aspectRatio: 'landscape' as const }],
      videos: ['https://youtube.com/watch?v=abc'],
    }
    const campaign = google.app('Test', {
      budget,
      bidding: 'maximize-conversions',
      appId: 'com.test',
      appStore: 'google',
      ad: adWithMedia,
    })
    expect(campaign.ad.images).toHaveLength(1)
    expect(campaign.ad.videos).toEqual(['https://youtube.com/watch?v=abc'])
  })
})

// ─── appAd helper ───────────────────────────────────────────

describe('appAd()', () => {
  test('creates an AppAdInfo with type "app"', async () => {
    const { appAd } = await import('../../src/helpers/ads.ts')
    const ad = appAd({
      headlines: ['H1', 'H2'],
      descriptions: ['D1'],
    })
    expect(ad.type).toBe('app')
    expect(ad.headlines).toEqual(['H1', 'H2'])
    expect(ad.descriptions).toEqual(['D1'])
  })
})

// ─── flattenApp ──────────────────────────────────────────────

describe('flattenApp()', () => {
  test('produces campaign resource with app channelType', () => {
    const campaign = makeAppCampaign()
    const resources = flattenApp(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes).toBeDefined()
    expect(campaignRes!.properties.channelType).toBe('app')
    expect(campaignRes!.properties.name).toBe('App - Install Campaign')
    expect(campaignRes!.properties.status).toBe('enabled')
    expect(campaignRes!.properties.appId).toBe('com.renamed.to')
    expect(campaignRes!.properties.appStore).toBe('google')
    expect(campaignRes!.properties.goal).toBe('installs')
  })

  test('produces an ad group resource', () => {
    const campaign = makeAppCampaign()
    const resources = flattenApp(campaign)

    const adGroups = resources.filter(r => r.kind === 'adGroup')
    expect(adGroups).toHaveLength(1)
    expect(adGroups[0]!.properties.adGroupType).toBe('app')
  })

  test('produces an ad resource with app ad info', () => {
    const campaign = makeAppCampaign()
    const resources = flattenApp(campaign)

    const ads = resources.filter(r => r.kind === 'ad')
    expect(ads).toHaveLength(1)
    expect(ads[0]!.properties.adType).toBe('app')
    expect(ads[0]!.properties.headlines).toEqual(appAdFixture.headlines)
    expect(ads[0]!.properties.descriptions).toEqual(appAdFixture.descriptions)
  })

  test('flattenAll dispatches app campaigns', () => {
    const campaign = makeAppCampaign()
    const resources = flattenAll([campaign])

    expect(resources.some(r => r.kind === 'campaign')).toBe(true)
    expect(resources.find(r => r.kind === 'campaign')!.properties.channelType).toBe('app')
  })
})

// ─── Codegen ────────────────────────────────────────────────

describe('App codegen', () => {
  test('emits google.app() with all fields', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'app-install-campaign',
        properties: {
          name: 'App - Install Campaign',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'target-cpa', targetCpa: 5.0 },
          targeting: {
            rules: [
              { type: 'geo', countries: ['US'] },
              { type: 'language', languages: ['en'] },
            ],
          },
          channelType: 'app',
          appId: 'com.renamed.to',
          appStore: 'google',
          goal: 'installs',
        },
      },
      {
        kind: 'adGroup',
        path: 'app-install-campaign/default',
        properties: { status: 'enabled', adGroupType: 'app' },
      },
      {
        kind: 'ad',
        path: 'app-install-campaign/default/app:abc',
        properties: {
          adType: 'app',
          headlines: ['Rename Files Fast', 'AI File Renaming'],
          descriptions: ['Rename all your files in seconds'],
        },
      },
    ]

    const output = generateCampaignFile(resources, 'App - Install Campaign')

    expect(output).toContain("google.app('App - Install Campaign'")
    expect(output).toContain("appId: 'com.renamed.to'")
    expect(output).toContain("appStore: 'google'")
    expect(output).toContain("goal: 'installs'")
    expect(output).toContain("from '@upspawn/ads'")
  })

  test('emits ad with headlines and descriptions', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'app-test',
        properties: {
          name: 'App - Test',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          channelType: 'app',
          appId: 'com.test',
          appStore: 'google',
          goal: 'installs',
        },
      },
      {
        kind: 'adGroup',
        path: 'app-test/default',
        properties: { status: 'enabled', adGroupType: 'app' },
      },
      {
        kind: 'ad',
        path: 'app-test/default/app:abc',
        properties: {
          adType: 'app',
          headlines: ['H1', 'H2', 'H3'],
          descriptions: ['D1', 'D2'],
        },
      },
    ]

    const output = generateCampaignFile(resources, 'App - Test')

    expect(output).toContain("'H1'")
    expect(output).toContain("'H2'")
    expect(output).toContain("'D1'")
    expect(output).toContain("'D2'")
  })
})

// ─── Apply ──────────────────────────────────────────────────

describe('App apply', () => {
  test('creates campaign with advertising_channel_type = 7 (MULTI_CHANNEL)', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'app-install-campaign',
      properties: {
        name: 'App - Install Campaign',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'target-cpa', targetCpa: 5.0 },
        targeting: { rules: [] },
        channelType: 'app',
        appId: 'com.renamed.to',
        appStore: 'google',
        goal: 'installs',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    expect(campaignOp).toBeDefined()
    expect((campaignOp!.resource as Record<string, unknown>).advertising_channel_type).toBe(7)
  })

  test('creates campaign with app_campaign_setting', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'app-install-campaign',
      properties: {
        name: 'App - Install Campaign',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'target-cpa', targetCpa: 5.0 },
        targeting: { rules: [] },
        channelType: 'app',
        appId: 'com.renamed.to',
        appStore: 'google',
        goal: 'installs',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    const campaignResource = campaignOp!.resource as Record<string, unknown>
    const appSetting = campaignResource.app_campaign_setting as Record<string, unknown>
    expect(appSetting).toBeDefined()
    expect(appSetting.app_id).toBe('com.renamed.to')
    expect(appSetting.app_store).toBe(2) // GOOGLE_APP_STORE
  })

  test('apple app store maps to app_store = 3', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'app-ios',
      properties: {
        name: 'App - iOS',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
        channelType: 'app',
        appId: '123456789',
        appStore: 'apple',
        goal: 'installs',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    const campaignResource = campaignOp!.resource as Record<string, unknown>
    const appSetting = campaignResource.app_campaign_setting as Record<string, unknown>
    expect(appSetting.app_store).toBe(3) // APPLE_APP_STORE
  })

  test('in-app-actions goal maps to APP_CAMPAIGN_FOR_ENGAGEMENT sub type', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'app-engagement',
      properties: {
        name: 'App - Engagement',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
        channelType: 'app',
        appId: 'com.test',
        appStore: 'google',
        goal: 'in-app-actions',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const campaignOp = ops.find(op => op.operation === 'campaign')
    const campaignResource = campaignOp!.resource as Record<string, unknown>
    // APP_CAMPAIGN_FOR_ENGAGEMENT = 3 in the AdvertisingChannelSubType enum
    expect(campaignResource.advertising_channel_sub_type).toBe(3)
  })
})

// ─── Round-trip ─────────────────────────────────────────────

describe('App round-trip', () => {
  test('builder → flatten → codegen produces consistent output', () => {
    const campaign = google.app('App - Install Campaign', {
      budget,
      bidding: { type: 'target-cpa', targetCpa: 5.0 },
      targeting: usTargeting,
      appId: 'com.renamed.to',
      appStore: 'google',
      ad: appAdFixture,
    })

    const resources = flattenApp(campaign)
    const output = generateCampaignFile(resources, 'App - Install Campaign')

    expect(output).toContain("google.app('App - Install Campaign'")
    expect(output).toContain("appId: 'com.renamed.to'")
    expect(output).toContain("appStore: 'google'")
    expect(output).toContain("'Rename Files Fast'")
    expect(output).toContain("'AI File Renaming'")
  })
})
