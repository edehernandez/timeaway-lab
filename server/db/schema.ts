// Purpose: the Drizzle schema (ARCHITECTURE.md server/db). Tables are added by the slices that need them;
// each table is written by exactly one domain module (BASELINE.md ownership law).
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Team-wide settings written at setup: the team time zone (CON-003, D-013). Owned by server/domain/accounts. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
