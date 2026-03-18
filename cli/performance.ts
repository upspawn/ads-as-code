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

/** Show full resource path but format keywords nicely. */
function displayName(path: string): string {
  // For keywords at the end: campaign/group/kw:text:MATCH → campaign/group/text [MATCH]
  return path.replace(/kw:([^:]+):(\w+)$/, '$1 [$2]')
}

/** Format a campaign metrics table row. */
function campaignRow(name: string, spend: number, conv: number, cpa: number | null, ctr: number | null): string {
  const nameCol = name.padEnd(40)
  const spendCol = `$${spend.toFixed(2)}`.padStart(10)
  const convCol = String(conv).padStart(6)
  const cpaCol = (cpa !== null ? `$${cpa.toFixed(2)}` : '\u2014').padStart(8)
  const ctrCol = (ctr !== null ? `${(ctr * 100).toFixed(1)}%` : '\u2014').padStart(7)
  return ` ${nameCol} ${spendCol} ${convCol} ${cpaCol} ${ctrCol}`
}

/** Group signals by type for grouped display. */
function groupSignals(signals: PerformanceSignal[]): Map<string, PerformanceSignal[]> {
  const groups = new Map<string, PerformanceSignal[]>()
  for (const s of signals) {
    const group = groups.get(s.type) ?? []
    group.push(s)
    groups.set(s.type, group)
  }
  return groups
}

const SIGNAL_LABELS: Record<string, { icon: string; label: string; hint: string; severity: number }> = {
  'zero-conversions':       { icon: '\u2717', label: 'Zero Conversions',    hint: 'spending money with no results',                      severity: 0 },
  'creative-fatigue':       { icon: '\u26a0', label: 'Creative Fatigue',    hint: 'ad CTR declining over time, audience may be tired of seeing it', severity: 1 },
  'declining-trend':        { icon: '\u26a0', label: 'CTR Declining',       hint: 'click-through rate dropping, ads becoming less effective', severity: 2 },
  'low-quality-score':      { icon: '\u26a0', label: 'Low Quality Score',   hint: 'ad relevance, landing page, or expected CTR needs work', severity: 3 },
  'budget-constrained':     { icon: '\u26a0', label: 'Budget Constrained',  hint: 'CPA is under target but budget limits volume',         severity: 4 },
  'high-frequency':         { icon: '\u26a0', label: 'High Frequency',      hint: 'audience seeing ads too often, may cause fatigue',      severity: 5 },
  'spend-concentration':    { icon: '\u2139', label: 'Spend Concentration', hint: 'single ad group or keyword dominating campaign budget', severity: 6 },
  'search-term-opportunity':{ icon: '\u2139', label: 'Search Term Opportunity', hint: 'converting search terms not yet added as keywords', severity: 7 },
  'learning-phase':         { icon: '\u2139', label: 'Learning Phase',      hint: 'Meta needs ~50 conversions to optimize delivery',      severity: 8 },
  'improving-trend':        { icon: '\u2139', label: 'CTR Improving',       hint: 'click-through rate trending up',                       severity: 9 },
}

/** Get the campaign (root) from a resource path. */
function campaignOf(path: string): string {
  return path.split('/')[0] ?? path
}

/** Get the child path (everything after the campaign). */
function childPath(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(1).join('/')
}

/** Label a resource by its kind based on the child path (after campaign). */
function kindLabel(child: string): string {
  const last = child.split('/').pop() ?? ''
  if (last.startsWith('kw:') || last.includes('[')) return 'keyword'
  // child depth: 1 segment = ad group, 2+ = ad or keyword
  const depth = child.split('/').length
  if (depth === 1) return 'ad group'
  return 'ad'
}

