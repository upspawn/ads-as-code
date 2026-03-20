// Reddit Ads targeting helpers
// Each helper returns a RedditTargetingRule with the correct discriminator _type

import type { RedditTargetingRule } from '../reddit/types.ts'

/** Target specific subreddits. */
export function subreddits(...names: string[]): RedditTargetingRule {
  if (names.length === 0) throw new Error('subreddits() requires at least one subreddit name')
  return { _type: 'subreddits', names }
}

/** Target interest categories. */
export function interests(...names: string[]): RedditTargetingRule {
  if (names.length === 0) throw new Error('interests() requires at least one interest name')
  return { _type: 'interests', names }
}

/** Target keyword terms. */
export function keywords(...terms: string[]): RedditTargetingRule {
  if (terms.length === 0) throw new Error('keywords() requires at least one keyword term')
  return { _type: 'keywords', terms }
}

/** Target geographic locations (country codes or region IDs). */
export function geo(...locations: string[]): RedditTargetingRule {
  if (locations.length === 0) throw new Error('geo() requires at least one location')
  return { _type: 'geo', locations }
}

/**
 * Target an age range.
 * Reddit supports ages 13-65.
 */
export function age(min: number, max: number): RedditTargetingRule {
  if (min < 13 || min > 65) throw new Error(`age min must be 13-65, got ${min}`)
  if (max < 13 || max > 65) throw new Error(`age max must be 13-65, got ${max}`)
  if (min > max) throw new Error(`age min (${min}) must be <= max (${max})`)
  return { _type: 'age', min, max }
}

/** Target by gender. */
export function gender(value: 'male' | 'female' | 'all'): RedditTargetingRule {
  return { _type: 'gender', value }
}

/** Target device types. */
export function device(...types: ('mobile' | 'desktop')[]): RedditTargetingRule {
  if (types.length === 0) throw new Error('device() requires at least one device type')
  return { _type: 'device', types }
}

/** Target operating systems. */
export function os(...types: ('ios' | 'android' | 'windows' | 'macos')[]): RedditTargetingRule {
  if (types.length === 0) throw new Error('os() requires at least one OS type')
  return { _type: 'os', types }
}

/** Target a custom audience by ID. */
export function customAudience(id: string): RedditTargetingRule {
  return { _type: 'customAudience', id }
}

/** Target a lookalike audience based on a source audience. */
export function lookalike(sourceId: string, config?: { readonly country?: string; readonly ratio?: number }): RedditTargetingRule {
  if (config) {
    return { _type: 'lookalike', sourceId, config }
  }
  return { _type: 'lookalike', sourceId }
}

/** Enable or disable audience expansion. */
export function expansion(enabled: boolean): RedditTargetingRule {
  return { _type: 'expansion', enabled }
}
