# AI-Powered Campaign Generation — Design Spec

## Overview

Integrate Vercel AI SDK into ads-as-code to enable AI-generated ad copy, campaign multiplication across languages/ICPs, and optimization suggestions. AI is always a pre-step — the plan/apply pipeline remains pure and unaware of AI.

## Design Principles

1. **Everything is a prompt.** Structured helpers (`product`, `audience`, `tone`) are prompt-building shortcuts, never a ceiling. Users can always escape to raw prompt strings.
2. **AI is a force multiplier on human-written seeds.** You write the first campaign. AI clones, varies, translates, and expands it. You curate.
3. **Generate-then-commit.** AI output is locked into files, committed to git, reviewed in PRs. Never resolved at runtime.
4. **Lock file pattern.** AI intent lives in campaign files. Generated values live in companion `.gen.json` files — like `bun.lock` for AI output.
5. **Provider-agnostic.** Vercel AI SDK supports many providers. Users configure their preferred model in `ads.config.ts`.

## Three Capabilities

| Capability | Mechanism | Input | Output |
|---|---|---|---|
| **Copy generation** | Inline `ai.*` helpers | Campaign file with AI markers | `.gen.json` lock file |
| **Campaign multiplication** | Generation matrix | Seed campaign + expansion config | Standalone campaign files |
| **Optimization** | Analysis CLI | Any campaign | Terminal suggestions |

### Architecture

```
Campaign Files (.ts)           ads.generate.ts (matrix)
with ai.* markers              expand(seed, {...})
       │                              │
       ▼                              ▼
┌──────────────────────────────────────────┐
│             ads generate                  │
│                                           │
│   Prompt Compiler → Vercel AI SDK         │
│         │                                 │
│   Judge Pipeline (evaluate/retry)         │
└──────────────────────────────────────────┘
       │                              │
       ▼                              ▼
.gen.json lock files         Generated campaigns (.ts)
       │                              │
       └────────────┬─────────────────┘
                    ▼
┌──────────────────────────────────────────┐
│       ads plan / ads apply                │
│       (pure — no AI awareness)            │
└──────────────────────────────────────────┘
```

## Type System Changes

### Config Extension

The existing `AdsConfig` type gains an optional `ai` field. The AI SDK is a lazy dependency — users who don't use AI features never import it.

```typescript
// src/core/types.ts — additions
import type { LanguageModel } from 'ai'  // from Vercel AI SDK

export type AiJudgeConfig = {
  readonly model?: LanguageModel  // defaults to ai.model if omitted
  readonly prompt: string
}

export type AiOptimizeConfig = {
  readonly prompt?: string  // default analysis lens
}

export type AiConfig = {
  readonly model: LanguageModel
  readonly judge?: AiJudgeConfig
  readonly optimize?: AiOptimizeConfig
}

// AdsConfig gains:
export type AdsConfig = {
  readonly google?: GoogleProviderConfig
  readonly meta?: MetaProviderConfig
  readonly cache?: CacheConfig
  readonly ai?: AiConfig  // optional — no AI SDK required if omitted
}
```

### AI Marker Types

`ai.*` helpers return branded marker objects, not concrete ad/keyword types. The campaign type system uses discriminated unions to accept both:

```typescript
// src/ai/types.ts
export type AiMarker = { readonly __brand: 'ai-marker' }

export type RsaMarker = AiMarker & {
  readonly type: 'rsa'
  readonly prompt: string          // raw or compiled
  readonly structured?: { product?: string; audience?: string; tone?: string }
  readonly judge?: string
}

export type KeywordsMarker = AiMarker & {
  readonly type: 'keywords'
  readonly prompt: string
}

// Ad group accepts either concrete values or markers
export type AdGroupInput = {
  readonly keywords: readonly Keyword[] | KeywordsMarker | readonly (Keyword | KeywordsMarker)[]
  readonly ad: GoogleAd | RsaMarker
  readonly status?: 'enabled' | 'paused'
}
```

`ai.keywords()` returns a `KeywordsMarker` (not an array). To mix hand-written and AI keywords, use array syntax without spread:

```typescript
// ✅ Works — array of mixed types
keywords: [phrase('automate dropbox'), ai.keywords('long-tail variations')]

// ❌ Won't work — can't spread a marker
keywords: [...phrase('automate dropbox'), ...ai.keywords('...')]
```

### Marker Resolution Pipeline

Markers are resolved **after discovery, before flatten**:

