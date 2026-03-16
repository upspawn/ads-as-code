# Comprehensive Documentation — Design Spec

**Date:** 2026-03-16
**Status:** Draft
**Goal:** Ship complete, high-quality documentation for the public `@upspawn/ads` npm package — covering every API surface with working code examples, explaining why things work the way they do, with cross-linked sections and a SKILL.md for AI agent consumption.

---

## Approach

Two artifacts, serving different audiences:

1. **SKILL.md** — Dense, flat, copy-paste-ready reference (~2.5K lines) shipped in the npm package root. Any AI coding agent loads this and can immediately write correct campaigns.
2. **Docs site expansion** — Expand the existing Fumadocs site from 12 → ~26 pages with full API coverage, concepts layer, and working examples.

Start with SKILL.md (higher leverage, forces complete API cataloging), then expand the docs site using the same verified examples.

### Prerequisites

Before writing docs, resolve these API gaps:
- **`lifetime()`** in `src/helpers/budget.ts` — not exported from `src/index.ts`. Needed for Meta campaigns with end dates. **Add to exports.**
- **`automatic()`** in `src/helpers/meta-placement.ts` — not exported. Meta automatic placements. **Add to exports.**
- **`lookalike()`** in `src/helpers/meta-targeting.ts` — not exported. Lookalike audiences. **Add to exports.**

### Export Inventory (~88 exports)

- ~55 user-facing helper functions (keywords, budget, ads, targeting, extensions, meta creative/targeting/bidding)
- ~14 builder constructors (7 Google + 7 Meta objectives)
- ~12 AI infrastructure exports (compile*, is*Marker, *Schema)
- ~7 account-level helpers (sharedNegatives, conversionAction, sharedBudget, image assets)

---

## Part 1: SKILL.md

**Location:** `/Users/alex/Projects/upspawn-products/ads-as-code/SKILL.md`
**Also include in npm tarball** via `files` field in package.json.

### Structure

```
SKILL.md (~2.5K lines)
├── Mental Model (50 lines)
├── Quick Start (30 lines)
├── Configuration — defineConfig() (40 lines)
├── Google Campaigns (400 lines)
│   - Search (detailed), Display, PMax, Shopping, Demand Gen, Smart, App
├── Meta Campaigns (350 lines)
│   - All 7 objectives with optimization goal constraints
│   - Ad set config, MetaCampaignBuilder methods (.adSet())
│   - Creative types: image, video, carousel, boostedPost
│   - Meta targeting: metaTargeting, interests, age, audience, excludeAudience, lookalike
│   - Meta placements: manual, automatic
│   - Meta bidding: lowestCost, costCap, bidCap, minRoas
├── Helpers Reference (400 lines)
│   - Every exported function: signature + one-line example
│   - Keywords, budget, ads (rsa, responsiveDisplay, demandGenMultiAsset, demandGenCarousel,
│     carouselCard, smartAd, appAd), targeting (all 20+), extensions (all 8),
│     image assets (landscape, square, portrait, logo, logoLandscape),
│     URL, negatives, Meta creative/targeting/bidding/placement helpers
│   - Account-level: sharedNegatives, conversionAction, sharedBudget
├── Builder Methods Reference (200 lines)
│   - Google: CampaignBuilder, DisplayCampaignBuilder, PMaxCampaignBuilder,
│     ShoppingCampaignBuilder, DemandGenCampaignBuilder
│   - Meta: MetaCampaignBuilder (.adSet(), .build())
├── AI Module (100 lines)
├── CLI Commands (150 lines)
├── Common Patterns (200 lines)
├── Gotchas & Constraints (120 lines)
│   - Includes validation constraints table (headline ≤30, description ≤90, callout ≤25, etc.)
│   - Common error messages and what they mean
└── Type Reference (200 lines)
```

### Content Principles

- **Every code example must work if copy-pasted.** No `/* ... */` in critical paths. Use real helper calls with real values.
- **Signatures are explicit.** Show actual TypeScript param types and return types.
- **One section = one concern.** AI agents scan by heading, so headings must be specific (e.g., "Targeting — Geographic" not just "Targeting").
- **Gotchas section is critical.** The things that trip up both humans and AI agents: `rsa()` takes positional args, EUR is default, branded types can't accept raw strings, export naming for discovery.
- **Include the "why" inline.** Not a separate section — annotate within reference entries why a design choice was made (e.g., "Immutable builders — each `.group()` call returns a new builder, the original is unchanged. This enables factory patterns.").

### Key Decisions

