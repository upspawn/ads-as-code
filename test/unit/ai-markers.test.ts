import { describe, expect, test } from 'bun:test'
import { isAiMarker, isRsaMarker, isKeywordsMarker } from '../../src/ai/types.ts'
import { ai } from '../../src/ai/index.ts'
import type { RsaMarker, KeywordsMarker } from '../../src/ai/types.ts'

// ─── Type Guard Tests ───────────────────────────────────────────────

describe('isAiMarker()', () => {
  test('returns true for an RsaMarker', () => {
    const marker: RsaMarker = {
      __brand: 'ai-marker',
      type: 'rsa',
      prompt: 'generate headlines',
    }
    expect(isAiMarker(marker)).toBe(true)
  })

  test('returns true for a KeywordsMarker', () => {
    const marker: KeywordsMarker = {
      __brand: 'ai-marker',
      type: 'keywords',
      prompt: 'generate keywords',
    }
    expect(isAiMarker(marker)).toBe(true)
  })

  test('returns false for a plain object', () => {
    expect(isAiMarker({ foo: 'bar' })).toBe(false)
  })

  test('returns false for an RSAd object', () => {
    const rsad = {
      type: 'rsa',
      headlines: ['h1'],
      descriptions: ['d1'],
      finalUrl: 'https://example.com',
    }
    expect(isAiMarker(rsad)).toBe(false)
  })

  test('returns false for null', () => {
    expect(isAiMarker(null)).toBe(false)
  })

  test('returns false for a string', () => {
    expect(isAiMarker('ai-marker')).toBe(false)
  })
})

describe('isRsaMarker()', () => {
  test('returns true for an RsaMarker', () => {
    const marker: RsaMarker = {
      __brand: 'ai-marker',
      type: 'rsa',
      prompt: 'generate headlines',
    }
    expect(isRsaMarker(marker)).toBe(true)
  })

  test('returns false for a KeywordsMarker', () => {
    const marker: KeywordsMarker = {
      __brand: 'ai-marker',
      type: 'keywords',
      prompt: 'generate keywords',
    }
    expect(isRsaMarker(marker)).toBe(false)
  })

  test('returns false for a plain RSAd object', () => {
    const rsad = {
      type: 'rsa',
      headlines: ['h1'],
      descriptions: ['d1'],
      finalUrl: 'https://example.com',
    }
    expect(isRsaMarker(rsad)).toBe(false)
  })
})

describe('isKeywordsMarker()', () => {
  test('returns true for a KeywordsMarker', () => {
    const marker: KeywordsMarker = {
      __brand: 'ai-marker',
      type: 'keywords',
      prompt: 'generate keywords',
    }
    expect(isKeywordsMarker(marker)).toBe(true)
  })

  test('returns false for an RsaMarker', () => {
    const marker: RsaMarker = {
      __brand: 'ai-marker',
      type: 'rsa',
      prompt: 'generate headlines',
    }
    expect(isKeywordsMarker(marker)).toBe(false)
  })

  test('returns false for a plain object', () => {
    expect(isKeywordsMarker({ type: 'keywords', prompt: 'test' })).toBe(false)
  })
})

// ─── Factory Function Tests ─────────────────────────────────────────

describe('ai.rsa()', () => {
  test('string prompt returns valid RsaMarker', () => {
    const marker = ai.rsa('generate headlines for file renaming tool')
    expect(marker.__brand).toBe('ai-marker')
    expect(marker.type).toBe('rsa')
    expect(marker.prompt).toBe('generate headlines for file renaming tool')
  })

  test('structured input returns marker with structured fields', () => {
    const marker = ai.rsa({ product: 'Renamed', audience: 'developers', tone: 'professional' })
    expect(marker.__brand).toBe('ai-marker')
    expect(marker.type).toBe('rsa')
    expect(marker.structured?.product).toBe('Renamed')
    expect(marker.structured?.audience).toBe('developers')
    expect(marker.structured?.tone).toBe('professional')
    expect(marker.prompt).toContain('Renamed')
  })

  test('structured input with explicit prompt and judge', () => {
    const marker = ai.rsa({ product: 'Renamed', prompt: 'custom prompt', judge: 'strict quality' })
    expect(marker.prompt).toBe('custom prompt')
    expect(marker.structured?.product).toBe('Renamed')
    expect(marker.judge).toBe('strict quality')
  })

  test('returned marker is frozen', () => {
    const marker = ai.rsa('test')
    expect(Object.isFrozen(marker)).toBe(true)
  })

  test('marker passes isAiMarker check', () => {
    expect(isAiMarker(ai.rsa('test'))).toBe(true)
  })

  test('marker passes isRsaMarker check', () => {
    expect(isRsaMarker(ai.rsa('test'))).toBe(true)
  })

  test('marker does not pass isKeywordsMarker check', () => {
    expect(isKeywordsMarker(ai.rsa('test'))).toBe(false)
  })
})

describe('ai.keywords()', () => {
  test('returns valid KeywordsMarker', () => {
    const marker = ai.keywords('find keywords for file renaming tool')
    expect(marker.__brand).toBe('ai-marker')
    expect(marker.type).toBe('keywords')
    expect(marker.prompt).toBe('find keywords for file renaming tool')
  })

  test('returned marker is frozen', () => {
    const marker = ai.keywords('test')
    expect(Object.isFrozen(marker)).toBe(true)
  })

  test('marker passes isAiMarker check', () => {
    expect(isAiMarker(ai.keywords('test'))).toBe(true)
  })

  test('marker passes isKeywordsMarker check', () => {
    expect(isKeywordsMarker(ai.keywords('test'))).toBe(true)
  })

  test('marker does not pass isRsaMarker check', () => {
    expect(isRsaMarker(ai.keywords('test'))).toBe(false)
  })
})
