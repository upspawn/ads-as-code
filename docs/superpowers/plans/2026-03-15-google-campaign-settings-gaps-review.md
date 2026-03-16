# Review: Google Campaign Settings Gaps Plan

**Reviewer:** Code Review Agent (Opus 4.6)
**Date:** 2026-03-15
**Plan:** `docs/superpowers/plans/2026-03-15-google-campaign-settings-gaps.md`

## Summary

Well-structured plan covering 7 tasks across 4 chunks. The TDD approach (write failing test, implement, verify) is disciplined and appropriate. The architecture understanding is accurate — types/builder/flatten already exist, only fetch/codegen/apply need wiring.

**Overall verdict: Good to implement with 4 issues to fix (2 critical, 2 important).**

---

## Issues

### CRITICAL 1: `target_roas` field in Google Ads API is a float, not micros

**Location:** Task 5, Step 3 (apply.ts bidding create) and Step 7 (apply.ts bidding update)

The plan uses `toMicros()` for `target_roas` values:
```typescript
campaign.target_roas = { target_roas: toMicros(bidding.targetRoas as number) }
// e.g. targetRoas: 3.5 → target_roas: 3500000
```

This is **wrong**. In the Google Ads API, `campaign.target_roas.target_roas` is a **double (float)**, not micros. A target ROAS of 3.5 means 350% return. The field accepts the raw multiplier directly.

Similarly, `maximize_conversion_value.target_roas` is also a float, not micros.

**Fix:** Replace `toMicros(roas)` with the raw `roas` value:
```typescript
// target-roas
campaign.target_roas = { target_roas: bidding.targetRoas as number }

// maximize-conversion-value
campaign.maximize_conversion_value = roas ? { target_roas: roas } : {}
```

The test expectations at lines 918 and 932 must also change:
```typescript
// Line 918: change from
expect(campaign.resource.target_roas).toEqual({ target_roas: 3500000 })
// to
expect(campaign.resource.target_roas).toEqual({ target_roas: 3.5 })

// Line 932: change from
expect(campaign.resource.maximize_conversion_value).toEqual({ target_roas: 2000000 })
// to
expect(campaign.resource.maximize_conversion_value).toEqual({ target_roas: 2.0 })
```

Same fix needed in the update handler (Step 7 code block).

---

### CRITICAL 2: `location_fraction_micros` should use 1,000,000 scale, not 10,000

**Location:** Task 5, Step 3 and Step 7 (target-impression-share apply)

The plan calculates:
```typescript
location_fraction_micros: String(Math.round((bidding.targetPercent as number) * 10000))
// 70% → '700000'
```

Google Ads API `location_fraction_micros` uses **micros** (1,000,000 = 100%). So 70% = 700,000 micros. The test at line 926 expects `'700000'` which is correct for 70% at the 10,000 scale... but looking more carefully, the Google Ads API documentation says this field uses the standard micros convention where 1,000,000 = 100%.

However, the plan's fetch side (Step 7, line 261) does the inverse:
```typescript
const targetPercent = fractionMicros ? Number(fractionMicros) / 10000 : 50
```

