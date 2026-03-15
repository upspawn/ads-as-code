import type { Resource, ResourceKind, Budget } from '../core/types.ts'
import { slugify } from '../core/flatten.ts'
import { DEFAULT_OPTIMIZATION, OBJECTIVE_MAP } from './constants.ts'
import type { MetaCampaign } from './index.ts'
import type {
  Objective,
  BidStrategy,
  MetaTargeting,
  MetaPlacements,
  MetaCreative,
  MetaCTA,
  AdSetConfig,
  AdSetContent,
  MetaCampaignConfig,
  AdSetSchedule,
  ConversionConfig,
  DSAConfig,
  PromotedObject,
  SpecialAdCategory,
} from './types.ts'

// ─── Helpers ──────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>): Resource {
  return { kind, path, properties }
}

/**
 * Derive an ad name from its media file path.
 * Strips directory and extension: `./assets/hero-sign-up.png` -> `hero-sign-up`
 */
function nameFromFile(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  const dotIndex = base.lastIndexOf('.')
  return dotIndex > 0 ? base.slice(0, dotIndex) : base
}

/**
 * Get the primary media file path from a creative.
 * Used for name derivation and file resolution.
 */
function mediaPath(creative: MetaCreative): string | undefined {
  switch (creative.format) {
    case 'image': return creative.image
    case 'video': return creative.video
    case 'carousel': return undefined
    case 'collection': return creative.coverImage ?? creative.coverVideo
  }
}

// ─── Default Resolution ──────────────────────────────────

const DEFAULT_BIDDING: BidStrategy = { type: 'LOWEST_COST_WITHOUT_CAP' }
const DEFAULT_PLACEMENTS: MetaPlacements = 'automatic'
const DEFAULT_STATUS = 'PAUSED' as const

/**
 * Resolve a creative's effective name.
 * Priority: explicit name > derived from filename > throw
 */
function resolveAdName(creative: MetaCreative): string {
  if (creative.name) return creative.name
  const file = mediaPath(creative)
  if (file) return nameFromFile(file)
  // Carousels without a name need one explicitly
  throw new Error(
    `Ad creative (format: ${creative.format}) has no name and no file path to derive one from. ` +
    `Set the "name" field explicitly.`
  )
}

/**
 * Resolve url for an ad, falling back to ad set content defaults.
 * Throws a validation error if neither is set.
 */
function resolveUrl(creative: MetaCreative, content: AdSetContent, _adSetName: string): { url: string; defaulted: boolean } {
  if (creative.format === 'collection') {
    // Collections don't need a url (they use instantExperience)
    return { url: '', defaulted: false }
  }
  const adUrl = 'url' in creative ? creative.url : undefined
  if (adUrl) return { url: adUrl, defaulted: false }
  if (content.url) return { url: content.url, defaulted: true }
  // Boosted posts and some ad formats don't have URLs
  return { url: '', defaulted: true }
}

/**
 * Resolve cta for an ad, falling back to ad set content defaults.
 * Throws a validation error if neither is set.
 */
function resolveCta(creative: MetaCreative, content: AdSetContent, _adSetName: string): { cta: MetaCTA; defaulted: boolean } {
  if (creative.format === 'collection') {
    // Collections don't use a CTA button
    return { cta: 'NO_BUTTON', defaulted: false }
  }
  const adCta = 'cta' in creative ? creative.cta : undefined
  if (adCta) return { cta: adCta, defaulted: false }
  if (content.cta) return { cta: content.cta, defaulted: true }
  // Boosted posts and some ad formats don't have CTAs
  return { cta: 'NO_BUTTON', defaulted: true }
}

// ─── Flatten ─────────────────────────────────────────────

