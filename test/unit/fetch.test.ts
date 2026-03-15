import { describe, expect, test, mock } from 'bun:test'
import {
  fetchCampaigns,
  fetchAdGroups,
  fetchKeywords,
  fetchAds,
  fetchNegativeKeywords,
  fetchExtensions,
  fetchCampaignTargeting,
  fetchDeviceBidModifiers,
  fetchAllState,
} from '../../src/google/fetch.ts'
import type { GoogleAdsClient, GoogleAdsRow } from '../../src/google/types.ts'

import campaignFixtures from '../fixtures/api-responses/campaigns.json'
import adGroupFixtures from '../fixtures/api-responses/ad-groups.json'
import keywordFixtures from '../fixtures/api-responses/keywords.json'
import adFixtures from '../fixtures/api-responses/ads.json'
import negativeFixtures from '../fixtures/api-responses/negatives.json'
import sitelinkFixtures from '../fixtures/api-responses/sitelinks.json'
import calloutFixtures from '../fixtures/api-responses/callouts.json'

// ─── Mock Client ────────────────────────────────────────────

function createMockClient(responses: Record<string, GoogleAdsRow[]>): GoogleAdsClient {
  const queryFn = mock((gaql: string): Promise<GoogleAdsRow[]> => {
    // Match on the FROM clause to determine which fixture to return
    // More specific patterns must be checked before general ones
    if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'KEYWORD'")) return Promise.resolve(responses.negatives ?? [])
    if (gaql.includes('FROM campaign_criterion') && gaql.includes("('LOCATION', 'LANGUAGE')")) return Promise.resolve(responses.targeting ?? [])
    if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'AD_SCHEDULE'")) return Promise.resolve(responses.schedule ?? [])
    if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'DEVICE'")) return Promise.resolve(responses.devices ?? [])
    if (gaql.includes('FROM campaign_criterion')) return Promise.resolve(responses.negatives ?? [])
    if (gaql.includes('FROM campaign_asset') && gaql.includes('SITELINK')) return Promise.resolve(responses.sitelinks ?? [])
    if (gaql.includes('FROM campaign_asset') && gaql.includes('CALLOUT')) return Promise.resolve(responses.callouts ?? [])
    if (gaql.includes('FROM ad_group_criterion')) return Promise.resolve(responses.keywords ?? [])
    if (gaql.includes('FROM ad_group_ad')) return Promise.resolve(responses.ads ?? [])
    if (gaql.includes('FROM ad_group')) return Promise.resolve(responses.adGroups ?? [])
    if (gaql.includes('FROM campaign')) return Promise.resolve(responses.campaigns ?? [])
    return Promise.resolve([])
  })

  return {
    query: queryFn,
    mutate: mock(() => Promise.resolve([])),
    customerId: '7300967494',
  }
}

// ─── fetchCampaigns ─────────────────────────────────────────

describe('fetchCampaigns', () => {
  test('normalizes campaign rows with snake_case fields and numeric enums', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // Should return 3 campaigns from fixture
    expect(resources).toHaveLength(3)

    // First campaign: status=2 (ENABLED), bidding_strategy_type=6 (MAXIMIZE_CONVERSIONS)
    const pdf = resources[0]!
    expect(pdf.kind).toBe('campaign')
    expect(pdf.path).toBe('search-pdf-renaming')
    expect(pdf.platformId).toBe('123456')
    expect(pdf.properties.name).toBe('Search - PDF Renaming')
    expect(pdf.properties.status).toBe('enabled')

    // Budget: amount_micros 20000000 → 20
    const budget = pdf.properties.budget as { amount: number; currency: string; period: string }
    expect(budget.amount).toBe(20)
    expect(budget.currency).toBe('EUR')
    expect(budget.period).toBe('daily')

    // Bidding: 6 → MAXIMIZE_CONVERSIONS → maximize-conversions
    const bidding = pdf.properties.bidding as { type: string }
    expect(bidding.type).toBe('maximize-conversions')
  })

  test('maps maximize-clicks with CPC ceiling from TARGET_SPEND enum', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // Campaign 1: bidding_strategy_type=10 (TARGET_SPEND) with maximize_clicks.cpc_bid_ceiling_micros
    const drive = resources[1]!
    const bidding = drive.properties.bidding as { type: string; maxCpc?: number }
    expect(bidding.type).toBe('maximize-clicks')
    expect(bidding.maxCpc).toBe(2)
  })

  test('converts micros to amount correctly', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const drive = resources[1]!
    const budget = drive.properties.budget as { amount: number }
    expect(budget.amount).toBe(5) // 5000000 micros → 5

    const onedrive = resources[2]!
    const onedriveBudget = onedrive.properties.budget as { amount: number }
    expect(onedriveBudget.amount).toBe(4) // 4000000 micros → 4
  })

  test('maps numeric bidding strategy types correctly', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // 6 = MAXIMIZE_CONVERSIONS → maximize-conversions
    expect((resources[0]!.properties.bidding as { type: string }).type).toBe('maximize-conversions')
    // 10 = TARGET_SPEND → maximize-clicks
    expect((resources[1]!.properties.bidding as { type: string }).type).toBe('maximize-clicks')
    // 9 = TARGET_CPA → target-cpa
    expect((resources[2]!.properties.bidding as { type: string }).type).toBe('target-cpa')
  })

  test('maps numeric status enums correctly', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // 2 = ENABLED, 3 = PAUSED
    expect(resources[0]!.properties.status).toBe('enabled')
    expect(resources[1]!.properties.status).toBe('paused')
    expect(resources[2]!.properties.status).toBe('enabled')
  })

  test('default query excludes paused campaigns', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    await fetchCampaigns(client)

    // Verify the query contains status filter
    const queryCall = (client.query as ReturnType<typeof mock>).mock.calls[0]![0] as string
    expect(queryCall).toContain("campaign.status = 'ENABLED'")
  })

  test('includePaused omits the status filter', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    await fetchCampaigns(client, { includePaused: true })

    const queryCall = (client.query as ReturnType<typeof mock>).mock.calls[0]![0] as string
    expect(queryCall).not.toContain("campaign.status = 'ENABLED'")
  })
})

