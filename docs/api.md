# API Reference

Complete reference for the `@upspawn/ads` SDK.

## Helper Functions

### Keywords

#### `exact(...texts: string[]): ExactKeyword[]`

Create exact-match keywords. Each text is trimmed and tagged with `matchType: 'EXACT'`.

```ts
exact('rename files', 'batch rename')
// [{ text: 'rename files', matchType: 'EXACT' }, { text: 'batch rename', matchType: 'EXACT' }]
```

#### `phrase(...texts: string[]): PhraseKeyword[]`

Create phrase-match keywords. Each text is trimmed and tagged with `matchType: 'PHRASE'`.

```ts
phrase('file renaming tool', 'rename pdf')
// [{ text: 'file renaming tool', matchType: 'PHRASE' }, { text: 'rename pdf', matchType: 'PHRASE' }]
```

#### `broad(...texts: string[]): BroadKeyword[]`

Create broad-match keywords. Each text is trimmed and tagged with `matchType: 'BROAD'`.

```ts
broad('file organization', 'document management')
// [{ text: 'file organization', matchType: 'BROAD' }, { text: 'document management', matchType: 'BROAD' }]
```

#### `keywords(...texts: string[]): Keyword[]`

Parse keywords using bracket notation. Supports two calling styles:

- **Multiple arguments:** each string is parsed individually
- **Single template literal:** split on newlines, each line parsed

Bracket notation:
- `[text]` — exact match
- `"text"` — phrase match
- `text` — broad match (default)

```ts
// Multiple arguments
keywords('[rename files]', '"file renaming tool"', 'document management')

// Template literal (newline-separated)
keywords(`
  [rename files]
  "file renaming tool"
  document management
`)

// Both produce:
// [
//   { text: 'rename files', matchType: 'EXACT' },
//   { text: 'file renaming tool', matchType: 'PHRASE' },
//   { text: 'document management', matchType: 'BROAD' },
// ]
```

### Budget

#### `daily(amount: number, currency?: 'EUR' | 'USD'): DailyBudget`

Create a daily budget. Currency defaults to `'EUR'`.

- **Throws** if `amount <= 0`

```ts
daily(20)           // { amount: 20, currency: 'EUR', period: 'daily' }
daily(15, 'USD')    // { amount: 15, currency: 'USD', period: 'daily' }
```

#### `monthly(amount: number, currency?: 'EUR' | 'USD'): MonthlyBudget`

Create a monthly budget. The engine divides this into a daily amount. Currency defaults to `'EUR'`.

- **Throws** if `amount <= 0`

```ts
monthly(600)        // { amount: 600, currency: 'EUR', period: 'monthly' }
monthly(500, 'USD') // { amount: 500, currency: 'USD', period: 'monthly' }
```

#### `eur(amount: number): number`

Branded shorthand for EUR amounts. Returns the number with a compile-time `__currency: 'EUR'` brand.

```ts
eur(20)  // 20 (typed as EUR)
```

#### `usd(amount: number): number`

Branded shorthand for USD amounts. Returns the number with a compile-time `__currency: 'USD'` brand.

```ts
usd(15)  // 15 (typed as USD)
```

### Targeting

#### `geo(...countries: CountryCode[]): GeoTarget`

Target specific countries by ISO code.

- **Throws** if no country codes provided

```ts
geo('US', 'CA')
// { type: 'geo', countries: ['US', 'CA'] }
```

Common codes: `US`, `DE`, `CA`, `GB`, `AU`, `AT`, `CH`, `FR`, `IT`, `ES`, `PT`, `PL`, `JP`, `KR`, `BR`, `NL`, `SE`, `NO`, `DK`, `FI`. Any string is also accepted.

#### `languages(...langs: LanguageCode[]): LanguageTarget`

Target specific languages by ISO code.

- **Throws** if no language codes provided

```ts
languages('en', 'de')
// { type: 'language', languages: ['en', 'de'] }
```

