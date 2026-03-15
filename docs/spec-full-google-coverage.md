# ads-as-code -- Full Google Ads Coverage Spec

> Product spec for extending the `@upspawn/ads` SDK from Search-only to full Google Ads platform coverage. Describes WHAT to build, not HOW. Each item includes API details, SDK design, effort, and priority.

---

## Current State

The SDK fully supports **Google Search campaigns** with zero-diff round-trips (import, plan, apply). See [CLAUDE.md](../CLAUDE.md) for details.

**What works today (Google):**

| Resource | Create | Read | Update | Delete |
|----------|--------|------|--------|--------|
| Campaign (Search) | Yes | Yes | Yes | Yes |
| CampaignBudget | Yes | Yes | Yes | Yes |
| Ad Group | Yes | Yes | Yes | Yes |
| Keyword (ad group criterion) | Yes | Yes | Partial | Yes |
| RSA (ad) | Yes | Yes | No | Yes |
| Sitelinks (asset + link) | Yes | Yes | No | Yes |
| Callouts (asset + link) | Yes | Yes | No | Yes |
| Campaign negatives | Yes | Yes | No | Yes |
| Ad group negatives | Yes | Yes | No | Yes |
| Geo targeting | Yes | Yes | Yes | Yes |
| Language targeting | Yes | Yes | Yes | Yes |
| Schedule targeting | Yes | Yes | Yes | Yes |
| Device bid adjustments | Yes | Yes | Yes | Yes |
| Network settings | Yes | Yes | Yes | Yes |
| Tracking template / URL suffix | Yes | Yes | Yes | Yes |

**What works today (Meta):**

Full lifecycle for traffic, conversions, leads, awareness, engagement, and sales campaigns. Separate from this spec.

**Builder API pattern established:**

```typescript
export default google.search('Campaign Name', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US'), languages('en')),
  negatives: negatives('free', 'open source'),
})
  .group('main', {
    keywords: exact('rename files'),
    ad: rsa(headlines(...), descriptions(...), url('https://renamed.to')),
  })
  .sitelinks(link('Pricing', '/pricing'))
  .callouts('Free Trial', 'AI-Powered')
```

---

## Spec Overview

| # | Item | Phase | Priority | Effort | Dependencies |
|---|------|-------|----------|--------|--------------|
| 1 | Dynamic Search Ads (DSA) | 1 | P1 | M | -- |
| 2 | Structured snippet pipeline | 1 | P2 | S | -- |
| 3 | Call extension pipeline | 1 | P2 | S | -- |
| 4 | Price extension pipeline | 1 | P2 | M | -- |
| 5 | Promotion extension pipeline | 1 | P2 | M | -- |
| 6 | Image extension pipeline | 1 | P2 | M | Image asset upload |
| 7 | Campaign asset linking | 1 | P1 | M | -- |
| 8 | Keyword updates (text, bid, status) | 1 | P0 | S | -- |
| 9 | Ad updates (copy, status) | 1 | P0 | M | -- |
| 10 | Audience targeting (ad group) | 1 | P1 | M | -- |
| 11 | Demographic targeting | 1 | P2 | S | -- |
| 12 | Location bid adjustments | 1 | P2 | S | -- |
| 13 | Ad schedule bid adjustments | 1 | P2 | S | -- |
| 14 | Campaign conversion goals | 1 | P1 | M | Conversion actions (Phase 6) |
| 15 | Ad group negatives in codegen | 1 | P0 | S | -- |
| 16 | Display campaign type | 2 | P1 | L | Image asset upload |
| 17 | Responsive Display Ads | 2 | P1 | M | Display campaign |
| 18 | Image Ads | 2 | P2 | M | Display campaign, image upload |
| 19 | Display targeting | 2 | P1 | M | Display campaign |
| 20 | Display bidding | 2 | P2 | S | Display campaign |
| 21 | Image asset management | 2 | P0 | M | -- |
| 22 | PMax campaign type | 3 | P1 | XL | Image asset upload |
| 23 | Asset Groups | 3 | P1 | L | PMax campaign |
| 24 | Audience Signals | 3 | P2 | M | PMax campaign |
| 25 | Retail PMax | 3 | P2 | L | PMax campaign, Merchant Center |
| 26 | Brand Guidelines | 3 | P2 | M | PMax campaign |
| 27 | Final URL expansion | 3 | P2 | S | PMax campaign |
| 28 | Shopping campaign type | 4 | P2 | L | Merchant Center |
| 29 | Product groups / listing groups | 4 | P2 | L | Shopping campaign |
| 30 | Shopping settings | 4 | P2 | S | Shopping campaign |
| 31 | Demand Gen campaign type | 5 | P1 | L | Image asset upload |
| 32 | Multi-asset ads | 5 | P1 | M | Demand Gen campaign |
| 33 | Carousel ads | 5 | P2 | M | Demand Gen campaign |
| 34 | Video responsive ads | 5 | P2 | M | Demand Gen campaign, YouTube asset |
| 35 | Channel controls | 5 | P1 | S | Demand Gen campaign |
| 36 | Lookalike audiences | 5 | P2 | S | Demand Gen campaign |
| 37 | Shared negative keyword lists | 6 | P1 | M | -- |
| 38 | Shared budgets | 6 | P2 | S | -- |
| 39 | Audience list management | 6 | P2 | L | -- |
| 40 | Conversion actions | 6 | P1 | M | -- |
| 41 | Customer match | 6 | P2 | L | Audience lists |
| 42 | Portfolio bidding strategies | 6 | P2 | M | -- |
| 43 | Smart campaigns | 7 | P2 | L | -- |
| 44 | App campaigns | 7 | P2 | L | -- |
| 45 | Video campaigns (read-only) | 7 | P2 | M | -- |
| 46 | Hotel / Travel / Local | 7 | P2 | XL | -- |

---

## Phase 1: Search Campaign Completeness

Items that complete the Search campaign experience to production-grade.

---

### 1.1 Dynamic Search Ads (DSA)

**What it is.** DSA ad groups use Google's web index to auto-match search queries to website pages, generating headlines dynamically. They complement keyword-targeted ad groups by catching queries you haven't explicitly targeted.

**Why it matters.** DSA fills keyword gaps automatically. Advertisers running Search campaigns want DSA groups alongside keyword groups in the same campaign for full query coverage.

**API details.**

- Campaign-level: `campaign.dynamic_search_ads_setting.domain_name` + `.language_code`
- Ad group type: `SEARCH_DYNAMIC_ADS` (enum 4)
- Ad format: `EXPANDED_DYNAMIC_SEARCH_AD` with `description` and `description2` only (headlines are auto-generated)
- Targeting: `WebpageInfo` criterion on ad group with `conditions[]` -- each condition has `operand` (URL, CATEGORY, PAGE_TITLE, PAGE_CONTENT, CUSTOM_LABEL), `operator` (EQUALS, CONTAINS), and `argument`
- Negative targets: `WebpageInfo` negatives to exclude pages

**SDK design.**

```typescript
export default google.search('Search - DSA', {
  budget: daily(5),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US'), languages('en')),
  // DSA requires domain + language at campaign level
  dsa: { domain: 'www.renamed.to', language: 'en' },
})
  // Regular keyword ad group alongside DSA
  .group('exact-match', {
    keywords: exact('rename files'),
    ad: rsa(headlines(...), descriptions(...), url('https://renamed.to')),
  })
  // DSA ad group -- no keywords, just page targets + descriptions
  .dsaGroup('all-pages', {
    targets: [
      pageTarget('All Pages', { url: { contains: '/' } }),
      pageTarget('Blog', { category: { contains: 'blog' } }),
    ],
    negativeTargets: [
      pageTarget('Pricing', { url: { contains: '/pricing' } }),
    ],
    ad: dsa({
      description: 'Upload files. AI reads content. Get organized filenames.',
      description2: '50 free renames. No credit card needed.',
    }),
  })
```

**Effort.** M -- New ad group type, new ad format, new targeting criterion type (WebpageInfo), campaign-level DSA settings. Moderate because it reuses the existing campaign/ad-group resource pipeline.

**Dependencies.** None -- builds on existing Search campaign infrastructure.

**Priority.** P1 -- DSA is a common pattern for Search advertisers but not blocking for basic usage.

---

### 1.2 Structured Snippet Extension Pipeline

**What it is.** Structured snippets add a predefined header with 3-10 values below the ad (e.g., "Types: Files, Folders, Documents"). They highlight specific aspects of your offerings.

**Why it matters.** Increases ad real estate and CTR. A standard part of well-optimized Search campaigns.

**API details.**

- Asset type: `STRUCTURED_SNIPPET`
- Asset field type: `STRUCTURED_SNIPPET`
- Fields: `header` (predefined: Amenities, Brands, Courses, Degree programs, Destinations, Featured hotels, Insurance coverage, Models, Neighborhoods, Service catalog, Shows, Styles, Types), `values[]` (min 3, max 25 chars each)
- Linkage: `CampaignAsset` or `AdGroupAsset` with `field_type = STRUCTURED_SNIPPET`

**SDK design.** Already defined in types and builder API:

```typescript
import { snippet } from '@upspawn/ads'

export default google.search('Campaign', { ... })
  .snippets(
    snippet('Types', 'Files', 'Folders', 'Documents', 'Archives'),
    snippet('Styles', 'Batch Rename', 'AI Rename', 'Rule-Based'),
  )
```

**What's missing:** The flatten/fetch/apply pipeline for structured snippets. The helper and types exist; the plumbing from `Resource[]` through to API mutations doesn't.

**Effort.** S -- Types and helpers exist. Need fetch GAQL, flatten logic, apply mutation, and codegen template. Same pattern as sitelinks/callouts.

**Dependencies.** Campaign asset linking (1.7) for proper association.

**Priority.** P2 -- Nice to have. Most advertisers start with sitelinks and callouts.

---

### 1.3 Call Extension Pipeline

**What it is.** Shows a phone number alongside the ad. On mobile, users can tap to call directly.

**Why it matters.** Essential for businesses that drive phone leads. Less relevant for SaaS but needed for SDK completeness.

**API details.**

- Asset type: `CALL`
- Fields: `country_code` (2-letter), `phone_number`, `call_conversion_reporting_state` (enum), `call_conversion_action` (resource name), `ad_schedule_targets[]`
- Linkage: `CampaignAsset`, `AdGroupAsset`, or `CustomerAsset`

**SDK design.** Already defined:

```typescript
import { call } from '@upspawn/ads'

export default google.search('Campaign', { ... })
  .calls(call('+1-800-555-0123', 'US'))
```

**What's missing:** Same as structured snippets -- the pipeline from types through API.

**Effort.** S -- Follow the sitelink/callout pattern.

**Dependencies.** Campaign asset linking (1.7).

**Priority.** P2 -- Niche for phone-lead businesses.

---

### 1.4 Price Extension Pipeline

