// Reddit Ads fetch module
// Fetches campaigns, ad groups, and ads from the Reddit Ads API
// and normalizes them into flat Resource[] arrays matching flatten output format

import type { Resource, ResourceKind, Budget } from '../core/types.ts'
import type { RedditClient } from './api.ts'
import { createRedditClient } from './api.ts'
import { slugify } from '../core/flatten.ts'
import { REVERSE_OBJECTIVE_MAP, REVERSE_STATUS_MAP } from './constants.ts'
import type { RedditProviderConfig, RedditTargetingRule } from './types.ts'

// ─── Reddit API Response Types ───────────────────────────

type RedditApiCampaign = {
  readonly id: string
  readonly name: string
  readonly objective: string
  readonly configured_status: string
  readonly effective_status?: string
  readonly daily_budget_micro?: number
  readonly lifetime_budget_micro?: number
  readonly currency?: string
  readonly spend_cap_micro?: number
}

type RedditApiTargeting = {
  readonly subreddits?: readonly string[]
  readonly interests?: readonly string[]
  readonly keywords?: readonly string[]
  readonly geo?: { readonly locations: readonly string[] }
  readonly age?: { readonly min: number; readonly max: number }
  readonly gender?: string
  readonly device_types?: readonly string[]
  readonly os?: readonly string[]
  readonly custom_audience_id?: string
  readonly lookalike?: {
    readonly source_id: string
    readonly config?: { readonly country?: string; readonly ratio?: number }
  }
  readonly expansion?: boolean
}

type RedditApiAdGroup = {
  readonly id: string
  readonly name: string
  readonly campaign_id: string
  readonly configured_status: string
  readonly optimization_goal?: string
  readonly bid_strategy?: string
  readonly bid_micro?: number
  readonly targeting?: RedditApiTargeting
  readonly placement?: string
  readonly start_time?: string
  readonly end_time?: string
}

type RedditApiCarouselCard = {
  readonly image_url: string
  readonly headline: string
  readonly url: string
  readonly caption?: string
}

type RedditApiPost = {
  readonly type: string
  readonly headline?: string
  readonly body?: string
  readonly click_url?: string
  readonly cta?: string
  readonly thumbnail_url?: string
  readonly media_url?: string
  readonly cards?: readonly RedditApiCarouselCard[]
  // Freeform
  readonly images?: readonly string[]
  readonly videos?: readonly string[]
  // Product
  readonly catalog_id?: string
}

type RedditApiAd = {
  readonly id: string
  readonly name: string
  readonly ad_group_id: string
  readonly configured_status: string
  readonly post?: RedditApiPost
}

// ─── Helpers ──────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, platformId: string, meta?: Record<string, unknown>): Resource {
  const r: Record<string, unknown> = { kind, path, properties, platformId }
  if (meta && Object.keys(meta).length > 0) r.meta = meta
  return r as Resource
}

function mapStatus(configuredStatus: string): 'ACTIVE' | 'PAUSED' {
  return configuredStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'
}

/** Convert micros to Budget. Reddit reports budgets in micros (1 dollar = 1,000,000 micros). */
function microsToBudget(micros: number, period: 'daily' | 'lifetime', currency: string): Budget {
  const amount = micros / 1_000_000
  if (period === 'lifetime') {
    return { amount, currency: currency as 'EUR' | 'USD', period: 'lifetime', endTime: '' }
  }
  return { amount, currency: currency as 'EUR' | 'USD', period }
}

// ─── Targeting Normalization ─────────────────────────────

