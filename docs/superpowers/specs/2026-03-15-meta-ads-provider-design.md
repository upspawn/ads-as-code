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
import { meta, daily, targeting, audience, geo, age, image } from '@upspawn/ads'

export const retargetingUS = meta.traffic('Retargeting - US', {
  budget: daily(5),
})
.adSet('Website Visitors 30d', {
  targeting: targeting(
    audience('Website Visitors 30d'),
    geo('US', 'GB', 'CA', 'AU'),
    age(25, 65),
  ),
}, {
  url: 'https://renamed.to',
  cta: 'SIGN_UP',
  ads: [
    image('./assets/hero.png', {
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually...',
      description: 'AI-powered file renaming for teams',
    }),
    image('./assets/comparison.png', {
      headline: 'Before & After',
      primaryText: 'See what renamed.to does to a messy folder',
      cta: 'LEARN_MORE',           // overrides ad set default
      url: 'https://renamed.to/tour',  // overrides ad set default
    }),
  ],
})
.adSet('Cold - Construction', {
  targeting: targeting(
    geo('US', 'DE'),
    age(30, 60),
    interests('Construction', 'Building Information Modeling'),
  ),
  optimization: 'LANDING_PAGE_VIEWS',   // override default (LINK_CLICKS for traffic)
  dsa: { beneficiary: 'Other Entity', payor: 'Other Entity' },
}, {
  url: 'https://renamed.to/construction',
  cta: 'LEARN_MORE',
  ads: [
    image('./assets/construction.png', {
      headline: 'Rename 1000 Plans in Seconds',
      primaryText: 'Construction teams waste 2hrs/week on file naming...',
    }),
  ],
})
```

**Compare with the verbose version** (all explicit, no defaults):

```ts
// Same campaign, but specifying every field — valid but unnecessary for the common case
.adSet('Website Visitors 30d', {
  targeting: targeting(
    audience({ id: '23856789012345' }),              // explicit ID
    geo('US', 'GB', 'CA', 'AU'),
    age(25, 65),
  ),
  bidding: lowestCost(),                              // default anyway
  placements: automatic(),                            // default anyway
  optimization: 'LINK_CLICKS',                        // default for traffic anyway
  status: 'PAUSED',                                   // default anyway
}, {
  ads: [
    image('./assets/hero.png', {
      name: 'Hero - Sign Up',                         // auto-derived from filename if omitted
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours...',
      cta: 'SIGN_UP',                                 // could come from ad set default
      url: 'https://renamed.to',                       // could come from ad set default
    }),
  ],
})
```

### DX Design Principles

**Sensible defaults** — the 80% case should need minimal config:

| Field | Default | Rationale |
|---|---|---|
| `bidding` | `lowestCost()` | Used 99% of the time; override when you need cost/bid caps |
| `placements` | `automatic()` | Meta recommends this; manual placement is the exception |
| `optimization` | Inferred from objective | `traffic` → `LINK_CLICKS`, `conversions` → `OFFSITE_CONVERSIONS`, `awareness` → `REACH`, `leads` → `LEAD_GENERATION`, `sales` → `OFFSITE_CONVERSIONS`, `engagement` → `POST_ENGAGEMENT`, `app-promotion` → `APP_INSTALLS` |
| `status` | `'PAUSED'` | Never accidentally go live; activate explicitly |
| `ad.name` | Derived from filename | `./assets/hero-sign-up.png` → `hero-sign-up` |
| `ad.cta` | Inherited from ad set content | Set once, override per ad when needed |
| `ad.url` | Inherited from ad set content | Set once, override per ad when needed |

**Ad set-level defaults** — `url` and `cta` on the content object cascade to all ads:

```ts
.adSet('Name', config, {
  url: 'https://renamed.to',     // all ads inherit this
  cta: 'SIGN_UP',                // all ads inherit this
  ads: [
    image('./hero.png', { headline: '...', primaryText: '...' }),                    // inherits url + cta
    image('./comp.png', { headline: '...', primaryText: '...', cta: 'LEARN_MORE' }), // overrides cta only
  ],
})
```

**Zero-lookup targeting:**

- `audience('Website Visitors 30d')` — looks up custom audiences by name in the account. Also accepts `audience({ id: '23856789012345' })` for explicit IDs.
- `interests('Construction', 'BIM')` — looks up interest IDs via Meta's Targeting Search API at `validate`/`plan` time. Results are cached locally. If a name is ambiguous, `validate` prints the options:
  ```
  ⚠ Ambiguous interest "Construction" — did you mean:
    interests({ id: '6003370250981', name: 'Construction (Industry)' })
    interests({ id: '6003139266461', name: 'Construction Equipment' })
  ```
  Also accepts explicit `{ id, name }` objects for precision: `interests({ id: '6003370250981', name: 'Construction' })`.
- A bundled `src/meta/interests-catalog.ts` ships the top ~500 interests pre-mapped for instant TypeScript autocomplete. Less common interests fall back to API lookup.
- `ads search interests "Construction"` — CLI command to query the Targeting Search API and print `{ id, name }` pairs.
- `ads audiences` — CLI command to list all custom audiences in the account with names and IDs.

**Note on `targeting()` vs `audience()`:** These are distinct helpers. `targeting()` composes targeting rules (geo, age, interests, audiences) into a `MetaTargeting` object — consistent with the existing Google `targeting()` helper. `audience(nameOrId)` returns an audience reference that can be passed into `targeting()`. This avoids the ambiguity of overloading `audience()` for both audience references and full targeting config.

### Builder Typing

The builder is generic over objective `T`. `.adSet()` constrains `optimization` to only goals valid for that objective:

```ts
class MetaCampaignBuilder<T extends Objective> {
  // Internal fields set by the entry point (meta.traffic(), etc.)
  readonly provider = 'meta' as const
  readonly kind: T  // e.g., 'traffic', 'conversions'

