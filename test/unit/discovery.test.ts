import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverCampaigns, loadConfig, loadGenerateMatrix, discoverGeneratedCampaigns } from '../../src/core/discovery.ts'
import { enrichError, AdsEnrichedError } from '../../src/core/errors.ts'

// ─── Discovery ──────────────────────────────────────────────

describe('discoverCampaigns()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ads-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(tmpDir, 'campaigns'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('discovers campaign files with provider + kind fields', async () => {
    await Bun.write(
      join(tmpDir, 'campaigns', 'search.ts'),
      `export const myCampaign = { provider: 'google', kind: 'search', name: 'Test' }\n`
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
    expect(result.campaigns[0]!.provider).toBe('google')
    expect(result.campaigns[0]!.kind).toBe('search')
    expect(result.campaigns[0]!.exportName).toBe('myCampaign')
  })

  test('discovers multiple exports from one file', async () => {
    await Bun.write(
      join(tmpDir, 'campaigns', 'multi.ts'),
      `
export const campaignA = { provider: 'google', kind: 'search', name: 'A' }
export const campaignB = { provider: 'meta', kind: 'traffic', name: 'B' }
`.trim() + '\n'
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(2)
    const providers = result.campaigns.map(c => c.provider).sort()
    expect(providers).toEqual(['google', 'meta'])
  })

  test('discovers campaigns in nested directories', async () => {
    mkdirSync(join(tmpDir, 'campaigns', 'google'), { recursive: true })
    await Bun.write(
      join(tmpDir, 'campaigns', 'google', 'search.ts'),
      `export default { provider: 'google', kind: 'search', name: 'Nested' }\n`
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(1)
    expect(result.campaigns[0]!.exportName).toBe('default')
  })

  test('skips exports without provider or kind', async () => {
    await Bun.write(
      join(tmpDir, 'campaigns', 'helpers.ts'),
      `
export const targeting = { rules: [] }
export const budget = { amount: 20, currency: 'EUR', period: 'daily' }
export const campaign = { provider: 'google', kind: 'search', name: 'Real' }
`.trim() + '\n'
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(1)
    expect(result.campaigns[0]!.exportName).toBe('campaign')
  })

  test('skips non-object exports', async () => {
    await Bun.write(
      join(tmpDir, 'campaigns', 'constants.ts'),
      `
export const MAX_BUDGET = 100
export const NAME = 'test'
export const FLAGS = null
`.trim() + '\n'
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  test('returns error for files that fail to import', async () => {
    await Bun.write(
      join(tmpDir, 'campaigns', 'broken.ts'),
      `import { nonExistent } from './does-not-exist.ts'\nexport const x = nonExistent\n`
    )

    const result = await discoverCampaigns(tmpDir)

    expect(result.campaigns).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.file).toContain('broken.ts')
    expect(result.errors[0]!.message).toBeTruthy()
  })

  test('returns empty result when no campaigns directory exists', async () => {
    const emptyDir = join(tmpdir(), `ads-empty-${Date.now()}`)
    mkdirSync(emptyDir, { recursive: true })

    try {
      const result = await discoverCampaigns(emptyDir)
      expect(result.campaigns).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

// ─── Config Loading ─────────────────────────────────────────

describe('loadConfig()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ads-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('loads ads.config.ts default export', async () => {
    await Bun.write(
      join(tmpDir, 'ads.config.ts'),
      `export default { google: { customerId: '123-456-7890' } }\n`
    )

    const config = await loadConfig(tmpDir)
    expect(config).toEqual({ google: { customerId: '123-456-7890' } })
  })

  test('returns undefined when no config exists', async () => {
    const config = await loadConfig(tmpDir)
    expect(config).toBeUndefined()
  })
})

// ─── Generate Matrix Loading ────────────────────────────────

describe('loadGenerateMatrix()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ads-genmatrix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns null when ads.generate.ts does not exist', async () => {
    const result = await loadGenerateMatrix(tmpDir)
    expect(result).toBeNull()
  })

  test('loads expand entries from ads.generate.ts', async () => {
    await Bun.write(
      join(tmpDir, 'ads.generate.ts'),
      `export default [
        { seed: 'campaigns/search-dropbox.ts', config: { translate: ['de', 'fr'] } },
      ]\n`
    )

    const result = await loadGenerateMatrix(tmpDir)
    expect(result).toHaveLength(1)
    expect(result![0]!.seed).toBe('campaigns/search-dropbox.ts')
    expect(result![0]!.config.translate).toEqual(['de', 'fr'])
  })

  test('returns null when default export is not an array', async () => {
    await Bun.write(
      join(tmpDir, 'ads.generate.ts'),
      `export default 'not an array'\n`
    )

    const result = await loadGenerateMatrix(tmpDir)
    expect(result).toBeNull()
  })
})

// ─── Generated Campaign Discovery ──────────────────────────

describe('discoverGeneratedCampaigns()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ads-gendisc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(tmpDir, 'generated'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('discovers campaigns in generated/ directory', async () => {
    await Bun.write(
      join(tmpDir, 'generated', 'search-dropbox.de.ts'),
      `export default { provider: 'google', kind: 'search', name: 'Search - Dropbox [DE]' }\n`
    )

    const result = await discoverGeneratedCampaigns(tmpDir)
    expect(result.campaigns).toHaveLength(1)
    expect(result.campaigns[0]!.provider).toBe('google')
  })

  test('returns empty when generated/ does not exist', async () => {
    const emptyDir = join(tmpdir(), `ads-emptygen-${Date.now()}`)
    mkdirSync(emptyDir, { recursive: true })

    try {
      const result = await discoverGeneratedCampaigns(emptyDir)
      expect(result.campaigns).toHaveLength(0)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})

// ─── Error Enrichment ───────────────────────────────────────

describe('enrichError()', () => {
  test('wraps a plain Error with file context', () => {
    const err = new Error('headline exceeds 30 chars')
    const enriched = enrichError(err, { file: 'campaigns/search.ts' })

    expect(enriched).toBeInstanceOf(AdsEnrichedError)
    expect(enriched.message).toBe('campaigns/search.ts: headline exceeds 30 chars')
    expect(enriched.context.file).toBe('campaigns/search.ts')
  })

  test('wraps with full context chain: file > group > ad > field', () => {
    const err = new Error('too long')
    const enriched = enrichError(err, {
      file: 'campaigns/search.ts',
      group: 'en-us',
      ad: 'rsa-1',
      field: 'headline',
    })

    expect(enriched.message).toBe('campaigns/search.ts > en-us > rsa-1 > headline: too long')
  })

  test('wraps string errors', () => {
    const enriched = enrichError('something failed', { file: 'campaigns/broken.ts' })

    expect(enriched).toBeInstanceOf(AdsEnrichedError)
    expect(enriched.message).toBe('campaigns/broken.ts: something failed')
  })

  test('merges context when re-enriching', () => {
    const err = new Error('invalid value')
    const first = enrichError(err, { file: 'campaigns/search.ts' })
    const second = enrichError(first, { group: 'en-us', field: 'budget' })

    expect(second.context).toEqual({
      file: 'campaigns/search.ts',
      group: 'en-us',
      field: 'budget',
    })
    expect(second.message).toContain('campaigns/search.ts > en-us > budget')
    expect(second.message).toContain('invalid value')
  })

  test('preserves cause reference', () => {
    const originalErr = new Error('root cause')
    const enriched = enrichError(originalErr, { file: 'test.ts' })

    expect(enriched.cause).toBe(originalErr)
  })

  test('partial context is fine', () => {
    const err = new Error('bad keyword')
    const enriched = enrichError(err, { group: 'de-at' })

    expect(enriched.message).toBe('de-at: bad keyword')
    expect(enriched.context.file).toBeUndefined()
    expect(enriched.context.group).toBe('de-at')
  })
})
