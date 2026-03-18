import { describe, test, expect } from 'bun:test'
import { extractTargets, resolveTargetInheritance, buildPerformanceReport } from '../../src/performance/resolve.ts'
import type { Resource } from '../../src/core/types.ts'
import type { PerformanceData, PerformanceSignal, PerformanceRecommendation, PerformanceTargets } from '../../src/performance/types.ts'

// ---------------------------------------------------------------------------
// Helpers — minimal resource / performance data builders
// ---------------------------------------------------------------------------

function makeResource(path: string, kind: Resource['kind'], targets?: PerformanceTargets): Resource {
  return {
    kind,
    path,
    properties: { name: path.split('/').pop() },
    ...(targets ? { meta: { performanceTargets: targets } } : {}),
  }
}

function makePerformanceData(
  resource: string,
  kind: PerformanceData['kind'],
  overrides: Partial<PerformanceData['metrics']> = {},
): PerformanceData {
  return {
    resource,
    provider: 'google',
    kind,
    period: { start: new Date('2026-03-01'), end: new Date('2026-03-07') },
    metrics: {
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
      ...overrides,
    },
    violations: [],
    breakdowns: {},
  }
}

// ---------------------------------------------------------------------------
// extractTargets
// ---------------------------------------------------------------------------

describe('extractTargets', () => {
  test('extracts targets from Resource.meta.performanceTargets', () => {
    const resources: Resource[] = [
      makeResource('campaign-a', 'campaign', { targetCPA: 15, minROAS: 3 }),
      makeResource('campaign-a/group-1', 'adGroup', { maxCPC: 2.5 }),
      makeResource('campaign-b', 'campaign'), // no targets
    ]

    const targets = extractTargets(resources)

    expect(targets.size).toBe(2)
    expect(targets.get('campaign-a')).toEqual({ targetCPA: 15, minROAS: 3 })
    expect(targets.get('campaign-a/group-1')).toEqual({ maxCPC: 2.5 })
    expect(targets.has('campaign-b')).toBe(false)
  })

  test('returns empty map when no resources have targets', () => {
    const resources: Resource[] = [
      makeResource('campaign-a', 'campaign'),
      makeResource('campaign-b', 'campaign'),
    ]

    expect(extractTargets(resources).size).toBe(0)
  })

  test('skips resources with empty target objects', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'campaign-a',
        properties: {},
        meta: { performanceTargets: {} },
      },
    ]

    expect(extractTargets(resources).size).toBe(0)
  })

  test('handles resources without meta field', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'campaign-a', properties: {} },
    ]

    expect(extractTargets(resources).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// resolveTargetInheritance
// ---------------------------------------------------------------------------

describe('resolveTargetInheritance', () => {
  test('returns campaign-level targets for a campaign path', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15, minROAS: 3 }],
    ])

    const result = resolveTargetInheritance('campaign-a', targets)

    expect(result).toEqual({ targetCPA: 15, minROAS: 3 })
  })

  test('child inherits parent targets', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15, minROAS: 3 }],
    ])

    const result = resolveTargetInheritance('campaign-a/group-1', targets)

    expect(result).toEqual({ targetCPA: 15, minROAS: 3 })
  })

  test('child overrides specific parent target fields', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15, minROAS: 3, maxCPC: 5 }],
      ['campaign-a/group-1', { targetCPA: 10 }],
    ])

    const result = resolveTargetInheritance('campaign-a/group-1', targets)

    expect(result).toEqual({ targetCPA: 10, minROAS: 3, maxCPC: 5 })
  })

  test('deep nesting: keyword inherits from ad group and campaign', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 15, minROAS: 3 }],
      ['campaign-a/group-1', { maxCPC: 2.5 }],
    ])

    const result = resolveTargetInheritance('campaign-a/group-1/kw:test:EXACT', targets)

    expect(result).toEqual({ targetCPA: 15, minROAS: 3, maxCPC: 2.5 })
  })

  test('returns undefined when no targets exist in hierarchy', () => {
    const targets = new Map<string, PerformanceTargets>()

    expect(resolveTargetInheritance('campaign-a/group-1', targets)).toBeUndefined()
  })

  test('leaf-level targets override all ancestors', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { targetCPA: 20 }],
      ['campaign-a/group-1', { targetCPA: 15 }],
      ['campaign-a/group-1/kw:test:EXACT', { targetCPA: 10 }],
    ])

    const result = resolveTargetInheritance('campaign-a/group-1/kw:test:EXACT', targets)

    expect(result).toEqual({ targetCPA: 10 })
  })

  test('strategy field inherits and can be overridden', () => {
    const targets = new Map<string, PerformanceTargets>([
      ['campaign-a', { strategy: 'Maximize conversions at scale', targetCPA: 15 }],
      ['campaign-a/group-1', { strategy: 'Focus on high-intent keywords' }],
    ])

    const result = resolveTargetInheritance('campaign-a/group-1', targets)

    expect(result).toEqual({
      strategy: 'Focus on high-intent keywords',
      targetCPA: 15,
    })
  })
})

