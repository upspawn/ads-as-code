import type { CalloutText, Keyword, Targeting } from '../core/types.ts'
import type {
  AdGroupInput,
  BiddingInput,
  BiddingStrategy,
  CampaignBuilder,
  GoogleAdGroup,
  GoogleSearchCampaign,
  SearchCampaignInput,
  Sitelink,
} from './types.ts'

/**
 * Normalize a BiddingInput (string shorthand or full object) to a BiddingStrategy.
 */
function normalizeBidding(input: BiddingInput): BiddingStrategy {
  if (typeof input === 'string') {
    return { type: input }
  }
  return input
}

/**
 * Normalize AdGroupInput into a GoogleAdGroup.
 * - Converts a single `ad` to an array of `ads`.
 * - Merges optional targeting override.
 */
function normalizeAdGroup(input: AdGroupInput, targetingOverride?: Targeting): GoogleAdGroup {
  const ads = Array.isArray(input.ad) ? input.ad : [input.ad]
  const group: GoogleAdGroup = {
    keywords: input.keywords,
    ads,
    ...(input.status !== undefined && { status: input.status }),
    ...(targetingOverride ?? input.targeting
      ? { targeting: targetingOverride ?? input.targeting }
      : {}),
  }
  return group
}

/**
 * Create a CampaignBuilder that wraps a GoogleSearchCampaign with chained methods.
 */
function createBuilder(campaign: GoogleSearchCampaign): CampaignBuilder {
  const builder: CampaignBuilder = Object.create(null)

  // Copy all campaign data properties onto the builder
  const keys = Object.keys(campaign) as (keyof GoogleSearchCampaign)[]
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
    const campaign: GoogleSearchCampaign = {
      provider: 'google',
      kind: 'search',
      name,
      status: input.status ?? 'enabled',
      budget: input.budget,
      bidding: normalizeBidding(input.bidding),
      targeting: input.targeting ?? { rules: [] },
      negatives: input.negatives ?? [],
      groups: {},
    }
    return createBuilder(campaign)
  },
}