  adSet(
    name: string,
    config: AdSetConfig<T>,   // optimization narrowed by T, most fields optional
    content: AdSetContent
  ): MetaCampaignBuilder<T>
}

type AdSetContent = {
  ads: MetaCreative[]
  url?: string      // default url for all ads in this ad set
  cta?: MetaCTA     // default cta for all ads in this ad set
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
  name?: string             // auto-derived from filename if omitted (hero.png → "hero")
  headline: string
  primaryText: string
  description?: string
  cta?: MetaCTA             // inherits from AdSetContent.cta if omitted
  url?: string              // inherits from AdSetContent.url if omitted
  urlParameters?: string
  displayLink?: string
}

type VideoAd = {
  format: 'video'
  video: string
  name?: string             // auto-derived from filename if omitted
  thumbnail?: string
  headline: string
  primaryText: string
  description?: string
  cta?: MetaCTA             // inherits from AdSetContent.cta if omitted
  url?: string              // inherits from AdSetContent.url if omitted
  urlParameters?: string
}

type CarouselAd = {
  format: 'carousel'
  name?: string
  cards: CarouselCard[]
  primaryText: string
  cta?: MetaCTA             // inherits from AdSetContent.cta if omitted
  url?: string              // inherits from AdSetContent.url if omitted (fallback URL)
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
  name?: string
  coverImage?: string
  coverVideo?: string
  instantExperience: string
  headline: string
  primaryText: string
}
```

**Validation:** At flatten time, every ad must have a resolved `url` and `cta` (either directly or via `AdSetContent` defaults). If both are missing, `validate` errors with a clear message: `Ad "hero" in ad set "Website Visitors" has no url — set it on the ad or on the ad set content.`
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
  targeting: MetaTargeting                  // required — the only thing you must always specify
  optimization?: OptimizationGoalMap[T]     // defaults based on objective (see DX Design Principles)
  bidding?: BidStrategy                     // defaults to lowestCost()
  budget?: Budget                           // ad set level budget (for non-CBO campaigns)
  placements?: MetaPlacements              // defaults to automatic()
  schedule?: AdSetSchedule
  conversion?: ConversionConfig
  dsa?: DSAConfig                           // overrides provider-level DSA
  promotedObject?: PromotedObject
  status?: 'ACTIVE' | 'PAUSED'             // defaults to 'PAUSED'
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
// ── Targeting (composed via targeting()) ──
targeting(geo('US', 'DE'), age(25, 65))                             // minimal
targeting(audience('Website Visitors'), geo('US'), age(25, 65))     // with audience by name
targeting(geo('US'), interests('Construction', 'BIM'))              // with interests by name

geo('US', 'DE', 'GB')                                              // → GeoTarget
age(25, 65)                                                         // → { min, max }

// interests() — string names (resolved at validate/plan) or explicit { id, name }
interests('Construction', 'BIM')                                    // → API lookup + cache
interests({ id: '6003370250981', name: 'Construction' })            // → explicit, no lookup

// audience() — by name (looked up in account) or explicit ID
audience('Website Visitors 30d')                                    // → name lookup
audience({ id: '23856789012345' })                                  // → explicit ID

excludeAudience('Existing Customers')                               // → excluded audience
lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 })   // → lookalike

// ── Bidding ──
lowestCost()       // → LOWEST_COST_WITHOUT_CAP (also the default if omitted)
costCap(10)        // → COST_CAP, €10
bidCap(5)          // → BID_CAP, €5
minRoas(2.5)       // → MINIMUM_ROAS, 2.5x

// ── Placements ──
automatic()                                                         // → Advantage+ (default if omitted)
manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])       // → manual placement

// ── Budget (currency inferred from account, shown in plan output) ──
daily(5)                     // → { amount: 5, currency: 'EUR', period: 'daily' }
daily(5, 'USD')              // → explicit currency override
lifetime(500, '2026-04-01')  // → { amount: 500, currency: 'EUR', period: 'lifetime', endTime: '...' }

// ── Creative (name auto-derived from filename, url/cta inherit from ad set) ──
image('./hero.png', { headline: '...', primaryText: '...' })                // minimal
image('./hero.png', { name: 'Hero Ad', headline: '...', primaryText: '...', cta: 'SIGN_UP', url: '...' })  // explicit
video('./demo.mp4', { headline: '...', primaryText: '...' })                // minimal
carousel([card1, card2], { primaryText: '...' })                            // cards need own urls
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

Plan output uses human-readable names instead of slugified paths. The `Resource` stores both the slug path (for the diff engine) and the original `name` property (for display):

```ts
// cli/plan.ts — describeResource() uses resource.properties.name, not resource.path
function describeResource(resource: Resource): string {
  const name = resource.properties.name as string ?? resource.path
  // For nested resources, show the hierarchy: "Campaign → Ad Set → Ad"
  const hierarchy = buildHierarchy(resource, allResources)  // resolves parent names
  return `${resource.kind.padEnd(12)} ${hierarchy}`
}
```

The `→` separator in output (e.g., `Retargeting - US → Website Visitors 30d → hero`) is derived from the resource path hierarchy, resolving each segment to its human name.

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
# ── Core workflow ──
ads plan                        # diff for all providers
ads apply                       # apply all changes
ads status                      # live state for all providers
ads validate                    # type-check + rule validation (interest/audience resolution)

# Filter by provider
ads plan --provider meta
ads apply --provider google

# Import live campaigns → TypeScript
ads import --provider meta

# ── Onboarding ──
ads init                        # interactive setup (see below)
ads init --provider meta        # skip provider picker

# ── Discovery (Meta-specific) ──
ads audiences                   # list custom audiences (name + ID)
ads search interests "query"    # search Meta Targeting Search API
ads search behaviors "query"    # search behaviors
```

