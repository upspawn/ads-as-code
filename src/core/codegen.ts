import type { Resource } from './types.ts'
import { slugify } from './flatten.ts'

// ─── Filename ────────────────────────────────────────────

/** Convert a campaign name to a valid filename slug. */
export function campaignToFilename(name: string): string {
  return slugify(name)
}

// ─── Helpers ─────────────────────────────────────────────

function indent(text: string, level: number): string {
  const prefix = '  '.repeat(level)
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : ''))
    .join('\n')
}

function quote(s: string): string {
  // Use single quotes, escape any single quotes in the string
  return `'${s.replace(/'/g, "\\'")}'`
}

function formatStringList(items: string[]): string {
  if (items.length <= 3) {
    return items.map(quote).join(', ')
  }
  // Multi-line for readability
  return '\n' + items.map((s) => `    ${quote(s)},`).join('\n') + '\n  '
}

// ─── Match Type Helpers ──────────────────────────────────

function matchTypeHelper(matchType: string): string {
  switch (matchType) {
    case 'EXACT':
      return 'exact'
    case 'PHRASE':
      return 'phrase'
    case 'BROAD':
      return 'broad'
    default:
      return 'exact'
  }
}

// ─── Bidding ─────────────────────────────────────────────

function formatBidding(bidding: Record<string, unknown>): string {
  const type = bidding.type as string
  switch (type) {
    case 'maximize-conversions':
      return `'maximize-conversions'`
    case 'maximize-clicks': {
      const maxCpc = bidding.maxCpc as number | undefined
      if (maxCpc) {
        return `{ type: 'maximize-clicks', maxCpc: ${maxCpc} }`
      }
      return `'maximize-clicks'`
    }
    case 'manual-cpc': {
      const enhanced = bidding.enhancedCpc as boolean | undefined
      if (enhanced) {
        return `{ type: 'manual-cpc', enhancedCpc: true }`
      }
      return `'manual-cpc'`
    }
    case 'target-cpa':
      return `{ type: 'target-cpa', targetCpa: ${bidding.targetCpa} }`
    case 'target-roas':
      return `{ type: 'target-roas', targetRoas: ${bidding.targetRoas} }`
    case 'target-impression-share': {
      const tisParts = [
        `type: 'target-impression-share'`,
        `location: '${bidding.location}'`,
        `targetPercent: ${bidding.targetPercent}`,
      ]
      if (bidding.maxCpc) tisParts.push(`maxCpc: ${bidding.maxCpc}`)
      return `{ ${tisParts.join(', ')} }`
    }
    case 'maximize-conversion-value': {
      const roas = bidding.targetRoas as number | undefined
      if (roas) {
        return `{ type: 'maximize-conversion-value', targetRoas: ${roas} }`
      }
      return `'maximize-conversion-value'`
    }
    default:
      return `'${type}'`
  }
}

// ─── Budget ──────────────────────────────────────────────

function formatBudget(budget: Record<string, unknown>): string {
  const amount = budget.amount as number
  const currency = budget.currency as string
  const period = budget.period as string

  if (period === 'daily') {
    if (currency === 'EUR') {
      return `daily(${amount})`
    }
    return `daily(${amount}, '${currency}')`
  }
  if (period === 'monthly') {
    if (currency === 'EUR') {
      return `monthly(${amount})`
    }
    return `monthly(${amount}, '${currency}')`
  }
  return `daily(${amount})`
}

// ─── Targeting ───────────────────────────────────────────

