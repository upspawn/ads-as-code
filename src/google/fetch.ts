import type { Resource, ResourceKind, AudienceTarget } from '../core/types.ts'
import type { GoogleAdsClient, GoogleAdsRow, BiddingStrategy } from './types.ts'
import type { Cache } from '../core/cache.ts'
import { slugify } from '../core/flatten.ts'
import { GEO_TARGETS_REVERSE, LANGUAGE_CRITERIA_REVERSE } from './constants.ts'
import { fetchDemographicTargeting, fetchAudienceTargeting } from './fetch-targeting.ts'

// ─── Types ──────────────────────────────────────────────────

export type FetchOptions = {
  readonly includePaused?: boolean
}

// ─── Enum Maps (google-ads-api gRPC returns numeric enums) ──

const STATUS_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED',
}

const BIDDING_STRATEGY_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'MANUAL_CPC', 3: 'MANUAL_CPM',
  4: 'MANUAL_CPV', 5: 'PAGE_ONE_PROMOTED', 6: 'MAXIMIZE_CONVERSIONS',
  7: 'TARGET_OUTRANK_SHARE', 8: 'TARGET_ROAS', 9: 'TARGET_CPA',
  10: 'TARGET_SPEND', 11: 'MAXIMIZE_CLICKS',
  12: 'MAXIMIZE_CONVERSION_VALUE', 13: 'PERCENT_CPC', 14: 'TARGET_CPM',
  15: 'TARGET_IMPRESSION_SHARE',
}

const CHANNEL_TYPE_MAP: Record<number, string> = {
  0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'SEARCH', 3: 'DISPLAY',
  4: 'SHOPPING', 5: 'HOTEL', 6: 'VIDEO', 7: 'MULTI_CHANNEL',
  8: 'LOCAL', 9: 'SMART', 10: 'PERFORMANCE_MAX', 11: 'LOCAL_SERVICES',
  12: 'DISCOVERY', 13: 'TRAVEL', 14: 'DEMAND_GEN',
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
    case 'MANUAL_CPM':
      return { type: 'manual-cpm' }
    case 'TARGET_CPM':
      return { type: 'target-cpm' }
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
    case 'TARGET_ROAS': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const targetRoasObj = (campaign?.target_roas ?? campaign?.targetRoas) as Record<string, unknown> | undefined
      const roas = targetRoasObj?.target_roas ?? targetRoasObj?.targetRoas
      return { type: 'target-roas', targetRoas: Number(roas ?? 0) }
    }
    case 'TARGET_IMPRESSION_SHARE': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const tis = (campaign?.target_impression_share ?? campaign?.targetImpressionShare) as Record<string, unknown> | undefined
      const locationEnum = Number(tis?.location ?? 2)
      const locationMap: Record<number, 'anywhere' | 'top' | 'absolute-top'> = { 2: 'anywhere', 3: 'top', 4: 'absolute-top' }
      const location = locationMap[locationEnum] ?? 'anywhere'
      const fractionMicros = tis?.location_fraction_micros ?? tis?.locationFractionMicros
      const targetPercent = fractionMicros ? Number(fractionMicros) / 10_000 : 0
      const cpcCeiling = tis?.cpc_bid_ceiling_micros ?? tis?.cpcBidCeilingMicros
      const result: BiddingStrategy = { type: 'target-impression-share', location, targetPercent }
      return cpcCeiling
        ? { ...result, maxCpc: microsToAmount(cpcCeiling as string | number) }
        : result
    }
    case 'MAXIMIZE_CONVERSION_VALUE': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const mcv = (campaign?.maximize_conversion_value ?? campaign?.maximizeConversionValue) as Record<string, unknown> | undefined
      const roas = mcv?.target_roas ?? mcv?.targetRoas
      return roas !== undefined && roas !== null
        ? { type: 'maximize-conversion-value', targetRoas: Number(roas) }
        : { type: 'maximize-conversion-value' }
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
  campaign.advertising_channel_type,
  campaign.bidding_strategy_type,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign.tracking_url_template,
  campaign.final_url_suffix,
  campaign.url_custom_parameters,
  campaign_budget.id,
  campaign_budget.resource_name,
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
  const budgetResourceName = str(budget?.resource_name ?? budget?.resourceName)

  // Channel type: numeric enum → SDK string (only set for non-Search campaigns)
  const channelTypeRaw = campaign?.advertising_channel_type ?? campaign?.advertisingChannelType
  const channelTypeStr = resolveEnum(channelTypeRaw, CHANNEL_TYPE_MAP)
  const channelType = channelTypeStr === 'DISPLAY' ? 'display'
    : channelTypeStr === 'PERFORMANCE_MAX' ? 'performance-max'
    : undefined // Search and other types don't set channelType (preserves existing behavior)

  // Network settings: support both snake_case (gRPC) and camelCase (REST)
  const networkSettingsRaw = (campaign?.network_settings ?? campaign?.networkSettings) as Record<string, unknown> | undefined
  const networkSettings = networkSettingsRaw ? {
    searchNetwork: (networkSettingsRaw.target_google_search ?? networkSettingsRaw.targetGoogleSearch) === true,
    searchPartners: (networkSettingsRaw.target_search_network ?? networkSettingsRaw.targetSearchNetwork) === true,
    displayNetwork: (networkSettingsRaw.target_content_network ?? networkSettingsRaw.targetContentNetwork) === true,
  } : undefined

  // Dates and tracking: support both snake_case (gRPC) and camelCase (REST)
  const startDate = str(campaign?.start_date ?? campaign?.startDate) || undefined
  const endDate = str(campaign?.end_date ?? campaign?.endDate) || undefined
  const trackingTemplate = str(campaign?.tracking_url_template ?? campaign?.trackingUrlTemplate) || undefined
  const finalUrlSuffix = str(campaign?.final_url_suffix ?? campaign?.finalUrlSuffix) || undefined
  const rawCustomParams = (campaign?.url_custom_parameters ?? campaign?.urlCustomParameters) as Array<{ key: string; value: string }> | undefined
  const customParameters = rawCustomParams?.length
    ? Object.fromEntries(rawCustomParams.map(p => [p.key, p.value]))
    : undefined

  const props: Record<string, unknown> = {
    name,
    status,
    budget: { amount, currency: 'EUR', period: 'daily' },
    bidding,
    ...(channelType ? { channelType } : {}),
    ...(networkSettings ? { networkSettings } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(trackingTemplate ? { trackingTemplate } : {}),
    ...(finalUrlSuffix ? { finalUrlSuffix } : {}),
    ...(customParameters ? { customParameters } : {}),
  }
  const meta = budgetResourceName ? { budgetResourceName } : undefined
  return { kind: 'campaign' as const, path, properties: props, ...(meta ? { meta } : {}), ...(id ? { platformId: id } : {}) }
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
  const groupSlug = slugify(name)
  const path = `${campaignPath}/${groupSlug}`

  return resource('adGroup', path, {
    status,
  }, id)
}

