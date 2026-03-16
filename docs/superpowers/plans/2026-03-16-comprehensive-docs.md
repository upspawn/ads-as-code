# Comprehensive Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SKILL.md (AI agent reference) and expand the docs site from 12 → 26 pages, covering every exported function with working code examples.

**Architecture:** Two independent artifacts — SKILL.md in the SDK repo (`ads-as-code`) and MDX pages in the website repo (`ads-as-code-website`). Start with prerequisite export fixes, then SKILL.md (forces complete API inventory), then README fixes, then docs site expansion.

**Tech Stack:** Markdown (SKILL.md), MDX/Fumadocs (website), TypeScript (export fixes)

**Spec:** `docs/superpowers/specs/2026-03-16-comprehensive-docs-design.md`

---

## Chunk 1: Prerequisites + SKILL.md

### Task 1: Export missing helpers

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/src/index.ts`
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/package.json` (add SKILL.md to files array)

- [ ] **Step 1: Add missing exports to src/index.ts**

Add `lifetime` to the budget exports (line 98 area):
```typescript
export {
  exact, phrase, broad, keywords,
  daily, monthly, lifetime, eur, usd,
  // ... rest unchanged
} from './helpers/index.ts'
```

Check if `lifetime` is re-exported from `src/helpers/index.ts`. If not, add it there too.

Add `lookalike` to the Meta targeting exports (line 144-150 area):
```typescript
export {
  age,
  audience,
  excludeAudience,
  interests,
  lookalike,
  metaTargeting,
} from './helpers/meta-targeting.ts'
```

Add `automatic` to the Meta placement exports (line 152-154 area):
```typescript
export {
  manual,
  automatic,
} from './helpers/meta-placement.ts'
```

- [ ] **Step 2: Add SKILL.md to package.json files array**

In `package.json`, update the `files` field:
```json
"files": [
  "src",
  "!src/**/*.test.ts",
  "cli",
  "dist",
  "LICENSE",
  "SKILL.md"
],
```

- [ ] **Step 3: Verify typecheck passes**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify build passes**

Run: `bun run build`
Expected: Bundled modules + declarations generated

- [ ] **Step 5: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: export lifetime, automatic, lookalike helpers"
```

---

### Task 2: Write SKILL.md — Mental Model + Quick Start + Configuration

**Files:**
- Create: `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`

- [ ] **Step 1: Write the Mental Model section (~50 lines)**

Explain:
- What `@upspawn/ads` is (Pulumi-style, campaigns as TypeScript code)
- The pipeline: define campaigns → flatten to Resources → diff against live state → apply mutations
- Immutable builders: each `.group()` / `.adSet()` returns a new builder (enables factory patterns)
- Branded types: `headlines()` validates ≤30 chars at construction, not at API call time
- Convention-based discovery: CLI scans `campaigns/**/*.ts`, collects exports with `provider` + `kind`
- Resource identity: slugified paths (`campaign-name/group-name/kw:text:MATCH_TYPE`), content-hash for RSA ads
- Cache: SQLite maps code paths → platform IDs

- [ ] **Step 2: Write Quick Start section (~30 lines)**

```
bun add @upspawn/ads
ads init
ads auth google
# write campaign file
ads plan
ads apply
```

Minimal complete campaign example that works if copy-pasted.

- [ ] **Step 3: Write Configuration section (~40 lines)**

Cover `defineConfig()` with both Google and Meta config shapes. Show `ads.config.ts` example. Show credential resolution order (config → `~/.ads/credentials.json` → env vars).

- [ ] **Step 4: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md — mental model, quick start, configuration"
```

---

