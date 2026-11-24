// Purpose: ledger tests for ROW-206 (REQ-002, REQ-003, REQ-004, REQ-013) — every refusal says in plain words which rule refused it and keeps the values the person entered.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests), fresh per run; strengthened in slice 1 by batch test-author-4 (every refusal the row's items name; the clock moved by the harness's control door).
//
// Boundary (R6): what a refusal says and what the form keeps is paint and operation — proved in the browser on the
// send form (/requests/new) and the people page's create form (/admin/people). The message is read as the text the
// press made appear (lines absent before the press, present after); form readings: robustness.ts.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { approve, createMember, freshName, freshPassword, openPage, sendRequest, setClock, signInMember, type Actor } from './harness';
import { hasDate, hasNumber } from './page-reading';
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
  teamInstant,
  textLines,
  addDays,
  isWeekday,
  TODAY,
  ZONE,
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
// ROW-206 (the row's cases: line stands with the second argument below, whose case presses every refusal the
// ROW-206   row's items name, these four included.)
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

// ---------------------------------------------------------------------------------------------------
// ROW-206 — every refusal the row's items name, pressed through the page (added, slice 1, test-author-4)
// ---------------------------------------------------------------------------------------------------
// ROW-206 promise: the row — EVERY refusal says in plain words which rule refused it and keeps the values entered;
// ROW-206   the refusals its items name: REQ-002 arms 1 and 3 (more vacation than the allowance minus approved and
// ROW-206   pending; the refusal shows that year's days left — allowance minus approved, A-002 — with that year's
// ROW-206   pending days beside it, D-037); REQ-003 arm 1 (a shared day with one's own pending OR approved request,
// ROW-206   A-014); REQ-004 arms 1, 4, 5 and 7 (a vacation range holding a day before today; a day after 31 December
// ROW-206   of next year; first and last days in different years, A-003; a sick day before 1 January of this year
// ROW-206   sent outside January, and before 1 January of the previous year sent in January, A-036); REQ-013 arms 1,
// ROW-206   2 and 3 (a name left blank, an allowance left empty; an email already held, typed in other letter case
// ROW-206   with spaces around it; a 31st switched-on account, A-025).
// ROW-206 wrong product: a send whose year-crossing check is dropped, so the store's own check throws, the route
// ROW-206   answers 500 and the page shows only its fallback "The request was not sent. Try again." naming no rule;
// ROW-206   a sick-before-this-year send refused with the vacation "in the past" message (the wrong rule); an
// ROW-206   allowance refusal that shows days left but not the pending days, or the other year's pending; a 31st
// ROW-206   account refused with a generic error and an emptied form.
// ROW-206 given: today Mon 2027-03-08 in the team zone; member M with a fresh allowance L in 10..14, a pending
// ROW-206   sick day Mon 22 Mar, an approved vacation Mon 15..Tue 16 Mar (2 days), a pending vacation Mon 3..Wed 5
// ROW-206   May 2027 (3 days) and a pending vacation Mon 7..Tue 8 Feb 2028 (2 days, the other year's decoy); so
// ROW-206   2027 shows L-2 days left with 3 pending and L-5 can be asked. when: from the send form M sends, each on
// ROW-206   a freshly opened form: vacation of L-4 weekdays from Mon 7 Jun 2027; sick Tue 16..Wed 17 Mar (shares the
// ROW-206   approved 16th); sick Mon 22 Mar (shares the pending day); vacation Fri 5..Tue 9 Mar (holds two past
// ROW-206   days, within the days left); sick 8..9 Jan 2029; vacation Fri 31 Dec 2027..Mon 3 Jan 2028 and sick Thu
// ROW-206   30 Dec 2027..Tue 4 Jan 2028 (each crossing 31 December, each within both years' figures); sick Mon
// ROW-206   28..Tue 29 Dec 2026; then the admin on the people page's create form: M's email upper-cased with spaces
// ROW-206   around it, a name of spaces only, an empty allowance, and (after 28 more accounts make 30 switched on) a
// ROW-206   31st account; then, the clock moved to Wed 12 Jan 2028, M sends sick Tue 29..Wed 30 Dec 2026.
// ROW-206   then: each press makes text appear (or, where the browser itself holds the form back, the invalid
// ROW-206   field's label with its message) naming its rule; the allowance refusal shows L-2 and 3; refusals of
// ROW-206   different rules say different things; each form still holds the kind and days, or the name, email and
// ROW-206   allowance, as typed; M still has exactly the four requests made in setup, and no refused account exists.
// ROW-206 controls: ROW-206.control.a-valid-send-from-the-same-form-is-recorded — the same form and session reach
// ROW-206   the server and record a valid send, so these refusals are the rules'; setup's sends and approval go
// ROW-206   through the public routes and must succeed (SETUP otherwise).
// ROW-206 technique: one press per rule arm, each built so exactly one rule is broken (crossing and past ranges kept
// ROW-206   within the days left; overlap and window cases sick); fresh L so no fixed text shows the right days left;
// ROW-206   a decoy year with different pending; messages compared across rule groups so one generic refusal fails.
// ROW-206 cases: ROW-206 target=ROW-206.REQ-004.every-refusal-the-items-name-says-its-rule-and-keeps-the-values control=ROW-206.control.a-valid-send-from-the-same-form-is-recorded

