# ads-as-code Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page marketing lander for the open-source ads-as-code project, deployed on Vercel.

**Architecture:** Next.js 15 static site with Tailwind CSS v4. Seven section components composed into a single page. Shiki for build-time syntax highlighting. Fraunces + DM Sans + Space Mono typography. Warm minimal design with burnt orange accent.

**Tech Stack:** Next.js 15 (App Router, static export), Tailwind CSS v4, Shiki, next/font (Google), Vercel

**Spec:** `docs/superpowers/specs/2026-03-15-website-landing-page-design.md`

---

## File Structure

```
~/Projects/upspawn-products/ads-as-code-website/
├── app/
│   ├── layout.tsx            Root layout — fonts (Fraunces, DM Sans, Space Mono), metadata, SEO
│   ├── page.tsx              Single page — imports and composes all section components
│   └── globals.css           Tailwind v4 @import, @theme with color tokens, base styles
├── components/
│   ├── Nav.tsx               Minimal top bar — logo wordmark + GitHub link
│   ├── Hero.tsx              Headline, sub-headline, CTAs, animated diff output
│   ├── Problem.tsx           Pain points — short punchy lines
│   ├── HowItWorks.tsx        Define → Plan → Apply, three-step with code
│   ├── HowItWorksStep.tsx    Single step card (reused 3x by HowItWorks)
│   ├── Features.tsx          6 feature blocks in a grid
│   ├── FeatureCard.tsx       Single feature block (reused 6x by Features)
│   ├── CodeExample.tsx       Full campaign definition, syntax highlighted
│   ├── CliReference.tsx      Command grid
│   ├── Footer.tsx            CTA repeat, install command, links
│   ├── DiffOutput.tsx        Styled terminal diff with typewriter animation
│   ├── CodeBlock.tsx         Reusable Shiki-highlighted code block
│   ├── CopyButton.tsx        Copy-to-clipboard button (for install command)
│   └── FadeIn.tsx            Intersection Observer scroll animation wrapper
├── lib/
│   ├── highlight.ts          Shiki highlighter setup (singleton, warm theme)
│   └── snippets.ts           All code/terminal content strings in one place
├── public/
│   └── og-image.png          OpenGraph image (1200x630)
├── next.config.ts            Static export config
├── tsconfig.json
└── package.json
```

**Key decisions:**
- `lib/snippets.ts` centralizes all code content — each snippet has a comment noting its source file in `ads-as-code`
- `DiffOutput` is separated from `Hero` because it has its own animation logic
- `CodeBlock` is reused by `HowItWorks` and `CodeExample` — avoids duplicating Shiki setup
- `FadeIn` wraps any section for scroll-triggered opacity+translate animation
- `Nav` is minimal — just the wordmark and a GitHub icon link. No hamburger menu needed for a single page.

---

## Chunk 1: Project Foundation

### Task 1: Scaffold Next.js project

**Files:**
- Create: `~/Projects/upspawn-products/ads-as-code-website/package.json`
- Create: `~/Projects/upspawn-products/ads-as-code-website/next.config.ts`
- Create: `~/Projects/upspawn-products/ads-as-code-website/tsconfig.json`

- [ ] **Step 1: Create the project directory**

```bash
mkdir -p ~/Projects/upspawn-products/ads-as-code-website
cd ~/Projects/upspawn-products/ads-as-code-website
```

- [ ] **Step 2: Initialize Next.js 15 with Tailwind v4**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bunx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --yes
```

This scaffolds the project with App Router, TypeScript, Tailwind CSS, and ESLint.

- [ ] **Step 3: Install additional dependencies**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun add shiki
```

- [ ] **Step 4: Configure static export in next.config.ts**

Replace the contents of `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 5: Initialize git repo and clean up scaffolding**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git init
echo ".superpowers/" >> .gitignore
```

`create-next-app` already generates a comprehensive `.gitignore` — just append `.superpowers/`.

Remove default scaffold assets that we'll replace:

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
rm -f app/favicon.ico public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

