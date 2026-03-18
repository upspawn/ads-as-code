/**
 * Performance analysis engine — pure functions, no side effects.
 *
 * Takes performance data + targets and produces violations, signals, and recommendations.
 * No API calls, no imports from provider modules, no I/O.
 */

import type {
  PerformanceData,
  PerformanceMetrics,
  PerformanceTargets,
  PerformanceViolation,
  PerformanceSignal,
  PerformanceRecommendation,
  SeverityThresholds,
  AnalysisResult,
  ViolationMetric,
} from './types.ts'
import type { Budget } from '../core/types.ts'
import { DEFAULT_THRESHOLDS } from './types.ts'

// ─── Violations ───────────────────────────────────────────

/**
 * Compare metrics against declared targets and produce violations.
 *
 * Each target type has a direction: "over" targets (CPA, CPC) are bad when actual exceeds target,
 * "under" targets (ROAS, CTR, conversions, impressionShare) are bad when actual is below target.
 *
 * Severity is based on fractional deviation from target:
 * - >warning threshold (default 20%) = warning
 * - >critical threshold (default 50%) = critical
 */
export function computeViolations(
  metrics: PerformanceMetrics,
  targets: PerformanceTargets,
  thresholds: SeverityThresholds = DEFAULT_THRESHOLDS,
): PerformanceViolation[] {
  const violations: PerformanceViolation[] = []

  // targetCPA: CPA over target is bad
  if (targets.targetCPA != null) {
    if (metrics.cpa === null) {
      // Null CPA = zero conversions. If spending, this is a critical violation.
      if (metrics.cost > 0) {
        violations.push({
          metric: 'cpa',
          actual: Infinity,
          target: targets.targetCPA,
          deviation: Infinity,
          direction: 'over',
          severity: 'critical',
        })
      }
    } else {
      const v = checkOver('cpa', metrics.cpa, targets.targetCPA, thresholds)
      if (v) violations.push(v)
    }
  }

  // minROAS: ROAS under target is bad
  if (targets.minROAS != null && metrics.roas !== null) {
    const v = checkUnder('roas', metrics.roas, targets.minROAS, thresholds)
    if (v) violations.push(v)
  }

  // minCTR: CTR under target is bad
  if (targets.minCTR != null && metrics.ctr !== null) {
    const v = checkUnder('ctr', metrics.ctr, targets.minCTR, thresholds)
    if (v) violations.push(v)
  }

  // maxCPC: CPC over target is bad
  if (targets.maxCPC != null && metrics.cpc !== null) {
    const v = checkOver('cpc', metrics.cpc, targets.maxCPC, thresholds)
    if (v) violations.push(v)
  }

  // minConversions: conversions under target is bad
  if (targets.minConversions != null) {
    const v = checkUnder('conversions', metrics.conversions, targets.minConversions, thresholds)
    if (v) violations.push(v)
  }

  // minImpressionShare: impression share under target is bad
  if (targets.minImpressionShare != null && metrics.impressionShare != null) {
    const v = checkUnder('impressionShare', metrics.impressionShare, targets.minImpressionShare, thresholds)
    if (v) violations.push(v)
  }

  return violations
}

/** Check if actual exceeds target by more than the warning threshold. */
function checkOver(
  metric: ViolationMetric,
  actual: number,
  target: number,
  thresholds: SeverityThresholds,
): PerformanceViolation | null {
  if (target === 0) return null
  const deviation = (actual - target) / target
  if (deviation <= thresholds.warning) return null
  return {
    metric,
    actual,
    target,
    deviation,
    direction: 'over',
    severity: deviation > thresholds.critical ? 'critical' : 'warning',
  }
}

/** Check if actual falls below target by more than the warning threshold. */
function checkUnder(
  metric: ViolationMetric,
  actual: number,
  target: number,
  thresholds: SeverityThresholds,
): PerformanceViolation | null {
  if (target === 0) return null
  const deviation = (target - actual) / target
  if (deviation <= thresholds.warning) return null
  return {
    metric,
    actual,
    target,
    deviation: -deviation, // negative = under
    direction: 'under',
    severity: deviation > thresholds.critical ? 'critical' : 'warning',
  }
}

