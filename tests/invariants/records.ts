// Purpose: shared readers for the record ledger tests (REQ-017 to REQ-023) — an independent team-clock oracle, the observation reads of the D-029 routes harness.ts has no reader for, and the stated reading of a record whose field names D-029 leaves open.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6), from DECISIONS.md D-029 (the routes), D-007 (days are YYYY-MM-DD in the team time zone), D-020 (what a cancel records) and D-027 (the calendar's entries); a public harness boundary beside harness.ts, imported by ledger tests only. It asserts nothing about any row.
//
// Why this module reads records by value. D-029 names the read routes (GET /api/requests, GET /api/admin/pending,
// GET /api/admin/people, GET /api/admin/people/:id/requests, GET /api/admin/people/:id/history) but not the field
// names inside their answers. So this module states ONE reading, used by every test that imports it:
//   - A list answer is any JSON; its RECORDS are the objects that are elements of an array anywhere in it.
//   - A request's record is the record whose `id` equals the id POST /api/requests answered (compared as text).
//     An account's record on the people answer is the record holding the account's email as a value.
//   - A fact is read BY VALUE inside the one record (the value the test made, e.g. a fresh name, a YYYY-MM-DD day,
//     an unusual number), never by position in the list and never "somewhere in the answer".
//   - Where two facts of the same kind live on one record (who decided it vs who cancelled it; when it was sent vs
//     when it was decided), the fact is read among the record's facts ABOUT that act: the leaves whose key path names
//     it (decidedBy, approvedAt, cancellation.by, sentAt, createdAt …, matched by the patterns below), or the leaves
//     of a nested entry that names the act as a value ({action:'approved', by, at} inside an events list).
//   - Who: the actor's display name, email or account id. When: the instant the team clock was set to (harness
//     setClock / resetProduct now), as an ISO 8601 instant, an epoch number, a zone-less wall time read either as
//     the team zone's or as UTC, or the team zone's calendar date (YYYY-MM-DD) — within two minutes for times.
// Every test that uses these readers makes each act on its own team date, so a date-only reading still tells the
// acts apart, and sets the clock where the team date and the UTC date differ, so a product that reads the machine's
// clock or the UTC date cannot satisfy it.
//
// Observation reads (observe*) throw a plain Error naming the route and the status when the route does not answer
// 2xx: the read is the row's observation, so its failure is the row's failure, never SETUP.
import type { APIRequestContext, Page } from '@playwright/test';
import { DEFAULT_TIME_ZONE, type AccountId, type Actor } from './harness';

// ---------------------------------------------------------------------------------------------------
// The team clock oracle (independent of the product: Intl only)
// ---------------------------------------------------------------------------------------------------

function wallParts(epochMs: number, tz: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(epochMs))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, ss: p.second };
}

