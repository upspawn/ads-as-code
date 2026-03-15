import { describe, expect, test } from 'bun:test'
import {
  generateCampaignFile,
  extractSharedConfig,
  campaignToFilename,
} from '../../src/core/codegen.ts'
import type { Resource } from '../../src/core/types.ts'

// ─── Test Data ───────────────────────────────────────────

function makePdfCampaignResources(): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'search-pdf-renaming',
      properties: {
        name: 'Search - PDF Renaming',
        status: 'enabled',
        budget: { amount: 8, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US', 'DE'] },
            { type: 'language', languages: ['en'] },
          ],
        },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-pdf-renaming/en',
      properties: {
        status: 'enabled',
        targeting: undefined,
      },
    },
    {
      kind: 'keyword',
      path: 'search-pdf-renaming/en/kw:rename pdf files:EXACT',
      properties: { text: 'rename pdf files', matchType: 'EXACT' },
    },
    {
      kind: 'keyword',
      path: 'search-pdf-renaming/en/kw:pdf renamer:EXACT',
      properties: { text: 'pdf renamer', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-pdf-renaming/en/rsa:abc123',
      properties: {
        headlines: ['AI-Powered PDF Renamer', 'Rename PDF Files Instantly', 'Try It Free'],
        descriptions: ['Upload PDFs, get smart filenames.', 'No more manual renaming.'],
        finalUrl: 'https://www.renamed.to/pdf-renamer',
      },
    },
    {
      kind: 'negative',
      path: 'search-pdf-renaming/neg:free:BROAD',
      properties: { text: 'free', matchType: 'BROAD' },
    },
    {
      kind: 'negative',
      path: 'search-pdf-renaming/neg:cheap:EXACT',
      properties: { text: 'cheap', matchType: 'EXACT' },
    },
  ]
}

function makeDriveCampaignResources(): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'search-google-drive',
      properties: {
        name: 'Search - Google Drive',
        status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-clicks' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US', 'DE'] },
            { type: 'language', languages: ['en'] },
          ],
        },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-google-drive/drive-core',
      properties: {
        status: 'enabled',
        targeting: undefined,
      },
    },
    {
      kind: 'keyword',
      path: 'search-google-drive/drive-core/kw:rename google drive files:PHRASE',
      properties: { text: 'rename google drive files', matchType: 'PHRASE' },
    },
    {
      kind: 'ad',
      path: 'search-google-drive/drive-core/rsa:def456',
      properties: {
        headlines: ['Google Drive Renamer', 'Organize Drive Files', 'AI File Manager'],
        descriptions: ['Rename Google Drive files with AI.', 'Smart file organization.'],
        finalUrl: 'https://www.renamed.to/google-drive',
      },
    },
    {
      kind: 'negative',
      path: 'search-google-drive/neg:free:BROAD',
      properties: { text: 'free', matchType: 'BROAD' },
    },
    {
      kind: 'negative',
      path: 'search-google-drive/neg:cheap:EXACT',
      properties: { text: 'cheap', matchType: 'EXACT' },
    },
    {
      kind: 'negative',
      path: 'search-google-drive/neg:download:BROAD',
      properties: { text: 'download', matchType: 'BROAD' },
    },
  ]
}

