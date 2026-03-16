import { describe, expect, test } from 'bun:test'
import {
  resolveMetaMarkers,
  checkMetaStaleness,
  isMetaCopyMarker,
  isInterestsMarker,
  compileMetaCopyPrompt,
  compileInterestsPrompt,
} from '../../src/ai/resolve-meta.ts'
import type { MetaCopyMarker, InterestsMarker } from '../../src/ai/resolve-meta.ts'
import { generateExpandedMetaCode } from '../../src/ai/codegen-meta.ts'
import type { ExpandedMetaCampaignData } from '../../src/ai/codegen-meta.ts'
import {
  buildMetaOptimizePrompt,
  buildMetaCrossAnalysisPrompt,
  parseMetaOptimizeResponse,
  formatMetaSuggestions,
} from '../../src/ai/optimize-meta.ts'
import type { MetaCampaign, MetaAdSet } from '../../src/meta/index.ts'
import type { LockFile, LockSlot } from '../../src/ai/lockfile.ts'
import type { ImageAd, MetaCreative, MetaTargeting } from '../../src/meta/types.ts'

// ─── Test Fixtures ──────────────────────────────────────

function makeLockFile(slots: Record<string, LockSlot>): LockFile {
  return {
    version: 1,
    model: 'gpt-4',
    generatedAt: '2026-03-15T00:00:00Z',
    slots,
  }
}

function makeLockSlot(prompt: string, result: Record<string, unknown>): LockSlot {
  return {
    prompt,
    result,
    pinned: [],
    round: 1,
  }
}

function makeMetaCopyMarker(prompt: string, extras?: Partial<MetaCopyMarker>): MetaCopyMarker {
  return {
    __brand: 'ai-marker',
    type: 'meta-copy',
    prompt,
    ...extras,
  }
}

function makeInterestsMarker(prompt: string): InterestsMarker {
  return {
    __brand: 'ai-marker',
    type: 'interests',
    prompt,
  }
}

function makeImageAd(overrides?: Partial<ImageAd>): ImageAd {
  return {
    format: 'image',
    image: './hero.png',
    headline: 'Test Headline',
    primaryText: 'Test primary text',
    ...overrides,
  }
}

function makeTargeting(overrides?: Partial<MetaTargeting>): MetaTargeting {
  return {
    geo: [{ type: 'geo', countries: ['US'] }],
    ...overrides,
  }
}

function makeCampaign(overrides?: {
  ads?: readonly MetaCreative[]
  targeting?: MetaTargeting
  adSets?: readonly MetaAdSet<'traffic'>[]
}): MetaCampaign<'traffic'> {
  const adSets = overrides?.adSets ?? [{
    name: 'Test Ad Set',
    config: {
      targeting: overrides?.targeting ?? makeTargeting(),
    },
    content: {
      ads: overrides?.ads ?? [makeImageAd()],
    },
  }]

  return {
    provider: 'meta',
    kind: 'traffic',
    name: 'Test Campaign',
    config: { budget: { amount: 10, currency: 'EUR', period: 'daily' } },
    adSets,
  }
}

// ─── Type Guards ────────────────────────────────────────

describe('isMetaCopyMarker', () => {
  test('returns true for valid MetaCopyMarker', () => {
    expect(isMetaCopyMarker(makeMetaCopyMarker('test'))).toBe(true)
  })

  test('returns false for regular creative', () => {
    expect(isMetaCopyMarker(makeImageAd())).toBe(false)
  })

  test('returns false for null/undefined/non-object', () => {
    expect(isMetaCopyMarker(null)).toBe(false)
    expect(isMetaCopyMarker(undefined)).toBe(false)
    expect(isMetaCopyMarker('string')).toBe(false)
    expect(isMetaCopyMarker(42)).toBe(false)
  })

  test('returns false for other marker types', () => {
    expect(isMetaCopyMarker(makeInterestsMarker('test'))).toBe(false)
    expect(isMetaCopyMarker({ __brand: 'ai-marker', type: 'rsa', prompt: 'test' })).toBe(false)
  })
})

