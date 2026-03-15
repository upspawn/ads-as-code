// === AI Marker Types ===
// Markers are lightweight tags that declare an AI generation intent.
// They carry a prompt and optional structured context but don't invoke any LLM themselves.

/**
 * Base marker shape. Every AI marker carries a discriminated `type` field
 * and an `__ai` brand so the diff/flatten layers can detect them.
 */
export type AiMarker = {
  readonly __ai: true
  readonly type: string
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

function isAiMarker(value: unknown): value is AiMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__ai' in value &&
    (value as AiMarker).__ai === true
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