/** Convert Reddit API targeting to SDK RedditTargetingRule[]. */
function normalizeTargeting(raw: RedditApiTargeting): RedditTargetingRule[] {
  const rules: RedditTargetingRule[] = []

  if (raw.subreddits && raw.subreddits.length > 0) {
    rules.push({ _type: 'subreddits', names: [...raw.subreddits] })
  }

  if (raw.interests && raw.interests.length > 0) {
    rules.push({ _type: 'interests', names: [...raw.interests] })
  }

  if (raw.keywords && raw.keywords.length > 0) {
    rules.push({ _type: 'keywords', terms: [...raw.keywords] })
  }

  if (raw.geo?.locations && raw.geo.locations.length > 0) {
    rules.push({ _type: 'geo', locations: [...raw.geo.locations] })
  }

  if (raw.age) {
    rules.push({ _type: 'age', min: raw.age.min, max: raw.age.max })
  }

  if (raw.gender && raw.gender !== 'ALL') {
    rules.push({ _type: 'gender', value: raw.gender.toLowerCase() as 'male' | 'female' })
  } else if (raw.gender === 'ALL') {
    rules.push({ _type: 'gender', value: 'all' })
  }

  if (raw.device_types && raw.device_types.length > 0) {
    rules.push({ _type: 'device', types: raw.device_types.map(t => t.toLowerCase() as 'mobile' | 'desktop') })
  }

  if (raw.os && raw.os.length > 0) {
    rules.push({ _type: 'os', types: raw.os.map(t => t.toLowerCase() as 'ios' | 'android' | 'windows' | 'macos') })
  }

  if (raw.custom_audience_id) {
    rules.push({ _type: 'customAudience', id: raw.custom_audience_id })
  }

  if (raw.lookalike) {
    rules.push({
      _type: 'lookalike',
      sourceId: raw.lookalike.source_id,
      ...(raw.lookalike.config && { config: raw.lookalike.config }),
    })
  }

  if (raw.expansion !== undefined) {
    rules.push({ _type: 'expansion', enabled: raw.expansion })
  }

  return rules
}

/** Map Reddit API bid strategy + bid_micro to SDK RedditBidStrategy. */
function normalizeBid(strategy: string | undefined, bidMicro: number | undefined): Record<string, unknown> | undefined {
  if (!strategy) return undefined

  switch (strategy) {
    case 'LOWEST_COST':
      return { type: 'LOWEST_COST' }
    case 'COST_CAP':
      return { type: 'COST_CAP', amount: bidMicro ? bidMicro / 1_000_000 : 0 }
    case 'MANUAL_BID':
      return { type: 'MANUAL_BID', amount: bidMicro ? bidMicro / 1_000_000 : 0 }
    default:
      return { type: strategy }
  }
}

// ─── Campaign Normalization ──────────────────────────────

type CampaignSlugMap = Map<string, string>

function normalizeCampaign(raw: RedditApiCampaign, slugOverride?: string): Resource {
  const path = slugOverride ?? slugify(raw.name)
  const currency = raw.currency ?? 'USD'

  const properties: Record<string, unknown> = {
    name: raw.name,
    objective: raw.objective,
    status: mapStatus(raw.configured_status),
  }

  if (raw.daily_budget_micro) {
    properties.budget = microsToBudget(raw.daily_budget_micro, 'daily', currency)
  } else if (raw.lifetime_budget_micro) {
    properties.budget = microsToBudget(raw.lifetime_budget_micro, 'lifetime', currency)
  }

  if (raw.spend_cap_micro) {
    properties.spendCap = raw.spend_cap_micro / 1_000_000
  }

  return resource('campaign', path, properties, raw.id)
}

// ─── Ad Group Normalization ──────────────────────────────

type AdGroupPathMap = Map<string, string>

function normalizeAdGroup(raw: RedditApiAdGroup, campaignSlugs: CampaignSlugMap): Resource | null {
  const campaignSlug = campaignSlugs.get(raw.campaign_id)
  if (!campaignSlug) return null // orphan — campaign was filtered out

  const adGroupSlug = slugify(raw.name)
  const path = `${campaignSlug}/${adGroupSlug}`

  const properties: Record<string, unknown> = {
    name: raw.name,
    status: mapStatus(raw.configured_status),
  }

  if (raw.targeting) {
    properties.targeting = normalizeTargeting(raw.targeting)
  }

  if (raw.optimization_goal) {
    properties.optimization = raw.optimization_goal
  }

  const bid = normalizeBid(raw.bid_strategy, raw.bid_micro)
  if (bid) {
    properties.bid = bid
  }

  if (raw.placement) {
    properties.placement = raw.placement
  }

  if (raw.start_time || raw.end_time) {
    properties.schedule = {
      start: raw.start_time!,
      ...(raw.end_time && { end: raw.end_time }),
    }
  }

  return resource('adGroup', path, properties, raw.id)
}

// ─── Ad Normalization ────────────────────────────────────

