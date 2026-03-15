import type { CalloutText, Keyword, Targeting } from '../core/types.ts'
import { isRsaMarker } from '../ai/types.ts'
import { isKeywordsMarker } from '../ai/types.ts'
import type {
  AdGroupInput,
  BiddingInput,
  BiddingStrategy,
  CallExtension,
  CampaignBuilder,
  DisplayAdGroupInput,
  DisplayCampaignBuilder,
  DisplayCampaignInput,
  GoogleAdGroupUnresolved,
  GoogleDisplayAdGroup,
  GoogleDisplayCampaign,
  GoogleSearchCampaignUnresolved,
  ImageExtension,
  PriceExtension,
  PromotionExtension,
  SearchCampaignInput,
  Sitelink,
  StructuredSnippet,
} from './types.ts'

/**
 * Normalize a BiddingInput (string shorthand or full object) to a BiddingStrategy.
 *
 * String shorthands like 'maximize-conversions' expand to `{ type: 'maximize-conversions' }`.
 * Some strategies require additional fields when used — the shorthand creates
 * a minimal valid object that can be used as a starting point.
 */
function normalizeBidding(input: BiddingInput): BiddingStrategy {
  if (typeof input === 'string') {
    switch (input) {
      case 'target-roas':
        return { type: 'target-roas', targetRoas: 1.0 }
      case 'target-impression-share':
        return { type: 'target-impression-share', location: 'anywhere', targetPercent: 50 }
      case 'maximize-conversion-value':
        return { type: 'maximize-conversion-value' }
      default:
        return { type: input }
    }
  }
  return input
}

/**
 * Normalize AdGroupInput into a GoogleAdGroupUnresolved.
 * - Converts a single `ad` (or RsaMarker) to an array of `ads`.
 * - Normalizes keywords: bare KeywordsMarker wraps to array, mixed arrays pass through.
 * - Merges optional targeting override.
 */
function normalizeAdGroup(input: AdGroupInput, targetingOverride?: Targeting): GoogleAdGroupUnresolved {
  // Normalize ads: single ad or marker becomes array
  const ads = Array.isArray(input.ad) ? input.ad : [input.ad]

  // Normalize keywords: bare KeywordsMarker wraps to array, arrays pass through
  const keywords = isKeywordsMarker(input.keywords)
    ? [input.keywords]
    : Array.isArray(input.keywords)
      ? input.keywords
      : [...input.keywords] // readonly array -> mutable

  const group: GoogleAdGroupUnresolved = {
    keywords,
    ads,
    ...(input.negatives !== undefined && input.negatives.length > 0 && { negatives: input.negatives }),
    ...(input.status !== undefined && { status: input.status }),
    ...(targetingOverride ?? input.targeting
      ? { targeting: targetingOverride ?? input.targeting }
      : {}),
  }
  return group
}

/**
 * Create a CampaignBuilder that wraps a GoogleSearchCampaignUnresolved with chained methods.
 */