// ─── campaign normalization — budgetResourceName isolation ──

describe('campaign normalization — budgetResourceName isolation', () => {
  test('budgetResourceName is in meta, not properties', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })
    const campaign = resources[0]!
    expect(campaign.properties.budgetResourceName).toBeUndefined()
    expect(campaign.meta?.budgetResourceName).toBeDefined()
  })
})

// ─── fetchAdGroups ──────────────────────────────────────────

describe('fetchAdGroups', () => {
  test('normalizes ad group rows with snake_case fields', async () => {
    const client = createMockClient({ adGroups: adGroupFixtures as GoogleAdsRow[] })
    const resources = await fetchAdGroups(client)

    expect(resources).toHaveLength(3)

    const pdfCore = resources[0]!
    expect(pdfCore.kind).toBe('adGroup')
    expect(pdfCore.path).toBe('search-pdf-renaming/pdf-core')
    expect(pdfCore.platformId).toBe('111111')
    expect(pdfCore.properties.status).toBe('enabled')

    // status=3 → paused
    const driveCore = resources[2]!
    expect(driveCore.path).toBe('search-google-drive/drive-core')
    expect(driveCore.properties.status).toBe('paused')
  })

  test('scopes query by campaignIds when provided', async () => {
    const client = createMockClient({ adGroups: adGroupFixtures as GoogleAdsRow[] })
    await fetchAdGroups(client, ['123456'])

    const queryCall = (client.query as ReturnType<typeof mock>).mock.calls[0]![0] as string
    expect(queryCall).toContain('campaign.id IN (123456)')
  })
})

// ─── fetchKeywords ──────────────────────────────────────────

describe('fetchKeywords', () => {
  test('normalizes keyword rows with snake_case fields and numeric match_type', async () => {
    const client = createMockClient({ keywords: keywordFixtures as GoogleAdsRow[] })
    const resources = await fetchKeywords(client)

    expect(resources).toHaveLength(4)

    const first = resources[0]!
    expect(first.kind).toBe('keyword')
    expect(first.path).toBe('search-pdf-renaming/pdf-core/kw:rename pdf:EXACT')
    expect(first.platformId).toBe('10001')
    expect(first.properties.text).toBe('rename pdf')
    expect(first.properties.matchType).toBe('EXACT')
  })

  test('maps all numeric match types correctly', async () => {
    const client = createMockClient({ keywords: keywordFixtures as GoogleAdsRow[] })
    const resources = await fetchKeywords(client)

    // match_type: 2=EXACT, 3=PHRASE, 4=BROAD
    expect(resources[0]!.properties.matchType).toBe('EXACT')
    expect(resources[1]!.properties.matchType).toBe('PHRASE')
    expect(resources[2]!.properties.matchType).toBe('EXACT')
    expect(resources[3]!.properties.matchType).toBe('BROAD')
  })

  test('scopes query by adGroupIds when provided', async () => {
    const client = createMockClient({ keywords: keywordFixtures as GoogleAdsRow[] })
    await fetchKeywords(client, ['111111', '222222'])

    const queryCall = (client.query as ReturnType<typeof mock>).mock.calls[0]![0] as string
    expect(queryCall).toContain('ad_group.id IN (111111, 222222)')
  })
})

