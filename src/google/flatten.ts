import type { Resource, ResourceKind } from '../core/types.ts'
import type { GoogleSearchCampaign, GoogleDisplayCampaign, GooglePMaxCampaign, GoogleShoppingCampaign, GoogleDemandGenCampaign, GoogleSmartCampaign, GoogleAppCampaign, GoogleVideoCampaign, GoogleCampaign } from './types.ts'
import type { SharedBudgetConfig, SharedNegativeList, ConversionActionConfig } from './shared-types.ts'
import { slugify } from '../core/flatten.ts'
import { flattenSharedBudget, flattenSharedNegativeList, flattenConversionAction } from './flatten-shared.ts'

/** All Google resource types that can appear in a campaigns/ directory and be flattened. */
export type GoogleFlattenable = GoogleCampaign | SharedBudgetConfig | SharedNegativeList | ConversionActionConfig

// ─── Stable RSA Hash ──────────────────────────────────────

function stableHash(input: string): string {
  // Bun.hash returns a bigint — convert to hex string
  const h = Bun.hash(input)
  // Take last 12 hex chars for a compact but collision-resistant id
  return (typeof h === 'bigint' ? h : BigInt(h)).toString(16).slice(-12)
}

function rsaHash(headlines: readonly string[], descriptions: readonly string[], finalUrl: string): string {
  const payload = JSON.stringify({
    headlines: [...headlines].sort(),
    descriptions: [...descriptions].sort(),
    finalUrl,
  })
  return stableHash(payload)
}

// ─── Resource Builder ─────────────────────────────────────

function resource(kind: ResourceKind, path: string, properties: Record<string, unknown>): Resource {
  return { kind, path, properties }
}

// ─── Flatten ──────────────────────────────────────────────

/** Flatten a single Google campaign tree into a flat list of Resource objects. */
export function flatten(campaign: GoogleSearchCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
    ...(campaign.trackingTemplate !== undefined && { trackingTemplate: campaign.trackingTemplate }),
    ...(campaign.finalUrlSuffix !== undefined && { finalUrlSuffix: campaign.finalUrlSuffix }),
    ...(campaign.customParameters !== undefined && { customParameters: campaign.customParameters }),
    ...(campaign.networkSettings !== undefined && { networkSettings: campaign.networkSettings }),
  }))

  // 2. Ad groups + children
  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    const adGroupPath = `${campaignPath}/${groupKey}`

    resources.push(resource('adGroup', adGroupPath, {
      status: group.status ?? 'enabled',
      targeting: group.targeting,
    }))

    // Keywords
    for (const kw of group.keywords) {
      const kwPath = `${adGroupPath}/kw:${kw.text.toLowerCase()}:${kw.matchType}`
      resources.push(resource('keyword', kwPath, {
        text: kw.text,
        matchType: kw.matchType,
        ...(kw.bid !== undefined && { bid: kw.bid }),
        ...(kw.finalUrl !== undefined && { finalUrl: kw.finalUrl }),
        ...(kw.status !== undefined && { status: kw.status }),
      }))
    }

    // Ads (RSA)
    for (const ad of group.ads) {
      const hash = rsaHash(ad.headlines, ad.descriptions, ad.finalUrl)
      const adPath = `${adGroupPath}/rsa:${hash}`
      resources.push(resource('ad', adPath, {
        headlines: [...ad.headlines].sort(),
        descriptions: [...ad.descriptions].sort(),
        finalUrl: ad.finalUrl,
        utm: ad.utm,
        ...(ad.pinnedHeadlines && { pinnedHeadlines: ad.pinnedHeadlines }),
        ...(ad.pinnedDescriptions && { pinnedDescriptions: ad.pinnedDescriptions }),
        ...(ad.path1 && { path1: ad.path1 }),
        ...(ad.path2 && { path2: ad.path2 }),
        ...(ad.mobileUrl && { mobileUrl: ad.mobileUrl }),
        ...(ad.trackingTemplate && { trackingTemplate: ad.trackingTemplate }),
      }))
    }

    // Ad group negatives
    if (group.negatives) {
      for (const neg of group.negatives) {
        const negPath = `${adGroupPath}/neg:${neg.text.toLowerCase()}:${neg.matchType}`
        resources.push(resource('negative', negPath, {
          text: neg.text,
          matchType: neg.matchType,
        }))
      }
    }
  }

  // 3. Extensions — sitelinks
  if (campaign.extensions?.sitelinks) {
    for (const sl of campaign.extensions.sitelinks) {
      const slPath = `${campaignPath}/sl:${sl.text.toLowerCase()}`
      resources.push(resource('sitelink', slPath, {
        text: sl.text,
        url: sl.url,
        description1: sl.description1,
        description2: sl.description2,
      }))
    }
  }

  // 4. Extensions — callouts
  if (campaign.extensions?.callouts) {
    for (const co of campaign.extensions.callouts) {
      const coPath = `${campaignPath}/co:${(co as string).toLowerCase()}`
      resources.push(resource('callout', coPath, {
        text: co as string,
      }))
    }
  }

  // 4b. Extensions — structured snippets
  if (campaign.extensions?.structuredSnippets) {
    for (const ss of campaign.extensions.structuredSnippets) {
      const ssPath = `${campaignPath}/ss:${ss.header.toLowerCase()}`
      resources.push(resource('structuredSnippet', ssPath, {
        header: ss.header,
        values: ss.values,
      }))
    }
  }

  // 4c. Extensions — call extensions
  if (campaign.extensions?.calls) {
    for (const ce of campaign.extensions.calls) {
      const cePath = `${campaignPath}/call:${ce.phoneNumber}`
      resources.push(resource('callExtension', cePath, {
        phoneNumber: ce.phoneNumber,
        countryCode: ce.countryCode,
      }))
    }
  }

  // 5. Campaign-level negatives
  for (const neg of campaign.negatives) {
    const negPath = `${campaignPath}/neg:${neg.text.toLowerCase()}:${neg.matchType}`
    resources.push(resource('negative', negPath, {
      text: neg.text,
      matchType: neg.matchType,
    }))
  }

  return resources
}

