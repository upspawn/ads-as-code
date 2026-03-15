# ads-as-code Website — Full Redesign Spec

**Date:** 2026-03-15
**Status:** Draft
**Project location:** `~/Projects/upspawn-products/ads-as-code-website`
**Supersedes:** `2026-03-15-website-landing-page-design.md` (single-page lander)

## Overview

Evolve the existing single-page lander into a comprehensive hybrid site: marketing feature showcase pages that sell + Fumadocs-powered documentation that teaches. Same Next.js app, same Vercel deployment.

## Audience

- GTM engineers
- Developer marketers
- Tech-savvy performance marketers

## Goals

1. **Primary:** Showcase each killer feature with its own dedicated page — make visitors understand the depth of the tool, not just the concept.
2. **Secondary:** Provide comprehensive documentation with setup guides (especially for the hard-to-configure Google and Meta APIs).
3. **Tertiary:** Position ads-as-code as a platform, not just a CLI tool — show what becomes possible when ads are code (pipelines, AI tools, automation).

## Brand Identity (unchanged)

| Element | Value |
|---------|-------|
| Name | ads-as-code |
| Logo | Typographic — "ads-as-code" in Fraunces |
| Headline font | Fraunces (variable optical serif) |
| Body font | DM Sans |
| Code font | Space Mono |
| Background | `#FAFAF7` (warm off-white) |
| Text | `#1A1A1A` (near-black) |
| Text muted | `#6B6B60` |
| Accent | `#E8590C` (burnt orange) |
| Code bg | `#F5F4F0` |
| Code border | `#E5E4E0` |
| Diff colors | `#16a34a` / `#ca8a04` / `#dc2626` |
| Tone | Confident and opinionated |

## Site Architecture

```
/                              Homepage (gateway to features)
/features/plan-apply           Core workflow: plan, apply, pull
/features/google-ads           Google Search campaigns
/features/meta-ads             Meta/Facebook/Instagram campaigns
/features/creatives            Image, video, carousel, boosted posts
/features/ai-generation        AI-powered ad copy
/features/ai-variants          Campaign multiplication, translations
/features/import               Import existing campaigns as code
/features/pipelines            Aspirational: CI/CD, image gen, automation
/features/developer-experience TypeScript DX, AI code tools
/docs/...                      Fumadocs documentation site
```

## Homepage

The homepage is a **gateway**, not a persuasion page. Its job is to quickly communicate what ads-as-code is and route visitors to the feature they care about.

### Structure

1. **Compact hero** — "Stop clicking. Start committing." headline, one-liner sub, two CTAs (Get Started, GitHub), small diff output. Tighter than the current full-page hero — gets visitors to feature pages fast.

2. **Feature showcase grid** — 9 cards organized in logical groups:
   - **Core:** Plan/Apply, Import
   - **Providers:** Google Ads, Meta Ads, Creatives
   - **AI:** Copy Generation, Campaign Variants
   - **Platform:** Pipelines, Developer Experience

   Each card has: headline, one-liner description, subtle visual hint (small code snippet or glyph). Links to `/features/*`.

3. **Stats strip** — Concrete numbers that signal maturity. e.g., "2 providers, 50+ helpers, 15 CLI commands, type-safe everything."

4. **Footer CTA** — Install command with copy button, Get Started + GitHub links, Docs/Contributing/Upspawn links.

No Problem section or How It Works on the homepage. Those narratives live in the feature pages.

## Feature Page Template

Every feature page follows a consistent structure with unique content:

### Template sections

1. **Hero block** — Bold Fraunces headline + one-sentence pitch + a primary code example or terminal output. Full-width, generous padding.

2. **The problem** — 2-3 punchy lines describing the pain this feature solves. The "I feel seen" moment, specific to this feature.

3. **How it works** — 1-3 code blocks showing the feature in action, each with a caption explaining what's happening. Real code from the project (using fictional "Arcflow" product examples, not real products).

4. **Capabilities list** — 4-6 items showing the breadth of the feature. Each with a short heading and one-liner.

5. **CTA strip** — "Get Started" → relevant docs page, "View on GitHub" → repo. Consistent across all feature pages.

### Aspirational pages variation

For Pipelines and Developer Experience, the template is the same but the tone shifts:
- Headlines frame possibilities, not instructions ("Your ads are code. Your pipeline is limitless.")
- Code examples are hypothetical workflows, not SDK features
- Capabilities describe what becomes possible, not what ships today
- No "Get Started" CTA — instead "Explore the SDK" or "Read the Docs"

## Feature Page Content

### 1. /features/plan-apply — "The Core Workflow"

