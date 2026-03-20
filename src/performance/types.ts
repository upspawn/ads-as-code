import type { Budget, ResourceKind } from '../core/types.ts'

// ---------------------------------------------------------------------------
// Targets & config — declared by users on campaigns/ad groups
// ---------------------------------------------------------------------------

export type PerformanceTargets = {
  readonly targetCPA?: number
  readonly minROAS?: number
  readonly minCTR?: number
  readonly maxCPC?: number
  readonly maxBudget?: Budget
  readonly minConversions?: number
  readonly minImpressionShare?: number
  readonly strategy?: string
}

export type PerformanceConfig = {
  readonly defaultPeriod?: string
  readonly severityThresholds?: {
    readonly warning?: number
    readonly critical?: number
  }
  readonly ai?: {
    readonly model?: string
    readonly provider?: string
  }
}

// ---------------------------------------------------------------------------
// Metrics — raw input and computed output
// ---------------------------------------------------------------------------

export type RawMetrics = {
  readonly impressions: number
  readonly clicks: number
  readonly cost: number
  readonly conversions: number
  readonly conversionValue: number
}

export type PerformanceMetrics = {
  readonly impressions: number
  readonly clicks: number
  readonly cost: number
  readonly conversions: number
  readonly conversionValue: number
  readonly ctr: number | null
  readonly cpc: number | null
  readonly cpa: number | null
  readonly roas: number | null
  readonly cpm: number | null
  readonly impressionShare?: number
  readonly qualityScore?: number
  readonly frequency?: number
  readonly reach?: number
}

/** Derive rate/ratio metrics from raw counters. Returns null for any metric that would divide by zero. */
export function computeMetrics(raw: RawMetrics): PerformanceMetrics {
  return {
    ...raw,
    ctr: raw.impressions > 0 ? raw.clicks / raw.impressions : null,
    cpc: raw.clicks > 0 ? raw.cost / raw.clicks : null,
    cpa: raw.conversions > 0 ? raw.cost / raw.conversions : null,
    roas: raw.cost > 0 ? raw.conversionValue / raw.cost : null,
    cpm: raw.impressions > 0 ? (raw.cost / raw.impressions) * 1000 : null,
  }
}

// ---------------------------------------------------------------------------
// Period — date range for performance queries
// ---------------------------------------------------------------------------

export type PerformancePeriod = { readonly start: Date; readonly end: Date }

// ---------------------------------------------------------------------------
// Severity thresholds — fractional deviation from target
// ---------------------------------------------------------------------------

export type SeverityThresholds = { readonly warning: number; readonly critical: number }

export const DEFAULT_THRESHOLDS: SeverityThresholds = { warning: 0.20, critical: 0.50 }

// ---------------------------------------------------------------------------
// Violations — when actuals breach targets
// ---------------------------------------------------------------------------

export type ViolationMetric = 'cpa' | 'roas' | 'ctr' | 'cpc' | 'spend' | 'conversions' | 'impressionShare'

export type PerformanceViolation = {
  readonly metric: ViolationMetric
  readonly actual: number
  readonly target: number
  readonly deviation: number
  readonly direction: 'over' | 'under'
  readonly severity: 'warning' | 'critical'
}

// ---------------------------------------------------------------------------
// Per-resource performance snapshot with breakdowns
// ---------------------------------------------------------------------------

export type PerformanceData = {
  readonly resource: string
  readonly provider: 'google' | 'meta' | 'reddit'
  readonly kind: ResourceKind
  readonly period: { readonly start: Date; readonly end: Date }
  readonly metrics: PerformanceMetrics
  readonly targets?: PerformanceTargets
  readonly violations: PerformanceViolation[]
  readonly breakdowns: {
    readonly byDay?: readonly { readonly date: string; readonly metrics: PerformanceMetrics }[]
    readonly byDevice?: Readonly<Record<'mobile' | 'desktop' | 'tablet', PerformanceMetrics>>
    readonly byPlacement?: Readonly<Record<string, PerformanceMetrics>>
    readonly byAge?: Readonly<Record<string, PerformanceMetrics>>
    readonly byGender?: Readonly<Record<string, PerformanceMetrics>>
    readonly bySearchTerm?: readonly { readonly term: string; readonly metrics: PerformanceMetrics }[]
  }
}

// ---------------------------------------------------------------------------
// Signals — detected patterns and anomalies
// ---------------------------------------------------------------------------

export type PerformanceSignalType =
  | 'budget-constrained'
  | 'zero-conversions'
  | 'creative-fatigue'
  | 'spend-concentration'
  | 'declining-trend'
  | 'improving-trend'
  | 'learning-phase'
  | 'high-frequency'
  | 'low-quality-score'
  | 'search-term-opportunity'

export type PerformanceSignal = {
  readonly type: PerformanceSignalType
  readonly severity: 'info' | 'warning' | 'critical'
  readonly resource: string
  readonly message: string
  readonly evidence: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Recommendations — actionable suggestions (discriminated union on `type`)
// ---------------------------------------------------------------------------

export type PerformanceRecommendation =
  | {
      readonly type: 'scale-budget' | 'reduce-budget'
      readonly resource: string
      readonly from: Budget
      readonly to: Budget
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'adjust-bid'
      readonly resource: string
      readonly from: number
      readonly to: number
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'pause-resource' | 'resume-resource' | 'refresh-creative'
      readonly resource: string
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'shift-budget'
      readonly resource: string
      readonly toResource: string
      readonly amount: Budget
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }
  | {
      readonly type: 'add-negative'
      readonly resource: string
      readonly keyword: string
      readonly reason: string
      readonly confidence: 'high' | 'medium' | 'low'
      readonly source: 'computed' | 'ai'
    }

// ---------------------------------------------------------------------------
// Report — top-level output aggregating all performance data
// ---------------------------------------------------------------------------

export type PerformanceReport = {
  readonly generatedAt: Date
  readonly period: { readonly start: Date; readonly end: Date }
  readonly data: PerformanceData[]
  readonly signals: PerformanceSignal[]
  readonly recommendations: PerformanceRecommendation[]
  readonly summary: {
    readonly totalSpend: number
    readonly totalConversions: number
    readonly totalConversionValue: number
    readonly overallCPA: number | null
    readonly overallROAS: number | null
    readonly violationCount: number
    readonly signalCount: { readonly info: number; readonly warning: number; readonly critical: number }
  }
}

// ---------------------------------------------------------------------------
// Analysis result — output of the analyze() pipeline
// ---------------------------------------------------------------------------

export type AnalysisResult = {
  readonly data: PerformanceData[]
  readonly violations: PerformanceViolation[]
  readonly signals: PerformanceSignal[]
  readonly recommendations: PerformanceRecommendation[]
}
