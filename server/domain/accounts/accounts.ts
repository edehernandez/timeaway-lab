// Purpose: accounts and their changes (REQ-013, REQ-015, REQ-024, REQ-026, REQ-027, D-014 to D-016, D-025): create,
// rename, change email, set and change passwords, per-year allowances, the people list, the change history, the team
// time zone and the test reset. Every write runs in one immediate write transaction (D-005), so the checks and the
// write cannot be split by a simultaneous request; the store's own constraints back each uniqueness rule.
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm'
import { db, inWriteTransaction, schema } from '~~/server/db'
import { forgetAttempts, inWait, recordWrongAttempt } from './attempts'
import { dateInZone, isTimeZone, nowIso, nowMs, setInjectedNow } from './clock'
import { hashPassword, newPasswordProblem, verifyPassword } from './passwords'
import { isConstraintError, refuse } from './refusals'

const { accounts, accountAllowances, accountEvents, sessions, settings } = schema
type Tx = Parameters<Parameters<typeof inWriteTransaction>[0]>[0]
type AccountRow = typeof accounts.$inferSelect

/** REQ-013: at most 30 accounts are switched on at once, the admin included (ROW-065, ROW-144). */
export const MAX_SWITCHED_ON = 30

/** The account an operation acts for: the signed-in person (see sessions.ts). */
export interface Actor {
  id: number
  tokenHash?: string
}

// ---------------------------------------------------------------------------------------------------
// The team time zone and today (D-007, D-013)
// ---------------------------------------------------------------------------------------------------

/** The team's named time zone, set at setup (D-013); UTC until setup has run. */
export function teamTimeZone(): string {
  const row = db().select().from(settings).where(eq(settings.key, 'time_zone')).get()
  return row?.value ?? 'UTC'
}

/** Today in the team's time zone as YYYY-MM-DD (D-007, RULE-005). */
export function todayInTeamZone(): string {
  return dateInZone(nowMs(), teamTimeZone())
}

/** The team's current calendar year. */
export function teamYear(): number {
  return Number(todayInTeamZone().slice(0, 4))
}

// ---------------------------------------------------------------------------------------------------
// Values as typed, checked (REQ-013 arm 1, D-014, D-015, D-016)
// ---------------------------------------------------------------------------------------------------

/** An email as stored and compared: trimmed and lower-cased (REQ-013, ROW-215; the store's CHECK holds it). */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function nameKeyOf(name: string): string {
  return name.trim().toLowerCase()
}

/** The fields of a JSON body, or none when the body is not an object. */
export function fieldsOf(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

function nameFrom(raw: unknown): string {
  if (typeof raw !== 'string') refuse(400, 'A name is needed.')
  const name = raw.trim()
  if (name === '') refuse(400, 'A name cannot be blank.')
  if ([...name].length > 60) refuse(400, 'A name can be at most 60 characters.')
  return name
}

function emailFrom(raw: unknown): string {
  if (typeof raw !== 'string') refuse(400, 'An email is needed.')
  const email = normaliseEmail(raw)
  if (email === '') refuse(400, 'An email cannot be blank.')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) refuse(400, 'That is not an email address.')
  return email
}

function allowanceFrom(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 260) {
    refuse(400, 'An allowance is a whole number of days from 0 to 260.')
  }
  return raw
}

function passwordFrom(raw: unknown): string {
  const problem = newPasswordProblem(raw)
  if (problem !== null) refuse(400, problem)
  return raw as string
}

/** The account id in a route's :id, or a 404 refusal. */
export function accountIdFrom(param: string | undefined): number {
  if (param === undefined || !/^[1-9][0-9]{0,15}$/.test(param)) refuse(404, 'There is no such account.')
  return Number(param)
}

// ---------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------

function accountById(tx: Tx, id: number): AccountRow | undefined {
  return tx.select().from(accounts).where(eq(accounts.id, id)).get()
}

/** The account holding this normalised email, or undefined. */
export function accountByEmail(email: string): AccountRow | undefined {
  return db().select().from(accounts).where(eq(accounts.email, email)).get()
}

function switchedOnCount(tx: Tx): number {
  return tx.select({ n: sql<number>`count(*)` }).from(accounts).where(eq(accounts.switchedOn, 1)).get()?.n ?? 0
}

