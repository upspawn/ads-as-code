import { describe, expect, test } from 'bun:test'
import { flattenVideo, flattenAll } from '../../src/google/flatten.ts'
import { changeToMutations } from '../../src/google/apply.ts'
import { generateCampaignFile } from '../../src/core/codegen.ts'
import type { Budget, Targeting, Resource } from '../../src/core/types.ts'
import type { GoogleVideoCampaign } from '../../src/google/types.ts'

// ─── Helpers ────────────────────────────────────────────────

const budget: Budget = { amount: 20, currency: 'EUR', period: 'daily' }

const usTargeting: Targeting = {
  rules: [
    { type: 'geo', countries: ['US', 'DE'] },
    { type: 'language', languages: ['en', 'de'] },
  ],
}

function makeVideoCampaign(overrides?: Partial<GoogleVideoCampaign>): GoogleVideoCampaign {
  return {
    provider: 'google',
    kind: 'video',
    name: 'Video - YouTube Ads',
    status: 'enabled',
    budget,
    bidding: { type: 'target-cpm' },
    targeting: usTargeting,
    ...overrides,
  }
}

// ─── Type Shape ──────────────────────────────────────────────

describe('GoogleVideoCampaign type', () => {
  test('has correct kind and provider', () => {
    const campaign = makeVideoCampaign()
    expect(campaign.provider).toBe('google')
    expect(campaign.kind).toBe('video')
  })

  test('holds all required fields', () => {
    const campaign = makeVideoCampaign()
    expect(campaign.name).toBe('Video - YouTube Ads')
    expect(campaign.status).toBe('enabled')
    expect(campaign.budget).toEqual(budget)
    expect(campaign.bidding).toEqual({ type: 'target-cpm' })
    expect(campaign.targeting).toEqual(usTargeting)
  })

  test('can be paused', () => {
    const campaign = makeVideoCampaign({ status: 'paused' })
    expect(campaign.status).toBe('paused')
  })
})

// ─── flattenVideo ────────────────────────────────────────────

describe('flattenVideo()', () => {
  test('produces campaign resource with video channelType', () => {
    const campaign = makeVideoCampaign()
    const resources = flattenVideo(campaign)

    const campaignRes = resources.find(r => r.kind === 'campaign')
    expect(campaignRes).toBeDefined()
    expect(campaignRes!.properties.channelType).toBe('video')
    expect(campaignRes!.properties.name).toBe('Video - YouTube Ads')
    expect(campaignRes!.properties.status).toBe('enabled')
  })

  test('produces only a campaign resource (no ad groups or ads)', () => {
    const campaign = makeVideoCampaign()
    const resources = flattenVideo(campaign)

    // Video campaigns are read-only — only the campaign resource is emitted
    expect(resources).toHaveLength(1)
    expect(resources[0]!.kind).toBe('campaign')
  })

  test('flattenAll dispatches video campaigns', () => {
    const campaign = makeVideoCampaign()
    const resources = flattenAll([campaign])

    expect(resources).toHaveLength(1)
    expect(resources[0]!.properties.channelType).toBe('video')
  })
})

// ─── Codegen (read-only indicator) ──────────────────────────

describe('Video codegen', () => {
  test('emits a read-only comment, not a google.video() call', () => {
    const resources: Resource[] = [
      {
        kind: 'campaign',
        path: 'video-youtube-ads',
        properties: {
          name: 'Video - YouTube Ads',
          status: 'enabled',
          budget: { amount: 20, currency: 'EUR', period: 'daily' },
          bidding: { type: 'target-cpm' },
          targeting: {
            rules: [
              { type: 'geo', countries: ['US'] },
              { type: 'language', languages: ['en'] },
            ],
          },
          channelType: 'video',
        },
      },
    ]

    const output = generateCampaignFile(resources, 'Video - YouTube Ads')

    // Should contain a read-only indicator
    expect(output).toContain('VIDEO')
    expect(output).toContain('read-only')
  })
})

// ─── Apply (should skip with warning) ──────────────────────

describe('Video apply', () => {
  test('video campaign creation produces no API operations', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'video-youtube-ads',
      properties: {
        name: 'Video - YouTube Ads',
        status: 'enabled',
        budget: { amount: 20, currency: 'EUR', period: 'daily' },
        bidding: { type: 'target-cpm' },
        targeting: { rules: [] },
        channelType: 'video',
      },
    }

    const change = { op: 'create' as const, resource }
    const ops = changeToMutations(change, '7300967494', new Map())

    // Video campaigns cannot be created via API — should return empty ops
    expect(ops).toHaveLength(0)
  })

  test('video campaign update also produces no API operations', () => {
    const resource: Resource = {
      kind: 'campaign',
      path: 'video-youtube-ads',
      properties: {
        name: 'Video - YouTube Ads',
        status: 'paused',
        budget: { amount: 20, currency: 'EUR', period: 'daily' },
        bidding: { type: 'target-cpm' },
        targeting: { rules: [] },
        channelType: 'video',
      },
    }

    const change = {
      op: 'update' as const,
      resource,
      changes: [{ field: 'status', from: 'enabled', to: 'paused' }],
    }
    const ops = changeToMutations(change, '7300967494', new Map())

    // Video campaigns cannot be updated via API
    expect(ops).toHaveLength(0)
  })
})
