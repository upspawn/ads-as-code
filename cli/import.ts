import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { createGoogleClient } from '../src/google/api.ts'
import { Cache } from '../src/core/cache.ts'
import { generateCampaignFile, extractSharedConfig, campaignToFilename } from '../src/core/codegen.ts'
import { flattenAll } from '../src/core/flatten.ts'
import type { GoogleSearchCampaign } from '../src/google/types.ts'
import type { Resource } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'

const IMPORT_USAGE = `
ads import — Import campaigns from Google Ads and generate TypeScript files

Fetches all active campaigns from your Google Ads account and generates
idiomatic TypeScript campaign files using the @upspawn/ads SDK.

Flags:
  --all         Include paused campaigns
  --filter      Only import campaigns matching a glob pattern (e.g. "Search*")
  --json        Output results as JSON
  --help, -h    Show this help message
`.trim()

/**
 * Fetch all campaigns and their child resources from Google Ads.
 * Returns resources grouped by campaign path.
 */
async function fetchAllCampaigns(
  client: { query: (gaql: string) => Promise<Record<string, unknown>[]>; customerId: string },
  options: { includePaused?: boolean },
): Promise<Map<string, { name: string; resources: Resource[] }>> {
  const statusFilter = options.includePaused
    ? `campaign.status IN ('ENABLED', 'PAUSED')`
    : `campaign.status = 'ENABLED'`

  // Fetch campaigns
  const campaignRows = await client.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      campaign_budget.period,
      campaign.bidding_strategy_type
    FROM campaign
    WHERE ${statusFilter}
      AND campaign.advertising_channel_type = 'SEARCH'
    ORDER BY campaign.name
  `)

  const campaignMap = new Map<string, { name: string; resources: Resource[] }>()

  for (const row of campaignRows) {
    // google-ads-api returns snake_case fields
    const c = row.campaign as Record<string, unknown>
    const budget = (row.campaign_budget ?? row.campaignBudget) as Record<string, unknown> | undefined
    const campaignId = String(c.id)
    const name = c.name as string
    const rawStatus = c.status
    const status = (rawStatus === 2 || rawStatus === 'ENABLED' || rawStatus === 'enabled') ? 'enabled' : 'paused'

    // Parse budget — snake_case from gRPC
    const amountMicros = Number(budget?.amount_micros ?? budget?.amountMicros ?? 0)
    const amount = amountMicros / 1_000_000
    const period = 'daily' as const  // Google Ads budgets are always daily

    // Parse bidding — enum: 2=MANUAL_CPC, 6=MAXIMIZE_CONVERSIONS, 9=TARGET_CPA, 10=TARGET_SPEND(=max clicks), 11=MAXIMIZE_CLICKS
    const biddingType = c.bidding_strategy_type ?? c.biddingStrategyType
    const bidding = parseBiddingType(biddingType, c)

    // Build campaign resource path
    const campaignPath = campaignToFilename(name)

    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: campaignPath,
        platformId: `customers/${client.customerId}/campaigns/${campaignId}`,
        properties: {
          name,
          status,
          budget: { amount, currency: 'EUR', period: period === 'daily' ? 'daily' : 'monthly' },
          bidding,
          targeting: { rules: [] },
        },
      },
    ]

    campaignMap.set(campaignPath, { name, resources })
  }

  // Fetch ad groups
  const adGroupRows = await client.query(`
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group.status
    FROM ad_group
    WHERE ${statusFilter}
      AND ad_group.status != 'REMOVED'
    ORDER BY ad_group.name
  `)

  for (const row of adGroupRows) {
    const c = row.campaign as Record<string, unknown>
    const ag = (row.ad_group ?? row.adGroup) as Record<string, unknown>
    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry) continue

    const groupKey = campaignToFilename(ag.name as string)
    const agPath = `${campaignPath}/${groupKey}`
    const rawAgStatus = ag.status
    const status = (rawAgStatus === 2 || rawAgStatus === 'ENABLED' || rawAgStatus === 'enabled') ? 'enabled' : 'paused'

    entry.resources.push({
      kind: 'adGroup',
      path: agPath,
      platformId: `customers/${client.customerId}/adGroups/${ag.id}`,
      properties: {
        status,
        targeting: undefined,
      },
    })
  }

  // Fetch keywords
  const keywordRows = await client.query(`
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.resource_name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status
    FROM ad_group_criterion
    WHERE ${statusFilter}
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY ad_group_criterion.keyword.text
  `)

  // match_type enum: 2=EXACT, 3=PHRASE, 4=BROAD (negatives), also seen as strings
  const MATCH_TYPE_MAP: Record<number | string, string> = {
    2: 'EXACT', 3: 'PHRASE', 4: 'BROAD', 5: 'BROAD',
    'EXACT': 'EXACT', 'PHRASE': 'PHRASE', 'BROAD': 'BROAD',
  }

  for (const row of keywordRows) {
    const c = row.campaign as Record<string, unknown>
    const ag = (row.ad_group ?? row.adGroup) as Record<string, unknown>
    const criterion = (row.ad_group_criterion ?? row.adGroupCriterion) as Record<string, unknown>
    const keyword = (criterion?.keyword) as Record<string, unknown> | undefined
    if (!keyword) continue

    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry) continue

    const groupKey = campaignToFilename((ag.name as string))
    const text = keyword.text as string
    const rawMatchType = keyword.match_type ?? keyword.matchType
    const matchType = MATCH_TYPE_MAP[rawMatchType as number | string] ?? 'BROAD'

    const criterionResourceName = (criterion.resource_name ?? criterion.resourceName) as string | undefined

    entry.resources.push({
      kind: 'keyword',
      path: `${campaignPath}/${groupKey}/kw:${text.toLowerCase()}:${matchType}`,
      platformId: criterionResourceName ?? undefined,
      properties: {
        text,
        matchType,
      },
    })
  }

  // Fetch ads (RSA)
  const adRows = await client.query(`
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.final_urls,
      ad_group_ad.status
    FROM ad_group_ad
    WHERE ${statusFilter}
      AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
      AND ad_group_ad.status != 'REMOVED'
  `)

  for (const row of adRows) {
    const c = row.campaign as Record<string, unknown>
    const ag = (row.ad_group ?? row.adGroup) as Record<string, unknown>
    const adGroupAd = (row.ad_group_ad ?? row.adGroupAd) as Record<string, unknown>
    const ad = adGroupAd.ad as Record<string, unknown>
    const rsa = (ad.responsive_search_ad ?? ad.responsiveSearchAd) as Record<string, unknown>

    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry) continue

    const groupKey = campaignToFilename(ag.name as string)

    const headlineAssets = (rsa?.headlines as Array<{ text: string }>) ?? []
    const descAssets = (rsa?.descriptions as Array<{ text: string }>) ?? []
    const headlines = headlineAssets.map((h) => h.text).sort()
    const descriptions = descAssets.map((d) => d.text).sort()
    const finalUrls = (ad.final_urls ?? ad.finalUrls) as string[] ?? []
    const finalUrl = finalUrls[0] ?? ''

    // Generate a stable hash-like id from content
    const adId = String(ad.id ?? 'unknown')
    const adPath = `${campaignPath}/${groupKey}/rsa:${adId}`

    entry.resources.push({
      kind: 'ad',
      path: adPath,
      platformId: `customers/${client.customerId}/ads/${ad.id}`,
      properties: {
        headlines,
        descriptions,
        finalUrl,
      },
    })
  }

  // Fetch campaign-level negative keywords
  const negRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_criterion.resource_name,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE ${statusFilter}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
  `)

  for (const row of negRows) {
    const c = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const keyword = criterion.keyword as Record<string, unknown>

    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry) continue

    const text = keyword.text as string
    const rawMatchType = keyword.match_type ?? keyword.matchType
    const matchType = MATCH_TYPE_MAP[rawMatchType as number | string] ?? 'BROAD'
    const negResourceName = (criterion.resource_name ?? criterion.resourceName) as string | undefined

    entry.resources.push({
      kind: 'negative',
      path: `${campaignPath}/neg:${text.toLowerCase()}:${matchType}`,
      platformId: negResourceName ?? undefined,
      properties: {
        text,
        matchType,
      },
    })
  }

  // Fetch sitelink extensions
  const sitelinkRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_asset.resource_name,
      campaign_asset.field_type,
      asset.id,
      asset.sitelink_asset.link_text,
      asset.sitelink_asset.description1,
      asset.sitelink_asset.description2,
      asset.final_urls
    FROM campaign_asset
    WHERE ${statusFilter}
      AND campaign_asset.field_type = 'SITELINK'
      AND campaign_asset.status != 'REMOVED'
  `)

  for (const row of sitelinkRows) {
    const c = row.campaign as Record<string, unknown>
    const asset = row.asset as Record<string, unknown> | undefined
    const sitelink = (asset?.sitelink_asset ?? asset?.sitelinkAsset) as Record<string, unknown> | undefined

    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry || !sitelink) continue

    const assetId = String(asset?.id ?? 'unknown')
    const linkText = String(sitelink?.link_text ?? sitelink?.linkText ?? '')
    const desc1 = (sitelink?.description1 as string | undefined) || undefined
    const desc2 = (sitelink?.description2 as string | undefined) || undefined
    const finalUrls = (asset?.final_urls ?? asset?.finalUrls ?? []) as string[]
    const url = finalUrls[0] ?? ''

    entry.resources.push({
      kind: 'sitelink',
      path: `${campaignPath}/sl:${linkText.toLowerCase()}`,
      platformId: `customers/${client.customerId}/assets/${assetId}`,
      properties: {
        text: linkText,
        url,
        description1: desc1,
        description2: desc2,
      },
    })
  }

  // Fetch callout extensions
  const calloutRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_asset.resource_name,
      campaign_asset.field_type,
      asset.id,
      asset.callout_asset.callout_text
    FROM campaign_asset
    WHERE ${statusFilter}
      AND campaign_asset.field_type = 'CALLOUT'
      AND campaign_asset.status != 'REMOVED'
  `)

  for (const row of calloutRows) {
    const c = row.campaign as Record<string, unknown>
    const asset = row.asset as Record<string, unknown> | undefined
    const callout = (asset?.callout_asset ?? asset?.calloutAsset) as Record<string, unknown> | undefined

    const campaignPath = campaignToFilename(c.name as string)
    const entry = campaignMap.get(campaignPath)
    if (!entry || !callout) continue

    const assetId = String(asset?.id ?? 'unknown')
    const calloutText = String(callout?.callout_text ?? callout?.calloutText ?? '')

    entry.resources.push({
      kind: 'callout',
      path: `${campaignPath}/co:${calloutText.toLowerCase()}`,
      platformId: `customers/${client.customerId}/assets/${assetId}`,
      properties: {
        text: calloutText,
      },
    })
  }

  // Fetch geo + language targeting
  const targetingRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_criterion.type,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.language.language_constant
    FROM campaign_criterion
    WHERE ${statusFilter}
      AND campaign_criterion.type IN ('LOCATION', 'LANGUAGE')
      AND campaign_criterion.negative = FALSE
  `)

  // Reverse-lookup maps for geo/language constants
  const { GEO_TARGETS_REVERSE, LANGUAGE_CRITERIA_REVERSE } = await import('../src/google/constants.ts')

  // Build full-path reverse maps (geoTargetConstants/2840 → US)
  const GEO_REVERSE: Record<string, string> = {}
  const LANG_REVERSE: Record<string, string> = {}
  for (const [id, code] of Object.entries(GEO_TARGETS_REVERSE)) {
    GEO_REVERSE[`geoTargetConstants/${id}`] = code
  }
  for (const [id, code] of Object.entries(LANGUAGE_CRITERIA_REVERSE)) {
    LANG_REVERSE[`languageConstants/${id}`] = code
  }

  // Criterion type enum: gRPC returns numeric values
  // 6=LOCATION, 7=AD_SCHEDULE, 16=LANGUAGE
  const CRITERION_TYPE_MAP: Record<number | string, string> = {
    6: 'LOCATION', 7: 'AD_SCHEDULE', 16: 'LANGUAGE',
    'LOCATION': 'LOCATION', 'AD_SCHEDULE': 'AD_SCHEDULE', 'LANGUAGE': 'LANGUAGE',
  }

  // Group targeting by campaign
  const campaignGeo = new Map<string, string[]>()
  const campaignLang = new Map<string, string[]>()

  for (const row of targetingRows) {
    const c = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignPath = campaignToFilename(c.name as string)
    const rawType = criterion.type as number | string
    const type = CRITERION_TYPE_MAP[rawType] ?? String(rawType)

    if (type === 'LOCATION') {
      const location = criterion.location as Record<string, unknown>
      const geoConstant = (location?.geoTargetConstant ?? location?.geo_target_constant) as string
      const code = GEO_REVERSE[geoConstant] ?? geoConstant
      if (!campaignGeo.has(campaignPath)) campaignGeo.set(campaignPath, [])
      campaignGeo.get(campaignPath)!.push(code)
    } else if (type === 'LANGUAGE') {
      const language = criterion.language as Record<string, unknown>
      const langConstant = (language?.languageConstant ?? language?.language_constant) as string
      const code = LANG_REVERSE[langConstant] ?? langConstant
      if (!campaignLang.has(campaignPath)) campaignLang.set(campaignPath, [])
      campaignLang.get(campaignPath)!.push(code)
    }
  }

  // Fetch ad schedule targeting
  const scheduleRows = await client.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign_criterion.ad_schedule.day_of_week,
      campaign_criterion.ad_schedule.start_hour,
      campaign_criterion.ad_schedule.end_hour
    FROM campaign_criterion
    WHERE ${statusFilter}
      AND campaign_criterion.type = 'AD_SCHEDULE'
  `)

  // Day of week from gRPC is numeric: 2=MON, 3=TUE, 4=WED, 5=THU, 6=FRI, 7=SAT, 8=SUN
  const DAY_OF_WEEK_MAP: Record<number | string, string> = {
    2: 'mon', 3: 'tue', 4: 'wed', 5: 'thu', 6: 'fri', 7: 'sat', 8: 'sun',
    'MONDAY': 'mon', 'TUESDAY': 'tue', 'WEDNESDAY': 'wed', 'THURSDAY': 'thu',
    'FRIDAY': 'fri', 'SATURDAY': 'sat', 'SUNDAY': 'sun',
  }

  // Group schedule by campaign: collect all days and hour ranges
  const campaignScheduleDays = new Map<string, Set<string>>()
  const campaignScheduleHours = new Map<string, { startHour: number; endHour: number }>()

  for (const row of scheduleRows) {
    const c = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const adSchedule = (criterion.ad_schedule ?? criterion.adSchedule) as Record<string, unknown>
    if (!adSchedule) continue

    const campaignPath = campaignToFilename(c.name as string)
    const rawDay = (adSchedule.day_of_week ?? adSchedule.dayOfWeek) as number | string
    const day = DAY_OF_WEEK_MAP[rawDay]
    const startHour = Number(adSchedule.start_hour ?? adSchedule.startHour ?? 0)
    const endHour = Number(adSchedule.end_hour ?? adSchedule.endHour ?? 24)

    if (day) {
      if (!campaignScheduleDays.has(campaignPath)) campaignScheduleDays.set(campaignPath, new Set())
      campaignScheduleDays.get(campaignPath)!.add(day)
    }
    // Track hours (assume consistent across all schedule entries for a campaign)
    if (startHour !== 0 || endHour !== 24) {
      campaignScheduleHours.set(campaignPath, { startHour, endHour })
    }
  }

  // Update campaign resources with targeting
  for (const [campaignPath, entry] of campaignMap) {
    const campaign = entry.resources.find((r) => r.kind === 'campaign')
    if (!campaign) continue

    const rules: Array<Record<string, unknown>> = []
    const geo = campaignGeo.get(campaignPath)
    if (geo && geo.length > 0) {
      rules.push({ type: 'geo', countries: geo.sort() })
    }
    const lang = campaignLang.get(campaignPath)
    if (lang && lang.length > 0) {
      rules.push({ type: 'language', languages: lang.sort() })
    }

    // Add schedule if present
    const scheduleDays = campaignScheduleDays.get(campaignPath)
    const scheduleHours = campaignScheduleHours.get(campaignPath)
    if (scheduleDays || scheduleHours) {
      const scheduleRule: Record<string, unknown> = { type: 'schedule' }
      if (scheduleDays && scheduleDays.size > 0) {
        scheduleRule.days = [...scheduleDays].sort((a, b) => {
          const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
          return order.indexOf(a) - order.indexOf(b)
        })
      }
      if (scheduleHours) {
        scheduleRule.startHour = scheduleHours.startHour
        scheduleRule.endHour = scheduleHours.endHour
      }
      rules.push(scheduleRule)
    }

    if (rules.length > 0) {
      ;(campaign.properties as Record<string, unknown>).targeting = { rules }
    }
  }

  return campaignMap
}

