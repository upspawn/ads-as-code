import type { ProviderModule } from '../core/providers.ts'
import type { Resource, AdsConfig, Changeset } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { MetaCampaign } from './flatten.ts'
import { flattenMeta } from './flatten.ts'
import { codegenMeta } from './codegen.ts'
import { downloadMetaImages } from './download.ts'
import { fetchMetaAll } from './fetch.ts'
import { applyMetaChangeset } from './apply.ts'
import { MetaCampaignBuilder } from './index.ts'

// ─── Meta Provider Module ──────────────────────────────────

const metaProvider: ProviderModule = {
  flatten(campaigns: unknown[]): Resource[] {
    // Campaign objects from .ts files are MetaCampaignBuilder instances
    // which need .build() to extract the MetaCampaign data structure.
    const built = campaigns.map((c) =>
      c instanceof MetaCampaignBuilder ? (c as MetaCampaignBuilder<any>).build() : c as MetaCampaign,
    )
    return built.flatMap(flattenMeta)
  },

  async fetchAll(config: AdsConfig, _cache: Cache): Promise<Resource[]> {
    if (!config.meta) throw new Error('Meta provider config missing — add meta section to ads.config.ts')
    return fetchMetaAll(config.meta)
  },

  async applyChangeset(changeset: Changeset, config: AdsConfig, cache: Cache, project: string) {
    if (!config.meta) throw new Error('Meta provider config missing — add meta section to ads.config.ts')
    return applyMetaChangeset(changeset, config.meta, cache, project)
  },

  codegen(resources: Resource[], _campaignName: string): string {
    return codegenMeta(resources)
  },

  async postImportFetch(
    resources: Resource[],
    rootDir: string,
    cache: Cache | null,
  ): Promise<{ resources: Resource[]; summary?: string }> {
    const { resources: updated, result } = await downloadMetaImages(resources, rootDir, cache)

    const parts: string[] = []
    if (result.downloaded > 0) parts.push(`${result.downloaded} downloaded`)
    if (result.cached > 0) parts.push(`${result.cached} already local`)
    if (result.failed > 0) parts.push(`${result.failed} failed`)
    const summary = parts.length > 0 ? `Images: ${parts.join(', ')}` : undefined

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.warn(`  Warning: ${err}`)
      }
    }

    return { resources: updated, summary }
  },
}

export default metaProvider
