import type { Resource, ResourceKind, MetaProviderConfig, Budget } from '../core/types.ts'
import type { MetaClient } from './api.ts'
import { createMetaClient } from './api.ts'
import { slugify } from '../core/flatten.ts'
import { OBJECTIVE_MAP } from './constants.ts'
import type { MetaCTA, BidStrategy, Objective } from './types.ts'

// ─── Meta API Response Types ──────────────────────────────
// Shape of objects returned by the Graph API. Kept close to the
// fetcher so callers never depend on the raw API shape.

type MetaApiCampaign = {
  readonly id: string
  readonly name: string
  readonly objective?: string
  readonly status: string
  readonly daily_budget?: string
  readonly lifetime_budget?: string
  readonly special_ad_categories?: readonly string[]
  readonly buying_type?: string
}

type MetaApiAdSet = {
  readonly id: string
  readonly name: string
  readonly campaign_id: string
  readonly campaign?: { readonly id: string; readonly name: string }
  readonly targeting?: Record<string, unknown>
  readonly daily_budget?: string
  readonly optimization_goal?: string
  readonly bid_strategy?: string
  readonly bid_amount?: number
  readonly billing_event?: string
  readonly status: string
  readonly promoted_object?: Record<string, unknown>
}

type MetaApiCreative = {
  readonly id: string
  readonly name?: string
  readonly object_story_spec?: {
    readonly link_data?: {
      readonly image_hash?: string
      readonly message?: string
      readonly link?: string
      readonly name?: string
      readonly description?: string
      readonly call_to_action?: {
        readonly type?: string
        readonly value?: { readonly link?: string }
      }
      readonly caption?: string
    }
    readonly video_data?: {
      readonly video_id?: string
      readonly image_hash?: string
      readonly message?: string
      readonly title?: string
      readonly link_description?: string
      readonly call_to_action?: {
        readonly type?: string
        readonly value?: { readonly link?: string }
      }
    }
  }
  readonly image_hash?: string
  readonly url_tags?: string
}

type MetaApiAd = {
  readonly id: string
  readonly name: string
  readonly adset_id: string
  readonly status: string
  readonly creative?: MetaApiCreative
}

// ─── Reverse Maps ──────────────────────────────────────────

// Build reverse objective map: Meta API string -> SDK objective
const REVERSE_OBJECTIVE_MAP: Record<string, Objective> = {}
for (const [sdk, api] of Object.entries(OBJECTIVE_MAP)) {
  // Don't overwrite — 'sales' and 'conversions' both map to OUTCOME_SALES;
  // prefer 'sales' as the canonical key.
  if (!(api in REVERSE_OBJECTIVE_MAP)) {
    REVERSE_OBJECTIVE_MAP[api] = sdk as Objective
  }
}

const BID_STRATEGY_MAP: Record<string, BidStrategy['type']> = {
  'LOWEST_COST_WITHOUT_CAP': 'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP': 'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP': 'COST_CAP',
  'BID_CAP': 'BID_CAP',
  'MINIMUM_ROAS': 'MINIMUM_ROAS',
}

// ─── Helpers ───────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, platformId?: string): Resource {
  return platformId ? { kind, path, properties, platformId } : { kind, path, properties }
}

function mapStatus(apiStatus: string): 'ACTIVE' | 'PAUSED' {
  return apiStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'
}

/**
 * Convert Meta API budget string (cents) to core Budget type.
 * Meta returns budgets as strings in the account currency's smallest unit (cents).
 */
function centsToBudget(cents: string, period: 'daily' | 'lifetime'): Budget {
  const amount = parseInt(cents, 10) / 100
  if (period === 'lifetime') {
    return { amount, currency: 'EUR', period: 'lifetime', endTime: '' }
  }
  return { amount, currency: 'EUR', period: 'daily' }
}

