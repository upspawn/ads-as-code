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

/** Target specific countries */
export function geo(...countries: CountryCode[]): GeoTarget {
  if (countries.length === 0) throw new Error('geo() requires at least one country code')
  return { type: 'geo' as const, countries }
}

/** Target specific languages */
export function languages(...langs: LanguageCode[]): LanguageTarget {
  if (langs.length === 0) throw new Error('languages() requires at least one language code')
  return { type: 'language' as const, languages: langs }
}

/** Schedule: Monday–Friday, all hours */
export function weekdays(): ScheduleTarget {
  return {
    type: 'schedule' as const,
    days: ['mon', 'tue', 'wed', 'thu', 'fri'] as Day[],
  }
}

/** Schedule: specific hour range (0-24) */
export function hours(startHour: number, endHour: number): ScheduleTarget {
  if (startHour < 0 || startHour > 23) throw new Error(`startHour must be 0-23, got ${startHour}`)
  if (endHour < 1 || endHour > 24) throw new Error(`endHour must be 1-24, got ${endHour}`)
  if (startHour >= endHour) throw new Error(`startHour (${startHour}) must be less than endHour (${endHour})`)
  return { type: 'schedule' as const, startHour, endHour }
}

/** Compose multiple targeting rules into a Targeting object */
export function targeting(...rules: TargetingRule[]): Targeting {
  return { rules }
}
