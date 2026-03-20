import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Resource } from '../../src/core/types'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), 'reddit-download-test-' + Date.now())

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true })
  }
})

function makeResource(
  kind: Resource['kind'],
  path: string,
  properties: Record<string, unknown>,
  meta?: Record<string, unknown>,
): Resource {
  return { kind, path, properties, meta }
}

describe('downloadRedditAssets', () => {
  test('downloads image from remote URL to local assets dir', async () => {
    const { downloadRedditAssets } = await import('../../src/reddit/download')

    // Mock global fetch
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
      { status: 200, headers: { 'Content-Type': 'image/png' } },
    )) as unknown as typeof fetch

    try {
      const resources: Resource[] = [
        makeResource('ad', 'camp/group/hero', {
          name: 'Hero Ad',
          format: 'image',
        }, {
          mediaUrl: 'https://reddit-cdn.com/images/abc123.png',
        }),
        // Non-ad resource should be skipped
        makeResource('campaign', 'camp', { name: 'Campaign' }),
      ]

      const result = await downloadRedditAssets(resources, TEST_DIR)

      expect(result.summary?.downloaded).toBe(1)
      expect(result.summary?.failed).toBe(0)

      // The ad resource should have its mediaUrl updated to a local path
      const updatedAd = result.resources.find(r => r.path === 'camp/group/hero')!
      expect(updatedAd.meta?.mediaUrl).toContain('./assets/imported/')
      expect(updatedAd.meta?.mediaUrl).toContain('.png')

      // File should exist on disk
      const localPath = join(TEST_DIR, (updatedAd.meta!.mediaUrl as string).replace('./', ''))
      expect(existsSync(localPath)).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('skips already-downloaded files', async () => {
    const { downloadRedditAssets } = await import('../../src/reddit/download')

    // Pre-create the assets dir with a file
    const assetsDir = join(TEST_DIR, 'assets', 'imported')
    mkdirSync(assetsDir, { recursive: true })

    const originalFetch = globalThis.fetch
    let fetchCalled = false
    globalThis.fetch = mock(async () => {
      fetchCalled = true
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }) as unknown as typeof fetch

    try {
      const resources: Resource[] = [
        makeResource('ad', 'camp/group/hero', {
          name: 'Hero Ad',
          format: 'image',
        }, {
          mediaUrl: 'https://reddit-cdn.com/images/abc123.png',
        }),
      ]

      // First download
      const result1 = await downloadRedditAssets(resources, TEST_DIR)
      expect(result1.summary?.downloaded).toBe(1)

      // Reset fetch tracking
      fetchCalled = false

      // Second download should be cached
      const result2 = await downloadRedditAssets(result1.resources, TEST_DIR)
      // The file now has a local path, so no fetch should happen
      expect(result2.summary?.downloaded).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('handles fetch failures gracefully', async () => {
    const { downloadRedditAssets } = await import('../../src/reddit/download')

    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => new Response(null, { status: 404 })) as unknown as typeof fetch

    try {
      const resources: Resource[] = [
        makeResource('ad', 'camp/group/hero', {
          name: 'Hero Ad',
          format: 'image',
        }, {
          mediaUrl: 'https://reddit-cdn.com/images/missing.png',
        }),
      ]

      const result = await downloadRedditAssets(resources, TEST_DIR)

      expect(result.summary?.failed).toBe(1)
      expect(result.summary?.errors?.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns resources unchanged when no media to download', async () => {
    const { downloadRedditAssets } = await import('../../src/reddit/download')

    const resources: Resource[] = [
      makeResource('campaign', 'camp', { name: 'Campaign' }),
      makeResource('adGroup', 'camp/group', { name: 'Group' }),
    ]

    const result = await downloadRedditAssets(resources, TEST_DIR)

    expect(result.resources).toEqual(resources)
    expect(result.summary?.downloaded).toBe(0)
  })
})
