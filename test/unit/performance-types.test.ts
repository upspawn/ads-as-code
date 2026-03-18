import { describe, test, expect } from 'bun:test'
import type { PerformanceTargets, PerformanceMetrics } from '../../src/performance/types.ts'
import { computeMetrics } from '../../src/performance/types.ts'

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

  test('preserves raw values in output', () => {
    const raw = { impressions: 500, clicks: 25, cost: 50, conversions: 2, conversionValue: 200 }
    const m = computeMetrics(raw)
    expect(m.impressions).toBe(500)
    expect(m.clicks).toBe(25)
    expect(m.cost).toBe(50)
    expect(m.conversions).toBe(2)
    expect(m.conversionValue).toBe(200)
  })
})

describe('PerformanceTargets type', () => {
  test('accepts all optional fields', () => {
    const targets: PerformanceTargets = {
      targetCPA: 15,
      minROAS: 3.5,
      minCTR: 0.02,
      maxCPC: 5,
      maxBudget: { amount: 50, currency: 'EUR', period: 'daily' },
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
