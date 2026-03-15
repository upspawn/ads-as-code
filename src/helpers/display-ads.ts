import type { ResponsiveDisplayAd } from '../google/types.ts'
import type { ImageRef } from '../google/image-assets.ts'

/**
 * Build a Responsive Display Ad from text fields, images, and optional style settings.
 *
 * Google requires 1-5 headlines, 1 long headline, 1-5 descriptions, and at least
 * one marketing image per RDA.
 *
 * @param config - All RDA fields (text, images, and optional style/CTA)
 * @returns A complete ResponsiveDisplayAd definition
 *
 * @example
 * ```ts
 * responsiveDisplay({
 *   headlines: ['Rename Files Fast', 'AI Powered'],
 *   longHeadline: 'Rename All Your Files in Seconds with AI',
 *   descriptions: ['Try renamed.to free'],
 *   businessName: 'renamed.to',
 *   finalUrl: 'https://renamed.to',
 *   marketingImages: [landscape('./hero.png')],
 *   squareMarketingImages: [square('./hero-square.png')],
 * })
 * ```
 */
export function responsiveDisplay(config: {
  headlines: string[]
  longHeadline: string
  descriptions: string[]
  businessName: string
  finalUrl: string
  marketingImages: ImageRef[]
  squareMarketingImages: ImageRef[]
  logoImages?: ImageRef[]
  squareLogoImages?: ImageRef[]
  callToAction?: string
  mainColor?: string
  accentColor?: string
}): ResponsiveDisplayAd {
  return {
    type: 'responsive-display' as const,
    headlines: config.headlines,
    longHeadline: config.longHeadline,
    descriptions: config.descriptions,
    businessName: config.businessName,
    finalUrl: config.finalUrl,
    marketingImages: config.marketingImages,
    squareMarketingImages: config.squareMarketingImages,
    ...(config.logoImages ? { logoImages: config.logoImages } : {}),
    ...(config.squareLogoImages ? { squareLogoImages: config.squareLogoImages } : {}),
    ...(config.callToAction ? { callToAction: config.callToAction } : {}),
    ...(config.mainColor ? { mainColor: config.mainColor } : {}),
    ...(config.accentColor ? { accentColor: config.accentColor } : {}),
  }
}
