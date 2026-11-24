// Purpose: ledger tests for ROW-205 (REQ-001) — the kind on the send form must be chosen: nothing is preselected, and a send without a kind is refused, by the page and by the server.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts), fresh per run.
//
// Boundary (R6): "nothing is preselected" is paint and operation, proved in the browser on /requests/new; "a send
// without a kind is refused" is a rule, proved at the HTTP harness on POST /api/requests as well, so a page that
// blocks the empty kind while the server defaults it to vacation still fails. Form readings: robustness.ts.
import { test, expect } from '@playwright/test';
import { createMember, openPage, signInMember } from './harness';
import {
  chosenKind,
  disposeAll,
  fillSendForm,
  freshTeam,
  isRuleRefusal,
  keep,
  kindControls,
  openSendForm,
  ownRequests,
  pendingDays,
  settle,
} from './robustness';

test.afterEach(disposeAll);

// Mon 2027-03-15 .. Wed 2027-03-17: three weekdays a week after the team's today (Mon 2027-03-08).
const DAYS = { firstDay: '2027-03-15', lastDay: '2027-03-17' };

// ---------------------------------------------------------------------------------------------------
// ROW-205 promise: REQ-001 "a signed-in person sends a request for themselves with a kind, vacation or sick"; the
// ROW-205   row: the kind must be chosen, nothing is preselected, and a send without a kind is refused.
// ROW-205 wrong product: a send form whose Vacation radio (or select) starts checked, so a person who meant Sick
// ROW-205   sends vacation without choosing; or a server that stores a request posted with no kind as vacation.
// ROW-205 given: member M with no requests, the send form freshly opened. when: the form is read untouched; then its
// ROW-205   days are filled and Send pressed with no kind chosen; then POST /api/requests is sent with the kind left
// ROW-205   out, empty and null. then: no kind control is checked or selected; after the form's Send and the three
// ROW-205   posts M has no request and no pending days; each post answers a rule's refusal (4xx, not 401/404/405).
// ROW-205 controls: the control case fills the same form with Vacation chosen and the same days: M then has exactly
// ROW-205   one request and 3 pending days — the form, the days and the session work, so the target's "nothing
// ROW-205   recorded" is the missing kind's doing.
// ROW-205 technique: before/after on M's own list around each send without a kind; both doors (page and route),
// ROW-205   since either alone lets one wrong product through.
// ROW-205 cases: ROW-205 target=ROW-205.REQ-001.nothing-preselected-and-a-send-without-kind-is-refused control=ROW-205.control.the-same-form-with-a-kind-records-one-request
test('ROW-205.control.the-same-form-with-a-kind-records-one-request', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const actor = keep(await signInMember(m));
  const opened = await openPage(browser, actor);
  try {
    await openSendForm(opened.page);
    expect(await ownRequests(actor), 'ROW-205 control: M starts with no request').toHaveLength(0);
    await fillSendForm(opened.page, { kind: 'vacation', ...DAYS });
    await settle(opened.page);
    await expect.poll(async () => (await ownRequests(actor)).length, { message: 'ROW-205 control: one request recorded', timeout: 10_000 }).toBe(1);
    expect(await pendingDays(actor, 2027), 'ROW-205 control: its 3 weekdays are pending').toBe(3);
  } finally {
    await opened.close();
  }
});

test('ROW-205.REQ-001.nothing-preselected-and-a-send-without-kind-is-refused', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const actor = keep(await signInMember(m));
  const opened = await openPage(browser, actor);
  try {
    const form = await openSendForm(opened.page);
    const k = kindControls(form);
    const ways = (await k.vacation.count()) + (await k.sick.count()) + (await k.select.count());
    expect.soft(ways, 'ROW-205: the form offers a kind control (Vacation/Sick radios or a Kind select)').toBeGreaterThan(0);
    expect.soft(await chosenKind(form), 'ROW-205: no kind is preselected on the untouched form').toBeNull();
    for (const radio of [k.vacation, k.sick]) {
      for (let i = 0; i < (await radio.count()); i += 1) {
        expect.soft(await radio.nth(i).isChecked(), 'ROW-205: no kind radio starts checked').toBe(false);
      }
    }

    expect(await ownRequests(actor), 'ROW-205 before: M has no request').toHaveLength(0);
    await fillSendForm(opened.page, { ...DAYS });
    await settle(opened.page);
    expect.soft(await ownRequests(actor), 'ROW-205: the page recorded no request without a kind').toHaveLength(0);
  } finally {
    await opened.close();
  }

  for (const [label, body] of [
    ['kind left out', { ...DAYS }],
    ['kind empty', { kind: '', ...DAYS }],
    ['kind null', { kind: null, ...DAYS }],
  ] as const) {
    const res = await actor.api.post('/api/requests', { data: body });
    expect.soft(isRuleRefusal(res.status()), `ROW-205 ${label}: POST /api/requests is refused by the rule (answered ${res.status()})`).toBe(true);
  }
  expect.soft(await ownRequests(actor), 'ROW-205: no post without a kind recorded a request').toHaveLength(0);
  expect.soft(await pendingDays(actor, 2027), 'ROW-205: no days are pending').toBe(0);
});
