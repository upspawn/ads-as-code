// ─── Campaign Multiplication: Manifest ──────────────────
// Tracks which expanded files were generated, from what seed,
// with what transform, and at what round. Stored as .gen-manifest.json
// in the generated/ directory.

import { join } from 'node:path'

// ─── Types ──────────────────────────────────────────────

export type ManifestEntry = {
  readonly seed: string
  readonly transform: Record<string, string>
  readonly model: string
  readonly generatedAt: string
  readonly round: number
}

/** Keyed by generated file name (e.g. "search-dropbox.de.ts") */
export type Manifest = Record<string, ManifestEntry>

const MANIFEST_FILE = '.gen-manifest.json'

// ─── Functions ──────────────────────────────────────────

/**
 * Read the generation manifest from a directory.
 * Returns null if the file does not exist.
 */
export async function readManifest(generatedDir: string): Promise<Manifest | null> {
  const path = join(generatedDir, MANIFEST_FILE)
  const file = Bun.file(path)
  const exists = await file.exists()
  if (!exists) return null

  const text = await file.text()
  return JSON.parse(text) as Manifest
}

/**
 * Write the generation manifest to a directory.
 * Creates the file with formatted JSON for readability.
 */
export async function writeManifest(generatedDir: string, manifest: Manifest): Promise<void> {
  const path = join(generatedDir, MANIFEST_FILE)
  await Bun.write(path, JSON.stringify(manifest, null, 2) + '\n')
}

/**
 * Immutably update a single entry in the manifest.
 * Returns a new Manifest object.
 */
export function updateManifestEntry(
  manifest: Manifest,
  fileName: string,
  entry: ManifestEntry,
): Manifest {
  return { ...manifest, [fileName]: entry }
}
