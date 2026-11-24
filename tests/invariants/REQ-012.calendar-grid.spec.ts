// Purpose: ledger tests for ROW-212 and ROW-213 (REQ-012) — the calendar opens on the team's current month and marks today, every day sits under its true weekday heading in every month, neighbouring-month days are never blank when someone is away, a request spanning a whole middle month shows in it; a malformed address gives an orderly page and December moves on to January of the next year.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, accounts, sick requests, approvals), fresh per run.
//
// Boundary (R6): the grid — headings, today's mark, months and navigation — is paint and operation, proved in the
// browser on /calendar; the spanning request is also read at the HTTP harness (GET /api/calendar, D-029/D-027).
// The grid is read as painted (robustness.ts readGrid): dated cells (data-date or time[datetime]) and weekday headings
// by their boxes; a cell is "under" the headings whose horizontal span holds its centre and that end above it.
// The weekday oracle is plain UTC date arithmetic on YYYY-MM-DD, the test's own.
import { test, expect, type Page } from '@playwright/test';
import { approve, createMember, openPage, sendRequest, signInMember, type Actor, type Member } from './harness';
import {
  datesOfMonth,
  dayOfWeek,
  disposeAll,
  freshTeam,
  isWeekday,
  keep,
  moveMonth,
  readGrid,
  settle,
  shownMonth,
  textLines,
  ZONE,
  type GridCell,
  type GridHeading,
} from './robustness';

test.afterEach(disposeAll);

/** Problems with one month as the grid paints it: missing days, days under no or the wrong heading. */
function monthProblems(month: string, grid: { cells: GridCell[]; headings: GridHeading[] }): string[] {
  const [y, m] = month.split('-').map(Number);
  const weekend = grid.headings.some((h) => h.weekday === 0 || h.weekday === 6);
  const expected = datesOfMonth(y, m).filter((d) => weekend || isWeekday(d));
  const shown = new Map(grid.cells.filter((c) => c.date.startsWith(month)).map((c) => [c.date, c]));
  const out: string[] = [];
  for (const d of expected) if (!shown.has(d)) out.push(`${d} missing`);
  for (const [d, c] of shown) {
    const above = new Set(grid.headings.filter((h) => c.cx >= h.left - 1 && c.cx <= h.right + 1 && h.bottom <= c.top + 2).map((h) => h.weekday));
    if (above.size === 0) out.push(`${d} under no weekday heading`);
    else if (above.size !== 1 || !above.has(dayOfWeek(d))) out.push(`${d} (weekday ${dayOfWeek(d)}) under heading ${[...above].join('/')}`);
  }
  return out;
}

function cellText(grid: { cells: GridCell[] }, date: string): string | null {
  const c = grid.cells.find((x) => x.date === date);
  return c ? c.text : null;
}

async function awaySick(admin: Actor, firstDay: string, lastDay: string): Promise<Member> {
  const m = await createMember(admin);
  const actor = keep(await signInMember(m));
  await approve(admin, await sendRequest(actor, { kind: 'sick', firstDay, lastDay }));
  return m;
}

// ---------------------------------------------------------------------------------------------------
// ROW-212 promise: the row — the calendar opens on the current month in the team zone and marks today; every
// ROW-212   weekday sits under its true heading in every month; months needing six week rows and February in leap
// ROW-212   years are complete; neighbouring-month days shown in the grid are never blank when someone is away; a
// ROW-212   request spanning a whole middle month shows in it. REQ-012 (any month, previous and next; each weekday
// ROW-212   lists by name the people with an approved request covering it). D-007 (today is the team zone's).
// ROW-212 wrong product: a grid that starts every month in the first column (or offsets by getDay() for a Monday-
// ROW-212   first header), so 1 Mar 2027 (a Monday) sits under Sunday; a 5-row grid that drops 30-31 Aug 2027; a month
// ROW-212   built from "first or last day in this month", so a request from 28 May to 1 Jul never shows in June; a grid
// ROW-212   that draws other months' days as empty fillers; today taken from the browser's or the server's UTC date.
// ROW-212 given: the team clock at 2027-02-28T12:00Z, which is Mon 1 Mar 2027 01:00 in Pacific/Auckland (still
// ROW-212   28 Feb in UTC); member N away (approved sick) on Wed 31 Mar 2027; member S away (approved sick) Fri 28 May to
// ROW-212   Thu 1 Jul 2027; viewer V. when: V opens /calendar and presses Next eleven times (April 2027 .. February 2028).
// ROW-212   then: it opens on March 2027 with exactly 1 March marked today; in each of the twelve months every day
// ROW-212   (every weekday when the grid has no weekend columns) is shown and under its own weekday's heading — August
// ROW-212   2027 needs six Monday-first rows, February 2028 has 29 days; 31 March shows N in March, and in April when
// ROW-212   the grid shows it; every weekday of June 2027 shows S, in the page and in GET /api/calendar.
// ROW-212 controls: the control case shows /calendar answering 200 for V with dated cells, and GET /api/calendar
// ROW-212   listing N on 31 March — the fixture and the reading of the grid work.
// ROW-212 technique: the clock's origin (an instant where the team date and month differ from UTC's), twelve
// ROW-212   consecutive months against an independent weekday oracle, and the row's own examples (six rows, a leap
// ROW-212   February, a neighbouring day, a whole middle month).
// ROW-212 cases: ROW-212 target=ROW-212.REQ-012.the-grid-is-true-for-twelve-months-from-the-team-zone-today control=ROW-212.control.the-calendar-answers-with-dated-cells
const T_MAR01 = '2027-02-28T12:00:00Z';

