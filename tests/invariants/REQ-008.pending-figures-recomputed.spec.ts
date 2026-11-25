// Purpose: ledger test for ROW-160 (REQ-008, REQ-022) — after the admin decides one request of a person, the figures shown for that person's other pending requests are recomputed before the next decision.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, requests, approvals), fresh per run; readings of the pending page's open fields from readings.ts; the page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn figures read on /admin/pending beside the API, the decisions operated on the page), through page-figures.ts, journey-pages.ts and own-page.ts.
//
// Boundary (R6): the figures the pending page shows are the request records of GET /api/admin/pending (D-029),
// read at the HTTP harness after each decision, before the next one.
// The page cases (at the end) open /admin/pending in the admin's browser (engine door), operate the decisions there
// and read the drawn rows on the same page, never reloading it.
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
// ROW-160 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)
import { test, expect, type Page } from '@playwright/test';
import { approve, createMember, freshName, openPage, PAGES, readBalance, resetProduct, sendRequest, signIn, signInMember, type AccountId, type Actor, type RequestSpec } from './harness';
import { awaitConfirmation, control, expectPath, itemLocator, recordDialogs, waitItems } from './journey-pages';
import { saysNumber } from './own-page';
import { pendingItemCount, pendingRowsNow, rowLabelled, type PendingSpec, type ReadRow } from './page-figures';
import { datePatterns } from './page-reading';
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

// =====================================================================================================
// ROW-160 — on the pending page itself, the decisions operated there (added, slice 1, test-author-8; lesson L-1)
// =====================================================================================================
// The cases above read GET /api/admin/pending after an API approval; a page that keeps the figures it drew at load
// (or works them out on the client once) keeps them green. These cases open /admin/pending once in the admin's
// browser (engine door), operate the approve control of a row and its confirmation on that page, and read the
// rows drawn afterwards on the same page — never navigating or reloading it from the test. A row is found by the
// person's name and the request's first day (page-figures.ts); a figure is a number of its own once the row's days,
// times of day, names and the year are taken out (own-page.ts saysNumber).
//
// ROW-160 promise: REQ-008 "for vacation that person's days left in its year" and REQ-022 "before approving, the
// ROW-160   pending page shows, labelled as such, the days left the approval would leave", fail-if (3) "the shown
// ROW-160   figure differs from the days left after the approval"; INV-001 (the forecast equals the value after that
// ROW-160   approval); the row: after the admin decides one request of a person, the figures shown for that person's
// ROW-160   other pending requests are recomputed before the next decision.
// ROW-160 wrong product: the pending data recomputed, but the page keeps the rows it drew at load and only removes
// ROW-160   the decided one, so R2 still draws 13 and 11 when the admin decides it; or redraws every row's figures from
// ROW-160   one person's balance, moving the neighbour's too.
// ROW-160 given: setup160Page — today Mon 1 March 2027 (team zone); Maren, allowance 13, pending R1 Mon 8..Thu 11
// ROW-160   March (4) and R2 Mon 15..Tue 16 March (2); Nadia, allowance 16, pending N1 Mon 22..Wed 24 March (3). when: the
// ROW-160   admin's browser opens /admin/pending, the admin operates R1's approve control and confirms, then — on the
// ROW-160   same page — operates R2's approve control and confirms. then: before, R2's row draws 13 and 11; after R1's
// ROW-160   approval, R1's row is gone and R2's row draws 9 (13 − 4) and 7 (9 − 2) and neither 13 nor 11, while N1's
// ROW-160   row still draws 16 and 13; after R2's approval Maren's 2027 days left is 7, the figure R2's row drew.
// ROW-160 controls: ROW-160.control.page-draws-the-allowance-based-figures-before-a-decision — before any decision
// ROW-160   the page draws R2 with 13 and 11 and N1 with 16 and 13: the figures are on the page and start where the
// ROW-160   target expects, so a stale page is the redraw, not the reading.
// ROW-160 technique: before and after the sibling decision, on the same row of the same loaded page, with a
// ROW-160   neighbour as the decoy; every figure in play distinct from the counts and the days.
// ROW-160 cases: ROW-160 target=ROW-160.REQ-022.page-redraws-the-other-pending-figures-after-a-decision control=ROW-160.control.page-draws-the-allowance-based-figures-before-a-decision

