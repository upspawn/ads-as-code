import { describe, test, expect, mock } from 'bun:test'
import type { Change, Changeset, Resource } from '../../src/core/types'
import type { Cache } from '../../src/core/cache'
import type { RedditProviderConfig } from '../../src/reddit/types'
import type { RedditClient } from '../../src/reddit/api'

// ─── Test Helpers ────────────────────────────────────────────

type MockFn = ReturnType<typeof mock>

const TEST_CONFIG: RedditProviderConfig = {
  accountId: 't2_testaccount',
}

function makeResource(
  kind: Resource['kind'],
  path: string,
  properties: Record<string, unknown> = {},
  meta?: Record<string, unknown>,
  platformId?: string,
): Resource {
  return { kind, path, properties, meta, platformId }
}

function makeChange(op: 'create', resource: Resource): Change
function makeChange(op: 'delete', resource: Resource): Change
function makeChange(op: 'update', resource: Resource, changes: { field: string; from: unknown; to: unknown }[]): Change
function makeChange(
  op: 'create' | 'update' | 'delete',
  resource: Resource,
  changes?: { field: string; from: unknown; to: unknown }[],
): Change {
  if (op === 'update') {
    return { op, resource, changes: changes ?? [] }
  }
  return { op, resource } as Change
}

function mockClient(): RedditClient & { _mocks: { post: MockFn; put: MockFn; delete: MockFn } } {
  let callCount = 0
  const postFn = mock(async () => ({ id: `new-id-${++callCount}` }))
  const putFn = mock(async () => ({}))
  const deleteFn = mock(async () => ({}))
  return {
    get: mock(async () => ({})) as unknown as RedditClient['get'],
    post: postFn as unknown as RedditClient['post'],
    put: putFn as unknown as RedditClient['put'],
    delete: deleteFn as unknown as RedditClient['delete'],
    fetchAll: mock(async () => []) as unknown as RedditClient['fetchAll'],
    upload: mock(async () => ({})),
    _mocks: { post: postFn, put: putFn, delete: deleteFn },
  }
}

function mockCache(): Cache {
  const resources = new Map<string, { path: string; platformId: string; kind: string }>()
  return {
    getResourceMap: mock((_project: string) =>
      Array.from(resources.values()).map(r => ({
        project: 'test',
        path: r.path,
        platformId: r.platformId,
        kind: r.kind,
        managedBy: 'code',
        updatedAt: new Date().toISOString(),
      })),
    ),
    setResource: mock((r: { project: string; path: string; platformId?: string | null; kind: string; managedBy: string }) => {
      resources.set(r.path, { path: r.path, platformId: r.platformId ?? '', kind: r.kind })
    }),
    removeResource: mock((_project: string, path: string) => {
      return resources.delete(path)
    }),
  } as unknown as Cache
}

/** Type-safe access to mock call args. */
function calls(fn: MockFn): unknown[][] {
  return fn.mock.calls as unknown[][]
}

// ─── Tests ───────────────────────────────────────────────────

