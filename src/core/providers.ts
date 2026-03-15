import type { Resource, Changeset, ApplyResult, AdsConfig } from './types.ts'
import type { DiscoveredCampaign } from './discovery.ts'
import type { Cache } from './cache.ts'

// ─── Provider Module Type ──────────────────────────────────

/**
 * A provider module implements the four operations needed to manage
 * campaigns for a given ad platform (Google, Meta, etc.).
 *
 * Each method's exact parameter types vary by provider, but the
 * interface is deliberately loose (using `unknown` for provider-specific
 * inputs) so the registry can dispatch uniformly. The concrete provider
 * modules narrow the types internally.
 */
export type ProviderModule = {
  /** Flatten campaign objects into a flat Resource[] for diffing. */
  readonly flatten: (campaigns: unknown[]) => Resource[]

  /** Fetch all live state from the ad platform as Resource[]. */
  readonly fetchAll: (config: AdsConfig, cache: Cache) => Promise<Resource[]>

  /** Apply a changeset (creates/updates/deletes) to the ad platform. */
  readonly applyChangeset: (
    changeset: Changeset,
    config: AdsConfig,
    cache: Cache,
    project: string,
  ) => Promise<ApplyResult>

  /** Generate TypeScript campaign file source from fetched Resource[]. */
  readonly codegen: (resources: Resource[], campaignName: string) => string

  /**
   * Optional post-fetch hook for import. Called after fetchAll, before codegen.
   * Allows providers to download assets, transform resources, etc.
   * Returns the (possibly modified) resources.
   */
  readonly postImportFetch?: (
    resources: Resource[],
    rootDir: string,
    cache: Cache | null,
  ) => Promise<{ resources: Resource[]; summary?: string }>
}

// ─── Provider Registry ─────────────────────────────────────

/**
 * Lazy-loaded provider registry. Each entry is a factory that returns
 * the provider module on first access. This avoids importing heavy
 * platform SDKs (google-ads-api, Meta Graph API) at startup.
 */
const PROVIDERS: Record<string, () => Promise<ProviderModule>> = {
  google: async () => {
    const mod = await import('../google/provider.ts')
    return mod.default
  },
  meta: async () => {
    const mod = await import('../meta/provider.ts')
    return mod.default
  },
}

/** Cache of already-loaded provider modules to avoid re-importing. */
const loaded = new Map<string, ProviderModule>()

// ─── Public API ────────────────────────────────────────────

/**
 * Get a provider module by name. Lazily loads the module on first call,
 * then caches it for subsequent requests.
 *
 * @throws Error if the provider name is not registered.
 */
export async function getProvider(name: string): Promise<ProviderModule> {
  const cached = loaded.get(name)
  if (cached) return cached

  const factory = PROVIDERS[name]
  if (!factory) {
    const known = Object.keys(PROVIDERS).join(', ')
    throw new Error(`Unknown provider "${name}". Available providers: ${known}`)
  }

  const mod = await factory()
  loaded.set(name, mod)
  return mod
}

/**
 * Group discovered campaigns by provider and optionally filter to a
 * single provider. Returns a map of provider name to campaigns.
 *
 * @param campaigns - All discovered campaigns from the project.
 * @param providerFilter - If set, only return campaigns for this provider.
 * @throws Error if providerFilter is set but no campaigns match.
 */
export function resolveProviders(
  campaigns: DiscoveredCampaign[],
  providerFilter?: string,
): Map<string, DiscoveredCampaign[]> {
  const grouped = new Map<string, DiscoveredCampaign[]>()

  for (const campaign of campaigns) {
    const provider = campaign.provider
    if (providerFilter && provider !== providerFilter) continue

    const list = grouped.get(provider) ?? []
    list.push(campaign)
    grouped.set(provider, list)
  }

  if (providerFilter && !grouped.has(providerFilter)) {
    const found = [...new Set(campaigns.map(c => c.provider))].join(', ')
    throw new Error(
      `No campaigns found for provider "${providerFilter}". ` +
      (found ? `Found providers: ${found}` : 'No campaigns discovered.'),
    )
  }

  return grouped
}

/**
 * Clear the loaded provider cache. Useful for testing.
 */
export function clearProviderCache(): void {
  loaded.clear()
}
