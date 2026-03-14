import type { Headline, Description } from '../core/types.ts'
import type { RSAd } from '../google/types.ts'

const HEADLINE_MAX = 30
const DESCRIPTION_MAX = 90

/** Create validated headlines (max 30 chars each) */
export function headlines(...texts: string[]): Headline[] {
  return texts.map(text => {
    if (text.length > HEADLINE_MAX) {
      throw new Error(
        `Headline "${text}" exceeds ${HEADLINE_MAX} chars (got ${text.length})`
      )
    }
    return text as Headline
  })
}

/** Create validated descriptions (max 90 chars each) */
export function descriptions(...texts: string[]): Description[] {
  return texts.map(text => {
    if (text.length > DESCRIPTION_MAX) {
      throw new Error(
        `Description "${text}" exceeds ${DESCRIPTION_MAX} chars (got ${text.length})`
      )
    }
    return text as Description
  })
}

/** Create a Responsive Search Ad */
export function rsa(
  headlineList: Headline[],
  descriptionList: Description[],
  urlResult: { finalUrl: string; utm?: RSAd['utm'] },
): RSAd {
  if (headlineList.length < 3) {
    throw new Error(`RSA requires at least 3 headlines, got ${headlineList.length}`)
  }
  if (headlineList.length > 15) {
    throw new Error(`RSA allows at most 15 headlines, got ${headlineList.length}`)
  }
  if (descriptionList.length < 2) {
    throw new Error(`RSA requires at least 2 descriptions, got ${descriptionList.length}`)
  }
  if (descriptionList.length > 4) {
    throw new Error(`RSA allows at most 4 descriptions, got ${descriptionList.length}`)
  }
  return {
    type: 'rsa' as const,
    headlines: headlineList,
    descriptions: descriptionList,
    finalUrl: urlResult.finalUrl,
    ...(urlResult.utm ? { utm: urlResult.utm } : {}),
  }
}
