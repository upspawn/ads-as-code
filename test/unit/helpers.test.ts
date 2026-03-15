import { describe, expect, test } from 'bun:test'
import {
  exact, phrase, broad, keywords,
  daily, monthly, eur, usd,
  geo, languages, weekdays, hours, device, regions, cities, radius, presence, demographics, scheduleBid, targeting,
  audiences, audienceTargeting, remarketing, customAudience, inMarket, affinity, customerMatch,
  headlines, descriptions, rsa,
  link, sitelinks, callouts, snippet, call, price, promotion, image,
  negatives,
  url,
} from '../../src/helpers/index.ts'

// ─── Keywords ───────────────────────────────────────────────

describe('exact()', () => {
  test('creates exact-match keywords', () => {
    const result = exact('rename files', 'auto rename')
    expect(result).toEqual([
      { text: 'rename files', matchType: 'EXACT' },
      { text: 'auto rename', matchType: 'EXACT' },
    ])
  })

  test('trims whitespace', () => {
    const result = exact('  padded  ')
    expect(result[0]!.text).toBe('padded')
  })
})

describe('phrase()', () => {
  test('creates phrase-match keywords', () => {
    const result = phrase('file renaming tool')
    expect(result).toEqual([{ text: 'file renaming tool', matchType: 'PHRASE' }])
  })
})

describe('broad()', () => {
  test('creates broad-match keywords', () => {
    const result = broad('rename')
    expect(result).toEqual([{ text: 'rename', matchType: 'BROAD' }])
  })
})

// ─── Keyword Overrides ──────────────────────────────────────

describe('keyword overrides', () => {
  test('exact() with bid override', () => {
    const result = exact({ text: 'rename files', bid: 1.50 })
    expect(result).toEqual([{ text: 'rename files', matchType: 'EXACT', bid: 1.50 }])
  })

  test('exact() with finalUrl override', () => {
    const result = exact({ text: 'rename pdf', finalUrl: 'https://renamed.to/pdf-renamer' })
    expect(result).toEqual([{ text: 'rename pdf', matchType: 'EXACT', finalUrl: 'https://renamed.to/pdf-renamer' }])
  })

  test('exact() with status override', () => {
    const result = exact({ text: 'paused kw', status: 'paused' })
    expect(result).toEqual([{ text: 'paused kw', matchType: 'EXACT', status: 'paused' }])
  })

  test('mixed string + object keyword args', () => {
    const result = exact('simple keyword', { text: 'override keyword', bid: 2.00 })
    expect(result).toEqual([
      { text: 'simple keyword', matchType: 'EXACT' },
      { text: 'override keyword', matchType: 'EXACT', bid: 2.00 },
    ])
  })

  test('phrase() with bid override', () => {
    const result = phrase({ text: 'file renaming', bid: 0.75 })
    expect(result).toEqual([{ text: 'file renaming', matchType: 'PHRASE', bid: 0.75 }])
  })

  test('broad() with all overrides', () => {
    const result = broad({ text: 'document management', bid: 0.50, finalUrl: 'https://renamed.to', status: 'paused' })
    expect(result).toEqual([{
      text: 'document management',
      matchType: 'BROAD',
      bid: 0.50,
      finalUrl: 'https://renamed.to',
      status: 'paused',
    }])
  })

  test('object input trims text', () => {
    const result = exact({ text: '  padded text  ' })
    expect(result[0]!.text).toBe('padded text')
  })
})

describe('keywords() bracket notation', () => {
  test('[text] → exact match', () => {
    const result = keywords('[rename files]')
    expect(result).toEqual([{ text: 'rename files', matchType: 'EXACT' }])
  })

  test('"text" → phrase match', () => {
    const result = keywords('"file renaming tool"')
    expect(result).toEqual([{ text: 'file renaming tool', matchType: 'PHRASE' }])
  })

  test('bare text → broad match', () => {
    const result = keywords('rename')
    expect(result).toEqual([{ text: 'rename', matchType: 'BROAD' }])
  })

  test('mixed notation in multi-line string', () => {
    const result = keywords(`
      [exact keyword]
      "phrase keyword"
      broad keyword
    `)
    expect(result).toEqual([
      { text: 'exact keyword', matchType: 'EXACT' },
      { text: 'phrase keyword', matchType: 'PHRASE' },
      { text: 'broad keyword', matchType: 'BROAD' },
    ])
  })

  test('multiple arguments', () => {
    const result = keywords('[exact]', '"phrase"', 'broad')
    expect(result).toEqual([
      { text: 'exact', matchType: 'EXACT' },
      { text: 'phrase', matchType: 'PHRASE' },
      { text: 'broad', matchType: 'BROAD' },
    ])
  })

  test('skips empty lines', () => {
    const result = keywords(`
      [keep this]

      [and this]
    `)
    expect(result).toHaveLength(2)
  })
})

