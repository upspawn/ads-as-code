import type { GoogleSearchCampaign, GoogleAdGroup, RSAd, BudgetInput } from '../google/types.ts'
import type { Keyword, Targeting } from '../core/types.ts'

// === Types ===

export type SuggestionType =
  | 'keyword-alignment'
  | 'missing-keyword'
  | 'negative-gap'
  | 'copy-quality'
  | 'structure'
  | 'cross-campaign'

export type Suggestion = {
  readonly type: SuggestionType
  readonly campaign: string
  readonly group?: string
  readonly message: string
  readonly suggestion?: string
  readonly severity: 'info' | 'warning'
}

export type AnalyzeResult = {
  readonly text: string
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number }
}

/** Signature matching Vercel AI SDK's generateText */
type GenerateTextFn = (opts: {
  model: unknown
  prompt: string
}) => Promise<{
  text: string
  usage: { promptTokens: number; completionTokens: number }
}>

// === Campaign Data Formatting ===

function formatBudget(budget: BudgetInput): string {
  return `${budget.currency} ${budget.amount}/${budget.period}`
}

function formatKeyword(kw: Keyword): string {
  return `"${kw.text}" (${kw.matchType.toLowerCase()})`
}

function formatTargeting(targeting: Targeting): string {
  const parts: string[] = []
  for (const rule of targeting.rules) {
    switch (rule.type) {
      case 'geo':
        parts.push(`Locations: ${rule.countries.join(', ')}`)
        break
      case 'language':
        parts.push(`Languages: ${rule.languages.join(', ')}`)
        break
      case 'schedule':
        if (rule.days) parts.push(`Days: ${rule.days.join(', ')}`)
        if (rule.startHour !== undefined && rule.endHour !== undefined) {
          parts.push(`Hours: ${rule.startHour}-${rule.endHour}`)
        }
        break
      case 'device':
        parts.push(`Device: ${rule.device} (bid adj: ${rule.bidAdjustment})`)
        break
      default:
        parts.push(`${rule.type}: (configured)`)
    }
  }
  return parts.join(', ')
}

function formatAdGroup(groupKey: string, group: GoogleAdGroup): string {
  const lines: string[] = []
  lines.push(`  Ad Group: ${groupKey}`)

  // Keywords
  if (group.keywords.length > 0) {
    lines.push('    Keywords:')
    for (const kw of group.keywords) {
      lines.push(`      - ${formatKeyword(kw)}`)
    }
  }

  // Ads
  for (const ad of group.ads) {
    if (ad.type === 'rsa') {
      const rsa = ad as RSAd
      lines.push('    RSA Ad:')
      lines.push(`      Headlines: ${rsa.headlines.join(' | ')}`)
      lines.push(`      Descriptions: ${rsa.descriptions.join(' | ')}`)
      lines.push(`      URL: ${rsa.finalUrl}`)
    }
  }

  // Group-level negatives
  if (group.negatives && group.negatives.length > 0) {
    lines.push('    Group Negatives:')
    for (const neg of group.negatives) {
      lines.push(`      - ${formatKeyword(neg)}`)
    }
  }

  return lines.join('\n')
}

function formatCampaignData(campaign: GoogleSearchCampaign): string {
  const lines: string[] = []
  lines.push(`Campaign: ${campaign.name}`)
  lines.push(`  Status: ${campaign.status}`)
  lines.push(`  Budget: ${formatBudget(campaign.budget)}`)
  lines.push(`  Bidding: ${campaign.bidding.type}`)
  lines.push(`  Targeting: ${formatTargeting(campaign.targeting)}`)

  if (campaign.negatives.length > 0) {
    lines.push('  Campaign Negatives:')
    for (const neg of campaign.negatives) {
      lines.push(`    - ${formatKeyword(neg)}`)
    }
  }

  for (const [key, group] of Object.entries(campaign.groups)) {
    lines.push(formatAdGroup(key, group))
  }

  return lines.join('\n')
}

// === Default Analysis Instructions ===

const DEFAULT_ANALYSIS = `
Analyze these Google Ads search campaigns and provide optimization suggestions.

Check for:
1. **Keyword-to-copy alignment**: Do the ad headlines and descriptions reference the keywords in each ad group? Flag keywords with no matching ad copy.
2. **Missing keywords**: Are there obvious keyword opportunities based on the existing ad copy and landing pages?
3. **Negative keyword gaps**: Are there search terms that would waste budget but aren't covered by negatives?
4. **Ad copy quality**: Are headlines and descriptions compelling, differentiated, and using best practices (CTAs, unique value props, numbers)?
5. **Structural suggestions**: Campaign/ad group organization, budget allocation, bidding strategy appropriateness.

Format each suggestion as a tagged block:

[SUGGESTION]
type: keyword-alignment | missing-keyword | negative-gap | copy-quality | structure | cross-campaign
campaign: <campaign name>
group: <ad group name (optional, omit if campaign-level)>
severity: warning | info
message: <what the issue is>
suggestion: <what to do about it (optional, omit if the message is self-explanatory)>
[/SUGGESTION]
`.trim()

