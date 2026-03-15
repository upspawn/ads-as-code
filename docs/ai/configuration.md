# Configuration

AI features are configured in the `ai` block of `ads.config.ts`. The block is optional -- projects that don't use AI have no dependency on the AI SDK.

## Provider setup

Install the Vercel AI SDK core package and your preferred provider:

```bash
# Anthropic
bun add ai @ai-sdk/anthropic

# OpenAI
bun add ai @ai-sdk/openai

# Google (Gemini)
bun add ai @ai-sdk/google

# Mistral
bun add ai @ai-sdk/mistral
```

Any [Vercel AI SDK provider](https://sdk.vercel.ai/providers) works.

## Minimal config

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

The `model` field accepts any Vercel AI SDK `LanguageModel`. This single model is used for generation, judging, and optimization unless overridden.

## Full config

```typescript
import { defineConfig } from '@upspawn/ads'
import { anthropic } from '@ai-sdk/anthropic'

export default defineConfig({
  google: { customerId: '123-456-7890' },
  ai: {
    // Primary model for generation
    model: anthropic('claude-sonnet-4-6'),

    // Default judge -- applies to all ai.* markers
    judge: {
      model: anthropic('claude-sonnet-4-6'),  // optional, defaults to ai.model
      prompt: `We are Renamed.to. Our voice is direct, specific, technical
        but approachable. Never sound like generic SaaS marketing.`,
    },

    // Default optimization prompt
    optimize: {
      prompt: `Analyze from Renamed.to's perspective -- a niche AI file renaming
        tool. Flag anything a competitor could claim verbatim.`,
    },
  },
})
```

## Config fields

### `ai.model`

**Required** (when `ai` block is present). The `LanguageModel` instance used for all AI operations.

```typescript
import { anthropic } from '@ai-sdk/anthropic'
model: anthropic('claude-sonnet-4-6')

import { openai } from '@ai-sdk/openai'
model: openai('gpt-4o')

import { google } from '@ai-sdk/google'
model: google('gemini-2.0-flash')
```

### `ai.judge`

**Optional**. Default judge configuration for [copy generation](./copy-generation.md#judges).

| Field | Type | Description |
|---|---|---|
| `model` | `LanguageModel` | Model for judge evaluation. Defaults to `ai.model`. |
| `prompt` | `string` | Brand voice or quality criteria applied to all markers. |

Per-marker judge prompts merge with the default: the config prompt sets the brand voice, per-marker prompts add task-specific criteria.

### `ai.optimize`

**Optional**. Default optimization analysis prompt.

| Field | Type | Description |
|---|---|---|
| `prompt` | `string` | Analysis lens applied when `ads optimize` runs without `--prompt`. |

See [Optimization](./optimization.md) for details.

## Type reference

```typescript
import type { LanguageModel } from 'ai'

type AiConfig = {
  readonly model: LanguageModel
  readonly judge?: AiJudgeConfig
  readonly optimize?: AiOptimizeConfig
}

type AiJudgeConfig = {
  readonly model?: LanguageModel
  readonly prompt: string
}

type AiOptimizeConfig = {
  readonly prompt?: string
}
```

## Scaffolding with `ads init`

```bash
ads init --ai
```

Adds to the standard scaffold:
- `ai` block in `ads.config.ts`
- `prompts/` directory for reusable prompt fragments
- `ads.generate.ts` matrix file (empty, with commented example)

## Environment variables

Provider packages typically read API keys from environment variables:

| Provider | Variable |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

See each provider's documentation for details.