**What it is.** Shows a row of pricing cards below the ad with header, description, price, and link for each item (3-8 items).

**Why it matters.** Strong CTR signal for products/services with clear pricing tiers. Lets users self-select their tier before clicking.

**API details.**

- Asset type: `PRICE`
- Fields: `type` (PriceExtensionType enum: BRANDS, EVENTS, LOCATIONS, NEIGHBORHOODS, PRODUCT_CATEGORIES, PRODUCT_TIERS, SERVICE_CATEGORIES, SERVICE_TIERS, SERVICES), `price_qualifier` (FROM, UP_TO, AVERAGE, NONE), `language_code` (BCP 47), `price_offerings[]` (3-8 items)
- Each `PriceOffering`: `header` (25 chars), `description` (25 chars), `price` (Money: `amount_micros` + `currency_code`), `unit` (PER_HOUR, PER_DAY, PER_WEEK, PER_MONTH, PER_YEAR, PER_NIGHT, NONE), `final_url`, `final_mobile_url`
- Linkage: `CampaignAsset`, `AdGroupAsset`, or `CustomerAsset`

**SDK design.** Already defined:

```typescript
import { price } from '@upspawn/ads'

export default google.search('Campaign', { ... })
  .prices(price([
    { header: 'Starter', description: '50 renames/mo', price: '$9/mo', unit: 'per-month', url: '/pricing' },
    { header: 'Pro', description: 'Unlimited renames', price: '$19/mo', unit: 'per-month', url: '/pricing' },
    { header: 'Team', description: '5 seats included', price: '$49/mo', unit: 'per-month', url: '/pricing' },
  ], 'from'))
```

**What's missing:** Pipeline. Also need to convert human-readable `price: '$9/mo'` to API's `amount_micros` + `currency_code` during flatten, and reverse during codegen.

**Effort.** M -- Price has more complex serialization (Money type, units, multiple offerings) than simpler extensions.

**Dependencies.** Campaign asset linking (1.7).

**Priority.** P2 -- Useful for SaaS with clear pricing, but not blocking.

---

### 1.5 Promotion Extension Pipeline

**What it is.** Shows a sale/discount callout below the ad. Can include promo codes, minimum order amounts, and occasion tags (Black Friday, etc.).

**Why it matters.** Drives urgency and CTR during promotions. Time-limited, so particularly useful with start/end dates.

**API details.**

- Asset type: `PROMOTION`
- Fields: `promotion_target` (20 chars), `discount_modifier` (NONE, UP_TO), `percent_off` or `money_amount_off` (Money), `promotion_code`, `orders_over_amount` (Money), `occasion` (PromotionExtensionOccasion enum -- 30+ values), `language_code`, `start_date`, `end_date`, `ad_schedule_targets[]`
- Linkage: `CampaignAsset`, `AdGroupAsset`, or `CustomerAsset`

**SDK design.** Already defined:

```typescript
import { promotion } from '@upspawn/ads'

export default google.search('Campaign', { ... })
  .promotions(promotion({
    discountType: 'percent',
    discountPercent: 20,
    occasion: 'BLACK_FRIDAY',
    startDate: '2026-11-25',
    endDate: '2026-12-02',
    url: 'https://renamed.to/pricing',
  }))
```

**What's missing:** Pipeline.

**Effort.** M -- Similar to price extensions in complexity (Money type, dates, enums).

**Dependencies.** Campaign asset linking (1.7).

**Priority.** P2 -- Seasonal, niche use case.

---

### 1.6 Image Extension Pipeline

**What it is.** Shows an image alongside the search ad. Increases visual prominence on the SERP.

**Why it matters.** Image extensions can significantly boost CTR on Search ads. Becoming more common as Google expands visual formats.

**API details.**

- Asset type: `IMAGE`
- Asset field types: `AD_IMAGE` (for image extensions on Search)
- Image asset creation: upload raw bytes via `AssetService.MutateAssets` with `image_asset.data` (base64-encoded)
- Constraints: square (1:1, min 300x300) required; landscape (1.91:1) recommended; max 5120KB
- Image assets are immutable -- cannot update, only create or remove
- Linkage: `CampaignAsset` or `AdGroupAsset`

**SDK design.** Already defined:

```typescript
import { image } from '@upspawn/ads'

export default google.search('Campaign', { ... })
  .images(
    image('./assets/hero-square.png', 'AI File Renamer screenshot'),
  )
```

**What's missing:** Image asset upload pipeline (read file from disk, base64 encode, create asset, get resource name, link to campaign). This is a prerequisite for Display and PMax too.

**Effort.** M -- File I/O + asset creation + linking. The image upload pattern will be reused across Display, PMax, and Demand Gen.

**Dependencies.** None, but unblocks Phase 2 and 3.

**Priority.** P2 for Search (image extensions are optional), but the underlying image asset upload is P0 for Phases 2-5.

---

### 1.7 Campaign Asset Linking

**What it is.** Proper creation of `CampaignAsset` resources to associate assets (sitelinks, callouts, snippets, calls, prices, promotions, images) with specific campaigns. Currently, assets are created but linking may not follow the full `Asset` + `CampaignAsset` two-step pattern for all types.

**Why it matters.** Without proper asset linking, extensions may not serve on the intended campaigns, or may serve account-wide when they should be campaign-scoped.

**API details.**

- Create `Asset` resource first (via `AssetService`)
- Create `CampaignAsset` link: `{ asset: 'customers/{id}/assets/{assetId}', campaign: 'customers/{id}/campaigns/{campaignId}', field_type: AssetFieldType }` via `CampaignAssetService`
- Also supports `AdGroupAsset` for group-level overrides
- `CustomerAsset` for account-wide defaults
- Removal: remove the link (`CampaignAsset`), not the asset itself

**SDK design.** No new user-facing API needed -- the existing `.sitelinks()`, `.callouts()`, `.snippets()` etc. should implicitly create the correct `CampaignAsset` links during `apply`. The change is internal to the apply pipeline.

**Effort.** M -- Audit existing sitelink/callout apply flow, add `CampaignAsset` creation for all extension types, handle the two-step (create asset, then link) in the mutation batch with temporary resource names.

**Dependencies.** None.

**Priority.** P1 -- Correctness issue. Extensions must be properly linked to serve reliably.

---

### 1.8 Keyword Updates

**What it is.** Mutate existing keywords: change bid (`cpc_bid_micros`), status (enabled/paused), or final URL. Keyword text and match type are immutable (requires remove + create).

**Why it matters.** Keyword bid management is one of the most common ongoing optimizations. Without keyword updates, users must remove and recreate keywords to change bids, losing quality score history.

**API details.**

- Resource: `AdGroupCriterion`
- Mutable fields: `cpc_bid_micros` (int64), `status` (ENABLED=2, PAUSED=3), `final_urls[]`, `final_mobile_urls[]`, `tracking_url_template`, `url_custom_parameters[]`
- Immutable fields: `keyword.text`, `keyword.match_type` (require remove + create)
- Update mask: must specify exactly which fields are changing (e.g., `update_mask: 'cpc_bid_micros,status'`)
- Identification: `ad_group_criterion.resource_name` = `customers/{id}/adGroupCriteria/{adGroupId}~{criterionId}`

**SDK design.** No builder API change needed. The diff engine already detects field changes on keyword resources. The apply layer needs to emit `update` mutations with proper update masks instead of `remove + create` for mutable field changes.

**Effort.** S -- The diff engine already handles this conceptually. Need to add update mask generation and distinguish mutable vs immutable field changes in the apply layer.

**Dependencies.** None.

**Priority.** P0 -- Blocking for practical campaign management. Bid changes are the #1 ongoing operation.

---

### 1.9 Ad Updates

**What it is.** Mutate existing RSA ads: change headlines, descriptions, final URL, path fields, or status. Unlike keywords, RSA ads CAN be updated in place for most fields.

**Why it matters.** Ad copy iteration is constant. Without updates, changing a headline requires removing the ad (losing performance history and ad strength signals) and creating a new one.

**API details.**

- Resource: `AdGroupAd` (wraps `Ad`)
- Mutable fields on `AdGroupAd`: `status` (ENABLED=2, PAUSED=3)
- Mutable fields on `Ad` (via `ad_group_ad.ad`): `responsive_search_ad.headlines[]`, `responsive_search_ad.descriptions[]`, `final_urls[]`, `path1`, `path2`, `tracking_url_template`
- Update: use `AdGroupAdService.MutateAdGroupAds` with `update` operation
- Update mask examples: `ad.responsive_search_ad.headlines`, `ad.responsive_search_ad.descriptions`, `ad.final_urls`, `status`
- Identity: `ad_group_ad.resource_name` = `customers/{id}/adGroupAds/{adGroupId}~{adId}`

**SDK design.** No builder API change. The diff engine currently uses content hashing for RSA identity (hash of sorted headlines + descriptions + finalUrl). This needs refinement: once an RSA has a platform ID, changes to its content should produce an `update` mutation rather than `remove + create`.

The challenge is identity: the SDK tracks RSAs by content hash because they lack user-assigned names. Once imported with a platform ID, the cache maps `contentHash -> platformId`. If content changes, the hash changes, and the diff sees it as a new resource. The solution is to use the cache's platform ID mapping as the stable identity after initial creation.

**Effort.** M -- Requires changes to diff identity logic for RSAs. The current content-hash identity model works for create/delete but breaks for updates. Need a fallback identity strategy that uses cached platform IDs.

**Dependencies.** None.

**Priority.** P0 -- Blocking for practical ad management. Ad copy testing is fundamental.

---

### 1.10 Audience Targeting (Ad Group Level)

**What it is.** Target or observe specific audience segments at the ad group level: remarketing lists, in-market segments, affinity segments, custom audiences, combined audiences, and customer match lists.

**Why it matters.** Audience layering is essential for RLSA (remarketing lists for search ads), which is one of the highest-ROI Search tactics. Also required for Display, Demand Gen, and PMax.

**API details.**

- Resource: `AdGroupCriterion` with criterion types:
  - `UserListInfo` -> `user_list` resource name (remarketing, customer match)
  - `UserInterestInfo` -> `user_interest_category` resource name (in-market, affinity)
  - `CustomAudienceInfo` -> `custom_audience` resource name
  - `CombinedAudienceInfo` -> `combined_audience` resource name
- Bid modifier: `ad_group_criterion.bid_modifier` (e.g., 1.5 = +50% for this audience)
- Audience mode: `ad_group.targeting_setting.target_restrictions[]` controls whether audiences are in "observation" (bid-only) or "targeting" (restrict delivery) mode per criterion type

**SDK design.** Helpers already exist (`audiences()`, `audienceTargeting()`, `remarketing()`, `inMarket()`, `affinity()`, `customAudience()`, `customerMatch()`). Types already defined (`AudienceRef`, `AudienceTarget`).

