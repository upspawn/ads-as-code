import type { Resource, ResourceKind } from '../core/types.ts'
import type { GoogleAdsClient, GoogleAdsRow, BiddingStrategy } from './types.ts'
import type { Cache } from '../core/cache.ts'
import { slugify } from '../core/flatten.ts'

// ─── Types ──────────────────────────────────────────────────

export type FetchOptions = {
  readonly includePaused?: boolean
}

// ─── Enum Maps (google-ads-api gRPC returns numeric enums) ──

const STATUS_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED',
}

const BIDDING_STRATEGY_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENHANCED_CPC', 3: 'MANUAL_CPC',
  4: 'MANUAL_CPM', 5: 'PAGE_ONE_PROMOTED', 6: 'TARGET_CPA',
  7: 'TARGET_OUTRANK_SHARE', 8: 'TARGET_ROAS', 9: 'TARGET_SPEND',
  10: 'MAXIMIZE_CONVERSIONS', 11: 'MAXIMIZE_CONVERSION_VALUE',
  12: 'PERCENT_CPC', 13: 'MANUAL_CPV', 14: 'TARGET_CPM',
  15: 'TARGET_IMPRESSION_SHARE',
}

const MATCH_TYPE_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD',
}

/** Resolve an enum value that may be a number (gRPC) or string (REST). */
function resolveEnum(value: unknown, map: Record<number, string>): string {
  if (typeof value === 'number') return map[value] ?? 'UNKNOWN'
  if (typeof value === 'string') return value
  return 'UNKNOWN'
}

// ─── Helpers ────────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, platformId?: string): Resource {
  return platformId ? { kind, path, properties, platformId } : { kind, path, properties }
}

function microsToAmount(micros: string | number): number {
  const val = typeof micros === 'string' ? parseInt(micros, 10) : Number(micros)
  return val / 1_000_000
}

function mapStatus(apiStatus: unknown): 'enabled' | 'paused' {
  const resolved = resolveEnum(apiStatus, STATUS_MAP)
  return resolved === 'ENABLED' ? 'enabled' : 'paused'
}

function mapBiddingStrategy(apiType: unknown, row: GoogleAdsRow): BiddingStrategy {
  const resolved = resolveEnum(apiType, BIDDING_STRATEGY_MAP)
  switch (resolved) {
    case 'MAXIMIZE_CONVERSIONS':
      return { type: 'maximize-conversions' }
    case 'TARGET_SPEND':   // TARGET_SPEND is what Google Ads API uses for "Maximize Clicks"
    case 'MAXIMIZE_CLICKS': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const maxClicks = (campaign?.maximize_clicks ?? campaign?.maximizeClicks) as Record<string, unknown> | undefined
      const cpcCeiling = maxClicks?.cpc_bid_ceiling_micros ?? maxClicks?.cpcBidCeilingMicros
      return cpcCeiling
        ? { type: 'maximize-clicks', maxCpc: microsToAmount(cpcCeiling as string | number) }
        : { type: 'maximize-clicks' }
    }
    case 'ENHANCED_CPC':
      return { type: 'manual-cpc', enhancedCpc: true }
    case 'MANUAL_CPC': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const manualCpc = (campaign?.manual_cpc ?? campaign?.manualCpc) as Record<string, unknown> | undefined
      const enhanced = manualCpc?.enhanced_cpc_enabled ?? manualCpc?.enhancedCpcEnabled
      return { type: 'manual-cpc', enhancedCpc: enhanced === true }
    }
    case 'TARGET_CPA': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const targetCpa = (campaign?.target_cpa ?? campaign?.targetCpa) as Record<string, unknown> | undefined
      const micros = targetCpa?.target_cpa_micros ?? targetCpa?.targetCpaMicros
      return { type: 'target-cpa', targetCpa: micros ? microsToAmount(micros as string | number) : 0 }
    }
    default:
      return { type: 'maximize-conversions' }
  }
}

