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

// Re-export types for consumer convenience
export type { AiConfig, AiJudgeConfig, AiOptimizeConfig, AiMarker, RsaMarker, KeywordsMarker } from './types.ts'
export { isAiMarker, isRsaMarker, isKeywordsMarker } from './types.ts'
