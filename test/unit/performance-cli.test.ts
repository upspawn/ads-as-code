import { describe, expect, test } from 'bun:test'
import { parsePeriod, getFlag, formatReport } from '../../cli/performance.ts'
import type { PerformanceReport, PerformanceData } from '../../src/performance/types.ts'

// ---------------------------------------------------------------------------
// parsePeriod
// ---------------------------------------------------------------------------

describe('parsePeriod', () => {
  test('parses "7d" — start is 7 calendar days before end', () => {
    const { start, end } = parsePeriod('7d')

    const today = new Date()
    // End should be today's date
    expect(end.toISOString().slice(0, 10)).toBe(today.toISOString().slice(0, 10))

    // Start date should be 7 calendar days before end date
    const startDate = start.toISOString().slice(0, 10)
    const expected = new Date(today)
    expected.setDate(expected.getDate() - 7)
    expect(startDate).toBe(expected.toISOString().slice(0, 10))

    // Start should be at midnight
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  test('parses "30d" — start is 30 calendar days before end', () => {
    const { start, end } = parsePeriod('30d')

    const endDate = end.toISOString().slice(0, 10)
    const startDate = start.toISOString().slice(0, 10)

    const expected = new Date(endDate)
    expected.setDate(expected.getDate() - 30)
    expect(startDate).toBe(expected.toISOString().slice(0, 10))
  })

  test('parses "0d" — start equals end date', () => {
    const { start, end } = parsePeriod('0d')
    expect(start.toISOString().slice(0, 10)).toBe(end.toISOString().slice(0, 10))
  })

  test('parses date range "2026-03-01:2026-03-15"', () => {
    const { start, end } = parsePeriod('2026-03-01:2026-03-15')
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-15')
  })

  test('parses date range with same start and end', () => {
    const { start, end } = parsePeriod('2026-03-10:2026-03-10')
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-10')
    expect(end.toISOString().slice(0, 10)).toBe('2026-03-10')
  })
})

// ---------------------------------------------------------------------------
// getFlag
// ---------------------------------------------------------------------------

describe('getFlag', () => {
  test('returns value after flag', () => {
    const result = getFlag(['--period', '30d', '--json'], '--period')
    expect(result).toBe('30d')
  })

  test('returns undefined for missing flag', () => {
    const result = getFlag(['--json'], '--period')
    expect(result).toBeUndefined()
  })

  test('returns undefined when flag is last arg (no value follows)', () => {
    const result = getFlag(['--json', '--period'], '--period')
    expect(result).toBeUndefined()
  })

  test('returns first occurrence when flag appears multiple times', () => {
    const result = getFlag(['--period', '7d', '--period', '30d'], '--period')
    expect(result).toBe('7d')
  })
})

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('formatReport', () => {
  const basePeriod = {
    start: new Date('2026-03-01'),
    end: new Date('2026-03-07'),
  }

  function makeReport(overrides: Partial<PerformanceReport> = {}): PerformanceReport {
    return {
      generatedAt: new Date('2026-03-08'),
      period: basePeriod,
      data: [],
      signals: [],
      recommendations: [],
      summary: {
        totalSpend: 0,
        totalConversions: 0,
        totalConversionValue: 0,
        overallCPA: null,
        overallROAS: null,
        violationCount: 0,
        signalCount: { info: 0, warning: 0, critical: 0 },
      },
      ...overrides,
    }
  }

  function makeCampaignData(overrides: Partial<PerformanceData> = {}): PerformanceData {
    return {
      resource: 'brand-us',
      provider: 'google',
      kind: 'campaign',
      period: basePeriod,
      metrics: {
        impressions: 1000,
        clicks: 50,
        cost: 100,
        conversions: 10,
        conversionValue: 300,
        ctr: 0.05,
        cpc: 2,
        cpa: 10,
        roas: 3,
        cpm: 100,
      },
      violations: [],
      breakdowns: {},
      ...overrides,
    }
  }

  test('includes period label in header', () => {
    const output = formatReport(makeReport(), '7d')
    expect(output).toContain('last 7d')
  })

  test('displays campaign-level metrics', () => {
    const report = makeReport({
      data: [makeCampaignData()],
      summary: {
        totalSpend: 100,
        totalConversions: 10,
        totalConversionValue: 300,
        overallCPA: 10,
        overallROAS: 3,
        violationCount: 0,
        signalCount: { info: 0, warning: 0, critical: 0 },
      },
    })

    const output = formatReport(report, '7d')
    expect(output).toContain('brand-us')
    expect(output).toContain('Google Ads')
    expect(output).toContain('CPA')
    expect(output).toContain('ROAS')
  })

  test('includes summary line with totals', () => {
    const report = makeReport({
      summary: {
        totalSpend: 1500,
        totalConversions: 50,
        totalConversionValue: 5000,
        overallCPA: 30,
        overallROAS: 3.33,
        violationCount: 2,
        signalCount: { info: 1, warning: 2, critical: 0 },
      },
    })

    const output = formatReport(report, '7d')
    // New format uses compact summary line
    expect(output).toContain('50 conv')
  })

  test('displays signals grouped by type', () => {
    const report = makeReport({
      signals: [
        {
          type: 'zero-conversions',
          severity: 'critical',
          resource: 'brand-us/exact/kw:test:EXACT',
          message: 'spent $80, 0 conversions',
          evidence: { cost: 80 },
        },
      ],
    })

    const output = formatReport(report, '7d')
    expect(output).toContain('Signals')
    expect(output).toContain('Zero Conversions')
    expect(output).toContain('$80.00 spent, 0 conv')
  })

  test('displays recommendations when present', () => {
    const report = makeReport({
      recommendations: [
        {
          type: 'pause-resource',
          resource: 'brand-us/kw:test:EXACT',
          reason: 'zero conversions after $80 spend',
          confidence: 'high',
          source: 'computed',
        },
      ],
    })

    const output = formatReport(report, '7d')
    expect(output).toContain('Recommendations')
    expect(output).toContain('pause-resource')
    expect(output).toContain('test [EXACT]')
  })

  test('handles empty report gracefully', () => {
    const output = formatReport(makeReport(), '7d')
    expect(output).toContain('0 campaigns')
  })
})
