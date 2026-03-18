import { describe, expect, test } from 'bun:test'
import { resolveAllMarkers } from './resolve.ts'
import { sharedBudget } from '../google/shared-types.ts'
import { daily } from '../helpers/budget.ts'
import { flattenAll } from '../google/flatten.ts'
import type { GoogleSearchCampaign } from '../google/types.ts'
import type { SharedBudgetConfig } from '../google/shared-types.ts'
import type { Headline, Description, Keyword } from '../core/types.ts'

// ─── Helpers ──────────────────────────────────────────────

function minimalSearchCampaign(name: string): GoogleSearchCampaign {
  return {
    provider: 'google',
    kind: 'search',
    name,
    status: 'enabled',
    budget: daily(5),
    bidding: { type: 'maximize-clicks' },
    targeting: { rules: [] },
    negatives: [],
    groups: {
      main: {
        keywords: [{ text: 'test keyword', matchType: 'EXACT' } as Keyword],
        ads: [
          {
            type: 'rsa' as const,
            headlines: ['Headline 1' as Headline],
            descriptions: ['Description 1' as Description],
            finalUrl: 'https://example.com',
          },
        ],
      },
    },
  }
}

// ─── resolveAllMarkers ────────────────────────────────────

describe('resolveAllMarkers', () => {
  test('shared budget passes through unchanged (no .groups property)', async () => {
    const budget = sharedBudget('Test Budget', daily(10))

    const result = await resolveAllMarkers([
      { file: 'test-budget.ts', campaign: budget },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(budget)
  })

  test('handles mix of shared budget and regular campaign', async () => {
    const budget = sharedBudget('Shared Budget', daily(20))
    const campaign = minimalSearchCampaign('Test Campaign')

    const result = await resolveAllMarkers([
      { file: 'budget.ts', campaign: budget },
      { file: 'campaign.ts', campaign },
    ])

    expect(result).toHaveLength(2)
    // Shared budget unchanged
    expect(result[0]).toEqual(budget)
    // Campaign unchanged (no AI markers)
    expect(result[1]).toEqual(campaign)
  })
})

// ─── flattenAll (Google) ──────────────────────────────────

describe('flattenAll with mixed resource types', () => {
  test('flattens shared budget alongside a regular campaign', () => {
    const budget: SharedBudgetConfig = sharedBudget('Search Budget', daily(15))
    const campaign = minimalSearchCampaign('My Campaign')

    const resources = flattenAll([budget, campaign])

    // Shared budget produces 1 resource
    const budgetResources = resources.filter((r) => r.kind === 'sharedBudget')
    expect(budgetResources).toHaveLength(1)
    expect(budgetResources[0]!.properties.name).toBe('Search Budget')
    expect(budgetResources[0]!.properties.amount).toBe(15)

    // Campaign produces campaign + adGroup + keyword + ad = 4 resources minimum
    const campaignResources = resources.filter((r) => r.kind === 'campaign')
    expect(campaignResources).toHaveLength(1)
    expect(campaignResources[0]!.properties.name).toBe('My Campaign')
  })
})
