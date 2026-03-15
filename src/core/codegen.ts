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

// ─── Image Ref Formatter ─────────────────────────────────

function formatImageRef(img: Record<string, unknown>, imports: Set<string>): string {
  const aspectRatio = img.aspectRatio as string | undefined
  const imgPath = img.path as string | undefined

  if (!imgPath) {
    // Raw asset resource name (from fetch, not a typed ImageRef)
    return `'${String(img)}'`
  }

  switch (aspectRatio) {
    case 'landscape':
      imports.add('landscape')
      return `landscape(${quote(imgPath)})`
    case 'square':
      imports.add('square')
      return `square(${quote(imgPath)})`
    case 'portrait':
      imports.add('portrait')
      return `portrait(${quote(imgPath)})`
    case 'logo':
      imports.add('logo')
      return `logo(${quote(imgPath)})`
    case 'logo-landscape':
      imports.add('logoLandscape')
      return `logoLandscape(${quote(imgPath)})`
    default:
      imports.add('landscape')
      return `landscape(${quote(imgPath)})`
  }
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
    case 'manual-cpm':
      return `'manual-cpm'`
    case 'target-cpm':
      return `'target-cpm'`
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

/** Detect which targeting helper imports are needed from the formatted targeting string. */
function addTargetingImports(targetingStr: string, imports: Set<string>): void {
  if (targetingStr.includes('geo(')) imports.add('geo')
  if (targetingStr.includes('languages(')) imports.add('languages')
  if (targetingStr.includes('weekdays(')) imports.add('weekdays')
  if (targetingStr.includes('hours(')) imports.add('hours')
  if (targetingStr.includes('device(')) imports.add('device')
  if (targetingStr.includes('demographics(')) imports.add('demographics')
  if (targetingStr.includes('scheduleBid(')) imports.add('scheduleBid')
  if (targetingStr.includes('audiences(')) imports.add('audiences')
  if (targetingStr.includes('audienceTargeting(')) imports.add('audienceTargeting')
  if (targetingStr.includes('remarketing(')) imports.add('remarketing')
  if (targetingStr.includes('inMarket(')) imports.add('inMarket')
  if (targetingStr.includes('affinity(')) imports.add('affinity')
  if (targetingStr.includes('customAudience(')) imports.add('customAudience')
  if (targetingStr.includes('customerMatch(')) imports.add('customerMatch')
  if (targetingStr.includes('placements(')) imports.add('placements')
  if (targetingStr.includes('topics(')) imports.add('topics')
  if (targetingStr.includes('contentKeywords(')) imports.add('contentKeywords')
  if (targetingStr.includes('targeting(')) imports.add('targeting')
}

function formatTargeting(targeting: Record<string, unknown>): string | null {
  const rules = targeting.rules as Array<Record<string, unknown>> | undefined
  if (!rules || rules.length === 0) return null

  const parts: string[] = []
  for (const rule of rules) {
    const type = rule.type as string
    if (type === 'geo') {
      const countries = rule.countries as string[]
      const bidAdjustments = rule.bidAdjustments as Record<string, number> | undefined
      if (bidAdjustments && Object.keys(bidAdjustments).length > 0) {
        const bidEntries = Object.entries(bidAdjustments).map(([k, v]) => `${quote(k)}: ${v}`).join(', ')
        parts.push(`geo(${countries.map(quote).join(', ')}, { bidAdjustments: { ${bidEntries} } })`)
      } else {
        parts.push(`geo(${countries.map(quote).join(', ')})`)
      }
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
    } else if (type === 'demographic') {
      const opts: string[] = []
      if (rule.ageRanges) opts.push(`ageRanges: [${(rule.ageRanges as string[]).map(v => quote(v)).join(', ')}]`)
      if (rule.genders) opts.push(`genders: [${(rule.genders as string[]).map(v => quote(v)).join(', ')}]`)
      if (rule.incomes) opts.push(`incomes: [${(rule.incomes as string[]).map(v => quote(v)).join(', ')}]`)
      if (rule.parentalStatuses) opts.push(`parentalStatuses: [${(rule.parentalStatuses as string[]).map(v => quote(v)).join(', ')}]`)
      if (opts.length > 0) parts.push(`demographics({ ${opts.join(', ')} })`)
    } else if (type === 'schedule-bid') {
      const day = rule.day as string
      const sh = rule.startHour as number
      const eh = rule.endHour as number
      const bidAdj = rule.bidAdjustment as number
      parts.push(`scheduleBid('${day}', ${sh}, ${eh}, ${bidAdj})`)
    } else if (type === 'placement') {
      const urls = rule.urls as string[]
      parts.push(`placements(${urls.map(quote).join(', ')})`)
    } else if (type === 'topic') {
      const topicNames = rule.topics as string[]
      parts.push(`topics(${topicNames.map(quote).join(', ')})`)
    } else if (type === 'content-keyword') {
      const kws = rule.keywords as string[]
      parts.push(`contentKeywords(${kws.map(quote).join(', ')})`)
    } else if (type === 'audience') {
      const refs = rule.audiences as Array<Record<string, unknown>>
      const mode = rule.mode as string
      const refParts = refs.map(ref => {
        const kind = ref.kind as string
        const id = (ref.listId ?? ref.audienceId ?? ref.categoryId) as string
        const name = ref.name as string | undefined
        const bidAdj = ref.bidAdjustment as number | undefined
        const optsParts = [
          name ? `name: ${quote(name)}` : null,
          bidAdj !== undefined ? `bidAdjustment: ${bidAdj}` : null,
        ].filter(Boolean)
        const optsStr = optsParts.length > 0 ? `, { ${optsParts.join(', ')} }` : ''
        switch (kind) {
          case 'remarketing': return `remarketing(${quote(id)}${optsStr})`
          case 'in-market': return `inMarket(${quote(id)}${optsStr})`
          case 'affinity': return `affinity(${quote(id)}${optsStr})`
          case 'custom': return `customAudience(${quote(id)}${optsStr})`
          case 'customer-match': return `customerMatch(${quote(id)}${optsStr})`
          default: return `remarketing(${quote(id)}${optsStr})`
        }
      })
      if (mode === 'targeting') {
        parts.push(`audienceTargeting(${refParts.join(', ')})`)
      } else {
        parts.push(`audiences(${refParts.join(', ')})`)
      }
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
  const assetGroupResources = resources.filter((r) => r.kind === 'assetGroup')
  const keywords = resources.filter((r) => r.kind === 'keyword')
  const ads = resources.filter((r) => r.kind === 'ad')
  const sitelinkResources = resources.filter((r) => r.kind === 'sitelink')
  const calloutResources = resources.filter((r) => r.kind === 'callout')
  const snippetResources = resources.filter((r) => r.kind === 'structuredSnippet')
  const callExtResources = resources.filter((r) => r.kind === 'callExtension')
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
      addTargetingImports(targetingStr, imports)
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

  // URL expansion (PMax-specific)
  const urlExpansion = props.urlExpansion as boolean | undefined
  if (urlExpansion !== undefined) {
    configParts.push(`urlExpansion: ${urlExpansion},`)
  }

  // Video campaigns are read-only — emit a comment instead of executable code
  const earlyChannelType = props.channelType as string | undefined
  if (earlyChannelType === 'video') {
    const lines: string[] = []
    lines.push(`// VIDEO campaign — read-only (Google Ads API does not support creation/updates)`)
    lines.push(`// Use Google Ads UI or Google Ads Scripts to manage this campaign`)
    lines.push(`//`)
    lines.push(`// Name: ${campaignName}`)
    lines.push(`// Status: ${props.status}`)
    lines.push(`// Budget: ${(budget.period as string) === 'daily' ? `${budget.amount}/day` : `${budget.amount}/month`}`)
    lines.push(`// Bidding: ${(bidding.type as string)}`)
    lines.push('')
    return lines.join('\n')
  }

  // Build the campaign header
  const lines: string[] = []
  lines.push(`// Imported from Google Ads on ${today}`)

  // Split negatives: campaign-level (2 path segments) vs ad-group-level (3+ segments)
  const campaignLevelNegatives = negativeResources.filter((n) => {
    const parts = n.path.split('/')
    return parts.length === 2 // campaignSlug/neg:text:MATCH
  })
  const adGroupLevelNegatives = negativeResources.filter((n) => {
    const parts = n.path.split('/')
    return parts.length > 2 // campaignSlug/groupSlug/neg:text:MATCH
  })

  const negativesByMatchType = groupBy(campaignLevelNegatives, (r) => r.properties.matchType as string)

  if (negativeResources.length > 0) {
    // Collect all match type helpers needed for negatives (campaign + ad group)
    for (const neg of negativeResources) {
      imports.add(matchTypeHelper(neg.properties.matchType as string))
    }
  }

  // Build groups
  const groupLines: string[] = []
  const campaignSlug = campaign.path

  for (const ag of adGroups) {
    // Find the group key from the path: campaignSlug/groupKey
    const groupKey = ag.path.replace(`${campaignSlug}/`, '')

    // Smart and App ad groups are handled inline in the config — skip them
    if ((ag.properties.adGroupType as string) === 'smart' || (ag.properties.adGroupType as string) === 'app') {
      continue
    }

    // Shopping ad groups are simple — just optional bid and status
    if ((ag.properties.adGroupType as string) === 'shopping') {
      const shoppingParts: string[] = []
      if (ag.properties.bid !== undefined) shoppingParts.push(`bid: ${ag.properties.bid}`)
      if ((ag.properties.status as string) === 'paused') shoppingParts.push(`status: 'paused'`)
      const body = shoppingParts.length > 0 ? `{ ${shoppingParts.join(', ')} }` : '{}'
      groupLines.push(`  .group(${quote(groupKey)}, ${body})`)
      continue
    }

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

    // Ads — detect RSA vs RDA vs Demand Gen
    let adLines = ''
    if (groupAds.length > 0) {
      const isDemandGen = groupAds[0]?.properties.type === 'demand-gen-multi-asset' || groupAds[0]?.properties.type === 'demand-gen-carousel'
      const isRDA = groupAds[0]?.properties.adType === 'responsive-display'

      if (isDemandGen) {
        const formatOneDemandGenAd = (adRes: Resource): string => {
          const adType = adRes.properties.type as string
          if (adType === 'demand-gen-multi-asset') {
            imports.add('demandGenMultiAsset')
            const hl = adRes.properties.headlines as string[]
            const desc = adRes.properties.descriptions as string[]
            const bn = adRes.properties.businessName as string
            const adFinalUrl = adRes.properties.finalUrl as string
            const callToAction = adRes.properties.callToAction as string | undefined
            const marketingImgs = adRes.properties.marketingImages as Array<Record<string, unknown>> | undefined
            const squareImgs = adRes.properties.squareMarketingImages as Array<Record<string, unknown>> | undefined
            const portraitImgs = adRes.properties.portraitMarketingImages as Array<Record<string, unknown>> | undefined
            const logoImgs = adRes.properties.logoImages as Array<Record<string, unknown>> | undefined

            const parts: string[] = [
              `headlines: [${hl.map(quote).join(', ')}],`,
              `descriptions: [${desc.map(quote).join(', ')}],`,
              `businessName: ${quote(bn)},`,
              `finalUrl: ${quote(adFinalUrl)},`,
            ]
            if (marketingImgs && marketingImgs.length > 0) {
              parts.push(`marketingImages: [${marketingImgs.map(img => formatImageRef(img, imports)).join(', ')}],`)
            }
            if (squareImgs && squareImgs.length > 0) {
              parts.push(`squareMarketingImages: [${squareImgs.map(img => formatImageRef(img, imports)).join(', ')}],`)
            }
            if (portraitImgs && portraitImgs.length > 0) {
              parts.push(`portraitMarketingImages: [${portraitImgs.map(img => formatImageRef(img, imports)).join(', ')}],`)
            }
            if (logoImgs && logoImgs.length > 0) {
              parts.push(`logoImages: [${logoImgs.map(img => formatImageRef(img, imports)).join(', ')}],`)
            }
            if (callToAction) parts.push(`callToAction: ${quote(callToAction)},`)

            return `demandGenMultiAsset({\n      ${parts.join('\n      ')}\n    })`
          } else {
            // demand-gen-carousel
            imports.add('demandGenCarousel')
            imports.add('carouselCard')
            const hl = adRes.properties.headline as string
            const desc = adRes.properties.description as string
            const bn = adRes.properties.businessName as string
            const adFinalUrl = adRes.properties.finalUrl as string
            const callToAction = adRes.properties.callToAction as string | undefined
            const cards = adRes.properties.cards as Array<Record<string, unknown>>

            const parts: string[] = [
              `headline: ${quote(hl)},`,
              `description: ${quote(desc)},`,
              `businessName: ${quote(bn)},`,
              `finalUrl: ${quote(adFinalUrl)},`,
            ]
            if (callToAction) parts.push(`callToAction: ${quote(callToAction)},`)

            const cardStrs = cards.map(card => {
              const cardParts: string[] = [`headline: ${quote(card.headline as string)}`]
              cardParts.push(`finalUrl: ${quote(card.finalUrl as string)}`)
              if (card.callToAction) cardParts.push(`callToAction: ${quote(card.callToAction as string)}`)
              return `carouselCard({ ${cardParts.join(', ')} })`
            })
            parts.push(`cards: [\n        ${cardStrs.join(',\n        ')},\n      ],`)

            return `demandGenCarousel({\n      ${parts.join('\n      ')}\n    })`
          }
        }

        if (groupAds.length === 1) {
          adLines = `ad: ${formatOneDemandGenAd(groupAds[0]!)},`
        } else {
          const formatted = groupAds.map(a => formatOneDemandGenAd(a))
          adLines = `ad: [\n      ${formatted.join(',\n      ')},\n    ],`
        }
      } else if (isRDA) {
        const formatOneRDA = (adRes: Resource): string => {
          imports.add('responsiveDisplay')

          const hl = adRes.properties.headlines as string[]
          const desc = adRes.properties.descriptions as string[]
          const longHL = adRes.properties.longHeadline as string
          const bn = adRes.properties.businessName as string
          const adFinalUrl = adRes.properties.finalUrl as string
          const marketingImgs = adRes.properties.marketingImages as Array<{ type: string; path: string; aspectRatio: string }> | undefined
          const squareImgs = adRes.properties.squareMarketingImages as Array<{ type: string; path: string; aspectRatio: string }> | undefined
          const logoImgs = adRes.properties.logoImages as Array<{ type: string; path: string; aspectRatio: string }> | undefined
          const mainColor = adRes.properties.mainColor as string | undefined
          const accentColor = adRes.properties.accentColor as string | undefined
          const callToAction = adRes.properties.callToAction as string | undefined

          const rdaParts: string[] = [
            `headlines: [${hl.map(quote).join(', ')}],`,
            `longHeadline: ${quote(longHL)},`,
            `descriptions: [${desc.map(quote).join(', ')}],`,
            `businessName: ${quote(bn)},`,
            `finalUrl: ${quote(adFinalUrl)},`,
          ]

          // Image references
          if (marketingImgs && marketingImgs.length > 0) {
            const imgRefs = marketingImgs.map(img => formatImageRef(img, imports))
            rdaParts.push(`marketingImages: [${imgRefs.join(', ')}],`)
          } else {
            rdaParts.push(`marketingImages: [],`)
          }
          if (squareImgs && squareImgs.length > 0) {
            const imgRefs = squareImgs.map(img => formatImageRef(img, imports))
            rdaParts.push(`squareMarketingImages: [${imgRefs.join(', ')}],`)
          } else {
            rdaParts.push(`squareMarketingImages: [],`)
          }
          if (logoImgs && logoImgs.length > 0) {
            const imgRefs = logoImgs.map(img => formatImageRef(img, imports))
            rdaParts.push(`logoImages: [${imgRefs.join(', ')}],`)
          }
          if (mainColor) rdaParts.push(`mainColor: ${quote(mainColor)},`)
          if (accentColor) rdaParts.push(`accentColor: ${quote(accentColor)},`)
          if (callToAction) rdaParts.push(`callToAction: ${quote(callToAction)},`)

          return `responsiveDisplay({\n      ${rdaParts.join('\n      ')}\n    })`
        }

        if (groupAds.length === 1) {
          adLines = `ad: ${formatOneRDA(groupAds[0]!)},`
        } else {
          const formatted = groupAds.map(a => formatOneRDA(a))
          adLines = `ad: [\n      ${formatted.join(',\n      ')},\n    ],`
        }
      } else {
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
    }

    // Ad group negatives
    const groupNegs = adGroupLevelNegatives.filter((n) => n.path.startsWith(`${ag.path}/`))
    let groupNegLine = ''
    if (groupNegs.length > 0) {
      const negsByMatch = groupBy(groupNegs, (n) => n.properties.matchType as string)
      const negParts: string[] = []
      for (const [matchType, negs] of Object.entries(negsByMatch)) {
        const helper = matchTypeHelper(matchType)
        const texts = negs.map((n) => n.properties.text as string)
        negParts.push(`...${helper}(${formatStringList(texts)})`)
      }
      groupNegLine = `negatives: [${negParts.join(', ')}],`
    }

    // Group-level targeting
    const groupTargeting = ag.properties.targeting as Record<string, unknown> | undefined
    let groupTargetingStr: string | null = null
    if (groupTargeting) {
      groupTargetingStr = formatTargeting(groupTargeting)
      if (groupTargetingStr) {
        addTargetingImports(groupTargetingStr, imports)
      }
    }

    // Determine whether to use .group() or .locale()
    const adGroupType = ag.properties.adGroupType as string | undefined
    const skipKeywords = adGroupType === 'display' || adGroupType === 'demand-gen'
    const negLine = groupNegLine ? `\n    ${groupNegLine}` : ''

    // Channel controls (Demand Gen only)
    const channels = ag.properties.channels as Record<string, boolean> | undefined
    let channelsLine = ''
    if (channels) {
      const channelEntries = Object.entries(channels)
        .filter(([_, v]) => v !== true) // only emit non-default (false) values
        .map(([k, v]) => `${k}: ${v}`)
      if (channelEntries.length > 0) {
        channelsLine = `\n    channels: { ${channelEntries.join(', ')} },`
      }
    }

    // Build the group body parts
    const bodyParts = [
      ...(skipKeywords ? [] : [keywordsLine]),
      adLines,
    ].filter(Boolean).join('\n    ')
    const extras = `${channelsLine}${negLine}`

    if (groupTargetingStr) {
      groupLines.push(
        `  .locale(${quote(groupKey)}, ${groupTargetingStr}, {\n    ${bodyParts}${extras}\n  })`,
      )
    } else {
      groupLines.push(`  .group(${quote(groupKey)}, {\n    ${bodyParts}${extras}\n  })`)
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

  // Structured Snippets
  let snippetLine = ''
  if (snippetResources.length > 0) {
    imports.add('snippet')
    const ssParts: string[] = []
    for (const ss of snippetResources) {
      const header = ss.properties.header as string
      const values = ss.properties.values as string[]
      ssParts.push(`snippet(${quote(header)}, ${values.map(quote).join(', ')})`)
    }
    snippetLine = `  .snippets(\n    ${ssParts.join(',\n    ')},\n  )`
  }

  // Call Extensions
  let callExtLine = ''
  if (callExtResources.length > 0) {
    imports.add('call')
    const ceParts: string[] = []
    for (const ce of callExtResources) {
      const phone = ce.properties.phoneNumber as string
      const country = ce.properties.countryCode as string
      ceParts.push(`call(${quote(phone)}, ${quote(country)})`)
    }
    callExtLine = `  .calls(\n    ${ceParts.join(',\n    ')},\n  )`
  }

  // Negatives — campaign-level only (ad-group negatives are emitted inside each group)
  if (campaignLevelNegatives.length > 0) {
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

  // Smart campaign settings — add businessName, finalUrl, language, keywordThemes, ad to config
  const channelType = props.channelType as string | undefined
  if (channelType === 'smart') {
    const bizName = props.businessName as string | undefined
    if (bizName) configParts.push(`businessName: ${quote(bizName)},`)
    const bizProfile = props.businessProfile as string | undefined
    if (bizProfile) configParts.push(`businessProfile: ${quote(bizProfile)},`)
    const smartFinalUrl = props.finalUrl as string | undefined
    if (smartFinalUrl) configParts.push(`finalUrl: ${quote(smartFinalUrl)},`)
    const lang = props.language as string | undefined
    if (lang) configParts.push(`language: ${quote(lang)},`)
    const kwThemes = props.keywordThemes as string[] | undefined
    if (kwThemes && kwThemes.length > 0) {
      configParts.push(`keywordThemes: [${kwThemes.map(quote).join(', ')}],`)
    }

    // Inline the ad from the ad resource
    const smartAdRes = ads.find(a => a.properties.adType === 'smart')
    if (smartAdRes) {
      imports.add('smartAd')
      const hl = smartAdRes.properties.headlines as string[]
      const desc = smartAdRes.properties.descriptions as string[]
      configParts.push(`ad: smartAd({\n    headlines: [${hl.map(quote).join(', ')}],\n    descriptions: [${desc.map(quote).join(', ')}],\n  }),`)
    }
  }

  // App campaign settings — add appId, appStore, goal, ad to config
  if (channelType === 'app') {
    const appId = props.appId as string | undefined
    if (appId) configParts.push(`appId: ${quote(appId)},`)
    const appStore = props.appStore as string | undefined
    if (appStore) configParts.push(`appStore: ${quote(appStore)},`)
    const goal = props.goal as string | undefined
    if (goal) configParts.push(`goal: ${quote(goal)},`)

    // Inline the ad from the ad resource
    const appAdRes = ads.find(a => a.properties.adType === 'app')
    if (appAdRes) {
      imports.add('appAd')
      const hl = appAdRes.properties.headlines as string[]
      const desc = appAdRes.properties.descriptions as string[]
      const adParts: string[] = [
        `headlines: [${hl.map(quote).join(', ')}],`,
        `descriptions: [${desc.map(quote).join(', ')}],`,
      ]
      const images = appAdRes.properties.images as Array<Record<string, unknown>> | undefined
      if (images && images.length > 0) {
        adParts.push(`images: [${images.map(img => formatImageRef(img, imports)).join(', ')}],`)
      }
      const videos = appAdRes.properties.videos as string[] | undefined
      if (videos && videos.length > 0) {
        adParts.push(`videos: [${videos.map(quote).join(', ')}],`)
      }
      configParts.push(`ad: appAd({\n    ${adParts.join('\n    ')}\n  }),`)
    }
  }

  // Shopping settings — add merchantId etc. to config
  if (channelType === 'shopping') {
    const shoppingSetting = props.shoppingSetting as Record<string, unknown> | undefined
    if (shoppingSetting) {
      configParts.push(`merchantId: ${shoppingSetting.merchantId},`)
      if (shoppingSetting.campaignPriority !== undefined) {
        configParts.push(`campaignPriority: ${shoppingSetting.campaignPriority},`)
      }
      if (shoppingSetting.enableLocal !== undefined) {
        configParts.push(`enableLocal: ${shoppingSetting.enableLocal},`)
      }
      if (shoppingSetting.feedLabel !== undefined) {
        configParts.push(`feedLabel: ${quote(shoppingSetting.feedLabel as string)},`)
      }
    }
  }

  // Campaign declaration — detect channel type
  const builderMethod = channelType === 'display' ? 'display'
    : channelType === 'performance-max' ? 'performanceMax'
    : channelType === 'shopping' ? 'shopping'
    : channelType === 'demand-gen' ? 'demandGen'
    : channelType === 'smart' ? 'smart'
    : channelType === 'app' ? 'app'
    : 'search'
  lines.push(`export default google.${builderMethod}(${quote(campaignName)}, {`)
  for (const part of configParts) {
    lines.push(`  ${part}`)
  }
  lines.push(`})`)

  // Chain asset groups (PMax) or ad groups (Search/Display)
  // Smart and App campaigns are flat — ad is part of the config, no group chains
  if (channelType === 'smart' || channelType === 'app') {
    // No groups to chain — everything is in the config
  } else if (channelType === 'performance-max') {
    for (const ag of assetGroupResources) {
      const agKey = ag.path.replace(`${campaignSlug}/`, '')
      const agProps = ag.properties

      const agParts: string[] = []
      agParts.push(`finalUrls: [${(agProps.finalUrls as string[]).map(quote).join(', ')}],`)
      agParts.push(`headlines: [${formatStringList(agProps.headlines as string[])}],`)
      agParts.push(`longHeadlines: [${formatStringList(agProps.longHeadlines as string[])}],`)
      agParts.push(`descriptions: [${formatStringList(agProps.descriptions as string[])}],`)
      agParts.push(`businessName: ${quote(agProps.businessName as string)},`)

      // Optional fields
      if (agProps.finalMobileUrls) {
        agParts.push(`finalMobileUrls: [${(agProps.finalMobileUrls as string[]).map(quote).join(', ')}],`)
      }
      if (agProps.videos) {
        agParts.push(`videos: [${(agProps.videos as string[]).map(quote).join(', ')}],`)
      }
      if (agProps.callToAction) {
        agParts.push(`callToAction: ${quote(agProps.callToAction as string)},`)
      }
      if (agProps.path1) agParts.push(`path1: ${quote(agProps.path1 as string)},`)
      if (agProps.path2) agParts.push(`path2: ${quote(agProps.path2 as string)},`)

      // Status (only emit if paused — enabled is default)
      const agStatus = agProps.status as string | undefined
      if (agStatus === 'paused') {
        agParts.push(`status: 'paused',`)
      }

      lines.push(`  .assetGroup(${quote(agKey)}, {\n    ${agParts.join('\n    ')}\n  })`)
    }
  } else {
    for (const gl of groupLines) {
      lines.push(gl)
    }
  }

  // Chain sitelinks
  if (sitelinkLine) lines.push(sitelinkLine)

  // Chain callouts
  if (calloutLine) lines.push(calloutLine)

  // Chain structured snippets
  if (snippetLine) lines.push(snippetLine)

  // Chain call extensions
  if (callExtLine) lines.push(callExtLine)

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
