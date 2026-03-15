import { describe, expect, test } from 'bun:test'
import type { Resource } from '../../src/core/types.ts'
import type { SharedBudgetConfig } from '../../src/google/shared-types.ts'

// ─── Lazy imports ───────────────────────────────────────────

let sharedBudget: typeof import('../../src/google/shared-types.ts').sharedBudget
let daily: typeof import('../../src/helpers/budget.ts').daily
let flattenSharedBudget: typeof import('../../src/google/flatten-shared.ts').flattenSharedBudget
let generateSharedBudgetFile: typeof import('../../src/google/codegen-shared.ts').generateSharedBudgetFile
let buildSharedBudgetOperations: typeof import('../../src/google/apply-shared.ts').buildSharedBudgetOperations

const load = async () => {
  const types = await import('../../src/google/shared-types.ts')
  sharedBudget = types.sharedBudget

  const budgetHelpers = await import('../../src/helpers/budget.ts')
  daily = budgetHelpers.daily

  const flatten = await import('../../src/google/flatten-shared.ts')
  flattenSharedBudget = flatten.flattenSharedBudget

  const codegen = await import('../../src/google/codegen-shared.ts')
  generateSharedBudgetFile = codegen.generateSharedBudgetFile

  const apply = await import('../../src/google/apply-shared.ts')
  buildSharedBudgetOperations = apply.buildSharedBudgetOperations
}

// ─── sharedBudget() factory ─────────────────────────────────

describe('sharedBudget()', () => {
  test('creates a SharedBudgetConfig with correct shape', async () => {
    await load()
    const budget = sharedBudget('Search Pool', daily(30))

    expect(budget.provider).toBe('google')
    expect(budget.kind).toBe('shared-budget')
    expect(budget.name).toBe('Search Pool')
    expect(budget.amount).toBe(30)
    expect(budget.currency).toBe('EUR')
    expect(budget.period).toBe('daily')
  })

  test('accepts USD currency', async () => {
    await load()
    const budget = sharedBudget('US Budget', daily(50, 'USD'))

    expect(budget.currency).toBe('USD')
    expect(budget.amount).toBe(50)
  })
})

// ─── flattenSharedBudget() ──────────────────────────────────

describe('flattenSharedBudget()', () => {
  test('produces a single sharedBudget resource', async () => {
    await load()
    const budget = sharedBudget('Search Pool', daily(30))
    const resources = flattenSharedBudget(budget)

    expect(resources).toHaveLength(1)
    expect(resources[0]!.kind).toBe('sharedBudget')
    expect(resources[0]!.path).toBe('budget:search-pool')
    expect(resources[0]!.properties.name).toBe('Search Pool')
    expect(resources[0]!.properties.amount).toBe(30)
    expect(resources[0]!.properties.currency).toBe('EUR')
    expect(resources[0]!.properties.period).toBe('daily')
  })
})

// ─── buildSharedBudgetOperations() ──────────────────────────

describe('buildSharedBudgetOperations()', () => {
  test('produces a campaign_budget create with explicitly_shared=true', async () => {
    await load()
    const budget = sharedBudget('Search Pool', daily(30))
    const ops = buildSharedBudgetOperations('7300967494', budget)

    expect(ops).toHaveLength(1)
    expect(ops[0]!.operation).toBe('campaign_budget')
    expect(ops[0]!.op).toBe('create')
    expect(ops[0]!.resource.explicitly_shared).toBe(true)
    expect(ops[0]!.resource.name).toBe('Search Pool')
  })

  test('converts amount to micros', async () => {
    await load()
    const budget = sharedBudget('Test', daily(25))
    const ops = buildSharedBudgetOperations('7300967494', budget)

    // 25 * 1,000,000 = 25,000,000
    expect(ops[0]!.resource.amount_micros).toBe('25000000')
  })

  test('sets delivery_method to STANDARD', async () => {
    await load()
    const budget = sharedBudget('Test', daily(10))
    const ops = buildSharedBudgetOperations('7300967494', budget)

    expect(ops[0]!.resource.delivery_method).toBe(2) // STANDARD
  })
})

// ─── codegen ─────────────────────────────────────────────

describe('generateSharedBudgetFile()', () => {
  test('generates valid TypeScript with sharedBudget() and daily() calls', async () => {
    await load()
    const resources: Resource[] = [
      {
        kind: 'sharedBudget' as any,
        path: 'budget:search-pool',
        properties: { name: 'Search Pool', amount: 30, currency: 'EUR', period: 'daily' },
      },
    ]

    const code = generateSharedBudgetFile(resources, 'Search Pool')

    expect(code).toContain("import { daily, sharedBudget } from '@upspawn/ads'")
    expect(code).toContain("sharedBudget('Search Pool', daily(30))")
    expect(code).toContain('export default')
  })

  test('includes currency for non-EUR', async () => {
    await load()
    const resources: Resource[] = [
      {
        kind: 'sharedBudget' as any,
        path: 'budget:us-budget',
        properties: { name: 'US Budget', amount: 50, currency: 'USD', period: 'daily' },
      },
    ]

    const code = generateSharedBudgetFile(resources, 'US Budget')

    expect(code).toContain("daily(50, 'USD')")
  })
})
