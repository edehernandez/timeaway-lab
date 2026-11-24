// Purpose: ledger test for ROW-157 (REQ-006, REQ-019, INV-001) — a partly cancelled request shows its in-effect and cancelled counts, and each year's in-effect days of the listed approved vacation requests add up to the allowance minus days left.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, account, requests, decisions, admin cancel), fresh per run; readings of the open record fields from readings.ts.
//
// Boundary (R6): the person's own list as the product sends it (GET /api/requests, D-029) and their balance
// (GET /api/balance) — the data the own requests page shows; at the HTTP harness.
//
// ROW-157 promise: REQ-019 "the request stays approved with its days in effect ending the day before the cancel,
// ROW-157   keeps its first and last day as sent … the person's page shows its cancelled days as cancelled"; REQ-006
// ROW-157   (each request with its counted days and state); INV-001 (days left = allowance − in-effect days of the
// ROW-157   approved vacation requests of that year); A-030. The row's case: the partly cancelled request shows its
// ROW-157   in-effect and cancelled counts, and per year the listed approved vacation requests' in-effect days add
// ROW-157   up to the allowance minus days left.
// ROW-157 wrong product: a list that shows the partly cancelled request with its original 10 days (or as
// ROW-157   cancelled) while the balance counts 3 — page and balance disagree; or the reverse: the list right and the
// ROW-157   balance still charging 10; or a sum that counts approved sick days or pending vacation.
// ROW-157 given: today Mon 2027-03-01 (Auckland, UTC still the day before); a member with allowance 20 and:
// ROW-157   A vacation Mon 03-08..Fri 03-19 (10) approved; B vacation Mon 04-05..Wed 04-07 (3) approved; C vacation
// ROW-157   Mon 2028-01-10..Wed 01-12 (3) approved; decoys D sick 03-22..03-23 approved, E vacation 05-03..05-04
// ROW-157   pending, F vacation 05-10..05-11 rejected. when: today moves to Thu 2027-03-11 and the admin cancels A.
// ROW-157   then: A's record is approved, keeps first day 03-08 and last day 03-19, shows 3 days in effect and 7
// ROW-157   cancelled; the in-effect days of the listed approved vacation records add up to 6 for 2027 and 3 for
// ROW-157   2028, equal to 20 − days left (14 and 17).
// ROW-157 controls: the control case reads the same setup before the cancel: A listed approved with 10 counted
// ROW-157   days, 2027 days left 7 and 2028 days left 17 — the list and the balance are reachable and agree before
// ROW-157   the partial cancel.
// ROW-157 technique: before and after the partial cancel, a sum relation between two sources (the list and the
// ROW-157   balance), with decoys of every kind and state that must not enter the sum.
// ROW-157 cases: ROW-157 target=ROW-157.REQ-019.a-partly-cancelled-request-shows-its-counts-and-the-list-adds-up control=ROW-157.control.before-the-cancel-the-list-and-balance-agree
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  readBalance,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
} from './harness';
import {
  aucklandMorning,
  balanceYear,
  cancelledDays,
  countedDays,
  getJson,
  inEffectDays,
  kindOf,
  recordById,
  requestRecords,
  stateOf,
  yearOfDate,
} from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function setup(): Promise<{ admin: Actor; session: Actor; a: AccountId }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 20 });
  const session = keep(await signInMember(m));
  const a = await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' });
  const b = await sendRequest(session, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-07' });
  const c = await sendRequest(session, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-12' });
  const d = await sendRequest(session, { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23' });
  await sendRequest(session, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
  const f = await sendRequest(session, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' });
  for (const id of [a, b, c, d]) await approve(admin, id);
  await reject(admin, f);
  return { admin, session, a };
}

function inEffectSum(list: unknown, year: number): number {
  return requestRecords(list)
    .filter((r) => kindOf(r) === 'vacation' && stateOf(r) === 'approved' && yearOfDate(String(r.firstDay)) === year)
    .reduce((sum, r) => sum + inEffectDays(r), 0);
}

test('ROW-157.control.before-the-cancel-the-list-and-balance-agree', async () => {
  const { session, a } = await setup();
  const list = await getJson(session.api, '/api/requests', 'ROW-157 control');
  const rec = recordById(list, a);
  expect(rec, 'ROW-157 control: request A is listed').toBeDefined();
  expect(stateOf(rec!), 'ROW-157 control: A is approved').toBe('approved');
  expect(countedDays(rec!), 'ROW-157 control: A counts 10 days').toBe(10);
  const b = await readBalance(session);
  expect(balanceYear(b, 2027)?.daysLeft, 'ROW-157 control: 2027 days left 20 − 13').toBe(7);
  expect(balanceYear(b, 2028)?.daysLeft, 'ROW-157 control: 2028 days left 20 − 3').toBe(17);
});

test('ROW-157.REQ-019.a-partly-cancelled-request-shows-its-counts-and-the-list-adds-up', async () => {
  const { admin, session, a } = await setup();
  await setClock(aucklandMorning('2027-03-11'));
  await adminCancel(admin, a);

  const list = await getJson(session.api, '/api/requests', 'ROW-157');
  const rec = recordById(list, a);
  expect(rec, 'ROW-157: the partly cancelled request is still listed').toBeDefined();
  expect.soft(stateOf(rec!), 'ROW-157: it stays approved').toBe('approved');
  expect.soft(rec!.firstDay, 'ROW-157: it keeps its first day as sent').toBe('2027-03-08');
  expect.soft(rec!.lastDay, 'ROW-157: it keeps its last day as sent').toBe('2027-03-19');
  expect.soft(inEffectDays(rec!), 'ROW-157: it shows 3 days in effect (Mon 03-08 to Wed 03-10)').toBe(3);
  expect.soft(cancelledDays(rec!), 'ROW-157: it shows 7 days cancelled (Thu 03-11 to Fri 03-19)').toBe(7);

  const b = await readBalance(session);
  const left2027 = balanceYear(b, 2027)?.daysLeft;
  const left2028 = balanceYear(b, 2028)?.daysLeft;
  expect.soft(left2027, 'ROW-157: 2027 days left 20 − (3 + 3)').toBe(14);
  expect.soft(left2028, 'ROW-157: 2028 days left 20 − 3').toBe(17);
  expect.soft(inEffectSum(list, 2027), 'ROW-157: the 2027 approved vacation records add up to 20 − days left').toBe(20 - (left2027 ?? NaN));
  expect.soft(inEffectSum(list, 2028), 'ROW-157: the 2028 approved vacation records add up to 20 − days left').toBe(20 - (left2028 ?? NaN));
  expect(inEffectSum(list, 2027), 'ROW-157: the 2027 sum is the independent 6').toBe(6);
});
