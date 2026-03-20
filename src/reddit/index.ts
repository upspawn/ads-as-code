// Reddit Ads campaign builder
// Immutable builder pattern matching the Meta provider's structure

import type {
  Objective,
  AdGroupConfig,
  RedditAd,
  RedditAdGroup,
  RedditCampaign,
  RedditCampaignConfig,
} from './types.ts'

// ─── Helpers ───────────────────────────────────────────────

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const frozen = Object.freeze(obj)
  for (const val of Object.values(frozen)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val as object)
    }
  }
  return frozen
}

// ─── Builder ───────────────────────────────────────────────

/**
 * Immutable builder for Reddit Ads campaigns.
 *
 * Generic over objective `T` so that `.adGroup()` constrains which
 * optimization goals are valid — e.g. a traffic campaign cannot
 * use `APP_INSTALLS`.
 *
 * Instances are created via factory methods on the `reddit` namespace:
 * `reddit.traffic()`, `reddit.conversions()`, etc.
 */
export class RedditCampaignBuilder<T extends Objective> {
  readonly #kind: T
  readonly #name: string
  readonly #config: RedditCampaignConfig
  readonly #adGroups: readonly RedditAdGroup<T>[]

  private constructor(
    kind: T,
    name: string,
    config: RedditCampaignConfig,
    adGroups: readonly RedditAdGroup<T>[],
  ) {
    this.#kind = kind
    this.#name = name
    this.#config = config
    this.#adGroups = adGroups
  }

  /** @internal Factory used by the `reddit` namespace methods. */
  static _create<T extends Objective>(
    kind: T,
    name: string,
    config: RedditCampaignConfig = {},
  ): RedditCampaignBuilder<T> {
    return new RedditCampaignBuilder(kind, name, config, [])
  }

  /**
   * Add an ad group to this campaign.
   *
   * Returns a new builder with the ad group appended (immutable).
   * The `config.optimizationGoal` field is constrained by the campaign
   * objective — TypeScript will reject invalid goals at compile time.
   */
  adGroup(
    name: string,
    config: AdGroupConfig<T>,
    ads: readonly RedditAd[],
  ): RedditCampaignBuilder<T> {
    const group: RedditAdGroup<T> = Object.freeze({ name, config, ads: [...ads] })
    return new RedditCampaignBuilder(
      this.#kind,
      this.#name,
      this.#config,
      [...this.#adGroups, group],
    )
  }

  /**
   * Extract the internal campaign structure for the flatten layer.
   */
  build(): RedditCampaign<T> {
    return deepFreeze({
      provider: 'reddit' as const,
      kind: this.#kind,
      name: this.#name,
      config: this.#config,
      adGroups: [...this.#adGroups],
    })
  }
}

// ─── Namespace ─────────────────────────────────────────────

/**
 * Reddit Ads campaign builder namespace.
 *
 * Provides factory methods for each Reddit objective. Each method
 * returns a typed `RedditCampaignBuilder<T>` that constrains which
 * optimization goals are valid for ad groups.
 *
 * @example
 * ```ts
 * const campaign = reddit.traffic('Retargeting - US', {
 *   budget: daily(5),
 * })
 * .adGroup('Tech Subreddits', {
 *   targeting: [{ _type: 'subreddits', names: ['r/technology'] }],
 * }, [
 *   { format: 'image', filePath: './hero.jpg', config: { headline: '...', clickUrl: '...' } },
 * ])
 * ```
 */
export const reddit = {
  awareness(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'awareness'> {
    return RedditCampaignBuilder._create('awareness', name, config)
  },
  traffic(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'traffic'> {
    return RedditCampaignBuilder._create('traffic', name, config)
  },
  engagement(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'engagement'> {
    return RedditCampaignBuilder._create('engagement', name, config)
  },
  videoViews(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'video-views'> {
    return RedditCampaignBuilder._create('video-views', name, config)
  },
  appInstalls(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'app-installs'> {
    return RedditCampaignBuilder._create('app-installs', name, config)
  },
  conversions(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'conversions'> {
    return RedditCampaignBuilder._create('conversions', name, config)
  },
  leads(name: string, config?: RedditCampaignConfig): RedditCampaignBuilder<'leads'> {
    return RedditCampaignBuilder._create('leads', name, config)
  },
}