// ─── Signals ──────────────────────────────────────────────

/**
 * Detect anomalies and patterns in performance data.
 * These don't require targets — they're computed from raw data.
 */
export function detectSignals(data: PerformanceData[]): PerformanceSignal[] {
  const signals: PerformanceSignal[] = []

  for (const d of data) {
    detectZeroConversions(d, signals)
    detectTrends(d, signals)
    detectSearchTermOpportunities(d, signals)
    detectHighFrequency(d, signals)
    detectLowQualityScore(d, signals)
    detectBudgetConstrained(d, signals)
    detectLearningPhase(d, signals)
  }

  detectSpendConcentration(data, signals)

  return signals
}

function detectZeroConversions(d: PerformanceData, signals: PerformanceSignal[]): void {
  if (d.metrics.conversions === 0 && d.metrics.cost > 10) {
    signals.push({
      type: 'zero-conversions',
      severity: 'warning',
      resource: d.resource,
      message: `${d.resource} has spent $${d.metrics.cost.toFixed(2)} with 0 conversions`,
      evidence: { cost: d.metrics.cost, conversions: 0 },
    })
  }
}

function detectTrends(d: PerformanceData, signals: PerformanceSignal[]): void {
  const byDay = d.breakdowns.byDay
  if (!byDay || byDay.length < 4) return

  const mid = Math.floor(byDay.length / 2)
  const firstHalf = byDay.slice(0, mid)
  const secondHalf = byDay.slice(mid)

  const avgFirst = average(firstHalf.map(day => day.metrics.ctr).filter((v): v is number => v !== null))
  const avgSecond = average(secondHalf.map(day => day.metrics.ctr).filter((v): v is number => v !== null))

  // Avoid division by zero
  if (avgFirst === 0) return

  const change = (avgSecond - avgFirst) / avgFirst

  if (change < -0.20) {
    signals.push({
      type: 'declining-trend',
      severity: 'warning',
      resource: d.resource,
      message: `CTR declining: ${(avgFirst * 100).toFixed(1)}% → ${(avgSecond * 100).toFixed(1)}% (${(change * 100).toFixed(0)}%)`,
      evidence: { firstHalfCtr: avgFirst, secondHalfCtr: avgSecond, change },
    })

    // Creative fatigue is declining-trend but only for ads
    if (d.kind === 'ad') {
      signals.push({
        type: 'creative-fatigue',
        severity: 'warning',
        resource: d.resource,
        message: `Ad CTR declining — possible creative fatigue: ${(avgFirst * 100).toFixed(1)}% → ${(avgSecond * 100).toFixed(1)}%`,
        evidence: { firstHalfCtr: avgFirst, secondHalfCtr: avgSecond, change },
      })
    }
  } else if (change > 0.20) {
    signals.push({
      type: 'improving-trend',
      severity: 'info',
      resource: d.resource,
      message: `CTR improving: ${(avgFirst * 100).toFixed(1)}% → ${(avgSecond * 100).toFixed(1)}% (+${(change * 100).toFixed(0)}%)`,
      evidence: { firstHalfCtr: avgFirst, secondHalfCtr: avgSecond, change },
    })
  }
}

function detectSearchTermOpportunities(d: PerformanceData, signals: PerformanceSignal[]): void {
  const terms = d.breakdowns.bySearchTerm
  if (!terms) return

  for (const { term, metrics } of terms) {
    if (metrics.conversions > 0 && metrics.clicks >= 5) {
      signals.push({
        type: 'search-term-opportunity',
        severity: 'info',
        resource: d.resource,
        message: `Search term "${term}" converting (${metrics.conversions} conversions, ${metrics.clicks} clicks) — consider adding as keyword`,
        evidence: { term, clicks: metrics.clicks, conversions: metrics.conversions, cpa: metrics.cpa },
      })
    }
  }
}

function detectHighFrequency(d: PerformanceData, signals: PerformanceSignal[]): void {
  if (d.provider !== 'meta') return
  if (d.metrics.frequency == null || d.metrics.frequency <= 4) return

  signals.push({
    type: 'high-frequency',
    severity: 'warning',
    resource: d.resource,
    message: `Ad frequency ${d.metrics.frequency.toFixed(1)} is high (>4) — audience may be fatigued`,
    evidence: { frequency: d.metrics.frequency },
  })
}

