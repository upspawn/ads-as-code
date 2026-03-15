// ─── Codegen: Expanded Meta Campaign Files ──────────────
// Generates standalone TypeScript campaign files from AI-produced
// Meta campaign data. Each file is fully resolved — no AI markers.
// Uses the same SDK helpers as hand-written Meta campaigns.

// ─── Types ──────────────────────────────────────────────

export type ExpandedMetaAd = {
  readonly format: 'image' | 'video'
  readonly media: string
  readonly headline: string
  readonly primaryText: string
  readonly description?: string
  readonly cta?: string
  readonly url?: string
}

export type ExpandedMetaAdSet = {
  readonly name: string
  readonly targeting: {
    readonly geo: string[]
    readonly age?: { readonly min: number; readonly max: number }
    readonly interests?: readonly { readonly id: string; readonly name: string }[]
    readonly customAudiences?: readonly string[]
  }
  readonly ads: ExpandedMetaAd[]
  readonly url?: string
  readonly cta?: string
}

export type ExpandedMetaCampaignData = {
  readonly name: string
  readonly objective: string
  readonly budget: { readonly amount: number; readonly currency: string; readonly period: string }
  readonly adSets: ExpandedMetaAdSet[]
}

// ─── Helpers ────────────────────────────────────────────

function quote(s: string): string {
  if (s.includes('\n')) {
    return '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
  }
  return `'${s.replace(/'/g, "\\'")}'`
}

function formatBudget(budget: ExpandedMetaCampaignData['budget']): string {
  const fn = budget.period === 'monthly' ? 'monthly' : 'daily'
  if (budget.currency === 'EUR') {
    return `${fn}(${budget.amount})`
  }
  return `${fn}(${budget.amount}, ${quote(budget.currency)})`
}

/** Map objective string to the meta.xxx() factory method name. */
function objectiveToMethod(objective: string): string {
  const map: Record<string, string> = {
    'awareness': 'awareness',
    'traffic': 'traffic',
    'engagement': 'engagement',
    'leads': 'leads',
    'sales': 'sales',
    'conversions': 'conversions',
    'app-promotion': 'appPromotion',
  }
  return map[objective] ?? 'traffic'
}

function formatTargeting(
  targeting: ExpandedMetaAdSet['targeting'],
  imports: Set<string>,
): string {
  const parts: string[] = []

  // Geo (required)
  imports.add('geo')
  parts.push(`geo(${targeting.geo.map(quote).join(', ')})`)

  // Age
  if (targeting.age) {
    imports.add('age')
    parts.push(`age(${targeting.age.min}, ${targeting.age.max})`)
  }

  // Interests
  if (targeting.interests && targeting.interests.length > 0) {
    imports.add('interests')
    const args = targeting.interests.map(
      (i) => `{ id: ${quote(i.id)}, name: ${quote(i.name)} }`,
    )
    if (args.length === 1) {
      parts.push(`...interests(${args[0]})`)
    } else {
      parts.push(`...interests(\n      ${args.join(',\n      ')},\n    )`)
    }
  }

  // Custom audiences
  if (targeting.customAudiences && targeting.customAudiences.length > 0) {
    imports.add('audience')
    for (const a of targeting.customAudiences) {
      parts.push(`audience(${quote(a)})`)
    }
  }

  imports.add('metaTargeting')

  if (parts.length <= 2) {
    return `metaTargeting(${parts.join(', ')})`
  }
  return `metaTargeting(\n    ${parts.join(',\n    ')},\n  )`
}

