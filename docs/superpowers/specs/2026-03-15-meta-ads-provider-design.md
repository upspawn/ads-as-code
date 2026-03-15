# Meta Ads Provider for @upspawn/ads

**Date:** 2026-03-15
**Status:** Approved

## Summary

Add Meta (Facebook/Instagram) Ads support to the @upspawn/ads SDK as a second provider alongside Google Ads. Users define Meta campaigns as TypeScript files using a builder DSL, then use the same `plan`/`apply`/`import`/`status` CLI to manage them declaratively.

## Architecture

### Provider Isolation

The SDK's core is already provider-agnostic (diff engine, flatten, cache, config). Meta support adds a new `src/meta/` module:

```
src/
  core/           # unchanged — diff, flatten, cache, config, types
  google/         # unchanged
  meta/           # NEW
    index.ts      # Builder DSL: meta.traffic(), meta.conversions(), etc.
    types.ts      # Full Meta type system
    fetch.ts      # Graph API → Resource[] (read live state)
    apply.ts      # Change[] → Graph API mutations (write changes)
    upload.ts     # Image/video upload + hash caching
    constants.ts  # Objective/optimization/placement/CTA enums
  helpers/        # extend with meta-specific helpers
```

### Resource Model

Meta's hierarchy flattens to the same `Resource` model used by the diff engine:

| Meta Concept | ResourceKind | Path Format |
|---|---|---|
| Campaign | `campaign` | `campaign-name` |
| Ad Set | `adSet` | `campaign-name/adset-name` |
| Ad + Creative | `ad` | `campaign-name/adset-name/ad-name` |

The `kind` field on `Resource` is extended with `'adSet'` — `adGroup` remains for Google.

### Dependency Ordering

Mutations execute in dependency order:

- **Creates:** campaign → adSet → upload images/videos → creative → ad
- **Deletes:** ad → creative → adSet → campaign (reverse)
- **Image uploads** can run in parallel with campaign/ad set creation since they don't depend on each other.

### Cache

Reuses the existing SQLite cache DB. Entries are namespaced by provider (a `provider` column distinguishes Google vs Meta mappings). Stores:

- Code path → platform ID (e.g., `retargeting-us` → `23856...`)
- Local file SHA-256 → Meta image hash (for upload deduplication)

## Builder DSL

### Entry Points — Objective as Method

```ts
meta.traffic('Name', config)        // OUTCOME_TRAFFIC
meta.conversions('Name', config)    // OUTCOME_CONVERSIONS
meta.awareness('Name', config)      // OUTCOME_AWARENESS
meta.engagement('Name', config)     // OUTCOME_ENGAGEMENT
meta.leads('Name', config)          // OUTCOME_LEADS
meta.sales('Name', config)          // OUTCOME_SALES
meta.appPromotion('Name', config)   // OUTCOME_APP_PROMOTION
```

Each returns a `MetaCampaignBuilder<T>` typed to the objective, constraining which optimization goals are valid on ad sets.

### Campaign Definition Example

```ts
import { meta, daily, audience, geo, age, lowestCost,
         automatic, image, video } from '@upspawn/ads'

export const retargetingUS = meta.traffic('Retargeting - US', {
  budget: daily(5),
})
.adSet('Website Visitors 30d', {
  targeting: audience('website-visitors-30d', {
    geo: geo('US', 'GB', 'CA', 'AU'),
    age: age(25, 65),
  }),
  bidding: lowestCost(),
  placements: automatic(),
  optimization: 'LINK_CLICKS',
}, {
  ads: [
    image('./assets/hero.png', {
      name: 'Hero - Sign Up',
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually...',
      description: 'AI-powered file renaming for teams',
      cta: 'SIGN_UP',
      url: 'https://renamed.to',
    }),
    image('./assets/comparison.png', {
      name: 'Comparison - Learn More',
      headline: 'Before & After',
      primaryText: 'See what renamed.to does to a messy folder',
      cta: 'LEARN_MORE',
      url: 'https://renamed.to/tour',
    }),
  ],
})
.adSet('Cold - Construction', {
  targeting: audience({
    geo: geo('US', 'DE'),
    age: age(30, 60),
    interests: ['Construction', 'Building Information Modeling'],
  }),
  bidding: lowestCost(),
  placements: automatic(),
  optimization: 'LANDING_PAGE_VIEWS',
  dsa: { beneficiary: 'Other Entity', payor: 'Other Entity' },
}, {
  ads: [
    image('./assets/construction.png', {
      name: 'Construction Pain Point',
      headline: 'Rename 1000 Plans in Seconds',
      primaryText: 'Construction teams waste 2hrs/week on file naming...',
      cta: 'LEARN_MORE',
      url: 'https://renamed.to/construction',
    }),
  ],
})
```

