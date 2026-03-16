# Google Provider Production Readiness — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all round-trip gaps in the Google Ads provider so that `import → plan` shows zero diffs, and all fields can be applied back via `apply`.

**Architecture:** Each task fixes one resource type's pipeline end-to-end (fetch → codegen → apply). Tasks are independent and touch different functions within the same files, so they can be executed sequentially with one commit per task.

**Tech Stack:** TypeScript, Bun, Google Ads API (gRPC), `bun:test`

**Repo:** `/Users/alex/Projects/upspawn-products/ads-as-code/`
**Branch:** `feat/google-campaign-settings-gaps`

---

> **IMPORTANT — Test file convention:** Append new `describe` blocks to existing test files in `test/unit/`. Key files: `fetch.test.ts`, `codegen.test.ts`, `apply.test.ts`. Reuse existing mock helpers (`createMockClient`, `makeResource`, etc.).

> **IMPORTANT — Run commands:**
> ```bash
> bun test test/unit/fetch.test.ts    # Fetch tests
> bun test test/unit/codegen.test.ts  # Codegen tests
> bun test test/unit/apply.test.ts    # Apply tests
> bun test                            # Full suite
> ```

---

## Task 1: Move `budgetResourceName` to `resource.meta`

**Severity:** P0 — causes phantom diffs on every `plan` run

**Problem:** `normalizeCampaignRow` in fetch.ts stores `budgetResourceName` in `resource.properties`. Flatten never includes it. Diff sees `budgetResourceName: "customers/.../campaignBudgets/123"` vs `undefined` → false positive update on every campaign.

**Files:**
- Modify: `src/google/fetch.ts` — `normalizeCampaignRow` (~line 179)
- Modify: `src/google/apply.ts` — `buildUpdateOperations` (~line 455) reads `budgetResourceName` from properties
- Modify: `test/unit/fetch.test.ts`

- [ ] **Step 1: Write test that budgetResourceName is NOT in properties**

```typescript
describe('campaign normalization — budgetResourceName', () => {
  test('budgetResourceName is in meta, not properties', async () => {
    const client = createMockClient({ campaigns: campaignFixtures as GoogleAdsRow[] })
    const resources = await fetchCampaigns(client, { includePaused: true })
    const campaign = resources[0]!
    // Should NOT be in properties (causes phantom diffs)
    expect(campaign.properties.budgetResourceName).toBeUndefined()
    // Should be in meta
    expect(campaign.meta?.budgetResourceName).toBeDefined()
    expect(typeof campaign.meta?.budgetResourceName).toBe('string')
  })
})
```

- [ ] **Step 2: Move budgetResourceName from properties to meta in fetch.ts**

In `normalizeCampaignRow`, change the return from:

```typescript
return resource('campaign', path, {
  name, status,
  budget: { amount, currency: 'EUR', period: 'daily' },
  bidding,
  ...(budgetResourceName ? { budgetResourceName } : {}),
  ...(networkSettings ? { networkSettings } : {}),
}, id)
```

To use a new overload that includes meta:

```typescript
const props = {
  name, status,
  budget: { amount, currency: 'EUR', period: 'daily' },
  bidding,
  ...(networkSettings ? { networkSettings } : {}),
}
const meta = budgetResourceName ? { budgetResourceName } : undefined
return { kind: 'campaign' as const, path, properties: props, ...(meta ? { meta } : {}), platformId: id }
```

- [ ] **Step 3: Update apply.ts to read budgetResourceName from meta**

In `buildUpdateOperations` case `'campaign'`, the budget update section reads `budgetResourceName` from properties. Change:

```typescript
const brnChange = change.changes.find(c => c.field === 'budgetResourceName')
const budgetResourceName = (brnChange?.from as string)
  ?? (resource.properties.budgetResourceName as string)
```

To:

```typescript
const budgetResourceName = (resource.meta?.budgetResourceName as string) ?? undefined
```

