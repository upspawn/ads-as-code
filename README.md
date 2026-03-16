# ads-as-code

Manage Google Ads and Meta (Facebook/Instagram) campaigns as version-controlled TypeScript code. Like Pulumi/Terraform, but for ad campaigns.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-bun%20test-blue)](https://bun.sh)

## What is this?

`ads-as-code` is a TypeScript SDK and CLI for defining ad campaigns in code, diffing them against your live accounts, and applying changes. Instead of clicking through the Google Ads or Meta Ads Manager UI, you write type-safe campaign definitions, review a plan of what will change, and apply it. Your campaigns live in git, are reviewable in PRs, and have full change history.

## Features

- **Type-safe campaign definitions** -- headlines validated to 30 chars, descriptions to 90 chars, budgets, bidding, keywords, and targeting all checked at compile time
- **Plan / apply workflow** -- see exactly what will change before it touches your account (`ads plan` then `ads apply`)
- **Drift detection** -- `ads pull` detects changes made in the ad platform UI that diverge from code
- **Campaign import** -- `ads import` pulls your existing campaigns and generates idiomatic TypeScript files
- **SQLite cache + history** -- local cache maps code paths to platform IDs, stores snapshots for rollback
- **Multi-provider** -- Google Ads (Search, Display, Performance Max, Shopping, Demand Gen, Smart, App) and Meta/Facebook (traffic, conversions, leads, and more)

## Quick Start

```bash
# Install
bun add @upspawn/ads

# Scaffold a project
ads init
# Created:
#   + ads.config.ts
#   + campaigns/
#   + targeting.ts
#   + negatives.ts

# Authenticate with Google Ads
ads auth google

# Import existing campaigns
ads import
# Imported 5 campaign(s):
#   + campaigns/search-exact-match.ts  (47 resources)  Search - Exact Match
#   + campaigns/search-pdf-renaming.ts (32 resources)  Search - PDF Renaming
#   + campaigns/search-dropbox.ts      (18 resources)  Search - Dropbox
#   ...

# See what's different between code and live account
ads plan
# Campaign "Search - PDF Renaming"
#   ~ keyword: "pdf renamer" (broad): text: "PDF Renamer" -> "pdf renamer"
#   + keyword: "ai pdf file renamer" (exact)
#
# Summary: 1 campaign changed | 1 update | 1 create

# Push code changes to Google Ads
ads apply
```

## Campaign Syntax

Campaigns are TypeScript files that export a campaign definition built with the `google.search()` builder (or `google.display()`, `google.performanceMax()`, `google.shopping()`, `google.demandGen()`, `google.smart()`, `google.app()` for other campaign types).

### Basic campaign

```typescript
import {
  google, daily, exact, broad, phrase,
  headlines, descriptions, rsa, url, negatives,
} from '@upspawn/ads'

export default google.search('Search - PDF Renaming', {
  budget: daily(1.5),            // EUR 1.50/day (EUR is default)
  bidding: 'maximize-clicks',    // or 'maximize-conversions', { type: 'target-cpa', targetCpa: 5 }
  negatives: [
    ...broad('free', 'tutorial', 'open source', 'torrent'),
    ...phrase('how to rename', 'pdf compressor'),
  ],
})
  .group('pdf-renamer-en', {
    keywords: [
      ...broad('ai pdf renamer', 'auto rename pdf', 'pdf renamer'),
      ...exact('auto rename pdf files', 'pdf file renamer'),
    ],
    ad: rsa(
      headlines(
        'AI PDF Renamer - Try Free',       // max 30 chars, validated
        'Rename PDFs Based on Content',
        '50 Free Renames to Start',
        'AI Reads Every Page',
        'No Software to Install',
      ),
      descriptions(
        '95% accuracy on invoices & receipts. 50 free renames. No install needed.',  // max 90 chars
        'Upload PDFs. AI reads dates, amounts, names - renames every file.',
      ),
      url('https://www.renamed.to/pdf-renamer'),
    ),
  })
  .group('pdf-renamer-de', {
    keywords: [
      ...exact('pdf automatisch umbenennen', 'pdf dateien umbenennen'),
      ...broad('pdf umbenennen'),
    ],
    ad: rsa(
      headlines(
        'PDF automatisch umbenennen',
        'KI liest Inhalte & benennt um',
        'Made in Germany. DSGVO-konform',
      ),
      descriptions(
        '95% Genauigkeit bei Rechnungen. 50 kostenlose Umbenennungen. Sofort los.',
        'PDFs hochladen. KI erkennt Daten, Betraege, Firmen - benennt alles um.',
      ),
      url('https://www.renamed.to/de/pdf-renamer'),
    ),
  })
```

### Meta (Facebook/Instagram) campaign

```typescript
import { meta, daily, geo, targeting, image } from '@upspawn/ads'

export default meta.traffic('Retargeting - US', {
  budget: daily(10),
})
  .adSet('Website Visitors', {
    targeting: targeting(geo('US')),
    optimization: 'LINK_CLICKS',
  }, {
    url: 'https://www.renamed.to',
    cta: 'SIGN_UP',
    ads: [
      image('./assets/hero.png', {
        headline: 'Rename Files Instantly',
        primaryText: 'Stop wasting hours organizing files manually.',
      }),
    ],
  })
```

Objectives: `meta.traffic()`, `meta.conversions()`, `meta.leads()`, `meta.sales()`, `meta.awareness()`, `meta.engagement()`, `meta.appPromotion()`. Each objective constrains which optimization goals are valid for its ad sets at compile time.

Creative helpers: `image()`, `video()`, `carousel()`, `boostedPost()`.

### Shared targeting and negatives

`ads init` generates `targeting.ts` and `negatives.ts` for reusable presets:

```typescript
// targeting.ts
import { geo, languages, targeting } from '@upspawn/ads'

export const english = targeting(
  geo('US', 'CA', 'GB', 'AU'),
  languages('en'),
)

export const dach = targeting(
  geo('DE', 'AT', 'CH'),
  languages('de'),
)
```

```typescript
// negatives.ts
import { negatives } from '@upspawn/ads'

export const brandSafety = negatives(
  'free', 'cheap', 'crack', 'torrent', 'download',
)
```

Use them in campaigns with `.locale()` for per-group targeting:

```typescript
import { english, dach } from '../targeting'
import { brandSafety } from '../negatives'

export default google.search('Search - Product', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  negatives: brandSafety,
})
  .locale('en-us', english, {
    keywords: exact('product feature'),
    ad: rsa(/* ... */),
  })
  .locale('de-dach', dach, {
    keywords: exact('produkt funktion'),
    ad: rsa(/* ... */),
  })
```

### Factory pattern for similar campaigns

When you have multiple campaigns with shared structure (e.g., integration-specific campaigns), use a factory:

```typescript
import { google, daily, broad, phrase, headlines, descriptions, rsa, url } from '@upspawn/ads'

function integrationCampaign(name: string, integration: string, landingPage: string) {
  return google.search(`Search - ${name}`, {
    budget: daily(3),
    bidding: 'maximize-clicks',
    negatives: [...broad('free', 'tutorial'), ...phrase('how to rename')],
  })
    .group(`${integration}-en`, {
      keywords: broad(`${integration} file organizer`, `rename files in ${integration}`),
      ad: rsa(
        headlines(`AI Renames Your ${name} Files`, 'Try Free - No Credit Card'),
        descriptions(`Connect ${name}, select a folder. AI reads each file and renames it.`),
        url(`https://www.renamed.to/integrations/${integration}`),
      ),
    })
}

