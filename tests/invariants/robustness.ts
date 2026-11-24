// Purpose: shared setup and page readings for the robustness rows (ROW-205 to ROW-241) — a team on a fixed clock, the send form, the people page's create form, the own-requests page's cancel, the calendar grid, page text deltas, phone-width measures and another site played by the browser — all through harness.ts.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13), from DECISIONS.md D-029 (routes, pages, plain-word labels), D-007 (days YYYY-MM-DD in the team zone) and D-026 (the attempt bound); a public harness boundary beside harness.ts, imported by ledger tests only.
//
// This module asserts nothing about any row. It reaches the product only through harness.ts and over HTTP or the
// browser at VID_PRODUCT_URL, and reads no application code. A control or route it needs and does not find throws a
// SetupError naming the reading, so a mismatch reads as setup, never as a row failing.
//
// Readings of the pages where D-029 names the page but not its controls ("forms labelled in plain words"):
//   - The send form (/requests/new) is the form holding a field labelled "First day" (any case). In it: the kind is
//     chosen with radios named "Vacation" and "Sick", or with a select labelled "Kind" whose options are labelled
//     Vacation and Sick; the days are the fields labelled "First day" and "Last day" and take YYYY-MM-DD (D-007);
//     the button whose name starts with "Send" sends it.
//   - The people page's create form (/admin/people) is the form holding a field labelled "Allowance" and a field
//     labelled "Email"; in it "Name" (or "Display name"), "Email", every password field (D-014 types it twice) and
//     "Allowance"; the button whose name starts with "Create" or "Add" submits it. When the form is not shown, the
//     button or link whose name starts with "Add" / "Create" / "New" opens it.
//   - On the own requests page (/) a pending request the person may cancel carries a button whose name starts with
//     "Cancel"; a native confirm dialog is accepted, and a button named "Yes…" or "Confirm…" shown after it is pressed.
//   - The admin's pending page rejects with a button whose name starts with "Reject" in the request's row (the row is
//     the smallest list item, table row or article holding the person's display name), a text field labelled "Note"
//     (any case, "Rejection note" too), and a confirming button named "Confirm…" / "Yes…" / "Reject…".
//   - Signing out in the browser is a button or link named "Sign out" or "Log out".
//   - The calendar page marks each day cell with its date, as data-date="YYYY-MM-DD" on the cell or as a
//     <time datetime="YYYY-MM-DD"> inside it; weekday headings are elements whose whole text is a weekday name or its
//     common abbreviation (Mon, Monday, Mo, …); today's cell carries aria-current="date" (on it, inside it or around it)
//     or the word "Today"; month navigation is a button or link whose accessible name holds "Next" / "Previous".
//     The calendar address carries the month as /calendar?year=<YYYY>&month=<1..12>, as GET /api/calendar does.
//   - The header is the page's banner landmark (<header> outside main, or role="banner").
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  productUrl,
  resetProduct,
  SetupError,
  signIn,
  type AccountId,
  type Actor,
  type Install,
} from './harness';

// ---------------------------------------------------------------------------------------------------
// The clock and the team
// ---------------------------------------------------------------------------------------------------

/** The team zone these rows run in: far from the container's UTC (BASELINE "Test environment"). */
export const ZONE = 'Pacific/Auckland';
/** Mon 2027-03-08 09:00 in Pacific/Auckland; in UTC it is still Sunday 2027-03-07. */
export const T0 = '2027-03-07T20:00:00Z';
/** The team's today at T0. */
export const TODAY = '2027-03-08';

/** Disposables a test opened (API contexts, actors); disposeAll() closes them in afterEach. */
const opened: { dispose(): Promise<void> }[] = [];
export function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  opened.push(x);
  return x;
}
export async function disposeAll(): Promise<void> {
  for (const d of opened.splice(0)) await d.dispose().catch(() => undefined);
}

/** A fresh install at `now` in `timeZone`, with the admin signed in through the actor door (kept for disposeAll). */
export async function freshTeam(
  opts: { now?: string; timeZone?: string; adminAllowance?: number } = {},
): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({
    now: opts.now ?? T0,
    timeZone: opts.timeZone ?? ZONE,
    admin: opts.adminAllowance === undefined ? undefined : { allowance: opts.adminAllowance },
  });
  const admin = keep(await signIn(install.admin));
  return { install, admin };
}

