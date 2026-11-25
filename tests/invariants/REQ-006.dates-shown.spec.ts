// Purpose: ledger tests for ROW-138 and ROW-139 (REQ-006, REQ-008, REQ-012, REQ-017) — every date shown uses one unambiguous format with the month as a word and the calendar year (29 to 31 December, 1 to 3 January), and sent, decided and cancelled times show the team-zone date and sort by the true moment across a daylight-saving fall-back.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; instants worked out and checked by the tests' own Intl oracle.
//
// Boundary (R6): what a date LOOKS like is paint — read in the browser on the person's own requests page "/", the
// admin's pending page and the admin's person page (D-029), opened in America/Los_Angeles with the en-US locale, so a
// page that formats with the browser's locale or zone is caught. The order of a list is behaviour, proved at the HTTP
// harness on the lists that are the pages' data (GET /api/requests, GET /api/admin/pending) and again on the pages.
// A date "shown in full" is the day, the month as a word and the year together (team-calendar.ts shownDate); a page
// that drops the year or the month from one end of a range does not show that date in the format.
// Slice 1, brief test-author-13: two ROW-138 cases added after ROW-138's first case — the person page's change history
// at the team's 1 January 09:00 (UTC and the browser still on 31 December) shows 1 January 2027 on the entry itself;
// and the drawn shape of every date (weekday or none, month full or short, order) is one shape across the own page,
// the pending page, the person page and the approve, reject and cancel confirmations. Every earlier assertion kept.
// Slice 1, brief test-author-24: two ROW-138 cases added before ROW-139 — the month calendar's title and day cells
// across 29 December 2026 to 4 January 2027 (each December and January view), and the dates the switch-off
// confirmation and a switch-off refusal draw on the people page on 30 December 2026. Every earlier assertion kept.
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { readCalendar } from './journey-pages';
import { hasDate } from './page-reading';
import { adminCancel, approve, freshName, PAGES, rename, setAllowance, setClock, type AccountId, type Actor, type Member } from './harness';
import { actionControl, freshInt, openConfirmation } from './admin-kit';
import {
  addMember,
  AUCKLAND,
  dateOrders,
  disposeAll,
  LOS_ANGELES,
  NUMERIC_DATE,
  openPageIn,
  ownRecords,
  canSignIn,
  pageTextWhen,
  pendingRecords,
  sendApproved,
  sendOk,
  setTeamClock,
  shownDate,
  startTeam,
  teamDateOf,
  teamInstant,
  teamTimeOf,
  utcDateOf,
  type Rec,
  type Team,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const BROWSER = { timezoneId: LOS_ANGELES, locale: 'en-US' };

// ---------------------------------------------------------------------------------------------------
// ROW-138 promise: REQ-006 (the own page lists each request's first and last day), REQ-008 (the pending page the same)
// ROW-138   and REQ-012 (the calendar year): every date the product shows uses one unambiguous format with the month as
// ROW-138   a word, and the calendar year — 29 to 31 December and 1 to 3 January show the right year.
// ROW-138 wrong product: one that formats with the browser's locale (en-US "12/29/2026", or "1/3/2027" read as 1 March
// ROW-138   elsewhere), with a week-numbering year ("YYYY": 1..3 January 2027 belong to ISO week 53 of 2026, and in the
// ROW-138   US week rule 29..31 December 2026 belong to week 1 of 2027), or that mixes "29 December 2026" on one page with
// ROW-138   "December 29, 2026" on another.
// ROW-138 given: a member's pending vacations whose first or last days are each of 29, 30, 31 December 2026 and 1, 2,
// ROW-138   3 January 2027 (and 4 January 2027), sent in Auckland on 1 December 2026. when: the own page, the pending page
// ROW-138   and the person page are opened. then: each page shows each of those days in full with its calendar year;
// ROW-138   none shows the same day with the other year (29 December 2027, 1 January 2026 …); no date with a number
// ROW-138   month (2026-12-29, 12/29/2026, 29.12.2026) appears; and the pages together use one order of day and month.
// ROW-138 controls: the control case opens the own page for a mid-year vacation (16 June 2027), where no year rule
// ROW-138   can go wrong, and finds it shown in full: the page and the matcher work.
// ROW-138 technique: the clock's origin — the days either side of New Year where calendar year and week-year part —
// ROW-138   with the wrong-year decoy of every day, on every page that shows them.
// ROW-138 cases: ROW-138 target=ROW-138.REQ-006.year-end-dates-show-their-calendar-year-in-one-format control=ROW-138.control.a-mid-year-date-is-shown-in-full
test('ROW-138.control.a-mid-year-date-is-shown-in-full', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-01', '15:00') });
  const { actor } = await addMember(team);
  await sendOk(actor, { kind: 'vacation', firstDay: '2027-06-16', lastDay: '2027-06-16' });
  const opened = await openPageIn(browser, actor, BROWSER);
  const text = await pageTextWhen(opened, PAGES.home, [shownDate('2027-06-16')]);
  expect(shownDate('2027-06-16').test(text), 'ROW-138 control: the own page shows 16 June 2027 in full').toBe(true);
});