// ─── fetchKeywords — extended fields ───────────────────────

describe('fetchKeywords — extended fields', () => {
  test('includes status, bid, and finalUrl', async () => {
    const client = createMockClient({
      keywords: [{
        ad_group_criterion: {
          resource_name: 'customers/123/adGroupCriteria/100~200',
          criterion_id: '200',
          status: 3, // PAUSED
          keyword: { text: 'rename pdf', match_type: 2 },
          cpc_bid_micros: '1500000',
          final_urls: ['https://renamed.to/pdf'],
        },
        ad_group: { id: '100', name: 'PDF' },
        campaign: { id: '123', name: 'Test' },
      }],
    })
    const resources = await fetchKeywords(client)
    const kw = resources[0]!
    expect(kw.properties.status).toBe('paused')
    expect(kw.properties.bid).toBe(1.5)
    expect(kw.properties.finalUrl).toBe('https://renamed.to/pdf')
  })

  test('omits bid and status when defaults', async () => {
    const client = createMockClient({
      keywords: [{
        ad_group_criterion: {
          resource_name: 'customers/123/adGroupCriteria/100~201',
          criterion_id: '201',
          status: 2,
          keyword: { text: 'batch rename', match_type: 2 },
        },
        ad_group: { id: '100', name: 'PDF' },
        campaign: { id: '123', name: 'Test' },
      }],
    })
    const resources = await fetchKeywords(client)
    expect(resources[0]!.properties.bid).toBeUndefined()
    expect(resources[0]!.properties.status).toBeUndefined()
  })

  test('omits bid when cpc_bid_micros is 0', async () => {
    const client = createMockClient({
      keywords: [{
        ad_group_criterion: {
          resource_name: 'customers/123/adGroupCriteria/100~202',
          criterion_id: '202',
          status: 2,
          keyword: { text: 'rename files', match_type: 2 },
          cpc_bid_micros: '0',
        },
        ad_group: { id: '100', name: 'PDF' },
        campaign: { id: '123', name: 'Test' },
      }],
    })
    const resources = await fetchKeywords(client)
    expect(resources[0]!.properties.bid).toBeUndefined()
  })

  test('handles camelCase fields from REST API', async () => {
    const client = createMockClient({
      keywords: [{
        adGroupCriterion: {
          resourceName: 'customers/123/adGroupCriteria/100~203',
          criterionId: '203',
          status: 3,
          keyword: { text: 'auto rename', matchType: 3 },
          cpcBidMicros: '2000000',
          finalUrls: ['https://renamed.to/auto'],
        },
        adGroup: { id: '100', name: 'Auto' },
        campaign: { id: '123', name: 'Test' },
      }],
    })
    const resources = await fetchKeywords(client)
    const kw = resources[0]!
    expect(kw.properties.bid).toBe(2)
    expect(kw.properties.finalUrl).toBe('https://renamed.to/auto')
    expect(kw.properties.status).toBe('paused')
  })
})

// ─── fetchAds ───────────────────────────────────────────────

describe('fetchAds', () => {
  test('normalizes RSA ad rows with snake_case fields', async () => {
    const client = createMockClient({ ads: adFixtures as GoogleAdsRow[] })
    const resources = await fetchAds(client)

    expect(resources).toHaveLength(2)

    const first = resources[0]!
    expect(first.kind).toBe('ad')
    expect(first.platformId).toBe('50001')
    expect(first.path).toMatch(/^search-pdf-renaming\/pdf-core\/rsa:/)

    // Headlines extracted and sorted
    const headlines = first.properties.headlines as string[]
    expect(headlines).toEqual(['AI-Powered Tool', 'Rename PDFs Fast', 'Try It Free'])

    // Descriptions extracted and sorted
    const descriptions = first.properties.descriptions as string[]
    expect(descriptions).toEqual(['No more manual renaming.', 'Rename your PDFs in seconds with AI.'])

    // Final URL from final_urls (snake_case)
    expect(first.properties.finalUrl).toBe('https://renamed.to/pdf-renamer')
  })

  test('generates paths that match flatten.ts hash', async () => {
    const client = createMockClient({ ads: adFixtures as GoogleAdsRow[] })
    const resources = await fetchAds(client)

    // Each ad path should follow format: campaign-slug/group-name/rsa:HASH
    for (const r of resources) {
      expect(r.path).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+\/rsa:[a-f0-9]+$/)
    }
  })
})

// ─── fetchNegativeKeywords ──────────────────────────────────

