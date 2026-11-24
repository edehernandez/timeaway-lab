// Purpose: shared fixture code for the balance, day-counting, race and visibility rows (ROW-153 to ROW-180): an independent weekday oracle, team-clock instants, the simultaneous-send helper, and the readings of the response shapes D-029 leaves open.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); reads the product only through harness.ts's actors (HTTP at VID_PRODUCT_URL); never application source.
//
// Why this file exists: several rows need the same oracle and the same readings, and setup two rows share
// belongs in shared fixture code, never in another row's test file (v0.9.8.1 R36).
//
// The oracle is independent of the product and of the JavaScript Date weekday methods: a calendar date is turned
// into a day number by Date.UTC arithmetic only, and the weekday is that number modulo 7 from the anchor
// 1970-01-01 (a Thursday). checkWeekdayAnchors() proves it against known dates before any row uses it.
//
// Readings (D-029 names the routes but elides some response fields). Each reading is stated here once, and a
// response that lacks the field a reading needs throws a SetupError naming the reading, so a contract mismatch is
// reported as a contract question, never as the row's verdict:
//   - a request record is an object with an `id` and `firstDay`/`lastDay` (the names POST /api/requests takes),
//     its kind in `kind` ('vacation' | 'sick', D-029), its state in `state` (D-031's state field) or `status`;
//   - a request record's counted days are its one numeric field whose name says count (count, countedDays,
//     dayCount…) or is exactly `days`/`weekdays`; its days in effect the numeric field whose name says effect;
//     its cancelled days the numeric field whose name says cancel;
//   - a pending-page record's forecast (REQ-022, the days left the approval would leave) is the numeric field
//     whose name says forecast, would-leave or after; its days left the numeric field whose name says left and
//     is not the forecast.
// Lists may be a bare array or an object holding one; records are found anywhere in the answer by their id.
import { expect, type APIRequestContext } from '@playwright/test';
import { SetupError, type AccountId, type Balance } from './harness';

// ---------------------------------------------------------------------------------------------------
// The weekday oracle
// ---------------------------------------------------------------------------------------------------

