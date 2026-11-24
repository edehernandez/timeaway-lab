// Purpose: shared readers and matchers for the request-list rows (REQ-006, REQ-007, REQ-008) — the own requests list, the admin's pending list, a rejection carrying a note, and calendar-day helpers the tests compute themselves.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3), from DECISIONS.md D-029 (the routes) and D-007 (days are YYYY-MM-DD in the team time zone); a public harness boundary beside harness.ts, imported by ledger tests only.
//
// Readings. D-029 names GET /api/requests and GET /api/admin/pending but not their bodies, and elides the reject
// act's note field. This module's reading is stated here once, so a product that answers another shape fails as
// SETUP naming the route, never as a row failing:
//   - A list route answers JSON: an array of request records, or an object holding them in `requests`, `pending` or
//     `items`, or in its one property whose value is an array of objects. Each record is an object carrying `id`,
//     the same id POST /api/requests answered (201 {id}). The list's order is the order its page shows.
//     GET /api/requests is the data of the person's own requests page (D-029's "/"); GET /api/admin/pending is the
//     data of /admin/pending.
//   - A record's facts are read BY VALUE, never by field name, so no field naming is imposed on the product:
//     a kind is a string leaf "vacation" or "sick"; a day is a string leaf equal to its YYYY-MM-DD (D-007); a count
//     or a days-left figure is a number leaf (or an integer string) under a key that is not an id; a state is a
//     string leaf pending|approved|rejected|cancelled ("canceled" read as cancelled); who is a string leaf equal
//     to the person's display name; when is a leaf that is that instant (an ISO 8601 string, or epoch ms or s,
//     within a minute) or a string carrying the instant's team-zone date and HH:MM.
//   - The admin's rejection note travels in the reject act's body as `note`:
//     POST /api/admin/requests/:id/reject {token, note} (harness.ts confirmedActionRoutes, `extra`).
import type { APIRequestContext, APIResponse } from '@playwright/test';
import {
  actWithToken,
  readEffect,
  requireOk,
  resetProduct,
  sendRequest,
  setClock,
  SetupError,
  signIn,
  type AccountId,
  type Actor,
  type Install,
  type RequestSpec,
} from './harness';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** One request record of a list route: its id, its place in the list, and the record as sent. */
export interface RequestRecord {
  id: AccountId;
  index: number;
  raw: { [k: string]: Json };
}

/** A list route's answer: the records in the order sent, and the whole body as text. */
export interface Listed {
  records: RequestRecord[];
  text: string;
}

function listOf(body: Json, route: string): Json[] {
  if (Array.isArray(body)) return body;
  if (body !== null && typeof body === 'object') {
    for (const k of ['requests', 'pending', 'items']) {
      const v = (body as { [k: string]: Json })[k];
      if (Array.isArray(v)) return v;
    }
    const arrays = Object.values(body).filter(
      (v): v is Json[] => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x)),
    );
    if (arrays.length === 1) return arrays[0];
  }
  throw new SetupError(`GET ${route} answered a body that is not a list of request records: ${JSON.stringify(body).slice(0, 300)}`);
}

async function readList(api: APIRequestContext, route: string): Promise<Listed> {
  const res = await api.get(route);
  await requireOk(res, `GET ${route}`);
  const text = await res.text();
  let body: Json;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    throw new SetupError(`GET ${route} answered ${res.status()} without a JSON body: ${text.slice(0, 300)}`);
  }
  const records = listOf(body, route).map((el, index) => {
    if (el === null || typeof el !== 'object' || Array.isArray(el)) {
      throw new SetupError(`GET ${route}: item ${index} is not a record: ${JSON.stringify(el).slice(0, 200)}`);
    }
    const id = (el as { [k: string]: Json }).id;
    if (id === undefined || id === null || typeof id === 'object' || typeof id === 'boolean') {
      throw new SetupError(`GET ${route}: item ${index} carries no id: ${JSON.stringify(el).slice(0, 200)}`);
    }
    return { id: id as AccountId, index, raw: el as { [k: string]: Json } };
  });
  return { records, text };
}

/** The signed-in person's own requests: GET /api/requests (the data of the own requests page). */
export async function readOwnRequests(actor: Actor): Promise<Listed> {
  return readList(actor.api, '/api/requests');
}

/** The admin's pending requests: GET /api/admin/pending (the data of /admin/pending). */
export async function readPending(admin: Actor): Promise<Listed> {
  return readList(admin.api, '/api/admin/pending');
}

/** The record with this id, or undefined when the list does not carry it. */
export function recordOf(listed: Listed, id: AccountId): RequestRecord | undefined {
  return listed.records.find((r) => String(r.id) === String(id));
}

/** The ids a list carries, as strings, in its order. */
export function idsOf(listed: Listed): string[] {
  return listed.records.map((r) => String(r.id));
}

/** A short rendering of a record for failure messages. */
export function show(record: RequestRecord | undefined): string {
  return record === undefined ? '<not listed>' : JSON.stringify(record.raw).slice(0, 600);
}

interface Leaf {
  key: string;
  value: string | number | boolean;
}

function leavesOf(value: Json, key = ''): Leaf[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => leavesOf(v, key));
  if (typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leavesOf(v, k));
  return [{ key, value }];
}

function isIdKey(key: string): boolean {
  return key === 'id' || /Id$/.test(key) || /_id$/i.test(key);
}

/** Every string value in the record, trimmed. */
export function stringsOf(record: RequestRecord): string[] {
  return leavesOf(record.raw)
    .filter((l) => typeof l.value === 'string')
    .map((l) => (l.value as string).trim());
}

