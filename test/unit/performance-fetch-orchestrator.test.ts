/**
 * Tests for the performance fetch orchestrator — caching layer.
 *
 * Tests the cache integration (hit/miss/store/expiry) using real Cache
 * instances with :memory: SQLite. Provider dispatch is tested indirectly
 * through the Google and Meta fetch test files.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Cache } from '../../src/core/cache.ts'
import type { PerformanceData, PerformancePeriod } from '../../src/performance/types.ts'

const period: PerformancePeriod = {
  start: new Date('2026-03-01'),
  end: new Date('2026-03-07'),
}

const sampleData: PerformanceData[] = [
  {
    resource: 'brand-us',
    provider: 'google',
    kind: 'campaign',
    period,
    metrics: {
      impressions: 1000, clicks: 50, cost: 100, conversions: 10,
      conversionValue: 300, ctr: 0.05, cpc: 2, cpa: 10, roas: 3, cpm: 100,
    },
    violations: [],
    breakdowns: {},
  },
]

function jsonRoundTrip<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

// ---------------------------------------------------------------------------
// Cache integration (tests Cache methods directly, no module mocking)
// ---------------------------------------------------------------------------

describe('Performance caching', () => {
  let cache: Cache

  beforeEach(() => {
    cache = new Cache(':memory:')
  })

  afterEach(() => {
    cache.close()
  })

  test('stores and retrieves performance data', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-07')
    expect(cached).toEqual(jsonRoundTrip(sampleData))
  })

  test('returns null for cache miss', () => {
    const cached = cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-07')
    expect(cached).toBeNull()
  })

  test('returns null for expired cache (TTL=0)', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', 0)
    expect(cached).toBeNull()
  })

  test('scopes by project', () => {
    cache.setCachedPerformance('project-a', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('project-b', 'google', '2026-03-01', '2026-03-07')
    expect(cached).toBeNull()
  })

  test('scopes by provider', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('test', 'meta', '2026-03-01', '2026-03-07')
    expect(cached).toBeNull()
  })

  test('scopes by date range', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-14')
    expect(cached).toBeNull()
  })

  test('upserts on repeated writes', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', [])
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    const cached = cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-07')
    expect(cached).toEqual(jsonRoundTrip(sampleData))
  })

  test('clearPerformanceCache removes all entries', () => {
    cache.setCachedPerformance('test', 'google', '2026-03-01', '2026-03-07', sampleData)
    cache.setCachedPerformance('test', 'meta', '2026-03-01', '2026-03-07', sampleData)
    cache.clearPerformanceCache()
    expect(cache.getCachedPerformance('test', 'google', '2026-03-01', '2026-03-07')).toBeNull()
    expect(cache.getCachedPerformance('test', 'meta', '2026-03-01', '2026-03-07')).toBeNull()
  })

  test('clearPerformanceCache scoped to project', () => {
    cache.setCachedPerformance('project-a', 'google', '2026-03-01', '2026-03-07', sampleData)
    cache.setCachedPerformance('project-b', 'google', '2026-03-01', '2026-03-07', sampleData)
    cache.clearPerformanceCache('project-a')
    expect(cache.getCachedPerformance('project-a', 'google', '2026-03-01', '2026-03-07')).toBeNull()
    expect(cache.getCachedPerformance('project-b', 'google', '2026-03-01', '2026-03-07')).toEqual(jsonRoundTrip(sampleData))
  })
})
