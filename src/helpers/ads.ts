import type { Headline, Description } from '../core/types.ts'
import type { RSAd, PinnedHeadline, PinnedDescription, SmartCampaignAd, AppAdInfo } from '../google/types.ts'

const HEADLINE_MAX = 30
const DESCRIPTION_MAX = 90
const PATH_MAX = 15

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
 * Optional RSA configuration for pinning, display paths, and mobile URLs.
 */
export type RSAOptions = {
  readonly pinnedHeadlines?: PinnedHeadline[]
  readonly pinnedDescriptions?: PinnedDescription[]
  readonly path1?: string
  readonly path2?: string
  readonly mobileUrl?: string
  readonly trackingTemplate?: string
}

/**
 * Build a Responsive Search Ad from validated headlines, descriptions, and a URL.
 *
 * Google requires 3-15 headlines and 2-4 descriptions per RSA.
 *
 * @param headlineList - Validated headlines (3-15 required)
 * @param descriptionList - Validated descriptions (2-4 required)
 * @param urlResult - URL object from the `url()` helper, with optional UTM params
 * @param options - Optional RSA config: pinning, display paths, mobile URL, tracking template
 * @returns A complete RSA definition
 * @throws If headline count is outside 3-15 or description count is outside 2-4
 * @throws If path1 or path2 exceeds 15 characters
 *
 * @example
 * ```ts
 * rsa(
 *   headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool'),
 *   descriptions('Rename files in seconds.', 'Try free today.'),
 *   url('https://renamed.to'),
 *   {
 *     pinnedHeadlines: [{ text: 'Rename Files Fast', position: 1 }],
 *     path1: 'rename',
 *     path2: 'files',
 *   },
 * )
 * ```
 */
export function rsa(
  headlineList: Headline[],
  descriptionList: Description[],
  urlResult: { finalUrl: string; utm?: RSAd['utm'] },
  options?: RSAOptions,
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

  if (options?.path1 && options.path1.length > PATH_MAX) {
    throw new Error(`path1 "${options.path1}" exceeds ${PATH_MAX} chars (got ${options.path1.length})`)
  }
  if (options?.path2 && options.path2.length > PATH_MAX) {
    throw new Error(`path2 "${options.path2}" exceeds ${PATH_MAX} chars (got ${options.path2.length})`)
  }

  return {
    type: 'rsa' as const,
    headlines: headlineList,
    descriptions: descriptionList,
    finalUrl: urlResult.finalUrl,
    ...(urlResult.utm ? { utm: urlResult.utm } : {}),
    ...(options?.pinnedHeadlines ? { pinnedHeadlines: options.pinnedHeadlines } : {}),
    ...(options?.pinnedDescriptions ? { pinnedDescriptions: options.pinnedDescriptions } : {}),
    ...(options?.path1 ? { path1: options.path1 } : {}),
    ...(options?.path2 ? { path2: options.path2 } : {}),
    ...(options?.mobileUrl ? { mobileUrl: options.mobileUrl } : {}),
    ...(options?.trackingTemplate ? { trackingTemplate: options.trackingTemplate } : {}),
  }
}

/**
 * Build a Smart Campaign ad from headlines and descriptions.
 *
 * Smart campaigns require exactly 3 headlines (max 30 chars) and 2 descriptions (max 90 chars).
 *
 * @param config - Headlines and descriptions for the Smart ad
 * @returns A SmartCampaignAd definition
 */
export function smartAd(config: { headlines: [string, string, string]; descriptions: [string, string] }): SmartCampaignAd {
  return { type: 'smart' as const, ...config }
}

/**
 * Build an App Campaign ad from headlines, descriptions, and optional media.
 *
 * App campaigns allow up to 5 headlines (max 30 chars) and 5 descriptions (max 90 chars).
 *
 * @param config - Headlines, descriptions, and optional images/videos
 * @returns An AppAdInfo definition
 */
export function appAd(config: Omit<AppAdInfo, 'type'>): AppAdInfo {
  return { type: 'app' as const, ...config }
}
