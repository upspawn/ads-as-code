# CLAUDE.md

`@upspawn/ads` — a Pulumi-style ads-as-code SDK and CLI. Define ad campaigns in TypeScript, diff against live platform state, and apply changes. Runs on Bun.

## Essential Commands

```bash
bun test                          # Run all unit tests
bunx tsc --noEmit                 # Typecheck (strict mode, no output)
bun cli/index.ts plan             # Preview changes (diff code vs platform)
bun cli/index.ts apply            # Apply changes to ad platforms
bun cli/index.ts apply --dry-run  # Preview apply without mutations
bun cli/index.ts import           # Import existing campaigns as TypeScript
bun cli/index.ts import --provider meta  # Import from Meta Ads
bun cli/index.ts validate         # Validate campaign files
bun cli/index.ts status           # Show live platform state
bun cli/index.ts pull             # Pull live state, detect drift
bun cli/index.ts doctor           # Diagnostic checks on project setup
bun cli/index.ts auth google      # Authenticate with Google Ads
bun cli/index.ts search interests "query"  # Search Meta targeting interests
bun cli/index.ts search behaviors "query"  # Search Meta targeting behaviors
bun cli/index.ts audiences        # List Meta custom audiences
bun cli/index.ts history          # Show operation history
bun cli/index.ts cache stats      # Cache statistics
bun cli/index.ts cache clear      # Clear cache
```

## Architecture

```
src/
  core/           Provider-agnostic engine
    types.ts        Branded types, Resource, Change, Changeset, AdsConfig, AdsError
    diff.ts         Pure diff function: desired[] x actual[] → Changeset
    flatten.ts      Campaign tree → flat Resource[] (slugified paths, stable RSA hashes)
    cache.ts        SQLite cache (bun:sqlite) — resource map, snapshots, operation history
    codegen.ts      Resource[] → idiomatic TypeScript source (for `import` command)
    discovery.ts    Scan campaigns/**/*.ts, dynamic-import, collect exports with provider+kind
    config.ts       defineConfig() identity function for typed config files
    errors.ts       AdsEnrichedError with file/group/ad/field location context
  google/         Google Ads provider
    types.ts        GoogleSearchCampaign, CampaignBuilder, GoogleAdsClient, MutateOperation
    index.ts        google.search() builder — chained .group() .locale() .sitelinks() .callouts()
    api.ts          gRPC client factory via google-ads-api package, credential resolution
    fetch.ts        GAQL queries → normalized Resource[] (campaigns, ad groups, keywords, ads, extensions, negatives)
    apply.ts        Changeset → MutateOperation[] → execute in dependency order
    constants.ts    Language criteria IDs, geo target IDs
  meta/           Meta (Facebook/Instagram) provider
    types.ts        Objective, AdSetConfig, MetaCreative, MetaCTA, MetaTargeting, placements
    index.ts        meta.traffic()/conversions()/leads()/... builders — chained .adSet()
    api.ts          Graph API client, credential resolution (FB_ADS_ACCESS_TOKEN)
    fetch.ts        Graph API queries → normalized Resource[] (campaigns, ad sets, ads, creatives)
    flatten.ts      MetaCampaign tree → flat Resource[] with provider='meta'
    apply.ts        Changeset → Graph API mutations (create, update, pause)
    upload.ts       Local image/video upload to Meta via multipart API
    download.ts     Download creative assets from Meta URLs
    codegen.ts      Meta Resource[] → idiomatic TypeScript (for `import --provider meta`)
    resolve.ts      Resolve ad set/ad dependencies and references
    provider.ts     Provider interface implementation wiring fetch/flatten/apply/codegen
    constants.ts    Objective → API enum mapping, status codes
    interests-catalog.ts  Cached interest/behavior targeting data
  helpers/        SDK builder functions (the user-facing DSL)
    keywords.ts     exact(), phrase(), broad(), keywords()
    budget.ts       daily(), monthly(), lifetime(), eur(), usd()
    targeting.ts    geo(), languages(), weekdays(), hours(), targeting(), audiences(), ...
    ads.ts          headlines(), descriptions(), rsa()
    extensions.ts   link(), sitelinks(), callouts(), image() (Google extensions)
    negatives.ts    negatives()
    url.ts          url()
    meta-creative.ts  image(), video(), carousel(), boostedPost() (Meta ad creatives)
    meta-targeting.ts Meta-specific targeting helpers (interests, behaviors, demographics)
    meta-placement.ts Placement helpers (feeds, stories, reels, etc.)
    meta-bidding.ts   Bid strategy helpers (lowestCost, costCap, bidCap, minimumRoas)
  ai/             AI-powered ad copy generation
    index.ts        ai namespace — markers, prompts, generation
cli/              CLI commands
  index.ts          Router — parses args, dispatches to subcommands
  plan.ts           Discover campaigns, flatten, fetch live state, diff, display changeset
  apply.ts          Plan + execute mutations, record in cache (supports --dry-run)
  import.ts         Fetch all state from API, run codegen, write campaigns/**/*.ts
  pull.ts           Fetch known state (cache-scoped), diff for drift detection
  validate.ts       Discover + flatten campaigns, report errors
  status.ts         Fetch + display live state
  auth.ts           OAuth flow + credential check
  init.ts           Scaffold ads.config.ts + campaigns/ directory
  search.ts         Search Meta targeting interests/behaviors
  audiences.ts      List Meta custom audiences
  history.ts        Query operation log from cache
  doctor.ts         Check credentials, config, campaign files
  cache.ts          Clear/stats for SQLite cache
test/
  unit/             One test file per module (diff, flatten, cache, codegen, etc.)
  fixtures/         Campaign fixtures, mock API responses
  integration/      API integration tests (need credentials)
example/            Working example project
  ads.config.ts     Config with defineConfig()
  campaigns/        Real campaign definitions
```

