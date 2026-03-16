# Asset Pipelines Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pluggable creative asset pipelines — `asset(name, fn, options?)` wraps typed functions that produce images/videos. SDK-managed `.assets/` folder with content-hash filenames. Filesystem-based caching with awareness of ad platform creative immutability.

**Architecture:** `asset()` is a higher-order function. `generate(params)` returns a file path. SDK hashes params + content, copies (or moves) to `.assets/<name>/<params-hash>-<content-hash>.<ext>`. Markers flow through campaign objects like `ai.rsa()` markers. `resolveAssets()` walks the tree, generates missing files, replaces markers with managed paths before flatten.

**Tech Stack:** Bun, TypeScript (strict), bun:test

**Spec:** `docs/superpowers/specs/2026-03-16-asset-pipelines-design.md`

---

## Chunk 1: Core asset module

### Task 1: `asset()` factory, `AssetMarker`, `isAssetMarker()`

**Files:**
- Create: `src/core/asset.ts`
- Create: `test/unit/asset.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/unit/asset.test.ts
import { describe, expect, test } from 'bun:test'
import { asset, isAssetMarker } from '../../src/core/asset.ts'

describe('asset()', () => {
  const pipeline = asset('product-card', async (p: { name: string; size: number }) => {
    return `/tmp/fake-${p.name}-${p.size}.png`
  })

  test('returns a function', () => {
    expect(typeof pipeline).toBe('function')
  })

  test('calling the factory returns an AssetMarker', () => {
    const marker = pipeline({ name: 'shoe', size: 1080 })
    expect(marker.__brand).toBe('asset')
    expect(marker.name).toBe('product-card')
    expect(typeof marker.paramsHash).toBe('string')
    expect(marker.paramsHash.length).toBe(16)
    expect(typeof marker.generate).toBe('function')
  })

  test('marker is frozen', () => {
    const marker = pipeline({ name: 'shoe', size: 1080 })
    expect(Object.isFrozen(marker)).toBe(true)
  })

  test('same params produce same paramsHash', () => {
    const a = pipeline({ name: 'shoe', size: 1080 })
    const b = pipeline({ name: 'shoe', size: 1080 })
    expect(a.paramsHash).toBe(b.paramsHash)
  })

  test('different params produce different paramsHash', () => {
    const a = pipeline({ name: 'shoe', size: 1080 })
    const b = pipeline({ name: 'shoe', size: 1920 })
    expect(a.paramsHash).not.toBe(b.paramsHash)
  })

  test('options default to empty', () => {
    const marker = pipeline({ name: 'shoe', size: 1080 })
    expect(marker.options).toEqual({})
  })

  test('move option is passed through', () => {
    const movePipeline = asset('card', async () => '/tmp/x.png', { move: true })
    const marker = movePipeline(undefined as any)
    expect(marker.options.move).toBe(true)
  })
})

describe('asset() validation', () => {
  test('throws on empty name', () => {
    expect(() => asset('', async () => '/tmp/x.png')).toThrow('non-empty name')
  })

  test('throws when generate is not a function', () => {
    expect(() => asset('test', 'not a function' as any)).toThrow('function')
  })
})

describe('isAssetMarker()', () => {
  const pipeline = asset('test', async () => '/tmp/x.png')

  test('returns true for an AssetMarker', () => {
    expect(isAssetMarker(pipeline({}))).toBe(true)
  })

  test('returns false for a plain string', () => {
    expect(isAssetMarker('./assets/foo.png')).toBe(false)
  })

  test('returns false for null/undefined', () => {
    expect(isAssetMarker(null)).toBe(false)
    expect(isAssetMarker(undefined)).toBe(false)
  })

  test('returns false for an AiMarker', () => {
    expect(isAssetMarker({ __brand: 'ai-marker', type: 'rsa' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/asset.test.ts`
Expected: FAIL — cannot resolve `../../src/core/asset.ts`

- [ ] **Step 3: Implement `asset()` and `isAssetMarker()`**

