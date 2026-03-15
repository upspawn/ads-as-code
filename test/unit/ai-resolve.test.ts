import { describe, expect, test } from 'bun:test'
import type { Headline, Description, Keyword } from '../../src/core/types.ts'
import type { GoogleSearchCampaign, GoogleSearchCampaignUnresolved, RSAd } from '../../src/google/types.ts'
import type { LockFile } from '../../src/ai/lockfile.ts'
import { resolveMarkers } from '../../src/ai/resolve.ts'
import { flatten } from '../../src/core/flatten.ts'

// === Test Helpers ===

/** Build a minimal resolved campaign (no AI markers). */
function makeCampaign(overrides?: Partial<GoogleSearchCampaign>): GoogleSearchCampaign {
  return {
    provider: 'google',
    kind: 'search',
    name: 'Test Campaign',
    status: 'enabled',
    budget: { amount: 20, currency: 'EUR', period: 'daily' },
    bidding: { type: 'maximize-conversions' },
    targeting: { rules: [] },
    negatives: [],
    groups: {},
    ...overrides,
  }
}

/** Build an unresolved campaign with AI markers in groups. */
function makeUnresolvedCampaign(
  groups: GoogleSearchCampaignUnresolved['groups'],
): GoogleSearchCampaignUnresolved {
  return {
    provider: 'google',
    kind: 'search',
    name: 'AI Campaign',
    status: 'enabled',
    budget: { amount: 20, currency: 'EUR', period: 'daily' },
    bidding: { type: 'maximize-conversions' },
    targeting: { rules: [] },
    negatives: [],
    groups,
  }
}

/** Build a lock file with the given slots. */
function makeLockFile(slots: LockFile['slots']): LockFile {
  return {
    version: 1,
    model: 'test-model',
    generatedAt: '2026-03-15T00:00:00.000Z',
    slots,
  }
}

/** Create an RSA marker object (bypasses the marker factory for direct test control). */
function rsaMarker(prompt: string): { __brand: 'ai-marker'; type: 'rsa'; prompt: string } {
  return Object.freeze({ __brand: 'ai-marker' as const, type: 'rsa' as const, prompt })
}

/** Create a keywords marker object. */
function kwMarker(prompt: string): { __brand: 'ai-marker'; type: 'keywords'; prompt: string } {
  return Object.freeze({ __brand: 'ai-marker' as const, type: 'keywords' as const, prompt })
}

// === resolveMarkers ===

