# Website Phase 1: Navigation, Homepage, Core Feature Pages

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the single-page lander into a multi-page marketing site with persistent navigation, a gateway homepage, reusable feature page template, and 3 core feature pages (Plan/Apply, Google Ads, Meta Ads).

**Architecture:** Existing Next.js 16 static site at `~/Projects/upspawn-products/ads-as-code-website`. Refactor the homepage from a long-scroll lander into a compact gateway. Add a dropdown nav with feature links. Create a feature page template (FeatureHero, FeatureProblem, FeatureCapabilities, FeatureCTA) reused by all feature pages. Each feature page lives at `/features/<name>/page.tsx` with its content in `lib/snippets/<name>.ts`.

**Tech Stack:** Next.js 16 (App Router, static export), Tailwind CSS v4, Shiki, Fraunces + DM Sans + Space Mono

**Spec:** `docs/superpowers/specs/2026-03-15-website-full-redesign.md`

---

## File Structure

### Existing files to keep as-is
```
components/FadeIn.tsx          Scroll animation wrapper
components/CodeBlock.tsx       Shiki-highlighted code
components/CopyButton.tsx      Clipboard copy
components/DiffOutput.tsx      Animated diff output
lib/highlight.ts               Shiki setup
app/globals.css                Tailwind theme tokens
```

### Existing files to modify
```
app/layout.tsx                 Add Nav + Footer to root layout (remove from pages)
app/page.tsx                   Complete rewrite → gateway homepage
components/Nav.tsx             Rewrite → dropdown nav with features menu
components/Footer.tsx          Minor update — keep mostly same, ensure works site-wide
```

### Existing files to delete
```
components/Hero.tsx            Replaced by compact homepage hero
components/Problem.tsx         Moved to feature pages
components/HowItWorks.tsx      Moved to feature pages
components/HowItWorksStep.tsx  No longer needed
components/Features.tsx        Replaced by feature grid
components/CodeExample.tsx     Moved to feature pages
components/CliReference.tsx    Moved to feature pages
```

### New files to create
```
components/MobileNav.tsx           Hamburger menu for mobile
components/FeatureHero.tsx         Reusable hero for feature pages
components/FeatureProblem.tsx      Reusable "the problem" block
components/FeatureHow.tsx          Reusable "how it works" code blocks
components/FeatureCapabilities.tsx Reusable capabilities grid
components/FeatureCTA.tsx          Reusable CTA strip at bottom
components/HomeFeatureCard.tsx     Homepage feature grid card
components/HomeHero.tsx            Compact homepage hero
components/StatsStrip.tsx          Stats bar (providers, helpers, commands)

lib/snippets/homepage.ts          Homepage content (diff for hero)
lib/snippets/plan-apply.ts        Plan/Apply feature page content
lib/snippets/google-ads.ts        Google Ads feature page content
lib/snippets/meta-ads.ts          Meta Ads feature page content

app/features/plan-apply/page.tsx       Feature page
app/features/google-ads/page.tsx       Feature page
app/features/meta-ads/page.tsx         Feature page
```

---

## Chunk 1: Navigation & Layout

### Task 1: Rewrite Nav with features dropdown

**Files:**
- Rewrite: `components/Nav.tsx`
- Create: `components/MobileNav.tsx`

- [ ] **Step 1: Rewrite Nav.tsx with dropdown**

Replace `components/Nav.tsx` with a nav that has: logo (left), Features dropdown + Docs link + GitHub link + Get Started CTA (right). The Features dropdown shows all 9 feature pages grouped into Core, Providers, AI, Platform.