- [ ] **Step 6: Verify build works**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds, `out/` directory created with static files.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add -A
git commit -m "chore: scaffold Next.js 15 project with Tailwind v4 and Shiki"
```

---

### Task 2: Set up fonts, metadata, and global styles

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Configure fonts and metadata in layout.tsx**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { DM_Sans, Fraunces, Space_Mono } from "next/font/google";
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
      <body className="bg-bg text-text font-body antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Set up global styles with Tailwind v4 theme**

Replace `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --font-heading: var(--font-fraunces), serif;
  --font-body: var(--font-dm-sans), sans-serif;
  --font-mono: var(--font-space-mono), monospace;

  --color-bg: #FAFAF7;
  --color-text: #1A1A1A;
  --color-text-muted: #6B6B60;
  --color-accent: #E8590C;
  --color-accent-hover: #D4520A;
  --color-code-bg: #F5F4F0;
  --color-code-border: #E5E4E0;
  --color-diff-add: #16a34a;
  --color-diff-change: #ca8a04;
  --color-diff-remove: #dc2626;
}

body {
  font-family: var(--font-body);
}

h1, h2, h3 {
  font-family: var(--font-heading);
}

code, pre {
  font-family: var(--font-mono);
}
```

- [ ] **Step 3: Clear the default page**

Replace `app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main>
      <h1 className="font-heading text-6xl font-bold p-20">ads-as-code</h1>
    </main>
  );
}
```

- [ ] **Step 4: Verify fonts render correctly**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run dev
```

Open `http://localhost:3000` — verify Fraunces renders on the heading. Check devtools that font CSS variables are applied.

- [ ] **Step 5: Verify build still works**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add app/layout.tsx app/globals.css app/page.tsx
git commit -m "feat: configure Fraunces + DM Sans + Space Mono fonts and color theme"
```

---

### Task 3: Create shared components (FadeIn, CodeBlock, CopyButton)

**Files:**
- Create: `components/FadeIn.tsx`
- Create: `components/CodeBlock.tsx`
- Create: `components/CopyButton.tsx`
- Create: `lib/highlight.ts`

- [ ] **Step 1: Create FadeIn component**

Create `components/FadeIn.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create Shiki highlight setup**

Create `lib/highlight.ts`:

```typescript
import { type BundledLanguage, type Highlighter, createHighlighter } from "shiki";

let highlighter: Highlighter | null = null;

async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ["github-light"],
      langs: ["typescript", "shellscript"],
    });
  }
  return highlighter;
}

export async function highlight(
  code: string,
  lang: BundledLanguage = "typescript"
) {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang,
    theme: "github-light",
  });
}
```

- [ ] **Step 3: Create CodeBlock component**

`CodeBlock` is a client component that highlights code on mount. This avoids the issue of wrapping async server components inside client components (like `FadeIn`).

Create `components/CodeBlock.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { BundledLanguage } from "shiki";
import { highlight } from "@/lib/highlight";

export function CodeBlock({
  code,
  lang = "typescript",
  className = "",
}: {
  code: string;
  lang?: BundledLanguage;
  className?: string;
}) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    highlight(code, lang).then(setHtml);
  }, [code, lang]);

  return (
    <div
      className={`rounded-xl border border-code-border bg-code-bg p-5 overflow-x-auto text-sm leading-relaxed ${className}`}
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
    >
      {!html && <pre className="font-mono text-text-muted">{code}</pre>}
    </div>
  );
}
```

Note: Shows plain code as fallback while Shiki loads, then swaps in highlighted HTML.

- [ ] **Step 4: Create CopyButton component**

Create `components/CopyButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-3 text-xs font-mono text-text-muted hover:text-accent transition-colors cursor-pointer"
      aria-label="Copy to clipboard"
    >
      {copied ? "copied!" : "copy"}
    </button>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/FadeIn.tsx components/CodeBlock.tsx components/CopyButton.tsx lib/highlight.ts
git commit -m "feat: add FadeIn, CodeBlock, and CopyButton shared components"
```

---

### Task 4: Create content snippets

**Files:**
- Create: `lib/snippets.ts`

- [ ] **Step 1: Create snippets file with all code/terminal content**

Create `lib/snippets.ts`:

```typescript
/**
 * All code snippets and terminal output for the landing page.
 * Sourced from ads-as-code example campaigns.
 * Source: example/campaigns/search-pdf-renaming.ts
 */

// Hero: diff output (shown in DiffOutput component with typewriter animation)
export const heroDiff = `$ ads plan

