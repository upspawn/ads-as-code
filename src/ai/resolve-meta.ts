// ─── Meta Marker Resolution ─────────────────────────────
// Resolves AI markers in Meta campaigns using the lock file.
// Follows the same pattern as resolve.ts (Google markers) but
// handles MetaCopyMarker in creatives and InterestsMarker in targeting.

import type { MetaCampaign, MetaAdSet } from '../meta/index.ts'
import type { MetaCreative, ImageAd, VideoAd, InterestTarget, MetaTargeting } from '../meta/types.ts'
import type { Objective } from '../meta/types.ts'
import type { LockFile } from './lockfile.ts'
import { readLockFile, getSlot, isSlotStale } from './lockfile.ts'
import type { StaleSlot } from './resolve.ts'

// ─── Meta AI Marker Types ────────────────────────────────
// Defined locally because the parallel agent is adding these to
// src/ai/types.ts. Once merged, these should be imported instead.

export type MetaCopyMarker = {
  readonly __brand: 'ai-marker'
  readonly type: 'meta-copy'
  readonly prompt: string
  readonly structured?: {
    readonly product?: string
    readonly audience?: string
    readonly tone?: string
  }
  readonly judge?: string
}

export type InterestsMarker = {
  readonly __brand: 'ai-marker'
  readonly type: 'interests'
  readonly prompt: string
}

export function isMetaCopyMarker(value: unknown): value is MetaCopyMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as MetaCopyMarker).__brand === 'ai-marker' &&
    'type' in value &&
    (value as MetaCopyMarker).type === 'meta-copy'
  )
}

export function isInterestsMarker(value: unknown): value is InterestsMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as InterestsMarker).__brand === 'ai-marker' &&
    'type' in value &&
    (value as InterestsMarker).type === 'interests'
  )
}

// ─── Copy Slot Result Shape ──────────────────────────────

type CopySlotResult = {
  readonly primaryText: string
  readonly headline: string
  readonly description?: string
}

// ─── Resolve a Single Copy Marker ────────────────────────

/**
 * Merge lock file copy result into a creative that contains a marker.
 *
 * At runtime, a creative with an AI marker carries the media info
 * (format, image/video path) alongside the marker fields. The lock
 * file provides the generated copy (headline, primaryText, description)
 * which we merge into the creative, stripping the marker fields.
 */
function resolveCopySlot(
  creative: Record<string, unknown>,
  slotResult: Record<string, unknown>,
): MetaCreative {
  const copy = slotResult as unknown as CopySlotResult

  const format = creative['format'] as string | undefined

  if (format === 'video') {
    return {
      format: 'video',
      video: (creative['video'] as string) ?? '',
      headline: copy.headline,
      primaryText: copy.primaryText,
      ...(copy.description !== undefined && { description: copy.description }),
      ...(creative['name'] !== undefined && { name: creative['name'] as string }),
      ...(creative['thumbnail'] !== undefined && { thumbnail: creative['thumbnail'] as string }),
      ...(creative['cta'] !== undefined && { cta: creative['cta'] as string }),
      ...(creative['url'] !== undefined && { url: creative['url'] as string }),
    } as VideoAd
  }

  // Default to image format
  return {
    format: 'image',
    image: (creative['image'] as string) ?? '',
    headline: copy.headline,
    primaryText: copy.primaryText,
    ...(copy.description !== undefined && { description: copy.description }),
    ...(creative['name'] !== undefined && { name: creative['name'] as string }),
    ...(creative['cta'] !== undefined && { cta: creative['cta'] as string }),
    ...(creative['url'] !== undefined && { url: creative['url'] as string }),
    ...(creative['displayLink'] !== undefined && { displayLink: creative['displayLink'] as string }),
  } as ImageAd
}

// ─── Resolve Interests from Lock Slot ────────────────────

/**
 * Build concrete InterestTarget[] from a lock file slot's interests result.
 *
 * The lock file stores interests as `{ id, name }` pairs.
 */
function resolveInterestsSlot(slotResult: Record<string, unknown>): InterestTarget[] {
  const rawInterests = slotResult['interests'] as Array<{ id: string; name: string }>
  return rawInterests.map((i) => ({ id: i.id, name: i.name }))
}

// ─── Prompt Compilation ──────────────────────────────────

const META_COPY_CONSTRAINTS = `
Meta Ads creative copy constraints:
- Primary text: up to 125 characters recommended (max 2200)
- Headline: up to 40 characters recommended (max 255)
- Description: up to 30 characters recommended (max 255)
- Write compelling, action-oriented copy
- Match the tone to the target audience`.trim()

