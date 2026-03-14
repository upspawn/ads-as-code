import type { AdsConfig } from './types.ts'

/**
 * Typed identity function for ads configuration.
 * Provides autocompletion and type-checking for config files.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   google: { customerId: '123-456-7890' },
 * })
 * ```
 */
export function defineConfig(config: AdsConfig): AdsConfig {
  return config
}
