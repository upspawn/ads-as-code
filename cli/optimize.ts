import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import type { GoogleSearchCampaign } from '../src/google/types.ts'
import type { GlobalFlags } from './init.ts'
import {
  buildOptimizePrompt,
  buildCrossAnalysisPrompt,
  analyzeWithAI,
  parseOptimizeResponse,
  formatSuggestions,
} from '../src/ai/optimize.ts'
import type { Suggestion } from '../src/ai/optimize.ts'

// ─── Usage ──────────────────────────────────────────────────────────

const OPTIMIZE_USAGE = `
ads optimize — AI-powered campaign optimization analysis

Usage:
  ads optimize [path] [flags]

Arguments:
  path              Campaign file or directory (default: current directory)

Flags:
  --all             Include generated/ campaigns; cross-campaign analysis
  --prompt "..."    Custom analysis instructions (supplements defaults)
  --interactive     Present suggestions one at a time for accept/skip
  --apply           Auto-apply mechanically applicable suggestions
  --patch           Generate .optimize-patch.json without applying
  --json            Output raw AI response as JSON
  --help, -h        Show this help message

Examples:
  ads optimize                              Analyze all campaigns
  ads optimize campaigns/search-dropbox.ts  Analyze a specific file
  ads optimize --all                        Cross-campaign analysis
  ads optimize --prompt "Focus on CPA"      Custom analysis focus
  ads optimize --interactive                Review suggestions one by one
  ads optimize --apply                      Auto-apply safe changes
  ads optimize --patch                      Generate patch file only
`.trim()

// ─── Flag Parsing ───────────────────────────────────────────────────

type OptimizeFlags = {
  readonly path?: string
  readonly all: boolean
  readonly prompt?: string
  readonly interactive: boolean
  readonly apply: boolean
  readonly patch: boolean
  readonly json: boolean
  readonly help: boolean
}

function parseOptimizeFlags(args: string[]): OptimizeFlags {
  let path: string | undefined
  let all = false
  let prompt: string | undefined
  let interactive = false
  let apply = false
  let patch = false
  const json = args.includes('--json')
  const help = args.includes('--help') || args.includes('-h')

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    switch (arg) {
      case '--all':
        all = true
        break
      case '--prompt': {
        const next = args[i + 1]
        if (next && !next.startsWith('--')) {
          prompt = next
          i++
        }
        break
      }
      case '--interactive':
        interactive = true
        break
      case '--apply':
        apply = true
        break
      case '--patch':
        patch = true
        break
      case '--json':
      case '--help':
      case '-h':
        break // already handled above
      default:
        // Positional arg: treat as path if it doesn't start with --
        if (!arg.startsWith('--') && !path) {
          path = arg
        }
    }
  }

  return { path, all, prompt, interactive, apply, patch, json, help }
}

// ─── Token Cost Estimation ──────────────────────────────────────────

/** Rough cost estimate based on GPT-4.1-mini pricing ($0.40/M input, $1.60/M output). */
function estimateCost(promptTokens: number, completionTokens: number): string {
  const inputCost = (promptTokens / 1_000_000) * 0.4
  const outputCost = (completionTokens / 1_000_000) * 1.6
  const total = inputCost + outputCost
  return `$${total.toFixed(2)}`
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-US')
}

// ─── Interactive Mode ───────────────────────────────────────────────

async function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt)
  return new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8')
    process.stdin.once('data', (data: string) => {
      resolve(data.trim().toLowerCase())
    })
    process.stdin.resume()
  })
}

async function interactiveReview(suggestions: Suggestion[]): Promise<Suggestion[]> {
  const accepted: Suggestion[] = []

  console.log(`\n  ${suggestions.length} suggestions to review:\n`)

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i]!
    const prefix = s.severity === 'warning' ? '\u26A0' : '\u2139'
    const groupTag = s.group ? ` [${s.group}]` : ''
    console.log(`  [${i + 1}/${suggestions.length}] ${prefix} ${s.type} — ${s.campaign}${groupTag}`)
    console.log(`    ${s.message}`)
    if (s.suggestion) {
      console.log(`    + ${s.suggestion}`)
    }

    const answer = await readLine('    Accept? (y/n/q) ')
    if (answer === 'q' || answer === 'quit') {
      console.log('  Stopped reviewing.')
      break
    }
    if (answer === 'y' || answer === 'yes') {
      accepted.push(s)
      console.log('    \u2713 Accepted')
    } else {
      console.log('    Skipped')
    }
    console.log()
  }

  process.stdin.pause()
  return accepted
}

// ─── Apply / Patch ──────────────────────────────────────────────────

type PatchEntry = {
  readonly file?: string
  readonly type: string
  readonly campaign: string
  readonly group?: string
  readonly action: string
  readonly value?: string
  readonly applied: boolean
  readonly reason?: string
}

