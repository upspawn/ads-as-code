# Example: renamed.to Google Ads

This is a dogfood project that uses `@upspawn/ads` to manage real Google Ads campaigns for [renamed.to](https://www.renamed.to) — an AI-powered file renaming tool.

The campaign files were imported from a live Google Ads account (customer `7300967494`) using `ads import`.

## What's here

```
ads.config.ts                              # Account config (customer + manager IDs)
negatives.ts                               # Shared negative keyword list (100+ terms)
campaigns/
  search-exact-match.ts                    # Core campaigns: AI file renaming, bulk rename, PDF, invoices, Google Drive, PDF splitting
  search-pdf-renaming.ts                   # PDF-specific campaigns: German + English ad groups
  search-google-drive.ts                   # Google Drive integration: intercept + rename keywords
  search-dropbox.ts                        # Dropbox integration: automation + industry verticals
  search-onedrive-sharepoint.ts            # OneDrive/SharePoint: rename, Power Automate intercept, SharePoint naming
```

### Campaign details

**Search - Exact Match** — The main campaign. 6 ad groups covering the core product surface: AI file renaming, bulk file renaming, Google Drive renaming, invoice renaming, PDF renaming, and PDF split+rename. Budget: EUR 3/day, Maximize Clicks bidding.

**Search - PDF Renaming** — Dedicated PDF renamer campaigns in German (DE) and English (EN). Targets queries like "pdf automatisch umbenennen" and "auto rename pdf files". Budget: EUR 1.50/day, Maximize Clicks.

**Search - Google Drive** — Two ad groups targeting Google Drive file management queries: an intercept group (competing with Gemini, Zapier) and a direct rename group. Budget: EUR 4/day, Maximize Clicks.

**Search - Dropbox** — Dropbox integration campaigns: one group for automation queries, another for industry-specific queries (accounting firms, law firms, contractors). Budget: EUR 0.50/day, Target CPA bidding.

**Search - OneDrive + SharePoint** — Three ad groups: OneDrive file renaming, Power Automate intercept (positioning against Microsoft's complex workflow tool), and SharePoint naming conventions. Budget: EUR 3/day, Maximize Clicks.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Google Ads API credentials at `~/.ads/credentials.json` (run `ads auth google` to set up)

## Running commands

From this directory:

```bash
# Check what's live in the account
bun ../cli/index.ts status

# See if local files match platform state
bun ../cli/index.ts plan

# Validate campaign files for errors
bun ../cli/index.ts validate

# Detect drift (changes made in Google Ads UI)
bun ../cli/index.ts pull

# View operation history
bun ../cli/index.ts history
```

**Do NOT run `ads apply` unless you know what you're doing** — this is a real ad account with real budget. Every apply pushes changes to live campaigns.