```tsx
"use client";

import { useState } from "react";
import { MobileNav } from "./MobileNav";

const featureGroups = [
  {
    label: "Core",
    items: [
      { name: "Plan / Apply", href: "/features/plan-apply" },
      { name: "Import", href: "/features/import" },
    ],
  },
  {
    label: "Providers",
    items: [
      { name: "Google Ads", href: "/features/google-ads" },
      { name: "Meta Ads", href: "/features/meta-ads" },
      { name: "Creatives", href: "/features/creatives" },
    ],
  },
  {
    label: "AI",
    items: [
      { name: "Copy Generation", href: "/features/ai-generation" },
      { name: "Campaign Variants", href: "/features/ai-variants" },
    ],
  },
  {
    label: "Platform",
    items: [
      { name: "Pipelines", href: "/features/pipelines" },
      { name: "Developer Experience", href: "/features/developer-experience" },
    ],
  },
];

export { featureGroups };

export function Nav() {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto relative">
      <a href="/" className="font-heading text-xl font-bold tracking-tight">
        ads-as-code
      </a>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-6">
        <div
          className="relative"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <button className="text-text-muted hover:text-text transition-colors text-sm font-medium">
            Features
          </button>
          {dropdownOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
              <div className="bg-white border border-code-border rounded-xl shadow-lg p-4 grid grid-cols-2 gap-x-8 gap-y-1 min-w-[360px]">
                {featureGroups.map((group) => (
                  <div key={group.label} className="mb-3">
                    <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="block text-sm py-1 text-text hover:text-accent transition-colors"
                      >
                        {item.name}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <a
          href="/docs"
          className="text-text-muted hover:text-text transition-colors text-sm font-medium"
        >
          Docs
        </a>
        <a
          href="https://github.com/upspawn/ads-as-code"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-text transition-colors text-sm font-medium"
        >
          GitHub
        </a>
        <a
          href="/docs/getting-started"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Get Started
        </a>
      </div>

      {/* Mobile hamburger */}
      <MobileNav />
    </nav>
  );
}
```

- [ ] **Step 2: Create MobileNav.tsx**

Create `components/MobileNav.tsx`:

