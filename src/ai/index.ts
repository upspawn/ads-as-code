// @upspawn/ads/ai — AI generation surface

import { rsaMarker } from './markers.ts'
import { keywordsMarker } from './markers.ts'

/**
 * AI marker namespace.
 *
 * Use `ai.rsa()` and `ai.keywords()` to create marker placeholders
 * in campaign definitions. These are resolved during AI generation.
 */
export const ai = {
  rsa: rsaMarker,
  keywords: keywordsMarker,
} as const

// Campaign multiplication
export { expand } from './expand.ts'
export type { ExpandConfig, ExpandEntry, ExpansionTarget } from './expand.ts'

// Core AI types and type guards
export type { AiConfig, AiJudgeConfig, AiOptimizeConfig, AiMarker, RsaMarker, KeywordsMarker } from './types.ts'
export { isAiMarker, isRsaMarker, isKeywordsMarker } from './types.ts'

// Lock file types (for consumers who inspect .gen.json programmatically)
export type { LockFile, LockSlot } from './lockfile.ts'

// Generation types
export type { GenerateResult, GenerateObjectFn } from './generate.ts'

// Staleness detection
export type { StaleSlot } from './resolve.ts'
