import type {
  Objective,
  AdSetConfig,
  AdSetContent,
  MetaCampaignConfig,
  MetaCreative,
  MetaCTA,
} from './types.ts'

// ─── Internal Campaign Structure ──────────────────────────

/** Internal ad set representation stored by the builder. */
export type MetaAdSet<T extends Objective> = {
  readonly name: string
  readonly config: AdSetConfig<T>
  readonly content: AdSetContent
}

/** The fully assembled campaign structure returned by `.build()`. */
export type MetaCampaign<T extends Objective = Objective> = {
  readonly provider: 'meta'
  readonly kind: T
  readonly name: string
  readonly config: MetaCampaignConfig
  readonly adSets: readonly MetaAdSet<T>[]
}

// ─── Builder ──────────────────────────────────────────────

/**
 * Immutable builder for Meta (Facebook/Instagram) campaigns.
 *
 * Generic over objective `T` so that `.adSet()` constrains which
 * optimization goals are valid — e.g. a traffic campaign cannot
 * use `APP_INSTALLS`.
 *
 * Instances are created via factory methods on the `meta` namespace:
 * `meta.traffic()`, `meta.conversions()`, etc.
 */
export class MetaCampaignBuilder<T extends Objective> {
  readonly provider = 'meta' as const
  readonly kind: T

  private readonly _name: string
  private readonly _config: MetaCampaignConfig
  private readonly _adSets: readonly MetaAdSet<T>[]

  private constructor(
    kind: T,
    name: string,
    config: MetaCampaignConfig,
    adSets: readonly MetaAdSet<T>[],
  ) {
    this.kind = kind
    this._name = name
    this._config = config
    this._adSets = adSets
  }

  /** @internal Factory used by the `meta` namespace methods. */
  static _create<T extends Objective>(
    kind: T,
    name: string,
    config: MetaCampaignConfig,
  ): MetaCampaignBuilder<T> {
    return new MetaCampaignBuilder(kind, name, config, [])
  }

  /**
   * Add an ad set to this campaign.
   *
   * Returns a new builder with the ad set appended (immutable).
   * The `config.optimization` field is constrained by the campaign
   * objective — TypeScript will reject invalid goals at compile time.
   */
  adSet(
    name: string,
    config: AdSetConfig<T>,
    content: AdSetContent,
  ): MetaCampaignBuilder<T> {
    const adSet: MetaAdSet<T> = { name, config, content }
    return new MetaCampaignBuilder(
      this.kind,
      this._name,
      this._config,
      [...this._adSets, adSet],
    )
  }

  /**
   * Extract the internal campaign structure for the flatten layer.
   */
  build(): MetaCampaign<T> {
    return {
      provider: this.provider,
      kind: this.kind,
      name: this._name,
      config: this._config,
      adSets: this._adSets,
    }
  }
}

// ─── Namespace ────────────────────────────────────────────

/**
 * Meta Ads campaign builder namespace.
 *
 * Provides factory methods for each Meta objective. Each method
 * returns a typed `MetaCampaignBuilder<T>` that constrains which
 * optimization goals are valid for ad sets.
 *
 * @example
 * ```ts
 * const campaign = meta.traffic('Retargeting - US', {
 *   budget: daily(5),
 * })
 * .adSet('Website Visitors', { targeting: targeting(geo('US')) }, {
 *   url: 'https://renamed.to',
 *   cta: 'SIGN_UP',
 *   ads: [image('./hero.png', { headline: '...', primaryText: '...' })],
 * })
 * ```
 */
export const meta = {
  traffic(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'traffic'> {
    return MetaCampaignBuilder._create('traffic', name, config)
  },

  awareness(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'awareness'> {
    return MetaCampaignBuilder._create('awareness', name, config)
  },

  engagement(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'engagement'> {
    return MetaCampaignBuilder._create('engagement', name, config)
  },

  leads(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'leads'> {
    return MetaCampaignBuilder._create('leads', name, config)
  },

  sales(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'sales'> {
    return MetaCampaignBuilder._create('sales', name, config)
  },

  /** Alias for `meta.sales()` — both map to OUTCOME_CONVERSIONS. */
  conversions(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'conversions'> {
    return MetaCampaignBuilder._create('conversions', name, config)
  },

  appPromotion(name: string, config: MetaCampaignConfig = {}): MetaCampaignBuilder<'app-promotion'> {
    return MetaCampaignBuilder._create('app-promotion', name, config)
  },
}
