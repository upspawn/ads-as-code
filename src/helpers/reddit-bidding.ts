import type { RedditBidStrategy } from '../reddit/types.ts'

/**
 * Use Reddit's automatic bidding — optimizes for lowest cost per result.
 *
 * @returns A LOWEST_COST bid strategy
 *
 * @example
 * ```ts
 * lowestCost() // { type: 'LOWEST_COST' }
 * ```
 */
export function lowestCost(): RedditBidStrategy {
  return { type: 'LOWEST_COST' as const }
}

/**
 * Set a cost cap — Reddit will try to keep the average cost per result
 * at or below this amount (in micros).
 *
 * @param amount - Maximum average cost per result in micros (must be positive)
 * @returns A COST_CAP bid strategy
 * @throws If amount is not positive
 *
 * @example
 * ```ts
 * costCap(500_000) // { type: 'COST_CAP', amount: 500_000 }
 * ```
 */
export function costCap(amount: number): RedditBidStrategy {
  if (amount <= 0) throw new Error(`costCap amount must be positive, got ${amount}`)
  return { type: 'COST_CAP' as const, amount }
}

/**
 * Set a manual bid — the exact amount to bid per auction (in micros).
 *
 * @param amount - Bid amount in micros (must be positive)
 * @returns A MANUAL_BID bid strategy
 * @throws If amount is not positive
 *
 * @example
 * ```ts
 * manualBid(150_000) // { type: 'MANUAL_BID', amount: 150_000 }
 * ```
 */
export function manualBid(amount: number): RedditBidStrategy {
  if (amount <= 0) throw new Error(`manualBid amount must be positive, got ${amount}`)
  return { type: 'MANUAL_BID' as const, amount }
}
