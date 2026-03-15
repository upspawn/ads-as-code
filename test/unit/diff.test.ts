import { describe, test, expect } from 'bun:test'
import {
  diff,
  compareProperties,
  normalizeUrl,
  setEqual,
  objectSetEqual,
  deepEqualSorted,
  toMicros,
} from '../../src/core/diff.ts'
import type { Resource, Change, PropertyChange } from '../../src/core/types.ts'

// ─── Helper: build a Resource quickly ─────────────────────

function resource(
  kind: Resource['kind'],
  path: string,
  properties: Record<string, unknown>,
  platformId?: string,
): Resource {
  return platformId ? { kind, path, properties, platformId } : { kind, path, properties }
}

// ─── toMicros ─────────────────────────────────────────────

describe('toMicros', () => {
  test('converts dollars to micros', () => {
    expect(toMicros(20)).toBe(20_000_000)
  })

  test('handles fractional amounts', () => {
    expect(toMicros(8.5)).toBe(8_500_000)
  })

  test('handles zero', () => {
    expect(toMicros(0)).toBe(0)
  })
})

// ─── normalizeUrl ─────────────────────────────────────────

describe('normalizeUrl', () => {
  test('removes trailing slash', () => {
    expect(normalizeUrl('https://renamed.to/pdf-renamer/')).toBe(
      'https://renamed.to/pdf-renamer',
    )
  })

  test('lowercases protocol', () => {
    expect(normalizeUrl('HTTPS://renamed.to/page')).toBe(
      'https://renamed.to/page',
    )
  })

  test('preserves root path slash', () => {
    const normalized = normalizeUrl('https://renamed.to/')
    expect(normalized).toBe('https://renamed.to/')
  })

  test('handles already-clean URLs', () => {
    expect(normalizeUrl('https://renamed.to/page')).toBe(
      'https://renamed.to/page',
    )
  })
})

// ─── setEqual ─────────────────────────────────────────────

