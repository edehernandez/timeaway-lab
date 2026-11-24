// Purpose: ledger tests for ROW-021, ROW-022 and ROW-023 (REQ-005) — a person cancels their own pending request that has no weekday before today, its days then neither count as pending nor block a new request, and a cancelled request can never be approved or rejected.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, own cancel, the admin's two-step actions, the test clock), fresh per run.
import { test, expect } from '@playwright/test';
import { actWithToken, approve, cancelOwnRequest, confirmedActionRoutes, readEffect, sendRequest, type AccountId } from './harness';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isAwayOn,
  isRuleRefusal,
  moveClock,
  onOrAfter,
  ownRequest,
  ownRequests,
  pickYear,
  randomInt,
  readAnswer,
  setupTeam,
  teamAt,
  tryCancel,
  trySend,
  weekdaySpan,
  weekdaysIn,
  yearBalance,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);
const MONDAY = addDays(TODAY, 5);

// ROW-021 promise: REQ-005 fail-if (1) "a person cannot cancel their own pending request that has no weekday before
// ROW-021   today"; REQ-005 "it becomes cancelled"; A-038 (the limit is a weekday before today, nothing earlier).
// ROW-021 wrong product: an off-by-one limit (a request starting today counts as begun and is refused), a cancel
// ROW-021   offered for vacation only, or for members only (the admin, a person too, refused for their own).
// ROW-021 given: today a Wednesday; a fresh member and the admin. when: the member cancels a vacation starting today
// ROW-021   and a future sick request; the admin cancels their own future vacation; the member sends a vacation for next
// ROW-021   Monday to Tuesday, the clock moves to that Monday, and the member cancels it on its first day. then: each
// ROW-021   cancel answers 2xx and the request is listed with state "cancelled" (it was "pending" before).
// ROW-021 controls: the control case sends the same requests and finds each listed pending — reached and readable,
// ROW-021   so the target's "cancelled" is the cancel's effect.
// ROW-021 technique: the boundary (first day = today) at two clocks, both kinds, two kinds of person; before and after.
// ROW-021 cases: ROW-021 target=ROW-021.REQ-005.a-person-cancels-their-own-pending-request-with-no-weekday-before-today control=ROW-021.control.the-requests-are-listed-pending-before-cancelling
test('ROW-021.control.the-requests-are-listed-pending-before-cancelling', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const ids = [
      await sendRequest(p, { kind: 'vacation', firstDay: TODAY, lastDay: addDays(TODAY, 2) }),
      await sendRequest(p, { kind: 'sick', firstDay: addDays(TODAY, 7), lastDay: addDays(TODAY, 8) }),
    ];
    const adminId = await sendRequest(team.admin, { kind: 'vacation', firstDay: addDays(TODAY, 14), lastDay: addDays(TODAY, 14) });
    const states = [...(await Promise.all(ids.map((id) => ownRequest(p, id)))), await ownRequest(team.admin, adminId)].map((r) => r?.state);
    expect(states, 'ROW-021 control: all three are listed pending').toEqual(['pending', 'pending', 'pending']);
  } finally {
    await team.dispose();
  }
});

test('ROW-021.REQ-005.a-person-cancels-their-own-pending-request-with-no-weekday-before-today', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const fromToday = await sendRequest(p, { kind: 'vacation', firstDay: TODAY, lastDay: addDays(TODAY, 2) });
    const sick = await sendRequest(p, { kind: 'sick', firstDay: addDays(TODAY, 7), lastDay: addDays(TODAY, 8) });
    const adminOwn = await sendRequest(team.admin, { kind: 'vacation', firstDay: addDays(TODAY, 14), lastDay: addDays(TODAY, 14) });
    const fromMonday = await sendRequest(p, { kind: 'vacation', firstDay: MONDAY, lastDay: addDays(MONDAY, 1) });

    const results: string[] = [];
    const tryIt = async (label: string, who: typeof p, id: AccountId) => {
      const before = (await ownRequest(who, id))?.state;
      const a = await tryCancel(who, id);
      const after = (await ownRequest(who, id))?.state;
      results.push(`${label}: ${before} -> cancel ${a.ok ? '2xx' : describe(a)} -> ${after}`);
    };
    await tryIt('vacation starting today', p, fromToday);
    await tryIt('future sick request', p, sick);
    await tryIt("the admin's own future vacation", team.admin, adminOwn);
    await moveClock(team, teamAt(MONDAY));
    await tryIt('vacation on its first day (clock moved)', p, fromMonday);
    expect(results, 'ROW-021: each own pending request is cancelled').toEqual([
      'vacation starting today: pending -> cancel 2xx -> cancelled',
      'future sick request: pending -> cancel 2xx -> cancelled',
      "the admin's own future vacation: pending -> cancel 2xx -> cancelled",
      'vacation on its first day (clock moved): pending -> cancel 2xx -> cancelled',
    ]);
  } finally {
    await team.dispose();
  }
});

