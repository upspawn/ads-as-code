import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { applyChangeset, changeToMutations } from '../../src/google/apply.ts'
import { Cache } from '../../src/core/cache.ts'
import type { Change, Changeset, Resource } from '../../src/core/types.ts'
import type { GoogleAdsClient, MutateOperation, MutateResult } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

function makeResource(kind: Resource['kind'], path: string, props: Record<string, unknown>, platformId?: string): Resource {
  return platformId ? { kind, path, properties: props, platformId } : { kind, path, properties: props }
}

function createMockClient(mutateResponses?: MutateResult[][]): GoogleAdsClient & { mutateCalls: MutateOperation[][] } {
  const mutateCalls: MutateOperation[][] = []
  let callIndex = 0

  return {
    query: mock(() => Promise.resolve([])),
    mutate: mock((ops: MutateOperation[]): Promise<MutateResult[]> => {
      mutateCalls.push(ops)
      const response = mutateResponses?.[callIndex] ?? [{ resourceName: '' }]
      callIndex++
      return Promise.resolve(response)
    }),
    customerId: '7300967494',
    mutateCalls,
  }
}

function emptyChangeset(): Changeset {
  return { creates: [], updates: [], deletes: [], drift: [] }
}

// ─── changeToMutations ──────────────────────────────────────

