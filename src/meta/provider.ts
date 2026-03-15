import type { ProviderModule } from '../core/providers.ts'

// ─── Meta Provider Module (Stub) ────────────────────────────
//
// Placeholder that will be replaced with real implementations
// as the Meta provider is built out (Tasks 10, 18, 21, 23).

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

  codegen() {
    throw new Error('Meta codegen is not implemented yet')
  },
}

export default metaProvider
