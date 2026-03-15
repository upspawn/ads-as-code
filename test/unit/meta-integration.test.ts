import { describe, expect, test } from 'bun:test'
import { meta } from '../../src/meta/index.ts'
import type { MetaCampaign } from '../../src/meta/index.ts'
import { flattenMeta } from '../../src/meta/flatten.ts'
import { codegenMeta } from '../../src/meta/codegen.ts'
import { diff } from '../../src/core/diff.ts'
import type { Resource, Change } from '../../src/core/types.ts'
import {
  metaTargeting,
  age,
  audience,
  interests,
  excludeAudience,
} from '../../src/helpers/meta-targeting.ts'
import { image, video } from '../../src/helpers/meta-creative.ts'
import { costCap, lowestCost } from '../../src/helpers/meta-bidding.ts'
import { automatic, manual } from '../../src/helpers/meta-placement.ts'
import { daily } from '../../src/helpers/budget.ts'
import { geo } from '../../src/helpers/targeting.ts'

// ─── Test Helpers ────────────────────────────────────────

/** Extract changes of a specific op from a changeset */
function changesOfOp(changes: readonly Change[], op: 'create' | 'update' | 'delete'): Change[] {
  return changes.filter(c => c.op === op)
}

/** Simulate "live state" by cloning desired resources with platform IDs */
function addPlatformIds(resources: Resource[], prefix: string): Resource[] {
  return resources.map((r, i) => ({
    ...r,
    platformId: `${prefix}-${i}`,
  }))
}

// ─── Task 29, Step 1: Full Pipeline Test ──────────────────

describe('Meta end-to-end: builder -> flatten -> diff', () => {
  test('new campaign produces creates for all resources', () => {
    // 1. Define campaign using the builder DSL
    const campaign = meta.traffic('Retargeting - US', {
      budget: daily(5),
    })
    .adSet('Website Visitors 30d', {
      targeting: metaTargeting(
        geo('US', 'GB'),
        age(25, 65),
        audience('Website Visitors 30d'),
      ),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Rename Files Instantly',
          primaryText: 'Stop wasting hours organizing files manually.',
          description: 'AI-powered file renaming for teams',
        }),
      ],
    })
    .build()

    // 2. Flatten to Resource[]
    const desired = flattenMeta(campaign)

    // 3. No live state -> all creates
    const actual: Resource[] = []
    const changeset = diff(desired, actual)

    // Verify: all desired resources become creates
    expect(changeset.creates).toHaveLength(desired.length)
    expect(changeset.updates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)

    // Verify resource kinds in creates
    const createKinds = changeset.creates.map(c => c.resource.kind)
    expect(createKinds).toContain('campaign')
    expect(createKinds).toContain('adSet')
    expect(createKinds).toContain('creative')
    expect(createKinds).toContain('ad')
  })

  test('identical live state produces no changes', () => {
    const campaign = meta.traffic('Retargeting - US', {
      budget: daily(5),
    })
    .adSet('Website Visitors 30d', {
      targeting: metaTargeting(geo('US'), age(25, 65)),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Rename Files',
          primaryText: 'AI-powered file renaming.',
        }),
      ],
    })
    .build()

    const desired = flattenMeta(campaign)

    // Simulate live state matching desired exactly
    const actual = addPlatformIds(desired, 'live')

    const changeset = diff(desired, actual)

    expect(changeset.creates).toHaveLength(0)
    expect(changeset.updates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)
  })

  test('changed ad copy produces updates', () => {
    const campaignV1 = meta.traffic('Test Campaign', {
      budget: daily(5),
    })
    .adSet('US Visitors', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Original Headline',
          primaryText: 'Original body text.',
        }),
      ],
    })
    .build()

    const campaignV2 = meta.traffic('Test Campaign', {
      budget: daily(5),
    })
    .adSet('US Visitors', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Updated Headline',
          primaryText: 'Updated body text.',
        }),
      ],
    })
    .build()

    const actual = addPlatformIds(flattenMeta(campaignV1), 'live')
    const desired = flattenMeta(campaignV2)

    const changeset = diff(desired, actual)

    // Campaign and ad set are unchanged, creative and ad have updates
    expect(changeset.creates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)

    // The creative should show changes for headline and primaryText
    const creativeUpdate = changeset.updates.find(
      u => u.resource.kind === 'creative',
    )
    expect(creativeUpdate).toBeDefined()
    if (creativeUpdate && creativeUpdate.op === 'update') {
      const changedFields = creativeUpdate.changes.map(c => c.field)
      expect(changedFields).toContain('headline')
      expect(changedFields).toContain('primaryText')
    }
  })

  test('removed ad set produces deletes when in managed paths', () => {
    // V1: two ad sets
    const campaignV1 = meta.traffic('Multi AdSet', {
      budget: daily(10),
    })
    .adSet('US Visitors', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'US Hero',
          primaryText: 'For the US market.',
        }),
      ],
    })
    .adSet('DE Visitors', {
      targeting: metaTargeting(geo('DE')),
    }, {
      url: 'https://renamed.to/de',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/de-hero.png', {
          headline: 'DE Hero',
          primaryText: 'Fur den deutschen Markt.',
        }),
      ],
    })
    .build()

    // V2: only first ad set remains
    const campaignV2 = meta.traffic('Multi AdSet', {
      budget: daily(10),
    })
    .adSet('US Visitors', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'US Hero',
          primaryText: 'For the US market.',
        }),
      ],
    })
    .build()

    const actual = addPlatformIds(flattenMeta(campaignV1), 'live')
    const desired = flattenMeta(campaignV2)

    // Mark all V1 paths as managed
    const managedPaths = new Set(actual.map(r => r.path))

    const changeset = diff(desired, actual, managedPaths)

    // DE ad set, its creative, and its ad should be deleted
    expect(changeset.deletes.length).toBeGreaterThanOrEqual(3)

    const deletedPaths = changeset.deletes.map(d => d.resource.path)
    expect(deletedPaths.some(p => p.includes('de-visitors'))).toBe(true)
  })

  test('added ad set produces creates', () => {
    const campaignV1 = meta.traffic('Growing Campaign', {
      budget: daily(5),
    })
    .adSet('Existing AdSet', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Existing',
          primaryText: 'Existing ad.',
        }),
      ],
    })
    .build()

    const campaignV2 = meta.traffic('Growing Campaign', {
      budget: daily(5),
    })
    .adSet('Existing AdSet', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Existing',
          primaryText: 'Existing ad.',
        }),
      ],
    })
    .adSet('New AdSet', {
      targeting: metaTargeting(geo('DE')),
    }, {
      url: 'https://renamed.to/new',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/new.png', {
          headline: 'Brand New',
          primaryText: 'A new ad set.',
        }),
      ],
    })
    .build()

    const actual = addPlatformIds(flattenMeta(campaignV1), 'live')
    const desired = flattenMeta(campaignV2)

    const changeset = diff(desired, actual)

    // New ad set + its creative + its ad = 3 creates
    expect(changeset.creates).toHaveLength(3)
    const createKinds = changeset.creates.map(c => c.resource.kind).sort()
    expect(createKinds).toEqual(['ad', 'adSet', 'creative'])
  })
})