describe('fetchNegativeKeywords', () => {
  test('normalizes campaign-level negative keywords', async () => {
    const client = createMockClient({ negatives: negativeFixtures as GoogleAdsRow[] })
    const resources = await fetchNegativeKeywords(client)

    expect(resources).toHaveLength(3)

    const first = resources[0]!
    expect(first.kind).toBe('negative')
    expect(first.path).toBe('search-pdf-renaming/neg:free pdf editor:BROAD')
    expect(first.properties.text).toBe('free pdf editor')
    expect(first.properties.matchType).toBe('BROAD')

    const second = resources[1]!
    expect(second.path).toBe('search-pdf-renaming/neg:pdf to word:EXACT')
    expect(second.properties.matchType).toBe('EXACT')

    const third = resources[2]!
    expect(third.path).toBe('search-google-drive/neg:google drive login:PHRASE')
    expect(third.properties.matchType).toBe('PHRASE')
  })

  test('scopes query by campaignIds when provided', async () => {
    const client = createMockClient({ negatives: negativeFixtures as GoogleAdsRow[] })
    await fetchNegativeKeywords(client, ['123456'])

    const queryCall = (client.query as ReturnType<typeof mock>).mock.calls[0]![0] as string
    expect(queryCall).toContain('campaign.id IN (123456)')
  })
})

// ─── fetchExtensions ────────────────────────────────────────

describe('fetchExtensions', () => {
  test('normalizes sitelink rows with snake_case fields', async () => {
    const client = createMockClient({
      sitelinks: sitelinkFixtures as GoogleAdsRow[],
      callouts: [],
    })
    const resources = await fetchExtensions(client)

    const sitelinks = resources.filter(r => r.kind === 'sitelink')
    expect(sitelinks).toHaveLength(3)

    const first = sitelinks[0]!
    expect(first.kind).toBe('sitelink')
    expect(first.path).toBe('search-pdf-renaming/sl:pricing')
    expect(first.platformId).toBe('60001')
    expect(first.properties.text).toBe('Pricing')
    expect(first.properties.url).toBe('https://www.renamed.to/pricing')
    expect(first.properties.description1).toBe('See our plans')
    expect(first.properties.description2).toBe('Starting at $5/mo')
  })

  test('normalizes callout rows with snake_case fields', async () => {
    const client = createMockClient({
      sitelinks: [],
      callouts: calloutFixtures as GoogleAdsRow[],
    })
    const resources = await fetchExtensions(client)

    const callouts = resources.filter(r => r.kind === 'callout')
    expect(callouts).toHaveLength(3)

    const first = callouts[0]!
    expect(first.kind).toBe('callout')
    expect(first.path).toBe('search-pdf-renaming/co:free trial')
    expect(first.platformId).toBe('70001')
    expect(first.properties.text).toBe('Free Trial')
  })

  test('returns both sitelinks and callouts together', async () => {
    const client = createMockClient({
      sitelinks: sitelinkFixtures as GoogleAdsRow[],
      callouts: calloutFixtures as GoogleAdsRow[],
    })
    const resources = await fetchExtensions(client)

    const sitelinks = resources.filter(r => r.kind === 'sitelink')
    const callouts = resources.filter(r => r.kind === 'callout')
    expect(sitelinks).toHaveLength(3)
    expect(callouts).toHaveLength(3)
  })

  test('scopes query by campaignIds when provided', async () => {
    const client = createMockClient({
      sitelinks: sitelinkFixtures as GoogleAdsRow[],
      callouts: calloutFixtures as GoogleAdsRow[],
    })
    await fetchExtensions(client, ['123456'])

    const calls = (client.query as ReturnType<typeof mock>).mock.calls
    // Both sitelink and callout queries should be scoped
    for (const call of calls) {
      const queryStr = call[0] as string
      if (queryStr.includes('FROM campaign_asset')) {
        expect(queryStr).toContain('campaign.id IN (123456)')
      }
    }
  })

  test('handles sitelinks with null descriptions', async () => {
    const client = createMockClient({
      sitelinks: sitelinkFixtures as GoogleAdsRow[],
      callouts: [],
    })
    const resources = await fetchExtensions(client)

    // Second sitelink has null description1 and description2
    const features = resources.find(r => r.path === 'search-pdf-renaming/sl:features')
    expect(features).toBeDefined()
    expect(features!.properties.description1).toBeNull()
    expect(features!.properties.description2).toBeNull()
  })
})

// ─── fetchCampaignTargeting ──────────────────────────────────

