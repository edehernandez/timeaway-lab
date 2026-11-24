// Purpose: ledger tests for ROW-206 (REQ-002, REQ-003, REQ-004, REQ-013) — every refusal says in plain words which rule refused it and keeps the values the person entered.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests), fresh per run.
//
// Boundary (R6): what a refusal says and what the form keeps is paint and operation — proved in the browser on the
// send form (/requests/new) and the people page's create form (/admin/people). The message is read as the text the
// press made appear (lines absent before the press, present after); form readings: robustness.ts.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { createMember, freshName, freshPassword, openPage, sendRequest, signInMember, type Actor } from './harness';
import {
  chosenKind,
  createForm,
  dayFields,
  disposeAll,
  fillCreateForm,
  fillSendForm,
  freshInt,
  freshTeam,
  keep,
  newLines,
  openSendForm,
  ownRequests,
  peopleText,
  sendButton,
  settle,
  textLines,
} from './robustness';

test.afterEach(disposeAll);

interface Case {
  rule: string;
  kind: 'vacation' | 'sick';
  firstDay: string;
  lastDay: string;
  words: RegExp;
}

/** Fills the send form, presses Send, and answers the lines the press made appear and the form after it. */
async function refuse(page: Page, c: Case): Promise<{ appeared: string[]; form: Locator }> {
  await openSendForm(page);
  const form = await fillSendForm(page, c, { press: false });
  const before = await textLines(page);
  await sendButton(form).click();
  await settle(page);
  let appeared: string[] = [];
  await expect
    .poll(async () => (appeared = newLines(before, await textLines(page))).length, { timeout: 10_000 })
    .toBeGreaterThan(0)
    .catch(() => undefined);
  return { appeared, form };
}

