import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { getProvider } from '../src/core/providers.ts'
import { Cache } from '../src/core/cache.ts'
import { campaignToFilename, extractSharedConfig } from '../src/core/codegen.ts'
import type { Resource, AdsConfig } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'

// ─── Usage ──────────────────────────────────────────────────

const IMPORT_USAGE = `
ads import — Import campaigns from an ad platform and generate TypeScript files

Fetches all active campaigns from your ad account and generates
idiomatic TypeScript campaign files using the @upspawn/ads SDK.

Flags:
  --provider <p>  Provider to import from: google, meta, reddit (required)
  --all           Include paused campaigns
  --filter        Only import campaigns matching a glob pattern (e.g. "Search*")
  --json          Output results as JSON
  --help, -h      Show this help message
`.trim()

// ─── Resource Grouping ─────────────────────────────────────

/**
 * Group flat resources by campaign slug (first path segment).
 * Returns a Map of slug -> { name, resources }.
 */
function groupByCampaign(
  resources: Resource[],
): Map<string, { name: string; resources: Resource[] }> {
  const groups = new Map<string, { name: string; resources: Resource[] }>()

  for (const r of resources) {
    const slug = r.kind === 'campaign' ? r.path : r.path.split('/')[0]!
    if (!groups.has(slug)) {
      // Derive campaign name from the campaign resource if available
      const campaignName = r.kind === 'campaign'
        ? (r.properties.name as string) ?? slug
        : slug
      groups.set(slug, { name: campaignName, resources: [] })
    }
    groups.get(slug)!.resources.push(r)
  }

  // Ensure campaign name is set from the actual campaign resource
  for (const [slug, group] of groups) {
    const campaign = group.resources.find((r) => r.kind === 'campaign')
    if (campaign) {
      group.name = (campaign.properties.name as string) ?? slug
    }
  }

  return groups
}

// ─── Glob Matching ─────────────────────────────────────────

function matchesGlob(name: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i',
  )
  return regex.test(name)
}

// ─── Platform ID Extraction ────────────────────────────────

/**
 * Build a content-based lookup map for platform IDs.
 * Used to associate platformIds from fetched resources with
 * re-flattened resources from the generated .ts files.
 */
function buildPlatformIdLookup(resources: Resource[]): Map<string, string> {
  const lookup = new Map<string, string>()

  for (const r of resources) {
    if (!r.platformId) continue

    switch (r.kind) {
      case 'campaign': {
        const name = (r.properties.name as string) ?? ''
        lookup.set(`campaign:${name}`, r.platformId)
        break
      }
      case 'adGroup':
      case 'adSet': {
        lookup.set(`${r.kind}:${r.path}`, r.platformId)
        break
      }
      case 'keyword': {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        const matchType = (r.properties.matchType as string) ?? ''
        const pathPrefix = r.path.split('/').slice(0, 2).join('/')
        lookup.set(`keyword:${pathPrefix}:${text}:${matchType}`, r.platformId)
        break
      }
      case 'ad': {
        const headlines = ((r.properties.headlines as string[]) ?? []).sort().join('|')
        const descriptions = ((r.properties.descriptions as string[]) ?? []).sort().join('|')
        const finalUrl = (r.properties.finalUrl as string) ?? ''
        const pathPrefix = r.path.split('/').slice(0, 2).join('/')
        lookup.set(`ad:${pathPrefix}:${headlines}:${descriptions}:${finalUrl}`, r.platformId)
        break
      }
      case 'creative': {
        lookup.set(`creative:${r.path}`, r.platformId)
        break
      }
      case 'negative': {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        const matchType = (r.properties.matchType as string) ?? ''
        lookup.set(`negative:${r.path.split('/')[0]}:${text}:${matchType}`, r.platformId)
        break
      }
      case 'sitelink': {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        lookup.set(`sitelink:${r.path.split('/')[0]}:${text}`, r.platformId)
        break
      }
      case 'callout': {
        const text = (r.properties.text as string)?.toLowerCase() ?? ''
        lookup.set(`callout:${r.path.split('/')[0]}:${text}`, r.platformId)
        break
      }
    }
  }

  return lookup
}

/**
 * Resolve a platform ID for a resource using the content-based lookup.
 */
function resolvePlatformId(r: Resource, lookup: Map<string, string>): string | null {
  switch (r.kind) {
    case 'campaign': {
      const name = (r.properties.name as string) ?? ''
      return lookup.get(`campaign:${name}`) ?? null
    }
    case 'adGroup':
    case 'adSet': {
      return lookup.get(`${r.kind}:${r.path}`) ?? null
    }
    case 'keyword': {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      const matchType = (r.properties.matchType as string) ?? ''
      const pathPrefix = r.path.split('/').slice(0, 2).join('/')
      return lookup.get(`keyword:${pathPrefix}:${text}:${matchType}`) ?? null
    }
    case 'ad': {
      const headlines = ((r.properties.headlines as string[]) ?? []).sort().join('|')
      const descriptions = ((r.properties.descriptions as string[]) ?? []).sort().join('|')
      const finalUrl = (r.properties.finalUrl as string) ?? ''
      const pathPrefix = r.path.split('/').slice(0, 2).join('/')
      return lookup.get(`ad:${pathPrefix}:${headlines}:${descriptions}:${finalUrl}`) ?? null
    }
    case 'creative': {
      return lookup.get(`creative:${r.path}`) ?? null
    }
    case 'negative': {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      const matchType = (r.properties.matchType as string) ?? ''
      return lookup.get(`negative:${r.path.split('/')[0]}:${text}:${matchType}`) ?? null
    }
    case 'sitelink': {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      return lookup.get(`sitelink:${r.path.split('/')[0]}:${text}`) ?? null
    }
    case 'callout': {
      const text = (r.properties.text as string)?.toLowerCase() ?? ''
      return lookup.get(`callout:${r.path.split('/')[0]}:${text}`) ?? null
    }
    default:
      return null
  }
}

