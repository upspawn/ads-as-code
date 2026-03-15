import { describe, expect, test } from 'bun:test'
import {
  metaTargeting,
  age,
  audience,
  interests,
  excludeAudience,
  lookalike,
} from '../../src/helpers/meta-targeting.ts'
import {
  image,
  video,
  carousel,
} from '../../src/helpers/meta-creative.ts'
import {
  lowestCost,
  costCap,
  bidCap,
  minRoas,
} from '../../src/helpers/meta-bidding.ts'
import {
  automatic,
  manual,
} from '../../src/helpers/meta-placement.ts'
import { daily, monthly, lifetime } from '../../src/helpers/budget.ts'
import { geo } from '../../src/helpers/targeting.ts'

// ─── Meta Targeting ────────────────────────────────────────

describe('metaTargeting()', () => {
  test('composes geo + age into MetaTargeting', () => {
    const t = metaTargeting(
      geo('US', 'DE'),
      age(25, 65),
    )
    expect(t.geo).toEqual([{ type: 'geo', countries: ['US', 'DE'] }])
    expect(t.age).toEqual({ min: 25, max: 65 })
  })

  test('composes audience by name', () => {
    const t = metaTargeting(
      geo('US'),
      audience('Website Visitors 30d'),
    )
    expect(t.customAudiences).toEqual(['Website Visitors 30d'])
  })

  test('composes audience by explicit ID', () => {
    const t = metaTargeting(
      geo('US'),
      audience({ id: '23856789012345' }),
    )
    expect(t.customAudiences).toEqual(['23856789012345'])
  })

  test('composes interests by name (deferred)', () => {
    const t = metaTargeting(
      geo('US'),
      ...interests('Construction', 'BIM'),
    )
    expect(t.interests).toHaveLength(2)
    expect(t.interests![0]!.name).toBe('Construction')
    // Unresolved interests get a marker ID prefix
    expect(t.interests![0]!.id).toContain('__unresolved:')
  })

  test('composes interests by explicit { id, name }', () => {
    const t = metaTargeting(
      geo('US'),
      ...interests({ id: '6003370250981', name: 'Construction' }),
    )
    expect(t.interests).toEqual([{ id: '6003370250981', name: 'Construction' }])
  })

  test('composes excluded audience', () => {
    const t = metaTargeting(
      geo('US'),
      excludeAudience('Existing Customers'),
    )
    expect(t.excludedAudiences).toEqual(['Existing Customers'])
  })

  test('composes excluded audience by ID', () => {
    const t = metaTargeting(
      geo('US'),
      excludeAudience({ id: '99999' }),
    )
    expect(t.excludedAudiences).toEqual(['99999'])
  })

  test('composes lookalike audience', () => {
    const t = metaTargeting(
      geo('US'),
      lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 }),
    )
    expect(t.lookalikeAudiences).toEqual(['Website Visitors 30d'])
  })

  test('omits empty arrays for unused targeting features', () => {
    const t = metaTargeting(geo('US'))
    expect(t.customAudiences).toBeUndefined()
    expect(t.excludedAudiences).toBeUndefined()
    expect(t.lookalikeAudiences).toBeUndefined()
    expect(t.interests).toBeUndefined()
    expect(t.age).toBeUndefined()
  })

  test('throws without geo', () => {
    expect(() => metaTargeting(age(25, 65))).toThrow('at least one geo()')
  })

  test('composes all rule types together', () => {
    const t = metaTargeting(
      geo('US', 'DE'),
      age(25, 65),
      audience('Visitors'),
      excludeAudience('Customers'),
      ...interests('Construction'),
      lookalike('Visitors', { geo: geo('US'), percent: 2 }),
    )
    expect(t.geo).toHaveLength(1)
    expect(t.age).toEqual({ min: 25, max: 65 })
    expect(t.customAudiences).toEqual(['Visitors'])
    expect(t.excludedAudiences).toEqual(['Customers'])
    expect(t.interests).toHaveLength(1)
    expect(t.lookalikeAudiences).toEqual(['Visitors'])
  })
})

describe('age()', () => {
  test('creates age range', () => {
    const a = age(25, 65)
    expect(a).toEqual({ _type: 'age', min: 25, max: 65 })
  })

  test('throws for min below 13', () => {
    expect(() => age(12, 65)).toThrow('13-65')
  })

  test('throws for max above 65', () => {
    expect(() => age(25, 66)).toThrow('13-65')
  })

  test('throws when min > max', () => {
    expect(() => age(50, 25)).toThrow('<=')
  })

  test('allows equal min and max', () => {
    const a = age(30, 30)
    expect(a).toEqual({ _type: 'age', min: 30, max: 30 })
  })
})

