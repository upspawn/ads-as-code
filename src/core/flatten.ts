import type { Resource } from './types.ts'
import type { GoogleSearchCampaign } from '../google/types.ts'
import { flattenAll as googleFlattenAll } from '../google/flatten.ts'
import { flattenMeta } from '../meta/flatten.ts'
import type { MetaCampaign } from '../meta/index.ts'

// Re-export Google-specific flatten for backward compatibility.
// Callers that need the Google-specific single-campaign flatten can import it directly,
// or use this re-export during the migration period.
export { flatten } from '../google/flatten.ts'
export { flattenAll as flattenAllGoogle } from '../google/flatten.ts'

// ─── Slugify ──────────────────────────────────────────────

/** Lowercase, spaces/special chars to hyphens, strip non-alphanumeric except hyphens, collapse runs. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── Multi-Provider Flatten ──────────────────────────────

/** A campaign with an explicit provider tag, used by the multi-provider dispatch. */
export type DiscoveredCampaign = { provider: string; campaign: unknown }

/**
 * Flatten campaigns from any provider into a unified Resource list.
 * Dispatches to the appropriate provider-specific flatten based on the `provider` field.
 */
export function flattenAll(campaigns: DiscoveredCampaign[]): Resource[] {
  return campaigns.flatMap(({ provider, campaign }) => {
    switch (provider) {
      case 'google':
        return googleFlattenAll([campaign as GoogleSearchCampaign])
      case 'meta':
        return flattenMeta(campaign as MetaCampaign)
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  })
}
