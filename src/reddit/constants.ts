// src/reddit/constants.ts
import type { Objective, OptimizationGoalMap } from './types'
import type { ResourceKind } from '../core/types'

export const OBJECTIVE_MAP: Record<Objective, string> = {
  'awareness': 'BRAND_AWARENESS_AND_REACH',
  'traffic': 'TRAFFIC',
  'engagement': 'ENGAGEMENT',
  'video-views': 'VIDEO_VIEWS',
  'app-installs': 'APP_INSTALLS',
  'conversions': 'CONVERSIONS',
  'leads': 'LEAD_GENERATION',
}

export const REVERSE_OBJECTIVE_MAP: Record<string, Objective> = Object.fromEntries(
  Object.entries(OBJECTIVE_MAP).map(([k, v]) => [v, k as Objective]),
) as Record<string, Objective>

export const DEFAULT_OPTIMIZATION: { [K in Objective]: OptimizationGoalMap[K] } = {
  'awareness': 'REACH',
  'traffic': 'LINK_CLICKS',
  'engagement': 'POST_ENGAGEMENT',
  'video-views': 'VIDEO_VIEWS',
  'app-installs': 'APP_INSTALLS',
  'conversions': 'CONVERSIONS',
  'leads': 'LEADS',
}

export const STATUS_MAP: Record<string, string> = {
  'enabled': 'ACTIVE',
  'paused': 'PAUSED',
}

export const REVERSE_STATUS_MAP: Record<string, string> = {
  'ACTIVE': 'enabled',
  'PAUSED': 'paused',
}

export const CREATION_ORDER: ResourceKind[] = ['campaign', 'adGroup', 'ad']
export const DELETION_ORDER: ResourceKind[] = ['ad', 'adGroup', 'campaign']
