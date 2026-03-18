# @upspawn/ads — SDK Reference

Comprehensive reference for AI coding agents working with the `@upspawn/ads` SDK.
Everything you need to define, diff, and apply ad campaigns as TypeScript code.

---

## 1. Mental Model

`@upspawn/ads` is a Pulumi-style ads-as-code SDK. You define campaigns in TypeScript,
the engine diffs your code against live platform state, and applies the minimal set of
API mutations to converge them.

### The Pipeline

```
define → flatten → diff → apply
```

1. **Define** — Write campaign objects in `campaigns/**/*.ts` using builder helpers.
2. **Flatten** — The engine walks the campaign tree and produces a flat `Resource[]` array
   with slugified paths (e.g., `my-campaign/ad-group-1/kw:rename files:EXACT`).
3. **Diff** — Pure function: `diff(desired[], actual[], managedPaths, pathToPlatformId) → Changeset`.
   No side effects, no API calls.
4. **Apply** — The changeset is translated into platform-specific API mutations and executed
   in dependency order (creates parent-first, deletes child-first).

### Core Principles

- **Immutable builders.** Every `.group()`, `.adSet()`, `.sitelinks()` call returns a new
  builder instance. The original is unchanged. Chain freely.
- **Branded types.** `headlines()` validates each string is ≤30 chars at construction time
  and returns `Headline[]` (a branded string type). You cannot pass a raw `string` where
  a `Headline` is expected — the type system catches it.
- **Convention-based discovery.** The CLI scans `campaigns/**/*.ts`, dynamic-imports each file,
  and collects exports that have `provider` + `kind` fields.
- **Resource identity.** Every resource gets a stable slugified path. RSA ads use a content
  hash (sorted headlines + sorted descriptions + finalUrl) because they lack user-assigned names.
- **SQLite cache.** Maps resource paths to platform IDs so the engine knows which resources
  already exist. Located at `.ads-cache/state.db`.
- **EUR is the default currency.** All budget helpers default to EUR unless you pass `'USD'`.

---

## 2. Quick Start

```bash
# Install
bun add @upspawn/ads

# Scaffold project
bun ads init

# Authenticate with Google Ads
bun ads auth google

# Write your first campaign (see Section 4)
# Then preview and apply:
bun ads plan
bun ads apply
```

### Minimal Complete Example

```ts
// campaigns/search.ts
import {
  google, daily, targeting, geo, languages, negatives,
  exact, rsa, headlines, descriptions, url, link,
} from '@upspawn/ads'

export const campaign = google.search('My First Campaign', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US'), languages('en')),
  negatives: negatives('free', 'cheap'),
})
.group('core-keywords', {
  keywords: exact('rename files', 'batch rename'),
  ad: rsa(
    headlines('Rename Files Fast', 'AI File Renamer', 'Try Free Today'),
    descriptions('Rename thousands of files in seconds.', 'No credit card required.'),
    url('https://example.com'),
  ),
})
.sitelinks(
  link('Pricing', 'https://example.com/pricing'),
  link('Features', 'https://example.com/features'),
)
.callouts('Free Trial', 'No Credit Card', 'AI-Powered')
```

---

## 3. Configuration

### ads.config.ts

```ts
import { defineConfig } from '@upspawn/ads'

export default defineConfig({
  google: {
    customerId: 'YOUR_CUSTOMER_ID',    // your Google Ads customer ID
    managerId: 'YOUR_MANAGER_ID',     // optional MCC manager ID
    credentials: '~/.ads/credentials.json',
  },
  meta: {
    accountId: 'act_123456789',
    pageId: '987654321',
    pixelId: '111222333',
    currency: 'EUR',               // auto-detected if omitted
    dsa: {                          // EU Digital Services Act (required in EU)
      beneficiary: 'My Company GmbH',
      payor: 'My Company GmbH',
    },
  },
  cache: '.ads-cache/state.db',    // default location
  ai: {                            // optional AI config for generate/optimize
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250514',
  },
})
```

### defineConfig

```ts
function defineConfig(config: AdsConfig): AdsConfig
```

Identity function that provides TypeScript autocompletion. The `AdsConfig` type:

```ts
type AdsConfig = {
  readonly google?: { customerId: string; managerId?: string; credentials?: string }
  readonly meta?: {
    accountId: string; pageId: string; pixelId?: string;
    apiVersion?: string; currency?: string;
    dsa?: { beneficiary: string; payor: string }; credentials?: string
  }
  readonly cache?: string
  readonly ai?: AiConfig
}
```

### Credential Resolution Order