// ─── Budget ─────────────────────────────────────────────────

describe('daily()', () => {
  test('creates daily budget with default EUR', () => {
    const b = daily(20)
    expect(b).toEqual({ amount: 20, currency: 'EUR', period: 'daily' })
  })

  test('creates daily budget with USD', () => {
    const b = daily(15, 'USD')
    expect(b).toEqual({ amount: 15, currency: 'USD', period: 'daily' })
  })

  test('throws for non-positive amount', () => {
    expect(() => daily(0)).toThrow('positive')
    expect(() => daily(-5)).toThrow('positive')
  })
})

describe('monthly()', () => {
  test('creates monthly budget', () => {
    const b = monthly(600)
    expect(b).toEqual({ amount: 600, currency: 'EUR', period: 'monthly' })
  })

  test('throws for non-positive amount', () => {
    expect(() => monthly(0)).toThrow('positive')
  })
})

describe('eur() / usd()', () => {
  test('eur returns a number', () => {
    expect(eur(20) as number).toBe(20)
  })

  test('usd returns a number', () => {
    expect(usd(15) as number).toBe(15)
  })
})

// ─── Targeting ──────────────────────────────────────────────

describe('geo()', () => {
  test('creates geo targeting rule', () => {
    const g = geo('US', 'DE')
    expect(g).toEqual({ type: 'geo', countries: ['US', 'DE'] })
  })

  test('throws with no countries', () => {
    expect(() => geo()).toThrow('at least one')
  })
})

describe('languages()', () => {
  test('creates language targeting rule', () => {
    const l = languages('en', 'de')
    expect(l).toEqual({ type: 'language', languages: ['en', 'de'] })
  })

  test('throws with no languages', () => {
    expect(() => languages()).toThrow('at least one')
  })
})

describe('weekdays()', () => {
  test('expands to mon-fri', () => {
    const s = weekdays()
    expect(s).toEqual({
      type: 'schedule',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    })
  })
})

describe('hours()', () => {
  test('creates hour range schedule', () => {
    const h = hours(9, 17)
    expect(h).toEqual({ type: 'schedule', startHour: 9, endHour: 17 })
  })

  test('throws for invalid range', () => {
    expect(() => hours(17, 9)).toThrow('less than')
    expect(() => hours(-1, 10)).toThrow('0-23')
    expect(() => hours(0, 25)).toThrow('1-24')
  })
})


describe('device()', () => {
  test('creates device target with bid adjustment', () => {
    const d = device('mobile', -0.5)
    expect(d).toEqual({ type: 'device', device: 'mobile', bidAdjustment: -0.5 })
  })

  test('creates device target to exclude mobile', () => {
    const d = device('mobile', -1.0)
    expect(d).toEqual({ type: 'device', device: 'mobile', bidAdjustment: -1.0 })
  })

  test('creates desktop target with positive bid', () => {
    const d = device('desktop', 0.2)
    expect(d).toEqual({ type: 'device', device: 'desktop', bidAdjustment: 0.2 })
  })

  test('creates tablet target with no change', () => {
    const d = device('tablet', 0)
    expect(d).toEqual({ type: 'device', device: 'tablet', bidAdjustment: 0 })
  })

  test('throws for bid adjustment below -1', () => {
    expect(() => device('mobile', -1.5)).toThrow('between -1.0 and 9.0')
  })

  test('throws for bid adjustment above 9', () => {
    expect(() => device('mobile', 10)).toThrow('between -1.0 and 9.0')
  })
})

describe('regions()', () => {
  test('creates region target', () => {
    const r = regions('California', 'New York')
    expect(r).toEqual({ type: 'region', regions: ['California', 'New York'] })
  })

  test('throws with no regions', () => {
    expect(() => regions()).toThrow('at least one')
  })
})

describe('cities()', () => {
  test('creates city target', () => {
    const c = cities('Berlin', 'Munich', 'Hamburg')
    expect(c).toEqual({ type: 'city', cities: ['Berlin', 'Munich', 'Hamburg'] })
  })

  test('throws with no cities', () => {
    expect(() => cities()).toThrow('at least one')
  })
})

