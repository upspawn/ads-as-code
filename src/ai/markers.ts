import type { RsaMarker, KeywordsMarker } from './types.ts'

// === RSA Marker Factory ===

type RsaMarkerInput = {
  readonly product?: string
  readonly audience?: string
  readonly tone?: string
  readonly prompt?: string
  readonly judge?: string
}

/**
 * Create an RSA (Responsive Search Ad) marker for AI generation.
 *
 * Accepts either a raw prompt string or a structured input object.
 * The marker is frozen to prevent accidental mutation.
 */
export function rsaMarker(input: string | RsaMarkerInput): RsaMarker {
  if (typeof input === 'string') {
    return Object.freeze({
      __brand: 'ai-marker' as const,
      type: 'rsa' as const,
      prompt: input,
    })
  }

  const prompt = input.prompt ?? buildRsaPrompt(input)

  return Object.freeze({
    __brand: 'ai-marker' as const,
    type: 'rsa' as const,
    prompt,
    ...(input.product || input.audience || input.tone
      ? {
          structured: {
            ...(input.product !== undefined && { product: input.product }),
            ...(input.audience !== undefined && { audience: input.audience }),
            ...(input.tone !== undefined && { tone: input.tone }),
          },
        }
      : {}),
    ...(input.judge !== undefined && { judge: input.judge }),
  })
}

/** Build a default prompt from structured fields when no explicit prompt is given. */
function buildRsaPrompt(input: RsaMarkerInput): string {
  const parts: string[] = []
  if (input.product) parts.push(`Product: ${input.product}`)
  if (input.audience) parts.push(`Audience: ${input.audience}`)
  if (input.tone) parts.push(`Tone: ${input.tone}`)
  return parts.length > 0
    ? `Generate RSA headlines and descriptions. ${parts.join('. ')}.`
    : 'Generate RSA headlines and descriptions.'
}

// === Keywords Marker Factory ===

/**
 * Create a Keywords marker for AI generation.
 *
 * The marker is frozen to prevent accidental mutation.
 */
export function keywordsMarker(prompt: string): KeywordsMarker {
  return Object.freeze({
    __brand: 'ai-marker' as const,
    type: 'keywords' as const,
    prompt,
  })
}
