import type { LanguageModel } from 'ai'

// === AI Markers ===
// Branded marker objects that act as placeholders in campaign definitions.
// During generation, these markers are resolved into concrete ad copy / keywords.

export type AiMarker = { readonly __brand: 'ai-marker' }

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

// === Type Guards ===

export function isAiMarker(value: unknown): value is AiMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as AiMarker).__brand === 'ai-marker'
  )
}

export function isRsaMarker(value: unknown): value is RsaMarker {
  return isAiMarker(value) && 'type' in value && (value as RsaMarker).type === 'rsa'
}

export function isKeywordsMarker(value: unknown): value is KeywordsMarker {
  return isAiMarker(value) && 'type' in value && (value as KeywordsMarker).type === 'keywords'
}

// === AI Configuration ===

export type AiJudgeConfig = {
  readonly model?: LanguageModel
  readonly prompt: string
}

export type AiOptimizeConfig = {
  readonly prompt?: string
}

export type AiConfig = {
  readonly model: LanguageModel
  readonly judge?: AiJudgeConfig
  readonly optimize?: AiOptimizeConfig
}