describe('radius()', () => {
  test('creates radius target with coordinates', () => {
    const r = radius(52.52, 13.405, 50)
    expect(r).toEqual({ type: 'radius', latitude: 52.52, longitude: 13.405, radiusKm: 50 })
  })

  test('throws for zero radius', () => {
    expect(() => radius(0, 0, 0)).toThrow('positive')
  })

  test('throws for negative radius', () => {
    expect(() => radius(0, 0, -10)).toThrow('positive')
  })
})

describe('presence()', () => {
  test('creates presence-only target', () => {
    const p = presence('presence')
    expect(p).toEqual({ type: 'presence', mode: 'presence' })
  })

  test('creates presence-or-interest target', () => {
    const p = presence('presence-or-interest')
    expect(p).toEqual({ type: 'presence', mode: 'presence-or-interest' })
  })
})

describe('demographics()', () => {
  test('creates target with age ranges', () => {
    const d = demographics({ ageRanges: ['25-34', '35-44'] })
    expect(d).toEqual({ type: 'demographic', ageRanges: ['25-34', '35-44'] })
  })

  test('creates target with genders', () => {
    const d = demographics({ genders: ['male', 'female'] })
    expect(d).toEqual({ type: 'demographic', genders: ['male', 'female'] })
  })

  test('creates target with incomes', () => {
    const d = demographics({ incomes: ['top-10%', '11-20%'] })
    expect(d).toEqual({ type: 'demographic', incomes: ['top-10%', '11-20%'] })
  })

  test('creates target with parental statuses', () => {
    const d = demographics({ parentalStatuses: ['parent'] })
    expect(d).toEqual({ type: 'demographic', parentalStatuses: ['parent'] })
  })

  test('creates target with all demographic options', () => {
    const d = demographics({
      ageRanges: ['25-34'],
      genders: ['female'],
      incomes: ['top-10%'],
      parentalStatuses: ['not-parent'],
    })
    expect(d).toEqual({
      type: 'demographic',
      ageRanges: ['25-34'],
      genders: ['female'],
      incomes: ['top-10%'],
      parentalStatuses: ['not-parent'],
    })
  })

  test('creates target with empty options', () => {
    const d = demographics({})
    expect(d).toEqual({ type: 'demographic' })
  })
})

describe('scheduleBid()', () => {
  test('creates schedule bid target', () => {
    const sb = scheduleBid('mon', 9, 17, 0.2)
    expect(sb).toEqual({ type: 'schedule-bid', day: 'mon', startHour: 9, endHour: 17, bidAdjustment: 0.2 })
  })

  test('creates schedule bid with negative adjustment', () => {
    const sb = scheduleBid('sat', 0, 24, -0.5)
    expect(sb).toEqual({ type: 'schedule-bid', day: 'sat', startHour: 0, endHour: 24, bidAdjustment: -0.5 })
  })

  test('throws for invalid start hour', () => {
    expect(() => scheduleBid('mon', -1, 10, 0)).toThrow('0-23')
    expect(() => scheduleBid('mon', 24, 24, 0)).toThrow('0-23')
  })

  test('throws for invalid end hour', () => {
    expect(() => scheduleBid('mon', 0, 25, 0)).toThrow('1-24')
    expect(() => scheduleBid('mon', 0, 0, 0)).toThrow('1-24')
  })

  test('throws when start >= end', () => {
    expect(() => scheduleBid('mon', 17, 9, 0)).toThrow('less than')
  })

  test('throws for bid adjustment out of range', () => {
    expect(() => scheduleBid('mon', 9, 17, -1.5)).toThrow('between -1.0 and 9.0')
    expect(() => scheduleBid('mon', 9, 17, 10)).toThrow('between -1.0 and 9.0')
  })
})