type Group = 'allowance' | 'overlap' | 'past' | 'window' | 'crossing' | 'email' | 'name' | 'allowance-field' | 'limit';

/** The last of `n` Monday-to-Friday days counted from `first` (the test's own arithmetic). */
function lastOfWeekdays(first: string, n: number): string {
  let d = first;
  let seen = 0;
  let last = first;
  while (seen < n) {
    if (isWeekday(d)) {
      seen += 1;
      last = d;
    }
    d = addDays(d, 1);
  }
  return last;
}

/**
 * What a press said: the lines it made appear; when none appeared and the browser itself held the form back, each
 * invalid field's label with the browser's message ("Allowance: Please fill out this field.").
 */
async function said(page: Page, form: Locator, before: string[]): Promise<string> {
  const appeared = newLines(before, await textLines(page));
  if (appeared.length > 0) return appeared.join(' | ');
  const held = await form
    .evaluate((f) =>
      Array.from(f.querySelectorAll('input, select, textarea'))
        .filter((e) => !(e as HTMLInputElement).validity.valid)
        .map((e) => {
          const el = e as HTMLInputElement;
          const label = (el.labels?.[0]?.innerText ?? el.getAttribute('aria-label') ?? el.name ?? '').trim();
          return `${label}: ${el.validationMessage}`;
        }),
    )
    .catch(() => [] as string[]);
  return held.join(' | ');
}

/** Presses `button` and waits (bounded) until the press has said something; answers what it said ('' when nothing). */
async function pressAndRead(page: Page, form: Locator, button: Locator): Promise<string> {
  const before = await textLines(page);
  await button.click();
  await settle(page);
  let out = '';
  await expect
    .poll(async () => (out = await said(page, form, before)).length, { timeout: 10_000 })
    .toBeGreaterThan(0)
    .catch(() => undefined);
  return out;
}

/** Types the create form's fields (the allowance as typed text, so it can be left empty); presses nothing. */
async function typeCreate(form: Locator, v: { name: string; email: string; password: string; allowance: string }): Promise<void> {
  await form.getByLabel(/^(display )?name$/i).first().fill(v.name);
  await form.getByLabel(/^email$/i).first().fill(v.email);
  const pw = form.locator('input[type="password"]');
  const n = await pw.count();
  for (let i = 0; i < n; i += 1) await pw.nth(i).fill(v.password);
  await form.getByLabel(/allowance/i).first().fill(v.allowance);
}

const WORDS: Record<Group, RegExp> = {
  allowance: /days? left|allowance|not enough|only \d+/i,
  overlap: /overlap|already|same day|another request|clash|conflict/i,
  past: /past|before today|earlier than today|already (gone|passed)/i,
  window: /year|january/i,
  crossing: /december|\bdec\b|cross|(one|same|single) (calendar )?year|two requests|split|end of (the )?year|new year|two years|both years|different years/i,
  email: /already|in use|taken|exists|belongs|another account/i,
  name: /blank|empty|required|missing|enter|need|must|fill|give/i,
  'allowance-field': /blank|empty|required|missing|enter|need|must|fill|give|number/i,
  limit: /\b30\b|thirty|limit|maximum|at most|too many|full|no more/i,
};

