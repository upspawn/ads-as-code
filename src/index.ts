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

// === Providers ===

export { google } from './google/index.ts'
export { meta, MetaCampaignBuilder } from './meta/index.ts'
export type { MetaCampaign, MetaAdSet } from './meta/index.ts'
export type {
  Objective,
  MetaTargeting,
  MetaCTA,
  BidStrategy,
  MetaCreative,
  ImageAd,
  VideoAd,
  CarouselAd,
  MetaCampaignConfig,
  AdSetConfig,
  AdSetContent,
} from './meta/types.ts'

// === Meta Helpers ===

export {
  image as metaImage,
  video as metaVideo,
  carousel,
} from './helpers/meta-creative.ts'

export {
  age,
  audience,
  excludeAudience,
  interests,
  metaTargeting,
} from './helpers/meta-targeting.ts'

export {
  manual,
} from './helpers/meta-placement.ts'

export {
  lowestCost,
  costCap,
  bidCap,
  minRoas,
} from './helpers/meta-bidding.ts'

export {
  lifetime,
} from './helpers/meta-budget.ts'

// === AI ===

export { ai } from './ai/index.ts'

export type {
  AiMarker,
  RsaMarker,
  KeywordsMarker,
  MetaCopyMarker,
  InterestsMarker,
  RsaMarkerInput,
  MetaCopyMarkerInput,
  RsaOutput,
  KeywordsOutput,
  MetaCopyOutput,
  InterestsOutput,
  RsaPromptContext,
  MetaPromptContext,
} from './ai/index.ts'

export {
  isRsaMarker,
  isKeywordsMarker,
  isMetaCopyMarker,
  isInterestsMarker,
  rsaSchema,
  keywordsSchema,
  metaCopySchema,
  interestsSchema,
  compileRsaPrompt,
  compileKeywordsPrompt,
  compileMetaCopyPrompt,
  compileInterestsPrompt,
} from './ai/index.ts'
