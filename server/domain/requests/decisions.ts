// Purpose: the admin's confirmed actions on requests (REQ-008 to REQ-010, REQ-016, REQ-019, REQ-022, REQ-025, D-040,
// D-041): the pending list with each vacation's days left and forecast, the two steps of approve, reject, cancel
// approved days and switch an account off (the effect with its token and summary, then the act carrying the token),
// and the admin's view of one person's requests. Every act re-reads what it changes inside one immediate write
// transaction, recomputes the effect at that moment and applies it only when its token still matches what was shown.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { db, inWriteTransaction, schema } from '~~/server/db'
import { accountIdFrom, nowIso, personOf, switchOffIn, switchOffTarget, teamTimeZone, todayInTeamZone, type Actor } from '~~/server/domain/accounts'
import {
  balanceFor,
  daysInEffect,
  fieldsOf,
  forecastFor,
  namesById,
  recordOf,
  refuse,
  requestIdFrom,
  requestRowsOf,
  transition,
  type Live,
  type OwnRequest,
  type RequestRow,
  type Tx,
} from './requests'

const { requests } = schema

/** The four confirmed actions of REQ-025 (D-029). */
export type ConfirmedAction = 'approve' | 'reject' | 'cancel' | 'switch-off'

// ---------------------------------------------------------------------------------------------------
// Showing days in a summary (D-007: a day is its YYYY-MM-DD text, never an instant)
// ---------------------------------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Mon 8 March 2027" for 2027-03-08. */
function shownDay(day: string): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  const d = Number(day.slice(8, 10))
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

function shownRange(first: string, last: string): string {
  return first === last ? shownDay(first) : `${shownDay(first)} to ${shownDay(last)}`
}

function shownCount(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}

/** A run of weekdays (sorted, from one request) as "<first> to <last> (n days)". */
function shownDays(days: string[]): string {
  const first = days[0] ?? ''
  return `${shownRange(first, days[days.length - 1] ?? first)} (${shownCount(days.length)})`
}

function figure(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : String(n)
}

// ---------------------------------------------------------------------------------------------------
// The confirmation token (D-041: HMAC-SHA256, RFC 2104, over the effect as shown)
// ---------------------------------------------------------------------------------------------------

/** A key made when the server starts: a token is only ever good for the effect this server showed. */
const TOKEN_KEY = randomBytes(32)

function tokenOf(effect: unknown): string {
  return createHmac('sha256', TOKEN_KEY).update(JSON.stringify(effect)).digest('base64url')
}

/** True when `given` is the token of exactly `effect` — the effect recomputed now equals the one that was shown. */
function tokenMatches(given: unknown, effect: unknown): boolean {
  if (typeof given !== 'string' || given === '') return false
  const want = Buffer.from(tokenOf(effect))
  const got = Buffer.from(given)
  return got.length === want.length && timingSafeEqual(got, want)
}

const STALE =
  'What this would change is no longer what was shown, so nothing was changed. Look at the confirmation again before confirming.'

// ---------------------------------------------------------------------------------------------------
// What each action would change, computed from the rows as they are now (REQ-025)
// ---------------------------------------------------------------------------------------------------

interface Plan {
  /** What will change, exactly: the token is made over it (D-041). */
  effect: unknown
  /** REQ-025 arm 2: the confirmation in plain words, naming the person, the days and what will change. */
  summary: string
}

/** REQ-010, REQ-019: what the admin's cancel would do to an approved request at `today`. */
interface CancelEffect {
  row: RequestRow
  /** The weekdays in effect from today on: cancelled. */
  going: string[]
  /** The weekdays in effect before today: they stay approved, counted and on the calendar. */
  staying: string[]
  /** The cancel day of a partial cancel (the first day going); null for a whole cancel (D-020). */
  cancelFrom: string | null
}

function cancelEffectOf(row: RequestRow, today: string): CancelEffect {
  const inEffect = daysInEffect(row)
  const going = inEffect.filter((d) => d >= today)
  const staying = inEffect.filter((d) => d < today)
  return { row, going, staying, cancelFrom: staying.length > 0 ? (going[0] ?? null) : null }
}

function notDecidable(row: RequestRow, verb: string): never {
  refuse(409, `This request is ${row.state}, so it can no longer be ${verb}. Nothing was changed.`)
}