function formatTargeting(targeting: Record<string, unknown>): string | null {
  const rules = targeting.rules as Array<Record<string, unknown>> | undefined
  if (!rules || rules.length === 0) return null

  const parts: string[] = []
  for (const rule of rules) {
    const type = rule.type as string
    if (type === 'geo') {
      const countries = rule.countries as string[]
      parts.push(`geo(${countries.map(quote).join(', ')})`)
    } else if (type === 'language') {
      const langs = rule.languages as string[]
      parts.push(`languages(${langs.map(quote).join(', ')})`)
    } else if (type === 'schedule') {
      const days = rule.days as string[] | undefined
      const startHour = rule.startHour as number | undefined
      const endHour = rule.endHour as number | undefined
      if (days) {
        if (
          days.length === 5 &&
          ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => days.includes(d))
        ) {
          parts.push('weekdays()')
        }
      }
      if (startHour !== undefined && endHour !== undefined) {
        parts.push(`hours(${startHour}, ${endHour})`)
      }
    } else if (type === 'device') {
      const deviceType = rule.device as string
      const bidAdj = rule.bidAdjustment as number
      parts.push(`device('${deviceType}', ${bidAdj})`)
    }
  }

  if (parts.length === 0) return null
  return `targeting(${parts.join(', ')})`
}

// ─── Codegen: Single Campaign ────────────────────────────

/**
 * Takes a flat Resource[] for ONE campaign and generates idiomatic TypeScript source.
 * The generated code uses SDK helpers (exact, headlines, descriptions, google.search, daily, url, etc.)
 */
