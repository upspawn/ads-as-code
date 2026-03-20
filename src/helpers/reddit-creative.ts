// Reddit Ads creative helpers
// Each helper validates constraints and returns a RedditAd variant

import type {
  RedditAd,
  ImageAdConfig,
  VideoAdConfig,
  CarouselCard,
  CarouselAdConfig,
  FreeformAdConfig,
  ProductAdConfig,
} from '../reddit/types.ts'

const HEADLINE_MAX = 300

function validateHeadline(headline: string): void {
  if (headline.length > HEADLINE_MAX) {
    throw new Error(`Headline must be ${HEADLINE_MAX} characters or fewer, got ${headline.length}`)
  }
}

/** Create a Reddit image ad. */
export function image(filePath: string, config: ImageAdConfig): RedditAd {
  validateHeadline(config.headline)
  return { format: 'image', filePath, config }
}

/** Create a Reddit video ad. */
export function video(filePath: string, config: VideoAdConfig): RedditAd {
  validateHeadline(config.headline)
  return { format: 'video', filePath, config }
}

/**
 * Create a Reddit carousel ad.
 * Reddit requires 2-6 cards per carousel.
 */
export function carousel(cards: readonly CarouselCard[], config?: CarouselAdConfig): RedditAd {
  if (cards.length < 2) throw new Error(`Carousel requires at least 2 cards, got ${cards.length}`)
  if (cards.length > 6) throw new Error(`Carousel allows at most 6 cards, got ${cards.length}`)
  return { format: 'carousel', cards, config: config ?? {} }
}

/** Create a Reddit freeform (conversation) ad with rich text and optional media. */
export function freeform(config: FreeformAdConfig): RedditAd {
  validateHeadline(config.headline)
  return { format: 'freeform', config }
}

/** Create a Reddit product (catalog) ad. */
export function product(config: ProductAdConfig): RedditAd {
  validateHeadline(config.headline)
  return { format: 'product', config }
}
