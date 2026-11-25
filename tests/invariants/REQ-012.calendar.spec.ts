// Purpose: ledger tests for ROW-058..ROW-062 (REQ-012) — the month calendar: any month opens, every approved weekday of every person is listed by name, nothing pending, rejected or cancelled, no one on a Saturday or Sunday, and a switched-off account's past approved days stay.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions), fresh per run.
//
// Boundary (R6): these are rules about what the calendar lists, proved at the HTTP harness through D-029's
// GET /api/calendar?year&month {days:[{date,people:[{name,accountId}]}]}, read on a plain member's session (the
// rows' actor). This client reads `month` as 1..12; every answer is checked to hold that month's dates, so a
// different reading fails naming the month asked. People are matched by their fresh display name (D-027: the
// calendar sends the name; accountId is optional). Weekdays are computed by this file from the date alone.
// Time: every case sets the team clock through the harness with the team zone Pacific/Auckland, at an instant
// where UTC is still on the day before (BASELINE "Test environment"); the machine's clock is never read.
// Slice 1, brief test-author-11 (lesson L-1): a page case pair for each of ROW-058..ROW-062 added at the end — /calendar
// opened in the browser, Previous and Next operated across years, the drawn day cells read; every data case kept.
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  openPage,
  PAGES,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Install,
  type Member,
  type Opened,
} from './harness';
import { moveMonth, readGrid, settle, shownMonth, type GridCell } from './robustness';

// Team-zone mornings (Pacific/Auckland), each at an instant whose UTC date is the day before.
const T_JAN11 = '2027-01-10T20:00:00Z'; // Mon 2027-01-11 09:00 NZDT
const T_FEB24 = '2027-02-23T20:00:00Z'; // Wed 2027-02-24 09:00 NZDT
const T_MAR03 = '2027-03-02T20:00:00Z'; // Wed 2027-03-03 09:00 NZDT
const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 NZDT
const T_MAR10 = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 NZDT
const T_APR21 = '2027-04-20T20:00:00Z'; // Wed 2027-04-21 08:00 NZST
const T_2029_MAR14 = '2029-03-13T20:00:00Z'; // Wed 2029-03-14 09:00 NZDT

const actors: Actor[] = [];
async function track(p: Promise<Actor>): Promise<Actor> {
  const a = await p;
  actors.push(a);
  return a;
}
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface Person {
  m: Member;
  a: Actor;
}
interface Team {
  install: Install;
  admin: Actor;
  viewerMember: Member;
  viewer: Actor;
}

async function start(now: string): Promise<Team> {
  const install = await resetProduct({ now, timeZone: DEFAULT_TIME_ZONE });
  const admin = await track(signIn(install.admin));
  const viewerMember = await createMember(admin, { name: freshName('Viewer') });
  const viewer = await track(signInMember(viewerMember));
  return { install, admin, viewerMember, viewer };
}

async function person(admin: Actor, label: string): Promise<Person> {
  const m = await createMember(admin, { name: freshName(label) });
  return { m, a: await track(signInMember(m)) };
}

type CalendarPerson = { name?: unknown; accountId?: unknown };
type CalendarDay = { date?: unknown; people?: unknown };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Every Monday-to-Friday date of the month, computed from the calendar alone. */
function weekdaysOf(year: number, month: number): string[] {
  const out: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const t = new Date(Date.UTC(year, month - 1, d));
    if (t.getUTCMonth() !== month - 1) break;
    const dow = t.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(`${year}-${pad(month)}-${pad(d)}`);
  }
  return out;
}

function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function peopleOf(day: CalendarDay): CalendarPerson[] {
  return Array.isArray(day.people) ? (day.people as CalendarPerson[]) : [];
}

/** The calendar's answer for a month, read on `viewer`'s session; the status is asserted 200 naming the row. */
async function monthView(viewer: Actor, year: number, month: number, row: string): Promise<CalendarDay[]> {
  const res = await viewer.api.get(`/api/calendar?year=${year}&month=${month}`);
  expect(res.status(), `${row}: GET /api/calendar?year=${year}&month=${month} answers the signed-in member`).toBe(200);
  const body = await res.json().catch(() => null);
  expect(Array.isArray(body?.days), `${row}: the calendar for ${year}-${pad(month)} carries a days list`).toBe(true);
  return body.days as CalendarDay[];
}

/** The month's answer covers exactly that month's weekdays, once each, and no date of another month. */
function expectMonth(days: CalendarDay[], year: number, month: number, row: string): void {
  const prefix = `${year}-${pad(month)}-`;
  const dates = days.map((d) => String(d.date));
  expect.soft(dates.filter((d) => !d.startsWith(prefix)), `${row}: ${year}-${pad(month)} lists no date of another month`).toEqual([]);
  expect.soft(dates.length, `${row}: ${year}-${pad(month)} lists each date once`).toBe(new Set(dates).size);
  const weekdays = [...new Set(dates.filter((d) => d.startsWith(prefix) && !isWeekend(d)))].sort();
  expect.soft(weekdays, `${row}: ${year}-${pad(month)} lists every Monday to Friday of the month`).toEqual(weekdaysOf(year, month));
}

/** The dates on which `name` is listed, sorted. */
function awayDates(days: CalendarDay[], name: string): string[] {
  return days
    .filter((d) => peopleOf(d).some((p) => p?.name === name))
    .map((d) => String(d.date))
    .sort();
}

const MAR_8_12 = ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'];
const MAR_15_19 = ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19'];

// ---------------------------------------------------------------------------------------------------
// ROW-058 promise: REQ-012 fail-if (1) "a signed-in person cannot open the calendar or move to another month";
// ROW-058   REQ-012 "for any month, moving to the previous and next month". The row's cases: a month two years
// ROW-058   back and a month beyond next year both open.
// ROW-058 wrong product: a calendar that answers only the current and next year (the request window of REQ-004
// ROW-058   reused as the calendar's range), refusing or emptying 2027-03 seen from 2029 and 2029 months seen from
// ROW-058   2027; or one that ignores `year` and draws March 2027's absences on March 2029.
// ROW-058 given: member Away has an approved request on Mon 2027-03-08..Fri 2027-03-12, made at 2027-02-24.
// ROW-058   when: a plain member asks for 2029-01..2029-04 at 2027-02-24 (beyond next year, 2028), then for
// ROW-058   2027-01..2027-04 after the clock moves to 2029-03-14 (two years back), each with its previous and next
// ROW-058   month. then: each answers 200 with exactly that month's weekdays; Away is listed on exactly
// ROW-058   2027-03-08..12 in 2027-03, and on no day of 2029-03 (same month number, the decoy) nor of any other month.
// ROW-058 controls: the control case opens this month, the next month (Away shown), the previous month and the
// ROW-058   one across the year boundary (2026-12), at today — the route and the data work before the far months.
// ROW-058 technique: the clock's origin moved forward (a real past month with real data) and values either side of
// ROW-058   the request window (next year +1); a decoy month with the same month number in another year.
// ROW-058 cases: ROW-058 target=ROW-058.REQ-012.a-month-two-years-back-and-one-beyond-next-year-open control=ROW-058.control.this-month-its-neighbours-and-across-the-year-open
test('ROW-058.control.this-month-its-neighbours-and-across-the-year-open', async () => {
  const { admin, viewer } = await start(T_FEB24);
  const away = await person(admin, 'Away');
  await approve(admin, await sendRequest(away.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));
  for (const [y, m] of [
    [2027, 2],
    [2027, 1],
    [2026, 12],
  ] as const) {
    const days = await monthView(viewer, y, m, 'ROW-058 control');
    expectMonth(days, y, m, 'ROW-058 control');
  }
  const march = await monthView(viewer, 2027, 3, 'ROW-058 control');
  expectMonth(march, 2027, 3, 'ROW-058 control');
  expect(awayDates(march, away.m.name), 'ROW-058 control: next month shows the approved days').toEqual(MAR_8_12);
});