describe('fetchCampaignTargeting', () => {
  test('normalizes geo + language targeting with numeric enums', async () => {
    const targetingRows: GoogleAdsRow[] = [
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          type: 6, // LOCATION
          location: { geo_target_constant: 'geoTargetConstants/2840' },
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          type: 6,
          location: { geo_target_constant: 'geoTargetConstants/2276' },
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          type: 16, // LANGUAGE
          language: { language_constant: 'languageConstants/1000' },
        },
      },
    ]

    const client = createMockClient({ targeting: targetingRows, schedule: [] })
    const result = await fetchCampaignTargeting(client)

    const targeting = result.get('123456')
    expect(targeting).toBeDefined()
    expect(targeting!.geo).toEqual(['DE', 'US'])
    expect(targeting!.languages).toEqual(['en'])
    expect(targeting!.schedule).toBeNull()
  })

  test('normalizes ad schedule with numeric day_of_week', async () => {
    const scheduleRows: GoogleAdsRow[] = [
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 2, start_hour: 8, end_hour: 20 }, // MON
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 3, start_hour: 8, end_hour: 20 }, // TUE
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 6, start_hour: 8, end_hour: 20 }, // FRI
        },
      },
    ]

    const client = createMockClient({ targeting: [], schedule: scheduleRows })
    const result = await fetchCampaignTargeting(client)

    const targeting = result.get('123456')
    expect(targeting).toBeDefined()
    expect(targeting!.schedule).toBeDefined()
    expect(targeting!.schedule!.days).toEqual(['mon', 'tue', 'fri'])
    expect(targeting!.schedule!.startHour).toBe(8)
    expect(targeting!.schedule!.endHour).toBe(20)
  })

  test('handles string enum values from REST', async () => {
    const targetingRows: GoogleAdsRow[] = [
      {
        campaign: { id: '999' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geoTargetConstant: 'geoTargetConstants/2840' },
        },
      },
      {
        campaign: { id: '999' },
        campaign_criterion: {
          type: 'LANGUAGE',
          language: { languageConstant: 'languageConstants/1001' },
        },
      },
    ]

    const scheduleRows: GoogleAdsRow[] = [
      {
        campaign: { id: '999' },
        campaign_criterion: {
          adSchedule: { dayOfWeek: 'MONDAY', startHour: 0, endHour: 24 },
        },
      },
    ]

    const client = createMockClient({ targeting: targetingRows, schedule: scheduleRows })
    const result = await fetchCampaignTargeting(client)

    const targeting = result.get('999')
    expect(targeting).toBeDefined()
    expect(targeting!.geo).toEqual(['US'])
    expect(targeting!.languages).toEqual(['de'])
    // startHour=0, endHour=24 means no restriction — schedule tracks only days
    expect(targeting!.schedule!.days).toEqual(['mon'])
  })

  test('scopes query by campaignIds when provided', async () => {
    const client = createMockClient({ targeting: [], schedule: [] })
    await fetchCampaignTargeting(client, ['123456', '789'])

    const calls = (client.query as ReturnType<typeof mock>).mock.calls
    for (const call of calls) {
      const queryStr = call[0] as string
      if (queryStr.includes('FROM campaign_criterion')) {
        expect(queryStr).toContain('campaign.id IN (123456, 789)')
      }
    }
  })
})

// ─── fetchAllState ──────────────────────────────────────────

