// @upspawn/ads — public SDK surface
// Populated as modules are implemented

export type {
  Headline,
  Description,
  CalloutText,
  Budget,
  DailyBudget,
  MonthlyBudget,
  LifetimeBudget,
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
  daily, monthly, lifetime, eur, usd,
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

// === Meta Helpers ===

export {
  metaTargeting,
  age,
  audience,
  interests,
  excludeAudience,
  lookalike,
} from './helpers/meta-targeting.ts'

export type {
  AudienceMarker,
  ExcludedAudienceMarker,
  InterestMarker,
  LookalikeConfig,
  LookalikeMarker,
  MetaTargetingRule,
} from './helpers/meta-targeting.ts'

export {
  image as metaImage,
  video as metaVideo,
  carousel,
} from './helpers/meta-creative.ts'

export {
  lowestCost,
  costCap,
  bidCap,
  minRoas,
} from './helpers/meta-bidding.ts'

export {
  automatic,
  manual,
} from './helpers/meta-placement.ts'

// === Meta Types ===

export type {
  Objective,
  OptimizationGoalMap,
  BidStrategy,
  InterestTarget,
  BehaviorTarget,
  MetaDemographicTarget,
  ConnectionTarget,
  MetaTargeting,
  MetaPlatform,
  PlacementPosition,
  MetaPlacements,
  ImageAd,
  VideoAd,
  CarouselCard,
  CarouselAd,
  CollectionAd,
  MetaCreative,
  MetaCTA,
  AdSetSchedule,
  DayPartRule,
  ConversionConfig,
  DSAConfig,
  SpecialAdCategory,
  PromotedObject,
  MetaCampaignConfig,
  AdSetConfig,
  AdSetContent,
} from './meta/types.ts'

// === Providers ===

export { google } from './google/index.ts'