## Key Design Decisions

- **Config objects, not classes.** Campaigns are plain readonly objects with a chained builder for ergonomics. The builder returns new frozen objects on each call.
- **Diff engine is a pure function.** `diff(desired, actual, managedPaths, pathToPlatformId) → Changeset`. No side effects, no API calls. Supports semantic comparison (budget micros, headline ordering, keyword case, URL normalization).
- **Resource paths are stable identifiers.** Every resource gets a slugified path (`campaign-name/ad-group-name/kw:text:MATCH_TYPE`). RSA ads use a content hash for identity. Cache maps paths to platform IDs.
- **gRPC via google-ads-api.** The REST API was broken for mutations. The `google-ads-api` npm package provides a gRPC client. Numeric enums throughout (status 2=ENABLED, 3=PAUSED; bidding 6=MAXIMIZE_CONVERSIONS, 10=TARGET_SPEND for maximize-clicks; match type 2=EXACT, 3=PHRASE, 4=BROAD).
- **Cache is SQLite via bun:sqlite.** Stores resource map (path→platformId), snapshots, and operation history. Default location: `.ads-cache/state.db`.
- **Campaign discovery is convention-based.** The CLI scans `campaigns/**/*.ts`, dynamic-imports each file, and collects exports that have `provider` + `kind` fields.
- **Branded types for validation.** `Headline`, `Description`, `CalloutText` are branded strings. The helper functions (`headlines()`, `descriptions()`) validate constraints (e.g., headline <= 30 chars) at construction time.
- **Dependency-ordered mutations.** Creates go parent-first (campaign → adGroup → keyword → ad). Deletes go child-first. Stops on first failure to avoid orphans.
- **Zero-diff round-trips (Google).** The Google provider achieves `import → plan = 0 changes` — no phantom diffs. This required moving `budgetResourceName` to `resource.meta`, normalizing all field formats (micros, enums, booleans), and handling device bid adjustments as targeting rules.

## Credentials

Resolved in order: explicit `GoogleConfig` → `~/.ads/credentials.json` → environment variables.

**~/.ads/credentials.json:**
```json
{
  "google_client_id": "...",
  "google_client_secret": "...",
  "google_refresh_token": "...",
  "google_developer_token": "...",
  "google_customer_id": "YOUR_CUSTOMER_ID",
  "google_manager_id": "YOUR_MANAGER_ID"
}
```

**Environment variables (alternative):**
`GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_MANAGER_ID`

**Meta credentials:**
`FB_ADS_ACCESS_TOKEN` — long-lived token from Meta Business Suite system user settings. Config file specifies `accountId` and `pageId`.

## Google Ads API Quirks

