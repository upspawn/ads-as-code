import { describe, test, expect } from 'bun:test'
import type { SearchCampaignInput, AdGroupInput, DisplayCampaignInput } from '../../src/google/types.ts'
import type { MetaCampaignConfig, AdSetConfig } from '../../src/meta/types.ts'
import type { AdsConfig } from '../../src/core/types.ts'

describe('PerformanceTargets on Google builders', () => {
  test('SearchCampaignInput accepts performance field', () => {
    const input: SearchCampaignInput = {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
      performance: { targetCPA: 15, maxBudget: { amount: 50, currency: 'EUR', period: 'daily' as const } },
    }
    expect(input.performance?.targetCPA).toBe(15)
  })

  test('AdGroupInput accepts performance field', () => {
    const input: AdGroupInput = {
      keywords: [],
      ad: { type: 'rsa' as const, headlines: [] as any, descriptions: [] as any, finalUrl: 'https://example.com' },
      performance: { targetCPA: 10 },
    }
    expect(input.performance?.targetCPA).toBe(10)
  })

  test('performance is optional', () => {
    const input: SearchCampaignInput = {
      budget: { amount: 10, currency: 'EUR', period: 'daily' as const },
      bidding: 'maximize-conversions',
    }
    expect(input.performance).toBeUndefined()
  })
})

describe('PerformanceTargets on Meta builders', () => {
  test('MetaCampaignConfig accepts performance field', () => {
    const config: MetaCampaignConfig = {
      budget: { amount: 200, currency: 'EUR', period: 'daily' as const },
      performance: { targetCPA: 30, strategy: 'Scale aggressively' },
    }
    expect(config.performance?.strategy).toBe('Scale aggressively')
  })

  test('AdSetConfig accepts performance field', () => {
    const config: AdSetConfig<'traffic'> = {
      targeting: { geo: [{ type: 'geo', countries: ['US'] }] },
      performance: { targetCPA: 25 },
    }
    expect(config.performance?.targetCPA).toBe(25)
  })
})

describe('AdsConfig', () => {
  test('accepts performance config', () => {
    const config: AdsConfig = {
      performance: { defaultPeriod: '7d', severityThresholds: { warning: 0.2, critical: 0.5 } },
    }
    expect(config.performance?.defaultPeriod).toBe('7d')
  })
})
