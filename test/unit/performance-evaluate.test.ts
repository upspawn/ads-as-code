import { describe, test, expect } from 'bun:test'
import type { GenerateObjectFn } from '../../src/ai/generate.ts'
import type { PerformanceData, PerformanceSignal, PerformanceRecommendation } from '../../src/performance/types.ts'
import { compileStrategyPrompt, evaluateStrategy } from '../../src/performance/evaluate.ts'
import type { EvaluateResult, EvaluateStrategyInput } from '../../src/performance/evaluate.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockModel = { modelId: 'test-model', provider: 'test', specificationVersion: 'v1' } as unknown as EvaluateStrategyInput['model']

function makeData(overrides: Partial<PerformanceData> = {}): PerformanceData {
  return {
    resource: 'test-campaign',
    provider: 'google',
    kind: 'campaign',
    period: { start: new Date('2026-03-01'), end: new Date('2026-03-15') },
    metrics: {
      impressions: 10_000,
      clicks: 500,
      cost: 200,
      conversions: 25,
      conversionValue: 1_250,
      ctr: 0.05,
      cpc: 0.4,
      cpa: 8,
      roas: 6.25,
      cpm: 20,
    },
    violations: [],
    breakdowns: {},
    ...overrides,
  }
}

function makeSignal(overrides: Partial<PerformanceSignal> = {}): PerformanceSignal {
  return {
    type: 'budget-constrained',
    severity: 'warning',
    resource: 'test-campaign',
    message: 'Campaign is budget constrained — impression share lost to budget is 40%',
    evidence: { impressionShareLostToBudget: 0.4 },
    ...overrides,
  }
}

const mockGenerate: GenerateObjectFn = async () => ({
  object: {
    recommendations: [
      { type: 'scale-budget', resource: 'test-campaign', reason: 'ROAS is strong at 6.25x', confidence: 'high' },
    ],
  },
  usage: { promptTokens: 100, completionTokens: 50 },
})

// ---------------------------------------------------------------------------
// compileStrategyPrompt
// ---------------------------------------------------------------------------