- **Format:** Markdown with code blocks. No frontmatter. No framework-specific syntax.
- **Scope:** Public API only. No internal types (Cache internals, flatten internals, etc.).
- **Examples use `@upspawn/ads` import path** — not relative paths. This is what consumers see.
- **Include in `files` array** in package.json so it ships with the npm package.

---

## Part 2: Docs Site Expansion

**Location:** `/Users/alex/Projects/upspawn-products/ads-as-code-website/content/docs/`
**Framework:** Fumadocs (MDX)

### Current State (12 pages)

```
├── index.mdx
├── getting-started.mdx
├── guides/ (6 pages)
│   ├── google-ads-setup.mdx
│   ├── meta-ads-setup.mdx
│   ├── writing-campaigns.mdx
│   ├── shared-config.mdx
│   ├── ai-generation.mdx
│   └── campaign-variants.mdx
└── reference/ (4 pages)
    ├── cli.mdx
    ├── api.mdx
    ├── configuration.mdx
    └── cache.mdx
```

### Target State (~26 pages)

```
├── index.mdx (update)
├── getting-started.mdx (update — fix badge, version, example IDs)
├── guides/ (11 pages)
│   ├── google-ads-setup.mdx (existing, minor updates)
│   ├── meta-ads-setup.mdx (existing, minor updates)
│   ├── google-search-campaigns.mdx (rename from writing-campaigns, expand)
│   ├── google-display-campaigns.mdx (NEW)
│   ├── google-pmax-campaigns.mdx (NEW)
│   ├── google-shopping-campaigns.mdx (NEW)
│   ├── google-other-campaigns.mdx (NEW — Demand Gen, Smart, App)
│   ├── meta-campaigns.mdx (NEW — builder pattern, ad sets, creatives, targeting)
│   ├── shared-config.mdx (existing, minor updates)
│   ├── ai-generation.mdx (existing, minor updates)
│   └── campaign-variants.mdx (existing, minor updates)
├── concepts/ (NEW section, 4 pages)
│   ├── meta.json (sidebar config)
│   ├── how-it-works.mdx — the pipeline: builders → flatten → diff → apply
│   ├── resource-identity.mdx — path-based identity, content hashing, cache
│   ├── diff-engine.mdx — semantic comparison, zero-diff round-trips
│   └── providers.mdx — provider architecture, how Google/Meta share core
└── reference/ (7 pages)
    ├── cli.mdx (expand — add example output per command)
    ├── api.mdx (expand — split into sections with internal anchors/TOC for ~88 exports)
    ├── targeting.mdx (NEW — all 20+ targeting helpers with examples)
    ├── extensions.mdx (NEW — all 8 extension types)
    ├── bidding-strategies.mdx (NEW — 9 Google + 4 Meta strategies)
    ├── configuration.mdx (existing, minor updates)
    └── cache.mdx (existing, minor updates)
```

### Navigation Update

Update `content/docs/meta.json` to add new sections:

```json
{
  "pages": ["index", "getting-started"],
  "groups": [
    {
      "title": "Guides",
      "pages": [
        "guides/google-ads-setup",
        "guides/meta-ads-setup",
        "guides/google-search-campaigns",
        "guides/google-display-campaigns",
        "guides/google-pmax-campaigns",
        "guides/google-shopping-campaigns",
        "guides/google-other-campaigns",
        "guides/meta-campaigns",
        "guides/shared-config",
        "guides/ai-generation",
        "guides/campaign-variants"
      ]
    },
    {
      "title": "Concepts",
      "pages": [
        "concepts/how-it-works",
        "concepts/resource-identity",
        "concepts/diff-engine",
        "concepts/providers"
      ]
    },
    {
      "title": "Reference",
      "pages": [
        "reference/cli",
        "reference/api",
        "reference/targeting",
        "reference/extensions",
        "reference/bidding-strategies",
        "reference/configuration",
        "reference/cache"
      ]
    }
  ]
}
```

### New Pages — Content Outline

#### guides/google-display-campaigns.mdx
- When to use Display vs Search
- `google.display()` builder with full example
- Responsive Display Ads: `responsiveDisplay()` helper
- Image assets: `landscape()`, `square()`, `portrait()`, `logo()`
- Display-specific targeting: `placements()`, `topics()`, `contentKeywords()`
- CPM bidding: `manual-cpm`, `target-cpm`
- Complete working example with all features

#### guides/google-pmax-campaigns.mdx
- When to use Performance Max
- `google.performanceMax()` builder
- Asset groups: `.assetGroup()` method
- Text assets (headlines, descriptions, long headlines)
- Image/video asset references
- Audience signals
- URL expansion control
- Complete working example

