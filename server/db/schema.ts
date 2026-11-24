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

// The requests module's table (REQ-001 to REQ-005, D-036). What its values mean, held by the store:
//   - kind is 'vacation' or 'sick' only (REQ-001 arm 1); state is one of the four states of RULE-004.
//   - first_day and last_day are real calendar dates written exactly YYYY-MM-DD (D-007): `date(x) IS x` refuses an
//     impossible day such as 2027-02-30, which SQLite would otherwise roll over (ROW-131); the last day is not before
//     the first and both lie in one calendar year (REQ-004 arms 4 and 5).
//   - counted_days is the number of Monday to Friday days from the first to the last day, both included, at least 1
//     (REQ-001 arms 2 and 3); the module computes it, the store refuses a request that counts none.
//   - decided_at and decided_by are when and by whom the admin approved or rejected it (REQ-017 arm 4); a cancel never
//     overwrites them (arm 5). rejection_note is the admin's note, 1 to 200 characters (REQ-008 arm 5; SQLite's length
//     counts characters, not bytes), absent when none was given.
//   - cancel_from is the Monday to Friday day a partial cancel takes effect from (REQ-019, D-040): a real day inside the
//     request after its first day, on an approved request only; the days in effect end the day before it. A whole
//     cancel records no cancel day (D-020).
export const requests = sqliteTable(
  'requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind').notNull(),
    firstDay: text('first_day').notNull(),
    lastDay: text('last_day').notNull(),
    countedDays: integer('counted_days').notNull(),
    state: text('state').notNull(),
    sentAt: text('sent_at').notNull(),
    cancelledAt: text('cancelled_at'),
    cancelledBy: integer('cancelled_by').references(() => accounts.id),
    decidedAt: text('decided_at'),
    decidedBy: integer('decided_by').references(() => accounts.id),
    rejectionNote: text('rejection_note'),
    cancelFrom: text('cancel_from'),
  },
  (t) => [
    index('requests_account').on(t.accountId),
    check('requests_kind', sql`${t.kind} IN ('vacation', 'sick')`),
    check('requests_state', sql`${t.state} IN ('pending', 'approved', 'rejected', 'cancelled')`),
    check(
      'requests_days',
      sql`date(${t.firstDay}) IS ${t.firstDay} AND date(${t.lastDay}) IS ${t.lastDay} AND length(${t.firstDay}) = 10 AND length(${t.lastDay}) = 10 AND ${t.firstDay} <= ${t.lastDay} AND substr(${t.firstDay}, 1, 4) = substr(${t.lastDay}, 1, 4)`,
    ),
    check('requests_counted', sql`${t.countedDays} >= 1`),
    check('requests_note', sql`${t.rejectionNote} IS NULL OR (length(${t.rejectionNote}) BETWEEN 1 AND 200)`),
    check(
      'requests_cancel_from',
      sql`${t.cancelFrom} IS NULL OR (date(${t.cancelFrom}) IS ${t.cancelFrom} AND length(${t.cancelFrom}) = 10 AND ${t.cancelFrom} > ${t.firstDay} AND ${t.cancelFrom} <= ${t.lastDay} AND ${t.state} = 'approved' AND strftime('%w', ${t.cancelFrom}) NOT IN ('0', '6'))`,
    ),
  ],
)
