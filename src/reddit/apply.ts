import type { Change, Changeset, ApplyResult, Resource, ResourceKind } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { RedditProviderConfig } from './types.ts'
import type { RedditClient } from './api.ts'
import { createRedditClient } from './api.ts'
import { CREATION_ORDER, DELETION_ORDER, STATUS_MAP } from './constants.ts'

// ─── Path Helpers ───────────────────────────────────────────

/** Extract the parent campaign path (first segment). */
function extractCampaignPath(path: string): string {
  return path.split('/')[0]!
}

/** Extract the parent ad group path (first two segments). */
function extractAdGroupPath(path: string): string {
  const parts = path.split('/')
  return `${parts[0]}/${parts[1]}`
}

// ─── Status Conversion ─────────────────────────────────────

function statusToApi(status: unknown): string {
  if (status === 'ACTIVE' || status === 'enabled') return 'ACTIVE'
  return 'PAUSED'
}

// ─── Budget Conversion ──────────────────────────────────────

/**
 * Convert a Budget to Reddit API micros (1 dollar = 1,000,000 micros).
 * Returns the field name and value for the API payload.
 */
function budgetToMicros(budget: { amount: number; period: string }): { field: string; value: number } {
  const micros = Math.round(budget.amount * 1_000_000)
  if (budget.period === 'lifetime') {
    return { field: 'lifetime_budget_micro', value: micros }
  }
  // daily and monthly both map to daily_budget_micro
  // (monthly is pre-divided by ~30.4 in the SDK helpers)
  return { field: 'daily_budget_micro', value: micros }
}

// ─── Bidding Conversion ─────────────────────────────────────

function biddingToApiParams(bidding: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const type = bidding.type as string

  params['bid_strategy'] = type

  if (type === 'COST_CAP' || type === 'MANUAL_BID') {
    params['bid_micro'] = Math.round((bidding.amount as number) * 1_000_000)
  }

  return params
}

// ─── Resource Kind to API Endpoint ──────────────────────────

/** Map ResourceKind to Reddit API v3 endpoint suffix (plural). */
function kindToEndpoint(kind: ResourceKind): string {
  switch (kind) {
    case 'campaign': return 'campaigns'
    case 'adGroup': return 'ad_groups'
    case 'ad': return 'ads'
    default: return kind + 's'
  }
}

// ─── Create Builders ────────────────────────────────────────

function buildCampaignCreateBody(resource: Resource): Record<string, unknown> {
  const props = resource.properties
  const body: Record<string, unknown> = {
    name: props.name as string,
    objective: props.objective as string,
    configured_status: statusToApi(props.status),
  }

  const budget = props.budget as { amount: number; period: string } | undefined
  if (budget) {
    const { field, value } = budgetToMicros(budget)
    body[field] = value
  }

  if (props.spendCap !== undefined) {
    body['spend_cap_micro'] = Math.round((props.spendCap as number) * 1_000_000)
  }

  return body
}

function buildAdGroupCreateBody(
  resource: Resource,
  campaignId: string,
): Record<string, unknown> {
  const props = resource.properties
  const body: Record<string, unknown> = {
    campaign_id: campaignId,
    name: props.name as string,
    configured_status: statusToApi(props.status),
  }

  // Optimization goal
  const optimization = props.optimization as string | undefined
  if (optimization) {
    body['optimization_goal'] = optimization
    body['goal_type'] = optimization
  }

  // Targeting
  const targeting = props.targeting as readonly Record<string, unknown>[] | undefined
  if (targeting && targeting.length > 0) {
    body['targeting'] = buildTargetingSpec(targeting)
  }

  // Bidding
  const bidding = props.bid as Record<string, unknown> | undefined
  if (bidding) {
    Object.assign(body, biddingToApiParams(bidding))
  }

  // Placement
  const placement = props.placement as string | undefined
  if (placement) {
    body['placement'] = placement
  }

  // Schedule
  const schedule = props.schedule as Record<string, unknown> | undefined
  if (schedule) {
    if (schedule.start) body['start_time'] = schedule.start
    if (schedule.end) body['end_time'] = schedule.end
  }

  // Budget (ad group level)
  const budget = props.budget as { amount: number; period: string } | undefined
  if (budget) {
    const { field, value } = budgetToMicros(budget)
    body[field] = value
  }

  return body
}