describe('applyRedditChangeset', () => {
  test('creates execute in CREATION_ORDER: campaign -> adGroup -> ad', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'my-campaign', {
      name: 'My Campaign',
      objective: 'TRAFFIC',
      status: 'enabled',
      budget: { amount: 50, period: 'daily', currency: 'USD' },
    })
    const adGroup = makeResource('adGroup', 'my-campaign/my-group', {
      name: 'My Group',
      status: 'enabled',
      targeting: [],
    })
    const ad = makeResource('ad', 'my-campaign/my-group/my-ad', {
      name: 'My Ad',
      status: 'enabled',
      format: 'image',
      headline: 'Test headline',
      clickUrl: 'https://example.com',
    })

    const changeset: Changeset = {
      // Provide out of order to verify sorting
      creates: [
        makeChange('create', ad),
        makeChange('create', campaign),
        makeChange('create', adGroup),
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    const result = await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    expect(result.succeeded).toHaveLength(3)
    expect(result.failed).toHaveLength(0)

    // Verify creation order by checking post call sequence
    const postCalls = calls(client._mocks.post)
    expect(postCalls).toHaveLength(3)

    // First call: campaign
    expect(postCalls[0]![0]).toContain('campaigns')
    // Second call: ad group
    expect(postCalls[1]![0]).toContain('ad_groups')
    // Third call: ad
    expect(postCalls[2]![0]).toContain('ads')
  })

  test('deletes execute in DELETION_ORDER: ad -> adGroup -> campaign', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'my-campaign', { name: 'C' }, undefined, 'camp-1')
    const adGroup = makeResource('adGroup', 'my-campaign/my-group', { name: 'G' }, undefined, 'ag-1')
    const ad = makeResource('ad', 'my-campaign/my-group/my-ad', { name: 'A' }, undefined, 'ad-1')

    const changeset: Changeset = {
      creates: [],
      updates: [],
      // Provide out of order to verify sorting
      deletes: [
        makeChange('delete', campaign),
        makeChange('delete', ad),
        makeChange('delete', adGroup),
      ],
      drift: [],
    }

    const result = await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    expect(result.succeeded).toHaveLength(3)

    const deleteCalls = calls(client._mocks.delete)
    expect(deleteCalls).toHaveLength(3)

    // Deletion order: ad first, then adGroup, then campaign
    expect(deleteCalls[0]![0]).toContain('ads/ad-1')
    expect(deleteCalls[1]![0]).toContain('ad_groups/ag-1')
    expect(deleteCalls[2]![0]).toContain('campaigns/camp-1')
  })

  test('campaign create builds correct params', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'my-campaign', {
      name: 'Launch Campaign',
      objective: 'TRAFFIC',
      status: 'enabled',
      budget: { amount: 50, period: 'daily', currency: 'USD' },
      spendCap: 1000_000_000,
    })

    const changeset: Changeset = {
      creates: [makeChange('create', campaign)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const postCalls = calls(client._mocks.post)
    expect(postCalls).toHaveLength(1)

    const [endpoint, body] = postCalls[0]! as [string, Record<string, unknown>]
    expect(endpoint).toBe(`accounts/${TEST_CONFIG.accountId}/campaigns`)
    expect(body.name).toBe('Launch Campaign')
    expect(body.objective).toBe('TRAFFIC')
    expect(body.configured_status).toBe('ACTIVE')
    // Budget: $50 = 50_000_000 micros
    expect(body.daily_budget_micro).toBe(50_000_000)
    expect(body.spend_cap_micro).toBe(1000_000_000)
  })

  test('ad group create builds correct params with targeting', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    // Pre-seed cache with campaign platform ID
    ;(cache.getResourceMap as MockFn).mockReturnValue([
      { project: 'test', path: 'my-campaign', platformId: 'camp-123', kind: 'campaign', managedBy: 'code', updatedAt: '' },
    ])

    const adGroup = makeResource('adGroup', 'my-campaign/my-group', {
      name: 'Tech Group',
      status: 'paused',
      targeting: [
        { _type: 'geo', locations: ['US', 'CA'] },
        { _type: 'interests', names: ['technology', 'gaming'] },
      ],
      bid: { type: 'MANUAL_BID', amount: 150_000 },
      optimization: 'LINK_CLICKS',
      placement: 'FEED',
    })

    const changeset: Changeset = {
      creates: [makeChange('create', adGroup)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const postCalls = calls(client._mocks.post)
    expect(postCalls).toHaveLength(1)

    const [endpoint, body] = postCalls[0]! as [string, Record<string, unknown>]
    expect(endpoint).toBe(`accounts/${TEST_CONFIG.accountId}/ad_groups`)
    expect(body.campaign_id).toBe('camp-123')
    expect(body.name).toBe('Tech Group')
    expect(body.configured_status).toBe('PAUSED')
    expect(body.bid_micro).toBe(150_000)
    expect(body.bid_strategy).toBe('MANUAL_BID')
    expect(body.optimization_goal).toBe('LINK_CLICKS')
    expect(body.goal_type).toBe('LINK_CLICKS')
  })

  test('ad create builds correct params for image ad', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    // Pre-seed cache with campaign + ad group platform IDs
    ;(cache.getResourceMap as MockFn).mockReturnValue([
      { project: 'test', path: 'my-campaign', platformId: 'camp-123', kind: 'campaign', managedBy: 'code', updatedAt: '' },
      { project: 'test', path: 'my-campaign/my-group', platformId: 'ag-456', kind: 'adGroup', managedBy: 'code', updatedAt: '' },
    ])

    const ad = makeResource('ad', 'my-campaign/my-group/hero-ad', {
      name: 'Hero Ad',
      status: 'enabled',
      format: 'image',
      headline: 'Check this out',
      body: 'Amazing product',
      clickUrl: 'https://example.com',
      cta: 'LEARN_MORE',
    }, {
      mediaUrl: 'https://reddit.com/media/abc123',
    })

    const changeset: Changeset = {
      creates: [makeChange('create', ad)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const postCalls = calls(client._mocks.post)
    expect(postCalls).toHaveLength(1)

    const [endpoint, body] = postCalls[0]! as [string, Record<string, unknown>]
    expect(endpoint).toBe(`accounts/${TEST_CONFIG.accountId}/ads`)
    expect(body.ad_group_id).toBe('ag-456')
    expect(body.name).toBe('Hero Ad')
    expect(body.configured_status).toBe('ACTIVE')
    expect(body.headline).toBe('Check this out')
    expect(body.body).toBe('Amazing product')
    expect(body.click_url).toBe('https://example.com')
    expect(body.call_to_action).toBe('LEARN_MORE')
  })

  test('status conversion: enabled -> ACTIVE, paused -> PAUSED', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const enabled = makeResource('campaign', 'camp-a', { name: 'A', status: 'enabled', objective: 'TRAFFIC' })
    const paused = makeResource('campaign', 'camp-b', { name: 'B', status: 'paused', objective: 'TRAFFIC' })

    const changeset: Changeset = {
      creates: [makeChange('create', enabled), makeChange('create', paused)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const postCalls = calls(client._mocks.post)
    expect((postCalls[0]![1] as Record<string, unknown>).configured_status).toBe('ACTIVE')
    expect((postCalls[1]![1] as Record<string, unknown>).configured_status).toBe('PAUSED')
  })

  test('budget converts to micros', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'camp', {
      name: 'C',
      objective: 'TRAFFIC',
      status: 'enabled',
      budget: { amount: 25.5, period: 'daily', currency: 'USD' },
    })

    const changeset: Changeset = {
      creates: [makeChange('create', campaign)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const body = calls(client._mocks.post)[0]![1] as Record<string, unknown>
    expect(body.daily_budget_micro).toBe(25_500_000)
  })

  test('lifetime budget uses lifetime_budget_micro', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'camp', {
      name: 'C',
      objective: 'TRAFFIC',
      status: 'enabled',
      budget: { amount: 1000, period: 'lifetime', currency: 'USD' },
    })

    const changeset: Changeset = {
      creates: [makeChange('create', campaign)],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    const body = calls(client._mocks.post)[0]![1] as Record<string, unknown>
    expect(body.lifetime_budget_micro).toBe(1000_000_000)
    expect(body.daily_budget_micro).toBeUndefined()
  })

  test('failure on create stops execution, remaining are skipped', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    // Make the ad group creation fail
    let callIdx = 0
    client._mocks.post.mockImplementation(async () => {
      callIdx++
      if (callIdx === 2) throw new Error('Ad group creation failed')
      return { id: `id-${callIdx}` }
    })

    const campaign = makeResource('campaign', 'camp', { name: 'C', objective: 'TRAFFIC', status: 'enabled' })
    const adGroup = makeResource('adGroup', 'camp/group', { name: 'G', status: 'enabled' })
    const ad = makeResource('ad', 'camp/group/ad', { name: 'A', status: 'enabled', format: 'image' })

    const changeset: Changeset = {
      creates: [
        makeChange('create', campaign),
        makeChange('create', adGroup),
        makeChange('create', ad),
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    const result = await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    expect(result.succeeded).toHaveLength(1) // campaign only
    expect(result.failed).toHaveLength(1) // ad group
    expect(result.failed[0]!.error.message).toBe('Ad group creation failed')
    expect(result.skipped.length).toBeGreaterThanOrEqual(1) // ad skipped
  })

  test('updates send correct API calls', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    const campaign = makeResource('campaign', 'camp', { name: 'C', status: 'paused' }, undefined, 'camp-1')

    const changeset: Changeset = {
      creates: [],
      updates: [
        makeChange('update', campaign, [
          { field: 'status', from: 'enabled', to: 'paused' },
          { field: 'name', from: 'Old', to: 'C' },
        ]),
      ],
      deletes: [],
      drift: [],
    }

    const result = await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    expect(result.succeeded).toHaveLength(1)
    const putCalls = calls(client._mocks.put)
    expect(putCalls).toHaveLength(1)
    expect(putCalls[0]![0]).toContain('campaigns/camp-1')
    expect((putCalls[0]![1] as Record<string, unknown>).configured_status).toBe('PAUSED')
    expect((putCalls[0]![1] as Record<string, unknown>).name).toBe('C')
  })

  test('delete continues on failure (best effort)', async () => {
    const { applyRedditChangeset } = await import('../../src/reddit/apply')

    const client = mockClient()
    const cache = mockCache()

    let callIdx = 0
    client._mocks.delete.mockImplementation(async () => {
      callIdx++
      if (callIdx === 1) throw new Error('Delete failed')
      return {}
    })

    const ad = makeResource('ad', 'camp/group/ad', { name: 'A' }, undefined, 'ad-1')
    const adGroup = makeResource('adGroup', 'camp/group', { name: 'G' }, undefined, 'ag-1')

    const changeset: Changeset = {
      creates: [],
      updates: [],
      deletes: [
        makeChange('delete', ad),
        makeChange('delete', adGroup),
      ],
      drift: [],
    }

    const result = await applyRedditChangeset(changeset, TEST_CONFIG, cache, 'test', client)

    // First delete fails but second still executes
    expect(result.failed).toHaveLength(1)
    expect(result.succeeded).toHaveLength(1)
  })
})

