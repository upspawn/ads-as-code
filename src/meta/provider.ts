import type { ProviderModule } from '../core/providers.ts'
import type { Resource } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import { codegenMeta } from './codegen.ts'
import { downloadMetaImages } from './download.ts'

// ─── Meta Provider Module ──────────────────────────────────
//
// codegen and postImportFetch are fully implemented.
// flatten, fetchAll, and applyChangeset remain stubs until
// their respective tasks are completed (Tasks 10, 18, 21, 23).

const metaProvider: ProviderModule = {
  flatten(_campaigns: unknown[]) {
    throw new Error('Meta flatten is not implemented yet')
  },

  async fetchAll() {
    throw new Error('Meta fetchAll is not implemented yet')
  },

  async applyChangeset() {
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
