# CLI Reference

```
ads <command> [options]
```

## Global flags

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format (supported by most commands) |
| `--provider <name>` | Filter to a specific provider (`google`, `meta`) |
| `--help`, `-h` | Show help message |

## Commands

### `ads init`

Scaffold a new ads-as-code project in the current directory.

```bash
ads init
```

Creates:
- `ads.config.ts` — Provider configuration
- `campaigns/` — Campaign file directory
- `targeting.ts` — Shared targeting presets (geo + language)
- `negatives.ts` — Shared negative keyword lists
- `.gitignore` — Updated with `.ads/` and `*.db` entries

Existing files are skipped, never overwritten.

```
Created:
  + ads.config.ts
  + campaigns/
  + targeting.ts
  + negatives.ts
  + .gitignore

Next steps:
  1. Edit ads.config.ts with your provider credentials
  2. Create campaign files in campaigns/
  3. Run `ads validate` to check your campaigns
```

---

### `ads auth <provider>`

Authenticate with an ad platform. Currently supports `google`.

```bash
ads auth google            # Interactive OAuth flow
ads auth google --check    # Verify existing credentials
```

**`ads auth google`**

Prompts for Developer Token, OAuth Client ID, and Client Secret. Opens a browser for OAuth consent. Saves credentials to `~/.ads/credentials.json`.

If credentials already exist, asks whether to re-authenticate.

**`ads auth google --check`**

Tests existing credentials by attempting a token refresh. Checks `~/.ads/credentials.json` first, then falls back to environment variables (`GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`).

```
Using credentials from /Users/you/.ads/credentials.json
Authentication valid.
```

| Flag | Description |
|------|-------------|
| `--check` | Verify credentials without re-authenticating |

---

### `ads validate`

Validate campaign files without connecting to any API.

```bash
ads validate
ads validate --provider google
```

Discovers all `.ts` files in `campaigns/`, loads them, and reports import errors or structural issues.

```
Config: ads.config.ts loaded

Campaigns: 5 found
  google/search  campaigns/search-exact-match.ts (export: default)
  google/search  campaigns/search-pdf-renaming.ts (export: default)
  google/search  campaigns/search-google-drive.ts (export: default)
  google/search  campaigns/search-dropbox.ts (export: default)
  google/search  campaigns/search-onedrive-sharepoint.ts (export: default)

Validation passed.
```

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON |
| `--provider <name>` | Only validate campaigns for this provider |

Exit code: `0` on success, `1` if errors found.

---

### `ads plan`

Show what changes would be applied to the ad platform. Compares local campaign files against live platform state.

```bash
ads plan
ads plan --json
```

The command:
1. Loads `ads.config.ts` and discovers campaign files
2. Flattens campaigns into a list of resources (desired state)
3. Fetches live state from the Google Ads API (actual state)
4. Computes a diff: creates, updates, deletes, and drift

After a fresh `import`, `plan` should show `All campaigns in sync. 0 changes.` — this confirms the round-trip is clean.

```
Campaign "Search - Exact Match"
  (no changes)

Campaign "Search - PDF Renaming"
  ~ campaign "Search - PDF Renaming": budget: EUR 1.5/daily -> EUR 3/daily

Campaign "Search - Google Drive"
  + keyword: "google drive ai organizer" (broad)

Summary: 2 campaigns changed | 1 create | 1 update
Run "ads apply" to push code changes
Run "ads pull" to update code with UI changes
```

Change markers:
- `+` — Resource exists in code but not on platform (will be created)
- `~` — Resource differs between code and platform (will be updated)
- `-` — Resource exists on platform but not in code (will be deleted)
- Drift section — Changes made in the Google Ads UI that differ from code

| Flag | Description |
|------|-------------|
| `--json` | Output the full changeset as JSON |

---

### `ads apply`

Apply changes from local campaign files to the ad platform.

```bash
ads apply
ads apply --yes
ads apply --dry-run
ads apply --reconcile
```

Runs the same diff as `ads plan`, then executes the changes. Prompts for confirmation before applying.

```
Campaign "Search - PDF Renaming"
  ~ campaign "Search - PDF Renaming": budget: EUR 1.5/daily -> EUR 3/daily

Summary: 1 campaign changed | 1 update

Apply 1 change? (y/N) y

Results:
  ✓ update search-pdf-renaming (customers/7300967494/campaigns/456)

1 succeeded, 0 failed.
```

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Skip confirmation prompt |
| `--dry-run` | Show plan without applying any changes |
| `--reconcile` | Convert drift to updates — overwrite platform state with code values |
| `--json` | Output results as JSON |

**Drift handling:** By default, drift (changes made in the Google Ads UI) is shown but not acted on. Use `--reconcile` to force platform state to match your code. Without `--reconcile`, only creates, updates, and deletes from your code are applied.

Operations are recorded in the local cache for `ads history`.

---

### `ads import`

Import campaigns from Google Ads or Meta Ads and generate TypeScript files.

```bash
ads import
ads import --all
ads import --filter "Search*"
ads import --provider meta --all
```

Fetches campaigns from Google Ads (all campaign types: Search, Display, Performance Max, Shopping, Demand Gen, Smart, App) or Meta Ads and generates idiomatic TypeScript campaign files using the `@upspawn/ads` SDK.

