// Purpose: ledger tests for ROW-207 (REQ-005, REQ-009, REQ-010) and ROW-219 (REQ-005, REQ-009) — a success message only for an outcome the server recorded, never for a refused, failed or overtaken action; and after an action refused because the request changed, the page shows the current state.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approve), fresh per run; the failed send is a 500 played by the browser's own network layer (page.route), so nothing in the product is touched.
//
// Boundary (R6): what the page says after a press is paint and operation, proved in the browser; what the server
// recorded is read at the HTTP harness (GET /api/requests). Form readings: robustness.ts.
// The success text is LEARNED, not guessed: the lines a recorded send made appear, minus the lines a fresh load of the
// page it landed on shows (so a list or a heading is not taken for the message). It is checked together with a strict
// reading of success words (STRICT_SUCCESS), so a product whose success line was not learned is still read.
import { test, expect, type Page } from '@playwright/test';
import { approve, cancelOwnRequest, createMember, openPage, sendRequest, signInMember, type Actor } from './harness';
import {
  disposeAll,
  fillSendForm,
  freshTeam,
  keep,
  newLines,
  openSendForm,
  ownRequests,
  pressCancel,
  rejectThroughPage,
  sendButton,
  settle,
  textLines,
} from './robustness';

test.afterEach(disposeAll);

/** Success in plain words: "success…", or "request (was|has been) sent/saved/submitted/recorded" — never "not sent". */
const STRICT_SUCCESS = /\b(success|successful|successfully)\b|\b(request|it) (was |has been |is )?(sent|saved|submitted|recorded)\b/i;
/** A cancel confirmation standing as its own line ("Request cancelled.", "Cancelled successfully"). */
const CANCEL_DONE = /^\s*(your )?(request )?(was |has been )?cancell?ed( successfully)?[.!]?\s*$/i;
/** A rejection confirmation standing as its own line ("Request rejected.", "Rejected successfully"). */
const REJECT_DONE = /^\s*(the )?(request )?(was |has been )?rejected( successfully)?[.!]?\s*$/i;

/** Presses Send on a filled form and answers the lines that appeared. */
async function pressAndRead(page: Page, spec: { kind: 'vacation' | 'sick'; firstDay: string; lastDay: string }): Promise<string[]> {
  await openSendForm(page);
  const form = await fillSendForm(page, spec, { press: false });
  const before = await textLines(page);
  await sendButton(form).click();
  await settle(page);
  return newLines(before, await textLines(page));
}

/** Counts the words in the page's text. */
async function wordCount(page: Page, re: RegExp): Promise<number> {
  const text = (await textLines(page)).join('\n');
  return (text.match(new RegExp(re.source, 'gi')) ?? []).length;
}

