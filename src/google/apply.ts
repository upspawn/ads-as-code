import type { Change, Changeset, Resource, ResourceKind, ApplyResult } from '../core/types.ts'
import type { GoogleAdsClient, MutateOperation, MutateResult } from './types.ts'
import type { Cache } from '../core/cache.ts'
import { LANGUAGE_CRITERIA, GEO_TARGETS } from './constants.ts'

export type { ApplyResult }

// ─── Constants ──────────────────────────────────────────────

/** Dependency order for resource creation (parent → child) */
const CREATION_ORDER: ResourceKind[] = [
  'campaign',
  'adGroup',
  'keyword',
  'ad',
  'sitelink',
  'callout',
  'structuredSnippet',
  'callExtension',
  'negative',
]

// ─── Match Type Conversion ──────────────────────────────────

const MATCH_TYPE_TO_ENUM: Record<string, number> = {
  'EXACT': 2,
  'PHRASE': 3,
  'BROAD': 4,
}

const DEVICE_TYPE_ENUM: Record<string, number> = {
  'mobile': 2,
  'desktop': 3,
  'tablet': 4,
}

// SDK demographic values → Google Ads API enum strings
const AGE_RANGE_TO_ENUM: Record<string, string> = {
  '18-24': 'AGE_RANGE_18_24',
  '25-34': 'AGE_RANGE_25_34',
  '35-44': 'AGE_RANGE_35_44',
  '45-54': 'AGE_RANGE_45_54',
  '55-64': 'AGE_RANGE_55_64',
  '65+': 'AGE_RANGE_65_UP',
  'undetermined': 'AGE_RANGE_UNDETERMINED',
}

const GENDER_TO_ENUM: Record<string, string> = {
  'male': 'MALE',
  'female': 'FEMALE',
  'undetermined': 'UNDETERMINED',
}

const INCOME_TO_ENUM: Record<string, string> = {
  'lower-50%': 'INCOME_RANGE_0_50',
  '41-50%': 'INCOME_RANGE_50_60',
  '31-40%': 'INCOME_RANGE_60_70',
  '21-30%': 'INCOME_RANGE_70_80',
  '11-20%': 'INCOME_RANGE_80_90',
  'top-10%': 'INCOME_RANGE_90_100',
  'undetermined': 'INCOME_RANGE_UNDETERMINED',
}

const PARENTAL_TO_ENUM: Record<string, string> = {
  'parent': 'PARENT',
  'not-parent': 'NOT_A_PARENT',
  'undetermined': 'UNDETERMINED',
}

const SCHEDULE_DAY_TO_ENUM: Record<string, number> = {
  'mon': 2, 'tue': 3, 'wed': 4, 'thu': 5, 'fri': 6, 'sat': 7, 'sun': 8,
}

function matchTypeToEnum(matchType: unknown): number {
  if (typeof matchType === 'number') return matchType
  return MATCH_TYPE_TO_ENUM[String(matchType)] ?? 4 // default BROAD
}

// ─── Micros Conversion ──────────────────────────────────────

function toMicros(amount: number): number {
  return Math.round(amount * 1_000_000)
}

function dailyBudgetMicros(budget: { amount: number; period: string }): number {
  if (budget.period === 'monthly') {
    return toMicros(budget.amount / 30.4)
  }
  return toMicros(budget.amount)
}

// ─── Path → Platform Resource Helpers ───────────────────────

function extractCampaignPath(path: string): string {
  return path.split('/')[0]!
}

function extractAdGroupPath(path: string): string {
  const parts = path.split('/')
  return `${parts[0]}/${parts[1]}`
}

/** Resolve a platform ID to a full resource name. If it's already a full path, use as-is. */
function resolveResourceName(customerId: string, type: string, platformId: string): string {
  if (platformId.startsWith('customers/')) return platformId
  return `customers/${customerId}/${type}/${platformId}`
}

// ─── Mutation Builders ──────────────────────────────────────
// google-ads-api gRPC expects:
//   entity: snake_case resource name (e.g. 'campaign_budget')
//   op: 'create' | 'update' | 'remove'
//   resource: flat object with snake_case fields (for create/update)
//             or resource name string (for remove)

function buildCampaignBudgetCreate(
  customerId: string,
  tempBudgetId: string,
  budget: { amount: number; period: string },
): MutateOperation {
  return {
    operation: 'campaign_budget',
    op: 'create',
    resource: {
      resource_name: `customers/${customerId}/campaignBudgets/${tempBudgetId}`,
      amount_micros: String(dailyBudgetMicros(budget)),
      delivery_method: 2, // STANDARD
      explicitly_shared: false,
    },
  }
}

