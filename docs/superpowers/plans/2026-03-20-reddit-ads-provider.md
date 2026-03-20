# Reddit Ads Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Reddit Ads as a third provider to @upspawn/ads, enabling declarative campaign management for Reddit's ad platform via TypeScript + CLI.

**Architecture:** Reddit support slots in as `src/reddit/` alongside `src/google/` and `src/meta/`. The core engine (diff, cache, discovery) is provider-agnostic and stays unchanged. Phase 0 builds the foundation (types, builder, API client), then Phases 1-4 run in parallel worktrees (auth+helpers, fetch+flatten, apply+upload, codegen+performance). Phase 5 integrates and tests round-trips.

**Tech Stack:** TypeScript, Bun, Reddit Ads API v3 (REST/JSON), OAuth2, SQLite (existing cache), bun:test

**Spec:** `docs/superpowers/specs/2026-03-20-reddit-ads-provider-design.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/reddit/types.ts` | All Reddit-specific types: objectives, optimization goals, bidding, targeting, placements, ad formats, CTAs, schedule, provider config |
| `src/reddit/constants.ts` | Enum maps: objective → API string, default optimizations, status maps, creation/deletion order |
| `src/reddit/index.ts` | `RedditCampaignBuilder<T>` — builder DSL (`reddit.traffic()`, `.adGroup()`, etc.) |
| `src/reddit/api.ts` | Reddit Ads API client — OAuth2 (refresh token + username/password), error mapping, rate limiting, pagination |
| `src/reddit/provider.ts` | `ProviderModule` export — initially stubs, wired in T5 |
| `src/reddit/flatten.ts` | `flattenReddit(campaign)` → `Resource[]` — path generation, default resolution |
| `src/reddit/fetch.ts` | `fetchRedditAll(config)` → `Resource[]` — reads live campaigns/ad groups/ads from Reddit |
| `src/reddit/apply.ts` | `applyRedditChangeset(changeset, config)` — creates/updates/deletes via API in dependency order |
| `src/reddit/upload.ts` | Image/video upload via Reddit's media endpoint |
| `src/reddit/download.ts` | Download creative assets during import |
| `src/reddit/codegen.ts` | `codegenReddit(resources)` → TypeScript string — generates builder DSL code from fetched state |
| `src/reddit/performance.ts` | Reddit reporting API → performance metrics |
| `src/helpers/reddit-creative.ts` | Creative helpers: `image()`, `video()`, `carousel()`, `freeform()`, `product()` |
| `src/helpers/reddit-targeting.ts` | Targeting helpers: `subreddits()`, `interests()`, `keywords()`, `geo()`, `age()`, `gender()`, etc. |
| `src/helpers/reddit-bidding.ts` | Bidding helpers: `lowestCost()`, `costCap()`, `manualBid()` |
| `src/helpers/reddit-placement.ts` | Placement helpers: `feed()`, `conversation()`, `automatic()` |
| `test/unit/reddit-types.test.ts` | Type/objective/bidding validation |
| `test/unit/reddit-builder.test.ts` | Builder immutability, chaining, type constraints |
| `test/unit/reddit-api.test.ts` | API client, error mapping, credential resolution |
| `test/unit/reddit-constants.test.ts` | Enum maps, defaults |
| `test/unit/reddit-flatten.test.ts` | Campaign tree → Resource[] |
| `test/unit/reddit-fetch.test.ts` | API response → Resource[] normalization |
| `test/unit/reddit-apply.test.ts` | Changeset → mutation ordering, API call construction |
| `test/unit/reddit-codegen.test.ts` | Resource[] → TypeScript snapshot tests |
| `test/unit/reddit-targeting.test.ts` | Targeting helper tests |
| `test/unit/reddit-bidding.test.ts` | Bidding helper tests |
| `test/unit/reddit-creative.test.ts` | Creative helper tests |
| `test/unit/reddit-placement.test.ts` | Placement helper tests |
| `test/unit/reddit-performance.test.ts` | Performance metric normalization |

### Modified files

| File | What changes |
|---|---|
| `src/core/types.ts` | Add `readonly reddit?: RedditProviderConfig` to `AdsConfig` |
| `src/core/providers.ts` | Add `reddit` entry to `PROVIDERS` map |
| `cli/auth.ts` | Add `runAuthReddit()` for OAuth dance |
| `cli/index.ts` | Add `reddit` to auth router |
| `cli/doctor.ts` | Add Reddit credential checks |
| `cli/import.ts` | Add `reddit` to `--provider` choices |
| `cli/performance.ts` | Add `reddit` to performance routing |
| `src/performance/fetch.ts` | Add `reddit?` to `FetchPerformanceInput` |
| `package.json` | Add exports for `@upspawn/ads/helpers/reddit-*` |

---

## Phase 0: Foundation (sequential — must land before parallel work)

### Task 1: Reddit type definitions

**Files:**
- Create: `src/reddit/types.ts`
- Test: `test/unit/reddit-types.test.ts`

- [ ] **Step 1: Write type validation tests**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/reddit-types.test.ts`
Expected: FAIL — cannot find module `../../src/reddit/types`

- [ ] **Step 3: Create `src/reddit/types.ts`**

```typescript
// src/reddit/types.ts
import type { Budget } from '../core/types'

// --- Objectives ---

export type Objective =
  | 'awareness'
  | 'traffic'
  | 'engagement'
  | 'video-views'
  | 'app-installs'
  | 'conversions'
  | 'leads'

export type OptimizationGoalMap = {
  readonly awareness: 'REACH' | 'IMPRESSIONS'
  readonly traffic: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS'
  readonly engagement: 'POST_ENGAGEMENT' | 'IMPRESSIONS'
  readonly 'video-views': 'VIDEO_VIEWS' | 'THRUPLAY'
  readonly 'app-installs': 'APP_INSTALLS' | 'APP_EVENTS'
  readonly conversions: 'CONVERSIONS' | 'VALUE'
  readonly leads: 'LEADS' | 'CONVERSIONS'
}

// --- Bidding ---

