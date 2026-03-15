// ─── Meta Campaign Optimization Analysis ────────────────
// Builds prompts for AI-driven optimization of Meta campaigns.
// Follows the same pattern as optimize.ts (Google) but focuses
// on Meta-specific concerns: audience alignment, creative fatigue,
// interest relevance, placement coverage, and audience overlap.

import type { MetaCampaign, MetaAdSet } from '../meta/index.ts'
import type {
  MetaCreative,
  ImageAd,
  VideoAd,
  CarouselAd,
  MetaTargeting,
  MetaPlacements,
  InterestTarget,
} from '../meta/types.ts'
import type { Budget } from '../core/types.ts'
import type { SuggestionType, Suggestion } from './optimize.ts'

// ─── Meta-Specific Suggestion Types ──────────────────────

export type MetaSuggestionType =
  | SuggestionType
  | 'audience-alignment'
  | 'audience-overlap'
  | 'creative-fatigue'
  | 'interest-relevance'

export type MetaSuggestion = {
  readonly type: MetaSuggestionType
  readonly campaign: string
  readonly adSet?: string
  readonly message: string
  readonly suggestion?: string
  readonly severity: 'info' | 'warning'
}

// ─── Campaign Data Formatting ────────────────────────────

function formatBudget(budget: Budget): string {
  return `${budget.currency} ${budget.amount}/${budget.period}`
}

function formatTargeting(targeting: MetaTargeting): string {
  const parts: string[] = []

  // Geo
  if (targeting.geo.length > 0) {
    const countries = targeting.geo.flatMap((g) => g.countries)
    parts.push(`Geo: ${countries.join(', ')}`)
  }

  // Age
  if (targeting.age) {
    parts.push(`Age: ${targeting.age.min}-${targeting.age.max}`)
  }

  // Genders
  if (targeting.genders && targeting.genders.length > 0) {
    parts.push(`Genders: ${targeting.genders.join(', ')}`)
  }

  // Interests
  if (targeting.interests && targeting.interests.length > 0) {
    const names = targeting.interests.map((i) => i.name)
    parts.push(`Interests: ${names.join(', ')}`)
  }

  // Custom audiences
  if (targeting.customAudiences && targeting.customAudiences.length > 0) {
    parts.push(`Custom audiences: ${targeting.customAudiences.join(', ')}`)
  }

  // Excluded audiences
  if (targeting.excludedAudiences && targeting.excludedAudiences.length > 0) {
    parts.push(`Excluded audiences: ${targeting.excludedAudiences.join(', ')}`)
  }

  // Lookalike audiences
  if (targeting.lookalikeAudiences && targeting.lookalikeAudiences.length > 0) {
    parts.push(`Lookalike audiences: ${targeting.lookalikeAudiences.join(', ')}`)
  }

  // Advantage+
  if (targeting.advantageAudience) parts.push('Advantage+ audience: enabled')
  if (targeting.advantageDetailedTargeting) parts.push('Advantage+ detailed targeting: enabled')

  return parts.join(', ')
}

function formatPlacements(placements?: MetaPlacements): string {
  if (!placements || placements === 'automatic') return 'Automatic (Advantage+)'
  const platforms = placements.platforms?.join(', ') ?? 'all'
  const positions = placements.positions?.join(', ') ?? 'all positions'
  return `Manual: ${platforms} — ${positions}`
}

function formatCreativeSummary(creative: MetaCreative): string {
  switch (creative.format) {
    case 'image': {
      const img = creative as ImageAd
      return `[Image] ${img.headline} / ${img.primaryText.substring(0, 60)}...`
    }
    case 'video': {
      const vid = creative as VideoAd
      return `[Video] ${vid.headline} / ${vid.primaryText.substring(0, 60)}...`
    }
    case 'carousel': {
      const car = creative as CarouselAd
      return `[Carousel] ${car.cards.length} cards / ${car.primaryText.substring(0, 60)}...`
    }
    case 'collection':
      return `[Collection] ${creative.headline}`
    default:
      return `[${creative.format}]`
  }
}

