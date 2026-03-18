# Performance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add performance data fetching, analysis, and AI-evaluated optimization to @upspawn/ads so AI agents can see how campaigns perform, compare against declared targets, and act on structured recommendations.

**Architecture:** Performance targets declared on campaign/ad-group config objects flow through flatten into `Resource.meta.performanceTargets`. A separate `performance/` module fetches metrics from Google (GAQL) and Meta (Insights API), analyzes them against targets (pure function), optionally evaluates freeform `strategy` text via LLM, and produces a typed `PerformanceReport`. CLI exposes `ads performance` and integrates performance data into `ads plan` output.

**Tech Stack:** TypeScript, Bun, bun:sqlite, Vercel AI SDK (for strategy evaluation), google-ads-api (GAQL), Meta Graph API

**Spec:** `docs/superpowers/specs/2026-03-18-performance-module-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/performance/types.ts` | All performance types: PerformanceTargets, Metrics, Data, Violation, Signal, Recommendation, Report |
| `src/performance/analyze.ts` | Pure function: metrics + targets → violations, signals, deterministic recommendations |
| `src/performance/fetch.ts` | Provider-agnostic orchestrator: calls Google/Meta fetchers, normalizes to PerformanceData[] |
| `src/performance/evaluate.ts` | AI strategy evaluation via Vercel AI SDK — strategy text + metrics → recommendations |
| `src/performance/resolve.ts` | Orchestrates: extract targets from Resource.meta, call fetch, analyze, evaluate, produce PerformanceReport |
| `src/google/performance.ts` | GAQL queries for campaign/adGroup/keyword/ad metrics + device/day/search-term breakdowns |
| `src/meta/performance.ts` | Graph API Insights queries for campaign/adSet/ad metrics + device/day/placement/audience breakdowns |
| `cli/performance.ts` | `ads performance` command: parse args, call resolve, format output (human + JSON) |
| `test/unit/performance-types.test.ts` | Type validation tests for PerformanceTargets on builders |
| `test/unit/performance-analyze.test.ts` | Analysis engine tests: violations, signals, recommendations |
| `test/unit/performance-fetch-google.test.ts` | Google GAQL response normalization tests |
| `test/unit/performance-fetch-meta.test.ts` | Meta Insights response normalization tests |
| `test/unit/performance-resolve.test.ts` | Target inheritance, end-to-end resolve tests |
| `test/unit/performance-evaluate.test.ts` | AI evaluation tests with mocked Vercel AI SDK |
| `test/fixtures/performance/google-metrics.ts` | Mock GAQL metric responses |
| `test/fixtures/performance/meta-insights.ts` | Mock Meta Insights API responses |

### Modified files
| File | Change |
|------|--------|
| `src/core/types.ts` | Add `PerformanceConfig` to `AdsConfig` |
| `src/performance/types.ts` | Export `PerformanceTargets` (imported by Google/Meta types) |
| `src/google/types.ts` | Add `performance?: PerformanceTargets` to `SearchCampaignInput`, `DisplayCampaignInput`, `PMaxCampaignInput`, `ShoppingCampaignInput`, `DemandGenCampaignInput`, `SmartCampaignInput`, `AppCampaignInput`, `AdGroupInput`, `DisplayAdGroupInput` |
| `src/meta/types.ts` | Add `performance?: PerformanceTargets` to `MetaCampaignConfig`, `AdSetConfig` |
| `src/google/flatten.ts` | Store `performanceTargets` in `Resource.meta` during flatten |
| `src/meta/flatten.ts` | Store `performanceTargets` in `Resource.meta` during flatten |
| `cli/index.ts` | Add `performance` command route |
| `cli/plan.ts` | Add performance section to plan output |

---

## Task 1: Performance Types

**Files:**
- Create: `src/performance/types.ts`
- Test: `test/unit/performance-types.test.ts`

- [ ] **Step 1: Write type validation tests**

```typescript
// test/unit/performance-types.test.ts
import { describe, test, expect } from 'bun:test'
import type {
  PerformanceTargets,
  PerformanceMetrics,
  PerformanceData,
  PerformanceViolation,
  PerformanceSignal,
  PerformanceRecommendation,
  PerformanceReport,
  PerformanceConfig,
} from '../../src/performance/types.ts'
import { computeMetrics } from '../../src/performance/types.ts'
import type { Budget } from '../../src/core/types.ts'

describe('computeMetrics', () => {
  test('computes derived metrics from raw values', () => {
    const m = computeMetrics({ impressions: 1000, clicks: 50, cost: 100, conversions: 5, conversionValue: 500 })
    expect(m.ctr).toBeCloseTo(0.05)
    expect(m.cpc).toBeCloseTo(2)
    expect(m.cpa).toBeCloseTo(20)
    expect(m.roas).toBeCloseTo(5)
    expect(m.cpm).toBeCloseTo(100)
  })

  test('returns null CPA when zero conversions', () => {
    const m = computeMetrics({ impressions: 1000, clicks: 50, cost: 100, conversions: 0, conversionValue: 0 })
    expect(m.cpa).toBeNull()
    expect(m.ctr).toBeCloseTo(0.05)
  })

  test('returns null ROAS when zero cost', () => {
    const m = computeMetrics({ impressions: 1000, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 })
    expect(m.roas).toBeNull()
    expect(m.cpc).toBeNull()
    expect(m.cpm).toBeCloseTo(0)
  })

  test('returns null CTR and CPM when zero impressions', () => {
    const m = computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 })
    expect(m.ctr).toBeNull()
    expect(m.cpm).toBeNull()
  })
})

describe('PerformanceTargets type', () => {
  test('accepts all optional fields', () => {
    const targets: PerformanceTargets = {
      targetCPA: 15,
      minROAS: 3.5,
      minCTR: 0.02,
      maxCPC: 5,
      maxBudget: { amount: 50, currency: 'EUR', period: 'daily' } as Budget,
      minConversions: 10,
      minImpressionShare: 0.8,
      strategy: 'Scale aggressively',
    }
    expect(targets.targetCPA).toBe(15)
  })

  test('accepts empty targets', () => {
    const targets: PerformanceTargets = {}
    expect(targets.strategy).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write types and computeMetrics**

```typescript
// src/performance/types.ts
import type { Budget, ResourceKind } from '../core/types.ts'

// ─── Performance Targets (declared on campaign/ad-group configs) ─────

export type PerformanceTargets = {
  readonly targetCPA?: number
  readonly minROAS?: number
  readonly minCTR?: number
  readonly maxCPC?: number
  readonly maxBudget?: Budget
  readonly minConversions?: number
  readonly minImpressionShare?: number
  readonly strategy?: string
}

// ─── Performance Config (in ads.config.ts) ───────────────────────────

export type PerformanceConfig = {
  readonly defaultPeriod?: string
  readonly severityThresholds?: {
    readonly warning?: number
    readonly critical?: number
  }
  readonly ai?: {
    readonly model?: string
    readonly provider?: string
  }
}

// ─── Raw Metric Inputs ───────────────────────────────────────────────

export type RawMetrics = {
  readonly impressions: number
  readonly clicks: number
  readonly cost: number
  readonly conversions: number
  readonly conversionValue: number
}

// ─── Computed Metrics ────────────────────────────────────────────────

export type PerformanceMetrics = {
  readonly impressions: number
  readonly clicks: number
  readonly cost: number
  readonly conversions: number
  readonly conversionValue: number
  readonly ctr: number | null
  readonly cpc: number | null
  readonly cpa: number | null
  readonly roas: number | null
  readonly cpm: number | null
  readonly impressionShare?: number
  readonly qualityScore?: number
  readonly frequency?: number
  readonly reach?: number
}

export function computeMetrics(raw: RawMetrics): PerformanceMetrics {
  return {
    ...raw,
    ctr: raw.impressions > 0 ? raw.clicks / raw.impressions : null,
    cpc: raw.clicks > 0 ? raw.cost / raw.clicks : null,
    cpa: raw.conversions > 0 ? raw.cost / raw.conversions : null,
    roas: raw.cost > 0 ? raw.conversionValue / raw.cost : null,
    cpm: raw.impressions > 0 ? (raw.cost / raw.impressions) * 1000 : null,
  }
}

// ─── Performance Data (per-resource snapshot) ────────────────────────

