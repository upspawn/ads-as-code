import type { CalloutText } from '../core/types.ts'
import type {
  CallExtension,
  ImageExtension,
  PriceExtension,
  PromotionExtension,
  Sitelink,
  StructuredSnippet,
} from '../google/types.ts'

const SITELINK_TEXT_MAX = 25
const SITELINK_DESC_MAX = 35
const CALLOUT_MAX = 25
const SNIPPET_VALUE_MAX = 25
const SNIPPET_VALUES_MIN = 3
const SNIPPET_VALUES_MAX = 10
const PRICE_HEADER_MAX = 25
const PRICE_ITEMS_MIN = 3
const PRICE_ITEMS_MAX = 8

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

/**
 * Create a structured snippet extension with validated values.
 *
 * @param header - Predefined header (e.g., 'Amenities', 'Brands', 'Types')
 * @param values - 3-10 snippet values, each max 25 characters
 * @returns A StructuredSnippet object
 * @throws If fewer than 3 or more than 10 values, or any value exceeds 25 chars
 *
 * @example
 * ```ts
 * snippet('Types', 'Files', 'Folders', 'Documents')
 * ```
 */
export function snippet(header: string, ...values: string[]): StructuredSnippet {
  if (values.length < SNIPPET_VALUES_MIN) {
    throw new Error(
      `Structured snippet requires at least ${SNIPPET_VALUES_MIN} values (got ${values.length})`
    )
  }
  if (values.length > SNIPPET_VALUES_MAX) {
    throw new Error(
      `Structured snippet allows at most ${SNIPPET_VALUES_MAX} values (got ${values.length})`
    )
  }
  for (const value of values) {
    if (value.length > SNIPPET_VALUE_MAX) {
      throw new Error(
        `Snippet value "${value}" exceeds ${SNIPPET_VALUE_MAX} chars (got ${value.length})`
      )
    }
  }
  return { header, values }
}

/**
 * Create a call extension.
 *
 * @param phoneNumber - The phone number to display
 * @param countryCode - Country code (e.g., 'US', 'DE')
 * @param callOnly - If true, creates a call-only ad (no website link)
 * @returns A CallExtension object
 *
 * @example
 * ```ts
 * call('+1-800-555-0123', 'US')
 * call('+49-30-1234567', 'DE', true)
 * ```
 */
export function call(phoneNumber: string, countryCode: string, callOnly?: boolean): CallExtension {
  return {
    phoneNumber,
    countryCode,
    ...(callOnly !== undefined ? { callOnly } : {}),
  }
}

/**
 * Create a price extension with validated items.
 *
 * @param items - 3-8 price items, each with header (max 25 chars), description, price, and URL
 * @param qualifier - Optional price qualifier: 'from', 'up-to', or 'average'
 * @returns A PriceExtension object
 * @throws If fewer than 3 or more than 8 items, or any header exceeds 25 chars
 *
 * @example
 * ```ts
 * price([
 *   { header: 'Starter', description: 'For individuals', price: '$9/mo', url: '/pricing' },
 *   { header: 'Pro', description: 'For teams', price: '$29/mo', url: '/pricing' },
 *   { header: 'Enterprise', description: 'Custom pricing', price: '$99/mo', url: '/pricing' },
 * ], 'from')
 * ```
 */
export function price(
  items: PriceExtension['items'],
  qualifier?: PriceExtension['priceQualifier'],
): PriceExtension {
  if (items.length < PRICE_ITEMS_MIN) {
    throw new Error(
      `Price extension requires at least ${PRICE_ITEMS_MIN} items (got ${items.length})`
    )
  }
  if (items.length > PRICE_ITEMS_MAX) {
    throw new Error(
      `Price extension allows at most ${PRICE_ITEMS_MAX} items (got ${items.length})`
    )
  }
  for (const item of items) {
    if (item.header.length > PRICE_HEADER_MAX) {
      throw new Error(
        `Price header "${item.header}" exceeds ${PRICE_HEADER_MAX} chars (got ${item.header.length})`
      )
    }
  }
  return {
    ...(qualifier !== undefined ? { priceQualifier: qualifier } : {}),
    items,
  }
}

/**
 * Create a promotion extension.
 *
 * @param config - Promotion configuration
 * @returns A PromotionExtension object
 *
 * @example
 * ```ts
 * promotion({
 *   discountType: 'percent',
 *   discountPercent: 20,
 *   occasion: 'BLACK_FRIDAY',
 *   url: 'https://renamed.to/pricing',
 * })
 * ```
 */
export function promotion(config: PromotionExtension): PromotionExtension {
  return config
}

/**
 * Create an image extension.
 *
 * @param imageUrl - URL to the image asset
 * @param altText - Optional alt text for accessibility
 * @returns An ImageExtension object
 *
 * @example
 * ```ts
 * image('https://example.com/ad-image.png', 'Product screenshot')
 * ```
 */
export function image(imageUrl: string, altText?: string): ImageExtension {
  return {
    imageUrl,
    ...(altText !== undefined ? { altText } : {}),
  }
}
