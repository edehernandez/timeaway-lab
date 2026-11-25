// Purpose: ledger tests for ROW-149 and ROW-150 (REQ-002, REQ-007, REQ-008, REQ-009, REQ-022) — a request is charged to the year its days are in, and last year's pending request is decided in January, charged to its own year, with its days left and forecast from that year's allowance.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; ROW-150's page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn figures read on /admin/pending beside the API), through page-figures.ts and own-page.ts.
//
// Boundary (R6): rules at the HTTP harness — POST /api/requests, D-029's confirmed approve and reject, GET
// /api/balance, and GET /api/admin/pending (the data of the pending page; its figures read by value, as numbers
// under keys that are not ids). A year's days left after the clock has left it are read by moving the team clock back
// into that year: the balance shows the current and the next year only (REQ-007).
// The team: Pacific/Auckland, every moment at 15:00 team time.
import { test, expect } from '@playwright/test';
import {
  addMember,
  AUCKLAND,
  disposeAll,
  isAccepted,
  isRefusal,
  numberLeaves,
  ownRecords,
  pendingRecords,
  recordById,
  sendApproved,
  sendOk,
  setTeamClock,
  signInAgain,
  startTeam,
  stateOf,
  teamInstant,
  tryAllowance,
  tryConfirmed,
  trySend,
  yearFigures,
} from './team-calendar';
import { saysNumber } from './own-page';
import { readPendingPage, rowLabelled, type PendingPageRead, type PendingSpec, type ReadRow } from './page-figures';

test.afterEach(async () => {
  await disposeAll();
});

const DEC_1 = teamInstant(AUCKLAND, '2027-12-01', '15:00');

// ---------------------------------------------------------------------------------------------------
// ROW-149 promise: REQ-002 (a vacation is refused when its days exceed the allowance minus the approved and pending
// ROW-149   vacation days of ITS year), REQ-007 (each year's days left) and REQ-022: a request is charged to the year its
// ROW-149   days are in — in December, with this year used up and next year free, a next-year vacation is accepted; the
// ROW-149   reverse is refused; a December request approved in January changes only December's year.
// ROW-149 wrong product: one that checks and charges the year of today (the sending or the approving moment) instead
// ROW-149   of the year of the days.
// ROW-149 given / when / then (allowance 4):
// ROW-149   (a) 6..9 December 2027 approved (2027 at 0): a vacation 10..13 January 2028 is accepted, 2028 pending 4;
// ROW-149   (b) 10..13 January 2028 approved (2028 at 0): a vacation 7 February 2028 is refused, while 2027 stays at 4;
// ROW-149   (c) 20..21 December 2027 pending, approved on 5 January 2028: 2028 and 2029 stay at 4, and back in December
// ROW-149       2027 the year 2027 shows 2 days left (4 before the approval).
// ROW-149 controls: the control case sends a December vacation within this year's 4: accepted — sending and the
// ROW-149   balance work, untouched by a year-attribution fault.
// ROW-149 technique: the clock's origin — December and January either side of the year's change — with each year's
// ROW-149   figure read exactly, before and after.
// ROW-149 cases: ROW-149 target=ROW-149.REQ-002.with-this-year-used-up-a-next-year-vacation-is-accepted control=ROW-149.control.a-december-vacation-within-this-year-is-accepted
test('ROW-149.control.a-december-vacation-within-this-year-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: DEC_1 });
  const { actor } = await addMember(team, { allowance: 4 });
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2027-12-06', lastDay: '2027-12-07' });
  expect(isAccepted(a), `ROW-149 control: accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect((await yearFigures(actor, 2027))?.pending, 'ROW-149 control: 2 pending in 2027').toBe(2);
});

test('ROW-149.REQ-002.with-this-year-used-up-a-next-year-vacation-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: DEC_1 });
  const { actor } = await addMember(team, { allowance: 4 });
  await sendApproved(team, actor, { kind: 'vacation', firstDay: '2027-12-06', lastDay: '2027-12-09' });
  expect(await yearFigures(actor, 2027), 'ROW-149 (a) before: 2027 is used up').toEqual({ daysLeft: 0, pending: 0 });
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-13' });
  expect.soft(isAccepted(a), `ROW-149 (a): a vacation of 4 days in 2028 is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect.soft(await yearFigures(actor, 2028), 'ROW-149 (a): charged to 2028').toEqual({ daysLeft: 4, pending: 4 });
  expect.soft(await yearFigures(actor, 2027), 'ROW-149 (a): 2027 untouched').toEqual({ daysLeft: 0, pending: 0 });
});

