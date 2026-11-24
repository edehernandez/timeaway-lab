// Purpose: ledger tests for ROW-141 and ROW-142 (REQ-001, REQ-004) — the send window's stated bounds are inclusive, and a sick request for future days, or one spanning past, today and future days, is accepted.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): the send rules, proved at the HTTP harness on POST /api/requests, the stored requests read back on
// GET /api/requests and GET /api/balance.
// The clock: Wednesday 16 June 2027, 00:30 in Pacific/Auckland (the UTC date is still Tuesday 15 June).
import { test, expect } from '@playwright/test';
import {
  addMember,
  AUCKLAND,
  disposeAll,
  idOf,
  isAccepted,
  isRefusal,
  ownRecords,
  startTeam,
  stateOf,
  teamInstant,
  trySend,
  yearFigures,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NOW = teamInstant(AUCKLAND, '2027-06-16', '00:30');

// ---------------------------------------------------------------------------------------------------
// ROW-141 promise: REQ-001 (a first and a last day) and REQ-004 fail-if (1), (3), (4) read at their edges: the stated
// ROW-141   bounds are inclusive — a one-day request, a vacation starting today, a sick request for 1 January of the
// ROW-141   current year and a request ending 31 December of the next year are all accepted.
// ROW-141 wrong product: one whose checks use strict comparisons where the rule is inclusive — first < last refusing
// ROW-141   a one-day request, first > today refusing today, day > 1 January refusing New Year's Day, day < 31 December
// ROW-141   of next year refusing the year's last day.
// ROW-141 given: a member, clock Wed 16 June 2027 00:30 Auckland. when: a vacation 7 July..7 July, a vacation 16..18
// ROW-141   June, a sick 1 January 2027 and a vacation 29..31 December 2028 are posted. then: each is accepted with an
// ROW-141   id; the member's list holds all four; 2027 shows 4 pending vacation days and 2028 shows 1.
// ROW-141 controls: the control case posts the day just outside each bound — a vacation for 15 June, a sick 31
// ROW-141   December 2026, a vacation for 1 January 2029, a vacation 29 December 2028..1 January 2029 — and each is refused:
// ROW-141   the bounds are where the rule puts them, so acceptance on the edge is the edge's.
// ROW-141 technique: a threshold — the values on each bound, with their neighbours just outside as the control.
// ROW-141 cases: ROW-141 target=ROW-141.REQ-004.the-stated-bounds-are-inclusive control=ROW-141.control.just-outside-each-bound-is-refused
test('ROW-141.control.just-outside-each-bound-is-refused', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const outside: [string, string, string, string][] = [
    ['a vacation for yesterday', 'vacation', '2027-06-15', '2027-06-15'],
    ['a sick day of the previous year, outside January', 'sick', '2026-12-31', '2026-12-31'],
    ['a vacation after next year', 'vacation', '2029-01-01', '2029-01-01'],
    ['a vacation crossing 31 December of next year', 'vacation', '2028-12-29', '2029-01-01'],
  ];
  for (const [label, kind, firstDay, lastDay] of outside) {
    const a = await trySend(actor, { kind, firstDay, lastDay });
    expect.soft(isRefusal(a), `ROW-141 control ${label}: refused (answered ${a.status})`).toBe(true);
  }
});

test('ROW-141.REQ-004.the-stated-bounds-are-inclusive', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team, { allowance: 25 });
  expect((await ownRecords(actor)).length, 'ROW-141 before: no request').toBe(0);
  const edges: [string, string, string, string][] = [
    ['a one-day vacation', 'vacation', '2027-07-07', '2027-07-07'],
    ['a vacation starting today', 'vacation', '2027-06-16', '2027-06-18'],
    ['a sick request for 1 January of the current year', 'sick', '2027-01-01', '2027-01-01'],
    ['a vacation ending 31 December of the next year', 'vacation', '2028-12-29', '2028-12-31'],
  ];
  const ids: string[] = [];
  for (const [label, kind, firstDay, lastDay] of edges) {
    const a = await trySend(actor, { kind, firstDay, lastDay });
    expect.soft(isAccepted(a), `ROW-141 ${label} (${firstDay}..${lastDay}): accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    if (idOf(a) !== undefined) ids.push(String(idOf(a)));
  }
  const listed = (await ownRecords(actor)).map((r) => String(r.id)).sort();
  expect.soft(listed, 'ROW-141: all four requests are stored').toEqual([...ids].sort());
  expect.soft(listed.length, 'ROW-141: four requests').toBe(4);
  expect.soft((await yearFigures(actor, 2027))?.pending, 'ROW-141: 2027 holds 1 + 3 pending vacation days').toBe(4);
  expect.soft((await yearFigures(actor, 2028))?.pending, 'ROW-141: 2028 holds 1 pending vacation day (Fri 29 December)').toBe(1);
});

// ---------------------------------------------------------------------------------------------------
// ROW-142 promise: REQ-004 (a vacation may not include a day before today, a sick request may; no rule limits a sick
// ROW-142   request to the past) with A-004 (sick requests may cover past days): a sick request for future days, or one
// ROW-142   spanning past, today and future days, is accepted.
// ROW-142 wrong product: one that reads "sick days are told after the fact" as a rule and refuses sick days after
// ROW-142   today, or that refuses a range mixing past and future because it applies the vacation rule to the future
// ROW-142   part or the "sick may be past" rule only to wholly past ranges.
// ROW-142 given: a member, clock Wed 16 June 2027 00:30 Auckland. when: a sick 21..23 June (future) and a sick 14..18
// ROW-142   June (Mon and Tue past, Wed today, Thu and Fri future) are posted. then: both are accepted and stored
// ROW-142   pending, and the 2027 days left stay 25 with no pending vacation day (sick never uses the allowance).
// ROW-142 controls: the control case posts a wholly past sick request (7..9 June) and it is accepted — the route and
// ROW-142   the sick kind work, untouched by a fault that refuses future sick days.
// ROW-142 technique: the harmful cases reached directly — wholly future, and one range across past, today and future.
// ROW-142 cases: ROW-142 target=ROW-142.REQ-004.a-sick-request-for-future-days-is-accepted control=ROW-142.control.a-sick-request-for-past-days-is-accepted
test('ROW-142.control.a-sick-request-for-past-days-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const a = await trySend(actor, { kind: 'sick', firstDay: '2027-06-07', lastDay: '2027-06-09' });
  expect(isAccepted(a), `ROW-142 control: a sick 7..9 June is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
});

test('ROW-142.REQ-004.a-sick-request-for-future-days-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team, { allowance: 25 });
  const ids: string[] = [];
  for (const [label, firstDay, lastDay] of [
    ['a sick request for future days', '2027-06-21', '2027-06-23'],
    ['a sick request across past, today and future days', '2027-06-14', '2027-06-18'],
  ]) {
    const a = await trySend(actor, { kind: 'sick', firstDay, lastDay });
    expect.soft(isAccepted(a), `ROW-142 ${label} (${firstDay}..${lastDay}): accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    if (idOf(a) !== undefined) ids.push(String(idOf(a)));
  }
  const records = await ownRecords(actor);
  expect.soft(records.map((r) => String(r.id)).sort(), 'ROW-142: both are stored').toEqual([...ids].sort());
  expect.soft(ids.length, 'ROW-142: two ids answered').toBe(2);
  expect.soft(records.map(stateOf), 'ROW-142: both are pending').toEqual(['pending', 'pending']);
  expect.soft(await yearFigures(actor, 2027), 'ROW-142: no allowance used, no pending vacation day').toEqual({ daysLeft: 25, pending: 0 });
});
