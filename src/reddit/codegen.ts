/**
 * Reddit Ads codegen — generates idiomatic TypeScript campaign files from Resource[].
 *
 * Follows the same pattern as Meta codegen: groups by campaign, maps API enums
 * back to SDK method names, formats targeting/bidding/placement as helper calls,
 * and omits fields that match platform defaults (via resource.meta._defaults).
 */

import type { Resource } from '../core/types.ts'
import { slugify } from '../core/flatten.ts'
import { REVERSE_OBJECTIVE_MAP, DEFAULT_OPTIMIZATION, REVERSE_STATUS_MAP } from './constants.ts'
import type { Objective, RedditTargetingRule } from './types.ts'

// ─── Public API ──────────────────────────────────────────

/**
 * Generate TypeScript campaign files from fetched Reddit Resource[].
 * Groups resources by campaign, produces builder DSL code with chained .adGroup() calls.
 */
export function codegenReddit(resources: Resource[]): string {
  const campaignGroups = groupByCampaign(resources)
  const files: string[] = []

  for (const [campaignPath, group] of campaignGroups) {
    const campaign = group.find((r) => r.kind === 'campaign')
    if (!campaign) continue
    files.push(generateRedditCampaignFile(campaign, group))
  }

  return files.join('\n\n')
}

// ─── Helpers ─────────────────────────────────────────────

function quote(s: string): string {
  if (s.includes('\n')) {
    return '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
  }
  return `'${s.replace(/'/g, "\\'")}'`
}

// ─── Objective Mapping ──────────────────────────────────

/** Map an API objective string (TRAFFIC) to the SDK method name (traffic). */
function objectiveToMethod(apiObjective: string): string {
  const obj = REVERSE_OBJECTIVE_MAP[apiObjective]
  if (!obj) return 'traffic' // safe fallback
  switch (obj) {
    case 'video-views': return 'videoViews'
    case 'app-installs': return 'appInstalls'
    default: return obj
  }
}

// ─── Default Detection ──────────────────────────────────

function isDefault(meta: Record<string, unknown> | undefined, field: string): boolean {
  if (!meta) return false
  const defaults = meta._defaults as string[] | Record<string, boolean> | undefined
  if (Array.isArray(defaults)) return defaults.includes(field)
  return defaults?.[field] === true
}

function isDefaultStatus(status: unknown): boolean {
  return !status || status === 'PAUSED' || status === 'paused'
}

function isDefaultPlacement(placement: unknown): boolean {
  return !placement || placement === 'ALL'
}

function isDefaultOptimization(optimization: unknown, apiObjective: string): boolean {
  if (!optimization) return true
  const sdkObjective = REVERSE_OBJECTIVE_MAP[apiObjective]
  if (!sdkObjective) return false
  return optimization === DEFAULT_OPTIMIZATION[sdkObjective]
}

function isDefaultBidding(bid: unknown): boolean {
  if (!bid) return true
  if (typeof bid === 'object' && bid !== null) {
    return (bid as Record<string, unknown>).type === 'LOWEST_COST'
  }
  return false
}

// ─── Budget Codegen ─────────────────────────────────────

function formatBudget(budget: Record<string, unknown>, imports: Set<string>): string {
  const amount = budget.amount as number
  const currency = budget.currency as string
  const period = budget.period as string

  const fn = period === 'lifetime' ? 'lifetime' : period === 'monthly' ? 'monthly' : 'daily'
  imports.add(fn)

  if (period === 'lifetime') {
    const endTime = budget.endTime as string | undefined
    if (currency === 'USD') {
      return endTime ? `lifetime(${amount}, ${quote(endTime)})` : `lifetime(${amount})`
    }
    return endTime
      ? `lifetime(${amount}, ${quote(endTime)}, ${quote(currency)})`
      : `lifetime(${amount}, ${quote(currency)})`
  }

  if (currency === 'USD') {
    return `${fn}(${amount})`
  }
  return `${fn}(${amount}, ${quote(currency)})`
}

