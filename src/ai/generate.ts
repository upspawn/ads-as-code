import type { LanguageModel } from 'ai'
import type { z } from 'zod'
import type { AiConfig } from './types.ts'
import type { Keyword } from '../core/types.ts'
import { isRsaMarker, isKeywordsMarker } from './types.ts'
import type { RsaMarker, KeywordsMarker } from './types.ts'
import { compileRsaPrompt, compileKeywordsPrompt, compileJudgePrompt } from './prompt.ts'
import type { PromptContext } from './prompt.ts'
import { rsaSchema, keywordsSchema } from './schemas.ts'
import { readLockFile, writeLockFile, getSlot, setSlot } from './lockfile.ts'
import type { LockFile, LockSlot } from './lockfile.ts'

// === Types ===

export type GenerateResult = {
  readonly slotsGenerated: number
  readonly slotsSkipped: number
  readonly totalInputTokens: number
  readonly totalOutputTokens: number
}

/** Signature matching Vercel AI SDK's generateObject */
type GenerateObjectFn = (opts: {
  model: LanguageModel
  prompt: string
  schema: z.ZodType
}) => Promise<{
  object: unknown
  usage: { promptTokens: number; completionTokens: number }
}>

export type GenerateSlotInput = {
  readonly model: LanguageModel
  readonly prompt: string
  readonly schema: z.ZodType
  readonly pinnedInstruction?: string
  /** Injected for testing; defaults to Vercel AI SDK's generateObject */
  readonly generateObjectFn?: GenerateObjectFn
  /** Retry delays in ms — [1000, 2000, 4000] in production, [0,0,0] in tests */
  readonly retryDelays?: number[]
}

export type GenerateForCampaignInput = {
  readonly campaignPath: string
  readonly campaign: CampaignLike
  readonly aiConfig: { model: LanguageModel; judge?: { prompt: string } }
  readonly reroll?: string
  /** Injected for testing */
  readonly generateObjectFn?: GenerateObjectFn
  readonly retryDelays?: number[]
}

// Minimal campaign shape — avoids coupling to the full GoogleSearchCampaign type
type CampaignLike = {
  readonly name: string
  readonly groups: Record<string, GroupLike>
}

type GroupLike = {
  readonly keywords: readonly (Keyword | KeywordsMarker | unknown)[]
  readonly ads: readonly (unknown)[]
  readonly negatives?: readonly Keyword[]
}

// === Default retry delays (exponential backoff) ===

const DEFAULT_RETRY_DELAYS = [1_000, 2_000, 4_000]

// === Helpers ===

/** Extract a human-readable model identifier from a LanguageModel (which may be a string or object). */
function getModelId(model: LanguageModel): string {
  if (typeof model === 'string') return model
  if (typeof model === 'object' && model !== null && 'modelId' in model) {
    return (model as { modelId: string }).modelId
  }
  return 'unknown'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Get the real AI SDK generateObject, lazily imported to keep tests from loading it. */
async function getDefaultGenerateObject(): Promise<GenerateObjectFn> {
  const { generateObject } = await import('ai')
  return generateObject as unknown as GenerateObjectFn
}

/** Build pinning instruction for a slot that has pinned values. */
function buildPinnedInstruction(slot: LockSlot): string | undefined {
  if (slot.pinned.length === 0) return undefined
  const result = slot.result as Record<string, unknown>

  const parts: string[] = []

  // For RSA results, pin headlines by index
  if (Array.isArray(result['headlines'])) {
    const headlines = result['headlines'] as string[]
    const pinnedH = slot.pinned
      .filter((i) => i < headlines.length)
      .map((i) => `"${headlines[i]}" (index ${i})`)
    if (pinnedH.length > 0) {
      parts.push(`Keep these headlines exactly: ${pinnedH.join(', ')}`)
    }
  }

  // For keyword results, pin by index
  if (Array.isArray(result['keywords'])) {
    const kws = result['keywords'] as Array<{ text: string }>
    const pinnedK = slot.pinned
      .filter((i) => i < kws.length)
      .map((i) => `"${kws[i]!.text}" (index ${i})`)
    if (pinnedK.length > 0) {
      parts.push(`Keep these keywords exactly: ${pinnedK.join(', ')}`)
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined
}

/** Extract regular keywords from a group's keywords array (filtering out markers). */
function extractKeywords(keywords: readonly unknown[]): Keyword[] {
  return keywords.filter(
    (kw): kw is Keyword =>
      typeof kw === 'object' &&
      kw !== null &&
      'matchType' in kw &&
      !isKeywordsMarker(kw),
  )
}

// === Public API ===

/**
 * Generate a single slot by calling the AI SDK with retry logic.
 *
 * Uses exponential backoff: attempt, then retry with delays [1s, 2s, 4s].
 * The initial attempt + 3 retries = 4 total tries before giving up.
 */
export async function generateSlot(input: GenerateSlotInput): Promise<{
  object: unknown
  usage: { promptTokens: number; completionTokens: number }
}> {
  const gen = input.generateObjectFn ?? (await getDefaultGenerateObject())
  const delays = input.retryDelays ?? DEFAULT_RETRY_DELAYS

  const fullPrompt = input.pinnedInstruction
    ? `${input.prompt}\n\n${input.pinnedInstruction}`
    : input.prompt

  let lastError: Error | undefined
  const maxAttempts = delays.length + 1 // initial + retries

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await gen({
        model: input.model,
        prompt: fullPrompt,
        schema: input.schema,
      })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < delays.length) {
        const delay = delays[attempt]!
        if (delay > 0) await sleep(delay)
      }
    }
  }

  throw lastError!
}