**Google:** explicit `GoogleConfig` in code → `~/.ads/credentials.json` → environment variables
(`GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`,
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_MANAGER_ID`).

**Meta:** `FB_ADS_ACCESS_TOKEN` environment variable (long-lived token from Meta Business Suite).

---

## 4. Google Campaigns

All Google campaign builders live on the `google` namespace. Import:

```ts
import { google } from '@upspawn/ads'
```

### 4.1 Search Campaigns

```ts
google.search(name: string, input: SearchCampaignInput): CampaignBuilder
```

The most common campaign type. Returns a `CampaignBuilder` with chainable methods.

#### SearchCampaignInput

```ts
type SearchCampaignInput = {
  readonly budget: Budget | SharedBudgetConfig  // plain budget or shared budget reference
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly startDate?: string          // 'YYYY-MM-DD'
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly customParameters?: Record<string, string>
  readonly networkSettings?: NetworkSettings
}
```

#### NetworkSettings

```ts
type NetworkSettings = {
  readonly searchNetwork: boolean    // Google Search
  readonly searchPartners: boolean   // Search partner sites
  readonly displayNetwork: boolean   // Display Network opt-in
}
```

#### All 9 Bidding Strategies

```ts
type BiddingStrategy =
  | { type: 'maximize-conversions' }
  | { type: 'maximize-clicks'; maxCpc?: number }
  | { type: 'manual-cpc'; enhancedCpc?: boolean }
  | { type: 'manual-cpm' }
  | { type: 'target-cpa'; targetCpa: number }
  | { type: 'target-cpm' }
  | { type: 'target-roas'; targetRoas: number }          // raw double, NOT micros
  | { type: 'target-impression-share'; location: 'anywhere' | 'top' | 'absolute-top'; targetPercent: number; maxCpc?: number }
  | { type: 'maximize-conversion-value'; targetRoas?: number }
```

String shorthands are accepted for all strategies that have no required fields:

```ts
type BiddingInput =
  | 'maximize-conversions' | 'maximize-clicks' | 'manual-cpc'
  | 'manual-cpm' | 'target-cpm' | 'target-roas'
  | 'target-impression-share' | 'maximize-conversion-value'
  | BiddingStrategy
```

When using the string shorthand, `'target-roas'` defaults to `targetRoas: 1.0` and
`'target-impression-share'` defaults to `location: 'anywhere', targetPercent: 50`.

#### Complete Search Campaign Example

```ts
import {
  google, daily, targeting, geo, languages, weekdays, hours, device, presence,
  negatives, exact, phrase, broad, rsa, headlines, descriptions, url,
  link, callouts, snippet, call, price, promotion, image,
} from '@upspawn/ads'

export const search = google.search('Search - Renamed.to', {
  budget: daily(25),
  bidding: { type: 'maximize-conversions' },
  targeting: targeting(
    geo('US', 'DE', 'CA'),
    languages('en', 'de'),
    weekdays(),
    hours(8, 22),
    device('mobile', -0.3),
    presence('presence'),
  ),
  negatives: negatives('free', 'open source', 'crack', 'download'),
  networkSettings: {
    searchNetwork: true,
    searchPartners: false,
    displayNetwork: false,
  },
})
// Ad group: exact match keywords
.group('exact-match', {
  keywords: exact('rename files', 'batch rename', 'file renamer'),
  ad: rsa(
    headlines(
      'Rename Files Fast',
      'AI File Renamer',
      'Batch Rename Tool',
      'Try Free Today',
    ),
    descriptions(
      'Rename thousands of files in seconds with AI-powered rules.',
      'Try free. No credit card required. Works on any OS.',
    ),
    url('https://renamed.to', { source: 'google', medium: 'cpc', campaign: 'search-exact' }),
    { path1: 'rename', path2: 'files' },
  ),
})
// Ad group: phrase match
.group('phrase-match', {
  keywords: phrase('file renaming tool', 'rename pdf files'),
  ad: rsa(
    headlines('File Renaming Tool', 'Rename PDFs Instantly', 'AI-Powered Renaming'),
    descriptions(
      'The smartest way to organize your files. AI rules, bulk operations.',
      'Supports PDF, images, videos, and more. Start free.',
    ),
    url('https://renamed.to'),
  ),
})
// Multiple ads per ad group
.group('broad-match', {
  keywords: broad('file organization', 'document management'),
  ad: [
    rsa(
      headlines('Organize Your Files', 'Smart File Manager', 'AI Organization'),
      descriptions('Let AI organize your files automatically.', 'Free trial available.'),
      url('https://renamed.to'),
    ),
    rsa(
      headlines('Document Management', 'File Automation Tool', 'Rename & Organize'),
      descriptions('Automate file renaming and organization.', 'Works with any file type.'),
      url('https://renamed.to/organize'),
    ),
  ],
})
// Multi-locale with .locale()
.locale('de', targeting(geo('DE', 'AT', 'CH'), languages('de')), {
  keywords: exact('dateien umbenennen', 'stapelumbenennung'),
  ad: rsa(
    headlines('Dateien Umbenennen', 'KI-Dateiumbenner', 'Jetzt Testen'),
    descriptions('Tausende Dateien in Sekunden umbenennen.', 'Kostenlos testen.'),
    url('https://renamed.to/de'),
  ),
})
// Extensions
.sitelinks(
  link('Pricing', 'https://renamed.to/pricing', {
    description1: 'Plans from $9/mo',
    description2: 'Free tier available',
  }),
  link('Features', 'https://renamed.to/features'),
  link('Blog', 'https://renamed.to/blog'),
  link('Support', 'https://renamed.to/support'),
)
.callouts('Free Trial', 'No Credit Card', 'AI-Powered', '24/7 Support')
.snippets(
  snippet('Types', 'Files', 'Folders', 'Documents', 'Images', 'Videos'),
)
.calls(
  call('+1-800-555-0123', 'US'),
)
.prices(
  price([
    { header: 'Starter', description: 'For individuals', price: '$9/mo', url: 'https://renamed.to/pricing' },
    { header: 'Pro', description: 'For teams', price: '$29/mo', url: 'https://renamed.to/pricing' },
    { header: 'Enterprise', description: 'Custom pricing', price: 'Contact us', url: 'https://renamed.to/pricing' },
  ], 'from'),
)
.promotions(
  promotion({
    discountType: 'percent',
    discountPercent: 20,
    occasion: 'BLACK_FRIDAY',
    url: 'https://renamed.to/pricing',
  }),
)
.images(
  image('https://renamed.to/assets/ad-image.png', 'Product screenshot'),
)
```

### 4.2 Display Campaigns

```ts
google.display(name: string, input: DisplayCampaignInput): DisplayCampaignBuilder
```

Returns a `DisplayCampaignBuilder` with a `.group()` method. Display ad groups contain
responsive display ads instead of RSAs and keywords.

```ts
import {
  google, daily, targeting, geo, languages,
  responsiveDisplay, landscape, square, logo,
  placements, topics, contentKeywords, audiences, remarketing,
} from '@upspawn/ads'

export const display = google.display('Display - Remarketing', {
  budget: daily(10),
  bidding: 'maximize-conversions',
  targeting: targeting(
    geo('US', 'DE'),
    languages('en', 'de'),
    audiences(remarketing('123456', { name: 'All Visitors', bidAdjustment: 0.5 })),
  ),
})
.group('remarketing', {
  ad: responsiveDisplay({
    headlines: ['Rename Files Fast', 'AI Powered', 'Try Free'],
    longHeadline: 'Rename All Your Files in Seconds with AI',
    descriptions: ['Try renamed.to free — no credit card required.'],
    businessName: 'renamed.to',
    finalUrl: 'https://renamed.to',
    marketingImages: [landscape('./assets/hero.png')],
    squareMarketingImages: [square('./assets/hero-square.png')],
    logoImages: [logo('./assets/logo.png')],
    mainColor: '#4A90D9',
    accentColor: '#FF6B35',
  }),
  targeting: targeting(
    placements('youtube.com', 'news.google.com'),
    topics('Computers & Electronics'),
    contentKeywords('file management', 'pdf tools'),
  ),
})
```

#### DisplayAdGroupInput

```ts
type DisplayAdGroupInput = {
  readonly ad: GoogleDisplayAd | GoogleDisplayAd[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
}
```

### 4.3 Performance Max Campaigns

```ts
google.performanceMax(name: string, input: PMaxCampaignInput): PMaxCampaignBuilder
```

PMax campaigns use **asset groups** instead of ad groups. Google's AI assembles assets
into ads across Search, Display, YouTube, Gmail, Discover, and Maps.

```ts
import {
  google, daily, targeting, geo, languages,
  landscape, square, portrait, logo, logoLandscape,
  audiences, remarketing, inMarket,
} from '@upspawn/ads'

export const pmax = google.performanceMax('PMax - Renamed.to', {
  budget: daily(30),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
  urlExpansion: false,
})
.assetGroup('main', {
  finalUrls: ['https://renamed.to'],
  headlines: ['Rename Files Fast', 'AI File Renaming', 'Batch Rename Tool'],
  longHeadlines: ['Rename All Your Files in Seconds with AI-Powered Rules'],
  descriptions: ['Try renamed.to free — no credit card.', 'Works on any OS.'],
  businessName: 'renamed.to',
  images: {
    landscape: [landscape('./assets/hero.png')],
    square: [square('./assets/hero-square.png')],
    portrait: [portrait('./assets/hero-portrait.png')],
  },
  logos: [logo('./assets/logo.png')],
  landscapeLogos: [logoLandscape('./assets/logo-wide.png')],
  videos: ['https://youtube.com/watch?v=abc123'],
  callToAction: 'Sign Up',
  audienceSignal: targeting(
    audiences(
      remarketing('123456'),
      inMarket('80432', { name: 'Business Software' }),
    ),
  ),
})
```

#### AssetGroupInput

```ts
type AssetGroupInput = {
  readonly finalUrls: string[]
  readonly finalMobileUrls?: string[]
  readonly headlines: string[]        // 3-15, each max 30 chars
  readonly longHeadlines: string[]    // 1-5, each max 90 chars
  readonly descriptions: string[]     // 2-5, each max 90 chars
  readonly businessName: string       // max 25 chars
  readonly images?: {
    readonly landscape?: ImageRef[]   // 1.91:1
    readonly square?: ImageRef[]      // 1:1
    readonly portrait?: ImageRef[]    // 4:5
  }
  readonly logos?: ImageRef[]         // 1:1
  readonly landscapeLogos?: ImageRef[] // 4:1
  readonly videos?: string[]          // YouTube URLs
  readonly callToAction?: string
  readonly status?: 'enabled' | 'paused'
  readonly path1?: string
  readonly path2?: string
  readonly audienceSignal?: Targeting  // hints for Google AI
}
```

### 4.4 Shopping Campaigns

```ts
google.shopping(name: string, input: ShoppingCampaignInput): ShoppingCampaignBuilder
```

Shopping campaigns display product ads from a Merchant Center feed. Ad groups are simple --
no keywords or ads, just optional bids.

```ts
import { google, daily, targeting, geo, languages } from '@upspawn/ads'

export const shopping = google.shopping('Shopping - Products', {
  budget: daily(15),
  bidding: 'maximize-clicks',
  targeting: targeting(geo('US'), languages('en')),
  merchantId: 123456789,
  campaignPriority: 1,
  enableLocal: true,
  feedLabel: 'online',
})
.group('all-products', {})
.group('electronics', { bid: 0.75 })
.group('premium', { bid: 1.50, status: 'enabled' })
```

#### ShoppingCampaignInput

```ts
type ShoppingCampaignInput = {
  readonly budget: Budget
  readonly bidding: BiddingInput
  readonly targeting?: Targeting
  readonly negatives?: Keyword[]
  readonly status?: 'enabled' | 'paused'
  readonly merchantId: number          // required
  readonly campaignPriority?: number   // 0-2, default 0
  readonly enableLocal?: boolean
  readonly feedLabel?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly trackingTemplate?: string
  readonly finalUrlSuffix?: string
  readonly networkSettings?: NetworkSettings
}
```

### 4.5 Demand Gen Campaigns

```ts
google.demandGen(name: string, input: DemandGenCampaignInput): DemandGenCampaignBuilder
```

Demand Gen campaigns serve across YouTube, Discover, Gmail, and Display with
multi-asset and carousel ad formats.

```ts
import {
  google, daily, targeting, geo, languages,
  demandGenMultiAsset, demandGenCarousel, carouselCard,
  landscape, square,
} from '@upspawn/ads'

export const demandGen = google.demandGen('Demand Gen - Launch', {
  budget: daily(20),
  bidding: 'maximize-clicks',
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
})
.group('multi-asset', {
  ad: demandGenMultiAsset({
    headlines: ['Rename Files Fast', 'AI-Powered Renaming'],
    descriptions: ['Try renamed.to free', 'Batch rename in seconds'],
    businessName: 'renamed.to',
    finalUrl: 'https://renamed.to',
    marketingImages: [landscape('./assets/hero.png')],
    squareMarketingImages: [square('./assets/hero-square.png')],
  }),
  channels: {
    youtube: true,
    discover: true,
    gmail: true,
    display: false,
    youtubeShorts: true,
  },
})
.group('carousel', {
  ad: demandGenCarousel({
    headline: 'See How It Works',
    description: 'Swipe to explore features',
    businessName: 'renamed.to',
    finalUrl: 'https://renamed.to',
    logoImage: logo('./assets/logo.png'),
    cards: [
      carouselCard({ headline: 'Upload', finalUrl: 'https://renamed.to/upload', marketingImage: landscape('./assets/step1.png') }),
      carouselCard({ headline: 'Set Rules', finalUrl: 'https://renamed.to/rules', marketingImage: landscape('./assets/step2.png') }),
      carouselCard({ headline: 'Rename', finalUrl: 'https://renamed.to/rename', marketingImage: landscape('./assets/step3.png') }),
    ],
  }),
})
```

#### DemandGenChannelControls

```ts
type DemandGenChannelControls = {
  readonly youtube?: boolean      // default true
  readonly discover?: boolean     // default true
  readonly gmail?: boolean        // default true
  readonly display?: boolean      // default true
  readonly youtubeShorts?: boolean // default true
}
```

### 4.6 Smart Campaigns

```ts
google.smart(name: string, input: SmartCampaignInput): GoogleSmartCampaign
```

Smart campaigns are flat -- no `.group()` chaining. Returns a plain campaign object (not a builder).

```ts
import { google, daily, smartAd } from '@upspawn/ads'

export const smart = google.smart('Smart - Local Business', {
  budget: daily(10),
  businessName: 'renamed.to',
  finalUrl: 'https://renamed.to',
  language: 'en',
  keywordThemes: ['file renaming', 'batch rename', 'document management'],
  ad: smartAd({
    headlines: ['Rename Files Fast', 'AI File Renamer', 'Try Free Today'],
    descriptions: ['AI-powered file renaming.', 'No credit card required.'],
  }),
})
```

### 4.7 App Campaigns

```ts
google.app(name: string, input: AppCampaignInput): GoogleAppCampaign
```

App campaigns are flat -- no `.group()` chaining. Returns a plain campaign object.

```ts
import { google, daily, targeting, geo, languages, appAd, landscape } from '@upspawn/ads'

export const app = google.app('App - Installs', {
  budget: daily(20),
  bidding: { type: 'target-cpa', targetCpa: 5.00 },
  targeting: targeting(geo('US'), languages('en')),
  appId: 'com.example.renamed',
  appStore: 'google',
  goal: 'installs',
  ad: appAd({
    headlines: ['Rename Files on the Go', 'Mobile File Manager'],
    descriptions: ['Batch rename from your phone.', 'AI-powered organization.'],
    images: [landscape('./assets/app-screenshot.png')],
    videos: ['https://youtube.com/watch?v=demo123'],
  }),
})
```

---

## 5. Meta Campaigns

Meta campaigns use a class-based builder. Import:

```ts
import { meta } from '@upspawn/ads'
```

### Builder Pattern

```ts
meta.<objective>(name, config?)     // → MetaCampaignBuilder<T>
  .adSet(name, config, content)     // → MetaCampaignBuilder<T>  (immutable — returns new builder)
  .adSet(...)                       // chain more ad sets
  .build()                          // → MetaCampaign<T>  (optional — auto-detected by flatten)
```

### Objectives and Valid Optimization Goals

| Factory Method | Objective | Valid Optimization Goals |
|---|---|---|
| `meta.traffic()` | traffic | `LINK_CLICKS`, `LANDING_PAGE_VIEWS`, `REACH`, `IMPRESSIONS` |
| `meta.awareness()` | awareness | `REACH`, `AD_RECALL_LIFT`, `IMPRESSIONS`, `THRUPLAY` |
| `meta.engagement()` | engagement | `POST_ENGAGEMENT`, `PAGE_LIKES`, `EVENT_RESPONSES`, `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` |
| `meta.leads()` | leads | `LEAD_GENERATION`, `OFFSITE_CONVERSIONS`, `QUALITY_LEAD` |
| `meta.sales()` | sales | `OFFSITE_CONVERSIONS`, `VALUE`, `CONVERSATIONS` |
| `meta.conversions()` | conversions | `OFFSITE_CONVERSIONS`, `VALUE`, `CONVERSATIONS` |
| `meta.appPromotion()` | app-promotion | `APP_INSTALLS`, `APP_EVENTS`, `VALUE` |

`meta.conversions()` is an alias for `meta.sales()`.

### MetaCampaignConfig

```ts
type MetaCampaignConfig = {
  readonly budget?: Budget
  readonly spendCap?: number
  readonly specialAdCategories?: readonly SpecialAdCategory[]  // 'CREDIT' | 'EMPLOYMENT' | 'HOUSING' | 'ISSUES_ELECTIONS_POLITICS'
  readonly buyingType?: 'AUCTION' | 'RESERVED'
  readonly status?: 'ACTIVE' | 'PAUSED'
}
```

### AdSetConfig<T>

```ts
type AdSetConfig<T extends Objective> = {
  readonly targeting: MetaTargeting
  readonly optimization?: OptimizationGoalMap[T]  // type-safe per objective
  readonly bidding?: BidStrategy
  readonly budget?: Budget
  readonly placements?: MetaPlacements
  readonly schedule?: AdSetSchedule
  readonly conversion?: ConversionConfig
  readonly dsa?: DSAConfig
  readonly promotedObject?: PromotedObject
  readonly status?: 'ACTIVE' | 'PAUSED'
}
```

### AdSetContent

```ts
type AdSetContent = {
  readonly ads: readonly MetaCreative[]
  readonly url?: string | UrlResult
  readonly cta?: MetaCTA
}
```

### Complete Traffic Campaign (Image Ad)

```ts
import {
  meta, daily, metaImage, metaTargeting, geo, age,
  audience, excludeAudience, interests, manual, costCap,
} from '@upspawn/ads'

export const traffic = meta.traffic('Retargeting - US', {
  budget: daily(15),
  status: 'ACTIVE',
})
.adSet('Website Visitors', {
  targeting: metaTargeting(
    geo('US'),
    age(25, 55),
    audience('Website Visitors 30d'),
    excludeAudience('Existing Customers'),
    ...interests('Construction', 'BIM', 'Architecture'),
  ),
  optimization: 'LINK_CLICKS',
  bidding: costCap(2.50),
  placements: manual(['facebook', 'instagram'], ['feed', 'story', 'reels']),
}, {
  url: 'https://renamed.to',
  cta: 'SIGN_UP',
  ads: [
    metaImage('./assets/hero.png', {
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually. AI-powered renaming in seconds.',
      description: 'Try free — no credit card required',
    }),
    metaImage('./assets/comparison.png', {
      headline: 'Before & After',
      primaryText: 'See how renamed.to transforms messy file names into clean, organized ones.',
    }),
  ],
})
```

### Complete Conversions Campaign (Carousel)

```ts
import {
  meta, daily, carousel, metaTargeting, geo, age, interests,
  lookalike, automatic, minRoas,
} from '@upspawn/ads'

export const conversions = meta.conversions('Conversions - Lookalike', {
  budget: daily(25),
})
.adSet('Lookalike 1%', {
  targeting: metaTargeting(
    geo('US'),
    age(25, 65),
    lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 }),
  ),
  optimization: 'OFFSITE_CONVERSIONS',
  bidding: minRoas(2.5),
  placements: automatic(),
  conversion: {
    pixelId: '111222333',
    customEventType: 'Purchase',
    conversionWindow: '7d_click_1d_view',
  },
}, {
  url: 'https://renamed.to/pricing',
  cta: 'SHOP_NOW',
  ads: [
    carousel(
      [
        { image: './assets/step1.png', headline: 'Upload Files', url: 'https://renamed.to/upload' },
        { image: './assets/step2.png', headline: 'Set AI Rules', url: 'https://renamed.to/rules' },
        { image: './assets/step3.png', headline: 'Rename All', url: 'https://renamed.to/rename' },
      ],
      { primaryText: 'See how renamed.to works in 3 simple steps', cta: 'LEARN_MORE' },
    ),
  ],
})
```

### Creative Types

| Type | Helper | Key Fields |
|---|---|---|
| Image | `metaImage(filePath, config?)` | `headline`, `primaryText`, `description?`, `cta?`, `url?` |
| Video | `metaVideo(filePath, config?)` | `headline`, `primaryText`, `description?`, `cta?`, `thumbnail?` |
| Carousel | `carousel(cards, config)` | `cards[]` (2-10), `primaryText` |
| Boosted Post | `boostedPost(name?)` | — (promotes existing page post) |

### MetaCTA Values

```ts
type MetaCTA =
  | 'LEARN_MORE' | 'SIGN_UP' | 'SHOP_NOW' | 'DOWNLOAD'
  | 'GET_OFFER' | 'BOOK_TRAVEL' | 'CONTACT_US' | 'SUBSCRIBE'
  | 'GET_QUOTE' | 'APPLY_NOW' | 'BUY_NOW' | 'ORDER_NOW'
  | 'WATCH_MORE' | 'SEND_MESSAGE' | 'WHATSAPP_MESSAGE'
  | 'CALL_NOW' | 'GET_DIRECTIONS' | 'REQUEST_TIME'
  | 'SEE_MENU' | 'PLAY_GAME' | 'INSTALL_APP'
  | 'USE_APP' | 'LISTEN_NOW' | 'NO_BUTTON'
