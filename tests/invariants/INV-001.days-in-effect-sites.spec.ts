// Purpose: ledger tests for ROW-154, ROW-155 and ROW-156 (INV-001, REQ-002, REQ-007, REQ-022) — every site that decides or forecasts from a balance uses days in effect, exactly the days left minus pending is accepted, and a pending sick request is not pending vacation.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions, cancel, switch), fresh per run; readings of the open response fields from readings.ts.
// Slice 1, brief test-author-9 (lesson L-1): ROW-156's page cases added beside its data cases — / read in the member's
// browser through page-figures.ts readOwnFigures, every data assertion kept.
//
// Boundary (R6): balance rules, proved at the HTTP harness: the send check is POST /api/requests (201 or a refusal
// with a plain message, D-029), the refusal message is that refusal's body, the pending forecast is the request's
// record on GET /api/admin/pending (its forecast and days-left fields, readings.ts), the figures GET /api/balance.
// Team zone Pacific/Auckland at 09:00-10:00 local, when the UTC date is still the day before.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  readBalance,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { aucklandMorning, balanceYear, forecastOf, getJson, pendingPageDaysLeft, recordById } from './readings';
import { saysNumber } from './own-page';
import { readOwnFigures, type OwnFigures } from './page-figures';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(today = '2027-03-01'): Promise<Actor> {
  const install = await resetProduct({ now: aucklandMorning(today) });
  return keep(await signIn(install.admin));
}

async function post(actor: Actor, kind: 'vacation' | 'sick', firstDay: string, lastDay: string): Promise<{ status: number; body: string; id?: AccountId }> {
  const res = await actor.api.post('/api/requests', { data: { kind, firstDay, lastDay } });
  const body = await res.text();
  let id: AccountId | undefined;
  try {
    id = (JSON.parse(body) as { id?: AccountId }).id;
  } catch {
    id = undefined;
  }
  return { status: res.status(), body, id };
}

const TEN = { first: '2027-03-08', last: '2027-03-19' }; // Mon to Fri of the next week: 10 weekdays
const FIVE = { first: '2027-04-05', last: '2027-04-09' }; // Mon to Fri: 5 weekdays
const SIX = { first: '2027-04-12', last: '2027-04-19' }; // Mon to the next Mon: 6 weekdays (no 5 in its dates)

