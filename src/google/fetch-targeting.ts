/**
 * Fetching and normalizing extended targeting from Google Ads API:
 * - Demographics (age, gender, parental status, income range)
 * - Schedule bid adjustments
 * - Location bid adjustments
 * - Audience targeting (ad group level)
 */

import type { GoogleAdsClient, GoogleAdsRow } from './types.ts'
import type { AudienceRef, AudienceTarget } from '../core/types.ts'

// ─── Enum Maps ────────────────────────────────────────────────

const AGE_RANGE_MAP: Record<string, string> = {
  'AGE_RANGE_18_24': '18-24',
  'AGE_RANGE_25_34': '25-34',
  'AGE_RANGE_35_44': '35-44',
  'AGE_RANGE_45_54': '45-54',
  'AGE_RANGE_55_64': '55-64',
  'AGE_RANGE_65_UP': '65+',
  'AGE_RANGE_UNDETERMINED': 'undetermined',
}

const GENDER_MAP: Record<string, string> = {
  'MALE': 'male',
  'FEMALE': 'female',
  'UNDETERMINED': 'undetermined',
}

const PARENTAL_STATUS_MAP: Record<string, string> = {
  'PARENT': 'parent',
  'NOT_A_PARENT': 'not-parent',
  'UNDETERMINED': 'undetermined',
}

const INCOME_RANGE_MAP: Record<string, string> = {
  'INCOME_RANGE_0_50': 'lower-50%',
  'INCOME_RANGE_50_60': '41-50%',
  'INCOME_RANGE_60_70': '31-40%',
  'INCOME_RANGE_70_80': '21-30%',
  'INCOME_RANGE_80_90': '11-20%',
  'INCOME_RANGE_90_100': 'top-10%',
  'INCOME_RANGE_UNDETERMINED': 'undetermined',
}

const DAY_OF_WEEK_MAP: Record<number | string, string> = {
  2: 'mon', 3: 'tue', 4: 'wed', 5: 'thu', 6: 'fri', 7: 'sat', 8: 'sun',
  'MONDAY': 'mon', 'TUESDAY': 'tue', 'WEDNESDAY': 'wed', 'THURSDAY': 'thu',
  'FRIDAY': 'fri', 'SATURDAY': 'sat', 'SUNDAY': 'sun',
}

// ─── Helpers ──────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

/** Extract the last segment (ID) from a resource path like 'customers/123/userLists/456' */
function extractId(resourcePath: string): string {
  const parts = resourcePath.split('/')
  return parts[parts.length - 1] ?? resourcePath
}

// ─── Demographic Targeting ────────────────────────────────────

type DemographicData = {
  ageRanges: string[]
  genders: string[]
  incomes: string[]
  parentalStatuses: string[]
}

/**
 * Normalize demographic criterion rows into per-campaign demographic data.
 * Pure function, testable without API calls.
 */
export function normalizeDemographicRows(rows: GoogleAdsRow[]): Map<string, DemographicData> {
  const result = new Map<string, DemographicData>()

  function ensure(campaignId: string): DemographicData {
    if (!result.has(campaignId)) {
      result.set(campaignId, { ageRanges: [], genders: [], incomes: [], parentalStatuses: [] })
    }
    return result.get(campaignId)!
  }

  for (const row of rows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)
    const type = str(criterion?.type)

    if (type === 'AGE_RANGE') {
      const ageRange = (criterion.age_range ?? criterion.ageRange) as Record<string, unknown>
      const ageType = str(ageRange?.type)
      const mapped = AGE_RANGE_MAP[ageType]
      if (mapped) ensure(campaignId).ageRanges.push(mapped)
    } else if (type === 'GENDER') {
      const gender = criterion.gender as Record<string, unknown>
      const genderType = str(gender?.type)
      const mapped = GENDER_MAP[genderType]
      if (mapped) ensure(campaignId).genders.push(mapped)
    } else if (type === 'PARENTAL_STATUS') {
      const parental = (criterion.parental_status ?? criterion.parentalStatus) as Record<string, unknown>
      const parentalType = str(parental?.type)
      const mapped = PARENTAL_STATUS_MAP[parentalType]
      if (mapped) ensure(campaignId).parentalStatuses.push(mapped)
    } else if (type === 'INCOME_RANGE') {
      const income = (criterion.income_range ?? criterion.incomeRange) as Record<string, unknown>
      const incomeType = str(income?.type)
      const mapped = INCOME_RANGE_MAP[incomeType]
      if (mapped) ensure(campaignId).incomes.push(mapped)
    }
  }

  // Sort all arrays for deterministic output
  for (const data of result.values()) {
    data.ageRanges.sort()
    data.genders.sort()
    data.incomes.sort()
    data.parentalStatuses.sort()
  }

  return result
}

