import { describe, expect, test } from 'bun:test'
import type {
  Objective,
  OptimizationGoalMap,
  AdSetConfig,
  MetaTargeting,
  ImageAd,
  VideoAd,
  CarouselAd,
  CollectionAd,
  MetaCreative,
  MetaCTA,
  BidStrategy,
  MetaPlacements,
  AdSetContent,
  MetaCampaignConfig,
  DSAConfig,
  SpecialAdCategory,
  ConversionConfig,
  AdSetSchedule,
  DayPartRule,
  PromotedObject,
  InterestTarget,
  BehaviorTarget,
  MetaDemographicTarget,
  ConnectionTarget,
  CarouselCard,
  PlacementPosition,
  MetaPlatform,
} from '../../src/meta/types.ts'

// ─── Type Constraint Tests ─────────────────────────────────
// These tests verify compile-time constraints. They don't need runtime assertions —
// if the file compiles, the constraints are correct. The @ts-expect-error comments
// verify that invalid assignments are properly rejected.

describe('Objective type', () => {
  test('accepts all valid objectives', () => {
    const objectives: Objective[] = [
      'awareness', 'traffic', 'engagement',
      'leads', 'sales', 'conversions', 'app-promotion',
    ]
    expect(objectives).toHaveLength(7)
  })

  test('conversions is a valid objective', () => {
    const obj: Objective = 'conversions'
    expect(obj).toBe('conversions')
  })
})

describe('OptimizationGoalMap type constraints', () => {
  test('traffic accepts LINK_CLICKS', () => {
    const goal: OptimizationGoalMap['traffic'] = 'LINK_CLICKS'
    expect(goal).toBe('LINK_CLICKS')
  })

  test('traffic accepts LANDING_PAGE_VIEWS', () => {
    const goal: OptimizationGoalMap['traffic'] = 'LANDING_PAGE_VIEWS'
    expect(goal).toBe('LANDING_PAGE_VIEWS')
  })

  // @ts-expect-error — APP_INSTALLS is not valid for traffic objective
  const _invalidTrafficGoal: OptimizationGoalMap['traffic'] = 'APP_INSTALLS'

  test('sales accepts OFFSITE_CONVERSIONS', () => {
    const goal: OptimizationGoalMap['sales'] = 'OFFSITE_CONVERSIONS'
    expect(goal).toBe('OFFSITE_CONVERSIONS')
  })

  test('conversions has same goals as sales', () => {
    const salesGoal: OptimizationGoalMap['sales'] = 'VALUE'
    const conversionsGoal: OptimizationGoalMap['conversions'] = 'VALUE'
    expect(salesGoal).toBe(conversionsGoal)
  })

  // @ts-expect-error — LINK_CLICKS is not valid for sales objective
  const _invalidSalesGoal: OptimizationGoalMap['sales'] = 'LINK_CLICKS'

  test('app-promotion accepts APP_INSTALLS', () => {
    const goal: OptimizationGoalMap['app-promotion'] = 'APP_INSTALLS'
    expect(goal).toBe('APP_INSTALLS')
  })

  test('awareness accepts REACH', () => {
    const goal: OptimizationGoalMap['awareness'] = 'REACH'
    expect(goal).toBe('REACH')
  })

  test('leads accepts LEAD_GENERATION', () => {
    const goal: OptimizationGoalMap['leads'] = 'LEAD_GENERATION'
    expect(goal).toBe('LEAD_GENERATION')
  })

  test('engagement accepts POST_ENGAGEMENT', () => {
    const goal: OptimizationGoalMap['engagement'] = 'POST_ENGAGEMENT'
    expect(goal).toBe('POST_ENGAGEMENT')
  })
})

describe('AdSetConfig generic constraint', () => {
  test('traffic AdSetConfig accepts valid optimization', () => {
    const config: AdSetConfig<'traffic'> = {
      targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
      optimization: 'LINK_CLICKS',
    }
    expect(config.optimization).toBe('LINK_CLICKS')
  })

  test('rejects invalid optimization for traffic', () => {
    // Verify APP_INSTALLS is rejected at compile time for traffic objective.
    // If this line does NOT error, the generic constraint is broken.
    const _config: AdSetConfig<'traffic'> = {
      targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
      // @ts-expect-error — APP_INSTALLS is not valid for traffic
      optimization: 'APP_INSTALLS',
    }
  })

  test('optimization is optional', () => {
    const config: AdSetConfig<'traffic'> = {
      targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
    }
    expect(config.optimization).toBeUndefined()
  })

  test('all AdSetConfig fields are optional except targeting', () => {
    const minimal: AdSetConfig<'sales'> = {
      targeting: { geo: [{ type: 'geo', countries: ['DE'] }] },
    }
    expect(minimal.bidding).toBeUndefined()
    expect(minimal.placements).toBeUndefined()
    expect(minimal.schedule).toBeUndefined()
    expect(minimal.status).toBeUndefined()
  })
})

