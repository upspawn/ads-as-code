import { describe, expect, test } from 'bun:test'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Helpers ────────────────────────────────────────────────

function displayResources(targeting: Record<string, unknown>): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'display-remarketing',
      properties: {
        name: 'Display - Remarketing',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [{ type: 'geo', countries: ['US'] }] },
        channelType: 'display',
      },
    },
    {
      kind: 'adGroup',
      path: 'display-remarketing/remarketing',
      properties: {
        status: 'enabled',
        adGroupType: 'display',
        targeting,
      },
    },
  ]
}

// ─── Targeting Types ────────────────────────────────────────

describe('Display targeting types', () => {
  test('PlacementTarget type exists', async () => {
    const types = await import('../../src/core/types.ts')
    // PlacementTarget is a type, not a value — we verify via the helper
    const { placements } = await import('../../src/helpers/targeting.ts')
    const rule = placements('youtube.com', 'news.google.com')
    expect(rule.type).toBe('placement')
    expect(rule.urls).toEqual(['youtube.com', 'news.google.com'])
  })

  test('TopicTarget type exists', async () => {
    const { topics } = await import('../../src/helpers/targeting.ts')
    const rule = topics('Computers & Electronics', 'Business')
    expect(rule.type).toBe('topic')
    expect(rule.topics).toEqual(['Computers & Electronics', 'Business'])
  })

  test('ContentKeywordTarget type exists', async () => {
    const { contentKeywords } = await import('../../src/helpers/targeting.ts')
    const rule = contentKeywords('file management', 'pdf tools')
    expect(rule.type).toBe('content-keyword')
    expect(rule.keywords).toEqual(['file management', 'pdf tools'])
  })
})

// ─── Targeting Helpers ──────────────────────────────────────

describe('Display targeting helpers', () => {
  test('placements() throws with no args', async () => {
    const { placements } = await import('../../src/helpers/targeting.ts')
    expect(() => placements()).toThrow()
  })

  test('topics() throws with no args', async () => {
    const { topics } = await import('../../src/helpers/targeting.ts')
    expect(() => topics()).toThrow()
  })

  test('contentKeywords() throws with no args', async () => {
    const { contentKeywords } = await import('../../src/helpers/targeting.ts')
    expect(() => contentKeywords()).toThrow()
  })
})

// ─── Codegen: Display Targeting ─────────────────────────────

describe('codegen: Display targeting', () => {
  test('emits placements() in targeting', () => {
    const code = generateCampaignFile(
      displayResources({
        rules: [{ type: 'placement', urls: ['youtube.com', 'news.google.com'] }],
      }),
      'Display - Remarketing',
    )
    expect(code).toContain("placements('youtube.com', 'news.google.com')")
    expect(code).toMatch(/import .* placements/)
  })

  test('emits topics() in targeting', () => {
    const code = generateCampaignFile(
      displayResources({
        rules: [{ type: 'topic', topics: ['Computers & Electronics'] }],
      }),
      'Display - Remarketing',
    )
    expect(code).toContain("topics('Computers & Electronics')")
    expect(code).toMatch(/import .* topics/)
  })

  test('emits contentKeywords() in targeting', () => {
    const code = generateCampaignFile(
      displayResources({
        rules: [{ type: 'content-keyword', keywords: ['file management', 'pdf tools'] }],
      }),
      'Display - Remarketing',
    )
    expect(code).toContain("contentKeywords('file management', 'pdf tools')")
    expect(code).toMatch(/import .* contentKeywords/)
  })
})

// ─── Exported from SDK ──────────────────────────────────────

describe('Display targeting exports', () => {
  test('placements, topics, contentKeywords are exported from helpers/index', async () => {
    const helpers = await import('../../src/helpers/index.ts')
    expect(typeof helpers.placements).toBe('function')
    expect(typeof helpers.topics).toBe('function')
    expect(typeof helpers.contentKeywords).toBe('function')
  })

  test('placements, topics, contentKeywords are exported from SDK entry point', async () => {
    const sdk = await import('../../src/index.ts')
    expect(typeof sdk.placements).toBe('function')
    expect(typeof sdk.topics).toBe('function')
    expect(typeof sdk.contentKeywords).toBe('function')
  })
})