function offsetMs(epochMs: number, tz: string): number {
  const w = wallParts(epochMs, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(epochMs / 1000) * 1000;
}

/** The ISO 8601 UTC instant of wall time `time` (HH:MM) on team date `date` (YYYY-MM-DD) in zone `tz`. */
export function teamInstant(date: string, time = '09:00', tz = DEFAULT_TIME_ZONE): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(t, tz);
  if (second !== t) t = second;
  return new Date(t).toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The team zone's calendar date (YYYY-MM-DD) at an ISO instant. */
export function teamDate(instant: string, tz = DEFAULT_TIME_ZONE): string {
  const w = wallParts(Date.parse(instant), tz);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** The UTC calendar date (YYYY-MM-DD) at an ISO instant — the date a zone-blind product would use. */
export function utcDate(instant: string): string {
  return instant.slice(0, 10);
}

/** Day of week of a YYYY-MM-DD date: 0 Sunday … 6 Saturday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday to Friday days from `first` to `last` inclusive, as YYYY-MM-DD. */
export function weekdaysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  const [y, m, d] = first.split('-').map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (day > last) break;
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) out.push(day);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Observation reads
// ---------------------------------------------------------------------------------------------------

/** GET `route` on `api`; throws a plain Error (not SETUP) when it does not answer 2xx with JSON. */
export async function observe(api: APIRequestContext, route: string): Promise<unknown> {
  const res = await api.get(route);
  const text = await res.text().catch(() => '');
  if (!res.ok()) throw new Error(`OBSERVE: GET ${route} answered ${res.status()}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`OBSERVE: GET ${route} answered ${res.status()} without JSON: ${text.slice(0, 300)}`);
  }
}

function seg(id: AccountId): string {
  return encodeURIComponent(String(id));
}

/** The person's own requests: GET /api/requests on their session. */
export function observeOwnRequests(actor: Actor): Promise<unknown> {
  return observe(actor.api, '/api/requests');
}

/** The admin's view of one person's requests: GET /api/admin/people/:id/requests. */
export function observePersonRequests(admin: Actor, accountId: AccountId): Promise<unknown> {
  return observe(admin.api, `/api/admin/people/${seg(accountId)}/requests`);
}

/** The admin's pending list: GET /api/admin/pending. */
export function observePending(admin: Actor): Promise<unknown> {
  return observe(admin.api, '/api/admin/pending');
}

/** The admin's people list: GET /api/admin/people. */
export function observePeople(admin: Actor): Promise<unknown> {
  return observe(admin.api, '/api/admin/people');
}

/** The admin's view of one person's change history: GET /api/admin/people/:id/history. */
export function observeHistory(admin: Actor, accountId: AccountId): Promise<unknown> {
  return observe(admin.api, `/api/admin/people/${seg(accountId)}/history`);
}

/** The month calendar: GET /api/calendar?year&month on the actor's session (D-029: {days:[{date,people:[{name,accountId}]}]}). */
export function observeCalendar(actor: Actor, year: number, month: number): Promise<unknown> {
  return observe(actor.api, `/api/calendar?year=${year}&month=${month}`);
}

/** The names the calendar answer lists as away on `date`. */
export function awayOn(calendar: unknown, date: string): string[] {
  const days = (calendar as { days?: unknown })?.days;
  if (!Array.isArray(days)) return [];
  const names: string[] = [];
  for (const day of days) {
    if (day && typeof day === 'object' && (day as { date?: unknown }).date === date) {
      const people = (day as { people?: unknown }).people;
      if (Array.isArray(people)) for (const p of people) if (p && typeof p.name === 'string') names.push(p.name);
    }
  }
  return names;
}

/** The member's days left for `year` from GET /api/balance's answer (undefined when the year is not there). */
export function daysLeftIn(balance: { years: { year: number; daysLeft: number }[] }, year: number): number | undefined {
  return balance?.years?.find((y) => Number(y.year) === year)?.daysLeft;
}

// ---------------------------------------------------------------------------------------------------
// Records and leaves
// ---------------------------------------------------------------------------------------------------

export type Json = unknown;
export type Rec = Record<string, unknown>;

function isObj(v: unknown): v is Rec {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Every object that is an element of an array anywhere in `json`, outermost first (breadth first). */
export function records(json: Json): Rec[] {
  const out: Rec[] = [];
  const queue: unknown[] = [json];
  while (queue.length) {
    const v = queue.shift();
    if (Array.isArray(v)) {
      for (const el of v) {
        if (isObj(el)) out.push(el);
        queue.push(el);
      }
    } else if (isObj(v)) {
      for (const k of Object.keys(v)) queue.push(v[k]);
    }
  }
  return out;
}

/**
 * The record whose `id` equals `id` (as text), or undefined. When several records carry that id (a nested entry whose
 * own id happens to be equal), the first one holding `prefer` as a value is taken, else the outermost.
 */
export function recordById(json: Json, id: AccountId, prefer?: string | number): Rec | undefined {
  const candidates = records(json).filter((r) => r.id !== undefined && r.id !== null && String(r.id) === String(id));
  if (prefer !== undefined) {
    const held = candidates.find((r) => holdsValue(r, prefer));
    if (held) return held;
  }
  return candidates[0];
}

/** The records of `json` that are not nested inside another record (the list's own entries). */
export function topRecords(json: Json): Rec[] {
  const all = records(json);
  const nested = new Set<Rec>();
  for (const r of all) for (const inner of records(r)) nested.add(inner);
  return all.filter((r) => !nested.has(r));
}

/** The ids (as text) of the outermost records carrying an `id`. */
export function topRecordIds(json: Json): string[] {
  return topRecords(json)
    .filter((r) => r.id !== undefined && r.id !== null)
    .map((r) => String(r.id));
}

/** The record holding `email` (compared case-insensitively, trimmed) as one of its own values, or undefined. */
export function recordByEmail(json: Json, email: string): Rec | undefined {
  const want = email.trim().toLowerCase();
  return records(json).find((r) => leaves(r).some((l) => typeof l.value === 'string' && l.value.trim().toLowerCase() === want));
}

export interface Leaf {
  path: string;
  value: unknown;
}

/** Every primitive leaf of `v` with its key path (keys joined by '.', array elements as [i]). */
export function leaves(v: unknown, path = ''): Leaf[] {
  if (Array.isArray(v)) return v.flatMap((el, i) => leaves(el, `${path}[${i}]`));
  if (isObj(v)) return Object.keys(v).flatMap((k) => leaves(v[k], path ? `${path}.${k}` : k));
  return [{ path, value: v }];
}

/** True when some leaf of `record` equals `value` (strings exactly; numbers as numbers or as their decimal text). */
export function holdsValue(record: unknown, value: string | number | boolean): boolean {
  return leaves(record).some((l) => l.value === value || (typeof value === 'number' && typeof l.value === 'string' && l.value.trim() === String(value)));
}

/** True when some string leaf of `json` contains `needle`, case-insensitively. */
export function mentions(json: unknown, needle: string): boolean {
  const n = needle.toLowerCase();
  return leaves(json).some((l) => typeof l.value === 'string' && l.value.toLowerCase().includes(n));
}

/** The request's state as the record carries it (its `state`, else its `status`), lower-cased; undefined when absent. */
export function stateOf(record: Rec | undefined): string | undefined {
  if (!record) return undefined;
  const v = record.state ?? record.status;
  return typeof v === 'string' ? v.trim().toLowerCase() : undefined;
}

/** The four states REQ-017 names; 'canceled' is read as the same word as 'cancelled'. */
export const FOUR_STATES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export function normalState(s: string | undefined): string | undefined {
  return s === 'canceled' ? 'cancelled' : s;
}

// The acts' key patterns (see the module header).
export const DECIDED = /decid|decis|approv|reject/i;
export const CANCELLED = /cancel/i;
export const SENT = /sent|creat|submit|requested/i;

/**
 * The leaves of `record` that are facts about the act `pattern` names: leaves whose key path matches it, and the
 * leaves of any nested object (never the record itself) that holds a string value matching it.
 */
export function factsAbout(record: Rec | undefined, pattern: RegExp): Leaf[] {
  if (!record) return [];
  const out: Leaf[] = leaves(record).filter((l) => pattern.test(l.path));
  const visit = (v: unknown, path: string, depth: number): void => {
    if (Array.isArray(v)) {
      v.forEach((el, i) => visit(el, `${path}[${i}]`, depth + 1));
      return;
    }
    if (!isObj(v)) return;
    if (depth > 0) {
      const own = Object.keys(v).filter((k) => !isObj(v[k]) && !Array.isArray(v[k]));
      if (own.some((k) => typeof v[k] === 'string' && pattern.test(v[k] as string))) {
        for (const l of leaves(v, path)) out.push(l);
      }
    }
    for (const k of Object.keys(v)) visit(v[k], path ? `${path}.${k}` : k, depth + 1);
  };
  visit(record, '', 0);
  return out;
}

/** Someone the record may name as having acted: their display name, email or account id. */
export interface Who {
  id: AccountId;
  name: string;
  email: string;
}

export function whoOf(x: { me?: { id: AccountId; name: string }; id?: AccountId; name?: string; email?: string; credentials?: { email: string } }): Who {
  if (x.me) return { id: x.me.id, name: x.me.name, email: x.credentials?.email ?? '' };
  return { id: x.id as AccountId, name: x.name as string, email: x.email ?? '' };
}

/** True when `value` names `who`: equal to their name, their email (case-insensitive) or their id (as text). */
export function isWho(value: unknown, who: Who): boolean {
  if (typeof value === 'number') return String(value) === String(who.id);
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v === who.name || (who.email !== '' && v.toLowerCase() === who.email.toLowerCase()) || v === String(who.id);
}

/** True when `value` reads as the instant `iso` (see the module header for the accepted forms). */
export function isInstant(value: unknown, iso: string, tz = DEFAULT_TIME_ZONE): boolean {
  const target = Date.parse(iso);
  const near = (t: number) => Number.isFinite(t) && Math.abs(t - target) <= 120_000;
  if (typeof value === 'number') {
    if (value > 1e11) return near(value);
    if (value > 1e8) return near(value * 1000);
    return false;
  }
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s === teamDate(iso, tz);
  const zoneless = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(s);
  if (zoneless) {
    const asUtc = Date.parse(`${zoneless[1]}T${zoneless[2]}Z`);
    const w = wallParts(target, tz);
    const teamWallAsUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
    return near(asUtc) || (Number.isFinite(asUtc) && Math.abs(asUtc - teamWallAsUtc) <= 120_000);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return near(Date.parse(s));
  return false;
}

function many(r: Rec | Rec[] | undefined): Rec[] {
  return r === undefined ? [] : Array.isArray(r) ? r : [r];
}

/** True when the facts about the act `pattern` of the record (or of any of its views) name `who`. */
export function actBy(record: Rec | Rec[] | undefined, pattern: RegExp, who: Who): boolean {
  return many(record).some((r) => factsAbout(r, pattern).some((l) => isWho(l.value, who)));
}

/** True when the facts about the act `pattern` of the record (or of any of its views) carry the instant `iso`. */
export function actAt(record: Rec | Rec[] | undefined, pattern: RegExp, iso: string, tz = DEFAULT_TIME_ZONE): boolean {
  return many(record).some((r) => factsAbout(r, pattern).some((l) => isInstant(l.value, iso, tz)));
}

/** True when the record (or any of its views) holds `value` as a leaf (see holdsValue). */
export function anyHolds(record: Rec | Rec[] | undefined, value: string | number | boolean): boolean {
  return many(record).some((r) => holdsValue(r, value));
}

/** A request's record as each view given carries it (the record with its id in each view that lists it). */
export function viewsOf(id: AccountId, ...views: Json[]): Rec[] {
  return views.map((v) => recordById(v, id)).filter((r): r is Rec => r !== undefined);
}

/** As viewsOf, preferring in each view the record with the id that holds `firstDay` (see recordById). */
export function requestViews(id: AccountId, firstDay: string, ...views: Json[]): Rec[] {
  return views.map((v) => recordById(v, id, firstDay)).filter((r): r is Rec => r !== undefined);
}

/** A compact rendering of a record for failure messages. */
export function show(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 700);
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------------------------------------------
// Pages (the engine door's pages, read for operation rows)
// ---------------------------------------------------------------------------------------------------

/** A control as the page exposes it: its tag, role, approximate accessible name, href and whether it is enabled. */
export interface ControlInfo {
  tag: string;
  role: string;
  name: string;
  href: string | null;
  enabled: boolean;
  type: string;
}

/**
 * The controls of the part of the page that is about one account: the largest element holding `text` (shown as
 * text or as an input's value) that holds none of `others` — the account's row, however the page draws rows.
 * `found` is false when the page does not hold `text` at all.
 */
export async function controlsAbout(page: Page, text: string, others: string[]): Promise<{ found: boolean; controls: ControlInfo[] }> {
  return page.evaluate(
    ({ text, others }) => {
      const lower = text.toLowerCase();
      const otherLower = others.map((o) => o.toLowerCase()).filter((o) => o !== lower);
      const textOf = (el: Element): string => {
        let t = (el.textContent || '').toLowerCase();
        el.querySelectorAll('input, textarea').forEach((i) => (t += ' ' + ((i as HTMLInputElement).value || '').toLowerCase()));
        if (el instanceof HTMLInputElement) t += ' ' + (el.value || '').toLowerCase();
        return t;
      };
      let host: Element | null = null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if ((n.textContent || '').toLowerCase().includes(lower)) {
          host = n.parentElement;
          break;
        }
      }
      if (!host) {
        for (const el of Array.from(document.querySelectorAll('input'))) {
          if (((el as HTMLInputElement).value || '').toLowerCase().includes(lower)) {
            host = el;
            break;
          }
        }
      }
      if (!host) return { found: false, controls: [] };
      let scope: Element = host;
      while (scope.parentElement && scope.parentElement !== document.body && scope.parentElement !== document.documentElement) {
        const t = textOf(scope.parentElement);
        if (otherLower.some((o) => t.includes(o))) break;
        scope = scope.parentElement;
      }
      const sel = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="checkbox"]';
      const nameOf = (el: Element): string => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const by = el.getAttribute('aria-labelledby');
        if (by) {
          const t = by
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || '')
            .join(' ')
            .trim();
          if (t) return t;
        }
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length) return Array.from(labels).map((l) => (l.textContent || '').trim()).join(' ');
        const own = (el.textContent || '').trim();
        if (own) return own;
        return (el.getAttribute('value') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
      };
      const visible = (el: Element): boolean => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const controls = Array.from(scope.querySelectorAll(sel))
        .concat(scope.matches(sel) ? [scope] : [])
        .filter(visible)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          name: nameOf(el),
          href: el.getAttribute('href'),
          enabled: !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
          type: (el as HTMLInputElement).type || '',
        }));
      return { found: true, controls };
    },
    { text, others },
  );
}

/**
 * The visible text of the part of the page that is about one person or account: the largest element holding `text`
 * that holds none of `others` (the same reading as controlsAbout). `found` is false when the page does not hold `text`.
 */
export async function textAbout(page: Page, text: string, others: string[]): Promise<{ found: boolean; text: string }> {
  return page.evaluate(
    ({ text, others }) => {
      const lower = text.toLowerCase();
      const otherLower = others.map((o) => o.toLowerCase()).filter((o) => o !== lower);
      let host: Element | null = null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if ((n.textContent || '').toLowerCase().includes(lower)) {
          host = n.parentElement;
          break;
        }
      }
      if (!host) return { found: false, text: '' };
      let scope: Element = host;
      while (scope.parentElement && scope.parentElement !== document.body && scope.parentElement !== document.documentElement) {
        const t = (scope.parentElement.textContent || '').toLowerCase();
        if (otherLower.some((o) => t.includes(o))) break;
        scope = scope.parentElement;
      }
      return { found: true, text: (scope as HTMLElement).innerText || scope.textContent || '' };
    },
    { text, others },
  );
}

/** True when `text` shows the number `n` standing alone (a minus sign may be '-' or '−'); never as part of a longer number. */
export function showsNumber(text: string, n: number): boolean {
  const body = String(Math.abs(n));
  const sign = n < 0 ? '[-−]\\s?' : '';
  const re = new RegExp(`(^|[^\\d.,${n < 0 ? '' : '\\-−'}])${sign}${body}(?![\\d])`);
  return re.test(text);
}

/**
 * The key path of the switched-on state on the people answer: the one leaf path an account switched on (`on`) and one
 * switched off (`off`) both carry with opposite values (true/false, or on/off-like words), on which the admin (switched
 * on) agrees with `on`. Undefined when no such field exists.
 */
export function onOffPath(on: Rec, off: Rec, admin: Rec | undefined): string | undefined {
  const ON = ['on', 'active', 'enabled', 'switched on', 'yes'];
  const OFF = ['off', 'inactive', 'disabled', 'switched off', 'no', 'deactivated'];
  const offLeaves = new Map(leaves(off).map((l) => [l.path, l.value]));
  const adminLeaves = new Map(admin ? leaves(admin).map((l) => [l.path, l.value]) : []);
  for (const l of leaves(on)) {
    const o = offLeaves.get(l.path);
    const pair =
      (typeof l.value === 'boolean' && typeof o === 'boolean' && l.value !== o) ||
      (typeof l.value === 'string' && typeof o === 'string' && ((ON.includes(l.value.toLowerCase()) && OFF.includes(o.toLowerCase())) || (OFF.includes(l.value.toLowerCase()) && ON.includes(o.toLowerCase()))));
    if (pair && /admin/i.test(l.path) === false && (!admin || adminLeaves.get(l.path) === l.value)) return l.path;
  }
  return undefined;
}
