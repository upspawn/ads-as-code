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
  const campaign: Record<string, unknown> = {
    resource_name: `customers/${customerId}/campaigns/${tempCampaignId}`,
    name: props.name,
    status: (props.status as string) === 'enabled' ? 2 : 3, // 2=ENABLED, 3=PAUSED
    advertising_channel_type: 2, // SEARCH
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
      for (const country of countries) {
        const geoTargetId = GEO_TARGETS[country]
        if (geoTargetId) {
          ops.push({
            operation: 'campaign_criterion',
            op: 'create',
            resource: {
              campaign: campaignResourceName,
              location: {
                geo_target_constant: `geoTargetConstants/${geoTargetId}`,
              },
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

  return {
    operation: 'ad_group',
    op: 'create',
    resource: {
      resource_name: `customers/${customerId}/adGroups/${tempId}`,
      campaign: campaignResourceName,
      name: adGroupName,
      status: (props.status as string) === 'paused' ? 3 : 2, // 3=PAUSED, 2=ENABLED
      type: 2, // SEARCH_STANDARD
    },
  }
}

function buildKeywordCreate(
  _customerId: string,
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'ad_group_criterion',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status: 2, // ENABLED
      keyword: {
        text: props.text,
        match_type: matchTypeToEnum(props.matchType),
      },
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

function buildSitelinkCreate(
  _customerId: string,
  _campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'asset',
    op: 'create',
    resource: {
      sitelink_asset: {
        link_text: props.text,
        description1: props.description1,
        description2: props.description2,
      },
      final_urls: [props.url],
    },
  }
}

function buildCalloutCreate(
  _customerId: string,
  _campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'asset',
    op: 'create',
    resource: {
      callout_asset: {
        callout_text: props.text,
      },
    },
  }
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
      ops.push(buildSitelinkCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'callout': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? resolveResourceName(customerId, 'campaigns', campaignPlatformId)
        : `customers/${customerId}/campaigns/-1`
      ops.push(buildCalloutCreate(customerId, campaignResourceName, resource))
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