/** REQ-008, REQ-009, REQ-010, REQ-022, REQ-025: what approving, rejecting or cancelling this request would change now. */
function requestPlan(action: 'approve' | 'reject' | 'cancel', row: RequestRow, name: string, today: string): Plan {
  const days = `${shownRange(row.firstDay, row.lastDay)} (${shownCount(row.countedDays)})`
  const base = { action, id: row.id, accountId: row.accountId, name, state: row.state, kind: row.kind, firstDay: row.firstDay, lastDay: row.lastDay }

  if (action === 'approve' || action === 'reject') {
    // REQ-009 arm 1: only a pending request is decided.
    if (row.state !== 'pending') notDecidable(row, action === 'approve' ? 'approved' : 'rejected')
    if (action === 'reject') {
      return {
        effect: base,
        summary: `Reject ${name}'s ${row.kind} request: ${days}. It becomes rejected, its days are freed and nothing is taken from the allowance.`,
      }
    }
    if (row.kind !== 'vacation') {
      return {
        effect: base,
        summary: `Approve ${name}'s ${row.kind} request: ${days}. It becomes approved and its days go on the calendar; sick days never use the allowance.`,
      }
    }
    // REQ-022: the forecast is the year's days left minus this request's days alone; it may be below zero.
    const year = Number(row.firstDay.slice(0, 4))
    const { daysLeft, forecast } = forecastFor(row.accountId, year, daysInEffect(row).length)
    return {
      effect: { ...base, year, daysLeft, forecast },
      summary:
        `Approve ${name}'s ${row.kind} request: ${days}. It becomes approved and its days go on the calendar. ` +
        `${name} has ${figure(daysLeft)} days left in ${year}; approving would leave ${figure(forecast)} days left in ${year}.`,
    }
  }

  // REQ-010: the admin cancels an approved request, from today on only.
  if (row.state !== 'approved') refuse(409, `This request is ${row.state}; only an approved request can be cancelled here. Nothing was changed.`)
  const c = cancelEffectOf(row, today)
  if (c.going.length === 0) {
    refuse(409, 'This request has no Monday to Friday day from today on, so there is nothing to cancel. Nothing was changed.')
  }
  const back = row.kind === 'vacation' ? 'given back to the allowance and ' : ''
  const summary =
    c.cancelFrom === null
      ? `Cancel ${name}'s approved ${row.kind} request of ${days}: the whole request is cancelled. ` +
        `Cancelled: ${shownDays(c.going)}, ${back}taken off the calendar. No day of it stays.`
      : `Cancel ${name}'s approved ${row.kind} request of ${days} from ${shownDay(c.cancelFrom)}. ` +
        `Cancelled: ${shownDays(c.going)}, ${back}taken off the calendar. ` +
        `These days stay approved and counted: ${shownDays(c.staying)}.`
  return { effect: { ...base, cancelFrom: c.cancelFrom, going: c.going }, summary }
}

/** REQ-016: what switching this account off would change now. */
interface SwitchOffPlan extends Plan {
  target: { id: number; name: string }
  pending: RequestRow[]
  cancels: CancelEffect[]
}

function switchOffPlan(accountId: number, today: string): SwitchOffPlan {
  const target = switchOffTarget(accountId)
  const rows = requestRowsOf(accountId).sort((a, b) => (a.firstDay < b.firstDay ? -1 : a.firstDay > b.firstDay ? 1 : a.id - b.id))
  const pending = rows.filter((r) => r.state === 'pending')
  // REQ-016 arm 7: a pending request with a weekday before today is decided first.
  const late = pending.find((r) => daysInEffect(r).some((d) => d < today))
  if (late) {
    refuse(
      409,
      `${target.name} has a pending request with a weekday before today (${shownRange(late.firstDay, late.lastDay)}). ` +
        'Approve or reject it first; then the account can be switched off. Nothing was changed.',
    )
  }
  const cancels = rows
    .filter((r) => r.state === 'approved')
    .map((r) => cancelEffectOf(r, today))
    .filter((c) => c.going.length > 0)

  const parts = [`Switch off ${target.name}'s account: ${target.name} can no longer sign in, and every session of the account ends.`]
  if (pending.length > 0) {
    parts.push(`Cancelled pending requests: ${pending.map((r) => `${r.kind} ${shownRange(r.firstDay, r.lastDay)} (${shownCount(r.countedDays)})`).join('; ')}.`)
  }
  if (cancels.length > 0) {
    parts.push(`Cancelled approved days, taken off the calendar: ${cancels.map((c) => `${c.row.kind} ${shownDays(c.going)}`).join('; ')}.`)
  }
  const staying = cancels.filter((c) => c.staying.length > 0)
  if (staying.length > 0) parts.push(`These days stay approved and counted: ${staying.map((c) => shownDays(c.staying)).join('; ')}.`)
  if (pending.length === 0 && cancels.length === 0) parts.push('No request of the account changes; its approved days before today stay as they are.')

  return {
    target,
    pending,
    cancels,
    effect: {
      action: 'switch-off',
      id: target.id,
      name: target.name,
      pending: pending.map((r) => r.id),
      cancels: cancels.map((c) => [c.row.id, c.cancelFrom, c.going]),
    },
    summary: parts.join(' '),
  }
}

// ---------------------------------------------------------------------------------------------------
// Step one: the effect (GET …/effect?action=…)
// ---------------------------------------------------------------------------------------------------