function parseBiddingType(
  type: unknown,
  campaign: Record<string, unknown>,
): Record<string, unknown> {
  // google-ads-api returns enums as numbers:
  // 2=MANUAL_CPC, 3=MANUAL_CPM, 6=MAXIMIZE_CONVERSIONS, 9=TARGET_CPA, 11=MAXIMIZE_CLICKS
  const t = typeof type === 'number' ? type : String(type)
  switch (t) {
    case 6:
    case 'MAXIMIZE_CONVERSIONS':
      return { type: 'maximize-conversions' }
    case 10:
    case 'TARGET_SPEND':
    case 11:
    case 'MAXIMIZE_CLICKS':
      return { type: 'maximize-clicks' }
    case 2:
    case 'MANUAL_CPC':
      return { type: 'manual-cpc' }
    case 9:
    case 'TARGET_CPA': {
      const targetCpa = campaign.targetCpa as Record<string, unknown> | undefined
      const micros = Number(targetCpa?.targetCpaMicros ?? 0)
      return { type: 'target-cpa', targetCpa: micros / 1_000_000 }
    }
    default:
      return { type: 'maximize-conversions' }
  }
}

function matchesGlob(name: string, pattern: string): boolean {
  // Simple glob: support * as wildcard
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i',
  )
  return regex.test(name)
}