async function memberWithOnePending(admin: Actor): Promise<{ actor: Actor; requestId: string }> {
  const m = await createMember(admin);
  const actor = keep(await signInMember(m));
  const requestId = String(await sendRequest(actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' }));
  return { actor, requestId };
}

// ---------------------------------------------------------------------------------------------------
// ROW-207 promise: the row — a success message appears only for an outcome the server recorded; a refused, failed
// ROW-207   or overtaken action never shows success; REQ-005 (a person's own cancel, refused once the request is no
// ROW-207   longer pending), REQ-009 (only a pending request is decided), REQ-010.
// ROW-207 wrong product: a page that shows "Request sent" as soon as Send is pressed (optimistic UI), whatever the
// ROW-207   server then answers; or that treats any answer without a thrown error — a 409, a 500 page — as done.
// ROW-207 given: member M1 (no requests); member M2 with one pending vacation on 15..16 Mar 2027; member M3 with one
// ROW-207   pending day on 22 Mar; today Mon 8 Mar.
// ROW-207   when: M1 sends 15..17 Mar from the form (recorded: the success text is learned); M1 then sends 16 Mar
// ROW-207   (refused: it shares a day); M1 sends 22 Mar while the browser answers the post with a 500 (failed);
// ROW-207   M2's page is open when the admin approves M2's request, and M2 presses Cancel (overtaken); the admin's
// ROW-207   pending page is open when M3 cancels, and the admin rejects M3's request there (overtaken, REQ-009).
// ROW-207   then: after the refused, the failed and both overtaken presses no learned success line, no success wording
// ROW-207   and no "cancelled"/"rejected" confirmation appears; M1 still has exactly one request, M2's request is still
// ROW-207   approved and M3's still cancelled.
// ROW-207 controls: the control case shows M1's valid send recorded (one request) — the form reaches the server,
// ROW-207   so the absence of success later is about the outcome, not an unreachable form.
// ROW-207 technique: the success text learned from the product itself on a recorded send, then looked for after each
// ROW-207   unrecorded outcome; the failure is injected at the browser's network layer and checked to have been hit.
// ROW-207 cases: ROW-207 target=ROW-207.REQ-005.no-success-for-a-refused-failed-or-overtaken-action control=ROW-207.control.a-valid-send-is-recorded
test('ROW-207.control.a-valid-send-is-recorded', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m1 = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, m1);
  try {
    await pressAndRead(opened.page, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
    await expect.poll(async () => (await ownRequests(m1)).length, { message: 'ROW-207 control: the send is recorded', timeout: 10_000 }).toBe(1);
  } finally {
    await opened.close();
  }
});

test('ROW-207.REQ-005.no-success-for-a-refused-failed-or-overtaken-action', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m1 = keep(await signInMember(await createMember(admin)));
  const one = await openPage(browser, m1);
  let learned: string[] = [];
  try {
    // Learn the success text from a recorded send.
    const appeared = await pressAndRead(one.page, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
    await expect.poll(async () => (await ownRequests(m1)).length, { message: 'ROW-207 setup: the valid send is recorded', timeout: 10_000 }).toBe(1);
    const landed = new URL(one.page.url());
    await one.page.goto(landed.pathname);
    await settle(one.page);
    const fresh = new Set(await textLines(one.page));
    learned = appeared.filter((l) => !fresh.has(l));

    // Refused: 16 Mar shares a day with the pending 15..17 Mar.
    const refused = await pressAndRead(one.page, { kind: 'vacation', firstDay: '2027-03-16', lastDay: '2027-03-16' });
    expect.soft(refused.filter((l) => learned.includes(l)), `ROW-207 refused: no learned success line appears (learned: ${JSON.stringify(learned)})`).toEqual([]);
    expect.soft(refused.filter((l) => STRICT_SUCCESS.test(l)), 'ROW-207 refused: no success wording appears').toEqual([]);

    // Failed: the browser answers the post with a 500.
    let hits = 0;
    await one.page.route('**/api/requests', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      hits += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Server Error' }) });
    });
    const failed = await pressAndRead(one.page, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' });
    expect(hits, 'ROW-207 setup: the send form posts to /api/requests (D-029), where the failure is played').toBeGreaterThan(0);
    expect.soft(failed.filter((l) => learned.includes(l)), 'ROW-207 failed: no learned success line appears').toEqual([]);
    expect.soft(failed.filter((l) => STRICT_SUCCESS.test(l)), 'ROW-207 failed: no success wording appears').toEqual([]);
    await one.page.unroute('**/api/requests');
  } finally {
    await one.close();
  }
  expect.soft(await ownRequests(m1), 'ROW-207: M1 still has exactly the one recorded request').toHaveLength(1);

  // Overtaken: the admin approves while M2's page is open; M2 presses Cancel.
  const { actor: m2, requestId } = await memberWithOnePending(admin);
  const two = await openPage(browser, m2);
  try {
    await two.page.goto('/');
    await settle(two.page);
    await approve(admin, requestId);
    const before = await textLines(two.page);
    await pressCancel(two.page);
    await settle(two.page);
    const overtaken = newLines(before, await textLines(two.page));
    expect.soft(overtaken.filter((l) => learned.includes(l)), 'ROW-207 overtaken: no learned success line appears').toEqual([]);
    expect.soft(overtaken.filter((l) => STRICT_SUCCESS.test(l) || CANCEL_DONE.test(l)), 'ROW-207 overtaken: no success or "cancelled" confirmation appears').toEqual([]);
  } finally {
    await two.close();
  }
  const after = (await ownRequests(m2)).find((r) => r.id === requestId);
  expect.soft(after?.state, "ROW-207 overtaken: the server kept M2's request approved").toBe('approved');

  // Overtaken, the admin's side: M3 cancels while the admin's pending page is open; the admin then rejects it there.
  const m3Member = await createMember(admin);
  const m3 = keep(await signInMember(m3Member));
  const m3Request = String(await sendRequest(m3, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' }));
  const three = await openPage(browser, admin);
  try {
    await three.page.goto('/admin/pending');
    await settle(three.page);
    await cancelOwnRequest(m3, m3Request);
    const before = await textLines(three.page);
    await rejectThroughPage(three.page, m3Member.name, 'late');
    await settle(three.page);
    const overtaken = newLines(before, await textLines(three.page));
    expect.soft(overtaken.filter((l) => learned.includes(l)), "ROW-207 overtaken (admin): no learned success line appears").toEqual([]);
    expect.soft(overtaken.filter((l) => STRICT_SUCCESS.test(l) || REJECT_DONE.test(l)), 'ROW-207 overtaken (admin): no success or "rejected" confirmation appears').toEqual([]);
  } finally {
    await three.close();
  }
  expect.soft((await ownRequests(m3)).find((r) => r.id === m3Request)?.state, "ROW-207 overtaken (admin): the server kept M3's request cancelled").toBe('cancelled');
});

// ---------------------------------------------------------------------------------------------------
// ROW-219 promise: the row — after an action is refused because the request changed, the page shown reflects the
// ROW-219   current state, not the stale one; REQ-005 (a person cannot cancel their own approved request), REQ-009.
// ROW-219 wrong product: a page that, on the refused cancel, shows an error and leaves the stale list — the request
// ROW-219   still shown pending with its Cancel button — until the person reloads by hand.
// ROW-219 given: member M with one pending vacation, its own requests page open (one Cancel button). when: the admin
// ROW-219   approves the request (the open page is now stale), then M presses Cancel on it. then: without a reload by
// ROW-219   the test, the page comes to show the request approved (the word "approved" appears once more than before)
// ROW-219   and offers no Cancel for it; the server holds it approved.
// ROW-219 controls: the control case approves first and loads the page fresh: "approved" shown and no Cancel button,
// ROW-219   so the reading (the word, the button) tells the current state from the stale one.
// ROW-219 technique: before/after on the same open page around the overtaken press; the button that only a pending
// ROW-219   request carries is the exact place the stale state shows.
// ROW-219 cases: ROW-219 target=ROW-219.REQ-005.a-refused-cancel-shows-the-request-as-it-now-is control=ROW-219.control.a-fresh-page-shows-the-approved-request-without-cancel
test('ROW-219.control.a-fresh-page-shows-the-approved-request-without-cancel', async ({ browser }) => {
  const { admin } = await freshTeam();
  const { actor, requestId } = await memberWithOnePending(admin);
  await approve(admin, requestId);
  const opened = await openPage(browser, actor);
  try {
    await opened.page.goto('/');
    await settle(opened.page);
    expect(await wordCount(opened.page, /\bapproved\b/), 'ROW-219 control: the fresh page shows "approved"').toBeGreaterThan(0);
    await expect(opened.page.getByRole('button', { name: /^cancel/i }), 'ROW-219 control: no Cancel on an approved request').toHaveCount(0);
  } finally {
    await opened.close();
  }
});

test('ROW-219.REQ-005.a-refused-cancel-shows-the-request-as-it-now-is', async ({ browser }) => {
  const { admin } = await freshTeam();
  const { actor, requestId } = await memberWithOnePending(admin);
  const opened = await openPage(browser, actor);
  const page = opened.page;
  try {
    await page.goto('/');
    await settle(page);
    await expect(page.getByRole('button', { name: /^cancel/i }), 'ROW-219 setup: the pending request offers Cancel').toHaveCount(1);
    const approvedBefore = await wordCount(page, /\bapproved\b/);

    await approve(admin, requestId);
    await pressCancel(page);
    await settle(page);

    await expect
      .poll(async () => page.getByRole('button', { name: /^cancel/i }).count(), { message: 'ROW-219: the page no longer offers Cancel on the approved request', timeout: 10_000 })
      .toBe(0);
    expect.soft(await wordCount(page, /\bapproved\b/), 'ROW-219: the page now shows the request approved').toBeGreaterThan(approvedBefore);
  } finally {
    await opened.close();
  }
  expect((await ownRequests(actor)).find((r) => r.id === requestId)?.state, 'ROW-219: the server holds it approved').toBe('approved');
});
