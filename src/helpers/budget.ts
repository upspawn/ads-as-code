import type { DailyBudget, MonthlyBudget } from '../core/types.ts'

type Currency = 'EUR' | 'USD'

/** Create a daily budget */
export function daily(amount: number, currency: Currency = 'EUR'): DailyBudget {
  if (amount <= 0) throw new Error(`Budget amount must be positive, got ${amount}`)
  return { amount, currency, period: 'daily' as const }
}

/** Create a monthly budget (will be divided into daily by the engine) */
export function monthly(amount: number, currency: Currency = 'EUR'): MonthlyBudget {
  if (amount <= 0) throw new Error(`Budget amount must be positive, got ${amount}`)
  return { amount, currency, period: 'monthly' as const }
}

/** Shorthand: amount in EUR */
export function eur(amount: number): number & { readonly __currency: 'EUR' } {
  return amount as number & { readonly __currency: 'EUR' }
}

/** Shorthand: amount in USD */
export function usd(amount: number): number & { readonly __currency: 'USD' } {
  return amount as number & { readonly __currency: 'USD' }
}