```
discoverCampaigns()  →  resolveMarkers()  →  flattenAll()  →  diff()
                         ↑
                    reads .gen.json,
                    replaces markers with
                    concrete values
```

`resolveMarkers()` walks each campaign's groups, finds `AiMarker` instances, looks up their locked values in the companion `.gen.json`, and substitutes concrete `GoogleAd` / `Keyword[]` values. After resolution, the campaign is a normal `GoogleSearchCampaign` — `flatten()` never sees markers.

### Lock File Slot Keys

Slot keys in `.gen.json` use the format `{group-key}.{field}`, matching the ad group key as defined in the `.group()` call. For example, `.group('dropbox-automation-en', { ad: ai.rsa(...) })` produces slot key `dropbox-automation-en.ad`. These are stable, user-defined identifiers — not derived from flatten paths or hashes.

## Provider Configuration

Lives in `ads.config.ts`:

```typescript
import { defineConfig } from '@upspawn/ads'
import { anthropic } from '@ai-sdk/anthropic'

export default defineConfig({
  google: { customerId: '123-456-7890' },
  ai: {
    model: anthropic('claude-sonnet-4-6'),
    judge: {
      model: anthropic('claude-sonnet-4-6'),
      prompt: `We are Renamed.to. Our voice is direct, specific, technical
        but approachable. Never sound like generic SaaS marketing.`,
    },
  },
})
```

Any Vercel AI SDK provider works — `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, etc. The `ai` field is optional — projects that don't use AI features have no dependency on the AI SDK.

## Capability 1: Copy Generation (Inline `ai.*` Helpers)

### AI Helpers

Markers that indicate where AI should generate content. They return marker objects at load time — `ads generate` resolves them later.

#### `ai.rsa()` — Responsive Search Ads

Three usage modes, all compile to a prompt string:

```typescript
// ① Raw prompt — full control
ad: ai.rsa(`Headlines for Renamed.to, an AI file renaming tool.
  Target: power users drowning in badly named files.
  Be specific. Use numbers. Mention the free tier.`)

// ② Structured — compiles to a prompt
ad: ai.rsa({
  product: 'Renamed.to — AI file renaming for Dropbox',
  audience: 'Power users drowning in badly named files',
  tone: 'direct, no fluff',
})

// ③ Mixed — structured base + custom instructions
ad: ai.rsa({
  product: 'Renamed.to',
  prompt: 'Emphasize SOC2 compliance. Mention the free tier.',
})
```

#### `ai.keywords()` — Keyword Generation

```typescript
// AI-only
keywords: ai.keywords(`People searching for ways to
  automatically rename files in Dropbox.
  Include long-tail variants.`)

// Mixed: hand-written + AI-generated (no spread on markers)
keywords: [
  ...phrase('automate dropbox', 'bulk rename dropbox'),
  ai.keywords('Long-tail variations on Dropbox file automation'),
]
```

### Context Injection

The prompt compiler automatically appends context the user shouldn't have to repeat:
- The group's keywords (so copy mirrors search intent)
- Google Ads constraints (headline ≤30 chars, description ≤90 chars, 3-15 headlines, 2-4 descriptions)
- Campaign name and structure

Even a terse prompt like `ai.rsa('Renamed.to — AI file renaming')` produces good output because the system injects keyword context and platform rules.

### Judges

Prompts that evaluate generated output. Attach to any `ai.*` helper:

```typescript
ad: ai.rsa({
  prompt: 'Renamed.to — AI file renaming for Dropbox',
  judge: `Reject if:
    - Sounds like generic SaaS ("Transform your workflow")
    - Could apply to any product, not specific to file renaming
    - Uses clickbait or superlatives
    Prefer:
    - Mentions a concrete feature (batch rename, PDF parsing)
    - Includes a number (50 free docs, 3 clicks)`,
})
```

Pipeline: generate → judge evaluates each item → weak ones regenerate → repeat (max 3 rounds).

Judges are optional. A default judge can be set in `ads.config.ts` (brand voice). Per-helper judges merge with the default — global = brand voice, local = task-specific criteria.

### Prompt Composition

Prompts are strings — compose with imports and template literals:

```typescript
// prompts/brand.ts
export const brand = `Product: Renamed.to — AI-powered file renaming.
Voice: direct, specific, slightly technical. Never generic.`

export const smb = `Audience: small business owners and freelancers.
Price-sensitive. Value time savings.`