// ---------------------------------------------------------------------------------------------------
// ROW-154 promise: INV-001 (days left are the allowance minus the counted days IN EFFECT; the pending page's figure
// ROW-154   is a forecast equal to the value after that approval), REQ-002 (the send check and the refusal message
// ROW-154   use that year's days left), REQ-022 (the forecast); A-007 and A-030 (a cancel from today gives the days
// ROW-154   from today on back), A-022 (a switch-off does the same). The row's case: after a partial cancel or a
// ROW-154   switch-off and back on, a vacation for exactly the days given back is accepted.
// ROW-154 wrong product: a send check (or refusal message, or forecast) that sums the approved requests' stored
// ROW-154   first-to-last ranges instead of their days in effect — the balance page right, the door still shut.
// ROW-154 given: two members, each allowance 10, each with an approved vacation Mon 2027-03-08 to Fri 2027-03-19
// ROW-154   (10 days, 0 left). when: today moves to Mon 2027-03-15; the admin cancels P's request (5 days in effect,
// ROW-154   5 given back) and switches S off and back on (the same 5 given back). then: for each, a 6-day vacation
// ROW-154   is refused and its message shows 5 (the days left), a 5-day vacation (exactly the days given back) is
// ROW-154   stored, its pending-page record shows days left 5 and forecast 0, and after approving it the balance
// ROW-154   shows 0 — the forecast.
// ROW-154 controls: ROW-155's target (no cancel: exactly days left minus pending is accepted) — the send check and
// ROW-154   the figures work where no day was given back, so a failure here is the days-in-effect reading.
// ROW-154 technique: a threshold — exactly the days given back, and one day more — at each of the three sites.
// ROW-154 cases: ROW-154 target=ROW-154.INV-001.days-given-back-by-partial-cancel-or-switch-off-are-usable-at-every-site control=ROW-155.REQ-002.exactly-days-left-minus-pending-is-accepted-before-any-cancel
test('ROW-154.INV-001.days-given-back-by-partial-cancel-or-switch-off-are-usable-at-every-site', async () => {
  const admin = await start('2027-03-01');
  const p = await createMember(admin, { allowance: 10 });
  const s = await createMember(admin, { allowance: 10 });
  const requestOf = new Map<Member, AccountId>();
  for (const m of [p, s]) {
    const session = keep(await signInMember(m));
    const id = await sendRequest(session, { kind: 'vacation', firstDay: TEN.first, lastDay: TEN.last });
    await approve(admin, id);
    expect(balanceYear(await readBalance(session), 2027)?.daysLeft, `ROW-154 before: ${m.name} has 0 days left`).toBe(0);
    requestOf.set(m, id);
  }

  await setClock(aucklandMorning('2027-03-15'));
  await adminCancel(admin, requestOf.get(p) as AccountId);
  await switchAccount(admin, s.id, false);
  await switchAccount(admin, s.id, true);

  for (const [label, m] of [
    ['after a partial cancel', p],
    ['after a switch-off and back on', s],
  ] as const) {
    const session = keep(await signInMember(m));
    const over = await post(session, 'vacation', SIX.first, SIX.last);
    expect.soft(over.status, `ROW-154 ${label}: a vacation one day beyond the days given back is refused`).not.toBe(201);
    expect.soft(/(^|[^0-9])5([^0-9]|$)/.test(over.body), `ROW-154 ${label}: the refusal shows 5 days left (body: ${over.body.slice(0, 300)})`).toBe(true);

    const exact = await post(session, 'vacation', FIVE.first, FIVE.last);
    expect(exact.status, `ROW-154 ${label}: a vacation for exactly the 5 days given back is accepted (body: ${exact.body.slice(0, 300)})`).toBe(201);

    const pending = await getJson(admin.api, '/api/admin/pending', 'ROW-154');
    const rec = recordById(pending, exact.id as AccountId);
    expect(rec, `ROW-154 ${label}: the new request is on the pending page`).toBeDefined();
    expect.soft(pendingPageDaysLeft(rec!), `ROW-154 ${label}: the pending page shows 5 days left in 2027`).toBe(5);
    expect.soft(forecastOf(rec!), `ROW-154 ${label}: the pending page's forecast is 0`).toBe(0);

    await approve(admin, exact.id as AccountId);
    expect.soft(balanceYear(await readBalance(session), 2027)?.daysLeft, `ROW-154 ${label}: after approving, days left equal the forecast, 0`).toBe(0);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-155 promise: REQ-002 fail-if (2) "a vacation request within that number is refused" and (1) one beyond it
// ROW-155   accepted; A-002 (a person cannot request beyond the allowance minus approved minus pending vacation days).
// ROW-155   The row's case: before any cancel, a vacation for exactly the days left minus pending is accepted.
// ROW-155 wrong product: an off-by-one check (requested < left − pending instead of ≤), or one that subtracts the
// ROW-155   pending days twice (once in the shown days left, once again in the check).
// ROW-155 given: a member with allowance 10, an approved vacation of 3 days (Mon 03-08 to Wed 03-10) and a pending
// ROW-155   one of 2 days (Mon 03-15 to Tue 03-16): 7 left, 2 pending. when: a 6-day vacation, then a 5-day one, are
// ROW-155   sent. then: the 6-day one is refused; the 5-day one (exactly 7 − 2) is stored.
// ROW-155 controls: the control case shows the setup's figures: 7 days left and 2 pending for 2027.
// ROW-155 technique: the threshold's two sides, exactly at and one beyond.
// ROW-155 cases: ROW-155 target=ROW-155.REQ-002.exactly-days-left-minus-pending-is-accepted-before-any-cancel control=ROW-155.control.the-approved-and-pending-requests-set-the-figures
async function sevenLeftTwoPending(): Promise<{ admin: Actor; session: Actor }> {
  const admin = await start('2027-03-01');
  const m = await createMember(admin, { allowance: 10 });
  const session = keep(await signInMember(m));
  await approve(admin, await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  return { admin, session };
}

test('ROW-155.control.the-approved-and-pending-requests-set-the-figures', async () => {
  const { session } = await sevenLeftTwoPending();
  const y = balanceYear(await readBalance(session), 2027);
  expect(y?.daysLeft, 'ROW-155 control: 7 days left').toBe(7);
  expect(y?.pending, 'ROW-155 control: 2 pending vacation days').toBe(2);
});

test('ROW-155.REQ-002.exactly-days-left-minus-pending-is-accepted-before-any-cancel', async () => {
  const { session } = await sevenLeftTwoPending();
  const over = await post(session, 'vacation', SIX.first, SIX.last);
  expect.soft(over.status, 'ROW-155: a vacation one day beyond days left minus pending is refused').not.toBe(201);
  const exact = await post(session, 'vacation', FIVE.first, FIVE.last);
  expect(exact.status, `ROW-155: a vacation for exactly days left minus pending (5) is accepted (body: ${exact.body.slice(0, 300)})`).toBe(201);
  expect.soft(balanceYear(await readBalance(session), 2027)?.pending, 'ROW-155: it is now pending beside the other (7)').toBe(7);
});

// ---------------------------------------------------------------------------------------------------
// ROW-156 promise: REQ-002 "sick requests are never checked against or taken from the allowance" and its check
// ROW-156   counts "vacation days already approved or pending"; REQ-007 "the pending vacation days of that year shown
// ROW-156   beside it"; A-004. The row's case: with N days left and a sick request pending, a vacation of N days is
// ROW-156   accepted and the pending vacation figure stays 0.
// ROW-156 wrong product: a pending figure (and send check) that sums every pending request whatever its kind.
// ROW-156 given: a member with allowance 4 (N = 4) and a pending sick request of 3 days (Mon 03-15 to Wed 03-17).
// ROW-156   when: the balance is read, then a 4-day vacation (Mon 03-22 to Thu 03-25) is sent. then: before the
// ROW-156   vacation, 2027 shows 4 left and 0 pending; the vacation is stored; then 2027 shows 4 left and 4 pending.
// ROW-156 controls: the control case shows the sick request is stored and pending (it is on the admin's pending
// ROW-156   page), so the harmful case — a pending sick request — is reached.
// ROW-156 technique: the threshold N exactly, with the sick days large enough that counting them would refuse it.
// ROW-156 cases: ROW-156 target=ROW-156.REQ-007.a-pending-sick-request-is-not-pending-vacation control=ROW-156.control.the-sick-request-is-stored-pending
async function sickPending(): Promise<{ admin: Actor; session: Actor; sickId: AccountId }> {
  const admin = await start('2027-03-01');
  const m = await createMember(admin, { allowance: 4 });
  const session = keep(await signInMember(m));
  const sickId = await sendRequest(session, { kind: 'sick', firstDay: '2027-03-15', lastDay: '2027-03-17' });
  return { admin, session, sickId };
}

test('ROW-156.control.the-sick-request-is-stored-pending', async () => {
  const { admin, sickId } = await sickPending();
  const pending = await getJson(admin.api, '/api/admin/pending', 'ROW-156 control');
  expect(recordById(pending, sickId), 'ROW-156 control: the sick request is on the pending page').toBeDefined();
});

test('ROW-156.REQ-007.a-pending-sick-request-is-not-pending-vacation', async () => {
  const { session } = await sickPending();
  const before = balanceYear(await readBalance(session), 2027);
  expect.soft(before?.pending, 'ROW-156: with only a sick request pending, pending vacation is 0').toBe(0);
  expect.soft(before?.daysLeft, 'ROW-156: days left are 4').toBe(4);
  const vac = await post(session, 'vacation', '2027-03-22', '2027-03-25');
  expect(vac.status, `ROW-156: a vacation of all 4 days left is accepted beside the pending sick request (body: ${vac.body.slice(0, 300)})`).toBe(201);
  const after = balanceYear(await readBalance(session), 2027);
  expect.soft(after?.pending, 'ROW-156: pending vacation is now exactly the vacation, 4').toBe(4);
  expect.soft(after?.daysLeft, 'ROW-156: days left still 4').toBe(4);
});

// ---------------------------------------------------------------------------------------------------
// ROW-156 — on the own page itself (added, slice 1, test-author-9; lesson L-1)
// ROW-156 promise: as above — REQ-007 "with the pending vacation days of that year shown beside it" and REQ-002 "sick
// ROW-156   requests are never checked against or taken from the allowance", A-004, on the page the person sees: with N
// ROW-156   days left and only a sick request pending, / draws that year's pending vacation figure as 0 beside the N.
// ROW-156 wrong product: GET /api/balance right, but / sums its pending figure on the client from the listed pending
// ROW-156   requests whatever their kind — 2027 draws 3 pending (the sick days) before the vacation and 7 (3 + 4) after.
// ROW-156 given: sickPending (allowance 4, N = 4; a pending sick request Mon 15..Wed 17 March 2027, 3 days). when: the
// ROW-156   member's browser opens /; then a 4-day vacation Mon 22..Thu 25 March is sent (201) and / is opened again.
// ROW-156   then: before the vacation, 2027's figures draw 4 (days left) and 0 (pending vacation) and not 3; after it,
// ROW-156   they draw 4 and not 7 and not 3, and they are not what they were before (the pending figure moved).
// ROW-156 controls: ROW-156.control.page-draws-the-days-left-with-a-sick-request-pending — / draws 2027's days left 4
// ROW-156   with the sick request pending: the page and the reading work, untouched by a fault in the pending figure's
// ROW-156   kind; ROW-156.control.the-sick-request-is-stored-pending shows the harmful case is reached.
// ROW-156 technique: a decoy per wrong rule — the sick days' 3, and 3 + 4 = 7 — each a number of its own in that
// ROW-156   year's drawn figures (own-page.ts saysNumber, the years and the requests' days taken out); before and after.
// ROW-156 cases: ROW-156 target=ROW-156.REQ-007.page-draws-no-pending-vacation-for-a-pending-sick-request control=ROW-156.control.page-draws-the-days-left-with-a-sick-request-pending

const DAYS_156 = ['2027-03-15', '2027-03-17', '2027-03-22', '2027-03-25'];

/** True when the page's figures for `year` draw `n` as a number of its own (the years and the requests' days left out). */
function drawn156(f: OwnFigures, year: number, n: number): boolean {
  return saysNumber(f.years[year] ?? '', n, DAYS_156, ['2027', '2028']);
}

/** The page's figures for `year`, quoted for a message. */
function shown156(f: OwnFigures, year: number): string {
  return f.years[year] === null || f.years[year] === undefined ? `(no figures for ${year}; page: "${f.body.slice(0, 400)}")` : `"${f.years[year]}"`;
}

test('ROW-156.control.page-draws-the-days-left-with-a-sick-request-pending', async ({ browser }) => {
  const { session } = await sickPending();
  const f = await readOwnFigures(browser, session, [2027, 2028]);
  expect.soft(f.status, 'ROW-156 control: / answers the member').toBe(200);
  expect(drawn156(f, 2027, 4), `ROW-156 control: / draws 2027's days left 4 with the sick request pending: ${shown156(f, 2027)}`).toBe(true);
});

test('ROW-156.REQ-007.page-draws-no-pending-vacation-for-a-pending-sick-request', async ({ browser }) => {
  const { session } = await sickPending();
  const before = await readOwnFigures(browser, session, [2027, 2028]);
  expect.soft(drawn156(before, 2027, 4), `ROW-156: / draws 2027's days left 4: ${shown156(before, 2027)}`).toBe(true);
  expect.soft(drawn156(before, 2027, 0), `ROW-156: with only a sick request pending, / draws 2027's pending vacation 0: ${shown156(before, 2027)}`).toBe(true);
  expect.soft(drawn156(before, 2027, 3), `ROW-156: / does not draw the 3 pending sick days as pending vacation: ${shown156(before, 2027)}`).toBe(false);

  const vac = await post(session, 'vacation', '2027-03-22', '2027-03-25');
  expect(vac.status, `ROW-156: a vacation of all 4 days left is accepted beside the pending sick request (body: ${vac.body.slice(0, 300)})`).toBe(201);
  const after = await readOwnFigures(browser, session, [2027, 2028]);
  expect.soft(after.years[2027] !== before.years[2027], `ROW-156: after the vacation, 2027's drawn figures change (pending 0 → 4): before ${shown156(before, 2027)}, after ${shown156(after, 2027)}`).toBe(true);
  expect.soft(drawn156(after, 2027, 4), `ROW-156: / draws 2027's days left and pending vacation 4: ${shown156(after, 2027)}`).toBe(true);
  expect.soft(drawn156(after, 2027, 7), `ROW-156: / does not draw 3 + 4 = 7 (the sick days counted as pending vacation): ${shown156(after, 2027)}`).toBe(false);
  expect.soft(drawn156(after, 2027, 3), `ROW-156: / does not draw the 3 sick days in 2027's figures: ${shown156(after, 2027)}`).toBe(false);
});