describe('compileStrategyPrompt', () => {
  test('includes strategy text in prompt', () => {
    const prompt = compileStrategyPrompt('Maximize ROAS above 3x', [makeData()], [])
    expect(prompt).toContain('Maximize ROAS above 3x')
  })

  test('includes resource metrics summary', () => {
    const prompt = compileStrategyPrompt('Scale winners', [makeData()], [])
    expect(prompt).toContain('test-campaign')
    expect(prompt).toContain('impressions')
    expect(prompt).toContain('10000') // impressions value (or formatted)
  })

  test('includes signals when provided', () => {
    const signal = makeSignal()
    const prompt = compileStrategyPrompt('Scale winners', [makeData()], [signal])
    expect(prompt).toContain('budget-constrained')
    expect(prompt).toContain('impression share lost to budget is 40%')
  })

  test('handles empty data and signals', () => {
    const prompt = compileStrategyPrompt('No data yet', [], [])
    expect(prompt).toContain('No data yet')
    // Should still be a valid prompt string
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  test('includes multiple resources', () => {
    const data = [
      makeData({ resource: 'campaign-a' }),
      makeData({ resource: 'campaign-b' }),
    ]
    const prompt = compileStrategyPrompt('Evaluate all', data, [])
    expect(prompt).toContain('campaign-a')
    expect(prompt).toContain('campaign-b')
  })

  test('includes violations from data', () => {
    const data = makeData({
      violations: [{ metric: 'cpa', actual: 30, target: 15, deviation: 1.0, direction: 'over', severity: 'critical' }],
    })
    const prompt = compileStrategyPrompt('Fix CPA', [data], [])
    expect(prompt).toContain('cpa')
    expect(prompt).toContain('critical')
  })
})

// ---------------------------------------------------------------------------
// evaluateStrategy
// ---------------------------------------------------------------------------

describe('evaluateStrategy', () => {
  test('returns recommendations with source ai', async () => {
    const result = await evaluateStrategy({
      strategy: 'Scale high-ROAS campaigns',
      data: [makeData()],
      signals: [],
      model: mockModel,
      generateObjectFn: mockGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]!.type).toBe('scale-budget')
    expect(result.recommendations[0]!.resource).toBe('test-campaign')
    expect(result.recommendations[0]!.source).toBe('ai')
    expect(result.recommendations[0]!.confidence).toBe('high')
  })

  test('returns token usage', async () => {
    const result = await evaluateStrategy({
      strategy: 'Test strategy',
      data: [makeData()],
      signals: [],
      model: mockModel,
      generateObjectFn: mockGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(result.promptTokens).toBe(100)
    expect(result.completionTokens).toBe(50)
  })

  test('passes compiled prompt to generate function', async () => {
    let capturedPrompt = ''
    const capturingGenerate: GenerateObjectFn = async ({ prompt }) => {
      capturedPrompt = prompt
      return mockGenerate({ model: mockModel, prompt, schema: {} as never })
    }

    await evaluateStrategy({
      strategy: 'Maximize conversions',
      data: [makeData()],
      signals: [makeSignal()],
      model: mockModel,
      generateObjectFn: capturingGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(capturedPrompt).toContain('Maximize conversions')
    expect(capturedPrompt).toContain('test-campaign')
    expect(capturedPrompt).toContain('budget-constrained')
  })

  test('handles multiple recommendations from LLM', async () => {
    const multiGenerate: GenerateObjectFn = async () => ({
      object: {
        recommendations: [
          { type: 'scale-budget', resource: 'campaign-a', reason: 'Strong ROAS', confidence: 'high' },
          { type: 'pause-resource', resource: 'campaign-b', reason: 'Zero conversions', confidence: 'medium' },
          { type: 'add-negative', resource: 'campaign-a', reason: 'Irrelevant traffic', confidence: 'low' },
        ],
      },
      usage: { promptTokens: 200, completionTokens: 100 },
    })

    const result = await evaluateStrategy({
      strategy: 'Optimize portfolio',
      data: [makeData({ resource: 'campaign-a' }), makeData({ resource: 'campaign-b', metrics: { ...makeData().metrics, conversions: 0, cpa: null } })],
      signals: [],
      model: mockModel,
      generateObjectFn: multiGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(result.recommendations).toHaveLength(3)
    // All should have source: 'ai'
    for (const rec of result.recommendations) {
      expect(rec.source).toBe('ai')
    }
  })

  test('handles empty recommendations from LLM', async () => {
    const emptyGenerate: GenerateObjectFn = async () => ({
      object: { recommendations: [] },
      usage: { promptTokens: 50, completionTokens: 10 },
    })

    const result = await evaluateStrategy({
      strategy: 'Everything looks fine',
      data: [makeData()],
      signals: [],
      model: mockModel,
      generateObjectFn: emptyGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(result.recommendations).toHaveLength(0)
    expect(result.promptTokens).toBe(50)
    expect(result.completionTokens).toBe(10)
  })

  test('retries on failure then succeeds', async () => {
    let attempts = 0
    const flakyGenerate: GenerateObjectFn = async (opts) => {
      attempts++
      if (attempts < 3) throw new Error('Rate limited')
      return mockGenerate(opts)
    }

    const result = await evaluateStrategy({
      strategy: 'Retry test',
      data: [makeData()],
      signals: [],
      model: mockModel,
      generateObjectFn: flakyGenerate,
      retryDelays: [0, 0, 0],
    })

    expect(attempts).toBe(3)
    expect(result.recommendations).toHaveLength(1)
  })

  test('throws after exhausting retries', async () => {
    const alwaysFail: GenerateObjectFn = async () => {
      throw new Error('Service unavailable')
    }

    await expect(
      evaluateStrategy({
        strategy: 'Fail test',
        data: [makeData()],
        signals: [],
        model: mockModel,
        generateObjectFn: alwaysFail,
        retryDelays: [0, 0, 0],
      }),
    ).rejects.toThrow('Service unavailable')
  })
})
