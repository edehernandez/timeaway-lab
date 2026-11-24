// Purpose: shared setup for the request-rule ledger tests (REQ-001 to REQ-005) — an independent calendar oracle, the team clock in a far zone, a fresh team, and the stated readings of the request routes harness.ts has no reader for.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); every record is made through the product's public routes by harness.ts, fresh per run.
//
// This module is a harness boundary, not a row's test: it asserts nothing about any row. It goes through harness.ts
// only, reaches the product only over HTTP, and reads no application code.
//
// The calendar oracle below is plain UTC date arithmetic on YYYY-MM-DD strings, written here and never taken from the
// product: Monday to Friday are the weekdays (A-017), both ends of a range included.
//
// Readings of D-029 where it does not give a shape (a mismatch is a SETUP failure naming the route):
//   GET /api/requests        → a JSON array of the signed-in person's own requests, or an object holding that array
//                              under `requests`; each item carries `id` and its state as `state` (REQ-017's word; `status`
//                              is read when `state` is absent), and `kind`, `firstDay`, `lastDay` as POST takes them.
//   GET /api/calendar?year=<YYYY>&month=<1..12> → {days:[{date, people:[{name, accountId}]}]} (D-029), `month` 1-based.
//   a refusal (POST /api/requests, POST /api/requests/:id/cancel) → "a refusal with a plain message" (D-029): read
//                              here as a 4xx answer other than 401, 404 and 405 (those say the session or the route is
//                              missing, not that a rule refused), with a non-empty body. The callers' controls show the
//                              same session and route answering 2xx, so a 403 here is the rule's.
import type { APIResponse } from '@playwright/test';
import {
  approve,
  createMember,
  readBalance,
  requireOk,
  resetProduct,
  sendRequest,
  setClock,
  SetupError,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Install,
  type Member,
} from './harness';

// ---------------------------------------------------------------------------------------------------
// The calendar oracle
// ---------------------------------------------------------------------------------------------------