describe('targeting()', () => {
  test('composes multiple rules', () => {
    const t = targeting(
      geo('US'),
      languages('en'),
      weekdays(),
    )
    expect(t.rules).toHaveLength(3)
    expect(t.rules[0]!.type).toBe('geo')
    expect(t.rules[1]!.type).toBe('language')
    expect(t.rules[2]!.type).toBe('schedule')
  })

  test('works with no rules', () => {
    const t = targeting()
    expect(t).toEqual({ rules: [] })
  })

  test('composes all new rule types together', () => {
    const t = targeting(
      geo('US', 'DE'),
      languages('en'),
      weekdays(),
      hours(9, 17),
      device('mobile', -1.0),
      device('desktop', 0.2),
      regions('California'),
      cities('Berlin'),
      radius(52.52, 13.405, 50),
      presence('presence'),
      demographics({ ageRanges: ['25-34'], genders: ['male'] }),
      scheduleBid('mon', 9, 17, 0.2),
    )
    expect(t.rules).toHaveLength(12)
    expect(t.rules[4]!.type).toBe('device')
    expect(t.rules[6]!.type).toBe('region')
    expect(t.rules[7]!.type).toBe('city')
    expect(t.rules[8]!.type).toBe('radius')
    expect(t.rules[9]!.type).toBe('presence')
    expect(t.rules[10]!.type).toBe('demographic')
    expect(t.rules[11]!.type).toBe('schedule-bid')
  })
})

// ─── Audiences ──────────────────────────────────────────────

describe('audiences()', () => {
  test('creates audience targeting rule in observation mode', () => {
    const a = audiences(
      remarketing('123'),
      inMarket('80432'),
    )
    expect(a).toEqual({
      type: 'audience',
      audiences: [
        { kind: 'remarketing', listId: '123' },
        { kind: 'in-market', categoryId: '80432' },
      ],
      mode: 'observation',
    })
  })
})

describe('audienceTargeting()', () => {
  test('defaults to targeting mode', () => {
    const a = audienceTargeting(
      remarketing('456', { name: 'Cart Abandoners' }),
    )
    expect(a.mode).toBe('targeting')
    expect(a.type).toBe('audience')
    expect(a.audiences).toHaveLength(1)
  })
})

describe('remarketing()', () => {
  test('creates remarketing ref', () => {
    const ref = remarketing('list-001')
    expect(ref).toEqual({ kind: 'remarketing', listId: 'list-001' })
  })

  test('includes optional name and bidAdjustment', () => {
    const ref = remarketing('list-001', { name: 'All Visitors', bidAdjustment: 0.5 })
    expect(ref).toEqual({ kind: 'remarketing', listId: 'list-001', name: 'All Visitors', bidAdjustment: 0.5 })
  })
})

describe('customAudience()', () => {
  test('creates custom audience ref with bid adjustment', () => {
    const ref = customAudience('aud-789', { bidAdjustment: 0.3 })
    expect(ref).toEqual({ kind: 'custom', audienceId: 'aud-789', bidAdjustment: 0.3 })
  })
})

describe('inMarket()', () => {
  test('creates in-market ref with name', () => {
    const ref = inMarket('80432', { name: 'Business Software' })
    expect(ref).toEqual({ kind: 'in-market', categoryId: '80432', name: 'Business Software' })
  })
})

describe('affinity()', () => {
  test('creates affinity ref', () => {
    const ref = affinity('80101', { name: 'Tech Enthusiasts' })
    expect(ref).toEqual({ kind: 'affinity', categoryId: '80101', name: 'Tech Enthusiasts' })
  })
})

describe('customerMatch()', () => {
  test('creates customer-match ref', () => {
    const ref = customerMatch('cm-list-1')
    expect(ref).toEqual({ kind: 'customer-match', listId: 'cm-list-1' })
  })
})

describe('audiences + targeting() composition', () => {
  test('composes audience rules with other targeting rules', () => {
    const t = targeting(
      geo('US'),
      languages('en'),
      audiences(
        remarketing('123', { bidAdjustment: 0.5 }),
        inMarket('80432', { name: 'Business Software' }),
      ),
    )
    expect(t.rules).toHaveLength(3)
    expect(t.rules[0]!.type).toBe('geo')
    expect(t.rules[1]!.type).toBe('language')
    expect(t.rules[2]!.type).toBe('audience')
  })
})

// ─── Ads ────────────────────────────────────────────────────

describe('headlines()', () => {
  test('creates headlines at exactly 30 chars', () => {
    const text = 'A'.repeat(30) // exactly at limit
    const result = headlines(text)
    expect(result).toHaveLength(1)
    expect(result[0] as string).toBe(text)
  })

  test('throws when 1 char over limit', () => {
    const text = 'A'.repeat(31)
    expect(() => headlines(text)).toThrow('exceeds 30 chars')
    expect(() => headlines(text)).toThrow(text) // error names the headline
  })

  test('error message includes the offending headline', () => {
    try {
      headlines('Short One', 'This headline is way too long for the limit!!')
      throw new Error('should have thrown')
    } catch (e: unknown) {
      const msg = (e as Error).message
      expect(msg).toContain('This headline is way too long for the limit!!')
      expect(msg).toContain('exceeds 30 chars')
    }
  })

  test('creates multiple headlines', () => {
    const result = headlines('Rename Files Fast', 'AI-Powered Tool')
    expect(result).toHaveLength(2)
  })
})

