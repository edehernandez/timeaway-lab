// Purpose: the one SQLite connection, the Drizzle schema and the migrations (ARCHITECTURE.md server/db).
// Nothing else opens the database file (D-002). Its public surface is this file.
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

export { schema }

let handle: BetterSQLite3Database<typeof schema> | null = null
let client: Database.Database | null = null

/** The database handle, opened once; migrations run on first open. */
export function db(): BetterSQLite3Database<typeof schema> {
  if (handle) return handle
  const file = process.env.TIMEAWAY_DB ?? resolve('.data/timeaway.sqlite')
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  client = sqlite
  handle = drizzle(sqlite, { schema })
  migrate(handle, { migrationsFolder: process.env.TIMEAWAY_MIGRATIONS ?? resolve('server/db/migrations') })
  return handle
}

/** Run fn inside one write transaction taken immediately (D-005). */
export function inWriteTransaction<T>(fn: (tx: BetterSQLite3Database<typeof schema>) => T): T {
  const d = db()
  return d.transaction((tx) => fn(tx as unknown as BetterSQLite3Database<typeof schema>), { behavior: 'immediate' })
}

/**
 * The store door's one statement (D-048, D-049): `sqlText` run as written on the product's own connection (foreign
 * keys on), past every domain rule, so the store's own constraints are what judge it. A statement that reads answers
 * its rows; any other answers how many rows it changed. Used only by the test control door (DIF-001).
 */
export function runStatement(sqlText: string, params: unknown[]): { rows: unknown[]; changes: number } {
  db()
  const stmt = client!.prepare(sqlText)
  if (stmt.reader) return { rows: stmt.all(...params), changes: 0 }
  return { rows: [], changes: stmt.run(...params).changes }
}
