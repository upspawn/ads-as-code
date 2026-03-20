// Reddit Ads flatten module
// Converts a RedditCampaign tree into a flat Resource[] array

import type { Resource, ResourceKind } from '../core/types.ts'
import { slugify } from '../core/flatten.ts'
import { OBJECTIVE_MAP, STATUS_MAP, DEFAULT_OPTIMIZATION } from './constants.ts'
import type { RedditCampaign, RedditAdGroup, RedditAd, Objective } from './types.ts'

// ─── Helpers ──────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, meta?: Record<string, unknown>): Resource {
  if (meta && Object.keys(meta).length > 0) {
    return { kind, path, properties, meta }
  }
  return { kind, path, properties }
}

/** Map SDK status ('enabled'/'paused') to API format ('ACTIVE'/'PAUSED'). */
function mapStatus(status: 'enabled' | 'paused' | undefined): string {
  if (!status) return 'PAUSED'
  return STATUS_MAP[status] ?? 'PAUSED'
}

/**
 * Derive an ad name from its content.
 * - image/video: strip dir and extension from filePath
 * - carousel: content-hash from card data for stable identity
 * - freeform/product: slugify the headline
 */
function deriveAdName(ad: RedditAd): string {
  switch (ad.format) {
    case 'image':
    case 'video': {
      const base = ad.filePath.split('/').pop() ?? ad.filePath
      const dotIndex = base.lastIndexOf('.')
      return dotIndex > 0 ? base.slice(0, dotIndex) : base
    }
    case 'carousel': {
      // Content hash for stable identity — same cards always produce same name
      const content = ad.cards.map(c => `${c.headline}|${c.url}`).join(';')
      const hash = simpleHash(content)
      return `carousel-${hash}`
    }
    case 'freeform':
      return ad.config.headline
    case 'product':
      return ad.config.headline
  }
}

/** Simple deterministic hash for carousel identity. */
function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * Build ad properties from a RedditAd.
 * Returns { properties, meta } where meta holds SDK-internal data (file paths).
 */
function buildAdProperties(ad: RedditAd): { properties: Record<string, unknown>; meta: Record<string, unknown> } {
  const meta: Record<string, unknown> = {}

  switch (ad.format) {
    case 'image': {
      meta.filePath = ad.filePath
      return {
        properties: {
          format: 'image',
          headline: ad.config.headline,
          clickUrl: ad.config.clickUrl,
          ...(ad.config.body !== undefined && { body: ad.config.body }),
          ...(ad.config.cta !== undefined && { cta: ad.config.cta }),
          ...(ad.config.thumbnail !== undefined && { thumbnail: ad.config.thumbnail }),
        },
        meta,
      }
    }
    case 'video': {
      meta.filePath = ad.filePath
      return {
        properties: {
          format: 'video',
          headline: ad.config.headline,
          clickUrl: ad.config.clickUrl,
          ...(ad.config.body !== undefined && { body: ad.config.body }),
          ...(ad.config.cta !== undefined && { cta: ad.config.cta }),
          ...(ad.config.thumbnail !== undefined && { thumbnail: ad.config.thumbnail }),
        },
        meta,
      }
    }
    case 'carousel': {
      return {
        properties: {
          format: 'carousel',
          cards: ad.cards,
          ...(ad.config.clickUrl !== undefined && { clickUrl: ad.config.clickUrl }),
          ...(ad.config.cta !== undefined && { cta: ad.config.cta }),
        },
        meta,
      }
    }
    case 'freeform': {
      return {
        properties: {
          format: 'freeform',
          headline: ad.config.headline,
          body: ad.config.body,
          ...(ad.config.images !== undefined && { images: ad.config.images }),
          ...(ad.config.videos !== undefined && { videos: ad.config.videos }),
          ...(ad.config.clickUrl !== undefined && { clickUrl: ad.config.clickUrl }),
          ...(ad.config.cta !== undefined && { cta: ad.config.cta }),
        },
        meta,
      }
    }
    case 'product': {
      return {
        properties: {
          format: 'product',
          catalogId: ad.config.catalogId,
          headline: ad.config.headline,
          ...(ad.config.clickUrl !== undefined && { clickUrl: ad.config.clickUrl }),
          ...(ad.config.cta !== undefined && { cta: ad.config.cta }),
        },
        meta,
      }
    }
  }
}

// ─── Flatten ──────────────────────────────────────────────

/** Flatten a RedditCampaign tree into a flat list of Resource objects. */
export function flattenReddit(campaign: RedditCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignSlug = slugify(campaign.name)
  const objective = campaign.kind

  // Track campaign-level defaults
  const campaignDefaults: string[] = []
  const campaignStatus = mapStatus(campaign.config.status)
  if (!campaign.config.status) campaignDefaults.push('status')

  // 1. Campaign resource
  resources.push(resource('campaign', campaignSlug, {
    name: campaign.name,
    objective: OBJECTIVE_MAP[objective],
    status: campaignStatus,
    ...(campaign.config.budget !== undefined && { budget: campaign.config.budget }),
    ...(campaign.config.spendCap !== undefined && { spendCap: campaign.config.spendCap }),
  }, campaignDefaults.length > 0 ? { _defaults: campaignDefaults } : undefined))

  // 2. Ad groups + ads
  for (const adGroup of campaign.adGroups) {
    flattenAdGroup(resources, campaignSlug, objective, adGroup)
  }

  return resources
}

function flattenAdGroup(
  resources: Resource[],
  campaignSlug: string,
  objective: Objective,
  adGroup: RedditAdGroup<Objective>,
): void {
  const adGroupSlug = slugify(adGroup.name)
  const adGroupPath = `${campaignSlug}/${adGroupSlug}`

  // Resolve defaults
  const adGroupDefaults: string[] = []

  const adGroupStatus = mapStatus(adGroup.config.status)
  if (!adGroup.config.status) adGroupDefaults.push('status')

  const optimization = adGroup.config.optimizationGoal ?? DEFAULT_OPTIMIZATION[objective]
  if (!adGroup.config.optimizationGoal) adGroupDefaults.push('optimization')

  resources.push(resource('adGroup', adGroupPath, {
    name: adGroup.name,
    status: adGroupStatus,
    targeting: adGroup.config.targeting,
    optimization,
    ...(adGroup.config.bid !== undefined && { bid: adGroup.config.bid }),
    ...(adGroup.config.placement !== undefined && { placement: adGroup.config.placement }),
    ...(adGroup.config.schedule !== undefined && { schedule: adGroup.config.schedule }),
  }, adGroupDefaults.length > 0 ? { _defaults: adGroupDefaults } : undefined))

  // 3. Ads
  for (const ad of adGroup.ads) {
    const adName = deriveAdName(ad)
    const adSlug = slugify(adName)
    const adPath = `${adGroupPath}/${adSlug}`

    const { properties, meta } = buildAdProperties(ad)

    resources.push(resource('ad', adPath, properties, Object.keys(meta).length > 0 ? meta : undefined))
  }
}
