/**
 * CLI command: ads performance
 *
 * Fetches live performance data, runs analysis (violations, signals,
 * recommendations), and optionally evaluates strategy via AI.
 *
 * Usage:
 *   ads performance [--period 7d|30d|90d] [--campaign <slug>] [--no-ai] [--json] [--provider google|meta]
 */

import { loadConfig, discoverCampaigns } from '../src/core/discovery.ts'
import { resolveProviders, getProvider } from '../src/core/providers.ts'
import type { AdsConfig, Resource } from '../src/core/types.ts'
import type { GlobalFlags } from './init.ts'
import type {
  PerformanceData,
  PerformanceReport,
  PerformanceSignal,
  PerformanceRecommendation,
  PerformancePeriod,
} from '../src/performance/types.ts'
import { fetchPerformance } from '../src/performance/fetch.ts'
import type { FetchPerformanceInput } from '../src/performance/fetch.ts'
import { analyze } from '../src/performance/analyze.ts'
import { extractTargets, resolveTargetInheritance, buildPerformanceReport } from '../src/performance/resolve.ts'

// ---------------------------------------------------------------------------
// Period parsing
// ---------------------------------------------------------------------------

const DAYS_REGEX = /^(\d+)d$/
const RANGE_REGEX = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

/**
 * Parse a period string into a PerformancePeriod.
 * Supports two formats:
 *   - "Nd" (e.g., "7d", "30d") — last N days ending today
 *   - "YYYY-MM-DD:YYYY-MM-DD" — explicit date range
 */