function mapBidStrategy(apiStrategy: string | undefined, bidAmount: number | undefined): BidStrategy {
  if (!apiStrategy) return { type: 'LOWEST_COST_WITHOUT_CAP' }

  const sdkType = BID_STRATEGY_MAP[apiStrategy]
  if (!sdkType) return { type: 'LOWEST_COST_WITHOUT_CAP' }

  switch (sdkType) {
    case 'LOWEST_COST_WITHOUT_CAP':
      return { type: 'LOWEST_COST_WITHOUT_CAP' }
    case 'LOWEST_COST_WITH_BID_CAP':
      return { type: 'LOWEST_COST_WITH_BID_CAP', cap: bidAmount ? bidAmount / 100 : 0 }
    case 'COST_CAP':
      return { type: 'COST_CAP', cap: bidAmount ? bidAmount / 100 : 0 }
    case 'BID_CAP':
      return { type: 'BID_CAP', cap: bidAmount ? bidAmount / 100 : 0 }
    case 'MINIMUM_ROAS':
      return { type: 'MINIMUM_ROAS', floor: bidAmount ? bidAmount / 100 : 0 }
    default:
      return { type: 'LOWEST_COST_WITHOUT_CAP' }
  }
}

// ─── Campaign Normalization ────────────────────────────────

function normalizeCampaign(raw: MetaApiCampaign, slugOverride?: string): Resource {
  const path = slugOverride ?? slugify(raw.name)

  const properties: Record<string, unknown> = {
    name: raw.name,
    status: mapStatus(raw.status),
    objective: raw.objective ?? '',
  }

  if (raw.daily_budget) {
    properties.budget = centsToBudget(raw.daily_budget, 'daily')
  } else if (raw.lifetime_budget) {
    properties.budget = centsToBudget(raw.lifetime_budget, 'lifetime')
  }

  if (raw.special_ad_categories && raw.special_ad_categories.length > 0) {
    properties.specialAdCategories = raw.special_ad_categories
  }

  if (raw.buying_type) {
    properties.buyingType = raw.buying_type
  }

  return resource('campaign', path, properties, raw.id)
}

// ─── Ad Set Normalization ──────────────────────────────────

/** Build a map of campaign ID -> slugified campaign name for path construction */
type CampaignSlugMap = Map<string, string>

function normalizeAdSet(raw: MetaApiAdSet, campaignSlugs: CampaignSlugMap): Resource {
  const campaignSlug = campaignSlugs.get(raw.campaign_id) ?? slugify(raw.campaign?.name ?? raw.campaign_id)
  const adSetSlug = slugify(raw.name)
  const path = `${campaignSlug}/${adSetSlug}`

  const properties: Record<string, unknown> = {
    name: raw.name,
    status: mapStatus(raw.status),
  }

  if (raw.targeting) {
    properties.targeting = raw.targeting
  }

  if (raw.optimization_goal) {
    properties.optimization = raw.optimization_goal
  }

  properties.bidding = mapBidStrategy(raw.bid_strategy, raw.bid_amount)

  if (raw.daily_budget) {
    properties.budget = centsToBudget(raw.daily_budget, 'daily')
  }

  if (raw.billing_event) {
    properties.billingEvent = raw.billing_event
  }

  if (raw.promoted_object) {
    properties.promotedObject = raw.promoted_object
  }

  return resource('adSet', path, properties, raw.id)
}

// ─── Ad + Creative Normalization ───────────────────────────

/** Build a map of ad set ID -> (campaignSlug/adSetSlug) for path construction */
type AdSetPathMap = Map<string, string>

/**
 * Extract creative properties from the object_story_spec.
 * Handles both link_data (image ads) and video_data shapes.
 */
function extractCreativeProps(creative: MetaApiCreative | undefined): Record<string, unknown> {
  if (!creative) return {}

  const props: Record<string, unknown> = {}
  const spec = creative.object_story_spec

  if (spec?.link_data) {
    const ld = spec.link_data
    if (ld.image_hash) props.imageHash = ld.image_hash
    if (ld.name) props.headline = ld.name
    if (ld.message) props.primaryText = ld.message
    if (ld.description) props.description = ld.description
    if (ld.call_to_action?.type) props.cta = ld.call_to_action.type as MetaCTA
    if (ld.link) props.url = ld.link
    if (ld.caption) props.displayLink = ld.caption
  } else if (spec?.video_data) {
    const vd = spec.video_data
    if (vd.video_id) props.videoId = vd.video_id
    if (vd.image_hash) props.imageHash = vd.image_hash
    if (vd.title) props.headline = vd.title
    if (vd.message) props.primaryText = vd.message
    if (vd.link_description) props.description = vd.link_description
    if (vd.call_to_action?.type) props.cta = vd.call_to_action.type as MetaCTA
    if (vd.call_to_action?.value?.link) props.url = vd.call_to_action.value.link
  }

  // Fallback image_hash from creative level (if not in object_story_spec)
  if (!props.imageHash && creative.image_hash) {
    props.imageHash = creative.image_hash
  }

  if (creative.url_tags) {
    props.urlParameters = creative.url_tags
  }

  return props
}

