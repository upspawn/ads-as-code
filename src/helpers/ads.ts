import type { Headline, Description } from '../core/types.ts'
import type { RSAd } from '../google/types.ts'

const HEADLINE_MAX = 30
const DESCRIPTION_MAX = 90

/**
 * Create validated RSA headlines. Each headline must be 30 characters or fewer.
 *
 * @param texts - Headline strings to validate and brand
 * @returns Array of branded Headline values
 * @throws If any headline exceeds 30 characters
 *
 * @example
 * ```ts
 * headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool')
 * ```
 */
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

/**
 * Create validated RSA descriptions. Each description must be 90 characters or fewer.
 *
 * @param texts - Description strings to validate and brand
 * @returns Array of branded Description values
 * @throws If any description exceeds 90 characters
 *
 * @example
 * ```ts
 * descriptions(
 *   'Rename thousands of files in seconds with AI-powered rules.',
 *   'Try free. No credit card required.',
 * )
 * ```
 */
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

/**
 * Build a Responsive Search Ad from validated headlines, descriptions, and a URL.
 *
 * Google requires 3-15 headlines and 2-4 descriptions per RSA.
 *
 * @param headlineList - Validated headlines (3-15 required)
 * @param descriptionList - Validated descriptions (2-4 required)
 * @param urlResult - URL object from the `url()` helper, with optional UTM params
 * @returns A complete RSA definition
 * @throws If headline count is outside 3-15 or description count is outside 2-4
 *
 * @example
 * ```ts
 * rsa(
 *   headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool'),
 *   descriptions('Rename files in seconds.', 'Try free today.'),
 *   url('https://renamed.to'),
 * )
 * ```
 */
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