describe('descriptions()', () => {
  test('creates descriptions at exactly 90 chars', () => {
    const text = 'B'.repeat(90)
    const result = descriptions(text)
    expect(result).toHaveLength(1)
  })

  test('throws when 1 char over limit', () => {
    const text = 'B'.repeat(91)
    expect(() => descriptions(text)).toThrow('exceeds 90 chars')
  })
})

describe('rsa()', () => {
  test('creates RSA with valid inputs', () => {
    const h = headlines('Headline One', 'Headline Two', 'Headline Three')
    const d = descriptions('Description one for the ad.', 'Description two for the ad.')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u)

    expect(ad.type).toBe('rsa')
    expect(ad.headlines).toHaveLength(3)
    expect(ad.descriptions).toHaveLength(2)
    expect(ad.finalUrl).toBe('https://renamed.to')
    expect(ad.utm).toBeUndefined()
  })

  test('creates RSA with UTM', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to', { source: 'google', medium: 'cpc' })
    const ad = rsa(h, d, u)

    expect(ad.utm).toEqual({ source: 'google', medium: 'cpc' })
  })

  test('throws with fewer than 3 headlines', () => {
    const h = headlines('H1', 'H2')
    const d = descriptions('D1 text', 'D2 text')
    expect(() => rsa(h, d, url('https://renamed.to'))).toThrow('at least 3 headlines')
  })

  test('throws with fewer than 2 descriptions', () => {
    const h = headlines('H1', 'H2', 'H3')
    const d = descriptions('D1 text')
    expect(() => rsa(h, d, url('https://renamed.to'))).toThrow('at least 2 descriptions')
  })

  test('creates RSA with pinned headlines', () => {
    const h = headlines('Headline One', 'Headline Two', 'Headline Three')
    const d = descriptions('Description one for the ad.', 'Description two for the ad.')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u, {
      pinnedHeadlines: [{ text: 'Headline One', position: 1 }],
    })
    expect(ad.pinnedHeadlines).toEqual([{ text: 'Headline One', position: 1 }])
  })

  test('creates RSA with pinned descriptions', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u, {
      pinnedDescriptions: [{ text: 'D1 text', position: 1 }],
    })
    expect(ad.pinnedDescriptions).toEqual([{ text: 'D1 text', position: 1 }])
  })

  test('creates RSA with path1 and path2', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u, { path1: 'rename', path2: 'files' })
    expect(ad.path1).toBe('rename')
    expect(ad.path2).toBe('files')
  })

  test('throws when path1 exceeds 15 chars', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    expect(() => rsa(h, d, u, { path1: 'A'.repeat(16) })).toThrow('path1')
    expect(() => rsa(h, d, u, { path1: 'A'.repeat(16) })).toThrow('exceeds 15 chars')
  })

  test('throws when path2 exceeds 15 chars', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    expect(() => rsa(h, d, u, { path2: 'B'.repeat(16) })).toThrow('path2')
    expect(() => rsa(h, d, u, { path2: 'B'.repeat(16) })).toThrow('exceeds 15 chars')
  })

  test('path1/path2 at exactly 15 chars passes', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u, { path1: 'A'.repeat(15), path2: 'B'.repeat(15) })
    expect(ad.path1).toBe('A'.repeat(15))
    expect(ad.path2).toBe('B'.repeat(15))
  })

  test('creates RSA with mobileUrl', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u, { mobileUrl: 'https://m.renamed.to' })
    expect(ad.mobileUrl).toBe('https://m.renamed.to')
  })

  test('RSA without options has no extra fields', () => {
    const h = headlines('H1 text', 'H2 text', 'H3 text')
    const d = descriptions('D1 text', 'D2 text')
    const u = url('https://renamed.to')
    const ad = rsa(h, d, u)
    expect(ad.pinnedHeadlines).toBeUndefined()
    expect(ad.pinnedDescriptions).toBeUndefined()
    expect(ad.path1).toBeUndefined()
    expect(ad.path2).toBeUndefined()
    expect(ad.mobileUrl).toBeUndefined()
  })
})