+ campaign/brand-search                    create
+ campaign/brand-search/core-keywords      create
+ campaign/brand-search/core-keywords/rsa  create
~ campaign/retarget/budget                 $15 → $25/day
~ campaign/retarget/broad/rsa             +2 headlines
- campaign/old-summer-promo                delete

  5 to create, 2 to update, 1 to delete.
  Run ads apply to execute.`;

// How It Works — Step 1: Define
export const defineSnippet = `import { google, daily, exact, broad,
  headlines, descriptions, rsa, url } from '@upspawn/ads'

export default google.search('Brand - PDF Renamer', {
  budget: daily(15),
  bidding: 'maximize-clicks',
})
  .group('core-keywords', {
    keywords: [
      ...exact('pdf renamer', 'rename pdf files'),
      ...broad('ai pdf rename'),
    ],
    ad: rsa(
      headlines(
        'AI PDF Renamer — Try Free',
        '50 Free Renames to Start',
        'Rename 1000 PDFs in Minutes',
      ),
      descriptions(
        'Upload PDFs. AI reads content, renames every file.',
        '95% accuracy on invoices. No install needed.',
      ),
      url('https://example.com/pdf-renamer'),
    ),
  })`;

// How It Works — Step 2: Plan (terminal output)
export const planSnippet = `$ ads plan

+ campaign/brand-pdf-renamer                         create
+ campaign/brand-pdf-renamer/core-keywords            create
+ campaign/brand-pdf-renamer/core-keywords/kw:...     create (4 keywords)
+ campaign/brand-pdf-renamer/core-keywords/rsa        create

  4 to create. Run ads apply to execute.`;

// How It Works — Step 3: Apply (terminal output)
export const applySnippet = `$ ads apply

✓ Created campaign/brand-pdf-renamer
✓ Created campaign/brand-pdf-renamer/core-keywords
✓ Created 4 keywords
✓ Created RSA ad

  4 resources created. 0 updated. 0 deleted.`;

// Code Example — full campaign (simplified from search-pdf-renaming.ts)
export const fullCampaignSnippet = `import {
  google, daily, exact, broad, phrase,
  headlines, descriptions, rsa, url,
  link,
} from '@upspawn/ads'

export default google.search('Search - PDF Renaming', {
  budget: daily(1.5),
  bidding: 'maximize-clicks',
  negatives: [
    ...broad('free', 'convert', 'tutorial', 'open source'),
    ...phrase('document management system', 'pdf compressor'),
  ],
})
  .group('pdf-renamer-de', {
    keywords: [
      ...exact('pdf automatisch umbenennen'),
      ...broad('pdf umbenennen'),
    ],
    ad: rsa(
      headlines(
        'PDF automatisch umbenennen',
        'KI liest Inhalte & benennt um',
        '50 kostenlose Umbenennungen',
        '95% Genauigkeit. Gratis Test',
        'Made in Germany. DSGVO-konform',
      ),
      descriptions(
        '95% Genauigkeit bei Rechnungen. 50 kostenlose Umbenennungen.',
        'PDFs hochladen. KI erkennt Daten, Betraege, Firmen.',
      ),
      url('https://www.renamed.to/de/pdf-renamer'),
    ),
  })
  .group('pdf-renamer-en', {
    keywords: [
      ...exact('auto rename pdf files', 'pdf file renamer'),
      ...broad('ai pdf renamer', 'rename pdf based on content'),
    ],
    ad: rsa(
      headlines(
        'AI PDF Renamer — Try Free',
        '50 Free Renames to Start',
        'Rename 1000 PDFs in Minutes',
        'AI Reads Content & Names Files',
        'Still Renaming PDFs by Hand?',
      ),
      descriptions(
        '95% accuracy on invoices & receipts. 50 free renames.',
        'Upload PDFs. AI reads dates, amounts, names — renames every file.',
      ),
      url('https://www.renamed.to/pdf-renamer'),
    ),
  })
  .sitelinks(
    link('See Pricing', 'https://www.renamed.to/pricing', {
      description1: '50 files free monthly',
      description2: 'Then $9 for 1,000 documents',
    }),
    link('Google Drive Integration', 'https://www.renamed.to/integrations/google-drive'),
    link('Dropbox Integration', 'https://www.renamed.to/integrations/dropbox'),
  )
  .callouts('No Credit Card Required', 'AI-Powered', '95% Accuracy')`;

// CLI Reference
export const cliCommands = [
  { cmd: "ads plan", desc: "Preview changes (diff code vs platform)" },
  { cmd: "ads apply", desc: "Apply changes to ad platforms" },
  { cmd: "ads import", desc: "Import existing campaigns as TypeScript" },
  { cmd: "ads pull", desc: "Pull live state, detect drift" },
  { cmd: "ads validate", desc: "Validate campaign files" },
  { cmd: "ads status", desc: "Show live platform state" },
  { cmd: "ads generate", desc: "Generate expanded campaign variants" },
  { cmd: "ads optimize", desc: "AI-powered campaign optimization" },
  { cmd: "ads doctor", desc: "Diagnostic checks on project setup" },
] as const;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add lib/snippets.ts
git commit -m "feat: add all landing page content snippets"
```

