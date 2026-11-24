// Purpose: ledger tests for ROW-046 and ROW-047 (REQ-009 arms 4 and 5) — an approved request's days are all on the calendar (across a month boundary, and a sick request as away), and a rejected request's days neither count as pending nor block a new request.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, accounts, requests, confirmed actions), fresh per run.
//
// ROW-046 promise: REQ-009 "approving makes it approved and puts its days on the calendar", fail-if (4) "an approved
// ROW-046   request's days are missing from the calendar"; the row's cases: an approved request spanning a month
// ROW-046   boundary appears on every one of its weekdays in both months, and an approved sick request appears as away.
// ROW-046   The calendar is read through D-029's GET /api/calendar?year&month, one month per call.
// ROW-046 wrong product: the calendar month query selects requests whose first day lies in the month, so the May
// ROW-046   days of an April-to-May request vanish (or the April days, if it keys on the last day); the calendar is
// ROW-046   built from vacation only, so an approved sick request is not shown; or entries land on the wrong person.
// ROW-046 given: member 1 with a vacation request Thu 2027-04-29 to Tue 2027-05-04 (weekdays 29, 30, 3, 4) and a sick
// ROW-046   request Wed 12 to Thu 13 May; member 2 (the decoy) with one-day vacations on Wed 28 April and Wed 5 May, the
// ROW-046   weekdays either side of member 1's range. when: the admin approves all four. then: over the weekdays
// ROW-046   26 April to 14 May, member 1 is listed on exactly 29, 30 April, 3, 4, 12, 13 May — by account id and name —
// ROW-046   and member 2 on exactly 28 April and 5 May.
// ROW-046 controls: before the approvals member 1 is on no day (absent before the action); the control case shows
// ROW-046   the calendar answers both months and a single-month approved day is listed (the path is reached).
// ROW-046 technique: values just either side of the boundary (the last weekdays of April, the first of May) with a
// ROW-046   neighbour's days as decoys around the range, compared as the whole list over a window (never part of it).
// ROW-046 cases: ROW-046 target=ROW-046.REQ-009.approved-request-on-every-weekday-across-a-month-boundary-and-sick-shown-away control=ROW-046.control.calendar-lists-a-single-month-approved-day
//
// ROW-047 promise: REQ-009 "rejecting makes it rejected and frees its pending days", fail-if (5) "a rejected
// ROW-047   request's days still count as pending or still block a new request". The blocks a pending request
// ROW-047   imposes are REQ-002's (pending vacation days come off what may still be asked) and REQ-003's (no second
// ROW-047   request on a day of a pending one).
// ROW-047 wrong product: rejection sets the state but the pending total or the overlap check still reads the
// ROW-047   rejected request (e.g. it filters "not cancelled" instead of "pending or approved"), so the person cannot
// ROW-047   ask for the same days again or the pending figure stays.
// ROW-047 given: member 1 with a fresh allowance A (3 to 5) and a pending vacation request for exactly A weekdays
// ROW-047   (all of the allowance); member 2's pending request as the neighbour. when: the admin rejects member 1's
// ROW-047   request. then: member 1's pending is 0 and days left A; a new vacation request for the very same A days is
// ROW-047   accepted (it would be refused both as an overlap and as over the allowance if the rejected days still
// ROW-047   counted); member 1's pending is then A; member 2's pending is untouched.
// ROW-047 controls: the control case shows, before any decision, that a pending request does block: a sick request
// ROW-047   on one of its days and a one-day vacation elsewhere are both refused — so the target's acceptance after
// ROW-047   the rejection is the rejection's effect, not a product with no blocks.
// ROW-047 technique: before/after, the same days re-asked as the discriminating request, the neighbour untouched.
// ROW-047 cases: ROW-047 target=ROW-047.REQ-009.rejected-days-not-pending-and-not-blocking control=ROW-047.control.pending-days-count-and-block-before-the-decision
import { test, expect } from '@playwright/test';
import { approve, reject, sendRequest } from './harness';
import { AHEAD_ZONE, awayDays, calendarOn, figures, freshInt, ok, startTeam, teamInstant, weekdaysBetween, addDays } from './time-off';

const NOW = teamInstant(AHEAD_ZONE, '2027-04-05', '09:00'); // Monday 5 April 2027
const WINDOW = weekdaysBetween('2027-04-26', '2027-05-14');

test('ROW-046.control.calendar-lists-a-single-month-approved-day', async () => {
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [freshInt(10, 30)] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    // The calendar answers for April and for May (a SetupError naming the route otherwise), and nobody is on these days yet.
    expect(await awayDays(team.admin, member.id, WINDOW), 'ROW-046 control: member is on no day before any approval').toEqual([]);
    const id = await sendRequest(session, { kind: 'vacation', firstDay: '2027-04-28', lastDay: '2027-04-28' });
    await approve(team.admin, id);
    expect(await awayDays(team.admin, member.id, WINDOW), 'ROW-046 control: the approved single day is listed').toEqual(['2027-04-28']);
  } finally {
    await team.close();
  }
});

