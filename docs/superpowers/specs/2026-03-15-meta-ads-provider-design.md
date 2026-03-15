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
  core/           # MODIFIED — types.ts, flatten.ts, codegen.ts get multi-provider support
  google/         # unchanged
  meta/           # NEW
    index.ts      # Builder DSL: meta.traffic(), meta.conversions(), etc.
    types.ts      # Full Meta type system
    flatten.ts    # MetaCampaign → Resource[] (meta-specific flattening)
    fetch.ts      # Graph API → Resource[] (read live state)
    apply.ts      # Change[] → Graph API mutations (write changes)
    upload.ts     # Image/video upload + hash caching
    codegen.ts    # Live state → .ts campaign file generation (for import)
    constants.ts  # Objective/optimization/placement/CTA enums
  helpers/        # extend with meta-specific helpers
```

### Core Type Changes

Adding Meta support requires extending the core `ResourceKind` union and `MetaProviderConfig`. These changes affect multiple files:

**`src/core/types.ts`:**

```ts
// BEFORE
type ResourceKind = 'campaign' | 'adGroup' | 'keyword' | 'ad' | 'sitelink' | 'callout' | 'negative'

// AFTER — add adSet and creative for Meta
type ResourceKind = 'campaign' | 'adGroup' | 'adSet' | 'keyword' | 'ad' | 'creative' | 'sitelink' | 'callout' | 'negative'

// BEFORE
type MetaProviderConfig = {
  readonly accountId: string
  readonly credentials?: string
}

// AFTER — full config needed for ad creation
type MetaProviderConfig = {
  readonly accountId: string
  readonly pageId: string
  readonly pixelId?: string
  readonly apiVersion?: string  // defaults to 'v21.0'
  readonly dsa?: { readonly beneficiary: string; readonly payor: string }
  readonly credentials?: string
}
```

**Files impacted by `ResourceKind` extension:**

| File | What changes |
|---|---|
| `src/core/types.ts` | Add `'adSet'` and `'creative'` to `ResourceKind` union, expand `MetaProviderConfig` |
| `src/core/flatten.ts` | Add `flattenMeta()` export (or make `flattenAll` provider-aware) |
| `src/core/diff.ts` | No changes needed — diff is kind-agnostic (operates on `Resource` generically) |
| `src/google/apply.ts` | Add `default` case to `switch(resource.kind)` for unknown kinds (no-op, not an error — other providers handle their own kinds) |
| `cli/plan.ts` | `describeResource()` needs labels for `adSet` and `creative`. Provider filter refactored (see CLI Refactoring section) |
| `cli/apply.ts` | Provider dispatch (see CLI Refactoring section) |
| `cli/import.ts` | Provider dispatch (see CLI Refactoring section) |

### Resource Model

Meta's hierarchy flattens to the same `Resource` model used by the diff engine:

| Meta Concept | ResourceKind | Path Format |
|---|---|---|
| Campaign | `campaign` | `campaign-name` |
| Ad Set | `adSet` | `campaign-name/adset-name` |
| Creative | `creative` | `campaign-name/adset-name/creative-name` |
| Ad | `ad` | `campaign-name/adset-name/ad-name` |

**Why `creative` is a first-class resource:** Meta's `adcreative` is a real Graph API entity with its own ID. Multiple ads can share a single creative. Treating it as a Resource means:
- The diff engine can detect "creative copy changed but ad didn't" vs "ad pointing to a different creative"
- The cache stores creative IDs, enabling proper update-in-place
- Delete ordering is correct: ad → creative → adSet → campaign
- `plan` output shows creative changes explicitly

The creative path uses the ad name suffixed with `/cr` (e.g., `retargeting-us/website-visitors-30d/hero-sign-up/cr`). Each ad has exactly one creative — the 1:1 relationship is enforced by the builder. If a future need arises for shared creatives, the path scheme supports it.

### Dependency Ordering

Mutations execute in dependency order:

- **Creates:** campaign → adSet → upload images/videos → creative → ad
- **Deletes:** ad → creative → adSet → campaign (reverse)
- **Image uploads** can run in parallel with campaign/ad set creation since they don't depend on each other.

### Cache

Reuses the existing SQLite cache DB. Entries are namespaced by provider (a `provider` column distinguishes Google vs Meta mappings). Stores:

- Code path → platform ID (e.g., `retargeting-us` → `23856...`)
- Creative path → creative platform ID
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
import { meta, daily, targeting, audience, geo, age, lowestCost,
         automatic, image, video, interests } from '@upspawn/ads'

export const retargetingUS = meta.traffic('Retargeting - US', {
  budget: daily(5),
})
.adSet('Website Visitors 30d', {
  targeting: targeting(
    audience('website-visitors-30d'),
    geo('US', 'GB', 'CA', 'AU'),
    age(25, 65),
  ),
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
  targeting: targeting(
    geo('US', 'DE'),
    age(30, 60),
    interests({ id: '6003370250981', name: 'Construction' },
              { id: '6003597068925', name: 'Building Information Modeling' }),
  ),
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

**Note on `targeting()` vs `audience()`:** These are distinct helpers. `targeting()` composes targeting rules (geo, age, interests, audiences) into a `MetaTargeting` object — consistent with the existing Google `targeting()` helper. `audience('id')` returns an audience reference that can be passed into `targeting()`. This avoids the ambiguity of overloading `audience()` for both audience references and full targeting config.

**Note on interest IDs:** The `interests()` helper requires `{ id, name }` objects because the Meta Graph API requires numeric interest IDs for targeting. Users look up IDs via Meta's [Targeting Search API](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search) or the Ads Manager UI. A future enhancement could add an `ads search-interests "Construction"` CLI command that queries the API and returns `{ id, name }` pairs.

### Builder Typing

The builder is generic over objective `T`. `.adSet()` constrains `optimization` to only goals valid for that objective:

```ts
class MetaCampaignBuilder<T extends Objective> {
  // Internal fields set by the entry point (meta.traffic(), etc.)
  readonly provider = 'meta' as const
  readonly kind: T  // e.g., 'traffic', 'conversions'

