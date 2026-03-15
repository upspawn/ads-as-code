# Asset Pipelines Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pluggable creative asset pipelines — `asset()` wraps typed functions that produce images/videos, with filesystem-based caching and transparent integration into the plan/apply flow.

**Architecture:** `asset()` is a higher-order function that wraps `(params: T) => { output, generate }` into a marker factory. Markers flow through campaign objects like `ai.rsa()` markers. `resolveAssets()` walks the tree, generates missing files, and replaces markers with paths before flatten. Filesystem is the cache — file exists = skip.

**Tech Stack:** Bun, TypeScript (strict), bun:test

**Spec:** `docs/superpowers/specs/2026-03-15-asset-pipelines-design.md`

---

## Chunk 1: Core asset module

### Task 1: AssetMarker type and `asset()` factory

**Files:**
- Create: `src/core/asset.ts`
- Create: `test/unit/asset.test.ts`

- [ ] **Step 1: Write failing tests for `asset()` and `isAssetMarker()`**

```ts
// test/unit/asset.test.ts
import { describe, expect, test } from 'bun:test'
import { asset, isAssetMarker } from '../../src/core/asset.ts'

describe('asset()', () => {
  const pipeline = asset((p: { name: string; size: number }) => ({
    output: `./assets/${p.name}-${p.size}.png`,
    generate: async (out) => {
      // mock: just declare we'd write here
    },
  }))

  test('returns a function', () => {
    expect(typeof pipeline).toBe('function')
  })

  test('calling the factory returns an AssetMarker', () => {
    const marker = pipeline({ name: 'shoe', size: 1080 })
    expect(marker.__brand).toBe('asset')
    expect(marker.output).toBe('./assets/shoe-1080.png')
    expect(typeof marker.generate).toBe('function')
  })

  test('marker is frozen', () => {
    const marker = pipeline({ name: 'shoe', size: 1080 })
    expect(Object.isFrozen(marker)).toBe(true)
  })

  test('different params produce different output paths', () => {
    const a = pipeline({ name: 'shoe', size: 1080 })
    const b = pipeline({ name: 'shoe', size: 1920 })
    expect(a.output).not.toBe(b.output)
  })
})

describe('isAssetMarker()', () => {
  const pipeline = asset((p: { x: number }) => ({
    output: `./out/${p.x}.png`,
    generate: async () => {},
  }))

  test('returns true for an AssetMarker', () => {
    expect(isAssetMarker(pipeline({ x: 1 }))).toBe(true)
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

- [ ] **Step 3: Write `asset()` and `isAssetMarker()`**

```ts
// src/core/asset.ts

/** Descriptor returned by the user's pipeline function */
export type AssetDescriptor = {
  readonly output: string
  readonly generate: (outputPath: string) => Promise<void>
}

/** Marker object created by calling a wrapped pipeline */
export type AssetMarker = {
  readonly __brand: 'asset'
  readonly output: string
  readonly generate: (outputPath: string) => Promise<void>
}

/**
 * Wraps a pipeline definition into a typed marker factory.
 *
 * The pipeline function takes typed params and returns an AssetDescriptor
 * (output path + generate function). The returned factory takes the same
 * params and produces a frozen AssetMarker.
 */
export function asset<T>(
  fn: (params: T) => AssetDescriptor,
): (params: T) => AssetMarker {
  return (params: T): AssetMarker => {
    const descriptor = fn(params)

    if (!descriptor.output || typeof descriptor.output !== 'string') {
      throw new Error('asset pipeline must return a non-empty output path')
    }
    if (descriptor.output.endsWith('/')) {
      throw new Error(`asset output path must not end with "/": ${descriptor.output}`)
    }
    if (typeof descriptor.generate !== 'function') {
      throw new Error('asset pipeline must return a generate function')
    }

    return Object.freeze({
      __brand: 'asset' as const,
      output: descriptor.output,
      generate: descriptor.generate,
    })
  }
}

