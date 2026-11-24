// Purpose: shared readers, raw doors and the browser confirmation helper for the account-administration and confirmation rows (REQ-024 to REQ-028, INV-003's request isolation) — team-zone time, sign-in attempts, raw admin acts, the change history read by value, day mentions in plain text, and the confirmation step a page opens.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7), from DECISIONS.md D-029 (the routes), D-007 (days are YYYY-MM-DD in the team time zone) and D-014/D-015 (password and name limits); a public harness boundary beside harness.ts, imported by ledger tests only.
//
// Readings this module makes where D-029 names a route but not its body. Each is stated once, here, so a product
// that answers another shape fails visibly with the reading named, never silently:
//   - GET /api/admin/people/:id/history answers JSON: an array of change records, or an object holding them in
//     `history`, `changes`, `items` or `entries`, or in its one property whose value is an array of objects.
//     A record's facts are read BY VALUE, never by field name: a name is a string leaf carrying it as a whole word
//     run; an allowance value or a year is a number leaf (or an integer string) under a key that is not an id;
//     who is a string leaf carrying the admin's display name; when is a leaf that is that instant (an ISO 8601
//     string or epoch ms or s, within a minute) or a string carrying the instant's team-zone date and HH:MM.
//   - A confirmation's text (the effect's `summary`, or what a page's confirmation shows) names a day when it
//     carries it as YYYY-MM-DD, as "<day> <month>" or "<month> <day>" (month by name, full or short, ordinals
//     allowed), as the start or end of such a range ("8–12 Mar", "Mar 8–12"), or as d/m or m/d numerals.
//   - A page's confirmation step is either the browser's own dialog (window.confirm) or an element with the
//     dialog or alertdialog role that becomes visible after the action's control is operated; its confirming
//     control is a button inside it named "Confirm", "Yes", "OK" or by the action's own verb.
import { expect, type APIRequestContext, type Dialog, type Locator, type Page } from '@playwright/test';
import { anonymousApi, productUrl, type AccountId, type Actor, type Credentials, type Me } from './harness';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------------------------------------------------------------------------------------------------
// Team-zone time (computed by the test itself, never by the product, never from the machine's clock)
// ---------------------------------------------------------------------------------------------------

function wallClock(instantMs: number, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** The UTC instant (ISO 8601, Z) at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) at `time` (HH:MM). */
export function teamInstant(timeZone: string, date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, mi, 0);
  let guess = wanted;
  for (let i = 0; i < 3; i += 1) {
    const w = wallClock(guess, timeZone);
    const shown = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString().replace('.000Z', 'Z');
}