describe('isInterestsMarker', () => {
  test('returns true for valid InterestsMarker', () => {
    expect(isInterestsMarker(makeInterestsMarker('test'))).toBe(true)
  })

  test('returns false for regular object', () => {
    expect(isInterestsMarker({ id: '123', name: 'Construction' })).toBe(false)
  })

  test('returns false for MetaCopyMarker', () => {
    expect(isInterestsMarker(makeMetaCopyMarker('test'))).toBe(false)
  })
})

// ─── resolveMetaMarkers ─────────────────────────────────

describe('resolveMetaMarkers', () => {
  test('passes through campaign with no markers', () => {
    const campaign = makeCampaign({ ads: [makeImageAd()] })
    const result = resolveMetaMarkers(campaign, null)

    expect(result.name).toBe('Test Campaign')
    expect(result.adSets.length).toBe(1)
    const ads = result.adSets[0]!.content.ads
    expect(ads.length).toBe(1)
    expect(ads[0]!.format).toBe('image')
    expect((ads[0] as ImageAd).headline).toBe('Test Headline')
  })

  test('resolves MetaCopyMarker in image creative', () => {
    const marker = {
      ...makeMetaCopyMarker('Generate copy for Renamed.to'),
      format: 'image',
      image: './hero.png',
    }

    const campaign = makeCampaign({ ads: [marker as any] })

    const lockFile = makeLockFile({
      '0.copy.0': makeLockSlot('compiled prompt', {
        headline: 'AI File Renaming',
        primaryText: 'Stop wasting hours renaming files manually.',
        description: 'Try it free today',
      }),
    })

    const result = resolveMetaMarkers(campaign, lockFile)
    const resolved = result.adSets[0]!.content.ads[0] as ImageAd

    expect(resolved.format).toBe('image')
    expect(resolved.image).toBe('./hero.png')
    expect(resolved.headline).toBe('AI File Renaming')
    expect(resolved.primaryText).toBe('Stop wasting hours renaming files manually.')
    expect(resolved.description).toBe('Try it free today')
  })

  test('resolves MetaCopyMarker in video creative', () => {
    const marker = {
      ...makeMetaCopyMarker('Generate video copy'),
      format: 'video',
      video: './demo.mp4',
      thumbnail: './thumb.png',
    }

    const campaign = makeCampaign({ ads: [marker as any] })

    const lockFile = makeLockFile({
      '0.copy.0': makeLockSlot('compiled prompt', {
        headline: 'See It in Action',
        primaryText: 'Watch our demo to learn more.',
      }),
    })

    const result = resolveMetaMarkers(campaign, lockFile)
    const resolved = result.adSets[0]!.content.ads[0]! as unknown as Record<string, unknown>

    expect(resolved.format).toBe('video')
    expect(resolved.headline).toBe('See It in Action')
    expect(resolved.primaryText).toBe('Watch our demo to learn more.')
  })

  test('resolves InterestsMarker in targeting', () => {
    const interestsMarker = makeInterestsMarker('Find interests for file management tool')

    const targeting = makeTargeting({
      interests: [interestsMarker as any],
    })

    const campaign = makeCampaign({ targeting })

    const lockFile = makeLockFile({
      '0.interests': makeLockSlot('compiled prompt', {
        interests: [
          { id: '6003370250981', name: 'File management' },
          { id: '6003370250982', name: 'Productivity' },
        ],
      }),
    })

    const result = resolveMetaMarkers(campaign, lockFile)
    const resolvedInterests = result.adSets[0]!.config.targeting.interests!

    expect(resolvedInterests.length).toBe(2)
    expect(resolvedInterests[0]!.id).toBe('6003370250981')
    expect(resolvedInterests[0]!.name).toBe('File management')
    expect(resolvedInterests[1]!.id).toBe('6003370250982')
    expect(resolvedInterests[1]!.name).toBe('Productivity')
  })

  test('preserves concrete interests alongside resolved markers', () => {
    const concrete = { id: '123', name: 'Existing Interest' }
    const marker = makeInterestsMarker('Find more interests')

    const targeting = makeTargeting({
      interests: [concrete, marker as any],
    })

    const campaign = makeCampaign({ targeting })

    const lockFile = makeLockFile({
      '0.interests': makeLockSlot('compiled prompt', {
        interests: [{ id: '456', name: 'New Interest' }],
      }),
    })

    const result = resolveMetaMarkers(campaign, lockFile)
    const resolvedInterests = result.adSets[0]!.config.targeting.interests!

    expect(resolvedInterests.length).toBe(2)
    expect(resolvedInterests[0]!.name).toBe('Existing Interest')
    expect(resolvedInterests[1]!.name).toBe('New Interest')
  })

  test('throws for missing copy lock slot', () => {
    const marker = {
      ...makeMetaCopyMarker('Generate copy'),
      format: 'image',
      image: './hero.png',
    }

    const campaign = makeCampaign({ ads: [marker as any] })

    expect(() => resolveMetaMarkers(campaign, null)).toThrow(
      'Unresolved AI marker in Test Campaign/0.copy.0',
    )
  })

  test('throws for missing interests lock slot', () => {
    const marker = makeInterestsMarker('Find interests')

    const targeting = makeTargeting({
      interests: [marker as any],
    })

    const campaign = makeCampaign({ targeting })

    expect(() => resolveMetaMarkers(campaign, null)).toThrow(
      'Unresolved AI marker in Test Campaign/0.interests',
    )
  })

  test('handles multiple ad sets with different markers', () => {
    const adSets: MetaAdSet<'traffic'>[] = [
      {
        name: 'Ad Set 1',
        config: { targeting: makeTargeting() },
        content: {
          ads: [{
            ...makeMetaCopyMarker('Copy for ad set 1'),
            format: 'image',
            image: './hero1.png',
          } as any],
        },
      },
      {
        name: 'Ad Set 2',
        config: { targeting: makeTargeting() },
        content: {
          ads: [{
            ...makeMetaCopyMarker('Copy for ad set 2'),
            format: 'image',
            image: './hero2.png',
          } as any],
        },
      },
    ]

    const campaign = makeCampaign({ adSets })

    const lockFile = makeLockFile({
      '0.copy.0': makeLockSlot('prompt 1', {
        headline: 'Headline 1',
        primaryText: 'Text 1',
      }),
      '1.copy.0': makeLockSlot('prompt 2', {
        headline: 'Headline 2',
        primaryText: 'Text 2',
      }),
    })

    const result = resolveMetaMarkers(campaign, lockFile)

    expect((result.adSets[0]!.content.ads[0] as ImageAd).headline).toBe('Headline 1')
    expect((result.adSets[1]!.content.ads[0] as ImageAd).headline).toBe('Headline 2')
  })
})

