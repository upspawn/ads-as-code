import { describe, expect, test } from 'bun:test'
import { flattenMeta } from '../../src/meta/flatten.ts'
import type { MetaCampaign, MetaAdSet } from '../../src/meta/flatten.ts'
import type { AdSetContent, MetaTargeting, ImageAd, VideoAd } from '../../src/meta/types.ts'

// ─── Test Data Builders ──────────────────────────────────

function makeTargeting(overrides?: Partial<MetaTargeting>): MetaTargeting {
  return {
    geo: [{ type: 'geo', countries: ['US', 'DE'] }],
    age: { min: 25, max: 65 },
    ...overrides,
  }
}

function makeImageAd(overrides?: Partial<ImageAd>): ImageAd {
  return {
    format: 'image',
    image: './assets/hero.png',
    headline: 'Rename Files Instantly',
    primaryText: 'Stop wasting hours organizing files manually.',
    ...overrides,
  }
}

/** Build a MetaAdSet. Pass any subset of fields to override defaults. */
function makeAdSet(partial?: Partial<MetaAdSet>): MetaAdSet {
  return {
    name: partial?.name ?? 'Website Visitors 30d',
    config: partial?.config ?? { targeting: makeTargeting() },
    content: partial?.content ?? {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [makeImageAd()],
    },
  }
}

function makeCampaign(overrides?: Partial<MetaCampaign>): MetaCampaign {
  return {
    provider: 'meta',
    kind: 'traffic',
    name: 'Retargeting - US',
    config: {
      budget: { amount: 5, currency: 'EUR', period: 'daily' },
    },
    adSets: [makeAdSet()],
    ...overrides,
  }
}

// ─── Path Generation ─────────────────────────────────────

describe('flattenMeta() path generation', () => {
  test('campaign path is slugified name', () => {
    const resources = flattenMeta(makeCampaign())
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.path).toBe('retargeting-us')
  })

  test('ad set path is campaign/adset', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.path).toBe('retargeting-us/website-visitors-30d')
  })

  test('creative path is campaign/adset/ad/cr', () => {
    const resources = flattenMeta(makeCampaign())
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.path).toBe('retargeting-us/website-visitors-30d/hero/cr')
  })

  test('ad path is campaign/adset/ad', () => {
    const resources = flattenMeta(makeCampaign())
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.path).toBe('retargeting-us/website-visitors-30d/hero')
  })

  test('ad references its creative path', () => {
    const resources = flattenMeta(makeCampaign())
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.creativePath).toBe('retargeting-us/website-visitors-30d/hero/cr')
  })

  test('campaign with 2 ad sets, each with 2 ads produces correct paths', () => {
    const campaign = makeCampaign({
      adSets: [
        makeAdSet({
          name: 'Website Visitors 30d',
          content: {
            url: 'https://renamed.to',
            cta: 'SIGN_UP',
            ads: [
              makeImageAd({ image: './assets/hero.png' }),
              makeImageAd({ image: './assets/comparison.png', name: 'Before & After' }),
            ],
          },
        }),
        makeAdSet({
          name: 'Cold - Construction',
          content: {
            url: 'https://renamed.to/construction',
            cta: 'LEARN_MORE',
            ads: [
              makeImageAd({ image: './assets/construction.png' }),
              makeImageAd({ image: './assets/plans.png', name: 'Plans Ad' }),
            ],
          },
        }),
      ],
    })

    const resources = flattenMeta(campaign)

    // 1 campaign + 2 ad sets + 4 creatives + 4 ads = 11
    expect(resources).toHaveLength(11)

    // Campaign
    expect(resources.find(r => r.kind === 'campaign')!.path).toBe('retargeting-us')

    // Ad sets
    const adSets = resources.filter(r => r.kind === 'adSet')
    expect(adSets).toHaveLength(2)
    expect(adSets.map(r => r.path).sort()).toEqual([
      'retargeting-us/cold-construction',
      'retargeting-us/website-visitors-30d',
    ])

    // Creatives
    const creatives = resources.filter(r => r.kind === 'creative')
    expect(creatives).toHaveLength(4)
    const creativePaths = creatives.map(r => r.path).sort()
    expect(creativePaths).toEqual([
      'retargeting-us/cold-construction/construction/cr',
      'retargeting-us/cold-construction/plans-ad/cr',
      'retargeting-us/website-visitors-30d/before-after/cr',
      'retargeting-us/website-visitors-30d/hero/cr',
    ])

    // Ads
    const ads = resources.filter(r => r.kind === 'ad')
    expect(ads).toHaveLength(4)
    const adPaths = ads.map(r => r.path).sort()
    expect(adPaths).toEqual([
      'retargeting-us/cold-construction/construction',
      'retargeting-us/cold-construction/plans-ad',
      'retargeting-us/website-visitors-30d/before-after',
      'retargeting-us/website-visitors-30d/hero',
    ])

    // All paths are unique
    const allPaths = resources.map(r => r.path)
    expect(new Set(allPaths).size).toBe(allPaths.length)
  })
})