**Headline:** "Preview every change before it goes live."
**Problem:** You can't diff ad changes. You can't roll back a bad campaign update. You have no audit trail of who changed what and when.
**Code examples:**
- `ads plan` diff output showing creates/updates/deletes
- `ads apply` success output
- `ads pull` drift detection (someone changed a bid in the UI)
**Capabilities:** Preview before apply, atomic mutations, dependency-ordered execution, rollback with git revert, drift detection, operation history

### 2. /features/google-ads — "Google Search Campaigns"

**Headline:** "Google Ads without the gRPC nightmares."
**Problem:** The Google Ads API is a maze of numeric enums, snake_case fields, budget-as-separate-resource patterns, and undocumented edge cases. The SDK handles all of it.
**Code examples:**
- Full campaign builder: `google.search()` → `.group()` → keywords + RSA ads
- Sitelinks and callout extensions
- Bidding strategies (maximize-clicks, target-cpa)
**Capabilities:** Type-safe builders, branded headline/description types, budget helpers (daily/monthly, EUR/USD), keyword match types, extensions, negative keywords

### 3. /features/meta-ads — "Meta Ads. Finally Manageable."

**Headline:** "Facebook and Instagram campaigns that live in git."
**Problem:** Meta's API changes every quarter. Their Business Suite UI is a maze. Managing campaigns across Facebook, Instagram, Stories, and Reels is fragmented.
**Code examples:**
- `meta.traffic()` campaign with ad sets and targeting
- Targeting with `interests()`, `audience()`, `excludeAudience()`, `lookalike()`
- Placement configuration (feeds, stories, reels)
**Capabilities:** 7 objective-typed builders (traffic, conversions, leads, awareness, engagement, sales, app promotion), type-safe optimization goals, interest/demographic targeting, lookalike & custom audiences, audience exclusions, Advantage+ support, placement control, `ads search` for interest/behavior discovery

### 4. /features/creatives — "Creative Assets as Code"

**Headline:** "Images, videos, and carousels — defined, versioned, deployed."
**Problem:** Creative management is scattered across UI tabs, shared drives, and Slack threads. Nobody knows which image is running in which ad.
**Code examples:**
- `image()` with local file path
- `video()` with thumbnail
- `carousel()` with multiple cards
- `boostedPost()` promoting an existing page post
**Capabilities:** Auto-upload during apply, asset download on import, carousel builder, boosted post support, creative-per-ad-set

### 5. /features/ai-generation — "AI Writes Your Ad Copy"

**Headline:** "Up to 15 headlines per RSA ad. In seconds."
**Problem:** Writing dozens of headline and description variations per ad group is mind-numbing. Maintaining quality and brand voice across them is harder.
**Code examples:**
- AI generating headlines and descriptions from a brief
- Optimizing existing copy for performance
- Quality scoring/judging
**Capabilities:** Generate from briefs, optimize existing copy, quality judgment, brand voice consistency, batch generation across campaigns

### 6. /features/ai-variants — "One Campaign. Every Market."

**Headline:** "Launch in 5 markets without 5x the work."
**Problem:** Expanding to new locales or customer segments means manually duplicating and translating campaigns. It's error-prone and doesn't scale.
**Code examples:**
- Single campaign → translated variants for DE, FR, ES
- ICP expansion (same product, different audience angles)
- Variant generation with customization hooks
**Capabilities:** Locale translations, ICP expansion, campaign multiplication, customizable templates, batch variant generation

### 7. /features/import — "Import First. Rewrite Never."

**Headline:** "50 campaigns in the UI? Now they're TypeScript."
**Problem:** You have an existing ad account with live campaigns. You can't adopt infrastructure-as-code without migrating, and migrating manually is insane.
**Code examples:**
- `ads import` → generated TypeScript files
- `ads import --provider meta` for Meta campaigns
- The generated code (clean, idiomatic, ready to modify)
**Capabilities:** Google + Meta import, clean codegen output, incremental import, preserves all campaign structure, sitelinks/callouts/extensions included

### 8. /features/pipelines — "Your Ads Are Code. Your Pipeline Is Limitless."

**Headline:** "What happens when ads live in your codebase?"
**Problem:** Ad creative and campaign management are disconnected from your development workflow. Changes are manual, untracked, and unautomated.
**Aspirational examples:**
- CI/CD: `ads plan` runs on PR, `ads apply` runs on merge to main
- Image generation: AI generates creative → writes to campaigns/ → deploys
- Staging: test campaigns against a sandbox account before going live
- Budget automation: git-triggered budget changes based on performance data
- Monitoring: drift detection in a cron job, alerts on unexpected changes
**Positioning:** These aren't SDK features — they're natural consequences of campaigns being TypeScript files in a git repo. The SDK provides the primitives; your pipeline provides the orchestration.

