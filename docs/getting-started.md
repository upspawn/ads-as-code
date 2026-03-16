# Getting Started

Set up `@upspawn/ads` and manage your first campaign as code.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- A Google Ads account with API access enabled

## Install

Install the package globally:

```bash
bun add -g @upspawn/ads
```

Or run directly from source:

```bash
git clone https://github.com/upspawn/ads-as-code.git
cd ads-as-code
bun install
bun cli/index.ts --help
```

## Initialize a project

Create a new directory and scaffold the project structure:

```bash
mkdir my-ads && cd my-ads
ads init
```

This creates:

```
ads.config.ts     # Provider configuration (account IDs)
campaigns/        # Directory for campaign files
targeting.ts      # Shared targeting presets (geo + language)
negatives.ts      # Shared negative keyword lists
.gitignore        # Ignores .ads/ cache directory
```

## Configure your account

Edit `ads.config.ts` with your Google Ads account details:

```typescript
import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  google: {
    customerId: '1234567890',    // Your Google Ads customer ID (no dashes)
    managerId: '0987654321',     // MCC manager account ID (if applicable)
  },
})
```

Find your customer ID in the Google Ads UI (top-right corner, formatted as `123-456-7890` — remove the dashes).

## Authenticate

Run the OAuth flow to connect your Google Ads account:

```bash
ads auth google
```

The CLI will prompt for three things:

1. **Developer Token** — Get this from your Google Ads account under Tools > API Center. If you don't have API access yet, apply at [Google Ads API Center](https://developers.google.com/google-ads/api/docs/get-started/dev-token).

2. **OAuth Client ID** — Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Choose "Desktop application" as the application type.

3. **OAuth Client Secret** — From the same OAuth credential.

After entering these, the CLI opens your browser for OAuth consent. Authorize the app, and credentials are saved to `~/.ads/credentials.json`.

Verify authentication works:

```bash
ads auth google --check
```

```
Using credentials from /Users/you/.ads/credentials.json
Authentication valid.
```

### Alternative: environment variables

Instead of `~/.ads/credentials.json`, you can set these environment variables:

```bash
export GOOGLE_ADS_CLIENT_ID="..."
export GOOGLE_ADS_CLIENT_SECRET="..."
export GOOGLE_ADS_REFRESH_TOKEN="..."
export GOOGLE_ADS_DEVELOPER_TOKEN="..."
export GOOGLE_ADS_CUSTOMER_ID="..."
```

## Import existing campaigns

If you have campaigns already running in Google Ads, import them as TypeScript files:

```bash
ads import
```

```
Fetching campaigns from Google Ads (customer 1234567890)...

Imported 3 campaign(s):
  + campaigns/search-brand.ts  (12 resources)  Search - Brand
  + campaigns/search-generic.ts  (24 resources)  Search - Generic
  + campaigns/display-retarget.ts  (8 resources)  Display - Retarget
  + targeting.ts  (shared targeting)
  + negatives.ts  (shared negatives)

Total: 5 files written
```

What gets imported:
- **All campaign types:** Search, Display, Performance Max, Shopping, Demand Gen, Smart, App (Video is read-only)
- Campaigns (name, budget, bidding strategy, status, network settings, tracking template, URL suffix, dates)
- Ad groups / asset groups (name, status, targeting)
- Keywords (text, match type, bid, final URL, status)
- RSA ads, Responsive Display Ads, multi-asset ads, carousel ads (all fields including pinned positions)
- Campaign-level negative keywords, shared negative keyword lists
- Geo, language, schedule, device, audience, placement, topic, and content keyword targeting
- Sitelink, callout, structured snippet, and call extensions
- Shopping settings (Merchant Center ID, product filters)
- Performance Max asset groups (text/image/video assets, audience signals, URL expansion)
- Demand Gen channel controls (YouTube, Discover, Gmail, Display)

The import generates idiomatic TypeScript using the `@upspawn/ads` SDK, extracts shared targeting and negative keywords into separate files, and seeds the local cache with platform IDs so `ads plan` can track resources.

Flags:
- `--all` — Include paused campaigns (default: enabled only)
- `--filter "Search*"` — Only import campaigns matching a glob pattern

### Creating Display and Performance Max campaigns

Beyond Search campaigns, you can define Display and Performance Max campaigns using dedicated builders:

```typescript
import { google, daily, geo, targeting } from '@upspawn/ads'

// Display campaign with Responsive Display Ads
export default google.display('Display - Retargeting', {
  budget: daily(5),
  bidding: 'target-cpa',
  targeting: targeting(geo('US', 'DE')),
})
  .group('remarketing', {
    ad: {
      headlines: ['Rename Files with AI', 'Try Free'],
      descriptions: ['Upload files. AI reads content and renames them.'],
      images: ['./assets/hero.png'],
    },
  })

// Performance Max with asset groups
export default google.performanceMax('PMax - All Channels', {
  budget: daily(20),
  bidding: 'maximize-conversions',
})
  .assetGroup('main', {
    headlines: ['AI File Renamer', 'Rename Files Instantly'],
    descriptions: ['Upload files and let AI rename them based on content.'],
    images: ['./assets/hero.png'],
    finalUrl: 'https://www.renamed.to',
  })
```

## Verify the import

Run `ads plan` immediately after import. It should show zero changes:

```bash
ads plan
```

```
Campaign "Search - Brand"
  (no changes)

Campaign "Search - Generic"
  (no changes)

All campaigns in sync. 0 changes.
```

If it shows changes, the import and flatten logic may have a discrepancy worth investigating.

## Make a change

Edit a campaign file. For example, increase a budget:

```typescript
// campaigns/search-brand.ts
export default google.search('Search - Brand', {
  budget: daily(15),    // was daily(10)
  bidding: 'maximize-conversions',
})
```

Run `ads plan` to preview the diff:

```bash
ads plan
```

```
Campaign "Search - Brand"
  ~ campaign "Search - Brand": budget: EUR 10/daily -> EUR 15/daily

Summary: 1 campaign changed | 1 update
Run "ads apply" to push code changes
```

## Apply changes

Push your changes to the ad platform:

```bash
ads apply
```

The CLI shows the plan, then asks for confirmation:

```
Campaign "Search - Brand"
  ~ campaign "Search - Brand": budget: EUR 10/daily -> EUR 15/daily

Summary: 1 campaign changed | 1 update

Apply 1 change? (y/N) y

Results:
  ✓ update search-brand (customers/1234567890/campaigns/123)

1 succeeded, 0 failed.
```

Flags:
- `--yes` / `-y` — Skip confirmation prompt
- `--dry-run` — Show plan without applying
- `--reconcile` — Overwrite platform state where drift is detected

## Other commands

**`ads validate`** — Check campaign files for syntax and structural errors without connecting to the API.

**`ads status`** — Fetch live campaign data from Google Ads and display a table with budgets, bidding strategies, ad group counts, and keyword counts.

**`ads pull`** — Detect drift between your local campaign files and the live platform state. Shows what changed in the Google Ads UI since your last apply.

**`ads history`** — View past apply operations with timestamps, change counts, and success/failure status.

**`ads doctor`** — Run diagnostic checks: config file, credentials, API connectivity, cache, and campaign files.

**`ads cache stats`** / **`ads cache clear`** — View or reset the local SQLite cache at `.ads/cache.db`.
