import { loadConfig } from '../src/core/discovery.ts'
import type { GlobalFlags } from './init.ts'

const META_GRAPH_BASE = 'https://graph.facebook.com'

type CustomAudience = {
  id: string
  name: string
  approximate_count?: number
  subtype?: string
}

/**
 * List custom audiences in a Meta Ads account.
 *
 * Usage:
 *   ads audiences
 */
export async function runAudiences(_args: string[], _flags: GlobalFlags): Promise<void> {
  const accessToken = process.env.FB_ADS_ACCESS_TOKEN
  const config = await loadConfig(process.cwd())
  const accountId = config?.meta?.accountId
  const apiVersion = config?.meta?.apiVersion ?? 'v22.0'

  if (!accessToken) {
    console.error('Missing FB_ADS_ACCESS_TOKEN environment variable.')
    console.error('Set it in your shell or .env file.')
    process.exit(1)
  }

  if (!accountId) {
    console.error('No Meta provider configured in ads.config.ts.')
    console.error('Add a meta.accountId field (e.g., "act_123456789").')
    process.exit(1)
  }

  // Ensure account ID has the act_ prefix
  const normalizedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`

  const url = new URL(`${META_GRAPH_BASE}/${apiVersion}/${normalizedAccountId}/customaudiences`)
  url.searchParams.set('fields', 'name,approximate_count,subtype')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('limit', '500')

  let audiences: CustomAudience[] = []
  try {
    // Paginate through all results
    let nextUrl: string | null = url.toString()
    while (nextUrl) {
      const response = await fetch(nextUrl)
      if (!response.ok) {
        const body = await response.text()
        console.error(`Meta API error (${response.status}): ${body}`)
        process.exit(1)
      }
      const json = (await response.json()) as {
        data: CustomAudience[]
        paging?: { next?: string }
      }
      audiences = audiences.concat(json.data ?? [])
      nextUrl = json.paging?.next ?? null
    }
  } catch (err) {
    console.error('Failed to fetch custom audiences:')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }

  if (audiences.length === 0) {
    console.log('No custom audiences found.')
    return
  }

  // Sort by name for readability
  audiences.sort((a, b) => a.name.localeCompare(b.name))

  // Print table
  const cols = {
    name: Math.max(4, ...audiences.map((a) => a.name.length)),
    id: Math.max(2, ...audiences.map((a) => a.id.length)),
    size: 12,
    subtype: Math.max(7, ...audiences.map((a) => (a.subtype ?? '—').length)),
  }

  const header = [
    'Name'.padEnd(cols.name),
    'ID'.padEnd(cols.id),
    'Approx Size'.padEnd(cols.size),
    'Subtype'.padEnd(cols.subtype),
  ].join('  ')

  console.log()
  console.log(header)
  console.log('─'.repeat(header.length))

  for (const a of audiences) {
    console.log(
      [
        a.name.padEnd(cols.name),
        a.id.padEnd(cols.id),
        formatSize(a.approximate_count).padEnd(cols.size),
        (a.subtype ?? '—').padEnd(cols.subtype),
      ].join('  '),
    )
  }

  console.log()
  console.log(`${audiences.length} audience(s)`)
}

function formatSize(size: number | undefined): string {
  if (size === undefined) return '—'
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(0)}K`
  return String(size)
}
