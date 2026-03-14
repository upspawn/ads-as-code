import { describe, expect, test } from 'bun:test'
import {
  exact, phrase, broad, keywords,
  daily, monthly, eur, usd,
  geo, languages, weekdays, hours, targeting,
  headlines, descriptions, rsa,
  link, sitelinks, callouts,
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
