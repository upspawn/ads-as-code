import type { Resource, Change, PropertyChange, Changeset } from './types.ts'

// ─── Helpers ──────────────────────────────────────────────

/** Convert a dollar/euro amount to micros (platform-native integer representation). */
export function toMicros(amount: number): number {
  return Math.round(amount * 1_000_000)
}

/** Normalize a URL for comparison: lowercase protocol, remove trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.protocol = u.protocol.toLowerCase()
    // Remove trailing slash from pathname (but keep "/" for root)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    return u.toString()
  } catch {
    // Not a valid URL — fall back to basic normalization
    return url.replace(/\/+$/, '').toLowerCase()
  }
}

/** Compare two string arrays as unordered sets. */
export function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((v, i) => v === sortedB[i])
}

// ─── Semantic Comparison ──────────────────────────────────

/** Deep equality with semantic awareness for known ad resource fields. */
function semanticEqual(field: string, desired: unknown, actual: unknown): boolean {
  // Budget: compare in micros to avoid float precision issues
  if (field === 'budget' && isBudget(desired) && isBudget(actual)) {
    return (
      toMicros(desired.amount) === toMicros(actual.amount) &&
      desired.currency === actual.currency &&
      desired.period === actual.period
    )
  }

  // Headlines/descriptions: order-independent comparison
  if ((field === 'headlines' || field === 'descriptions') && Array.isArray(desired) && Array.isArray(actual)) {
    return setEqual(desired as string[], actual as string[])
  }

  // Keyword text: case-insensitive
  if (field === 'text' && typeof desired === 'string' && typeof actual === 'string') {
    return desired.toLowerCase() === actual.toLowerCase()
  }

  // URLs: normalize before comparing
  if ((field === 'finalUrl' || field === 'url') && typeof desired === 'string' && typeof actual === 'string') {
    return normalizeUrl(desired) === normalizeUrl(actual)
  }

  // Default: deep structural equality
  return deepEqual(desired, actual)
}

function isBudget(v: unknown): v is { amount: number; currency: string; period: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'amount' in v &&
    'currency' in v &&
    'period' in v &&
    typeof (v as Record<string, unknown>).amount === 'number'
  )
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>)
    const keysB = Object.keys(b as Record<string, unknown>)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    )
  }

  return false
}

// ─── Property Comparison ──────────────────────────────────

/** Check if a value is effectively empty (undefined, null, or an empty-rules targeting object). */
function isEffectivelyEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    // { rules: [] } is effectively empty targeting
    if (keys.length === 1 && keys[0] === 'rules' && Array.isArray(obj.rules) && (obj.rules as unknown[]).length === 0) {
      return true
    }
    // Empty object {} is effectively empty
    if (keys.length === 0) return true
  }
  return false
}

/** Compare two property bags and return a list of changes. */
export function compareProperties(
  desired: Record<string, unknown>,
  actual: Record<string, unknown>,
): PropertyChange[] {
  const changes: PropertyChange[] = []
  const allKeys = new Set([...Object.keys(desired), ...Object.keys(actual)])

  for (const key of allKeys) {
    const dVal = desired[key]
    const aVal = actual[key]

    // Treat both-empty as equal (covers undefined vs null vs {rules:[]} vs missing)
    if (isEffectivelyEmpty(dVal) && isEffectivelyEmpty(aVal)) {
      continue
    }

    // If field exists only in desired → new property (but skip if effectively empty)
    if (!(key in actual)) {
      if (isEffectivelyEmpty(dVal)) continue
      changes.push({ field: key, from: undefined, to: dVal })
      continue
    }

    // If field exists only in actual → removed property (but skip if effectively empty)
    if (!(key in desired)) {
      if (isEffectivelyEmpty(aVal)) continue
      changes.push({ field: key, from: aVal, to: undefined })
      continue
    }

    // Both exist — use semantic comparison
    if (!semanticEqual(key, dVal, aVal)) {
      changes.push({ field: key, from: aVal, to: dVal })
    }
  }

  return changes
}

// ─── Diff Engine ──────────────────────────────────────────