describe('changeToMutations', () => {
  test('campaign create produces budget + campaign operations', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'search-pdf-renaming', {
        name: 'Search - PDF Renaming',
        status: 'enabled',
        budget: { amount: 20, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    // At least 2 ops: budget + campaign
    expect(mutations.length).toBeGreaterThanOrEqual(2)

    // First op should be budget
    const budgetOp = mutations[0]!
    expect(budgetOp.operation).toBe('campaignBudgetOperation')

    // Budget should have explicitly_shared: false
    const budgetResource = budgetOp.resource as Record<string, unknown>
    const budgetCreate = budgetResource.create as Record<string, unknown>
    expect(budgetCreate.explicitlyShared).toBe(false)

    // Budget should be in micros
    expect(budgetCreate.amountMicros).toBe('20000000')

    // Second op should be campaign
    const campaignOp = mutations[1]!
    expect(campaignOp.operation).toBe('campaignOperation')
  })

  test('monthly budget converts via /30.4', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'monthly-campaign', {
        name: 'Monthly Campaign',
        status: 'enabled',
        budget: { amount: 304, currency: 'EUR', period: 'monthly' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const budgetOp = mutations[0]!
    const budgetResource = budgetOp.resource as Record<string, unknown>
    const budgetCreate = budgetResource.create as Record<string, unknown>

    // 304 / 30.4 = 10, in micros = 10000000
    expect(budgetCreate.amountMicros).toBe('10000000')
  })

  test('language targeting maps to criterion IDs', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'intl-campaign', {
        name: 'International Campaign',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'language', languages: ['en', 'de'] },
          ],
        },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    // Should include language criterion operations
    const langOps = mutations.filter(m =>
      m.operation === 'campaignCriterionOperation' &&
      JSON.stringify(m.resource).includes('languageConstants'),
    )

    expect(langOps.length).toBe(2)

    // English = 1000, German = 1001
    const langResources = langOps.map(op => JSON.stringify(op.resource))
    expect(langResources.some(r => r.includes('languageConstants/1000'))).toBe(true)
    expect(langResources.some(r => r.includes('languageConstants/1001'))).toBe(true)
  })

  test('geo targeting maps to geo target IDs', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'us-de-campaign', {
        name: 'US+DE Campaign',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US', 'DE'] },
          ],
        },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    const geoOps = mutations.filter(m =>
      m.operation === 'campaignCriterionOperation' &&
      JSON.stringify(m.resource).includes('geoTargetConstants'),
    )

    expect(geoOps.length).toBe(2)

    const geoResources = geoOps.map(op => JSON.stringify(op.resource))
    expect(geoResources.some(r => r.includes('geoTargetConstants/2840'))).toBe(true) // US
    expect(geoResources.some(r => r.includes('geoTargetConstants/2276'))).toBe(true) // DE
  })

  test('keyword create uses parent ad group from resource map', () => {
    const resourceMap = new Map([['search-pdf/pdf-core', '111111']])
    const change: Change = {
      op: 'create',
      resource: makeResource('keyword', 'search-pdf/pdf-core/kw:rename pdf:EXACT', {
        text: 'rename pdf',
        matchType: 'EXACT',
      }),
    }

    const mutations = changeToMutations(change, '7300967494', resourceMap)

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('adGroupCriterionOperation')

    const create = (op.resource as Record<string, unknown>).create as Record<string, unknown>
    expect(create.adGroup).toBe('customers/7300967494/adGroups/111111')
  })

  test('ad create includes RSA headlines and descriptions', () => {
    const resourceMap = new Map([['search-pdf/pdf-core', '111111']])
    const change: Change = {
      op: 'create',
      resource: makeResource('ad', 'search-pdf/pdf-core/rsa:abc123', {
        headlines: ['Rename PDFs Fast', 'AI Tool'],
        descriptions: ['Rename with AI.'],
        finalUrl: 'https://renamed.to',
      }),
    }

    const mutations = changeToMutations(change, '7300967494', resourceMap)

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('adGroupAdOperation')

    const create = (op.resource as Record<string, unknown>).create as Record<string, unknown>
    const ad = create.ad as Record<string, unknown>
    const rsa = ad.responsiveSearchAd as Record<string, unknown>

    // Headlines are asset objects
    const headlines = rsa.headlines as Array<{ text: string }>
    expect(headlines).toHaveLength(2)
    expect(headlines[0]!.text).toBe('Rename PDFs Fast')

    // Final URL in array
    expect(ad.finalUrls).toEqual(['https://renamed.to'])
  })

  test('campaign delete uses remove operation (not status=REMOVED)', () => {
    const change: Change = {
      op: 'delete',
      resource: makeResource('campaign', 'old-campaign', {}, '999'),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('campaignOperation')

    // Should use 'remove' path, not status update
    const resource = op.resource as Record<string, unknown>
    expect(resource.remove).toBe('customers/7300967494/campaigns/999')
    expect(resource.update).toBeUndefined()
  })

  test('negative keyword create goes on campaign level', () => {
    const resourceMap = new Map([['search-pdf', '123456']])
    const change: Change = {
      op: 'create',
      resource: makeResource('negative', 'search-pdf/neg:free:BROAD', {
        text: 'free',
        matchType: 'BROAD',
      }),
    }

    const mutations = changeToMutations(change, '7300967494', resourceMap)

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('campaignCriterionOperation')

    const create = (op.resource as Record<string, unknown>).create as Record<string, unknown>
    expect(create.campaign).toBe('customers/7300967494/campaigns/123456')
    expect(create.negative).toBe(true)
  })
})

// ─── Dependency Ordering ────────────────────────────────────

