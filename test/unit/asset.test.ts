import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

// ─── Task 1: asset(), isAssetMarker() ──────────────────────────────────

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

// ─── Task 2: resolveAssets() ───────────────────────────────────────────

import { resolveAssets } from '../../src/core/asset.ts'
import type { AssetResolution, ResolveResult } from '../../src/core/asset.ts'

const TMP_ASSETS = join(import.meta.dir, '../.tmp-assets')

/** Create a temp file that the generate fn can "produce". */
function writeTmpSource(name: string, content = 'fake-image-data'): string {
  const dir = join(TMP_ASSETS, '_sources')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

describe('resolveAssets()', () => {
  beforeEach(() => {
    rmSync(TMP_ASSETS, { recursive: true, force: true })
    mkdirSync(TMP_ASSETS, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_ASSETS, { recursive: true, force: true })
  })

  test('replaces marker with managed path in .assets/<name>/', async () => {
    const src = writeTmpSource('shoe.png', 'shoe-image-bytes')
    const pipeline = asset('product-card', async () => src)
    const campaign = { creative: { image: pipeline({ id: 'shoe' }) } }

    const result = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })

    expect(typeof result.resolved.creative.image).toBe('string')
    const managedPath = result.resolved.creative.image as unknown as string
    expect(managedPath).toContain('.tmp-assets/product-card/')
    expect(existsSync(managedPath)).toBe(true)
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]!.status).toBe('generated')
    expect(result.assets[0]!.name).toBe('product-card')
  })

  test('caches by params hash — skips generation on second call', async () => {
    let callCount = 0
    const src = writeTmpSource('shoe.png', 'shoe-image-bytes')
    const pipeline = asset('card', async () => {
      callCount++
      return src
    })
    const campaign = { image: pipeline({ id: 'shoe' }) }

    const first = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    expect(first.assets[0]!.status).toBe('generated')
    expect(callCount).toBe(1)

    // Second call with same params — should use cache
    const campaign2 = { image: pipeline({ id: 'shoe' }) }
    const second = await resolveAssets(campaign2, { assetsDir: TMP_ASSETS })
    expect(second.assets[0]!.status).toBe('cached')
    expect(callCount).toBe(1) // generate was NOT called again
    expect(second.resolved.image).toBe(first.resolved.image) // same managed path
  })

  test('content hash changes produce different managed path', async () => {
    const srcA = writeTmpSource('a.png', 'content-version-A')
    const srcB = writeTmpSource('b.png', 'content-version-B')

    const pipelineA = asset('card', async () => srcA)
    const pipelineB = asset('card', async () => srcB)

    // Same name, same params, but different generate output content
    const resultA = await resolveAssets(
      { image: pipelineA({ id: 'x' }) },
      { assetsDir: TMP_ASSETS },
    )
    // Clean the cached file so next resolve must re-generate
    rmSync(join(TMP_ASSETS, 'card'), { recursive: true, force: true })
    const resultB = await resolveAssets(
      { image: pipelineB({ id: 'x' }) },
      { assetsDir: TMP_ASSETS, refreshAssets: true },
    )

    expect(resultA.resolved.image).not.toBe(resultB.resolved.image)
  })

  test('handles deeply nested markers (carousel cards)', async () => {
    const src = writeTmpSource('deep.png', 'nested-data')
    const pipeline = asset('card', async () => src)

    const campaign = {
      adSet: {
        ads: [
          {
            creative: {
              carousel: {
                cards: [
                  { image: pipeline({ idx: 0 }) },
                  { image: pipeline({ idx: 1 }) },
                ],
              },
            },
          },
        ],
      },
    }

    const result = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    const cards = result.resolved.adSet.ads[0]!.creative.carousel.cards
    expect(typeof cards[0]!.image).toBe('string')
    expect(typeof cards[1]!.image).toBe('string')
    expect(result.assets).toHaveLength(2)
  })

  test('partial failure: successful assets resolve, failed ones marked with error', async () => {
    const src = writeTmpSource('ok.png', 'ok-data')
    const goodPipeline = asset('good', async () => src)
    const badPipeline = asset('bad', async () => {
      throw new Error('generation exploded')
    })

    const campaign = {
      image1: goodPipeline({}),
      image2: badPipeline({}),
    }

    const result = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    const good = result.assets.find((a) => a.name === 'good')!
    const bad = result.assets.find((a) => a.name === 'bad')!

    expect(good.status).toBe('generated')
    expect(typeof result.resolved.image1).toBe('string')

    expect(bad.status).toBe('failed')
    expect(bad.error).toContain('generation exploded')
    // Failed markers are left as-is (not replaced)
    expect(isAssetMarker(result.resolved.image2)).toBe(true)
  })

  test('move: true deletes source file after copy', async () => {
    const src = writeTmpSource('move-me.png', 'move-data')
    const pipeline = asset('mover', async () => src, { move: true })
    const campaign = { image: pipeline({}) }

    expect(existsSync(src)).toBe(true)
    await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    expect(existsSync(src)).toBe(false)
  })

  test('skipGenerate returns cached paths without calling generate', async () => {
    // First, generate to populate cache
    const src = writeTmpSource('skip.png', 'skip-data')
    let callCount = 0
    const pipeline = asset('skipper', async () => {
      callCount++
      return src
    })
    const campaign = { image: pipeline({ id: 'a' }) }
    const first = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    expect(callCount).toBe(1)

    // Now resolve with skipGenerate — should not call generate
    const campaign2 = { image: pipeline({ id: 'a' }) }
    const second = await resolveAssets(campaign2, { assetsDir: TMP_ASSETS, skipGenerate: true })
    expect(callCount).toBe(1)
    expect(second.assets[0]!.status).toBe('cached')
    expect(second.resolved.image).toBe(first.resolved.image)
  })

  test('refreshAssets cleans old files for same params hash', async () => {
    const src = writeTmpSource('refresh.png', 'v1-data')
    const pipeline = asset('refresher', async () => src)
    const campaign = { image: pipeline({ id: 'r' }) }

    const first = await resolveAssets(campaign, { assetsDir: TMP_ASSETS })
    const oldPath = first.resolved.image as unknown as string
    expect(existsSync(oldPath)).toBe(true)

    // Change source content to get a different content hash
    writeFileSync(src, 'v2-data-different')
    const campaign2 = { image: pipeline({ id: 'r' }) }
    const second = await resolveAssets(campaign2, { assetsDir: TMP_ASSETS, refreshAssets: true })

    const newPath = second.resolved.image as unknown as string
    expect(newPath).not.toBe(oldPath)
    expect(existsSync(newPath)).toBe(true)
    // Old file should be cleaned up
    expect(existsSync(oldPath)).toBe(false)
    expect(second.assets[0]!.status).toBe('generated')
  })
})
