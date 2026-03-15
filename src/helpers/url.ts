import type { UTMParams } from '../core/types.ts'

export type UrlResult = {
  readonly finalUrl: string
  readonly utm?: UTMParams
}

/**
 * Create a URL with optional UTM tracking parameters.
 *
 * @param finalUrl - The destination URL (must start with `http://` or `https://`)
 * @param utm - Optional UTM parameters (source, medium, campaign, content, term)
 * @returns A URL result object with the final URL and optional UTM params
 * @throws If the URL does not start with `http://` or `https://`
 *
 * @example
 * ```ts
 * url('https://renamed.to')
 * // { finalUrl: 'https://renamed.to' }
 *
 * url('https://renamed.to', {
 *   source: 'google',
 *   medium: 'cpc',
 *   campaign: 'search-exact',
 * })
 * // { finalUrl: 'https://renamed.to', utm: { source: 'google', medium: 'cpc', campaign: 'search-exact' } }
 * ```
 */
export function url(finalUrl: string, utm?: UTMParams): UrlResult {
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    throw new Error(`URL must start with http:// or https://, got "${finalUrl}"`)
  }
  return {
    finalUrl,
    ...(utm ? { utm } : {}),
  }
}