Common codes: `en`, `de`, `fr`, `it`, `es`, `pt`, `pl`, `ja`, `ko`, `nl`, `sv`, `no`, `da`, `fi`. Any string is also accepted.

#### `weekdays(): ScheduleTarget`

Schedule ads Monday through Friday (all hours).

```ts
weekdays()
// { type: 'schedule', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
```

#### `hours(start: number, end: number): ScheduleTarget`

Schedule ads during specific hours of the day.

- `start`: 0-23 (inclusive)
- `end`: 1-24 (inclusive), must be greater than `start`
- **Throws** if `start` is outside 0-23, `end` is outside 1-24, or `start >= end`

```ts
hours(9, 17)
// { type: 'schedule', startHour: 9, endHour: 17 }
```

#### `targeting(...rules: TargetingRule[]): Targeting`

Compose multiple targeting rules into a single `Targeting` object.

```ts
targeting(
  geo('US', 'CA'),
  languages('en'),
  weekdays(),
  hours(9, 17),
)
// { rules: [geoRule, languageRule, scheduleRule, hoursRule] }
```

### Ads

#### `headlines(...texts: string[]): Headline[]`

Create validated RSA headlines.

- **Max length:** 30 characters per headline
- **Throws** if any headline exceeds 30 characters

```ts
headlines('Rename Files Instantly', 'AI-Powered File Organizer')
```

#### `descriptions(...texts: string[]): Description[]`

Create validated RSA descriptions.

- **Max length:** 90 characters per description
- **Throws** if any description exceeds 90 characters

```ts
descriptions(
  'Rename thousands of files in seconds with AI-powered rules.',
  'Try free. No credit card required.',
)
```

#### `rsa(headlines: Headline[], descriptions: Description[], url: UrlResult): RSAd`

Build a Responsive Search Ad from validated headlines, descriptions, and a URL.

- **Headlines:** 3-15 required
- **Descriptions:** 2-4 required
- **Throws** if headline count is outside 3-15 or description count is outside 2-4

```ts
rsa(
  headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool'),
  descriptions(
    'Rename thousands of files in seconds.',
    'Try free. No credit card required.',
  ),
  url('https://renamed.to'),
)
```

### Extensions

#### `link(text: string, url: string, options?): Sitelink`

Create a sitelink extension.

- **text:** max 25 characters
- **options.description1:** max 35 characters (optional)
- **options.description2:** max 35 characters (optional)
- **Throws** if any text exceeds its character limit

```ts
link('Pricing', 'https://renamed.to/pricing')
link('How It Works', 'https://renamed.to/how-it-works', {
  description1: 'See the AI renaming engine in action',
  description2: 'Works with any file type',
})
```

#### `sitelinks(...links: Sitelink[]): Sitelink[]`

Bundle multiple sitelinks into an array. A pass-through helper for readability.

```ts
sitelinks(
  link('Pricing', '/pricing'),
  link('Features', '/features'),
  link('Blog', '/blog'),
)
```

#### `callouts(...texts: string[]): CalloutText[]`

Create validated callout extensions.

- **Max length:** 25 characters per callout
- **Throws** if any callout exceeds 25 characters

```ts
callouts('Free Trial', 'No Credit Card', 'AI-Powered')
```

### Negative Keywords

#### `negatives(...texts: string[]): Keyword[]`

Create negative keywords. Always uses BROAD match type. Deduplicates by lowercased text.

```ts
negatives('free', 'open source', 'download')
// [
//   { text: 'free', matchType: 'BROAD' },
//   { text: 'open source', matchType: 'BROAD' },
//   { text: 'download', matchType: 'BROAD' },
// ]
```

### URL

#### `url(finalUrl: string, utm?: UTMParams): UrlResult`

Create a URL with optional UTM tracking parameters.

- **Throws** if `finalUrl` doesn't start with `http://` or `https://`

