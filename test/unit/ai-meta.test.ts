import { describe, expect, test } from 'bun:test'
import {
  metaCopyMarker,
  interestsMarker,
  rsaMarker,
  keywordsMarker,
} from '../../src/ai/markers.ts'
import {
  isMetaCopyMarker,
  isInterestsMarker,
  isRsaMarker,
  isKeywordsMarker,
} from '../../src/ai/types.ts'
import {
  metaCopySchema,
  interestsSchema,
} from '../../src/ai/schemas.ts'
import {
  compileMetaCopyPrompt,
  compileInterestsPrompt,
} from '../../src/ai/prompt.ts'

// ─── MetaCopyMarker Creation ───────────────────────────────

describe('metaCopyMarker()', () => {
  test('creates marker from string input', () => {
    const marker = metaCopyMarker('Write a Meta ad for Acme')
    expect(marker.__brand).toBe('ai-marker')
    expect(marker.type).toBe('meta-copy')
    expect(marker.prompt).toBe('Write a Meta ad for Acme')
    expect(marker.structured).toBeUndefined()
    expect(marker.judge).toBeUndefined()
  })

  test('uses default prompt when string is empty', () => {
    const marker = metaCopyMarker('')
    expect(marker.prompt).toBe('Generate Meta ad copy')
  })

  test('creates marker from structured input', () => {
    const marker = metaCopyMarker({
      prompt: 'Ad for cloud storage',
      product: 'CloudVault',
      audience: 'small businesses',
      tone: 'professional',
    })
    expect(marker.type).toBe('meta-copy')
    expect(marker.prompt).toBe('Ad for cloud storage')
    expect(marker.structured).toEqual({
      product: 'CloudVault',
      audience: 'small businesses',
      tone: 'professional',
    })
  })

  test('includes judge when provided', () => {
    const marker = metaCopyMarker({
      prompt: 'Write copy',
      judge: 'Must mention free trial',
    })
    expect(marker.judge).toBe('Must mention free trial')
  })

  test('omits structured when no fields given', () => {
    const marker = metaCopyMarker({ prompt: 'Just a prompt' })
    expect(marker.structured).toBeUndefined()
  })

  test('marker is frozen', () => {
    const marker = metaCopyMarker('test')
    expect(Object.isFrozen(marker)).toBe(true)
  })
})

// ─── InterestsMarker Creation ──────────────────────────────

describe('interestsMarker()', () => {
  test('creates marker from prompt', () => {
    const marker = interestsMarker('Interests for SaaS targeting')
    expect(marker.__brand).toBe('ai-marker')
    expect(marker.type).toBe('interests')
    expect(marker.prompt).toBe('Interests for SaaS targeting')
  })

  test('marker is frozen', () => {
    const marker = interestsMarker('test')
    expect(Object.isFrozen(marker)).toBe(true)
  })
})

// ─── Type Guards ───────────────────────────────────────────

describe('type guards', () => {
  const meta = metaCopyMarker('meta ad')
  const interests = interestsMarker('interests')
  const rsa = rsaMarker('rsa ad')
  const kw = keywordsMarker('keywords')

  test('isMetaCopyMarker identifies meta-copy markers', () => {
    expect(isMetaCopyMarker(meta)).toBe(true)
  })

  test('isMetaCopyMarker rejects other marker types', () => {
    expect(isMetaCopyMarker(rsa)).toBe(false)
    expect(isMetaCopyMarker(kw)).toBe(false)
    expect(isMetaCopyMarker(interests)).toBe(false)
  })

  test('isMetaCopyMarker rejects non-marker values', () => {
    expect(isMetaCopyMarker(null)).toBe(false)
    expect(isMetaCopyMarker(undefined)).toBe(false)
    expect(isMetaCopyMarker('string')).toBe(false)
    expect(isMetaCopyMarker({ type: 'meta-copy' })).toBe(false) // missing __brand
    expect(isMetaCopyMarker({ __brand: 'other', type: 'meta-copy' })).toBe(false) // __brand not 'ai-marker'
  })

  test('isInterestsMarker identifies interests markers', () => {
    expect(isInterestsMarker(interests)).toBe(true)
  })

  test('isInterestsMarker rejects other marker types', () => {
    expect(isInterestsMarker(meta)).toBe(false)
    expect(isInterestsMarker(rsa)).toBe(false)
    expect(isInterestsMarker(kw)).toBe(false)
  })

  test('isInterestsMarker rejects non-marker values', () => {
    expect(isInterestsMarker(null)).toBe(false)
    expect(isInterestsMarker(42)).toBe(false)
    expect(isInterestsMarker({ __brand: 'ai-marker', type: 'keywords' })).toBe(false)
  })

  test('isRsaMarker does not false-positive on meta markers', () => {
    expect(isRsaMarker(meta)).toBe(false)
    expect(isRsaMarker(interests)).toBe(false)
  })

  test('isKeywordsMarker does not false-positive on meta markers', () => {
    expect(isKeywordsMarker(meta)).toBe(false)
    expect(isKeywordsMarker(interests)).toBe(false)
  })
})

// ─── metaCopySchema ────────────────────────────────────────