/**
 * Normalize a Meta ad into two Resources: one creative and one ad.
 * This matches the flatten pattern where each ad has a sibling creative resource.
 */
function normalizeAd(raw: MetaApiAd, adSetPaths: AdSetPathMap): Resource[] {
  const adSetPath = adSetPaths.get(raw.adset_id)
  if (!adSetPath) return [] // orphan ad — ad set was filtered out

  const adSlug = slugify(raw.name)
  const adPath = `${adSetPath}/${adSlug}`
  const creativePath = `${adPath}/cr`

  const creativeProps = extractCreativeProps(raw.creative)
  creativeProps.name = raw.creative?.name ?? raw.name

  const resources: Resource[] = []

  // Creative resource
  resources.push(resource('creative', creativePath, creativeProps, raw.creative?.id))

  // Ad resource
  resources.push(resource('ad', adPath, {
    name: raw.name,
    status: mapStatus(raw.status),
    creativePath,
  }, raw.id))

  return resources
}

// ─── Main Fetch ────────────────────────────────────────────

const CAMPAIGN_FIELDS = 'name,objective,status,daily_budget,lifetime_budget,special_ad_categories,buying_type'
const AD_SET_FIELDS = 'name,campaign_id,targeting,daily_budget,optimization_goal,bid_strategy,bid_amount,billing_event,status,promoted_object'
const AD_FIELDS = 'name,adset_id,status,creative{id,name,object_story_spec,image_hash,url_tags}'

/**
 * Fetch all campaigns, ad sets, and ads from a Meta Ads account
 * and normalize them into a flat Resource[] array.
 *
 * The function fetches all three entity types, then normalizes each
 * into Resources with correct parent-child path relationships.
 */
export async function fetchMetaAll(config: MetaProviderConfig, client?: MetaClient): Promise<Resource[]> {
  const metaClient = client ?? createMetaClient(config)
  const accountId = config.accountId

  // Fetch all three entity types
  const [rawCampaigns, rawAdSets, rawAds] = await Promise.all([
    metaClient.graphGetAll<MetaApiCampaign>(`${accountId}/campaigns`, { fields: CAMPAIGN_FIELDS }),
    metaClient.graphGetAll<MetaApiAdSet>(`${accountId}/adsets`, { fields: AD_SET_FIELDS }),
    metaClient.graphGetAll<MetaApiAd>(`${accountId}/ads`, { fields: AD_FIELDS }),
  ])

  // Normalize campaigns and build ID -> slug map, deduplicating collisions
  const slugCounts = new Map<string, number>()
  const campaignSlugs: CampaignSlugMap = new Map()
  for (const c of rawCampaigns) {
    let slug = slugify(c.name)
    const count = slugCounts.get(slug) ?? 0
    slugCounts.set(slug, count + 1)
    if (count > 0) {
      slug = `${slug}-${count + 1}`
    }
    campaignSlugs.set(c.id, slug)
  }

  const campaigns = rawCampaigns.map((raw) => {
    const slug = campaignSlugs.get(raw.id)!
    return normalizeCampaign(raw, slug)
  })

  // Normalize ad sets and build ID -> path map
  const adSets = rawAdSets.map(raw => normalizeAdSet(raw, campaignSlugs))
  const adSetPaths: AdSetPathMap = new Map(
    adSets.map(r => [r.platformId!, r.path]),
  )

  // Normalize ads (each produces a creative + ad resource pair)
  const adResources = rawAds.flatMap(raw => normalizeAd(raw, adSetPaths))

  return [...campaigns, ...adSets, ...adResources]
}