  adSet(
    name: string,
    config: AdSetConfig<T>,   // optimization narrowed by T
    content: { ads: MetaCreative[] }
  ): MetaCampaignBuilder<T>
}
```

The `provider: 'meta'` and `kind: T` fields are required by the discovery system (`src/core/discovery.ts`). `isCampaignLike()` checks for these fields to route campaigns to the correct provider's flatten/fetch/apply modules.

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

Meta budgets reuse the core `Budget` type from `src/core/types.ts` for compatibility with the diff engine's `semanticEqual()`:

```ts
// Core type (already exists)
type DailyBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'daily' }
type LifetimeBudget = { readonly amount: number; readonly currency: 'EUR' | 'USD'; readonly period: 'lifetime'; readonly endTime: string }
type Budget = DailyBudget | LifetimeBudget
```

The `daily(5)` helper infers currency from the provider config (Meta account currency). Internally, Meta stores budgets in cents — the fetch layer converts `"500"` (cents) → `{ amount: 5, currency: 'EUR', period: 'daily' }` and the apply layer converts back.

**Note:** The core `Budget` type gains a `LifetimeBudget` variant (currently only `DailyBudget | MonthlyBudget`). Meta doesn't have monthly budgets but does have lifetime budgets with an end time. Google's `MonthlyBudget` remains.

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
// Targeting (composed via targeting() — consistent with Google's targeting() helper)
targeting(geo('US', 'DE'), age(25, 65), audience('custom-id'))
geo('US', 'DE', 'GB')                                              // → GeoTarget
age(25, 65)                                                         // → { min, max }
interests({ id: '6003370250981', name: 'Construction' })            // → InterestTarget[]
audience('custom-audience-id')                                      // → custom audience ref
excludeAudience('existing-customers')                               // → excluded audience ref
lookalike('source-audience-id', { geo: geo('US'), percent: 1 })     // → lookalike config

// Bidding
lowestCost()       // → { type: 'LOWEST_COST_WITHOUT_CAP' }
costCap(10)        // → { type: 'COST_CAP', cap: 10 }
bidCap(5)          // → { type: 'BID_CAP', cap: 5 }
minRoas(2.5)       // → { type: 'MINIMUM_ROAS', floor: 2.5 }

// Placements
automatic()                                                         // → 'automatic'
manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])       // → MetaPlacements

// Budget (currency inferred from provider config)
daily(5)                     // → { amount: 5, currency: 'EUR', period: 'daily' }
lifetime(500, '2026-04-01')  // → { amount: 500, currency: 'EUR', period: 'lifetime', endTime: '...' }

// Creative
image('./path.png', { name, headline, primaryText, cta, url })
video('./path.mp4', { name, headline, primaryText, cta, url })
carousel([card1, card2, ...], { primaryText, url })
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

## Flatten Layer

The existing `src/core/flatten.ts` only handles `GoogleSearchCampaign`. Meta campaigns need their own flatten logic in `src/meta/flatten.ts`:

```ts
/** Flatten a MetaCampaign tree into a flat list of Resource objects. */
export function flattenMeta(campaign: MetaCampaign): Resource[]
```

### Path Generation

| Resource | Path Pattern | Example |
|---|---|---|
| Campaign | `slugify(campaign.name)` | `retargeting-us` |
| Ad Set | `campaignSlug/slugify(adSet.name)` | `retargeting-us/website-visitors-30d` |
| Creative | `campaignSlug/adSetSlug/slugify(ad.name)/cr` | `retargeting-us/website-visitors-30d/hero-sign-up/cr` |
| Ad | `campaignSlug/adSetSlug/slugify(ad.name)` | `retargeting-us/website-visitors-30d/hero-sign-up` |

The `slugify()` function from `src/core/flatten.ts` is reused.

### Resource Properties

Each resource stores properties that the diff engine compares:

- **Campaign:** `{ name, objective, status, budget, spendCap, specialAdCategories, buyingType }`
- **Ad Set:** `{ name, status, targeting, optimization, bidding, budget, placements, schedule, conversion, dsa, promotedObject }`
- **Creative:** `{ name, format, imageHash, headline, primaryText, description, cta, url, urlParameters, displayLink, objectStorySpec }` — `imageHash` is resolved from cache (file SHA → Meta hash) or marked as `pending-upload` during `plan`
- **Ad:** `{ name, status, creativePath }` — `creativePath` references the creative resource path

### Image File Resolution

Image file paths in the builder (e.g., `'./assets/hero.png'`) are resolved at flatten time:
1. Compute SHA-256 of the local file
2. Check cache for existing Meta image hash
3. If cached: store `imageHash` in the creative resource properties
4. If not cached: store `{ pendingUpload: true, filePath: './assets/hero.png', fileSha: '...' }` — the `plan` command displays this as `+ upload ./assets/hero.png (new)`, and `apply` uploads before creating the creative

### Multi-Provider `flattenAll`

The core `flattenAll` becomes provider-aware:

```ts
// src/core/flatten.ts — updated
import { flatten as flattenGoogle } from '../google/flatten.ts'  // extract current code
import { flattenMeta } from '../meta/flatten.ts'