test('ROW-138.REQ-006.year-end-dates-show-their-calendar-year-in-one-format', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-01', '15:00') });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const ranges: [string, string][] = [
    ['2026-12-29', '2026-12-30'],
    ['2026-12-31', '2026-12-31'],
    ['2027-01-01', '2027-01-02'],
    ['2027-01-03', '2027-01-04'],
  ];
  for (const [firstDay, lastDay] of ranges) await sendOk(actor, { kind: 'vacation', firstDay, lastDay });
  const days = ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'];
  const otherYear = ['2027-12-29', '2027-12-30', '2027-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];

  const pages: [string, Parameters<typeof openPageIn>[1]][] = [
    [PAGES.home, actor],
    [PAGES.adminPending, team.admin],
    [PAGES.adminPerson(member.id), team.admin],
  ];
  let dayFirst = 0;
  let monthFirst = 0;
  for (const [path, who] of pages) {
    const opened = await openPageIn(browser, who, BROWSER);
    const text = await pageTextWhen(opened, path, days.map(shownDate));
    for (const d of days) expect.soft(shownDate(d).test(text), `ROW-138 ${path}: shows ${d} in full with its calendar year`).toBe(true);
    for (const d of otherYear) expect.soft(shownDate(d).test(text), `ROW-138 ${path}: does not show ${d} (the wrong year)`).toBe(false);
    expect.soft(text.match(NUMERIC_DATE)?.[0] ?? null, `ROW-138 ${path}: shows no date with a number month`).toBeNull();
    const o = dateOrders(text);
    dayFirst += o.dayFirst;
    monthFirst += o.monthFirst;
    await opened.close();
  }
  expect.soft(dayFirst > 0 && monthFirst > 0, `ROW-138: one format across the pages (day-first ${dayFirst}, month-first ${monthFirst})`).toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-138, the change history (slice 1, brief test-author-13)
// ---------------------------------------------------------------------------------------------------

function literally(s: string): RegExp {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

function wholeNumber(n: number): RegExp {
  return new RegExp(`(?<!\\d)${n}(?!\\d)`);
}

/** The blocks of the page (list items, table rows, sections, divisions…) that carry every one of `has` and none of `hasNot`. */
function blocksWith(page: Page, has: (string | RegExp)[], hasNot: RegExp[]) {
  let loc = page.locator('li, tr, article, section, div, p, dd, dl, details, tbody, table, ul, ol');
  for (const h of has) loc = loc.filter({ hasText: h });
  for (const n of hasNot) loc = loc.filter({ hasNotText: n });
  return loc;
}

// ROW-138 promise: ROW-138 "every date the product shows uses one unambiguous format with the month as a word, and
// ROW-138   the calendar year: … 1 to 3 January show the right year"; A-023 (each allowance change and rename records who
// ROW-138   did it and when), shown on the admin's person page (D-029's /admin/people/:id).
// ROW-138 wrong product: a person page whose change history draws the stored instant ("2026-12-31T20:00:00Z UTC",
// ROW-138   "31/12/2026") or its UTC or browser date (31 December 2026), or a week-numbering year (1 January 2026), for
// ROW-138   a change made at the team's 1 January 2027 09:00 — the moment when UTC and the browser are still in 2026.
// ROW-138 given: Pacific/Auckland team; the member made on 15 Dec 2026 14:00 (UTC 01:00 the same day) as n0, renamed
// ROW-138   n0 → n1 and allowance 25 → a1 then; at 1 Jan 2027 09:00 team time (31 Dec 20:00 UTC, 31 Dec 12:00 in the
// ROW-138   browser's Los Angeles) renamed n1 → n2 and allowance a1 → a2 (a1, a2 fresh, above 31 so no day number is one).
// ROW-138   when: the admin opens /admin/people/:id in an en-US Los Angeles browser, before and after the 1 January
// ROW-138   changes. then: before, the page shows 15 December 2026 and no 1 January 2027; after, the block holding the
// ROW-138   rename (n1 and n2, not the 15 December date) shows 1 January 2027 in full, and so does the block holding the
// ROW-138   allowance change (a1 and a2, not the 15 December date); the page shows no 31 December 2026, no 1 January
// ROW-138   2026, no date with a number month and no "UTC".
// ROW-138 controls: the control case renames on 15 December and finds both names drawn on the person page — the page
// ROW-138   draws the history, untouched by how a date is formatted.
// ROW-138 technique: the clock's origin — the one hour of the year when the team, UTC and the browser are in different
// ROW-138   years — with the UTC date, the browser date and the week-year as decoys, read on the entry's own block,
// ROW-138   never "somewhere on the page", and an earlier entry as the near miss that must not be the block matched.
// ROW-138 cases: ROW-138 target=ROW-138.admin-person-page.change-history-at-new-year-shows-the-team-calendar-year control=ROW-138.control.the-person-page-draws-the-change-history
test('ROW-138.control.the-person-page-draws-the-change-history', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-15', '14:00') });
  const n0 = freshName('Ilse');
  const n1 = freshName('Ilse');
  const { member } = await addMember(team, { name: n0 });
  await rename(team.admin, member.id, n1);
  const opened = await openPageIn(browser, team.admin, BROWSER);
  const text = await pageTextWhen(opened, PAGES.adminPerson(member.id), [literally(n0), literally(n1)]);
  expect.soft(text.includes(n1), `ROW-138 control: the person page draws the new name ${n1}`).toBe(true);
  expect.soft(text.includes(n0), `ROW-138 control: the person page draws the rename's earlier name ${n0}`).toBe(true);
});

test('ROW-138.admin-person-page.change-history-at-new-year-shows-the-team-calendar-year', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-15', '14:00') });
  const [n0, n1, n2] = [freshName('Ilse'), freshName('Ilse'), freshName('Ilse')];
  const a1 = freshInt(41, 49);
  const a2 = freshInt(51, 59);
  const { member } = await addMember(team, { name: n0, allowance: 25 });
  await rename(team.admin, member.id, n1);
  await setAllowance(team.admin, member.id, a1);

  const before = await openPageIn(browser, team.admin, BROWSER);
  const bText = await pageTextWhen(before, PAGES.adminPerson(member.id), [literally(n1), shownDate('2026-12-15')]);
  expect.soft(shownDate('2026-12-15').test(bText), 'ROW-138 before: the person page shows the 15 December 2026 changes in full').toBe(true);
  expect(shownDate('2027-01-01').test(bText), 'ROW-138 before: the person page shows no 1 January 2027 yet').toBe(false);
  await before.close();

  const newYear = await setTeamClock(AUCKLAND, '2027-01-01', '09:00');
  expect(utcDateOf(newYear) === '2026-12-31' && teamDateOf(LOS_ANGELES, newYear) === '2026-12-31', 'ROW-138 setup: UTC and the browser are still on 31 December 2026').toBe(true);
  await rename(team.admin, member.id, n2);
  await setAllowance(team.admin, member.id, a2);

  const after = await openPageIn(browser, team.admin, BROWSER);
  const page = after.page;
  const text = await pageTextWhen(after, PAGES.adminPerson(member.id), [literally(n2), literally(n1), shownDate('2027-01-01')]);
  const earlier = shownDate('2026-12-15');
  expect.soft(
    await blocksWith(page, [literally(n1), literally(n2), shownDate('2027-01-01')], [earlier]).count(),
    `ROW-138: the rename ${n1} → ${n2} is drawn with 1 January 2027 in full, on its own entry — the page shows: ${JSON.stringify(text.slice(0, 1500))}`,
  ).toBeGreaterThan(0);
  expect.soft(
    await blocksWith(page, [wholeNumber(a1), wholeNumber(a2), shownDate('2027-01-01')], [earlier]).count(),
    `ROW-138: the allowance change ${a1} → ${a2} is drawn with 1 January 2027 in full, on its own entry`,
  ).toBeGreaterThan(0);
  expect.soft(shownDate('2026-12-31').test(text), 'ROW-138: 31 December 2026, the UTC and browser date of the 1 January changes, is not shown').toBe(false);
  expect.soft(shownDate('2026-01-01').test(text), 'ROW-138: 1 January 2026, the week-year of 1 January 2027, is not shown').toBe(false);
  expect.soft(text.match(NUMERIC_DATE)?.[0] ?? null, 'ROW-138: the person page shows no date with a number month').toBeNull();
  expect.soft(text.match(/\bUTC\b/)?.[0] ?? null, 'ROW-138: the person page shows no UTC time').toBeNull();
  expect.soft(shownDate('2026-12-15').test(text), 'ROW-138: the 15 December 2026 changes are still shown in full').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-138, one format across the pages and the confirmations (slice 1, brief test-author-13)
// ---------------------------------------------------------------------------------------------------

const WEEKDAY_WORDS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SHORT = ['Thurs', 'Tues', 'Thur', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Sept', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD_RE = `(?:${[...WEEKDAY_WORDS, ...WEEKDAY_SHORT].join('|')})`;
const MON_RE = `(?:${[...MONTH_WORDS, ...MONTH_SHORT].join('|')})`;
/** Any date drawn with the month as a word and a year, with the weekday before it when one is drawn. */
const DRAWN_DATE = new RegExp(
  `(?:\\b${WD_RE}\\.?,?\\s+)?(?:\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\.?,?\\s+\\d{4}\\b|\\b${MON_RE}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b)`,
  'gi',
);

/** A drawn date's shape: "Tue 29 Dec 2026" → "Www D MMM YYYY", "December 29, 2026" → "MMMM D, YYYY" (a zero before a day is not told apart). */
function shapeOf(drawn: string): string {
  return drawn
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`\\b(?:${WEEKDAY_WORDS.join('|')})\\b`, 'gi'), 'Wwww')
    .replace(new RegExp(`\\b(?:${WEEKDAY_SHORT.join('|')})\\b`, 'gi'), 'Www')
    .replace(new RegExp(`\\b(?:${MONTH_WORDS.join('|')})\\b`, 'gi'), 'MMMM')
    .replace(new RegExp(`\\b(?:${MONTH_SHORT.join('|')})\\b`, 'gi'), 'MMM')
    .replace(/\b\d{4}\b/g, 'YYYY')
    .replace(/\d{1,2}/g, 'D');
}

/** Every drawn date of a text, as written. */
function drawnDates(text: string): string[] {
  return text.match(DRAWN_DATE) ?? [];
}

const FORMAT_DAY = '2026-12-29'; // a Tuesday

interface FormatWorld {
  team: Team;
  member: Member;
  actor: Actor;
  name: string;
  id: AccountId;
}

/** Auckland, 1 Dec 2026 15:00: a member renamed (one change-history entry) with a pending vacation 29–31 Dec 2026. */
async function formatWorld(): Promise<FormatWorld> {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-01', '15:00') });
  const { member, actor } = await addMember(team, { name: freshName('Ilse'), allowance: 25 });
  const name = freshName('Ilse');
  await rename(team.admin, member.id, name);
  const id = await sendOk(actor, { kind: 'vacation', firstDay: FORMAT_DAY, lastDay: '2026-12-31' });
  return { team, member, actor, name, id };
}

/** Opens `path` as `who` and returns what the page draws once it shows FORMAT_DAY in full (or the bounded wait ran out). */
async function drawnPage(browser: Browser, who: Actor, path: string): Promise<string> {
  const opened = await openPageIn(browser, who, BROWSER);
  const text = await pageTextWhen(opened, path, [shownDate(FORMAT_DAY)]);
  await opened.close();
  return text;
}

/** Opens the pending page as the admin, operates the member's `verb` control and returns the confirmation's text (never confirmed). */
async function drawnPendingConfirmation(browser: Browser, w: FormatWorld, verb: RegExp, what: string): Promise<string> {
  const opened = await openPageIn(browser, w.team.admin, BROWSER);
  await pageTextWhen(opened, PAGES.adminPending, [literally(w.name)]);
  const conf = await openConfirmation(opened.page, actionControl(opened.page, w.name, [], verb), verb, what);
  await opened.close();
  return conf.text;
}

/** Opens the person page as the admin, operates the one visible cancel control and returns the confirmation's text (never confirmed). */
async function drawnCancelConfirmation(browser: Browser, w: FormatWorld, what: string): Promise<string> {
  const opened = await openPageIn(browser, w.team.admin, BROWSER);
  const page = opened.page;
  await pageTextWhen(opened, PAGES.adminPerson(w.member.id), [shownDate(FORMAT_DAY)]);
  const cancel = page.getByRole('button', { name: /cancel/i }).or(page.getByRole('link', { name: /cancel/i })).filter({ visible: true }).first();
  const conf = await openConfirmation(page, cancel, /cancel/i, what);
  await opened.close();
  return conf.text;
}

// ROW-138 promise: ROW-138 "every date the product shows uses ONE unambiguous format with the month as a word, and
// ROW-138   the calendar year"; REQ-006 (the own page's first and last day, and when decided or cancelled), REQ-008 (the
// ROW-138   pending page's first and last day), A-023 (when each change was made), the confirmations of D-029's effect.
// ROW-138 wrong product: the own page draws "29 December 2026" while the pending page, the person page and the
// ROW-138   confirmations draw "Tue 29 Dec 2026"; or the change history draws "December 1, 2026" beside "1 December 2026";
// ROW-138   or a confirmation draws "Tuesday, 29 December 2026" — each page month-as-a-word, but not one format.
// ROW-138 given: Auckland, 1 Dec 2026 15:00; a member renamed once (a change-history entry dated 1 December 2026) with
// ROW-138   a pending vacation Tue 29 – Thu 31 Dec 2026. when: in an en-US Los Angeles browser, the member opens /; the
// ROW-138   admin opens /admin/pending and /admin/people/:id, operates Approve and Reject on the pending page (read, never
// ROW-138   confirmed), then — the request approved through the API — the cancel control on the person page (read, never
// ROW-138   confirmed). then: each of the six draws 29 December 2026 in full; every drawn 29 December 2026 has one shape
// ROW-138   (weekday or none, month full or short, the order and the punctuation) across all six; and every date with the
// ROW-138   month as a word that any of the six draws has that same one shape.
// ROW-138 controls: the control case opens the three pages and the approve confirmation and finds 29 December 2026
// ROW-138   drawn in full on each — the sources are reached and draw the day, untouched by which shape they draw it in.
// ROW-138 technique: one day drawn by every surface that shows it, compared by its drawn shape — the whole set of
// ROW-138   shapes, never one page's — with the change-history date as a second kind of date on the same pages.
// ROW-138 cases: ROW-138 target=ROW-138.one-format.the-same-day-is-drawn-alike-on-every-page-and-confirmation control=ROW-138.control.every-page-and-the-approve-confirmation-draw-the-day
test('ROW-138.control.every-page-and-the-approve-confirmation-draw-the-day', async ({ browser }) => {
  const w = await formatWorld();
  const sources: [string, string][] = [
    ['the own page /', await drawnPage(browser, w.actor, PAGES.home)],
    ['the pending page', await drawnPage(browser, w.team.admin, PAGES.adminPending)],
    ['the person page', await drawnPage(browser, w.team.admin, PAGES.adminPerson(w.member.id))],
    ['the approve confirmation', await drawnPendingConfirmation(browser, w, /approve/i, 'ROW-138 control approve')],
  ];
  for (const [what, text] of sources) {
    expect.soft(shownDate(FORMAT_DAY).test(text), `ROW-138 control: ${what} draws 29 December 2026 in full — it shows: ${JSON.stringify(text.slice(0, 800))}`).toBe(true);
  }
});

test('ROW-138.one-format.the-same-day-is-drawn-alike-on-every-page-and-confirmation', async ({ browser }) => {
  const w = await formatWorld();
  const sources: [string, string][] = [
    ['the own page /', await drawnPage(browser, w.actor, PAGES.home)],
    ['the pending page', await drawnPage(browser, w.team.admin, PAGES.adminPending)],
    ['the person page', await drawnPage(browser, w.team.admin, PAGES.adminPerson(w.member.id))],
    ['the approve confirmation', await drawnPendingConfirmation(browser, w, /approve/i, 'ROW-138 approve')],
    ['the reject confirmation', await drawnPendingConfirmation(browser, w, /reject/i, 'ROW-138 reject')],
  ];
  await approve(w.team.admin, w.id);
  sources.push(['the cancel confirmation', await drawnCancelConfirmation(browser, w, 'ROW-138 cancel')]);

  const dayShapes: Record<string, string[]> = {};
  const allShapes: Record<string, string[]> = {};
  for (const [what, text] of sources) {
    expect.soft(shownDate(FORMAT_DAY).test(text), `ROW-138: ${what} draws 29 December 2026 in full — it shows: ${JSON.stringify(text.slice(0, 800))}`).toBe(true);
    const drawn = drawnDates(text);
    dayShapes[what] = [...new Set(drawn.filter((d) => shownDate(FORMAT_DAY).test(d)).map(shapeOf))];
    allShapes[what] = [...new Set(drawn.map(shapeOf))];
  }
  const daySet = [...new Set(Object.values(dayShapes).flat())];
  expect.soft(daySet.length, `ROW-138: 29 December 2026 is drawn in one shape everywhere — per source: ${JSON.stringify(dayShapes)}`).toBe(1);
  const allSet = [...new Set(Object.values(allShapes).flat())];
  expect.soft(allSet.length, `ROW-138: every date drawn with the month as a word has one shape everywhere — per source: ${JSON.stringify(allShapes)}`).toBe(1);
});

// ---------------------------------------------------------------------------------------------------
// ROW-138, the calendar across New Year (added by test-author pass, slice 1, brief test-author-24)
// ---------------------------------------------------------------------------------------------------

/** The text a page shows and the labels it carries for assistive tech and tooltips (aria-label, title, datetime, data-date). */
async function shownAndLabelled(page: Page): Promise<{ text: string; labels: string }> {
  return page.evaluate(() => {
    const labels: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      for (const a of ['aria-label', 'title', 'datetime', 'data-date']) {
        const v = el.getAttribute(a);
        if (v) labels.push(v);
      }
    }
    return { text: document.body.innerText || '', labels: labels.join(' | ') };
  });
}

