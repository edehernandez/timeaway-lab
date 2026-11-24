// Purpose: ledger test for ROW-157 (REQ-006, REQ-019, INV-001) — a partly cancelled request shows its in-effect and cancelled counts, and each year's in-effect days of the listed approved vacation requests add up to the allowance minus days left.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, account, requests, decisions, admin cancel), fresh per run; readings of the open record fields from readings.ts; the page cases added in slice 1 by batch test-author-5 (lesson L-1: the drawn rows and days-left figures read on / beside the API), through own-page.ts and journey-pages.ts.
//
// Boundary (R6): the person's own list as the product sends it (GET /api/requests, D-029) and their balance
// (GET /api/balance) — the data the own requests page shows; at the HTTP harness.
// The page cases (at the end) open / in the person's browser (engine door) and read the drawn rows and figures.
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
// ROW-157 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)
import { test, expect } from '@playwright/test';
import { yearFigures } from './journey-pages';
import { readOwnPage, rowOf, saysNumber, saysState, type DrawnSpec } from './own-page';
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

// =====================================================================================================
// ROW-157 — on the own requests page itself (added, slice 1, test-author-5; lesson L-1)
// =====================================================================================================
// ROW-157 promise: as above — REQ-019 ("the person's page shows its cancelled days as cancelled"), REQ-006 (each
// ROW-157   request with its counted days and state, on the page), INV-001 ("the vacation days left shown anywhere"),
// ROW-157   A-030; the row's case: the partly cancelled request shows its in-effect and cancelled counts, and per year the
// ROW-157   listed approved vacation requests' in-effect days add up to the allowance minus days left.
// ROW-157 wrong product: GET /api/requests and GET /api/balance are right, but the page draws A with its original 10
// ROW-157   days (no in-effect or cancelled count), draws A as cancelled, or computes days left on the client from the
// ROW-157   sent ranges (2027 still 7) or with sick or pending days in (12, 4) — every API case stays green.
// ROW-157 given: setup() — today Mon 2027-03-01 (team); allowance 20; A vacation 8..19 March (10) approved, B vacation
// ROW-157   5..7 April (3) approved, C vacation 10..12 January 2028 (3) approved, decoys D sick 22..23 March approved, E
// ROW-157   vacation 3..4 May pending, F vacation 10..11 May rejected; every send and decision on 1 March. when: today
// ROW-157   moves to Thu 2027-03-11, the admin cancels A, and the member's browser opens /. then: A's row draws approved,
// ROW-157   3 (in effect, 8..10 March) and 7 (cancelled, 11..19 March) as numbers of their own; B's and C's rows draw
// ROW-157   3; the page's 2027 days left is 14 = 20 − (3 + 3) and its 2028 days left 17 = 20 − 3 — the drawn in-effect
// ROW-157   days of the approved vacation rows add up to the allowance minus the drawn days left, each year.
// ROW-157 controls: ROW-157.control.page-before-the-cancel-draws-a-and-days-left — the same setup before the cancel:
// ROW-157   A's row draws approved and 10, and the page draws 2027 days left 7 and 2028 days left 17, so the rows and
// ROW-157   the figures are reached and read; the target's values are absent before the cancel (7 for 2027, not 14).
// ROW-157 technique: before and after the partial cancel; a sum relation between the drawn rows and the drawn
// ROW-157   figures, against values the test works out itself, with decoys of every kind and state that must not count.
// ROW-157 cases: ROW-157 target=ROW-157.REQ-019.page-draws-the-partly-cancelled-counts-and-days-left-add-up control=ROW-157.control.page-before-the-cancel-draws-a-and-days-left

const ROWS_157: DrawnSpec[] = [
  { label: 'A', firstDay: '2027-03-08', lastDay: '2027-03-19' },
  { label: 'B', firstDay: '2027-04-05', lastDay: '2027-04-07' },
  { label: 'C', firstDay: '2028-01-10', lastDay: '2028-01-12' },
  { label: 'D', firstDay: '2027-03-22', lastDay: '2027-03-23' },
  { label: 'E', firstDay: '2027-05-03', lastDay: '2027-05-04' },
  { label: 'F', firstDay: '2027-05-10', lastDay: '2027-05-11' },
];
/** Every day a row of this setup may draw: the requests' days, the act date 1 March, the cancel date 11 March and the in-effect end 10 March. */
const DAYS_157 = [...ROWS_157.flatMap((r) => [r.firstDay, r.lastDay]), '2027-03-01', '2027-03-10', '2027-03-11'];

