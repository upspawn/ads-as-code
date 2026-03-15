import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { flattenShopping, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Budget, Targeting, Resource } from '../../src/core/types.ts'
import type { GoogleShoppingCampaign } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 10, currency: 'EUR', period: 'daily' }

const usTargeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['US', 'DE'] },
    { type: 'language', languages: ['en', 'de'] },
  ],
}

function makeShoppingCampaign(overrides?: Partial<GoogleShoppingCampaign>): GoogleShoppingCampaign {
  return {
    provider: 'google',
    kind: 'shopping',
    name: 'Shopping - Products',
    status: 'enabled',
    budget,
    bidding: { type: 'maximize-clicks' },
    targeting: usTargeting,
    shoppingSetting: { merchantId: 123456789 },
    groups: {
      'all-products': { },
    },
    negatives: [],
    ...overrides,
  }
}

// ─── google.shopping() builder ──────────────────────────────

describe('google.shopping()', () => {
  test('produces a valid GoogleShoppingCampaign with correct kind', () => {
    const campaign = google.shopping('Shopping - Products', {
      budget,
      bidding: 'maximize-clicks',
      targeting: usTargeting,
      merchantId: 123456789,
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('shopping')
    expect(campaign.name).toBe('Shopping - Products')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'maximize-clicks' })
    expect(campaign.targeting).toEqual(usTargeting)
    expect(campaign.shoppingSetting.merchantId).toBe(123456789)
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('groups starts as empty object', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    expect(campaign.groups).toEqual({})
  })

  test('targeting defaults to empty rules', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    expect(campaign.targeting).toEqual({ rules: [] })
  })

  test('negatives defaults to empty array', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    expect(campaign.negatives).toEqual([])
  })

  test('optional fields are omitted when not provided', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    expect(campaign.startDate).toBeUndefined()
    expect(campaign.endDate).toBeUndefined()
    expect(campaign.trackingTemplate).toBeUndefined()
    expect(campaign.finalUrlSuffix).toBeUndefined()
  })

  test('optional fields are passed through when provided', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      trackingTemplate: '{lpurl}?src=shopping',
      finalUrlSuffix: 'utm_medium=shopping',
    })
    expect(campaign.startDate).toBe('2026-04-01')
    expect(campaign.endDate).toBe('2026-06-30')
    expect(campaign.trackingTemplate).toBe('{lpurl}?src=shopping')
    expect(campaign.finalUrlSuffix).toBe('utm_medium=shopping')
  })

  test('shopping settings are passed through', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
      campaignPriority: 2,
      enableLocal: true,
      feedLabel: 'online',
    })
    expect(campaign.shoppingSetting).toEqual({
      merchantId: 123456789,
      campaignPriority: 2,
      enableLocal: true,
      feedLabel: 'online',
    })
  })

  test('.group() adds ad groups with optional bid', () => {
    const campaign = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    .group('all-products', {})
    .group('electronics', { bid: 0.75, status: 'paused' })

    expect(Object.keys(campaign.groups)).toEqual(['all-products', 'electronics'])
    expect(campaign.groups['all-products']).toEqual({})
    expect(campaign.groups['electronics']).toEqual({ bid: 0.75, status: 'paused' })
  })

  test('immutable chaining — each .group() returns a new builder', () => {
    const base = google.shopping('Test', {
      budget,
      bidding: 'maximize-clicks',
      merchantId: 123456789,
    })
    const withGroup = base.group('products', {})

    expect(Object.keys(base.groups)).toEqual([])
    expect(Object.keys(withGroup.groups)).toEqual(['products'])
  })
})

// ─── flattenShopping ────────────────────────────────────────

