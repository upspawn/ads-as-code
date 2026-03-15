import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { downloadMetaImages } from '../../src/meta/download.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Test Helpers ───────────────────────────────────────────

const TEST_ROOT = join(import.meta.dir, '../fixtures/download-test')
const ASSETS_DIR = join(TEST_ROOT, 'assets', 'imported')

function makeCreative(
  path: string,
  overrides: Partial<Resource['properties']> = {},
): Resource {
  return {
    kind: 'creative',
    path,
    properties: {
      name: 'hero',
      format: 'image',
      image: 'https://example.com/images/hero.png',
      headline: 'Test',
      primaryText: 'Test ad',
      cta: 'SIGN_UP',
      url: 'https://example.com',
      ...overrides,
    },
  }
}

function makeCampaign(path: string): Resource {
  return {
    kind: 'campaign',
    path,
    properties: {
      name: 'Test Campaign',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
    },
  }
}

// ─── Setup / Teardown ───────────────────────────────────────

beforeEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true })
  }
  mkdirSync(TEST_ROOT, { recursive: true })
})

afterEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true })
  }
  mock.restore()
})

// ─── Tests ──────────────────────────────────────────────────

describe('downloadMetaImages', () => {
  test('returns resources unchanged when no creatives have remote URLs', async () => {
    const resources: Resource[] = [
      makeCampaign('test-campaign'),
      makeCreative('test-campaign/set1/hero/cr', {
        image: './assets/local/hero.png',
      }),
    ]

    const { resources: result, result: stats } = await downloadMetaImages(
      resources,
      TEST_ROOT,
      null,
    )

    expect(stats.downloaded).toBe(0)
    expect(stats.cached).toBe(0)
    expect(stats.failed).toBe(0)
    expect(result).toEqual(resources)
  })

  test('non-creative resources are passed through unchanged', async () => {
    const campaign = makeCampaign('test-campaign')
    const resources: Resource[] = [campaign]

    const { resources: result } = await downloadMetaImages(resources, TEST_ROOT, null)

    expect(result).toEqual([campaign])
  })

  test('creates assets/imported directory if it does not exist', async () => {
    const resources: Resource[] = [
      makeCreative('test-campaign/set1/hero/cr', {
        image: 'https://example.com/images/hero.png',
      }),
    ]

    // Mock fetch to return a small PNG
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })
    }) as typeof fetch

    try {
      await downloadMetaImages(resources, TEST_ROOT, null)
      expect(existsSync(ASSETS_DIR)).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('downloads image and replaces URL with local path', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response(pngBytes, { status: 200 })
    }) as typeof fetch

    const resources: Resource[] = [
      makeCampaign('test-campaign'),
      makeCreative('test-campaign/set1/hero/cr', {
        image: 'https://cdn.example.com/ads/hero-image.png',
      }),
    ]

    try {
      const { resources: result, result: stats } = await downloadMetaImages(
        resources,
        TEST_ROOT,
        null,
      )

      expect(stats.downloaded).toBe(1)
      expect(stats.failed).toBe(0)

      // Campaign resource should be unchanged
      expect(result[0]).toEqual(resources[0])

      // Creative should have local path
      const creative = result[1]!
      const imagePath = creative.properties.image as string
      expect(imagePath).toStartWith('./assets/imported/')
      expect(imagePath).toEndWith('.png')
      expect(imagePath).toContain('hero-')

      // File should exist on disk
      const fullPath = join(TEST_ROOT, imagePath.replace('./', ''))
      expect(existsSync(fullPath)).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('skips download when file already exists locally', async () => {
    // Pre-create the assets directory with a file
    mkdirSync(ASSETS_DIR, { recursive: true })

    const fetchMock = mock(async () => {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    const resources: Resource[] = [
      makeCreative('test-campaign/set1/hero/cr', {
        image: 'https://cdn.example.com/ads/hero-image.png',
      }),
    ]

    try {
      // First download
      await downloadMetaImages(resources, TEST_ROOT, null)

      // Second download should skip (file exists)
      const { result: stats } = await downloadMetaImages(resources, TEST_ROOT, null)

      expect(stats.cached).toBe(1)
      expect(stats.downloaded).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles HTTP errors gracefully', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response('Not Found', { status: 404 })
    }) as typeof fetch

    const resources: Resource[] = [
      makeCreative('test-campaign/set1/hero/cr', {
        image: 'https://cdn.example.com/ads/missing.png',
      }),
    ]

    try {
      const { resources: result, result: stats } = await downloadMetaImages(
        resources,
        TEST_ROOT,
        null,
      )

      expect(stats.failed).toBe(1)
      expect(stats.errors).toHaveLength(1)
      expect(stats.errors[0]).toContain('HTTP 404')

      // Creative should keep original URL since download failed
      const creative = result[0]!
      expect(creative.properties.image).toBe('https://cdn.example.com/ads/missing.png')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles network errors gracefully', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED')
    }) as typeof fetch

    const resources: Resource[] = [
      makeCreative('test-campaign/set1/hero/cr', {
        image: 'https://cdn.example.com/ads/hero.png',
      }),
    ]

    try {
      const { result: stats } = await downloadMetaImages(resources, TEST_ROOT, null)

      expect(stats.failed).toBe(1)
      expect(stats.errors[0]).toContain('ECONNREFUSED')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('generates collision-resistant filenames from URL hash', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })
    }) as typeof fetch

    const resources: Resource[] = [
      makeCreative('campaign/set1/hero/cr', {
        name: 'hero',
        image: 'https://cdn1.example.com/hero.png',
      }),
      makeCreative('campaign/set2/hero/cr', {
        name: 'hero',
        image: 'https://cdn2.example.com/hero.png', // Same name, different URL
      }),
    ]

    try {
      const { resources: result, result: stats } = await downloadMetaImages(
        resources,
        TEST_ROOT,
        null,
      )

      expect(stats.downloaded).toBe(2)

      const path1 = result[0]!.properties.image as string
      const path2 = result[1]!.properties.image as string

      // Same base name but different hash suffixes
      expect(path1).not.toBe(path2)
      expect(path1).toContain('hero-')
      expect(path2).toContain('hero-')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles thumbnails for video creatives', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      return new Response(new Uint8Array([255, 216, 255, 224]), { status: 200 })
    }) as typeof fetch

    const resources: Resource[] = [
      {
        kind: 'creative',
        path: 'campaign/set1/demo/cr',
        properties: {
          name: 'demo',
          format: 'video',
          video: './assets/demo.mp4', // local — not downloaded
          thumbnail: 'https://cdn.example.com/thumb.jpg',
          headline: 'Demo',
          primaryText: 'Watch',
          cta: 'WATCH_MORE',
          url: 'https://example.com',
        },
      },
    ]

    try {
      const { resources: result, result: stats } = await downloadMetaImages(
        resources,
        TEST_ROOT,
        null,
      )

      // Should download thumbnail but not video
      expect(stats.downloaded).toBe(1)

      const creative = result[0]!
      expect(creative.properties.video).toBe('./assets/demo.mp4') // unchanged
      expect(creative.properties.thumbnail as string).toStartWith('./assets/imported/')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
