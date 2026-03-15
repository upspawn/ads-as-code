# AI-Powered Campaign Generation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered copy generation, campaign multiplication, and optimization to ads-as-code using Vercel AI SDK.

**Architecture:** AI is a pre-step — `ai.*` markers in campaign files get resolved into `.gen.json` lock files by `ads generate`. The plan/apply pipeline reads resolved values and never calls AI itself. Campaign multiplication produces standalone `.ts` files. Optimization analyzes campaigns and outputs suggestions.

**Tech Stack:** Bun, TypeScript (strict), Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Zod, bun:test

**Spec:** `docs/superpowers/specs/2026-03-15-ai-generation-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/ai/types.ts` | AI marker types (`RsaMarker`, `KeywordsMarker`), `AiConfig` type |
| `src/ai/markers.ts` | `ai.rsa()` and `ai.keywords()` factory functions that return marker objects |
| `src/ai/prompt.ts` | Prompt compiler — structured fields → prompt string, context injection |
| `src/ai/schemas.ts` | Zod schemas for `generateObject()` — RSA schema, keywords schema |
| `src/ai/lockfile.ts` | Read/write `.gen.json` lock files |
| `src/ai/generate.ts` | Core generation — call Vercel AI SDK, handle retries, write lock files |
| `src/ai/judge.ts` | Judge pipeline — evaluate AI output, retry weak items |
| `src/ai/resolve.ts` | `resolveMarkers()` — replace markers with locked values before flatten |
| `src/ai/expand.ts` | `expand()` function for campaign multiplication matrix |
| `src/ai/manifest.ts` | Read/write `.gen-manifest.json` for generated campaigns |
| `src/ai/codegen-expanded.ts` | Generate TypeScript campaign files from AI-expanded campaigns |
| `src/ai/optimize.ts` | Optimization analysis — build prompt from campaign, parse AI response |
| `src/ai/index.ts` | Public `ai` namespace export |
| `cli/generate.ts` | `ads generate` command — flag parsing, orchestration, output |
| `cli/optimize.ts` | `ads optimize` command — flag parsing, orchestration, output |
| `test/unit/ai-markers.test.ts` | Tests for marker factories |
| `test/unit/ai-prompt.test.ts` | Tests for prompt compilation |
| `test/unit/ai-lockfile.test.ts` | Tests for lock file read/write |
| `test/unit/ai-resolve.test.ts` | Tests for marker resolution |
| `test/unit/ai-generate.test.ts` | Tests for generation pipeline (with mocked AI SDK) |
| `test/unit/ai-judge.test.ts` | Tests for judge pipeline |
| `test/unit/ai-expand.test.ts` | Tests for campaign multiplication |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/core/types.ts` | Add `ai?` field to existing `AdsConfig` (preserve the existing `cache?: string` type as-is — do NOT change it to `CacheConfig`). Import `AiConfig` from `../ai/types.ts`. |
| `src/google/types.ts` | Widen `AdGroupInput.ad` to accept `RsaMarker`. Widen `AdGroupInput.keywords` to accept `KeywordsMarker` (bare or in array). Add `GoogleAdGroupUnresolved` type that allows markers in ads/keywords (keep `GoogleAdGroup` strict for flatten). |
| `src/google/index.ts` | Update `normalizeAdGroup()` to return `GoogleAdGroupUnresolved` when markers are present. `resolveMarkers()` later converts to strict `GoogleAdGroup`. |
| `package.json` | Add `ai`, `@ai-sdk/anthropic`, `zod` dependencies. Add `"./ai": "./src/ai/index.ts"` to exports. |
| `src/core/discovery.ts` | Add `discoverGeneratedCampaigns()` scanning `generated/**/*.ts`. Add `loadGenerateMatrix()` for `ads.generate.ts`. |
| `src/index.ts` | Re-export `ai` namespace and new AI types. |
| `cli/index.ts` | Add `generate` and `optimize` command routes. |
| `cli/plan.ts` | Insert `resolveMarkers()` step between discovery and flatten. |
| `cli/validate.ts` | Add warnings for unresolved markers, stale lock files, stale generated files. |

---

## Chunk 1: Foundation — Types, Markers, Lock Files

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vercel AI SDK, Anthropic provider, and Zod**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun add ai @ai-sdk/anthropic zod`

- [ ] **Step 2: Add `./ai` export path to package.json**

Add `"./ai": "./src/ai/index.ts"` to the `exports` field in `package.json` so that `import { expand } from '@upspawn/ads/ai'` works in `ads.generate.ts` files.

- [ ] **Step 3: Verify installation**

Run: `bun run typecheck`
Expected: PASS (no new type errors — packages installed but not yet used)

- [ ] **Step 4: Commit**

```
git add package.json bun.lock
git commit -m "chore: add ai sdk, anthropic provider, and zod dependencies"
```

---

### Task 2: AI Marker Types

**Files:**
- Create: `src/ai/types.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: Write tests for marker type guards**

Create `test/unit/ai-markers.test.ts`. Test that:
- `isAiMarker()` returns true for objects with `__brand: 'ai-marker'`, false for plain objects and RSAd objects
- `isRsaMarker()` correctly identifies RSA markers vs concrete ads
- `isKeywordsMarker()` correctly identifies keywords markers vs keyword arrays

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-markers.test.ts`
Expected: FAIL — module `src/ai/types.ts` not found

- [ ] **Step 3: Implement AI marker types and type guards**

