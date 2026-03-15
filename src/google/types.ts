import type {
  Budget,
  Headline,
  Description,
  CalloutText,
  Keyword,
  Targeting,
  UTMParams,
} from '../core/types.ts'

// === Bidding ===

export type BiddingStrategy =
  | { readonly type: 'maximize-conversions' }
  | { readonly type: 'maximize-clicks'; readonly maxCpc?: number }
  | { readonly type: 'manual-cpc'; readonly enhancedCpc?: boolean }
  | { readonly type: 'target-cpa'; readonly targetCpa: number }
  | { readonly type: 'target-roas'; readonly targetRoas: number }
  | { readonly type: 'target-impression-share'; readonly location: 'anywhere' | 'top' | 'absolute-top'; readonly targetPercent: number; readonly maxCpc?: number }
  | { readonly type: 'maximize-conversion-value'; readonly targetRoas?: number }

export type BiddingInput = 'maximize-conversions' | 'maximize-clicks' | 'manual-cpc' | 'target-roas' | 'target-impression-share' | 'maximize-conversion-value' | BiddingStrategy

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
  readonly keywords: Keyword[]
  readonly ad: GoogleAd | GoogleAd[]
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

// === Campaign Builder ===

export type CampaignBuilder = GoogleSearchCampaign & {
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

// === Campaign union (extensible for Meta) ===

export type Campaign = GoogleSearchCampaign
