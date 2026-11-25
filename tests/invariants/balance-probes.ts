// Purpose: shared setup for the REQ-002 hostility probes (HOS-001 to HOS-005) — a team whose vacation is already spent in each year through the public routes, a press of the send form read as the answer it drew, two send forms pressed at the same moment, a person's stored requests matched by their days, and a person's part of the people page.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14; brief test-author-18 added spentTeam's noSendFillsAYear option, sendThroughFormWatched and pressAtOnce), from DECISIONS.md D-029 (routes, pages, forms in plain words) and D-037 (an allowance refusal names the year's days left and pending days as numbers); a public harness boundary beside harness.ts, request-rules.ts, robustness.ts, page-figures.ts and records.ts.
//
// This module asserts nothing about any row. It reaches the product only through harness.ts and the modules named
// above — over HTTP or through the engine door at VID_PRODUCT_URL — and reads no application code. Every record it
// makes is made through the product's own public routes (fixture law). A control it needs and does not find throws
// a SetupError (from the module that reads it), so a mismatch reads as setup, never as a row failing.
//
// Readings, stated once here:
//   - the send form is robustness.ts's reading (the form holding "First day"; kind radios or a Kind select; "Last
//     day"; the button whose name starts with "Send");
//   - a PRESS's answer is what the page drew after Send: the page left the address it was pressed on, or lines of
//     text appeared that the page did not hold before the press (robustness.ts newLines) — read after a bounded wait
//     for either, then a wait for the network to settle, so the server's answer has come back before any store read;
//   - a person's STORED request for an ask is a GET /api/requests item whose firstDay and lastDay equal the ask's;
//   - a person's PART of the people page is records.ts textAbout: the largest element holding the person's email and
//     no other account's email, its text with the person's name and email removed (they carry run-id digits).
import { expect, type Browser, type Page, type Request, type Route } from '@playwright/test';
import { openPage, PAGES, SetupError, setAllowance, type Actor, type Member } from './harness';
import { fillSendForm, newLines, openSendForm, sendButton, settle, textLines } from './robustness';
import {
  addDays,
  day,
  onOrAfter,
  ownRequests,
  pickYear,
  randomInt,
  setupTeam,
  spendVacation,
  teamAt,
  type StoredRequest,
  type Team,
} from './request-rules';
import { hasNumber, withoutDates, withoutLiterals } from './page-reading';
import { textAbout } from './records';

// ---------------------------------------------------------------------------------------------------
// The calendar the probes run in
// ---------------------------------------------------------------------------------------------------

/** The probes' days: a year fresh per run, today a Wednesday in early March of it at 09:00 team time (UTC+14). */
export interface ProbeCalendar {
  /** This year (the team's current year). */
  Y: number;
  today: string;
  now: string;
  /** Where this year's spending starts: the Monday at least a week after today. */
  thisYearSpend: string;
  /** Where next year's spending starts: the first Monday of February next year. */
  nextYearSpend: string;
  /** Where this year's asks start: the first Monday of June, far after any spending. */
  thisYearAsk: string;
  /** Where next year's asks start: the first Monday of June next year. */
  nextYearAsk: string;
}

export function probeCalendar(): ProbeCalendar {
  const Y = pickYear();
  const today = onOrAfter(day(Y, 3, 2), 3);
  return {
    Y,
    today,
    now: teamAt(today),
    thisYearSpend: onOrAfter(addDays(today, 7), 1),
    nextYearSpend: onOrAfter(day(Y + 1, 2, 1), 1),
    thisYearAsk: onOrAfter(day(Y, 6, 1), 1),
    nextYearAsk: onOrAfter(day(Y + 1, 6, 1), 1),
  };
}

// ---------------------------------------------------------------------------------------------------
// A team with vacation already spent (HOS-001, HOS-002, HOS-003)
// ---------------------------------------------------------------------------------------------------

/**
 * The figures of a spent team, fresh per run. P has allowance A, this year `a` days approved and `p` pending: days
 * left L = A − a, room k = L − p. Q has allowance A, this year used up (c approved, A − c pending), next year `b`
 * approved and `q` pending: days left L2 = A − b, room k2 = L2 − q. Every figure a refusal could show for a year —
 * the allowance, days left, pending, room, the asked count, the approved days, and for Q this year's figures — is a
 * different number, and both rooms are at least 2.
 */