Create `src/ai/types.ts` with:
- `AiMarker` base type (branded with `__brand: 'ai-marker'`)
- `RsaMarker` extending `AiMarker` with `type: 'rsa'`, `prompt`, optional `structured`, optional `judge`
- `KeywordsMarker` extending `AiMarker` with `type: 'keywords'`, `prompt`
- `isAiMarker()`, `isRsaMarker()`, `isKeywordsMarker()` type guards
- `AiConfig`, `AiJudgeConfig`, `AiOptimizeConfig` types (using `LanguageModel` from `'ai'`)

Reference the spec's Type System Changes section for exact shapes.

- [ ] **Step 4: Add `ai?` field to `AdsConfig`**

Modify `src/core/types.ts:137-141` — add `readonly ai?: AiConfig` to the `AdsConfig` type. Import `AiConfig` from `../ai/types.ts` using a type-only import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/unit/ai-markers.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite and typecheck**

Run: `bun test && bun run typecheck`
Expected: PASS (no regressions)

- [ ] **Step 7: Commit**

```
git add src/ai/types.ts src/core/types.ts test/unit/ai-markers.test.ts
git commit -m "feat(ai): add marker types and AiConfig"
```

---

### Task 3: Marker Factory Functions

**Files:**
- Create: `src/ai/markers.ts`
- Create: `src/ai/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add tests for `ai.rsa()` and `ai.keywords()` factories**

Add to `test/unit/ai-markers.test.ts`:
- `ai.rsa('some prompt')` returns a valid `RsaMarker` with `__brand`, `type: 'rsa'`, and the prompt string
- `ai.rsa({ product: 'X', audience: 'Y', tone: 'Z' })` returns a marker with the structured fields stored
- `ai.rsa({ product: 'X', prompt: 'extra', judge: 'be strict' })` stores all three
- `ai.keywords('some prompt')` returns a valid `KeywordsMarker`
- Markers pass `isAiMarker()` checks

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-markers.test.ts`
Expected: FAIL — `ai.rsa` not defined

- [ ] **Step 3: Implement marker factories**

Create `src/ai/markers.ts`:
- `rsaMarker()` — accepts string (raw prompt) or object (structured/mixed). Returns frozen `RsaMarker` object.
- `keywordsMarker()` — accepts string prompt. Returns frozen `KeywordsMarker` object.

Create `src/ai/index.ts`:
- Export the `ai` namespace object: `{ rsa: rsaMarker, keywords: keywordsMarker }`
- Re-export types from `./types.ts`

- [ ] **Step 4: Export `ai` from the public SDK surface**

Modify `src/index.ts` — add: `export { ai } from './ai/index.ts'` and export the AI types.

- [ ] **Step 5: Run tests**

Run: `bun test test/unit/ai-markers.test.ts`
Expected: PASS

- [ ] **Step 6: Run full suite + typecheck**

Run: `bun test && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add src/ai/markers.ts src/ai/index.ts src/index.ts test/unit/ai-markers.test.ts
git commit -m "feat(ai): add ai.rsa() and ai.keywords() marker factories"
```

---

### Task 4: Widen AdGroupInput to Accept Markers

**Files:**
- Modify: `src/google/types.ts:104-110`
- Modify: `src/google/index.ts:46-58`

- [ ] **Step 1: Add tests for marker passthrough in `normalizeAdGroup`**

Add to `test/unit/ai-markers.test.ts` (or a new section in `test/unit/builder.test.ts`):
- Building a campaign with `ai.rsa()` as the ad doesn't throw
- Building a campaign with `ai.keywords()` in the keywords array doesn't throw
- The resulting campaign object contains the marker objects in the correct positions

The expected DX:

```typescript
import { ai, google, daily, phrase } from '@upspawn/ads'

const campaign = google.search('Test', {
  budget: daily(1),
  bidding: 'maximize-clicks',
})
  .group('test-group', {
    keywords: [
      ...phrase('test keyword'),
      ai.keywords('more keywords about testing'),
    ],
    ad: ai.rsa('Generate ads for a testing tool'),
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/ai-markers.test.ts`
Expected: FAIL — type error, `AdGroupInput.ad` doesn't accept `RsaMarker`

- [ ] **Step 3: Widen AdGroupInput types and add unresolved group type**

Modify `src/google/types.ts`:
- Import `RsaMarker`, `KeywordsMarker` from `../ai/types.ts`
- Change `AdGroupInput.ad` to `GoogleAd | GoogleAd[] | RsaMarker`
- Change `AdGroupInput.keywords` to `Keyword[] | KeywordsMarker | readonly (Keyword | KeywordsMarker)[]` (allows bare marker, array of keywords, or mixed array)
- Add `GoogleAdGroupUnresolved` type — same as `GoogleAdGroup` but `ads` accepts `(GoogleAd | RsaMarker)[]` and `keywords` accepts `(Keyword | KeywordsMarker)[]`. Keep `GoogleAdGroup` unchanged (strict types for flatten).
- Add `GoogleSearchCampaignUnresolved` type — same as `GoogleSearchCampaign` but `groups` values are `GoogleAdGroupUnresolved`. Keep `GoogleSearchCampaign` unchanged.
- Update `CampaignBuilder` to extend `GoogleSearchCampaignUnresolved` instead of `GoogleSearchCampaign`. This allows `.group()` to accept `AdGroupInput` with markers. After `resolveMarkers()`, the campaign becomes a strict `GoogleSearchCampaign`.

- [ ] **Step 4: Update normalizeAdGroup to handle markers**

