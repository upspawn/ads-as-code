import type { Resource } from '../core/types.ts'
import { slugify } from '../core/flatten.ts'
import { OBJECTIVE_MAP, DEFAULT_OPTIMIZATION } from './constants.ts'
import type { Objective } from './types.ts'

// ─── Public API ──────────────────────────────────────────

/** Convert a campaign name to a valid filename slug (reused by import). */
export function metaCampaignToFilename(name: string): string {
  return slugify(name)
}

/**
 * Generates TypeScript campaign files from fetched Meta Resource[].
 *
 * Groups resources by campaign, then produces builder DSL code
 * using `meta.<objective>(name, config)` with chained `.adSet()` calls.
 *
 * Smart defaults: omits bidding (lowestCost), placements (automatic),
 * optimization (when matching objective default), and status (PAUSED).
 * Hoists shared url/cta to the ad set content level.
 */
export function codegenMeta(resources: Resource[]): string {
  const campaignGroups = groupByCampaign(resources)
  const files: Array<{ name: string; code: string }> = []

  for (const [campaignPath, group] of campaignGroups) {
    const campaign = group.find((r) => r.kind === 'campaign')
    if (!campaign) continue

    const code = generateMetaCampaignFile(campaign, group, campaignPath)
    files.push({ name: campaign.properties.name as string, code })
  }

  // For single-campaign input (most common), return the code directly.
  // For multi-campaign, join with double newlines.
  return files.map((f) => f.code).join('\n\n')
}

// ─── Helpers ─────────────────────────────────────────────

function quote(s: string): string {
  // Multiline strings must use backtick template literals
  if (s.includes('\n')) {
    return '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
  }
  return `'${s.replace(/'/g, "\\'")}'`
}

function indent(text: string, level: number): string {
  const prefix = '  '.repeat(level)
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : ''))
    .join('\n')
}

// ─── Reverse Objective Map ───────────────────────────────

const API_TO_OBJECTIVE: Record<string, Objective> = {}
for (const [sdk, api] of Object.entries(OBJECTIVE_MAP)) {
  // First wins — 'sales' beats 'conversions' for OUTCOME_SALES
  if (!API_TO_OBJECTIVE[api]) {
    API_TO_OBJECTIVE[api] = sdk as Objective
  }
}

/** Map an API objective string (OUTCOME_TRAFFIC) to the SDK method name (traffic). */
function objectiveToMethod(apiObjective: string): string {
  const obj = API_TO_OBJECTIVE[apiObjective]
  if (!obj) return 'traffic' // safe fallback
  if (obj === 'app-promotion') return 'appPromotion'
  return obj
}

// ─── Smart Default Detection ─────────────────────────────

function isDefaultBidding(bidding: unknown): boolean {
  if (!bidding) return true
  if (typeof bidding === 'object' && bidding !== null) {
    const b = bidding as Record<string, unknown>
    return b.type === 'LOWEST_COST_WITHOUT_CAP'
  }
  return false
}

function isDefaultPlacements(placements: unknown): boolean {
  if (!placements) return true
  return placements === 'automatic'
}

function isDefaultOptimization(optimization: unknown, objective: string): boolean {
  if (!optimization) return true
  const sdkObjective = API_TO_OBJECTIVE[objective]
  if (!sdkObjective) return false
  return optimization === DEFAULT_OPTIMIZATION[sdkObjective]
}

function isDefaultStatus(status: unknown): boolean {
  if (!status) return true
  return status === 'PAUSED'
}

// ─── Bidding Codegen ─────────────────────────────────────

function formatMetaBidding(bidding: Record<string, unknown>): string {
  const type = bidding.type as string
  switch (type) {
    case 'LOWEST_COST_WITH_BID_CAP':
      return `bidCap(${bidding.cap})`
    case 'COST_CAP':
      return `costCap(${bidding.cap})`
    case 'MINIMUM_ROAS':
      return `minRoas(${bidding.floor})`
    case 'BID_CAP':
      return `bidCap(${bidding.cap})`
    default:
      return `lowestCost()`
  }
}

// ─── Budget Codegen ──────────────────────────────────────

