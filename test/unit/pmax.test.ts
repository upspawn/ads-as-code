import { describe, expect, test } from 'bun:test'
import { google } from '../../src/google/index.ts'
import { flattenPMax, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Budget, Targeting, Resource } from '../../src/core/types.ts'
import type { GooglePMaxCampaign, AssetGroupInput } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 15, currency: 'EUR', period: 'daily' }

const usTargeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['US', 'DE'] },
    { type: 'language', languages: ['en', 'de'] },
  ],
}

const sampleAssetGroup: AssetGroupInput = {
  finalUrls: ['https://renamed.to'],
  headlines: ['Rename Files Fast', 'AI File Renaming', 'Batch Rename Files'],
  longHeadlines: ['Rename All Your Files in Seconds with AI'],
  descriptions: ['Try renamed.to free today', 'No credit card required'],
  businessName: 'renamed.to',
}

function makePMaxCampaign(overrides?: Partial<GooglePMaxCampaign>): GooglePMaxCampaign {
  return {
    provider: 'google',
    kind: 'performance-max',
    name: 'PMax - Renamed.to',
    status: 'enabled',
    budget,
    bidding: { type: 'maximize-conversions' },
    targeting: usTargeting,
    assetGroups: {
      'main': sampleAssetGroup,
    },
    ...overrides,
  }
}

// ─── google.performanceMax() builder ────────────────────────

describe('google.performanceMax()', () => {
  test('produces a valid GooglePMaxCampaign with correct kind', () => {
    const campaign = google.performanceMax('PMax - Renamed.to', {
      budget,
      bidding: 'maximize-conversions',
      targeting: usTargeting,
    })

    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('performance-max')
    expect(campaign.name).toBe('PMax - Renamed.to')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'maximize-conversions' })
    expect(campaign.targeting).toEqual(usTargeting)
  })

  test('status defaults to "enabled"', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
    expect(campaign.status).toBe('enabled')
  })

  test('status can be set to "paused"', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
      status: 'paused',
    })
    expect(campaign.status).toBe('paused')
  })

  test('assetGroups starts empty', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
    expect(campaign.assetGroups).toEqual({})
  })

  test('targeting defaults to empty rules', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
    expect(campaign.targeting).toEqual({ rules: [] })
  })

  test('optional fields are omitted when not provided', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
    expect(campaign.startDate).toBeUndefined()
    expect(campaign.endDate).toBeUndefined()
    expect(campaign.trackingTemplate).toBeUndefined()
    expect(campaign.finalUrlSuffix).toBeUndefined()
    expect(campaign.urlExpansion).toBeUndefined()
  })

  test('optional fields are passed through when provided', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      trackingTemplate: '{lpurl}?src=pmax',
      finalUrlSuffix: 'utm_medium=pmax',
      urlExpansion: false,
    })
    expect(campaign.startDate).toBe('2026-04-01')
    expect(campaign.endDate).toBe('2026-06-30')
    expect(campaign.trackingTemplate).toBe('{lpurl}?src=pmax')
    expect(campaign.finalUrlSuffix).toBe('utm_medium=pmax')
    expect(campaign.urlExpansion).toBe(false)
  })

  test('bidding string shorthand normalizes to object', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversion-value',
    })
    expect(campaign.bidding).toEqual({ type: 'maximize-conversion-value' })
  })
})

// ─── .assetGroup() chaining ─────────────────────────────────

