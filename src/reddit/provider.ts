import type { ProviderModule } from '../core/providers.ts'
import type { Resource, AdsConfig, Changeset } from '../core/types.ts'
import type { Cache } from '../core/cache.ts'
import type { RedditCampaign } from './types.ts'
import { flattenReddit } from './flatten.ts'
import { deduplicateResourceSlugs } from '../core/flatten.ts'
import { codegenReddit } from './codegen.ts'
import { downloadRedditAssets } from './download.ts'
import { fetchRedditAll } from './fetch.ts'
import { applyRedditChangeset, dryRunRedditChangeset } from './apply.ts'
import { RedditCampaignBuilder } from './index.ts'

// ─── Reddit Provider Module ──────────────────────────────

const redditProvider: ProviderModule = {
  flatten(campaigns: unknown[]): Resource[] {
    // Campaign objects from .ts files are RedditCampaignBuilder instances
    // which need .build() to extract the RedditCampaign data structure.
    const built = campaigns.map((c) =>
      c instanceof RedditCampaignBuilder ? (c as RedditCampaignBuilder<any>).build() : c as RedditCampaign,
    )
    // Flatten each campaign independently, then deduplicate slugs across
    // all campaigns. This handles the case where two campaigns share the
    // same name — the second gets a "-2" suffix.
    return deduplicateResourceSlugs(built.flatMap(flattenReddit))
  },

  async fetchAll(config: AdsConfig, _cache: Cache): Promise<Resource[]> {
    if (!config.reddit) throw new Error('Reddit provider config missing — add reddit section to ads.config.ts')
    return fetchRedditAll(config.reddit)
  },

  async applyChangeset(changeset: Changeset, config: AdsConfig, cache: Cache, project: string) {
    if (!config.reddit) throw new Error('Reddit provider config missing — add reddit section to ads.config.ts')
    return applyRedditChangeset(changeset, config.reddit, cache, project)
  },

  dryRunChangeset(changeset: Changeset, config: AdsConfig, cache: Cache, project: string) {
    if (!config.reddit) throw new Error('Reddit provider config missing — add reddit section to ads.config.ts')
    return dryRunRedditChangeset(changeset, config.reddit, cache, project)
  },

  codegen(resources: Resource[], _campaignName: string): string {
    return codegenReddit(resources)
  },

  async postImportFetch(
    resources: Resource[],
    rootDir: string,
    _cache: Cache | null,
  ): Promise<{ resources: Resource[]; summary?: string }> {
    const { resources: updated, summary } = await downloadRedditAssets(resources, rootDir)

    const parts: string[] = []
    if (summary.downloaded > 0) parts.push(`${summary.downloaded} downloaded`)
    if (summary.cached > 0) parts.push(`${summary.cached} already local`)
    if (summary.failed > 0) parts.push(`${summary.failed} failed`)
    const summaryText = parts.length > 0 ? `Assets: ${parts.join(', ')}` : undefined

    if (summary.errors.length > 0) {
      for (const err of summary.errors) {
        console.warn(`  Warning: ${err}`)
      }
    }

    return { resources: updated, summary: summaryText }
  },
}

export default redditProvider
