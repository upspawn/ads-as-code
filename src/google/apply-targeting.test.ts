import { describe, expect, test } from 'bun:test'
import { changeToMutations } from './apply.ts'
import type { Change, Resource } from '../core/types.ts'

// ─── Helpers ──────────────────────────────────────────────

const CUSTOMER_ID = '1234567890'

function campaignCreate(targeting: Record<string, unknown>): Change {
  const resource: Resource = {
    kind: 'campaign',
    path: 'test-campaign',
    properties: {
      name: 'Test Campaign',
      status: 'enabled',
      budget: { amount: 10, currency: 'EUR', period: 'daily' },
      bidding: { type: 'maximize-clicks' },
      targeting,
    },
  }
  return { op: 'create', resource }
}

// ─── Demographic Apply ───────────────────────────────────

describe('buildTargetingOperations — demographics', () => {
  test('creates campaign criteria for age ranges', () => {
    const change = campaignCreate({
      rules: [
        { type: 'geo', countries: ['US'] },
        { type: 'language', languages: ['en'] },
        { type: 'demographic', ageRanges: ['25-34', '35-44'], genders: ['male'] },
      ],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    // Find demographic criteria (they use campaign_criterion operation with age_range or gender)
    const demoCriteria = ops.filter(op =>
      op.operation === 'campaign_criterion' &&
      (op.resource.age_range || op.resource.gender),
    )
    expect(demoCriteria.length).toBe(3) // 2 age ranges + 1 gender
  })

  test('creates correct age_range enum values', () => {
    const change = campaignCreate({
      rules: [{ type: 'demographic', ageRanges: ['25-34'] }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const ageOp = ops.find(op => op.resource.age_range)
    expect(ageOp).toBeDefined()
    expect(ageOp!.resource.age_range).toEqual({ type: 'AGE_RANGE_25_34' })
  })

  test('creates correct gender enum values', () => {
    const change = campaignCreate({
      rules: [{ type: 'demographic', genders: ['female'] }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const genderOp = ops.find(op => op.resource.gender)
    expect(genderOp).toBeDefined()
    expect(genderOp!.resource.gender).toEqual({ type: 'FEMALE' })
  })

  test('creates correct income_range enum values', () => {
    const change = campaignCreate({
      rules: [{ type: 'demographic', incomes: ['top-10%'] }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const incomeOp = ops.find(op => op.resource.income_range)
    expect(incomeOp).toBeDefined()
    expect(incomeOp!.resource.income_range).toEqual({ type: 'INCOME_RANGE_90_100' })
  })

  test('creates correct parental_status enum values', () => {
    const change = campaignCreate({
      rules: [{ type: 'demographic', parentalStatuses: ['parent'] }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const parentOp = ops.find(op => op.resource.parental_status)
    expect(parentOp).toBeDefined()
    expect(parentOp!.resource.parental_status).toEqual({ type: 'PARENT' })
  })
})

// ─── Schedule Bid Apply ──────────────────────────────────

describe('buildTargetingOperations — schedule-bid', () => {
  test('creates ad_schedule criterion with bid_modifier', () => {
    const change = campaignCreate({
      rules: [{ type: 'schedule-bid', day: 'mon', startHour: 9, endHour: 17, bidAdjustment: 0.2 }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const scheduleOp = ops.find(op => op.resource.ad_schedule)
    expect(scheduleOp).toBeDefined()
    expect(scheduleOp!.resource.ad_schedule).toEqual({
      day_of_week: 2, // mon
      start_hour: 9,
      start_minute: 'ZERO',
      end_hour: 17,
      end_minute: 'ZERO',
    })
    expect(scheduleOp!.resource.bid_modifier).toBeCloseTo(1.2)
  })

  test('maps all days correctly', () => {
    const dayMap: Record<string, number> = {
      mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7, sun: 8,
    }
    for (const [day, expectedNum] of Object.entries(dayMap)) {
      const change = campaignCreate({
        rules: [{ type: 'schedule-bid', day, startHour: 0, endHour: 24, bidAdjustment: 0.1 }],
      })
      const ops = changeToMutations(change, CUSTOMER_ID, new Map())
      const scheduleOp = ops.find(op => op.resource.ad_schedule)
      expect(scheduleOp!.resource.ad_schedule.day_of_week).toBe(expectedNum)
    }
  })
})

// ─── Geo Bid Adjustment Apply ────────────────────────────

describe('buildTargetingOperations — geo with bidAdjustments', () => {
  test('applies bid_modifier to geo criteria when bidAdjustments present', () => {
    const change = campaignCreate({
      rules: [{
        type: 'geo',
        countries: ['US', 'DE'],
        bidAdjustments: { 'US': 0.3 },
      }],
    })
    const ops = changeToMutations(change, CUSTOMER_ID, new Map())
    const geoCriteria = ops.filter(op => op.resource.location)
    expect(geoCriteria.length).toBe(2)

    // US should have bid_modifier
    const usOp = geoCriteria.find(op =>
      (op.resource.location as any).geo_target_constant.includes('2840'),
    )
    expect(usOp).toBeDefined()
    expect(usOp!.resource.bid_modifier).toBeCloseTo(1.3)

    // DE should NOT have bid_modifier (or it should be undefined)
    const deOp = geoCriteria.find(op =>
      (op.resource.location as any).geo_target_constant.includes('2276'),
    )
    expect(deOp).toBeDefined()
    expect(deOp!.resource.bid_modifier).toBeUndefined()
  })
})
