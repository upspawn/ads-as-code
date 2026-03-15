// === Prompt Compilation ===
// Assembles final LLM prompts from markers + runtime context.
// Pure functions — no side effects, no API calls.

import type { InterestsMarker, MetaCopyMarker, RsaMarker, KeywordsMarker } from './types.ts'

// ─── Context Types ─────────────────────────────────────────

export type RsaPromptContext = {
  readonly campaignName?: string
  readonly adGroupKey?: string
  readonly defaultJudge?: string
}

export type MetaPromptContext = {
  readonly campaignName?: string
  readonly adSetKey?: string
  readonly defaultJudge?: string
}

// ─── Constraint Blocks ─────────────────────────────────────

const RSA_CONSTRAINTS = `
RSA ad copy constraints:
- Headlines: at most 30 characters each, 3-15 headlines required
- Descriptions: at most 90 characters each, 2-4 descriptions required
- Each headline and description must be unique
- Avoid excessive punctuation or ALL CAPS
- Include keywords naturally where possible`.trim()

const KEYWORDS_CONSTRAINTS = `
Google Ads keyword generation guidance:
- Include a mix of match types (EXACT, PHRASE, BROAD)
- Keywords should be relevant to the ad group theme
- Include both short-tail and long-tail variations
- Avoid overly generic or broad terms that waste budget`.trim()

const META_AD_CONSTRAINTS = `
Meta Ads copy constraints:
- primaryText: main ad body, at most 125 characters (recommended visible length)
- headline: at most 40 characters
- description (optional): at most 30 characters
- Be concise and compelling. Primary text shows first in the feed.
- Avoid excessive punctuation or ALL CAPS`.trim()

const INTERESTS_CONSTRAINTS = `
Meta Ads interest targeting guidance:
- Suggest interest names that match Meta's targeting categories
- Each interest should be a recognizable category (e.g., "Small business", "Cloud computing", "File management")
- Include a mix of broad and niche interests
- Return interest names only (IDs are resolved separately)`.trim()

// ─── Shared Helpers ────────────────────────────────────────

/** Build lines describing placement context (campaign name, ad group/set key). */
function contextLines(campaignName?: string, groupKey?: string, groupLabel = 'Ad group'): string[] {
  const lines: string[] = []
  if (campaignName) lines.push(`Campaign: ${campaignName}`)
  if (groupKey) lines.push(`${groupLabel}: ${groupKey}`)
  return lines
}

/** Build lines for structured product/audience/tone fields. */
function structuredLines(structured?: { product?: string; audience?: string; tone?: string }): string[] {
  if (!structured) return []
  const lines: string[] = []
  if (structured.product) lines.push(`Product: ${structured.product}`)
  if (structured.audience) lines.push(`Audience: ${structured.audience}`)
  if (structured.tone) lines.push(`Tone: ${structured.tone}`)
  return lines
}

/** Resolve which judge prompt to use (marker-level overrides context default). */
function resolveJudge(markerJudge?: string, defaultJudge?: string): string | undefined {
  return markerJudge ?? defaultJudge
}

/** Assemble final prompt from sections, filtering out empty ones. */
function assemble(sections: string[]): string {
  return sections.filter(Boolean).join('\n\n')
}

// ─── Google RSA ────────────────────────────────────────────

/**
 * Compile an RSA marker + runtime context into a final LLM prompt string.
 */
export function compileRsaPrompt(marker: RsaMarker, context: RsaPromptContext = {}): string {
  const ctx = contextLines(context.campaignName, context.adGroupKey)
  const stLines = structuredLines(marker.structured)
  const judge = resolveJudge(marker.judge, context.defaultJudge)

  return assemble([
    marker.prompt,
    RSA_CONSTRAINTS,
    ctx.length > 0 ? ctx.join('\n') : '',
    stLines.length > 0 ? stLines.join('\n') : '',
    judge ? `Judge criteria: ${judge}` : '',
  ])
}

// ─── Google Keywords ───────────────────────────────────────

/**
 * Compile a keywords marker + runtime context into a final LLM prompt string.
 */
export function compileKeywordsPrompt(marker: KeywordsMarker, context: RsaPromptContext = {}): string {
  const ctx = contextLines(context.campaignName, context.adGroupKey)

  return assemble([
    marker.prompt,
    KEYWORDS_CONSTRAINTS,
    ctx.length > 0 ? ctx.join('\n') : '',
  ])
}

// ─── Meta Copy ─────────────────────────────────────────────

/**
 * Compile a Meta copy marker + runtime context into a final LLM prompt string.
 */
export function compileMetaCopyPrompt(marker: MetaCopyMarker, context: MetaPromptContext = {}): string {
  const ctx = contextLines(context.campaignName, context.adSetKey, 'Ad set')
  const stLines = structuredLines(marker.structured)
  const judge = resolveJudge(marker.judge, context.defaultJudge)

  return assemble([
    marker.prompt,
    META_AD_CONSTRAINTS,
    ctx.length > 0 ? ctx.join('\n') : '',
    stLines.length > 0 ? stLines.join('\n') : '',
    judge ? `Judge criteria: ${judge}` : '',
  ])
}

// ─── Meta Interests ────────────────────────────────────────

/**
 * Compile an interests marker + runtime context into a final LLM prompt string.
 */
export function compileInterestsPrompt(marker: InterestsMarker, context: MetaPromptContext = {}): string {
  const ctx = contextLines(context.campaignName, context.adSetKey, 'Ad set')

  return assemble([
    marker.prompt,
    INTERESTS_CONSTRAINTS,
    ctx.length > 0 ? ctx.join('\n') : '',
  ])
}
