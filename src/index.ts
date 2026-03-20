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
  PlacementTarget,
  TopicTarget,
  ContentKeywordTarget,
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
  GoogleCampaign,
  GoogleDisplayCampaign,
  GoogleDisplayAdGroup,
  GoogleDisplayAd,
  ResponsiveDisplayAd,
  DisplayCampaignInput,
  DisplayAdGroupInput,
  DisplayCampaignBuilder,
  GooglePMaxCampaign,
  AssetGroupInput,
  PMaxCampaignInput,
  PMaxCampaignBuilder,
  GoogleDemandGenCampaign,
  DemandGenMultiAssetAd,
  DemandGenCarouselAd,
  DemandGenCarouselCard,
  DemandGenAd,
  DemandGenChannelControls,
  DemandGenAdGroup,
  DemandGenCampaignInput,
  DemandGenAdGroupInput,
  DemandGenCampaignBuilder,
  GoogleSmartCampaign,
  SmartCampaignAd,
  SmartCampaignInput,
  GoogleAppCampaign,
  AppAdInfo,
  AppCampaignInput,
  GoogleVideoCampaign,
} from './google/types.ts'

export type {
  ImageRef,
  ImageAspectRatio,
} from './google/image-assets.ts'

export type {
  SharedNegativeList,
  ConversionActionConfig,
  ConversionActionType,
  ConversionCategory,
  ConversionCounting,
  AttributionModel,
  SharedBudgetConfig,
} from './google/shared-types.ts'

export {
  sharedNegatives,
  conversionAction,
  sharedBudget,
} from './google/shared-types.ts'

export {
  landscape,
  square,
  portrait,
  logo,
  logoLandscape,
} from './google/image-assets.ts'

// === Helpers ===

export {
  exact, phrase, broad, keywords,
  daily, monthly, lifetime, eur, usd,
  geo, languages, weekdays, hours, device, regions, cities, radius, presence, demographics, scheduleBid, targeting,
  audiences, audienceTargeting, remarketing, customAudience, inMarket, affinity, customerMatch,
  placements, topics, contentKeywords,
  headlines, descriptions, rsa, smartAd, appAd,
  responsiveDisplay,
  demandGenMultiAsset, demandGenCarousel, carouselCard,
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
  BoostedPostAd,
  MetaCampaignConfig,
  AdSetConfig,
  AdSetContent,
} from './meta/types.ts'

export { reddit, RedditCampaignBuilder } from './reddit/index.ts'
export type {
  Objective as RedditObjective,
  RedditCampaign,
  RedditAdGroup,
  RedditCampaignConfig,
  AdGroupConfig as RedditAdGroupConfig,
  RedditAd,
  RedditBidStrategy,
  RedditTargetingRule,
  RedditPlacement,
  RedditCTA,
  RedditSchedule,
  RedditProviderConfig,
} from './reddit/types.ts'

// === Meta Helpers ===

export {
  image as metaImage,
  video as metaVideo,
  carousel,
  boostedPost,
} from './helpers/meta-creative.ts'

export {
  age,
  audience,
  excludeAudience,
  interests,
  lookalike,
  metaTargeting,
} from './helpers/meta-targeting.ts'

export {
  manual,
  automatic,
} from './helpers/meta-placement.ts'

export {
  lowestCost,
  costCap,
  bidCap,
  minRoas,
} from './helpers/meta-bidding.ts'

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

// === Assets ===

export { asset, isAssetMarker } from './core/asset.ts'
export type { AssetMarker, AssetOptions, AssetResolution } from './core/asset.ts'