export type PerformanceData = {
  readonly resource: string
  readonly provider: 'google' | 'meta'
  readonly kind: ResourceKind
  readonly period: { readonly start: Date; readonly end: Date }
  readonly metrics: PerformanceMetrics
  readonly targets?: PerformanceTargets
  readonly violations: PerformanceViolation[]
  readonly breakdowns: {
    readonly byDay?: readonly { readonly date: string; readonly metrics: PerformanceMetrics }[]
    readonly byDevice?: Readonly<Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics>>
    readonly byPlacement?: Readonly<Record<string, PerformanceMetrics>>
    readonly byAge?: Readonly<Record<string, PerformanceMetrics>>
    readonly byGender?: Readonly<Record<string, PerformanceMetrics>>
    readonly bySearchTerm?: readonly { readonly term: string; readonly metrics: PerformanceMetrics }[]
  }
}

// ─── Violations ──────────────────────────────────────────────────────

export type PerformanceViolation = {
  readonly metric: 'cpa' | 'roas' | 'ctr' | 'cpc' | 'spend' | 'conversions' | 'impressionShare'
  readonly actual: number
  readonly target: number
  readonly deviation: number
  readonly direction: 'over' | 'under'
  readonly severity: 'warning' | 'critical'
}

// ─── Signals ─────────────────────────────────────────────────────────

export type PerformanceSignalType =
  | 'budget-constrained'
  | 'zero-conversions'
  | 'creative-fatigue'
  | 'spend-concentration'
  | 'declining-trend'
  | 'improving-trend'
  | 'learning-phase'
  | 'high-frequency'
  | 'low-quality-score'
  | 'search-term-opportunity'

export type PerformanceSignal = {
  readonly type: PerformanceSignalType
  readonly severity: 'info' | 'warning' | 'critical'
  readonly resource: string
  readonly message: string
  readonly evidence: Record<string, unknown>
}

// ─── Recommendations ─────────────────────────────────────────────────

export type PerformanceRecommendation =
  | {
      readonly type: 'scale-budget' | 'reduce-budget'
      readonly resource: string
      readonly from: Budget
      readonly to: Budget
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'adjust-bid'
      readonly resource: string
      readonly from: number
      readonly to: number
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'pause-resource' | 'resume-resource' | 'refresh-creative'
      readonly resource: string
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'shift-budget'
      readonly resource: string
      readonly toResource: string
      readonly amount: Budget
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'add-negative'
      readonly resource: string
      readonly keyword: string
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }

// ─── Report ──────────────────────────────────────────────────────────

