import type {
  GeoTarget,
  CountryCode,
} from '../core/types.ts'
import type {
  MetaTargeting,
  InterestTarget,
} from '../meta/types.ts'

// ─── Marker types for deferred resolution ─────────────────

/**
 * Marker for an audience that will be resolved by name at validate/plan time.
 * When a string name is passed to `audience()`, the actual audience ID is
 * looked up in the Meta account. This marker stores the intent until then.
 */
export type AudienceMarker =
  | { readonly _type: 'audience-by-name'; readonly name: string }
  | { readonly _type: 'audience-by-id'; readonly id: string }

/**
 * Marker for an excluded audience, resolved the same way as AudienceMarker.
 */
export type ExcludedAudienceMarker =
  | { readonly _type: 'excluded-audience-by-name'; readonly name: string }
  | { readonly _type: 'excluded-audience-by-id'; readonly id: string }

/**
 * Marker for interests that may need API lookup.
 * Strings are resolved via the interests catalog or Meta Targeting Search API.
 * Explicit `{ id, name }` objects are used as-is.
 */
export type InterestMarker =
  | { readonly _type: 'interest-by-name'; readonly name: string }
  | { readonly _type: 'interest-resolved'; readonly id: string; readonly name: string }

/**
 * Lookalike audience configuration.
 */
export type LookalikeConfig = {
  readonly geo: GeoTarget
  readonly percent: number
}

export type LookalikeMarker = {
  readonly _type: 'lookalike'
  readonly source: string | { readonly id: string }
  readonly config: LookalikeConfig
}

// ─── Targeting rule union ─────────────────────────────────

/**
 * All possible targeting rule types that can be passed to `targeting()`.
 * Each helper returns one of these marker types which are composed into
 * a `MetaTargeting` object.
 */
export type MetaTargetingRule =
  | GeoTarget
  | { readonly _type: 'age'; readonly min: number; readonly max: number }
  | AudienceMarker
  | ExcludedAudienceMarker
  | InterestMarker
  | LookalikeMarker

// ─── Helper functions ─────────────────────────────────────

/**
 * Compose targeting rules into a `MetaTargeting` object.
 *
 * Accepts geo targets, age ranges, audience markers, interest markers,
 * and lookalike markers. Deferred resolution markers (audience-by-name,
 * interest-by-name) are stored as string references and resolved at
 * validate/plan time.
 *
 * @param rules - Targeting rules to compose
 * @returns A MetaTargeting object
 *
 * @example
 * ```ts
 * targeting(
 *   geo('US', 'DE'),
 *   age(25, 65),
 *   audience('Website Visitors 30d'),
 *   interests('Construction', 'BIM'),
 * )
 * ```
 */
export function metaTargeting(...rules: MetaTargetingRule[]): MetaTargeting {
  const geoTargets: GeoTarget[] = []
  let age: { min: number; max: number } | undefined
  const customAudiences: string[] = []
  const excludedAudiences: string[] = []
  const lookalikeAudiences: string[] = []
  const interests: InterestTarget[] = []

  for (const rule of rules) {
    if ('type' in rule && rule.type === 'geo') {
      geoTargets.push(rule)
    } else if ('_type' in rule) {
      switch (rule._type) {
        case 'age':
          age = { min: rule.min, max: rule.max }
          break
        case 'audience-by-name':
          customAudiences.push(rule.name)
          break
        case 'audience-by-id':
          customAudiences.push(rule.id)
          break
        case 'excluded-audience-by-name':
          excludedAudiences.push(rule.name)
          break
        case 'excluded-audience-by-id':
          excludedAudiences.push(rule.id)
          break
        case 'interest-by-name':
          // Store as unresolved — flatten/validate resolves via catalog or API
          interests.push({ id: `__unresolved:${rule.name}`, name: rule.name })
          break
        case 'interest-resolved':
          interests.push({ id: rule.id, name: rule.name })
          break
        case 'lookalike':
          const sourceRef = typeof rule.source === 'string'
            ? rule.source
            : rule.source.id
          lookalikeAudiences.push(sourceRef)
          break
      }
    }
  }

  if (geoTargets.length === 0) {
    throw new Error('targeting() requires at least one geo() rule')
  }

  const result: MetaTargeting = {
    geo: geoTargets,
    ...(age && { age }),
    ...(customAudiences.length > 0 && { customAudiences }),
    ...(excludedAudiences.length > 0 && { excludedAudiences }),
    ...(lookalikeAudiences.length > 0 && { lookalikeAudiences }),
    ...(interests.length > 0 && { interests }),
  }

  return result
}