```

---

## 6. Helpers Reference

All helpers are imported from `'@upspawn/ads'`.

### Keywords

```ts
exact(...args: KeywordInput[]): ExactKeyword[]
```
Create exact-match keywords. Each arg is a string or `{ text, bid?, finalUrl?, status? }`.
```ts
exact('rename files', 'batch rename')
exact({ text: 'rename files', bid: 1.50, finalUrl: 'https://...' })
```

```ts
phrase(...args: KeywordInput[]): PhraseKeyword[]
```
Create phrase-match keywords.
```ts
phrase('file renaming tool', 'rename pdf')
```

```ts
broad(...args: KeywordInput[]): BroadKeyword[]
```
Create broad-match keywords.
```ts
broad('file organization', 'document management')
```

```ts
keywords(...texts: string[]): Keyword[]
```
Parse bracket notation: `[text]` = exact, `"text"` = phrase, bare = broad. Supports template literals.
```ts
keywords('[rename files]', '"file renaming tool"', 'document management')
keywords(`
  [rename files]
  "file renaming tool"
  document management
`)
```

### Budget

```ts
daily(amount: number, currency?: 'EUR' | 'USD'): DailyBudget
```
Daily budget. **Defaults to EUR.** Throws if amount is zero or negative.
```ts
daily(20)          // EUR
daily(15, 'USD')   // USD
```

```ts
monthly(amount: number, currency?: 'EUR' | 'USD'): MonthlyBudget
```
Monthly budget. Engine divides into daily amount.
```ts
monthly(600)
```

```ts
lifetime(amount: number, endTime: string, currency?: 'EUR' | 'USD'): LifetimeBudget
```
Lifetime budget for Meta campaigns. Requires end date.
```ts
lifetime(500, '2026-04-01')
```

```ts
eur(amount: number): number & { __currency: 'EUR' }
usd(amount: number): number & { __currency: 'USD' }
```
Branded currency wrappers for compile-time currency safety.
```ts
eur(20)
usd(15)
```

### Ads

```ts
headlines(...texts: string[]): Headline[]
```
Validates each headline ≤30 chars. Returns branded `Headline[]`.
```ts
headlines('Rename Files Fast', 'AI File Renamer', 'Try Free Today')
```

```ts
descriptions(...texts: string[]): Description[]
```
Validates each description ≤90 chars. Returns branded `Description[]`.
```ts
descriptions('Rename thousands of files in seconds.', 'Try free today.')
```

```ts
rsa(
  headlineList: Headline[],
  descriptionList: Description[],
  urlResult: { finalUrl: string; utm?: UTMParams },
  options?: RSAOptions,
): RSAd
```
Build a Responsive Search Ad. **Positional arguments, not an object.** Requires 3-15 headlines, 2-4 descriptions.
```ts
rsa(
  headlines('Rename Files Fast', 'AI Renamer', 'Try Free'),
  descriptions('Rename files in seconds.', 'No credit card.'),
  url('https://renamed.to'),
  { path1: 'rename', path2: 'files', pinnedHeadlines: [{ text: 'Rename Files Fast', position: 1 }] },
)
```

`RSAOptions`:
```ts
type RSAOptions = {
  readonly pinnedHeadlines?: PinnedHeadline[]      // { text: string; position: 1 | 2 | 3 }
  readonly pinnedDescriptions?: PinnedDescription[] // { text: string; position: 1 | 2 }
  readonly path1?: string                           // max 15 chars
  readonly path2?: string                           // max 15 chars
  readonly mobileUrl?: string
  readonly trackingTemplate?: string
}
```

```ts
responsiveDisplay(config: { ... }): ResponsiveDisplayAd
```
Build a Responsive Display Ad.
```ts
responsiveDisplay({
  headlines: ['Rename Files Fast'],
  longHeadline: 'AI-Powered File Renaming in Seconds',
  descriptions: ['Try renamed.to free'],
  businessName: 'renamed.to',
  finalUrl: 'https://renamed.to',
  marketingImages: [landscape('./hero.png')],
  squareMarketingImages: [square('./hero-square.png')],
  logoImages: [logo('./logo.png')],
  mainColor: '#4A90D9',
  accentColor: '#FF6B35',
})
```

```ts
demandGenMultiAsset(config: Omit<DemandGenMultiAssetAd, 'type'>): DemandGenMultiAssetAd
```
Multi-asset ad for Demand Gen campaigns.
```ts
demandGenMultiAsset({
  headlines: ['Rename Files Fast'],
  descriptions: ['Try renamed.to free'],
  businessName: 'renamed.to',
  finalUrl: 'https://renamed.to',
})
```

```ts
demandGenCarousel(config: Omit<DemandGenCarouselAd, 'type'>): DemandGenCarouselAd
```
Carousel ad for Demand Gen campaigns. Requires 2-10 cards.
```ts
demandGenCarousel({
  headline: 'See How It Works',
  description: 'Swipe to explore',
  businessName: 'renamed.to',
  finalUrl: 'https://renamed.to',
  cards: [
    carouselCard({ headline: 'Upload', finalUrl: 'https://renamed.to/upload' }),
    carouselCard({ headline: 'Rename', finalUrl: 'https://renamed.to/rename' }),
  ],
})
```

```ts
carouselCard(config: DemandGenCarouselCard): DemandGenCarouselCard
```
A card for a Demand Gen carousel. Fields: `headline`, `finalUrl`, `marketingImage?`, `squareMarketingImage?`, `callToAction?`.

```ts
smartAd(config: { headlines: [string, string, string]; descriptions: [string, string] }): SmartCampaignAd
```
Exactly 3 headlines (max 30 chars) and 2 descriptions (max 90 chars).
```ts
smartAd({
  headlines: ['Rename Files Fast', 'AI Renamer', 'Try Free'],
  descriptions: ['AI-powered file renaming.', 'No credit card.'],
})
```

```ts
appAd(config: Omit<AppAdInfo, 'type'>): AppAdInfo
```
Up to 5 headlines, 5 descriptions, optional images and YouTube video URLs.
```ts
appAd({
  headlines: ['Mobile File Manager'],
  descriptions: ['Rename on the go.'],
  images: [landscape('./screenshot.png')],
})
```

### Targeting (Google)

```ts
targeting(...rules: TargetingRule[]): Targeting
```
Compose multiple rules into a `Targeting` object.
```ts
targeting(geo('US'), languages('en'), weekdays(), hours(9, 17))
```

```ts
geo(...countries: CountryCode[]): GeoTarget
geo(...countries: CountryCode[], { bidAdjustments: Record<string, number> }): GeoTarget
```
Target countries. Optionally pass bid adjustments as the last argument.
```ts
geo('US', 'DE')
geo('US', 'DE', { bidAdjustments: { US: 0.2, DE: -0.1 } })
```

```ts
languages(...langs: LanguageCode[]): LanguageTarget
```
```ts
languages('en', 'de')
```

```ts
weekdays(): ScheduleTarget
```
Monday through Friday, all hours.

```ts
hours(startHour: number, endHour: number): ScheduleTarget
```
`startHour` 0-23, `endHour` 1-24. Must be startHour < endHour.
```ts
hours(9, 17) // 9am-5pm
```

```ts
device(deviceType: 'mobile' | 'desktop' | 'tablet', bidAdjustment: number): DeviceTarget
```
Bid adjustment: `-1.0` = exclude, `0.0` = no change, `0.5` = +50%.
```ts
device('mobile', -1.0)   // exclude mobile
device('desktop', 0.2)   // +20% desktop
```

```ts
regions(...regionIds: string[]): RegionTarget
```
```ts
regions('California', 'New York')
```

```ts
cities(...cityNames: string[]): CityTarget
```
```ts
cities('Berlin', 'Munich')
```

```ts
radius(lat: number, lng: number, radiusKm: number): RadiusTarget
```
```ts
radius(52.52, 13.405, 50)  // 50km around Berlin
```

```ts
presence(mode: 'presence' | 'presence-or-interest'): PresenceTarget
```
```ts
presence('presence')  // only people physically in the location
```

```ts
demographics(opts: {
  ageRanges?: AgeRange[];
  genders?: Gender[];
  incomes?: IncomeRange[];
  parentalStatuses?: ParentalStatus[];
}): DemographicTarget
```
```ts
demographics({ ageRanges: ['25-34', '35-44'], genders: ['male'] })
```

`AgeRange`: `'18-24'` | `'25-34'` | `'35-44'` | `'45-54'` | `'55-64'` | `'65+'` | `'undetermined'`
`Gender`: `'male'` | `'female'` | `'undetermined'`
`IncomeRange`: `'top-10%'` | `'11-20%'` | `'21-30%'` | `'31-40%'` | `'41-50%'` | `'lower-50%'` | `'undetermined'`
`ParentalStatus`: `'parent'` | `'not-parent'` | `'undetermined'`

```ts
scheduleBid(day: Day, startHour: number, endHour: number, bidAdjustment: number): ScheduleBidTarget
```
```ts
scheduleBid('mon', 9, 17, 0.2)  // +20% Monday 9am-5pm
```

```ts
placements(...urls: string[]): PlacementTarget
```
Website/channel placements for Display.
```ts
placements('youtube.com', 'news.google.com')
```

```ts
topics(...topicNames: string[]): TopicTarget
```
```ts
topics('Computers & Electronics', 'Business')
```

```ts
contentKeywords(...kws: string[]): ContentKeywordTarget
```
```ts
contentKeywords('file management', 'pdf tools')
```

### Audience Helpers (Google)

```ts
audiences(...refs: AudienceRef[]): AudienceTarget
```
Observation mode (bid-only, no delivery restriction).
```ts
audiences(remarketing('123', { bidAdjustment: 0.5 }), inMarket('80432'))
```

```ts
audienceTargeting(...refs: AudienceRef[]): AudienceTarget
```
Targeting mode (restricts delivery to these audiences).

```ts
remarketing(listId: string, options?: { name?: string; bidAdjustment?: number }): AudienceRef
customAudience(audienceId: string, options?): AudienceRef
inMarket(categoryId: string, options?): AudienceRef
affinity(categoryId: string, options?): AudienceRef
customerMatch(listId: string, options?): AudienceRef
```

### Extensions (Google)

```ts
link(text: string, url: string, options?: { description1?: string; description2?: string }): Sitelink
```
Text max 25 chars, descriptions max 35 chars each.
```ts
link('Pricing', 'https://renamed.to/pricing', {
  description1: 'Plans from $9/mo',
  description2: 'Free tier available',
})
```

```ts
sitelinks(...links: Sitelink[]): Sitelink[]
```
Pass-through array helper for readability.

```ts
callouts(...texts: string[]): CalloutText[]
```
Each max 25 chars. Returns branded `CalloutText[]`.
```ts
callouts('Free Trial', 'No Credit Card', 'AI-Powered')
```

```ts
snippet(header: string, ...values: string[]): StructuredSnippet
```
3-10 values, each max 25 chars.
```ts
snippet('Types', 'Files', 'Folders', 'Documents')
```

```ts
call(phoneNumber: string, countryCode: string, callOnly?: boolean): CallExtension
```
```ts
call('+1-800-555-0123', 'US')
```

```ts
price(items: PriceItem[], qualifier?: 'from' | 'up-to' | 'average'): PriceExtension
```
3-8 items, header max 25 chars.
```ts
price([
  { header: 'Starter', description: 'For individuals', price: '$9/mo', url: '/pricing' },
  { header: 'Pro', description: 'For teams', price: '$29/mo', url: '/pricing' },
  { header: 'Enterprise', description: 'Custom', price: '$99/mo', url: '/pricing' },
], 'from')
```

```ts
promotion(config: PromotionExtension): PromotionExtension
```
```ts
promotion({
  discountType: 'percent',
  discountPercent: 20,
  occasion: 'BLACK_FRIDAY',
  url: 'https://renamed.to/pricing',
})
```

```ts
image(imageUrl: string, altText?: string): ImageExtension
```
```ts
image('https://example.com/ad-image.png', 'Product screenshot')
```

### Image Assets (Google Display / PMax / Demand Gen)

```ts
landscape(path: string): ImageRef    // 1.91:1 aspect ratio
square(path: string): ImageRef       // 1:1
portrait(path: string): ImageRef     // 4:5
logo(path: string): ImageRef         // 1:1 (logo)
logoLandscape(path: string): ImageRef // 4:1
```

Paths are relative to the campaign file. Images are uploaded during apply.

### URL

```ts
url(finalUrl: string, utm?: UTMParams): UrlResult
```
URL must start with `http://` or `https://`. Optional UTM tracking.
```ts
url('https://renamed.to')
url('https://renamed.to', { source: 'google', medium: 'cpc', campaign: 'search' })
```

