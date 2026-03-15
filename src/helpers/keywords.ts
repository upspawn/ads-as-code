import type { ExactKeyword, PhraseKeyword, BroadKeyword, Keyword, KeywordInput } from '../core/types.ts'

/**
 * Create exact-match keywords from strings or keyword input objects.
 *
 * Each argument can be a plain string (trimmed) or an object with optional
 * `bid`, `finalUrl`, and `status` overrides.
 *
 * @param args - Keyword texts or input objects to wrap as exact match
 * @returns Array of exact-match keyword objects
 *
 * @example
 * ```ts
 * exact('rename files', 'batch rename')
 * exact({ text: 'rename files', bid: 1.50, finalUrl: 'https://...' })
 * exact('rename files', { text: 'batch rename', bid: 2.00 })
 * ```
 */
export function exact(...args: KeywordInput[]): ExactKeyword[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return { text: arg.trim(), matchType: 'EXACT' as const }
    }
    return {
      text: arg.text.trim(),
      matchType: 'EXACT' as const,
      ...(arg.bid !== undefined && { bid: arg.bid }),
      ...(arg.finalUrl !== undefined && { finalUrl: arg.finalUrl }),
      ...(arg.status !== undefined && { status: arg.status }),
    }
  })
}

/**
 * Create phrase-match keywords from strings or keyword input objects.
 *
 * Each argument can be a plain string (trimmed) or an object with optional
 * `bid`, `finalUrl`, and `status` overrides.
 *
 * @param args - Keyword texts or input objects to wrap as phrase match
 * @returns Array of phrase-match keyword objects
 *
 * @example
 * ```ts
 * phrase('file renaming tool', 'rename pdf')
 * phrase({ text: 'file renaming tool', bid: 1.00 })
 * ```
 */
export function phrase(...args: KeywordInput[]): PhraseKeyword[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return { text: arg.trim(), matchType: 'PHRASE' as const }
    }
    return {
      text: arg.text.trim(),
      matchType: 'PHRASE' as const,
      ...(arg.bid !== undefined && { bid: arg.bid }),
      ...(arg.finalUrl !== undefined && { finalUrl: arg.finalUrl }),
      ...(arg.status !== undefined && { status: arg.status }),
    }
  })
}

/**
 * Create broad-match keywords from strings or keyword input objects.
 *
 * Each argument can be a plain string (trimmed) or an object with optional
 * `bid`, `finalUrl`, and `status` overrides.
 *
 * @param args - Keyword texts or input objects to wrap as broad match
 * @returns Array of broad-match keyword objects
 *
 * @example
 * ```ts
 * broad('file organization', 'document management')
 * broad({ text: 'file organization', bid: 0.50 })
 * ```
 */
export function broad(...args: KeywordInput[]): BroadKeyword[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return { text: arg.trim(), matchType: 'BROAD' as const }
    }
    return {
      text: arg.text.trim(),
      matchType: 'BROAD' as const,
      ...(arg.bid !== undefined && { bid: arg.bid }),
      ...(arg.finalUrl !== undefined && { finalUrl: arg.finalUrl }),
      ...(arg.status !== undefined && { status: arg.status }),
    }
  })
}

/**
 * Parse keywords using bracket notation for match types.
 *
 * Notation:
 * - `[text]` — exact match
 * - `"text"` — phrase match
 * - `text` — broad match (default)
 *
 * Accepts multiple arguments (each parsed individually) or a single
 * template literal string with newline-separated entries.
 *
 * @param texts - Keyword strings in bracket notation
 * @returns Array of typed keyword objects
 *
 * @example
 * ```ts
 * keywords('[rename files]', '"file renaming tool"', 'document management')
 * // [
 * //   { text: 'rename files', matchType: 'EXACT' },
 * //   { text: 'file renaming tool', matchType: 'PHRASE' },
 * //   { text: 'document management', matchType: 'BROAD' },
 * // ]
 *
 * // Or as a template literal:
 * keywords(`
 *   [rename files]
 *   "file renaming tool"
 *   document management
 * `)
 * ```
 */
export function keywords(...texts: string[]): Keyword[] {
  const entries = texts.length === 1
    ? texts[0]!.split('\n').map(s => s.trim()).filter(Boolean)
    : texts.map(s => s.trim()).filter(Boolean)

  return entries.map(parseKeyword)
}

function parseKeyword(raw: string): Keyword {
  // [text] → exact
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return { text: raw.slice(1, -1).trim(), matchType: 'EXACT' as const }
  }
  // "text" → phrase
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return { text: raw.slice(1, -1).trim(), matchType: 'PHRASE' as const }
  }
  // bare text → broad
  return { text: raw.trim(), matchType: 'BROAD' as const }
}