```ts
// src/core/asset.ts
import { createHash } from 'crypto'

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

/** Stable JSON serialization with sorted keys for deterministic hashing */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj)
  if (typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const sorted = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + stableStringify((obj as any)[k])).join(',') + '}'
}

function hashParams(params: unknown): string {
  return createHash('sha256').update(stableStringify(params)).digest('hex').slice(0, 16)
}

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

export function isAssetMarker(value: unknown): value is AssetMarker {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    (value as any).__brand === 'asset' &&
    typeof (value as any).name === 'string' &&
    typeof (value as any).paramsHash === 'string' &&
    typeof (value as any).generate === 'function'
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/asset.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/asset.ts test/unit/asset.test.ts
git commit -m "feat(asset): add asset() factory and isAssetMarker() type guard"
```

---

### Task 2: `resolveAssets()` — tree walker, generation, caching, managed paths

**Files:**
- Modify: `src/core/asset.ts`
- Modify: `test/unit/asset.test.ts`

- [ ] **Step 1: Write failing tests for `resolveAssets()`**

Add to `test/unit/asset.test.ts`:

```ts
import { asset, isAssetMarker, resolveAssets } from '../../src/core/asset.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

describe('resolveAssets()', () => {
  const assetsDir = join(import.meta.dir, '../.tmp-assets')

  function cleanup() {
    if (existsSync(assetsDir)) rmSync(assetsDir, { recursive: true })
  }

  test('replaces AssetMarker with managed path in a simple object', async () => {
    cleanup()
    const pipeline = asset('card', async (p: { id: string }) => {
      const tmp = join(assetsDir, '.tmp', `${p.id}.png`)
      mkdirSync(join(assetsDir, '.tmp'), { recursive: true })
      writeFileSync(tmp, `fake-image-${p.id}`)
      return tmp
    })

    const obj = {
      name: 'test',
      ads: [{ image: pipeline({ id: 'hero' }), headline: 'Hello' }],
    }

    const { resolved, assets } = await resolveAssets(obj, { assetsDir })

    // Marker replaced with a managed path
    expect(typeof resolved.ads[0].image).toBe('string')
    expect(isAssetMarker(resolved.ads[0].image)).toBe(false)
    expect((resolved.ads[0].image as string).startsWith(join(assetsDir, 'card/'))).toBe(true)
    expect((resolved.ads[0].image as string)).toMatch(/\.png$/)

    // File exists at managed path
    expect(existsSync(resolved.ads[0].image as string)).toBe(true)

    // Non-marker fields untouched
    expect(resolved.ads[0].headline).toBe('Hello')

    // Asset summary
    expect(assets).toHaveLength(1)
    expect(assets[0].status).toBe('generated')

    cleanup()
  })

  test('caches by params hash — skips generation on second call', async () => {
    cleanup()
    let callCount = 0
    const pipeline = asset('card', async (p: { id: string }) => {
      callCount++
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `content-${p.id}`)
      return tmp
    })

    const obj = { image: pipeline({ id: 'hero' }) }

    // First call — generates
    const { resolved: r1 } = await resolveAssets(obj, { assetsDir })
    expect(callCount).toBe(1)

    // Second call — cached
    const obj2 = { image: pipeline({ id: 'hero' }) }
    const { resolved: r2, assets } = await resolveAssets(obj2, { assetsDir })
    expect(callCount).toBe(1) // NOT called again
    expect(assets[0].status).toBe('cached')
    expect(r1.image).toBe(r2.image) // same managed path

    cleanup()
  })

  test('content hash changes on regeneration produce new path', async () => {
    cleanup()
    let version = 1
    const pipeline = asset('card', async (_p: {}) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `content-v${version}`)
      return tmp
    })

    // First generation
    const { resolved: r1 } = await resolveAssets({ image: pipeline({}) }, { assetsDir })

    // Force regeneration with different content
    version = 2
    const { resolved: r2 } = await resolveAssets(
      { image: pipeline({}) },
      { assetsDir, refreshAssets: true },
    )

    // Different managed paths (content hash changed)
    expect(r1.image).not.toBe(r2.image)

    cleanup()
  })

  test('handles deeply nested markers (carousel cards)', async () => {
    cleanup()
    const pipeline = asset('card', async (p: { n: number }) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `card-${p.n}`)
      return tmp
    })

    const obj = {
      adSets: [{
        content: {
          ads: [{
            format: 'carousel',
            cards: [
              { image: pipeline({ n: 1 }), headline: 'A' },
              { image: pipeline({ n: 2 }), headline: 'B' },
            ],
          }],
        },
      }],
    }

    const { resolved } = await resolveAssets(obj, { assetsDir })
    expect(typeof resolved.adSets[0].content.ads[0].cards[0].image).toBe('string')
    expect(typeof resolved.adSets[0].content.ads[0].cards[1].image).toBe('string')
    expect(resolved.adSets[0].content.ads[0].cards[0].image)
      .not.toBe(resolved.adSets[0].content.ads[0].cards[1].image)

    cleanup()
  })

  test('partial failure: successful assets still resolve', async () => {
    cleanup()
    const good = asset('good', async (_p: {}) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, 'ok')
      return tmp
    })
    const bad = asset('bad', async (_p: {}) => {
      throw new Error('API timeout')
    })

    const obj = { a: good({}), b: bad({}) }
    const { resolved, assets } = await resolveAssets(obj, { assetsDir })

    // Good asset resolved
    expect(typeof resolved.a).toBe('string')
    expect(assets.find(a => a.name === 'good')?.status).toBe('generated')

    // Bad asset marked failed, marker replaced with empty string
    expect(assets.find(a => a.name === 'bad')?.status).toBe('failed')
    expect(assets.find(a => a.name === 'bad')?.error).toContain('API timeout')

    cleanup()
  })

  test('move option deletes source file after copy', async () => {
    cleanup()
    const pipeline = asset('card', async (_p: {}) => {
      const tmp = `/tmp/test-move-${crypto.randomUUID()}.png`
      writeFileSync(tmp, 'movable')
      return tmp
    }, { move: true })

    const obj = { image: pipeline({}) }
    const marker = obj.image as AssetMarker
    const { resolved } = await resolveAssets(obj, { assetsDir })

    // Managed path exists
    expect(existsSync(resolved.image as string)).toBe(true)

    cleanup()
  })

  test('skipGenerate replaces markers without running pipelines', async () => {
    cleanup()
    // Pre-populate cache
    const pipeline = asset('card', async (_p: {}) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, 'data')
      return tmp
    })

    // First run to populate cache
    await resolveAssets({ image: pipeline({}) }, { assetsDir })

    // Second run with skipGenerate
    let called = false
    const pipeline2 = asset('card', async (_p: {}) => {
      called = true
      return '/tmp/x.png'
    })
    const { resolved } = await resolveAssets(
      { image: pipeline2({}) },
      { assetsDir, skipGenerate: true },
    )

    // Returns cached path without calling generate
    expect(called).toBe(false)
    expect(typeof resolved.image).toBe('string')

    cleanup()
  })

  test('refreshAssets cleans old files for same params hash', async () => {
    cleanup()
    let version = 1
    const pipeline = asset('card', async (_p: {}) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `v${version}`)
      return tmp
    })

    // Generate v1
    const { resolved: r1 } = await resolveAssets({ image: pipeline({}) }, { assetsDir })
    expect(existsSync(r1.image as string)).toBe(true)
    const oldPath = r1.image as string

    // Regenerate v2
    version = 2
    const { resolved: r2 } = await resolveAssets(
      { image: pipeline({}) },
      { assetsDir, refreshAssets: true },
    )

    // Old file cleaned up, new file exists
    expect(existsSync(oldPath)).toBe(false)
    expect(existsSync(r2.image as string)).toBe(true)

    cleanup()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/asset.test.ts`