describe('flattenShopping()', () => {
  test('produces campaign resource with shopping channelType and shoppingSetting', () => {
    const campaign = makeShoppingCampaign()
    const resources = flattenShopping(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes).toBeDefined()
    expect(campaignRes!.properties.channelType).toBe('shopping')
    expect(campaignRes!.properties.shoppingSetting).toEqual({ merchantId: 123456789 })
    expect(campaignRes!.properties.name).toBe('Shopping - Products')
    expect(campaignRes!.properties.status).toBe('enabled')
  })

  test('produces ad group resources with shopping adGroupType', () => {
    const campaign = makeShoppingCampaign()
    const resources = flattenShopping(campaign)

    const adGroups = resources.filter(r => r.kind === 'adGroup')
    expect(adGroups).toHaveLength(1)
    expect(adGroups[0]!.path).toBe('shopping-products/all-products')
    expect(adGroups[0]!.properties.adGroupType).toBe('shopping')
    expect(adGroups[0]!.properties.status).toBe('enabled')
  })

  test('ad group with bid includes bid property', () => {
    const campaign = makeShoppingCampaign({
      groups: {
        'electronics': { bid: 0.50 },
      },
    })
    const resources = flattenShopping(campaign)

    const adGroup = resources.find(r => r.kind === 'adGroup')
    expect(adGroup!.properties.bid).toBe(0.50)
  })

  test('ad group without bid omits bid property', () => {
    const campaign = makeShoppingCampaign()
    const resources = flattenShopping(campaign)

    const adGroup = resources.find(r => r.kind === 'adGroup')
    expect(adGroup!.properties.bid).toBeUndefined()
  })

  test('produces negative resources for campaign-level negatives', () => {
    const campaign = makeShoppingCampaign({
      negatives: [
        { text: 'free', matchType: 'BROAD' },
        { text: 'cheap', matchType: 'EXACT' },
      ],
    })
    const resources = flattenShopping(campaign)

    const negatives = resources.filter(r => r.kind === 'negative')
    expect(negatives).toHaveLength(2)
    expect(negatives[0]!.path).toBe('shopping-products/neg:free:BROAD')
  })

  test('includes optional campaign properties', () => {
    const campaign = makeShoppingCampaign({
      trackingTemplate: '{lpurl}?src=shopping',
      networkSettings: { searchNetwork: true, searchPartners: false, displayNetwork: false },
      shoppingSetting: {
        merchantId: 123456789,
        campaignPriority: 1,
        enableLocal: true,
        feedLabel: 'online',
      },
    })
    const resources = flattenShopping(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes!.properties.trackingTemplate).toBe('{lpurl}?src=shopping')
    expect(campaignRes!.properties.networkSettings).toEqual({
      searchNetwork: true,
      searchPartners: false,
      displayNetwork: false,
    })
    expect(campaignRes!.properties.shoppingSetting).toEqual({
      merchantId: 123456789,
      campaignPriority: 1,
      enableLocal: true,
      feedLabel: 'online',
    })
  })

  test('flattenAll dispatches shopping campaigns', () => {
    const campaign = makeShoppingCampaign()
    const resources = flattenAll([campaign])

    expect(resources.some(r => r.kind === 'campaign')).toBe(true)
    expect(resources.find(r => r.kind === 'campaign')!.properties.channelType).toBe('shopping')
  })
})

// ─── Codegen ────────────────────────────────────────────────

describe('Shopping codegen', () => {
  test('emits google.shopping() with merchantId', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'shopping-products',
        properties: {
          name: 'Shopping - Products',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-clicks' },
          targeting: {
            rules: [
              { type: 'geo', countries: ['US'] },
              { type: 'language', languages: ['en'] },
            ],
          },
          channelType: 'shopping',
          shoppingSetting: { merchantId: 123456789 },
        },
      },
      {
        kind: 'adGroup',
        path: 'shopping-products/all-products',
        properties: { status: 'enabled', adGroupType: 'shopping' },
      },
    ]

    const output = generateCampaignFile(resources, 'Shopping - Products')

    expect(output).toContain("google.shopping('Shopping - Products'")
    expect(output).toContain('merchantId: 123456789')
    expect(output).toContain("from '@upspawn/ads'")
  })

  test('emits campaignPriority, enableLocal, feedLabel when present', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'shopping-products',
        properties: {
          name: 'Shopping - Products',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-clicks' },
          channelType: 'shopping',
          shoppingSetting: {
            merchantId: 123456789,
            campaignPriority: 2,
            enableLocal: true,
            feedLabel: 'online',
          },
        },
      },
    ]

    const output = generateCampaignFile(resources, 'Shopping - Products')

    expect(output).toContain('merchantId: 123456789')
    expect(output).toContain('campaignPriority: 2')
    expect(output).toContain('enableLocal: true')
    expect(output).toContain("feedLabel: 'online'")
  })

  test('shopping ad groups use .group() with simple bid config', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'shopping-products',
        properties: {
          name: 'Shopping - Products',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-clicks' },
          channelType: 'shopping',
          shoppingSetting: { merchantId: 123456789 },
        },
      },
      {
        kind: 'adGroup',
        path: 'shopping-products/electronics',
        properties: { status: 'enabled', adGroupType: 'shopping', bid: 0.75 },
      },
    ]

    const output = generateCampaignFile(resources, 'Shopping - Products')

    expect(output).toContain(".group('electronics'")
    expect(output).toContain('bid: 0.75')
  })
})

