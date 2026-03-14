// Google Ads API constants

/** Current Google Ads API version */
export const API_VERSION = 'v19'

/** Base URL for the Google Ads REST API */
export const BASE_URL = 'https://googleads.googleapis.com'

/**
 * Google Ads language criterion IDs.
 * Maps ISO 639-1 codes to Google's internal criterion IDs.
 * @see https://developers.google.com/google-ads/api/reference/data/codes-formats#languages
 */
export const LANGUAGE_CRITERIA: Record<string, number> = {
  en: 1000,
  de: 1001,
  fr: 1002,
  es: 1003,
  it: 1004,
  pt: 1005,
  da: 1009,
  nl: 1010,
  ja: 1010,
  fi: 1011,
  ko: 1012,
  no: 1013,
  sv: 1015,
  pl: 1030,
}

/**
 * Google Ads geo target constant IDs.
 * Maps ISO 3166-1 alpha-2 country codes to Google's internal geo target IDs.
 * @see https://developers.google.com/google-ads/api/reference/data/geotargets
 */
export const GEO_TARGETS: Record<string, number> = {
  US: 2840,
  DE: 2276,
  CA: 2124,
  GB: 2826,
  AU: 2036,
  AT: 2040,
  CH: 2756,
  FR: 2250,
  IT: 2380,
  ES: 2724,
  PT: 2620,
  PL: 2616,
  JP: 2392,
  KR: 2410,
  BR: 2076,
  NL: 2528,
  SE: 2752,
  NO: 2578,
  DK: 2208,
  FI: 2246,
}
