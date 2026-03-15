# AI Module — Meta Ads Integration

## Overview

Extend the AI generation system to support Meta (Facebook/Instagram) campaigns. The core generation infrastructure (generate, judge, lockfile, expand) is already provider-agnostic. This work adds Meta-specific markers, schemas, prompts, resolution, codegen, and optimization.

## Design

### New Marker: `ai.metaCopy()`

Meta ads have three text fields: `primaryText` (main body, ≤125 chars recommended), `headline` (≤40 chars), and `description` (optional, ≤30 chars). The `ai.metaCopy()` marker generates these fields and can be used as the config argument to `image()`, `video()`, or directly in ad objects.

```typescript
// DX: ai.metaCopy() replaces the copy fields of a creative
meta.traffic('Campaign', { budget: daily(5) })
  .adSet('Ad Set', { targeting: metaTargeting(geo('US')) }, {
    url: 'https://renamed.to',
    cta: 'LEARN_MORE',
    ads: [
      image('./hero.png', ai.metaCopy('Renamed.to — AI file renaming')),
      image('./hero.png', ai.metaCopy({
        product: 'Renamed.to',
        audience: 'Small business owners',
        tone: 'casual',
        judge: 'No generic marketing speak',
      })),
    ],
  })
```

### New Marker: `ai.interests()`

Meta targeting uses interests instead of keywords. `ai.interests()` suggests interest names for targeting:

```typescript
.adSet('Ad Set', {
  targeting: metaTargeting(
    geo('US'),
    age(25, 55),
    ai.interests('People interested in file management and cloud storage automation'),
  ),
}, { ... })
```

### Lock File

Same `.gen.json` format. Slot keys for Meta use `{adSetKey}.copy.{adIndex}` for creative copy and `{adSetKey}.interests` for interest suggestions.

### Schemas

- `metaCopySchema`: `{ primaryText: string (≤125), headline: string (≤40), description?: string (≤30) }`
- `interestsSchema`: `{ interests: Array<{ name: string }> }` — names only, resolved to IDs via the existing interest resolution system

### Resolution

`resolveMetaMarkers()` walks a `MetaCampaign`'s ad sets, finds `MetaCopyMarker` objects in creatives and `InterestsMarker` objects in targeting, and replaces them with concrete values from the lock file.

### Codegen for Expansion

`generateExpandedMetaCode()` produces standalone Meta campaign files using `meta.traffic()`, `.adSet()`, `image()`, etc.

### Optimization

`buildMetaOptimizePrompt()` analyzes Meta campaigns for: creative-to-audience alignment, audience overlap, creative fatigue risk, interest relevance, placement coverage, budget efficiency. Different from Google's keyword-focused analysis.

## Files to Create/Modify

| File | Action | What |
|------|--------|------|
| `src/ai/types.ts` | Modify | Add `MetaCopyMarker`, `InterestsMarker` types + guards |
| `src/ai/markers.ts` | Modify | Add `metaCopyMarker()`, `interestsMarker()` factories |
| `src/ai/schemas.ts` | Modify | Add `metaCopySchema`, `interestsSchema` |
| `src/ai/prompt.ts` | Modify | Add `META_AD_CONSTRAINTS`, `compileMetaCopyPrompt()`, `compileInterestsPrompt()` |
| `src/ai/resolve-meta.ts` | Create | `resolveMetaMarkers()`, `resolveMetaAllMarkers()`, `checkMetaStaleness()` |
| `src/ai/codegen-meta.ts` | Create | `generateExpandedMetaCode()` |
| `src/ai/optimize-meta.ts` | Create | `buildMetaOptimizePrompt()`, `buildMetaCrossAnalysisPrompt()`, `formatMetaCampaignData()` |
| `src/ai/index.ts` | Modify | Export new markers on `ai` namespace, new types |
| `src/meta/types.ts` | Modify | Widen `AdSetContent.ads` to accept markers, widen `MetaTargeting` |
| `cli/generate.ts` | Modify | Add Meta provider routing |
| `cli/optimize.ts` | Modify | Add Meta provider routing |
| `cli/plan.ts` | Modify | Add Meta marker resolution |
| `src/index.ts` | Modify | Export new types |
| `test/unit/ai-meta.test.ts` | Create | Tests for all Meta AI features |
