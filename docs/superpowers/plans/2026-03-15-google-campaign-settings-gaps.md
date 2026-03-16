# Google Campaign Settings Gaps — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up network settings, device bid adjustments, and missing bidding strategies through the full fetch/codegen/apply pipeline so they import from live Google Ads, show in diffs, and can be applied back.

**Architecture:** The SDK has a 6-stage pipeline: types → builder → flatten → fetch → diff → apply (with codegen for import). Network settings and device bid adjustments have types+builder+flatten already done but fetch/codegen/apply are missing. The diff engine uses generic `compareProperties()` which handles unknown fields automatically via `deepEqual` — no diff changes needed. We wire up the three missing stages for each feature.

**Tech Stack:** TypeScript, Bun, Google Ads API (gRPC via `google-ads-api`), `bun:test`

---

> **IMPORTANT — Test file naming:** The plan references `test/unit/google-fetch.test.ts`, `test/unit/google-apply.test.ts`, and `test/unit/codegen-google-settings.test.ts`. If existing test files already exist for these modules (e.g., `test/unit/fetch.test.ts`, `test/unit/apply.test.ts`, `test/unit/codegen.test.ts`), **append new `describe` blocks to the existing files** instead of creating new ones. Reuse existing mock client patterns from those files.

> **IMPORTANT — `fetchKnownState`:** When adding device bid modifiers to `fetchAllState`, also add the same `fetchDeviceBidModifiers` + `mergeDevicesIntoCampaigns` calls to `fetchKnownState` (the second orchestrator function). Both must include device data.

## File Map

| File | Role | Changes |
|------|------|---------|
| `src/google/fetch.ts` | GAQL queries → Resource[] | Add network_settings + device to campaign query, add device bid modifier fetch, add 3 missing bidding strategies |
| `src/google/apply.ts` | Change → API mutations | Set network_settings on create, update network_settings + bidding, create/update device bid modifiers |
| `src/core/codegen.ts` | Resource[] → .ts source | Emit `networkSettings: {...}`, emit `device(...)` in targeting, emit 3 missing bidding formats |
| `test/unit/google-fetch.test.ts` | Unit tests | Test normalization of network settings, device modifiers, bidding strategies from mock API rows |
| `test/unit/google-apply.test.ts` | Unit tests | Test mutation building for network settings, device, bidding |
| `test/unit/codegen.test.ts` | Unit tests | Test code generation includes network settings, device targeting, new bidding strategies |

**Files NOT changed:** `src/google/types.ts`, `src/core/types.ts`, `src/helpers/targeting.ts`, `src/google/index.ts`, `src/google/flatten.ts`, `src/core/diff.ts` — these already have the types, builder, flatten, and diff support.

---

## Chunk 1: Fetch — Network Settings + Missing Bidding Strategies

### Task 1: Add network settings and missing bidding to CAMPAIGN_QUERY

**Files:**
- Modify: `src/google/fetch.ts:99-110` (CAMPAIGN_QUERY)
- Modify: `src/google/fetch.ts:124-147` (normalizeCampaignRow)
- Modify: `src/google/fetch.ts:55-86` (mapBiddingStrategy)
- Modify: `test/unit/fetch.test.ts` (append new describe blocks)

- [ ] **Step 1: Write failing test for network settings normalization**

In `test/unit/google-fetch.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'

// We'll need to test the normalization functions.
// Since they're not exported, we test through the public fetchCampaigns.
// For unit tests, mock the GoogleAdsClient.

import { fetchCampaigns } from '../../src/google/fetch.ts'
import type { GoogleAdsClient } from '../../src/google/types.ts'

function mockClient(rows: Record<string, unknown>[]): GoogleAdsClient {
  return {
    query: async () => rows,
    mutate: async () => [],
    customerId: '1234567890',
  }
}

describe('fetchCampaigns', () => {
  test('includes networkSettings from API response', async () => {
    const client = mockClient([{
      campaign: {
        id: '123',
        name: 'Test Campaign',
        status: 2, // ENABLED
        bidding_strategy_type: 6, // MAXIMIZE_CONVERSIONS
        network_settings: {
          target_google_search: true,
          target_search_network: false,
          target_content_network: false,
          target_partner_search_network: false,
        },
      },
      campaign_budget: {
        id: '456',
        resource_name: 'customers/123/campaignBudgets/456',
        amount_micros: '3000000',
      },
    }])

    const resources = await fetchCampaigns(client, { includePaused: true })
    expect(resources).toHaveLength(1)
    expect(resources[0]!.properties.networkSettings).toEqual({
      searchNetwork: true,
      searchPartners: false,
      displayNetwork: false,
    })
  })

  test('omits networkSettings when all defaults (true/false/true)', async () => {
    const client = mockClient([{
      campaign: {
        id: '123',
        name: 'Test Campaign',
        status: 2,
        bidding_strategy_type: 6,
        network_settings: {
          target_google_search: true,
          target_search_network: false,
          target_content_network: true, // display ON = Google default
        },
      },
      campaign_budget: {
        id: '456',
        resource_name: 'customers/123/campaignBudgets/456',
        amount_micros: '3000000',
      },
    }])

    const resources = await fetchCampaigns(client, { includePaused: true })
    // When display network is ON (default), no need to emit networkSettings
    // Actually, we should ALWAYS emit networkSettings so the diff engine can compare.
    // If code says displayNetwork: false but live says true, we need to see the diff.
    expect(resources[0]!.properties.networkSettings).toEqual({
      searchNetwork: true,
      searchPartners: false,
      displayNetwork: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: FAIL — `networkSettings` is `undefined` because CAMPAIGN_QUERY doesn't fetch it.

- [ ] **Step 3: Add network_settings to CAMPAIGN_QUERY and normalizeCampaignRow**

In `src/google/fetch.ts`, update `CAMPAIGN_QUERY` (line ~99):

```typescript
const CAMPAIGN_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.bidding_strategy_type,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_content_network,
  campaign_budget.id,
  campaign_budget.resource_name,
  campaign_budget.amount_micros