describe('pmax .assetGroup()', () => {
  test('adds an asset group', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    }).assetGroup('main', sampleAssetGroup)

    expect(campaign.assetGroups['main']).toBeDefined()
    expect(campaign.assetGroups['main']!.headlines).toHaveLength(3)
    expect(campaign.assetGroups['main']!.businessName).toBe('renamed.to')
  })

  test('multiple asset groups accumulate via chaining', () => {
    const campaign = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
      .assetGroup('main', sampleAssetGroup)
      .assetGroup('construction', {
        ...sampleAssetGroup,
        finalUrls: ['https://renamed.to/construction'],
      })

    expect(Object.keys(campaign.assetGroups)).toEqual(['main', 'construction'])
  })

  test('original campaign is not mutated by chaining', () => {
    const base = google.performanceMax('Test', {
      budget,
      bidding: 'maximize-conversions',
    })
    const withGroup = base.assetGroup('main', sampleAssetGroup)

    expect(Object.keys(base.assetGroups)).toEqual([])
    expect(Object.keys(withGroup.assetGroups)).toEqual(['main'])
  })
})

// ─── flattenPMax ────────────────────────────────────────────

describe('flattenPMax()', () => {
  const campaign = makePMaxCampaign()
  const resources = flattenPMax(campaign)

  test('produces campaign + assetGroup resources', () => {
    // 1 campaign + 1 asset group = 2
    expect(resources).toHaveLength(2)
  })

  test('all paths are unique', () => {
    const paths = resources.map(r => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  test('campaign resource has channelType: performance-max', () => {
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.properties.channelType).toBe('performance-max')
    expect(c.properties.name).toBe('PMax - Renamed.to')
    expect(c.properties.status).toBe('enabled')
  })

  test('campaign resource has correct path', () => {
    const c = resources.find(r => r.kind === 'campaign')!
    expect(c.path).toBe('pmax-renamed-to')
  })

  test('asset group resource has correct kind and path', () => {
    const ag = resources.find(r => r.kind === 'assetGroup')!
    expect(ag.kind).toBe('assetGroup')
    expect(ag.path).toBe('pmax-renamed-to/main')
  })

  test('asset group contains all required fields', () => {
    const ag = resources.find(r => r.kind === 'assetGroup')!
    expect(ag.properties.name).toBe('main')
    expect(ag.properties.status).toBe('enabled')
    expect(ag.properties.finalUrls).toEqual(['https://renamed.to'])
    expect(ag.properties.headlines).toEqual(['Rename Files Fast', 'AI File Renaming', 'Batch Rename Files'])
    expect(ag.properties.longHeadlines).toEqual(['Rename All Your Files in Seconds with AI'])
    expect(ag.properties.descriptions).toEqual(['Try renamed.to free today', 'No credit card required'])
    expect(ag.properties.businessName).toBe('renamed.to')
  })

  test('asset group omits optional fields when not present', () => {
    const ag = resources.find(r => r.kind === 'assetGroup')!
    expect(ag.properties).not.toHaveProperty('images')
    expect(ag.properties).not.toHaveProperty('logos')
    expect(ag.properties).not.toHaveProperty('videos')
    expect(ag.properties).not.toHaveProperty('callToAction')
    expect(ag.properties).not.toHaveProperty('audienceSignal')
  })

  test('asset group includes optional fields when present', () => {
    const c = makePMaxCampaign({
      assetGroups: {
        'main': {
          ...sampleAssetGroup,
          callToAction: 'Sign Up',
          path1: 'rename',
          path2: 'files',
          videos: ['https://youtube.com/watch?v=abc123'],
        },
      },
    })
    const res = flattenPMax(c)
    const ag = res.find(r => r.kind === 'assetGroup')!
    expect(ag.properties.callToAction).toBe('Sign Up')
    expect(ag.properties.path1).toBe('rename')
    expect(ag.properties.path2).toBe('files')
    expect(ag.properties.videos).toEqual(['https://youtube.com/watch?v=abc123'])
  })

  test('multiple asset groups produce multiple resources', () => {
    const c = makePMaxCampaign({
      assetGroups: {
        'main': sampleAssetGroup,
        'construction': { ...sampleAssetGroup, finalUrls: ['https://renamed.to/construction'] },
      },
    })
    const res = flattenPMax(c)
    expect(res.filter(r => r.kind === 'assetGroup')).toHaveLength(2)
    expect(res).toHaveLength(3) // 1 campaign + 2 asset groups
  })

  test('campaign resource includes urlExpansion when set', () => {
    const c = makePMaxCampaign({ urlExpansion: false })
    const res = flattenPMax(c)
    const camp = res.find(r => r.kind === 'campaign')!
    expect(camp.properties.urlExpansion).toBe(false)
  })

  test('campaign resource omits urlExpansion when undefined', () => {
    const c = makePMaxCampaign()
    const res = flattenPMax(c)
    const camp = res.find(r => r.kind === 'campaign')!
    expect(camp.properties).not.toHaveProperty('urlExpansion')
  })
})

// ─── flattenAll with PMax ───────────────────────────────────

describe('flattenAll() with PMax', () => {
  test('handles Search, Display, and PMax campaigns together', () => {
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
    const pmaxCampaign = makePMaxCampaign({ name: 'PMax - Main' })

    const resources = flattenAll([searchCampaign, pmaxCampaign])
    const campaigns = resources.filter(r => r.kind === 'campaign')
    expect(campaigns).toHaveLength(2)

    const search = campaigns.find(r => r.path === 'search-main')!
    expect(search.properties).not.toHaveProperty('channelType')

    const pmax = campaigns.find(r => r.path === 'pmax-main')!
    expect(pmax.properties.channelType).toBe('performance-max')
  })
})

// ─── Codegen: PMax campaigns use google.performanceMax() ────

describe('codegen: PMax campaigns', () => {
  test('generates google.performanceMax() with .assetGroup() chains', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'pmax-renamed-to',
        properties: {
          name: 'PMax - Renamed.to',
          status: 'enabled',
          budget: { amount: 15, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: {
            rules: [
              { type: 'geo', countries: ['US', 'DE'] },
              { type: 'language', languages: ['en', 'de'] },
            ],
          },
          channelType: 'performance-max',
        },
      },
      {
        kind: 'assetGroup',
        path: 'pmax-renamed-to/main',
        properties: {
          name: 'main',
          status: 'enabled',
          finalUrls: ['https://renamed.to'],
          headlines: ['Rename Files Fast', 'AI File Renaming', 'Batch Rename Files'],
          longHeadlines: ['Rename All Your Files in Seconds with AI'],
          descriptions: ['Try renamed.to free today', 'No credit card required'],
          businessName: 'renamed.to',
        },
      },
    ]

    const code = generateCampaignFile(resources, 'PMax - Renamed.to')
    expect(code).toContain("google.performanceMax('PMax - Renamed.to'")
    expect(code).not.toContain('google.search')
    expect(code).not.toContain('google.display')
    expect(code).toContain(".assetGroup('main'")
    expect(code).toContain("'https://renamed.to'")
    expect(code).toContain("'renamed.to'")
    expect(code).toContain("'Rename Files Fast'")
    expect(code).toContain("'Rename All Your Files in Seconds with AI'")
  })

  test('generates paused status when campaign is paused', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'pmax-test',
        properties: {
          name: 'PMax - Test',
          status: 'paused',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
          channelType: 'performance-max',
        },
      },
    ]

    const code = generateCampaignFile(resources, 'PMax - Test')
    expect(code).toContain("status: 'paused'")
  })

  test('does not emit .group() for PMax campaigns', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'pmax-test',
        properties: {
          name: 'PMax - Test',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
          channelType: 'performance-max',
        },
      },
      {
        kind: 'assetGroup',
        path: 'pmax-test/main',
        properties: {
          name: 'main',
          status: 'enabled',
          finalUrls: ['https://renamed.to'],
          headlines: ['Test Headline One', 'Test Headline Two', 'Test Headline Three'],
          longHeadlines: ['A Long Headline for Testing'],
          descriptions: ['First description text', 'Second description text'],
          businessName: 'renamed.to',
        },
      },
    ]

    const code = generateCampaignFile(resources, 'PMax - Test')
    expect(code).not.toContain('.group(')
    expect(code).not.toContain('.locale(')
    expect(code).toContain('.assetGroup(')
  })

  test('generates urlExpansion when set', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'pmax-test',
        properties: {
          name: 'PMax - Test',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
          channelType: 'performance-max',
          urlExpansion: false,
        },
      },
    ]

    const code = generateCampaignFile(resources, 'PMax - Test')
    expect(code).toContain('urlExpansion: false')
  })

  test('handles multiple asset groups', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'pmax-test',
        properties: {
          name: 'PMax - Test',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [] },
          channelType: 'performance-max',
        },
      },
      {
        kind: 'assetGroup',
        path: 'pmax-test/main',
        properties: {
          name: 'main',
          status: 'enabled',
          finalUrls: ['https://renamed.to'],
          headlines: ['Headline A', 'Headline B', 'Headline C'],
          longHeadlines: ['Long Headline'],
          descriptions: ['Description 1', 'Description 2'],
          businessName: 'renamed.to',
        },
      },
      {
        kind: 'assetGroup',
        path: 'pmax-test/construction',
        properties: {
          name: 'construction',
          status: 'paused',
          finalUrls: ['https://renamed.to/construction'],
          headlines: ['Construction Files', 'Rename Plans', 'Organize Docs'],
          longHeadlines: ['AI File Renaming for Construction'],
          descriptions: ['Built for builders', 'Save time on documents'],
          businessName: 'renamed.to',
        },
      },
    ]

    const code = generateCampaignFile(resources, 'PMax - Test')
    expect(code).toContain(".assetGroup('main'")
    expect(code).toContain(".assetGroup('construction'")
    expect(code).toContain("status: 'paused'")
  })
})

