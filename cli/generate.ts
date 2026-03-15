import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { GlobalFlags } from './init.ts'
import { loadGenerateMatrix, discoverCampaigns } from '../src/core/discovery.ts'
import { slugify } from '../src/core/flatten.ts'
import { computeExpansionTargets, type ExpansionTarget } from '../src/ai/expand.ts'
import { generateExpandedCode, type ExpandedCampaignData, type ExpandedAdGroup } from '../src/ai/codegen-expanded.ts'
import { readManifest, writeManifest, updateManifestEntry, type Manifest, type ManifestEntry } from '../src/ai/manifest.ts'
import type { GoogleSearchCampaign } from '../src/google/types.ts'

const GENERATE_USAGE = `
ads generate — Generate expanded campaign variants using AI

Reads ads.generate.ts from the project root, loads seed campaigns,
computes expansion targets (translations, ICP variations, cross products),
and generates standalone TypeScript campaign files in the generated/ directory.

Usage:
  ads generate                     Generate all missing variants
  ads generate --reroll <file>     Re-generate a specific file
  ads generate --seed <name>       Re-expand all variants from a seed
  ads generate --filter <pattern>  Only generate targets matching a pattern
  ads generate --dry-run           Show what would be generated without writing

Flags:
  --reroll <file>   Re-generate a specific expanded file
  --seed <name>     Re-expand all variants from a named seed
  --filter <pat>    Only process targets whose file names match
  --dry-run         Preview targets without generating
  --model <model>   AI model to use (default: gpt-4.1-mini)
  --json            Output results as JSON
  --help, -h        Show this help message
`.trim()

// ─── Seed Campaign Loading ──────────────────────────────

/**
 * Load a seed campaign from its file path. Resolves relative to rootDir.
 * Returns the first Google Search campaign found in the file's exports.
 */
