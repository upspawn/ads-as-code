import type { Change, Changeset, MetaProviderConfig, Resource, ResourceKind } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { MetaClient } from './api.ts'
import { createMetaClient } from './api.ts'
import { uploadImage } from './upload.ts'
import { CREATION_ORDER, DELETION_ORDER, OBJECTIVE_MAP } from './constants.ts'

// ─── Types ──────────────────────────────────────────────────

export type MetaApplyResult = {
  readonly succeeded: Change[]
  readonly failed: { change: Change; error: Error }[]
  readonly skipped: Change[]
}

// ─── Path Helpers ───────────────────────────────────────────

/** Extract the parent campaign path from a resource path (first segment). */
function extractCampaignPath(path: string): string {
  return path.split('/')[0]!
}

/** Extract the parent ad set path from a resource path (first two segments). */
function extractAdSetPath(path: string): string {
  const parts = path.split('/')
  return `${parts[0]}/${parts[1]}`
}

/**
 * Extract the creative path from an ad resource path.
 * Ad path: `campaign/adset/ad-name` → creative path: `campaign/adset/ad-name/cr`
 */
function extractCreativePath(adPath: string): string {
  return `${adPath}/cr`
}

// ─── Budget Conversion ──────────────────────────────────────

/**
 * Convert a core Budget object to Meta API cents (integer string).
 * Meta uses daily amounts in cents (e.g. $5.00 = "500").
 */
function budgetToCents(budget: { amount: number; period: string }): string {
  if (budget.period === 'monthly') {
    return String(Math.round((budget.amount / 30.4) * 100))
  }
  return String(Math.round(budget.amount * 100))
}

// ─── Status Conversion ─────────────────────────────────────

function statusToApi(status: unknown): string {
  if (status === 'ACTIVE' || status === 'enabled') return 'ACTIVE'
  return 'PAUSED'
}

// ─── Bidding Conversion ─────────────────────────────────────

function biddingToApiParams(bidding: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {}
  const type = bidding.type as string

  switch (type) {
    case 'LOWEST_COST_WITHOUT_CAP':
      params['bid_strategy'] = 'LOWEST_COST_WITHOUT_CAP'
      break
    case 'LOWEST_COST_WITH_BID_CAP':
      params['bid_strategy'] = 'LOWEST_COST_WITHOUT_CAP'
      params['bid_amount'] = String(Math.round((bidding.cap as number) * 100))
      break
    case 'COST_CAP':
      params['bid_strategy'] = 'COST_CAP'
      params['bid_amount'] = String(Math.round((bidding.cap as number) * 100))
      break
    case 'BID_CAP':
      params['bid_strategy'] = 'LOWEST_COST_WITHOUT_CAP'
      params['bid_amount'] = String(Math.round((bidding.cap as number) * 100))
      break
    case 'MINIMUM_ROAS':
      params['bid_strategy'] = 'LOWEST_COST_WITHOUT_CAP'
      params['roas_average_floor'] = String(bidding.floor)
      break
  }

  return params
}

// ─── Create Builders ────────────────────────────────────────

function buildCampaignCreateParams(
  resource: Resource,
  config: MetaProviderConfig,
): Record<string, string> {
  const props = resource.properties
  const params: Record<string, string> = {
    name: props.name as string,
    objective: props.objective as string,
    status: statusToApi(props.status),
    special_ad_categories: JSON.stringify(props.specialAdCategories ?? []),
  }

  const budget = props.budget as { amount: number; period: string; currency?: string } | undefined
  if (budget) {
    if (budget.period === 'lifetime') {
      params['lifetime_budget'] = budgetToCents(budget)
    } else {
      params['daily_budget'] = budgetToCents(budget)
    }
  }

  return params
}

