import type {
  MetaPlacements,
  MetaPlatform,
  PlacementPosition,
} from '../meta/types.ts'

/**
 * Use Meta's Advantage+ automatic placements.
 * This is the recommended default — Meta distributes your ads across
 * all available placements to maximize results.
 *
 * @returns The string `'automatic'`
 *
 * @example
 * ```ts
 * automatic() // 'automatic'
 * ```
 */
export function automatic(): MetaPlacements {
  return 'automatic'
}

/**
 * Manually select which platforms and positions to show ads on.
 * Use this when you need to restrict delivery to specific placements
 * (e.g., Facebook and Instagram feed only).
 *
 * @param platforms - One or more platforms: `'facebook'`, `'instagram'`, `'audience_network'`, `'messenger'`
 * @param positions - Optional specific positions within those platforms (e.g., `'feed'`, `'story'`, `'reels'`)
 * @returns A MetaPlacements object
 * @throws If no platforms are provided
 *
 * @example
 * ```ts
 * manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])
 * manual(['facebook'])  // all positions on Facebook
 * ```
 */
export function manual(
  platforms: readonly MetaPlatform[],
  positions?: readonly PlacementPosition[],
): MetaPlacements {
  if (platforms.length === 0) throw new Error('manual() requires at least one platform')
  return {
    platforms,
    ...(positions && positions.length > 0 && { positions }),
  }
}