function actionFrom(raw: unknown, allowed: readonly ConfirmedAction[]): ConfirmedAction {
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) refuse(400, `The action must be one of: ${allowed.join(', ')}.`)
  return raw as ConfirmedAction
}

function requestRow(reader: Tx, id: number): RequestRow {
  const row = reader.select().from(requests).where(eq(requests.id, id)).get()
  if (!row) refuse(404, 'There is no such request.')
  return row
}

function nameOfAccount(accountId: number): string {
  return namesById()(accountId) ?? 'this person'
}

/**
 * REQ-025 step one (D-029): what approve, reject or cancel would change on a request, or switch-off on an account,
 * now — {token, summary}. Reading it changes nothing (arm 4); the act must carry its token (arm 1).
 */
export function effectOf(_by: Actor, target: 'request' | 'account', idParam: string | undefined, action: unknown): { action: ConfirmedAction; token: string; summary: string } {
  const today = todayInTeamZone()
  if (target === 'account') {
    actionFrom(action, ['switch-off'])
    const plan = switchOffPlan(accountIdFrom(idParam), today)
    return { action: 'switch-off', token: tokenOf(plan.effect), summary: plan.summary }
  }
  const a = actionFrom(action, ['approve', 'reject', 'cancel']) as 'approve' | 'reject' | 'cancel'
  const row = requestRow(db(), requestIdFrom(idParam))
  const plan = requestPlan(a, row, nameOfAccount(row.accountId), today)
  return { action: a, token: tokenOf(plan.effect), summary: plan.summary }
}

// ---------------------------------------------------------------------------------------------------
// Step two: the acts, each carrying the token
// ---------------------------------------------------------------------------------------------------

/** REQ-008 arm 5: an optional note of at most 200 characters (counted as characters, not bytes). */
function noteFrom(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') refuse(400, 'A note is text.')
  if (raw.trim() === '') return null
  const length = [...raw].length
  if (length > 200) refuse(400, `A note can be at most 200 characters; this one has ${length}. Nothing was changed.`)
  return raw
}

/** Applies a cancel effect (REQ-010, REQ-019): a whole cancel moves the request to cancelled; a partial one records its cancel day. */
function applyCancel(tx: Tx, c: CancelEffect, by: Actor): void {
  const at = nowIso()
  if (c.cancelFrom === null) {
    if (c.row.cancelFrom !== null) tx.update(requests).set({ cancelFrom: null }).where(eq(requests.id, c.row.id)).run()
    const live: Live = { tx, row: c.row }
    transition(live, 'approved', 'cancelled')
    tx.update(requests).set({ cancelledAt: at, cancelledBy: by.id }).where(eq(requests.id, c.row.id)).run()
    return
  }
  // REQ-019: stays approved; the days in effect end the day before the cancel day; who and when are recorded.
  const done = tx
    .update(requests)
    .set({ cancelFrom: c.cancelFrom, cancelledAt: at, cancelledBy: by.id })
    .where(
      and(
        eq(requests.id, c.row.id),
        eq(requests.state, 'approved'),
        or(isNull(requests.cancelFrom), gt(requests.cancelFrom, c.cancelFrom)),
      ),
    )
    .run()
  if (done.changes !== 1) refuse(409, STALE)
}

interface ActAnswer {
  ok: true
  id: number
  state: string
}

function tokenFrom(body: unknown): unknown {
  return fieldsOf(body).token
}

/** REQ-009: the admin approves a pending request (their own included, A-006), with the token of what was shown. */
export function approveRequest(by: Actor, idParam: string | undefined, body: unknown): ActAnswer {
  return decide('approve', by, idParam, body)
}

/** REQ-008 arm 5, REQ-009: the admin rejects a pending request, with an optional note, with the token of what was shown. */
export function rejectRequest(by: Actor, idParam: string | undefined, body: unknown): ActAnswer {
  return decide('reject', by, idParam, body)
}

function decide(action: 'approve' | 'reject', by: Actor, idParam: string | undefined, body: unknown): ActAnswer {
  const id = requestIdFrom(idParam)
  const note = action === 'reject' ? noteFrom(fieldsOf(body).note) : null
  return inWriteTransaction((tx) => {
    const row = requestRow(tx, id)
    const plan = requestPlan(action, row, nameOfAccount(row.accountId), todayInTeamZone())
    if (!tokenMatches(tokenFrom(body), plan.effect)) refuse(409, STALE)
    const live: Live = { tx, row }
    if (action === 'approve') transition(live, 'pending', 'approved')
    else transition(live, 'pending', 'rejected')
    tx.update(requests)
      .set({ decidedAt: nowIso(), decidedBy: by.id, rejectionNote: note })
      .where(eq(requests.id, id))
      .run()
    return { ok: true, id, state: action === 'approve' ? 'approved' : 'rejected' }
  })
}

