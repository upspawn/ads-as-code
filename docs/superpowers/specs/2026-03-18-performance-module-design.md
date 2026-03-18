# Performance Module for @upspawn/ads

**Date:** 2026-03-18
**Status:** Draft

## Summary

Add a performance data and optimization layer to the @upspawn/ads SDK. Users declare performance targets and optimization strategy alongside campaign definitions. The system fetches metrics from ad platforms, analyzes them against targets, and produces structured reports with violations, signals, and AI-evaluated recommendations. Designed primarily for consumption by AI agents that use the SDK to autonomously optimize ad campaigns.

Three layers:
1. **DSL** — `.performance()` on campaign/ad-group builders with structured targets + freeform strategy
2. **Engine** — fetch metrics from platforms, analyze against targets, AI-evaluate strategy text
3. **CLI** — `ads performance` command + performance drift integrated into `ads plan`

## Motivation

The SDK currently gives AI agents hands (plan/apply) but no eyes (performance data). An agent can create and modify campaigns but can't see how they're performing. This forces agents to use platform UIs or separate analytics tools, breaking the declarative workflow.

Adding performance data to the SDK makes it a complete optimization loop: define campaigns → deploy → measure → optimize → redeploy. The declarative performance targets and strategy text let humans express optimization intent that AI agents can interpret and act on.

This is differentiated from platform-native optimization (Google Smart Bidding, Meta Advantage+) because it works cross-platform. An LLM agent with access to both Google and Meta performance data can make decisions no single platform can: "Meta is acquiring customers at half the CPA — shift 30% of budget."

## DSL Surface

### Performance targets on builders

`.performance()` is an optional method on campaign and ad-group/ad-set builders, following the same pattern as `.budget()` or `.targeting()`:

```typescript
// Google
google.search("Brand — US")
  .budget(daily(eur(3)))
  .bidding("maximize-conversions")
  .performance({
    targetCPA: eur(15),
    maxBudget: daily(eur(50)),
    strategy: `Launch phase campaign. First 2 weeks prioritize reach
      and impression share over CPA efficiency. After learning phase,
      pivot to strict CPA optimization. Pause any keyword that spends
      over €50 with zero conversions.`
  })
  .group("Exact Match")
    .performance({ targetCPA: eur(10) })  // tighter target for this group
    .keywords(exact("my brand"), exact("competitor name"))
    .rsa(headlines(...), descriptions(...))

// Meta
meta.conversions("Retargeting — Lookalikes")
  .budget(daily(eur(200)))
  .performance({
    targetCPA: eur(30),
    minROAS: 2.5,
    maxBudget: daily(eur(500)),
    strategy: `Scale aggressively while ROAS holds above 2x.
      This audience has historically strong LTV — accept higher
      upfront CPA if conversion volume is growing.`
  })
  .adSet("Lookalike 1%")
    .performance({ targetCPA: eur(25) })
    .targeting(lookalike("seed-audience", 1))
    .ad(image("creative.jpg", { ... }))
```

### PerformanceTargets type

All fields are optional. Targets inherit downward — campaign-level targets apply to all ad groups/ad sets unless overridden (most specific wins).

```typescript
type PerformanceTargets = {
  // Efficiency targets
  targetCPA?: Budget;           // cost per acquisition ceiling
  minROAS?: number;             // minimum return on ad spend
  minCTR?: number;              // minimum click-through rate (0-1)
  maxCPC?: Budget;              // max cost per click

  // Budget scaling
  maxBudget?: Budget;           // ceiling for elastic budget scaling

  // Volume targets
  minConversions?: number;      // minimum conversions per period
  minImpressionShare?: number;  // Google-specific (0-1)

  // AI strategy (the escape hatch)
  strategy?: string;            // freeform optimization intent for AI evaluation
}
```

### Constraint helpers

For use in `strategy` evaluation and potential future structured conditions:

```typescript
import { under, over, between } from '@upspawn/ads/performance';

// These are used internally by the analysis engine for target comparison
// and could be exposed for more complex declarative constraints in the future
```