// ─── Display Flatten ─────────────────────────────────────

/** Flatten a single Google Display campaign tree into a flat list of Resource objects. */
export function flattenDisplay(campaign: GoogleDisplayCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — same as Search but with channelType marker
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'display',
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
    ...(campaign.trackingTemplate !== undefined && { trackingTemplate: campaign.trackingTemplate }),
    ...(campaign.finalUrlSuffix !== undefined && { finalUrlSuffix: campaign.finalUrlSuffix }),
    ...(campaign.networkSettings !== undefined && { networkSettings: campaign.networkSettings }),
  }))

  // 2. Ad groups + ads (no keywords for Display)
  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    const adGroupPath = `${campaignPath}/${groupKey}`

    resources.push(resource('adGroup', adGroupPath, {
      status: group.status ?? 'enabled',
      targeting: group.targeting,
      adGroupType: 'display',
    }))

    // Responsive Display Ads
    for (const ad of group.ads) {
      const hash = responsiveDisplayHash(ad.headlines, ad.longHeadline, ad.finalUrl)
      const adPath = `${adGroupPath}/rda:${hash}`
      resources.push(resource('ad', adPath, {
        adType: 'responsive-display',
        headlines: [...ad.headlines].sort(),
        longHeadline: ad.longHeadline,
        descriptions: [...ad.descriptions].sort(),
        businessName: ad.businessName,
        finalUrl: ad.finalUrl,
        marketingImages: ad.marketingImages,
        squareMarketingImages: ad.squareMarketingImages,
        ...(ad.logoImages && { logoImages: ad.logoImages }),
        ...(ad.squareLogoImages && { squareLogoImages: ad.squareLogoImages }),
        ...(ad.mainColor && { mainColor: ad.mainColor }),
        ...(ad.accentColor && { accentColor: ad.accentColor }),
        ...(ad.callToAction && { callToAction: ad.callToAction }),
      }))
    }
  }

  // 3. Campaign-level negatives
  for (const neg of campaign.negatives) {
    const negPath = `${campaignPath}/neg:${neg.text.toLowerCase()}:${neg.matchType}`
    resources.push(resource('negative', negPath, {
      text: neg.text,
      matchType: neg.matchType,
    }))
  }

  return resources
}

function responsiveDisplayHash(headlines: readonly string[], longHeadline: string, finalUrl: string): string {
  const payload = JSON.stringify({
    headlines: [...headlines].sort(),
    longHeadline,
    finalUrl,
  })
  return stableHash(payload)
}

// ─── PMax Flatten ───────────────────────────────────────

