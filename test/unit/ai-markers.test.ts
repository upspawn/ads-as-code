import { describe, expect, test } from 'bun:test'
import { isAiMarker, isRsaMarker, isKeywordsMarker } from '../../src/ai/types.ts'
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