What gets imported (Google):
- All campaign types (Search, Display, Performance Max, Shopping, Demand Gen, Smart, App — Video is read-only)
- Campaigns (name, budget, bidding strategy, status, network settings, tracking template, URL suffix, dates)
- Ad groups / asset groups (name, status, targeting)
- Keywords (text, match type, bid, final URL, status)
- All ad formats (RSA, Responsive Display, multi-asset, carousel — all fields including pinned positions)
- Campaign-level negative keywords, shared negative keyword lists
- Full targeting: geo, language, schedule, device, audiences, placements, topics, content keywords
- Extensions: sitelinks, callouts, structured snippets, call
- Shopping settings, PMax asset groups, Demand Gen channel controls

```
Fetching campaigns from Google Ads (customer 7300967494)...

Imported 5 campaign(s):
  + campaigns/search-exact-match.ts  (42 resources)  Search - Exact Match
  + campaigns/search-pdf-renaming.ts  (18 resources)  Search - PDF Renaming
  + campaigns/search-google-drive.ts  (22 resources)  Search - Google Drive
  + campaigns/search-dropbox.ts  (16 resources)  Search - Dropbox
  + campaigns/search-onedrive-sharepoint.ts  (28 resources)  Search - OneDrive + SharePoint
  + targeting.ts  (shared targeting)
  + negatives.ts  (shared negatives)

Total: 7 files written
```

| Flag | Description |
|------|-------------|
| `--all` | Include paused campaigns (default: enabled only) |
| `--filter <glob>` | Only import campaigns matching the pattern (e.g. `"Search*"`) |
| `--json` | Output results as JSON |

The import seeds the local cache (`.ads/cache.db`) with platform IDs, so subsequent `ads plan` commands can accurately track resources.

---

### `ads pull`

Pull live state and detect drift from your campaign files.

```bash
ads pull
```

Compares local campaign files against the Google Ads API and shows what changed on the platform since your last apply.

```
Fetching live state from Google Ads...

Drift detected: 2 change(s)

Platform drift (platform changed values you defined):
  campaign search-pdf-renaming
    budget: 1500000 → 3000000

Resources on platform not in code:
  + campaign search-new-experiment

Apply changes to code? (y/N)
```

If you confirm, the CLI regenerates the affected campaign files from live state using the codegen module.

---

### `ads status`

Show live campaign data from the Google Ads API.

```bash
ads status
ads status --filter "Search*"
ads status --json
```

Fetches campaigns, ad group counts, and keyword counts, then displays a table.

```
Campaign                         Status   Budget  Bidding              Ad Groups  Keywords
──────────────────────────────────────────────────────────────────────────────────────────────
Search - Dropbox                 enabled  $0.50   target-spend         2          21
Search - Exact Match             enabled  $3.00   target-spend         6          47
Search - Google Drive            enabled  $4.00   target-spend         2          25
Search - OneDrive + SharePoint   enabled  $3.00   target-spend         3          30
Search - PDF Renaming            enabled  $1.50   target-spend         2          15

5 campaign(s)
```

| Flag | Description |
|------|-------------|
| `--filter <glob>` | Only show campaigns matching the pattern |
| `--json` | Output as JSON array |

---

### `ads history`

Show past apply operations recorded in the local cache.

```bash
ads history
ads history --diff 3
ads history --rollback 2
```

**Default (no flags):** List recent operations with timestamps, users, change counts, and success status.

```
Recent operations:

#   Timestamp                 User              Changes  Status
──────────────────────────────────────────────────────────────────
1   2026-03-15 14:30:22Z      alex                    3  success
2   2026-03-14 09:15:01Z      alex                    1  success

2 operation(s)

Use --diff N to see full changeset for operation N
Use --rollback N to view snapshot N for revert
```

| Flag | Description |
|------|-------------|
| `--diff <N>` | Show the full changeset and results for operation N |
| `--rollback <N>` | Show snapshot N's captured state (automatic rollback not yet implemented) |

---

### `ads doctor`

Run diagnostic checks on the project setup.

```bash
ads doctor
```

Checks:
1. `ads.config.ts` exists and parses correctly
2. Credentials available (`~/.ads/credentials.json` or env vars)
3. API connectivity (tries a minimal Google Ads query)
4. Cache accessible and schema current
5. `campaigns/` directory exists
6. At least one `.ts` campaign file found

```
ads doctor
──────────

  [PASS]  Config file: ads.config.ts loaded successfully
  [PASS]  Credentials: Found credentials via ~/.ads/credentials.json
  [PASS]  API connectivity: Connected to Google Ads (customer 7300967494)
  [PASS]  Cache: cache.db accessible at .ads/cache.db
  [PASS]  Campaigns directory: campaigns/ directory exists
  [PASS]  Campaign files: 5 campaign file(s) found

All 6 checks passed.
```

Failed checks include a `Fix:` hint:

```
  [FAIL]  Credentials: No credentials found
          Fix: Run `ads auth google` or set GOOGLE_ADS_* environment variables
```

---

### `ads cache <action>`

Manage the local SQLite cache at `.ads/cache.db`.

```bash
ads cache stats
ads cache clear
```

**`ads cache stats`** — Show resource count, snapshot count, operation count, file size, and last operation timestamp.

```
Cache stats:
  File:            .ads/cache.db (24.5 KB)
  Resources:       126
  Snapshots:       3
  Operations:      2
  Last operation:  2026-03-15 14:30:22Z (by alex)
```

**`ads cache clear`** — Delete `cache.db` and its WAL/SHM files. Useful when the cache gets corrupted or you want a fresh start.

```
Cache cleared: .ads/cache.db deleted
```