/**
 * Convert SDK targeting rules to the Reddit API targeting spec.
 */
function buildTargetingSpec(
  rules: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const spec: Record<string, unknown> = {}

  for (const rule of rules) {
    switch (rule._type) {
      case 'geo':
        spec['geos'] = { locations: rule.locations }
        break
      case 'interests':
        spec['interests'] = rule.names
        break
      case 'subreddits':
        spec['communities'] = rule.names
        break
      case 'keywords':
        spec['keywords'] = rule.terms
        break
      case 'age':
        spec['age'] = { min: rule.min, max: rule.max }
        break
      case 'gender':
        spec['gender'] = rule.value
        break
      case 'device':
        spec['devices'] = rule.types
        break
      case 'os':
        spec['os'] = rule.types
        break
      case 'customAudience':
        spec['custom_audience_id'] = rule.id
        break
      case 'lookalike':
        spec['lookalike'] = { source_id: rule.sourceId, ...(rule.config ?? {}) }
        break
      case 'expansion':
        spec['expansion_enabled'] = rule.enabled
        break
    }
  }

  return spec
}

function buildAdCreateBody(
  resource: Resource,
  adGroupId: string,
): Record<string, unknown> {
  const props = resource.properties
  const meta = resource.meta ?? {}

  // Derive ad name from slug (last path segment) if not explicitly set
  const name = (props.name as string | undefined) ?? resource.path.split('/').pop() ?? 'ad'

  const body: Record<string, unknown> = {
    ad_group_id: adGroupId,
    name,
    configured_status: statusToApi(props.status),
  }

  // Ad format fields
  const format = props.format as string | undefined
  if (format) body['ad_type'] = format.toUpperCase()

  if (props.headline) body['headline'] = props.headline
  if (props.body) body['body'] = props.body
  if (props.clickUrl) body['click_url'] = props.clickUrl
  if (props.cta) body['call_to_action'] = props.cta

  // Media reference (set during upload or from meta)
  const mediaUrl = meta.mediaUrl as string | undefined
  if (mediaUrl) body['media_url'] = mediaUrl

  // Carousel cards
  const cards = props.cards as readonly Record<string, unknown>[] | undefined
  if (cards) body['carousel_cards'] = cards

  // Freeform mixed media
  if (props.images) body['images'] = props.images
  if (props.videos) body['videos'] = props.videos

  // Product catalog
  if (props.catalogId) body['catalog_id'] = props.catalogId

  return body
}

// ─── Update Builder ─────────────────────────────────────────

function buildUpdateBody(change: Change & { op: 'update' }): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  for (const c of change.changes) {
    switch (c.field) {
      case 'status':
        body['configured_status'] = statusToApi(c.to)
        break
      case 'name':
        body['name'] = c.to
        break
      case 'budget': {
        const budget = c.to as { amount: number; period: string } | undefined
        if (budget) {
          const { field, value } = budgetToMicros(budget)
          body[field] = value
        }
        break
      }
      case 'targeting': {
        const targeting = c.to as readonly Record<string, unknown>[] | undefined
        if (targeting) {
          body['targeting'] = buildTargetingSpec(targeting)
        }
        break
      }
      case 'bid': {
        const bidding = c.to as Record<string, unknown> | undefined
        if (bidding) {
          Object.assign(body, biddingToApiParams(bidding))
        }
        break
      }
      case 'optimization':
        body['optimization_goal'] = c.to
        body['goal_type'] = c.to
        break
      case 'headline':
        body['headline'] = c.to
        break
      case 'body':
        body['body'] = c.to
        break
      case 'clickUrl':
        body['click_url'] = c.to
        break
      case 'cta':
        body['call_to_action'] = c.to
        break
      case 'spendCap':
        body['spend_cap_micro'] = Math.round((c.to as number) * 1_000_000)
        break
      // Skip SDK-internal fields
      case '_defaults':
        break
      default:
        body[c.field] = c.to
        break
    }
  }

  return body
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