/** Flatten a single Google Performance Max campaign tree into a flat list of Resource objects. */
export function flattenPMax(campaign: GooglePMaxCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — with channelType marker
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'performance-max',
    ...(campaign.urlExpansion !== undefined && { urlExpansion: campaign.urlExpansion }),
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
    ...(campaign.trackingTemplate !== undefined && { trackingTemplate: campaign.trackingTemplate }),
    ...(campaign.finalUrlSuffix !== undefined && { finalUrlSuffix: campaign.finalUrlSuffix }),
    ...(campaign.networkSettings !== undefined && { networkSettings: campaign.networkSettings }),
  }))

  // 2. Asset groups
  for (const [key, ag] of Object.entries(campaign.assetGroups)) {
    const agPath = `${campaignPath}/${key}`
    resources.push(resource('assetGroup', agPath, {
      name: key,
      status: ag.status ?? 'enabled',
      finalUrls: ag.finalUrls,
      ...(ag.finalMobileUrls ? { finalMobileUrls: ag.finalMobileUrls } : {}),
      headlines: ag.headlines,
      longHeadlines: ag.longHeadlines,
      descriptions: ag.descriptions,
      businessName: ag.businessName,
      ...(ag.images ? { images: ag.images } : {}),
      ...(ag.logos ? { logos: ag.logos } : {}),
      ...(ag.landscapeLogos ? { landscapeLogos: ag.landscapeLogos } : {}),
      ...(ag.videos ? { videos: ag.videos } : {}),
      ...(ag.callToAction ? { callToAction: ag.callToAction } : {}),
      ...(ag.path1 ? { path1: ag.path1 } : {}),
      ...(ag.path2 ? { path2: ag.path2 } : {}),
      ...(ag.audienceSignal ? { audienceSignal: ag.audienceSignal } : {}),
    }))
  }

  return resources
}

// ─── Shopping Flatten ───────────────────────────────────

/** Flatten a single Google Shopping campaign tree into a flat list of Resource objects. */
export function flattenShopping(campaign: GoogleShoppingCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — with channelType and shoppingSetting
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'shopping',
    shoppingSetting: campaign.shoppingSetting,
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
    ...(campaign.trackingTemplate !== undefined && { trackingTemplate: campaign.trackingTemplate }),
    ...(campaign.finalUrlSuffix !== undefined && { finalUrlSuffix: campaign.finalUrlSuffix }),
    ...(campaign.networkSettings !== undefined && { networkSettings: campaign.networkSettings }),
  }))

  // 2. Ad groups (simple — just status + optional bid)
  for (const [key, group] of Object.entries(campaign.groups)) {
    resources.push(resource('adGroup', `${campaignPath}/${key}`, {
      status: group.status ?? 'enabled',
      ...(group.bid !== undefined && { bid: group.bid }),
      adGroupType: 'shopping',
    }))
  }

  // 3. Campaign-level negatives
  for (const neg of campaign.negatives) {
    resources.push(resource('negative', `${campaignPath}/neg:${neg.text.toLowerCase()}:${neg.matchType}`, {
      text: neg.text,
      matchType: neg.matchType,
    }))
  }

  return resources
}

// ─── Demand Gen Flatten ─────────────────────────────────

/** Flatten a single Google Demand Gen campaign tree into a flat list of Resource objects. */
export function flattenDemandGen(campaign: GoogleDemandGenCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — with channelType marker
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'demand-gen',
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
    ...(campaign.trackingTemplate !== undefined && { trackingTemplate: campaign.trackingTemplate }),
    ...(campaign.finalUrlSuffix !== undefined && { finalUrlSuffix: campaign.finalUrlSuffix }),
  }))

  // 2. Ad groups + ads (no keywords — Demand Gen uses audience targeting)
  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    const agPath = `${campaignPath}/${groupKey}`

    resources.push(resource('adGroup', agPath, {
      status: group.status ?? 'enabled',
      targeting: group.targeting,
      adGroupType: 'demand-gen',
      ...(group.channels ? { channels: group.channels } : {}),
    }))

    // Demand Gen ads (multi-asset or carousel)
    for (const ad of group.ads) {
      const hash = stableHash(JSON.stringify(ad))
      resources.push(resource('ad', `${agPath}/dgad:${hash}`, {
        ...ad,
      }))
    }
  }

  // 3. Campaign-level negatives
  for (const neg of campaign.negatives) {
    resources.push(resource('negative', `${campaignPath}/neg:${neg.text.toLowerCase()}:${neg.matchType}`, {
      text: neg.text,
      matchType: neg.matchType,
    }))
  }

  return resources
}

