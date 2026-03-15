import { z } from 'zod'

// === RSA Schema ===

/**
 * Validates AI-generated RSA (Responsive Search Ad) output.
 *
 * Google Ads constraints:
 * - 3-15 headlines, each max 30 characters
 * - 2-4 descriptions, each max 90 characters
 */
export const rsaSchema = z.object({
  headlines: z.array(z.string().max(30)).min(3).max(15),
  descriptions: z.array(z.string().max(90)).min(2).max(4),
})

export type RsaOutput = z.infer<typeof rsaSchema>

// === Keywords Schema ===

/**
 * Validates AI-generated keyword output.
 *
 * Each keyword has a text and a match type (exact/phrase/broad).
 */
export const keywordsSchema = z.object({
  keywords: z.array(
    z.object({
      text: z.string(),
      match: z.enum(['exact', 'phrase', 'broad']),
    }),
  ),
})

export type KeywordsOutput = z.infer<typeof keywordsSchema>