### 9. /features/developer-experience — "Your AI Already Knows TypeScript"

**Headline:** "The best ad management interface is your editor."
**Problem:** Ad platforms have GUIs. GUIs can't be automated, can't be reviewed, can't be tested. And your AI assistant can't click buttons — but it can write TypeScript.
**Aspirational examples:**
- Code completion on campaign builders (autocomplete headlines, match types, bidding strategies)
- Claude/Cursor generating full campaigns from a brief in a `.ts` file
- TypeScript catching "headline too long" at compile time, not after wasted budget
- Branded types as guardrails — the type system prevents invalid campaigns
- Deterministic control: AI writes code, you review the PR, ads deploy on merge
**Positioning:** No MCP integration needed. No special plugin. AI code tools already understand TypeScript files — that's the whole point. Ads-as-code turns ad management into a software engineering problem, and software engineering tools are decades ahead of ad platform UIs.

## Navigation

### Top nav (persistent across all pages)

```
[ads-as-code]          Features ▾    Docs    GitHub    [Get Started]
```

- **Logo:** "ads-as-code" in Fraunces, links to `/`
- **Features dropdown:** All 9 feature pages grouped (Core, Providers, AI, Platform)
- **Docs:** Links to `/docs`
- **GitHub:** External link to repo
- **Get Started:** Burnt orange CTA button → `/docs/getting-started`

### Mobile nav

Hamburger menu. Same links, stacked vertically. Features section expandable.

## Docs Section (Fumadocs)

### Content structure

```
content/docs/
├── index.mdx                    Docs landing / overview
├── getting-started.mdx          Quick start guide
├── guides/
│   ├── google-ads-setup.mdx     OAuth credentials walkthrough (hard!)
│   ├── meta-ads-setup.mdx       System user token walkthrough
│   ├── writing-campaigns.mdx    Campaign definitions guide
│   ├── shared-config.mdx        Negatives, targeting presets, factories
│   ├── ai-generation.mdx        Generate, optimize, judge workflows
│   └── campaign-variants.mdx    Translations, ICP expansion
├── reference/
│   ├── cli.mdx                  All CLI commands with flags
│   ├── api.mdx                  SDK exports, builder methods
│   ├── configuration.mdx        ads.config.ts, credentials
│   └── cache.mdx                SQLite cache, snapshots, history
```

### Fumadocs integration

- `fumadocs-core` + `fumadocs-ui` + `fumadocs-mdx` packages
- Source provider: `fumadocs-mdx` with content directory at `content/docs/`
- Sidebar auto-generated from file structure with `meta.json` for ordering
- Search: Fumadocs built-in search (static, no external service)
- Code blocks: Shiki (Fumadocs uses it natively)
- Theme: Customized to match the marketing site's warm palette

### Docs sidebar

```
Getting Started
Guides
  ├── Google Ads API Setup
  ├── Meta Ads API Setup
  ├── Writing Campaigns
  ├── Shared Config
  ├── AI Copy Generation
  └── Campaign Variants
Reference
  ├── CLI Reference
  ├── API Reference
  ├── Configuration
  └── Cache & State
```

## Technical Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 16, App Router | Already in use, Fumadocs requires it |
| Docs framework | Fumadocs | Best Next.js-native docs solution, search + sidebar + MDX |
| Styling | Tailwind CSS v4 | Already configured with custom theme |
| Code highlighting | Shiki | Already set up, Fumadocs uses it natively |
| Rendering | Static export (`output: 'export'`) | Fast CDN delivery, no server needed |
| Hosting | Vercel | Already deployed, auto-deploy on push |
| Font loading | `next/font` (Google) | Already configured |
| Content (marketing) | In-code (React components) | Design-heavy pages need JSX |
| Content (docs) | MDX via fumadocs-mdx | Content-heavy pages need Markdown |
| Example product | "Arcflow" (fictional SaaS) | Realistic but not a real product |

### Project structure

