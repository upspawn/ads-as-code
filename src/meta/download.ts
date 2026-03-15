import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { slugify } from '../core/flatten.ts'
import type { Resource } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'

// ─── Types ──────────────────────────────────────────────────

export type DownloadResult = {
  readonly downloaded: number
  readonly cached: number
  readonly failed: number
  readonly errors: string[]
}

// Cache namespace for import-time image downloads (separate from upload cache)
const CACHE_PROJECT = 'meta:downloads'

// ─── Helpers ────────────────────────────────────────────────

/** Generate a short hash suffix from a URL for collision avoidance. */
function hashSuffix(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 8)
}

/** Derive a clean filename from a creative name or URL. */
function deriveFilename(name: string | undefined, url: string): string {
  const base = name ? slugify(name) : 'image'
  const suffix = hashSuffix(url)
  const ext = guessExtension(url)
  return `${base}-${suffix}${ext}`
}

/** Guess file extension from URL, defaulting to .png. */
function guessExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return ext
  } catch {
    // Invalid URL — fall back
  }
  return '.png'
}

/** Compute SHA-256 hex digest of binary data. */
function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

// ─── Download Logic ─────────────────────────────────────────

/**
 * Extract all image/video URLs from Meta creative resources.
 * Returns a list of { url, name, resourcePath } for download.
 */
function extractMediaUrls(resources: Resource[]): Array<{
  url: string
  name: string | undefined
  resourcePath: string
  field: 'image' | 'video' | 'thumbnail'
}> {
  const media: Array<{
    url: string
    name: string | undefined
    resourcePath: string
    field: 'image' | 'video' | 'thumbnail'
  }> = []

  for (const r of resources) {
    if (r.kind !== 'creative') continue
    const props = r.properties
    const name = props.name as string | undefined

    // Image creatives
    const imageUrl = props.image as string | undefined
    if (imageUrl && isRemoteUrl(imageUrl)) {
      media.push({ url: imageUrl, name, resourcePath: r.path, field: 'image' })
    }

    // Video creatives (thumbnail only — videos are too large to auto-download)
    const thumbnailUrl = props.thumbnail as string | undefined
    if (thumbnailUrl && isRemoteUrl(thumbnailUrl)) {
      media.push({ url: thumbnailUrl, name: name ? `${name}-thumb` : 'thumb', resourcePath: r.path, field: 'thumbnail' })
    }
  }

  return media
}

function isRemoteUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

/**
 * Download creative images from Meta CDN to local assets directory.
 *
 * For each creative resource with a remote image URL:
 * 1. Downloads the image to `<rootDir>/assets/imported/<name>-<hash>.ext`
 * 2. Updates the resource's image property to the local relative path
 * 3. Seeds the cache with file SHA -> Meta image hash mapping (for upload dedup)
 *
 * Returns a new Resource[] with local paths substituted for remote URLs.
 */
export async function downloadMetaImages(
  resources: Resource[],
  rootDir: string,
  cache: Cache | null,
): Promise<{ resources: Resource[]; result: DownloadResult }> {
  const assetsDir = join(rootDir, 'assets', 'imported')
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true })
  }

  const mediaItems = extractMediaUrls(resources)

  if (mediaItems.length === 0) {
    return {
      resources,
      result: { downloaded: 0, cached: 0, failed: 0, errors: [] },
    }
  }

  let downloaded = 0
  let cached = 0
  let failed = 0
  const errors: string[] = []

  // Map from resource path + field -> local file path
  const localPaths = new Map<string, string>()

  for (const item of mediaItems) {
    const filename = deriveFilename(item.name, item.url)
    const localPath = join(assetsDir, filename)
    const relativePath = `./assets/imported/${filename}`
    const cacheKey = `${item.resourcePath}:${item.field}`

    // Check if file already exists locally (from a previous import)
    if (existsSync(localPath)) {
      cached++
      localPaths.set(cacheKey, relativePath)
      continue
    }

    try {
      const response = await fetch(item.url)
      if (!response.ok) {
        errors.push(`${item.url}: HTTP ${response.status}`)
        failed++
        continue
      }

      const data = new Uint8Array(await response.arrayBuffer())
      writeFileSync(localPath, data)

      // Seed cache with file SHA -> remote URL hash
      // This allows the upload module to skip re-uploading files that were just downloaded
      if (cache) {
        const fileSha = sha256(data)
        cache.setResource({
          project: CACHE_PROJECT,
          path: `image:${fileSha}`,
          // Use the URL hash as platformId — the actual Meta image hash will be set on first upload
          platformId: hashSuffix(item.url),
          kind: 'image',
          managedBy: 'imported',
        })
      }

      downloaded++
      localPaths.set(cacheKey, relativePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${item.url}: ${msg}`)
      failed++
    }
  }

  // Replace remote URLs with local paths in resource properties
  const updatedResources = resources.map((r) => {
    if (r.kind !== 'creative') return r

    const props = { ...r.properties }
    const imagePath = localPaths.get(`${r.path}:image`)
    const thumbPath = localPaths.get(`${r.path}:thumbnail`)

    if (imagePath) props.image = imagePath
    if (thumbPath) props.thumbnail = thumbPath

    return { ...r, properties: props }
  })

  return {
    resources: updatedResources,
    result: { downloaded, cached, failed, errors },
  }
}