/** REQ-010, REQ-019: the admin cancels an approved request's Monday to Friday days from today on, with the token. */
export function adminCancel(by: Actor, idParam: string | undefined, body: unknown): ActAnswer {
  const id = requestIdFrom(idParam)
  return inWriteTransaction((tx) => {
    const row = requestRow(tx, id)
    const today = todayInTeamZone()
    const plan = requestPlan('cancel', row, nameOfAccount(row.accountId), today)
    if (!tokenMatches(tokenFrom(body), plan.effect)) refuse(409, STALE)
    const c = cancelEffectOf(row, today)
    applyCancel(tx, c, by)
    return { ok: true, id, state: c.cancelFrom === null ? 'cancelled' : 'approved' }
  })
}

/**
 * REQ-016, REQ-019: the admin switches an account off, with the token of what was shown: its pending requests become
 * cancelled, its approved days from today on are cancelled (partly or wholly), its days before today stay, and the
 * account stops signing in — all in one write transaction.
 */
export function switchOffAccount(by: Actor, id: number, body: unknown): { ok: true; id: number } {
  return inWriteTransaction((tx) => {
    const plan = switchOffPlan(id, todayInTeamZone())
    if (!tokenMatches(tokenFrom(body), plan.effect)) refuse(409, STALE)
    const at = nowIso()
    for (const row of plan.pending) {
      const live: Live = { tx, row }
      transition(live, 'pending', 'cancelled')
      tx.update(requests).set({ cancelledAt: at, cancelledBy: by.id }).where(eq(requests.id, row.id)).run()
    }
    for (const c of plan.cancels) applyCancel(tx, c, by)
    switchOffIn(tx, by, plan.target.id)
    return { ok: true, id: plan.target.id }
  })
}

// ---------------------------------------------------------------------------------------------------
// The admin's lists
// ---------------------------------------------------------------------------------------------------

/** One entry of the pending page (REQ-008, REQ-022). */
export interface PendingEntry {
  id: number
  name: string
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  accountId: number
  state: string
  sentAt: string
  year: number
  /** Vacation only: the person's days left in the request's year (REQ-008 arm 3), from balanceFor. */
  daysLeft: number | null
  /** Vacation only: the person's pending vacation days in that year. */
  pendingDays: number | null
  /** Vacation only: the days left approving this request alone would leave (REQ-022), from forecastFor. */
  forecast: number | null
}

/**
 * REQ-008: every pending request of every person, the admin's own included, oldest sent first (the id breaking a tie),
 * each with the person's name, kind, days and counted days, and for a vacation the person's days left in its year and
 * the forecast of approving it (REQ-022).
 */
export function listPending(): { timeZone: string; requests: PendingEntry[] } {
  const rows = db().select().from(requests).where(inArray(requests.state, ['pending'])).orderBy(asc(requests.sentAt), asc(requests.id)).all()
  const nameOf = namesById()
  return {
    timeZone: teamTimeZone(),
    requests: rows.map((r) => {
      const year = Number(r.firstDay.slice(0, 4))
      const vacation = r.kind === 'vacation'
      const pending = vacation ? balanceFor(r.accountId, year).pending : null
      const f = vacation ? forecastFor(r.accountId, year, daysInEffect(r).length) : null
      // countedDays comes before accountId: a reader taking the first field named like "count" gets the count.
      return {
        id: r.id,
        name: nameOf(r.accountId) ?? '',
        kind: r.kind,
        firstDay: r.firstDay,
        lastDay: r.lastDay,
        countedDays: r.countedDays,
        accountId: r.accountId,
        state: r.state,
        sentAt: r.sentAt,
        year,
        daysLeft: f ? f.daysLeft : null,
        pendingDays: pending,
        forecast: f ? f.forecast : null,
      }
    }),
  }
}

/** One request on the admin's person page: its record, and whether the admin's cancel applies to it now (REQ-021). */
export interface PersonRequest extends OwnRequest {
  canCancel: boolean
}

/**
 * REQ-021 data: every request of one person, newest sent first, as the person's own list shows them, each saying
 * whether it is an approved request with a Monday to Friday day in effect from today on (the only ones the admin's
 * cancel applies to). A missing account answers 404.
 */
export function personRequests(accountId: number): { person: { id: number; name: string }; timeZone: string; today: string; requests: PersonRequest[] } {
  const person = personOf(accountId)
  const today = todayInTeamZone()
  const nameOf = namesById()
  return {
    person: { id: person.id, name: person.name },
    timeZone: teamTimeZone(),
    today,
    requests: requestRowsOf(accountId).map((r) => ({
      ...recordOf(r, nameOf),
      canCancel: r.state === 'approved' && daysInEffect(r).some((d) => d >= today),
    })),
  }
}