describe('audience()', () => {
  test('creates name-based marker', () => {
    const a = audience('Website Visitors 30d')
    expect(a).toEqual({ _type: 'audience-by-name', name: 'Website Visitors 30d' })
  })

  test('creates ID-based marker', () => {
    const a = audience({ id: '23856789012345' })
    expect(a).toEqual({ _type: 'audience-by-id', id: '23856789012345' })
  })
})

describe('interests()', () => {
  test('creates name-based markers for strings', () => {
    const result = interests('Construction', 'BIM')
    expect(result).toEqual([
      { _type: 'interest-by-name', name: 'Construction' },
      { _type: 'interest-by-name', name: 'BIM' },
    ])
  })

  test('creates resolved markers for { id, name } objects', () => {
    const result = interests({ id: '6003370250981', name: 'Construction' })
    expect(result).toEqual([
      { _type: 'interest-resolved', id: '6003370250981', name: 'Construction' },
    ])
  })

  test('handles mixed string and object args', () => {
    const result = interests('BIM', { id: '123', name: 'Construction' })
    expect(result).toHaveLength(2)
    expect(result[0]!._type).toBe('interest-by-name')
    expect(result[1]!._type).toBe('interest-resolved')
  })

  test('throws with no arguments', () => {
    expect(() => interests()).toThrow('at least one')
  })
})

describe('excludeAudience()', () => {
  test('creates name-based excluded marker', () => {
    const e = excludeAudience('Existing Customers')
    expect(e).toEqual({ _type: 'excluded-audience-by-name', name: 'Existing Customers' })
  })

  test('creates ID-based excluded marker', () => {
    const e = excludeAudience({ id: '99999' })
    expect(e).toEqual({ _type: 'excluded-audience-by-id', id: '99999' })
  })
})

describe('lookalike()', () => {
  test('creates lookalike with string source', () => {
    const l = lookalike('Website Visitors 30d', { geo: geo('US'), percent: 1 })
    expect(l).toEqual({
      _type: 'lookalike',
      source: 'Website Visitors 30d',
      config: { geo: { type: 'geo', countries: ['US'] }, percent: 1 },
    })
  })

  test('creates lookalike with ID source', () => {
    const l = lookalike({ id: '12345' }, { geo: geo('DE'), percent: 3 })
    expect(l.source).toEqual({ id: '12345' })
  })

  test('throws for percent below 1', () => {
    expect(() => lookalike('Source', { geo: geo('US'), percent: 0 })).toThrow('1-10')
  })

  test('throws for percent above 10', () => {
    expect(() => lookalike('Source', { geo: geo('US'), percent: 11 })).toThrow('1-10')
  })
})

// ─── Meta Creative ─────────────────────────────────────────

describe('image()', () => {
  test('creates ImageAd with derived name from filename', () => {
    const ad = image('./assets/hero-sign-up.png', {
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours...',
    })
    expect(ad.format).toBe('image')
    expect(ad.image).toBe('./assets/hero-sign-up.png')
    expect(ad.name).toBe('hero-sign-up')
    expect(ad.headline).toBe('Rename Files Instantly')
    expect(ad.primaryText).toBe('Stop wasting hours...')
  })

  test('uses explicit name over derived name', () => {
    const ad = image('./assets/hero.png', {
      name: 'Hero Ad',
      headline: 'H',
      primaryText: 'P',
    })
    expect(ad.name).toBe('Hero Ad')
  })

  test('includes optional fields when provided', () => {
    const ad = image('./assets/hero.png', {
      headline: 'H',
      primaryText: 'P',
      description: 'AI-powered file renaming',
      cta: 'SIGN_UP',
      url: 'https://renamed.to',
      urlParameters: 'utm_source=meta',
      displayLink: 'renamed.to',
    })
    expect(ad.description).toBe('AI-powered file renaming')
    expect(ad.cta).toBe('SIGN_UP')
    expect(ad.url).toBe('https://renamed.to')
    expect(ad.urlParameters).toBe('utm_source=meta')
    expect(ad.displayLink).toBe('renamed.to')
  })

  test('omits optional fields when not provided', () => {
    const ad = image('./hero.png', { headline: 'H', primaryText: 'P' })
    expect(ad.description).toBeUndefined()
    expect(ad.cta).toBeUndefined()
    expect(ad.url).toBeUndefined()
    expect(ad.urlParameters).toBeUndefined()
    expect(ad.displayLink).toBeUndefined()
  })

  test('handles filename without extension', () => {
    const ad = image('./assets/hero', { headline: 'H', primaryText: 'P' })
    expect(ad.name).toBe('hero')
  })

  test('handles nested path correctly', () => {
    const ad = image('../images/sub/comparison.jpg', { headline: 'H', primaryText: 'P' })
    expect(ad.name).toBe('comparison')
  })
})