Expected: FAIL — `resolveAssets` is not exported

- [ ] **Step 3: Implement `resolveAssets()`**

Add to `src/core/asset.ts`:

```ts
import { existsSync, statSync, mkdirSync, copyFileSync, unlinkSync, readdirSync } from 'fs'
import { dirname, extname, join } from 'path'

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
  assetsDir?: string      // Default: '.assets'
  refreshAssets?: boolean  // Delete and regenerate all
  skipGenerate?: boolean   // Just substitute cached paths, don't run pipelines (for pull)
}

export async function resolveAssets<T>(
  obj: T,
  options: ResolveOptions = {},
): Promise<ResolveResult<T>> {
  const assetsDir = options.assetsDir ?? '.assets'

  // 1. Collect all markers
  const markers: { path: string[]; marker: AssetMarker }[] = []
  collectMarkers(obj, [], markers)

  if (markers.length === 0) return { resolved: obj, assets: [] }

  // 2. Resolve each marker
  const assets: AssetResolution[] = []

  const results = await Promise.allSettled(
    markers.map(async ({ marker }, i) => {
      const { name, paramsHash, generate } = marker
      const pipelineDir = join(assetsDir, name)
      mkdirSync(pipelineDir, { recursive: true })

      // Check cache: look for existing file with this params hash
      const existing = findCachedFile(pipelineDir, paramsHash)

      if (existing && !options.refreshAssets) {
        assets[i] = { name, output: existing, status: 'cached' }
        return existing
      }

      if (options.skipGenerate) {
        // For pull: return cached path if exists, or a placeholder
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
        try { unlinkSync(existing) } catch {}
      }

      // Move mode: delete source file
      if (marker.options.move) {
        try { unlinkSync(sourcePath) } catch {}
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
    if (results[i].status === 'rejected') {
      const reason = (results[i] as PromiseRejectedResult).reason
      assets[i] = {
        name: markers[i].marker.name,
        output: '',
        status: 'failed',
        error: reason?.message ?? String(reason),
      }
    }
  }

  // 4. Build resolved path map and replace markers
  const resolvedPaths = new Map<AssetMarker, string>()
  for (let i = 0; i < markers.length; i++) {
    const result = results[i]
    resolvedPaths.set(
      markers[i].marker,
      result.status === 'fulfilled' ? (result as PromiseFulfilledResult<string>).value : '',
    )
  }

  return {
    resolved: replaceMarkers(obj, resolvedPaths) as T,
    assets,
  }
}

/** Find a cached file matching the params hash in the pipeline directory */
function findCachedFile(dir: string, paramsHash: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
  const match = files.find(f => f.startsWith(paramsHash + '-'))
  return match ? join(dir, match) : null
}

/** Recursively collect AssetMarker values */
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
    collectMarkers((obj as any)[key], [...path, key], result)
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
    result[key] = replaceMarkers((obj as any)[key], paths)
  }
  return Object.isFrozen(obj) ? Object.freeze(result) : result
}
```