function formatCreative(ad: ExpandedMetaAd, hoistedUrl: string | undefined, hoistedCta: string | undefined, imports: Set<string>): string {
  const configParts: string[] = []
  configParts.push(`headline: ${quote(ad.headline)}`)
  configParts.push(`primaryText: ${quote(ad.primaryText)}`)
  if (ad.description) configParts.push(`description: ${quote(ad.description)}`)

  // Only emit url/cta if they differ from hoisted values
  if (ad.url && ad.url !== hoistedUrl) configParts.push(`url: ${quote(ad.url)}`)
  if (ad.cta && ad.cta !== hoistedCta) configParts.push(`cta: ${quote(ad.cta)}`)

  if (ad.format === 'video') {
    imports.add('video')
    return `video(${quote(ad.media)}, {\n      ${configParts.join(',\n      ')},\n    })`
  }

  imports.add('image')
  return `image(${quote(ad.media)}, {\n      ${configParts.join(',\n      ')},\n    })`
}

/**
 * Check if all ads in an ad set share the same value for a field.
 * Returns that value if shared, or undefined if not.
 */
function findSharedValue(ads: ExpandedMetaAd[], field: 'url' | 'cta'): string | undefined {
  if (ads.length === 0) return undefined
  const values = ads.map((a) => a[field]).filter(Boolean) as string[]
  if (values.length === 0) return undefined
  const first = values[0]!
  return values.every((v) => v === first) ? first : undefined
}

// ─── Main Codegen ───────────────────────────────────────

/**
 * Generate a standalone TypeScript campaign file from expanded Meta campaign data.
 *
 * The output uses SDK helpers (meta.traffic, image, video, metaTargeting,
 * geo, age, daily, monthly) and is fully self-contained.
 */
export function generateExpandedMetaCode(
  _seedName: string,
  data: ExpandedMetaCampaignData,
  variantSuffix: string,
): string {
  const campaignName = `${data.name} ${variantSuffix}`
  const imports = new Set<string>(['meta'])

  // Budget
  const budgetStr = formatBudget(data.budget)
  imports.add(data.budget.period === 'monthly' ? 'monthly' : 'daily')

  // Objective method
  const methodName = objectiveToMethod(data.objective)

  // Campaign config
  const configParts: string[] = []
  configParts.push(`budget: ${budgetStr}`)

  // Ad set chains
  const adSetLines: string[] = []

  for (const adSet of data.adSets) {
    // Targeting
    const targetingStr = formatTargeting(adSet.targeting, imports)

    // Ad set config
    const adSetConfigParts: string[] = []
    adSetConfigParts.push(`targeting: ${targetingStr}`)

    const configStr = `{ ${adSetConfigParts.join(', ')} }`

    // URL/CTA hoisting
    const hoistedUrl = adSet.url ?? findSharedValue(adSet.ads, 'url')
    const hoistedCta = adSet.cta ?? findSharedValue(adSet.ads, 'cta')

    // Content
    const contentParts: string[] = []
    if (hoistedUrl) contentParts.push(`url: ${quote(hoistedUrl)},`)
    if (hoistedCta) contentParts.push(`cta: ${quote(hoistedCta)},`)

    // Ads
    const adStrings = adSet.ads.map((ad) =>
      formatCreative(ad, hoistedUrl, hoistedCta, imports),
    )
    if (adStrings.length === 1) {
      contentParts.push(`ads: [\n    ${adStrings[0]},\n  ],`)
    } else if (adStrings.length > 1) {
      contentParts.push(`ads: [\n    ${adStrings.join(',\n    ')},\n  ],`)
    }

    const contentStr = contentParts.length > 0
      ? `{\n  ${contentParts.join('\n  ')}\n}`
      : undefined

    if (contentStr) {
      adSetLines.push(`  .adSet(${quote(adSet.name)}, ${configStr}, ${contentStr})`)
    } else {
      adSetLines.push(`  .adSet(${quote(adSet.name)}, ${configStr})`)
    }
  }

  // Build import statement
  const importList = Array.from(imports).sort()
  const lines: string[] = []
  lines.push(`import { ${importList.join(', ')} } from '@upspawn/ads'`)
  lines.push('')
  lines.push(`export default meta.${methodName}(${quote(campaignName)}, { ${configParts.join(', ')} })`)
  for (const adSetLine of adSetLines) {
    lines.push(adSetLine)
  }
  lines.push(`  .build()`)
  lines.push('')

  return lines.join('\n')
}
