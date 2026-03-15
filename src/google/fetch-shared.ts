import type { Resource, ResourceKind } from '../core/types.ts'
import type { GoogleAdsClient, GoogleAdsRow } from './types.ts'
import { slugify } from '../core/flatten.ts'

// ─── Helpers ────────────────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>, platformId?: string): Resource {
  return platformId ? { kind, path, properties, platformId } : { kind, path, properties }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '')
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}

// ─── Shared Negative Lists ──────────────────────────────────

const SHARED_SET_QUERY = `
  SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.status
  FROM shared_set
  WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'
`

const SHARED_CRITERIA_QUERY = `
  SELECT shared_set.id, shared_criterion.keyword.text, shared_criterion.keyword.match_type
  FROM shared_criterion
  WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
`

const CAMPAIGN_SHARED_SET_QUERY = `
  SELECT campaign.id, campaign.name, campaign_shared_set.shared_set
  FROM campaign_shared_set
  WHERE campaign_shared_set.status = 'ENABLED'
`

/** Match type API enum values → SDK strings */
const MATCH_TYPE_MAP: Record<number | string, string> = {
  2: 'EXACT', 3: 'PHRASE', 4: 'BROAD',
  'EXACT': 'EXACT', 'PHRASE': 'PHRASE', 'BROAD': 'BROAD',
}

/**
 * Fetch all shared negative keyword lists and their criteria.
 * Returns sharedSet + sharedCriterion resources.
 */
export async function fetchSharedNegativeLists(client: GoogleAdsClient): Promise<Resource[]> {
  const [setRows, criteriaRows] = await Promise.all([
    client.query(SHARED_SET_QUERY),
    client.query(SHARED_CRITERIA_QUERY),
  ])

  const resources: Resource[] = []

  // Group criteria by shared set ID
  const criteriaBySetId = new Map<string, GoogleAdsRow[]>()
  for (const row of criteriaRows) {
    const sharedSet = row.shared_set as Record<string, unknown> | undefined
    const setId = str(sharedSet?.id)
    const existing = criteriaBySetId.get(setId) ?? []
    existing.push(row)
    criteriaBySetId.set(setId, existing)
  }

  for (const setRow of setRows) {
    const sharedSet = setRow.shared_set as Record<string, unknown> | undefined
    const setId = str(sharedSet?.id)
    const setName = str(sharedSet?.name)
    const setPath = `shared:${slugify(setName)}`

    resources.push(resource('sharedSet', setPath, {
      name: setName,
      type: 'NEGATIVE_KEYWORDS',
    }, `customers/${client.customerId}/sharedSets/${setId}`))

    // Add criteria for this set
    const criteria = criteriaBySetId.get(setId) ?? []
    for (const criterionRow of criteria) {
      const sharedCriterion = criterionRow.shared_criterion as Record<string, unknown> | undefined
      const keyword = sharedCriterion?.keyword as Record<string, unknown> | undefined
      const text = str(keyword?.text)
      const matchType = MATCH_TYPE_MAP[keyword?.match_type as string | number] ?? 'BROAD'
      const kwPath = `${setPath}/neg:${text.toLowerCase()}:${matchType}`

      resources.push(resource('sharedCriterion', kwPath, {
        text,
        matchType,
      }))
    }
  }

  return resources
}

// ─── Conversion Actions ─────────────────────────────────────

const CONVERSION_ACTION_QUERY = `
  SELECT conversion_action.id, conversion_action.name, conversion_action.type,
    conversion_action.category, conversion_action.counting_type,
    conversion_action.value_settings.default_value,
    conversion_action.value_settings.always_use_default_value,
    conversion_action.value_settings.currency_code,
    conversion_action.primary_for_goal, conversion_action.status,
    conversion_action.click_through_lookback_window_days,
    conversion_action.attribution_model_settings.attribution_model
  FROM conversion_action
  WHERE conversion_action.status = 'ENABLED'
`

/** API type enum → SDK type string */
const CONVERSION_TYPE_REVERSE: Record<number | string, string> = {
  1: 'ad-call', 2: 'click-to-call', 6: 'webpage', 10: 'import',
  'AD_CALL': 'ad-call', 'CLICK_TO_CALL': 'click-to-call',
  'WEBPAGE': 'webpage', 'UPLOAD': 'import',
}