// ---------------------------------------------------------------------------------------------------
// ROW-206 promise: the row — every refusal says in plain words which rule refused it and keeps the values entered;
// ROW-206   its rules: REQ-002 (more vacation than the days left; the refusal shows that year's days left with the
// ROW-206   pending days beside it), REQ-003 (a shared day with one's own pending request), REQ-004 (a vacation day
// ROW-206   before today; a day beyond next year), REQ-013 (an email that already belongs to an account).
// ROW-206 wrong product: one generic "Request refused" (or "Something went wrong") for every rule; or a refusal that
// ROW-206   reloads the form empty, so the person retypes everything; or a create form that clears its fields.
// ROW-206 given: member M with a fresh allowance A in 2..4 and a pending sick day on Mon 2027-03-22; today Mon
// ROW-206   2027-03-08 in the team zone. when: from the send form M sends vacation Mon 5 Apr..Fri 9 Apr 2027 (5 days > A),
// ROW-206   sick 22..23 Mar (shares the 22nd), vacation Fri 5 Mar (before today), sick 8..9 Jan 2029 (beyond next year);
// ROW-206   the admin creates an account with M's email. then: each press makes text appear naming its rule (days left
// ROW-206   with A for the allowance; overlap/already; past/before today; year; email already in use), the four send
// ROW-206   refusals are four different messages, and every form still holds the kind, days, name, email and
// ROW-206   allowance as typed; nothing was recorded.
// ROW-206 controls: the control case sends a valid sick day from the same form and M then has one more request —
// ROW-206   the form and the session reach the server, so the target's refusals are the rules'.
// ROW-206 technique: one case per rule with values built so exactly one rule is broken (the past case is one day,
// ROW-206   within A; the overlap and year cases are sick, outside the allowance); the fresh A must appear in the
// ROW-206   allowance refusal, so no fixed text can pass; pairwise-distinct messages defeat the generic refusal.
// ROW-206 cases: ROW-206 target=ROW-206.REQ-002.each-refusal-names-its-rule-and-keeps-the-values control=ROW-206.control.a-valid-send-from-the-same-form-is-recorded
async function memberWithPendingSick(): Promise<{ admin: Actor; m: Awaited<ReturnType<typeof createMember>>; actor: Actor; allowance: number }> {
  const { admin } = await freshTeam();
  const allowance = freshInt(2, 4);
  const m = await createMember(admin, { allowance });
  const actor = keep(await signInMember(m));
  await sendRequest(actor, { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  return { admin, m, actor, allowance };
}

test('ROW-206.control.a-valid-send-from-the-same-form-is-recorded', async ({ browser }) => {
  const { actor } = await memberWithPendingSick();
  const opened = await openPage(browser, actor);
  try {
    expect(await ownRequests(actor), 'ROW-206 control: M starts with the one pending sick day').toHaveLength(1);
    await openSendForm(opened.page);
    await fillSendForm(opened.page, { kind: 'sick', firstDay: '2027-03-29', lastDay: '2027-03-29' });
    await settle(opened.page);
    await expect.poll(async () => (await ownRequests(actor)).length, { message: 'ROW-206 control: the valid send is recorded', timeout: 10_000 }).toBe(2);
  } finally {
    await opened.close();
  }
});

test('ROW-206.REQ-002.each-refusal-names-its-rule-and-keeps-the-values', async ({ browser }) => {
  const { admin, m, actor, allowance } = await memberWithPendingSick();
  const cases: Case[] = [
    { rule: 'allowance (REQ-002)', kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09', words: /days? left|allowance/i },
    { rule: 'overlap (REQ-003)', kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23', words: /overlap|already|same day|another request/i },
    { rule: 'day before today (REQ-004)', kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-05', words: /past|before today|earlier than today|already (gone|passed)/i },
    { rule: 'beyond next year (REQ-004)', kind: 'sick', firstDay: '2029-01-08', lastDay: '2029-01-09', words: /year/i },
  ];
  const messages: string[] = [];
  const opened = await openPage(browser, actor);
  try {
    for (const c of cases) {
      const { appeared, form } = await refuse(opened.page, c);
      const said = appeared.join(' | ');
      messages.push(said);
      expect.soft(appeared.length, `ROW-206 ${c.rule}: the refusal says something`).toBeGreaterThan(0);
      expect.soft(c.words.test(said), `ROW-206 ${c.rule}: the refusal names its rule in plain words (said: "${said}")`).toBe(true);
      if (c.rule.startsWith('allowance')) {
        expect.soft(new RegExp(`\\b${allowance}\\b`).test(said), `ROW-206 ${c.rule}: the refusal shows the ${allowance} days left (said: "${said}")`).toBe(true);
      }
      expect.soft(await chosenKind(form), `ROW-206 ${c.rule}: the form keeps the kind chosen`).toBe(c.kind);
      const days = dayFields(form);
      expect.soft(await days.first.inputValue().catch(() => ''), `ROW-206 ${c.rule}: the form keeps the first day`).toBe(c.firstDay);
      expect.soft(await days.last.inputValue().catch(() => ''), `ROW-206 ${c.rule}: the form keeps the last day`).toBe(c.lastDay);
    }
  } finally {
    await opened.close();
  }
  expect.soft(new Set(messages).size, `ROW-206: the four rules say four different things (${messages.join(' // ')})`).toBe(cases.length);
  expect.soft(await ownRequests(actor), 'ROW-206: no refused send was recorded').toHaveLength(1);

  // REQ-013: the people page's create form, with an email that already belongs to M.
  const adminPage = await openPage(browser, admin);
  try {
    await adminPage.page.goto('/admin/people');
    await settle(adminPage.page);
    const form = await createForm(adminPage.page);
    const spec = { name: freshName('Dup'), email: m.email, password: freshPassword(), allowance: freshInt(5, 30) };
    const before = await textLines(adminPage.page);
    await fillCreateForm(form, spec);
    await settle(adminPage.page);
    let appeared: string[] = [];
    await expect
      .poll(async () => (appeared = newLines(before, await textLines(adminPage.page))).length, { timeout: 10_000 })
      .toBeGreaterThan(0)
      .catch(() => undefined);
    const said = appeared.join(' | ');
    expect.soft(/e-?mail/i.test(said) && /already|in use|taken|exists|belongs|another account/i.test(said), `ROW-206 email in use (REQ-013): the refusal says the email is already in use (said: "${said}")`).toBe(true);
    const kept = await createForm(adminPage.page);
    expect.soft(await kept.getByLabel(/^(display )?name$/i).first().inputValue(), 'ROW-206 email in use: the form keeps the name').toBe(spec.name);
    expect.soft(await kept.getByLabel(/^email$/i).first().inputValue(), 'ROW-206 email in use: the form keeps the email').toBe(spec.email);
    expect.soft(await kept.getByLabel(/allowance/i).first().inputValue(), 'ROW-206 email in use: the form keeps the allowance').toBe(String(spec.allowance));
    expect.soft((await peopleText(admin)).includes(spec.name), 'ROW-206 email in use: no account was created').toBe(false);
  } finally {
    await adminPage.close();
  }
});