export type PerformanceReport = {
  readonly generatedAt: Date
  readonly period: { readonly start: Date; readonly end: Date }
  readonly data: PerformanceData[]
  readonly signals: PerformanceSignal[]
  readonly recommendations: PerformanceRecommendation[]
  readonly summary: {
    readonly totalSpend: number
    readonly totalConversions: number
    readonly totalConversionValue: number
    readonly overallCPA: number | null
    readonly overallROAS: number | null
    readonly violationCount: number
    readonly signalCount: { readonly info: number; readonly warning: number; readonly critical: number }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/performance-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/performance/types.ts test/unit/performance-types.test.ts
git commit -m "feat(performance): add performance module types and computeMetrics"
```

---

## Task 2: Add PerformanceTargets to Builder Types

**Files:**
- Modify: `src/google/types.ts:258-271` (SearchCampaignInput)
- Modify: `src/google/types.ts:112-118` (AdGroupInput)
- Modify: `src/google/types.ts:216-228` (DisplayCampaignInput)
- Modify: `src/google/types.ts:230-234` (DisplayAdGroupInput)
- Modify: `src/google/types.ts:347+` (PMaxCampaignInput, ShoppingCampaignInput, DemandGenCampaignInput, SmartCampaignInput, AppCampaignInput)
- Modify: `src/meta/types.ts:237-243` (MetaCampaignConfig)
- Modify: `src/meta/types.ts:247-258` (AdSetConfig)
- Modify: `src/core/types.ts:156-161` (AdsConfig)

- [ ] **Step 1: Write typecheck-validating test**

```typescript
// test/unit/performance-builder-types.test.ts
import { describe, test, expect } from 'bun:test'
import type { SearchCampaignInput, AdGroupInput, DisplayCampaignInput, DisplayAdGroupInput } from '../../src/google/types.ts'
import type { MetaCampaignConfig, AdSetConfig } from '../../src/meta/types.ts'
import type { PerformanceTargets } from '../../src/performance/types.ts'

describe('PerformanceTargets on Google builders', () => {
  test('SearchCampaignInput accepts performance field', () => {
    const input: SearchCampaignInput = {
      budget: { amount: 10, currency: 'EUR', period: 'daily' },
      bidding: 'maximize-conversions',
      performance: { targetCPA: 15, maxBudget: { amount: 50, currency: 'EUR', period: 'daily' } },
    }
    expect(input.performance?.targetCPA).toBe(15)
  })

  test('AdGroupInput accepts performance field', () => {
    const input: AdGroupInput = {
      keywords: [],
      ad: { type: 'rsa', headlines: [] as any, descriptions: [] as any, finalUrl: 'https://example.com' },
      performance: { targetCPA: 10 },
    }
    expect(input.performance?.targetCPA).toBe(10)
  })

  test('DisplayCampaignInput accepts performance field', () => {
    const input: DisplayCampaignInput = {
      budget: { amount: 20, currency: 'EUR', period: 'daily' },
      bidding: 'maximize-conversions',
      performance: { minCTR: 0.02 },
    }
    expect(input.performance?.minCTR).toBe(0.02)
  })

  test('performance is optional — no performance field compiles', () => {
    const input: SearchCampaignInput = {
      budget: { amount: 10, currency: 'EUR', period: 'daily' },
      bidding: 'maximize-conversions',
    }
    expect(input.performance).toBeUndefined()
  })
})

describe('PerformanceTargets on Meta builders', () => {
  test('MetaCampaignConfig accepts performance field', () => {
    const config: MetaCampaignConfig = {
      budget: { amount: 200, currency: 'EUR', period: 'daily' },
      performance: { targetCPA: 30, strategy: 'Scale aggressively' },
    }
    expect(config.performance?.strategy).toBe('Scale aggressively')
  })

  test('AdSetConfig accepts performance field', () => {
    const config: AdSetConfig<'traffic'> = {
      targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
      performance: { targetCPA: 25 },
    }
    expect(config.performance?.targetCPA).toBe(25)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-builder-types.test.ts`
Expected: FAIL — `performance` not a known property

- [ ] **Step 3: Add performance field to Google types**

In `src/google/types.ts`, add `import type { PerformanceTargets } from '../performance/types.ts'` at the top imports.

Add `readonly performance?: PerformanceTargets` to each of these types:
- `SearchCampaignInput` (after `networkSettings`)
- `AdGroupInput` (after `status`)
- `DisplayCampaignInput` (after `networkSettings`)
- `DisplayAdGroupInput` (after `status`)
- `PMaxCampaignInput` (after last field)
- `ShoppingCampaignInput` (after last field)
- `DemandGenCampaignInput` (after last field)
- `SmartCampaignInput` (after last field)
- `AppCampaignInput` (after last field)

- [ ] **Step 4: Add performance field to Meta types**

In `src/meta/types.ts`, add `import type { PerformanceTargets } from '../performance/types.ts'` at the top imports.

Add `readonly performance?: PerformanceTargets` to:
- `MetaCampaignConfig` (after `status`)
- `AdSetConfig<T>` (after `status`)

- [ ] **Step 5: Add PerformanceConfig to AdsConfig**

In `src/core/types.ts`, add:
```typescript
import type { PerformanceConfig } from '../performance/types.ts'
```

Add to `AdsConfig`:
```typescript
readonly performance?: PerformanceConfig
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test test/unit/performance-builder-types.test.ts`
Expected: PASS

- [ ] **Step 7: Run full typecheck and test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: All tests pass, no type errors

- [ ] **Step 8: Commit**

```bash
git add src/google/types.ts src/meta/types.ts src/core/types.ts test/unit/performance-builder-types.test.ts
git commit -m "feat(performance): add PerformanceTargets to campaign/ad-group input configs"
```

---

## Task 3: Flatten — Store Targets in Resource.meta

**Files:**
- Modify: `src/google/flatten.ts`
- Modify: `src/meta/flatten.ts`
- Test: `test/unit/performance-flatten.test.ts`

- [ ] **Step 1: Write tests for target extraction during flatten**

```typescript
// test/unit/performance-flatten.test.ts
import { describe, test, expect } from 'bun:test'
import { flatten } from '../../src/google/flatten.ts'
import { flattenMeta } from '../../src/meta/flatten.ts'
import type { GoogleSearchCampaign } from '../../src/google/types.ts'
import type { MetaCampaign } from '../../src/meta/types.ts'

describe('Google flatten — performance targets in meta', () => {
  test('campaign-level performance stored in Resource.meta.performanceTargets', () => {
    // Build a minimal campaign with performance targets
    // Use the google.search() builder from src/google/index.ts
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('Test Campaign', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
      performance: { targetCPA: 15, strategy: 'Test strategy' },
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
      })

    const resources = flatten(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toEqual({
      targetCPA: 15,
      strategy: 'Test strategy',
    })
  })

  test('ad-group-level performance stored in Resource.meta.performanceTargets', () => {
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('Test Campaign', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
        performance: { targetCPA: 10 },
      })

    const resources = flatten(campaign as any)
    const adGroupResource = resources.find(r => r.kind === 'adGroup')
    expect(adGroupResource?.meta?.performanceTargets).toEqual({ targetCPA: 10 })
  })

  test('no performance targets — meta.performanceTargets is undefined', () => {
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('No Perf', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
      })

    const resources = flatten(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toBeUndefined()
  })
})

describe('Meta flatten — performance targets in meta', () => {
  test('campaign-level performance stored in Resource.meta.performanceTargets', () => {
    const campaign = {
      provider: 'meta' as const,
      kind: 'traffic' as const,
      name: 'Test Meta Campaign',
      config: {
        budget: { amount: 200, currency: 'EUR', period: 'daily' as const },
        performance: { targetCPA: 30, minROAS: 2.5 },
      },
      adSets: [],
    }

    const resources = flattenMeta(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toEqual({
      targetCPA: 30,
      minROAS: 2.5,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-flatten.test.ts`
Expected: FAIL — performanceTargets not in meta

- [ ] **Step 3: Modify Google flatten to store targets**

In `src/google/flatten.ts`, where campaign resources are created, add `performanceTargets` to `meta` when the campaign input has `performance`. Look for the pattern where `resource('campaign', ...)` is called and the `meta` object is built. Add:

```typescript
// When building the campaign resource meta:
...(campaign.performance ? { performanceTargets: campaign.performance } : {}),
```

Do the same for ad group resources — check if `AdGroupInput.performance` exists and store in meta.

Note: The flatten functions build `Resource.meta` using spread syntax. Follow the existing pattern for `budgetResourceName`.

Repeat for `flattenDisplay`, `flattenPMax`, `flattenShopping`, `flattenDemandGen`, `flattenSmart`, `flattenApp`.

- [ ] **Step 4: Modify Meta flatten to store targets**

In `src/meta/flatten.ts`, where campaign and ad set resources are created, add `performanceTargets` to `meta`:

For campaigns: read from `campaign.config.performance`
For ad sets: read from `adSet.config.performance`

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/unit/performance-flatten.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/google/flatten.ts src/meta/flatten.ts test/unit/performance-flatten.test.ts
git commit -m "feat(performance): store performance targets in Resource.meta during flatten"
```

---

## Task 4: Analysis Engine — Pure Computation

**Files:**
- Create: `src/performance/analyze.ts`
- Test: `test/unit/performance-analyze.test.ts`

This is the core of the performance module — a pure function with no side effects.

- [ ] **Step 1: Write tests for violation computation**

```typescript
// test/unit/performance-analyze.test.ts
import { describe, test, expect } from 'bun:test'
import { computeViolations, detectSignals, computeRecommendations, analyze } from '../../src/performance/analyze.ts'
import type { PerformanceMetrics, PerformanceTargets, PerformanceData } from '../../src/performance/types.ts'
import { computeMetrics } from '../../src/performance/types.ts'

// ─── Helper ──────────────────────────────────────────────────────
function makeData(overrides: Partial<PerformanceData> = {}): PerformanceData {
  return {
    resource: 'test-campaign',
    provider: 'google',
    kind: 'campaign',
    period: { start: new Date('2026-03-11'), end: new Date('2026-03-18') },
    metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 10, conversionValue: 600 }),
    violations: [],
    breakdowns: {},
    ...overrides,
  }
}

// ─── Violations ──────────────────────────────────────────────────
describe('computeViolations', () => {
  test('CPA over target → violation', () => {
    const metrics = computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 4, conversionValue: 0 })
    // CPA = 200/4 = 50
    const violations = computeViolations(metrics, { targetCPA: 30 })
    expect(violations).toHaveLength(1)
    expect(violations[0].metric).toBe('cpa')
    expect(violations[0].actual).toBeCloseTo(50)
    expect(violations[0].target).toBe(30)
    expect(violations[0].direction).toBe('over')
    expect(violations[0].deviation).toBeCloseTo(0.667, 2) // (50-30)/30
  })

  test('CPA under target → no violation', () => {
    const metrics = computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 20, conversionValue: 0 })
    // CPA = 10
    const violations = computeViolations(metrics, { targetCPA: 30 })
    expect(violations).toHaveLength(0)
  })

  test('ROAS under target → violation', () => {
    const metrics = computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 10, conversionValue: 300 })
    // ROAS = 300/200 = 1.5
    const violations = computeViolations(metrics, { minROAS: 2.5 })
    expect(violations).toHaveLength(1)
    expect(violations[0].metric).toBe('roas')
    expect(violations[0].direction).toBe('under')
  })

  test('no targets → no violations', () => {
    const metrics = computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 10, conversionValue: 0 })
    const violations = computeViolations(metrics, {})
    expect(violations).toHaveLength(0)
  })

  test('null CPA (zero conversions) with target → violation', () => {
    const metrics = computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 0, conversionValue: 0 })
    const violations = computeViolations(metrics, { targetCPA: 30 })
    // CPA is null (no conversions but spending) — should generate a critical violation
    expect(violations).toHaveLength(1)
    expect(violations[0].severity).toBe('critical')
  })

  test('severity thresholds: >20% = warning, >50% = critical', () => {
    // 25% over → warning
    const m1 = computeMetrics({ impressions: 1000, clicks: 50, cost: 250, conversions: 10, conversionValue: 0 })
    const v1 = computeViolations(m1, { targetCPA: 20 }) // CPA=25, 25% over
    expect(v1[0].severity).toBe('warning')

    // 60% over → critical
    const m2 = computeMetrics({ impressions: 1000, clicks: 50, cost: 320, conversions: 10, conversionValue: 0 })
    const v2 = computeViolations(m2, { targetCPA: 20 }) // CPA=32, 60% over
    expect(v2[0].severity).toBe('critical')
  })
})

// ─── Signals ─────────────────────────────────────────────────────
describe('detectSignals', () => {
  test('zero-conversions signal when cost > 0 but conversions = 0', () => {
    const data = makeData({
      metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 0, conversionValue: 0 }),
    })
    const signals = detectSignals([data])
    expect(signals.some(s => s.type === 'zero-conversions')).toBe(true)
  })

  test('no zero-conversions signal when cost = 0', () => {
    const data = makeData({
      metrics: computeMetrics({ impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }),
    })
    const signals = detectSignals([data])
    expect(signals.some(s => s.type === 'zero-conversions')).toBe(false)
  })

  test('declining-trend signal when CTR drops across daily breakdown', () => {
    const data = makeData({
      breakdowns: {
        byDay: [
          { date: '2026-03-11', metrics: computeMetrics({ impressions: 200, clicks: 20, cost: 40, conversions: 2, conversionValue: 0 }) },
          { date: '2026-03-12', metrics: computeMetrics({ impressions: 200, clicks: 18, cost: 40, conversions: 2, conversionValue: 0 }) },
          { date: '2026-03-13', metrics: computeMetrics({ impressions: 200, clicks: 15, cost: 40, conversions: 1, conversionValue: 0 }) },
          { date: '2026-03-14', metrics: computeMetrics({ impressions: 200, clicks: 12, cost: 40, conversions: 1, conversionValue: 0 }) },
          { date: '2026-03-15', metrics: computeMetrics({ impressions: 200, clicks: 8, cost: 40, conversions: 0, conversionValue: 0 }) },
        ],
      },
    })
    const signals = detectSignals([data])
    expect(signals.some(s => s.type === 'declining-trend')).toBe(true)
  })

  test('search-term-opportunity signal for converting unmatched terms', () => {
    const data = makeData({
      breakdowns: {
        bySearchTerm: [
          { term: 'buy widgets online', metrics: computeMetrics({ impressions: 100, clicks: 20, cost: 40, conversions: 5, conversionValue: 200 }) },
          { term: 'cheap widgets', metrics: computeMetrics({ impressions: 50, clicks: 5, cost: 10, conversions: 0, conversionValue: 0 }) },
        ],
      },
    })
    const signals = detectSignals([data])
    expect(signals.some(s => s.type === 'search-term-opportunity')).toBe(true)
  })
})

// ─── Recommendations ─────────────────────────────────────────────
describe('computeRecommendations', () => {
  test('recommends pause-resource for zero-conversion keywords', () => {
    const data = makeData({
      resource: 'campaign/group/kw:expensive:EXACT',
      kind: 'keyword',
      metrics: computeMetrics({ impressions: 500, clicks: 30, cost: 80, conversions: 0, conversionValue: 0 }),
    })
    const recs = computeRecommendations([data])
    expect(recs.some(r => r.type === 'pause-resource')).toBe(true)
  })

  test('recommends scale-budget when CPA has headroom and maxBudget is set', () => {
    const data = makeData({
      targets: { targetCPA: 30, maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const } },
      metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 15, conversions: 5, conversionValue: 0 }),
      // CPA = 3, well under target of 30
    })
    const recs = computeRecommendations([data])
    expect(recs.some(r => r.type === 'scale-budget')).toBe(true)
  })

  test('recommends add-negative for wasteful search terms', () => {
    const data = makeData({
      breakdowns: {
        bySearchTerm: [
          { term: 'free widgets download', metrics: computeMetrics({ impressions: 200, clicks: 40, cost: 60, conversions: 0, conversionValue: 0 }) },
        ],
      },
    })
    const recs = computeRecommendations([data])
    expect(recs.some(r => r.type === 'add-negative' && (r as any).keyword === 'free widgets download')).toBe(true)
  })
})

// ─── Full analyze() ──────────────────────────────────────────────
describe('analyze', () => {
  test('returns violations, signals, and recommendations', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['test-campaign', { targetCPA: 10 }],
    ])
    const data: PerformanceData[] = [
      makeData({
        metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 4, conversionValue: 0 }),
        // CPA = 50, target = 10
      }),
    ]
    const result = analyze(data, targets)
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.data[0].violations.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-analyze.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analyze.ts**

```typescript
// src/performance/analyze.ts
import type {
  PerformanceData,
  PerformanceMetrics,
  PerformanceTargets,
  PerformanceViolation,
  PerformanceSignal,
  PerformanceRecommendation,
} from './types.ts'

const DEFAULT_WARNING_THRESHOLD = 0.20
const DEFAULT_CRITICAL_THRESHOLD = 0.50
const ZERO_CONV_MIN_SPEND = 10 // only flag zero-conversion if spend > this

// ─── Violations ──────────────────────────────────────────────────

export function computeViolations(
  metrics: PerformanceMetrics,
  targets: PerformanceTargets,
  thresholds = { warning: DEFAULT_WARNING_THRESHOLD, critical: DEFAULT_CRITICAL_THRESHOLD },
): PerformanceViolation[] {
  const violations: PerformanceViolation[] = []

  // CPA: over target is bad
  if (targets.targetCPA !== undefined) {
    if (metrics.cpa === null && metrics.cost > 0) {
      // Spending money with zero conversions — critical
      violations.push({
        metric: 'cpa', actual: Infinity, target: targets.targetCPA,
        deviation: 1, direction: 'over', severity: 'critical',
      })
    } else if (metrics.cpa !== null && metrics.cpa > targets.targetCPA) {
      const dev = (metrics.cpa - targets.targetCPA) / targets.targetCPA
      violations.push({
        metric: 'cpa', actual: metrics.cpa, target: targets.targetCPA,
        deviation: dev, direction: 'over',
        severity: dev > thresholds.critical ? 'critical' : 'warning',
      })
    }
  }

  // ROAS: under target is bad
  if (targets.minROAS !== undefined && metrics.roas !== null && metrics.roas < targets.minROAS) {
    const dev = (targets.minROAS - metrics.roas) / targets.minROAS
    violations.push({
      metric: 'roas', actual: metrics.roas, target: targets.minROAS,
      deviation: dev, direction: 'under',
      severity: dev > thresholds.critical ? 'critical' : 'warning',
    })
  }

  // CTR: under target is bad
  if (targets.minCTR !== undefined && metrics.ctr !== null && metrics.ctr < targets.minCTR) {
    const dev = (targets.minCTR - metrics.ctr) / targets.minCTR
    violations.push({
      metric: 'ctr', actual: metrics.ctr, target: targets.minCTR,
      deviation: dev, direction: 'under',
      severity: dev > thresholds.critical ? 'critical' : 'warning',
    })
  }

  // CPC: over target is bad
  if (targets.maxCPC !== undefined && metrics.cpc !== null && metrics.cpc > targets.maxCPC) {
    const dev = (metrics.cpc - targets.maxCPC) / targets.maxCPC
    violations.push({
      metric: 'cpc', actual: metrics.cpc, target: targets.maxCPC,
      deviation: dev, direction: 'over',
      severity: dev > thresholds.critical ? 'critical' : 'warning',
    })
  }

  // Conversions: under target is bad
  if (targets.minConversions !== undefined && metrics.conversions < targets.minConversions) {
    const dev = (targets.minConversions - metrics.conversions) / targets.minConversions
    violations.push({
      metric: 'conversions', actual: metrics.conversions, target: targets.minConversions,
      deviation: dev, direction: 'under',
      severity: dev > thresholds.critical ? 'critical' : 'warning',
    })
  }

  // Impression share: under target is bad (Google-specific)
  if (targets.minImpressionShare !== undefined && metrics.impressionShare !== undefined && metrics.impressionShare < targets.minImpressionShare) {
    const dev = (targets.minImpressionShare - metrics.impressionShare) / targets.minImpressionShare
    violations.push({
      metric: 'impressionShare', actual: metrics.impressionShare, target: targets.minImpressionShare,
      deviation: dev, direction: 'under',
      severity: dev > thresholds.critical ? 'critical' : 'warning',
    })
  }

  return violations
}

// ─── Signals ─────────────────────────────────────────────────────

export function detectSignals(data: PerformanceData[]): PerformanceSignal[] {
  const signals: PerformanceSignal[] = []

  for (const d of data) {
    // Zero conversions with significant spend
    if (d.metrics.conversions === 0 && d.metrics.cost > ZERO_CONV_MIN_SPEND) {
      signals.push({
        type: 'zero-conversions', severity: 'warning', resource: d.resource,
        message: `${d.resource} spent ${d.metrics.cost.toFixed(2)} with 0 conversions`,
        evidence: { cost: d.metrics.cost, clicks: d.metrics.clicks },
      })
    }

    // Declining trend (CTR dropping >20% over daily breakdown)
    if (d.breakdowns.byDay && d.breakdowns.byDay.length >= 4) {
      const days = d.breakdowns.byDay
      const firstHalf = days.slice(0, Math.floor(days.length / 2))
      const secondHalf = days.slice(Math.floor(days.length / 2))
      const avgCtrFirst = average(firstHalf.map(day => day.metrics.ctr).filter((v): v is number => v !== null))
      const avgCtrSecond = average(secondHalf.map(day => day.metrics.ctr).filter((v): v is number => v !== null))
      if (avgCtrFirst > 0 && avgCtrSecond < avgCtrFirst * 0.8) {
        signals.push({
          type: 'declining-trend', severity: 'warning', resource: d.resource,
          message: `CTR declining: ${(avgCtrFirst * 100).toFixed(1)}% → ${(avgCtrSecond * 100).toFixed(1)}%`,
          evidence: { firstHalfCtr: avgCtrFirst, secondHalfCtr: avgCtrSecond },
        })
      }
    }

    // Search term opportunities (converting terms with significant volume)
    if (d.breakdowns.bySearchTerm) {
      for (const st of d.breakdowns.bySearchTerm) {
        if (st.metrics.conversions > 0 && st.metrics.clicks >= 5) {
          signals.push({
            type: 'search-term-opportunity', severity: 'info', resource: d.resource,
            message: `Search term "${st.term}" has ${st.metrics.conversions} conversions — consider adding as keyword`,
            evidence: { term: st.term, conversions: st.metrics.conversions, clicks: st.metrics.clicks, cost: st.metrics.cost },
          })
        }
      }
    }

    // High frequency (Meta-specific)
    if (d.metrics.frequency !== undefined && d.metrics.frequency > 4) {
      signals.push({
        type: 'high-frequency', severity: 'warning', resource: d.resource,
        message: `Frequency ${d.metrics.frequency.toFixed(1)}x — audience may be experiencing ad fatigue`,
        evidence: { frequency: d.metrics.frequency },
      })
    }

    // Low quality score (Google keyword-level)
    if (d.metrics.qualityScore !== undefined && d.metrics.qualityScore <= 3) {
      signals.push({
        type: 'low-quality-score', severity: 'warning', resource: d.resource,
        message: `Quality Score ${d.metrics.qualityScore}/10 — keywords may need refinement`,
        evidence: { qualityScore: d.metrics.qualityScore },
      })
    }
  }

  return signals
}

// ─── Recommendations ─────────────────────────────────────────────

export function computeRecommendations(data: PerformanceData[]): PerformanceRecommendation[] {
  const recs: PerformanceRecommendation[] = []

  for (const d of data) {
    // Pause zero-conversion resources with significant spend
    if (d.metrics.conversions === 0 && d.metrics.cost > ZERO_CONV_MIN_SPEND && (d.kind === 'keyword' || d.kind === 'ad')) {
      recs.push({
        type: 'pause-resource', resource: d.resource,
        reason: `Spent ${d.metrics.cost.toFixed(2)} with 0 conversions`,
        confidence: d.metrics.cost > 50 ? 'high' : 'medium',
        source: 'computed',
      })
    }

    // Scale budget when CPA has headroom and maxBudget is set
    if (d.targets?.maxBudget && d.targets.targetCPA !== undefined && d.metrics.cpa !== null) {
      const headroom = 1 - (d.metrics.cpa / d.targets.targetCPA)
      if (headroom > 0.3) {
        recs.push({
          type: 'scale-budget', resource: d.resource,
          from: { amount: d.metrics.cost / 7, currency: d.targets.maxBudget.currency, period: d.targets.maxBudget.period } as any,
          to: d.targets.maxBudget,
          reason: `CPA ${d.metrics.cpa.toFixed(2)} has ${(headroom * 100).toFixed(0)}% headroom vs target ${d.targets.targetCPA}`,
          confidence: headroom > 0.5 ? 'high' : 'medium',
          source: 'computed',
        })
      }
    }

    // Negative keyword recommendations from wasteful search terms
    if (d.breakdowns.bySearchTerm) {
      for (const st of d.breakdowns.bySearchTerm) {
        if (st.metrics.conversions === 0 && st.metrics.cost > 20) {
          recs.push({
            type: 'add-negative', resource: d.resource,
            keyword: st.term,
            reason: `Search term "${st.term}" spent ${st.metrics.cost.toFixed(2)} with 0 conversions`,
            confidence: st.metrics.cost > 50 ? 'high' : 'medium',
            source: 'computed',
          })
        }
      }
    }
  }

  return recs
}

// ─── Full Analysis ───────────────────────────────────────────────

export type AnalysisResult = {
  readonly data: PerformanceData[]
  readonly violations: PerformanceViolation[]
  readonly signals: PerformanceSignal[]
  readonly recommendations: PerformanceRecommendation[]
}

export function analyze(
  data: PerformanceData[],
  targets: Map<string, PerformanceTargets>,
  thresholds?: { warning: number; critical: number },
): AnalysisResult {
  // Attach violations to each data entry
  const enrichedData = data.map(d => {
    const t = targets.get(d.resource) ?? d.targets ?? {}
    const violations = computeViolations(d.metrics, t, thresholds)
    return { ...d, targets: t, violations }
  })

  const allViolations = enrichedData.flatMap(d => d.violations)
  const signals = detectSignals(enrichedData)
  const recommendations = computeRecommendations(enrichedData)

  return { data: enrichedData, violations: allViolations, signals, recommendations }
}

// ─── Helpers ─────────────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/performance-analyze.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/performance/analyze.ts test/unit/performance-analyze.test.ts
git commit -m "feat(performance): add pure analysis engine — violations, signals, recommendations"
```

---

## Task 5: Google Performance Fetch

**Files:**
- Create: `src/google/performance.ts`
- Create: `test/fixtures/performance/google-metrics.ts`
- Test: `test/unit/performance-fetch-google.test.ts`

- [ ] **Step 1: Create mock GAQL metric fixtures**

```typescript
// test/fixtures/performance/google-metrics.ts

/** Mock GAQL response for campaign-level metrics */
export const campaignMetricsResponse = [
  {
    campaign: { resource_name: 'customers/123/campaigns/1', id: '1', name: 'Brand Campaign' },
    metrics: {
      impressions: '10000', clicks: '500', cost_micros: '1500000000', // 1500 EUR
      conversions: 75, conversions_value: 4500,
      search_impression_share: 0.65,
    },
    segments: { date: '2026-03-11' },
  },
  {
    campaign: { resource_name: 'customers/123/campaigns/1', id: '1', name: 'Brand Campaign' },
    metrics: {
      impressions: '12000', clicks: '600', cost_micros: '1800000000',
      conversions: 90, conversions_value: 5400,
      search_impression_share: 0.70,
    },
    segments: { date: '2026-03-12' },
  },
]

/** Mock GAQL response for keyword-level metrics */
export const keywordMetricsResponse = [
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    ad_group: { resource_name: 'customers/123/adGroups/10', name: 'Exact Match' },
    ad_group_criterion: {
      resource_name: 'customers/123/adGroupCriteria/10~100',
      keyword: { text: 'my brand', match_type: 2 }, // EXACT
      quality_info: { quality_score: 8 },
    },
    metrics: { impressions: '5000', clicks: '300', cost_micros: '600000000', conversions: 50, conversions_value: 3000 },
  },
]

/** Mock GAQL response for ad-level metrics */
export const adMetricsResponse = [
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    ad_group: { resource_name: 'customers/123/adGroups/10', name: 'Exact Match' },
    ad_group_ad: { ad: { id: '200' } },
    metrics: { impressions: '5000', clicks: '300', cost_micros: '600000000', conversions: 50, conversions_value: 3000 },
  },
]

/** Mock GAQL response for search term metrics */
export const searchTermResponse = [
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    ad_group: { resource_name: 'customers/123/adGroups/10', name: 'Exact Match' },
    search_term_view: { search_term: 'buy my brand online' },
    metrics: { impressions: '200', clicks: '30', cost_micros: '80000000', conversions: 8, conversions_value: 480 },
  },
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    ad_group: { resource_name: 'customers/123/adGroups/10', name: 'Exact Match' },
    search_term_view: { search_term: 'free brand alternative' },
    metrics: { impressions: '100', clicks: '20', cost_micros: '50000000', conversions: 0, conversions_value: 0 },
  },
]

/** Mock GAQL response for device breakdown */
export const deviceBreakdownResponse = [
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    metrics: { impressions: '6000', clicks: '350', cost_micros: '1000000000', conversions: 45, conversions_value: 2700 },
    segments: { device: 2 }, // MOBILE
  },
  {
    campaign: { resource_name: 'customers/123/campaigns/1', name: 'Brand Campaign' },
    metrics: { impressions: '4000', clicks: '150', cost_micros: '500000000', conversions: 30, conversions_value: 1800 },
    segments: { device: 3 }, // DESKTOP
  },
]
```

- [ ] **Step 2: Write tests for Google performance fetch**

```typescript
// test/unit/performance-fetch-google.test.ts
import { describe, test, expect } from 'bun:test'
import { fetchGooglePerformance, normalizeGoogleMetrics } from '../../src/google/performance.ts'
import type { GoogleAdsClient } from '../../src/google/types.ts'
import { campaignMetricsResponse, keywordMetricsResponse, searchTermResponse } from '../fixtures/performance/google-metrics.ts'

describe('normalizeGoogleMetrics', () => {
  test('converts micros to currency and computes derived metrics', () => {
    const row = campaignMetricsResponse[0]
    const metrics = normalizeGoogleMetrics(row.metrics)
    expect(metrics.cost).toBeCloseTo(1500) // 1500000000 / 1_000_000
    expect(metrics.impressions).toBe(10000)
    expect(metrics.clicks).toBe(500)
    expect(metrics.ctr).toBeCloseTo(0.05)
    expect(metrics.cpa).toBeCloseTo(20) // 1500/75
  })

  test('includes impression share when present', () => {
    const row = campaignMetricsResponse[0]
    const metrics = normalizeGoogleMetrics(row.metrics)
    expect(metrics.impressionShare).toBeCloseTo(0.65)
  })
})

describe('fetchGooglePerformance', () => {
  test('fetches campaign metrics and returns PerformanceData[]', async () => {
    const mockClient: GoogleAdsClient = {
      customerId: '123',
      query: async (gaql: string) => {
        if (gaql.includes('FROM campaign')) return campaignMetricsResponse
        if (gaql.includes('FROM keyword_view')) return keywordMetricsResponse
        if (gaql.includes('FROM ad_group_ad')) return []
        if (gaql.includes('FROM search_term_view')) return searchTermResponse
        return []
      },
      mutate: async () => [],
    }

    const period = { start: new Date('2026-03-11'), end: new Date('2026-03-18') }
    const result = await fetchGooglePerformance(mockClient, period)

    expect(result.length).toBeGreaterThan(0)
    const campaign = result.find(d => d.kind === 'campaign')
    expect(campaign).toBeDefined()
    expect(campaign!.provider).toBe('google')
    expect(campaign!.metrics.impressions).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test test/unit/performance-fetch-google.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement Google performance fetch**

```typescript
// src/google/performance.ts
import type { GoogleAdsClient } from './types.ts'
import type { PerformanceData, PerformanceMetrics } from '../performance/types.ts'
import { computeMetrics } from '../performance/types.ts'

type Period = { start: Date; end: Date }

const DEVICE_MAP: Record<number, 'mobile' | 'desktop' | 'tablet'> = {
  2: 'mobile', 3: 'desktop', 4: 'tablet',
}

const MATCH_TYPE_MAP: Record<number, string> = { 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' }

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function normalizeGoogleMetrics(raw: Record<string, unknown>): PerformanceMetrics {
  const impressions = Number(raw.impressions ?? 0)
  const clicks = Number(raw.clicks ?? 0)
  const costMicros = Number(raw.cost_micros ?? 0)
  const conversions = Number(raw.conversions ?? 0)
  const conversionValue = Number(raw.conversions_value ?? raw.all_conversions_value ?? 0)
  const cost = costMicros / 1_000_000

  const metrics = computeMetrics({ impressions, clicks, cost, conversions, conversionValue })

  return {
    ...metrics,
    ...(raw.search_impression_share !== undefined ? { impressionShare: Number(raw.search_impression_share) } : {}),
    ...(raw.quality_score !== undefined ? { qualityScore: Number(raw.quality_score) } : {}),
  }
}

export async function fetchGooglePerformance(
  client: GoogleAdsClient,
  period: Period,
): Promise<PerformanceData[]> {
  const start = formatDate(period.start)
  const end = formatDate(period.end)
  const results: PerformanceData[] = []

  // Campaign-level metrics with daily breakdown
  const campaignRows = await client.query(`
    SELECT campaign.id, campaign.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.search_impression_share,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)

  // Aggregate by campaign
  const byCampaign = groupBy(campaignRows, r => String((r as any).campaign?.id ?? ''))
  for (const [id, rows] of byCampaign) {
    const name = (rows[0] as any).campaign?.name ?? id
    const slug = slugify(name)
    const agg = aggregateMetrics(rows.map(r => normalizeGoogleMetrics((r as any).metrics)))
    const byDay = rows.map(r => ({
      date: String((r as any).segments?.date ?? ''),
      metrics: normalizeGoogleMetrics((r as any).metrics),
    }))

    results.push({
      resource: slug, provider: 'google', kind: 'campaign',
      period, metrics: agg, violations: [],
      breakdowns: { byDay },
    })
  }

  // Keyword-level metrics
  const kwRows = await client.query(`
    SELECT campaign.name, ad_group.name,
      ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)

  for (const row of kwRows) {
    const r = row as any
    const campSlug = slugify(r.campaign?.name ?? '')
    const groupSlug = slugify(r.ad_group?.name ?? '')
    const kwText = r.ad_group_criterion?.keyword?.text ?? ''
    const matchType = MATCH_TYPE_MAP[r.ad_group_criterion?.keyword?.match_type] ?? 'BROAD'
    const path = `${campSlug}/${groupSlug}/kw:${slugify(kwText)}:${matchType}`

    const rawMetrics = r.metrics ?? {}
    if (r.ad_group_criterion?.quality_info?.quality_score !== undefined) {
      rawMetrics.quality_score = r.ad_group_criterion.quality_info.quality_score
    }

    results.push({
      resource: path, provider: 'google', kind: 'keyword',
      period, metrics: normalizeGoogleMetrics(rawMetrics), violations: [],
      breakdowns: {},
    })
  }

  // Search term report — stored as breakdowns on the campaign
  const stRows = await client.query(`
    SELECT campaign.name, ad_group.name,
      search_term_view.search_term,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)

  // Group search terms by campaign and attach as breakdowns
  const stByCampaign = groupBy(stRows, r => slugify((r as any).campaign?.name ?? ''))
  for (const [campSlug, rows] of stByCampaign) {
    const existing = results.find(d => d.resource === campSlug && d.kind === 'campaign')
    if (existing) {
      const bySearchTerm = rows.map(r => ({
        term: String((r as any).search_term_view?.search_term ?? ''),
        metrics: normalizeGoogleMetrics((r as any).metrics),
      }))
      // Mutate breakdowns to add search terms (results are built fresh, not frozen)
      ;(existing as any).breakdowns = { ...existing.breakdowns, bySearchTerm }
    }
  }

  return results
}

// ─── Helpers ─────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const group = map.get(key) ?? []
    group.push(item)
    map.set(key, group)
  }
  return map
}

function aggregateMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
  const raw = {
    impressions: metrics.reduce((s, m) => s + m.impressions, 0),
    clicks: metrics.reduce((s, m) => s + m.clicks, 0),
    cost: metrics.reduce((s, m) => s + m.cost, 0),
    conversions: metrics.reduce((s, m) => s + m.conversions, 0),
    conversionValue: metrics.reduce((s, m) => s + m.conversionValue, 0),
  }
  const computed = computeMetrics(raw)
  // Preserve provider-specific fields from first entry with values
  const impressionShare = metrics.find(m => m.impressionShare !== undefined)?.impressionShare
  return {
    ...computed,
    ...(impressionShare !== undefined ? { impressionShare } : {}),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/unit/performance-fetch-google.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/google/performance.ts test/fixtures/performance/google-metrics.ts test/unit/performance-fetch-google.test.ts
git commit -m "feat(performance): add Google Ads GAQL performance fetcher"
```

---

## Task 6: Meta Performance Fetch

**Files:**
- Create: `src/meta/performance.ts`
- Create: `test/fixtures/performance/meta-insights.ts`
- Test: `test/unit/performance-fetch-meta.test.ts`

- [ ] **Step 1: Create mock Meta Insights fixtures**

```typescript
// test/fixtures/performance/meta-insights.ts

/** Mock Meta Insights API response for campaign-level metrics */
export const campaignInsightsResponse = [
  {
    campaign_id: '111', campaign_name: 'Retargeting Campaign',
    impressions: '15000', clicks: '450', spend: '600.00',
    actions: [
      { action_type: 'offsite_conversion', value: '30' },
      { action_type: 'link_click', value: '450' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '1800.00' },
    ],
    cpm: '40.00', frequency: '2.5', reach: '6000',
    date_start: '2026-03-11', date_stop: '2026-03-18',
  },
]

/** Mock response for ad-set-level metrics */
export const adSetInsightsResponse = [
  {
    campaign_id: '111', campaign_name: 'Retargeting Campaign',
    adset_id: '222', adset_name: 'Lookalike 1%',
    impressions: '8000', clicks: '240', spend: '320.00',
    actions: [{ action_type: 'offsite_conversion', value: '16' }],
    action_values: [{ action_type: 'offsite_conversion', value: '960.00' }],
    cpm: '40.00', frequency: '2.0', reach: '4000',
    date_start: '2026-03-11', date_stop: '2026-03-18',
  },
]

/** Mock response with age/gender breakdown */
export const demographicBreakdownResponse = [
  {
    campaign_id: '111', campaign_name: 'Retargeting Campaign',
    impressions: '5000', clicks: '200', spend: '200.00',
    actions: [{ action_type: 'offsite_conversion', value: '10' }],
    action_values: [{ action_type: 'offsite_conversion', value: '600.00' }],
    age: '25-34', gender: 'female',
  },
  {
    campaign_id: '111', campaign_name: 'Retargeting Campaign',
    impressions: '10000', clicks: '250', spend: '400.00',
    actions: [{ action_type: 'offsite_conversion', value: '20' }],
    action_values: [{ action_type: 'offsite_conversion', value: '1200.00' }],
    age: '35-44', gender: 'male',
  },
]
```

- [ ] **Step 2: Write tests for Meta performance fetch**

```typescript
// test/unit/performance-fetch-meta.test.ts
import { describe, test, expect } from 'bun:test'
import { fetchMetaPerformance, normalizeMetaMetrics, extractConversions } from '../../src/meta/performance.ts'
import type { MetaClient } from '../../src/meta/api.ts'
import { campaignInsightsResponse, adSetInsightsResponse } from '../fixtures/performance/meta-insights.ts'

describe('extractConversions', () => {
  test('extracts offsite_conversion count from actions array', () => {
    const actions = [
      { action_type: 'offsite_conversion', value: '30' },
      { action_type: 'link_click', value: '450' },
    ]
    expect(extractConversions(actions)).toBe(30)
  })

  test('returns 0 when no conversion actions', () => {
    expect(extractConversions([])).toBe(0)
    expect(extractConversions(undefined)).toBe(0)
  })
})

describe('normalizeMetaMetrics', () => {
  test('normalizes Meta Insights row to PerformanceMetrics', () => {
    const row = campaignInsightsResponse[0]
    const metrics = normalizeMetaMetrics(row)
    expect(metrics.impressions).toBe(15000)
    expect(metrics.clicks).toBe(450)
    expect(metrics.cost).toBeCloseTo(600)
    expect(metrics.conversions).toBe(30)
    expect(metrics.frequency).toBe(2.5)
    expect(metrics.reach).toBe(6000)
  })
})

describe('fetchMetaPerformance', () => {
  test('fetches campaign + adset metrics and returns PerformanceData[]', async () => {
    const mockClient = {
      graphGet: async (endpoint: string) => {
        if (endpoint.includes('/insights')) {
          if (endpoint.includes('level=campaign')) return { data: campaignInsightsResponse }
          if (endpoint.includes('level=adset')) return { data: adSetInsightsResponse }
        }
        return { data: [] }
      },
      graphGetAll: async () => [],
      graphPost: async () => ({}),
      graphDelete: async () => ({}),
    } as unknown as MetaClient

    const period = { start: new Date('2026-03-11'), end: new Date('2026-03-18') }
    const result = await fetchMetaPerformance(mockClient, '12345', period)

    expect(result.length).toBeGreaterThan(0)
    const campaign = result.find(d => d.kind === 'campaign')
    expect(campaign).toBeDefined()
    expect(campaign!.provider).toBe('meta')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test test/unit/performance-fetch-meta.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement Meta performance fetch**

Create `src/meta/performance.ts`. Follow the pattern from `src/meta/fetch.ts`. Use the Meta Graph API Insights endpoint. Convert `actions` array to conversions count. Normalize `spend` from string to number. Include `frequency`, `reach`, `cpm` as provider-specific fields.

The implementation should export `fetchMetaPerformance`, `normalizeMetaMetrics`, and `extractConversions`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/unit/performance-fetch-meta.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/meta/performance.ts test/fixtures/performance/meta-insights.ts test/unit/performance-fetch-meta.test.ts
git commit -m "feat(performance): add Meta Ads Insights performance fetcher"
```

---

## Task 7: AI Strategy Evaluation

**Files:**
- Create: `src/performance/evaluate.ts`
- Test: `test/unit/performance-evaluate.test.ts`

- [ ] **Step 1: Write tests for strategy evaluation**

```typescript
// test/unit/performance-evaluate.test.ts
import { describe, test, expect } from 'bun:test'
import { compileStrategyPrompt, evaluateStrategy } from '../../src/performance/evaluate.ts'
import type { PerformanceData, PerformanceSignal } from '../../src/performance/types.ts'
import { computeMetrics } from '../../src/performance/types.ts'
import type { GenerateObjectFn } from '../../src/ai/generate.ts'

describe('compileStrategyPrompt', () => {
  test('includes strategy text, metrics, and signals', () => {
    const strategy = 'Scale aggressively while ROAS holds above 2x'
    const data: PerformanceData = {
      resource: 'test-campaign', provider: 'google', kind: 'campaign',
      period: { start: new Date('2026-03-11'), end: new Date('2026-03-18') },
      metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 10, conversionValue: 600 }),
      violations: [], breakdowns: {},
    }
    const signals: PerformanceSignal[] = [
      { type: 'zero-conversions', severity: 'warning', resource: 'test/kw', message: 'test', evidence: {} },
    ]

    const prompt = compileStrategyPrompt(strategy, [data], signals)
    expect(prompt).toContain('Scale aggressively')
    expect(prompt).toContain('test-campaign')
    expect(prompt).toContain('zero-conversions')
  })
})

describe('evaluateStrategy', () => {
  test('calls LLM and returns structured recommendations', async () => {
    const mockGenerate: GenerateObjectFn = async ({ prompt, schema }) => ({
      object: {
        recommendations: [
          { type: 'scale-budget', resource: 'test-campaign', reason: 'ROAS is strong', confidence: 'high' },
        ],
      },
      usage: { promptTokens: 100, completionTokens: 50 },
    })

    const result = await evaluateStrategy({
      strategy: 'Scale aggressively',
      data: [],
      signals: [],
      generateObjectFn: mockGenerate,
      model: {} as any,
      retryDelays: [0, 0, 0],
    })

    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].source).toBe('ai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-evaluate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement evaluate.ts**

Create `src/performance/evaluate.ts`. Follow the pattern from `src/ai/generate.ts`:
- Use Vercel AI SDK's `generateObject()` with a Zod schema
- `compileStrategyPrompt()` builds a prompt with strategy + metrics + signals
- `evaluateStrategy()` calls the LLM with retry logic
- Returns `PerformanceRecommendation[]` with `source: 'ai'`
- Accepts `generateObjectFn` for testing (same pattern as `src/ai/generate.ts`)

Use a Zod schema for the output (like `src/ai/schemas.ts`):
```typescript
const strategyRecommendationSchema = z.object({
  recommendations: z.array(z.object({
    type: z.enum(['scale-budget', 'reduce-budget', 'pause-resource', 'resume-resource', 'adjust-bid', 'shift-budget', 'add-negative', 'refresh-creative']),
    resource: z.string(),
    reason: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/unit/performance-evaluate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/performance/evaluate.ts test/unit/performance-evaluate.test.ts
git commit -m "feat(performance): add AI strategy evaluation via Vercel AI SDK"
```

---

## Task 8: Performance Resolve — Orchestration

**Files:**
- Create: `src/performance/resolve.ts`
- Create: `src/performance/fetch.ts`
- Test: `test/unit/performance-resolve.test.ts`

- [ ] **Step 1: Write tests for resolve**

```typescript
// test/unit/performance-resolve.test.ts
import { describe, test, expect } from 'bun:test'
import { extractTargets, resolveTargetInheritance, buildPerformanceReport } from '../../src/performance/resolve.ts'
import type { Resource } from '../../src/core/types.ts'
import type { PerformanceData, PerformanceTargets } from '../../src/performance/types.ts'
import { computeMetrics } from '../../src/performance/types.ts'

describe('extractTargets', () => {
  test('extracts targets from Resource.meta.performanceTargets', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'my-campaign', properties: {}, meta: { performanceTargets: { targetCPA: 15 } } },
      { kind: 'adGroup', path: 'my-campaign/group-1', properties: {}, meta: { performanceTargets: { targetCPA: 10 } } },
      { kind: 'keyword', path: 'my-campaign/group-1/kw:test:EXACT', properties: {} },
    ]
    const targets = extractTargets(resources)
    expect(targets.get('my-campaign')).toEqual({ targetCPA: 15 })
    expect(targets.get('my-campaign/group-1')).toEqual({ targetCPA: 10 })
    expect(targets.has('my-campaign/group-1/kw:test:EXACT')).toBe(false)
  })
})

describe('resolveTargetInheritance', () => {
  test('child inherits parent targets when not overridden', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['my-campaign', { targetCPA: 15, minROAS: 3.0 }],
    ])
    const resolved = resolveTargetInheritance('my-campaign/group-1', targets)
    expect(resolved).toEqual({ targetCPA: 15, minROAS: 3.0 })
  })

  test('child overrides parent targets', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['my-campaign', { targetCPA: 15, minROAS: 3.0 }],
      ['my-campaign/group-1', { targetCPA: 10 }],
    ])
    const resolved = resolveTargetInheritance('my-campaign/group-1', targets)
    expect(resolved).toEqual({ targetCPA: 10, minROAS: 3.0 })
  })

  test('no matching targets → empty', () => {
    const targets = new Map<string, PerformanceTargets>()
    const resolved = resolveTargetInheritance('unknown/path', targets)
    expect(resolved).toEqual({})
  })
})

describe('buildPerformanceReport', () => {
  test('produces report with summary', () => {
    const data: PerformanceData[] = [
      {
        resource: 'campaign-a', provider: 'google', kind: 'campaign',
        period: { start: new Date('2026-03-11'), end: new Date('2026-03-18') },
        metrics: computeMetrics({ impressions: 1000, clicks: 50, cost: 200, conversions: 10, conversionValue: 600 }),
        violations: [], breakdowns: {},
      },
    ]
    const report = buildPerformanceReport(data, [], [])
    expect(report.summary.totalSpend).toBe(200)
    expect(report.summary.totalConversions).toBe(10)
    expect(report.summary.overallCPA).toBeCloseTo(20)
    expect(report.summary.overallROAS).toBeCloseTo(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/performance-resolve.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fetch.ts (provider-agnostic orchestrator)**

```typescript
// src/performance/fetch.ts
import type { PerformanceData } from './types.ts'
import type { GoogleAdsClient } from '../google/types.ts'
import type { MetaClient } from '../meta/api.ts'
import { fetchGooglePerformance } from '../google/performance.ts'
import { fetchMetaPerformance } from '../meta/performance.ts'

export type FetchPerformanceInput = {
  readonly google?: { client: GoogleAdsClient }
  readonly meta?: { client: MetaClient; accountId: string }
  readonly period: { start: Date; end: Date }
}

export async function fetchPerformance(input: FetchPerformanceInput): Promise<PerformanceData[]> {
  const fetches: Promise<PerformanceData[]>[] = []

  if (input.google) {
    fetches.push(fetchGooglePerformance(input.google.client, input.period))
  }
  if (input.meta) {
    fetches.push(fetchMetaPerformance(input.meta.client, input.meta.accountId, input.period))
  }

  const results = await Promise.all(fetches)
  return results.flat()
}
```

- [ ] **Step 4: Implement resolve.ts**

```typescript
// src/performance/resolve.ts
import type { Resource } from '../core/types.ts'
import type {
  PerformanceData, PerformanceTargets, PerformanceReport,
  PerformanceSignal, PerformanceRecommendation,
} from './types.ts'
import { analyze } from './analyze.ts'

export function extractTargets(resources: Resource[]): Map<string, PerformanceTargets> {
  const targets = new Map<string, PerformanceTargets>()
  for (const r of resources) {
    const pt = r.meta?.performanceTargets as PerformanceTargets | undefined
    if (pt && Object.keys(pt).length > 0) {
      targets.set(r.path, pt)
    }
  }
  return targets
}

export function resolveTargetInheritance(
  path: string,
  targets: Map<string, PerformanceTargets>,
): PerformanceTargets {
  // Walk up the path hierarchy, merge targets (child overrides parent)
  const parts = path.split('/')
  let merged: PerformanceTargets = {}
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join('/')
    const t = targets.get(prefix)
    if (t) {
      merged = { ...merged, ...t }
    }
  }
  return merged
}

export function buildPerformanceReport(
  data: PerformanceData[],
  signals: PerformanceSignal[],
  recommendations: PerformanceRecommendation[],
): PerformanceReport {
  const totalSpend = data.filter(d => d.kind === 'campaign').reduce((s, d) => s + d.metrics.cost, 0)
  const totalConversions = data.filter(d => d.kind === 'campaign').reduce((s, d) => s + d.metrics.conversions, 0)
  const totalConversionValue = data.filter(d => d.kind === 'campaign').reduce((s, d) => s + d.metrics.conversionValue, 0)
  const violationCount = data.reduce((s, d) => s + d.violations.length, 0)

  return {
    generatedAt: new Date(),
    period: data[0]?.period ?? { start: new Date(), end: new Date() },
    data,
    signals,
    recommendations,
    summary: {
      totalSpend,
      totalConversions,
      totalConversionValue,
      overallCPA: totalConversions > 0 ? totalSpend / totalConversions : null,
      overallROAS: totalSpend > 0 ? totalConversionValue / totalSpend : null,
      violationCount,
      signalCount: {
        info: signals.filter(s => s.severity === 'info').length,
        warning: signals.filter(s => s.severity === 'warning').length,
        critical: signals.filter(s => s.severity === 'critical').length,
      },
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/unit/performance-resolve.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/performance/fetch.ts src/performance/resolve.ts test/unit/performance-resolve.test.ts
git commit -m "feat(performance): add resolve orchestration and target inheritance"
```

---

## Task 9: CLI — `ads performance` Command

**Files:**
- Create: `cli/performance.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1: Implement the performance CLI command**

Create `cli/performance.ts`. Follow the pattern from `cli/plan.ts`:
1. Parse args: `--period`, `--campaign`, `--provider`, `--json`, `--no-ai`
2. Load config via `loadConfig()`
3. Discover campaigns via `discoverCampaigns()`
4. Flatten to resources, extract targets
5. Create provider clients
6. Call `fetchPerformance()` → `analyze()` → optionally `evaluateStrategy()`
7. Build `PerformanceReport` via `buildPerformanceReport()`
8. If `--json`: output `JSON.stringify(report, null, 2)`
9. If human: format output matching the spec's "Human-readable output" section

Export `runPerformance(args, flags)`.

- [ ] **Step 2: Add route in cli/index.ts**

In `cli/index.ts`, add a case for `performance`:
```typescript
case 'performance': {
  const { runPerformance } = await import('./performance.ts')
  await runPerformance(args.slice(1), flags)
  break
}
```

Also add to the USAGE string:
```
  performance   Show campaign performance metrics and analysis
```

- [ ] **Step 3: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add cli/performance.ts cli/index.ts
git commit -m "feat(performance): add ads performance CLI command"
```

---

## Task 10: Integrate Performance into `ads plan`

**Files:**
- Modify: `cli/plan.ts`

- [ ] **Step 1: Read cli/plan.ts to understand current structure**

Read the full file to identify where to add performance fetch and display.

- [ ] **Step 2: Add performance fetch in parallel with structure fetch**

After the existing structural fetch, add a parallel performance fetch:
```typescript
// Existing: structure fetch
const [structuralResult, performanceResult] = await Promise.all([
  existingStructuralFetch(),
  fetchPerformanceData().catch(() => null), // Graceful degradation
])
```

- [ ] **Step 3: Add performance section to plan output**

After the structural changes display, add a "Performance" section:
- Show violations with target comparison
- Show signals
- Add to summary line

If performance fetch failed, silently skip the section (graceful degradation — plan works without performance data).

- [ ] **Step 4: Run existing plan tests to ensure no regressions**

Run: `bun test test/unit/plan.test.ts` (or relevant test file)
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add cli/plan.ts
git commit -m "feat(performance): integrate performance analysis into ads plan output"
```

---

## Task 11: Final Integration Test & Cleanup

**Files:**
- All performance module files
- Test: typecheck + full test suite

- [ ] **Step 1: Run full typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Verify CLI commands work**

Run: `bun cli/index.ts performance --help` (or similar)
Expected: Shows usage info or runs without error

- [ ] **Step 4: Update CLAUDE.md**

Add to the "Essential Commands" section:
```
bun cli/index.ts performance             # Show campaign performance metrics
bun cli/index.ts performance --json      # JSON output for AI agents
bun cli/index.ts performance --period 30d # Last 30 days
```

Add to the "Architecture" section under `src/`:
```
  performance/    Performance data and optimization engine
    types.ts        PerformanceTargets, Metrics, Data, Signal, Report
    analyze.ts      Pure function: metrics + targets → violations, signals, recommendations
    fetch.ts        Provider-agnostic fetch orchestrator
    evaluate.ts     AI strategy evaluation via Vercel AI SDK
    resolve.ts      Target extraction, inheritance, report building
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(performance): complete performance module with types, analysis, fetch, AI evaluation, and CLI"
```
