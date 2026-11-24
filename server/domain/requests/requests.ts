// Purpose: requests and their states (REQ-001 to REQ-005, RULE-001, RULE-002, RULE-004, D-005, D-036): a person sends
// a request for themselves, cancels their own pending one, lists their own, and reads their days left. Every send runs
// its checks and its insert in one immediate write transaction (D-005), so two sends at the same moment cannot both
// pass a check the other would fail (REQ-002 arm 5, ROW-161). Today is the team clock's (RULE-005, D-007).
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db, inWriteTransaction, schema } from '~~/server/db'
import { allowanceFor, nowIso, todayInTeamZone, type Actor } from '~~/server/domain/accounts'
import { countWeekdays, strictDay, weekdaysIn } from './days'

const { requests } = schema
type Tx = Parameters<Parameters<typeof inWriteTransaction>[0]>[0]
type RequestRow = typeof requests.$inferSelect

/** REQ-001: the two kinds of absence. */
export const KINDS = ['vacation', 'sick'] as const
export type Kind = (typeof KINDS)[number]

/** RULE-004: the four states of a request. */
export type RequestState = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** Throws a refusal with `statusCode` and a plain `message` (also in data.message, where pages read it). */
function refuse(statusCode: number, message: string): never {
  throw createError({ statusCode, message, data: { message } })
}