// ─── Ad Name Derivation ──────────────────────────────────

describe('flattenMeta() ad name derivation', () => {
  test('derives name from image filename (strips path + extension)', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd({ image: './assets/hero-sign-up.png' })],
        },
      })],
    }))
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.name).toBe('hero-sign-up')
  })

  test('uses explicit name when provided', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd({ name: 'Hero Ad', image: './assets/hero.png' })],
        },
      })],
    }))
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.name).toBe('Hero Ad')
  })

  test('derives name from video filename', () => {
    const videoAd: VideoAd = {
      format: 'video',
      video: './assets/demo-reel.mp4',
      headline: 'Watch Demo',
      primaryText: 'See renamed.to in action.',
    }
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [videoAd],
        },
      })],
    }))
    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties.name).toBe('demo-reel')
  })
})

// ─── Default Resolution ──────────────────────────────────

describe('flattenMeta() default resolution', () => {
  test('defaults optimization to LINK_CLICKS for traffic objective', () => {
    const resources = flattenMeta(makeCampaign({ kind: 'traffic' }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.optimization).toBe('LINK_CLICKS')
  })

  test('defaults optimization to OFFSITE_CONVERSIONS for conversions objective', () => {
    const resources = flattenMeta(makeCampaign({ kind: 'conversions' }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.optimization).toBe('OFFSITE_CONVERSIONS')
  })

  test('defaults optimization to REACH for awareness objective', () => {
    const resources = flattenMeta(makeCampaign({ kind: 'awareness' }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.optimization).toBe('REACH')
  })

  test('uses explicit optimization when provided', () => {
    const resources = flattenMeta(makeCampaign({
      kind: 'traffic',
      adSets: [makeAdSet({
        config: {
          targeting: makeTargeting(),
          optimization: 'LANDING_PAGE_VIEWS',
        },
      })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.optimization).toBe('LANDING_PAGE_VIEWS')
  })

  test('defaults bidding to LOWEST_COST_WITHOUT_CAP', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.bidding).toEqual({ type: 'LOWEST_COST_WITHOUT_CAP' })
  })

  test('uses explicit bidding when provided', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        config: {
          targeting: makeTargeting(),
          bidding: { type: 'COST_CAP', cap: 10 },
        },
      })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.bidding).toEqual({ type: 'COST_CAP', cap: 10 })
  })

  test('defaults placements to automatic', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.placements).toBe('automatic')
  })

  test('defaults status to PAUSED', () => {
    const resources = flattenMeta(makeCampaign())
    const campaign = resources.find(r => r.kind === 'campaign')!
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(campaign.properties.status).toBe('PAUSED')
    expect(adSet.properties.status).toBe('PAUSED')
  })

  test('uses explicit status when provided', () => {
    const resources = flattenMeta(makeCampaign({
      config: { budget: { amount: 5, currency: 'EUR', period: 'daily' }, status: 'ACTIVE' },
      adSets: [makeAdSet({
        config: { targeting: makeTargeting(), status: 'ACTIVE' },
      })],
    }))
    const campaign = resources.find(r => r.kind === 'campaign')!
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(campaign.properties.status).toBe('ACTIVE')
    expect(adSet.properties.status).toBe('ACTIVE')
  })

  test('ad url inherits from ad set content when not set on ad', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd()],  // no url on ad
        },
      })],
    }))
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.url).toBe('https://renamed.to')
  })

  test('ad url overrides ad set content when set on ad', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd({ url: 'https://renamed.to/tour' })],
        },
      })],
    }))
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.url).toBe('https://renamed.to/tour')
  })

  test('ad cta inherits from ad set content when not set on ad', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd()],  // no cta on ad
        },
      })],
    }))
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.cta).toBe('SIGN_UP')
  })

  test('ad cta overrides ad set content when set on ad', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd({ cta: 'LEARN_MORE' })],
        },
      })],
    }))
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.cta).toBe('LEARN_MORE')
  })
})

// ─── Default Tracking (_defaults array) ──────────────────