`UTMParams`: `{ source?, medium?, campaign?, content?, term? }` (all optional strings).

### Negatives

```ts
negatives(...texts: string[]): Keyword[]
```
Creates BROAD match negative keywords. Deduplicates by lowercased text.
```ts
negatives('free', 'open source', 'download')
```

### Meta Creative Helpers

```ts
metaImage(filePath: string | AssetMarker, config?: Partial<ImageAdConfig>): ImageAd
```
Name auto-derived from filename if omitted.
```ts
metaImage('./hero.png', {
  headline: 'Rename Files Instantly',
  primaryText: 'AI-powered renaming in seconds.',
})
```

```ts
metaVideo(filePath: string | AssetMarker, config?: Partial<VideoAdConfig>): VideoAd
```
```ts
metaVideo('./demo.mp4', {
  headline: 'See It In Action',
  primaryText: 'Watch how teams save 2 hours per week.',
  thumbnail: './thumb.png',
})
```

```ts
carousel(cards: readonly CarouselCard[], config: CarouselAdConfig): CarouselAd
```
2-10 cards. Each card: `{ image, headline, url, description?, cta? }`.
```ts
carousel(
  [
    { image: './a.png', headline: 'Step 1', url: 'https://example.com/1' },
    { image: './b.png', headline: 'Step 2', url: 'https://example.com/2' },
  ],
  { primaryText: 'See how it works' },
)
```

