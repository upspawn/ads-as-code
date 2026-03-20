import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { RedditClient } from './api.ts'

// ─── Types ──────────────────────────────────────────────────

export type UploadResult = {
  readonly assetId: string
  readonly url: string
}

// ─── Upload ─────────────────────────────────────────────────

/**
 * Upload media (image or video) to Reddit Ads via their media endpoint.
 *
 * Reddit's media upload returns an asset object with `asset_id` and `url`.
 * The returned URL/ID is then referenced when creating ads.
 */
export async function uploadRedditMedia(
  filePath: string,
  accountId: string,
  client: RedditClient,
): Promise<UploadResult> {
  const fileData = readFileSync(filePath)
  const fileName = basename(filePath)

  const formData = new FormData()
  formData.append('file', new Blob([fileData]), fileName)

  const response = await client.upload<{ asset?: { asset_id?: string; url?: string } }>(
    `accounts/${accountId}/media`,
    formData,
  )

  const asset = response.asset
  if (!asset?.asset_id) {
    throw new Error(
      `Reddit media upload failed: no asset in response -- ${JSON.stringify(response)}`
    )
  }

  return {
    assetId: asset.asset_id,
    url: asset.url ?? '',
  }
}
