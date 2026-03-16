import { describe, expect, test } from 'bun:test'
import { asset, resolveAssets, isAssetMarker, countAssetMarkers } from '../../src/core/asset.ts'
import { image, video } from '../../src/helpers/meta-creative.ts'
import type { ImageAd, VideoAd } from '../../src/meta/types.ts'
import { existsSync, rmSync, writeFileSync } from 'fs'
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
    const imgAd = campaign.adSets[0]!.ads[0]! as ImageAd
    const vidAd = campaign.adSets[1]!.ads[0]! as VideoAd
    expect(isAssetMarker(imgAd.image)).toBe(true)
    expect(isAssetMarker(vidAd.video)).toBe(true)

    // Resolve
    const { resolved, assets } = await resolveAssets(campaign, { assetsDir })

    // Markers replaced with managed paths
    const resolvedImgAd = resolved.adSets[0]!.ads[0]! as ImageAd
    const resolvedVidAd = resolved.adSets[1]!.ads[0]! as VideoAd
    const imgPath = resolvedImgAd.image as string
    const vidPath = resolvedVidAd.video as string

    expect(typeof imgPath).toBe('string')
    expect(imgPath).toMatch(/\.tmp-asset-integration\/product-card\//)
    expect(imgPath).toMatch(/\.png$/)

    expect(typeof vidPath).toBe('string')
    expect(vidPath).toMatch(/\.mp4$/)

    // Files exist at managed paths
    expect(existsSync(imgPath)).toBe(true)
    expect(existsSync(vidPath)).toBe(true)

    // Non-marker fields untouched
    expect(resolvedImgAd.headline).toBe('Trail Runner')
    expect(resolved.name).toBe('summer-shoes')

    // Asset summary
    expect(assets).toHaveLength(2)
    expect(assets.every(a => a.status === 'generated')).toBe(true)

    cleanup()
  })

  test('static assets still work alongside pipeline assets', async () => {
    cleanup()

    const pipeline = asset('card', async (p: { id: string }) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `img-${p.id}`)
      return tmp
    })

    const campaign = {
      ads: [
        image('./assets/static-hero.png', { headline: 'Static', primaryText: 'Static text' }),
        image(pipeline({ id: 'dynamic' }), { headline: 'Dynamic', primaryText: 'Dynamic text' }),
      ],
    }

    const { resolved } = await resolveAssets(campaign, { assetsDir })

    // Static path untouched
    expect(resolved.ads[0]!.image).toBe('./assets/static-hero.png')
    // Dynamic path resolved
    expect(typeof resolved.ads[1]!.image).toBe('string')
    expect(isAssetMarker(resolved.ads[1]!.image)).toBe(false)
    expect((resolved.ads[1]!.image as string)).toMatch(/\.tmp-asset-integration\/card\//)

    cleanup()
  })

  test('content hash changes on regeneration produce different paths', async () => {
    cleanup()
    let version = 1

    const pipeline = asset('card', async (_p: Record<string, never>) => {
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `content-v${version}`)
      return tmp
    })

    // Generate v1
    const { resolved: r1 } = await resolveAssets(
      { image: pipeline({} as Record<string, never>) },
      { assetsDir },
    )

    // Regenerate with different content
    version = 2
    const { resolved: r2 } = await resolveAssets(
      { image: pipeline({} as Record<string, never>) },
      { assetsDir, refreshAssets: true },
    )

    // Different paths (content hash changed)
    expect(r1.image).not.toBe(r2.image)

    cleanup()
  })

  test('countAssetMarkers counts markers in nested structures', () => {
    const pipeline = asset('test', async () => '/tmp/test.png')

    expect(countAssetMarkers({})).toBe(0)
    expect(countAssetMarkers('plain string')).toBe(0)
    expect(countAssetMarkers(pipeline({}))).toBe(1)
    expect(countAssetMarkers({
      a: pipeline({}),
      b: { nested: pipeline({}) },
      c: [pipeline({}), 'static'],
    })).toBe(3)
  })

  test('cached assets skip regeneration', async () => {
    cleanup()
    let callCount = 0

    const pipeline = asset('cached-test', async (p: { id: string }) => {
      callCount++
      const tmp = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(tmp, `cached-${p.id}`)
      return tmp
    })

    // First call: generates
    const { resolved: r1, assets: a1 } = await resolveAssets(
      { img: pipeline({ id: 'x' }) },
      { assetsDir },
    )
    expect(callCount).toBe(1)
    expect(a1[0]!.status).toBe('generated')

    // Second call with same params: uses cache
    const { resolved: r2, assets: a2 } = await resolveAssets(
      { img: pipeline({ id: 'x' }) },
      { assetsDir },
    )
    expect(callCount).toBe(1) // generate not called again
    expect(a2[0]!.status).toBe('cached')
    expect(r1.img).toBe(r2.img) // same managed path

    cleanup()
  })

  test('move option deletes source file after copy', async () => {
    cleanup()

    let sourcePath = ''
    const pipeline = asset('move-test', async () => {
      sourcePath = `/tmp/test-${crypto.randomUUID()}.png`
      writeFileSync(sourcePath, 'move-me')
      return sourcePath
    }, { move: true })

    await resolveAssets({ img: pipeline({}) }, { assetsDir })

    // Source file should be deleted (moved)
    expect(existsSync(sourcePath)).toBe(false)

    cleanup()
  })

  test('pipeline failure produces failed status without crashing', async () => {
    cleanup()

    const failing = asset('broken', async () => {
      throw new Error('generation failed')
    })

    const { assets } = await resolveAssets({ img: failing({}) }, { assetsDir })

    expect(assets).toHaveLength(1)
    expect(assets[0]!.status).toBe('failed')
    expect(assets[0]!.error).toMatch(/generation failed/)

    cleanup()
  })
})