### Degradation behavior

The DSL degrades gracefully based on what's declared:

```typescript
// Monitoring only — no scaling authority
.performance({ targetCPA: eur(15) })

// Monitoring + scaling authority
.performance({ targetCPA: eur(15), maxBudget: daily(eur(50)) })

// AI-driven — strategy text with guardrails
.performance({
  maxBudget: daily(eur(200)),
  strategy: `Brand awareness campaign. Optimize for CPM and reach,
    not conversions. Target 80%+ impression share in our geo.`
})

// Pure guardrail — just a spend cap, no targets
.performance({ maxBudget: daily(eur(100)) })
```

## Data Model

### PerformanceMetrics

Provider-agnostic metrics returned for every resource:

```typescript
type PerformanceMetrics = {
  impressions: number;
  clicks: number;
  cost: number;              // account currency, NOT micros
  conversions: number;
  conversionValue: number;
  ctr: number;               // computed: clicks / impressions
  cpc: number;               // computed: cost / clicks
  cpa: number;               // computed: cost / conversions (Infinity if 0 conversions)
  roas: number;              // computed: conversionValue / cost (0 if 0 cost)

  // Provider-specific (populated when available)
  impressionShare?: number;  // Google: search impression share (0-1)
  qualityScore?: number;     // Google: keyword-level (1-10)
  frequency?: number;        // Meta: average times ad shown per person
  reach?: number;            // Meta: unique people who saw the ad
  cpm?: number;              // cost per 1000 impressions
}
```

### PerformanceData

Per-resource performance snapshot with breakdowns:

```typescript
type PerformanceData = {
  resource: string;                     // path (matches Resource.path)
  provider: 'google' | 'meta';
  kind: ResourceKind;                   // campaign, adGroup, adSet, keyword, ad
  period: { start: Date; end: Date };
  metrics: PerformanceMetrics;
  targets?: PerformanceTargets;         // from campaign definition (if declared)
  violations: PerformanceViolation[];   // computed: targets vs actuals

  breakdowns: {
    // Time
    byDay?: { date: string; metrics: PerformanceMetrics }[];

    // Device / platform
    byDevice?: Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics>;
    byPlacement?: Record<string, PerformanceMetrics>;  // Meta: feed, stories, reels, etc.

    // Audience
    byAge?: Record<string, PerformanceMetrics>;         // Meta
    byGender?: Record<string, PerformanceMetrics>;      // Meta

    // Content
    byKeyword?: { text: string; matchType: string; metrics: PerformanceMetrics }[];  // Google
    bySearchTerm?: { term: string; metrics: PerformanceMetrics }[];                  // Google
    byAd?: { path: string; metrics: PerformanceMetrics }[];
  };
}
```

### PerformanceViolation

Computed whenever a target is defined and actual metrics are available:

```typescript
type PerformanceViolation = {
  metric: 'cpa' | 'roas' | 'ctr' | 'cpc' | 'spend' | 'conversions' | 'impressionShare';
  actual: number;
  target: number;
  deviation: number;          // fractional: +0.30 = 30% over target, -0.20 = 20% under
  direction: 'over' | 'under';
  severity: 'warning' | 'critical';  // >20% = warning, >50% = critical (configurable)
}
```

### PerformanceSignal

Pre-digested insights computed by the analysis engine. These don't require targets — they're anomaly detection on raw data:

```typescript
type PerformanceSignal = {
  type:
    | 'budget-constrained'     // campaign is limited by budget (missing conversions)
    | 'zero-conversions'       // resource has spend but no conversions
    | 'creative-fatigue'       // CTR declining over time for an ad
    | 'spend-concentration'    // one keyword/ad eating most of the budget
    | 'declining-trend'        // key metric trending down over the period
    | 'improving-trend'        // key metric trending up
    | 'learning-phase'         // Meta: ad set in learning phase
    | 'high-frequency'         // Meta: frequency too high (ad fatigue)
    | 'low-quality-score'      // Google: keyword quality score below threshold
    | 'search-term-opportunity'; // Google: converting search terms not covered by keywords

  severity: 'info' | 'warning' | 'critical';
  resource: string;            // path
  message: string;             // human/LLM-readable explanation
  evidence: Record<string, any>;  // supporting data points
}
```

