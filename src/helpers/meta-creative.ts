import type {
  ImageAd,
  VideoAd,
  CarouselAd,
  CarouselCard,
  BoostedPostAd,
  MetaCTA,
} from '../meta/types.ts'
import type { AssetMarker } from '../core/asset.ts'

// ─── Helper functions ─────────────────────────────────────

/**
 * Derive a human-readable name from a file path by stripping the directory
 * and extension. Actual slugification happens at flatten time.
 *
 * @example
 * './assets/hero-sign-up.png' → 'hero-sign-up'
 * '../images/comparison.jpg'  → 'comparison'
 */
function nameFromFile(filePath: string): string {
  // Extract filename from path (handle both / and \ separators)
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const base = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
  const dotIndex = base.lastIndexOf('.')
  return dotIndex > 0 ? base.slice(0, dotIndex) : base
}

// ─── Creative config types (omit format + file fields) ────

type ImageAdConfig = {
  readonly name?: string
  readonly headline: string
  readonly primaryText: string
  readonly description?: string
  readonly cta?: MetaCTA
  readonly url?: string
  readonly urlParameters?: string
  readonly displayLink?: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

type VideoAdConfig = {
  readonly name?: string
  readonly thumbnail?: string
  readonly headline: string
  readonly primaryText: string
  readonly description?: string
  readonly cta?: MetaCTA
  readonly url?: string
  readonly urlParameters?: string
  readonly status?: 'ACTIVE' | 'PAUSED'
}

type CarouselAdConfig = {
  readonly name?: string
  readonly primaryText: string
  readonly cta?: MetaCTA
  readonly url?: string
  readonly endCard?: 'website' | 'none'
}

// ─── Exported helpers ─────────────────────────────────────

/**
 * Create an image ad creative.
 *
 * If `name` is omitted, it is derived from the filename (e.g., `hero.png` → `"hero"`).
 * The `url` and `cta` fields are optional — if omitted, they inherit from the
 * ad set's `AdSetContent` defaults at flatten time.
 *
 * @param filePath - Path to the image file (relative to the campaign file)
 * @param config - Ad copy and optional overrides
 * @returns An ImageAd object
 *
 * @example
 * ```ts
 * image('./assets/hero.png', {
 *   headline: 'Rename Files Instantly',
 *   primaryText: 'Stop wasting hours organizing files manually...',
 * })
 * ```
 */
export function image(filePath: string | AssetMarker, config?: Partial<ImageAdConfig>): ImageAd {
  const name = config?.name ?? (typeof filePath === 'string' ? nameFromFile(filePath) : undefined)
  return {
    format: 'image' as const,
    image: filePath,
    ...(name !== undefined && { name }),
    headline: config?.headline ?? '',
    primaryText: config?.primaryText ?? '',
    ...(config?.description !== undefined && { description: config.description }),
    ...(config?.cta !== undefined && { cta: config.cta }),
    ...(config?.url !== undefined && { url: config.url }),
    ...(config?.urlParameters !== undefined && { urlParameters: config.urlParameters }),
    ...(config?.displayLink !== undefined && { displayLink: config.displayLink }),
    ...(config?.status !== undefined && { status: config.status }),
  }
}

/**
 * Create a video ad creative.
 *
 * If `name` is omitted, it is derived from the filename (e.g., `demo.mp4` → `"demo"`).
 * The `url` and `cta` fields are optional — if omitted, they inherit from the
 * ad set's `AdSetContent` defaults at flatten time.
 *
 * @param filePath - Path to the video file (relative to the campaign file)
 * @param config - Ad copy and optional overrides
 * @returns A VideoAd object
 *
 * @example
 * ```ts
 * video('./assets/demo.mp4', {
 *   headline: 'See renamed.to in Action',
 *   primaryText: 'Watch how teams save 2 hours per week...',
 * })
 * ```
 */
export function video(filePath: string | AssetMarker, config?: Partial<VideoAdConfig>): VideoAd {
  const name = config?.name ?? (typeof filePath === 'string' ? nameFromFile(filePath) : undefined)
  return {
    format: 'video' as const,
    video: filePath,
    ...(name !== undefined && { name }),
    headline: config?.headline ?? '',
    primaryText: config?.primaryText ?? '',
    ...(config?.thumbnail !== undefined && { thumbnail: config.thumbnail }),
    ...(config?.description !== undefined && { description: config.description }),
    ...(config?.cta !== undefined && { cta: config.cta }),
    ...(config?.url !== undefined && { url: config.url }),
    ...(config?.urlParameters !== undefined && { urlParameters: config.urlParameters }),
    ...(config?.status !== undefined && { status: config.status }),
  }
}

/**
 * Create a carousel ad creative.
 *
 * Requires 2-10 cards, each with its own image, headline, and URL.
 * The `url` and `cta` fields on the carousel act as fallback defaults.
 *
 * @param cards - Array of carousel cards (2-10)
 * @param config - Carousel-level copy and optional overrides
 * @returns A CarouselAd object
 * @throws If fewer than 2 or more than 10 cards are provided
 *
 * @example
 * ```ts
 * carousel(
 *   [
 *     { image: './a.png', headline: 'Step 1', url: 'https://renamed.to/step-1' },
 *     { image: './b.png', headline: 'Step 2', url: 'https://renamed.to/step-2' },
 *   ],
 *   { primaryText: 'See how it works in 3 simple steps' },
 * )
 * ```
 */
export function carousel(cards: readonly CarouselCard[], config: CarouselAdConfig): CarouselAd {
  if (cards.length < 2) throw new Error(`Carousel requires at least 2 cards, got ${cards.length}`)
  if (cards.length > 10) throw new Error(`Carousel allows at most 10 cards, got ${cards.length}`)

  return {
    format: 'carousel' as const,
    cards,
    primaryText: config.primaryText,
    ...(config.name !== undefined && { name: config.name }),
    ...(config.cta !== undefined && { cta: config.cta }),
    ...(config.url !== undefined && { url: config.url }),
    ...(config.endCard !== undefined && { endCard: config.endCard }),
  }
}

/** Create a boosted post creative — an existing page post promoted as an ad. */
export function boostedPost(name?: string): BoostedPostAd {
  return { format: 'boostedPost' as const, ...(name !== undefined && { name }) }
}