function buildAdSetCreateParams(
  resource: Resource,
  campaignId: string,
  config: MetaProviderConfig,
): Record<string, string> {
  const props = resource.properties
  const params: Record<string, string> = {
    campaign_id: campaignId,
    name: props.name as string,
    status: statusToApi(props.status),
    billing_event: 'IMPRESSIONS',
    optimization_goal: props.optimization as string,
  }

  // Targeting
  const targeting = props.targeting as Record<string, unknown> | undefined
  if (targeting) {
    params['targeting'] = JSON.stringify(buildTargetingSpec(targeting))
  }

  // Budget (ad set level)
  const budget = props.budget as { amount: number; period: string } | undefined
  if (budget) {
    if (budget.period === 'lifetime') {
      params['lifetime_budget'] = budgetToCents(budget)
    } else {
      params['daily_budget'] = budgetToCents(budget)
    }
  }

  // Bidding
  const bidding = props.bidding as Record<string, unknown> | undefined
  if (bidding) {
    Object.assign(params, biddingToApiParams(bidding))
  }

  // Placements
  const placements = props.placements as string | Record<string, unknown> | undefined
  if (placements && placements !== 'automatic') {
    const p = placements as Record<string, unknown>
    if (p.platforms) {
      params['publisher_platforms'] = JSON.stringify(p.platforms)
    }
    if (p.positions) {
      params['facebook_positions'] = JSON.stringify(p.positions)
    }
  }

  // DSA — resolve from ad set config first, then fall back to provider config
  const dsa = (props.dsa as { beneficiary: string; payor: string } | undefined)
    ?? config.dsa
  if (dsa) {
    params['dsa_beneficiary'] = dsa.beneficiary
    params['dsa_payor'] = dsa.payor
  }

  // Promoted object (for conversion tracking)
  const promotedObject = props.promotedObject as Record<string, unknown> | undefined
  if (promotedObject) {
    params['promoted_object'] = JSON.stringify(promotedObject)
  }

  return params
}

/**
 * Convert SDK targeting shape to the Meta API targeting_spec format.
 */
function buildTargetingSpec(targeting: Record<string, unknown>): Record<string, unknown> {
  const spec: Record<string, unknown> = {}

  // Geo targeting
  const geo = targeting.geo as Array<{ countries: string[] }> | undefined
  if (geo && geo.length > 0) {
    const countries = geo.flatMap(g => g.countries)
    if (countries.length > 0) {
      spec['geo_locations'] = { countries }
    }
  }

  // Age
  const age = targeting.age as { min: number; max: number } | undefined
  if (age) {
    spec['age_min'] = age.min
    spec['age_max'] = age.max
  }

  // Genders
  const genders = targeting.genders as string[] | undefined
  if (genders) {
    const genderMap: Record<string, number> = { male: 1, female: 2, all: 0 }
    spec['genders'] = genders.map(g => genderMap[g] ?? 0).filter(g => g !== 0)
  }

  // Interests
  const interests = targeting.interests as Array<{ id: string; name: string }> | undefined
  if (interests && interests.length > 0) {
    spec['interests'] = interests
  }

  // Behaviors
  const behaviors = targeting.behaviors as Array<{ id: string; name: string }> | undefined
  if (behaviors && behaviors.length > 0) {
    spec['behaviors'] = behaviors
  }

  // Custom audiences
  const customAudiences = targeting.customAudiences as string[] | undefined
  if (customAudiences && customAudiences.length > 0) {
    spec['custom_audiences'] = customAudiences.map(id => ({ id }))
  }

  // Excluded audiences
  const excludedAudiences = targeting.excludedAudiences as string[] | undefined
  if (excludedAudiences && excludedAudiences.length > 0) {
    spec['excluded_custom_audiences'] = excludedAudiences.map(id => ({ id }))
  }

  // Locales
  const locales = targeting.locales as number[] | undefined
  if (locales && locales.length > 0) {
    spec['locales'] = locales
  }

  return spec
}

function buildCreativeCreateParams(
  resource: Resource,
  config: MetaProviderConfig,
): Record<string, string> {
  const props = resource.properties
  const meta = resource.meta ?? {}
  const format = props.format as string

  const params: Record<string, string> = {
    name: props.name as string,
  }

  if (format === 'image') {
    const linkData: Record<string, unknown> = {
      image_hash: meta.imageHash as string,
      name: props.headline as string,
      message: props.primaryText as string,
      link: props.url as string,
      call_to_action: {
        type: props.cta as string,
        value: { link: props.url as string },
      },
    }
    if (props.description) {
      linkData['description'] = props.description as string
    }

    params['object_story_spec'] = JSON.stringify({
      page_id: config.pageId,
      link_data: linkData,
    })
  } else if (format === 'video') {
    const videoData: Record<string, unknown> = {
      video_id: meta.videoId as string,
      title: props.headline as string,
      message: props.primaryText as string,
      link: props.url as string,
      call_to_action: {
        type: props.cta as string,
        value: { link: props.url as string },
      },
    }
    if (props.description) {
      videoData['description'] = props.description as string
    }

    params['object_story_spec'] = JSON.stringify({
      page_id: config.pageId,
      video_data: videoData,
    })
  }

  return params
}

function buildAdCreateParams(
  resource: Resource,
  adSetId: string,
  creativeId: string,
): Record<string, string> {
  const props = resource.properties
  return {
    name: props.name as string,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: statusToApi(props.status),
  }
}