function createBuilder(campaign: GoogleSearchCampaignUnresolved): CampaignBuilder {
  const builder: CampaignBuilder = Object.create(null)

  // Copy all campaign data properties onto the builder
  const keys = Object.keys(campaign) as (keyof GoogleSearchCampaignUnresolved)[]
  for (const key of keys) {
    Object.defineProperty(builder, key, {
      value: campaign[key],
      enumerable: true,
      writable: false,
      configurable: true,
    })
  }

  /**
   * Add a locale-specific ad group with a targeting override.
   *
   * The targeting replaces any campaign-level targeting for this group,
   * making it ideal for multi-language or multi-region campaigns.
   *
   * @param key - Unique identifier for the ad group (e.g. `'en-us'`, `'de'`)
   * @param targeting - Targeting rules that override campaign-level targeting
   * @param input - Ad group definition with keywords and ads
   * @returns A new CampaignBuilder with the ad group added
   *
   * @example
   * ```ts
   * campaign.locale('en-us', targeting(geo('US'), languages('en')), {
   *   keywords: exact('rename files'),
   *   ad: rsa(headlines(...), descriptions(...), url('https://renamed.to')),
   * })
   * ```
   */
  builder.locale = function (key: string, targeting: Targeting, input: AdGroupInput): CampaignBuilder {
    const group = normalizeAdGroup(input, targeting)
    const newGroups = { ...campaign.groups, [key]: group }
    return createBuilder({ ...campaign, groups: newGroups })
  }

  /**
   * Add an ad group that inherits campaign-level targeting.
   *
   * @param key - Unique identifier for the ad group (e.g. `'pdf-renaming'`)
   * @param input - Ad group definition with keywords and ads
   * @returns A new CampaignBuilder with the ad group added
   *
   * @example
   * ```ts
   * campaign.group('pdf-renaming', {
   *   keywords: exact('rename pdf', 'pdf renamer'),
   *   ad: rsa(headlines(...), descriptions(...), url('https://renamed.to/pdf-renamer')),
   * })
   * ```
   */
  builder.group = function (key: string, input: AdGroupInput): CampaignBuilder {
    const group = normalizeAdGroup(input)
    const newGroups = { ...campaign.groups, [key]: group }
    return createBuilder({ ...campaign, groups: newGroups })
  }

  /**
   * Set sitelink extensions on the campaign. Replaces any existing sitelinks.
   *
   * @param links - Sitelink objects created with the `link()` helper
   * @returns A new CampaignBuilder with sitelinks set
   *
   * @example
   * ```ts
   * campaign.sitelinks(
   *   link('Pricing', '/pricing'),
   *   link('Features', '/features'),
   * )
   * ```
   */
  builder.sitelinks = function (...links: Sitelink[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, sitelinks: links },
    })
  }

  /**
   * Set callout extensions on the campaign. Replaces any existing callouts.
   *
   * @param texts - Callout strings (max 25 characters each)
   * @returns A new CampaignBuilder with callouts set
   * @throws If any callout exceeds 25 characters
   *
   * @example
   * ```ts
   * campaign.callouts('Free Trial', 'No Credit Card', 'AI-Powered')
   * ```
   */
  builder.callouts = function (...texts: string[]): CampaignBuilder {
    for (const text of texts) {
      if (text.length > 25) {
        throw new Error(`Callout "${text}" exceeds 25 character limit (${text.length} chars)`)
      }
    }
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, callouts: texts as CalloutText[] },
    })
  }

  /**
   * Set structured snippet extensions on the campaign. Replaces any existing snippets.
   */
  builder.snippets = function (...snippets: StructuredSnippet[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, structuredSnippets: snippets },
    })
  }

  /**
   * Set call extensions on the campaign. Replaces any existing calls.
   */
  builder.calls = function (...calls: CallExtension[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, calls },
    })
  }

  /**
   * Set price extensions on the campaign. Replaces any existing prices.
   */
  builder.prices = function (...prices: PriceExtension[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, prices },
    })
  }

  /**
   * Set promotion extensions on the campaign. Replaces any existing promotions.
   */
  builder.promotions = function (...promos: PromotionExtension[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, promotions: promos },
    })
  }

  /**
   * Set image extensions on the campaign. Replaces any existing images.
   */
  builder.images = function (...images: ImageExtension[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, images },
    })
  }

  return builder
}

// ─── Display Builder ──────────────────────────────────────

/**
 * Normalize DisplayAdGroupInput into a GoogleDisplayAdGroup.
 */
function normalizeDisplayAdGroup(input: DisplayAdGroupInput, targetingOverride?: Targeting): GoogleDisplayAdGroup {
  const ads = Array.isArray(input.ad) ? input.ad : [input.ad]

  const group: GoogleDisplayAdGroup = {
    ads,
    ...(input.status !== undefined && { status: input.status }),
    ...(targetingOverride ?? input.targeting
      ? { targeting: targetingOverride ?? input.targeting }
      : {}),
  }
  return group
}

/**
 * Create a DisplayCampaignBuilder that wraps a GoogleDisplayCampaign with chained methods.
 */
function createDisplayBuilder(campaign: GoogleDisplayCampaign): DisplayCampaignBuilder {
  const builder: DisplayCampaignBuilder = Object.create(null)

  const keys = Object.keys(campaign) as (keyof GoogleDisplayCampaign)[]
  for (const key of keys) {
    Object.defineProperty(builder, key, {
      value: campaign[key],
      enumerable: true,
      writable: false,
      configurable: true,
    })
  }

  builder.group = function (key: string, input: DisplayAdGroupInput): DisplayCampaignBuilder {
    const group = normalizeDisplayAdGroup(input)
    const newGroups = { ...campaign.groups, [key]: group }
    return createDisplayBuilder({ ...campaign, groups: newGroups })
  }

  return builder
}

