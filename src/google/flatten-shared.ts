import type { Resource, ResourceKind } from '../core/types.ts'
import type { SharedNegativeList, ConversionActionConfig, SharedBudgetConfig } from './shared-types.ts'
import { slugify } from '../core/flatten.ts'

// ─── Resource Builder ─────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>): Resource {
  return { kind, path, properties }
}

// ─── Shared Negative Lists ──────────────────────────────────

/**
 * Flatten a SharedNegativeList into Resources:
 * - 1 sharedSet resource for the list itself
 * - N sharedCriterion resources, one per keyword
 */
export function flattenSharedNegativeList(list: SharedNegativeList): Resource[] {
  const resources: Resource[] = []
  const setPath = `shared:${slugify(list.name)}`

  resources.push(resource('sharedSet', setPath, {
    name: list.name,
    type: 'NEGATIVE_KEYWORDS',
  }))

  for (const kw of list.keywords) {
    const kwPath = `${setPath}/neg:${kw.text.toLowerCase()}:${kw.matchType}`
    resources.push(resource('sharedCriterion', kwPath, {
      text: kw.text,
      matchType: kw.matchType,
    }))
  }

  return resources
}

// ─── Conversion Actions ─────────────────────────────────────

/**
 * Flatten a ConversionActionConfig into a single conversionAction Resource.
 */
export function flattenConversionAction(config: ConversionActionConfig): Resource[] {
  return [
    resource('conversionAction', `conversion:${slugify(config.name)}`, {
      name: config.name,
      type: config.type,
      category: config.category,
      counting: config.counting,
      ...(config.value !== undefined && { value: config.value }),
      ...(config.attribution !== undefined && { attribution: config.attribution }),
      ...(config.lookbackDays !== undefined && { lookbackDays: config.lookbackDays }),
      ...(config.primary !== undefined && { primary: config.primary }),
    }),
  ]
}

// ─── Shared Budgets ─────────────────────────────────────────

/**
 * Flatten a SharedBudgetConfig into a single sharedBudget Resource.
 */
export function flattenSharedBudget(config: SharedBudgetConfig): Resource[] {
  return [
    resource('sharedBudget', `budget:${slugify(config.name)}`, {
      name: config.name,
      amount: config.amount,
      currency: config.currency,
      period: config.period,
    }),
  ]
}
