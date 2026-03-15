import type {
  CountryCode,
  LanguageCode,
  Day,
  GeoTarget,
  LanguageTarget,
  ScheduleTarget,
  TargetingRule,
  Targeting,
} from '../core/types.ts'

/**
 * Target specific countries by ISO country code.
 *
 * @param countries - One or more ISO country codes (e.g. `'US'`, `'DE'`, `'CA'`)
 * @returns A geo targeting rule
 * @throws If no country codes are provided
 *
 * @example
 * ```ts
 * geo('US', 'CA')
 * // { type: 'geo', countries: ['US', 'CA'] }
 * ```
 */
export function geo(...countries: CountryCode[]): GeoTarget {
  if (countries.length === 0) throw new Error('geo() requires at least one country code')
  return { type: 'geo' as const, countries }
}

/**
 * Target specific languages by ISO language code.
 *
 * @param langs - One or more ISO language codes (e.g. `'en'`, `'de'`, `'fr'`)
 * @returns A language targeting rule
 * @throws If no language codes are provided
 *
 * @example
 * ```ts
 * languages('en', 'de')
 * // { type: 'language', languages: ['en', 'de'] }
 * ```
 */
export function languages(...langs: LanguageCode[]): LanguageTarget {
  if (langs.length === 0) throw new Error('languages() requires at least one language code')
  return { type: 'language' as const, languages: langs }
}

/**
 * Create a schedule targeting rule for weekdays (Monday through Friday, all hours).
 *
 * @returns A schedule targeting rule for Mon-Fri
 *
 * @example
 * ```ts
 * weekdays()
 * // { type: 'schedule', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
 * ```
 */
export function weekdays(): ScheduleTarget {
  return {
    type: 'schedule' as const,
    days: ['mon', 'tue', 'wed', 'thu', 'fri'] as Day[],
  }
}

/**
 * Create a schedule targeting rule for specific hours of the day.
 *
 * @param startHour - Start hour (0-23 inclusive)
 * @param endHour - End hour (1-24 inclusive), must be greater than startHour
 * @returns A schedule targeting rule for the specified hour range
 * @throws If startHour is outside 0-23, endHour is outside 1-24, or startHour >= endHour
 *
 * @example
 * ```ts
 * hours(9, 17)
 * // { type: 'schedule', startHour: 9, endHour: 17 }
 * ```
 */
export function hours(startHour: number, endHour: number): ScheduleTarget {
  if (startHour < 0 || startHour > 23) throw new Error(`startHour must be 0-23, got ${startHour}`)
  if (endHour < 1 || endHour > 24) throw new Error(`endHour must be 1-24, got ${endHour}`)
  if (startHour >= endHour) throw new Error(`startHour (${startHour}) must be less than endHour (${endHour})`)
  return { type: 'schedule' as const, startHour, endHour }
}

/**
 * Compose multiple targeting rules into a single Targeting object.
 *
 * Accepts any combination of geo, language, and schedule rules.
 *
 * @param rules - Targeting rules to combine
 * @returns A Targeting object containing all provided rules
 *
 * @example
 * ```ts
 * targeting(
 *   geo('US', 'CA'),
 *   languages('en'),
 *   weekdays(),
 *   hours(9, 17),
 * )
 * // { rules: [geoRule, languageRule, weekdayRule, hoursRule] }
 * ```
 */
export function targeting(...rules: TargetingRule[]): Targeting {
  return { rules }
}