Modify `src/google/index.ts:normalizeAdGroup()`:
- Change return type to `GoogleAdGroupUnresolved`
- When `input.ad` is an `RsaMarker` (check with `isRsaMarker()`), store it as-is in the ads array
- When `input.keywords` is a bare `KeywordsMarker`, store it in an array as-is
- When `input.keywords` is a mixed array, pass through as-is
- The `createBuilder` and `google.search` return type becomes `CampaignBuilder` which internally uses `GoogleSearchCampaignUnresolved`. After `resolveMarkers()` converts all markers to concrete values, the campaign becomes a strict `GoogleSearchCampaign` that `flatten()` can process.
- The key constraint: `flatten()` must never see markers. Resolution happens before flatten.

- [ ] **Step 5: Run tests**

Run: `bun test`
Expected: PASS (all existing tests still pass, new marker tests pass)

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add src/google/types.ts src/google/index.ts test/unit/ai-markers.test.ts
git commit -m "feat(ai): widen AdGroupInput to accept AI markers"
```

---

### Task 5: Lock File Read/Write

**Files:**
- Create: `src/ai/lockfile.ts`
- Create: `test/unit/ai-lockfile.test.ts`

- [ ] **Step 1: Write tests for lock file operations**

Create `test/unit/ai-lockfile.test.ts`. Test:
- `writeLockFile(path, data)` writes valid JSON to `{campaign-name}.gen.json`
- `readLockFile(campaignPath)` reads and parses the companion `.gen.json`
- `readLockFile()` returns `null` when no lock file exists
- Round-trip: write then read returns identical data
- `getSlot(lockfile, 'group-key.ad')` returns the slot data
- `setSlot(lockfile, 'group-key.ad', result)` updates a specific slot
- Pin/unpin operations modify the `pinned` array in a slot

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-lockfile.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lock file module**

Create `src/ai/lockfile.ts`:
- `LockFile` type matching the spec's `.gen.json` shape (version, model, generatedAt, slots)
- `LockSlot` type (prompt, judge, result, pinned, round, optional judgeWarning)
- `readLockFile(campaignFilePath: string): Promise<LockFile | null>` — derives `.gen.json` path from campaign file path (replace `.ts` with `.gen.json`), reads with `Bun.file()`, returns parsed or null
- `writeLockFile(campaignFilePath: string, lockFile: LockFile): Promise<void>` — writes formatted JSON
- `getSlot(lockFile: LockFile, key: string): LockSlot | undefined`
- `setSlot(lockFile: LockFile, key: string, slot: LockSlot): LockFile` — returns new lockfile (immutable)
- `pinValue(lockFile: LockFile, slotKey: string, index: number): LockFile`
- `unpinValue(lockFile: LockFile, slotKey: string, index: number): LockFile`

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-lockfile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/lockfile.ts test/unit/ai-lockfile.test.ts
git commit -m "feat(ai): lock file read/write for .gen.json"
```

---

## Chunk 2: Prompt Compiler and Generation

### Task 6: Prompt Compiler

**Files:**
- Create: `src/ai/prompt.ts`
- Create: `test/unit/ai-prompt.test.ts`

- [ ] **Step 1: Write tests for prompt compilation**

Create `test/unit/ai-prompt.test.ts`. Test:
- Raw string prompt passes through unchanged (minus whitespace normalization)
- Structured input `{ product: 'X', audience: 'Y', tone: 'Z' }` compiles to a prompt string containing all three fields
- Mixed input `{ product: 'X', prompt: 'extra instructions' }` merges both
- Context injection: given a group with keywords `['automate dropbox', 'bulk rename']`, the compiled prompt includes those keywords
- Context injection: the compiled prompt includes Google Ads constraints (headline ≤30 chars, etc.)
- Campaign name is included in context when provided
- Empty/undefined fields are skipped

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-prompt.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement prompt compiler**

Create `src/ai/prompt.ts`:
- `compileRsaPrompt(marker: RsaMarker, context: PromptContext): string` — takes a marker and campaign/group context, returns a complete prompt string
- `PromptContext` type: `{ campaignName?: string, groupKey?: string, keywords?: Keyword[], defaultJudge?: string }`
- For raw string markers: append context
- For structured markers: build a prompt from fields, then append context
- For mixed: merge structured + raw prompt + context
- Context template includes: the group's keywords (formatted), Google Ads RSA constraints, campaign/group names
- `compileKeywordsPrompt(marker: KeywordsMarker, context: PromptContext): string` — similar but with keyword-specific constraints (include match type guidance)
- `compileJudgePrompt(marker: RsaMarker | KeywordsMarker, defaultJudge?: string): string | undefined` — merges local judge with global default

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/prompt.ts test/unit/ai-prompt.test.ts
git commit -m "feat(ai): prompt compiler with context injection"
```

---

### Task 7: Zod Schemas

**Files:**
- Create: `src/ai/schemas.ts`

- [ ] **Step 1: Write tests for schema validation**

Add to `test/unit/ai-prompt.test.ts` (or a new `test/unit/ai-schemas.test.ts`):
- RSA schema accepts valid output (3-15 headlines ≤30 chars, 2-4 descriptions ≤90 chars)
- RSA schema rejects: headline >30 chars, <3 headlines, >15 headlines, description >90 chars, <2 descriptions, >4 descriptions
- Keywords schema accepts valid output (array of `{text, match}` objects)
- Keywords schema rejects: invalid match type, missing text

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-schemas.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Zod schemas**

Create `src/ai/schemas.ts`:
- `rsaSchema` — validates an object with `headlines` (array of strings, each max 30 chars, 3-15 items) and `descriptions` (array of strings, each max 90 chars, 2-4 items). Uses Zod's `z.object`, `z.array`, `z.string().max()`, `.min()`, `.max()` chain.
- `keywordsSchema` — validates an object with `keywords` array, where each item has `text` (string) and `match` (enum: exact/phrase/broad).
- Export both schemas for use in the generation module

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/schemas.ts test/unit/ai-schemas.test.ts
git commit -m "feat(ai): zod schemas for structured AI output"
```