// ─── Keyword Fetcher ────────────────────────────────────────

const KEYWORD_QUERY = `
SELECT
  ad_group_criterion.resource_name,
  ad_group_criterion.criterion_id,
  ad_group_criterion.status,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.cpc_bid_micros,
  ad_group_criterion.final_urls,
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

  const resourceName = str(criterion?.resource_name ?? criterion?.resourceName)
  const keyword = criterion?.keyword as Record<string, unknown> | undefined
  const text = str(keyword?.text)
  const matchType = mapMatchType(keyword?.match_type ?? keyword?.matchType)
  const adGroupName = str(adGroup?.name)
  const campaignName = str(campaign?.name)

  // Extended keyword fields
  const kwStatus = mapStatus(criterion?.status)
  const cpcBidMicros = criterion?.cpc_bid_micros ?? criterion?.cpcBidMicros
  const bid = cpcBidMicros ? microsToAmount(cpcBidMicros as string | number) : undefined
  const kwFinalUrls = (criterion?.final_urls ?? criterion?.finalUrls ?? []) as string[]
  const kwFinalUrl = kwFinalUrls[0] as string | undefined

  const campaignPath = slugify(campaignName)
  const groupSlug = slugify(adGroupName)
  const path = `${campaignPath}/${groupSlug}/kw:${text.toLowerCase()}:${matchType}`

  return resource('keyword', path, {
    text,
    matchType,
    ...(kwStatus !== 'enabled' ? { status: kwStatus } : {}),
    ...(bid !== undefined && bid > 0 ? { bid } : {}),
    ...(kwFinalUrl ? { finalUrl: kwFinalUrl } : {}),
  }, resourceName || undefined)
}

// ─── Ad Fetcher ─────────────────────────────────────────────

const AD_QUERY = `
SELECT
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.responsive_search_ad.path1,
  ad_group_ad.ad.responsive_search_ad.path2,
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
  const headlineAssets = (rsa?.headlines ?? []) as Array<{ text: string; pinned_field?: number; pinnedField?: number }>
  const descriptionAssets = (rsa?.descriptions ?? []) as Array<{ text: string; pinned_field?: number; pinnedField?: number }>

  const headlines = headlineAssets.map(h => h.text).sort()
  const descriptions = descriptionAssets.map(d => d.text).sort()

  // Extract pinned headlines (pinned_field 1-3 = HEADLINE_1/2/3)
  const pinnedHeadlines = headlineAssets
    .filter(h => {
      const pf = h.pinned_field ?? h.pinnedField ?? 0
      return pf >= 1 && pf <= 3
    })
    .map(h => ({ text: h.text, position: (h.pinned_field ?? h.pinnedField!) as 1 | 2 | 3 }))

  // Extract pinned descriptions (pinned_field 4-5 = DESCRIPTION_1/2)
  const pinnedDescriptions = descriptionAssets
    .filter(d => {
      const pf = d.pinned_field ?? d.pinnedField ?? 0
      return pf >= 4 && pf <= 5
    })
    .map(d => ({ text: d.text, position: ((d.pinned_field ?? d.pinnedField!) - 3) as 1 | 2 }))

  // Path fields
  const path1 = str(rsa?.path1) || undefined
  const path2 = str(rsa?.path2) || undefined

  // Ad status from ad_group_ad level
  const adStatus = mapStatus(adGroupAd?.status)

  // gRPC returns snake_case: final_urls; REST returns camelCase: finalUrls
  const finalUrls = (ad?.final_urls ?? ad?.finalUrls ?? []) as string[]
  const finalUrl = finalUrls[0] ?? ''

  const adGroupName = str(adGroup?.name)
  const campaignName = str(campaign?.name)
  const campaignPath = slugify(campaignName)
  const groupSlug = slugify(adGroupName)

  // Generate a stable hash matching flatten.ts's rsaHash
  const payload = JSON.stringify({ headlines: [...headlines].sort(), descriptions: [...descriptions].sort(), finalUrl })
  const h = Bun.hash(payload)
  const hash = (typeof h === 'bigint' ? h : BigInt(h)).toString(16).slice(-12)

  const path = `${campaignPath}/${groupSlug}/rsa:${hash}`

  return resource('ad', path, {
    headlines,
    descriptions,
    finalUrl,
    ...(adStatus !== 'enabled' ? { status: adStatus } : {}),
    ...(pinnedHeadlines.length > 0 ? { pinnedHeadlines } : {}),
    ...(pinnedDescriptions.length > 0 ? { pinnedDescriptions } : {}),
    ...(path1 ? { path1 } : {}),
    ...(path2 ? { path2 } : {}),
  }, adId)
}