And remove the `budgetResourceName` field from the changes-find logic since it's no longer a diffable property.

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test`

- [ ] **Step 5: Commit**

```bash
git add src/google/fetch.ts src/google/apply.ts test/unit/fetch.test.ts
git commit -m "fix(google): move budgetResourceName to resource.meta to eliminate phantom diffs"
```

---

## Task 2: Campaign codegen + apply completeness

**Severity:** P1 — campaign status, dates, tracking fields lost on import/apply

**Problem:** Several campaign-level fields are in the type + flatten but missing from codegen and/or apply:
- `status: 'paused'` — not emitted by codegen (paused campaigns appear enabled after import)
- `startDate`, `endDate` — not applied
- `trackingTemplate`, `finalUrlSuffix`, `customParameters` — not emitted by codegen, not applied

**Files:**
- Modify: `src/core/codegen.ts` — `generateCampaignFile` config section
- Modify: `src/google/apply.ts` — `buildCampaignCreate` and `buildUpdateOperations`
- Modify: `test/unit/codegen.test.ts`
- Modify: `test/unit/apply.test.ts`

### Codegen changes

- [ ] **Step 1: Write tests for campaign status, dates, tracking fields in codegen**

```typescript
describe('generateCampaignFile — campaign status and tracking', () => {
  function campaignWith(extra: Record<string, unknown>): Resource[] {
    return [{
      kind: 'campaign', path: 'test',
      properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        ...extra,
      },
    }]
  }

  test('emits status when paused', () => {
    const r = campaignWith({ status: 'paused' })
    r[0] = { ...r[0]!, properties: { ...r[0]!.properties, status: 'paused' } }
    const code = generateCampaignFile(r, 'Test')
    expect(code).toContain("status: 'paused'")
  })

  test('omits status when enabled (default)', () => {
    const code = generateCampaignFile(campaignWith({}), 'Test')
    expect(code).not.toContain("status:")
  })

  test('emits startDate and endDate', () => {
    const code = generateCampaignFile(campaignWith({ startDate: '2026-04-01', endDate: '2026-04-30' }), 'Test')
    expect(code).toContain("startDate: '2026-04-01'")
    expect(code).toContain("endDate: '2026-04-30'")
  })

  test('emits trackingTemplate', () => {
    const code = generateCampaignFile(campaignWith({ trackingTemplate: '{lpurl}?utm_source=google' }), 'Test')
    expect(code).toContain("trackingTemplate: '{lpurl}?utm_source=google'")
  })

  test('emits finalUrlSuffix', () => {
    const code = generateCampaignFile(campaignWith({ finalUrlSuffix: 'utm_medium=cpc' }), 'Test')
    expect(code).toContain("finalUrlSuffix: 'utm_medium=cpc'")
  })

  test('emits customParameters', () => {
    const code = generateCampaignFile(campaignWith({ customParameters: { campaign: 'test' } }), 'Test')
    expect(code).toContain("customParameters:")
    expect(code).toContain("campaign: 'test'")
  })
})
```

- [ ] **Step 2: Implement codegen for these fields**

In `generateCampaignFile`, after the `networkSettings` section, add to `configParts`:

```typescript
// Status (only emit if paused — enabled is default)
const status = props.status as string | undefined
if (status === 'paused') {
  configParts.push(`status: 'paused',`)
}

// Dates
const startDate = props.startDate as string | undefined
if (startDate) configParts.push(`startDate: ${quote(startDate)},`)
const endDate = props.endDate as string | undefined
if (endDate) configParts.push(`endDate: ${quote(endDate)},`)