/** A fresh whole number in [lo, hi]. */
export function freshInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// ---------------------------------------------------------------------------------------------------
// Calendar arithmetic (the tests' own oracle: plain UTC arithmetic on YYYY-MM-DD, never the product's)
// ---------------------------------------------------------------------------------------------------

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}
export function isWeekday(ymd: string): boolean {
  const w = dayOfWeek(ymd);
  return w >= 1 && w <= 5;
}
/** Every date of a month (month 1..12). */
export function datesOfMonth(year: number, month: number): string[] {
  const out: string[] = [];
  let d = `${year}-${String(month).padStart(2, '0')}-01`;
  while (Number(d.slice(5, 7)) === month) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
export function weekdaysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) if (isWeekday(d)) out.push(d);
  return out;
}
/** The instant (ISO, Z) at which the team zone's wall clock reads `date` `time` (HH:MM). */
export function teamInstant(timeZone: string, date: string, time: string): string {
  const guess = Date.parse(`${date}T${time}:00Z`);
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const t = guess - off * 60_000;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
    if (`${get('year')}-${get('month')}-${get('day')}` === date && `${get('hour')}:${get('minute')}` === time) {
      return new Date(t).toISOString().replace('.000Z', 'Z');
    }
  }
  throw new SetupError(`teamInstant: no instant reads ${date} ${time} in ${timeZone}`);
}
export function minutesAfter(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString().replace('.000Z', 'Z');
}

// ---------------------------------------------------------------------------------------------------
// HTTP readings
// ---------------------------------------------------------------------------------------------------

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** The first array of objects in a list answer: the answer itself, or its one property holding such an array. */
export function listOf(body: Json): { [k: string]: Json }[] {
  if (Array.isArray(body)) return body.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x)) as { [k: string]: Json }[];
  if (body && typeof body === 'object') {
    for (const key of ['requests', 'items', 'people', 'accounts', 'pending']) {
      const v = (body as { [k: string]: Json })[key];
      if (Array.isArray(v)) return listOf(v);
    }
    for (const v of Object.values(body)) if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) return listOf(v);
  }
  return [];
}

/** Every string leaf of a JSON value. */
export function stringLeaves(v: Json): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(stringLeaves);
  if (v && typeof v === 'object') return Object.values(v).flatMap(stringLeaves);
  return [];
}

