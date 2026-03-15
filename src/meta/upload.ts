import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import type { Cache } from '../core/cache.ts'

// ─── Types ─────────────────────────────────────────────────

/** A function that POSTs to the Meta Graph API. Injected for testability. */
export type GraphPost = (
  endpoint: string,
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export type UploadImageResult = {
  readonly imageHash: string
  readonly cached: boolean
}

export type UploadVideoResult = {
  readonly videoId: string
  readonly cached: boolean
}

export type ImageHashCheck = {
  readonly cached: boolean
  readonly hash?: string
  readonly fileSha?: string
}

// Cache keys use a "meta:upload:" prefix to namespace from Google resource mappings.
const CACHE_PROJECT = 'meta:uploads'

// ─── Helpers ───────────────────────────────────────────────

/** Compute SHA-256 hex digest of a local file. */
export function computeFileSha256(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

/** Build the cache path for a file upload entry. Uses SHA as the path for dedup. */
function uploadCachePath(type: 'image' | 'video', fileSha: string): string {
  return `${type}:${fileSha}`
}

// ─── Image Upload ──────────────────────────────────────────

/**
 * Upload an image to Meta Ads, with SHA-256 caching.
 *
 * - Computes SHA-256 of the local file
 * - If the SHA matches a cached entry, returns the cached Meta image hash (no API call)
 * - If new or changed, uploads via POST /{accountId}/adimages and caches the result
 */
export async function uploadImage(
  filePath: string,
  accountId: string,
  graphPost: GraphPost,
  cache: Cache,
): Promise<UploadImageResult> {
  const fileSha = computeFileSha256(filePath)
  const cachePath = uploadCachePath('image', fileSha)

  // Check cache for existing mapping
  const resources = cache.getResourceMap(CACHE_PROJECT)
  const cached = resources.find((r) => r.path === cachePath)

  if (cached?.platformId) {
    return { imageHash: cached.platformId, cached: true }
  }

  // Upload to Meta
  const fileData = readFileSync(filePath)
  const base64 = fileData.toString('base64')
  const fileName = filePath.split('/').pop() ?? 'image.png'

  const response = await graphPost(`${accountId}/adimages`, {
    bytes: base64,
    name: fileName,
  })

  // Meta returns: { images: { <filename>: { hash: "...", ... } } }
  const images = response.images as Record<string, { hash: string }> | undefined
  const imageEntry = images ? Object.values(images)[0] : undefined
  if (!imageEntry?.hash) {
    throw new Error(`Meta image upload failed: unexpected response shape — ${JSON.stringify(response)}`)
  }

  const metaImageHash = imageEntry.hash

  // Store in cache: fileSha -> metaImageHash
  cache.setResource({
    project: CACHE_PROJECT,
    path: cachePath,
    platformId: metaImageHash,
    kind: 'image',
    managedBy: 'ads-as-code',
  })

  return { imageHash: metaImageHash, cached: false }
}

// ─── Video Upload ──────────────────────────────────────────

const ONE_GB = 1024 * 1024 * 1024
const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB chunks for transfer phase

/**
 * Upload a video to Meta Ads, with SHA-256 caching.
 *
 * - Small files (<1GB): single POST to /{accountId}/advideos
 * - Large files (>=1GB): chunked upload — start, transfer chunks, finish
 */
export async function uploadVideo(
  filePath: string,
  accountId: string,
  graphPost: GraphPost,
  cache: Cache,
): Promise<UploadVideoResult> {
  const fileSha = computeFileSha256(filePath)
  const cachePath = uploadCachePath('video', fileSha)

  // Check cache
  const resources = cache.getResourceMap(CACHE_PROJECT)
  const cached = resources.find((r) => r.path === cachePath)

  if (cached?.platformId) {
    return { videoId: cached.platformId, cached: true }
  }

  const stat = statSync(filePath)
  let videoId: string

  if (stat.size < ONE_GB) {
    videoId = await uploadVideoSimple(filePath, accountId, graphPost)
  } else {
    videoId = await uploadVideoChunked(filePath, accountId, graphPost, stat.size)
  }

  // Store in cache
  cache.setResource({
    project: CACHE_PROJECT,
    path: cachePath,
    platformId: videoId,
    kind: 'video',
    managedBy: 'ads-as-code',
  })

  return { videoId, cached: false }
}

/** Single-request video upload for files under 1GB. */
async function uploadVideoSimple(
  filePath: string,
  accountId: string,
  graphPost: GraphPost,
): Promise<string> {
  const fileData = readFileSync(filePath)
  const base64 = fileData.toString('base64')
  const fileName = filePath.split('/').pop() ?? 'video.mp4'

  const response = await graphPost(`${accountId}/advideos`, {
    source: base64,
    title: fileName,
  })

  const id = response.id as string | undefined
  if (!id) {
    throw new Error(`Meta video upload failed: no id in response — ${JSON.stringify(response)}`)
  }

  return id
}

/**
 * Three-step chunked video upload for files >= 1GB.
 *
 * 1. Start: POST /{accountId}/advideos with upload_phase=start
 * 2. Transfer: POST /{accountId}/advideos with upload_phase=transfer, chunk data
 * 3. Finish: POST /{accountId}/advideos with upload_phase=finish
 */
async function uploadVideoChunked(
  filePath: string,
  accountId: string,
  graphPost: GraphPost,
  fileSize: number,
): Promise<string> {
  const fileName = filePath.split('/').pop() ?? 'video.mp4'

  // Step 1: Start
  const startResponse = await graphPost(`${accountId}/advideos`, {
    upload_phase: 'start',
    file_size: fileSize,
    title: fileName,
  })

  const uploadSessionId = startResponse.upload_session_id as string
  const videoId = startResponse.video_id as string

  if (!uploadSessionId || !videoId) {
    throw new Error(`Chunked upload start failed: missing session/video id — ${JSON.stringify(startResponse)}`)
  }

  // Step 2: Transfer chunks
  const fileData = readFileSync(filePath)
  let offset = 0

  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize)
    const chunk = fileData.subarray(offset, end)
    const chunkBase64 = Buffer.from(chunk).toString('base64')

    await graphPost(`${accountId}/advideos`, {
      upload_phase: 'transfer',
      upload_session_id: uploadSessionId,
      start_offset: offset,
      video_file_chunk: chunkBase64,
    })

    offset = end
  }

  // Step 3: Finish
  await graphPost(`${accountId}/advideos`, {
    upload_phase: 'finish',
    upload_session_id: uploadSessionId,
    title: fileName,
  })

  return videoId
}

// ─── Plan-time Check ───────────────────────────────────────

/**
 * Check whether an image is already uploaded (for plan output).
 * Returns cached hash if found, or just the file SHA if not.
 * Does NOT trigger an upload.
 */
export function getImageHash(
  filePath: string,
  cache: Cache,
): ImageHashCheck {
  const fileSha = computeFileSha256(filePath)
  const cachePath = uploadCachePath('image', fileSha)

  const resources = cache.getResourceMap(CACHE_PROJECT)
  const cached = resources.find((r) => r.path === cachePath)

  if (cached?.platformId) {
    return { cached: true, hash: cached.platformId }
  }

  return { cached: false, fileSha }
}
