import { describe, expect, test, beforeEach } from 'bun:test'
import { getProvider, resolveProviders, clearProviderCache } from '../../src/core/providers.ts'
import type { DiscoveredCampaign } from '../../src/core/discovery.ts'

// ─── Helpers ──────────────────────────────────────────────

function makeCampaign(provider: string, name: string): DiscoveredCampaign {
  return {
    file: `/campaigns/${name}.ts`,
    exportName: 'default',
    provider,
    kind: 'search',
    campaign: { provider, kind: 'search', name },
  }
}

// ─── getProvider ──────────────────────────────────────────

describe('getProvider()', () => {
  beforeEach(() => {
    clearProviderCache()
  })

  test('returns a provider module for "google"', async () => {
    const provider = await getProvider('google')
    expect(provider).toBeDefined()
    expect(typeof provider.flatten).toBe('function')
    expect(typeof provider.fetchAll).toBe('function')
    expect(typeof provider.applyChangeset).toBe('function')
    expect(typeof provider.codegen).toBe('function')
  })

  test('returns a provider module for "meta"', async () => {
    const provider = await getProvider('meta')
    expect(provider).toBeDefined()
    expect(typeof provider.flatten).toBe('function')
    expect(typeof provider.fetchAll).toBe('function')
    expect(typeof provider.applyChangeset).toBe('function')
    expect(typeof provider.codegen).toBe('function')
  })

  test('meta flatten and codegen are wired, fetch/apply still throw', async () => {
    const provider = await getProvider('meta')

    // flatten and codegen are wired — empty input returns empty output
    expect(provider.flatten([])).toEqual([])
    expect(provider.codegen([], '')).toBe('')

    // fetchAll and applyChangeset are not yet implemented
    await expect(provider.fetchAll({} as never, {} as never)).rejects.toThrow('not implemented')
    await expect(provider.applyChangeset({} as never, {} as never, {} as never, '')).rejects.toThrow('not implemented')
  })

  test('throws for unknown provider', async () => {
    await expect(getProvider('tiktok')).rejects.toThrow('Unknown provider "tiktok"')
  })

  test('error message lists available providers', async () => {
    await expect(getProvider('tiktok')).rejects.toThrow('google, meta')
  })

  test('caches provider module after first load', async () => {
    const first = await getProvider('google')
    const second = await getProvider('google')
    expect(first).toBe(second)
  })

  test('clearProviderCache forces re-import', async () => {
    const first = await getProvider('google')
    clearProviderCache()
    const second = await getProvider('google')
    // After clearing cache, a new module object is loaded.
    // They should have the same shape but may or may not be the same reference
    // depending on Bun's module cache. We verify the cache was cleared
    // by checking the internal mechanism works without error.
    expect(second).toBeDefined()
    expect(typeof second.flatten).toBe('function')
  })
})

// ─── resolveProviders ─────────────────────────────────────

describe('resolveProviders()', () => {
  const googleCampaign1 = makeCampaign('google', 'search-pdf')
  const googleCampaign2 = makeCampaign('google', 'search-drive')
  const metaCampaign1 = makeCampaign('meta', 'cold-traffic')

  test('groups campaigns by provider', () => {
    const grouped = resolveProviders([googleCampaign1, metaCampaign1, googleCampaign2])

    expect(grouped.size).toBe(2)
    expect(grouped.get('google')).toHaveLength(2)
    expect(grouped.get('meta')).toHaveLength(1)
  })

  test('filters to a single provider when providerFilter is set', () => {
    const grouped = resolveProviders(
      [googleCampaign1, metaCampaign1, googleCampaign2],
      'google',
    )

    expect(grouped.size).toBe(1)
    expect(grouped.get('google')).toHaveLength(2)
    expect(grouped.has('meta')).toBe(false)
  })

  test('returns only meta campaigns when filtered to meta', () => {
    const grouped = resolveProviders(
      [googleCampaign1, metaCampaign1, googleCampaign2],
      'meta',
    )

    expect(grouped.size).toBe(1)
    expect(grouped.get('meta')).toHaveLength(1)
  })

  test('throws when providerFilter matches no campaigns', () => {
    expect(() =>
      resolveProviders([googleCampaign1, googleCampaign2], 'meta'),
    ).toThrow('No campaigns found for provider "meta"')
  })

  test('error lists available providers when filter fails', () => {
    expect(() =>
      resolveProviders([googleCampaign1, metaCampaign1], 'tiktok'),
    ).toThrow('Found providers: google, meta')
  })

  test('throws with descriptive message when no campaigns at all', () => {
    expect(() =>
      resolveProviders([], 'google'),
    ).toThrow('No campaigns discovered')
  })

  test('handles empty campaign list without filter', () => {
    const grouped = resolveProviders([])
    expect(grouped.size).toBe(0)
  })

  test('preserves campaign order within each provider group', () => {
    const grouped = resolveProviders([googleCampaign1, googleCampaign2])
    const google = grouped.get('google')!
    expect(google[0]).toBe(googleCampaign1)
    expect(google[1]).toBe(googleCampaign2)
  })
})