const R1_PAGE: RequestSpec = { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-11' };
const R2_PAGE: RequestSpec = { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' };
const N1_PAGE: RequestSpec = { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' };
/** Every day a row of setup160Page may draw: the requests' days and the send date. */
const DAYS_160 = [R1_PAGE, R2_PAGE, N1_PAGE].flatMap((r) => [r.firstDay, r.lastDay]).concat(['2027-03-01']);
const APPROVE = /^approve$/i;

async function setup160Page() {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { name: freshName('Maren'), allowance: 13 });
  const n = await createMember(admin, { name: freshName('Nadia'), allowance: 16 });
  const session = keep(await signInMember(m));
  const nSession = keep(await signInMember(n));
  await sendRequest(session, R1_PAGE);
  await sendRequest(session, R2_PAGE);
  await sendRequest(nSession, N1_PAGE);
  const specs: PendingSpec[] = [
    { label: 'R1', name: m.name, firstDay: R1_PAGE.firstDay },
    { label: 'R2', name: m.name, firstDay: R2_PAGE.firstDay },
    { label: 'N1', name: n.name, firstDay: N1_PAGE.firstDay },
  ];
  const lit = [m.name, n.name, m.email, n.email, install.admin.name, '2027'];
  const says = (row: ReadRow, k: number) => saysNumber(row.text, k, DAYS_160, lit);
  return { admin, session, m, n, specs, says };
}

const quote160 = (row: ReadRow) => (row.found ? `"${row.text}"` : '(not drawn)');

/** Operates the approve control of the one row carrying `name` and `firstDay`, then its confirmation step, on the loaded page. */
async function approveOnPage(page: Page, dialogs: string[], name: string, firstDay: string, what: string): Promise<void> {
  const [item] = await waitItems(page, { includes: [name], patterns: [datePatterns(firstDay).join('|')] }, 1, `${what}: the row to approve`);
  const before = dialogs.length;
  await control(itemLocator(page, item), APPROVE).first().click();
  const shown = await awaitConfirmation(page, dialogs, before, name, what);
  await shown.confirm();
  await expectPath(page, PAGES.adminPending, `${what}: the pending requests page is shown again`);
}

test('ROW-160.control.page-draws-the-allowance-based-figures-before-a-decision', async ({ browser }) => {
  const s = await setup160Page();
  const opened = await openPage(browser, s.admin);
  try {
    expect((await opened.page.goto(PAGES.adminPending))?.status(), 'ROW-160 control: /admin/pending answers the admin').toBe(200);
    const rows = await pendingRowsNow(opened.page, s.specs);
    const r2 = rowLabelled(rows, 'R2');
    const n1 = rowLabelled(rows, 'N1');
    expect(r2.found && n1.found, `ROW-160 control: the page draws R2 and N1: ${quote160(r2)} / ${quote160(n1)}`).toBe(true);
    expect.soft(s.says(r2, 13), `ROW-160 control: R2's row draws 13 days left: ${quote160(r2)}`).toBe(true);
    expect.soft(s.says(r2, 11), `ROW-160 control: R2's row draws the forecast 11: ${quote160(r2)}`).toBe(true);
    expect.soft(s.says(n1, 16), `ROW-160 control: N1's row draws 16 days left: ${quote160(n1)}`).toBe(true);
    expect.soft(s.says(n1, 13), `ROW-160 control: N1's row draws the forecast 13: ${quote160(n1)}`).toBe(true);
  } finally {
    await opened.close();
  }
});

test('ROW-160.REQ-022.page-redraws-the-other-pending-figures-after-a-decision', async ({ browser }) => {
  const s = await setup160Page();
  const opened = await openPage(browser, s.admin);
  const page = opened.page;
  const dialogs = recordDialogs(page);
  try {
    expect((await page.goto(PAGES.adminPending))?.status(), 'ROW-160: /admin/pending is reached (setup)').toBe(200);
    const before = await pendingRowsNow(page, s.specs);
    const r2Before = rowLabelled(before, 'R2');
    expect(r2Before.found, `ROW-160: before any decision the page draws R2: ${quote160(r2Before)}`).toBe(true);
    expect.soft(s.says(r2Before, 13) && s.says(r2Before, 11), `ROW-160: before, R2's row draws 13 and 11: ${quote160(r2Before)}`).toBe(true);

    await approveOnPage(page, dialogs, s.m.name, R1_PAGE.firstDay, 'ROW-160 approving R1');
    const r1Listed = await pendingItemCount(page, s.specs[0], 0);
    expect.soft(r1Listed, 'ROW-160: the approved R1 has left the list (a notice saying it is approved is not a listed row)').toBe(0);
    const after = await pendingRowsNow(page, s.specs, {
      mustFind: ['R2', 'N1'],
      until: (rows) => s.says(rowLabelled(rows, 'R2'), 9),
    });
    const r2 = rowLabelled(after, 'R2');
    const n1 = rowLabelled(after, 'N1');
    expect(r2.found, 'ROW-160: R2 is still drawn on the page').toBe(true);
    expect.soft(s.says(r2, 9), `ROW-160: without a reload, R2's row now draws 9 days left (13 − 4): ${quote160(r2)}`).toBe(true);
    expect.soft(s.says(r2, 7), `ROW-160: without a reload, R2's row now draws the forecast 7 (9 − 2): ${quote160(r2)}`).toBe(true);
    expect.soft(s.says(r2, 13), `ROW-160: R2's row no longer draws the days left 13: ${quote160(r2)}`).toBe(false);
    expect.soft(s.says(r2, 11), `ROW-160: R2's row no longer draws the forecast 11: ${quote160(r2)}`).toBe(false);
    expect.soft(s.says(n1, 16) && s.says(n1, 13), `ROW-160: the neighbour N1's row still draws 16 and 13: ${quote160(n1)}`).toBe(true);

    await approveOnPage(page, dialogs, s.m.name, R2_PAGE.firstDay, 'ROW-160 approving R2');
    const left = balanceYear(await readBalance(s.session), 2027)?.daysLeft;
    expect.soft(left, "ROW-160: after approving R2 Maren's 2027 days left is 7").toBe(7);
    expect.soft(left !== undefined && s.says(r2, left), `ROW-160: the days left after the approval (${left}) is the figure R2's row drew before it: ${quote160(r2)}`).toBe(true);
  } finally {
    await opened.close();
  }
});