---

## Chunk 2: Page Sections (Top Half)

### Task 5: Build Nav component

**Files:**
- Create: `components/Nav.tsx`

- [ ] **Step 1: Create Nav**

Create `components/Nav.tsx`:

```tsx
export function Nav() {
  return (
    <nav className="flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto">
      <a href="/" className="font-heading text-xl font-bold tracking-tight">
        ads-as-code
      </a>
      <div className="flex items-center gap-6">
        <a
          href="https://github.com/upspawn/ads-as-code"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-text transition-colors text-sm font-medium"
        >
          GitHub
        </a>
        <a
          href="https://github.com/upspawn/ads-as-code/blob/main/docs/getting-started.md"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Get Started
        </a>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/Nav.tsx
git commit -m "feat: add Nav component"
```

---

### Task 6: Build Hero section with DiffOutput

**Files:**
- Create: `components/DiffOutput.tsx`
- Create: `components/Hero.tsx`

- [ ] **Step 1: Create DiffOutput with typewriter animation**

Create `components/DiffOutput.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

type DiffLine = {
  text: string;
  type: "add" | "change" | "remove" | "muted" | "plain";
};

function parseDiffLines(raw: string): DiffLine[] {
  return raw.split("\n").map((line) => {
    if (line.startsWith("+")) return { text: line, type: "add" };
    if (line.startsWith("~")) return { text: line, type: "change" };
    if (line.startsWith("-")) return { text: line, type: "remove" };
    if (line.startsWith("$") || line.trim() === "" || line.startsWith("  "))
      return { text: line, type: "muted" };
    return { text: line, type: "plain" };
  });
}

const colorMap = {
  add: "text-diff-add",
  change: "text-diff-change",
  remove: "text-diff-remove",
  muted: "text-text-muted",
  plain: "text-text",
};

export function DiffOutput({ content }: { content: string }) {
  const lines = parseDiffLines(content);
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLPreElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let count = 0;
          const interval = setInterval(() => {
            count++;
            setVisibleCount(count);
            if (count >= lines.length) clearInterval(interval);
          }, 120);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [lines.length]);

  return (
    <pre
      ref={ref}
      className="font-mono text-sm md:text-base leading-relaxed rounded-xl border border-code-border bg-code-bg p-5 md:p-8 overflow-x-auto"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className={`${colorMap[line.type]} transition-opacity duration-300`}
          style={{ opacity: i < visibleCount ? 1 : 0 }}
        >
          {line.text || "\u00A0"}
        </div>
      ))}
    </pre>
  );
}
```

- [ ] **Step 2: Create Hero component**

Create `components/Hero.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { DiffOutput } from "./DiffOutput";
import { heroDiff } from "@/lib/snippets";

export function Hero() {
  return (
    <section className="px-6 md:px-12 pt-16 md:pt-28 pb-20 md:pb-32 max-w-6xl mx-auto">
      <FadeIn>
        <h1 className="font-heading text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
          Stop clicking.
          <br />
          Start committing.
        </h1>
      </FadeIn>
      <FadeIn delay={100}>
        <p className="text-text-muted text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          Define ad campaigns in TypeScript. Preview changes with{" "}
          <code className="font-mono text-text bg-code-bg px-1.5 py-0.5 rounded text-base">
            plan
          </code>
          . Apply with confidence.
        </p>
      </FadeIn>
      <FadeIn delay={200}>
        <div className="flex flex-wrap gap-4 mb-14">
          <a
            href="https://github.com/upspawn/ads-as-code/blob/main/docs/getting-started.md"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-accent-hover transition-colors"
          >
            Get Started
          </a>
          <a
            href="https://github.com/upspawn/ads-as-code"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-code-border text-text px-6 py-3 rounded-lg font-medium hover:border-text-muted transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </FadeIn>
      <FadeIn delay={300}>
        <DiffOutput content={heroDiff} />
      </FadeIn>
    </section>
  );
}
```