const CROSS_ANALYSIS_INSTRUCTIONS = `
Analyze these Google Ads search campaigns as a portfolio. Look across all campaigns for:

1. **Keyword cannibalization**: Are multiple campaigns bidding on the same or overlapping keywords? This wastes budget by competing against yourself.
2. **Market coverage gaps**: Given the campaigns' themes, are there obvious market segments or keyword clusters not being targeted?
3. **Budget balance**: Is the budget allocation across campaigns proportional to their potential? Are high-potential campaigns under-funded?
4. **Negative keyword coordination**: Should campaign-level negatives in one campaign be informed by keywords in another?
5. **Cross-campaign structure**: Would consolidation or splitting campaigns improve performance?

Format each suggestion as a tagged block:

[SUGGESTION]
type: keyword-alignment | missing-keyword | negative-gap | copy-quality | structure | cross-campaign
campaign: <campaign name>
group: <ad group name (optional)>
severity: warning | info
message: <what the issue is>
suggestion: <what to do about it (optional)>
[/SUGGESTION]
`.trim()

// === Public API ===

/**
 * Build a prompt for optimizing one or more campaigns.
 *
 * Serializes campaign data into a structured text format and appends
 * analysis instructions. Custom and config prompts supplement the defaults.
 */
export function buildOptimizePrompt(
  campaigns: GoogleSearchCampaign[],
  customPrompt?: string,
  configPrompt?: string,
): string {
  const sections: string[] = []

  // Campaign data
  sections.push('=== Campaign Data ===')
  for (const campaign of campaigns) {
    sections.push(formatCampaignData(campaign))
    sections.push('') // blank line between campaigns
  }

  // Config-level prompt (project-wide context like brand voice)
  if (configPrompt) {
    sections.push('=== Project Context ===')
    sections.push(configPrompt)
  }

  // Custom prompt (user-provided override/supplement for this run)
  if (customPrompt) {
    sections.push('=== Additional Instructions ===')
    sections.push(customPrompt)
  }

  // Default analysis instructions
  sections.push('=== Analysis Instructions ===')
  sections.push(DEFAULT_ANALYSIS)

  return sections.join('\n\n')
}

/**
 * Build a prompt for cross-campaign analysis (--all mode).
 *
 * Includes all campaigns' data with a focus on inter-campaign issues:
 * cannibalization, coverage gaps, budget balance.
 */
export function buildCrossAnalysisPrompt(campaigns: GoogleSearchCampaign[]): string {
  const sections: string[] = []

  // All campaigns data
  sections.push('=== All Campaigns ===')
  for (const campaign of campaigns) {
    sections.push(formatCampaignData(campaign))
    sections.push('') // blank line between campaigns
  }

  // Keyword summary for easy comparison
  sections.push('=== Keyword Summary (for cannibalization check) ===')
  for (const campaign of campaigns) {
    sections.push(`Campaign: ${campaign.name}`)
    sections.push(`  Budget: ${formatBudget(campaign.budget)}`)
    for (const [key, group] of Object.entries(campaign.groups)) {
      const kwTexts = group.keywords.map((kw) => kw.text).join(', ')
      sections.push(`  ${key}: ${kwTexts}`)
    }
    sections.push('')
  }

  // Cross-analysis instructions
  sections.push('=== Analysis Instructions ===')
  sections.push(CROSS_ANALYSIS_INSTRUCTIONS)

  return sections.join('\n\n')
}

/**
 * Call the AI model with a prompt and return the response text + token usage.
 *
 * Uses Vercel AI SDK's generateText for free-form analysis output.
 * The generateTextFn is injectable for testing.
 */
export async function analyzeWithAI(
  model: unknown,
  prompt: string,
  options?: { generateTextFn?: GenerateTextFn },
): Promise<AnalyzeResult> {
  const gen = options?.generateTextFn ?? (await getDefaultGenerateText())
  const result = await gen({ model, prompt })
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
  }
}

/** Lazy import of the real AI SDK — keeps tests from needing it installed. */
async function getDefaultGenerateText(): Promise<GenerateTextFn> {
  const { generateText } = await import('ai')
  return generateText as unknown as GenerateTextFn
}

// === Response Parsing ===