```
ads-as-code-website/
├── app/
│   ├── layout.tsx                 Root layout (fonts, nav, footer)
│   ├── page.tsx                   Homepage
│   ├── features/
│   │   ├── layout.tsx             Feature pages shared layout (optional)
│   │   ├── plan-apply/page.tsx
│   │   ├── google-ads/page.tsx
│   │   ├── meta-ads/page.tsx
│   │   ├── creatives/page.tsx
│   │   ├── ai-generation/page.tsx
│   │   ├── ai-variants/page.tsx
│   │   ├── import/page.tsx
│   │   ├── pipelines/page.tsx
│   │   └── developer-experience/page.tsx
│   ├── docs/
│   │   └── [[...slug]]/page.tsx   Fumadocs catch-all route
│   └── globals.css
├── components/
│   ├── Nav.tsx                    Persistent top navigation with dropdown
│   ├── MobileNav.tsx              Hamburger menu for mobile
│   ├── Footer.tsx                 Site-wide footer
│   ├── FeatureHero.tsx            Reusable feature page hero block
│   ├── FeatureProblem.tsx         Reusable "the problem" block
│   ├── FeatureCapabilities.tsx    Reusable capabilities grid
│   ├── FeatureCTA.tsx             Reusable CTA strip
│   ├── FeatureCard.tsx            Homepage feature grid card
│   ├── CodeBlock.tsx              Shiki-highlighted code (existing)
│   ├── DiffOutput.tsx             Animated diff (existing, for homepage)
│   ├── CopyButton.tsx             Clipboard copy (existing)
│   └── FadeIn.tsx                 Scroll animation (existing)
├── lib/
│   ├── highlight.ts               Shiki setup (existing)
│   ├── snippets/                  Content organized by feature page
│   │   ├── homepage.ts
│   │   ├── plan-apply.ts
│   │   ├── google-ads.ts
│   │   ├── meta-ads.ts
│   │   ├── creatives.ts
│   │   ├── ai-generation.ts
│   │   ├── ai-variants.ts
│   │   ├── import.ts
│   │   ├── pipelines.ts
│   │   └── developer-experience.ts
│   └── source.ts                  Fumadocs source configuration
├── content/
│   └── docs/                      MDX documentation files
│       ├── meta.json              Sidebar ordering
│       ├── index.mdx
│       ├── getting-started.mdx
│       ├── guides/
│       │   ├── meta.json
│       │   ├── google-ads-setup.mdx
│       │   ├── meta-ads-setup.mdx
│       │   ├── writing-campaigns.mdx
│       │   ├── shared-config.mdx
│       │   ├── ai-generation.mdx
│       │   └── campaign-variants.mdx
│       └── reference/
│           ├── meta.json
│           ├── cli.mdx
│           ├── api.mdx
│           ├── configuration.mdx
│           └── cache.mdx
├── public/
│   └── og-image.png
├── next.config.ts
└── package.json
```

### Key changes from current site

- `lib/snippets.ts` → `lib/snippets/*.ts` (one file per feature page)
- Add `components/Nav.tsx` with dropdown (replace current simple nav)
- Add `components/MobileNav.tsx` for responsive hamburger
- Add `components/Feature*.tsx` reusable template components
- Add `content/docs/` for Fumadocs MDX content
- Add `lib/source.ts` for Fumadocs source configuration
- Add `app/docs/[[...slug]]/page.tsx` for Fumadocs routing
- Add `app/features/*/page.tsx` for each feature page

### Responsive behavior

- **Mobile (< 768px):** Hamburger nav, single column, code blocks scroll horizontally, feature cards stack vertically
- **Tablet (768-1024px):** Feature cards 2-column grid, docs sidebar collapsible
- **Desktop (> 1024px):** Full layout, max content width ~1100px for marketing, ~900px for docs content + sidebar

### SEO & Metadata

Each page gets its own metadata:

| Page | Title pattern |
|------|--------------|
| Homepage | `ads-as-code — Infrastructure as code for ad campaigns` |
| Feature pages | `[Feature Name] — ads-as-code` |
| Docs pages | `[Page Title] — ads-as-code Docs` |

OG images: 1200x630, one per page (can start with a single shared one, add per-page later).

## Design Principles (unchanged)

1. Generous whitespace
2. Typography-driven hierarchy
3. Code as first-class visual
4. Restrained color (burnt orange accent only)
5. No stock illustrations
6. Subtle scroll-triggered fade-ins
7. Purpose over decoration

## Out of Scope

- Dark mode
- Blog
- Pricing page
- Authentication / accounts
- i18n for the website itself
- Analytics (add Vercel Analytics later)
- Per-page OG images (use shared one initially)
- Video embeds or interactive demos

## Implementation Phases

While this is one spec, implementation should be chunked:

1. **Phase 1:** Navigation, homepage evolution, feature page template, 3 core feature pages (plan-apply, google-ads, meta-ads)
2. **Phase 2:** Remaining 6 feature pages
3. **Phase 3:** Fumadocs integration + all docs content
