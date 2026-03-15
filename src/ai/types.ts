// === AI Marker Types ===
// Markers are lightweight tags that declare an AI generation intent.
// They carry a prompt and optional structured context but don't invoke any LLM themselves.

/**
 * Base marker shape. Every AI marker carries a discriminated `type` field
 * and a `__brand` tag so the diff/flatten layers can detect them.
 */
export type AiMarker = {
  readonly __brand: 'ai-marker'
  readonly type: string
}

/**
 * AI configuration passed to generation functions.
 */
export type AiConfig = {
  readonly model: unknown
  readonly judge?: { prompt: string }
}

// ─── Google RSA Markers ────────────────────────────────────

export type RsaMarker = AiMarker & {
  readonly type: 'rsa'
  readonly prompt: string
  readonly structured?: {
    readonly product?: string
    readonly audience?: string
    readonly tone?: string
  }
  readonly judge?: string
}

export type KeywordsMarker = AiMarker & {
  readonly type: 'keywords'
  readonly prompt: string
}

// ─── Meta Ad Markers ───────────────────────────────────────

export type MetaCopyMarker = AiMarker & {
  readonly type: 'meta-copy'
  readonly prompt: string
  readonly structured?: {
    readonly product?: string
    readonly audience?: string
    readonly tone?: string
  }
  readonly judge?: string
}

export type InterestsMarker = AiMarker & {
  readonly type: 'interests'
  readonly prompt: string
}

// ─── Type Guards ───────────────────────────────────────────

export function isAiMarker(value: unknown): value is AiMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as AiMarker).__brand === 'ai-marker'
  )
}

export function isRsaMarker(value: unknown): value is RsaMarker {
  return isAiMarker(value) && value.type === 'rsa'
}

export function isKeywordsMarker(value: unknown): value is KeywordsMarker {
  return isAiMarker(value) && value.type === 'keywords'
}

export function isMetaCopyMarker(value: unknown): value is MetaCopyMarker {
  return isAiMarker(value) && value.type === 'meta-copy'
}

export function isInterestsMarker(value: unknown): value is InterestsMarker {
  return isAiMarker(value) && value.type === 'interests'
}
