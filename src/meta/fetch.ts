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

type MetaApiChildAttachment = {
  readonly image_hash?: string
  readonly link?: string
  readonly name?: string
  readonly description?: string
  readonly call_to_action?: {
    readonly type?: string
    readonly value?: { readonly link?: string }
  }
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
      readonly child_attachments?: readonly MetaApiChildAttachment[]
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
    readonly template_data?: Record<string, unknown>
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

// Map legacy Meta API objectives to current OUTCOME_* format
const LEGACY_OBJECTIVE_MAP: Record<string, string> = {
  'LINK_CLICKS': 'OUTCOME_TRAFFIC',
  'CONVERSIONS': 'OUTCOME_SALES',
  'POST_ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
  'BRAND_AWARENESS': 'OUTCOME_AWARENESS',
  'REACH': 'OUTCOME_AWARENESS',
  'VIDEO_VIEWS': 'OUTCOME_AWARENESS',
  'LEAD_GENERATION': 'OUTCOME_LEADS',
  'MESSAGES': 'OUTCOME_ENGAGEMENT',
  'APP_INSTALLS': 'OUTCOME_APP_PROMOTION',
}

/** Normalize objective to current OUTCOME_* format, handling legacy values. */
function normalizeObjective(objective: string | undefined): string {
  if (!objective) return 'OUTCOME_TRAFFIC'
  return LEGACY_OBJECTIVE_MAP[objective] ?? objective
}

const BID_STRATEGY_MAP: Record<string, BidStrategy['type']> = {
  'LOWEST_COST_WITHOUT_CAP': 'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP': 'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP': 'COST_CAP',
  'BID_CAP': 'BID_CAP',
  'MINIMUM_ROAS': 'MINIMUM_ROAS',
}

// ─── Helpers ───────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, platformId?: string, meta?: Record<string, unknown>): Resource {
  const r: Record<string, unknown> = { kind, path, properties }
  if (meta && Object.keys(meta).length > 0) r.meta = meta
  if (platformId) r.platformId = platformId
  return r as Resource
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
    objective: normalizeObjective(raw.objective),
  }

  if (raw.daily_budget) {
    properties.budget = centsToBudget(raw.daily_budget, 'daily')
  } else if (raw.lifetime_budget) {
    properties.budget = centsToBudget(raw.lifetime_budget, 'lifetime')
  }

  if (raw.special_ad_categories && raw.special_ad_categories.length > 0) {
    properties.specialAdCategories = raw.special_ad_categories
  }

  // AUCTION is the default buying type — only emit non-default values
  if (raw.buying_type && raw.buying_type !== 'AUCTION') {
    properties.buyingType = raw.buying_type
  }

  return resource('campaign', path, properties, raw.id)
}

// ─── Targeting Normalization ──────────────────────────────

/**
 * Convert Meta API targeting (raw Graph API format) to SDK MetaTargeting format.
 * Maps geo_locations, age_min/max, flexible_spec, custom_audiences, etc.
 */
