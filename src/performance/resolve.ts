/**
 * Performance resolve — target extraction, inheritance, and report building.
 *
 * Pure functions that bridge campaign definitions (Resource[]) and
 * the performance analysis pipeline output into a final PerformanceReport.
 */

import type { Resource } from '../core/types.ts'
import type {
  PerformanceTargets,
  PerformanceData,
  PerformanceSignal,
  PerformanceRecommendation,
  PerformanceReport,
  PerformancePeriod,
} from './types.ts'

// ---------------------------------------------------------------------------
// Target extraction — reads from Resource.meta.performanceTargets
// ---------------------------------------------------------------------------

/**
 * Extract performance targets from flattened resources.
 *
 * Campaign definitions can declare targets in `Resource.meta.performanceTargets`.
 * This function collects them into a map keyed by resource path, which the
 * analysis engine uses to evaluate violations.
 *
 * Returns an empty map when no resources have targets — the analysis engine
 * handles missing targets gracefully.
 */
export function extractTargets(resources: Resource[]): Map<string, PerformanceTargets> {
  const targets = new Map<string, PerformanceTargets>()

  for (const resource of resources) {
    const t = resource.meta?.['performanceTargets'] as PerformanceTargets | undefined
    if (t && hasAnyTarget(t)) {
      targets.set(resource.path, t)
    }
  }

  return targets
}

/** Check if a targets object has at least one non-undefined field. */
function hasAnyTarget(t: PerformanceTargets): boolean {
  return (
    t.targetCPA !== undefined ||
    t.minROAS !== undefined ||
    t.minCTR !== undefined ||
    t.maxCPC !== undefined ||
    t.maxBudget !== undefined ||
    t.minConversions !== undefined ||
    t.minImpressionShare !== undefined ||
    t.strategy !== undefined
  )
}

// ---------------------------------------------------------------------------
// Target inheritance — child resources inherit from parent campaigns
// ---------------------------------------------------------------------------

/**
 * Resolve the effective targets for a resource path by walking up the
 * path hierarchy. Child-level targets override parent-level targets.
 *
 * Path hierarchy: "campaign-a/group-1/kw:foo:EXACT"
 *   1. Look up "campaign-a/group-1/kw:foo:EXACT" (most specific)
 *   2. Look up "campaign-a/group-1"
 *   3. Look up "campaign-a" (least specific)
 *
 * Fields from child levels override the same field from parent levels.
 * If no targets are found at any level, returns undefined.
 */
export function resolveTargetInheritance(
  path: string,
  targets: Map<string, PerformanceTargets>,
): PerformanceTargets | undefined {
  const segments = path.split('/')

  // Collect targets from root (campaign) to leaf, then merge child-overrides-parent
  let merged: PerformanceTargets | undefined

  for (let i = 1; i <= segments.length; i++) {
    const ancestorPath = segments.slice(0, i).join('/')
    const ancestorTargets = targets.get(ancestorPath)
    if (ancestorTargets) {
      merged = merged ? { ...merged, ...stripUndefined(ancestorTargets) } : ancestorTargets
    }
  }

  return merged
}

/** Remove undefined values so spread doesn't overwrite parent values with undefined. */
function stripUndefined(t: PerformanceTargets): Partial<PerformanceTargets> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(t)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result as Partial<PerformanceTargets>
}

// ---------------------------------------------------------------------------
// Report building — aggregate analysis results into a final report
// ---------------------------------------------------------------------------

/**
 * Build a complete performance report from analysis results.
 *
 * Computes summary metrics (total spend, conversions, CPA, ROAS) and
 * signal counts from the provided data, signals, and recommendations.
 */
export function buildPerformanceReport(
  data: PerformanceData[],
  signals: PerformanceSignal[],
  recommendations: PerformanceRecommendation[],
  period: PerformancePeriod,
): PerformanceReport {
  // Aggregate only campaign-level data to avoid double-counting
  // (ad group / keyword metrics are subsets of campaign metrics)
  const campaignData = data.filter(d => d.kind === 'campaign')

  let totalSpend = 0
  let totalConversions = 0
  let totalConversionValue = 0
  let totalViolations = 0

  for (const d of campaignData) {
    totalSpend += d.metrics.cost
    totalConversions += d.metrics.conversions
    totalConversionValue += d.metrics.conversionValue
  }

  // Count violations across all resources (not just campaigns)
  for (const d of data) {
    totalViolations += d.violations.length
  }

  const signalCount = { info: 0, warning: 0, critical: 0 }
  for (const s of signals) {
    signalCount[s.severity]++
  }

  return {
    generatedAt: new Date(),
    period,
    data,
    signals,
    recommendations,
    summary: {
      totalSpend,
      totalConversions,
      totalConversionValue,
      overallCPA: totalConversions > 0 ? totalSpend / totalConversions : null,
      overallROAS: totalSpend > 0 ? totalConversionValue / totalSpend : null,
      violationCount: totalViolations,
      signalCount,
    },
  }
}