### Task 3: Write SKILL.md — Google Campaigns section (~400 lines)

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`

- [ ] **Step 1: Write Google Search campaign section (most detailed, ~120 lines)**

Complete working example with:
- `google.search()` builder with all config options (budget, bidding, targeting, networkSettings, trackingTemplate, negatives, status)
- `.group()` with keywords (exact, phrase, broad) and RSA ad
- `.locale()` for multi-locale campaigns
- `.sitelinks()`, `.callouts()`, `.snippets()`, `.calls()`
- Multiple ads per group

Reference files for accuracy:
- `src/google/index.ts` — builder API
- `src/google/types.ts` — SearchCampaignInput, AdGroupInput types

- [ ] **Step 2: Write Google Display campaign section (~60 lines)**

Complete example with:
- `google.display()` builder
- `.group()` with `responsiveDisplay()` ad
- Image assets: `landscape()`, `square()`, `logo()`
- Display targeting: `placements()`, `topics()`, `contentKeywords()`
- CPM bidding

Reference: `src/google/types.ts` — DisplayCampaignInput, DisplayAdGroupInput

- [ ] **Step 3: Write Google PMax campaign section (~50 lines)**

Complete example with:
- `google.performanceMax()` builder
- `.assetGroup()` with text + image + video assets
- Audience signals
- URL expansion control

Reference: `src/google/types.ts` — PMaxCampaignInput, AssetGroupInput

- [ ] **Step 4: Write Google Shopping campaign section (~40 lines)**

Complete example with:
- `google.shopping()` builder
- Shopping settings (merchantId, campaignPriority)
- `.group()` with product ad group

Reference: `src/google/types.ts` — GoogleShoppingCampaign

- [ ] **Step 5: Write Demand Gen, Smart, App sections (~80 lines combined)**

Demand Gen: `google.demandGen()`, `demandGenMultiAsset()`, `demandGenCarousel()`, `carouselCard()`
Smart: `google.smart()`, `smartAd()`, keyword themes
App: `google.app()`, `appAd()`, install vs engagement

Reference: `src/google/types.ts`, `src/helpers/demand-gen-ads.ts`, `src/helpers/ads.ts`

- [ ] **Step 6: Validate all examples by checking against actual type definitions**

Read `src/google/types.ts` and `src/google/index.ts` to verify every property name and builder method in the examples actually exists and has the correct shape.

- [ ] **Step 7: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md — all 7 Google campaign types with examples"
```

---

### Task 4: Write SKILL.md — Meta Campaigns section (~350 lines)

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`

- [ ] **Step 1: Write Meta builder pattern overview (~30 lines)**

Explain: `meta.traffic()` → `.adSet(name, config, content)` → chain more `.adSet()` calls. The builder is generic over objective `T`, which constrains valid optimization goals.

- [ ] **Step 2: Write objective table with valid optimization goals (~40 lines)**

Table mapping each objective to its valid goals:
- `traffic` → `LINK_CLICKS | LANDING_PAGE_VIEWS | REACH | IMPRESSIONS`
- `conversions` / `sales` → `OFFSITE_CONVERSIONS | VALUE | ...`
- `leads` → `LEAD_GENERATION | CONVERSATIONS | ...`
- etc.

Reference: `src/meta/types.ts` — `OptimizationGoalMap` type

- [ ] **Step 3: Write complete traffic campaign example (~50 lines)**

With: budget, ad set with targeting, image ad creative, full working code.

- [ ] **Step 4: Write complete conversions campaign example (~50 lines)**

With: pixel/conversion config, carousel ad, interest targeting, cost cap bidding.

- [ ] **Step 5: Write Meta creative types section (~60 lines)**

`metaImage()`, `metaVideo()`, `carousel()`, `boostedPost()` — each with signature and example.

Reference: `src/helpers/meta-creative.ts`

- [ ] **Step 6: Write Meta targeting section (~50 lines)**

`metaTargeting()`, `interests()`, `age()`, `audience()`, `excludeAudience()`, `lookalike()` — composition pattern with examples.

Reference: `src/helpers/meta-targeting.ts`

- [ ] **Step 7: Write Meta bidding + placement sections (~40 lines)**

`lowestCost()`, `costCap()`, `bidCap()`, `minRoas()`, `manual()`, `automatic()`.

Reference: `src/helpers/meta-bidding.ts`, `src/helpers/meta-placement.ts`

- [ ] **Step 8: Validate all examples against actual types**

Read `src/meta/types.ts` and `src/meta/index.ts` to verify.

- [ ] **Step 9: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md — Meta campaigns, creatives, targeting, bidding"
```

---

