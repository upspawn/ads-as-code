import { describe, expect, test } from 'bun:test'
import type { Keyword, Budget, Resource } from '../../src/core/types.ts'
import type { SharedNegativeList } from '../../src/google/shared-types.ts'

// ─── Lazy imports (loaded in tests) ─────────────────────────

let sharedNegatives: typeof import('../../src/google/shared-types.ts').sharedNegatives
let flattenSharedNegativeList: typeof import('../../src/google/flatten-shared.ts').flattenSharedNegativeList
let generateSharedNegativeListFile: typeof import('../../src/google/codegen-shared.ts').generateSharedNegativeListFile
let buildSharedSetOperations: typeof import('../../src/google/apply-shared.ts').buildSharedSetOperations

// Load modules at test time to allow implementation to be built incrementally
const load = async () => {
  const types = await import('../../src/google/shared-types.ts')
  sharedNegatives = types.sharedNegatives

  const flatten = await import('../../src/google/flatten-shared.ts')
  flattenSharedNegativeList = flatten.flattenSharedNegativeList

  const codegen = await import('../../src/google/codegen-shared.ts')
  generateSharedNegativeListFile = codegen.generateSharedNegativeListFile

  const apply = await import('../../src/google/apply-shared.ts')
  buildSharedSetOperations = apply.buildSharedSetOperations
}

// ─── sharedNegatives() factory ────────────────────────────

describe('sharedNegatives()', () => {
  test('creates a SharedNegativeList with correct shape', async () => {
    await load()
    const keywords: Keyword[] = [
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'EXACT' },
    ]
    const list = sharedNegatives('Brand Exclusions', keywords)

    expect(list.provider).toBe('google')
    expect(list.kind).toBe('shared-negative-list')
    expect(list.name).toBe('Brand Exclusions')
    expect(list.keywords).toEqual(keywords)
  })

  test('preserves keyword match types', async () => {
    await load()
    const keywords: Keyword[] = [
      { text: 'open source', matchType: 'PHRASE' },
      { text: 'download', matchType: 'BROAD' },
    ]
    const list = sharedNegatives('Competitors', keywords)

    expect(list.keywords[0]!.matchType).toBe('PHRASE')
    expect(list.keywords[1]!.matchType).toBe('BROAD')
  })
})

// ─── flattenSharedNegativeList() ─────────────────────────

describe('flattenSharedNegativeList()', () => {
  test('produces sharedSet resource for the list itself', async () => {
    await load()
    const list = sharedNegatives('Brand Exclusions', [
      { text: 'free', matchType: 'BROAD' },
    ])
    const resources = flattenSharedNegativeList(list)

    const sharedSet = resources.find(r => r.kind === 'sharedSet')
    expect(sharedSet).toBeDefined()
    expect(sharedSet!.path).toBe('shared:brand-exclusions')
    expect(sharedSet!.properties.name).toBe('Brand Exclusions')
    expect(sharedSet!.properties.type).toBe('NEGATIVE_KEYWORDS')
  })

  test('produces sharedCriterion resources for each keyword', async () => {
    await load()
    const list = sharedNegatives('Brand Exclusions', [
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'EXACT' },
      { text: 'open source', matchType: 'PHRASE' },
    ])
    const resources = flattenSharedNegativeList(list)

    const criteria = resources.filter(r => r.kind === 'sharedCriterion')
    expect(criteria).toHaveLength(3)

    // Paths are nested under the shared set
    expect(criteria[0]!.path).toContain('shared:brand-exclusions/')
    expect(criteria[0]!.properties.text).toBe('free')
    expect(criteria[0]!.properties.matchType).toBe('BROAD')
  })

  test('total resource count = 1 sharedSet + N sharedCriteria', async () => {
    await load()
    const list = sharedNegatives('Test List', [
      { text: 'a', matchType: 'BROAD' },
      { text: 'b', matchType: 'EXACT' },
    ])
    const resources = flattenSharedNegativeList(list)

    expect(resources).toHaveLength(3) // 1 set + 2 criteria
  })

  test('criterion paths include keyword text and match type', async () => {
    await load()
    const list = sharedNegatives('Test', [
      { text: 'free trial', matchType: 'PHRASE' },
    ])
    const resources = flattenSharedNegativeList(list)
    const criterion = resources.find(r => r.kind === 'sharedCriterion')!

    expect(criterion.path).toBe('shared:test/neg:free trial:PHRASE')
  })
})

