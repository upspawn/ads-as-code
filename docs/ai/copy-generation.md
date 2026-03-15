# Copy Generation

Inline AI markers that generate ad copy, keywords, and other content. Markers live in your campaign files; generated values live in companion `.gen.json` lock files.

## Markers

### `ai.rsa()` -- Responsive Search Ads (Google)

Generates headlines (3-15, max 30 chars each) and descriptions (2-4, max 90 chars each) for a Google RSA.

Three input modes:

```typescript
import { ai } from '@upspawn/ads/ai'

// Raw prompt -- full control
ad: ai.rsa(`Headlines for Renamed.to, an AI file renaming tool.
  Target: power users drowning in badly named files.
  Be specific. Use numbers. Mention the free tier.`)

// Structured -- compiles to a prompt internally
ad: ai.rsa({
  product: 'Renamed.to -- AI file renaming for Dropbox',
  audience: 'Power users drowning in badly named files',
  tone: 'direct, no fluff',
})

// Mixed -- structured base + custom instructions
ad: ai.rsa({
  product: 'Renamed.to',
  prompt: 'Emphasize SOC2 compliance. Mention the free tier.',
})
```

All three compile to a prompt string. The structured form is a shortcut, not a ceiling -- you can always drop to raw strings.

### `ai.metaCopy()` -- Meta Ad Copy

Generates `primaryText`, `headline`, and `description` for Meta (Facebook/Instagram) ads.

```typescript
ad: ai.metaCopy(`Renamed.to -- AI file renaming.
  Audience: small business owners.
  Hook with pain point, resolve with product.`)
```

### `ai.keywords()` -- Keyword Suggestions (Google)

Generates keywords with match types:

```typescript
// AI-only keywords
keywords: ai.keywords(`People searching for ways to automatically
  rename files in Dropbox. Include long-tail variants.`)

// Mixed: hand-written + AI-generated
keywords: [
  ...phrase('automate dropbox', 'bulk rename dropbox'),
  ai.keywords('Long-tail variations on Dropbox file automation'),
]
```

Note: `ai.keywords()` returns a marker object, not an array. You cannot spread it. Place it directly in an array alongside spread keyword arrays.

### `ai.interests()` -- Interest Suggestions (Meta)

Generates interest targeting suggestions for Meta campaigns:

```typescript
interests: ai.interests('Small business owners interested in file management')
```

## Context injection

The prompt compiler automatically appends context you don't need to repeat:

- The ad group's keywords (so copy mirrors search intent)
- Google Ads constraints (headline <= 30 chars, description <= 90 chars, 3-15 headlines, 2-4 descriptions)
- Campaign name and structure

Even a terse prompt like `ai.rsa('Renamed.to -- AI file renaming')` produces good output because the system injects keyword context and platform rules.

## Prompt composition

Prompts are strings. Compose them with imports and template literals:

```typescript
// prompts/brand.ts
export const brand = `Product: Renamed.to -- AI-powered file renaming.
Voice: direct, specific, slightly technical. Never generic.`

export const smb = `Audience: small business owners and freelancers.
Price-sensitive. Value time savings.`

// campaigns/search-dropbox.ts
import { brand, smb } from '../prompts/brand'

ad: ai.rsa(`${brand}\n${smb}\nEmphasize Dropbox integration.`)
```

No framework magic -- just JavaScript.

## Judges

Judges evaluate generated output and reject weak results. The pipeline: generate -> judge evaluates each item -> weak ones regenerate -> repeat (max 3 rounds).

### Per-marker judge

```typescript
ad: ai.rsa({
  prompt: 'Renamed.to -- AI file renaming for Dropbox',
  judge: `Reject if:
    - Sounds like generic SaaS ("Transform your workflow")
    - Could apply to any product, not specific to file renaming
    - Uses clickbait or superlatives
    Prefer:
    - Mentions a concrete feature (batch rename, PDF parsing)
    - Includes a number (50 free docs, 3 clicks)`,
})
```

### Default judge (config-level)

Set a brand voice judge that applies to all markers:

```typescript
// ads.config.ts
ai: {
  model: anthropic('claude-sonnet-4-6'),
  judge: {
    prompt: `We are Renamed.to. Our voice is direct, specific, technical
      but approachable. Never sound like generic SaaS marketing.`,
  },
}
```

