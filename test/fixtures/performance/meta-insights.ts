/**
 * Mock Meta Insights API responses for performance fetch tests.
 *
 * All values are strings — Meta's Graph API returns numeric fields as strings.
 */

export type MetaInsightsRow = {
  readonly campaign_id: string
  readonly campaign_name: string
  readonly adset_id?: string
  readonly adset_name?: string
  readonly ad_id?: string
  readonly ad_name?: string
  readonly impressions: string
  readonly clicks: string
  readonly spend: string
  readonly actions?: readonly { readonly action_type: string; readonly value: string }[]
  readonly action_values?: readonly { readonly action_type: string; readonly value: string }[]
  readonly cpm: string
  readonly frequency: string
  readonly reach: string
  readonly date_start: string
  readonly date_stop: string
  // Breakdown fields
  readonly age?: string
  readonly gender?: string
  readonly publisher_platform?: string
  readonly platform_position?: string
}

// ---------------------------------------------------------------------------
// Campaign-level insights
// ---------------------------------------------------------------------------

export const campaignInsightsResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '15000',
    clicks: '450',
    spend: '600.00',
    actions: [
      { action_type: 'link_click', value: '400' },
      { action_type: 'offsite_conversion', value: '30' },
      { action_type: 'landing_page_view', value: '380' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '1800.00' },
    ],
    cpm: '40.00',
    frequency: '2.5',
    reach: '6000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
  },
  {
    campaign_id: '222',
    campaign_name: 'Prospecting Campaign',
    impressions: '50000',
    clicks: '1000',
    spend: '2000.00',
    actions: [
      { action_type: 'offsite_conversion', value: '80' },
      { action_type: 'link_click', value: '950' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '4000.00' },
    ],
    cpm: '40.00',
    frequency: '1.2',
    reach: '41667',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
  },
]

// ---------------------------------------------------------------------------
// Ad set-level insights
// ---------------------------------------------------------------------------

export const adSetInsightsResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    adset_id: '1001',
    adset_name: 'Website Visitors 30d',
    impressions: '10000',
    clicks: '300',
    spend: '400.00',
    actions: [
      { action_type: 'offsite_conversion', value: '20' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '1200.00' },
    ],
    cpm: '40.00',
    frequency: '2.0',
    reach: '5000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    adset_id: '1002',
    adset_name: 'Cart Abandoners',
    impressions: '5000',
    clicks: '150',
    spend: '200.00',
    actions: [
      { action_type: 'offsite_conversion', value: '10' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '600.00' },
    ],
    cpm: '40.00',
    frequency: '3.0',
    reach: '1667',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
  },
]

// ---------------------------------------------------------------------------
// Ad-level insights
// ---------------------------------------------------------------------------

export const adInsightsResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    adset_id: '1001',
    adset_name: 'Website Visitors 30d',
    ad_id: '9001',
    ad_name: 'Dynamic Product Ad',
    impressions: '10000',
    clicks: '300',
    spend: '400.00',
    actions: [
      { action_type: 'offsite_conversion', value: '20' },
    ],
    action_values: [
      { action_type: 'offsite_conversion', value: '1200.00' },
    ],
    cpm: '40.00',
    frequency: '2.0',
    reach: '5000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
  },
]

// ---------------------------------------------------------------------------
// Daily breakdown (time_increment=1)
// ---------------------------------------------------------------------------

export const dailyInsightsResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '2000',
    clicks: '60',
    spend: '80.00',
    actions: [{ action_type: 'offsite_conversion', value: '4' }],
    action_values: [{ action_type: 'offsite_conversion', value: '240.00' }],
    cpm: '40.00',
    frequency: '1.5',
    reach: '1333',
    date_start: '2026-03-11',
    date_stop: '2026-03-11',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '2500',
    clicks: '75',
    spend: '100.00',
    actions: [{ action_type: 'offsite_conversion', value: '5' }],
    action_values: [{ action_type: 'offsite_conversion', value: '300.00' }],
    cpm: '40.00',
    frequency: '1.8',
    reach: '1389',
    date_start: '2026-03-12',
    date_stop: '2026-03-12',
  },
]

// ---------------------------------------------------------------------------
// Age/gender breakdown (combined breakdown)
// ---------------------------------------------------------------------------

export const ageGenderBreakdownResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '5000',
    clicks: '150',
    spend: '200.00',
    actions: [{ action_type: 'offsite_conversion', value: '10' }],
    action_values: [{ action_type: 'offsite_conversion', value: '600.00' }],
    cpm: '40.00',
    frequency: '1.5',
    reach: '3333',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    age: '25-34',
    gender: 'male',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '6000',
    clicks: '180',
    spend: '240.00',
    actions: [{ action_type: 'offsite_conversion', value: '12' }],
    action_values: [{ action_type: 'offsite_conversion', value: '720.00' }],
    cpm: '40.00',
    frequency: '2.0',
    reach: '3000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    age: '25-34',
    gender: 'female',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '4000',
    clicks: '120',
    spend: '160.00',
    actions: [{ action_type: 'offsite_conversion', value: '8' }],
    action_values: [{ action_type: 'offsite_conversion', value: '480.00' }],
    cpm: '40.00',
    frequency: '1.2',
    reach: '3333',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    age: '35-44',
    gender: 'male',
  },
]

// ---------------------------------------------------------------------------
// Placement breakdown
// ---------------------------------------------------------------------------

export const placementBreakdownResponse: readonly MetaInsightsRow[] = [
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '8000',
    clicks: '240',
    spend: '320.00',
    actions: [{ action_type: 'offsite_conversion', value: '16' }],
    action_values: [{ action_type: 'offsite_conversion', value: '960.00' }],
    cpm: '40.00',
    frequency: '2.0',
    reach: '4000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    publisher_platform: 'facebook',
    platform_position: 'feed',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '4000',
    clicks: '120',
    spend: '160.00',
    actions: [{ action_type: 'offsite_conversion', value: '8' }],
    action_values: [{ action_type: 'offsite_conversion', value: '480.00' }],
    cpm: '40.00',
    frequency: '1.5',
    reach: '2667',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    publisher_platform: 'instagram',
    platform_position: 'story',
  },
  {
    campaign_id: '111',
    campaign_name: 'Retargeting Campaign',
    impressions: '3000',
    clicks: '90',
    spend: '120.00',
    actions: [{ action_type: 'offsite_conversion', value: '6' }],
    action_values: [{ action_type: 'offsite_conversion', value: '360.00' }],
    cpm: '40.00',
    frequency: '1.0',
    reach: '3000',
    date_start: '2026-03-11',
    date_stop: '2026-03-18',
    publisher_platform: 'facebook',
    platform_position: 'right_hand_column',
  },
]

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

/** Row with no conversions at all (no actions/action_values arrays) */
export const noConversionsRow: MetaInsightsRow = {
  campaign_id: '333',
  campaign_name: 'Brand Awareness Only',
  impressions: '100000',
  clicks: '500',
  spend: '1500.00',
  cpm: '15.00',
  frequency: '4.0',
  reach: '25000',
  date_start: '2026-03-11',
  date_stop: '2026-03-18',
}

/** Row with empty actions arrays */
export const emptyActionsRow: MetaInsightsRow = {
  campaign_id: '444',
  campaign_name: 'Empty Actions Campaign',
  impressions: '5000',
  clicks: '100',
  spend: '200.00',
  actions: [],
  action_values: [],
  cpm: '40.00',
  frequency: '1.0',
  reach: '5000',
  date_start: '2026-03-11',
  date_stop: '2026-03-18',
}