// Tracking
const trackingTemplate = props.trackingTemplate as string | undefined
if (trackingTemplate) configParts.push(`trackingTemplate: ${quote(trackingTemplate)},`)
const finalUrlSuffix = props.finalUrlSuffix as string | undefined
if (finalUrlSuffix) configParts.push(`finalUrlSuffix: ${quote(finalUrlSuffix)},`)
const customParameters = props.customParameters as Record<string, string> | undefined
if (customParameters && Object.keys(customParameters).length > 0) {
  const entries = Object.entries(customParameters).map(([k, v]) => `${k}: ${quote(v)}`).join(', ')
  configParts.push(`customParameters: { ${entries} },`)
}
```

### Apply changes

- [ ] **Step 3: Write tests for campaign dates and tracking in apply**

```typescript
describe('campaign create — dates and tracking', () => {
  test('sets start_date and end_date on create', () => {
    const resource = makeResource('campaign', 'test', {
      name: 'Test', status: 'enabled',
      budget: { amount: 5, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-conversions' },
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map())
    const campaign = mutations.find(m => m.operation === 'campaign')!
    expect(campaign.resource.start_date).toBe('2026-04-01')
    expect(campaign.resource.end_date).toBe('2026-04-30')
  })

  test('sets tracking_url_template on create', () => {
    const resource = makeResource('campaign', 'test', {
      name: 'Test', status: 'enabled',
      budget: { amount: 5, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-conversions' },
      trackingTemplate: '{lpurl}?src=google',
      finalUrlSuffix: 'utm_medium=cpc',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map())
    const campaign = mutations.find(m => m.operation === 'campaign')!
    expect(campaign.resource.tracking_url_template).toBe('{lpurl}?src=google')
    expect(campaign.resource.final_url_suffix).toBe('utm_medium=cpc')
  })
})

describe('campaign update — dates and tracking', () => {
  test('updates tracking_url_template', () => {
    const resource = makeResource('campaign', 'test', {
      name: 'Test', status: 'enabled',
      budget: { amount: 5, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-conversions' },
      trackingTemplate: '{lpurl}?src=google',
    }, '999')
    const change = {
      op: 'update' as const, resource,
      changes: [{ field: 'trackingTemplate', from: undefined, to: '{lpurl}?src=google' }],
    }
    const mutations = changeToMutations(change, '123', new Map())
    const op = mutations.find(m => m.operation === 'campaign' && m.op === 'update')
    expect(op).toBeDefined()
    expect(op!.resource.tracking_url_template).toBe('{lpurl}?src=google')
    expect(op!.updateMask).toContain('tracking_url_template')
  })
})
```

- [ ] **Step 4: Add dates and tracking to buildCampaignCreate**

In `buildCampaignCreate`, after the network_settings block, add:

```typescript
// Dates
const startDate = props.startDate as string | undefined
if (startDate) campaign.start_date = startDate
const endDate = props.endDate as string | undefined
if (endDate) campaign.end_date = endDate

// Tracking
const trackingTemplate = props.trackingTemplate as string | undefined
if (trackingTemplate) campaign.tracking_url_template = trackingTemplate
const finalUrlSuffix = props.finalUrlSuffix as string | undefined
if (finalUrlSuffix) campaign.final_url_suffix = finalUrlSuffix
const customParameters = props.customParameters as Record<string, string> | undefined
if (customParameters) {
  campaign.url_custom_parameters = Object.entries(customParameters).map(
    ([key, value]) => ({ key, value }),
  )
}
```

- [ ] **Step 5: Add dates and tracking to buildUpdateOperations**

In the `case 'campaign'` change loop, add:

```typescript
if (c.field === 'startDate') {
  campaignFields.start_date = c.to as string
  campaignMask.push('start_date')
}
if (c.field === 'endDate') {
  campaignFields.end_date = c.to as string
  campaignMask.push('end_date')
}
if (c.field === 'trackingTemplate') {
  campaignFields.tracking_url_template = c.to as string
  campaignMask.push('tracking_url_template')
}
if (c.field === 'finalUrlSuffix') {
  campaignFields.final_url_suffix = c.to as string
  campaignMask.push('final_url_suffix')
}
if (c.field === 'customParameters') {
  const params = c.to as Record<string, string>
  campaignFields.url_custom_parameters = Object.entries(params).map(
    ([key, value]) => ({ key, value }),
  )
  campaignMask.push('url_custom_parameters')
}
```

- [ ] **Step 6: Also add campaign dates and tracking to fetch GAQL**

Add to CAMPAIGN_QUERY:
```sql
campaign.start_date,
campaign.end_date,
campaign.tracking_url_template,
campaign.final_url_suffix,
campaign.url_custom_parameters,
```

And in `normalizeCampaignRow`, add to props:
```typescript
...(campaign?.start_date ? { startDate: str(campaign.start_date) } : {}),
...(campaign?.end_date ? { endDate: str(campaign.end_date) } : {}),
...(campaign?.tracking_url_template ? { trackingTemplate: str(campaign.tracking_url_template) } : {}),
...(campaign?.final_url_suffix ? { finalUrlSuffix: str(campaign.final_url_suffix) } : {}),
```

For `url_custom_parameters`, convert from `[{key, value}]` to `Record<string, string>`:
```typescript
const rawCustomParams = campaign?.url_custom_parameters as Array<{ key: string; value: string }> | undefined
const customParameters = rawCustomParams?.length
  ? Object.fromEntries(rawCustomParams.map(p => [p.key, p.value]))
  : undefined
// Add to props:
...(customParameters ? { customParameters } : {}),
```

- [ ] **Step 7: Run tests, verify pass**

Run: `bun test`

- [ ] **Step 8: Commit**

```bash
git add src/google/fetch.ts src/core/codegen.ts src/google/apply.ts test/unit/fetch.test.ts test/unit/codegen.test.ts test/unit/apply.test.ts
git commit -m "feat(google): campaign status, dates, and tracking fields across full pipeline"
```

---

## Task 3: Ad fetch + codegen + apply completeness

**Severity:** P0 — ad fields lost on round-trip, multiple ads dropped, ad status not manageable

**Problem:**
1. Ad GAQL query doesn't fetch `path1`, `path2`, `pinned_field` on headline/description assets, `ad_group_ad.status`
2. Codegen takes only `groupAds[0]` and ignores path1, path2, pinned fields
3. Apply ignores path1, path2, pinned fields, status; hardcodes status=ENABLED

**Files:**
- Modify: `src/google/fetch.ts` — `AD_QUERY`, `normalizeAdRow`
- Modify: `src/core/codegen.ts` — `generateCampaignFile` ad section
- Modify: `src/google/apply.ts` — `buildAdCreate`
- Modify: `test/unit/fetch.test.ts`, `test/unit/codegen.test.ts`, `test/unit/apply.test.ts`

### Fetch changes

- [ ] **Step 1: Write test for ad fetch with path1, path2, pinned fields, status**

```typescript
describe('fetchAds — extended fields', () => {
  test('includes path1, path2, pinned fields, and status', async () => {
    const client = createMockClient({
      campaigns: campaignFixtures as GoogleAdsRow[],
      adGroups: adGroupFixtures as GoogleAdsRow[],
      ads: [{
        ad_group_ad: {
          status: 2, // ENABLED
          ad: {
            id: '999',
            type: 30, // RESPONSIVE_SEARCH_AD
            responsive_search_ad: {
              headlines: [
                { text: 'Headline 1', pinned_field: 0 },
                { text: 'Headline 2', pinned_field: 1 }, // HEADLINE_1
              ],
              descriptions: [
                { text: 'Desc 1', pinned_field: 0 },
              ],
              path1: 'rename',
              path2: 'files',
            },
            final_urls: ['https://renamed.to'],
          },
        },
        ad_group: { id: '100', name: 'Test Group' },
        campaign: { id: '123456', name: 'Search - PDF Renaming' },
      }],
    })
    const resources = await fetchAds(client)
    expect(resources).toHaveLength(1)
    const ad = resources[0]!
    expect(ad.properties.path1).toBe('rename')
    expect(ad.properties.path2).toBe('files')
    expect(ad.properties.status).toBe('enabled')
    // Pinned headlines: only non-zero pinned_field values should be captured
    const pinned = ad.properties.pinnedHeadlines as Array<{ text: string; position: number }>
    expect(pinned).toHaveLength(1)
    expect(pinned[0]).toEqual({ text: 'Headline 2', position: 1 })
  })
})
```

- [ ] **Step 2: Extend AD_QUERY and normalizeAdRow**

Add to AD_QUERY:
```sql
ad_group_ad.ad.responsive_search_ad.path1,
ad_group_ad.ad.responsive_search_ad.path2,
```

Note: `pinned_field` is already in the headline/description asset objects returned by the API — no extra SELECT needed. We just need to read it in normalization.

In `normalizeAdRow`, update the headline/description mapping:

```typescript
const headlineAssets = (rsa?.headlines ?? []) as Array<{ text: string; pinned_field?: number }>
const descriptionAssets = (rsa?.descriptions ?? []) as Array<{ text: string; pinned_field?: number }>

const headlines = headlineAssets.map(h => h.text).sort()
const descriptions = descriptionAssets.map(d => d.text).sort()

// Pinned fields: Google API uses pinned_field enum (0=UNSPECIFIED, 1=HEADLINE_1, 2=HEADLINE_2, 3=HEADLINE_3, 4=DESCRIPTION_1, 5=DESCRIPTION_2)
const pinnedHeadlines = headlineAssets
  .filter(h => h.pinned_field && h.pinned_field > 0 && h.pinned_field <= 3)
  .map(h => ({ text: h.text, position: h.pinned_field! as 1 | 2 | 3 }))
const pinnedDescriptions = descriptionAssets
  .filter(d => d.pinned_field && d.pinned_field >= 4 && d.pinned_field <= 5)
  .map(d => ({ text: d.text, position: (d.pinned_field! - 3) as 1 | 2 }))

const path1 = str(rsa?.path1)
const path2 = str(rsa?.path2)

// Ad status
const adStatus = mapStatus(adGroupAd?.status)
```

In the returned resource properties, add:
```typescript
return resource('ad', path, {
  headlines,
  descriptions,
  finalUrl,
  status: adStatus,
  ...(pinnedHeadlines.length > 0 ? { pinnedHeadlines } : {}),
  ...(pinnedDescriptions.length > 0 ? { pinnedDescriptions } : {}),
  ...(path1 ? { path1 } : {}),
  ...(path2 ? { path2 } : {}),
}, adId)
```

### Codegen changes

- [ ] **Step 3: Write tests for ad codegen: multiple ads, path1/2, pinned, status**

```typescript
describe('generateCampaignFile — ad completeness', () => {
  test('emits multiple ads per group with ad: [rsa(...), rsa(...)]', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'test/grp', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'test/grp/rsa:aaa', properties: { headlines: ['H1', 'H2', 'H3'], descriptions: ['D1', 'D2'], finalUrl: 'https://renamed.to' } },
      { kind: 'ad', path: 'test/grp/rsa:bbb', properties: { headlines: ['H4', 'H5', 'H6'], descriptions: ['D3', 'D4'], finalUrl: 'https://renamed.to/2' } },
    ]
    const code = generateCampaignFile(resources, 'Test')
    expect(code).toContain('ad: [')
    // Should contain two rsa() calls
    const rsaCount = (code.match(/rsa\(/g) || []).length
    expect(rsaCount).toBe(2)
  })

  test('emits path1 and path2 on rsa()', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'test/grp', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'test/grp/rsa:aaa', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to', path1: 'rename', path2: 'files' } },
    ]
    const code = generateCampaignFile(resources, 'Test')
    expect(code).toContain("path1: 'rename'")
    expect(code).toContain("path2: 'files'")
  })

  test('emits ad status when paused', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'test/grp', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'test/grp/rsa:aaa', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to', status: 'paused' } },
    ]
    const code = generateCampaignFile(resources, 'Test')
    expect(code).toContain("status: 'paused'")
  })
})
```

- [ ] **Step 4: Fix codegen to handle multiple ads and emit extra fields**

In `generateCampaignFile`, replace the single-ad section (the `if (groupAds.length > 0)` block starting ~line 271) with:

```typescript
    // Ads
    let adLines = ''
    if (groupAds.length > 0) {
      imports.add('rsa')
      imports.add('headlines')
      imports.add('descriptions')
      imports.add('url')

      const formatOneAd = (ad: Resource): string => {
        const hl = ad.properties.headlines as string[]
        const desc = ad.properties.descriptions as string[]
        const finalUrl = ad.properties.finalUrl as string
        const p1 = ad.properties.path1 as string | undefined
        const p2 = ad.properties.path2 as string | undefined
        const adStatus = ad.properties.status as string | undefined

        const headlinesStr =
          hl.length <= 3
            ? `headlines(${hl.map(quote).join(', ')})`
            : `headlines(\n        ${hl.map(quote).join(',\n        ')},\n      )`
        const descriptionsStr =
          desc.length <= 2
            ? `descriptions(${desc.map(quote).join(', ')})`
            : `descriptions(\n        ${desc.map(quote).join(',\n        ')},\n      )`

        const parts = [headlinesStr, descriptionsStr, `url(${quote(finalUrl)})`]
        if (p1) parts.push(`{ path1: ${quote(p1)}${p2 ? `, path2: ${quote(p2)}` : ''} }`)
        if (adStatus === 'paused') parts.push(`{ status: 'paused' }`)

        return `rsa(\n      ${parts.join(',\n      ')},\n    )`
      }

      if (groupAds.length === 1) {
        adLines = `ad: ${formatOneAd(groupAds[0]!)},`
      } else {
        const adEntries = groupAds.map(a => formatOneAd(a))
        adLines = `ad: [\n      ${adEntries.join(',\n      ')},\n    ],`
      }
    }