function ms(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`not a YYYY-MM-DD day: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmt(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** The day `y`-`m`-`d` as YYYY-MM-DD (m 1..12). */
export function day(y: number, m: number, d: number): string {
  return fmt(Date.UTC(y, m - 1, d));
}

/** The day `n` calendar days after `d` (n may be negative). */
export function addDays(d: string, n: number): string {
  return fmt(ms(d) + n * 86_400_000);
}

/** 0 Sunday, 1 Monday … 6 Saturday. */
export function dayOfWeek(d: string): number {
  return new Date(ms(d)).getUTCDay();
}

/** Monday to Friday (A-017). */
export function isWeekday(d: string): boolean {
  const w = dayOfWeek(d);
  return w >= 1 && w <= 5;
}

/** Every Monday to Friday day from `first` to `last`, both included (empty when last is before first). */
export function weekdaysIn(first: string, last: string): string[] {
  const out: string[] = [];
  for (let t = ms(first); t <= ms(last); t += 86_400_000) {
    const d = fmt(t);
    if (isWeekday(d)) out.push(d);
  }
  return out;
}

/** The count the oracle gives for a range: its Monday to Friday days, both ends included. */
export function countWeekdays(first: string, last: string): number {
  return weekdaysIn(first, last).length;
}

/** The first day on or after `d` that falls on `dow` (0 Sunday … 6 Saturday). */
export function onOrAfter(d: string, dow: number): string {
  let x = d;
  while (dayOfWeek(x) !== dow) x = addDays(x, 1);
  return x;
}

/** The first weekday on or after `d`. */
export function weekdayOnOrAfter(d: string): string {
  let x = d;
  while (!isWeekday(x)) x = addDays(x, 1);
  return x;
}

/** The last weekday on or before `d`. */
export function weekdayOnOrBefore(d: string): string {
  let x = d;
  while (!isWeekday(x)) x = addDays(x, -1);
  return x;
}

/** A range of exactly `n` (≥ 1) weekdays starting at the first weekday on or after `start`: {firstDay, lastDay}. */
export function weekdaySpan(start: string, n: number): { firstDay: string; lastDay: string } {
  if (n < 1) throw new Error('weekdaySpan needs n ≥ 1');
  const firstDay = weekdayOnOrAfter(start);
  let lastDay = firstDay;
  let count = 1;
  while (count < n) {
    lastDay = addDays(lastDay, 1);
    if (isWeekday(lastDay)) count += 1;
  }
  return { firstDay, lastDay };
}

export function yearOf(d: string): number {
  return Number(d.slice(0, 4));
}

/** A random whole number from `min` to `max`, both included (fresh per run). */
export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * A year chosen at random per run from 2031 to 2058 (so no product can hard-code the dates, and the machine's real
 * clock never falls inside the window under test), satisfying `pred` when given.
 */
export function pickYear(pred: (y: number) => boolean = () => true): number {
  const candidates: number[] = [];
  for (let y = 2031; y <= 2058; y += 1) if (pred(y)) candidates.push(y);
  if (candidates.length === 0) throw new Error('pickYear: no year satisfies the predicate');
  return candidates[randomInt(0, candidates.length - 1)];
}

// ---------------------------------------------------------------------------------------------------
// The team clock, far from the container's UTC (BASELINE "Test environment", D-007)
// ---------------------------------------------------------------------------------------------------

/** The team time zone every request-rule test installs: UTC+14 all year (no summer time), against the container's UTC. */
export const TEAM_ZONE = 'Pacific/Kiritimati';
const TEAM_OFFSET_MINUTES = 14 * 60;

/**
 * The ISO instant at which the team clock (TEAM_ZONE) reads day `d` at `hhmm`. Any team time before 14:00 is a UTC
 * instant on the day before `d`, so a product that reads today in UTC is one day behind there.
 */
export function teamAt(d: string, hhmm = '09:00'): string {
  const [h, mi] = hhmm.split(':').map(Number);
  const t = ms(d) + (h * 60 + mi) * 60_000 - TEAM_OFFSET_MINUTES * 60_000;
  return new Date(t).toISOString().replace('.000Z', 'Z');
}

/** The UTC calendar date of an ISO instant (what a product reading the server's zone would call today). */
export function utcDateOf(instant: string): string {
  return new Date(instant).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------
// A fresh team
// ---------------------------------------------------------------------------------------------------

export interface Team {
  install: Install;
  admin: Actor;
  /** The members' accounts, in the order of `allowances`. */
  members: Member[];
  /** The members signed in through the actor door, in the same order. */
  people: Actor[];
  dispose(): Promise<void>;
}

/**
 * A fresh install in TEAM_ZONE with the team clock at `now`, its admin signed in, and one member per entry of
 * `allowances` (each with that allowance, its own password chosen, signed in).
 */
export async function setupTeam(opts: { now: string; allowances: number[]; adminAllowance?: number }): Promise<Team> {
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: opts.now, admin: { allowance: opts.adminAllowance ?? 25 } });
  const admin = await signIn(install.admin);
  const members: Member[] = [];
  const people: Actor[] = [];
  try {
    for (const allowance of opts.allowances) {
      const m = await createMember(admin, { allowance });
      members.push(m);
      people.push(await signInMember(m));
    }
  } catch (e) {
    for (const p of people) await p.dispose();
    await admin.dispose();
    throw e;
  }
  return {
    install,
    admin,
    members,
    people,
    dispose: async () => {
      for (const p of people) await p.dispose();
      await admin.dispose();
    },
  };
}

/**
 * Moves the team clock (POST /api/__test/clock) and signs the admin and every person in again at the new instant,
 * replacing each Actor's session in place (references held by a test stay valid). A session the product dates by the
 * team clock may lapse across a jump; signing in afresh keeps that a non-question for the row under test.
 */
export async function moveClock(team: Team, now: string): Promise<void> {
  await setClock(now);
  for (const actor of [team.admin, ...team.people]) {
    const renewed = await signIn(actor.credentials);
    await actor.dispose();
    Object.assign(actor, renewed);
  }
}

// ---------------------------------------------------------------------------------------------------
// Raw answers: the row's own action, read unjudged
// ---------------------------------------------------------------------------------------------------

export interface Answer {
  status: number;
  ok: boolean;
  text: string;
  json: unknown;
  /** The `id` of a 2xx answer's body, when it carries one. */
  id?: AccountId;
}

export async function readAnswer(res: APIResponse): Promise<Answer> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const id = res.ok() && json && typeof json === 'object' && 'id' in (json as object) ? ((json as { id: AccountId }).id ?? undefined) : undefined;
  return { status: res.status(), ok: res.ok(), text, json, id };
}

/** POST /api/requests with `body` exactly as given (it may carry anything), on the actor's own session; the answer unjudged. */
export async function trySend(actor: Actor, body: unknown, query = ''): Promise<Answer> {
  return readAnswer(await actor.api.post(`/api/requests${query}`, { data: body }));
}

/** POST /api/requests/:id/cancel on the actor's own session; the answer unjudged. */
export async function tryCancel(actor: Actor, requestId: AccountId): Promise<Answer> {
  return readAnswer(await actor.api.post(`/api/requests/${encodeURIComponent(String(requestId))}/cancel`));
}

/** A rule's refusal as this module reads D-029 (see the header): a 4xx other than 401/404/405, with a body. */
export function isRuleRefusal(a: Answer): boolean {
  return a.status >= 400 && a.status < 500 && ![401, 404, 405].includes(a.status) && a.text.trim() !== '';
}

/** An acceptance: a 2xx answer carrying the new record's id. */
export function isAcceptance(a: Answer): boolean {
  return a.ok && a.id !== undefined && a.id !== null;
}

/** A one-line description of an answer for assertion messages. */
export function describe(a: Answer): string {
  return `${a.status} ${a.text.replace(/\s+/g, ' ').slice(0, 200)}`;
}

/**
 * Every whole number the answer shows: in its text when it is not JSON, else in every string and number it carries;
 * dates and instants (YYYY-MM-DD, with or without a time) are removed first so their parts are not read as figures.
 */
export function numbersShown(a: Answer): number[] {
  const parts: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as object).forEach(walk);
  };
  if (a.json === undefined) parts.push(a.text);
  else walk(a.json);
  const text = parts
    .join(' \n ')
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ');
  return (text.match(/-?\d+/g) ?? []).map(Number);
}

// ---------------------------------------------------------------------------------------------------
// Reads (stated in the header)
// ---------------------------------------------------------------------------------------------------

export interface StoredRequest {
  id: AccountId;
  state: string;
  kind: unknown;
  firstDay: unknown;
  lastDay: unknown;
  raw: Record<string, unknown>;
}

/** GET /api/requests on the actor's own session: the person's own requests, as read in the header. */
export async function ownRequests(actor: Actor): Promise<StoredRequest[]> {
  const res = await requireOk(await actor.api.get('/api/requests'), 'GET /api/requests');
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SetupError('GET /api/requests answered without a JSON body');
  }
  const list = Array.isArray(body) ? body : (body as { requests?: unknown })?.requests;
  if (!Array.isArray(list)) throw new SetupError('GET /api/requests carried no array (read: an array, or {requests:[…]})');
  return list.map((item, i) => {
    const r = item as Record<string, unknown>;
    if (!r || typeof r !== 'object' || r.id === undefined || r.id === null) {
      throw new SetupError(`GET /api/requests item ${i} carried no id`);
    }
    const state = r.state ?? r.status;
    if (typeof state !== 'string') throw new SetupError(`GET /api/requests item ${i} carried no state`);
    return { id: r.id as AccountId, state, kind: r.kind, firstDay: r.firstDay, lastDay: r.lastDay, raw: r };
  });
}

/** The actor's own request with this id, or undefined when GET /api/requests does not list it. */
export async function ownRequest(actor: Actor, requestId: AccountId): Promise<StoredRequest | undefined> {
  return (await ownRequests(actor)).find((r) => String(r.id) === String(requestId));
}

/** The actor's own balance for `year` from GET /api/balance; a SetupError when that year is not listed. */
export async function yearBalance(actor: Actor, year: number): Promise<{ daysLeft: number; pending: number }> {
  const balance = await readBalance(actor);
  const y = balance?.years?.find((e) => Number(e.year) === year);
  if (!y) throw new SetupError(`GET /api/balance listed no year ${year}`);
  return { daysLeft: Number(y.daysLeft), pending: Number(y.pending) };
}

/** The people GET /api/calendar lists as away on day `d` ([] when the day is not listed). */
export async function awayOn(actor: Actor, d: string): Promise<{ name: string; accountId?: AccountId }[]> {
  const route = `/api/calendar?year=${yearOf(d)}&month=${Number(d.slice(5, 7))}`;
  const res = await requireOk(await actor.api.get(route), `GET ${route}`);
  let body: { days?: { date: string; people?: { name: string; accountId?: AccountId }[] }[] };
  try {
    body = await res.json();
  } catch {
    throw new SetupError(`GET ${route} answered without a JSON body`);
  }
  if (!Array.isArray(body?.days)) throw new SetupError(`GET ${route} carried no days array`);
  return body.days.find((e) => e.date === d)?.people ?? [];
}

/** True when the calendar lists `member` (by account id when the entry carries one, else by name) away on day `d`. */
export async function isAwayOn(viewer: Actor, member: { id: AccountId; name: string }, d: string): Promise<boolean> {
  const people = await awayOn(viewer, d);
  return people.some((p) =>
    p.accountId !== undefined && p.accountId !== null ? String(p.accountId) === String(member.id) : p.name === member.name,
  );
}

// ---------------------------------------------------------------------------------------------------
// Fixture: vacation already spent in a year
// ---------------------------------------------------------------------------------------------------

/**
 * Makes `approved` counted days of approved vacation and then `pending` counted days of pending vacation for the
 * member, as two requests sent on the member's session (the approved one approved by the admin's two-step action),
 * starting at the first weekday on or after `start`. A count of 0 sends nothing. Returns the ids and the first day
 * after the last day used. Every request goes through the public routes; a refusal is a SetupError.
 */
export async function spendVacation(
  admin: Actor,
  person: Actor,
  start: string,
  approved: number,
  pending: number,
): Promise<{ approvedId?: AccountId; pendingId?: AccountId; nextFree: string }> {
  let cursor = start;
  let approvedId: AccountId | undefined;
  let pendingId: AccountId | undefined;
  if (approved > 0) {
    const span = weekdaySpan(cursor, approved);
    approvedId = await sendRequest(person, { kind: 'vacation', ...span });
    await approve(admin, approvedId);
    cursor = addDays(span.lastDay, 1);
  }
  if (pending > 0) {
    const span = weekdaySpan(cursor, pending);
    pendingId = await sendRequest(person, { kind: 'vacation', ...span });
    cursor = addDays(span.lastDay, 1);
  }
  return { approvedId, pendingId, nextFree: cursor };
}
