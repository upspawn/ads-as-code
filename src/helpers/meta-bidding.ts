import type { BidStrategy } from '../meta/types.ts'

/**
 * Use Meta's default bidding strategy: lowest cost without a cap.
 * This is the default if `bidding` is omitted from ad set config.
 *
 * @returns A LOWEST_COST_WITHOUT_CAP bid strategy
 *
 * @example
 * ```ts
 * lowestCost() // { type: 'LOWEST_COST_WITHOUT_CAP' }
 * ```
 */
export function lowestCost(): BidStrategy {
  return { type: 'LOWEST_COST_WITHOUT_CAP' as const }
}

/**
 * Set a cost cap — Meta will try to keep the average cost per result
 * at or below this amount.
 *
 * @param amount - Maximum average cost per result (must be positive)
 * @returns A COST_CAP bid strategy
 * @throws If amount is not positive
 *
 * @example
 * ```ts
 * costCap(10) // { type: 'COST_CAP', cap: 10 }
 * ```
 */
export function costCap(amount: number): BidStrategy {
  if (amount <= 0) throw new Error(`costCap amount must be positive, got ${amount}`)
  return { type: 'COST_CAP' as const, cap: amount }
}

/**
 * Set a bid cap — the maximum amount Meta will bid in any auction.
 *
 * @param amount - Maximum bid per auction (must be positive)
 * @returns A BID_CAP bid strategy
 * @throws If amount is not positive
 *
 * @example
 * ```ts
 * bidCap(5) // { type: 'BID_CAP', cap: 5 }
 * ```
 */
export function bidCap(amount: number): BidStrategy {
  if (amount <= 0) throw new Error(`bidCap amount must be positive, got ${amount}`)
  return { type: 'BID_CAP' as const, cap: amount }
}

/**
 * Set a minimum ROAS (Return On Ad Spend) floor.
 * Meta will aim to meet or exceed this return ratio.
 *
 * @param floor - Minimum ROAS multiplier (must be positive, e.g., 2.5 means 2.5x return)
 * @returns A MINIMUM_ROAS bid strategy
 * @throws If floor is not positive
 *
 * @example
 * ```ts
 * minRoas(2.5) // { type: 'MINIMUM_ROAS', floor: 2.5 }
 * ```
 */
export function minRoas(floor: number): BidStrategy {
  if (floor <= 0) throw new Error(`minRoas floor must be positive, got ${floor}`)
  return { type: 'MINIMUM_ROAS' as const, floor }
}
