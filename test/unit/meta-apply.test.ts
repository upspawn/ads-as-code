import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { Cache } from '../../src/core/cache.ts'
import { applyMetaChangeset, type MetaApplyResult } from '../../src/meta/apply.ts'
import type { Change, Changeset, MetaProviderConfig, Resource } from '../../src/core/types.ts'

// ─── Test Helpers ───────────────────────────────────────────

function makeResource(
  kind: Resource['kind'],
  path: string,
  props: Record<string, unknown>,
  platformId?: string,
  meta?: Record<string, unknown>,
): Resource {
  const r: Record<string, unknown> = { kind, path, properties: props }
  if (platformId) r.platformId = platformId
  if (meta && Object.keys(meta).length > 0) r.meta = meta
  return r as Resource
}

function emptyChangeset(): Changeset {
  return { creates: [], updates: [], deletes: [], drift: [] }
}

const TEST_CONFIG: MetaProviderConfig = {
  accountId: 'act_123456',
  pageId: '999888777',
  dsa: { beneficiary: 'Upspawn Software UG', payor: 'Upspawn Software UG' },
}

const TEST_PROJECT = 'test-meta-project'

// ─── Mock Setup ─────────────────────────────────────────────

/**
 * Track all graphPost / graphDelete calls for assertions.
 * Returns sequential responses for each endpoint pattern.
 */
type MockCall = { method: string; endpoint: string; params?: Record<string, string> }

function setupMockClient(responses: Array<Record<string, unknown>>) {
  const calls: MockCall[] = []
  let callIndex = 0

  // Mock the Meta client by mocking fetch globally.
  // The createMetaClient function uses `fetch` internally.
  const originalFetch = globalThis.fetch

  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'

    // Extract endpoint from URL (strip base URL and access_token)
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    // Remove api version prefix (e.g., 'v21.0')
    const endpoint = pathParts.slice(1).join('/')

    // Parse form body for POST
    let params: Record<string, string> | undefined
    if (method === 'POST' && init?.body) {
      params = Object.fromEntries(new URLSearchParams(init.body as string))
    }

    calls.push({ method, endpoint, params })

    const response = responses[callIndex] ?? { id: `generated-id-${callIndex}` }
    callIndex++

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  // Set the access token env var
  process.env['FB_ADS_ACCESS_TOKEN'] = 'test-token-123'

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch
      delete process.env['FB_ADS_ACCESS_TOKEN']
    },
  }
}

// ─── Test Suite ─────────────────────────────────────────────

let cache: Cache

beforeEach(() => {
  cache = new Cache(':memory:')
})

afterEach(() => {
  cache.close()
})

// ─── Create Ordering ────────────────────────────────────────

