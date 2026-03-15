import { describe, expect, test } from 'bun:test'
import type { GoogleAdsRow } from './types.ts'
import { normalizeDemographicRows, normalizeScheduleBidRows, normalizeAudienceRows, normalizeGeoBidModifiers } from './fetch-targeting.ts'

// ─── Demographic Targeting ────────────────────────────────────

describe('normalizeDemographicRows', () => {
  test('maps age range enums to SDK types', () => {
    const rows: GoogleAdsRow[] = [
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_18_24' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_25_34' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_35_44' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_45_54' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_55_64' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_65_UP' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'AGE_RANGE', age_range: { type: 'AGE_RANGE_UNDETERMINED' }, bid_modifier: 1.0 } },
    ]
    const result = normalizeDemographicRows(rows)
    expect(result.get('1')).toBeDefined()
    const demo = result.get('1')!
    expect(demo.ageRanges).toEqual(['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'undetermined'])
  })

  test('maps gender enums to SDK types', () => {
    const rows: GoogleAdsRow[] = [
      { campaign: { id: '1' }, campaign_criterion: { type: 'GENDER', gender: { type: 'MALE' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'GENDER', gender: { type: 'FEMALE' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'GENDER', gender: { type: 'UNDETERMINED' }, bid_modifier: 1.0 } },
    ]
    const result = normalizeDemographicRows(rows)
    expect(result.get('1')!.genders).toEqual(['female', 'male', 'undetermined'])
  })

  test('maps parental status enums to SDK types', () => {
    const rows: GoogleAdsRow[] = [
      { campaign: { id: '1' }, campaign_criterion: { type: 'PARENTAL_STATUS', parental_status: { type: 'PARENT' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'PARENTAL_STATUS', parental_status: { type: 'NOT_A_PARENT' }, bid_modifier: 1.0 } },
    ]
    const result = normalizeDemographicRows(rows)
    expect(result.get('1')!.parentalStatuses).toEqual(['not-parent', 'parent'])
  })

  test('maps income range enums to SDK types', () => {
    const rows: GoogleAdsRow[] = [
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_0_50' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_50_60' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_60_70' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_70_80' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_80_90' }, bid_modifier: 1.0 } },
      { campaign: { id: '1' }, campaign_criterion: { type: 'INCOME_RANGE', income_range: { type: 'INCOME_RANGE_90_100' }, bid_modifier: 1.0 } },
    ]
    const result = normalizeDemographicRows(rows)
    expect(result.get('1')!.incomes).toEqual(['11-20%', '21-30%', '31-40%', '41-50%', 'lower-50%', 'top-10%'])
  })

  test('groups demographics across multiple campaigns', () => {
    const rows: GoogleAdsRow[] = [
      { campaign: { id: '1' }, campaign_criterion: { type: 'GENDER', gender: { type: 'MALE' }, bid_modifier: 1.0 } },
      { campaign: { id: '2' }, campaign_criterion: { type: 'GENDER', gender: { type: 'FEMALE' }, bid_modifier: 1.0 } },
    ]
    const result = normalizeDemographicRows(rows)
    expect(result.get('1')!.genders).toEqual(['male'])
    expect(result.get('2')!.genders).toEqual(['female'])
  })

  test('returns empty map for no rows', () => {
    const result = normalizeDemographicRows([])
    expect(result.size).toBe(0)
  })
})

// ─── Schedule Bid Adjustments ────────────────────────────────

describe('normalizeScheduleBidRows', () => {
  test('creates schedule-bid rules when bid_modifier != 1.0', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 'MONDAY', start_hour: 9, end_hour: 17 },
          bid_modifier: 1.2,
        },
      },
    ]
    const result = normalizeScheduleBidRows(rows)
    expect(result.get('1')).toEqual([
      { day: 'mon', startHour: 9, endHour: 17, bidAdjustment: 0.2 },
    ])
  })

  test('skips schedule entries with bid_modifier == 1.0', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 'TUESDAY', start_hour: 0, end_hour: 24 },
          bid_modifier: 1.0,
        },
      },
    ]
    const result = normalizeScheduleBidRows(rows)
    expect(result.has('1')).toBe(false)
  })

  test('handles numeric gRPC day_of_week values', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 6, start_hour: 8, end_hour: 20 },
          bid_modifier: 0.7,
        },
      },
    ]
    const result = normalizeScheduleBidRows(rows)
    expect(result.get('1')).toEqual([
      { day: 'fri', startHour: 8, endHour: 20, bidAdjustment: -0.3 },
    ])
  })

  test('groups multiple schedule bids per campaign', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 'MONDAY', start_hour: 9, end_hour: 17 },
          bid_modifier: 1.2,
        },
      },
      {
        campaign: { id: '1' },
        campaign_criterion: {
          ad_schedule: { day_of_week: 'SATURDAY', start_hour: 10, end_hour: 14 },
          bid_modifier: 0.5,
        },
      },
    ]
    const result = normalizeScheduleBidRows(rows)
    expect(result.get('1')!.length).toBe(2)
  })
})