export function generateCampaignFile(resources: Resource[], campaignName: string): string {
  const today = new Date().toISOString().split('T')[0]

  // Partition resources by kind
  const campaign = resources.find((r) => r.kind === 'campaign')
  const adGroups = resources.filter((r) => r.kind === 'adGroup')
  const keywords = resources.filter((r) => r.kind === 'keyword')
  const ads = resources.filter((r) => r.kind === 'ad')
  const sitelinkResources = resources.filter((r) => r.kind === 'sitelink')
  const calloutResources = resources.filter((r) => r.kind === 'callout')
  const negativeResources = resources.filter((r) => r.kind === 'negative')

  if (!campaign) {
    throw new Error(`No campaign resource found for "${campaignName}"`)
  }

  // Track which SDK imports we need
  const imports = new Set<string>(['google'])

  const props = campaign.properties
  const budget = props.budget as Record<string, unknown>
  const bidding = props.bidding as Record<string, unknown>
  const targeting = props.targeting as Record<string, unknown> | undefined

  // Budget
  const budgetStr = formatBudget(budget)
  if ((budget.period as string) === 'daily') imports.add('daily')
  else imports.add('monthly')

  // Bidding
  const biddingStr = formatBidding(bidding)

  // Targeting at campaign level
  let targetingStr: string | null = null
  if (targeting) {
    targetingStr = formatTargeting(targeting)
    if (targetingStr) {
      // Parse which targeting helpers we need
      if (targetingStr.includes('geo(')) imports.add('geo')
      if (targetingStr.includes('languages(')) imports.add('languages')
      if (targetingStr.includes('weekdays(')) imports.add('weekdays')
      if (targetingStr.includes('hours(')) imports.add('hours')
      if (targetingStr.includes('device(')) imports.add('device')
      if (targetingStr.includes('targeting(')) imports.add('targeting')
    }
  }

  // Network settings (optional)
  const networkSettings = props.networkSettings as
    | { searchNetwork: boolean; searchPartners: boolean; displayNetwork: boolean }
    | undefined

  // Build config object
  const configParts: string[] = []
  configParts.push(`budget: ${budgetStr},`)
  configParts.push(`bidding: ${biddingStr},`)
  if (targetingStr) {
    configParts.push(`targeting: ${targetingStr},`)
  }
  if (networkSettings) {
    configParts.push(
      `networkSettings: {\n    searchNetwork: ${networkSettings.searchNetwork},\n    searchPartners: ${networkSettings.searchPartners},\n    displayNetwork: ${networkSettings.displayNetwork},\n  },`,
    )
  }

  // Status (only emit if paused — enabled is default)
  const campaignStatus = props.status as string | undefined
  if (campaignStatus === 'paused') {
    configParts.push(`status: 'paused',`)
  }

  // Dates
  const startDate = props.startDate as string | undefined
  if (startDate) configParts.push(`startDate: ${quote(startDate)},`)
  const endDate = props.endDate as string | undefined
  if (endDate) configParts.push(`endDate: ${quote(endDate)},`)

  // Tracking
  const trackingTemplate = props.trackingTemplate as string | undefined
  if (trackingTemplate) configParts.push(`trackingTemplate: ${quote(trackingTemplate)},`)
  const finalUrlSuffix = props.finalUrlSuffix as string | undefined
  if (finalUrlSuffix) configParts.push(`finalUrlSuffix: ${quote(finalUrlSuffix)},`)
  const customParameters = props.customParameters as Record<string, string> | undefined
  if (customParameters && Object.keys(customParameters).length > 0) {
    const entries = Object.entries(customParameters).map(([k, v]) => `${k}: ${quote(v)}`).join(', ')
    configParts.push(`customParameters: { ${entries} },`)
  }

  // Build the campaign header
  const lines: string[] = []
  lines.push(`// Imported from Google Ads on ${today}`)

  // Negatives
  const negativesByMatchType = groupBy(negativeResources, (r) => r.properties.matchType as string)

  if (negativeResources.length > 0) {
    // Collect all match type helpers needed for negatives
    for (const matchType of Object.keys(negativesByMatchType)) {
      const helper = matchTypeHelper(matchType)
      imports.add(helper)
    }
  }

  // Build groups
  const groupLines: string[] = []
  const campaignSlug = campaign.path

  for (const ag of adGroups) {
    // Find the group key from the path: campaignSlug/groupKey
    const groupKey = ag.path.replace(`${campaignSlug}/`, '')

    // Keywords for this group
    const groupKeywords = keywords.filter((k) => k.path.startsWith(`${ag.path}/`))
    // Ads for this group
    const groupAds = ads.filter((a) => a.path.startsWith(`${ag.path}/`))

    // Group keywords by match type
    const kwByMatchType = groupBy(groupKeywords, (k) => k.properties.matchType as string)

    const keywordParts: string[] = []
    for (const [matchType, kws] of Object.entries(kwByMatchType)) {
      const helper = matchTypeHelper(matchType)
      imports.add(helper)

      // Check if any keyword in this match type group has extra options
      const hasOptions = kws.some(k => k.properties.bid || k.properties.finalUrl || k.properties.status)

      if (hasOptions) {
        const kwObjects = kws.map(k => {
          const opts: string[] = [`text: ${quote(k.properties.text as string)}`]
          if (k.properties.bid) opts.push(`bid: ${k.properties.bid}`)
          if (k.properties.finalUrl) opts.push(`finalUrl: ${quote(k.properties.finalUrl as string)}`)
          if (k.properties.status === 'paused') opts.push(`status: 'paused'`)
          return `{ ${opts.join(', ')} }`
        })
        keywordParts.push(`...${helper}(\n    ${kwObjects.join(',\n    ')},\n  )`)
      } else {
        const texts = kws.map((k) => k.properties.text as string)
        keywordParts.push(`...${helper}(${formatStringList(texts)})`)
      }
    }
    const keywordsLine = `keywords: [${keywordParts.join(', ')}],`

    // Ads
    let adLines = ''
    if (groupAds.length > 0) {
      imports.add('rsa')
      imports.add('headlines')
      imports.add('descriptions')
      imports.add('url')

      const formatOneAd = (adRes: Resource): string => {
        const hl = adRes.properties.headlines as string[]
        const desc = adRes.properties.descriptions as string[]
        const adFinalUrl = adRes.properties.finalUrl as string
        const p1 = adRes.properties.path1 as string | undefined
        const p2 = adRes.properties.path2 as string | undefined
        const adSt = adRes.properties.status as string | undefined

        const headlinesStr =
          hl.length <= 3
            ? `headlines(${hl.map(quote).join(', ')})`
            : `headlines(\n        ${hl.map(quote).join(',\n        ')},\n      )`
        const descriptionsStr =
          desc.length <= 2
            ? `descriptions(${desc.map(quote).join(', ')})`
            : `descriptions(\n        ${desc.map(quote).join(',\n        ')},\n      )`

        const rsaParts = [headlinesStr, descriptionsStr, `url(${quote(adFinalUrl)})`]

        // Path and status options
        const opts: string[] = []
        if (p1) opts.push(`path1: ${quote(p1)}`)
        if (p2) opts.push(`path2: ${quote(p2)}`)
        if (adSt === 'paused') opts.push(`status: 'paused'`)
        if (opts.length > 0) rsaParts.push(`{ ${opts.join(', ')} }`)

        return `rsa(\n      ${rsaParts.join(',\n      ')},\n    )`
      }

      if (groupAds.length === 1) {
        adLines = `ad: ${formatOneAd(groupAds[0]!)},`
      } else {
        const formatted = groupAds.map(a => formatOneAd(a))
        adLines = `ad: [\n      ${formatted.join(',\n      ')},\n    ],`
      }
    }

    // Group-level targeting
    const groupTargeting = ag.properties.targeting as Record<string, unknown> | undefined
    let groupTargetingStr: string | null = null
    if (groupTargeting) {
      groupTargetingStr = formatTargeting(groupTargeting)
      if (groupTargetingStr) {
        if (groupTargetingStr.includes('geo(')) imports.add('geo')
        if (groupTargetingStr.includes('languages(')) imports.add('languages')
        if (groupTargetingStr.includes('weekdays(')) imports.add('weekdays')
        if (groupTargetingStr.includes('hours(')) imports.add('hours')
        if (groupTargetingStr.includes('device(')) imports.add('device')
        if (groupTargetingStr.includes('targeting(')) imports.add('targeting')
      }
    }

    // Determine whether to use .group() or .locale()
    if (groupTargetingStr) {
      groupLines.push(
        `  .locale(${quote(groupKey)}, ${groupTargetingStr}, {\n    ${keywordsLine}\n    ${adLines}\n  })`,
      )
    } else {
      groupLines.push(`  .group(${quote(groupKey)}, {\n    ${keywordsLine}\n    ${adLines}\n  })`)
    }
  }

  // Sitelinks
  let sitelinkLine = ''
  if (sitelinkResources.length > 0) {
    imports.add('link')
    const slParts: string[] = []
    for (const sl of sitelinkResources) {
      const text = sl.properties.text as string
      const slUrl = sl.properties.url as string
      const desc1 = sl.properties.description1 as string | undefined
      const desc2 = sl.properties.description2 as string | undefined
      if (desc1 || desc2) {
        const opts: string[] = []
        if (desc1) opts.push(`description1: ${quote(desc1)}`)
        if (desc2) opts.push(`description2: ${quote(desc2)}`)
        slParts.push(`link(${quote(text)}, ${quote(slUrl)}, { ${opts.join(', ')} })`)
      } else {
        slParts.push(`link(${quote(text)}, ${quote(slUrl)})`)
      }
    }
    sitelinkLine = `  .sitelinks(\n    ${slParts.join(',\n    ')},\n  )`
  }

  // Callouts
  let calloutLine = ''
  if (calloutResources.length > 0) {
    const texts = calloutResources.map((c) => c.properties.text as string)
    calloutLine = `  .callouts(${texts.map(quote).join(', ')})`
  }

  // Negatives — append to config
  if (negativeResources.length > 0) {
    const negParts: string[] = []
    for (const [matchType, negs] of Object.entries(negativesByMatchType)) {
      const helper = matchTypeHelper(matchType)
      const texts = negs.map((n) => n.properties.text as string)
      negParts.push(`...${helper}(${formatStringList(texts)})`)
    }
    configParts.push(`negatives: [${negParts.join(', ')}],`)
  }

  // Compose import statement
  const importList = Array.from(imports).sort()
  lines.push(
    `import { ${importList.join(', ')} } from '@upspawn/ads'`,
  )
  lines.push('')

  // Campaign declaration
  lines.push(`export default google.search(${quote(campaignName)}, {`)
  for (const part of configParts) {
    lines.push(`  ${part}`)
  }
  lines.push(`})`)

  // Chain groups
  for (const gl of groupLines) {
    lines.push(gl)
  }

  // Chain sitelinks
  if (sitelinkLine) lines.push(sitelinkLine)

  // Chain callouts
  if (calloutLine) lines.push(calloutLine)

  lines.push('')

  return lines.join('\n')
}

