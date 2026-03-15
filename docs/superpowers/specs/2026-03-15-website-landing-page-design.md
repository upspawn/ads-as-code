# ads-as-code Landing Page — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Project location:** `~/Projects/upspawn-products/ads-as-code-website`

## Overview

Single-page marketing lander for the open-source `ads-as-code` project (`@upspawn/ads`). Drives GitHub adoption now, with room to evolve into an open-core product site later.

## Audience

- GTM engineers
- Developer marketers
- Tech-savvy performance marketers

These are people who write TypeScript but care about ROAS. They understand infrastructure-as-code and want their ad campaigns to fit a code-first workflow.

## Goals

1. **Primary:** Communicate what ads-as-code is and why it matters — fast. Visitor should "get it" within 5 seconds of landing.
2. **Secondary:** Drive clicks to GitHub repo and Getting Started docs.
3. **Tertiary:** Establish brand credibility for future open-core positioning.

## Brand Identity

### Name

`ads-as-code` — descriptive, discoverable. The npm package is `@upspawn/ads`. The website brand is **ads-as-code**.

### Logo

Typographic only at launch. The name `ads-as-code` set in the serif headline font serves as the logo. No graphic mark.

### Typography

| Role | Font | Notes |
|------|------|-------|
| Headlines | Instrument Serif or Playfair Display | Warmth, editorial authority |
| Body | Inter or Geist | Clean, highly legible sans-serif |
| Code | Geist Mono or JetBrains Mono | Pairs with either body font |

Large size contrast: 56-72px headlines, 18px body. Typography is the primary design tool.

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#FAFAF7` | Page background (warm off-white) |
| `text` | `#1A1A1A` | Primary text (near-black) |
| `text-muted` | `#6B6B60` | Secondary text |
| `accent` | `#E8590C` | CTAs, key highlights (burnt orange) |
| `code-bg` | `#F5F4F0` | Code block background |
| `code-border` | `#E5E4E0` | Code block border |
| `diff-add` | `#16a34a` | Added lines in diff output |
| `diff-change` | `#ca8a04` | Changed lines in diff output |
| `diff-remove` | `#dc2626` | Removed lines in diff output |

Color is restrained. Almost everything is black/white/warm-gray. Burnt orange appears only on CTAs and sparse highlights. Diff colors are the only "loud" moment — intentionally draws the eye to the product's core value.

### Tone

Confident and opinionated. "This is how ads should work." No hedging, no "might help you maybe." Strong claims backed by real code examples.

## Page Structure

Seven sections in a single scroll. Each section has a clear job.

### 1. Hero

**Job:** Hook in 5 seconds. Communicate what this is and why it matters.

- **Headline:** Bold, opinionated statement (e.g., "Stop clicking. Start committing." or "Your ad campaigns deserve version control.")
- **Sub-headline:** One sentence — "Define ad campaigns in TypeScript. Preview changes. Apply with confidence."
- **CTAs:** `Get Started` (→ docs/getting-started) + `View on GitHub` (→ repo)
- **Hero visual:** A styled `ads plan` diff output showing adds/changes/removes. The product IS the hero. No abstract illustrations.

### 2. The Problem

**Job:** Create the "I feel seen" moment. Make the pain visceral.

- 2-3 short, punchy lines about why managing ads in a UI is broken:
  - No version history
  - No code review on campaign changes
  - No rollback when a change tanks performance
  - Manual drift — someone tweaks a bid in the UI and nobody knows
  - Doesn't scale past a handful of campaigns

Keep it tight. This section should be scannable in 3 seconds.

### 3. How It Works

**Job:** Show the workflow in three steps. Make it feel simple.

Three columns or stacked blocks:

1. **Define** — Show a real campaign definition (the DSL builder chain). Caption: "Campaigns are TypeScript. Type-safe, reviewable, version-controlled."
2. **Plan** — Show the `ads plan` diff output. Caption: "Preview every change before it touches your ad account."
3. **Apply** — Show the success output ("3 resources created, 1 updated"). Caption: "Apply with confidence. Rollback with git."

Each step includes a real code snippet or terminal output. No fake/simplified examples — use actual DSL syntax from the project.

### 4. Features

**Job:** Reinforce breadth of capability. Quick scannable grid.