---

### Task 8: Core Generation Pipeline

**Files:**
- Create: `src/ai/generate.ts`
- Create: `test/unit/ai-generate.test.ts`

- [ ] **Step 1: Write tests for generation pipeline**

Create `test/unit/ai-generate.test.ts`. Mock the Vercel AI SDK's `generateObject` function to return canned responses. Test:
- `generateSlot()` calls `generateObject` with the compiled prompt and RSA schema
- The result is written to the lock file in the correct slot
- Already-locked slots are skipped (unless reroll flag is set)
- Pinned values in the slot survive regeneration — the prompt tells AI which values to keep
- Token usage is tracked and returned
- Network errors are caught, reported, and don't write partial results
- Rate limit errors trigger exponential backoff retry (mock the timing)
- `generateForCampaign()` processes all `ai.*` markers in a campaign, calling `generateSlot()` for each

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-generate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement generation pipeline**

Create `src/ai/generate.ts`:
- `GenerateOptions` type: `{ reroll?: string, model: LanguageModel, dryRun?: boolean, yes?: boolean }`
- `GenerateResult` type: `{ slotsGenerated: number, slotsSkipped: number, totalInputTokens: number, totalOutputTokens: number }`
- `generateSlot(model, prompt, schema, existingSlot?, pinned?)` — single AI call, handles retries with exponential backoff, returns generated values + token usage
- `generateForCampaign(campaignPath, campaign, config, options)`:
  1. Walk the campaign's groups, find all markers (using `isRsaMarker`, `isKeywordsMarker`)
  2. Read existing lock file (if any)
  3. For each marker, determine the slot key (`{groupKey}.ad` or `{groupKey}.keywords`)
  4. Skip if already locked and not rerolling
  5. Compile prompt using `compileRsaPrompt` / `compileKeywordsPrompt` with context from the group
  6. Call `generateSlot()`
  7. Write updated lock file
  8. Return result summary
- `generateAll(rootDir, config, options)` — discover campaigns, process each, return aggregate results

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-generate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/generate.ts test/unit/ai-generate.test.ts
git commit -m "feat(ai): core generation pipeline with retry and lock files"
```

---

### Task 9: `ads generate` CLI Command

**Files:**
- Create: `cli/generate.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1: Implement the CLI command**

Create `cli/generate.ts`:
- Parse flags: `--dry-run`, `--reroll [slot]`, `--pin <slot>`, `--unpin <slot>`, `--seed <path>`, `--filter <glob>`, `--yes`
- Load config, check `config.ai` exists (error if not: `"No AI config in ads.config.ts. Add an 'ai' field with your model."`)
- If positional arg given (campaign path): generate for that one campaign
- Otherwise: generate for all campaigns
- If `--dry-run`: scan markers, report what would be generated, exit
- If `--pin` / `--unpin`: modify lock file directly, exit
- If `>10 slots` and no `--yes`: prompt for confirmation
- After generation: print summary with token counts

Expected DX:

```bash
$ ads generate campaigns/search-dropbox.ts

  Generating search-dropbox/dropbox-automation-en.ad... done
  Generating search-dropbox/dropbox-automation-en.keywords... done

  Generated 2 slots in 1 campaign
  Tokens: 8,420 input / 2,130 output (~$0.05)

$ ads generate campaigns/search-dropbox.ts --reroll dropbox-automation-en.ad.headlines[2]

  Rerolling search-dropbox/dropbox-automation-en.ad.headlines[2]... done
  (pinned: [0, 3] preserved)

$ ads generate --dry-run

  Would generate:
    search-dropbox/dropbox-automation-en.ad (RSA)
    search-dropbox/dropbox-automation-en.keywords (keywords)
    search-pdf-renaming/pdf-en.ad (RSA)
  3 slots across 2 campaigns
```

- [ ] **Step 2: Add route in cli/index.ts**

Modify `cli/index.ts`: add `case 'generate':` that imports and calls `runGenerate` from `./generate.ts`. Update the USAGE string to include the `generate` command.

- [ ] **Step 3: Test manually**

Create a test campaign file with `ai.rsa()` marker. Run `ads generate --dry-run` to verify it detects the marker and reports correctly. (Requires a real `ads.config.ts` with an AI provider configured.)

- [ ] **Step 4: Commit**

```
git add cli/generate.ts cli/index.ts
git commit -m "feat(ai): ads generate CLI command"
```

---

## Chunk 3: Judge Pipeline and Plan Integration

### Task 10: Judge Pipeline

**Files:**
- Create: `src/ai/judge.ts`
- Create: `test/unit/ai-judge.test.ts`

- [ ] **Step 1: Write tests for judge pipeline**

Create `test/unit/ai-judge.test.ts`. Mock `generateObject`/`generateText`. Test:
- When no judge is configured, generation result passes through unchanged
- When judge approves all items, result is returned as-is
- When judge rejects items, those items are regenerated (verify second AI call is made with remaining context)
- Pinned items are never sent to the judge for evaluation
- After 3 rounds of rejection, the best attempt is returned with `judgeWarning` flag
- Judge prompt merges global default (from config) with local judge (from marker) — local appended after global
- Judge receives the generated items + the original prompt context for evaluation

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-judge.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement judge pipeline**

