import { describe, expect, test } from 'bun:test'
import {
  expand,
  computeExpansionTargets,
  type ExpandConfig,
  type ExpandEntry,
  type ExpansionTarget,
} from '../../src/ai/expand.ts'
import {
  readManifest,
  writeManifest,
  updateManifestEntry,
  type Manifest,
  type ManifestEntry,
} from '../../src/ai/manifest.ts'
import {
  generateExpandedCode,
  type ExpandedCampaignData,
  type ExpandedAdGroup,
} from '../../src/ai/codegen-expanded.ts'

// ─── expand() ───────────────────────────────────────────

describe('expand()', () => {
  test('returns an ExpandEntry with seed path and config', () => {
    const config: ExpandConfig = { translate: ['de', 'fr'] }
    const entry = expand('campaigns/search-dropbox.ts', config)

    expect(entry.seed).toBe('campaigns/search-dropbox.ts')
    expect(entry.config).toBe(config)
  })
})

// ─── computeExpansionTargets() ──────────────────────────

describe('computeExpansionTargets()', () => {
  test('translate-only: generates one target per language', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de', 'fr'],
    })

    expect(targets).toHaveLength(2)
    expect(targets[0]).toEqual({ fileName: 'search-dropbox.de.ts', translate: 'de' })
    expect(targets[1]).toEqual({ fileName: 'search-dropbox.fr.ts', translate: 'fr' })
  })

  test('vary-only: generates one target per ICP', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      vary: [{ name: 'smb', prompt: 'Target small businesses' }],
    })

    expect(targets).toHaveLength(1)
    expect(targets[0]).toEqual({
      fileName: 'search-dropbox.smb.ts',
      vary: { name: 'smb', prompt: 'Target small businesses' },
    })
  })

  test('translate + vary with cross: true (default) produces cross product', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de'],
      vary: [{ name: 'smb', prompt: 'Target small businesses' }],
      // cross defaults to true
    })

    // de, smb, smb.de = 3 targets
    expect(targets).toHaveLength(3)

    const fileNames = targets.map((t) => t.fileName).sort()
    expect(fileNames).toEqual([
      'search-dropbox.de.ts',
      'search-dropbox.smb.de.ts',
      'search-dropbox.smb.ts',
    ])
  })

  test('translate + vary with cross: false produces no cross product', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de'],
      vary: [{ name: 'smb', prompt: 'Target small businesses' }],
      cross: false,
    })

    // de, smb = 2 targets (no cross)
    expect(targets).toHaveLength(2)

    const fileNames = targets.map((t) => t.fileName).sort()
    expect(fileNames).toEqual([
      'search-dropbox.de.ts',
      'search-dropbox.smb.ts',
    ])
  })

  test('larger matrix: 3 langs + 2 ICPs + cross = 11 targets', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de', 'fr', 'es'],
      vary: [
        { name: 'smb', prompt: 'Target small businesses' },
        { name: 'enterprise', prompt: 'Target enterprise' },
      ],
      cross: true,
    })

    // 3 translate + 2 vary + (3 * 2) cross = 11
    expect(targets).toHaveLength(11)
  })

  test('file names follow {seed-slug}.{variant}.ts convention', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de'],
      vary: [{ name: 'smb', prompt: 'SMB focus' }],
      cross: true,
    })

    const fileNames = targets.map((t) => t.fileName).sort()
    expect(fileNames).toEqual([
      'search-dropbox.de.ts',
      'search-dropbox.smb.de.ts',
      'search-dropbox.smb.ts',
    ])
  })

  test('cross targets carry both translate and vary', () => {
    const targets = computeExpansionTargets('search-dropbox', {
      translate: ['de'],
      vary: [{ name: 'smb', prompt: 'SMB focus' }],
      cross: true,
    })

    const crossTarget = targets.find((t) => t.fileName === 'search-dropbox.smb.de.ts')
    expect(crossTarget).toBeDefined()
    expect(crossTarget!.translate).toBe('de')
    expect(crossTarget!.vary).toEqual({ name: 'smb', prompt: 'SMB focus' })
  })

  test('empty config produces no targets', () => {
    const targets = computeExpansionTargets('search-dropbox', {})
    expect(targets).toHaveLength(0)
  })
})

// ─── Manifest CRUD ──────────────────────────────────────