### `ads init` — Guided Onboarding

A new user runs `ads init` and gets an interactive setup:

```
$ ads init

  Which provider? (Use arrow keys)
  ❯ Google Ads
    Meta (Facebook/Instagram)

  Meta Ad Account ID: act_4053319338268788
  Page ID: 772782699246452
  Pixel ID (optional): 710178735336470

  ✓ Generated ads.config.ts
  ✓ Authenticated (FB_ADS_ACCESS_TOKEN found in env)
  ✓ Imported 3 campaigns → campaigns/

  You're ready! Edit campaigns/*.ts and run: ads plan
```

The init command:
1. Prompts for provider + credentials
2. Generates `ads.config.ts` with the correct shape
3. Verifies authentication works
4. Runs `ads import` to seed from live state
5. Prints a "what's next" message

### Import

`ads import --provider meta`:

1. Fetch all campaigns, ad sets, ads, creatives via Graph API
2. Generate `.ts` files using the builder DSL
3. Seed the cache with path → platform ID mappings
4. Download creative images to local `assets/` directory, reference them in generated code

### Plan Output

Plan output uses **human-readable names** (not slugified paths) so you can immediately see what's being changed. **Default-resolved values are annotated with `(default)`** so there's zero hidden magic — you see exactly what the SDK will send to Meta, and you know which values you set vs which were inferred:

