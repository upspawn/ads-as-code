import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { isRsaMarker, isKeywordsMarker } from '../src/ai/types.ts'
import { readLockFile, writeLockFile, pinValue, unpinValue } from '../src/ai/lockfile.ts'
import { generateForCampaign, generateAll } from '../src/ai/generate.ts'
import type { GenerateResult } from '../src/ai/generate.ts'
import type { GlobalFlags } from './init.ts'

// ─── Flag Parsing ───────────────────────────────────────────────────

type GenerateFlags = {
  dryRun: boolean
  reroll?: string
  pin?: string
  unpin?: string
  seed?: string
  filter?: string
  yes: boolean
}

function parseGenerateFlags(args: string[]): { flags: GenerateFlags; positional: string | undefined } {
  const flags: GenerateFlags = {
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes') || args.includes('-y'),
    reroll: getFlag(args, '--reroll'),
    pin: getFlag(args, '--pin'),
    unpin: getFlag(args, '--unpin'),
    seed: getFlag(args, '--seed'),
    filter: getFlag(args, '--filter'),
  }

  // First positional arg (not a flag) is the campaign path
  const positional = args.find((a) => !a.startsWith('--') && !a.startsWith('-') && !isValueOfFlag(args, a))

  return { flags, positional }
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

/** Check if a value is the argument of a preceding flag. */
function isValueOfFlag(args: string[], value: string): boolean {
  const index = args.indexOf(value)
  if (index <= 0) return false
  const prev = args[index - 1]!
  return prev.startsWith('--') && !prev.startsWith('--no-')
}

// ─── Marker Counting ────────────────────────────────────────────────

type MarkerScan = {
  rsaCount: number
  keywordsCount: number
  slotKeys: string[]
}

function scanMarkers(campaign: { groups: Record<string, { keywords: readonly unknown[]; ads: readonly unknown[] }> }): MarkerScan {
  let rsaCount = 0
  let keywordsCount = 0
  const slotKeys: string[] = []

  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    for (const ad of group.ads) {
      if (isRsaMarker(ad)) {
        rsaCount++
        slotKeys.push(`${groupKey}.ad`)
      }
    }
    for (const kw of group.keywords) {
      if (isKeywordsMarker(kw)) {
        keywordsCount++
        slotKeys.push(`${groupKey}.keywords`)
      }
    }
  }

  return { rsaCount, keywordsCount, slotKeys }
}

// ─── Output Formatting ─────────────────────────────────────────────

function formatResult(result: GenerateResult): string {
  const lines: string[] = []

  lines.push(`Generation complete.`)
  lines.push(`  Slots generated: ${result.slotsGenerated}`)
  lines.push(`  Slots skipped:   ${result.slotsSkipped}`)
  lines.push(`  Input tokens:    ${result.totalInputTokens.toLocaleString()}`)
  lines.push(`  Output tokens:   ${result.totalOutputTokens.toLocaleString()}`)

  return lines.join('\n')
}

// ─── Main Entry Point ───────────────────────────────────────────────

const GENERATE_USAGE = `
ads generate — AI-powered ad copy and keyword generation

Usage:
  ads generate [campaign-path] [options]

Options:
  --dry-run        Scan markers, report what would be generated, exit
  --reroll <slot>  Regenerate a specific slot (e.g. "main.ad")
  --pin <slot>     Pin a slot value in the lock file
  --unpin <slot>   Unpin a slot value in the lock file
  --seed <path>    Path to a seed file for generation context
  --filter <glob>  Filter campaigns by glob pattern
  --yes, -y        Skip confirmation prompt
  --help, -h       Show this help message
`.trim()