// ─── Task 29, Step 2: Round-Trip Test ────────────────────

describe('Meta round-trip: builder -> flatten -> codegen', () => {
  test('codegen produces valid code matching original campaign structure', () => {
    const campaign = meta.traffic('Retargeting - US', {
      budget: daily(5),
    })
    .adSet('Website Visitors 30d', {
      targeting: metaTargeting(
        geo('US', 'GB', 'CA', 'AU'),
        age(25, 65),
        audience('Website Visitors 30d'),
      ),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Rename Files Instantly',
          primaryText: 'Stop wasting hours organizing files manually.',
          description: 'AI-powered file renaming for teams',
        }),
      ],
    })
    .build()

    // Flatten -> codegen
    const resources = flattenMeta(campaign)
    const code = codegenMeta(resources)

    // Verify generated code contains the essential structure
    expect(code).toContain("meta.traffic('Retargeting - US'")
    expect(code).toContain('daily(5)')
    expect(code).toContain(".adSet('Website Visitors 30d'")
    expect(code).toContain("geo('US', 'GB', 'CA', 'AU')")
    expect(code).toContain('age(25, 65)')
    expect(code).toContain("audience('Website Visitors 30d')")
    expect(code).toContain("image('./assets/hero.png'")
    expect(code).toContain("headline: 'Rename Files Instantly'")

    // Verify the import statement includes used helpers
    expect(code).toContain("from '@upspawn/ads'")
    const importLine = code.split('\n').find(l => l.startsWith('import'))!
    expect(importLine).toContain('meta')
    expect(importLine).toContain('daily')
    expect(importLine).toContain('targeting')
    expect(importLine).toContain('geo')
    expect(importLine).toContain('age')
    expect(importLine).toContain('audience')
    expect(importLine).toContain('image')
  })

  test('codegen omits default values for clean output', () => {
    const campaign = meta.traffic('Minimal', {
      budget: daily(3),
    })
    .adSet('US Visitors', {
      targeting: metaTargeting(geo('US')),
      // No bidding, no placements, no optimization -> all defaults
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'H',
          primaryText: 'P',
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const code = codegenMeta(resources)

    // Defaults should NOT appear in generated code
    expect(code).not.toContain('lowestCost')
    expect(code).not.toContain('bidding:')
    expect(code).not.toContain('placements:')
    expect(code).not.toContain("status:")
    // Default optimization (LINK_CLICKS for traffic) should also be omitted
    expect(code).not.toContain('optimization:')
  })

  test('codegen preserves non-default values', () => {
    const campaign = meta.traffic('Custom Config', {
      budget: daily(10),
      status: 'ACTIVE',
    })
    .adSet('Custom AdSet', {
      targeting: metaTargeting(geo('US')),
      optimization: 'LANDING_PAGE_VIEWS',
      bidding: costCap(8),
      placements: manual(['facebook', 'instagram'], ['feed', 'story']),
      status: 'ACTIVE',
    }, {
      url: 'https://renamed.to',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/hero.png', {
          headline: 'Custom',
          primaryText: 'Custom ad.',
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const code = codegenMeta(resources)

    // Non-default values should appear
    expect(code).toContain("status: 'ACTIVE'")
    expect(code).toContain("optimization: 'LANDING_PAGE_VIEWS'")
    expect(code).toContain('costCap(8)')
    expect(code).toContain('manual(')
    expect(code).toContain("'facebook'")
    expect(code).toContain("'instagram'")
  })

  test('round-trip with multiple ad sets and ads', () => {
    const campaign = meta.traffic('Multi', {
      budget: daily(10),
    })
    .adSet('US Set', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'US Hero',
          primaryText: 'For the US.',
        }),
        image('./assets/comparison.png', {
          headline: 'Before After',
          primaryText: 'See the difference.',
        }),
      ],
    })
    .adSet('DE Set', {
      targeting: metaTargeting(geo('DE')),
    }, {
      url: 'https://renamed.to/de',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/de-hero.png', {
          headline: 'DE Hero',
          primaryText: 'Fur Deutschland.',
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const code = codegenMeta(resources)

    // Both ad sets should appear
    expect(code).toContain(".adSet('US Set'")
    expect(code).toContain(".adSet('DE Set'")

    // All ads present
    expect(code).toContain("'US Hero'")
    expect(code).toContain("'Before After'")
    expect(code).toContain("'DE Hero'")
  })
})