// ─── checkMetaStaleness ─────────────────────────────────

describe('checkMetaStaleness', () => {
  test('returns empty for campaign with no markers', () => {
    const campaign = makeCampaign()
    const lockFile = makeLockFile({})

    expect(checkMetaStaleness(campaign, lockFile)).toEqual([])
  })

  test('returns empty when lock file is null', () => {
    const campaign = makeCampaign()
    expect(checkMetaStaleness(campaign, null)).toEqual([])
  })

  test('detects stale copy prompt', () => {
    const marker = makeMetaCopyMarker('Original prompt')
    const campaign = makeCampaign({ ads: [marker as any] })

    // Compute the current prompt for the marker
    const currentPrompt = compileMetaCopyPrompt(marker, {
      campaignName: 'Test Campaign',
      adSetIndex: 0,
      adIndex: 0,
    })

    // Lock file has a different prompt
    const lockFile = makeLockFile({
      '0.copy.0': makeLockSlot('old different prompt', {
        headline: 'Old',
        primaryText: 'Old text',
      }),
    })

    const stale = checkMetaStaleness(campaign, lockFile)

    expect(stale.length).toBe(1)
    expect(stale[0]!.slot).toBe('0.copy.0')
    expect(stale[0]!.message).toContain('Prompt changed')
  })

  test('reports fresh when prompt matches', () => {
    const marker = makeMetaCopyMarker('Matching prompt')
    const campaign = makeCampaign({ ads: [marker as any] })

    const currentPrompt = compileMetaCopyPrompt(marker, {
      campaignName: 'Test Campaign',
      adSetIndex: 0,
      adIndex: 0,
    })

    const lockFile = makeLockFile({
      '0.copy.0': makeLockSlot(currentPrompt, {
        headline: 'Result',
        primaryText: 'Result text',
      }),
    })

    const stale = checkMetaStaleness(campaign, lockFile)
    expect(stale.length).toBe(0)
  })

  test('detects stale interests prompt', () => {
    const marker = makeInterestsMarker('Original interests prompt')
    const targeting = makeTargeting({ interests: [marker as any] })
    const campaign = makeCampaign({ targeting })

    const lockFile = makeLockFile({
      '0.interests': makeLockSlot('old interests prompt', {
        interests: [{ id: '1', name: 'old' }],
      }),
    })

    const stale = checkMetaStaleness(campaign, lockFile)

    expect(stale.length).toBe(1)
    expect(stale[0]!.slot).toBe('0.interests')
  })

  test('skips unresolved slots (no lock entry)', () => {
    const marker = makeMetaCopyMarker('Some prompt')
    const campaign = makeCampaign({ ads: [marker as any] })

    // Lock file exists but has no slot for this marker
    const lockFile = makeLockFile({})

    const stale = checkMetaStaleness(campaign, lockFile)
    expect(stale.length).toBe(0) // Unresolved, not stale
  })
})

