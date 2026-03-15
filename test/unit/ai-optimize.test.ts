import { describe, test, expect } from 'bun:test'
import type { GoogleSearchCampaign } from '../../src/google/types.ts'
import type { Budget, Keyword, Targeting, Headline, Description } from '../../src/core/types.ts'

// === Test Fixtures ===

const budget: Budget = { amount: 20, currency: 'EUR', period: 'daily' }

const targeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['US'] },
    { type: 'language', languages: ['en'] },
  ],
}

function kw(text: string, matchType: 'EXACT' | 'PHRASE' | 'BROAD'): Keyword {
  return { text, matchType }
}

function makeCampaign(overrides?: Partial<GoogleSearchCampaign>): GoogleSearchCampaign {
  return {
    provider: 'google',
    kind: 'search',
    name: 'Search - Dropbox',
    status: 'enabled',
    budget,
    bidding: { type: 'maximize-conversions' },
    targeting,
    negatives: [kw('free', 'BROAD'), kw('cheap', 'PHRASE')],
    groups: {
      'dropbox-automation': {
        keywords: [
          kw('automate dropbox', 'PHRASE'),
          kw('dropbox file renamer', 'EXACT'),
          kw('bulk rename dropbox', 'PHRASE'),
        ],
        ads: [{
          type: 'rsa' as const,
          headlines: [
            'Automate Dropbox Files' as Headline,
            'AI Renames PDFs' as Headline,
            'Try Free Today' as Headline,
          ],
          descriptions: [
            'Connect Dropbox. AI reads PDFs and renames them.' as Description,
            'Stop renaming files by hand. AI does it for you.' as Description,
          ],
          finalUrl: 'https://www.renamed.to/integrations/dropbox',
        }],
      },
      'dropbox-industry': {
        keywords: [
          kw('dropbox for law firm', 'PHRASE'),
          kw('dropbox document management', 'PHRASE'),
        ],
        ads: [{
          type: 'rsa' as const,
          headlines: [
            'Dropbox for Law Firms' as Headline,
            'Document Management' as Headline,
            'Auto-Name Client Docs' as Headline,
          ],
          descriptions: [
            'AI reads content, renames files. 3-minute setup.' as Description,
            'Save 10+ hrs/week. Custom templates per client.' as Description,
          ],
          finalUrl: 'https://www.renamed.to/integrations/dropbox',
        }],
      },
    },
    ...overrides,
  }
}

function makeCampaign2(): GoogleSearchCampaign {
  return {
    provider: 'google',
    kind: 'search',
    name: 'Search - Google Drive',
    status: 'enabled',
    budget: { amount: 15, currency: 'EUR', period: 'daily' },
    bidding: { type: 'maximize-clicks' },
    targeting,
    negatives: [kw('free', 'BROAD')],
    groups: {
      'drive-automation': {
        keywords: [
          kw('automate google drive', 'PHRASE'),
          kw('google drive file organizer', 'EXACT'),
        ],
        ads: [{
          type: 'rsa' as const,
          headlines: [
            'Organize Google Drive' as Headline,
            'AI-Powered Filing' as Headline,
            'Try Free Today' as Headline,
          ],
          descriptions: [
            'Connect Google Drive. AI organizes files automatically.' as Description,
            'Stop organizing files manually. AI handles it.' as Description,
          ],
          finalUrl: 'https://www.renamed.to/integrations/google-drive',
        }],
      },
    },
  }
}

// === Lazy imports (module under test) ===
// We import lazily so the test file can be parsed even if optimize.ts doesn't exist yet.

async function getModule() {
  return await import('../../src/ai/optimize.ts')
}

// ─── buildOptimizePrompt ───────────────────────────────────────────

