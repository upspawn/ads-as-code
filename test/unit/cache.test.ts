import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Cache } from '../../src/core/cache.ts'

let cache: Cache

beforeEach(() => {
  cache = new Cache(':memory:')
})

afterEach(() => {
  cache.close()
})

// ─── Resource Map ──────────────────────────────────────────────

describe('resource map', () => {
  test('setResource + getResourceMap round-trip', () => {
    cache.setResource({
      project: 'acme',
      path: 'campaigns/search',
      kind: 'campaign',
      managedBy: 'ads-as-code',
    })

    const resources = cache.getResourceMap('acme')
    expect(resources).toHaveLength(1)
    expect(resources[0]!.project).toBe('acme')
    expect(resources[0]!.path).toBe('campaigns/search')
    expect(resources[0]!.kind).toBe('campaign')
    expect(resources[0]!.managedBy).toBe('ads-as-code')
    expect(resources[0]!.platformId).toBeNull()
    expect(resources[0]!.lastSeen).toBeTruthy()
  })

  test('setResource with platformId', () => {
    cache.setResource({
      project: 'acme',
      path: 'campaigns/search',
      kind: 'campaign',
      managedBy: 'ads-as-code',
      platformId: 'google:123456',
    })

    const resources = cache.getResourceMap('acme')
    expect(resources[0]!.platformId).toBe('google:123456')
  })

  test('upsert updates existing resource', () => {
    cache.setResource({
      project: 'acme',
      path: 'campaigns/search',
      kind: 'campaign',
      managedBy: 'ads-as-code',
    })

    cache.setResource({
      project: 'acme',
      path: 'campaigns/search',
      kind: 'campaign',
      managedBy: 'ads-as-code',
      platformId: 'google:789',
    })

    const resources = cache.getResourceMap('acme')
    expect(resources).toHaveLength(1)
    expect(resources[0]!.platformId).toBe('google:789')
  })

  test('removeResource deletes and returns true', () => {
    cache.setResource({
      project: 'acme',
      path: 'campaigns/search',
      kind: 'campaign',
      managedBy: 'ads-as-code',
    })

    const removed = cache.removeResource('acme', 'campaigns/search')
    expect(removed).toBe(true)
    expect(cache.getResourceMap('acme')).toHaveLength(0)
  })

  test('removeResource returns false for missing resource', () => {
    const removed = cache.removeResource('acme', 'nonexistent')
    expect(removed).toBe(false)
  })

  test('getResourceMap returns empty array for unknown project', () => {
    expect(cache.getResourceMap('unknown')).toEqual([])
  })

  test('resources are isolated by project', () => {
    cache.setResource({ project: 'a', path: 'x', kind: 'campaign', managedBy: 'aac' })
    cache.setResource({ project: 'b', path: 'x', kind: 'campaign', managedBy: 'aac' })

    expect(cache.getResourceMap('a')).toHaveLength(1)
    expect(cache.getResourceMap('b')).toHaveLength(1)
  })
})

// ─── Managed Paths ────────────────────────────────────────────

describe('getManagedPaths', () => {
  test('returns paths for a specific managedBy', () => {
    cache.setResource({ project: 'acme', path: 'campaigns/search', kind: 'campaign', managedBy: 'ads-as-code' })
    cache.setResource({ project: 'acme', path: 'campaigns/display', kind: 'campaign', managedBy: 'ads-as-code' })
    cache.setResource({ project: 'acme', path: 'campaigns/manual', kind: 'campaign', managedBy: 'manual' })

    const paths = cache.getManagedPaths('acme', 'ads-as-code')
    expect(paths).toHaveLength(2)
    expect(paths).toContain('campaigns/search')
    expect(paths).toContain('campaigns/display')
  })

  test('returns empty array when no matches', () => {
    expect(cache.getManagedPaths('acme', 'unknown')).toEqual([])
  })
})

// ─── Snapshots ────────────────────────────────────────────────