const NEW_YEAR_DAYS = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05'];
/** The same day with the other year, as a week-numbering year draws it (US weeks put 27–31 Dec 2026 in 2027; ISO weeks put 1–3 Jan 2027 in 2026). */
function otherYearOf(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  return `${ymd.slice(5, 7) === '12' ? y + 1 : y - 1}${ymd.slice(4)}`;
}
const MONTH_YEAR = (month: string, year: number) => new RegExp(`\\b${month},?\\s+${year}\\b`, 'i');
const NEXT_MONTH = /next|›|»|→|forward|later/i;

// ROW-138 promise: ROW-138 "every date the product shows uses one unambiguous format with the month as a word, and
// ROW-138   the calendar year: 29 to 31 December and 1 to 3 January show the right year"; REQ-012 ("a month calendar for
// ROW-138   any month, moving to the previous and next month; for each Monday to Friday day it lists by name the people
// ROW-138   with an approved request covering that day"); D-044 (the page fetches the shown month and the two
// ROW-138   neighbouring months the Monday-first grid shows).
// ROW-138 wrong product: a calendar whose title or day keys are formatted with a week-numbering year — "YYYY" in
// ROW-138   US weeks makes 29–31 December 2026 belong to 2027, so the December 2026 grid draws 2027's 29–31 December
// ROW-138   (Bo's days, not Ann's); ISO weeks make 1–3 January 2027 belong to 2026, so the January title reads
// ROW-138   "January 2026" and Ann is missing on Friday 1 January; or one that fetches the neighbouring month with the
// ROW-138   wrong year.
// ROW-138 given: Auckland, 1 December 2026 15:00; Ann approved Tue 29 – Thu 31 Dec 2026 and Fri 1 – Mon 4 Jan 2027
// ROW-138   (and 8–9 Dec 2026 for the control); Bo approved Wed 29 – Fri 31 Dec 2027 — the same days a year later, the
// ROW-138   decoy a week-year draws. when: Ann opens /calendar in an en-US Los Angeles browser (the December 2026 view,
// ROW-138   today's month), then operates the next-month control (the January 2027 view). then: the December view's
// ROW-138   title is December 2026, its cells list Ann on 29, 30 and 31 and not on 28, and Bo nowhere; the January
// ROW-138   view's title is January 2027, its cells list Ann on 1 and 4 and not on 5, and Bo nowhere; neither view shows
// ROW-138   or labels any of 28 December 2026 – 5 January 2027 with the other year (as text, a label or a datetime),
// ROW-138   "December 2027" or "January 2026", or a date with a number month.
// ROW-138 controls: the control case opens the December 2026 view and finds its title and Ann on 8 and 9 December,
// ROW-138   mid-month days no week-year moves — the calendar, its cells and their reading work.
// ROW-138 technique: the clock's origin — the days either side of New Year where calendar year and week-year part —
// ROW-138   with the other-year decoy both as data (Bo) and as drawn text; both views, since US and ISO weeks fail on
// ROW-138   opposite sides of 1 January.
// ROW-138 cases: ROW-138 target=ROW-138.calendar.the-new-year-views-draw-each-day-in-its-calendar-year control=ROW-138.control.the-december-calendar-draws-a-mid-month-day
async function newYearCalendar() {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-01', '15:00') });
  const ann = await addMember(team, { name: freshName('Ann'), allowance: 25 });
  const bo = await addMember(team, { name: freshName('Bo'), allowance: 25 });
  await sendApproved(team, ann.actor, { kind: 'vacation', firstDay: '2026-12-08', lastDay: '2026-12-09' });
  await sendApproved(team, ann.actor, { kind: 'vacation', firstDay: '2026-12-29', lastDay: '2026-12-31' });
  await sendApproved(team, ann.actor, { kind: 'vacation', firstDay: '2027-01-01', lastDay: '2027-01-04' });
  await sendApproved(team, bo.actor, { kind: 'vacation', firstDay: '2027-12-29', lastDay: '2027-12-31' });
  return { team, ann, bo };
}

