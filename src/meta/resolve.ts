import type { MetaClient } from './api.ts'
import type { MetaTargeting, InterestTarget } from './types.ts'
import type { MetaProviderConfig } from '../core/types.ts'
import { lookupInterest } from './interests-catalog.ts'
import type { Cache } from '../core/cache.ts'

// ─── Resolution Cache (SQLite-backed) ─────────────────────
// We store resolved interest IDs and audience IDs in the existing
// SQLite cache so repeated plan/validate runs skip API calls.

const INTEREST_CACHE_KIND = 'meta-interest'
const AUDIENCE_CACHE_KIND = 'meta-audience'

type ResolvedInterest = { readonly id: string; readonly name: string }

/**
 * Targeting Search API response shape.
 * Returned by `GET /search?type=adinterest&q={query}`.
 */
type InterestSearchResult = {
  readonly id: string
  readonly name: string
  readonly audience_size_lower_bound?: number
  readonly audience_size_upper_bound?: number
}

/**
 * Custom audience list response shape.
 * Returned by `GET /{accountId}/customaudiences?fields=name`.
 */
type CustomAudienceResult = {
  readonly id: string
  readonly name: string
}

// ─── Interest Resolution ──────────────────────────────────

/**
 * Resolve a single interest name to `{ id, name }`.
 *
 * Resolution order:
 * 1. Bundled catalog (instant, no API call)
 * 2. SQLite cache from previous resolution
 * 3. Meta Targeting Search API (cached after first hit)
 *
 * Throws if the name matches zero or multiple interests.
 */
async function resolveInterestByName(
  name: string,
  client: MetaClient,
  cache: Cache | null,
  project: string,
): Promise<ResolvedInterest> {
  // 1. Check bundled catalog
  const catalogHit = lookupInterest(name)
  if (catalogHit) return catalogHit

  // 2. Check SQLite cache
  if (cache) {
    const cacheKey = `${project}/${INTEREST_CACHE_KIND}/${name.toLowerCase()}`
    const rows = cache.getResourceMap(cacheKey)
    if (rows.length > 0) {
      const row = rows[0]!
      return { id: row.platformId ?? '', name: row.path }
    }
  }

  // 3. Query Meta Targeting Search API
  const results = await client.graphGet<{ data: InterestSearchResult[] }>('search', {
    type: 'adinterest',
    q: name,
  })

  const matches = results.data ?? []

  if (matches.length === 0) {
    throw new Error(
      `Interest "${name}" not found. Check the name or use { id, name } for explicit targeting. ` +
      `Search the catalog with: ads search interests "${name}"`
    )
  }

  // Exact match by name (case-insensitive)
  const exactMatches = matches.filter(m => m.name.toLowerCase() === name.toLowerCase())

  if (exactMatches.length === 1) {
    const resolved = { id: exactMatches[0]!.id, name: exactMatches[0]!.name }
    cacheInterest(cache, project, name, resolved)
    return resolved
  }

  if (exactMatches.length > 1) {
    const options = exactMatches.map(m => `  - { id: '${m.id}', name: '${m.name}' }`).join('\n')
    throw new Error(
      `Interest "${name}" is ambiguous — ${exactMatches.length} matches found:\n${options}\n` +
      `Use the explicit { id, name } form to select one.`
    )
  }

  // No exact match — show top candidates
  const top = matches.slice(0, 5)
  const suggestions = top.map(m => `  - { id: '${m.id}', name: '${m.name}' }`).join('\n')
  throw new Error(
    `Interest "${name}" not found as exact match. Similar interests:\n${suggestions}\n` +
    `Use the explicit { id, name } form or adjust the name.`
  )
}

function cacheInterest(cache: Cache | null, project: string, name: string, resolved: ResolvedInterest): void {
  if (!cache) return
  cache.setResource({
    project: `${project}/${INTEREST_CACHE_KIND}/${name.toLowerCase()}`,
    path: resolved.name,
    platformId: resolved.id,
    kind: INTEREST_CACHE_KIND,
    managedBy: 'meta-resolve',
  })
}