/** Days since 1970-01-01 for a YYYY-MM-DD calendar date (pure arithmetic over Date.UTC; no time zone involved). */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not a calendar date: ${iso}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** The YYYY-MM-DD calendar date of a day number. */
export function isoOf(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** The calendar date k days after `iso` (k may be negative). */
export function addDays(iso: string, k: number): string {
  return isoOf(dayNumber(iso) + k);
}

/** 0 = Monday … 6 = Sunday, from the anchor 1970-01-01, a Thursday (3). */
export function weekdayOf(iso: string): number {
  return (((dayNumber(iso) + 3) % 7) + 7) % 7;
}

export function isWeekday(iso: string): boolean {
  return weekdayOf(iso) < 5;
}

/** Every Monday-to-Friday date from first to last inclusive (empty when last is before first). */
export function weekdaysIn(first: string, last: string): string[] {
  const out: string[] = [];
  for (let n = dayNumber(first); n <= dayNumber(last); n += 1) {
    const d = isoOf(n);
    if (isWeekday(d)) out.push(d);
  }
  return out;
}

export function countWeekdays(first: string, last: string): number {
  return weekdaysIn(first, last).length;
}

export function yearOfDate(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** The months (year, month 1-12) a range touches. */
export function monthsOf(first: string, last: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = yearOfDate(first);
  let m = Number(first.slice(5, 7));
  const ly = yearOfDate(last);
  const lm = Number(last.slice(5, 7));
  while (y < ly || (y === ly && m <= lm)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Proves the oracle against dates known independently (printed calendars), so no row rests on an unproved oracle. */
export function checkWeekdayAnchors(): void {
  const anchors: [string, number][] = [
    ['1970-01-01', 3], // Thursday
    ['2000-01-01', 5], // Saturday
    ['2027-01-01', 4], // Friday
    ['2027-03-01', 0], // Monday
    ['2027-12-25', 5], // Saturday
    ['2027-12-31', 4], // Friday
    ['2028-01-01', 5], // Saturday
    ['2028-02-29', 1], // Tuesday (leap day)
  ];
  for (const [d, w] of anchors) {
    if (weekdayOf(d) !== w) throw new Error(`the weekday oracle is wrong at ${d}: ${weekdayOf(d)} instead of ${w}`);
  }
}

// ---------------------------------------------------------------------------------------------------
// Team-clock instants
// ---------------------------------------------------------------------------------------------------

/**
 * An instant on the team date `teamDate` for Pacific/Auckland (the harness's DEFAULT_TIME_ZONE): 21:00 UTC of the
 * day before, which is 09:00 (NZST, +12) or 10:00 (NZDT, +13) on `teamDate`, while the UTC date is still the day
 * before — the "two dates differ" instant BASELINE.md asks for.
 */
export function aucklandMorning(teamDate: string): string {
  return `${addDays(teamDate, -1)}T21:00:00Z`;
}

/** An instant at local hour `hour` on `teamDate` in a zone of fixed offset `utcOffsetHours` (a zone without daylight saving). */
export function instantAt(teamDate: string, hour: number, utcOffsetHours: number): string {
  const ms = dayNumber(teamDate) * 86_400_000 + (hour - utcOffsetHours) * 3_600_000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

// ---------------------------------------------------------------------------------------------------
// Simultaneous actions
// ---------------------------------------------------------------------------------------------------

/** Starts every action in the same tick, before any of them is awaited, and waits for all of them (no sleeps). */
export async function together<T>(actions: (() => Promise<T>)[]): Promise<T[]> {
  const started = actions.map((a) => a());
  return Promise.all(started);
}

// ---------------------------------------------------------------------------------------------------
// Reading answers
// ---------------------------------------------------------------------------------------------------

/** GETs `path` on `api` and returns its JSON; the status must be 200 (an expectation naming `row`, not setup). */
export async function getJson(api: APIRequestContext, path: string, row: string): Promise<unknown> {
  const res = await api.get(path);
  const text = await res.text();
  expect(res.status(), `${row}: GET ${path} answers 200 (body: ${text.slice(0, 200)})`).toBe(200);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SetupError(`GET ${path} answered 200 without a JSON body: ${text.slice(0, 200)}`);
  }
}

/** Every object anywhere inside `json` (depth first), arrays walked through. */
export function objectsIn(json: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v !== null && typeof v === 'object') {
      out.push(v as Record<string, unknown>);
      for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    }
  };
  walk(json);
  return out;
}

/** Every key used by any object inside `json`. */
export function keysIn(json: unknown): Set<string> {
  const keys = new Set<string>();
  for (const o of objectsIn(json)) for (const k of Object.keys(o)) keys.add(k);
  return keys;
}

/** Every primitive value anywhere inside `json`. */
export function valuesIn(json: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v !== null && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    else out.push(v);
  };
  walk(json);
  return out;
}

export function sameId(a: unknown, b: AccountId): boolean {
  return a !== undefined && a !== null && String(a) === String(b);
}

/** Request records: objects carrying an id and firstDay and lastDay (the reading stated at the head of this file). */
export function requestRecords(json: unknown): Record<string, unknown>[] {
  return objectsIn(json).filter((o) => 'id' in o && typeof o.firstDay === 'string' && typeof o.lastDay === 'string');
}

/** The one request record with this id, or undefined. */
export function recordById(json: unknown, id: AccountId): Record<string, unknown> | undefined {
  return requestRecords(json).find((o) => sameId(o.id, id));
}

export function stateOf(rec: Record<string, unknown>): string | undefined {
  const s = rec.state ?? rec.status;
  return typeof s === 'string' ? s.toLowerCase() : undefined;
}

export function kindOf(rec: Record<string, unknown>): string | undefined {
  return typeof rec.kind === 'string' ? rec.kind.toLowerCase() : undefined;
}

function numericFields(rec: Record<string, unknown>, include: RegExp, exclude?: RegExp): { key: string; value: number }[] {
  return Object.entries(rec)
    .filter(([k, v]) => typeof v === 'number' && include.test(k) && !(exclude && exclude.test(k)))
    .map(([key, value]) => ({ key, value: value as number }));
}

function oneNumber(rec: Record<string, unknown>, reading: string, include: RegExp, exclude?: RegExp): number {
  const found = numericFields(rec, include, exclude);
  if (found.length === 0) {
    throw new SetupError(`reading "${reading}": no numeric field named like ${include} in ${JSON.stringify(rec).slice(0, 300)}`);
  }
  return found[0].value;
}

/** True when the record carries a field the reading of `inEffectDays` would use. */
export function hasInEffectField(rec: Record<string, unknown>): boolean {
  return numericFields(rec, /effect/i).length > 0;
}

/** A request record's counted days (all Monday-to-Friday days of its range). */
export function countedDays(rec: Record<string, unknown>): number {
  const byCount = numericFields(rec, /count/i, /cancel|effect|left|pending/i);
  if (byCount.length > 0) return byCount[0].value;
  return oneNumber(rec, 'counted days', /^(days|weekdays|dayCount|numberOfDays)$/i);
}

/** A request record's days in effect; a record with no such field has all its counted days in effect. */
export function inEffectDays(rec: Record<string, unknown>): number {
  if (hasInEffectField(rec)) return oneNumber(rec, 'days in effect', /effect/i);
  return countedDays(rec);
}

/** A partly cancelled request record's cancelled days. */
export function cancelledDays(rec: Record<string, unknown>): number {
  return oneNumber(rec, 'cancelled days', /cancel/i, /at$|by$|on$|day$|date$/i);
}

/** A pending-page record's forecast: the days left the approval would leave (REQ-022). */
export function forecastOf(rec: Record<string, unknown>): number {
  return oneNumber(rec, 'forecast', /forecast|would|after/i);
}

/** A pending-page record's days left in the request's year (REQ-008). */
export function pendingPageDaysLeft(rec: Record<string, unknown>): number {
  return oneNumber(rec, 'days left on the pending page', /left/i, /forecast|would|after/i);
}

/** The {daysLeft, pending} of one year in a GET /api/balance answer, or undefined when the year is absent. */
export function balanceYear(b: Balance, year: number): { daysLeft: number; pending: number } | undefined {
  const y = b?.years?.find((x) => Number(x.year) === year);
  return y ? { daysLeft: y.daysLeft, pending: y.pending } : undefined;
}

/** GET /api/calendar?year&month (D-029: {days:[{date,people:[{name,accountId}]}]}), status 200 required. */
export async function readCalendar(api: APIRequestContext, year: number, month: number, row: string): Promise<CalendarAnswer> {
  return (await getJson(api, `/api/calendar?year=${year}&month=${month}`, row)) as CalendarAnswer;
}

export interface CalendarAnswer {
  days?: { date: string; people?: { name?: string; accountId?: AccountId }[] }[];
  [k: string]: unknown;
}

/** The dates of a calendar answer on which the person (by account id when the entry carries one, else by name) is listed. */
export function datesListing(cal: CalendarAnswer, person: { id: AccountId; name: string }): string[] {
  const out: string[] = [];
  for (const d of cal?.days ?? []) {
    const hit = (d.people ?? []).some((p) =>
      p.accountId !== undefined && p.accountId !== null ? sameId(p.accountId, person.id) : p.name === person.name,
    );
    if (hit) out.push(d.date);
  }
  return out;
}

/** The dates a person is listed on across every month a set of ranges touches (plus the months given). */
export async function datesListedAcross(
  api: APIRequestContext,
  months: { year: number; month: number }[],
  person: { id: AccountId; name: string },
  row: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { year, month } of months) {
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...datesListing(await readCalendar(api, year, month, row), person));
  }
  return out.sort();
}

/** Counts the non-overlapping occurrences of `needle` in `hay`, case-insensitively. */
export function occurrences(hay: string, needle: string): number {
  if (needle === '') return 0;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) count += 1;
  return count;
}

/** A tiny seeded generator (mulberry32), so a generated case is reproduced from the seed its failure prints. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for this run (printed by every failure that uses it). */
export function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
