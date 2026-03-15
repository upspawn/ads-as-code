# Meta Ads Provider Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meta (Facebook/Instagram) Ads as a second provider to @upspawn/ads, enabling declarative campaign management via TypeScript + CLI.

**Architecture:** Meta support slots in as a parallel provider (`src/meta/`) alongside the existing Google provider (`src/google/`). The core engine (diff, cache) stays unchanged. A new provider registry pattern replaces the current Google-hardcoded CLI commands with multi-provider dispatch.

**Tech Stack:** TypeScript, Bun, Meta Graph API (REST), SQLite (existing cache), bun:test

**Spec:** `docs/superpowers/specs/2026-03-15-meta-ads-provider-design.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/meta/types.ts` | All Meta-specific types: objectives, optimization goals, bidding, targeting, placements, creatives, CTAs, scheduling, DSA, ad set config, campaign config |
| `src/meta/constants.ts` | Enum maps: objective → API string, optimization defaults per objective, CTA values, placement positions |
| `src/meta/index.ts` | `MetaCampaignBuilder<T>` — the builder DSL (`meta.traffic()`, `.adSet()`, etc.) |
| `src/meta/flatten.ts` | `flattenMeta(campaign)` → `Resource[]` — path generation, default resolution, image SHA hashing |
| `src/meta/api.ts` | Meta Graph API client — authenticated HTTP wrapper (`graphGet`, `graphPost`) |
| `src/meta/fetch.ts` | `fetchMetaAll(config)` → `Resource[]` — reads live campaigns/adsets/ads/creatives from Meta |
| `src/meta/apply.ts` | `applyMetaChangeset(changeset, config)` — creates/updates/deletes via Graph API in dependency order |
| `src/meta/upload.ts` | Image/video upload with SHA-256 caching — `uploadImage(filePath, config)` → `imageHash` |
| `src/meta/codegen.ts` | `codegenMeta(resources)` → TypeScript string — generates builder DSL code from fetched state |
| `src/meta/provider.ts` | `ProviderModule` export — wires together flatten/fetch/apply/codegen for the provider registry |
| `src/meta/interests-catalog.ts` | Top ~500 interests pre-mapped `{ name → { id, name } }` for autocomplete |
| `src/helpers/meta-targeting.ts` | Meta-specific targeting helpers: `audience()`, `interests()`, `excludeAudience()`, `lookalike()`, Meta `targeting()` |
| `src/helpers/meta-creative.ts` | Creative helpers: `image()`, `video()`, `carousel()` with filename-derived names and ad-set-level defaults |
| `src/helpers/meta-bidding.ts` | Bidding helpers: `lowestCost()`, `costCap()`, `bidCap()`, `minRoas()` |
| `src/helpers/meta-placement.ts` | Placement helpers: `automatic()`, `manual()` |
| `src/core/providers.ts` | `ProviderModule` type + provider registry (lazy-loaded map: `'google' → import(...)`, `'meta' → import(...)`) |
| `cli/init.ts` | already exists (159 lines, exports `GlobalFlags`) — extend with Meta provider support |
| `cli/search.ts` | `ads search interests/behaviors "query"` — Meta Targeting Search API |
| `cli/audiences.ts` | `ads audiences` — list custom audiences in account |
| `test/unit/meta-types.test.ts` | Type validation tests |
| `test/unit/meta-builder.test.ts` | Builder DSL tests (chaining, defaults, typing) |
| `test/unit/meta-flatten.test.ts` | Flatten tests (path generation, default resolution, image hashing) |
| `test/unit/meta-fetch.test.ts` | Fetch tests (API response → Resource[] normalization) |
| `test/unit/meta-apply.test.ts` | Apply tests (Change[] → mutation ordering, API call construction) |
| `test/unit/meta-upload.test.ts` | Upload tests (SHA caching, dedup logic) |
| `test/unit/meta-codegen.test.ts` | Codegen tests (Resource[] → TypeScript string, default omission) |
| `test/unit/providers.test.ts` | Provider registry tests |
| `test/unit/meta-integration.test.ts` | End-to-end pipeline test |

### Modified files

| File | What changes |
|---|---|
| `src/core/types.ts` | Add `'adSet'`, `'creative'` to `ResourceKind`. Expand `MetaProviderConfig`. Add `LifetimeBudget` to `Budget` union. |
| `src/core/flatten.ts` | Extract Google-specific `flatten()` to `src/google/flatten.ts`. Replace with multi-provider `flattenAll()` that dispatches by provider. |
| `src/core/diff.ts` | Add Meta-specific semantic comparison for targeting (sorted interest arrays). |
| `src/google/apply.ts` | Add `default` case to `switch(resource.kind)` — no-op for unknown kinds. |
| `src/index.ts` | Export all new Meta types, helpers, and the `meta` builder entry point. |
| `cli/index.ts` | Register `init`, `search`, `audiences` subcommands. |
| `cli/plan.ts` | Replace Google-hardcoded logic with provider registry dispatch. Update `describeResource()` for `adSet`/`creative`. Add `(default)` annotations and property-level diffs. |
| `cli/apply.ts` | Replace Google-hardcoded logic with provider registry dispatch. |
| `cli/import.ts` | Replace Google-hardcoded logic with provider registry dispatch. Add Meta codegen + image download. |
| `cli/status.ts` | Add Meta provider support. |