test('ROW-149.REQ-002.with-next-year-used-up-a-next-year-vacation-is-refused', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: DEC_1 });
  const { actor } = await addMember(team, { allowance: 4 });
  await sendApproved(team, actor, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-13' });
  expect(await yearFigures(actor, 2028), 'ROW-149 (b) before: 2028 is used up').toEqual({ daysLeft: 0, pending: 0 });
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-07' });
  expect.soft(isRefusal(a), `ROW-149 (b): a vacation in 2028 is refused though 2027 is free (answered ${a.status})`).toBe(true);
  expect.soft(await yearFigures(actor, 2027), 'ROW-149 (b): 2027 untouched').toEqual({ daysLeft: 4, pending: 0 });
});

test('ROW-149.REQ-022.a-december-request-approved-in-january-changes-only-december', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: DEC_1 });
  const { member, actor } = await addMember(team, { allowance: 4 });
  const id = await sendOk(actor, { kind: 'vacation', firstDay: '2027-12-20', lastDay: '2027-12-21' });
  expect(await yearFigures(actor, 2027), 'ROW-149 (c) before: 2027 has 4 left, 2 pending').toEqual({ daysLeft: 4, pending: 2 });

  await setTeamClock(AUCKLAND, '2028-01-05', '15:00');
  const january = await signInAgain(member);
  expect(await yearFigures(january, 2028), 'ROW-149 (c) before approval: 2028 has 4').toEqual({ daysLeft: 4, pending: 0 });
  const ok = await tryConfirmed(team.admin, 'approve', id);
  expect(isAccepted(ok), `ROW-149 (c): the December request is approved in January (answered ${ok.status})`).toBe(true);
  expect.soft(await yearFigures(january, 2028), 'ROW-149 (c): 2028 unchanged').toEqual({ daysLeft: 4, pending: 0 });
  expect.soft(await yearFigures(january, 2029), 'ROW-149 (c): 2029 unchanged').toEqual({ daysLeft: 4, pending: 0 });

  await setTeamClock(AUCKLAND, '2027-12-28', '15:00');
  const back = await signInAgain(member);
  expect.soft(await yearFigures(back, 2027), 'ROW-149 (c): charged to 2027').toEqual({ daysLeft: 2, pending: 0 });
});

// ---------------------------------------------------------------------------------------------------
// ROW-150 promise: REQ-009 (a pending request whose days have passed stays pending and decidable), REQ-022 (the
// ROW-150   pending page shows the days left the approval would leave) and REQ-008 (the pending page shows a vacation's
// ROW-150   days left in ITS year): a pending request for last year's days can be approved or rejected in January, is
// ROW-150   charged to its own year, and the pending page shows its days left and forecast from that year's allowance.
// ROW-150 wrong product: one that works the pending page's figures from the current year's allowance and balance
// ROW-150   (15 and 12 here), that refuses to decide a request of a past year, or that charges it to the deciding year.
// ROW-150 given: a member with 9 in 2027 and a change to 15 starting 2028, made in December 2027; pending P 20..22
// ROW-150   December (3 days) and Q 27..28 December (2 days). when: on 5 January 2028 the admin reads the pending list,
// ROW-150   approves P and rejects Q. then: P's record carries 9 (days left in 2027) and 6 (forecast) and neither 15 nor
// ROW-150   12; Q's carries 9 and 7 and neither 15 nor 13; both decisions are accepted, P approved and Q rejected; 2028
// ROW-150   stays 15 with none pending; back in December 2027, 2027 shows 6 left and none pending.
// ROW-150 controls: the control case reads the pending list in December 2027 itself: P carries 9 and 6 — the list and
// ROW-150   its by-value reading work, untouched by a current-year fault (the current year is 2027 there).
// ROW-150 technique: two years with different allowances so a wrong year's figures are decoys that must not appear;
// ROW-150   before and after the decisions.
// ROW-150 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)
async function lastYearsPending() {
  const team = await startTeam({ zone: AUCKLAND, now: DEC_1 });
  const { member, actor } = await addMember(team, { allowance: 9 });
  const ch = await tryAllowance(team.admin, member.id, { allowance: 15, startsNextYear: true });
  expect(isAccepted(ch), `ROW-150 setup: 15 from 2028 (answered ${ch.status})`).toBe(true);
  const p = await sendOk(actor, { kind: 'vacation', firstDay: '2027-12-20', lastDay: '2027-12-22' });
  const q = await sendOk(actor, { kind: 'vacation', firstDay: '2027-12-27', lastDay: '2027-12-28' });
  return { team, member, actor, p, q };
}

