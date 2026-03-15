import type { Headline, Description, Keyword } from '../core/types.ts'
import type {
  GoogleSearchCampaign,
  GoogleSearchCampaignUnresolved,
  GoogleAdGroup,
  GoogleAd,
  RSAd,
} from '../google/types.ts'
import { isRsaMarker, isKeywordsMarker } from './types.ts'
import type { LockFile } from './lockfile.ts'
import { readLockFile, getSlot } from './lockfile.ts'

// === Match Type Mapping ===

const MATCH_TYPE_MAP = {
  exact: 'EXACT',
  phrase: 'PHRASE',
  broad: 'BROAD',
} as const

type MatchKey = keyof typeof MATCH_TYPE_MAP

// === Resolve a Single RSA Marker ===

/**
 * Build a concrete RSAd from a lock file slot's result.
 *
 * The lock file stores headlines/descriptions as plain strings;
 * we cast them to the branded Headline/Description types since
 * they were already validated during generation.
 */
function resolveRsaSlot(
  slotResult: Record<string, unknown>,
  defaultFinalUrl: string,
): RSAd {
  const headlines = (slotResult['headlines'] as string[]).map((h) => h as Headline)
  const descriptions = (slotResult['descriptions'] as string[]).map((d) => d as Description)

  return {
    type: 'rsa',
    headlines,
    descriptions,
    finalUrl: defaultFinalUrl,
  }
}

// === Resolve Keywords from Lock Slot ===

/**
 * Build concrete Keyword[] from a lock file slot's keyword result.
 *
 * The lock file stores keywords as `{ text, match }` where match is
 * lowercase ('exact'/'phrase'/'broad'). We map to the uppercase
 * matchType format used by the core type system.
 */
function resolveKeywordsSlot(slotResult: Record<string, unknown>): Keyword[] {
  const rawKeywords = slotResult['keywords'] as Array<{ text: string; match: string }>

  return rawKeywords.map((kw) => {
    const matchType = MATCH_TYPE_MAP[kw.match as MatchKey]
    if (!matchType) {
      throw new Error(`Unknown match type "${kw.match}" in lock file keyword`)
    }
    return { text: kw.text, matchType } as Keyword
  })
}

// === Resolve All Markers in a Campaign ===

/**
 * Walk a campaign's groups and resolve all AI markers using the lock file.
 *
 * For each group:
 * - If any ad is an RsaMarker, look up `{groupKey}.ad` in the lock file
 * - If any keyword is a KeywordsMarker, look up `{groupKey}.keywords` in the lock file
 * - Concrete ads/keywords pass through unchanged
 *
 * @param campaign - Campaign that may contain AI markers in its groups
 * @param lockFile - The .gen.json lock file with generated results (or null if not available)
 * @param defaultFinalUrl - URL to use for generated RSA ads (from campaign config or marker)
 * @returns A fully resolved GoogleSearchCampaign with no markers
 * @throws If any marker has no matching lock slot
 */
export function resolveMarkers(
  campaign: GoogleSearchCampaignUnresolved,
  lockFile: LockFile | null,
  defaultFinalUrl: string,
): GoogleSearchCampaign {
  const resolvedGroups: Record<string, GoogleAdGroup> = {}

  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    // Resolve ads
    const resolvedAds: GoogleAd[] = []
    for (const ad of group.ads) {
      if (isRsaMarker(ad)) {
        const slotKey = `${groupKey}.ad`
        const slot = lockFile ? getSlot(lockFile, slotKey) : undefined

        if (!slot) {
          throw new Error(
            `Unresolved AI marker in ${campaign.name}/${slotKey} — run ads generate first`,
          )
        }

        resolvedAds.push(resolveRsaSlot(slot.result, defaultFinalUrl))
      } else {
        // Concrete ad — pass through
        resolvedAds.push(ad as GoogleAd)
      }
    }

    // Resolve keywords
    const resolvedKeywords: Keyword[] = []
    let hasKeywordsMarker = false

    for (const kw of group.keywords) {
      if (isKeywordsMarker(kw)) {
        hasKeywordsMarker = true
        const slotKey = `${groupKey}.keywords`
        const slot = lockFile ? getSlot(lockFile, slotKey) : undefined

        if (!slot) {
          throw new Error(
            `Unresolved AI marker in ${campaign.name}/${slotKey} — run ads generate first`,
          )
        }

        resolvedKeywords.push(...resolveKeywordsSlot(slot.result))
      } else {
        // Concrete keyword — pass through
        resolvedKeywords.push(kw as Keyword)
      }
    }

    resolvedGroups[groupKey] = {
      keywords: resolvedKeywords,
      ads: resolvedAds,
      ...(group.negatives !== undefined && { negatives: group.negatives }),
      ...(group.status !== undefined && { status: group.status }),
      ...(group.targeting !== undefined && { targeting: group.targeting }),
    }
  }

  // Return a new campaign with all markers resolved
  return {
    ...campaign,
    groups: resolvedGroups,
  } as GoogleSearchCampaign
}

// === Resolve All Campaigns ===

/**
 * Resolve AI markers in all campaigns, reading companion .gen.json lock files.
 *
 * For each campaign that has AI markers, reads the lock file from the
 * campaign file's companion path, resolves all markers, and returns
 * the fully resolved campaigns ready for flattening.
 *
 * Campaigns without markers pass through unchanged.
 *
 * @param campaigns - Array of { file, campaign } pairs from discovery
 * @param defaultFinalUrl - Default URL for generated RSA ads
 * @returns Array of resolved GoogleSearchCampaign objects
 */
export async function resolveAllMarkers(
  campaigns: ReadonlyArray<{ file: string; campaign: unknown }>,
  defaultFinalUrl?: string,
): Promise<GoogleSearchCampaign[]> {
  const resolved: GoogleSearchCampaign[] = []

  for (const { file, campaign } of campaigns) {
    const unresolved = campaign as GoogleSearchCampaignUnresolved

    // Check if the campaign has any markers that need resolving
    const hasMarkers = Object.values(unresolved.groups).some(
      (group) =>
        group.ads.some(isRsaMarker) ||
        group.keywords.some(isKeywordsMarker),
    )

    if (!hasMarkers) {
      // No markers — treat as already resolved
      resolved.push(campaign as GoogleSearchCampaign)
      continue
    }

    // Read companion .gen.json lock file
    const lockFile = await readLockFile(file)

    // Derive a reasonable default URL — first concrete ad's finalUrl, or fallback
    const url = defaultFinalUrl ?? deriveDefaultUrl(unresolved)

    resolved.push(resolveMarkers(unresolved, lockFile, url))
  }

  return resolved
}

/**
 * Try to derive a default finalUrl from the first concrete RSA ad in the campaign.
 * Falls back to an empty string if none found (the user should configure one).
 */
function deriveDefaultUrl(campaign: GoogleSearchCampaignUnresolved): string {
  for (const group of Object.values(campaign.groups)) {
    for (const ad of group.ads) {
      if (!isRsaMarker(ad) && 'finalUrl' in ad) {
        return (ad as RSAd).finalUrl
      }
    }
  }
  return ''
}