function formatAdSet(adSet: MetaAdSet<any>, index: number): string {
  const lines: string[] = []
  lines.push(`  Ad Set ${index + 1}: ${adSet.name}`)
  lines.push(`    Targeting: ${formatTargeting(adSet.config.targeting)}`)

  if (adSet.config.optimization) {
    lines.push(`    Optimization: ${adSet.config.optimization}`)
  }

  if (adSet.config.placements) {
    lines.push(`    Placements: ${formatPlacements(adSet.config.placements)}`)
  }

  if (adSet.config.budget) {
    lines.push(`    Budget: ${formatBudget(adSet.config.budget)}`)
  }

  if (adSet.config.bidding) {
    lines.push(`    Bidding: ${adSet.config.bidding.type}`)
  }

  // Creative summary
  lines.push(`    Creatives (${adSet.content.ads.length}):`)
  for (const ad of adSet.content.ads) {
    lines.push(`      - ${formatCreativeSummary(ad)}`)
  }

  // Content-level defaults
  if (adSet.content.url) lines.push(`    URL: ${adSet.content.url}`)
  if (adSet.content.cta) lines.push(`    CTA: ${adSet.content.cta}`)

  return lines.join('\n')
}

function formatMetaCampaignData(campaign: MetaCampaign): string {
  const lines: string[] = []
  lines.push(`Campaign: ${campaign.name}`)
  lines.push(`  Objective: ${campaign.kind}`)

  if (campaign.config.budget) {
    lines.push(`  Budget: ${formatBudget(campaign.config.budget)}`)
  }

  if (campaign.config.status) {
    lines.push(`  Status: ${campaign.config.status}`)
  }

  for (let i = 0; i < campaign.adSets.length; i++) {
    lines.push(formatAdSet(campaign.adSets[i]!, i))
  }

  return lines.join('\n')
}

// ─── Default Analysis Instructions ───────────────────────

const DEFAULT_META_ANALYSIS = `
Analyze these Meta (Facebook/Instagram) campaigns and provide optimization suggestions.

Check for:
1. **Creative-to-audience alignment**: Does the ad copy (headline, primary text) match the targeting interests and audience? Flag mismatches where copy speaks to a different audience than what's targeted.
2. **Audience overlap**: Are multiple ad sets targeting overlapping audiences? This causes self-competition and inflates costs.
3. **Creative fatigue risk**: Does any ad set have too few creatives? Meta recommends 3-6 creatives per ad set for effective testing.
4. **Interest relevance**: Are the targeted interests actually related to the product being advertised? Flag interests that seem off-topic.
5. **Placement coverage**: Is the campaign using automatic placements (recommended) or is it over-restricting delivery with manual placements?
6. **Budget efficiency**: Is budget allocation across ad sets proportional to audience size potential? Are any ad sets under-funded relative to their audience?

Format each suggestion as a tagged block:

[SUGGESTION]
type: audience-alignment | audience-overlap | creative-fatigue | interest-relevance | copy-quality | structure | cross-campaign
campaign: <campaign name>
adSet: <ad set name (optional, omit if campaign-level)>
severity: warning | info
message: <what the issue is>
suggestion: <what to do about it (optional, omit if the message is self-explanatory)>
[/SUGGESTION]
`.trim()

const META_CROSS_ANALYSIS_INSTRUCTIONS = `
Analyze these Meta (Facebook/Instagram) campaigns as a portfolio. Look across all campaigns for:

1. **Audience overlap**: Are multiple campaigns or ad sets targeting the same people? This causes auction competition against yourself and inflates CPM/CPC.
2. **Creative diversity**: Across the portfolio, are the same creatives or messaging themes reused? This risks audience fatigue and reduces overall effectiveness.
3. **Budget balance**: Is the budget allocation across campaigns proportional to their opportunity? Are high-potential campaigns under-funded?
4. **Interest redundancy**: Are the same interests used across multiple campaigns without exclusion?
5. **Objective coordination**: Are campaign objectives aligned with funnel stages? A portfolio should have awareness → consideration → conversion progression.
6. **Audience exclusion gaps**: Should converters from one campaign be excluded from another to avoid wasted spend?

Format each suggestion as a tagged block:

[SUGGESTION]
type: audience-alignment | audience-overlap | creative-fatigue | interest-relevance | copy-quality | structure | cross-campaign
campaign: <campaign name>
adSet: <ad set name (optional)>
severity: warning | info
message: <what the issue is>
suggestion: <what to do about it (optional)>
[/SUGGESTION]
`.trim()