### PerformanceRecommendation

Actionable suggestions — either computed deterministically or AI-generated:

```typescript
type PerformanceRecommendation = {
  type:
    | 'scale-budget'       // increase budget (elastic scaling)
    | 'reduce-budget'      // decrease budget (underperforming)
    | 'pause-resource'     // pause keyword/ad/campaign
    | 'resume-resource'    // resume paused resource
    | 'adjust-bid'         // change bid amount
    | 'shift-budget'       // move budget between campaigns
    | 'add-negative'       // add negative keyword (from search terms)
    | 'refresh-creative';  // replace fatigued ads

  resource: string;
  from?: any;              // current value
  to?: any;                // recommended value
  reason: string;          // LLM-readable explanation
  confidence: 'high' | 'medium' | 'low';
  source: 'computed' | 'ai';  // whether this came from deterministic analysis or AI
}
```

### PerformanceReport

The top-level output — what `ads performance --json` returns:

```typescript
type PerformanceReport = {
  generatedAt: Date;
  period: { start: Date; end: Date };
  data: PerformanceData[];                       // raw metrics per resource
  signals: PerformanceSignal[];                  // pre-digested insights
  recommendations: PerformanceRecommendation[];  // suggested changes
  summary: {
    totalSpend: number;
    totalConversions: number;
    totalConversionValue: number;
    overallCPA: number;
    overallROAS: number;
    violationCount: number;
    signalCount: { info: number; warning: number; critical: number };
  };
}
```

## Architecture

### File structure

```
src/
  performance/
    types.ts          # All types above (PerformanceMetrics, Data, Signal, Report, etc.)
    fetch.ts          # Provider-agnostic orchestrator — calls provider-specific fetchers
    analyze.ts        # Raw metrics → violations + signals + recommendations (pure function)
    evaluate.ts       # AI evaluation of strategy text via Vercel AI SDK
    resolve.ts        # Campaigns with targets + live metrics → PerformanceReport
    helpers.ts        # under(), over(), between() constraint helpers
  google/
    performance.ts    # GAQL queries for metrics, breakdowns (campaigns, keywords, ads, search terms)
  meta/
    performance.ts    # Graph API Insights queries for metrics, breakdowns
  core/
    types.ts          # MODIFIED — add PerformanceTargets to campaign/ad-group types
cli/
  performance.ts      # NEW — `ads performance` command
  plan.ts             # MODIFIED — include performance analysis in plan output
```

### Data flow

```
Campaign code              Provider APIs              Analysis
─────────────              ─────────────              ────────

.performance({      →      google/performance.ts
  targetCPA,               meta/performance.ts
  maxBudget,               (GAQL / Graph API Insights
  strategy                  queries for metrics +
})                          breakdowns)
                                  │
                                  ▼
                           performance/fetch.ts
                           (normalizes to
                            PerformanceData[])
                                  │
                     ┌────────────┼────────────┐
                     ▼                         ▼
              performance/              performance/
              analyze.ts                evaluate.ts
              (pure computation:        (AI via Vercel SDK:
               violations,              reads strategy text +
               signals,                 metrics, returns
               deterministic            context-aware
               recommendations)         recommendations)
                     │                         │
                     └────────────┬────────────┘
                                  ▼
                           performance/resolve.ts
                           (merges computed + AI
                            results into
                            PerformanceReport)
                                  │
                     ┌────────────┼────────────┐
                     ▼            ▼             ▼
                  CLI          plan           JSON
                  display      integration    output
                  (human)      (unified       (AI agent
                               diff view)     consumption)
```

### Key design decisions