### Builder Typing

The builder is generic over objective `T`. `.adSet()` constrains `optimization` to only goals valid for that objective:

```ts
class MetaCampaignBuilder<T extends Objective> {
  adSet(
    name: string,
    config: AdSetConfig<T>,   // optimization narrowed by T
    content: { ads: MetaCreative[] }
  ): MetaCampaignBuilder<T>
}
```

## Comprehensive Type System

### Objectives & Optimization Goals

```ts
type Objective = 'awareness' | 'traffic' | 'engagement'
               | 'leads' | 'sales' | 'app-promotion'

type OptimizationGoalMap = {
  awareness: 'REACH' | 'AD_RECALL_LIFT' | 'IMPRESSIONS' | 'THRUPLAY'
  traffic: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS' | 'REACH' | 'IMPRESSIONS'
  engagement: 'POST_ENGAGEMENT' | 'PAGE_LIKES' | 'EVENT_RESPONSES' | 'THRUPLAY' | 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'
  leads: 'LEAD_GENERATION' | 'OFFSITE_CONVERSIONS' | 'QUALITY_LEAD'
  sales: 'OFFSITE_CONVERSIONS' | 'VALUE' | 'CONVERSATIONS'
  'app-promotion': 'APP_INSTALLS' | 'APP_EVENTS' | 'VALUE'
}
```

### Bidding Strategies

```ts
type BidStrategy =
  | { type: 'LOWEST_COST_WITHOUT_CAP' }
  | { type: 'LOWEST_COST_WITH_BID_CAP', cap: number }
  | { type: 'COST_CAP', cap: number }
  | { type: 'MINIMUM_ROAS', floor: number }
  | { type: 'BID_CAP', cap: number }
```

### Budget

```ts
type Budget =
  | { type: 'daily', amount: number }
  | { type: 'lifetime', amount: number, endTime: string }

// Can live on campaign (CBO) or ad set
type BudgetLevel = 'campaign' | 'adset'
```

### Targeting (Full Surface)

```ts
type MetaTargeting = {
  geo: GeoTarget[]
  age?: { min: number, max: number }
  genders?: ('all' | 'male' | 'female')[]

  // Audiences
  customAudiences?: string[]
  excludedAudiences?: string[]
  lookalikeAudiences?: string[]

  // Detailed targeting
  interests?: InterestTarget[]
  behaviors?: BehaviorTarget[]
  demographics?: DemographicTarget[]

  // Exclusions
  excludedInterests?: InterestTarget[]
  excludedBehaviors?: BehaviorTarget[]

  // Advantage+
  advantageAudience?: boolean
  advantageDetailedTargeting?: boolean

  // Connections
  connections?: ConnectionTarget[]
  excludedConnections?: ConnectionTarget[]
  friendsOfConnections?: ConnectionTarget[]

  // Languages
  locales?: number[]
}

type InterestTarget = { id: string, name: string }
type BehaviorTarget = { id: string, name: string }
type DemographicTarget = { id: string, name: string }
type ConnectionTarget = { type: 'page' | 'app' | 'event', id: string }
```

### Placements

```ts
type MetaPlacements =
  | 'automatic'
  | {
      platforms: MetaPlatform[]
      positions?: PlacementPosition[]
      devicePlatforms?: ('mobile' | 'desktop')[]
      publisherPlatforms?: ('facebook' | 'instagram' | 'audience_network' | 'messenger')[]
    }

type MetaPlatform = 'facebook' | 'instagram' | 'audience_network' | 'messenger'

type PlacementPosition =
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
```

### Creative Types (All Major Formats)

