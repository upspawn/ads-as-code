import type {
  CountryCode,
  LanguageCode,
  Day,
  GeoTarget,
  LanguageTarget,
  ScheduleTarget,
  DeviceTarget,
  RegionTarget,
  CityTarget,
  RadiusTarget,
  PresenceTarget,
  DemographicTarget,
  ScheduleBidTarget,
  AgeRange,
  Gender,
  IncomeRange,
  ParentalStatus,
  TargetingRule,
  Targeting,
  AudienceRef,
  AudienceTarget,
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
 * Set a bid adjustment for a specific device type.
 *
 * @param deviceType - The device to target: `'mobile'`, `'desktop'`, or `'tablet'`
 * @param bidAdjustment - Bid modifier: `-1.0` = exclude (−100%), `0.0` = no change, `0.5` = +50%, etc.
 * @returns A device targeting rule
 *
 * @example
 * ```ts
 * device('mobile', -1.0) // exclude mobile
 * device('desktop', 0.2) // +20% bid on desktop
 * ```
 */
export function device(deviceType: 'mobile' | 'desktop' | 'tablet', bidAdjustment: number): DeviceTarget {
  if (bidAdjustment < -1 || bidAdjustment > 9) throw new Error(`bidAdjustment must be between -1.0 and 9.0, got ${bidAdjustment}`)
  return { type: 'device' as const, device: deviceType, bidAdjustment }
}

/**
 * Target specific regions (states, provinces, etc.) by ID or name.
 *
 * @param regionIds - One or more region identifiers
 * @returns A region targeting rule
 * @throws If no regions are provided
 *
 * @example
 * ```ts
 * regions('California', 'New York', 'Texas')
 * ```
 */
export function regions(...regionIds: string[]): RegionTarget {
  if (regionIds.length === 0) throw new Error('regions() requires at least one region')
  return { type: 'region' as const, regions: regionIds }
}

/**
 * Target specific cities by name.
 *
 * @param cityNames - One or more city names
 * @returns A city targeting rule
 * @throws If no cities are provided
 *
 * @example
 * ```ts
 * cities('Berlin', 'Munich', 'Hamburg')
 * ```
 */
export function cities(...cityNames: string[]): CityTarget {
  if (cityNames.length === 0) throw new Error('cities() requires at least one city')
  return { type: 'city' as const, cities: cityNames }
}

/**
 * Target a circular area around a geographic point.
 *
 * @param lat - Latitude of the center point
 * @param lng - Longitude of the center point
 * @param radiusKm - Radius in kilometers (must be positive)
 * @returns A radius targeting rule
 * @throws If radiusKm is not positive
 *
 * @example
 * ```ts
 * radius(52.52, 13.405, 50) // 50km around Berlin
 * ```
 */
export function radius(lat: number, lng: number, radiusKm: number): RadiusTarget {
  if (radiusKm <= 0) throw new Error(`radiusKm must be positive, got ${radiusKm}`)
  return { type: 'radius' as const, latitude: lat, longitude: lng, radiusKm }
}

/**
 * Set location targeting presence mode.
 *
 * @param mode - `'presence'` targets people physically in the location;
 *   `'presence-or-interest'` also includes people interested in the location
 * @returns A presence targeting rule
 *
 * @example
 * ```ts
 * presence('presence') // only people physically there
 * ```
 */
export function presence(mode: 'presence' | 'presence-or-interest'): PresenceTarget {
  return { type: 'presence' as const, mode }
}

/**
 * Target specific demographic segments.
 *
 * @param opts - Demographic filters (all optional)
 * @returns A demographic targeting rule
 *
 * @example
 * ```ts
 * demographics({ ageRanges: ['25-34', '35-44'], genders: ['male'] })
 * ```
 */
export function demographics(opts: {
  ageRanges?: AgeRange[]
  genders?: Gender[]
  incomes?: IncomeRange[]
  parentalStatuses?: ParentalStatus[]
}): DemographicTarget {
  return { type: 'demographic' as const, ...opts }
}

/**
 * Create a schedule-based bid adjustment for a specific day and time range.
 *
 * @param day - Day of the week
 * @param startHour - Start hour (0-23 inclusive)
 * @param endHour - End hour (1-24 inclusive), must be greater than startHour
 * @param bidAdjustment - Bid modifier (e.g., `0.2` = +20%, `-0.3` = −30%)
 * @returns A schedule bid targeting rule
 * @throws If hours are invalid or bidAdjustment is out of range
 *
 * @example
 * ```ts
 * scheduleBid('mon', 9, 17, 0.2) // +20% on Monday 9am–5pm
 * ```
 */
export function scheduleBid(day: Day, startHour: number, endHour: number, bidAdjustment: number): ScheduleBidTarget {
  if (startHour < 0 || startHour > 23) throw new Error(`startHour must be 0-23, got ${startHour}`)
  if (endHour < 1 || endHour > 24) throw new Error(`endHour must be 1-24, got ${endHour}`)
  if (startHour >= endHour) throw new Error(`startHour (${startHour}) must be less than endHour (${endHour})`)
  if (bidAdjustment < -1 || bidAdjustment > 9) throw new Error(`bidAdjustment must be between -1.0 and 9.0, got ${bidAdjustment}`)
  return { type: 'schedule-bid' as const, day, startHour, endHour, bidAdjustment }
}

/**
 * Compose multiple targeting rules into a single Targeting object.
 *
 * Accepts any combination of targeting rules: geo, language, schedule,
 * device, region, city, radius, presence, demographic, and schedule-bid.
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
 *   device('mobile', -0.5),
 *   presence('presence'),
 * )
 * // { rules: [...] }
 * ```
 */
export function targeting(...rules: TargetingRule[]): Targeting {
  return { rules }
}

// ─── Audience Helpers ─────────────────────────────────────────

type AudienceRefOptions = { name?: string; bidAdjustment?: number }

/**
 * Create a remarketing audience reference.
 *
 * @param listId - The remarketing list ID
 * @param options - Optional name and bid adjustment
 * @returns An AudienceRef with kind 'remarketing'
 *
 * @example
 * ```ts
 * remarketing('123456', { name: 'All Visitors', bidAdjustment: 0.2 })
 * ```
 */
export function remarketing(listId: string, options?: AudienceRefOptions): AudienceRef {
  return { kind: 'remarketing' as const, listId, ...options }
}

/**
 * Create a custom audience reference.
 *
 * @param audienceId - The custom audience ID
 * @param options - Optional name and bid adjustment
 * @returns An AudienceRef with kind 'custom'
 *
 * @example
 * ```ts
 * customAudience('789', { name: 'File Management Searchers' })
 * ```
 */
export function customAudience(audienceId: string, options?: AudienceRefOptions): AudienceRef {
  return { kind: 'custom' as const, audienceId, ...options }
}

/**
 * Create an in-market audience reference.
 *
 * @param categoryId - The in-market category ID
 * @param options - Optional name and bid adjustment
 * @returns An AudienceRef with kind 'in-market'
 *
 * @example
 * ```ts
 * inMarket('80432', { name: 'Business Software' })
 * ```
 */
export function inMarket(categoryId: string, options?: AudienceRefOptions): AudienceRef {
  return { kind: 'in-market' as const, categoryId, ...options }
}

/**
 * Create an affinity audience reference.
 *
 * @param categoryId - The affinity category ID
 * @param options - Optional name and bid adjustment
 * @returns An AudienceRef with kind 'affinity'
 *
 * @example
 * ```ts
 * affinity('80101', { name: 'Technology Enthusiasts' })
 * ```
 */
export function affinity(categoryId: string, options?: AudienceRefOptions): AudienceRef {
  return { kind: 'affinity' as const, categoryId, ...options }
}

/**
 * Create a customer match audience reference.
 *
 * @param listId - The customer match list ID
 * @param options - Optional name and bid adjustment
 * @returns An AudienceRef with kind 'customer-match'
 *
 * @example
 * ```ts
 * customerMatch('list-001', { name: 'Existing Customers' })
 * ```
 */
export function customerMatch(listId: string, options?: AudienceRefOptions): AudienceRef {
  return { kind: 'customer-match' as const, listId, ...options }
}

/**
 * Create an audience targeting rule in observation mode (bid-only, no delivery restriction).
 *
 * @param refs - One or more audience references
 * @returns An AudienceTarget with mode 'observation'
 *
 * @example
 * ```ts
 * audiences(
 *   remarketing('123', { bidAdjustment: 0.5 }),
 *   inMarket('80432', { name: 'Business Software' }),
 * )
 * ```
 */
export function audiences(...refs: AudienceRef[]): AudienceTarget {
  return { type: 'audience' as const, audiences: refs, mode: 'observation' }
}

/**
 * Create an audience targeting rule in targeting mode (restricts ad delivery to these audiences).
 *
 * @param refs - One or more audience references
 * @returns An AudienceTarget with mode 'targeting'
 *
 * @example
 * ```ts
 * audienceTargeting(
 *   remarketing('123', { name: 'Cart Abandoners' }),
 * )
 * ```
 */
export function audienceTargeting(...refs: AudienceRef[]): AudienceTarget {
  return { type: 'audience' as const, audiences: refs, mode: 'targeting' }
}
