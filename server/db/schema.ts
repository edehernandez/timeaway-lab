// Purpose: the Drizzle schema (ARCHITECTURE.md server/db). Tables are added by the slices that need them,
// each with the code that reads it; each table is written by exactly one domain module (BASELINE.md ownership law).
//
// The accounts module's tables (REQ-013, REQ-014, REQ-015, REQ-024, REQ-026, REQ-027, D-003, D-025):
//   - accounts.email is stored trimmed and lower-cased; the CHECK and the UNIQUE index make the store itself refuse
//     a second account with the same email (REQ-013 arm 2, ROW-171) and an email kept in any other form.
//   - accounts.name_key is the display name trimmed and lower-cased; the partial UNIQUE index over switched-on
//     accounts makes the store refuse two switched-on accounts with one name (REQ-024, ROW-254), while a name held
//     only by switched-off accounts stays free (ROW-255).
//   - sessions.token_hash is the SHA-256 of the cookie's random identifier (D-003, D-032): the identifier itself is
//     never stored.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // Bumped by every password set or change; a sign-in only opens a session when it is unchanged since the
    // password was checked (ROW-169).
    passwordVersion: integer('password_version').notNull().default(1),
    // 1 while the password is one the admin set: the person must choose their own first (REQ-026).
    mustChangePassword: integer('must_change_password').notNull().default(1),
    isAdmin: integer('is_admin').notNull().default(0),
    switchedOn: integer('switched_on').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('accounts_email_unique').on(t.email),
    uniqueIndex('accounts_name_key_on_unique').on(t.nameKey).where(sql`${t.switchedOn} = 1`),
    check('accounts_email_normalised', sql`${t.email} = lower(trim(${t.email})) AND length(${t.email}) > 0`),
    check('accounts_name_key_present', sql`length(${t.nameKey}) > 0`),
    check('accounts_flags', sql`${t.isAdmin} IN (0, 1) AND ${t.switchedOn} IN (0, 1) AND ${t.mustChangePassword} IN (0, 1)`),
  ],
)

export const accountAllowances = sqliteTable(
  'account_allowances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    allowance: integer('allowance').notNull(),
    startsYear: integer('starts_year').notNull(),
    madeAt: text('made_at').notNull(),
    madeBy: integer('made_by').references(() => accounts.id),
  },
  (t) => [
    index('account_allowances_account').on(t.accountId),
    check('account_allowances_range', sql`${t.allowance} BETWEEN 0 AND 260`),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('sessions_account').on(t.accountId)],
)

export const accountEvents = sqliteTable(
  'account_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    byAccountId: integer('by_account_id').references(() => accounts.id),
    at: text('at').notNull(),
    what: text('what').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
  },
  (t) => [index('account_events_account').on(t.accountId)],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