describe('fetchAllState', () => {
  test('orchestrates fetchers in dependency order', async () => {
    const callOrder: string[] = []

    const queryFn = mock((gaql: string): Promise<GoogleAdsRow[]> => {
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'KEYWORD'")) {
        callOrder.push('negatives')
        return Promise.resolve([])
      }
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("('LOCATION', 'LANGUAGE')")) {
        callOrder.push('targeting')
        return Promise.resolve([])
      }
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'AD_SCHEDULE'")) {
        callOrder.push('schedule')
        return Promise.resolve([])
      }
      if (gaql.includes('FROM campaign_criterion')) {
        callOrder.push('negatives')
        return Promise.resolve([])
      }
      if (gaql.includes('FROM campaign_asset')) {
        callOrder.push('extensions')
        return Promise.resolve([])
      }
      if (gaql.includes('FROM campaign')) {
        callOrder.push('campaigns')
        return Promise.resolve(campaignFixtures as GoogleAdsRow[])
      }
      if (gaql.includes('FROM ad_group_criterion')) {
        callOrder.push('keywords')
        return Promise.resolve(keywordFixtures as GoogleAdsRow[])
      }
      if (gaql.includes('FROM ad_group_ad')) {
        callOrder.push('ads')
        return Promise.resolve(adFixtures as GoogleAdsRow[])
      }
      if (gaql.includes('FROM ad_group')) {
        callOrder.push('adGroups')
        return Promise.resolve(adGroupFixtures as GoogleAdsRow[])
      }
      return Promise.resolve([])
    })

    const client: GoogleAdsClient = {
      query: queryFn,
      mutate: mock(() => Promise.resolve([])),
      customerId: '7300967494',
    }

    const resources = await fetchAllState(client, { includePaused: true })

    // Should have campaigns + ad groups + keywords + ads
    expect(resources.length).toBeGreaterThan(0)

    // Campaigns first, then ad groups, then keywords+ads (parallel), then extensions+negatives+targeting (parallel)
    expect(callOrder[0]).toBe('campaigns')
    expect(callOrder[1]).toBe('adGroups')
    // keywords and ads run in parallel — order may vary
    expect(callOrder).toContain('keywords')
    expect(callOrder).toContain('ads')
    expect(callOrder).toContain('negatives')
    expect(callOrder).toContain('extensions')
    expect(callOrder).toContain('targeting')
    expect(callOrder).toContain('schedule')
  })

  test('returns empty when no campaigns', async () => {
    const client = createMockClient({ campaigns: [] })
    const resources = await fetchAllState(client)
    // Only gets campaigns (empty), never calls other fetchers
    expect(resources).toHaveLength(0)
  })

  test('returns all resource types combined', async () => {
    const client = createMockClient({
      campaigns: campaignFixtures as GoogleAdsRow[],
      adGroups: adGroupFixtures as GoogleAdsRow[],
      keywords: keywordFixtures as GoogleAdsRow[],
      ads: adFixtures as GoogleAdsRow[],
      negatives: negativeFixtures as GoogleAdsRow[],
      sitelinks: sitelinkFixtures as GoogleAdsRow[],
      callouts: calloutFixtures as GoogleAdsRow[],
    })

    const resources = await fetchAllState(client, { includePaused: true })

    const kinds = new Set(resources.map(r => r.kind))
    expect(kinds.has('campaign')).toBe(true)
    expect(kinds.has('adGroup')).toBe(true)
    expect(kinds.has('keyword')).toBe(true)
    expect(kinds.has('ad')).toBe(true)
    expect(kinds.has('negative')).toBe(true)
    expect(kinds.has('sitelink')).toBe(true)
    expect(kinds.has('callout')).toBe(true)
  })
})

// ─── Network Settings ──────────────────────────────────────

describe('fetchCampaigns — network settings', () => {
  test('includes networkSettings from API response', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 111,
        name: 'Network Test',
        status: 2,
        bidding_strategy_type: 6,
        network_settings: {
          target_google_search: true,
          target_search_network: false,
          target_content_network: true,
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/1',
        amount_micros: 1000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    expect(resources).toHaveLength(1)
    const ns = resources[0]!.properties.networkSettings as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean }
    expect(ns).toBeDefined()
    expect(ns.searchNetwork).toBe(true)
    expect(ns.searchPartners).toBe(false)
    expect(ns.displayNetwork).toBe(true)
  })

  test('omits networkSettings when API does not return it', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // The existing fixture campaigns have no network_settings
    for (const r of resources) {
      expect(r.properties.networkSettings).toBeUndefined()
    }
  })

  test('handles camelCase networkSettings from REST API', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 222,
        name: 'CamelCase Net',
        status: 2,
        biddingStrategyType: 6,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
        },
      },
      campaignBudget: {
        resourceName: 'customers/7300967494/campaignBudgets/2',
        amountMicros: 2000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const ns = resources[0]!.properties.networkSettings as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean }
    expect(ns).toBeDefined()
    expect(ns.searchNetwork).toBe(true)
    expect(ns.searchPartners).toBe(true)
    expect(ns.displayNetwork).toBe(false)
  })
})

// ─── Missing Bidding Strategies ────────────────────────────