/** Format the detail value for a signal (the part after the resource name). */
function signalValue(s: PerformanceSignal): string {
  const ev = s.evidence as Record<string, unknown>
  switch (s.type) {
    case 'zero-conversions':
      return `$${Number(ev.cost ?? 0).toFixed(2)} spent, 0 conv`
    case 'declining-trend':
    case 'creative-fatigue': {
      const first = Number(ev.firstHalfCtr ?? 0) * 100
      const second = Number(ev.secondHalfCtr ?? 0) * 100
      const pct = first > 0 ? Math.round(((second - first) / first) * 100) : 0
      return `${first.toFixed(1)}% \u2192 ${second.toFixed(1)}% (${pct}%)`
    }
    case 'low-quality-score':
      return `${ev.qualityScore}/10`
    case 'spend-concentration': {
      const childCost = Number(ev.childCost ?? ev.cost ?? 0)
      const campaignCost = Number(ev.campaignCost ?? ev.parentCost ?? 1)
      const share = campaignCost > 0 ? (childCost / campaignCost) * 100 : 0
      return `${share.toFixed(0)}% of budget ($${childCost.toFixed(2)})`
    }
    case 'high-frequency':
      return `${Number(ev.frequency ?? 0).toFixed(1)}x frequency`
    case 'budget-constrained':
      return `CPA $${Number(ev.cpa ?? 0).toFixed(2)} vs target $${Number(ev.targetCPA ?? 0).toFixed(2)}`
    case 'search-term-opportunity':
      return `${ev.conversions} conv, ${ev.clicks} clicks`
    case 'learning-phase':
      return `${ev.conversions} conversions (need 50+)`
    case 'improving-trend': {
      const first = Number(ev.firstHalfCtr ?? 0) * 100
      const second = Number(ev.secondHalfCtr ?? 0) * 100
      return `${first.toFixed(1)}% \u2192 ${second.toFixed(1)}%`
    }
    default:
      return s.message
  }
}

/** Render signals hierarchically: group by type, then by campaign. */
function formatSignalsHierarchical(
  signals: PerformanceSignal[],
  providerOf: Map<string, string>,
  campaignSpend: Map<string, number>,
): string[] {
  const lines: string[] = []
  const grouped = groupSignals(signals)
  const sortedTypes = [...grouped.entries()].sort((a, b) => {
    const sa = SIGNAL_LABELS[a[0]]?.severity ?? 99
    const sb = SIGNAL_LABELS[b[0]]?.severity ?? 99
    return sa - sb
  })

  for (const [type, typeSignals] of sortedTypes) {
    const meta = SIGNAL_LABELS[type] ?? { icon: '\u26a0', label: type, hint: '', severity: 99 }
    lines.push(` ${meta.icon} ${meta.label}${meta.hint ? ` \u2014 ${meta.hint}` : ''}`)

    // Special case: search term opportunities don't group by campaign
    if (type === 'search-term-opportunity') {
      for (const s of typeSignals) {
        const term = String((s.evidence as Record<string, unknown>).term ?? s.resource)
        const provider = providerOf.get(s.resource) ?? providerOf.get(campaignOf(s.resource)) ?? ''
        const tag = provider ? ` (${provider})` : ''
        lines.push(`   ${term}${tag}  ${signalValue(s)}`)
      }
      lines.push('')
      continue
    }

    // Group by campaign
    const byCampaign = new Map<string, PerformanceSignal[]>()
    for (const s of typeSignals) {
      const camp = campaignOf(s.resource)
      const group = byCampaign.get(camp) ?? []
      group.push(s)
      byCampaign.set(camp, group)
    }

    for (const [camp, campSignals] of byCampaign) {
      const provider = providerOf.get(camp) ?? ''
      const tag = provider ? ` (${provider})` : ''
      const spend = campaignSpend.get(camp)
      const spendStr = spend !== undefined ? `  $${spend.toFixed(2)} total` : ''

      // If all signals are campaign-level (no children), show inline
      const allCampaignLevel = campSignals.every(s => campaignOf(s.resource) === s.resource)
      if (allCampaignLevel) {
        for (const s of campSignals) {
          lines.push(`   ${camp}${tag}  ${signalValue(s)}`)
        }
      } else {
        // Show campaign header, then children indented
        lines.push(`   ${camp}${tag}${spendStr}`)
        for (const s of campSignals) {
          const child = childPath(s.resource)
          if (!child) {
            // Campaign-level signal
            lines.push(`     campaign total  ${signalValue(s)}`)
          } else {
            const kind = kindLabel(child)
            const label = displayName(child)
            lines.push(`     ${kind} ${label}  ${signalValue(s)}`)
          }
        }
      }
    }
    lines.push('')
  }

  return lines
}

