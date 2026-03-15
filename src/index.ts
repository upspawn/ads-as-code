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
  DeviceTarget,
  RegionTarget,
  CityTarget,
  RadiusTarget,
  PresenceTarget,
  DemographicTarget,
  ScheduleBidTarget,
  AudienceRef,
  AudienceTarget,
  AgeRange,
  Gender,
  IncomeRange,
  ParentalStatus,
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
  StructuredSnippet,
  CallExtension,
  PriceExtension,
  PromotionExtension,
  ImageExtension,
  BiddingStrategy,
  BiddingInput,
  AdGroupInput,
  CampaignBuilder,
  SearchCampaignInput,
  GoogleConfig,
  GoogleAdsClient,
  Campaign,
  GoogleAdGroupUnresolved,
  GoogleSearchCampaignUnresolved,
} from './google/types.ts'

// === Helpers ===

export {
  exact, phrase, broad, keywords,
  daily, monthly, eur, usd,
  geo, languages, weekdays, hours, device, regions, cities, radius, presence, demographics, scheduleBid, targeting,
  audiences, audienceTargeting, remarketing, customAudience, inMarket, affinity, customerMatch,
  headlines, descriptions, rsa,
  link, sitelinks, callouts, snippet, call, price, promotion, image,
  negatives,
  url,
} from './helpers/index.ts'

export type { UrlResult } from './helpers/url.ts'

// === Config ===

export { defineConfig } from './core/config.ts'

// === AI ===

export { ai } from './ai/index.ts'
export { expand } from './ai/index.ts'
export type {
  AiConfig,
  AiJudgeConfig,
  AiOptimizeConfig,
  AiMarker,
  RsaMarker,
  KeywordsMarker,
  ExpandConfig,
  ExpandEntry,
  ExpansionTarget,
  LockFile,
  LockSlot,
  GenerateResult,
  StaleSlot,
} from './ai/index.ts'

// === Providers ===

export { google } from './google/index.ts'
