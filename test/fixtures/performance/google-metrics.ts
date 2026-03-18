import type { GoogleAdsRow } from '../../../src/google/types.ts'

// ─── Campaign-level metrics (two days, two campaigns) ────────

export const campaignMetricsResponse: GoogleAdsRow[] = [
  // Brand US — day 1
  {
    campaign: { id: '111', name: 'Brand — US' },
    metrics: {
      impressions: 1000,
      clicks: 50,
      cost_micros: 25_000_000,   // $25
      conversions: 5,
      conversions_value: 150,
      search_impression_share: 0.82,
    },
    segments: { date: '2026-03-10' },
  },
  // Brand US — day 2
  {
    campaign: { id: '111', name: 'Brand — US' },
    metrics: {
      impressions: 1200,
      clicks: 60,
      cost_micros: 30_000_000,   // $30
      conversions: 7,
      conversions_value: 210,
      search_impression_share: 0.85,
    },
    segments: { date: '2026-03-11' },
  },
  // Retargeting — day 1
  {
    campaign: { id: '222', name: 'Retargeting — EU' },
    metrics: {
      impressions: 500,
      clicks: 20,
      cost_micros: 10_000_000,   // $10
      conversions: 2,
      conversions_value: 80,
      search_impression_share: 0.70,
    },
    segments: { date: '2026-03-10' },
  },
  // Retargeting — day 2
  {
    campaign: { id: '222', name: 'Retargeting — EU' },
    metrics: {
      impressions: 600,
      clicks: 25,
      cost_micros: 12_000_000,   // $12
      conversions: 3,
      conversions_value: 120,
      search_impression_share: 0.75,
    },
    segments: { date: '2026-03-11' },
  },
]

// ─── Device breakdown (segmented by device enum) ────────────

export const deviceBreakdownResponse: GoogleAdsRow[] = [
  // Brand US — mobile
  {
    campaign: { id: '111', name: 'Brand — US' },
    metrics: {
      impressions: 1500,
      clicks: 70,
      cost_micros: 35_000_000,
      conversions: 8,
      conversions_value: 240,
    },
    segments: { device: 2 },   // 2=MOBILE
  },
  // Brand US — desktop
  {
    campaign: { id: '111', name: 'Brand — US' },
    metrics: {
      impressions: 600,
      clicks: 35,
      cost_micros: 18_000_000,
      conversions: 4,
      conversions_value: 120,
    },
    segments: { device: 3 },   // 3=DESKTOP
  },
  // Brand US — tablet
  {
    campaign: { id: '111', name: 'Brand — US' },
    metrics: {
      impressions: 100,
      clicks: 5,
      cost_micros: 2_000_000,
      conversions: 0,
      conversions_value: 0,
    },
    segments: { device: 4 },   // 4=TABLET
  },
  // Retargeting — mobile only
  {
    campaign: { id: '222', name: 'Retargeting — EU' },
    metrics: {
      impressions: 800,
      clicks: 30,
      cost_micros: 15_000_000,
      conversions: 3,
      conversions_value: 120,
    },
    segments: { device: 2 },
  },
]

// ─── Ad group-level metrics ─────────────────────────────────

export const adGroupMetricsResponse: GoogleAdsRow[] = [
  {
    campaign: { name: 'Brand — US' },
    ad_group: { id: '5001', name: 'Exact Match' },
    metrics: {
      impressions: 1200,
      clicks: 50,
      cost_micros: 25_000_000,
      conversions: 5,
      conversions_value: 150,
    },
  },
  {
    campaign: { name: 'Brand — US' },
    ad_group: { id: '5002', name: 'Phrase Match' },
    metrics: {
      impressions: 1000,
      clicks: 60,
      cost_micros: 30_000_000,
      conversions: 7,
      conversions_value: 210,
    },
  },
  {
    campaign: { name: 'Retargeting — EU' },
    ad_group: { id: '5003', name: 'Broad Terms' },
    metrics: {
      impressions: 1100,
      clicks: 45,
      cost_micros: 22_000_000,
      conversions: 5,
      conversions_value: 200,
    },
  },
]

// ─── Keyword-level metrics ───────────────────────────────────

export const keywordMetricsResponse: GoogleAdsRow[] = [
  {
    campaign: { name: 'Brand — US' },
    ad_group: { name: 'Exact Match' },
    ad_group_criterion: {
      keyword: { text: 'my brand', match_type: 2 },   // 2=EXACT
      quality_info: { quality_score: 8 },
    },
    metrics: {
      impressions: 800,
      clicks: 40,
      cost_micros: 20_000_000,
      conversions: 4,
      conversions_value: 120,
    },
  },
  {
    campaign: { name: 'Brand — US' },
    ad_group: { name: 'Exact Match' },
    ad_group_criterion: {
      keyword: { text: 'competitor name', match_type: 2 },
      quality_info: { quality_score: 3 },
    },
    metrics: {
      impressions: 400,
      clicks: 10,
      cost_micros: 5_000_000,
      conversions: 0,
      conversions_value: 0,
    },
  },
  {
    campaign: { name: 'Retargeting — EU' },
    ad_group: { name: 'Broad Terms' },
    ad_group_criterion: {
      keyword: { text: 'retargeting service', match_type: 4 },   // 4=BROAD
      quality_info: { quality_score: 6 },
    },
    metrics: {
      impressions: 300,
      clicks: 15,
      cost_micros: 7_500_000,
      conversions: 1,
      conversions_value: 50,
    },
  },
]

// ─── Search term report ──────────────────────────────────────

export const searchTermResponse: GoogleAdsRow[] = [
  {
    campaign: { name: 'Brand — US' },
    ad_group: { name: 'Exact Match' },
    search_term_view: { search_term: 'buy my brand online' },
    metrics: {
      impressions: 200,
      clicks: 15,
      cost_micros: 7_500_000,
      conversions: 3,
      conversions_value: 90,
    },
  },
  {
    campaign: { name: 'Brand — US' },
    ad_group: { name: 'Exact Match' },
    search_term_view: { search_term: 'my brand review' },
    metrics: {
      impressions: 100,
      clicks: 5,
      cost_micros: 2_500_000,
      conversions: 0,
      conversions_value: 0,
    },
  },
  {
    campaign: { name: 'Retargeting — EU' },
    ad_group: { name: 'Broad Terms' },
    search_term_view: { search_term: 'best retargeting tools' },
    metrics: {
      impressions: 150,
      clicks: 8,
      cost_micros: 4_000_000,
      conversions: 1,
      conversions_value: 50,
    },
  },
]