```typescript
export default google.search('Search - RLSA', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  targeting: targeting(
    geo('US'),
    languages('en'),
    // Observation mode: bid +50% for past visitors, don't restrict delivery
    audiences(
      remarketing('all-visitors-30d', { bidAdjustment: 0.5 }),
      inMarket('80432', { name: 'Business Software' }),
    ),
  ),
})
  .group('main', {
    keywords: exact('rename files'),
    ad: rsa(headlines(...), descriptions(...), url('https://renamed.to')),
    // Override to targeting mode at ad group level: only show to cart abandoners
    targeting: targeting(
      audienceTargeting(remarketing('cart-abandoners-7d')),
    ),
  })
```

**What's missing:** Flatten, fetch (GAQL for `ad_group_criterion` with audience types), apply (create `AdGroupCriterion` with the right criterion oneof), and codegen.

**Effort.** M -- Multiple criterion types to handle, but the targeting helper pattern is already established. The main work is GAQL queries for each criterion type and the mutation builder.

**Dependencies.** None for Search. For Display/Demand Gen, audiences become required.

**Priority.** P1 -- RLSA is a high-value feature. Required for Display and Demand Gen campaigns.

---

### 1.11 Demographic Targeting

**What it is.** Target or exclude users by age range, gender, parental status, or household income at the campaign or ad group level.

**Why it matters.** Allows excluding irrelevant demographics (e.g., exclude ages 18-24 for B2B) or bid-adjusting for high-value segments. Required for Display.

**API details.**

- Resources: `CampaignCriterion` or `AdGroupCriterion` with:
  - `AgeRangeInfo.type`: `AGE_RANGE_18_24`, `AGE_RANGE_25_34`, `AGE_RANGE_35_44`, `AGE_RANGE_45_54`, `AGE_RANGE_55_64`, `AGE_RANGE_65_UP`, `AGE_RANGE_UNDETERMINED`
  - `GenderInfo.type`: `MALE`, `FEMALE`, `UNDETERMINED`
  - `ParentalStatusInfo.type`: `PARENT`, `NOT_A_PARENT`, `UNDETERMINED`
  - `IncomeRangeInfo.type`: `INCOME_RANGE_0_50`, ..., `INCOME_RANGE_90_100`, `INCOME_RANGE_UNDETERMINED`
- Supports both positive (include) and negative (exclude) criteria
- Supports bid modifiers on positive criteria

**SDK design.** Helper already exists:

```typescript
targeting(
  demographics({
    ageRanges: ['25-34', '35-44', '45-54'],
    genders: ['male', 'female'],
    incomes: ['top-10', 'top-20'],
  }),
)
```

**What's missing:** Flatten, fetch, apply, codegen for demographic criteria.

**Effort.** S -- Simple enum-based criteria. The targeting type and helper are already defined.

**Dependencies.** None.

**Priority.** P2 -- Optional optimization for Search. More important for Display (Phase 2).

---

### 1.12 Location Bid Adjustments

**What it is.** Set bid modifiers for specific geographic locations. For example, bid +30% in California while keeping the base bid for the rest of the US.

**Why it matters.** Geo bid optimization lets advertisers spend more in high-converting locations without creating separate campaigns per region.

**API details.**

- Resource: `CampaignCriterion` with `LocationInfo` and `bid_modifier`
- Geo target constant: `geoTargetConstants/{criterionId}` (e.g., US=2840, California=21137)
- `bid_modifier`: double (1.0 = no change, 1.3 = +30%, 0.7 = -30%)
- Lookup: `GeoTargetConstantService.SuggestGeoTargetConstants` to resolve names to IDs

**SDK design.** Extend existing `geo()` helper to support bid adjustments:

```typescript
targeting(
  geo('US'),                           // base geo (no modifier)
  geoBid('California', 0.3),           // +30% in California
  geoBid('New York', 0.2),             // +20% in New York
  geoBid('Wyoming', -0.5),             // -50% in Wyoming
)
```

**Effort.** S -- Already have geo targeting. Need to add bid_modifier support to the CampaignCriterion for LocationInfo.

**Dependencies.** None.

**Priority.** P2 -- Useful optimization, not required for basic campaign management.

---

### 1.13 Ad Schedule Bid Adjustments

**What it is.** Set bid modifiers for specific days and time ranges. For example, bid +20% on weekday mornings when conversion rates are higher.

**Why it matters.** Time-of-day optimization is a standard tactic. The SDK already supports schedule targeting (on/off), but not schedule-based bid adjustments.

**API details.**

- Resource: `CampaignCriterion` with `AdScheduleInfo` and `bid_modifier`
- Fields: `day_of_week` (MONDAY-SUNDAY), `start_hour` (0-23), `start_minute` (ZERO, FIFTEEN, THIRTY, FORTY_FIVE), `end_hour` (0-24), `end_minute`, `bid_modifier`

**SDK design.** Helper already exists:

```typescript
targeting(
  scheduleBid('mon', 9, 17, 0.2),   // +20% Mon 9am-5pm
  scheduleBid('sat', 0, 24, -0.3),  // -30% all day Saturday
)
```

**What's missing:** Flatten/apply for `ScheduleBidTarget` type (the type exists, pipeline doesn't).

**Effort.** S -- The type and helper are defined. Need flatten/fetch/apply for `CampaignCriterion` with `AdScheduleInfo` + `bid_modifier`.

**Dependencies.** None.

**Priority.** P2 -- Optimization feature.

---

### 1.14 Campaign Conversion Goals

**What it is.** Per-campaign control over which conversion actions are used for bidding. By default, all account-level conversion goals apply. Campaign conversion goals let you override this -- e.g., a signup campaign bids on signups only, not purchases.

**Why it matters.** Without this, all campaigns optimize toward the same conversion actions. Multi-funnel advertisers need campaign-specific goals.

**API details.**

- Resource: `CampaignConversionGoal`
- Fields: `category` (ConversionActionCategory enum), `origin` (ConversionOrigin: WEBSITE, APP, PHONE_CALL, IMPORT, GOOGLE_HOSTED, STORE), `biddable` (bool -- whether this goal is used for bidding)
- Goals are auto-created from `(category, origin)` pairs of existing conversion actions
- Set `biddable = true/false` per goal per campaign
- Related: `primary_for_goal` on `ConversionAction` determines primary vs secondary

**SDK design.**

```typescript
export default google.search('Search - Signups Only', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US')),
  // Only optimize for signup conversions, not purchases
  conversionGoals: {
    include: [{ category: 'signup', origin: 'website' }],
    // Everything else is excluded from bidding (biddable = false)
  },
})
```

Alternative: reference conversion actions by name:

```typescript
conversionGoals: ['Signup - Website', 'Lead Form Submit'],
```

**Effort.** M -- New resource type (CampaignConversionGoal) with its own GAQL, mutations, and codegen. Also needs awareness of account-level ConversionAction resources to resolve names to `(category, origin)` pairs.

**Dependencies.** Conversion actions (Phase 6, item 40) for full functionality. Can be partially implemented with pre-existing conversion actions.

**Priority.** P1 -- Critical for multi-campaign accounts with different conversion funnels.

---

### 1.15 Ad Group Negatives in Codegen

**What it is.** The codegen (import) command should emit ad-group-level negative keywords in the generated TypeScript. Flatten already supports them, but codegen may not emit them.

**Why it matters.** Without this, importing a campaign with ad-group negatives and running `plan` shows phantom diffs (negatives appear as additions).

**API details.** Already implemented in fetch (GAQL for `ad_group_criterion` with `negative = TRUE`). The `Resource[]` already contain ad-group negatives. Codegen needs to render them.

**SDK design.** No API change. Codegen should emit:

```typescript
.group('main', {
  keywords: exact('rename files'),
  ad: rsa(...),
  negatives: negatives('free', 'open source'),
})
```

**Effort.** S -- Check if codegen already handles this; if not, add the `negatives` field to the group template in `codegen.ts`.

**Dependencies.** None.

**Priority.** P0 -- Zero-diff round-trips are a core invariant. If this is broken, import/plan is unreliable.

---

## Phase 2: Display Campaigns

Everything needed for Google Display Network campaigns.

---

### 2.1 Display Campaign Type

**What it is.** A new campaign type for the Google Display Network (GDN). Display campaigns serve image-based and responsive ads across millions of websites, apps, and Google properties.

**Why it matters.** Display is the second most common campaign type after Search. Used for brand awareness, retargeting, and prospecting. The single biggest driver of demand for new campaign types.

**API details.**

- `advertising_channel_type`: `DISPLAY` (enum value 3)
- Ad group type: `DISPLAY_STANDARD`
- Budget: standard `CampaignBudget` (same as Search)
- Bidding: Manual CPC, Manual CPM, Enhanced CPC, Maximize Clicks, Maximize Conversions, Target CPA, Target ROAS, vCPM
- Network settings: `target_content_network = true` (GDN), optionally `target_google_search` for mixed
- No keywords in the Search sense -- Display uses audience/placement/topic/content keyword targeting

**SDK design.**

```typescript
export default google.display('Display - Retargeting', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  targeting: targeting(
    geo('US', 'DE'),
    languages('en'),
  ),
})
  .group('responsive', {
    ad: responsiveDisplay({
      headlines: ['Rename Files with AI', 'Try Free'],
      longHeadline: 'AI Reads Your Files and Renames Them Automatically',
      descriptions: ['50 free renames. No install needed.'],
      businessName: 'renamed.to',
      images: {
        landscape: ['./assets/hero-landscape.png'],
        square: ['./assets/hero-square.png'],
      },
      logos: ['./assets/logo-square.png'],
    }),
    targeting: targeting(
      audiences(remarketing('all-visitors-30d')),
      topics('Business Software', 'Productivity'),
    ),
  })
```

Key design decisions:
- `google.display()` returns a new builder type (`DisplayCampaignBuilder`) that accepts Display-specific ad groups
- Ad groups use targeting (audiences, placements, topics, content keywords) instead of Search keywords
- Group-level `targeting` restricts where ads in that group serve

**Effort.** L -- New campaign type, new builder, new ad group structure without keywords, new targeting criterion types (placements, topics, content keywords). Significant new code but follows established patterns.

**Dependencies.** Image asset management (2.6) for ad creative upload.

**Priority.** P1 -- Second most common campaign type.

---

### 2.2 Responsive Display Ads (RDA)

**What it is.** The primary ad format for Display campaigns. You provide headlines, descriptions, images, and logos; Google assembles them into the best-performing combinations.

**Why it matters.** RDA is the default and recommended format for Display. It adapts to every ad slot size automatically.

**API details.**