describe('buildOptimizePrompt', () => {
  test('includes campaign name', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('Search - Dropbox')
  })

  test('includes keywords with match types', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('automate dropbox')
    expect(prompt).toContain('phrase')
    expect(prompt).toContain('dropbox file renamer')
    expect(prompt).toContain('exact')
  })

  test('includes ad copy headlines and descriptions', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('Automate Dropbox Files')
    expect(prompt).toContain('Connect Dropbox. AI reads PDFs and renames them.')
  })

  test('includes budget info', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('20')
    expect(prompt).toContain('EUR')
    expect(prompt).toContain('daily')
  })

  test('includes bidding strategy', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('maximize-conversions')
  })

  test('includes negatives', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('free')
    expect(prompt).toContain('cheap')
  })

  test('includes targeting info', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    expect(prompt).toContain('US')
    expect(prompt).toContain('en')
  })

  test('includes default analysis instructions', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign])

    // Should mention key analysis areas
    expect(prompt).toContain('keyword')
    expect(prompt).toContain('copy')
    expect(prompt).toContain('negative')
  })

  test('includes custom prompt when provided', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign], 'Focus on CPA optimization')

    expect(prompt).toContain('Focus on CPA optimization')
  })

  test('includes config prompt when provided', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt([campaign], undefined, 'Our brand voice is professional')

    expect(prompt).toContain('Our brand voice is professional')
  })

  test('includes both custom and config prompts', async () => {
    const { buildOptimizePrompt } = await getModule()
    const campaign = makeCampaign()
    const prompt = buildOptimizePrompt(
      [campaign],
      'Focus on CPA',
      'Brand voice: professional',
    )

    expect(prompt).toContain('Focus on CPA')
    expect(prompt).toContain('Brand voice: professional')
  })
})

// ─── buildCrossAnalysisPrompt ──────────────────────────────────────

describe('buildCrossAnalysisPrompt', () => {
  test('includes all campaign names', async () => {
    const { buildCrossAnalysisPrompt } = await getModule()
    const campaigns = [makeCampaign(), makeCampaign2()]
    const prompt = buildCrossAnalysisPrompt(campaigns)

    expect(prompt).toContain('Search - Dropbox')
    expect(prompt).toContain('Search - Google Drive')
  })

  test('includes keyword overlap / cannibalization section', async () => {
    const { buildCrossAnalysisPrompt } = await getModule()
    const campaigns = [makeCampaign(), makeCampaign2()]
    const prompt = buildCrossAnalysisPrompt(campaigns)

    // Should ask about keyword overlap between campaigns
    expect(prompt.toLowerCase()).toContain('cannibalization')
  })

  test('includes keywords from all campaigns', async () => {
    const { buildCrossAnalysisPrompt } = await getModule()
    const campaigns = [makeCampaign(), makeCampaign2()]
    const prompt = buildCrossAnalysisPrompt(campaigns)

    expect(prompt).toContain('automate dropbox')
    expect(prompt).toContain('automate google drive')
  })

  test('mentions budget balance across campaigns', async () => {
    const { buildCrossAnalysisPrompt } = await getModule()
    const campaigns = [makeCampaign(), makeCampaign2()]
    const prompt = buildCrossAnalysisPrompt(campaigns)

    expect(prompt.toLowerCase()).toContain('budget')
  })
})

// ─── parseOptimizeResponse ─────────────────────────────────────────

describe('parseOptimizeResponse', () => {
  test('extracts structured suggestions from tagged blocks', async () => {
    const { parseOptimizeResponse } = await getModule()

    const text = `
Here is my analysis:

[SUGGESTION]
type: keyword-alignment
campaign: Search - Dropbox
group: dropbox-automation
severity: warning
message: "bulk rename dropbox" (phrase) has no matching headline mentioning "bulk"
suggestion: Add headline: "Batch Rename Dropbox Files Instantly"
[/SUGGESTION]

[SUGGESTION]
type: negative-gap
campaign: Search - Dropbox
severity: info
message: No negatives for "dropbox pricing" — could waste budget
suggestion: Add negative: "dropbox pricing" (phrase)
[/SUGGESTION]
`

    const suggestions = parseOptimizeResponse(text)
    expect(suggestions).toHaveLength(2)

    expect(suggestions[0]!.type).toBe('keyword-alignment')
    expect(suggestions[0]!.campaign).toBe('Search - Dropbox')
    expect(suggestions[0]!.group).toBe('dropbox-automation')
    expect(suggestions[0]!.severity).toBe('warning')
    expect(suggestions[0]!.message).toContain('bulk rename dropbox')
    expect(suggestions[0]!.suggestion).toContain('Batch Rename')

    expect(suggestions[1]!.type).toBe('negative-gap')
    expect(suggestions[1]!.campaign).toBe('Search - Dropbox')
    expect(suggestions[1]!.severity).toBe('info')
    expect(suggestions[1]!.message).toContain('dropbox pricing')
  })

  test('handles response with no suggestions', async () => {
    const { parseOptimizeResponse } = await getModule()

    const text = 'Everything looks great! No suggestions.'
    const suggestions = parseOptimizeResponse(text)
    expect(suggestions).toHaveLength(0)
  })

  test('handles suggestion without optional group field', async () => {
    const { parseOptimizeResponse } = await getModule()

    const text = `
[SUGGESTION]
type: structure
campaign: Search - Dropbox
severity: info
message: Consider splitting this campaign into brand and non-brand segments
[/SUGGESTION]
`

    const suggestions = parseOptimizeResponse(text)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.group).toBeUndefined()
    expect(suggestions[0]!.suggestion).toBeUndefined()
  })

  test('handles cross-campaign suggestions', async () => {
    const { parseOptimizeResponse } = await getModule()

    const text = `
[SUGGESTION]
type: cross-campaign
campaign: Search - Dropbox
severity: warning
message: Keywords overlap with "Search - Google Drive" — "automate" appears in both
suggestion: Add negative in one campaign or consolidate ad groups
[/SUGGESTION]
`

    const suggestions = parseOptimizeResponse(text)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.type).toBe('cross-campaign')
  })
})