```

### Apply changes

- [ ] **Step 5: Write test for ad apply with path1, path2, status**

```typescript
describe('ad create — extended fields', () => {
  test('includes path1, path2, and status on create', () => {
    const resource = makeResource('ad', 'test/grp/rsa:abc', {
      headlines: ['H1', 'H2', 'H3'],
      descriptions: ['D1', 'D2'],
      finalUrl: 'https://renamed.to',
      path1: 'rename',
      path2: 'files',
      status: 'paused',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map([['test/grp', '456']]))
    const adOp = mutations.find(m => m.operation === 'ad_group_ad')!
    const ad = adOp.resource.ad as Record<string, unknown>
    const rsa = ad.responsive_search_ad as Record<string, unknown>
    expect(rsa.path1).toBe('rename')
    expect(rsa.path2).toBe('files')
    expect(adOp.resource.status).toBe(3) // PAUSED
  })
})
```

- [ ] **Step 6: Add path1, path2, status to buildAdCreate**

In `buildAdCreate`, update the returned operation:

```typescript
function buildAdCreate(
  _customerId: string,
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  const headlines = (props.headlines as string[]).map(text => ({
    text,
    pinned_field: 0, // UNSPECIFIED
  }))
  const descriptions = (props.descriptions as string[]).map(text => ({
    text,
    pinned_field: 0, // UNSPECIFIED
  }))

  // Apply pinned positions if specified
  const pinnedHL = props.pinnedHeadlines as Array<{ text: string; position: number }> | undefined
  if (pinnedHL) {
    for (const pin of pinnedHL) {
      const h = headlines.find(h => h.text === pin.text)
      if (h) h.pinned_field = pin.position // 1=HEADLINE_1, 2=HEADLINE_2, 3=HEADLINE_3
    }
  }
  const pinnedDesc = props.pinnedDescriptions as Array<{ text: string; position: number }> | undefined
  if (pinnedDesc) {
    for (const pin of pinnedDesc) {
      const d = descriptions.find(d => d.text === pin.text)
      if (d) d.pinned_field = pin.position + 3 // 4=DESCRIPTION_1, 5=DESCRIPTION_2
    }
  }

  const adStatus = (props.status as string) === 'paused' ? 3 : 2
  const path1 = props.path1 as string | undefined
  const path2 = props.path2 as string | undefined

  return {
    operation: 'ad_group_ad',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status: adStatus,
      ad: {
        responsive_search_ad: {
          headlines,
          descriptions,
          ...(path1 ? { path1 } : {}),
          ...(path2 ? { path2 } : {}),
        },
        final_urls: [props.finalUrl],
      },
    },
  }
}
```

Note: the `headlines` and `descriptions` objects need to be mutable for pinning. Change `const` array mapping to use mutable objects.

- [ ] **Step 7: Run tests, verify pass**

Run: `bun test`

- [ ] **Step 8: Commit**

```bash
git add src/google/fetch.ts src/core/codegen.ts src/google/apply.ts test/unit/fetch.test.ts test/unit/codegen.test.ts test/unit/apply.test.ts
git commit -m "feat(google): ad path1/path2, pinned fields, status, multiple ads per group"
```

---

## Task 4: Keyword fetch + codegen + apply completeness

**Severity:** P0 — keyword bids and custom URLs lost on round-trip

**Problem:** Keyword GAQL only fetches `text` + `matchType`. The type supports `bid`, `finalUrl`, `status` but fetch/codegen/apply ignore them entirely.

**Files:**
- Modify: `src/google/fetch.ts` — `KEYWORD_QUERY`, `normalizeKeywordRow`
- Modify: `src/core/codegen.ts` — keyword section in `generateCampaignFile`
- Modify: `src/google/apply.ts` — `buildKeywordCreate`
- Modify: `test/unit/fetch.test.ts`, `test/unit/codegen.test.ts`, `test/unit/apply.test.ts`

### Fetch changes

- [ ] **Step 1: Write test for keyword fetch with status, bid**

```typescript
describe('fetchKeywords — extended fields', () => {
  test('includes status and cpc_bid_micros', async () => {
    const client = createMockClient({
      campaigns: campaignFixtures as GoogleAdsRow[],
      adGroups: adGroupFixtures as GoogleAdsRow[],
      keywords: [{
        ad_group_criterion: {
          resource_name: 'customers/123/adGroupCriteria/100~200',
          criterion_id: '200',
          status: 3, // PAUSED
          keyword: { text: 'rename pdf', match_type: 2 }, // EXACT
          cpc_bid_micros: '1500000', // $1.50
          final_urls: ['https://renamed.to/pdf-renamer'],
        },
        ad_group: { id: '100', name: 'PDF Keywords' },
        campaign: { id: '123456', name: 'Search - PDF Renaming' },
      }],
    })
    const resources = await fetchKeywords(client)
    const kw = resources[0]!
    expect(kw.properties.status).toBe('paused')
    expect(kw.properties.bid).toBe(1.5)
    expect(kw.properties.finalUrl).toBe('https://renamed.to/pdf-renamer')
  })

  test('omits bid when not set (no cpc_bid_micros)', async () => {
    const client = createMockClient({
      keywords: [{
        ad_group_criterion: {
          resource_name: 'customers/123/adGroupCriteria/100~201',
          criterion_id: '201',
          status: 2,
          keyword: { text: 'batch rename', match_type: 2 },
        },
        ad_group: { id: '100', name: 'PDF Keywords' },
        campaign: { id: '123456', name: 'Search - PDF Renaming' },
      }],
    })
    const resources = await fetchKeywords(client)
    expect(resources[0]!.properties.bid).toBeUndefined()
  })
})
```

- [ ] **Step 2: Extend KEYWORD_QUERY and normalizeKeywordRow**

Add to KEYWORD_QUERY:
```sql
ad_group_criterion.status,
ad_group_criterion.cpc_bid_micros,
ad_group_criterion.final_urls,
```

In `normalizeKeywordRow`, add:
```typescript
const status = mapStatus(criterion?.status)
const cpcBidMicros = criterion?.cpc_bid_micros ?? criterion?.cpcBidMicros
const bid = cpcBidMicros ? microsToAmount(cpcBidMicros as string | number) : undefined
const finalUrls = (criterion?.final_urls ?? criterion?.finalUrls ?? []) as string[]
const finalUrl = finalUrls[0] as string | undefined

