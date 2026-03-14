import type { UTMParams } from '../core/types.ts'

export type UrlResult = {
  readonly finalUrl: string
  readonly utm?: UTMParams
}

/** Create a URL with optional UTM parameters */
export function url(finalUrl: string, utm?: UTMParams): UrlResult {
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    throw new Error(`URL must start with http:// or https://, got "${finalUrl}"`)
  }
  return {
    finalUrl,
    ...(utm ? { utm } : {}),
  }
}
