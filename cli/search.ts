import { loadConfig } from '../src/core/discovery.ts'
import type { GlobalFlags } from './init.ts'

const META_GRAPH_BASE = 'https://graph.facebook.com'

type SearchResult = {
  id: string
  name: string
  audience_size_lower_bound?: number
  audience_size_upper_bound?: number
}

type SearchType = 'interests' | 'behaviors'

const SEARCH_CONFIG: Record<SearchType, { type: string; class?: string; label: string }> = {
  interests: { type: 'adinterest', label: 'Interest' },
  behaviors: { type: 'adTargetingCategory', class: 'behaviors', label: 'Behavior' },
}

/**
 * Query Meta's Targeting Search API for interests or behaviors.
 *
 * Usage:
 *   ads search interests "Construction"
 *   ads search behaviors "small business"
 */
export async function runSearch(args: string[], _flags: GlobalFlags): Promise<void> {
  const searchType = args[0] as SearchType | undefined
  const query = args.slice(1).join(' ')

  if (!searchType || !SEARCH_CONFIG[searchType] || !query) {
    console.error('Usage: ads search <interests|behaviors> "query"')
    process.exit(1)
  }

  // Resolve access token: env var takes precedence, then config file
  const accessToken = process.env.FB_ADS_ACCESS_TOKEN
  const config = await loadConfig(process.cwd())
  const apiVersion = config?.meta?.apiVersion ?? 'v22.0'

  if (!accessToken) {
    console.error('Missing FB_ADS_ACCESS_TOKEN environment variable.')
    console.error('Set it in your shell or .env file.')
    process.exit(1)
  }

  const searchConfig = SEARCH_CONFIG[searchType]
  const url = new URL(`${META_GRAPH_BASE}/${apiVersion}/search`)
  url.searchParams.set('type', searchConfig.type)
  url.searchParams.set('q', query)
  url.searchParams.set('access_token', accessToken)
  if (searchConfig.class) {
    url.searchParams.set('class', searchConfig.class)
  }

  let results: SearchResult[]
  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      const body = await response.text()
      console.error(`Meta API error (${response.status}): ${body}`)
      process.exit(1)
    }
    const json = (await response.json()) as { data: SearchResult[] }
    results = json.data ?? []
  } catch (err) {
    console.error('Failed to call Meta Targeting Search API:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  if (results.length === 0) {
    console.log(`No ${searchType} found for "${query}".`)
    return
  }

  // Print table header
  const cols = {
    name: Math.max(4, ...results.map((r) => r.name.length)),
    id: Math.max(2, ...results.map((r) => r.id.length)),
    lower: 12,
    upper: 12,
  }

  const header = [
    'Name'.padEnd(cols.name),
    'ID'.padEnd(cols.id),
    'Size (lower)'.padEnd(cols.lower),
    'Size (upper)'.padEnd(cols.upper),
  ].join('  ')

  console.log()
  console.log(`${searchConfig.label} results for "${query}":`)
  console.log()
  console.log(header)
  console.log('─'.repeat(header.length))

  for (const r of results) {
    console.log(
      [
        r.name.padEnd(cols.name),
        r.id.padEnd(cols.id),
        formatSize(r.audience_size_lower_bound).padEnd(cols.lower),
        formatSize(r.audience_size_upper_bound).padEnd(cols.upper),
      ].join('  '),
    )
  }

  // Print copy-paste ready format
  console.log()
  console.log('Copy-paste for campaign files:')
  console.log()
  for (const r of results) {
    console.log(`  { id: '${r.id}', name: '${escapeSingleQuotes(r.name)}' },`)
  }
}

function formatSize(size: number | undefined): string {
  if (size === undefined) return '—'
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(0)}K`
  return String(size)
}

function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "\\'")
}