```ts
boostedPost(name?: string): BoostedPostAd
```
Promotes an existing page post as an ad.

### Meta Targeting Helpers

```ts
metaTargeting(...rules: MetaTargetingRule[]): MetaTargeting
```
Compose Meta-specific targeting. Requires at least one `geo()` rule.
```ts
metaTargeting(geo('US'), age(25, 55), ...interests('Construction'))
```

```ts
age(min: number, max: number): AgeMarker
```
Range 13-65.
```ts
age(25, 55)
```

```ts
audience(nameOrId: string | { id: string }): AudienceMarker
```
Reference a custom audience. String names are looked up at validate time.
```ts
audience('Website Visitors 30d')
audience({ id: '23856789012345' })
```

```ts
excludeAudience(nameOrId: string | { id: string }): ExcludedAudienceMarker
```
```ts
excludeAudience('Existing Customers')
```

```ts
interests(...args: (string | { id: string; name: string })[]): InterestMarker[]
```
Returns an **array** -- spread it into `metaTargeting()`.
```ts
metaTargeting(geo('US'), ...interests('Construction', 'BIM'))
```

```ts
lookalike(
  source: string | { id: string },
  config: { geo: GeoTarget; percent: number },  // percent: 1-10
): LookalikeMarker
```
```ts
lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 })
```

### Meta Bidding Helpers

```ts
lowestCost(): BidStrategy
```
Meta default. No cap.

```ts
costCap(amount: number): BidStrategy
```
Average cost per result capped at this amount.

