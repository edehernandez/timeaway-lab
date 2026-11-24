// Purpose: ledger tests for ROW-140 (REQ-003, REQ-012, INV-001) — overlap checks, month queries and year totals give the right answer for single-digit months and days (9 September against 10 October, the 9th against the 10th).
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): rules at the HTTP harness — the overlap refusal on POST /api/requests, the month query on
// GET /api/calendar?year&month (month 1-based), the year totals on GET /api/balance.
// The clock: Monday 4 January 2027, 15:00 in Pacific/Auckland.
import { test, expect } from '@playwright/test';
import {
  addMember,
  AUCKLAND,
  calendarDatesFor,
  disposeAll,
  isAccepted,
  isRefusal,
  sendApproved,
  sendOk,
  startTeam,
  teamInstant,
  trySend,
  yearFigures,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NOW = teamInstant(AUCKLAND, '2027-01-04', '15:00');

// ---------------------------------------------------------------------------------------------------
// ROW-140 promise: REQ-003 (a request sharing a day in effect with the same person's pending or approved one is
// ROW-140   refused; one that shares none is not), REQ-012 (the calendar for a month lists that month's approved days)
// ROW-140   and INV-001 (days left = allowance − that year's approved days): right for single-digit months and days.
// ROW-140 wrong product: one that compares or filters days as text in a form that is not zero-padded ("2027-9-9" sorts
// ROW-140   after "2027-10-10", "2027-11-9" after "2027-11-10"), or queries a month by prefix ("2027-1%" catches October
// ROW-140   to December for January), or totals a year by a text range that drops September.
// ROW-140 given: pending or approved days on 9 September, 9 November, in a range 9 September..10 October, and approved
// ROW-140   single days 5 January, 9 September, 11 October, 10 November, 1 December 2027 and 10 January 2028. when: a
// ROW-140   request sharing the 9th from a range ending on the 10th or 11th is posted; each month is queried; the balance
// ROW-140   is read. then: each sharing request is refused and the neighbouring 10th accepted; each month lists the
// ROW-140   member on exactly its own day; 2027's days left are 25 − 5 with 1 pending, 2028's 25 − 1.
// ROW-140 controls: the control case — the 9th then the 10th, no shared day — shows sending works and that adjacency
// ROW-140   is not refused as overlap.
// ROW-140 technique: the row's own example values (9 September against 10 October, the 9th against the 10th), the
// ROW-140   exact set of every queried month (never a part of the list), and near misses on both sides of each shared day.
// ROW-140 cases: ROW-140 target=ROW-140.REQ-003.overlap-is-found-across-single-digit-months-and-days control=ROW-140.control.the-tenth-is-free-after-the-ninth
test('ROW-140.control.the-tenth-is-free-after-the-ninth', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  await sendOk(actor, { kind: 'vacation', firstDay: '2027-09-09', lastDay: '2027-09-09' });
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2027-09-10', lastDay: '2027-09-10' });
  expect(isAccepted(a), `ROW-140 control: 10 September, next to 9 September, is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
});

test('ROW-140.REQ-003.overlap-is-found-across-single-digit-months-and-days', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const p = await addMember(team, { allowance: 60 });
  await sendOk(p.actor, { kind: 'vacation', firstDay: '2027-09-09', lastDay: '2027-09-09' });
  await sendApproved(team, p.actor, { kind: 'vacation', firstDay: '2027-11-09', lastDay: '2027-11-09' });
  const sharing: [string, string, string][] = [
    ['1 September..11 October holds 9 September', '2027-09-01', '2027-10-11'],
    ['30 August..10 September holds 9 September', '2027-08-30', '2027-09-10'],
    ['1..10 November holds 9 November', '2027-11-01', '2027-11-10'],
    ['a sick 9 November', '2027-11-09', '2027-11-09'],
  ];
  for (const [label, firstDay, lastDay] of sharing) {
    const kind = label.startsWith('a sick') ? 'sick' : 'vacation';
    const a = await trySend(p.actor, { kind, firstDay, lastDay });
    expect.soft(isRefusal(a), `ROW-140 ${label}: refused as overlapping (answered ${a.status})`).toBe(true);
  }
  for (const [label, day] of [
    ['10 September', '2027-09-10'],
    ['10 November', '2027-11-10'],
    ['8 November', '2027-11-08'],
  ]) {
    const a = await trySend(p.actor, { kind: 'vacation', firstDay: day, lastDay: day });
    expect.soft(isAccepted(a), `ROW-140 ${label}: next to a held 9th, accepted (answered ${a.status} ${a.text.slice(0, 120)})`).toBe(true);
  }

  const q = await addMember(team, { allowance: 60 });
  await sendOk(q.actor, { kind: 'vacation', firstDay: '2027-09-09', lastDay: '2027-10-10' });
  for (const day of ['2027-09-20', '2027-10-08', '2027-09-09']) {
    const a = await trySend(q.actor, { kind: 'vacation', firstDay: day, lastDay: day });
    expect.soft(isRefusal(a), `ROW-140 ${day} inside 9 September..10 October: refused (answered ${a.status})`).toBe(true);
  }
  const after = await trySend(q.actor, { kind: 'vacation', firstDay: '2027-10-11', lastDay: '2027-10-11' });
  expect.soft(isAccepted(after), `ROW-140 11 October, after 9 September..10 October: accepted (answered ${after.status})`).toBe(true);
});

async function approvedSet() {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const m = await addMember(team, { allowance: 25 });
  for (const day of ['2027-01-05', '2027-09-09', '2027-10-11', '2027-11-10', '2027-12-01', '2028-01-10']) {
    await sendApproved(team, m.actor, { kind: 'vacation', firstDay: day, lastDay: day });
  }
  await sendOk(m.actor, { kind: 'vacation', firstDay: '2027-09-08', lastDay: '2027-09-08' });
  return m;
}

test('ROW-140.REQ-012.month-queries-return-exactly-their-month', async () => {
  const m = await approvedSet();
  const want: [number, number, string[]][] = [
    [2027, 1, ['2027-01-05']],
    [2027, 2, []],
    [2027, 9, ['2027-09-09']],
    [2027, 10, ['2027-10-11']],
    [2027, 11, ['2027-11-10']],
    [2027, 12, ['2027-12-01']],
    [2028, 1, ['2028-01-10']],
  ];
  for (const [y, mo, days] of want) {
    expect.soft(await calendarDatesFor(m.actor, y, mo, m.member.name), `ROW-140: the calendar for ${y}-${mo} lists exactly its own approved day`).toEqual(days);
  }
});

test('ROW-140.INV-001.year-totals-count-single-digit-months', async () => {
  const m = await approvedSet();
  expect.soft(await yearFigures(m.actor, 2027), 'ROW-140: 2027 counts its five approved days and one pending').toEqual({ daysLeft: 20, pending: 1 });
  expect.soft(await yearFigures(m.actor, 2028), 'ROW-140: 2028 counts only 10 January 2028').toEqual({ daysLeft: 24, pending: 0 });
});
