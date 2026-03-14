import type { Keyword } from '../core/types.ts'

/**
 * Create negative keywords (always broad match).
 * Deduplicates by lowercased text.
 */
export function negatives(...texts: string[]): Keyword[] {
  const seen = new Set<string>()
  const result: Keyword[] = []

  for (const text of texts) {
    const normalized = text.trim().toLowerCase()
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push({ text: text.trim(), matchType: 'BROAD' as const })
    }
  }

  return result
}