**Performance fetch is separate from config fetch.** The existing `google/fetch.ts` and `meta/fetch.ts` pull campaign structure (names, bids, settings). The new `google/performance.ts` and `meta/performance.ts` pull metrics (clicks, cost, conversions). Different queries, different data shapes, different cadence. No mixing.

**`plan` does two fetches in parallel.** Structure fetch (existing) produces a structural diff. Performance fetch (new) produces a performance analysis. Both appear in plan output but are independent pipelines. If performance fetch fails (API quota, no data yet), plan still works — it just shows structural changes only.

**Analysis is a pure function.** `analyze(data: PerformanceData[], targets: Map<string, PerformanceTargets>) → { violations, signals, recommendations }`. No side effects, no API calls. Testable with fixtures. The AI evaluation in `evaluate.ts` is the only impure part and is opt-in (only runs when `strategy` is present).

**Target inheritance.** Campaign-level targets cascade to ad groups/ad sets unless overridden. Resolution order: ad group target → campaign target → no target. Same model as CSS specificity. Implemented in `resolve.ts` when building the final PerformanceReport.

### Two-layer analysis

**Layer 1: Pure computation (no AI, always runs)**

Deterministic analysis that compares metrics against targets and detects anomalies:

- **Violations** — targetCPA vs actual CPA, minROAS vs actual ROAS, etc.
- **Budget scaling** — maxBudget declared + targets met → recommend budget increase
- **Zero-conversion detection** — resources with spend but no conversions
- **Trend detection** — byDay breakdown → linear regression for declining/improving trends
- **Spend concentration** — one keyword/ad consuming >60% of budget
- **Creative fatigue** — CTR declining >20% over the period for a specific ad
- **Search term opportunities** — Google: converting search terms not matched by existing keywords

**Layer 2: AI evaluation (Vercel AI SDK, only when `strategy` is present)**

Uses the same infrastructure as `ai.rsa()` — Vercel AI SDK's `generateObject()` with Zod schemas for structured output:

- Compiles a prompt: strategy text + full performance metrics + signals from Layer 1
- LLM evaluates strategy against current performance
- Returns structured `PerformanceRecommendation[]` with confidence scores
- Results are richer and context-aware (understands "launch phase", "seasonal", "LTV considerations")
- Uses retry logic from `src/ai/generate.ts` (exponential backoff: 1s, 2s, 4s)

The AI evaluation follows the established marker pattern:
- `ai.rsa()` → marker declared inline → resolved at plan-time by LLM → structured output
- `strategy: "..."` → declared inline on `.performance()` → evaluated at performance-time by LLM → structured recommendations

### Provider-specific fetch implementations

**Google (`src/google/performance.ts`):**

GAQL queries for metrics. Uses the existing `google-ads-api` gRPC client from `src/google/api.ts`.

```sql
-- Campaign-level metrics (last N days)
SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions, metrics.conversions_value,
  metrics.search_impression_share
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND campaign.status != 'REMOVED'

-- Keyword-level metrics
SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM keyword_view
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Ad-level metrics
SELECT ad_group_ad.ad.id, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Search term report
SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
  metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Device breakdown (via segments.device)
-- Day breakdown (via segments.date in SELECT)
```

Amounts are converted from micros to currency (divide by 1,000,000). Computed metrics (CTR, CPC, CPA, ROAS) are derived, not queried.

**Meta (`src/meta/performance.ts`):**

Graph API Insights endpoint. Uses the existing client from `src/meta/api.ts`.

```
GET /{campaign-id}/insights?
  fields=impressions,clicks,spend,actions,action_values,cpm,frequency,reach
  &time_range={'since':'{start}','until':'{end}'}
  &breakdowns=age,gender,publisher_platform,platform_position
  &time_increment=1  (for daily breakdown)
  &level=campaign|adset|ad
```

Conversions are extracted from the `actions` array (filtering for the configured conversion event). Spend is in account currency (no micros conversion needed). Computed metrics derived from raw values.