#### guides/google-shopping-campaigns.mdx
- Prerequisites: Merchant Center setup
- `google.shopping()` builder
- Shopping settings (merchantId, campaignPriority, inventoryFilter)
- Product ad groups
- Shopping-specific bidding
- Complete working example

#### guides/google-other-campaigns.mdx
- **Demand Gen:** `google.demandGen()`, `demandGenMultiAsset()`, `demandGenCarousel()`, channel controls
- **Smart:** `google.smart()`, `smartAd()`, keyword themes, business name
- **App:** `google.app()`, `appAd()`, install vs engagement campaigns
- Each with a complete working example

#### guides/meta-campaigns.mdx (NEW)
- MetaCampaignBuilder pattern: `meta.traffic()` → `.adSet()` → `.adSet()`
- All 7 objectives with their valid optimization goals (type-safe constraints)
- Ad set config: targeting, scheduling, budget, optimization
- Creative types: `metaImage()`, `metaVideo()`, `carousel()`, `boostedPost()`
- Meta targeting composition: `metaTargeting()`, `interests()`, `age()`, `audience()`, `excludeAudience()`
- Placements: `manual()` vs automatic
- Bidding: `lowestCost()`, `costCap()`, `bidCap()`, `minRoas()`
- Complete working examples for traffic + conversions campaigns