export const dropbox = integrationCampaign('Dropbox', 'dropbox', '/integrations/dropbox')
export const gdrive = integrationCampaign('Google Drive', 'google-drive', '/integrations/google-drive')
export const onedrive = integrationCampaign('OneDrive', 'onedrive', '/integrations/onedrive')
```

### Full campaign options

```typescript
// All available campaign-level options
export default google.search('Search - OneDrive', {
  budget: daily(4),
  bidding: 'maximize-clicks',
  targeting: targeting(
    geo('US', 'DE'),
    languages('en', 'de'),
    device('mobile', -1),          // exclude mobile (-100%)
  ),
  networkSettings: {
    searchNetwork: true,
    searchPartners: false,
    displayNetwork: false,          // disable Display Network
  },
  trackingTemplate: '{lpurl}?utm_source=google&utm_medium=cpc',
  finalUrlSuffix: 'utm_campaign={campaignid}',
  status: 'paused',                // create as paused
})
```

### Extensions

```typescript
import { link } from '@upspawn/ads'

export default google.search('My Campaign', { /* ... */ })
  .group('main', { /* ... */ })
  .sitelinks(
    link('Pricing', '/pricing', { description1: 'Plans from $9/mo' }),
    link('How It Works', '/how-it-works'),
  )
  .callouts('No Credit Card', 'GDPR Ready', 'Made in Germany')
