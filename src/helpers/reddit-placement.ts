import type { RedditPlacement } from '../reddit/types.ts'

/**
 * Show ads in Reddit's main feed — the home page and subreddit feeds.
 *
 * @returns `'FEED'`
 *
 * @example
 * ```ts
 * feed() // 'FEED'
 * ```
 */
export function feed(): RedditPlacement {
  return 'FEED'
}

/**
 * Show ads in Reddit conversation pages (comment threads).
 *
 * @returns `'CONVERSATION'`
 *
 * @example
 * ```ts
 * conversation() // 'CONVERSATION'
 * ```
 */
export function conversation(): RedditPlacement {
  return 'CONVERSATION'
}

/**
 * Use all available placements — Reddit decides where to show ads
 * for maximum reach.
 *
 * @returns `'ALL'`
 *
 * @example
 * ```ts
 * automatic() // 'ALL'
 * ```
 */
export function automatic(): RedditPlacement {
  return 'ALL'
}
