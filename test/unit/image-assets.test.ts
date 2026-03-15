import { describe, expect, test } from 'bun:test'
import {
  landscape,
  square,
  portrait,
  logo,
  logoLandscape,
  detectMimeType,
  buildImageAssetCreate,
} from '../../src/google/image-assets.ts'

// ─── Image Ref Helpers ──────────────────────────────────

describe('image ref helpers', () => {
  test('landscape() creates a landscape image ref', () => {
    const ref = landscape('./hero.png')
    expect(ref).toEqual({
      type: 'image-ref',
      path: './hero.png',
      aspectRatio: 'landscape',
    })
  })

  test('square() creates a square image ref', () => {
    const ref = square('/assets/hero-square.jpg')
    expect(ref).toEqual({
      type: 'image-ref',
      path: '/assets/hero-square.jpg',
      aspectRatio: 'square',
    })
  })

  test('portrait() creates a portrait image ref', () => {
    const ref = portrait('ad-portrait.png')
    expect(ref).toEqual({
      type: 'image-ref',
      path: 'ad-portrait.png',
      aspectRatio: 'portrait',
    })
  })

  test('logo() creates a logo image ref', () => {
    const ref = logo('./logo.png')
    expect(ref).toEqual({
      type: 'image-ref',
      path: './logo.png',
      aspectRatio: 'logo',
    })
  })

  test('logoLandscape() creates a landscape logo image ref', () => {
    const ref = logoLandscape('./logo-wide.png')
    expect(ref).toEqual({
      type: 'image-ref',
      path: './logo-wide.png',
      aspectRatio: 'logo-landscape',
    })
  })

  test('all refs have type "image-ref"', () => {
    const refs = [
      landscape('a.png'),
      square('b.png'),
      portrait('c.png'),
      logo('d.png'),
      logoLandscape('e.png'),
    ]
    for (const ref of refs) {
      expect(ref.type).toBe('image-ref')
    }
  })

  test('refs are readonly plain objects', () => {
    const ref = landscape('./test.png')
    expect(typeof ref).toBe('object')
    expect(Object.keys(ref).sort()).toEqual(['aspectRatio', 'path', 'type'])
  })
})

// ─── MIME Type Detection ────────────────────────────────

describe('detectMimeType()', () => {
  test('detects JPEG from .jpg', () => {
    expect(detectMimeType('photo.jpg')).toBe(1)
  })

  test('detects JPEG from .jpeg', () => {
    expect(detectMimeType('photo.jpeg')).toBe(1)
  })

  test('detects PNG from .png', () => {
    expect(detectMimeType('image.png')).toBe(3)
  })

  test('detects GIF from .gif', () => {
    expect(detectMimeType('animation.gif')).toBe(2)
  })

  test('defaults to PNG for unknown extension', () => {
    expect(detectMimeType('image.webp')).toBe(3)
  })

  test('handles path with directories', () => {
    expect(detectMimeType('/assets/images/hero.jpg')).toBe(1)
  })

  test('handles uppercase extensions via lowercase normalization', () => {
    expect(detectMimeType('IMAGE.PNG')).toBe(3)
  })
})

// ─── Batch Mutation Builder ─────────────────────────────

describe('buildImageAssetCreate()', () => {
  test('builds correct mutation structure', () => {
    const mutation = buildImageAssetCreate(
      '1234567890',
      '-100',
      'base64data==',
      1024,
      3,
      'hero-image',
    )

    expect(mutation.operation).toBe('asset')
    expect(mutation.op).toBe('create')
    expect(mutation.resource.resource_name).toBe('customers/1234567890/assets/-100')
    expect(mutation.resource.name).toBe('hero-image')
    expect(mutation.resource.type).toBe(4) // IMAGE
    expect(mutation.resource.image_asset).toEqual({
      data: 'base64data==',
      file_size: 1024,
      mime_type: 3,
    })
  })

  test('uses provided temp ID in resource name', () => {
    const mutation = buildImageAssetCreate('999', '-42', 'data', 512, 1, 'test')
    expect(mutation.resource.resource_name).toBe('customers/999/assets/-42')
  })

  test('preserves all fields without modification', () => {
    const data = 'aGVsbG8='
    const mutation = buildImageAssetCreate('123', '-1', data, 100, 2, 'my-gif')
    const asset = mutation.resource.image_asset as Record<string, unknown>
    expect(asset.data).toBe(data)
    expect(asset.file_size).toBe(100)
    expect(asset.mime_type).toBe(2)
  })
})