4-6 feature blocks, each with an icon/glyph, heading, and one-liner:

| Feature | Description |
|---------|-------------|
| Type-safe campaigns | Branded types catch "headline too long" at build time, not after you've burned budget |
| Plan / Apply | Preview a diff of every change before it touches your ad account |
| Import existing campaigns | `ads import` pulls your entire Google Ads account into TypeScript |
| Drift detection | `ads pull` catches changes someone made in the UI |
| AI-powered copy | Generate and optimize ad copy with Claude — headlines, descriptions, keywords |
| Multi-provider | Google Ads today. Meta in progress. Same engine, same workflow. |

### 5. Code Example

**Job:** This is where developers fall in love. Show a real, full campaign definition.

A complete campaign definition from the example project — the full builder chain with `.group()`, `.sitelinks()`, `.callouts()`. Syntax highlighted with a warm light theme. Let it breathe — generous padding, large font. This section should feel like reading beautiful code.

### 6. CLI Reference (compact)

**Job:** Quick reference showing the CLI surface area. Makes the tool feel complete and real.

Clean grid or list of commands:

```
ads plan      Preview changes (diff code vs platform)
ads apply     Apply changes to ad platforms
ads import    Import existing campaigns as TypeScript
ads pull      Pull live state, detect drift
ads validate  Validate campaign files
ads status    Show live platform state
ads generate  AI-powered ad copy generation
ads doctor    Diagnostic checks on project setup
```

### 7. Footer CTA

**Job:** Convert. Repeat the primary actions.

- `npm install @upspawn/ads` with copy-to-clipboard
- `Get Started` + `View on GitHub` buttons (repeat from hero)
- Links: Docs, GitHub, Contributing
- Small Upspawn attribution

## Design Principles

1. **Generous whitespace.** Every section breathes. Spacing communicates confidence.
2. **Typography-driven hierarchy.** Serif headlines do the heavy lifting. Dramatic size contrast.
3. **Code as first-class visual.** Code blocks are large, beautifully styled, and central. The diff output in the hero is treated like a piece of art.
4. **Restrained color.** Nearly monochrome with burnt orange accents. Diff colors are the one loud moment.
5. **No stock illustrations.** Every visual element is functional — real code, real terminal output.
6. **Subtle motion.** Scroll-triggered fade-ins. Maybe a typewriter effect on terminal output. Nothing flashy.
7. **Purpose over decoration.** Every element earns its place by serving the conversion goal.

## Technical Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15, App Router | Standard for Vercel deployment, React ecosystem |
| Styling | Tailwind CSS v4 | Utility-first, fast iteration, good typography control |
| Rendering | Static export (`output: 'export'`) | No server needed, fast CDN delivery |
| Syntax highlighting | Shiki | Supports TypeScript + terminal, themeable, build-time |
| Hosting | Vercel | Zero-config Next.js deployment |
| Content | In-code | No CMS, no database — content lives in components |
| Font loading | `next/font` | Self-hosted, no layout shift |

### Project Structure

```
ads-as-code-website/
├── app/
│   ├── layout.tsx          Root layout (fonts, metadata)
│   ├── page.tsx            Single page, imports section components
│   └── globals.css         Tailwind base + custom properties
├── components/
│   ├── Hero.tsx
│   ├── Problem.tsx
│   ├── HowItWorks.tsx
│   ├── Features.tsx
│   ├── CodeExample.tsx
│   ├── CliReference.tsx
│   └── Footer.tsx
├── lib/
│   └── highlight.ts        Shiki setup + code snippets
├── public/
│   └── og-image.png        OpenGraph image
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

### Content Source

Code examples and terminal output are pulled from the actual `ads-as-code` example campaigns. This keeps the site honest — if the DSL changes, the site should update to match.

## Out of Scope (for now)

- Multi-page navigation (docs, blog, about)
- Dark mode toggle
- CMS or dynamic content
- Pricing page
- Authentication / sign-up flow
- Analytics (can add Vercel Analytics later)
- i18n

## Future Considerations

- When transitioning to open-core: add pricing page, sign-up flow, dashboard link
- Docs site can be separate (e.g., Nextra or Fumadocs) linked from the lander
- Blog can be added as a `/blog` route when needed