#### concepts/how-it-works.mdx
- The pipeline: campaign definition → flatten → diff → apply
- Why immutable builders (enables factory patterns, safe composition)
- Why branded types (catch errors at construction, not API call time)
- Why convention-based discovery (campaigns/*.ts exports)
- The cache's role (path → platformId mapping)

#### concepts/resource-identity.mdx
- Resource paths: slugified, hierarchical (`campaign/ad-group/kw:text:MATCH_TYPE`)
- Why paths, not platform IDs (code-first identity)
- RSA content hashing (ads don't have stable names)
- Cache as the bridge between code identity and platform identity
- What happens on rename, move, content change

#### concepts/diff-engine.mdx
- Pure function: `diff(desired, actual, managedPaths, pathToPlatformId) → Changeset`
- Semantic comparison rules:
  - Budget: micros comparison avoids float precision issues
  - Headlines/descriptions: order-independent (sorted before compare)
  - Keywords: case-insensitive text comparison
  - URLs: normalized (trailing slashes, protocol)
- Zero-diff round-trips: why `import → plan = 0 changes` matters
- Changeset structure: creates, updates, deletes, unchanged

#### concepts/providers.mdx
- Provider interface: fetch, flatten, apply, codegen
- How the core engine is provider-agnostic (operates on Resource[])
- Adding a new provider (what you'd implement)
- Google vs Meta: different APIs, same Resource model

#### reference/targeting.mdx
- Geographic: `geo()`, `regions()`, `cities()`, `radius()`, `presence()`
- Language: `languages()`
- Schedule: `weekdays()`, `hours()`, `scheduleBid()`
- Device: `device()` with bid adjustments
- Demographics: `demographics()` with age, gender, income, parental status
- Audiences: `audiences()`, `remarketing()`, `customAudience()`, `inMarket()`, `affinity()`, `customerMatch()`
- Display-specific: `placements()`, `topics()`, `contentKeywords()`
- Composition: `targeting()` and `audienceTargeting()`
- Meta-specific: `metaTargeting()`, `interests()`, `age()`, `audience()`, `excludeAudience()`
- Each with signature, description, and working example

#### reference/extensions.mdx
- `link()` — sitelinks with optional descriptions
- `callouts()` — callout texts (≤25 chars)
- `snippet()` — structured snippets (header + 3-10 values)
- `call()` — call extensions with country code
- `price()` — price extensions (3-8 items)
- `promotion()` — promotion extensions
- `image()` — image extensions
- Campaign-level: `.sitelinks()`, `.callouts()`, `.snippets()`, `.calls()`, etc.
- Each with signature, constraints, and working example

#### reference/bidding-strategies.mdx
- **Google (9 strategies):**
  - `'maximize-clicks'` — automated CPC (TARGET_SPEND internally)
  - `'maximize-conversions'` — automated conversion bidding
  - `'maximize-conversion-value'` — value-based automated bidding
  - `{ type: 'target-cpa', targetCpa: number }` — target cost per acquisition
  - `{ type: 'target-roas', targetRoas: number }` — target return on ad spend (raw double, NOT micros)
  - `{ type: 'target-impression-share', ... }` — target impression share
  - `'manual-cpc'` — manual CPC bidding
  - `'manual-cpm'` — manual CPM (Display/Video)
  - `{ type: 'target-cpm', targetCpm: number }` — target CPM
- **Meta (4 strategies):**
  - `lowestCost()` — automatic lowest cost
  - `costCap(amount)` — average cost per result cap
  - `bidCap(amount)` — max per-auction bid
  - `minRoas(floor)` — minimum ROAS floor
- When to use which, with real-world guidance

### Existing Pages — Updates Needed

#### getting-started.mdx
- Fix license badge: MIT → Apache-2.0
- Fix version: v0.2.0 → v0.1.0
- Fix config example: replace real-looking IDs with placeholders
- Add "What you'll need" prerequisites

#### guides/writing-campaigns.mdx → google-search-campaigns.mdx
- Rename file and update nav
- Expand bidding section (currently only 4 strategies, should be 9)
- Add network settings example
- Add device bid adjustments example
- Add multiple ads per group example

#### reference/api.mdx
- Expand to cover all ~88 exported functions/values
- Structure with internal anchors and TOC (page will be large — ~3K lines)
- Sections: Campaign Builders, Ad Helpers, Keyword Helpers, Budget Helpers, Targeting Helpers, Extension Helpers, Image Asset Helpers, Meta Creative/Targeting/Bidding/Placement Helpers, Account-Level Helpers, AI Module, Config
- Add Display, PMax, Shopping, Demand Gen, Smart, App builder methods
- Add all targeting helpers (currently missing ~10)
- Add all extension helpers (currently missing snippet, call, price, promotion)
- Add image asset helpers (landscape, square, portrait, logo, logoLandscape)
- Add Demand Gen ad helpers (demandGenMultiAsset, demandGenCarousel, carouselCard)
- Add Smart/App ad helpers (smartAd, appAd)
- Add account-level helpers (sharedNegatives, conversionAction, sharedBudget)
- Add MetaCampaignBuilder methods (.adSet(), .build())

#### reference/cli.mdx
- Add example output for each command
- Document all flags completely

### Crosslinking Strategy

- Every guide page includes "Related" callouts linking to:
  - Relevant reference pages (e.g., google-search-campaigns → targeting, extensions, bidding-strategies)
  - Relevant concepts pages (e.g., google-search-campaigns → resource-identity, diff-engine)
- Every reference page includes "Used in" links back to guides
- Concepts pages link to concrete examples in guides
- Getting started links to all setup guides

### Content Principles (same as SKILL.md)

- **Every code example must be copy-paste runnable**
- **Explain why, not just what** — e.g., "Budgets use micros internally (20,000,000 = $20) to avoid float precision issues. The `daily()` helper handles the conversion."
- **Crosslinks are inline** — link where the reader naturally wants more context, not in a footer dump
- **Progressive disclosure** — getting started is minimal, guides go deeper, reference is exhaustive

---

## Part 3: README Fixes

Quick fixes to the main repo README:

1. License badge: `MIT` → `Apache-2.0`
2. Status section: `v0.2.0` → `v0.1.0`
3. Config example: replace `730-096-7494` and `239-066-1468` with `YOUR_CUSTOMER_ID` / `YOUR_MANAGER_ID`
4. License footer: `MIT` → `Apache-2.0`
5. Add link to docs site
6. Add link to SKILL.md for AI agents

---

## Implementation Order

1. **SKILL.md** — Write the complete AI-ready reference (highest leverage)
2. **README fixes** — Quick wins, 10 minutes
3. **Docs site: new pages** — concepts/ (4 pages), then new guides (4 pages), then new reference pages (3 pages)
4. **Docs site: existing page updates** — getting-started, writing-campaigns rename, api.mdx expansion, cli.mdx expansion
5. **Navigation and crosslinks** — Update meta.json, add crosslinks throughout
6. **package.json** — Add SKILL.md to `files` array

---

## Success Criteria

- [ ] SKILL.md enables an AI agent to write a correct Google Search campaign on first try without additional context
- [ ] SKILL.md enables an AI agent to write a correct Meta traffic campaign with image ads on first try
- [ ] Every exported function (~88) appears in either SKILL.md or docs site reference (or both)
- [ ] Every code example in docs is runnable (no pseudocode in critical paths)
- [ ] Every guide page links to relevant reference and concepts pages
- [ ] No hardcoded real customer IDs anywhere in public-facing docs
- [ ] `npm pack --dry-run` shows SKILL.md in the tarball
- [ ] `lifetime()`, `automatic()`, `lookalike()` are exported from `src/index.ts`
