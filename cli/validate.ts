import { join } from 'node:path'
import { statSync } from 'node:fs'
import { discoverCampaigns, loadConfig } from '../src/core/discovery.ts'
import { isRsaMarker, isKeywordsMarker } from '../src/ai/types.ts'
import { readLockFile, getSlot } from '../src/ai/lockfile.ts'
import { checkStaleness } from '../src/ai/resolve.ts'
import { readManifest } from '../src/ai/manifest.ts'
import type { GoogleSearchCampaignUnresolved, GoogleAdGroupUnresolved } from '../src/google/types.ts'
import type { GlobalFlags } from './init.ts'
import type { DiscoveredCampaign } from '../src/core/discovery.ts'
import type { AdsConfig } from '../src/core/types.ts'

const VALIDATE_USAGE = `
ads validate — Validate campaign files and report errors

Discovers all campaign files in campaigns/**/*.ts, loads them,
and reports any import errors or structural issues.

For Meta campaigns, validates:
  - Campaign structure (missing url/cta on ads)
  - Interest/audience name resolution (if FB_ADS_ACCESS_TOKEN is set)

Flags:
  --json        Output results as JSON
  --provider    Only validate campaigns for this provider
  --help, -h    Show this help message
`.trim()

// === AI Warning Types ===

type AiWarning = {
  readonly type: 'unresolved' | 'stale-lock' | 'stale-generated' | 'judge-warning' | 'meta-unresolved'
  readonly message: string
}

// === AI Warning Collection ===

/**
 * Check a single campaign for unresolved markers and stale lock slots.
 * Returns warnings (not errors) — these do not affect the exit code.
 */
async function collectCampaignAiWarnings(
  file: string,
  campaign: unknown,
): Promise<AiWarning[]> {
  const warnings: AiWarning[] = []

  const c = campaign as GoogleSearchCampaignUnresolved
  if (!c.groups) return warnings

  const hasMarkers = Object.values(c.groups).some(
    (group: GoogleAdGroupUnresolved) =>
      group.ads.some(isRsaMarker) ||
      group.keywords.some(isKeywordsMarker),
  )

  if (!hasMarkers) return warnings

  const lockFile = await readLockFile(file)

  // 1. Unresolved markers — markers with no lock file or missing slots
  for (const [groupKey, group] of Object.entries(c.groups)) {
    for (const ad of group.ads) {
      if (!isRsaMarker(ad)) continue
      const slotKey = `${groupKey}.ad`
      const slot = lockFile ? getSlot(lockFile, slotKey) : undefined
      if (!slot) {
        warnings.push({
          type: 'unresolved',
          message: `Unresolved AI marker: ${c.name}/${slotKey} — run ads generate`,
        })
      }
    }
    for (const kw of group.keywords) {
      if (!isKeywordsMarker(kw)) continue
      const slotKey = `${groupKey}.keywords`
      const slot = lockFile ? getSlot(lockFile, slotKey) : undefined
      if (!slot) {
        warnings.push({
          type: 'unresolved',
          message: `Unresolved AI marker: ${c.name}/${slotKey} — run ads generate`,
        })
      }
    }
  }

  // 2. Stale lock files — prompt changed since last generate
  if (lockFile) {
    const staleSlots = checkStaleness(c, lockFile)
    for (const s of staleSlots) {
      warnings.push({
        type: 'stale-lock',
        message: `Stale generation: ${s.campaign}/${s.slot} — prompt changed since last generate`,
      })
    }

    // 4. Judge warnings — slots with judgeWarning flag
    for (const [slotKey, slot] of Object.entries(lockFile.slots)) {
      if (slot.judgeWarning) {
        warnings.push({
          type: 'judge-warning',
          message: `Judge warning: ${c.name}/${slotKey} — judge criteria not fully met`,
        })
      }
    }
  }

  return warnings
}

/**
 * Check for stale generated campaigns by comparing seed modification times
 * against generation timestamps in the manifest.
 */