async function json(res: APIResponse, what: string): Promise<Json> {
  if (!res.ok()) throw new SetupError(`${what} answered ${res.status()}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  try {
    return (await res.json()) as Json;
  } catch {
    throw new SetupError(`${what} answered without a JSON body`);
  }
}

/**
 * The person's own requests: GET /api/requests (D-029), read as a list of records each carrying `id`; the state is
 * the record's string leaf among pending|approved|rejected|cancelled (`canceled` read as cancelled).
 */
export async function ownRequests(actor: Actor): Promise<{ id: string; state: string | null; record: { [k: string]: Json } }[]> {
  const body = await json(await actor.api.get('/api/requests'), 'GET /api/requests');
  return listOf(body).map((r) => {
    const states = stringLeaves(r)
      .map((s) => s.toLowerCase())
      .map((s) => (s === 'canceled' ? 'cancelled' : s))
      .filter((s) => ['pending', 'approved', 'rejected', 'cancelled'].includes(s));
    return { id: String(r.id), state: states[0] ?? null, record: r };
  });
}

/** The pending days the actor's own balance shows for `year` (GET /api/balance). */
export async function pendingDays(actor: Actor, year: number): Promise<number | null> {
  const body = (await json(await actor.api.get('/api/balance'), 'GET /api/balance')) as { years?: { year: number; pending: number }[] };
  return body?.years?.find((y) => Number(y.year) === year)?.pending ?? null;
}

/** The admin's people list as text (GET /api/admin/people): enough to ask whether an email or a name is on it. */
export async function peopleText(admin: Actor): Promise<string> {
  const res = await admin.api.get('/api/admin/people');
  if (!res.ok()) throw new SetupError(`GET /api/admin/people answered ${res.status()}`);
  return res.text();
}

/** True when the status is a rule's refusal: a 4xx that is not 401, 404 or 405 (those say session or route). */
export function isRuleRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 404 && status !== 405;
}

/** Signs in on a fresh cookie jar and says whether a session resulted (GET /api/me 200 on the same jar). */
export async function trySignIn(
  api: APIRequestContext,
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; contentType: string; setsCookie: boolean; session: boolean }> {
  const r = await api.post('/api/auth/sign-in', { data: { email, password }, headers });
  const body = await r.text().catch(() => '');
  const me = await api.get('/api/me');
  return {
    status: r.status(),
    body,
    contentType: (r.headers()['content-type'] ?? '').split(';')[0].trim(),
    setsCookie: r.headersArray().some((h) => h.name.toLowerCase() === 'set-cookie'),
    session: me.status() === 200,
  };
}

// ---------------------------------------------------------------------------------------------------
// Page readings
// ---------------------------------------------------------------------------------------------------

/** Waits (bounded) until the page's network is quiet; never a fixed sleep. */
export async function settle(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
}

/** The page's visible text, as lines, trimmed, empty lines dropped. */
export async function textLines(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** The lines of `after` that `before` does not hold: the text an action made appear. */
export function newLines(before: string[], after: string[]): string[] {
  const seen = new Set(before);
  return after.filter((l) => !seen.has(l));
}

/** The words a success message is read by when the test has no learned success text (ROW-209's reading). */
export const SUCCESS_WORDS = /\b(sent|success|successful|successfully|saved|submitted|recorded)\b/i;

/** The banner landmark's text (the header). */
export async function bannerText(page: Page): Promise<string | null> {
  const banner = page.getByRole('banner');
  if ((await banner.count()) === 0) return null;
  return (await banner.first().innerText().catch(() => null)) ?? null;
}

/** The send form: the form holding a field labelled "First day". */
export async function sendForm(page: Page): Promise<Locator> {
  const form = page.locator('form').filter({ has: page.getByLabel(/first day/i) }).first();
  try {
    await form.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new SetupError('the send form (a form with a field labelled "First day") is not on /requests/new');
  }
  return form;
}

/** The kind controls of the send form: radios named Vacation/Sick, or a select labelled Kind. */
export function kindControls(form: Locator): { vacation: Locator; sick: Locator; select: Locator } {
  return {
    vacation: form.getByRole('radio', { name: /^vacation$/i }),
    sick: form.getByRole('radio', { name: /^sick$/i }),
    select: form.locator('select').and(form.getByLabel(/^kind$/i)),
  };
}

/** The kind the form shows chosen: 'vacation', 'sick' or null (nothing chosen). */
export async function chosenKind(form: Locator): Promise<'vacation' | 'sick' | null> {
  const k = kindControls(form);
  if ((await k.vacation.count()) > 0 && (await k.vacation.first().isChecked())) return 'vacation';
  if ((await k.sick.count()) > 0 && (await k.sick.first().isChecked())) return 'sick';
  if ((await k.select.count()) > 0) {
    const label = await k.select.first().evaluate((el) => {
      const s = el as HTMLSelectElement;
      return s.selectedIndex >= 0 ? (s.options[s.selectedIndex]?.label ?? s.options[s.selectedIndex]?.text ?? '') : '';
    });
    if (/^\s*vacation\s*$/i.test(label)) return 'vacation';
    if (/^\s*sick\s*$/i.test(label)) return 'sick';
  }
  return null;
}

/** Chooses the kind on the send form. */
export async function chooseKind(form: Locator, kind: 'vacation' | 'sick'): Promise<void> {
  const k = kindControls(form);
  const radio = kind === 'vacation' ? k.vacation : k.sick;
  if ((await radio.count()) > 0) {
    await radio.first().check();
    return;
  }
  if ((await k.select.count()) > 0) {
    await k.select.first().selectOption({ label: kind === 'vacation' ? 'Vacation' : 'Sick' });
    return;
  }
  throw new SetupError('the send form has no kind control (radios "Vacation"/"Sick" or a select labelled "Kind")');
}

/** The send form's day fields. */
export function dayFields(form: Locator): { first: Locator; last: Locator } {
  return { first: form.getByLabel(/first day/i).first(), last: form.getByLabel(/last day/i).first() };
}

/** Fills the send form (kind optional: left unchosen when absent) and presses Send once, unless `press: false`. */
export async function fillSendForm(
  page: Page,
  spec: { kind?: 'vacation' | 'sick'; firstDay: string; lastDay: string },
  opts: { press?: boolean } = {},
): Promise<Locator> {
  const form = await sendForm(page);
  if (spec.kind) await chooseKind(form, spec.kind);
  const days = dayFields(form);
  await days.first.fill(spec.firstDay);
  await days.last.fill(spec.lastDay);
  if (opts.press !== false) await sendButton(form).click();
  return form;
}

export function sendButton(form: Locator): Locator {
  return form.getByRole('button', { name: /^send/i }).first();
}

/** Opens /requests/new in the page and waits for the send form. */
export async function openSendForm(page: Page): Promise<Locator> {
  await page.goto('/requests/new');
  await settle(page);
  return sendForm(page);
}

/** Opens the people page's create form and returns it. */
export async function createForm(page: Page): Promise<Locator> {
  const formOf = () =>
    page
      .locator('form')
      .filter({ has: page.getByLabel(/allowance/i) })
      .filter({ has: page.getByLabel(/^email$/i) })
      .first();
  if (!(await formOf().isVisible().catch(() => false))) {
    const opener = page.getByRole('button', { name: /^(add|create|new)\b/i }).or(page.getByRole('link', { name: /^(add|create|new)\b/i }));
    if ((await opener.count()) > 0) await opener.first().click();
  }
  try {
    await formOf().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new SetupError('the people page shows no create form (a form with fields labelled "Email" and "Allowance")');
  }
  return formOf();
}

/** Fills the create form and presses its Create/Add button. */
export async function fillCreateForm(form: Locator, spec: { name: string; email: string; password: string; allowance: number }): Promise<void> {
  await form.getByLabel(/^(display )?name$/i).first().fill(spec.name);
  await form.getByLabel(/^email$/i).first().fill(spec.email);
  const pw = form.locator('input[type="password"]');
  const n = await pw.count();
  if (n === 0) throw new SetupError('the create form has no password field');
  for (let i = 0; i < n; i += 1) await pw.nth(i).fill(spec.password);
  await form.getByLabel(/allowance/i).first().fill(String(spec.allowance));
  await form.getByRole('button', { name: /^(create|add)\b/i }).first().click();
}

/** Presses the first "Cancel…" button on the page, accepts a native confirm and presses a confirming button if one appears. */
export async function pressCancel(page: Page): Promise<void> {
  page.once('dialog', (d) => d.accept().catch(() => undefined));
  await page.getByRole('button', { name: /^cancel/i }).first().click();
  const confirm = page.getByRole('button', { name: /^(yes|confirm)\b/i });
  await confirm.first().waitFor({ state: 'visible', timeout: 2_000 }).then(
    () => confirm.first().click(),
    () => undefined,
  );
}

/** On /admin/pending, rejects the request in the row holding `personName` with `note`, through the page's controls. */
export async function rejectThroughPage(page: Page, personName: string, note: string): Promise<void> {
  const row = page
    .locator('li, tr, article, [role="row"], [role="listitem"]')
    .filter({ hasText: personName })
    .filter({ has: page.getByRole('button', { name: /^reject/i }) })
    .last();
  if ((await row.count()) === 0) throw new SetupError(`no row on /admin/pending holds "${personName}" with a Reject button`);
  page.once('dialog', (d) => d.accept().catch(() => undefined));
  await row.getByRole('button', { name: /^reject/i }).first().click();
  const noteField = page.getByLabel(/note/i).first();
  try {
    await noteField.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new SetupError('the reject step shows no field labelled "Note"');
  }
  await noteField.fill(note);
  const confirm = page.getByRole('button', { name: /^(confirm|yes|reject)\b/i });
  await confirm.last().click();
}

/** Signs out through the page's own control. */
export async function signOutThroughPage(page: Page): Promise<void> {
  const control = page.getByRole('button', { name: /^(sign|log) ?out$/i }).or(page.getByRole('link', { name: /^(sign|log) ?out$/i }));
  if ((await control.count()) === 0) throw new SetupError('the page has no "Sign out" button or link');
  await control.first().click();
  await settle(page);
}

/** Fills the sign-in form on whatever sign-in page is open and presses Sign in (the harness door's labels, D-029). */
export async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  try {
    await page.getByLabel('Email', { exact: true }).fill(email, { timeout: 15_000 });
    await page.getByLabel('Password', { exact: true }).fill(password, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 15_000 });
  } catch (e) {
    throw new SetupError(`the sign-in form could not be operated: ${(e as Error).message.split('\n')[0]}`);
  }
}

/** Waits (bounded poll) until the page's own cookies carry a session (GET /api/me 200). */
export async function waitForSession(page: Page, timeoutMs = 15_000): Promise<void> {
  try {
    await expect.poll(async () => (await page.request.get('/api/me')).status(), { timeout: timeoutMs }).toBe(200);
  } catch {
    throw new SetupError('no session in the page after signing in');
  }
}

// ---------------------------------------------------------------------------------------------------
// The calendar grid
// ---------------------------------------------------------------------------------------------------

export interface GridCell {
  date: string;
  cx: number;
  top: number;
  text: string;
  today: boolean;
}
export interface GridHeading {
  weekday: number;
  left: number;
  right: number;
  bottom: number;
}

/** Reads the calendar grid as painted: dated cells (data-date or time[datetime]) and weekday headings. */
export async function readGrid(page: Page): Promise<{ cells: GridCell[]; headings: GridHeading[] }> {
  return page.evaluate(() => {
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const cells: { date: string; cx: number; top: number; text: string; today: boolean }[] = [];
    const seen = new Set<Element>();
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const add = (cell: Element, date: string) => {
      if (seen.has(cell) || !visible(cell)) return;
      seen.add(cell);
      const r = cell.getBoundingClientRect();
      const marked =
        cell.matches('[aria-current="date"]') ||
        cell.querySelector('[aria-current="date"]') !== null ||
        cell.closest('[aria-current="date"]') !== null ||
        /\btoday\b/i.test((cell as HTMLElement).innerText ?? '');
      cells.push({ date, cx: r.left + r.width / 2 + window.scrollX, top: r.top + window.scrollY, text: (cell as HTMLElement).innerText ?? '', today: marked });
    };
    document.querySelectorAll('[data-date]').forEach((el) => {
      const d = el.getAttribute('data-date') ?? '';
      if (DAY.test(d)) add(el, d);
    });
    document.querySelectorAll('time[datetime]').forEach((el) => {
      const d = el.getAttribute('datetime') ?? '';
      if (!DAY.test(d) || el.closest('[data-date]')) return;
      const cell = el.closest('td, [role="gridcell"], li') ?? el.parentElement ?? el;
      add(cell, d);
    });
    const NAMES: [RegExp, number][] = [
      [/^(sun|sunday|su)\.?$/i, 0],
      [/^(mon|monday|mo)\.?$/i, 1],
      [/^(tue|tues|tuesday|tu)\.?$/i, 2],
      [/^(wed|wednesday|we)\.?$/i, 3],
      [/^(thu|thur|thurs|thursday|th)\.?$/i, 4],
      [/^(fri|friday|fr)\.?$/i, 5],
      [/^(sat|saturday|sa)\.?$/i, 6],
    ];
    const headings: { weekday: number; left: number; right: number; bottom: number }[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (el.closest('[data-date]') || el.querySelector('*') !== null && !el.matches('th, [role="columnheader"]')) return;
      const t = (el.textContent ?? '').trim();
      const hit = NAMES.find(([re]) => re.test(t));
      if (!hit || !visible(el)) return;
      const r = el.getBoundingClientRect();
      headings.push({ weekday: hit[1], left: r.left + window.scrollX, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY });
    });
    return { cells, headings };
  });
}

/** The month (YYYY-MM) most of the grid's dated cells fall in, or null when the grid has no dated cells. */
export function shownMonth(cells: GridCell[]): string | null {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c.date.slice(0, 7), (counts.get(c.date.slice(0, 7)) ?? 0) + 1);
  let best: string | null = null;
  for (const [m, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = m;
  return best;
}

/** The month-navigation control whose accessible name holds `which` ("Next" or "Previous"). */
export function monthControl(page: Page, which: 'next' | 'previous'): Locator {
  const re = which === 'next' ? /next/i : /prev/i;
  return page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
}

/** Presses Next/Previous and waits (bounded poll) until the grid shows `expected` (YYYY-MM). */
export async function moveMonth(page: Page, which: 'next' | 'previous', expected: string): Promise<string | null> {
  const control = monthControl(page, which);
  if ((await control.count()) === 0) throw new SetupError(`the calendar has no "${which}" month control`);
  await control.click();
  let shown: string | null = null;
  await expect
    .poll(
      async () => {
        shown = shownMonth((await readGrid(page)).cells);
        return shown;
      },
      { timeout: 10_000 },
    )
    .toBe(expected)
    .catch(() => undefined);
  return shown;
}

// ---------------------------------------------------------------------------------------------------
// Phone width
// ---------------------------------------------------------------------------------------------------

export const PHONE = { width: 375, height: 812 };

/** The page's sideways scroll: how far the document is wider than the viewport (0 when it fits). */
export async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return Math.max(el.scrollWidth, document.body?.scrollWidth ?? 0) - el.clientWidth;
  });
}

/** Every visible control on the page that is not reachable at the current width: outside the viewport sideways or covered. */
export async function unreachableControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]';
    document.querySelectorAll(sel).forEach((node) => {
      const el = node as HTMLElement;
      const cs = getComputedStyle(el);
      let r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
      const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('name') || el.tagName).trim().slice(0, 40);
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) {
        out.push(`${name} (spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
        return;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const labels = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels ?? []) : [];
      const ok = hit !== null && (hit === el || el.contains(hit) || labels.some((l) => l === hit || l.contains(hit)));
      if (!ok) out.push(`${name} (covered by ${hit ? hit.tagName.toLowerCase() : 'nothing'})`);
    });
    window.scrollTo(0, 0);
    return out;
  });
}