## CLI Surface

### `ads performance` command

```bash
ads performance                          # all campaigns, last 7d
ads performance --period 30d             # last 30 days
ads performance --period 2026-03-01:2026-03-15  # specific date range
ads performance --campaign "Brand — US"  # specific campaign
ads performance --provider google        # google only
ads performance --json                   # structured JSON (for AI agents)
ads performance --no-ai                  # skip AI strategy evaluation
```

**Human-readable output:**

```
Performance Report — last 7 days
════════════════════════════════════════════════════════════════

Brand — US (Google Search)                    budget: €3/day
  CPA  €6.91   target: €15.00   ✓            spend: €48.37
  CTR  4.2%                                   conversions: 7
  ▲ budget-constrained — missing ~8 conversions/week

  Exact Match
    CPA  €5.20   target: €10.00   ✓           spend: €31.20
    ⚠ kw "competitor name" — €80 spent, 0 conversions
    ✓ kw "my brand" — CPA €3.20, 38 conversions

  Broad Match
    CPA  €9.50                                 spend: €17.17

Retargeting — Lookalikes (Meta)               budget: €200/day
  CPA  €24.00  target: €30.00   ✓             spend: €1,400
  ROAS 3.1x    target: 2.5x     ✓             conversions: 58
  ✓ performing within all targets

Signals
  ⚠ brand-us/exact-match — budget-constrained, CPA well under target
  ✗ brand-us/exact-match/kw:competitor-name:EXACT — €80, 0 conversions
  ℹ retargeting/lookalike-1pct — in learning phase (3 days remaining)

Recommendations
  ▲ brand-us: scale budget €3 → €12/day (CPA has 54% headroom)  [computed]
  ✗ brand-us/exact-match/kw:competitor-name:EXACT: pause           [computed]
  ▲ retargeting: scale budget €200 → €350/day (ROAS exceeds target) [ai]

Summary: 2 campaigns · €1,448 spend · 65 conversions · CPA €22.28 · ROAS 2.8x
         2 violations · 3 signals · 3 recommendations
```

### Integration with `ads plan`

When `ads plan` runs, it fetches both structural state and performance data in parallel:

```
Structural Changes
  ~ brand-us/exact-match/kw:competitor-name:EXACT    status: enabled → paused

Performance (last 7d)
  ✗ brand-us/exact-match          CPA €52.00  target: €15.00  (+247%)
  ▲ brand-us/broad-match          budget €3 → €12/day recommended
    CPA €6.91 (target: €15) · maxBudget: €50/day · headroom to scale
  ✓ retargeting/lookalike-1pct    CPA €11.00  target: €25.00

Signals
  ⚠ brand-us/exact-match — keyword "competitor name" spent €80, 0 conversions
  ⚠ brand-us/broad-match — budget-constrained, missing ~8 conversions/week

Summary: 1 structural change | 1 violation | 2 signals
```

Performance data in `plan` is informational — it doesn't block `apply`. An AI agent sees both structural and performance changes in one view and makes decisions in a single pass.

## AI Agent Workflow

The complete optimization loop for an AI agent:

### Step 1: Read performance

```bash
ads performance --json
```

Returns full `PerformanceReport` with metrics, violations, signals, and recommendations (both computed and AI-evaluated).

### Step 2: Reason

The agent reads:
- **Violations** — what's outside declared targets
- **Signals** — anomalies and patterns in the data
- **Recommendations** — suggested actions with confidence
- **Strategy text** — the human's declared intent
- **Raw breakdowns** — drill-down data for nuanced decisions

Example agent reasoning: "The strategy says pause keywords over €50 with zero conversions. 'competitor name' qualifies. CPA is well under target with room to scale. I'll pause that keyword and increase budget."

### Step 3: Modify campaign code

The agent edits the TypeScript campaign files — adds `.status("paused")` to a keyword, changes `.budget()`, adjusts targeting, etc. This is standard file editing, same as any code change.

### Step 4: Plan and verify

