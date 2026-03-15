import type { Keyword } from '../core/types.ts'

/**
 * Create negative keywords with BROAD match type. Deduplicates by lowercased text.
 *
 * @param texts - Keyword texts to exclude from targeting
 * @returns Deduplicated array of broad-match negative keywords
 *
 * @example
 * ```ts
 * negatives('free', 'open source', 'download')
 * // [
 * //   { text: 'free', matchType: 'BROAD' },
 * //   { text: 'open source', matchType: 'BROAD' },
 * //   { text: 'download', matchType: 'BROAD' },
 * // ]
 * ```
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
