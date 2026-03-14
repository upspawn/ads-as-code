import { Cache } from '../src/core/cache.ts'
import { join } from 'node:path'

/**
 * Show operation history from the cache.
 *
 * --diff N:     Show full changeset for operation N
 * --rollback N: Show snapshot N and generate a revert plan
 */
export async function runHistory(
  rootDir: string,
  options: { diff?: number; rollback?: number },
): Promise<void> {
  const cachePath = join(rootDir, '.ads', 'cache.db')

  let cache: Cache
  try {
    cache = new Cache(cachePath)
  } catch (err) {
    console.error('Cache not available:')
    console.error(err instanceof Error ? err.message : err)
    console.error()
    console.error('Run `ads apply` first to create the cache.')
    process.exit(1)
  }

  const project = 'default'

  // --diff N: show changeset for a specific operation
  if (options.diff !== undefined) {
    const ops = cache.getOperations(project, { limit: 1000 })
    const op = ops.find((o) => o.id === options.diff)

    if (!op) {
      console.error(`Operation #${options.diff} not found.`)
      cache.close()
      process.exit(1)
    }

    console.log(`Operation #${op.id}`)
    console.log(`  Timestamp: ${op.timestamp}`)
    console.log(`  User:      ${op.user}`)
    console.log()
    console.log('Changeset:')
    console.log(JSON.stringify(op.changeset, null, 2))
    console.log()
    console.log('Results:')
    console.log(JSON.stringify(op.results, null, 2))

    cache.close()
    return
  }

  // --rollback N: show snapshot and generate revert plan
  if (options.rollback !== undefined) {
    const snapshot = cache.getSnapshot(options.rollback)

    if (!snapshot) {
      console.error(`Snapshot #${options.rollback} not found.`)
      cache.close()
      process.exit(1)
    }

    console.log(`Snapshot #${snapshot.id}`)
    console.log(`  Timestamp: ${snapshot.timestamp}`)
    console.log(`  Source:    ${snapshot.source}`)
    console.log(`  Project:   ${snapshot.project}`)
    console.log()
    console.log('Captured state:')
    console.log(JSON.stringify(snapshot.state, null, 2))
    console.log()
    console.log(
      'To revert to this state, use `ads plan` with the snapshot state as the desired target.',
    )
    console.log('Automatic rollback is not yet implemented.')

    cache.close()
    return
  }

  // Default: list recent operations
  const operations = cache.getOperations(project, { limit: 20 })

  if (operations.length === 0) {
    console.log('No operations recorded yet.')
    console.log('Run `ads apply` to record operations.')
    cache.close()
    return
  }

  console.log('Recent operations:')
  console.log()

  // Column widths
  const idWidth = Math.max(2, ...operations.map((o) => String(o.id).length))

  const header = [
    '#'.padEnd(idWidth),
    'Timestamp'.padEnd(24),
    'User'.padEnd(16),
    'Changes',
    'Status',
  ].join('  ')

  const separator = '─'.repeat(header.length)

  console.log(header)
  console.log(separator)

  for (const op of operations) {
    const changeset = op.changeset as Record<string, unknown>
    const results = op.results as Record<string, unknown>

    // Count changes
    let changeCount = 0
    if (Array.isArray(changeset)) {
      changeCount = changeset.length
    } else if (typeof changeset === 'object' && changeset !== null) {
      const cs = changeset as { creates?: unknown[]; updates?: unknown[]; deletes?: unknown[] }
      changeCount = (cs.creates?.length ?? 0) + (cs.updates?.length ?? 0) + (cs.deletes?.length ?? 0)
    }

    // Determine status
    let status = 'unknown'
    if (Array.isArray(results)) {
      const hasErrors = results.some(
        (r: unknown) => typeof r === 'object' && r !== null && 'error' in (r as Record<string, unknown>),
      )
      status = hasErrors ? 'partial' : 'success'
    } else if (typeof results === 'object' && results !== null) {
      status = (results as Record<string, unknown>).success === false ? 'failed' : 'success'
    }

    const timestamp = op.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z')

    console.log(
      [
        String(op.id).padEnd(idWidth),
        timestamp.padEnd(24),
        (op.user || '—').padEnd(16),
        String(changeCount).padStart(7),
        `  ${status}`,
      ].join('  '),
    )
  }

  console.log()
  console.log(`${operations.length} operation(s)`)
  console.log()
  console.log('Use --diff N to see full changeset for operation N')
  console.log('Use --rollback N to view snapshot N for revert')

  cache.close()
}
