// Purpose: ledger test for ROW-160 (REQ-008, REQ-022) — after the admin decides one request of a person, the figures shown for that person's other pending requests are recomputed before the next decision.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, requests, approvals), fresh per run; readings of the pending page's open fields from readings.ts.
//
// Boundary (R6): the figures the pending page shows are the request records of GET /api/admin/pending (D-029),
// read at the HTTP harness after each decision, before the next one.
//
// ROW-160 promise: REQ-008 "for vacation that person's days left in its year"; REQ-022 "before approving, the
// ROW-160   pending page shows, labelled as such, the days left the approval would leave" and fail-if (3) "the shown
// ROW-160   figure differs from the days left after the approval"; INV-001 (the forecast equals the value after that
// ROW-160   approval). The row's case: after one decision, the other pending requests' figures are recomputed.
// ROW-160 wrong product: figures computed once per request when it was sent (or cached per page load) and not
// ROW-160   recomputed after a sibling request is approved; or a forecast that subtracts every pending request.
// ROW-160 given: today Mon 2027-03-01 (Auckland); a member with allowance 10 and two pending 2027 vacations,
// ROW-160   R1 Mon 03-08..Thu 03-11 (4) and R2 Mon 03-15..Wed 03-17 (3); a second member N with one pending vacation
// ROW-160   (the neighbour whose figures must not move). when: the admin approves R1, then reads the pending page.
// ROW-160   then: R1 is gone from it; R2 shows days left 6 (was 10) and forecast 3 (was 7); N's request still shows
// ROW-160   10 and 8; after approving R2 the member's days left are 3, the forecast shown.
// ROW-160 controls: the control case reads the pending page before any decision: R2 shows 10 and 7 — the page
// ROW-160   carries the figures and they start where the target expects.
// ROW-160 technique: before and after the sibling decision, on the same record, with a neighbour as decoy.
// ROW-160 cases: ROW-160 target=ROW-160.REQ-022.a-decision-recomputes-the-other-pending-requests-figures control=ROW-160.control.before-a-decision-the-figures-are-the-allowance-based-ones
import { test, expect } from '@playwright/test';
import { approve, createMember, readBalance, resetProduct, sendRequest, signIn, signInMember, type AccountId, type Actor } from './harness';
import { aucklandMorning, balanceYear, forecastOf, getJson, pendingPageDaysLeft, recordById } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function setup(): Promise<{ admin: Actor; session: Actor; r1: AccountId; r2: AccountId; n1: AccountId }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 10 });
  const n = await createMember(admin, { allowance: 10 });
  const session = keep(await signInMember(m));
  const nSession = keep(await signInMember(n));
  const r1 = await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-11' });
  const r2 = await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
  const n1 = await sendRequest(nSession, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-09' });
  return { admin, session, r1, r2, n1 };
}

test('ROW-160.control.before-a-decision-the-figures-are-the-allowance-based-ones', async () => {
  const { admin, r2 } = await setup();
  const rec = recordById(await getJson(admin.api, '/api/admin/pending', 'ROW-160 control'), r2);
  expect(rec, 'ROW-160 control: R2 is on the pending page').toBeDefined();
  expect(pendingPageDaysLeft(rec!), 'ROW-160 control: R2 shows 10 days left').toBe(10);
  expect(forecastOf(rec!), 'ROW-160 control: R2 shows a forecast of 7').toBe(7);
});

test('ROW-160.REQ-022.a-decision-recomputes-the-other-pending-requests-figures', async () => {
  const { admin, session, r1, r2, n1 } = await setup();
  await approve(admin, r1);
  const page = await getJson(admin.api, '/api/admin/pending', 'ROW-160');
  expect.soft(recordById(page, r1), 'ROW-160: the approved R1 has left the pending page').toBeUndefined();
  const rec = recordById(page, r2);
  expect(rec, 'ROW-160: R2 is still on the pending page').toBeDefined();
  expect.soft(pendingPageDaysLeft(rec!), 'ROW-160: R2 now shows 6 days left (10 − 4)').toBe(6);
  expect.soft(forecastOf(rec!), 'ROW-160: R2 now shows a forecast of 3 (6 − 3)').toBe(3);
  const nrec = recordById(page, n1);
  expect.soft(nrec && pendingPageDaysLeft(nrec), "ROW-160: the neighbour's request still shows 10 days left").toBe(10);
  expect.soft(nrec && forecastOf(nrec), "ROW-160: the neighbour's request still shows a forecast of 8").toBe(8);

  await approve(admin, r2);
  expect(balanceYear(await readBalance(session), 2027)?.daysLeft, 'ROW-160: after approving R2 the days left are the forecast shown, 3').toBe(3);
});