export async function runImport(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(IMPORT_USAGE)
    return
  }

  const rootDir = process.cwd()
  const includeAll = args.includes('--all')
  const filterIdx = args.indexOf('--filter')
  const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined

  // 1. Load config
  const config = await loadConfig(rootDir)
  if (!config?.google) {
    console.error('Error: No Google Ads configuration found in ads.config.ts')
    console.error('Run `ads init` first, then configure your Google Ads credentials.')
    process.exit(1)
  }

  // 2. Create Google client
  const googleConfig = config.google
  const client = await createGoogleClient({
    type: 'env',
    ...('customerId' in googleConfig ? {} : {}),
  } as { type: 'env' })

  console.log(`Fetching campaigns from Google Ads (customer ${client.customerId})...`)

  // 3. Fetch all campaigns
  const campaignMap = await fetchAllCampaigns(client, { includePaused: includeAll })

  // 4. Filter if needed
  let campaigns = Array.from(campaignMap.entries())
  if (filter) {
    campaigns = campaigns.filter(([_, { name }]) => matchesGlob(name, filter))
    if (campaigns.length === 0) {
      console.log(`No campaigns matching "${filter}" found.`)
      return
    }
  }

  // 5. Ensure campaigns/ dir exists
  const campaignsDir = join(rootDir, 'campaigns')
  if (!existsSync(campaignsDir)) {
    mkdirSync(campaignsDir, { recursive: true })
  }

  // 6. Generate files
  const written: string[] = []
  const allResources: Resource[][] = []

  for (const [slug, { name, resources }] of campaigns) {
    allResources.push(resources)
    const code = generateCampaignFile(resources, name)
    const filename = `${slug}.ts`
    const filepath = join(campaignsDir, filename)
    await Bun.write(filepath, code)
    written.push(filename)
  }

  // 7. Extract shared config
  const shared = extractSharedConfig(allResources)

  if (shared.targeting) {
    const targetingPath = join(rootDir, 'targeting.ts')
    await Bun.write(targetingPath, shared.targeting)
    written.push('targeting.ts')
  }

  if (shared.negatives) {
    const negativesPath = join(rootDir, 'negatives.ts')
    await Bun.write(negativesPath, shared.negatives)
    written.push('negatives.ts')
  }

  // 8. Update cache — re-flatten generated files to guarantee path consistency
  //    This ensures the cache paths match exactly what `ads plan` would generate
  //    when it flattens the same .ts files via flattenAll().
  const cacheDir = join(rootDir, '.ads')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  const cache = new Cache(join(cacheDir, 'cache.db'))

  // Build a platformId lookup from the import resources (keyed by kind + content)
  // so we can associate platformIds with the re-flattened paths.
  const platformIdByKey = new Map<string, string>()
  for (const [_, { resources: importResources }] of campaigns) {
    for (const r of importResources) {
      if (!r.platformId) continue
      // Use kind + a content-based key for matching
      if (r.kind === 'campaign') {
        const name = (r.properties.name as string) ?? ''
        platformIdByKey.set(`campaign:${name}`, r.platformId)
      } else if (r.kind === 'adGroup') {
        // Path format: campaignSlug/groupSlug — use properties if available, fall back to path
        platformIdByKey.set(`adGroup:${r.path}`, r.platformId)
      } else if (r.kind === 'keyword') {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        const matchType = (r.properties.matchType as string) ?? ''
        // Include campaign+group context from path prefix
        const pathPrefix = r.path.split('/').slice(0, 2).join('/')
        platformIdByKey.set(`keyword:${pathPrefix}:${text}:${matchType}`, r.platformId)
      } else if (r.kind === 'ad') {
        const headlines = ((r.properties.headlines as string[]) ?? []).sort().join('|')
        const descriptions = ((r.properties.descriptions as string[]) ?? []).sort().join('|')
        const finalUrl = (r.properties.finalUrl as string) ?? ''
        const pathPrefix = r.path.split('/').slice(0, 2).join('/')
        platformIdByKey.set(`ad:${pathPrefix}:${headlines}:${descriptions}:${finalUrl}`, r.platformId)
      } else if (r.kind === 'negative') {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        const matchType = (r.properties.matchType as string) ?? ''
        platformIdByKey.set(`negative:${r.path.split('/')[0]}:${text}:${matchType}`, r.platformId)
      } else if (r.kind === 'sitelink') {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        platformIdByKey.set(`sitelink:${r.path.split('/')[0]}:${text}`, r.platformId)
      } else if (r.kind === 'callout') {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        platformIdByKey.set(`callout:${r.path.split('/')[0]}:${text}`, r.platformId)
      }
    }
  }

  // Re-discover and flatten the generated campaign files to get canonical paths
  const discovery = await discoverCampaigns(rootDir)
  const googleCampaigns = discovery.campaigns
    .filter(c => c.provider === 'google')
    .map(c => c.campaign as GoogleSearchCampaign)
  const flatResources = flattenAll(googleCampaigns)

  // Seed cache with flattened paths + platformIds from import
  for (const r of flatResources) {
    let platformId: string | null = null

    if (r.kind === 'campaign') {
      const name = (r.properties.name as string) ?? ''
      platformId = platformIdByKey.get(`campaign:${name}`) ?? null
    } else if (r.kind === 'adGroup') {
      platformId = platformIdByKey.get(`adGroup:${r.path}`) ?? null
    } else if (r.kind === 'keyword') {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      const matchType = (r.properties.matchType as string) ?? ''
      const pathPrefix = r.path.split('/').slice(0, 2).join('/')
      platformId = platformIdByKey.get(`keyword:${pathPrefix}:${text}:${matchType}`) ?? null
    } else if (r.kind === 'ad') {
      const headlines = ((r.properties.headlines as string[]) ?? []).sort().join('|')
      const descriptions = ((r.properties.descriptions as string[]) ?? []).sort().join('|')
      const finalUrl = (r.properties.finalUrl as string) ?? ''
      const pathPrefix = r.path.split('/').slice(0, 2).join('/')
      platformId = platformIdByKey.get(`ad:${pathPrefix}:${headlines}:${descriptions}:${finalUrl}`) ?? null
    } else if (r.kind === 'negative') {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      const matchType = (r.properties.matchType as string) ?? ''
      platformId = platformIdByKey.get(`negative:${r.path.split('/')[0]}:${text}:${matchType}`) ?? null
    } else if (r.kind === 'sitelink') {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      platformId = platformIdByKey.get(`sitelink:${r.path.split('/')[0]}:${text}`) ?? null
    } else if (r.kind === 'callout') {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      platformId = platformIdByKey.get(`callout:${r.path.split('/')[0]}:${text}`) ?? null
    }

    cache.setResource({
      project: 'default',
      path: r.path,
      platformId,
      kind: r.kind,
      managedBy: 'imported',
    })
  }
  cache.close()

  // 9. Output summary
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          campaigns: campaigns.map(([slug, { name, resources }]) => ({
            name,
            file: `campaigns/${slug}.ts`,
            resources: resources.length,
          })),
          sharedTargeting: !!shared.targeting,
          sharedNegatives: !!shared.negatives,
          totalFiles: written.length,
        },
        null,
        2,
      ),
    )
  } else {
    console.log()
    console.log(`Imported ${campaigns.length} campaign(s):`)
    for (const [slug, { name, resources }] of campaigns) {
      console.log(`  + campaigns/${slug}.ts  (${resources.length} resources)  ${name}`)
    }
    if (shared.targeting) console.log(`  + targeting.ts  (shared targeting)`)
    if (shared.negatives) console.log(`  + negatives.ts  (shared negatives)`)
    console.log()
    console.log(`Total: ${written.length} files written`)
  }
}
