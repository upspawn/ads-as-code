import { describe, test, expect } from 'bun:test'
import {
  subreddits,
  interests,
  keywords,
  geo,
  age,
  gender,
  device,
  os,
  customAudience,
  lookalike,
  expansion,
} from '../../src/helpers/reddit-targeting'
import type { RedditTargetingRule } from '../../src/reddit/types'

describe('reddit targeting helpers', () => {
  describe('subreddits()', () => {
    test('returns subreddits rule with correct _type', () => {
      const rule = subreddits('r/technology', 'r/programming')
      expect(rule).toEqual({ _type: 'subreddits', names: ['r/technology', 'r/programming'] })
    })

    test('requires at least one subreddit', () => {
      expect(() => subreddits()).toThrow('at least one')
    })
  })

  describe('interests()', () => {
    test('returns interests rule with correct _type', () => {
      const rule = interests('Technology', 'Gaming')
      expect(rule).toEqual({ _type: 'interests', names: ['Technology', 'Gaming'] })
    })

    test('requires at least one interest', () => {
      expect(() => interests()).toThrow('at least one')
    })
  })

  describe('keywords()', () => {
    test('returns keywords rule with correct _type', () => {
      const rule = keywords('typescript', 'javascript')
      expect(rule).toEqual({ _type: 'keywords', terms: ['typescript', 'javascript'] })
    })

    test('requires at least one keyword', () => {
      expect(() => keywords()).toThrow('at least one')
    })
  })

  describe('geo()', () => {
    test('returns geo rule with correct _type', () => {
      const rule = geo('US', 'DE')
      expect(rule).toEqual({ _type: 'geo', locations: ['US', 'DE'] })
    })

    test('requires at least one location', () => {
      expect(() => geo()).toThrow('at least one')
    })
  })

  describe('age()', () => {
    test('returns age rule with correct _type', () => {
      const rule = age(18, 35)
      expect(rule).toEqual({ _type: 'age', min: 18, max: 35 })
    })

    test('rejects min < 13', () => {
      expect(() => age(12, 35)).toThrow('min must be 13-65')
    })

    test('rejects max > 65', () => {
      expect(() => age(18, 66)).toThrow('max must be 13-65')
    })

    test('rejects min > max', () => {
      expect(() => age(35, 18)).toThrow('min (35) must be <= max (18)')
    })
  })

  describe('gender()', () => {
    test('returns gender rule with correct _type', () => {
      expect(gender('male')).toEqual({ _type: 'gender', value: 'male' })
      expect(gender('female')).toEqual({ _type: 'gender', value: 'female' })
      expect(gender('all')).toEqual({ _type: 'gender', value: 'all' })
    })
  })

  describe('device()', () => {
    test('returns device rule with correct _type', () => {
      const rule = device('mobile', 'desktop')
      expect(rule).toEqual({ _type: 'device', types: ['mobile', 'desktop'] })
    })

    test('requires at least one device type', () => {
      expect(() => device()).toThrow('at least one')
    })
  })

  describe('os()', () => {
    test('returns os rule with correct _type', () => {
      const rule = os('ios', 'android')
      expect(rule).toEqual({ _type: 'os', types: ['ios', 'android'] })
    })

    test('accepts all OS types', () => {
      const rule = os('ios', 'android', 'windows', 'macos')
      expect(rule).toEqual({ _type: 'os', types: ['ios', 'android', 'windows', 'macos'] })
    })

    test('requires at least one OS type', () => {
      expect(() => os()).toThrow('at least one')
    })
  })

  describe('customAudience()', () => {
    test('returns customAudience rule with correct _type', () => {
      const rule = customAudience('aud_123')
      expect(rule).toEqual({ _type: 'customAudience', id: 'aud_123' })
    })
  })

  describe('lookalike()', () => {
    test('returns lookalike rule with correct _type', () => {
      const rule = lookalike('aud_123')
      expect(rule).toEqual({ _type: 'lookalike', sourceId: 'aud_123' })
    })

    test('accepts optional config', () => {
      const rule = lookalike('aud_123', { country: 'US', ratio: 0.05 })
      expect(rule).toEqual({
        _type: 'lookalike',
        sourceId: 'aud_123',
        config: { country: 'US', ratio: 0.05 },
      })
    })
  })

  describe('expansion()', () => {
    test('returns expansion rule with enabled=true', () => {
      const rule = expansion(true)
      expect(rule).toEqual({ _type: 'expansion', enabled: true })
    })

    test('returns expansion rule with enabled=false', () => {
      const rule = expansion(false)
      expect(rule).toEqual({ _type: 'expansion', enabled: false })
    })
  })

  test('all helpers return valid RedditTargetingRule types', () => {
    // Type-level check: all results assignable to RedditTargetingRule
    const rules: RedditTargetingRule[] = [
      subreddits('r/test'),
      interests('Tech'),
      keywords('bun'),
      geo('US'),
      age(18, 65),
      gender('all'),
      device('mobile'),
      os('ios'),
      customAudience('aud_1'),
      lookalike('aud_2'),
      expansion(true),
    ]
    expect(rules).toHaveLength(11)
  })
})
