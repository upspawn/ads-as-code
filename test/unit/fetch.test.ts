import { describe, expect, test, mock } from 'bun:test'
import {
  fetchCampaigns,
  fetchAdGroups,
  fetchKeywords,
  fetchAds,
  fetchAllState,
} from '../../src/google/fetch.ts'
import type { GoogleAdsClient, GoogleAdsRow } from '../../src/google/types.ts'

import campaignFixtures from '../fixtures/api-responses/campaigns.json'
import adGroupFixtures from '../fixtures/api-responses/ad-groups.json'
import keywordFixtures from '../fixtures/api-responses/keywords.json'
import adFixtures from '../fixtures/api-responses/ads.json'

// ─── Mock Client ────────────────────────────────────────────

function createMockClient(responses: Record<string, GoogleAdsRow[]>): GoogleAdsClient {
  const queryFn = mock((gaql: string): Promise<GoogleAdsRow[]> => {
    // Match on the FROM clause to determine which fixture to return
    if (gaql.includes('FROM campaign')) return Promise.resolve(responses.campaigns ?? [])
    if (gaql.includes('FROM ad_group_criterion')) return Promise.resolve(responses.keywords ?? [])
    if (gaql.includes('FROM ad_group_ad')) return Promise.resolve(responses.ads ?? [])
    if (gaql.includes('FROM ad_group')) return Promise.resolve(responses.adGroups ?? [])
    if (gaql.includes('FROM campaign_asset') && gaql.includes('SITELINK')) return Promise.resolve(responses.sitelinks ?? [])
    if (gaql.includes('FROM campaign_asset') && gaql.includes('CALLOUT')) return Promise.resolve(responses.callouts ?? [])
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
  test('normalizes campaign rows to Resources', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    // Should return 3 campaigns from fixture
    expect(resources).toHaveLength(3)

    // First campaign
    const pdf = resources[0]!
    expect(pdf.kind).toBe('campaign')
    expect(pdf.path).toBe('search-pdf-renaming')
    expect(pdf.platformId).toBe('123456')
    expect(pdf.properties.name).toBe('Search - PDF Renaming')
    expect(pdf.properties.status).toBe('enabled')

    // Budget: 20000000 micros → 20
    const budget = pdf.properties.budget as { amount: number; currency: string; period: string }
    expect(budget.amount).toBe(20)
    expect(budget.currency).toBe('EUR')
    expect(budget.period).toBe('daily')

    // Bidding: MAXIMIZE_CONVERSIONS
    const bidding = pdf.properties.bidding as { type: string }
    expect(bidding.type).toBe('maximize-conversions')
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

  test('maps bidding strategy types correctly', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

    expect((resources[0]!.properties.bidding as { type: string }).type).toBe('maximize-conversions')
    expect((resources[1]!.properties.bidding as { type: string }).type).toBe('maximize-clicks')
    expect((resources[2]!.properties.bidding as { type: string }).type).toBe('target-cpa')
  })

  test('maps status correctly', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })

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

// ─── fetchAdGroups ──────────────────────────────────────────

describe('fetchAdGroups', () => {
  test('normalizes ad group rows to Resources', async () => {
    const client = createMockClient({ adGroups: adGroupFixtures as GoogleAdsRow[] })
    const resources = await fetchAdGroups(client)

    expect(resources).toHaveLength(3)

    const pdfCore = resources[0]!
    expect(pdfCore.kind).toBe('adGroup')
    expect(pdfCore.path).toBe('search-pdf-renaming/pdf-core')
    expect(pdfCore.platformId).toBe('111111')
    expect(pdfCore.properties.status).toBe('enabled')

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
  test('normalizes keyword rows to Resources', async () => {
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

  test('maps all match types correctly', async () => {
    const client = createMockClient({ keywords: keywordFixtures as GoogleAdsRow[] })
    const resources = await fetchKeywords(client)

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

// ─── fetchAds ───────────────────────────────────────────────

describe('fetchAds', () => {
  test('normalizes RSA ad rows to Resources', async () => {
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

    // Final URL
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

// ─── fetchAllState ──────────────────────────────────────────

describe('fetchAllState', () => {
  test('orchestrates fetchers in dependency order', async () => {
    const callOrder: string[] = []

    const queryFn = mock((gaql: string): Promise<GoogleAdsRow[]> => {
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
      if (gaql.includes('FROM campaign_asset')) {
        callOrder.push('extensions')
        return Promise.resolve([])
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

    // Campaigns first, then ad groups, then keywords+ads (parallel), then extensions
    expect(callOrder[0]).toBe('campaigns')
    expect(callOrder[1]).toBe('adGroups')
    // keywords and ads run in parallel — order may vary
    expect(callOrder).toContain('keywords')
    expect(callOrder).toContain('ads')
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
      sitelinks: [],
      callouts: [],
    })

    const resources = await fetchAllState(client, { includePaused: true })

    const kinds = new Set(resources.map(r => r.kind))
    expect(kinds.has('campaign')).toBe(true)
    expect(kinds.has('adGroup')).toBe(true)
    expect(kinds.has('keyword')).toBe(true)
    expect(kinds.has('ad')).toBe(true)
  })
})
