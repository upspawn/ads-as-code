// Reddit Ads provider module — stub implementation
// Each method will be wired to real implementations in later phases

import type { ProviderModule } from '../core/providers.ts'

const redditProvider: ProviderModule = {
  flatten(_campaigns: unknown[]) {
    throw new Error('Reddit provider: flatten not yet implemented')
  },
  async fetchAll(_config, _cache) {
    throw new Error('Reddit provider: fetchAll not yet implemented')
  },
  async applyChangeset(_changeset, _config, _cache, _project) {
    throw new Error('Reddit provider: applyChangeset not yet implemented')
  },
  codegen(_resources, _campaignName) {
    throw new Error('Reddit provider: codegen not yet implemented')
  },
}

export default redditProvider