export function formatReport(report: PerformanceReport, periodLabel: string): string {
  const lines: string[] = []
  const bar = '\u2500'.repeat(65)

  lines.push(`Performance \u2014 last ${periodLabel}`)
  lines.push('\u2550'.repeat(65))

  // ── Campaign tables grouped by provider ──────────────────────────
  const campaigns = report.data.filter(d => d.kind === 'campaign')
  const byProvider = new Map<string, typeof campaigns>()
  for (const c of campaigns) {
    const group = byProvider.get(c.provider) ?? []
    group.push(c)
    byProvider.set(c.provider, group)
  }

  for (const [provider, providerCampaigns] of byProvider) {
    const label = provider === 'google' ? 'Google Ads' : provider === 'meta' ? 'Meta Ads' : provider
    lines.push('')
    lines.push(` ${label}`)
    lines.push(` ${bar}`)
    lines.push(` ${'Campaign'.padEnd(40)} ${'Spend'.padStart(10)} ${'Conv'.padStart(6)} ${'CPA'.padStart(8)} ${'CTR'.padStart(7)}`)

    // Sort by spend descending
    const sorted = [...providerCampaigns].sort((a, b) => b.metrics.cost - a.metrics.cost)
    for (const c of sorted) {
      lines.push(campaignRow(c.resource, c.metrics.cost, c.metrics.conversions, c.metrics.cpa, c.metrics.ctr))
    }
  }

  // Build resource → provider lookup from all data entries
  const providerOf = new Map<string, string>()
  for (const d of report.data) {
    providerOf.set(d.resource, d.provider)
  }

  // ── Signals grouped by type, then by campaign ──────────────────
  if (report.signals.length > 0) {
    const campaignSpend = new Map<string, number>()
    for (const c of campaigns) {
      campaignSpend.set(c.resource, c.metrics.cost)
    }

    lines.push('')
    lines.push(` Signals (${report.signals.length})`)
    lines.push(` ${bar}`)
    lines.push(...formatSignalsHierarchical(report.signals, providerOf, campaignSpend))
  }

  // ── Recommendations ──────────────────────────────────────────────
  if (report.recommendations.length > 0) {
    lines.push(` Recommendations`)
    lines.push(` ${bar}`)
    for (const r of report.recommendations) {
      const name = displayName(r.resource)
      const provider = providerOf.get(r.resource) ?? providerOf.get(r.resource.split('/')[0] ?? '') ?? ''
      const tag = provider ? ` (${provider})` : ''
      const source = r.source === 'ai' ? ' [ai]' : ''
      lines.push(` \u2717 ${r.type}: ${name}${tag} \u2014 ${r.reason}${source}`)
    }
    lines.push('')
  }

  // ── Summary ──────────────────────────────────────────────────────
  const s = report.summary
  lines.push(` ${bar}`)
  lines.push(
    ` ${campaigns.length} campaigns \u00b7 $${s.totalSpend.toFixed(2)} \u00b7 ` +
    `${s.totalConversions} conv \u00b7 ` +
    `CPA ${s.overallCPA !== null ? `$${s.overallCPA.toFixed(2)}` : '\u2014'} \u00b7 ` +
    `ROAS ${s.overallROAS !== null ? `${s.overallROAS.toFixed(2)}x` : '\u2014'}`,
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