// ─── Public API ──────────────────────────────────────────

/**
 * Build a prompt for optimizing one or more Meta campaigns.
 *
 * Serializes campaign data into a structured text format and
 * appends Meta-specific analysis instructions.
 */
export function buildMetaOptimizePrompt(
  campaigns: MetaCampaign[],
  customPrompt?: string,
  configPrompt?: string,
): string {
  const sections: string[] = []

  // Campaign data
  sections.push('=== Meta Campaign Data ===')
  for (const campaign of campaigns) {
    sections.push(formatMetaCampaignData(campaign))
    sections.push('')
  }

  // Config-level prompt (project-wide context)
  if (configPrompt) {
    sections.push('=== Project Context ===')
    sections.push(configPrompt)
  }

  // Custom prompt
  if (customPrompt) {
    sections.push('=== Additional Instructions ===')
    sections.push(customPrompt)
  }

  // Default analysis instructions
  sections.push('=== Analysis Instructions ===')
  sections.push(DEFAULT_META_ANALYSIS)

  return sections.join('\n\n')
}

/**
 * Build a prompt for cross-campaign analysis of Meta campaigns.
 *
 * Includes all campaigns' data with a focus on inter-campaign issues:
 * audience overlap, creative diversity, budget balance, funnel coordination.
 */
export function buildMetaCrossAnalysisPrompt(campaigns: MetaCampaign[]): string {
  const sections: string[] = []

  // All campaigns data
  sections.push('=== All Meta Campaigns ===')
  for (const campaign of campaigns) {
    sections.push(formatMetaCampaignData(campaign))
    sections.push('')
  }

  // Audience summary for overlap check
  sections.push('=== Audience Summary (for overlap check) ===')
  for (const campaign of campaigns) {
    sections.push(`Campaign: ${campaign.name} (${campaign.kind})`)
    if (campaign.config.budget) {
      sections.push(`  Budget: ${formatBudget(campaign.config.budget)}`)
    }
    for (let i = 0; i < campaign.adSets.length; i++) {
      const adSet = campaign.adSets[i]!
      const targeting = adSet.config.targeting
      const interestNames = targeting.interests?.map((i) => i.name).join(', ') ?? 'none'
      const geoCountries = targeting.geo.flatMap((g) => g.countries).join(', ')
      const ageStr = targeting.age ? `${targeting.age.min}-${targeting.age.max}` : 'all'
      sections.push(`  ${adSet.name}: geo=${geoCountries}, age=${ageStr}, interests=${interestNames}`)
    }
    sections.push('')
  }

  // Cross-analysis instructions
  sections.push('=== Analysis Instructions ===')
  sections.push(META_CROSS_ANALYSIS_INSTRUCTIONS)

  return sections.join('\n\n')
}

// ─── Response Parsing ────────────────────────────────────

const SUGGESTION_BLOCK_RE = /\[SUGGESTION\]([\s\S]*?)\[\/SUGGESTION\]/g
const FIELD_RE = /^(\w+):\s*(.+)$/

const VALID_META_TYPES = new Set<MetaSuggestionType>([
  // Standard types (shared with Google)
  'copy-quality',
  'structure',
  'cross-campaign',
  // Meta-specific types
  'audience-alignment',
  'audience-overlap',
  'creative-fatigue',
  'interest-relevance',
])

const VALID_SEVERITIES = new Set(['info', 'warning'])

/**
 * Parse an AI response into structured MetaSuggestion objects.
 *
 * Accepts both standard suggestion types (copy-quality, structure)
 * and Meta-specific types (audience-alignment, audience-overlap, etc.).
 */