function formatMetaBudget(budget: Record<string, unknown>): string {
  const amount = budget.amount as number
  const currency = budget.currency as string
  const period = budget.period as string

  const fn = period === 'lifetime' ? 'lifetime' : period === 'monthly' ? 'monthly' : 'daily'

  if (period === 'lifetime') {
    const endTime = budget.endTime as string | undefined
    if (currency === 'EUR') {
      return endTime ? `lifetime(${amount}, ${quote(endTime)})` : `lifetime(${amount})`
    }
    return endTime
      ? `lifetime(${amount}, ${quote(currency)}, ${quote(endTime)})`
      : `lifetime(${amount}, ${quote(currency)})`
  }

  if (currency === 'EUR') {
    return `${fn}(${amount})`
  }
  return `${fn}(${amount}, ${quote(currency)})`
}

// ─── Targeting Codegen ───────────────────────────────────

function formatMetaTargeting(targeting: Record<string, unknown>, imports: Set<string>): string {
  const parts: string[] = []

  // Geo
  const geo = targeting.geo as Array<Record<string, unknown>> | undefined
  if (geo && geo.length > 0) {
    imports.add('geo')
    // Flatten all country codes from all geo targets
    const countries = geo.flatMap((g) => g.countries as string[])
    parts.push(`geo(${countries.map(quote).join(', ')})`)
  }

  // Age
  const age = targeting.age as { min: number; max: number } | undefined
  if (age) {
    imports.add('age')
    parts.push(`age(${age.min}, ${age.max})`)
  }

  // Custom audiences
  const customAudiences = targeting.customAudiences as string[] | undefined
  if (customAudiences && customAudiences.length > 0) {
    imports.add('audience')
    for (const a of customAudiences) {
      parts.push(`audience(${quote(a)})`)
    }
  }

  // Excluded audiences
  const excludedAudiences = targeting.excludedAudiences as string[] | undefined
  if (excludedAudiences && excludedAudiences.length > 0) {
    imports.add('excludeAudience')
    for (const a of excludedAudiences) {
      parts.push(`excludeAudience(${quote(a)})`)
    }
  }

  // Interests
  const interests = targeting.interests as Array<{ id: string; name: string }> | undefined
  if (interests && interests.length > 0) {
    imports.add('interests')
    const args = interests.map(
      (i) => `{ id: ${quote(i.id)}, name: ${quote(i.name)} }`,
    )
    if (args.length === 1) {
      parts.push(`...interests(${args[0]})`)
    } else {
      parts.push(`...interests(\n      ${args.join(',\n      ')},\n    )`)
    }
  }

  if (parts.length === 0) {
    // Fallback: at least geo is required
    imports.add('geo')
    parts.push(`geo('US')`)
  }

  imports.add('targeting')
  if (parts.length <= 2) {
    return `targeting(${parts.join(', ')})`
  }
  return `targeting(\n    ${parts.join(',\n    ')},\n  )`
}

// ─── Creative Codegen ────────────────────────────────────

function formatCreative(
  creative: Resource,
  hoistedUrl: string | undefined,
  hoistedCta: string | undefined,
  imports: Set<string>,
): string {
  const props = creative.properties
  const format = props.format as string
  const parts: string[] = []

  const headline = props.headline as string | undefined
  const primaryText = props.primaryText as string | undefined
  const description = props.description as string | undefined
  const cta = props.cta as string | undefined
  const url = props.url as string | undefined
  const name = props.name as string | undefined

  if (headline) parts.push(`headline: ${quote(headline)}`)
  if (primaryText) parts.push(`primaryText: ${quote(primaryText)}`)
  if (description) parts.push(`description: ${quote(description)}`)

  // Only emit url/cta if they differ from hoisted values
  if (url && url !== hoistedUrl) parts.push(`url: ${quote(url)}`)
  if (cta && cta !== hoistedCta) parts.push(`cta: ${quote(cta)}`)

  if (format === 'video') {
    imports.add('video')
    const videoPath = (props.video as string) || `./assets/imported/${slugify(name || 'video')}.mp4`
    const thumbnail = props.thumbnail as string | undefined
    if (thumbnail) parts.push(`thumbnail: ${quote(thumbnail)}`)
    return `video(${quote(videoPath)}, {\n      ${parts.join(',\n      ')},\n    })`
  }

  // Default: image
  imports.add('image')
  const imagePath = (props.image as string) || `./assets/imported/${slugify(name || 'image')}.png`
  return `image(${quote(imagePath)}, {\n      ${parts.join(',\n      ')},\n    })`
}