test('ROW-206.REQ-004.every-refusal-the-items-name-says-its-rule-and-keeps-the-values', async ({ browser }) => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam();
  const L = freshInt(10, 14);
  const m = await createMember(admin, { allowance: L });
  const actor = keep(await signInMember(m));
  await sendRequest(actor, { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  const approvedId = await sendRequest(actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  await approve(admin, approvedId);
  await sendRequest(actor, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-05' });
  await sendRequest(actor, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-08' });
  const daysLeft = L - 2;
  const pending = 3;
  const ask = L - 4; // one more than the L - 5 that can still be asked in 2027

  const heard: { rule: string; group: Group; said: string }[] = [];
  const hear = (rule: string, group: Group, s: string) => {
    heard.push({ rule, group, said: s });
    expect.soft(s.length, `ROW-206 ${rule}: the refusal says something`).toBeGreaterThan(0);
  };

  const sends: { rule: string; group: Group; kind: 'vacation' | 'sick'; firstDay: string; lastDay: string; names: (s: string) => boolean }[] = [
    { rule: 'allowance (REQ-002 arm 1)', group: 'allowance', kind: 'vacation', firstDay: '2027-06-07', lastDay: lastOfWeekdays('2027-06-07', ask), names: (s) => WORDS.allowance.test(s) },
    { rule: 'shares a day with an approved request (REQ-003)', group: 'overlap', kind: 'sick', firstDay: '2027-03-16', lastDay: '2027-03-17', names: (s) => WORDS.overlap.test(s) },
    { rule: 'shares a day with a pending request (REQ-003)', group: 'overlap', kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-22', names: (s) => WORDS.overlap.test(s) },
    { rule: 'vacation range holding days before today (REQ-004 arm 1)', group: 'past', kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-09', names: (s) => WORDS.past.test(s) || hasDate(s, TODAY) },
    { rule: 'a day after 31 December of next year (REQ-004 arm 4)', group: 'window', kind: 'sick', firstDay: '2029-01-08', lastDay: '2029-01-09', names: (s) => WORDS.window.test(s) || hasDate(s, '2028-12-31') },
    { rule: 'vacation crossing 31 December (REQ-004 arm 5)', group: 'crossing', kind: 'vacation', firstDay: '2027-12-31', lastDay: '2028-01-03', names: (s) => WORDS.crossing.test(s) },
    { rule: 'sick crossing 31 December (REQ-004 arm 5)', group: 'crossing', kind: 'sick', firstDay: '2027-12-30', lastDay: '2028-01-04', names: (s) => WORDS.crossing.test(s) },
    { rule: 'sick before 1 January of this year, sent in March (REQ-004 arm 7)', group: 'window', kind: 'sick', firstDay: '2026-12-28', lastDay: '2026-12-29', names: (s) => WORDS.window.test(s) || hasDate(s, '2027-01-01') },
  ];

  const sendOne = async (page: Page, c: (typeof sends)[number]) => {
    await openSendForm(page);
    const form = await fillSendForm(page, c, { press: false });
    const s = await pressAndRead(page, form, sendButton(form));
    hear(c.rule, c.group, s);
    expect.soft(c.names(s), `ROW-206 ${c.rule}: the refusal names its rule in plain words (said: "${s}")`).toBe(true);
    if (c.group === 'allowance') {
      expect.soft(hasNumber(s, daysLeft), `ROW-206 ${c.rule}: the refusal shows 2027's ${daysLeft} days left (said: "${s}")`).toBe(true);
      expect.soft(hasNumber(s, pending), `ROW-206 ${c.rule}: the refusal shows 2027's ${pending} pending days beside them (said: "${s}")`).toBe(true);
    }
    expect.soft(await chosenKind(form), `ROW-206 ${c.rule}: the form keeps the kind chosen`).toBe(c.kind);
    const days = dayFields(form);
    expect.soft(await days.first.inputValue().catch(() => ''), `ROW-206 ${c.rule}: the form keeps the first day`).toBe(c.firstDay);
    expect.soft(await days.last.inputValue().catch(() => ''), `ROW-206 ${c.rule}: the form keeps the last day`).toBe(c.lastDay);
  };

  const own = await openPage(browser, actor);
  try {
    for (const c of sends) await sendOne(own.page, c);
  } finally {
    await own.close();
  }
  expect.soft(await ownRequests(actor), 'ROW-206: no refused send was recorded (the four setup requests only)').toHaveLength(4);

  // REQ-013: the people page's create form.
  const creates: { rule: string; group: Group; fields: { name: string; email: string; password: string; allowance: string }; names: (s: string) => boolean; keeps: ('name' | 'email' | 'allowance')[]; absent: string }[] = [];
  const dupName = freshName('Dup');
  creates.push({
    rule: 'email already held, other case and spaces around (REQ-013 arm 2)',
    group: 'email',
    fields: { name: dupName, email: `  ${m.email.toUpperCase()}  `, password: freshPassword(), allowance: String(freshInt(5, 30)) },
    names: (s) => /e-?mail/i.test(s) && WORDS.email.test(s),
    keeps: ['name', 'email', 'allowance'],
    absent: dupName,
  });
  const blankEmail = `blank.${freshName('n').replace(/\s+/g, '').toLowerCase()}@example.test`;
  creates.push({
    rule: 'a name of spaces only (REQ-013 arm 1)',
    group: 'name',
    fields: { name: '   ', email: blankEmail, password: freshPassword(), allowance: String(freshInt(5, 30)) },
    names: (s) => /name/i.test(s) && WORDS.name.test(s),
    keeps: ['email', 'allowance'],
    absent: blankEmail,
  });
  const noAllowanceName = freshName('NoAllowance');
  creates.push({
    rule: 'an empty allowance (REQ-013 arm 1)',
    group: 'allowance-field',
    fields: { name: noAllowanceName, email: `noallow.${freshName('e').replace(/\s+/g, '').toLowerCase()}@example.test`, password: freshPassword(), allowance: '' },
    names: (s) => /allowance/i.test(s) && WORDS['allowance-field'].test(s),
    keeps: ['name', 'email'],
    absent: noAllowanceName,
  });

  const createOne = async (page: Page, c: (typeof creates)[number]) => {
    await page.goto('/admin/people');
    await settle(page);
    const form = await createForm(page);
    await typeCreate(form, c.fields);
    const s = await pressAndRead(page, form, form.getByRole('button', { name: /^(create|add)\b/i }).first());
    hear(c.rule, c.group, s);
    expect.soft(c.names(s), `ROW-206 ${c.rule}: the refusal names its rule in plain words (said: "${s}")`).toBe(true);
    const kept = await createForm(page);
    if (c.keeps.includes('name')) {
      expect.soft(await kept.getByLabel(/^(display )?name$/i).first().inputValue(), `ROW-206 ${c.rule}: the form keeps the name`).toBe(c.fields.name);
    }
    if (c.keeps.includes('email')) {
      // the browser strips an email field's surrounding spaces itself; letter case is compared loosely
      expect.soft((await kept.getByLabel(/^email$/i).first().inputValue()).trim().toLowerCase(), `ROW-206 ${c.rule}: the form keeps the email as typed`).toBe(c.fields.email.trim().toLowerCase());
    }
    if (c.keeps.includes('allowance')) {
      expect.soft(await kept.getByLabel(/allowance/i).first().inputValue(), `ROW-206 ${c.rule}: the form keeps the allowance`).toBe(c.fields.allowance);
    }
    expect.soft((await peopleText(admin)).includes(c.absent), `ROW-206 ${c.rule}: no account was created`).toBe(false);
  };

  const people = await openPage(browser, admin);
  try {
    for (const c of creates) await createOne(people.page, c);
    // A 31st switched-on account: the admin and M are on; 28 more make 30.
    for (let i = 0; i < 28; i += 1) await createMember(admin, { choosePassword: false });
    const lastName = freshName('ThirtyFirst');
    const limit = {
      rule: 'a 31st switched-on account (REQ-013 arm 3)',
      group: 'limit' as Group,
      fields: { name: lastName, email: `thirtyfirst.${freshName('e').replace(/\s+/g, '').toLowerCase()}@example.test`, password: freshPassword(), allowance: String(freshInt(5, 30)) },
      names: (s: string) => WORDS.limit.test(s),
      keeps: ['name', 'email', 'allowance'] as ('name' | 'email' | 'allowance')[],
      absent: lastName,
    };
    await createOne(people.page, limit);
  } finally {
    await people.close();
  }

  // REQ-004 arm 7, second half: in January, a sick day before 1 January of the previous year.
  await setClock(teamInstant(ZONE, '2028-01-12', '09:00'));
  const january = keep(await signInMember(m));
  const jan = await openPage(browser, january);
  try {
    await sendOne(jan.page, {
      rule: 'sick before 1 January of the previous year, sent in January (REQ-004 arm 7)',
      group: 'window',
      kind: 'sick',
      firstDay: '2026-12-29',
      lastDay: '2026-12-30',
      names: (s) => WORDS.window.test(s) || hasDate(s, '2027-01-01'),
    });
  } finally {
    await jan.close();
  }
  expect.soft(await ownRequests(january), 'ROW-206: the January refusal recorded nothing').toHaveLength(4);

  // Refusals of different rules say different things.
  for (let i = 0; i < heard.length; i += 1) {
    for (let j = i + 1; j < heard.length; j += 1) {
      const a = heard[i];
      const b = heard[j];
      if (a.group === b.group || a.said === '' || b.said === '') continue;
      expect.soft(a.said === b.said, `ROW-206: "${a.rule}" and "${b.rule}" say different things (both said: "${a.said}")`).toBe(false);
    }
  }
});
