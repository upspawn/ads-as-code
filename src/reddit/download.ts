import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { slugify } from '../core/flatten.ts'
import type { Resource } from '../core/types.ts'

// ─── Types ──────────────────────────────────────────────────

export type DownloadSummary = {
  readonly downloaded: number
  readonly cached: number
  readonly failed: number
  readonly errors: string[]
}

export type DownloadResult = {
  readonly resources: Resource[]
  readonly summary: DownloadSummary
}

// ─── Helpers ────────────────────────────────────────────────

/** Generate a short hash suffix from a URL for collision avoidance. */
function hashSuffix(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 8)
}

/** Derive a clean filename from a name and URL. */
function deriveFilename(name: string | undefined, url: string): string {
  const base = name ? slugify(name) : 'media'
  const suffix = hashSuffix(url)
  const ext = guessExtension(url)
  return `${base}-${suffix}${ext}`
}

/** Guess file extension from URL, defaulting to .png. */
function guessExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov'].includes(ext)) return ext
  } catch {
    // Invalid URL
  }
  return '.png'
}

function isRemoteUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

// ─── Media Extraction ───────────────────────────────────────

/**
 * Extract all media URLs from Reddit ad resources.
 * Looks in meta.imageUrl, meta.videoUrl, meta.thumbnailUrl for remote URLs.
 */
function extractMediaUrls(resources: Resource[]): Array<{
  url: string
  name: string | undefined
  resourcePath: string
  field: string
}> {
  const media: Array<{
    url: string
    name: string | undefined
    resourcePath: string
    field: string
  }> = []

  for (const r of resources) {
    if (r.kind !== 'ad') continue
    const props = r.properties
    const meta = r.meta ?? {}
    const name = props.name as string | undefined

    // Image URL
    const imageUrl = meta.imageUrl as string | undefined
    if (imageUrl && isRemoteUrl(imageUrl)) {
      media.push({ url: imageUrl, name, resourcePath: r.path, field: 'imageUrl' })
    }

    // Video URL
    const videoUrl = meta.videoUrl as string | undefined
    if (videoUrl && isRemoteUrl(videoUrl)) {
      media.push({ url: videoUrl, name: name ? `${name}-video` : 'video', resourcePath: r.path, field: 'videoUrl' })
    }

    // Thumbnail URL
    const thumbnailUrl = meta.thumbnailUrl as string | undefined
    if (thumbnailUrl && isRemoteUrl(thumbnailUrl)) {
      media.push({ url: thumbnailUrl, name: name ? `${name}-thumb` : 'thumb', resourcePath: r.path, field: 'thumbnailUrl' })
    }
  }

  return media
}

// ─── Download ───────────────────────────────────────────────

/**
 * Download creative assets from Reddit CDN to local assets directory.
 *
 * For each ad resource with a remote media URL:
 * 1. Downloads to `<rootDir>/assets/imported/<name>-<hash>.ext`
 * 2. Updates the resource's meta to point to the local path
 *
 * Returns new Resource[] with local paths substituted for remote URLs.
 */
export async function downloadRedditAssets(
  resources: Resource[],
  rootDir: string,
): Promise<DownloadResult> {
  const assetsDir = join(rootDir, 'assets', 'imported')
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true })
  }

  const mediaItems = extractMediaUrls(resources)

  if (mediaItems.length === 0) {
    return {
      resources,
      summary: { downloaded: 0, cached: 0, failed: 0, errors: [] },
    }
  }

  let downloaded = 0
  let cached = 0
  let failed = 0
  const errors: string[] = []

  // Map from "resourcePath:field" -> local relative path
  const localPaths = new Map<string, string>()

  for (const item of mediaItems) {
    const filename = deriveFilename(item.name, item.url)
    const localPath = join(assetsDir, filename)
    const relativePath = `./assets/imported/${filename}`
    const cacheKey = `${item.resourcePath}:${item.field}`

    // Skip if already downloaded from a previous import
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

      downloaded++
      localPaths.set(cacheKey, relativePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${item.url}: ${msg}`)
      failed++
    }
  }

  // Replace remote URLs with local paths in resource meta
  const updatedResources = resources.map((r) => {
    if (r.kind !== 'ad') return r

    const imageLocal = localPaths.get(`${r.path}:imageUrl`)
    const videoLocal = localPaths.get(`${r.path}:videoUrl`)
    const thumbLocal = localPaths.get(`${r.path}:thumbnailUrl`)

    if (!imageLocal && !videoLocal && !thumbLocal) return r

    const updatedMeta = { ...(r.meta ?? {}) }
    if (imageLocal) updatedMeta.imageUrl = imageLocal
    if (videoLocal) updatedMeta.videoUrl = videoLocal
    if (thumbLocal) updatedMeta.thumbnailUrl = thumbLocal

    return { ...r, meta: updatedMeta }
  })

  return {
    resources: updatedResources,
    summary: { downloaded, cached, failed, errors },
  }
}
