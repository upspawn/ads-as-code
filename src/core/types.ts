// === Branded Types ===

export type Headline = string & { readonly __brand: 'Headline' }
export type Description = string & { readonly __brand: 'Description' }
export type CalloutText = string & { readonly __brand: 'Callout' }

// === Budget ===

export type DailyBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'daily' }
export type MonthlyBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'monthly' }
export type LifetimeBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'lifetime'; readonly endTime: string }
export type Budget = DailyBudget | MonthlyBudget | LifetimeBudget

// === Keywords ===

export type KeywordOptions = {
  readonly bid?: number
  readonly finalUrl?: string
  readonly status?: 'enabled' | 'paused'
}

export type ExactKeyword = { readonly text: string; readonly matchType: 'EXACT' } & KeywordOptions
export type PhraseKeyword = { readonly text: string; readonly matchType: 'PHRASE' } & KeywordOptions
export type BroadKeyword = { readonly text: string; readonly matchType: 'BROAD' } & KeywordOptions
export type Keyword = ExactKeyword | PhraseKeyword | BroadKeyword

export type KeywordInput = string | ({ readonly text: string } & KeywordOptions)

// === Targeting ===

export type CountryCode = 'US' | 'DE' | 'CA' | 'GB' | 'AU' | 'AT' | 'CH' | 'FR' | 'IT' | 'ES' | 'PT' | 'PL' | 'JP' | 'KR' | 'BR' | 'NL' | 'SE' | 'NO' | 'DK' | 'FI' | (string & {})
export type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | 'pt' | 'pl' | 'ja' | 'ko' | 'nl' | 'sv' | 'no' | 'da' | 'fi' | (string & {})
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type GeoTarget = { readonly type: 'geo'; readonly countries: CountryCode[] }
export type LanguageTarget = { readonly type: 'language'; readonly languages: LanguageCode[] }
export type ScheduleTarget = { readonly type: 'schedule'; readonly days?: Day[]; readonly startHour?: number; readonly endHour?: number }

export type DeviceTarget = { readonly type: 'device'; readonly device: 'mobile' | 'desktop' | 'tablet'; readonly bidAdjustment: number }
export type RegionTarget = { readonly type: 'region'; readonly regions: string[] }
export type CityTarget = { readonly type: 'city'; readonly cities: string[] }
export type RadiusTarget = { readonly type: 'radius'; readonly latitude: number; readonly longitude: number; readonly radiusKm: number }
export type PresenceTarget = { readonly type: 'presence'; readonly mode: 'presence' | 'presence-or-interest' }

export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'undetermined'
export type Gender = 'male' | 'female' | 'undetermined'
export type IncomeRange = 'top-10%' | '11-20%' | '21-30%' | '31-40%' | '41-50%' | 'lower-50%' | 'undetermined'
export type ParentalStatus = 'parent' | 'not-parent' | 'undetermined'

export type DemographicTarget = {
  readonly type: 'demographic'
  readonly ageRanges?: AgeRange[]
  readonly genders?: Gender[]
  readonly incomes?: IncomeRange[]
  readonly parentalStatuses?: ParentalStatus[]
}

export type ScheduleBidTarget = {
  readonly type: 'schedule-bid'
  readonly day: Day
  readonly startHour: number
  readonly endHour: number
  readonly bidAdjustment: number
}

export type AudienceRef =
  | { readonly kind: 'remarketing'; readonly listId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'custom'; readonly audienceId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'in-market'; readonly categoryId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'affinity'; readonly categoryId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'customer-match'; readonly listId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'combined'; readonly audienceId: string; readonly name?: string; readonly bidAdjustment?: number }
  | { readonly kind: 'similar'; readonly listId: string; readonly name?: string; readonly bidAdjustment?: number }

export type AudienceTarget = {
  readonly type: 'audience'
  readonly audiences: AudienceRef[]
  readonly mode?: 'targeting' | 'observation'
}

export type TargetingRule =
  | GeoTarget
  | LanguageTarget
  | ScheduleTarget
  | DeviceTarget
  | RegionTarget
  | CityTarget
  | RadiusTarget
  | PresenceTarget
  | DemographicTarget
  | ScheduleBidTarget
  | AudienceTarget

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

export type ResourceKind = 'campaign' | 'adGroup' | 'adSet' | 'keyword' | 'ad' | 'creative' | 'sitelink' | 'callout' | 'negative'

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

// === Apply Result ===

export type ApplyResult = {
  readonly succeeded: Change[]
  readonly failed: { change: Change; error: Error }[]
  readonly skipped: Change[]
}

// === Config ===

import type { AiConfig } from '../ai/types.ts'

export type AdsConfig = {
  readonly google?: GoogleProviderConfig
  readonly meta?: MetaProviderConfig
  readonly cache?: string
  readonly ai?: AiConfig
}

export type GoogleProviderConfig = {
  readonly customerId: string
  readonly managerId?: string
  readonly credentials?: string
}

export type MetaProviderConfig = {
  readonly accountId: string
  readonly pageId: string
  readonly pixelId?: string
  readonly apiVersion?: string
  readonly dsa?: { readonly beneficiary: string; readonly payor: string }
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