/** Every number in the record outside its id fields (integer strings included). */
export function numbersOf(record: RequestRecord): number[] {
  const out: number[] = [];
  for (const l of leavesOf(record.raw)) {
    if (isIdKey(l.key)) continue;
    if (typeof l.value === 'number') out.push(l.value);
    else if (typeof l.value === 'string' && /^[-−]?\d+$/.test(l.value.trim())) {
      out.push(Number(l.value.trim().replace('−', '-')));
    }
  }
  return out;
}

/** The record carries this exact string (trimmed), e.g. a display name, a day, a note. */
export function hasString(record: RequestRecord, s: string): boolean {
  return stringsOf(record).includes(s);
}

/** The record carries this number outside its id fields. */
export function hasNumber(record: RequestRecord, n: number): boolean {
  return numbersOf(record).includes(n);
}

const STATES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type State = (typeof STATES)[number];

/** The request states the record names. */
export function statesOf(record: RequestRecord): Set<State> {
  const out = new Set<State>();
  for (const s of stringsOf(record)) {
    const v = s.toLowerCase() === 'canceled' ? 'cancelled' : s.toLowerCase();
    if ((STATES as readonly string[]).includes(v)) out.add(v as State);
  }
  return out;
}

/** The kinds the record names. */
export function kindsOf(record: RequestRecord): Set<'vacation' | 'sick'> {
  const out = new Set<'vacation' | 'sick'>();
  for (const s of stringsOf(record)) {
    const v = s.toLowerCase();
    if (v === 'vacation' || v === 'sick') out.add(v);
  }
  return out;
}

/** The record carries this instant: an ISO string or an epoch number within a minute, or a string with its team-zone date and HH:MM. */
export function hasInstant(record: RequestRecord, isoInstant: string, timeZone: string): boolean {
  const t = Date.parse(isoInstant);
  const localDate = teamDate(isoInstant, timeZone);
  const localTime = teamTime(isoInstant, timeZone);
  for (const l of leavesOf(record.raw)) {
    if (isIdKey(l.key)) continue;
    if (typeof l.value === 'number') {
      if (Math.abs(l.value - t) <= 60_000 || Math.abs(l.value - t / 1000) <= 60) return true;
    } else if (typeof l.value === 'string') {
      const s = l.value;
      if (/\d{4}-\d{2}-\d{2}T/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s.trim())) {
        const p = Date.parse(s);
        if (Number.isFinite(p) && Math.abs(p - t) <= 60_000) return true;
      }
      if (s.includes(localDate) && s.includes(localTime)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------
// Rejection with a note
// ---------------------------------------------------------------------------------------------------

/**
 * Rejects a request with a note, RAW: reads a fresh effect token (GET …/effect?action=reject), then
 * POST /api/admin/requests/:id/reject {token, note}; returns the act's answer unjudged.
 */
export async function rejectWithNote(admin: Actor, requestId: AccountId, note: string): Promise<APIResponse> {
  const effect = await readEffect(admin, 'reject', requestId);
  return actWithToken(admin, 'reject', requestId, effect.token, { note });
}

/** Rejects a request with a note as setup: the act must answer 2xx. */
export async function rejectWithNoteOk(admin: Actor, requestId: AccountId, note: string): Promise<void> {
  await requireOk(await rejectWithNote(admin, requestId, note), `POST /api/admin/requests/${requestId}/reject {note}`);
}

// ---------------------------------------------------------------------------------------------------
// The clock and sending at an instant
// ---------------------------------------------------------------------------------------------------

/** A fresh install at a set clock, with its admin signed in through the actor door. */
export interface World {
  install: Install;
  admin: Actor;
  close(): Promise<void>;
}

/**
 * Resets the product with the team clock at `now` (harness resetProduct, DEFAULT_TIME_ZONE) and signs the admin in.
 * `teamToday`, when given, is the team-zone date the test's data was chosen for; a clock that does not give it is a
 * SETUP failure, never a row's.
 */
export async function freshInstall(now: string, teamToday?: string): Promise<World> {
  const install = await resetProduct({ now });
  if (teamToday !== undefined && teamDate(now, install.timeZone) !== teamToday) {
    throw new SetupError(`the clock ${now} is not ${teamToday} in the team zone ${install.timeZone}`);
  }
  const admin = await signIn(install.admin);
  return { install, admin, close: () => admin.dispose() };
}

/** The ISO instant `m` minutes after `iso` (second precision, "Z"). */
export function minutesAfter(iso: string, m: number): string {
  return new Date(Date.parse(iso) + m * 60_000).toISOString().replace('.000Z', 'Z');
}

/** Sets the team clock to `instant` (harness setClock), then sends the request on the actor's own session (harness sendRequest). */
export async function sendAt(actor: Actor, spec: RequestSpec, instant: string): Promise<AccountId> {
  await setClock(instant);
  return sendRequest(actor, spec);
}

// ---------------------------------------------------------------------------------------------------
// Calendar days, computed by the test itself (never by the product)
// ---------------------------------------------------------------------------------------------------

/** The YYYY-MM-DD `n` calendar days after `ymd`. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** The Monday-to-Friday days from `first` to `last`, both included (REQ-001's counted days). */
export function countWeekdays(first: string, last: string): number {
  let n = 0;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const w = weekdayOf(d);
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

/** Every calendar day from `first` to `last`, both included. */
export function countCalendarDays(first: string, last: string): number {
  return Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1;
}

function parts(isoInstant: string, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(isoInstant))) out[p.type] = p.value;
  return out;
}

/** The instant's date in the team time zone, YYYY-MM-DD. */
export function teamDate(isoInstant: string, timeZone: string): string {
  const p = parts(isoInstant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The instant's time of day in the team time zone, HH:MM. */
export function teamTime(isoInstant: string, timeZone: string): string {
  const p = parts(isoInstant, timeZone);
  return `${p.hour}:${p.minute}`;
}
