// Purpose: shared setup and oracles for the team-clock, date and allowance-year rows (ROW-130 to ROW-152) — team-zone instants worked out with Intl, a fresh team made through harness.ts, raw (unjudged) sends and admin acts, request records read by value, the calendar and balance as exact figures, a shown-date matcher, and a browser page opened in a chosen browser zone and locale.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); every record it makes goes through harness.ts and the public routes of D-029, fresh per run; its date arithmetic is the tests' own oracle (UTC arithmetic on YYYY-MM-DD and Intl), never the product's.
//
// This module is a harness boundary, not a row's test: it asserts nothing about any row. It reaches the product only
// through harness.ts and HTTP, and reads no application code.
//
// Readings of D-029 where it gives no shape (a product answering another shape fails as SETUP naming the route):
//   - A list route (GET /api/requests, GET /api/admin/pending, GET /api/admin/people/:id/requests) answers JSON: an
//     array of request records, or an object holding them in `requests`, `pending` or `items`, or in its one property
//     whose value is an array. Each record is an object carrying `id`, the id POST /api/requests answered (201 {id}).
//     The list's order is the order its page shows.
//   - A record's facts are read BY VALUE, never by field name: a day is a string leaf exactly YYYY-MM-DD (D-007); a
//     count or a days-left figure is a number leaf under a key that is not an id; a state is the `state` (or `status`)
//     field, else the one string leaf among pending|approved|rejected|cancelled ("canceled" read as cancelled).
//   - A record's cancel day (REQ-017 "the Monday to Friday day its cancel takes effect from") is a day leaf under a
//     key whose name holds "cancel" and does not name a time (…At, …_at, …Time, when): cancelFrom, cancelledFrom,
//     cancelDay, cancelEffectiveFrom. A whole cancel carries none (D-020).
//   - GET /api/admin/people/:id/history answers JSON (any shape); it is read by value.
//   - A refusal (D-029 "a refusal with a plain message") is a 4xx answer other than 401, 404 and 405 (those say the
//     session or the route is missing, not that a rule refused) with a non-empty body. Each caller's control shows the
//     same session and route answering 2xx.
//   - A confirmed action refused by a rule may be refused at its first step (GET …/effect) or at the act; tryConfirmed
//     returns the answer of whichever step refused.
import type { APIRequestContext, APIResponse, Browser } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  approve,
  confirmedActionRoutes,
  createMember,
  productUrl,
  requireOk,
  resetProduct,
  setClock,
  SetupError,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Install,
  type Member,
  type Opened,
  type RequestSpec,
} from './harness';

export const AUCKLAND = 'Pacific/Auckland';
export const LOS_ANGELES = 'America/Los_Angeles';

// ---------------------------------------------------------------------------------------------------
// The calendar oracle: plain UTC arithmetic on YYYY-MM-DD (Monday to Friday are the weekdays, A-017)
// ---------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function epochOf(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new SetupError(`not a YYYY-MM-DD day: ${ymd}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(t).toISOString().slice(0, 10) !== ymd) throw new SetupError(`not a real day: ${ymd}`);
  return t;
}

