# Meta Apply Validation Report — 2026-03-15

## Test Setup
- Campaign: "Retargeting - Comparison Ads (Feb 2026)" (PAUSED)
- Change: trivial primaryText edit on one ad creative
- Commands: `ads plan --provider meta`, `ads apply --provider meta --dry-run`

## Results

### Plan (PASS)
- Correctly detected exactly 1 update to the right creative
- No false positives on the target campaign

### Dry-Run (PASS)
- Shows exact API payloads (method, endpoint, params)
- Format is readable and correct for creates, updates, and deletes
- Placeholder IDs (`<new-creative-id>`) used correctly for yet-to-be-created resources

### Apply (SKIPPED — SAFETY)
Actual apply was **not executed** because `plan` also showed 12 creates + 12 deletes
on the ACTIVE "Retargeting - Website Visitors" campaigns (ad shuffling between
duplicate-named campaigns). Applying would touch live campaigns.

## Bug Found: Creative Update Payload

The `buildUpdateParams()` function in `src/meta/apply.ts` falls through to
the default case for creative fields like `primaryText`, sending them as
top-level POST params:

```
POST /1445082613998762
  primaryText: "new text..."
```

This is **wrong** for Meta creatives. The Graph API does not accept `primaryText`
as a top-level param on a creative update. Meta creatives are largely immutable —
the correct approach is either:

1. **Update the object_story_spec** (rebuild the full story spec with the changed field)
2. **Create a new creative + update the ad** to point to the new creative

This is a known limitation that should be fixed before relying on creative updates.

### Recommendation
Add creative-specific handling to `buildUpdateParams()` that rebuilds the
`object_story_spec` for field changes like `primaryText`, `headline`, `description`,
`cta`, and `url`. Alternatively, treat creative updates as create-new + swap operations.

## Currency Fix Verification
The fetch correctly used the account currency from config (`currency: 'EUR'`)
without hitting the API, as confirmed by the plan output showing `$5.00/day`
budget values correctly converted.