- **Numeric enums everywhere.** The gRPC client returns numbers, not strings. See `fetch.ts` for `STATUS_MAP`, `BIDDING_STRATEGY_MAP`, `MATCH_TYPE_MAP`.
- **snake_case fields.** gRPC returns `ad_group_criterion`, `campaign_budget`, `responsive_search_ad`. REST returns camelCase. The fetch layer handles both.
- **Budget is a separate resource.** Creating a campaign requires creating a `campaign_budget` first, then referencing it.
- **Amounts in micros.** $20 = 20,000,000 micros. The SDK abstracts this away.
- **TARGET_SPEND = Maximize Clicks.** The API enum for "Maximize Clicks" bidding is `TARGET_SPEND` (10), not `MAXIMIZE_CLICKS` (11).
- **RSA identity is content-based.** Ads don't have stable user-assigned names. Identity is tracked via a hash of sorted headlines + sorted descriptions + finalUrl.
- **`campaign.start_date` / `campaign.end_date` are NOT queryable** in the current google-ads-api version — dates flow through flatten/codegen/apply but aren't fetched on import.
- **`target_roas` is a raw double, NOT micros.** 3.5 = 350% ROAS. Unlike cpc/cpa fields which use micros.
- **`METADATA_SERVER_DETECTION=none`** is set automatically to suppress GCE metadata warnings on local dev.
- **Device bid adjustments** use `campaign_criterion` with `device.type` enum (2=MOBILE, 3=DESKTOP, 4=TABLET) and `bid_modifier` (1.0 = no change, 0.75 = -25%).

## Provider Architecture

Both Google and Meta follow the same provider pattern:

1. **types.ts** -- provider-specific campaign/ad set/ad types
2. **index.ts** -- builder namespace (e.g., `google.search()`, `meta.traffic()`)
3. **fetch.ts** -- API queries → normalized `Resource[]`
4. **flatten.ts** -- campaign tree → flat `Resource[]` with provider tag
5. **apply.ts** -- `Changeset` → platform API mutations
6. **codegen.ts** -- `Resource[]` → idiomatic TypeScript source (for import)
7. **provider.ts** -- wires fetch/flatten/apply/codegen into a provider interface

The core engine (diff, cache, discovery) is provider-agnostic — it operates on `Resource[]` regardless of source. CLI commands route to the correct provider based on campaign `provider` field or `--provider` flag.

### Meta-specific considerations

- **Auth:** `FB_ADS_ACCESS_TOKEN` env var (no OAuth flow, token from Meta Business Suite)
- **Media upload:** `upload.ts` handles local image/video → Meta via multipart Graph API. Files are uploaded during apply, not at definition time.
- **Objectives are type-safe:** `meta.traffic()` returns `MetaCampaignBuilder<'traffic'>`, which constrains `.adSet()` optimization goals to `LINK_CLICKS | LANDING_PAGE_VIEWS | REACH | IMPRESSIONS`. Invalid goals are compile-time errors.
- **Creative helpers:** `image()`, `video()`, `carousel()`, `boostedPost()` from `src/helpers/meta-creative.ts` (not the Google `image()` from extensions.ts)
- **Interest search:** `cli/search.ts` queries Meta's targeting search API for interests and behaviors

### Google provider field coverage

Full round-trip support (import → plan → apply) for:

- **Campaign:** name, status, budget, bidding (7 strategies: maximize-conversions, maximize-clicks, manual-cpc, target-cpa, target-roas, target-impression-share, maximize-conversion-value), targeting (geo, language, schedule, device bid adjustments), networkSettings (search, searchPartners, display), trackingTemplate, finalUrlSuffix, customParameters, negatives, sitelinks, callouts
- **Ad Group:** name, status
- **Keyword:** text, matchType, bid (cpc_bid_micros), finalUrl, status
- **Ad (RSA):** headlines, descriptions, finalUrl, path1, path2, pinnedHeadlines, pinnedDescriptions, status, multiple ads per group
- **Extensions:** sitelinks, callouts (create only — campaign_asset linking is a TODO)

## Testing

- **Runner:** `bun:test` (built into Bun).
- **Unit tests:** `test/unit/*.test.ts` — one per module. Use `describe`/`test`/`expect` from `bun:test`.
- **Fixtures:** `test/fixtures/campaigns/` for campaign definitions, `test/fixtures/api-responses/` for mock API data.
- **Cache tests:** Use `:memory:` SQLite databases.
- **API tests:** Mock the `GoogleAdsClient` interface (it's a plain object with `query` and `mutate` functions — trivial to mock).
- **Snapshots:** `test/unit/__snapshots__/` for codegen output verification.
- **1127+ tests**, 1 known skip (keyword platformId format).