describe('snapshots', () => {
  test('saveSnapshot + getSnapshot round-trip', () => {
    const state = { campaigns: [{ name: 'search', budget: 20 }] }
    const id = cache.saveSnapshot({ project: 'acme', source: 'google', state })

    expect(id).toBeGreaterThan(0)

    const snapshot = cache.getSnapshot(id)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.project).toBe('acme')
    expect(snapshot!.source).toBe('google')
    expect(snapshot!.state).toEqual(state)
    expect(snapshot!.timestamp).toBeTruthy()
  })

  test('getSnapshot returns null for missing id', () => {
    expect(cache.getSnapshot(999)).toBeNull()
  })

  test('snapshots auto-increment ids', () => {
    const id1 = cache.saveSnapshot({ project: 'acme', source: 'google', state: {} })
    const id2 = cache.saveSnapshot({ project: 'acme', source: 'google', state: {} })
    expect(id2).toBe(id1 + 1)
  })

  test('snapshot state preserves arrays', () => {
    const state = [{ name: 'a' }, { name: 'b' }]
    const id = cache.saveSnapshot({ project: 'acme', source: 'test', state })
    const snapshot = cache.getSnapshot(id)
    expect(snapshot!.state).toEqual(state)
  })
})

// ─── Operations ────────────────────────────────────────────────

describe('operations', () => {
  test('saveOperation + getOperations round-trip', () => {
    const changeset = { creates: [{ kind: 'campaign', path: 'search' }] }
    const results = { success: true, platformIds: ['123'] }

    const id = cache.saveOperation({
      project: 'acme',
      changeset,
      results,
      user: 'alex',
    })

    expect(id).toBeGreaterThan(0)

    const ops = cache.getOperations('acme')
    expect(ops).toHaveLength(1)
    expect(ops[0]!.project).toBe('acme')
    expect(ops[0]!.changeset).toEqual(changeset)
    expect(ops[0]!.results).toEqual(results)
    expect(ops[0]!.user).toBe('alex')
    expect(ops[0]!.timestamp).toBeTruthy()
  })

  test('getOperations respects limit', () => {
    for (let i = 0; i < 5; i++) {
      cache.saveOperation({
        project: 'acme',
        changeset: { i },
        results: {},
        user: 'alex',
      })
    }

    const ops = cache.getOperations('acme', { limit: 3 })
    expect(ops).toHaveLength(3)
  })

  test('getOperations returns newest first', () => {
    cache.saveOperation({ project: 'acme', changeset: { step: 1 }, results: {}, user: 'alex' })
    cache.saveOperation({ project: 'acme', changeset: { step: 2 }, results: {}, user: 'alex' })

    const ops = cache.getOperations('acme')
    expect((ops[0]!.changeset as { step: number }).step).toBe(2)
    expect((ops[1]!.changeset as { step: number }).step).toBe(1)
  })

  test('getOperations returns empty for unknown project', () => {
    expect(cache.getOperations('unknown')).toEqual([])
  })
})

// ─── Schema Reopen ────────────────────────────────────────────

describe('schema versioning', () => {
  test('reopening cache does not recreate tables or lose data', () => {
    // Use a temp file for this test since :memory: can't reopen
    const tmpPath = `/tmp/ads-cache-test-${Date.now()}.db`

    const cache1 = new Cache(tmpPath)
    cache1.setResource({ project: 'acme', path: 'x', kind: 'campaign', managedBy: 'aac' })
    cache1.saveSnapshot({ project: 'acme', source: 'test', state: { ok: true } })
    cache1.close()

    const cache2 = new Cache(tmpPath)
    const resources = cache2.getResourceMap('acme')
    expect(resources).toHaveLength(1)
    expect(resources[0]!.path).toBe('x')

    const snapshot = cache2.getSnapshot(1)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.state).toEqual({ ok: true })

    cache2.close()

    // Cleanup
    try { require('fs').unlinkSync(tmpPath) } catch {}
  })
})