// ─── Apply: PMax campaign create ────────────────────────────

describe('apply: PMax campaign create', () => {
  test('campaign create uses advertising_channel_type 10 for PMax', () => {
    const campaignResource: Resource = {
      kind: 'campaign',
      path: 'pmax-renamed-to',
      properties: {
        name: 'PMax - Renamed.to',
        status: 'enabled',
        budget: { amount: 15, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        channelType: 'performance-max',
      },
    }
    const change = { op: 'create' as const, resource: campaignResource }
    const mutations = changeToMutations(change, '1234567890', new Map())

    const campaignMutation = mutations.find(m => m.operation === 'campaign')!
    expect(campaignMutation.resource.advertising_channel_type).toBe(10) // PERFORMANCE_MAX
  })

  test('asset group create produces asset_group + text asset + link operations', () => {
    const agResource: Resource = {
      kind: 'assetGroup',
      path: 'pmax-renamed-to/main',
      properties: {
        name: 'main',
        status: 'enabled',
        finalUrls: ['https://renamed.to'],
        headlines: ['Rename Files Fast', 'AI Powered', 'Try Now'],
        longHeadlines: ['Rename All Your Files in Seconds with AI'],
        descriptions: ['Try renamed.to free', 'No credit card required'],
        businessName: 'renamed.to',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const resourceMap = new Map([['pmax-renamed-to', '12345']])
    const mutations = changeToMutations(change, '1234567890', resourceMap)

    // Should have: 1 asset_group + (3 headlines + 1 long headline + 2 descriptions + 1 business name) * 2 ops each = 1 + 14 = 15
    const agOps = mutations.filter(m => m.operation === 'asset_group')
    expect(agOps).toHaveLength(1)
    expect(agOps[0]!.resource.campaign).toBe('customers/1234567890/campaigns/12345')
    expect(agOps[0]!.resource.name).toBe('main')
    expect(agOps[0]!.resource.status).toBe(2) // ENABLED
    expect(agOps[0]!.resource.final_urls).toEqual(['https://renamed.to'])

    const assetOps = mutations.filter(m => m.operation === 'asset')
    // 3 headlines + 1 long headline + 2 descriptions + 1 business name = 7 assets
    expect(assetOps).toHaveLength(7)

    const linkOps = mutations.filter(m => m.operation === 'asset_group_asset')
    // Same 7 links
    expect(linkOps).toHaveLength(7)

    // Verify field types in links
    const fieldTypes = linkOps.map(m => m.resource.field_type)
    expect(fieldTypes.filter(f => f === 'HEADLINE')).toHaveLength(3)
    expect(fieldTypes.filter(f => f === 'LONG_HEADLINE')).toHaveLength(1)
    expect(fieldTypes.filter(f => f === 'DESCRIPTION')).toHaveLength(2)
    expect(fieldTypes.filter(f => f === 'BUSINESS_NAME')).toHaveLength(1)
  })

  test('paused asset group uses status 3', () => {
    const agResource: Resource = {
      kind: 'assetGroup',
      path: 'pmax-renamed-to/paused-group',
      properties: {
        name: 'paused-group',
        status: 'paused',
        finalUrls: ['https://renamed.to'],
        headlines: ['H1', 'H2', 'H3'],
        longHeadlines: ['Long H1'],
        descriptions: ['D1', 'D2'],
        businessName: 'renamed.to',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const resourceMap = new Map([['pmax-renamed-to', '12345']])
    const mutations = changeToMutations(change, '1234567890', resourceMap)

    const agOp = mutations.find(m => m.operation === 'asset_group')!
    expect(agOp.resource.status).toBe(3) // PAUSED
  })

  test('asset group with path1 and path2', () => {
    const agResource: Resource = {
      kind: 'assetGroup',
      path: 'pmax-renamed-to/main',
      properties: {
        name: 'main',
        status: 'enabled',
        finalUrls: ['https://renamed.to'],
        headlines: ['H1', 'H2', 'H3'],
        longHeadlines: ['Long H1'],
        descriptions: ['D1', 'D2'],
        businessName: 'renamed.to',
        path1: 'rename',
        path2: 'files',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const resourceMap = new Map([['pmax-renamed-to', '12345']])
    const mutations = changeToMutations(change, '1234567890', resourceMap)

    const agOp = mutations.find(m => m.operation === 'asset_group')!
    expect(agOp.resource.path1).toBe('rename')
    expect(agOp.resource.path2).toBe('files')
  })

  test('asset group uses temp campaign id when campaign not in resourceMap', () => {
    const agResource: Resource = {
      kind: 'assetGroup',
      path: 'pmax-renamed-to/main',
      properties: {
        name: 'main',
        status: 'enabled',
        finalUrls: ['https://renamed.to'],
        headlines: ['H1', 'H2', 'H3'],
        longHeadlines: ['Long H1'],
        descriptions: ['D1', 'D2'],
        businessName: 'renamed.to',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    // Empty resource map — campaign was just created in same batch
    const mutations = changeToMutations(change, '1234567890', new Map())

    const agOp = mutations.find(m => m.operation === 'asset_group')!
    expect(agOp.resource.campaign).toBe('customers/1234567890/campaigns/-1')
  })
})

// ─── CREATION_ORDER includes assetGroup ─────────────────────

describe('apply: CREATION_ORDER', () => {
  test('assetGroup create is processed (does not fall through to default)', () => {
    const agResource: Resource = {
      kind: 'assetGroup',
      path: 'pmax-test/main',
      properties: {
        name: 'main',
        status: 'enabled',
        finalUrls: ['https://renamed.to'],
        headlines: ['H1', 'H2', 'H3'],
        longHeadlines: ['Long H1'],
        descriptions: ['D1', 'D2'],
        businessName: 'renamed.to',
      },
    }
    const change = { op: 'create' as const, resource: agResource }
    const mutations = changeToMutations(change, '1234567890', new Map())
    // Should produce operations, not empty array
    expect(mutations.length).toBeGreaterThan(0)
  })
})