function emailHolder(tx: Tx, email: string, except?: number): AccountRow | undefined {
  const cond = except === undefined ? eq(accounts.email, email) : and(eq(accounts.email, email), ne(accounts.id, except))
  return tx.select().from(accounts).where(cond).get()
}

function switchedOnNameHolder(tx: Tx, nameKey: string, except?: number): AccountRow | undefined {
  const base = and(eq(accounts.nameKey, nameKey), eq(accounts.switchedOn, 1))
  return tx.select().from(accounts).where(except === undefined ? base : and(base, ne(accounts.id, except))).get()
}

/** An account's allowance changes (D-025), oldest first. */
export function allowanceChangesOf(accountId: number): { allowance: number; startsYear: number; madeAt: string; madeBy: number | null }[] {
  return db()
    .select()
    .from(accountAllowances)
    .where(eq(accountAllowances.accountId, accountId))
    .orderBy(asc(accountAllowances.id))
    .all()
    .map((c) => ({ allowance: c.allowance, startsYear: c.startsYear, madeAt: c.madeAt, madeBy: c.madeBy }))
}

/**
 * The allowance in force for `year` (D-025): among the changes starting at or before that year, the one with the
 * latest starting year, and among those the most recently made. Null when no change starts by then.
 */
export function allowanceFor(accountId: number, year: number): number | null {
  return allowanceIn(db(), accountId, year)
}

function allowanceIn(tx: Tx, accountId: number, year: number): number | null {
  const row = tx
    .select()
    .from(accountAllowances)
    .where(and(eq(accountAllowances.accountId, accountId), lte(accountAllowances.startsYear, year)))
    .orderBy(desc(accountAllowances.startsYear), desc(accountAllowances.madeAt), desc(accountAllowances.id))
    .get()
  return row ? row.allowance : null
}

/** The admin's people list (REQ-020): every account with its email, state and this year's allowance. */
export function listPeople(): {
  id: number
  name: string
  email: string
  isAdmin: boolean
  switchedOn: boolean
  allowance: number | null
  since: string
}[] {
  const year = teamYear()
  return db()
    .select()
    .from(accounts)
    .orderBy(asc(accounts.nameKey), asc(accounts.id))
    .all()
    .map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      isAdmin: a.isAdmin === 1,
      switchedOn: a.switchedOn === 1,
      allowance: allowanceFor(a.id, year),
      since: a.createdAt,
    }))
}

/** One account as the admin's person page shows it, or a 404 refusal. */
export function personOf(id: number): ReturnType<typeof listPeople>[number] {
  const person = listPeople().find((p) => p.id === id)
  if (!person) refuse(404, 'There is no such account.')
  return person
}

/** One entry of a person's change history (REQ-028): a rename, or an allowance change with the year it starts. */
export type HistoryEntry =
  | { at: string; by: string | null; what: 'renamed'; from: string | null; to: string | null }
  | { at: string; by: string | null; what: 'allowance set'; from: number | null; to: number | null; startsYear: number | null }

const HISTORY_KINDS = ['renamed', 'allowance set'] as const

function wholeOrNull(v: string | null): number | null {
  return v !== null && /^[0-9]+$/.test(v) ? Number(v) : null
}

/**
 * REQ-028, REQ-018, D-043: a person's allowance and name change history, newest first — each change with its old and
 * new value, for an allowance the year it starts, who made it and when. The other recorded changes (password, email,
 * switching) are kept with who and when (REQ-018) but are not this history's.
 */
export function personHistory(id: number): HistoryEntry[] {
  personOf(id)
  const rows = db()
    .select()
    .from(accountEvents)
    .where(and(eq(accountEvents.accountId, id), inArray(accountEvents.what, [...HISTORY_KINDS])))
    .orderBy(desc(accountEvents.id))
    .all()
  const ids = [...new Set(rows.map((r) => r.byAccountId).filter((x): x is number => x !== null))]
  const names = new Map(
    (ids.length ? db().select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, ids)).all() : []).map((r) => [
      r.id,
      r.name,
    ]),
  )
  return rows.map((r): HistoryEntry => {
    const by = r.byAccountId === null ? null : (names.get(r.byAccountId) ?? null)
    if (r.what === 'allowance set') {
      return { at: r.at, by, what: 'allowance set', from: wholeOrNull(r.fromValue), to: wholeOrNull(r.toValue), startsYear: r.startsYear }
    }
    return { at: r.at, by, what: 'renamed', from: r.fromValue, to: r.toValue }
  })
}