// ─── Bidding Codegen ────────────────────────────────────

function formatBidding(bid: Record<string, unknown>, imports: Set<string>): string {
  const type = bid.type as string
  switch (type) {
    case 'COST_CAP':
      imports.add('costCap')
      return `costCap(${bid.amount})`
    case 'MANUAL_BID':
      imports.add('manualBid')
      return `manualBid(${bid.amount})`
    default:
      imports.add('lowestCost')
      return `lowestCost()`
  }
}

// ─── Targeting Codegen ──────────────────────────────────

function formatTargetingRules(rules: readonly Record<string, unknown>[], imports: Set<string>): string[] {
  const parts: string[] = []

  for (const rule of rules) {
    const type = rule._type as string
    switch (type) {
      case 'geo': {
        imports.add('geo')
        const locations = rule.locations as string[]
        parts.push(`geo(${locations.map(quote).join(', ')})`)
        break
      }
      case 'subreddits': {
        imports.add('subreddits')
        const names = rule.names as string[]
        parts.push(`subreddits(${names.map(quote).join(', ')})`)
        break
      }
      case 'interests': {
        imports.add('interests')
        const names = rule.names as string[]
        parts.push(`interests(${names.map(quote).join(', ')})`)
        break
      }
      case 'keywords': {
        imports.add('keywords')
        const terms = rule.terms as string[]
        parts.push(`keywords(${terms.map(quote).join(', ')})`)
        break
      }
      case 'age': {
        imports.add('age')
        parts.push(`age(${rule.min}, ${rule.max})`)
        break
      }
      case 'gender': {
        imports.add('gender')
        parts.push(`gender(${quote(rule.value as string)})`)
        break
      }
      case 'device': {
        imports.add('device')
        const types = rule.types as string[]
        parts.push(`device(${types.map(quote).join(', ')})`)
        break
      }
      case 'os': {
        imports.add('os')
        const types = rule.types as string[]
        parts.push(`os(${types.map(quote).join(', ')})`)
        break
      }
      case 'customAudience': {
        imports.add('customAudience')
        parts.push(`customAudience(${quote(rule.id as string)})`)
        break
      }
      case 'lookalike': {
        imports.add('lookalike')
        const config = rule.config as Record<string, unknown> | undefined
        if (config) {
          const configParts: string[] = []
          if (config.country) configParts.push(`country: ${quote(config.country as string)}`)
          if (config.ratio !== undefined) configParts.push(`ratio: ${config.ratio}`)
          parts.push(`lookalike(${quote(rule.sourceId as string)}, { ${configParts.join(', ')} })`)
        } else {
          parts.push(`lookalike(${quote(rule.sourceId as string)})`)
        }
        break
      }
      case 'expansion': {
        imports.add('expansion')
        parts.push(`expansion(${rule.enabled})`)
        break
      }
    }
  }

  return parts
}

// ─── Schedule Codegen ───────────────────────────────────

function formatSchedule(schedule: Record<string, unknown>): string {
  const parts: string[] = []
  if (schedule.start) parts.push(`start: ${quote(schedule.start as string)}`)
  if (schedule.end) parts.push(`end: ${quote(schedule.end as string)}`)

  const dayparting = schedule.dayparting as readonly Record<string, unknown>[] | undefined
  if (dayparting && dayparting.length > 0) {
    const daypartStrings = dayparting.map((dp) => {
      const days = (dp.days as string[]).map(quote).join(', ')
      return `{ days: [${days}], startHour: ${dp.startHour}, endHour: ${dp.endHour} }`
    })
    if (daypartStrings.length === 1) {
      parts.push(`dayparting: [${daypartStrings[0]}]`)
    } else {
      parts.push(`dayparting: [\n        ${daypartStrings.join(',\n        ')},\n      ]`)
    }
  }

  return `{ ${parts.join(', ')} }`
}

// ─── Placement Codegen ──────────────────────────────────

