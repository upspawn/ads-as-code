import type { ExactKeyword, PhraseKeyword, BroadKeyword, Keyword } from '../core/types.ts'

/**
 * Create exact-match keywords from one or more text strings.
 *
 * Each text is trimmed and tagged with `matchType: 'EXACT'`.
 *
 * @param texts - Keyword texts to wrap as exact match
 * @returns Array of exact-match keyword objects
 *
 * @example
 * ```ts
 * exact('rename files', 'batch rename')
 * // [{ text: 'rename files', matchType: 'EXACT' }, { text: 'batch rename', matchType: 'EXACT' }]
 * ```
 */
export function exact(...texts: string[]): ExactKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'EXACT' as const }))
}

/**
 * Create phrase-match keywords from one or more text strings.
 *
 * Each text is trimmed and tagged with `matchType: 'PHRASE'`.
 *
 * @param texts - Keyword texts to wrap as phrase match
 * @returns Array of phrase-match keyword objects
 *
 * @example
 * ```ts
 * phrase('file renaming tool', 'rename pdf')
 * // [{ text: 'file renaming tool', matchType: 'PHRASE' }, { text: 'rename pdf', matchType: 'PHRASE' }]
 * ```
 */
export function phrase(...texts: string[]): PhraseKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'PHRASE' as const }))
}

/**
 * Create broad-match keywords from one or more text strings.
 *
 * Each text is trimmed and tagged with `matchType: 'BROAD'`.
 *
 * @param texts - Keyword texts to wrap as broad match
 * @returns Array of broad-match keyword objects
 *
 * @example
 * ```ts
 * broad('file organization', 'document management')
 * // [{ text: 'file organization', matchType: 'BROAD' }, { text: 'document management', matchType: 'BROAD' }]
 * ```
 */
export function broad(...texts: string[]): BroadKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'BROAD' as const }))
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