export function parseMetaOptimizeResponse(text: string): MetaSuggestion[] {
  const suggestions: MetaSuggestion[] = []

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
    const type = fields.get('type') as MetaSuggestionType | undefined
    const campaign = fields.get('campaign')
    const message = fields.get('message')
    const severity = fields.get('severity') as 'info' | 'warning' | undefined

    if (!type || !VALID_META_TYPES.has(type)) continue
    if (!campaign || !message) continue
    if (!severity || !VALID_SEVERITIES.has(severity)) continue

    // Optional fields — support both 'group' (Google) and 'adSet' (Meta)
    const adSet = fields.get('adSet') ?? fields.get('group')
    const suggestion = fields.get('suggestion')

    suggestions.push({
      type,
      campaign,
      ...(adSet !== undefined && { adSet }),
      message,
      ...(suggestion !== undefined && { suggestion }),
      severity,
    })
  }

  return suggestions
}

// ─── Output Formatting ──────────────────────────────────

const META_TYPE_LABELS: Record<MetaSuggestionType, string> = {
  'audience-alignment': 'Audience \u2192 Creative Alignment',
  'audience-overlap': 'Audience Overlap',
  'creative-fatigue': 'Creative Fatigue Risk',
  'interest-relevance': 'Interest Relevance',
  'copy-quality': 'Ad Copy Quality',
  'structure': 'Structure',
  'cross-campaign': 'Cross-Campaign',
  // Google types included for compatibility
  'keyword-alignment': 'Keywords \u2192 Copy Alignment',
  'missing-keyword': 'Missing Keywords',
  'negative-gap': 'Negative Gaps',
}

const META_TYPE_ORDER: MetaSuggestionType[] = [
  'audience-alignment',
  'audience-overlap',
  'creative-fatigue',
  'interest-relevance',
  'copy-quality',
  'structure',
  'cross-campaign',
]

/**
 * Format Meta suggestions for terminal output.
 *
 * Groups by campaign, then by suggestion type.
 */
export function formatMetaSuggestions(suggestions: MetaSuggestion[]): string {
  if (suggestions.length === 0) return ''

  const lines: string[] = []

  // Group by campaign
  const byCampaign = new Map<string, MetaSuggestion[]>()
  for (const s of suggestions) {
    const list = byCampaign.get(s.campaign) ?? []
    list.push(s)
    byCampaign.set(s.campaign, list)
  }

  const campaignNames = [...byCampaign.keys()].sort()

  for (const campaignName of campaignNames) {
    const campaignSuggestions = byCampaign.get(campaignName)!

    const headerPad = '\u2501'.repeat(Math.max(1, 50 - campaignName.length))
    lines.push('')
    lines.push(`  \u2501\u2501 ${campaignName} ${headerPad}`)

    // Group by type
    const byType = new Map<MetaSuggestionType, MetaSuggestion[]>()
    for (const s of campaignSuggestions) {
      const list = byType.get(s.type) ?? []
      list.push(s)
      byType.set(s.type, list)
    }

    for (const type of META_TYPE_ORDER) {
      const typeSuggestions = byType.get(type)
      if (!typeSuggestions) continue

      lines.push(`    ${META_TYPE_LABELS[type]}`)

      for (const s of typeSuggestions) {
        const prefix = s.severity === 'warning' ? '\u26A0' : '-'
        const adSetTag = s.adSet ? ` [${s.adSet}]` : ''
        lines.push(`    ${prefix} ${s.message}${adSetTag}`)

        if (s.suggestion) {
          lines.push(`      + ${s.suggestion}`)
        }
      }

      lines.push('')
    }
  }

  lines.push(`  ${'━'.repeat(54)}`)

  const warningCount = suggestions.filter((s) => s.severity === 'warning').length
  const parts: string[] = [`${suggestions.length} suggestions`]
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`)
  }
  lines.push(`    ${parts.join(' \u00B7 ')}`)

  return lines.join('\n')
}