function formatPlacement(placement: string, imports: Set<string>): string {
  switch (placement) {
    case 'FEED':
      imports.add('feed')
      return 'feed()'
    case 'CONVERSATION':
      imports.add('conversation')
      return 'conversation()'
    default:
      imports.add('automatic')
      return 'automatic()'
  }
}

// ─── Creative Codegen ───────────────────────────────────

function formatAd(ad: Resource, imports: Set<string>): string {
  const props = ad.properties
  const format = props.format as string

  switch (format) {
    case 'image': {
      imports.add('image')
      const parts: string[] = []
      if (props.headline) parts.push(`headline: ${quote(props.headline as string)}`)
      if (props.body) parts.push(`body: ${quote(props.body as string)}`)
      if (props.clickUrl) parts.push(`clickUrl: ${quote(props.clickUrl as string)}`)
      if (props.cta) parts.push(`cta: ${quote(props.cta as string)}`)
      if (props.thumbnail) parts.push(`thumbnail: ${quote(props.thumbnail as string)}`)
      const filePath = (props.filePath as string) || './assets/imported/image.jpg'
      if (parts.length === 0) return `image(${quote(filePath)})`
      return `image(${quote(filePath)}, {\n      ${parts.join(',\n      ')},\n    })`
    }

    case 'video': {
      imports.add('video')
      const parts: string[] = []
      if (props.headline) parts.push(`headline: ${quote(props.headline as string)}`)
      if (props.body) parts.push(`body: ${quote(props.body as string)}`)
      if (props.clickUrl) parts.push(`clickUrl: ${quote(props.clickUrl as string)}`)
      if (props.cta) parts.push(`cta: ${quote(props.cta as string)}`)
      if (props.thumbnail) parts.push(`thumbnail: ${quote(props.thumbnail as string)}`)
      const filePath = (props.filePath as string) || './assets/imported/video.mp4'
      if (parts.length === 0) return `video(${quote(filePath)})`
      return `video(${quote(filePath)}, {\n      ${parts.join(',\n      ')},\n    })`
    }

    case 'carousel': {
      imports.add('carousel')
      const cards = props.cards as Array<Record<string, unknown>> | undefined
      const cardStrings = (cards ?? []).map((card) => {
        const cardParts: string[] = []
        if (card.image) cardParts.push(`image: ${quote(card.image as string)}`)
        if (card.headline) cardParts.push(`headline: ${quote(card.headline as string)}`)
        if (card.url) cardParts.push(`url: ${quote(card.url as string)}`)
        if (card.caption) cardParts.push(`caption: ${quote(card.caption as string)}`)
        return `{ ${cardParts.join(', ')} }`
      })

      const configParts: string[] = []
      if (props.clickUrl) configParts.push(`clickUrl: ${quote(props.clickUrl as string)}`)
      if (props.cta) configParts.push(`cta: ${quote(props.cta as string)}`)

      const cardsStr = cardStrings.length <= 1
        ? `[${cardStrings.join(', ')}]`
        : `[\n      ${cardStrings.join(',\n      ')},\n    ]`

      if (configParts.length === 0) return `carousel(${cardsStr})`
      return `carousel(${cardsStr}, {\n      ${configParts.join(',\n      ')},\n    })`
    }

    case 'freeform': {
      imports.add('freeform')
      const parts: string[] = []
      if (props.headline) parts.push(`headline: ${quote(props.headline as string)}`)
      if (props.body) parts.push(`body: ${quote(props.body as string)}`)
      if (props.images) {
        const images = props.images as string[]
        parts.push(`images: [${images.map(quote).join(', ')}]`)
      }
      if (props.videos) {
        const videos = props.videos as string[]
        parts.push(`videos: [${videos.map(quote).join(', ')}]`)
      }
      if (props.clickUrl) parts.push(`clickUrl: ${quote(props.clickUrl as string)}`)
      if (props.cta) parts.push(`cta: ${quote(props.cta as string)}`)
      return `freeform({\n      ${parts.join(',\n      ')},\n    })`
    }

    case 'product': {
      imports.add('product')
      const parts: string[] = []
      if (props.catalogId) parts.push(`catalogId: ${quote(props.catalogId as string)}`)
      if (props.headline) parts.push(`headline: ${quote(props.headline as string)}`)
      if (props.clickUrl) parts.push(`clickUrl: ${quote(props.clickUrl as string)}`)
      if (props.cta) parts.push(`cta: ${quote(props.cta as string)}`)
      return `product({\n      ${parts.join(',\n      ')},\n    })`
    }

    default:
      return `// Unknown ad format: ${format}`
  }
}