Note: add `import { readFileSync } from 'fs'` to the imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/asset.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/core/asset.ts test/unit/asset.test.ts
git commit -m "feat(asset): add resolveAssets() with SDK-managed paths and content hashing"
```

---

## Chunk 2: Type widening and exports

### Task 3: Widen Meta creative types to accept `AssetMarker`

**Files:**
- Modify: `src/meta/types.ts:109-165`
- Modify: `src/helpers/meta-creative.ts:83-132`

- [ ] **Step 1: Import `AssetMarker` and widen types in `src/meta/types.ts`**

Add import at top:
```ts
import type { AssetMarker } from '../core/asset.ts'
```

Widen these fields from `string` to `string | AssetMarker`:
- `ImageAd.image` (line 111)
- `VideoAd.video` (line 125)
- `VideoAd.thumbnail` (line 127)
- `CarouselCard.image` (line 138)
- `CollectionAd.coverImage` (line 159)
- `CollectionAd.coverVideo` (line 160)

- [ ] **Step 2: Update `image()` and `video()` helpers in `src/helpers/meta-creative.ts`**

Add import:
```ts
import type { AssetMarker } from '../core/asset.ts'
```

Update `image()` at line 83:
```ts
export function image(filePath: string | AssetMarker, config?: Partial<ImageAdConfig>): ImageAd {
  const name = config?.name ?? (typeof filePath === 'string' ? nameFromFile(filePath) : undefined)
  // rest of the function stays the same, just use `name` variable instead of nameFromFile(filePath) inline
```

Update `video()` at line 118 — same pattern.

Note: `carousel()` needs NO changes — it takes `readonly CarouselCard[]`, and `CarouselCard.image` is already widened. The tree walker handles nested markers.

- [ ] **Step 3: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/meta/types.ts src/helpers/meta-creative.ts
git commit -m "feat(asset): widen Meta creative types to accept AssetMarker"
```

---

### Task 4: Export from package

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add exports after the AI section (~line 166)**

```ts
// === Assets ===

export { asset, isAssetMarker } from './core/asset.ts'
export type { AssetMarker, AssetOptions, AssetResolution } from './core/asset.ts'
```

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(asset): export asset() and types from package"
```

---

## Chunk 3: CLI integration

### Task 5: Integrate into `plan.ts`

**Files:**
- Modify: `cli/plan.ts`

- [ ] **Step 1: Import `resolveAssets`**

```ts
import { resolveAssets } from '../src/core/asset.ts'
```

- [ ] **Step 2: Add `--refresh-assets` flag to argument parsing**

- [ ] **Step 3: Call `resolveAssets()` after marker resolution, before flatten**

After the `if (provider === 'google') { ... } else { ... }` block (~line 361-365):

```ts
const assetResults = await Promise.all(
  campaignObjects.map(c => resolveAssets(c, { refreshAssets: flags.refreshAssets }))
)
campaignObjects = assetResults.map(r => r.resolved)
const allAssets = assetResults.flatMap(r => r.assets)
```

- [ ] **Step 4: Display asset resolution summary before changeset**

```ts
if (allAssets.length > 0) {
  console.log('\nAssets:')
  for (const a of allAssets) {
    if (a.status === 'cached') console.log(`  ✓ ${a.name} — cached`)
    else if (a.status === 'generated') console.log(`  ▸ ${a.name} — generated (${a.durationMs}ms)`)
    else console.log(`  ✗ ${a.name} — failed: ${a.error}`)
  }
  const failed = allAssets.filter(a => a.status === 'failed')
  if (failed.length > 0) {
    console.log(`\n⚠ ${failed.length} asset(s) failed — affected ads show as unresolved`)
  }
}
```

- [ ] **Step 5: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all pass

- [ ] **Step 6: Commit**

```bash
git add cli/plan.ts
git commit -m "feat(asset): integrate resolveAssets() into plan command"
```

---

### Task 6: Integrate into `apply.ts`

**Files:**
- Modify: `cli/apply.ts`

- [ ] **Step 1: Import and add `--refresh-assets` flag**

```ts
import { resolveAssets } from '../src/core/asset.ts'
```

- [ ] **Step 2: Add `resolveAssets()` before flatten (~line 257)**

```ts
const assetResults = await Promise.all(
  sortedCampaigns.map(c =>
    resolveAssets(c.campaign, { refreshAssets: flags.refreshAssets })
  )
)
const resolvedCampaigns = assetResults.map(r => r.resolved)
const allAssets = assetResults.flatMap(r => r.assets)

const failedAssets = allAssets.filter(a => a.status === 'failed')
if (failedAssets.length > 0) {
  for (const a of failedAssets) console.error(`✗ Asset "${a.name}" failed: ${a.error}`)
  console.error(`${failedAssets.length} asset(s) failed. Proceeding without affected ads.`)
}

const desired = provider.flatten(resolvedCampaigns)
```

- [ ] **Step 3: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all pass

- [ ] **Step 4: Commit**

```bash
git add cli/apply.ts
git commit -m "feat(asset): integrate resolveAssets() into apply command"
```

---

### Task 7: Integrate into `validate.ts` and `pull.ts`

**Files:**
- Modify: `cli/validate.ts`
- Modify: `cli/pull.ts`

- [ ] **Step 1: Add asset marker detection to `validate.ts`**

Import `isAssetMarker` from `../src/core/asset.ts`. In the validation flow, scan campaign objects for asset markers and report their count. Do NOT run pipelines.

- [ ] **Step 2: Add path substitution to `pull.ts`**

Before the flatten call (~line 82), resolve assets with `skipGenerate: true`:

```ts
import { resolveAssets } from '../src/core/asset.ts'

// Substitute asset markers with cached paths (no generation)
const assetResults = await Promise.all(
  localCampaigns.map(c => resolveAssets(c, { skipGenerate: true }))
)
const resolvedCampaigns = assetResults.map(r => r.resolved)
const desiredResources = resolvedCampaigns.flatMap(flatten)
```

- [ ] **Step 3: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`

- [ ] **Step 4: Commit**

```bash
git add cli/validate.ts cli/pull.ts
git commit -m "feat(asset): add asset checks to validate and path substitution to pull"
```

---

## Chunk 4: Integration test

### Task 8: End-to-end test

**Files:**
- Create: `test/unit/asset-integration.test.ts`

- [ ] **Step 1: Write integration test with real creative helpers**

```ts
import { describe, expect, test } from 'bun:test'
import { asset, resolveAssets, isAssetMarker } from '../../src/core/asset.ts'
import { image, video } from '../../src/helpers/meta-creative.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

describe('asset pipeline integration', () => {
  const assetsDir = join(import.meta.dir, '../.tmp-asset-integration')

  function cleanup() {
    if (existsSync(assetsDir)) rmSync(assetsDir, { recursive: true })
  }

  test('full campaign with image and video assets', async () => {
    cleanup()

    const productCard = asset('product-card', async (p: { product: string; size: number }) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `fake-image-${p.product}-${p.size}`)
      return tmp
    })

    const promoVideo = asset('promo-video', async (p: { name: string }) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.mp4`
      writeFileSync(tmp, `fake-video-${p.name}`)
      return tmp
    }, { move: true })

    const campaign = {
      name: 'summer-shoes',
      adSets: [
        {
          name: 'main',
          ads: [
            image(productCard({ product: 'runner', size: 1080 }), {
              headline: 'Trail Runner',
              primaryText: 'Hit the trails',
            }),
          ],
        },
        {
          name: 'video',
          ads: [
            video(promoVideo({ name: 'summer-promo' }), {
              headline: 'Summer Collection',
              primaryText: 'New arrivals',
            }),
          ],
        },
      ],
    }

    // Markers present before resolution
    expect(isAssetMarker(campaign.adSets[0].ads[0].image)).toBe(true)
    expect(isAssetMarker(campaign.adSets[1].ads[0].video)).toBe(true)

    // Resolve
    const { resolved, assets } = await resolveAssets(campaign, { assetsDir })

    // Markers replaced with managed paths
    expect(typeof resolved.adSets[0].ads[0].image).toBe('string')
    expect((resolved.adSets[0].ads[0].image as string).includes('.tmp-asset-integration/product-card/')).toBe(true)
    expect((resolved.adSets[0].ads[0].image as string)).toMatch(/\.png$/)

    expect(typeof resolved.adSets[1].ads[0].video).toBe('string')
    expect((resolved.adSets[1].ads[0].video as string)).toMatch(/\.mp4$/)

    // Files exist at managed paths
    expect(existsSync(resolved.adSets[0].ads[0].image as string)).toBe(true)
    expect(existsSync(resolved.adSets[1].ads[0].video as string)).toBe(true)

    // Non-marker fields untouched
    expect(resolved.adSets[0].ads[0].headline).toBe('Trail Runner')
    expect(resolved.name).toBe('summer-shoes')

    // Asset summary
    expect(assets).toHaveLength(2)
    expect(assets.every(a => a.status === 'generated')).toBe(true)

    cleanup()
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All pass

- [ ] **Step 3: Run typecheck**

Run: `bunx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add test/unit/asset-integration.test.ts
git commit -m "test(asset): add end-to-end integration test"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`

- [ ] **Step 3: Verify exports**

```bash
bun -e "const m = await import('./src/index.ts'); console.log(typeof m.asset, typeof m.isAssetMarker)"
```
Expected: `function function`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(asset): asset pipelines — pluggable creative generation and composition"
```