// ─── Update Builder ─────────────────────────────────────────

/**
 * Build POST params for an update operation.
 * Only changed fields are included.
 */
function buildUpdateParams(change: Change & { op: 'update' }): Record<string, string> {
  const params: Record<string, string> = {}

  for (const c of change.changes) {
    switch (c.field) {
      case 'status':
        params['status'] = statusToApi(c.to)
        break
      case 'name':
        params['name'] = c.to as string
        break
      case 'budget': {
        const budget = c.to as { amount: number; period: string } | undefined
        if (budget) {
          if (budget.period === 'lifetime') {
            params['lifetime_budget'] = budgetToCents(budget)
          } else {
            params['daily_budget'] = budgetToCents(budget)
          }
        }
        break
      }
      case 'targeting': {
        const targeting = c.to as Record<string, unknown> | undefined
        if (targeting) {
          params['targeting'] = JSON.stringify(buildTargetingSpec(targeting))
        }
        break
      }
      case 'optimization':
        params['optimization_goal'] = c.to as string
        break
      case 'bidding': {
        const bidding = c.to as Record<string, unknown> | undefined
        if (bidding) {
          Object.assign(params, biddingToApiParams(bidding))
        }
        break
      }
      // Skip internal/derived fields
      case '_defaults':
      case 'creativePath':
      case 'budgetResourceName':
        break
      default:
        // Pass through any other field as-is (Meta accepts snake_case params)
        params[c.field] = typeof c.to === 'object' ? JSON.stringify(c.to) : String(c.to)
        break
    }
  }

  return params
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
    const aIdx = DELETION_ORDER.indexOf(a.resource.kind)
    const bIdx = DELETION_ORDER.indexOf(b.resource.kind)
    return aIdx - bIdx
  })
}

function remainingChanges(changes: Change[], afterChange: Change): Change[] {
  const idx = changes.indexOf(afterChange)
  if (idx < 0) return []
  return changes.slice(idx + 1)
}

// ─── Image Upload for Pending Creatives ─────────────────────

/**
 * Upload images for creative resources that have `pendingUpload: true`.
 * Mutates the resource meta in place to add `imageHash`.
 * Returns true if all uploads succeeded.
 */
