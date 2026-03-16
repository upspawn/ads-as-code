import type { Resource, ResourceKind, Budget } from '../core/types.ts'
import { slugify } from '../core/flatten.ts'
import { DEFAULT_OPTIMIZATION, OBJECTIVE_MAP } from './constants.ts'
import type { MetaCampaign } from './index.ts'
import type { UrlResult } from '../helpers/url.ts'
import type { AssetMarker } from '../core/asset.ts'
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

/**
 * Extract the string path from a value that may be a string or AssetMarker.
 * At flatten time, resolveAssets() should have already replaced markers with
 * their cached paths. If an unresolved marker reaches here, use its name as
 * a fallback (the apply step will fail with a clear error anyway).
 */
function assetPath(value: string | AssetMarker): string {
  if (typeof value === 'string') return value
  return `<unresolved-asset:${value.name}>`
}

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, meta?: Record<string, unknown>): Resource {
  if (meta && Object.keys(meta).length > 0) {
    return { kind, path, properties, meta }
  }
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
    case 'image': return assetPath(creative.image)
    case 'video': return assetPath(creative.video)
    case 'carousel': return undefined
    case 'collection': {
      const cover = creative.coverImage ?? creative.coverVideo
      return cover !== undefined ? assetPath(cover) : undefined
    }
    case 'boostedPost': return undefined
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
 * Resolve a `string | UrlResult` to a plain URL string with UTM params baked in.
 * Accepts both raw strings (passthrough) and UrlResult objects from the url() helper.
 */
function resolveUrlValue(value: string | UrlResult | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  // UrlResult — build the URL with UTM params appended
  const base = value.finalUrl
  if (!value.utm) return base
  const params = new URLSearchParams()
  if (value.utm.source) params.set('utm_source', value.utm.source)
  if (value.utm.medium) params.set('utm_medium', value.utm.medium)
  if (value.utm.campaign) params.set('utm_campaign', value.utm.campaign)
  if (value.utm.content) params.set('utm_content', value.utm.content)
  if (value.utm.term) params.set('utm_term', value.utm.term)
  const qs = params.toString()
  if (!qs) return base
  return base.includes('?') ? `${base}&${qs}` : `${base}?${qs}`
}

/**
 * Resolve url for an ad, falling back to ad set content defaults.
 * Throws a validation error if neither is set.
 */
function resolveUrl(creative: MetaCreative, content: AdSetContent, _adSetName: string): { url: string; defaulted: boolean } {
  if (creative.format === 'collection' || creative.format === 'boostedPost') {
    // Collections use instantExperience; boosted posts use the original post URL
    return { url: '', defaulted: false }
  }
  const adUrl = 'url' in creative ? creative.url : undefined
  const resolved = resolveUrlValue(adUrl)
  if (resolved) return { url: resolved, defaulted: false }
  const contentResolved = resolveUrlValue(content.url)
  if (contentResolved) return { url: contentResolved, defaulted: true }
  return { url: '', defaulted: true }
}

/**
 * Resolve cta for an ad, falling back to ad set content defaults.
 * Throws a validation error if neither is set.
 */
function resolveCta(creative: MetaCreative, content: AdSetContent, _adSetName: string): { cta: MetaCTA; defaulted: boolean } {
  if (creative.format === 'collection' || creative.format === 'boostedPost') {
    // Collections and boosted posts don't use a CTA button
    return { cta: 'NO_BUTTON', defaulted: false }
  }
  const adCta = 'cta' in creative ? creative.cta : undefined
  if (adCta) return { cta: adCta, defaulted: false }
  if (content.cta) return { cta: content.cta, defaulted: true }
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
  }, campaignDefaults.length > 0 ? { _defaults: campaignDefaults } : undefined))

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
      // Omit placements when automatic — fetch omits it too, and the diff engine
      // would see {placements: 'automatic'} vs {no placements} as a change
      ...(placements !== 'automatic' && { placements }),
      ...(adSet.config.budget !== undefined && { budget: adSet.config.budget }),
      ...(adSet.config.schedule !== undefined && { schedule: adSet.config.schedule }),
      // Strip conversionWindow/attributionSetting from conversion — they're used only
      // during apply and the API doesn't return them, so including them causes false diffs.
      ...(adSet.config.conversion !== undefined && { conversion: (() => {
        const { conversionWindow: _cw, attributionSetting: _as, ...rest } = adSet.config.conversion
        return rest
      })() }),
      ...(adSet.config.dsa !== undefined && { dsa: adSet.config.dsa }),
      // Build promotedObject from conversion config if not explicitly set
      ...(adSet.config.promotedObject !== undefined
        ? { promotedObject: adSet.config.promotedObject }
        : adSet.config.conversion?.pixelId
          ? { promotedObject: {
              pixel_id: adSet.config.conversion.pixelId,
              ...(adSet.config.conversion.customEventType && { custom_event_type: adSet.config.conversion.customEventType }),
            }}
          : {}),
    }, adSetDefaults.length > 0 ? { _defaults: adSetDefaults } : undefined))

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
      const { properties: creativeProps, meta: creativeMeta } = buildCreativeProperties(creative, resolvedUrl, resolvedCta, adName)

      // Merge SDK-internal metadata: _defaults + any media file paths from creative
      const creativeMetaFull: Record<string, unknown> = { ...creativeMeta }
      if (adDefaults.length > 0) creativeMetaFull._defaults = adDefaults

      resources.push(resource('creative', creativePath, creativeProps,
        Object.keys(creativeMetaFull).length > 0 ? creativeMetaFull : undefined))

      // Ad references the creative — creativePath is internal (used by apply), not an API field
      const adMetaObj: Record<string, unknown> = { creativePath }
      if (adDefaults.length > 0) adMetaObj._defaults = adDefaults
      resources.push(resource('ad', adPath, {
        name: adName,
        status: creative.status ?? adSetStatus,
      }, adMetaObj))
    }
  }

  return resources
}