// ─── generateExpandedMetaCode ───────────────────────────

describe('generateExpandedMetaCode', () => {
  const sampleData: ExpandedMetaCampaignData = {
    name: 'Renamed.to Traffic',
    objective: 'traffic',
    budget: { amount: 5, currency: 'EUR', period: 'daily' },
    adSets: [
      {
        name: 'US Desktop',
        targeting: {
          geo: ['US'],
          age: { min: 25, max: 55 },
        },
        ads: [
          {
            format: 'image',
            media: './hero.png',
            headline: 'Rename Files Instantly',
            primaryText: 'AI-powered file renaming for teams.',
            cta: 'LEARN_MORE',
            url: 'https://renamed.to',
          },
        ],
      },
    ],
  }

  test('produces valid TypeScript with meta.traffic()', () => {
    const code = generateExpandedMetaCode('seed', sampleData, '[DE]')

    expect(code).toContain("import {")
    expect(code).toContain("from '@upspawn/ads'")
    expect(code).toContain("meta.traffic('Renamed.to Traffic [DE]'")
    expect(code).toContain('.adSet(')
    expect(code).toContain('.build()')
  })

  test('includes budget helper import', () => {
    const code = generateExpandedMetaCode('seed', sampleData, '[v1]')
    expect(code).toContain('daily')
    expect(code).toContain('budget: daily(5)')
  })

  test('includes targeting with geo and age', () => {
    const code = generateExpandedMetaCode('seed', sampleData, '[v1]')
    expect(code).toContain('metaTargeting')
    expect(code).toContain("geo('US')")
    expect(code).toContain('age(25, 55)')
  })

  test('includes image creative with copy', () => {
    const code = generateExpandedMetaCode('seed', sampleData, '[v1]')
    expect(code).toContain('image(')
    expect(code).toContain("'./hero.png'")
    expect(code).toContain("headline: 'Rename Files Instantly'")
    expect(code).toContain("primaryText: 'AI-powered file renaming for teams.'")
  })

  test('handles video creatives', () => {
    const dataWithVideo: ExpandedMetaCampaignData = {
      ...sampleData,
      adSets: [{
        ...sampleData.adSets[0]!,
        ads: [{
          format: 'video',
          media: './demo.mp4',
          headline: 'Watch Demo',
          primaryText: 'See how it works.',
        }],
      }],
    }

    const code = generateExpandedMetaCode('seed', dataWithVideo, '[v1]')
    expect(code).toContain('video(')
    expect(code).toContain("'./demo.mp4'")
  })

  test('hoists shared URL to ad set content level', () => {
    const dataWithSharedUrl: ExpandedMetaCampaignData = {
      ...sampleData,
      adSets: [{
        ...sampleData.adSets[0]!,
        url: 'https://renamed.to',
        ads: [
          {
            format: 'image',
            media: './a.png',
            headline: 'H1',
            primaryText: 'T1',
            url: 'https://renamed.to',
          },
          {
            format: 'image',
            media: './b.png',
            headline: 'H2',
            primaryText: 'T2',
            url: 'https://renamed.to',
          },
        ],
      }],
    }

    const code = generateExpandedMetaCode('seed', dataWithSharedUrl, '[v1]')
    // The URL should be hoisted, appearing at ad set level
    expect(code).toContain("url: 'https://renamed.to'")
  })

  test('handles monthly budget', () => {
    const monthlyData: ExpandedMetaCampaignData = {
      ...sampleData,
      budget: { amount: 150, currency: 'EUR', period: 'monthly' },
    }

    const code = generateExpandedMetaCode('seed', monthlyData, '[v1]')
    expect(code).toContain('monthly')
    expect(code).toContain('monthly(150)')
  })

  test('handles non-EUR currency', () => {
    const usdData: ExpandedMetaCampaignData = {
      ...sampleData,
      budget: { amount: 10, currency: 'USD', period: 'daily' },
    }

    const code = generateExpandedMetaCode('seed', usdData, '[v1]')
    expect(code).toContain("daily(10, 'USD')")
  })

  test('maps objectives to correct method names', () => {
    const objectives = ['awareness', 'traffic', 'engagement', 'leads', 'sales', 'conversions', 'app-promotion']
    const methods = ['awareness', 'traffic', 'engagement', 'leads', 'sales', 'conversions', 'appPromotion']

    for (let i = 0; i < objectives.length; i++) {
      const data: ExpandedMetaCampaignData = { ...sampleData, objective: objectives[i]! }
      const code = generateExpandedMetaCode('seed', data, '[v1]')
      expect(code).toContain(`meta.${methods[i]}(`)
    }
  })

  test('includes interests when provided', () => {
    const dataWithInterests: ExpandedMetaCampaignData = {
      ...sampleData,
      adSets: [{
        ...sampleData.adSets[0]!,
        targeting: {
          geo: ['DE'],
          interests: [
            { id: '6003370250981', name: 'Construction' },
          ],
        },
      }],
    }

    const code = generateExpandedMetaCode('seed', dataWithInterests, '[v1]')
    expect(code).toContain('interests')
    expect(code).toContain("'Construction'")
    expect(code).toContain("'6003370250981'")
  })
})