// ─── Smart Flatten ──────────────────────────────────────

/** Flatten a single Google Smart campaign tree into a flat list of Resource objects. */
export function flattenSmart(campaign: GoogleSmartCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — with channelType and smart-specific fields
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    // Smart campaigns use maximize-conversions internally
    bidding: { type: 'maximize-conversions' },
    channelType: 'smart',
    businessName: campaign.businessName,
    ...(campaign.businessProfile ? { businessProfile: campaign.businessProfile } : {}),
    finalUrl: campaign.finalUrl,
    language: campaign.language,
    keywordThemes: campaign.keywordThemes,
  }))

  // 2. One auto-created ad group
  const adGroupPath = `${campaignPath}/default`
  resources.push(resource('adGroup', adGroupPath, {
    status: 'enabled',
    adGroupType: 'smart',
  }))

  // 3. One ad with SmartCampaignAdInfo
  const adHash = stableHash(JSON.stringify(campaign.ad))
  resources.push(resource('ad', `${adGroupPath}/smart:${adHash}`, {
    adType: 'smart',
    headlines: campaign.ad.headlines,
    descriptions: campaign.ad.descriptions,
  }))

  return resources
}

// ─── App Flatten ────────────────────────────────────────

/** Flatten a single Google App campaign tree into a flat list of Resource objects. */
export function flattenApp(campaign: GoogleAppCampaign): Resource[] {
  const resources: Resource[] = []
  const campaignPath = slugify(campaign.name)

  // 1. Campaign resource — with channelType and app-specific fields
  resources.push(resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'app',
    appId: campaign.appId,
    appStore: campaign.appStore,
    goal: campaign.goal,
    ...(campaign.startDate !== undefined && { startDate: campaign.startDate }),
    ...(campaign.endDate !== undefined && { endDate: campaign.endDate }),
  }))

  // 2. One auto-created ad group
  const adGroupPath = `${campaignPath}/default`
  resources.push(resource('adGroup', adGroupPath, {
    status: 'enabled',
    adGroupType: 'app',
  }))

  // 3. One ad with AppAdInfo
  const adHash = stableHash(JSON.stringify(campaign.ad))
  resources.push(resource('ad', `${adGroupPath}/app:${adHash}`, {
    adType: 'app',
    headlines: campaign.ad.headlines,
    descriptions: campaign.ad.descriptions,
    ...(campaign.ad.images ? { images: campaign.ad.images } : {}),
    ...(campaign.ad.videos ? { videos: campaign.ad.videos } : {}),
  }))

  return resources
}

// ─── Video Flatten (Read-Only) ──────────────────────────

/**
 * Flatten a Google Video campaign into a flat list of Resource objects.
 * Video campaigns are read-only — only the campaign resource is emitted,
 * since the Google Ads API does not support creating/updating Video campaigns.
 */
export function flattenVideo(campaign: GoogleVideoCampaign): Resource[] {
  const campaignPath = slugify(campaign.name)

  return [resource('campaign', campaignPath, {
    name: campaign.name,
    status: campaign.status,
    budget: campaign.budget,
    bidding: campaign.bidding,
    targeting: campaign.targeting,
    channelType: 'video',
  })]
}

// ─── Multi-Kind Flatten ──────────────────────────────────

/** Flatten multiple Google campaigns and shared resources into a single flat list. */
export function flattenAll(campaigns: GoogleFlattenable[]): Resource[] {
  return campaigns.flatMap(c => {
    // Shared resources are discovered alongside campaigns because they export
    // objects with provider+kind fields. Check these first before narrowing
    // into the GoogleCampaign union (which doesn't include shared kinds).
    if (c.kind === 'shared-budget') return flattenSharedBudget(c)
    if (c.kind === 'shared-negative-list') return flattenSharedNegativeList(c)
    if (c.kind === 'conversion-action') return flattenConversionAction(c)
    // From here, TypeScript knows c is GoogleCampaign
    if (c.kind === 'display') return flattenDisplay(c)
    if (c.kind === 'performance-max') return flattenPMax(c)
    if (c.kind === 'shopping') return flattenShopping(c)
    if (c.kind === 'demand-gen') return flattenDemandGen(c)
    if (c.kind === 'smart') return flattenSmart(c)
    if (c.kind === 'app') return flattenApp(c)
    if (c.kind === 'video') return flattenVideo(c)
    return flatten(c)
  })
}
