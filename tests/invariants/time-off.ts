// Purpose: shared fixture code for the decision, cancel and allowance rows (REQ-009, REQ-010, REQ-011) — a team set up through the harness, the calendar and balance read as exact figures, raw (unjudged) attempts at the confirmed actions, and the team-zone date arithmetic the tests' oracles use.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); every record it makes goes through harness.ts and the product's public routes (D-029); its date arithmetic is the test's own oracle (Intl, no product code).
//
// Rules this module keeps (the harness's, extended):
//   - It reaches the product only through harness.ts and the routes of D-029; it never opens the database.
//   - Raw attempts (tryConfirmed, actRaw, tryOwnCancel) return the product's answer UNJUDGED: a test about a
//     refusal reads the status itself. Setup reads (calendar, balance, a person's records) throw a SetupError
//     naming the route when the product does not answer, so a missing route reads as setup, never as the row.
//   - Today is never read from the machine's clock: every instant a test sets is built here from a team date,
//     a team time and the team time zone (teamInstant), and checked back (teamDateOf, utcDateOf).
import type { APIRequestContext } from '@playwright/test';
import {
  anonymousApi,
  confirmedActionRoutes,
  createMember,
  requireOk,
  resetProduct,
  SetupError,
  signIn,
  signInMember,
  readBalance,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Install,
  type Member,
} from './harness';

// ---------------------------------------------------------------------------------------------------
// Fresh numbers
// ---------------------------------------------------------------------------------------------------

/** A fresh whole number in [lo, hi], different from every value in `avoid` (fresh per run, so no product can hard-code it). */
export function freshInt(lo: number, hi: number, avoid: number[] = []): number {
  for (let i = 0; i < 1000; i += 1) {
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (!avoid.includes(n)) return n;
  }
  throw new SetupError(`freshInt could not find a value in [${lo}, ${hi}] avoiding ${avoid.join(',')}`);
}

// ---------------------------------------------------------------------------------------------------
// Team dates and instants (the tests' own oracle; Intl only)
// ---------------------------------------------------------------------------------------------------

/** Pacific/Auckland: far ahead of UTC (UTC+12/+13), so early in the team's day the UTC date is the day before. */
export const AHEAD_ZONE = 'Pacific/Auckland';
/** Pacific/Honolulu: far behind UTC (UTC-10, no daylight saving), so late in the team's day the UTC date is the day after. */
export const BEHIND_ZONE = 'Pacific/Honolulu';

function zoneParts(epochMs: number, timeZone: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const p = zoneParts(epochMs, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - epochMs;
}

/** The ISO 8601 UTC instant ("2027-06-09T12:30:00Z") at which the team's wall clock in `timeZone` reads `date` `time` ("HH:MM"). */
export function teamInstant(timeZone: string, date: string, time: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) throw new SetupError(`teamInstant: bad date or time ${date} ${time}`);
  let t = naive - zoneOffsetMs(naive, timeZone);
  t = naive - zoneOffsetMs(t, timeZone);
  const iso = new Date(t).toISOString().replace('.000Z', 'Z');
  const back = zoneParts(t, timeZone);
  const backDate = `${back.y}-${String(back.m).padStart(2, '0')}-${String(back.d).padStart(2, '0')}`;
  if (backDate !== date) throw new SetupError(`teamInstant: ${date} ${time} does not exist in ${timeZone}`);
  return iso;
}