// ---------------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------------

function record(
  tx: Tx,
  accountId: number,
  by: number | null,
  what: string,
  from: string | null = null,
  to: string | null = null,
  startsYear: number | null = null,
): void {
  tx.insert(accountEvents).values({ accountId, byAccountId: by, at: nowIso(), what, fromValue: from, toValue: to, startsYear }).run()
}

/** Runs a write transaction, turning a store constraint failure into a plain 409 refusal. */
function write<T>(fn: (tx: Tx) => T, conflict: string): T {
  try {
    return inWriteTransaction(fn)
  } catch (e) {
    if (isConstraintError(e)) refuse(409, conflict)
    throw e
  }
}

function insertAccount(
  tx: Tx,
  spec: { name: string; email: string; hash: string; allowance: number; isAdmin: boolean },
  by: number | null,
): number {
  const at = nowIso()
  const row = tx
    .insert(accounts)
    .values({
      name: spec.name,
      nameKey: nameKeyOf(spec.name),
      email: spec.email,
      passwordHash: spec.hash,
      passwordVersion: 1,
      // REQ-026: a password the admin set must be replaced at the next sign-in; the admin's own setup password is theirs.
      mustChangePassword: spec.isAdmin ? 0 : 1,
      isAdmin: spec.isAdmin ? 1 : 0,
      switchedOn: 1,
      createdAt: at,
    })
    .returning({ id: accounts.id })
    .get()
  tx.insert(accountAllowances).values({ accountId: row.id, allowance: spec.allowance, startsYear: teamYear(), madeAt: at, madeBy: by }).run()
  record(tx, row.id, by, 'created', null, spec.name)
  return row.id
}

/**
 * REQ-013: the admin creates an account with a display name, an email, a first password and an allowance. Refused:
 * a missing or blank field (arm 1), an email another account holds in any letter case or spacing (arm 2, ROW-171),
 * a 31st switched-on account (arm 3, ROW-144), a name a switched-on account holds (REQ-024, ROW-254).
 */
export async function createAccount(by: Actor, body: unknown): Promise<{ id: number }> {
  const f = fieldsOf(body)
  const name = nameFrom(f.name)
  const email = emailFrom(f.email)
  const password = passwordFrom(f.password)
  const allowance = allowanceFrom(f.allowance)
  const hash = await hashPassword(password)
  const id = write((tx) => {
    if (switchedOnCount(tx) >= MAX_SWITCHED_ON) refuse(409, `${MAX_SWITCHED_ON} accounts are already switched on; switch one off first.`)
    if (emailHolder(tx, email)) refuse(409, 'Another account already has this email.')
    if (switchedOnNameHolder(tx, nameKeyOf(name))) refuse(409, 'A switched-on account already has this name.')
    return insertAccount(tx, { name, email, hash, allowance, isAdmin: false }, by.id)
  }, 'Another account already has this email or name.')
  return { id }
}

/** REQ-020, REQ-024: the admin renames an account; a name another switched-on account holds is refused. */
export function renameAccount(by: Actor, id: number, body: unknown): void {
  const name = nameFrom(fieldsOf(body).name)
  write((tx) => {
    const target = accountById(tx, id)
    if (!target) refuse(404, 'There is no such account.')
    if (target.switchedOn === 1 && switchedOnNameHolder(tx, nameKeyOf(name), id)) refuse(409, 'A switched-on account already has this name.')
    if (target.name === name) return
    tx.update(accounts).set({ name, nameKey: nameKeyOf(name) }).where(eq(accounts.id, id)).run()
    record(tx, id, by.id, 'renamed', target.name, name)
  }, 'A switched-on account already has this name.')
}

/** REQ-027: the admin changes an account's email; an email another account holds (compared as at creation) is refused. */
export function changeEmail(by: Actor, id: number, body: unknown): void {
  const email = emailFrom(fieldsOf(body).email)
  write((tx) => {
    const target = accountById(tx, id)
    if (!target) refuse(404, 'There is no such account.')
    if (emailHolder(tx, email, id)) refuse(409, 'Another account already has this email.')
    if (target.email === email) return
    tx.update(accounts).set({ email }).where(eq(accounts.id, id)).run()
    record(tx, id, by.id, 'email changed', target.email, email)
  }, 'Another account already has this email.')
}

