// ─── Codegen: Expanded Campaign Files ───────────────────
// Generates standalone TypeScript campaign files from AI-produced
// campaign data. Each file is fully resolved — no imports from seed,
// no AI markers. Uses the same SDK helpers as hand-written campaigns.

// ─── Types ──────────────────────────────────────────────

export type ExpandedKeyword = {
  readonly text: string
  readonly matchType: 'EXACT' | 'PHRASE' | 'BROAD'
}

export type ExpandedAd = {
  readonly headlines: string[]
  readonly descriptions: string[]
  readonly finalUrl: string
}

export type ExpandedAdGroup = {
  readonly key: string
  readonly keywords: ExpandedKeyword[]
  readonly ad: ExpandedAd
}

export type ExpandedCampaignData = {
  name: string
  budget: { amount: number; currency: string; period: string }
  bidding: { type: string; [key: string]: unknown }
  targeting: { rules: Array<{ type: string; [key: string]: unknown }> }
  negatives: ExpandedKeyword[]
  groups: ExpandedAdGroup[]
}

// ─── Helpers ────────────────────────────────────────────

function quote(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`
}

function matchTypeHelper(matchType: string): string {
  switch (matchType) {
    case 'EXACT': return 'exact'
    case 'PHRASE': return 'phrase'
    case 'BROAD': return 'broad'
    default: return 'exact'
  }
}

function formatBudget(budget: ExpandedCampaignData['budget']): string {
  const fn = budget.period === 'monthly' ? 'monthly' : 'daily'
  if (budget.currency === 'EUR') {
    return `${fn}(${budget.amount})`
  }
  return `${fn}(${budget.amount}, ${quote(budget.currency)})`
}

function formatBidding(bidding: ExpandedCampaignData['bidding']): string {
  switch (bidding.type) {
    case 'maximize-conversions':
      return `'maximize-conversions'`
    case 'maximize-clicks': {
      const maxCpc = bidding.maxCpc as number | undefined
      if (maxCpc) return `{ type: 'maximize-clicks', maxCpc: ${maxCpc} }`
      return `'maximize-clicks'`
    }
    case 'manual-cpc': {
      const enhanced = bidding.enhancedCpc as boolean | undefined
      if (enhanced) return `{ type: 'manual-cpc', enhancedCpc: true }`
      return `'manual-cpc'`
    }
    case 'target-cpa':
      return `{ type: 'target-cpa', targetCpa: ${bidding.targetCpa} }`
    case 'target-roas':
      return `{ type: 'target-roas', targetRoas: ${bidding.targetRoas} }`
    default:
      return `'${bidding.type}'`
  }
}

function formatTargeting(rules: Array<{ type: string; [key: string]: unknown }>): {
  code: string | null
  imports: Set<string>
} {
  const imports = new Set<string>()
  const parts: string[] = []

  for (const rule of rules) {
    if (rule.type === 'geo') {
      const countries = rule.countries as string[]
      parts.push(`geo(${countries.map(quote).join(', ')})`)
      imports.add('geo')
    } else if (rule.type === 'language') {
      const langs = rule.languages as string[]
      parts.push(`languages(${langs.map(quote).join(', ')})`)
      imports.add('languages')
    } else if (rule.type === 'schedule') {
      const days = rule.days as string[] | undefined
      const startHour = rule.startHour as number | undefined
      const endHour = rule.endHour as number | undefined
      if (days) {
        if (
          days.length === 5 &&
          ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => days.includes(d))
        ) {
          parts.push('weekdays()')
          imports.add('weekdays')
        }
      }
      if (startHour !== undefined && endHour !== undefined) {
        parts.push(`hours(${startHour}, ${endHour})`)
        imports.add('hours')
      }
    }
  }

  if (parts.length === 0) return { code: null, imports }
  imports.add('targeting')
  return { code: `targeting(${parts.join(', ')})`, imports }
}

function formatStringList(items: string[]): string {
  if (items.length <= 3) {
    return items.map(quote).join(', ')
  }
  return '\n        ' + items.map((s) => `${quote(s)},`).join('\n        ') + '\n      '
}

// Group keywords by match type for compact codegen
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

// ─── Main Codegen ───────────────────────────────────────

/**
 * Generate a standalone TypeScript campaign file from expanded campaign data.
 *
 * The output uses SDK helpers (google.search, exact, phrase, broad,
 * headlines, descriptions, rsa, url, daily, monthly, geo, languages, etc.)
 * and is fully self-contained — no imports from the seed.
 */
export function generateExpandedCode(
  _seedName: string,
  data: ExpandedCampaignData,
  variantSuffix: string,
): string {
  const campaignName = `${data.name} ${variantSuffix}`
  const imports = new Set<string>(['google'])

  // Budget
  const budgetStr = formatBudget(data.budget)
  imports.add(data.budget.period === 'monthly' ? 'monthly' : 'daily')

  // Bidding
  const biddingStr = formatBidding(data.bidding)

  // Targeting
  const targetingResult = formatTargeting(data.targeting.rules)
  for (const imp of targetingResult.imports) imports.add(imp)

  // Config parts
  const configParts: string[] = []
  configParts.push(`budget: ${budgetStr},`)
  configParts.push(`bidding: ${biddingStr},`)
  if (targetingResult.code) {
    configParts.push(`targeting: ${targetingResult.code},`)
  }

  // Negatives
  if (data.negatives.length > 0) {
    const negByType = groupBy(data.negatives, (n) => n.matchType)
    const negParts: string[] = []
    for (const [matchType, negs] of Object.entries(negByType)) {
      const helper = matchTypeHelper(matchType)
      imports.add(helper)
      const texts = negs.map((n) => n.text)
      negParts.push(`...${helper}(${formatStringList(texts)})`)
    }
    configParts.push(`negatives: [${negParts.join(', ')}],`)
  }

  // Groups
  const groupLines: string[] = []
  for (const group of data.groups) {
    const kwByType = groupBy(group.keywords, (k) => k.matchType)
    const kwParts: string[] = []
    for (const [matchType, kws] of Object.entries(kwByType)) {
      const helper = matchTypeHelper(matchType)
      imports.add(helper)
      const texts = kws.map((k) => k.text)
      kwParts.push(`...${helper}(${formatStringList(texts)})`)
    }
    const keywordsLine = `keywords: [${kwParts.join(', ')}],`

    // Ad
    imports.add('rsa')
    imports.add('headlines')
    imports.add('descriptions')
    imports.add('url')

    const hl = group.ad.headlines
    const desc = group.ad.descriptions

    const headlinesStr =
      hl.length <= 3
        ? `headlines(${hl.map(quote).join(', ')})`
        : `headlines(\n        ${hl.map(quote).join(',\n        ')},\n      )`
    const descriptionsStr =
      desc.length <= 2
        ? `descriptions(${desc.map(quote).join(', ')})`
        : `descriptions(\n        ${desc.map(quote).join(',\n        ')},\n      )`

    const adLine = `ad: rsa(\n      ${headlinesStr},\n      ${descriptionsStr},\n      url(${quote(group.ad.finalUrl)}),\n    ),`

    groupLines.push(`  .group(${quote(group.key)}, {\n    ${keywordsLine}\n    ${adLine}\n  })`)
  }

  // Compose import statement
  const importList = Array.from(imports).sort()
  const lines: string[] = []
  lines.push(`import { ${importList.join(', ')} } from '@upspawn/ads'`)
  lines.push('')
  lines.push(`export default google.search(${quote(campaignName)}, {`)
  for (const part of configParts) {
    lines.push(`  ${part}`)
  }
  lines.push(`})`)
  for (const gl of groupLines) {
    lines.push(gl)
  }
  lines.push('')

  return lines.join('\n')
}