function makeDropboxCampaignResources(): Resource[] {
  return [
    {
      kind: 'campaign',
      path: 'search-dropbox',
      properties: {
        name: 'Search - Dropbox',
        status: 'enabled',
        budget: { amount: 3, currency: 'USD', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US'] },
            { type: 'language', languages: ['en'] },
          ],
        },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-dropbox/dropbox-core',
      properties: {
        status: 'enabled',
        targeting: undefined,
      },
    },
    {
      kind: 'keyword',
      path: 'search-dropbox/dropbox-core/kw:rename dropbox files:EXACT',
      properties: { text: 'rename dropbox files', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-dropbox/dropbox-core/rsa:ghi789',
      properties: {
        headlines: ['Dropbox File Renamer', 'Organize Dropbox', 'AI Renaming Tool'],
        descriptions: ['Rename Dropbox files with AI.', 'Smart naming automation.'],
        finalUrl: 'https://www.renamed.to/dropbox',
      },
    },
    {
      kind: 'negative',
      path: 'search-dropbox/neg:free:BROAD',
      properties: { text: 'free', matchType: 'BROAD' },
    },
    {
      kind: 'negative',
      path: 'search-dropbox/neg:cheap:EXACT',
      properties: { text: 'cheap', matchType: 'EXACT' },
    },
    {
      kind: 'negative',
      path: 'search-dropbox/neg:download:BROAD',
      properties: { text: 'download', matchType: 'BROAD' },
    },
  ]
}

// ─── campaignToFilename ──────────────────────────────────

describe('campaignToFilename()', () => {
  test('converts campaign name to valid slug', () => {
    expect(campaignToFilename('Search - PDF Renaming')).toBe('search-pdf-renaming')
  })

  test('handles special characters', () => {
    expect(campaignToFilename('Google Drive (EN)')).toBe('google-drive-en')
  })

  test('handles simple names', () => {
    expect(campaignToFilename('Dropbox')).toBe('dropbox')
  })
})

// ─── generateCampaignFile ────────────────────────────────

describe('generateCampaignFile()', () => {
  const resources = makePdfCampaignResources()
  const output = generateCampaignFile(resources, 'Search - PDF Renaming')

  test('includes header comment with date', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(output).toContain(`// Imported from Google Ads on ${today}`)
  })

  test('imports from @upspawn/ads', () => {
    expect(output).toContain(`from '@upspawn/ads'`)
  })

  test('uses google.search() builder', () => {
    expect(output).toContain(`google.search('Search - PDF Renaming'`)
  })

  test('generates daily() budget helper', () => {
    expect(output).toContain('daily(8)')
  })

  test('generates bidding strategy string', () => {
    expect(output).toContain(`'maximize-conversions'`)
  })

  test('generates targeting with geo and languages', () => {
    expect(output).toContain(`targeting(`)
    expect(output).toContain(`geo('US', 'DE')`)
    expect(output).toContain(`languages('en')`)
  })

  test('generates exact() keywords', () => {
    expect(output).toContain('exact(')
  })

  test('generates rsa() with headlines and descriptions', () => {
    expect(output).toContain('rsa(')
    expect(output).toContain('headlines(')
    expect(output).toContain('descriptions(')
  })

  test('generates url() for final URL', () => {
    expect(output).toContain(`url('https://www.renamed.to/pdf-renamer')`)
  })

  test('generates .group() chain', () => {
    expect(output).toContain(`.group('en'`)
  })

  test('generates negatives in config', () => {
    expect(output).toContain('negatives:')
    expect(output).toContain(`broad('free')`)
    expect(output).toContain(`exact('cheap')`)
  })

  test('exports default', () => {
    expect(output).toContain('export default google.search')
  })
})

describe('generateCampaignFile() with USD currency', () => {
  const resources = makeDropboxCampaignResources()
  const output = generateCampaignFile(resources, 'Search - Dropbox')

  test('generates daily() with USD currency', () => {
    expect(output).toContain(`daily(3, 'USD')`)
  })
})

describe('generateCampaignFile() with maximize-clicks', () => {
  const resources = makeDriveCampaignResources()
  const output = generateCampaignFile(resources, 'Search - Google Drive')

  test('generates maximize-clicks bidding', () => {
    expect(output).toContain(`'maximize-clicks'`)
  })

  test('generates phrase() keywords', () => {
    expect(output).toContain('phrase(')
  })
})

