import { describe, expect, test } from 'bun:test'
import { sortCampaignsByFile } from '../../src/core/discovery.ts'
import type { DiscoveredCampaign } from '../../src/core/discovery.ts'

function makeCampaign(file: string): DiscoveredCampaign {
  return { file, exportName: 'default', provider: 'meta', kind: 'traffic', campaign: {} }
}

describe('sortCampaignsByFile', () => {
  test('base file comes before dedup variant', () => {
    const campaigns = [
      makeCampaign('/campaigns/retargeting-website-visitors-2.ts'),
      makeCampaign('/campaigns/retargeting-website-visitors.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted[0]!.file).toContain('retargeting-website-visitors.ts')
    expect(sorted[1]!.file).toContain('retargeting-website-visitors-2.ts')
  })

  test('already correct order stays the same', () => {
    const campaigns = [
      makeCampaign('/campaigns/retargeting-website-visitors.ts'),
      makeCampaign('/campaigns/retargeting-website-visitors-2.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted[0]!.file).toContain('retargeting-website-visitors.ts')
    expect(sorted[1]!.file).toContain('retargeting-website-visitors-2.ts')
  })

  test('three duplicate campaigns sort correctly', () => {
    const campaigns = [
      makeCampaign('/campaigns/foo-3.ts'),
      makeCampaign('/campaigns/foo.ts'),
      makeCampaign('/campaigns/foo-2.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted.map(c => c.file.split('/').pop())).toEqual(['foo.ts', 'foo-2.ts', 'foo-3.ts'])
  })

  test('different campaign names sort alphabetically', () => {
    const campaigns = [
      makeCampaign('/campaigns/cold-traffic.ts'),
      makeCampaign('/campaigns/accounting.ts'),
      makeCampaign('/campaigns/branding.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted.map(c => c.file.split('/').pop())).toEqual([
      'accounting.ts', 'branding.ts', 'cold-traffic.ts',
    ])
  })

  test('mixed unique and duplicate campaigns', () => {
    const campaigns = [
      makeCampaign('/campaigns/retargeting-2.ts'),
      makeCampaign('/campaigns/cold-traffic.ts'),
      makeCampaign('/campaigns/retargeting.ts'),
      makeCampaign('/campaigns/accounting.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted.map(c => c.file.split('/').pop())).toEqual([
      'accounting.ts', 'cold-traffic.ts', 'retargeting.ts', 'retargeting-2.ts',
    ])
  })

  test('campaign name ending in number is not treated as dedup suffix', () => {
    // "campaign-2026" should NOT be treated as "campaign" with suffix 2026
    // The dedup suffix pattern is a bare number at the end: "-2", "-3", etc.
    // Years like "-2026" should be treated as part of the stem
    const campaigns = [
      makeCampaign('/campaigns/construction-mar-2026.ts'),
      makeCampaign('/campaigns/construction-feb-2026.ts'),
    ]
    const sorted = sortCampaignsByFile(campaigns)
    // Both are treated as unique stems, sorted alphabetically
    expect(sorted.map(c => c.file.split('/').pop())).toEqual([
      'construction-feb-2026.ts', 'construction-mar-2026.ts',
    ])
  })

  test('empty array returns empty', () => {
    expect(sortCampaignsByFile([])).toEqual([])
  })

  test('single campaign returns as-is', () => {
    const campaigns = [makeCampaign('/campaigns/foo.ts')]
    const sorted = sortCampaignsByFile(campaigns)
    expect(sorted).toHaveLength(1)
    expect(sorted[0]!.file).toContain('foo.ts')
  })

  test('does not mutate the original array', () => {
    const campaigns = [
      makeCampaign('/campaigns/b.ts'),
      makeCampaign('/campaigns/a.ts'),
    ]
    const original = [...campaigns]
    sortCampaignsByFile(campaigns)
    expect(campaigns[0]!.file).toBe(original[0]!.file)
    expect(campaigns[1]!.file).toBe(original[1]!.file)
  })
})