```ts
bidCap(amount: number): BidStrategy
```
Maximum bid per auction.

```ts
minRoas(floor: number): BidStrategy
```
Minimum return on ad spend multiplier (e.g., `2.5` = 2.5x).

### Meta Placement Helpers

```ts
automatic(): MetaPlacements
```
Advantage+ automatic placements (recommended).

```ts
manual(
  platforms: readonly MetaPlatform[],
  positionsOrOptions?: readonly PlacementPosition[] | PlatformPositionOptions,
): MetaPlacements
```
Manual placement selection.
```ts
manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])
manual(['facebook', 'instagram'], {
  facebookPositions: ['feed', 'story'],
  instagramPositions: ['stream', 'story', 'reels'],
})
manual(['facebook'])  // all positions
```

`MetaPlatform`: `'facebook'` | `'instagram'` | `'audience_network'` | `'messenger'`

### Account-Level Helpers

```ts
sharedNegatives(name: string, keywords: Keyword[]): SharedNegativeList
```
Shared negative keyword list. Max 20 per account, 5,000 keywords each.
```ts
export default sharedNegatives('Brand Exclusions', [
  ...broad('free', 'cheap', 'open source'),
  ...exact('competitor name'),
])
```

```ts
conversionAction(
  name: string,
  config: { type, category, counting, value?, attribution?, lookbackDays?, primary? },
): ConversionActionConfig
```
```ts
export default conversionAction('Website Signup', {
  type: 'webpage',
  category: 'signup',
  counting: 'one-per-click',
  value: { default: 10, currency: 'EUR' },
  attribution: 'data-driven',
})
```

`ConversionActionType`: `'webpage'` | `'ad-call'` | `'click-to-call'` | `'import'`
`ConversionCategory`: `'purchase'` | `'signup'` | `'lead'` | `'page-view'` | `'download'`
  | `'add-to-cart'` | `'begin-checkout'` | `'subscribe'` | `'contact'` | `'other'`
`ConversionCounting`: `'one-per-click'` | `'many-per-click'`
`AttributionModel`: `'last-click'` | `'data-driven'`

```ts
sharedBudget(
  name: string,
  budget: { amount: number; currency: string; period: 'daily' },
): SharedBudgetConfig
```
Shared budget for distributing spend across multiple campaigns. Pass it directly as the `budget` field:
```ts
// campaigns/shared-pool.ts
export const pool = sharedBudget('Search Pool', daily(30))

// campaigns/search-dropbox.ts
import { pool } from './shared-pool.ts'

export default google.search('Search - Dropbox', {
  budget: pool,
  bidding: 'maximize-conversions',
  ...
})
```
All campaigns using the same `SharedBudgetConfig` as their `budget` share one Google Ads budget resource (`explicitly_shared=true`). Google distributes spend dynamically across them.

---

## 7. Builder Methods Reference

### CampaignBuilder (Search)

Returned by `google.search()`. All methods return a new `CampaignBuilder` (immutable chaining).

```ts
.group(key: string, input: AdGroupInput): CampaignBuilder
```
Add an ad group that inherits campaign-level targeting. `key` must be unique.

```ts
.locale(key: string, targeting: Targeting, input: AdGroupInput): CampaignBuilder
```
Add an ad group with targeting that **overrides** campaign-level targeting. Ideal for multi-language/region campaigns.

```ts
.sitelinks(...links: Sitelink[]): CampaignBuilder
.callouts(...texts: string[]): CampaignBuilder           // validates ≤25 chars each
.snippets(...snippets: StructuredSnippet[]): CampaignBuilder
.calls(...calls: CallExtension[]): CampaignBuilder
.prices(...prices: PriceExtension[]): CampaignBuilder
.promotions(...promos: PromotionExtension[]): CampaignBuilder
.images(...images: ImageExtension[]): CampaignBuilder
```

Each extension method **replaces** any existing extensions of that type (not appends).

#### AdGroupInput

```ts
type AdGroupInput = {
  readonly keywords: Keyword[] | KeywordsMarker | readonly (Keyword | KeywordsMarker)[]
  readonly ad: GoogleAd | GoogleAd[] | RsaMarker
  readonly negatives?: Keyword[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
}
```

### DisplayCampaignBuilder

Returned by `google.display()`.

```ts
.group(key: string, input: DisplayAdGroupInput): DisplayCampaignBuilder
```

### PMaxCampaignBuilder

Returned by `google.performanceMax()`.

```ts
.assetGroup(key: string, input: AssetGroupInput): PMaxCampaignBuilder
```

### ShoppingCampaignBuilder

Returned by `google.shopping()`.

```ts
.group(key: string, input: ShoppingAdGroup): ShoppingCampaignBuilder
```

`ShoppingAdGroup`: `{ status?: 'enabled' | 'paused'; bid?: number }`

### DemandGenCampaignBuilder

Returned by `google.demandGen()`.

```ts
.group(key: string, input: DemandGenAdGroupInput): DemandGenCampaignBuilder
```

`DemandGenAdGroupInput`:
```ts
{
  readonly ad: DemandGenAd | DemandGenAd[]
  readonly targeting?: Targeting
  readonly status?: 'enabled' | 'paused'
  readonly channels?: DemandGenChannelControls
}
```

### MetaCampaignBuilder<T>

Returned by `meta.traffic()`, `meta.conversions()`, etc.

```ts
.adSet(name: string, config: AdSetConfig<T>, content: AdSetContent): MetaCampaignBuilder<T>
.build(): MetaCampaign<T>
```

`.build()` is optional — the flatten layer auto-detects `MetaCampaignBuilder` instances.

---

## 8. AI Module

The `ai` namespace provides marker factories for embedding AI-generated content in
campaign definitions. Markers are inert tags -- the actual LLM call happens during
`ads generate`, `ads plan`, or `ads apply`.

```ts
import { ai } from '@upspawn/ads'
```

### ai.rsa

```ts
ai.rsa(prompt: string): RsaMarker
ai.rsa(input: RsaMarkerInput): RsaMarker
```

Place where a Google RSA would go. The LLM generates headlines + descriptions.

```ts
type RsaMarkerInput = {
  readonly prompt?: string
  readonly product?: string
  readonly audience?: string
  readonly tone?: string
  readonly judge?: string        // optional quality-check prompt
}
```

```ts
// Simple prompt
.group('ai-generated', {
  keywords: exact('rename files'),
  ad: ai.rsa('Write headlines and descriptions for a file renaming tool called renamed.to'),
})

// Structured input
.group('ai-structured', {
  keywords: exact('rename files'),
  ad: ai.rsa({
    product: 'renamed.to — AI file renaming',
    audience: 'developers and teams',
    tone: 'professional, concise',
  }),
})
```

### ai.keywords

```ts
ai.keywords(prompt: string): KeywordsMarker
```

Place where keywords would go. The LLM generates keyword lists.

```ts
.group('ai-keywords', {
  keywords: ai.keywords('Suggest exact-match keywords for a PDF renaming tool'),
  ad: rsa(...),
})
```

### ai.metaCopy

```ts
ai.metaCopy(prompt: string): MetaCopyMarker
ai.metaCopy(input: MetaCopyMarkerInput): MetaCopyMarker
```

Generates Meta ad copy (headline, primaryText, description).

```ts
type MetaCopyMarkerInput = {
  readonly prompt?: string
  readonly product?: string
  readonly audience?: string
  readonly tone?: string
  readonly judge?: string
}
```

### ai.interests

```ts
ai.interests(prompt: string): InterestsMarker
```

Generates Meta interest targeting suggestions.

### CLI Workflows

```bash
# Generate: resolves all AI markers in campaign files
ads generate

# Optimize: analyzes live campaign performance and suggests improvements
ads optimize
```

---

## 9. CLI Commands

Run with `bun ads <command>` or `bun cli/index.ts <command>`.

### init
Scaffold a new ads-as-code project with `ads.config.ts` and `campaigns/` directory.
```bash
ads init
```

### auth
Authenticate with ad platforms.
```bash
ads auth google            # Start OAuth flow
ads auth google --check    # Verify credentials work
```

### validate
Validate campaign files and report errors (no API calls).
```bash
ads validate
ads validate --provider google
```

### plan
Preview what changes would be applied. Fetches live state and diffs.
```bash
ads plan
ads plan --provider google
ads plan --json
```

### apply
Apply changes to ad platforms. Executes mutations in dependency order.
```bash
ads apply
ads apply --dry-run        # Show exact API payloads without making changes
ads apply --provider meta
ads apply --json
```

### import
Import existing campaigns from the platform as TypeScript files.
```bash
ads import
ads import --provider google
ads import --provider meta
```