function fieldsOf(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

/** The request id in a route's :id, or a 404 refusal (a malformed id names no request). */
function requestIdFrom(param: string | undefined): number {
  if (param === undefined || !/^[1-9][0-9]{0,15}$/.test(param)) refuse(404, 'There is no such request.')
  return Number(param)
}

// ---------------------------------------------------------------------------------------------------
// The state machine (RULE-004): every change of a request's state goes through transition()
// ---------------------------------------------------------------------------------------------------

/** A request row read inside the write transaction that will change it. */
interface Live {
  tx: Tx
  row: RequestRow
}

/**
 * RULE-004: moves a request from `from` to `to`, only if it is still in `from` (a change made meanwhile refuses it,
 * so no state is ever left by a path the table does not declare).
 */
function transition(req: Live, from: RequestState, to: RequestState): void {
  const done = req.tx
    .update(requests)
    .set({ state: to })
    .where(and(eq(requests.id, req.row.id), eq(requests.state, from)))
    .run()
  if (done.changes !== 1) refuse(409, 'This request was changed meanwhile. Reload the page and try again.')
}

// ---------------------------------------------------------------------------------------------------
// Days in effect and the balance (REQ-002, REQ-003, RULE-001)
// ---------------------------------------------------------------------------------------------------

/** REQ-003: the weekdays of a request that are in effect — every counted day until a partial cancel exists. */
function daysInEffect(row: Pick<RequestRow, 'firstDay' | 'lastDay'>): string[] {
  return weekdaysIn(row.firstDay, row.lastDay)
}

function vacationDaysOf(accountId: number, year: number, inState: RequestState): number {
  return db()
    .select({ firstDay: requests.firstDay, lastDay: requests.lastDay })
    .from(requests)
    .where(
      and(
        eq(requests.accountId, accountId),
        eq(requests.kind, 'vacation'),
        eq(requests.state, inState),
        sql`substr(${requests.firstDay}, 1, 4) = ${String(year).padStart(4, '0')}`,
      ),
    )
    .all()
    .reduce((sum, r) => sum + daysInEffect(r).length, 0)
}

/** One year's figures: the days left (allowance minus approved vacation days in effect) and the pending vacation days. */
export interface YearFigures {
  year: number
  daysLeft: number
  pending: number
}

/**
 * RULE-001, REQ-002 (A-002): THE balance function. Days left in `year` are that year's allowance (D-025) minus the
 * counted days in effect of the person's approved vacation in that year; pending are the counted days of their pending
 * vacation in that year. Sick requests never count (REQ-002 arm 4). Each year stands on its own: no request crosses
 * 31 December (REQ-004 arm 5).
 */
export function balanceFor(accountId: number, year: number): YearFigures {
  const allowance = allowanceFor(accountId, year) ?? 0
  return {
    year,
    daysLeft: allowance - vacationDaysOf(accountId, year, 'approved'),
    pending: vacationDaysOf(accountId, year, 'pending'),
  }
}

/** RULE-002: the signed-in person's own figures, as GET /api/balance answers them (D-029 {years:[{year,daysLeft,pending}]}). */
export function balanceForViewer(_viewer: Actor, figures: YearFigures[]): { years: YearFigures[] } {
  return { years: figures.map((f) => ({ year: f.year, daysLeft: f.daysLeft, pending: f.pending })) }
}

// ---------------------------------------------------------------------------------------------------
// Sending (REQ-001 to REQ-004)
// ---------------------------------------------------------------------------------------------------

function kindFrom(raw: unknown): Kind {
  // REQ-001 arm 1, ROW-205: exactly 'vacation' or 'sick'; nothing else, and no default.
  if (typeof raw !== 'string' || !(KINDS as readonly string[]).includes(raw)) refuse(400, 'Choose the kind of absence: vacation or sick.')
  return raw as Kind
}

function dayFrom(raw: unknown, which: 'first' | 'last'): string {
  const d = strictDay(raw)
  if (d === null) refuse(400, `The ${which} day is not a real date. Give it as year-month-day, for example 2027-03-15.`)
  return d
}

/**
 * REQ-004 (A-003, A-004, A-019, A-020, A-036): which days may be asked for, decided by the team's today at the moment
 * of sending (arm 6). A vacation has no day before today (arm 1); a sick request may (arm 2) but starts no earlier than
 * 1 January of this year, or of last year while it is January (arms 7 and 8); nothing ends after 31 December of next
 * year (arm 4). The caller has already refused a range that crosses 31 December (arm 5).
 */
function windowRefusal(kind: Kind, firstDay: string, lastDay: string, today: string): string | null {
  const year = Number(today.slice(0, 4))
  if (lastDay > `${year + 1}-12-31`) return `A request must end by 31 December of next year (${year + 1}).`
  if (kind === 'vacation') {
    if (firstDay < today) return 'A vacation cannot include a day before today.'
    return null
  }
  const inJanuary = today.slice(5, 7) === '01'
  const earliestYear = inJanuary ? year - 1 : year
  if (firstDay < `${earliestYear}-01-01`) {
    return inJanuary
      ? `A sick request can go back no further than 1 January of last year (${earliestYear}).`
      : `A sick request can go back no further than 1 January of this year (${earliestYear}). Ask the admin about earlier days.`
  }
  return null
}

/**
 * REQ-001, ROW-006: the signed-in person sends a request for themselves — the person is always the session's, whatever
 * the body or the address names. Answers the new request's id; it starts pending (REQ-001 arm 5).
 */
export function sendForViewer(viewer: Actor, body: unknown): { id: number } {
  const f = fieldsOf(body)
  const kind = kindFrom(f.kind)
  const firstDay = dayFrom(f.firstDay, 'first')
  const lastDay = dayFrom(f.lastDay, 'last')
  if (lastDay < firstDay) refuse(400, 'The last day cannot be before the first day.')
  if (firstDay.slice(0, 4) !== lastDay.slice(0, 4)) refuse(400, 'A request cannot cross 31 December. Send one request for each year.')
  const asked = weekdaysIn(firstDay, lastDay)
  if (asked.length === 0) refuse(400, 'These days hold no Monday to Friday day, and only weekdays count. Choose at least one weekday.')

  return inWriteTransaction((tx) => {
    // The team's today at the moment of sending, read inside the transaction (REQ-004 arm 6, RULE-005).
    const problem = windowRefusal(kind, firstDay, lastDay, todayInTeamZone())
    if (problem !== null) refuse(400, problem)

    // REQ-003: no weekday shared with a day in effect of the person's own pending or approved request, of any kind.
    const asking = new Set(asked)
    const live = tx
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.accountId, viewer.id),
          inArray(requests.state, ['pending', 'approved'] satisfies RequestState[]),
          lte(requests.firstDay, lastDay),
          gte(requests.lastDay, firstDay),
        ),
      )
      .all()
    if (live.some((r) => daysInEffect(r).some((d) => asking.has(d)))) {
      refuse(409, 'You already have a pending or approved request on one of these days.')
    }

    // REQ-002: a vacation fits in that year's days left minus that year's pending vacation days; sick never counts.
    if (kind === 'vacation') {
      const year = Number(firstDay.slice(0, 4))
      const b = balanceFor(viewer.id, year)
      if (asked.length > b.daysLeft - b.pending) {
        refuse(
          409,
          `This vacation counts ${asked.length} ${asked.length === 1 ? 'day' : 'days'}, more than your allowance still holds for ${year}: ` +
            `${b.daysLeft} ${b.daysLeft === 1 ? 'day' : 'days'} left, with ${b.pending} ${b.pending === 1 ? 'day' : 'days'} of vacation pending.`,
        )
      }
    }

    const row = tx
      .insert(requests)
      .values({
        accountId: viewer.id,
        kind,
        firstDay,
        lastDay,
        countedDays: countWeekdays(firstDay, lastDay),
        state: 'pending',
        sentAt: nowIso(),
      })
      .returning({ id: requests.id })
      .get()
    return { id: row.id }
  })
}