Create `src/ai/judge.ts`:
- `JudgeResult` type: `{ approved: boolean, itemScores: { index: number, score: number, reason: string }[] }`
- `judgeSchema` — Zod schema for the judge's structured response
- `evaluateWithJudge(model, judgePrompt, generatedItems, context)` — calls AI to evaluate each item, returns scores
- `runJudgePipeline(model, generateFn, judgePrompt, pinned, maxRounds)`:
  1. Generate initial output via `generateFn`
  2. If no judge prompt, return immediately
  3. Evaluate with judge
  4. For rejected items (below score threshold): regenerate with context "replace these, keep the approved ones"
  5. Repeat up to `maxRounds` (default 3)
  6. If still not fully approved after max rounds, return best attempt with `judgeWarning`

- [ ] **Step 4: Integrate judge into `generateSlot()` in `src/ai/generate.ts`**

Modify `src/ai/generate.ts:generateSlot()` — if a judge prompt exists (from marker or config), wrap the generation call in `runJudgePipeline()`.

- [ ] **Step 5: Run tests**

Run: `bun test test/unit/ai-judge.test.ts && bun test test/unit/ai-generate.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add src/ai/judge.ts test/unit/ai-judge.test.ts src/ai/generate.ts
git commit -m "feat(ai): judge pipeline with multi-round evaluation"
```

---

### Task 11: Marker Resolution for Plan Integration

**Files:**
- Create: `src/ai/resolve.ts`
- Create: `test/unit/ai-resolve.test.ts`
- Modify: `cli/plan.ts`

- [ ] **Step 1: Write tests for marker resolution**

Create `test/unit/ai-resolve.test.ts`. Test:
- Given a campaign with an `RsaMarker` in a group's ad field and a lock file with the matching slot, `resolveMarkers()` returns a campaign with the marker replaced by a concrete `RSAd` object
- Given a campaign with a `KeywordsMarker` and a lock file, the marker is replaced by concrete `Keyword[]` values
- Mixed arrays (concrete keywords + KeywordsMarker) resolve correctly — concrete values stay, markers expand
- When a marker has no matching slot in the lock file, `resolveMarkers()` throws an error with a clear message naming the campaign, group, and field
- A campaign with no markers passes through unchanged
- Verify the resolved campaign is a valid `GoogleSearchCampaign` that can be flattened without errors

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-resolve.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement resolveMarkers**

Create `src/ai/resolve.ts`:
- `resolveMarkers(campaign: GoogleSearchCampaignUnresolved, lockFile: LockFile | null): GoogleSearchCampaign`
  1. Walk `campaign.groups`
  2. For each group, check `ad` field — if `isRsaMarker()`, look up `{groupKey}.ad` in lock file, substitute concrete `RSAd` built from locked headlines/descriptions
  3. For each group, check `keywords` array — for each `KeywordsMarker`, look up `{groupKey}.keywords` in lock file, substitute concrete `Keyword[]`
  4. Return new campaign with all markers resolved
  5. If any marker is unresolved, throw `AdsError` with type `'validation'` and a clear message
- `resolveAllMarkers(campaigns: DiscoveredCampaign[]): Promise<GoogleSearchCampaign[]>`
  1. For each campaign, cast `.campaign` to `GoogleSearchCampaignUnresolved` (the type after builder evaluation with markers)
  2. Read the companion `.gen.json`
  3. Call `resolveMarkers()` on each — returns strict `GoogleSearchCampaign`
  4. Return resolved campaigns

- [ ] **Step 4: Integrate into cli/plan.ts**

Modify `cli/plan.ts:runPlan()`:
- After `discoverCampaigns()` (line ~170), before `flattenAll()` (line ~189)
- Import `resolveAllMarkers` from `../src/ai/resolve.ts`
- Call `resolveAllMarkers()` on the discovered campaigns
- Use the resolved campaigns for flatten instead of raw campaign objects
- Also discover campaigns from `generated/**/*.ts` and include them

The pipeline becomes:
```
discover campaigns/ → resolve markers → discover generated/ → combine → flatten → diff
```

- [ ] **Step 5: Run tests**

Run: `bun test test/unit/ai-resolve.test.ts`
Expected: PASS

- [ ] **Step 6: Run full suite**

Run: `bun test`
Expected: PASS (plan tests still pass — no markers in existing test fixtures means resolution is a no-op)

- [ ] **Step 7: Commit**

```
git add src/ai/resolve.ts test/unit/ai-resolve.test.ts cli/plan.ts
git commit -m "feat(ai): marker resolution in plan pipeline"
```

---

## Chunk 4: Campaign Multiplication

### Task 12: Expand Function and Manifest

**Files:**
- Create: `src/ai/expand.ts`
- Create: `src/ai/manifest.ts`
- Create: `test/unit/ai-expand.test.ts`

- [ ] **Step 1: Write tests for expansion logic**

Create `test/unit/ai-expand.test.ts`. Test:
- `computeExpansionTargets()` with `translate: ['de', 'fr']` produces 2 targets: `{translate: 'de'}`, `{translate: 'fr'}`
- With `vary: [{name: 'smb', ...}]` produces 1 target: `{vary: 'smb'}`
- With `translate: ['de'], vary: [{name: 'smb', ...}], cross: true` produces 3 targets: de, smb, smb.de (2 base + 1 cross)
- With `cross: false` produces 2 targets: de, smb (no cross product)
- Output file names follow the convention: `{seed-slug}.{variant}.ts` (e.g., `search-dropbox.de.ts`, `search-dropbox.smb.de.ts`)
- Manifest is correctly structured with seed path, transform, model, timestamp, round

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-expand.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement expansion target computation**

