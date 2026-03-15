# Spec Review: Meta Ads Provider Design

**Reviewer:** Senior Code Reviewer
**Date:** 2026-03-15
**Spec:** `docs/superpowers/specs/2026-03-15-meta-ads-provider-design.md`
**Verdict:** Issues Found -- approve after addressing Critical and Important items below.

---

## What's Done Well

- The overall architecture correctly mirrors the Google provider pattern: `meta/index.ts` (builder DSL), `meta/types.ts`, `meta/fetch.ts`, `meta/apply.ts`, plus `constants.ts`.
- The Resource model mapping (campaign/adSet/ad paths) is clean and consistent with how the diff engine works.
- Dependency ordering for mutations is correctly specified and matches the Google apply.ts pattern.
- Image upload caching via SHA-256 is a good design -- avoids redundant uploads and integrates well with the existing SQLite cache.
- The DSL example is readable and feels idiomatic alongside the Google builder.
- The `OptimizationGoalMap` generic constraint is a strong ergonomic choice that prevents invalid objective+optimization combinations at compile time.

---

## Critical Issues (must fix before implementation)

### C1. `ResourceKind` type not extended -- `adSet` and `upload` missing

The spec says `kind` is extended with `'adSet'` but the existing `ResourceKind` in `src/core/types.ts` (line 107) is a union literal:

```ts
type ResourceKind = 'campaign' | 'adGroup' | 'keyword' | 'ad' | 'sitelink' | 'callout' | 'negative'
```

The spec needs to explicitly state that `ResourceKind` must be extended with `'adSet'` (and possibly `'creative'` and `'upload'` -- see C2). This is not a "just add it" -- it impacts the diff engine, cache, apply ordering, `describeResource()` in the CLI plan output, and `extractPlatformId()` in the Google apply. Every `switch` statement over `ResourceKind` must be audited.

**Action:** Add a section "Core type changes" listing every file that needs updating when new ResourceKinds are added. Consider whether a provider-scoped kind system would be better (e.g., `'meta:adSet'`) or whether a simple union extension is sufficient.

### C2. Creative entity is invisible in the resource model

The plan output shows `+ upload` and `+ ad` but the spec's Resource Model table only has three kinds: campaign, adSet, ad. However, the apply layer mutation order (Step 4) has a separate "Create creative" step between image upload and ad creation. This is a real Graph API entity (`adcreative`) with its own ID.

The spec conflates ad + creative into one `ad` resource. This creates problems:
- Multiple ads can share a single creative. If the spec collapses them, the diff engine can't detect "creative changed but ad didn't" vs "ad pointing to a different creative."
- The apply layer needs the creative ID to create the ad. Without a `creative` resource, there's no way to cache/track it.
- Deletes need to reverse: ad -> creative -> adSet -> campaign. Without a `creative` resource, delete ordering is incomplete.

**Action:** Either (a) add `'creative'` as a ResourceKind with path `campaign-name/adset-name/creative-name`, or (b) explicitly document that creatives are an implementation detail handled entirely inside `apply.ts` (created inline, ID cached internally, never surfaced in the plan). Option (b) is simpler but loses visibility.

### C3. `MetaProviderConfig` in core/types.ts is insufficient

The existing `MetaProviderConfig` in `src/core/types.ts` (line 149-152) only has `accountId` and `credentials`. But the spec's config schema requires `pageId`, `pixelId`, `apiVersion`, and `dsa` (default DSA config). These are mandatory for ad creation (page ID is required for every creative's `object_story_spec`).

**Action:** Update the spec to include the full config shape in the "Core type changes" section, and show the updated `MetaProviderConfig`:

```ts
type MetaProviderConfig = {
  readonly accountId: string
  readonly pageId: string
  readonly pixelId?: string
  readonly apiVersion?: string
  readonly dsa?: { beneficiary: string; payor: string }
  readonly credentials?: string
}
```

---

## Important Issues (should fix)

### I1. `flatten.ts` is Google-specific -- no Meta flatten strategy

The existing `flatten.ts` only handles `GoogleSearchCampaign`. The spec doesn't specify how Meta campaigns are flattened to Resources. The flatten logic for Meta is fundamentally different:
- No keywords, sitelinks, callouts, negatives, or RSA hash-based paths.
- Ads contain file paths to images/videos that need to be resolved.
- The `ad` path can't use an RSA hash -- it should use the ad name (which the spec's builder requires via `name` field on image/video/carousel).

**Action:** Add a "Flatten" section to the spec describing:
- How `MetaCampaignBuilder<T>.build()` produces a flat `Resource[]`
- Path generation strategy for ads (e.g., `campaign-slug/adset-slug/ad-name-slug`)
- How image file paths in the creative config are represented in Resource properties (relative path? absolute? resolved at plan time?)

### I2. `audience()` helper has two incompatible call signatures

In the DSL example, `audience()` is used two ways:
1. `audience('website-visitors-30d', { geo: ..., age: ... })` -- custom audience ID + targeting
2. `audience({ geo: ..., age: ..., interests: [...] })` -- no audience, just targeting