// ROW-022 promise: REQ-005 fail-if (2) "a cancelled request's days still count as pending or still block a new request
// ROW-022   for those days"; REQ-005 "its days stop counting as pending".
// ROW-022 wrong product: a cancel that sets the state but leaves the balance query counting every non-rejected
// ROW-022   request, or an overlap check that skips only rejected requests.
// ROW-022 given: a member with a fresh allowance A; a pending vacation of exactly A weekdays (the whole allowance) and
// ROW-022   a pending sick request. when: the member cancels both, then sends a vacation for exactly the cancelled
// ROW-022   vacation's days and a sick request for exactly the cancelled sick days. then: after the cancels the year reads
// ROW-022   {daysLeft A, pending 0}; both new requests are accepted; the year then reads {A, A}.
// ROW-022 controls: the control case sends the same vacation again before any cancel and it is refused — while
// ROW-022   pending, those days do block and count, so the target sees the cancel's effect.
// ROW-022 technique: the whole allowance as the request (so a counted pending day and a blocking day both refuse it);
// ROW-022   before and after on the balance.
// ROW-022 cases: ROW-022 target=ROW-022.REQ-005.a-cancelled-requests-days-stop-counting-and-blocking control=ROW-022.control.the-pending-days-block-before-the-cancel
test('ROW-022.control.the-pending-days-block-before-the-cancel', async () => {
  const A = randomInt(5, 12);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [p] = team.people;
  try {
    const span = weekdaySpan(addDays(TODAY, 7), A);
    await sendRequest(p, { kind: 'vacation', ...span });
    const again = await trySend(p, { kind: 'vacation', ...span });
    expect(isRuleRefusal(again), `ROW-022 control: the same days again are refused while pending (got ${describe(again)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-022.REQ-005.a-cancelled-requests-days-stop-counting-and-blocking', async () => {
  const A = randomInt(5, 12);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [p] = team.people;
  try {
    const vac = weekdaySpan(addDays(TODAY, 7), A);
    const sick = weekdaySpan(onOrAfter(day(Y, 9, 1), 1), 3);
    const vacId = await sendRequest(p, { kind: 'vacation', ...vac });
    const sickId = await sendRequest(p, { kind: 'sick', ...sick });
    expect(await yearBalance(p, Y), 'ROW-022: the whole allowance is pending before').toEqual({ daysLeft: A, pending: A });
    await cancelOwnRequest(p, vacId);
    await cancelOwnRequest(p, sickId);
    expect.soft(await yearBalance(p, Y), 'ROW-022: after the cancel nothing is pending').toEqual({ daysLeft: A, pending: 0 });
    const v = await trySend(p, { kind: 'vacation', ...vac });
    const s = await trySend(p, { kind: 'sick', ...sick });
    expect.soft(isAcceptance(v), `ROW-022: a vacation on the cancelled vacation's days is accepted (got ${describe(v)})`).toBe(true);
    expect.soft(isAcceptance(s), `ROW-022: a sick request on the cancelled sick days is accepted (got ${describe(s)})`).toBe(true);
    expect.soft(await yearBalance(p, Y), 'ROW-022: only the new vacation is pending').toEqual({ daysLeft: A, pending: A });
  } finally {
    await team.dispose();
  }
});

// ROW-023 promise: REQ-005 fail-if (3) "a cancelled request can later be approved or rejected"; REQ-005 "it can never
// ROW-023   be decided afterwards"; D-029 (a stale token is refused 409).
// ROW-023 wrong product: an approve or reject act that checks the token but not the request's current state — the
// ROW-023   admin opened the confirmation while the request was pending, the person cancelled, the admin confirms.
// ROW-023 given: a member with a fresh allowance A and a pending future vacation R; the admin has read the approve and
// ROW-023   the reject effect (tokens) while R was pending. when: the member cancels R; the admin acts approve and reject
// ROW-023   with those tokens; then the admin starts approve and reject afresh (effect, and the act when a token comes).
// ROW-023 then: every attempt is refused (the effect or the act is not 2xx); R stays listed "cancelled"; the year
// ROW-023   reads {daysLeft A, pending 0}; R's days are not on the calendar.
// ROW-023 controls: the control case approves a pending request of the same kind through the same two steps and it
// ROW-023   is listed approved and shown away — the admin's path works, so the target's refusals are about the state.
// ROW-023 technique: the race a real admin hits (tokens read before the cancel), and the fresh path; the store, the
// ROW-023   balance and the calendar after, not only statuses.
// ROW-023 cases: ROW-023 target=ROW-023.REQ-005.a-cancelled-request-is-never-approved-or-rejected control=ROW-023.control.a-pending-request-is-approved-through-the-two-steps
test('ROW-023.control.a-pending-request-is-approved-through-the-two-steps', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  const [m] = team.members;
  try {
    const span = weekdaySpan(addDays(TODAY, 7), 2);
    const id = await sendRequest(p, { kind: 'vacation', ...span });
    await approve(team.admin, id);
    expect.soft((await ownRequest(p, id))?.state, 'ROW-023 control: approved').toBe('approved');
    expect.soft(await isAwayOn(p, m, span.firstDay), 'ROW-023 control: shown away').toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-023.REQ-005.a-cancelled-request-is-never-approved-or-rejected', async () => {
  const A = randomInt(10, 20);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [p] = team.people;
  const [m] = team.members;
  const admin = team.admin;
  try {
    const span = weekdaySpan(addDays(TODAY, 7), 3);
    const id = await sendRequest(p, { kind: 'vacation', ...span });
    const approveToken = (await readEffect(admin, 'approve', id)).token;
    const rejectToken = (await readEffect(admin, 'reject', id)).token;
    await cancelOwnRequest(p, id);

    const outcomes: string[] = [];
    const staleApprove = await readAnswer(await actWithToken(admin, 'approve', id, approveToken));
    outcomes.push(`approve with the earlier token: ${staleApprove.ok ? 'done' : 'refused'}`);
    const staleReject = await readAnswer(await actWithToken(admin, 'reject', id, rejectToken));
    outcomes.push(`reject with the earlier token: ${staleReject.ok ? 'done' : 'refused'}`);
    for (const action of ['approve', 'reject'] as const) {
      const effect = await readAnswer(await admin.api.get(confirmedActionRoutes(action, id).effect));
      const token = (effect.json as { token?: unknown } | undefined)?.token;
      const act = effect.ok && typeof token === 'string' ? await readAnswer(await actWithToken(admin, action, id, token)) : undefined;
      outcomes.push(`${action} afresh: ${act?.ok ? 'done' : 'refused'}`);
    }
    expect.soft(outcomes, 'ROW-023: every decision on the cancelled request is refused').toEqual([
      'approve with the earlier token: refused',
      'reject with the earlier token: refused',
      'approve afresh: refused',
      'reject afresh: refused',
    ]);
    expect.soft((await ownRequest(p, id))?.state, 'ROW-023: the request stays cancelled').toBe('cancelled');
    expect.soft(await yearBalance(p, Y), 'ROW-023: no day is taken or pending').toEqual({ daysLeft: A, pending: 0 });
    const shown: string[] = [];
    for (const d of weekdaysIn(span.firstDay, span.lastDay)) if (await isAwayOn(p, m, d)) shown.push(d);
    expect.soft(shown, 'ROW-023: none of its days is on the calendar').toEqual([]);
    expect.soft((await ownRequests(p)).length, 'ROW-023: no other request appeared').toBe(1);
  } finally {
    await team.dispose();
  }
});
