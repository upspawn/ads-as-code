import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Cache } from '../../src/core/cache.ts'

let cache: Cache

beforeEach(() => {
  cache = new Cache(':memory:')
})

afterEach(() => {
  cache.close()
})

// ---------------------------------------------------------------------------
// Performance cache — round-trip, TTL, and clearing
// ---------------------------------------------------------------------------

describe('performance cache', () => {
  const project = 'acme'
  const provider = 'google'
  const start = '2026-03-01'
  const end = '2026-03-07'
  const data = [
    { resource: 'brand-us', provider: 'google', kind: 'campaign', metrics: { cost: 100 } },
  ]

  test('setCachedPerformance + getCachedPerformance round-trip', () => {
    cache.setCachedPerformance(project, provider, start, end, data)

    const result = cache.getCachedPerformance(project, provider, start, end)
    expect(result).toEqual(data)
  })

  test('returns null for missing cache entry', () => {
    const result = cache.getCachedPerformance(project, provider, start, end)
    expect(result).toBeNull()
  })

  test('returns null when cache entry is expired', () => {
    cache.setCachedPerformance(project, provider, start, end, data)

    // Use a TTL of 0 minutes so the entry is immediately expired
    const result = cache.getCachedPerformance(project, provider, start, end, 0)
    expect(result).toBeNull()
  })

  test('returns data when within TTL', () => {
    cache.setCachedPerformance(project, provider, start, end, data)

    // Large TTL — should still be valid
    const result = cache.getCachedPerformance(project, provider, start, end, 60)
    expect(result).toEqual(data)
  })

  test('upsert replaces existing cache entry', () => {
    cache.setCachedPerformance(project, provider, start, end, data)

    const newData = [{ resource: 'brand-eu', provider: 'google', kind: 'campaign', metrics: { cost: 200 } }]
    cache.setCachedPerformance(project, provider, start, end, newData)

    const result = cache.getCachedPerformance(project, provider, start, end)
    expect(result).toEqual(newData)
  })

  test('entries are scoped by project', () => {
    cache.setCachedPerformance('a', provider, start, end, [{ id: 'a' }])
    cache.setCachedPerformance('b', provider, start, end, [{ id: 'b' }])

    expect(cache.getCachedPerformance('a', provider, start, end)).toEqual([{ id: 'a' }])
    expect(cache.getCachedPerformance('b', provider, start, end)).toEqual([{ id: 'b' }])
  })

  test('entries are scoped by provider', () => {
    cache.setCachedPerformance(project, 'google', start, end, [{ p: 'google' }])
    cache.setCachedPerformance(project, 'meta', start, end, [{ p: 'meta' }])

    expect(cache.getCachedPerformance(project, 'google', start, end)).toEqual([{ p: 'google' }])
    expect(cache.getCachedPerformance(project, 'meta', start, end)).toEqual([{ p: 'meta' }])
  })

  test('entries are scoped by date range', () => {
    cache.setCachedPerformance(project, provider, '2026-03-01', '2026-03-07', [{ week: 1 }])
    cache.setCachedPerformance(project, provider, '2026-03-08', '2026-03-14', [{ week: 2 }])

    expect(cache.getCachedPerformance(project, provider, '2026-03-01', '2026-03-07')).toEqual([{ week: 1 }])
    expect(cache.getCachedPerformance(project, provider, '2026-03-08', '2026-03-14')).toEqual([{ week: 2 }])
  })
})

// ---------------------------------------------------------------------------
// clearPerformanceCache
// ---------------------------------------------------------------------------

describe('clearPerformanceCache', () => {
  test('clears all entries when no project specified', () => {
    cache.setCachedPerformance('a', 'google', '2026-03-01', '2026-03-07', [{ x: 1 }])
    cache.setCachedPerformance('b', 'meta', '2026-03-01', '2026-03-07', [{ x: 2 }])

    cache.clearPerformanceCache()

    expect(cache.getCachedPerformance('a', 'google', '2026-03-01', '2026-03-07')).toBeNull()
    expect(cache.getCachedPerformance('b', 'meta', '2026-03-01', '2026-03-07')).toBeNull()
  })

  test('clears only specified project entries', () => {
    cache.setCachedPerformance('a', 'google', '2026-03-01', '2026-03-07', [{ x: 1 }])
    cache.setCachedPerformance('b', 'google', '2026-03-01', '2026-03-07', [{ x: 2 }])

    cache.clearPerformanceCache('a')

    expect(cache.getCachedPerformance('a', 'google', '2026-03-01', '2026-03-07')).toBeNull()
    expect(cache.getCachedPerformance('b', 'google', '2026-03-01', '2026-03-07')).toEqual([{ x: 2 }])
  })
})

// ---------------------------------------------------------------------------
// Schema migration — existing data survives schema upgrade to v2
// ---------------------------------------------------------------------------

describe('schema upgrade adds performance_cache table', () => {
  test('performance_cache table exists on fresh :memory: database', () => {
    // If the table didn't exist, this would throw
    const result = cache.getCachedPerformance('test', 'google', '2026-01-01', '2026-01-07')
    expect(result).toBeNull()
  })
})