---

## Chunk 1: Foundation — Core Types + Meta Types + Constants

### Task 1: Extend core types

**Files:**
- Modify: `src/core/types.ts`
- Test: `test/unit/core-types.test.ts` (create if not exists)

- [ ] **Step 1:** Read `src/core/types.ts` to understand current type definitions.
- [ ] **Step 2:** Add `'adSet'` and `'creative'` to the `ResourceKind` union type.
- [ ] **Step 3:** Add `LifetimeBudget` type (with `period: 'lifetime'` and `endTime: string`) to the `Budget` union. Keep existing `DailyBudget` and `MonthlyBudget` unchanged.
- [ ] **Step 4:** Expand `MetaProviderConfig` to include `pageId` (required), `pixelId` (optional), `apiVersion` (optional, defaults to `'v21.0'`), and `dsa` (optional object with `beneficiary` and `payor` strings).
- [ ] **Step 5:** Run `bunx tsc --noEmit` to verify no type errors introduced.
- [ ] **Step 6:** Check all existing tests still pass: `bun test`.
- [ ] **Step 7:** Commit: `"feat: extend core types for Meta provider — ResourceKind, Budget, MetaProviderConfig"`

### Task 2: Add default case to Google apply.ts

**Files:**
- Modify: `src/google/apply.ts`

- [ ] **Step 1:** Read `src/google/apply.ts`. The `buildDeleteOperation` (line ~332) and `buildUpdateOperations` (line ~381) already have `default` cases. Only `buildCreateMutations` (line ~489) lacks one.
- [ ] **Step 2:** Add a `default: break` case to the `buildCreateMutations` switch. This makes it silently skip Meta resource kinds (`adSet`, `creative`) without error.
- [ ] **Step 3:** Run `bun test` to verify nothing broke.
- [ ] **Step 4:** Commit: `"fix: add default case to buildCreateMutations for multi-provider compatibility"`

### Task 3: Create Meta type definitions

**Files:**
- Create: `src/meta/types.ts`
- Test: `test/unit/meta-types.test.ts`

- [ ] **Step 1:** Define all Meta-specific types as specified in the spec's "Comprehensive Type System" section. This is a large file — organize it in this order: Objectives, OptimizationGoalMap, BidStrategy, MetaTargeting (with all sub-types: InterestTarget, BehaviorTarget, etc.), MetaPlacements (with all position types), Creative types (ImageAd, VideoAd, CarouselAd, CollectionAd, CarouselCard), MetaCTA, AdSetSchedule, DayPartRule, ConversionConfig, MetaCampaignConfig, AdSetConfig, AdSetContent, PromotedObject, DSAConfig, SpecialAdCategory.
- [ ] **Step 2:** Key design points to get right:
  - `AdSetConfig<T extends Objective>` is generic — `optimization` field is typed as `OptimizationGoalMap[T]` and optional.
  - Creative types (`ImageAd`, `VideoAd`, etc.) have `name?`, `url?`, `cta?` all optional (defaults resolved at flatten time).
  - `AdSetContent` has `ads`, `url?`, `cta?` for ad-set-level defaults.
  - All types should use `readonly` properties matching existing core types convention.
- [ ] **Step 3:** Write tests that verify type constraints compile correctly — e.g., a traffic campaign should accept `LINK_CLICKS` optimization but reject `APP_INSTALLS`. Use `// @ts-expect-error` comments for negative tests.
- [ ] **Step 4:** Run `bunx tsc --noEmit` and `bun test`.
- [ ] **Step 5:** Commit: `"feat: add Meta type definitions — objectives, targeting, placements, creatives, config"`

### Task 4: Create Meta constants

**Files:**
- Create: `src/meta/constants.ts`

- [ ] **Step 1:** Define constant maps following the pattern in `src/google/constants.ts`:
  - `OBJECTIVE_MAP`: SDK objective string → Meta API objective string (e.g., `'traffic' → 'OUTCOME_TRAFFIC'`).
  - `DEFAULT_OPTIMIZATION`: objective → default optimization goal (e.g., `'traffic' → 'LINK_CLICKS'`, `'conversions' → 'OFFSITE_CONVERSIONS'`). This is the table from the spec's DX Design Principles.
  - `CREATION_ORDER`: resource kind dependency ordering for Meta creates (`['campaign', 'adSet', 'creative', 'ad']`).
  - `DELETION_ORDER`: reverse of creation order.
- [ ] **Step 2:** Run `bunx tsc --noEmit`.
- [ ] **Step 3:** Commit: `"feat: add Meta constants — objective map, default optimizations, creation order"`

### Task 5: Create interests catalog

**Files:**
- Create: `src/meta/interests-catalog.ts`

- [ ] **Step 1:** Create a map of the top ~500 Meta interest targets. Format: `Record<string, { id: string, name: string }>` where the key is the lowercase interest name for lookup. Source the data from Meta's [Targeting Search API documentation](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search) or build a script that queries it. Start with the most common categories: technology, business, construction, legal, medical, finance, education, real estate.
- [ ] **Step 2:** Export a lookup function: given a string name, return the `{ id, name }` or `undefined` if not in catalog.
- [ ] **Step 3:** Commit: `"feat: add bundled interests catalog (~500 entries) for offline autocomplete"`

