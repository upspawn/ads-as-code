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
const FREEFORM_BODY_MAX = 40_000
const FREEFORM_IMAGES_MAX = 20
const FREEFORM_VIDEOS_MAX = 5
const CAROUSEL_CAPTION_MAX = 50

function validateHeadline(headline: string): void {
  if (headline.length > HEADLINE_MAX) {
    throw new Error(`Headline must be ${HEADLINE_MAX} characters or fewer, got ${headline.length}`)
  }
}

function validateFreeformBody(body: string): void {
  if (body.length > FREEFORM_BODY_MAX) {
    throw new Error(`Freeform body must be ${FREEFORM_BODY_MAX} characters or fewer, got ${body.length}`)
  }
}

function validateFreeformMedia(images?: readonly string[], videos?: readonly string[]): void {
  if (images && images.length > FREEFORM_IMAGES_MAX) {
    throw new Error(`Freeform ad allows at most ${FREEFORM_IMAGES_MAX} images, got ${images.length}`)
  }
  if (videos && videos.length > FREEFORM_VIDEOS_MAX) {
    throw new Error(`Freeform ad allows at most ${FREEFORM_VIDEOS_MAX} videos, got ${videos.length}`)
  }
}

function validateCarouselCaptions(cards: readonly CarouselCard[]): void {
  for (const card of cards) {
    if (card.caption && card.caption.length > CAROUSEL_CAPTION_MAX) {
      throw new Error(`Carousel card caption must be ${CAROUSEL_CAPTION_MAX} characters or fewer, got ${card.caption.length}`)
    }
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
  validateCarouselCaptions(cards)
  return { format: 'carousel', cards, config: config ?? {} }
}

/** Create a Reddit freeform (conversation) ad with rich text and optional media. */
export function freeform(config: FreeformAdConfig): RedditAd {
  validateHeadline(config.headline)
  validateFreeformBody(config.body)
  validateFreeformMedia(config.images, config.videos)
  return { format: 'freeform', config }
}

/** Create a Reddit product (catalog) ad. */
export function product(config: ProductAdConfig): RedditAd {
  validateHeadline(config.headline)
  return { format: 'product', config }
}
