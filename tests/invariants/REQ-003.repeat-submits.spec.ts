// Purpose: ledger tests for ROW-208 and ROW-209 (REQ-003, REQ-009) — a double click, reload or Back after a submitted send form never repeats the send and never shows a refusal of the person's own first submit; one submit records exactly one request and shows its success.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts), fresh per run.
//
// Boundary (R6): double click, reload and Back are browser operations, proved in the browser on /requests/new; what
// was recorded is read at the HTTP harness (GET /api/requests, GET /api/balance). Form readings: robustness.ts.
// The overlap refusal's text is LEARNED at the end of ROW-208's case by deliberately sending the same days again, so
// "never shows a refusal of its own first submit" looks for the product's own refusal text, not a guess.
import { test, expect } from '@playwright/test';
import { createMember, openPage, signInMember } from './harness';
import {
  disposeAll,
  fillSendForm,
  freshInt,
  freshTeam,
  keep,
  newLines,
  openSendForm,
  ownRequests,
  pendingDays,
  sendButton,
  settle,
  SUCCESS_WORDS,
  textLines,
  weekdaysBetween,
} from './robustness';

test.afterEach(disposeAll);

const REFUSAL_WORDS = /\b(refused|overlap|overlaps|overlapping|conflict|conflicts)\b/i;

/** A fresh range of 1..4 weekdays starting Mon 2027-03-15 (today is Mon 2027-03-08). */
function freshRange(): { kind: 'vacation'; firstDay: string; lastDay: string; days: number } {
  const days = freshInt(1, 4);
  const lastDay = ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18'][days - 1];
  return { kind: 'vacation', firstDay: '2027-03-15', lastDay, days: weekdaysBetween('2027-03-15', lastDay).length };
}

// ---------------------------------------------------------------------------------------------------
// ROW-208 promise: the row — a double click, reload or Back after a submitted form never repeats the action and
// ROW-208   never shows a refusal of the user's own first submit; REQ-003 (a second request sharing a day would be
// ROW-208   refused — so a repeat shows as either a second request or that refusal), REQ-009.
// ROW-208 wrong product: a Send button that stays enabled while the post is in flight, so a double click posts twice
// ROW-208   (two requests, or the second refused "you already have a request on these days" over the first's
// ROW-208   success); or a form that posts as a page navigation, so a reload re-posts it.
// ROW-208 given: member M with no requests; a fresh range of N (1..4) weekdays from Mon 15 Mar 2027. when: M fills
// ROW-208   the form and double-clicks Send; then reloads the page; then goes Back. then: after each, M has exactly one
// ROW-208   request and N pending days, and no line of the product's own overlap refusal (learned last by sending the
// ROW-208   same days again from a fresh form) nor refusal wording appeared.
// ROW-208 controls: the control case clicks Send once and gets exactly one request — the form, days and session
// ROW-208   work; in the target the learned refusal must itself record nothing, showing the overlap rule is on and its
// ROW-208   text is what a refused repeat would show.
// ROW-208 technique: before/after counts on the server around each browser operation; the decoy is the product's
// ROW-208   own refusal text, learned, so a repeat refused by the server cannot hide behind unguessed wording.
// ROW-208 cases: ROW-208 target=ROW-208.REQ-003.double-click-reload-and-back-never-repeat-the-send control=ROW-208.control.one-click-records-one-request
test('ROW-208.control.one-click-records-one-request', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, m);
  try {
    await openSendForm(opened.page);
    await fillSendForm(opened.page, freshRange());
    await settle(opened.page);
    await expect.poll(async () => (await ownRequests(m)).length, { message: 'ROW-208 control: one click records one request', timeout: 10_000 }).toBe(1);
  } finally {
    await opened.close();
  }
});