// ─── Apply Changeset ────────────────────────────────────────

/**
 * Apply a Reddit Ads changeset via the Reddit Ads API v3.
 *
 * Creates in dependency order (campaign -> adGroup -> ad).
 * Updates send only changed fields via PUT.
 * Deletes in reverse dependency order (ad -> adGroup -> campaign).
 *
 * On create/update failure, execution stops and remaining changes are skipped.
 * Deletes continue on failure (best effort) to avoid orphans.
 * The cache records each successful create so the next `plan` shows correct state.
 */
export async function applyRedditChangeset(
  changeset: Changeset,
  config: RedditProviderConfig,
  cache: Cache,
  project: string,
  client?: RedditClient,
): Promise<ApplyResult> {
  const redditClient = client ?? createRedditClient(config)
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

  const orderedCreates = sortByCreationOrder(changeset.creates)
  const orderedUpdates = changeset.updates
  const orderedDeletes = sortByDeletionOrder(changeset.deletes)

  // Execute creates in dependency order
  for (const change of orderedCreates) {
    try {
      const platformId = await executeCreate(
        change,
        accountId,
        redditClient,
        resourceMap,
      )

      succeeded.push(change)

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
      // Stop on first failure
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
      await executeUpdate(
        change as Change & { op: 'update' },
        accountId,
        redditClient,
      )
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

  // Execute deletes (continue on failure)
  for (const change of orderedDeletes) {
    try {
      await executeDelete(change, accountId, redditClient)
      succeeded.push(change)
      cache.removeResource(project, change.resource.path)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      failed.push({ change, error })
    }
  }

  return { succeeded, failed, skipped }
}

// ─── Execution Helpers ──────────────────────────────────────

async function executeCreate(
  change: Change,
  accountId: string,
  client: RedditClient,
  resourceMap: Map<string, string>,
): Promise<string | null> {
  const resource = change.resource
  const endpoint = kindToEndpoint(resource.kind)

  switch (resource.kind) {
    case 'campaign': {
      const body = buildCampaignCreateBody(resource)
      const result = await client.post<{ id: string }>(
        `accounts/${accountId}/${endpoint}`,
        body,
      )
      return result.id ?? null
    }

    case 'adGroup': {
      const campaignPath = extractCampaignPath(resource.path)
      const campaignId = resourceMap.get(campaignPath)
      if (!campaignId) {
        throw new Error(
          `Cannot create ad group "${resource.properties.name}" -- ` +
          `parent campaign at path "${campaignPath}" has no platform ID. ` +
          `Was the campaign created first?`
        )
      }
      const body = buildAdGroupCreateBody(resource, campaignId)
      const result = await client.post<{ id: string }>(
        `accounts/${accountId}/${endpoint}`,
        body,
      )
      return result.id ?? null
    }

    case 'ad': {
      const adGroupPath = extractAdGroupPath(resource.path)
      const adGroupId = resourceMap.get(adGroupPath)
      if (!adGroupId) {
        throw new Error(
          `Cannot create ad "${resource.properties.name}" -- ` +
          `parent ad group at path "${adGroupPath}" has no platform ID.`
        )
      }
      const body = buildAdCreateBody(resource, adGroupId)
      const result = await client.post<{ id: string }>(
        `accounts/${accountId}/${endpoint}`,
        body,
      )
      return result.id ?? null
    }

    default:
      return null
  }
}

async function executeUpdate(
  change: Change & { op: 'update' },
  accountId: string,
  client: RedditClient,
): Promise<void> {
  const resource = change.resource
  if (!resource.platformId) {
    throw new Error(
      `Cannot update ${resource.kind} "${resource.properties.name}" -- no platform ID.`
    )
  }

  const body = buildUpdateBody(change)
  if (Object.keys(body).length === 0) return

  const endpoint = kindToEndpoint(resource.kind)
  await client.put(`accounts/${accountId}/${endpoint}/${resource.platformId}`, body)
}

async function executeDelete(
  change: Change,
  accountId: string,
  client: RedditClient,
): Promise<void> {
  const resource = change.resource
  if (!resource.platformId) return

  const endpoint = kindToEndpoint(resource.kind)
  await client.delete(`accounts/${accountId}/${endpoint}/${resource.platformId}`)
}

// ─── Dry Run ────────────────────────────────────────────────

/** A single API call that would be made during apply. */
export type DryRunCall = {
  readonly method: 'POST' | 'PUT' | 'DELETE'
  readonly endpoint: string
  readonly body?: Record<string, unknown>
  readonly resource: { kind: ResourceKind; path: string; name?: string }
  readonly op: 'create' | 'update' | 'delete'
}

/**
 * Generate the exact API payloads that `applyRedditChangeset` would send,
 * without making any network calls.
 */
export function dryRunRedditChangeset(
  changeset: Changeset,
  config: RedditProviderConfig,
  cache: Cache,
  project: string,
): DryRunCall[] {
  const accountId = config.accountId
  const calls: DryRunCall[] = []

  const cacheRows = cache.getResourceMap(project)
  const resourceMap = new Map<string, string>()
  for (const row of cacheRows) {
    if (row.platformId) {
      resourceMap.set(row.path, row.platformId)
    }
  }

  const orderedCreates = sortByCreationOrder(changeset.creates)
  const orderedUpdates = changeset.updates
  const orderedDeletes = sortByDeletionOrder(changeset.deletes)

  // Creates
  for (const change of orderedCreates) {
    const resource = change.resource
    const name = resource.properties.name as string | undefined
    const endpoint = kindToEndpoint(resource.kind)

    switch (resource.kind) {
      case 'campaign': {
        const body = buildCampaignCreateBody(resource)
        calls.push({
          method: 'POST',
          endpoint: `accounts/${accountId}/${endpoint}`,
          body,
          resource: { kind: resource.kind, path: resource.path, name },
          op: 'create',
        })
        resourceMap.set(resource.path, '<new-campaign-id>')
        break
      }
      case 'adGroup': {
        const campaignPath = extractCampaignPath(resource.path)
        const campaignId = resourceMap.get(campaignPath) ?? '<unknown-campaign-id>'
        const body = buildAdGroupCreateBody(resource, campaignId)
        calls.push({
          method: 'POST',
          endpoint: `accounts/${accountId}/${endpoint}`,
          body,
          resource: { kind: resource.kind, path: resource.path, name },
          op: 'create',
        })
        resourceMap.set(resource.path, '<new-adgroup-id>')
        break
      }
      case 'ad': {
        const adGroupPath = extractAdGroupPath(resource.path)
        const adGroupId = resourceMap.get(adGroupPath) ?? '<unknown-adgroup-id>'
        const body = buildAdCreateBody(resource, adGroupId)
        calls.push({
          method: 'POST',
          endpoint: `accounts/${accountId}/${endpoint}`,
          body,
          resource: { kind: resource.kind, path: resource.path, name },
          op: 'create',
        })
        break
      }
    }
  }

  // Updates
  for (const change of orderedUpdates) {
    if (change.op !== 'update') continue
    const resource = change.resource
    if (!resource.platformId) continue
    const name = resource.properties.name as string | undefined

    const body = buildUpdateBody(change)
    if (Object.keys(body).length === 0) continue

    const endpoint = kindToEndpoint(resource.kind)
    calls.push({
      method: 'PUT',
      endpoint: `accounts/${accountId}/${endpoint}/${resource.platformId}`,
      body,
      resource: { kind: resource.kind, path: resource.path, name },
      op: 'update',
    })
  }

  // Deletes
  for (const change of orderedDeletes) {
    const resource = change.resource
    if (!resource.platformId) continue
    const endpoint = kindToEndpoint(resource.kind)
    calls.push({
      method: 'DELETE',
      endpoint: `accounts/${accountId}/${endpoint}/${resource.platformId}`,
      resource: { kind: resource.kind, path: resource.path, name: resource.properties.name as string | undefined },
      op: 'delete',
    })
  }

  return calls
}
