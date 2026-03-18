import Database from 'bun:sqlite'

const SCHEMA_VERSION = 2

const DEFAULT_PERFORMANCE_TTL_MINUTES = 15

type ResourceRow = {
  project: string
  path: string
  platformId: string | null
  kind: string
  managedBy: string
  lastSeen: string
}

type SnapshotRow = {
  id: number
  project: string
  timestamp: string
  source: string
  state: string
}

type OperationRow = {
  id: number
  project: string
  timestamp: string
  changeset: string
  results: string
  user: string
}

export class Cache {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.#ensureSchema()
  }

  // ─── Schema ──────────────────────────────────────────────────

  #ensureSchema(): void {
    const hasVersionTable = this.db
      .query<{ cnt: number }, []>(
        `SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='schema_version'`,
      )
      .get()

    if (!hasVersionTable || hasVersionTable.cnt === 0) {
      this.#createTables()
      return
    }

    const row = this.db
      .query<{ version: number }, []>(`SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`)
      .get()

    if (!row || row.version < SCHEMA_VERSION) {
      this.#createTables()
    }
  }

  #createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL,
        applied TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resource_map (
        project TEXT NOT NULL,
        path TEXT NOT NULL,
        platformId TEXT,
        kind TEXT NOT NULL,
        managedBy TEXT NOT NULL,
        lastSeen TEXT NOT NULL,
        PRIMARY KEY (project, path)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        state TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        changeset TEXT NOT NULL,
        results TEXT NOT NULL,
        "user" TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS performance_cache (
        project TEXT NOT NULL,
        provider TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project, provider, period_start, period_end)
      );
    `)

    // Record schema version (upsert: delete old, insert new)
    this.db.exec(`DELETE FROM schema_version`)
    this.db
      .query(`INSERT INTO schema_version (version, applied) VALUES (?, ?)`)
      .run(SCHEMA_VERSION, new Date().toISOString())
  }

  // ─── Resource Map ────────────────────────────────────────────

  getResourceMap(project: string): ResourceRow[] {
    return this.db
      .query<ResourceRow, [string]>(`SELECT * FROM resource_map WHERE project = ?`)
      .all(project)
  }

  setResource(resource: {
    project: string
    path: string
    platformId?: string | null
    kind: string
    managedBy: string
  }): void {
    this.db
      .query(
        `INSERT INTO resource_map (project, path, platformId, kind, managedBy, lastSeen)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project, path) DO UPDATE SET
           platformId = COALESCE(excluded.platformId, resource_map.platformId),
           kind = excluded.kind,
           managedBy = excluded.managedBy,
           lastSeen = excluded.lastSeen`,
      )
      .run(
        resource.project,
        resource.path,
        resource.platformId ?? null,
        resource.kind,
        resource.managedBy,
        new Date().toISOString(),
      )
  }

  removeResource(project: string, path: string): boolean {
    const result = this.db
      .query(`DELETE FROM resource_map WHERE project = ? AND path = ?`)
      .run(project, path)
    return result.changes > 0
  }

  getManagedPaths(project: string, managedBy: string): string[] {
    return this.db
      .query<{ path: string }, [string, string]>(
        `SELECT path FROM resource_map WHERE project = ? AND managedBy = ?`,
      )
      .all(project, managedBy)
      .map((row) => row.path)
  }

  // ─── Snapshots ───────────────────────────────────────────────

  saveSnapshot(snapshot: {
    project: string
    source: string
    state: Record<string, unknown> | unknown[]
  }): number {
    const result = this.db
      .query(
        `INSERT INTO snapshots (project, timestamp, source, state) VALUES (?, ?, ?, ?)`,
      )
      .run(
        snapshot.project,
        new Date().toISOString(),
        snapshot.source,
        JSON.stringify(snapshot.state),
      )
    return Number(result.lastInsertRowid)
  }

  getSnapshot(id: number): (Omit<SnapshotRow, 'state'> & { state: unknown }) | null {
    const row = this.db
      .query<SnapshotRow, [number]>(`SELECT * FROM snapshots WHERE id = ?`)
      .get(id)
    if (!row) return null
    return { ...row, state: JSON.parse(row.state) }
  }

  // ─── Operations ──────────────────────────────────────────────

  saveOperation(operation: {
    project: string
    changeset: Record<string, unknown> | unknown[]
    results: Record<string, unknown> | unknown[]
    user: string
  }): number {
    const result = this.db
      .query(
        `INSERT INTO operations (project, timestamp, changeset, results, "user") VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        operation.project,
        new Date().toISOString(),
        JSON.stringify(operation.changeset),
        JSON.stringify(operation.results),
        operation.user,
      )
    return Number(result.lastInsertRowid)
  }

  getOperations(
    project: string,
    options?: { limit?: number },
  ): (Omit<OperationRow, 'changeset' | 'results'> & { changeset: unknown; results: unknown })[] {
    const limit = options?.limit ?? 100
    const rows = this.db
      .query<OperationRow, [string, number]>(
        `SELECT * FROM operations WHERE project = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(project, limit)
    return rows.map((row) => ({
      ...row,
      changeset: JSON.parse(row.changeset),
      results: JSON.parse(row.results),
    }))
  }

  // ─── Performance Cache ───────────────────────────────────────

  /**
   * Retrieve cached performance data if it exists and is within TTL.
   * Returns null if no cache entry exists or if the entry has expired.
   */
  getCachedPerformance(
    project: string,
    provider: string,
    start: string,
    end: string,
    ttlMinutes: number = DEFAULT_PERFORMANCE_TTL_MINUTES,
  ): unknown[] | null {
    const row = this.db
      .query<{ data: string; cached_at: string }, [string, string, string, string]>(
        `SELECT data, cached_at FROM performance_cache
         WHERE project = ? AND provider = ? AND period_start = ? AND period_end = ?`,
      )
      .get(project, provider, start, end)

    if (!row) return null

    const cachedAt = new Date(row.cached_at + 'Z')
    const ageMs = Date.now() - cachedAt.getTime()
    if (ageMs > ttlMinutes * 60 * 1000) return null

    return JSON.parse(row.data) as unknown[]
  }

  /**
   * Store performance data in cache, replacing any existing entry for the same key.
   */
  setCachedPerformance(
    project: string,
    provider: string,
    start: string,
    end: string,
    data: unknown[],
  ): void {
    this.db
      .query(
        `INSERT INTO performance_cache (project, provider, period_start, period_end, data, cached_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project, provider, period_start, period_end) DO UPDATE SET
           data = excluded.data,
           cached_at = excluded.cached_at`,
      )
      .run(project, provider, start, end, JSON.stringify(data))
  }

  /**
   * Clear performance cache entries. If project is provided, only that project's
   * entries are removed. Otherwise all performance cache entries are cleared.
   */
  clearPerformanceCache(project?: string): void {
    if (project) {
      this.db.query(`DELETE FROM performance_cache WHERE project = ?`).run(project)
    } else {
      this.db.exec(`DELETE FROM performance_cache`)
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  close(): void {
    this.db.close()
  }
}
