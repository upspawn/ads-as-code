/**
 * Provider-agnostic performance fetch orchestrator.
 *
 * Dispatches to Google and/or Meta performance fetchers based on which
 * provider clients are supplied. Returns a unified PerformanceData[] array.
 *
 * Supports optional SQLite caching (15-minute TTL by default) to avoid
 * redundant API calls when running multiple commands in sequence.
 */

import type { PerformanceData, PerformancePeriod } from './types.ts'
import type { GoogleAdsClient } from '../google/types.ts'
import type { MetaClient } from '../meta/api.ts'
import type { RedditClient } from '../reddit/api.ts'
import type { RedditProviderConfig } from '../reddit/types.ts'
import type { Cache } from '../core/cache.ts'
import { fetchGooglePerformance } from '../google/performance.ts'
import { fetchMetaPerformance } from '../meta/performance.ts'
import { fetchRedditPerformance } from '../reddit/performance.ts'

// ---------------------------------------------------------------------------
// Input type — callers provide whichever provider clients are available
// ---------------------------------------------------------------------------

export type FetchPerformanceInput = {
  readonly google?: { readonly client: GoogleAdsClient }
  readonly meta?: { readonly client: MetaClient; readonly accountId: string }
  readonly reddit?: { readonly client: RedditClient; readonly config: RedditProviderConfig }
  readonly period: PerformancePeriod
  /** Optional cache instance for performance data caching. */
  readonly cache?: Cache
  /** Project name for cache key scoping. Defaults to 'default'. */
  readonly project?: string
  /** Cache TTL in minutes. Defaults to 15. */
  readonly cacheTtlMinutes?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Attempt to read from cache, falling back to the fetcher on miss.
 * Stores the result in cache after a successful fetch.
 */
async function fetchWithCache(
  provider: string,
  fetcher: () => Promise<PerformanceData[]>,
  cache: Cache | undefined,
  project: string,
  period: PerformancePeriod,
  ttlMinutes?: number,
): Promise<PerformanceData[]> {
  const startKey = formatDateKey(period.start)
  const endKey = formatDateKey(period.end)

  if (cache) {
    const cached = cache.getCachedPerformance(project, provider, startKey, endKey, ttlMinutes)
    if (cached) return cached as PerformanceData[]
  }

  const data = await fetcher()

  if (cache) {
    cache.setCachedPerformance(project, provider, startKey, endKey, data)
  }

  return data
}

// ---------------------------------------------------------------------------
// Orchestrator — fetch from all configured providers in parallel
// ---------------------------------------------------------------------------

/**
 * Fetch performance data from all configured ad platforms.
 *
 * Runs Google and Meta fetches in parallel when both are provided.
 * Returns an empty array when no providers are configured.
 *
 * When a `cache` instance is provided, checks for cached data before
 * hitting the API and stores fresh results for subsequent calls.
 */
export async function fetchPerformance(input: FetchPerformanceInput): Promise<PerformanceData[]> {
  const { cache, project = 'default', cacheTtlMinutes } = input
  const fetches: Promise<PerformanceData[]>[] = []

  if (input.google) {
    const { client } = input.google
    fetches.push(
      fetchWithCache(
        'google',
        () => fetchGooglePerformance(client, input.period),
        cache,
        project,
        input.period,
        cacheTtlMinutes,
      ),
    )
  }

  if (input.meta) {
    const { client, accountId } = input.meta
    fetches.push(
      fetchWithCache(
        'meta',
        () => fetchMetaPerformance(client, accountId, input.period),
        cache,
        project,
        input.period,
        cacheTtlMinutes,
      ),
    )
  }

  if (input.reddit) {
    const { client, config } = input.reddit
    fetches.push(
      fetchWithCache(
        'reddit',
        () => fetchRedditPerformance(config, client, input.period),
        cache,
        project,
        input.period,
        cacheTtlMinutes,
      ),
    )
  }

  if (fetches.length === 0) return []

  const results = await Promise.allSettled(fetches)
  return results
    .filter((r): r is PromiseFulfilledResult<PerformanceData[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
