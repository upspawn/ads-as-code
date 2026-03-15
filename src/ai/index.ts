// === AI Module Public Surface ===
// Provides the `ai` namespace for embedding AI generation markers in campaign definitions.

import { rsaMarker, keywordsMarker, metaCopyMarker, interestsMarker } from './markers.ts'

/**
 * AI marker namespace.
 *
 * Use these to declare AI-generated content in campaign definitions.
 * Markers are inert tags — the actual LLM call happens during `plan` or `apply`.
 *
 * @example
 * ```ts
 * import { ai } from '@upspawn/ads'
 *
 * // Google RSA
 * ai.rsa('Write headlines for a file renaming tool')
 * ai.keywords('Suggest keywords for PDF tools')
 *
 * // Meta
 * ai.metaCopy('Write a Meta ad for cloud storage')
 * ai.interests('Suggest interests for SaaS targeting')
 * ```
 */
export const ai = {
  rsa: rsaMarker,
  keywords: keywordsMarker,
  metaCopy: metaCopyMarker,
  interests: interestsMarker,
} as const

// Re-export types for consumers
export type {
  AiMarker,
  RsaMarker,
  KeywordsMarker,
  MetaCopyMarker,
  InterestsMarker,
} from './types.ts'

export {
  isRsaMarker,
  isKeywordsMarker,
  isMetaCopyMarker,
  isInterestsMarker,
} from './types.ts'

export type { RsaMarkerInput, MetaCopyMarkerInput } from './markers.ts'

export {
  rsaSchema,
  keywordsSchema,
  metaCopySchema,
  interestsSchema,
} from './schemas.ts'

export type {
  RsaOutput,
  KeywordsOutput,
  MetaCopyOutput,
  InterestsOutput,
} from './schemas.ts'

export {
  compileRsaPrompt,
  compileKeywordsPrompt,
  compileMetaCopyPrompt,
  compileInterestsPrompt,
} from './prompt.ts'

export type { RsaPromptContext, MetaPromptContext } from './prompt.ts'