Per-marker judges **merge** with the default. The default sets brand voice; per-marker judges add task-specific criteria.

### Judge exhaustion

If the judge rejects all outputs after 3 rounds, the best-scoring attempt is locked with a warning:

```jsonc
{
  "dropbox-automation-en.ad": {
    "result": { ... },
    "judgeWarning": "Accepted after 3 rounds -- judge criteria not fully met",
    "round": 3
  }
}
```

`ads validate` surfaces these warnings.

## Lock file format

Every campaign with `ai.*` markers gets a companion `.gen.json` in the same directory:

```
campaigns/
  search-dropbox.ts              # campaign with ai.* markers
  search-dropbox.gen.json        # locked AI output
```

Example lock file:

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

### Slot keys

Slot keys use the format `{group-key}.{field}`, derived from the `.group()` call:

```typescript
.group('dropbox-automation-en', {
  ad: ai.rsa(...)       // slot key: "dropbox-automation-en.ad"
  keywords: ai.keywords(...)  // slot key: "dropbox-automation-en.keywords"
})
```

These are stable, user-defined identifiers -- not derived from hashes or flatten paths.

### What gets committed

Lock files go in git. This enables PR review, git history, and reproducibility. The lock file stores the compiled prompt snapshot so you can see exactly what was sent to the AI.

## Rerolling and pinning

### Reroll

Regenerate AI output:

```bash
ads generate campaign.ts --reroll                            # reroll all slots
ads generate campaign.ts --reroll group-name.ad              # reroll one slot
ads generate campaign.ts --reroll group-name.ad.headlines[2] # reroll one headline
```

When rerolling a single item (e.g. `headlines[2]`), the AI sees the full context -- all existing headlines, the original prompt -- and generates a replacement that fits with the others. Only the single item changes in the lock file.

### Pin

Lock a value so it survives future rerolls:

```bash
ads generate campaign.ts --pin group-name.ad.headlines[0]
ads generate campaign.ts --unpin group-name.ad.headlines[0]
```

Pinned values are preserved during rerolls. The AI is told "keep these, generate replacements for the rest."

## Staleness detection

When you edit a prompt in your campaign file, the compiled prompt no longer matches the snapshot in `.gen.json`. `ads validate` and `ads plan` warn:

```
Warning: Stale generation: search-dropbox/dropbox-automation-en.ad
  Prompt changed since last generate. Run: ads generate campaigns/search-dropbox.ts
```

Not an error -- the old locked values still work. You decide when to regenerate. Only `ads generate` makes API calls, and only when explicitly run.

## Plan integration

When `ads plan` loads a campaign:

1. Evaluates TypeScript -- `ai.*` helpers return marker objects
2. Finds companion `.gen.json`
3. Replaces markers with locked results
4. Flattens, diffs, etc. as normal

If a marker has no lock entry, `ads plan` exits with:

```
Error: Unresolved AI marker in search-dropbox/dropbox-automation-en.ad -- run ads generate first
```

This prevents deploying campaigns with missing ad copy.

## Full example

```typescript
// prompts/brand.ts
export const brand = `Product: Renamed.to -- AI-powered file renaming.
Voice: direct, specific, slightly technical. Never generic.`

// campaigns/search-dropbox.ts
import { google, phrase, daily, url, negatives } from '@upspawn/ads'
import { ai } from '@upspawn/ads/ai'
import { brand } from '../prompts/brand'

export default google.search('Search - Dropbox', {
  budget: daily(5),
  bidding: 'maximize-conversions',
  negatives: negatives('free', 'tutorial', 'how to'),
})
  .group('dropbox-automation-en', {
    keywords: [
      ...phrase('automate dropbox', 'dropbox file renamer'),
      ai.keywords('Long-tail variations on Dropbox file automation'),
    ],
    ad: ai.rsa({
      prompt: `${brand}\nEmphasize Dropbox integration.`,
      judge: `Must mention a concrete feature. No generic marketing.`,
    }),
  })
  .group('dropbox-industry-en', {
    keywords: phrase('dropbox for accounting', 'dropbox for law firm'),
    ad: ai.rsa({
      prompt: `${brand}\nTarget professional services: accountants, lawyers.`,
    }),
  })
```

```bash
ads generate campaigns/search-dropbox.ts  # creates search-dropbox.gen.json
ads plan                                   # resolves markers from lock file
ads apply                                  # pushes to Google Ads
```
