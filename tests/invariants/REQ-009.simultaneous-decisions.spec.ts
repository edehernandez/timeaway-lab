// Purpose: ledger tests for ROW-163 to ROW-166 (REQ-005, REQ-009, REQ-010) — a person's cancel racing the admin's approval ends in one recorded outcome shown to both; two decisions or two cancels racing on one request land once, with one decider and one cancel day; and their single-action controls.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, account, requests, the two-step confirmed actions), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): state rules under concurrency, proved at the HTTP harness: the person's cancel is POST
// /api/requests/:id/cancel, the admin's acts the second step of D-029's confirmed actions (harness actWithToken, with
// a token read first), both fired in the same tick; "what was recorded" is the request's record on the person's
// own list (GET /api/requests) and on the admin's view of the person (GET /api/admin/people/:id/requests), and the
// balance. Each race is repeated over rounds.
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  approve,
  createMember,
  readBalance,
  readEffect,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  SetupError,
  type AccountId,
  type Actor,
  type Install,
  type Member,
} from './harness';
import {
  addDays,
  aucklandMorning,
  balanceYear,
  countWeekdays,
  getJson,
  objectsIn,
  occurrences,
  recordById,
  stateOf,
  together,
} from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const ALLOWANCE = 200;
const MONDAY = '2027-03-08';

interface World {
  install: Install;
  admin: Actor;
  member: Member;
  session: Actor;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const member = await createMember(admin, { allowance: ALLOWANCE });
  return { install, admin, member, session: keep(await signInMember(member)) };
}

function week(r: number): { firstDay: string; lastDay: string } {
  const mon = addDays(MONDAY, 7 * r);
  return { firstDay: mon, lastDay: addDays(mon, 2) }; // Mon..Wed: 3 weekdays
}

async function answer(p: Promise<{ status(): number; text(): Promise<string> }>): Promise<{ status: number; body: string }> {
  const res = await p;
  return { status: res.status(), body: await res.text() };
}

function ok(status: number): boolean {
  return status >= 200 && status < 300;
}

async function recorded(w: World, id: AccountId, row: string): Promise<{ own?: Record<string, unknown>; admins?: Record<string, unknown> }> {
  const own = recordById(await getJson(w.session.api, '/api/requests', row), id);
  const admins = recordById(await getJson(w.admin.api, `/api/admin/people/${encodeURIComponent(String(w.member.id))}/requests`, row), id);
  return { own, admins };
}

