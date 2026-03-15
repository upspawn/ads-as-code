import type { ProviderModule } from '../core/providers.ts'
import type { Resource, ApplyResult, AdsConfig, Changeset } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { GoogleCampaign } from './types.ts'
import { flattenAll } from './flatten.ts'
import { fetchAllState } from './fetch.ts'
import { applyChangeset } from './apply.ts'
import { generateCampaignFile } from '../core/codegen.ts'
import { createGoogleClient } from './api.ts'

// ─── Google Provider Module ─────────────────────────────────

const googleProvider: ProviderModule = {
  flatten(campaigns: unknown[]): Resource[] {
    return flattenAll(campaigns as GoogleCampaign[])
  },

  async fetchAll(_config: AdsConfig, _cache: Cache): Promise<Resource[]> {
    // Google client resolves credentials from env vars / ~/.ads/credentials.json,
    // matching the pattern used by all CLI commands.
    const client = await createGoogleClient({ type: 'env' })
    return fetchAllState(client)
  },

  async applyChangeset(
    changeset: Changeset,
    _config: AdsConfig,
    cache: Cache,
    project: string,
  ): Promise<ApplyResult> {
    const client = await createGoogleClient({ type: 'env' })
    return applyChangeset(client, changeset, cache, project)
  },

  codegen(resources: Resource[], campaignName: string): string {
    return generateCampaignFile(resources, campaignName)
  },
}

export default googleProvider