export interface SpentFigures {
  A: number;
  a: number;
  p: number;
  L: number;
  k: number;
  c: number;
  b: number;
  q: number;
  L2: number;
  k2: number;
}

export function spentFigures(): SpentFigures {
  const distinct = (xs: number[]) => new Set(xs).size === xs.length;
  for (;;) {
    const A = randomInt(12, 20);
    const a = randomInt(2, 5);
    const p = randomInt(2, 5);
    const c = randomInt(2, A - 2);
    const b = randomInt(2, 5);
    const q = randomInt(2, 5);
    const L = A - a;
    const k = L - p;
    const L2 = A - b;
    const k2 = L2 - q;
    if (k < 2 || k2 < 2) continue;
    if (!distinct([A, L, p, k, k + 1, a])) continue;
    if (!distinct([A, L2, q, k2, k2 + 1, b, A - c])) continue;
    return { A, a, p, L, k, c, b, q, L2, k2 };
  }
}

export interface SpentTeam {
  team: Team;
  /** P: this year spent in part (a approved, p pending). */
  p: Actor;
  /** Q: this year used up, next year spent in part (b approved, q pending). */
  q: Actor;
  pMember: Member;
  qMember: Member;
  dispose(): Promise<void>;
}

/**
 * A fresh install at `cal.now` with P and Q spent as `f` says, every request through the public routes.
 *
 * With `noSendFillsAYear: true` (HOS-002, added by brief test-author-18) no setup send asks for exactly the room its
 * year has left, so a balance check that refuses at equality cannot break the setup — only the probe's own send meets
 * equality. Q is created with allowance A + 1, spends this year c approved and A − c pending (one day of room left)
 * and next year b approved and q pending, and then the admin sets Q's allowance to A starting this year (REQ-011
 * AMENDED: a change starting this year applies at once to this year and every later year no next-year change has
 * set), which uses this year up and leaves next year's room k2. The figures `f` describes are the same either way.
 */
export async function spentTeam(cal: ProbeCalendar, f: SpentFigures, opts: { noSendFillsAYear?: boolean } = {}): Promise<SpentTeam> {
  const lower = opts.noSendFillsAYear === true;
  const team = await setupTeam({ now: cal.now, allowances: [f.A, lower ? f.A + 1 : f.A] });
  const [p, q] = team.people;
  try {
    await spendVacation(team.admin, p, cal.thisYearSpend, f.a, f.p);
    await spendVacation(team.admin, q, cal.thisYearSpend, f.c, f.A - f.c);
    await spendVacation(team.admin, q, cal.nextYearSpend, f.b, f.q);
    if (lower) await setAllowance(team.admin, team.members[1].id, f.A, { startsNextYear: false });
  } catch (e) {
    await team.dispose();
    throw e;
  }
  return { team, p, q, pMember: team.members[0], qMember: team.members[1], dispose: () => team.dispose() };
}

// ---------------------------------------------------------------------------------------------------
// The send form, pressed
// ---------------------------------------------------------------------------------------------------

export interface Ask {
  kind: 'vacation' | 'sick';
  firstDay: string;
  lastDay: string;
}

/** What one press of Send drew (see the header). */
export interface Pressed {
  /** Lines of text the page holds now and did not hold before the press. */
  appeared: string[];
  /** True when the page left the address it was pressed on. */
  moved: boolean;
}

interface Ready {
  page: Page;
  before: string[];
  startUrl: string;
  press(): Promise<void>;
}

/** Opens /requests/new on `page` and fills the form with `ask`, without pressing Send. */
async function ready(page: Page, ask: Ask): Promise<Ready> {
  await openSendForm(page);
  const form = await fillSendForm(page, ask, { press: false });
  const button = sendButton(form);
  return { page, before: await textLines(page), startUrl: page.url(), press: () => button.click() };
}

/** Waits (bounded) until the press drew its answer — the page moved or drew new text — then for the network to settle. */
async function answerOf(r: Ready, timeoutMs = 10_000): Promise<Pressed> {
  await expect
    .poll(async () => r.page.url() !== r.startUrl || newLines(r.before, await textLines(r.page)).length > 0, { timeout: timeoutMs })
    .toBe(true)
    .catch(() => undefined);
  await settle(r.page);
  return { appeared: newLines(r.before, await textLines(r.page)), moved: r.page.url() !== r.startUrl };
}