### Task 5: Write SKILL.md — Helpers Reference (~400 lines)

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`

- [ ] **Step 1: Write keyword helpers section**

`exact()`, `phrase()`, `broad()`, `keywords()` — each with full TypeScript signature and one-line example.

Reference: `src/helpers/keywords.ts`

- [ ] **Step 2: Write budget helpers section**

`daily()`, `monthly()`, `lifetime()`, `eur()`, `usd()`.

Reference: `src/helpers/budget.ts`

- [ ] **Step 3: Write ad helpers section**

`headlines()`, `descriptions()`, `rsa()`, `responsiveDisplay()`, `demandGenMultiAsset()`, `demandGenCarousel()`, `carouselCard()`, `smartAd()`, `appAd()`.

Reference: `src/helpers/ads.ts`, `src/helpers/display-ads.ts`, `src/helpers/demand-gen-ads.ts`

- [ ] **Step 4: Write targeting helpers section**

All 20+ targeting helpers, organized by category (geographic, language, schedule, device, demographics, audiences, display-specific, composition).

Reference: `src/helpers/targeting.ts`

- [ ] **Step 5: Write extension helpers section**

`link()`, `callouts()`, `snippet()`, `call()`, `price()`, `promotion()`, `image()`.

Reference: `src/helpers/extensions.ts`

- [ ] **Step 6: Write URL, negatives, image asset, account-level helpers**

`url()`, `negatives()`, `landscape()`, `square()`, `portrait()`, `logo()`, `logoLandscape()`, `sharedNegatives()`, `conversionAction()`, `sharedBudget()`.

Reference: `src/helpers/url.ts`, `src/helpers/negatives.ts`, `src/google/image-assets.ts`, `src/google/shared-types.ts`

- [ ] **Step 7: Write Meta creative, targeting, bidding, placement helpers**

(Brief reference — full details already in Task 4's Meta section. This section has signatures + one-line examples only, cross-referencing the Meta Campaigns section.)

- [ ] **Step 8: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md — complete helpers reference"
```

---

### Task 6: Write SKILL.md — Builder Methods, AI Module, CLI, Patterns, Gotchas, Types (~870 lines)

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`

- [ ] **Step 1: Write Builder Methods Reference (~200 lines)**

Document all chainable methods for each builder type:
- `CampaignBuilder`: `.group()`, `.locale()`, `.sitelinks()`, `.callouts()`, `.snippets()`, `.calls()`, `.prices()`, `.promotions()`, `.images()`
- `DisplayCampaignBuilder`: `.group()`
- `PMaxCampaignBuilder`: `.assetGroup()`
- `ShoppingCampaignBuilder`: `.group()`
- `DemandGenCampaignBuilder`: `.group()`
- `MetaCampaignBuilder<T>`: `.adSet()`, `.build()`

Each with signature and one-line description.

Reference: `src/google/index.ts`, `src/meta/index.ts`

- [ ] **Step 2: Write AI Module section (~100 lines)**

`ai.rsa()`, `ai.keywords()`, `ai.metaCopy()`, `ai.interests()` — markers, generate workflow, optimize workflow.

Reference: `src/ai/index.ts`

- [ ] **Step 3: Write CLI Commands section (~150 lines)**

Every command with flags and brief example output:
`init`, `auth`, `import`, `validate`, `plan`, `apply`, `pull`, `status`, `generate`, `optimize`, `search`, `audiences`, `history`, `doctor`, `cache`

Reference: `cli/index.ts`

- [ ] **Step 4: Write Common Patterns section (~200 lines)**

- Shared targeting/negatives (import from separate files)
- Factory functions for campaign variants
- Multi-locale campaigns with `.locale()`
- Multiple ads per ad group
- Campaign-level extensions
- Named exports for discovery

Include complete working code for each pattern.

- [ ] **Step 5: Write Gotchas & Constraints section (~120 lines)**

Table of validation constraints:
| Helper | Constraint |
|--------|-----------|
| `headlines()` | ≤30 chars per headline |
| `descriptions()` | ≤90 chars per description |
| `rsa()` | 3-15 headlines, 2-4 descriptions |
| `callouts()` | ≤25 chars per callout |
| etc. |

Common mistakes:
- EUR is default currency (not USD)
- `rsa()` takes positional args, not an object
- Branded types: can't pass raw strings where `Headline[]` is expected
- `export default` vs named exports — both work for discovery
- `.group()` key must be unique within a campaign
- Budget amounts are in currency units, not micros

- [ ] **Step 6: Write Type Reference section (~200 lines)**

Key types organized by domain: Core, Google, Meta, Helpers. Focus on types users actually reference in their code (BiddingStrategy, Targeting, Resource, etc.), not internal infrastructure types.

- [ ] **Step 7: Commit**

```bash
git add SKILL.md
git commit -m "docs: SKILL.md — builders, AI, CLI, patterns, gotchas, types"
```

---

### Task 7: README fixes

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/README.md`