```tsx
"use client";

import { useState } from "react";
import { featureGroups } from "./Nav";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="text-text p-2"
        aria-label="Toggle menu"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <path d="M3 12h18M3 6h18M3 18h18" />
          )}
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 bg-bg border-b border-code-border px-6 py-4 z-50">
          <div className="space-y-4">
            {featureGroups.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block text-sm py-1.5 text-text"
                    onClick={() => setOpen(false)}
                  >
                    {item.name}
                  </a>
                ))}
              </div>
            ))}
            <div className="border-t border-code-border pt-3 space-y-2">
              <a href="/docs" className="block text-sm text-text">Docs</a>
              <a href="https://github.com/upspawn/ads-as-code" target="_blank" rel="noopener noreferrer" className="block text-sm text-text">GitHub</a>
              <a href="/docs/getting-started" className="inline-block bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium mt-2">Get Started</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Move Nav and Footer into root layout**

Update `app/layout.tsx` to include Nav and Footer so they appear on all pages:

```tsx
import type { Metadata } from "next";
import { DM_Sans, Fraunces, Space_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "ads-as-code — Infrastructure as code for ad campaigns",
  description:
    "Define ad campaigns in TypeScript. Preview changes with plan. Apply with confidence. Open-source SDK for Google Ads and Meta.",
  openGraph: {
    title: "ads-as-code — Infrastructure as code for ad campaigns",
    description:
      "Define ad campaigns in TypeScript. Preview changes with plan. Apply with confidence.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ads-as-code — Infrastructure as code for ad campaigns",
    description:
      "Define ad campaigns in TypeScript. Preview changes with plan. Apply with confidence.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${spaceMono.variable}`}
    >
      <body className="bg-bg text-text font-body antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Update Footer to remove duplicate Nav/CTA from old lander**

Read current `components/Footer.tsx` and update: remove the `<Nav />` reference if any, ensure footer works standalone (it already should — just verify it doesn't import Nav). The footer should keep its install command, Get Started/GitHub buttons, and links row.

- [ ] **Step 5: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/Nav.tsx components/MobileNav.tsx app/layout.tsx
git commit -m "feat: add dropdown nav with features menu and mobile hamburger"
```

---

### Task 2: Create homepage components

**Files:**
- Create: `components/HomeHero.tsx`
- Create: `components/HomeFeatureCard.tsx`
- Create: `components/StatsStrip.tsx`
- Create: `lib/snippets/homepage.ts`
- Delete: `lib/snippets.ts` (replaced by per-page files)

- [ ] **Step 1: Create lib/snippets/homepage.ts**

Move only the `heroDiff` and `cliCommands` from the old `lib/snippets.ts` into `lib/snippets/homepage.ts`. The hero diff stays on the homepage. CLI commands are no longer on the homepage but keep them in this file for now.

```typescript
// Homepage content

export const heroDiff = `$ ads plan

+ campaign/brand-search                    create
+ campaign/brand-search/core-keywords      create
+ campaign/brand-search/core-keywords/rsa  create
~ campaign/retarget/budget                 $15 → $25/day
~ campaign/retarget/broad/rsa             +2 headlines
- campaign/old-summer-promo                delete

  5 to create, 2 to update, 1 to delete.
  Run ads apply to execute.`;

export const featureCards = [
  // Core
  { title: "Plan / Apply", description: "Preview every change before it goes live. Rollback with git.", href: "/features/plan-apply", group: "Core" },
  { title: "Import", description: "Pull existing campaigns into TypeScript. Zero rewrite.", href: "/features/import", group: "Core" },
  // Providers
  { title: "Google Ads", description: "Search campaigns without the gRPC nightmares.", href: "/features/google-ads", group: "Providers" },
  { title: "Meta Ads", description: "Facebook and Instagram campaigns that live in git.", href: "/features/meta-ads", group: "Providers" },
  { title: "Creatives", description: "Images, videos, and carousels — versioned and deployed.", href: "/features/creatives", group: "Creatives" },
  // AI
  { title: "AI Copy Generation", description: "Headlines, descriptions, keywords — generated in seconds.", href: "/features/ai-generation", group: "AI" },
  { title: "AI Variants", description: "One campaign, every market. Translations and ICP expansion.", href: "/features/ai-variants", group: "AI" },
  // Platform
  { title: "Pipelines", description: "CI/CD for ads. Deploy on merge. Test in staging.", href: "/features/pipelines", group: "Platform" },
  { title: "Developer Experience", description: "Your AI already knows TypeScript.", href: "/features/developer-experience", group: "Platform" },
] as const;

export const stats = [
  { value: "2", label: "Providers" },
  { value: "50+", label: "Helpers" },
  { value: "15", label: "CLI Commands" },
  { value: "100%", label: "Type-Safe" },
] as const;
```

- [ ] **Step 2: Create HomeHero.tsx**

Compact hero — headline, sub, CTAs, small diff. Takes up less vertical space than the old hero.

```tsx
import { FadeIn } from "./FadeIn";
import { DiffOutput } from "./DiffOutput";
import { heroDiff } from "@/lib/snippets/homepage";

export function HomeHero() {
  return (
    <section className="px-6 md:px-12 pt-12 md:pt-20 pb-16 md:pb-24 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <FadeIn>
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
            Stop clicking.
            <br />
            Start committing.
          </h1>
          <p className="text-text-muted text-lg md:text-xl max-w-lg mb-8 leading-relaxed">
            Define ad campaigns in TypeScript. Preview changes with{" "}
            <code className="font-mono text-text bg-code-bg px-1.5 py-0.5 rounded text-base">plan</code>.
            Apply with confidence.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/docs/getting-started" className="bg-accent text-white px-5 py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors">
              Get Started
            </a>
            <a href="https://github.com/upspawn/ads-as-code" target="_blank" rel="noopener noreferrer" className="border border-code-border text-text px-5 py-2.5 rounded-lg font-medium hover:border-text-muted transition-colors">
              View on GitHub
            </a>
          </div>
        </FadeIn>
        <FadeIn delay={150}>
          <DiffOutput content={heroDiff} />
        </FadeIn>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create HomeFeatureCard.tsx**

```tsx
import { FadeIn } from "./FadeIn";

export function HomeFeatureCard({
  title,
  description,
  href,
  delay = 0,
}: {
  title: string;
  description: string;
  href: string;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <a
        href={href}
        className="block p-6 rounded-xl border border-code-border hover:border-accent/30 hover:shadow-sm transition-all group"
      >
        <h3 className="font-heading text-lg font-bold mb-1 group-hover:text-accent transition-colors">
          {title}
        </h3>
        <p className="text-text-muted text-sm leading-relaxed">{description}</p>
      </a>
    </FadeIn>
  );
}
```

- [ ] **Step 4: Create StatsStrip.tsx**

```tsx
import { stats } from "@/lib/snippets/homepage";

export function StatsStrip() {
  return (
    <section className="px-6 md:px-12 py-12 max-w-6xl mx-auto border-y border-code-border">
      <div className="flex flex-wrap justify-center gap-8 md:gap-16">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="font-heading text-3xl font-bold">{stat.value}</div>
            <div className="text-text-muted text-sm">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Delete old snippets.ts**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
rm lib/snippets.ts
```

- [ ] **Step 6: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Note: Build will fail because old components still import from `@/lib/snippets`. That's expected — we'll fix it in the next task.

- [ ] **Step 7: Commit new files only (old page will be rewritten next)**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/HomeHero.tsx components/HomeFeatureCard.tsx components/StatsStrip.tsx lib/snippets/homepage.ts
git commit -m "feat: add homepage components (HomeHero, FeatureCard, StatsStrip)"
```

---

### Task 3: Rewrite homepage and clean up old components

**Files:**
- Rewrite: `app/page.tsx`
- Delete: old single-page components (Hero, Problem, HowItWorks, etc.)

- [ ] **Step 1: Rewrite app/page.tsx**

The homepage is now a gateway: compact hero, feature grid, stats strip. Nav and Footer come from the layout.

```tsx
import { HomeHero } from "@/components/HomeHero";
import { HomeFeatureCard } from "@/components/HomeFeatureCard";
import { StatsStrip } from "@/components/StatsStrip";
import { FadeIn } from "@/components/FadeIn";
import { featureCards } from "@/lib/snippets/homepage";

export default function Home() {
  return (
    <>
      <HomeHero />
      <StatsStrip />
      <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto">
        <FadeIn>
          <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-12 text-center">
            Everything ads should be.
          </h2>
        </FadeIn>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featureCards.map((card, i) => (
            <HomeFeatureCard
              key={card.href}
              title={card.title}
              description={card.description}
              href={card.href}
              delay={i * 40}
            />
          ))}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Delete old single-page components**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
rm components/Hero.tsx components/Problem.tsx components/HowItWorks.tsx components/HowItWorksStep.tsx components/Features.tsx components/FeatureCard.tsx components/CodeExample.tsx components/CliReference.tsx
```

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds. Homepage renders with compact hero + feature grid + stats strip.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add -A
git commit -m "feat: rewrite homepage as gateway with feature grid, remove old lander components"
```

---

## Chunk 2: Feature Page Template

### Task 4: Create reusable feature page components

**Files:**
- Create: `components/FeatureHero.tsx`
- Create: `components/FeatureProblem.tsx`
- Create: `components/FeatureHow.tsx`
- Create: `components/FeatureCapabilities.tsx`
- Create: `components/FeatureCTA.tsx`

- [ ] **Step 1: Create FeatureHero.tsx**

```tsx
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";
import type { BundledLanguage } from "shiki";

export function FeatureHero({
  title,
  subtitle,
  code,
  lang = "typescript",
}: {
  title: string;
  subtitle: string;
  code: string;
  lang?: BundledLanguage;
}) {
  return (
    <section className="px-6 md:px-12 pt-12 md:pt-20 pb-16 md:pb-24 max-w-6xl mx-auto">
      <FadeIn>
        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-4">
          {title}
        </h1>
        <p className="text-text-muted text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          {subtitle}
        </p>
      </FadeIn>
      <FadeIn delay={150}>
        <CodeBlock code={code} lang={lang} />
      </FadeIn>
    </section>
  );
}
```

- [ ] **Step 2: Create FeatureProblem.tsx**

```tsx
import { FadeIn } from "./FadeIn";

export function FeatureProblem({
  lines,
}: {
  lines: string[];
}) {
  return (
    <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto border-t border-code-border">
      <div className="max-w-2xl space-y-3">
        {lines.map((line, i) => (
          <FadeIn key={i} delay={i * 60}>
            <p className="text-text-muted text-lg md:text-xl leading-relaxed">{line}</p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create FeatureHow.tsx**

A section that shows 1-3 code blocks with captions, each in sequence.

```tsx
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";
import type { BundledLanguage } from "shiki";

type Step = {
  title: string;
  caption: string;
  code: string;
  lang?: BundledLanguage;
};

export function FeatureHow({
  heading,
  steps,
}: {
  heading: string;
  steps: Step[];
}) {
  return (
    <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-14">
          {heading}
        </h2>
      </FadeIn>
      <div className="grid gap-14">
        {steps.map((step, i) => (
          <FadeIn key={i} delay={i * 100}>
            <div className="space-y-3">
              <h3 className="font-heading text-xl font-bold">{step.title}</h3>
              <p className="text-text-muted text-base leading-relaxed max-w-2xl">{step.caption}</p>
              <CodeBlock code={step.code} lang={step.lang} />
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create FeatureCapabilities.tsx**

```tsx
import { FadeIn } from "./FadeIn";

type Capability = {
  title: string;
  description: string;
};

export function FeatureCapabilities({
  heading,
  items,
}: {
  heading?: string;
  items: Capability[];
}) {
  return (
    <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto border-t border-code-border">
      {heading && (
        <FadeIn>
          <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-12">
            {heading}
          </h2>
        </FadeIn>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {items.map((item, i) => (
          <FadeIn key={i} delay={i * 50}>
            <div>
              <h3 className="font-heading text-lg font-bold mb-1">{item.title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{item.description}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create FeatureCTA.tsx**

```tsx
import { FadeIn } from "./FadeIn";

export function FeatureCTA({
  docsHref = "/docs/getting-started",
  docsLabel = "Get Started",
}: {
  docsHref?: string;
  docsLabel?: string;
}) {
  return (
    <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <div className="flex flex-wrap gap-4">
          <a href={docsHref} className="bg-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-accent-hover transition-colors">
            {docsLabel}
          </a>
          <a href="https://github.com/upspawn/ads-as-code" target="_blank" rel="noopener noreferrer" className="border border-code-border text-text px-6 py-3 rounded-lg font-medium hover:border-text-muted transition-colors">
            View on GitHub
          </a>
        </div>
      </FadeIn>
    </section>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/FeatureHero.tsx components/FeatureProblem.tsx components/FeatureHow.tsx components/FeatureCapabilities.tsx components/FeatureCTA.tsx
git commit -m "feat: add reusable feature page template components"
```

---

## Chunk 3: Core Feature Pages

### Task 5: Create Plan/Apply feature page

**Files:**
- Create: `lib/snippets/plan-apply.ts`
- Create: `app/features/plan-apply/page.tsx`

- [ ] **Step 1: Create lib/snippets/plan-apply.ts**

Content for the Plan/Apply feature page — uses fictional "Arcflow" product:

```typescript
export const heroCode = `$ ads plan

+ campaign/brand-arcflow                    create
+ campaign/brand-arcflow/core-keywords      create
+ campaign/brand-arcflow/core-keywords/rsa  create
~ campaign/retarget/budget                  $15 → $25/day
~ campaign/retarget/broad/rsa              +2 headlines
- campaign/old-summer-promo                 delete

  5 to create, 2 to update, 1 to delete.
  Run ads apply to execute.`;

export const problemLines = [
  "You can't preview ad changes before they go live.",
  "There's no code review on campaign modifications.",
  "Rolling back a bad change means manually undoing it in the UI.",
  "Someone tweaks a bid at 2am — nobody knows until ROAS drops.",
];

export const howSteps = [
  {
    title: "Plan",
    caption: "See exactly what will change before anything touches your ad account. Every create, update, and delete — in a diff you can review.",
    code: `$ ads plan

+ campaign/brand-arcflow                         create
+ campaign/brand-arcflow/core-keywords            create
+ campaign/brand-arcflow/core-keywords/kw:...     create (4 keywords)
+ campaign/brand-arcflow/core-keywords/rsa        create

  4 to create. Run ads apply to execute.`,
    lang: "shellscript" as const,
  },
  {
    title: "Apply",
    caption: "Execute mutations in dependency order — campaign first, then ad groups, then keywords and ads. Stops on first failure to prevent orphans.",
    code: `$ ads apply

✓ Created campaign/brand-arcflow
✓ Created campaign/brand-arcflow/core-keywords
✓ Created 4 keywords
✓ Created RSA ad

  4 resources created. 0 updated. 0 deleted.`,
    lang: "shellscript" as const,
  },
  {
    title: "Pull",
    caption: "Detect drift — changes someone made in the Google Ads UI that aren't reflected in your code. Know before it costs you.",
    code: `$ ads pull

~ campaign/retarget/budget    $25/day → $40/day  (drift!)
~ campaign/retarget/broad/rsa  headline changed   (drift!)

  2 resources drifted. Review and update your code.`,
    lang: "shellscript" as const,
  },
];

export const capabilities = [
  { title: "Preview before apply", description: "Every change is a diff you can review in a PR before it touches your ad account." },
  { title: "Dependency-ordered execution", description: "Creates go parent-first. Deletes go child-first. No orphaned resources." },
  { title: "Atomic rollback", description: "Every apply is a git commit. Rolling back is git revert." },
  { title: "Drift detection", description: "ads pull compares live state against your code and flags discrepancies." },
  { title: "Operation history", description: "Every apply is logged with timestamp, changeset, and result in SQLite." },
  { title: "Dry run mode", description: "ads apply --dry-run shows what would happen without touching the API." },
];
```

- [ ] **Step 2: Create app/features/plan-apply/page.tsx**

```tsx
import type { Metadata } from "next";
import { FeatureHero } from "@/components/FeatureHero";
import { FeatureProblem } from "@/components/FeatureProblem";
import { FeatureHow } from "@/components/FeatureHow";
import { FeatureCapabilities } from "@/components/FeatureCapabilities";
import { FeatureCTA } from "@/components/FeatureCTA";
import { heroCode, problemLines, howSteps, capabilities } from "@/lib/snippets/plan-apply";

export const metadata: Metadata = {
  title: "Plan / Apply — ads-as-code",
  description: "Preview every ad change before it goes live. Apply with confidence. Detect drift.",
};

export default function PlanApplyPage() {
  return (
    <>
      <FeatureHero
        title="Preview every change before it goes live."
        subtitle="Plan shows the diff. Apply executes it. Pull catches drift. Your ad account finally has a deployment pipeline."
        code={heroCode}
        lang="shellscript"
      />
      <FeatureProblem lines={problemLines} />
      <FeatureHow heading="How it works" steps={howSteps} />
      <FeatureCapabilities heading="Capabilities" items={capabilities} />
      <FeatureCTA />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add lib/snippets/plan-apply.ts app/features/plan-apply/page.tsx
git commit -m "feat: add Plan/Apply feature page"
```

---

### Task 6: Create Google Ads feature page

**Files:**
- Create: `lib/snippets/google-ads.ts`
- Create: `app/features/google-ads/page.tsx`

- [ ] **Step 1: Create lib/snippets/google-ads.ts**

```typescript
export const heroCode = `import { google, daily, exact, broad,
  headlines, descriptions, rsa, url } from '@upspawn/ads'

export default google.search('Brand - Arcflow', {
  budget: daily(20),
  bidding: 'maximize-clicks',
})
  .group('core-keywords', {
    keywords: [
      ...exact('workflow automation', 'ai automation tool'),
      ...broad('automate business workflows'),
    ],
    ad: rsa(
      headlines(
        'Automate Any Workflow in Minutes',
        'AI-Powered. No Code Needed.',
        'Free 14-Day Trial — Start Now',
      ),
      descriptions(
        'Connect 200+ apps. Build workflows visually.',
        'Teams save 12 hrs/week on average.',
      ),
      url('https://arcflow.dev'),
    ),
  })`;

export const problemLines = [
  "The Google Ads API is a maze of numeric enums, snake_case fields, and budget-as-separate-resource patterns.",
  "TARGET_SPEND means Maximize Clicks. Status 2 means ENABLED. Nobody should have to memorize this.",
  "The SDK handles all of it. You write TypeScript.",
];

export const howSteps = [
  {
    title: "Campaigns and ad groups",
    caption: "Chain .group() calls to define ad groups with keywords and ads. Each group gets its own targeting and copy.",
    code: `google.search('Search - Workflow Automation', {
  budget: daily(25),
  bidding: { type: 'target-cpa', targetCpa: 18 },
})
  .group('automation-en', {
    keywords: [
      ...exact('workflow automation tool'),
      ...broad('ai automation platform'),
    ],
    ad: rsa(
      headlines('Automate Any Workflow', 'AI-Powered', 'Free Trial'),
      descriptions('Connect 200+ apps. Ship workflows in minutes.'),
      url('https://arcflow.dev'),
    ),
  })
  .group('automation-de', {
    keywords: [...exact('workflow automatisierung')],
    ad: rsa(
      headlines('Workflows automatisieren', 'KI verbindet Ihre Tools'),
      descriptions('Teams sparen 12 Std/Woche. In Minuten live.'),
      url('https://arcflow.dev/de'),
    ),
  })`,
  },
  {
    title: "Extensions",
    caption: "Sitelinks and callouts attach to the campaign. Branded types validate lengths at compile time.",
    code: `  .sitelinks(
    link('See Pricing', 'https://arcflow.dev/pricing', {
      description1: 'Free for small teams',
      description2: 'Pro from $29/month',
    }),
    link('Integrations', 'https://arcflow.dev/integrations'),
    link('Templates', 'https://arcflow.dev/templates'),
  )
  .callouts('No Credit Card', 'SOC 2 Certified', '99.9% Uptime')`,
  },
];

export const capabilities = [
  { title: "Type-safe builders", description: "google.search() returns a typed builder. Every method is autocomplete-friendly." },
  { title: "Branded types", description: "Headlines (≤30 chars), descriptions (≤90 chars) — validated at construction time, not at API call time." },
  { title: "Budget helpers", description: "daily(20), monthly(500), eur(15) — no more thinking in micros." },
  { title: "Keyword match types", description: "exact(), phrase(), broad() — expressive and type-safe." },
  { title: "Bidding strategies", description: "maximize-clicks, target-cpa, target-roas, manual-cpc — all supported." },
  { title: "Extensions", description: "Sitelinks, callouts — with full description support." },
];
```

- [ ] **Step 2: Create app/features/google-ads/page.tsx**

```tsx
import type { Metadata } from "next";
import { FeatureHero } from "@/components/FeatureHero";
import { FeatureProblem } from "@/components/FeatureProblem";
import { FeatureHow } from "@/components/FeatureHow";
import { FeatureCapabilities } from "@/components/FeatureCapabilities";
import { FeatureCTA } from "@/components/FeatureCTA";
import { heroCode, problemLines, howSteps, capabilities } from "@/lib/snippets/google-ads";

export const metadata: Metadata = {
  title: "Google Ads — ads-as-code",
  description: "Google Search campaigns without the gRPC nightmares. Type-safe, diffable, reviewable.",
};

export default function GoogleAdsPage() {
  return (
    <>
      <FeatureHero
        title="Google Ads without the gRPC nightmares."
        subtitle="Search campaigns defined in TypeScript. Branded types, budget helpers, and sitelinks — all type-safe."
        code={heroCode}
      />
      <FeatureProblem lines={problemLines} />
      <FeatureHow heading="Build campaigns in TypeScript" steps={howSteps} />
      <FeatureCapabilities heading="What you get" items={capabilities} />
      <FeatureCTA />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add lib/snippets/google-ads.ts app/features/google-ads/page.tsx
git commit -m "feat: add Google Ads feature page"
```

---

### Task 7: Create Meta Ads feature page

**Files:**
- Create: `lib/snippets/meta-ads.ts`
- Create: `app/features/meta-ads/page.tsx`

- [ ] **Step 1: Create lib/snippets/meta-ads.ts**

```typescript
export const heroCode = `import { meta, daily, image, interests,
  audience, lookalike } from '@upspawn/ads'

export default meta.traffic('Brand - Arcflow', {
  budget: daily(30),
  status: 'active',
})
  .adSet('professionals-25-45', {
    targeting: {
      age: { min: 25, max: 45 },
      interests: interests('SaaS', 'Business automation', 'Productivity'),
      audiences: [audience('website-visitors-30d')],
    },
    placements: ['facebook-feed', 'instagram-feed', 'instagram-stories'],
    optimization: 'LINK_CLICKS',
    ad: {
      creative: image('./creatives/hero-banner.jpg'),
      headline: 'Automate Any Workflow',
      primaryText: 'Connect 200+ apps. No code needed.',
      cta: 'LEARN_MORE',
      url: 'https://arcflow.dev',
    },
  })`;

export const problemLines = [
  "Meta's API changes every quarter. Their Business Suite UI is a labyrinth.",
  "Managing campaigns across Facebook, Instagram, Stories, and Reels is fragmented and manual.",
  "The SDK gives you type-safe builders for every objective, placement, and targeting option.",
];

export const howSteps = [
  {
    title: "Objective-typed campaigns",
    caption: "meta.traffic(), meta.conversions(), meta.leads() — each returns a builder constrained to valid optimization goals for that objective.",
    code: `// Traffic campaigns optimize for clicks or landing page views
meta.traffic('Top of Funnel', { budget: daily(50) })

// Conversion campaigns optimize for purchases or add-to-cart
meta.conversions('Retargeting', { budget: daily(25) })

// Lead campaigns optimize for form submissions
meta.leads('Webinar Signup', { budget: daily(15) })`,
  },
  {
    title: "Rich targeting",
    caption: "Interests, custom audiences, lookalikes, demographics — all composable and type-safe.",
    code: `  .adSet('lookalike-purchasers', {
    targeting: {
      age: { min: 25, max: 55 },
      interests: interests('Project management', 'Workflow automation'),
      audiences: [lookalike('purchasers-180d', { percent: 2 })],
      excluded: [audience('existing-customers')],
    },
    placements: ['facebook-feed', 'instagram-feed', 'instagram-reels'],
    optimization: 'LANDING_PAGE_VIEWS',
  })`,
  },
];

export const capabilities = [
  { title: "7 objective types", description: "Traffic, conversions, leads, awareness, engagement, sales, app promotion — each with typed optimization goals." },
  { title: "Interest & behavior targeting", description: "Search interests with ads search, then use them in type-safe targeting configs." },
  { title: "Lookalike audiences", description: "lookalike('source-audience', { percent: 2 }) — built from custom audiences." },
  { title: "Audience exclusions", description: "Exclude existing customers, recent purchasers, or any custom audience." },
  { title: "Placement control", description: "Facebook feed, Instagram stories, Reels — specify exactly where ads appear." },
  { title: "Advantage+ support", description: "Opt into Meta's automated targeting and placements when you want the algorithm to decide." },
];
```

- [ ] **Step 2: Create app/features/meta-ads/page.tsx**

```tsx
import type { Metadata } from "next";
import { FeatureHero } from "@/components/FeatureHero";
import { FeatureProblem } from "@/components/FeatureProblem";
import { FeatureHow } from "@/components/FeatureHow";
import { FeatureCapabilities } from "@/components/FeatureCapabilities";
import { FeatureCTA } from "@/components/FeatureCTA";
import { heroCode, problemLines, howSteps, capabilities } from "@/lib/snippets/meta-ads";

export const metadata: Metadata = {
  title: "Meta Ads — ads-as-code",
  description: "Facebook and Instagram campaigns that live in git. Type-safe objectives, targeting, and placements.",
};

export default function MetaAdsPage() {
  return (
    <>
      <FeatureHero
        title="Meta Ads. Finally manageable."
        subtitle="Facebook and Instagram campaigns defined in TypeScript. 7 objectives, rich targeting, full placement control."
        code={heroCode}
      />
      <FeatureProblem lines={problemLines} />
      <FeatureHow heading="How Meta campaigns work" steps={howSteps} />
      <FeatureCapabilities heading="What you get" items={capabilities} />
      <FeatureCTA />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds with homepage + 3 feature pages statically generated.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add lib/snippets/meta-ads.ts app/features/meta-ads/page.tsx
git commit -m "feat: add Meta Ads feature page"
```

---

### Task 8: Push and deploy

- [ ] **Step 1: Verify full build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected output should show 5 static routes: `/`, `/features/plan-apply`, `/features/google-ads`, `/features/meta-ads`, `/_not-found`

- [ ] **Step 2: Push to deploy**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git push
```

Vercel auto-deploys on push to main.

- [ ] **Step 3: Verify deployed site**

Open `https://ads-as-code-website.vercel.app`. Check:
- Nav with Features dropdown works
- Homepage shows compact hero + feature grid + stats
- Each feature page renders (click through from grid)
- Mobile hamburger menu works
- All code blocks syntax-highlighted