```ts
url('https://renamed.to')
// { finalUrl: 'https://renamed.to' }

url('https://renamed.to', {
  source: 'google',
  medium: 'cpc',
  campaign: 'search-exact',
})
// { finalUrl: 'https://renamed.to', utm: { source: 'google', medium: 'cpc', campaign: 'search-exact' } }
```

**`UrlResult` type:**
```ts
type UrlResult = {
  readonly finalUrl: string
  readonly utm?: UTMParams
}
```

---

## Campaign Builder

### `google.search(name: string, input: SearchCampaignInput): CampaignBuilder`

Create a Google Search campaign. Returns a `CampaignBuilder` with chaining methods.

**`SearchCampaignInput`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `budget` | `Budget` | required | Daily or monthly budget |
| `bidding` | `BiddingInput` | required | String shorthand (`'maximize-conversions'`, `'maximize-clicks'`, `'manual-cpc'`) or full `BiddingStrategy` object |
| `targeting` | `Targeting` | `{ rules: [] }` | Campaign-level targeting |
| `negatives` | `Keyword[]` | `[]` | Campaign-level negative keywords |
| `status` | `'enabled' \| 'paused'` | `'enabled'` | Campaign status |

**`BiddingStrategy` variants:**

| Type | Extra Fields |
|------|-------------|
| `'maximize-conversions'` | none |
| `'maximize-clicks'` | `maxCpc?: number` |
| `'manual-cpc'` | `enhancedCpc?: boolean` |
| `'target-cpa'` | `targetCpa: number` |

```ts
const campaign = google.search('Search - Exact Match', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
  negatives: negatives('free', 'open source'),
})
```

### `.locale(key: string, targeting: Targeting, group: AdGroupInput): CampaignBuilder`

Add a localized ad group with a targeting override. The targeting replaces any campaign-level targeting for this group.

```ts
campaign.locale('en-us', targeting(geo('US'), languages('en')), {
  keywords: exact('rename files', 'batch rename'),
  ad: rsa(
    headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool'),
    descriptions('Rename files in seconds.', 'Try free today.'),
    url('https://renamed.to'),
  ),
})
```

### `.group(key: string, group: AdGroupInput): CampaignBuilder`

Add an ad group that inherits campaign-level targeting.

**`AdGroupInput`:**

| Field | Type | Description |
|-------|------|-------------|
| `keywords` | `Keyword[]` | Keywords for this group |
| `ad` | `GoogleAd \| GoogleAd[]` | One or more ads (single ad is wrapped in array) |
| `targeting` | `Targeting` | Optional group-level targeting override |
| `status` | `'enabled' \| 'paused'` | Optional group status |

```ts
campaign.group('pdf-renaming', {
  keywords: exact('rename pdf', 'pdf renamer'),
  ad: rsa(
    headlines('PDF Renamer', 'Rename PDFs in Bulk', 'AI PDF Organizer'),
    descriptions('Rename PDF files with AI rules.', 'Free trial available.'),
    url('https://renamed.to/pdf-renamer'),
  ),
})
```

### `.sitelinks(...links: Sitelink[]): CampaignBuilder`

Set sitelink extensions on the campaign. Replaces any existing sitelinks.

```ts
campaign.sitelinks(
  link('Pricing', '/pricing'),
  link('Features', '/features'),
)
```

### `.callouts(...texts: string[]): CampaignBuilder`

Set callout extensions on the campaign. Replaces any existing callouts.

- **Max length:** 25 characters per callout
- **Throws** if any callout exceeds 25 characters

```ts
campaign.callouts('Free Trial', 'No Credit Card', 'AI-Powered')
```

### Chaining

All builder methods return a new `CampaignBuilder`, so calls can be chained:

