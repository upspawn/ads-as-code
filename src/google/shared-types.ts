import type { Keyword, Budget } from '../core/types.ts'

// ─── Shared Negative Keyword Lists ──────────────────────────

export type SharedNegativeList = {
  readonly provider: 'google'
  readonly kind: 'shared-negative-list'
  readonly name: string
  readonly keywords: Keyword[]
}

export type SharedNegativeListInput = {
  readonly keywords: Keyword[]
}

/**
 * Create a shared negative keyword list that can be linked to multiple campaigns.
 *
 * Shared negative lists avoid duplicating the same negatives across campaigns.
 * Google Ads limits accounts to 20 shared negative lists, each with up to 5,000 keywords.
 *
 * @param name - Display name for the shared set
 * @param keywords - Negative keywords to include in the list
 * @returns A SharedNegativeList object
 *
 * @example
 * ```ts
 * export default sharedNegatives('Brand Exclusions', [
 *   ...broad('free', 'cheap', 'open source'),
 *   ...exact('competitor name'),
 * ])
 * ```
 */
export function sharedNegatives(name: string, keywords: Keyword[]): SharedNegativeList {
  return { provider: 'google', kind: 'shared-negative-list', name, keywords }
}

// ─── Conversion Actions ─────────────────────────────────────

export type ConversionActionType = 'webpage' | 'ad-call' | 'click-to-call' | 'import'
export type ConversionCategory =
  | 'purchase' | 'signup' | 'lead' | 'page-view' | 'download'
  | 'add-to-cart' | 'begin-checkout' | 'subscribe' | 'contact' | 'other'
export type ConversionCounting = 'one-per-click' | 'many-per-click'
export type AttributionModel = 'last-click' | 'data-driven'

export type ConversionActionConfig = {
  readonly provider: 'google'
  readonly kind: 'conversion-action'
  readonly name: string
  readonly type: ConversionActionType
  readonly category: ConversionCategory
  readonly counting: ConversionCounting
  readonly value?: {
    readonly default?: number
    readonly currency?: string
    readonly useDynamic?: boolean
  }
  readonly attribution?: AttributionModel
  readonly lookbackDays?: number
  readonly primary?: boolean
}

/**
 * Create a conversion action configuration for tracking conversions in Google Ads.
 *
 * @param name - Display name for the conversion action
 * @param config - Configuration without provider/kind/name (those are set automatically)
 * @returns A ConversionActionConfig object
 *
 * @example
 * ```ts
 * export default conversionAction('Website Signup', {
 *   type: 'webpage',
 *   category: 'signup',
 *   counting: 'one-per-click',
 *   value: { default: 10, currency: 'EUR' },
 *   attribution: 'data-driven',
 * })
 * ```
 */
export function conversionAction(
  name: string,
  config: Omit<ConversionActionConfig, 'provider' | 'kind' | 'name'>,
): ConversionActionConfig {
  return { provider: 'google', kind: 'conversion-action', name, ...config }
}

// ─── Shared Budgets ─────────────────────────────────────────

export type SharedBudgetConfig = {
  readonly provider: 'google'
  readonly kind: 'shared-budget'
  readonly name: string
  readonly amount: number
  readonly currency: string
  readonly period: 'daily'
}

/**
 * Create a shared budget that can be referenced by multiple campaigns.
 *
 * Shared budgets let Google distribute spend across campaigns dynamically,
 * allocating more to higher-performing campaigns.
 *
 * @param name - Display name for the shared budget
 * @param budget - Budget configuration (amount, currency, period)
 * @returns A SharedBudgetConfig object
 *
 * @example
 * ```ts
 * export default sharedBudget('Search Campaigns Budget', daily(30))
 * ```
 */
export function sharedBudget(
  name: string,
  budget: { readonly amount: number; readonly currency: string; readonly period: 'daily' },
): SharedBudgetConfig {
  return {
    provider: 'google',
    kind: 'shared-budget',
    name,
    amount: budget.amount,
    currency: budget.currency,
    period: budget.period,
  }
}