/** Opens the send form on `page`, fills it with `ask`, presses Send once and reads what the press drew. */
export async function sendThroughForm(page: Page, ask: Ask): Promise<Pressed> {
  const r = await ready(page, ask);
  await r.press();
  return answerOf(r);
}

/**
 * Fills one send form per page (page i with ask i), every form filled before any is pressed, then presses every Send
 * button at the same moment (one Promise.all of the clicks) and reads what each press drew.
 */
export async function pressTogether(pages: Page[], asks: Ask[]): Promise<Pressed[]> {
  if (pages.length !== asks.length) throw new Error('pressTogether needs one ask per page');
  const readied: Ready[] = [];
  for (let i = 0; i < pages.length; i += 1) readied.push(await ready(pages[i], asks[i]));
  await Promise.all(readied.map((r) => r.press()));
  return Promise.all(readied.map((r) => answerOf(r)));
}

// ---------------------------------------------------------------------------------------------------
// The send form, pressed with its request watched at the browser's network layer (HOS-005, brief test-author-18)
// ---------------------------------------------------------------------------------------------------

/** What one press drew, and the request it sent as the browser saw it. */
export interface Watched extends Pressed {
  /** True when the press sent a request (any method but GET) whose body carries the ask's first day. */
  sent: boolean;
  /** The status the product answered that request with; 0 when nothing was sent or no answer came. */
  status: number;
}

/** True when `req` is the send of `ask`: not a GET, and its body (JSON, form-encoded or multipart) holds the ask's first day. */
function carriesAsk(req: Request, ask: Ask): boolean {
  if (req.method() === 'GET') return false;
  return (req.postData() ?? '').includes(ask.firstDay);
}

/** A bounded wait that can be cancelled, so no timer outlives the press it bounds. */
function within(ms: number): { done: Promise<void>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
  return { done, cancel: () => clearTimeout(timer) };
}

/** The status the product answered `req` with (bounded); 0 when no answer came. */
async function statusOf(req: Request | null, timeoutMs = 15_000): Promise<number> {
  if (req === null) return 0;
  const bound = within(timeoutMs);
  try {
    const res = await Promise.race([req.response().catch(() => null), bound.done.then(() => null)]);
    return res?.status() ?? 0;
  } finally {
    bound.cancel();
  }
}

/** Like sendThroughForm, and also reports whether the press sent the ask's request and what the product answered. */
export async function sendThroughFormWatched(page: Page, ask: Ask, timeoutMs = 10_000): Promise<Watched> {
  const r = await ready(page, ask);
  const sent = page.waitForRequest((q) => carriesAsk(q, ask), { timeout: timeoutMs }).catch(() => null);
  await r.press();
  const req = await sent;
  const status = await statusOf(req);
  return { ...(await answerOf(r)), sent: req !== null, status };
}

/**
 * Two (or more) sends that leave the browser at the same moment, whatever the clicks' own timing. Fills one send form
 * per page (page i with ask i), every form filled before any is pressed; on each page the request carrying that
 * page's ask is held at the browser's network layer (page.route) until every page's request is held, then all are
 * released together — so every send has left its page before the product has answered any of them. Then presses
 * every Send button (one Promise.all of the clicks), waits for each answer and reads what each press drew.
 * When a page's press sends no request carrying its ask within `timeoutMs`, the held ones are released and a
 * SetupError names the page: the simultaneous case was not reached, which is setup, never the row failing.
 */