```bash
ads plan
```

The agent sees the structural diff of its changes alongside the updated performance context. Verifies the changes make sense.

### Step 5: Apply

```bash
ads apply
```

Changes go live. The operation is recorded in the cache (operations table) for audit trail.

### Cross-platform optimization

Because performance data is provider-agnostic (`PerformanceReport` contains data from all providers), an AI agent can make cross-platform decisions:

```
Google Brand — CPA €15, ROAS 2.1x
Meta Retargeting — CPA €8, ROAS 4.2x
```

Agent: "Meta is acquiring at half the CPA with double the ROAS. Shift 20% of Google budget to Meta retargeting." No single platform can make this decision — the agent sees the full picture because the SDK normalizes data across providers.

## Type Changes to Existing Code

### Campaign builder types

Add optional `performance()` method to existing builders:

**`src/google/types.ts`:**
```typescript
// Add to GoogleSearchCampaign builder chain
.performance(targets: PerformanceTargets): this

// Add to GoogleAdGroupBuilder
.performance(targets: PerformanceTargets): this
```

**`src/meta/types.ts`:**
```typescript
// Add to MetaCampaignBuilder
.performance(targets: PerformanceTargets): this

// Add to AdSetBuilder
.performance(targets: PerformanceTargets): this
```

### Resource type

Performance targets are stored on the campaign/ad-group config objects (the builder output), NOT on `Resource`. The `Resource` type is unchanged — it represents platform state. Targets are resolved by matching campaign definitions to their corresponding performance data by path.

### AdsConfig

Optional performance-level config in `ads.config.ts`:

```typescript
export default defineConfig({
  google: { customerId: '...', managerId: '...' },
  meta: { accountId: '...', pageId: '...' },
  performance: {
    defaultPeriod: '7d',           // default lookback for performance queries
    severityThresholds: {
      warning: 0.20,               // 20% deviation from target
      critical: 0.50,              // 50% deviation from target
    },
    ai: {
      model: 'claude-sonnet-4-5',  // model for strategy evaluation
      provider: 'anthropic',
    },
  },
})
```

## Testing Strategy

### Unit tests

- **analyze.ts** — pure function, test with fixture data: known metrics + known targets → expected violations, signals, recommendations
- **resolve.ts** — target inheritance (campaign → ad group), merging computed + AI results
- **helpers.ts** — under/over/between constraint evaluation
- **google/performance.ts** — mock GAQL responses → normalized PerformanceData
- **meta/performance.ts** — mock Graph API Insights responses → normalized PerformanceData
- **evaluate.ts** — mock Vercel AI SDK, verify prompt compilation and Zod schema validation

### Fixtures

- `test/fixtures/performance/` — mock API responses for Google and Meta metrics
- `test/fixtures/performance/campaigns/` — campaign definitions with various target configurations

### Integration tests

- Google GAQL performance queries against sandbox account
- Meta Insights API queries against test ad account
- End-to-end: campaign with targets → fetch → analyze → verify report output

## Scope and Non-Goals

### In scope (Phase 1)
- PerformanceTargets on campaign/ad-group builders
- Google and Meta performance fetch (campaign, ad group, keyword, ad, search term breakdowns)
- Pure analysis engine (violations, signals, deterministic recommendations)
- AI strategy evaluation via Vercel AI SDK
- `ads performance` CLI command with human and JSON output
- Performance section in `ads plan` output
- Device, day, placement, audience breakdowns

### Future phases (out of scope for now)
- **Historical tracking** — storing performance snapshots in SQLite cache for trend analysis across runs
- **Automated apply** — performance recommendations that auto-apply without human/agent confirmation
- **Alerting** — push notifications when targets are violated
- **Budget rebalancing engine** — cross-campaign budget optimization as a first-class operation
- **A/B test tracking** — ad variant performance comparison with statistical significance
- **Attribution modeling** — cross-platform conversion attribution
- **Scheduled runs** — cron-based performance monitoring
