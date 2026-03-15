import type { MutateOperation } from './types.ts'
import type { SharedNegativeList, ConversionActionConfig, SharedBudgetConfig } from './shared-types.ts'

// ─── Match Type → API Enum ─────────────────────────────────

const MATCH_TYPE_TO_ENUM: Record<string, number> = {
  'EXACT': 2,
  'PHRASE': 3,
  'BROAD': 4,
}

// ─── Micros ─────────────────────────────────────────────────

function toMicros(amount: number): number {
  return Math.round(amount * 1_000_000)
}

// ─── Shared Negative Lists ──────────────────────────────────

/**
 * Build Google Ads API mutate operations for a shared negative keyword list.
 *
 * Creates:
 * 1. A SharedSet with type NEGATIVE_KEYWORDS
 * 2. A SharedCriterion for each keyword in the list
 * 3. Optionally, CampaignSharedSet links for each campaign resource name
 *
 * @param customerId - Google Ads customer ID
 * @param list - The shared negative list configuration
 * @param campaignResourceNames - Optional campaign resource names to link to
 * @returns Array of MutateOperations to send to the API
 */
export function buildSharedSetOperations(
  customerId: string,
  list: SharedNegativeList,
  campaignResourceNames?: string[],
): MutateOperation[] {
  const ops: MutateOperation[] = []

  // Temp ID for the shared set (negative to indicate pending creation)
  const tempSetId = `-${Date.now()}`
  const setResourceName = `customers/${customerId}/sharedSets/${tempSetId}`

  // 1. Create the shared set
  ops.push({
    operation: 'shared_set',
    op: 'create',
    resource: {
      resource_name: setResourceName,
      name: list.name,
      type: 3, // NEGATIVE_KEYWORDS
    },
  })

  // 2. Create shared criteria (one per keyword)
  for (const kw of list.keywords) {
    ops.push({
      operation: 'shared_criterion',
      op: 'create',
      resource: {
        shared_set: setResourceName,
        keyword: {
          text: kw.text,
          match_type: MATCH_TYPE_TO_ENUM[kw.matchType] ?? 4,
        },
      },
    })
  }

  // 3. Link to campaigns
  if (campaignResourceNames) {
    for (const campaignResourceName of campaignResourceNames) {
      ops.push({
        operation: 'campaign_shared_set',
        op: 'create',
        resource: {
          campaign: campaignResourceName,
          shared_set: setResourceName,
        },
      })
    }
  }

  return ops
}

// ─── Conversion Actions ─────────────────────────────────────

/** Map SDK conversion type strings to Google Ads API enum values. */
const CONVERSION_TYPE_MAP: Record<string, number> = {
  'webpage': 6,
  'ad-call': 1,
  'click-to-call': 2,
  'import': 10,
}

/** Map SDK category strings to Google Ads API enum values. */
const CONVERSION_CATEGORY_MAP: Record<string, number> = {
  'purchase': 2,
  'signup': 28,
  'lead': 18,
  'page-view': 1,
  'download': 7,
  'add-to-cart': 3,
  'begin-checkout': 27,
  'subscribe': 29,
  'contact': 24,
  'other': 13,
}

/**
 * Build Google Ads API mutate operations for a conversion action.
 *
 * @param customerId - Google Ads customer ID
 * @param config - The conversion action configuration
 * @returns Array of MutateOperations (always a single operation)
 */
export function buildConversionActionOperations(
  customerId: string,
  config: ConversionActionConfig,
): MutateOperation[] {
  const resource: Record<string, unknown> = {
    name: config.name,
    type: CONVERSION_TYPE_MAP[config.type] ?? 6,
    category: CONVERSION_CATEGORY_MAP[config.category] ?? 13,
    counting_type: config.counting === 'one-per-click' ? 2 : 3,
    click_through_lookback_window_days: config.lookbackDays ?? 30,
    primary_for_goal: config.primary ?? true,
  }

  // Value settings
  resource.value_settings = {
    default_value: config.value?.default ?? 0,
    always_use_default_value: !(config.value?.useDynamic ?? false),
    currency_code: config.value?.currency ?? 'EUR',
  }

  // Attribution model: 6 = DATA_DRIVEN, 101 = LAST_CLICK (Google Ads API v18+)
  resource.attribution_model_settings = {
    attribution_model: config.attribution === 'data-driven' ? 6 : 101,
  }

  return [{
    operation: 'conversion_action',
    op: 'create',
    resource,
  }]
}

// ─── Shared Budgets ─────────────────────────────────────────

/**
 * Build Google Ads API mutate operations for a shared budget.
 *
 * @param customerId - Google Ads customer ID
 * @param config - The shared budget configuration
 * @returns Array of MutateOperations (always a single operation)
 */
export function buildSharedBudgetOperations(
  customerId: string,
  config: SharedBudgetConfig,
): MutateOperation[] {
  const tempId = `-${Date.now()}`

  return [{
    operation: 'campaign_budget',
    op: 'create',
    resource: {
      resource_name: `customers/${customerId}/campaignBudgets/${tempId}`,
      name: config.name,
      amount_micros: String(toMicros(config.amount)),
      delivery_method: 2, // STANDARD
      explicitly_shared: true,
    },
  }]
}