describe('dependency ordering', () => {
  test('creates are sorted: campaign → adGroup → keyword → ad', async () => {
    const client = createMockClient([
      [{ resourceName: 'customers/7300967494/campaigns/100' }],
      [{ resourceName: 'customers/7300967494/adGroups/200' }],
      [{ resourceName: 'customers/7300967494/adGroupCriteria/300' }],
      [{ resourceName: 'customers/7300967494/adGroupAds/400' }],
    ])

    const cache = new Cache(':memory:')

    const changeset: Changeset = {
      creates: [
        { op: 'create', resource: makeResource('ad', 'camp/grp/rsa:x', { headlines: ['H'], descriptions: ['D'], finalUrl: 'https://x.com' }) },
        { op: 'create', resource: makeResource('keyword', 'camp/grp/kw:test:EXACT', { text: 'test', matchType: 'EXACT' }) },
        { op: 'create', resource: makeResource('campaign', 'camp', { name: 'Camp', status: 'enabled', budget: { amount: 10, period: 'daily' }, bidding: { type: 'maximize-conversions' }, targeting: { rules: [] } }) },
        { op: 'create', resource: makeResource('adGroup', 'camp/grp', { status: 'enabled' }) },
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    await applyChangeset(client, changeset, cache, 'test-project')

    // Verify order: campaign first, then ad group, then keyword, then ad
    expect(client.mutateCalls.length).toBe(4)

    // First call: campaign (has budget + campaign ops)
    const firstCall = client.mutateCalls[0]!
    expect(firstCall.some(op => op.operation === 'campaignBudgetOperation')).toBe(true)

    // Second call: ad group
    const secondCall = client.mutateCalls[1]!
    expect(secondCall.some(op => op.operation === 'adGroupOperation')).toBe(true)

    // Third call: keyword
    const thirdCall = client.mutateCalls[2]!
    expect(thirdCall.some(op => op.operation === 'adGroupCriterionOperation')).toBe(true)

    // Fourth call: ad
    const fourthCall = client.mutateCalls[3]!
    expect(fourthCall.some(op => op.operation === 'adGroupAdOperation')).toBe(true)

    cache.close()
  })

  test('deletes are sorted in reverse: ad → keyword → adGroup → campaign', async () => {
    const client = createMockClient([
      [{ resourceName: '' }],
      [{ resourceName: '' }],
      [{ resourceName: '' }],
      [{ resourceName: '' }],
    ])

    const cache = new Cache(':memory:')

    const changeset: Changeset = {
      creates: [],
      updates: [],
      deletes: [
        { op: 'delete', resource: makeResource('campaign', 'camp', {}, '100') },
        { op: 'delete', resource: makeResource('adGroup', 'camp/grp', {}, '200') },
        { op: 'delete', resource: makeResource('keyword', 'camp/grp/kw:test:EXACT', {}, '300') },
        { op: 'delete', resource: makeResource('ad', 'camp/grp/rsa:x', {}, '400') },
      ],
      drift: [],
    }

    // Set resources in cache so removeResource works
    for (const del of changeset.deletes) {
      cache.setResource({
        project: 'test-project',
        path: del.resource.path,
        platformId: del.resource.platformId,
        kind: del.resource.kind,
        managedBy: 'code',
      })
    }

    await applyChangeset(client, changeset, cache, 'test-project')

    // Verify reverse order: ad, keyword, adGroup, campaign
    expect(client.mutateCalls.length).toBe(4)

    const ops = client.mutateCalls.map(calls => calls[0]!.operation)
    expect(ops[0]).toBe('adGroupAdOperation')      // ad first
    expect(ops[1]).toBe('adGroupCriterionOperation') // keyword
    expect(ops[2]).toBe('adGroupOperation')          // adGroup
    expect(ops[3]).toBe('campaignOperation')          // campaign last
  })
})

// ─── Partial Failure ────────────────────────────────────────

describe('partial failure', () => {
  test('stops on first error and records succeeded ops in cache', async () => {
    let callIndex = 0
    const client: GoogleAdsClient & { mutateCalls: MutateOperation[][] } = {
      query: mock(() => Promise.resolve([])),
      mutate: mock((ops: MutateOperation[]): Promise<MutateResult[]> => {
        client.mutateCalls.push(ops)
        callIndex++
        if (callIndex === 2) {
          throw new Error('API quota exceeded')
        }
        return Promise.resolve([{ resourceName: `customers/7300967494/campaigns/${callIndex}00` }])
      }),
      customerId: '7300967494',
      mutateCalls: [],
    }

    const cache = new Cache(':memory:')

    const changeset: Changeset = {
      creates: [
        { op: 'create', resource: makeResource('campaign', 'camp-a', { name: 'A', status: 'enabled', budget: { amount: 10, period: 'daily' }, bidding: { type: 'maximize-conversions' }, targeting: { rules: [] } }) },
        { op: 'create', resource: makeResource('campaign', 'camp-b', { name: 'B', status: 'enabled', budget: { amount: 10, period: 'daily' }, bidding: { type: 'maximize-conversions' }, targeting: { rules: [] } }) },
        { op: 'create', resource: makeResource('campaign', 'camp-c', { name: 'C', status: 'enabled', budget: { amount: 10, period: 'daily' }, bidding: { type: 'maximize-conversions' }, targeting: { rules: [] } }) },
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    const result = await applyChangeset(client, changeset, cache, 'test-project')

    // First campaign succeeded
    expect(result.succeeded).toHaveLength(1)
    expect(result.succeeded[0]!.resource.path).toBe('camp-a')

    // Second campaign failed
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.change.resource.path).toBe('camp-b')
    expect(result.failed[0]!.error.message).toBe('API quota exceeded')

    // Third campaign skipped
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]!.resource.path).toBe('camp-c')

    // First campaign should be in cache
    const cached = cache.getResourceMap('test-project')
    expect(cached).toHaveLength(1)
    expect(cached[0]!.path).toBe('camp-a')

    cache.close()
  })

  test('succeeded creates are saved to cache with platformId', async () => {
    const client = createMockClient([
      [{ resourceName: 'customers/7300967494/campaigns/999' }],
    ])

    const cache = new Cache(':memory:')

    const changeset: Changeset = {
      creates: [
        { op: 'create', resource: makeResource('campaign', 'new-camp', { name: 'New', status: 'enabled', budget: { amount: 5, period: 'daily' }, bidding: { type: 'maximize-conversions' }, targeting: { rules: [] } }) },
      ],
      updates: [],
      deletes: [],
      drift: [],
    }

    const result = await applyChangeset(client, changeset, cache, 'test-project')

    expect(result.succeeded).toHaveLength(1)

    const cached = cache.getResourceMap('test-project')
    expect(cached).toHaveLength(1)
    expect(cached[0]!.path).toBe('new-camp')
    expect(cached[0]!.platformId).toBe('999')
    expect(cached[0]!.kind).toBe('campaign')
    expect(cached[0]!.managedBy).toBe('code')

    cache.close()
  })

  test('succeeded deletes are removed from cache', async () => {
    const client = createMockClient([
      [{ resourceName: '' }],
    ])

    const cache = new Cache(':memory:')
    cache.setResource({
      project: 'test-project',
      path: 'old-camp',
      platformId: '888',
      kind: 'campaign',
      managedBy: 'code',
    })

    const changeset: Changeset = {
      creates: [],
      updates: [],
      deletes: [
        { op: 'delete', resource: makeResource('campaign', 'old-camp', {}, '888') },
      ],
      drift: [],
    }

    const result = await applyChangeset(client, changeset, cache, 'test-project')

    expect(result.succeeded).toHaveLength(1)

    const cached = cache.getResourceMap('test-project')
    expect(cached).toHaveLength(0)

    cache.close()
  })
})

// ─── Amount Micros ──────────────────────────────────────────

describe('amount micros', () => {
  test('amounts are converted to micros in budget operations', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'test', {
        name: 'Test',
        status: 'enabled',
        budget: { amount: 8.50, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const budgetOp = mutations[0]!
    const create = (budgetOp.resource as Record<string, unknown>).create as Record<string, unknown>

    expect(create.amountMicros).toBe('8500000')
  })

  test('maximize-clicks maxCpc is converted to micros', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'test', {
        name: 'Test',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-clicks', maxCpc: 1.50 },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const create = (campaignOp.resource as Record<string, unknown>).create as Record<string, unknown>

    const targetSpend = create.targetSpend as Record<string, unknown>
    expect(targetSpend.cpcBidCeilingMicros).toBe('1500000')
  })
})