function mapMatchType(apiMatchType: unknown): string {
  return resolveEnum(apiMatchType, MATCH_TYPE_MAP)
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// ─── Campaign Fetcher ───────────────────────────────────────

const CAMPAIGN_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.bidding_strategy_type,
  campaign_budget.id,
  campaign_budget.amount_micros
FROM campaign
WHERE campaign.status != 'REMOVED'
`.trim()

const CAMPAIGN_QUERY_ENABLED = `${CAMPAIGN_QUERY}
  AND campaign.status = 'ENABLED'`

export async function fetchCampaigns(
  client: GoogleAdsClient,
  options?: FetchOptions,
): Promise<Resource[]> {
  const query = options?.includePaused ? CAMPAIGN_QUERY : CAMPAIGN_QUERY_ENABLED
  const rows = await client.query(query)
  return rows.map(normalizeCampaignRow)
}

function normalizeCampaignRow(row: GoogleAdsRow): Resource {
  const campaign = row.campaign as Record<string, unknown> | undefined
  // gRPC returns snake_case: campaign_budget; REST returns camelCase: campaignBudget
  const budget = (row.campaign_budget ?? row.campaignBudget) as Record<string, unknown> | undefined

  const id = str(campaign?.id)
  const name = str(campaign?.name)
  const status = mapStatus(campaign?.status)
  const biddingType = campaign?.bidding_strategy_type ?? campaign?.biddingStrategyType
  const amountMicros = budget?.amount_micros ?? budget?.amountMicros
  const amount = amountMicros ? microsToAmount(amountMicros as string | number) : 0

  const bidding = mapBiddingStrategy(biddingType, row)
  const path = slugify(name)

  return resource('campaign', path, {
    name,
    status,
    budget: { amount, currency: 'EUR', period: 'daily' },
    bidding,
  }, id)
}

// ─── Ad Group Fetcher ───────────────────────────────────────

const AD_GROUP_QUERY = `
SELECT
  ad_group.id,
  ad_group.name,
  ad_group.status,
  campaign.id,
  campaign.name
FROM ad_group
WHERE ad_group.status != 'REMOVED'
`.trim()

export async function fetchAdGroups(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Resource[]> {
  let query = AD_GROUP_QUERY
  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const rows = await client.query(query)
  return rows.map(normalizeAdGroupRow)
}

function normalizeAdGroupRow(row: GoogleAdsRow): Resource {
  // gRPC returns snake_case: ad_group; REST returns camelCase: adGroup
  const adGroup = (row.ad_group ?? row.adGroup) as Record<string, unknown> | undefined
  const campaign = row.campaign as Record<string, unknown> | undefined

  const id = str(adGroup?.id)
  const name = str(adGroup?.name)
  const status = mapStatus(adGroup?.status)
  const campaignName = str(campaign?.name)
  const campaignPath = slugify(campaignName)
  const path = `${campaignPath}/${name}`

  return resource('adGroup', path, {
    status,
  }, id)
}

// ─── Keyword Fetcher ────────────────────────────────────────

const KEYWORD_QUERY = `
SELECT
  ad_group_criterion.criterion_id,
  ad_group_criterion.status,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group.id,
  ad_group.name,
  campaign.id,
  campaign.name
FROM ad_group_criterion
WHERE ad_group_criterion.type = 'KEYWORD'
  AND ad_group_criterion.status != 'REMOVED'
`.trim()

export async function fetchKeywords(
  client: GoogleAdsClient,
  adGroupIds?: string[],
): Promise<Resource[]> {
  let query = KEYWORD_QUERY
  if (adGroupIds?.length) {
    query += `\n  AND ad_group.id IN (${adGroupIds.join(', ')})`
  }
  const rows = await client.query(query)
  return rows.map(normalizeKeywordRow)
}

function normalizeKeywordRow(row: GoogleAdsRow): Resource {
  // gRPC returns snake_case: ad_group_criterion; REST returns camelCase: adGroupCriterion
  const criterion = (row.ad_group_criterion ?? row.adGroupCriterion) as Record<string, unknown> | undefined
  const adGroup = (row.ad_group ?? row.adGroup) as Record<string, unknown> | undefined
  const campaign = row.campaign as Record<string, unknown> | undefined

  const criterionId = str(criterion?.criterion_id ?? criterion?.criterionId)
  const keyword = criterion?.keyword as Record<string, unknown> | undefined
  const text = str(keyword?.text)
  const matchType = mapMatchType(keyword?.match_type ?? keyword?.matchType)
  const adGroupName = str(adGroup?.name)
  const campaignName = str(campaign?.name)

  const campaignPath = slugify(campaignName)
  const path = `${campaignPath}/${adGroupName}/kw:${text.toLowerCase()}:${matchType}`

  return resource('keyword', path, {
    text,
    matchType,
  }, criterionId)
}

// ─── Ad Fetcher ─────────────────────────────────────────────

const AD_QUERY = `
SELECT
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.ad.final_urls,
  ad_group_ad.status,
  ad_group.id,
  ad_group.name,
  campaign.id,
  campaign.name
FROM ad_group_ad
WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
  AND ad_group_ad.status != 'REMOVED'
`.trim()

export async function fetchAds(
  client: GoogleAdsClient,
  adGroupIds?: string[],
): Promise<Resource[]> {
  let query = AD_QUERY
  if (adGroupIds?.length) {
    query += `\n  AND ad_group.id IN (${adGroupIds.join(', ')})`
  }
  const rows = await client.query(query)
  return rows.map(normalizeAdRow)
}

function normalizeAdRow(row: GoogleAdsRow): Resource {
  // gRPC returns snake_case: ad_group_ad; REST returns camelCase: adGroupAd
  const adGroupAd = (row.ad_group_ad ?? row.adGroupAd) as Record<string, unknown> | undefined
  const ad = adGroupAd?.ad as Record<string, unknown> | undefined
  const adGroup = (row.ad_group ?? row.adGroup) as Record<string, unknown> | undefined
  const campaign = row.campaign as Record<string, unknown> | undefined

  const adId = str(ad?.id)
  // gRPC returns snake_case: responsive_search_ad; REST returns camelCase: responsiveSearchAd
  const rsa = (ad?.responsive_search_ad ?? ad?.responsiveSearchAd) as Record<string, unknown> | undefined
  const headlineAssets = (rsa?.headlines ?? []) as Array<{ text: string }>
  const descriptionAssets = (rsa?.descriptions ?? []) as Array<{ text: string }>

  const headlines = headlineAssets.map(h => h.text).sort()
  const descriptions = descriptionAssets.map(d => d.text).sort()
  // gRPC returns snake_case: final_urls; REST returns camelCase: finalUrls
  const finalUrls = (ad?.final_urls ?? ad?.finalUrls ?? []) as string[]
  const finalUrl = finalUrls[0] ?? ''

  const adGroupName = str(adGroup?.name)
  const campaignName = str(campaign?.name)
  const campaignPath = slugify(campaignName)

  // Generate a stable hash matching flatten.ts's rsaHash
  const payload = JSON.stringify({ headlines: [...headlines].sort(), descriptions: [...descriptions].sort(), finalUrl })
  const h = Bun.hash(payload)
  const hash = (typeof h === 'bigint' ? h : BigInt(h)).toString(16).slice(-12)

  const path = `${campaignPath}/${adGroupName}/rsa:${hash}`

  return resource('ad', path, {
    headlines,
    descriptions,
    finalUrl,
  }, adId)
}

// ─── Extension Fetcher ──────────────────────────────────────

const SITELINK_QUERY = `
SELECT
  campaign_asset.resource_name,
  campaign_asset.asset,
  asset.id,
  asset.name,
  asset.sitelink_asset.link_text,
  asset.sitelink_asset.description1,
  asset.sitelink_asset.description2,
  asset.final_urls,
  campaign.id,
  campaign.name
FROM campaign_asset
WHERE campaign_asset.field_type = 'SITELINK'
  AND campaign_asset.status != 'REMOVED'
`.trim()

const CALLOUT_QUERY = `
SELECT
  campaign_asset.resource_name,
  campaign_asset.asset,
  asset.id,
  asset.callout_asset.callout_text,
  campaign.id,
  campaign.name
FROM campaign_asset
WHERE campaign_asset.field_type = 'CALLOUT'
  AND campaign_asset.status != 'REMOVED'
`.trim()

export async function fetchExtensions(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Resource[]> {
  const resources: Resource[] = []

  // Sitelinks
  let slQuery = SITELINK_QUERY
  if (campaignIds?.length) {
    slQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const slRows = await client.query(slQuery)
  for (const row of slRows) {
    const asset = row.asset as Record<string, unknown> | undefined
    // gRPC returns snake_case: sitelink_asset; REST returns camelCase: sitelinkAsset
    const sitelink = (asset?.sitelink_asset ?? asset?.sitelinkAsset) as Record<string, unknown> | undefined
    const campaign = row.campaign as Record<string, unknown> | undefined

    const assetId = str(asset?.id)
    const linkText = str(sitelink?.link_text ?? sitelink?.linkText)
    const desc1 = sitelink?.description1 as string | undefined
    const desc2 = sitelink?.description2 as string | undefined
    const finalUrls = (asset?.final_urls ?? asset?.finalUrls ?? []) as string[]
    const url = finalUrls[0] ?? ''
    const campaignName = str(campaign?.name)
    const campaignPath = slugify(campaignName)
    const path = `${campaignPath}/sl:${linkText.toLowerCase()}`

    resources.push(resource('sitelink', path, {
      text: linkText,
      url,
      description1: desc1,
      description2: desc2,
    }, assetId))
  }

  // Callouts
  let coQuery = CALLOUT_QUERY
  if (campaignIds?.length) {
    coQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const coRows = await client.query(coQuery)
  for (const row of coRows) {
    const asset = row.asset as Record<string, unknown> | undefined
    // gRPC returns snake_case: callout_asset; REST returns camelCase: calloutAsset
    const callout = (asset?.callout_asset ?? asset?.calloutAsset) as Record<string, unknown> | undefined
    const campaign = row.campaign as Record<string, unknown> | undefined

    const assetId = str(asset?.id)
    const calloutText = str(callout?.callout_text ?? callout?.calloutText)
    const campaignName = str(campaign?.name)
    const campaignPath = slugify(campaignName)
    const path = `${campaignPath}/co:${calloutText.toLowerCase()}`

    resources.push(resource('callout', path, {
      text: calloutText,
    }, assetId))
  }

  return resources
}

// ─── Orchestrators ──────────────────────────────────────────

export async function fetchAllState(
  client: GoogleAdsClient,
  options?: FetchOptions,
): Promise<Resource[]> {
  // Step 1: Campaigns
  const campaigns = await fetchCampaigns(client, options)
  const campaignIds = campaigns.map(c => c.platformId!).filter(Boolean)

  if (campaignIds.length === 0) return campaigns

  // Step 2: Ad groups (scoped to fetched campaigns)
  const adGroups = await fetchAdGroups(client, campaignIds)
  const adGroupIds = adGroups.map(ag => ag.platformId!).filter(Boolean)

  // Step 3: Keywords + ads (scoped to ad groups) — can run in parallel
  const [keywords, ads] = await Promise.all([
    adGroupIds.length > 0 ? fetchKeywords(client, adGroupIds) : Promise.resolve([]),
    adGroupIds.length > 0 ? fetchAds(client, adGroupIds) : Promise.resolve([]),
  ])

  // Step 4: Extensions (scoped to campaigns)
  const extensions = await fetchExtensions(client, campaignIds)

  return [...campaigns, ...adGroups, ...keywords, ...ads, ...extensions]
}

export async function fetchKnownState(
  client: GoogleAdsClient,
  cache: Cache,
  project: string,
): Promise<Resource[]> {
  const resourceMap = cache.getResourceMap(project)
  if (resourceMap.length === 0) return []

  // Extract unique campaign platformIds from the cache
  const campaignPlatformIds = resourceMap
    .filter(r => r.kind === 'campaign' && r.platformId)
    .map(r => r.platformId!)

  // If we know specific campaigns, scope the fetch
  if (campaignPlatformIds.length > 0) {
    const campaigns = await fetchCampaigns(client, { includePaused: true })
    const knownCampaigns = campaigns.filter(c =>
      c.platformId && campaignPlatformIds.includes(c.platformId),
    )
    const knownCampaignIds = knownCampaigns.map(c => c.platformId!).filter(Boolean)

    if (knownCampaignIds.length === 0) return []

    const adGroups = await fetchAdGroups(client, knownCampaignIds)
    const adGroupIds = adGroups.map(ag => ag.platformId!).filter(Boolean)

    const [keywords, ads] = await Promise.all([
      adGroupIds.length > 0 ? fetchKeywords(client, adGroupIds) : Promise.resolve([]),
      adGroupIds.length > 0 ? fetchAds(client, adGroupIds) : Promise.resolve([]),
    ])
    const extensions = await fetchExtensions(client, knownCampaignIds)

    return [...knownCampaigns, ...adGroups, ...keywords, ...ads, ...extensions]
  }

  // Fallback: fetch everything
  return fetchAllState(client, { includePaused: true })
}
