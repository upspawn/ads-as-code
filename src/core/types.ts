// === Branded Types ===

export type Headline = string & { readonly __brand: 'Headline' }
export type Description = string & { readonly __brand: 'Description' }
export type CalloutText = string & { readonly __brand: 'Callout' }

// === Budget ===

export type DailyBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'daily' }
export type MonthlyBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'monthly' }
export type Budget = DailyBudget | MonthlyBudget

// === Keywords ===

export type ExactKeyword = { readonly text: string; readonly matchType: 'EXACT' }
export type PhraseKeyword = { readonly text: string; readonly matchType: 'PHRASE' }
export type BroadKeyword = { readonly text: string; readonly matchType: 'BROAD' }
export type Keyword = ExactKeyword | PhraseKeyword | BroadKeyword

// === Targeting ===

export type CountryCode = 'US' | 'DE' | 'CA' | 'GB' | 'AU' | 'AT' | 'CH' | 'FR' | 'IT' | 'ES' | 'PT' | 'PL' | 'JP' | 'KR' | 'BR' | 'NL' | 'SE' | 'NO' | 'DK' | 'FI' | (string & {})
export type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | 'pt' | 'pl' | 'ja' | 'ko' | 'nl' | 'sv' | 'no' | 'da' | 'fi' | (string & {})
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type GeoTarget = { readonly type: 'geo'; readonly countries: CountryCode[] }
export type LanguageTarget = { readonly type: 'language'; readonly languages: LanguageCode[] }
export type ScheduleTarget = { readonly type: 'schedule'; readonly days?: Day[]; readonly startHour?: number; readonly endHour?: number }
export type TargetingRule = GeoTarget | LanguageTarget | ScheduleTarget

export type Targeting = { readonly rules: TargetingRule[] }

// === UTM ===

export type UTMParams = {
  readonly source?: string
  readonly medium?: string
  readonly campaign?: string
  readonly content?: string
  readonly term?: string
}

// === Diff Engine: Resource Model ===

export type ResourceKind = 'campaign' | 'adGroup' | 'keyword' | 'ad' | 'sitelink' | 'callout' | 'negative'

export type Resource = {
  readonly kind: ResourceKind
  readonly path: string
  readonly properties: Record<string, unknown>
  readonly platformId?: string
}

export type PropertyChange = {
  readonly field: string
  readonly from: unknown
  readonly to: unknown
}

export type Change =
  | { readonly op: 'create'; readonly resource: Resource }
  | { readonly op: 'update'; readonly resource: Resource; readonly changes: PropertyChange[] }
  | { readonly op: 'delete'; readonly resource: Resource }
  | { readonly op: 'drift'; readonly resource: Resource; readonly changes: PropertyChange[] }

export type Changeset = {
  readonly creates: Change[]
  readonly updates: Change[]
  readonly deletes: Change[]
  readonly drift: Change[]
}

// === Config ===

export type AdsConfig = {
  readonly google?: GoogleProviderConfig
  readonly meta?: MetaProviderConfig
  readonly cache?: string
}

export type GoogleProviderConfig = {
  readonly customerId: string
  readonly managerId?: string
  readonly credentials?: string
}

export type MetaProviderConfig = {
  readonly accountId: string
  readonly credentials?: string
}

// === Errors ===

export type AdsError =
  | { readonly type: 'auth'; readonly message: string }
  | { readonly type: 'quota'; readonly message: string; readonly retryAfter: number }
  | { readonly type: 'validation'; readonly field: string; readonly message: string }
  | { readonly type: 'conflict'; readonly resource: Resource; readonly message: string }
  | { readonly type: 'policy'; readonly resource: Resource; readonly message: string }
  | { readonly type: 'budget'; readonly message: string }
  | { readonly type: 'api'; readonly code: number; readonly message: string }
