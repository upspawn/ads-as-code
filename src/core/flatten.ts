import type { Resource } from './types.ts'
import type { GoogleFlattenable } from '../google/flatten.ts'
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

// ─── Slug Deduplication ─────────────────────────────────

/**
 * Detect and resolve campaign slug collisions in a Resource[] array.
 *
 * When multiple campaigns produce the same slug (e.g., two campaigns both
 * named "Retargeting - Website Visitors"), the second gets a "-2" suffix,
 * the third "-3", etc. All child resources under that campaign have their
 * paths rewritten to use the deduplicated slug prefix.
 *
 * Expects resources grouped by campaign (all resources for campaign 1 before
 * campaign 2), which is the natural output of flatMap(flattenMeta).
 *
 * This mirrors the dedup logic in meta/fetch.ts so that fetch and flatten
 * produce symmetric paths for the same set of campaigns.
 */
export function deduplicateResourceSlugs(resources: Resource[]): Resource[] {
  // Count how many campaigns share each slug
  const campaigns = resources.filter((r) => r.kind === 'campaign')
  if (campaigns.length <= 1) return resources

  const totalPerSlug = new Map<string, number>()
  for (const c of campaigns) {
    totalPerSlug.set(c.path, (totalPerSlug.get(c.path) ?? 0) + 1)
  }

  // No collisions — short-circuit
  const hasCollision = [...totalPerSlug.values()].some((n) => n > 1)
  if (!hasCollision) return resources

  // Walk resources in order. Campaign resources act as "group headers" —
  // every non-campaign resource belongs to the most recently seen campaign.
  // When a campaign slug has duplicates, track which occurrence we're on
  // and rewrite paths for the 2nd+ occurrence.
  const seenCount = new Map<string, number>()
  let activeRename: string | undefined  // undefined = no rename needed for current group

  const result: Resource[] = []

  for (const r of resources) {
    if (r.kind === 'campaign') {
      const slug = r.path
      const count = (seenCount.get(slug) ?? 0) + 1
      seenCount.set(slug, count)

      if ((totalPerSlug.get(slug) ?? 1) > 1 && count > 1) {
        // Duplicate campaign — rewrite path
        const newSlug = `${slug}-${count}`
        activeRename = newSlug
        result.push({ ...r, path: newSlug })
      } else {
        activeRename = undefined
        result.push(r)
      }
    } else if (activeRename) {
      // Child of a renamed campaign — rewrite path prefix
      const originalSlug = r.path.split('/')[0]!
      const newPath = activeRename + r.path.slice(originalSlug.length)

      if (r.kind === 'ad') {
        // Rewrite creativePath in both properties and meta — Google uses properties,
        // Meta uses meta. Handle whichever is present.
        const cpProp = r.properties.creativePath as string | undefined
        const cpMeta = r.meta?.creativePath as string | undefined
        const newProps = cpProp
          ? { ...r.properties, creativePath: activeRename + cpProp.slice(originalSlug.length) }
          : r.properties
        const newMeta = cpMeta
          ? { ...r.meta, creativePath: activeRename + cpMeta.slice(originalSlug.length) }
          : r.meta
        result.push({ ...r, path: newPath, properties: newProps, ...(newMeta ? { meta: newMeta } : {}) })
      } else {
        result.push({ ...r, path: newPath })
      }
    } else {
      result.push(r)
    }
  }

  return result
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
        return googleFlattenAll([campaign as GoogleFlattenable])
      case 'meta':
        return flattenMeta(campaign as MetaCampaign)
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  })
}