describe('flattenMeta() default tracking', () => {
  test('tracks defaulted fields on campaign', () => {
    const resources = flattenMeta(makeCampaign())
    const campaign = resources.find(r => r.kind === 'campaign')!
    const defaults = campaign.properties._defaults as string[]
    expect(defaults).toContain('status')
  })

  test('tracks defaulted fields on ad set', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    const defaults = adSet.properties._defaults as string[]
    expect(defaults).toContain('optimization')
    expect(defaults).toContain('bidding')
    expect(defaults).toContain('placements')
    expect(defaults).toContain('status')
  })

  test('tracks defaulted fields on ad (name, url, cta from ad set)', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd()],  // no explicit name, url, or cta
        },
      })],
    }))
    const ad = resources.find(r => r.kind === 'ad')!
    const defaults = ad.properties._defaults as string[]
    expect(defaults).toContain('name')
    expect(defaults).toContain('url')
    expect(defaults).toContain('cta')
  })

  test('does not track explicitly set fields', () => {
    const resources = flattenMeta(makeCampaign({
      config: { budget: { amount: 5, currency: 'EUR', period: 'daily' }, status: 'ACTIVE' },
      adSets: [makeAdSet({
        config: {
          targeting: makeTargeting(),
          optimization: 'LANDING_PAGE_VIEWS',
          bidding: { type: 'COST_CAP', cap: 10 },
          placements: 'automatic',
          status: 'ACTIVE',
        },
        content: {
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
          ads: [makeImageAd({
            name: 'Hero Ad',
            url: 'https://renamed.to/hero',
            cta: 'LEARN_MORE',
          })],
        },
      })],
    }))

    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties._defaults).toBeUndefined()

    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties._defaults).toBeUndefined()

    const ad = resources.find(r => r.kind === 'ad')!
    expect(ad.properties._defaults).toBeUndefined()
  })

  test('tracks only the fields that were actually defaulted', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        config: {
          targeting: makeTargeting(),
          optimization: 'LANDING_PAGE_VIEWS',  // explicit
          // bidding, placements, status: defaulted
        },
      })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    const defaults = adSet.properties._defaults as string[]
    expect(defaults).not.toContain('optimization')
    expect(defaults).toContain('bidding')
    expect(defaults).toContain('placements')
    expect(defaults).toContain('status')
  })
})

// ─── Validation Errors ───────────────────────────────────

describe('flattenMeta() validation', () => {
  test('throws when url missing from both ad and ad set content', () => {
    expect(() => {
      flattenMeta(makeCampaign({
        adSets: [makeAdSet({
          content: {
            // no url on content
            cta: 'SIGN_UP',
            ads: [makeImageAd()],  // no url on ad
          },
        })],
      }))
    }).toThrow(/has no url/)
  })

  test('throws when cta missing from both ad and ad set content', () => {
    expect(() => {
      flattenMeta(makeCampaign({
        adSets: [makeAdSet({
          content: {
            url: 'https://renamed.to',
            // no cta on content
            ads: [makeImageAd()],  // no cta on ad
          },
        })],
      }))
    }).toThrow(/has no cta/)
  })

  test('does not throw when url and cta are set on ad directly', () => {
    expect(() => {
      flattenMeta(makeCampaign({
        adSets: [makeAdSet({
          content: {
            // no url or cta on content
            ads: [makeImageAd({ url: 'https://renamed.to', cta: 'SIGN_UP' })],
          },
        })],
      }))
    }).not.toThrow()
  })

  test('error message includes ad name and ad set name', () => {
    expect(() => {
      flattenMeta(makeCampaign({
        adSets: [{
          name: 'Cold Traffic',
          config: { targeting: makeTargeting() },
          content: {
            ads: [makeImageAd({ name: 'My Hero Ad' })],
          },
        }],
      }))
    }).toThrow(/My Hero Ad.*Cold Traffic/s)
  })
})

// ─── Campaign Properties ─────────────────────────────────

describe('flattenMeta() campaign properties', () => {
  test('includes objective as Meta API string', () => {
    const resources = flattenMeta(makeCampaign({ kind: 'traffic' }))
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties.objective).toBe('OUTCOME_TRAFFIC')
  })

  test('includes budget when set', () => {
    const resources = flattenMeta(makeCampaign())
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties.budget).toEqual({ amount: 5, currency: 'EUR', period: 'daily' })
  })

  test('omits budget when not set', () => {
    const resources = flattenMeta(makeCampaign({ config: {} }))
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties).not.toHaveProperty('budget')
  })

  test('includes specialAdCategories when set', () => {
    const resources = flattenMeta(makeCampaign({
      config: { specialAdCategories: ['HOUSING'] },
    }))
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties.specialAdCategories).toEqual(['HOUSING'])
  })
})

