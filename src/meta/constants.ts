// Meta Ads API constants

import type { Objective, OptimizationGoalMap } from './types.ts'
import type { ResourceKind } from '../core/types.ts'

// ─── Objective Map ─────────────────────────────────────────
// SDK objective → Meta API objective string

export const OBJECTIVE_MAP: Record<Objective, string> = {
  'awareness': 'OUTCOME_AWARENESS',
  'traffic': 'OUTCOME_TRAFFIC',
  'engagement': 'OUTCOME_ENGAGEMENT',
  'leads': 'OUTCOME_LEADS',
  'sales': 'OUTCOME_SALES',
  'conversions': 'OUTCOME_SALES',
  'app-promotion': 'OUTCOME_APP_PROMOTION',
} as const

// ─── Default Optimization Goals ────────────────────────────
// When `optimization` is omitted from AdSetConfig, these defaults apply.
// Matches the spec's DX Design Principles table.

export const DEFAULT_OPTIMIZATION: { [K in Objective]: OptimizationGoalMap[K] } = {
  'awareness': 'REACH',
  'traffic': 'LINK_CLICKS',
  'engagement': 'POST_ENGAGEMENT',
  'leads': 'LEAD_GENERATION',
  'sales': 'OFFSITE_CONVERSIONS',
  'conversions': 'OFFSITE_CONVERSIONS',
  'app-promotion': 'APP_INSTALLS',
} as const

// ─── Dependency Ordering ───────────────────────────────────
// Meta resource kinds in creation order (parent → child)

export const CREATION_ORDER: ResourceKind[] = [
  'campaign',
  'adSet',
  'creative',
  'ad',
]

/** Deletion order is the reverse of creation order (child → parent) */
export const DELETION_ORDER: ResourceKind[] = [
  'ad',
  'creative',
  'adSet',
  'campaign',
]
