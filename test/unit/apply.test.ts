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
  test('campaign create produces budget + campaign operations with snake_case', () => {
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

    // First op should be budget with snake_case entity
    const budgetOp = mutations[0]!
    expect(budgetOp.operation).toBe('campaign_budget')
    expect(budgetOp.op).toBe('create')

    // Budget should have explicitly_shared: false (snake_case)
    const budgetResource = budgetOp.resource as Record<string, unknown>
    expect(budgetResource.explicitly_shared).toBe(false)

    // Budget should be in micros (snake_case)
    expect(budgetResource.amount_micros).toBe('20000000')

    // Second op should be campaign with snake_case entity
    const campaignOp = mutations[1]!
    expect(campaignOp.operation).toBe('campaign')
    expect(campaignOp.op).toBe('create')
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

    // 304 / 30.4 = 10, in micros = 10000000
    expect(budgetResource.amount_micros).toBe('10000000')
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

    // Should include language criterion operations with snake_case entity
    const langOps = mutations.filter(m =>
      m.operation === 'campaign_criterion' &&
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
      m.operation === 'campaign_criterion' &&
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
    expect(op.operation).toBe('ad_group_criterion')
    expect(op.op).toBe('create')

    const create = op.resource as Record<string, unknown>
    expect(create.ad_group).toBe('customers/7300967494/adGroups/111111')
  })

  test('ad create includes RSA headlines and descriptions with snake_case', () => {
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
    expect(op.operation).toBe('ad_group_ad')
    expect(op.op).toBe('create')

    const create = op.resource as Record<string, unknown>
    const ad = create.ad as Record<string, unknown>
    const rsa = ad.responsive_search_ad as Record<string, unknown>

    // Headlines are asset objects
    const headlines = rsa.headlines as Array<{ text: string }>
    expect(headlines).toHaveLength(2)
    expect(headlines[0]!.text).toBe('Rename PDFs Fast')

    // Final URL in array (snake_case)
    expect(ad.final_urls).toEqual(['https://renamed.to'])
  })

  test('campaign delete uses remove operation with snake_case entity', () => {
    const change: Change = {
      op: 'delete',
      resource: makeResource('campaign', 'old-campaign', {}, '999'),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('campaign')
    expect(op.op).toBe('remove')

    // Should use resource_name for remove
    const resource = op.resource as Record<string, unknown>
    expect(resource.resource_name).toBe('customers/7300967494/campaigns/999')
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
    expect(op.operation).toBe('campaign_criterion')
    expect(op.op).toBe('create')

    const create = op.resource as Record<string, unknown>
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

    // First call: campaign (has budget + campaign ops) — snake_case entities
    const firstCall = client.mutateCalls[0]!
    expect(firstCall.some(op => op.operation === 'campaign_budget')).toBe(true)

    // Second call: ad group
    const secondCall = client.mutateCalls[1]!
    expect(secondCall.some(op => op.operation === 'ad_group')).toBe(true)

    // Third call: keyword
    const thirdCall = client.mutateCalls[2]!
    expect(thirdCall.some(op => op.operation === 'ad_group_criterion')).toBe(true)

    // Fourth call: ad
    const fourthCall = client.mutateCalls[3]!
    expect(fourthCall.some(op => op.operation === 'ad_group_ad')).toBe(true)

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

    // Verify reverse order: ad, keyword, adGroup, campaign — snake_case entities
    expect(client.mutateCalls.length).toBe(4)

    const ops = client.mutateCalls.map(calls => calls[0]!.operation)
    expect(ops[0]).toBe('ad_group_ad')           // ad first
    expect(ops[1]).toBe('ad_group_criterion')    // keyword
    expect(ops[2]).toBe('ad_group')              // adGroup
    expect(ops[3]).toBe('campaign')              // campaign last
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
    const budgetResource = budgetOp.resource as Record<string, unknown>

    expect(budgetResource.amount_micros).toBe('8500000')
  })

  test('maximize-clicks maxCpc is converted to micros with snake_case', () => {
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
    const campaignResource = campaignOp.resource as Record<string, unknown>

    const targetSpend = campaignResource.target_spend as Record<string, unknown>
    expect(targetSpend.cpc_bid_ceiling_micros).toBe('1500000')
  })
})