/**
 * Generate all AI markers in a single campaign.
 *
 * Walks groups, finds RSA and keyword markers, compiles prompts,
 * calls generateSlot, and writes the updated lock file.
 *
 * If any generation fails, the error propagates and no partial lock file is written.
 */
export async function generateForCampaign(input: GenerateForCampaignInput): Promise<GenerateResult> {
  const { campaignPath, campaign, aiConfig, reroll } = input

  // Read existing lock file (or start fresh)
  const existingLock = await readLockFile(campaignPath)
  let lockFile: LockFile = existingLock ?? {
    version: 1,
    model: getModelId(aiConfig.model),
    generatedAt: new Date().toISOString(),
    slots: {},
  }

  let slotsGenerated = 0
  let slotsSkipped = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Accumulate slot updates — only write at the end for atomicity
  const slotUpdates: Array<{ key: string; slot: LockSlot }> = []

  const defaultJudge = aiConfig.judge?.prompt

  for (const [groupKey, group] of Object.entries(campaign.groups)) {
    const regularKeywords = extractKeywords(group.keywords)

    const context: PromptContext = {
      campaignName: campaign.name,
      groupKey,
      keywords: regularKeywords.length > 0 ? regularKeywords : undefined,
      defaultJudge,
    }

    // Process RSA markers in ads
    for (const ad of group.ads) {
      if (!isRsaMarker(ad)) continue

      const slotKey = `${groupKey}.ad`
      const existingSlot = getSlot(lockFile, slotKey)

      // Skip if already locked and not rerolling this slot
      if (existingSlot && reroll !== slotKey) {
        slotsSkipped++
        continue
      }

      const prompt = compileRsaPrompt(ad, context)
      const pinnedInstruction = existingSlot ? buildPinnedInstruction(existingSlot) : undefined

      const result = await generateSlot({
        model: aiConfig.model,
        prompt,
        schema: rsaSchema,
        pinnedInstruction,
        generateObjectFn: input.generateObjectFn,
        retryDelays: input.retryDelays,
      })

      const judgePrompt = compileJudgePrompt(ad.judge, defaultJudge)

      slotUpdates.push({
        key: slotKey,
        slot: {
          prompt,
          ...(judgePrompt !== undefined && { judge: judgePrompt }),
          result: result.object as Record<string, unknown>,
          pinned: existingSlot?.pinned ?? [],
          round: (existingSlot?.round ?? 0) + 1,
        },
      })

      totalInputTokens += result.usage.promptTokens
      totalOutputTokens += result.usage.completionTokens
      slotsGenerated++
    }

    // Process keyword markers
    for (const kw of group.keywords) {
      if (!isKeywordsMarker(kw)) continue

      const slotKey = `${groupKey}.keywords`
      const existingSlot = getSlot(lockFile, slotKey)

      if (existingSlot && reroll !== slotKey) {
        slotsSkipped++
        continue
      }

      const prompt = compileKeywordsPrompt(kw, context)
      const pinnedInstruction = existingSlot ? buildPinnedInstruction(existingSlot) : undefined

      const result = await generateSlot({
        model: aiConfig.model,
        prompt,
        schema: keywordsSchema,
        pinnedInstruction,
        generateObjectFn: input.generateObjectFn,
        retryDelays: input.retryDelays,
      })

      slotUpdates.push({
        key: slotKey,
        slot: {
          prompt,
          result: result.object as Record<string, unknown>,
          pinned: existingSlot?.pinned ?? [],
          round: (existingSlot?.round ?? 0) + 1,
        },
      })

      totalInputTokens += result.usage.promptTokens
      totalOutputTokens += result.usage.completionTokens
      slotsGenerated++
    }
  }

  // All generations succeeded — apply updates atomically
  if (slotUpdates.length > 0) {
    for (const update of slotUpdates) {
      lockFile = setSlot(lockFile, update.key, update.slot)
    }

    // Update metadata
    lockFile = {
      ...lockFile,
      model: getModelId(aiConfig.model),
      generatedAt: new Date().toISOString(),
    }

    await writeLockFile(campaignPath, lockFile)
  }

  return {
    slotsGenerated,
    slotsSkipped,
    totalInputTokens,
    totalOutputTokens,
  }
}

/**
 * Generate for all campaigns discovered under a root directory.
 *
 * @param discoveredCampaigns — array of { file, campaign } pairs from discovery
 * @param aiConfig — AI configuration with model
 * @param options — reroll, generateObjectFn, retryDelays
 */
export async function generateAll(
  discoveredCampaigns: ReadonlyArray<{ file: string; campaign: CampaignLike }>,
  aiConfig: { model: LanguageModel; judge?: { prompt: string } },
  options?: {
    reroll?: string
    generateObjectFn?: GenerateObjectFn
    retryDelays?: number[]
  },
): Promise<GenerateResult> {
  let totalGenerated = 0
  let totalSkipped = 0
  let totalInput = 0
  let totalOutput = 0

  for (const { file, campaign } of discoveredCampaigns) {
    const result = await generateForCampaign({
      campaignPath: file,
      campaign,
      aiConfig,
      reroll: options?.reroll,
      generateObjectFn: options?.generateObjectFn,
      retryDelays: options?.retryDelays,
    })

    totalGenerated += result.slotsGenerated
    totalSkipped += result.slotsSkipped
    totalInput += result.totalInputTokens
    totalOutput += result.totalOutputTokens
  }

  return {
    slotsGenerated: totalGenerated,
    slotsSkipped: totalSkipped,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
  }
}