// ─── Audience Resolution ──────────────────────────────────

/**
 * Resolve audience names to IDs by querying the account's custom audiences.
 * Results are cached in SQLite.
 */
async function resolveAudienceByName(
  name: string,
  accountId: string,
  client: MetaClient,
  cache: Cache | null,
  project: string,
): Promise<string> {
  // 1. Check SQLite cache
  if (cache) {
    const cacheKey = `${project}/${AUDIENCE_CACHE_KIND}/${name.toLowerCase()}`
    const rows = cache.getResourceMap(cacheKey)
    if (rows.length > 0) {
      return rows[0]!.platformId ?? ''
    }
  }

  // 2. Query Meta API for account custom audiences
  const audiences = await client.graphGetAll<CustomAudienceResult>(
    `${accountId}/customaudiences`,
    { fields: 'name' },
  )

  // Case-insensitive match by name
  const matches = audiences.filter(a => a.name.toLowerCase() === name.toLowerCase())

  if (matches.length === 0) {
    const available = audiences.slice(0, 10).map(a => `  - "${a.name}" (${a.id})`).join('\n')
    throw new Error(
      `Custom audience "${name}" not found in account ${accountId}.\n` +
      `Available audiences:\n${available}\n` +
      `Use an explicit audience ID or check the name.`
    )
  }

  if (matches.length > 1) {
    const options = matches.map(a => `  - "${a.name}" (${a.id})`).join('\n')
    throw new Error(
      `Audience name "${name}" is ambiguous — ${matches.length} matches:\n${options}\n` +
      `Use an explicit audience ID to select one.`
    )
  }

  const id = matches[0]!.id

  // Cache the result
  if (cache) {
    cache.setResource({
      project: `${project}/${AUDIENCE_CACHE_KIND}/${name.toLowerCase()}`,
      path: name,
      platformId: id,
      kind: AUDIENCE_CACHE_KIND,
      managedBy: 'meta-resolve',
    })
  }

  return id
}

// ─── Public API ───────────────────────────────────────────

/**
 * Resolve all string-based interest names and audience names in a
 * MetaTargeting object to concrete `{ id, name }` pairs.
 *
 * This is called during `validate` and `plan` — not during flatten.
 * Flatten stores markers; this function resolves them.
 *
 * Interests: check catalog first, then Targeting Search API.
 * Audiences: query account custom audiences and match by name.
 * All results are cached in SQLite.
 */
export async function resolveTargeting(
  targeting: MetaTargeting,
  config: MetaProviderConfig,
  client: MetaClient,
  cache: Cache | null,
  project: string = 'meta',
): Promise<MetaTargeting> {
  let resolved = { ...targeting }

  // Resolve interests that are stored as { id, name } but name-only
  // In the current type system, interests are already `InterestTarget[]` with { id, name }.
  // This resolution handles future deferred markers from the targeting helper
  // where interests might be specified by name only.
  // For now, interests with an id are passed through as-is.

  // Resolve custom audiences (string names -> IDs)
  if (targeting.customAudiences && targeting.customAudiences.length > 0) {
    const resolvedAudiences = await Promise.all(
      targeting.customAudiences.map(name =>
        resolveAudienceByName(name, config.accountId, client, cache, project)
      ),
    )
    resolved = { ...resolved, customAudiences: resolvedAudiences }
  }

  // Resolve excluded audiences (string names -> IDs)
  if (targeting.excludedAudiences && targeting.excludedAudiences.length > 0) {
    const resolvedExcluded = await Promise.all(
      targeting.excludedAudiences.map(name =>
        resolveAudienceByName(name, config.accountId, client, cache, project)
      ),
    )
    resolved = { ...resolved, excludedAudiences: resolvedExcluded }
  }

  return resolved
}

/**
 * Resolve a single interest by name — for use by the `ads search` command
 * and by the targeting helper's deferred resolution.
 */
export async function resolveInterest(
  name: string,
  client: MetaClient,
  cache: Cache | null,
  project: string = 'meta',
): Promise<InterestTarget> {
  return resolveInterestByName(name, client, cache, project)
}
