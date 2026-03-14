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

export type BiddingInput = 'maximize-conversions' | 'maximize-clicks' | 'manual-cpc' | BiddingStrategy

// === Ads ===

export type RSAd = {
  readonly type: 'rsa'
  readonly headlines: Headline[]
  readonly descriptions: Description[]
  readonly finalUrl: string
  readonly utm?: UTMParams
}

export type GoogleAd = RSAd

// === Extensions ===

export type Sitelink = {
  readonly text: string
  readonly url: string
  readonly description1?: string
  readonly description2?: string
}

// === Ad Group ===

export type GoogleAdGroup = {
  readonly keywords: Keyword[]
  readonly ads: GoogleAd[]
  readonly status?: 'enabled' | 'paused'
  readonly targeting?: Targeting
}

export type AdGroupInput = {
  readonly keywords: Keyword[]
  readonly ad: GoogleAd | GoogleAd[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
}

// === Campaign ===

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
  }
}

// === Campaign Builder ===

export type CampaignBuilder = GoogleSearchCampaign & {
  locale(key: string, targeting: Targeting, group: AdGroupInput): CampaignBuilder
  group(key: string, group: AdGroupInput): CampaignBuilder
  sitelinks(...links: Sitelink[]): CampaignBuilder
  callouts(...texts: string[]): CampaignBuilder
}

// === Search Campaign Input ===

export type SearchCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
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