async function uploadPendingImages(
  creates: Change[],
  accountId: string,
  client: MetaClient,
  cache: Cache,
): Promise<{ errors: Array<{ change: Change; error: Error }> }> {
  const errors: Array<{ change: Change; error: Error }> = []

  for (const change of creates) {
    if (change.resource.kind !== 'creative') continue
    const props = change.resource.properties

    const meta = change.resource.meta
    const imagePath = meta?.imagePath as string | undefined
    const pendingUpload = meta?.pendingUpload as boolean | undefined

    if (pendingUpload && imagePath) {
      try {
        const result = await uploadImage(
          imagePath,
          accountId,
          client.graphPost as any,
          cache,
        )
        // Store the image hash on the resource meta for the creative create step.
        // We use a mutable cast because the Resource type is readonly,
        // but we need to inject the uploaded hash before the create call.
        ;(meta as Record<string, unknown>)['imageHash'] = result.imageHash
        ;(meta as Record<string, unknown>)['pendingUpload'] = false
      } catch (err) {
        errors.push({
          change,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    }
  }

  return { errors }
}

// ─── Apply Changeset ────────────────────────────────────────

/**
 * Apply a Meta Ads changeset via the Graph API.
 *
 * Creates are executed in dependency order (campaign → adSet → creative → ad).
 * Image uploads happen after ad sets are created (so we have the ad account ready)
 * but before creatives (which need the image hash).
 * Updates send only changed fields via POST /{entityId}.
 * Deletes are executed in reverse dependency order (ad → creative → adSet → campaign).
 *
 * On create failure, execution stops and remaining changes are skipped.
 * The cache records each successful create so the next `plan` shows correct state.
 */
export async function applyMetaChangeset(
  changeset: Changeset,
  config: MetaProviderConfig,
  cache: Cache,
  project: string,
): Promise<MetaApplyResult> {
  const client = createMetaClient(config)
  const accountId = config.accountId
  const succeeded: Change[] = []
  const failed: Array<{ change: Change; error: Error }> = []
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

  // Upload pending images before processing creates
  const creativeCreates = orderedCreates.filter(c => c.resource.kind === 'creative')
  const { errors: uploadErrors } = await uploadPendingImages(
    creativeCreates,
    accountId,
    client,
    cache,
  )

  if (uploadErrors.length > 0) {
    // Image upload failures prevent creative + ad creation
    failed.push(...uploadErrors)
    const affectedPaths = new Set(uploadErrors.map(e => e.change.resource.path))
    // Skip creates that depend on failed uploads
    for (const change of orderedCreates) {
      if (!affectedPaths.has(change.resource.path)) {
        // Not affected by upload failures — will be processed normally
        continue
      }
    }
  }

  // Execute creates in dependency order
  for (const change of orderedCreates) {
    // Skip if this creative had an upload failure
    if (failed.some(f => f.change === change)) continue

    try {
      const platformId = await executeCreate(
        change,
        accountId,
        config,
        client,
        resourceMap,
      )

      succeeded.push(change)

      // Record in cache + update resourceMap for child references
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
      skipped.push(
        ...remainingChanges(orderedCreates, change),
        ...orderedUpdates,
        ...orderedDeletes,
      )
      return { succeeded, failed, skipped }
    }
  }

  // Execute updates
  for (const change of orderedUpdates) {
    try {
      await executeUpdate(change as Change & { op: 'update' }, client)
      succeeded.push(change)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
      skipped.push(
        ...remainingChanges(orderedUpdates, change),
        ...orderedDeletes,
      )
      return { succeeded, failed, skipped }
    }
  }

  // Execute deletes (continue on failure — best effort)
  for (const change of orderedDeletes) {
    try {
      await executeDelete(change, client)
      succeeded.push(change)
      cache.removeResource(project, change.resource.path)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
      // Continue deleting remaining resources — don't stop on delete failures
    }
  }

  return { succeeded, failed, skipped }
}

// ─── Execution Helpers ──────────────────────────────────────

async function executeCreate(
  change: Change,
  accountId: string,
  config: MetaProviderConfig,
  client: MetaClient,
  resourceMap: Map<string, string>,
): Promise<string | null> {
  const resource = change.resource

  switch (resource.kind) {
    case 'campaign': {
      const params = buildCampaignCreateParams(resource, config)
      const result = await client.graphPost<{ id: string }>(
        `${accountId}/campaigns`,
        params,
      )
      return result.id ?? null
    }

    case 'adSet': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignId = resourceMap.get(campaignPath)
      if (!campaignId) {
        throw new Error(
          `Cannot create ad set "${resource.properties.name}" — ` +
          `parent campaign at path "${campaignPath}" has no platform ID. ` +
          `Was the campaign created first?`
        )
      }
      const params = buildAdSetCreateParams(resource, campaignId, config)
      const result = await client.graphPost<{ id: string }>(
        `${accountId}/adsets`,
        params,
      )
      return result.id ?? null
    }

    case 'creative': {
      const params = buildCreativeCreateParams(resource, config)
      const result = await client.graphPost<{ id: string }>(
        `${accountId}/adcreatives`,
        params,
      )
      return result.id ?? null
    }

    case 'ad': {
      const adSetPath = extractAdSetPath(resource.path)
      const adSetId = resourceMap.get(adSetPath)
      if (!adSetId) {
        throw new Error(
          `Cannot create ad "${resource.properties.name}" — ` +
          `parent ad set at path "${adSetPath}" has no platform ID.`
        )
      }
      const creativePath = (resource.meta?.creativePath as string)
        ?? (resource.properties.creativePath as string)
        ?? extractCreativePath(resource.path)
      const creativeId = resourceMap.get(creativePath)
      if (!creativeId) {
        throw new Error(
          `Cannot create ad "${resource.properties.name}" — ` +
          `creative at path "${creativePath}" has no platform ID.`
        )
      }
      const params = buildAdCreateParams(resource, adSetId, creativeId)
      const result = await client.graphPost<{ id: string }>(
        `${accountId}/ads`,
        params,
      )
      return result.id ?? null
    }

    default:
      // Unknown kind for Meta — skip silently
      return null
  }
}

async function executeUpdate(
  change: Change & { op: 'update' },
  client: MetaClient,
): Promise<void> {
  const resource = change.resource
  if (!resource.platformId) {
    throw new Error(
      `Cannot update ${resource.kind} "${resource.properties.name}" — no platform ID.`
    )
  }

  const params = buildUpdateParams(change)
  if (Object.keys(params).length === 0) return

  await client.graphPost(resource.platformId, params)
}

async function executeDelete(
  change: Change,
  client: MetaClient,
): Promise<void> {
  const resource = change.resource
  if (!resource.platformId) return

  // Meta deletes use either DELETE /{id} or POST /{id} with status=DELETED.
  // The Graph API supports both. We use DELETE for cleaner semantics.
  await client.graphDelete(resource.platformId)
}