// ---------------------------------------------------------------------------
// buildPerformanceReport
// ---------------------------------------------------------------------------

describe('buildPerformanceReport', () => {
  const period = { start: new Date('2026-03-01'), end: new Date('2026-03-07') }

  test('computes summary from campaign-level data only', () => {
    const data: PerformanceData[] = [
      makePerformanceData('campaign-a', 'campaign', { cost: 100, conversions: 10, conversionValue: 500 }),
      makePerformanceData('campaign-b', 'campaign', { cost: 200, conversions: 20, conversionValue: 800 }),
      // Ad group data should NOT be included in totals (it's a subset of campaign data)
      makePerformanceData('campaign-a/group-1', 'adGroup', { cost: 60, conversions: 6, conversionValue: 300 }),
    ]

    const report = buildPerformanceReport(data, [], [], period)

    expect(report.summary.totalSpend).toBe(300)
    expect(report.summary.totalConversions).toBe(30)
    expect(report.summary.totalConversionValue).toBe(1300)
    expect(report.summary.overallCPA).toBe(10) // 300 / 30
    expect(report.summary.overallROAS).toBeCloseTo(4.333, 2) // 1300 / 300
  })

  test('handles zero conversions (CPA is null)', () => {
    const data: PerformanceData[] = [
      makePerformanceData('campaign-a', 'campaign', { cost: 100, conversions: 0, conversionValue: 0 }),
    ]

    const report = buildPerformanceReport(data, [], [], period)

    expect(report.summary.overallCPA).toBeNull()
    expect(report.summary.overallROAS).toBe(0)
  })

  test('handles zero spend (ROAS is null)', () => {
    const data: PerformanceData[] = [
      makePerformanceData('campaign-a', 'campaign', { cost: 0, conversions: 0, conversionValue: 0 }),
    ]

    const report = buildPerformanceReport(data, [], [], period)

    expect(report.summary.overallROAS).toBeNull()
  })

  test('counts signals by severity', () => {
    const signals: PerformanceSignal[] = [
      { type: 'zero-conversions', severity: 'warning', resource: 'a', message: '', evidence: {} },
      { type: 'declining-trend', severity: 'warning', resource: 'b', message: '', evidence: {} },
      { type: 'budget-constrained', severity: 'critical', resource: 'c', message: '', evidence: {} },
      { type: 'improving-trend', severity: 'info', resource: 'd', message: '', evidence: {} },
    ]

    const report = buildPerformanceReport([], signals, [], period)

    expect(report.summary.signalCount).toEqual({ info: 1, warning: 2, critical: 1 })
  })

  test('counts violations across all resource levels', () => {
    const data: PerformanceData[] = [
      {
        ...makePerformanceData('campaign-a', 'campaign'),
        violations: [
          { metric: 'cpa', actual: 20, target: 10, deviation: 1, direction: 'over', severity: 'critical' },
        ],
      },
      {
        ...makePerformanceData('campaign-a/group-1', 'adGroup'),
        violations: [
          { metric: 'cpc', actual: 5, target: 2, deviation: 1.5, direction: 'over', severity: 'warning' },
          { metric: 'ctr', actual: 0.01, target: 0.05, deviation: -0.8, direction: 'under', severity: 'critical' },
        ],
      },
    ]

    const report = buildPerformanceReport(data, [], [], period)

    expect(report.summary.violationCount).toBe(3)
  })

  test('includes all input data in report', () => {
    const data: PerformanceData[] = [makePerformanceData('campaign-a', 'campaign')]
    const signals: PerformanceSignal[] = [
      { type: 'improving-trend', severity: 'info', resource: 'a', message: 'test', evidence: {} },
    ]
    const recs: PerformanceRecommendation[] = [
      { type: 'pause-resource', resource: 'a/b', reason: 'no conversions', confidence: 'high', source: 'computed' },
    ]

    const report = buildPerformanceReport(data, signals, recs, period)

    expect(report.data).toBe(data)
    expect(report.signals).toBe(signals)
    expect(report.recommendations).toBe(recs)
    expect(report.period).toBe(period)
    expect(report.generatedAt).toBeInstanceOf(Date)
  })

  test('empty data produces zeroed summary', () => {
    const report = buildPerformanceReport([], [], [], period)

    expect(report.summary).toEqual({
      totalSpend: 0,
      totalConversions: 0,
      totalConversionValue: 0,
      overallCPA: null,
      overallROAS: null,
      violationCount: 0,
      signalCount: { info: 0, warning: 0, critical: 0 },
    })
  })
})
