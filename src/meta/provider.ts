import type { ProviderModule } from '../core/providers.ts'
import type { Resource } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { MetaCampaign } from './flatten.ts'
import { flattenMeta } from './flatten.ts'
import { codegenMeta } from './codegen.ts'
import { downloadMetaImages } from './download.ts'

// ─── Meta Provider Module ──────────────────────────────────
//
// flatten, codegen, and postImportFetch are fully implemented.
// fetchAll and applyChangeset remain stubs until wired to
// fetchMetaAll and applyMetaChangeset via createMetaClient.

const metaProvider: ProviderModule = {
  flatten(campaigns: unknown[]): Resource[] {
    return (campaigns as MetaCampaign[]).flatMap(flattenMeta)
  },

  async fetchAll() {
    // TODO: wire to fetchMetaAll from src/meta/fetch.ts
    throw new Error('Meta fetchAll is not implemented yet')
  },

  async applyChangeset() {
    // TODO: wire to applyMetaChangeset from src/meta/apply.ts
    throw new Error('Meta applyChangeset is not implemented yet')
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
