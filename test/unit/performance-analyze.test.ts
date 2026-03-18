import { describe, test, expect } from 'bun:test'
import {
  computeViolations,
  detectSignals,
  computeRecommendations,
  analyze,
} from '../../src/performance/analyze.ts'
import type {
  PerformanceData,
  PerformanceMetrics,
  PerformanceTargets,
  SeverityThresholds,
} from '../../src/performance/types.ts'

// ─── Test Fixture Helpers ──────────────────────────────────

const period = { start: new Date('2026-03-01'), end: new Date('2026-03-14') }

function makeMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  const defaults: PerformanceMetrics = {
    impressions: 1000,
    clicks: 50,
    cost: 100,
    conversions: 10,
    conversionValue: 500,
    ctr: 0.05,
    cpc: 2,
    cpa: 10,
    roas: 5,
    cpm: 100,
  }
  return { ...defaults, ...overrides }
}

function makeData(overrides: Partial<PerformanceData> = {}): PerformanceData {
  return {
    resource: 'campaign-a',
    provider: 'google',
    kind: 'campaign',
    period,
    metrics: makeMetrics(),
    violations: [],
    breakdowns: {},
    ...overrides,
  }
}

/** Build daily breakdown entries for trend detection tests. */
function makeDailyBreakdown(
  days: number,
  ctrValues: number[],
): { date: string; metrics: PerformanceMetrics }[] {
  return ctrValues.map((ctr, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    metrics: makeMetrics({ ctr, impressions: 1000, clicks: Math.round(ctr * 1000) }),
  }))
}

// ─── computeViolations ────────────────────────────────────