// campaigns/search-dropbox.ts
import { brand, smb } from '../prompts/brand'
ad: ai.rsa(`${brand}\n${smb}\nEmphasize Dropbox integration.`)
```

No framework magic — just JS.

### Lock File Format

Every campaign with `ai.*` markers gets a companion `.gen.json`:

```jsonc
// campaigns/search-dropbox.gen.json
{
  "version": 1,
  "model": "claude-sonnet-4-6",
  "generatedAt": "2026-03-15T14:30:00Z",
  "slots": {
    "dropbox-automation-en.ad": {
      "prompt": "...",            // compiled prompt snapshot
      "judge": "...",             // judge prompt (if any)
      "result": {
        "headlines": [
          "Rename 50 Dropbox Files in 3 Clicks",
          "AI Reads Your PDFs, Names Them Right",
          "Stop Renaming Files Manually",
          "Free for 50 Documents per Month"
        ],
        "descriptions": [
          "Connect Dropbox. AI analyzes your documents and renames them instantly.",
          "Batch rename PDFs, invoices, contracts with AI that reads the content."
        ]
      },
      "pinned": [0],
      "round": 1
    }
  }
}
```

The lock file stores the compiled prompt snapshot for reproducibility and debugging.

### Rerolling & Pinning

```bash
ads generate campaign.ts --reroll                          # reroll all slots
ads generate campaign.ts --reroll group-name.ad            # reroll one slot
ads generate campaign.ts --reroll group-name.ad.headlines[2]  # reroll one headline
ads generate campaign.ts --pin group-name.ad.headlines[0]  # pin a value
ads generate campaign.ts --unpin group-name.ad.headlines[0]
```

Pinned values survive rerolls. AI is told "keep these, generate replacements for the rest."

### Plan Integration

When `ads plan` loads a campaign:
1. Evaluate TypeScript — `ai.*` helpers return marker objects
2. Find companion `.gen.json`
3. Replace markers with locked results
4. Flatten, diff, etc. as normal

If a marker has no lock entry: error with `"Unresolved AI marker in {campaign}/{group}.{field} — run ads generate first"` and exit. This prevents accidentally deploying campaigns with missing ad copy.

### Staleness Detection

When the prompt in the campaign file changes, the compiled prompt no longer matches `.gen.json`. `ads validate` and `ads plan` warn:

```
⚠ Stale generation: search-dropbox/dropbox-automation-en.ad
  Prompt changed since last generate. Run: ads generate campaigns/search-dropbox.ts
```

Not an error — old locked values still work. User decides when to regenerate.

## Capability 2: Campaign Multiplication

### Generation Matrix

```typescript
// ads.generate.ts
import { expand } from '@upspawn/ads/ai'

export default [
  expand('./campaigns/search-dropbox.ts', {
    translate: ['de', 'fr', 'es'],
    vary: [
      {
        name: 'smb',
        prompt: `Adapt for small business owners. Price-sensitive.
          Emphasize free tier. Casual, direct tone.`
      },
      {
        name: 'enterprise',
        prompt: `Adapt for IT administrators. Emphasize security,
          compliance, audit trails, SSO. Professional tone.`
      },
    ],
    judge: `Translations must feel native, not translated.
      ICP variants must differ in appeal — not just word swaps.`,
    cross: true, // combinatorial expansion (default)
  }),
]
```

### Output

With `cross: true` (default), the output is: base variants (3 translated + 2 ICP) + cross products (3 × 2 = 6) = **11 campaigns**:

```
generated/
  search-dropbox.de.ts
  search-dropbox.fr.ts
  search-dropbox.es.ts
  search-dropbox.smb.ts
  search-dropbox.enterprise.ts
  search-dropbox.smb.de.ts
  search-dropbox.smb.fr.ts
  search-dropbox.smb.es.ts
  search-dropbox.enterprise.de.ts
  search-dropbox.enterprise.fr.ts
  search-dropbox.enterprise.es.ts
  .gen-manifest.json
```

Generated files are **standalone, normal TypeScript campaign files** — no `ai.*` markers, no lock files, no special handling. `ads plan` and `ads apply` treat them like any other campaign.

### Manifest

```jsonc
// generated/.gen-manifest.json
{
  "search-dropbox.de": {
    "seed": "../campaigns/search-dropbox.ts",
    "transform": { "translate": "de" },
    "model": "claude-sonnet-4-6",
    "generatedAt": "2026-03-15T15:00:00Z",
    "round": 1
  }
}
```

### Rerolling Generated Campaigns

```bash
ads generate --reroll generated/search-dropbox.de.ts
ads generate --reroll --filter '*.de.ts'
ads generate --reroll --seed campaigns/search-dropbox.ts
```

### Selective Expansion

```typescript
expand('./campaigns/search-dropbox.ts', {
  translate: ['de', 'fr'],               // only translate, no ICP
})

