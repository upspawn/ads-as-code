import type {
  MetaPlacements,
  MetaPlatform,
  PlacementPosition,
} from '../meta/types.ts'

/**
 * Platform-specific position overrides for manual placements.
 * These map directly to the Meta API's per-platform position arrays.
 */
export type PlatformPositionOptions = {
  readonly facebookPositions?: readonly string[]
  readonly instagramPositions?: readonly string[]
  readonly messengerPositions?: readonly string[]
  readonly audienceNetworkPositions?: readonly string[]
}

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
 * @param positionsOrOptions - Either a flat array of positions (legacy) or per-platform position options
 * @returns A MetaPlacements object
 * @throws If no platforms are provided
 *
 * @example
 * ```ts
 * // Legacy: flat position list
 * manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])
 *
 * // Per-platform positions (matches API granularity)
 * manual(['facebook', 'instagram'], {
 *   facebookPositions: ['feed', 'story', 'reels'],
 *   instagramPositions: ['stream', 'story', 'reels'],
 * })
 *
 * // Platforms only (all positions)
 * manual(['facebook'])
 * ```
 */
export function manual(
  platforms: readonly MetaPlatform[],
  positionsOrOptions?: readonly PlacementPosition[] | PlatformPositionOptions,
): MetaPlacements {
  if (platforms.length === 0) throw new Error('manual() requires at least one platform')

  // Distinguish flat array from options object
  if (!positionsOrOptions) {
    return { platforms }
  }

  if (Array.isArray(positionsOrOptions)) {
    return {
      platforms,
      ...(positionsOrOptions.length > 0 && { positions: positionsOrOptions }),
    }
  }

  // Platform-specific position options
  const opts = positionsOrOptions as PlatformPositionOptions
  return {
    platforms,
    ...(opts.facebookPositions && opts.facebookPositions.length > 0 && { facebookPositions: opts.facebookPositions }),
    ...(opts.instagramPositions && opts.instagramPositions.length > 0 && { instagramPositions: opts.instagramPositions }),
    ...(opts.messengerPositions && opts.messengerPositions.length > 0 && { messengerPositions: opts.messengerPositions }),
    ...(opts.audienceNetworkPositions && opts.audienceNetworkPositions.length > 0 && { audienceNetworkPositions: opts.audienceNetworkPositions }),
  }
}
