import { describe, expect, test } from 'bun:test'
import { rsaSchema, keywordsSchema } from '../../src/ai/schemas.ts'

// ─── RSA Schema ────────────────────────────────────────────────────

describe('rsaSchema', () => {
  test('accepts valid RSA output', () => {
    const input = {
      headlines: ['Rename Files Fast', 'Batch File Renamer', 'Easy File Rename'],
      descriptions: [
        'Rename thousands of files in seconds with our powerful batch tool.',
        'Professional file renaming for developers. Try free today.',
      ],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  test('accepts maximum valid counts (15 headlines, 4 descriptions)', () => {
    const input = {
      headlines: Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      descriptions: Array.from({ length: 4 }, (_, i) => `Description number ${i + 1} for the ad.`),
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  test('rejects headline > 30 characters', () => {
    const input = {
      headlines: ['This headline is way too long and exceeds the limit', 'OK', 'Fine'],
      descriptions: ['Valid description here.', 'Another valid one.'],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects fewer than 3 headlines', () => {
    const input = {
      headlines: ['H1', 'H2'],
      descriptions: ['Valid description.', 'Another one.'],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects more than 15 headlines', () => {
    const input = {
      headlines: Array.from({ length: 16 }, (_, i) => `H${i + 1}`),
      descriptions: ['Valid description.', 'Another one.'],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects description > 90 characters', () => {
    const input = {
      headlines: ['H1', 'H2', 'H3'],
      descriptions: [
        'A'.repeat(91),
        'Valid description.',
      ],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects fewer than 2 descriptions', () => {
    const input = {
      headlines: ['H1', 'H2', 'H3'],
      descriptions: ['Only one.'],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects more than 4 descriptions', () => {
    const input = {
      headlines: ['H1', 'H2', 'H3'],
      descriptions: ['D1', 'D2', 'D3', 'D4', 'D5'],
    }
    const result = rsaSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

// ─── Keywords Schema ───────────────────────────────────────────────

describe('keywordsSchema', () => {
  test('accepts valid keyword output', () => {
    const input = {
      keywords: [
        { text: 'rename files', match: 'exact' },
        { text: 'batch file renamer', match: 'phrase' },
        { text: 'file management tool', match: 'broad' },
      ],
    }
    const result = keywordsSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  test('rejects invalid match type', () => {
    const input = {
      keywords: [{ text: 'rename files', match: 'fuzzy' }],
    }
    const result = keywordsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('rejects keyword missing text', () => {
    const input = {
      keywords: [{ match: 'exact' }],
    }
    const result = keywordsSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  test('accepts empty keywords array', () => {
    const input = { keywords: [] }
    const result = keywordsSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})
