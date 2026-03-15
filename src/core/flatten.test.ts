import { describe, expect, test } from 'bun:test'
import { deduplicateResourceSlugs, slugify } from './flatten.ts'
import type { Resource } from './types.ts'

// ─── Helpers ──────────────────────────────────────────────

function campaign(path: string, name: string): Resource {
  return { kind: 'campaign', path, properties: { name, status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC' } }
}

function adSet(campaignSlug: string, name: string): Resource {
  return { kind: 'adSet', path: `${campaignSlug}/${slugify(name)}`, properties: { name, status: 'ACTIVE' } }
}

function creative(campaignSlug: string, adSetName: string, adName: string): Resource {
  const adSetSlug = slugify(adSetName)
  const adSlug = slugify(adName)
  return {
    kind: 'creative',
    path: `${campaignSlug}/${adSetSlug}/${adSlug}/cr`,
    properties: { name: adName, format: 'image' },
  }
}

function ad(campaignSlug: string, adSetName: string, adName: string): Resource {
  const adSetSlug = slugify(adSetName)
  const adSlug = slugify(adName)
  const creativePath = `${campaignSlug}/${adSetSlug}/${adSlug}/cr`
  return {
    kind: 'ad',
    path: `${campaignSlug}/${adSetSlug}/${adSlug}`,
    properties: { name: adName, status: 'ACTIVE', creativePath },
  }
}

// ─── Tests ────────────────────────────────────────────────

describe('deduplicateResourceSlugs', () => {
  test('returns resources unchanged when no collisions', () => {
    const resources: Resource[] = [
      campaign('campaign-a', 'Campaign A'),
      adSet('campaign-a', 'Ad Set 1'),
      creative('campaign-a', 'Ad Set 1', 'Hero Ad'),
      ad('campaign-a', 'Ad Set 1', 'Hero Ad'),
      campaign('campaign-b', 'Campaign B'),
      adSet('campaign-b', 'Ad Set 2'),
    ]

    const result = deduplicateResourceSlugs(resources)
    expect(result).toEqual(resources)
  })

  test('returns resources unchanged for single campaign', () => {
    const resources: Resource[] = [
      campaign('retargeting', 'Retargeting'),
      adSet('retargeting', 'Ad Set 1'),
    ]

    const result = deduplicateResourceSlugs(resources)
    expect(result).toEqual(resources)
  })

  test('deduplicates second campaign with same name, rewrites all child paths', () => {
    const slug = 'retargeting-website-visitors'
    const resources: Resource[] = [
      // First campaign — should keep original paths
      campaign(slug, 'Retargeting - Website Visitors'),
      adSet(slug, 'Lookalike'),
      creative(slug, 'Lookalike', 'Hero Image'),
      ad(slug, 'Lookalike', 'Hero Image'),
      // Second campaign — same name, should get -2 suffix
      campaign(slug, 'Retargeting - Website Visitors'),
      adSet(slug, 'Custom Audience'),
      creative(slug, 'Custom Audience', 'Banner Ad'),
      ad(slug, 'Custom Audience', 'Banner Ad'),
    ]

    const result = deduplicateResourceSlugs(resources)

    // First campaign unchanged
    expect(result[0]!.path).toBe(slug)
    expect(result[1]!.path).toBe(`${slug}/lookalike`)
    expect(result[2]!.path).toBe(`${slug}/lookalike/hero-image/cr`)
    expect(result[3]!.path).toBe(`${slug}/lookalike/hero-image`)
    expect((result[3]!.properties as any).creativePath).toBe(`${slug}/lookalike/hero-image/cr`)

    // Second campaign gets -2 suffix
    const slug2 = `${slug}-2`
    expect(result[4]!.path).toBe(slug2)
    expect(result[5]!.path).toBe(`${slug2}/custom-audience`)
    expect(result[6]!.path).toBe(`${slug2}/custom-audience/banner-ad/cr`)
    expect(result[7]!.path).toBe(`${slug2}/custom-audience/banner-ad`)
    expect((result[7]!.properties as any).creativePath).toBe(`${slug2}/custom-audience/banner-ad/cr`)
  })

  test('handles three campaigns with same name', () => {
    const slug = 'test-campaign'
    const resources: Resource[] = [
      campaign(slug, 'Test Campaign'),
      adSet(slug, 'Set A'),
      campaign(slug, 'Test Campaign'),
      adSet(slug, 'Set B'),
      campaign(slug, 'Test Campaign'),
      adSet(slug, 'Set C'),
    ]

    const result = deduplicateResourceSlugs(resources)

    expect(result[0]!.path).toBe(slug)
    expect(result[1]!.path).toBe(`${slug}/set-a`)
    expect(result[2]!.path).toBe(`${slug}-2`)
    expect(result[3]!.path).toBe(`${slug}-2/set-b`)
    expect(result[4]!.path).toBe(`${slug}-3`)
    expect(result[5]!.path).toBe(`${slug}-3/set-c`)
  })

  test('only deduplicates colliding slugs, leaves others alone', () => {
    const resources: Resource[] = [
      campaign('unique-campaign', 'Unique Campaign'),
      adSet('unique-campaign', 'Set X'),
      campaign('duplicate', 'Duplicate'),
      adSet('duplicate', 'Set A'),
      campaign('duplicate', 'Duplicate'),
      adSet('duplicate', 'Set B'),
      campaign('another-unique', 'Another Unique'),
      adSet('another-unique', 'Set Y'),
    ]

    const result = deduplicateResourceSlugs(resources)

    expect(result[0]!.path).toBe('unique-campaign')
    expect(result[1]!.path).toBe('unique-campaign/set-x')
    expect(result[2]!.path).toBe('duplicate')
    expect(result[3]!.path).toBe('duplicate/set-a')
    expect(result[4]!.path).toBe('duplicate-2')
    expect(result[5]!.path).toBe('duplicate-2/set-b')
    expect(result[6]!.path).toBe('another-unique')
    expect(result[7]!.path).toBe('another-unique/set-y')
  })

  test('empty input returns empty output', () => {
    expect(deduplicateResourceSlugs([])).toEqual([])
  })
})