/** API category enum → SDK category string */
const CONVERSION_CATEGORY_REVERSE: Record<number | string, string> = {
  1: 'page-view', 2: 'purchase', 3: 'add-to-cart', 7: 'download',
  13: 'other', 18: 'lead', 24: 'contact', 27: 'begin-checkout',
  28: 'signup', 29: 'subscribe',
  'PAGE_VIEW': 'page-view', 'PURCHASE': 'purchase', 'ADD_TO_CART': 'add-to-cart',
  'DOWNLOAD': 'download', 'DEFAULT': 'other', 'LEAD': 'lead',
  'CONTACT': 'contact', 'BEGIN_CHECKOUT': 'begin-checkout',
  'SIGNUP': 'signup', 'SUBSCRIBE_PAID': 'subscribe',
}

/** API counting type enum → SDK counting string */
const COUNTING_TYPE_REVERSE: Record<number | string, string> = {
  2: 'one-per-click', 3: 'many-per-click',
  'ONE_PER_CLICK': 'one-per-click', 'MANY_PER_CLICK': 'many-per-click',
}

/** API attribution model enum → SDK attribution string */
const ATTRIBUTION_REVERSE: Record<number | string, string> = {
  6: 'data-driven', 101: 'last-click',
  'GOOGLE_ADS_LAST_CLICK': 'last-click', 'DATA_DRIVEN': 'data-driven',
}

/**
 * Fetch all enabled conversion actions.
 * Returns conversionAction resources.
 */
export async function fetchConversionActions(client: GoogleAdsClient): Promise<Resource[]> {
  const rows = await client.query(CONVERSION_ACTION_QUERY)
  const resources: Resource[] = []

  for (const row of rows) {
    const action = row.conversion_action as Record<string, unknown> | undefined
    if (!action) continue

    const id = str(action.id)
    const name = str(action.name)
    const type = CONVERSION_TYPE_REVERSE[action.type as number | string] ?? 'webpage'
    const category = CONVERSION_CATEGORY_REVERSE[action.category as number | string] ?? 'other'
    const counting = COUNTING_TYPE_REVERSE[action.counting_type as number | string] ?? 'one-per-click'

    const valueSettings = action.value_settings as Record<string, unknown> | undefined
    const attrSettings = action.attribution_model_settings as Record<string, unknown> | undefined

    const props: Record<string, unknown> = {
      name,
      type,
      category,
      counting,
    }

    // Value settings
    if (valueSettings) {
      const defaultVal = num(valueSettings.default_value)
      const currencyCode = str(valueSettings.currency_code)
      const alwaysDefault = valueSettings.always_use_default_value as boolean | undefined
      if (defaultVal > 0 || currencyCode) {
        props.value = {
          ...(defaultVal > 0 && { default: defaultVal }),
          ...(currencyCode && { currency: currencyCode }),
          ...(alwaysDefault === false && { useDynamic: true }),
        }
      }
    }

    // Attribution
    if (attrSettings?.attribution_model !== undefined) {
      const attr = ATTRIBUTION_REVERSE[attrSettings.attribution_model as number | string]
      if (attr) props.attribution = attr
    }

    // Lookback days
    const lookback = num(action.click_through_lookback_window_days)
    if (lookback > 0 && lookback !== 30) {
      props.lookbackDays = lookback
    }

    // Primary
    if (action.primary_for_goal !== undefined) {
      props.primary = action.primary_for_goal as boolean
    }

    resources.push(resource('conversionAction', `conversion:${slugify(name)}`, props, `customers/${client.customerId}/conversionActions/${id}`))
  }

  return resources
}

// ─── Shared Budgets ─────────────────────────────────────────

const SHARED_BUDGET_QUERY = `
  SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros,
    campaign_budget.explicitly_shared, campaign_budget.delivery_method, campaign_budget.status
  FROM campaign_budget
  WHERE campaign_budget.explicitly_shared = TRUE AND campaign_budget.status = 'ENABLED'
`

/**
 * Fetch all explicitly shared budgets.
 * Returns sharedBudget resources.
 */
export async function fetchSharedBudgets(client: GoogleAdsClient): Promise<Resource[]> {
  const rows = await client.query(SHARED_BUDGET_QUERY)
  const resources: Resource[] = []

  for (const row of rows) {
    const budget = row.campaign_budget as Record<string, unknown> | undefined
    if (!budget) continue

    const id = str(budget.id)
    const name = str(budget.name)
    const amountMicros = num(budget.amount_micros)
    const amount = amountMicros / 1_000_000

    resources.push(resource('sharedBudget', `budget:${slugify(name)}`, {
      name,
      amount,
      currency: 'EUR', // Will be resolved from config at a higher level
      period: 'daily',
    }, `customers/${client.customerId}/campaignBudgets/${id}`))
  }

  return resources
}