return resource('keyword', path, {
  text,
  matchType,
  ...(status !== 'enabled' ? { status } : {}),
  ...(bid !== undefined ? { bid } : {}),
  ...(finalUrl ? { finalUrl } : {}),
}, resourceName || undefined)
```

Note: omit `status` when `'enabled'` (default) to avoid phantom diffs — the flatten side also only emits status when explicitly set.

### Codegen changes

- [ ] **Step 3: Write test for keyword codegen with bid and status**

```typescript
describe('generateCampaignFile — keyword options', () => {
  test('emits keyword with bid when present', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'test', properties: { name: 'Test', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'test/grp', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'test/grp/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT', bid: 1.5 } },
      { kind: 'ad', path: 'test/grp/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'Test')
    // Should use object form with bid
    expect(code).toContain("{ text: 'rename pdf', bid: 1.5 }")
  })
})
```

- [ ] **Step 4: Update keyword codegen to emit bid, finalUrl, status**

In `generateCampaignFile`, replace the keyword formatting section. Currently it does:
```typescript
const texts = kws.map((k) => k.properties.text as string)
keywordParts.push(`...${helper}(${formatStringList(texts)})`)
```

Change to handle keywords with options:
```typescript
// Check if any keyword has extra options (bid, finalUrl, status)
const hasOptions = kws.some(k => k.properties.bid || k.properties.finalUrl || k.properties.status)