async function readPage157(browser: Parameters<typeof readOwnPage>[0], session: Actor) {
  return readOwnPage(browser, session, ROWS_157, async (page) => ({
    y2027: await yearFigures(page, 2027, 2028),
    y2028: await yearFigures(page, 2028, 2027),
  }));
}

function literals157(admin: Actor, session: Actor): string[] {
  return [admin.me.name, session.me.name, admin.credentials.email, session.credentials.email, '2027', '2028'];
}

test('ROW-157.control.page-before-the-cancel-draws-a-and-days-left', async ({ browser }) => {
  const { admin, session } = await setup();
  const read = await readPage157(browser, session);
  const lit = literals157(admin, session);
  const a = rowOf(read, 'A');
  expect(a.found, `ROW-157 control: / draws A; page: "${read.body.slice(0, 600)}"`).toBe(true);
  expect.soft(saysState(a.text, 'approved'), `ROW-157 control: A's row draws approved: "${a.text}"`).toBe(true);
  expect.soft(saysNumber(a.text, 10, DAYS_157, lit), `ROW-157 control: A's row draws its 10 counted days: "${a.text}"`).toBe(true);
  expect.soft(saysNumber(read.extra.y2027 ?? '', 7, [], lit), `ROW-157 control: the page's 2027 days left is 20 − 13 = 7: "${read.extra.y2027}"`).toBe(true);
  expect.soft(saysNumber(read.extra.y2028 ?? '', 17, [], lit), `ROW-157 control: the page's 2028 days left is 20 − 3 = 17: "${read.extra.y2028}"`).toBe(true);
});

test('ROW-157.REQ-019.page-draws-the-partly-cancelled-counts-and-days-left-add-up', async ({ browser }) => {
  const { admin, session, a: aId } = await setup();
  const before = await readPage157(browser, session);
  const lit = literals157(admin, session);
  expect(saysNumber(before.extra.y2027 ?? '', 14, [], lit), `ROW-157: before the cancel the page's 2027 days left is not yet 14: "${before.extra.y2027}"`).toBe(false);

  await setClock(aucklandMorning('2027-03-11'));
  await adminCancel(admin, aId);

  const read = await readPage157(browser, session);
  for (const r of ROWS_157) expect.soft(rowOf(read, r.label).found, `ROW-157: / draws ${r.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
  const a = rowOf(read, 'A');
  expect.soft(saysState(a.text, 'approved'), `ROW-157: the partly cancelled row stays approved: "${a.text}"`).toBe(true);
  expect.soft(saysNumber(a.text, 3, DAYS_157, lit), `ROW-157: the partly cancelled row draws 3 days in effect (8..10 March): "${a.text}"`).toBe(true);
  expect.soft(saysNumber(a.text, 7, DAYS_157, lit), `ROW-157: the partly cancelled row draws 7 days cancelled (11..19 March): "${a.text}"`).toBe(true);
  for (const label of ['B', 'C']) {
    const row = rowOf(read, label);
    expect.soft(saysNumber(row.text, 3, DAYS_157, lit), `ROW-157: ${label}'s row draws its 3 days: "${row.text}"`).toBe(true);
  }
  // The sum relation, against the test's own figures: 2027 in effect A 3 + B 3 = 6, 2028 C 3.
  expect.soft(saysNumber(read.extra.y2027 ?? '', 20 - (3 + 3), [], lit), `ROW-157: the page's 2027 days left is 20 − (3 + 3) = 14: "${read.extra.y2027}"`).toBe(true);
  expect.soft(saysNumber(read.extra.y2028 ?? '', 20 - 3, [], lit), `ROW-157: the page's 2028 days left is 20 − 3 = 17: "${read.extra.y2028}"`).toBe(true);
});