// ─── buildSharedSetOperations() ──────────────────────────

describe('buildSharedSetOperations()', () => {
  test('produces create operation for the shared set', async () => {
    await load()
    const list = sharedNegatives('Brand Exclusions', [
      { text: 'free', matchType: 'BROAD' },
    ])
    const ops = buildSharedSetOperations('7300967494', list)

    const setOp = ops.find(op => op.operation === 'shared_set')
    expect(setOp).toBeDefined()
    expect(setOp!.op).toBe('create')
    expect(setOp!.resource.name).toBe('Brand Exclusions')
    expect(setOp!.resource.type).toBe(3) // NEGATIVE_KEYWORDS
  })

  test('produces shared criterion operations for each keyword', async () => {
    await load()
    const list = sharedNegatives('Exclusions', [
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'EXACT' },
    ])
    const ops = buildSharedSetOperations('7300967494', list)

    const criterionOps = ops.filter(op => op.operation === 'shared_criterion')
    expect(criterionOps).toHaveLength(2)
    expect(criterionOps[0]!.resource.keyword.text).toBe('free')
    expect(criterionOps[0]!.resource.keyword.match_type).toBe(4) // BROAD
    expect(criterionOps[1]!.resource.keyword.text).toBe('cheap')
    expect(criterionOps[1]!.resource.keyword.match_type).toBe(2) // EXACT
  })

  test('links shared set to campaigns', async () => {
    await load()
    const list = sharedNegatives('Exclusions', [
      { text: 'free', matchType: 'BROAD' },
    ])
    const campaignResourceNames = [
      'customers/7300967494/campaigns/123',
      'customers/7300967494/campaigns/456',
    ]
    const ops = buildSharedSetOperations('7300967494', list, campaignResourceNames)

    const linkOps = ops.filter(op => op.operation === 'campaign_shared_set')
    expect(linkOps).toHaveLength(2)
    expect(linkOps[0]!.resource.campaign).toBe('customers/7300967494/campaigns/123')
    expect(linkOps[1]!.resource.campaign).toBe('customers/7300967494/campaigns/456')
  })
})

// ─── codegen ─────────────────────────────────────────────

describe('generateSharedNegativeListFile()', () => {
  test('generates valid TypeScript with sharedNegatives() call', async () => {
    await load()
    const resources: Resource[] = [
      {
        kind: 'sharedSet' as any,
        path: 'shared:brand-exclusions',
        properties: { name: 'Brand Exclusions', type: 'NEGATIVE_KEYWORDS' },
      },
      {
        kind: 'sharedCriterion' as any,
        path: 'shared:brand-exclusions/neg:free:BROAD',
        properties: { text: 'free', matchType: 'BROAD' },
      },
      {
        kind: 'sharedCriterion' as any,
        path: 'shared:brand-exclusions/neg:cheap:EXACT',
        properties: { text: 'cheap', matchType: 'EXACT' },
      },
    ]

    const code = generateSharedNegativeListFile(resources, 'Brand Exclusions')

    expect(code).toContain("import {")
    expect(code).toContain("sharedNegatives")
    expect(code).toContain("from '@upspawn/ads'")
    expect(code).toContain("'Brand Exclusions'")
    expect(code).toContain("'free'")
    expect(code).toContain("'cheap'")
    expect(code).toContain('export default')
  })

  test('groups keywords by match type using helpers', async () => {
    await load()
    const resources: Resource[] = [
      {
        kind: 'sharedSet' as any,
        path: 'shared:test',
        properties: { name: 'Test', type: 'NEGATIVE_KEYWORDS' },
      },
      {
        kind: 'sharedCriterion' as any,
        path: 'shared:test/neg:free:BROAD',
        properties: { text: 'free', matchType: 'BROAD' },
      },
      {
        kind: 'sharedCriterion' as any,
        path: 'shared:test/neg:cheap:BROAD',
        properties: { text: 'cheap', matchType: 'BROAD' },
      },
    ]

    const code = generateSharedNegativeListFile(resources, 'Test')

    // Should use broad() helper since both are BROAD
    expect(code).toContain('broad')
  })
})