```ts
const campaign = google.search('Search - Exact Match', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
  negatives: negatives('free', 'open source'),
})
.locale('en-us', targeting(geo('US'), languages('en')), {
  keywords: exact('rename files', 'batch rename'),
  ad: rsa(
    headlines('Rename Files Fast', 'AI File Renamer', 'Batch Rename Tool'),
    descriptions('Rename files in seconds with AI.', 'Try free today.'),
    url('https://renamed.to'),
  ),
})
.locale('de', targeting(geo('DE', 'AT', 'CH'), languages('de')), {
  keywords: exact('dateien umbenennen', 'batch umbenennung'),
  ad: rsa(
    headlines('Dateien Umbenennen', 'KI-Datei-Organizer', 'Batch Umbenennung'),
    descriptions('Dateien in Sekunden umbenennen.', 'Jetzt kostenlos testen.'),
    url('https://renamed.to/de'),
  ),
})
.sitelinks(
  link('Pricing', '/pricing'),
  link('Features', '/features'),
)
.callouts('Free Trial', 'No Credit Card', 'AI-Powered')
```

---

## Config

### `defineConfig(config: AdsConfig): AdsConfig`

Typed identity function for ads configuration files. Provides autocompletion and type-checking.

**`AdsConfig`:**

| Field | Type | Description |
|-------|------|-------------|
| `google` | `GoogleProviderConfig` | Google Ads connection settings |
| `meta` | `MetaProviderConfig` | Meta Ads connection settings |
| `cache` | `string` | Path to cache directory |

**`GoogleProviderConfig`:**

| Field | Type | Description |
|-------|------|-------------|
| `customerId` | `string` | Google Ads customer ID |
| `managerId` | `string` | MCC manager account ID (optional) |
| `credentials` | `string` | Path to credentials file (optional) |

**`MetaProviderConfig`:**

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | `string` | Meta ad account ID |
| `credentials` | `string` | Path to credentials file (optional) |

```ts
import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  google: {
    customerId: '123-456-7890',
    managerId: '098-765-4321',
  },
  cache: '.ads-cache',
})
```

---

## Performance

Types and functions for performance monitoring. Import from `@upspawn/ads` or `src/performance/types.ts`.

### `PerformanceTargets`

Declared on campaigns to set performance expectations. All fields are optional.

| Field | Type | Description |
|-------|------|-------------|
| `targetCPA` | `number` | Maximum acceptable cost per acquisition |
| `minROAS` | `number` | Minimum return on ad spend (e.g., 2.0 = 200%) |
| `minCTR` | `number` | Minimum click-through rate (e.g., 0.02 = 2%) |
| `maxCPC` | `number` | Maximum cost per click |
| `maxBudget` | `Budget` | Upper bound for budget scaling recommendations |
| `minConversions` | `number` | Minimum expected conversions for the period |
| `minImpressionShare` | `number` | Minimum impression share (e.g., 0.5 = 50%) |
| `strategy` | `string` | Natural language strategy for AI evaluation |

```ts
const targets: PerformanceTargets = {
  targetCPA: 15,
  minROAS: 2.0,
  maxBudget: daily(eur(50)),
  strategy: `Scale aggressively while CPA stays under target.`
}
```

### `PerformanceMetrics`

Computed metrics for a resource over a period. Raw counters plus derived rates.

| Field | Type | Description |
|-------|------|-------------|
| `impressions` | `number` | Total impressions |
| `clicks` | `number` | Total clicks |
| `cost` | `number` | Total spend (currency units, not micros) |
| `conversions` | `number` | Total conversions |
| `conversionValue` | `number` | Total conversion value |
| `ctr` | `number \| null` | Click-through rate (null if 0 impressions) |
| `cpc` | `number \| null` | Cost per click (null if 0 clicks) |
| `cpa` | `number \| null` | Cost per acquisition (null if 0 conversions) |
| `roas` | `number \| null` | Return on ad spend (null if 0 cost) |
| `cpm` | `number \| null` | Cost per thousand impressions (null if 0 impressions) |
| `impressionShare` | `number` | Google only — search impression share |
| `qualityScore` | `number` | Google only — keyword quality score (1-10) |
| `frequency` | `number` | Meta only — average times ad shown per user |
| `reach` | `number` | Meta only — unique users reached |