Create `src/ai/expand.ts`:
- `ExpandConfig` type: `{ translate?: string[], vary?: { name: string, prompt: string }[], judge?: string, cross?: boolean }`
- `ExpansionTarget` type: `{ fileName: string, translate?: string, vary?: { name: string, prompt: string }, prompt: string }`
- `expand(seedPath: string, config: ExpandConfig)` — returns the config object for the generation matrix (used in `ads.generate.ts`)
- `computeExpansionTargets(seedSlug: string, config: ExpandConfig): ExpansionTarget[]` — computes the full list of targets based on cross product logic
- `generateExpandedCampaign(model, seedCampaign, target, judgePrompt?)` — calls AI to produce a transformed campaign (translate or vary). Uses `generateObject` with a schema matching the campaign structure (keywords as strings + match types, headlines, descriptions, targeting adjustments)
- `writeExpandedCampaignFile(outputDir, fileName, campaignCode)` — writes the generated TypeScript file

- [ ] **Step 4: Implement manifest**

Create `src/ai/manifest.ts`:
- `Manifest` type matching the spec's `.gen-manifest.json` shape
- `readManifest(generatedDir: string): Promise<Manifest | null>`
- `writeManifest(generatedDir: string, manifest: Manifest): Promise<void>`
- `updateManifestEntry(manifest, fileName, entry)` — immutable update

- [ ] **Step 5: Run tests**

Run: `bun test test/unit/ai-expand.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add src/ai/expand.ts src/ai/manifest.ts test/unit/ai-expand.test.ts
git commit -m "feat(ai): campaign multiplication with expand()"
```

---

### Task 13: Codegen for Expanded Campaigns

**Files:**
- Create: `src/ai/codegen-expanded.ts`

- [ ] **Step 1: Write tests for expanded campaign codegen**

Add to `test/unit/ai-expand.test.ts`:
- Given a translated campaign result (AI output with German keywords, headlines, descriptions, adjusted targeting), `generateExpandedCode()` produces valid TypeScript that imports from `@upspawn/ads` and uses the standard helpers
- The generated code is a standalone campaign file — no imports from the seed, no AI markers
- Campaign name is suffixed with the variant (e.g., `'Search - Dropbox [DE]'`)
- Targeting includes the appropriate geo/language for translations

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-expand.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement expanded campaign codegen**

Create `src/ai/codegen-expanded.ts`:
- Reuse patterns from `src/core/codegen.ts` (same `formatBudget`, `formatBidding`, `formatTargeting` helpers — consider extracting shared helpers into a common module or importing from codegen)
- `generateExpandedCode(seedCampaign, aiResult, variantSuffix)` — produces TypeScript source string
- The output looks like hand-written campaign code (using `google.search()`, `.group()`, helpers, etc.)

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-expand.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/codegen-expanded.ts test/unit/ai-expand.test.ts
git commit -m "feat(ai): codegen for expanded campaign files"
```

---

### Task 14: Wire Expansion into `ads generate`

**Files:**
- Modify: `cli/generate.ts`
- Modify: `src/core/discovery.ts`

- [ ] **Step 1: Add generation matrix discovery**

Modify `src/core/discovery.ts`:
- Add `loadGenerateMatrix(rootDir: string)` — loads `ads.generate.ts` from the project root via dynamic import, returns the default export (array of expand configs) or null if file doesn't exist
- Add `discoverGeneratedCampaigns(rootDir: string)` — scans `generated/**/*.ts` using the same pattern as `discoverCampaigns` but in the `generated/` directory

- [ ] **Step 2: Update `ads generate` to process the matrix**

Modify `cli/generate.ts`:
- After processing inline markers, check for `ads.generate.ts`
- If found, load the matrix via `loadGenerateMatrix()`
- For each `expand()` entry: load the seed campaign, compute expansion targets, generate each target, write files to `generated/`, update manifest
- If `--reroll` targets a file in `generated/`: re-expand that specific target
- If `--seed <path>`: re-expand all targets derived from that seed
- If `--filter <glob>`: only process matching generated files
- Report results alongside inline generation results

- [ ] **Step 3: Test manually**

Create a test `ads.generate.ts` with one expand entry. Run `ads generate --dry-run` to verify it reports the expansion targets.

- [ ] **Step 4: Run full suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add cli/generate.ts src/core/discovery.ts
git commit -m "feat(ai): wire campaign multiplication into ads generate"
```

---

## Chunk 5: Optimization CLI

### Task 15: Optimization Engine

**Files:**
- Create: `src/ai/optimize.ts`

- [ ] **Step 1: Write tests for optimization analysis**

Create `test/unit/ai-optimize.test.ts`. Mock `generateText`. Test:
- Given a campaign, `buildOptimizePrompt()` produces a prompt that includes campaign name, all keywords, all ad copy, budget, bidding strategy
- The default analysis prompt includes guidance for keyword↔copy alignment, negative gaps, ad quality
- A custom `--prompt` overrides/supplements the default
- The config-level `optimize.prompt` is included when present
- `parseOptimizeResponse()` extracts structured suggestions from the AI's free-form text response
- Cross-campaign mode includes keyword overlap analysis in the prompt

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/unit/ai-optimize.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement optimization engine**