describe('video()', () => {
  test('creates VideoAd with derived name', () => {
    const ad = video('./assets/demo.mp4', {
      headline: 'See it in Action',
      primaryText: 'Watch how teams save time...',
    })
    expect(ad.format).toBe('video')
    expect(ad.video).toBe('./assets/demo.mp4')
    expect(ad.name).toBe('demo')
    expect(ad.headline).toBe('See it in Action')
    expect(ad.primaryText).toBe('Watch how teams save time...')
  })

  test('includes optional thumbnail', () => {
    const ad = video('./demo.mp4', {
      headline: 'H',
      primaryText: 'P',
      thumbnail: './assets/thumb.jpg',
    })
    expect(ad.thumbnail).toBe('./assets/thumb.jpg')
  })

  test('includes optional cta and url', () => {
    const ad = video('./demo.mp4', {
      headline: 'H',
      primaryText: 'P',
      cta: 'WATCH_MORE',
      url: 'https://renamed.to/demo',
    })
    expect(ad.cta).toBe('WATCH_MORE')
    expect(ad.url).toBe('https://renamed.to/demo')
  })
})

describe('carousel()', () => {
  const twoCards = [
    { image: './a.png', headline: 'Step 1', url: 'https://renamed.to/1' },
    { image: './b.png', headline: 'Step 2', url: 'https://renamed.to/2' },
  ] as const

  test('creates CarouselAd with valid cards', () => {
    const ad = carousel(twoCards, { primaryText: 'See how it works' })
    expect(ad.format).toBe('carousel')
    expect(ad.cards).toHaveLength(2)
    expect(ad.primaryText).toBe('See how it works')
  })

  test('throws with fewer than 2 cards', () => {
    expect(() => carousel(
      [{ image: './a.png', headline: 'Only one', url: 'https://example.com' }],
      { primaryText: 'P' },
    )).toThrow('at least 2')
  })

  test('throws with more than 10 cards', () => {
    const elevenCards = Array.from({ length: 11 }, (_, i) => ({
      image: `./${i}.png`,
      headline: `Card ${i}`,
      url: `https://example.com/${i}`,
    }))
    expect(() => carousel(elevenCards, { primaryText: 'P' })).toThrow('at most 10')
  })

  test('includes optional fields', () => {
    const ad = carousel(twoCards, {
      primaryText: 'P',
      name: 'My Carousel',
      cta: 'LEARN_MORE',
      url: 'https://renamed.to',
      endCard: 'website',
    })
    expect(ad.name).toBe('My Carousel')
    expect(ad.cta).toBe('LEARN_MORE')
    expect(ad.url).toBe('https://renamed.to')
    expect(ad.endCard).toBe('website')
  })

  test('omits optional fields when not provided', () => {
    const ad = carousel(twoCards, { primaryText: 'P' })
    expect(ad.name).toBeUndefined()
    expect(ad.cta).toBeUndefined()
    expect(ad.url).toBeUndefined()
    expect(ad.endCard).toBeUndefined()
  })

  test('allows exactly 10 cards', () => {
    const tenCards = Array.from({ length: 10 }, (_, i) => ({
      image: `./${i}.png`, headline: `Card ${i}`, url: `https://example.com/${i}`,
    }))
    expect(() => carousel(tenCards, { primaryText: 'P' })).not.toThrow()
  })
})

// ─── Meta Bidding ──────────────────────────────────────────

describe('lowestCost()', () => {
  test('returns lowest cost strategy', () => {
    expect(lowestCost()).toEqual({ type: 'LOWEST_COST_WITHOUT_CAP' })
  })
})

describe('costCap()', () => {
  test('returns cost cap strategy', () => {
    expect(costCap(10)).toEqual({ type: 'COST_CAP', cap: 10 })
  })

  test('throws for non-positive amount', () => {
    expect(() => costCap(0)).toThrow('positive')
    expect(() => costCap(-5)).toThrow('positive')
  })
})

describe('bidCap()', () => {
  test('returns bid cap strategy', () => {
    expect(bidCap(5)).toEqual({ type: 'BID_CAP', cap: 5 })
  })

  test('throws for non-positive amount', () => {
    expect(() => bidCap(0)).toThrow('positive')
  })
})

