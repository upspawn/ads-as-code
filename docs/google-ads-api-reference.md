# Google Ads API Reference for SDK Spec

Comprehensive reference for the Google Ads API (v17+/v23), covering campaign types, ad formats, assets, targeting, bidding, conversions, and account-level features. All enum values, field names, and resource structures are sourced from official Google Ads API documentation.

> **API Version Note:** Google Ads API versions increment regularly. This document references v17+ patterns that remain stable through v23. Field names use snake_case (REST/protobuf convention). The latest version is v23 as of March 2026.

---

## Table of Contents

1. [Campaign Types](#1-campaign-types)
2. [Ad Formats](#2-ad-formats)
3. [Extensions / Assets](#3-extensions--assets)
4. [Targeting](#4-targeting)
5. [Bidding Strategies](#5-bidding-strategies)
6. [Conversion Tracking](#6-conversion-tracking)
7. [Account-Level Features](#7-account-level-features)
8. [Resource Hierarchy Summary](#8-resource-hierarchy-summary)

---

## 1. Campaign Types

### Campaign Resource Core Fields

Every campaign shares these fields on the `Campaign` resource:

| Field | Type | Notes |
|-------|------|-------|
| `advertising_channel_type` | `AdvertisingChannelType` enum | **Immutable.** Set at creation only. |
| `advertising_channel_sub_type` | `AdvertisingChannelSubType` enum | Optional refinement. Immutable after creation. |
| `status` | `CampaignStatus` enum | `ENABLED`, `PAUSED`, `REMOVED` |
| `name` | `string` | Must be unique within the account. |
| `campaign_budget` | `string` (resource name) | Link to `CampaignBudget` resource. |
| `start_date` | `string` (YYYYMMDD) | Optional. |
| `end_date` | `string` (YYYYMMDD) | Optional. |
| `network_settings` | `NetworkSettings` | Controls which Google networks serve ads. |
| `geo_target_type_setting` | `GeoTargetTypeSetting` | Positive/negative geo targeting type. |
| `tracking_url_template` | `string` | Tracking template with `{lpurl}` etc. |
| `final_url_suffix` | `string` | Appended to all final URLs. |
| `url_custom_parameters[]` | `CustomParameter[]` | Key-value pairs for `{_param}` substitution. |
| `brand_guidelines_enabled` | `bool` | PMax only. Immutable after creation. |

#### NetworkSettings Fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `target_google_search` | `bool` | `true` | Google Search results. |
| `target_search_network` | `bool` | `false` | Search partner sites. |
| `target_content_network` | `bool` | `false` | Google Display Network. |
| `target_partner_search_network` | `bool` | `false` | Additional partner sites. |

---

### 1.1 SEARCH

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `SEARCH` |
| **Sub-resources** | Campaign > Ad Groups > Ads + Keywords |
| **Ad group type** | `SEARCH_STANDARD` (default) or `SEARCH_DYNAMIC_ADS` |
| **Ad formats** | `RESPONSIVE_SEARCH_AD` (RSA). Legacy: `EXPANDED_TEXT_AD`, `TEXT_AD` (read-only). |
| **Bidding strategies** | All standard strategies: Manual CPC, Maximize Clicks, Maximize Conversions, Maximize Conversion Value, Target CPA, Target ROAS, Target Impression Share |
| **Key targeting** | Keywords (broad, phrase, exact), negative keywords, locations, languages, audiences, demographics, ad schedule, device bid adjustments |
| **Network settings** | `target_google_search = true`, optionally `target_search_network`, `target_content_network` |

**Dynamic Search Ads (DSA) setting:**
```
campaign.dynamic_search_ads_setting.domain_name = "example.com"
campaign.dynamic_search_ads_setting.language_code = "en"
```
Uses `SEARCH` channel type with `SEARCH_DYNAMIC_ADS` ad group type and `EXPANDED_DYNAMIC_SEARCH_AD` ad format.

---

### 1.2 DISPLAY

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `DISPLAY` |
| **Sub-resources** | Campaign > Ad Groups > Ads |
| **Ad group type** | `DISPLAY_STANDARD` |
| **Ad formats** | `RESPONSIVE_DISPLAY_AD`, `IMAGE_AD`, `HTML5_UPLOAD_AD`, `DYNAMIC_HTML5_AD` |
| **Bidding strategies** | Manual CPC, Manual CPM, Maximize Clicks, Maximize Conversions, Target CPA, Target ROAS, Viewable CPM (vCPM) |
| **Key targeting** | Audiences (in-market, affinity, custom), placements (websites/apps), topics, content keywords, demographics (age, gender, parental status, household income), remarketing lists |

**Channel sub-types:**
- `DISPLAY_SMART_CAMPAIGN` -- Smart Display (cannot create new ones)
- `DISPLAY_GMAIL_AD` -- Gmail ads
- `DISPLAY_MOBILE_APP` -- Mobile app display
- `DISPLAY_EXPRESS` -- Express display

**Targeting specifics for Display:**

| Criterion | Level | Notes |
|-----------|-------|-------|
| `Placement` | Ad Group | Specific websites, apps, YouTube channels |
| `Topic` | Ad Group | Content categories (e.g., "Pets & Animals") |
| `Keyword` (content) | Ad Group | Keywords for contextual targeting (different from Search keywords) |
| `UserInterest` | Ad Group | Affinity & in-market audiences |
| `CustomAudience` | Ad Group | Custom intent/affinity audiences |
| `CombinedAudience` | Ad Group | AND/OR combinations of audience segments |

---

### 1.3 PERFORMANCE_MAX

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `PERFORMANCE_MAX` |
| **Sub-resources** | Campaign > **Asset Groups** (NOT ad groups) |
| **Ad formats** | AI-generated from asset group assets. Serves across Search, Display, YouTube, Discover, Gmail, Maps. |
| **Bidding strategies** | **Maximize Conversions** or **Maximize Conversion Value** only (with optional target CPA/ROAS). |
| **Key targeting** | Automated by Google AI. Audience signals (optional) guide the AI. Location and language at campaign level. |

**Critical difference:** PMax uses `AssetGroup` instead of `AdGroup`. Each campaign needs at least 1 asset group (max 100). Assets cannot be shared between campaigns.

**Brand Guidelines:** If `brand_guidelines_enabled = true` at campaign creation:
- `BUSINESS_NAME` and `LOGO` (aka `BUSINESS_LOGO`) must be linked as `CampaignAsset` (campaign level)
- Cannot be set in asset groups
- Cannot be disabled after creation
- Not supported for Travel Goals PMax

**Required Asset Group assets (non-retail):**

| Asset Field Type | Character/Size Limit | Min | Max |
|-----------------|----------------------|-----|-----|
| **Text Assets** | | | |
| `HEADLINE` | 30 chars | 3 | 15 |
| `LONG_HEADLINE` | 90 chars | 1 | 5 |
| `DESCRIPTION` | 90 chars | 2 | 5 |
| **Image Assets** | | | |
| `MARKETING_IMAGE` | Landscape 1.91:1, recommended 1200x628, min 600x314, max 5120KB | 1 | 20 |
| `SQUARE_MARKETING_IMAGE` | Square 1:1, recommended 1200x1200, min 300x300, max 5120KB | 1 | 20 |
| **Logo Assets** (when brand guidelines disabled) | | | |
| `LOGO` | Square 1:1, recommended 1200x1200, min 128x128, max 5120KB | 1 | 20 |

**Conditional requirements (when brand guidelines disabled):**
- `BUSINESS_NAME` as `AssetGroupAsset`: 1 required, 25 char limit

**Optional assets:**

| Asset Field Type | Specs | Max |
|-----------------|-------|-----|
| `PORTRAIT_MARKETING_IMAGE` | 4:5 ratio, recommended 960x1200, min 480x600 | 20 |
| `LANDSCAPE_LOGO` | 4:1 ratio, recommended 1200x300, min 512x128 | 20 |
| `YOUTUBE_VIDEO` | 16:9, 1:1, or 9:16; min 10s duration | 15 |
| `CALL_TO_ACTION_SELECTION` | Auto or from predefined list | 1 |
| `MEDIA_BUNDLE` | Max 150KB | 1 |

**Retail PMax** (with Merchant Center): auto-generates minimum assets from product feed. Additional assets recommended. Requires `campaign.shopping_setting.merchant_id`.

**`AssetGroup` resource fields:**

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Required. |
| `campaign` | `string` (resource name) | Required. |
| `final_urls[]` | `string[]` | Required. The landing page URLs. |
| `final_mobile_urls[]` | `string[]` | Optional. |
| `status` | `AssetGroupStatus` | `ENABLED`, `PAUSED`, `REMOVED` |
| `path1` | `string` | Display URL path segment. |
| `path2` | `string` | Display URL path segment (only if path1 is set). |

**`AssetGroupAsset` link:**

| Field | Type |
|-------|------|
| `asset_group` | `string` (resource name) |
| `asset` | `string` (resource name) |
| `field_type` | `AssetFieldType` enum |

---

### 1.4 SHOPPING

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `SHOPPING` |
| **Sub-resources** | Campaign > Ad Groups > Product Ads + Listing Groups |
| **Ad group type** | `SHOPPING_PRODUCT_ADS` |
| **Ad formats** | `SHOPPING_PRODUCT_AD`, `SHOPPING_COMPARISON_LISTING_AD` |
| **Bidding strategies** | Manual CPC, Maximize Clicks, Target ROAS, Maximize Conversion Value |
| **Key targeting** | Listing groups (product partitions), locations, ad schedule |

**Channel sub-types:**
- (none) = Standard Shopping
- `SHOPPING_SMART_ADS` -- Smart Shopping (being migrated to PMax)
- `SHOPPING_COMPARISON_LISTING_ADS` -- Comparison listing

**Required `ShoppingSetting`:**

| Field | Type | Notes |
|-------|------|-------|
| `merchant_id` | `int64` | Merchant Center account ID. Required. |
| `campaign_priority` | `int32` | 0-2 inclusive. Higher = takes precedence. |
| `enable_local` | `bool` | Enable local inventory ads. |

**Listing Groups:** Product targeting uses `ListingGroup` criterion on ad groups (tree structure with `SUBDIVISION` and `UNIT` nodes). Products are partitioned by attributes like brand, category, custom labels, item ID, product type.

**Product ads are auto-generated** from the Merchant Center feed -- no manual ad creative needed (just create an `AdGroupAd` with `ShoppingProductAdInfo`).

---

### 1.5 VIDEO

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `VIDEO` |
| **Sub-resources** | Campaign > Ad Groups > Video Ads |
| **Ad formats** | `VIDEO_AD`, `VIDEO_BUMPER_AD`, `VIDEO_NON_SKIPPABLE_IN_STREAM_AD`, `VIDEO_OUTSTREAM_AD`, `VIDEO_TRUEVIEW_IN_STREAM_AD`, `IN_FEED_VIDEO_AD`, `VIDEO_RESPONSIVE_AD` |
| **Bidding strategies** | Target CPV, Target CPM, Maximize Conversions, Target CPA, Manual CPV |
| **Key targeting** | Audiences, topics, placements (YouTube channels/videos), demographics, keywords |

**API LIMITATION: The Google Ads API only supports READING/REPORTING on Video campaigns. You CANNOT create or update Video campaigns via the API.** Use Google Ads Scripts or Demand Gen campaigns instead for programmatic video ad management.

**Channel sub-types:**
- `VIDEO_ACTION` -- TrueView for Action
- `VIDEO_NON_SKIPPABLE` -- Non-skippable in-stream
- `VIDEO_REACH_TARGET_FREQUENCY` -- Target frequency campaigns

**Reporting query:**
```sql
SELECT campaign.name, campaign.advertising_channel_type, ad_group.name,
       metrics.impressions, metrics.clicks, metrics.ctr
FROM video
WHERE campaign.advertising_channel_type = 'VIDEO'
```

---

### 1.6 DEMAND_GEN

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `DEMAND_GEN` |
| **Sub-resources** | Campaign > Ad Groups > Demand Gen Ads |
| **Ad group type** | No type should be set (leave unset). |
| **Ad formats** | `DEMAND_GEN_MULTI_ASSET_AD`, `DEMAND_GEN_CAROUSEL_AD`, `DEMAND_GEN_VIDEO_RESPONSIVE_AD`, `DEMAND_GEN_PRODUCT_AD` |
| **Bidding strategies** | Maximize Clicks, Target CPA, Maximize Conversions, Target ROAS |
| **Key targeting** | Audiences (required), lookalike segments, location/language at ad group level, demographics |

**Surfaces:** YouTube (including Shorts, in-stream, in-feed), Discover, Gmail, Display.

**Campaign budget:** Must be non-shared (`explicitly_shared = false`). Supports campaign total budget via `total_amount_micros` with `period = CUSTOM`.

**No `AdvertisingChannelSubType`** should be set.

**Channel controls (ad group level):**
```python
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.gmail = False
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.discover = False
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.display = False
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_in_feed = True
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_in_stream = True
ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_shorts = True
```

**Audience targeting:** Uses `AdGroupCriterion` with `Audience` criterion type. Supports lookalike segments (unique to Demand Gen).

**Best practice:** Create all entities (budget, campaign, ad group, audience, ads) in a single `GoogleAdsService.Mutate` request to prevent orphaned entities.

---

### 1.7 SMART

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `SMART` |
| **Channel sub-type** | `SMART_CAMPAIGN` |
| **Sub-resources** | Campaign > Ad Group > SmartCampaignAd |
| **Ad formats** | `SMART_CAMPAIGN_AD` |
| **Bidding strategies** | Automated only (Google manages bidding). |
| **Key targeting** | Keyword themes (not individual keywords), locations, ad schedule |

**Unique workflow:**
1. Build keyword themes via `SmartCampaignSuggestService` or `KeywordThemeConstantService`
2. Get budget/ad text suggestions from `SmartCampaignSuggestService`
3. Create campaign with `SmartCampaignSetting` (business name, Business Profile location)
4. Create ad group + `SmartCampaignAdInfo` (headlines, descriptions)
5. Add `KeywordTheme` campaign criteria

**`SmartCampaignSetting` fields:**
- `business_name` (string)
- `business_profile_location` (string, format: `locations/<locationId>`)
- `final_url` (string)
- `advertising_language_code` (string)

---

### 1.8 APP (MULTI_CHANNEL)

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `MULTI_CHANNEL` |
| **Channel sub-types** | `APP_CAMPAIGN`, `APP_CAMPAIGN_FOR_ENGAGEMENT`, `APP_CAMPAIGN_FOR_PRE_REGISTRATION` |
| **Sub-resources** | Campaign > Ad Groups > App Ads |
| **Ad formats** | `APP_AD`, `APP_ENGAGEMENT_AD`, `APP_PRE_REGISTRATION_AD` |
| **Bidding strategies** | Target CPA, Maximize Conversions (installs or in-app actions), Target ROAS |
| **Key targeting** | Automated by Google. Location, language, user lists (for engagement campaigns). |

**`AppCampaignSetting` fields:**

| Field | Type | Notes |
|-------|------|-------|
| `app_id` | `string` | The app's ID. Immutable. |
| `app_store` | `AppCampaignAppStore` enum | `GOOGLE_APP_STORE` or `APPLE_APP_STORE` |
| `bidding_strategy_goal_type` | `AppCampaignBiddingStrategyGoalType` | `OPTIMIZE_INSTALLS_TARGET_INSTALL_COST`, `OPTIMIZE_IN_APP_CONVERSIONS_TARGET_INSTALL_COST`, `OPTIMIZE_IN_APP_CONVERSIONS_TARGET_CONVERSION_COST`, `OPTIMIZE_RETURN_ON_ADVERTISING_SPEND` |

**Conversion optimization:** Use `selective_optimization.conversion_actions[]` to specify which conversion actions to optimize for (only available on App campaigns).

**Note:** `APP_CAMPAIGN` (installs) legacy type is NOT supported via API -- only via UI.

---

### 1.9 LOCAL

| Property | Value |
|----------|-------|
| **`advertising_channel_type`** | `LOCAL` |
| **Channel sub-type** | `LOCAL_CAMPAIGN` |
| **Sub-resources** | Campaign > Ad Groups > Local Ads |
| **Ad formats** | `LOCAL_AD` |
| **Bidding strategies** | Automated (Maximize Conversions for store visits/calls). |
| **Key targeting** | Location-based, tied to Business Profile locations. |

**Note:** Local campaigns are being migrated to Performance Max. New Local campaigns may not be creatable.

---

### 1.10 Additional Channel Types

| Type | Notes |
|------|-------|
| `HOTEL` | Hotel campaigns. Uses `hotel_setting` on Campaign. `HOTEL_AD` format. |
| `LOCAL_SERVICES` | Local Services Ads. Uses `LOCAL_SERVICE_ID` criteria. |
| `TRAVEL` | Travel campaigns. Sub-type: `TRAVEL_ACTIVITIES`. `TRAVEL_AD` format. |

---

### AdvertisingChannelType Enum (Complete)

```
UNSPECIFIED
UNKNOWN
SEARCH
DISPLAY
SHOPPING
HOTEL
VIDEO
MULTI_CHANNEL        (App campaigns)
LOCAL
SMART
PERFORMANCE_MAX
LOCAL_SERVICES
TRAVEL
DEMAND_GEN
```

### AdvertisingChannelSubType Enum (Complete)

```
UNSPECIFIED
UNKNOWN
SEARCH_MOBILE_APP
SEARCH_EXPRESS
DISPLAY_MOBILE_APP
DISPLAY_EXPRESS
DISPLAY_SMART_CAMPAIGN       (cannot create new)
DISPLAY_GMAIL_AD
SHOPPING_SMART_ADS           (migrating to PMax)
SHOPPING_COMPARISON_LISTING_ADS
VIDEO_ACTION
VIDEO_NON_SKIPPABLE
VIDEO_REACH_TARGET_FREQUENCY
APP_CAMPAIGN
APP_CAMPAIGN_FOR_ENGAGEMENT
APP_CAMPAIGN_FOR_PRE_REGISTRATION
SMART_CAMPAIGN
LOCAL_CAMPAIGN
TRAVEL_ACTIVITIES
```

---

## 2. Ad Formats

### 2.1 Responsive Search Ad (RSA)

**Resource:** `Ad.responsive_search_ad` -> `ResponsiveSearchAdInfo`

| Field | Type | Constraints |
|-------|------|-------------|
| `headlines[]` | `AdTextAsset[]` | Min 3, max 15. Each max 30 chars. |
| `descriptions[]` | `AdTextAsset[]` | Min 2, max 4. Each max 90 chars. |
| `path1` | `string` | Optional. Max 15 chars. Display URL path. |
| `path2` | `string` | Optional. Max 15 chars. Only if `path1` set. |

**`AdTextAsset` fields:**

| Field | Type | Notes |
|-------|------|-------|
| `text` | `string` | The text content. |
| `pinned_field` | `ServedAssetFieldType` | `HEADLINE_1`, `HEADLINE_2`, `HEADLINE_3`, `DESCRIPTION_1`, `DESCRIPTION_2`. Optional pinning. |
| `asset_performance_label` | Output only | `BEST`, `GOOD`, `LOW`, `PENDING` |

**Parent `Ad` fields also needed:**

| Field | Type | Notes |
|-------|------|-------|
| `final_urls[]` | `string[]` | Required. Landing page URLs. |
| `final_mobile_urls[]` | `string[]` | Optional. |
| `tracking_url_template` | `string` | Optional. |
| `url_custom_parameters[]` | `CustomParameter[]` | Optional. |

---

### 2.2 Responsive Display Ad

**Resource:** `Ad.responsive_display_ad` -> `ResponsiveDisplayAdInfo`

| Field | Type | Constraints |
|-------|------|-------------|
| `headlines[]` | `AdTextAsset[]` | Min 1, max 5. Each max 30 chars. |
| `long_headline` | `AdTextAsset` | **Required.** Max 90 chars. |
| `descriptions[]` | `AdTextAsset[]` | Min 1, max 5. Each max 90 chars. |
| `marketing_images[]` | `AdImageAsset[]` | **Required.** Min 1. Landscape 1.91:1, min 600x314. Combined with square max 15. |
| `square_marketing_images[]` | `AdImageAsset[]` | **Required.** Min 1. Square 1:1, min 300x300. Combined with marketing max 15. |
| `logo_images[]` | `AdImageAsset[]` | Optional. Landscape 4:1, min 512x128. Combined with square logos max 5. |
| `square_logo_images[]` | `AdImageAsset[]` | Optional. Square 1:1, min 128x128. Combined with logos max 5. |
| `youtube_videos[]` | `AdVideoAsset[]` | Optional. |
| `business_name` | `string` | **Required.** Max 25 chars. |
| `call_to_action_text` | `string` | Optional. Max 30 chars. |
| `main_color` | `string` | Hex color (e.g., `#ffffff`). |
| `accent_color` | `string` | Hex color. Required if `main_color` set. |
| `allow_flexible_color` | `bool` | Default `true`. Must be `true` if colors not set. |
| `format_setting` | `DisplayAdFormatSetting` | `ALL_FORMATS` (default), `NON_NATIVE`, `NATIVE` |
| `control_spec` | `ResponsiveDisplayAdControlSpec` | Advanced creative controls. |

---

### 2.3 Image Ad

**Resource:** `Ad.image_ad` -> `ImageAdInfo`

Used in Display campaigns. The image contains the complete ad creative.

| Field | Type | Notes |
|-------|------|-------|
| `image_asset` | `string` (resource name) | Reference to an Image asset. |
| `pixel_width` | `int64` | Output only. |
| `pixel_height` | `int64` | Output only. |
| `mime_type` | `MimeType` | `IMAGE_JPEG`, `IMAGE_GIF`, `IMAGE_PNG` |

Common sizes: 300x250, 728x90, 160x600, 336x280, 320x50 (mobile), etc.

---

### 2.4 Video Ads

**API LIMITATION: Cannot create Video campaigns via API.** Read-only for reporting.

Ad type enums for reference:
- `VIDEO_AD` -- Generic video ad
- `VIDEO_BUMPER_AD` -- 6-second non-skippable
- `VIDEO_NON_SKIPPABLE_IN_STREAM_AD` -- 15-second non-skippable
- `VIDEO_TRUEVIEW_IN_STREAM_AD` -- Skippable in-stream
- `VIDEO_OUTSTREAM_AD` -- Outstream (auto-play on partner sites)
- `VIDEO_RESPONSIVE_AD` -- Responsive video
- `IN_FEED_VIDEO_AD` -- In-feed (formerly Discovery video)

---

### 2.5 Demand Gen Ads

#### DemandGenMultiAssetAdInfo

Multi-asset ad that serves across YouTube, Discover, Gmail.

| Field | Type | Constraints |
|-------|------|-------------|
| `headlines[]` | `AdTextAsset[]` | Min 1, max 5. Max 40 chars each. |
| `descriptions[]` | `AdTextAsset[]` | Min 1, max 5. Max 90 chars each. |
| `marketing_images[]` | `AdImageAsset[]` | Landscape 1.91:1. |
| `square_marketing_images[]` | `AdImageAsset[]` | Square 1:1. |
| `portrait_marketing_images[]` | `AdImageAsset[]` | Portrait 4:5. |
| `logo_images[]` | `AdImageAsset[]` | Square 1:1, min 128x128. |
| `business_name` | `string` | Required. |
| `call_to_action_text` | `string` | Optional. |
| `lead_form_only` | `bool` | If true, ad is for lead gen only. |

#### DemandGenCarouselAdInfo

Carousel format with swipeable cards.

| Field | Type | Notes |
|-------|------|-------|
| `headline` | `string` | Top-level headline. |
| `description` | `string` | Top-level description. |
| `logo_image` | `AdImageAsset` | Logo for the ad. |
| `business_name` | `string` | Required. |
| `call_to_action_text` | `string` | Optional. |
| `carousel_cards[]` | `AdDemandGenCarouselCardAsset[]` | Min 2, max 10 cards. |

Each `AdDemandGenCarouselCardAsset` contains:
- `marketing_image_asset` (resource name)
- `square_marketing_image_asset` (resource name)
- `portrait_marketing_image_asset` (resource name)
- `headline` (text)
- `call_to_action_text` (text)
- `final_url` (URL for this card)

#### DemandGenVideoResponsiveAdInfo

Video-first ad with text and image fallbacks.

| Field | Type | Notes |
|-------|------|-------|
| `headlines[]` | `AdTextAsset[]` | Text headlines. |
| `long_headlines[]` | `AdTextAsset[]` | Long format headlines. |
| `descriptions[]` | `AdTextAsset[]` | Descriptions. |
| `videos[]` | `AdVideoAsset[]` | YouTube video assets. Required. |
| `logo_images[]` | `AdImageAsset[]` | Logo images. |
| `business_name` | `AdTextAsset` | Required. |
| `call_to_action_text` | `string` | Optional. |

---

### 2.6 App Ads

**Resource:** `Ad.app_ad` -> `AppAdInfo`

| Field | Type | Notes |
|-------|------|-------|
| `headlines[]` | `AdTextAsset[]` | Max 5. Max 30 chars each. |
| `descriptions[]` | `AdTextAsset[]` | Max 5. Max 90 chars each. |
| `images[]` | `AdImageAsset[]` | Optional images. |
| `youtube_videos[]` | `AdVideoAsset[]` | Optional videos. |
| `html5_media_bundles[]` | `AdMediaBundleAsset[]` | Optional HTML5 bundles. |
| `mandatory_ad_text` | `AdTextAsset` | Appears in all ad combinations. |

**Resource:** `Ad.app_engagement_ad` -> `AppEngagementAdInfo` (similar fields)

---

### 2.7 Shopping Product Ad

**Resource:** `Ad.shopping_product_ad` -> `ShoppingProductAdInfo`

This is an **empty message** -- the ad content is entirely generated from the Merchant Center product feed. You just create the `AdGroupAd` linking to the ad group.

---

### 2.8 Smart Campaign Ad

**Resource:** `Ad.smart_campaign_ad` -> `SmartCampaignAdInfo`

| Field | Type | Notes |
|-------|------|-------|
| `headlines[]` | `AdTextAsset[]` | Min 3, max 3. Max 30 chars each. |
| `descriptions[]` | `AdTextAsset[]` | Min 2, max 2. Max 90 chars each. |

---

### AdType Enum (Complete)

```
UNSPECIFIED, UNKNOWN
TEXT_AD, EXPANDED_TEXT_AD
RESPONSIVE_SEARCH_AD
RESPONSIVE_DISPLAY_AD, LEGACY_RESPONSIVE_DISPLAY_AD
IMAGE_AD
HTML5_UPLOAD_AD, DYNAMIC_HTML5_AD
APP_AD, APP_ENGAGEMENT_AD, APP_PRE_REGISTRATION_AD, LEGACY_APP_INSTALL_AD
VIDEO_AD, VIDEO_BUMPER_AD, VIDEO_NON_SKIPPABLE_IN_STREAM_AD,
  VIDEO_OUTSTREAM_AD, VIDEO_TRUEVIEW_IN_STREAM_AD, IN_FEED_VIDEO_AD, VIDEO_RESPONSIVE_AD
SHOPPING_PRODUCT_AD, SHOPPING_SMART_AD, SHOPPING_COMPARISON_LISTING_AD
DEMAND_GEN_MULTI_ASSET_AD, DEMAND_GEN_CAROUSEL_AD,
  DEMAND_GEN_VIDEO_RESPONSIVE_AD, DEMAND_GEN_PRODUCT_AD
CALL_AD
LOCAL_AD
HOTEL_AD
TRAVEL_AD
SMART_CAMPAIGN_AD
```

---

## 3. Extensions / Assets

Google Ads now uses a unified **Asset** system. Individual assets are created once and linked to customers, campaigns, ad groups, or ads via linkage objects.

### Asset Linkage Model

```
Asset (created once, reusable)
  |
  +--> CustomerAsset    (account-level)
  +--> CampaignAsset    (campaign-level)
  +--> AdGroupAsset     (ad group-level)
  +--> AssetSetAsset    (asset set membership)
```

### 3.1 Sitelink Asset

**`AssetType`:** `SITELINK`
**`AssetFieldType`:** `SITELINK`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `link_text` | `string` | Required. Max 25 chars. |
| `description1` | `string` | Max 35 chars. |
| `description2` | `string` | Max 35 chars. |
| `start_date` | `string` | YYYY-MM-DD. Optional. |
| `end_date` | `string` | YYYY-MM-DD. Optional. |
| `ad_schedule_targets[]` | `AdScheduleInfo[]` | Optional. |

The sitelink's landing page is set via the parent `Asset.final_urls[]`.

---

### 3.2 Callout Asset

**`AssetType`:** `CALLOUT`
**`AssetFieldType`:** `CALLOUT`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `callout_text` | `string` | Required. Max 25 chars. |
| `start_date` | `string` | Optional. |
| `end_date` | `string` | Optional. |
| `ad_schedule_targets[]` | `AdScheduleInfo[]` | Optional. |

---

### 3.3 Structured Snippet Asset

**`AssetType`:** `STRUCTURED_SNIPPET`
**`AssetFieldType`:** `STRUCTURED_SNIPPET`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `header` | `string` | Required. Predefined header (e.g., "Brands", "Types", "Styles"). |
| `values[]` | `string[]` | Required. Min 3. Max 25 chars each. |

**Predefined headers:** Amenities, Brands, Courses, Degree programs, Destinations, Featured hotels, Insurance coverage, Models, Neighborhoods, Service catalog, Shows, Styles, Types.

---

### 3.4 Call Asset

**`AssetType`:** `CALL`
**`AssetFieldType`:** `CALL`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `country_code` | `string` | Required. Two-letter country code (e.g., "US"). |
| `phone_number` | `string` | Required. |
| `call_conversion_reporting_state` | enum | `DISABLED`, `USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION`, `USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION` |
| `call_conversion_action` | `string` | Resource name. Required if resource-level reporting. |
| `ad_schedule_targets[]` | `AdScheduleInfo[]` | Optional. |

---

### 3.5 Price Asset

**`AssetType`:** `PRICE`
**`AssetFieldType`:** `PRICE`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | `PriceExtensionType` | `BRANDS`, `EVENTS`, `LOCATIONS`, `NEIGHBORHOODS`, `PRODUCT_CATEGORIES`, `PRODUCT_TIERS`, `SERVICE_CATEGORIES`, `SERVICE_TIERS`, `SERVICES` |
| `price_qualifier` | `PriceExtensionPriceQualifier` | `FROM`, `UP_TO`, `AVERAGE`, `NONE` |
| `language_code` | `string` | BCP 47 code. |
| `price_offerings[]` | `PriceOffering[]` | Min 3, max 8 items. |

Each `PriceOffering`:
- `header` (string, max 25 chars)
- `description` (string, max 25 chars)
- `price` (Money: `amount_micros` + `currency_code`)
- `unit` (PriceExtensionPriceUnit: `PER_HOUR`, `PER_DAY`, `PER_WEEK`, `PER_MONTH`, `PER_YEAR`, `PER_NIGHT`, `NONE`)
- `final_url` (string)
- `final_mobile_url` (string)

---

### 3.6 Promotion Asset

**`AssetType`:** `PROMOTION`
**`AssetFieldType`:** `PROMOTION`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `promotion_target` | `string` | Required. Max 20 chars. What's being promoted. |
| `discount_modifier` | `PromotionExtensionDiscountModifier` | `NONE`, `UP_TO` |
| `percent_off` | `int64` | Percentage discount (mutually exclusive with `money_amount_off`). |
| `money_amount_off` | `Money` | Dollar discount. |
| `promotion_code` | `string` | Optional. Promo code. |
| `orders_over_amount` | `Money` | Optional. Minimum order. |
| `occasion` | `PromotionExtensionOccasion` | `INDEPENDENCE_DAY`, `BLACK_FRIDAY`, `CHRISTMAS`, etc. |
| `language_code` | `string` | BCP 47. |
| `start_date` | `string` | Optional. |
| `end_date` | `string` | Optional. |
| `ad_schedule_targets[]` | `AdScheduleInfo[]` | Optional. |

---

### 3.7 Image Asset

**`AssetType`:** `IMAGE`
**`AssetFieldType`:** `AD_IMAGE`, `MARKETING_IMAGE`, `SQUARE_MARKETING_IMAGE`, `PORTRAIT_MARKETING_IMAGE`, `LOGO`, `LANDSCAPE_LOGO`, `BUSINESS_LOGO`
**Linkage:** `CampaignAsset`, `AdGroupAsset` (varies by field type)
**Mutable:** No (image assets cannot be updated, only created or removed)

| Field | Type | Constraints |
|-------|------|-------------|
| `data` | `bytes` | Raw image data. |
| `file_size` | `int64` | Output only. In bytes. |
| `mime_type` | `MimeType` | `IMAGE_JPEG`, `IMAGE_GIF`, `IMAGE_PNG` |
| `full_size` | `ImageDimension` | `height_pixels`, `width_pixels`, `url` |

---

### 3.8 Lead Form Asset

**`AssetType`:** `LEAD_FORM`
**`AssetFieldType`:** `LEAD_FORM`
**Linkage:** `CampaignAsset` only
**Mutable:** Yes

| Field | Type | Constraints |
|-------|------|-------------|
| `business_name` | `string` | Required. |
| `call_to_action_type` | `LeadFormCallToActionType` | `LEARN_MORE`, `GET_QUOTE`, `APPLY_NOW`, `SIGN_UP`, `CONTACT_US`, `SUBSCRIBE`, `DOWNLOAD`, `BOOK_NOW`, `GET_OFFER`, `REGISTER`, `GET_INFO`, `REQUEST_DEMO`, `JOIN_NOW`, `GET_STARTED` |
| `call_to_action_description` | `string` | Required. Max 30 chars. |
| `headline` | `string` | Required. Max 30 chars. |
| `description` | `string` | Required. Max 200 chars. |
| `privacy_policy_url` | `string` | Required. |
| `fields[]` | `LeadFormField[]` | Form fields (name, email, phone, etc.) |
| `delivery_methods[]` | `LeadFormDeliveryMethod` | Webhook or Google Sheets. |
| `post_submit_headline` | `string` | Thank-you page headline. |
| `post_submit_description` | `string` | Thank-you page description. |
| `post_submit_call_to_action_type` | `LeadFormPostSubmitCallToActionType` | CTA after submission. |
| `background_image_asset` | `string` | Image asset resource name. |
| `desired_intent` | `LeadFormDesiredIntent` | `LOW_INTENT`, `HIGH_INTENT` |
| `custom_disclosure` | `string` | Optional. |

---

### 3.9 Business Name Asset

**`AssetType`:** `TEXT`
**`AssetFieldType`:** `BUSINESS_NAME`
**Linkage:** `CampaignAsset`, `CustomerAsset`
**Mutable:** No

Simply a `TextAsset` with `text` field (max 25 chars), linked with `field_type = BUSINESS_NAME`.

---

### 3.10 Business Logo Asset

**`AssetType`:** `IMAGE`
**`AssetFieldType`:** `BUSINESS_LOGO` (or `LOGO` for asset groups)
**Linkage:** `CampaignAsset`, `CustomerAsset`
**Mutable:** No

An Image asset linked with `field_type = BUSINESS_LOGO`. Square 1:1, min 128x128.

---

### 3.11 Location Asset

**`AssetType`:** `LOCATION`
**`AssetFieldType`:** (linked via `AssetSet`)
**Linkage:** Via `CampaignAssetSet` linking to a `LOCATION_SYNC` asset set

Location assets are synced from Google Business Profile. They cannot be created manually. Linked to campaigns via `AssetSet` -> `CampaignAssetSet`.

---

### 3.12 Mobile App Asset

**`AssetType`:** `MOBILE_APP`
**`AssetFieldType`:** `MOBILE_APP`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

---

### 3.13 Hotel Callout Asset

**`AssetType`:** `HOTEL_CALLOUT`
**`AssetFieldType`:** `HOTEL_CALLOUT`
**Linkage:** `CustomerAsset`, `CampaignAsset`, `AdGroupAsset`
**Mutable:** Yes

---

### AssetType Enum (Complete)

```
UNSPECIFIED, UNKNOWN
TEXT, IMAGE, YOUTUBE_VIDEO, YOUTUBE_VIDEO_LIST, MEDIA_BUNDLE
LEAD_FORM, BOOK_ON_GOOGLE
SITELINK, CALLOUT, STRUCTURED_SNIPPET
CALL, CALL_TO_ACTION
PRICE, PROMOTION
MOBILE_APP, APP_DEEP_LINK
HOTEL_CALLOUT, HOTEL_PROPERTY
LOCATION, BUSINESS_MESSAGE
DEMAND_GEN_CAROUSEL_CARD
PAGE_FEED
DYNAMIC_CUSTOM, DYNAMIC_EDUCATION, DYNAMIC_FLIGHTS,
  DYNAMIC_HOTELS_AND_RENTALS, DYNAMIC_JOBS, DYNAMIC_LOCAL,
  DYNAMIC_REAL_ESTATE, DYNAMIC_TRAVEL
```

### AssetFieldType Enum (Complete)

```
UNSPECIFIED, UNKNOWN
HEADLINE, LONG_HEADLINE
DESCRIPTION, LONG_DESCRIPTION
MANDATORY_AD_TEXT
BUSINESS_NAME, BUSINESS_MESSAGE, BUSINESS_LOGO
MARKETING_IMAGE, SQUARE_MARKETING_IMAGE, PORTRAIT_MARKETING_IMAGE
LOGO, LANDSCAPE_LOGO
AD_IMAGE, LANDING_PAGE_PREVIEW
YOUTUBE_VIDEO
MEDIA_BUNDLE, CUSTOM_LAYOUT
CALL_TO_ACTION, CALL_TO_ACTION_SELECTION
SITELINK, CALLOUT, STRUCTURED_SNIPPET
CALL, MOBILE_APP
HOTEL_CALLOUT, HOTEL_PROPERTY
LEAD_FORM
BOOK_ON_GOOGLE
PRICE, PROMOTION
DEMAND_GEN_CAROUSEL_CARD
SEARCH_THEME
```

---

## 4. Targeting

### Targeting Hierarchy

Criteria can be set at three levels:
1. **Campaign level** (`CampaignCriterion` / `CampaignCriterionService`)
2. **Ad group level** (`AdGroupCriterion` / `AdGroupCriterionService`)
3. **Customer (account) level** (`CustomerNegativeCriterion` / `CustomerNegativeCriterionService`) -- **negatives only**

### Complete Criteria Type Reference

| Criterion Type | Positive? | Negative? | Campaign | Ad Group | Customer | Notes |
|---------------|-----------|-----------|----------|----------|----------|-------|
| **`AD_SCHEDULE`** | Yes | No | Yes | - | - | Day/time targeting |
| **`AGE_RANGE`** | Yes | Yes | Yes | Yes | - | Demographic |
| **`APP_PAYMENT_MODEL`** | Yes | No | - | Yes | - | App campaigns |
| **`AUDIENCE`** | Yes | No | - | Yes | - | Demand Gen only |
| **`BRAND`** | Yes | No | - | Yes | - | |
| **`BRAND_LIST`** | Yes | Yes | Yes | Yes | - | |
| **`CARRIER`** | Yes | No | Yes | - | - | Mobile carrier |
| **`COMBINED_AUDIENCE`** | Yes | Yes | Yes | Yes | - | AND/OR audience combos |
| **`CONTENT_LABEL`** | - | Yes | Yes | - | Yes | Category exclusion |
| **`CUSTOM_AFFINITY`** | Yes | No | Yes | Yes | - | Custom affinity audiences |
| **`CUSTOM_AUDIENCE`** | Yes | Yes | Yes | Yes | - | Custom intent/affinity |
| **`CUSTOM_INTENT`** | Yes | No | - | Yes | - | |
| **`DEVICE`** | Yes | No | Yes | - | - | Bid adjustments only |
| **`GENDER`** | Yes | Yes | Yes | Yes | - | Demographic |
| **`INCOME_RANGE`** | Yes | Yes | Yes | Yes | - | Demographic |
| **`IP_BLOCK`** | - | Yes | Yes | - | - | IP exclusion |
| **`KEYWORD`** | Yes | Yes | - | Yes | Yes | Search/Display keywords |
| **`KEYWORD_THEME`** | Yes | Yes | Yes | - | - | Smart campaigns |
| **`LANGUAGE`** | Yes | No | Yes | Yes | - | |
| **`LIFE_EVENT`** | Yes | No | - | Yes | - | |
| **`LISTING_GROUP`** | Yes | No | - | Yes | - | Shopping product groups |
| **`LISTING_SCOPE`** | Yes | No | Yes | - | - | Shopping campaign scope |
| **`LOCAL_SERVICE_ID`** | Yes | No | Yes | - | - | Local Services |
| **`LOCATION`** | Yes | Yes | Yes | - | - | Geo targeting by ID |
| **`LOCATION_GROUP`** | Yes | Yes | Yes | - | - | Radius targeting |
| **`MOBILE_APPLICATION`** | - | Yes | Yes | - | - | App exclusion |
| **`MOBILE_APP_CATEGORY`** | - | Yes | Yes | - | - | App category exclusion |
| **`MOBILE_DEVICE`** | Yes | No | Yes | - | - | Specific devices |
| **`NEGATIVE_KEYWORD_LIST`** | - | Yes | Yes | - | - | Shared set link |
| **`OPERATING_SYSTEM_VERSION`** | Yes | No | Yes | - | - | OS targeting |
| **`PARENTAL_STATUS`** | Yes | Yes | Yes | Yes | - | Demographic |
| **`PLACEMENT`** | Yes | Yes | Yes | Yes | Yes | Websites/apps/YouTube |
| **`PLACEMENT_LIST`** | - | Yes | Yes | - | - | Shared placement list |
| **`PROXIMITY`** | Yes | No | Yes | - | - | Radius around a point |
| **`SEARCH_THEME`** | Yes | No | - | Yes | - | PMax search themes |
| **`TOPIC`** | Yes | Yes | Yes | Yes | - | Display topics |
| **`USER_INTEREST`** | Yes | Yes | Yes | Yes | - | In-market/affinity |
| **`USER_LIST`** | Yes | Yes | Yes | Yes | Yes | Remarketing lists |
| **`WEBPAGE`** | Yes | Yes | Yes | Yes | - | DSA page targeting |
| **`YOUTUBE_CHANNEL`** | - | Yes | Yes | - | - | Channel exclusion |
| **`YOUTUBE_VIDEO`** | - | Yes | Yes | - | - | Video exclusion |

### 4.1 Location (Geo) Targeting

**Resource:** `LocationInfo`

| Field | Type | Notes |
|-------|------|-------|
| `geo_target_constant` | `string` | Resource name: `geoTargetConstants/{criterionId}`. Required. |

Lookup geo target constants via `GeoTargetConstantService.SuggestGeoTargetConstants` with location names.

**Common IDs:** US=2840, UK=2826, Germany=2276, Canada=2124, Australia=2036.

**Radius targeting** uses `ProximityInfo`:

| Field | Type | Notes |
|-------|------|-------|
| `geo_point` | `GeoPointInfo` | `latitude_in_micro_degrees`, `longitude_in_micro_degrees` |
| `radius` | `double` | Distance. |
| `radius_units` | `ProximityRadiusUnits` | `MILES` or `KILOMETERS` |
| `address` | `AddressInfo` | Alternative to geo_point. |

**GeoTargetTypeSetting (campaign level):**

| Field | Type | Notes |
|-------|------|-------|
| `positive_geo_target_type` | enum | `PRESENCE_OR_INTEREST` (default), `SEARCH_INTEREST`, `PRESENCE` |
| `negative_geo_target_type` | enum | `PRESENCE_OR_INTEREST` (default), `PRESENCE` |

### 4.2 Language Targeting

**Resource:** `LanguageInfo`

| Field | Type | Notes |
|-------|------|-------|
| `language_constant` | `string` | Resource name: `languageConstants/{criterionId}`. |

**Common IDs:** English=1000, German=1001, French=1002, Spanish=1003, Japanese=1005.

### 4.3 Device Targeting

**Resource:** `DeviceInfo`

| Field | Type | Notes |
|-------|------|-------|
| `type` | `Device` | `MOBILE`, `TABLET`, `DESKTOP`, `CONNECTED_TV`, `OTHER` |

Device targeting uses **bid adjustments** (modifier), not inclusion/exclusion. Set via `CampaignCriterion.bid_modifier` (e.g., 1.2 = +20%, 0 = exclude).

### 4.4 Ad Schedule (Day Parting)

**Resource:** `AdScheduleInfo`

| Field | Type | Notes |
|-------|------|-------|
| `day_of_week` | `DayOfWeek` | `MONDAY` through `SUNDAY` |
| `start_hour` | `int32` | 0-23 |
| `start_minute` | `MinuteOfHour` | `ZERO`, `FIFTEEN`, `THIRTY`, `FORTY_FIVE` |
| `end_hour` | `int32` | 0-24 (24 = midnight end) |
| `end_minute` | `MinuteOfHour` | Same options. |

Supports bid adjustments via `CampaignCriterion.bid_modifier`.

### 4.5 Audience Targeting

**Audiences** (`AudienceInfo`): Used for Demand Gen. Intersects segments + dimensions.

**Audience Segments** (`UserListInfo`, `UserInterestInfo`, `CustomAudienceInfo`): Used across campaign types.

| Segment Type | Resource | Notes |
|-------------|----------|-------|
| Remarketing lists | `UserListInfo` -> `user_list` resource name | Website visitors, app users, YouTube viewers |
| Customer Match | `UserListInfo` (CRM upload) | Email, phone, address matching |
| In-market | `UserInterestInfo` -> `user_interest_category` | Predefined interest categories |
| Affinity | `UserInterestInfo` -> `user_interest_category` | Predefined affinity categories |
| Custom audiences | `CustomAudienceInfo` -> `custom_audience` | Keywords + URLs you define |
| Combined audiences | `CombinedAudienceInfo` -> `combined_audience` | AND/OR logic between segments |
| Lookalike audiences | Available for Demand Gen only | Similar to existing audiences |
| Similar segments | Deprecated (sunset 2023) | Replaced by optimized targeting |

### 4.6 Demographic Targeting

| Criterion | Enum Values |
|-----------|-------------|
| `AgeRangeInfo.type` | `AGE_RANGE_18_24`, `AGE_RANGE_25_34`, `AGE_RANGE_35_44`, `AGE_RANGE_45_54`, `AGE_RANGE_55_64`, `AGE_RANGE_65_UP`, `AGE_RANGE_UNDETERMINED` |
| `GenderInfo.type` | `MALE`, `FEMALE`, `UNDETERMINED` |
| `ParentalStatusInfo.type` | `PARENT`, `NOT_A_PARENT`, `UNDETERMINED` |
| `IncomeRangeInfo.type` | `INCOME_RANGE_0_50` (lower 50%), `INCOME_RANGE_50_60`, `INCOME_RANGE_60_70`, `INCOME_RANGE_70_80`, `INCOME_RANGE_80_90`, `INCOME_RANGE_90_100` (top 10%), `INCOME_RANGE_UNDETERMINED` |

### 4.7 Topic Targeting (Display/Video)

**Resource:** `TopicInfo`

| Field | Type | Notes |
|-------|------|-------|
| `topic_constant` | `string` | Resource name: `topicConstants/{verticalId}` |
| `path[]` | `string[]` | Output only. Category path. |

### 4.8 Placement Targeting (Display/Video)

**Resource:** `PlacementInfo`

| Field | Type | Notes |
|-------|------|-------|
| `url` | `string` | Website URL, app, or YouTube channel. |

### 4.9 Keyword (Content) Targeting (Display)

Same `KeywordInfo` resource as Search but used for contextual targeting on Display.

| Field | Type | Notes |
|-------|------|-------|
| `text` | `string` | Keyword text. |
| `match_type` | `KeywordMatchType` | `BROAD`, `PHRASE`, `EXACT` |

### 4.10 Dynamic Search Ad Targets

**Resource:** `WebpageInfo`

| Field | Type | Notes |
|-------|------|-------|
| `criterion_name` | `string` | User-defined name. |
| `conditions[]` | `WebpageConditionInfo[]` | Rules for URL/page matching. |

Each `WebpageConditionInfo`:
- `operand`: `URL`, `CATEGORY`, `PAGE_TITLE`, `PAGE_CONTENT`, `CUSTOM_LABEL`
- `operator`: `EQUALS`, `CONTAINS`
- `argument`: The value to match

---

## 5. Bidding Strategies

### Standard vs Portfolio

- **Standard:** Set directly on the campaign via the `campaign_bidding_strategy` union field. Single campaign only.
- **Portfolio:** Created as standalone `BiddingStrategy` resource via `BiddingStrategyService`. Shared across multiple campaigns. Campaign links via `campaign.bidding_strategy` resource name.

### BiddingStrategyType Enum (Complete)

| Enum Value | Campaign Field | Parameters | Campaign Types |
|-----------|---------------|------------|----------------|
| **`MANUAL_CPC`** | `campaign.manual_cpc` | `enhanced_cpc_enabled` (bool) | Search, Display, Shopping |
| **`MANUAL_CPM`** | `campaign.manual_cpm` | (none) | Display |
| **`MANUAL_CPV`** | `campaign.manual_cpv` | (none) | Video (read-only) |
| **`MANUAL_CPA`** | `campaign.manual_cpa` | (none) | Rare, specific scenarios |
| **`ENHANCED_CPC`** | `campaign.manual_cpc` | `enhanced_cpc_enabled = true` | Search, Display, Shopping |
| **`MAXIMIZE_CLICKS`** / **`TARGET_SPEND`** | `campaign.target_spend` | `cpc_bid_ceiling_micros` (int64, optional) | Search, Display, Demand Gen |
| **`MAXIMIZE_CONVERSIONS`** | `campaign.maximize_conversions` | `target_cpa_micros` (int64, optional = Target CPA) | Search, Display, PMax, Demand Gen, App |
| **`MAXIMIZE_CONVERSION_VALUE`** | `campaign.maximize_conversion_value` | `target_roas` (double, optional = Target ROAS) | Search, Display, PMax, Shopping, Demand Gen |
| **`TARGET_CPA`** | `campaign.target_cpa` | `target_cpa_micros` (int64, required) | Search, Display, App |
| **`TARGET_ROAS`** | `campaign.target_roas` | `target_roas` (double, required. e.g., 3.5 = 350%) | Search, Display, Shopping |
| **`TARGET_IMPRESSION_SHARE`** | `campaign.target_impression_share` | `location` (enum), `location_fraction_micros` (int64), `cpc_bid_ceiling_micros` (int64) | Search only |
| **`TARGET_CPM`** | `campaign.target_cpm` | (none, auto-optimized) | Display, Video (read-only) |
| **`TARGET_CPV`** | (Video only) | (auto-optimized CPV) | Video (read-only) |
| **`COMMISSION`** | `campaign.commission` | `commission_rate_micros` (int64) | Hotel campaigns |
| **`FIXED_CPM`** | `campaign.fixed_cpm` | (fixed CPM amount) | Display, Video |
| **`FIXED_SHARE_OF_VOICE`** | - | Fixed cost per day or CPM | YouTube Sponsorships |
| **`PERCENT_CPC`** | `campaign.percent_cpc` | `cpc_bid_ceiling_micros`, `enhanced_cpc_enabled` | Shopping |
| **`PAGE_ONE_PROMOTED`** | - | **Deprecated** | - |
| **`TARGET_OUTRANK_SHARE`** | - | **Deprecated** | - |

### Target Impression Share Details

| Field | Type | Notes |
|-------|------|-------|
| `location` | `TargetImpressionShareLocation` | `ANYWHERE_ON_PAGE` (2), `TOP_OF_PAGE` (3), `ABSOLUTE_TOP_OF_PAGE` (4) |
| `location_fraction_micros` | `int64` | Target % in micros (e.g., 900000 = 90%) |
| `cpc_bid_ceiling_micros` | `int64` | Max CPC cap in micros. |

### Bidding Strategy by Campaign Type

| Campaign Type | Available Strategies |
|--------------|---------------------|
| **Search** | Manual CPC, Enhanced CPC, Maximize Clicks, Maximize Conversions, Maximize Conversion Value, Target CPA, Target ROAS, Target Impression Share |
| **Display** | Manual CPC, Manual CPM, Enhanced CPC, Maximize Clicks, Maximize Conversions, Target CPA, Target ROAS, vCPM |
| **PMax** | Maximize Conversions (+ optional target CPA), Maximize Conversion Value (+ optional target ROAS) |
| **Shopping** | Manual CPC, Enhanced CPC, Maximize Clicks, Target ROAS, Maximize Conversion Value |
| **Video** | Target CPV, Target CPM, Maximize Conversions, Target CPA (read-only via API) |
| **Demand Gen** | Maximize Clicks, Maximize Conversions, Target CPA, Target ROAS |
| **App** | Target CPA, Maximize Conversions, Target ROAS |
| **Smart** | Automated (no user control) |
| **Local** | Maximize Conversions (automated) |

### Important Notes

- **`MAXIMIZE_CLICKS` = `TARGET_SPEND` in the API.** The bidding_strategy_type enum reports `TARGET_SPEND`, but the campaign field is `campaign.target_spend`. Some SDKs expose it as `MAXIMIZE_CLICKS`.
- **`TARGET_CPA` is now a parameter on `MAXIMIZE_CONVERSIONS`.** Set `campaign.maximize_conversions.target_cpa_micros`. The standalone `TARGET_CPA` enum still exists for backwards compatibility.
- **`TARGET_ROAS` is now a parameter on `MAXIMIZE_CONVERSION_VALUE`.** Set `campaign.maximize_conversion_value.target_roas`. Same backwards compatibility note.
- **Micros convention:** All monetary values in micros (value x 1,000,000). E.g., $2.50 = 2500000.
- **`explicitly_shared` on CampaignBudget:** Must be `false` for Maximize Conversions bidding. Shared budgets are incompatible with automated bidding.

---

## 6. Conversion Tracking

### 6.1 Conversion Actions

**Resource:** `ConversionAction`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Required. Must be unique. |
| `type` | `ConversionActionType` | How conversions are tracked. |
| `category` | `ConversionActionCategory` | Business meaning of the conversion. |
| `status` | `ConversionActionStatus` | `ENABLED`, `REMOVED`, `HIDDEN` |
| `counting_type` | `ConversionActionCountingType` | `ONE_PER_CLICK`, `MANY_PER_CLICK` (default) |
| `attribution_model_settings` | `AttributionModelSettings` | Attribution model config. |
| `value_settings` | `ValueSettings` | `default_value`, `always_use_default_value`, `currency_code` |
| `primary_for_goal` | `bool` | Whether this action is primary for its goal. Affects bidding + Conversions column. |
| `click_through_lookback_window_days` | `int32` | 1-30 (most types) or 1-60 (call types). |
| `view_through_lookback_window_days` | `int32` | View-through attribution window. |
| `tag_snippets[]` | Output only | Generated tracking code. |
| `app_id` | `string` | Immutable. For app conversions only. |

### ConversionActionType Enum

| Enum | Description |
|------|-------------|
| `AD_CALL` | Clicks on ad call extension |
| `CLICK_TO_CALL` | Mobile click-to-call |
| `GOOGLE_PLAY_DOWNLOAD` | App install from Play Store |
| `GOOGLE_PLAY_IN_APP_PURCHASE` | In-app purchase |
| `UPLOAD_CLICKS` | Offline conversion import (by click) |
| `UPLOAD_CALLS` | Offline conversion import (by call) |
| `WEBPAGE` | Website tag conversion |
| `WEBSITE_CALL` | Calls from website (forwarding number) |
| `STORE_SALES_DIRECT_UPLOAD` | Offline store sales data |
| `STORE_SALES` | Store sales (modeled) |
| `FIREBASE_ANDROID_FIRST_OPEN` | Android first open |
| `FIREBASE_ANDROID_IN_APP_PURCHASE` | Android IAP |
| `FIREBASE_ANDROID_CUSTOM` | Custom Android event |
| `FIREBASE_IOS_FIRST_OPEN` | iOS first open |
| `FIREBASE_IOS_IN_APP_PURCHASE` | iOS IAP |
| `FIREBASE_IOS_CUSTOM` | Custom iOS event |
| `GOOGLE_ANALYTICS_4_CUSTOM` | GA4 custom event |
| `GOOGLE_ANALYTICS_4_PURCHASE` | GA4 purchase event |
| `GOOGLE_HOSTED` | Google-hosted actions (read-only) |
| `FLOODLIGHT_ACTION` | Floodlight activity (read-only) |
| `FLOODLIGHT_TRANSACTION` | Floodlight transaction (read-only) |
| `GOOGLE_ATTRIBUTION` | Google Attribution (read-only) |
| `STORE_VISIT` | Store visit (read-only, estimated) |
| `ANDROID_APP_PRE_REGISTRATION` | Play Store pre-registration (read-only) |
| `ANDROID_INSTALLS_ALL_OTHER_APPS` | All other Play downloads (read-only) |
| `SALESFORCE` | Salesforce import |
| `SEARCH_ADS_360` | SA360 import |
| `SMART_CAMPAIGN_AD_CLICKS_TO_CALL` | Smart campaign call clicks |
| `SMART_CAMPAIGN_MAP_CLICKS_TO_CALL` | Smart campaign map clicks |
| `SMART_CAMPAIGN_MAP_DIRECTIONS` | Smart campaign directions |
| `SMART_CAMPAIGN_TRACKED_CALLS` | Smart campaign tracked calls |

### ConversionActionCategory Enum

| Enum | Description |
|------|-------------|
| `DEFAULT` | Default category |
| `PAGE_VIEW` | Page view |
| `PURCHASE` | Purchase/sale |
| `SIGNUP` | Sign-up |
| `DOWNLOAD` | App/software download |
| `ADD_TO_CART` | Cart addition |
| `BEGIN_CHECKOUT` | Checkout started |
| `CONTACT` | Call/SMS/email/chat |
| `SUBMIT_LEAD_FORM` | Lead form submission |
| `BOOK_APPOINTMENT` | Appointment booking |
| `REQUEST_QUOTE` | Quote request |
| `GET_DIRECTIONS` | Location/directions search |
| `OUTBOUND_CLICK` | Click to partner site |
| `PHONE_CALL_LEAD` | Phone lead |
| `IMPORTED_LEAD` | Imported lead |
| `QUALIFIED_LEAD` | Qualified lead (sales-verified) |
| `CONVERTED_LEAD` | Converted lead (completed stage) |
| `STORE_VISIT` | In-store visit |
| `STORE_SALE` | In-store sale |
| `ENGAGEMENT` | Engagement (GA Smart Goal, etc.) |

### 6.2 Attribution Models

**Only two models are supported** (all others deprecated since 2023):

| Enum | Notes |
|------|-------|
| `GOOGLE_ADS_LAST_CLICK` | Credit to last-clicked ad. |
| `GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN` | **Default.** Data-driven model using ML. |

Deprecated models (setting these returns `CANNOT_SET_RULE_BASED_ATTRIBUTION_MODELS` error):
- `FIRST_CLICK`, `LINEAR`, `TIME_DECAY`, `POSITION_BASED`

### 6.3 Conversion Goals

**Resources:** `CustomerConversionGoal`, `CampaignConversionGoal`

Goals are auto-created from unique `(category, origin)` pairs of conversion actions.

| Field | Type | Notes |
|-------|------|-------|
| `category` | `ConversionActionCategory` | The goal category. |
| `origin` | `ConversionOrigin` | `WEBSITE`, `APP`, `PHONE_CALL`, `IMPORT`, `GOOGLE_HOSTED`, `STORE` |

**Campaign goals override customer (account-level) goals.** Set `CampaignConversionGoal.biddable = true/false` to include/exclude specific goals from bidding for a campaign.

The `primary_for_goal` field on each `ConversionAction` determines whether it's primary (used for bidding and reported in the Conversions column) or secondary (reported in "All conversions" only).

---

## 7. Account-Level Features

### 7.1 Shared Negative Keyword Lists

**Workflow:**
1. Create `SharedSet` (type = `NEGATIVE_KEYWORDS`)
2. Add `SharedCriterion` entries (keywords) to the set
3. Link to campaigns via `CampaignSharedSet`

**SharedSet resource:**

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Required. |
| `type` | `SharedSetType` | `NEGATIVE_KEYWORDS`, `NEGATIVE_PLACEMENTS`, `ACCOUNT_LEVEL_NEGATIVE_KEYWORDS`, `BRAND_HINT` |
| `status` | `SharedSetStatus` | `ENABLED`, `REMOVED` |
| `member_count` | `int64` | Output only. Number of criteria. |
| `reference_count` | `int64` | Output only. Number of campaigns using it. |

**SharedCriterion for keywords:**

| Field | Type | Notes |
|-------|------|-------|
| `shared_set` | `string` | Resource name of the SharedSet. |
| `keyword` | `KeywordInfo` | `text` + `match_type` (`BROAD`, `PHRASE`, `EXACT`) |

**CampaignSharedSet link:**

| Field | Type | Notes |
|-------|------|-------|
| `campaign` | `string` | Campaign resource name. |
| `shared_set` | `string` | SharedSet resource name. |

**Account-level negative keywords** use `SharedSetType.ACCOUNT_LEVEL_NEGATIVE_KEYWORDS` and are attached via `CustomerNegativeCriterion`.

**Shared Negative Placement Lists** use `SharedSetType.NEGATIVE_PLACEMENTS` with `PlacementInfo` criteria.

### 7.2 Shared Budgets

**Resource:** `CampaignBudget`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Required for shared budgets. |
| `amount_micros` | `int64` | Daily budget in micros. |
| `delivery_method` | `BudgetDeliveryMethod` | `STANDARD` (default), `ACCELERATED` |
| `explicitly_shared` | `bool` | `true` = shared budget (multiple campaigns). Must be `false` for automated bidding. |
| `total_amount_micros` | `int64` | Campaign total budget (Demand Gen). |
| `period` | `BudgetPeriod` | `DAILY` (default), `CUSTOM` (for total budget). |
| `status` | `BudgetStatus` | Output only. `ENABLED`, `REMOVED`. |
| `reference_count` | `int64` | Output only. Number of campaigns using it. |

**Shared budget constraint:** Cannot use `explicitly_shared = true` with Maximize Conversions or other Smart Bidding strategies. Results in "Bidding strategy type is incompatible with shared budget" error.

### 7.3 Customer Match User Lists

**Resource:** `UserList`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Required. |
| `membership_status` | `UserListMembershipStatus` | `OPEN`, `CLOSED` |
| `crm_based_user_list` | `CrmBasedUserListInfo` | For Customer Match. |
| `membership_life_span` | `int64` | Days (max 540, or 10000 for unlimited). |

**CrmBasedUserListInfo fields:**

| Field | Type | Notes |
|-------|------|-------|
| `upload_key_type` | `CustomerMatchUploadKeyType` | `CONTACT_INFO`, `CRM_ID`, `MOBILE_ADVERTISING_ID` |
| `data_source_type` | `UserListCrmDataSourceType` | `FIRST_PARTY`, `THIRD_PARTY_CREDIT_BUREAU`, `THIRD_PARTY_VOTER_FILE` |

**Upload flow:**
1. Create `UserList` with `crm_based_user_list`
2. Create `OfflineUserDataJob` with `type = CUSTOMER_MATCH_USER_LIST`
3. Add `UserDataOperation` entries with `UserData` (emails, phones, addresses -- all SHA256 hashed)
4. Run the job via `RunOfflineUserDataJob`
5. Poll job status until complete
6. Target via `UserListInfo` criterion

**Important (April 2026 change):** `OfflineUserDataJobService` and `UserDataService` will fail for new Customer Match integrations. Use the Data Manager API instead.

### 7.4 Remarketing Lists

Remarketing lists collect users based on:
- **Website visitors** (via Google tag)
- **App users** (via Firebase)
- **YouTube viewers** (via linked channel)
- **Customer Match** (CRM upload, see above)
- **Combined lists** (`logical_user_list` with AND/OR/NOT rules)

All are `UserList` resources targeted via `UserListInfo` criterion.

### 7.5 Conversion Tracking Setup

See Section 6. Key steps:
1. Check `Customer.conversion_tracking_setting` for current state
2. Create `ConversionAction` to enable tracking
3. Install tag snippet on website (from `tag_snippets[]`)
4. Configure consent (`ClickConversion.consent` or account-level defaults)

**Cross-account tracking:** Manager accounts can manage conversion actions for client accounts. Check `conversion_tracking_setting.google_ads_conversion_customer` for the conversion owner account.

---

## 8. Resource Hierarchy Summary

```
Customer (Account)
├── CampaignBudget (shared or dedicated)
├── BiddingStrategy (portfolio, shared)
├── SharedSet (negative keywords, placements)
│   ├── SharedCriterion (the keywords/placements)
│   └── CampaignSharedSet (link to campaigns)
├── UserList (remarketing, customer match)
├── ConversionAction
├── Asset (reusable across campaigns)
│   ├── CustomerAsset (account-level link)
│   └── AssetSet → AssetSetAsset
├── CustomerNegativeCriterion (account-level negatives)
│
├── Campaign
│   ├── CampaignCriterion (location, language, schedule, device bids)
│   ├── CampaignAsset (sitelinks, callouts, etc.)
│   ├── CampaignSharedSet (negative keyword lists)
│   ├── CampaignAssetSet (location sync, page feeds)
│   ├── CampaignConversionGoal
│   │
│   ├── [Search/Display/Shopping/DemandGen/App/Smart] Ad Group
│   │   ├── AdGroupCriterion (keywords, audiences, placements, topics)
│   │   ├── AdGroupAsset (ad-group-level extensions)
│   │   ├── AdGroupAd
│   │   │   └── Ad (RSA, RDA, Image, DemandGen, App, Shopping, Smart, etc.)
│   │   └── [Shopping] ListingGroupFilterDimension (product partitions)
│   │
│   └── [PMax only] AssetGroup
│       ├── AssetGroupAsset (headlines, descriptions, images, videos)
│       ├── AssetGroupSignal (audience signals)
│       └── AssetGroupListingGroupFilter (product partitions for retail)
```

### Key API Services

| Service | Purpose |
|---------|---------|
| `CampaignService` | CRUD campaigns |
| `CampaignBudgetService` | CRUD budgets |
| `CampaignCriterionService` | Campaign-level targeting |
| `AdGroupService` | CRUD ad groups |
| `AdGroupCriterionService` | Ad group-level targeting |
| `AdGroupAdService` | CRUD ads |
| `AssetService` | Create assets |
| `AssetGroupService` | PMax asset groups |
| `AssetGroupAssetService` | Link assets to asset groups |
| `SharedSetService` | CRUD shared sets |
| `SharedCriterionService` | Add criteria to shared sets |
| `CampaignSharedSetService` | Link shared sets to campaigns |
| `ConversionActionService` | CRUD conversion actions |
| `BiddingStrategyService` | Portfolio bidding strategies |
| `CustomerNegativeCriterionService` | Account-level negatives |
| `OfflineUserDataJobService` | Customer Match uploads |
| `GoogleAdsService.Mutate` | Batch operations across services |
| `GoogleAdsService.Search` / `.SearchStream` | GAQL queries |
| `GeoTargetConstantService` | Geo location lookups |
| `SmartCampaignSuggestService` | Smart campaign suggestions |

### Mutate Operations Pattern

All write operations use `MutateOperation` wrappers sent via `GoogleAdsService.Mutate`:

```
MutateOperation {
  campaign_operation: { create/update/remove }
  ad_group_operation: { create/update/remove }
  ad_group_ad_operation: { create/update/remove }
  campaign_criterion_operation: { create/update/remove }
  ...etc for every resource type
}
```

**Temporary resource names** enable creating dependent resources in a single request:
- Format: `customers/{customer_id}/{resource_type}/{negative_temp_id}`
- Example: `customers/123/campaigns/-1` (temporary ID -1)
- Referenced by other operations in the same batch

---

## Sources

- [Campaigns Overview](https://developers.google.com/google-ads/api/docs/campaigns/overview)
- [AdvertisingChannelType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/AdvertisingChannelTypeEnum.AdvertisingChannelType)
- [AdvertisingChannelSubType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/AdvertisingChannelSubTypeEnum.AdvertisingChannelSubType)
- [Portfolio and Standard Bidding Strategies](https://developers.google.com/google-ads/api/docs/campaigns/bidding/assign-strategies)
- [BiddingStrategyType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/BiddingStrategyTypeEnum.BiddingStrategyType)
- [Assets Overview](https://developers.google.com/google-ads/api/docs/assets/overview)
- [AssetType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/AssetTypeEnum.AssetType)
- [AssetFieldType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/AssetFieldTypeEnum.AssetFieldType)
- [Performance Max Overview](https://developers.google.com/google-ads/api/docs/performance-max/overview)
- [Performance Max Asset Groups](https://developers.google.com/google-ads/api/performance-max/asset-groups)
- [Performance Max Asset Requirements](https://developers.google.com/google-ads/api/performance-max/asset-requirements)
- [Shopping Ads](https://developers.google.com/google-ads/api/docs/shopping-ads/overview)
- [Create Shopping Campaign](https://developers.google.com/google-ads/api/docs/shopping-ads/create-campaign)
- [Video Campaigns](https://developers.google.com/google-ads/api/docs/video/overview)
- [Demand Gen Overview](https://developers.google.com/google-ads/api/docs/demand-gen/overview)
- [Create Demand Gen Campaign](https://developers.google.com/google-ads/api/docs/demand-gen/create-campaign)
- [Demand Gen Audience Targeting](https://developers.google.com/google-ads/api/docs/demand-gen/audience-targeting)
- [App Campaigns](https://developers.google.com/google-ads/api/docs/app-campaigns/overview)
- [Smart Campaigns](https://developers.google.com/google-ads/api/docs/smart-campaigns/overview)
- [Targeting Criteria](https://developers.google.com/google-ads/api/docs/targeting/criteria)
- [CriterionType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/CriterionTypeEnum.CriterionType)
- [Conversion Management](https://developers.google.com/google-ads/api/docs/conversions/overview)
- [Create Conversion Actions](https://developers.google.com/google-ads/api/docs/conversions/create-conversion-actions)
- [Conversion Goals](https://developers.google.com/google-ads/api/docs/conversions/goals/overview)
- [ConversionActionType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/ConversionActionTypeEnum.ConversionActionType)
- [ConversionActionCategory Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/ConversionActionCategoryEnum.ConversionActionCategory)
- [Campaign Resource](https://developers.google.com/google-ads/api/reference/rpc/v23/Campaign)
- [ResponsiveSearchAdInfo](https://developers.google.com/google-ads/api/reference/rpc/v23/ResponsiveSearchAdInfo)
- [ResponsiveDisplayAdInfo](https://developers.google.com/google-ads/api/reference/rpc/v23/ResponsiveDisplayAdInfo)
- [AdType Enum](https://developers.google.com/google-ads/api/reference/rpc/v23/AdTypeEnum.AdType)
- [Shared Sets](https://developers.google.com/google-ads/api/docs/targeting/shared-sets)
- [Audience Management](https://developers.google.com/google-ads/api/docs/remarketing/overview)
- [Customer Match](https://developers.google.com/google-ads/api/docs/remarketing/audience-segments/customer-match)