describe('setEqual', () => {
  test('same elements, same order', () => {
    expect(setEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
  })

  test('same elements, different order', () => {
    expect(setEqual(['c', 'a', 'b'], ['a', 'b', 'c'])).toBe(true)
  })

  test('different elements', () => {
    expect(setEqual(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  test('different lengths', () => {
    expect(setEqual(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
  })

  test('empty arrays', () => {
    expect(setEqual([], [])).toBe(true)
  })
})

// ─── objectSetEqual ──────────────────────────────────────

describe('objectSetEqual', () => {
  test('same objects, same order', () => {
    const a = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    const b = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    expect(objectSetEqual(a, b, 'id')).toBe(true)
  })

  test('same objects, different order', () => {
    const a = [{ id: '2', name: 'B' }, { id: '1', name: 'A' }]
    const b = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    expect(objectSetEqual(a, b, 'id')).toBe(true)
  })

  test('different IDs', () => {
    const a = [{ id: '1', name: 'A' }]
    const b = [{ id: '2', name: 'B' }]
    expect(objectSetEqual(a, b, 'id')).toBe(false)
  })

  test('same IDs but different properties', () => {
    const a = [{ id: '1', name: 'A' }]
    const b = [{ id: '1', name: 'B' }]
    expect(objectSetEqual(a, b, 'id')).toBe(false)
  })

  test('different lengths', () => {
    const a = [{ id: '1', name: 'A' }]
    const b = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    expect(objectSetEqual(a, b, 'id')).toBe(false)
  })

  test('empty arrays', () => {
    expect(objectSetEqual([], [], 'id')).toBe(true)
  })
})

// ─── deepEqualSorted ────────────────────────────────────

describe('deepEqualSorted', () => {
  test('identical objects', () => {
    expect(deepEqualSorted({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  test('arrays in different order → equal (sorted before compare)', () => {
    expect(deepEqualSorted([3, 1, 2], [1, 2, 3])).toBe(true)
  })

  test('nested object with arrays in different order → equal', () => {
    const a = { interests: [{ id: '2' }, { id: '1' }], genders: [2, 1] }
    const b = { interests: [{ id: '1' }, { id: '2' }], genders: [1, 2] }
    expect(deepEqualSorted(a, b)).toBe(true)
  })

  test('different values → not equal', () => {
    expect(deepEqualSorted({ a: 1 }, { a: 2 })).toBe(false)
  })

  test('different array contents → not equal', () => {
    expect(deepEqualSorted([1, 2, 3], [1, 2, 4])).toBe(false)
  })

  test('primitives', () => {
    expect(deepEqualSorted(42, 42)).toBe(true)
    expect(deepEqualSorted('abc', 'abc')).toBe(true)
    expect(deepEqualSorted(42, 43)).toBe(false)
  })

  test('null handling', () => {
    expect(deepEqualSorted(null, null)).toBe(true)
    expect(deepEqualSorted(null, { a: 1 })).toBe(false)
  })
})

// ─── compareProperties ───────────────────────────────────

describe('compareProperties', () => {
  test('identical properties return no changes', () => {
    const props = { name: 'Test', status: 'enabled' }
    expect(compareProperties(props, props)).toEqual([])
  })

  test('detects added property', () => {
    const changes = compareProperties({ a: 1, b: 2 }, { a: 1 })
    expect(changes).toEqual([{ field: 'b', from: undefined, to: 2 }])
  })

  test('detects removed property', () => {
    const changes = compareProperties({ a: 1 }, { a: 1, b: 2 })
    expect(changes).toEqual([{ field: 'b', from: 2, to: undefined }])
  })

  test('detects changed value', () => {
    const changes = compareProperties({ a: 'new' }, { a: 'old' })
    expect(changes).toEqual([{ field: 'a', from: 'old', to: 'new' }])
  })

  test('budget: same amount in different float representation → no change', () => {
    const desired = { budget: { amount: 20, currency: 'EUR', period: 'daily' } }
    const actual = { budget: { amount: 20.0, currency: 'EUR', period: 'daily' } }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('budget: different amounts → change', () => {
    const desired = { budget: { amount: 25, currency: 'EUR', period: 'daily' } }
    const actual = { budget: { amount: 20, currency: 'EUR', period: 'daily' } }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('budget')
  })

  test('headlines: same content, different order → no change', () => {
    const desired = { headlines: ['Buy Now', 'Free Trial', 'Best Tool'] }
    const actual = { headlines: ['Free Trial', 'Best Tool', 'Buy Now'] }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('headlines: different content → change', () => {
    const desired = { headlines: ['Buy Now', 'Free Trial'] }
    const actual = { headlines: ['Buy Now', 'Sign Up'] }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('headlines')
  })

  test('descriptions: same content, different order → no change', () => {
    const desired = { descriptions: ['Desc B', 'Desc A'] }
    const actual = { descriptions: ['Desc A', 'Desc B'] }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('keyword text: case difference only → no change', () => {
    const desired = { text: 'rename PDF' }
    const actual = { text: 'Rename PDF' }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('keyword text: different content → change', () => {
    const desired = { text: 'rename PDF' }
    const actual = { text: 'organize files' }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('text')
  })

  test('finalUrl: trailing slash difference → no change', () => {
    const desired = { finalUrl: 'https://renamed.to/pdf-renamer' }
    const actual = { finalUrl: 'https://renamed.to/pdf-renamer/' }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('url (sitelink): trailing slash difference → no change', () => {
    const desired = { url: 'https://renamed.to/pricing' }
    const actual = { url: 'https://renamed.to/pricing/' }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('targeting: {rules:[]} vs undefined → no change (noise suppression)', () => {
    const desired = { name: 'Test', targeting: { rules: [] } }
    const actual = { name: 'Test' }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('targeting: undefined vs {rules:[]} → no change (noise suppression)', () => {
    const desired = { name: 'Test' }
    const actual = { name: 'Test', targeting: { rules: [] } }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('targeting: null vs undefined → no change (noise suppression)', () => {
    const desired = { name: 'Test', targeting: null }
    const actual = { name: 'Test', targeting: undefined }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('utm: undefined in one, missing in other → no change (noise suppression)', () => {
    const desired = { headlines: ['A'], utm: undefined }
    const actual = { headlines: ['A'] }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('targeting with actual rules → IS a change', () => {
    const desired = { name: 'Test', targeting: { rules: [{ type: 'geo', countries: ['US'] }] } }
    const actual = { name: 'Test' }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('targeting')
  })

  // ─── Meta: interests (unordered set by `id`) ─────────────

  test('interests: same interests, different order → no change', () => {
    const desired = {
      interests: [
        { id: '6003139266461', name: 'Construction' },
        { id: '6003012166780', name: 'Small business' },
        { id: '6003397425735', name: 'File management' },
      ],
    }
    const actual = {
      interests: [
        { id: '6003397425735', name: 'File management' },
        { id: '6003139266461', name: 'Construction' },
        { id: '6003012166780', name: 'Small business' },
      ],
    }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('interests: different IDs → change', () => {
    const desired = {
      interests: [
        { id: '6003139266461', name: 'Construction' },
        { id: '6003012166780', name: 'Small business' },
      ],
    }
    const actual = {
      interests: [
        { id: '6003139266461', name: 'Construction' },
        { id: '9999999999999', name: 'Something else' },
      ],
    }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('interests')
  })

  test('interests: different lengths → change', () => {
    const desired = {
      interests: [{ id: '6003139266461', name: 'Construction' }],
    }
    const actual = {
      interests: [
        { id: '6003139266461', name: 'Construction' },
        { id: '6003012166780', name: 'Small business' },
      ],
    }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('interests')
  })

  test('interests: empty arrays → no change', () => {
    expect(compareProperties({ interests: [] }, { interests: [] })).toEqual([])
  })

  // ─── Meta: customAudiences / excludedAudiences ───────────

  test('customAudiences: same audiences, different order → no change', () => {
    const desired = { customAudiences: ['aud-abc', 'aud-def', 'aud-ghi'] }
    const actual = { customAudiences: ['aud-ghi', 'aud-abc', 'aud-def'] }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('customAudiences: different audiences → change', () => {
    const desired = { customAudiences: ['aud-abc', 'aud-def'] }
    const actual = { customAudiences: ['aud-abc', 'aud-xyz'] }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('customAudiences')
  })

  test('excludedAudiences: same audiences, different order → no change', () => {
    const desired = { excludedAudiences: ['exc-1', 'exc-2'] }
    const actual = { excludedAudiences: ['exc-2', 'exc-1'] }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('excludedAudiences: different audiences → change', () => {
    const desired = { excludedAudiences: ['exc-1'] }
    const actual = { excludedAudiences: ['exc-1', 'exc-2'] }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('excludedAudiences')
  })

  // ─── Meta: targeting (deep compare with sorted arrays) ───

  test('targeting: nested arrays in different order → no change', () => {
    const desired = {
      targeting: {
        ageMin: 25,
        ageMax: 55,
        genders: [1, 2],
        interests: [
          { id: '6003139266461', name: 'Construction' },
          { id: '6003012166780', name: 'Small business' },
        ],
        behaviors: [
          { id: '99001', name: 'Business travelers' },
          { id: '99002', name: 'Commuters' },
        ],
      },
    }
    const actual = {
      targeting: {
        ageMin: 25,
        ageMax: 55,
        genders: [2, 1],
        interests: [
          { id: '6003012166780', name: 'Small business' },
          { id: '6003139266461', name: 'Construction' },
        ],
        behaviors: [
          { id: '99002', name: 'Commuters' },
          { id: '99001', name: 'Business travelers' },
        ],
      },
    }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('targeting: different nested values → change', () => {
    const desired = {
      targeting: { ageMin: 25, interests: [{ id: '111', name: 'A' }] },
    }
    const actual = {
      targeting: { ageMin: 30, interests: [{ id: '111', name: 'A' }] },
    }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('targeting')
  })

  // ─── Meta: budget from fetch (cents → core Budget) ───────

  test('budget: Meta cents converted to core Budget → correct micros comparison', () => {
    // Meta API returns budget in cents (e.g., 500 = $5.00).
    // The fetch layer converts this to core Budget: { amount: 5, currency: 'USD', period: 'daily' }.
    // The diff engine should compare this correctly via toMicros().
    const desired = { budget: { amount: 5, currency: 'USD', period: 'daily' } }
    const actual = { budget: { amount: 5.00, currency: 'USD', period: 'daily' } }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('budget: Meta lifetime budget compared correctly', () => {
    const desired = { budget: { amount: 100, currency: 'EUR', period: 'lifetime', endTime: '2026-04-01' } }
    const actual = { budget: { amount: 100, currency: 'EUR', period: 'lifetime', endTime: '2026-04-01' } }
    expect(compareProperties(desired, actual)).toEqual([])
  })

  test('budget: Meta lifetime budget with different endTime → change', () => {
    const desired = { budget: { amount: 100, currency: 'EUR', period: 'lifetime', endTime: '2026-04-01' } }
    const actual = { budget: { amount: 100, currency: 'EUR', period: 'lifetime', endTime: '2026-03-15' } }
    const changes = compareProperties(desired, actual)
    expect(changes.length).toBe(1)
    expect(changes[0]!.field).toBe('budget')
  })
})

// ─── diff ─────────────────────────────────────────────────

describe('diff', () => {
  test('new resource (in desired, not in actual) → create', () => {
    const desired = [resource('campaign', 'search-exact', { name: 'Search - Exact', status: 'enabled' })]
    const actual: Resource[] = []

    const cs = diff(desired, actual)
    expect(cs.creates.length).toBe(1)
    expect(cs.creates[0]).toEqual({ op: 'create', resource: desired[0]! })
    expect(cs.updates).toEqual([])
    expect(cs.deletes).toEqual([])
    expect(cs.drift).toEqual([])
  })

  test('removed managed resource (in actual+managedPaths, not in desired) → delete', () => {
    const desired: Resource[] = []
    const actual = [resource('keyword', 'search-exact/main/kw:old-term:EXACT', { text: 'old term', matchType: 'EXACT' })]
    const managedPaths = new Set(['search-exact/main/kw:old-term:EXACT'])

    const cs = diff(desired, actual, managedPaths)
    expect(cs.deletes.length).toBe(1)
    expect(cs.deletes[0]).toEqual({ op: 'delete', resource: actual[0]! })
    expect(cs.creates).toEqual([])
    expect(cs.updates).toEqual([])
  })

  test('removed unmanaged resource (in actual, NOT in managedPaths, not in desired) → ignored', () => {
    const desired: Resource[] = []
    const actual = [resource('keyword', 'competitor-campaign/group/kw:their-term:EXACT', { text: 'their term', matchType: 'EXACT' })]
    // No managedPaths at all, or empty
    const managedPaths = new Set<string>()

    const cs = diff(desired, actual, managedPaths)
    expect(cs.creates).toEqual([])
    expect(cs.updates).toEqual([])
    expect(cs.deletes).toEqual([])
    expect(cs.drift).toEqual([])
  })

  test('budget change → update with correct from/to PropertyChange', () => {
    const desired = [resource('campaign', 'search-exact', {
      name: 'Search - Exact',
      budget: { amount: 25, currency: 'EUR', period: 'daily' },
    })]
    const actual = [resource('campaign', 'search-exact', {
      name: 'Search - Exact',
      budget: { amount: 20, currency: 'EUR', period: 'daily' },
    })]

    const cs = diff(desired, actual)
    expect(cs.updates.length).toBe(1)
    const update = cs.updates[0] as Extract<Change, { op: 'update' }>
    expect(update.op).toBe('update')
    expect(update.changes.length).toBe(1)
    expect(update.changes[0]!.field).toBe('budget')
    expect(update.changes[0]!.from).toEqual({ amount: 20, currency: 'EUR', period: 'daily' })
    expect(update.changes[0]!.to).toEqual({ amount: 25, currency: 'EUR', period: 'daily' })
  })

  test('headline order change only → NOT an update (order-independent)', () => {
    const desired = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['Try Free', 'Best Tool', 'Buy Now'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to',
    })]
    const actual = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['Buy Now', 'Try Free', 'Best Tool'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to',
    })]

    const cs = diff(desired, actual)
    expect(cs.updates).toEqual([])
    expect(cs.creates).toEqual([])
  })

  test('headline content change → IS an update', () => {
    const desired = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['New Headline', 'Best Tool'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to',
    })]
    const actual = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['Old Headline', 'Best Tool'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to',
    })]

    const cs = diff(desired, actual)
    expect(cs.updates.length).toBe(1)
    const update = cs.updates[0] as Extract<Change, { op: 'update' }>
    expect(update.changes[0]!.field).toBe('headlines')
  })

  test('keyword case difference only → NOT an update (case-insensitive)', () => {
    const desired = [resource('keyword', 'camp/group/kw:rename pdf:EXACT', {
      text: 'rename pdf',
      matchType: 'EXACT',
    })]
    const actual = [resource('keyword', 'camp/group/kw:rename pdf:EXACT', {
      text: 'Rename PDF',
      matchType: 'EXACT',
    })]

    const cs = diff(desired, actual)
    expect(cs.updates).toEqual([])
  })

  test('URL trailing slash difference → NOT an update', () => {
    const desired = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['Buy Now'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to/pdf-renamer',
    })]
    const actual = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['Buy Now'],
      descriptions: ['Desc A'],
      finalUrl: 'https://renamed.to/pdf-renamer/',
    })]

    const cs = diff(desired, actual)
    expect(cs.updates).toEqual([])
  })

  test('no changes at all → empty changeset', () => {
    const resources = [
      resource('campaign', 'search-exact', { name: 'Search - Exact', status: 'enabled' }),
      resource('keyword', 'search-exact/main/kw:rename:EXACT', { text: 'rename', matchType: 'EXACT' }),
    ]

    const cs = diff(resources, resources)
    expect(cs.creates).toEqual([])
    expect(cs.updates).toEqual([])
    expect(cs.deletes).toEqual([])
    expect(cs.drift).toEqual([])
  })

  test('multiple resources, mixed changes → correct classification', () => {
    const desired = [
      resource('campaign', 'campaign-a', { name: 'Campaign A', status: 'enabled' }),
      resource('campaign', 'campaign-b', { name: 'Campaign B', status: 'paused' }),
      resource('keyword', 'campaign-a/group/kw:new-term:EXACT', { text: 'new term', matchType: 'EXACT' }),
    ]
    const actual = [
      resource('campaign', 'campaign-a', { name: 'Campaign A', status: 'paused' }),  // changed
      resource('keyword', 'campaign-a/group/kw:old-term:EXACT', { text: 'old term', matchType: 'EXACT' }),  // managed, removed
      resource('campaign', 'external-camp', { name: 'External', status: 'enabled' }),  // unmanaged
    ]
    const managedPaths = new Set([
      'campaign-a',
      'campaign-a/group/kw:old-term:EXACT',
    ])

    const cs = diff(desired, actual, managedPaths)

    // campaign-b and new-term keyword: both new → creates
    expect(cs.creates.length).toBe(2)
    const createPaths = cs.creates.map((c) => c.resource.path).sort()
    expect(createPaths).toEqual(['campaign-a/group/kw:new-term:EXACT', 'campaign-b'])

    // campaign-a: status changed → update
    expect(cs.updates.length).toBe(1)
    expect(cs.updates[0]!.resource.path).toBe('campaign-a')

    // old-term keyword: in managedPaths, not in desired → delete
    expect(cs.deletes.length).toBe(1)
    expect(cs.deletes[0]!.resource.path).toBe('campaign-a/group/kw:old-term:EXACT')

    // external-camp: not managed, not in desired → ignored (no delete)
    expect(cs.drift).toEqual([])
  })

  test('RSA with changed hash but matching platformId in cache → update, not delete+create', () => {
    // Desired: new ad content (different path hash)
    const desired = [resource('ad', 'camp/group/rsa:newhash', {
      headlines: ['Updated Headline', 'Best Tool'],
      descriptions: ['New description'],
      finalUrl: 'https://renamed.to',
    })]

    // Actual: old ad still on the platform with its platformId
    const actual = [resource('ad', 'camp/group/rsa:oldhash', {
      headlines: ['Old Headline', 'Best Tool'],
      descriptions: ['Old description'],
      finalUrl: 'https://renamed.to',
    }, 'platform-ad-12345')]

    // Cache knows the old path → platformId mapping
    const pathToPlatformId = new Map([
      ['camp/group/rsa:oldhash', 'platform-ad-12345'],
    ])

    const cs = diff(desired, actual, new Set(), pathToPlatformId)

    // Should be an update to the existing ad, not delete + create
    expect(cs.creates).toEqual([])
    expect(cs.deletes).toEqual([])
    expect(cs.updates.length).toBe(1)

    const update = cs.updates[0] as Extract<Change, { op: 'update' }>
    expect(update.op).toBe('update')
    expect(update.resource.platformId).toBe('platform-ad-12345')
    expect(update.resource.path).toBe('camp/group/rsa:newhash')
  })

  test('RSA cache match: old path still in desired → no false match', () => {
    // Both old and new paths exist in desired — the cache should NOT
    // match the actual to the new one since the old path is still desired
    const desired = [
      resource('ad', 'camp/group/rsa:oldhash', {
        headlines: ['Old Headline'],
        descriptions: ['Old desc'],
        finalUrl: 'https://renamed.to',
      }),
      resource('ad', 'camp/group/rsa:newhash', {
        headlines: ['New Headline'],
        descriptions: ['New desc'],
        finalUrl: 'https://renamed.to',
      }),
    ]

    const actual = [resource('ad', 'camp/group/rsa:oldhash', {
      headlines: ['Old Headline'],
      descriptions: ['Old desc'],
      finalUrl: 'https://renamed.to',
    }, 'platform-ad-12345')]

    const pathToPlatformId = new Map([
      ['camp/group/rsa:oldhash', 'platform-ad-12345'],
    ])

    const cs = diff(desired, actual, new Set(), pathToPlatformId)

    // Old path matched directly → no change for it
    // New path: old path is still in desired, so cache should NOT match → create
    expect(cs.creates.length).toBe(1)
    expect(cs.creates[0]!.resource.path).toBe('camp/group/rsa:newhash')
    expect(cs.updates).toEqual([])
    expect(cs.deletes).toEqual([])
  })

  test('no managedPaths provided → no deletes for unmatched actual resources', () => {
    const desired: Resource[] = []
    const actual = [resource('campaign', 'some-campaign', { name: 'Some Campaign' })]

    // No managedPaths argument at all
    const cs = diff(desired, actual)
    expect(cs.deletes).toEqual([])
  })

  test('multiple semantic comparisons combined in one resource', () => {
    const desired = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['B', 'A'],  // reordered
      descriptions: ['Y', 'X'],  // reordered
      finalUrl: 'https://renamed.to/page',  // no trailing slash
      text: 'rename pdf',  // lowercase
    })]
    const actual = [resource('ad', 'camp/group/rsa:abc', {
      headlines: ['A', 'B'],
      descriptions: ['X', 'Y'],
      finalUrl: 'https://renamed.to/page/',  // trailing slash
      text: 'Rename PDF',  // uppercase
    })]

    const cs = diff(desired, actual)
    expect(cs.updates).toEqual([])  // All differences are semantic-only
  })
})