// ─── Display Ad Fetcher ─────────────────────────────────────

const DISPLAY_AD_QUERY = `
SELECT
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.ad.responsive_display_ad.headlines,
  ad_group_ad.ad.responsive_display_ad.long_headline,
  ad_group_ad.ad.responsive_display_ad.descriptions,
  ad_group_ad.ad.responsive_display_ad.business_name,
  ad_group_ad.ad.responsive_display_ad.marketing_images,
  ad_group_ad.ad.responsive_display_ad.square_marketing_images,
  ad_group_ad.ad.responsive_display_ad.logo_images,
  ad_group_ad.ad.responsive_display_ad.call_to_action_text,
  ad_group_ad.ad.responsive_display_ad.main_color,
  ad_group_ad.ad.responsive_display_ad.accent_color,
  ad_group_ad.ad.final_urls,
  ad_group_ad.status,
  ad_group.id,
  ad_group.name,
  campaign.id,
  campaign.name
FROM ad_group_ad
WHERE ad_group_ad.ad.type = 'RESPONSIVE_DISPLAY_AD'
  AND ad_group_ad.status != 'REMOVED'
`.trim()

export async function fetchDisplayAds(
  client: GoogleAdsClient,
  adGroupIds?: string[],
): Promise<Resource[]> {
  let query = DISPLAY_AD_QUERY
  if (adGroupIds?.length) {
    query += `\n  AND ad_group.id IN (${adGroupIds.join(', ')})`
  }
  const rows = await client.query(query)
  return rows.map(normalizeDisplayAdRow)
}