export async function pressAtOnce(pages: Page[], asks: Ask[], timeoutMs = 10_000): Promise<Watched[]> {
  if (pages.length !== asks.length) throw new Error('pressAtOnce needs one ask per page');
  const readied: Ready[] = [];
  for (let i = 0; i < pages.length; i += 1) readied.push(await ready(pages[i], asks[i]));
  const held: (Request | null)[] = pages.map(() => null);
  let releaseAll!: () => void;
  const allHeld = new Promise<void>((resolve) => (releaseAll = resolve));
  const bound = within(timeoutMs);
  const gate = Promise.race([allHeld, bound.done]);
  const handlers = pages.map((_, i) => async (route: Route) => {
    const req = route.request();
    if (held[i] === null && carriesAsk(req, asks[i])) {
      held[i] = req;
      if (held.every((h) => h !== null)) releaseAll();
      await gate;
    }
    await route.continue().catch(() => undefined);
  });
  for (let i = 0; i < pages.length; i += 1) await pages[i].route('**/*', handlers[i]);
  try {
    const clicks = Promise.all(readied.map((r) => r.press()));
    const together = await Promise.race([allHeld.then(() => true), bound.done.then(() => false)]);
    await clicks;
    if (!together) {
      const silent = held.map((h, i) => (h === null ? i + 1 : 0)).filter((n) => n > 0);
      throw new SetupError(`pressAtOnce: the press on page ${silent.join(', ')} sent no request carrying its ask within ${timeoutMs} ms, so the sends were not simultaneous`);
    }
    const statuses = await Promise.all(held.map((h) => statusOf(h)));
    const drawn = await Promise.all(readied.map((r) => answerOf(r)));
    return drawn.map((d, i) => ({ ...d, sent: true, status: statuses[i] }));
  } finally {
    bound.cancel();
    releaseAll();
    for (let i = 0; i < pages.length; i += 1) await pages[i].unroute('**/*', handlers[i]).catch(() => undefined);
  }
}

/** Opens `n` pages through the engine door, each signed in as `actor`; close them with closeAll. */
export async function openPages(browser: Browser, actor: Actor, n: number) {
  const opened = [];
  for (let i = 0; i < n; i += 1) opened.push(await openPage(browser, actor));
  return opened;
}

// ---------------------------------------------------------------------------------------------------
// Stored requests, matched by their days
// ---------------------------------------------------------------------------------------------------

/** The person's stored requests (GET /api/requests) whose first and last day are the ask's. */
export async function storedFor(actor: Actor, ask: { firstDay: string; lastDay: string }): Promise<StoredRequest[]> {
  return (await ownRequests(actor)).filter((r) => String(r.firstDay) === ask.firstDay && String(r.lastDay) === ask.lastDay);
}

/** How many requests the person has stored (GET /api/requests). */
export async function storedCount(actor: Actor): Promise<number> {
  return (await ownRequests(actor)).length;
}

/** Polls (bounded) until the person has `want` stored requests for the ask, and returns the ones read last. */
export async function awaitStored(actor: Actor, ask: { firstDay: string; lastDay: string }, want: number, timeoutMs = 10_000): Promise<StoredRequest[]> {
  let last: StoredRequest[] = [];
  await expect
    .poll(async () => (last = await storedFor(actor, ask)).length, { timeout: timeoutMs })
    .toBe(want)
    .catch(() => undefined);
  return last;
}

/** A stored request's state and kind, lower case, for comparison and messages. */
export function stateAndKind(r: StoredRequest | undefined): { state: string; kind: string } {
  return { state: String(r?.state ?? '').toLowerCase(), kind: String(r?.kind ?? '').toLowerCase() };
}

// ---------------------------------------------------------------------------------------------------
// Figures in text
// ---------------------------------------------------------------------------------------------------

/**
 * True when `text` shows `n` as a whole number of its own, once every English rendering of `days` and every literal
 * in `literals` (names, emails) is removed, so a day of the month or a run-id digit is never read as a figure.
 */
export function showsFigure(text: string, n: number, days: string[] = [], literals: string[] = []): boolean {
  return hasNumber(withoutDates(withoutLiterals(text, literals), days), n);
}

// ---------------------------------------------------------------------------------------------------
// The people page: one person's part
// ---------------------------------------------------------------------------------------------------

export interface PeoplePart {
  status: number;
  found: boolean;
  /** The part's visible text with the person's name and email removed ('' when not found). */
  text: string;
}

/**
 * Opens /admin/people as `admin`, waits (bounded) until the person's part is drawn, and reads it (see the header).
 * `others` are the emails of every other account the page lists.
 */
export async function peoplePart(browser: Browser, admin: Actor, person: { name: string; email: string }, others: string[]): Promise<PeoplePart> {
  const opened = await openPage(browser, admin);
  try {
    const res = await opened.page.goto(PAGES.adminPeople);
    await settle(opened.page);
    let read = { found: false, text: '' };
    await expect
      .poll(async () => (read = await textAbout(opened.page, person.email, others)).found, { timeout: 10_000 })
      .toBe(true)
      .catch(() => undefined);
    const text = read.found ? withoutLiterals(read.text, [person.name, person.email]).replace(/\s+/g, ' ').trim() : '';
    return { status: res?.status() ?? 0, found: read.found, text };
  } finally {
    await opened.close();
  }
}
