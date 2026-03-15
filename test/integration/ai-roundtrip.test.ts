/**
 * End-to-end round-trip integration test for the AI generation pipeline.
 *
 * Proves the full flow: markers -> generate -> lock -> resolve -> flatten
 * without any real AI calls (uses a mock generateObjectFn).
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LanguageModel } from 'ai'

import { generateForCampaign } from '../../src/ai/generate.ts'
import type { GenerateObjectFn } from '../../src/ai/generate.ts'
import { readLockFile } from '../../src/ai/lockfile.ts'
import { resolveMarkers } from '../../src/ai/resolve.ts'
import { flatten } from '../../src/google/flatten.ts'
import type { Keyword } from '../../src/core/types.ts'
import type { GoogleSearchCampaignUnresolved } from '../../src/google/types.ts'

// === Fixtures ===

const stubModel = { modelId: 'test-model', provider: 'test' } as unknown as LanguageModel

/** Mock AI response for RSA generation */
const rsaResponse = {
  headlines: ['Buy Acme Today', 'Best Acme Product', 'Try Acme Free'],
  descriptions: ['Premium quality products for professionals.', 'Start your free trial now.'],
}

/** Mock AI response for keyword generation */
const keywordsResponse = {
  keywords: [
    { text: 'acme product', match: 'exact' },
    { text: 'best acme deals', match: 'phrase' },
    { text: 'acme reviews', match: 'broad' },
  ],
}

/**
 * Mock generateObject that returns RSA or keyword results based on schema shape.
 *
 * Differentiates by checking for "RSA ad copy constraints" in the prompt
 * (appended by compileRsaPrompt) vs "Google Ads keyword generation guidance"
 * (appended by compileKeywordsPrompt). These are always present because
 * the prompt compiler appends constraint blocks.
 */
const mockGenerateObject: GenerateObjectFn = async (opts) => {
  const isRsa = opts.prompt.includes('RSA ad copy constraints')
  return {
    object: isRsa ? rsaResponse : keywordsResponse,
    usage: { promptTokens: 100, completionTokens: 50 },
  }
}

/** Build a campaign with both RSA and keyword markers. */
function makeTestCampaign(): GoogleSearchCampaignUnresolved {
  return {
    provider: 'google',
    kind: 'search',
    name: 'Acme Search',
    status: 'enabled',
    budget: { amount: 50, currency: 'USD', period: 'daily' },
    bidding: { type: 'maximize-conversions' },
    targeting: { rules: [] },
    negatives: [],
    groups: {
      main: {
        keywords: [
          { text: 'acme', matchType: 'EXACT' } as Keyword,
          Object.freeze({
            __brand: 'ai-marker' as const,
            type: 'keywords' as const,
            prompt: 'Generate keyword variations for acme products',
          }),
        ],
        ads: [
          Object.freeze({
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'Generate RSA ads for Acme premium product line',
          }),
        ],
      },
    },
  }
}

// === Integration Test ===