/** The team's date (YYYY-MM-DD) at `instant` in `timeZone`. */
export function teamDateOf(instant: string, timeZone: string): string {
  const p = zoneParts(Date.parse(instant), timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** The UTC date (YYYY-MM-DD) at `instant`. */
export function utcDateOf(instant: string): string {
  return new Date(Date.parse(instant)).toISOString().slice(0, 10);
}

/** `date` (YYYY-MM-DD) plus `n` calendar days. */
export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function dayOfWeek(date: string): number {
  return new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
}

/** Every Monday-to-Friday date from `first` to `last`, inclusive, in order. */
export function weekdaysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const w = dayOfWeek(d);
    if (w >= 1 && w <= 5) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// A team
// ---------------------------------------------------------------------------------------------------

/** A fresh install: the admin signed in, and each member created with its allowance, its own password chosen, and signed in. */
export interface Team {
  install: Install;
  admin: Actor;
  members: Member[];
  /** sessions[i] is members[i] signed in through the actor door. */
  sessions: Actor[];
  close(): Promise<void>;
}

/** Resets the product at `now` in `timeZone` (admin allowance `adminAllowance`, default 25) and creates one member per entry of `allowances`. */
export async function startTeam(opts: { timeZone: string; now: string; adminAllowance?: number; allowances?: number[] }): Promise<Team> {
  const install = await resetProduct({ timeZone: opts.timeZone, now: opts.now, admin: { allowance: opts.adminAllowance ?? 25 } });
  const admin = await signIn(install.admin);
  const members: Member[] = [];
  const sessions: Actor[] = [];
  try {
    for (const allowance of opts.allowances ?? []) {
      const m = await createMember(admin, { allowance });
      members.push(m);
      sessions.push(await signInMember(m));
    }
  } catch (e) {
    for (const s of sessions) await s.dispose();
    await admin.dispose();
    throw e;
  }
  return {
    install,
    admin,
    members,
    sessions,
    close: async () => {
      for (const s of sessions) await s.dispose().catch(() => undefined);
      await admin.dispose().catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Reading the calendar and the balance as exact figures
// ---------------------------------------------------------------------------------------------------

/** One day of GET /api/calendar?year&month (D-029). */
export interface CalendarDay {
  date: string;
  people: { name: string; accountId: AccountId }[];
}

/** GET /api/calendar?year=<year>&month=<month, 1-12> → its days (D-029 {days:[{date,people:[{name,accountId}]}]}). */
export async function readCalendarMonth(actor: Actor, year: number, month: number): Promise<CalendarDay[]> {
  const route = `/api/calendar?year=${year}&month=${month}`;
  const res = await requireOk(await actor.api.get(route), `GET ${route}`);
  let body: { days?: CalendarDay[] };
  try {
    body = (await res.json()) as { days?: CalendarDay[] };
  } catch {
    throw new SetupError(`GET ${route} answered without a JSON body`);
  }
  if (!body || !Array.isArray(body.days)) throw new SetupError(`GET ${route} answered without a days list`);
  return body.days;
}

/** The calendar entries for `dates`, read once per month: date → the people listed that day ([] when the day is absent). */
export async function calendarOn(actor: Actor, dates: string[]): Promise<Map<string, { name: string; accountId: AccountId }[]>> {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const byDate = new Map<string, { name: string; accountId: AccountId }[]>();
  for (const ym of months) {
    const days = await readCalendarMonth(actor, Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
    for (const day of days) byDate.set(String(day.date).slice(0, 10), Array.isArray(day.people) ? day.people : []);
  }
  const out = new Map<string, { name: string; accountId: AccountId }[]>();
  for (const d of dates) out.set(d, byDate.get(d) ?? []);
  return out;
}

/** The subset of `dates`, in order, on which the calendar lists the account `accountId` as away. */
export async function awayDays(actor: Actor, accountId: AccountId, dates: string[]): Promise<string[]> {
  const cal = await calendarOn(actor, dates);
  return dates.filter((d) => (cal.get(d) ?? []).some((p) => String(p.accountId) === String(accountId)));
}

/** One year's two figures from GET /api/balance (REQ-007): days left and pending, or null when the year is not listed. */
export type YearFigures = { daysLeft: number; pending: number } | null;

/** The actor's own balance for each of `years`: year → {daysLeft, pending} (only those two fields), or null when the year is missing. */
export async function figures(actor: Actor, years: number[]): Promise<Record<number, YearFigures>> {
  const balance = await readBalance(actor);
  if (!balance || !Array.isArray(balance.years)) throw new SetupError('GET /api/balance answered without a years list');
  const out: Record<number, YearFigures> = {};
  for (const y of years) {
    const row = balance.years.find((r) => Number(r.year) === y);
    out[y] = row ? { daysLeft: row.daysLeft, pending: row.pending } : null;
  }
  return out;
}

/** The admin's two record views of one person, as text, for "nothing is recorded" comparisons: GET /api/admin/people/:id/requests and …/history. */
export async function personRecords(admin: Actor, accountId: AccountId): Promise<{ requests: string; history: string }> {
  const id = encodeURIComponent(String(accountId));
  const r = await requireOk(await admin.api.get(`/api/admin/people/${id}/requests`), `GET /api/admin/people/${accountId}/requests`);
  const h = await requireOk(await admin.api.get(`/api/admin/people/${id}/history`), `GET /api/admin/people/${accountId}/history`);
  return { requests: await r.text(), history: await h.text() };
}

// ---------------------------------------------------------------------------------------------------
// Raw attempts (the product's answer, unjudged)
// ---------------------------------------------------------------------------------------------------

/** What one attempt at a confirmed action got: the first step's status, the act's status (null when the act was not sent), and whether it took (both 2xx). */
export interface Attempt {
  effectStatus: number | null;
  actStatus: number | null;
  token: string | null;
  accepted: boolean;
}

function isOk(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300;
}

/**
 * Tries a confirmed action the way the product offers it, on `api` (any actor's session, or anonymousApi()):
 * GET …/effect?action=<a>; when that answers 2xx with a token, POST the act with that token (routes per
 * confirmedActionRoutes). Never throws on a refusal.
 */
export async function tryConfirmed(
  api: APIRequestContext,
  action: ConfirmedAction,
  targetId: AccountId,
  extra: Record<string, unknown> = {},
): Promise<Attempt> {
  const { effect } = confirmedActionRoutes(action, targetId);
  const e = await api.get(effect);
  let token: string | null = null;
  if (e.ok()) {
    try {
      const body = (await e.json()) as { token?: unknown };
      token = typeof body?.token === 'string' && body.token !== '' ? body.token : null;
    } catch {
      token = null;
    }
  }
  if (token === null) return { effectStatus: e.status(), actStatus: null, token: null, accepted: false };
  const act = await actRaw(api, action, targetId, token, extra);
  return { effectStatus: e.status(), actStatus: act, token, accepted: isOk(act) };
}

/** Posts a confirmed action's act with `token` on `api` and returns its status, unjudged (a stale or foreign token is the test's to judge). */
export async function actRaw(
  api: APIRequestContext,
  action: ConfirmedAction,
  targetId: AccountId,
  token: string | null,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const { act } = confirmedActionRoutes(action, targetId);
  const data: Record<string, unknown> = action === 'switch-off' ? { on: false, ...extra } : { ...extra };
  if (token !== null) data.token = token;
  const res = await api.post(act, { data });
  return res.status();
}

/** A person's own cancel, raw: POST /api/requests/:id/cancel on `api`; returns the status, unjudged. */
export async function tryOwnCancel(api: APIRequestContext, requestId: AccountId): Promise<number> {
  const res = await api.post(`/api/requests/${encodeURIComponent(String(requestId))}/cancel`);
  return res.status();
}

/** Raw POST /api/admin/accounts/:id/allowance {allowance, startsNextYear} with any JSON value; returns the status, unjudged. */
export async function tryAllowance(api: APIRequestContext, accountId: AccountId, allowance: unknown, startsNextYear: boolean): Promise<number> {
  const route = `/api/admin/accounts/${encodeURIComponent(String(accountId))}/allowance`;
  const res = await api.post(route, { data: { allowance, startsNextYear } });
  return res.status();
}

/** True for a 2xx status. */
export function ok(status: number | null): boolean {
  return isOk(status);
}

/** A fresh anonymous API context, disposed after `fn`. */
export async function withAnonymous<T>(fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await anonymousApi();
  try {
    return await fn(api);
  } finally {
    await api.dispose();
  }
}