/**
 * Attempt to mechanically apply a suggestion to a campaign file.
 *
 * Only handles simple cases:
 * - negative-gap: insert a negative keyword before the closing ] of the negatives array
 * - missing-keyword: insert a keyword before the closing ] of the keywords array
 *
 * Returns whether the suggestion was applied, plus the file path if applicable.
 */
async function tryApplySuggestion(
  suggestion: Suggestion,
  campaignFiles: Map<string, string>,
): Promise<PatchEntry> {
  const entry: PatchEntry = {
    type: suggestion.type,
    campaign: suggestion.campaign,
    group: suggestion.group,
    action: suggestion.message,
    value: suggestion.suggestion,
    applied: false,
  }

  // Only attempt mechanical application for keyword/negative additions
  if (suggestion.type !== 'negative-gap' && suggestion.type !== 'missing-keyword') {
    return { ...entry, reason: 'not mechanically applicable' }
  }

  // Find the campaign file
  const filePath = campaignFiles.get(suggestion.campaign)
  if (!filePath) {
    return { ...entry, reason: 'campaign file not found' }
  }

  // Extract keyword text from the suggestion message or suggestion field
  const kwMatch = suggestion.suggestion?.match(/"([^"]+)"/) ??
    suggestion.message.match(/"([^"]+)"/)
  if (!kwMatch) {
    return { ...entry, reason: 'could not extract keyword text from suggestion' }
  }

  const keywordText = kwMatch[1]!

  // Read the file
  const file = Bun.file(filePath)
  const content = await file.text()

  if (suggestion.type === 'negative-gap') {
    // Find the campaign-level negatives array and insert before its closing bracket.
    // Pattern: find negatives: [...] and insert before the last ]
    // We look for the negatives array after the campaign builder call.
    const negativesRe = /(negatives:\s*\[[\s\S]*?)(]\s*[,)\n])/
    const match = negativesRe.exec(content)
    if (!match) {
      return { ...entry, reason: 'could not find negatives array in file' }
    }

    const insertion = `...broad('${keywordText}'), `
    const newContent = content.replace(
      negativesRe,
      `${match[1]}${insertion}${match[2]}`,
    )

    await Bun.write(filePath, newContent)
    return { ...entry, file: filePath, applied: true }
  }

  if (suggestion.type === 'missing-keyword') {
    // Find the group's keywords array
    const groupKey = suggestion.group
    if (!groupKey) {
      return { ...entry, reason: 'no group specified for keyword suggestion' }
    }

    // Look for the group definition and its keywords array
    const groupRe = new RegExp(
      `\\.group\\(['"]${escapeRegex(groupKey)}['"].*?keywords:\\s*\\[([\\s\\S]*?)\\]`,
    )
    const match = groupRe.exec(content)
    if (!match) {
      return { ...entry, reason: `could not find keywords array for group ${groupKey}` }
    }

    const insertion = `phrase('${keywordText}'), `
    const fullMatch = match[0]!
    const insertionPoint = fullMatch.lastIndexOf(']')
    const newMatch = fullMatch.slice(0, insertionPoint) + insertion + fullMatch.slice(insertionPoint)
    const newContent = content.replace(fullMatch, newMatch)

    await Bun.write(filePath, newContent)
    return { ...entry, file: filePath, applied: true }
  }

  return { ...entry, reason: 'not mechanically applicable' }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Main Command ───────────────────────────────────────────────────