/**
 * Google Ads campaign builder namespace.
 *
 * Provides factory methods for creating Google Ads campaigns
 * with a type-safe, chainable builder API.
 */
export const google = {
  /**
   * Create a Google Search campaign with a chainable builder API.
   *
   * Returns a `CampaignBuilder` that exposes `.locale()`, `.group()`,
   * `.sitelinks()`, and `.callouts()` for adding ad groups and extensions.
   * Each method returns a new builder (immutable chaining).
   *
   * @param name - Campaign name
   * @param input - Campaign configuration (budget, bidding, targeting, negatives, status)
   * @returns A CampaignBuilder for adding ad groups and extensions
   *
   * @example
   * ```ts
   * const campaign = google.search('Search - Exact Match', {
   *   budget: daily(20),
   *   bidding: 'maximize-conversions',
   *   targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
   *   negatives: negatives('free', 'open source'),
   * })
   * .locale('en-us', targeting(geo('US'), languages('en')), {
   *   keywords: exact('rename files', 'batch rename'),
   *   ad: rsa(headlines(...), descriptions(...), url('https://renamed.to')),
   * })
   * .sitelinks(link('Pricing', '/pricing'))
   * .callouts('Free Trial', 'No Credit Card')
   * ```
   */
  search(name: string, input: SearchCampaignInput): CampaignBuilder {
    const campaign: GoogleSearchCampaignUnresolved = {
      provider: 'google',
      kind: 'search',
      name,
      status: input.status ?? 'enabled',
      budget: input.budget,
      bidding: normalizeBidding(input.bidding),
      targeting: input.targeting ?? { rules: [] },
      negatives: input.negatives ?? [],
      groups: {},
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.trackingTemplate !== undefined && { trackingTemplate: input.trackingTemplate }),
      ...(input.finalUrlSuffix !== undefined && { finalUrlSuffix: input.finalUrlSuffix }),
      ...(input.customParameters !== undefined && { customParameters: input.customParameters }),
      ...(input.networkSettings !== undefined && { networkSettings: input.networkSettings }),
    }
    return createBuilder(campaign)
  },

  /**
   * Create a Google Display campaign with a chainable builder API.
   *
   * Returns a `DisplayCampaignBuilder` that exposes `.group()` for adding ad groups.
   * Each method returns a new builder (immutable chaining).
   *
   * @param name - Campaign name
   * @param input - Campaign configuration (budget, bidding, targeting, negatives, status)
   * @returns A DisplayCampaignBuilder for adding ad groups
   *
   * @example
   * ```ts
   * const campaign = google.display('Display - Remarketing', {
   *   budget: daily(5),
   *   bidding: 'maximize-conversions',
   *   targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
   * })
   * .group('remarketing', {
   *   ad: {
   *     type: 'responsive-display',
   *     headlines: ['Rename Your Files'],
   *     longHeadline: 'AI-Powered File Renaming in Seconds',
   *     descriptions: ['Try renamed.to free'],
   *     businessName: 'renamed.to',
   *     finalUrl: 'https://renamed.to',
   *     marketingImages: [landscape('./hero.png')],
   *     squareMarketingImages: [square('./hero-square.png')],
   *   },
   * })
   * ```
   */
  display(name: string, input: DisplayCampaignInput): DisplayCampaignBuilder {
    const campaign: GoogleDisplayCampaign = {
      provider: 'google',
      kind: 'display',
      name,
      status: input.status ?? 'enabled',
      budget: input.budget,
      bidding: normalizeBidding(input.bidding),
      targeting: input.targeting ?? { rules: [] },
      negatives: input.negatives ?? [],
      groups: {},
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.trackingTemplate !== undefined && { trackingTemplate: input.trackingTemplate }),
      ...(input.finalUrlSuffix !== undefined && { finalUrlSuffix: input.finalUrlSuffix }),
      ...(input.networkSettings !== undefined && { networkSettings: input.networkSettings }),
    }
    return createDisplayBuilder(campaign)
  },
}