export type RedditBidStrategy =
  | { readonly type: 'LOWEST_COST' }
  | { readonly type: 'COST_CAP'; readonly amount: number }
  | { readonly type: 'MANUAL_BID'; readonly amount: number }

// --- CTA ---

export type RedditCTA =
  | 'INSTALL' | 'DOWNLOAD' | 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW'
  | 'BOOK_NOW' | 'CONTACT_US' | 'GET_QUOTE' | 'SUBSCRIBE'
  | 'APPLY_NOW' | 'WATCH_MORE' | 'PLAY_NOW' | 'SEE_MENU'

// --- Schedule ---

export type DaypartRule = {
  readonly days: readonly ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  readonly startHour: number
  readonly endHour: number
}

export type RedditSchedule = {
  readonly start: string
  readonly end?: string
  readonly dayparting?: readonly DaypartRule[]
}

// --- Targeting ---

export type RedditTargetingRule =
  | { readonly _type: 'subreddits'; readonly names: readonly string[] }
  | { readonly _type: 'interests'; readonly names: readonly string[] }
  | { readonly _type: 'keywords'; readonly terms: readonly string[] }
  | { readonly _type: 'geo'; readonly locations: readonly string[] }
  | { readonly _type: 'age'; readonly min: number; readonly max: number }
  | { readonly _type: 'gender'; readonly value: 'male' | 'female' | 'all' }
  | { readonly _type: 'device'; readonly types: readonly ('mobile' | 'desktop')[] }
  | { readonly _type: 'os'; readonly types: readonly ('ios' | 'android' | 'windows' | 'macos')[] }
  | { readonly _type: 'customAudience'; readonly id: string }
  | { readonly _type: 'lookalike'; readonly sourceId: string; readonly config?: { readonly country?: string; readonly ratio?: number } }
  | { readonly _type: 'expansion'; readonly enabled: boolean }

// --- Placements ---

export type RedditPlacement = 'FEED' | 'CONVERSATION' | 'ALL'

// --- Ad Formats ---

export type ImageAdConfig = {
  readonly headline: string
  readonly body?: string
  readonly clickUrl: string
  readonly cta?: RedditCTA
  readonly thumbnail?: string
}

export type VideoAdConfig = {
  readonly headline: string
  readonly body?: string
  readonly clickUrl: string
  readonly cta?: RedditCTA
  readonly thumbnail?: string
}

export type CarouselCard = {
  readonly image: string
  readonly headline: string
  readonly url: string
  readonly caption?: string
}