// ─── URL/CTA Hoisting ────────────────────────────────────

function findHoistableValue(
  creatives: Resource[],
  field: 'url' | 'cta',
): string | undefined {
  if (creatives.length === 0) return undefined
  const values = creatives.map((c) => c.properties[field] as string | undefined).filter(Boolean)
  if (values.length === 0) return undefined
  // All ads must share the same value to hoist
  const first = values[0]!
  return values.every((v) => v === first) ? first : undefined
}

// ─── Single Campaign File ────────────────────────────────

function generateMetaCampaignFile(
  campaign: Resource,
  allResources: Resource[],
  campaignPath: string,
): string {
  const today = new Date().toISOString().split('T')[0]
  const imports = new Set<string>(['meta'])

  const props = campaign.properties
  const name = props.name as string
  const objective = props.objective as string
  const status = props.status as string | undefined
  const budget = props.budget as Record<string, unknown> | undefined
  const spendCap = props.spendCap as number | undefined

  const methodName = objectiveToMethod(objective)

  // Build campaign config
  const configParts: string[] = []

  if (budget) {
    const budgetStr = formatMetaBudget(budget)
    const budgetFn = (budget.period as string) === 'lifetime'
      ? 'lifetime'
      : (budget.period as string) === 'monthly'
        ? 'monthly'
        : 'daily'
    imports.add(budgetFn)
    configParts.push(`budget: ${budgetStr},`)
  }

  if (status && !isDefaultStatus(status)) {
    configParts.push(`status: ${quote(status)},`)
  }

  if (spendCap !== undefined) {
    configParts.push(`spendCap: ${spendCap},`)
  }

  // Ad sets
  const adSets = allResources.filter((r) => r.kind === 'adSet')
  const creatives = allResources.filter((r) => r.kind === 'creative')
  const ads = allResources.filter((r) => r.kind === 'ad')

  const adSetLines: string[] = []

  for (const adSet of adSets) {
    const adSetPath = adSet.path
    const adSetName = adSet.properties.name as string

    // Find creatives for this ad set
    const adSetCreatives = creatives.filter((c) => c.path.startsWith(`${adSetPath}/`))

    // Ad set config
    const adSetConfigParts: string[] = []

    // Targeting
    const targeting = adSet.properties.targeting as Record<string, unknown> | undefined
    if (targeting) {
      const targetingStr = formatMetaTargeting(targeting, imports)
      adSetConfigParts.push(`targeting: ${targetingStr},`)
    }

    // Optimization (omit if default for objective)
    const optimization = adSet.properties.optimization as string | undefined
    if (optimization && !isDefaultOptimization(optimization, objective)) {
      adSetConfigParts.push(`optimization: ${quote(optimization)},`)
    }

    // Bidding (omit if lowest cost)
    const bidding = adSet.properties.bidding as Record<string, unknown> | undefined
    if (bidding && !isDefaultBidding(bidding)) {
      const biddingStr = formatMetaBidding(bidding)
      // Add the bidding helper import
      const biddingType = bidding.type as string
      if (biddingType === 'COST_CAP') imports.add('costCap')
      else if (biddingType === 'MINIMUM_ROAS') imports.add('minRoas')
      else if (biddingType === 'BID_CAP' || biddingType === 'LOWEST_COST_WITH_BID_CAP') imports.add('bidCap')
      adSetConfigParts.push(`bidding: ${biddingStr},`)
    }

    // Budget at ad set level
    const adSetBudget = adSet.properties.budget as Record<string, unknown> | undefined
    if (adSetBudget) {
      const budgetStr = formatMetaBudget(adSetBudget)
      const budgetFn = (adSetBudget.period as string) === 'lifetime'
        ? 'lifetime'
        : (adSetBudget.period as string) === 'monthly'
          ? 'monthly'
          : 'daily'
      imports.add(budgetFn)
      adSetConfigParts.push(`budget: ${budgetStr},`)
    }

    // Placements (omit if automatic)
    const placements = adSet.properties.placements as unknown
    if (placements && !isDefaultPlacements(placements)) {
      imports.add('manual')
      if (typeof placements === 'object' && placements !== null) {
        const p = placements as Record<string, unknown>
        const platforms = p.platforms as string[] | undefined
        const positions = p.positions as string[] | undefined
        if (platforms) {
          const args = [
            `[${platforms.map(quote).join(', ')}]`,
            positions ? `[${positions.map(quote).join(', ')}]` : undefined,
          ].filter(Boolean)
          adSetConfigParts.push(`placements: manual(${args.join(', ')}),`)
        }
      }
    }

    // Status (omit if PAUSED)
    const adSetStatus = adSet.properties.status as string | undefined
    if (adSetStatus && !isDefaultStatus(adSetStatus)) {
      adSetConfigParts.push(`status: ${quote(adSetStatus)},`)
    }

    // URL/CTA hoisting
    const hoistedUrl = findHoistableValue(adSetCreatives, 'url')
    const hoistedCta = findHoistableValue(adSetCreatives, 'cta')

    // Content
    const contentParts: string[] = []
    if (hoistedUrl) contentParts.push(`url: ${quote(hoistedUrl)},`)
    if (hoistedCta) contentParts.push(`cta: ${quote(hoistedCta)},`)

    // Ads
    const adStrings = adSetCreatives.map((c) =>
      formatCreative(c, hoistedUrl, hoistedCta, imports),
    )

    if (adStrings.length === 1) {
      contentParts.push(`ads: [\n    ${adStrings[0]},\n  ],`)
    } else if (adStrings.length > 1) {
      contentParts.push(`ads: [\n    ${adStrings.join(',\n    ')},\n  ],`)
    }

    // Assemble .adSet() call
    const configStr = adSetConfigParts.length > 0
      ? `{\n  ${adSetConfigParts.join('\n  ')}\n}`
      : '{}'

    const contentStr = contentParts.length > 0
      ? `{\n  ${contentParts.join('\n  ')}\n}`
      : undefined

    if (contentStr) {
      adSetLines.push(`.adSet(${quote(adSetName)}, ${configStr}, ${contentStr})`)
    } else {
      adSetLines.push(`.adSet(${quote(adSetName)}, ${configStr})`)
    }
  }

  // Build import statement
  const importList = Array.from(imports).sort()
  const importLine = `import { ${importList.join(', ')} } from '@upspawn/ads'`

  // Assemble file
  const lines: string[] = []
  lines.push(`// Imported from Meta Ads on ${today}`)
  lines.push(importLine)
  lines.push('')

  // Campaign declaration — camelCase the slug and ensure valid JS identifier
  let exportName = slugify(name).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
  // JS identifiers cannot start with a digit — prefix with underscore
  if (/^[0-9]/.test(exportName)) {
    exportName = `_${exportName}`
  }

  if (configParts.length > 0) {
    lines.push(`export const ${exportName} = meta.${methodName}(${quote(name)}, {`)
    for (const part of configParts) {
      lines.push(`  ${part}`)
    }
    lines.push(`})`)
  } else {
    lines.push(`export const ${exportName} = meta.${methodName}(${quote(name)})`)
  }

  // Chain ad sets
  for (const adSetLine of adSetLines) {
    lines.push(adSetLine)
  }

  lines.push('')
  return lines.join('\n')
}

// ─── Grouping ────────────────────────────────────────────

/**
 * Group resources by their campaign path (first segment of the path).
 * Returns a Map of campaignPath → Resource[] preserving insertion order.
 */
function groupByCampaign(resources: Resource[]): Map<string, Resource[]> {
  const groups = new Map<string, Resource[]>()

  for (const r of resources) {
    // Campaign path is the first path segment
    const campaignPath = r.kind === 'campaign' ? r.path : r.path.split('/')[0]!
    if (!groups.has(campaignPath)) groups.set(campaignPath, [])
    groups.get(campaignPath)!.push(r)
  }

  return groups
}
