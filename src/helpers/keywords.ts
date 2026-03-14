import type { ExactKeyword, PhraseKeyword, BroadKeyword, Keyword } from '../core/types.ts'

/** Create exact-match keywords */
export function exact(...texts: string[]): ExactKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'EXACT' as const }))
}

/** Create phrase-match keywords */
export function phrase(...texts: string[]): PhraseKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'PHRASE' as const }))
}

/** Create broad-match keywords */
export function broad(...texts: string[]): BroadKeyword[] {
  return texts.map(text => ({ text: text.trim(), matchType: 'BROAD' as const }))
}

/**
 * Parse keywords using bracket notation:
 *   [text] → exact match
 *   "text" → phrase match
 *   text   → broad match
 *
 * Accepts multiple arguments or a single template literal string with newline-separated entries.
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