Create `src/ai/optimize.ts`:
- `buildOptimizePrompt(campaigns, customPrompt?, configPrompt?)` — builds the analysis prompt including all campaign data in a structured format
- `analyzeWithAI(model, prompt)` — calls `generateText()` (free-form output for analysis)
- `Suggestion` type: `{ type: 'keyword-alignment' | 'missing-keyword' | 'negative-gap' | 'copy-quality' | 'structure', campaign: string, group?: string, message: string, suggestion?: string, severity: 'info' | 'warning' }`
- `parseOptimizeResponse(text: string): Suggestion[]` — parses AI response into structured suggestions (AI is prompted to use a parseable format with markers)
- `formatSuggestions(suggestions: Suggestion[]): string` — formats for terminal output with colors/symbols
- `buildCrossAnalysisPrompt(campaigns)` — for `--all` mode, builds a separate prompt section that includes all campaigns' keywords side by side for cannibalization detection, lists which markets/languages are covered for gap analysis, and compares budget allocation across campaigns

- [ ] **Step 4: Run tests**

Run: `bun test test/unit/ai-optimize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/ai/optimize.ts test/unit/ai-optimize.test.ts
git commit -m "feat(ai): optimization analysis engine"
```

---

### Task 16: `ads optimize` CLI Command

**Files:**
- Create: `cli/optimize.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1: Implement the CLI command**

Create `cli/optimize.ts`:
- Parse flags: positional path (campaign file or directory), `--all`, `--prompt "..."`, `--interactive`, `--apply`, `--patch`
- Load config, resolve AI model
- Load and resolve campaigns (use `resolveMarkers` so optimization sees concrete copy)
- For `--all`: load all campaigns (including `generated/`)
- Call `buildOptimizePrompt()` and `analyzeWithAI()`
- Format and print suggestions

Expected DX:

```bash
$ ads optimize campaigns/search-dropbox.ts

  ━━ search-dropbox ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Keywords → Copy Alignment
    ⚠ "bulk rename dropbox" (phrase) — no headline mentions "bulk"
      → Add headline: "Batch Rename Dropbox Files Instantly"

    Negative Gaps
    - No negatives for "dropbox pricing" — wastes budget on comparison shoppers

    Ad Copy
    ✓ Headlines 1, 2, 4 — specific, good keyword echo
    ⚠ Headline 3 "Cloud File Management" — generic
      → Replace with: "AI Renames Your Dropbox PDFs"

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    2 suggestions · 1 warning · 3 good
    Tokens: 4,200 input / 1,800 output (~$0.03)
```

- [ ] **Step 2: Implement `--interactive` mode**

When `--interactive` is passed:
- Present each suggestion one at a time with "Accept / Skip / Edit" prompts (use `process.stdin` for input)
- Accepted suggestions are collected into an action list
- At the end, apply all accepted actions (append keywords, add negatives via simple string insertion at the end of arrays in the campaign file)

- [ ] **Step 3: Implement `--apply` mode**

When `--apply` is passed:
- Auto-accept all suggestions that can be mechanically applied
- Mechanical edits only: appending keywords to existing arrays, adding negative keywords
- For copy suggestions that require new `ai.*` markers: create new ad groups only (never rewrite existing `rsa()` calls)
- File mutation strategy: read the campaign file as a string, use simple regex to find the closing `]` of the `keywords` or `negatives` array and insert new items before it. Do NOT use a TS AST parser — keep it simple. If the regex can't confidently find the insertion point, skip and report the suggestion as terminal-only.
- Output a `.optimize-patch.json` file in the campaign directory listing all changes made
- Non-mechanical suggestions (restructuring, budget changes) are printed to terminal only

- [ ] **Step 4: Implement `--patch` mode**

When `--patch` is passed:
- Generate the `.optimize-patch.json` file without applying any changes
- The patch file lists suggested edits with file path, line context, and proposed change
- User can review and manually apply

- [ ] **Step 5: Add route in cli/index.ts**

Modify `cli/index.ts`: add `case 'optimize':` route. Update USAGE string.

- [ ] **Step 6: Run full suite + typecheck**

Run: `bun test && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```
git add cli/optimize.ts cli/index.ts
git commit -m "feat(ai): ads optimize CLI command"
```

---

## Chunk 6: Polish — Staleness, Validate, Init

### Task 17: Staleness Detection

**Files:**
- Modify: `src/ai/lockfile.ts`
- Modify: `src/ai/resolve.ts`

- [ ] **Step 1: Add staleness check logic**

Add to `src/ai/lockfile.ts`:
- `isSlotStale(slot: LockSlot, currentPrompt: string): boolean` — compares the compiled prompt snapshot in the slot against the current compiled prompt. Returns true if they differ.

Add to `src/ai/resolve.ts`:
- `checkStaleness(campaign, lockFile): StaleSlot[]` — returns list of stale slots with their campaign/group/field path
- `StaleSlot` type: `{ campaign: string, slot: string, message: string }`

- [ ] **Step 2: Write tests for staleness detection**

Add to `test/unit/ai-lockfile.test.ts`:
- When prompt in marker matches prompt in lock file: not stale
- When prompt in marker differs from prompt in lock file: stale
- When lock file doesn't exist: not stale (it's unresolved, not stale)

- [ ] **Step 3: Run tests**

Run: `bun test test/unit/ai-lockfile.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add src/ai/lockfile.ts src/ai/resolve.ts test/unit/ai-lockfile.test.ts
git commit -m "feat(ai): staleness detection for lock files"
```

---

### Task 18: Update `ads validate` with AI Warnings

**Files:**
- Modify: `cli/validate.ts`

- [ ] **Step 1: Add AI-related validation checks**