export function normalizeDisplayAdRow(row: GoogleAdsRow): Resource {
  const adGroupAd = (row.ad_group_ad ?? row.adGroupAd) as Record<string, unknown> | undefined
  const ad = adGroupAd?.ad as Record<string, unknown> | undefined
  const adGroup = (row.ad_group ?? row.adGroup) as Record<string, unknown> | undefined
  const campaign = row.campaign as Record<string, unknown> | undefined

  const adId = str(ad?.id)
  const rda = (ad?.responsive_display_ad ?? ad?.responsiveDisplayAd) as Record<string, unknown> | undefined

  // Text fields
  const headlineAssets = (rda?.headlines ?? []) as Array<{ text: string }>
  const headlines = headlineAssets.map(h => h.text).sort()
  const longHeadlineObj = (rda?.long_headline ?? rda?.longHeadline) as { text: string } | undefined
  const longHeadline = longHeadlineObj?.text ?? ''
  const descriptionAssets = (rda?.descriptions ?? []) as Array<{ text: string }>
  const descriptions = descriptionAssets.map(d => d.text).sort()
  const businessName = str(rda?.business_name ?? rda?.businessName)

  // Images — extract asset resource names
  const marketingImageRefs = (rda?.marketing_images ?? rda?.marketingImages ?? []) as Array<{ asset: string }>
  const squareMarketingImageRefs = (rda?.square_marketing_images ?? rda?.squareMarketingImages ?? []) as Array<{ asset: string }>
  const logoImageRefs = (rda?.logo_images ?? rda?.logoImages ?? []) as Array<{ asset: string }>

  const marketingImages = marketingImageRefs.map(i => i.asset)
  const squareMarketingImages = squareMarketingImageRefs.map(i => i.asset)
  const logoImages = logoImageRefs.map(i => i.asset)

  // Style fields
  const mainColor = str(rda?.main_color ?? rda?.mainColor) || undefined
  const accentColor = str(rda?.accent_color ?? rda?.accentColor) || undefined
  const callToAction = str(rda?.call_to_action_text ?? rda?.callToActionText) || undefined

  // Status
  const adStatus = mapStatus(adGroupAd?.status)

  // Final URL
  const finalUrls = (ad?.final_urls ?? ad?.finalUrls ?? []) as string[]
  const finalUrl = finalUrls[0] ?? ''

  // Path construction
  const adGroupName = str(adGroup?.name)
  const campaignName = str(campaign?.name)
  const campaignPath = slugify(campaignName)
  const groupSlug = slugify(adGroupName)

  // Stable hash matching flattenDisplay's responsiveDisplayHash
  const payload = JSON.stringify({ headlines: [...headlines].sort(), longHeadline, finalUrl })
  const h = Bun.hash(payload)
  const hash = (typeof h === 'bigint' ? h : BigInt(h)).toString(16).slice(-12)
  const path = `${campaignPath}/${groupSlug}/rda:${hash}`

  return resource('ad', path, {
    adType: 'responsive-display',
    headlines,
    longHeadline,
    descriptions,
    businessName,
    finalUrl,
    ...(adStatus !== 'enabled' ? { status: adStatus } : {}),
    ...(marketingImages.length > 0 ? { marketingImages } : {}),
    ...(squareMarketingImages.length > 0 ? { squareMarketingImages } : {}),
    ...(logoImages.length > 0 ? { logoImages } : {}),
    ...(mainColor ? { mainColor } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(callToAction ? { callToAction } : {}),
  }, adId)
}

// ─── Asset Group Fetcher (PMax) ──────────────────────────────

const ASSET_GROUP_QUERY = `
SELECT
  asset_group.id,
  asset_group.name,
  asset_group.status,
  asset_group.campaign,
  asset_group.final_urls,
  asset_group.final_mobile_urls,
  asset_group.path1,
  asset_group.path2,
  campaign.id,
  campaign.name
FROM asset_group
WHERE asset_group.status != 'REMOVED'
  AND campaign.status != 'REMOVED'
`.trim()

const ASSET_GROUP_ASSET_QUERY = `
SELECT
  asset_group.id,
  asset_group_asset.field_type,
  asset.id,
  asset.name,
  asset.text_asset.text,
  asset.image_asset.full_size.url,
  asset.youtube_video_asset.youtube_video_id
FROM asset_group_asset
WHERE asset_group.status != 'REMOVED'
`.trim()

export async function fetchAssetGroups(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<{ groups: GoogleAdsRow[]; assets: GoogleAdsRow[] }> {
  let groupQuery = ASSET_GROUP_QUERY
  let assetQuery = ASSET_GROUP_ASSET_QUERY
  if (campaignIds?.length) {
    groupQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
    assetQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }

  const [groups, assets] = await Promise.all([
    client.query(groupQuery),
    client.query(assetQuery),
  ])

  return { groups, assets }
}

/**
 * Normalize asset group rows + their text/image/video assets into Resource objects.
 * Exported for testing — called internally by fetchAllState.
 */
export function normalizeAssetGroupData(
  assetGroupRows: GoogleAdsRow[],
  assetRows: GoogleAdsRow[],
  campaignPath: string,
): Resource[] {
  // Group asset rows by asset_group.id
  const assetsByGroupId = new Map<string, GoogleAdsRow[]>()
  for (const row of assetRows) {
    const ag = (row.asset_group ?? row.assetGroup) as Record<string, unknown> | undefined
    const id = str(ag?.id)
    if (!id) continue
    const existing = assetsByGroupId.get(id) ?? []
    existing.push(row)
    assetsByGroupId.set(id, existing)
  }

  const resources: Resource[] = []

  for (const row of assetGroupRows) {
    const ag = (row.asset_group ?? row.assetGroup) as Record<string, unknown> | undefined

    const id = str(ag?.id)
    const name = str(ag?.name)
    const status = mapStatus(ag?.status)
    const finalUrls = (ag?.final_urls ?? ag?.finalUrls ?? []) as string[]
    const finalMobileUrls = (ag?.final_mobile_urls ?? ag?.finalMobileUrls ?? []) as string[]
    const path1 = str(ag?.path1) || undefined
    const path2 = str(ag?.path2) || undefined

    const groupSlug = slugify(name)
    const path = `${campaignPath}/${groupSlug}`

    // Collect text assets by field type
    const groupAssets = assetsByGroupId.get(id) ?? []
    const headlines: string[] = []
    const longHeadlines: string[] = []
    const descriptions: string[] = []
    let businessName = ''
    const images: string[] = []
    const videos: string[] = []

    for (const assetRow of groupAssets) {
      const aga = (assetRow.asset_group_asset ?? assetRow.assetGroupAsset) as Record<string, unknown> | undefined
      const asset = assetRow.asset as Record<string, unknown> | undefined
      const fieldType = str(aga?.field_type ?? aga?.fieldType)
      const textAsset = (asset?.text_asset ?? asset?.textAsset) as Record<string, unknown> | undefined
      const imageAsset = (asset?.image_asset ?? asset?.imageAsset) as Record<string, unknown> | undefined
      const videoAsset = (asset?.youtube_video_asset ?? asset?.youtubeVideoAsset) as Record<string, unknown> | undefined

      const text = str(textAsset?.text)

      switch (fieldType) {
        case 'HEADLINE':
          if (text) headlines.push(text)
          break
        case 'LONG_HEADLINE':
          if (text) longHeadlines.push(text)
          break
        case 'DESCRIPTION':
          if (text) descriptions.push(text)
          break
        case 'BUSINESS_NAME':
          if (text) businessName = text
          break
        case 'MARKETING_IMAGE':
        case 'SQUARE_MARKETING_IMAGE':
        case 'PORTRAIT_MARKETING_IMAGE':
        case 'LOGO': {
          const fullSize = (imageAsset?.full_size ?? imageAsset?.fullSize) as Record<string, unknown> | undefined
          const imageUrl = str(fullSize?.url)
          if (imageUrl) images.push(imageUrl)
          break
        }
        case 'YOUTUBE_VIDEO': {
          const videoId = str(videoAsset?.youtube_video_id ?? videoAsset?.youtubeVideoId)
          if (videoId) videos.push(`https://youtube.com/watch?v=${videoId}`)
          break
        }
      }
    }

    resources.push(resource('assetGroup', path, {
      name,
      status,
      finalUrls,
      ...(finalMobileUrls.length > 0 ? { finalMobileUrls } : {}),
      headlines,
      longHeadlines,
      descriptions,
      businessName,
      ...(path1 ? { path1 } : {}),
      ...(path2 ? { path2 } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(videos.length > 0 ? { videos } : {}),
    }, id))
  }

  return resources
}

// ─── Negative Keyword Fetcher ───────────────────────────────

const NEGATIVE_KEYWORD_QUERY = `
SELECT
  campaign.name,
  campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type
FROM campaign_criterion
WHERE campaign_criterion.type = 'KEYWORD'
  AND campaign_criterion.negative = TRUE
  AND campaign.status = 'ENABLED'
`.trim()

export async function fetchNegativeKeywords(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Resource[]> {
  let query = NEGATIVE_KEYWORD_QUERY
  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const rows = await client.query(query)
  return rows.map(normalizeNegativeKeywordRow)
}

function normalizeNegativeKeywordRow(row: GoogleAdsRow): Resource {
  const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown> | undefined
  const campaign = row.campaign as Record<string, unknown> | undefined

  const keyword = criterion?.keyword as Record<string, unknown> | undefined
  const text = str(keyword?.text)
  const matchType = mapMatchType(keyword?.match_type ?? keyword?.matchType)
  const campaignName = str(campaign?.name)
  const campaignSlug = slugify(campaignName)
  const path = `${campaignSlug}/neg:${text.toLowerCase()}:${matchType}`

  return resource('negative', path, {
    text,
    matchType,
  })
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

const STRUCTURED_SNIPPET_QUERY = `
SELECT
  campaign_asset.resource_name,
  campaign_asset.asset,
  asset.id,
  asset.structured_snippet_asset.header,
  asset.structured_snippet_asset.values,
  campaign.id,
  campaign.name
FROM campaign_asset
WHERE campaign_asset.field_type = 'STRUCTURED_SNIPPET'
  AND campaign_asset.status != 'REMOVED'
`.trim()

const CALL_QUERY = `
SELECT
  campaign_asset.resource_name,
  campaign_asset.asset,
  asset.id,
  asset.call_asset.country_code,
  asset.call_asset.phone_number,
  campaign.id,
  campaign.name
FROM campaign_asset
WHERE campaign_asset.field_type = 'CALL'
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

  // Structured Snippets
  let ssQuery = STRUCTURED_SNIPPET_QUERY
  if (campaignIds?.length) {
    ssQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const ssRows = await client.query(ssQuery)
  for (const row of ssRows) {
    const asset = row.asset as Record<string, unknown> | undefined
    const snippetAsset = (asset?.structured_snippet_asset ?? asset?.structuredSnippetAsset) as Record<string, unknown> | undefined
    const campaign = row.campaign as Record<string, unknown> | undefined

    const assetId = str(asset?.id)
    const header = str(snippetAsset?.header)
    const values = (snippetAsset?.values ?? []) as string[]
    const campaignName = str(campaign?.name)
    const campaignPath = slugify(campaignName)
    const path = `${campaignPath}/ss:${header.toLowerCase()}`

    resources.push(resource('structuredSnippet', path, {
      header,
      values,
    }, assetId))
  }

  // Call Extensions
  let callQuery = CALL_QUERY
  if (campaignIds?.length) {
    callQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const callRows = await client.query(callQuery)
  for (const row of callRows) {
    const asset = row.asset as Record<string, unknown> | undefined
    const callAsset = (asset?.call_asset ?? asset?.callAsset) as Record<string, unknown> | undefined
    const campaign = row.campaign as Record<string, unknown> | undefined

    const assetId = str(asset?.id)
    const phoneNumber = str(callAsset?.phone_number ?? callAsset?.phoneNumber)
    const countryCode = str(callAsset?.country_code ?? callAsset?.countryCode)
    const campaignName = str(campaign?.name)
    const campaignPath = slugify(campaignName)
    const path = `${campaignPath}/call:${phoneNumber}`

    resources.push(resource('callExtension', path, {
      phoneNumber,
      countryCode,
    }, assetId))
  }

  return resources
}

// ─── Campaign Targeting Fetcher ──────────────────────────────

type CampaignTargeting = {
  geo: string[]
  languages: string[]
  schedule: { days: string[]; startHour?: number; endHour?: number } | null
  geoBidAdjustments: Record<string, number>
  scheduleBids: Array<{ day: string; startHour: number; endHour: number; bidAdjustment: number }>
}

// Day of week from gRPC is numeric: 2=MON, 3=TUE, 4=WED, 5=THU, 6=FRI, 7=SAT, 8=SUN
const DAY_OF_WEEK_MAP: Record<number | string, string> = {
  2: 'mon', 3: 'tue', 4: 'wed', 5: 'thu', 6: 'fri', 7: 'sat', 8: 'sun',
  'MONDAY': 'mon', 'TUESDAY': 'tue', 'WEDNESDAY': 'wed', 'THURSDAY': 'thu',
  'FRIDAY': 'fri', 'SATURDAY': 'sat', 'SUNDAY': 'sun',
}

// Criterion type enum: gRPC returns numeric values
const CRITERION_TYPE_MAP: Record<number | string, string> = {
  6: 'LOCATION', 7: 'AD_SCHEDULE', 16: 'LANGUAGE',
  'LOCATION': 'LOCATION', 'AD_SCHEDULE': 'AD_SCHEDULE', 'LANGUAGE': 'LANGUAGE',
}

// Sort days in weekday order
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function sortDays(days: string[]): string[] {
  return [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
}

/**
 * Fetch geo, language, and ad schedule targeting for campaigns.
 * Returns a map from campaign platformId to targeting data.
 */
export async function fetchCampaignTargeting(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Map<string, CampaignTargeting>> {
  // Build full-path reverse maps
  const geoReverse: Record<string, string> = {}
  const langReverse: Record<string, string> = {}
  for (const [id, code] of Object.entries(GEO_TARGETS_REVERSE)) {
    geoReverse[`geoTargetConstants/${id}`] = code
  }
  for (const [id, code] of Object.entries(LANGUAGE_CRITERIA_REVERSE)) {
    langReverse[`languageConstants/${id}`] = code
  }

  // Fetch geo + language criteria (includes bid_modifier for location bid adjustments)
  let geoLangQuery = `
SELECT
  campaign.id,
  campaign_criterion.type,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.language.language_constant,
  campaign_criterion.bid_modifier
FROM campaign_criterion
WHERE campaign_criterion.type IN ('LOCATION', 'LANGUAGE')
  AND campaign_criterion.negative = FALSE
  AND campaign.status != 'REMOVED'`.trim()

  if (campaignIds?.length) {
    geoLangQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }

  // Fetch ad schedule criteria (includes bid_modifier for schedule bid adjustments)
  let scheduleQuery = `
SELECT
  campaign.id,
  campaign_criterion.ad_schedule.day_of_week,
  campaign_criterion.ad_schedule.start_hour,
  campaign_criterion.ad_schedule.end_hour,
  campaign_criterion.bid_modifier
FROM campaign_criterion
WHERE campaign_criterion.type = 'AD_SCHEDULE'
  AND campaign.status != 'REMOVED'`.trim()

  if (campaignIds?.length) {
    scheduleQuery += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }

  const [geoLangRows, scheduleRows] = await Promise.all([
    client.query(geoLangQuery),
    client.query(scheduleQuery),
  ])

  // Group by campaign ID
  const result = new Map<string, CampaignTargeting>()

  function ensure(campaignId: string): CampaignTargeting {
    if (!result.has(campaignId)) {
      result.set(campaignId, { geo: [], languages: [], schedule: null, geoBidAdjustments: {}, scheduleBids: [] })
    }
    return result.get(campaignId)!
  }

  for (const row of geoLangRows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)
    const rawType = criterion.type as number | string
    const type = CRITERION_TYPE_MAP[rawType] ?? String(rawType)

    if (type === 'LOCATION') {
      const location = criterion.location as Record<string, unknown>
      const geoConstant = (location?.geoTargetConstant ?? location?.geo_target_constant) as string
      const code = geoReverse[geoConstant] ?? geoConstant
      const t = ensure(campaignId)
      t.geo.push(code)
      // Capture bid modifier for location bid adjustments
      const bidMod = criterion?.bid_modifier ?? criterion?.bidModifier
      if (bidMod !== undefined && bidMod !== null) {
        const bidAdjustment = Number(bidMod) - 1.0
        if (Math.abs(bidAdjustment) >= 1e-9) {
          t.geoBidAdjustments[code] = Math.round(bidAdjustment * 1e10) / 1e10
        }
      }
    } else if (type === 'LANGUAGE') {
      const language = criterion.language as Record<string, unknown>
      const langConstant = (language?.languageConstant ?? language?.language_constant) as string
      const code = langReverse[langConstant] ?? langConstant
      ensure(campaignId).languages.push(code)
    }
  }

  for (const row of scheduleRows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const adSchedule = (criterion.ad_schedule ?? criterion.adSchedule) as Record<string, unknown>
    if (!adSchedule) continue

    const campaignId = str(campaign?.id)
    const rawDay = (adSchedule.day_of_week ?? adSchedule.dayOfWeek) as number | string
    const day = DAY_OF_WEEK_MAP[rawDay]
    const startHour = Number(adSchedule.start_hour ?? adSchedule.startHour ?? 0)
    const endHour = Number(adSchedule.end_hour ?? adSchedule.endHour ?? 24)

    // Check if this schedule entry has a bid modifier
    const bidMod = criterion?.bid_modifier ?? criterion?.bidModifier
    const bidModNum = bidMod !== undefined && bidMod !== null ? Number(bidMod) : 1.0
    const bidAdjustment = bidModNum - 1.0
    const hasBidAdjustment = Math.abs(bidAdjustment) >= 1e-9

    const t = ensure(campaignId)

    if (hasBidAdjustment && day) {
      // Schedule with bid adjustment → schedule-bid rule (separate from basic schedule)
      t.scheduleBids.push({
        day,
        startHour,
        endHour,
        bidAdjustment: Math.round(bidAdjustment * 1e10) / 1e10,
      })
    } else {
      // Basic schedule (no bid adjustment)
      if (!t.schedule) {
        t.schedule = { days: [] }
      }
      if (day) {
        t.schedule.days.push(day)
      }
      if (startHour !== 0 || endHour !== 24) {
        t.schedule.startHour = startHour
        t.schedule.endHour = endHour
      }
    }
  }

  // Sort geo, language, and days for deterministic output
  for (const targeting of result.values()) {
    targeting.geo.sort()
    targeting.languages.sort()
    if (targeting.schedule) {
      targeting.schedule.days = sortDays(targeting.schedule.days)
    }
  }

  return result
}

/**
 * Merge targeting data into campaign Resources, adding `targeting: { rules: [...] }` property.
 */
function mergeTargetingIntoCampaigns(
  campaigns: Resource[],
  targetingMap: Map<string, CampaignTargeting>,
): Resource[] {
  return campaigns.map(c => {
    if (c.kind !== 'campaign' || !c.platformId) return c

    const targeting = targetingMap.get(c.platformId)
    if (!targeting) return c

    const rules: Array<Record<string, unknown>> = []
    if (targeting.geo.length > 0) {
      const geoRule: Record<string, unknown> = { type: 'geo', countries: targeting.geo }
      if (Object.keys(targeting.geoBidAdjustments).length > 0) {
        geoRule.bidAdjustments = targeting.geoBidAdjustments
      }
      rules.push(geoRule)
    }
    if (targeting.languages.length > 0) {
      rules.push({ type: 'language', languages: targeting.languages })
    }
    if (targeting.schedule && (targeting.schedule.days.length > 0 || targeting.schedule.startHour !== undefined)) {
      const scheduleRule: Record<string, unknown> = { type: 'schedule' }
      if (targeting.schedule.days.length > 0) {
        scheduleRule.days = targeting.schedule.days
      }
      if (targeting.schedule.startHour !== undefined) {
        scheduleRule.startHour = targeting.schedule.startHour
      }
      if (targeting.schedule.endHour !== undefined) {
        scheduleRule.endHour = targeting.schedule.endHour
      }
      rules.push(scheduleRule)
    }
    // Schedule bid adjustments (separate from basic schedule)
    for (const sb of targeting.scheduleBids) {
      rules.push({
        type: 'schedule-bid',
        day: sb.day,
        startHour: sb.startHour,
        endHour: sb.endHour,
        bidAdjustment: sb.bidAdjustment,
      })
    }

    if (rules.length === 0) return c

    return {
      ...c,
      properties: {
        ...c.properties,
        targeting: { rules },
      },
    }
  })
}

// ─── Device Bid Modifiers ────────────────────────────────────

export type DeviceBidModifier = { device: 'mobile' | 'desktop' | 'tablet'; bidAdjustment: number }

const DEVICE_TYPE_MAP: Record<number | string, 'mobile' | 'desktop' | 'tablet'> = {
  2: 'mobile', 3: 'desktop', 4: 'tablet',
  'MOBILE': 'mobile', 'DESKTOP': 'desktop', 'TABLET': 'tablet',
}

const DEVICE_QUERY = `
SELECT
  campaign.id,
  campaign_criterion.device.type,
  campaign_criterion.bid_modifier
FROM campaign_criterion
WHERE campaign_criterion.type = 'DEVICE'
  AND campaign.status != 'REMOVED'
`.trim()

export async function fetchDeviceBidModifiers(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Map<string, DeviceBidModifier[]>> {
  let query = DEVICE_QUERY
  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }

  const rows = await client.query(query)
  const result = new Map<string, DeviceBidModifier[]>()

  for (const row of rows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)

    const deviceObj = criterion?.device as Record<string, unknown> | undefined
    const rawType = deviceObj?.type as number | string
    const device = DEVICE_TYPE_MAP[rawType]
    if (!device) continue

    const bidModifier = Number(criterion?.bid_modifier ?? criterion?.bidModifier ?? 1.0)
    const bidAdjustment = bidModifier - 1.0

    // Skip no-op modifiers
    if (Math.abs(bidAdjustment) < 1e-9) continue

    if (!result.has(campaignId)) {
      result.set(campaignId, [])
    }
    result.get(campaignId)!.push({ device, bidAdjustment })
  }

  return result
}

/**
 * Merge device bid modifiers into campaign Resources as targeting rules.
 */
function mergeDevicesIntoCampaigns(
  campaigns: Resource[],
  deviceMap: Map<string, DeviceBidModifier[]>,
): Resource[] {
  return campaigns.map(c => {
    if (c.kind !== 'campaign' || !c.platformId) return c

    const devices = deviceMap.get(c.platformId)
    if (!devices || devices.length === 0) return c

    const existingTargeting = c.properties.targeting as { rules: Array<Record<string, unknown>> } | undefined
    const existingRules = existingTargeting?.rules ?? []
    const deviceRules = devices.map(d => ({ type: 'device', device: d.device, bidAdjustment: d.bidAdjustment }))

    return {
      ...c,
      properties: {
        ...c.properties,
        targeting: { rules: [...existingRules, ...deviceRules] },
      },
    }
  })
}

/**
 * Merge demographic targeting data into campaign Resources as targeting rules.
 */
function mergeDemographicsIntoCampaigns(
  campaigns: Resource[],
  demographicMap: Map<string, { ageRanges: string[]; genders: string[]; incomes: string[]; parentalStatuses: string[] }>,
): Resource[] {
  return campaigns.map(c => {
    if (c.kind !== 'campaign' || !c.platformId) return c

    const demo = demographicMap.get(c.platformId)
    if (!demo) return c

    // Only create a rule if there are actual demographic restrictions
    const hasData = demo.ageRanges.length > 0 || demo.genders.length > 0 || demo.incomes.length > 0 || demo.parentalStatuses.length > 0
    if (!hasData) return c

    const demoRule: Record<string, unknown> = { type: 'demographic' }
    if (demo.ageRanges.length > 0) demoRule.ageRanges = demo.ageRanges
    if (demo.genders.length > 0) demoRule.genders = demo.genders
    if (demo.incomes.length > 0) demoRule.incomes = demo.incomes
    if (demo.parentalStatuses.length > 0) demoRule.parentalStatuses = demo.parentalStatuses

    const existingTargeting = c.properties.targeting as { rules: Array<Record<string, unknown>> } | undefined
    const existingRules = existingTargeting?.rules ?? []

    return {
      ...c,
      properties: {
        ...c.properties,
        targeting: { rules: [...existingRules, demoRule] },
      },
    }
  })
}

/**
 * Merge audience targeting data into ad group Resources as targeting rules.
 * Audiences operate at the ad group level, not campaign level.
 */
function mergeAudiencesIntoAdGroups(
  adGroups: Resource[],
  audienceMap: Map<string, AudienceTarget>,
): Resource[] {
  return adGroups.map(ag => {
    if (ag.kind !== 'adGroup' || !ag.platformId) return ag

    const audience = audienceMap.get(ag.platformId)
    if (!audience || audience.audiences.length === 0) return ag

    const existingTargeting = ag.properties.targeting as { rules: Array<Record<string, unknown>> } | undefined
    const existingRules = existingTargeting?.rules ?? []

    return {
      ...ag,
      properties: {
        ...ag.properties,
        targeting: { rules: [...existingRules, audience] },
      },
    }
  })
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

  // Separate PMax campaigns (use asset groups) from Search/Display (use ad groups)
  const pmaxCampaignIds = campaigns
    .filter(c => c.properties.channelType === 'performance-max')
    .map(c => c.platformId!)
    .filter(Boolean)
  const nonPmaxCampaignIds = campaignIds.filter(id => !pmaxCampaignIds.includes(id))

  // Step 2: Ad groups (scoped to non-PMax campaigns)
  const adGroups = nonPmaxCampaignIds.length > 0
    ? await fetchAdGroups(client, nonPmaxCampaignIds)
    : []
  const adGroupIds = adGroups.map(ag => ag.platformId!).filter(Boolean)

  // Step 3: Keywords + ads + display ads + asset groups — can run in parallel
  const [keywords, ads, displayAds, assetGroupData] = await Promise.all([
    adGroupIds.length > 0 ? fetchKeywords(client, adGroupIds) : Promise.resolve([]),
    adGroupIds.length > 0 ? fetchAds(client, adGroupIds) : Promise.resolve([]),
    adGroupIds.length > 0 ? fetchDisplayAds(client, adGroupIds) : Promise.resolve([]),
    pmaxCampaignIds.length > 0 ? fetchAssetGroups(client, pmaxCampaignIds) : Promise.resolve({ groups: [], assets: [] }),
  ])

  // Normalize PMax asset groups into resources
  const assetGroupResources: Resource[] = []
  if (assetGroupData.groups.length > 0) {
    // Group asset groups by campaign path for correct path construction
    const groupsByCampaign = new Map<string, GoogleAdsRow[]>()
    for (const row of assetGroupData.groups) {
      const campaignObj = row.campaign as Record<string, unknown> | undefined
      const campaignName = str(campaignObj?.name)
      const campaignPath = slugify(campaignName)
      const existing = groupsByCampaign.get(campaignPath) ?? []
      existing.push(row)
      groupsByCampaign.set(campaignPath, existing)
    }
    for (const [campaignPath, rows] of groupsByCampaign) {
      assetGroupResources.push(...normalizeAssetGroupData(rows, assetGroupData.assets, campaignPath))
    }
  }

  // Step 4: Extensions + negative keywords + targeting + devices + demographics + audiences — can run in parallel
  const [extensions, negatives, targetingMap, deviceMap, demographicMap, audienceMap] = await Promise.all([
    fetchExtensions(client, campaignIds),
    fetchNegativeKeywords(client, campaignIds),
    fetchCampaignTargeting(client, campaignIds),
    fetchDeviceBidModifiers(client, campaignIds),
    fetchDemographicTargeting(client, campaignIds),
    fetchAudienceTargeting(client, campaignIds),
  ])

  // Merge targeting data into campaign resources (order matters: base → devices → demographics)
  const campaignsWithTargeting = mergeTargetingIntoCampaigns(campaigns, targetingMap)
  const campaignsWithDevices = mergeDevicesIntoCampaigns(campaignsWithTargeting, deviceMap)
  const campaignsWithDemographics = mergeDemographicsIntoCampaigns(campaignsWithDevices, demographicMap)

  // Merge audience targeting into ad group resources
  const adGroupsWithAudiences = mergeAudiencesIntoAdGroups(adGroups, audienceMap)

  return [...campaignsWithDemographics, ...adGroupsWithAudiences, ...assetGroupResources, ...keywords, ...ads, ...displayAds, ...extensions, ...negatives]
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

    // Separate PMax from non-PMax campaigns
    const pmaxIds = knownCampaigns
      .filter(c => c.properties.channelType === 'performance-max')
      .map(c => c.platformId!)
      .filter(Boolean)
    const nonPmaxIds = knownCampaignIds.filter(id => !pmaxIds.includes(id))

    const adGroups = nonPmaxIds.length > 0
      ? await fetchAdGroups(client, nonPmaxIds)
      : []
    const adGroupIds = adGroups.map(ag => ag.platformId!).filter(Boolean)

    const [keywords, ads, displayAds, assetGroupData] = await Promise.all([
      adGroupIds.length > 0 ? fetchKeywords(client, adGroupIds) : Promise.resolve([]),
      adGroupIds.length > 0 ? fetchAds(client, adGroupIds) : Promise.resolve([]),
      adGroupIds.length > 0 ? fetchDisplayAds(client, adGroupIds) : Promise.resolve([]),
      pmaxIds.length > 0 ? fetchAssetGroups(client, pmaxIds) : Promise.resolve({ groups: [], assets: [] }),
    ])

    // Normalize PMax asset groups
    const assetGroupResources: Resource[] = []
    if (assetGroupData.groups.length > 0) {
      const groupsByCampaign = new Map<string, GoogleAdsRow[]>()
      for (const row of assetGroupData.groups) {
        const campaignObj = row.campaign as Record<string, unknown> | undefined
        const campaignName = str(campaignObj?.name)
        const campaignPath = slugify(campaignName)
        const existing = groupsByCampaign.get(campaignPath) ?? []
        existing.push(row)
        groupsByCampaign.set(campaignPath, existing)
      }
      for (const [cPath, rows] of groupsByCampaign) {
        assetGroupResources.push(...normalizeAssetGroupData(rows, assetGroupData.assets, cPath))
      }
    }

    const [extensions, negatives, targetingMap, deviceMap, demographicMap, audienceMap] = await Promise.all([
      fetchExtensions(client, knownCampaignIds),
      fetchNegativeKeywords(client, knownCampaignIds),
      fetchCampaignTargeting(client, knownCampaignIds),
      fetchDeviceBidModifiers(client, knownCampaignIds),
      fetchDemographicTargeting(client, knownCampaignIds),
      fetchAudienceTargeting(client, knownCampaignIds),
    ])

    const campaignsWithTargeting = mergeTargetingIntoCampaigns(knownCampaigns, targetingMap)
    const campaignsWithDevices = mergeDevicesIntoCampaigns(campaignsWithTargeting, deviceMap)
    const campaignsWithDemographics = mergeDemographicsIntoCampaigns(campaignsWithDevices, demographicMap)
    const adGroupsWithAudiences = mergeAudiencesIntoAdGroups(adGroups, audienceMap)

    return [...campaignsWithDemographics, ...adGroupsWithAudiences, ...assetGroupResources, ...keywords, ...ads, ...displayAds, ...extensions, ...negatives]
  }

  // Fallback: fetch everything
  return fetchAllState(client, { includePaused: true })
}
