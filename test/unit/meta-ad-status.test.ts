import { describe, test, expect } from 'bun:test'
import { flattenMeta } from '../../src/meta/flatten.ts'
import { codegenMeta } from '../../src/meta/codegen.ts'
import type { MetaCampaign } from '../../src/meta/index.ts'
import type { ImageAd, VideoAd, MetaCreative } from '../../src/meta/types.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Helpers ──────────────────────────────────────────────

/** Build a minimal traffic campaign with the given ads */
function trafficCampaign(ads: MetaCreative[], adSetStatus: 'ACTIVE' | 'PAUSED' = 'ACTIVE'): MetaCampaign {
  return {
    provider: 'meta',
    kind: 'traffic',
    name: 'Test Campaign',
    config: { status: 'ACTIVE' },
    adSets: [{
      name: 'Test Ad Set',
      config: {
        targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
        status: adSetStatus,
      },
      content: {
        ads,
        url: 'https://example.com',
        cta: 'LEARN_MORE',
      },
    }],
  }
}

function findAd(resources: Resource[], nameSubstring: string): Resource | undefined {
  return resources.find(r => r.kind === 'ad' && (r.properties.name as string).includes(nameSubstring))
}

// ─── Flatten Tests ────────────────────────────────────────

describe('flatten: per-ad status', () => {
  test('ad inherits ad set status when no per-ad status is set', () => {
    const campaign = trafficCampaign([
      { format: 'image', image: './hero.png', headline: 'H', primaryText: 'P' },
    ])

    const resources = flattenMeta(campaign)
    const ad = findAd(resources, 'hero')

    expect(ad).toBeDefined()
    expect(ad!.properties.status).toBe('ACTIVE')
  })

  test('ad uses per-ad status override when set', () => {
    const pausedAd: ImageAd = {
      format: 'image',
      image: './hero.png',
      headline: 'H',
      primaryText: 'P',
      status: 'PAUSED',
    }
    const campaign = trafficCampaign([pausedAd])

    const resources = flattenMeta(campaign)
    const ad = findAd(resources, 'hero')

    expect(ad).toBeDefined()
    expect(ad!.properties.status).toBe('PAUSED')
  })

  test('mixed ad statuses: one active, one paused in same ad set', () => {
    const activeAd: ImageAd = {
      format: 'image',
      image: './active.png',
      headline: 'H',
      primaryText: 'P',
      // no status — inherits ACTIVE from ad set
    }
    const pausedAd: ImageAd = {
      format: 'image',
      image: './paused.png',
      headline: 'H',
      primaryText: 'P',
      status: 'PAUSED',
    }
    const campaign = trafficCampaign([activeAd, pausedAd])

    const resources = flattenMeta(campaign)
    const activeResult = findAd(resources, 'active')
    const pausedResult = findAd(resources, 'paused')

    expect(activeResult!.properties.status).toBe('ACTIVE')
    expect(pausedResult!.properties.status).toBe('PAUSED')
  })

  test('video ad with per-ad status override', () => {
    const pausedVideo: VideoAd = {
      format: 'video',
      video: './demo.mp4',
      headline: 'H',
      primaryText: 'P',
      status: 'PAUSED',
    }
    const campaign = trafficCampaign([pausedVideo])

    const resources = flattenMeta(campaign)
    const ad = findAd(resources, 'demo')

    expect(ad).toBeDefined()
    expect(ad!.properties.status).toBe('PAUSED')
  })
})

// ─── Codegen Tests ────────────────────────────────────────

describe('codegen: per-ad status', () => {
  test('does not emit status on ad when it matches ad set', () => {
    // Both ad set and ad are ACTIVE — no status field needed on the image() call
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' } },
      { kind: 'adSet', path: 'test/adset', properties: { name: 'Ad Set', status: 'ACTIVE', targeting: { geo: [{ type: 'geo', countries: ['US'] }] }, optimization: 'LINK_CLICKS', bidding: { type: 'LOWEST_COST_WITHOUT_CAP' } } },
      { kind: 'creative', path: 'test/adset/hero/cr', properties: { name: 'hero', format: 'image', headline: 'H', primaryText: 'P', url: 'https://example.com', cta: 'LEARN_MORE' }, meta: { imagePath: './hero.png' } },
      { kind: 'ad', path: 'test/adset/hero', properties: { name: 'hero', status: 'ACTIVE', creativePath: 'test/adset/hero/cr' } },
    ]

    const code = codegenMeta(resources)
    // Should NOT contain status in the image() call
    expect(code).not.toMatch(/image\([^)]*status/)
  })

  test('emits status: PAUSED on ad when ad set is ACTIVE', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' } },
      { kind: 'adSet', path: 'test/adset', properties: { name: 'Ad Set', status: 'ACTIVE', targeting: { geo: [{ type: 'geo', countries: ['US'] }] }, optimization: 'LINK_CLICKS', bidding: { type: 'LOWEST_COST_WITHOUT_CAP' } } },
      { kind: 'creative', path: 'test/adset/hero/cr', properties: { name: 'hero', format: 'image', headline: 'H', primaryText: 'P', url: 'https://example.com', cta: 'LEARN_MORE' }, meta: { imagePath: './hero.png' } },
      { kind: 'ad', path: 'test/adset/hero', properties: { name: 'hero', status: 'PAUSED', creativePath: 'test/adset/hero/cr' } },
    ]

    const code = codegenMeta(resources)
    expect(code).toContain("status: 'PAUSED'")
  })

  test('emits status: ACTIVE on ad when ad set is PAUSED', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' } },
      { kind: 'adSet', path: 'test/adset', properties: { name: 'Ad Set', status: 'PAUSED', targeting: { geo: [{ type: 'geo', countries: ['US'] }] }, optimization: 'LINK_CLICKS', bidding: { type: 'LOWEST_COST_WITHOUT_CAP' } } },
      { kind: 'creative', path: 'test/adset/hero/cr', properties: { name: 'hero', format: 'image', headline: 'H', primaryText: 'P', url: 'https://example.com', cta: 'LEARN_MORE' }, meta: { imagePath: './hero.png' } },
      { kind: 'ad', path: 'test/adset/hero', properties: { name: 'hero', status: 'ACTIVE', creativePath: 'test/adset/hero/cr' } },
    ]

    const code = codegenMeta(resources)
    expect(code).toContain("status: 'ACTIVE'")
  })
})

// ─── Roundtrip Tests ──────────────────────────────────────

describe('roundtrip: flatten -> codegen -> flatten', () => {
  test('per-ad paused status survives roundtrip', () => {
    const campaign = trafficCampaign([
      { format: 'image', image: './active.png', headline: 'H', primaryText: 'P' } as ImageAd,
      { format: 'image', image: './paused.png', headline: 'H', primaryText: 'P', status: 'PAUSED' } as ImageAd,
    ])

    const resources = flattenMeta(campaign)
    const activeAd = findAd(resources, 'active')
    const pausedAd = findAd(resources, 'paused')

    // Verify flatten output
    expect(activeAd!.properties.status).toBe('ACTIVE')
    expect(pausedAd!.properties.status).toBe('PAUSED')

    // Verify codegen output contains per-ad status
    const code = codegenMeta(resources)
    expect(code).toContain("status: 'PAUSED'")
    // The active ad should NOT have status emitted (it matches ad set)
    // Count occurrences of status in image() calls — should be exactly one
    const imageStatusMatches = code.match(/image\([^)]*status/g)
    expect(imageStatusMatches?.length).toBe(1)
  })
})
