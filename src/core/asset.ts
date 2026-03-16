import { createHash } from 'crypto'
import { existsSync, statSync, mkdirSync, copyFileSync, unlinkSync, readdirSync, readFileSync } from 'fs'
import { extname, join } from 'path'

// ─── Types ──────────────────────────────────────────────────────

export type AssetOptions = {
  move?: boolean
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

type ResolveOptions = {
  assetsDir?: string
  refreshAssets?: boolean
  skipGenerate?: boolean
}

// ─── Hashing ────────────────────────────────────────────────────

/** Stable JSON serialization with sorted keys for deterministic hashing */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj)
  if (typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const sorted = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

function hashParams(params: unknown): string {
  return createHash('sha256').update(stableStringify(params)).digest('hex').slice(0, 16)
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Wraps a named async pipeline function into a typed marker factory.
 * Calling the returned function creates an AssetMarker — a frozen
 * descriptor that resolveAssets() will later execute and replace
 * with a managed file path.
 */
export function asset<T>(
  name: string,
  generate: (params: T) => Promise<string>,
  options: AssetOptions = {},
): (params: T) => AssetMarker {
  if (!name || typeof name !== 'string') {
    throw new Error('asset() requires a non-empty name')
  }
  if (typeof generate !== 'function') {
    throw new Error('asset() requires a generate function')
  }

  return (params: T): AssetMarker => {
    const paramsHash = hashParams(params)
    return Object.freeze({
      __brand: 'asset' as const,
      name,
      paramsHash,
      generate: () => generate(params),
      params,
      options,
    })
  }
}

/** Type guard for detecting markers during tree walk */
export function isAssetMarker(value: unknown): value is AssetMarker {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__brand === 'asset' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).paramsHash === 'string' &&
    typeof (value as Record<string, unknown>).generate === 'function'
  )
}

// ─── Resolution ─────────────────────────────────────────────────

/** Find a cached file matching the params hash in the pipeline directory */
function findCachedFile(dir: string, paramsHash: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
  const match = files.find(f => f.startsWith(paramsHash + '-'))
  return match ? join(dir, match) : null
}

/** Recursively collect AssetMarker values with their object paths */
function collectMarkers(
  obj: unknown,
  path: string[],
  result: { path: string[]; marker: AssetMarker }[],
): void {
  if (isAssetMarker(obj)) {
    result.push({ path, marker: obj })
    return
  }
  if (obj === null || obj === undefined || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      collectMarkers(obj[i], [...path, String(i)], result)
    }
    return
  }
  for (const key of Object.keys(obj)) {
    collectMarkers((obj as Record<string, unknown>)[key], [...path, key], result)
  }
}

/** Deep clone, replacing AssetMarker values with their resolved paths */
function replaceMarkers(obj: unknown, paths: Map<AssetMarker, string>): unknown {
  if (isAssetMarker(obj)) return paths.get(obj) ?? ''
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    const arr = obj.map(item => replaceMarkers(item, paths))
    return Object.isFrozen(obj) ? Object.freeze(arr) : arr
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    result[key] = replaceMarkers((obj as Record<string, unknown>)[key], paths)
  }
  return Object.isFrozen(obj) ? Object.freeze(result) : result
}

/**
 * Walk a campaign object tree, resolve AssetMarker values by running
 * their generate functions (or returning cached paths), and return
 * a new object with markers replaced by managed file paths.
 */
export async function resolveAssets<T>(
  obj: T,
  options: ResolveOptions = {},
): Promise<ResolveResult<T>> {
  const assetsDir = options.assetsDir ?? '.assets'

  // 1. Collect all markers from the object tree
  const markers: { path: string[]; marker: AssetMarker }[] = []
  collectMarkers(obj, [], markers)

  if (markers.length === 0) return { resolved: obj, assets: [] }

  // 2. Resolve each marker concurrently
  const assets: AssetResolution[] = []

  const results = await Promise.allSettled(
    markers.map(async ({ marker }, i) => {
      const { name, paramsHash, generate } = marker
      const pipelineDir = join(assetsDir, name)
      mkdirSync(pipelineDir, { recursive: true })

      // Check cache
      const existing = findCachedFile(pipelineDir, paramsHash)

      if (existing && !options.refreshAssets) {
        assets[i] = { name, output: existing, status: 'cached' }
        return existing
      }

      if (options.skipGenerate) {
        assets[i] = { name, output: existing ?? '', status: 'cached' }
        return existing ?? ''
      }

      const start = Date.now()

      // Run the pipeline
      const sourcePath = await generate()

      // Validate output
      if (!existsSync(sourcePath)) {
        throw new Error(`Pipeline "${name}" returned path that does not exist: ${sourcePath}`)
      }
      const stat = statSync(sourcePath)
      if (stat.isDirectory()) {
        throw new Error(`Pipeline "${name}" returned a directory: ${sourcePath}`)
      }
      if (stat.size === 0) {
        throw new Error(`Pipeline "${name}" returned an empty file: ${sourcePath}`)
      }

      // Compute content hash
      const contentHash = createHash('sha256')
        .update(readFileSync(sourcePath))
        .digest('hex')
        .slice(0, 16)

      // Copy to managed path
      const ext = extname(sourcePath)
      const managedPath = join(pipelineDir, `${paramsHash}-${contentHash}${ext}`)

      if (!existsSync(managedPath)) {
        copyFileSync(sourcePath, managedPath)
      }

      // Clean up old files with same params hash but different content hash
      if (existing && existing !== managedPath) {
        try { unlinkSync(existing) } catch { /* ignore */ }
      }

      // Move mode: delete source file
      if (marker.options.move) {
        try { unlinkSync(sourcePath) } catch { /* ignore */ }
      }

      assets[i] = {
        name,
        output: managedPath,
        status: 'generated',
        durationMs: Date.now() - start,
      }
      return managedPath
    }),
  )

  // 3. Handle failures
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    if (r.status === 'rejected') {
      const reason = (r as PromiseRejectedResult).reason
      assets[i] = {
        name: markers[i]!.marker.name,
        output: '',
        status: 'failed',
        error: reason?.message ?? String(reason),
      }
    }
  }

  // 4. Build resolved path map and replace markers in the object tree
  const resolvedPaths = new Map<AssetMarker, string>()
  for (let i = 0; i < markers.length; i++) {
    const r = results[i]!
    resolvedPaths.set(
      markers[i]!.marker,
      r.status === 'fulfilled' ? (r as PromiseFulfilledResult<string>).value : '',
    )
  }

  return {
    resolved: replaceMarkers(obj, resolvedPaths) as T,
    assets,
  }
}