const SUGGESTION_BLOCK_RE = /\[SUGGESTION\]([\s\S]*?)\[\/SUGGESTION\]/g
const FIELD_RE = /^(\w+):\s*(.+)$/

const VALID_TYPES = new Set<SuggestionType>([
  'keyword-alignment',
  'missing-keyword',
  'negative-gap',
  'copy-quality',
  'structure',
  'cross-campaign',
])

const VALID_SEVERITIES = new Set(['info', 'warning'])

/**
 * Parse an AI response into structured Suggestion objects.
 *
 * Expects [SUGGESTION]...[/SUGGESTION] tagged blocks with key: value fields.
 * Gracefully skips malformed blocks.
 */
export function parseOptimizeResponse(text: string): Suggestion[] {
  const suggestions: Suggestion[] = []

  for (const match of text.matchAll(SUGGESTION_BLOCK_RE)) {
    const block = match[1]!
    const fields = new Map<string, string>()

    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      const fieldMatch = FIELD_RE.exec(trimmed)
      if (fieldMatch) {
        fields.set(fieldMatch[1]!, fieldMatch[2]!.trim())
      }
    }

    // Required fields
    const type = fields.get('type') as SuggestionType | undefined
    const campaign = fields.get('campaign')
    const message = fields.get('message')
    const severity = fields.get('severity') as 'info' | 'warning' | undefined

    if (!type || !VALID_TYPES.has(type)) continue
    if (!campaign || !message) continue
    if (!severity || !VALID_SEVERITIES.has(severity)) continue

    // Optional fields
    const group = fields.get('group')
    const suggestion = fields.get('suggestion')

    suggestions.push({
      type,
      campaign,
      ...(group !== undefined && { group }),
      message,
      ...(suggestion !== undefined && { suggestion }),
      severity,
    })
  }

  return suggestions
}

// === Output Formatting ===

/** Human-readable label for each suggestion type. */
const TYPE_LABELS: Record<SuggestionType, string> = {
  'keyword-alignment': 'Keywords \u2192 Copy Alignment',
  'missing-keyword': 'Missing Keywords',
  'negative-gap': 'Negative Gaps',
  'copy-quality': 'Ad Copy Quality',
  'structure': 'Structure',
  'cross-campaign': 'Cross-Campaign',
}

/** Ordering for type sections within a campaign. */
const TYPE_ORDER: SuggestionType[] = [
  'keyword-alignment',
  'missing-keyword',
  'negative-gap',
  'copy-quality',
  'structure',
  'cross-campaign',
]

/**
 * Format suggestions for terminal output.
 *
 * Groups by campaign, then by suggestion type. Uses symbols:
 * - \u26A0 for warnings
 * - + for suggestions
 * - - for gaps
 */
export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return ''

  const lines: string[] = []

  // Group by campaign
  const byCampaign = new Map<string, Suggestion[]>()
  for (const s of suggestions) {
    const list = byCampaign.get(s.campaign) ?? []
    list.push(s)
    byCampaign.set(s.campaign, list)
  }

  // Sorted campaign names
  const campaignNames = [...byCampaign.keys()].sort()

  for (const campaignName of campaignNames) {
    const campaignSuggestions = byCampaign.get(campaignName)!

    // Campaign header bar
    const headerPad = '\u2501'.repeat(Math.max(1, 50 - campaignName.length))
    lines.push('')
    lines.push(`  \u2501\u2501 ${campaignName} ${headerPad}`)

    // Group by type within this campaign
    const byType = new Map<SuggestionType, Suggestion[]>()
    for (const s of campaignSuggestions) {
      const list = byType.get(s.type) ?? []
      list.push(s)
      byType.set(s.type, list)
    }

    // Output in type order
    for (const type of TYPE_ORDER) {
      const typeSuggestions = byType.get(type)
      if (!typeSuggestions) continue

      lines.push(`    ${TYPE_LABELS[type]}`)

      for (const s of typeSuggestions) {
        const prefix = s.severity === 'warning' ? '\u26A0' : '-'
        const groupTag = s.group ? ` [${s.group}]` : ''
        lines.push(`    ${prefix} ${s.message}${groupTag}`)

        if (s.suggestion) {
          lines.push(`      + ${s.suggestion}`)
        }
      }

      lines.push('') // blank line after each type section
    }
  }

  // Close with a footer bar and summary
  lines.push(`  ${'━'.repeat(54)}`)

  const warningCount = suggestions.filter((s) => s.severity === 'warning').length
  const parts: string[] = [`${suggestions.length} suggestions`]
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`)
  }
  lines.push(`    ${parts.join(' \u00B7 ')}`)

  return lines.join('\n')
}