describe('Creative types', () => {
  test('ImageAd has optional name, url, cta', () => {
    const ad: ImageAd = {
      format: 'image',
      image: './hero.png',
      headline: 'Test',
      primaryText: 'Test text',
    }
    expect(ad.name).toBeUndefined()
    expect(ad.url).toBeUndefined()
    expect(ad.cta).toBeUndefined()
  })

  test('VideoAd has optional name, url, cta', () => {
    const ad: VideoAd = {
      format: 'video',
      video: './demo.mp4',
      headline: 'Test',
      primaryText: 'Test text',
    }
    expect(ad.name).toBeUndefined()
    expect(ad.url).toBeUndefined()
    expect(ad.cta).toBeUndefined()
  })

  test('CarouselAd has optional name, url, cta', () => {
    const ad: CarouselAd = {
      format: 'carousel',
      cards: [
        { image: './a.png', headline: 'A', url: 'https://a.com' },
        { image: './b.png', headline: 'B', url: 'https://b.com' },
      ],
      primaryText: 'Test',
    }
    expect(ad.name).toBeUndefined()
    expect(ad.url).toBeUndefined()
    expect(ad.cta).toBeUndefined()
  })

  test('MetaCreative union accepts all formats', () => {
    const creatives: MetaCreative[] = [
      { format: 'image', image: './a.png', headline: 'H', primaryText: 'P' },
      { format: 'video', video: './v.mp4', headline: 'H', primaryText: 'P' },
      { format: 'carousel', cards: [{ image: './c.png', headline: 'H', url: 'https://c.com' }, { image: './d.png', headline: 'D', url: 'https://d.com' }], primaryText: 'P' },
      { format: 'collection', instantExperience: 'ie_123', headline: 'H', primaryText: 'P' },
    ]
    expect(creatives).toHaveLength(4)
  })
})

describe('BidStrategy type', () => {
  test('accepts all valid bid strategies', () => {
    const strategies: BidStrategy[] = [
      { type: 'LOWEST_COST_WITHOUT_CAP' },
      { type: 'LOWEST_COST_WITH_BID_CAP', cap: 5 },
      { type: 'COST_CAP', cap: 10 },
      { type: 'MINIMUM_ROAS', floor: 2.5 },
      { type: 'BID_CAP', cap: 3 },
    ]
    expect(strategies).toHaveLength(5)
  })
})

describe('MetaPlacements type', () => {
  test('accepts automatic string', () => {
    const p: MetaPlacements = 'automatic'
    expect(p).toBe('automatic')
  })

  test('accepts manual placement config', () => {
    const p: MetaPlacements = {
      platforms: ['facebook', 'instagram'],
      positions: ['feed', 'story'],
    }
    expect(typeof p).toBe('object')
  })
})

describe('AdSetContent type', () => {
  test('ads is required, url and cta are optional', () => {
    const content: AdSetContent = {
      ads: [
        { format: 'image', image: './hero.png', headline: 'H', primaryText: 'P' },
      ],
    }
    expect(content.url).toBeUndefined()
    expect(content.cta).toBeUndefined()
  })

  test('accepts url and cta for ad-set-level defaults', () => {
    const content: AdSetContent = {
      ads: [{ format: 'image', image: './hero.png', headline: 'H', primaryText: 'P' }],
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
    }
    expect(content.url).toBe('https://renamed.to')
    expect(content.cta).toBe('SIGN_UP')
  })
})

describe('MetaCampaignConfig type', () => {
  test('all fields are optional', () => {
    const config: MetaCampaignConfig = {}
    expect(config.budget).toBeUndefined()
    expect(config.status).toBeUndefined()
  })

  test('accepts special ad categories', () => {
    const config: MetaCampaignConfig = {
      specialAdCategories: ['HOUSING', 'CREDIT'],
    }
    expect(config.specialAdCategories).toHaveLength(2)
  })
})

describe('MetaTargeting type', () => {
  test('geo is required, everything else optional', () => {
    const targeting: MetaTargeting = {
      geo: [{ type: 'geo', countries: ['US'] }],
    }
    expect(targeting.age).toBeUndefined()
    expect(targeting.interests).toBeUndefined()
  })

  test('accepts full targeting config', () => {
    const targeting: MetaTargeting = {
      geo: [{ type: 'geo', countries: ['US', 'DE'] }],
      age: { min: 25, max: 65 },
      genders: ['male', 'female'],
      customAudiences: ['aud-1'],
      interests: [{ id: '123', name: 'Tech' }],
      behaviors: [{ id: '456', name: 'Travel' }],
      advantageAudience: true,
      locales: [6, 24],
    }
    expect(targeting.geo).toHaveLength(1)
  })
})