describe('minRoas()', () => {
  test('returns minimum ROAS strategy', () => {
    expect(minRoas(2.5)).toEqual({ type: 'MINIMUM_ROAS', floor: 2.5 })
  })

  test('throws for non-positive floor', () => {
    expect(() => minRoas(0)).toThrow('positive')
    expect(() => minRoas(-1)).toThrow('positive')
  })
})

// ─── Meta Placement ────────────────────────────────────────

describe('automatic()', () => {
  test('returns automatic string', () => {
    expect(automatic()).toBe('automatic')
  })
})

describe('manual()', () => {
  test('returns manual placement with platforms only', () => {
    const p = manual(['facebook', 'instagram'])
    expect(p).toEqual({ platforms: ['facebook', 'instagram'] })
  })

  test('returns manual placement with platforms and positions', () => {
    const p = manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])
    expect(p).toEqual({
      platforms: ['facebook', 'instagram'],
      positions: ['feed', 'story', 'reels'],
    })
  })

  test('throws with no platforms', () => {
    expect(() => manual([])).toThrow('at least one')
  })

  test('omits positions when empty array', () => {
    const p = manual(['facebook'], [])
    expect(p).toEqual({ platforms: ['facebook'] })
  })
})

// ─── Lifetime Budget ──────────────────────────────────────

describe('lifetime()', () => {
  test('creates lifetime budget with default EUR', () => {
    const b = lifetime(500, '2026-04-01')
    expect(b).toEqual({
      amount: 500,
      currency: 'EUR',
      period: 'lifetime',
      endTime: '2026-04-01',
    })
  })

  test('creates lifetime budget with explicit USD', () => {
    const b = lifetime(1000, '2026-06-30', 'USD')
    expect(b).toEqual({
      amount: 1000,
      currency: 'USD',
      period: 'lifetime',
      endTime: '2026-06-30',
    })
  })

  test('throws for non-positive amount', () => {
    expect(() => lifetime(0, '2026-04-01')).toThrow('positive')
    expect(() => lifetime(-100, '2026-04-01')).toThrow('positive')
  })

  test('throws for empty endTime', () => {
    expect(() => lifetime(500, '')).toThrow('endTime')
  })
})

// ─── Composition (full spec example) ──────────────────────

describe('full DSL composition', () => {
  test('helpers compose into valid types for a campaign definition', () => {
    // Simulates the builder DSL example from the spec
    const budget = daily(5)
    const targeting = metaTargeting(
      geo('US', 'GB', 'CA', 'AU'),
      age(25, 65),
      audience('Website Visitors 30d'),
    )
    const bidding = lowestCost()
    const placements = automatic()
    const heroAd = image('./assets/hero.png', {
      headline: 'Rename Files Instantly',
      primaryText: 'Stop wasting hours organizing files manually...',
      description: 'AI-powered file renaming for teams',
    })
    const comparisonAd = image('./assets/comparison.png', {
      headline: 'Before & After',
      primaryText: 'See what renamed.to does to a messy folder',
      cta: 'LEARN_MORE',
      url: 'https://renamed.to/tour',
    })

    // Verify all pieces have the right shape
    expect(budget.period).toBe('daily')
    expect(targeting.geo[0]!.countries).toContain('US')
    expect(targeting.age).toEqual({ min: 25, max: 65 })
    expect(targeting.customAudiences).toEqual(['Website Visitors 30d'])
    expect(bidding.type).toBe('LOWEST_COST_WITHOUT_CAP')
    expect(placements).toBe('automatic')
    expect(heroAd.format).toBe('image')
    expect(heroAd.name).toBe('hero')
    expect(comparisonAd.cta).toBe('LEARN_MORE')
    expect(comparisonAd.url).toBe('https://renamed.to/tour')
  })

  test('interest targeting with construction vertical', () => {
    const targeting = metaTargeting(
      geo('US', 'DE'),
      age(30, 60),
      ...interests('Construction', 'Building Information Modeling'),
    )
    expect(targeting.interests).toHaveLength(2)
    expect(targeting.interests![0]!.name).toBe('Construction')
    expect(targeting.interests![1]!.name).toBe('Building Information Modeling')
  })

  test('lifetime budget + manual placement composition', () => {
    const budget = lifetime(500, '2026-04-01')
    const placements = manual(['facebook', 'instagram'], ['feed', 'story', 'reels'])

    expect(budget.period).toBe('lifetime')
    expect(budget.endTime).toBe('2026-04-01')
    expect(typeof placements).toBe('object')
    if (typeof placements !== 'string') {
      expect(placements.platforms).toContain('facebook')
      expect(placements.positions).toContain('reels')
    }
  })
})