- [ ] **Step 3: Wire Hero into page.tsx**

Replace `app/page.tsx`:

```tsx
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
    </main>
  );
}
```

- [ ] **Step 4: Verify in dev server**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run dev
```

Open `http://localhost:3000`. Verify:
- Fraunces renders on headline
- DM Sans on body text
- Space Mono on code/diff
- Diff typewriter animation plays on scroll
- Burnt orange accent on CTA button
- Warm off-white background

- [ ] **Step 5: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/DiffOutput.tsx components/Hero.tsx app/page.tsx
git commit -m "feat: add Hero section with animated diff output"
```

---

### Task 7: Build Problem section

**Files:**
- Create: `components/Problem.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create Problem component**

Create `components/Problem.tsx`:

```tsx
import { FadeIn } from "./FadeIn";

const painPoints = [
  "No version history on campaign changes.",
  "No code review before someone doubles the budget.",
  "No rollback when a change tanks your ROAS.",
  "Someone tweaks a bid in the UI — nobody knows.",
  "Doesn't scale past a handful of campaigns.",
];

export function Problem() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-12">
          The Google Ads UI wasn&apos;t built for teams.
        </h2>
      </FadeIn>
      <div className="space-y-4 max-w-2xl">
        {painPoints.map((point, i) => (
          <FadeIn key={i} delay={i * 80}>
            <p className="text-text-muted text-lg md:text-xl leading-relaxed">
              {point}
            </p>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add to page.tsx**

Add the import and component to `app/page.tsx`:

```tsx
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
    </main>
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
git add components/Problem.tsx app/page.tsx
git commit -m "feat: add Problem section"
```

---

### Task 8: Build How It Works section

**Files:**
- Create: `components/HowItWorksStep.tsx`
- Create: `components/HowItWorks.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create HowItWorksStep component**

Create `components/HowItWorksStep.tsx`:

```tsx
import { CodeBlock } from "./CodeBlock";

export function HowItWorksStep({
  number,
  title,
  caption,
  code,
  lang = "typescript",
}: {
  number: string;
  title: string;
  caption: string;
  code: string;
  lang?: "typescript" | "shellscript";
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-accent text-sm font-bold">
          {number}
        </span>
        <h3 className="font-heading text-2xl font-bold">{title}</h3>
      </div>
      <p className="text-text-muted text-base leading-relaxed">{caption}</p>
      <CodeBlock code={code} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 2: Create HowItWorks component**

Create `components/HowItWorks.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { HowItWorksStep } from "./HowItWorksStep";
import { defineSnippet, planSnippet, applySnippet } from "@/lib/snippets";

export function HowItWorks() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-16">
          Three commands. Full control.
        </h2>
      </FadeIn>
      <div className="grid gap-16 md:gap-20">
        <FadeIn>
          <HowItWorksStep
            number="01"
            title="Define"
            caption="Campaigns are TypeScript. Type-safe, reviewable, version-controlled."
            code={defineSnippet}
          />
        </FadeIn>
        <FadeIn delay={100}>
          <HowItWorksStep
            number="02"
            title="Plan"
            caption="Preview every change before it touches your ad account."
            code={planSnippet}
            lang="shellscript"
          />
        </FadeIn>
        <FadeIn delay={200}>
          <HowItWorksStep
            number="03"
            title="Apply"
            caption="Apply with confidence. Rollback with git."
            code={applySnippet}
            lang="shellscript"
          />
        </FadeIn>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add to page.tsx**

Update `app/page.tsx` to include HowItWorks after Problem:

```tsx
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { HowItWorks } from "@/components/HowItWorks";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds. Shiki syntax highlighting renders at build time.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/HowItWorksStep.tsx components/HowItWorks.tsx app/page.tsx
git commit -m "feat: add How It Works section with Define/Plan/Apply steps"
```

---

## Chunk 3: Page Sections (Bottom Half)

### Task 9: Build Features section

**Files:**
- Create: `components/FeatureCard.tsx`
- Create: `components/Features.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create FeatureCard component**

Create `components/FeatureCard.tsx`:

```tsx
import type { ReactNode } from "react";

