import type { RsaMarker, KeywordsMarker } from './types.ts'
import type { Keyword } from '../core/types.ts'

// === Types ===

export type PromptContext = {
  readonly campaignName?: string
  readonly groupKey?: string
  readonly keywords?: Keyword[]
  readonly defaultJudge?: string
}

// === RSA Constraints ===

const RSA_CONSTRAINTS = `
Google Ads RSA constraints:
- Provide 3 to 15 headlines, each at most 30 characters
- Provide 2 to 4 descriptions, each at most 90 characters
- Headlines and descriptions must be unique (no duplicates)
- Avoid excessive punctuation or ALL CAPS`.trim()

// === Keyword Constraints ===

const KEYWORD_CONSTRAINTS = `
Google Ads keyword guidance:
- Each keyword has a match type: "exact", "phrase", or "broad"
- Exact match: triggers only for that precise query (highest precision)
- Phrase match: triggers when the query contains the phrase (balanced)
- Broad match: triggers for related queries (widest reach)
- Return a mix of match types unless instructed otherwise`.trim()

// === Helpers ===

function formatKeywordsContext(keywords: Keyword[]): string {
  if (keywords.length === 0) return ''
  const lines = keywords.map((kw) => `  - "${kw.text}" (${kw.matchType.toLowerCase()})`)
  return `\nExisting keywords in this ad group:\n${lines.join('\n')}`
}

function formatCampaignContext(ctx: PromptContext): string {
  const parts: string[] = []
  if (ctx.campaignName) parts.push(`Campaign: ${ctx.campaignName}`)
  if (ctx.groupKey) parts.push(`Ad group: ${ctx.groupKey}`)
  if (parts.length === 0) return ''
  return '\n' + parts.join('\n')
}

function formatStructuredFields(structured: RsaMarker['structured']): string {
  if (!structured) return ''
  const parts: string[] = []
  if (structured.product) parts.push(`Product: ${structured.product}`)
  if (structured.audience) parts.push(`Target audience: ${structured.audience}`)
  if (structured.tone) parts.push(`Tone: ${structured.tone}`)
  if (parts.length === 0) return ''
  return parts.join('\n')
}

// === Public API ===

/**
 * Compile a full prompt for RSA generation from a marker and context.
 *
 * Combines: user prompt + structured fields + campaign context + RSA constraints.
 */
export function compileRsaPrompt(marker: RsaMarker, context: PromptContext): string {
  const sections: string[] = []

  // User-provided prompt (raw string)
  if (marker.prompt) {
    sections.push(marker.prompt)
  }

  // Structured fields (product/audience/tone)
  const structured = formatStructuredFields(marker.structured)
  if (structured) {
    sections.push(structured)
  }

  // Campaign/group context
  const campaignCtx = formatCampaignContext(context)
  if (campaignCtx) {
    sections.push(campaignCtx.trim())
  }

  // Keyword context from the ad group
  if (context.keywords && context.keywords.length > 0) {
    sections.push(formatKeywordsContext(context.keywords).trim())
  }

  // RSA constraints are always appended
  sections.push(RSA_CONSTRAINTS)

  return sections.join('\n\n')
}

/**
 * Compile a full prompt for keyword generation from a marker and context.
 *
 * Combines: user prompt + campaign context + existing keywords + keyword constraints.
 */
export function compileKeywordsPrompt(marker: KeywordsMarker, context: PromptContext): string {
  const sections: string[] = []

  // User-provided prompt
  if (marker.prompt) {
    sections.push(marker.prompt)
  }

  // Campaign/group context
  const campaignCtx = formatCampaignContext(context)
  if (campaignCtx) {
    sections.push(campaignCtx.trim())
  }

  // Existing keywords for context
  if (context.keywords && context.keywords.length > 0) {
    sections.push(formatKeywordsContext(context.keywords).trim())
  }

  // Keyword constraints are always appended
  sections.push(KEYWORD_CONSTRAINTS)

  return sections.join('\n\n')
}

/**
 * Merge local judge prompt with global default judge prompt.
 *
 * Global comes first, local is appended. Returns undefined if both are empty.
 */
export function compileJudgePrompt(localJudge?: string, defaultJudge?: string): string | undefined {
  const global = defaultJudge?.trim() || ''
  const local = localJudge?.trim() || ''

  if (!global && !local) return undefined
  if (!global) return local
  if (!local) return global

  return `${global}\n\n${local}`
}