describe('computeViolations', () => {
  test('returns empty array when no targets', () => {
    const result = computeViolations(makeMetrics(), {})
    expect(result).toEqual([])
  })

  test('returns empty array when all targets are met', () => {
    const metrics = makeMetrics({ cpa: 10, roas: 5, ctr: 0.05, cpc: 2 })
    const targets: PerformanceTargets = {
      targetCPA: 15,
      minROAS: 3,
      minCTR: 0.03,
      maxCPC: 5,
    }
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  // --- targetCPA violations ---

  test('detects CPA over target as warning (>20%)', () => {
    const metrics = makeMetrics({ cpa: 20 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'cpa',
      actual: 20,
      target: 15,
      direction: 'over',
      severity: 'warning',
    })
    // deviation = (20 - 15) / 15 = 0.333...
    expect(result[0]!.deviation).toBeCloseTo(0.333, 2)
  })

  test('detects CPA over target as critical (>50%)', () => {
    const metrics = makeMetrics({ cpa: 25 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!.severity).toBe('critical')
  })

  test('null CPA (zero conversions but spending) is critical violation', () => {
    const metrics = makeMetrics({ cpa: null, conversions: 0, cost: 50 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'cpa',
      severity: 'critical',
      direction: 'over',
    })
  })

  test('null CPA with zero cost is NOT a violation', () => {
    const metrics = makeMetrics({ cpa: null, conversions: 0, cost: 0 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  test('CPA exactly at target is not a violation', () => {
    const metrics = makeMetrics({ cpa: 15 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  test('CPA slightly over target but under warning threshold is not a violation', () => {
    const metrics = makeMetrics({ cpa: 17 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    // deviation = (17-15)/15 = 0.133 < 0.20 warning threshold
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  // --- minROAS violations ---

  test('detects ROAS under target as warning', () => {
    const metrics = makeMetrics({ roas: 1.8 })
    const targets: PerformanceTargets = { minROAS: 2.5 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'roas',
      actual: 1.8,
      target: 2.5,
      direction: 'under',
      severity: 'warning',
    })
  })

  test('detects ROAS far under target as critical', () => {
    const metrics = makeMetrics({ roas: 1.0 })
    const targets: PerformanceTargets = { minROAS: 2.5 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!.severity).toBe('critical')
  })

  test('null ROAS (zero cost) is not a violation', () => {
    const metrics = makeMetrics({ roas: null, cost: 0 })
    const targets: PerformanceTargets = { minROAS: 2.5 }
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  // --- minCTR violations ---

  test('detects CTR under target', () => {
    const metrics = makeMetrics({ ctr: 0.01 })
    const targets: PerformanceTargets = { minCTR: 0.03 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'ctr',
      direction: 'under',
    })
  })

  // --- maxCPC violations ---

  test('detects CPC over target', () => {
    const metrics = makeMetrics({ cpc: 8 })
    const targets: PerformanceTargets = { maxCPC: 5 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'cpc',
      direction: 'over',
    })
  })

  // --- minConversions violations ---

  test('detects conversions under target', () => {
    const metrics = makeMetrics({ conversions: 3 })
    const targets: PerformanceTargets = { minConversions: 10 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'conversions',
      actual: 3,
      target: 10,
      direction: 'under',
    })
  })

  // --- minImpressionShare violations ---

  test('detects impression share under target', () => {
    const metrics = makeMetrics({ impressionShare: 0.4 })
    const targets: PerformanceTargets = { minImpressionShare: 0.8 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      metric: 'impressionShare',
      direction: 'under',
    })
  })

  test('skips impression share when not available', () => {
    const metrics = makeMetrics() // no impressionShare
    const targets: PerformanceTargets = { minImpressionShare: 0.8 }
    const result = computeViolations(metrics, targets)
    expect(result).toEqual([])
  })

  // --- Multiple violations ---

  test('detects multiple violations at once', () => {
    const metrics = makeMetrics({ cpa: 25, roas: 1.0, ctr: 0.005 })
    const targets: PerformanceTargets = { targetCPA: 15, minROAS: 2.5, minCTR: 0.03 }
    const result = computeViolations(metrics, targets)
    expect(result).toHaveLength(3)
    const metricNames = result.map(v => v.metric)
    expect(metricNames).toContain('cpa')
    expect(metricNames).toContain('roas')
    expect(metricNames).toContain('ctr')
  })

  // --- Custom thresholds ---

  test('uses custom severity thresholds', () => {
    const metrics = makeMetrics({ cpa: 16 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    // Default: 6.67% over, no violation. With 5% warning threshold: violation
    const custom: SeverityThresholds = { warning: 0.05, critical: 0.30 }
    const result = computeViolations(metrics, targets, custom)
    expect(result).toHaveLength(1)
    expect(result[0]!.severity).toBe('warning')
  })

  test('custom thresholds shift critical boundary', () => {
    const metrics = makeMetrics({ cpa: 20 })
    const targets: PerformanceTargets = { targetCPA: 15 }
    // 33% over target. With critical at 0.30: should be critical
    const custom: SeverityThresholds = { warning: 0.10, critical: 0.30 }
    const result = computeViolations(metrics, targets, custom)
    expect(result).toHaveLength(1)
    expect(result[0]!.severity).toBe('critical')
  })
})

// ─── detectSignals ────────────────────────────────────────

describe('detectSignals', () => {
  // --- zero-conversions ---

  test('detects zero-conversions when cost > $10 and 0 conversions', () => {
    const data = [makeData({
      metrics: makeMetrics({ cost: 15, conversions: 0, cpa: null }),
    })]
    const signals = detectSignals(data)
    const zc = signals.filter(s => s.type === 'zero-conversions')
    expect(zc).toHaveLength(1)
    expect(zc[0]!.severity).toBe('warning')
    expect(zc[0]!.resource).toBe('campaign-a')
  })

  test('no zero-conversions signal when cost <= $10', () => {
    const data = [makeData({
      metrics: makeMetrics({ cost: 8, conversions: 0, cpa: null }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'zero-conversions')).toHaveLength(0)
  })

  test('no zero-conversions signal when conversions > 0', () => {
    const data = [makeData({
      metrics: makeMetrics({ cost: 100, conversions: 5 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'zero-conversions')).toHaveLength(0)
  })

  // --- declining-trend ---

  test('detects declining-trend when CTR drops >20%', () => {
    // First half avg CTR: 0.05, second half avg CTR: 0.03 → 40% drop
    const dailyCtr = [0.05, 0.05, 0.05, 0.05, 0.03, 0.03, 0.03, 0.03]
    const data = [makeData({
      breakdowns: { byDay: makeDailyBreakdown(8, dailyCtr) },
    })]
    const signals = detectSignals(data)
    const dt = signals.filter(s => s.type === 'declining-trend')
    expect(dt).toHaveLength(1)
    expect(dt[0]!.severity).toBe('warning')
  })

  test('no declining-trend with fewer than 4 days', () => {
    const dailyCtr = [0.05, 0.02, 0.01] // only 3 days
    const data = [makeData({
      breakdowns: { byDay: makeDailyBreakdown(3, dailyCtr) },
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'declining-trend')).toHaveLength(0)
  })

  test('no declining-trend when drop is <=20%', () => {
    // 10% drop
    const dailyCtr = [0.05, 0.05, 0.048, 0.045]
    const data = [makeData({
      breakdowns: { byDay: makeDailyBreakdown(4, dailyCtr) },
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'declining-trend')).toHaveLength(0)
  })

  // --- improving-trend ---

  test('detects improving-trend when CTR increases >20%', () => {
    // First half avg: 0.03, second half avg: 0.05 → 66% increase
    const dailyCtr = [0.03, 0.03, 0.03, 0.03, 0.05, 0.05, 0.05, 0.05]
    const data = [makeData({
      breakdowns: { byDay: makeDailyBreakdown(8, dailyCtr) },
    })]
    const signals = detectSignals(data)
    const it = signals.filter(s => s.type === 'improving-trend')
    expect(it).toHaveLength(1)
    expect(it[0]!.severity).toBe('info')
  })

  // --- creative-fatigue ---

  test('detects creative-fatigue for ad kind with declining CTR', () => {
    const dailyCtr = [0.06, 0.06, 0.06, 0.06, 0.03, 0.03, 0.03, 0.03]
    const data = [makeData({
      kind: 'ad',
      resource: 'campaign-a/group-1/ad:abc123',
      breakdowns: { byDay: makeDailyBreakdown(8, dailyCtr) },
    })]
    const signals = detectSignals(data)
    const cf = signals.filter(s => s.type === 'creative-fatigue')
    expect(cf).toHaveLength(1)
    expect(cf[0]!.severity).toBe('warning')
  })

  test('no creative-fatigue for non-ad kinds', () => {
    const dailyCtr = [0.06, 0.06, 0.06, 0.06, 0.03, 0.03, 0.03, 0.03]
    const data = [makeData({
      kind: 'campaign', // not an ad
      breakdowns: { byDay: makeDailyBreakdown(8, dailyCtr) },
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'creative-fatigue')).toHaveLength(0)
  })

  // --- search-term-opportunity ---

  test('detects search-term-opportunity for converting terms with clicks >= 5', () => {
    const data = [makeData({
      breakdowns: {
        bySearchTerm: [
          { term: 'buy widgets', metrics: makeMetrics({ clicks: 10, conversions: 3 }) },
          { term: 'widget reviews', metrics: makeMetrics({ clicks: 4, conversions: 1 }) }, // clicks < 5
          { term: 'cheap widgets', metrics: makeMetrics({ clicks: 8, conversions: 0 }) }, // 0 conversions
        ],
      },
    })]
    const signals = detectSignals(data)
    const sto = signals.filter(s => s.type === 'search-term-opportunity')
    expect(sto).toHaveLength(1)
    expect(sto[0]!.evidence).toMatchObject({ term: 'buy widgets' })
  })

  // --- high-frequency ---

  test('detects high-frequency for Meta when frequency > 4', () => {
    const data = [makeData({
      provider: 'meta',
      metrics: makeMetrics({ frequency: 5.2 }),
    })]
    const signals = detectSignals(data)
    const hf = signals.filter(s => s.type === 'high-frequency')
    expect(hf).toHaveLength(1)
    expect(hf[0]!.severity).toBe('warning')
  })

  test('no high-frequency when frequency <= 4', () => {
    const data = [makeData({
      provider: 'meta',
      metrics: makeMetrics({ frequency: 3.5 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'high-frequency')).toHaveLength(0)
  })

  test('no high-frequency for Google provider', () => {
    const data = [makeData({
      provider: 'google',
      metrics: makeMetrics({ frequency: 6 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'high-frequency')).toHaveLength(0)
  })

  // --- low-quality-score ---

  test('detects low-quality-score for Google keywords with score <= 3', () => {
    const data = [makeData({
      provider: 'google',
      kind: 'keyword',
      resource: 'campaign-a/group-1/kw:test:EXACT',
      metrics: makeMetrics({ qualityScore: 2 }),
    })]
    const signals = detectSignals(data)
    const lqs = signals.filter(s => s.type === 'low-quality-score')
    expect(lqs).toHaveLength(1)
    expect(lqs[0]!.severity).toBe('warning')
  })

  test('no low-quality-score when score > 3', () => {
    const data = [makeData({
      provider: 'google',
      kind: 'keyword',
      metrics: makeMetrics({ qualityScore: 5 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'low-quality-score')).toHaveLength(0)
  })

  // --- budget-constrained ---

  test('detects budget-constrained when CPA < 70% of targetCPA and impressionShare < 0.9', () => {
    const data = [makeData({
      metrics: makeMetrics({ cpa: 8, impressionShare: 0.6 }),
      targets: { targetCPA: 20 },
    })]
    const signals = detectSignals(data)
    const bc = signals.filter(s => s.type === 'budget-constrained')
    expect(bc).toHaveLength(1)
    expect(bc[0]!.severity).toBe('warning')
  })

  test('no budget-constrained when CPA is close to target', () => {
    const data = [makeData({
      metrics: makeMetrics({ cpa: 18, impressionShare: 0.6 }),
      targets: { targetCPA: 20 },
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'budget-constrained')).toHaveLength(0)
  })

  test('no budget-constrained when impression share is high', () => {
    const data = [makeData({
      metrics: makeMetrics({ cpa: 8, impressionShare: 0.95 }),
      targets: { targetCPA: 20 },
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'budget-constrained')).toHaveLength(0)
  })

  test('no budget-constrained without targets', () => {
    const data = [makeData({
      metrics: makeMetrics({ cpa: 5, impressionShare: 0.5 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'budget-constrained')).toHaveLength(0)
  })

  // --- spend-concentration ---

  test('detects spend-concentration when child consumes >60% of parent spend', () => {
    const parent = makeData({
      resource: 'campaign-a',
      kind: 'campaign',
      metrics: makeMetrics({ cost: 100 }),
    })
    const child = makeData({
      resource: 'campaign-a/group-1',
      kind: 'adGroup',
      metrics: makeMetrics({ cost: 70 }),
    })
    const signals = detectSignals([parent, child])
    const sc = signals.filter(s => s.type === 'spend-concentration')
    expect(sc).toHaveLength(1)
    expect(sc[0]!.resource).toBe('campaign-a/group-1')
    expect(sc[0]!.evidence).toMatchObject({ percentage: 0.7 })
  })

  test('no spend-concentration when spend is distributed', () => {
    const parent = makeData({
      resource: 'campaign-a',
      kind: 'campaign',
      metrics: makeMetrics({ cost: 100 }),
    })
    const child = makeData({
      resource: 'campaign-a/group-1',
      kind: 'adGroup',
      metrics: makeMetrics({ cost: 50 }),
    })
    const signals = detectSignals([parent, child])
    expect(signals.filter(s => s.type === 'spend-concentration')).toHaveLength(0)
  })

  // --- learning-phase ---

  test('detects learning-phase for Meta adSet with 0 < conversions < 50', () => {
    const data = [makeData({
      provider: 'meta',
      kind: 'adSet',
      resource: 'campaign-a/adset-1',
      metrics: makeMetrics({ conversions: 15 }),
    })]
    const signals = detectSignals(data)
    const lp = signals.filter(s => s.type === 'learning-phase')
    expect(lp).toHaveLength(1)
    expect(lp[0]!.severity).toBe('info')
  })

  test('no learning-phase when conversions >= 50', () => {
    const data = [makeData({
      provider: 'meta',
      kind: 'adSet',
      metrics: makeMetrics({ conversions: 50 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'learning-phase')).toHaveLength(0)
  })

  test('no learning-phase when conversions = 0', () => {
    const data = [makeData({
      provider: 'meta',
      kind: 'adSet',
      metrics: makeMetrics({ conversions: 0, cpa: null }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'learning-phase')).toHaveLength(0)
  })

  test('no learning-phase for non-adSet kinds', () => {
    const data = [makeData({
      provider: 'meta',
      kind: 'campaign',
      metrics: makeMetrics({ conversions: 15 }),
    })]
    const signals = detectSignals(data)
    expect(signals.filter(s => s.type === 'learning-phase')).toHaveLength(0)
  })

  // --- combined ---

  test('detects multiple signal types from same data', () => {
    const data = [makeData({
      provider: 'meta',
      kind: 'adSet',
      metrics: makeMetrics({ cost: 50, conversions: 0, cpa: null, frequency: 6 }),
    })]
    const signals = detectSignals(data)
    const types = signals.map(s => s.type)
    expect(types).toContain('zero-conversions')
    expect(types).toContain('high-frequency')
  })

  test('returns empty for clean data', () => {
    const data = [makeData()]
    const signals = detectSignals(data)
    expect(signals).toEqual([])
  })
})

// ─── computeRecommendations ───────────────────────────────

describe('computeRecommendations', () => {
  // --- pause-resource ---

  test('recommends pausing zero-conversion keywords with cost > $10', () => {
    const data = [makeData({
      kind: 'keyword',
      resource: 'campaign-a/group-1/kw:test:EXACT',
      metrics: makeMetrics({ cost: 50, conversions: 0, cpa: null }),
    })]
    const recs = computeRecommendations(data)
    const pause = recs.filter(r => r.type === 'pause-resource')
    expect(pause).toHaveLength(1)
    expect(pause[0]!).toMatchObject({
      resource: 'campaign-a/group-1/kw:test:EXACT',
      confidence: 'high',
      source: 'computed',
    })
  })

  test('recommends pausing zero-conversion ads with cost > $10', () => {
    const data = [makeData({
      kind: 'ad',
      resource: 'campaign-a/group-1/ad:abc',
      metrics: makeMetrics({ cost: 25, conversions: 0, cpa: null }),
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'pause-resource')).toHaveLength(1)
  })

  test('does not recommend pausing campaigns (only keywords/ads)', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cost: 50, conversions: 0, cpa: null }),
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'pause-resource')).toHaveLength(0)
  })

  test('does not recommend pausing when cost <= $10', () => {
    const data = [makeData({
      kind: 'keyword',
      metrics: makeMetrics({ cost: 8, conversions: 0, cpa: null }),
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'pause-resource')).toHaveLength(0)
  })

  // --- scale-budget ---

  test('recommends scale-budget when CPA has >30% headroom and maxBudget set', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cpa: 8 }),
      targets: {
        targetCPA: 15,
        maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const },
      },
    })]
    const recs = computeRecommendations(data)
    const scale = recs.filter(r => r.type === 'scale-budget')
    expect(scale).toHaveLength(1)
    expect(scale[0]!).toMatchObject({
      resource: 'campaign-a',
      confidence: 'medium',
      source: 'computed',
    })
  })

  test('no scale-budget without maxBudget', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cpa: 8 }),
      targets: { targetCPA: 15 },
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'scale-budget')).toHaveLength(0)
  })

  test('no scale-budget when CPA headroom is <=30%', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cpa: 12 }),
      targets: {
        targetCPA: 15,
        maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const },
      },
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'scale-budget')).toHaveLength(0)
  })

  test('no scale-budget when CPA is null (zero conversions)', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cpa: null, conversions: 0 }),
      targets: {
        targetCPA: 15,
        maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const },
      },
    })]
    const recs = computeRecommendations(data)
    expect(recs.filter(r => r.type === 'scale-budget')).toHaveLength(0)
  })

  // --- add-negative ---

  test('recommends add-negative for search terms with 0 conversions and cost > $20', () => {
    const data = [makeData({
      resource: 'campaign-a',
      breakdowns: {
        bySearchTerm: [
          { term: 'free widgets', metrics: makeMetrics({ cost: 25, conversions: 0, cpa: null }) },
          { term: 'buy widgets', metrics: makeMetrics({ cost: 30, conversions: 3 }) }, // has conversions
          { term: 'widget help', metrics: makeMetrics({ cost: 10, conversions: 0, cpa: null }) }, // cost <= $20
        ],
      },
    })]
    const recs = computeRecommendations(data)
    const neg = recs.filter(r => r.type === 'add-negative')
    expect(neg).toHaveLength(1)
    expect(neg[0]!).toMatchObject({
      type: 'add-negative',
      resource: 'campaign-a',
      keyword: 'free widgets',
      source: 'computed',
    })
  })

  // --- combined ---

  test('returns multiple recommendation types', () => {
    const data = [
      makeData({
        kind: 'campaign',
        resource: 'campaign-a',
        metrics: makeMetrics({ cpa: 5 }),
        targets: {
          targetCPA: 15,
          maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const },
        },
        breakdowns: {
          bySearchTerm: [
            { term: 'junk term', metrics: makeMetrics({ cost: 30, conversions: 0, cpa: null }) },
          ],
        },
      }),
      makeData({
        kind: 'keyword',
        resource: 'campaign-a/group-1/kw:bad:EXACT',
        metrics: makeMetrics({ cost: 60, conversions: 0, cpa: null }),
      }),
    ]
    const recs = computeRecommendations(data)
    const types = recs.map(r => r.type)
    expect(types).toContain('scale-budget')
    expect(types).toContain('pause-resource')
    expect(types).toContain('add-negative')
  })

  test('returns empty for well-performing data without opportunities', () => {
    const data = [makeData({
      kind: 'campaign',
      metrics: makeMetrics({ cpa: 10 }),
    })]
    const recs = computeRecommendations(data)
    expect(recs).toEqual([])
  })
})

// ─── analyze ──────────────────────────────────────────────

describe('analyze', () => {
  test('merges targets from Map onto data', () => {
    const data = [makeData({ resource: 'campaign-a' })]
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15 }],
    ])
    const result = analyze(data, targets)
    expect(result.data[0]!.targets).toEqual({ targetCPA: 15 })
  })

  test('does not overwrite existing targets on data', () => {
    const data = [makeData({
      resource: 'campaign-a',
      targets: { targetCPA: 10 },
    })]
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15 }],
    ])
    const result = analyze(data, targets)
    // Existing targets on data take precedence
    expect(result.data[0]!.targets).toEqual({ targetCPA: 10 })
  })

  test('computes violations for data with merged targets', () => {
    const data = [makeData({
      resource: 'campaign-a',
      metrics: makeMetrics({ cpa: 25 }),
    })]
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15 }],
    ])
    const result = analyze(data, targets)
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]!.metric).toBe('cpa')
  })

  test('enriches data with computed violations', () => {
    const data = [makeData({
      resource: 'campaign-a',
      metrics: makeMetrics({ cpa: 25 }),
    })]
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15 }],
    ])
    const result = analyze(data, targets)
    // The enriched data should have violations on it
    expect(result.data[0]!.violations.length).toBeGreaterThan(0)
  })

  test('collects signals across all data', () => {
    const data = [
      makeData({
        resource: 'campaign-a',
        metrics: makeMetrics({ cost: 50, conversions: 0, cpa: null }),
      }),
    ]
    const result = analyze(data, new Map())
    expect(result.signals.length).toBeGreaterThan(0)
  })

  test('collects recommendations across all data', () => {
    const data = [
      makeData({
        kind: 'keyword',
        resource: 'campaign-a/group-1/kw:test:EXACT',
        metrics: makeMetrics({ cost: 30, conversions: 0, cpa: null }),
      }),
    ]
    const result = analyze(data, new Map())
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  test('passes custom thresholds through to violation computation', () => {
    const data = [makeData({
      resource: 'campaign-a',
      metrics: makeMetrics({ cpa: 16 }),
    })]
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15 }],
    ])
    // With tight thresholds, 6.67% deviation should be a violation
    const result = analyze(data, targets, { warning: 0.05, critical: 0.30 })
    expect(result.violations).toHaveLength(1)
  })

  test('returns complete AnalysisResult shape', () => {
    const result = analyze([], new Map())
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('violations')
    expect(result).toHaveProperty('signals')
    expect(result).toHaveProperty('recommendations')
    expect(Array.isArray(result.data)).toBe(true)
    expect(Array.isArray(result.violations)).toBe(true)
    expect(Array.isArray(result.signals)).toBe(true)
    expect(Array.isArray(result.recommendations)).toBe(true)
  })

  test('handles empty data gracefully', () => {
    const result = analyze([], new Map())
    expect(result.data).toEqual([])
    expect(result.violations).toEqual([])
    expect(result.signals).toEqual([])
    expect(result.recommendations).toEqual([])
  })

  test('full integration: campaign with keywords and search terms', () => {
    const data = [
      makeData({
        kind: 'campaign',
        resource: 'brand-us',
        metrics: makeMetrics({ cpa: 8, impressionShare: 0.6 }),
        targets: {
          targetCPA: 20,
          maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const },
        },
        breakdowns: {
          bySearchTerm: [
            { term: 'junk query', metrics: makeMetrics({ cost: 25, conversions: 0, cpa: null }) },
          ],
        },
      }),
      makeData({
        kind: 'keyword',
        resource: 'brand-us/exact/kw:bad-keyword:EXACT',
        metrics: makeMetrics({ cost: 80, conversions: 0, cpa: null }),
      }),
      makeData({
        kind: 'adGroup',
        resource: 'brand-us/exact',
        metrics: makeMetrics({ cost: 90 }),
      }),
    ]
    const result = analyze(data, new Map())

    // Should have signals: zero-conversions (keyword), budget-constrained, spend-concentration
    expect(result.signals.length).toBeGreaterThan(0)

    // Should have recommendations: pause-resource (keyword), scale-budget, add-negative
    expect(result.recommendations.length).toBeGreaterThan(0)

    // Verify specific recommendation types present
    const recTypes = result.recommendations.map(r => r.type)
    expect(recTypes).toContain('pause-resource')
    expect(recTypes).toContain('scale-budget')
    expect(recTypes).toContain('add-negative')
  })
})
