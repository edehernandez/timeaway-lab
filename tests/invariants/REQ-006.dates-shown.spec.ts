// Purpose: ledger tests for ROW-138 and ROW-139 (REQ-006, REQ-008, REQ-012, REQ-017) — every date shown uses one unambiguous format with the month as a word and the calendar year (29 to 31 December, 1 to 3 January), and sent, decided and cancelled times show the team-zone date and sort by the true moment across a daylight-saving fall-back.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; instants worked out and checked by the tests' own Intl oracle.
//
// Boundary (R6): what a date LOOKS like is paint — read in the browser on the person's own requests page "/", the
// admin's pending page and the admin's person page (D-029), opened in America/Los_Angeles with the en-US locale, so a
// page that formats with the browser's locale or zone is caught. The order of a list is behaviour, proved at the HTTP
// harness on the lists that are the pages' data (GET /api/requests, GET /api/admin/pending) and again on the pages.
// A date "shown in full" is the day, the month as a word and the year together (team-calendar.ts shownDate); a page
// that drops the year or the month from one end of a range does not show that date in the format.
import { test, expect } from '@playwright/test';
import { adminCancel, approve, PAGES, setClock, type AccountId } from './harness';
import {
  addMember,
  AUCKLAND,
  dateOrders,
  disposeAll,
  LOS_ANGELES,
  NUMERIC_DATE,
  openPageIn,
  ownRecords,
  pageTextWhen,
  pendingRecords,
  sendOk,
  setTeamClock,
  shownDate,
  startTeam,
  teamDateOf,
  teamInstant,
  teamTimeOf,
  type Rec,
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