describe('generateCampaignFile() with sitelinks and callouts', () => {
  const resources: Resource[] = [
    {
      kind: 'campaign',
      path: 'search-exact',
      properties: {
        name: 'Search - Exact Match',
        status: 'enabled',
        budget: { amount: 20, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-exact/core',
      properties: { status: 'enabled', targeting: undefined },
    },
    {
      kind: 'keyword',
      path: 'search-exact/core/kw:rename files:EXACT',
      properties: { text: 'rename files', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-exact/core/rsa:xyz',
      properties: {
        headlines: ['Rename Files Fast', 'AI File Renamer', 'Try Free'],
        descriptions: ['Smart file renaming.', 'Works with any format.'],
        finalUrl: 'https://www.renamed.to',
      },
    },
    {
      kind: 'sitelink',
      path: 'search-exact/sl:pricing',
      properties: {
        text: 'Pricing',
        url: 'https://www.renamed.to/pricing',
        description1: 'See our plans',
      },
    },
    {
      kind: 'sitelink',
      path: 'search-exact/sl:features',
      properties: {
        text: 'Features',
        url: 'https://www.renamed.to/features',
      },
    },
    {
      kind: 'callout',
      path: 'search-exact/co:free trial',
      properties: { text: 'Free Trial' },
    },
    {
      kind: 'callout',
      path: 'search-exact/co:24/7 support',
      properties: { text: '24/7 Support' },
    },
  ]

  const output = generateCampaignFile(resources, 'Search - Exact Match')

  test('generates .sitelinks() chain', () => {
    expect(output).toContain('.sitelinks(')
    expect(output).toContain(`link('Pricing'`)
    expect(output).toContain(`link('Features'`)
  })

  test('generates sitelink with descriptions', () => {
    expect(output).toContain(`description1: 'See our plans'`)
  })

  test('generates .callouts() chain', () => {
    expect(output).toContain(`.callouts('Free Trial', '24/7 Support')`)
  })
})

describe('generateCampaignFile() with group-level targeting', () => {
  const resources: Resource[] = [
    {
      kind: 'campaign',
      path: 'search-intl',
      properties: {
        name: 'Search - International',
        status: 'enabled',
        budget: { amount: 15, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: { rules: [] },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-intl/en-us',
      properties: {
        status: 'enabled',
        targeting: {
          rules: [
            { type: 'geo', countries: ['US'] },
            { type: 'language', languages: ['en'] },
          ],
        },
      },
    },
    {
      kind: 'keyword',
      path: 'search-intl/en-us/kw:rename files:EXACT',
      properties: { text: 'rename files', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-intl/en-us/rsa:xyz',
      properties: {
        headlines: ['Rename Files', 'AI Renamer', 'Try Free'],
        descriptions: ['Smart renaming.', 'Works with any file.'],
        finalUrl: 'https://www.renamed.to',
      },
    },
  ]

  const output = generateCampaignFile(resources, 'Search - International')

  test('uses .locale() instead of .group() when targeting is present', () => {
    expect(output).toContain(`.locale('en-us'`)
    expect(output).toContain(`targeting(`)
  })
})

describe('generateCampaignFile() with empty campaign', () => {
  const resources: Resource[] = [
    {
      kind: 'campaign',
      path: 'empty-campaign',
      properties: {
        name: 'Empty Campaign',
        status: 'paused',
        budget: { amount: 10, currency: 'EUR', period: 'monthly' },
        bidding: { type: 'manual-cpc' },
        targeting: { rules: [] },
      },
    },
  ]

  const output = generateCampaignFile(resources, 'Empty Campaign')

  test('generates monthly() budget', () => {
    expect(output).toContain('monthly(10)')
  })

  test('generates manual-cpc bidding', () => {
    expect(output).toContain(`'manual-cpc'`)
  })

  test('still produces valid structure', () => {
    expect(output).toContain('export default google.search')
    expect(output).toContain(`from '@upspawn/ads'`)
  })
})

describe('generateCampaignFile() with schedule targeting', () => {
  const resources: Resource[] = [
    {
      kind: 'campaign',
      path: 'search-scheduled',
      properties: {
        name: 'Search - Scheduled',
        status: 'enabled',
        budget: { amount: 10, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US', 'DE'] },
            { type: 'language', languages: ['en'] },
            { type: 'schedule', days: ['mon', 'tue', 'wed', 'thu', 'fri'], startHour: 8, endHour: 20 },
          ],
        },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-scheduled/core',
      properties: { status: 'enabled', targeting: undefined },
    },
    {
      kind: 'keyword',
      path: 'search-scheduled/core/kw:test:EXACT',
      properties: { text: 'test', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-scheduled/core/rsa:xyz',
      properties: {
        headlines: ['Test Ad', 'Test Ad 2', 'Test Ad 3'],
        descriptions: ['Desc 1', 'Desc 2'],
        finalUrl: 'https://www.renamed.to',
      },
    },
  ]

  const output = generateCampaignFile(resources, 'Search - Scheduled')

  test('generates weekdays() for M-F schedule', () => {
    expect(output).toContain('weekdays()')
  })

  test('generates hours() for start/end times', () => {
    expect(output).toContain('hours(8, 20)')
  })

  test('imports weekdays and hours helpers', () => {
    expect(output).toContain('weekdays')
    expect(output).toContain('hours')
  })
})

// ─── extractSharedConfig ─────────────────────────────────

describe('extractSharedConfig()', () => {
  test('returns empty strings for single campaign', () => {
    const result = extractSharedConfig([makePdfCampaignResources()])
    expect(result.targeting).toBe('')
    expect(result.negatives).toBe('')
  })

  test('finds shared targeting across 2 campaigns', () => {
    const pdf = makePdfCampaignResources()
    const drive = makeDriveCampaignResources()
    // Both have { geo: [US, DE], language: [en] }
    const result = extractSharedConfig([pdf, drive])

    expect(result.targeting).toContain(`from '@upspawn/ads'`)
    expect(result.targeting).toContain('targeting(')
    expect(result.targeting).toContain('geo(')
    expect(result.targeting).toContain('languages(')
    expect(result.targeting).toContain('export const shared')
  })

  test('does NOT find shared targeting when targeting differs', () => {
    const pdf = makePdfCampaignResources()
    const dropbox = makeDropboxCampaignResources()
    // PDF has [US, DE], Dropbox has [US] only
    const result = extractSharedConfig([pdf, dropbox])
    expect(result.targeting).toBe('')
  })

  test('finds shared negatives when 3+ match across 2 campaigns', () => {
    const drive = makeDriveCampaignResources()
    const dropbox = makeDropboxCampaignResources()
    // Both have: free, cheap, download (3 shared)
    const result = extractSharedConfig([drive, dropbox])

    expect(result.negatives).toContain(`from '@upspawn/ads'`)
    expect(result.negatives).toContain('negatives(')
    expect(result.negatives).toContain(`'cheap'`)
    expect(result.negatives).toContain(`'download'`)
    expect(result.negatives).toContain(`'free'`)
    expect(result.negatives).toContain('export const shared')
  })

  test('does NOT generate shared negatives when fewer than 3 overlap', () => {
    const pdf = makePdfCampaignResources() // has: free, cheap (2 negatives)
    const drive = makeDriveCampaignResources() // has: free, cheap, download

    // Only "free" and "cheap" overlap = 2 (below threshold of 3)
    const result = extractSharedConfig([pdf, drive])
    // PDF only has 2 negatives, both overlap, but total overlap = 2 < 3
    expect(result.negatives).toBe('')
  })

  test('works with 3 campaigns', () => {
    const pdf = makePdfCampaignResources()
    const drive = makeDriveCampaignResources()
    const dropbox = makeDropboxCampaignResources()

    const result = extractSharedConfig([pdf, drive, dropbox])
    // "free" and "cheap" appear in all 3 campaigns
    // "download" appears in 2 (drive + dropbox)
    // That's 3 negatives appearing in 2+ campaigns
    expect(result.negatives).toContain('negatives(')
  })
})

// ─── Network Settings ────────────────────────────────────

describe('generateCampaignFile() with networkSettings', () => {
  test('emits networkSettings block when present', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'search-network-test',
        properties: {
          name: 'Search - Network Test',
          status: 'enabled',
          budget: { amount: 5, currency: 'EUR', period: 'daily' },
          bidding: { type: 'maximize-conversions' },
          targeting: { rules: [{ type: 'geo', countries: ['US'] }] },
          networkSettings: {
            searchNetwork: true,
            searchPartners: false,
            displayNetwork: false,
          },
        },
      },
      {
        kind: 'adGroup',
        path: 'search-network-test/core',
        properties: { status: 'enabled', targeting: undefined },
      },
      {
        kind: 'keyword',
        path: 'search-network-test/core/kw:test:EXACT',
        properties: { text: 'test', matchType: 'EXACT' },
      },
      {
        kind: 'ad',
        path: 'search-network-test/core/rsa:xyz',
        properties: {
          headlines: ['Test', 'Test 2', 'Test 3'],
          descriptions: ['Desc 1', 'Desc 2'],
          finalUrl: 'https://www.renamed.to',
        },
      },
    ]

    const output = generateCampaignFile(resources, 'Search - Network Test')
    expect(output).toContain('networkSettings: {')
    expect(output).toContain('searchNetwork: true')
    expect(output).toContain('searchPartners: false')
    expect(output).toContain('displayNetwork: false')
  })

  test('omits networkSettings when not present', () => {
    const resources = makePdfCampaignResources()
    const output = generateCampaignFile(resources, 'Search - PDF Renaming')
    expect(output).not.toContain('networkSettings')
  })
})

// ─── Device Targeting ────────────────────────────────────

describe('generateCampaignFile() with device targeting', () => {
  const resources: Resource[] = [
    {
      kind: 'campaign',
      path: 'search-device-test',
      properties: {
        name: 'Search - Device Test',
        status: 'enabled',
        budget: { amount: 5, currency: 'EUR', period: 'daily' },
        bidding: { type: 'maximize-conversions' },
        targeting: {
          rules: [
            { type: 'geo', countries: ['US'] },
            { type: 'language', languages: ['en'] },
            { type: 'device', device: 'mobile', bidAdjustment: -0.25 },
          ],
        },
      },
    },
    {
      kind: 'adGroup',
      path: 'search-device-test/core',
      properties: { status: 'enabled', targeting: undefined },
    },
    {
      kind: 'keyword',
      path: 'search-device-test/core/kw:test:EXACT',
      properties: { text: 'test', matchType: 'EXACT' },
    },
    {
      kind: 'ad',
      path: 'search-device-test/core/rsa:xyz',
      properties: {
        headlines: ['Test', 'Test 2', 'Test 3'],
        descriptions: ['Desc 1', 'Desc 2'],
        finalUrl: 'https://www.renamed.to',
      },
    },
  ]

  const output = generateCampaignFile(resources, 'Search - Device Test')

  test('emits device() in targeting', () => {
    expect(output).toContain("device('mobile', -0.25)")
  })

  test('adds device to imports', () => {
    expect(output).toContain('device')
    // Verify it appears in the import statement
    expect(output).toMatch(/import \{[^}]*device[^}]*\} from '@upspawn\/ads'/)
  })
})

// ─── Missing Bidding Strategies ──────────────────────────

describe('generateCampaignFile() bidding strategies', () => {
  function makeMinimalCampaign(
    biddingConfig: Record<string, unknown>,
  ): Resource[] {
    return [
      {
        kind: 'campaign',
        path: 'search-bidding-test',
        properties: {
          name: 'Search - Bidding Test',
          status: 'enabled',
          budget: { amount: 10, currency: 'EUR', period: 'daily' },
          bidding: biddingConfig,
          targeting: { rules: [] },
        },
      },
      {
        kind: 'adGroup',
        path: 'search-bidding-test/core',
        properties: { status: 'enabled', targeting: undefined },
      },
      {
        kind: 'keyword',
        path: 'search-bidding-test/core/kw:test:EXACT',
        properties: { text: 'test', matchType: 'EXACT' },
      },
      {
        kind: 'ad',
        path: 'search-bidding-test/core/rsa:xyz',
        properties: {
          headlines: ['Test', 'Test 2', 'Test 3'],
          descriptions: ['Desc 1', 'Desc 2'],
          finalUrl: 'https://www.renamed.to',
        },
      },
    ]
  }

  test('emits target-roas with targetRoas value', () => {
    const resources = makeMinimalCampaign({ type: 'target-roas', targetRoas: 3.5 })
    const output = generateCampaignFile(resources, 'Search - Bidding Test')
    expect(output).toContain("type: 'target-roas'")
    expect(output).toContain('targetRoas: 3.5')
  })

  test('emits target-impression-share with all fields', () => {
    const resources = makeMinimalCampaign({
      type: 'target-impression-share',
      location: 'TOP_OF_PAGE',
      targetPercent: 0.8,
      maxCpc: 2.5,
    })
    const output = generateCampaignFile(resources, 'Search - Bidding Test')
    expect(output).toContain("type: 'target-impression-share'")
    expect(output).toContain("location: 'TOP_OF_PAGE'")
    expect(output).toContain('targetPercent: 0.8')
    expect(output).toContain('maxCpc: 2.5')
  })

  test('emits maximize-conversion-value with targetRoas', () => {
    const resources = makeMinimalCampaign({
      type: 'maximize-conversion-value',
      targetRoas: 4.0,
    })
    const output = generateCampaignFile(resources, 'Search - Bidding Test')
    expect(output).toContain("type: 'maximize-conversion-value'")
    expect(output).toContain('targetRoas: 4')
  })

  test('emits maximize-conversion-value shorthand without targetRoas', () => {
    const resources = makeMinimalCampaign({ type: 'maximize-conversion-value' })
    const output = generateCampaignFile(resources, 'Search - Bidding Test')
    expect(output).toContain("'maximize-conversion-value'")
    // Should NOT contain the object form
    expect(output).not.toContain("type: 'maximize-conversion-value'")
  })
})

// ─── Campaign Status and Tracking ────────────────────────

describe('generateCampaignFile — campaign status and tracking', () => {
  function campaignWith(extra: Record<string, unknown>): Resource[] {
    return [{
      kind: 'campaign' as const, path: 'test',
      properties: { name: 'Test', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' }, ...extra },
    }]
  }

  test('emits status: paused', () => {
    const r = [{ ...campaignWith({})[0]!, properties: { ...campaignWith({})[0]!.properties, status: 'paused' } }]
    expect(generateCampaignFile(r, 'Test')).toContain("status: 'paused'")
  })

  test('omits status when enabled', () => {
    expect(generateCampaignFile(campaignWith({}), 'Test')).not.toMatch(/status:/)
  })

  test('emits startDate and endDate', () => {
    const code = generateCampaignFile(campaignWith({ startDate: '2026-04-01', endDate: '2026-04-30' }), 'Test')
    expect(code).toContain("startDate: '2026-04-01'")
    expect(code).toContain("endDate: '2026-04-30'")
  })

  test('emits trackingTemplate', () => {
    const code = generateCampaignFile(campaignWith({ trackingTemplate: '{lpurl}?utm=google' }), 'Test')
    expect(code).toContain('trackingTemplate:')
  })

  test('emits finalUrlSuffix', () => {
    const code = generateCampaignFile(campaignWith({ finalUrlSuffix: 'utm_medium=cpc' }), 'Test')
    expect(code).toContain("finalUrlSuffix: 'utm_medium=cpc'")
  })

  test('emits customParameters', () => {
    const code = generateCampaignFile(campaignWith({ customParameters: { campaign: 'test' } }), 'Test')
    expect(code).toContain('customParameters:')
    expect(code).toContain("campaign: 'test'")
  })
})

// ─── Keyword Options ────────────────────────────────────

describe('generateCampaignFile — keyword options', () => {
  test('emits keyword with bid as object form', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT', bid: 1.5 } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain('bid: 1.5')
    expect(code).toContain("text: 'rename pdf'")
  })

  test('uses string form when no keyword options', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain("'rename pdf'")
    expect(code).not.toContain('bid:')
  })

  test('emits keyword finalUrl in object form', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT', finalUrl: 'https://renamed.to/pdf' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain("finalUrl: 'https://renamed.to/pdf'")
  })

  test('emits paused keyword status in object form', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT', status: 'paused' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain("status: 'paused'")
    expect(code).toContain("text: 'rename pdf'")
  })
})