test('ROW-150.control.this-years-pending-shows-this-years-figures', async () => {
  const { team, p } = await lastYearsPending();
  const nums = numberLeaves(recordById(await pendingRecords(team.admin), p));
  expect(nums, 'ROW-150 control: P shows 9 days left in 2027').toContain(9);
  expect(nums, 'ROW-150 control: P shows the forecast 6').toContain(6);
});

test('ROW-150.REQ-022.last-years-pending-is-shown-and-charged-to-its-own-year', async () => {
  const { team, member, p, q } = await lastYearsPending();
  await setTeamClock(AUCKLAND, '2028-01-05', '15:00');

  const pending = await pendingRecords(team.admin);
  for (const [label, id, left, forecast, wrongLeft, wrongForecast] of [
    ['P (3 days)', p, 9, 6, 15, 12],
    ['Q (2 days)', q, 9, 7, 15, 13],
  ] as const) {
    const nums = numberLeaves(recordById(pending, id));
    expect.soft(nums, `ROW-150 ${label}: listed in January with 2027's days left ${left}`).toContain(left);
    expect.soft(nums, `ROW-150 ${label}: with the forecast ${forecast}`).toContain(forecast);
    expect.soft(nums.includes(wrongLeft) || nums.includes(wrongForecast), `ROW-150 ${label}: never 2028's figures ${wrongLeft} or ${wrongForecast}`).toBe(false);
  }

  const ap = await tryConfirmed(team.admin, 'approve', p);
  const rq = await tryConfirmed(team.admin, 'reject', q);
  expect.soft(isAccepted(ap), `ROW-150: P is approved in January (answered ${ap.status})`).toBe(true);
  expect.soft(isAccepted(rq), `ROW-150: Q is rejected in January (answered ${rq.status})`).toBe(true);
  const january = await signInAgain(member);
  const records = await ownRecords(january);
  expect.soft(stateOf(recordById(records, p)), 'ROW-150: P approved').toBe('approved');
  expect.soft(stateOf(recordById(records, q)), 'ROW-150: Q rejected').toBe('rejected');
  expect.soft(await yearFigures(january, 2028), 'ROW-150: 2028 untouched').toEqual({ daysLeft: 15, pending: 0 });

  await setTeamClock(AUCKLAND, '2027-12-30', '15:00');
  expect.soft(await yearFigures(await signInAgain(member), 2027), 'ROW-150: charged to 2027').toEqual({ daysLeft: 6, pending: 0 });
});