// ─── Network Settings ──────────────────────────────────────

describe('network settings', () => {
  test('campaign create includes network_settings when specified', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'search-with-networks', {
        name: 'Search With Networks',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
        networkSettings: {
          searchNetwork: true,
          searchPartners: false,
          displayNetwork: false,
        },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.network_settings).toEqual({
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    })
  })

  test('campaign create omits network_settings when not specified', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'search-no-networks', {
        name: 'Search No Networks',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.network_settings).toBeUndefined()
  })

  test('campaign update sets network_settings with correct updateMask', () => {
    const change: Change = {
      op: 'update',
      resource: makeResource('campaign', 'my-campaign', {}, '12345'),
      changes: [
        {
          field: 'networkSettings',
          from: { searchNetwork: true, searchPartners: true, displayNetwork: true },
          to: { searchNetwork: true, searchPartners: false, displayNetwork: false },
        },
      ],
    }

    const mutations = changeToMutations(change as Change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('campaign')
    expect(op.op).toBe('update')
    expect(op.updateMask).toContain('network_settings')

    const resource = op.resource as Record<string, unknown>
    expect(resource.network_settings).toEqual({
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    })
  })
})

// ─── Missing Bidding Strategies (Create) ───────────────────

describe('bidding strategies on create', () => {
  test('target-roas uses raw double, NOT micros', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'roas-campaign', {
        name: 'ROAS Campaign',
        status: 'enabled',
        budget: { amount: 20, currency: 'EUR', period: 'daily' },
        bidding: { type: 'target-roas', targetRoas: 3.5 },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.target_roas).toEqual({
      target_roas: 3.5, // raw double, NOT 3500000
    })
  })

  test('target-impression-share with location and maxCpc', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'impression-share-campaign', {
        name: 'Impression Share Campaign',
        status: 'enabled',
        budget: { amount: 15, currency: 'EUR', period: 'daily' },
        bidding: {
          type: 'target-impression-share',
          location: 'absolute-top',
          targetPercent: 0.7,
          maxCpc: 2.0,
        },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.target_impression_share).toEqual({
      location: 4, // absolute-top = 4
      location_fraction_micros: '7000', // 0.7 * 10000
      cpc_bid_ceiling_micros: '2000000', // 2.0 in micros
    })
  })

  test('maximize-conversion-value with targetRoas', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'max-conv-value-campaign', {
        name: 'Max Conv Value Campaign',
        status: 'enabled',
        budget: { amount: 30, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversion-value', targetRoas: 4.0 },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.maximize_conversion_value).toEqual({
      target_roas: 4.0, // raw double
    })
  })

  test('maximize-conversion-value without targetRoas', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'max-conv-value-no-roas', {
        name: 'Max Conv Value No ROAS',
        status: 'enabled',
        budget: { amount: 25, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversion-value' },
        targeting: { rules: [] },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())
    const campaignOp = mutations[1]!
    const campaignResource = campaignOp.resource as Record<string, unknown>

    expect(campaignResource.maximize_conversion_value).toEqual({})
  })
})

// ─── Missing Bidding Strategies (Update) ───────────────────