// ─── buildMetaOptimizePrompt ────────────────────────────

describe('buildMetaOptimizePrompt', () => {
  const campaign: MetaCampaign = {
    provider: 'meta',
    kind: 'traffic',
    name: 'Traffic Campaign',
    config: { budget: { amount: 10, currency: 'EUR', period: 'daily' } },
    adSets: [
      {
        name: 'US Interest',
        config: {
          targeting: {
            geo: [{ type: 'geo', countries: ['US'] }],
            age: { min: 25, max: 55 },
            interests: [{ id: '123', name: 'Construction' }],
          },
        },
        content: {
          ads: [{
            format: 'image' as const,
            image: './hero.png',
            headline: 'Build Better',
            primaryText: 'Professional construction tools for modern builders.',
          }],
        },
      },
    ],
  }

  test('includes campaign data section', () => {
    const prompt = buildMetaOptimizePrompt([campaign])
    expect(prompt).toContain('=== Meta Campaign Data ===')
    expect(prompt).toContain('Traffic Campaign')
    expect(prompt).toContain('traffic')
  })

  test('includes targeting info', () => {
    const prompt = buildMetaOptimizePrompt([campaign])
    expect(prompt).toContain('US')
    expect(prompt).toContain('25-55')
    expect(prompt).toContain('Construction')
  })

  test('includes creative copy', () => {
    const prompt = buildMetaOptimizePrompt([campaign])
    expect(prompt).toContain('Build Better')
    expect(prompt).toContain('Professional construction tools')
  })

  test('includes analysis instructions', () => {
    const prompt = buildMetaOptimizePrompt([campaign])
    expect(prompt).toContain('=== Analysis Instructions ===')
    expect(prompt).toContain('Creative-to-audience alignment')
    expect(prompt).toContain('Audience overlap')
    expect(prompt).toContain('Creative fatigue risk')
    expect(prompt).toContain('Interest relevance')
  })

  test('includes custom prompt when provided', () => {
    const prompt = buildMetaOptimizePrompt([campaign], 'Focus on B2B angles')
    expect(prompt).toContain('=== Additional Instructions ===')
    expect(prompt).toContain('Focus on B2B angles')
  })

  test('includes config prompt when provided', () => {
    const prompt = buildMetaOptimizePrompt([campaign], undefined, 'Brand voice: professional')
    expect(prompt).toContain('=== Project Context ===')
    expect(prompt).toContain('Brand voice: professional')
  })

  test('includes budget info', () => {
    const prompt = buildMetaOptimizePrompt([campaign])
    expect(prompt).toContain('EUR 10/daily')
  })
})

