// === AI Output Schemas ===
// Zod schemas that validate LLM-generated output before it enters the campaign tree.

import { z } from 'zod'

// ─── Google RSA ────────────────────────────────────────────

export const rsaSchema = z.object({
  headlines: z.array(z.string().max(30)).min(3).max(15),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
})

export type RsaOutput = z.infer<typeof rsaSchema>

// ─── Google Keywords ───────────────────────────────────────

export const keywordsSchema = z.object({
  keywords: z.array(z.object({
    text: z.string(),
    matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  })),
})

export type KeywordsOutput = z.infer<typeof keywordsSchema>

// ─── Meta Copy ─────────────────────────────────────────────

export const metaCopySchema = z.object({
  primaryText: z.string().max(125),
  headline: z.string().max(40),
  description: z.string().max(30).optional(),
})

export type MetaCopyOutput = z.infer<typeof metaCopySchema>

// ─── Meta Interests ────────────────────────────────────────

export const interestsSchema = z.object({
  interests: z.array(z.object({
    name: z.string(),
  })),
})

export type InterestsOutput = z.infer<typeof interestsSchema>