/** The day `n` days after `ymd` (n may be negative). */
export function addDays(ymd: string, n: number): string {
  return new Date(epochOf(ymd) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 Sunday … 6 Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(epochOf(ymd)).getUTCDay();
}

export function isWeekday(ymd: string): boolean {
  const d = weekdayOf(ymd);
  return d >= 1 && d <= 5;
}

/** Every day from first to last, both included. */
export function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let t = epochOf(first); t <= epochOf(last); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** The Monday to Friday days from first to last, both included. */
export function weekdaysBetween(first: string, last: string): string[] {
  return daysBetween(first, last).filter(isWeekday);
}

export function yearOf(ymd: string): number {
  return Number(ymd.slice(0, 4));
}

/** The last Monday to Friday day of a year. */
export function lastWeekdayOfYear(year: number): string {
  let d = `${year}-12-31`;
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/** The first Monday to Friday day of a year. */
export function firstWeekdayOfYear(year: number): string {
  let d = `${year}-01-01`;
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

// ---------------------------------------------------------------------------------------------------
// The zone oracle (Intl, the tests' own)
// ---------------------------------------------------------------------------------------------------

function partsIn(zone: string, ms: number): { ymd: string; hm: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/** The team-zone date of an instant. */
export function teamDateOf(zone: string, iso: string): string {
  return partsIn(zone, Date.parse(iso)).ymd;
}

/** The team-zone HH:MM of an instant. */
export function teamTimeOf(zone: string, iso: string): string {
  return partsIn(zone, Date.parse(iso)).hm;
}

/** The UTC date of an instant (the container's zone, BASELINE "Test environment"). */
export function utcDateOf(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 10);
}

/**
 * The instant (ISO 8601, UTC) at which the wall clock in `zone` reads `ymd` `hm`. Throws a SetupError when that local
 * time does not exist or the result does not read back (a fall-back hour is never asked for through this function;
 * the tests that need one name the UTC instant and check it with teamDateOf/teamTimeOf).
 */
export function teamInstant(zone: string, ymd: string, hm: string): string {
  const [h, mi] = hm.split(':').map(Number);
  const wall = epochOf(ymd) + (h * 60 + mi) * 60_000;
  let t = wall;
  for (let i = 0; i < 3; i += 1) {
    const p = partsIn(zone, t);
    const seen = epochOf(p.ymd) + (Number(p.hm.slice(0, 2)) * 60 + Number(p.hm.slice(3, 5))) * 60_000;
    t += wall - seen;
  }
  const back = partsIn(zone, t);
  if (back.ymd !== ymd || back.hm !== hm) throw new SetupError(`${ymd} ${hm} does not exist in ${zone}`);
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------------------------------------
// A fresh team, and every session opened here closed after each case
// ---------------------------------------------------------------------------------------------------

const openSessions: { dispose(): Promise<void> }[] = [];

/** Closes every actor and page this module opened. Call it from test.afterEach. */
export async function disposeAll(): Promise<void> {
  while (openSessions.length > 0) {
    const s = openSessions.pop();
    await s?.dispose().catch(() => undefined);
  }
}

function track<T extends { dispose(): Promise<void> }>(s: T): T {
  openSessions.push(s);
  return s;
}

export interface Team {
  install: Install;
  admin: Actor;
  zone: string;
}

/** Resets the product with the team zone and the clock at `now`, and signs the admin in. */
export async function startTeam(opts: { zone: string; now: string; adminAllowance?: number }): Promise<Team> {
  const install = await resetProduct({ timeZone: opts.zone, now: opts.now, admin: { allowance: opts.adminAllowance ?? 25 } });
  const admin = track(await signIn(install.admin));
  return { install, admin, zone: opts.zone };
}

/** Creates a member through the admin (harness createMember, own password chosen) and signs it in. */
export async function addMember(team: Team, opts: { allowance?: number; name?: string } = {}): Promise<{ member: Member; actor: Actor }> {
  const member = await createMember(team.admin, { allowance: opts.allowance ?? 25, name: opts.name });
  const actor = track(await signInMember(member));
  return { member, actor };
}

/** Signs a member in again (after the clock moved, or after it was switched back on), tracked for disposal. */
export async function signInAgain(member: Member): Promise<Actor> {
  return track(await signInMember(member));
}

/** Moves the team clock to the instant at which the team's wall clock reads `ymd` `hm`. */
export async function setTeamClock(zone: string, ymd: string, hm: string): Promise<string> {
  const iso = teamInstant(zone, ymd, hm);
  await setClock(iso);
  return iso;
}

// ---------------------------------------------------------------------------------------------------
// Raw answers (unjudged)
// ---------------------------------------------------------------------------------------------------

export interface Answer {
  status: number;
  text: string;
  json: unknown;
}

export async function answerOf(res: APIResponse): Promise<Answer> {
  const text = await res.text().catch(() => '');
  let json: unknown = undefined;
  try {
    json = text === '' ? undefined : JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status(), text, json };
}

/** 2xx. */
export function isAccepted(a: Answer): boolean {
  return a.status >= 200 && a.status < 300;
}

/** A rule's refusal: 4xx other than 401, 404, 405, with a non-empty body. */
export function isRefusal(a: Answer): boolean {
  return a.status >= 400 && a.status < 500 && ![401, 404, 405].includes(a.status) && a.text.trim() !== '';
}

/** POST /api/requests with any body (or a raw JSON text), headers and query, unjudged. */
export async function trySend(
  actor: Actor,
  body: unknown,
  opts: { headers?: Record<string, string>; params?: Record<string, string>; rawText?: boolean } = {},
): Promise<Answer> {
  const headers = { ...(opts.rawText ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) };
  const res = await actor.api.post('/api/requests', { data: body, headers, params: opts.params });
  return answerOf(res);
}

/** The id a 2xx send answered, or undefined. */
export function idOf(a: Answer): AccountId | undefined {
  const j = a.json as { id?: AccountId } | undefined;
  return j && j.id !== undefined && j.id !== null ? j.id : undefined;
}

/** Sends a request that must be accepted as setup (a refusal here is SETUP, naming the request). */
export async function sendOk(actor: Actor, spec: RequestSpec): Promise<AccountId> {
  const a = await trySend(actor, spec);
  const id = idOf(a);
  if (!isAccepted(a) || id === undefined) {
    throw new SetupError(`POST /api/requests ${JSON.stringify(spec)} answered ${a.status}: ${a.text.slice(0, 300)}`);
  }
  return id;
}

/** Sends and approves (setup). */
export async function sendApproved(team: Team, actor: Actor, spec: RequestSpec): Promise<AccountId> {
  const id = await sendOk(actor, spec);
  await approve(team.admin, id);
  return id;
}

/**
 * A confirmed action attempted in its two steps, unjudged: the effect step's answer when it is not 2xx (a refusal at
 * the first step), else the act's answer. `extra` merges into the act's body.
 */
export async function tryConfirmed(
  admin: Actor,
  action: ConfirmedAction,
  targetId: AccountId,
  extra: Record<string, unknown> = {},
): Promise<Answer> {
  const { effect } = confirmedActionRoutes(action, targetId);
  const first = await answerOf(await admin.api.get(effect));
  if (!isAccepted(first)) return first;
  const token = (first.json as { token?: unknown } | undefined)?.token;
  if (typeof token !== 'string' || token === '') throw new SetupError(`GET ${effect} answered ${first.status} without a token`);
  return answerOf(await actWithToken(admin, action, targetId, token, extra));
}

/** POST /api/admin/accounts/:id/switch {on:true}, unjudged. */
export async function trySwitchOn(admin: Actor, accountId: AccountId): Promise<Answer> {
  return answerOf(await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/switch`, { data: { on: true } }));
}

/** POST /api/admin/accounts with any body, unjudged. */
export async function tryCreate(admin: Actor, body: unknown, rawText = false): Promise<Answer> {
  return answerOf(
    await admin.api.post('/api/admin/accounts', { data: body, headers: rawText ? { 'content-type': 'application/json' } : {} }),
  );
}

/** POST /api/admin/accounts/:id/allowance with any body (or a raw JSON text), unjudged. */
export async function tryAllowance(admin: Actor, accountId: AccountId, body: unknown, rawText = false): Promise<Answer> {
  return answerOf(
    await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/allowance`, {
      data: body,
      headers: rawText ? { 'content-type': 'application/json' } : {},
    }),
  );
}

/** One sign-in on a fresh cookie jar: whether GET /api/me then answers 200. */
export async function canSignIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    await api.post('/api/auth/sign-in', { data: { email, password } });
    return (await api.get('/api/me')).status() === 200;
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// Readers, by value
// ---------------------------------------------------------------------------------------------------

export type Rec = Record<string, unknown>;

function listIn(body: unknown, route: string): Rec[] {
  if (Array.isArray(body)) return body as Rec[];
  if (body && typeof body === 'object') {
    const o = body as Rec;
    for (const k of ['requests', 'pending', 'items']) if (Array.isArray(o[k])) return o[k] as Rec[];
    const arrays = Object.values(o).filter(Array.isArray);
    if (arrays.length === 1) return arrays[0] as Rec[];
  }
  throw new SetupError(`${route} answered no list of records: ${JSON.stringify(body).slice(0, 300)}`);
}

async function readListAt(api: APIRequestContext, route: string): Promise<Rec[]> {
  const res = await requireOk(await api.get(route), `GET ${route}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SetupError(`GET ${route} answered without JSON`);
  }
  return listIn(body, `GET ${route}`);
}

/** The actor's own requests (GET /api/requests), in the page's order. */
export async function ownRecords(actor: Actor): Promise<Rec[]> {
  return readListAt(actor.api, '/api/requests');
}

/** A person's requests as the admin reads them (GET /api/admin/people/:id/requests). */
export async function personRecords(admin: Actor, accountId: AccountId): Promise<Rec[]> {
  return readListAt(admin.api, `/api/admin/people/${encodeURIComponent(String(accountId))}/requests`);
}

/** The admin's pending list (GET /api/admin/pending), in the page's order. */
export async function pendingRecords(admin: Actor): Promise<Rec[]> {
  return readListAt(admin.api, '/api/admin/pending');
}

/** A person's history (GET /api/admin/people/:id/history), as JSON. */
export async function historyOf(admin: Actor, accountId: AccountId): Promise<unknown> {
  const route = `/api/admin/people/${encodeURIComponent(String(accountId))}/history`;
  const res = await requireOk(await admin.api.get(route), `GET ${route}`);
  try {
    return await res.json();
  } catch {
    throw new SetupError(`GET ${route} answered without JSON`);
  }
}

export function recordById(records: Rec[], id: AccountId): Rec | undefined {
  return records.find((r) => r && String(r.id) === String(id));
}

/** Every string leaf of a value, depth first, in order. */
export function stringLeaves(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(stringLeaves);
  if (v && typeof v === 'object') return Object.values(v as Rec).flatMap(stringLeaves);
  return [];
}

/** Every number leaf (or integer string) under a key that is not an id (`id`, `…Id`, `…_id`), in order. */
export function numberLeaves(v: unknown, key = ''): number[] {
  if (/(^id$|Id$|_id$)/.test(key)) return [];
  if (typeof v === 'number') return [v];
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return [Number(v)];
  if (Array.isArray(v)) return v.flatMap((x) => numberLeaves(x, key));
  if (v && typeof v === 'object') return Object.entries(v as Rec).flatMap(([k, x]) => numberLeaves(x, k));
  return [];
}

/** The day leaves (exactly YYYY-MM-DD) of a value, in order. */
export function dayLeaves(v: unknown): string[] {
  return stringLeaves(v).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

/** The record's cancel days: day leaves under a key naming a cancel and not a time (the reading above). */
export function cancelDaysOf(record: Rec | undefined): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string') {
      if (/cancel/i.test(key) && !/(At|_at|Time|time|[Ww]hen)$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(v);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Rec)) walk(x, /cancel/i.test(key) && !/cancel/i.test(k) ? `${key}.${k}` : k);
  };
  walk(record, '');
  return [...new Set(out)];
}

const STATES = ['pending', 'approved', 'rejected', 'cancelled'];

/** A record's state: its `state` (or `status`) field, else its one state-word leaf; undefined when unclear. */
export function stateOf(record: Rec | undefined): string | undefined {
  if (!record) return undefined;
  const norm = (s: unknown) => (typeof s === 'string' ? (s.toLowerCase() === 'canceled' ? 'cancelled' : s.toLowerCase()) : undefined);
  for (const k of ['state', 'status']) {
    const s = norm(record[k]);
    if (s && STATES.includes(s)) return s;
  }
  const found = [...new Set(stringLeaves(record).map(norm).filter((s): s is string => !!s && STATES.includes(s)))];
  return found.length === 1 ? found[0] : undefined;
}

/** The actor's balance years, sorted. */
export async function balanceYears(actor: Actor): Promise<number[]> {
  const res = await requireOk(await actor.api.get('/api/balance'), 'GET /api/balance');
  const body = (await res.json().catch(() => null)) as { years?: { year: number }[] } | null;
  if (!body || !Array.isArray(body.years)) throw new SetupError('GET /api/balance answered no years');
  return body.years.map((y) => Number(y.year)).sort((a, b) => a - b);
}

/** One year's figures from GET /api/balance, or undefined when that year is not shown. */
export async function yearFigures(actor: Actor, year: number): Promise<{ daysLeft: number; pending: number } | undefined> {
  const res = await requireOk(await actor.api.get('/api/balance'), 'GET /api/balance');
  const body = (await res.json().catch(() => null)) as { years?: { year: number; daysLeft: number; pending: number }[] } | null;
  if (!body || !Array.isArray(body.years)) throw new SetupError('GET /api/balance answered no years');
  const y = body.years.find((e) => Number(e.year) === year);
  return y ? { daysLeft: Number(y.daysLeft), pending: Number(y.pending) } : undefined;
}

/** The days of a month (GET /api/calendar?year&month, month 1-based) on which `name` is listed, sorted. */
export async function calendarDatesFor(actor: Actor, year: number, month: number, name: string): Promise<string[]> {
  const route = `/api/calendar?year=${year}&month=${month}`;
  const res = await requireOk(await actor.api.get(route), `GET ${route}`);
  const body = (await res.json().catch(() => null)) as { days?: { date: string; people?: { name: string }[] }[] } | null;
  if (!body || !Array.isArray(body.days)) throw new SetupError(`GET ${route} answered no days`);
  return body.days
    .filter((d) => Array.isArray(d.people) && d.people.some((p) => p && p.name === name))
    .map((d) => String(d.date))
    .sort();
}

// ---------------------------------------------------------------------------------------------------
// Shown dates, and a page in a chosen browser zone
// ---------------------------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A pattern for one day as a page shows it, in full, with the month as a word and the year (ROW-138's format):
 * "29 December 2026", "Tue 29 Dec 2026", "December 29, 2026", "29th of December 2026". The month full or in three
 * letters (or "Sept"); the day with or without a leading zero or an ordinal. Never a bare day, never a number month.
 */
export function shownDate(ymd: string): RegExp {
  const y = ymd.slice(0, 4);
  const m = MONTHS[Number(ymd.slice(5, 7)) - 1];
  const d = String(Number(ymd.slice(8, 10)));
  const mon = `(?:${m}|${m.slice(0, 3)}${m === 'September' ? '|Sept' : ''})\\.?`;
  const day = `0?${d}(?:st|nd|rd|th)?`;
  return new RegExp(`(?:\\b${day}\\s+(?:of\\s+)?${mon},?\\s+${y}\\b|\\b${mon}\\s+${day},?\\s+${y}\\b)`, 'i');
}

/** A date written with a number month: 2027-03-04, 03/04/2027, 3.4.27, 2027/3/4. */
export const NUMERIC_DATE = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b\d{4}\/\d{1,2}\/\d{1,2}\b/;

/** Day-first ("29 December 2026") and month-first ("December 29, 2026") dates in a text: how many of each. */
export function dateOrders(text: string): { dayFirst: number; monthFirst: number } {
  const mon = `(?:${MONTHS.join('|')}|${MONTHS.map((m) => m.slice(0, 3)).join('|')}|Sept)\\.?`;
  const dayFirst = (text.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon},?\\s+\\d{4}\\b`, 'gi')) ?? []).length;
  const monthFirst = (text.match(new RegExp(`\\b${mon}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'gi')) ?? []).length;
  return { dayFirst, monthFirst };
}

/**
 * The engine door (harness openPage) with the browser's own zone and locale chosen: a fresh Chromium context at the
 * product's base URL carrying the actor's session cookie, console and page errors collected. Tracked for disposal.
 */
export async function openPageIn(
  browser: Browser,
  actor: Actor | 'anonymous',
  opts: { timezoneId: string; locale?: string },
): Promise<Opened> {
  const storageState = actor === 'anonymous' ? undefined : await actor.api.storageState();
  const context = await browser.newContext({ baseURL: productUrl(), storageState, timezoneId: opts.timezoneId, locale: opts.locale ?? 'en-US' });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  const opened: Opened = { context, page, consoleErrors, close: () => context.close() };
  track({ dispose: () => context.close() });
  return opened;
}

/**
 * Loads `path` and waits (a bounded wait on the page's own text, no sleep) until the page's text matches every pattern of `ready`; returns the
 * page's text then, or after the wait ran out (the caller's assertions then say what is missing).
 */
export async function pageTextWhen(opened: Opened, path: string, ready: RegExp[], timeoutMs = 15_000): Promise<string> {
  await opened.page.goto(path);
  const sources = ready.map((r) => [r.source, r.flags] as [string, string]);
  await opened.page
    .waitForFunction(
      (srcs: [string, string][]) => srcs.every(([s, f]) => new RegExp(s, f).test(document.body ? document.body.innerText : '')),
      sources,
      { timeout: timeoutMs },
    )
    .catch(() => undefined);
  return opened.page.locator('body').innerText().catch(() => '');
}
