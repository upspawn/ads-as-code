# Reddit Ads Provider — Design Spec

**Date:** 2026-03-20
**Status:** Draft
**Branch:** `feat/reddit-ads-provider`

## Goal

Add a complete Reddit Ads provider to the ads-as-code SDK. Full parity with Reddit's Ads API: all campaign objectives, all ad formats, all targeting options, both auth flows, and performance metrics. Follows the existing provider pattern established by Google and Meta.

## Scope

- 7 campaign objectives (awareness, traffic, engagement, video-views, app-installs, conversions, leads)
- 6 ad formats (image, video, carousel, free-form, product, conversation)
- Full targeting (subreddits, interests, keywords, demographics, device, custom audiences, dayparting, expansion)
- 3 bid strategies (lowestCost, costCap, manualBid)
- 2 confirmed placements (feed, conversation) + automatic
- OAuth2 auth with refresh token flow + username/password fallback
- Performance metrics fetcher
- Codegen for `import --provider reddit`
- Zero-diff round-trip: import → plan = 0 changes

## Non-Goals

- Reddit Pixel/conversion tracking setup (out of scope — platform-side config)
- Reddit Audience Manager UI features (email list upload is supported via custom audiences, but list management is not)
- A/B experiment management (Reddit's built-in experiment feature)

---

## Architecture

### Reddit Ads API

REST/JSON API at `ads-api.reddit.com/api/v3/`. OAuth2 bearer tokens. Rate limited via `X-Ratelimit-Remaining` and `X-Ratelimit-Reset` headers.

**Campaign hierarchy:** Account → Campaign → Ad Group → Ad

**Key API details:**
- Base URL: `https://ads-api.reddit.com/api/v3/accounts/{account_id}/...`
- Auth: OAuth2 bearer token via `https://www.reddit.com/api/v1/access_token`
- Scopes: `adsread` (read), `adswrite` (mutations)
- Budget values: stored in **micros** (like Google — $20 = 20,000,000)
- Account IDs: prefixed format (e.g., `a2_eaf73mplhhps`)
- Statuses: `configured_status` (user-set) and `effective_status` (computed)

### Campaign Objectives

| SDK Objective | Reddit API Enum |
|---|---|
| `awareness` | `BRAND_AWARENESS_AND_REACH` |
| `traffic` | `TRAFFIC` |
| `engagement` | `ENGAGEMENT` |
| `video-views` | `VIDEO_VIEWS` |
| `app-installs` | `APP_INSTALLS` |
| `conversions` | `CONVERSIONS` |
| `leads` | `LEAD_GENERATION` |

**Note:** Catalog Sales exists in the Reddit UI but has limited API support (beta). The `product()` ad format and `catalog-sales` objective are included as types but marked beta — they may not be fully testable until Reddit opens API access. Lead Generation is the 7th fully confirmed objective.

### Ad Formats

| Format | Builder Helper | Key Properties |
|---|---|---|
| Image | `image(filePath, config)` | headline (300 chars, ~80 rec), body, thumbnail (400×300), CTA, clickUrl |
| Video | `video(filePath, config)` | headline, body, video (MP4/MOV, ≤1GB, 2s-15min), thumbnail, CTA |
| Carousel | `carousel(cards, config)` | 2-6 cards: image + headline + url, caption (50 chars each) |
| Free-form | `freeform(config)` | rich body (40K chars), up to 20 images + 5 videos, captions |
| Product | `product(config)` | catalog ref, headline — for catalog-linked campaigns |
| Conversation | `conversationAd(config)` | placed between posts/comments — same creative as image/video |

**Image specs:** 1080×1080 (1:1), 1080×1350 (4:5), 1920×1080 (16:9). JPG/PNG/GIF, max 3MB.
**Video specs:** MP4/MOV, 30 FPS max, 1GB max (50-100MB recommended), 5-30s optimal.
**Carousel specs:** Same image formats, 20MB per image, GIFs ≤3MB.

**CTA options (13):** INSTALL, DOWNLOAD, LEARN_MORE, SIGN_UP, SHOP_NOW, BOOK_NOW, CONTACT_US, GET_QUOTE, SUBSCRIBE, APPLY_NOW, WATCH_MORE, PLAY_NOW, SEE_MENU

### Bidding Strategies

| Helper | Description |
|---|---|
| `lowestCost()` | Reddit optimizes for maximum volume at lowest cost (default) |
| `costCap(amount)` | Target average cost per conversion — Reddit will try to stay at or below |
| `manualBid(amount)` | Strict CPC cap — maximum you'll pay per click |

### Targeting

| Helper | Description |
|---|---|
| `subreddits(...names)` | Target specific subreddits (Reddit's "community targeting") |
| `interests(...names)` | Reddit interest categories |
| `keywords(...terms)` | Target posts/comments containing keywords |
| `geo(...locations)` | Country/region/metro |
| `age(min, max)` | Age range |
| `gender(value)` | Gender targeting |
| `device(...types)` | Mobile, desktop |
| `os(...types)` | iOS, Android, etc. |
| `customAudience(id)` | Pixel/email list audiences |
| `lookalike(sourceId, config)` | Lookalike expansion |
| `expansion(enabled)` | Reddit's automated audience expansion |

### Placements

| Helper | Description |
|---|---|
| `feed()` | Home feed + subreddit feeds |
| `conversation()` | Comment threads (between posts and comments) |
| `automatic()` | All placements (default) |

**Note:** Conversation placements typically deliver higher-quality traffic per Reddit's own guidance. Profile placements are not confirmed as API-controllable — we'll add if the API supports it.

### Authentication

Two flows, credential resolution order:

1. Explicit `RedditProviderConfig` in `ads.config.ts`
2. `~/.ads/credentials.json` → `reddit_app_id`, `reddit_app_secret`, `reddit_refresh_token`
3. Environment variables → `REDDIT_APP_ID`, `REDDIT_APP_SECRET`, `REDDIT_REFRESH_TOKEN` (+ `REDDIT_USERNAME`, `REDDIT_PASSWORD` for script auth)

**OAuth refresh token flow** (primary): `ads auth reddit` command launches OAuth dance, stores refresh token.
**Username/password flow** (fallback): Script-type app credentials, no browser needed.

### RedditProviderConfig

```typescript
type RedditProviderConfig = {
  accountId: string          // Reddit ad account ID (e.g., 'a2_eaf73mplhhps')
  appId?: string             // OAuth app ID (overrides credentials file / env)
  appSecret?: string         // OAuth app secret
  refreshToken?: string      // OAuth refresh token (primary auth)
  username?: string          // Reddit username (fallback script auth)
  password?: string          // Reddit password (fallback script auth)
  userAgent?: string         // Custom user-agent (defaults to 'ads-as-code/1.0')
  currency?: string          // Account currency ISO-4217 (default: 'USD')
  credentials?: string       // Path to credentials file (default: '~/.ads/credentials.json')
}
```

### Status Mapping

Reddit exposes `configured_status` (user-set) and `effective_status` (computed by platform). The SDK maps `configured_status` → Resource `status` field — matching how Google and Meta handle it (user intent, not computed state). This is critical for zero-diff round-trips.

### Error Response Format

Reddit API errors return JSON with this shape:
```json
{ "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

Error code mapping to SDK `AdsError`:
| Reddit Code | SDK Error Type |
|---|---|
| `UNAUTHORIZED`, `FORBIDDEN` | `auth` |
| `RATE_LIMITED` (HTTP 429) | `quota` |
| `INVALID_REQUEST`, `VALIDATION_ERROR` | `validation` |
| `POLICY_VIOLATION` | `policy` |
| `NOT_FOUND` | `api` |
| `INTERNAL_SERVER_ERROR` | `api` |

---

## Builder DSL

```typescript
import { reddit } from '@upspawn/ads'
import { daily, usd } from '@upspawn/ads/helpers'
import { image, video } from '@upspawn/ads/helpers/reddit-creative'
import { subreddits, interests, geo } from '@upspawn/ads/helpers/reddit-targeting'
import { manualBid } from '@upspawn/ads/helpers/reddit-bidding'
import { feed, conversation } from '@upspawn/ads/helpers/reddit-placement'

export const summerTraffic = reddit.traffic('Summer Sale Traffic', {
  budget: daily(usd(50)),
  status: 'paused',
})
  .adGroup('Tech Enthusiasts', {
    bid: manualBid(usd(1.50)),
    targeting: [
      subreddits('technology', 'gadgets', 'buildapc'),
      interests('Technology', 'Gaming'),
      geo('US', 'CA'),
    ],
    placement: feed(),
    schedule: { start: '2026-04-01', end: '2026-04-30' },
  }, [
    image('./assets/summer-sale.jpg', {
      headline: 'Summer tech deals — up to 40% off',
      body: 'Shop our biggest sale of the year',
      clickUrl: 'https://example.com/sale',
      cta: 'SHOP_NOW',
    }),
    video('./assets/promo.mp4', {
      headline: 'Watch: Best deals this summer',
      body: 'See what is on sale',
      clickUrl: 'https://example.com/sale',
      thumbnail: './assets/thumb.jpg',
      cta: 'LEARN_MORE',
    }),
  ])
  .build()
```

**Type safety:** `reddit.traffic()` returns `RedditCampaignBuilder<'traffic'>`, constraining valid optimization goals per objective at compile time. Builder is immutable — each `.adGroup()` returns a new frozen instance.

**Builder signature:** `.adGroup(name, config, content)` where:
- `config: AdGroupConfig<T>` — bid, targeting, placement, schedule, optimization goal
- `content: RedditAd[]` — array of ad creatives (image, video, carousel, etc.)

This matches the Meta pattern where `.adSet(name, config, content)` separates targeting config from ad creative content.

**Schedule type:**
```typescript
type RedditSchedule = {
  start: string             // ISO date 'YYYY-MM-DD'
  end?: string              // ISO date, optional (ongoing if omitted)
  dayparting?: DaypartRule[] // Optional time-of-day rules
}
type DaypartRule = {
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  startHour: number  // 0-23
  endHour: number    // 0-23
}
```

---

## File Structure

```
src/reddit/
  types.ts           # Objectives, RedditCampaign<T>, AdGroupConfig<T>, ad format types,
                     # RedditTargeting, RedditPlacement, RedditBidStrategy, CTA enum
  index.ts           # RedditCampaignBuilder<T>, reddit.* namespace (7 objective methods)
  api.ts             # OAuth2 client, error mapping, credential resolution, rate limiting, pagination (T0 — foundational)
  fetch.ts           # Reddit API → Resource[] normalization
  flatten.ts         # Campaign tree → Resource[] with provider='reddit'
  apply.ts           # Changeset → Reddit API mutations (dependency-ordered)
  codegen.ts         # Resource[] → idiomatic TypeScript source
  constants.ts       # Objective map, default optimizations, creation/deletion order
  provider.ts        # ProviderModule wiring
  upload.ts          # Image/video upload via Reddit media endpoint
  download.ts        # Download creative assets during import
  performance.ts     # Reddit reporting API → metrics

src/helpers/
  reddit-creative.ts   # image(), video(), carousel(), freeform(), product(), conversationAd()
  reddit-targeting.ts  # subreddits(), interests(), keywords(), geo(), age(), gender(), etc.
  reddit-bidding.ts    # lowestCost(), costCap(), manualBid()
  reddit-placement.ts  # feed(), conversation(), automatic()
```

### Core Touchpoints

- `src/core/types.ts` — add `RedditProviderConfig` and `reddit?` to `AdsConfig`
- `src/core/providers.ts` — add `reddit` entry to `PROVIDERS` map
- `cli/index.ts` — add `reddit` case to auth and subcommand routing
- `cli/auth.ts` — add `reddit` auth flow
- `cli/import.ts` — add `reddit` to `--provider` choices
- `cli/doctor.ts` — add Reddit credential/config checks
- `cli/performance.ts` — add `reddit` to performance provider routing
- `src/performance/fetch.ts` — add `reddit?` to `FetchPerformanceInput`
- `src/performance/types.ts` — add Reddit performance config if needed
- `package.json` — add `exports` entries for `@upspawn/ads/helpers/reddit-*`

---

## Task Structure & Dependency Graph

### Phase 0 — Foundation (sequential, must land first)

**T0: Core types + provider registration + API client interface**

All types, interfaces, the builder, and the API client interface fully defined. Provider registered with stub implementations. The API client is included in T0 because T2 (fetch), T3 (apply), and T4 (performance) all depend on it — without it, those tasks cannot be truly independent.

Files created:
- `src/reddit/types.ts` — all type definitions including `RedditProviderConfig`, `AdGroupConfig<T>`, `RedditAdGroupContent`, CTA enum, ad format types, targeting/placement/bidding types
- `src/reddit/index.ts` — builder with all 7 objective methods, immutable `.adGroup(name, config, content)` pattern (content is a `RedditAdGroupContent` containing ads array + optional shared url/cta, matching Meta's pattern)
- `src/reddit/constants.ts` — enum maps, defaults, creation/deletion order, status maps
- `src/reddit/api.ts` — Reddit API client with OAuth2 (both flows), credential resolution, rate limit handling, error mapping → AdsError, pagination helpers. This is a foundational piece — all parallel tasks import from it.
- `src/reddit/provider.ts` — stub ProviderModule (throws "not yet implemented" for fetch/flatten/apply/codegen)

Files modified:
- `src/core/types.ts` — add `RedditProviderConfig` to `AdsConfig`
- `src/core/providers.ts` — register `reddit` in PROVIDERS map

After T0 lands:
- `reddit.traffic('name', config).adGroup(...).build()` compiles and returns correct structure
- Campaign files using `reddit.*` are discoverable by the CLI
- `bun cli/index.ts plan --provider reddit` resolves the provider (fails at fetch — expected)
- T1-T4 agents can import from `src/reddit/types.ts`, `src/reddit/index.ts`, and `src/reddit/api.ts` without conflicts
- All Resource kinds used are existing (`campaign`, `adGroup`, `ad`) — no new ResourceKind values needed

### Phase 1 — Parallel tracks (independent worktrees, all depend on T0)

**T1: Auth command + Helpers (bidding/placement)**

- `cli/auth.ts` — add `ads auth reddit` command (OAuth dance + token storage)
- `cli/index.ts` — add `reddit` case to auth router
- `cli/doctor.ts` — add Reddit credential check
- `src/helpers/reddit-bidding.ts` — `lowestCost()`, `costCap()`, `manualBid()`
- `src/helpers/reddit-placement.ts` — `feed()`, `conversation()`, `automatic()`
- Tests: auth flow, bidding/placement helper validation

**T2: Fetch + Flatten + Helpers (targeting/creative)**

- `src/reddit/fetch.ts` — Reddit API responses → normalized Resource[] (campaigns, ad groups, ads)
- `src/reddit/flatten.ts` — campaign tree → flat Resource[] with `provider='reddit'`
- `src/helpers/reddit-targeting.ts` — all targeting helpers
- `src/helpers/reddit-creative.ts` — all ad format helpers
- Tests: fetch normalization, flatten determinism, helper validation, builder + flatten round-trip

**T3: Apply + Upload/Download (write path)**

- `src/reddit/apply.ts` — Changeset → Reddit API mutations, dependency-ordered (campaign → adGroup → ad creates, reverse for deletes)
- `src/reddit/upload.ts` — image/video upload via Reddit's media endpoint
- `src/reddit/download.ts` — download creative assets during import
- Tests: apply parameter building, upload mocking, dependency ordering

**T4: Codegen + Performance + CLI integration**

- `src/reddit/codegen.ts` — Resource[] → idiomatic TypeScript (smart defaults, import tracking)
- `src/reddit/performance.ts` — Reddit reporting API → metrics (impressions, clicks, spend, CTR, CPC, CPM, conversions)
- `src/performance/fetch.ts` — add `reddit?` to `FetchPerformanceInput`, wire Reddit fetcher
- `src/performance/types.ts` — add Reddit performance config if needed
- `cli/import.ts` — add `reddit` to `--provider` choices
- `cli/performance.ts` — add `reddit` to performance routing
- `package.json` — add `exports` entries for `@upspawn/ads/helpers/reddit-*`
- Tests: codegen snapshot tests, performance metric normalization

### Phase 2 — Integration (sequential, after all T1-T4 merge)

**T5: Integration + round-trip testing**

- Wire `provider.ts` with real implementations (replace stubs)
- Round-trip test: import → flatten → diff = zero changes
- End-to-end CLI tests (plan, import, apply --dry-run)
- Fixtures: mock Reddit API responses for all resource types
- Integration tests (requires Reddit API credentials)

---

## Dependency Graph

```
        T0 (foundation: types + builder + api client + constants + provider stub)
       / |  \    \
     T1  T2  T3   T4
       \ |  /    /
        T5 (integration)
```

T1-T4 are fully independent — they import only from T0 (types, api client, constants) and core modules, never from each other. The API client lives in T0 specifically to enable this independence.

**Pagination:** Reddit's list endpoints use cursor-based pagination. The API client in T0 provides a `fetchAll()` helper that handles this, so T2/T4 don't need to implement pagination themselves.

---

## Key Design Decisions

1. **Immutable builders** — same pattern as Meta. Each `.adGroup()` returns a new frozen instance.

2. **Generic objective constraints** — `RedditCampaignBuilder<T extends Objective>` constrains optimization goals per objective at compile time. Invalid goals are type errors.

3. **Micros as internal currency unit** — Reddit's API uses micros (like Google — $20 = 20,000,000). The SDK's existing `usd()`/`eur()` helpers handle conversion.

4. **Content-based ad identity** — like Google RSA, Reddit ads don't have user-assigned stable names. Use a hash of headline + body + url for identity in diff.

5. **Resource path scheme:**
   - Campaign: `campaign-name`
   - Ad group: `campaign-name/adgroup-name`
   - Ad: `campaign-name/adgroup-name/ad-name` (or content hash for unnamed formats)

6. **Zero-diff round-trips** — normalize all fields identically in fetch and flatten. Track auto-filled defaults in `resource.meta._defaults` so codegen can omit them.

7. **Rate limit handling** — Reddit's API has rate limits (headers: `X-Ratelimit-Remaining`, `X-Ratelimit-Reset`). API client should respect these and backoff automatically.

8. **Media upload during apply** — images/videos are uploaded when `apply` runs, not at definition time. Asset references in campaign definitions are local file paths; they become Reddit media URLs after upload.

---

## Performance Metrics (from Reddit API)

**Core:** impressions, reach, clicks, spend, ecpm, ctr, cpc
**Video:** video_started, video_completion_rate, video_watched_25/50/75/95/100_percent, video_viewable_impressions, video_plays_with_sound, video_plays_expanded
**Conversions:** purchase (clicks/views/ecpa/avg_value/total_value), add_to_cart, lead, sign_up, page_visit, search, view_content, add_to_wishlist — each with click-through and view-through attribution
**App install:** install_count, app_launch_count, purchase_count, revenue, sign_up_count + MMP and SKAN variants
**Engagement:** upvotes, downvotes, comment_submissions, comment_upvotes, comment_downvotes, comment_page_views
**Report breakdowns:** date, country, region, community, placement, device_os

---

## API Field Reference (verified)

Key fields confirmed from Reddit Ads API:
- **Campaign:** campaign_id, campaign_name, campaign_configured_status, campaign_effective_status, campaign_objective, campaign_goal_type, campaign_goal_value (micros), campaign_is_campaign_budget_optimization
- **Ad Group:** ad_group_id, ad_group_name, ad_group_configured_status, ad_group_effective_status, ad_group_goal_type, ad_group_goal_value (micros), ad_group_targeting_devices
- **Ad:** ad_id, ad_name, ad_configured_status, ad_effective_status, ad_click_url, ad_rejection_reason
- **Account:** account_id, account_name, account_currency, account_attribution_type, account_click_attribution_window, account_view_attribution_window

---

## Sources

This spec was cross-referenced against:
- Reddit Ads API v3 Postman collection
- Reddit Ads MCP Server implementations (sbmeaper/reddit-ad-mcp, mkerchenski/RedditAdsMcp)
- Windsor.ai Reddit Ads field reference (connectors.windsor.ai/reddit/fields)
- Reddit Ads Help Center (business.reddithelp.com)
- Strike Social Reddit Ad Specs guide (2026)
- Online Optimism Reddit Ad Types guide (2026)
- InterTeam Marketing Reddit Ads campaign setup guide

---

## Testing Strategy

Each phase (T1-T4) includes its own unit tests. T5 adds integration tests.

**Unit tests per task:**
- T1: OAuth token exchange, credential resolution order, error mapping, bidding/placement helper output
- T2: API response → Resource normalization, campaign tree → Resource[] determinism, targeting/creative helper validation
- T3: Changeset → API parameter building, create/delete ordering, upload multipart construction
- T4: Codegen snapshot tests (Resource[] → TypeScript string), performance metric normalization

**Integration tests (T5):**
- Round-trip: `import → plan = 0 changes` (the gold standard)
- Plan: code campaigns → flatten → fetch live → diff
- Apply dry-run: verify mutation parameters without executing
- Auth: token refresh flow

**Fixtures needed:**
- Mock Reddit API responses for campaigns, ad groups, ads (all formats)
- Mock OAuth token responses
- Mock media upload responses
- Sample campaign definitions for all 7 objectives