/** The team-zone calendar date (YYYY-MM-DD) of an instant. */
export function teamDateOf(instant: string, timeZone: string): string {
  const w = wallClock(Date.parse(instant), timeZone);
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** The team-zone wall time (HH:MM) of an instant. */
export function teamTimeOf(instant: string, timeZone: string): string {
  const w = wallClock(Date.parse(instant), timeZone);
  return `${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
}

/** The UTC calendar date (YYYY-MM-DD) of an instant: what a product reading the container's date would call today. */
export function utcDateOf(instant: string): string {
  return new Date(Date.parse(instant)).toISOString().slice(0, 10);
}

/** `date` plus `n` calendar days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday-to-Friday dates from `first` to `last`, inclusive. */
export function weekdaysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const w = dayOfWeek(d);
    if (w !== 0 && w !== 6) out.push(d);
  }
  return out;
}

/** A whole number in [lo, hi], fresh per run, never one of `avoid`. */
export function freshInt(lo: number, hi: number, avoid: number[] = []): number {
  for (let i = 0; i < 1000; i += 1) {
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (!avoid.includes(n)) return n;
  }
  throw new Error(`freshInt: no value in [${lo}, ${hi}] outside ${avoid.join(',')}`);
}

/** One of `xs`, chosen per run. */
export function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

// ---------------------------------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------------------------------

export function is2xx(status: number): boolean {
  return status >= 200 && status < 300;
}

/** A refusal the product gave on purpose: a 4xx answer (a 5xx is a crash, a 2xx is an acceptance). */
export function isRefusal(status: number): boolean {
  return status >= 400 && status < 500;
}

/** A raw answer: its status and the start of its body as text. */
export interface Raw {
  status: number;
  text: string;
}

async function rawOf(res: { status(): number; text(): Promise<string> }): Promise<Raw> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  return { status: res.status(), text };
}

/** POST `route` with `data` on `api`, unjudged. */
export async function postRaw(api: APIRequestContext, route: string, data?: unknown): Promise<Raw> {
  return rawOf(await api.post(route, data === undefined ? {} : { data }));
}

/** GET `route` on `api`, unjudged. */
export async function getRaw(api: APIRequestContext, route: string): Promise<Raw> {
  return rawOf(await api.get(route));
}

/** Runs `fn` on a fresh cookie-less API context (the anonymous actor) and disposes it. */
export async function asAnonymous<T>(fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await anonymousApi();
  try {
    return await fn(api);
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// Sign-in attempts (judged by the session, not the status alone)
// ---------------------------------------------------------------------------------------------------

export interface Attempt {
  status: number;
  meStatus: number;
  me: Me | null;
}

/** One sign-in attempt on a fresh cookie jar: the sign-in's status and what GET /api/me then answers on that jar. */
export async function trySignIn(c: Credentials): Promise<Attempt> {
  return asAnonymous(async (api) => {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const meRes = await api.get('/api/me');
    const me = meRes.status() === 200 ? ((await meRes.json().catch(() => null)) as Me | null) : null;
    return { status: r.status(), meStatus: meRes.status(), me };
  });
}

/** True when the attempt made a session (sign-in 2xx and GET /api/me 200 with an id). */
export function signedIn(a: Attempt): boolean {
  return is2xx(a.status) && a.meStatus === 200 && a.me !== null && a.me.id !== undefined && a.me.id !== null;
}

// ---------------------------------------------------------------------------------------------------
// Raw admin acts on accounts (D-029), for tests that read the refusal
// ---------------------------------------------------------------------------------------------------

function seg(id: AccountId): string {
  return encodeURIComponent(String(id));
}

/** POST /api/admin/accounts {name,email,password,allowance}, unjudged. */
export async function createAccountRaw(
  api: APIRequestContext,
  body: { name: string; email: string; password: string; allowance: number },
): Promise<Raw> {
  return postRaw(api, '/api/admin/accounts', body);
}

/** POST /api/admin/accounts/:id/name {name}, unjudged. */
export async function renameRaw(api: APIRequestContext, id: AccountId, name: string): Promise<Raw> {
  return postRaw(api, `/api/admin/accounts/${seg(id)}/name`, { name });
}

/** POST /api/admin/accounts/:id/email {email}, unjudged. */
export async function changeEmailRaw(api: APIRequestContext, id: AccountId, email: string): Promise<Raw> {
  return postRaw(api, `/api/admin/accounts/${seg(id)}/email`, { email });
}

/** POST /api/admin/accounts/:id/switch {on:true}, unjudged (switching on is not a confirmed action, D-029). */
export async function switchOnRaw(api: APIRequestContext, id: AccountId): Promise<Raw> {
  return postRaw(api, `/api/admin/accounts/${seg(id)}/switch`, { on: true });
}

/** POST /api/me/password {current,next} on the actor's session, unjudged. */
export async function choosePasswordRaw(api: APIRequestContext, current: string, next: string): Promise<Raw> {
  return postRaw(api, '/api/me/password', { current, next });
}

// ---------------------------------------------------------------------------------------------------
// Balance (D-029's own shape)
// ---------------------------------------------------------------------------------------------------

/** GET /api/balance on the actor's session: the year's {daysLeft, pending}, or null when the route or the year is not there. */
export async function yearFigures(actor: Actor, year: number): Promise<{ daysLeft: number; pending: number } | null> {
  const res = await actor.api.get('/api/balance');
  if (res.status() !== 200) return null;
  const body = (await res.json().catch(() => null)) as { years?: { year: number; daysLeft: number; pending: number }[] } | null;
  const y = body?.years?.find((x) => Number(x.year) === year);
  return y ? { daysLeft: Number(y.daysLeft), pending: Number(y.pending) } : null;
}

// ---------------------------------------------------------------------------------------------------
// Records read by value
// ---------------------------------------------------------------------------------------------------

export type Rec = { [k: string]: Json };

function arrayOfObjects(v: Json): v is Json[] {
  return Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
}

/** The list a list route answered (see the reading at the head of this file), or null when it holds none. */
export function recordsOf(body: Json): Rec[] | null {
  if (arrayOfObjects(body)) return body as Rec[];
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    for (const k of ['history', 'changes', 'items', 'entries']) {
      const v = (body as Rec)[k];
      if (v !== undefined && arrayOfObjects(v)) return v as Rec[];
    }
    const arrays = Object.values(body).filter((v) => arrayOfObjects(v));
    if (arrays.length === 1) return arrays[0] as Rec[];
  }
  return null;
}

/** GET /api/admin/people/:id/history on `api`: the status, the records (null when the body holds no list), the body text. */
export async function readHistory(api: APIRequestContext, id: AccountId): Promise<{ status: number; records: Rec[] | null; text: string }> {
  const raw = await getRaw(api, `/api/admin/people/${seg(id)}/history`);
  let records: Rec[] | null = null;
  if (raw.status === 200) {
    try {
      records = recordsOf(JSON.parse(raw.text) as Json);
    } catch {
      records = null;
    }
  }
  return { status: raw.status, records, text: raw.text };
}

const ID_KEY = /(^id$|Id$|_id$|^ids?$|Ids$)/;

function leaves(v: Json, key: string, out: { key: string; value: Json }[]): void {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) v.forEach((x) => leaves(x, key, out));
    else for (const [k, x] of Object.entries(v)) leaves(x, k, out);
    return;
  }
  out.push({ key, value: v });
}

/** Every string leaf of the record. */
export function stringLeaves(r: Rec): string[] {
  const out: { key: string; value: Json }[] = [];
  leaves(r, '', out);
  return out.filter((l) => typeof l.value === 'string').map((l) => l.value as string);
}

/** Every number leaf (or integer string leaf) of the record under a key that is not an id. */
export function numberLeaves(r: Rec): number[] {
  const out: { key: string; value: Json }[] = [];
  leaves(r, '', out);
  const nums: number[] = [];
  for (const l of out) {
    if (ID_KEY.test(l.key)) continue;
    if (typeof l.value === 'number') nums.push(l.value);
    else if (typeof l.value === 'string' && /^\s*-?\d+\s*$/.test(l.value)) nums.push(Number(l.value));
  }
  return nums;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `text` carries `value` as a whole run (not inside a longer word or number). */
export function carries(text: string, value: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(value)}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

/** True when some string leaf of the record carries `value` as a whole run. */
export function recordCarriesString(r: Rec, value: string): boolean {
  return stringLeaves(r).some((s) => carries(s, value));
}

/** True when some number leaf of the record (not an id) equals `n`. */
export function recordCarriesNumber(r: Rec, n: number): boolean {
  return numberLeaves(r).includes(n);
}

/** True when a leaf of the record is `isoInstant` (ISO string or epoch ms/s within a minute) or a string carrying its team-zone date and HH:MM. */
export function recordCarriesInstant(r: Rec, isoInstant: string, timeZone: string): boolean {
  const want = Date.parse(isoInstant);
  const date = teamDateOf(isoInstant, timeZone);
  const hhmm = teamTimeOf(isoInstant, timeZone);
  const out: { key: string; value: Json }[] = [];
  leaves(r, '', out);
  for (const l of out) {
    if (typeof l.value === 'number') {
      if (Math.abs(l.value - want) <= 60_000 || Math.abs(l.value * 1000 - want) <= 60_000) return true;
    } else if (typeof l.value === 'string') {
      const t = Date.parse(l.value);
      if (/\d{4}-\d{2}-\d{2}T/.test(l.value) && !Number.isNaN(t) && Math.abs(t - want) <= 60_000) return true;
      if ((l.value.includes(date) || mentionsDay(l.value, date)) && l.value.includes(hhmm)) return true;
    }
  }
  return false;
}

/** True when the record carries `year` as a year on its own: a number leaf (not an id) equal to it, or a string leaf that is the year alone or "from|starting|starts|in <year>". A timestamp string does not count. */
export function recordCarriesYear(r: Rec, year: number): boolean {
  if (recordCarriesNumber(r, year)) return true;
  return stringLeaves(r).some(
    (s) => s.trim() === String(year) || new RegExp(`\\b(from|starting|starts|start|in|for)\\s+${year}\\b`, 'i').test(s),
  );
}

/** A short rendering of a record for failure messages. */
export function showRecord(r: Rec | undefined): string {
  return r === undefined ? '<none>' : JSON.stringify(r).slice(0, 400);
}

// ---------------------------------------------------------------------------------------------------
// Day mentions in plain text
// ---------------------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** True when `text` names the calendar day `ymd` in one of the forms stated at the head of this file. */
export function mentionsDay(text: string, ymd: string): boolean {
  if (text.includes(ymd)) return true;
  const [, m, d] = ymd.split('-').map(Number);
  const mon = `${MONTHS[m - 1]}[a-z]*\\.?`;
  const ord = '(?:st|nd|rd|th)?';
  const dash = '\\s*(?:–|—|-|to|until|till|through|thru)\\s*';
  const wd = '(?:[a-z]{3,9}\\.?,?\\s+)?';
  const day = `0?${d}`;
  const anyDay = '0?\\d{1,2}';
  const patterns = [
    `(?<!\\d)${day}${ord}\\.?\\s+(?:of\\s+)?${mon}(?![a-z])`,
    `(?<![a-z])${mon}\\s+${day}${ord}(?!\\d)`,
    `(?<!\\d)${day}${ord}${dash}${wd}${anyDay}${ord}\\.?\\s+(?:of\\s+)?${mon}(?![a-z])`,
    `(?<![a-z])${mon}\\s+${anyDay}${ord}${dash}${wd}${day}${ord}(?!\\d)`,
    `(?<![\\d/.])${day}[./]0?${m}(?:[./]\\d{2,4})?(?![\\d])`,
    `(?<![\\d/])0?${m}/${day}(?:/\\d{2,4})?(?![\\d])`,
  ];
  return patterns.some((p) => new RegExp(p, 'i').test(text));
}

// ---------------------------------------------------------------------------------------------------
// The browser: a page load that keeps every same-origin body it received, and the confirmation step
// ---------------------------------------------------------------------------------------------------

/** Loads `address` on `page`, waits (bounded) for the network to settle, and returns the status, the final path and every same-origin body received plus the final document. */
export async function loadCapturing(page: Page, address: string): Promise<{ status: number; path: string; bodies: string[] }> {
  const origin = new URL(productUrl()).origin;
  const pending: Promise<string>[] = [];
  const onResponse = (res: { url(): string; text(): Promise<string> }) => {
    if (new URL(res.url()).origin !== origin) return;
    pending.push(res.text().catch(() => ''));
  };
  page.on('response', onResponse);
  try {
    const response = await page.goto(address);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const bodies = await Promise.all(pending);
    bodies.push(await page.content());
    return { status: response?.status() ?? 0, path: new URL(page.url()).pathname, bodies };
  } finally {
    page.off('response', onResponse);
  }
}

/**
 * The control that starts an action on one person's item of a list page: inside the innermost list item, table
 * row, article, section, form or block that carries `ownerName` and none of `otherNames`, the first button or
 * link whose name matches `verb`.
 */
export function actionControl(page: Page, ownerName: string, otherNames: string[], verb: RegExp): Locator {
  const control = page.getByRole('button', { name: verb }).or(page.getByRole('link', { name: verb }));
  let item = page.locator('li, tr, article, section, form, fieldset, div').filter({ hasText: ownerName });
  for (const o of otherNames) item = item.filter({ hasNotText: o });
  item = item.filter({ has: control });
  return item.last().getByRole('button', { name: verb }).or(item.last().getByRole('link', { name: verb })).first();
}

/** An open confirmation step: what it shows, and how to confirm it. */
export interface Confirmation {
  kind: 'native' | 'element';
  text: string;
  /** Operates the confirming control (accepts the native dialog, or presses the confirming button). */
  confirm(): Promise<void>;
}

const DECLINE_NAME = /^\s*(no|back|go back|close|keep\b.*|don.?t\b.*|not now|dismiss|abort|×|x)\s*$/i;

/**
 * Operates `trigger` and waits (bounded, no sleep) for the confirmation step it opens: the browser's own dialog or a
 * visible element with the dialog or alertdialog role. Fails the test, naming `what`, when the trigger is not there
 * or no confirmation appears. `verb` names the action's own word, used to find the confirming button.
 */
export async function openConfirmation(page: Page, trigger: Locator, verb: RegExp, what: string, timeoutMs = 10_000): Promise<Confirmation> {
  await expect(trigger, `${what}: the action's control is on the page`).toBeVisible({ timeout: timeoutMs });

  const element = page.getByRole('dialog').or(page.getByRole('alertdialog')).first();
  let nativeDialog: Dialog | null = null;
  const nativeP = page
    .waitForEvent('dialog', { timeout: timeoutMs })
    .then((d) => {
      nativeDialog = d;
      return 'native' as const;
    })
    .catch(() => null);
  const elementP = element
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => 'element' as const)
    .catch(() => null);
  const clickP = trigger.click({ timeout: timeoutMs }).then(
    () => null,
    (e: Error) => e,
  );

  const kind = await new Promise<'native' | 'element' | null>((resolve) => {
    let left = 2;
    for (const p of [nativeP, elementP]) {
      void p.then((v) => {
        if (v) resolve(v);
        else if (--left === 0) resolve(null);
      });
    }
  });
  expect(kind, `${what}: operating the action's control opens a confirmation step (a dialog), not the action itself`).not.toBeNull();

  if (kind === 'native') {
    const d = nativeDialog as unknown as Dialog;
    return {
      kind,
      text: d.message(),
      confirm: async () => {
        await d.accept();
        await clickP;
      },
    };
  }

  await clickP;
  const text = await element.innerText();
  return {
    kind: 'element',
    text,
    confirm: async () => {
      const buttons = element.getByRole('button');
      const n = await buttons.count();
      const named: { i: number; name: string }[] = [];
      for (let i = 0; i < n; i += 1) {
        const b = buttons.nth(i);
        const name = ((await b.getAttribute('aria-label')) ?? (await b.innerText())).trim();
        named.push({ i, name });
      }
      const usable = named.filter((b) => !DECLINE_NAME.test(b.name));
      const choice =
        usable.find((b) => /\b(confirm|yes|ok)\b/i.test(b.name)) ??
        usable.find((b) => verb.test(b.name) && !/^\s*cancel\s*$/i.test(b.name)) ??
        (named.some((b) => DECLINE_NAME.test(b.name)) ? usable.find((b) => verb.test(b.name)) : undefined);
      expect(
        choice,
        `${what}: the confirmation offers a confirming button (buttons: ${named.map((b) => JSON.stringify(b.name)).join(', ') || 'none'})`,
      ).toBeDefined();
      await buttons.nth((choice as { i: number }).i).click({ timeout: timeoutMs });
    },
  };
}