// ─── Shared Config Extraction ────────────────────────────

/**
 * Analyze multiple campaigns for shared targeting and negatives.
 * If 2+ campaigns share identical geo+language targeting, generate a targeting.ts export.
 * If 2+ campaigns share 3+ identical negatives, generate a negatives.ts export.
 */
export function extractSharedConfig(
  campaignResources: Resource[][],
): { targeting: string; negatives: string } {
  if (campaignResources.length < 2) {
    return { targeting: '', negatives: '' }
  }

  // ─ Shared targeting ────────────────────────────────────
  let sharedTargeting = ''
  const targetingSignatures = new Map<string, number>()
  const targetingBySignature = new Map<string, Record<string, unknown>>()

  for (const resources of campaignResources) {
    const campaign = resources.find((r) => r.kind === 'campaign')
    if (!campaign) continue

    const targeting = campaign.properties.targeting as Record<string, unknown> | undefined
    if (!targeting) continue

    const rules = targeting.rules as Array<Record<string, unknown>> | undefined
    if (!rules || rules.length === 0) continue

    const sig = JSON.stringify(rules, Object.keys(rules[0]!).sort())
    targetingSignatures.set(sig, (targetingSignatures.get(sig) ?? 0) + 1)
    if (!targetingBySignature.has(sig)) {
      targetingBySignature.set(sig, targeting)
    }
  }

  for (const [sig, count] of targetingSignatures) {
    if (count >= 2) {
      const targeting = targetingBySignature.get(sig)!
      const formatted = formatTargeting(targeting)
      if (formatted) {
        // Build imports needed
        const helperImports = new Set<string>()
        if (formatted.includes('geo(')) helperImports.add('geo')
        if (formatted.includes('languages(')) helperImports.add('languages')
        if (formatted.includes('weekdays(')) helperImports.add('weekdays')
        if (formatted.includes('hours(')) helperImports.add('hours')
        helperImports.add('targeting')

        const importList = Array.from(helperImports).sort()
        sharedTargeting = [
          `import { ${importList.join(', ')} } from '@upspawn/ads'`,
          '',
          `export const shared = ${formatted}`,
          '',
        ].join('\n')
        break // Take the first shared targeting found
      }
    }
  }

  // ─ Shared negatives ────────────────────────────────────
  let sharedNegatives = ''

  // Collect all negative texts per campaign
  const allNegativeTexts: string[][] = []
  for (const resources of campaignResources) {
    const negs = resources
      .filter((r) => r.kind === 'negative')
      .map((r) => (r.properties.text as string).toLowerCase())
    allNegativeTexts.push(negs)
  }

  // Find negatives appearing in 2+ campaigns
  const negCounts = new Map<string, number>()
  for (const texts of allNegativeTexts) {
    const unique = new Set(texts)
    for (const t of unique) {
      negCounts.set(t, (negCounts.get(t) ?? 0) + 1)
    }
  }

  const sharedNegTexts = Array.from(negCounts.entries())
    .filter(([_, count]) => count >= 2)
    .map(([text]) => text)
    .sort()

  if (sharedNegTexts.length >= 3) {
    sharedNegatives = [
      `import { negatives } from '@upspawn/ads'`,
      '',
      `export const shared = negatives(`,
      ...sharedNegTexts.map((t) => `  ${quote(t)},`),
      `)`,
      '',
    ].join('\n')
  }

  return { targeting: sharedTargeting, negatives: sharedNegatives }
}

// ─── Utility ─────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}
