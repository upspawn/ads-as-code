import { existsSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'bun:sqlite'

/**
 * Manage the local cache database.
 *
 * Actions:
 *   clear — Delete the cache.db file
 *   stats — Print resource count, snapshot count, last operation, file size
 */
export async function runCache(
  rootDir: string,
  action: 'clear' | 'stats',
): Promise<void> {
  const cachePath = join(rootDir, '.ads', 'cache.db')

  if (action === 'clear') {
    const filesToRemove = [cachePath, `${cachePath}-wal`, `${cachePath}-shm`]
    let removed = false

    for (const file of filesToRemove) {
      if (existsSync(file)) {
        unlinkSync(file)
        removed = true
      }
    }

    if (removed) {
      console.log('Cache cleared: .ads/cache.db deleted')
    } else {
      console.log('No cache file found at .ads/cache.db')
    }
    return
  }

  if (action === 'stats') {
    if (!existsSync(cachePath)) {
      console.log('No cache file found at .ads/cache.db')
      console.log('Run `ads apply` to create the cache.')
      return
    }

    // File size
    const stat = statSync(cachePath)
    const sizeKB = (stat.size / 1024).toFixed(1)

    // Open the database directly for count queries
    let db: Database
    try {
      db = new Database(cachePath, { readonly: true })
    } catch (err) {
      console.error('Failed to open cache:')
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }

    const resourceCount =
      db.query<{ cnt: number }, []>(`SELECT count(*) as cnt FROM resource_map`).get()?.cnt ?? 0

    const snapshotCount =
      db.query<{ cnt: number }, []>(`SELECT count(*) as cnt FROM snapshots`).get()?.cnt ?? 0

    const operationCount =
      db.query<{ cnt: number }, []>(`SELECT count(*) as cnt FROM operations`).get()?.cnt ?? 0

    const lastOp = db
      .query<{ timestamp: string; user: string }, []>(
        `SELECT timestamp, "user" FROM operations ORDER BY id DESC LIMIT 1`,
      )
      .get()

    db.close()

    console.log('Cache stats:')
    console.log(`  File:            .ads/cache.db (${sizeKB} KB)`)
    console.log(`  Resources:       ${resourceCount}`)
    console.log(`  Snapshots:       ${snapshotCount}`)
    console.log(`  Operations:      ${operationCount}`)

    if (lastOp) {
      const timestamp = lastOp.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z')
      console.log(`  Last operation:  ${timestamp} (by ${lastOp.user || '—'})`)
    } else {
      console.log(`  Last operation:  none`)
    }

    return
  }
}
