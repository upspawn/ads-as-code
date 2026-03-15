import type { ProviderModule } from '../core/providers.ts'
import type { Resource } from '../core/types.ts'
import type { MetaCampaign } from './flatten.ts'
import { flattenMeta } from './flatten.ts'
import { codegenMeta } from './codegen.ts'

// ─── Meta Provider Module ──────────────────────────────────
//
// flatten and codegen are fully wired. fetchAll and applyChangeset
// remain stubs until src/meta/fetch.ts and src/meta/apply.ts are
// implemented. At that point, wire them here using createMetaClient
// from src/meta/api.ts to build the API client from config.meta.

const metaProvider: ProviderModule = {
  flatten(campaigns: unknown[]): Resource[] {
    return (campaigns as MetaCampaign[]).flatMap(flattenMeta)
  },

  async fetchAll() {
    // TODO: wire to fetchMetaAll from src/meta/fetch.ts (Task 23)
    throw new Error('Meta fetchAll is not implemented yet')
  },

  async applyChangeset() {
    // TODO: wire to applyMetaChangeset from src/meta/apply.ts (Task 23)
    throw new Error('Meta applyChangeset is not implemented yet')
  },

  codegen(resources: Resource[], _campaignName: string): string {
    return codegenMeta(resources)
  },
}

export default metaProvider