```

### Helper reference

| Helper | Purpose | Example |
|--------|---------|---------|
| `exact(...terms)` | Exact match keywords | `exact('pdf renamer', 'file renamer')` |
| `phrase(...terms)` | Phrase match keywords | `phrase('rename pdf files')` |
| `broad(...terms)` | Broad match keywords | `broad('ai file organizer')` |
| `keywords(template)` | Bracket notation: `[exact]`, `"phrase"`, `broad` | `keywords('[pdf renamer]', '"rename files"', 'ai tool')` |
| `daily(amount, currency?)` | Daily budget (default EUR) | `daily(10)`, `daily(15, 'USD')` |
| `monthly(amount, currency?)` | Monthly budget | `monthly(300)` |
| `geo(...countries)` | Geographic targeting | `geo('US', 'DE', 'GB')` |
| `languages(...langs)` | Language targeting | `languages('en', 'de')` |
| `targeting(...rules)` | Compose targeting rules | `targeting(geo('US'), languages('en'))` |
| `weekdays()` | Monday-Friday schedule | `weekdays()` |
| `hours(start, end)` | Hour range schedule | `hours(8, 18)` |
| `headlines(...texts)` | Validated headlines (max 30 chars) | `headlines('Try Free', 'AI Powered')` |
| `descriptions(...texts)` | Validated descriptions (max 90 chars) | `descriptions('Upload files and...')` |
| `rsa(headlines, descriptions, url)` | Responsive Search Ad | See examples above |
| `url(finalUrl, utm?)` | URL with optional UTM params | `url('https://example.com')` |
| `link(text, url, options?)` | Sitelink extension | `link('Pricing', '/pricing')` |
| `callouts(...texts)` | Callout extensions (max 25 chars) | `callouts('Free Trial', 'GDPR Ready')` |
| `device(type, adjustment)` | Device bid adjustment | `device('mobile', -0.5)` (−50% mobile bid) |
| `negatives(...texts)` | Deduplicated negative keywords (broad) | `negatives('free', 'cheap')` |
| `networkSettings: {...}` | Network settings (config) | `{ searchNetwork: true, displayNetwork: false }` |

## CLI Reference

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `ads init` | Scaffold a new project (config, directories, presets) | |
| `ads auth <provider>` | Authenticate with an ad platform (interactive OAuth) | `--check` |
| `ads import` | Import live campaigns as TypeScript files | `--all`, `--filter <glob>`, `--provider meta` |
| `ads validate` | Validate campaign files and report errors | |
| `ads plan` | Show what changes would be applied | `--json` |
| `ads apply` | Apply changes to ad platforms | `--json`, `--dry-run` |
| `ads pull` | Pull live state and detect drift from code | |
| `ads status` | Show current platform state | `--filter <glob>`, `--json` |
| `ads search <type> <query>` | Search Meta targeting (interests, behaviors) | `ads search interests "Construction"` |
| `ads audiences` | List Meta custom audiences | |
| `ads history` | Show operation history | `--diff N`, `--rollback N` |
| `ads doctor` | Run diagnostic checks on project setup | |
| `ads cache` | Manage the local cache | `clear`, `stats` |

Global flags: `--json` (JSON output), `--provider <google|meta>` (filter provider), `--help`

## Configuration

### ads.config.ts

```typescript
import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  google: {
    customerId: '730-096-7494',     // Your Google Ads customer ID
    managerId: '239-066-1468',      // MCC manager ID (optional)
  },
  meta: {
    accountId: 'act_123456789',     // Your Meta Ads account ID
    pageId: '123456789',            // Facebook Page ID (for ad creatives)
    apiVersion: 'v22.0',            // Graph API version (optional, defaults to v22.0)
  },
})
```

### Credentials

**Option 1: Interactive OAuth (recommended)**

```bash
ads auth google
# Opens browser for Google OAuth consent
# Saves credentials to ~/.ads/credentials.json
```

You will need:
- A Google Ads Developer Token (from API Center)
- An OAuth Client ID and Secret (from Google Cloud Console)

**Option 2: Environment variables**

```bash
export GOOGLE_ADS_CLIENT_ID="your-client-id"
export GOOGLE_ADS_CLIENT_SECRET="your-client-secret"
export GOOGLE_ADS_REFRESH_TOKEN="your-refresh-token"
export GOOGLE_ADS_DEVELOPER_TOKEN="your-developer-token"
```

Verify credentials work:

```bash
ads auth google --check
# Using credentials from ~/.ads/credentials.json
# Authentication valid.
```

### Meta (Facebook/Instagram)

Set the `FB_ADS_ACCESS_TOKEN` environment variable:

```bash
export FB_ADS_ACCESS_TOKEN="your-meta-access-token"
```

Generate a long-lived token from the [Meta Business Suite](https://business.facebook.com/settings/system-users) system user settings, or use a short-lived token from the Graph API Explorer for testing.

## How It Works

```
campaigns/*.ts          TypeScript campaign definitions (Google + Meta)
       |
       v
   flatten()            Decompose campaigns into flat Resource list
       |                (campaign, adGroup/adSet, keyword, ad, extensions)
       v
    diff()              Pure function: compare desired vs actual resources
       |                Semantic comparison (budget micros, URL normalization,
       |                case-insensitive keywords, order-independent headlines)
       v
   Changeset            { creates, updates, deletes, drift }
       |
       v
   apply()              Execute mutations via Google Ads API or Meta Graph API
```

The **diff engine** is a pure function that takes desired resources (from code) and actual resources (from the API) and produces a changeset. It uses semantic comparison: budgets are compared in micros to avoid float issues, headlines/descriptions are order-independent, keyword text is case-insensitive, and URLs are normalized. The same engine works for both Google and Meta resources.

The **SQLite cache** (`.ads/cache.db`) tracks which resources are managed by ads-as-code, maps code paths to platform IDs for stable identity across content changes, and stores operation snapshots for history/rollback.

The **import** command fetches live campaigns via GAQL (Google) or Graph API (Meta), generates idiomatic TypeScript using the SDK helpers, and seeds the cache so `ads plan` immediately shows a clean diff.

## Status

**v0.2.0** -- Actively used in production for managing Google Ads and Meta campaigns.

### What works

**Google Ads (full platform coverage):**

Campaign types:
- **Search** -- RSA ads, keywords, extensions, all targeting, zero-diff round-trips
- **Display** -- Responsive Display Ads, image assets, placements/topics/content keyword targeting, CPM bidding
- **Performance Max** -- Asset groups with text/image/video, audience signals, URL expansion control
- **Shopping** -- Merchant Center integration, product ad groups, shopping settings
- **Demand Gen** -- Multi-asset ads, carousel ads, channel controls (YouTube/Discover/Gmail/Display)
- **Smart** -- Keyword themes, simplified ads, automated bidding
- **App** -- Install/engagement/pre-registration campaigns
- **Video** -- Read-only (Google Ads API limitation)

Features across all types:
- Full campaign lifecycle: create, update, delete via `plan` / `apply`
- Zero-diff round-trips: `import` then `plan` = 0 changes
- Import existing campaigns as TypeScript files
- Drift detection between code and live account
- Semantic diff (budget precision, headline ordering, URL normalization)
- RSA stable identity (content changes produce updates, not delete+create)
- 9 bidding strategies: maximize-conversions, maximize-clicks, manual-cpc, target-cpa, target-roas, target-impression-share, maximize-conversion-value, manual-cpm, target-cpm
- Full targeting: geo, language, device, schedule, demographics, audiences (remarketing/in-market/affinity/custom), placements, topics, content keywords
- All extensions: sitelinks, callouts, structured snippets, call -- with proper campaign asset linking
- Campaign settings: network settings, tracking template, URL suffix, custom parameters, status, dates
- Keyword management: create, update (bid/status/finalUrl), delete
- Ad management: create, update (headlines/descriptions/status/path), delete, multiple ads per group
- Account-level: shared negative keyword lists, conversion actions, shared budgets
- URL helper: `url()` auto-parses UTM params for clean DX

**Meta (Facebook/Instagram):**
- Campaign + ad set + ad lifecycle: create, update, pause via `plan` / `apply`
- Import existing campaigns from Meta Ads as TypeScript files
- Image, video, carousel, and boosted post ad creatives
- Local image/video upload to Meta during apply
- Interest and behavior targeting search (`ads search interests "..."`)
- Custom audience listing (`ads audiences`)
- Objective-typed campaigns (traffic, conversions, leads, sales, awareness, engagement, app promotion)
- Type-safe optimization goals constrained by campaign objective

**Shared:**
- SQLite cache with operation history
- `--dry-run` flag on apply
- Multi-provider support in all CLI commands

### Known limitations

- Google: Video campaign creation not supported (API limitation -- read-only)
- Google: Image asset upload during apply not yet connected (image refs stored, upload pipeline ready but not wired to apply flow)
- Google: Product listing group trees for Shopping (basic product groups work, complex subdivisions need manual setup)
- Google: Audience list creation (remarketing lists, customer match) -- audiences can be referenced by ID but not created as code
- Google: Portfolio bidding strategies -- referenced but not fully managed
- No `ads destroy` or `ads diff` commands yet

## Contributing

This project uses [Bun](https://bun.sh) as its runtime.

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bunx tsc --noEmit
```

PRs welcome. The codebase is structured as:

- `src/core/` -- diff engine, flatten, cache, config, codegen (platform-agnostic)
- `src/google/` -- Google Ads API client, fetch, apply, constants
- `src/meta/` -- Meta Graph API client, fetch, apply, upload, codegen
- `src/helpers/` -- keyword, budget, targeting, ad, extension, URL, meta-creative helpers
- `src/ai/` -- AI-powered ad copy generation markers and prompts
- `cli/` -- CLI commands (init, auth, import, plan, apply, pull, status, search, audiences, history, doctor, cache)
- `test/unit/` -- unit tests for all modules
- `example/` -- example project with real campaign files

## License

MIT