```ts
type MetaCreative = ImageAd | VideoAd | CarouselAd | CollectionAd

type ImageAd = {
  format: 'image'
  image: string
  headline: string
  primaryText: string
  description?: string
  cta: MetaCTA
  url: string
  urlParameters?: string
  displayLink?: string
}

type VideoAd = {
  format: 'video'
  video: string
  thumbnail?: string
  headline: string
  primaryText: string
  description?: string
  cta: MetaCTA
  url: string
  urlParameters?: string
}

type CarouselAd = {
  format: 'carousel'
  cards: CarouselCard[]
  primaryText: string
  url: string
  endCard?: 'website' | 'none'
}

type CarouselCard = {
  image: string
  headline: string
  description?: string
  url: string
  cta?: MetaCTA
}

type CollectionAd = {
  format: 'collection'
  coverImage?: string
  coverVideo?: string
  instantExperience: string
  headline: string
  primaryText: string
}
```

### CTAs (Full Set)

```ts
type MetaCTA =
  | 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW' | 'DOWNLOAD'
  | 'GET_OFFER' | 'BOOK_TRAVEL' | 'CONTACT_US' | 'SUBSCRIBE'
  | 'GET_QUOTE' | 'APPLY_NOW' | 'BUY_NOW' | 'ORDER_NOW'
  | 'WATCH_MORE' | 'SEND_MESSAGE' | 'WHATSAPP_MESSAGE'
  | 'CALL_NOW' | 'GET_DIRECTIONS' | 'REQUEST_TIME'
  | 'SEE_MENU' | 'PLAY_GAME' | 'INSTALL_APP'
  | 'USE_APP' | 'LISTEN_NOW' | 'NO_BUTTON'
```

### Scheduling & Day Parting

```ts
type AdSetSchedule = {
  startTime?: string
  endTime?: string
  dayParting?: DayPartRule[]
}

type DayPartRule = {
  days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[]
  startMinute: number
  endMinute: number
  timezone: 'USER' | 'ADVERTISER'
}
```

### Conversion Tracking

```ts
type ConversionConfig = {
  pixelId?: string
  customEventType?: string
  conversionWindow?: '1d_click' | '7d_click' | '1d_view' | '7d_click_1d_view'
  attributionSetting?: 'CLICK_THROUGH' | 'VIEW_THROUGH' | 'ENGAGED_VIEW'
}
```

### Campaign & Ad Set Config

```ts
type MetaCampaignConfig<T extends Objective> = {
  budget?: Budget
  spendCap?: number
  specialAdCategories?: SpecialAdCategory[]
  buyingType?: 'AUCTION' | 'RESERVED'
  status?: 'ACTIVE' | 'PAUSED'
}

type SpecialAdCategory = 'CREDIT' | 'EMPLOYMENT' | 'HOUSING' | 'ISSUES_ELECTIONS_POLITICS'

type AdSetConfig<T extends Objective> = {
  targeting: MetaTargeting
  optimization: OptimizationGoalMap[T]
  bidding?: BidStrategy
  budget?: Budget
  placements?: MetaPlacements
  schedule?: AdSetSchedule
  conversion?: ConversionConfig
  dsa?: DSAConfig
  promotedObject?: PromotedObject
  status?: 'ACTIVE' | 'PAUSED'
}

type PromotedObject = {
  pixelId?: string
  customEventType?: string
  applicationId?: string
  objectStoreUrl?: string
  pageId?: string
  offerId?: string
}
```

### DSA (EU Digital Services Act)

```ts
type DSAConfig = {
  beneficiary: string
  payor: string
}
```

### Helper Functions

```ts
// Targeting
geo('US', 'DE', 'GB')
age(25, 65)
interests('Construction', 'BIM')
audience('custom-audience-id', { geo: geo('US') })
lookalike('source-audience-id', geo('US'), percent: 1)

// Bidding
lowestCost()
costCap(10)
bidCap(5)
minRoas(2.5)

// Placements
automatic()
manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])

// Budget
daily(5)
lifetime(500, '2026-04-01')

// Creative
image('./path.png', { ... })
video('./path.mp4', { ... })
carousel([card1, card2, ...], { ... })
```

### Validation Rules

Enforced at `validate` and `plan` time:

- Headline: max 40 chars recommended, hard limit 255
- Primary text: max 125 chars recommended, no hard limit
- Description: max 30 chars recommended
- Carousel: 2-10 cards
- Image formats: jpg, png (max 30MB)
- Video formats: mp4, mov (max 4GB, max 240min)
- Aspect ratios validated per placement
- Special ad categories restrict available targeting options
- Optimization goal must be valid for the campaign objective