test('ROW-058.REQ-012.a-month-two-years-back-and-one-beyond-next-year-open', async () => {
  const { admin, viewerMember, viewer } = await start(T_FEB24);
  const away = await person(admin, 'Away');
  await approve(admin, await sendRequest(away.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));

  // Beyond next year: today is 2027-02-24, next year is 2028.
  for (const [y, m] of [
    [2029, 3],
    [2029, 2],
    [2029, 4],
    [2029, 1],
  ] as const) {
    const days = await monthView(viewer, y, m, 'ROW-058 beyond next year');
    expectMonth(days, y, m, 'ROW-058 beyond next year');
    expect.soft(awayDates(days, away.m.name), `ROW-058 ${y}-${pad(m)}: Away's 2027 days are not drawn on another year`).toEqual([]);
  }

  // Two years back: today becomes 2029-03-14. Sessions are signed in again after the clock jump.
  await setClock(T_2029_MAR14);
  const viewerLater = await track(signInMember(viewerMember));
  const march = await monthView(viewerLater, 2027, 3, 'ROW-058 two years back');
  expectMonth(march, 2027, 3, 'ROW-058 two years back');
  expect.soft(awayDates(march, away.m.name), 'ROW-058 2027-03 seen from 2029: Away on exactly 2027-03-08..12').toEqual(MAR_8_12);
  for (const [y, m] of [
    [2027, 2],
    [2027, 4],
    [2027, 1],
  ] as const) {
    const days = await monthView(viewerLater, y, m, 'ROW-058 two years back');
    expectMonth(days, y, m, 'ROW-058 two years back');
    expect.soft(awayDates(days, away.m.name), `ROW-058 ${y}-${pad(m)} seen from 2029: Away not listed`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-059 promise: REQ-012 fail-if (2) "a person with an approved day is missing from that day"; the row's cases:
// ROW-059   an approved request spanning a month boundary appears on every one of its weekdays in both months, and
// ROW-059   an approved sick request appears as away (A-017: Monday to Friday days appear).
// ROW-059 wrong product: a calendar that selects requests by their first day's month (Span missing from May), or by
// ROW-059   kind 'vacation' only (Sick missing), or that draws a request on its first day only.
// ROW-059 given: at Wed 2027-04-21, Span vacation Thu 04-29..Tue 05-04, Sick sick Mon 04-19..Tue 04-20 (past),
// ROW-059   Next vacation Mon 04-26..Tue 04-27 (the neighbouring days: right names on wrong days fail), all
// ROW-059   approved. when: a plain member reads April and May, before and after Span's approval. then: before,
// ROW-059   Span is on no day; after, Span on exactly 04-29, 04-30 and 05-03, 05-04; Sick on exactly 04-19, 04-20 and
// ROW-059   nothing in May; Next on exactly 04-26, 04-27.
// ROW-059 controls: the control case shows April and May answer with their weekdays and an approved request
// ROW-059   (Next) is drawn on its days.
// ROW-059 technique: exact per-person date sets (every weekday, no extra), the boundary of the month in the
// ROW-059   middle of one request, and a before/after around the approval.
// ROW-059 cases: ROW-059 target=ROW-059.REQ-012.approved-days-across-a-month-boundary-and-sick-days-are-listed control=ROW-059.control.april-and-may-open-and-show-an-approved-request
test('ROW-059.control.april-and-may-open-and-show-an-approved-request', async () => {
  const { admin, viewer } = await start(T_APR21);
  const next = await person(admin, 'Next');
  await approve(admin, await sendRequest(next.a, { kind: 'vacation', firstDay: '2027-04-26', lastDay: '2027-04-27' }));
  const apr = await monthView(viewer, 2027, 4, 'ROW-059 control');
  const may = await monthView(viewer, 2027, 5, 'ROW-059 control');
  expectMonth(apr, 2027, 4, 'ROW-059 control');
  expectMonth(may, 2027, 5, 'ROW-059 control');
  expect(awayDates(apr, next.m.name), 'ROW-059 control: Next on its two days').toEqual(['2027-04-26', '2027-04-27']);
});

test('ROW-059.REQ-012.approved-days-across-a-month-boundary-and-sick-days-are-listed', async () => {
  const { admin, viewer } = await start(T_APR21);
  const span = await person(admin, 'Span');
  const sick = await person(admin, 'Sick');
  const next = await person(admin, 'Next');
  const spanId = await sendRequest(span.a, { kind: 'vacation', firstDay: '2027-04-29', lastDay: '2027-05-04' });
  await approve(admin, await sendRequest(sick.a, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }));
  await approve(admin, await sendRequest(next.a, { kind: 'vacation', firstDay: '2027-04-26', lastDay: '2027-04-27' }));

  const aprBefore = await monthView(viewer, 2027, 4, 'ROW-059 before');
  const mayBefore = await monthView(viewer, 2027, 5, 'ROW-059 before');
  expect(awayDates(aprBefore, span.m.name), 'ROW-059 before approval: Span not on April').toEqual([]);
  expect(awayDates(mayBefore, span.m.name), 'ROW-059 before approval: Span not on May').toEqual([]);

  await approve(admin, spanId);

  const apr = await monthView(viewer, 2027, 4, 'ROW-059');
  const may = await monthView(viewer, 2027, 5, 'ROW-059');
  expect.soft(awayDates(apr, span.m.name), 'ROW-059: Span on every April weekday of the request').toEqual(['2027-04-29', '2027-04-30']);
  expect.soft(awayDates(may, span.m.name), 'ROW-059: Span on every May weekday of the request').toEqual(['2027-05-03', '2027-05-04']);
  expect.soft(awayDates(apr, sick.m.name), 'ROW-059: the approved sick request is listed as away').toEqual(['2027-04-19', '2027-04-20']);
  expect.soft(awayDates(may, sick.m.name), 'ROW-059: Sick not on May').toEqual([]);
  expect.soft(awayDates(apr, next.m.name), 'ROW-059: Next on exactly its own days').toEqual(['2027-04-26', '2027-04-27']);
  expect.soft(awayDates(may, next.m.name), 'ROW-059: Next not on May').toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ROW-060 promise: REQ-012 fail-if (3) "a pending, rejected or cancelled day appears"; REQ-019 (A-030): a partly
// ROW-060   cancelled approved request's days from the cancel day on are cancelled; an approved request with no
// ROW-060   weekday before today becomes cancelled on an admin cancel.
// ROW-060 wrong product: a calendar that lists every request not rejected (pending shown), or that reads only a
// ROW-060   request's state (a partly cancelled request, still approved, drawn to its last day as sent), or one that
// ROW-060   keeps an admin-cancelled request because it was once approved.
// ROW-060 given: at Wed 2027-03-03, on Mon 03-15..Fri 03-19: Approved approved, Pending pending, Rejected rejected,
// ROW-060   OwnCancel pending then cancelled by its owner, WholeCancel approved; and PartCancel approved on Thu
// ROW-060   03-04..Fri 03-12. when: the clock moves to Mon 03-08 and the admin cancels WholeCancel and PartCancel.
// ROW-060   then: Pending, Rejected, OwnCancel and WholeCancel are on no day of March; PartCancel on exactly
// ROW-060   03-04, 03-05; Approved on exactly 03-15..19.
// ROW-060 controls: before the cancels, WholeCancel and PartCancel are drawn on all their days (the harmful case
// ROW-060   is reached); the control case shows an approved request on the same days is drawn.
// ROW-060 technique: every non-approved state on the very days an approved request is drawn (right and wrong
// ROW-060   cannot coincide), plus the partial cancel's boundary at today.
// ROW-060 cases: ROW-060 target=ROW-060.REQ-012.pending-rejected-and-cancelled-days-are-not-listed control=ROW-060.control.an-approved-request-on-the-same-days-is-listed
test('ROW-060.control.an-approved-request-on-the-same-days-is-listed', async () => {
  const { admin, viewer } = await start(T_MAR03);
  const approved = await person(admin, 'Approved');
  await approve(admin, await sendRequest(approved.a, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' }));
  const march = await monthView(viewer, 2027, 3, 'ROW-060 control');
  expect(awayDates(march, approved.m.name), 'ROW-060 control: Approved on 03-15..19').toEqual(MAR_15_19);
});

test('ROW-060.REQ-012.pending-rejected-and-cancelled-days-are-not-listed', async () => {
  const { admin, viewer } = await start(T_MAR03);
  const W = { kind: 'vacation' as const, firstDay: '2027-03-15', lastDay: '2027-03-19' };
  const approved = await person(admin, 'Approved');
  const pending = await person(admin, 'Pending');
  const rejected = await person(admin, 'Rejected');
  const ownCancel = await person(admin, 'OwnCancel');
  const wholeCancel = await person(admin, 'WholeCancel');
  const partCancel = await person(admin, 'PartCancel');

  await approve(admin, await sendRequest(approved.a, W));
  await sendRequest(pending.a, W);
  await reject(admin, await sendRequest(rejected.a, W));
  await cancelOwnRequest(ownCancel.a, await sendRequest(ownCancel.a, W));
  const wholeId = await sendRequest(wholeCancel.a, W);
  await approve(admin, wholeId);
  const partId = await sendRequest(partCancel.a, { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-12' });
  await approve(admin, partId);

  const before = await monthView(viewer, 2027, 3, 'ROW-060 before');
  expect(awayDates(before, wholeCancel.m.name), 'ROW-060 before the cancel: WholeCancel drawn').toEqual(MAR_15_19);
  expect(awayDates(before, partCancel.m.name), 'ROW-060 before the cancel: PartCancel drawn').toEqual([
    '2027-03-04',
    '2027-03-05',
    ...MAR_8_12,
  ]);

  await setClock(T_MAR08);
  await adminCancel(admin, wholeId);
  await adminCancel(admin, partId);

  const march = await monthView(viewer, 2027, 3, 'ROW-060');
  expect.soft(awayDates(march, pending.m.name), 'ROW-060: a pending request is not listed').toEqual([]);
  expect.soft(awayDates(march, rejected.m.name), 'ROW-060: a rejected request is not listed').toEqual([]);
  expect.soft(awayDates(march, ownCancel.m.name), 'ROW-060: a request its owner cancelled is not listed').toEqual([]);
  expect.soft(awayDates(march, wholeCancel.m.name), 'ROW-060: an approved request the admin cancelled is not listed').toEqual([]);
  expect
    .soft(awayDates(march, partCancel.m.name), 'ROW-060: a partly cancelled request shows only its days before the cancel day')
    .toEqual(['2027-03-04', '2027-03-05']);
  expect.soft(awayDates(march, approved.m.name), 'ROW-060: Approved still on its days').toEqual(MAR_15_19);
});

// ---------------------------------------------------------------------------------------------------
// ROW-061 promise: REQ-012 fail-if (4) "a Saturday or Sunday shows anyone as away"; A-017: Saturdays and Sundays
// ROW-061   inside a range are ignored and do not appear on the calendar.
// ROW-061 wrong product: a calendar that expands each approved request into every date from first to last day,
// ROW-061   drawing people on the weekend inside a Friday-to-Monday request.
// ROW-061 given: at Wed 2027-03-03, approved: Weekend vacation Fri 03-05..Mon 03-08; SickSpan sick Fri
// ROW-061   03-12..Tue 03-16; Long vacation Mon 03-22..Fri 04-02 (two months, one weekend inside). when: a plain
// ROW-061   member reads March and April. then: every Saturday and Sunday entry the answer carries has nobody on it
// ROW-061   (the denominator: every person on every weekend entry); each person is on exactly their weekdays.
// ROW-061 controls: the control case shows Weekend is drawn on its Friday and its Monday (the request spans the
// ROW-061   weekend and is on the calendar).
// ROW-061 technique: a property over every day entry of two months, plus named exact examples.
// ROW-061 cases: ROW-061 target=ROW-061.REQ-012.no-one-is-listed-on-a-saturday-or-sunday control=ROW-061.control.a-weekend-spanning-request-shows-on-its-friday-and-monday
test('ROW-061.control.a-weekend-spanning-request-shows-on-its-friday-and-monday', async () => {
  const { admin, viewer } = await start(T_MAR03);
  const weekend = await person(admin, 'Weekend');
  await approve(admin, await sendRequest(weekend.a, { kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-08' }));
  const march = await monthView(viewer, 2027, 3, 'ROW-061 control');
  expect(awayDates(march, weekend.m.name), 'ROW-061 control: Weekend on its Friday and Monday').toEqual(
    expect.arrayContaining(['2027-03-05', '2027-03-08']),
  );
});

test('ROW-061.REQ-012.no-one-is-listed-on-a-saturday-or-sunday', async () => {
  const { admin, viewer } = await start(T_MAR03);
  const weekend = await person(admin, 'Weekend');
  const sickSpan = await person(admin, 'SickSpan');
  const long = await person(admin, 'Long');
  await approve(admin, await sendRequest(weekend.a, { kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-08' }));
  await approve(admin, await sendRequest(sickSpan.a, { kind: 'sick', firstDay: '2027-03-12', lastDay: '2027-03-16' }));
  await approve(admin, await sendRequest(long.a, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-04-02' }));

  const march = await monthView(viewer, 2027, 3, 'ROW-061');
  const april = await monthView(viewer, 2027, 4, 'ROW-061');
  for (const [label, days] of [
    ['2027-03', march],
    ['2027-04', april],
  ] as const) {
    const onWeekends = days
      .filter((d) => isWeekend(String(d.date)) && peopleOf(d).length > 0)
      .map((d) => `${String(d.date)}: ${peopleOf(d).map((p) => String(p?.name)).join(', ')}`);
    expect.soft(onWeekends, `ROW-061 ${label}: no Saturday or Sunday lists anyone`).toEqual([]);
  }
  expect.soft(awayDates(march, weekend.m.name), 'ROW-061: Weekend on its Friday and Monday only').toEqual(['2027-03-05', '2027-03-08']);
  expect
    .soft(awayDates(march, sickSpan.m.name), 'ROW-061: SickSpan on its weekdays only')
    .toEqual(['2027-03-12', '2027-03-15', '2027-03-16']);
  expect
    .soft(awayDates(march, long.m.name), 'ROW-061: Long on its March weekdays only')
    .toEqual(['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-29', '2027-03-30', '2027-03-31']);
  expect.soft(awayDates(april, long.m.name), 'ROW-061: Long on its April weekdays only').toEqual(['2027-04-01', '2027-04-02']);
});

// ---------------------------------------------------------------------------------------------------
// ROW-062 promise: REQ-012 fail-if (5) "a switched-off account's past approved days disappear from past months";
// ROW-062   A-022: days already passed stay approved and on past months of the calendar. The row's case: an approved
// ROW-062   sick day earlier in the current month stays on the calendar after the switch-off.
// ROW-062 wrong product: a calendar that lists only switched-on accounts (filtering the leaver out entirely), or a
// ROW-062   switch-off that cancels every approved request of the account, past days included.
// ROW-062 given: Leaver's vacation Mon 2027-02-15..Tue 02-16 approved (sent at 2027-01-11); at Wed 2027-03-10 a
// ROW-062   sick request Mon 03-01..Tue 03-02 approved. when: the admin switches Leaver off. then: a plain member
// ROW-062   reads Leaver on exactly 02-15, 02-16 in February and exactly 03-01, 03-02 in March.
// ROW-062 controls: before the switch-off the same two months show the same days (before/after: the days were
// ROW-062   on the calendar, and the switch-off is what the target survives); the control case shows it alone.
// ROW-062 technique: before/after around the switch-off, with exact date sets in the current and a past month.
// ROW-062 cases: ROW-062 target=ROW-062.REQ-012.a-switched-off-accounts-past-approved-days-stay-listed control=ROW-062.control.past-approved-days-are-listed-before-the-switch-off
async function leaverWithPastDays(): Promise<{ admin: Actor; viewer: Actor; leaver: Member }> {
  const { install, admin: early, viewerMember } = await start(T_JAN11);
  const leaver = await person(early, 'Leaver');
  await approve(early, await sendRequest(leaver.a, { kind: 'vacation', firstDay: '2027-02-15', lastDay: '2027-02-16' }));
  await setClock(T_MAR10);
  const admin = await track(signIn(install.admin));
  const leaverNow = await track(signInMember(leaver.m));
  const viewer = await track(signInMember(viewerMember));
  await approve(admin, await sendRequest(leaverNow, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-02' }));
  return { admin, viewer, leaver: leaver.m };
}

test('ROW-062.control.past-approved-days-are-listed-before-the-switch-off', async () => {
  const { viewer, leaver } = await leaverWithPastDays();
  const feb = await monthView(viewer, 2027, 2, 'ROW-062 control');
  const march = await monthView(viewer, 2027, 3, 'ROW-062 control');
  expect(awayDates(feb, leaver.name), 'ROW-062 control: February days listed').toEqual(['2027-02-15', '2027-02-16']);
  expect(awayDates(march, leaver.name), 'ROW-062 control: the sick days earlier this month listed').toEqual(['2027-03-01', '2027-03-02']);
});

test('ROW-062.REQ-012.a-switched-off-accounts-past-approved-days-stay-listed', async () => {
  const { admin, viewer, leaver } = await leaverWithPastDays();
  const febBefore = await monthView(viewer, 2027, 2, 'ROW-062 before');
  const marchBefore = await monthView(viewer, 2027, 3, 'ROW-062 before');
  expect(awayDates(febBefore, leaver.name), 'ROW-062 before: February days listed').toEqual(['2027-02-15', '2027-02-16']);
  expect(awayDates(marchBefore, leaver.name), 'ROW-062 before: March sick days listed').toEqual(['2027-03-01', '2027-03-02']);

  await switchAccount(admin, leaver.id, false);

  const feb = await monthView(viewer, 2027, 2, 'ROW-062');
  const march = await monthView(viewer, 2027, 3, 'ROW-062');
  expect.soft(awayDates(feb, leaver.name), 'ROW-062: a past month keeps the switched-off account\'s approved days').toEqual([
    '2027-02-15',
    '2027-02-16',
  ]);
  expect.soft(awayDates(march, leaver.name), 'ROW-062: the approved sick days earlier this month stay').toEqual([
    '2027-03-01',
    '2027-03-02',
  ]);
});

// ===================================================================================================
// Page cases beside the data cases (added, slice 1, brief test-author-11; lesson L-1)
//
// Boundary (R6): what the calendar lists is promised to a person looking at it, and moving to another month is an
// operation, so these cases open /calendar in the browser (harness openPage, the viewer's session), press the
// page's own Previous and Next controls and read the drawn day cells. The grid is read as robustness.ts states at
// its head: a day cell carries its date (data-date or time[datetime]); month navigation is a button or link named
// "Next" / "Previous". A person is drawn on a day when their display name, as a whole run, is in that day's cell.
// Only the cells of the shown month count for its exact date sets; neighbouring-month cells count only where a
// case says so. Every expected date set is the data cases' own, worked out from the request days alone.
// ===================================================================================================

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `text` draws `name` as a whole run (not inside a longer name). */
function drawsName(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

interface MonthRead {
  shown: string | null;
  cells: GridCell[];
  /** For each name, the dates of the shown month whose cell draws it, sorted. */
  dates: Record<string, string[]>;
}

function readOf(cells: GridCell[], month: string, names: string[]): MonthRead {
  const inMonth = cells.filter((c) => c.date.startsWith(`${month}-`));
  const dates: Record<string, string[]> = {};
  for (const n of names) dates[n] = [...new Set(inMonth.filter((c) => drawsName(c.text, n)).map((c) => c.date))].sort();
  return { shown: shownMonth(cells), cells, dates };
}

/**
 * Reads the drawn grid once the page shows `month` and its network has settled, polling (bounded) until `ready`
 * holds of the reading; answers the last reading whatever it is, so the case's own assertions decide.
 */
async function drawnMonth(page: Page, month: string, names: string[], ready: (r: MonthRead) => boolean = () => true, timeoutMs = 15_000): Promise<MonthRead> {
  await settle(page);
  let last: MonthRead = { shown: null, cells: [], dates: {} };
  await expect
    .poll(
      async () => {
        last = readOf((await readGrid(page)).cells, month, names);
        return last.shown === month && ready(last);
      },
      { timeout: timeoutMs },
    )
    .toBe(true)
    .catch(() => undefined);
  return last;
}

/** Presses the page's Next or Previous control and requires the grid to show `month` after it, naming the row. */
async function press(page: Page, which: 'next' | 'previous', month: string, row: string): Promise<void> {
  const shown = await moveMonth(page, which, month);
  expect(shown, `${row}: ${which === 'next' ? 'Next' : 'Previous'} reaches ${month}`).toBe(month);
}

/** Every month (YYYY-MM) after `from` up to and including `to`. */
function monthsAfter(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (;;) {
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    const s = `${y}-${pad(m)}`;
    if (s > to) return out;
    out.push(s);
  }
}

/** Every month before `from` down to and including `to`, nearest first. */
function monthsBefore(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  for (;;) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const s = `${y}-${pad(m)}`;
    if (s < to) return out;
    out.push(s);
  }
}

/** Opens /calendar in a fresh page signed in as `viewer`; its status must be 200, naming the row. */
async function openCalendar(browser: Browser, viewer: Actor, row: string): Promise<Opened> {
  const opened = await openPage(browser, viewer);
  try {
    const res = await opened.page.goto(PAGES.calendar);
    expect(res?.status(), `${row}: /calendar answers the signed-in member`).toBe(200);
  } catch (e) {
    await opened.close();
    throw e;
  }
  return opened;
}

// ---------------------------------------------------------------------------------------------------
// ROW-058 promise: REQ-012 fail-if (1) "a signed-in person cannot open the calendar or move to another month";
// ROW-058   REQ-012 "for any month, moving to the previous and next month"; the row's cases: a month two years back
// ROW-058   and a month beyond next year both open — here on the page, by its own Previous and Next.
// ROW-058 wrong product: a page whose Next stops (disabled, hidden or ignored) at the end of the request window,
// ROW-058   December of next year, or whose Previous stops at January of this year; a page that draws the month heading
// ROW-058   but fetches the data for a clamped month (March 2027's names drawn on March 2029); a page with no
// ROW-058   Previous/Next at all — every GET /api/calendar case above stays green on each.
// ROW-058 given: Away approved on Mon 2027-03-08..Fri 2027-03-12, today Wed 2027-02-24. when: a plain member opens
// ROW-058   /calendar and presses Next 26 times, February 2027 to April 2029 (beyond next year, 2028); then the clock
// ROW-058   moves to Wed 2029-03-14, Late is approved on Mon 2029-03-19..Tue 03-20, and the member opens /calendar and
// ROW-058   presses Previous 25 times, March 2029 to February 2027 (two years back), and Next once. then: every press
// ROW-058   reaches the month after (before) it; Away is drawn on exactly 03-08..12 in March 2027, both times, and on no
// ROW-058   day of any other month walked through (March 2029 the same-number decoy); Late on exactly 03-19, 03-20 in
// ROW-058   March 2029 and on no day of March 2027.
// ROW-058 controls: ROW-058.control.page-opens-on-this-month-and-moves-across-the-year — near months only: the page
// ROW-058   opens on February 2027, Next draws Away on 03-08..12, Previous walks back to December 2026: the page, its
// ROW-058   controls and the grid reading work before the far months are asked.
// ROW-058 technique: the request window's edges either side (December 2028 → January 2029 by Next; January 2027 → a
// ROW-058   month two years back by Previous), the clock's origin moved forward, a same-number decoy month in another
// ROW-058   year, and a positive mark (Late) in the far present so an empty read is not taken for data.
// ROW-058 cases: ROW-058 target=ROW-058.REQ-012.page-previous-and-next-reach-two-years-back-and-beyond-next-year control=ROW-058.control.page-opens-on-this-month-and-moves-across-the-year
test('ROW-058.control.page-opens-on-this-month-and-moves-across-the-year', async ({ browser }) => {
  const { admin, viewer } = await start(T_FEB24);
  const away = await person(admin, 'Away');
  await approve(admin, await sendRequest(away.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));
  const opened = await openCalendar(browser, viewer, 'ROW-058 control');
  const page = opened.page;
  try {
    expect((await drawnMonth(page, '2027-02', [away.m.name])).shown, 'ROW-058 control: /calendar opens on February 2027').toBe('2027-02');
    await press(page, 'next', '2027-03', 'ROW-058 control');
    const march = await drawnMonth(page, '2027-03', [away.m.name], (r) => r.dates[away.m.name].length > 0);
    expect(march.dates[away.m.name], 'ROW-058 control: March 2027 draws Away on 03-08..12').toEqual(MAR_8_12);
    for (const month of ['2027-02', '2027-01', '2026-12']) await press(page, 'previous', month, 'ROW-058 control');
  } finally {
    await opened.close();
  }
});

test('ROW-058.REQ-012.page-previous-and-next-reach-two-years-back-and-beyond-next-year', async ({ browser }) => {
  test.setTimeout(480_000);
  const { install, admin, viewerMember, viewer } = await start(T_FEB24);
  const away = await person(admin, 'Away');
  await approve(admin, await sendRequest(away.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));

  // Forward from February 2027 to April 2029 by Next.
  let opened = await openCalendar(browser, viewer, 'ROW-058');
  try {
    const page = opened.page;
    expect((await drawnMonth(page, '2027-02', [away.m.name])).shown, 'ROW-058: /calendar opens on February 2027').toBe('2027-02');
    for (const month of monthsAfter('2027-02', '2029-04')) {
      await press(page, 'next', month, 'ROW-058 beyond next year');
      const want = month === '2027-03' ? MAR_8_12 : [];
      const r = await drawnMonth(page, month, [away.m.name], (x) => x.dates[away.m.name].length === want.length);
      expect.soft(r.dates[away.m.name], `ROW-058 ${month} reached by Next from 2027-02: Away drawn on exactly ${JSON.stringify(want)}`).toEqual(want);
    }
  } finally {
    await opened.close();
  }

  // Backward from March 2029 to February 2027 by Previous, the clock two years on.
  await setClock(T_2029_MAR14);
  const adminLater = await track(signIn(install.admin));
  const late = await person(adminLater, 'Late');
  await approve(adminLater, await sendRequest(late.a, { kind: 'vacation', firstDay: '2029-03-19', lastDay: '2029-03-20' }));
  const viewerLater = await track(signInMember(viewerMember));
  opened = await openCalendar(browser, viewerLater, 'ROW-058 two years back');
  try {
    const page = opened.page;
    const names = [away.m.name, late.m.name];
    const now = await drawnMonth(page, '2029-03', names, (x) => x.dates[late.m.name].length > 0);
    expect(now.shown, 'ROW-058: /calendar opens on March 2029 when today is 2029-03-14').toBe('2029-03');
    expect.soft(now.dates[late.m.name], 'ROW-058 2029-03: Late drawn on exactly 03-19, 03-20 (the page has its data)').toEqual(['2029-03-19', '2029-03-20']);
    expect.soft(now.dates[away.m.name], "ROW-058 2029-03: Away's March 2027 days are not drawn on March 2029").toEqual([]);
    for (const month of monthsBefore('2029-03', '2027-02')) {
      await press(page, 'previous', month, 'ROW-058 two years back');
      const want = month === '2027-03' ? MAR_8_12 : [];
      const r = await drawnMonth(page, month, names, (x) => x.dates[away.m.name].length === want.length);
      expect.soft(r.dates[away.m.name], `ROW-058 ${month} reached by Previous from 2029-03: Away drawn on exactly ${JSON.stringify(want)}`).toEqual(want);
      expect.soft(r.dates[late.m.name], `ROW-058 ${month} reached by Previous from 2029-03: Late not drawn`).toEqual([]);
    }
    await press(page, 'next', '2027-03', 'ROW-058 two years back');
    const back = await drawnMonth(page, '2027-03', names, (x) => x.dates[away.m.name].length > 0);
    expect.soft(back.dates[away.m.name], 'ROW-058 2027-03 again by Next: Away drawn on exactly 03-08..12').toEqual(MAR_8_12);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-059 promise: REQ-012 fail-if (2) "a person with an approved day is missing from that day"; the row's cases: an
// ROW-059   approved request spanning a month boundary appears on every one of its weekdays in both months, and an
// ROW-059   approved sick request appears as away — here on the drawn grid, moving between the two months.
// ROW-059 wrong product: GET /api/calendar right, but a page that draws a request only in the month of its first day
// ROW-059   (Span missing from May when reached by Next), filters the entries by kind (Sick missing), or keeps the month
// ROW-059   it drew first and does not redraw after Next/Previous.
// ROW-059 given: at Wed 2027-04-21, Span vacation Thu 04-29..Tue 05-04 (pending), Sick sick Mon 04-19..Tue 04-20 and Next
// ROW-059   vacation Mon 04-26..Tue 04-27, both approved. when: a plain member opens /calendar (April) before Span's
// ROW-059   approval; Span is approved and the page reloaded; the member presses Next (May), then Previous (April).
// ROW-059   then: before, Span is drawn on no April day; after, April draws Span on exactly 04-29, 04-30, Sick on exactly
// ROW-059   04-19, 04-20, Next on exactly 04-26, 04-27; May draws Span on exactly 05-03, 05-04 and neither Sick nor Next;
// ROW-059   April again by Previous draws Span on 04-29, 04-30.
// ROW-059 controls: ROW-059.control.page-draws-april-and-next-reaches-may — April draws Next on its two days and Next
// ROW-059   reaches May: the page, its data and the grid reading work.
// ROW-059 technique: exact per-person date sets on the drawn cells, the month boundary inside one request crossed by
// ROW-059   the page's own controls, and a before/after around the approval.
// ROW-059 cases: ROW-059 target=ROW-059.REQ-012.page-draws-every-approved-weekday-across-the-month-boundary-and-sick-days control=ROW-059.control.page-draws-april-and-next-reaches-may
test('ROW-059.control.page-draws-april-and-next-reaches-may', async ({ browser }) => {
  const { admin, viewer } = await start(T_APR21);
  const next = await person(admin, 'Next');
  await approve(admin, await sendRequest(next.a, { kind: 'vacation', firstDay: '2027-04-26', lastDay: '2027-04-27' }));
  const opened = await openCalendar(browser, viewer, 'ROW-059 control');
  try {
    const apr = await drawnMonth(opened.page, '2027-04', [next.m.name], (r) => r.dates[next.m.name].length > 0);
    expect(apr.shown, 'ROW-059 control: /calendar opens on April 2027').toBe('2027-04');
    expect(apr.dates[next.m.name], 'ROW-059 control: April draws Next on 04-26, 04-27').toEqual(['2027-04-26', '2027-04-27']);
    await press(opened.page, 'next', '2027-05', 'ROW-059 control');
  } finally {
    await opened.close();
  }
});

test('ROW-059.REQ-012.page-draws-every-approved-weekday-across-the-month-boundary-and-sick-days', async ({ browser }) => {
  const { admin, viewer } = await start(T_APR21);
  const span = await person(admin, 'Span');
  const sick = await person(admin, 'Sick');
  const next = await person(admin, 'Next');
  const spanId = await sendRequest(span.a, { kind: 'vacation', firstDay: '2027-04-29', lastDay: '2027-05-04' });
  await approve(admin, await sendRequest(sick.a, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }));
  await approve(admin, await sendRequest(next.a, { kind: 'vacation', firstDay: '2027-04-26', lastDay: '2027-04-27' }));
  const names = [span.m.name, sick.m.name, next.m.name];
  const opened = await openCalendar(browser, viewer, 'ROW-059');
  const page = opened.page;
  try {
    const before = await drawnMonth(page, '2027-04', names, (r) => r.dates[next.m.name].length > 0);
    expect(before.dates[next.m.name], 'ROW-059 before approval: April has its data (Next drawn)').toEqual(['2027-04-26', '2027-04-27']);
    expect(before.dates[span.m.name], 'ROW-059 before approval: Span drawn on no April day').toEqual([]);

    await approve(admin, spanId);
    await page.reload();
    const apr = await drawnMonth(page, '2027-04', names, (r) => r.dates[span.m.name].length > 0);
    expect.soft(apr.dates[span.m.name], 'ROW-059 April: Span drawn on every April weekday of the request').toEqual(['2027-04-29', '2027-04-30']);
    expect.soft(apr.dates[sick.m.name], 'ROW-059 April: the approved sick request drawn as away').toEqual(['2027-04-19', '2027-04-20']);
    expect.soft(apr.dates[next.m.name], 'ROW-059 April: Next on exactly its own days').toEqual(['2027-04-26', '2027-04-27']);

    await press(page, 'next', '2027-05', 'ROW-059');
    const may = await drawnMonth(page, '2027-05', names, (r) => r.dates[span.m.name].length > 0);
    expect.soft(may.dates[span.m.name], 'ROW-059 May by Next: Span drawn on every May weekday of the request').toEqual(['2027-05-03', '2027-05-04']);
    expect.soft(may.dates[sick.m.name], 'ROW-059 May: Sick drawn on no May day').toEqual([]);
    expect.soft(may.dates[next.m.name], 'ROW-059 May: Next drawn on no May day').toEqual([]);

    await press(page, 'previous', '2027-04', 'ROW-059');
    const again = await drawnMonth(page, '2027-04', names, (r) => r.dates[span.m.name].length > 0);
    expect.soft(again.dates[span.m.name], 'ROW-059 April again by Previous: Span on 04-29, 04-30').toEqual(['2027-04-29', '2027-04-30']);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-060 promise: REQ-012 fail-if (3) "a pending, rejected or cancelled day appears"; A-030: a partly cancelled
// ROW-060   approved request's days from the cancel day on are cancelled — here on the drawn grid.
// ROW-060 wrong product: GET /api/calendar right, but a page that also draws the pending requests it fetches for some
// ROW-060   other view ("pending" in a lighter style is still a day drawn), or that draws a request from its first to its
// ROW-060   last day as sent, so a partly cancelled request is drawn to 03-12; or one that keeps drawing what it fetched
// ROW-060   before the cancels after a reload.
// ROW-060 given: the data case's March — Approved, Pending, Rejected, OwnCancel (pending, cancelled by its owner) and
// ROW-060   WholeCancel (approved) on Mon 03-15..Fri 03-19, PartCancel approved on Thu 03-04..Fri 03-12, at Wed 2027-03-03.
// ROW-060   when: a plain member opens /calendar (March); the clock moves to Mon 03-08, the admin cancels WholeCancel and
// ROW-060   PartCancel, and the member reloads. then: before the cancels WholeCancel is drawn on 03-15..19 and PartCancel
// ROW-060   on 03-04, 03-05, 03-08..12 (the harmful case is reached); after, Pending, Rejected, OwnCancel and WholeCancel are
// ROW-060   drawn on no March day, PartCancel on exactly 03-04, 03-05, Approved on exactly 03-15..19.
// ROW-060 controls: ROW-060.control.page-draws-an-approved-request-on-the-same-days — Approved drawn on 03-15..19.
// ROW-060 technique: every non-approved state on the very days an approved request is drawn, the partial cancel's
// ROW-060   boundary at today, a before/after around the cancels on the same page.
// ROW-060 cases: ROW-060 target=ROW-060.REQ-012.page-draws-no-pending-rejected-or-cancelled-day control=ROW-060.control.page-draws-an-approved-request-on-the-same-days
test('ROW-060.control.page-draws-an-approved-request-on-the-same-days', async ({ browser }) => {
  const { admin, viewer } = await start(T_MAR03);
  const approved = await person(admin, 'Approved');
  await approve(admin, await sendRequest(approved.a, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' }));
  const opened = await openCalendar(browser, viewer, 'ROW-060 control');
  try {
    const march = await drawnMonth(opened.page, '2027-03', [approved.m.name], (r) => r.dates[approved.m.name].length > 0);
    expect(march.dates[approved.m.name], 'ROW-060 control: Approved drawn on 03-15..19').toEqual(MAR_15_19);
  } finally {
    await opened.close();
  }
});

test('ROW-060.REQ-012.page-draws-no-pending-rejected-or-cancelled-day', async ({ browser }) => {
  const { admin, viewer } = await start(T_MAR03);
  const W = { kind: 'vacation' as const, firstDay: '2027-03-15', lastDay: '2027-03-19' };
  const approved = await person(admin, 'Approved');
  const pending = await person(admin, 'Pending');
  const rejected = await person(admin, 'Rejected');
  const ownCancel = await person(admin, 'OwnCancel');
  const wholeCancel = await person(admin, 'WholeCancel');
  const partCancel = await person(admin, 'PartCancel');
  await approve(admin, await sendRequest(approved.a, W));
  await sendRequest(pending.a, W);
  await reject(admin, await sendRequest(rejected.a, W));
  await cancelOwnRequest(ownCancel.a, await sendRequest(ownCancel.a, W));
  const wholeId = await sendRequest(wholeCancel.a, W);
  await approve(admin, wholeId);
  const partId = await sendRequest(partCancel.a, { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-12' });
  await approve(admin, partId);
  const names = [approved.m.name, pending.m.name, rejected.m.name, ownCancel.m.name, wholeCancel.m.name, partCancel.m.name];

  const opened = await openCalendar(browser, viewer, 'ROW-060');
  const page = opened.page;
  try {
    const before = await drawnMonth(page, '2027-03', names, (r) => r.dates[wholeCancel.m.name].length > 0 && r.dates[partCancel.m.name].length > 0);
    expect(before.dates[wholeCancel.m.name], 'ROW-060 before the cancels: WholeCancel drawn on 03-15..19').toEqual(MAR_15_19);
    expect(before.dates[partCancel.m.name], 'ROW-060 before the cancels: PartCancel drawn on all its days').toEqual(['2027-03-04', '2027-03-05', ...MAR_8_12]);

    await setClock(T_MAR08);
    await adminCancel(admin, wholeId);
    await adminCancel(admin, partId);
    await page.reload();
    const march = await drawnMonth(page, '2027-03', names, (r) => r.dates[approved.m.name].length === 5 && r.dates[wholeCancel.m.name].length === 0);
    expect(march.dates[approved.m.name], 'ROW-060: the reloaded March has its data (Approved drawn on 03-15..19)').toEqual(MAR_15_19);
    expect.soft(march.dates[pending.m.name], 'ROW-060: a pending request is drawn on no day').toEqual([]);
    expect.soft(march.dates[rejected.m.name], 'ROW-060: a rejected request is drawn on no day').toEqual([]);
    expect.soft(march.dates[ownCancel.m.name], 'ROW-060: a request its owner cancelled is drawn on no day').toEqual([]);
    expect.soft(march.dates[wholeCancel.m.name], 'ROW-060: an approved request the admin cancelled is drawn on no day').toEqual([]);
    expect.soft(march.dates[partCancel.m.name], 'ROW-060: a partly cancelled request is drawn only on its days before the cancel day').toEqual(['2027-03-04', '2027-03-05']);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-061 promise: REQ-012 fail-if (4) "a Saturday or Sunday shows anyone as away"; A-017: Saturdays and Sundays
// ROW-061   inside a range do not appear on the calendar — here on the drawn grid, of two months reached by Next.
// ROW-061 wrong product: GET /api/calendar right, but a page that fills every cell from a request's first to its last
// ROW-061   day (Weekend drawn on Sat 03-06 and Sun 03-07), or that spreads a request into the weekend columns it draws.
// ROW-061 given: at Wed 2027-03-03, approved: Weekend vacation Fri 03-05..Mon 03-08, SickSpan sick Fri 03-12..Tue
// ROW-061   03-16, Long vacation Mon 03-22..Fri 04-02. when: a plain member opens /calendar (March) and presses Next (April).
// ROW-061   then: on both pages every drawn Saturday or Sunday cell (of any month the grid shows) draws none of the
// ROW-061   three; March draws Weekend on exactly 03-05, 03-08, SickSpan on exactly 03-12, 03-15, 03-16, Long on exactly
// ROW-061   its eight March weekdays; April draws Long on exactly 04-01, 04-02.
// ROW-061 controls: ROW-061.control.page-draws-a-weekend-spanning-request-on-its-friday-and-monday.
// ROW-061 technique: a property over every drawn weekend cell (vacuous only when the grid draws no weekend cell, where
// ROW-061   nobody can be drawn on one), plus the named exact weekday sets, which are never vacuous.
// ROW-061 cases: ROW-061 target=ROW-061.REQ-012.page-draws-no-one-on-a-saturday-or-sunday control=ROW-061.control.page-draws-a-weekend-spanning-request-on-its-friday-and-monday
test('ROW-061.control.page-draws-a-weekend-spanning-request-on-its-friday-and-monday', async ({ browser }) => {
  const { admin, viewer } = await start(T_MAR03);
  const weekend = await person(admin, 'Weekend');
  await approve(admin, await sendRequest(weekend.a, { kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-08' }));
  const opened = await openCalendar(browser, viewer, 'ROW-061 control');
  try {
    const march = await drawnMonth(opened.page, '2027-03', [weekend.m.name], (r) => r.dates[weekend.m.name].length > 0);
    expect(march.dates[weekend.m.name], 'ROW-061 control: Weekend drawn on its Friday and its Monday').toEqual(expect.arrayContaining(['2027-03-05', '2027-03-08']));
  } finally {
    await opened.close();
  }
});

test('ROW-061.REQ-012.page-draws-no-one-on-a-saturday-or-sunday', async ({ browser }) => {
  const { admin, viewer } = await start(T_MAR03);
  const weekend = await person(admin, 'Weekend');
  const sickSpan = await person(admin, 'SickSpan');
  const long = await person(admin, 'Long');
  await approve(admin, await sendRequest(weekend.a, { kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-08' }));
  await approve(admin, await sendRequest(sickSpan.a, { kind: 'sick', firstDay: '2027-03-12', lastDay: '2027-03-16' }));
  await approve(admin, await sendRequest(long.a, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-04-02' }));
  const names = [weekend.m.name, sickSpan.m.name, long.m.name];
  const onWeekends = (r: MonthRead) =>
    r.cells.filter((c) => isWeekend(c.date)).flatMap((c) => names.filter((n) => drawsName(c.text, n)).map((n) => `${c.date}: ${n}`));
  const opened = await openCalendar(browser, viewer, 'ROW-061');
  const page = opened.page;
  try {
    const march = await drawnMonth(page, '2027-03', names, (r) => r.dates[long.m.name].length > 0);
    expect(march.dates[long.m.name].length, 'ROW-061 March: the page has its data (Long drawn)').toBeGreaterThan(0);
    expect.soft(onWeekends(march), 'ROW-061 March: no Saturday or Sunday cell draws anyone').toEqual([]);
    expect.soft(march.dates[weekend.m.name], 'ROW-061 March: Weekend drawn on its Friday and Monday only').toEqual(['2027-03-05', '2027-03-08']);
    expect.soft(march.dates[sickSpan.m.name], 'ROW-061 March: SickSpan drawn on its weekdays only').toEqual(['2027-03-12', '2027-03-15', '2027-03-16']);
    expect
      .soft(march.dates[long.m.name], 'ROW-061 March: Long drawn on its March weekdays only')
      .toEqual(['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-29', '2027-03-30', '2027-03-31']);

    await press(page, 'next', '2027-04', 'ROW-061');
    const april = await drawnMonth(page, '2027-04', names, (r) => r.dates[long.m.name].length > 0);
    expect.soft(onWeekends(april), 'ROW-061 April: no Saturday or Sunday cell draws anyone').toEqual([]);
    expect.soft(april.dates[long.m.name], 'ROW-061 April: Long drawn on its April weekdays only').toEqual(['2027-04-01', '2027-04-02']);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-062 promise: REQ-012 fail-if (5) "a switched-off account's past approved days disappear from past months";
// ROW-062   A-022: days already passed stay approved and on past months of the calendar; the row's case: an approved
// ROW-062   sick day earlier in the current month stays on the calendar after the switch-off — here on the drawn grid.
// ROW-062 wrong product: GET /api/calendar right, but a page that draws only the people of switched-on accounts (it
// ROW-062   joins the calendar with a people list and drops the leaver), or that hides a switched-off name.
// ROW-062 given: Leaver's vacation Mon 2027-02-15..Tue 02-16 approved (sent at 2027-01-11) and, at Wed 2027-03-10, a sick
// ROW-062   request Mon 03-01..Tue 03-02 approved. when: a plain member opens /calendar (March) and presses Previous
// ROW-062   (February); the admin switches Leaver off; the member opens /calendar again and presses Previous. then: before
// ROW-062   and after alike, March draws Leaver on exactly 03-01, 03-02 and February on exactly 02-15, 02-16.
// ROW-062 controls: ROW-062.control.page-draws-past-approved-days-before-the-switch-off — the before half alone.
// ROW-062 technique: before/after around the switch-off on the drawn grid, the current and a past month, the past
// ROW-062   month reached by the page's own Previous.
// ROW-062 cases: ROW-062 target=ROW-062.REQ-012.page-keeps-a-switched-off-accounts-past-approved-days control=ROW-062.control.page-draws-past-approved-days-before-the-switch-off
async function leaverOnPage(page: Page, leaver: Member, row: string): Promise<{ march: string[]; feb: string[] }> {
  const march = await drawnMonth(page, '2027-03', [leaver.name], (r) => r.dates[leaver.name].length === 2);
  expect(march.shown, `${row}: /calendar opens on March 2027`).toBe('2027-03');
  await press(page, 'previous', '2027-02', row);
  const feb = await drawnMonth(page, '2027-02', [leaver.name], (r) => r.dates[leaver.name].length === 2);
  return { march: march.dates[leaver.name], feb: feb.dates[leaver.name] };
}

test('ROW-062.control.page-draws-past-approved-days-before-the-switch-off', async ({ browser }) => {
  const { viewer, leaver } = await leaverWithPastDays();
  const opened = await openCalendar(browser, viewer, 'ROW-062 control');
  try {
    const seen = await leaverOnPage(opened.page, leaver, 'ROW-062 control');
    expect.soft(seen.march, 'ROW-062 control: March draws the sick days earlier this month').toEqual(['2027-03-01', '2027-03-02']);
    expect.soft(seen.feb, 'ROW-062 control: February (by Previous) draws the vacation days').toEqual(['2027-02-15', '2027-02-16']);
  } finally {
    await opened.close();
  }
});

test('ROW-062.REQ-012.page-keeps-a-switched-off-accounts-past-approved-days', async ({ browser }) => {
  const { admin, viewer, leaver } = await leaverWithPastDays();
  let opened = await openCalendar(browser, viewer, 'ROW-062 before');
  try {
    const before = await leaverOnPage(opened.page, leaver, 'ROW-062 before');
    expect(before.march, 'ROW-062 before: March draws the sick days').toEqual(['2027-03-01', '2027-03-02']);
    expect(before.feb, 'ROW-062 before: February draws the vacation days').toEqual(['2027-02-15', '2027-02-16']);
  } finally {
    await opened.close();
  }

  await switchAccount(admin, leaver.id, false);

  opened = await openCalendar(browser, viewer, 'ROW-062 after');
  try {
    const after = await leaverOnPage(opened.page, leaver, 'ROW-062 after');
    expect.soft(after.march, 'ROW-062: after the switch-off March still draws the approved sick days earlier this month').toEqual(['2027-03-01', '2027-03-02']);
    expect.soft(after.feb, "ROW-062: after the switch-off the past month still draws the account's approved days").toEqual(['2027-02-15', '2027-02-16']);
  } finally {
    await opened.close();
  }
});