describe('bidding strategies on update', () => {
  test('update bidding to target-roas produces correct mutation', () => {
    const change: Change = {
      op: 'update',
      resource: makeResource('campaign', 'my-campaign', {}, '12345'),
      changes: [
        {
          field: 'bidding',
          from: { type: 'maximize-conversions' },
          to: { type: 'target-roas', targetRoas: 3.5 },
        },
      ],
    }

    const mutations = changeToMutations(change as Change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.operation).toBe('campaign')
    expect(op.op).toBe('update')
    expect(op.updateMask).toContain('target_roas')

    const resource = op.resource as Record<string, unknown>
    expect(resource.target_roas).toEqual({ target_roas: 3.5 })
  })

  test('update bidding to target-impression-share', () => {
    const change: Change = {
      op: 'update',
      resource: makeResource('campaign', 'my-campaign', {}, '12345'),
      changes: [
        {
          field: 'bidding',
          from: { type: 'maximize-clicks' },
          to: { type: 'target-impression-share', location: 'top', targetPercent: 0.5, maxCpc: 3.0 },
        },
      ],
    }

    const mutations = changeToMutations(change as Change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.updateMask).toContain('target_impression_share')

    const resource = op.resource as Record<string, unknown>
    expect(resource.target_impression_share).toEqual({
      location: 3, // top = 3
      location_fraction_micros: '5000',
      cpc_bid_ceiling_micros: '3000000',
    })
  })

  test('update bidding to maximize-conversion-value with targetRoas', () => {
    const change: Change = {
      op: 'update',
      resource: makeResource('campaign', 'my-campaign', {}, '12345'),
      changes: [
        {
          field: 'bidding',
          from: { type: 'maximize-conversions' },
          to: { type: 'maximize-conversion-value', targetRoas: 2.5 },
        },
      ],
    }

    const mutations = changeToMutations(change as Change, '7300967494', new Map())

    expect(mutations).toHaveLength(1)
    const op = mutations[0]!
    expect(op.updateMask).toContain('maximize_conversion_value')

    const resource = op.resource as Record<string, unknown>
    expect(resource.maximize_conversion_value).toEqual({ target_roas: 2.5 })
  })
})

// ─── Device Bid Adjustments ────────────────────────────────

describe('device bid adjustments', () => {
  test('campaign create with device targeting creates campaign_criterion', () => {
    const change: Change = {
      op: 'create',
      resource: makeResource('campaign', 'device-campaign', {
        name: 'Device Campaign',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'device', device: 'mobile', bidAdjustment: -0.2 },
          ],
        },
      }),
    }

    const mutations = changeToMutations(change, '7300967494', new Map())

    // Find the device criterion operation
    const deviceOps = mutations.filter(m => {
      const res = m.resource as Record<string, unknown>
      return m.operation === 'campaign_criterion' && res.device !== undefined
    })

    expect(deviceOps).toHaveLength(1)
    const deviceOp = deviceOps[0]!
    expect(deviceOp.op).toBe('create')

    const resource = deviceOp.resource as Record<string, unknown>
    expect(resource.device).toEqual({ type: 2 }) // mobile = 2
    expect(resource.bid_modifier).toBe(0.8) // 1.0 + (-0.2) = 0.8
  })

  test('campaign update with targeting change creates device criterion mutations', () => {
    const change: Change = {
      op: 'update',
      resource: makeResource('campaign', 'my-campaign', {}, '12345'),
      changes: [
        {
          field: 'targeting',
          from: { rules: [] },
          to: {
            rules: [
              { type: 'device', device: 'desktop', bidAdjustment: 0.1 },
              { type: 'device', device: 'tablet', bidAdjustment: -0.5 },
            ],
          },
        },
      ],
    }

    const mutations = changeToMutations(change as Change, '7300967494', new Map())

    // Should have device criterion operations
    const deviceOps = mutations.filter(m => {
      const res = m.resource as Record<string, unknown>
      return m.operation === 'campaign_criterion' && res.device !== undefined
    })

    expect(deviceOps).toHaveLength(2)

    // Desktop: type 3, bid_modifier 1.1
    const desktopOp = deviceOps.find(op => {
      const res = op.resource as Record<string, unknown>
      const device = res.device as Record<string, unknown>
      return device.type === 3
    })
    expect(desktopOp).toBeDefined()
    expect((desktopOp!.resource as Record<string, unknown>).bid_modifier).toBe(1.1)

    // Tablet: type 4, bid_modifier 0.5
    const tabletOp = deviceOps.find(op => {
      const res = op.resource as Record<string, unknown>
      const device = res.device as Record<string, unknown>
      return device.type === 4
    })
    expect(tabletOp).toBeDefined()
    expect((tabletOp!.resource as Record<string, unknown>).bid_modifier).toBe(0.5)
  })
})