describe('AI round-trip: markers -> generate -> lock -> resolve -> flatten', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ads-roundtrip-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('full pipeline produces valid flattened resources', async () => {
    const campaignPath = join(tempDir, 'acme.ts')
    await writeFile(campaignPath, '') // Placeholder file for lock file companion

    const campaign = makeTestCampaign()

    // Step 1: Generate — calls mock AI and writes .gen.json
    const genResult = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject,
      retryDelays: [0],
    })

    expect(genResult.slotsGenerated).toBe(2) // RSA + keywords
    expect(genResult.slotsSkipped).toBe(0)
    expect(genResult.totalInputTokens).toBeGreaterThan(0)
    expect(genResult.totalOutputTokens).toBeGreaterThan(0)

    // Step 2: Verify lock file was written with expected structure
    const lockFile = await readLockFile(campaignPath)
    expect(lockFile).not.toBeNull()
    expect(lockFile!.version).toBe(1)
    expect(lockFile!.model).toBe('test-model')
    expect(lockFile!.slots['main.ad']).toBeDefined()
    expect(lockFile!.slots['main.keywords']).toBeDefined()

    // RSA slot has headlines and descriptions
    const rsaSlot = lockFile!.slots['main.ad']!
    expect(rsaSlot.result).toHaveProperty('headlines')
    expect(rsaSlot.result).toHaveProperty('descriptions')
    expect(rsaSlot.round).toBe(1)

    // Keywords slot has keywords array
    const kwSlot = lockFile!.slots['main.keywords']!
    expect(kwSlot.result).toHaveProperty('keywords')
    expect(kwSlot.round).toBe(1)

    // Step 3: Resolve markers using the lock file
    const resolved = resolveMarkers(campaign, lockFile!, 'https://acme.com')

    // Verify resolved campaign has concrete values (no markers)
    const group = resolved.groups['main']!

    // RSA ad resolved
    expect(group.ads).toHaveLength(1)
    const ad = group.ads[0]!
    expect(ad.type).toBe('rsa')
    expect('headlines' in ad && Array.isArray(ad.headlines)).toBe(true)
    expect('descriptions' in ad && Array.isArray(ad.descriptions)).toBe(true)

    // Keywords resolved: 1 concrete + 3 generated
    expect(group.keywords).toHaveLength(4)
    expect(group.keywords[0]!.text).toBe('acme') // Original concrete
    expect(group.keywords[1]!.text).toBe('acme product') // Generated
    expect(group.keywords[2]!.text).toBe('best acme deals')
    expect(group.keywords[3]!.text).toBe('acme reviews')

    // Match types mapped correctly from lowercase to uppercase
    expect(group.keywords[1]!.matchType).toBe('EXACT')
    expect(group.keywords[2]!.matchType).toBe('PHRASE')
    expect(group.keywords[3]!.matchType).toBe('BROAD')

    // Step 4: Flatten resolved campaign — proves no errors from flatten
    const resources = flatten(resolved)
    expect(resources.length).toBeGreaterThan(0)

    // Verify resource kinds
    const campaignResources = resources.filter((r) => r.kind === 'campaign')
    expect(campaignResources).toHaveLength(1)

    const adGroupResources = resources.filter((r) => r.kind === 'adGroup')
    expect(adGroupResources).toHaveLength(1)

    const adResources = resources.filter((r) => r.kind === 'ad')
    expect(adResources).toHaveLength(1)

    const kwResources = resources.filter((r) => r.kind === 'keyword')
    expect(kwResources).toHaveLength(4) // 1 concrete + 3 generated

    // Verify ad resource properties
    const adResource = adResources[0]!
    expect(adResource.properties.finalUrl).toBe('https://acme.com')
    expect(Array.isArray(adResource.properties.headlines)).toBe(true)
    expect(Array.isArray(adResource.properties.descriptions)).toBe(true)
  })

  test('second generate skips already-locked slots', async () => {
    const campaignPath = join(tempDir, 'acme-skip.ts')
    await writeFile(campaignPath, '')

    const campaign = makeTestCampaign()

    // First generation
    await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject,
      retryDelays: [0],
    })

    // Second generation — should skip all slots
    const secondResult = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject,
      retryDelays: [0],
    })

    expect(secondResult.slotsGenerated).toBe(0)
    expect(secondResult.slotsSkipped).toBe(2)
  })

  test('reroll regenerates a specific slot while keeping others', async () => {
    const campaignPath = join(tempDir, 'acme-reroll.ts')
    await writeFile(campaignPath, '')

    const campaign = makeTestCampaign()

    // First generation
    await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject,
      retryDelays: [0],
    })

    // Reroll only the RSA slot
    const rerollResult = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      reroll: 'main.ad',
      generateObjectFn: mockGenerateObject,
      retryDelays: [0],
    })

    expect(rerollResult.slotsGenerated).toBe(1) // Only RSA regenerated
    expect(rerollResult.slotsSkipped).toBe(1) // Keywords skipped

    // Lock file should have round 2 for RSA, round 1 for keywords
    const lockFile = await readLockFile(campaignPath)
    expect(lockFile!.slots['main.ad']!.round).toBe(2)
    expect(lockFile!.slots['main.keywords']!.round).toBe(1)
  })
})