export function FeatureCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-heading text-xl font-bold">{title}</h3>
      <p className="text-text-muted text-base leading-relaxed">{children}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create Features component**

Create `components/Features.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { FeatureCard } from "./FeatureCard";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-sm bg-code-bg px-1 py-0.5 rounded">
      {children}
    </code>
  );
}

export function Features() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-16">
          Everything you need.
          <br />
          Nothing you don&apos;t.
        </h2>
      </FadeIn>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-12">
        <FadeIn>
          <FeatureCard title="Type-safe campaigns">
            Branded types catch &ldquo;headline too long&rdquo; at build time, not after
            you&apos;ve burned budget.
          </FeatureCard>
        </FadeIn>
        <FadeIn delay={60}>
          <FeatureCard title="Plan / Apply">
            Preview a diff of every change before it touches your ad account.
          </FeatureCard>
        </FadeIn>
        <FadeIn delay={120}>
          <FeatureCard title="Import existing campaigns">
            <Code>ads import</Code> pulls your entire Google Ads account into
            TypeScript.
          </FeatureCard>
        </FadeIn>
        <FadeIn delay={180}>
          <FeatureCard title="Drift detection">
            <Code>ads pull</Code> catches changes someone made in the UI.
          </FeatureCard>
        </FadeIn>
        <FadeIn delay={240}>
          <FeatureCard title="AI-powered copy">
            Generate and optimize ad copy — headlines, descriptions, keywords —
            with built-in AI.
          </FeatureCard>
        </FadeIn>
        <FadeIn delay={300}>
          <FeatureCard title="Multi-provider">
            Google Ads today. Meta in progress. Same engine, same workflow.
          </FeatureCard>
        </FadeIn>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add to page.tsx**

Update imports and add `<Features />` after `<HowItWorks />`.

- [ ] **Step 4: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/FeatureCard.tsx components/Features.tsx app/page.tsx
git commit -m "feat: add Features section with 6 feature cards"
```

---

### Task 10: Build Code Example section

**Files:**
- Create: `components/CodeExample.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create CodeExample component**

Create `components/CodeExample.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";
import { fullCampaignSnippet } from "@/lib/snippets";

export function CodeExample() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-4">
          Real campaigns. Real code.
        </h2>
        <p className="text-text-muted text-lg mb-12 max-w-2xl">
          A production campaign definition — two locales, keyword match types,
          RSA ads, sitelinks, and callout extensions. All type-safe.
        </p>
      </FadeIn>
      <FadeIn delay={100}>
        <CodeBlock
          code={fullCampaignSnippet}
          className="text-sm md:text-base"
        />
      </FadeIn>
    </section>
  );
}
```

- [ ] **Step 2: Add to page.tsx**

Add import and `<CodeExample />` after `<Features />`.

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/CodeExample.tsx app/page.tsx
git commit -m "feat: add Code Example section with full campaign definition"
```

---

### Task 11: Build CLI Reference section

**Files:**
- Create: `components/CliReference.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create CliReference component**

Create `components/CliReference.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { cliCommands } from "@/lib/snippets";

export function CliReference() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-12">
          One CLI. Full lifecycle.
        </h2>
      </FadeIn>
      <FadeIn delay={100}>
        <div className="rounded-xl border border-code-border bg-code-bg p-5 md:p-8 font-mono text-sm md:text-base">
          {cliCommands.map((entry, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-code-border last:border-0"
            >
              <span className="text-accent font-bold whitespace-nowrap">
                {entry.cmd}
              </span>
              <span className="text-text-muted">{entry.desc}</span>
            </div>
          ))}
        </div>
      </FadeIn>
    </section>
  );
}
```

- [ ] **Step 2: Add to page.tsx**

Add import and `<CliReference />` after `<CodeExample />`.

- [ ] **Step 3: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/CliReference.tsx app/page.tsx
git commit -m "feat: add CLI Reference section"
```

---

### Task 12: Build Footer section

**Files:**
- Create: `components/Footer.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create Footer component**

Create `components/Footer.tsx`:

```tsx
import { FadeIn } from "./FadeIn";
import { CopyButton } from "./CopyButton";

const installCmd = "npm install @upspawn/ads";

