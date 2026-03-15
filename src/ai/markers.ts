// === AI Marker Factories ===
// Each factory returns a frozen marker object ready to embed in a campaign definition.

import type {
  InterestsMarker,
  KeywordsMarker,
  MetaCopyMarker,
  RsaMarker,
} from './types.ts'

// ─── Input Types ───────────────────────────────────────────

export type RsaMarkerInput = {
  readonly prompt: string
  readonly product?: string
  readonly audience?: string
  readonly tone?: string
  readonly judge?: string
}

export type MetaCopyMarkerInput = {
  readonly prompt: string
  readonly product?: string
  readonly audience?: string
  readonly tone?: string
  readonly judge?: string
}

// ─── Shared Helpers ────────────────────────────────────────

/** Build the optional `structured` bag from product/audience/tone fields. */
function buildStructured(input: { product?: string; audience?: string; tone?: string }) {
  const { product, audience, tone } = input
  if (product === undefined && audience === undefined && tone === undefined) return undefined
  return {
    ...(product !== undefined && { product }),
    ...(audience !== undefined && { audience }),
    ...(tone !== undefined && { tone }),
  } as const
}

// ─── Google RSA ────────────────────────────────────────────

const DEFAULT_RSA_PROMPT = 'Generate RSA ad copy'

/**
 * Create an RSA (Responsive Search Ad) AI marker.
 *
 * @param input - A prompt string, or a structured input with prompt + optional fields
 */
export function rsaMarker(input: string | RsaMarkerInput): RsaMarker {
  if (typeof input === 'string') {
    return Object.freeze({ __ai: true as const, type: 'rsa' as const, prompt: input || DEFAULT_RSA_PROMPT })
  }

  const structured = buildStructured(input)
  return Object.freeze({
    __ai: true as const,
    type: 'rsa' as const,
    prompt: input.prompt || DEFAULT_RSA_PROMPT,
    ...(structured !== undefined && { structured }),
    ...(input.judge !== undefined && { judge: input.judge }),
  })
}

// ─── Google Keywords ───────────────────────────────────────

/**
 * Create a keywords AI marker for Google Ads keyword generation.
 */
export function keywordsMarker(prompt: string): KeywordsMarker {
  return Object.freeze({
    __ai: true as const,
    type: 'keywords' as const,
    prompt,
  })
}

// ─── Meta Copy ─────────────────────────────────────────────

const DEFAULT_META_COPY_PROMPT = 'Generate Meta ad copy'

/**
 * Create a Meta ad copy AI marker.
 *
 * @param input - A prompt string, or a structured input with prompt + optional fields
 */
export function metaCopyMarker(input: string | MetaCopyMarkerInput): MetaCopyMarker {
  if (typeof input === 'string') {
    return Object.freeze({ __ai: true as const, type: 'meta-copy' as const, prompt: input || DEFAULT_META_COPY_PROMPT })
  }

  const structured = buildStructured(input)
  return Object.freeze({
    __ai: true as const,
    type: 'meta-copy' as const,
    prompt: input.prompt || DEFAULT_META_COPY_PROMPT,
    ...(structured !== undefined && { structured }),
    ...(input.judge !== undefined && { judge: input.judge }),
  })
}

// ─── Meta Interests ────────────────────────────────────────

/**
 * Create an interests AI marker for Meta Ads interest targeting generation.
 */
export function interestsMarker(prompt: string): InterestsMarker {
  return Object.freeze({
    __ai: true as const,
    type: 'interests' as const,
    prompt,
  })
}