function detectLowQualityScore(d: PerformanceData, signals: PerformanceSignal[]): void {
  if (d.provider !== 'google') return
  if (d.metrics.qualityScore == null || d.metrics.qualityScore > 3) return

  signals.push({
    type: 'low-quality-score',
    severity: 'warning',
    resource: d.resource,
    message: `Quality score ${d.metrics.qualityScore}/10 — ad relevance, landing page, or expected CTR needs improvement`,
    evidence: { qualityScore: d.metrics.qualityScore },
  })
}

function detectBudgetConstrained(d: PerformanceData, signals: PerformanceSignal[]): void {
  if (!d.targets?.targetCPA) return
  if (d.metrics.cpa === null) return
  if (d.metrics.impressionShare == null) return

  const cpaRatio = d.metrics.cpa / d.targets.targetCPA
  if (cpaRatio < 0.70 && d.metrics.impressionShare < 0.9) {
    signals.push({
      type: 'budget-constrained',
      severity: 'warning',
      resource: d.resource,
      message: `CPA ${(cpaRatio * 100).toFixed(0)}% of target with ${(d.metrics.impressionShare * 100).toFixed(0)}% impression share — budget is constraining growth`,
      evidence: { cpa: d.metrics.cpa, targetCPA: d.targets.targetCPA, cpaRatio, impressionShare: d.metrics.impressionShare },
    })
  }
}

function detectLearningPhase(d: PerformanceData, signals: PerformanceSignal[]): void {
  if (d.provider !== 'meta') return
  if (d.kind !== 'adSet') return
  if (d.metrics.conversions <= 0 || d.metrics.conversions >= 50) return

  signals.push({
    type: 'learning-phase',
    severity: 'info',
    resource: d.resource,
    message: `Ad set has ${d.metrics.conversions} conversions — still in learning phase (need ~50 for optimization)`,
    evidence: { conversions: d.metrics.conversions },
  })
}

/**
 * Detect child resources consuming >60% of their parent campaign's spend.
 * Parent is identified by path prefix: "campaign-a" is parent of "campaign-a/group-1".
 */
function detectSpendConcentration(data: PerformanceData[], signals: PerformanceSignal[]): void {
  // Build a map of campaign paths to their cost
  const campaignCosts = new Map<string, number>()
  for (const d of data) {
    if (d.kind === 'campaign') {
      campaignCosts.set(d.resource, d.metrics.cost)
    }
  }

  // Check children against their parent campaign's cost
  for (const d of data) {
    if (d.kind === 'campaign') continue
    if (d.metrics.cost === 0) continue

    // Find parent campaign by path prefix
    const parentPath = findParentCampaignPath(d.resource, campaignCosts)
    if (!parentPath) continue

    const parentCost = campaignCosts.get(parentPath)!
    if (parentCost === 0) continue

    const percentage = d.metrics.cost / parentCost
    if (percentage > 0.60) {
      signals.push({
        type: 'spend-concentration',
        severity: 'warning',
        resource: d.resource,
        message: `Consuming ${(percentage * 100).toFixed(0)}% of parent campaign spend ($${d.metrics.cost.toFixed(2)} of $${parentCost.toFixed(2)})`,
        evidence: { percentage, childCost: d.metrics.cost, parentCost, parentPath },
      })
    }
  }
}

/** Find the campaign-level ancestor path for a resource path. */
function findParentCampaignPath(
  childPath: string,
  campaignPaths: Map<string, number>,
): string | undefined {
  // Walk up the path segments to find the campaign ancestor
  const segments = childPath.split('/')
  for (let i = segments.length - 1; i >= 1; i--) {
    const candidate = segments.slice(0, i).join('/')
    if (campaignPaths.has(candidate)) return candidate
  }
  return undefined
}

// ─── Recommendations ─────────────────────────────────────

/**
 * Compute actionable recommendations from performance data.
 * Only deterministic, rule-based recommendations (source: 'computed').
 * AI recommendations come from evaluate.ts.
 */
