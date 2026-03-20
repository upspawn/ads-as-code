// test/unit/reddit-builder.test.ts
import { describe, test, expect } from 'bun:test'
import { reddit } from '../../src/reddit'
import type { RedditCampaign } from '../../src/reddit/types'

describe('reddit campaign builder', () => {
  test('reddit.traffic() creates a traffic campaign builder', () => {
    const campaign = reddit.traffic('Test Campaign').build()
    expect(campaign.provider).toBe('reddit')
    expect(campaign.kind).toBe('traffic')
    expect(campaign.name).toBe('Test Campaign')
    expect(campaign.adGroups).toEqual([])
  })

  test('all 7 objective factory methods exist', () => {
    expect(typeof reddit.awareness).toBe('function')
    expect(typeof reddit.traffic).toBe('function')
    expect(typeof reddit.engagement).toBe('function')
    expect(typeof reddit.videoViews).toBe('function')
    expect(typeof reddit.appInstalls).toBe('function')
    expect(typeof reddit.conversions).toBe('function')
    expect(typeof reddit.leads).toBe('function')
  })

  test('builder is immutable — adGroup returns new instance', () => {
    const a = reddit.traffic('Campaign')
    const b = a.adGroup('Group 1', { targeting: [] }, [])
    const c = a.adGroup('Group 2', { targeting: [] }, [])

    expect(a.build().adGroups).toHaveLength(0)
    expect(b.build().adGroups).toHaveLength(1)
    expect(c.build().adGroups).toHaveLength(1)
    expect(b.build().adGroups[0]!.name).toBe('Group 1')
    expect(c.build().adGroups[0]!.name).toBe('Group 2')
  })

  test('chained adGroups accumulate', () => {
    const campaign = reddit.traffic('Campaign')
      .adGroup('Group 1', { targeting: [] }, [])
      .adGroup('Group 2', { targeting: [] }, [])
      .build()

    expect(campaign.adGroups).toHaveLength(2)
    expect(campaign.adGroups[0]!.name).toBe('Group 1')
    expect(campaign.adGroups[1]!.name).toBe('Group 2')
  })

  test('config is passed through to campaign', () => {
    const campaign = reddit.traffic('Campaign', {
      status: 'paused',
      spendCap: 1000_000_000,
    }).build()

    expect(campaign.config.status).toBe('paused')
    expect(campaign.config.spendCap).toBe(1000_000_000)
  })

  test('build output is frozen', () => {
    const campaign = reddit.traffic('Campaign').build()
    expect(Object.isFrozen(campaign)).toBe(true)
    expect(Object.isFrozen(campaign.adGroups)).toBe(true)
  })

  test('adGroup config and ads are preserved', () => {
    const targeting = [{ _type: 'geo' as const, locations: ['US'] }]
    const ads = [{
      format: 'image' as const,
      filePath: './hero.jpg',
      config: { headline: 'Test', clickUrl: 'https://example.com' },
    }]

    const campaign = reddit.traffic('Campaign')
      .adGroup('My Group', { targeting, bid: { type: 'MANUAL_BID', amount: 150_000 } }, ads)
      .build()

    const group = campaign.adGroups[0]!
    expect(group.config.targeting).toEqual(targeting)
    expect(group.config.bid).toEqual({ type: 'MANUAL_BID', amount: 150_000 })
    expect(group.ads).toEqual(ads)
  })
})