// ─── Single Campaign File ────────────────────────────────

function generateRedditCampaignFile(
  campaign: Resource,
  allResources: Resource[],
): string {
  const today = new Date().toISOString().split('T')[0]
  const imports = new Set<string>(['reddit'])

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
    configParts.push(`budget: ${formatBudget(budget, imports)},`)
  }

  if (status && !isDefaultStatus(status) && !isDefault(campaign.meta, 'status')) {
    const sdkStatus = REVERSE_STATUS_MAP[status] ?? status
    configParts.push(`status: ${quote(sdkStatus)},`)
  }

  if (spendCap !== undefined) {
    configParts.push(`spendCap: ${spendCap},`)
  }

  // Ad groups
  const adGroups = allResources.filter((r) => r.kind === 'adGroup')
  const ads = allResources.filter((r) => r.kind === 'ad')

  const adGroupLines: string[] = []

  for (const adGroup of adGroups) {
    const agPath = adGroup.path
    const agName = adGroup.properties.name as string
    const agMeta = adGroup.meta

    // Ad group config
    const agConfigParts: string[] = []

    // Targeting
    const targeting = adGroup.properties.targeting as readonly Record<string, unknown>[] | undefined
    if (targeting && targeting.length > 0) {
      const targetingParts = formatTargetingRules(targeting, imports)
      if (targetingParts.length <= 2) {
        agConfigParts.push(`targeting: [${targetingParts.join(', ')}],`)
      } else {
        agConfigParts.push(`targeting: [\n      ${targetingParts.join(',\n      ')},\n    ],`)
      }
    } else {
      agConfigParts.push(`targeting: [],`)
    }

    // Bidding (omit if default)
    const bid = adGroup.properties.bid as Record<string, unknown> | undefined
    if (bid && !isDefaultBidding(bid) && !isDefault(agMeta, 'bid')) {
      agConfigParts.push(`bid: ${formatBidding(bid, imports)},`)
    }

    // Placement (omit if ALL/default)
    const placement = adGroup.properties.placement as string | undefined
    if (placement && !isDefaultPlacement(placement) && !isDefault(agMeta, 'placement')) {
      agConfigParts.push(`placement: ${formatPlacement(placement, imports)},`)
    }

    // Optimization goal (omit if default for objective)
    const optimization = adGroup.properties.optimization as string | undefined
    if (optimization && !isDefaultOptimization(optimization, objective) && !isDefault(agMeta, 'optimization')) {
      agConfigParts.push(`optimizationGoal: ${quote(optimization)},`)
    }

    // Schedule
    const schedule = adGroup.properties.schedule as Record<string, unknown> | undefined
    if (schedule) {
      agConfigParts.push(`schedule: ${formatSchedule(schedule)},`)
    }

    // Status (omit if PAUSED/default)
    const agStatus = adGroup.properties.status as string | undefined
    if (agStatus && !isDefaultStatus(agStatus) && !isDefault(agMeta, 'status')) {
      const sdkStatus = REVERSE_STATUS_MAP[agStatus] ?? agStatus
      agConfigParts.push(`status: ${quote(sdkStatus)},`)
    }

    // Ads for this ad group
    const adGroupAds = ads.filter((a) => a.path.startsWith(`${agPath}/`))
    const adStrings = adGroupAds.map((ad) => formatAd(ad, imports))

    const configStr = agConfigParts.length > 0
      ? `{\n    ${agConfigParts.join('\n    ')}\n  }`
      : '{}'

    if (adStrings.length > 0) {
      const adsStr = adStrings.length === 1
        ? `[\n    ${adStrings[0]},\n  ]`
        : `[\n    ${adStrings.join(',\n    ')},\n  ]`
      adGroupLines.push(`.adGroup(${quote(agName)}, ${configStr}, ${adsStr})`)
    } else {
      adGroupLines.push(`.adGroup(${quote(agName)}, ${configStr}, [])`)
    }
  }

  // Build import statements — group by source module
  const TARGETING_HELPERS = new Set([
    'geo', 'subreddits', 'interests', 'keywords', 'age', 'gender',
    'device', 'os', 'customAudience', 'lookalike', 'expansion',
  ])
  const BIDDING_HELPERS = new Set(['lowestCost', 'costCap', 'manualBid'])
  const PLACEMENT_HELPERS = new Set(['feed', 'conversation', 'automatic'])
  const CREATIVE_HELPERS = new Set(['image', 'video', 'carousel', 'freeform', 'product'])
  const BUDGET_HELPERS = new Set(['daily', 'monthly', 'lifetime'])

  // Main package: reddit namespace + budget helpers
  const mainImports = ['reddit', ...Array.from(imports).filter(i => BUDGET_HELPERS.has(i)).sort()]
  const importLines: string[] = [
    `import { ${mainImports.join(', ')} } from '@upspawn/ads'`,
  ]

  const targetingImports = Array.from(imports).filter(i => TARGETING_HELPERS.has(i)).sort()
  if (targetingImports.length > 0) {
    importLines.push(`import { ${targetingImports.join(', ')} } from '@upspawn/ads/helpers/reddit-targeting'`)
  }

  const creativeImports = Array.from(imports).filter(i => CREATIVE_HELPERS.has(i)).sort()
  if (creativeImports.length > 0) {
    importLines.push(`import { ${creativeImports.join(', ')} } from '@upspawn/ads/helpers/reddit-creative'`)
  }

  const biddingImports = Array.from(imports).filter(i => BIDDING_HELPERS.has(i)).sort()
  if (biddingImports.length > 0) {
    importLines.push(`import { ${biddingImports.join(', ')} } from '@upspawn/ads/helpers/reddit-bidding'`)
  }

  const placementImports = Array.from(imports).filter(i => PLACEMENT_HELPERS.has(i)).sort()
  if (placementImports.length > 0) {
    importLines.push(`import { ${placementImports.join(', ')} } from '@upspawn/ads/helpers/reddit-placement'`)
  }

  const importLine = importLines.join('\n')

  // Assemble file
  const lines: string[] = []
  lines.push(`// Imported from Reddit Ads on ${today}`)
  lines.push(importLine)
  lines.push('')

  // Campaign declaration — camelCase the slug
  let exportName = slugify(name).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
  if (/^[0-9]/.test(exportName)) {
    exportName = `_${exportName}`
  }

  if (configParts.length > 0) {
    lines.push(`export const ${exportName} = reddit.${methodName}(${quote(name)}, {`)
    for (const part of configParts) {
      lines.push(`  ${part}`)
    }
    lines.push(`})`)
  } else {
    lines.push(`export const ${exportName} = reddit.${methodName}(${quote(name)})`)
  }

  // Chain ad groups
  for (const adGroupLine of adGroupLines) {
    lines.push(adGroupLine)
  }

  lines.push('.build()')
  lines.push('')
  return lines.join('\n')
}

// ─── Grouping ────────────────────────────────────────────

function groupByCampaign(resources: Resource[]): Map<string, Resource[]> {
  const groups = new Map<string, Resource[]>()

  for (const r of resources) {
    const campaignPath = r.kind === 'campaign' ? r.path : r.path.split('/')[0]!
    if (!groups.has(campaignPath)) groups.set(campaignPath, [])
    groups.get(campaignPath)!.push(r)
  }

  return groups
}