export function flattenAll(campaigns: DiscoveredCampaign[]): Resource[] {
  return campaigns.flatMap(c => {
    if (c.provider === 'google') return flattenGoogle(c.campaign as GoogleSearchCampaign)
    if (c.provider === 'meta') return flattenMeta(c.campaign as MetaCampaign)
    throw new Error(`Unknown provider: ${c.provider}`)
  })
}
```

## CLI Refactoring

The current CLI commands (`plan.ts`, `apply.ts`, `import.ts`) are hardcoded to Google. They need a provider dispatch pattern:

### Current State (Google-only)

```ts
// cli/plan.ts — current
const campaigns = discovery.campaigns.filter(c => c.provider === 'google')
const client = await createGoogleClient(...)
const actual = await fetchAll(client, config.google!.customerId)
const changeset = diff(flatten(campaigns), actual)
```

### Target State (multi-provider)

```ts
// cli/plan.ts — after refactoring
const providers = resolveProviders(discovery.campaigns, config, flags.provider)

for (const { provider, campaigns, providerConfig } of providers) {
  const fetcher = getProviderFetcher(provider)     // google → fetchAll, meta → fetchMetaAll
  const flattener = getProviderFlattener(provider)  // google → flatten, meta → flattenMeta

  const desired = flattener(campaigns)
  const actual = await fetcher(providerConfig)
  const changeset = diff(desired, actual, managedPaths, pathToPlatformId)

  printChangeset(provider, changeset)  // describeResource() handles adSet/creative labels
}
```

### Provider Registry Pattern

```ts
// src/core/providers.ts — NEW
type ProviderModule = {
  flatten: (campaign: unknown) => Resource[]
  fetchAll: (config: unknown) => Promise<Resource[]>
  applyChangeset: (changeset: Changeset, config: unknown) => Promise<void>
  codegen: (resources: Resource[]) => string  // for import
}