// ─── buildMetaCrossAnalysisPrompt ───────────────────────

describe('buildMetaCrossAnalysisPrompt', () => {
  const campaigns: MetaCampaign[] = [
    {
      provider: 'meta',
      kind: 'traffic',
      name: 'Traffic DE',
      config: { budget: { amount: 10, currency: 'EUR', period: 'daily' } },
      adSets: [
        {
          name: 'Interest Set',
          config: {
            targeting: {
              geo: [{ type: 'geo', countries: ['DE'] }],
              interests: [{ id: '1', name: 'Construction' }],
            },
          },
          content: {
            ads: [{
              format: 'image' as const,
              image: './a.png',
              headline: 'H1',
              primaryText: 'T1',
            }],
          },
        },
      ],
    },
    {
      provider: 'meta',
      kind: 'awareness',
      name: 'Awareness DE',
      config: { budget: { amount: 5, currency: 'EUR', period: 'daily' } },
      adSets: [
        {
          name: 'Broad Set',
          config: {
            targeting: {
              geo: [{ type: 'geo', countries: ['DE'] }],
              interests: [{ id: '1', name: 'Construction' }, { id: '2', name: 'Building' }],
            },
          },
          content: {
            ads: [{
              format: 'image' as const,
              image: './b.png',
              headline: 'H2',
              primaryText: 'T2',
            }],
          },
        },
      ],
    },
  ]

  test('includes all campaigns', () => {
    const prompt = buildMetaCrossAnalysisPrompt(campaigns)
    expect(prompt).toContain('Traffic DE')
    expect(prompt).toContain('Awareness DE')
  })

  test('includes audience summary section for overlap check', () => {
    const prompt = buildMetaCrossAnalysisPrompt(campaigns)
    expect(prompt).toContain('=== Audience Summary (for overlap check) ===')
    expect(prompt).toContain('Construction')
    expect(prompt).toContain('Building')
  })

  test('includes cross-analysis instructions', () => {
    const prompt = buildMetaCrossAnalysisPrompt(campaigns)
    expect(prompt).toContain('Audience overlap')
    expect(prompt).toContain('Creative diversity')
    expect(prompt).toContain('Budget balance')
    expect(prompt).toContain('Objective coordination')
  })
})

// ─── parseMetaOptimizeResponse ──────────────────────────