export function parsePeriod(input: string): PerformancePeriod {
  // Try Nd format first
  const daysMatch = DAYS_REGEX.exec(input)
  if (daysMatch) {
    const days = parseInt(daysMatch[1]!, 10)
    const end = new Date()
    end.setHours(23, 59, 59, 999)

    const start = new Date(end)
    start.setDate(start.getDate() - days)
    start.setHours(0, 0, 0, 0)

    return { start, end }
  }

  // Try date range format: YYYY-MM-DD:YYYY-MM-DD
  const rangeMatch = RANGE_REGEX.exec(input)
  if (rangeMatch) {
    return { start: new Date(rangeMatch[1]!), end: new Date(rangeMatch[2]!) }
  }

  console.error(`Invalid period format: "${input}". Use "7d" or "2026-03-01:2026-03-15".`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Provider client creation
// ---------------------------------------------------------------------------

export async function buildFetchInput(
  config: AdsConfig,
  period: PerformancePeriod,
  providerFilter?: string,
): Promise<FetchPerformanceInput> {
  const input: { google?: FetchPerformanceInput['google']; meta?: FetchPerformanceInput['meta']; period: PerformancePeriod } = { period }

  // Google
  if (config.google && (!providerFilter || providerFilter === 'google')) {
    try {
      const { createGoogleClient } = await import('../src/google/api.ts')
      const client = await createGoogleClient({ type: 'env' })
      input.google = { client }
    } catch {
      if (providerFilter === 'google') {
        console.error('Failed to create Google Ads client. Check credentials.')
        process.exit(1)
      }
      // Non-fatal when not explicitly filtering to Google
    }
  }

  // Meta
  if (config.meta && (!providerFilter || providerFilter === 'meta')) {
    try {
      const { createMetaClient } = await import('../src/meta/api.ts')
      const client = createMetaClient(config.meta)
      input.meta = { client, accountId: config.meta.accountId }
    } catch {
      if (providerFilter === 'meta') {
        console.error('Failed to create Meta Ads client. Check credentials.')
        process.exit(1)
      }
    }
  }

  return input
}

// ---------------------------------------------------------------------------
// Campaign discovery + flatten for target extraction
// ---------------------------------------------------------------------------

async function discoverAndFlatten(
  rootDir: string,
  providerFilter?: string,
): Promise<Resource[]> {
  const discovery = await discoverCampaigns(rootDir)
  if (discovery.campaigns.length === 0) return []

  const grouped = resolveProviders(discovery.campaigns, providerFilter)
  const allResources: Resource[] = []

  for (const [providerName, campaigns] of grouped) {
    const providerModule = await getProvider(providerName)
    const campaignObjects = campaigns.map(c => c.campaign)
    const resources = providerModule.flatten(campaignObjects)
    allResources.push(...resources)
  }

  return allResources
}

// ---------------------------------------------------------------------------
// Human-readable output formatting
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '\u20ac', USD: '$', GBP: '\u00a3' }

function sym(code = 'USD'): string {
  return CURRENCY_SYMBOLS[code] ?? code + ' '
}

function fmtMoney(n: number, currency?: string): string {
  return `${sym(currency)}${n.toFixed(2)}`
}

function fmtRatio(n: number | null): string {
  return n !== null ? `${n.toFixed(2)}x` : 'n/a'
}

function targetCheck(actual: number | null, target: number | undefined, lower: boolean): string {
  if (target === undefined || actual === null) return ''
  const ok = lower ? actual >= target : actual <= target
  return ok ? ' \u2713' : ' \u2717'
}

export function formatReport(report: PerformanceReport, periodLabel: string): string {
  const lines: string[] = []

  lines.push(`Performance Report \u2014 last ${periodLabel}`)
  lines.push('\u2550'.repeat(50))
  lines.push('')

  // Campaign-level data
  const campaigns = report.data.filter(d => d.kind === 'campaign')

  for (const d of campaigns) {
    const budget = d.targets?.maxBudget
    const budgetStr = budget ? `  budget: ${sym(budget.currency)}${budget.amount}/day` : ''

    lines.push(`${d.resource} (${d.provider})${budgetStr}`)

    // CPA line
    const cpaTarget = d.targets?.targetCPA
    const cpaStr = d.metrics.cpa !== null ? fmtMoney(d.metrics.cpa) : 'n/a'
    const cpaTargetStr = cpaTarget !== undefined ? `  target: ${fmtMoney(cpaTarget)}` : ''
    const cpaCheck = targetCheck(d.metrics.cpa, cpaTarget, false)
    const spendStr = `spend: ${fmtMoney(d.metrics.cost)}`
    lines.push(`  CPA  ${cpaStr}${cpaTargetStr}${cpaCheck}            ${spendStr}`)

    // ROAS line
    const roasTarget = d.targets?.minROAS
    const roasStr = fmtRatio(d.metrics.roas)
    const roasTargetStr = roasTarget !== undefined ? `  target: ${fmtRatio(roasTarget)}` : ''
    const roasCheck = targetCheck(d.metrics.roas, roasTarget, true)
    const convStr = `conversions: ${d.metrics.conversions}`
    lines.push(`  ROAS ${roasStr}${roasTargetStr}${roasCheck}             ${convStr}`)

    lines.push('')
  }

  // Signals
  const warningAndCritical = report.signals.filter(s => s.severity !== 'info')
  if (warningAndCritical.length > 0) {
    lines.push('Signals')
    for (const s of warningAndCritical) {
      const icon = s.severity === 'critical' ? '\u2717' : '\u26a0'
      lines.push(`  ${icon} ${s.resource} \u2014 ${s.message}`)
    }
    lines.push('')
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push('Recommendations')
    for (const r of report.recommendations) {
      const source = r.source === 'ai' ? '[ai]' : '[computed]'
      lines.push(`  \u25b2 ${r.resource}: ${r.type} (${r.reason})  ${source}`)
    }
    lines.push('')
  }

  // Summary
  const s = report.summary
  lines.push(
    `Summary: ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} \u00b7 ` +
    `${fmtMoney(s.totalSpend)} spend \u00b7 ${s.totalConversions} conversions \u00b7 ` +
    `CPA ${s.overallCPA !== null ? fmtMoney(s.overallCPA) : 'n/a'} \u00b7 ` +
    `ROAS ${fmtRatio(s.overallROAS)}`,
  )
  lines.push(
    `         ${s.violationCount} violation${s.violationCount !== 1 ? 's' : ''} \u00b7 ` +
    `${report.signals.length} signal${report.signals.length !== 1 ? 's' : ''} \u00b7 ` +
    `${report.recommendations.length} recommendation${report.recommendations.length !== 1 ? 's' : ''}`,
  )

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function runPerformance(args: string[], flags: GlobalFlags): Promise<void> {
  const rootDir = process.cwd()

  // Parse flags
  const periodArg = getFlag(args, '--period') ?? '7d'
  const campaignFilter = getFlag(args, '--campaign')
  const noAi = args.includes('--no-ai')
  const period = parsePeriod(periodArg)

  // 1. Load config
  const config = await loadConfig(rootDir)
  if (!config) {
    console.error('No ads.config.ts found. Run "ads init" first.')
    process.exit(1)
    return
  }

  // 2. Discover campaigns and flatten to extract targets
  const resources = await discoverAndFlatten(rootDir, flags.provider)
  const allTargets = extractTargets(resources)

  // Resolve inheritance for all performance data paths (not just target keys)
  // so child resources inherit parent targets even without explicit declarations
  const resolvedTargets = new Map<string, import('../src/performance/types.ts').PerformanceTargets>()

  // 3. Build provider clients and fetch performance data
  const fetchInput = await buildFetchInput(config, period, flags.provider)

  if (!fetchInput.google && !fetchInput.meta) {
    console.error('No provider credentials available. Configure google or meta in ads.config.ts.')
    process.exit(1)
    return
  }

  let data: PerformanceData[]
  try {
    data = await fetchPerformance(fetchInput)
  } catch (err) {
    console.error('Failed to fetch performance data:', err instanceof Error ? err.message : err)
    process.exit(1)
    return
  }

  // 4. Filter by campaign if requested
  if (campaignFilter) {
    data = data.filter(d => d.resource.startsWith(campaignFilter))
  }

  if (data.length === 0) {
    console.log('No performance data found for the selected period and filters.')
    return
  }

  // 5. Resolve target inheritance for all data paths (not just declared targets)
  for (const d of data) {
    const resolved = resolveTargetInheritance(d.resource, allTargets)
    if (resolved && Object.keys(resolved).length > 0) {
      resolvedTargets.set(d.resource, resolved)
    }
  }

  // 6. Analyze — compute violations, detect signals, generate recommendations
  const analysis = analyze(data, resolvedTargets)

  // 6. AI strategy evaluation (if targets have strategy and --no-ai not set)
  let aiRecommendations: PerformanceRecommendation[] = []

  if (!noAi) {
    // Find any strategy from targets
    const strategies = [...resolvedTargets.values()]
      .map(t => t.strategy)
      .filter((s): s is string => s !== undefined)

    if (strategies.length > 0) {
      // Resolve AI model from config (same pattern as optimize.ts)
      let aiModel: unknown | undefined
      try {
        const configPath = `${rootDir}/ads.config.ts`
        const file = Bun.file(configPath)
        if (await file.exists()) {
          const mod = await import(configPath)
          const fullConfig = mod.default as Record<string, unknown> | undefined
          if (fullConfig?.['ai']) {
            const aiConfig = fullConfig['ai'] as { model?: unknown }
            aiModel = aiConfig.model
          }
        }
      } catch {
        // Config AI loading failed — skip AI evaluation
      }

      if (aiModel) {
        try {
          const { evaluateStrategy } = await import('../src/performance/evaluate.ts')
          const strategy = strategies.join('\n\n')

          const result = await evaluateStrategy({
            strategy,
            data: analysis.data,
            signals: analysis.signals,
            model: aiModel as import('ai').LanguageModel,
          })

          aiRecommendations = result.recommendations
        } catch {
          // AI evaluation is best-effort — don't fail the command
        }
      }
    }
  }

  // 7. Build report
  const allRecommendations = [...analysis.recommendations, ...aiRecommendations]
  const report = buildPerformanceReport(analysis.data, analysis.signals, allRecommendations, period)

  // 8. Output
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatReport(report, periodArg))
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}