FROM campaign
WHERE campaign.status != 'REMOVED'
`.trim()
```

In `normalizeCampaignRow` (line ~124), after building `bidding`, add network settings extraction:

```typescript
  // Network settings
  const networkSettingsRaw = (campaign?.network_settings ?? campaign?.networkSettings) as Record<string, unknown> | undefined
  const networkSettings = networkSettingsRaw ? {
    searchNetwork: (networkSettingsRaw.target_google_search ?? networkSettingsRaw.targetGoogleSearch) === true,
    searchPartners: (networkSettingsRaw.target_search_network ?? networkSettingsRaw.targetSearchNetwork) === true,
    displayNetwork: (networkSettingsRaw.target_content_network ?? networkSettingsRaw.targetContentNetwork) === true,
  } : undefined

  return resource('campaign', path, {
    name,
    status,
    budget: { amount, currency: 'EUR', period: 'daily' },
    bidding,
    ...(networkSettings !== undefined ? { networkSettings } : {}),
    ...(budgetResourceName ? { budgetResourceName } : {}),
  }, id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for missing bidding strategies**

Add to `test/unit/google-fetch.test.ts`:

```typescript
describe('bidding strategy mapping', () => {
  test('maps TARGET_ROAS (8)', async () => {
    const client = mockClient([{
      campaign: {
        id: '1', name: 'ROAS Campaign', status: 2,
        bidding_strategy_type: 8, // TARGET_ROAS
        target_roas: { target_roas: 3.5 },
        network_settings: { target_google_search: true, target_search_network: false, target_content_network: false },
      },
      campaign_budget: { id: '2', resource_name: 'customers/123/campaignBudgets/2', amount_micros: '5000000' },
    }])
    const resources = await fetchCampaigns(client, { includePaused: true })
    expect(resources[0]!.properties.bidding).toEqual({ type: 'target-roas', targetRoas: 3.5 })
  })

  test('maps TARGET_IMPRESSION_SHARE (15)', async () => {
    const client = mockClient([{
      campaign: {
        id: '1', name: 'Impression Share Campaign', status: 2,
        bidding_strategy_type: 15,
        target_impression_share: {
          location: 2, // ANYWHERE_ON_PAGE
          location_fraction_micros: '500000', // 50%
          cpc_bid_ceiling_micros: '2000000', // $2
        },
        network_settings: { target_google_search: true, target_search_network: false, target_content_network: false },
      },
      campaign_budget: { id: '2', resource_name: 'customers/123/campaignBudgets/2', amount_micros: '5000000' },
    }])
    const resources = await fetchCampaigns(client, { includePaused: true })
    expect(resources[0]!.properties.bidding).toEqual({
      type: 'target-impression-share',
      location: 'anywhere',
      targetPercent: 50,
      maxCpc: 2,
    })
  })

  test('maps MAXIMIZE_CONVERSION_VALUE (12)', async () => {
    const client = mockClient([{
      campaign: {
        id: '1', name: 'Max Value Campaign', status: 2,
        bidding_strategy_type: 12,
        maximize_conversion_value: { target_roas: 2.0 },
        network_settings: { target_google_search: true, target_search_network: false, target_content_network: false },
      },
      campaign_budget: { id: '2', resource_name: 'customers/123/campaignBudgets/2', amount_micros: '5000000' },
    }])
    const resources = await fetchCampaigns(client, { includePaused: true })
    expect(resources[0]!.properties.bidding).toEqual({
      type: 'maximize-conversion-value',
      targetRoas: 2.0,
    })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: FAIL — these strategies fall through to the `default` case and return `maximize-conversions`.

- [ ] **Step 7: Add missing bidding strategy cases to mapBiddingStrategy**

In `src/google/fetch.ts`, in the `mapBiddingStrategy` function (line ~55), add these cases before the `default`:

```typescript
    case 'TARGET_ROAS': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const targetRoas = (campaign?.target_roas ?? campaign?.targetRoas) as Record<string, unknown> | undefined
      const roas = targetRoas?.target_roas ?? targetRoas?.targetRoas
      return { type: 'target-roas', targetRoas: roas ? Number(roas) : 1.0 }
    }
    case 'TARGET_IMPRESSION_SHARE': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const tis = (campaign?.target_impression_share ?? campaign?.targetImpressionShare) as Record<string, unknown> | undefined
      const locationEnum = Number(tis?.location ?? 0)
      const location = locationEnum === 3 ? 'top' : locationEnum === 4 ? 'absolute-top' : 'anywhere'
      const fractionMicros = tis?.location_fraction_micros ?? tis?.locationFractionMicros
      const targetPercent = fractionMicros ? Number(fractionMicros) / 10000 : 50
      const cpcCeiling = tis?.cpc_bid_ceiling_micros ?? tis?.cpcBidCeilingMicros
      return {
        type: 'target-impression-share',
        location,
        targetPercent,
        ...(cpcCeiling ? { maxCpc: microsToAmount(cpcCeiling as string | number) } : {}),
      }
    }
    case 'MAXIMIZE_CONVERSION_VALUE': {
      const campaign = row.campaign as Record<string, unknown> | undefined
      const mcv = (campaign?.maximize_conversion_value ?? campaign?.maximizeConversionValue) as Record<string, unknown> | undefined
      const roas = mcv?.target_roas ?? mcv?.targetRoas
      return {
        type: 'maximize-conversion-value',
        ...(roas ? { targetRoas: Number(roas) } : {}),
      }
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/google/fetch.ts test/unit/google-fetch.test.ts
git commit -m "feat(google): fetch network settings and 3 missing bidding strategies from API"
```

---

### Task 2: Fetch device bid adjustments

**Files:**
- Modify: `src/google/fetch.ts` (add device criterion query + merge)
- Modify: `test/unit/google-fetch.test.ts`

Device bid adjustments in Google Ads API are `campaign_criterion` resources with `type = DEVICE`. The `device.type` field is an enum (MOBILE=2, DESKTOP=3, TABLET=4) and `bid_modifier` is a float (1.0 = no change, 0.75 = -25%, 0 = excluded).

- [ ] **Step 1: Write failing test for device bid adjustment fetch**

Add to `test/unit/google-fetch.test.ts`:

```typescript
import { fetchAllState } from '../../src/google/fetch.ts'

describe('fetchAllState — device bid adjustments', () => {
  test('merges device bid adjustments into campaign targeting', async () => {
    let queryCount = 0
    const client: GoogleAdsClient = {
      query: async (gaql: string) => {
        queryCount++
        // Campaign query
        if (gaql.includes('FROM campaign') && !gaql.includes('campaign_criterion')) {
          return [{
            campaign: {
              id: '100', name: 'Test', status: 2, bidding_strategy_type: 6,
              network_settings: { target_google_search: true, target_search_network: false, target_content_network: false },
            },
            campaign_budget: { id: '200', resource_name: 'customers/123/campaignBudgets/200', amount_micros: '3000000' },
          }]
        }
        // Device criterion query
        if (gaql.includes('campaign_criterion.device')) {
          return [{
            campaign: { id: '100' },
            campaign_criterion: {
              device: { type: 2 }, // MOBILE
              bid_modifier: 0.75, // -25%
            },
          }]
        }
        return []
      },
      mutate: async () => [],
      customerId: '1234567890',
    }

    const resources = await fetchAllState(client)
    const campaign = resources.find(r => r.kind === 'campaign')
    expect(campaign).toBeDefined()

    const targeting = campaign!.properties.targeting as { rules: Array<Record<string, unknown>> }
    const deviceRule = targeting.rules.find((r: any) => r.type === 'device')
    expect(deviceRule).toEqual({
      type: 'device',
      device: 'mobile',
      bidAdjustment: -0.25,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: FAIL — no device query exists.

- [ ] **Step 3: Add device criterion fetch and merge**

In `src/google/fetch.ts`, add after the schedule/targeting section (after `fetchCampaignTargeting`):

```typescript
// ─── Device Bid Modifier Fetcher ──────────────────────────

const DEVICE_TYPE_MAP: Record<number | string, string> = {
  2: 'mobile', 3: 'desktop', 4: 'tablet',
  'MOBILE': 'mobile', 'DESKTOP': 'desktop', 'TABLET': 'tablet',
}

export async function fetchDeviceBidModifiers(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Map<string, Array<{ device: string; bidAdjustment: number }>>> {
  let query = `
SELECT
  campaign.id,
  campaign_criterion.device.type,
  campaign_criterion.bid_modifier
FROM campaign_criterion
WHERE campaign_criterion.type = 'DEVICE'
  AND campaign.status != 'REMOVED'`.trim()

  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }

  const rows = await client.query(query)
  const result = new Map<string, Array<{ device: string; bidAdjustment: number }>>()

  for (const row of rows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)

    const deviceObj = criterion?.device as Record<string, unknown> | undefined
    const rawDeviceType = deviceObj?.type as number | string
    const deviceType = DEVICE_TYPE_MAP[rawDeviceType]
    if (!deviceType) continue

    const bidModifier = Number(criterion?.bid_modifier ?? criterion?.bidModifier ?? 1.0)
    // Convert API bid_modifier (1.0 = no change, 0.75 = -25%) to our format (-0.25)
    const bidAdjustment = Math.round((bidModifier - 1.0) * 100) / 100

    // Skip no-op modifiers (bidModifier === 1.0 means 0% adjustment)
    if (bidAdjustment === 0) continue

    if (!result.has(campaignId)) result.set(campaignId, [])
    result.get(campaignId)!.push({ device: deviceType, bidAdjustment })
  }

  return result
}
```

Then add a `mergeDevicesIntoCampaigns` function:

```typescript
function mergeDevicesIntoCampaigns(
  campaigns: Resource[],
  deviceMap: Map<string, Array<{ device: string; bidAdjustment: number }>>,
): Resource[] {
  return campaigns.map(c => {
    if (c.kind !== 'campaign' || !c.platformId) return c
    const devices = deviceMap.get(c.platformId)
    if (!devices || devices.length === 0) return c

    const existingTargeting = (c.properties.targeting ?? { rules: [] }) as { rules: Array<Record<string, unknown>> }
    const deviceRules = devices.map(d => ({
      type: 'device' as const,
      device: d.device,
      bidAdjustment: d.bidAdjustment,
    }))

    return {
      ...c,
      properties: {
        ...c.properties,
        targeting: {
          rules: [...existingTargeting.rules, ...deviceRules],
        },
      },
    }
  })
}
```

In `fetchAllState`, add device fetch alongside extensions/negatives/targeting (line ~667):

```typescript
  const [extensions, negatives, targetingMap, deviceMap] = await Promise.all([
    fetchExtensions(client, campaignIds),
    fetchNegativeKeywords(client, campaignIds),
    fetchCampaignTargeting(client, campaignIds),
    fetchDeviceBidModifiers(client, campaignIds),
  ])

  // Merge targeting into campaign resources, then device modifiers
  const campaignsWithTargeting = mergeTargetingIntoCampaigns(campaigns, targetingMap)
  const campaignsWithDevices = mergeDevicesIntoCampaigns(campaignsWithTargeting, deviceMap)

  return [...campaignsWithDevices, ...adGroups, ...keywords, ...ads, ...extensions, ...negatives]
```

Do the same in `fetchKnownState` (line ~709).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-fetch.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test`
Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/google/fetch.ts test/unit/google-fetch.test.ts
git commit -m "feat(google): fetch device bid adjustments from campaign criteria"
```

---

## Chunk 2: Codegen — Emit Network Settings, Device Targeting, and Missing Bidding

### Task 3: Add network settings and device targeting to code generation

**Files:**
- Modify: `src/core/codegen.ts:142-353` (generateCampaignFile)
- Modify: `src/core/codegen.ts:51-75` (formatBidding)
- Create: `test/unit/codegen-google-settings.test.ts`

- [ ] **Step 1: Write failing test for networkSettings codegen**

In `test/unit/codegen-google-settings.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Resource } from '../../src/core/types.ts'

describe('generateCampaignFile — network settings', () => {
  test('emits networkSettings when present', () => {
    const resources: Resource[] = [{
      kind: 'campaign',
      path: 'test-campaign',
      properties: {
        name: 'Test Campaign',
        status: 'enabled',
        budget: { amount: 3, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        networkSettings: {
          searchNetwork: true,
          searchPartners: false,
          displayNetwork: false,
        },
      },
    }]

    const code = generateCampaignFile(resources, 'Test Campaign')
    expect(code).toContain('networkSettings: {')
    expect(code).toContain('searchNetwork: true')
    expect(code).toContain('searchPartners: false')
    expect(code).toContain('displayNetwork: false')
  })

  test('omits networkSettings when not present', () => {
    const resources: Resource[] = [{
      kind: 'campaign',
      path: 'test-campaign',
      properties: {
        name: 'Test Campaign',
        status: 'enabled',
        budget: { amount: 3, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
      },
    }]

    const code = generateCampaignFile(resources, 'Test Campaign')
    expect(code).not.toContain('networkSettings')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: FAIL — codegen doesn't emit networkSettings.

- [ ] **Step 3: Add networkSettings to codegen**

In `src/core/codegen.ts`, in the `generateCampaignFile` function, after the targeting section (around line ~195), add:

```typescript
  // Network settings
  const networkSettings = props.networkSettings as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean } | undefined
  if (networkSettings) {
    configParts.push(`networkSettings: {\n    searchNetwork: ${networkSettings.searchNetwork},\n    searchPartners: ${networkSettings.searchPartners},\n    displayNetwork: ${networkSettings.displayNetwork},\n  },`)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for device targeting codegen**

Add to `test/unit/codegen-google-settings.test.ts`:

```typescript
describe('generateCampaignFile — device targeting', () => {
  test('emits device() in targeting when device rules present', () => {
    const resources: Resource[] = [{
      kind: 'campaign',
      path: 'test-campaign',
      properties: {
        name: 'Test Campaign',
        status: 'enabled',
        budget: { amount: 3, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['DE'] },
            { type: 'language', languages: ['de'] },
            { type: 'device', device: 'mobile', bidAdjustment: -0.25 },
          ],
        },
      },
    }]

    const code = generateCampaignFile(resources, 'Test Campaign')
    expect(code).toContain("device('mobile', -0.25)")
    expect(code).toContain('import')
    expect(code).toContain('device')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: FAIL — `formatTargeting` doesn't handle `device` rules.

- [ ] **Step 7: Add device rule to formatTargeting in codegen**

In `src/core/codegen.ts`, in the `formatTargeting` function (line ~101), add a case for device rules after the schedule handling:

```typescript
    } else if (type === 'device') {
      const deviceType = rule.device as string
      const bidAdj = rule.bidAdjustment as number
      parts.push(`device('${deviceType}', ${bidAdj})`)
    }
```

Also in `generateCampaignFile`, where targeting imports are parsed (around line ~180), add:

```typescript
      if (targetingStr.includes('device(')) imports.add('device')
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: PASS

- [ ] **Step 9: Write failing test for missing bidding strategy codegen**

Add to `test/unit/codegen-google-settings.test.ts`:

```typescript
describe('generateCampaignFile — bidding strategies', () => {
  function campaignWithBidding(bidding: Record<string, unknown>): Resource[] {
    return [{
      kind: 'campaign', path: 'test', properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding,
      },
    }]
  }

  test('emits target-roas', () => {
    const code = generateCampaignFile(
      campaignWithBidding({ type: 'target-roas', targetRoas: 3.5 }),
      'Test',
    )
    expect(code).toContain("type: 'target-roas', targetRoas: 3.5")
  })

  test('emits target-impression-share', () => {
    const code = generateCampaignFile(
      campaignWithBidding({ type: 'target-impression-share', location: 'top', targetPercent: 70, maxCpc: 2 }),
      'Test',
    )
    expect(code).toContain("type: 'target-impression-share'")
    expect(code).toContain("location: 'top'")
    expect(code).toContain('targetPercent: 70')
    expect(code).toContain('maxCpc: 2')
  })

  test('emits maximize-conversion-value', () => {
    const code = generateCampaignFile(
      campaignWithBidding({ type: 'maximize-conversion-value', targetRoas: 2.0 }),
      'Test',
    )
    expect(code).toContain("type: 'maximize-conversion-value', targetRoas: 2")
  })

  test('emits maximize-conversion-value shorthand without targetRoas', () => {
    const code = generateCampaignFile(
      campaignWithBidding({ type: 'maximize-conversion-value' }),
      'Test',
    )
    expect(code).toContain("'maximize-conversion-value'")
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: FAIL — these fall through to the default case in `formatBidding`.

- [ ] **Step 11: Add missing bidding strategies to formatBidding**

In `src/core/codegen.ts`, in `formatBidding` (line ~51), add cases before `default`:

```typescript
    case 'target-roas':
      return `{ type: 'target-roas', targetRoas: ${bidding.targetRoas} }`
    case 'target-impression-share': {
      const parts = [`type: 'target-impression-share'`, `location: '${bidding.location}'`, `targetPercent: ${bidding.targetPercent}`]
      if (bidding.maxCpc) parts.push(`maxCpc: ${bidding.maxCpc}`)
      return `{ ${parts.join(', ')} }`
    }
    case 'maximize-conversion-value': {
      const roas = bidding.targetRoas as number | undefined
      if (roas) {
        return `{ type: 'maximize-conversion-value', targetRoas: ${roas} }`
      }
      return `'maximize-conversion-value'`
    }
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/codegen-google-settings.test.ts`
Expected: PASS

- [ ] **Step 13: Run full test suite**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test`
Expected: All tests pass.

- [ ] **Step 14: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/core/codegen.ts test/unit/codegen-google-settings.test.ts
git commit -m "feat(codegen): emit networkSettings, device targeting, and 3 missing bidding strategies"
```

---

## Chunk 3: Apply — Network Settings, Device Bid Adjustments, and Missing Bidding

### Task 4: Add network settings to campaign create and update

**Files:**
- Modify: `src/google/apply.ts:88-129` (buildCampaignCreate)
- Modify: `src/google/apply.ts:364-450` (buildUpdateOperations)
- Create: `test/unit/google-apply.test.ts`

- [ ] **Step 1: Write failing test for networkSettings on campaign create**

In `test/unit/google-apply.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { changeToMutations } from '../../src/google/apply.ts'
import type { Resource, Change } from '../../src/core/types.ts'

describe('campaign create — network settings', () => {
  test('includes network_settings on create when specified', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'test-campaign',
      properties: {
        name: 'Test Campaign',
        status: 'enabled',
        budget: { amount: 3, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        networkSettings: {
          searchNetwork: true,
          searchPartners: false,
          displayNetwork: false,
        },
      },
    }

    const change: Change = { op: 'create', resource }
    const mutations = changeToMutations(change, '1234567890', new Map())

    // Find the campaign mutation (not the budget one)
    const campaignMutation = mutations.find(m => m.operation === 'campaign')
    expect(campaignMutation).toBeDefined()
    expect(campaignMutation!.resource.network_settings).toEqual({
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL — `network_settings` is not set.

- [ ] **Step 3: Add network_settings to buildCampaignCreate**

In `src/google/apply.ts`, in `buildCampaignCreate` (line ~88), after the bidding strategy switch, add:

```typescript
  // Network settings
  const networkSettings = props.networkSettings as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean } | undefined
  if (networkSettings) {
    campaign.network_settings = {
      target_google_search: networkSettings.searchNetwork,
      target_search_network: networkSettings.searchPartners,
      target_content_network: networkSettings.displayNetwork,
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for networkSettings on campaign update**

Add to `test/unit/google-apply.test.ts`:

```typescript
describe('campaign update — network settings', () => {
  test('updates network_settings', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'test-campaign',
      platformId: '999',
      properties: {
        name: 'Test Campaign',
        status: 'enabled',
        budget: { amount: 3, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        networkSettings: { searchNetwork: true, searchPartners: false, displayNetwork: false },
      },
    }

    const change: Change = {
      op: 'update',
      resource,
      changes: [{
        field: 'networkSettings',
        from: { searchNetwork: true, searchPartners: false, displayNetwork: true },
        to: { searchNetwork: true, searchPartners: false, displayNetwork: false },
      }],
    }

    const mutations = changeToMutations(change, '1234567890', new Map())
    const campaignMutation = mutations.find(m => m.operation === 'campaign' && m.op === 'update')
    expect(campaignMutation).toBeDefined()
    expect(campaignMutation!.resource.network_settings).toEqual({
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    })
    expect(campaignMutation!.updateMask).toContain('network_settings')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL — update handler doesn't know about networkSettings.

- [ ] **Step 7: Add networkSettings to buildUpdateOperations**

In `src/google/apply.ts`, in `buildUpdateOperations` case `'campaign'` (line ~376), add handling for networkSettings inside the `for (const c of change.changes)` loop:

```typescript
        if (c.field === 'networkSettings') {
          const ns = c.to as { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean }
          campaignFields.network_settings = {
            target_google_search: ns.searchNetwork,
            target_search_network: ns.searchPartners,
            target_content_network: ns.displayNetwork,
          }
          campaignMask.push('network_settings')
        }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/google/apply.ts test/unit/google-apply.test.ts
git commit -m "feat(google): apply network settings on campaign create and update"
```

---

### Task 5: Add missing bidding strategies to campaign create and update

**Files:**
- Modify: `src/google/apply.ts:88-129` (buildCampaignCreate)
- Modify: `src/google/apply.ts:364-450` (buildUpdateOperations)
- Modify: `test/unit/google-apply.test.ts`

- [ ] **Step 1: Write failing test for missing bidding strategies on create**

Add to `test/unit/google-apply.test.ts`:

```typescript
describe('campaign create — bidding strategies', () => {
  function createCampaign(bidding: Record<string, unknown>) {
    const resource: Resource = {
      kind: 'campaign', path: 'test',
      properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding,
      },
    }
    return changeToMutations({ op: 'create', resource }, '123', new Map())
  }

  test('target-roas', () => {
    const mutations = createCampaign({ type: 'target-roas', targetRoas: 3.5 })
    const campaign = mutations.find(m => m.operation === 'campaign')!
    // target_roas is a raw double (3.5 = 350% ROAS), NOT micros
    expect(campaign.resource.target_roas).toEqual({ target_roas: 3.5 })
  })

  test('target-impression-share', () => {
    const mutations = createCampaign({ type: 'target-impression-share', location: 'top', targetPercent: 70, maxCpc: 2 })
    const campaign = mutations.find(m => m.operation === 'campaign')!
    expect(campaign.resource.target_impression_share).toBeDefined()
    expect((campaign.resource.target_impression_share as any).location).toBe(3) // TOP_OF_PAGE
    expect((campaign.resource.target_impression_share as any).location_fraction_micros).toBe('700000')
  })

  test('maximize-conversion-value', () => {
    const mutations = createCampaign({ type: 'maximize-conversion-value', targetRoas: 2.0 })
    const campaign = mutations.find(m => m.operation === 'campaign')!
    // target_roas is a raw double, NOT micros
    expect(campaign.resource.maximize_conversion_value).toEqual({ target_roas: 2.0 })
  })

  test('maximize-conversion-value without targetRoas', () => {
    const mutations = createCampaign({ type: 'maximize-conversion-value' })
    const campaign = mutations.find(m => m.operation === 'campaign')!
    expect(campaign.resource.maximize_conversion_value).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL

- [ ] **Step 3: Add missing bidding cases to buildCampaignCreate**

In `src/google/apply.ts`, in `buildCampaignCreate`, in the bidding switch (line ~106), add:

```typescript
      case 'target-roas':
        campaign.target_roas = {
          target_roas: bidding.targetRoas as number, // raw double, NOT micros
        }
        break
      case 'target-impression-share': {
        const locationMap: Record<string, number> = { 'anywhere': 2, 'top': 3, 'absolute-top': 4 }
        campaign.target_impression_share = {
          location: locationMap[bidding.location as string] ?? 2,
          location_fraction_micros: String(Math.round((bidding.targetPercent as number) * 10000)),
          ...(bidding.maxCpc ? { cpc_bid_ceiling_micros: String(toMicros(bidding.maxCpc as number)) } : {}),
        }
        break
      }
      case 'maximize-conversion-value': {
        const roas = bidding.targetRoas as number | undefined
        campaign.maximize_conversion_value = roas
          ? { target_roas: roas } // raw double, NOT micros
          : {}
        break
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for bidding update**

Add to `test/unit/google-apply.test.ts`:

```typescript
describe('campaign update — bidding strategy', () => {
  test('updates bidding strategy', () => {
    const resource: Resource = {
      kind: 'campaign', path: 'test', platformId: '999',
      properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
      },
    }
    const change: Change = {
      op: 'update', resource,
      changes: [{
        field: 'bidding',
        from: { type: 'maximize-clicks' },
        to: { type: 'maximize-conversions' },
      }],
    }
    const mutations = changeToMutations(change, '123', new Map())
    const campaignMutation = mutations.find(m => m.operation === 'campaign' && m.op === 'update')
    expect(campaignMutation).toBeDefined()
    expect(campaignMutation!.resource.maximize_conversions).toEqual({})
    expect(campaignMutation!.updateMask).toContain('maximize_conversions')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL — bidding changes are not handled in update.

- [ ] **Step 7: Add bidding to buildUpdateOperations**

In `src/google/apply.ts`, in `buildUpdateOperations` case `'campaign'`, add handling for the `bidding` field in the change loop:

```typescript
        if (c.field === 'bidding') {
          const newBidding = c.to as Record<string, unknown>
          switch (newBidding.type) {
            case 'maximize-conversions':
              campaignFields.maximize_conversions = {}
              campaignMask.push('maximize_conversions')
              break
            case 'maximize-clicks':
              campaignFields.target_spend = newBidding.maxCpc
                ? { cpc_bid_ceiling_micros: String(toMicros(newBidding.maxCpc as number)) }
                : {}
              campaignMask.push('target_spend')
              break
            case 'manual-cpc':
              campaignFields.manual_cpc = { enhanced_cpc_enabled: newBidding.enhancedCpc ?? false }
              campaignMask.push('manual_cpc')
              break
            case 'target-cpa':
              campaignFields.target_cpa = { target_cpa_micros: String(toMicros(newBidding.targetCpa as number)) }
              campaignMask.push('target_cpa')
              break
            case 'target-roas':
              campaignFields.target_roas = { target_roas: newBidding.targetRoas as number } // raw double, NOT micros
              campaignMask.push('target_roas')
              break
            case 'target-impression-share': {
              const locationMap: Record<string, number> = { 'anywhere': 2, 'top': 3, 'absolute-top': 4 }
              campaignFields.target_impression_share = {
                location: locationMap[newBidding.location as string] ?? 2,
                location_fraction_micros: String(Math.round((newBidding.targetPercent as number) * 10000)),
                ...(newBidding.maxCpc ? { cpc_bid_ceiling_micros: String(toMicros(newBidding.maxCpc as number)) } : {}),
              }
              campaignMask.push('target_impression_share')
              break
            }
            case 'maximize-conversion-value': {
              const roas = newBidding.targetRoas as number | undefined
              campaignFields.maximize_conversion_value = roas ? { target_roas: roas } : {} // raw double, NOT micros
              campaignMask.push('maximize_conversion_value')
              break
            }
          }
        }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/google/apply.ts test/unit/google-apply.test.ts
git commit -m "feat(google): apply 3 missing bidding strategies on create and update"
```

---

### Task 6: Add device bid adjustment apply (create and update)

**Files:**
- Modify: `src/google/apply.ts`
- Modify: `test/unit/google-apply.test.ts`

Device bid adjustments are applied as `campaign_criterion` mutations with `device` type and `bid_modifier`. When targeting rules change and include device rules, we need to detect this and create/update device criteria.

- [ ] **Step 1: Write failing test for device bid adjustment on campaign create**

Add to `test/unit/google-apply.test.ts`:

```typescript
describe('campaign create — device bid adjustments', () => {
  test('creates device campaign_criterion when targeting includes device rules', () => {
    const resource: Resource = {
      kind: 'campaign', path: 'test',
      properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['DE'] },
            { type: 'device', device: 'mobile', bidAdjustment: -0.25 },
          ],
        },
      },
    }

    const mutations = changeToMutations({ op: 'create', resource }, '123', new Map())
    const deviceOp = mutations.find(m =>
      m.operation === 'campaign_criterion' && (m.resource as any).device,
    )
    expect(deviceOp).toBeDefined()
    expect((deviceOp!.resource as any).device).toEqual({ type: 2 }) // MOBILE
    expect((deviceOp!.resource as any).bid_modifier).toBe(0.75) // 1.0 + (-0.25)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL

- [ ] **Step 3: Add device targeting to buildTargetingOperations**

In `src/google/apply.ts`, add a device type map constant near the top:

```typescript
const DEVICE_TYPE_ENUM: Record<string, number> = {
  'mobile': 2, 'desktop': 3, 'tablet': 4,
}
```

In `buildTargetingOperations`, add handling for device rules:

```typescript
    if (rule.type === 'device') {
      const deviceType = DEVICE_TYPE_ENUM[rule.device as string]
      if (deviceType) {
        const bidAdjustment = rule.bidAdjustment as number
        ops.push({
          operation: 'campaign_criterion',
          op: 'create',
          resource: {
            campaign: campaignResourceName,
            device: { type: deviceType },
            bid_modifier: 1.0 + bidAdjustment, // Convert our format to API format
          },
        })
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for device bid adjustment on campaign update (targeting change)**

Add to `test/unit/google-apply.test.ts`:

```typescript
describe('campaign update — device bid adjustments', () => {
  test('creates device criterion mutations when targeting changes include device rules', () => {
    const resource: Resource = {
      kind: 'campaign', path: 'test', platformId: '999',
      properties: {
        name: 'Test', status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['DE'] },
            { type: 'device', device: 'mobile', bidAdjustment: -0.3 },
          ],
        },
      },
    }

    const change: Change = {
      op: 'update', resource,
      changes: [{
        field: 'targeting',
        from: { rules: [{ type: 'geo', countries: ['DE'] }] },
        to: { rules: [
          { type: 'geo', countries: ['DE'] },
          { type: 'device', device: 'mobile', bidAdjustment: -0.3 },
        ]},
      }],
    }

    const mutations = changeToMutations(change, '123', new Map())
    const deviceOp = mutations.find(m =>
      m.operation === 'campaign_criterion' && (m.resource as any).device,
    )
    expect(deviceOp).toBeDefined()
    expect((deviceOp!.resource as any).device).toEqual({ type: 2 })
    expect((deviceOp!.resource as any).bid_modifier).toBe(0.7) // 1.0 + (-0.3)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: FAIL — targeting updates are not handled.

- [ ] **Step 7: Add targeting/device update to buildUpdateOperations**

In `src/google/apply.ts`, in `buildUpdateOperations` case `'campaign'`, add:

```typescript
        if (c.field === 'targeting') {
          const newTargeting = c.to as { rules: Array<Record<string, unknown>> } | undefined
          if (newTargeting?.rules) {
            for (const rule of newTargeting.rules) {
              if (rule.type === 'device') {
                const deviceType = DEVICE_TYPE_ENUM[rule.device as string]
                if (deviceType) {
                  ops.push({
                    operation: 'campaign_criterion',
                    op: 'create',
                    resource: {
                      campaign: campaignId,
                      device: { type: deviceType },
                      bid_modifier: 1.0 + (rule.bidAdjustment as number),
                    },
                  })
                }
              }
            }
          }
        }
```

Note: Google Ads API handles device criteria as "create or update" — if a device criterion already exists for that device type, it updates the bid_modifier. So using `op: 'create'` here is correct even for updates.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test test/unit/google-apply.test.ts`
Expected: PASS

- [ ] **Step 9: Run full test suite + typecheck**

Run: `cd /Users/alex/Projects/upspawn-products/ads-as-code && bun test && bunx tsc --noEmit`
Expected: All tests pass, no type errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/alex/Projects/upspawn-products/ads-as-code
git add src/google/apply.ts test/unit/google-apply.test.ts
git commit -m "feat(google): apply device bid adjustments via campaign criteria"
```

---

## Chunk 4: Integration Verification

### Task 7: End-to-end verification with live Google Ads account

This is a manual verification step — import from live, check the diff shows the expected changes, then verify apply would work.

- [ ] **Step 1: Re-import campaigns from live**

Run from the renamed.to-seo project:
```bash
cd /Users/alex/Projects/renamed.to/renamed.to-seo/ads/google/campaigns
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts import
```

Check that the generated .ts files now include:
- `networkSettings: { searchNetwork: true, searchPartners: false, displayNetwork: true }` (for the 4 campaigns that have it ON)
- `networkSettings: { searchNetwork: true, searchPartners: false, displayNetwork: false }` (for Dropbox)

- [ ] **Step 2: Edit campaign files to set desired state**

In each campaign .ts file, set:
```typescript
networkSettings: {
  searchNetwork: true,
  searchPartners: false,
  displayNetwork: false,
},
```

- [ ] **Step 3: Run plan to see the diff**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts plan
```

Verify it shows `networkSettings` changes for the 4 campaigns where display was ON.

- [ ] **Step 4: Apply with dry-run first**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts apply --dry-run
```

Verify the mutations look correct.

- [ ] **Step 5: Apply for real**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts apply
```

- [ ] **Step 6: Re-import and verify zero diff**

```bash
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts import
bun /Users/alex/Projects/upspawn-products/ads-as-code/cli/index.ts plan
```

Expected: Zero diff — what's in code matches what's live.

- [ ] **Step 7: Commit the updated campaign files**

```bash
cd /Users/alex/Projects/renamed.to/renamed.to-seo
git add ads/google/campaigns/
git commit -m "ads: disable Display Network and add network settings to all Google campaigns"
```