function normalizeTargeting(raw: Record<string, unknown>): Record<string, unknown> {
  const targeting: Record<string, unknown> = {}

  // Geo
  const geoLocations = raw.geo_locations as Record<string, unknown> | undefined
  if (geoLocations) {
    const countries = geoLocations.countries as string[] | undefined
    if (countries && countries.length > 0) {
      targeting.geo = [{ type: 'geo', countries }]
    }
  }

  // Age
  const ageMin = raw.age_min as number | undefined
  const ageMax = raw.age_max as number | undefined
  if (ageMin !== undefined || ageMax !== undefined) {
    targeting.age = { min: ageMin ?? 18, max: ageMax ?? 65 }
  }

  // Custom audiences
  const customAudiences = raw.custom_audiences as Array<{ id: string; name: string }> | undefined
  if (customAudiences && customAudiences.length > 0) {
    targeting.customAudiences = customAudiences.map((a) => a.name)
  }

  // Excluded custom audiences
  const excludedAudiences = raw.excluded_custom_audiences as Array<{ id: string; name: string }> | undefined
  if (excludedAudiences && excludedAudiences.length > 0) {
    targeting.excludedAudiences = excludedAudiences.map((a) => a.name)
  }

  // Interests (from flexible_spec)
  const flexibleSpec = raw.flexible_spec as Array<Record<string, unknown>> | undefined
  if (flexibleSpec) {
    const allInterests: Array<{ id: string; name: string }> = []
    for (const spec of flexibleSpec) {
      const interests = spec.interests as Array<{ id: string; name: string }> | undefined
      if (interests) {
        allInterests.push(...interests)
      }
    }
    if (allInterests.length > 0) {
      targeting.interests = allInterests
    }

    // Behaviors (from flexible_spec)
    const allBehaviors: Array<{ id: string; name: string }> = []
    for (const spec of flexibleSpec) {
      const behaviors = spec.behaviors as Array<{ id: string; name: string }> | undefined
      if (behaviors) allBehaviors.push(...behaviors)
    }
    if (allBehaviors.length > 0) {
      targeting.behaviors = allBehaviors
    }

    // Demographics (from flexible_spec)
    const allDemographics: Array<{ id: string; name: string }> = []
    for (const spec of flexibleSpec) {
      const demographics = spec.demographics as Array<{ id: string; name: string }> | undefined
      if (demographics) allDemographics.push(...demographics)
    }
    if (allDemographics.length > 0) {
      targeting.demographics = allDemographics
    }
  }

  // Exclusions (from exclusions spec — separate from flexible_spec)
  const exclusions = raw.exclusions as Record<string, unknown> | undefined
  if (exclusions) {
    const excludedInterests = exclusions.interests as Array<{ id: string; name: string }> | undefined
    if (excludedInterests && excludedInterests.length > 0) {
      targeting.excludedInterests = excludedInterests
    }
    const excludedBehaviors = exclusions.behaviors as Array<{ id: string; name: string }> | undefined
    if (excludedBehaviors && excludedBehaviors.length > 0) {
      targeting.excludedBehaviors = excludedBehaviors
    }
  }

  // Genders (Meta API: 1=male, 2=female; absence or [0]=all)
  const genders = raw.genders as number[] | undefined
  if (genders && genders.length > 0) {
    const mapped = genders.map((g) => g === 1 ? 'male' as const : g === 2 ? 'female' as const : 'all' as const)
    if (!mapped.includes('all')) {
      targeting.genders = mapped
    }
  }

  // Locales
  const locales = raw.locales as number[] | undefined
  if (locales && locales.length > 0) {
    targeting.locales = locales
  }

  // Connections
  const connections = raw.connections as Array<{ id: string }> | undefined
  if (connections && connections.length > 0) {
    targeting.connections = connections.map((c) => ({ type: 'page' as const, id: c.id }))
  }

  // Excluded connections
  const excludedConnections = raw.excluded_connections as Array<{ id: string }> | undefined
  if (excludedConnections && excludedConnections.length > 0) {
    targeting.excludedConnections = excludedConnections.map((c) => ({ type: 'page' as const, id: c.id }))
  }

  // Friends of connections
  const friendsOfConnections = raw.friends_of_connections as Array<{ id: string }> | undefined
  if (friendsOfConnections && friendsOfConnections.length > 0) {
    targeting.friendsOfConnections = friendsOfConnections.map((c) => ({ type: 'page' as const, id: c.id }))
  }

  // Advantage+ audience expansion
  const targetingOptimization = raw.targeting_optimization as string | undefined
  if (targetingOptimization === 'expansion_all') {
    targeting.advantageAudience = true
  }

  // Advantage+ detailed targeting
  const targetingRelaxation = raw.targeting_relaxation as Record<string, unknown> | undefined
  if (targetingRelaxation) {
    const lookalikeExpansion = targetingRelaxation.lookalike as number | undefined
    if (lookalikeExpansion === 1) {
      targeting.advantageDetailedTargeting = true
    }
  }

  return targeting
}

/**
 * Extract placements from raw API targeting.
 * Returns 'automatic' if no specific platforms are set, or the SDK format.
 */
function normalizePlacements(raw: Record<string, unknown>): unknown {
  const platforms = raw.publisher_platforms as string[] | undefined
  if (!platforms || platforms.length === 0) return 'automatic'

  const facebookPositions = raw.facebook_positions as string[] | undefined
  const instagramPositions = raw.instagram_positions as string[] | undefined
  const messengerPositions = raw.messenger_positions as string[] | undefined
  const audienceNetworkPositions = raw.audience_network_positions as string[] | undefined

  return {
    platforms,
    ...(facebookPositions && { facebookPositions }),
    ...(instagramPositions && { instagramPositions }),
    ...(messengerPositions && { messengerPositions }),
    ...(audienceNetworkPositions && { audienceNetworkPositions }),
  }
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
    properties.targeting = normalizeTargeting(raw.targeting)
    // Extract placements from targeting (Meta stores them there)
    const placements = normalizePlacements(raw.targeting)
    if (placements !== 'automatic') {
      properties.placements = placements
    }
  }

  if (raw.optimization_goal) {
    properties.optimization = raw.optimization_goal
  }

  properties.bidding = mapBidStrategy(raw.bid_strategy, raw.bid_amount)

  if (raw.daily_budget) {
    properties.budget = centsToBudget(raw.daily_budget, 'daily')
  }

  // billingEvent and promotedObject are API-only fields that the SDK
  // doesn't model — omit them for clean roundtripping

  return resource('adSet', path, properties, raw.id)
}

// ─── Ad + Creative Normalization ───────────────────────────

/** Build a map of ad set ID -> (campaignSlug/adSetSlug) for path construction */
type AdSetPathMap = Map<string, string>

/**
 * Extract creative properties and meta from the object_story_spec.
 * Handles both link_data (image ads) and video_data shapes.
 *
 * API identifiers (imageHash, videoId) go in meta — they're platform-internal
 * references, not user-declared campaign settings.
 */