// ─── Import Command ────────────────────────────────────────

export async function runImport(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(IMPORT_USAGE)
    return
  }

  const rootDir = process.cwd()
  const providerName = flags.provider
  const includeAll = args.includes('--all')
  const filterIdx = args.indexOf('--filter')
  const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined

  // 1. Validate provider flag
  if (!providerName) {
    console.error('Error: --provider flag is required for import.')
    console.error('Usage: ads import --provider <google|meta|reddit> [--all] [--filter "pattern"]')
    process.exit(1)
    return // unreachable, helps TS narrow providerName to string
  }

  // 2. Load config and validate provider is configured
  const config = await loadConfig(rootDir)
  const providerConfig = config?.[providerName as keyof AdsConfig]
  if (!providerConfig || typeof providerConfig !== 'object') {
    console.error(`Error: No ${providerName} configuration found in ads.config.ts`)
    console.error('Run `ads init` first, then configure your provider credentials.')
    process.exit(1)
  }

  // 3. Load provider module
  const provider = await getProvider(providerName)

  console.log(`Fetching campaigns from ${providerName}...`)

  // 4. Fetch all live resources via provider
  //    Set up cache early so postImportFetch can use it
  const cacheDir = join(rootDir, '.ads')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  const cache = new Cache(join(cacheDir, 'cache.db'))

  let resources = await provider.fetchAll(config!, cache)

  // 5. Run provider-specific post-fetch hook (e.g., Meta image download)
  let postFetchSummary: string | undefined
  if (provider.postImportFetch) {
    const result = await provider.postImportFetch(resources, rootDir, cache)
    resources = result.resources
    postFetchSummary = result.summary
  }

  // 6. Group resources by campaign
  const campaignMap = groupByCampaign(resources)

  // 7. Filter if needed
  let campaigns = Array.from(campaignMap.entries())
  if (filter) {
    campaigns = campaigns.filter(([_, { name }]) => matchesGlob(name, filter))
    if (campaigns.length === 0) {
      console.log(`No campaigns matching "${filter}" found.`)
      cache.close()
      return
    }
  }

  // Optionally filter paused campaigns
  if (!includeAll) {
    campaigns = campaigns.filter(([_, { resources: res }]) => {
      const campaign = res.find((r) => r.kind === 'campaign')
      if (!campaign) return false
      const status = campaign.properties.status as string | undefined
      // Keep enabled, active, or campaigns without a status field
      return !status || status === 'enabled' || status === 'ACTIVE'
    })
  }

  if (campaigns.length === 0) {
    console.log('No active campaigns found. Use --all to include paused campaigns.')
    cache.close()
    return
  }

  // 8. Ensure campaigns/ dir exists
  const campaignsDir = join(rootDir, 'campaigns')
  if (!existsSync(campaignsDir)) {
    mkdirSync(campaignsDir, { recursive: true })
  }

  // 9. Generate TypeScript files via provider codegen
  const written: string[] = []
  const allResources: Resource[][] = []

  for (const [slug, { name, resources: campaignResources }] of campaigns) {
    allResources.push(campaignResources)
    const code = provider.codegen(campaignResources, name)
    const filename = `${slug}.ts`
    const filepath = join(campaignsDir, filename)
    await Bun.write(filepath, code)
    written.push(filename)
  }

  // 10. Extract shared config (Google-specific: targeting + negatives dedup)
  //     Meta campaigns don't use shared targeting/negatives in the same way,
  //     but the function is safe to call — it returns empty strings if nothing shared.
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

  // 11. Seed cache with imported resources (only campaigns that were actually written)
  const importedResources = campaigns.flatMap(([_, { resources: res }]) => res)
  const platformIdLookup = buildPlatformIdLookup(importedResources)

  // Seed cache directly from the imported resources (not all fetched resources —
  // non-imported campaigns would appear as managed paths without code files,
  // causing the plan to show false delete operations).
  for (const r of importedResources) {
    const platformId = r.platformId ?? resolvePlatformId(r, platformIdLookup)
    cache.setResource({
      project: 'default',
      path: r.path,
      platformId,
      kind: r.kind,
      managedBy: 'imported',
    })
  }

  cache.close()

  // 12. Output summary
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          provider: providerName,
          campaigns: campaigns.map(([slug, { name, resources: res }]) => ({
            name,
            file: `campaigns/${slug}.ts`,
            resources: res.length,
          })),
          sharedTargeting: !!shared.targeting,
          sharedNegatives: !!shared.negatives,
          totalFiles: written.length,
          ...(postFetchSummary ? { assets: postFetchSummary } : {}),
        },
        null,
        2,
      ),
    )
  } else {
    console.log()
    console.log(`Imported ${campaigns.length} campaign(s) from ${providerName}:`)
    for (const [slug, { name, resources: res }] of campaigns) {
      console.log(`  + campaigns/${slug}.ts  (${res.length} resources)  ${name}`)
    }
    if (shared.targeting) console.log(`  + targeting.ts  (shared targeting)`)
    if (shared.negatives) console.log(`  + negatives.ts  (shared negatives)`)
    if (postFetchSummary) console.log(`  ${postFetchSummary}`)
    console.log()
    console.log(`Total: ${written.length} files written`)
  }
}
