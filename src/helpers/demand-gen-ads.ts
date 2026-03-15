import type {
  DemandGenMultiAssetAd,
  DemandGenCarouselAd,
  DemandGenCarouselCard,
} from '../google/types.ts'

/**
 * Create a Demand Gen multi-asset ad.
 *
 * Multi-asset ads combine multiple headlines, descriptions, and images
 * that Google assembles into the best-performing combinations across
 * YouTube, Discover, Gmail, and Display.
 *
 * @example
 * ```ts
 * demandGenMultiAsset({
 *   headlines: ['Rename Files Fast', 'AI-Powered Renaming'],
 *   descriptions: ['Try renamed.to free', 'Batch rename in seconds'],
 *   businessName: 'renamed.to',
 *   finalUrl: 'https://renamed.to',
 *   marketingImages: [landscape('./hero.png')],
 * })
 * ```
 */
export function demandGenMultiAsset(config: Omit<DemandGenMultiAssetAd, 'type'>): DemandGenMultiAssetAd {
  return { type: 'demand-gen-multi-asset' as const, ...config }
}

/**
 * Create a Demand Gen carousel ad.
 *
 * Carousel ads show a scrollable series of cards, each with its own
 * headline, image, and destination URL. Minimum 2, maximum 10 cards.
 *
 * @example
 * ```ts
 * demandGenCarousel({
 *   headline: 'See How It Works',
 *   description: 'Swipe to explore features',
 *   businessName: 'renamed.to',
 *   finalUrl: 'https://renamed.to',
 *   cards: [
 *     carouselCard({ headline: 'Upload', finalUrl: 'https://renamed.to/upload' }),
 *     carouselCard({ headline: 'Rename', finalUrl: 'https://renamed.to/rename' }),
 *   ],
 * })
 * ```
 */
export function demandGenCarousel(config: Omit<DemandGenCarouselAd, 'type'>): DemandGenCarouselAd {
  return { type: 'demand-gen-carousel' as const, ...config }
}

/**
 * Create a carousel card for a Demand Gen carousel ad.
 *
 * Each card has its own headline, destination URL, and optional images.
 */
export function carouselCard(config: DemandGenCarouselCard): DemandGenCarouselCard {
  return config
}