function extractCreativeProps(creative: MetaApiCreative | undefined): { properties: Record<string, unknown>; meta: Record<string, unknown> } {
  if (!creative) return { properties: {}, meta: {} }

  const props: Record<string, unknown> = {}
  const meta: Record<string, unknown> = {}
  const spec = creative.object_story_spec

  if (spec?.video_data) {
    const vd = spec.video_data
    props.format = 'video'
    // Always emit headline and primaryText (even as empty string) to match
    // flatten which defaults these to '' via the image()/video() builders
    props.headline = vd.title ?? ''
    props.primaryText = vd.message ?? ''
    if (vd.link_description) props.description = vd.link_description
    if (vd.call_to_action?.type) props.cta = vd.call_to_action.type as MetaCTA
    if (vd.call_to_action?.value?.link) props.url = vd.call_to_action.value.link
    // Platform-internal identifiers go in meta
    if (vd.video_id) meta.videoId = vd.video_id
    if (vd.image_hash) meta.imageHash = vd.image_hash
  } else if (spec?.link_data?.child_attachments && spec.link_data.child_attachments.length > 0) {
    // Carousel ads: link_data with child_attachments array
    const ld = spec.link_data
    props.format = 'carousel'
    props.primaryText = ld.message ?? ''
    if (ld.call_to_action?.type) props.cta = ld.call_to_action.type as MetaCTA
    if (ld.link) props.url = ld.link
    props.cards = ld.child_attachments!.map((child: MetaApiChildAttachment) => {
      const card: Record<string, unknown> = {
        headline: child.name ?? '',
        url: child.link ?? '',
      }
      if (child.description) card.description = child.description
      if (child.image_hash) card.image = `hash:${child.image_hash}`
      return card
    })
  } else if (spec?.template_data) {
    // Collection ads use Instant Experience IDs which are complex to model.
    // Capture the shape for reference but mark it as needing manual config.
    props.format = 'collection'
    props.primaryText = ''
    props.headline = ''
    props.instantExperience = 'unknown'
    meta.templateData = spec.template_data
  } else if (spec?.link_data) {
    const ld = spec.link_data
    props.format = 'image'
    // Always emit headline and primaryText (even as empty string) to match
    // flatten which defaults these to '' via the image()/video() builders
    props.headline = ld.name ?? ''
    props.primaryText = ld.message ?? ''
    if (ld.description) props.description = ld.description
    if (ld.call_to_action?.type) props.cta = ld.call_to_action.type as MetaCTA
    if (ld.link) props.url = ld.link
    if (ld.caption) props.displayLink = ld.caption
    // Platform-internal identifier goes in meta
    if (ld.image_hash) meta.imageHash = ld.image_hash
  }
  // else: boosted posts and other non-standard creatives have no
  // object_story_spec.link_data or video_data. We intentionally omit
  // format, headline, primaryText, cta, and url — these fields don't
  // exist on the API side, so including them (even as empty strings)
  // would produce a false diff.

  // Fallback image_hash from creative level
  if (!meta.imageHash && creative.image_hash) {
    meta.imageHash = creative.image_hash
  }

  if (creative.url_tags) {
    props.urlParameters = creative.url_tags
  }

  return { properties: props, meta }
}

/**
 * Normalize a Meta ad into two Resources: one creative and one ad.
 * This matches the flatten pattern where each ad has a sibling creative resource.
 */
function normalizeAd(raw: MetaApiAd, adSetPaths: AdSetPathMap): Resource[] {
  const adSetPath = adSetPaths.get(raw.adset_id)
  if (!adSetPath) return [] // orphan ad — ad set was filtered out

  const { properties: creativeProps, meta: creativeMeta } = extractCreativeProps(raw.creative)

  // Use the creative name as the canonical name for both creative and ad.
  // This matches flatten behavior where the ad name is derived from the creative
  // (via resolveAdName -> creative.name). Using the raw ad name would produce
  // different paths since Meta ad names and creative names are independent.
  const canonicalName = raw.creative?.name ?? raw.name
  creativeProps.name = canonicalName

  const adSlug = slugify(canonicalName)
  const adPath = `${adSetPath}/${adSlug}`
  const creativePath = `${adPath}/cr`

  const resources: Resource[] = []

  // Creative resource
  resources.push(resource('creative', creativePath, creativeProps, raw.creative?.id, creativeMeta))

  // Ad resource — creativePath is internal (used by apply to find creative ID), not an API field
  resources.push(resource('ad', adPath, {
    name: canonicalName,
    status: mapStatus(raw.status),
  }, raw.id, { creativePath }))

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

  // Sort campaigns by ID before deduplicating — ensures deterministic slug
  // assignment when multiple campaigns share the same name. The oldest campaign
  // (lowest ID) gets the plain slug; newer duplicates get -2, -3, etc.
  // This matches the flatten side where file discovery order (alphabetical)
  // produces the same assignment: base file first, -2 file second.
  const sortedCampaigns = [...rawCampaigns].sort((a, b) => a.id.localeCompare(b.id))

  // Normalize campaigns and build ID -> slug map, deduplicating collisions
  const slugCounts = new Map<string, number>()
  const campaignSlugs: CampaignSlugMap = new Map()
  for (const c of sortedCampaigns) {
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
