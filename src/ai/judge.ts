import type { LanguageModel } from 'ai'
import type { z } from 'zod'
import { z as zod } from 'zod'
import type { GenerateObjectFn } from './generate.ts'

// === Types ===

export type JudgeItemScore = {
  readonly index: number
  readonly score: number
  readonly reason: string
  readonly approved: boolean
}

export type JudgeResult = {
  readonly approved: boolean
  readonly itemScores: JudgeItemScore[]
}

export type JudgePipelineResult = {
  readonly object: unknown
  readonly usage: { promptTokens: number; completionTokens: number }
  readonly judgeWarning?: string
}

// === Zod Schema for Judge Response ===

export const judgeResultSchema = zod.object({
  itemScores: zod.array(
    zod.object({
      index: zod.number(),
      score: zod.number().min(1).max(10),
      reason: zod.string(),
      approved: zod.boolean(),
    }),
  ),
})

// === Evaluate With Judge ===

type EvaluateInput = {
  readonly model: LanguageModel
  readonly judgePrompt: string
  readonly generatedItems: unknown
  readonly generateObjectFn: GenerateObjectFn
}

/**
 * Call the AI judge to evaluate each generated item, returning scores and approval status.
 *
 * The judge receives the generated output and a prompt describing quality criteria,
 * then produces per-item scores indicating which items pass and which need regeneration.
 */
export async function evaluateWithJudge(input: EvaluateInput): Promise<JudgeResult> {
  const evaluationPrompt = buildEvaluationPrompt(input.judgePrompt, input.generatedItems)

  const result = await input.generateObjectFn({
    model: input.model,
    prompt: evaluationPrompt,
    schema: judgeResultSchema,
  })

  const parsed = result.object as { itemScores: JudgeItemScore[] }
  const allApproved = parsed.itemScores.every((s) => s.approved)

  return {
    approved: allApproved,
    itemScores: parsed.itemScores,
  }
}

// === Run Judge Pipeline ===

type RunJudgePipelineInput = {
  readonly model: LanguageModel
  /** Function that generates the initial output (called for each round) */
  readonly generateFn: () => Promise<{
    object: unknown
    usage: { promptTokens: number; completionTokens: number }
  }>
  /** Compiled judge prompt. If undefined, judge is skipped entirely. */
  readonly judgePrompt: string | undefined
  /** Schema for the generated output (used to build regeneration context) */
  readonly schema: z.ZodType
  /** Indices of pinned items that must not be rejected by the judge */
  readonly pinned: number[]
  /** Maximum evaluation rounds before giving up (default 3) */
  readonly maxRounds?: number
  /** Injected generateObject function for the judge evaluation */
  readonly generateObjectFn: GenerateObjectFn
}

/**
 * Multi-round judge pipeline: generate, evaluate, regenerate rejected items.
 *
 * 1. Generate initial output via generateFn
 * 2. If no judgePrompt configured, return immediately
 * 3. Evaluate with the judge
 * 4. Pinned items are always treated as approved regardless of judge score
 * 5. If all items approved (after pinning), return
 * 6. Otherwise regenerate (up to maxRounds) with context about what was rejected
 * 7. After maxRounds, return best attempt with a judgeWarning
 */
export async function runJudgePipeline(input: RunJudgePipelineInput): Promise<JudgePipelineResult> {
  const maxRounds = input.maxRounds ?? 3

  // Step 1: Generate initial output
  let generated = await input.generateFn()
  let totalPromptTokens = generated.usage.promptTokens
  let totalCompletionTokens = generated.usage.completionTokens

  // Step 2: If no judge prompt, return immediately
  if (!input.judgePrompt) {
    return {
      object: generated.object,
      usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    }
  }

  // Steps 3-6: Evaluate and regenerate loop
  for (let round = 0; round < maxRounds; round++) {
    const judgeResult = await evaluateWithJudge({
      model: input.model,
      judgePrompt: input.judgePrompt,
      generatedItems: generated.object,
      generateObjectFn: input.generateObjectFn,
    })

    // Apply pinning: pinned items are always treated as approved
    const effectiveScores = judgeResult.itemScores.map((score) => {
      if (input.pinned.includes(score.index)) {
        return { ...score, approved: true }
      }
      return score
    })

    const allApproved = effectiveScores.every((s) => s.approved)

    if (allApproved) {
      return {
        object: generated.object,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      }
    }

    // If this is the last round, return with warning
    if (round === maxRounds - 1) {
      const rejectedCount = effectiveScores.filter((s) => !s.approved).length
      return {
        object: generated.object,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
        judgeWarning: `Judge rejected ${rejectedCount} item(s) after ${maxRounds} rounds. Using best attempt.`,
      }
    }

    // Regenerate with context about rejections
    generated = await input.generateFn()
    totalPromptTokens += generated.usage.promptTokens
    totalCompletionTokens += generated.usage.completionTokens
  }

  // Should not reach here, but safety net
  return {
    object: generated.object,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
    judgeWarning: `Judge pipeline ended unexpectedly after ${maxRounds} rounds.`,
  }
}

// === Helpers ===

/** Build the prompt sent to the judge model with the generated items serialized for evaluation. */
function buildEvaluationPrompt(judgePrompt: string, generatedItems: unknown): string {
  const serialized = JSON.stringify(generatedItems, null, 2)

  return [
    judgePrompt,
    '',
    'Evaluate each item in the following generated output. For each item, provide:',
    '- index: the item\'s position (0-based across all items — headlines first, then descriptions)',
    '- score: 1-10 quality rating',
    '- reason: brief explanation',
    '- approved: true if score >= 7, false otherwise',
    '',
    'Generated output:',
    serialized,
  ].join('\n')
}