export async function runOptimize(args: string[], flags: GlobalFlags): Promise<void> {
  const optimizeFlags = parseOptimizeFlags(args)

  if (optimizeFlags.help || flags.help) {
    console.log(OPTIMIZE_USAGE)
    return
  }

  const rootDir = optimizeFlags.path
    ? (optimizeFlags.path.startsWith('/') ? optimizeFlags.path : `${process.cwd()}/${optimizeFlags.path}`)
    : process.cwd()

  // 1. Load config
  const config = await loadConfig(rootDir)

  // 2. Try to resolve AI model from config
  // The config may have an `ai` field with model info. Since AiConfig uses LanguageModel
  // (from Vercel AI SDK), the user must have it configured in their ads.config.ts.
  // We dynamically import the config to get the ai field.
  let aiModel: unknown | undefined
  let configPrompt: string | undefined

  try {
    const configPath = `${rootDir}/ads.config.ts`
    const file = Bun.file(configPath)
    if (await file.exists()) {
      const mod = await import(configPath)
      const fullConfig = mod.default as Record<string, unknown> | undefined
      if (fullConfig?.['ai']) {
        const aiConfig = fullConfig['ai'] as { model?: unknown; optimize?: { prompt?: string } }
        aiModel = aiConfig.model
        configPrompt = aiConfig.optimize?.prompt
      }
    }
  } catch {
    // Config loading failed — we'll error below if no model
  }

  if (!aiModel) {
    console.error('Error: No AI model configured.')
    console.error('')
    console.error('Add an AI configuration to your ads.config.ts:')
    console.error('')
    console.error("  import { openai } from '@ai-sdk/openai'")
    console.error('')
    console.error('  export default defineConfig({')
    console.error('    ai: {')
    console.error("      model: openai('gpt-4.1-mini'),")
    console.error('    },')
    console.error('    // ...rest of config')
    console.error('  })')
    process.exit(1)
  }

  // 3. Discover campaigns
  const discovery = await discoverCampaigns(rootDir)
  if (discovery.errors.length > 0) {
    console.error('Campaign discovery errors:')
    for (const err of discovery.errors) {
      console.error(`  ${err.file}: ${err.message}`)
    }
  }

  const googleCampaigns = discovery.campaigns
    .filter((c) => c.provider === 'google')
    .map((c) => c.campaign as GoogleSearchCampaign)

  if (googleCampaigns.length === 0) {
    console.error('No Google campaigns found.')
    process.exit(1)
  }

  // Build a map of campaign name -> file path for apply mode
  const campaignFiles = new Map<string, string>()
  for (const dc of discovery.campaigns) {
    const camp = dc.campaign as GoogleSearchCampaign
    campaignFiles.set(camp.name, dc.file)
  }

  // 4. Build prompt
  const prompt = optimizeFlags.all
    ? buildCrossAnalysisPrompt(googleCampaigns)
    : buildOptimizePrompt(googleCampaigns, optimizeFlags.prompt, configPrompt)

  // 5. Call AI
  console.log(`Analyzing ${googleCampaigns.length} campaign${googleCampaigns.length !== 1 ? 's' : ''}...`)
  console.log()

  const result = await analyzeWithAI(aiModel, prompt)

  // 6. Parse response
  const suggestions = parseOptimizeResponse(result.text)

  // 7. Output based on mode
  if (optimizeFlags.json) {
    console.log(JSON.stringify({
      suggestions,
      raw: result.text,
      usage: result.usage,
    }, null, 2))
    return
  }

  // Interactive mode: present suggestions one by one
  if (optimizeFlags.interactive) {
    if (suggestions.length === 0) {
      console.log('No structured suggestions found in the analysis.')
      console.log()
      console.log('Raw analysis:')
      console.log(result.text)
    } else {
      const accepted = await interactiveReview(suggestions)
      console.log(`\n  Accepted ${accepted.length} of ${suggestions.length} suggestions.`)

      if (accepted.length > 0 && (optimizeFlags.apply || optimizeFlags.patch)) {
        await applyOrPatch(accepted, campaignFiles, rootDir, optimizeFlags.patch)
      }
    }
  }
  // Apply mode: auto-apply mechanically applicable suggestions
  else if (optimizeFlags.apply || optimizeFlags.patch) {
    if (suggestions.length === 0) {
      console.log('No structured suggestions to apply.')
      console.log()
      console.log('Raw analysis:')
      console.log(result.text)
    } else {
      console.log(formatSuggestions(suggestions))
      console.log()
      await applyOrPatch(suggestions, campaignFiles, rootDir, optimizeFlags.patch)
    }
  }
  // Default: just print formatted suggestions
  else {
    if (suggestions.length > 0) {
      console.log(formatSuggestions(suggestions))
    } else {
      console.log('No structured suggestions found.')
      console.log()
      console.log('Raw analysis:')
      console.log(result.text)
    }
  }

  // 8. Token usage summary
  console.log()
  console.log(
    `    Tokens: ${formatTokens(result.usage.promptTokens)} input / ` +
    `${formatTokens(result.usage.completionTokens)} output ` +
    `(~${estimateCost(result.usage.promptTokens, result.usage.completionTokens)})`,
  )
}

async function applyOrPatch(
  suggestions: Suggestion[],
  campaignFiles: Map<string, string>,
  rootDir: string,
  patchOnly: boolean,
): Promise<void> {
  const patches: PatchEntry[] = []

  for (const suggestion of suggestions) {
    if (patchOnly) {
      // Don't actually apply — just record what would happen
      patches.push({
        type: suggestion.type,
        campaign: suggestion.campaign,
        group: suggestion.group,
        action: suggestion.message,
        value: suggestion.suggestion,
        applied: false,
        reason: 'patch-only mode',
      })
    } else {
      const entry = await tryApplySuggestion(suggestion, campaignFiles)
      patches.push(entry)
    }
  }

  // Write patch file
  const patchPath = `${rootDir}/.optimize-patch.json`
  await Bun.write(patchPath, JSON.stringify(patches, null, 2) + '\n')

  const appliedCount = patches.filter((p) => p.applied).length
  const skippedCount = patches.filter((p) => !p.applied).length

  if (patchOnly) {
    console.log(`  Patch file written: ${patchPath}`)
    console.log(`  ${patches.length} suggestions recorded.`)
  } else {
    console.log(`  Applied: ${appliedCount} | Skipped: ${skippedCount}`)
    if (skippedCount > 0) {
      console.log('  Skipped suggestions (not mechanically applicable):')
      for (const p of patches.filter((e) => !e.applied)) {
        console.log(`    - ${p.action} (${p.reason})`)
      }
    }
    console.log(`  Patch log: ${patchPath}`)
  }
}