export function Footer() {
  return (
    <footer className="px-6 md:px-12 py-20 md:py-32 max-w-6xl mx-auto border-t border-code-border">
      <FadeIn>
        <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-6">
          Ready to ship ads from your editor?
        </h2>
        <div className="flex items-center gap-2 bg-code-bg border border-code-border rounded-lg px-4 py-3 mb-10 w-fit">
          <code className="font-mono text-base">{installCmd}</code>
          <CopyButton text={installCmd} />
        </div>
        <div className="flex flex-wrap gap-4 mb-16">
          <a
            href="https://github.com/upspawn/ads-as-code/blob/main/docs/getting-started.md"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-accent-hover transition-colors"
          >
            Get Started
          </a>
          <a
            href="https://github.com/upspawn/ads-as-code"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-code-border text-text px-6 py-3 rounded-lg font-medium hover:border-text-muted transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </FadeIn>
      <div className="flex flex-wrap gap-6 text-sm text-text-muted pt-8 border-t border-code-border">
        <a
          href="https://github.com/upspawn/ads-as-code/blob/main/docs/api.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text transition-colors"
        >
          Docs
        </a>
        <a
          href="https://github.com/upspawn/ads-as-code"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://github.com/upspawn/ads-as-code/blob/main/CONTRIBUTING.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text transition-colors"
        >
          Contributing
        </a>
        <span className="ml-auto">
          Built by{" "}
          <a
            href="https://upspawn.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors"
          >
            Upspawn
          </a>
        </span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Update page.tsx with all sections**

Final `app/page.tsx`:

```tsx
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { CodeExample } from "@/components/CodeExample";
import { CliReference } from "@/components/CliReference";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <CodeExample />
      <CliReference />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 3: Verify full build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

Expected: Build succeeds with all 7 sections rendered.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add components/Footer.tsx app/page.tsx
git commit -m "feat: add Footer section and complete page assembly"
```

---

## Chunk 4: Polish & Deploy

### Task 13: Create OG image placeholder

**Files:**
- Create: `public/og-image.png`

- [ ] **Step 1: Create a simple OG image**

Create a 1200x630 placeholder OG image. This can be a simple solid background with the brand name. Use any available tool (e.g., a generated SVG converted to PNG, or a simple canvas script). At minimum, create a placeholder so the meta tag doesn't 404.

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
# Create a simple SVG and convert, or use a placeholder service
# The final OG image should show: "ads-as-code" in Fraunces on warm off-white bg
```

- [ ] **Step 2: Commit**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add public/og-image.png
git commit -m "feat: add OG image placeholder"
```

---

### Task 14: Visual QA and responsive polish

**Files:**
- Potentially modify: any component that needs responsive tweaks

- [ ] **Step 1: Run dev server and test at desktop width (1200px+)**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run dev
```

Check:
- Max content width ~1100px, centered
- Generous whitespace between sections
- Typography hierarchy (large serif headlines, smaller sans body)
- Code blocks properly styled
- Diff animation plays

- [ ] **Step 2: Test at tablet width (768-1024px)**

Resize browser. Check:
- Headlines scale to 44-56px range
- Feature grid goes to 2 columns
- Code blocks don't overflow

- [ ] **Step 3: Test at mobile width (< 768px)**

Check:
- All sections stack vertically
- Headlines scale to 36-44px
- Code blocks scroll horizontally
- CTA buttons stack or wrap cleanly
- CLI reference stacks command + description

- [ ] **Step 4: Fix any responsive issues found**

Make targeted fixes in the affected component files.

- [ ] **Step 5: Verify build**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bun run build
```

- [ ] **Step 6: Commit if any changes were made**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add -A
git commit -m "fix: responsive polish"
```

---

### Task 15: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
gh repo create upspawn/ads-as-code-website --public --source=. --push
```

- [ ] **Step 2: Deploy to Vercel**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bunx vercel --yes
```

Follow prompts. The static export should deploy without issues.

- [ ] **Step 3: Set up production deployment**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
bunx vercel --prod
```

- [ ] **Step 4: Verify deployed site**

Open the Vercel URL. Check:
- All fonts load (Fraunces, DM Sans, Space Mono)
- All sections render correctly
- Diff animation plays
- CTA links work
- Mobile responsive
- OG meta tags present (check with browser devtools)

- [ ] **Step 5: Commit any deploy config changes**

```bash
cd ~/Projects/upspawn-products/ads-as-code-website
git add -A
git commit -m "chore: Vercel deployment config"
```