### `PerformanceData`

Per-resource performance snapshot with breakdowns and violations.

| Field | Type | Description |
|-------|------|-------------|
| `resource` | `string` | Slugified resource path (e.g., `search-pdf-renaming/pdf-renamer-en`) |
| `provider` | `'google' \| 'meta'` | Source provider |
| `kind` | `ResourceKind` | Resource type (`campaign`, `adGroup`, `adSet`, `keyword`, `ad`) |
| `period` | `{ start: Date; end: Date }` | Date range for the data |
| `metrics` | `PerformanceMetrics` | Aggregated metrics for the period |
| `targets` | `PerformanceTargets` | Resolved targets (after inheritance) |
| `violations` | `PerformanceViolation[]` | Target violations detected |
| `breakdowns.byDay` | `{ date, metrics }[]` | Daily breakdown |
| `breakdowns.byDevice` | `Record<'mobile'\|'desktop'\|'tablet', metrics>` | Google: device breakdown |
| `breakdowns.bySearchTerm` | `{ term, metrics }[]` | Google: search term breakdown |
| `breakdowns.byAge` | `Record<string, metrics>` | Meta: age breakdown |
| `breakdowns.byGender` | `Record<string, metrics>` | Meta: gender breakdown |
| `breakdowns.byPlacement` | `Record<string, metrics>` | Meta: placement breakdown |

### `PerformanceReport`

Top-level output from `ads performance --json`. Aggregates all data, signals, and recommendations.

| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | `Date` | Timestamp of report generation |
| `period` | `{ start: Date; end: Date }` | Query date range |
| `data` | `PerformanceData[]` | Per-resource performance snapshots |
| `signals` | `PerformanceSignal[]` | Detected anomalies and patterns |
| `recommendations` | `PerformanceRecommendation[]` | Actionable suggestions |
| `summary.totalSpend` | `number` | Total spend across campaigns |
| `summary.totalConversions` | `number` | Total conversions across campaigns |
| `summary.totalConversionValue` | `number` | Total conversion value |
| `summary.overallCPA` | `number \| null` | Overall cost per acquisition |
| `summary.overallROAS` | `number \| null` | Overall return on ad spend |
| `summary.violationCount` | `number` | Total violation count |
| `summary.signalCount` | `{ info, warning, critical }` | Signal counts by severity |

### `computeMetrics(raw: RawMetrics): PerformanceMetrics`

Derive rate metrics (CTR, CPC, CPA, ROAS, CPM) from raw counters. Returns `null` for any metric that would divide by zero.

```ts
import { computeMetrics } from '@upspawn/ads'

const metrics = computeMetrics({
  impressions: 1200,
  clicks: 85,
  cost: 87.5,
  conversions: 7,
  conversionValue: 183.75,
})
// { impressions: 1200, clicks: 85, cost: 87.5, conversions: 7,
//   conversionValue: 183.75, ctr: 0.0708, cpc: 1.03, cpa: 12.5,
//   roas: 2.1, cpm: 72.92 }
```

### Signal Types

Signals are anomalies and patterns detected from raw data, independent of declared targets.

| Signal | Severity | Description |
|--------|----------|-------------|
| `budget-constrained` | warning | CPA well below target but impression share is low — budget limits growth |
| `zero-conversions` | warning | Resource spent >$10 with 0 conversions |
| `creative-fatigue` | warning | Ad CTR declining >20% between period halves |
| `spend-concentration` | warning | Child resource consuming >60% of parent campaign spend |
| `declining-trend` | warning | CTR declining >20% between period halves |
| `improving-trend` | info | CTR improving >20% between period halves |
| `learning-phase` | info | Meta ad set with <50 conversions (still optimizing) |
| `high-frequency` | warning | Meta ad frequency >4 — audience may be fatigued |
| `low-quality-score` | warning | Google keyword quality score <= 3/10 |
| `search-term-opportunity` | info | Search term converting with 5+ clicks — consider adding as keyword |