/** Flatten a MetaCampaign tree into a flat list of Resource objects. */
export function flattenMeta(campaign: MetaCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignSlug = slugify(campaign.name)
  const objective = campaign.kind

  // Track which campaign-level fields were defaulted
  const campaignDefaults: string[] = []
  const campaignStatus = campaign.config.status ?? DEFAULT_STATUS
  if (!campaign.config.status) campaignDefaults.push('status')

  // 1. Campaign resource
  resources.push(resource('campaign', campaignSlug, {
    name: campaign.name,
    objective: OBJECTIVE_MAP[objective],
    status: campaignStatus,
    ...(campaign.config.budget !== undefined && { budget: campaign.config.budget }),
    ...(campaign.config.spendCap !== undefined && { spendCap: campaign.config.spendCap }),
    ...(campaign.config.specialAdCategories !== undefined && { specialAdCategories: campaign.config.specialAdCategories }),
    ...(campaign.config.buyingType !== undefined && { buyingType: campaign.config.buyingType }),
    ...(campaignDefaults.length > 0 && { _defaults: campaignDefaults }),
  }))

  // 2. Ad sets + children
  for (const adSet of campaign.adSets) {
    const adSetSlug = slugify(adSet.name)
    const adSetPath = `${campaignSlug}/${adSetSlug}`

    // Resolve ad set defaults
    const adSetDefaults: string[] = []

    const optimization = adSet.config.optimization ?? DEFAULT_OPTIMIZATION[objective]
    if (!adSet.config.optimization) adSetDefaults.push('optimization')

    const bidding = adSet.config.bidding ?? DEFAULT_BIDDING
    if (!adSet.config.bidding) adSetDefaults.push('bidding')

    const placements = adSet.config.placements ?? DEFAULT_PLACEMENTS
    if (!adSet.config.placements) adSetDefaults.push('placements')

    const adSetStatus = adSet.config.status ?? DEFAULT_STATUS
    if (!adSet.config.status) adSetDefaults.push('status')

    resources.push(resource('adSet', adSetPath, {
      name: adSet.name,
      status: adSetStatus,
      targeting: adSet.config.targeting,
      optimization,
      bidding,
      placements,
      ...(adSet.config.budget !== undefined && { budget: adSet.config.budget }),
      ...(adSet.config.schedule !== undefined && { schedule: adSet.config.schedule }),
      ...(adSet.config.conversion !== undefined && { conversion: adSet.config.conversion }),
      ...(adSet.config.dsa !== undefined && { dsa: adSet.config.dsa }),
      ...(adSet.config.promotedObject !== undefined && { promotedObject: adSet.config.promotedObject }),
      ...(adSetDefaults.length > 0 && { _defaults: adSetDefaults }),
    }))

    // 3. Creatives + Ads
    for (const creative of adSet.content.ads) {
      const adName = resolveAdName(creative)
      const adSlug = slugify(adName)
      const creativePath = `${adSetPath}/${adSlug}/cr`
      const adPath = `${adSetPath}/${adSlug}`

      // Resolve url and cta with fallback to ad set content
      const { url: resolvedUrl, defaulted: urlDefaulted } = resolveUrl(creative, adSet.content, adSet.name)
      const { cta: resolvedCta, defaulted: ctaDefaulted } = resolveCta(creative, adSet.content, adSet.name)

      // Track ad-level defaults
      const adDefaults: string[] = []
      if (!creative.name) adDefaults.push('name')
      if (urlDefaulted) adDefaults.push('url')
      if (ctaDefaulted) adDefaults.push('cta')

      // Build creative properties based on format
      const creativeProps = buildCreativeProperties(creative, resolvedUrl, resolvedCta, adName)

      resources.push(resource('creative', creativePath, {
        ...creativeProps,
        ...(adDefaults.length > 0 && { _defaults: adDefaults }),
      }))

      // Ad references the creative
      resources.push(resource('ad', adPath, {
        name: adName,
        status: adSetStatus,
        creativePath,
        ...(adDefaults.length > 0 && { _defaults: adDefaults }),
      }))
    }
  }

  return resources
}

// ─── Creative Property Builders ──────────────────────────

function buildCreativeProperties(
  creative: MetaCreative,
  resolvedUrl: string,
  resolvedCta: MetaCTA,
  adName: string,
): Record<string, unknown> {
  switch (creative.format) {
    case 'image':
      return {
        name: adName,
        format: 'image',
        image: creative.image,
        headline: creative.headline,
        primaryText: creative.primaryText,
        ...(creative.description !== undefined && { description: creative.description }),
        cta: resolvedCta,
        url: resolvedUrl,
        ...(creative.urlParameters !== undefined && { urlParameters: creative.urlParameters }),
        ...(creative.displayLink !== undefined && { displayLink: creative.displayLink }),
      }

    case 'video':
      return {
        name: adName,
        format: 'video',
        video: creative.video,
        ...(creative.thumbnail !== undefined && { thumbnail: creative.thumbnail }),
        headline: creative.headline,
        primaryText: creative.primaryText,
        ...(creative.description !== undefined && { description: creative.description }),
        cta: resolvedCta,
        url: resolvedUrl,
        ...(creative.urlParameters !== undefined && { urlParameters: creative.urlParameters }),
      }

    case 'carousel':
      return {
        name: adName,
        format: 'carousel',
        cards: creative.cards,
        primaryText: creative.primaryText,
        cta: resolvedCta,
        url: resolvedUrl,
        ...(creative.endCard !== undefined && { endCard: creative.endCard }),
      }

    case 'collection':
      return {
        name: adName,
        format: 'collection',
        ...(creative.coverImage !== undefined && { coverImage: creative.coverImage }),
        ...(creative.coverVideo !== undefined && { coverVideo: creative.coverVideo }),
        instantExperience: creative.instantExperience,
        headline: creative.headline,
        primaryText: creative.primaryText,
      }
  }
}