describe('fetchCampaigns — missing bidding strategies', () => {
  test('maps TARGET_ROAS (8) correctly', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 333,
        name: 'ROAS Campaign',
        status: 2,
        bidding_strategy_type: 8,
        target_roas: {
          target_roas: 3.5,
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/3',
        amount_micros: 3000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; targetRoas: number }
    expect(bidding.type).toBe('target-roas')
    expect(bidding.targetRoas).toBe(3.5)
  })

  test('maps TARGET_IMPRESSION_SHARE (15) correctly', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 444,
        name: 'Impression Share Campaign',
        status: 2,
        bidding_strategy_type: 15,
        target_impression_share: {
          location: 4, // ABSOLUTE_TOP
          location_fraction_micros: 900000, // 90%
          cpc_bid_ceiling_micros: 3000000,
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/4',
        amount_micros: 5000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; location: string; targetPercent: number; maxCpc?: number }
    expect(bidding.type).toBe('target-impression-share')
    expect(bidding.location).toBe('absolute-top')
    expect(bidding.targetPercent).toBe(90)
    expect(bidding.maxCpc).toBe(3)
  })

  test('maps TARGET_IMPRESSION_SHARE with top location and no max CPC', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 445,
        name: 'TIS No Cap',
        status: 2,
        bidding_strategy_type: 15,
        target_impression_share: {
          location: 3, // TOP
          location_fraction_micros: 750000, // 75%
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/4b',
        amount_micros: 5000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; location: string; targetPercent: number; maxCpc?: number }
    expect(bidding.type).toBe('target-impression-share')
    expect(bidding.location).toBe('top')
    expect(bidding.targetPercent).toBe(75)
    expect(bidding.maxCpc).toBeUndefined()
  })

  test('maps TARGET_IMPRESSION_SHARE with "anywhere" location (2)', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 446,
        name: 'TIS Anywhere',
        status: 2,
        bidding_strategy_type: 15,
        target_impression_share: {
          location: 2, // ANYWHERE_ON_PAGE
          location_fraction_micros: 500000, // 50%
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/4c',
        amount_micros: 5000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; location: string; targetPercent: number }
    expect(bidding.type).toBe('target-impression-share')
    expect(bidding.location).toBe('anywhere')
    expect(bidding.targetPercent).toBe(50)
  })

  test('maps MAXIMIZE_CONVERSION_VALUE (12) correctly', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 555,
        name: 'Max Conv Value',
        status: 2,
        bidding_strategy_type: 12,
        maximize_conversion_value: {
          target_roas: 2.0,
        },
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/5',
        amount_micros: 8000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; targetRoas?: number }
    expect(bidding.type).toBe('maximize-conversion-value')
    expect(bidding.targetRoas).toBe(2.0)
  })

  test('maps MAXIMIZE_CONVERSION_VALUE without targetRoas', async () => {
    const campaignRow: GoogleAdsRow = {
      campaign: {
        id: 556,
        name: 'Max Conv Value No ROAS',
        status: 2,
        bidding_strategy_type: 12,
      },
      campaign_budget: {
        resource_name: 'customers/7300967494/campaignBudgets/5b',
        amount_micros: 8000000,
      },
    }

    const client = createMockClient({ campaigns: [campaignRow] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    const bidding = resources[0]!.properties.bidding as { type: string; targetRoas?: number }
    expect(bidding.type).toBe('maximize-conversion-value')
    expect(bidding.targetRoas).toBeUndefined()
  })
})

// ─── Device Bid Adjustments ────────────────────────────────

describe('fetchDeviceBidModifiers', () => {
  test('fetches and normalizes device bid modifiers', async () => {
    const deviceRows: GoogleAdsRow[] = [
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          device: { type: 2 }, // MOBILE
          bid_modifier: 0.75,  // -25%
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          device: { type: 4 }, // TABLET
          bid_modifier: 1.2,   // +20%
        },
      },
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          device: { type: 3 }, // DESKTOP — no change
          bid_modifier: 1.0,
        },
      },
    ]

    const client = createMockClient({ devices: deviceRows })
    const result = await fetchDeviceBidModifiers(client)

    const mods = result.get('123456')
    expect(mods).toBeDefined()
    // Desktop (1.0) is skipped — no-op
    expect(mods).toHaveLength(2)

    const mobile = mods!.find(m => m.device === 'mobile')
    expect(mobile).toBeDefined()
    expect(mobile!.bidAdjustment).toBeCloseTo(-0.25)

    const tablet = mods!.find(m => m.device === 'tablet')
    expect(tablet).toBeDefined()
    expect(tablet!.bidAdjustment).toBeCloseTo(0.2)
  })

  test('skips no-op modifiers (bidAdjustment === 0)', async () => {
    const deviceRows: GoogleAdsRow[] = [
      {
        campaign: { id: '999' },
        campaign_criterion: {
          device: { type: 2 }, // MOBILE
          bid_modifier: 1.0,   // no change
        },
      },
    ]

    const client = createMockClient({ devices: deviceRows })
    const result = await fetchDeviceBidModifiers(client)

    // No entries because all are no-op
    expect(result.has('999')).toBe(false)
  })
})

// ─── fetchAds — extended fields ─────────────────────────────