test('ROW-046.REQ-009.approved-request-on-every-weekday-across-a-month-boundary-and-sick-shown-away', async () => {
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [freshInt(10, 30), freshInt(10, 30)] });
  try {
    const [m1, m2] = team.members;
    const [s1, s2] = team.sessions;
    const span = await sendRequest(s1, { kind: 'vacation', firstDay: '2027-04-29', lastDay: '2027-05-04' });
    const sick = await sendRequest(s1, { kind: 'sick', firstDay: '2027-05-12', lastDay: '2027-05-13' });
    const before = await sendRequest(s2, { kind: 'vacation', firstDay: '2027-04-28', lastDay: '2027-04-28' });
    const after = await sendRequest(s2, { kind: 'vacation', firstDay: '2027-05-05', lastDay: '2027-05-05' });
    expect(await awayDays(team.admin, m1.id, WINDOW), 'ROW-046 before: member 1 is on no day while pending').toEqual([]);

    for (const id of [span, sick, before, after]) await approve(team.admin, id);

    expect.soft(await awayDays(team.admin, m1.id, WINDOW), 'ROW-046: member 1 on every weekday of the April-May request and of the sick request, and no other').toEqual([
      '2027-04-29',
      '2027-04-30',
      '2027-05-03',
      '2027-05-04',
      '2027-05-12',
      '2027-05-13',
    ]);
    expect.soft(await awayDays(team.admin, m2.id, WINDOW), 'ROW-046: the decoy member on exactly their own two days').toEqual(['2027-04-28', '2027-05-05']);
    const cal = await calendarOn(team.admin, ['2027-04-30', '2027-05-03', '2027-05-12']);
    for (const d of ['2027-04-30', '2027-05-03', '2027-05-12']) {
      const entry = (cal.get(d) ?? []).find((p) => String(p.accountId) === String(m1.id));
      expect.soft(entry?.name, `ROW-046 ${d}: member 1's entry carries their name`).toBe(m1.name);
    }
  } finally {
    await team.close();
  }
});

test('ROW-047.control.pending-days-count-and-block-before-the-decision', async () => {
  const A = freshInt(3, 5);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [session] = team.sessions;
    const first = '2027-04-12'; // a Monday
    await sendRequest(session, { kind: 'vacation', firstDay: first, lastDay: addDays(first, A - 1) });
    expect(await figures(session, [2027]), 'ROW-047 control: all A days pending').toEqual({ 2027: { daysLeft: A, pending: A } });
    const overlap = await session.api.post('/api/requests', { data: { kind: 'sick', firstDay: first, lastDay: first } });
    expect.soft(ok(overlap.status()), `ROW-047 control: a request on a pending day is refused (${overlap.status()})`).toBe(false);
    const over = await session.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-19' } });
    expect(ok(over.status()), `ROW-047 control: a vacation day beyond allowance minus pending is refused (${over.status()})`).toBe(false);
  } finally {
    await team.close();
  }
});

test('ROW-047.REQ-009.rejected-days-not-pending-and-not-blocking', async () => {
  const A = freshInt(3, 5);
  const B = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A, B] });
  try {
    const [s1, s2] = team.sessions;
    const first = '2027-04-12'; // a Monday
    const last = addDays(first, A - 1);
    const id = await sendRequest(s1, { kind: 'vacation', firstDay: first, lastDay: last });
    await sendRequest(s2, { kind: 'vacation', firstDay: first, lastDay: first });
    expect(await figures(s1, [2027]), 'ROW-047 before: all A days pending').toEqual({ 2027: { daysLeft: A, pending: A } });

    await reject(team.admin, id);

    expect.soft(await figures(s1, [2027]), 'ROW-047 after: the rejected days are no longer pending').toEqual({ 2027: { daysLeft: A, pending: 0 } });
    const again = await s1.api.post('/api/requests', { data: { kind: 'vacation', firstDay: first, lastDay: last } });
    expect.soft(again.status(), 'ROW-047 after: a new request for the same days is accepted (201)').toBe(201);
    expect.soft(await figures(s1, [2027]), 'ROW-047 after: only the new request is pending').toEqual({ 2027: { daysLeft: A, pending: A } });
    expect(await figures(s2, [2027]), 'ROW-047 after: the neighbour\'s pending day is untouched').toEqual({ 2027: { daysLeft: B, pending: 1 } });
  } finally {
    await team.close();
  }
});