export async function runGenerate(args: string[], globalFlags: GlobalFlags): Promise<void> {
  if (globalFlags.help) {
    console.log(GENERATE_USAGE)
    return
  }

  const { flags, positional } = parseGenerateFlags(args)
  const rootDir = process.cwd()

  // Load config
  const config = await loadConfig(rootDir)
  if (!config) {
    console.error('No ads.config.ts found. Run "ads init" first.')
    process.exit(1)
  }

  if (!config.ai) {
    console.error('No "ai" section in ads.config.ts. Configure an AI model to use generation.')
    console.error('')
    console.error('Example:')
    console.error('  import { anthropic } from "@ai-sdk/anthropic"')
    console.error('  export default defineConfig({')
    console.error('    ai: { model: anthropic("claude-sonnet-4-20250514") },')
    console.error('  })')
    process.exit(1)
  }

  // Discover campaigns
  const discovery = await discoverCampaigns(rootDir)
  if (discovery.errors.length > 0) {
    console.error('Campaign discovery errors:')
    for (const err of discovery.errors) {
      console.error(`  ${err.file}: ${err.message}`)
    }
    process.exit(1)
  }

  // Filter to specific campaign if positional arg provided
  let campaigns = discovery.campaigns
  if (positional) {
    campaigns = campaigns.filter((c) => c.file.includes(positional))
    if (campaigns.length === 0) {
      console.error(`No campaign found matching "${positional}"`)
      process.exit(1)
    }
  }

  if (flags.filter) {
    const pattern = new Bun.Glob(flags.filter)
    campaigns = campaigns.filter((c) => pattern.match(c.file))
  }

  if (campaigns.length === 0) {
    console.log('No campaigns found in campaigns/**/*.ts')
    return
  }

  // Pin/unpin mode — modify lock file and exit
  if (flags.pin !== undefined) {
    await handlePinUnpin(campaigns, flags.pin, 'pin')
    return
  }

  if (flags.unpin !== undefined) {
    await handlePinUnpin(campaigns, flags.unpin, 'unpin')
    return
  }

  // Scan all markers for dry-run and confirmation
  type CampaignLike = { groups: Record<string, { keywords: readonly unknown[]; ads: readonly unknown[] }> }
  let totalSlots = 0
  const campaignScans: Array<{ name: string; scan: MarkerScan }> = []

  for (const c of campaigns) {
    const campaign = c.campaign as CampaignLike & { name: string }
    const scan = scanMarkers(campaign)
    totalSlots += scan.slotKeys.length
    campaignScans.push({ name: campaign.name, scan })
  }

  if (totalSlots === 0) {
    console.log('No AI markers found in campaigns. Nothing to generate.')
    return
  }

  // Dry-run mode
  if (flags.dryRun) {
    console.log('Dry run — would generate the following slots:\n')
    for (const { name, scan } of campaignScans) {
      if (scan.slotKeys.length === 0) continue
      console.log(`  Campaign "${name}":`)
      for (const key of scan.slotKeys) {
        console.log(`    - ${key}`)
      }
    }
    console.log(`\n  Total: ${totalSlots} slot${totalSlots !== 1 ? 's' : ''}`)
    return
  }

  // Confirmation prompt for large operations
  if (totalSlots > 10 && !flags.yes) {
    console.log(`About to generate ${totalSlots} AI slots across ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}.`)
    console.log('This will call the AI model and incur token costs.')
    console.log('Run with --yes or -y to skip this prompt.\n')

    process.stdout.write('Continue? (y/N) ')
    const response = await readLine()
    if (response.toLowerCase() !== 'y') {
      console.log('Aborted.')
      return
    }
  }

  // Run generation
  const aiConfig = config.ai
  const discovered = campaigns.map((c) => ({
    file: c.file,
    campaign: c.campaign as { name: string; groups: Record<string, { keywords: readonly unknown[]; ads: readonly unknown[] }> },
  }))

  const judgeConfig = aiConfig.judge ? { prompt: aiConfig.judge.prompt } : undefined

  const result = await generateAll(
    discovered,
    { model: aiConfig.model, judge: judgeConfig },
    { reroll: flags.reroll },
  )

  console.log(formatResult(result))
}

// ─── Pin/Unpin Handler ──────────────────────────────────────────────

async function handlePinUnpin(
  campaigns: Array<{ file: string; campaign: unknown }>,
  slotSpec: string,
  mode: 'pin' | 'unpin',
): Promise<void> {
  // slotSpec format: "slot:index" e.g. "main.ad:0" or just "main.ad" (pin all)
  const [slotKey, indexStr] = slotSpec.split(':')
  if (!slotKey) {
    console.error(`Invalid slot spec: "${slotSpec}". Use format "group.ad:index".`)
    process.exit(1)
  }

  const index = indexStr !== undefined ? parseInt(indexStr, 10) : undefined
  if (indexStr !== undefined && (index === undefined || isNaN(index))) {
    console.error(`Invalid index in slot spec: "${slotSpec}". Index must be a number.`)
    process.exit(1)
  }

  // Find the campaign containing this slot
  for (const c of campaigns) {
    let lockFile = await readLockFile(c.file)
    if (!lockFile) continue

    const slot = lockFile.slots[slotKey]
    if (!slot) continue

    if (index !== undefined) {
      lockFile = mode === 'pin' ? pinValue(lockFile, slotKey, index) : unpinValue(lockFile, slotKey, index)
    } else {
      // Pin/unpin all values
      const result = slot.result as Record<string, unknown>
      const items = Array.isArray(result['headlines'])
        ? result['headlines']
        : Array.isArray(result['keywords'])
          ? result['keywords']
          : []

      for (let i = 0; i < items.length; i++) {
        lockFile = mode === 'pin' ? pinValue(lockFile, slotKey, i) : unpinValue(lockFile, slotKey, i)
      }
    }

    await writeLockFile(c.file, lockFile)
    const action = mode === 'pin' ? 'Pinned' : 'Unpinned'
    const target = index !== undefined ? `index ${index} in` : 'all values in'
    console.log(`${action} ${target} slot "${slotKey}"`)
    return
  }

  console.error(`Slot "${slotKey}" not found in any campaign lock file.`)
  process.exit(1)
}

// ─── Stdin Helper ───────────────────────────────────────────────────

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.once('data', (data: string) => {
      stdin.pause()
      resolve(data.trim())
    })
  })
}