async function loadSeedCampaign(
  rootDir: string,
  seedPath: string,
): Promise<GoogleSearchCampaign | null> {
  const absPath = resolve(rootDir, seedPath)
  if (!existsSync(absPath)) return null

  try {
    const mod = await import(absPath)
    // Check default export first, then named exports
    for (const value of Object.values(mod)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'provider' in value &&
        (value as Record<string, unknown>).provider === 'google' &&
        'kind' in value &&
        (value as Record<string, unknown>).kind === 'search'
      ) {
        return value as GoogleSearchCampaign
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Campaign Data Extraction ───────────────────────────

/**
 * Convert a GoogleSearchCampaign + ExpansionTarget into ExpandedCampaignData.
 * This is the "transform" step that adapts the seed for the target variant.
 *
 * For now, this produces a structural copy. The AI generation step
 * (generateExpandedCampaign) would be called externally to produce
 * the actual translated/varied content. This function serves as the
 * non-AI fallback that preserves seed structure.
 */
function seedToExpandedData(
  seed: GoogleSearchCampaign,
  target: ExpansionTarget,
): ExpandedCampaignData {
  const groups: ExpandedAdGroup[] = []

  for (const [key, group] of Object.entries(seed.groups)) {
    const firstAd = group.ads[0]
    if (!firstAd) continue

    groups.push({
      key,
      keywords: group.keywords.map((kw) => ({
        text: kw.text,
        matchType: kw.matchType,
      })),
      ad: {
        headlines: [...firstAd.headlines],
        descriptions: [...firstAd.descriptions],
        finalUrl: firstAd.finalUrl,
      },
    })
  }

  // Adapt targeting for translations
  let targetingRules = seed.targeting.rules.map((r) => ({ ...r }))
  if (target.translate) {
    // Replace language targeting with the target language
    const langCode = target.translate
    const hasLang = targetingRules.some((r) => r.type === 'language')
    if (hasLang) {
      targetingRules = targetingRules.map((r) =>
        r.type === 'language' ? { type: 'language' as const, languages: [langCode] } : r,
      )
    } else {
      targetingRules.push({ type: 'language' as const, languages: [langCode] })
    }
  }

  return {
    name: seed.name,
    budget: { ...seed.budget },
    bidding: { ...seed.bidding },
    targeting: { rules: targetingRules as Array<{ type: string; [key: string]: unknown }> },
    negatives: seed.negatives.map((n) => ({ text: n.text, matchType: n.matchType })),
    groups,
  }
}

// ─── Variant Suffix ─────────────────────────────────────

function buildVariantSuffix(target: ExpansionTarget): string {
  const parts: string[] = []
  if (target.vary) parts.push(target.vary.name.toUpperCase())
  if (target.translate) parts.push(target.translate.toUpperCase())
  return parts.length > 0 ? `[${parts.join('-')}]` : ''
}

// ─── Glob Matching ──────────────────────────────────────

function matchesFilter(fileName: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i',
  )
  return regex.test(fileName)
}

// ─── Main Command ───────────────────────────────────────

export async function runGenerate(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(GENERATE_USAGE)
    return
  }

  const rootDir = process.cwd()
  const dryRun = args.includes('--dry-run')
  const model = getFlag(args, '--model') ?? 'gpt-4.1-mini'
  const rerollFile = getFlag(args, '--reroll')
  const seedFilter = getFlag(args, '--seed')
  const filter = getFlag(args, '--filter')

  // 1. Load the generate matrix
  const matrix = await loadGenerateMatrix(rootDir)
  if (!matrix || matrix.length === 0) {
    console.error('No ads.generate.ts found or it exports an empty array.')
    console.error('')
    console.error('Create ads.generate.ts in your project root:')
    console.error('')
    console.error("  import { expand } from '@upspawn/ads/ai'")
    console.error('  export default [')
    console.error("    expand('campaigns/search-dropbox.ts', { translate: ['de', 'fr'] }),")
    console.error('  ]')
    process.exit(1)
  }

  // 2. Ensure generated/ directory exists
  const generatedDir = join(rootDir, 'generated')
  if (!dryRun && !existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true })
  }

  // 3. Load existing manifest
  let manifest: Manifest = (await readManifest(generatedDir)) ?? {}

  // 4. Process each expand entry
  const results: Array<{ file: string; seed: string; status: 'created' | 'skipped' | 'rerolled' }> = []

  for (const entry of matrix) {
    // Filter by --seed if specified
    if (seedFilter) {
      const seedSlug = slugify(entry.seed.replace(/^campaigns\//, '').replace(/\.ts$/, ''))
      if (!seedSlug.includes(seedFilter) && !entry.seed.includes(seedFilter)) {
        continue
      }
    }

    // Load the seed campaign
    const seedCampaign = await loadSeedCampaign(rootDir, entry.seed)
    if (!seedCampaign) {
      console.error(`Warning: Could not load seed campaign from ${entry.seed}, skipping.`)
      continue
    }

    // Compute the seed slug from the campaign name
    const seedSlug = slugify(seedCampaign.name)

    // Compute expansion targets
    const targets = computeExpansionTargets(seedSlug, entry.config)

    for (const target of targets) {
      // Filter by --filter if specified
      if (filter && !matchesFilter(target.fileName, filter)) {
        continue
      }

      // Filter by --reroll if specified
      if (rerollFile && target.fileName !== rerollFile) {
        continue
      }

      // Skip existing files unless rerolling
      const filePath = join(generatedDir, target.fileName)
      const existingEntry = manifest[target.fileName]
      if (existingEntry && !rerollFile) {
        results.push({ file: target.fileName, seed: entry.seed, status: 'skipped' })
        continue
      }

      if (dryRun) {
        results.push({
          file: target.fileName,
          seed: entry.seed,
          status: existingEntry ? 'rerolled' : 'created',
        })
        continue
      }

      // Transform seed data for this target
      const expandedData = seedToExpandedData(seedCampaign, target)
      const suffix = buildVariantSuffix(target)

      // Generate the code
      const code = generateExpandedCode(seedSlug, expandedData, suffix)

      // Write the file
      await Bun.write(filePath, code)

      // Update manifest
      const round = existingEntry ? existingEntry.round + 1 : 1
      const transform: Record<string, string> = {}
      if (target.translate) transform.translate = target.translate
      if (target.vary) transform.vary = target.vary.name

      const manifestEntry: ManifestEntry = {
        seed: seedSlug,
        transform,
        model,
        generatedAt: new Date().toISOString(),
        round,
      }
      manifest = updateManifestEntry(manifest, target.fileName, manifestEntry)

      results.push({
        file: target.fileName,
        seed: entry.seed,
        status: existingEntry ? 'rerolled' : 'created',
      })
    }
  }

  // 5. Write updated manifest
  if (!dryRun && results.some((r) => r.status !== 'skipped')) {
    await writeManifest(generatedDir, manifest)
  }

  // 6. Output results
  const created = results.filter((r) => r.status === 'created')
  const rerolled = results.filter((r) => r.status === 'rerolled')
  const skipped = results.filter((r) => r.status === 'skipped')

  if (flags.json) {
    console.log(JSON.stringify({ results, dryRun }, null, 2))
  } else {
    if (dryRun) {
      console.log('Dry run — no files written.\n')
    }

    if (created.length > 0) {
      console.log(`${dryRun ? 'Would create' : 'Created'} ${created.length} file(s):`)
      for (const r of created) {
        console.log(`  + generated/${r.file}`)
      }
    }

    if (rerolled.length > 0) {
      console.log(`\n${dryRun ? 'Would re-generate' : 'Re-generated'} ${rerolled.length} file(s):`)
      for (const r of rerolled) {
        console.log(`  ~ generated/${r.file}`)
      }
    }

    if (skipped.length > 0 && !rerollFile) {
      console.log(`\nSkipped ${skipped.length} existing file(s) (use --reroll to regenerate)`)
    }

    if (results.length === 0) {
      console.log('No targets matched.')
    }

    console.log()
  }
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