const providers: Record<string, () => Promise<ProviderModule>> = {
  google: () => import('../google/provider.ts'),
  meta: () => import('../meta/provider.ts'),
}
```

Each provider exports a `ProviderModule` with its flatten/fetch/apply/codegen implementations. The CLI commands iterate over discovered providers and dispatch to the correct module. Provider modules are lazy-loaded — `import('../meta/provider.ts')` is only called when Meta campaigns are discovered.

### `describeResource()` Updates

```ts
// cli/plan.ts — describeResource() additions
case 'adSet':    return `adSet       ${resource.path}`
case 'creative': return `creative    ${resource.path}`
```

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
  + campaign    retargeting-us
  + adSet       retargeting-us/website-visitors-30d
  + upload      ./assets/hero.png (new)
  + upload      ./assets/comparison.png (new)
  + creative    retargeting-us/website-visitors-30d/hero-sign-up/cr
  + ad          retargeting-us/website-visitors-30d/hero-sign-up
  + creative    retargeting-us/website-visitors-30d/comparison-learn-more/cr
  + ad          retargeting-us/website-visitors-30d/comparison-learn-more

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

### Fetched Resource Mapping

Fetched API responses are normalized into `Resource[]`:

- **Campaigns:** `GET /{accountId}/campaigns` → one `Resource` per campaign (kind: `campaign`)
- **Ad Sets:** `GET /{accountId}/adsets` → one `Resource` per ad set (kind: `adSet`)
- **Ads + Creatives:** `GET /{accountId}/ads?fields=...,creative{...}` → TWO resources per ad: one `creative` and one `ad`. The creative's `imageHash` property enables diff against the desired state.

### Semantic Comparison Rules

- **Budgets:** Meta returns cents as string (e.g., `"500"`) — fetch converts to core `Budget` type (`{ amount: 5, currency: 'EUR', period: 'daily' }`), then `semanticEqual` in the diff engine compares via `toMicros()` as it does for Google
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

### Video Upload

Video upload uses a different Meta API endpoint (`POST /{accountId}/advideos`) with chunked upload for large files. This is a separate code path from image upload:

- Small videos (<1GB): single POST with file data
- Large videos (>1GB): chunked upload (start → transfer chunks → finish)
- Cache stores `{ fileSha256, metaVideoId }` similar to images
- Thumbnail auto-generation: Meta generates a thumbnail by default; `thumbnail` field in `VideoAd` allows overriding with a local image (uploaded separately)

### Codegen (for `ads import`)

`src/meta/codegen.ts` generates TypeScript campaign files from fetched live state. This mirrors `src/core/codegen.ts` (which is Google-specific) but produces Meta builder DSL:

```ts
// Generated output example:
import { meta, daily, targeting, geo, age, lowestCost, automatic, image } from '@upspawn/ads'

export const retargetingUs = meta.traffic('Retargeting - US', {
  budget: daily(5),
})
.adSet('Website Visitors 30d', {
  targeting: targeting(geo('US', 'GB'), age(25, 65)),
  bidding: lowestCost(),
  placements: automatic(),
  optimization: 'LINK_CLICKS',
}, {
  ads: [
    image('./assets/imported/hero-abc123.png', {
      name: 'Hero - Sign Up',
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours...',
      cta: 'SIGN_UP',
      url: 'https://renamed.to',
    }),
  ],
})
```

During import, creative images are downloaded from Meta's CDN to a local `assets/imported/` directory with a hash suffix to avoid collisions.