describe('Manifest operations', () => {
  test('readManifest returns null for nonexistent file', async () => {
    const result = await readManifest('/tmp/nonexistent-dir-' + Date.now())
    expect(result).toBeNull()
  })

  test('writeManifest + readManifest round-trips', async () => {
    const dir = `/tmp/ads-manifest-test-${Date.now()}`
    await Bun.write(`${dir}/.gitkeep`, '')

    const manifest: Manifest = {
      'search-dropbox.de.ts': {
        seed: 'search-dropbox',
        transform: { translate: 'de' },
        model: 'gpt-4.1-mini',
        generatedAt: '2026-03-15T12:00:00Z',
        round: 1,
      },
    }

    await writeManifest(dir, manifest)
    const loaded = await readManifest(dir)

    expect(loaded).toEqual(manifest)
  })

  test('updateManifestEntry returns new manifest with entry added', () => {
    const existing: Manifest = {}
    const entry: ManifestEntry = {
      seed: 'search-dropbox',
      transform: { translate: 'fr' },
      model: 'gpt-4.1-mini',
      generatedAt: '2026-03-15T12:00:00Z',
      round: 1,
    }

    const updated = updateManifestEntry(existing, 'search-dropbox.fr.ts', entry)

    expect(updated).not.toBe(existing) // immutable
    expect(updated['search-dropbox.fr.ts']).toEqual(entry)
    expect(Object.keys(existing)).toHaveLength(0) // original unchanged
  })

  test('updateManifestEntry replaces existing entry', () => {
    const existing: Manifest = {
      'search-dropbox.de.ts': {
        seed: 'search-dropbox',
        transform: { translate: 'de' },
        model: 'gpt-4.1-mini',
        generatedAt: '2026-03-15T10:00:00Z',
        round: 1,
      },
    }
    const entry: ManifestEntry = {
      seed: 'search-dropbox',
      transform: { translate: 'de' },
      model: 'gpt-4.1-mini',
      generatedAt: '2026-03-15T12:00:00Z',
      round: 2,
    }

    const updated = updateManifestEntry(existing, 'search-dropbox.de.ts', entry)

    expect(updated['search-dropbox.de.ts']!.round).toBe(2)
    expect(updated['search-dropbox.de.ts']!.generatedAt).toBe('2026-03-15T12:00:00Z')
  })
})

// ─── generateExpandedCode() ─────────────────────────────

describe('generateExpandedCode()', () => {
  function makeSampleData(): ExpandedCampaignData {
    return {
      name: 'Search - Dropbox',
      budget: { amount: 10, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-conversions' },
      targeting: {
        rules: [
          { type: 'geo', countries: ['DE'] },
          { type: 'language', languages: ['de'] },
        ],
      },
      negatives: [],
      groups: [
        {
          key: 'core',
          keywords: [
            { text: 'dateien umbenennen', matchType: 'EXACT' },
            { text: 'dropbox organizer', matchType: 'PHRASE' },
          ],
          ad: {
            headlines: ['Dropbox Dateien Umbenennen', 'KI-Gesteuert', 'Jetzt Testen'],
            descriptions: ['Benennen Sie Ihre Dropbox-Dateien mit KI um.', 'Intelligente Dateiverwaltung.'],
            finalUrl: 'https://www.renamed.to/dropbox',
          },
        },
      ],
    }
  }

  test('produces valid TypeScript with correct imports', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')

    expect(code).toContain("from '@upspawn/ads'")
    expect(code).toContain('google')
    expect(code).toContain('daily')
    expect(code).toContain('exact')
    expect(code).toContain('phrase')
    expect(code).toContain('headlines')
    expect(code).toContain('descriptions')
    expect(code).toContain('rsa')
    expect(code).toContain('url')
  })

  test('campaign name includes variant suffix', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain("'Search - Dropbox [DE]'")
  })

  test('targeting includes correct geo/language for translations', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain("geo('DE')")
    expect(code).toContain("languages('de')")
  })

  test('generated code is standalone (no seed imports)', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    // Only import should be from @upspawn/ads
    const importLines = code.split('\n').filter((l) => l.startsWith('import'))
    expect(importLines).toHaveLength(1)
    expect(importLines[0]).toContain('@upspawn/ads')
  })

  test('uses export default', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain('export default google.search')
  })

  test('generates .group() chains for each ad group', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain(".group('core'")
  })

  test('handles multiple match types', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain('exact(')
    expect(code).toContain('phrase(')
  })

  test('generates bidding correctly', () => {
    const code = generateExpandedCode('search-dropbox', makeSampleData(), '[DE]')
    expect(code).toContain("'maximize-conversions'")
  })

  test('handles USD currency', () => {
    const data = makeSampleData()
    data.budget = { amount: 5, currency: 'USD', period: 'daily' }
    const code = generateExpandedCode('search-dropbox', data, '[US-SMB]')
    expect(code).toContain("daily(5, 'USD')")
  })

  test('handles monthly budget', () => {
    const data = makeSampleData()
    data.budget = { amount: 300, currency: 'EUR', period: 'monthly' }
    const code = generateExpandedCode('search-dropbox', data, '[DE]')
    expect(code).toContain('monthly(300)')
  })

  test('generates negatives when present', () => {
    const data = makeSampleData()
    data.negatives = [
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'EXACT' },
    ]
    const code = generateExpandedCode('search-dropbox', data, '[DE]')
    expect(code).toContain('negatives:')
    expect(code).toContain("broad('free')")
    expect(code).toContain("exact('cheap')")
  })

  test('handles target-cpa bidding with value', () => {
    const data = makeSampleData()
    data.bidding = { type: 'target-cpa', targetCpa: 15 }
    const code = generateExpandedCode('search-dropbox', data, '[DE]')
    expect(code).toContain("type: 'target-cpa', targetCpa: 15")
  })
})
