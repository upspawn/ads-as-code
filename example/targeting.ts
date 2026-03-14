import { geo, languages, targeting } from '@upspawn/ads'

/**
 * Shared targeting presets.
 * Import these in your campaign files.
 */

export const english = targeting(
  geo('US', 'CA', 'GB', 'AU'),
  languages('en'),
)

export const dach = targeting(
  geo('DE', 'AT', 'CH'),
  languages('de'),
)
