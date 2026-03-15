# Architecture

Technical reference for the AI generation system. Module map, pipeline, type system, and extension points.

## Module map

```
src/ai/
  types.ts          Marker types: AiMarker, RsaMarker, MetaCopyMarker, KeywordsMarker, InterestsMarker
  markers.ts        ai.rsa(), ai.metaCopy(), ai.keywords(), ai.interests() -- marker constructors
  schemas.ts        Zod schemas for generateObject() -- RSA, keywords, Meta copy
  prompt.ts         Prompt compiler -- merges user prompt + context + platform constraints
  generate.ts       Core generation loop -- prompt -> generateObject() -> result
  judge.ts          Judge pipeline -- evaluate output, reject weak results, retry
  lockfile.ts       Read/write .gen.json files -- slot-based lock file management
  resolve.ts        Google marker resolution -- walk campaigns, replace markers with locked values
  resolve-meta.ts   Meta marker resolution -- same pattern, Meta-specific types
  expand.ts         Campaign multiplication -- expand() function, cross-product logic
  manifest.ts       Read/write .gen-manifest.json -- provenance tracking for expanded campaigns
  codegen-expanded.ts  Code generation for expanded Google campaigns (standalone .ts files)
  codegen-meta.ts   Code generation for expanded Meta campaigns
  optimize.ts       Google campaign optimization -- analysis, suggestions, patch generation
  optimize-meta.ts  Meta campaign optimization
```

```
cli/
  generate.ts       ads generate command -- routes to inline resolution and/or matrix expansion
  optimize.ts       ads optimize command -- routes to optimization pipeline
```

## Pipeline

### Copy generation (inline markers)

```
Campaign file (.ts)
  with ai.* markers
        |
        v
  [ads generate]
        |
   1. Discover campaigns (discovery.ts)
   2. Walk ad groups, find AiMarker instances
   3. For each marker:
      a. Compile prompt (prompt.ts) -- user prompt + keyword context + platform rules
      b. generateObject() via Vercel AI SDK (generate.ts) with Zod schema (schemas.ts)
      c. Judge pipeline (judge.ts) -- evaluate, reject weak, retry (max 3 rounds)
      d. Write slot to .gen.json (lockfile.ts)
        |
        v
  .gen.json lock file
```

### Marker resolution (at plan time)

```
Campaign file (.ts)          .gen.json lock file
  with ai.* markers             with locked values
        |                              |
        v                              v
  [ads plan / ads apply]
        |
   1. discoverCampaigns() -- loads .ts, gets marker objects
   2. resolveMarkers() (resolve.ts / resolve-meta.ts)
      - Walk each campaign's groups
      - Find AiMarker instances (by __brand)
      - Look up slot key in .gen.json
      - Substitute concrete GoogleAd / Keyword[] / MetaAd values
      - Error if any marker has no lock entry
   3. flattenAll() -- campaigns are now pure, no markers
   4. diff() -- compare desired vs actual
```

### Campaign multiplication

```
ads.generate.ts (matrix)        Seed campaign (.ts)
  expand(seed, config)               |
        |                            v
        v                    [resolve markers if any]
  [ads generate]                     |
        |                            v
   1. Load matrix via dynamic import
   2. For each expand() entry:
      a. Load + resolve seed campaign
      b. Compute variants: translate[], vary[], cross products
      c. For each variant:
         - Compile prompt with variant instructions
         - generateObject() or generateText() for full campaign
         - Code-generate standalone .ts file (codegen-expanded.ts / codegen-meta.ts)
      d. Write .gen-manifest.json (manifest.ts)
        |
        v
  generated/*.ts (standalone campaigns)
  generated/.gen-manifest.json
```

## Type system

### Marker types

All markers share a common brand for runtime detection:

```typescript
type AiMarker = { readonly __brand: 'ai-marker' }

type RsaMarker = AiMarker & {
  readonly type: 'rsa'
  readonly prompt: string
  readonly structured?: { product?: string; audience?: string; tone?: string }
  readonly judge?: string
}

type KeywordsMarker = AiMarker & {
  readonly type: 'keywords'
  readonly prompt: string
}

type MetaCopyMarker = AiMarker & {
  readonly type: 'meta-copy'
  readonly prompt: string
  readonly judge?: string
}

type InterestsMarker = AiMarker & {
  readonly type: 'interests'
  readonly prompt: string
}
```

### AdGroupInput widening

The `AdGroupInput` type accepts both concrete values and markers:

```typescript
type AdGroupInput = {
  readonly keywords: readonly Keyword[] | KeywordsMarker | readonly (Keyword | KeywordsMarker)[]
  readonly ad: GoogleAd | RsaMarker
  readonly status?: 'enabled' | 'paused'
}
```

This lets campaign files mix hand-written and AI-generated content at the type level. After resolution, all markers are replaced with concrete types, producing a standard `GoogleAdGroup`.

### Zod schemas

The generation system uses Vercel AI SDK's `generateObject()` with Zod schemas to ensure structurally valid output:

```typescript
// RSA schema
const rsaSchema = z.object({
  headlines: z.array(z.string().max(30)).min(3).max(15),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
})

// Keyword schema
const keywordsSchema = z.object({
  keywords: z.array(z.object({
    text: z.string(),
    match: z.enum(['exact', 'phrase', 'broad']),
  })),
})
```

`generateObject()` handles structural correctness (character limits, array bounds). The judge handles creative quality. These are separate concerns.

`generateText()` is used only for the optimization CLI, where output is free-form analysis.

## Slot key format

Lock file slot keys use `{group-key}.{field}`:

```
.group('dropbox-automation-en', { ad: ai.rsa(...) })
  -> slot key: "dropbox-automation-en.ad"

.group('dropbox-automation-en', { keywords: ai.keywords(...) })
  -> slot key: "dropbox-automation-en.keywords"
```

Group keys come from the `.group()` / `.locale()` call -- they are stable, user-defined identifiers.

## Dependency injection

The `generate.ts` module accepts a `generateObjectFn` parameter for testing:

```typescript
async function generateSlot(
  marker: AiMarker,
  context: GenerationContext,
  generateObjectFn = generateObject,  // from Vercel AI SDK
): Promise<SlotResult> { ... }
```

This lets tests provide a fake that returns deterministic results without making API calls. The same pattern applies to `generateText()` in the optimization pipeline.

## Error handling

### API failures

- **Network/auth errors**: Report and exit. No partial writes -- generation is atomic per slot.
- **Rate limits**: Retry with exponential backoff (max 3 retries, 1s/2s/4s delays). If still rate-limited, report and exit.
- **Partial campaign failure**: If a campaign has 3 slots and 2 succeed, the 2 successful slots are written. The failed slot is reported. Next run picks up where it left off (existing slots are skipped unless `--reroll`).

### Unresolved markers

`resolveMarkers()` throws if any marker has no corresponding lock entry. This is a hard error in `ads plan` and `ads apply` -- it prevents deploying campaigns with missing content.

### Staleness

Staleness is a **warning**, not an error. The lock file's prompt snapshot is compared against the current compiled prompt. A mismatch means the prompt changed since the last generate. Old values still work; regeneration is the user's choice.

## Cost controls

- **`ads generate --dry-run`** -- Shows what would be generated (slot count, estimated API calls) without making calls.
- **Confirmation prompt** -- When generating more than 10 slots, asks for confirmation. `--yes` skips it.
- **Token reporting** -- After generation, reports total tokens used and estimated cost.
- **No automatic regeneration** -- `ads plan` and `ads validate` warn about staleness but never trigger AI calls.
