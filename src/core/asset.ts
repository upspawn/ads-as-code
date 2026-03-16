// === Asset Pipeline Module ===
// Pluggable creative asset pipelines with content-addressed caching.
// Follows the same marker pattern as AI markers — asset() returns a factory
// that produces frozen marker objects, resolved before flatten.

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────

export type AssetOptions = {
  readonly move?: boolean
}

export type AssetMarker = {
  readonly __brand: 'asset'
  readonly name: string
  readonly paramsHash: string
  readonly generate: () => Promise<string>
  readonly params: unknown
  readonly options: AssetOptions
}

export type AssetResolution = {
  name: string
  output: string
  status: 'cached' | 'generated' | 'failed'
  error?: string
  durationMs?: number
}

export type ResolveResult<T> = {
  resolved: T
  assets: AssetResolution[]
}

export type ResolveOptions = {
  /** Directory where managed assets are stored (default: `.assets`) */
  assetsDir?: string
  /** Re-run all pipelines even if cached, clean old files for same paramsHash */
  refreshAssets?: boolean
  /** Only substitute cached paths, never run generate (for pull command) */
  skipGenerate?: boolean
}

// ─── Stable JSON Stringify ───────────────────────────────────────────
// Deterministic serialization so identical params always produce the same hash,
// regardless of key insertion order.

function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
  return '{' + pairs.join(',') + '}'
}

// ─── Hashing ─────────────────────────────────────────────────────────

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

function hashParams(params: unknown): string {
  return sha256Hex(stableStringify(params)).slice(0, 16)
}

function hashFileContent(filePath: string): string {
  return sha256Hex(readFileSync(filePath)).slice(0, 16)
}

// ─── Type Guard ──────────────────────────────────────────────────────

/** Count all AssetMarker values in an object tree */
export function countAssetMarkers(obj: unknown): number {
  return collectMarkers(obj).length
}

export function isAssetMarker(value: unknown): value is AssetMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as AssetMarker).__brand === 'asset'
  )
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Define a reusable asset pipeline.
 *
 * Returns a factory function — call it with params to get an AssetMarker
 * that embeds in campaign definitions, resolved during plan/apply.
 */
export function asset<T>(
  name: string,
  generate: (params: T) => Promise<string>,
  options?: AssetOptions,
): (params: T) => AssetMarker {
  if (!name || typeof name !== 'string') {
    throw new Error('asset() requires a non-empty name')
  }
  if (typeof generate !== 'function') {
    throw new Error('asset() requires generate to be a function')
  }

  const resolvedOptions: AssetOptions = options ?? {}

  return (params: T): AssetMarker => {
    const pHash = hashParams(params)
    return Object.freeze({
      __brand: 'asset' as const,
      name,
      paramsHash: pHash,
      generate: () => generate(params),
      params,
      options: resolvedOptions,
    })
  }
}

// ─── Tree Walker: Collect Markers ────────────────────────────────────
// Walks an arbitrary object tree and collects all AssetMarker values
// along with their location (path of keys) for later replacement.

type MarkerLocation = {
  path: (string | number)[]
  marker: AssetMarker
}

function collectMarkers(obj: unknown, path: (string | number)[] = []): MarkerLocation[] {
  if (isAssetMarker(obj)) {
    return [{ path, marker: obj }]
  }
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return []
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((item, i) => collectMarkers(item, [...path, i]))
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(
    ([key, val]) => collectMarkers(val, [...path, key]),
  )
}

// ─── Tree Walker: Replace Markers ────────────────────────────────────
// Deep-clones the object, substituting markers with resolved values.
// Preserves Object.freeze semantics on cloned objects.

function replaceMarkers(
  obj: unknown,
  replacements: Map<AssetMarker, string>,
): unknown {
  if (isAssetMarker(obj)) {
    return replacements.get(obj) ?? obj
  }
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    const result = obj.map((item) => replaceMarkers(item, replacements))
    return Object.isFrozen(obj) ? Object.freeze(result) : result
  }
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = replaceMarkers(val, replacements)
  }
  return Object.isFrozen(obj) ? Object.freeze(result) : result
}

// ─── Cache Lookup ────────────────────────────────────────────────────
// Looks for an existing managed file matching `.assets/<name>/<paramsHash>-*`

function findCachedFile(assetsDir: string, name: string, paramsHash: string): string | undefined {
  const dir = join(assetsDir, name)
  if (!existsSync(dir)) return undefined
  const prefix = `${paramsHash}-`
  const match = readdirSync(dir).find((f) => f.startsWith(prefix))
  return match ? join(dir, match) : undefined
}