/**
 * Create an age range targeting rule.
 *
 * @param min - Minimum age (13-65)
 * @param max - Maximum age (13-65), must be >= min
 * @returns An age targeting marker
 * @throws If min or max are outside 13-65 or min > max
 *
 * @example
 * ```ts
 * age(25, 65) // target ages 25-65
 * ```
 */
export function age(min: number, max: number): { readonly _type: 'age'; readonly min: number; readonly max: number } {
  if (min < 13 || min > 65) throw new Error(`age min must be 13-65, got ${min}`)
  if (max < 13 || max > 65) throw new Error(`age max must be 13-65, got ${max}`)
  if (min > max) throw new Error(`age min (${min}) must be <= max (${max})`)
  return { _type: 'age' as const, min, max }
}

/**
 * Reference a custom audience by name (deferred lookup) or explicit ID.
 *
 * When a string is passed, the audience is looked up by name in the Meta account
 * at validate/plan time. Pass `{ id: '...' }` for an explicit reference that
 * skips the lookup.
 *
 * @param nameOrId - Audience name (string) or explicit ID object
 * @returns An audience marker for use in `targeting()`
 *
 * @example
 * ```ts
 * audience('Website Visitors 30d')       // name lookup
 * audience({ id: '23856789012345' })     // explicit ID
 * ```
 */
export function audience(nameOrId: string | { readonly id: string }): AudienceMarker {
  if (typeof nameOrId === 'string') {
    return { _type: 'audience-by-name' as const, name: nameOrId }
  }
  return { _type: 'audience-by-id' as const, id: nameOrId.id }
}

/**
 * Reference interests by name (deferred API lookup) or explicit `{ id, name }`.
 *
 * String names are resolved via the bundled interests catalog first, then
 * the Meta Targeting Search API at validate/plan time. If a name is ambiguous,
 * `validate` prints the options.
 *
 * @param args - Interest names (strings) or explicit `{ id, name }` objects
 * @returns An array of interest markers for use in `targeting()`
 *
 * @example
 * ```ts
 * interests('Construction', 'BIM')                        // name lookup
 * interests({ id: '6003370250981', name: 'Construction' }) // explicit
 * ```
 */
export function interests(...args: (string | { readonly id: string; readonly name: string })[]): InterestMarker[] {
  if (args.length === 0) throw new Error('interests() requires at least one argument')
  return args.map(arg => {
    if (typeof arg === 'string') {
      return { _type: 'interest-by-name' as const, name: arg }
    }
    return { _type: 'interest-resolved' as const, id: arg.id, name: arg.name }
  })
}

/**
 * Exclude a custom audience by name (deferred lookup) or explicit ID.
 *
 * @param nameOrId - Audience name (string) or explicit ID object
 * @returns An excluded audience marker for use in `targeting()`
 *
 * @example
 * ```ts
 * excludeAudience('Existing Customers')
 * excludeAudience({ id: '23856789099999' })
 * ```
 */
export function excludeAudience(nameOrId: string | { readonly id: string }): ExcludedAudienceMarker {
  if (typeof nameOrId === 'string') {
    return { _type: 'excluded-audience-by-name' as const, name: nameOrId }
  }
  return { _type: 'excluded-audience-by-id' as const, id: nameOrId.id }
}

/**
 * Create a lookalike audience from an existing audience source.
 *
 * @param source - Source audience name (string) or explicit ID object
 * @param config - Lookalike configuration with geo targeting and percentage
 * @returns A lookalike marker for use in `targeting()`
 *
 * @example
 * ```ts
 * lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 })
 * ```
 */
export function lookalike(
  source: string | { readonly id: string },
  config: LookalikeConfig,
): LookalikeMarker {
  if (config.percent < 1 || config.percent > 10) {
    throw new Error(`lookalike percent must be 1-10, got ${config.percent}`)
  }
  return { _type: 'lookalike' as const, source, config }
}