### pull
Pull live state and detect drift from code.
```bash
ads pull
```

### status
Show current platform state for managed campaigns.
```bash
ads status
ads status --provider google
ads status --filter "Search*"
ads status --json
```

### generate
Resolve AI markers in campaign files (calls the configured LLM).
```bash
ads generate
ads generate --provider google
```

### optimize
AI-powered campaign optimization analysis.
```bash
ads optimize
ads optimize --provider google
```

### search
Search Meta targeting interests or behaviors.
```bash
ads search interests "construction"
ads search behaviors "small business"
```

### audiences
List Meta custom audiences in the account.
```bash
ads audiences
ads audiences --json
```

### history
Show operation history from the SQLite cache.
```bash
ads history
ads history --diff 3       # Show changeset for operation #3
ads history --rollback 3   # Show snapshot for revert
```

### doctor
Run diagnostic checks on project setup (credentials, config, campaign files).
```bash
ads doctor
```

### cache
Manage the local SQLite cache.
```bash
ads cache stats
ads cache clear
```

### Global Flags

| Flag | Description |
|---|---|
| `--json` | Output in JSON format |
| `--provider <google\|meta>` | Filter to a specific provider |
| `--filter <pattern>` | Filter campaigns by glob pattern (status command) |
| `--dry-run` | Show API payloads without executing (apply command) |
| `--help`, `-h` | Show help |

---

## 10. Common Patterns

### Shared Targeting

Extract targeting into a separate file and import it.

```ts
// campaigns/shared/targeting.ts
import { targeting, geo, languages, weekdays, hours, presence, negatives } from '@upspawn/ads'

export const usTargeting = targeting(
  geo('US'),
  languages('en'),
  weekdays(),
  hours(8, 22),
  presence('presence'),
)

export const euTargeting = targeting(
  geo('DE', 'AT', 'CH', 'FR', 'IT', 'ES'),
  languages('de', 'fr', 'it', 'es'),
  weekdays(),
  hours(8, 22),
)

export const brandNegatives = negatives('free', 'open source', 'crack', 'pirate', 'download')
```

```ts
// campaigns/search-us.ts
import { google, daily, exact, rsa, headlines, descriptions, url } from '@upspawn/ads'
import { usTargeting, brandNegatives } from './shared/targeting.ts'

export const searchUs = google.search('Search - US', {
  budget: daily(20),
  bidding: 'maximize-conversions',
  targeting: usTargeting,
  negatives: brandNegatives,
})
.group('core', {
  keywords: exact('rename files'),
  ad: rsa(
    headlines('Rename Files Fast', 'AI Renamer', 'Try Free'),
    descriptions('Rename files in seconds.', 'No credit card.'),
    url('https://renamed.to'),
  ),
})
```

### Factory Functions for Campaign Variants

```ts
// campaigns/factory.ts
import {
  google, daily, targeting, geo, languages, exact,
  rsa, headlines, descriptions, url, negatives,
} from '@upspawn/ads'

function searchCampaign(
  country: string,
  lang: string,
  kws: string[],
  headlineTexts: string[],
  descTexts: string[],
) {
  return google.search(`Search - ${country.toUpperCase()}`, {
    budget: daily(15),
    bidding: 'maximize-conversions',
    targeting: targeting(geo(country), languages(lang)),
    negatives: negatives('free', 'cheap'),
  })
  .group('core', {
    keywords: exact(...kws),
    ad: rsa(
      headlines(...headlineTexts),
      descriptions(...descTexts),
      url(`https://renamed.to/${lang}`),
    ),
  })
}

export const searchUs = searchCampaign(
  'US', 'en',
  ['rename files', 'batch rename'],
  ['Rename Files Fast', 'AI Renamer', 'Try Free'],
  ['Rename files in seconds.', 'No credit card required.'],
)

export const searchDe = searchCampaign(
  'DE', 'de',
  ['dateien umbenennen', 'stapelumbenennung'],
  ['Dateien Umbenennen', 'KI-Dateimanager', 'Jetzt Testen'],
  ['Dateien in Sekunden umbenennen.', 'Kostenlos testen.'],
)
```

### Multi-Locale Campaigns with .locale()

```ts
import {
  google, daily, targeting, geo, languages,
  negatives, exact, rsa, headlines, descriptions, url,
} from '@upspawn/ads'

export const multiLocale = google.search('Search - Multi-Locale', {
  budget: daily(30),
  bidding: 'maximize-conversions',
  targeting: targeting(geo('US', 'DE'), languages('en', 'de')),
  negatives: negatives('free', 'cheap'),
})
.locale('en-us', targeting(geo('US'), languages('en')), {
  keywords: exact('rename files', 'batch rename'),
  ad: rsa(
    headlines('Rename Files Fast', 'AI File Renamer', 'Try Free Today'),
    descriptions('Rename thousands of files in seconds.', 'No credit card required.'),
    url('https://renamed.to'),
  ),
})
.locale('de-dach', targeting(geo('DE', 'AT', 'CH'), languages('de')), {
  keywords: exact('dateien umbenennen', 'stapelumbenennung'),
  ad: rsa(
    headlines('Dateien Umbenennen', 'KI-Dateimanager', 'Jetzt Testen'),
    descriptions('Dateien in Sekunden umbenennen.', 'Kostenlos testen.'),
    url('https://renamed.to/de'),
  ),
})
```

### Multiple Ads per Ad Group

Pass an array to the `ad` field:

```ts
.group('core', {
  keywords: exact('rename files'),
  ad: [
    rsa(
      headlines('Rename Files Fast', 'AI Renamer', 'Try Free'),
      descriptions('Rename files in seconds.', 'No credit card.'),
      url('https://renamed.to'),
    ),
    rsa(
      headlines('Batch File Renaming', 'Smart Rename Tool', 'AI-Powered'),
      descriptions('Organize your files with AI.', 'Works on any platform.'),
      url('https://renamed.to'),
    ),
  ],
})
```

### Campaign-Level Extensions

Extensions are set on the campaign, not the ad group. Each call replaces previous values.

```ts
const campaign = google.search('My Campaign', { ... })
  .group('g1', { ... })
  .group('g2', { ... })
  .sitelinks(link('A', '/a'), link('B', '/b'))    // these apply to ALL ad groups
  .callouts('Free Trial', 'No CC')                 // campaign-level callouts
```

### Combining Google and Meta in One Project

```ts
// campaigns/google-search.ts
import { google, daily, targeting, geo, languages, exact, rsa, headlines, descriptions, url } from '@upspawn/ads'
export const searchCampaign = google.search('Search - Core', { ... }).group(...)

// campaigns/meta-traffic.ts
import { meta, daily, metaImage, metaTargeting, geo, age } from '@upspawn/ads'
export const trafficCampaign = meta.traffic('Traffic - Retargeting', { ... }).adSet(...)
```

Both are discovered automatically. Use `--provider` flags to filter.

---

## 11. Gotchas and Constraints

### Validation Constraints

| Helper / Field | Constraint |
|---|---|
| `headlines()` | Each ≤30 chars |
| `descriptions()` | Each ≤90 chars |
| `rsa()` | 3-15 headlines, 2-4 descriptions |
| `callouts()` | Each ≤25 chars |
| `.callouts()` on builder | Each ≤25 chars (validated at call time) |
| `link()` text | ≤25 chars |
| `link()` description1/2 | Each ≤35 chars |
| `snippet()` values | 3-10 values, each ≤25 chars |
| `price()` items | 3-8 items, header ≤25 chars |
| `rsa()` path1/path2 | Each ≤15 chars |
| `smartAd()` | Exactly 3 headlines, exactly 2 descriptions |
| `appAd()` | Max 5 headlines, max 5 descriptions |
| PMax `headlines` | 3-15, each max 30 chars |
| PMax `longHeadlines` | 1-5, each max 90 chars |
| PMax `descriptions` | 2-5, each max 90 chars |
| PMax `businessName` | Max 25 chars |
| Demand Gen `headlines` | Max 5, each max 40 chars |
| Demand Gen `descriptions` | Max 5, each max 90 chars |
| Demand Gen carousel `cards` | 2-10 cards |
| Meta carousel `cards` | 2-10 cards |
| `age()` | Range 13-65 |
| `lookalike()` percent | 1-10 |
| `hours()` | startHour 0-23, endHour 1-24, start < end |
| `device()` bidAdjustment | -1.0 to 9.0 |
| `scheduleBid()` bidAdjustment | -1.0 to 9.0 |
| `daily()`/`monthly()`/`lifetime()` | amount must be positive |
| `url()` | Must start with `http://` or `https://` |