function normalizeAdPost(post: RedditApiPost): Record<string, unknown> {
  const type = post.type.toLowerCase()

  switch (type) {
    case 'image':
      return {
        format: 'image',
        headline: post.headline ?? '',
        clickUrl: post.click_url ?? '',
        ...(post.body !== undefined && { body: post.body }),
        ...(post.cta !== undefined && { cta: post.cta }),
        ...(post.thumbnail_url !== undefined && { thumbnail: post.thumbnail_url }),
      }

    case 'video':
      return {
        format: 'video',
        headline: post.headline ?? '',
        clickUrl: post.click_url ?? '',
        ...(post.body !== undefined && { body: post.body }),
        ...(post.cta !== undefined && { cta: post.cta }),
        ...(post.thumbnail_url !== undefined && { thumbnail: post.thumbnail_url }),
      }

    case 'carousel':
      return {
        format: 'carousel',
        cards: (post.cards ?? []).map(card => ({
          image: card.image_url,
          headline: card.headline,
          url: card.url,
          ...(card.caption !== undefined && { caption: card.caption }),
        })),
        ...(post.click_url !== undefined && { clickUrl: post.click_url }),
        ...(post.cta !== undefined && { cta: post.cta }),
      }

    case 'freeform':
      return {
        format: 'freeform',
        headline: post.headline ?? '',
        body: post.body ?? '',
        ...(post.images !== undefined && { images: post.images }),
        ...(post.videos !== undefined && { videos: post.videos }),
        ...(post.click_url !== undefined && { clickUrl: post.click_url }),
        ...(post.cta !== undefined && { cta: post.cta }),
      }

    case 'product':
      return {
        format: 'product',
        catalogId: post.catalog_id ?? '',
        headline: post.headline ?? '',
        ...(post.click_url !== undefined && { clickUrl: post.click_url }),
        ...(post.cta !== undefined && { cta: post.cta }),
      }

    default:
      return { format: type, headline: post.headline ?? '' }
  }
}

function normalizeAd(raw: RedditApiAd, adGroupPaths: AdGroupPathMap): Resource | null {
  const adGroupPath = adGroupPaths.get(raw.ad_group_id)
  if (!adGroupPath) return null // orphan — ad group was filtered out

  const adSlug = slugify(raw.name)
  const adPath = `${adGroupPath}/${adSlug}`

  const properties: Record<string, unknown> = {
    status: mapStatus(raw.configured_status),
    ...(raw.post ? normalizeAdPost(raw.post) : {}),
  }

  // Store media URLs in meta — they're platform-internal references
  const meta: Record<string, unknown> = {}
  if (raw.post?.media_url) {
    meta.mediaUrl = raw.post.media_url
  }
  if (raw.post?.thumbnail_url) {
    meta.thumbnailUrl = raw.post.thumbnail_url
  }

  return resource('ad', adPath, properties, raw.id, meta)
}

// ─── Main Fetch ──────────────────────────────────────────

/**
 * Fetch all campaigns, ad groups, and ads from a Reddit Ads account
 * and normalize them into a flat Resource[] array.
 *
 * Uses the same normalization format as flattenReddit() to enable
 * zero-diff round-trips: import -> plan = 0 changes.
 */
export async function fetchRedditAll(config: RedditProviderConfig, client?: RedditClient): Promise<Resource[]> {
  const redditClient = client ?? createRedditClient(config)
  const accountId = config.accountId

  // Fetch all three entity types in parallel
  const [rawCampaigns, rawAdGroups, rawAds] = await Promise.all([
    redditClient.fetchAll<RedditApiCampaign>(`accounts/${accountId}/campaigns`),
    redditClient.fetchAll<RedditApiAdGroup>(`accounts/${accountId}/ad_groups`),
    redditClient.fetchAll<RedditApiAd>(`accounts/${accountId}/ads`),
  ])

  // Sort campaigns by ID for deterministic slug deduplication
  const sortedCampaigns = [...rawCampaigns].sort((a, b) => a.id.localeCompare(b.id))

  // Normalize campaigns and build ID -> slug map
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

  const campaigns = sortedCampaigns.map(raw => {
    const slug = campaignSlugs.get(raw.id)!
    return normalizeCampaign(raw, slug)
  })

  // Normalize ad groups and build ID -> path map
  const adGroups: Resource[] = []
  const adGroupPaths: AdGroupPathMap = new Map()
  for (const raw of rawAdGroups) {
    const r = normalizeAdGroup(raw, campaignSlugs)
    if (r) {
      adGroups.push(r)
      adGroupPaths.set(raw.id, r.path)
    }
  }

  // Normalize ads
  const ads: Resource[] = []
  for (const raw of rawAds) {
    const r = normalizeAd(raw, adGroupPaths)
    if (r) ads.push(r)
  }

  return [...campaigns, ...adGroups, ...ads]
}