// ─── Location Bid Adjustments ────────────────────────────────

describe('normalizeGeoBidModifiers', () => {
  test('extracts bid modifiers from geo rows', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geo_target_constant: 'geoTargetConstants/2840' }, // US
          bid_modifier: 1.3,
        },
      },
    ]
    // geoReverse maps 'geoTargetConstants/2840' -> 'US'
    const geoReverse: Record<string, string> = { 'geoTargetConstants/2840': 'US' }
    const result = normalizeGeoBidModifiers(rows, geoReverse)
    expect(result.get('1')).toEqual({ 'US': 0.3 })
  })

  test('skips locations with bid_modifier == 1.0 or undefined', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geo_target_constant: 'geoTargetConstants/2840' },
          bid_modifier: 1.0,
        },
      },
      {
        campaign: { id: '1' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geo_target_constant: 'geoTargetConstants/2276' },
        },
      },
    ]
    const geoReverse: Record<string, string> = {
      'geoTargetConstants/2840': 'US',
      'geoTargetConstants/2276': 'DE',
    }
    const result = normalizeGeoBidModifiers(rows, geoReverse)
    expect(result.has('1')).toBe(false)
  })

  test('handles multiple locations with bid adjustments', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geo_target_constant: 'geoTargetConstants/2840' },
          bid_modifier: 1.3,
        },
      },
      {
        campaign: { id: '1' },
        campaign_criterion: {
          type: 'LOCATION',
          location: { geo_target_constant: 'geoTargetConstants/2276' },
          bid_modifier: 0.8,
        },
      },
    ]
    const geoReverse: Record<string, string> = {
      'geoTargetConstants/2840': 'US',
      'geoTargetConstants/2276': 'DE',
    }
    const result = normalizeGeoBidModifiers(rows, geoReverse)
    const bids = result.get('1')!
    expect(bids['US']).toBeCloseTo(0.3)
    expect(bids['DE']).toBeCloseTo(-0.2)
  })
})

// ─── Audience Targeting ────────────────────────────────────────

describe('normalizeAudienceRows', () => {
  test('maps USER_LIST to remarketing audience ref', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'USER_LIST',
          user_list: { user_list: 'customers/123/userLists/456' },
          bid_modifier: 1.0,
          status: 'ENABLED',
        },
      },
    ]
    const result = normalizeAudienceRows(rows)
    expect(result.get('100')).toBeDefined()
    const audienceTarget = result.get('100')!
    expect(audienceTarget.audiences.length).toBe(1)
    expect(audienceTarget.audiences[0]!.kind).toBe('remarketing')
    expect((audienceTarget.audiences[0] as any).listId).toBe('456')
  })

  test('maps CUSTOM_AUDIENCE to custom audience ref', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'CUSTOM_AUDIENCE',
          custom_audience: { custom_audience: 'customers/123/customAudiences/789' },
          bid_modifier: 1.0,
          status: 'ENABLED',
        },
      },
    ]
    const result = normalizeAudienceRows(rows)
    const audience = result.get('100')!.audiences[0]!
    expect(audience.kind).toBe('custom')
    expect((audience as any).audienceId).toBe('789')
  })

  test('maps USER_INTEREST to in-market audience ref', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'USER_INTEREST',
          user_interest: { user_interest_category: 'customers/123/userInterests/80432' },
          bid_modifier: 1.0,
          status: 'ENABLED',
        },
      },
    ]
    const result = normalizeAudienceRows(rows)
    const audience = result.get('100')!.audiences[0]!
    expect(audience.kind).toBe('in-market')
    expect((audience as any).categoryId).toBe('80432')
  })

  test('extracts bid adjustments from audience criteria', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'USER_LIST',
          user_list: { user_list: 'customers/123/userLists/456' },
          bid_modifier: 1.5,
          status: 'ENABLED',
        },
      },
    ]
    const result = normalizeAudienceRows(rows)
    expect(result.get('100')!.audiences[0]!.bidAdjustment).toBeCloseTo(0.5)
  })

  test('groups multiple audiences per ad group', () => {
    const rows: GoogleAdsRow[] = [
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'USER_LIST',
          user_list: { user_list: 'customers/123/userLists/456' },
          bid_modifier: 1.0,
          status: 'ENABLED',
        },
      },
      {
        campaign: { id: '1' },
        ad_group: { id: '100' },
        ad_group_criterion: {
          type: 'CUSTOM_AUDIENCE',
          custom_audience: { custom_audience: 'customers/123/customAudiences/789' },
          bid_modifier: 1.2,
          status: 'ENABLED',
        },
      },
    ]
    const result = normalizeAudienceRows(rows)
    expect(result.get('100')!.audiences.length).toBe(2)
  })
})