// ─── Apply ──────────────────────────────────────────────────

describe('Shopping apply', () => {
  test('creates campaign with advertising_channel_type = 4 (SHOPPING)', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'shopping-products',
      properties: {
        name: 'Shopping - Products',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-clicks' },
        targeting: { rules: [] },
        channelType: 'shopping',
        shoppingSetting: {
          merchantId: 123456789,
          campaignPriority: 1,
          enableLocal: false,
        },
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    // Find the campaign operation
    const campaignOp = ops.find(op => op.operation === 'campaign')
    expect(campaignOp).toBeDefined()
    expect((campaignOp!.resource as Record<string, unknown>).advertising_channel_type).toBe(4)

    // Check shopping_setting
    const shoppingSetting = (campaignOp!.resource as Record<string, unknown>).shopping_setting as Record<string, unknown>
    expect(shoppingSetting).toBeDefined()
    expect(shoppingSetting.merchant_id).toBe(123456789)
    expect(shoppingSetting.campaign_priority).toBe(1)
    expect(shoppingSetting.enable_local).toBe(false)
  })

  test('creates ad group with SHOPPING_PRODUCT_ADS type', () => {
    const resource: Resource = {
      kind: 'adGroup',
      path: 'shopping-products/all-products',
      properties: {
        status: 'enabled',
        adGroupType: 'shopping',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const adGroupOp = ops.find(op => op.operation === 'ad_group')
    expect(adGroupOp).toBeDefined()
    // SHOPPING_PRODUCT_ADS = 5 in the AdGroupType enum
    expect((adGroupOp!.resource as Record<string, unknown>).type).toBe(5)
  })

  test('shopping ad group with bid includes cpc_bid_micros', () => {
    const resource: Resource = {
      kind: 'adGroup',
      path: 'shopping-products/electronics',
      properties: {
        status: 'enabled',
        adGroupType: 'shopping',
        bid: 0.75,
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    const adGroupOp = ops.find(op => op.operation === 'ad_group')
    expect(adGroupOp).toBeDefined()
    expect((adGroupOp!.resource as Record<string, unknown>).cpc_bid_micros).toBe('750000')
  })
})

// ─── Round-trip ─────────────────────────────────────────────

describe('Shopping round-trip', () => {
  test('builder → flatten → codegen produces consistent output', () => {
    const campaign = google.shopping('Shopping - Products', {
      budget,
      bidding: 'maximize-clicks',
      targeting: usTargeting,
      merchantId: 123456789,
      campaignPriority: 1,
    })
    .group('all-products', {})
    .group('electronics', { bid: 0.50 })

    const resources = flattenShopping(campaign)
    const output = generateCampaignFile(resources, 'Shopping - Products')

    // Key elements are preserved through the round-trip
    expect(output).toContain("google.shopping('Shopping - Products'")
    expect(output).toContain('merchantId: 123456789')
    expect(output).toContain('campaignPriority: 1')
    expect(output).toContain(".group('all-products'")
    expect(output).toContain(".group('electronics'")
    expect(output).toContain('bid: 0.5')
  })
})