- Resource: `Ad.responsive_display_ad` -> `ResponsiveDisplayAdInfo`
- Required fields:
  - `headlines[]`: AdTextAsset[], min 1, max 5, each max 30 chars
  - `long_headline`: AdTextAsset, required, max 90 chars
  - `descriptions[]`: AdTextAsset[], min 1, max 5, each max 90 chars
  - `marketing_images[]`: AdImageAsset[], required, landscape 1.91:1 (min 600x314), combined with square max 15
  - `square_marketing_images[]`: AdImageAsset[], required, square 1:1 (min 300x300)
  - `business_name`: string, required, max 25 chars
- Optional fields:
  - `logo_images[]`: landscape 4:1 (min 512x128), combined with square max 5
  - `square_logo_images[]`: square 1:1 (min 128x128)
  - `youtube_videos[]`: AdVideoAsset[]
  - `main_color`, `accent_color`: hex colors
  - `call_to_action_text`: max 30 chars
  - `format_setting`: ALL_FORMATS (default), NON_NATIVE, NATIVE
- Parent `Ad` also needs `final_urls[]`

**SDK design.**

```typescript
import { responsiveDisplay, landscape, square } from '@upspawn/ads'

responsiveDisplay({
  headlines: ['Rename Files with AI', 'Organize Files Instantly'],
  longHeadline: 'AI Reads Your Files and Renames Them Based on Content',
  descriptions: ['Upload files. AI reads them. Get organized names.', '50 free renames.'],
  images: {
    landscape: [landscape('./assets/hero.png')],
    square: [square('./assets/square.png')],
  },
  logos: [square('./assets/logo.png')],
  businessName: 'renamed.to',
  finalUrl: 'https://www.renamed.to',
  callToAction: 'Try Free',
  colors: { main: '#1a1a2e', accent: '#16a34a' },
})
```

**Effort.** M -- New ad type with image assets. The main complexity is image asset references (linking uploaded image assets to the ad).

**Dependencies.** Display campaign type (2.1), image asset management (2.6).

**Priority.** P1 -- Cannot run Display campaigns without RDA.

---

### 2.3 Image Ads

**What it is.** Static image ads uploaded as a single complete creative. The image IS the ad -- no text assembly.

**Why it matters.** Useful when advertisers have designer-created banners or need pixel-perfect control. Less common than RDA but still used.

**API details.**

- Resource: `Ad.image_ad` -> `ImageAdInfo`
- Fields: `image_asset` (resource name), `pixel_width`, `pixel_height` (output only), `mime_type` (JPEG, GIF, PNG)
- Common sizes: 300x250, 728x90, 160x600, 336x280, 320x50
- Parent `Ad` needs `final_urls[]`, `display_url`

**SDK design.**

```typescript
import { imageAd } from '@upspawn/ads'

.group('banners', {
  ad: [
    imageAd('./assets/banner-300x250.png', { finalUrl: 'https://renamed.to' }),
    imageAd('./assets/banner-728x90.png', { finalUrl: 'https://renamed.to' }),
  ],
  targeting: targeting(placements('gmail.com')),
})
```

**Effort.** M -- Simple ad format, but requires image upload pipeline.

**Dependencies.** Display campaign type (2.1), image asset management (2.6).

**Priority.** P2 -- RDA is the recommended format. Image ads are for specific use cases.

---

### 2.4 Display Targeting

**What it is.** The full set of targeting criteria available for Display ad groups: placements (specific websites/apps), topics (content categories), content keywords (contextual), audiences (in-market, affinity, custom, remarketing), and demographics.

**Why it matters.** Targeting IS the Display campaign. Without targeting options, Display campaigns can't be scoped to relevant audiences or content.

**API details.**

- All set as `AdGroupCriterion` (ad group level):
  - `PlacementInfo`: `url` field (website URL, app, YouTube channel)
  - `TopicInfo`: `topic_constant` resource name (`topicConstants/{verticalId}`)
  - `KeywordInfo`: same resource as Search keywords, but used for contextual targeting
  - `UserInterestInfo`: in-market and affinity categories
  - `CustomAudienceInfo`: custom intent/affinity audiences
  - `CombinedAudienceInfo`: AND/OR audience combinations
  - `AgeRangeInfo`, `GenderInfo`, `ParentalStatusInfo`, `IncomeRangeInfo`: demographics
- Campaign-level criteria also supported for `LocationInfo`, `LanguageInfo`
- Content exclusions: `content_label` negative criteria at campaign level

**SDK design.**

```typescript
import { placements, topics, contentKeywords } from '@upspawn/ads'

.group('tech-sites', {
  ad: responsiveDisplay({ ... }),
  targeting: targeting(
    placements('techcrunch.com', 'producthunt.com', 'arstechnica.com'),
    topics('Business Software', 'Cloud Storage'),
    contentKeywords('file management', 'document organization'),
    audiences(
      inMarket('80432', { name: 'Business Software' }),
      affinity('80101', { name: 'Tech Enthusiasts' }),
    ),
    demographics({ ageRanges: ['25-34', '35-44'] }),
  ),
})
```

New helpers needed: `placements()`, `topics()`, `contentKeywords()`. Existing helpers cover audiences and demographics.

**Effort.** M -- Multiple new criterion types. Each needs GAQL query, flatten/apply logic, and codegen. But they all follow the same `AdGroupCriterion` pattern.

**Dependencies.** Display campaign type (2.1).

**Priority.** P1 -- Cannot scope Display campaigns without targeting.

---

### 2.5 Display Bidding

**What it is.** Display-specific bidding strategies not yet supported: Manual CPM, viewable CPM (vCPM), and Target CPM.

**Why it matters.** CPM bidding is the standard for brand awareness Display campaigns. The SDK currently only supports CPC-based and conversion-based strategies.

**API details.**

- `MANUAL_CPM`: `campaign.manual_cpm` (empty -- no parameters)
- `TARGET_CPM`: `campaign.target_cpm` (empty -- auto-optimized)
- vCPM: Uses `MANUAL_CPM` with viewable impression optimization enabled via campaign settings
- Enum values: `MANUAL_CPM` = 12, `TARGET_CPM` = 14

**SDK design.**

```typescript
google.display('Display - Awareness', {
  budget: daily(20),
  bidding: 'manual-cpm',                                // new shorthand
  // or
  bidding: { type: 'target-cpm' },                      // new strategy
  // or
  bidding: { type: 'manual-cpm', viewable: true },      // vCPM
})
```

**Effort.** S -- Add two new entries to `BiddingStrategy` union, normalize in `normalizeBidding()`, handle in apply.

**Dependencies.** Display campaign type (2.1).

**Priority.** P2 -- Maximize Conversions and Maximize Clicks already work for Display. CPM is nice to have.

---

### 2.6 Image Asset Management

**What it is.** A reusable pipeline for uploading, referencing, and managing image assets. Images are uploaded once as `Asset` resources and then linked to campaigns, ad groups, or asset groups via separate link resources.

**Why it matters.** This is the foundation for Display (RDA, Image Ads), PMax (asset groups), Demand Gen, and Search image extensions. Every non-Search campaign type requires images.

**API details.**

- Create: `AssetService.MutateAssets` with `create` operation
  - `asset.image_asset.data`: base64-encoded raw bytes
  - `asset.image_asset.file_size`: byte count
  - `asset.image_asset.mime_type`: IMAGE_JPEG, IMAGE_PNG, IMAGE_GIF
  - `asset.name`: optional human-readable name
- Image assets are **immutable** -- cannot update content, only create or remove
- Size limit: 5120KB per image
- Returns: `asset.resource_name` for linking
- Linking: use the resource name in `CampaignAsset`, `AdGroupAsset`, `AssetGroupAsset`, or inline in ad creative fields
- Fetch: GAQL `SELECT asset.name, asset.image_asset.full_size.url, asset.image_asset.file_size FROM asset WHERE asset.type = 'IMAGE'`

**SDK design.** Images referenced by local file path in campaign definitions. The SDK handles upload during `apply`:

```typescript
// In campaign definition -- reference local files
images: {
  landscape: [landscape('./assets/hero.png')],
  square: [square('./assets/square.png')],
}

// Helper functions validate aspect ratio and return typed refs
function landscape(path: string): ImageRef   // 1.91:1
function square(path: string): ImageRef      // 1:1
function portrait(path: string): ImageRef    // 4:5
function logo(path: string): ImageRef        // 1:1 or 4:1
```

During `apply`:
1. Read file from disk
2. Validate size (< 5120KB) and dimensions
3. Check cache for existing asset (by content hash)
4. Upload if new, get resource name
5. Link to campaign/ad group/asset group

During `import`:
1. Fetch image asset URLs from API
2. Download to local `assets/` directory
3. Generate codegen with local paths

**Effort.** M -- File I/O, base64 encoding, content-hash caching, download on import. The upload/download pipeline is straightforward but needs to be robust (size validation, retry on failure, deduplication).

**Dependencies.** None.

**Priority.** P0 -- Blocks every non-Search campaign type.

---

## Phase 3: Performance Max Campaigns

Everything needed for PMax -- Google's AI-driven, cross-channel campaign type.

---

### 3.1 PMax Campaign Type

**What it is.** Performance Max campaigns use Google's AI to serve ads across all Google surfaces (Search, Display, YouTube, Discover, Gmail, Maps) from a single campaign. Instead of ad groups with keywords, PMax uses asset groups with creative assets and audience signals.

**Why it matters.** PMax is Google's strategic priority and is replacing several legacy campaign types. It's now the recommended type for e-commerce (replacing Shopping) and is increasingly used for lead generation. Many Google Ads accounts have PMax as their largest campaign.

**API details.**

- `advertising_channel_type`: `PERFORMANCE_MAX` (enum value 10)
- **No ad groups** -- uses `AssetGroup` instead
- Bidding: **Only** Maximize Conversions (with optional target CPA) or Maximize Conversion Value (with optional target ROAS). No manual bidding.
- Budget: standard `CampaignBudget` with `explicitly_shared = false`
- Campaign-level fields: `brand_guidelines_enabled` (immutable after creation), shopping_setting (for retail PMax)
- Location and language targeting at campaign level via `CampaignCriterion`
- No keyword targeting, no placement targeting -- Google AI handles all targeting
- URL expansion: `campaign.url_expansion_opt_out = true/false` controls whether Google can serve on URLs beyond `final_urls`

**SDK design.**