// ─── analyzeWithAI ─────────────────────────────────────────────────

describe('analyzeWithAI', () => {
  test('calls generateText and returns text + usage', async () => {
    const { analyzeWithAI } = await getModule()

    const mockModel = { modelId: 'gpt-4.1-mini' } as any
    const mockGenerateText = async () => ({
      text: 'Here are my suggestions...',
      usage: { promptTokens: 1000, completionTokens: 500 },
    })

    const result = await analyzeWithAI(mockModel, 'Analyze this campaign', {
      generateTextFn: mockGenerateText,
    })

    expect(result.text).toBe('Here are my suggestions...')
    expect(result.usage.promptTokens).toBe(1000)
    expect(result.usage.completionTokens).toBe(500)
  })
})

// ─── formatSuggestions ─────────────────────────────────────────────

describe('formatSuggestions', () => {
  test('produces terminal-friendly output grouped by campaign', async () => {
    const { formatSuggestions } = await getModule()
    const suggestions = [
      {
        type: 'keyword-alignment' as const,
        campaign: 'Search - Dropbox',
        group: 'dropbox-automation',
        message: '"bulk rename dropbox" has no matching headline',
        suggestion: 'Add headline: "Batch Rename Dropbox Files"',
        severity: 'warning' as const,
      },
      {
        type: 'negative-gap' as const,
        campaign: 'Search - Dropbox',
        message: 'No negatives for "dropbox pricing"',
        severity: 'info' as const,
      },
    ]

    const output = formatSuggestions(suggestions)

    // Should contain campaign header
    expect(output).toContain('Search - Dropbox')
    // Should contain warning symbol
    expect(output).toContain('\u26A0') // ⚠
    // Should contain suggestion marker
    expect(output).toContain('+')
    // Should contain gap marker
    expect(output).toContain('-')
    // Should contain the messages
    expect(output).toContain('bulk rename dropbox')
    expect(output).toContain('dropbox pricing')
  })

  test('groups by campaign then by suggestion type', async () => {
    const { formatSuggestions } = await getModule()
    const suggestions = [
      {
        type: 'keyword-alignment' as const,
        campaign: 'Campaign A',
        message: 'alignment issue',
        severity: 'warning' as const,
      },
      {
        type: 'negative-gap' as const,
        campaign: 'Campaign A',
        message: 'gap found',
        severity: 'info' as const,
      },
      {
        type: 'copy-quality' as const,
        campaign: 'Campaign B',
        message: 'copy issue',
        severity: 'warning' as const,
      },
    ]

    const output = formatSuggestions(suggestions)

    // Campaign A section should appear before Campaign B
    const posA = output.indexOf('Campaign A')
    const posB = output.indexOf('Campaign B')
    expect(posA).toBeLessThan(posB)
  })

  test('returns empty string for empty suggestions', async () => {
    const { formatSuggestions } = await getModule()
    const output = formatSuggestions([])
    expect(output).toBe('')
  })

  test('includes summary line with counts', async () => {
    const { formatSuggestions } = await getModule()
    const suggestions = [
      {
        type: 'keyword-alignment' as const,
        campaign: 'Campaign A',
        message: 'issue 1',
        severity: 'warning' as const,
      },
      {
        type: 'negative-gap' as const,
        campaign: 'Campaign A',
        message: 'issue 2',
        severity: 'info' as const,
      },
    ]

    const output = formatSuggestions(suggestions)

    expect(output).toContain('2 suggestions')
    expect(output).toContain('1 warning')
  })
})