/**
 * REQ-015 arms 1, 4, 5, 6 and REQ-026: the admin sets a new password for another account; the account must choose
 * its own at its next sign-in, and every session it holds ends at once. The admin's own password is never set here
 * (it is changed on /password with the current one, ROW-077).
 */
export async function setPassword(by: Actor, id: number, body: unknown): Promise<void> {
  if (id === by.id) refuse(400, 'Change your own password on the password page, giving your current one.')
  const password = passwordFrom(fieldsOf(body).password)
  const hash = await hashPassword(password)
  write((tx) => {
    const target = accountById(tx, id)
    if (!target) refuse(404, 'There is no such account.')
    tx.update(accounts)
      .set({ passwordHash: hash, passwordVersion: target.passwordVersion + 1, mustChangePassword: 1 })
      .where(eq(accounts.id, id))
      .run()
    tx.delete(sessions).where(eq(sessions.accountId, id)).run()
    record(tx, id, by.id, 'password set by the admin')
  }, 'The password could not be set.')
}

/**
 * REQ-015 arms 2, 3, 5, REQ-026 arms 2 and 3, D-026: a person changes their own password by giving the current one.
 * A wrong current password counts toward the attempt bound of the account's email; the new one must differ from the
 * current one (so it never equals the one the admin set); every other session of the account ends, this one stays.
 */
export async function changeOwnPassword(who: Actor, body: unknown): Promise<void> {
  const f = fieldsOf(body)
  const own = db().select().from(accounts).where(eq(accounts.id, who.id)).get()
  if (!own) refuse(401, 'Sign in first.')
  if (inWait(own.email)) refuse(429, 'Too many wrong passwords for this account. Wait 15 minutes, then try again.')
  const current = f.current
  if (typeof current !== 'string' || current === '') refuse(400, 'Give your current password.')
  if (!(await verifyPassword(current, own.passwordHash))) {
    recordWrongAttempt(own.email)
    refuse(400, 'Your current password is not right.')
  }
  const next = passwordFrom(f.next)
  if (next === current) refuse(400, 'Choose a new password that differs from the current one.')
  const hash = await hashPassword(next)
  write((tx) => {
    const now = accountById(tx, who.id)
    if (!now || now.passwordVersion !== own.passwordVersion) refuse(409, 'Your password was changed meanwhile. Sign in again.')
    tx.update(accounts)
      .set({ passwordHash: hash, passwordVersion: now.passwordVersion + 1, mustChangePassword: 0 })
      .where(eq(accounts.id, who.id))
      .run()
    const keep = who.tokenHash ?? ''
    tx.delete(sessions)
      .where(and(eq(sessions.accountId, who.id), ne(sessions.tokenHash, keep)))
      .run()
    record(tx, who.id, who.id, 'password changed')
  }, 'The password could not be changed.')
}

/**
 * REQ-011, D-025: the admin sets an account's allowance, starting this year or, with startsNextYear, next year; it is
 * kept as a change with the year it starts from, never by rewriting earlier years. REQ-018 arms 2 and 4, D-043: the
 * change is recorded with its old value (the allowance its starting year had before), its new value and that year.
 */
export function setAllowance(by: Actor, id: number, body: unknown): void {
  const f = fieldsOf(body)
  const allowance = allowanceFrom(f.allowance)
  if (f.startsNextYear !== undefined && typeof f.startsNextYear !== 'boolean') refuse(400, 'Say whether the allowance starts next year.')
  const startsYear = teamYear() + (f.startsNextYear === true ? 1 : 0)
  write((tx) => {
    if (!accountById(tx, id)) refuse(404, 'There is no such account.')
    const old = allowanceIn(tx, id, startsYear)
    tx.insert(accountAllowances).values({ accountId: id, allowance, startsYear, madeAt: nowIso(), madeBy: by.id }).run()
    record(tx, id, by.id, 'allowance set', old === null ? null : String(old), String(allowance), startsYear)
  }, 'The allowance could not be set.')
}

/** The account a switch-off would act on: refused for no such account, the admin's own account, or one already off (REQ-016 arm 1). */
export function switchOffTarget(id: number): { id: number; name: string } {
  const target = db().select().from(accounts).where(eq(accounts.id, id)).get()
  return checkedSwitchOffTarget(target)
}