const INTERESTS_CONSTRAINTS = `
Meta Ads targeting interests guidance:
- Return interests as { id, name } pairs
- Each interest maps to a Meta interest targeting category
- Choose interests that closely match the product/audience
- Prefer specific interests over broad categories`.trim()

/**
 * Compile a prompt for Meta copy generation from a marker and context.
 */
export function compileMetaCopyPrompt(
  marker: MetaCopyMarker,
  context: { campaignName?: string; adSetIndex?: number; adIndex?: number },
): string {
  const sections: string[] = []

  if (marker.prompt) sections.push(marker.prompt)

  if (marker.structured) {
    const parts: string[] = []
    if (marker.structured.product) parts.push(`Product: ${marker.structured.product}`)
    if (marker.structured.audience) parts.push(`Target audience: ${marker.structured.audience}`)
    if (marker.structured.tone) parts.push(`Tone: ${marker.structured.tone}`)
    if (parts.length > 0) sections.push(parts.join('\n'))
  }

  const ctxParts: string[] = []
  if (context.campaignName) ctxParts.push(`Campaign: ${context.campaignName}`)
  if (context.adSetIndex !== undefined) ctxParts.push(`Ad set index: ${context.adSetIndex}`)
  if (context.adIndex !== undefined) ctxParts.push(`Ad index: ${context.adIndex}`)
  if (ctxParts.length > 0) sections.push(ctxParts.join('\n'))

  sections.push(META_COPY_CONSTRAINTS)

  return sections.join('\n\n')
}

/**
 * Compile a prompt for Meta interests generation from a marker and context.
 */
export function compileInterestsPrompt(
  marker: InterestsMarker,
  context: { campaignName?: string; adSetIndex?: number },
): string {
  const sections: string[] = []

  if (marker.prompt) sections.push(marker.prompt)

  const ctxParts: string[] = []
  if (context.campaignName) ctxParts.push(`Campaign: ${context.campaignName}`)
  if (context.adSetIndex !== undefined) ctxParts.push(`Ad set index: ${context.adSetIndex}`)
  if (ctxParts.length > 0) sections.push(ctxParts.join('\n'))

  sections.push(INTERESTS_CONSTRAINTS)

  return sections.join('\n\n')
}

// ─── Resolve All Markers in a Campaign ───────────────────

/**
 * Walk a Meta campaign's adSets and resolve all AI markers using the lock file.
 *
 * For each ad set:
 * - Checks each creative for MetaCopyMarker. If found, looks up
 *   `{adSetIndex}.copy.{adIndex}` in the lock file.
 * - Checks targeting for InterestsMarker. If found, looks up
 *   `{adSetIndex}.interests` in the lock file.
 *
 * Concrete ads/targeting pass through unchanged.
 *
 * @throws If any marker has no matching lock slot
 */
export function resolveMetaMarkers<T extends Objective>(
  campaign: MetaCampaign<T>,
  lockFile: LockFile | null,
): MetaCampaign<T> {
  const resolvedAdSets: MetaAdSet<T>[] = []

  for (let adSetIdx = 0; adSetIdx < campaign.adSets.length; adSetIdx++) {
    const adSet = campaign.adSets[adSetIdx]!
    const resolvedAds: MetaCreative[] = []

    // Resolve creatives
    for (let adIdx = 0; adIdx < adSet.content.ads.length; adIdx++) {
      const ad = adSet.content.ads[adIdx]!

      if (isMetaCopyMarker(ad)) {
        const slotKey = `${adSetIdx}.copy.${adIdx}`
        const slot = lockFile ? getSlot(lockFile, slotKey) : undefined

        if (!slot) {
          throw new Error(
            `Unresolved AI marker in ${campaign.name}/${slotKey} — run ads generate first`,
          )
        }

        resolvedAds.push(resolveCopySlot(ad as unknown as Record<string, unknown>, slot.result))
      } else {
        resolvedAds.push(ad as MetaCreative)
      }
    }

    // Resolve targeting interests
    let resolvedTargeting = adSet.config.targeting
    const targetingInterests = adSet.config.targeting.interests

    if (targetingInterests) {
      const hasInterestsMarker = targetingInterests.some((i) =>
        isInterestsMarker(i),
      )

      if (hasInterestsMarker) {
        const slotKey = `${adSetIdx}.interests`
        const slot = lockFile ? getSlot(lockFile, slotKey) : undefined

        if (!slot) {
          throw new Error(
            `Unresolved AI marker in ${campaign.name}/${slotKey} — run ads generate first`,
          )
        }

        const resolvedInterests = resolveInterestsSlot(slot.result)

        // Merge: keep concrete interests, replace markers with resolved ones
        const concreteInterests = targetingInterests.filter(
          (i) => !isInterestsMarker(i),
        ) as InterestTarget[]

        resolvedTargeting = {
          ...adSet.config.targeting,
          interests: [...concreteInterests, ...resolvedInterests],
        }
      }
    }

    resolvedAdSets.push({
      ...adSet,
      config: {
        ...adSet.config,
        targeting: resolvedTargeting,
      },
      content: {
        ...adSet.content,
        ads: resolvedAds,
      },
    })
  }

  return {
    ...campaign,
    adSets: resolvedAdSets,
  }
}