These are inconsistent with each other if the API uses 1,000,000 scale. The fetch would read 700,000 as 70 (correct), and apply would write 70 * 10,000 = 700,000 (also correct). So the 10,000 multiplier is actually a **non-standard micro** where 10,000 = 1%. This appears to be the correct Google Ads convention for this specific field (it's a percentage-micros, not an amount-micros).

**After further analysis:** The test data in the plan's fetch test (line 205) has `location_fraction_micros: '500000'` for 50%, which means 500,000 / 10,000 = 50. This is consistent. The roundtrip works. **This is NOT a bug** — I retract this as critical. The field uses a micro-percentage scale where 10,000 = 1%.

---

### CRITICAL 2 (revised): Test file naming conflicts with existing conventions

**Location:** All test file references

The plan creates:
- `test/unit/google-fetch.test.ts`
- `test/unit/google-apply.test.ts`
- `test/unit/codegen-google-settings.test.ts`

But existing test files are:
- `test/unit/fetch.test.ts` (already tests `fetchCampaigns`, `fetchAllState`)
- `test/unit/apply.test.ts` (already tests `changeToMutations`)
- `test/unit/codegen.test.ts` (already tests `generateCampaignFile`)

**Problem:** Creating parallel test files for the same modules will cause:
1. Duplicated imports and mock setups
2. Confusion about where to add future tests
3. The new `google-fetch.test.ts` mock client (line 52-58) is simpler than the existing `fetch.test.ts` mock (line 24-46) and won't work correctly with `fetchAllState` because it lacks the GAQL-matching logic.

**Fix:** Add the new tests to the **existing** test files instead:
- Network settings + bidding strategy tests → append to `test/unit/fetch.test.ts`
- Device bid adjustment tests for `fetchAllState` → append to `test/unit/fetch.test.ts` (using the existing `createMockClient` with a `devices` response key)
- Apply tests → append to `test/unit/apply.test.ts`
- Codegen tests → append to `test/unit/codegen.test.ts`

---

### IMPORTANT 1: Mock client in Task 2 won't route the device query correctly

**Location:** Task 2, Step 1 (fetchAllState device test, line 316)

The test creates a mock client with inline `if (gaql.includes('campaign_criterion.device'))` matching. But the existing `createMockClient` in `fetch.test.ts` has a catch-all `FROM campaign_criterion` that returns `responses.negatives ?? []` (line 31). The new device criterion query uses `FROM campaign_criterion WHERE campaign_criterion.type = 'DEVICE'`, which would match the catch-all before any device-specific check.

**Fix:** When adding device tests to the existing `fetch.test.ts`, add a new matcher line BEFORE the catch-all:
```typescript
if (gaql.includes('FROM campaign_criterion') && gaql.includes("type = 'DEVICE'"))
  return Promise.resolve(responses.devices ?? [])
```
This must go before the generic `FROM campaign_criterion` catch-all at line 31.

---

### IMPORTANT 2: `fetchKnownState` not updated in plan

**Location:** Task 2, Step 3 mentions "Do the same in `fetchKnownState` (line ~709)" but provides no code

The plan says to update `fetchKnownState` to include device modifiers, but only shows the `fetchAllState` code. Since `fetchKnownState` has essentially the same parallel-fetch + merge pattern (lines 709-717), the implementing agent needs to:

1. Add `fetchDeviceBidModifiers` to the `Promise.all` at line 709
2. Add the `mergeDevicesIntoCampaigns` call after `mergeTargetingIntoCampaigns`

This is mentioned but the actual code diff is missing. An agent following the plan literally might skip it.

**Fix:** Add explicit code for `fetchKnownState`:
```typescript
const [extensions, negatives, targetingMap, deviceMap] = await Promise.all([
  fetchExtensions(client, knownCampaignIds),
  fetchNegativeKeywords(client, knownCampaignIds),
  fetchCampaignTargeting(client, knownCampaignIds),
  fetchDeviceBidModifiers(client, knownCampaignIds),
])
const campaignsWithTargeting = mergeTargetingIntoCampaigns(knownCampaigns, targetingMap)
const campaignsWithDevices = mergeDevicesIntoCampaigns(campaignsWithTargeting, deviceMap)
```

---

## Suggestions (nice to have)

### S1: GAQL query could request `campaign.network_settings.target_partner_search_network`

The plan's CAMPAIGN_QUERY (Step 3) omits `target_partner_search_network`. While this field is deprecated for Search campaigns, fetching it would future-proof against Display/Shopping campaign support. The plan's test at line 73 includes it in the mock API response but doesn't use it. Low priority but worth considering.

### S2: The `device` codegen import should be added to the exports barrel

When `device()` appears in generated campaign files, the import statement needs `device` from `@upspawn/ads`. Verify that `device` is already exported from the package's barrel file / index.ts.

### S3: Consider edge case — device bid modifiers on campaign update (existing criteria)

The plan notes (line 1242) that "Google Ads API handles device criteria as create or update" for device criteria. This is only true when using `CampaignCriterionOperation` directly. If using the standard `mutate` endpoint with `op: 'create'`, an existing device criterion may cause a DUPLICATE_CRITERION error. The plan should document this assumption and test for the case where a device criterion already exists.

---

## What's Done Well

- **TDD discipline** — every feature starts with a failing test, implements, verifies
- **Accurate architecture mapping** — correctly identifies that types/builder/flatten are already complete
- **Consistent dual-format handling** — snake_case/camelCase fallbacks match the existing codebase pattern
- **Proper chunking** — 4 independent chunks that can be committed and verified separately
- **Integration verification** — Chunk 4's end-to-end plan with import/plan/apply/re-import cycle is thorough