// ─── Creative Property Builders ──────────────────────────

type CreativeBuildResult = {
  properties: Record<string, unknown>
  meta: Record<string, unknown>
}

function buildCreativeProperties(
  creative: MetaCreative,
  resolvedUrl: string,
  resolvedCta: MetaCTA,
  adName: string,
): CreativeBuildResult {
  switch (creative.format) {
    case 'image':
      return {
        properties: {
          name: adName,
          format: 'image',
          headline: creative.headline,
          primaryText: creative.primaryText,
          ...(creative.description !== undefined && { description: creative.description }),
          cta: resolvedCta,
          url: resolvedUrl,
          ...(creative.urlParameters !== undefined && { urlParameters: creative.urlParameters }),
          ...(creative.displayLink !== undefined && { displayLink: creative.displayLink }),
        },
        // Local file path is SDK-internal — the API works with imageHash.
        // A `hash:` prefix means the image is already uploaded to Meta.
        meta: (() => {
          const img = assetPath(creative.image)
          return img.startsWith('hash:')
            ? { imageHash: img.slice(5) }
            : { imagePath: img }
        })(),
      }

    case 'video':
      return {
        properties: {
          name: adName,
          format: 'video',
          headline: creative.headline,
          primaryText: creative.primaryText,
          ...(creative.description !== undefined && { description: creative.description }),
          cta: resolvedCta,
          url: resolvedUrl,
          ...(creative.urlParameters !== undefined && { urlParameters: creative.urlParameters }),
        },
        // Local file paths are SDK-internal — the API works with videoId/imageHash
        meta: {
          videoPath: assetPath(creative.video),
          ...(creative.thumbnail !== undefined && { thumbnailPath: assetPath(creative.thumbnail) }),
        },
      }

    case 'carousel':
      return {
        properties: {
          name: adName,
          format: 'carousel',
          // Resolve UrlResult objects in carousel cards to plain strings for the API
          cards: creative.cards.map(card => ({
            ...card,
            url: resolveUrlValue(card.url) ?? card.url,
          })),
          primaryText: creative.primaryText,
          cta: resolvedCta,
          url: resolvedUrl,
          ...(creative.endCard !== undefined && { endCard: creative.endCard }),
        },
        meta: {},
      }

    case 'collection':
      return {
        properties: {
          name: adName,
          format: 'collection',
          instantExperience: creative.instantExperience,
          headline: creative.headline,
          primaryText: creative.primaryText,
        },
        meta: {
          ...(creative.coverImage !== undefined && { coverImagePath: assetPath(creative.coverImage) }),
          ...(creative.coverVideo !== undefined && { coverVideoPath: assetPath(creative.coverVideo) }),
        },
      }

    case 'boostedPost':
      // Boosted posts omit format/headline/primaryText to match fetch output
      return { properties: { name: adName }, meta: {} }
  }
}