function buildCampaignCreate(
  customerId: string,
  tempCampaignId: string,
  tempBudgetId: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  // Channel type: 2=SEARCH, 3=DISPLAY
  const channelType = (props.channelType as string) === 'display' ? 3 : 2

  const campaign: Record<string, unknown> = {
    resource_name: `customers/${customerId}/campaigns/${tempCampaignId}`,
    name: props.name,
    status: (props.status as string) === 'enabled' ? 2 : 3, // 2=ENABLED, 3=PAUSED
    advertising_channel_type: channelType,
    campaign_budget: `customers/${customerId}/campaignBudgets/${tempBudgetId}`,
  }

  // Bidding strategy
  const bidding = props.bidding as Record<string, unknown> | undefined
  if (bidding) {
    switch (bidding.type) {
      case 'maximize-conversions':
        campaign.maximize_conversions = {}
        break
      case 'maximize-clicks':
        campaign.target_spend = bidding.maxCpc
          ? { cpc_bid_ceiling_micros: String(toMicros(bidding.maxCpc as number)) }
          : {}
        break
      case 'manual-cpc':
        campaign.manual_cpc = { enhanced_cpc_enabled: bidding.enhancedCpc ?? false }
        break
      case 'manual-cpm':
        campaign.manual_cpm = {}
        break
      case 'target-cpm':
        campaign.target_cpm = {}
        break
      case 'target-cpa':
        campaign.target_cpa = { target_cpa_micros: String(toMicros(bidding.targetCpa as number)) }
        break
      case 'target-roas':
        campaign.target_roas = {
          target_roas: bidding.targetRoas as number, // raw double, NOT micros
        }
        break
      case 'target-impression-share': {
        const locationMap: Record<string, number> = { 'anywhere': 2, 'top': 3, 'absolute-top': 4 }
        campaign.target_impression_share = {
          location: locationMap[bidding.location as string] ?? 2,
          location_fraction_micros: String(Math.round((bidding.targetPercent as number) * 10000)),
          ...(bidding.maxCpc ? { cpc_bid_ceiling_micros: String(toMicros(bidding.maxCpc as number)) } : {}),
        }
        break
      }
      case 'maximize-conversion-value': {
        const roas = bidding.targetRoas as number | undefined
        campaign.maximize_conversion_value = roas
          ? { target_roas: roas } // raw double, NOT micros
          : {}
        break
      }
    }
  }

  // Network settings
  const networkSettings = props.networkSettings as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean } | undefined
  if (networkSettings) {
    campaign.network_settings = {
      target_google_search: networkSettings.searchNetwork,
      target_search_network: networkSettings.searchPartners,
      target_content_network: networkSettings.displayNetwork,
    }
  }

  // Dates
  if (props.startDate) campaign.start_date = props.startDate as string
  if (props.endDate) campaign.end_date = props.endDate as string
  // Tracking
  if (props.trackingTemplate) campaign.tracking_url_template = props.trackingTemplate as string
  if (props.finalUrlSuffix) campaign.final_url_suffix = props.finalUrlSuffix as string
  const customParams = props.customParameters as Record<string, string> | undefined
  if (customParams) {
    campaign.url_custom_parameters = Object.entries(customParams).map(([key, value]) => ({ key, value }))
  }

  return {
    operation: 'campaign',
    op: 'create',
    resource: campaign,
  }
}