/** Waits (bounded) until the page's text names `monthYear` and `name`, then reads the calendar for `isoMonth`. */
async function calendarView(page: Page, monthYear: RegExp, isoMonth: string, names: string[]) {
  await page
    .waitForFunction(
      ([src, flags, n]) => new RegExp(src, flags).test(document.body.innerText) && document.body.innerText.includes(n),
      [monthYear.source, monthYear.flags, names[0]] as [string, string, string],
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return { cal: await readCalendar(page, isoMonth, names), seen: await shownAndLabelled(page) };
}

test('ROW-138.control.the-december-calendar-draws-a-mid-month-day', async ({ browser }) => {
  const w = await newYearCalendar();
  const opened = await openPageIn(browser, w.ann.actor, BROWSER);
  await opened.page.goto(PAGES.calendar);
  const { cal, seen } = await calendarView(opened.page, MONTH_YEAR('December', 2026), '2026-12', [w.ann.member.name]);
  expect.soft(MONTH_YEAR('December', 2026).test(seen.text), 'ROW-138 control: the calendar opens on December 2026').toBe(true);
  expect.soft(cal.daysOf[w.ann.member.name], `ROW-138 control: Ann is listed on 8 December (cells ${JSON.stringify(cal.cells)})`).toContain(8);
  expect.soft(cal.daysOf[w.ann.member.name], 'ROW-138 control: Ann is listed on 9 December').toContain(9);
});

test('ROW-138.calendar.the-new-year-views-draw-each-day-in-its-calendar-year', async ({ browser }) => {
  const w = await newYearCalendar();
  const ann = w.ann.member.name;
  const bo = w.bo.member.name;
  const opened = await openPageIn(browser, w.ann.actor, BROWSER);
  const page = opened.page;
  await page.goto(PAGES.calendar);

  const views: { label: string; monthYear: RegExp; wrongTitles: RegExp[]; iso: string; ann: number[]; notAnn: number[] }[] = [
    { label: 'December 2026', monthYear: MONTH_YEAR('December', 2026), wrongTitles: [MONTH_YEAR('December', 2027), MONTH_YEAR('January', 2026)], iso: '2026-12', ann: [29, 30, 31], notAnn: [28] },
    { label: 'January 2027', monthYear: MONTH_YEAR('January', 2027), wrongTitles: [MONTH_YEAR('January', 2026), MONTH_YEAR('December', 2027)], iso: '2027-01', ann: [1, 4], notAnn: [5] },
  ];
  for (const [i, v] of views.entries()) {
    if (i > 0) {
      const next = page.getByRole('link', { name: NEXT_MONTH }).or(page.getByRole('button', { name: NEXT_MONTH })).filter({ visible: true }).first();
      await expect(next, 'ROW-138: the calendar offers a next-month control (setup)').toBeVisible({ timeout: 10_000 });
      await next.click();
    }
    const { cal, seen } = await calendarView(page, v.monthYear, v.iso, [ann, bo]);
    const at = `ROW-138 ${v.label} view`;
    const all = `${seen.text} | ${seen.labels}`;
    expect.soft(v.monthYear.test(seen.text), `${at}: the title names ${v.label} — the page shows: ${JSON.stringify(seen.text.slice(0, 600))}`).toBe(true);
    expect.soft(await page.getByRole('heading', { name: v.monthYear }).count(), `${at}: a heading names ${v.label}`).toBeGreaterThan(0);
    for (const wrong of v.wrongTitles) expect.soft(wrong.test(all), `${at}: no ${wrong.source} (a week-numbering year) is shown or labelled`).toBe(false);
    for (const d of v.ann) expect.soft(cal.daysOf[ann], `${at}: Ann is listed on day ${d} (cells ${JSON.stringify(cal.cells)})`).toContain(d);
    for (const d of v.notAnn) expect.soft(cal.daysOf[ann], `${at}: Ann is not listed on day ${d}`).not.toContain(d);
    expect.soft(cal.daysOf[bo], `${at}: Bo (29–31 December 2027) is listed on no day of this view`).toEqual([]);
    expect.soft(seen.text.includes(bo), `${at}: Bo's name is not drawn at all`).toBe(false);
    for (const day of NEW_YEAR_DAYS) {
      const other = otherYearOf(day);
      expect.soft(shownDate(other).test(all), `${at}: ${day} is never shown or labelled with the other year (${other})`).toBe(false);
      expect.soft(seen.labels.includes(other), `${at}: no label or datetime carries ${other}`).toBe(false);
    }
    expect.soft(seen.text.match(NUMERIC_DATE)?.[0] ?? null, `${at}: shows no date with a number month`).toBeNull();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-138, the switch-off confirmation and refusal on 30 December (added by test-author pass, slice 1, brief
// test-author-24)
// ---------------------------------------------------------------------------------------------------

/** What a press of `control` drew: a native dialog's message, the visible dialogs' text and the lines the page gained. */
async function pressAndRead(page: Page, control: Locator): Promise<string> {
  const before = new Set((await page.locator('body').innerText()).split('\n').map((l) => l.trim()).filter(Boolean));
  let native = '';
  page.once('dialog', (d) => {
    native = d.message();
    void d.dismiss().catch(() => undefined);
  });
  const step = page.locator('dialog[open], [role="dialog"], [role="alertdialog"]').filter({ visible: true });
  const changed = async () => native !== '' || (await step.count()) > 0 || (await page.locator('body').innerText()).split('\n').some((l) => l.trim() && !before.has(l.trim()));
  await control.click({ timeout: 10_000 });
  await expect.poll(changed, { timeout: 10_000 }).toBe(true).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const dialogs = (await step.allInnerTexts()).join(' | ');
  const gained = (await page.locator('body').innerText())
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !before.has(l))
    .join(' | ');
  return [native, dialogs, gained].filter(Boolean).join(' | ');
}

const SWITCH_OFF = /switch|turn\s*off|deactivat|disable|\boff\b/i;

/** The days of `days` the text names (in any English rendering) but not in full with the month as a word and its year; [] when none. */
function namedInFull(text: string, days: string[]): string[] {
  return days.filter((d) => hasDate(text, d) && !shownDate(d).test(text));
}

// ROW-138 promise: ROW-138 "every date the product shows uses one unambiguous format with the month as a word, and
// ROW-138   the calendar year: 29 to 31 December and 1 to 3 January show the right year"; REQ-025 ("the admin is asked to
// ROW-138   confirm in a step that names the person, the days and what will change, including which days are cancelled
// ROW-138   and which stay"); REQ-016 / A-033 (switching off is refused while the account holds a pending request with a
// ROW-138   Monday to Friday day before today).
// ROW-138 wrong product: a switch-off confirmation that draws "30 December 2027" (US week-year of 30 Dec 2026) or
// ROW-138   "1 January 2026" (ISO week-year of 1 Jan 2027), the UTC or browser date (29 December) for today's cancel day,
// ROW-138   "12/30/2026" from the browser's en-US locale, or "30 Dec" without a year; a refusal that names the pending
// ROW-138   request's days the same wrong ways.
// ROW-138 given: Auckland; on 1 December 2026 Mona has an approved vacation Mon 28 – Thu 31 Dec 2026 and a pending
// ROW-138   one Fri 1 – Tue 5 Jan 2027, Rhea a pending vacation Tue 29 – Thu 31 Dec 2026; the clock then at Wed 30
// ROW-138   December 2026 09:00 (UTC and the Los Angeles browser still on 29 December). when: the admin, in an en-US Los
// ROW-138   Angeles browser on /admin/people, operates Mona's switch-off control (the confirmation read, never
// ROW-138   confirmed), then Rhea's (whatever it draws read; a confirmation it opens is confirmed, so a refusal made at
// ROW-138   the act is drawn). then: Mona's confirmation shows 30 December 2026 (her first cancelled day) and 1 January
// ROW-138   2027 (her pending request) in full; every one of 28 December 2026 – 5 January 2027 it names, it names in
// ROW-138   full with its own year; it shows none of those days with the other year and no number-month date; Rhea's
// ROW-138   refusal names every one of 29 – 31 December 2026 it names in full, none with the other year, and no
// ROW-138   number-month date.
// ROW-138 controls: the control case shows the confirmation is reached — Mona's control opens a confirmation naming
// ROW-138   her — and here Rhea is still switched on afterwards (she signs in), the press drew something, and what it
// ROW-138   drew names a day of her pending request in some rendering (29 Dec, 12/29 …) — so the refusal was reached and
// ROW-138   its dates are read, never an empty text passing the format checks.
// ROW-138 technique: the clock's origin — the one week whose days split between calendar year and week-year, on
// ROW-138   the day the team, UTC and the browser differ — read on the drawn confirmation and refusal themselves.
// ROW-138 cases: ROW-138 target=ROW-138.switch-off.the-confirmation-and-the-refusal-draw-new-year-days-in-full control=ROW-138.control.the-switch-off-confirmation-names-the-person
async function newYearSwitchOff() {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2026-12-01', '15:00') });
  const mona = await addMember(team, { name: freshName('Mona'), allowance: 25 });
  const rhea = await addMember(team, { name: freshName('Rhea'), allowance: 25 });
  await sendApproved(team, mona.actor, { kind: 'vacation', firstDay: '2026-12-28', lastDay: '2026-12-31' });
  await sendOk(mona.actor, { kind: 'vacation', firstDay: '2027-01-01', lastDay: '2027-01-05' });
  await sendOk(rhea.actor, { kind: 'vacation', firstDay: '2026-12-29', lastDay: '2026-12-31' });
  const now = await setTeamClock(AUCKLAND, '2026-12-30', '09:00');
  expect(utcDateOf(now) === '2026-12-29' && teamDateOf(LOS_ANGELES, now) === '2026-12-29', 'ROW-138 setup: UTC and the browser are still on 29 December 2026').toBe(true);
  return { team, mona: mona.member, rhea: rhea.member };
}

async function monaConfirmation(browser: Browser, w: Awaited<ReturnType<typeof newYearSwitchOff>>, what: string): Promise<string> {
  const opened = await openPageIn(browser, w.team.admin, BROWSER);
  await pageTextWhen(opened, PAGES.adminPeople, [literally(w.mona.name), literally(w.rhea.name)]);
  const control = actionControl(opened.page, w.mona.name, [w.rhea.name, w.team.install.admin.name], SWITCH_OFF);
  const conf = await openConfirmation(opened.page, control, /switch off|turn off|deactivat|disable|confirm/i, what);
  await opened.close();
  return conf.text;
}

test('ROW-138.control.the-switch-off-confirmation-names-the-person', async ({ browser }) => {
  const w = await newYearSwitchOff();
  const text = await monaConfirmation(browser, w, 'ROW-138 control switch off');
  expect(text.includes(w.mona.name), `ROW-138 control: Mona's switch-off confirmation names her — it shows: ${JSON.stringify(text.slice(0, 800))}`).toBe(true);
});

test('ROW-138.switch-off.the-confirmation-and-the-refusal-draw-new-year-days-in-full', async ({ browser }) => {
  const w = await newYearSwitchOff();
  const conf = await monaConfirmation(browser, w, 'ROW-138 switch off');
  const c = `ROW-138 Mona's switch-off confirmation — it shows: ${JSON.stringify(conf.slice(0, 800))}`;
  expect.soft(shownDate('2026-12-30').test(conf), `${c}: 30 December 2026, her first cancelled day, in full`).toBe(true);
  expect.soft(shownDate('2027-01-01').test(conf), `${c}: 1 January 2027, her pending request, in full`).toBe(true);
  expect.soft(namedInFull(conf, NEW_YEAR_DAYS), `${c}: every day it names it names in full with its year`).toEqual([]);
  for (const day of NEW_YEAR_DAYS) expect.soft(shownDate(otherYearOf(day)).test(conf), `${c}: ${day} is not shown as ${otherYearOf(day)}`).toBe(false);
  expect.soft(conf.match(NUMERIC_DATE)?.[0] ?? null, `${c}: no date with a number month`).toBeNull();

  const opened = await openPageIn(browser, w.team.admin, BROWSER);
  const page = opened.page;
  await pageTextWhen(opened, PAGES.adminPeople, [literally(w.rhea.name)]);
  let refusal = await pressAndRead(page, actionControl(page, w.rhea.name, [w.mona.name, w.team.install.admin.name], SWITCH_OFF));
  const confirmBtn = page
    .locator('dialog[open], [role="dialog"], [role="alertdialog"]')
    .filter({ visible: true })
    .getByRole('button', { name: /^\s*(confirm|yes|ok|switch off|turn off)\b/i })
    .first();
  if ((await confirmBtn.count()) > 0) refusal += ' | ' + (await pressAndRead(page, confirmBtn));
  await opened.close();
  expect(await canSignIn(w.rhea.email, w.rhea.password), 'ROW-138 control: Rhea is still switched on (the switch-off was refused)').toBe(true);
  expect(refusal.trim().length, 'ROW-138 control: the press on Rhea drew something').toBeGreaterThan(0);
  test.info().annotations.push({ type: 'ROW-138 refusal drawn', description: refusal.slice(0, 800) }, { type: 'ROW-138 confirmation drawn', description: conf.slice(0, 800) });
  const r = `ROW-138 Rhea's switch-off refusal — it shows: ${JSON.stringify(refusal.slice(0, 800))}`;
  const rheaDays = ['2026-12-29', '2026-12-30', '2026-12-31'];
  expect(rheaDays.some((d) => hasDate(refusal, d)), `ROW-138 control: the refusal names a day of Rhea's pending request (in any rendering), so its format is read — it shows: ${JSON.stringify(refusal.slice(0, 800))}`).toBe(true);
  expect.soft(namedInFull(refusal, rheaDays), `${r}: every day it names it names in full with its year`).toEqual([]);
  for (const day of rheaDays) expect.soft(shownDate(otherYearOf(day)).test(refusal), `${r}: ${day} is not shown as ${otherYearOf(day)}`).toBe(false);
  expect.soft(refusal.match(NUMERIC_DATE)?.[0] ?? null, `${r}: no date with a number month`).toBeNull();
});

// ---------------------------------------------------------------------------------------------------
// ROW-139 promise: REQ-006 (the own page shows who decided each request and when, who cancelled it and when; newest
// ROW-139   first), REQ-008 (the pending page oldest first) and REQ-017 (when it was sent, decided, cancelled): those
// ROW-139   times show the team-zone date, and lists sort them by the true moment, including across a fall-back.
// ROW-139 wrong product: one that stores or sorts the team's wall-clock time ("2027-04-04 02:30") instead of the
// ROW-139   instant — after Auckland's clocks go back at 03:00 on 4 April 2027, a request sent at 02:10 standard time sorts
// ROW-139   before one sent 40 minutes earlier at 02:30 summer time; or one that shows the UTC (or browser) date of a time,
// ROW-139   the day before in Auckland after midnight.
// ROW-139 given (sort): three requests sent at 13:30Z (02:30 NZDT), 13:50Z (02:50 NZDT) and 14:10Z (02:10 NZST) on 3
// ROW-139   April UTC — true order A, C, B; wall-clock order B, A, C. when: the lists and pages are read. then: the pending
// ROW-139   list and page are A, C, B (oldest first) and the own list and page B, C, A (newest first); the sent date shown
// ROW-139   is 4 April 2027, never 3 April. given (dates): a request sent Mon 15 Feb 00:30, approved Wed 17 Feb 00:30
// ROW-139   and cancelled Fri 19 Feb 00:30 Auckland time (UTC 14, 16, 18 Feb). then: the own page and the person page
// ROW-139   show 15, 17 and 19 February 2027 and none of 14, 16, 18 February 2027.
// ROW-139 controls: the control case sends three requests hours apart on an ordinary day: the pending list is in
// ROW-139   sending order and the own list reversed — the lists and their reading work, untouched by a fall-back fault.
// ROW-139 technique: the clock's origin — instants inside the repeated hour of a fall-back, chosen so wall-clock and
// ROW-139   true order differ — the whole list compared, never a part; decoy dates one day off for every time shown.
// ROW-139 cases: ROW-139 target=ROW-139.REQ-008.lists-sort-by-the-true-moment-across-fall-back control=ROW-139.control.three-requests-hours-apart-are-in-order
function ids(records: Rec[]): string[] {
  return records.map((r) => String(r.id));
}

test('ROW-139.control.three-requests-hours-apart-are-in-order', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-08', '09:00') });
  const { actor } = await addMember(team);
  const sent: AccountId[] = [];
  for (const [time, day] of [['09:00', '2027-04-12'], ['11:00', '2027-04-13'], ['13:00', '2027-04-14']]) {
    await setTeamClock(AUCKLAND, '2027-03-08', time);
    sent.push(await sendOk(actor, { kind: 'vacation', firstDay: day, lastDay: day }));
  }
  expect(ids(await pendingRecords(team.admin)), 'ROW-139 control: the pending list is oldest first').toEqual(sent.map(String));
  expect(ids(await ownRecords(actor)), 'ROW-139 control: the own list is newest first').toEqual([...sent].reverse().map(String));
});

test('ROW-139.REQ-008.lists-sort-by-the-true-moment-across-fall-back', async ({ browser }) => {
  const plan: [string, string, string, string][] = [
    ['A', '2027-04-03T13:30:00.000Z', '02:30', '2027-04-12'],
    ['C', '2027-04-03T13:50:00.000Z', '02:50', '2027-04-13'],
    ['B', '2027-04-03T14:10:00.000Z', '02:10', '2027-04-14'],
  ];
  for (const [label, iso, wall] of plan) {
    expect(teamDateOf(AUCKLAND, iso) === '2027-04-04' && teamTimeOf(AUCKLAND, iso) === wall, `ROW-139 setup: ${label} at ${iso} reads 4 April ${wall} in Auckland`).toBe(true);
  }
  const team = await startTeam({ zone: AUCKLAND, now: plan[0][1] });
  const { actor } = await addMember(team);
  const sent: Record<string, string> = {};
  for (const [label, iso, , day] of plan) {
    await setClock(iso);
    sent[label] = String(await sendOk(actor, { kind: 'vacation', firstDay: day, lastDay: day }));
  }
  expect.soft(ids(await pendingRecords(team.admin)), 'ROW-139: the pending list is A, C, B — oldest first by the true moment').toEqual([sent.A, sent.C, sent.B]);
  expect.soft(ids(await ownRecords(actor)), 'ROW-139: the own list is B, C, A — newest first by the true moment').toEqual([sent.B, sent.C, sent.A]);

  const day = Object.fromEntries(plan.map(([label, , , d]) => [label, d]));
  const at = (text: string, label: string) => text.search(shownDate(day[label]));
  const pending = await openPageIn(browser, team.admin, BROWSER);
  const pText = await pageTextWhen(pending, PAGES.adminPending, plan.map(([, , , d]) => shownDate(d)));
  expect.soft(at(pText, 'A') >= 0 && at(pText, 'A') < at(pText, 'C') && at(pText, 'C') < at(pText, 'B'), 'ROW-139: the pending page shows A, C, B in that order').toBe(true);
  const own = await openPageIn(browser, actor, BROWSER);
  const oText = await pageTextWhen(own, PAGES.home, plan.map(([, , , d]) => shownDate(d)));
  expect.soft(at(oText, 'B') >= 0 && at(oText, 'B') < at(oText, 'C') && at(oText, 'C') < at(oText, 'A'), 'ROW-139: the own page shows B, C, A in that order').toBe(true);
  expect.soft(shownDate('2027-04-04').test(oText), 'ROW-139: the sent date shown is 4 April 2027, the team date').toBe(true);
  expect.soft(shownDate('2027-04-03').test(oText), 'ROW-139: 3 April 2027, the UTC and browser date, is not shown').toBe(false);
});

test('ROW-139.REQ-006.sent-decided-cancelled-show-the-team-date', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-02-15', '00:30') });
  const { member, actor } = await addMember(team);
  const id = await sendOk(actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  await setTeamClock(AUCKLAND, '2027-02-17', '00:30');
  await approve(team.admin, id);
  await setTeamClock(AUCKLAND, '2027-02-19', '00:30');
  await adminCancel(team.admin, id);

  const shown = ['2027-02-15', '2027-02-17', '2027-02-19'];
  const decoys = ['2027-02-14', '2027-02-16', '2027-02-18'];
  for (const [path, who] of [
    [PAGES.home, actor],
    [PAGES.adminPerson(member.id), team.admin],
  ] as [string, Parameters<typeof openPageIn>[1]][]) {
    const opened = await openPageIn(browser, who, BROWSER);
    const text = await pageTextWhen(opened, path, shown.map(shownDate));
    expect.soft(shownDate('2027-02-15').test(text), `ROW-139 ${path}: sent on 15 February 2027 (team date)`).toBe(true);
    expect.soft(shownDate('2027-02-17').test(text), `ROW-139 ${path}: decided on 17 February 2027 (team date)`).toBe(true);
    expect.soft(shownDate('2027-02-19').test(text), `ROW-139 ${path}: cancelled on 19 February 2027 (team date)`).toBe(true);
    for (const d of decoys) expect.soft(shownDate(d).test(text), `ROW-139 ${path}: ${d}, a UTC or browser date, is not shown`).toBe(false);
    await opened.close();
  }
});