### Common Mistakes

**EUR is the default currency, not USD.**
All budget helpers default to EUR. Always pass `'USD'` explicitly if needed:
```ts
daily(20)          // 20 EUR
daily(20, 'USD')   // 20 USD
```

**`rsa()` takes positional args, not an object.**
```ts
// WRONG:
rsa({ headlines: [...], descriptions: [...], url: '...' })

// CORRECT:
rsa(headlines(...), descriptions(...), url('...'))
```

**Branded types -- you cannot pass raw strings where `Headline[]` or `Description[]` are expected.**
```ts
// WRONG:
rsa(['Rename Files'], ['Try free.'], url('...'))

// CORRECT:
rsa(headlines('Rename Files', 'Alt 1', 'Alt 2'), descriptions('Try free.', 'Another desc.'), url('...'))
```

**`target_roas` is a raw double, not micros.**
A 200% ROAS target = `targetRoas: 2.0`, not `2000000`.
```ts
{ type: 'target-roas', targetRoas: 2.0 }   // 200% ROAS
```

**`.group()` keys must be unique within a campaign.**
Duplicate keys silently overwrite the previous group.

**`interests()` returns an array -- spread it into `metaTargeting()`.**
```ts
// WRONG:
metaTargeting(geo('US'), interests('Construction'))

// CORRECT:
metaTargeting(geo('US'), ...interests('Construction'))
```

**`metaTargeting()` requires at least one `geo()` rule.**
It throws if no geo targeting is provided.

**Extension methods replace, not append.**
Calling `.sitelinks()` twice replaces the first set:
```ts
campaign
  .sitelinks(link('A', '/a'))
  .sitelinks(link('B', '/b'))  // only B is kept
```

**Smart and App campaigns are not builders.**
`google.smart()` and `google.app()` return plain objects, not chainable builders.
There is no `.group()` method on them.

**Google Ads numeric enums.**
The API uses numeric enums: status 2=ENABLED, 3=PAUSED; bidding 6=MAXIMIZE_CONVERSIONS,
10=TARGET_SPEND (maximize-clicks). The SDK abstracts these -- use string values.

**TARGET_SPEND = Maximize Clicks in Google Ads API.**
The API enum for "Maximize Clicks" is `TARGET_SPEND` (10), not `MAXIMIZE_CLICKS` (11).
The SDK handles this -- use `'maximize-clicks'`.

**Video campaigns are read-only.**
The Google Ads API only supports reading Video campaigns, not creating or modifying them.
Use the Google Ads UI for video campaign management.

---

## 12. Type Reference

### Core Types

```ts
type Headline = string & { readonly __brand: 'Headline' }
type Description = string & { readonly __brand: 'Description' }
type CalloutText = string & { readonly __brand: 'Callout' }
```

```ts
type DailyBudget = { amount: number; currency: 'EUR' | 'USD'; period: 'daily' }
type MonthlyBudget = { amount: number; currency: 'EUR' | 'USD'; period: 'monthly' }
type LifetimeBudget = { amount: number; currency: 'EUR' | 'USD'; period: 'lifetime'; endTime: string }
type Budget = DailyBudget | MonthlyBudget | LifetimeBudget
```

```ts
type Keyword = ExactKeyword | PhraseKeyword | BroadKeyword
type ExactKeyword = { text: string; matchType: 'EXACT' } & KeywordOptions
type PhraseKeyword = { text: string; matchType: 'PHRASE' } & KeywordOptions
type BroadKeyword = { text: string; matchType: 'BROAD' } & KeywordOptions
type KeywordOptions = { bid?: number; finalUrl?: string; status?: 'enabled' | 'paused' }
type KeywordInput = string | ({ text: string } & KeywordOptions)
```

```ts
type Targeting = { readonly rules: TargetingRule[] }

type TargetingRule =
  | GeoTarget | LanguageTarget | ScheduleTarget | DeviceTarget
  | RegionTarget | CityTarget | RadiusTarget | PresenceTarget
  | DemographicTarget | ScheduleBidTarget | AudienceTarget
  | PlacementTarget | TopicTarget | ContentKeywordTarget
```

```ts
type CountryCode = 'US' | 'DE' | 'CA' | 'GB' | 'AU' | 'AT' | 'CH' | 'FR' | 'IT' | 'ES' | ... | (string & {})
type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | ... | (string & {})
type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
```

### Resource and Diff Types

```ts
type ResourceKind = 'campaign' | 'adGroup' | 'adSet' | 'assetGroup' | 'keyword'
  | 'ad' | 'creative' | 'sitelink' | 'callout' | 'structuredSnippet'
  | 'callExtension' | 'negative' | 'sharedSet' | 'sharedCriterion'
  | 'conversionAction' | 'sharedBudget'

type Resource = {
  readonly kind: ResourceKind
  readonly path: string
  readonly properties: Record<string, unknown>
  readonly meta?: Record<string, unknown>
  readonly platformId?: string
}

type PropertyChange = { field: string; from: unknown; to: unknown }

type Change =
  | { op: 'create'; resource: Resource }
  | { op: 'update'; resource: Resource; changes: PropertyChange[] }
  | { op: 'delete'; resource: Resource }
  | { op: 'drift'; resource: Resource; changes: PropertyChange[] }

type Changeset = {
  creates: Change[]
  updates: Change[]
  deletes: Change[]
  drift: Change[]
}
```

### Google Campaign Types

```ts
type GoogleCampaign =
  | GoogleSearchCampaign | GoogleDisplayCampaign | GooglePMaxCampaign
  | GoogleShoppingCampaign | GoogleDemandGenCampaign | GoogleSmartCampaign
  | GoogleAppCampaign | GoogleVideoCampaign
```

### Meta Types

```ts
type Objective = 'awareness' | 'traffic' | 'engagement'
  | 'leads' | 'sales' | 'conversions' | 'app-promotion'

type MetaCampaign<T extends Objective> = {
  provider: 'meta'; kind: T; name: string;
  config: MetaCampaignConfig; adSets: readonly MetaAdSet<T>[]
}

type MetaAdSet<T extends Objective> = {
  name: string; config: AdSetConfig<T>; content: AdSetContent
}

type MetaCreative = ImageAd | VideoAd | CarouselAd | CollectionAd | BoostedPostAd

type MetaTargeting = {
  geo: GeoTarget[]
  age?: { min: number; max: number }
  genders?: readonly ('all' | 'male' | 'female')[]
  customAudiences?: readonly string[]
  excludedAudiences?: readonly string[]
  lookalikeAudiences?: readonly string[]
  interests?: readonly InterestTarget[]
  behaviors?: readonly BehaviorTarget[]
  demographics?: readonly MetaDemographicTarget[]
  excludedInterests?: readonly InterestTarget[]
  excludedBehaviors?: readonly BehaviorTarget[]
  advantageAudience?: boolean
  advantageDetailedTargeting?: boolean
  connections?: readonly ConnectionTarget[]
  excludedConnections?: readonly ConnectionTarget[]
  friendsOfConnections?: readonly ConnectionTarget[]
  locales?: readonly number[]
}

type BidStrategy =
  | { type: 'LOWEST_COST_WITHOUT_CAP' }
  | { type: 'LOWEST_COST_WITH_BID_CAP'; cap: number }
  | { type: 'COST_CAP'; cap: number }
  | { type: 'MINIMUM_ROAS'; floor: number }
  | { type: 'BID_CAP'; cap: number }
```

### Image Assets

```ts
type ImageRef = { type: 'image-ref'; path: string; aspectRatio: ImageAspectRatio }
type ImageAspectRatio = 'landscape' | 'square' | 'portrait' | 'logo' | 'logo-landscape'
```

### Config Types

```ts
type AdsConfig = {
  google?: GoogleProviderConfig
  meta?: MetaProviderConfig
  cache?: string
  ai?: AiConfig
}

type GoogleProviderConfig = { customerId: string; managerId?: string; credentials?: string }
type MetaProviderConfig = {
  accountId: string; pageId: string; pixelId?: string;
  apiVersion?: string; currency?: string;
  dsa?: { beneficiary: string; payor: string }; credentials?: string
}
```

### Error Types

```ts
type AdsError =
  | { type: 'auth'; message: string }
  | { type: 'quota'; message: string; retryAfter: number }
  | { type: 'validation'; field: string; message: string }
  | { type: 'conflict'; resource: Resource; message: string }
  | { type: 'policy'; resource: Resource; message: string }
  | { type: 'budget'; message: string }
  | { type: 'api'; code: number; message: string }
```