// ---------------------------------------------------------------------------------------------------
// ROW-150 — on the pending page itself (added, slice 1, test-author-8; lesson L-1)
// ---------------------------------------------------------------------------------------------------
// The ROW-150 cases above read GET /api/admin/pending; a page that works its figures out on the client from the
// current year (the deciding year) keeps them green. These cases open /admin/pending in the admin's browser (engine
// door) and read P's and Q's drawn rows (page-figures.ts readPendingPage: the person's name and the request's first
// day, bounded by the other request); a figure is a number of its own once the row's days, times of day, the name
// and the years are taken out (own-page.ts saysNumber).
//
// ROW-150 promise: as above — REQ-022 (the pending page shows the days left the approval would leave), REQ-008 (the
// ROW-150   pending page shows a vacation's days left in ITS year), REQ-009 (a pending request whose days have passed
// ROW-150   stays pending and decidable), A-020 ("each year's balance uses that year's allowance"), A-021: in January
// ROW-150   the pending page shows last year's pending request with its days left and forecast from that year's
// ROW-150   allowance, under that year's label.
// ROW-150 wrong product: the pending data right, but the page works a row's figures from the current year's
// ROW-150   allowance and balance (15 days left, forecasts 12 and 13) or labels them with the current year 2028.
// ROW-150 given: lastYearsPending() — a member with 9 in 2027 and a change to 15 starting 2028, made in December 2027;
// ROW-150   pending P 20..22 December 2027 (3) and Q 27..28 December (2), sent 1 December at 15:00. when: the team clock
// ROW-150   moves to 5 January 2028 and the admin's browser opens /admin/pending. then: P's row draws 9 (days left in
// ROW-150   2027) and 6 (forecast) and not 15; Q's row draws 9 and 7 and not 15; neither row says 2028.
// ROW-150 controls: ROW-150.control.page-draws-this-years-pending-with-this-years-figures — in December 2027 itself
// ROW-150   the page draws P with 9 and 6: the rows and their figures are reached and read, untouched by a
// ROW-150   current-year fault (the current year is 2027 there).
// ROW-150 technique: two years with different allowances so the deciding year's figures are decoys that must not be
// ROW-150   drawn; the clock's origin — the same rows read either side of New Year.
// ROW-150 cases: ROW-150 target=ROW-150.REQ-022.page-draws-last-years-pending-with-its-own-years-figures control=ROW-150.control.page-draws-this-years-pending-with-this-years-figures

function specs150(name: string): PendingSpec[] {
  return [
    { label: 'P', name, firstDay: '2027-12-20' },
    { label: 'Q', name, firstDay: '2027-12-27' },
  ];
}
/** Every day a row of lastYearsPending() may draw: the requests' days and the send date. */
const DAYS_150 = ['2027-12-20', '2027-12-22', '2027-12-27', '2027-12-28', '2027-12-01'];

function reader150(member: { name: string; email: string }, read: PendingPageRead) {
  const lit = [member.name, member.email, '2027', '2028'];
  return {
    row: (label: string) => rowLabelled(read.rows, label),
    says: (row: ReadRow, n: number) => saysNumber(row.text, n, DAYS_150, lit),
    quote: (row: ReadRow) => (row.found ? `"${row.text}"` : `(not drawn; page: "${read.body.slice(0, 500)}")`),
  };
}

test('ROW-150.control.page-draws-this-years-pending-with-this-years-figures', async ({ browser }) => {
  const { team, member } = await lastYearsPending();
  const read = await readPendingPage(browser, team.admin, specs150(member.name));
  const r = reader150(member, read);
  const p = r.row('P');
  expect(p.found, `ROW-150 control: in December the page draws P: ${r.quote(p)}`).toBe(true);
  expect.soft(r.says(p, 9), `ROW-150 control: P's row draws 9 days left in 2027: ${r.quote(p)}`).toBe(true);
  expect.soft(r.says(p, 6), `ROW-150 control: P's row draws the forecast 6: ${r.quote(p)}`).toBe(true);
});

test('ROW-150.REQ-022.page-draws-last-years-pending-with-its-own-years-figures', async ({ browser }) => {
  const { team, member } = await lastYearsPending();
  await setTeamClock(AUCKLAND, '2028-01-05', '15:00');
  const read = await readPendingPage(browser, team.admin, specs150(member.name));
  const r = reader150(member, read);
  for (const [label, left, forecast] of [
    ['P', 9, 6],
    ['Q', 9, 7],
  ] as const) {
    const row = r.row(label);
    expect.soft(row.found, `ROW-150 ${label}: in January the page still draws last year's pending request: ${r.quote(row)}`).toBe(true);
    if (!row.found) continue;
    expect.soft(r.says(row, left), `ROW-150 ${label}: its row draws 2027's days left ${left}: ${r.quote(row)}`).toBe(true);
    expect.soft(r.says(row, forecast), `ROW-150 ${label}: its row draws the forecast ${forecast} from 2027's allowance: ${r.quote(row)}`).toBe(true);
    expect.soft(r.says(row, 15), `ROW-150 ${label}: its row does not draw 2028's days left 15: ${r.quote(row)}`).toBe(false);
    expect.soft(/(?<!\d)2028(?!\d)/.test(row.text), `ROW-150 ${label}: its row does not label its figures with 2028: ${r.quote(row)}`).toBe(false);
  }
});