// ─── Ad Completeness ────────────────────────────────────

describe('generateCampaignFile — ad completeness', () => {
  test('emits multiple ads with ad: [rsa(...), rsa(...)]', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'c/g/rsa:aaa', properties: { headlines: ['H1', 'H2', 'H3'], descriptions: ['D1', 'D2'], finalUrl: 'https://renamed.to' } },
      { kind: 'ad', path: 'c/g/rsa:bbb', properties: { headlines: ['H4', 'H5', 'H6'], descriptions: ['D3', 'D4'], finalUrl: 'https://renamed.to/2' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain('ad: [')
    expect((code.match(/rsa\(/g) || []).length).toBe(2)
  })

  test('emits path1 and path2', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'c/g/rsa:aaa', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to', path1: 'rename', path2: 'files' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain("path1: 'rename'")
    expect(code).toContain("path2: 'files'")
  })

  test('emits ad status when paused', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'c/g/rsa:aaa', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to', status: 'paused' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain("status: 'paused'")
  })

  test('single ad does not use array form', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'ad', path: 'c/g/rsa:aaa', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    expect(code).toContain('ad: rsa(')
    expect(code).not.toContain('ad: [')
  })
})

// ─── Ad Group Negatives ────────────────────────────────

describe('generateCampaignFile — ad group negatives', () => {
  test('emits negatives inside group when ad-group-level negatives exist', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
      // Ad group negative
      { kind: 'negative', path: 'c/g/neg:free:BROAD', properties: { text: 'free', matchType: 'BROAD' } },
      // Campaign-level negative (should NOT appear in group)
      { kind: 'negative', path: 'c/neg:cheap:EXACT', properties: { text: 'cheap', matchType: 'EXACT' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    // Group should have negatives
    expect(code).toContain('.group(')
    // Extract the group body to check negatives appear inside it
    const groupMatch = code.match(/\.group\([^,]+,\s*\{([\s\S]*?)\}\)/s)
    expect(groupMatch).toBeTruthy()
    const groupBody = groupMatch![1]!
    expect(groupBody).toContain('negatives:')
  })

  test('does not put ad-group negatives in campaign-level negatives', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
      // Only ad group negative, no campaign negative
      { kind: 'negative', path: 'c/g/neg:free:BROAD', properties: { text: 'free', matchType: 'BROAD' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    // Campaign config (before .group()) should NOT have negatives
    const configSection = code.split('.group(')[0]!
    expect(configSection).not.toContain('negatives:')
  })

  test('campaign negatives still appear at config level', () => {
    const resources: Resource[] = [
      { kind: 'campaign', path: 'c', properties: { name: 'C', status: 'enabled', budget: { amount: 5, currency: 'EUR', period: 'daily' }, bidding: { type: 'maximize-conversions' } } },
      { kind: 'adGroup', path: 'c/g', properties: { status: 'enabled' } },
      { kind: 'keyword', path: 'c/g/kw:rename pdf:EXACT', properties: { text: 'rename pdf', matchType: 'EXACT' } },
      { kind: 'ad', path: 'c/g/rsa:abc', properties: { headlines: ['H1'], descriptions: ['D1'], finalUrl: 'https://renamed.to' } },
      // Ad group negative
      { kind: 'negative', path: 'c/g/neg:free:BROAD', properties: { text: 'free', matchType: 'BROAD' } },
      // Campaign-level negative
      { kind: 'negative', path: 'c/neg:cheap:EXACT', properties: { text: 'cheap', matchType: 'EXACT' } },
    ]
    const code = generateCampaignFile(resources, 'C')
    // Campaign config should have 'cheap' but not 'free'
    const configSection = code.split('.group(')[0]!
    expect(configSection).toContain('negatives:')
    expect(configSection).toContain("'cheap'")
    expect(configSection).not.toContain("'free'")
  })
})

// ─── Snapshot Tests ──────────────────────────────────────

describe('generateCampaignFile() snapshot', () => {
  test('PDF campaign matches snapshot', () => {
    const resources = makePdfCampaignResources()
    const output = generateCampaignFile(resources, 'Search - PDF Renaming')
    expect(output).toMatchSnapshot()
  })

  test('Drive campaign matches snapshot', () => {
    const resources = makeDriveCampaignResources()
    const output = generateCampaignFile(resources, 'Search - Google Drive')
    expect(output).toMatchSnapshot()
  })
})
