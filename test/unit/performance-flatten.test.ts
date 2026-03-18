import { describe, test, expect } from 'bun:test'
import { flatten } from '../../src/google/flatten.ts'
import { flattenMeta } from '../../src/meta/flatten.ts'

describe('Google flatten — performance targets in meta', () => {
  test('campaign-level performance stored in Resource.meta.performanceTargets', async () => {
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('Test Campaign', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
      performance: { targetCPA: 15, strategy: 'Test strategy' },
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
      })

    const resources = flatten(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toEqual({
      targetCPA: 15,
      strategy: 'Test strategy',
    })
  })

  test('ad-group-level performance stored in Resource.meta.performanceTargets', async () => {
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('Test Campaign', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
        performance: { targetCPA: 10 },
      })

    const resources = flatten(campaign as any)
    const adGroupResource = resources.find(r => r.kind === 'adGroup')
    expect(adGroupResource?.meta?.performanceTargets).toEqual({ targetCPA: 10 })
  })

  test('no performance targets — meta.performanceTargets is undefined', async () => {
    const { google } = await import('../../src/google/index.ts')
    const campaign = google.search('No Perf', {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
    })
      .group('Group 1', {
        keywords: [{ text: 'test', matchType: 'EXACT' as const }],
        ad: { type: 'rsa' as const, headlines: ['H1' as any, 'H2' as any, 'H3' as any], descriptions: ['D1' as any, 'D2' as any], finalUrl: 'https://example.com' },
      })

    const resources = flatten(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toBeUndefined()
  })
})

describe('Meta flatten — performance targets in meta', () => {
  test('campaign-level performance stored in Resource.meta.performanceTargets', () => {
    const campaign = {
      provider: 'meta' as const,
      kind: 'traffic' as const,
      name: 'Test Meta Campaign',
      config: {
        budget: { amount: 200, currency: 'EUR', period: 'daily' as const },
        performance: { targetCPA: 30, minROAS: 2.5 },
      },
      adSets: [],
    }

    const resources = flattenMeta(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toEqual({
      targetCPA: 30,
      minROAS: 2.5,
    })
  })

  test('ad-set-level performance stored in Resource.meta.performanceTargets', () => {
    const campaign = {
      provider: 'meta' as const,
      kind: 'traffic' as const,
      name: 'Test Meta Campaign',
      config: { budget: { amount: 200, currency: 'EUR', period: 'daily' as const } },
      adSets: [{
        name: 'Ad Set 1',
        config: {
          targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
          performance: { targetCPA: 20 },
        },
        content: { ads: [] },
      }],
    }

    const resources = flattenMeta(campaign as any)
    const adSetResource = resources.find(r => r.kind === 'adSet')
    expect(adSetResource?.meta?.performanceTargets).toEqual({ targetCPA: 20 })
  })

  test('campaign with performance but no _defaults still gets meta', () => {
    const campaign = {
      provider: 'meta' as const,
      kind: 'traffic' as const,
      name: 'Minimal',
      config: {
        budget: { amount: 100, currency: 'EUR', period: 'daily' as const },
        status: 'ACTIVE',
        performance: { strategy: 'Just monitoring' },
      },
      adSets: [],
    }

    const resources = flattenMeta(campaign as any)
    const campaignResource = resources.find(r => r.kind === 'campaign')
    expect(campaignResource?.meta?.performanceTargets).toEqual({ strategy: 'Just monitoring' })
  })
})
