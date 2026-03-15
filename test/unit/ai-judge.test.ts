import { describe, expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import type { z } from 'zod'
import type { GenerateObjectFn } from '../../src/ai/generate.ts'
import { rsaSchema } from '../../src/ai/schemas.ts'
import type { RsaOutput } from '../../src/ai/schemas.ts'
import type { JudgeResult } from '../../src/ai/judge.ts'
import { evaluateWithJudge, runJudgePipeline } from '../../src/ai/judge.ts'

// === Test Helpers ===

/** Minimal stub that satisfies the LanguageModel interface shape for testing. */
const fakeModel = { modelId: 'test-model', provider: 'test', specificationVersion: 'v1' } as unknown as LanguageModel

/** Build an RSA output with sensible defaults. */
function makeRsaOutput(overrides?: Partial<RsaOutput>): RsaOutput {
  return {
    headlines: ['Headline 1', 'Headline 2', 'Headline 3'],
    descriptions: ['Description one for the ad', 'Description two for the ad'],
    ...overrides,
  }
}

// === evaluateWithJudge ===

describe('evaluateWithJudge', () => {
  test('returns approved when all items score above threshold', async () => {
    const items = makeRsaOutput()
    const mockGen: GenerateObjectFn = async () => ({
      object: {
        itemScores: [
          { index: 0, score: 9, reason: 'Great', approved: true },
          { index: 1, score: 8, reason: 'Good', approved: true },
          { index: 2, score: 7, reason: 'Fine', approved: true },
          { index: 3, score: 8, reason: 'Good', approved: true },
          { index: 4, score: 9, reason: 'Excellent', approved: true },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30 },
    })

    const result = await evaluateWithJudge({
      model: fakeModel,
      judgePrompt: 'Check quality',
      generatedItems: items,
      generateObjectFn: mockGen,
    })

    expect(result.approved).toBe(true)
    expect(result.itemScores.length).toBe(5)
  })

  test('returns rejected when some items score below threshold', async () => {
    const items = makeRsaOutput()
    const mockGen: GenerateObjectFn = async () => ({
      object: {
        itemScores: [
          { index: 0, score: 3, reason: 'Bad', approved: false },
          { index: 1, score: 9, reason: 'Great', approved: true },
          { index: 2, score: 4, reason: 'Weak', approved: false },
          { index: 3, score: 8, reason: 'Good', approved: true },
          { index: 4, score: 2, reason: 'Terrible', approved: false },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30 },
    })

    const result = await evaluateWithJudge({
      model: fakeModel,
      judgePrompt: 'Check quality',
      generatedItems: items,
      generateObjectFn: mockGen,
    })

    expect(result.approved).toBe(false)
    expect(result.itemScores.filter((s) => !s.approved).length).toBe(3)
  })
})

// === runJudgePipeline ===

describe('runJudgePipeline', () => {
  test('no judge prompt: result passes through unchanged', async () => {
    const generated = makeRsaOutput()
    let generateCalls = 0

    const generateFn = async () => {
      generateCalls++
      return { object: generated, usage: { promptTokens: 10, completionTokens: 10 } }
    }

    const result = await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: undefined,
      schema: rsaSchema,
      pinned: [],
      maxRounds: 3,
      generateObjectFn: async () => { throw new Error('should not be called') },
    })

    expect(result.object).toEqual(generated)
    expect(result.judgeWarning).toBeUndefined()
    // generateFn is called once to produce output; judge is never called
    expect(generateCalls).toBe(1)
  })

  test('judge approves all: result returned as-is', async () => {
    const generated = makeRsaOutput()
    let generateCalls = 0

    const generateFn = async () => {
      generateCalls++
      return { object: generated, usage: { promptTokens: 10, completionTokens: 10 } }
    }

    // Judge that approves everything
    const judgeMock: GenerateObjectFn = async () => ({
      object: {
        itemScores: [
          { index: 0, score: 9, reason: 'Good', approved: true },
          { index: 1, score: 8, reason: 'Good', approved: true },
          { index: 2, score: 9, reason: 'Good', approved: true },
          { index: 3, score: 8, reason: 'Good', approved: true },
          { index: 4, score: 9, reason: 'Good', approved: true },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30 },
    })

    const result = await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: 'Check quality',
      schema: rsaSchema,
      pinned: [],
      maxRounds: 3,
      generateObjectFn: judgeMock,
    })

    expect(result.object).toEqual(generated)
    expect(result.judgeWarning).toBeUndefined()
    expect(generateCalls).toBe(1)
  })

  test('judge rejects some items: those items regenerated', async () => {
    const initial = makeRsaOutput({
      headlines: ['Bad Headline', 'Good Headline', 'Weak Headline'],
      descriptions: ['Good desc one', 'Good desc two'],
    })

    const improved = makeRsaOutput({
      headlines: ['Better Headline', 'Good Headline', 'Strong Headline'],
      descriptions: ['Good desc one', 'Good desc two'],
    })

    let generateCallCount = 0
    const generateFn = async () => {
      generateCallCount++
      // First call: initial output. Subsequent calls: improved.
      const obj = generateCallCount === 1 ? initial : improved
      return { object: obj, usage: { promptTokens: 10, completionTokens: 10 } }
    }

    let judgeCallCount = 0
    const judgeMock: GenerateObjectFn = async () => {
      judgeCallCount++
      if (judgeCallCount === 1) {
        // First judge call: reject headlines 0 and 2
        return {
          object: {
            itemScores: [
              { index: 0, score: 3, reason: 'Bad', approved: false },
              { index: 1, score: 9, reason: 'Good', approved: true },
              { index: 2, score: 4, reason: 'Weak', approved: false },
              { index: 3, score: 8, reason: 'Good', approved: true },
              { index: 4, score: 9, reason: 'Good', approved: true },
            ],
          },
          usage: { promptTokens: 50, completionTokens: 30 },
        }
      }
      // Second judge call: approve all
      return {
        object: {
          itemScores: [
            { index: 0, score: 8, reason: 'Better', approved: true },
            { index: 1, score: 9, reason: 'Good', approved: true },
            { index: 2, score: 8, reason: 'Improved', approved: true },
            { index: 3, score: 8, reason: 'Good', approved: true },
            { index: 4, score: 9, reason: 'Good', approved: true },
          ],
        },
        usage: { promptTokens: 50, completionTokens: 30 },
      }
    }

    const result = await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: 'Check quality',
      schema: rsaSchema,
      pinned: [],
      maxRounds: 3,
      generateObjectFn: judgeMock,
    })

    // Should have regenerated
    expect(generateCallCount).toBe(2)
    expect(judgeCallCount).toBe(2)
    expect(result.object).toEqual(improved)
    expect(result.judgeWarning).toBeUndefined()
  })

  test('pinned items never sent to judge for rejection', async () => {
    const generated = makeRsaOutput({
      headlines: ['Pinned H1', 'Regular H2', 'Regular H3'],
      descriptions: ['Pinned D1', 'Regular D2'],
    })

    const generateFn = async () => ({
      object: generated,
      usage: { promptTokens: 10, completionTokens: 10 },
    })

    // Judge that tries to reject pinned item at index 0
    const judgeMock: GenerateObjectFn = async () => ({
      object: {
        itemScores: [
          { index: 0, score: 2, reason: 'Bad but pinned', approved: false },
          { index: 1, score: 9, reason: 'Good', approved: true },
          { index: 2, score: 9, reason: 'Good', approved: true },
          { index: 3, score: 2, reason: 'Bad but pinned', approved: false },
          { index: 4, score: 9, reason: 'Good', approved: true },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30 },
    })

    // Pin items 0 and 3 (first headline and first description)
    const result = await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: 'Check quality',
      schema: rsaSchema,
      pinned: [0, 3],
      maxRounds: 3,
      generateObjectFn: judgeMock,
    })

    // Since pinned items are protected, all remaining items are approved,
    // so the result should pass through with no regeneration needed
    expect(result.object).toEqual(generated)
    expect(result.judgeWarning).toBeUndefined()
  })

  test('after 3 rounds of rejection: best attempt returned with judgeWarning', async () => {
    const generated = makeRsaOutput()

    const generateFn = async () => ({
      object: generated,
      usage: { promptTokens: 10, completionTokens: 10 },
    })

    // Judge that always rejects
    const judgeMock: GenerateObjectFn = async () => ({
      object: {
        itemScores: [
          { index: 0, score: 2, reason: 'Bad', approved: false },
          { index: 1, score: 3, reason: 'Weak', approved: false },
          { index: 2, score: 4, reason: 'Poor', approved: false },
          { index: 3, score: 3, reason: 'Weak', approved: false },
          { index: 4, score: 2, reason: 'Bad', approved: false },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30 },
    })

    const result = await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: 'Check quality',
      schema: rsaSchema,
      pinned: [],
      maxRounds: 3,
      generateObjectFn: judgeMock,
    })

    expect(result.object).toEqual(generated)
    expect(result.judgeWarning).toBeDefined()
    expect(result.judgeWarning).toContain('3')
  })

  test('judge merges global default + local prompt', async () => {
    const generated = makeRsaOutput()
    let capturedPrompt = ''

    const generateFn = async () => ({
      object: generated,
      usage: { promptTokens: 10, completionTokens: 10 },
    })

    // Judge mock that captures the prompt
    const judgeMock: GenerateObjectFn = async (opts) => {
      capturedPrompt = opts.prompt
      return {
        object: {
          itemScores: [
            { index: 0, score: 9, reason: 'Good', approved: true },
            { index: 1, score: 9, reason: 'Good', approved: true },
            { index: 2, score: 9, reason: 'Good', approved: true },
            { index: 3, score: 9, reason: 'Good', approved: true },
            { index: 4, score: 9, reason: 'Good', approved: true },
          ],
        },
        usage: { promptTokens: 50, completionTokens: 30 },
      }
    }

    // The judgePrompt is already compiled (merged) before being passed
    // This tests that the compiled prompt is forwarded to the judge call
    const mergedPrompt = 'Global: be strict\n\nLocal: focus on clarity'

    await runJudgePipeline({
      model: fakeModel,
      generateFn,
      judgePrompt: mergedPrompt,
      schema: rsaSchema,
      pinned: [],
      maxRounds: 3,
      generateObjectFn: judgeMock,
    })

    // The judge prompt should contain both global and local parts
    expect(capturedPrompt).toContain('Global: be strict')
    expect(capturedPrompt).toContain('Local: focus on clarity')
  })
})