- [ ] **Step 1: Fix inaccuracies**

1. Line 5: Change MIT badge to Apache-2.0: `[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)`
2. Line 392: Change `v0.2.0` to `v0.1.0`
3. Lines 313-314: Replace `730-096-7494` with `YOUR_CUSTOMER_ID`, `239-066-1468` with `YOUR_MANAGER_ID`
4. Line 476: Change `MIT` to `Apache-2.0`

- [ ] **Step 2: Add links to docs site and SKILL.md**

After the Quick Start section, add:
```markdown
📖 **[Full documentation](https://ads-as-code.upspawn.com/docs)** | 🤖 **[AI agent reference (SKILL.md)](SKILL.md)**
```

(Verify the actual docs site URL from the website repo config before using it.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "fix: README — Apache-2.0 badge, v0.1.0, placeholder IDs, doc links"
```

---

## Chunk 2: Docs Site — New Guide Pages

All work in `/Users/alex/Projects/upspawn-products/ads-as-code-website/`.

### Task 8: Meta campaigns guide (NEW page)

**Files:**
- Create: `content/docs/guides/meta-campaigns.mdx`

- [ ] **Step 1: Write meta-campaigns.mdx**

Structure:
1. MetaCampaignBuilder pattern overview
2. Objectives table with valid optimization goals
3. Complete traffic campaign example (image ad)
4. Complete conversions campaign example (carousel)
5. Ad set configuration (targeting, scheduling, budget, optimization)
6. Creative types with examples: `metaImage()`, `metaVideo()`, `carousel()`, `boostedPost()`
7. Meta targeting composition: `metaTargeting()`, `interests()`, `age()`, `audience()`, `excludeAudience()`
8. Placements: `manual()` vs automatic
9. Bidding: `lowestCost()`, `costCap()`, `bidCap()`, `minRoas()`
10. Crosslinks to: reference/api, reference/targeting, reference/bidding-strategies

Frontmatter:
```yaml
---
title: Meta (Facebook/Instagram) Campaigns
description: Build Meta ad campaigns with type-safe objectives, ad sets, and creatives
---
```

All code examples must use `import { ... } from '@upspawn/ads'` and be copy-paste runnable.

Validate examples against `src/meta/types.ts` and `src/meta/index.ts` in the SDK repo.

- [ ] **Step 2: Commit**

```bash
git add content/docs/guides/meta-campaigns.mdx
git commit -m "docs: Meta campaigns guide — objectives, creatives, targeting, bidding"
```

---

### Task 9: Google Display campaigns guide (NEW page)

**Files:**
- Create: `content/docs/guides/google-display-campaigns.mdx`

- [ ] **Step 1: Write google-display-campaigns.mdx**

Structure:
1. When to use Display vs Search
2. `google.display()` builder with all options
3. Responsive Display Ads with `responsiveDisplay()` helper
4. Image assets: `landscape()`, `square()`, `portrait()`, `logo()`, `logoLandscape()`
5. Display-specific targeting: `placements()`, `topics()`, `contentKeywords()`
6. CPM bidding: `manual-cpm`, `{ type: 'target-cpm', targetCpm: N }`
7. Complete working example
8. Crosslinks to: reference/targeting, reference/bidding-strategies, concepts/how-it-works

Frontmatter:
```yaml
---
title: Google Display Campaigns
description: Build Display campaigns with responsive ads, image assets, and placement targeting
---
```

Validate examples against `src/google/types.ts` — `DisplayCampaignInput`, `DisplayAdGroupInput`, `ResponsiveDisplayAd`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/guides/google-display-campaigns.mdx
git commit -m "docs: Google Display campaigns guide"
```

---

### Task 10: Google PMax campaigns guide (NEW page)

**Files:**
- Create: `content/docs/guides/google-pmax-campaigns.mdx`

- [ ] **Step 1: Write google-pmax-campaigns.mdx**

Structure:
1. When to use Performance Max
2. `google.performanceMax()` builder
3. Asset groups with `.assetGroup()` — text, image, video assets
4. Audience signals
5. URL expansion control
6. Complete working example
7. Crosslinks

Validate against `src/google/types.ts` — `PMaxCampaignInput`, `AssetGroupInput`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/guides/google-pmax-campaigns.mdx
git commit -m "docs: Google Performance Max campaigns guide"
```

---

### Task 11: Google Shopping campaigns guide (NEW page)

**Files:**
- Create: `content/docs/guides/google-shopping-campaigns.mdx`

- [ ] **Step 1: Write google-shopping-campaigns.mdx**

Structure:
1. Prerequisites: Merchant Center account, linked to Google Ads
2. `google.shopping()` builder with shopping settings
3. Product ad groups
4. Bidding strategies for Shopping
5. Complete working example
6. Crosslinks

Validate against `src/google/types.ts` — `GoogleShoppingCampaign`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/guides/google-shopping-campaigns.mdx
git commit -m "docs: Google Shopping campaigns guide"
```

---

### Task 12: Google other campaigns guide (NEW page)

**Files:**
- Create: `content/docs/guides/google-other-campaigns.mdx`

- [ ] **Step 1: Write google-other-campaigns.mdx**

Three sections, each with a complete working example:

**Demand Gen:**
- `google.demandGen()` builder
- `demandGenMultiAsset()`, `demandGenCarousel()`, `carouselCard()` ad helpers
- Channel controls (YouTube, Discover, Gmail, Display)

**Smart:**
- `google.smart()` (returns campaign object, not a builder)
- `smartAd()` helper (exactly 3 headlines, 2 descriptions)
- Keyword themes, business name

**App:**
- `google.app()` (returns campaign object, not a builder)
- `appAd()` helper
- Install vs engagement vs pre-registration campaigns

Validate against `src/google/types.ts`, `src/helpers/demand-gen-ads.ts`, `src/helpers/ads.ts`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/guides/google-other-campaigns.mdx
git commit -m "docs: Demand Gen, Smart, App campaigns guide"
```

---

### Task 13: Rename writing-campaigns → google-search-campaigns + expand

**Files:**
- Rename: `content/docs/guides/writing-campaigns.mdx` → `content/docs/guides/google-search-campaigns.mdx`
- Modify: `content/docs/guides/meta.json` (if this controls guide ordering)

- [ ] **Step 1: Rename the file**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code-website
git mv content/docs/guides/writing-campaigns.mdx content/docs/guides/google-search-campaigns.mdx
```

- [ ] **Step 2: Update frontmatter title**

```yaml
---
title: Google Search Campaigns
description: Build Search campaigns with keywords, RSA ads, extensions, and targeting
---
```

- [ ] **Step 3: Expand content**

Add sections for:
- All 9 bidding strategies (currently only 4 documented)
- Network settings (`networkSettings: { searchNetwork, searchPartners, displayNetwork }`)
- Device bid adjustments (`device('mobile', -0.5)`)
- Multiple ads per group (show array in `ads` field)
- Crosslinks to reference/targeting, reference/extensions, reference/bidding-strategies, concepts/resource-identity

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: rename writing-campaigns → google-search-campaigns, expand coverage"
```

---

## Chunk 3: Docs Site — Concepts Pages

### Task 14: Concepts section — how-it-works.mdx

**Files:**
- Create: `content/docs/concepts/meta.json`
- Create: `content/docs/concepts/how-it-works.mdx`

- [ ] **Step 1: Create concepts/meta.json**

```json
{
  "title": "Concepts",
  "pages": [
    "how-it-works",
    "resource-identity",
    "diff-engine",
    "providers"
  ]
}
```

- [ ] **Step 2: Write how-it-works.mdx**

Cover:
1. The pipeline diagram: campaign definition → flatten → diff → apply
2. Why immutable builders (safe composition, factory patterns — code example showing reuse)
3. Why branded types (catch "headline too long" at construction, not during API call — code example)
4. Convention-based discovery (how CLI finds campaigns, what exports must look like)
5. The cache's role (path → platformId mapping, why it's needed)
6. Crosslinks to: resource-identity, diff-engine, getting-started

- [ ] **Step 3: Commit**

```bash
git add content/docs/concepts/
git commit -m "docs: concepts — how it works"
```

---

### Task 15: Concepts — resource-identity.mdx

**Files:**
- Create: `content/docs/concepts/resource-identity.mdx`

- [ ] **Step 1: Write resource-identity.mdx**

Cover:
1. Resource paths: slugified, hierarchical (`campaign-name/group-name/kw:exact:pdf renamer`)
2. Why paths instead of platform IDs (code-first identity, platform IDs change on recreate)
3. RSA content hashing (ads don't have user-assigned names, identity = hash of sorted headlines + descriptions + URL)
4. Cache as the bridge (maps code path → platform ID, created on first `apply`, updated on subsequent)
5. What happens on: rename, content change, delete+recreate
6. Crosslinks to: how-it-works, diff-engine, reference/cache

- [ ] **Step 2: Commit**

```bash
git add content/docs/concepts/resource-identity.mdx
git commit -m "docs: concepts — resource identity"
```

---

### Task 16: Concepts — diff-engine.mdx

**Files:**
- Create: `content/docs/concepts/diff-engine.mdx`

- [ ] **Step 1: Write diff-engine.mdx**

Cover:
1. The diff function: `diff(desired, actual, managedPaths, pathToPlatformId) → Changeset`
2. Semantic comparison rules with examples:
   - Budget: micros comparison (avoids `1.50 !== 1.4999999...`)
   - Headlines/descriptions: sorted before comparison (order doesn't matter in RSA)
   - Keywords: case-insensitive text comparison
   - URLs: normalized (trailing slashes stripped, protocol standardized)
   - Booleans, enums: normalized to consistent format
3. Zero-diff round-trips: `import → plan = 0 changes` — why this matters, how it's achieved
4. Changeset structure: `{ creates, updates, deletes, unchanged }`
5. Crosslinks to: resource-identity, how-it-works, reference/cli (plan command)

- [ ] **Step 2: Commit**

```bash
git add content/docs/concepts/diff-engine.mdx
git commit -m "docs: concepts — diff engine"
```

---

### Task 17: Concepts — providers.mdx

**Files:**
- Create: `content/docs/concepts/providers.mdx`

- [ ] **Step 1: Write providers.mdx**

Cover:
1. Provider interface: fetch, flatten, apply, codegen — what each does
2. How the core engine is provider-agnostic (operates on `Resource[]` regardless of source)
3. Google provider: gRPC via google-ads-api, numeric enums, snake_case fields
4. Meta provider: Graph API, REST, different auth model
5. What they share: Resource type, diff engine, cache, CLI commands
6. Crosslinks to: how-it-works, reference/configuration

- [ ] **Step 2: Commit**

```bash
git add content/docs/concepts/providers.mdx
git commit -m "docs: concepts — provider architecture"
```

---

## Chunk 4: Docs Site — New Reference Pages + Updates

### Task 18: Reference — targeting.mdx (NEW)

**Files:**
- Create: `content/docs/reference/targeting.mdx`

- [ ] **Step 1: Write targeting.mdx**

Organized by category, each helper with: signature, description, constraints, working example.

**Google targeting:**
- Geographic: `geo()`, `regions()`, `cities()`, `radius()`, `presence()`
- Language: `languages()`
- Schedule: `weekdays()`, `hours()`, `scheduleBid()`
- Device: `device()` with bid adjustment explanation
- Demographics: `demographics()` — age ranges, genders, income ranges, parental status
- Audiences: `audiences()`, `audienceTargeting()`, `remarketing()`, `customAudience()`, `inMarket()`, `affinity()`, `customerMatch()`
- Display-specific: `placements()`, `topics()`, `contentKeywords()`
- Composition: `targeting(...rules)`

**Meta targeting:**
- `metaTargeting()`, `interests()`, `age()`, `audience()`, `excludeAudience()`, `lookalike()`

Crosslinks to: google-search-campaigns, google-display-campaigns, meta-campaigns guides.

Validate all signatures against `src/helpers/targeting.ts` and `src/helpers/meta-targeting.ts`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/reference/targeting.mdx
git commit -m "docs: reference — complete targeting helpers"
```

---

### Task 19: Reference — extensions.mdx (NEW)

**Files:**
- Create: `content/docs/reference/extensions.mdx`

- [ ] **Step 1: Write extensions.mdx**

Each extension with: signature, constraints (char limits, count limits), working example.

- `link(text, url, options?)` — sitelinks (text ≤25, desc ≤35)
- `callouts(...texts)` — callout texts (≤25 chars each)
- `snippet(header, ...values)` — structured snippets (3-10 values, ≤25 chars)
- `call(phoneNumber, countryCode, callOnly?)` — call extensions
- `price(qualifier?, ...items)` — price extensions (3-8 items)
- `promotion(config)` — promotion extensions
- `image(imageUrl, altText?)` — image extensions

Campaign-level methods: `.sitelinks()`, `.callouts()`, `.snippets()`, `.calls()`, `.prices()`, `.promotions()`, `.images()`

Validate against `src/helpers/extensions.ts`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/reference/extensions.mdx
git commit -m "docs: reference — complete extensions"
```

---

### Task 20: Reference — bidding-strategies.mdx (NEW)

**Files:**
- Create: `content/docs/reference/bidding-strategies.mdx`

- [ ] **Step 1: Write bidding-strategies.mdx**

**Google (9 strategies):**
- Simple string strategies: `'maximize-clicks'`, `'maximize-conversions'`, `'maximize-conversion-value'`, `'manual-cpc'`, `'manual-cpm'`
- Object strategies: `{ type: 'target-cpa', targetCpa: number }`, `{ type: 'target-roas', targetRoas: number }`, `{ type: 'target-impression-share', location: string, percent: number }`, `{ type: 'target-cpm', targetCpm: number }`
- Gotcha: `target_roas` is a raw double (3.5 = 350% ROAS), NOT micros
- Which campaign types support which strategies

**Meta (4 strategies):**
- `lowestCost()` — automatic, no cap
- `costCap(amount)` — average cost per result
- `bidCap(amount)` — max bid per auction
- `minRoas(floor)` — minimum ROAS
- When to use each, with real-world guidance

Validate against `src/google/types.ts` (BiddingStrategy type) and `src/helpers/meta-bidding.ts`.

- [ ] **Step 2: Commit**

```bash
git add content/docs/reference/bidding-strategies.mdx
git commit -m "docs: reference — bidding strategies"
```

---

### Task 21: Expand reference/api.mdx

**Files:**
- Modify: `content/docs/reference/api.mdx`

- [ ] **Step 1: Add internal TOC and expand to cover all ~88 exports**

Structure with clear section headings:
1. Campaign Builders (google.search, google.display, google.performanceMax, google.shopping, google.demandGen, google.smart, google.app, meta.traffic, meta.conversions, meta.leads, meta.sales, meta.awareness, meta.engagement, meta.appPromotion)
2. Builder Methods (all chainable methods per type)
3. Ad Helpers (headlines, descriptions, rsa, responsiveDisplay, demandGenMultiAsset, demandGenCarousel, carouselCard, smartAd, appAd)
4. Keyword Helpers (exact, phrase, broad, keywords)
5. Budget Helpers (daily, monthly, lifetime, eur, usd)
6. Targeting Helpers (all 20+ — brief, link to reference/targeting for detail)
7. Extension Helpers (all 8 — brief, link to reference/extensions for detail)
8. Image Asset Helpers (landscape, square, portrait, logo, logoLandscape)
9. URL & Negatives (url, negatives)
10. Meta Creative Helpers (metaImage, metaVideo, carousel, boostedPost)
11. Meta Targeting Helpers (metaTargeting, interests, age, audience, excludeAudience, lookalike)
12. Meta Bidding Helpers (lowestCost, costCap, bidCap, minRoas)
13. Meta Placement Helpers (manual, automatic)
14. Account-Level Helpers (sharedNegatives, conversionAction, sharedBudget)
15. AI Module (ai.rsa, ai.keywords, ai.metaCopy, ai.interests)
16. Config (defineConfig)

Each entry: function name, signature, one-line description, link to deeper reference page where applicable.

- [ ] **Step 2: Commit**

```bash
git add content/docs/reference/api.mdx
git commit -m "docs: reference/api — expand to full ~88 export coverage"
```

---

### Task 22: Expand reference/cli.mdx

**Files:**
- Modify: `content/docs/reference/cli.mdx`

- [ ] **Step 1: Add example output for each command**

For each of the 15+ commands, add realistic example output showing what the user will see. Include all documented flags.

Reference: `cli/index.ts` for USAGE string and flag definitions.

- [ ] **Step 2: Commit**

```bash
git add content/docs/reference/cli.mdx
git commit -m "docs: reference/cli — add example output for all commands"
```

---

### Task 23: Update getting-started.mdx

**Files:**
- Modify: `content/docs/getting-started.mdx`

- [ ] **Step 1: Fix inaccuracies and add prerequisites**

- Fix any version/license references
- Replace real-looking customer IDs with placeholders
- Add "What you'll need" section: Bun ≥1.0, Google Ads account (or Meta), API credentials
- Add crosslinks to setup guides

- [ ] **Step 2: Commit**

```bash
git add content/docs/getting-started.mdx
git commit -m "docs: getting-started — fix inaccuracies, add prerequisites"
```

---

### Task 24: Update navigation (meta.json)

**Files:**
- Modify: `content/docs/meta.json`

- [ ] **Step 1: Update root meta.json to include new sections**

Add Concepts section between Guides and Reference. Add new guide pages. Add new reference pages. Verify the exact Fumadocs meta.json format by reading the existing file first.

The guides section in the meta.json (or the guides/meta.json) should list:
```
google-ads-setup, meta-ads-setup, google-search-campaigns, google-display-campaigns,
google-pmax-campaigns, google-shopping-campaigns, google-other-campaigns, meta-campaigns,
shared-config, ai-generation, campaign-variants
```

- [ ] **Step 2: Commit**

```bash
git add content/docs/
git commit -m "docs: update navigation for new sections"
```

---

### Task 25: Add crosslinks throughout

**Files:**
- Modify: All existing and new MDX files

- [ ] **Step 1: Add crosslinks to all guide pages**

Every guide should link to:
- Relevant reference pages (targeting, extensions, bidding-strategies, api)
- Relevant concepts pages (how-it-works, resource-identity, diff-engine)

Use Fumadocs link syntax (check existing pages for the pattern).

- [ ] **Step 2: Add "Used in" links to reference pages**

Each reference page should link back to guides that use those helpers.

- [ ] **Step 3: Add links from concepts to concrete examples in guides**

- [ ] **Step 4: Commit**

```bash
git add content/docs/
git commit -m "docs: add crosslinks between guides, concepts, and reference"
```

---

## Chunk 5: Final Verification

### Task 26: Verify SKILL.md works for AI agents

**Files:** None (verification only)

- [ ] **Step 1: Verify SKILL.md is included in npm tarball**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
npm pack --dry-run 2>&1 | grep SKILL.md
```

Expected: `SKILL.md` appears in the tarball listing

- [ ] **Step 2: Verify all exports pass typecheck**

```bash
bunx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Verify build passes**

```bash
bun run build
```

Expected: Clean build

- [ ] **Step 4: Verify tests pass**

```bash
bun test
```

Expected: All tests pass

---

### Task 27: Verify docs site builds

**Files:** None (verification only)

- [ ] **Step 1: Build the docs site**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code-website
bun install && bun run build
```

Expected: Clean build, no broken links or missing pages

- [ ] **Step 2: Verify new pages are accessible**

Check that all new routes resolve:
- `/docs/guides/meta-campaigns`
- `/docs/guides/google-display-campaigns`
- `/docs/guides/google-pmax-campaigns`
- `/docs/guides/google-shopping-campaigns`
- `/docs/guides/google-other-campaigns`
- `/docs/guides/google-search-campaigns` (renamed)
- `/docs/concepts/how-it-works`
- `/docs/concepts/resource-identity`
- `/docs/concepts/diff-engine`
- `/docs/concepts/providers`
- `/docs/reference/targeting`
- `/docs/reference/extensions`
- `/docs/reference/bidding-strategies`

---

### Task 28: Bump version and publish

**Files:**
- Modify: `/Users/alex/Projects/upspawn-products/ads-as-code/package.json`

- [ ] **Step 1: Bump version to 0.1.1**

Update `"version": "0.1.0"` → `"version": "0.1.1"` in package.json.

- [ ] **Step 2: Commit and tag**

```bash
git add package.json
git commit -m "chore: bump to v0.1.1 — SKILL.md, export fixes, README fixes"
git tag v0.1.1
```

- [ ] **Step 3: Push and publish**

```bash
git push origin main --tags
npm publish --otp=<code>
```

- [ ] **Step 4: Verify SKILL.md is in published package**

```bash
npm pack @upspawn/ads@0.1.1 --dry-run 2>&1 | grep SKILL.md
```