describe('parseMetaOptimizeResponse', () => {
  test('parses standard suggestion types', () => {
    const text = `
[SUGGESTION]
type: copy-quality
campaign: Traffic Campaign
severity: warning
message: Headline is too generic
suggestion: Use specific product benefits
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(1)
    expect(suggestions[0]!.type).toBe('copy-quality')
    expect(suggestions[0]!.campaign).toBe('Traffic Campaign')
    expect(suggestions[0]!.severity).toBe('warning')
    expect(suggestions[0]!.message).toBe('Headline is too generic')
    expect(suggestions[0]!.suggestion).toBe('Use specific product benefits')
  })

  test('parses Meta-specific suggestion types', () => {
    const text = `
[SUGGESTION]
type: audience-overlap
campaign: Traffic DE
adSet: Interest Set A
severity: warning
message: Overlaps 70% with Interest Set B
[/SUGGESTION]

[SUGGESTION]
type: creative-fatigue
campaign: Traffic DE
adSet: Broad Set
severity: info
message: Only 1 creative in this ad set
suggestion: Add 2-3 more creative variants
[/SUGGESTION]

[SUGGESTION]
type: interest-relevance
campaign: Awareness
severity: info
message: Interest "Cooking" doesn't match construction product
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(3)
    expect(suggestions[0]!.type).toBe('audience-overlap')
    expect(suggestions[0]!.adSet).toBe('Interest Set A')
    expect(suggestions[1]!.type).toBe('creative-fatigue')
    expect(suggestions[2]!.type).toBe('interest-relevance')
  })

  test('skips invalid suggestion types', () => {
    const text = `
[SUGGESTION]
type: invalid-type
campaign: Test
severity: info
message: This should be skipped
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(0)
  })

  test('skips suggestions missing required fields', () => {
    const text = `
[SUGGESTION]
type: audience-overlap
severity: warning
message: No campaign field
[/SUGGESTION]

[SUGGESTION]
type: audience-overlap
campaign: Test
severity: warning
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(0)
  })

  test('parses multiple blocks in a row', () => {
    const text = `
Here is my analysis:

[SUGGESTION]
type: audience-alignment
campaign: Campaign A
severity: warning
message: Copy doesn't match targeting
[/SUGGESTION]

[SUGGESTION]
type: structure
campaign: Campaign A
severity: info
message: Consider splitting ad set by age
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(2)
  })

  test('accepts both adSet and group field names', () => {
    const text = `
[SUGGESTION]
type: creative-fatigue
campaign: Test
group: My Ad Set
severity: info
message: Only 1 creative
[/SUGGESTION]
    `

    const suggestions = parseMetaOptimizeResponse(text)
    expect(suggestions.length).toBe(1)
    expect(suggestions[0]!.adSet).toBe('My Ad Set')
  })
})

// ─── formatMetaSuggestions ──────────────────────────────

describe('formatMetaSuggestions', () => {
  test('returns empty string for no suggestions', () => {
    expect(formatMetaSuggestions([])).toBe('')
  })

  test('groups by campaign and type', () => {
    const suggestions = parseMetaOptimizeResponse(`
[SUGGESTION]
type: audience-overlap
campaign: Campaign A
severity: warning
message: Overlap detected
[/SUGGESTION]

[SUGGESTION]
type: creative-fatigue
campaign: Campaign A
severity: info
message: Add more creatives
[/SUGGESTION]
    `)

    const output = formatMetaSuggestions(suggestions)
    expect(output).toContain('Campaign A')
    expect(output).toContain('Audience Overlap')
    expect(output).toContain('Creative Fatigue Risk')
    expect(output).toContain('2 suggestions')
    expect(output).toContain('1 warning')
  })
})

// ─── Prompt Compilation ─────────────────────────────────

describe('compileMetaCopyPrompt', () => {
  test('includes user prompt', () => {
    const marker = makeMetaCopyMarker('Write copy for Renamed.to')
    const prompt = compileMetaCopyPrompt(marker, {})
    expect(prompt).toContain('Write copy for Renamed.to')
  })

  test('includes structured fields', () => {
    const marker = makeMetaCopyMarker('Generate copy', {
      structured: { product: 'Renamed.to', audience: 'Developers', tone: 'Professional' },
    })
    const prompt = compileMetaCopyPrompt(marker, {})
    expect(prompt).toContain('Product: Renamed.to')
    expect(prompt).toContain('Target audience: Developers')
    expect(prompt).toContain('Tone: Professional')
  })

  test('includes campaign context', () => {
    const marker = makeMetaCopyMarker('Generate copy')
    const prompt = compileMetaCopyPrompt(marker, {
      campaignName: 'Traffic DE',
      adSetIndex: 0,
      adIndex: 1,
    })
    expect(prompt).toContain('Campaign: Traffic DE')
    expect(prompt).toContain('Ad set index: 0')
    expect(prompt).toContain('Ad index: 1')
  })

  test('includes Meta copy constraints', () => {
    const marker = makeMetaCopyMarker('Generate copy')
    const prompt = compileMetaCopyPrompt(marker, {})
    expect(prompt).toContain('Primary text')
    expect(prompt).toContain('Headline')
    expect(prompt).toContain('Meta Ads creative copy constraints')
  })
})

describe('compileInterestsPrompt', () => {
  test('includes user prompt', () => {
    const marker = makeInterestsMarker('Find interests for construction pros')
    const prompt = compileInterestsPrompt(marker, {})
    expect(prompt).toContain('Find interests for construction pros')
  })

  test('includes campaign context', () => {
    const marker = makeInterestsMarker('Find interests')
    const prompt = compileInterestsPrompt(marker, {
      campaignName: 'Construction Campaign',
      adSetIndex: 2,
    })
    expect(prompt).toContain('Campaign: Construction Campaign')
    expect(prompt).toContain('Ad set index: 2')
  })

  test('includes interests constraints', () => {
    const marker = makeInterestsMarker('Find interests')
    const prompt = compileInterestsPrompt(marker, {})
    expect(prompt).toContain('Meta Ads targeting interests guidance')
    expect(prompt).toContain('interest targeting category')
  })
})