expand('./campaigns/search-dropbox.ts', {
  translate: ['de'],
  vary: [{ name: 'smb', prompt: '...' }],
  cross: false,                           // no combinatorial — just de + smb independently
})
```

### Staleness

When the seed changes, `ads validate` warns:

```
⚠ Stale generated campaigns from seed search-dropbox.ts
  Run: ads generate --seed campaigns/search-dropbox.ts
```

Regeneration **overwrites** generated files. If you've made manual edits, use `git diff` to recover them after regeneration. Don't hand-edit generated files for long-lived changes — instead, update the seed or the expansion config.

## Capability 3: Optimization CLI

Works on any campaign — hand-written, imported, or generated.

### Usage

```bash
ads optimize campaigns/search-dropbox.ts     # one campaign
ads optimize --all                            # everything
ads optimize generated/ --filter '*.de.ts'   # subset
```

### Default Analysis

Covers common optimization patterns:
- **Keyword ↔ copy alignment** — headlines should echo keyword language
- **Missing keywords** — high-intent terms not yet covered
- **Negative gaps** — missing negatives that waste budget
- **Ad copy quality** — generic vs. specific headlines
- **Structure** — ad group organization, budget balance
- **Cross-campaign** (with `--all`) — keyword cannibalization, coverage gaps

### Custom Analysis Prompt

```bash
ads optimize campaigns/search-dropbox.ts \
  --prompt "Focus on competitor differentiation against Google Drive and OneDrive"
```

Or set a default in config:

```typescript
// ads.config.ts
ai: {
  optimize: {
    prompt: `Analyze from Renamed.to's perspective — a niche AI file renaming
      tool. Flag anything a competitor could claim verbatim.`,
  },
}
```

### Applying Suggestions

```bash
ads optimize campaign.ts --interactive  # walk through, accept/reject
ads optimize campaign.ts --apply        # auto-apply (inserts ai.* markers)
ads optimize campaign.ts --patch        # output reviewable patch
```

`--apply` inserts `ai.*` markers — doesn't write final copy directly. Run `ads generate` afterward to resolve.

### Cross-Campaign Analysis

With `--all`, also analyzes:
- Keyword cannibalization between campaigns
- Coverage gaps (markets/intents not targeted)
- Budget balance across campaigns

## CLI Commands

### New Commands

```bash
# Generation
ads generate                                    # resolve all
ads generate campaigns/search-dropbox.ts        # resolve one
ads generate --dry-run                          # preview
ads generate --reroll [slot]                    # regenerate
ads generate --pin <slot>                       # pin value
ads generate --unpin <slot>                     # unpin value
ads generate --seed campaigns/search-dropbox.ts # regenerate from seed
ads generate --filter '*.de.ts'                 # filter generated files

# Optimization
ads optimize campaigns/search-dropbox.ts        # analyze one
ads optimize --all                              # analyze all
ads optimize --prompt "..."                     # custom lens
ads optimize --interactive                      # walk through suggestions
ads optimize --apply                            # insert ai.* markers
ads optimize --patch                            # reviewable patch
```

### Modified Commands

- **`ads validate`** — warns on unresolved `ai.*` markers, stale lock files, stale generated files
- **`ads plan`** — resolves `ai.*` markers from `.gen.json` before flattening; errors on unresolved markers
- **`ads init`** — optionally scaffolds AI config (`ai` block in config, `prompts/` dir, `ads.generate.ts`)

### Unchanged Commands

`ads auth`, `ads import`, `ads apply`, `ads pull`, `ads status`, `ads history`, `ads doctor`, `ads cache` — no modifications needed. They work on resolved campaigns, which is what they'll get.

## File Structure

```
my-ads-project/
├── ads.config.ts                    # platform creds + AI provider config
├── ads.generate.ts                  # generation matrix (optional)
├── prompts/                         # reusable prompt fragments (optional)
│   └── brand.ts
├── campaigns/                       # source of truth
│   ├── search-dropbox.ts            # may contain ai.* markers
│   ├── search-dropbox.gen.json      # locked AI output (committed)
│   ├── search-pdf-renaming.ts       # may be pure (no AI)
│   └── search-exact-match.ts
├── generated/                       # AI-expanded campaigns
│   ├── search-dropbox.de.ts         # standalone campaign files
│   ├── search-dropbox.smb.ts
│   ├── search-dropbox.smb.de.ts
│   └── .gen-manifest.json           # provenance tracking
└── .gitignore
```

Everything goes in git — lock files, generated campaigns, manifest. Enables PR review, git history, and reproducibility.

## Generation Matrix Discovery

`ads generate` looks for `ads.generate.ts` (or `ads.generate.js`) at the project root — the same directory as `ads.config.ts`. Only one matrix file is supported. If it doesn't exist, `ads generate` only resolves inline `ai.*` markers. The matrix file is loaded via dynamic import, same as the config file.

## Structured Output with Zod

AI generation uses Vercel AI SDK's `generateObject()` with Zod schemas to ensure structurally valid output:

```typescript
// RSA generation schema
const rsaSchema = z.object({
  headlines: z.array(z.string().max(30)).min(3).max(15),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
})