/**
 * For each of `names`, whether the page shows it readable outside the header: a text run holding the whole name,
 * painted, inside the viewport sideways, not clipped by an ancestor, at least 10px type, not overlapping another
 * name's run. Answers the names that fail, with why.
 */
export async function unreadableNames(page: Page, names: string[]): Promise<string[]> {
  return page.evaluate((list) => {
    const vw = document.documentElement.clientWidth;
    const rects: { name: string; r: DOMRect }[] = [];
    const bad: string[] = [];
    for (const name of list) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let found: { node: Text; at: number } | null = null;
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const at = (n.data ?? '').indexOf(name);
        if (at < 0) continue;
        const host = n.parentElement;
        if (!host || host.closest('header, [role="banner"]')) continue;
        found = { node: n, at };
        break;
      }
      if (!found) {
        bad.push(`${name}: not shown in one text run`);
        continue;
      }
      const range = document.createRange();
      range.setStart(found.node, found.at);
      range.setEnd(found.node, found.at + name.length);
      const r = range.getBoundingClientRect();
      const host = found.node.parentElement as HTMLElement;
      const cs = getComputedStyle(host);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
        bad.push(`${name}: not painted`);
        continue;
      }
      if (r.left < -1 || r.right > vw + 1) bad.push(`${name}: outside the screen (${Math.round(r.left)}..${Math.round(r.right)})`);
      if (parseFloat(cs.fontSize) < 10) bad.push(`${name}: type ${cs.fontSize}`);
      for (let a: HTMLElement | null = host; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (/(hidden|clip|scroll|auto)/.test(acs.overflowX + acs.overflowY)) {
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) {
            bad.push(`${name}: clipped by ${a.tagName.toLowerCase()}`);
            break;
          }
        }
      }
      rects.push({ name, r });
    }
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i].r;
        const b = rects[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) bad.push(`${rects[i].name} overlaps ${rects[j].name}`);
      }
    }
    return bad;
  }, names);
}