// ─── Extensions ─────────────────────────────────────────────

describe('link()', () => {
  test('creates a sitelink', () => {
    const sl = link('Pricing', 'https://renamed.to/pricing')
    expect(sl).toEqual({ text: 'Pricing', url: 'https://renamed.to/pricing' })
  })

  test('validates text length (25 char max)', () => {
    const longText = 'A'.repeat(26)
    expect(() => link(longText, 'https://example.com')).toThrow('exceeds 25 chars')
  })

  test('text at exactly 25 chars passes', () => {
    const text = 'A'.repeat(25)
    const sl = link(text, 'https://example.com')
    expect(sl.text).toBe(text)
  })

  test('validates description lengths (35 char max)', () => {
    const longDesc = 'D'.repeat(36)
    expect(() => link('Ok', 'https://example.com', { description1: longDesc })).toThrow('exceeds 35 chars')
    expect(() => link('Ok', 'https://example.com', { description2: longDesc })).toThrow('exceeds 35 chars')
  })

  test('includes optional descriptions', () => {
    const sl = link('Pricing', 'https://example.com', {
      description1: 'See our plans',
      description2: 'Start free today',
    })
    expect(sl.description1).toBe('See our plans')
    expect(sl.description2).toBe('Start free today')
  })
})

describe('sitelinks()', () => {
  test('passes through sitelink array', () => {
    const a = link('A', 'https://a.com')
    const b = link('B', 'https://b.com')
    expect(sitelinks(a, b)).toEqual([a, b])
  })
})

describe('callouts()', () => {
  test('creates callouts', () => {
    const result = callouts('Free Trial', '24/7 Support')
    expect(result as string[]).toEqual(['Free Trial', '24/7 Support'])
  })

  test('validates 25 char limit', () => {
    const long = 'C'.repeat(26)
    expect(() => callouts(long)).toThrow('exceeds 25 chars')
  })

  test('at exactly 25 chars passes', () => {
    const text = 'C'.repeat(25)
    expect(() => callouts(text)).not.toThrow()
  })
})

// ─── Structured Snippets ────────────────────────────────────

describe('snippet()', () => {
  test('creates a structured snippet with valid values', () => {
    const s = snippet('Types', 'Files', 'Folders', 'Documents')
    expect(s).toEqual({ header: 'Types', values: ['Files', 'Folders', 'Documents'] })
  })

  test('throws when a value exceeds 25 chars', () => {
    const longValue = 'A'.repeat(26)
    expect(() => snippet('Types', 'Files', 'Folders', longValue)).toThrow('exceeds 25 chars')
  })

  test('value at exactly 25 chars passes', () => {
    const value = 'A'.repeat(25)
    const s = snippet('Types', value, 'Folders', 'Documents')
    expect(s.values[0]).toBe(value)
  })

  test('throws with fewer than 3 values', () => {
    expect(() => snippet('Types', 'Files', 'Folders', 'Documents')).not.toThrow()
    expect(() => snippet('Types', 'Files', 'Folders')).toThrow('at least 3')
    expect(() => snippet('Types', 'Files')).toThrow('at least 3')
    expect(() => snippet('Types')).toThrow('at least 3')
  })

  test('throws with more than 10 values', () => {
    const values = Array.from({ length: 11 }, (_, i) => `Value ${i}`)
    expect(() => snippet('Types', ...values)).toThrow('at most 10')
  })

  test('allows exactly 10 values', () => {
    const values = Array.from({ length: 10 }, (_, i) => `Val ${i}`)
    expect(() => snippet('Types', ...values)).not.toThrow()
  })
})

// ─── Call Extension ─────────────────────────────────────────

describe('call()', () => {
  test('creates a call extension', () => {
    const c = call('+1-800-555-0123', 'US')
    expect(c).toEqual({ phoneNumber: '+1-800-555-0123', countryCode: 'US' })
  })

  test('includes callOnly when specified', () => {
    const c = call('+49-30-1234567', 'DE', true)
    expect(c).toEqual({ phoneNumber: '+49-30-1234567', countryCode: 'DE', callOnly: true })
  })

  test('omits callOnly when not specified', () => {
    const c = call('+1-800-555-0123', 'US')
    expect(c).not.toHaveProperty('callOnly')
  })
})

// ─── Price Extension ────────────────────────────────────────

