import { describe, expect, test } from 'bun:test'
import { meta, MetaCampaignBuilder } from '../../src/meta/index.ts'
import type { MetaCampaign, MetaAdSet } from '../../src/meta/index.ts'
import type {
  AdSetConfig,
  AdSetContent,
  MetaTargeting,
  MetaCampaignConfig,
  OptimizationGoalMap,
} from '../../src/meta/types.ts'
import type { Budget } from '../../src/core/types.ts'

// ─── Fixtures ──────────────────────────────────────────────

const usTargeting: MetaTargeting = {
  geo: [{ type: 'geo', countries: ['US'] }],
}

const deTargeting: MetaTargeting = {
  geo: [{ type: 'geo', countries: ['DE', 'AT'] }],
  age: { min: 25, max: 65 },
}

const budget: Budget = { amount: 5, currency: 'EUR', period: 'daily' }

const simpleContent: AdSetContent = {
  url: 'https://renamed.to',
  cta: 'SIGN_UP',
  ads: [
    {
      format: 'image',
      image: './assets/hero.png',
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually.',
    },
  ],
}

// ─── Factory Methods ───────────────────────────────────────

describe('meta factory methods', () => {
  test('meta.traffic() sets provider and kind', () => {
    const builder = meta.traffic('Traffic Campaign')
    expect(builder.provider).toBe('meta')
    expect(builder.kind).toBe('traffic')
  })

  test('meta.awareness() sets kind to awareness', () => {
    const builder = meta.awareness('Brand Awareness')
    expect(builder.kind).toBe('awareness')
  })

  test('meta.engagement() sets kind to engagement', () => {
    const builder = meta.engagement('Engagement Campaign')
    expect(builder.kind).toBe('engagement')
  })

  test('meta.leads() sets kind to leads', () => {
    const builder = meta.leads('Lead Gen')
    expect(builder.kind).toBe('leads')
  })

  test('meta.sales() sets kind to sales', () => {
    const builder = meta.sales('Sales Campaign')
    expect(builder.kind).toBe('sales')
  })

  test('meta.conversions() sets kind to conversions (alias for sales)', () => {
    const builder = meta.conversions('Conversions Campaign')
    expect(builder.kind).toBe('conversions')
  })

  test('meta.appPromotion() sets kind to app-promotion', () => {
    const builder = meta.appPromotion('App Install')
    expect(builder.kind).toBe('app-promotion')
  })

  test('config defaults to empty object when omitted', () => {
    const campaign = meta.traffic('No Config').build()
    expect(campaign.config).toEqual({})
  })

  test('config is passed through when provided', () => {
    const config: MetaCampaignConfig = {
      budget,
      status: 'PAUSED',
      specialAdCategories: ['HOUSING'],
    }
    const campaign = meta.traffic('With Config', config).build()
    expect(campaign.config).toEqual(config)
  })
})

// ─── .build() ──────────────────────────────────────────────

describe('.build()', () => {
  test('returns a MetaCampaign with correct structure', () => {
    const campaign = meta.traffic('Test Campaign', { budget }).build()

    expect(campaign.provider).toBe('meta')
    expect(campaign.kind).toBe('traffic')
    expect(campaign.name).toBe('Test Campaign')
    expect(campaign.config).toEqual({ budget })
    expect(campaign.adSets).toEqual([])
  })

  test('build() output has provider field for discovery', () => {
    const campaign = meta.sales('Discovery Test').build()
    // The discovery system checks for `provider` and `kind` fields
    expect(campaign).toHaveProperty('provider', 'meta')
    expect(campaign).toHaveProperty('kind', 'sales')
  })
})

// ─── .adSet() ──────────────────────────────────────────────