### Recommendation Types

Recommendations are actionable suggestions with a confidence level and source (`computed` or `ai`).

| Type | Description |
|------|-------------|
| `scale-budget` | Increase budget — CPA has headroom vs target |
| `reduce-budget` | Decrease budget — CPA exceeding target |
| `pause-resource` | Pause keyword/ad — spending with 0 conversions |
| `resume-resource` | Resume paused resource — conditions improved |
| `adjust-bid` | Change bid strategy or amount |
| `shift-budget` | Move budget from one resource to another |
| `add-negative` | Add negative keyword — search term wasting spend |
| `refresh-creative` | Update ad creative — fatigue detected |

---

## Types

### Core Types

| Type | Description |
|------|-------------|
| `Headline` | Branded string for RSA headlines (max 30 chars) |
| `Description` | Branded string for RSA descriptions (max 90 chars) |
| `CalloutText` | Branded string for callout extensions (max 25 chars) |
| `Budget` | Union of `DailyBudget` and `MonthlyBudget` |
| `DailyBudget` | Budget with `period: 'daily'`, amount, and currency |
| `MonthlyBudget` | Budget with `period: 'monthly'`, amount, and currency |
| `Keyword` | Union of `ExactKeyword`, `PhraseKeyword`, `BroadKeyword` |
| `ExactKeyword` | Keyword with `matchType: 'EXACT'` |
| `PhraseKeyword` | Keyword with `matchType: 'PHRASE'` |
| `BroadKeyword` | Keyword with `matchType: 'BROAD'` |
| `Targeting` | Container with an array of `TargetingRule` |
| `TargetingRule` | Union of `GeoTarget`, `LanguageTarget`, `ScheduleTarget` |
| `GeoTarget` | Target by country codes |
| `LanguageTarget` | Target by language codes |
| `ScheduleTarget` | Target by days of week and/or hour range |
| `CountryCode` | ISO country code string (autocompletes common codes) |
| `LanguageCode` | ISO language code string (autocompletes common codes) |
| `Day` | Day of week: `'mon'` through `'sun'` |
| `UTMParams` | UTM tracking parameters (source, medium, campaign, content, term) |
| `AdsConfig` | Top-level configuration shape |
| `AdsError` | Discriminated union of error types (auth, quota, validation, conflict, policy, budget, api) |

### Diff Engine Types

| Type | Description |
|------|-------------|
| `Resource` | A managed entity (campaign, ad group, keyword, ad, extension) with kind, path, properties, and optional platform ID |
| `Change` | A single diff operation: create, update, delete, or drift |
| `Changeset` | Grouped changes: creates, updates, deletes, and drift |
| `PropertyChange` | A field-level diff with from/to values |

### Google Types

| Type | Description |
|------|-------------|
| `GoogleSearchCampaign` | Full campaign definition with budget, bidding, targeting, groups, and extensions |
| `GoogleAdGroup` | Ad group with keywords, ads, optional targeting and status |
| `GoogleAd` | Union of ad types (currently only `RSAd`) |
| `RSAd` | Responsive Search Ad with headlines, descriptions, URL, and optional UTM |
| `Sitelink` | Sitelink extension with text, URL, and optional descriptions |
| `BiddingStrategy` | Discriminated union of bidding approaches |
| `BiddingInput` | String shorthand or full `BiddingStrategy` object |
| `AdGroupInput` | Input shape for adding ad groups (accepts single `ad` or array) |
| `CampaignBuilder` | `GoogleSearchCampaign` plus chainable builder methods |
| `SearchCampaignInput` | Input shape for `google.search()` |
| `GoogleConfig` | Auth configuration (OAuth, service account, or env-based) |
| `GoogleAdsClient` | API client interface with `query()` and `mutate()` methods |
| `Campaign` | Union of all campaign types (currently `GoogleSearchCampaign`) |
