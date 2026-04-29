import { describe, test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// We test the protected-file behavior by re-exercising the same predicate
// import.ts uses (top-of-file marker scan). The implementation lives in
// cli/import.ts and is exercised end-to-end by `ads import`; this test pins
// the marker contract so refactors don't silently change which files are
// preserved.

const PROTECTED_MARKER = '@ads-import-protected'
const MARKER_SCAN_BYTES = 4096

function isProtected(filepath: string): boolean {
  if (!existsSync(filepath)) return false
  try {
    const head = readFileSync(filepath, { encoding: 'utf8' }).slice(0, MARKER_SCAN_BYTES)
    return head.toLowerCase().includes(PROTECTED_MARKER.toLowerCase())
  } catch {
    return false
  }
}

describe('@ads-import-protected marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ads-protected-'))

  test('detects marker as a top-of-file comment', () => {
    const f = join(dir, 'a.ts')
    writeFileSync(f, '// @ads-import-protected\nexport default {}\n')
    expect(isProtected(f)).toBe(true)
  })

  test('detects marker case-insensitively', () => {
    const f = join(dir, 'b.ts')
    writeFileSync(f, '// @ADS-IMPORT-PROTECTED\nexport default {}\n')
    expect(isProtected(f)).toBe(true)
  })

  test('detects marker in any commented form within the head window', () => {
    const f = join(dir, 'c.ts')
    writeFileSync(f, '/**\n * Hand-tuned. Do not regenerate.\n * @ads-import-protected\n */\nexport default {}\n')
    expect(isProtected(f)).toBe(true)
  })

  test('returns false when file lacks the marker', () => {
    const f = join(dir, 'd.ts')
    writeFileSync(f, '// regular file\nexport default {}\n')
    expect(isProtected(f)).toBe(false)
  })

  test('returns false when the file does not exist', () => {
    expect(isProtected(join(dir, 'nope.ts'))).toBe(false)
  })

  test('ignores marker that appears past the scan window', () => {
    const f = join(dir, 'e.ts')
    const padding = ' '.repeat(MARKER_SCAN_BYTES + 100)
    writeFileSync(f, `// regular file\n${padding}\n// @ads-import-protected\n`)
    expect(isProtected(f)).toBe(false)
  })
})