The first creates a `customAudiences` reference. The second is just a targeting config wrapper. These are semantically different things. The Google provider has a clear `targeting()` helper that wraps rules. Using `audience()` for both is confusing.

**Action:** Clarify the API. Suggested split:
- `audience('custom-audience-id')` -- returns audience reference
- `targeting({ geo: ..., age: ..., interests: ... })` -- returns targeting config (consistent with Google's `targeting()` helper)

### I3. No `provider` field on the builder output

The Google builder sets `provider: 'google'` and `kind: 'search'` on every campaign object. The discovery system in `src/core/discovery.ts` (line 29-38) relies on `isCampaignLike()` checking for these fields. The spec's builder section doesn't show these fields being set on the Meta campaign object.

**Action:** Explicitly state that `meta.traffic()` etc. produce objects with `provider: 'meta'` and `kind: <objective>` (e.g., `kind: 'traffic'`). This is how the discovery system routes campaigns to the correct provider's flatten/fetch/apply.

### I4. Plan/apply/import CLI commands are hardcoded to Google

The current `cli/plan.ts`, `cli/apply.ts`, and `cli/import.ts` are all hardcoded to Google:
- `plan.ts` line 185-188: filters for `provider === 'google'` only
- `plan.ts` line 204: creates only a Google client
- `import.ts` line 556: checks only `config?.google`

The spec's CLI section says "all providers" and "--provider" filtering, but doesn't describe the refactoring needed. An implementer would need to restructure every CLI command to support multiple providers.

**Action:** Add a section "CLI refactoring" that describes the pattern: discover campaigns -> group by provider -> for each provider, flatten + fetch + diff (or apply/import). This is significant work and should be scoped explicitly.

### I5. Interests by name vs ID -- resolution gap

The spec shows `interests: ['Construction', 'Building Information Modeling']` using human-readable names. But the Meta Graph API requires interest targeting IDs (e.g., `6003017690433`). The spec doesn't describe how name-to-ID resolution works.

**Action:** Specify one of: (a) names are looked up via the Targeting Search API at plan/validate time, (b) a constants file maps common names to IDs (like Google's `GEO_TARGETS`), or (c) users must provide IDs directly (with the `InterestTarget = { id: string, name: string }` type already in the spec). If (c), update the DSL example to use `{ id: '...', name: 'Construction' }` objects.

### I6. Budget representation inconsistency

The spec says "Meta uses cents (string)" but the DSL uses `daily(5)` where `5` is presumably euros/dollars. The fetch layer needs to convert: Meta API returns `"500"` (cents as string) -> normalize to `5.00` (amount in currency units). The spec's "Semantic Comparison Rules" section mentions this but doesn't specify the direction or the currency field.

The existing Google provider uses `{ amount: number, currency: 'EUR', period: 'daily' }` for budgets. The Meta spec's `Budget` type uses `{ type: 'daily', amount: number }` -- no currency field.

**Action:** Align the Meta `Budget` type with the existing core budget type, or explicitly document why they differ. The diff engine's `semanticEqual` for budgets checks the `currency` field.

---

## Suggestions (nice to have)

### S1. Video upload details

The spec mentions `upload.ts` for "Image/video upload + hash caching" but only describes image upload in detail. Video upload via the Graph API uses a completely different endpoint (chunked upload via `/advideos`). Worth at least a note that video upload is phase 2.

### S2. Rate limiting specifics

"Retry with exponential backoff" is mentioned but no specifics. The Meta Graph API has both app-level and ad-account-level rate limits with different backoff strategies. The Google provider doesn't implement retries either, so this is consistent, but worth noting for future work.

### S3. Codegen for Meta import

The spec describes import behavior but doesn't mention codegen -- `src/core/codegen.ts` is currently Google-only. A Meta codegen module would be needed for `ads import --provider meta`. Consider noting this as a separate file (`meta/codegen.ts`).

### S4. `lowestCost()` naming

The Meta API calls this `LOWEST_COST_WITHOUT_CAP`. The helper `lowestCost()` is clear, but the BidStrategy type uses `LOWEST_COST_WITHOUT_CAP` while there's also a separate `LOWEST_COST_WITH_BID_CAP`. The `lowestCost()` helper should map to `LOWEST_COST_WITHOUT_CAP` -- worth a one-line note in the spec.

### S5. Test strategy not mentioned

No mention of test approach. The Google provider doesn't have tests either, but for a second provider this is a good opportunity to establish the pattern (mock Graph API responses, test flatten, test diff with Meta resources).

---

## Summary

The spec is well-structured and covers the major design decisions. The DSL is ergonomic and the builder typing with objective-constrained optimization goals is a nice touch. However, three critical gaps need resolution before an implementer can proceed without ambiguity:

1. **ResourceKind extension** impacts the entire core -- document the blast radius.
2. **Creative entity** is either a first-class resource or an implementation detail -- decide and document.
3. **MetaProviderConfig** needs `pageId` and `pixelId` -- without these, no ads can be created.

The important items (I1-I6) are areas where an implementer would hit ambiguity and either make wrong assumptions or stall. Addressing these upfront saves significant rework.
