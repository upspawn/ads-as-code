import { describe, expect, test, beforeEach, afterEach, mock, jest } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock the AI SDK before importing the module under test
const mockGenerateObject = mock(() =>
  Promise.resolve({
    object: {
      headlines: ['Rename Files Fast', 'Batch Renamer', 'Easy Rename Tool'],
      descriptions: [
        'Rename thousands of files in seconds.',
        'Professional file renaming for devs.',
      ],
    },
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
)

// We need to mock the 'ai' module
import { generateSlot, generateForCampaign } from '../../src/ai/generate.ts'
import { rsaSchema, keywordsSchema } from '../../src/ai/schemas.ts'
import { readLockFile, writeLockFile } from '../../src/ai/lockfile.ts'
import type { LockFile, LockSlot } from '../../src/ai/lockfile.ts'
import type { LanguageModel } from 'ai'

// ─── Fixtures ───────────────────────────────────────────────────────

/** Stub LanguageModel — generateSlot passes it through to generateObject */
const stubModel = { modelId: 'test-model', provider: 'test' } as unknown as LanguageModel

function makeLockFile(overrides?: Partial<LockFile>): LockFile {
  return {
    version: 1,
    model: 'test-model',
    generatedAt: '2026-03-15T12:00:00Z',
    slots: {},
    ...overrides,
  }
}

function makeSlot(overrides?: Partial<LockSlot>): LockSlot {
  return {
    prompt: 'generate headlines',
    result: { headlines: ['H1', 'H2', 'H3'], descriptions: ['D1', 'D2'] },
    pinned: [],
    round: 1,
    ...overrides,
  }
}

// ─── generateSlot ──────────────────────────────────────────────────

describe('generateSlot()', () => {
  beforeEach(() => {
    mockGenerateObject.mockClear()
  })

  test('calls generateObject with compiled prompt and schema', async () => {
    const result = await generateSlot({
      model: stubModel,
      prompt: 'Generate RSA headlines.',
      schema: rsaSchema,
      generateObjectFn: mockGenerateObject as any,
    })

    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
    const call = mockGenerateObject.mock.calls[0] as unknown as [{ prompt: string }]
    expect(call[0]).toMatchObject({
      prompt: 'Generate RSA headlines.',
    })
    expect(result.object).toBeDefined()
    expect(result.usage.promptTokens).toBe(100)
    expect(result.usage.completionTokens).toBe(50)
  })

  test('retries on failure with exponential backoff', async () => {
    let callCount = 0
    const flakyGenerate = mock(async () => {
      callCount++
      if (callCount < 3) {
        throw new Error('Rate limited')
      }
      return {
        object: { headlines: ['H1', 'H2', 'H3'], descriptions: ['D1', 'D2'] },
        usage: { promptTokens: 50, completionTokens: 25 },
      }
    })

    const result = await generateSlot({
      model: stubModel,
      prompt: 'Generate RSA.',
      schema: rsaSchema,
      generateObjectFn: flakyGenerate as any,
      retryDelays: [0, 0, 0], // No actual delay in tests
    })

    expect(flakyGenerate).toHaveBeenCalledTimes(3)
    expect(result.object).toBeDefined()
  })

  test('throws after max retries exhausted', async () => {
    const alwaysFails = mock(async () => {
      throw new Error('Permanent failure')
    })

    await expect(
      generateSlot({
        model: stubModel,
        prompt: 'Generate RSA.',
        schema: rsaSchema,
        generateObjectFn: alwaysFails as any,
        retryDelays: [0, 0, 0],
      }),
    ).rejects.toThrow('Permanent failure')

    // initial + 3 retries = 4 total calls
    expect(alwaysFails).toHaveBeenCalledTimes(4)
  })

  test('includes pinned values instruction when pinned items provided', async () => {
    await generateSlot({
      model: stubModel,
      prompt: 'Generate RSA.',
      schema: rsaSchema,
      generateObjectFn: mockGenerateObject as any,
      pinnedInstruction: 'Keep these headlines exactly: "Rename Files Fast" (index 0)',
    })

    const call = mockGenerateObject.mock.calls[0] as unknown as [{ prompt: string }]
    expect(call[0].prompt).toContain('Keep these headlines exactly')
  })

  test('tracks token usage correctly', async () => {
    const result = await generateSlot({
      model: stubModel,
      prompt: 'test',
      schema: rsaSchema,
      generateObjectFn: mockGenerateObject as any,
    })

    expect(result.usage.promptTokens).toBe(100)
    expect(result.usage.completionTokens).toBe(50)
  })
})

// ─── generateForCampaign ───────────────────────────────────────────

describe('generateForCampaign()', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ads-gen-'))
    mockGenerateObject.mockClear()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('processes RSA markers and writes lock file', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    // Create empty campaign file so the lockfile companion works
    await writeFile(campaignPath, '')

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test Campaign',
      groups: {
        main: {
          keywords: [{ text: 'test keyword', matchType: 'EXACT' as const }],
          ads: [
            {
              __brand: 'ai-marker' as const,
              type: 'rsa' as const,
              prompt: 'Generate headlines for testing.',
            },
          ],
        },
      },
    }

    const result = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject as any,
      retryDelays: [0],
    })

    expect(result.slotsGenerated).toBe(1)
    expect(result.slotsSkipped).toBe(0)
    expect(result.totalInputTokens).toBeGreaterThan(0)
    expect(result.totalOutputTokens).toBeGreaterThan(0)

    // Verify lock file was written
    const lockFile = await readLockFile(campaignPath)
    expect(lockFile).not.toBeNull()
    expect(lockFile!.slots['main.ad']).toBeDefined()
  })

  test('skips already-locked slots unless reroll flag set', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    // Pre-seed a lock file
    await writeLockFile(campaignPath, makeLockFile({
      slots: {
        'main.ad': makeSlot(),
      },
    }))

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test',
      groups: {
        main: {
          keywords: [{ text: 'test', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'Generate headlines.',
          }],
        },
      },
    }

    // Without reroll — should skip
    const result = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject as any,
    })

    expect(result.slotsGenerated).toBe(0)
    expect(result.slotsSkipped).toBe(1)
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  test('regenerates locked slot when reroll matches', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    await writeLockFile(campaignPath, makeLockFile({
      slots: {
        'main.ad': makeSlot(),
      },
    }))

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test',
      groups: {
        main: {
          keywords: [{ text: 'test', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'Generate headlines.',
          }],
        },
      },
    }

    const result = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      reroll: 'main.ad',
      generateObjectFn: mockGenerateObject as any,
      retryDelays: [0],
    })

    expect(result.slotsGenerated).toBe(1)
    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
  })

  test('pinned values survive regeneration', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    // Lock file with pinned headline at index 0
    await writeLockFile(campaignPath, makeLockFile({
      slots: {
        'main.ad': makeSlot({
          result: { headlines: ['Pinned H', 'H2', 'H3'], descriptions: ['D1', 'D2'] },
          pinned: [0],
        }),
      },
    }))

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test',
      groups: {
        main: {
          keywords: [{ text: 'test', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'Generate headlines.',
          }],
        },
      },
    }

    await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      reroll: 'main.ad',
      generateObjectFn: mockGenerateObject as any,
      retryDelays: [0],
    })

    // The prompt should have contained pinning instructions
    const call = mockGenerateObject.mock.calls[0] as unknown as [{ prompt: string }]
    expect(call[0].prompt).toContain('Pinned H')
  })

  test('processes keywords markers', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    const kwGenerateObject = mock(() =>
      Promise.resolve({
        object: {
          keywords: [
            { text: 'rename files', match: 'exact' },
            { text: 'batch rename', match: 'broad' },
          ],
        },
        usage: { promptTokens: 80, completionTokens: 30 },
      }),
    )

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test',
      groups: {
        main: {
          keywords: [{
            __brand: 'ai-marker' as const,
            type: 'keywords' as const,
            prompt: 'Find keywords for rename tool.',
          }],
          ads: [{ type: 'rsa' as const, headlines: ['H1'] as any, descriptions: ['D1'] as any, finalUrl: 'https://example.com' }],
        },
      },
    }

    const result = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: kwGenerateObject as any,
      retryDelays: [0],
    })

    expect(result.slotsGenerated).toBe(1)
    expect(kwGenerateObject).toHaveBeenCalledTimes(1)
  })

  test('network errors are caught and propagated (no partial writes)', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    const failingGenerate = mock(async () => {
      throw new Error('Network timeout')
    })

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Test',
      groups: {
        main: {
          keywords: [{ text: 'test', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'Generate headlines.',
          }],
        },
      },
    }

    await expect(
      generateForCampaign({
        campaignPath,
        campaign,
        aiConfig: { model: stubModel },
        generateObjectFn: failingGenerate as any,
        retryDelays: [0, 0, 0],
      }),
    ).rejects.toThrow('Network timeout')

    // No partial lock file should be written
    const lockFile = await readLockFile(campaignPath)
    expect(lockFile).toBeNull()
  })

  test('handles campaign with multiple groups', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    await writeFile(campaignPath, '')

    const campaign = {
      provider: 'google' as const,
      kind: 'search' as const,
      name: 'Multi Group',
      groups: {
        'en-us': {
          keywords: [{ text: 'rename', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'English headlines.',
          }],
        },
        'de': {
          keywords: [{ text: 'umbenennen', matchType: 'EXACT' as const }],
          ads: [{
            __brand: 'ai-marker' as const,
            type: 'rsa' as const,
            prompt: 'German headlines.',
          }],
        },
      },
    }

    const result = await generateForCampaign({
      campaignPath,
      campaign,
      aiConfig: { model: stubModel },
      generateObjectFn: mockGenerateObject as any,
      retryDelays: [0],
    })

    expect(result.slotsGenerated).toBe(2)
    expect(mockGenerateObject).toHaveBeenCalledTimes(2)
  })
})
