import { describe, test, expect } from 'bun:test'
import {
  image,
  video,
  carousel,
  freeform,
  product,
} from '../../src/helpers/reddit-creative'
import type { RedditAd } from '../../src/reddit/types'

describe('reddit creative helpers', () => {
  describe('image()', () => {
    test('returns image ad with correct format', () => {
      const ad = image('./hero.jpg', { headline: 'Check this out', clickUrl: 'https://example.com' })
      expect(ad).toEqual({
        format: 'image',
        filePath: './hero.jpg',
        config: { headline: 'Check this out', clickUrl: 'https://example.com' },
      })
    })

    test('includes optional body and cta', () => {
      const ad = image('./hero.jpg', {
        headline: 'Title',
        body: 'Body text',
        clickUrl: 'https://example.com',
        cta: 'LEARN_MORE',
        thumbnail: './thumb.jpg',
      })
      expect(ad.format).toBe('image')
      if (ad.format !== 'image') throw new Error('unreachable')
      expect(ad.config.body).toBe('Body text')
      expect(ad.config.cta).toBe('LEARN_MORE')
      expect(ad.config.thumbnail).toBe('./thumb.jpg')
    })

    test('validates headline max 300 chars', () => {
      expect(() => image('./hero.jpg', {
        headline: 'x'.repeat(301),
        clickUrl: 'https://example.com',
      })).toThrow('300')
    })
  })

  describe('video()', () => {
    test('returns video ad with correct format', () => {
      const ad = video('./demo.mp4', { headline: 'Watch now', clickUrl: 'https://example.com' })
      expect(ad).toEqual({
        format: 'video',
        filePath: './demo.mp4',
        config: { headline: 'Watch now', clickUrl: 'https://example.com' },
      })
    })

    test('includes optional fields', () => {
      const ad = video('./demo.mp4', {
        headline: 'Demo',
        body: 'See it in action',
        clickUrl: 'https://example.com',
        cta: 'WATCH_MORE',
        thumbnail: './thumb.jpg',
      })
      expect(ad.format).toBe('video')
      if (ad.format !== 'video') throw new Error('unreachable')
      expect(ad.config.body).toBe('See it in action')
      expect(ad.config.cta).toBe('WATCH_MORE')
      expect(ad.config.thumbnail).toBe('./thumb.jpg')
    })

    test('validates headline max 300 chars', () => {
      expect(() => video('./demo.mp4', {
        headline: 'x'.repeat(301),
        clickUrl: 'https://example.com',
      })).toThrow('300')
    })
  })

  describe('carousel()', () => {
    const validCards = [
      { image: './a.jpg', headline: 'Card 1', url: 'https://example.com/1' },
      { image: './b.jpg', headline: 'Card 2', url: 'https://example.com/2' },
    ] as const

    test('returns carousel ad with correct format', () => {
      const ad = carousel(validCards)
      expect(ad.format).toBe('carousel')
      if (ad.format !== 'carousel') throw new Error('unreachable')
      expect(ad.cards).toEqual(validCards)
    })

    test('includes optional config', () => {
      const ad = carousel(validCards, { clickUrl: 'https://example.com', cta: 'SHOP_NOW' })
      expect(ad.format).toBe('carousel')
      expect(ad.config.clickUrl).toBe('https://example.com')
      expect(ad.config.cta).toBe('SHOP_NOW')
    })

    test('rejects fewer than 2 cards', () => {
      expect(() => carousel([validCards[0]])).toThrow('2')
    })

    test('rejects more than 6 cards', () => {
      const tooMany = Array.from({ length: 7 }, (_, i) => ({
        image: `./img${i}.jpg`,
        headline: `Card ${i}`,
        url: `https://example.com/${i}`,
      }))
      expect(() => carousel(tooMany)).toThrow('6')
    })

    test('accepts exactly 6 cards', () => {
      const sixCards = Array.from({ length: 6 }, (_, i) => ({
        image: `./img${i}.jpg`,
        headline: `Card ${i}`,
        url: `https://example.com/${i}`,
      }))
      const ad = carousel(sixCards)
      if (ad.format !== 'carousel') throw new Error('unreachable')
      expect(ad.cards).toHaveLength(6)
    })
  })

  describe('freeform()', () => {
    test('returns freeform ad with correct format', () => {
      const ad = freeform({ headline: 'Custom Post', body: 'Rich content here' })
      expect(ad).toEqual({
        format: 'freeform',
        config: { headline: 'Custom Post', body: 'Rich content here' },
      })
    })

    test('includes optional media', () => {
      const ad = freeform({
        headline: 'Post',
        body: 'Content',
        images: ['./a.jpg', './b.jpg'],
        videos: ['./c.mp4'],
        clickUrl: 'https://example.com',
        cta: 'LEARN_MORE',
      })
      expect(ad.format).toBe('freeform')
      if (ad.format !== 'freeform') throw new Error('unreachable')
      expect(ad.config.images).toEqual(['./a.jpg', './b.jpg'])
      expect(ad.config.videos).toEqual(['./c.mp4'])
      expect(ad.config.clickUrl).toBe('https://example.com')
      expect(ad.config.cta).toBe('LEARN_MORE')
    })

    test('validates headline max 300 chars', () => {
      expect(() => freeform({
        headline: 'x'.repeat(301),
        body: 'Content',
      })).toThrow('300')
    })
  })

  describe('product()', () => {
    test('returns product ad with correct format', () => {
      const ad = product({ catalogId: 'cat_123', headline: 'Shop Now' })
      expect(ad).toEqual({
        format: 'product',
        config: { catalogId: 'cat_123', headline: 'Shop Now' },
      })
    })

    test('includes optional fields', () => {
      const ad = product({
        catalogId: 'cat_123',
        headline: 'Products',
        clickUrl: 'https://example.com',
        cta: 'SHOP_NOW',
      })
      expect(ad.config.clickUrl).toBe('https://example.com')
      expect(ad.config.cta).toBe('SHOP_NOW')
    })

    test('validates headline max 300 chars', () => {
      expect(() => product({
        headline: 'x'.repeat(301),
        catalogId: 'cat_1',
      })).toThrow('300')
    })
  })

  test('all helpers return valid RedditAd types', () => {
    const ads: RedditAd[] = [
      image('./hero.jpg', { headline: 'Title', clickUrl: 'https://example.com' }),
      video('./demo.mp4', { headline: 'Title', clickUrl: 'https://example.com' }),
      carousel([
        { image: './a.jpg', headline: 'A', url: 'https://a.com' },
        { image: './b.jpg', headline: 'B', url: 'https://b.com' },
      ]),
      freeform({ headline: 'Post', body: 'Body' }),
      product({ catalogId: 'cat_1', headline: 'Shop' }),
    ]
    expect(ads).toHaveLength(5)
  })
})