test('ROW-212.control.the-calendar-answers-with-dated-cells', async ({ browser }) => {
  const { admin } = await freshTeam({ now: T_MAR01, timeZone: ZONE });
  const n = await awaySick(admin, '2027-03-31', '2027-03-31');
  const v = keep(await signInMember(await createMember(admin)));
  const cal = (await (await v.api.get('/api/calendar?year=2027&month=3')).json()) as { days?: { date: string; people?: { name: string }[] }[] };
  expect((cal.days ?? []).find((d) => d.date === '2027-03-31')?.people?.map((p) => p.name), 'ROW-212 control: N is away on 31 March').toContain(n.name);
  const opened = await openPage(browser, v);
  try {
    const r = await opened.page.goto('/calendar');
    await settle(opened.page);
    expect(r?.status(), 'ROW-212 control: /calendar answers 200').toBe(200);
    expect((await readGrid(opened.page)).cells.length, 'ROW-212 control: the grid has dated cells').toBeGreaterThan(0);
  } finally {
    await opened.close();
  }
});

test('ROW-212.REQ-012.the-grid-is-true-for-twelve-months-from-the-team-zone-today', async ({ browser }) => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam({ now: T_MAR01, timeZone: ZONE });
  const n = await awaySick(admin, '2027-03-31', '2027-03-31');
  const s = await awaySick(admin, '2027-05-28', '2027-07-01');
  const v = keep(await signInMember(await createMember(admin)));

  const june = (await (await v.api.get('/api/calendar?year=2027&month=6')).json()) as { days?: { date: string; people?: { name: string }[] }[] };
  const juneWeekdays = datesOfMonth(2027, 6).filter(isWeekday);
  const apiMissing = juneWeekdays.filter((d) => !(june.days ?? []).find((x) => x.date === d)?.people?.some((p) => p.name === s.name));
  expect.soft(apiMissing, 'ROW-212 GET /api/calendar June 2027: S on every weekday').toEqual([]);

  const opened = await openPage(browser, v);
  const page: Page = opened.page;
  try {
    await page.goto('/calendar');
    await settle(page);
    let grid = await readGrid(page);
    expect.soft(shownMonth(grid.cells), 'ROW-212: the calendar opens on the team zone\'s month, March 2027').toBe('2027-03');
    expect.soft(grid.cells.filter((c) => c.today).map((c) => c.date), 'ROW-212: exactly 1 March 2027 is marked today').toEqual(['2027-03-01']);
    expect.soft(monthProblems('2027-03', grid), 'ROW-212 March 2027: every day under its true heading').toEqual([]);
    expect.soft(cellText(grid, '2027-03-31') ?? '', 'ROW-212 March 2027: N shows on 31 March').toContain(n.name);

    const months = ['2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12', '2028-01', '2028-02'];
    for (const month of months) {
      const shown = await moveMonth(page, 'next', month);
      expect(shown, `ROW-212: Next reaches ${month}`).toBe(month);
      grid = await readGrid(page);
      expect.soft(monthProblems(month, grid), `ROW-212 ${month}: every day shown, under its true heading`).toEqual([]);
      if (month === '2027-04') {
        const neighbour = cellText(grid, '2027-03-31');
        if (neighbour !== null) expect.soft(neighbour, 'ROW-212 April 2027: the shown 31 March is not blank — N shows').toContain(n.name);
      }
      if (month === '2027-06') {
        const blank = juneWeekdays.filter((d) => !(cellText(grid, d) ?? '').includes(s.name));
        expect.soft(blank, 'ROW-212 June 2027: S shows on every weekday of the whole middle month').toEqual([]);
      }
      if (month === '2027-08') {
        expect.soft(grid.cells.filter((c) => c.date.startsWith('2027-08')).map((c) => c.date), 'ROW-212 August 2027 (six Monday-first rows): 30 and 31 August shown').toEqual(
          expect.arrayContaining(['2027-08-30', '2027-08-31']),
        );
      }
      if (month === '2028-02') {
        expect.soft(grid.cells.some((c) => c.date === '2028-02-29'), 'ROW-212 February 2028 (leap): 29 February shown').toBe(true);
      }
    }
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-213 promise: the row — a malformed or out-of-range month or year in the calendar address gives an orderly
// ROW-213   page, and moving on from December reaches January of the next year; REQ-012 (any month, previous and next).
// ROW-213 wrong product: a page that does new Date(year, month) on the raw query — "NaN", "Invalid Date", a blank
// ROW-213   grid or a 500 with a stack for ?month=13 or ?year=abc; a Next that sets month+1 without carrying the year,
// ROW-213   showing "13/2027" or January 2027 after December 2027.
// ROW-213 given: the team clock at Mon 15 Nov 2027 09:00 in Pacific/Auckland; member D away (approved sick) on Tue
// ROW-213   4 Jan 2028; viewer V. when: V opens /calendar and presses Next twice; and V opens /calendar with each
// ROW-213   malformed address (month 13, 0, -1, abc, 1.5, empty; year abc, 0, -5, 99999, 2027.5, 1e309, a NUL; a
// ROW-213   script tag) and GET /api/calendar with the same values. then: November, December 2027, then January 2028 are
// ROW-213   shown, D on 4 January, the page naming January and 2028; every malformed address answers below 500 with no
// ROW-213   uncaught page error, some text, and none of NaN, undefined, [object Object], Invalid Date or a stack line;
// ROW-213   the API answers below 500.
// ROW-213 controls: the control case opens /calendar?year=2027&month=12 and gets 200 with December 2027 shown —
// ROW-213   the address reading works, so the malformed values reach the month code.
// ROW-213 technique: values just beyond each edge (0, 13, -1) and of the wrong type, and the year boundary itself
// ROW-213   operated with the page's own Next control, checked by an away day that exists only in January 2028.
// ROW-213 cases: ROW-213 target=ROW-213.REQ-012.malformed-addresses-are-orderly-and-december-moves-to-next-january control=ROW-213.control.a-well-formed-december-address-shows-december
const T_NOV15 = '2027-11-14T20:00:00Z';
const DISORDER = /\b(NaN|undefined)\b|\[object Object\]|Invalid Date|^\s*at\s+\S+.*:\d+:\d+/m;

test('ROW-213.control.a-well-formed-december-address-shows-december', async ({ browser }) => {
  const { admin } = await freshTeam({ now: T_NOV15, timeZone: ZONE });
  const v = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, v);
  try {
    const r = await opened.page.goto('/calendar?year=2027&month=12');
    await settle(opened.page);
    expect(r?.status(), 'ROW-213 control: the address answers 200').toBe(200);
    expect(shownMonth((await readGrid(opened.page)).cells), 'ROW-213 control: December 2027 is shown').toBe('2027-12');
  } finally {
    await opened.close();
  }
});

test('ROW-213.REQ-012.malformed-addresses-are-orderly-and-december-moves-to-next-january', async ({ browser }) => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam({ now: T_NOV15, timeZone: ZONE });
  const d = await awaySick(admin, '2028-01-04', '2028-01-04');
  const v = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, v);
  const page = opened.page;
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto('/calendar');
    await settle(page);
    expect.soft(shownMonth((await readGrid(page)).cells), 'ROW-213: opens on November 2027').toBe('2027-11');
    expect.soft(await moveMonth(page, 'next', '2027-12'), 'ROW-213: Next reaches December 2027').toBe('2027-12');
    expect.soft(await moveMonth(page, 'next', '2028-01'), 'ROW-213: Next from December reaches January 2028').toBe('2028-01');
    const grid = await readGrid(page);
    expect.soft(cellText(grid, '2028-01-04') ?? '', 'ROW-213 January 2028: D shows on 4 January').toContain(d.name);
    const text = (await textLines(page)).join('\n');
    expect.soft(/January/i.test(text) && /2028/.test(text), 'ROW-213 January 2028: the page names January 2028').toBe(true);

    const bad: [string, string][] = [
      ['2027', '13'], ['2027', '0'], ['2027', '-1'], ['2027', 'abc'], ['2027', '1.5'], ['2027', ''],
      ['abc', '5'], ['0', '5'], ['-5', '5'], ['99999', '5'], ['2027.5', '5'], ['1e309', '5'], ['%00', '5'],
      ['2027', '%3Cscript%3Ealert(1)%3C%2Fscript%3E'],
    ];
    for (const [year, month] of bad) {
      const addr = `/calendar?year=${year}&month=${month}`;
      const errorsBefore = pageErrors.length;
      const r = await page.goto(addr);
      await settle(page);
      const lines = await textLines(page);
      expect.soft(r?.status() ?? 0, `ROW-213 ${addr}: answers below 500`).toBeLessThan(500);
      expect.soft(pageErrors.slice(errorsBefore), `ROW-213 ${addr}: no uncaught page error`).toEqual([]);
      expect.soft(lines.length, `ROW-213 ${addr}: the page shows something`).toBeGreaterThan(0);
      expect.soft(lines.filter((l) => DISORDER.test(l)), `ROW-213 ${addr}: no NaN, undefined, Invalid Date or stack`).toEqual([]);
      const api = await v.api.get(`/api/calendar?year=${year}&month=${month}`);
      expect.soft(api.status(), `ROW-213 GET /api/calendar?year=${year}&month=${month}: answers below 500`).toBeLessThan(500);
    }
  } finally {
    await opened.close();
  }
});