// ─── Clean Old Files ─────────────────────────────────────────────────
// Removes all managed files for a given paramsHash (used by refreshAssets).

function cleanParamsHashFiles(assetsDir: string, name: string, paramsHash: string): void {
  const dir = join(assetsDir, name)
  if (!existsSync(dir)) return
  const prefix = `${paramsHash}-`
  for (const f of readdirSync(dir)) {
    if (f.startsWith(prefix)) {
      unlinkSync(join(dir, f))
    }
  }
}

// ─── Post-Generate Validation ────────────────────────────────────────

function validateGeneratedFile(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Generated file does not exist: ${filePath}`)
  }
  const stat = statSync(filePath)
  if (stat.isDirectory()) {
    throw new Error(`Generated path is a directory, expected a file: ${filePath}`)
  }
  if (stat.size === 0) {
    throw new Error(`Generated file is empty: ${filePath}`)
  }
}

// ─── Resolve Single Marker ──────────────────────────────────────────

async function resolveSingleMarker(
  marker: AssetMarker,
  options: ResolveOptions,
): Promise<AssetResolution> {
  const assetsDir = options.assetsDir ?? '.assets'
  const { name, paramsHash } = marker

  // Check cache first (unless refreshing)
  if (!options.refreshAssets) {
    const cached = findCachedFile(assetsDir, name, paramsHash)
    if (cached) {
      return { name, output: cached, status: 'cached' }
    }
  }

  // Skip generation mode — only return cached paths
  if (options.skipGenerate) {
    const cached = findCachedFile(assetsDir, name, paramsHash)
    if (cached) {
      return { name, output: cached, status: 'cached' }
    }
    return { name, output: '', status: 'failed', error: 'No cached file and skipGenerate is true' }
  }

  // Clean old files when refreshing
  if (options.refreshAssets) {
    cleanParamsHashFiles(assetsDir, name, paramsHash)
  }

  const start = performance.now()
  try {
    const sourcePath = await marker.generate()
    validateGeneratedFile(sourcePath)

    // Build managed path: .assets/<name>/<paramsHash>-<contentHash>.<ext>
    const contentHash = hashFileContent(sourcePath)
    const ext = extname(sourcePath) || extname(basename(sourcePath))
    const managedDir = join(assetsDir, name)
    mkdirSync(managedDir, { recursive: true })
    const managedPath = join(managedDir, `${paramsHash}-${contentHash}${ext}`)

    // Copy (or move) source to managed location
    if (!existsSync(managedPath)) {
      copyFileSync(sourcePath, managedPath)
    }
    if (marker.options.move) {
      try { unlinkSync(sourcePath) } catch { /* source may already be gone */ }
    }

    const durationMs = Math.round(performance.now() - start)
    return { name, output: managedPath, status: 'generated', durationMs }
  } catch (err) {
    const durationMs = Math.round(performance.now() - start)
    const error = err instanceof Error ? err.message : String(err)
    return { name, output: '', status: 'failed', error, durationMs }
  }
}

// ─── Public API: resolveAssets() ─────────────────────────────────────

/**
 * Walk a campaign object tree, find AssetMarker values, generate/cache assets,
 * and replace markers with managed file paths.
 *
 * Uses Promise.allSettled for concurrency — one failure doesn't cancel others.
 */
export async function resolveAssets<T>(
  obj: T,
  options: ResolveOptions = {},
): Promise<ResolveResult<T>> {
  const locations = collectMarkers(obj)

  if (locations.length === 0) {
    return { resolved: obj, assets: [] }
  }

  // Resolve all markers concurrently
  const results = await Promise.allSettled(
    locations.map((loc) => resolveSingleMarker(loc.marker, options)),
  )

  // Build replacement map and asset resolutions
  const replacements = new Map<AssetMarker, string>()
  const assets: AssetResolution[] = []

  for (const [i, result] of results.entries()) {
    const loc = locations[i]!
    if (result.status === 'fulfilled') {
      assets.push(result.value)
      if (result.value.status !== 'failed') {
        replacements.set(loc.marker, result.value.output)
      }
    } else {
      // Promise rejection (shouldn't happen since resolveSingleMarker catches internally)
      const reason: unknown = result.reason
      assets.push({
        name: loc.marker.name,
        output: '',
        status: 'failed',
        error: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  const resolved = replaceMarkers(obj, replacements) as T
  return { resolved, assets }
}
