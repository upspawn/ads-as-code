import type { Resource } from '../core/types.ts'

// ─── Helpers ────────────────────────────────────────────────

function quote(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`
}

function matchTypeHelper(matchType: string): string {
  switch (matchType) {
    case 'EXACT': return 'exact'
    case 'PHRASE': return 'phrase'
    case 'BROAD': return 'broad'
    default: return 'exact'
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

// ─── Shared Negative List Codegen ───────────────────────────

/**
 * Generate TypeScript source for a shared negative keyword list.
 *
 * Input: Resource[] containing 1 sharedSet + N sharedCriterion resources.
 * Output: TypeScript source importing sharedNegatives + keyword helpers.
 */
export function generateSharedNegativeListFile(resources: Resource[], listName: string): string {
  const today = new Date().toISOString().split('T')[0]
  const criteria = resources.filter(r => r.kind === 'sharedCriterion')

  // Track needed imports
  const imports = new Set<string>(['sharedNegatives'])

  // Group criteria by match type for readable output
  const byMatchType = groupBy(criteria, r => r.properties.matchType as string)

  // Build keyword array parts
  const keywordParts: string[] = []
  for (const [matchType, keywords] of Object.entries(byMatchType)) {
    const helper = matchTypeHelper(matchType)
    imports.add(helper)
    const texts = keywords.map(k => k.properties.text as string)
    keywordParts.push(`...${helper}(${texts.map(quote).join(', ')})`)
  }

  const importList = Array.from(imports).sort()
  const lines: string[] = [
    `// Imported from Google Ads on ${today}`,
    `import { ${importList.join(', ')} } from '@upspawn/ads'`,
    '',
    `export default sharedNegatives(${quote(listName)}, [`,
    `  ${keywordParts.join(', ')},`,
    `])`,
    '',
  ]

  return lines.join('\n')
}

// ─── Conversion Action Codegen ──────────────────────────────

/**
 * Generate TypeScript source for a conversion action.
 *
 * Input: Resource[] containing 1 conversionAction resource.
 * Output: TypeScript source importing conversionAction helper.
 */
export function generateConversionActionFile(resources: Resource[], actionName: string): string {
  const today = new Date().toISOString().split('T')[0]
  const action = resources.find(r => r.kind === 'conversionAction')
  if (!action) throw new Error(`No conversionAction resource found for "${actionName}"`)

  const props = action.properties
  const configParts: string[] = []

  configParts.push(`type: ${quote(props.type as string)},`)
  configParts.push(`category: ${quote(props.category as string)},`)
  configParts.push(`counting: ${quote(props.counting as string)},`)

  const value = props.value as Record<string, unknown> | undefined
  if (value) {
    const valueParts: string[] = []
    if (value.default !== undefined) valueParts.push(`default: ${value.default}`)
    if (value.currency) valueParts.push(`currency: ${quote(value.currency as string)}`)
    if (value.useDynamic) valueParts.push(`useDynamic: true`)
    if (valueParts.length > 0) {
      configParts.push(`value: { ${valueParts.join(', ')} },`)
    }
  }

  if (props.attribution) configParts.push(`attribution: ${quote(props.attribution as string)},`)
  if (props.lookbackDays !== undefined) configParts.push(`lookbackDays: ${props.lookbackDays},`)
  if (props.primary !== undefined) configParts.push(`primary: ${props.primary},`)

  return [
    `// Imported from Google Ads on ${today}`,
    `import { conversionAction } from '@upspawn/ads'`,
    '',
    `export default conversionAction(${quote(actionName)}, {`,
    ...configParts.map(p => `  ${p}`),
    `})`,
    '',
  ].join('\n')
}

// ─── Shared Budget Codegen ──────────────────────────────────

/**
 * Generate TypeScript source for a shared budget.
 *
 * Input: Resource[] containing 1 sharedBudget resource.
 * Output: TypeScript source importing sharedBudget + daily helpers.
 */
export function generateSharedBudgetFile(resources: Resource[], budgetName: string): string {
  const today = new Date().toISOString().split('T')[0]
  const budget = resources.find(r => r.kind === 'sharedBudget')
  if (!budget) throw new Error(`No sharedBudget resource found for "${budgetName}"`)

  const props = budget.properties
  const amount = props.amount as number
  const currency = props.currency as string

  const imports = ['daily', 'sharedBudget']
  const budgetArg = currency === 'EUR'
    ? `daily(${amount})`
    : `daily(${amount}, ${quote(currency)})`

  return [
    `// Imported from Google Ads on ${today}`,
    `import { ${imports.join(', ')} } from '@upspawn/ads'`,
    '',
    `export default sharedBudget(${quote(budgetName)}, ${budgetArg})`,
    '',
  ].join('\n')
}