/** Type guard for detecting AssetMarker objects during tree walk */
export function isAssetMarker(value: unknown): value is AssetMarker {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    (value as any).__brand === 'asset' &&
    typeof (value as any).output === 'string' &&
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

### Task 2: Pre-generation validation tests

**Files:**
- Modify: `test/unit/asset.test.ts`

- [ ] **Step 1: Write failing tests for descriptor validation**

Add to `test/unit/asset.test.ts`:

```ts
describe('asset() descriptor validation', () => {
  test('throws on empty output path', () => {
    const bad = asset(() => ({
      output: '',
      generate: async () => {},
    }))
    expect(() => bad(undefined as any)).toThrow('non-empty output path')
  })

  test('throws on output path ending with /', () => {
    const bad = asset(() => ({
      output: './assets/output/',
      generate: async () => {},
    }))
    expect(() => bad(undefined as any)).toThrow('must not end with "/"')
  })

  test('throws when generate is not a function', () => {
    const bad = asset(() => ({
      output: './out/file.png',
      generate: 'not a function' as any,
    }))
    expect(() => bad(undefined as any)).toThrow('generate function')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass** (validation already implemented in Task 1)

Run: `bun test test/unit/asset.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add test/unit/asset.test.ts
git commit -m "test(asset): add descriptor validation tests"
```

---

### Task 3: `resolveAssets()` — tree walker and resolution

**Files:**
- Modify: `src/core/asset.ts`
- Modify: `test/unit/asset.test.ts`

- [ ] **Step 1: Write failing tests for `resolveAssets()`**

Add to `test/unit/asset.test.ts`:

```ts
import { asset, isAssetMarker, resolveAssets } from '../../src/core/asset.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

describe('resolveAssets()', () => {
  const tmpDir = join(import.meta.dir, '../.tmp-asset-test')

  // Clean up before/after
  function cleanup() {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }

  test('replaces AssetMarker with output path in a simple object', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const pipeline = asset((p: { id: string }) => ({
      output: join(tmpDir, `${p.id}.png`),
      generate: async (out) => {
        writeFileSync(out, 'fake-image-data')
      },
    }))

    const campaign = {
      name: 'test',
      ads: [{ image: pipeline({ id: 'hero' }), headline: 'Hello' }],
    }

    const { resolved, assets } = await resolveAssets(campaign)

    expect(resolved.ads[0].image).toBe(join(tmpDir, 'hero.png'))
    expect(typeof resolved.ads[0].image).toBe('string')
    expect(isAssetMarker(resolved.ads[0].image)).toBe(false)
    expect(resolved.ads[0].headline).toBe('Hello')
    expect(assets).toHaveLength(1)
    expect(assets[0].status).toBe('generated')

    cleanup()
  })

  test('skips generation when output file already exists', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })
    const outPath = join(tmpDir, 'cached.png')
    writeFileSync(outPath, 'pre-existing')

    let generateCalled = false
    const pipeline = asset((_p: {}) => ({
      output: outPath,
      generate: async () => {
        generateCalled = true
      },
    }))

    const campaign = { image: pipeline({}) }
    const { assets } = await resolveAssets(campaign)

    expect(generateCalled).toBe(false)
    expect(assets[0].status).toBe('cached')
    cleanup()
  })

  test('reports failure when generate does not create the output file', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const pipeline = asset((_p: {}) => ({
      output: join(tmpDir, 'missing.png'),
      generate: async () => {
        // intentionally does not write the file
      },
    }))

    const campaign = { image: pipeline({}) }
    const { assets } = await resolveAssets(campaign)

    expect(assets[0].status).toBe('failed')
    expect(assets[0].error).toContain('was not created')
    cleanup()
  })

  test('reports failure for empty output file', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const pipeline = asset((_p: {}) => ({
      output: join(tmpDir, 'empty.png'),
      generate: async (out) => {
        writeFileSync(out, '')  // empty file
      },
    }))

    const campaign = { image: pipeline({}) }
    const { assets } = await resolveAssets(campaign)

    expect(assets[0].status).toBe('failed')
    expect(assets[0].error).toContain('empty')
    cleanup()
  })

  test('handles deeply nested markers (carousel cards)', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const pipeline = asset((p: { n: number }) => ({
      output: join(tmpDir, `card-${p.n}.png`),
      generate: async (out) => {
        writeFileSync(out, `card-${p.n}`)
      },
    }))

    const campaign = {
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

    const { resolved } = await resolveAssets(campaign)
    expect(resolved.adSets[0].content.ads[0].cards[0].image).toBe(join(tmpDir, 'card-1.png'))
    expect(resolved.adSets[0].content.ads[0].cards[1].image).toBe(join(tmpDir, 'card-2.png'))

    cleanup()
  })

  test('runs multiple pipelines concurrently via Promise.allSettled', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })
    const order: string[] = []

    const slow = asset((p: { id: string }) => ({
      output: join(tmpDir, `${p.id}.png`),
      generate: async (out) => {
        order.push(`start-${p.id}`)
        await new Promise(r => setTimeout(r, 50))
        writeFileSync(out, p.id)
        order.push(`end-${p.id}`)
      },
    }))

    const campaign = {
      a: slow({ id: 'a' }),
      b: slow({ id: 'b' }),
    }

    await resolveAssets(campaign)

    // Both should have started before either finished (concurrent)
    expect(order[0]).toBe('start-a')
    expect(order[1]).toBe('start-b')

    cleanup()
  })

  test('partial failure: successful assets still resolve', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const good = asset((_p: {}) => ({
      output: join(tmpDir, 'good.png'),
      generate: async (out) => { writeFileSync(out, 'ok') },
    }))

    const bad = asset((_p: {}) => ({
      output: join(tmpDir, 'bad.png'),
      generate: async () => { throw new Error('API timeout') },
    }))

    const campaign = { a: good({}), b: bad({}) }
    const { resolved, assets } = await resolveAssets(campaign)

    // Good asset resolved
    expect(resolved.a).toBe(join(tmpDir, 'good.png'))
    expect(assets.find(a => a.output.includes('good'))?.status).toBe('generated')

    // Bad asset still replaced with path (for flatten), but marked failed
    expect(resolved.b).toBe(join(tmpDir, 'bad.png'))
    expect(assets.find(a => a.output.includes('bad'))?.status).toBe('failed')
    expect(assets.find(a => a.output.includes('bad'))?.error).toContain('API timeout')

    cleanup()
  })

  test('with refreshAssets: true, regenerates even when file exists', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })
    const outPath = join(tmpDir, 'refresh.png')
    writeFileSync(outPath, 'old-content')

    let generateCalled = false
    const pipeline = asset((_p: {}) => ({
      output: outPath,
      generate: async (out) => {
        generateCalled = true
        writeFileSync(out, 'new-content')
      },
    }))

    const campaign = { image: pipeline({}) }
    await resolveAssets(campaign, { refreshAssets: true })

    expect(generateCalled).toBe(true)
    cleanup()
  })

  test('skipGenerate replaces markers without running pipelines', async () => {
    let generateCalled = false
    const pipeline = asset((_p: {}) => ({
      output: './assets/skip.png',
      generate: async () => { generateCalled = true },
    }))

    const campaign = { image: pipeline({}) }
    const { resolved } = await resolveAssets(campaign, { skipGenerate: true })

    expect(resolved.image).toBe('./assets/skip.png')
    expect(generateCalled).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/asset.test.ts`
Expected: FAIL — `resolveAssets` is not exported

- [ ] **Step 3: Implement `resolveAssets()`**

Add to `src/core/asset.ts`:

```ts
import { existsSync, statSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { mkdirSync } from 'fs'

type ResolveOptions = {
  refreshAssets?: boolean
  skipGenerate?: boolean  // Just replace markers with output paths, don't run pipelines (for pull)
}

export type AssetResolution = {
  output: string
  status: 'cached' | 'generated' | 'failed'
  error?: string
  durationMs?: number
}

export type ResolveResult<T> = {
  resolved: T
  assets: AssetResolution[]
}

/**
 * Walk a campaign object tree, find all AssetMarker values,
 * generate missing assets, and replace markers with resolved file paths.
 *
 * Returns a deep clone with markers replaced by strings, plus a summary
 * of what happened to each asset (cached/generated/failed).
 * Failed assets are replaced with their output path string (so flatten
 * can still run) and reported via the assets array.
 */
export async function resolveAssets<T>(
  obj: T,
  options: ResolveOptions = {},
): Promise<ResolveResult<T>> {
  // 1. Collect all markers from the tree
  const markers: { path: string[]; marker: AssetMarker }[] = []
  collectMarkers(obj, [], markers)

  if (markers.length === 0) return { resolved: obj, assets: [] }

  // skipGenerate mode: just replace markers with output paths, no I/O
  if (options.skipGenerate) {
    return { resolved: replaceMarkers(obj) as T, assets: [] }
  }

  // 2. Resolve: skip existing, generate missing (concurrently)
  const assets: AssetResolution[] = []
  const results = await Promise.allSettled(
    markers.map(async ({ marker }, i) => {
      const { output, generate } = marker
      const start = Date.now()

      if (!options.refreshAssets && existsSync(output)) {
        assets[i] = { output, status: 'cached' }
        return
      }

      // Delete existing file if refreshing
      if (options.refreshAssets && existsSync(output)) {
        unlinkSync(output)
      }

      // Ensure output directory exists
      mkdirSync(dirname(output), { recursive: true })

      // Run the pipeline
      await generate(output)

      // Post-generate validation
      if (!existsSync(output)) {
        throw new Error(`Asset output was not created: ${output}`)
      }
      const stat = statSync(output)
      if (stat.isDirectory()) {
        throw new Error(`Asset output is a directory: ${output}`)
      }
      if (stat.size === 0) {
        throw new Error(`Asset output is empty: ${output}`)
      }

      assets[i] = { output, status: 'generated', durationMs: Date.now() - start }
    }),
  )

  // 3. Record failures (don't throw — let plan/apply decide)
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const reason = (results[i] as PromiseRejectedResult).reason
      assets[i] = {
        output: markers[i].marker.output,
        status: 'failed',
        error: reason?.message ?? String(reason),
      }
    }
  }

  // 4. Replace markers with output paths in a deep clone
  return { resolved: replaceMarkers(obj) as T, assets }
}

/** Recursively collect AssetMarker values and their paths in the object tree */
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

/** Deep clone an object, replacing all AssetMarker values with their output string.
 *  Preserves Object.freeze semantics — returned objects are frozen if the originals were. */
function replaceMarkers(obj: unknown): unknown {
  if (isAssetMarker(obj)) return obj.output
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    const arr = obj.map(replaceMarkers)
    return Object.isFrozen(obj) ? Object.freeze(arr) : arr
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    result[key] = replaceMarkers((obj as any)[key])
  }
  return Object.isFrozen(obj) ? Object.freeze(result) : result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/asset.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `bun test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/core/asset.ts test/unit/asset.test.ts
git commit -m "feat(asset): add resolveAssets() tree walker with filesystem caching"
```

---

## Chunk 2: Type widening and creative helper integration

### Task 4: Widen Meta creative types to accept `AssetMarker`

**Files:**
- Modify: `src/meta/types.ts:109-165`
- Modify: `src/helpers/meta-creative.ts:83-170`

- [ ] **Step 1: Import `AssetMarker` and widen Meta creative types**

In `src/meta/types.ts`, add import and widen the asset path fields:

```ts
// At top of src/meta/types.ts, add import:
import type { AssetMarker } from '../core/asset.ts'

// Then widen these specific fields:
// ImageAd.image: string → string | AssetMarker
// VideoAd.video: string → string | AssetMarker
// VideoAd.thumbnail?: string → string | AssetMarker
// CarouselCard.image: string → string | AssetMarker
// CollectionAd.coverImage?: string → string | AssetMarker
// CollectionAd.coverVideo?: string → string | AssetMarker
```

Each type change is a single field — change `string` to `string | AssetMarker`.

- [ ] **Step 2: Update `image()` helper to accept `string | AssetMarker`**

In `src/helpers/meta-creative.ts:83`, change the signature:

```ts
import type { AssetMarker } from '../core/asset.ts'

export function image(filePath: string | AssetMarker, config?: Partial<ImageAdConfig>): ImageAd {
  // nameFromFile only works on strings — guard it:
  const name = config?.name ?? (typeof filePath === 'string' ? nameFromFile(filePath) : undefined)
  return {
    format: 'image' as const,
    image: filePath,
    name,
    // ...rest unchanged
  }
}
```

- [ ] **Step 3: Update `video()` helper similarly**

In `src/helpers/meta-creative.ts:118`:

```ts
export function video(filePath: string | AssetMarker, config?: Partial<VideoAdConfig>): VideoAd {
  const name = config?.name ?? (typeof filePath === 'string' ? nameFromFile(filePath) : undefined)
  return {
    format: 'video' as const,
    video: filePath,
    name,
    // ...rest unchanged (thumbnail already comes from config, which can hold AssetMarker via the widened VideoAdConfig type)
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass (widening `string` to `string | AssetMarker` is backwards-compatible)

- [ ] **Step 6: Commit**

```bash
git add src/meta/types.ts src/helpers/meta-creative.ts
git commit -m "feat(asset): widen Meta creative types to accept AssetMarker"
```

---

### Task 5: Export `asset` and `isAssetMarker` from package

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add exports**

After the AI exports section (~line 166), add:

```ts
// === Assets ===

export { asset, isAssetMarker } from './core/asset.ts'
export type { AssetMarker, AssetDescriptor } from './core/asset.ts'
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

### Task 6: Integrate `resolveAssets()` into `plan.ts`

**Files:**
- Modify: `cli/plan.ts`

- [ ] **Step 1: Import `resolveAssets`**

At the top of `cli/plan.ts`, add:

```ts
import { resolveAssets } from '../src/core/asset.ts'
```

- [ ] **Step 2: Add `--refresh-assets` flag parsing**

In the argument parsing section of `cli/plan.ts`, add support for `--refresh-assets`.

- [ ] **Step 3: Call `resolveAssets()` in the preprocessing flow**

In `cli/plan.ts`, after the `preprocessGoogle()` / marker resolution block (~line 361-365), add asset resolution for all providers:

```ts
// After marker resolution, before flatten:
// Resolve asset markers for all providers
const assetResults = await Promise.all(
  campaignObjects.map(c => resolveAssets(c, { refreshAssets: flags.refreshAssets }))
)
campaignObjects = assetResults.map(r => r.resolved)
const allAssets = assetResults.flatMap(r => r.assets)
```

This goes AFTER the existing `if (provider === 'google') { campaignObjects = await preprocessGoogle(...) }` block, so it runs for both Google and Meta campaigns.

- [ ] **Step 4: Add asset resolution status to plan output**

Before the changeset display, show what happened to each asset. Failed assets show as warnings — the plan still displays the full changeset but marks affected ads:

```ts
// Display asset resolution summary
if (allAssets.length > 0) {
  console.log('\nAssets:')
  for (const a of allAssets) {
    if (a.status === 'cached') console.log(`  ✓ ${a.output} — exists`)
    else if (a.status === 'generated') console.log(`  ▸ ${a.output} — generated (${a.durationMs}ms)`)
    else console.log(`  ✗ ${a.output} — failed: ${a.error}`)
  }
}

const failedAssets = allAssets.filter(a => a.status === 'failed')
if (failedAssets.length > 0) {
  console.log(`\n⚠ ${failedAssets.length} asset(s) failed — affected ads will show as unresolved`)
}
```

- [ ] **Step 5: Run typecheck and existing tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all tests pass

- [ ] **Step 6: Commit**

```bash
git add cli/plan.ts
git commit -m "feat(asset): integrate resolveAssets() into plan command"
```

---

### Task 7: Integrate `resolveAssets()` into `apply.ts`

**Files:**
- Modify: `cli/apply.ts`

- [ ] **Step 1: Import `resolveAssets`**

```ts
import { resolveAssets } from '../src/core/asset.ts'
```

- [ ] **Step 2: Add `--refresh-assets` flag parsing**

Add `--refresh-assets` to the argument parsing in `apply.ts`.

- [ ] **Step 3: Add `resolveAssets()` call before flatten**

In `cli/apply.ts`, before the `provider.flatten()` call (~line 257), add asset resolution:

```ts
// Resolve asset markers before flatten
const assetResults = await Promise.all(
  sortedCampaigns.map(c => resolveAssets(c.campaign, { refreshAssets: flags.refreshAssets }))
)
const resolvedCampaigns = assetResults.map(r => r.resolved)
const allAssets = assetResults.flatMap(r => r.assets)

// Check for failed assets — fatal for apply (affected ads cannot be uploaded)
const failedAssets = allAssets.filter(a => a.status === 'failed')
if (failedAssets.length > 0) {
  for (const a of failedAssets) {
    console.error(`✗ Asset failed: ${a.output} — ${a.error}`)
  }
  console.error(`\n${failedAssets.length} asset(s) failed. Proceeding without affected ads.`)
}

// Flatten resolved campaigns instead of raw ones:
const desired = provider.flatten(resolvedCampaigns)
```

**Note:** `apply.ts` currently skips ALL preprocessing (no AI marker resolution either). This task adds asset resolution only. AI marker resolution in apply is a pre-existing gap outside this feature's scope — extracting a shared `preprocessCampaigns()` for both plan and apply is a follow-up.

- [ ] **Step 4: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add cli/apply.ts
git commit -m "feat(asset): integrate resolveAssets() into apply command"
```

---

### Task 8: Integrate into `validate.ts` and `pull.ts`

**Files:**
- Modify: `cli/validate.ts`
- Modify: `cli/pull.ts`

- [ ] **Step 1: Add asset marker validation to `validate.ts`**

Import `isAssetMarker` and add a check that scans campaign objects for asset markers. Validate that each marker has a non-empty `output` path. Do NOT run pipelines.

```ts
import { isAssetMarker } from '../src/core/asset.ts'

// In the validation flow, add a check:
// Walk campaign tree, find markers, report them as info (not errors)
// Only error if output is empty/invalid (caught at marker creation, but double-check)
```

- [ ] **Step 2: Add path substitution to `pull.ts`**

In `cli/pull.ts`, before the flatten call (~line 82), substitute asset markers with their output paths WITHOUT running pipelines. This allows drift detection to work even without generated files:

```ts
import { resolveAssets } from '../src/core/asset.ts'

// For pull, we only substitute paths — we don't generate
// Use a lightweight substituteAssetPaths() or resolveAssets with a skipGenerate option
```

Add a `skipGenerate` option to `resolveAssets()` in `src/core/asset.ts` that replaces markers with their `output` string without checking file existence or running `generate`:

```ts
type ResolveOptions = {
  refreshAssets?: boolean
  skipGenerate?: boolean  // Just replace markers with output paths, don't run pipelines
}
```

When `skipGenerate` is true, the function just does the `replaceMarkers()` deep clone without any file checks or pipeline execution.

- [ ] **Step 3: Run typecheck and tests**

Run: `bunx tsc --noEmit && bun test`
Expected: No errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add cli/validate.ts cli/pull.ts src/core/asset.ts
git commit -m "feat(asset): add asset validation and path substitution for pull"
```

---

## Chunk 4: End-to-end test and docs

### Task 9: End-to-end integration test

**Files:**
- Create: `test/unit/asset-integration.test.ts`

- [ ] **Step 1: Write an integration test with a full Meta campaign using asset markers**

```ts
// test/unit/asset-integration.test.ts
import { describe, expect, test } from 'bun:test'
import { asset, resolveAssets, isAssetMarker } from '../../src/core/asset.ts'
import { image, video } from '../../src/helpers/meta-creative.ts'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

describe('asset pipeline integration', () => {
  const tmpDir = join(import.meta.dir, '../.tmp-asset-integration')

  function cleanup() {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }

  test('full campaign with image and video asset markers resolves correctly', async () => {
    cleanup()
    mkdirSync(tmpDir, { recursive: true })

    const productCard = asset((p: { product: string; size: number }) => ({
      output: join(tmpDir, `${p.product}-${p.size}.png`),
      generate: async (out) => {
        writeFileSync(out, `fake-image-${p.product}-${p.size}`)
      },
    }))

    const promoVideo = asset((p: { name: string }) => ({
      output: join(tmpDir, `${p.name}.mp4`),
      generate: async (out) => {
        writeFileSync(out, `fake-video-${p.name}`)
      },
    }))

    // Build a campaign-like structure using the real helpers
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

    // Verify markers are present before resolution
    expect(isAssetMarker(campaign.adSets[0].ads[0].image)).toBe(true)
    expect(isAssetMarker(campaign.adSets[1].ads[0].video)).toBe(true)

    // Resolve
    const { resolved, assets } = await resolveAssets(campaign)

    // Verify markers are replaced with file paths
    expect(resolved.adSets[0].ads[0].image).toBe(join(tmpDir, 'runner-1080.png'))
    expect(typeof resolved.adSets[0].ads[0].image).toBe('string')
    expect(resolved.adSets[1].ads[0].video).toBe(join(tmpDir, 'summer-promo.mp4'))

    // Verify files were created
    expect(existsSync(join(tmpDir, 'runner-1080.png'))).toBe(true)
    expect(existsSync(join(tmpDir, 'summer-promo.mp4'))).toBe(true)

    // Verify non-marker fields are untouched
    expect(resolved.adSets[0].ads[0].headline).toBe('Trail Runner')
    expect(resolved.name).toBe('summer-shoes')

    // Verify asset summary
    expect(assets).toHaveLength(2)
    expect(assets.every(a => a.status === 'generated')).toBe(true)

    cleanup()
  })
})
```

- [ ] **Step 2: Run the integration test**

Run: `bun test test/unit/asset-integration.test.ts`
Expected: All PASS

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass (1127+ existing + new asset tests)

- [ ] **Step 4: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add test/unit/asset-integration.test.ts
git commit -m "test(asset): add end-to-end integration test for asset pipelines"
```

---

### Task 10: Final review and cleanup

- [ ] **Step 1: Run the full test suite one final time**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify exports work**

```bash
bun -e "const { asset, isAssetMarker } = require('./src/index.ts'); console.log(typeof asset, typeof isAssetMarker)"
```
Expected: `function function`

- [ ] **Step 4: Final commit with any remaining cleanup**

```bash
git add -A
git commit -m "feat(asset): asset pipelines — pluggable creative generation and composition"
```