/** The decision time on a request record: a date-time string in a field whose name says decided/decision. */
function decidedAtOf(rec: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(rec)) {
    if (/decid|decision/i.test(k) && typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  }
  for (const o of objectsIn(rec)) {
    for (const [k, v] of Object.entries(o)) {
      if (/decid|decision/i.test(k) && typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
      if (/^(at|when|time)$/i.test(k) && typeof v === 'string' && !Number.isNaN(Date.parse(v)) && o !== rec) return v;
    }
  }
  throw new SetupError(`reading "decision time": no date-time field named like decided/decision in ${JSON.stringify(rec).slice(0, 300)}`);
}

// ---------------------------------------------------------------------------------------------------
// ROW-163 promise: REQ-005 (a person cancels their own pending request with no weekday before today; a cancelled
// ROW-163   request "can never be decided afterwards", fail-if (3)) and REQ-009 ("only a pending request can be
// ROW-163   approved or rejected", fail-if (1)); A-038, A-023. The row's case: a person's cancel and the admin's
// ROW-163   approval of the same pending request at the same moment end in one recorded outcome, and each side is
// ROW-163   shown what was recorded.
// ROW-163 wrong product: two state changes that each read "pending" and then write, so both answer success and the
// ROW-163   request ends cancelled with its days charged (or approved with the person told it was cancelled).
// ROW-163 given: a member (allowance 200), today Mon 2027-03-01; in each of 6 rounds a pending 3-day vacation in a
// ROW-163   later week, and the admin's approve token for it read first. when: the member's cancel and the admin's
// ROW-163   approve act are sent in the same tick. then: exactly one answers 2xx; the request's record on the member's
// ROW-163   list and on the admin's view of the member both show the winner's state (approved or cancelled); the
// ROW-163   loser's answer is a refusal naming that recorded state; at the end the days left are 200 − 3 × (rounds
// ROW-163   approve won) and nothing is pending.
// ROW-163 controls: ROW-164's target (an approval with no competing action is recorded and shown approved).
// ROW-163 technique: a race repeated over rounds; the outcome read from two views and the balance, not only the
// ROW-163   answers.
// ROW-163 cases: ROW-163 target=ROW-163.REQ-009.a-cancel-racing-an-approval-ends-in-one-recorded-outcome control=ROW-164.REQ-009.an-uncontested-approval-is-recorded-and-shown-approved
test('ROW-163.REQ-009.a-cancel-racing-an-approval-ends-in-one-recorded-outcome', async () => {
  const w = await world();
  let approvedDays = 0;
  for (let r = 0; r < 6; r += 1) {
    const id = await sendRequest(w.session, { kind: 'vacation', ...week(r) });
    const effect = await readEffect(w.admin, 'approve', id);
    const [cancel, appr] = await together([
      () => answer(w.session.api.post(`/api/requests/${encodeURIComponent(String(id))}/cancel`)),
      () => answer(actWithToken(w.admin, 'approve', id, effect.token)),
    ]);
    const wins = [cancel, appr].filter((a) => ok(a.status)).length;
    expect.soft(wins, `ROW-163 round ${r}: exactly one of the cancel (${cancel.status}) and the approval (${appr.status}) lands`).toBe(1);
    const expected = ok(appr.status) && !ok(cancel.status) ? 'approved' : ok(cancel.status) && !ok(appr.status) ? 'cancelled' : 'one outcome';
    const { own, admins } = await recorded(w, id, 'ROW-163');
    expect.soft(own && stateOf(own), `ROW-163 round ${r}: the member's list shows the recorded outcome`).toBe(expected);
    expect.soft(admins && stateOf(admins), `ROW-163 round ${r}: the admin's view shows the recorded outcome`).toBe(expected);
    const loser = ok(appr.status) ? cancel : appr;
    const word = expected === 'approved' ? /approv/i : /cancel/i;
    expect.soft(word.test(loser.body), `ROW-163 round ${r}: the refused side is told the request is ${expected} (body: ${loser.body.slice(0, 200)})`).toBe(true);
    if (expected === 'approved') approvedDays += 3;
  }
  const y = balanceYear(await readBalance(w.session), 2027);
  expect.soft(y?.daysLeft, 'ROW-163: days left charge only the approvals that landed').toBe(ALLOWANCE - approvedDays);
  expect.soft(y?.pending, 'ROW-163: nothing is left pending').toBe(0);
});

// ---------------------------------------------------------------------------------------------------
// ROW-164 promise: REQ-009 "approving makes it approved"; A-023 (the person sees who decided and when). The row's
// ROW-164   case: an approval with no competing action is recorded and shown approved.
// ROW-164 wrong product: an approval whose answer is success while the record stays pending, or that only one view
// ROW-164   (the admin's) shows.
// ROW-164 given: a member's pending 3-day vacation. when: the admin approves it (both steps). then: its record on the
// ROW-164   member's list and the admin's view shows approved; days left 200 − 3.
// ROW-164 controls: the control case reads the record before the approval: pending on both views.
// ROW-164 technique: before and after the one action.
// ROW-164 cases: ROW-164 target=ROW-164.REQ-009.an-uncontested-approval-is-recorded-and-shown-approved control=ROW-164.control.the-request-is-pending-before-the-approval
test('ROW-164.control.the-request-is-pending-before-the-approval', async () => {
  const w = await world();
  const id = await sendRequest(w.session, { kind: 'vacation', ...week(0) });
  const { own, admins } = await recorded(w, id, 'ROW-164 control');
  expect(own && stateOf(own), "ROW-164 control: pending on the member's list").toBe('pending');
  expect(admins && stateOf(admins), "ROW-164 control: pending on the admin's view").toBe('pending');
});

test('ROW-164.REQ-009.an-uncontested-approval-is-recorded-and-shown-approved', async () => {
  const w = await world();
  const id = await sendRequest(w.session, { kind: 'vacation', ...week(0) });
  await approve(w.admin, id);
  const { own, admins } = await recorded(w, id, 'ROW-164');
  expect.soft(own && stateOf(own), "ROW-164: approved on the member's list").toBe('approved');
  expect.soft(admins && stateOf(admins), "ROW-164: approved on the admin's view").toBe('approved');
  expect(balanceYear(await readBalance(w.session), 2027)?.daysLeft, 'ROW-164: the 3 days are charged').toBe(ALLOWANCE - 3);
});

// ---------------------------------------------------------------------------------------------------
// ROW-165 promise: REQ-009 (only a pending request is decided, fail-if (1)), REQ-010 (an admin cancel gives back
// ROW-165   the days from today on, once), REQ-005 fail-if (4) (a person cannot cancel their own cancelled request);
// ROW-165   A-023 (who decided and when is recorded). The row's case: two decisions, or two cancels, on the same
// ROW-165   request at the same moment land once, with one decider and one cancel day.
// ROW-165 wrong product: a decision that checks "pending" and then writes, so two approvals both land (two
// ROW-165   decision records, the days charged twice) or an approval and a rejection both land; two admin cancels
// ROW-165   that both give the days back (days left above the allowance minus the days in effect); two own cancels
// ROW-165   that both answer success.
// ROW-165 given: a member (allowance 200), today Mon 2027-03-01. when: (a) 3 rounds of two approvals of one pending
// ROW-165   request, each with its own token, in the same tick; (b) 3 rounds of an approval and a rejection; (d) 3
// ROW-165   rounds of two own cancels on two sessions; then (c) 3 approved 2-week vacations, today moved into their
// ROW-165   first week (Wed), and two admin cancels of each, with their own tokens, in the same tick. then: in every
// ROW-165   round exactly one act answers 2xx; for (a) and (b) the record shows the winner's state and the admin's
// ROW-165   name once (one decider) and a decision time; for (c) the record stays approved and carries the cancel
// ROW-165   day (that Wednesday), and days left equal the allowance minus every day still in effect (the 8 days given
// ROW-165   back once, Mon and Tue kept); for (d) the record is cancelled and nothing is pending.
// ROW-165 controls: ROW-166's target (a single approval records exactly one decider and time).
// ROW-165 technique: races repeated over rounds for every pair the row names; the balance as the witness that a
// ROW-165   double landing would move.
// ROW-165 cases: ROW-165 target=ROW-165.REQ-009.two-decisions-or-two-cancels-at-the-same-moment-land-once control=ROW-166.REQ-009.a-single-approval-records-one-decider-and-time
test('ROW-165.REQ-009.two-decisions-or-two-cancels-at-the-same-moment-land-once', async () => {
  const w = await world();
  const second = keep(await signInMember(w.member));
  const adminName = w.install.admin.name;
  let charged = 0;
  let r = 0;

  for (const pair of ['approve+approve', 'approve+reject'] as const) {
    for (let i = 0; i < 3; i += 1, r += 1) {
      const id = await sendRequest(w.session, { kind: 'vacation', ...week(r) });
      const t1 = await readEffect(w.admin, 'approve', id);
      const otherAction = pair === 'approve+approve' ? 'approve' : 'reject';
      const t2 = await readEffect(w.admin, otherAction, id);
      const [x, y] = await together([
        () => answer(actWithToken(w.admin, 'approve', id, t1.token)),
        () => answer(actWithToken(w.admin, otherAction, id, t2.token)),
      ]);
      const wins = [x, y].filter((a) => ok(a.status)).length;
      expect.soft(wins, `ROW-165 ${pair} round ${i}: exactly one lands (answers ${x.status}, ${y.status})`).toBe(1);
      const expected = pair === 'approve+approve' || ok(x.status) ? 'approved' : 'rejected';
      const { own } = await recorded(w, id, 'ROW-165');
      expect.soft(own && stateOf(own), `ROW-165 ${pair} round ${i}: the record shows the one outcome`).toBe(expected);
      if (own) {
        expect.soft(occurrences(JSON.stringify(own), adminName), `ROW-165 ${pair} round ${i}: one decider on the record`).toBe(1);
        expect.soft(decidedAtOf(own), `ROW-165 ${pair} round ${i}: a decision time on the record`).toBeTruthy();
      }
      if (expected === 'approved') charged += 3;
    }
  }

  for (let i = 0; i < 3; i += 1, r += 1) {
    const id = await sendRequest(w.session, { kind: 'vacation', ...week(r) });
    const [x, y] = await together([
      () => answer(w.session.api.post(`/api/requests/${encodeURIComponent(String(id))}/cancel`)),
      () => answer(second.api.post(`/api/requests/${encodeURIComponent(String(id))}/cancel`)),
    ]);
    expect.soft([x, y].filter((a) => ok(a.status)).length, `ROW-165 own cancel+cancel round ${i}: exactly one lands (answers ${x.status}, ${y.status})`).toBe(1);
    const { own } = await recorded(w, id, 'ROW-165');
    expect.soft(own && stateOf(own), `ROW-165 own cancel+cancel round ${i}: the record is cancelled`).toBe('cancelled');
  }
  expect.soft(balanceYear(await readBalance(w.session), 2027)?.daysLeft, 'ROW-165: the decided rounds charged each approval once').toBe(ALLOWANCE - charged);

  // (c) two admin cancels at the same moment on approved requests with days before and after today.
  const firstDay = '2027-09-06'; // a Monday
  const ids: AccountId[] = [];
  for (let i = 0; i < 3; i += 1) {
    const mon = addDays(firstDay, 21 * i);
    const id = await sendRequest(w.session, { kind: 'vacation', firstDay: mon, lastDay: addDays(mon, 11) }); // Mon..Fri next week: 10
    await approve(w.admin, id);
    charged += 10;
    ids.push(id);
  }
  for (let i = 0; i < 3; i += 1) {
    const mon = addDays(firstDay, 21 * i);
    await setClock(aucklandMorning(addDays(mon, 2))); // Wednesday of the first week: Mon and Tue stay in effect
    const t1 = await readEffect(w.admin, 'cancel', ids[i]);
    const t2 = await readEffect(w.admin, 'cancel', ids[i]);
    const [x, y] = await together([
      () => answer(actWithToken(w.admin, 'cancel', ids[i], t1.token)),
      () => answer(actWithToken(w.admin, 'cancel', ids[i], t2.token)),
    ]);
    expect.soft([x, y].filter((a) => ok(a.status)).length, `ROW-165 cancel+cancel round ${i}: exactly one lands (answers ${x.status}, ${y.status})`).toBe(1);
    charged -= 8;
    const { own } = await recorded(w, ids[i], 'ROW-165');
    expect.soft(own && stateOf(own), `ROW-165 cancel+cancel round ${i}: the request stays approved`).toBe('approved');
    const wed = addDays(mon, 2);
    expect.soft(own && JSON.stringify(own).includes(wed), `ROW-165 cancel+cancel round ${i}: the record carries the one cancel day, ${wed}`).toBe(true);
    expect
      .soft(balanceYear(await readBalance(w.session), 2027)?.daysLeft, `ROW-165 cancel+cancel round ${i}: the 8 days are given back once`)
      .toBe(ALLOWANCE - charged);
  }
  expect.soft(countWeekdays(firstDay, addDays(firstDay, 11)), 'ROW-165: the oracle counts 10 weekdays per vacation').toBe(10);
  expect(balanceYear(await readBalance(w.session), 2027)?.pending, 'ROW-165: nothing is left pending').toBe(0);
});

// ---------------------------------------------------------------------------------------------------
// ROW-166 promise: REQ-009 (the admin's decision), REQ-010; A-023 "every … approval … records who did it and when;
// ROW-166   the person sees who decided each of their requests and when". The row's case: a single approval records
// ROW-166   exactly one decider and time.
// ROW-166 wrong product: an approval that records no decider (or the person as decider), or no time.
// ROW-166 given: a member's pending 3-day vacation. when: the admin approves it. then: before, the record names no
// ROW-166   decider (the admin's name is absent); after, it names the admin exactly once and carries a decision time.
// ROW-166 controls: the control case shows the pending record exists and is pending (the path is reached).
// ROW-166 technique: before and after; the decider's fresh name counted on the record.
// ROW-166 cases: ROW-166 target=ROW-166.REQ-009.a-single-approval-records-one-decider-and-time control=ROW-166.control.the-pending-record-exists
test('ROW-166.control.the-pending-record-exists', async () => {
  const w = await world();
  const id = await sendRequest(w.session, { kind: 'vacation', ...week(0) });
  const { own } = await recorded(w, id, 'ROW-166 control');
  expect(own && stateOf(own), 'ROW-166 control: the request is pending').toBe('pending');
});

test('ROW-166.REQ-009.a-single-approval-records-one-decider-and-time', async () => {
  const w = await world();
  const adminName = w.install.admin.name;
  const id = await sendRequest(w.session, { kind: 'vacation', ...week(0) });
  const before = (await recorded(w, id, 'ROW-166')).own;
  expect.soft(before && occurrences(JSON.stringify(before), adminName), 'ROW-166 before: no decider yet').toBe(0);
  await approve(w.admin, id);
  const { own, admins } = await recorded(w, id, 'ROW-166');
  expect(own, "ROW-166: the record is on the member's list").toBeDefined();
  expect.soft(occurrences(JSON.stringify(own), adminName), "ROW-166: the member's record names the admin once").toBe(1);
  expect.soft(admins && occurrences(JSON.stringify(admins), adminName), "ROW-166: the admin's view names the admin once").toBe(1);
  expect.soft(decidedAtOf(own!), 'ROW-166: the record carries a decision time').toBeTruthy();
});