// ─── Staleness Check ─────────────────────────────────────

/**
 * Check whether any AI-generated slots in a Meta campaign are stale.
 *
 * For each marker in the campaign, compiles the current prompt and
 * compares it against the prompt stored in the lock file slot. Returns
 * stale slots (empty if everything is fresh or no lock file exists).
 */
export function checkMetaStaleness<T extends Objective>(
  campaign: MetaCampaign<T>,
  lockFile: LockFile | null,
): StaleSlot[] {
  if (!lockFile) return []

  const stale: StaleSlot[] = []

  for (let adSetIdx = 0; adSetIdx < campaign.adSets.length; adSetIdx++) {
    const adSet = campaign.adSets[adSetIdx]!

    // Check copy markers
    for (let adIdx = 0; adIdx < adSet.content.ads.length; adIdx++) {
      const ad = adSet.content.ads[adIdx]!
      if (!isMetaCopyMarker(ad)) continue

      const slotKey = `${adSetIdx}.copy.${adIdx}`
      const slot = getSlot(lockFile, slotKey)
      if (!slot) continue // Unresolved, not stale

      const currentPrompt = compileMetaCopyPrompt(ad as unknown as MetaCopyMarker, {
        campaignName: campaign.name,
        adSetIndex: adSetIdx,
        adIndex: adIdx,
      })

      if (isSlotStale(slot, currentPrompt)) {
        stale.push({
          campaign: campaign.name,
          slot: slotKey,
          message: `Prompt changed since last generate for ${campaign.name}/${slotKey}`,
        })
      }
    }

    // Check interests markers
    const targetingInterests = adSet.config.targeting.interests
    if (targetingInterests) {
      for (const interest of targetingInterests) {
        if (!isInterestsMarker(interest)) continue

        const slotKey = `${adSetIdx}.interests`
        const slot = getSlot(lockFile, slotKey)
        if (!slot) continue

        const currentPrompt = compileInterestsPrompt(interest as unknown as InterestsMarker, {
          campaignName: campaign.name,
          adSetIndex: adSetIdx,
        })

        if (isSlotStale(slot, currentPrompt)) {
          stale.push({
            campaign: campaign.name,
            slot: slotKey,
            message: `Prompt changed since last generate for ${campaign.name}/${slotKey}`,
          })
        }
      }
    }
  }

  return stale
}

// ─── Resolve All Meta Campaigns ──────────────────────────

/**
 * Resolve AI markers in all Meta campaigns, reading companion .gen.json lock files.
 *
 * Campaigns without markers pass through unchanged.
 */
export async function resolveAllMetaMarkers(
  campaigns: ReadonlyArray<{ file: string; campaign: MetaCampaign }>,
): Promise<MetaCampaign[]> {
  const resolved: MetaCampaign[] = []

  for (const { file, campaign } of campaigns) {
    const hasMarkers = campaignHasMarkers(campaign)

    if (!hasMarkers) {
      resolved.push(campaign)
      continue
    }

    const lockFile = await readLockFile(file)
    resolved.push(resolveMetaMarkers(campaign, lockFile))
  }

  return resolved
}

// ─── Helpers ─────────────────────────────────────────────

/** Check whether a Meta campaign contains any AI markers. */
function campaignHasMarkers(campaign: MetaCampaign): boolean {
  return campaign.adSets.some((adSet) => {
    const hasCopyMarker = adSet.content.ads.some(isMetaCopyMarker)
    const hasInterestsMarker = adSet.config.targeting.interests?.some(isInterestsMarker) ?? false
    return hasCopyMarker || hasInterestsMarker
  })
}