Modify `cli/validate.ts`:
- After existing validation, check for:
  1. **Unresolved markers** — campaigns with `ai.*` markers that have no companion `.gen.json` or missing slots. Warn: `"⚠ Unresolved AI marker: {campaign}/{group}.{field} — run ads generate"`
  2. **Stale lock files** — prompt changed since last generate. Warn: `"⚠ Stale generation: {campaign}/{group}.{field} — prompt changed since last generate"`
  3. **Stale generated files** — seed modified after generation timestamp in manifest. Warn: `"⚠ Stale generated campaign: generated/{file} — seed modified since generation"`
  4. **Judge warnings** — slots with `judgeWarning` flag. Warn: `"⚠ Judge warning: {campaign}/{group}.{field} — judge criteria not fully met"`
- These are all warnings, not errors. `ads validate` still exits 0 unless there are structural errors.

- [ ] **Step 2: Test manually**

Create a campaign with an `ai.rsa()` marker, no `.gen.json`. Run `ads validate`. Verify the unresolved marker warning appears.

- [ ] **Step 3: Commit**

```
git add cli/validate.ts
git commit -m "feat(ai): AI staleness and marker warnings in validate"
```

---

### Task 19: Update `ads init` with AI Scaffolding

**Files:**
- Modify: `cli/init.ts`

- [ ] **Step 1: Add AI scaffolding option**

Modify `cli/init.ts`:
- After creating the base project structure, ask: `"Enable AI generation? (y/n)"`
- If yes:
  - Add `ai` block to the generated `ads.config.ts` (with a placeholder comment for the model)
  - Create `prompts/` directory with a `brand.ts` template file
  - Create `ads.generate.ts` template with a commented-out example `expand()` call
  - Create `generated/` directory with a `.gitkeep`
- If no: skip AI scaffolding (existing behavior unchanged)

- [ ] **Step 2: Test manually**

Run `ads init` in a temp directory, choose yes for AI. Verify the files are created.

- [ ] **Step 3: Commit**

```
git add cli/init.ts
git commit -m "feat(ai): AI scaffolding in ads init"
```

---

### Task 20: Export Cleanup and Public API

**Files:**
- Modify: `src/ai/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Finalize public API exports**

Update `src/ai/index.ts` to export:
- `ai` namespace (the `{ rsa, keywords }` object)
- `expand` function (for `ads.generate.ts`)
- All AI types (for advanced users who need them)

Update `src/index.ts` to re-export:
- `ai` and `expand` from `./ai/index.ts`
- AI types: `AiConfig`, `RsaMarker`, `KeywordsMarker`

Expected final DX for campaign files:

```typescript
import { ai, google, daily, phrase, url } from '@upspawn/ads'

export default google.search('Search - Dropbox', {
  budget: daily(0.5),
  bidding: { type: 'target-cpa', targetCpa: 0 },
})
  .group('dropbox-automation-en', {
    keywords: [
      ...phrase('automate dropbox', 'bulk rename dropbox'),
      ai.keywords('Long-tail Dropbox file automation queries'),
    ],
    ad: ai.rsa({
      product: 'Renamed.to — AI file renaming for Dropbox',
      tone: 'direct, specific',
      judge: `Reject generic SaaS marketing. Each headline must mention
        a concrete feature or number.`,
    }),
  })
```

Expected final DX for generation matrix:

```typescript
import { expand } from '@upspawn/ads/ai'

export default [
  expand('./campaigns/search-dropbox.ts', {
    translate: ['de', 'fr'],
    vary: [
      { name: 'enterprise', prompt: 'Adapt for IT admins. Emphasize security.' },
    ],
  }),
]
```

- [ ] **Step 2: Run full suite + typecheck**

Run: `bun test && bun run typecheck`
Expected: PASS — all tests green, no type errors

- [ ] **Step 3: Commit**

```
git add src/ai/index.ts src/index.ts
git commit -m "feat(ai): finalize public API exports"
```

---

### Task 21: Final Integration Test

**Files:**
- Create: `test/integration/ai-roundtrip.test.ts`

- [ ] **Step 1: Write an end-to-end test**

Create `test/integration/ai-roundtrip.test.ts`:
- Create a temp directory with `ads.config.ts` (AI config with a mocked model)
- Create a campaign file with `ai.rsa()` and `ai.keywords()` markers
- Call the generation pipeline programmatically (not via CLI)
- Verify `.gen.json` is written with expected structure
- Call the resolution pipeline
- Verify the resolved campaign has concrete headlines, descriptions, keywords
- Call `flatten()` on the resolved campaign — verify no errors, produces valid resources
- This proves the full flow: markers → generate → lock → resolve → flatten

- [ ] **Step 2: Run integration test**

Run: `bun test test/integration/ai-roundtrip.test.ts`
Expected: PASS

- [ ] **Step 3: Run full suite one last time**

Run: `bun test && bun run typecheck`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```
git add test/integration/ai-roundtrip.test.ts
git commit -m "test(ai): end-to-end round-trip integration test"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-5 | Dependencies, types, markers, lock files — the data layer |
| 2: Generation | 6-9 | Prompt compiler, schemas, generation pipeline, `ads generate` CLI |
| 3: Judges + Plan | 10-11 | Judge pipeline, marker resolution, plan integration |
| 4: Multiplication | 12-14 | `expand()`, manifest, codegen, matrix in `ads generate` |
| 5: Optimization | 15-16 | Analysis engine, `ads optimize` CLI |
| 6: Polish | 17-21 | Staleness, validate warnings, init scaffolding, exports, integration test |

Each chunk produces working, testable software. Chunk 1-2 gives you `ads generate` for inline copy generation. Chunk 3 makes `ads plan` aware of AI. Chunk 4 adds multiplication. Chunk 5 adds optimization. Chunk 6 polishes the edges.
