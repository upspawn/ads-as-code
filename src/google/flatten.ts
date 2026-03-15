import type { Resource, ResourceKind } from '../core/types.ts'
import type { GoogleSearchCampaign } from './types.ts'
import { slugify } from '../core/flatten.ts'

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

/** Flatten multiple Google campaigns into a single flat list. */
export function flattenAll(campaigns: GoogleSearchCampaign[]): Resource[] {
  return campaigns.flatMap(flatten)
}
