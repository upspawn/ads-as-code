import type { CalloutText } from '../core/types.ts'
import type { Sitelink } from '../google/types.ts'

const SITELINK_TEXT_MAX = 25
const SITELINK_DESC_MAX = 35
const CALLOUT_MAX = 25

/** Create a sitelink extension */
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

/** Create multiple sitelinks */
export function sitelinks(...links: Sitelink[]): Sitelink[] {
  return links
}

/** Create validated callout extensions (max 25 chars each) */
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