export type CarouselAdConfig = {
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type FreeformAdConfig = {
  readonly headline: string
  readonly body: string
  readonly images?: readonly string[]
  readonly videos?: readonly string[]
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type ProductAdConfig = {
  readonly catalogId: string
  readonly headline: string
  readonly clickUrl?: string
  readonly cta?: RedditCTA
}

export type RedditAd =
  | { readonly format: 'image'; readonly filePath: string; readonly config: ImageAdConfig }
  | { readonly format: 'video'; readonly filePath: string; readonly config: VideoAdConfig }
  | { readonly format: 'carousel'; readonly cards: readonly CarouselCard[]; readonly config: CarouselAdConfig }
  | { readonly format: 'freeform'; readonly config: FreeformAdConfig }
  | { readonly format: 'product'; readonly config: ProductAdConfig }

// --- Ad Group Config ---

export type AdGroupConfig<T extends Objective> = {
  readonly bid?: RedditBidStrategy
  readonly targeting: readonly RedditTargetingRule[]
  readonly placement?: RedditPlacement
  readonly schedule?: RedditSchedule
  readonly optimizationGoal?: OptimizationGoalMap[T]
  readonly status?: 'enabled' | 'paused'
}

// --- Campaign Config ---

export type RedditCampaignConfig = {
  readonly budget?: Budget
  readonly status?: 'enabled' | 'paused'
  readonly spendCap?: number
}

// --- Built Campaign ---

export type RedditAdGroup<T extends Objective> = {
  readonly name: string
  readonly config: AdGroupConfig<T>
  readonly ads: readonly RedditAd[]
}

export type RedditCampaign<T extends Objective = Objective> = {
  readonly provider: 'reddit'
  readonly kind: T
  readonly name: string
  readonly config: RedditCampaignConfig
  readonly adGroups: readonly RedditAdGroup<T>[]
}

// --- Provider Config ---

export type RedditProviderConfig = {
  readonly accountId: string
  readonly appId?: string
  readonly appSecret?: string
  readonly refreshToken?: string
  readonly username?: string
  readonly password?: string
  readonly userAgent?: string
  readonly currency?: string
  readonly credentials?: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/unit/reddit-types.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/reddit/types.ts test/unit/reddit-types.test.ts
git commit -m "feat(reddit): add type definitions for Reddit Ads provider"
```

---

### Task 2: Constants and enum maps

**Files:**
- Create: `src/reddit/constants.ts`
- Test: `test/unit/reddit-constants.test.ts`

- [ ] **Step 1: Write constants tests**

```typescript
// test/unit/reddit-constants.test.ts
import { describe, test, expect } from 'bun:test'
import {
  OBJECTIVE_MAP,
  REVERSE_OBJECTIVE_MAP,
  DEFAULT_OPTIMIZATION,
  STATUS_MAP,
  REVERSE_STATUS_MAP,
  CREATION_ORDER,
  DELETION_ORDER,
} from '../../src/reddit/constants'

describe('reddit constants', () => {
  test('OBJECTIVE_MAP covers all 7 objectives', () => {
    expect(Object.keys(OBJECTIVE_MAP)).toHaveLength(7)
    expect(OBJECTIVE_MAP['traffic']).toBe('TRAFFIC')
    expect(OBJECTIVE_MAP['awareness']).toBe('BRAND_AWARENESS_AND_REACH')
    expect(OBJECTIVE_MAP['leads']).toBe('LEAD_GENERATION')
  })

  test('REVERSE_OBJECTIVE_MAP inverts correctly', () => {
    expect(REVERSE_OBJECTIVE_MAP['TRAFFIC']).toBe('traffic')
    expect(REVERSE_OBJECTIVE_MAP['BRAND_AWARENESS_AND_REACH']).toBe('awareness')
  })

  test('DEFAULT_OPTIMIZATION covers all objectives', () => {
    expect(Object.keys(DEFAULT_OPTIMIZATION)).toHaveLength(7)
    expect(DEFAULT_OPTIMIZATION['traffic']).toBe('LINK_CLICKS')
    expect(DEFAULT_OPTIMIZATION['conversions']).toBe('CONVERSIONS')
  })

  test('STATUS_MAP maps SDK → API', () => {
    expect(STATUS_MAP['enabled']).toBe('ACTIVE')
    expect(STATUS_MAP['paused']).toBe('PAUSED')
  })

  test('REVERSE_STATUS_MAP maps API → SDK', () => {
    expect(REVERSE_STATUS_MAP['ACTIVE']).toBe('enabled')
    expect(REVERSE_STATUS_MAP['PAUSED']).toBe('paused')
  })

  test('CREATION_ORDER is parent-first', () => {
    expect(CREATION_ORDER).toEqual(['campaign', 'adGroup', 'ad'])
  })

  test('DELETION_ORDER is child-first', () => {
    expect(DELETION_ORDER).toEqual(['ad', 'adGroup', 'campaign'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/reddit-constants.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/reddit/constants.ts`**

```typescript
// src/reddit/constants.ts
import type { Objective, OptimizationGoalMap } from './types'
import type { ResourceKind } from '../core/types'

export const OBJECTIVE_MAP: Record<Objective, string> = {
  'awareness': 'BRAND_AWARENESS_AND_REACH',
  'traffic': 'TRAFFIC',
  'engagement': 'ENGAGEMENT',
  'video-views': 'VIDEO_VIEWS',
  'app-installs': 'APP_INSTALLS',
  'conversions': 'CONVERSIONS',
  'leads': 'LEAD_GENERATION',
}

export const REVERSE_OBJECTIVE_MAP: Record<string, Objective> = Object.fromEntries(
  Object.entries(OBJECTIVE_MAP).map(([k, v]) => [v, k as Objective]),
) as Record<string, Objective>

export const DEFAULT_OPTIMIZATION: { [K in Objective]: OptimizationGoalMap[K] } = {
  'awareness': 'REACH',
  'traffic': 'LINK_CLICKS',
  'engagement': 'POST_ENGAGEMENT',
  'video-views': 'VIDEO_VIEWS',
  'app-installs': 'APP_INSTALLS',
  'conversions': 'CONVERSIONS',
  'leads': 'LEADS',
}

export const STATUS_MAP: Record<string, string> = {
  'enabled': 'ACTIVE',
  'paused': 'PAUSED',
}

export const REVERSE_STATUS_MAP: Record<string, string> = {
  'ACTIVE': 'enabled',
  'PAUSED': 'paused',
}

export const CREATION_ORDER: ResourceKind[] = ['campaign', 'adGroup', 'ad']
export const DELETION_ORDER: ResourceKind[] = ['ad', 'adGroup', 'campaign']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/unit/reddit-constants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/reddit/constants.ts test/unit/reddit-constants.test.ts
git commit -m "feat(reddit): add constants and enum maps"
```

---

### Task 3: Campaign builder

**Files:**
- Create: `src/reddit/index.ts`
- Test: `test/unit/reddit-builder.test.ts`

- [ ] **Step 1: Write builder tests**

```typescript
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
    expect(b.build().adGroups[0].name).toBe('Group 1')
    expect(c.build().adGroups[0].name).toBe('Group 2')
  })

  test('chained adGroups accumulate', () => {
    const campaign = reddit.traffic('Campaign')
      .adGroup('Group 1', { targeting: [] }, [])
      .adGroup('Group 2', { targeting: [] }, [])
      .build()

    expect(campaign.adGroups).toHaveLength(2)
    expect(campaign.adGroups[0].name).toBe('Group 1')
    expect(campaign.adGroups[1].name).toBe('Group 2')
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

    const group = campaign.adGroups[0]
    expect(group.config.targeting).toEqual(targeting)
    expect(group.config.bid).toEqual({ type: 'MANUAL_BID', amount: 150_000 })
    expect(group.ads).toEqual(ads)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/reddit-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/reddit/index.ts`**

```typescript
// src/reddit/index.ts
import type {
  Objective,
  AdGroupConfig,
  RedditAd,
  RedditAdGroup,
  RedditCampaign,
  RedditCampaignConfig,
} from './types'

function freeze<T>(obj: T): Readonly<T> {
  return Object.freeze(obj)
}

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const frozen = Object.freeze(obj)
  for (const val of Object.values(frozen)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val as object)
    }
  }
  return frozen
}

export class RedditCampaignBuilder<T extends Objective> {
  readonly #kind: T
  readonly #name: string
  readonly #config: RedditCampaignConfig
  readonly #adGroups: readonly RedditAdGroup<T>[]

  private constructor(
    kind: T,
    name: string,
    config: RedditCampaignConfig,
    adGroups: readonly RedditAdGroup<T>[],
  ) {
    this.#kind = kind
    this.#name = name
    this.#config = config
    this.#adGroups = adGroups
  }

  static _create<T extends Objective>(
    kind: T,
    name: string,
    config: RedditCampaignConfig = {},
  ): RedditCampaignBuilder<T> {
    return new RedditCampaignBuilder(kind, name, config, [])
  }

  adGroup(
    name: string,
    config: AdGroupConfig<T>,
    ads: readonly RedditAd[],
  ): RedditCampaignBuilder<T> {
    const group: RedditAdGroup<T> = freeze({ name, config, ads: [...ads] })
    return new RedditCampaignBuilder(
      this.#kind,
      this.#name,
      this.#config,
      [...this.#adGroups, group],
    )
  }

  build(): RedditCampaign<T> {
    return deepFreeze({
      provider: 'reddit' as const,
      kind: this.#kind,
      name: this.#name,
      config: this.#config,
      adGroups: [...this.#adGroups],
    })
  }
}

export const reddit = {
  awareness(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('awareness', name, config)
  },
  traffic(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('traffic', name, config)
  },
  engagement(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('engagement', name, config)
  },
  videoViews(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('video-views', name, config)
  },
  appInstalls(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('app-installs', name, config)
  },
  conversions(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('conversions', name, config)
  },
  leads(name: string, config?: RedditCampaignConfig) {
    return RedditCampaignBuilder._create('leads', name, config)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/unit/reddit-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/reddit/index.ts test/unit/reddit-builder.test.ts
git commit -m "feat(reddit): add campaign builder with all 7 objectives"
```

---

### Task 4: API client

**Files:**
- Create: `src/reddit/api.ts`
- Test: `test/unit/reddit-api.test.ts`

- [ ] **Step 1: Write API client tests**

```typescript
// test/unit/reddit-api.test.ts
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import {
  resolveRedditCredentials,
  mapRedditError,
  type RedditClient,
} from '../../src/reddit/api'
import type { RedditProviderConfig } from '../../src/reddit/types'

describe('reddit api', () => {
  describe('resolveRedditCredentials', () => {
    test('uses config fields first', () => {
      const config: RedditProviderConfig = {
        accountId: 'a2_test',
        appId: 'config-app-id',
        appSecret: 'config-secret',
        refreshToken: 'config-token',
      }
      const creds = resolveRedditCredentials(config)
      expect(creds.appId).toBe('config-app-id')
      expect(creds.appSecret).toBe('config-secret')
      expect(creds.refreshToken).toBe('config-token')
    })

    test('falls back to credentials file', () => {
      // Mock reading ~/.ads/credentials.json with reddit_app_id, reddit_app_secret, reddit_refresh_token
      // Verify credentials file takes precedence over env vars but yields to config fields
      const config: RedditProviderConfig = { accountId: 'a2_test', credentials: '/tmp/test-creds.json' }
      // Write mock credentials file, resolve, verify correct values
    })

    test('falls back to env vars', () => {
      const origAppId = process.env.REDDIT_APP_ID
      const origSecret = process.env.REDDIT_APP_SECRET
      const origToken = process.env.REDDIT_REFRESH_TOKEN

      process.env.REDDIT_APP_ID = 'env-app-id'
      process.env.REDDIT_APP_SECRET = 'env-secret'
      process.env.REDDIT_REFRESH_TOKEN = 'env-token'

      try {
        const config: RedditProviderConfig = { accountId: 'a2_test' }
        const creds = resolveRedditCredentials(config)
        expect(creds.appId).toBe('env-app-id')
        expect(creds.appSecret).toBe('env-secret')
        expect(creds.refreshToken).toBe('env-token')
      } finally {
        if (origAppId) process.env.REDDIT_APP_ID = origAppId
        else delete process.env.REDDIT_APP_ID
        if (origSecret) process.env.REDDIT_APP_SECRET = origSecret
        else delete process.env.REDDIT_APP_SECRET
        if (origToken) process.env.REDDIT_REFRESH_TOKEN = origToken
        else delete process.env.REDDIT_REFRESH_TOKEN
      }
    })
  })

  describe('mapRedditError', () => {
    test('maps UNAUTHORIZED to auth error', () => {
      const err = mapRedditError(401, { error: { code: 'UNAUTHORIZED', message: 'Bad token' } })
      expect(err.type).toBe('auth')
    })

    test('maps 429 to quota error', () => {
      const err = mapRedditError(429, { error: { code: 'RATE_LIMITED', message: 'Slow down' } })
      expect(err.type).toBe('quota')
    })

    test('maps INVALID_REQUEST to validation error', () => {
      const err = mapRedditError(400, { error: { code: 'INVALID_REQUEST', message: 'Bad field' } })
      expect(err.type).toBe('validation')
    })

    test('maps POLICY_VIOLATION to policy error', () => {
      const err = mapRedditError(400, { error: { code: 'POLICY_VIOLATION', message: 'Rejected' } })
      expect(err.type).toBe('policy')
    })

    test('maps unknown errors to api error', () => {
      const err = mapRedditError(500, { error: { code: 'UNKNOWN', message: 'Oops' } })
      expect(err.type).toBe('api')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/unit/reddit-api.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/reddit/api.ts`**

Read `src/meta/api.ts` for the exact pattern, then create the Reddit equivalent. Key functions to export:

- `resolveRedditCredentials(config)` — credential resolution (config → credentials file → env vars)
- `mapRedditError(status, body)` — error mapping to `AdsError`
- `createRedditClient(config)` — returns `RedditClient` with `get`, `post`, `put`, `delete`, `fetchAll` (paginated)
- `type RedditClient` — exported interface for T4's performance module

The API client should:
- Exchange refresh token for access token via `POST https://www.reddit.com/api/v1/access_token`
- Also support username/password flow for script apps
- Set `User-Agent` header (Reddit requires it)
- Handle rate limit headers (`X-Ratelimit-Remaining`, `X-Ratelimit-Reset`) with backoff
- Handle cursor-based pagination via `fetchAll()` helper
- Use `https://ads-api.reddit.com/api/v3/` as base URL

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/unit/reddit-api.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/reddit/api.ts test/unit/reddit-api.test.ts
git commit -m "feat(reddit): add API client with OAuth2, error mapping, rate limiting"
```

---

### Task 5: Register provider and update core types

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/providers.ts`
- Create: `src/reddit/provider.ts`

- [ ] **Step 1: Read current files**

Read `src/core/types.ts` to find the `AdsConfig` type definition. Read `src/core/providers.ts` to find the `PROVIDERS` map.

- [ ] **Step 2: Add `RedditProviderConfig` to `AdsConfig`**

In `src/core/types.ts`, add to the `AdsConfig` type:
```typescript
readonly reddit?: import('../reddit/types').RedditProviderConfig
```

- [ ] **Step 3: Add reddit to `PROVIDERS` map**

In `src/core/providers.ts`, add:
```typescript
reddit: async () => {
  const mod = await import('../reddit/provider.ts')
  return mod.default
},
```

- [ ] **Step 4: Create stub `src/reddit/provider.ts`**

```typescript
// src/reddit/provider.ts
import type { ProviderModule } from '../core/providers'

const redditProvider: ProviderModule = {
  flatten(_campaigns: unknown[]) {
    throw new Error('Reddit provider: flatten not yet implemented')
  },
  async fetchAll(_config, _cache) {
    throw new Error('Reddit provider: fetchAll not yet implemented')
  },
  async applyChangeset(_changeset, _config, _cache, _project) {
    throw new Error('Reddit provider: applyChangeset not yet implemented')
  },
  codegen(_resources, _campaignName) {
    throw new Error('Reddit provider: codegen not yet implemented')
  },
}

export default redditProvider
```

- [ ] **Step 5: Typecheck and run all existing tests**

Run: `bunx tsc --noEmit && bun test`
Expected: All existing tests pass, no type errors

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/providers.ts src/reddit/provider.ts
git commit -m "feat(reddit): register provider in core with stub implementations"
```

---

### Task 6: Export reddit builder from package entry point

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json` (if exports map exists)

- [ ] **Step 1: Read `src/index.ts`** to understand current export structure.

- [ ] **Step 2: Add reddit exports**

Add to `src/index.ts`:
```typescript
export { reddit, RedditCampaignBuilder } from './reddit'
export type * from './reddit/types'
```

- [ ] **Step 3: Read `package.json`** and add helper exports if an `exports` map exists:

```json
"./helpers/reddit-creative": { "bun": "./src/helpers/reddit-creative.ts" },
"./helpers/reddit-targeting": { "bun": "./src/helpers/reddit-targeting.ts" },
"./helpers/reddit-bidding": { "bun": "./src/helpers/reddit-bidding.ts" },
"./helpers/reddit-placement": { "bun": "./src/helpers/reddit-placement.ts" }
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors (helper files don't exist yet, but exports are lazy — check if this causes issues and skip if so)

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat(reddit): export builder and types from package entry point"
```

---

## Phase 1: Auth + Helpers (bidding/placement) — Worktree T1

> **Worktree agent:** This task runs in an isolated git worktree branched from the T0 completion commit. Files in `src/reddit/types.ts`, `src/reddit/constants.ts`, `src/reddit/index.ts`, `src/reddit/api.ts` are available to import from. Do NOT modify any T0 files.
>
> **File ownership for T1:** `src/helpers/reddit-bidding.ts`, `src/helpers/reddit-placement.ts`, `cli/auth.ts`, `cli/index.ts` (auth routing only), `cli/doctor.ts`, `test/unit/reddit-bidding.test.ts`, `test/unit/reddit-placement.test.ts`. No overlap with T2/T3/T4.

### Task 7: Bidding helpers

**Files:**
- Create: `src/helpers/reddit-bidding.ts`
- Test: `test/unit/reddit-bidding.test.ts`

- [ ] **Step 1: Write bidding tests**

```typescript
// test/unit/reddit-bidding.test.ts
import { describe, test, expect } from 'bun:test'
import { lowestCost, costCap, manualBid } from '../../src/helpers/reddit-bidding'

describe('reddit bidding helpers', () => {
  test('lowestCost returns LOWEST_COST strategy', () => {
    expect(lowestCost()).toEqual({ type: 'LOWEST_COST' })
  })

  test('costCap returns COST_CAP with amount', () => {
    expect(costCap(500_000)).toEqual({ type: 'COST_CAP', amount: 500_000 })
  })

  test('costCap rejects non-positive amounts', () => {
    expect(() => costCap(0)).toThrow()
    expect(() => costCap(-1)).toThrow()
  })

  test('manualBid returns MANUAL_BID with amount', () => {
    expect(manualBid(150_000)).toEqual({ type: 'MANUAL_BID', amount: 150_000 })
  })

  test('manualBid rejects non-positive amounts', () => {
    expect(() => manualBid(0)).toThrow()
  })
})
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/helpers/reddit-bidding.ts`**

```typescript
// src/helpers/reddit-bidding.ts
import type { RedditBidStrategy } from '../reddit/types'

export function lowestCost(): RedditBidStrategy {
  return { type: 'LOWEST_COST' }
}

export function costCap(amount: number): RedditBidStrategy {
  if (amount <= 0) throw new Error('costCap amount must be positive')
  return { type: 'COST_CAP', amount }
}

export function manualBid(amount: number): RedditBidStrategy {
  if (amount <= 0) throw new Error('manualBid amount must be positive')
  return { type: 'MANUAL_BID', amount }
}
```

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/helpers/reddit-bidding.ts test/unit/reddit-bidding.test.ts
git commit -m "feat(reddit): add bidding helpers — lowestCost, costCap, manualBid"
```

---

### Task 8: Placement helpers

**Files:**
- Create: `src/helpers/reddit-placement.ts`
- Test: `test/unit/reddit-placement.test.ts`

- [ ] **Step 1: Write placement tests**

```typescript
// test/unit/reddit-placement.test.ts
import { describe, test, expect } from 'bun:test'
import { feed, conversation, automatic } from '../../src/helpers/reddit-placement'

describe('reddit placement helpers', () => {
  test('feed() returns FEED', () => {
    expect(feed()).toBe('FEED')
  })

  test('conversation() returns CONVERSATION', () => {
    expect(conversation()).toBe('CONVERSATION')
  })

  test('automatic() returns ALL', () => {
    expect(automatic()).toBe('ALL')
  })
})
```

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/helpers/reddit-placement.ts`**

```typescript
// src/helpers/reddit-placement.ts
import type { RedditPlacement } from '../reddit/types'

export function feed(): RedditPlacement { return 'FEED' }
export function conversation(): RedditPlacement { return 'CONVERSATION' }
export function automatic(): RedditPlacement { return 'ALL' }
```

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/helpers/reddit-placement.ts test/unit/reddit-placement.test.ts
git commit -m "feat(reddit): add placement helpers — feed, conversation, automatic"
```

---

### Task 9: Auth command

**Files:**
- Modify: `cli/auth.ts`
- Modify: `cli/index.ts`
- Modify: `cli/doctor.ts`

- [ ] **Step 1: Read `cli/auth.ts`** to understand existing auth flow pattern.
- [ ] **Step 2: Read `cli/index.ts`** to understand routing.
- [ ] **Step 3: Read `cli/doctor.ts`** to understand credential check pattern.

- [ ] **Step 4: Add Reddit auth flow to `cli/auth.ts`**

Follow the Google auth pattern. Add a `runAuthReddit()` function that:
1. Prompts for app ID and app secret (or reads from env)
2. Opens browser to `https://www.reddit.com/api/v1/authorize?client_id=...&response_type=code&state=random&redirect_uri=http://localhost:8080&duration=permanent&scope=adsread,adswrite`
3. Starts local HTTP server to capture redirect
4. Exchanges code for refresh token via `POST https://www.reddit.com/api/v1/access_token`
5. Saves to `~/.ads/credentials.json`

- [ ] **Step 5: Add `reddit` case to CLI auth routing** in `cli/index.ts`
- [ ] **Step 6: Add Reddit credential check to `cli/doctor.ts`** — check for `REDDIT_APP_ID` or credentials file
- [ ] **Step 7: Test manually** — `bun cli/index.ts auth reddit` should start the flow (or show helpful error)
- [ ] **Step 8: Run all tests** — `bun test`
- [ ] **Step 9: Commit**

```bash
git add cli/auth.ts cli/index.ts cli/doctor.ts
git commit -m "feat(reddit): add OAuth2 auth flow and doctor checks"
```

---

## Phase 2: Fetch + Flatten + Helpers (targeting/creative) — Worktree T2

> **Worktree agent:** Isolated worktree from T0. Import from `src/reddit/types.ts`, `src/reddit/constants.ts`, `src/reddit/api.ts`. Do NOT modify T0 files.
>
> **File ownership for T2:** `src/reddit/flatten.ts`, `src/reddit/fetch.ts`, `src/helpers/reddit-targeting.ts`, `src/helpers/reddit-creative.ts`, `test/unit/reddit-flatten.test.ts`, `test/unit/reddit-fetch.test.ts`, `test/unit/reddit-targeting.test.ts`, `test/unit/reddit-creative.test.ts`. No overlap with T1/T3/T4.

### Task 10: Targeting helpers

**Files:**
- Create: `src/helpers/reddit-targeting.ts`
- Test: `test/unit/reddit-targeting.test.ts`

- [ ] **Step 1: Write targeting tests**

Test all helpers: `subreddits()`, `interests()`, `keywords()`, `geo()`, `age()`, `gender()`, `device()`, `os()`, `customAudience()`, `lookalike()`, `expansion()`. Each should return the correct `RedditTargetingRule` with the right `_type` field.

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement** — each helper returns a `RedditTargetingRule` object
- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/helpers/reddit-targeting.ts test/unit/reddit-targeting.test.ts
git commit -m "feat(reddit): add targeting helpers — subreddits, interests, keywords, geo, etc."
```

---

### Task 11: Creative helpers

**Files:**
- Create: `src/helpers/reddit-creative.ts`
- Test: `test/unit/reddit-creative.test.ts`

- [ ] **Step 1: Write creative tests**

Test `image()`, `video()`, `carousel()`, `freeform()`, `product()`. Each should return the correct `RedditAd` variant. Test validation: carousel needs 2-6 cards, freeform body required, headline max 300 chars.

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement** — each helper validates constraints and returns a `RedditAd` object
- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/helpers/reddit-creative.ts test/unit/reddit-creative.test.ts
git commit -m "feat(reddit): add creative helpers — image, video, carousel, freeform, product"
```

---

### Task 12: Flatten module

**Files:**
- Create: `src/reddit/flatten.ts`
- Test: `test/unit/reddit-flatten.test.ts`

- [ ] **Step 1: Write flatten tests**

Test:
- Campaign → single campaign Resource with correct path and properties
- Ad groups → Resource with `campaign-name/adgroup-name` path
- Ads → Resource with `campaign-name/adgroup-name/ad-name` path (content hash for unnamed)
- Default status is 'paused'
- Default optimization goal per objective
- Budget conversion to micros
- Multiple ad groups produce correct resource order
- Determinism: same input always produces same output

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/reddit/flatten.ts`**

Follow `src/meta/flatten.ts` pattern. Key function: `flattenReddit(campaign: RedditCampaign): Resource[]`

- Slugify paths using existing `slugify` from core
- Map `status` to API format using `STATUS_MAP`
- Map `objective` using `OBJECTIVE_MAP`
- Set defaults: `status ?? 'paused'`, optimization goal from `DEFAULT_OPTIMIZATION`
- Track defaults in `resource.meta._defaults` for codegen
- Budget: use existing SDK `Budget` type (already in micros from `usd()`/`eur()` helpers)

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/reddit/flatten.ts test/unit/reddit-flatten.test.ts
git commit -m "feat(reddit): add flatten module — campaign tree to Resource[]"
```

---

### Task 13: Fetch module

**Files:**
- Create: `src/reddit/fetch.ts`
- Test: `test/unit/reddit-fetch.test.ts`

- [ ] **Step 1: Write fetch tests with mock API responses**

Create mock Reddit API response fixtures. Test:
- Campaign normalization (objective mapping, status mapping, budget conversion)
- Ad group normalization (targeting, bidding, optimization)
- Ad normalization (creative format, headline, body, URL)
- `configured_status` maps to SDK status (not `effective_status`)
- Pagination handling (multiple pages of results)

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/reddit/fetch.ts`**

Follow `src/meta/fetch.ts` pattern. Key function: `fetchRedditAll(config: RedditProviderConfig, client?: RedditClient): Promise<Resource[]>`

- Use `client.fetchAll()` for paginated list endpoints
- Normalize API responses to `Resource[]` using `REVERSE_OBJECTIVE_MAP`, `REVERSE_STATUS_MAP`
- Endpoints: `GET /api/v3/accounts/{id}/campaigns`, `GET /api/v3/accounts/{id}/ad_groups`, `GET /api/v3/accounts/{id}/ads`
- Critical: normalization must produce identical field formats as `flattenReddit()` for zero-diff round-trips

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/reddit/fetch.ts test/unit/reddit-fetch.test.ts
git commit -m "feat(reddit): add fetch module — Reddit API to Resource[] normalization"
```

---

## Phase 3: Apply + Upload/Download — Worktree T3

> **Worktree agent:** Isolated worktree from T0. Import from `src/reddit/types.ts`, `src/reddit/constants.ts`, `src/reddit/api.ts`. Do NOT modify T0 files.
>
> **File ownership for T3:** `src/reddit/apply.ts`, `src/reddit/upload.ts`, `src/reddit/download.ts`, `test/unit/reddit-apply.test.ts`. No overlap with T1/T2/T4.

### Task 14: Apply module

**Files:**
- Create: `src/reddit/apply.ts`
- Test: `test/unit/reddit-apply.test.ts`

- [ ] **Step 1: Write apply tests**

Test:
- Creates execute in CREATION_ORDER (campaign → adGroup → ad)
- Deletes execute in DELETION_ORDER (ad → adGroup → campaign)
- Updates map to correct API endpoints/methods
- Campaign create builds correct params (name, objective, budget, status)
- Ad group create builds correct params (targeting spec, bidding, optimization)
- Ad create builds correct params (creative format, headline, body, URL, CTA)
- Status conversion (SDK 'enabled'/'paused' → API 'ACTIVE'/'PAUSED')
- Budget conversion to micros
- Failure stops execution (no orphans)
- `dryRunRedditChangeset` returns planned calls without executing

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/reddit/apply.ts`**

Follow `src/meta/apply.ts` pattern. Export:
- `applyRedditChangeset(changeset, config, cache, project) → ApplyResult`
- `dryRunRedditChangeset(changeset, config, cache, project) → DryRunCall[]`

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/reddit/apply.ts test/unit/reddit-apply.test.ts
git commit -m "feat(reddit): add apply module — Changeset to Reddit API mutations"
```

---

### Task 15: Upload module

**Files:**
- Create: `src/reddit/upload.ts`
- Test: (inline tests or skip — upload is thin)

- [ ] **Step 1: Read `src/meta/upload.ts`** for pattern reference.
- [ ] **Step 2: Write upload test**

```typescript
// Add to test/unit/reddit-apply.test.ts or create test/unit/reddit-upload.test.ts
test('uploadRedditMedia returns media URL', async () => {
  // Mock fetch to return a media upload response
  // Verify correct multipart form construction
  // Verify returned media URL/ID
})
```

- [ ] **Step 3: Implement `src/reddit/upload.ts`**

Export `uploadRedditMedia(filePath: string, client: RedditClient): Promise<string>` — uploads image/video to Reddit's media endpoint, returns the media URL/ID.

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/reddit/upload.ts
git commit -m "feat(reddit): add media upload module"
```

---

### Task 16: Download module

**Files:**
- Create: `src/reddit/download.ts`

- [ ] **Step 1: Read `src/meta/download.ts`** for pattern reference.
- [ ] **Step 2: Implement `src/reddit/download.ts`**

Export `downloadRedditAssets(resources: Resource[], rootDir: string): Promise<{ resources: Resource[]; summary?: string }>` — downloads creative images/videos from Reddit URLs during import.

- [ ] **Step 3: Commit**

```bash
git add src/reddit/download.ts
git commit -m "feat(reddit): add creative asset download module"
```

---

## Phase 4: Codegen + Performance + CLI — Worktree T4

> **Worktree agent:** Isolated worktree from T0. Import from `src/reddit/types.ts`, `src/reddit/constants.ts`, `src/reddit/api.ts`. Do NOT modify T0 files.
>
> **File ownership for T4:** `src/reddit/codegen.ts`, `src/reddit/performance.ts`, `src/performance/fetch.ts`, `cli/import.ts`, `cli/performance.ts`, `test/unit/reddit-codegen.test.ts`, `test/unit/reddit-performance.test.ts`. No overlap with T1/T2/T3.

### Task 17: Codegen module

**Files:**
- Create: `src/reddit/codegen.ts`
- Test: `test/unit/reddit-codegen.test.ts`

- [ ] **Step 1: Write codegen snapshot tests**

Test:
- Single campaign with one ad group → correct TypeScript output
- Multiple ad groups → chained `.adGroup()` calls
- Smart defaults: omit fields that match platform defaults (status=paused, optimizationGoal=default for objective)
- Import tracking: only import used helpers (geo, subreddits, manualBid, etc.)
- All ad formats produce correct helper calls (image(), video(), carousel(), freeform(), product())
- Round-trip: codegen output should re-parse to equivalent campaign

- [ ] **Step 2: Run test → FAIL**
- [ ] **Step 3: Implement `src/reddit/codegen.ts`**

Follow `src/meta/codegen.ts` pattern. Key function: `codegenReddit(resources: Resource[]): string`

- Group resources by campaign (first path segment)
- Map API objective back to SDK method name (`TRAFFIC` → `reddit.traffic()`)
- Format targeting, bidding, placement as helper calls
- Check `resource.meta._defaults` to omit default values
- Collect imports from used helpers

- [ ] **Step 4: Run test → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/reddit/codegen.ts test/unit/reddit-codegen.test.ts
git commit -m "feat(reddit): add codegen module — Resource[] to TypeScript source"
```

---

### Task 18: Performance module

**Files:**
- Create: `src/reddit/performance.ts`
- Modify: `src/performance/fetch.ts`
- Modify: `cli/performance.ts`
- Test: `test/unit/reddit-performance.test.ts`

- [ ] **Step 1: Read `src/meta/performance.ts`** and `src/performance/fetch.ts` for patterns.

- [ ] **Step 2: Write performance tests**

Test metric normalization: impressions, clicks, spend, CTR, CPC, CPM, conversions. Test breakdown parsing (date, country, community, placement, device_os).

- [ ] **Step 3: Run test → FAIL**

- [ ] **Step 4: Implement `src/reddit/performance.ts`**

Export `fetchRedditPerformance(config, client, options) → PerformanceData[]`

Use Reddit's reporting endpoint. Map Reddit metric names to SDK's normalized metric format.

- [ ] **Step 5: Wire into `src/performance/fetch.ts`**

Add `reddit?: { client: RedditClient; config: RedditProviderConfig }` to `FetchPerformanceInput`.

- [ ] **Step 6: Wire into `cli/performance.ts`**

Add reddit case to provider routing.

- [ ] **Step 7: Run test → PASS**
- [ ] **Step 8: Commit**

```bash
git add src/reddit/performance.ts src/performance/fetch.ts cli/performance.ts test/unit/reddit-performance.test.ts
git commit -m "feat(reddit): add performance metrics fetcher and CLI integration"
```

---

### Task 19: CLI integration — import command

**Files:**
- Modify: `cli/import.ts`

Note: `package.json` exports were already added in Task 6 (Phase 0). Verify they are present.

- [ ] **Step 1: Read `cli/import.ts`** — add `reddit` to `--provider` choices.
- [ ] **Step 2: Verify `package.json`** already has reddit helper exports from Task 6.
- [ ] **Step 3: Run all tests** — `bun test`
- [ ] **Step 4: Commit**

```bash
git add cli/import.ts
git commit -m "feat(reddit): add --provider reddit to import CLI"
```

---

## Phase 5: Integration (sequential — after all worktrees merge)

### Task 20: Wire provider.ts with real implementations

**Files:**
- Modify: `src/reddit/provider.ts`

- [ ] **Step 1: Replace stubs with real implementations**

```typescript
// src/reddit/provider.ts
import type { ProviderModule } from '../core/providers'
import { RedditCampaignBuilder } from './index'
import { flattenReddit } from './flatten'
import { fetchRedditAll } from './fetch'
import { applyRedditChangeset, dryRunRedditChangeset } from './apply'
import { codegenReddit } from './codegen'
import { downloadRedditAssets } from './download'
import { deduplicateResourceSlugs } from '../core/flatten'
import type { RedditCampaign } from './types'

const redditProvider: ProviderModule = {
  flatten(campaigns: unknown[]) {
    const built = campaigns.map((c) =>
      c instanceof RedditCampaignBuilder ? c.build() : c as RedditCampaign,
    )
    return deduplicateResourceSlugs(built.flatMap(flattenReddit))
  },

  async fetchAll(config, cache) {
    if (!config.reddit) throw new Error('Reddit provider config missing')
    return fetchRedditAll(config.reddit)
  },

  async applyChangeset(changeset, config, cache, project) {
    if (!config.reddit) throw new Error('Reddit provider config missing')
    return applyRedditChangeset(changeset, config.reddit, cache, project)
  },

  codegen(resources, _campaignName) {
    return codegenReddit(resources)
  },

  dryRunChangeset(changeset, config, cache, project) {
    if (!config.reddit) throw new Error('Reddit provider config missing')
    return dryRunRedditChangeset(changeset, config.reddit, cache, project)
  },

  async postImportFetch(resources, rootDir, _cache) {
    return downloadRedditAssets(resources, rootDir)
  },
}

export default redditProvider
```

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit`
- [ ] **Step 3: Run all tests** — `bun test`
- [ ] **Step 4: Commit**

```bash
git add src/reddit/provider.ts
git commit -m "feat(reddit): wire provider with real implementations"
```

---

### Task 21: Round-trip integration tests

**Files:**
- Create: `test/unit/reddit-integration.test.ts`
- Create: `test/fixtures/api-responses/reddit/` (fixture files)

- [ ] **Step 1: Create Reddit API response fixtures**

Create mock API responses in `test/fixtures/api-responses/reddit/`:
- `campaigns.json` — list of campaigns with various objectives
- `ad-groups.json` — ad groups with targeting/bidding
- `ads.json` — ads with different creative formats

- [ ] **Step 2: Write integration tests**

```typescript
// test/unit/reddit-integration.test.ts
import { describe, test, expect } from 'bun:test'
import { reddit } from '../../src/reddit'
import { flattenReddit } from '../../src/reddit/flatten'
import { diff } from '../../src/core/diff'

describe('reddit integration', () => {
  test('build → flatten produces valid Resources', () => {
    const campaign = reddit.traffic('Test Campaign', { status: 'paused' })
      .adGroup('Group 1', {
        targeting: [{ _type: 'geo', locations: ['US'] }],
      }, [{
        format: 'image',
        filePath: './hero.jpg',
        config: { headline: 'Test Ad', clickUrl: 'https://example.com' },
      }])
      .build()

    const resources = flattenReddit(campaign)
    expect(resources).toHaveLength(3) // campaign + adGroup + ad
    expect(resources[0].kind).toBe('campaign')
    expect(resources[1].kind).toBe('adGroup')
    expect(resources[2].kind).toBe('ad')
  })

  test('flatten → diff with identical actual = zero changes', () => {
    const campaign = reddit.traffic('Test Campaign')
      .adGroup('Group 1', { targeting: [] }, [])
      .build()

    const desired = flattenReddit(campaign)
    const actual = [...desired] // identical

    const changeset = diff(desired, actual, [], new Map())
    expect(changeset.creates).toHaveLength(0)
    expect(changeset.updates).toHaveLength(0)
    expect(changeset.deletes).toHaveLength(0)
  })

  test('fetch → codegen → re-import → flatten → diff = zero changes (round-trip)', () => {
    // 1. Create mock API responses (use fixtures from test/fixtures/api-responses/reddit/)
    // 2. Normalize via fetchRedditAll (with mocked client)
    // 3. Generate TypeScript via codegenReddit
    // 4. Parse the generated code, build campaign, flatten back to Resource[]
    // 5. Diff the re-flattened resources against the original fetched resources
    // 6. Assert zero creates, zero updates, zero deletes
    // This is the gold standard test — if it passes, import → plan = 0 changes
  })
})
```

- [ ] **Step 3: Run test → PASS**
- [ ] **Step 4: Commit**

```bash
git add test/unit/reddit-integration.test.ts test/fixtures/api-responses/reddit/
git commit -m "test(reddit): add integration tests and API response fixtures"
```

---

### Task 22: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing + new Reddit tests)

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify CLI commands**

Run: `bun cli/index.ts plan --provider reddit` (should show "no campaigns found" or similar)
Run: `bun cli/index.ts doctor` (should show Reddit credential status)

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(reddit): final cleanup and verification"
```