const DEMOGRAPHIC_QUERY = `
SELECT
  campaign.id,
  campaign_criterion.type,
  campaign_criterion.age_range.type,
  campaign_criterion.gender.type,
  campaign_criterion.parental_status.type,
  campaign_criterion.income_range.type,
  campaign_criterion.bid_modifier
FROM campaign_criterion
WHERE campaign_criterion.type IN ('AGE_RANGE', 'GENDER', 'PARENTAL_STATUS', 'INCOME_RANGE')
  AND campaign_criterion.negative = FALSE
  AND campaign.status != 'REMOVED'`.trim()

export async function fetchDemographicTargeting(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Map<string, DemographicData>> {
  let query = DEMOGRAPHIC_QUERY
  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const rows = await client.query(query)
  return normalizeDemographicRows(rows)
}

// ─── Schedule Bid Adjustments ─────────────────────────────────

type ScheduleBidData = {
  day: string
  startHour: number
  endHour: number
  bidAdjustment: number
}

/**
 * Normalize schedule criterion rows with bid modifiers into per-campaign schedule bid data.
 * Only includes entries where bid_modifier != 1.0 (i.e., actual adjustments).
 */
export function normalizeScheduleBidRows(rows: GoogleAdsRow[]): Map<string, ScheduleBidData[]> {
  const result = new Map<string, ScheduleBidData[]>()

  for (const row of rows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)

    const adSchedule = (criterion.ad_schedule ?? criterion.adSchedule) as Record<string, unknown>
    if (!adSchedule) continue

    const bidModifier = Number(criterion?.bid_modifier ?? criterion?.bidModifier ?? 1.0)
    const bidAdjustment = bidModifier - 1.0

    // Skip no-op modifiers
    if (Math.abs(bidAdjustment) < 1e-9) continue

    const rawDay = (adSchedule.day_of_week ?? adSchedule.dayOfWeek) as number | string
    const day = DAY_OF_WEEK_MAP[rawDay]
    if (!day) continue

    const startHour = Number(adSchedule.start_hour ?? adSchedule.startHour ?? 0)
    const endHour = Number(adSchedule.end_hour ?? adSchedule.endHour ?? 24)

    if (!result.has(campaignId)) {
      result.set(campaignId, [])
    }
    result.get(campaignId)!.push({
      day,
      startHour,
      endHour,
      bidAdjustment: Math.round(bidAdjustment * 1e10) / 1e10, // avoid floating point noise
    })
  }

  return result
}

// ─── Location Bid Adjustments ─────────────────────────────────

/**
 * Extract bid modifiers from geo/location criterion rows.
 * Returns Map<campaignId, Record<countryCode, bidAdjustment>>.
 * Only includes entries where bid_modifier is present and != 1.0.
 */
export function normalizeGeoBidModifiers(
  rows: GoogleAdsRow[],
  geoReverse: Record<string, string>,
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>()

  for (const row of rows) {
    const campaign = row.campaign as Record<string, unknown>
    const criterion = (row.campaign_criterion ?? row.campaignCriterion) as Record<string, unknown>
    const campaignId = str(campaign?.id)
    const type = str(criterion?.type)

    if (type !== 'LOCATION') continue

    const bidModifier = criterion?.bid_modifier ?? criterion?.bidModifier
    if (bidModifier === undefined || bidModifier === null) continue

    const bidMod = Number(bidModifier)
    const bidAdjustment = bidMod - 1.0
    if (Math.abs(bidAdjustment) < 1e-9) continue

    const location = criterion.location as Record<string, unknown>
    const geoConstant = str(location?.geoTargetConstant ?? location?.geo_target_constant)
    const code = geoReverse[geoConstant] ?? geoConstant
    if (!code) continue

    if (!result.has(campaignId)) {
      result.set(campaignId, {})
    }
    result.get(campaignId)![code] = Math.round(bidAdjustment * 1e10) / 1e10
  }

  return result
}