export function computeRecommendations(data: PerformanceData[]): PerformanceRecommendation[] {
  const recs: PerformanceRecommendation[] = []

  for (const d of data) {
    recommendPauseResource(d, recs)
    recommendScaleBudget(d, recs)
    recommendAddNegative(d, recs)
  }

  return recs
}

/** Pause zero-conversion keywords/ads with cost > $10. */
function recommendPauseResource(d: PerformanceData, recs: PerformanceRecommendation[]): void {
  if (d.kind !== 'keyword' && d.kind !== 'ad') return
  if (d.metrics.conversions > 0) return
  if (d.metrics.cost <= 10) return

  recs.push({
    type: 'pause-resource',
    resource: d.resource,
    reason: `$${d.metrics.cost.toFixed(2)} spent with 0 conversions`,
    confidence: 'high',
    source: 'computed',
  })
}

/** Scale budget when CPA has >30% headroom vs targetCPA and maxBudget is set. */
function recommendScaleBudget(d: PerformanceData, recs: PerformanceRecommendation[]): void {
  if (!d.targets?.targetCPA || !d.targets?.maxBudget) return
  if (d.metrics.cpa === null) return

  const headroom = 1 - (d.metrics.cpa / d.targets.targetCPA)
  if (headroom <= 0.30) return

  const maxBudget = d.targets.maxBudget
  const periodDays = 7
  const currentDaily = d.metrics.cost / periodDays
  const headroomFactor = Math.min(d.targets.targetCPA / d.metrics.cpa, maxBudget.amount / Math.max(currentDaily, 0.01))
  const suggestedDaily = Math.min(currentDaily * headroomFactor, maxBudget.amount)

  recs.push({
    type: 'scale-budget',
    resource: d.resource,
    from: { amount: Math.round(currentDaily * 100) / 100, currency: maxBudget.currency, period: maxBudget.period } as Budget,
    to: { amount: Math.round(suggestedDaily * 100) / 100, currency: maxBudget.currency, period: maxBudget.period } as Budget,
    reason: `CPA has ${(headroom * 100).toFixed(0)}% headroom vs target ($${d.metrics.cpa.toFixed(2)} actual vs $${d.targets.targetCPA} target)`,
    confidence: 'medium',
    source: 'computed',
  })
}

/** Add negative for search terms with 0 conversions and cost > $20. */
function recommendAddNegative(d: PerformanceData, recs: PerformanceRecommendation[]): void {
  const terms = d.breakdowns.bySearchTerm
  if (!terms) return

  for (const { term, metrics } of terms) {
    if (metrics.conversions === 0 && metrics.cost > 20) {
      recs.push({
        type: 'add-negative',
        resource: d.resource,
        keyword: term,
        reason: `Search term "${term}" spent $${metrics.cost.toFixed(2)} with 0 conversions`,
        confidence: 'high',
        source: 'computed',
      })
    }
  }
}

// ─── Top-level analyze ───────────────────────────────────

/**
 * Full analysis pipeline: merge targets, compute violations, detect signals, compute recommendations.
 *
 * @param data - Raw performance data from providers
 * @param targets - Map of resource path → performance targets (from campaign definitions)
 * @param thresholds - Optional custom severity thresholds
 * @returns Complete analysis result with enriched data
 */
export function analyze(
  data: PerformanceData[],
  targets: Map<string, PerformanceTargets>,
  thresholds?: SeverityThresholds,
): AnalysisResult {
  // Step 1: Merge targets onto data (existing targets on data take precedence)
  const enrichedData = data.map(d => {
    const mergedTargets = d.targets ?? targets.get(d.resource)
    const violations = mergedTargets
      ? computeViolations(d.metrics, mergedTargets, thresholds)
      : []
    return {
      ...d,
      targets: mergedTargets,
      violations,
    }
  })

  // Step 2: Collect all violations
  const allViolations = enrichedData.flatMap(d => d.violations)

  // Step 3: Detect signals from enriched data (so budget-constrained can use targets)
  const signals = detectSignals(enrichedData)

  // Step 4: Compute recommendations from enriched data
  const recommendations = computeRecommendations(enrichedData)

  return {
    data: enrichedData,
    violations: allViolations,
    signals,
    recommendations,
  }
}

// ─── Utility ─────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}
