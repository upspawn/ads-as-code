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
   * Add a locale-specific ad group with targeting override.
   */
  builder.locale = function (key: string, targeting: Targeting, input: AdGroupInput): CampaignBuilder {
    const group = normalizeAdGroup(input, targeting)
    const newGroups = { ...campaign.groups, [key]: group }
    return createBuilder({ ...campaign, groups: newGroups })
  }

  /**
   * Add an ad group without targeting override.
   */
  builder.group = function (key: string, input: AdGroupInput): CampaignBuilder {
    const group = normalizeAdGroup(input)
    const newGroups = { ...campaign.groups, [key]: group }
    return createBuilder({ ...campaign, groups: newGroups })
  }

  /**
   * Set sitelink extensions on the campaign.
   */
  builder.sitelinks = function (...links: Sitelink[]): CampaignBuilder {
    return createBuilder({
      ...campaign,
      extensions: { ...campaign.extensions, sitelinks: links },
    })
  }

  /**
   * Set callout extensions on the campaign. Each callout must be <= 25 characters.
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
 */
export const google = {
  /**
   * Create a Google Search campaign with chained builder methods.
   *
   * @example
   * ```ts
   * const campaign = google.search('My Campaign', {
   *   budget: { amount: 20, currency: 'EUR', period: 'daily' },
   *   bidding: 'maximize-conversions',
   * })
   * .locale('en-us', { rules: [{ type: 'geo', countries: ['US'] }] }, {
   *   keywords: [{ text: 'rename files', matchType: 'EXACT' }],
   *   ad: { type: 'rsa', headlines: [...], descriptions: [...], finalUrl: 'https://...' },
   * })
   * .sitelinks({ text: 'Pricing', url: '/pricing' })
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
