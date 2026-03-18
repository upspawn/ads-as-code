import { z } from 'zod'
import type { LanguageModel } from 'ai'
import type { GenerateObjectFn } from '../ai/generate.ts'
import { generateSlot } from '../ai/generate.ts'
import type { PerformanceData, PerformanceSignal, PerformanceRecommendation } from './types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluateStrategyInput = {
  readonly strategy: string
  readonly data: PerformanceData[]
  readonly signals: PerformanceSignal[]
  readonly model: LanguageModel
  readonly generateObjectFn?: GenerateObjectFn
  readonly retryDelays?: number[]
}

export type EvaluateResult = {
  readonly recommendations: PerformanceRecommendation[]
  readonly promptTokens: number
  readonly completionTokens: number
}

// ---------------------------------------------------------------------------
// Zod schema for structured LLM output
// ---------------------------------------------------------------------------

const strategyRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      type: z.enum([
        'scale-budget',
        'reduce-budget',
        'pause-resource',
        'resume-resource',
        'adjust-bid',
        'shift-budget',
        'add-negative',
        'refresh-creative',
      ]),
      resource: z.string(),
      reason: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
})

type LLMRecommendation = z.infer<typeof strategyRecommendationSchema>['recommendations'][number]

// ---------------------------------------------------------------------------
// Prompt compilation
// ---------------------------------------------------------------------------

/** Format a metrics object into a human-readable summary line. */
function formatMetrics(m: PerformanceData['metrics']): string {
  const parts: string[] = [
    `impressions=${m.impressions}`,
    `clicks=${m.clicks}`,
    `cost=${m.cost}`,
    `conversions=${m.conversions}`,
    `conversionValue=${m.conversionValue}`,
  ]
  if (m.ctr !== null) parts.push(`ctr=${(m.ctr * 100).toFixed(2)}%`)
  if (m.cpc !== null) parts.push(`cpc=${m.cpc.toFixed(2)}`)
  if (m.cpa !== null) parts.push(`cpa=${m.cpa.toFixed(2)}`)
  if (m.roas !== null) parts.push(`roas=${m.roas.toFixed(2)}`)
  if (m.cpm !== null) parts.push(`cpm=${m.cpm.toFixed(2)}`)
  if (m.impressionShare !== undefined) parts.push(`impressionShare=${(m.impressionShare * 100).toFixed(1)}%`)
  if (m.qualityScore !== undefined) parts.push(`qualityScore=${m.qualityScore}`)
  return parts.join(', ')
}

/** Format violations for a resource, if any. */
function formatViolations(data: PerformanceData): string {
  if (data.violations.length === 0) return ''
  const lines = data.violations.map(
    (v) => `  - [${v.severity}] ${v.metric}: actual=${v.actual}, target=${v.target}, ${v.direction} by ${(v.deviation * 100).toFixed(0)}%`,
  )
  return `  Violations:\n${lines.join('\n')}`
}

/**
 * Compile a structured prompt for the LLM from a strategy, performance data, and signals.
 *
 * The prompt instructs the model to return structured JSON recommendations
 * following the strategyRecommendationSchema.
 */
export function compileStrategyPrompt(
  strategy: string,
  data: PerformanceData[],
  signals: PerformanceSignal[],
): string {
  const sections: string[] = []

  // Strategy
  sections.push(`## Strategy\n\n${strategy}`)

  // Resource metrics
  if (data.length > 0) {
    const resourceLines = data.map((d) => {
      const header = `- ${d.resource} (${d.provider}/${d.kind}): ${formatMetrics(d.metrics)}`
      const violations = formatViolations(d)
      return violations ? `${header}\n${violations}` : header
    })
    sections.push(`## Current Performance\n\n${resourceLines.join('\n')}`)
  } else {
    sections.push('## Current Performance\n\nNo performance data available.')
  }

  // Signals
  if (signals.length > 0) {
    const signalLines = signals.map(
      (s) => `- [${s.severity}] ${s.type} on ${s.resource}: ${s.message}`,
    )
    sections.push(`## Detected Signals\n\n${signalLines.join('\n')}`)
  }

  // Instructions
  sections.push(
    `## Instructions\n\n` +
      `Evaluate the performance data against the stated strategy. ` +
      `Return a list of actionable recommendations. Each recommendation must specify:\n` +
      `- type: one of scale-budget, reduce-budget, pause-resource, resume-resource, adjust-bid, shift-budget, add-negative, refresh-creative\n` +
      `- resource: the resource path this applies to\n` +
      `- reason: a concise explanation\n` +
      `- confidence: high, medium, or low\n\n` +
      `If no action is needed, return an empty recommendations array.`,
  )

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Strategy evaluation
// ---------------------------------------------------------------------------

/** Map an LLM recommendation to a PerformanceRecommendation with source: 'ai'. */
function toPerformanceRecommendation(rec: LLMRecommendation): PerformanceRecommendation {
  // The discriminated union in PerformanceRecommendation has different shapes per type.
  // AI recommendations use simplified shapes — no from/to/amount/keyword fields.
  // We map to the union variant that matches each type.
  switch (rec.type) {
    case 'scale-budget':
    case 'reduce-budget':
      return {
        type: rec.type,
        resource: rec.resource,
        reason: rec.reason,
        confidence: rec.confidence,
        source: 'ai' as const,
        // AI recommendations don't include concrete budget values
        from: { amount: 0, period: 'daily', currency: 'USD' },
        to: { amount: 0, period: 'daily', currency: 'USD' },
      }
    case 'adjust-bid':
      return {
        type: rec.type,
        resource: rec.resource,
        reason: rec.reason,
        confidence: rec.confidence,
        source: 'ai' as const,
        from: 0,
        to: 0,
      }
    case 'pause-resource':
    case 'resume-resource':
    case 'refresh-creative':
      return {
        type: rec.type,
        resource: rec.resource,
        reason: rec.reason,
        confidence: rec.confidence,
        source: 'ai' as const,
      }
    case 'shift-budget':
      return {
        type: rec.type,
        resource: rec.resource,
        reason: rec.reason,
        confidence: rec.confidence,
        source: 'ai' as const,
        toResource: '',
        amount: { amount: 0, period: 'daily', currency: 'USD' },
      }
    case 'add-negative':
      return {
        type: rec.type,
        resource: rec.resource,
        reason: rec.reason,
        confidence: rec.confidence,
        source: 'ai' as const,
        keyword: '',
      }
  }
}

/**
 * Evaluate a strategy against performance data using an LLM.
 *
 * Uses the same generateSlot pattern as the AI ad copy generation module:
 * dependency-injected generate function, retry delays, and Zod-validated output.
 */
export async function evaluateStrategy(input: EvaluateStrategyInput): Promise<EvaluateResult> {
  const prompt = compileStrategyPrompt(input.strategy, input.data, input.signals)

  const result = await generateSlot({
    model: input.model,
    prompt,
    schema: strategyRecommendationSchema,
    generateObjectFn: input.generateObjectFn,
    retryDelays: input.retryDelays,
  })

  const parsed = strategyRecommendationSchema.parse(result.object)

  return {
    recommendations: parsed.recommendations.map(toPerformanceRecommendation),
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  }
}
