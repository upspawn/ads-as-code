import type { Change, Changeset, Resource, ResourceKind } from '../core/types.ts'
import type { GoogleAdsClient, MutateOperation, MutateResult } from './types.ts'
import type { Cache } from '../core/cache.ts'
import { LANGUAGE_CRITERIA, GEO_TARGETS } from './constants.ts'

// ─── Types ──────────────────────────────────────────────────

export type ApplyResult = {
  readonly succeeded: Change[]
  readonly failed: { change: Change; error: Error }[]
  readonly skipped: Change[]
}

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

// ─── Mutation Builders ──────────────────────────────────────

function buildCampaignBudgetCreate(
  customerId: string,
  tempBudgetId: string,
  budget: { amount: number; period: string },
): MutateOperation {
  return {
    operation: 'campaignBudgetOperation',
    resource: {
      create: {
        resourceName: `customers/${customerId}/campaignBudgets/${tempBudgetId}`,
        amountMicros: String(dailyBudgetMicros(budget)),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
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
    resourceName: `customers/${customerId}/campaigns/${tempCampaignId}`,
    name: props.name,
    status: (props.status as string) === 'enabled' ? 'ENABLED' : 'PAUSED',
    advertisingChannelType: 'SEARCH',
    campaignBudget: `customers/${customerId}/campaignBudgets/${tempBudgetId}`,
  }

  // Bidding strategy
  const bidding = props.bidding as Record<string, unknown> | undefined
  if (bidding) {
    switch (bidding.type) {
      case 'maximize-conversions':
        campaign.maximizeConversions = {}
        break
      case 'maximize-clicks':
        campaign.targetSpend = bidding.maxCpc
          ? { cpcBidCeilingMicros: String(toMicros(bidding.maxCpc as number)) }
          : {}
        break
      case 'manual-cpc':
        campaign.manualCpc = { enhancedCpcEnabled: bidding.enhancedCpc ?? false }
        break
      case 'target-cpa':
        campaign.targetCpa = { targetCpaMicros: String(toMicros(bidding.targetCpa as number)) }
        break
    }
  }

  return {
    operation: 'campaignOperation',
    resource: { create: campaign },
  }
}

function buildTargetingOperations(
  customerId: string,
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
            operation: 'campaignCriterionOperation',
            resource: {
              create: {
                campaign: campaignResourceName,
                language: {
                  languageConstant: `languageConstants/${criterionId}`,
                },
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
            operation: 'campaignCriterionOperation',
            resource: {
              create: {
                campaign: campaignResourceName,
                location: {
                  geoTargetConstant: `geoTargetConstants/${geoTargetId}`,
                },
              },
            },
          })
        }
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
    operation: 'adGroupOperation',
    resource: {
      create: {
        resourceName: `customers/${customerId}/adGroups/${tempId}`,
        campaign: campaignResourceName,
        name: adGroupName,
        status: (props.status as string) === 'paused' ? 'PAUSED' : 'ENABLED',
        type: 'SEARCH_STANDARD',
      },
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
    operation: 'adGroupCriterionOperation',
    resource: {
      create: {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        keyword: {
          text: props.text,
          matchType: props.matchType,
        },
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
    operation: 'campaignCriterionOperation',
    resource: {
      create: {
        campaign: campaignResourceName,
        negative: true,
        keyword: {
          text: props.text,
          matchType: props.matchType,
        },
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
  const headlines = (props.headlines as string[]).map(text => ({
    text,
    pinnedField: 'UNSPECIFIED',
  }))
  const descriptions = (props.descriptions as string[]).map(text => ({
    text,
    pinnedField: 'UNSPECIFIED',
  }))

  return {
    operation: 'adGroupAdOperation',
    resource: {
      create: {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        ad: {
          responsiveSearchAd: { headlines, descriptions },
          finalUrls: [props.finalUrl],
        },
      },
    },
  }
}

function buildSitelinkCreate(
  _customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'assetOperation',
    resource: {
      create: {
        sitelinkAsset: {
          linkText: props.text,
          description1: props.description1,
          description2: props.description2,
        },
        finalUrls: [props.url],
      },
    },
    // The campaign association is a separate operation, but for simplicity
    // we embed the campaign reference as metadata
    updateMask: campaignResourceName,
  }
}

function buildCalloutCreate(
  _customerId: string,
  campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'assetOperation',
    resource: {
      create: {
        calloutAsset: {
          calloutText: props.text,
        },
      },
    },
    updateMask: campaignResourceName,
  }
}

// ─── Delete Builders ────────────────────────────────────────

function buildDeleteOperation(
  customerId: string,
  resource: Resource,
): MutateOperation | null {
  if (!resource.platformId) return null

  switch (resource.kind) {
    case 'campaign':
      return {
        operation: 'campaignOperation',
        resource: { remove: `customers/${customerId}/campaigns/${resource.platformId}` },
      }
    case 'adGroup':
      return {
        operation: 'adGroupOperation',
        resource: { remove: `customers/${customerId}/adGroups/${resource.platformId}` },
      }
    case 'keyword':
      return {
        operation: 'adGroupCriterionOperation',
        resource: { remove: `customers/${customerId}/adGroupCriteria/${resource.platformId}` },
      }
    case 'ad':
      return {
        operation: 'adGroupAdOperation',
        resource: { remove: `customers/${customerId}/adGroupAds/${resource.platformId}` },
      }
    default:
      return null
  }
}

// ─── Update Builders ────────────────────────────────────────

function buildUpdateOperation(
  customerId: string,
  change: Change & { op: 'update' },
): MutateOperation | null {
  const resource = change.resource
  if (!resource.platformId) return null

  const changedFields = change.changes.map(c => c.field)

  switch (resource.kind) {
    case 'campaign': {
      const update: Record<string, unknown> = {
        resourceName: `customers/${customerId}/campaigns/${resource.platformId}`,
      }
      for (const c of change.changes) {
        if (c.field === 'status') {
          update.status = (c.to as string) === 'enabled' ? 'ENABLED' : 'PAUSED'
        }
        if (c.field === 'name') {
          update.name = c.to
        }
      }
      return {
        operation: 'campaignOperation',
        resource: { update },
        updateMask: changedFields.join(','),
      }
    }
    case 'adGroup': {
      const update: Record<string, unknown> = {
        resourceName: `customers/${customerId}/adGroups/${resource.platformId}`,
      }
      for (const c of change.changes) {
        if (c.field === 'status') {
          update.status = (c.to as string) === 'enabled' ? 'ENABLED' : 'PAUSED'
        }
      }
      return {
        operation: 'adGroupOperation',
        resource: { update },
        updateMask: changedFields.join(','),
      }
    }
    default:
      return null
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
        ? `customers/${customerId}/campaigns/${campaignPlatformId}`
        : `customers/${customerId}/campaigns/-1`
      const tempId = `-${Date.now()}`
      ops.push(buildAdGroupCreate(customerId, tempId, campaignResourceName, resource))
      break
    }

    case 'keyword': {
      const adGroupPath = extractAdGroupPath(resource.path)
      const adGroupPlatformId = resourceMap.get(adGroupPath)
      const adGroupResourceName = adGroupPlatformId
        ? `customers/${customerId}/adGroups/${adGroupPlatformId}`
        : `customers/${customerId}/adGroups/-1`
      ops.push(buildKeywordCreate(customerId, adGroupResourceName, resource))
      break
    }

    case 'ad': {
      const adGroupPath = extractAdGroupPath(resource.path)
      const adGroupPlatformId = resourceMap.get(adGroupPath)
      const adGroupResourceName = adGroupPlatformId
        ? `customers/${customerId}/adGroups/${adGroupPlatformId}`
        : `customers/${customerId}/adGroups/-1`
      ops.push(buildAdCreate(customerId, adGroupResourceName, resource))
      break
    }

    case 'sitelink': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? `customers/${customerId}/campaigns/${campaignPlatformId}`
        : `customers/${customerId}/campaigns/-1`
      ops.push(buildSitelinkCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'callout': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? `customers/${customerId}/campaigns/${campaignPlatformId}`
        : `customers/${customerId}/campaigns/-1`
      ops.push(buildCalloutCreate(customerId, campaignResourceName, resource))
      break
    }

    case 'negative': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignPlatformId = resourceMap.get(campaignPath)
      const campaignResourceName = campaignPlatformId
        ? `customers/${customerId}/campaigns/${campaignPlatformId}`
        : `customers/${customerId}/campaigns/-1`
      ops.push(buildNegativeCreate(customerId, campaignResourceName, resource))
      break
    }
  }

  return ops
}

function buildUpdateMutations(
  change: Change & { op: 'update' },
  customerId: string,
): MutateOperation[] {
  const op = buildUpdateOperation(customerId, change)
  return op ? [op] : []
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
      return { succeeded, failed, skipped: [...skipped, ...remainingChanges(orderedDeletes, change)] }
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
