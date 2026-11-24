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
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
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
} from './harness';

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