## Config Schema

Provider config in `ads.config.ts`:

```ts
export default {
  google: {
    customerId: '7300967494',
    managerId: '2390661468',
  },
  meta: {
    accountId: 'act_4053319338268788',
    pageId: '772782699246452',
    pixelId: '710178735336470',
    apiVersion: 'v21.0',
    dsa: {
      beneficiary: 'Upspawn Software UG',
      payor: 'Upspawn Software UG',
    },
  },
  cache: '.cache/ads.db',
}
```

**Auth:** `FB_ADS_ACCESS_TOKEN` environment variable.

**DSA:** Set in provider config, automatically applied to all ad sets. Override per ad set via `dsa` field in `AdSetConfig`.

## CLI Integration

### Provider Auto-Detection

Campaign files are detected by their imports:
- `import { meta } from '@upspawn/ads'` → Meta campaign
- `import { google } from '@upspawn/ads'` → Google campaign

### Commands

```bash
# All providers
ads plan                        # diff for all providers
ads apply                       # apply all changes
ads status                      # live state for all providers

# Filter by provider
ads plan --provider meta
ads apply --provider google
ads status --provider meta

# Import live campaigns → TypeScript
ads import --provider meta

# Validate campaign files
ads validate
```

### Import

`ads import --provider meta`:

1. Fetch all campaigns, ad sets, ads, creatives via Graph API
2. Generate `.ts` files using the builder DSL
3. Seed the cache with path → platform ID mappings
4. Download creative images to local `assets/` directory, reference them in generated code

### Plan Output

```
Meta Ads — act_4053319338268788
  + campaign    Retargeting - US
  + adSet       Retargeting - US / Website Visitors 30d
  + upload      ./assets/hero.png (new)
  + upload      ./assets/comparison.png (new)
  + ad          Retargeting - US / Website Visitors 30d / Hero - Sign Up
  + ad          Retargeting - US / Website Visitors 30d / Comparison - Learn More

Google Ads — 7300967494
  ~ campaign    Search - PDF Renaming  (budget: $1.50 → $2.00)
```

## Fetch Layer

### API Calls

```
fetchCampaigns()  → GET /{accountId}/campaigns?fields=name,objective,status,daily_budget,...
fetchAdSets()     → GET /{accountId}/adsets?fields=name,targeting,daily_budget,optimization_goal,...
fetchAds()        → GET /{accountId}/ads?fields=name,status,creative{image_hash,object_story_spec,...},...
```

### Semantic Comparison Rules

- **Budgets:** Meta uses cents (string) — normalize to numbers
- **Targeting:** Deep-compare with sorted arrays (interest IDs can return in any order)
- **Creative copy:** Trim whitespace, compare case-sensitively
- **Image hashes:** Compare by hash value (not file path)

## Apply Layer

### Mutation Order

| Step | API Call | Depends On |
|---|---|---|
| 1. Create campaign | `POST /{accountId}/campaigns` | — |
| 2. Create ad set | `POST /{accountId}/adsets` | campaign ID |
| 3. Upload images | `POST /{accountId}/adimages` | — (parallel with 1-2) |
| 4. Create creative | `POST /{accountId}/adcreatives` | image hash, page ID |
| 5. Create ad | `POST /{accountId}/ads` | ad set ID, creative ID |

Updates: `POST /{entityId}?field=newValue`.
Deletes: reverse order (ad → creative → adSet → campaign).

### Image Upload & Caching

- **`plan` phase:** Check cache for existing hash by file content (SHA-256 of local file). Show "will upload" for new files, skip known ones.
- **`apply` phase:** Upload new images via `POST /{accountId}/adimages`. Store `{ fileSha256, metaImageHash }` in SQLite cache.
- **Re-apply after image change:** Detect file SHA changed → re-upload → update creative with new hash.

### Error Handling

- Meta Graph API returns structured errors with `error.code` and `error.error_subcode`
- Rate limits: retry with exponential backoff
- Validation errors: surface clearly in changeset output
- Partial apply: cache records what was created, so next `plan` shows correct diff (won't re-create)