```
Meta Ads — act_4053319338268788

  + campaign    Retargeting - US                                    (daily €5.00, paused)
  + adSet       Retargeting - US → Website Visitors 30d
                  bidding:        lowest cost (default)
                  placements:     automatic (default)
                  optimization:   LINK_CLICKS (default for traffic)
                  status:         paused (default)
  + upload      ./assets/hero.png                                   (new, 245 KB)
  + upload      ./assets/comparison.png                             (new, 189 KB)
  + creative    Retargeting - US → Website Visitors 30d → hero      (image, "Rename Files Instantly")
  + ad          Retargeting - US → Website Visitors 30d → hero
                  name:           hero (default from filename)
                  cta:            SIGN_UP (default from ad set)
                  url:            https://renamed.to (default from ad set)
  + creative    Retargeting - US → Website Visitors 30d → comparison (image, "Before & After")
  + ad          Retargeting - US → Website Visitors 30d → comparison
                  name:           comparison (default from filename)
                  cta:            LEARN_MORE
                  url:            https://renamed.to/tour

Google Ads — 7300967494

  ~ campaign    Search - PDF Renaming                               (budget: €1.50 → €2.00)
```

The `(default)` and `(default from ...)` annotations appear only on **creates**. For existing resources (updates/drift), the resolved values are already live — no annotation needed.

**Property-level diffs** for updates show exactly what changed:

```
Meta Ads — act_4053319338268788

  ~ adSet       Retargeting - US → Website Visitors 30d
                  targeting.geo:  ["US", "GB"]  →  ["US", "GB", "DE"]
                  budget:         daily €5.00   →  daily €7.00

  ~ creative    Retargeting - US → Website Visitors 30d → hero
                  headline:       "Rename Files Fast"  →  "Rename Files Instantly"

  - ad          Retargeting - US → Cold Traffic → old-variant        (will delete)
```

**Currency is always shown** in plan output — resolved from the account, even though `daily(5)` in code doesn't specify it. This prevents "5 what?" confusion when reading diffs.

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
// Generated output example — codegen emits minimal code (defaults omitted)
import { meta, daily, targeting, geo, age, image } from '@upspawn/ads'

export const retargetingUs = meta.traffic('Retargeting - US', {
  budget: daily(5),
})
.adSet('Website Visitors 30d', {
  targeting: targeting(geo('US', 'GB'), age(25, 65)),
}, {
  url: 'https://renamed.to',
  cta: 'SIGN_UP',
  ads: [
    image('./assets/imported/hero-abc123.png', {
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours...',
    }),
  ],
})
```

Codegen is smart about defaults — it only emits fields that differ from the default value. If the live campaign uses `LOWEST_COST_WITHOUT_CAP` bidding and `automatic` placements, the generated code omits both.

During import, creative images are downloaded from Meta's CDN to a local `assets/imported/` directory with a hash suffix to avoid collisions.
