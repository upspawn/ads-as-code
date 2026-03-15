import { describe, expect, test } from 'bun:test'
import { codegenMeta } from '../../src/meta/codegen.ts'
import { flattenMeta } from '../../src/meta/flatten.ts'
import { meta } from '../../src/meta/index.ts'
import { manual } from '../../src/helpers/meta-placement.ts'
import { image } from '../../src/helpers/meta-creative.ts'
import { metaTargeting } from '../../src/helpers/meta-targeting.ts'
import { geo } from '../../src/helpers/targeting.ts'
import { daily } from '../../src/helpers/budget.ts'
import { diff } from '../../src/core/diff.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Helpers ─────────────────────────────────────────────

/** Build a minimal ad set resource with given placement properties. */
function makeAdSetWithPlacements(placements: Record<string, unknown>): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'test-campaign',
      properties: {
        name: 'Test Campaign',
        objective: 'OUTCOME_TRAFFIC',
        status: 'ACTIVE',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
      },
    },
    {
      kind: 'adSet',
      path: 'test-campaign/test-adset',
      properties: {
        name: 'Test AdSet',
        status: 'ACTIVE',
        targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
        optimization: 'LINK_CLICKS',
        bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
        placements,
      },
    },
    {
      kind: 'creative',
      path: 'test-campaign/test-adset/hero/cr',
      properties: {
        name: 'hero',
        format: 'image',
        headline: 'Test',
        primaryText: 'Test ad',
        cta: 'LEARN_MORE',
        url: 'https://example.com',
      },
      meta: { imagePath: './assets/hero.png' },
    },
    {
      kind: 'ad',
      path: 'test-campaign/test-adset/hero',
      properties: {
        name: 'hero',
        status: 'ACTIVE',
        creativePath: 'test-campaign/test-adset/hero/cr',
      },
    },
  ]
}

// ─── Tests ───────────────────────────────────────────────

describe('Meta placements round-trip', () => {
  test('platform-specific positions survive fetch -> codegen -> flatten cycle', () => {
    // Simulate what fetch produces: platforms with per-platform position arrays
    const fetchedPlacements = {
      platforms: ['facebook', 'instagram'],
      facebookPositions: ['feed', 'story', 'reels'],
      instagramPositions: ['stream', 'story', 'reels'],
    }

    const fetchedResources = makeAdSetWithPlacements(fetchedPlacements)

    // Codegen: resources -> TypeScript code
    const code = codegenMeta(fetchedResources)

    // Verify the generated code includes platform-specific positions
    expect(code).toContain('facebookPositions')
    expect(code).toContain('instagramPositions')
    expect(code).toContain("'feed'")
    expect(code).toContain("'stream'")

    // Now build the same campaign using the builder DSL to verify flatten output
    const campaign = meta.traffic('Test Campaign', {
      budget: daily(5),
      status: 'ACTIVE',
    })
    .adSet('Test AdSet', {
      targeting: metaTargeting(geo('US')),
      placements: manual(['facebook', 'instagram'], {
        facebookPositions: ['feed', 'story', 'reels'],
        instagramPositions: ['stream', 'story', 'reels'],
      }),
      status: 'ACTIVE',
    }, {
      url: 'https://example.com',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/hero.png', {
          headline: 'Test',
          primaryText: 'Test ad',
        }),
      ],
    })
    .build()

    // Flatten: builder -> Resource[]
    const flattenedResources = flattenMeta(campaign)
    const flattenedAdSet = flattenedResources.find(r => r.kind === 'adSet')!

    // Verify flatten preserves per-platform positions
    const flatPlacements = flattenedAdSet.properties.placements as Record<string, unknown>
    expect(flatPlacements.platforms).toEqual(['facebook', 'instagram'])
    expect(flatPlacements.facebookPositions).toEqual(['feed', 'story', 'reels'])
    expect(flatPlacements.instagramPositions).toEqual(['stream', 'story', 'reels'])
  })

  test('fetched placements diff against flattened placements produces zero changes', () => {
    const fetchedPlacements = {
      platforms: ['facebook', 'instagram'],
      facebookPositions: ['feed', 'story'],
      instagramPositions: ['stream', 'story'],
    }

    const fetchedResources = makeAdSetWithPlacements(fetchedPlacements)
    const liveResources = fetchedResources.map((r, i) => ({
      ...r,
      platformId: `live-${i}`,
    }))

    const campaign = meta.traffic('Test Campaign', {
      budget: daily(5),
      status: 'ACTIVE',
    })
    .adSet('Test AdSet', {
      targeting: metaTargeting(geo('US')),
      placements: manual(['facebook', 'instagram'], {
        facebookPositions: ['feed', 'story'],
        instagramPositions: ['stream', 'story'],
      }),
      status: 'ACTIVE',
    }, {
      url: 'https://example.com',
      cta: 'LEARN_MORE',
      ads: [
        image('./assets/hero.png', {
          headline: 'Test',
          primaryText: 'Test ad',
        }),
      ],
    })
    .build()

    const desiredResources = flattenMeta(campaign)
    const changeset = diff(desiredResources, liveResources)

    // No spurious placement diffs
    const adSetUpdates = changeset.updates.filter(c => c.resource.kind === 'adSet')
    expect(adSetUpdates).toHaveLength(0)
  })

  test('manual() with platform-specific positions returns correct shape', () => {
    const result = manual(['facebook', 'instagram'], {
      facebookPositions: ['feed', 'story'],
      instagramPositions: ['stream'],
    })

    expect(result).toEqual({
      platforms: ['facebook', 'instagram'],
      facebookPositions: ['feed', 'story'],
      instagramPositions: ['stream'],
    })
  })

  test('manual() with legacy flat positions still works', () => {
    const result = manual(['facebook'], ['feed', 'story'] as any)

    expect(result).toEqual({
      platforms: ['facebook'],
      positions: ['feed', 'story'],
    })
  })

  test('manual() with platforms only (no positions) still works', () => {
    const result = manual(['facebook', 'instagram'])

    expect(result).toEqual({
      platforms: ['facebook', 'instagram'],
    })
  })

  test('codegen emits manual() with platform-specific options object', () => {
    const resources = makeAdSetWithPlacements({
      platforms: ['facebook', 'instagram'],
      facebookPositions: ['feed', 'reels'],
      instagramPositions: ['stream', 'story', 'reels'],
    })

    const code = codegenMeta(resources)

    expect(code).toContain('manual(')
    expect(code).toContain('facebookPositions: [')
    expect(code).toContain('instagramPositions: [')
    expect(code).not.toMatch(/manual\(\[.*\], \[/)
  })

  test('codegen emits platforms-only when no positions are specified', () => {
    const resources = makeAdSetWithPlacements({
      platforms: ['facebook'],
    })

    const code = codegenMeta(resources)

    expect(code).toContain("manual(['facebook'])")
    expect(code).not.toContain('facebookPositions')
    expect(code).not.toContain('instagramPositions')
  })
})
