// test/unit/reddit-types.test.ts
import { describe, test, expect } from 'bun:test'
import type {
  Objective,
  OptimizationGoalMap,
  RedditCampaignConfig,
  AdGroupConfig,
  RedditAd,
  RedditBidStrategy,
  RedditTargetingRule,
  RedditPlacement,
  RedditCTA,
  RedditSchedule,
  DaypartRule,
  RedditProviderConfig,
} from '../../src/reddit/types'

describe('reddit types', () => {
  test('objectives are correct set', () => {
    const objectives: Objective[] = [
      'awareness', 'traffic', 'engagement', 'video-views',
      'app-installs', 'conversions', 'leads',
    ]
    expect(objectives).toHaveLength(7)
  })

  test('RedditProviderConfig requires accountId', () => {
    const config: RedditProviderConfig = { accountId: 'a2_test123' }
    expect(config.accountId).toBe('a2_test123')
  })

  test('RedditProviderConfig supports all credential fields', () => {
    const config: RedditProviderConfig = {
      accountId: 'a2_test123',
      appId: 'app-id',
      appSecret: 'secret',
      refreshToken: 'token',
      username: 'user',
      password: 'pass',
      userAgent: 'ads-as-code/1.0',
      currency: 'USD',
      credentials: '~/.ads/credentials.json',
    }
    expect(config.appId).toBe('app-id')
  })

  test('CTA options include all 13 values', () => {
    const ctas: RedditCTA[] = [
      'INSTALL', 'DOWNLOAD', 'LEARN_MORE', 'SIGN_UP', 'SHOP_NOW',
      'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'SUBSCRIBE',
      'APPLY_NOW', 'WATCH_MORE', 'PLAY_NOW', 'SEE_MENU',
    ]
    expect(ctas).toHaveLength(13)
  })

  test('bid strategies cover all 3 types', () => {
    const strategies: RedditBidStrategy[] = [
      { type: 'LOWEST_COST' },
      { type: 'COST_CAP', amount: 500_000 },
      { type: 'MANUAL_BID', amount: 150_000 },
    ]
    expect(strategies).toHaveLength(3)
  })

  test('schedule supports dayparting', () => {
    const schedule: RedditSchedule = {
      start: '2026-04-01',
      end: '2026-04-30',
      dayparting: [{ days: ['mon', 'tue'], startHour: 9, endHour: 17 }],
    }
    expect(schedule.dayparting).toHaveLength(1)
  })

  test('placement types', () => {
    const placements: RedditPlacement[] = ['FEED', 'CONVERSATION', 'ALL']
    expect(placements).toHaveLength(3)
  })
})