describe('resolveMarkers', () => {
  test('RsaMarker with matching lock slot resolves to concrete RSAd', () => {
    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [{ text: 'test keyword', matchType: 'EXACT' }],
        ads: [rsaMarker('Generate ads for product')],
      },
    })

    const lockFile = makeLockFile({
      'ad-group-1.ad': {
        prompt: 'Generate ads for product',
        result: {
          headlines: ['Buy Now', 'Best Product', 'Limited Offer'],
          descriptions: ['Get the best product today', 'Order now and save big'],
        },
        pinned: [],
        round: 1,
      },
    })

    const resolved = resolveMarkers(campaign, lockFile, 'https://example.com')

    const group = resolved.groups['ad-group-1']!
    expect(group.ads).toHaveLength(1)

    const ad = group.ads[0]! as RSAd
    expect(ad.type).toBe('rsa')
    expect(ad.headlines).toEqual(['Buy Now', 'Best Product', 'Limited Offer'] as Headline[])
    expect(ad.descriptions).toEqual(['Get the best product today', 'Order now and save big'] as Description[])
    expect(ad.finalUrl).toBe('https://example.com')
  })

  test('KeywordsMarker with matching lock slot resolves to Keyword[]', () => {
    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [kwMarker('Generate keywords for product')],
        ads: [{
          type: 'rsa' as const,
          headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
          descriptions: ['D1' as Description, 'D2' as Description],
          finalUrl: 'https://example.com',
        }],
      },
    })

    const lockFile = makeLockFile({
      'ad-group-1.keywords': {
        prompt: 'Generate keywords for product',
        result: {
          keywords: [
            { text: 'buy product', match: 'exact' },
            { text: 'best product deals', match: 'phrase' },
            { text: 'product reviews', match: 'broad' },
          ],
        },
        pinned: [],
        round: 1,
      },
    })

    const resolved = resolveMarkers(campaign, lockFile, 'https://example.com')

    const group = resolved.groups['ad-group-1']!
    expect(group.keywords).toHaveLength(3)
    expect(group.keywords[0]).toEqual({ text: 'buy product', matchType: 'EXACT' })
    expect(group.keywords[1]).toEqual({ text: 'best product deals', matchType: 'PHRASE' })
    expect(group.keywords[2]).toEqual({ text: 'product reviews', matchType: 'BROAD' })
  })

  test('mixed array: concrete keywords + KeywordsMarker all resolved', () => {
    const concreteKw: Keyword = { text: 'existing keyword', matchType: 'EXACT' }

    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [
          concreteKw,
          kwMarker('Generate more keywords'),
        ],
        ads: [{
          type: 'rsa' as const,
          headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
          descriptions: ['D1' as Description, 'D2' as Description],
          finalUrl: 'https://example.com',
        }],
      },
    })

    const lockFile = makeLockFile({
      'ad-group-1.keywords': {
        prompt: 'Generate more keywords',
        result: {
          keywords: [
            { text: 'new keyword', match: 'phrase' },
          ],
        },
        pinned: [],
        round: 1,
      },
    })

    const resolved = resolveMarkers(campaign, lockFile, 'https://example.com')

    const group = resolved.groups['ad-group-1']!
    // Concrete keyword + generated keyword
    expect(group.keywords).toHaveLength(2)
    expect(group.keywords[0]).toEqual({ text: 'existing keyword', matchType: 'EXACT' })
    expect(group.keywords[1]).toEqual({ text: 'new keyword', matchType: 'PHRASE' })
  })

  test('missing lock slot throws error with clear message', () => {
    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [{ text: 'test', matchType: 'EXACT' }],
        ads: [rsaMarker('Generate ads')],
      },
    })

    expect(() => {
      resolveMarkers(campaign, null, 'https://example.com')
    }).toThrow('Unresolved AI marker in AI Campaign/ad-group-1.ad')
    expect(() => {
      resolveMarkers(campaign, null, 'https://example.com')
    }).toThrow('run ads generate first')
  })

  test('missing specific slot in existing lock file throws error', () => {
    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [kwMarker('Generate keywords')],
        ads: [{
          type: 'rsa' as const,
          headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
          descriptions: ['D1' as Description, 'D2' as Description],
          finalUrl: 'https://example.com',
        }],
      },
    })

    const lockFile = makeLockFile({}) // No slots

    expect(() => {
      resolveMarkers(campaign, lockFile, 'https://example.com')
    }).toThrow('Unresolved AI marker in AI Campaign/ad-group-1.keywords')
  })

  test('campaign with no markers passes through unchanged', () => {
    const concreteAd: RSAd = {
      type: 'rsa',
      headlines: ['H1' as Headline, 'H2' as Headline, 'H3' as Headline],
      descriptions: ['D1' as Description, 'D2' as Description],
      finalUrl: 'https://example.com',
    }
    const concreteKw: Keyword = { text: 'keyword', matchType: 'EXACT' }

    // A campaign with only concrete values (no markers)
    // Cast as unresolved since the function expects that type
    const campaign: GoogleSearchCampaignUnresolved = {
      provider: 'google',
      kind: 'search',
      name: 'Concrete Campaign',
      status: 'enabled',
      budget: { amount: 20, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-conversions' },
      targeting: { rules: [] },
      negatives: [],
      groups: {
        'group-1': {
          keywords: [concreteKw],
          ads: [concreteAd],
        },
      },
    }

    // No lock file needed — there are no markers
    const resolved = resolveMarkers(campaign, null, 'https://example.com')

    expect(resolved.groups['group-1']!.keywords).toEqual([concreteKw])
    expect(resolved.groups['group-1']!.ads).toEqual([concreteAd])
  })

  test('resolved campaign can be flattened without errors', () => {
    const campaign = makeUnresolvedCampaign({
      'ad-group-1': {
        keywords: [
          { text: 'test keyword', matchType: 'EXACT' } as Keyword,
          kwMarker('Generate keywords'),
        ],
        ads: [rsaMarker('Generate ads')],
      },
    })

    const lockFile = makeLockFile({
      'ad-group-1.ad': {
        prompt: 'Generate ads',
        result: {
          headlines: ['Headline One', 'Headline Two', 'Headline Three'],
          descriptions: ['First description text', 'Second description text'],
        },
        pinned: [],
        round: 1,
      },
      'ad-group-1.keywords': {
        prompt: 'Generate keywords',
        result: {
          keywords: [
            { text: 'generated kw', match: 'exact' },
          ],
        },
        pinned: [],
        round: 1,
      },
    })

    const resolved = resolveMarkers(campaign, lockFile, 'https://example.com')

    // flatten expects a GoogleSearchCampaign — this should work without errors
    const resources = flatten(resolved)
    expect(resources.length).toBeGreaterThan(0)

    // Verify the flattened resources contain our keywords and ad
    const kwResources = resources.filter((r) => r.kind === 'keyword')
    expect(kwResources).toHaveLength(2) // original + generated

    const adResources = resources.filter((r) => r.kind === 'ad')
    expect(adResources).toHaveLength(1)
  })
})