test('ROW-208.REQ-003.double-click-reload-and-back-never-repeat-the-send', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  const page = opened.page;
  const seen: { step: string; lines: string[] }[] = [];
  try {
    await openSendForm(page);
    const form = await fillSendForm(page, range, { press: false });
    let before = await textLines(page);
    await sendButton(form).click({ clickCount: 2 });
    await settle(page);
    seen.push({ step: 'double click', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 double click: exactly one request recorded').toBe(1);
    expect.soft(await pendingDays(m, 2027), `ROW-208 double click: exactly ${range.days} days pending`).toBe(range.days);

    before = await textLines(page);
    await page.reload();
    await settle(page);
    seen.push({ step: 'reload', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 reload: still exactly one request').toBe(1);

    before = await textLines(page);
    await page.goBack().catch(() => null);
    await settle(page);
    seen.push({ step: 'back', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 back: still exactly one request').toBe(1);
    expect.soft(await pendingDays(m, 2027), `ROW-208: still exactly ${range.days} days pending`).toBe(range.days);

    // Learn the product's own overlap refusal: the same days sent again, deliberately, from a fresh form.
    await openSendForm(page);
    const again = await fillSendForm(page, range, { press: false });
    before = await textLines(page);
    await sendButton(again).click();
    await settle(page);
    const refusal = newLines(before, await textLines(page));
    expect((await ownRequests(m)).length, 'ROW-208 setup: the deliberate repeat is refused (overlap rule on)').toBe(1);
    for (const s of seen) {
      expect.soft(s.lines.filter((l) => refusal.includes(l)), `ROW-208 ${s.step}: the product's overlap refusal does not appear (learned: ${JSON.stringify(refusal)})`).toEqual([]);
      expect.soft(s.lines.filter((l) => REFUSAL_WORDS.test(l)), `ROW-208 ${s.step}: no refusal wording appears`).toEqual([]);
    }
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-209 promise: the row (control of ROW-208) — one submit records exactly one action and shows its success;
// ROW-209   REQ-003, REQ-009.
// ROW-209 wrong product: a send that records the request but shows nothing (the person cannot tell it was sent and
// ROW-209   sends again); or one that shows success and records nothing, or records the wrong days.
// ROW-209 given: member M with no requests; a fresh range of N weekdays. when: M fills the form and clicks Send once.
// ROW-209   then: M has exactly one request, pending, with N pending days in 2027, and the press made text appear in
// ROW-209   plain success words (sent, saved, submitted, recorded, success).
// ROW-209 controls: the control case opens the send form for M: the page and its form are there, so a target
// ROW-209   failure is the submit's.
// ROW-209 technique: before/after on the server count and the pending days (the exact N, fresh per run), and the
// ROW-209   text that the press made appear.
// ROW-209 cases: ROW-209 target=ROW-209.REQ-003.one-submit-records-one-request-and-shows-success control=ROW-209.control.the-send-form-opens-for-the-member
test('ROW-209.control.the-send-form-opens-for-the-member', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, m);
  try {
    await openSendForm(opened.page);
    await expect(opened.page.getByLabel(/last day/i).first(), 'ROW-209 control: the form has its Last day field').toBeVisible();
  } finally {
    await opened.close();
  }
});

test('ROW-209.REQ-003.one-submit-records-one-request-and-shows-success', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  try {
    await openSendForm(opened.page);
    const form = await fillSendForm(opened.page, range, { press: false });
    expect(await ownRequests(m), 'ROW-209 before: no request').toHaveLength(0);
    const before = await textLines(opened.page);
    await sendButton(form).click();
    await settle(opened.page);
    await expect.poll(async () => (await ownRequests(m)).length, { message: 'ROW-209: exactly one request recorded', timeout: 10_000 }).toBe(1);
    expect.soft((await ownRequests(m))[0]?.state, 'ROW-209: it is pending').toBe('pending');
    expect.soft(await pendingDays(m, 2027), `ROW-209: exactly ${range.days} days pending`).toBe(range.days);
    const appeared = newLines(before, await textLines(opened.page));
    expect.soft(appeared.some((l) => SUCCESS_WORDS.test(l)), `ROW-209: the page says the request was sent (appeared: ${JSON.stringify(appeared)})`).toBe(true);
  } finally {
    await opened.close();
  }
});
