// === Lock File Types ===
// The .gen.json companion file stores AI-generated results alongside campaign definitions.
// It enables deterministic rebuilds, pinning, and round-trip stability.

export type LockSlot = {
  readonly prompt: string
  readonly judge?: string
  readonly result: Record<string, unknown>
  readonly pinned: number[]
  readonly round: number
  readonly judgeWarning?: string
}

export type LockFile = {
  readonly version: number
  readonly model: string
  readonly generatedAt: string
  readonly slots: Record<string, LockSlot>
}

// === Path Derivation ===

/** Derive the .gen.json companion path from a campaign .ts file path. */
function toLockPath(campaignFilePath: string): string {
  return campaignFilePath.replace(/\.ts$/, '.gen.json')
}

// === Read / Write ===

/**
 * Read and parse the .gen.json lock file for a given campaign file.
 * Returns null if the lock file does not exist.
 */
export async function readLockFile(campaignFilePath: string): Promise<LockFile | null> {
  const lockPath = toLockPath(campaignFilePath)
  const file = Bun.file(lockPath)
  const exists = await file.exists()
  if (!exists) return null
  const text = await file.text()
  return JSON.parse(text) as LockFile
}

/**
 * Write a lock file as formatted JSON to the .gen.json companion path.
 */
export async function writeLockFile(campaignFilePath: string, lockFile: LockFile): Promise<void> {
  const lockPath = toLockPath(campaignFilePath)
  await Bun.write(lockPath, JSON.stringify(lockFile, null, 2) + '\n')
}

// === Slot Operations ===

/** Get a slot by key, or undefined if not present. */
export function getSlot(lockFile: LockFile, key: string): LockSlot | undefined {
  return lockFile.slots[key]
}

/** Immutable update: set a slot by key, returning a new lock file. */
export function setSlot(lockFile: LockFile, key: string, slot: LockSlot): LockFile {
  return {
    ...lockFile,
    slots: { ...lockFile.slots, [key]: slot },
  }
}

/** Immutable update: add an index to a slot's pinned array. */
export function pinValue(lockFile: LockFile, slotKey: string, index: number): LockFile {
  const slot = lockFile.slots[slotKey]
  if (!slot) return lockFile
  const pinned = slot.pinned.includes(index) ? slot.pinned : [...slot.pinned, index]
  return setSlot(lockFile, slotKey, { ...slot, pinned })
}

/** Immutable update: remove an index from a slot's pinned array. */
export function unpinValue(lockFile: LockFile, slotKey: string, index: number): LockFile {
  const slot = lockFile.slots[slotKey]
  if (!slot) return lockFile
  const pinned = slot.pinned.filter((i) => i !== index)
  return setSlot(lockFile, slotKey, { ...slot, pinned })
}