describe('price()', () => {
  const validItems = [
    { header: 'Starter', description: 'For individuals', price: '$9/mo', url: '/pricing' },
    { header: 'Pro', description: 'For teams', price: '$29/mo', url: '/pricing' },
    { header: 'Enterprise', description: 'Custom pricing', price: '$99/mo', url: '/pricing' },
  ]

  test('creates a price extension with valid items', () => {
    const p = price(validItems)
    expect(p.items).toHaveLength(3)
    expect(p.items[0]!.header).toBe('Starter')
  })

  test('includes qualifier when specified', () => {
    const p = price(validItems, 'from')
    expect(p.priceQualifier).toBe('from')
  })

  test('throws with fewer than 3 items', () => {
    expect(() => price(validItems.slice(0, 2))).toThrow('at least 3')
  })

  test('throws with more than 8 items', () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      header: `Plan ${i}`, description: 'Desc', price: '$1', url: '/p',
    }))
    expect(() => price(tooMany)).toThrow('at most 8')
  })

  test('throws when header exceeds 25 chars', () => {
    const items = [
      { header: 'A'.repeat(26), description: 'Desc', price: '$1', url: '/p' },
      ...validItems.slice(1),
    ]
    expect(() => price(items)).toThrow('exceeds 25 chars')
  })
})

// ─── Promotion Extension ───────────────────────────────────

describe('promotion()', () => {
  test('creates a promotion extension', () => {
    const p = promotion({
      discountType: 'percent',
      discountPercent: 20,
      occasion: 'BLACK_FRIDAY',
      url: 'https://renamed.to/pricing',
    })
    expect(p.discountType).toBe('percent')
    expect(p.discountPercent).toBe(20)
    expect(p.occasion).toBe('BLACK_FRIDAY')
    expect(p.url).toBe('https://renamed.to/pricing')
  })

  test('creates a monetary promotion', () => {
    const p = promotion({
      discountType: 'monetary',
      discountAmount: 10,
      promotionCode: 'SAVE10',
      url: 'https://renamed.to/pricing',
    })
    expect(p.discountType).toBe('monetary')
    expect(p.discountAmount).toBe(10)
    expect(p.promotionCode).toBe('SAVE10')
  })
})

// ─── Image Extension ───────────────────────────────────────

describe('image()', () => {
  test('creates an image extension', () => {
    const img = image('https://example.com/ad.png')
    expect(img).toEqual({ imageUrl: 'https://example.com/ad.png' })
  })

  test('includes altText when specified', () => {
    const img = image('https://example.com/ad.png', 'Product screenshot')
    expect(img).toEqual({ imageUrl: 'https://example.com/ad.png', altText: 'Product screenshot' })
  })

  test('omits altText when not specified', () => {
    const img = image('https://example.com/ad.png')
    expect(img).not.toHaveProperty('altText')
  })
})

// ─── Negatives ──────────────────────────────────────────────

describe('negatives()', () => {
  test('creates broad-match negative keywords', () => {
    const result = negatives('free', 'cheap', 'download')
    expect(result).toEqual([
      { text: 'free', matchType: 'BROAD' },
      { text: 'cheap', matchType: 'BROAD' },
      { text: 'download', matchType: 'BROAD' },
    ])
  })

  test('deduplicates case-insensitively', () => {
    const result = negatives('Free', 'free', 'FREE')
    expect(result).toHaveLength(1)
    expect(result[0]!.text).toBe('Free') // preserves first occurrence casing
  })

  test('trims and skips empty strings', () => {
    const result = negatives('  spam  ', '', '  ')
    expect(result).toEqual([{ text: 'spam', matchType: 'BROAD' }])
  })
})

// ─── URL ────────────────────────────────────────────────────

describe('url()', () => {
  test('creates URL result', () => {
    const u = url('https://renamed.to')
    expect(u).toEqual({ finalUrl: 'https://renamed.to' })
  })

  test('includes UTM params', () => {
    const u = url('https://renamed.to', { source: 'google', medium: 'cpc', campaign: 'search' })
    expect(u.utm).toEqual({ source: 'google', medium: 'cpc', campaign: 'search' })
  })

  test('throws for non-http URLs', () => {
    expect(() => url('renamed.to')).toThrow('http:// or https://')
  })

  test('accepts http:// URLs', () => {
    const u = url('http://localhost:3000')
    expect(u.finalUrl).toBe('http://localhost:3000')
  })
})