describe('create ordering', () => {
  test('creates are processed in dependency order: campaign → adSet → creative → ad', async () => {
    const mockApi = setupMockClient([
      { id: 'campaign-id-1' },   // campaign create
      { id: 'adset-id-1' },     // adSet create
      { id: 'creative-id-1' },  // creative create
      { id: 'ad-id-1' },        // ad create
    ])

    try {
      const changeset: Changeset = {
        creates: [
          // Deliberately out of order to verify sorting
          {
            op: 'create',
            resource: makeResource('ad', 'my-campaign/my-adset/hero', {
              name: 'hero',
              status: 'PAUSED',
              creativePath: 'my-campaign/my-adset/hero/cr',
            }),
          },
          {
            op: 'create',
            resource: makeResource('creative', 'my-campaign/my-adset/hero/cr', {
              name: 'hero',
              format: 'image',
              imageHash: 'abc123hash',
              headline: 'Rename Files Fast',
              primaryText: 'AI-powered file renaming',
              cta: 'LEARN_MORE',
              url: 'https://renamed.to',
            }),
          },
          {
            op: 'create',
            resource: makeResource('campaign', 'my-campaign', {
              name: 'My Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'PAUSED',
              budget: { amount: 5, currency: 'EUR', period: 'daily' },
              specialAdCategories: [],
            }),
          },
          {
            op: 'create',
            resource: makeResource('adSet', 'my-campaign/my-adset', {
              name: 'My Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      expect(result.succeeded).toHaveLength(4)
      expect(result.failed).toHaveLength(0)

      // Verify order: campaign, adSet, creative, ad
      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(4)
      expect(postCalls[0]!.endpoint).toBe('act_123456/campaigns')
      expect(postCalls[1]!.endpoint).toBe('act_123456/adsets')
      expect(postCalls[2]!.endpoint).toBe('act_123456/adcreatives')
      expect(postCalls[3]!.endpoint).toBe('act_123456/ads')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Campaign Create Payload ────────────────────────────────

describe('campaign create', () => {
  test('sends correct campaign payload with name, objective, status, budget', async () => {
    const mockApi = setupMockClient([{ id: 'camp-42' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'search-traffic', {
              name: 'Search Traffic Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'ACTIVE',
              budget: { amount: 10, currency: 'EUR', period: 'daily' },
              specialAdCategories: [],
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(1)

      const params = postCalls[0]!.params!
      expect(params.name).toBe('Search Traffic Campaign')
      expect(params.objective).toBe('OUTCOME_TRAFFIC')
      expect(params.status).toBe('ACTIVE')
      expect(params.daily_budget).toBe('1000') // 10 EUR in cents
      expect(params.special_ad_categories).toBe('[]')
    } finally {
      mockApi.restore()
    }
  })

  test('stores campaign platform ID in cache', async () => {
    const mockApi = setupMockClient([{ id: 'camp-99' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'cached-camp', {
              name: 'Cached Campaign',
              objective: 'OUTCOME_SALES',
              status: 'PAUSED',
              specialAdCategories: [],
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const cached = cache.getResourceMap(TEST_PROJECT)
      expect(cached).toHaveLength(1)
      expect(cached[0]!.path).toBe('cached-camp')
      expect(cached[0]!.platformId).toBe('camp-99')
      expect(cached[0]!.kind).toBe('campaign')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Ad Set Create Payload ──────────────────────────────────

describe('ad set create', () => {
  test('resolves campaign_id from cache and sends correct payload', async () => {
    // Pre-populate cache with campaign
    cache.setResource({
      project: TEST_PROJECT,
      path: 'traffic-camp',
      platformId: 'camp-id-55',
      kind: 'campaign',
      managedBy: 'code',
    })

    const mockApi = setupMockClient([{ id: 'adset-id-77' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('adSet', 'traffic-camp/broad-audience', {
              name: 'Broad Audience',
              status: 'PAUSED',
              targeting: {
                geo: [{ type: 'geo', countries: ['US', 'DE'] }],
                age: { min: 25, max: 54 },
                interests: [{ id: '6003', name: 'Technology' }],
              },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'COST_CAP', cap: 2.50 },
              budget: { amount: 5, currency: 'EUR', period: 'daily' },
              placements: 'automatic',
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(1)

      const params = postCalls[0]!.params!
      expect(params.campaign_id).toBe('camp-id-55')
      expect(params.name).toBe('Broad Audience')
      expect(params.billing_event).toBe('IMPRESSIONS')
      expect(params.optimization_goal).toBe('LINK_CLICKS')
      expect(params.daily_budget).toBe('500')
      expect(params.bid_strategy).toBe('COST_CAP')
      expect(params.bid_amount).toBe('250') // 2.50 in cents

      // Verify targeting spec
      const targeting = JSON.parse(params.targeting!)
      expect(targeting.geo_locations.countries).toEqual(['US', 'DE'])
      expect(targeting.age_min).toBe(25)
      expect(targeting.age_max).toBe(54)
      expect(targeting.interests).toEqual([{ id: '6003', name: 'Technology' }])
    } finally {
      mockApi.restore()
    }
  })

  test('DSA resolution falls back to provider config when not set on ad set', async () => {
    cache.setResource({
      project: TEST_PROJECT,
      path: 'dsa-camp',
      platformId: 'camp-dsa',
      kind: 'campaign',
      managedBy: 'code',
    })

    const mockApi = setupMockClient([{ id: 'adset-dsa' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('adSet', 'dsa-camp/dsa-adset', {
              name: 'DSA Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['DE'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
              // No dsa field — should fall back to provider config
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      const params = postCalls[0]!.params!
      expect(params.dsa_beneficiary).toBe('Upspawn Software UG')
      expect(params.dsa_payor).toBe('Upspawn Software UG')
    } finally {
      mockApi.restore()
    }
  })

  test('DSA from ad set overrides provider config', async () => {
    cache.setResource({
      project: TEST_PROJECT,
      path: 'dsa-camp2',
      platformId: 'camp-dsa2',
      kind: 'campaign',
      managedBy: 'code',
    })

    const mockApi = setupMockClient([{ id: 'adset-dsa2' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('adSet', 'dsa-camp2/dsa-adset2', {
              name: 'DSA Override Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['DE'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
              dsa: { beneficiary: 'Custom GmbH', payor: 'Custom GmbH' },
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      const params = postCalls[0]!.params!
      expect(params.dsa_beneficiary).toBe('Custom GmbH')
      expect(params.dsa_payor).toBe('Custom GmbH')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Creative Create Payload ────────────────────────────────

describe('creative create', () => {
  test('sends object_story_spec with page_id and link_data for image creatives', async () => {
    cache.setResource({
      project: TEST_PROJECT,
      path: 'camp/adset/hero/cr',
      platformId: 'ignored',  // Creative path placeholder
      kind: 'creative',
      managedBy: 'code',
    })

    const mockApi = setupMockClient([{ id: 'creative-42' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('creative', 'camp/adset/hero/cr', {
              name: 'hero',
              format: 'image',
              headline: 'Rename Files Fast',
              primaryText: 'AI-powered bulk file renaming.',
              description: 'Save hours of manual work.',
              cta: 'LEARN_MORE',
              url: 'https://renamed.to',
            }, undefined, { imageHash: 'img_hash_abc' }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(1)

      const params = postCalls[0]!.params!
      expect(params.name).toBe('hero')

      const storySpec = JSON.parse(params.object_story_spec!)
      expect(storySpec.page_id).toBe('999888777')
      expect(storySpec.link_data.image_hash).toBe('img_hash_abc')
      expect(storySpec.link_data.name).toBe('Rename Files Fast')
      expect(storySpec.link_data.message).toBe('AI-powered bulk file renaming.')
      expect(storySpec.link_data.description).toBe('Save hours of manual work.')
      expect(storySpec.link_data.link).toBe('https://renamed.to')
      expect(storySpec.link_data.call_to_action.type).toBe('LEARN_MORE')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Ad Create Payload ──────────────────────────────────────

describe('ad create', () => {
  test('resolves adset_id and creative_id from cache', async () => {
    cache.setResource({
      project: TEST_PROJECT,
      path: 'camp/adset',
      platformId: 'adset-platform-id',
      kind: 'adSet',
      managedBy: 'code',
    })
    cache.setResource({
      project: TEST_PROJECT,
      path: 'camp/adset/hero/cr',
      platformId: 'creative-platform-id',
      kind: 'creative',
      managedBy: 'code',
    })

    const mockApi = setupMockClient([{ id: 'ad-99' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('ad', 'camp/adset/hero', {
              name: 'hero',
              status: 'PAUSED',
              creativePath: 'camp/adset/hero/cr',
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(1)

      const params = postCalls[0]!.params!
      expect(params.adset_id).toBe('adset-platform-id')
      expect(params.name).toBe('hero')
      expect(params.status).toBe('PAUSED')

      const creative = JSON.parse(params.creative!)
      expect(creative.creative_id).toBe('creative-platform-id')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Cache Updates ──────────────────────────────────────────

describe('cache updates after each step', () => {
  test('each created resource is cached with its platform ID', async () => {
    const mockApi = setupMockClient([
      { id: 'camp-new' },
      { id: 'adset-new' },
      { id: 'creative-new' },
      { id: 'ad-new' },
    ])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'full-camp', {
              name: 'Full Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'PAUSED',
              specialAdCategories: [],
            }),
          },
          {
            op: 'create',
            resource: makeResource('adSet', 'full-camp/main-adset', {
              name: 'Main Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
            }),
          },
          {
            op: 'create',
            resource: makeResource('creative', 'full-camp/main-adset/ad1/cr', {
              name: 'ad1',
              format: 'image',
              imageHash: 'hash1',
              headline: 'Test',
              primaryText: 'Test text',
              cta: 'LEARN_MORE',
              url: 'https://example.com',
            }),
          },
          {
            op: 'create',
            resource: makeResource('ad', 'full-camp/main-adset/ad1', {
              name: 'ad1',
              status: 'PAUSED',
              creativePath: 'full-camp/main-adset/ad1/cr',
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)
      expect(result.succeeded).toHaveLength(4)

      const cached = cache.getResourceMap(TEST_PROJECT)
      expect(cached).toHaveLength(4)

      const campaignEntry = cached.find(r => r.path === 'full-camp')
      expect(campaignEntry?.platformId).toBe('camp-new')
      expect(campaignEntry?.kind).toBe('campaign')

      const adSetEntry = cached.find(r => r.path === 'full-camp/main-adset')
      expect(adSetEntry?.platformId).toBe('adset-new')
      expect(adSetEntry?.kind).toBe('adSet')

      const creativeEntry = cached.find(r => r.path === 'full-camp/main-adset/ad1/cr')
      expect(creativeEntry?.platformId).toBe('creative-new')

      const adEntry = cached.find(r => r.path === 'full-camp/main-adset/ad1')
      expect(adEntry?.platformId).toBe('ad-new')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Updates ────────────────────────────────────────────────

describe('updates', () => {
  test('sends only changed fields via POST to entity ID', async () => {
    const mockApi = setupMockClient([{ success: true }])

    try {
      const changeset: Changeset = {
        creates: [],
        updates: [
          {
            op: 'update',
            resource: makeResource('campaign', 'my-camp', { name: 'My Campaign' }, 'camp-123'),
            changes: [
              { field: 'status', from: 'PAUSED', to: 'ACTIVE' },
              { field: 'name', from: 'Old Name', to: 'New Name' },
            ],
          },
        ],
        deletes: [],
        drift: [],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)
      expect(result.succeeded).toHaveLength(1)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      expect(postCalls).toHaveLength(1)
      expect(postCalls[0]!.endpoint).toBe('camp-123')

      const params = postCalls[0]!.params!
      expect(params.status).toBe('ACTIVE')
      expect(params.name).toBe('New Name')
    } finally {
      mockApi.restore()
    }
  })

  test('budget update sends daily_budget in cents', async () => {
    const mockApi = setupMockClient([{ success: true }])

    try {
      const changeset: Changeset = {
        creates: [],
        updates: [
          {
            op: 'update',
            resource: makeResource('adSet', 'camp/adset', { name: 'Ad Set' }, 'adset-456'),
            changes: [
              { field: 'budget', from: { amount: 5, period: 'daily' }, to: { amount: 10, period: 'daily' } },
            ],
          },
        ],
        deletes: [],
        drift: [],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)
      expect(result.succeeded).toHaveLength(1)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      const params = postCalls[0]!.params!
      expect(params.daily_budget).toBe('1000') // 10 EUR in cents
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Deletes ────────────────────────────────────────────────

describe('deletes', () => {
  test('deletes are processed in reverse dependency order: ad → creative → adSet → campaign', async () => {
    const mockApi = setupMockClient([
      { success: true }, // ad delete
      { success: true }, // creative delete
      { success: true }, // adSet delete
      { success: true }, // campaign delete
    ])

    try {
      const changeset: Changeset = {
        creates: [],
        updates: [],
        deletes: [
          // Deliberately out of order
          { op: 'delete', resource: makeResource('campaign', 'old-camp', {}, 'camp-del') },
          { op: 'delete', resource: makeResource('adSet', 'old-camp/old-adset', {}, 'adset-del') },
          { op: 'delete', resource: makeResource('ad', 'old-camp/old-adset/old-ad', {}, 'ad-del') },
          { op: 'delete', resource: makeResource('creative', 'old-camp/old-adset/old-ad/cr', {}, 'creative-del') },
        ],
        drift: [],
      }

      // Populate cache so removeResource works
      for (const del of changeset.deletes) {
        cache.setResource({
          project: TEST_PROJECT,
          path: del.resource.path,
          platformId: del.resource.platformId,
          kind: del.resource.kind,
          managedBy: 'code',
        })
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)
      expect(result.succeeded).toHaveLength(4)

      // Verify order: ad, creative, adSet, campaign
      const deleteCalls = mockApi.calls.filter(c => c.method === 'DELETE')
      expect(deleteCalls).toHaveLength(4)
      expect(deleteCalls[0]!.endpoint).toBe('ad-del')
      expect(deleteCalls[1]!.endpoint).toBe('creative-del')
      expect(deleteCalls[2]!.endpoint).toBe('adset-del')
      expect(deleteCalls[3]!.endpoint).toBe('camp-del')

      // Cache should be empty after deletes
      const cached = cache.getResourceMap(TEST_PROJECT)
      expect(cached).toHaveLength(0)
    } finally {
      mockApi.restore()
    }
  })

  test('delete continues on failure — best effort', async () => {
    let callIndex = 0
    const mockApi = setupMockClient([])

    // Override to fail on second delete
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      callIndex++
      if (callIndex === 2) {
        return new Response(
          JSON.stringify({ error: { message: 'Cannot delete', type: 'OAuthException', code: 100 } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    process.env['FB_ADS_ACCESS_TOKEN'] = 'test-token-123'

    try {
      const changeset: Changeset = {
        creates: [],
        updates: [],
        deletes: [
          { op: 'delete', resource: makeResource('ad', 'c/a/ad1', {}, 'ad-1') },
          { op: 'delete', resource: makeResource('ad', 'c/a/ad2', {}, 'ad-2') },
          { op: 'delete', resource: makeResource('ad', 'c/a/ad3', {}, 'ad-3') },
        ],
        drift: [],
      }

      for (const del of changeset.deletes) {
        cache.setResource({
          project: TEST_PROJECT,
          path: del.resource.path,
          platformId: del.resource.platformId,
          kind: del.resource.kind,
          managedBy: 'code',
        })
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      // First and third succeeded, second failed
      expect(result.succeeded).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]!.change.resource.platformId).toBe('ad-2')
    } finally {
      globalThis.fetch = originalFetch
      delete process.env['FB_ADS_ACCESS_TOKEN']
    }
  })
})

// ─── Partial Failure Recovery ───────────────────────────────

describe('partial failure recovery', () => {
  test('stops on create failure and marks remaining as skipped', async () => {
    let callIndex = 0
    const originalFetch = globalThis.fetch

    globalThis.fetch = mock(async () => {
      callIndex++
      if (callIndex === 2) {
        // Second create (adSet) fails
        return new Response(
          JSON.stringify({ error: { message: 'Invalid targeting', type: 'OAuthException', code: 100 } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ id: `id-${callIndex}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    process.env['FB_ADS_ACCESS_TOKEN'] = 'test-token-123'

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'fail-camp', {
              name: 'Fail Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'PAUSED',
              specialAdCategories: [],
            }),
          },
          {
            op: 'create',
            resource: makeResource('adSet', 'fail-camp/fail-adset', {
              name: 'Fail Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
            }),
          },
          {
            op: 'create',
            resource: makeResource('creative', 'fail-camp/fail-adset/ad1/cr', {
              name: 'ad1',
              format: 'image',
              imageHash: 'hash',
              headline: 'Test',
              primaryText: 'Test',
              cta: 'LEARN_MORE',
              url: 'https://example.com',
            }),
          },
          {
            op: 'create',
            resource: makeResource('ad', 'fail-camp/fail-adset/ad1', {
              name: 'ad1',
              status: 'PAUSED',
              creativePath: 'fail-camp/fail-adset/ad1/cr',
            }),
          },
        ],
        updates: [
          {
            op: 'update',
            resource: makeResource('campaign', 'other', { name: 'Other' }, 'other-id'),
            changes: [{ field: 'status', from: 'PAUSED', to: 'ACTIVE' }],
          },
        ],
        deletes: [],
        drift: [],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      // Campaign succeeded
      expect(result.succeeded).toHaveLength(1)
      expect(result.succeeded[0]!.resource.path).toBe('fail-camp')

      // Ad set failed
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]!.change.resource.path).toBe('fail-camp/fail-adset')

      // Creative + ad + update all skipped
      expect(result.skipped.length).toBeGreaterThanOrEqual(3)

      // Campaign should be in cache (it succeeded)
      const cached = cache.getResourceMap(TEST_PROJECT)
      expect(cached).toHaveLength(1)
      expect(cached[0]!.path).toBe('fail-camp')
    } finally {
      globalThis.fetch = originalFetch
      delete process.env['FB_ADS_ACCESS_TOKEN']
    }
  })

  test('cache records partial state so next plan is accurate', async () => {
    // First apply: create campaign + adSet
    const mockApi = setupMockClient([
      { id: 'camp-partial' },
      { id: 'adset-partial' },
    ])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'partial-camp', {
              name: 'Partial Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'PAUSED',
              specialAdCategories: [],
            }),
          },
          {
            op: 'create',
            resource: makeResource('adSet', 'partial-camp/partial-adset', {
              name: 'Partial Ad Set',
              status: 'PAUSED',
              targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
              optimization: 'LINK_CLICKS',
              bidding: { type: 'LOWEST_COST_WITHOUT_CAP' },
              placements: 'automatic',
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      // Both should be cached
      const cached = cache.getResourceMap(TEST_PROJECT)
      expect(cached).toHaveLength(2)

      const campEntry = cached.find(r => r.kind === 'campaign')
      expect(campEntry?.platformId).toBe('camp-partial')

      const adSetEntry = cached.find(r => r.kind === 'adSet')
      expect(adSetEntry?.platformId).toBe('adset-partial')
    } finally {
      mockApi.restore()
    }
  })
})

// ─── Empty Changeset ────────────────────────────────────────

describe('edge cases', () => {
  test('empty changeset returns empty result without API calls', async () => {
    const mockApi = setupMockClient([])

    try {
      const result = await applyMetaChangeset(emptyChangeset(), TEST_CONFIG, cache, TEST_PROJECT)

      expect(result.succeeded).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.skipped).toHaveLength(0)
      expect(mockApi.calls).toHaveLength(0)
    } finally {
      mockApi.restore()
    }
  })

  test('drift changes are included in skipped', async () => {
    const mockApi = setupMockClient([])

    try {
      const changeset: Changeset = {
        creates: [],
        updates: [],
        deletes: [],
        drift: [
          {
            op: 'drift',
            resource: makeResource('campaign', 'drifted', { name: 'Drifted' }, 'drift-id'),
            changes: [{ field: 'status', from: 'PAUSED', to: 'ACTIVE' }],
          },
        ],
      }

      const result = await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0]!.resource.path).toBe('drifted')
    } finally {
      mockApi.restore()
    }
  })

  test('monthly budget is converted correctly (divided by 30.4)', async () => {
    const mockApi = setupMockClient([{ id: 'camp-monthly' }])

    try {
      const changeset: Changeset = {
        creates: [
          {
            op: 'create',
            resource: makeResource('campaign', 'monthly', {
              name: 'Monthly Budget Campaign',
              objective: 'OUTCOME_TRAFFIC',
              status: 'PAUSED',
              budget: { amount: 304, currency: 'EUR', period: 'monthly' },
              specialAdCategories: [],
            }),
          },
        ],
        updates: [],
        deletes: [],
        drift: [],
      }

      await applyMetaChangeset(changeset, TEST_CONFIG, cache, TEST_PROJECT)

      const postCalls = mockApi.calls.filter(c => c.method === 'POST')
      const params = postCalls[0]!.params!
      // 304 / 30.4 = 10 EUR daily, in cents = 1000
      expect(params.daily_budget).toBe('1000')
    } finally {
      mockApi.restore()
    }
  })
})
