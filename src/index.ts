// @upspawn/ads — public SDK surface
// Populated as modules are implemented

export type {
  Headline,
  Description,
  CalloutText,
  Budget,
  DailyBudget,
  MonthlyBudget,
  Keyword,
  ExactKeyword,
  PhraseKeyword,
  BroadKeyword,
  Targeting,
  TargetingRule,
  GeoTarget,
  LanguageTarget,
  ScheduleTarget,
  CountryCode,
  LanguageCode,
  Day,
  UTMParams,
  Resource,
  Change,
  Changeset,
  PropertyChange,
  AdsConfig,
  AdsError,
} from './core/types.ts'

export type {
  GoogleSearchCampaign,
  GoogleAdGroup,
  GoogleAd,
  RSAd,
  Sitelink,
  BiddingStrategy,
  BiddingInput,
  AdGroupInput,
  CampaignBuilder,
  SearchCampaignInput,
  GoogleConfig,
  GoogleAdsClient,
  Campaign,
} from './google/types.ts'

// === Helpers ===

export {
  exact, phrase, broad, keywords,
  daily, monthly, eur, usd,
  geo, languages, weekdays, hours, targeting,
  headlines, descriptions, rsa,
  link, sitelinks, callouts,
  negatives,
  url,
} from './helpers/index.ts'

export type { UrlResult } from './helpers/url.ts'

// === Config ===

export { defineConfig } from './core/config.ts'

// === Providers ===

export { google } from './google/index.ts'
