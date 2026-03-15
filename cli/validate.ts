import { join } from 'node:path'
import { statSync } from 'node:fs'
import { discoverCampaigns, loadConfig } from '../src/core/discovery.ts'
import { isRsaMarker, isKeywordsMarker } from '../src/ai/types.ts'
import { readLockFile, getSlot } from '../src/ai/lockfile.ts'
import { checkStaleness } from '../src/ai/resolve.ts'
import { readManifest } from '../src/ai/manifest.ts'
import type { GoogleSearchCampaignUnresolved, GoogleAdGroupUnresolved } from '../src/google/types.ts'
import type { GlobalFlags } from './init.ts'

const VALIDATE_USAGE = `
ads validate — Validate campaign files and report errors

Discovers all campaign files in campaigns/**/*.ts, loads them,
and reports any import errors or structural issues.

Flags:
  --json        Output results as JSON
  --provider    Only validate campaigns for this provider
  --help, -h    Show this help message
`.trim()

// === AI Warning Types ===

type AiWarning = {
  readonly type: 'unresolved' | 'stale-lock' | 'stale-generated' | 'judge-warning'
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

  const hasErrors = result.errors.length > 0

  // Collect AI warnings
  const allWarnings: AiWarning[] = []

  for (const c of campaigns) {
    const campaignWarnings = await collectCampaignAiWarnings(c.file, c.campaign)
    allWarnings.push(...campaignWarnings)
  }

  const manifestWarnings = await collectManifestWarnings(rootDir)
  allWarnings.push(...manifestWarnings)

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
      errors: result.errors.map(e => ({
        file: e.file,
        message: e.message,
      })),
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

    // Errors
    if (hasErrors) {
      console.log()
      console.log(`Errors: ${result.errors.length}`)
      for (const e of result.errors) {
        const relFile = e.file.replace(rootDir + '/', '')
        console.log(`  \u2717 ${relFile}: ${e.message}`)
      }
    }

    // AI Warnings (informational — do not affect exit code)
    if (allWarnings.length > 0) {
      console.log()
      console.log(`AI Warnings: ${allWarnings.length}`)
      for (const w of allWarnings) {
        console.log(`  \u26A0 ${w.message}`)
      }
    }

    console.log()
    console.log(hasErrors ? 'Validation failed.' : 'Validation passed.')
  }

  process.exit(hasErrors ? 1 : 0)
}
