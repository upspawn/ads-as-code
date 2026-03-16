// Meta Ads type definitions
// Organized: Objectives → Optimization → Bidding → Targeting → Placements → Creatives → CTAs → Scheduling → Config

import type { Budget } from '../core/types.ts'
import type { AssetMarker } from '../core/asset.ts'
import type { UrlResult } from '../helpers/url.ts'

// ─── Objectives & Optimization Goals ───────────────────────

/** Meta campaign objectives. `'conversions'` is an alias for `'sales'`. */
export type Objective = 'awareness' | 'traffic' | 'engagement'
  | 'leads' | 'sales' | 'conversions' | 'app-promotion'

/**
 * Maps each objective to its valid optimization goals.
 * Generic constraint: `AdSetConfig<T>` uses `OptimizationGoalMap[T]` to restrict
 * which optimization goals are valid for a given objective.
 */
export type OptimizationGoalMap = {
  readonly awareness: 'REACH' | 'AD_RECALL_LIFT' | 'IMPRESSIONS' | 'THRUPLAY'
  readonly traffic: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS' | 'REACH' | 'IMPRESSIONS'
  readonly engagement: 'POST_ENGAGEMENT' | 'PAGE_LIKES' | 'EVENT_RESPONSES' | 'THRUPLAY' | 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'
  readonly leads: 'LEAD_GENERATION' | 'OFFSITE_CONVERSIONS' | 'QUALITY_LEAD'
  readonly sales: 'OFFSITE_CONVERSIONS' | 'VALUE' | 'CONVERSATIONS'
  readonly conversions: 'OFFSITE_CONVERSIONS' | 'VALUE' | 'CONVERSATIONS'
  readonly 'app-promotion': 'APP_INSTALLS' | 'APP_EVENTS' | 'VALUE'
}

// ─── Bidding ───────────────────────────────────────────────

export type BidStrategy =
  | { readonly type: 'LOWEST_COST_WITHOUT_CAP' }
  | { readonly type: 'LOWEST_COST_WITH_BID_CAP'; readonly cap: number }
  | { readonly type: 'COST_CAP'; readonly cap: number }
  | { readonly type: 'MINIMUM_ROAS'; readonly floor: number }
  | { readonly type: 'BID_CAP'; readonly cap: number }

// ─── Targeting ─────────────────────────────────────────────

export type InterestTarget = { readonly id: string; readonly name: string }
export type BehaviorTarget = { readonly id: string; readonly name: string }
export type MetaDemographicTarget = { readonly id: string; readonly name: string }
export type ConnectionTarget = { readonly type: 'page' | 'app' | 'event'; readonly id: string }

export type MetaTargeting = {
  readonly geo: GeoTarget[]
  readonly age?: { readonly min: number; readonly max: number }
  readonly genders?: readonly ('all' | 'male' | 'female')[]

  // Audiences
  readonly customAudiences?: readonly string[]
  readonly excludedAudiences?: readonly string[]
  readonly lookalikeAudiences?: readonly string[]

  // Detailed targeting
  readonly interests?: readonly InterestTarget[]
  readonly behaviors?: readonly BehaviorTarget[]
  readonly demographics?: readonly MetaDemographicTarget[]

  // Exclusions
  readonly excludedInterests?: readonly InterestTarget[]
  readonly excludedBehaviors?: readonly BehaviorTarget[]

  // Advantage+
  readonly advantageAudience?: boolean
  readonly advantageDetailedTargeting?: boolean

  // Connections
  readonly connections?: readonly ConnectionTarget[]
  readonly excludedConnections?: readonly ConnectionTarget[]
  readonly friendsOfConnections?: readonly ConnectionTarget[]

  // Languages
  readonly locales?: readonly number[]
}

/** Reuse GeoTarget from core for consistency */
import type { GeoTarget } from '../core/types.ts'

// ─── Placements ────────────────────────────────────────────

export type MetaPlatform = 'facebook' | 'instagram' | 'audience_network' | 'messenger'

export type PlacementPosition =
  // Facebook
  | 'feed' | 'right_hand_column' | 'marketplace' | 'video_feeds'
  | 'story' | 'search' | 'instream_video' | 'reels'
  // Instagram
  | 'instagram_stream' | 'instagram_story' | 'instagram_reels'
  | 'instagram_explore' | 'instagram_shop'
  // Messenger
  | 'messenger_inbox' | 'messenger_story'
  // Audience Network
  | 'classic' | 'rewarded_video'

export type MetaPlacements =
  | 'automatic'
  | {
      readonly platforms: readonly MetaPlatform[]
      readonly positions?: readonly PlacementPosition[]
      readonly facebookPositions?: readonly string[]
      readonly instagramPositions?: readonly string[]
      readonly messengerPositions?: readonly string[]
      readonly audienceNetworkPositions?: readonly string[]
      readonly devicePlatforms?: readonly ('mobile' | 'desktop')[]
      readonly publisherPlatforms?: readonly ('facebook' | 'instagram' | 'audience_network' | 'messenger')[]
    }

// ─── Creative Types ────────────────────────────────────────