describe('dryRunRedditChangeset', () => {
  test('returns planned calls without executing', () => {
    const { dryRunRedditChangeset } = require('../../src/reddit/apply') as typeof import('../../src/reddit/apply')

    const cache = mockCache()

    const campaign = makeResource('campaign', 'my-campaign', {
      name: 'Launch',
      objective: 'TRAFFIC',
      status: 'enabled',
      budget: { amount: 50, period: 'daily', currency: 'USD' },
    })
    const adGroup = makeResource('adGroup', 'my-campaign/my-group', {
      name: 'Group',
      status: 'enabled',
      targeting: [],
    })
    const ad = makeResource('ad', 'my-campaign/my-group/hero', {
      name: 'Hero',
      status: 'enabled',
      format: 'image',
      headline: 'Test',
      clickUrl: 'https://example.com',
    })

    const changeset: Changeset = {
      creates: [
        makeChange('create', campaign),
        makeChange('create', adGroup),
        makeChange('create', ad),
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    const dryRunCalls = dryRunRedditChangeset(changeset, TEST_CONFIG, cache, 'test')

    expect(dryRunCalls).toHaveLength(3)
    expect(dryRunCalls[0]!.op).toBe('create')
    expect(dryRunCalls[0]!.method).toBe('POST')
    expect(dryRunCalls[0]!.resource.kind).toBe('campaign')
    expect(dryRunCalls[1]!.resource.kind).toBe('adGroup')
    expect(dryRunCalls[2]!.resource.kind).toBe('ad')
  })

  test('dry run includes updates and deletes', () => {
    const { dryRunRedditChangeset } = require('../../src/reddit/apply') as typeof import('../../src/reddit/apply')

    const cache = mockCache()

    const campaign = makeResource('campaign', 'camp', { name: 'C', status: 'paused' }, undefined, 'camp-1')
    const ad = makeResource('ad', 'camp/group/ad', { name: 'A' }, undefined, 'ad-1')

    const changeset: Changeset = {
      creates: [],
      updates: [
        makeChange('update', campaign, [{ field: 'status', from: 'enabled', to: 'paused' }]),
      ],
      deletes: [
        makeChange('delete', ad),
      ],
      drift: [],
    }

    const dryRunCalls = dryRunRedditChangeset(changeset, TEST_CONFIG, cache, 'test')

    expect(dryRunCalls).toHaveLength(2)
    expect(dryRunCalls[0]!.op).toBe('update')
    expect(dryRunCalls[0]!.method).toBe('PUT')
    expect(dryRunCalls[1]!.op).toBe('delete')
    expect(dryRunCalls[1]!.method).toBe('DELETE')
  })
})
