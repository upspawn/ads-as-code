import { describe, expect, test } from 'bun:test'
import { compileRsaPrompt, compileKeywordsPrompt, compileJudgePrompt } from '../../src/ai/prompt.ts'
import type { RsaMarker, KeywordsMarker } from '../../src/ai/types.ts'
import type { Keyword } from '../../src/core/types.ts'
import type { PromptContext } from '../../src/ai/prompt.ts'

// ─── Fixtures ───────────────────────────────────────────────────────

function makeRsaMarker(overrides?: Partial<Omit<RsaMarker, '__brand' | 'type'>>): RsaMarker {
  return {
    __brand: 'ai-marker',
    type: 'rsa',
    prompt: 'Generate RSA headlines and descriptions.',
    ...overrides,
  }
}

function makeKeywordsMarker(overrides?: Partial<Omit<KeywordsMarker, '__brand' | 'type'>>): KeywordsMarker {
  return {
    __brand: 'ai-marker',
    type: 'keywords',
    prompt: 'Find keywords for a file renaming tool.',
    ...overrides,
  }
}

const sampleKeywords: Keyword[] = [
  { text: 'rename files', matchType: 'EXACT' },
  { text: 'batch rename', matchType: 'PHRASE' },
  { text: 'file renamer', matchType: 'BROAD' },
]

// ─── compileRsaPrompt ──────────────────────────────────────────────

describe('compileRsaPrompt()', () => {
  test('raw string prompt passes through with context appended', () => {
    const marker = makeRsaMarker({ prompt: 'Write creative ad copy for Renamed.' })
    const result = compileRsaPrompt(marker, {})

    expect(result).toContain('Write creative ad copy for Renamed.')
    expect(result).toContain('headline')
    expect(result).toContain('30')
    expect(result).toContain('description')
    expect(result).toContain('90')
  })

  test('structured input compiles to prompt containing product/audience/tone', () => {
    const marker = makeRsaMarker({
      prompt: '',
      structured: { product: 'Renamed', audience: 'developers', tone: 'professional' },
    })
    const result = compileRsaPrompt(marker, {})

    expect(result).toContain('Renamed')
    expect(result).toContain('developers')
    expect(result).toContain('professional')
  })

  test('mixed input merges both prompt and structured fields', () => {
    const marker = makeRsaMarker({
      prompt: 'Be creative and punchy.',
      structured: { product: 'Renamed', audience: 'power users' },
    })
    const result = compileRsaPrompt(marker, {})

    expect(result).toContain('Be creative and punchy.')
    expect(result).toContain('Renamed')
    expect(result).toContain('power users')
  })

  test('context injection includes keywords when provided', () => {
    const marker = makeRsaMarker()
    const result = compileRsaPrompt(marker, { keywords: sampleKeywords })

    expect(result).toContain('rename files')
    expect(result).toContain('batch rename')
    expect(result).toContain('file renamer')
  })

  test('context injection includes Google Ads RSA constraints', () => {
    const marker = makeRsaMarker()
    const result = compileRsaPrompt(marker, {})

    // Headline constraints
    expect(result).toMatch(/headline.*30/i)
    expect(result).toMatch(/3.*15.*headline/i)
    // Description constraints
    expect(result).toMatch(/description.*90/i)
    expect(result).toMatch(/2.*4.*description/i)
  })

  test('campaign name included in context', () => {
    const marker = makeRsaMarker()
    const result = compileRsaPrompt(marker, { campaignName: 'Search - PDF Tools' })

    expect(result).toContain('Search - PDF Tools')
  })

  test('group key included in context', () => {
    const marker = makeRsaMarker()
    const result = compileRsaPrompt(marker, { groupKey: 'en-us' })

    expect(result).toContain('en-us')
  })

  test('empty/undefined structured fields are skipped', () => {
    const marker = makeRsaMarker({
      prompt: 'base prompt',
      structured: { product: 'Renamed' },
    })
    const result = compileRsaPrompt(marker, {})

    expect(result).toContain('Renamed')
    // Should not contain "undefined" or "Audience:" with no value
    expect(result).not.toContain('undefined')
  })

  test('empty context does not add campaign/group sections', () => {
    const marker = makeRsaMarker({ prompt: 'simple prompt' })
    const result = compileRsaPrompt(marker, {})

    // Should still have constraints but not campaign/group-specific sections
    expect(result).toContain('simple prompt')
    expect(result).not.toContain('Campaign:')
    expect(result).not.toContain('Group:')
  })
})

// ─── compileKeywordsPrompt ─────────────────────────────────────────

describe('compileKeywordsPrompt()', () => {
  test('prompt passes through with keyword constraints appended', () => {
    const marker = makeKeywordsMarker()
    const result = compileKeywordsPrompt(marker, {})

    expect(result).toContain('Find keywords for a file renaming tool.')
    // Should contain match type guidance
    expect(result).toMatch(/exact|phrase|broad/i)
  })

  test('campaign name included in context', () => {
    const marker = makeKeywordsMarker()
    const result = compileKeywordsPrompt(marker, { campaignName: 'Search - PDF' })

    expect(result).toContain('Search - PDF')
  })

  test('existing keywords included as context', () => {
    const marker = makeKeywordsMarker()
    const result = compileKeywordsPrompt(marker, { keywords: sampleKeywords })

    expect(result).toContain('rename files')
    expect(result).toContain('batch rename')
  })
})

// ─── compileJudgePrompt ────────────────────────────────────────────

describe('compileJudgePrompt()', () => {
  test('returns local judge when only local is provided', () => {
    const result = compileJudgePrompt('Be strict about quality.')
    expect(result).toBe('Be strict about quality.')
  })

  test('returns default judge when only default is provided', () => {
    const result = compileJudgePrompt(undefined, 'Global quality standard.')
    expect(result).toBe('Global quality standard.')
  })

  test('merges global first then local appended', () => {
    const result = compileJudgePrompt('Also check tone.', 'Global quality standard.')
    expect(result).toBe('Global quality standard.\n\nAlso check tone.')
  })

  test('returns undefined when both are undefined', () => {
    const result = compileJudgePrompt(undefined, undefined)
    expect(result).toBeUndefined()
  })

  test('returns undefined when both are empty strings', () => {
    const result = compileJudgePrompt('', '')
    expect(result).toBeUndefined()
  })
})