function buildTargetingOperations(
  _customerId: string,
  campaignResourceName: string,
  targeting: { rules: Array<Record<string, unknown>> },
): MutateOperation[] {
  const ops: MutateOperation[] = []

  for (const rule of targeting.rules) {
    if (rule.type === 'language') {
      const languages = rule.languages as string[]
      for (const lang of languages) {
        const criterionId = LANGUAGE_CRITERIA[lang]
        if (criterionId) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              language: {
                language_constant: `languageConstants/${criterionId}`,
              },
            },
          })
        }
      }
    }

    if (rule.type === 'geo') {
      const countries = rule.countries as string[]
      const bidAdjustments = rule.bidAdjustments as Record<string, number> | undefined
      for (const country of countries) {
        const geoTargetId = GEO_TARGETS[country]
        if (geoTargetId) {
          const bidAdj = bidAdjustments?.[country]
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              location: {
                geo_target_constant: `geoTargetConstants/${geoTargetId}`,
              },
              ...(bidAdj !== undefined ? { bid_modifier: 1.0 + bidAdj } : {}),
            },
          })
        }
      }
    }

    if (rule.type === 'device') {
      const deviceType = DEVICE_TYPE_ENUM[rule.device as string]
      if (deviceType) {
        const bidAdjustment = rule.bidAdjustment as number
        ops.push({
          operation: 'campaign_criterion',
          op: 'create',
          resource: {
            campaign: campaignResourceName,
            device: { type: deviceType },
            bid_modifier: 1.0 + bidAdjustment, // SDK format → API format
          },
        })
      }
    }

    if (rule.type === 'demographic') {
      const ageRanges = rule.ageRanges as string[] | undefined
      const genders = rule.genders as string[] | undefined
      const incomes = rule.incomes as string[] | undefined
      const parentalStatuses = rule.parentalStatuses as string[] | undefined

      if (ageRanges) {
        for (const age of ageRanges) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              age_range: { type: AGE_RANGE_TO_ENUM[age] ?? age },
            },
          })
        }
      }
      if (genders) {
        for (const gender of genders) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              gender: { type: GENDER_TO_ENUM[gender] ?? gender },
            },
          })
        }
      }
      if (incomes) {
        for (const income of incomes) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              income_range: { type: INCOME_TO_ENUM[income] ?? income },
            },
          })
        }
      }
      if (parentalStatuses) {
        for (const status of parentalStatuses) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              parental_status: { type: PARENTAL_TO_ENUM[status] ?? status },
            },
          })
        }
      }
    }

    if (rule.type === 'schedule-bid') {
      const dayEnum = SCHEDULE_DAY_TO_ENUM[rule.day as string]
      if (dayEnum !== undefined) {
        ops.push({
          operation: 'campaign_criterion',
          op: 'create',
          resource: {
            campaign: campaignResourceName,
            ad_schedule: {
              day_of_week: dayEnum,
              start_hour: rule.startHour as number,
              start_minute: 'ZERO',
              end_hour: rule.endHour as number,
              end_minute: 'ZERO',
            },
            bid_modifier: 1.0 + (rule.bidAdjustment as number),
          },
        })
      }
    }
  }

  return ops
}

function buildAdGroupCreate(
  customerId: string,
  tempId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  // ad group name is the second segment of the path
  const parts = resource.path.split('/')
  const adGroupName = parts[1] ?? resource.path

  // Ad group type: 2=SEARCH_STANDARD, 7=DISPLAY_STANDARD
  const adGroupType = (props.adGroupType as string) === 'display' ? 7 : 2

  return {
    operation: 'ad_group',
    op: 'create',
    resource: {
      resource_name: `customers/${customerId}/adGroups/${tempId}`,
      campaign: campaignResourceName,
      name: adGroupName,
      status: (props.status as string) === 'paused' ? 3 : 2, // 3=PAUSED, 2=ENABLED
      type: adGroupType,
    },
  }
}

function buildKeywordCreate(
  _customerId: string,
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  const kwStatus = (props.status as string) === 'paused' ? 3 : 2
  const bid = props.bid as number | undefined
  const finalUrl = props.finalUrl as string | undefined

  return {
    operation: 'ad_group_criterion',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status: kwStatus,
      keyword: {
        text: props.text,
        match_type: matchTypeToEnum(props.matchType),
      },
      ...(bid !== undefined ? { cpc_bid_micros: String(toMicros(bid)) } : {}),
      ...(finalUrl ? { final_urls: [finalUrl] } : {}),
    },
  }
}

function buildNegativeCreate(
  _customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'campaign_criterion',
    op: 'create',
    resource: {
      campaign: campaignResourceName,
      negative: true,
      keyword: {
        text: props.text,
        match_type: matchTypeToEnum(props.matchType),
      },
    },
  }
}

function buildAdCreate(
  _customerId: string,
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties

  // Dispatch to RDA builder if this is a responsive display ad
  if (props.adType === 'responsive-display') {
    return buildResponsiveDisplayAdCreate(adGroupResourceName, resource)
  }

  // Build headline assets with optional pinning
  const pinnedHL = props.pinnedHeadlines as Array<{ text: string; position: number }> | undefined
  const pinnedHLMap = new Map(pinnedHL?.map(p => [p.text, p.position]) ?? [])
  const headlines = (props.headlines as string[]).map(text => ({
    text,
    pinned_field: pinnedHLMap.get(text) ?? 0,
  }))

  // Build description assets with optional pinning
  const pinnedDesc = props.pinnedDescriptions as Array<{ text: string; position: number }> | undefined
  const pinnedDescMap = new Map(pinnedDesc?.map(p => [p.text, p.position + 3]) ?? [])
  const descriptions = (props.descriptions as string[]).map(text => ({
    text,
    pinned_field: pinnedDescMap.get(text) ?? 0,
  }))

  const path1 = props.path1 as string | undefined
  const path2 = props.path2 as string | undefined
  const adStatus = (props.status as string) === 'paused' ? 3 : 2

  return {
    operation: 'ad_group_ad',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status: adStatus,
      ad: {
        responsive_search_ad: {
          headlines,
          descriptions,
          ...(path1 ? { path1 } : {}),
          ...(path2 ? { path2 } : {}),
        },
        final_urls: [props.finalUrl],
      },
    },
  }
}