// ---------------------------------------------------------------------------------------------------
// Another site, played by the browser
// ---------------------------------------------------------------------------------------------------

/** The other site's origin: a different site from the product's (http://product:3000). */
export const OTHER_SITE = 'http://evil.test';

/** Serves `html` at OTHER_SITE + path in this browser context (no network) and returns the URL. */
export async function serveOtherSite(context: BrowserContext, path: string, html: string): Promise<string> {
  const url = `${OTHER_SITE}${path}`;
  await context.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  return url;
}

/** Serves a fixed page at every OTHER_SITE address (a navigation that reaches it lands on "OTHER SITE"). */
export async function catchOtherSite(context: BrowserContext): Promise<void> {
  await context.route(`${OTHER_SITE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>other</title><p>OTHER SITE</p>' }),
  );
}

/** The product's origin. */
export function productOrigin(): string {
  return new URL(productUrl()).origin;
}

/** The product's pages of D-029, by who may open them. */
export function pagesFor(kind: 'anonymous' | 'member' | 'admin', personId?: AccountId): string[] {
  if (kind === 'anonymous') return ['/sign-in'];
  const own = ['/', '/requests/new', '/calendar', '/password'];
  if (kind === 'member') return own;
  return [...own, '/admin/pending', '/admin/people', ...(personId === undefined ? [] : [`/admin/people/${encodeURIComponent(String(personId))}`])];
}