---

## Chunk 2: Builder DSL + Helper Functions

### Task 6: Create Meta-specific helper functions

**Files:**
- Create: `src/helpers/meta-targeting.ts`
- Create: `src/helpers/meta-creative.ts`
- Create: `src/helpers/meta-bidding.ts`
- Create: `src/helpers/meta-placement.ts`
- Test: `test/unit/meta-builder.test.ts`

- [ ] **Step 1: Meta targeting helpers** (`src/helpers/meta-targeting.ts`):
  - `targeting(...rules)` — composes rules into a `MetaTargeting` object. Accepts `GeoTarget`, age ranges, `InterestTarget[]`, audience refs, etc. This is a separate function from the Google `targeting()` — the barrel export will namespace it via the `meta` object.
  - `audience(nameOrId)` — accepts a string (name lookup) or `{ id: string }` (explicit). Returns a marker object that `targeting()` understands. At this layer, name-based lookups are stored as `{ type: 'audience-by-name', name: string }` — resolution happens at flatten/validate time.
  - `interests(...args)` — accepts strings (name lookup, stored for later resolution) or `{ id, name }` objects (explicit). Same deferred resolution pattern.
  - `excludeAudience(nameOrId)` — same pattern as `audience()` but for exclusions.
  - `lookalike(sourceNameOrId, config)` — returns a lookalike audience config.
- [ ] **Step 2: Meta creative helpers** (`src/helpers/meta-creative.ts`):
  - `image(filePath, config)` — returns an `ImageAd` object with `format: 'image'`. If `name` is omitted, derive it from the filename (strip extension, keep as-is — actual slugification happens at flatten time).
  - `video(filePath, config)` — returns a `VideoAd` object.
  - `carousel(cards, config)` — returns a `CarouselAd` object.
  - None of these resolve ad-set-level defaults yet — that happens in flatten.
- [ ] **Step 3: Meta bidding + budget helpers** (`src/helpers/meta-bidding.ts`):
  - `lowestCost()`, `costCap(amount)`, `bidCap(amount)`, `minRoas(floor)` — each returns the corresponding `BidStrategy` object.
  - `lifetime(amount, endTime, currency?)` — returns a `LifetimeBudget`. Add this to `src/helpers/budget.ts` alongside the existing `daily()` and `monthly()` helpers (not a Meta-specific helper — `LifetimeBudget` is a core type). Currency defaults to `'EUR'` matching the existing `daily()` behavior.
- [ ] **Step 4: Meta placement helpers** (`src/helpers/meta-placement.ts`):
  - `automatic()` — returns `'automatic'`.
  - `manual(platforms, positions?)` — returns a `MetaPlacements` object.
- [ ] **Step 5:** Write tests for each helper — verify returned shapes, verify `audience('some-name')` produces a marker for deferred resolution, verify `image()` derives name from filename.
- [ ] **Step 6:** Run `bun test`.
- [ ] **Step 7:** Commit: `"feat: add Meta helper functions — targeting, creative, bidding, placement"`

### Task 7: Create the MetaCampaignBuilder

**Files:**
- Create: `src/meta/index.ts`
- Test: `test/unit/meta-builder.test.ts` (extend)

- [ ] **Step 1:** Implement `MetaCampaignBuilder<T extends Objective>` as an immutable builder class. Follow the pattern from `src/google/index.ts`:
  - Constructor is private — instances created by factory methods.
  - Each method returns a new builder instance (immutability).
  - `provider` is always `'meta'` and `kind` is the objective.
- [ ] **Step 2:** Implement factory methods on the `meta` namespace object: `meta.traffic()`, `meta.awareness()`, `meta.engagement()`, `meta.leads()`, `meta.sales()`, `meta.appPromotion()`. Each sets the objective and returns a typed builder. **Note:** The spec's `Objective` type has no `'conversions'` variant — `meta.conversions()` should be added as an alias for `meta.sales()` (both map to `OUTCOME_CONVERSIONS` in the Meta API, and `sales` uses the same optimization goals). Add `'conversions'` to the `Objective` type in `src/meta/types.ts` as an alias with the same `OptimizationGoalMap` entry as `'sales'`.
- [ ] **Step 3:** Implement `.adSet(name, config, content)`:
  - Stores the ad set definition internally.
  - `config.optimization` is optional — if omitted, the builder stores `undefined` (resolved at flatten time from the objective).
  - `content.url` and `content.cta` are stored for ad-level default resolution at flatten time.
  - Returns a new builder with the ad set appended.
- [ ] **Step 4:** Implement a `.build()` method (or equivalent) that the flatten layer calls to extract the internal campaign structure. This returns a `MetaCampaign` object containing all the accumulated state (name, config, ad sets with their ads).
- [ ] **Step 5:** Write tests:
  - Builder chaining produces correct internal state.
  - `provider` is `'meta'` and `kind` matches the objective.
  - Multiple `.adSet()` calls accumulate correctly.
  - Type-level test: `meta.traffic(...)` rejects invalid optimization goals (use `@ts-expect-error`).
