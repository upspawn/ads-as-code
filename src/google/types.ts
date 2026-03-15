import type {
  Budget,
  Headline,
  Description,
  CalloutText,
  Keyword,
  Targeting,
  UTMParams,
} from '../core/types.ts'
import type { RsaMarker, KeywordsMarker } from '../ai/types.ts'
import type { ImageRef } from './image-assets.ts'

// === Bidding ===

export type BiddingStrategy =
  | { readonly type: 'maximize-conversions' }
  | { readonly type: 'maximize-clicks'; readonly maxCpc?: number }
  | { readonly type: 'manual-cpc'; readonly enhancedCpc?: boolean }
  | { readonly type: 'manual-cpm' }
  | { readonly type: 'target-cpa'; readonly targetCpa: number }
  | { readonly type: 'target-cpm' }
  | { readonly type: 'target-roas'; readonly targetRoas: number }
  | { readonly type: 'target-impression-share'; readonly location: 'anywhere' | 'top' | 'absolute-top'; readonly targetPercent: number; readonly maxCpc?: number }
  | { readonly type: 'maximize-conversion-value'; readonly targetRoas?: number }

export type BiddingInput = 'maximize-conversions' | 'maximize-clicks' | 'manual-cpc' | 'manual-cpm' | 'target-cpm' | 'target-roas' | 'target-impression-share' | 'maximize-conversion-value' | BiddingStrategy

// === Ads ===

export type PinnedHeadline = { readonly text: string; readonly position: 1 | 2 | 3 }
export type PinnedDescription = { readonly text: string; readonly position: 1 | 2 }

export type RSAd = {
  readonly type: 'rsa'
  readonly headlines: Headline[]
  readonly descriptions: Description[]
  readonly finalUrl: string
  readonly utm?: UTMParams
  readonly pinnedHeadlines?: PinnedHeadline[]
  readonly pinnedDescriptions?: PinnedDescription[]
  readonly path1?: string
  readonly path2?: string
  readonly mobileUrl?: string
  readonly trackingTemplate?: string
}

export type GoogleAd = RSAd

// === Extensions ===

export type Sitelink = {
  readonly text: string
  readonly url: string
  readonly description1?: string
  readonly description2?: string
}

export type StructuredSnippet = {
  readonly header: string
  readonly values: string[]
}

export type CallExtension = {
  readonly phoneNumber: string
  readonly countryCode: string
  readonly callOnly?: boolean
}

export type PriceExtension = {
  readonly priceQualifier?: 'from' | 'up-to' | 'average'
  readonly items: Array<{
    readonly header: string
    readonly description: string
    readonly price: string
    readonly unit?: 'per-hour' | 'per-day' | 'per-week' | 'per-month' | 'per-year'
    readonly url: string
  }>
}

export type PromotionExtension = {
  readonly occasion?: string
  readonly discountType: 'monetary' | 'percent'
  readonly discountAmount?: number
  readonly discountPercent?: number
  readonly promotionCode?: string
  readonly ordersOverAmount?: number
  readonly startDate?: string
  readonly endDate?: string
  readonly url: string
}

export type ImageExtension = {
  readonly imageUrl: string
  readonly squareImageUrl?: string
  readonly altText?: string
}

// === Ad Group ===

export type GoogleAdGroup = {
  readonly keywords: Keyword[]
  readonly ads: GoogleAd[]
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly targeting?: Targeting
}