async function collectManifestWarnings(rootDir: string): Promise<AiWarning[]> {
  const warnings: AiWarning[] = []
  const generatedDir = join(rootDir, 'generated')
  const manifest = await readManifest(generatedDir)

  if (!manifest) return warnings

  for (const [fileName, entry] of Object.entries(manifest)) {
    const seedPath = join(rootDir, entry.seed)
    try {
      const stats = statSync(seedPath)
      const seedModified = stats.mtimeMs
      const generatedAt = new Date(entry.generatedAt).getTime()
      if (seedModified > generatedAt) {
        warnings.push({
          type: 'stale-generated',
          message: `Stale generated campaign: generated/${fileName} — seed modified since generation`,
        })
      }
    } catch {
      // Seed file may have been deleted — not a warning for validate
    }
  }

  return warnings
}

// === Meta Validation ===

/** Type guard: does a campaign object have a `.build()` method (i.e. it's a builder, not a built campaign)? */
function hasBuilder(obj: unknown): obj is { build(): unknown } {
  return typeof obj === 'object' && obj !== null && 'build' in obj && typeof (obj as Record<string, unknown>).build === 'function'
}

/** Extract the built campaign from a discovered Meta campaign object. */
type BuiltMetaCampaign = {
  readonly adSets?: readonly {
    readonly name: string
    readonly config: {
      readonly targeting?: {
        readonly interests?: readonly { readonly id: string; readonly name: string }[]
        [key: string]: unknown
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }[]
  [key: string]: unknown
}

function buildMetaCampaign(campaign: unknown): BuiltMetaCampaign {
  if (hasBuilder(campaign)) return campaign.build() as BuiltMetaCampaign
  return campaign as BuiltMetaCampaign
}

/**
 * Validate Meta campaigns: flatten to check structure, and if credentials
 * are available, run interest/audience name resolution to catch ambiguous
 * interests and missing audiences before plan/apply.
 */
async function collectMetaWarnings(
  campaigns: DiscoveredCampaign[],
  config: AdsConfig | undefined,
): Promise<{ warnings: AiWarning[]; errors: string[] }> {
  const warnings: AiWarning[] = []
  const errors: string[] = []

  const metaCampaigns = campaigns.filter(c => c.provider === 'meta')
  if (metaCampaigns.length === 0) return { warnings, errors }

  // 1. Structural validation: flatten each Meta campaign to check for
  //    missing url/cta and other structural issues.
  const { flattenMeta } = await import('../src/meta/flatten.ts')

  for (const c of metaCampaigns) {
    try {
      const built = buildMetaCampaign(c.campaign)
      // Flatten validates structure (throws on missing url/cta)
      flattenMeta(built as Parameters<typeof flattenMeta>[0])
    } catch (err) {
      errors.push(`${c.exportName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 2. Interest/audience resolution: only if we have credentials
  const metaConfig = config?.meta
  const hasToken = !!process.env.FB_ADS_ACCESS_TOKEN

  if (!metaConfig || !hasToken) {
    // Check if any Meta campaign uses unresolved interests
    for (const c of metaCampaigns) {
      const built = buildMetaCampaign(c.campaign)
      if (!built.adSets) continue
      for (const adSet of built.adSets) {
        const interests = adSet.config?.targeting?.interests
        if (!interests) continue
        for (const interest of interests) {
          if (interest.id.startsWith('__unresolved:')) {
            warnings.push({
              type: 'meta-unresolved',
              message: `Unresolved interest "${interest.id.replace('__unresolved:', '')}" in ${c.exportName} — ` +
                (hasToken
                  ? 'set meta config in ads.config.ts to enable resolution'
                  : 'set FB_ADS_ACCESS_TOKEN to enable resolution'),
            })
          }
        }
      }
    }
    return { warnings, errors }
  }

  // We have credentials — try resolving interests/audiences
  try {
    const { createMetaClient } = await import('../src/meta/api.ts')
    const { resolveTargeting } = await import('../src/meta/resolve.ts')
    const client = createMetaClient(metaConfig)

    for (const c of metaCampaigns) {
      const built = buildMetaCampaign(c.campaign)
      if (!built.adSets) continue
      for (const adSet of built.adSets) {
        const targeting = adSet.config?.targeting
        if (!targeting) continue
        try {
          await resolveTargeting(
            targeting as Parameters<typeof resolveTargeting>[0],
            metaConfig,
            client,
            null, // no cache during validation
          )
        } catch (err) {
          errors.push(
            `${c.exportName}/${adSet.name}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  } catch (err) {
    // If API client fails to initialize, warn but don't fail
    warnings.push({
      type: 'meta-unresolved',
      message: `Could not initialize Meta API client for resolution: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return { warnings, errors }
}

// === Main Command ===

export async function runValidate(args: string[], flags: GlobalFlags) {
  if (flags.help) {
    console.log(VALIDATE_USAGE)
    return
  }

  const rootDir = process.cwd()

  // Load config (optional — validation works without it)
  const config = await loadConfig(rootDir)

  // Discover campaigns
  const result = await discoverCampaigns(rootDir)

  // Filter by provider if specified
  let campaigns = result.campaigns
  if (flags.provider) {
    campaigns = campaigns.filter(c => c.provider === flags.provider)
  }

  // Collect Meta validation results (structural + interest/audience resolution)
  const metaResult = await collectMetaWarnings(campaigns, config)
  const metaErrors = metaResult.errors

  const hasErrors = result.errors.length > 0 || metaErrors.length > 0

  // Collect AI warnings
  const allWarnings: AiWarning[] = []

  for (const c of campaigns) {
    const campaignWarnings = await collectCampaignAiWarnings(c.file, c.campaign)
    allWarnings.push(...campaignWarnings)
  }

  const manifestWarnings = await collectManifestWarnings(rootDir)
  allWarnings.push(...manifestWarnings)

  // Add Meta warnings
  allWarnings.push(...metaResult.warnings)

  const allErrors = [
    ...result.errors.map(e => ({ file: e.file, message: e.message })),
    ...metaErrors.map(e => ({ file: 'meta', message: e })),
  ]

  if (flags.json) {
    console.log(JSON.stringify({
      valid: !hasErrors,
      config: config ? 'loaded' : 'not found',
      campaigns: campaigns.map(c => ({
        file: c.file,
        export: c.exportName,
        provider: c.provider,
        kind: c.kind,
      })),
      errors: allErrors,
      warnings: allWarnings.map(w => ({
        type: w.type,
        message: w.message,
      })),
    }, null, 2))
  } else {
    // Config status
    if (config) {
      console.log('Config: ads.config.ts loaded')
    } else {
      console.log('Config: ads.config.ts not found (optional)')
    }
    console.log()

    // Campaigns found
    if (campaigns.length > 0) {
      console.log(`Campaigns: ${campaigns.length} found`)
      for (const c of campaigns) {
        const relFile = c.file.replace(rootDir + '/', '')
        console.log(`  ${c.provider}/${c.kind}  ${relFile} (export: ${c.exportName})`)
      }
    } else {
      console.log('Campaigns: none found')
    }

    // Import errors
    if (result.errors.length > 0) {
      console.log()
      console.log(`Import Errors: ${result.errors.length}`)
      for (const e of result.errors) {
        const relFile = e.file.replace(rootDir + '/', '')
        console.log(`  \u2717 ${relFile}: ${e.message}`)
      }
    }

    // Meta validation errors
    if (metaErrors.length > 0) {
      console.log()
      console.log(`Meta Validation Errors: ${metaErrors.length}`)
      for (const e of metaErrors) {
        console.log(`  \u2717 ${e}`)
      }
    }

    // AI Warnings (informational — do not affect exit code)
    if (allWarnings.length > 0) {
      console.log()
      console.log(`Warnings: ${allWarnings.length}`)
      for (const w of allWarnings) {
        console.log(`  \u26A0 ${w.message}`)
      }
    }

    console.log()
    console.log(hasErrors ? 'Validation failed.' : 'Validation passed.')
  }

  process.exit(hasErrors ? 1 : 0)
}