/**
 * Compare desired state (from code) against actual state (from API)
 * and produce a Changeset describing all necessary mutations.
 *
 * @param desired   - Resources declared in code
 * @param actual    - Resources fetched from the platform API
 * @param managedPaths - Paths that we previously created (from cache). Resources in actual
 *                       that are in managedPaths but NOT in desired will be deleted.
 * @param pathToPlatformId - Cache mapping from old paths to platform IDs.
 *                           Enables RSA stable identity: when ad content changes,
 *                           the path hash changes, but we match by platformId to
 *                           produce an update instead of delete+create.
 */
export function diff(
  desired: Resource[],
  actual: Resource[],
  managedPaths?: Set<string>,
  pathToPlatformId?: Map<string, string>,
): Changeset {
  const creates: Change[] = []
  const updates: Change[] = []
  const deletes: Change[] = []
  const drift: Change[] = []

  const desiredByPath = new Map<string, Resource>(desired.map((r) => [r.path, r]))
  const actualByPath = new Map<string, Resource>(actual.map((r) => [r.path, r]))

  // Build reverse lookup: platformId → actual resource (for RSA stable identity)
  const actualByPlatformId = new Map<string, Resource>()
  for (const r of actual) {
    if (r.platformId) {
      actualByPlatformId.set(r.platformId, r)
    }
  }

  // Build reverse lookup from cache: platformId → desired resource path
  // This lets us find desired resources whose path changed but whose platformId
  // matches a known cached entry
  const cachedPlatformIdToPath = new Map<string, string>()
  if (pathToPlatformId) {
    for (const [path, platformId] of pathToPlatformId) {
      cachedPlatformIdToPath.set(platformId, path)
    }
  }

  // Track actual resources that have been matched (to avoid double-processing)
  const matchedActualPaths = new Set<string>()

  // 1. Process each desired resource
  for (const [dPath, dResource] of desiredByPath) {
    const aResource = actualByPath.get(dPath)

    if (aResource) {
      // Direct path match — compare properties
      matchedActualPaths.add(dPath)
      const changes = compareProperties(dResource.properties, aResource.properties)
      if (changes.length > 0) {
        updates.push({ op: 'update', resource: dResource, changes })
      }
    } else {
      // No direct path match — try RSA stable identity via cache
      let matched = false

      if (pathToPlatformId) {
        // Check if there's a cached platformId for this desired path
        // (This won't work for NEW paths — the cache maps OLD paths.)
        // Instead, check if any actual resource's platformId was previously
        // cached under a DIFFERENT path that no longer appears in desired.
        // We need to find: actual resources whose platformId matches a
        // cached platformId that was mapped from a path NOT in desired.

        // Actually, the pattern is:
        // - An old path existed in code → flatten produced path A → stored in cache as path A → platformId X
        // - Ad content changed → flatten now produces path B (different hash)
        // - Actual API still has the ad under platformId X (possibly at path A or its own path)
        // - We want to match desired path B to actual platformId X

        // So we check: for each actual resource with a platformId, is that platformId
        // in our cache? If the cached path differs from the desired path but the
        // platformId matches, it's a renamed resource.
        for (const [aPath, aRes] of actualByPath) {
          if (matchedActualPaths.has(aPath)) continue
          if (!aRes.platformId) continue

          // Is this actual resource's platformId known in our cache?
          const cachedPath = cachedPlatformIdToPath.get(aRes.platformId)
          if (cachedPath && !desiredByPath.has(cachedPath)) {
            // The old path is gone from desired, and we have a new desired path
            // with the same kind — this is an update to the existing ad
            if (aRes.kind === dResource.kind) {
              matchedActualPaths.add(aPath)
              const changes = compareProperties(dResource.properties, aRes.properties)
              updates.push({ op: 'update', resource: { ...dResource, platformId: aRes.platformId }, changes })
              matched = true
              break
            }
          }
        }
      }

      if (!matched) {
        creates.push({ op: 'create', resource: dResource })
      }
    }
  }

  // 2. Process actual resources not in desired
  for (const [aPath, aResource] of actualByPath) {
    if (matchedActualPaths.has(aPath)) continue
    if (desiredByPath.has(aPath)) continue

    // This actual resource has no corresponding desired resource
    if (managedPaths?.has(aPath)) {
      // We previously managed this resource but it's no longer in code → delete
      deletes.push({ op: 'delete', resource: aResource })
    }
    // If not in managedPaths, ignore — it's not our resource
  }

  return { creates, updates, deletes, drift }
}
