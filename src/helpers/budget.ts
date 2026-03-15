import type { DailyBudget, MonthlyBudget, LifetimeBudget } from '../core/types.ts'

type Currency = 'EUR' | 'USD'

/**
 * Create a daily budget.
 *
 * @param amount - Budget amount per day (must be positive)
 * @param currency - Currency code, defaults to `'EUR'`. Note: the fetch layer
 *   resolves the real account currency at runtime (from config or Meta API),
 *   so this default only affects the code-side declaration.
 * @returns A daily budget object
 * @throws If amount is zero or negative
 *
 * @example
 * ```ts
 * daily(20)         // { amount: 20, currency: 'EUR', period: 'daily' }
 * daily(15, 'USD')  // { amount: 15, currency: 'USD', period: 'daily' }
 * ```
 */
export function daily(amount: number, currency: Currency = 'EUR'): DailyBudget {
  if (amount <= 0) throw new Error(`Budget amount must be positive, got ${amount}`)
  return { amount, currency, period: 'daily' as const }
}

/**
 * Create a monthly budget. The engine divides this into a daily amount.
 *
 * @param amount - Budget amount per month (must be positive)
 * @param currency - Currency code, defaults to `'EUR'`
 * @returns A monthly budget object
 * @throws If amount is zero or negative
 *
 * @example
 * ```ts
 * monthly(600)         // { amount: 600, currency: 'EUR', period: 'monthly' }
 * monthly(500, 'USD')  // { amount: 500, currency: 'USD', period: 'monthly' }
 * ```
 */
export function monthly(amount: number, currency: Currency = 'EUR'): MonthlyBudget {
  if (amount <= 0) throw new Error(`Budget amount must be positive, got ${amount}`)
  return { amount, currency, period: 'monthly' as const }
}

/**
 * Create a lifetime budget with a fixed end date.
 * Meta distributes this total amount across the campaign's lifetime.
 *
 * @param amount - Total budget amount (must be positive)
 * @param endTime - End date as ISO 8601 string (e.g., `'2026-04-01'` or `'2026-04-01T23:59:59Z'`)
 * @param currency - Currency code, defaults to `'EUR'`
 * @returns A lifetime budget object
 * @throws If amount is zero or negative, or endTime is empty
 *
 * @example
 * ```ts
 * lifetime(500, '2026-04-01')          // { amount: 500, currency: 'EUR', period: 'lifetime', endTime: '2026-04-01' }
 * lifetime(1000, '2026-06-30', 'USD')  // { amount: 1000, currency: 'USD', period: 'lifetime', endTime: '2026-06-30' }
 * ```
 */
export function lifetime(amount: number, endTime: string, currency: Currency = 'EUR'): LifetimeBudget {
  if (amount <= 0) throw new Error(`Budget amount must be positive, got ${amount}`)
  if (!endTime) throw new Error('lifetime() requires an endTime')
  return { amount, currency, period: 'lifetime' as const, endTime }
}

/**
 * Branded shorthand for EUR amounts. Returns the number with a compile-time currency brand.
 *
 * @param amount - The amount in EUR
 * @returns Branded number typed as EUR
 *
 * @example
 * ```ts
 * eur(20)  // 20, typed as EUR
 * ```
 */
export function eur(amount: number): number & { readonly __currency: 'EUR' } {
  return amount as number & { readonly __currency: 'EUR' }
}

/**
 * Branded shorthand for USD amounts. Returns the number with a compile-time currency brand.
 *
 * @param amount - The amount in USD
 * @returns Branded number typed as USD
 *
 * @example
 * ```ts
 * usd(15)  // 15, typed as USD
 * ```
 */
export function usd(amount: number): number & { readonly __currency: 'USD' } {
  return amount as number & { readonly __currency: 'USD' }
}
