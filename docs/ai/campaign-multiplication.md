# Campaign Multiplication

Clone a seed campaign across languages, audience segments (ICPs), or both. One campaign becomes many -- each a standalone TypeScript file that `ads plan` and `ads apply` treat like any other campaign.

## The generation matrix

Create `ads.generate.ts` at your project root (same directory as `ads.config.ts`):

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
          Emphasize free tier. Casual, direct tone.`,
      },
      {
        name: 'enterprise',
        prompt: `Adapt for IT administrators. Emphasize security,
          compliance, audit trails, SSO. Professional tone.`,
      },
    ],
    judge: `Translations must feel native, not translated.
      ICP variants must differ in appeal -- not just word swaps.`,
    cross: true,
  }),
]
```

`ads generate` loads this file via dynamic import. Only one matrix file is supported.

## How expansion works

Given a seed campaign, `expand()` produces:

### Translation

`translate: ['de', 'fr', 'es']` generates 3 translated campaigns. The AI translates all ad copy, keywords, and extensions. Campaign names get a language suffix.

### ICP variations

`vary: [{ name: 'smb', prompt: '...' }, ...]` generates campaigns adapted for each audience. The AI rewrites copy to match the ICP's language and priorities while preserving the campaign's structure.

### Cross products

With `cross: true` (default), you get both individual variants AND all combinations:

| Output | Count |
|---|---|
| Base translations (de, fr, es) | 3 |
| Base ICP variants (smb, enterprise) | 2 |
| Cross products (smb.de, smb.fr, smb.es, enterprise.de, enterprise.fr, enterprise.es) | 6 |
| **Total** | **11** |

With `cross: false`, only individual variants are generated (no combinations):

| Output | Count |
|---|---|
| Translations (de, fr, es) | 3 |
| ICP variants (smb, enterprise) | 2 |
| **Total** | **5** |

## Output files

Generated campaigns go into `generated/` by default:

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

Naming convention: `{seed-name}.{variant}.{language}.ts`

Generated files are **standalone, normal TypeScript campaign files** -- no `ai.*` markers, no lock files, no special handling. They import from `@upspawn/ads` and export a campaign object, just like hand-written campaigns.

## Manifest

The manifest tracks provenance for each generated campaign:

```jsonc
// generated/.gen-manifest.json
{
  "search-dropbox.de": {
    "seed": "../campaigns/search-dropbox.ts",
    "transform": { "translate": "de" },
    "model": "claude-sonnet-4-6",
    "generatedAt": "2026-03-15T15:00:00Z",
    "round": 1
  },
  "search-dropbox.smb.de": {
    "seed": "../campaigns/search-dropbox.ts",
    "transform": { "vary": "smb", "translate": "de" },
    "model": "claude-sonnet-4-6",
    "generatedAt": "2026-03-15T15:00:00Z",
    "round": 1
  }
}
```

## Rerolling generated campaigns

```bash
ads generate --reroll generated/search-dropbox.de.ts          # reroll one
ads generate --reroll --filter '*.de.ts'                       # reroll by pattern
ads generate --reroll --seed campaigns/search-dropbox.ts       # reroll all from seed
```

## Selective expansion

You don't need both `translate` and `vary`. Use either one:

```typescript
// Translate only
expand('./campaigns/search-dropbox.ts', {
  translate: ['de', 'fr'],
})

// ICP only
expand('./campaigns/search-dropbox.ts', {
  vary: [{ name: 'smb', prompt: '...' }],
})

// Both, but no cross products
expand('./campaigns/search-dropbox.ts', {
  translate: ['de'],
  vary: [{ name: 'smb', prompt: '...' }],
  cross: false,
})
```

## Staleness

When the seed campaign changes, `ads validate` warns:

```
Warning: Stale generated campaigns from seed search-dropbox.ts
  Run: ads generate --seed campaigns/search-dropbox.ts
```

Regeneration **overwrites** generated files. If you've made manual edits, use `git diff` to recover them. For long-lived changes, update the seed or the expansion config -- don't hand-edit generated files.

## Interaction with copy generation

A seed campaign can contain `ai.*` markers. The expansion system works on the resolved campaign (after `.gen.json` lock file values are substituted). So the flow is:

1. `ads generate campaigns/search-dropbox.ts` -- resolves inline markers, writes `.gen.json`
2. `ads generate` (matrix) -- reads the seed with resolved markers, expands into generated campaigns
3. `ads plan` / `ads apply` -- works on all campaigns (hand-written, generated, resolved)