// ─── Ad Set Properties ───────────────────────────────────

describe('flattenMeta() ad set properties', () => {
  test('includes targeting', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.targeting).toEqual(makeTargeting())
  })

  test('includes optional fields when set', () => {
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        config: {
          targeting: makeTargeting(),
          schedule: { startTime: '2026-04-01' },
          dsa: { beneficiary: 'Upspawn', payor: 'Upspawn' },
        },
      })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties.schedule).toEqual({ startTime: '2026-04-01' })
    expect(adSet.properties.dsa).toEqual({ beneficiary: 'Upspawn', payor: 'Upspawn' })
  })

  test('omits optional fields when not set', () => {
    const resources = flattenMeta(makeCampaign())
    const adSet = resources.find(r => r.kind === 'adSet')!
    expect(adSet.properties).not.toHaveProperty('schedule')
    expect(adSet.properties).not.toHaveProperty('conversion')
    expect(adSet.properties).not.toHaveProperty('dsa')
    expect(adSet.properties).not.toHaveProperty('promotedObject')
    // budget on ad set level (not campaign level) is also optional
    expect(adSet.properties).not.toHaveProperty('budget')
  })
})

// ─── Creative Properties ─────────────────────────────────

describe('flattenMeta() creative properties', () => {
  test('image creative has correct properties', () => {
    const resources = flattenMeta(makeCampaign())
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.format).toBe('image')
    expect(creative.properties.image).toBe('./assets/hero.png')
    expect(creative.properties.headline).toBe('Rename Files Instantly')
    expect(creative.properties.primaryText).toBe('Stop wasting hours organizing files manually.')
  })

  test('image creative stores file path for later SHA computation', () => {
    const resources = flattenMeta(makeCampaign())
    const creative = resources.find(r => r.kind === 'creative')!
    // File path is stored in the creative properties for the upload task to process
    expect(creative.properties.image).toBe('./assets/hero.png')
  })

  test('video creative has correct properties', () => {
    const videoAd: VideoAd = {
      format: 'video',
      video: './assets/demo.mp4',
      thumbnail: './assets/thumb.jpg',
      headline: 'Watch Demo',
      primaryText: 'See it in action.',
      description: 'Quick overview',
    }
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({
        content: {
          url: 'https://renamed.to',
          cta: 'WATCH_MORE',
          ads: [videoAd],
        },
      })],
    }))
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.format).toBe('video')
    expect(creative.properties.video).toBe('./assets/demo.mp4')
    expect(creative.properties.thumbnail).toBe('./assets/thumb.jpg')
    expect(creative.properties.description).toBe('Quick overview')
  })
})

// ─── Interest/Audience Passthrough ───────────────────────

describe('flattenMeta() interest/audience markers', () => {
  test('string-based interests pass through as-is in targeting', () => {
    const targeting = makeTargeting({
      interests: [{ id: '6003370250981', name: 'Construction' }],
    })
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({ config: { targeting } })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    const t = adSet.properties.targeting as MetaTargeting
    expect(t.interests).toEqual([{ id: '6003370250981', name: 'Construction' }])
  })

  test('custom audiences pass through as-is in targeting', () => {
    const targeting = makeTargeting({
      customAudiences: ['Website Visitors 30d'],
    })
    const resources = flattenMeta(makeCampaign({
      adSets: [makeAdSet({ config: { targeting } })],
    }))
    const adSet = resources.find(r => r.kind === 'adSet')!
    const t = adSet.properties.targeting as MetaTargeting
    expect(t.customAudiences).toEqual(['Website Visitors 30d'])
  })
})

// ─── Edge Cases ──────────────────────────────────────────

describe('flattenMeta() edge cases', () => {
  test('campaign with no ad sets produces only campaign resource', () => {
    const resources = flattenMeta(makeCampaign({ adSets: [] }))
    expect(resources).toHaveLength(1)
    expect(resources[0]!.kind).toBe('campaign')
  })

  test('conversions objective maps to OUTCOME_SALES', () => {
    const resources = flattenMeta(makeCampaign({ kind: 'conversions' }))
    const campaign = resources.find(r => r.kind === 'campaign')!
    expect(campaign.properties.objective).toBe('OUTCOME_SALES')
  })

  test('all resource kinds are correct', () => {
    const resources = flattenMeta(makeCampaign())
    const kinds = resources.map(r => r.kind)
    expect(kinds).toEqual(['campaign', 'adSet', 'creative', 'ad'])
  })
})
