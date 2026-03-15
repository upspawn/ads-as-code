import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readLockFile,
  writeLockFile,
  getSlot,
  setSlot,
  pinValue,
  unpinValue,
  isSlotStale,
} from '../../src/ai/lockfile.ts'
import type { LockFile, LockSlot } from '../../src/ai/lockfile.ts'

// ─── Fixtures ───────────────────────────────────────────────────────

function makeLockFile(overrides?: Partial<LockFile>): LockFile {
  return {
    version: 1,
    model: 'claude-sonnet-4-20250514',
    generatedAt: '2026-03-15T12:00:00Z',
    slots: {},
    ...overrides,
  }
}

function makeSlot(overrides?: Partial<LockSlot>): LockSlot {
  return {
    prompt: 'generate headlines',
    result: { headlines: ['H1', 'H2', 'H3'] },
    pinned: [],
    round: 1,
    ...overrides,
  }
}

// ─── File I/O Tests ─────────────────────────────────────────────────

describe('lock file I/O', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ads-lock-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('writeLockFile writes valid JSON', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    const lockFile = makeLockFile()

    await writeLockFile(campaignPath, lockFile)

    const lockPath = join(tempDir, 'campaign.gen.json')
    const content = await Bun.file(lockPath).text()
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(1)
    expect(parsed.model).toBe('claude-sonnet-4-20250514')
  })

  test('readLockFile reads and parses companion .gen.json', async () => {
    const campaignPath = join(tempDir, 'campaign.ts')
    const lockFile = makeLockFile({
      slots: { 'main/rsa': makeSlot() },
    })

    await writeLockFile(campaignPath, lockFile)
    const result = await readLockFile(campaignPath)

    expect(result).not.toBeNull()
    expect(result!.version).toBe(1)
    expect(result!.slots['main/rsa']).toBeDefined()
    expect(result!.slots['main/rsa']!.prompt).toBe('generate headlines')
  })

  test('readLockFile returns null when no lock file exists', async () => {
    const campaignPath = join(tempDir, 'nonexistent.ts')
    const result = await readLockFile(campaignPath)
    expect(result).toBeNull()
  })

  test('round-trip: write then read returns identical data', async () => {
    const campaignPath = join(tempDir, 'roundtrip.ts')
    const lockFile = makeLockFile({
      slots: {
        'en-us/rsa': makeSlot({ judge: 'strict', pinned: [0, 2], round: 3 }),
        'de/keywords': makeSlot({ prompt: 'generate keywords', result: { keywords: ['kw1', 'kw2'] } }),
      },
    })

    await writeLockFile(campaignPath, lockFile)
    const result = await readLockFile(campaignPath)

    expect(result).toEqual(lockFile)
  })
})

// ─── Slot Operations Tests ──────────────────────────────────────────

describe('getSlot / setSlot', () => {
  test('getSlot returns slot by key', () => {
    const slot = makeSlot()
    const lockFile = makeLockFile({ slots: { 'main/rsa': slot } })

    expect(getSlot(lockFile, 'main/rsa')).toEqual(slot)
  })

  test('getSlot returns undefined for missing key', () => {
    const lockFile = makeLockFile()
    expect(getSlot(lockFile, 'nonexistent')).toBeUndefined()
  })

  test('setSlot adds a new slot immutably', () => {
    const lockFile = makeLockFile()
    const slot = makeSlot()

    const updated = setSlot(lockFile, 'main/rsa', slot)

    // Original unchanged
    expect(lockFile.slots['main/rsa']).toBeUndefined()
    // Updated has the slot
    expect(updated.slots['main/rsa']).toEqual(slot)
  })

  test('setSlot replaces an existing slot', () => {
    const original = makeSlot({ round: 1 })
    const replacement = makeSlot({ round: 2 })
    const lockFile = makeLockFile({ slots: { 'main/rsa': original } })

    const updated = setSlot(lockFile, 'main/rsa', replacement)

    expect(updated.slots['main/rsa']!.round).toBe(2)
    expect(lockFile.slots['main/rsa']!.round).toBe(1) // original unchanged
  })
})

describe('pinValue / unpinValue', () => {
  test('pinValue adds an index to the pinned array', () => {
    const lockFile = makeLockFile({
      slots: { 'main/rsa': makeSlot({ pinned: [0] }) },
    })

    const updated = pinValue(lockFile, 'main/rsa', 2)
    expect(updated.slots['main/rsa']!.pinned).toEqual([0, 2])
  })

  test('pinValue is idempotent — does not duplicate', () => {
    const lockFile = makeLockFile({
      slots: { 'main/rsa': makeSlot({ pinned: [0, 2] }) },
    })

    const updated = pinValue(lockFile, 'main/rsa', 2)
    expect(updated.slots['main/rsa']!.pinned).toEqual([0, 2])
  })

  test('pinValue on missing slot returns lockfile unchanged', () => {
    const lockFile = makeLockFile()
    const updated = pinValue(lockFile, 'nonexistent', 0)
    expect(updated).toEqual(lockFile)
  })

  test('unpinValue removes an index from the pinned array', () => {
    const lockFile = makeLockFile({
      slots: { 'main/rsa': makeSlot({ pinned: [0, 1, 2] }) },
    })

    const updated = unpinValue(lockFile, 'main/rsa', 1)
    expect(updated.slots['main/rsa']!.pinned).toEqual([0, 2])
  })

  test('unpinValue on missing index is a no-op', () => {
    const lockFile = makeLockFile({
      slots: { 'main/rsa': makeSlot({ pinned: [0, 2] }) },
    })

    const updated = unpinValue(lockFile, 'main/rsa', 5)
    expect(updated.slots['main/rsa']!.pinned).toEqual([0, 2])
  })

  test('unpinValue on missing slot returns lockfile unchanged', () => {
    const lockFile = makeLockFile()
    const updated = unpinValue(lockFile, 'nonexistent', 0)
    expect(updated).toEqual(lockFile)
  })
})

// ─── Staleness Detection Tests ──────────────────────────────────────

describe('isSlotStale', () => {
  test('returns false when prompt matches', () => {
    const slot = makeSlot({ prompt: 'generate headlines for product' })
    expect(isSlotStale(slot, 'generate headlines for product')).toBe(false)
  })

  test('returns true when prompt differs', () => {
    const slot = makeSlot({ prompt: 'generate headlines for product' })
    expect(isSlotStale(slot, 'generate headlines for NEW product')).toBe(true)
  })

  test('treats whitespace differences as stale', () => {
    const slot = makeSlot({ prompt: 'generate headlines' })
    expect(isSlotStale(slot, 'generate  headlines')).toBe(true)
  })
})