```typescript
export default google.performanceMax('PMax - General', {
  budget: daily(20),
  bidding: { type: 'maximize-conversions', targetCpa: 10 },
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
  urlExpansion: false, // restrict to provided final URLs
})
  .assetGroup('main', {
    finalUrls: ['https://www.renamed.to'],
    headlines: ['AI File Renamer', 'Rename Files Instantly', 'Try Free'],
    longHeadlines: ['AI Reads Your Files and Renames Them Based on Content'],
    descriptions: [
      'Upload files. AI reads content. Get organized filenames.',
      '50 free renames to start. No credit card.',
    ],
    images: {
      landscape: [landscape('./assets/hero-landscape.png')],
      square: [square('./assets/hero-square.png')],
    },
    logos: [square('./assets/logo.png')],
    businessName: 'renamed.to',
    callToAction: 'Try Free',
  })
  .assetGroup('video-focused', {
    finalUrls: ['https://www.renamed.to'],
    headlines: ['See AI Rename Files Live'],
    longHeadlines: ['Watch AI Read and Rename Your Files in Real Time'],
    descriptions: ['Upload a file. Watch the magic. 50 free renames.'],
    images: {
      landscape: [landscape('./assets/video-thumb.png')],
      square: [square('./assets/video-thumb-sq.png')],
    },
    logos: [square('./assets/logo.png')],
    videos: ['https://youtube.com/watch?v=abc123'],
    businessName: 'renamed.to',
  })
```

Key design:
- `google.performanceMax()` returns a `PMaxCampaignBuilder` with `.assetGroup()` (not `.group()`)
- Bidding restricted to maximize-conversions and maximize-conversion-value at the type level
- No keywords or ad-group-level targeting

**Effort.** XL -- Completely new resource model (AssetGroup instead of AdGroup), new GAQL queries (asset_group, asset_group_asset, asset_group_signal), new flatten logic, new apply pipeline with multi-resource batch mutations (campaign + budget + asset group + asset links in one request), new codegen templates. The most complex new campaign type.

**Dependencies.** Image asset management (2.6).

**Priority.** P1 -- PMax is Google's flagship campaign type.

---

### 3.2 Asset Groups

**What it is.** The PMax equivalent of ad groups. Each asset group contains text assets (headlines, descriptions), image assets, optional video assets, audience signals, and final URLs. Google's AI assembles these into ads for every surface.

**Why it matters.** Asset groups ARE PMax. A PMax campaign without asset groups is invalid.

**API details.**

- Resource: `AssetGroup`
  - `name`: required
  - `campaign`: resource name (required)
  - `final_urls[]`: required landing page URLs
  - `final_mobile_urls[]`: optional
  - `status`: ENABLED, PAUSED, REMOVED
  - `path1`, `path2`: display URL paths (like RSA)
- Assets linked via `AssetGroupAsset`:
  - `asset_group`: resource name
  - `asset`: resource name (created via `AssetService`)
  - `field_type`: HEADLINE, LONG_HEADLINE, DESCRIPTION, MARKETING_IMAGE, SQUARE_MARKETING_IMAGE, PORTRAIT_MARKETING_IMAGE, LOGO, LANDSCAPE_LOGO, YOUTUBE_VIDEO, CALL_TO_ACTION_SELECTION, BUSINESS_NAME
- Asset requirements (non-retail):
  - HEADLINE: min 3, max 15 (30 chars each)
  - LONG_HEADLINE: min 1, max 5 (90 chars each)
  - DESCRIPTION: min 2, max 5 (90 chars each)
  - MARKETING_IMAGE: min 1, max 20 (landscape 1.91:1)
  - SQUARE_MARKETING_IMAGE: min 1, max 20 (square 1:1)
  - LOGO: min 1, max 20 (when brand guidelines disabled)
  - BUSINESS_NAME: 1 required (25 chars, when brand guidelines disabled)
- Max 100 asset groups per campaign

**SDK design.** See 3.1 -- the `.assetGroup()` builder method. Validation at construction time:

```typescript
// These would be compile-time and runtime validated:
.assetGroup('main', {
  finalUrls: ['https://www.renamed.to'],
  headlines: ['H1', 'H2', 'H3'],          // min 3 validated
  longHeadlines: ['Long headline'],         // min 1 validated
  descriptions: ['D1', 'D2'],              // min 2 validated
  images: {
    landscape: [landscape('./a.png')],      // min 1 validated
    square: [square('./b.png')],            // min 1 validated
  },
  logos: [square('./logo.png')],            // min 1 validated
  businessName: 'renamed.to',              // required validated
})
```

**Effort.** L -- Covered as part of PMax campaign type (3.1). The main work is the multi-resource creation (text assets via AssetService, image upload, then AssetGroupAsset links) all in a single batched mutation using temporary resource names.

**Dependencies.** PMax campaign type (3.1).

**Priority.** P1 -- Required for PMax.

---

### 3.3 Audience Signals

**What it is.** Optional hints to PMax's AI about which audiences are most likely to convert. Not hard targeting -- Google AI will expand beyond these signals if it finds better audiences.

**Why it matters.** Audience signals significantly improve PMax ramp-up time. Without them, Google starts from scratch. With good signals, the AI converges faster.

**API details.**

- Resource: `AssetGroupSignal`
  - `asset_group`: resource name
  - `audience`: `AudienceInfo` containing `UserListInfo[]`, `UserInterestInfo[]`, `CustomAudienceInfo[]`, `CombinedAudienceInfo[]`, `DetailedDemographicInfo[]`, `LifeEventInfo[]`
- Supports: remarketing lists, customer match lists, in-market, affinity, custom audiences, combined audiences, detailed demographics, life events
- Not a targeting restriction -- a signal/hint to the AI

**SDK design.**

```typescript
.assetGroup('main', {
  // ... assets ...
  audienceSignal: targeting(
    audiences(
      remarketing('all-visitors-30d'),
      customerMatch('existing-customers'),
    ),
    audiences(
      inMarket('80432', { name: 'Business Software' }),
      affinity('80101', { name: 'Tech Enthusiasts' }),
    ),
  ),
})
```

Reuses existing audience helpers. The distinction between "signal" and "targeting" is semantic -- same data structure, different API resource.

**Effort.** M -- New resource type (AssetGroupSignal) with GAQL, mutations, codegen. Reuses audience type system.

**Dependencies.** PMax campaign type (3.1), audience targeting (1.10).

**Priority.** P2 -- PMax works without signals, but performs better with them.

---

### 3.4 Retail PMax (Merchant Center)

**What it is.** PMax connected to a Merchant Center feed for product-based ads. The feed provides product images, titles, prices; PMax serves them across all surfaces. Replaces Smart Shopping campaigns.

**Why it matters.** Retail PMax is the standard for e-commerce advertisers. It's a significant market segment.

**API details.**