- [ ] **Step 6:** Run `bun test`.
- [ ] **Step 7:** Commit: `"feat: add MetaCampaignBuilder — objective-typed builder with adSet chaining"`

### Task 8: Update barrel exports

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1:** Export the `meta` namespace object from `src/meta/index.ts`.
- [ ] **Step 2:** Export all Meta types from `src/meta/types.ts`.
- [ ] **Step 3:** Export Meta-specific helpers (targeting, creative, bidding, placement). **Naming collision:** `src/helpers/index.ts` already exports `image` from `./extensions.ts` (Google sitelink image extension). The Meta `image()` (creative helper) is a different function. Do NOT re-export Meta `image()` from the helpers barrel — instead, export it as part of the `meta` namespace object. Users import it as `import { meta, image } from '@upspawn/ads'` where `image` is the Meta creative helper and the Google `image` is accessed differently. Alternatively, namespace both: `meta.image()` for Meta creatives. Decide based on what reads best in campaign files.
- [ ] **Step 4:** Run `bunx tsc --noEmit` to verify no export conflicts.
- [ ] **Step 5:** Commit: `"feat: export Meta builder, types, and helpers from @upspawn/ads"`

---

## Chunk 3: Flatten Layer

### Task 9: Extract Google flatten to its own module

**Files:**
- Modify: `src/core/flatten.ts`
- Create: `src/google/flatten.ts` (move existing code here)

- [ ] **Step 1:** Move `flatten()`, `flattenAll()`, `stableHash()`, `rsaHash()`, and the `resource()` helper from `src/core/flatten.ts` to `src/google/flatten.ts`. These are all Google-specific (`rsaHash` generates RSA ad content hashes, `stableHash` is used only by `rsaHash`). Keep only `slugify()` in `src/core/flatten.ts` — it's the only truly shared utility.
- [ ] **Step 2:** Update `src/core/flatten.ts` to export only `slugify()`.
- [ ] **Step 3:** Update all imports across the codebase that referenced `flatten` from `src/core/flatten.ts` — check `cli/plan.ts`, `cli/import.ts`, test files.
- [ ] **Step 4:** Run `bun test` to verify nothing broke.
- [ ] **Step 5:** Commit: `"refactor: extract Google flatten to src/google/flatten.ts"`

### Task 10: Implement Meta flatten

**Files:**
- Create: `src/meta/flatten.ts`
- Test: `test/unit/meta-flatten.test.ts`

- [ ] **Step 1:** Implement `flattenMeta(campaign: MetaCampaign): Resource[]` following the spec's "Flatten Layer" section:
  - Generate slugified paths for each resource level.
  - Campaign → `slugify(name)`.
  - Ad set → `campaignSlug/slugify(adSetName)`.
  - Creative → `campaignSlug/adSetSlug/slugify(adName)/cr`.
  - Ad → `campaignSlug/adSetSlug/slugify(adName)`.
- [ ] **Step 2:** Implement default resolution during flattening:
  - `optimization`: if not set on ad set config, resolve from the campaign objective using `DEFAULT_OPTIMIZATION` from constants.
  - `bidding`: if not set, use `{ type: 'LOWEST_COST_WITHOUT_CAP' }`.
  - `placements`: if not set, use `'automatic'`.
  - `status`: if not set, use `'PAUSED'`.
  - `ad.name`: if not set, derive from the filename (strip path + extension, slugify).
  - `ad.url`: if not set on ad, inherit from `AdSetContent.url`. If neither set, throw a validation error.
  - `ad.cta`: same as url.
  - Track which values were defaults vs explicit — store a `_defaults` property on the resource for plan output annotation.
- [ ] **Step 3:** Implement image file resolution:
  - Compute SHA-256 of the local file referenced in the creative.
  - Check the cache for an existing Meta image hash.
  - If cached, set `imageHash` on the creative resource properties.
  - If not cached, set `pendingUpload: true` with the file path and SHA.
- [ ] **Step 4:** Implement interest/audience name resolution markers:
  - At flatten time, interests specified by name and audiences specified by name are stored as unresolved markers.
  - A separate `resolveTargeting()` function (called by `validate` and `plan`) resolves these markers by querying the interests catalog first, then the Meta API for misses.
- [ ] **Step 5:** Write tests:
  - Verify path generation for a campaign with 2 ad sets, each with 2 ads.
  - Verify all defaults are correctly applied when fields are omitted.
  - Verify default tracking (which values came from defaults).
  - Verify validation errors when url/cta are missing from both ad and ad set content.
  - Verify image SHA computation and cache interaction (mock the cache).
- [ ] **Step 6:** Run `bun test`.
- [ ] **Step 7:** Commit: `"feat: add Meta flatten — path generation, default resolution, image hashing"`

### Task 11: Create multi-provider flattenAll

**Files:**
- Modify: `src/core/flatten.ts`

**⚠️ Breaking change:** The current `flattenAll()` accepts `GoogleSearchCampaign[]`. The new signature accepts `DiscoveredCampaign[]` (with a `provider` field). This breaks all existing callers (`cli/plan.ts`, `cli/import.ts`, tests). **This task MUST be committed together with or immediately before Tasks 13-16 (CLI refactoring).** If working in parallel, keep this on a branch and merge together with the CLI changes.

