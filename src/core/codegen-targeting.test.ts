import { describe, expect, test } from 'bun:test'
import { generateCampaignFile } from './codegen.ts'
import type { Resource } from './types.ts'

// ─── Helpers ──────────────────────────────────────────────

function campaignResource(targeting: Record<string, unknown>): Resource {
  return {
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
}

function adGroupResource(): Resource {
  return {
    kind: 'adGroup',
    path: 'test-campaign/main',
    properties: { status: 'enabled' },
  }
}

function keywordResource(): Resource {
  return {
    kind: 'keyword',
    path: 'test-campaign/main/kw:test:EXACT',
    properties: { text: 'test', matchType: 'EXACT' },
  }
}

function adResource(): Resource {
  return {
    kind: 'ad',
    path: 'test-campaign/main/rsa:abc123',
    properties: {
      headlines: ['H1', 'H2', 'H3'],
      descriptions: ['D1', 'D2'],
      finalUrl: 'https://example.com',
    },
  }
}

function baseResources(targeting: Record<string, unknown>): Resource[] {
  return [campaignResource(targeting), adGroupResource(), keywordResource(), adResource()]
}

// ─── Demographic Codegen ──────────────────────────────────

describe('formatTargeting — demographics', () => {
  test('emits demographics() with age ranges', () => {
    const code = generateCampaignFile(
      baseResources({ rules: [{ type: 'demographic', ageRanges: ['25-34', '35-44'] }] }),
      'Test Campaign',
    )
    expect(code).toContain("demographics({ ageRanges: ['25-34', '35-44'] })")
    expect(code).toContain('demographics')
    expect(code).toMatch(/import .* demographics/)
  })

  test('emits demographics() with genders', () => {
    const code = generateCampaignFile(
      baseResources({ rules: [{ type: 'demographic', genders: ['male', 'female'] }] }),
      'Test Campaign',
    )
    expect(code).toContain("demographics({ genders: ['male', 'female'] })")
  })

  test('emits demographics() with all fields', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'demographic',
          ageRanges: ['25-34'],
          genders: ['male'],
          incomes: ['top-10%'],
          parentalStatuses: ['parent'],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("ageRanges: ['25-34']")
    expect(code).toContain("genders: ['male']")
    expect(code).toContain("incomes: ['top-10%']")
    expect(code).toContain("parentalStatuses: ['parent']")
  })
})

// ─── Schedule Bid Codegen ─────────────────────────────────

describe('formatTargeting — schedule-bid', () => {
  test('emits scheduleBid() helper call', () => {
    const code = generateCampaignFile(
      baseResources({ rules: [{ type: 'schedule-bid', day: 'mon', startHour: 9, endHour: 17, bidAdjustment: 0.2 }] }),
      'Test Campaign',
    )
    expect(code).toContain("scheduleBid('mon', 9, 17, 0.2)")
    expect(code).toMatch(/import .* scheduleBid/)
  })
})

// ─── Location Bid Codegen ─────────────────────────────────

describe('formatTargeting — geo with bidAdjustments', () => {
  test('emits geo() with bidAdjustments option', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'geo',
          countries: ['US', 'DE'],
          bidAdjustments: { 'US': 0.3 },
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("geo('US', 'DE'")
    expect(code).toContain("bidAdjustments: { 'US': 0.3 }")
  })
})

// ─── Audience Codegen ─────────────────────────────────────

describe('formatTargeting — audience', () => {
  test('emits audiences() for observation mode', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'audience',
          mode: 'observation',
          audiences: [{ kind: 'remarketing', listId: '456' }],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("audiences(remarketing('456'))")
    expect(code).toMatch(/import .* audiences/)
    expect(code).toMatch(/import .* remarketing/)
  })

  test('emits audienceTargeting() for targeting mode', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'audience',
          mode: 'targeting',
          audiences: [{ kind: 'remarketing', listId: '456' }],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("audienceTargeting(remarketing('456'))")
    expect(code).toMatch(/import .* audienceTargeting/)
  })

  test('emits in-market audience with name and bidAdjustment', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'audience',
          mode: 'observation',
          audiences: [{ kind: 'in-market', categoryId: '80432', name: 'Business Software', bidAdjustment: 0.5 }],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("inMarket('80432', { name: 'Business Software', bidAdjustment: 0.5 })")
    expect(code).toMatch(/import .* inMarket/)
  })

  test('emits custom audience', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'audience',
          mode: 'observation',
          audiences: [{ kind: 'custom', audienceId: '789' }],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("customAudience('789')")
    expect(code).toMatch(/import .* customAudience/)
  })

  test('emits multiple audience refs', () => {
    const code = generateCampaignFile(
      baseResources({
        rules: [{
          type: 'audience',
          mode: 'observation',
          audiences: [
            { kind: 'remarketing', listId: '111' },
            { kind: 'in-market', categoryId: '222' },
          ],
        }],
      }),
      'Test Campaign',
    )
    expect(code).toContain("remarketing('111')")
    expect(code).toContain("inMarket('222')")
  })
})