// ---------------------------------------------------------------------------------------------------
// The person's own cancel (REQ-005)
// ---------------------------------------------------------------------------------------------------

/**
 * REQ-005 (A-007, A-038): a person cancels their own request while it is pending and has no weekday before today; it
 * becomes cancelled, records who and when (D-020), and never counts or blocks again. Another person's request answers
 * as a request that does not exist (INV-003). Anything else is the admin's to decide.
 */
export function cancelOwnForViewer(viewer: Actor, idParam: string | undefined): { ok: true } {
  const id = requestIdFrom(idParam)
  inWriteTransaction((tx) => {
    const row = tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.accountId, viewer.id)))
      .get()
    if (!row) refuse(404, 'There is no such request.')
    if (row.state !== 'pending') refuse(409, `Only a pending request can be cancelled, and this one is ${row.state}. The admin decides any change to it.`)
    const today = todayInTeamZone()
    if (weekdaysIn(row.firstDay, row.lastDay).some((d) => d < today)) {
      refuse(409, 'This request has a weekday before today, so you can no longer cancel it: the admin decides it.')
    }
    const live: Live = { tx, row }
    transition(live, 'pending', 'cancelled')
    tx.update(requests).set({ cancelledAt: nowIso(), cancelledBy: viewer.id }).where(eq(requests.id, row.id)).run()
  })
  return { ok: true }
}

// ---------------------------------------------------------------------------------------------------
// The person's own list (RULE-002: a person sees the kind of their own requests only)
// ---------------------------------------------------------------------------------------------------

/** One request as its own person sees it. */
export interface OwnRequest {
  id: number
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  state: string
  sentAt: string
  /** D-020: when the request was cancelled, and the account that cancelled it. */
  cancelledAt: string | null
  cancelledById: number | null
}

/** REQ-006 data: the signed-in person's own requests, in the order of their first day. */
export function ownRequestsForViewer(viewer: Actor): { requests: OwnRequest[] } {
  const rows = db()
    .select()
    .from(requests)
    .where(eq(requests.accountId, viewer.id))
    .orderBy(asc(requests.firstDay), asc(requests.id))
    .all()
  return {
    requests: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      firstDay: r.firstDay,
      lastDay: r.lastDay,
      countedDays: r.countedDays,
      state: r.state,
      sentAt: r.sentAt,
      cancelledAt: r.cancelledAt,
      cancelledById: r.cancelledBy,
    })),
  }
}

/** The test control door's reset (D-029, DIF-002): every request is wiped before the accounts it refers to. */
export function clearRequestsForTest(): void {
  inWriteTransaction((tx) => {
    tx.delete(requests).run()
  })
}