describe('metaCopySchema', () => {
  test('accepts valid input', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Try our cloud storage today',
      headline: 'Save files securely',
      description: 'Start your free trial',
    })
    expect(result.success).toBe(true)
  })

  test('accepts input without optional description', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Try our cloud storage',
      headline: 'Save files',
    })
    expect(result.success).toBe(true)
  })

  test('rejects primaryText over 125 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'A'.repeat(126),
      headline: 'Ok',
    })
    expect(result.success).toBe(false)
  })

  test('accepts primaryText at exactly 125 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'A'.repeat(125),
      headline: 'Ok',
    })
    expect(result.success).toBe(true)
  })

  test('rejects headline over 40 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Body text',
      headline: 'H'.repeat(41),
    })
    expect(result.success).toBe(false)
  })

  test('accepts headline at exactly 40 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Body text',
      headline: 'H'.repeat(40),
    })
    expect(result.success).toBe(true)
  })

  test('rejects description over 30 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Body text',
      headline: 'Title',
      description: 'D'.repeat(31),
    })
    expect(result.success).toBe(false)
  })

  test('accepts description at exactly 30 characters', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Body text',
      headline: 'Title',
      description: 'D'.repeat(30),
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing primaryText', () => {
    const result = metaCopySchema.safeParse({
      headline: 'Title',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing headline', () => {
    const result = metaCopySchema.safeParse({
      primaryText: 'Body',
    })
    expect(result.success).toBe(false)
  })
})

// ─── interestsSchema ───────────────────────────────────────

describe('interestsSchema', () => {
  test('accepts valid input', () => {
    const result = interestsSchema.safeParse({
      interests: [
        { name: 'Small business' },
        { name: 'Cloud computing' },
        { name: 'File management' },
      ],
    })
    expect(result.success).toBe(true)
  })

  test('accepts empty interests array', () => {
    const result = interestsSchema.safeParse({ interests: [] })
    expect(result.success).toBe(true)
  })

  test('rejects missing interests field', () => {
    const result = interestsSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  test('rejects interest without name', () => {
    const result = interestsSchema.safeParse({
      interests: [{ id: '123' }],
    })
    expect(result.success).toBe(false)
  })
})

// ─── compileMetaCopyPrompt ─────────────────────────────────

describe('compileMetaCopyPrompt()', () => {
  test('includes META_AD_CONSTRAINTS', () => {
    const marker = metaCopyMarker('Write a Meta ad')
    const prompt = compileMetaCopyPrompt(marker)

    expect(prompt).toContain('Meta Ads copy constraints')
    expect(prompt).toContain('primaryText')
    expect(prompt).toContain('at most 125 characters')
    expect(prompt).toContain('at most 40 characters')
    expect(prompt).toContain('at most 30 characters')
  })

  test('includes the marker prompt', () => {
    const marker = metaCopyMarker('Promote our SaaS product')
    const prompt = compileMetaCopyPrompt(marker)

    expect(prompt).toContain('Promote our SaaS product')
  })

  test('includes campaign and ad set context', () => {
    const marker = metaCopyMarker('Write copy')
    const prompt = compileMetaCopyPrompt(marker, {
      campaignName: 'Summer Sale',
      adSetKey: 'lookalike-us',
    })

    expect(prompt).toContain('Campaign: Summer Sale')
    expect(prompt).toContain('Ad set: lookalike-us')
  })

  test('includes structured fields when provided', () => {
    const marker = metaCopyMarker({
      prompt: 'Generate ad',
      product: 'CloudVault',
      audience: 'developers',
      tone: 'casual',
    })
    const prompt = compileMetaCopyPrompt(marker)

    expect(prompt).toContain('Product: CloudVault')
    expect(prompt).toContain('Audience: developers')
    expect(prompt).toContain('Tone: casual')
  })

  test('includes marker-level judge', () => {
    const marker = metaCopyMarker({
      prompt: 'Write ad',
      judge: 'Must be under 80 chars',
    })
    const prompt = compileMetaCopyPrompt(marker)

    expect(prompt).toContain('Judge criteria: Must be under 80 chars')
  })

  test('falls back to context default judge', () => {
    const marker = metaCopyMarker('Write ad')
    const prompt = compileMetaCopyPrompt(marker, {
      defaultJudge: 'Ensure brand voice consistency',
    })

    expect(prompt).toContain('Judge criteria: Ensure brand voice consistency')
  })

  test('marker judge overrides context default judge', () => {
    const marker = metaCopyMarker({
      prompt: 'Write ad',
      judge: 'Marker-specific criteria',
    })
    const prompt = compileMetaCopyPrompt(marker, {
      defaultJudge: 'Default criteria',
    })

    expect(prompt).toContain('Marker-specific criteria')
    expect(prompt).not.toContain('Default criteria')
  })

  test('omits judge section when neither provided', () => {
    const marker = metaCopyMarker('Write ad')
    const prompt = compileMetaCopyPrompt(marker)

    expect(prompt).not.toContain('Judge criteria')
  })
})

// ─── compileInterestsPrompt ────────────────────────────────

describe('compileInterestsPrompt()', () => {
  test('includes INTERESTS_CONSTRAINTS', () => {
    const marker = interestsMarker('Suggest interests')
    const prompt = compileInterestsPrompt(marker)

    expect(prompt).toContain('Meta Ads interest targeting guidance')
    expect(prompt).toContain('recognizable category')
    expect(prompt).toContain('IDs are resolved separately')
  })

  test('includes the marker prompt', () => {
    const marker = interestsMarker('Interests for B2B SaaS')
    const prompt = compileInterestsPrompt(marker)

    expect(prompt).toContain('Interests for B2B SaaS')
  })

  test('includes campaign and ad set context', () => {
    const marker = interestsMarker('Find interests')
    const prompt = compileInterestsPrompt(marker, {
      campaignName: 'Awareness Campaign',
      adSetKey: 'tech-professionals',
    })

    expect(prompt).toContain('Campaign: Awareness Campaign')
    expect(prompt).toContain('Ad set: tech-professionals')
  })

  test('works without context', () => {
    const marker = interestsMarker('Suggest interests for fitness')
    const prompt = compileInterestsPrompt(marker)

    // Should not throw and should contain basic content
    expect(prompt).toContain('Suggest interests for fitness')
    expect(prompt).toContain('Meta Ads interest targeting guidance')
  })
})
