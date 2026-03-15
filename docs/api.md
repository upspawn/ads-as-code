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