describe('.adSet()', () => {
  test('appends a single ad set', () => {
    const campaign = meta.traffic('Test', { budget })
      .adSet('Website Visitors', { targeting: usTargeting }, simpleContent)
      .build()

    expect(campaign.adSets).toHaveLength(1)
    expect(campaign.adSets[0]!.name).toBe('Website Visitors')
    expect(campaign.adSets[0]!.config.targeting).toEqual(usTargeting)
    expect(campaign.adSets[0]!.content).toEqual(simpleContent)
  })

  test('multiple .adSet() calls accumulate', () => {
    const campaign = meta.traffic('Multi AdSet', { budget })
      .adSet('US Visitors', { targeting: usTargeting }, simpleContent)
      .adSet('DE Visitors', { targeting: deTargeting }, {
        url: 'https://renamed.to/de',
        cta: 'LEARN_MORE',
        ads: [
          {
            format: 'image',
            image: './assets/de-hero.png',
            headline: 'Dateien umbenennen',
            primaryText: 'KI-gesteuerte Dateiverwaltung.',
          },
        ],
      })
      .build()

    expect(campaign.adSets).toHaveLength(2)
    expect(campaign.adSets[0]!.name).toBe('US Visitors')
    expect(campaign.adSets[1]!.name).toBe('DE Visitors')
  })

  test('preserves optimization when provided', () => {
    const campaign = meta.traffic('Test', { budget })
      .adSet('Custom Opt', {
        targeting: usTargeting,
        optimization: 'LANDING_PAGE_VIEWS',
      }, simpleContent)
      .build()

    expect(campaign.adSets[0]!.config.optimization).toBe('LANDING_PAGE_VIEWS')
  })

  test('optimization is undefined when omitted', () => {
    const campaign = meta.traffic('Test', { budget })
      .adSet('Default Opt', { targeting: usTargeting }, simpleContent)
      .build()

    expect(campaign.adSets[0]!.config.optimization).toBeUndefined()
  })

  test('preserves all ad set config fields', () => {
    const config: AdSetConfig<'traffic'> = {
      targeting: usTargeting,
      optimization: 'LINK_CLICKS',
      bidding: { type: 'COST_CAP', cap: 10 },
      placements: 'automatic',
      status: 'ACTIVE',
      dsa: { beneficiary: 'Upspawn', payor: 'Upspawn' },
    }

    const campaign = meta.traffic('Full Config', { budget })
      .adSet('Full', config, simpleContent)
      .build()

    const adSet = campaign.adSets[0]!
    expect(adSet.config.optimization).toBe('LINK_CLICKS')
    expect(adSet.config.bidding).toEqual({ type: 'COST_CAP', cap: 10 })
    expect(adSet.config.placements).toBe('automatic')
    expect(adSet.config.status).toBe('ACTIVE')
    expect(adSet.config.dsa).toEqual({ beneficiary: 'Upspawn', payor: 'Upspawn' })
  })

  test('ad set content with url and cta defaults', () => {
    const content: AdSetContent = {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        { format: 'image', image: './hero.png', headline: 'H', primaryText: 'P' },
        { format: 'image', image: './alt.png', headline: 'H2', primaryText: 'P2', cta: 'LEARN_MORE' },
      ],
    }

    const campaign = meta.traffic('Defaults Test')
      .adSet('With Defaults', { targeting: usTargeting }, content)
      .build()

    expect(campaign.adSets[0]!.content.url).toBe('https://renamed.to')
    expect(campaign.adSets[0]!.content.cta).toBe('SIGN_UP')
    expect(campaign.adSets[0]!.content.ads).toHaveLength(2)
  })
})

// ─── Immutability ──────────────────────────────────────────

describe('immutability', () => {
  test('original builder is not mutated by .adSet()', () => {
    const base = meta.traffic('Base', { budget })
    const withAdSet = base.adSet('Added', { targeting: usTargeting }, simpleContent)

    expect(base.build().adSets).toHaveLength(0)
    expect(withAdSet.build().adSets).toHaveLength(1)
  })

  test('chaining produces independent builders at each step', () => {
    const step1 = meta.traffic('Chain')
    const step2 = step1.adSet('First', { targeting: usTargeting }, simpleContent)
    const step3 = step2.adSet('Second', { targeting: deTargeting }, simpleContent)

    expect(step1.build().adSets).toHaveLength(0)
    expect(step2.build().adSets).toHaveLength(1)
    expect(step3.build().adSets).toHaveLength(2)
  })
})

// ─── Type-Level Tests ──────────────────────────────────────

describe('type-level constraints', () => {
  test('traffic builder accepts LINK_CLICKS optimization', () => {
    const campaign = meta.traffic('Type Test')
      .adSet('Valid', {
        targeting: usTargeting,
        optimization: 'LINK_CLICKS',
      }, simpleContent)
      .build()

    expect(campaign.adSets[0]!.config.optimization).toBe('LINK_CLICKS')
  })

  // Verify that invalid optimization goals are rejected at compile time.
  // Using direct assignment (not object literal) so @ts-expect-error applies to the error site.

  // @ts-expect-error — APP_INSTALLS is not a valid optimization for traffic
  const _invalidTrafficGoal: OptimizationGoalMap['traffic'] = 'APP_INSTALLS'

  // @ts-expect-error — LEAD_GENERATION is not a valid optimization for traffic
  const _invalidTrafficGoal2: OptimizationGoalMap['traffic'] = 'LEAD_GENERATION'

  test('sales builder accepts OFFSITE_CONVERSIONS optimization', () => {
    const campaign = meta.sales('Sales Test')
      .adSet('Valid', {
        targeting: usTargeting,
        optimization: 'OFFSITE_CONVERSIONS',
      }, simpleContent)
      .build()

    expect(campaign.adSets[0]!.config.optimization).toBe('OFFSITE_CONVERSIONS')
  })

  test('conversions builder accepts same goals as sales', () => {
    const campaign = meta.conversions('Conv Test')
      .adSet('Valid', {
        targeting: usTargeting,
        optimization: 'VALUE',
      }, simpleContent)
      .build()

    expect(campaign.adSets[0]!.config.optimization).toBe('VALUE')
  })
})

// ─── Discovery Compatibility ───────────────────────────────

describe('discovery system compatibility', () => {
  test('builder has provider and kind on the instance (before build)', () => {
    const builder = meta.traffic('Discovery')
    // The discovery system calls isCampaignLike() which checks for these
    expect(builder.provider).toBe('meta')
    expect(builder.kind).toBe('traffic')
  })

  test('build() output also has provider and kind', () => {
    const campaign = meta.sales('Built').build()
    expect(campaign.provider).toBe('meta')
    expect(campaign.kind).toBe('sales')
  })
})