if (hasOptions) {
  // Use object form for keywords with options
  const kwObjects = kws.map(k => {
    const opts: string[] = [`text: ${quote(k.properties.text as string)}`]
    if (k.properties.bid) opts.push(`bid: ${k.properties.bid}`)
    if (k.properties.finalUrl) opts.push(`finalUrl: ${quote(k.properties.finalUrl as string)}`)
    if (k.properties.status === 'paused') opts.push(`status: 'paused'`)
    return `{ ${opts.join(', ')} }`
  })
  keywordParts.push(`...${helper}(${kwObjects.join(', ')})`)
} else {
  const texts = kws.map((k) => k.properties.text as string)
  keywordParts.push(`...${helper}(${formatStringList(texts)})`)
}
```

### Apply changes

- [ ] **Step 5: Write test for keyword apply with bid and status**

```typescript
describe('keyword create — extended fields', () => {
  test('sets cpc_bid_micros and status when specified', () => {
    const resource = makeResource('keyword', 'test/grp/kw:rename pdf:EXACT', {
      text: 'rename pdf', matchType: 'EXACT', bid: 1.5, status: 'paused',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map([['test/grp', '456']]))
    const kwOp = mutations.find(m => m.operation === 'ad_group_criterion')!
    expect(kwOp.resource.cpc_bid_micros).toBe('1500000')
    expect(kwOp.resource.status).toBe(3) // PAUSED
  })

  test('sets final_urls when finalUrl specified', () => {
    const resource = makeResource('keyword', 'test/grp/kw:rename pdf:EXACT', {
      text: 'rename pdf', matchType: 'EXACT', finalUrl: 'https://renamed.to/pdf',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map([['test/grp', '456']]))
    const kwOp = mutations.find(m => m.operation === 'ad_group_criterion')!
    expect(kwOp.resource.final_urls).toEqual(['https://renamed.to/pdf'])
  })
})
```

- [ ] **Step 6: Add bid, status, finalUrl to buildKeywordCreate**

```typescript
function buildKeywordCreate(
  _customerId: string,
  adGroupResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  const status = (props.status as string) === 'paused' ? 3 : 2
  const bid = props.bid as number | undefined
  const finalUrl = props.finalUrl as string | undefined

  return {
    operation: 'ad_group_criterion',
    op: 'create',
    resource: {
      ad_group: adGroupResourceName,
      status,
      keyword: {
        text: props.text,
        match_type: matchTypeToEnum(props.matchType),
      },
      ...(bid !== undefined ? { cpc_bid_micros: String(toMicros(bid)) } : {}),
      ...(finalUrl ? { final_urls: [finalUrl] } : {}),
    },
  }
}
```

- [ ] **Step 7: Run tests, verify pass**

Run: `bun test`

- [ ] **Step 8: Commit**

```bash
git add src/google/fetch.ts src/core/codegen.ts src/google/apply.ts test/unit/fetch.test.ts test/unit/codegen.test.ts test/unit/apply.test.ts
git commit -m "feat(google): keyword bid, finalUrl, and status across full pipeline"
```

---

## Task 5: Sitelink/callout apply fix

**Severity:** P1 — extension create mutations are malformed

**Problem:** `buildSitelinkCreate` and `buildCalloutCreate` use `updateMask` field incorrectly — they store the campaign resource name there, but `updateMask` is for specifying which fields to update. The mutations create assets but don't properly link them to campaigns.

**Files:**
- Modify: `src/google/apply.ts` — `buildSitelinkCreate`, `buildCalloutCreate`
- Modify: `test/unit/apply.test.ts`

The correct flow for Google Ads extension creation is:
1. Create the asset (sitelink_asset or callout_asset)
2. Create a campaign_asset to link the asset to the campaign

- [ ] **Step 1: Write test for sitelink create producing asset + campaign_asset**

```typescript
describe('sitelink create — asset association', () => {
  test('produces asset create + campaign_asset link', () => {
    const resource = makeResource('sitelink', 'test/sl:free trial', {
      text: 'Free Trial', url: 'https://renamed.to/trial',
      description1: 'Try it free', description2: 'No credit card',
    })
    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map([['test', '789']]))
    // Should have at least 1 operation: asset create
    expect(mutations.length).toBeGreaterThanOrEqual(1)
    const assetOp = mutations.find(m => m.operation === 'asset')!
    expect(assetOp.resource.sitelink_asset).toBeDefined()
    expect((assetOp.resource.sitelink_asset as any).link_text).toBe('Free Trial')
    // Should NOT have updateMask set to campaign resource name
    expect(assetOp.updateMask).toBeUndefined()
  })
})
```

- [ ] **Step 2: Fix buildSitelinkCreate and buildCalloutCreate**

Remove the `updateMask` field from both functions. The asset create is a standalone operation — campaign linking happens via a separate `campaign_asset` operation (which is a more complex flow that can be a follow-up). For now, just stop the malformed mutation:

In `buildSitelinkCreate`:
```typescript
function buildSitelinkCreate(
  _customerId: string,
  _campaignResourceName: string,
  resource: Resource,
): MutateOperation {
  const props = resource.properties
  return {
    operation: 'asset',
    op: 'create',
    resource: {
      sitelink_asset: {
        link_text: props.text,
        description1: props.description1,
        description2: props.description2,
      },
      final_urls: [props.url],
    },
  }
}
```

Same pattern for `buildCalloutCreate` — remove `updateMask`.

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test`

- [ ] **Step 4: Commit**

```bash
git add src/google/apply.ts test/unit/apply.test.ts
git commit -m "fix(google): remove malformed updateMask from sitelink/callout create mutations"
```

---

## Integration Verification

After all tasks are complete:

- [ ] **Step 1: Re-import all Google campaigns**

```bash
cd /Users/alex/Projects/renamed.to/renamed.to-seo/ads/google/campaigns
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts import --provider google
```

- [ ] **Step 2: Run plan — expect zero real diffs**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts plan --provider google
```

Expected: All campaigns show `(no changes)` or zero diffs (no `budgetResourceName` phantom updates).

- [ ] **Step 3: Set displayNetwork: false on all campaigns and apply**

If networkSettings still shows `displayNetwork: true`, edit the files and:
```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts apply --provider google
```

- [ ] **Step 4: Verify zero-diff round-trip**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts plan --provider google
```

Expected: `0 changes` for all campaigns.