// ─── Audience Targeting ───────────────────────────────────────

/**
 * Normalize audience criterion rows into per-ad-group audience targets.
 * Audiences operate at the ad group level, not campaign level.
 */
export function normalizeAudienceRows(rows: GoogleAdsRow[]): Map<string, AudienceTarget> {
  const result = new Map<string, AudienceTarget>()

  for (const row of rows) {
    const adGroup = (row.ad_group ?? row.adGroup) as Record<string, unknown>
    const criterion = (row.ad_group_criterion ?? row.adGroupCriterion) as Record<string, unknown>

    const adGroupId = str(adGroup?.id)
    const type = str(criterion?.type)

    const bidModifier = Number(criterion?.bid_modifier ?? criterion?.bidModifier ?? 1.0)
    const bidAdjustment = bidModifier - 1.0
    const hasBidAdjustment = Math.abs(bidAdjustment) >= 1e-9

    let ref: AudienceRef | null = null

    if (type === 'USER_LIST') {
      const userList = (criterion.user_list ?? criterion.userList) as Record<string, unknown>
      const listPath = str(userList?.user_list ?? userList?.userList)
      const listId = extractId(listPath)
      ref = {
        kind: 'remarketing' as const,
        listId,
        ...(hasBidAdjustment ? { bidAdjustment: Math.round(bidAdjustment * 1e10) / 1e10 } : {}),
      }
    } else if (type === 'CUSTOM_AUDIENCE') {
      const customAud = (criterion.custom_audience ?? criterion.customAudience) as Record<string, unknown>
      const audPath = str(customAud?.custom_audience ?? customAud?.customAudience)
      const audienceId = extractId(audPath)
      ref = {
        kind: 'custom' as const,
        audienceId,
        ...(hasBidAdjustment ? { bidAdjustment: Math.round(bidAdjustment * 1e10) / 1e10 } : {}),
      }
    } else if (type === 'USER_INTEREST') {
      const userInterest = (criterion.user_interest ?? criterion.userInterest) as Record<string, unknown>
      const catPath = str(userInterest?.user_interest_category ?? userInterest?.userInterestCategory)
      const categoryId = extractId(catPath)
      ref = {
        kind: 'in-market' as const,
        categoryId,
        ...(hasBidAdjustment ? { bidAdjustment: Math.round(bidAdjustment * 1e10) / 1e10 } : {}),
      }
    }

    if (!ref) continue

    if (!result.has(adGroupId)) {
      result.set(adGroupId, { type: 'audience', audiences: [], mode: 'observation' })
    }
    // AudienceTarget has readonly audiences, so we need to cast to push
    ;(result.get(adGroupId)!.audiences as AudienceRef[]).push(ref)
  }

  return result
}

const AUDIENCE_QUERY = `
SELECT
  ad_group.id,
  ad_group_criterion.type,
  ad_group_criterion.user_list.user_list,
  ad_group_criterion.user_interest.user_interest_category,
  ad_group_criterion.custom_audience.custom_audience,
  ad_group_criterion.bid_modifier,
  ad_group_criterion.status,
  campaign.id
FROM ad_group_criterion
WHERE ad_group_criterion.type IN ('USER_LIST', 'USER_INTEREST', 'CUSTOM_AUDIENCE')
  AND ad_group_criterion.status != 'REMOVED'
  AND campaign.status != 'REMOVED'`.trim()

export async function fetchAudienceTargeting(
  client: GoogleAdsClient,
  campaignIds?: string[],
): Promise<Map<string, AudienceTarget>> {
  let query = AUDIENCE_QUERY
  if (campaignIds?.length) {
    query += `\n  AND campaign.id IN (${campaignIds.join(', ')})`
  }
  const rows = await client.query(query)
  return normalizeAudienceRows(rows)
}