export type AdGroupInput = {
  readonly keywords: Keyword[] | KeywordsMarker | readonly (Keyword | KeywordsMarker)[]
  readonly ad: GoogleAd | GoogleAd[] | RsaMarker
  readonly negatives?: Keyword[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
}

// === Campaign ===

export type NetworkSettings = {
  readonly searchNetwork: boolean
  readonly searchPartners: boolean
  readonly displayNetwork: boolean
}

export type GoogleSearchCampaign = {
  readonly provider: 'google'
  readonly kind: 'search'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy
  readonly targeting: Targeting
  readonly negatives: Keyword[]
  readonly groups: Record<string, GoogleAdGroup>
  readonly extensions?: {
    readonly sitelinks?: Sitelink[]
    readonly callouts?: CalloutText[]
    readonly structuredSnippets?: StructuredSnippet[]
    readonly calls?: CallExtension[]
    readonly prices?: PriceExtension[]
    readonly promotions?: PromotionExtension[]
    readonly images?: ImageExtension[]
  }
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly customParameters?: Record<string, string>
  readonly networkSettings?: NetworkSettings
}

// === Unresolved Types (may contain AI markers awaiting generation) ===

export type GoogleAdGroupUnresolved = {
  readonly keywords: (Keyword | KeywordsMarker)[]
  readonly ads: (GoogleAd | RsaMarker)[]
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly targeting?: Targeting
}

export type GoogleSearchCampaignUnresolved = Omit<GoogleSearchCampaign, 'groups'> & {
  readonly groups: Record<string, GoogleAdGroupUnresolved>
}

// === Display Campaign ===

export type ResponsiveDisplayAd = {
  readonly type: 'responsive-display'
  readonly headlines: string[]
  readonly longHeadline: string
  readonly descriptions: string[]
  readonly businessName: string
  readonly finalUrl: string
  readonly marketingImages: ImageRef[]
  readonly squareMarketingImages: ImageRef[]
  readonly logoImages?: ImageRef[]
  readonly squareLogoImages?: ImageRef[]
  readonly mainColor?: string
  readonly accentColor?: string
  readonly callToAction?: string
}

export type GoogleDisplayAd = ResponsiveDisplayAd

export type GoogleDisplayAdGroup = {
  readonly ads: GoogleDisplayAd[]
  readonly status?: 'enabled' | 'paused'
  readonly targeting?: Targeting
}

export type GoogleDisplayCampaign = {
  readonly provider: 'google'
  readonly kind: 'display'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy
  readonly targeting: Targeting
  readonly negatives: Keyword[]
  readonly groups: Record<string, GoogleDisplayAdGroup>
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

// === Display Campaign Input ===

export type DisplayCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

export type DisplayAdGroupInput = {
  readonly ad: GoogleDisplayAd | GoogleDisplayAd[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
}

// === Display Campaign Builder ===

export type DisplayCampaignBuilder = GoogleDisplayCampaign & {
  group(key: string, input: DisplayAdGroupInput): DisplayCampaignBuilder
}

// === Campaign Builder ===

export type CampaignBuilder = GoogleSearchCampaignUnresolved & {
  locale(key: string, targeting: Targeting, group: AdGroupInput): CampaignBuilder
  group(key: string, group: AdGroupInput): CampaignBuilder
  sitelinks(...links: Sitelink[]): CampaignBuilder
  callouts(...texts: string[]): CampaignBuilder
  snippets(...snippets: StructuredSnippet[]): CampaignBuilder
  calls(...calls: CallExtension[]): CampaignBuilder
  prices(...prices: PriceExtension[]): CampaignBuilder
  promotions(...promos: PromotionExtension[]): CampaignBuilder
  images(...images: ImageExtension[]): CampaignBuilder
}

// === Search Campaign Input ===

export type SearchCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly customParameters?: Record<string, string>
  readonly networkSettings?: NetworkSettings
}

// === Auth Config ===

export type GoogleConfig =
  | { readonly type: 'oauth'; readonly clientId: string; readonly clientSecret: string; readonly refreshToken: string; readonly developerToken: string; readonly managerId?: string }
  | { readonly type: 'service-account'; readonly keyFile: string; readonly developerToken: string; readonly managerId?: string }
  | { readonly type: 'env' }

// === API Client ===

export type GoogleAdsRow = Record<string, unknown>

export type MutateOperation = {
  readonly operation: string
  readonly op?: 'create' | 'update' | 'remove'
  readonly resource: Record<string, unknown>
  readonly updateMask?: string
}

export type MutateResult = {
  readonly resourceName: string
  readonly error?: { readonly code: number; readonly message: string }
}

export type GoogleAdsClient = {
  query(gaql: string): Promise<GoogleAdsRow[]>
  mutate(operations: MutateOperation[]): Promise<MutateResult[]>
  readonly customerId: string
  readonly managerId?: string
}

// === Performance Max Campaign ===

export type AssetGroupInput = {
  readonly finalUrls: string[]
  readonly finalMobileUrls?: string[]
  readonly headlines: string[]        // min 3, max 15, each max 30 chars
  readonly longHeadlines: string[]    // min 1, max 5, each max 90 chars
  readonly descriptions: string[]     // min 2, max 5, each max 90 chars
  readonly businessName: string       // max 25 chars
  readonly images?: {
    readonly landscape?: ImageRef[]   // 1.91:1
    readonly square?: ImageRef[]      // 1:1
    readonly portrait?: ImageRef[]    // 4:5
  }
  readonly logos?: ImageRef[]         // 1:1
  readonly landscapeLogos?: ImageRef[] // 4:1
  readonly videos?: string[]          // YouTube URLs
  readonly callToAction?: string
  readonly status?: 'enabled' | 'paused'
  readonly path1?: string
  readonly path2?: string
  readonly audienceSignal?: Targeting  // hints for Google AI
}

export type GooglePMaxCampaign = {
  readonly provider: 'google'
  readonly kind: 'performance-max'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy   // only maximize-conversions or maximize-conversion-value
  readonly targeting: Targeting       // geo + language only
  readonly assetGroups: Record<string, AssetGroupInput>
  readonly urlExpansion?: boolean     // default true
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

// === Performance Max Campaign Input ===

export type PMaxCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
  readonly urlExpansion?: boolean
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

// === Performance Max Campaign Builder ===

export type PMaxCampaignBuilder = GooglePMaxCampaign & {
  assetGroup(key: string, input: AssetGroupInput): PMaxCampaignBuilder
}

// === Shopping Campaign ===

export type ShoppingSetting = {
  readonly merchantId: number
  readonly campaignPriority?: number  // 0-2, default 0
  readonly enableLocal?: boolean
  readonly feedLabel?: string
}

export type ShoppingAdGroup = {
  readonly status?: 'enabled' | 'paused'
  readonly bid?: number  // default CPC bid in currency units
}

export type GoogleShoppingCampaign = {
  readonly provider: 'google'
  readonly kind: 'shopping'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy
  readonly targeting: Targeting
  readonly shoppingSetting: ShoppingSetting
  readonly groups: Record<string, ShoppingAdGroup>
  readonly negatives: Keyword[]
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

export type ShoppingCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly merchantId: number
  readonly campaignPriority?: number
  readonly enableLocal?: boolean
  readonly feedLabel?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}

export type ShoppingCampaignBuilder = GoogleShoppingCampaign & {
  group(key: string, input: ShoppingAdGroup): ShoppingCampaignBuilder
}

// === Demand Gen Campaign ===

export type DemandGenMultiAssetAd = {
  readonly type: 'demand-gen-multi-asset'
  readonly headlines: string[]          // max 5, each max 40 chars
  readonly descriptions: string[]       // max 5, each max 90 chars
  readonly businessName: string
  readonly finalUrl: string
  readonly marketingImages?: ImageRef[]    // landscape 1.91:1
  readonly squareMarketingImages?: ImageRef[] // square 1:1
  readonly portraitMarketingImages?: ImageRef[] // portrait 4:5
  readonly logoImages?: ImageRef[]        // square 1:1
  readonly callToAction?: string
}

export type DemandGenCarouselCard = {
  readonly headline: string
  readonly finalUrl: string
  readonly marketingImage?: ImageRef
  readonly squareMarketingImage?: ImageRef
  readonly callToAction?: string
}

export type DemandGenCarouselAd = {
  readonly type: 'demand-gen-carousel'
  readonly headline: string
  readonly description: string
  readonly businessName: string
  readonly finalUrl: string
  readonly logoImage?: ImageRef
  readonly callToAction?: string
  readonly cards: DemandGenCarouselCard[]  // min 2, max 10
}

export type DemandGenAd = DemandGenMultiAssetAd | DemandGenCarouselAd

export type DemandGenChannelControls = {
  readonly youtube?: boolean      // default true
  readonly discover?: boolean     // default true
  readonly gmail?: boolean        // default true
  readonly display?: boolean      // default true
  readonly youtubeShorts?: boolean // default true
}

export type DemandGenAdGroup = {
  readonly ads: DemandGenAd[]
  readonly status?: 'enabled' | 'paused'
  readonly targeting?: Targeting
  readonly channels?: DemandGenChannelControls
}

export type GoogleDemandGenCampaign = {
  readonly provider: 'google'
  readonly kind: 'demand-gen'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy
  readonly targeting: Targeting
  readonly groups: Record<string, DemandGenAdGroup>
  readonly negatives: Keyword[]
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
}

// === Demand Gen Campaign Input ===

export type DemandGenCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
}

export type DemandGenAdGroupInput = {
  readonly ad: DemandGenAd | DemandGenAd[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
  readonly channels?: DemandGenChannelControls
}

// === Demand Gen Campaign Builder ===

export type DemandGenCampaignBuilder = GoogleDemandGenCampaign & {
  group(key: string, input: DemandGenAdGroupInput): DemandGenCampaignBuilder
}

// === Smart Campaign ===

export type SmartCampaignAd = {
  readonly type: 'smart'
  readonly headlines: [string, string, string]  // exactly 3, max 30 chars
  readonly descriptions: [string, string]       // exactly 2, max 90 chars
}

export type GoogleSmartCampaign = {
  readonly provider: 'google'
  readonly kind: 'smart'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly businessName: string
  readonly businessProfile?: string  // 'locations/{id}'
  readonly finalUrl: string
  readonly language: string
  readonly keywordThemes: string[]
  readonly ad: SmartCampaignAd
}

export type SmartCampaignInput = {
  readonly budget: Budget
  readonly status?: 'enabled' | 'paused'
  readonly businessName: string
  readonly businessProfile?: string
  readonly finalUrl: string
  readonly language?: string
  readonly keywordThemes: string[]
  readonly ad: SmartCampaignAd
}

// === App Campaign ===

export type AppAdInfo = {
  readonly type: 'app'
  readonly headlines: string[]    // max 5, each max 30 chars
  readonly descriptions: string[] // max 5, each max 90 chars
  readonly images?: ImageRef[]
  readonly videos?: string[]      // YouTube URLs
}

export type GoogleAppCampaign = {
  readonly provider: 'google'
  readonly kind: 'app'
  readonly name: string
  readonly status: 'enabled' | 'paused'
  readonly budget: Budget
  readonly bidding: BiddingStrategy
  readonly targeting: Targeting
  readonly appId: string
  readonly appStore: 'google' | 'apple'
  readonly goal: 'installs' | 'in-app-actions' | 'pre-registration'
  readonly ad: AppAdInfo
  readonly startDate?: string
  readonly endDate?: string
}

export type AppCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
  readonly appId: string
  readonly appStore: 'google' | 'apple'
  readonly goal?: 'installs' | 'in-app-actions' | 'pre-registration'
  readonly ad: AppAdInfo
  readonly startDate?: string
  readonly endDate?: string
}

// === Campaign union (extensible for Meta) ===

export type GoogleCampaign = GoogleSearchCampaign | GoogleDisplayCampaign | GooglePMaxCampaign | GoogleShoppingCampaign | GoogleDemandGenCampaign | GoogleSmartCampaign | GoogleAppCampaign
export type Campaign = GoogleSearchCampaign | GoogleDisplayCampaign | GooglePMaxCampaign | GoogleShoppingCampaign | GoogleDemandGenCampaign | GoogleSmartCampaign | GoogleAppCampaign