// Keyword generation schema
const keywordsSchema = z.object({
  keywords: z.array(z.object({
    text: z.string(),
    match: z.enum(['exact', 'phrase', 'broad']),
  })),
})
```

`generateObject()` handles structural correctness (character limits, array bounds). The judge handles creative quality. These are separate concerns.

`generateText()` is used only for the optimization CLI, where output is free-form analysis text.

## Optimize --apply Implementation

`ads optimize --apply` does **not** modify TypeScript AST. Instead, it:
1. Generates a patch file (`.optimize-patch.json`) with suggested changes
2. Applies simple, mechanical edits: appending keywords to existing arrays, adding negative keywords
3. For ad copy suggestions, it inserts `ai.*` markers only in new ad groups — it never rewrites existing hand-written `rsa()` calls

Changes that can't be expressed as simple edits are reported as suggestions only (printed to terminal). The `--interactive` mode lets the user pick which suggestions to apply.

## Error Handling

### AI API Failures

- **Network/auth errors**: `ads generate` reports the error and exits. No partial writes to lock files — generation is atomic per slot (all headlines/descriptions for a slot succeed or none do).
- **Rate limits**: Retry with exponential backoff (max 3 retries, 1s/2s/4s delays). If still rate-limited, report and exit.
- **Partial campaign failure**: If a campaign has 3 slots and 2 succeed, the 2 successful slots are written to the lock file. The failed slot is reported. Next run picks up where it left off (existing locked slots are skipped unless `--reroll`).

### Judge Exhaustion

If the judge rejects all outputs after 3 rounds, the best-scoring attempt is locked with a warning flag:

```jsonc
{
  "dropbox-automation-en.ad": {
    "result": { ... },
    "judgeWarning": "Accepted after 3 rounds — judge criteria not fully met",
    "round": 3
  }
}
```

`ads validate` surfaces these warnings. The user can reroll with a relaxed judge or edit the locked values directly.

### Rerolling Individual Items

`--reroll group.ad.headlines[2]` sends the full context (all existing headlines, the original prompt) to the AI with an instruction: "Replace headline at index 2. Keep it coherent with the others." The AI sees the siblings for consistency. Only the single item is replaced in the lock file.

## Cost Controls

- **`ads generate --dry-run`** — shows what would be generated (which slots, estimated call count) without making any API calls. If no lock file exists, shows "would generate N slots across M campaigns."
- **Confirmation prompt** — when generating more than 10 slots in a single run, `ads generate` shows the count and asks for confirmation before proceeding. `--yes` flag skips confirmation.
- **Token reporting** — after generation, report total tokens used and estimated cost:
  ```
  Generated 4 slots across 2 campaigns
  Tokens: 12,340 input / 3,210 output (~$0.08)
  ```
- **No automatic regeneration** — `ads plan` and `ads validate` warn about staleness but never trigger AI calls. Only `ads generate` makes API calls, and only when explicitly run.

## Dependencies

New packages:
- `ai` (Vercel AI SDK core)
- `@ai-sdk/anthropic` (default provider, user can swap)
- `zod` (schema definitions for `generateObject`)

## Incremental Build Order

1. **AI helpers + lock files** — `ai.rsa()`, `ai.keywords()`, `.gen.json`, `ads generate` for inline markers
2. **Judges** — judge pipeline, default judge in config, per-helper judges
3. **Campaign multiplication** — `expand()`, generation matrix, `ads.generate.ts`, manifest
4. **Optimization CLI** — `ads optimize`, default + custom analysis, `--apply`
5. **Polish** — staleness detection, `--dry-run`, `ads init` scaffolding, cross-campaign analysis