describe('fetchAds — extended fields', () => {
  test('includes path1, path2, and status', async () => {
    const client = createMockClient({
      ads: [{
        ad_group_ad: {
          status: 3, // PAUSED
          ad: {
            id: '999', type: 30,
            responsive_search_ad: {
              headlines: [{ text: 'H1', pinned_field: 0 }, { text: 'H2', pinned_field: 1 }],
              descriptions: [{ text: 'D1', pinned_field: 0 }],
              path1: 'rename', path2: 'files',
            },
            final_urls: ['https://renamed.to'],
          },
        },
        ad_group: { id: '100', name: 'Test Group' },
        campaign: { id: '123', name: 'Test Campaign' },
      }],
    })
    const resources = await fetchAds(client)
    expect(resources).toHaveLength(1)
    const ad = resources[0]!
    expect(ad.properties.path1).toBe('rename')
    expect(ad.properties.path2).toBe('files')
    expect(ad.properties.status).toBe('paused')
    expect(ad.properties.pinnedHeadlines).toEqual([{ text: 'H2', position: 1 }])
  })

  test('omits status when enabled (default)', async () => {
    const client = createMockClient({
      ads: [{
        ad_group_ad: {
          status: 2,
          ad: {
            id: '999', type: 30,
            responsive_search_ad: {
              headlines: [{ text: 'H1', pinned_field: 0 }],
              descriptions: [{ text: 'D1', pinned_field: 0 }],
            },
            final_urls: ['https://renamed.to'],
          },
        },
        ad_group: { id: '100', name: 'Group' },
        campaign: { id: '123', name: 'Campaign' },
      }],
    })
    const resources = await fetchAds(client)
    expect(resources[0]!.properties.status).toBeUndefined()
  })

  test('extracts pinned descriptions (pinned_field 4-5)', async () => {
    const client = createMockClient({
      ads: [{
        ad_group_ad: {
          status: 2,
          ad: {
            id: '888', type: 30,
            responsive_search_ad: {
              headlines: [{ text: 'H1', pinned_field: 0 }],
              descriptions: [{ text: 'D1', pinned_field: 4 }, { text: 'D2', pinned_field: 0 }],
            },
            final_urls: ['https://renamed.to'],
          },
        },
        ad_group: { id: '100', name: 'Group' },
        campaign: { id: '123', name: 'Campaign' },
      }],
    })
    const resources = await fetchAds(client)
    expect(resources[0]!.properties.pinnedDescriptions).toEqual([{ text: 'D1', position: 1 }])
  })
})

describe('fetchAllState — device bid adjustments', () => {
  test('merges device bid adjustments into campaign targeting', async () => {
    const deviceRows: GoogleAdsRow[] = [
      {
        campaign: { id: '123456' },
        campaign_criterion: {
          device: { type: 2 }, // MOBILE
          bid_modifier: 0.8,   // -20%
        },
      },
    ]

    const queryFn = mock((gaql: string): Promise<GoogleAdsRow[]> => {
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'KEYWORD'")) return Promise.resolve([])
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("('LOCATION', 'LANGUAGE')")) return Promise.resolve([])
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'AD_SCHEDULE'")) return Promise.resolve([])
      if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'DEVICE'")) return Promise.resolve(deviceRows)
      if (gaql.includes('FROM campaign_criterion')) return Promise.resolve([])
      if (gaql.includes('FROM campaign_asset')) return Promise.resolve([])
      if (gaql.includes('FROM campaign')) return Promise.resolve(campaignFixtures as GoogleAdsRow[])
      if (gaql.includes('FROM ad_group_criterion')) return Promise.resolve([])
      if (gaql.includes('FROM ad_group_ad')) return Promise.resolve([])
      if (gaql.includes('FROM ad_group')) return Promise.resolve(adGroupFixtures as GoogleAdsRow[])
      return Promise.resolve([])
    })

    const client: GoogleAdsClient = {
      query: queryFn,
      mutate: mock(() => Promise.resolve([])),
      customerId: '7300967494',
    }

    const resources = await fetchAllState(client, { includePaused: true })

    // Find the campaign that should have device rules (campaign 123456 = "Search - PDF Renaming")
    const pdfCampaign = resources.find(r => r.kind === 'campaign' && r.platformId === '123456')
    expect(pdfCampaign).toBeDefined()

    const targeting = pdfCampaign!.properties.targeting as { rules: Array<{ type: string; device?: string; bidAdjustment?: number }> }
    expect(targeting).toBeDefined()
    expect(targeting.rules).toBeDefined()

    const deviceRule = targeting.rules.find(r => r.type === 'device')
    expect(deviceRule).toBeDefined()
    expect(deviceRule!.device).toBe('mobile')
    expect(deviceRule!.bidAdjustment).toBeCloseTo(-0.2)
  })
})