function buildResponsiveDisplayAdCreate(
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  const adStatus = (props.status as string) === 'paused' ? 3 : 2

  const headlines = (props.headlines as string[]).map(text => ({ text }))
  const descriptions = (props.descriptions as string[]).map(text => ({ text }))
  const longHeadline = { text: props.longHeadline as string }

  const mainColor = props.mainColor as string | undefined
  const accentColor = props.accentColor as string | undefined
  const callToAction = props.callToAction as string | undefined

  // Image asset references — stored as resource name strings in properties
  const marketingImages = props.marketingImages as unknown[] | undefined
  const squareMarketingImages = props.squareMarketingImages as unknown[] | undefined

  return {
    operation: 'ad_group_ad',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status: adStatus,
      ad: {
        responsive_display_ad: {
          headlines,
          long_headline: longHeadline,
          descriptions,
          business_name: props.businessName as string,
          marketing_images: marketingImages ?? [],
          square_marketing_images: squareMarketingImages ?? [],
          ...(mainColor ? { main_color: mainColor } : {}),
          ...(accentColor ? { accent_color: accentColor } : {}),
          ...(callToAction ? { call_to_action_text: callToAction } : {}),
        },
        final_urls: [props.finalUrl],
      },
    },
  }
}

function buildSitelinkCreate(
  customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation[] {
  const props = resource.properties
  const tempAssetId = `-${Date.now()}`
  return [
    {
      operation: 'asset',
      op: 'create',
      resource: {
        resource_name: `customers/${customerId}/assets/${tempAssetId}`,
        sitelink_asset: {
          link_text: props.text,
          description1: props.description1,
          description2: props.description2,
        },
        final_urls: [props.url],
      },
    },
    {
      operation: 'campaign_asset',
      op: 'create',
      resource: {
        campaign: campaignResourceName,
        asset: `customers/${customerId}/assets/${tempAssetId}`,
        field_type: 'SITELINK',
      },
    },
  ]
}

function buildCalloutCreate(
  customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation[] {
  const props = resource.properties
  const tempAssetId = `-${Date.now() + 1}`
  return [
    {
      operation: 'asset',
      op: 'create',
      resource: {
        resource_name: `customers/${customerId}/assets/${tempAssetId}`,
        callout_asset: {
          callout_text: props.text,
        },
      },
    },
    {
      operation: 'campaign_asset',
      op: 'create',
      resource: {
        campaign: campaignResourceName,
        asset: `customers/${customerId}/assets/${tempAssetId}`,
        field_type: 'CALLOUT',
      },
    },
  ]
}

function buildStructuredSnippetCreate(
  customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation[] {
  const props = resource.properties
  const tempAssetId = `-${Date.now() + 2}`
  return [
    {
      operation: 'asset',
      op: 'create',
      resource: {
        resource_name: `customers/${customerId}/assets/${tempAssetId}`,
        structured_snippet_asset: {
          header: props.header,
          values: props.values,
        },
      },
    },
    {
      operation: 'campaign_asset',
      op: 'create',
      resource: {
        campaign: campaignResourceName,
        asset: `customers/${customerId}/assets/${tempAssetId}`,
        field_type: 'STRUCTURED_SNIPPET',
      },
    },
  ]
}

function buildCallExtensionCreate(
  customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation[] {
  const props = resource.properties
  const tempAssetId = `-${Date.now() + 3}`
  return [
    {
      operation: 'asset',
      op: 'create',
      resource: {
        resource_name: `customers/${customerId}/assets/${tempAssetId}`,
        call_asset: {
          country_code: props.countryCode,
          phone_number: props.phoneNumber,
        },
      },
    },
    {
      operation: 'campaign_asset',
      op: 'create',
      resource: {
        campaign: campaignResourceName,
        asset: `customers/${customerId}/assets/${tempAssetId}`,
        field_type: 'CALL',
      },
    },
  ]
}

// ─── Delete Builders ────────────────────────────────────────

function buildDeleteOperation(
  customerId: string,
  resource: Resource,
): MutateOperation | null {
  if (!resource.platformId || typeof resource.platformId !== 'string') {
    if (process.env['ADS_DEBUG']) console.log('[DEBUG delete skip]', resource.kind, resource.path, 'platformId:', resource.platformId, typeof resource.platformId)
    return null
  }

  const id = resource.platformId

  switch (resource.kind) {
    case 'campaign':
      return {
        operation: 'campaign',
        op: 'remove',
        resource: { resource_name: resolveResourceName(customerId, 'campaigns', id) },
      }
    case 'adGroup':
      return {
        operation: 'ad_group',
        op: 'remove',
        resource: { resource_name: resolveResourceName(customerId, 'adGroups', id) },
      }
    case 'keyword':
      return {
        operation: 'ad_group_criterion',
        op: 'remove',
        resource: { resource_name: resolveResourceName(customerId, 'adGroupCriteria', id) },
      }
    case 'ad':
      return {
        operation: 'ad_group_ad',
        op: 'remove',
        resource: { resource_name: resolveResourceName(customerId, 'adGroupAds', id) },
      }
    case 'negative':
      return {
        operation: 'campaign_criterion',
        op: 'remove',
        resource: { resource_name: resolveResourceName(customerId, 'campaignCriteria', id) },
      }
    default:
      return null
  }
}

// ─── Update Builders ────────────────────────────────────────

function buildUpdateOperations(
  customerId: string,
  change: Change & { op: 'update' },
): MutateOperation[] {
  const resource = change.resource
  if (!resource.platformId || typeof resource.platformId !== 'string') return []

  const campaignId = resource.platformId.includes('/campaigns/')
    ? resource.platformId
    : `customers/${customerId}/campaigns/${resource.platformId}`

  switch (resource.kind) {
    case 'campaign': {
      const ops: MutateOperation[] = []

      // Campaign field updates (status, name)
      const campaignFields: Record<string, unknown> = {}
      const campaignMask: string[] = []
      for (const c of change.changes) {
        if (c.field === 'status') {
          campaignFields.status = (c.to as string) === 'enabled' ? 2 : 3
          campaignMask.push('status')
        }
        if (c.field === 'name') {
          campaignFields.name = c.to
          campaignMask.push('name')
        }
        if (c.field === 'networkSettings') {
          const ns = c.to as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean }
          campaignFields.network_settings = {
            target_google_search: ns.searchNetwork,
            target_search_network: ns.searchPartners,
            target_content_network: ns.displayNetwork,
          }
          campaignMask.push('network_settings')
        }
        if (c.field === 'startDate') {
          campaignFields.start_date = c.to as string
          campaignMask.push('start_date')
        }
        if (c.field === 'endDate') {
          campaignFields.end_date = c.to as string
          campaignMask.push('end_date')
        }
        if (c.field === 'trackingTemplate') {
          campaignFields.tracking_url_template = c.to as string
          campaignMask.push('tracking_url_template')
        }
        if (c.field === 'finalUrlSuffix') {
          campaignFields.final_url_suffix = c.to as string
          campaignMask.push('final_url_suffix')
        }
        if (c.field === 'customParameters') {
          const params = c.to as Record<string, string>
          campaignFields.url_custom_parameters = Object.entries(params).map(([key, value]) => ({ key, value }))
          campaignMask.push('url_custom_parameters')
        }
        if (c.field === 'bidding') {
          const newBidding = c.to as Record<string, unknown>
          switch (newBidding.type) {
            case 'maximize-conversions':
              campaignFields.maximize_conversions = {}
              campaignMask.push('maximize_conversions')
              break
            case 'maximize-clicks':
              campaignFields.target_spend = newBidding.maxCpc
                ? { cpc_bid_ceiling_micros: String(toMicros(newBidding.maxCpc as number)) }
                : {}
              campaignMask.push('target_spend')
              break
            case 'manual-cpc':
              campaignFields.manual_cpc = { enhanced_cpc_enabled: newBidding.enhancedCpc ?? false }
              campaignMask.push('manual_cpc')
              break
            case 'manual-cpm':
              campaignFields.manual_cpm = {}
              campaignMask.push('manual_cpm')
              break
            case 'target-cpm':
              campaignFields.target_cpm = {}
              campaignMask.push('target_cpm')
              break
            case 'target-cpa':
              campaignFields.target_cpa = { target_cpa_micros: String(toMicros(newBidding.targetCpa as number)) }
              campaignMask.push('target_cpa')
              break
            case 'target-roas':
              campaignFields.target_roas = { target_roas: newBidding.targetRoas as number }
              campaignMask.push('target_roas')
              break
            case 'target-impression-share': {
              const locationMap: Record<string, number> = { 'anywhere': 2, 'top': 3, 'absolute-top': 4 }
              campaignFields.target_impression_share = {
                location: locationMap[newBidding.location as string] ?? 2,
                location_fraction_micros: String(Math.round((newBidding.targetPercent as number) * 10000)),
                ...(newBidding.maxCpc ? { cpc_bid_ceiling_micros: String(toMicros(newBidding.maxCpc as number)) } : {}),
              }
              campaignMask.push('target_impression_share')
              break
            }
            case 'maximize-conversion-value': {
              const roas = newBidding.targetRoas as number | undefined
              campaignFields.maximize_conversion_value = roas ? { target_roas: roas } : {}
              campaignMask.push('maximize_conversion_value')
              break
            }
          }
        }
        if (c.field === 'targeting') {
          const newTargeting = c.to as { rules: Array<Record<string, unknown>> } | undefined
          if (newTargeting?.rules) {
            for (const rule of newTargeting.rules) {
              if (rule.type === 'device') {
                const deviceType = DEVICE_TYPE_ENUM[rule.device as string]
                if (deviceType) {
                  ops.push({
                    operation: 'campaign_criterion',
                    op: 'create',
                    resource: {
                      campaign: campaignId,
                      device: { type: deviceType },
                      bid_modifier: 1.0 + (rule.bidAdjustment as number),
                    },
                  })
                }
              }
            }
          }
        }
      }
      if (campaignMask.length > 0) {
        ops.push({
          operation: 'campaign',
          op: 'update',
          resource: { resource_name: campaignId, ...campaignFields },
          updateMask: campaignMask.join(','),
        })
      }

      // Budget update — separate campaign_budget resource
      const budgetChange = change.changes.find(c => c.field === 'budget')
      if (budgetChange) {
        const newBudget = budgetChange.to as { amount: number; period: string } | undefined
        if (newBudget) {
          // Get budget resource name from the budgetResourceName change (from=actual value)
          // or from the resource properties (if available from fetched state)
          const budgetResourceName = (resource.meta?.budgetResourceName as string) ?? undefined
          if (budgetResourceName && typeof budgetResourceName === 'string' && budgetResourceName.startsWith('customers/')) {
            ops.push({
              operation: 'campaign_budget',
              op: 'update',
              resource: {
                resource_name: budgetResourceName,
                amount_micros: String(dailyBudgetMicros(newBudget)),
              },
              updateMask: 'amount_micros',
            })
          }
        }
      }

      return ops
    }
    case 'adGroup': {
      const update: Record<string, unknown> = {
        resource_name: resolveResourceName(customerId, 'adGroups', resource.platformId),
      }
      const mask: string[] = []
      for (const c of change.changes) {
        if (c.field === 'status') {
          update.status = (c.to as string) === 'enabled' ? 2 : 3
          mask.push('status')
        }
      }
      if (mask.length === 0) return []
      return [{
        operation: 'ad_group',
        op: 'update',
        resource: update,
        updateMask: mask.join(','),
      }]
    }
    case 'keyword': {
      const kwResourceName = resolveResourceName(customerId, 'adGroupCriteria', resource.platformId)
      const kwFields: Record<string, unknown> = { resource_name: kwResourceName }
      const kwMask: string[] = []

      for (const c of change.changes) {
        if (c.field === 'status') {
          kwFields.status = (c.to as string) === 'paused' ? 3 : 2
          kwMask.push('status')
        }
        if (c.field === 'bid') {
          kwFields.cpc_bid_micros = c.to !== undefined ? String(toMicros(c.to as number)) : '0'
          kwMask.push('cpc_bid_micros')
        }
        if (c.field === 'finalUrl') {
          kwFields.final_urls = c.to ? [c.to as string] : []
          kwMask.push('final_urls')
        }
      }

      if (kwMask.length === 0) return []
      return [{
        operation: 'ad_group_criterion',
        op: 'update',
        resource: kwFields,
        updateMask: kwMask.join(','),
      }]
    }
    case 'ad': {
      // Ad resource name format: adGroupAds/{adGroupId}~{adId}
      const adResourceName = resolveResourceName(customerId, 'adGroupAds', resource.platformId)

      const adGroupAdFields: Record<string, unknown> = { resource_name: adResourceName }
      const adContentFields: Record<string, unknown> = {}
      const mask: string[] = []

      for (const c of change.changes) {
        if (c.field === 'status') {
          adGroupAdFields.status = (c.to as string) === 'paused' ? 3 : 2
          mask.push('status')
        }
        if (c.field === 'headlines') {
          adContentFields.responsive_search_ad = {
            ...(adContentFields.responsive_search_ad as Record<string, unknown> ?? {}),
            headlines: (c.to as string[]).map(text => ({ text, pinned_field: 0 })),
          }
          mask.push('ad.responsive_search_ad.headlines')
        }
        if (c.field === 'descriptions') {
          adContentFields.responsive_search_ad = {
            ...(adContentFields.responsive_search_ad as Record<string, unknown> ?? {}),
            descriptions: (c.to as string[]).map(text => ({ text, pinned_field: 0 })),
          }
          mask.push('ad.responsive_search_ad.descriptions')
        }
        if (c.field === 'finalUrl') {
          adContentFields.final_urls = [c.to as string]
          mask.push('ad.final_urls')
        }
        if (c.field === 'path1') {
          adContentFields.responsive_search_ad = {
            ...(adContentFields.responsive_search_ad as Record<string, unknown> ?? {}),
            path1: c.to as string,
          }
          mask.push('ad.responsive_search_ad.path1')
        }
        if (c.field === 'path2') {
          adContentFields.responsive_search_ad = {
            ...(adContentFields.responsive_search_ad as Record<string, unknown> ?? {}),
            path2: c.to as string,
          }
          mask.push('ad.responsive_search_ad.path2')
        }
      }

      if (mask.length === 0) return []

      // Nest ad content fields under `ad` if any were changed
      if (Object.keys(adContentFields).length > 0) {
        adGroupAdFields.ad = adContentFields
      }

      return [{
        operation: 'ad_group_ad',
        op: 'update',
        resource: adGroupAdFields,
        updateMask: mask.join(','),
      }]
    }
    default:
      return []
  }
}

// ─── Change → Mutations ────────────────────────────────────

/**
 * Convert a single Change into MutateOperation(s).
 * Returns an array because some changes require multiple operations
 * (e.g., campaign creates need a budget operation first).
 */
export function changeToMutations(
  change: Change,
  customerId: string,
  resourceMap: Map<string, string>,
): MutateOperation[] {
  switch (change.op) {
    case 'create':
      return buildCreateMutations(change.resource, customerId, resourceMap)
    case 'update':
      return buildUpdateMutations(change as Change & { op: 'update' }, customerId)
    case 'delete':
      return buildDeleteMutations(change.resource, customerId)
    default:
      return []
  }
}

function buildCreateMutations(
  resource: Resource,
  customerId: string,
  resourceMap: Map<string, string>,
): MutateOperation[] {
  const ops: MutateOperation[] = []

  switch (resource.kind) {
    case 'campaign': {
      const tempBudgetId = `-${Date.now()}`
      const tempCampaignId = `-${Date.now() + 1}`

      // Budget must be created first
      const budget = resource.properties.budget as { amount: number; period: string }
      ops.push(buildCampaignBudgetCreate(customerId, tempBudgetId, budget))
      ops.push(buildCampaignCreate(customerId, tempCampaignId, tempBudgetId, resource))

      // Targeting (language + geo)
      const targeting = resource.properties.targeting as { rules: Array<Record<string, unknown>> } | undefined
      if (targeting) {
        const campaignResourceName = `customers/${customerId}/campaigns/${tempCampaignId}`
        ops.push(...buildTargetingOperations(customerId, campaignResourceName, targeting))
      }
      break
    }

    case 'adGroup': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      const tempId = `-${Date.now()}`
      ops.push(buildAdGroupCreate(customerId, tempId, campaignResourceName, resource))
      break
    }

    case 'keyword': {
      const adGroupPath = extractAdGroupPath(resource.path)
      const adGroupPlatformId = resourceMap.get(adGroupPath)
      const adGroupResourceName = adGroupPlatformId
        ? resolveResourceName(customerId, 'adGroups', adGroupPlatformId)
        : `customers/${customerId}/adGroups/-1`
      ops.push(buildKeywordCreate(customerId, adGroupResourceName, resource))
      break
    }

    case 'ad': {
      const adGroupPath = extractAdGroupPath(resource.path)
      const adGroupPlatformId = resourceMap.get(adGroupPath)
      const adGroupResourceName = adGroupPlatformId
        ? resolveResourceName(customerId, 'adGroups', adGroupPlatformId)
        : `customers/${customerId}/adGroups/-1`
      ops.push(buildAdCreate(customerId, adGroupResourceName, resource))
      break
    }

    case 'sitelink': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(...buildSitelinkCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'callout': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(...buildCalloutCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'structuredSnippet': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(...buildStructuredSnippetCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'callExtension': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(...buildCallExtensionCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'negative': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(buildNegativeCreate(customerId, campaignResourceName, resource))
      break
    }

    default:
      // Other providers (Meta) handle their own resource kinds — skip silently
      break
  }

  return ops
}

function buildUpdateMutations(
  change: Change & { op: 'update' },
  customerId: string,
): MutateOperation[] {
  return buildUpdateOperations(customerId, change)
}

function buildDeleteMutations(
  resource: Resource,
  customerId: string,
): MutateOperation[] {
  const op = buildDeleteOperation(customerId, resource)
  return op ? [op] : []
}

// ─── Dependency Sorting ─────────────────────────────────────

function sortByCreationOrder(changes: Change[]): Change[] {
  return [...changes].sort((a, b) => {
    const aIdx = CREATION_ORDER.indexOf(a.resource.kind)
    const bIdx = CREATION_ORDER.indexOf(b.resource.kind)
    return aIdx - bIdx
  })
}

function sortByDeletionOrder(changes: Change[]): Change[] {
  return [...changes].sort((a, b) => {
    const aIdx = CREATION_ORDER.indexOf(a.resource.kind)
    const bIdx = CREATION_ORDER.indexOf(b.resource.kind)
    return bIdx - aIdx // Reverse order for deletes
  })
}

// ─── Apply Changeset ────────────────────────────────────────

/**
 * Apply a Changeset to Google Ads via the API.
 * Creates are executed in dependency order (campaign → adGroup → keyword → ad → ...).
 * Deletes are executed in reverse dependency order (ad → keyword → adGroup → campaign).
 * On error, stops and records partial results in the cache.
 */
export async function applyChangeset(
  client: GoogleAdsClient,
  changeset: Changeset,
  cache: Cache,
  project: string,
): Promise<ApplyResult> {
  const succeeded: Change[] = []
  const failed: { change: Change; error: Error }[] = []
  const skipped: Change[] = [...changeset.drift]

  // Build resource map from cache for resolving parent references
  const cacheRows = cache.getResourceMap(project)
  const resourceMap = new Map<string, string>()
  for (const row of cacheRows) {
    if (row.platformId) {
      resourceMap.set(row.path, row.platformId)
    }
  }

  // Sort changes by dependency order
  const orderedCreates = sortByCreationOrder(changeset.creates)
  const orderedUpdates = changeset.updates
  const orderedDeletes = sortByDeletionOrder(changeset.deletes)

  // Execute creates first
  for (const change of orderedCreates) {
    try {
      const mutations = changeToMutations(change, client.customerId, resourceMap)
      if (mutations.length === 0) {
        skipped.push(change)
        continue
      }

      const results = await client.mutate(mutations)
      succeeded.push(change)

      // Record in cache + update resourceMap for child references
      const platformId = extractPlatformId(results, change.resource.kind)
      if (platformId) {
        resourceMap.set(change.resource.path, platformId)
        cache.setResource({
          project,
          path: change.resource.path,
          platformId,
          kind: change.resource.kind,
          managedBy: 'code',
        })
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
      // Stop on first failure — partial apply
      return { succeeded, failed, skipped: [...skipped, ...remainingChanges(orderedCreates, change), ...orderedUpdates, ...orderedDeletes] }
    }
  }

  // Execute updates
  for (const change of orderedUpdates) {
    try {
      const mutations = changeToMutations(change, client.customerId, resourceMap)
      if (mutations.length === 0) {
        skipped.push(change)
        continue
      }

      await client.mutate(mutations)
      succeeded.push(change)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
      return { succeeded, failed, skipped: [...skipped, ...remainingChanges(orderedUpdates, change), ...orderedDeletes] }
    }
  }

  // Execute deletes
  for (const change of orderedDeletes) {
    try {
      const mutations = changeToMutations(change, client.customerId, resourceMap)
      if (mutations.length === 0) {
        skipped.push(change)
        continue
      }

      await client.mutate(mutations)
      succeeded.push(change)

      // Remove from cache
      cache.removeResource(project, change.resource.path)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
      // Continue deleting remaining resources (don't stop on delete failures)
    }
  }

  return { succeeded, failed, skipped }
}

// ─── Helpers ────────────────────────────────────────────────

function extractPlatformId(results: MutateResult[], kind: ResourceKind): string | null {
  // Find the result that matches the resource kind
  for (const result of results) {
    const rn = result.resourceName
    if (!rn) continue

    // Resource names follow pattern: customers/{id}/{type}/{id}
    if (kind === 'campaign' && rn.includes('/campaigns/')) {
      return rn.split('/campaigns/')[1] ?? null
    }
    if (kind === 'adGroup' && rn.includes('/adGroups/')) {
      return rn.split('/adGroups/')[1] ?? null
    }
    if (kind === 'keyword' && rn.includes('/adGroupCriteria/')) {
      return rn.split('/adGroupCriteria/')[1] ?? null
    }
    if (kind === 'ad' && rn.includes('/adGroupAds/')) {
      return rn.split('/adGroupAds/')[1] ?? null
    }
  }
  return null
}

function remainingChanges(changes: Change[], afterChange: Change): Change[] {
  const idx = changes.indexOf(afterChange)
  if (idx < 0) return []
  return changes.slice(idx + 1)
}
