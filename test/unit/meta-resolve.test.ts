import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { resolveTargeting, resolveInterest } from '../../src/meta/resolve.ts'
import type { MetaClient } from '../../src/meta/api.ts'
import type { MetaTargeting } from '../../src/meta/types.ts'
import type { MetaProviderConfig } from '../../src/core/types.ts'

// ─── Test Fixtures ──────────────────────────────────────────

const TEST_CONFIG: MetaProviderConfig = {
  accountId: 'act_123456',
  pageId: '999',
}

function makeTargeting(overrides?: Partial<MetaTargeting>): MetaTargeting {
  return {
    geo: [{ type: 'geo', countries: ['US'] }],
    ...overrides,
  }
}

function createMockClient(overrides?: {
  searchResults?: unknown[]
  audiences?: unknown[]
}): MetaClient {
  return {
    graphGet: mock(async (_endpoint: string, params?: Record<string, string>) => {
      // Targeting Search API response
      if (params?.type === 'adinterest') {
        return { data: overrides?.searchResults ?? [] }
      }
      return { data: [] }
    }),
    graphPost: mock(async () => ({})),
    graphDelete: mock(async () => ({})),
    graphGetAll: mock(async (endpoint: string) => {
      if (endpoint.includes('/customaudiences')) {
        return overrides?.audiences ?? []
      }
      return []
    }),
  }
}

// ─── Interest Resolution ────────────────────────────────────

describe('resolveInterest()', () => {
  test('resolves interest from bundled catalog (no API call)', async () => {
    const client = createMockClient()
    const result = await resolveInterest('Construction', client, null)

    expect(result).toEqual({ id: '6003370250981', name: 'Construction' })
    // Should NOT have called the API
    expect(client.graphGet).not.toHaveBeenCalled()
  })

  test('catalog lookup is case-insensitive', async () => {
    const client = createMockClient()
    const result = await resolveInterest('construction', client, null)

    expect(result).toEqual({ id: '6003370250981', name: 'Construction' })
  })

  test('falls back to API when not in catalog', async () => {
    const client = createMockClient({
      searchResults: [
        { id: '99001', name: 'Niche Interest', audience_size_lower_bound: 1000 },
      ],
    })

    const result = await resolveInterest('Niche Interest', client, null)
    expect(result).toEqual({ id: '99001', name: 'Niche Interest' })
    expect(client.graphGet).toHaveBeenCalled()
  })

  test('throws on zero matches from API', async () => {
    const client = createMockClient({ searchResults: [] })

    await expect(resolveInterest('Nonexistent Thing XYZ', client, null))
      .rejects.toThrow(/not found/)
  })

  test('throws on ambiguous matches (multiple exact name matches)', async () => {
    const client = createMockClient({
      searchResults: [
        { id: '111', name: 'AmbiguousInterest' },
        { id: '222', name: 'AmbiguousInterest' },
      ],
    })

    await expect(resolveInterest('AmbiguousInterest', client, null))
      .rejects.toThrow(/ambiguous/)
  })

  test('suggests similar interests when no exact match', async () => {
    const client = createMockClient({
      searchResults: [
        { id: '111', name: 'Cloud Computing Solutions' },
        { id: '222', name: 'Cloud Storage' },
      ],
    })

    await expect(resolveInterest('Cloud', client, null))
      .rejects.toThrow(/Similar interests/)
  })
})

// ─── Audience Resolution ────────────────────────────────────

describe('resolveTargeting() audience resolution', () => {
  test('resolves custom audience by name', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors 30d' },
        { id: 'aud_002', name: 'Purchasers' },
      ],
    })

    const targeting = makeTargeting({
      customAudiences: ['Website Visitors 30d'],
    })

    const resolved = await resolveTargeting(targeting, TEST_CONFIG, client, null)
    expect(resolved.customAudiences).toEqual(['aud_001'])
  })

  test('resolves excluded audiences by name', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors 30d' },
        { id: 'aud_002', name: 'Purchasers' },
      ],
    })

    const targeting = makeTargeting({
      excludedAudiences: ['Purchasers'],
    })

    const resolved = await resolveTargeting(targeting, TEST_CONFIG, client, null)
    expect(resolved.excludedAudiences).toEqual(['aud_002'])
  })

  test('audience resolution is case-insensitive', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors 30d' },
      ],
    })

    const targeting = makeTargeting({
      customAudiences: ['website visitors 30d'],
    })

    const resolved = await resolveTargeting(targeting, TEST_CONFIG, client, null)
    expect(resolved.customAudiences).toEqual(['aud_001'])
  })

  test('throws when audience not found', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors 30d' },
      ],
    })

    const targeting = makeTargeting({
      customAudiences: ['Nonexistent Audience'],
    })

    await expect(resolveTargeting(targeting, TEST_CONFIG, client, null))
      .rejects.toThrow(/not found/)
  })

  test('throws on ambiguous audience name', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors' },
        { id: 'aud_002', name: 'Website Visitors' },
      ],
    })

    const targeting = makeTargeting({
      customAudiences: ['Website Visitors'],
    })

    await expect(resolveTargeting(targeting, TEST_CONFIG, client, null))
      .rejects.toThrow(/ambiguous/)
  })

  test('passes through targeting without audiences unchanged', async () => {
    const client = createMockClient()
    const targeting = makeTargeting({
      interests: [{ id: '6003370250981', name: 'Construction' }],
    })

    const resolved = await resolveTargeting(targeting, TEST_CONFIG, client, null)
    expect(resolved.interests).toEqual([{ id: '6003370250981', name: 'Construction' }])
    expect(resolved.geo).toEqual([{ type: 'geo', countries: ['US'] }])
  })

  test('resolves multiple audiences in parallel', async () => {
    const client = createMockClient({
      audiences: [
        { id: 'aud_001', name: 'Website Visitors 30d' },
        { id: 'aud_002', name: 'Purchasers' },
        { id: 'aud_003', name: 'Newsletter Subscribers' },
      ],
    })

    const targeting = makeTargeting({
      customAudiences: ['Website Visitors 30d', 'Newsletter Subscribers'],
      excludedAudiences: ['Purchasers'],
    })

    const resolved = await resolveTargeting(targeting, TEST_CONFIG, client, null)
    expect(resolved.customAudiences).toEqual(['aud_001', 'aud_003'])
    expect(resolved.excludedAudiences).toEqual(['aud_002'])
  })
})