- [ ] **Step 1:** Add a new `flattenAll(campaigns: DiscoveredCampaign[]): Resource[]` function to `src/core/flatten.ts` that dispatches by provider:
  - `provider === 'google'` → call Google flatten.
  - `provider === 'meta'` → call Meta flatten.
  - Unknown provider → throw an error.
- [ ] **Step 2:** Keep the old `flattenAll` temporarily as `flattenAllGoogle` until CLI callers are updated in Tasks 13-16.
- [ ] **Step 3:** Run `bun test` — some tests will break if they call the old signature. Update test imports as needed.
- [ ] **Step 4:** Commit: `"feat: multi-provider flattenAll dispatch"`

---

## Chunk 4: Provider Registry + CLI Refactoring

### Task 12: Create provider registry

**Files:**
- Create: `src/core/providers.ts`
- Test: `test/unit/providers.test.ts`

- [ ] **Step 1:** Define the `ProviderModule` type with four methods: `flatten`, `fetchAll`, `applyChangeset`, `codegen`.
- [ ] **Step 2:** Create the provider registry — a `Record<string, () => Promise<ProviderModule>>` with lazy-loaded imports for `'google'` and `'meta'`.
- [ ] **Step 3:** Export helper functions: `getProvider(name)`, `resolveProviders(campaigns, config, providerFilter?)`.
- [ ] **Step 4:** Create `src/google/provider.ts` that exports the Google `ProviderModule`. Wire it to: flatten from `src/google/flatten.ts`, `fetchAllState` from `src/google/fetch.ts`, `applyChangeset` from `src/google/apply.ts`, and `generateCampaignFile` from `src/core/codegen.ts`. Note: `codegen` currently lives in `src/core/codegen.ts` (Google-specific despite being in core). Leave it there for now — moving it to `src/google/codegen.ts` is a valid future refactor but out of scope.
- [ ] **Step 5:** Create `src/meta/provider.ts` as a stub that exports the Meta `ProviderModule` (wires flatten, stubs fetch/apply/codegen — they'll be implemented in later tasks).
- [ ] **Step 6:** Write tests for the registry — verify lazy loading, provider resolution, and filtering by `--provider` flag.
- [ ] **Step 7:** Run `bun test`.
- [ ] **Step 8:** Commit: `"feat: add provider registry with lazy-loaded Google and Meta modules"`

### Task 13: Refactor CLI plan command for multi-provider

**Files:**
- Modify: `cli/plan.ts`

- [ ] **Step 1:** Read the current `cli/plan.ts` thoroughly. Understand the Google-specific flow: discovery → filter → client → fetch → flatten → diff → print.
- [ ] **Step 2:** Replace the Google-hardcoded logic with the provider registry pattern:
  - Discover campaigns → group by provider.
  - If `--provider` flag is set, filter to that provider.
  - For each provider: load module → flatten → fetch → diff → print changeset.
- [ ] **Step 3:** Update `describeResource()` to handle `adSet` and `creative` resource kinds.
- [ ] **Step 4:** Add `(default)` annotations to the plan output for creates where values came from defaults. The flatten layer stores this info in `resource.properties._defaults`.
- [ ] **Step 5:** Add property-level diffs for updates — show each changed field with old → new values.
- [ ] **Step 6:** Use human-readable names (from `resource.properties.name`) instead of slugified paths. Build the `→` hierarchy from parent resource names.
- [ ] **Step 7:** Show resolved currency in budget displays (e.g., `daily €5.00`).
- [ ] **Step 8:** Run `bun test` — existing Google plan tests should still pass.
- [ ] **Step 9:** Commit: `"refactor: multi-provider plan command with default annotations and property diffs"`

### Task 14: Refactor CLI apply command for multi-provider

**Files:**
- Modify: `cli/apply.ts`

- [ ] **Step 1:** Same pattern as plan — replace Google-hardcoded logic with provider registry dispatch.
- [ ] **Step 2:** For each provider: load module → flatten → fetch → diff → confirm → apply.
- [ ] **Step 3:** Run `bun test`.
- [ ] **Step 4:** Commit: `"refactor: multi-provider apply command"`

### Task 15: Refactor CLI import command for multi-provider

**Files:**
- Modify: `cli/import.ts`

- [ ] **Step 1:** Add `--provider` flag support. Make it required for import (unlike plan/apply which can auto-detect).
- [ ] **Step 2:** Replace Google-hardcoded fetch + codegen with provider registry dispatch.
- [ ] **Step 3:** Run `bun test`.
- [ ] **Step 4:** Commit: `"refactor: multi-provider import command"`

### Task 16: Refactor CLI status command for multi-provider

**Files:**
- Modify: `cli/status.ts`

- [ ] **Step 1:** Add provider dispatch to status output.
- [ ] **Step 2:** Run `bun test`.
- [ ] **Step 3:** Commit: `"refactor: multi-provider status command"`

---

## Chunk 5: Meta Graph API Client + Fetch

### Task 17: Create Meta Graph API client

**Files:**
- Create: `src/meta/api.ts`
- Test: `test/unit/meta-api.test.ts`

- [ ] **Step 1:** Implement `createMetaClient(config: MetaProviderConfig)` that returns an object with `graphGet(endpoint, params)` and `graphPost(endpoint, params)` methods.
- [ ] **Step 2:** Auth: read `FB_ADS_ACCESS_TOKEN` from environment.
- [ ] **Step 3:** API version: use `config.apiVersion` (default `'v21.0'`). Base URL: `https://graph.facebook.com/{version}/`.
- [ ] **Step 4:** Error handling: parse Meta's structured error response (`error.code`, `error.error_subcode`, `error.message`). Map to the SDK's `AdsError` types.
- [ ] **Step 5:** Rate limiting: detect rate limit errors (code 32, 4) and throw a typed `AdsError` with `retryAfter`.
- [ ] **Step 6:** Write tests with mocked HTTP responses — success, auth failure, rate limit, validation error.
- [ ] **Step 7:** Run `bun test`.
- [ ] **Step 8:** Commit: `"feat: add Meta Graph API client with error handling"`

### Task 18: Implement Meta fetch

**Files:**
- Create: `src/meta/fetch.ts`
- Test: `test/unit/meta-fetch.test.ts`

- [ ] **Step 1:** Implement `fetchMetaAll(config: MetaProviderConfig): Promise<Resource[]>` that:
  - Calls `GET /{accountId}/campaigns` with appropriate fields.
  - Calls `GET /{accountId}/adsets` with targeting, budget, optimization fields.
  - Calls `GET /{accountId}/ads` with creative subfields.
  - Normalizes each API response into `Resource[]`.
- [ ] **Step 2:** Campaign normalization:
  - `kind: 'campaign'`, path from `slugify(name)`.
  - Budget: convert from cents string to core `Budget` type with currency.
  - Objective: reverse-map from API string to SDK objective.
- [ ] **Step 3:** Ad Set normalization:
  - `kind: 'adSet'`, path from parent campaign slug + ad set slug.
  - Targeting: normalize the nested targeting object.
  - Bidding: map from API format to SDK `BidStrategy`.
- [ ] **Step 4:** Ad + Creative normalization:
  - Each ad produces TWO resources: one `creative` and one `ad`.
  - Creative: extract `imageHash`, `headline`, `primaryText`, `description`, `cta`, `url` from the creative's `object_story_spec.link_data`.
  - Ad: store the `creativePath` reference.
- [ ] **Step 5:** Handle pagination — Meta returns paginated results. Follow the `paging.next` cursor.
- [ ] **Step 6:** Write tests with mock API responses representing real Meta campaign structures. Verify correct `Resource[]` output with proper paths and properties.
- [ ] **Step 7:** Run `bun test`.
- [ ] **Step 8:** Commit: `"feat: add Meta fetch — campaigns, ad sets, ads, creatives → Resource[]"`

### Task 19: Implement interest/audience resolution

**Files:**
- Modify: `src/meta/flatten.ts` (add resolution logic)
- Test: `test/unit/meta-flatten.test.ts` (extend)

- [ ] **Step 1:** Implement `resolveTargeting(targeting, client, cache)`:
  - For interests specified by string name: check the bundled catalog first, then call Meta's Targeting Search API.
  - Cache results in SQLite so repeated plan/validate runs don't re-query.
  - If a name matches multiple interests, throw an error with the ambiguous options and their IDs.
  - If a name matches zero interests, throw a clear error.
- [ ] **Step 2:** For audiences specified by string name: call `GET /{accountId}/customaudiences?fields=name` and match by name. Cache the result. Throw if not found.
- [ ] **Step 3:** This resolution runs during `validate` and `plan` — not during flatten itself (flatten stores markers, resolution is a separate pass).
- [ ] **Step 4:** Write tests with mock API responses — successful resolution, ambiguous match, zero match.
- [ ] **Step 5:** Run `bun test`.
- [ ] **Step 6:** Commit: `"feat: add interest/audience name resolution with catalog + API fallback"`

---

## Chunk 6: Apply + Upload

### Task 20: Implement image upload with caching

**Files:**
- Create: `src/meta/upload.ts`
- Test: `test/unit/meta-upload.test.ts`

- [ ] **Step 1:** Implement `uploadImage(filePath, client, cache)`:
  - Compute SHA-256 of the local file.
  - Check cache for existing mapping (SHA → Meta image hash).
  - If cached and unchanged, return the cached hash.
  - If new or changed, upload via `POST /{accountId}/adimages` with the file data.
  - Store the new `{ fileSha256, metaImageHash }` mapping in cache.
  - Return the Meta image hash.
- [ ] **Step 2:** Implement `uploadVideo(filePath, client, cache)`:
  - Small files (<1GB): single `POST /{accountId}/advideos`.
  - Large files: chunked upload (start → transfer → finish).
  - Same SHA-based caching pattern.
- [ ] **Step 3:** Add a `provider` column to cache entries (or a separate table) to namespace Meta uploads from Google cache data.
- [ ] **Step 4:** Write tests — verify SHA computation, cache hit/miss behavior, re-upload on file change.
- [ ] **Step 5:** Run `bun test`.
- [ ] **Step 6:** Commit: `"feat: add Meta image/video upload with SHA-256 caching"`

### Task 21: Implement Meta apply

**Files:**
- Create: `src/meta/apply.ts`
- Test: `test/unit/meta-apply.test.ts`

- [ ] **Step 1:** Implement `applyMetaChangeset(changeset, config, cache)`:
  - Process creates in dependency order: campaign → adSet → upload images → creative → ad.
  - Process updates: `POST /{entityId}` with changed fields.
  - Process deletes in reverse order: ad → creative → adSet → campaign.
- [ ] **Step 2:** Campaign create: `POST /{accountId}/campaigns` with name, objective, status, budget, special ad categories. Store returned ID in cache.
- [ ] **Step 3:** Ad Set create: `POST /{accountId}/adsets` with campaign_id (from cache), targeting, optimization_goal, bid_strategy, budget, placements, DSA fields. Resolve DSA from provider config if not set on the ad set. Store returned ID.
- [ ] **Step 4:** Creative create: `POST /{accountId}/adcreatives` with `object_story_spec` (page_id from config, link_data with image_hash, headline, primary_text, description, CTA, URL). Store returned ID.
- [ ] **Step 5:** Ad create: `POST /{accountId}/ads` with adset_id and creative_id (both from cache). Store returned ID.
- [ ] **Step 6:** For updates, compare changed properties and send only the diff to the API.
- [ ] **Step 7:** For deletes, delete via `DELETE /{entityId}` or status change to DELETED.
- [ ] **Step 8:** Handle partial failures — if step 3 fails, steps 1-2 are already created. Cache records what was created so the next `plan` shows the correct state.
- [ ] **Step 9:** Write tests with mock API calls — verify correct mutation ordering, correct API payloads, cache updates after each step, partial failure recovery.
- [ ] **Step 10:** Run `bun test`.
- [ ] **Step 11:** Commit: `"feat: add Meta apply — dependency-ordered creates, updates, deletes"`

### Task 22: Wire up Meta provider module

**Files:**
- Modify: `src/meta/provider.ts` (replace stub with real wiring)

- [ ] **Step 1:** Wire the `ProviderModule` export to use the real `flattenMeta`, `fetchMetaAll`, `applyMetaChangeset`, and `codegenMeta` (codegen still stubbed — implemented in Chunk 7).
- [ ] **Step 2:** Run the full test suite to verify integration.
- [ ] **Step 3:** Commit: `"feat: wire Meta provider module with real flatten, fetch, and apply"`

---

## Chunk 7: Codegen + Import

### Task 23: Implement Meta codegen

**Files:**
- Create: `src/meta/codegen.ts`
- Test: `test/unit/meta-codegen.test.ts`

- [ ] **Step 1:** Implement `codegenMeta(resources: Resource[]): string` that generates TypeScript campaign files from fetched `Resource[]`:
  - Group resources by campaign path.
  - Generate `meta.<objective>(name, config)` entry point.
  - Generate `.adSet(name, config, { url, cta, ads: [...] })` chains.
  - Generate `image()` / `video()` calls for each creative.
- [ ] **Step 2:** Smart default omission — if the live campaign uses `LOWEST_COST_WITHOUT_CAP` bidding, don't emit `bidding: lowestCost()`. If placements are automatic, don't emit `placements: automatic()`. If optimization matches the default for the objective, don't emit it. This produces minimal, clean code.
- [ ] **Step 3:** If multiple ads in an ad set share the same `url` and `cta`, hoist them to the `AdSetContent` level and omit from individual ads.
- [ ] **Step 4:** Generate the import statement with only the helpers actually used in the file.
- [ ] **Step 5:** Write tests — feed in sample `Resource[]` arrays and verify the generated TypeScript matches expected output.
- [ ] **Step 6:** Run `bun test`.
- [ ] **Step 7:** Commit: `"feat: add Meta codegen — Resource[] to TypeScript with smart default omission"`

### Task 24: Add Meta image download to import

**Files:**
- Modify: `cli/import.ts`

- [ ] **Step 1:** When importing Meta campaigns, download creative images from Meta's CDN to `assets/imported/`. Name files with a hash suffix to avoid collisions (e.g., `hero-abc123.png`).
- [ ] **Step 2:** Update the generated code to reference these local file paths.
- [ ] **Step 3:** Seed the cache with file SHA → Meta image hash mappings so subsequent `plan` runs don't show spurious uploads.
- [ ] **Step 4:** Test with mock data — verify file download, path references in generated code, cache seeding.
- [ ] **Step 5:** Commit: `"feat: download Meta creative images during import"`

---

## Chunk 8: DX CLI Commands

### Task 25: Extend `ads init` command with Meta support

**Files:**
- Modify: `cli/init.ts` (already exists — exports `GlobalFlags` used by other commands, currently scaffolds Google only)
- Modify: `cli/index.ts`

- [ ] **Step 1:** Read the existing `cli/init.ts` (159 lines) to understand the current scaffold flow and `GlobalFlags` export. Do NOT break the `GlobalFlags` export — other CLI commands depend on it.
- [ ] **Step 2:** Extend the existing init with Meta support:
  - Provider picker (Google / Meta) — skip if `--provider` flag provided.
  - Prompt for Meta-specific fields: account ID, page ID, pixel ID (optional).
  - Generate `ads.config.ts` with the provided values.
  - Verify authentication by making a test API call.
  - Run `ads import` to seed from live state.
  - Print "You're ready!" message with next steps.
- [ ] **Step 2:** Register `init` as a subcommand in `cli/index.ts`.
- [ ] **Step 3:** Test manually (interactive prompts are hard to unit test — focus on the config generation and verification logic).
- [ ] **Step 4:** Commit: `"feat: add ads init command — guided onboarding for new users"`

### Task 26: Add `ads search` command

**Files:**
- Create: `cli/search.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1:** Implement `ads search interests "query"`:
  - Call Meta's Targeting Search API: `GET /search?type=adinterest&q={query}`.
  - Print results in a table: `{ id, name, audience_size }`.
  - Format output so users can copy-paste `{ id, name }` objects directly into their campaign files.
- [ ] **Step 2:** Implement `ads search behaviors "query"` — same pattern with `type=adTargetingCategory&class=behaviors`.
- [ ] **Step 3:** Register `search` as a subcommand in `cli/index.ts`.
- [ ] **Step 4:** Commit: `"feat: add ads search command — query interests and behaviors"`

### Task 27: Add `ads audiences` command

**Files:**
- Create: `cli/audiences.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1:** Implement `ads audiences`:
  - Call `GET /{accountId}/customaudiences?fields=name,approximate_count,subtype`.
  - Print a table: name, ID, size, type (custom, lookalike, etc.).
- [ ] **Step 2:** Register `audiences` as a subcommand in `cli/index.ts`.
- [ ] **Step 3:** Commit: `"feat: add ads audiences command — list custom audiences with names and IDs"`

---

## Chunk 9: Integration Testing + Polish

### Task 28: Add semantic comparison for Meta targeting

**Files:**
- Modify: `src/core/diff.ts`

- [ ] **Step 1:** Add field-name-based semantic comparison rules to `semanticEqual()` — the diff engine is kind-agnostic (doesn't check `resource.kind`), so these rules are keyed by field name, not resource type:
  - Field `interests`: compare as unordered sets by `id` (interest IDs can come back in any order from the Meta API). Add `if (field === 'interests' && Array.isArray(desired) && Array.isArray(actual))` with set comparison on the `id` property.
  - Field `customAudiences`, `excludedAudiences`: same unordered set comparison.
  - Budget: Meta cents normalization is handled by fetch (converts to core Budget type), so existing `toMicros()` comparison works — verify this with a test.
- [ ] **Step 2:** Run `bun test`.
- [ ] **Step 3:** Commit: `"feat: add Meta targeting semantic comparison to diff engine"`

### Task 29: End-to-end integration test

**Files:**
- Create: `test/unit/meta-integration.test.ts`

- [ ] **Step 1:** Write an integration test that exercises the full pipeline:
  - Define a campaign using the builder DSL.
  - Flatten it to `Resource[]`.
  - Create mock "live state" `Resource[]` (as if fetched from Meta).
  - Diff desired vs actual.
  - Verify the changeset is correct (creates, updates, deletes).
- [ ] **Step 2:** Test the round-trip: builder → flatten → codegen → verify generated code matches the original builder input.
- [ ] **Step 3:** Test default resolution: build a minimal campaign (no bidding, no placements, no optimization), flatten it, and verify all defaults are correctly applied.
- [ ] **Step 4:** Run the full test suite: `bun test`.
- [ ] **Step 5:** Commit: `"test: add Meta end-to-end integration tests"`

### Task 30: Add --provider flag to CLI validate

**Files:**
- Modify: `cli/validate.ts` (or wherever validation is implemented)

- [ ] **Step 1:** Update validation to run interest/audience resolution when validating Meta campaigns. This catches ambiguous interests and missing audiences before `plan`/`apply`.
- [ ] **Step 2:** Run `bun test`.
- [ ] **Step 3:** Commit: `"feat: add Meta validation — interest/audience resolution during validate"`

### Task 31: Final verification and cleanup

- [ ] **Step 1:** Run the full test suite: `bun test`.
- [ ] **Step 2:** Run type checking: `bunx tsc --noEmit`.
- [ ] **Step 3:** Verify the example from the spec compiles and flattens correctly — create a temporary test file with the DSL example and verify it produces the expected `Resource[]`.
- [ ] **Step 4:** Review all new files for consistency with existing code style (readonly properties, naming conventions, error message formatting).
- [ ] **Step 5:** Commit any final cleanup: `"chore: final cleanup and verification for Meta provider"`

---

## Dependency Graph

```
Chunk 1 (Types + Constants)
    ↓
Chunk 2 (Builder + Helpers)     Chunk 4 (Provider Registry + CLI Refactoring)
    ↓                               ↓
Chunk 3 (Flatten)               Chunk 5 (API Client + Fetch)
    ↓                               ↓
    └───────────┬───────────────────┘
                ↓
        Chunk 6 (Apply + Upload)
                ↓
        Chunk 7 (Codegen + Import)
                ↓
        Chunk 8 (DX CLI Commands)
                ↓
        Chunk 9 (Integration + Polish)
```

**Parallelizable:** Chunks 2, 3, and 4 can be worked on concurrently after Chunk 1 completes. Chunk 5 can start once Chunk 4 is done (doesn't need Chunks 2-3).

**Total:** 31 tasks across 9 chunks.