// ─── Task 29, Step 3: Default Resolution Test ────────────

describe('Meta default resolution (minimal campaign)', () => {
  test('minimal campaign with no bidding/placements/optimization gets all defaults', () => {
    const campaign = meta.traffic('Minimal Campaign')
    .adSet('Basic AdSet', {
      targeting: metaTargeting(geo('US')),
      // Everything else omitted -> defaults
    }, {
      url: 'https://example.com',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/basic.png', {
          headline: 'Basic',
          primaryText: 'A basic ad.',
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)

    // Campaign defaults — _defaults is in meta, not properties
    const campaignRes = resources.find(r => r.kind === 'campaign')!
    expect(campaignRes.properties.status).toBe('PAUSED')
    expect(campaignRes.meta?._defaults).toContain('status')
    expect(campaignRes.properties._defaults).toBeUndefined()

    // Ad set defaults — placements omitted when automatic
    const adSetRes = resources.find(r => r.kind === 'adSet')!
    expect(adSetRes.properties.optimization).toBe('LINK_CLICKS')
    expect(adSetRes.properties.bidding).toEqual({ type: 'LOWEST_COST_WITHOUT_CAP' })
    expect(adSetRes.properties.placements).toBeUndefined()
    expect(adSetRes.properties.status).toBe('PAUSED')

    const adSetDefaults = adSetRes.meta?._defaults as string[]
    expect(adSetDefaults).toContain('optimization')
    expect(adSetDefaults).toContain('bidding')
    expect(adSetDefaults).toContain('placements')
    expect(adSetDefaults).toContain('status')

    // Ad name: derived from filename by the image() helper (not a flatten default)
    const adRes = resources.find(r => r.kind === 'ad')!
    expect(adRes.properties.name).toBe('basic')
  })

  test('different objectives produce different default optimizations', () => {
    const objectives = [
      { method: 'awareness' as const, expected: 'REACH' },
      { method: 'traffic' as const, expected: 'LINK_CLICKS' },
      { method: 'engagement' as const, expected: 'POST_ENGAGEMENT' },
      { method: 'leads' as const, expected: 'LEAD_GENERATION' },
      { method: 'sales' as const, expected: 'OFFSITE_CONVERSIONS' },
      { method: 'conversions' as const, expected: 'OFFSITE_CONVERSIONS' },
    ] as const

    for (const { method, expected } of objectives) {
      const campaign = meta[method]('Test')
        .adSet('Set', {
          targeting: metaTargeting(geo('US')),
        }, {
          url: 'https://example.com',
          cta: 'LEARN_MORE',
          ads: [
            image('./assets/test.png', { headline: 'H', primaryText: 'P' }),
          ],
        })
        .build()

      const resources = flattenMeta(campaign)
      const adSet = resources.find(r => r.kind === 'adSet')!
      expect(adSet.properties.optimization).toBe(expected)
    }
  })
})

// ─── Task 29, Step 4: Validation Test ────────────────────

describe('Meta validation errors', () => {
  test('missing url on both ad and ad set content defaults to empty string', () => {
    const campaign = meta.traffic('Validation Test')
    .adSet('No URL', {
      targeting: metaTargeting(geo('US')),
    }, {
      // No url on content
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'H',
          primaryText: 'P',
          // No url on ad either
        }),
      ],
    })
    .build()

    // Missing url/cta now defaults instead of throwing (for boosted posts / post-engagement ads)
    const resources = flattenMeta(campaign)
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.url).toBe('')
  })

  test('missing cta on both ad and ad set content defaults to NO_BUTTON', () => {
    const campaign = meta.traffic('Validation Test')
    .adSet('No CTA', {
      targeting: metaTargeting(geo('US')),
    }, {
      url: 'https://renamed.to',
      // No cta on content
      ads: [
        image('./assets/hero.png', {
          headline: 'H',
          primaryText: 'P',
          // No cta on ad either
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.cta).toBe('NO_BUTTON')
  })

  test('missing both url and cta on both levels defaults both', () => {
    const campaign = meta.traffic('Validation Test')
    .adSet('No Defaults', {
      targeting: metaTargeting(geo('US')),
    }, {
      // No url, no cta on content
      ads: [
        image('./assets/hero.png', {
          headline: 'H',
          primaryText: 'P',
          // No url or cta on ad
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const creative = resources.find(r => r.kind === 'creative')!
    expect(creative.properties.url).toBe('')
    expect(creative.properties.cta).toBe('NO_BUTTON')
  })

  test('url/cta set on ad level overrides missing ad set defaults', () => {
    const campaign = meta.traffic('Override Test')
    .adSet('Ad Level Defaults', {
      targeting: metaTargeting(geo('US')),
    }, {
      // No url or cta on content
      ads: [
        image('./assets/hero.png', {
          headline: 'H',
          primaryText: 'P',
          url: 'https://renamed.to',
          cta: 'SIGN_UP',
        }),
      ],
    })
    .build()

    // Should NOT throw — ad-level url/cta are sufficient
    expect(() => flattenMeta(campaign)).not.toThrow()
  })
})

// ─── Task 31, Step 3: Spec DSL Example Compiles ──────────

describe('spec DSL example compiles and flattens correctly', () => {
  test('exact spec example produces valid resources', () => {
    // This is the exact campaign definition from the spec
    const retargetingUS = meta.traffic('Retargeting - US', {
      budget: daily(5),
    })
    .adSet('Website Visitors 30d', {
      targeting: metaTargeting(
        audience('Website Visitors 30d'),
        geo('US', 'GB', 'CA', 'AU'),
        age(25, 65),
      ),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Rename Files Instantly',
          primaryText: 'Stop wasting hours organizing files manually...',
          description: 'AI-powered file renaming for teams',
        }),
        image('./assets/comparison.png', {
          headline: 'Before & After',
          primaryText: 'See what renamed.to does to a messy folder',
          cta: 'LEARN_MORE',
          url: 'https://renamed.to/tour',
        }),
      ],
    })
    .adSet('Cold - Construction', {
      targeting: metaTargeting(
        geo('US', 'DE'),
        age(30, 60),
        ...interests('Construction', 'Building Information Modeling'),
      ),
      optimization: 'LANDING_PAGE_VIEWS',
      dsa: { beneficiary: 'Other Entity', payor: 'Other Entity' },
    }, {
      url: 'https://renamed.to/construction',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/construction.png', {
          headline: 'Rename 1000 Plans in Seconds',
          primaryText: 'Construction teams waste 2hrs/week on file naming...',
        }),
      ],
    })

    // Verify the builder has the right provider/kind for discovery
    expect(retargetingUS.provider).toBe('meta')
    expect(retargetingUS.kind).toBe('traffic')

    // Build and flatten
    const campaign = retargetingUS.build()
    const resources = flattenMeta(campaign)

    // 1 campaign + 2 ad sets + 3 creatives + 3 ads = 9
    expect(resources).toHaveLength(9)

    // Campaign
    const campaignRes = resources.find(r => r.kind === 'campaign')!
    expect(campaignRes.path).toBe('retargeting-us')
    expect(campaignRes.properties.objective).toBe('OUTCOME_TRAFFIC')
    expect(campaignRes.properties.budget).toEqual({ amount: 5, currency: 'EUR', period: 'daily' })

    // Ad sets
    const adSets = resources.filter(r => r.kind === 'adSet')
    expect(adSets).toHaveLength(2)

    const visitors = adSets.find(r => r.path === 'retargeting-us/website-visitors-30d')!
    expect(visitors.properties.optimization).toBe('LINK_CLICKS') // default for traffic
    // Automatic placements are omitted to match fetch behavior
    expect(visitors.properties.placements).toBeUndefined()

    const construction = adSets.find(r => r.path === 'retargeting-us/cold-construction')!
    expect(construction.properties.optimization).toBe('LANDING_PAGE_VIEWS') // explicitly set
    expect(construction.properties.dsa).toEqual({
      beneficiary: 'Other Entity',
      payor: 'Other Entity',
    })

    // Creatives
    const creatives = resources.filter(r => r.kind === 'creative')
    expect(creatives).toHaveLength(3)

    // The comparison ad overrides url/cta from ad set defaults.
    // Path uses the filename-derived name "comparison" (not the headline "Before & After").
    const comparisonCreative = creatives.find(
      r => r.path === 'retargeting-us/website-visitors-30d/comparison/cr',
    )!
    expect(comparisonCreative.properties.url).toBe('https://renamed.to/tour')
    expect(comparisonCreative.properties.cta).toBe('LEARN_MORE')

    // The hero ad inherits url/cta from ad set content
    const heroCreative = creatives.find(
      r => r.path === 'retargeting-us/website-visitors-30d/hero/cr',
    )!
    expect(heroCreative.properties.url).toBe('https://renamed.to')
    expect(heroCreative.properties.cta).toBe('SIGN_UP')

    // Construction ad inherits from its ad set content
    const constructionCreative = creatives.find(
      r => r.path === 'retargeting-us/cold-construction/construction/cr',
    )!
    expect(constructionCreative.properties.url).toBe('https://renamed.to/construction')
    expect(constructionCreative.properties.cta).toBe('LEARN_MORE')

    // Ads reference their creatives
    const ads = resources.filter(r => r.kind === 'ad')
    expect(ads).toHaveLength(3)
    for (const ad of ads) {
      expect(ad.properties.creativePath).toBeDefined()
      expect(typeof ad.properties.creativePath).toBe('string')
    }
  })

  test('spec example round-trips through codegen', () => {
    const campaign = meta.traffic('Retargeting - US', {
      budget: daily(5),
    })
    .adSet('Website Visitors 30d', {
      targeting: metaTargeting(
        audience('Website Visitors 30d'),
        geo('US', 'GB', 'CA', 'AU'),
        age(25, 65),
      ),
    }, {
      url: 'https://renamed.to',
      cta: 'SIGN_UP',
      ads: [
        image('./assets/hero.png', {
          headline: 'Rename Files Instantly',
          primaryText: 'Stop wasting hours organizing files manually...',
          description: 'AI-powered file renaming for teams',
        }),
      ],
    })
    .build()

    const resources = flattenMeta(campaign)
    const code = codegenMeta(resources)

    // Generated code should be a valid TypeScript-looking string
    expect(code).toContain('import {')
    expect(code).toContain("} from '@upspawn/ads'")
    expect(code).toContain('export const retargetingUs')
    expect(code).toContain("meta.traffic('Retargeting - US'")
  })
})
