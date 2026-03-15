import type { CalloutText } from '../core/types.ts'
import type { Sitelink } from '../google/types.ts'

const SITELINK_TEXT_MAX = 25
const SITELINK_DESC_MAX = 35
const CALLOUT_MAX = 25

/**
 * Create a sitelink extension with validated text lengths.
 *
 * @param text - Link text (max 25 characters)
 * @param url - Destination URL
 * @param options - Optional description lines for the sitelink
 * @param options.description1 - First description line (max 35 characters)
 * @param options.description2 - Second description line (max 35 characters)
 * @returns A sitelink extension object
 * @throws If text exceeds 25 chars or either description exceeds 35 chars
 *
 * @example
 * ```ts
 * link('Pricing', 'https://renamed.to/pricing')
 * link('How It Works', 'https://renamed.to/how-it-works', {
 *   description1: 'See the AI renaming engine in action',
 *   description2: 'Works with any file type',
 * })
 * ```
 */
export function link(
  text: string,
  url: string,
  options?: { description1?: string; description2?: string },
): Sitelink {
  if (text.length > SITELINK_TEXT_MAX) {
    throw new Error(
      `Sitelink text "${text}" exceeds ${SITELINK_TEXT_MAX} chars (got ${text.length})`
    )
  }
  if (options?.description1 && options.description1.length > SITELINK_DESC_MAX) {
    throw new Error(
      `Sitelink description1 "${options.description1}" exceeds ${SITELINK_DESC_MAX} chars (got ${options.description1.length})`
    )
  }
  if (options?.description2 && options.description2.length > SITELINK_DESC_MAX) {
    throw new Error(
      `Sitelink description2 "${options.description2}" exceeds ${SITELINK_DESC_MAX} chars (got ${options.description2.length})`
    )
  }
  return {
    text,
    url,
    ...(options?.description1 ? { description1: options.description1 } : {}),
    ...(options?.description2 ? { description2: options.description2 } : {}),
  }
}

/**
 * Bundle multiple sitelinks into an array. A pass-through helper for readability.
 *
 * @param links - Sitelink objects created with `link()`
 * @returns The same array of sitelinks
 *
 * @example
 * ```ts
 * sitelinks(
 *   link('Pricing', '/pricing'),
 *   link('Features', '/features'),
 *   link('Blog', '/blog'),
 * )
 * ```
 */
export function sitelinks(...links: Sitelink[]): Sitelink[] {
  return links
}

/**
 * Create validated callout extensions. Each callout must be 25 characters or fewer.
 *
 * @param texts - Callout strings to validate
 * @returns Array of branded CalloutText values
 * @throws If any callout exceeds 25 characters
 *
 * @example
 * ```ts
 * callouts('Free Trial', 'No Credit Card', 'AI-Powered')
 * ```
 */
export function callouts(...texts: string[]): CalloutText[] {
  return texts.map(text => {
    if (text.length > CALLOUT_MAX) {
      throw new Error(
        `Callout "${text}" exceeds ${CALLOUT_MAX} chars (got ${text.length})`
      )
    }
    return text as CalloutText
  })
}