function checkedSwitchOffTarget(target: AccountRow | undefined): { id: number; name: string } {
  if (!target) refuse(404, 'There is no such account.')
  if (target.isAdmin === 1) refuse(409, "The admin's own account cannot be switched off.")
  if (target.switchedOn !== 1) refuse(409, `${target.name}'s account is already switched off.`)
  return { id: target.id, name: target.name }
}

/**
 * REQ-016: switches an account off inside the caller's write transaction (the requests module's switch-off, which
 * cancels the account's requests in the same transaction): sign-in stops and every session it holds ends at once
 * (REQ-014, A-008). Refused for the admin's own account and for one already off.
 */
export function switchOffIn(tx: Tx, by: Actor, id: number): void {
  const target = checkedSwitchOffTarget(accountById(tx, id))
  tx.update(accounts).set({ switchedOn: 0 }).where(eq(accounts.id, target.id)).run()
  tx.delete(sessions).where(eq(sessions.accountId, target.id)).run()
  record(tx, target.id, by.id, 'switched off')
}

/**
 * REQ-016 arms 5 and 6, REQ-013 arm 3, REQ-024: the admin switches an account back on {on: true}; it signs in again
 * with its old password and gets back no cancelled request or day. Refused when 30 accounts are already on, or when a
 * switched-on account holds its name. Switching off is the requests module's (it cancels the account's requests).
 */
export function switchAccount(by: Actor, id: number, body: unknown): { ok: true } {
  if (fieldsOf(body).on !== true) refuse(400, 'Say on: true to switch an account on; switching off is confirmed first.')
  write((tx) => {
    const target = accountById(tx, id)
    if (!target) refuse(404, 'There is no such account.')
    if (target.switchedOn === 1) refuse(409, `${target.name}'s account is already switched on.`)
    if (switchedOnCount(tx) >= MAX_SWITCHED_ON) refuse(409, `${MAX_SWITCHED_ON} accounts are already switched on; switch one off first.`)
    if (switchedOnNameHolder(tx, target.nameKey, id)) refuse(409, 'A switched-on account already has this name. Rename one of them first.')
    tx.update(accounts).set({ switchedOn: 1 }).where(eq(accounts.id, id)).run()
    record(tx, id, by.id, 'switched on')
  }, 'A switched-on account already has this name.')
  return { ok: true }
}

// ---------------------------------------------------------------------------------------------------
// Setup and the test reset (D-011, DIF-002)
// ---------------------------------------------------------------------------------------------------

/** The setup's inputs: the one admin and the team time zone (D-011, D-013). */
export interface Setup {
  timeZone: string
  admin: { name: string; email: string; password: string; allowance: number }
}

function setupFrom(body: unknown): Setup {
  const f = fieldsOf(body)
  if (!isTimeZone(f.timeZone)) refuse(400, 'The team time zone must be a named zone such as Pacific/Auckland.')
  const a = fieldsOf(f.admin)
  return {
    timeZone: f.timeZone as string,
    admin: { name: nameFrom(a.name), email: emailFrom(a.email), password: passwordFrom(a.password), allowance: allowanceFrom(a.allowance) },
  }
}

/**
 * The test control door's reset (D-029, DIF-002): wipes every account record, sets the clock (`now`, or null for the
 * real clock), forgets the attempt counts and creates the one admin and the team time zone as the setup does.
 */
export async function resetForTest(body: unknown): Promise<void> {
  const f = fieldsOf(body)
  const setup = setupFrom(body)
  const now = f.now
  if (now !== null && now !== undefined && (typeof now !== 'string' || Number.isNaN(Date.parse(now)))) refuse(400, 'now must be an ISO 8601 instant or null.')
  const hash = await hashPassword(setup.admin.password)
  setInjectedNow(typeof now === 'string' ? now : null)
  forgetAttempts()
  inWriteTransaction((tx) => {
    tx.delete(sessions).run()
    tx.delete(accountEvents).run()
    tx.delete(accountAllowances).run()
    tx.delete(accounts).run()
    tx.delete(settings).run()
    tx.insert(settings).values({ key: 'time_zone', value: setup.timeZone }).run()
    insertAccount(tx, { name: setup.admin.name, email: setup.admin.email, hash, allowance: setup.admin.allowance, isAdmin: true }, null)
  })
}