- Campaign-level: `campaign.shopping_setting.merchant_id` (required), `campaign.shopping_setting.feed_label` (optional, for multi-feed accounts)
- Asset group: `AssetGroupListingGroupFilter` for product partitions (similar to Shopping's listing groups)
  - `UNIT_INCLUDED`, `UNIT_EXCLUDED`, `SUBDIVISION` node types
  - Filter dimensions: brand, category_l1-l5, condition, custom_attribute_0-4, item_id, product_type_l1-l5
- Retail PMax auto-generates minimum assets from the product feed; additional text/image assets are recommended but optional
- `listing_group_filter_product_group_id`: string identifier for the product group

**SDK design.**

```typescript
export default google.performanceMax('PMax - All Products', {
  budget: daily(30),
  bidding: { type: 'maximize-conversion-value', targetRoas: 4.0 },
  targeting: targeting(geo('US')),
  merchantId: 123456789,
})
  .assetGroup('all-products', {
    finalUrls: ['https://shop.example.com'],
    headlines: ['Shop Our Products'],
    longHeadlines: ['Premium Products with Free Shipping'],
    descriptions: ['Free shipping. 30-day returns.', 'Shop now.'],
    images: {
      landscape: [landscape('./assets/shop-hero.png')],
      square: [square('./assets/shop-square.png')],
    },
    logos: [square('./assets/logo.png')],
    businessName: 'Example Shop',
    // Product filter: all products
    products: allProducts(),
  })
  .assetGroup('premium-line', {
    // ... assets ...
    // Product filter: specific brand
    products: productFilter(
      brand('Premium Brand'),
    ),
  })
```

New helpers: `allProducts()`, `productFilter()`, `brand()`, `category()`, `customLabel()`, `itemId()`, `productType()`.

**Effort.** L -- Merchant Center integration, listing group filter tree structure (complex nested SUBDIVISION/UNIT model), product filter helpers.

**Dependencies.** PMax campaign type (3.1).

**Priority.** P2 -- Only needed for e-commerce use cases.

---

### 3.5 Brand Guidelines

**What it is.** PMax feature where business name and logo are set at the campaign level (via `CampaignAsset`) instead of per-asset-group. Ensures consistent branding across all asset groups.

**Why it matters.** Simplifies multi-asset-group PMax campaigns. When enabled, business name and logo are inherited by all asset groups.

**API details.**

- `campaign.brand_guidelines_enabled = true` (immutable after creation)
- When enabled: `BUSINESS_NAME` and `BUSINESS_LOGO` linked as `CampaignAsset` (not in asset groups)
- When disabled: `BUSINESS_NAME` and `LOGO` set per asset group via `AssetGroupAsset`
- Not supported for Travel Goals PMax

**SDK design.**

```typescript
export default google.performanceMax('PMax - Branded', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  brandGuidelines: {
    businessName: 'renamed.to',
    logo: square('./assets/logo.png'),
  },
})
  .assetGroup('main', {
    // No businessName or logos needed here -- inherited from campaign
    finalUrls: ['https://www.renamed.to'],
    headlines: ['AI File Renamer'],
    // ...
  })
```

**Effort.** M -- Campaign-level asset linking with immutable flag. Needs validation to prevent setting brand assets in asset groups when guidelines are enabled.

**Dependencies.** PMax campaign type (3.1), image asset management (2.6).

**Priority.** P2 -- Convenience feature.

---

### 3.6 Final URL Expansion

**What it is.** Controls whether PMax can serve ads on URLs beyond those specified in `final_urls`. When enabled, Google's AI will discover and use additional relevant pages on your domain.

**Why it matters.** URL expansion can significantly improve PMax reach but can also drive traffic to irrelevant pages. Advertisers need control.

**API details.**

- Campaign-level: `campaign.url_expansion_opt_out` (bool). `true` = restrict to provided URLs only, `false` = allow expansion (default).
- Can also exclude specific URLs via `campaign_asset` with `PAGE_FEED` type

**SDK design.**

```typescript
google.performanceMax('PMax', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  urlExpansion: false,  // default: true
  // Optional: exclude specific URL patterns
  urlExclusions: ['/admin/*', '/internal/*'],
})
```

**Effort.** S -- Single boolean field on campaign, plus optional page feed exclusion.

**Dependencies.** PMax campaign type (3.1).

**Priority.** P2 -- Simple but useful control.

---

## Phase 4: Shopping Campaigns

Everything needed for standard Shopping campaigns. Note: most new e-commerce advertisers use Retail PMax (Phase 3.4) instead.

---

### 4.1 Shopping Campaign Type

**What it is.** Standard Shopping campaigns display product ads on the Shopping tab and Search results, pulling product data from Merchant Center. Being partially superseded by PMax but still widely used.

**Why it matters.** E-commerce advertisers with Merchant Center feeds. Standard Shopping offers more control over product bidding than Retail PMax.

**API details.**

- `advertising_channel_type`: `SHOPPING` (enum value 4)
- Required: `ShoppingSetting` with `merchant_id` (int64), `campaign_priority` (0-2), `enable_local` (bool)
- Ad group type: `SHOPPING_PRODUCT_ADS`
- Ad format: `SHOPPING_PRODUCT_AD` (empty message -- creative from feed)
- Bidding: Manual CPC, Enhanced CPC, Maximize Clicks, Target ROAS, Maximize Conversion Value
- Targeting: product listing groups (tree-structured partitions), locations, ad schedule

**SDK design.**

```typescript
export default google.shopping('Shopping - All Products', {
  budget: daily(15),
  bidding: { type: 'target-roas', targetRoas: 4.0 },
  merchantId: 123456789,
  campaignPriority: 1,    // 0=low, 1=medium, 2=high
  enableLocal: false,
  targeting: targeting(geo('US')),
})
  .group('all-products', {
    products: allProducts(),
    bid: 0.50,  // default CPC bid for this product group
  })
  .group('premium-products', {
    products: productFilter(
      brand('Premium'),
      category('Electronics', 'Computers'),
    ),
    bid: 1.00,
  })
```

**Effort.** L -- New campaign type with Merchant Center integration and the complex listing group tree structure.

**Dependencies.** Merchant Center connection (external -- not an SDK concern, but merchant_id must exist).

**Priority.** P2 -- Retail PMax is the recommended replacement. Standard Shopping is legacy but still used.

---

### 4.2 Product Groups / Listing Groups

**What it is.** Tree-structured product partitions that control which products from the Merchant Center feed are included in each ad group, and at what bid.

**Why it matters.** Product group structure is the primary lever for bid optimization in Shopping campaigns. Without it, all products get the same bid.

**API details.**

- Resource: `AdGroupCriterion` with `ListingGroup` criterion type
- Tree structure: `SUBDIVISION` nodes branch into child `UNIT` nodes
  - Every subdivision must have an "everything else" unit (catches unmatched products)
- Partition dimensions: `listing_group.case_value` with oneOf:
  - `ProductBrand.value`
  - `ProductCategory.level` + `category_id`
  - `ProductCondition.condition` (NEW, REFURBISHED, USED)
  - `ProductCustomAttribute.index` (0-4) + `value`
  - `ProductItemId.value`
  - `ProductType.level` + `value`
- Bids: set `cpc_bid_micros` on `UNIT` nodes
- Root node: always a single `SUBDIVISION` at the ad group level

**SDK design.**

```typescript
import { allProducts, productFilter, brand, category, customLabel, itemId, everythingElse } from '@upspawn/ads'

.group('segmented', {
  products: productPartition(
    // Subdivision by brand
    subdivision('brand', [
      unit(brand('Apple'), { bid: 1.50 }),
      unit(brand('Samsung'), { bid: 1.00 }),
      unit(everythingElse(), { bid: 0.50 }),
    ]),
  ),
})
```

**Effort.** L -- The tree structure is the most complex targeting model in Google Ads. Every tree must be valid (every subdivision has an everything-else leaf, no orphaned nodes). Validation, flatten, and codegen all need tree-aware logic.

**Dependencies.** Shopping campaign type (4.1).

**Priority.** P2 -- Required for Shopping, but Shopping itself is P2.

---

### 4.3 Shopping Settings

**What it is.** Campaign-level Shopping-specific configuration: Merchant Center account, priority, and local inventory options.

**Why it matters.** Required for Shopping campaign creation.

**API details.**

- `campaign.shopping_setting.merchant_id`: int64, required
- `campaign.shopping_setting.campaign_priority`: int32 (0-2)
- `campaign.shopping_setting.enable_local`: bool
- `campaign.shopping_setting.feed_label`: string (optional, multi-feed)
- `campaign.shopping_setting.use_vehicle_inventory`: bool (auto/vehicle only)

**SDK design.** Covered in the `google.shopping()` builder config (see 4.1).

**Effort.** S -- Fields on the campaign resource. Straightforward serialization.

**Dependencies.** Shopping campaign type (4.1).

**Priority.** P2.

---

## Phase 5: Demand Gen Campaigns

YouTube + Discover + Gmail ads in a single campaign type.

---

### 5.1 Demand Gen Campaign Type

**What it is.** Demand Gen campaigns serve visually rich ads across YouTube (in-feed, in-stream, Shorts), Google Discover, Gmail, and Display. They're Google's answer to Meta's ad surfaces and use similar multi-asset creative formats.

**Why it matters.** Demand Gen is the bridge between Search (intent-based) and Display (awareness). Ideal for mid-funnel engagement. Google is investing heavily in this type.

**API details.**

- `advertising_channel_type`: `DEMAND_GEN`
- No `advertising_channel_sub_type` should be set
- Budget: must be non-shared (`explicitly_shared = false`). Supports total budget via `total_amount_micros` with `period = CUSTOM`
- Bidding: Maximize Clicks, Maximize Conversions, Target CPA, Target ROAS
- Ad group: standard `AdGroup` (no special type -- leave unset)
- Audience targeting required via `AdGroupCriterion` with `Audience` criterion type
- Channel controls at ad group level: `demand_gen_ad_group_settings.channel_controls.selected_channels.{youtube, discover, gmail, display}`
- Best practice: create all resources in a single `Mutate` batch

**SDK design.**

```typescript
export default google.demandGen('Demand Gen - Awareness', {
  budget: daily(25),
  bidding: 'maximize-clicks',
  targeting: targeting(geo('US'), languages('en')),
})
  .group('main', {
    targeting: targeting(
      audiences(
        inMarket('80432', { name: 'Business Software' }),
        affinity('80101', { name: 'Technology Enthusiasts' }),
      ),
    ),
    channels: { youtube: true, discover: true, gmail: false, display: false },
    ads: [
      demandGenMultiAsset({
        headlines: ['AI File Renamer', 'Organize Files in Seconds'],
        descriptions: ['Upload files and get smart names instantly.'],
        images: {
          landscape: [landscape('./assets/hero.png')],
          square: [square('./assets/square.png')],
        },
        logos: [square('./assets/logo.png')],
        businessName: 'renamed.to',
        callToAction: 'Try Free',
        finalUrl: 'https://www.renamed.to',
      }),
    ],
  })
```

Key design:
- `google.demandGen()` returns a `DemandGenCampaignBuilder`
- Groups require audience targeting (enforced at validation time)
- `channels` object controls surface selection

**Effort.** L -- New campaign type, new ad formats, channel controls, audience requirement enforcement. Similar scope to Display but with more ad format complexity.

**Dependencies.** Image asset management (2.6), audience targeting (1.10).

**Priority.** P1 -- Growing campaign type, Google's strategic direction for mid-funnel.

---

### 5.2 Multi-Asset Ads (Demand Gen)

**What it is.** The primary ad format for Demand Gen. Multiple headlines, descriptions, images, and logos assembled by Google into responsive combinations across YouTube, Discover, and Gmail.

**Why it matters.** The default and recommended format for Demand Gen campaigns.

**API details.**

- Resource: `Ad.demand_gen_multi_asset_ad` -> `DemandGenMultiAssetAdInfo`
- Fields:
  - `headlines[]`: AdTextAsset[], min 1, max 5, max 40 chars each (note: 40, not 30 like RSA)
  - `descriptions[]`: AdTextAsset[], min 1, max 5, max 90 chars
  - `marketing_images[]`: AdImageAsset[], landscape 1.91:1
  - `square_marketing_images[]`: AdImageAsset[], square 1:1
  - `portrait_marketing_images[]`: AdImageAsset[], portrait 4:5
  - `logo_images[]`: AdImageAsset[], square 1:1, min 128x128
  - `business_name`: string, required
  - `call_to_action_text`: string, optional
  - `lead_form_only`: bool

**SDK design.** See 5.1 example. Helper:

```typescript
function demandGenMultiAsset(config: {
  headlines: string[]          // max 5, max 40 chars
  descriptions: string[]       // max 5, max 90 chars
  images: {
    landscape: ImageRef[]
    square: ImageRef[]
    portrait?: ImageRef[]
  }
  logos: ImageRef[]
  businessName: string
  callToAction?: string
  finalUrl: string
}): DemandGenAd
```

**Effort.** M -- New ad type with image assets. Follows RDA pattern but with different constraints.

**Dependencies.** Demand Gen campaign type (5.1), image asset management (2.6).

**Priority.** P1 -- Required for Demand Gen.

---

### 5.3 Carousel Ads (Demand Gen)

**What it is.** Swipeable card format for Demand Gen. Each card has its own image, headline, CTA, and landing page URL.

**Why it matters.** Carousel is a high-engagement format for showcasing multiple features, products, or use cases.

**API details.**

- Resource: `Ad.demand_gen_carousel_ad` -> `DemandGenCarouselAdInfo`
- Fields:
  - `headline`: string (top-level)
  - `description`: string (top-level)
  - `logo_image`: AdImageAsset
  - `business_name`: string, required
  - `call_to_action_text`: string, optional
  - `carousel_cards[]`: AdDemandGenCarouselCardAsset[], min 2, max 10
- Each card: `marketing_image_asset`, `square_marketing_image_asset`, `portrait_marketing_image_asset`, `headline`, `call_to_action_text`, `final_url`

**SDK design.**

```typescript
demandGenCarousel({
  headline: 'Rename Files with AI',
  description: 'See how it works for different file types.',
  logo: square('./assets/logo.png'),
  businessName: 'renamed.to',
  cards: [
    card({
      image: landscape('./assets/pdf-demo.png'),
      headline: 'PDF Files',
      callToAction: 'Try Free',
      finalUrl: 'https://renamed.to/pdf-renamer',
    }),
    card({
      image: landscape('./assets/image-demo.png'),
      headline: 'Image Files',
      callToAction: 'Try Free',
      finalUrl: 'https://renamed.to/image-renamer',
    }),
    // ... more cards
  ],
})
```

**Effort.** M -- Multi-card structure with per-card images and URLs. Each card has its own asset links.

**Dependencies.** Demand Gen campaign type (5.1), image asset management (2.6).

**Priority.** P2 -- Useful format but multi-asset ads are the primary format.

---

### 5.4 Video Responsive Ads (Demand Gen)

**What it is.** Video-first Demand Gen ads with text and image fallbacks. The video plays on YouTube surfaces; text/image combinations serve on Discover and Gmail.

**Why it matters.** Video is the highest-engagement format on YouTube. Demand Gen video ads are the API-supported alternative to Video campaigns (which can't be created via API).

**API details.**

- Resource: `Ad.demand_gen_video_responsive_ad` -> `DemandGenVideoResponsiveAdInfo`
- Fields:
  - `headlines[]`: AdTextAsset[]
  - `long_headlines[]`: AdTextAsset[]
  - `descriptions[]`: AdTextAsset[]
  - `videos[]`: AdVideoAsset[] (YouTube video assets, required)
  - `logo_images[]`: AdImageAsset[]
  - `business_name`: AdTextAsset, required
  - `call_to_action_text`: string, optional

**SDK design.**

```typescript
demandGenVideo({
  headlines: ['AI File Renamer'],
  longHeadlines: ['See AI Rename Your Files in Real Time'],
  descriptions: ['50 free renames. No credit card.'],
  videos: [youtubeVideo('dQw4w9WgXcQ')],
  logos: [square('./assets/logo.png')],
  businessName: 'renamed.to',
  finalUrl: 'https://www.renamed.to',
})
```

New helper: `youtubeVideo(id)` creates a reference to a YouTube video asset.

**Effort.** M -- New ad type plus YouTube video asset creation (`AssetService` with `youtube_video_asset.youtube_video_id`).

**Dependencies.** Demand Gen campaign type (5.1).

**Priority.** P2 -- Video ads are impactful but require existing YouTube content.

---

### 5.5 Channel Controls

**What it is.** Per-ad-group control over which Demand Gen surfaces serve ads: YouTube (in-feed, in-stream, Shorts), Discover, Gmail, Display.

**Why it matters.** Advertisers want to optimize for specific surfaces. For example, run YouTube-only ads for video content, or Gmail-only for direct response.

**API details.**

- Ad group field: `demand_gen_ad_group_settings.channel_controls.selected_channels`
  - `.gmail`: bool
  - `.discover`: bool
  - `.display`: bool
  - `.youtube_in_feed`: bool
  - `.youtube_in_stream`: bool
  - `.youtube_shorts`: bool

**SDK design.** See 5.1 example:

```typescript
.group('youtube-only', {
  channels: { youtube: true, discover: false, gmail: false, display: false },
  // Or granular YouTube control:
  channels: {
    youtubeInFeed: true,
    youtubeInStream: true,
    youtubeShorts: false,
    discover: false,
    gmail: false,
    display: false,
  },
})
```

**Effort.** S -- Fields on the ad group resource. Simple boolean serialization.

**Dependencies.** Demand Gen campaign type (5.1).

**Priority.** P1 -- Critical for surface optimization.

---

### 5.6 Lookalike Audiences

**What it is.** Audiences that find users similar to an existing audience segment. Exclusive to Demand Gen campaigns.

**Why it matters.** Lookalikes are one of Demand Gen's unique advantages over Display. They enable prospecting based on existing customer data.

**API details.**

- Created via `AdGroupCriterion` with audience segment targeting
- Based on existing `UserList` (remarketing or customer match)
- Google generates the lookalike segment automatically
- Targeted at ad group level within Demand Gen campaigns

**SDK design.**

```typescript
targeting(
  audiences(
    lookalike('existing-customers-list', { expansion: 'narrow' }),
  ),
)
```

New helper: `lookalike(sourceListId, options)`.

**Effort.** S -- New audience ref type. The lookalike creation is handled by Google; the SDK just references it.

**Dependencies.** Demand Gen campaign type (5.1), audience lists (6.3).

**Priority.** P2 -- Valuable for prospecting but not blocking.

---

## Phase 6: Account-Level Features

Shared resources and account-wide configuration.

---

### 6.1 Shared Negative Keyword Lists

**What it is.** Create a list of negative keywords once, then link it to multiple campaigns. Changes to the list propagate to all linked campaigns automatically.

**Why it matters.** Critical for account hygiene. Without shared lists, negative keywords must be duplicated across every campaign. A common account has 5-20 campaigns sharing the same brand-term negatives, competitor-term negatives, and irrelevant-query negatives.

**API details.**

- Create `SharedSet`: `type = NEGATIVE_KEYWORDS`, `name`, `status`
- Add keywords: `SharedCriterion` with `shared_set` resource name + `KeywordInfo` (`text`, `match_type`)
- Link to campaigns: `CampaignSharedSet` with `campaign` + `shared_set` resource names
- Account-level negatives: `SharedSetType.ACCOUNT_LEVEL_NEGATIVE_KEYWORDS` + `CustomerNegativeCriterion`
- GAQL: `shared_set`, `shared_criterion`, `campaign_shared_set` resources
- Max keywords per shared set: 5,000
- Max shared sets per account: 20

**SDK design.** Shared negative lists are account-level resources, not campaign-level. They need a new top-level definition pattern:

```typescript
// File: campaigns/shared/brand-negatives.ts
import { sharedNegatives, exact, phrase } from '@upspawn/ads'

export default sharedNegatives('Brand Term Negatives', [
  exact('renamed.to'),
  phrase('renamed to'),
  exact('upspawn'),
])
```

Linking to campaigns:

```typescript
// In campaign definition
export default google.search('Search - Generic', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  negatives: negatives('free'),
  // Link shared negative lists by name
  sharedNegativeLists: ['Brand Term Negatives', 'Irrelevant Queries'],
})
```

The discovery pipeline would scan for `sharedNegatives()` exports in addition to campaign exports.

**Effort.** M -- Three new API resource types (SharedSet, SharedCriterion, CampaignSharedSet), new top-level resource discovery, and cross-reference resolution (list name -> campaign links).

**Dependencies.** None.

**Priority.** P1 -- Account hygiene is critical. Shared negatives save significant maintenance time.

---

### 6.2 Shared Budgets

**What it is.** A single budget shared across multiple campaigns. Google distributes the daily budget across linked campaigns based on opportunity.

**Why it matters.** Useful for advertisers who care about total daily spend across related campaigns rather than per-campaign limits.

**API details.**

- Resource: `CampaignBudget` with `explicitly_shared = true` and `name` (required for shared)
- Link: multiple campaigns reference the same `campaign_budget` resource name
- Constraint: **Incompatible with Smart Bidding** (Maximize Conversions, Target CPA, etc.). Only works with Manual CPC, Enhanced CPC, and Maximize Clicks.
- Max campaigns per shared budget: no hard limit, but Google recommends <10

**SDK design.**

```typescript
// File: campaigns/shared/search-budget.ts
import { sharedBudget, daily, eur } from '@upspawn/ads'

export default sharedBudget('Search Budget', daily(eur(30)))
```

Linking:

```typescript
export default google.search('Search - Brand', {
  budget: sharedRef('Search Budget'),  // reference shared budget by name
  bidding: 'manual-cpc',
})
```

**Effort.** S -- CampaignBudget already exists. Need to add shared flag, naming, and cross-campaign reference resolution.

**Dependencies.** None.

**Priority.** P2 -- Niche use case due to Smart Bidding incompatibility.

---

### 6.3 Audience List Management

**What it is.** Create and manage remarketing lists, custom audiences, and combined audiences at the account level.

**Why it matters.** Audiences are referenced across multiple campaigns and campaign types. Managing them as code ensures consistency and version control.

**API details.**

- Resource: `UserList`
  - `name`: required, unique
  - `membership_status`: OPEN, CLOSED
  - `membership_life_span`: days (max 540, or 10000 for unlimited)
  - Types: `crm_based_user_list` (Customer Match), `rule_based_user_list` (website visitors via rules), `logical_user_list` (combined AND/OR/NOT)
- Resource: `CustomAudience`
  - `name`: required
  - `type`: CUSTOM_AFFINITY, CUSTOM_INTENT
  - `members[]`: keywords, URLs, apps
- Resource: `CombinedAudience`
  - `name`: required
  - Combines existing audiences with AND/OR/NOT logic

**SDK design.**

```typescript
// File: campaigns/shared/audiences.ts
import { audienceList, customAudienceList, combinedAudienceList } from '@upspawn/ads'

export const allVisitors = audienceList('All Visitors 30d', {
  type: 'website-visitors',
  lifespan: 30,
})

export const fileManagers = customAudienceList('File Management Enthusiasts', {
  type: 'custom-intent',
  keywords: ['file management software', 'batch rename files', 'document organizer'],
  urls: ['https://www.dropbox.com', 'https://drive.google.com'],
})

export const highValue = combinedAudienceList('High Value Prospects', {
  all: [allVisitors],                   // AND
  any: [fileManagers],                  // OR
  none: ['Existing Customers'],         // NOT
})
```

**Effort.** L -- Three resource types with different creation workflows. Rule-based lists and combined audiences have complex configuration. Also needs cross-reference resolution (audience names used in campaign targeting).

**Dependencies.** None.

**Priority.** P2 -- Audiences can be created manually in the UI and referenced by ID in campaign code. Full management-as-code is a convenience.

---

### 6.4 Conversion Actions

**What it is.** Create and configure conversion tracking actions: what counts as a conversion, how it's valued, and how it's attributed.

**Why it matters.** Conversion tracking is the foundation of Smart Bidding. Without properly configured conversion actions, automated bidding strategies have no signal to optimize toward.

**API details.**

- Resource: `ConversionAction`
  - `name`: required, unique
  - `type`: ConversionActionType (WEBPAGE, AD_CALL, UPLOAD_CLICKS, etc.)
  - `category`: ConversionActionCategory (PURCHASE, SIGNUP, DOWNLOAD, SUBMIT_LEAD_FORM, etc.)
  - `status`: ENABLED, REMOVED, HIDDEN
  - `counting_type`: ONE_PER_CLICK, MANY_PER_CLICK
  - `value_settings.default_value`, `value_settings.always_use_default_value`, `value_settings.currency_code`
  - `primary_for_goal`: bool (affects bidding + Conversions column)
  - `click_through_lookback_window_days`: 1-30 (or 1-60 for calls)
  - `view_through_lookback_window_days`
  - `attribution_model_settings.attribution_model`: GOOGLE_ADS_LAST_CLICK or GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN (only two supported)
- Output: `tag_snippets[]` (generated tracking code)

**SDK design.**

```typescript
// File: campaigns/shared/conversions.ts
import { conversionAction } from '@upspawn/ads'

export const signup = conversionAction('Signup', {
  type: 'webpage',
  category: 'signup',
  counting: 'one-per-click',
  value: { default: 10, currency: 'EUR' },
  attribution: 'data-driven',
  lookbackDays: 30,
  primary: true,
})

export const purchase = conversionAction('Purchase', {
  type: 'webpage',
  category: 'purchase',
  counting: 'one-per-click',
  value: { useDynamic: true, currency: 'EUR' },
  attribution: 'data-driven',
  primary: true,
})

export const pageView = conversionAction('Key Page View', {
  type: 'webpage',
  category: 'page-view',
  counting: 'one-per-click',
  value: { default: 1, currency: 'EUR' },
  primary: false,  // secondary -- reported in "All Conversions" only
})
```

**Effort.** M -- Single resource type but with many fields and enum values. Also need to output tag snippets for website installation.

**Dependencies.** None.

**Priority.** P1 -- Foundation for Smart Bidding. Many accounts need conversion action adjustments.

---

### 6.5 Customer Match

**What it is.** Upload hashed customer data (emails, phones, addresses) to create audience lists for targeting across campaigns.

**Why it matters.** First-party data targeting is increasingly important as third-party cookies are deprecated. Customer Match enables RLSA with CRM data and similar audience creation.

**API details.**

- Create `UserList` with `crm_based_user_list` (upload_key_type: CONTACT_INFO, CRM_ID, MOBILE_ADVERTISING_ID)
- Upload flow:
  1. Create `OfflineUserDataJob` (type: CUSTOMER_MATCH_USER_LIST)
  2. Add `UserDataOperation` entries with `UserData` (SHA256-hashed emails, phones, addresses)
  3. Run job via `RunOfflineUserDataJob`
  4. Poll status until complete
- **April 2026 migration:** New integrations must use Data Manager API instead of `OfflineUserDataJobService`
- All PII must be SHA256 hashed before upload

**SDK design.**

```typescript
// File: campaigns/shared/customer-match.ts
import { customerMatchList } from '@upspawn/ads'

export default customerMatchList('Existing Customers', {
  uploadType: 'contact-info',
  // Reference a CSV/JSON file with customer data
  dataSource: './data/customers.csv',
  // Fields to hash and upload
  fields: ['email', 'phone'],
  // Auto-hash PII before upload
  autoHash: true,
})
```

**Effort.** L -- Multi-step async workflow (create job, add operations, run, poll). Data parsing, SHA256 hashing, and the upcoming Data Manager API migration add complexity.

**Dependencies.** Audience list management (6.3).

**Priority.** P2 -- Important for sophisticated advertisers but complex to implement correctly. The April 2026 API migration adds risk.

---

### 6.6 Portfolio Bidding Strategies

**What it is.** Shared bidding strategies that can be used across multiple campaigns. Google optimizes the shared strategy as a single portfolio.

**Why it matters.** Portfolio strategies let Google redistribute budget and bids across campaigns to maximize total portfolio performance. Useful for accounts with many small campaigns.

**API details.**

- Resource: `BiddingStrategy` (via `BiddingStrategyService`)
  - `name`: required
  - `type`: same BiddingStrategyType enum as campaign-level
  - Strategy-specific fields (target_cpa, target_roas, etc.)
- Link: `campaign.bidding_strategy = 'customers/{id}/biddingStrategies/{strategyId}'`
- Supported: Maximize Conversions, Maximize Conversion Value, Target CPA, Target ROAS, Target Impression Share, Maximize Clicks

**SDK design.**

```typescript
// File: campaigns/shared/bidding.ts
import { portfolioBidding } from '@upspawn/ads'

export default portfolioBidding('Search Portfolio', {
  type: 'maximize-conversions',
  targetCpa: 15,
})
```

Linking:

```typescript
export default google.search('Search - Brand', {
  budget: daily(10),
  bidding: portfolioRef('Search Portfolio'),
})
```

**Effort.** M -- New resource type with cross-campaign referencing. The bidding strategy types are already defined; the new work is the shared resource lifecycle.

**Dependencies.** None.

**Priority.** P2 -- Most accounts use campaign-level bidding. Portfolio is an optimization for large accounts.

---

## Phase 7: Remaining Campaign Types

Lower-priority campaign types for completeness.

---

### 7.1 Smart Campaigns

**What it is.** Simplified campaign type for small businesses. Google automates most settings. Uses keyword themes instead of individual keywords, and `SmartCampaignAd` with just 3 headlines and 2 descriptions.

**Why it matters.** Widely used by small businesses via the simplified Google Ads experience. Low priority for the SDK because Smart campaign users typically don't use code-based tooling.

**API details.**

- `advertising_channel_type`: SMART, `advertising_channel_sub_type`: SMART_CAMPAIGN
- Unique workflow: keyword themes via `SmartCampaignSuggestService` or `KeywordThemeConstantService`
- `SmartCampaignSetting`: `business_name`, `business_profile_location`, `final_url`, `advertising_language_code`
- Ad: `SmartCampaignAdInfo` with exactly 3 headlines (30 chars) and 2 descriptions (90 chars)
- Bidding: fully automated (no user control)

**SDK design.**

```typescript
export default google.smart('Smart - Local Business', {
  budget: daily(5),
  businessName: 'Acme Corp',
  businessProfile: 'locations/123456',
  finalUrl: 'https://acme.example.com',
  language: 'en',
  keywordThemes: ['plumbing services', 'emergency plumber', 'drain repair'],
  ad: smartAd({
    headlines: ['24/7 Emergency Plumber', 'Licensed & Insured', 'Free Estimates'],
    descriptions: ['Call now for fast, reliable plumbing service.', 'Serving the Bay Area since 2005.'],
  }),
})
```

**Effort.** L -- Unique workflow with keyword theme services, Business Profile integration, and simplified ad format. Not reusable across other campaign types.

**Dependencies.** None.

**Priority.** P2 -- Small business focus doesn't align with code-based campaign management.

---

### 7.2 App Campaigns

**What it is.** Drive app installs or in-app engagement across Search, Display, YouTube, and Play Store. Google automates targeting and bidding; you provide creative assets and a budget.

**Why it matters.** Essential for mobile app businesses. Not relevant for web-only products like renamed.to, but needed for SDK completeness.

**API details.**

- `advertising_channel_type`: MULTI_CHANNEL, `advertising_channel_sub_type`: APP_CAMPAIGN (or APP_CAMPAIGN_FOR_ENGAGEMENT, APP_CAMPAIGN_FOR_PRE_REGISTRATION)
- `AppCampaignSetting`: `app_id`, `app_store` (GOOGLE_APP_STORE, APPLE_APP_STORE), `bidding_strategy_goal_type`
- Ad: `AppAdInfo` with headlines (5, 30 chars), descriptions (5, 90 chars), images[], youtube_videos[], html5_media_bundles[], mandatory_ad_text
- Bidding: Target CPA, Maximize Conversions, Target ROAS
- Conversion: `selective_optimization.conversion_actions[]` for app event optimization
- Note: APP_CAMPAIGN installs type is NOT supported via API (only via UI)

**SDK design.**

```typescript
export default google.app('App - Installs', {
  budget: daily(50),
  bidding: { type: 'target-cpa', targetCpa: 5 },
  appId: 'com.example.app',
  appStore: 'google',
  goal: 'installs',
  targeting: targeting(geo('US')),
  ad: appAd({
    headlines: ['Download Now', 'Free App'],
    descriptions: ['The best file renaming app.'],
    images: [square('./assets/app-icon.png')],
    videos: [youtubeVideo('abc123')],
  }),
})
```

**Effort.** L -- Unique campaign settings, app-specific ad format, conversion optimization configuration. Limited reuse with other campaign types.

**Dependencies.** Image asset management (2.6) for creative upload.

**Priority.** P2 -- Only relevant for app businesses.

---

### 7.3 Video Campaigns (Read-Only)

**What it is.** Read-only support for Video campaigns. The Google Ads API does not support creating or updating Video campaigns -- only reading/reporting.

**Why it matters.** Accounts with Video campaigns need them visible in `status` and `import` commands, even if they can't be managed as code.

**API details.**

- `advertising_channel_type`: VIDEO
- GAQL for reading: `SELECT campaign.name, campaign.status, ad_group.name, metrics.impressions, metrics.clicks FROM video WHERE campaign.advertising_channel_type = 'VIDEO'`
- Cannot create, update, or delete via API

**SDK design.** No builder API. Video campaigns would appear in `status` output and optionally in `import` (as read-only TypeScript with a comment indicating they can't be modified via the SDK).

```
$ ads status
  ...
  [READ-ONLY] Video - Brand Awareness    ENABLED  $15.00/day  YouTube
    1 ad group, 3 ads  |  CTR 2.1%  |  Cannot manage via API
```

**Effort.** M -- Fetch-only queries, status display formatting, import codegen with read-only annotations.

**Dependencies.** None.

**Priority.** P2 -- Read-only, limited value.

---

### 7.4 Hotel / Travel / Local

**What it is.** Niche campaign types for hospitality, travel, and local businesses.

- **Hotel campaigns:** `advertising_channel_type = HOTEL`, uses `hotel_setting`, `HOTEL_AD` format, commission-based bidding
- **Travel campaigns:** `advertising_channel_type = TRAVEL`, sub-type `TRAVEL_ACTIVITIES`, `TRAVEL_AD` format
- **Local campaigns:** `advertising_channel_type = LOCAL`, sub-type `LOCAL_CAMPAIGN`, `LOCAL_AD` format, tied to Business Profile. Being migrated to PMax.

**Why it matters.** Only relevant for businesses in these verticals. Very narrow audience for an SDK feature.

**API details.** See API reference sections 1.9, 1.10, and the Hotel/Travel/Local entries.

**SDK design.** Would follow the same builder pattern: `google.hotel()`, `google.travel()`. Not designing in detail given low priority.

**Effort.** XL combined -- Three distinct campaign types with unique settings, ad formats, and bidding models. Each requires its own type system, builder, flatten/fetch/apply, and codegen.

**Dependencies.** Various (Business Profile for Local, Hotel Center for Hotel).

**Priority.** P2 -- Niche verticals. Only build on explicit demand.

---

## Appendix: Not Planned

Things we explicitly will not support and why.

| Item | Reason |
|------|--------|
| **Video campaign creation** | Google Ads API does not support it. Read-only is Phase 7.3. |
| **Local campaign creation** | Being migrated to PMax by Google. New Local campaigns may not be creatable. |
| **Legacy ad types** (Expanded Text Ads, legacy Display) | Cannot create new ones. API only supports read/reporting for existing. |
| **Smart Shopping campaigns** | Migrated to PMax. Cannot create new ones. |
| **Display Smart campaigns** | Cannot create new ones. |
| **Real-time bidding / bid-only management** | Out of scope. The SDK manages campaign structure, not real-time bid optimization. Use Google's automated bidding or third-party bid management tools. |
| **Google Ads Scripts interop** | Different execution model (server-side JavaScript in Google's environment). Not compatible with local SDK approach. |
| **Cross-account management (MCC operations)** | The SDK targets individual accounts. MCC-level operations (account creation, linking) are out of scope. |
| **Reporting / analytics** | The SDK manages campaign state, not reporting. Use the Google Ads API directly or tools like Looker Studio for reporting. `status` shows live metrics as a convenience but comprehensive reporting is not a goal. |
| **Automated rules / scripts** | The SDK is declarative (desired state). Imperative rules ("if CTR < 1% then pause") belong in a separate automation layer, not the campaign definition. |
| **Google Ads Editor parity** | Google Ads Editor supports bulk operations, drafts, and experiments. The SDK focuses on code-defined campaign structure. Bulk mutations are handled by the diff engine; drafts and experiments are not planned. |
