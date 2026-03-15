# AI Generation

AI-powered copy generation, campaign multiplication, and optimization for ads-as-code. Built on [Vercel AI SDK](https://sdk.vercel.ai/) -- works with any LLM provider.

## What it does

| Capability | What happens | Input | Output |
|---|---|---|---|
| **Copy generation** | AI writes headlines, descriptions, keywords | `ai.rsa()` / `ai.keywords()` markers in campaign files | `.gen.json` lock file |
| **Campaign multiplication** | Clone a seed campaign across languages and audiences | `ads.generate.ts` matrix file | Standalone `.ts` campaign files |
| **Optimization** | AI analyzes campaigns and suggests improvements | Any campaign file | Terminal suggestions or patches |

AI runs as a **pre-step** -- it produces files that `ads plan` and `ads apply` consume. The plan/apply pipeline has no AI awareness. Generated output is committed to git and reviewed in PRs.

## Prerequisites

- An existing ads-as-code project ([Getting Started](../getting-started.md))
- A Vercel AI SDK provider package (e.g. `@ai-sdk/anthropic`, `@ai-sdk/openai`)

```bash
bun add ai @ai-sdk/anthropic
```

## Quick start

### 1. Configure the AI provider

```typescript
// ads.config.ts
import { defineConfig } from '@upspawn/ads'
import { anthropic } from '@ai-sdk/anthropic'

export default defineConfig({
  google: { customerId: '123-456-7890' },
  ai: {
    model: anthropic('claude-sonnet-4-6'),
  },
})
```

### 2. Add AI markers to a campaign

```typescript
// campaigns/search-dropbox.ts
import { google, phrase, daily, url } from '@upspawn/ads'
import { ai } from '@upspawn/ads/ai'

export default google.search('Search - Dropbox', {
  budget: daily(5),
  bidding: 'maximize-conversions',
})
  .group('dropbox-automation-en', {
    keywords: phrase('automate dropbox', 'dropbox file renamer'),
    ad: ai.rsa(`Renamed.to -- AI file renaming for Dropbox.
      Target: users drowning in badly named files.
      Be specific. Mention the free tier.`),
  })
```

### 3. Generate

```bash
ads generate campaigns/search-dropbox.ts
```

This creates `campaigns/search-dropbox.gen.json` with AI-generated headlines and descriptions, locked for reproducibility.

### 4. Plan and apply as usual

```bash
ads plan    # markers resolved from .gen.json -- no AI calls
ads apply
```

## Documentation

- **[Copy Generation](./copy-generation.md)** -- `ai.rsa()`, `ai.keywords()`, judges, lock files, rerolling
- **[Campaign Multiplication](./campaign-multiplication.md)** -- `expand()`, translation, ICP variations, manifest
- **[Optimization](./optimization.md)** -- `ads optimize`, analysis prompts, `--apply`, `--interactive`
- **[Configuration](./configuration.md)** -- `ads.config.ts` AI block, provider setup, defaults
- **[Architecture](./architecture.md)** -- Module map, pipeline, type system, dependency injection