export type ImageAd = {
  readonly format: 'image'
  readonly image: string | AssetMarker
  readonly name?: string
  readonly headline: string
  readonly primaryText: string
  readonly description?: string
  readonly cta?: MetaCTA
  readonly url?: string | UrlResult
  readonly urlParameters?: string
  readonly displayLink?: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

export type VideoAd = {
  readonly format: 'video'
  readonly video: string | AssetMarker
  readonly name?: string
  readonly thumbnail?: string | AssetMarker
  readonly headline: string
  readonly primaryText: string
  readonly description?: string
  readonly cta?: MetaCTA
  readonly url?: string | UrlResult
  readonly urlParameters?: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

export type CarouselCard = {
  readonly image: string | AssetMarker
  readonly headline: string
  readonly description?: string
  readonly url: string | UrlResult
  readonly cta?: MetaCTA
}

export type CarouselAd = {
  readonly format: 'carousel'
  readonly name?: string
  readonly cards: readonly CarouselCard[]
  readonly primaryText: string
  readonly cta?: MetaCTA
  readonly url?: string | UrlResult
  readonly endCard?: 'website' | 'none'
  readonly status?: 'ACTIVE' | 'PAUSED'
}

export type CollectionAd = {
  readonly format: 'collection'
  readonly name?: string
  readonly coverImage?: string | AssetMarker
  readonly coverVideo?: string | AssetMarker
  readonly instantExperience: string
  readonly headline: string
  readonly primaryText: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

/** A boosted post — an existing page post promoted as an ad. No standard ad copy fields. */
export type BoostedPostAd = {
  readonly format: 'boostedPost'
  readonly name?: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

export type MetaCreative = ImageAd | VideoAd | CarouselAd | CollectionAd | BoostedPostAd

// ─── CTAs ──────────────────────────────────────────────────

export type MetaCTA =
  | 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW' | 'DOWNLOAD'
  | 'GET_OFFER' | 'BOOK_TRAVEL' | 'CONTACT_US' | 'SUBSCRIBE'
  | 'GET_QUOTE' | 'APPLY_NOW' | 'BUY_NOW' | 'ORDER_NOW'
  | 'WATCH_MORE' | 'SEND_MESSAGE' | 'WHATSAPP_MESSAGE'
  | 'CALL_NOW' | 'GET_DIRECTIONS' | 'REQUEST_TIME'
  | 'SEE_MENU' | 'PLAY_GAME' | 'INSTALL_APP'
  | 'USE_APP' | 'LISTEN_NOW' | 'NO_BUTTON'

// ─── Scheduling & Day Parting ──────────────────────────────

export type AdSetSchedule = {
  readonly startTime?: string
  readonly endTime?: string
  readonly dayParting?: readonly DayPartRule[]
}

export type DayPartRule = {
  readonly days: readonly (0 | 1 | 2 | 3 | 4 | 5 | 6)[]
  readonly startMinute: number
  readonly endMinute: number
  readonly timezone: 'USER' | 'ADVERTISER'
}

// ─── Conversion Tracking ───────────────────────────────────

export type ConversionConfig = {
  readonly pixelId?: string
  readonly customEventType?: string
  readonly conversionWindow?: '1d_click' | '7d_click' | '1d_view' | '7d_click_1d_view'
  readonly attributionSetting?: 'CLICK_THROUGH' | 'VIEW_THROUGH' | 'ENGAGED_VIEW'
}

// ─── DSA (EU Digital Services Act) ─────────────────────────

export type DSAConfig = {
  readonly beneficiary: string
  readonly payor: string
}

// ─── Special Ad Categories ─────────────────────────────────

export type SpecialAdCategory = 'CREDIT' | 'EMPLOYMENT' | 'HOUSING' | 'ISSUES_ELECTIONS_POLITICS'

// ─── Promoted Object ───────────────────────────────────────

export type PromotedObject = {
  readonly pixelId?: string
  readonly customEventType?: string
  readonly applicationId?: string
  readonly objectStoreUrl?: string
  readonly pageId?: string
  readonly offerId?: string
}

// ─── Campaign Config ───────────────────────────────────────

export type MetaCampaignConfig = {
  readonly budget?: Budget
  readonly spendCap?: number
  readonly specialAdCategories?: readonly SpecialAdCategory[]
  readonly buyingType?: 'AUCTION' | 'RESERVED'
  readonly status?: 'ACTIVE' | 'PAUSED'
}

// ─── Ad Set Config (generic over objective) ────────────────

export type AdSetConfig<T extends Objective> = {
  readonly targeting: MetaTargeting
  readonly optimization?: OptimizationGoalMap[T]
  readonly bidding?: BidStrategy
  readonly budget?: Budget
  readonly placements?: MetaPlacements
  readonly schedule?: AdSetSchedule
  readonly conversion?: ConversionConfig
  readonly dsa?: DSAConfig
  readonly promotedObject?: PromotedObject
  readonly status?: 'ACTIVE' | 'PAUSED'
}

// ─── Ad Set Content ────────────────────────────────────────

export type AdSetContent = {
  readonly ads: readonly MetaCreative[]
  readonly url?: string | UrlResult
  readonly cta?: MetaCTA
}
