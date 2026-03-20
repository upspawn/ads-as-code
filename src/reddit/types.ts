// src/reddit/types.ts
import type { Budget } from '../core/types'

// --- Objectives ---

export type Objective =
  | 'awareness'
  | 'traffic'
  | 'engagement'
  | 'video-views'
  | 'app-installs'
  | 'conversions'
  | 'leads'

export type OptimizationGoalMap = {
  readonly awareness: 'REACH' | 'IMPRESSIONS'
  readonly traffic: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS'
  readonly engagement: 'POST_ENGAGEMENT' | 'IMPRESSIONS'
  readonly 'video-views': 'VIDEO_VIEWS' | 'THRUPLAY'
  readonly 'app-installs': 'APP_INSTALLS' | 'APP_EVENTS'
  readonly conversions: 'CONVERSIONS' | 'VALUE'
  readonly leads: 'LEADS' | 'CONVERSIONS'
}

// --- Bidding ---

export type RedditBidStrategy =
  | { readonly type: 'LOWEST_COST' }
  | { readonly type: 'COST_CAP'; readonly amount: number }
  | { readonly type: 'MANUAL_BID'; readonly amount: number }

// --- CTA ---

export type RedditCTA =
  | 'INSTALL' | 'DOWNLOAD' | 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW'
  | 'BOOK_NOW' | 'CONTACT_US' | 'GET_QUOTE' | 'SUBSCRIBE'
  | 'APPLY_NOW' | 'WATCH_MORE' | 'PLAY_NOW' | 'SEE_MENU'

// --- Schedule ---

export type DaypartRule = {
  readonly days: readonly ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  readonly startHour: number
  readonly endHour: number
}

export type RedditSchedule = {
  readonly start: string
  readonly end?: string
  readonly dayparting?: readonly DaypartRule[]
}

// --- Targeting ---

export type RedditTargetingRule =
  | { readonly _type: 'subreddits'; readonly names: readonly string[] }
  | { readonly _type: 'interests'; readonly names: readonly string[] }
  | { readonly _type: 'keywords'; readonly terms: readonly string[] }
  | { readonly _type: 'geo'; readonly locations: readonly string[] }
  | { readonly _type: 'age'; readonly min: number; readonly max: number }
  | { readonly _type: 'gender'; readonly value: 'male' | 'female' | 'all' }
  | { readonly _type: 'device'; readonly types: readonly ('mobile' | 'desktop')[] }
  | { readonly _type: 'os'; readonly types: readonly ('ios' | 'android' | 'windows' | 'macos')[] }
  | { readonly _type: 'customAudience'; readonly id: string }
  | { readonly _type: 'lookalike'; readonly sourceId: string; readonly config?: { readonly country?: string; readonly ratio?: number } }
  | { readonly _type: 'expansion'; readonly enabled: boolean }

// --- Placements ---

export type RedditPlacement = 'FEED' | 'CONVERSATION' | 'ALL'

// --- Ad Formats ---

export type ImageAdConfig = {
  readonly headline: string
  readonly body?: string
  readonly clickUrl: string
  readonly cta?: RedditCTA
  readonly thumbnail?: string
}

export type VideoAdConfig = {
  readonly headline: string
  readonly body?: string
  readonly clickUrl: string
  readonly cta?: RedditCTA
  readonly thumbnail?: string
}

export type CarouselCard = {
  readonly image: string
  readonly headline: string
  readonly url: string
  readonly caption?: string
}

export type CarouselAdConfig = {
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type FreeformAdConfig = {
  readonly headline: string
  readonly body: string
  readonly images?: readonly string[]
  readonly videos?: readonly string[]
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type ProductAdConfig = {
  readonly catalogId: string
  readonly headline: string
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type RedditAd =
  | { readonly format: 'image'; readonly filePath: string; readonly config: ImageAdConfig }
  | { readonly format: 'video'; readonly filePath: string; readonly config: VideoAdConfig }
  | { readonly format: 'carousel'; readonly cards: readonly CarouselCard[]; readonly config: CarouselAdConfig }
  | { readonly format: 'freeform'; readonly config: FreeformAdConfig }
  | { readonly format: 'product'; readonly config: ProductAdConfig }

// --- Ad Group Config ---

export type AdGroupConfig<T extends Objective> = {
  readonly bid?: RedditBidStrategy
  readonly targeting: readonly RedditTargetingRule[]
  readonly placement?: RedditPlacement
  readonly schedule?: RedditSchedule
  readonly optimizationGoal?: OptimizationGoalMap[T]
  readonly status?: 'enabled' | 'paused'
}

// --- Campaign Config ---

export type RedditCampaignConfig = {
  readonly budget?: Budget
  readonly status?: 'enabled' | 'paused'
  readonly spendCap?: number
}

// --- Built Campaign ---

export type RedditAdGroup<T extends Objective> = {
  readonly name: string
  readonly config: AdGroupConfig<T>
  readonly ads: readonly RedditAd[]
}

export type RedditCampaign<T extends Objective = Objective> = {
  readonly provider: 'reddit'
  readonly kind: T
  readonly name: string
  readonly config: RedditCampaignConfig
  readonly adGroups: readonly RedditAdGroup<T>[]
}

// --- Provider Config ---

export type RedditProviderConfig = {
  readonly accountId: string
  readonly appId?: string
  readonly appSecret?: string
  readonly refreshToken?: string
  readonly username?: string
  readonly password?: string
  readonly userAgent?: string
  readonly currency?: string
  readonly credentials?: string
}
