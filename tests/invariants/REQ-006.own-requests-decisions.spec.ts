// Purpose: ledger tests for ROW-027, ROW-028 and ROW-031 (REQ-006) — on the person's own requests list, a decided request shows who decided it and when, a rejected one its note, and a cancelled or partly cancelled one who cancelled it, when and from which day.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, requests, decisions, a rejection's note, cancels), fresh names and notes per run, the team clock set by the harness.
//
// Boundary (R6): behaviour rows, proved at the HTTP harness — GET /api/requests, the own requests page's data
// (D-029), read through lists.ts (facts read by value inside the record carrying the request's id; the reading is
// stated there). Team zone Pacific/Auckland. Every decision and cancel happens at its own clock instant, distinct from
// every send instant and from each other, so "when" is one instant per act.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  fresh,
  freshName,
  readBalance,
  reject,
  setClock,
  signInMember,
  type AccountId,
} from './harness';
import {
  freshInstall,
  hasInstant,
  hasString,
  idsOf,
  minutesAfter,
  readOwnRequests,
  recordOf,
  rejectWithNoteOk,
  sendAt,
  show,
  statesOf,
} from './lists';

/** Tuesday 2027-03-02 09:00 in the team zone (Monday 20:00 UTC). */
const T0 = '2027-03-01T20:00:00Z';
const world = () => freshInstall(T0, '2027-03-02');

// =====================================================================================================
// ROW-027 — a decided request shows who decided it and when
// =====================================================================================================
// ROW-027 promise: REQ-006 "each with … who decided it and when"; fail-if (3) "a decided request does not show who
// ROW-027   decided it and when". Authority: REQ-006 arm 3 and A-023 ("the person sees who decided each of their
// ROW-027   requests and when"). Who is read as the decider's display name, the way the person knows them.
// ROW-027 wrong product: the record shows the state only; shows the role word "admin" instead of the person who
// ROW-027   decided; shows when the request was sent (or the last change on any request) as when it was decided.
// ROW-027 given: the member sends a vacation, a sick request and a second vacation at 09:01–09:03 team time; the
// ROW-027   admin (fresh name) approves the vacation at 2027-03-02T03:17Z and rejects the sick request at
// ROW-027   2027-03-03T22:41Z; the second vacation stays pending. when: the member reads their own list. then: the
// ROW-027   approved record carries the admin's name and the approval instant and not the rejection instant; the
// ROW-027   rejected record carries the admin's name and the rejection instant and not the approval instant.
// ROW-027 controls: the approved and rejected records are listed in their states, so the decisions happened.
// ROW-027 technique: fresh name as "who"; distinct instants per act as "when", checked on the right record with the
// ROW-027   other act's instant as the near miss.
// ROW-027 cases: ROW-027 target=ROW-027.REQ-006.decided-request-shows-who-decided-and-when control=ROW-027.control.decided-requests-listed-in-their-states

const T_APPROVE = '2027-03-02T03:17:00Z';
const T_REJECT = '2027-03-03T22:41:00Z';

async function setup027() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Lena') });
  const me = await signInMember(member);
  const vacation = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const sick = await sendAt(me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 2));
  const pending = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-29' }, minutesAfter(T0, 3));
  await setClock(T_APPROVE);
  await approve(w.admin, vacation);
  await setClock(T_REJECT);
  await reject(w.admin, sick);
  return { ...w, me, vacation, sick, pending, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-027.control.decided-requests-listed-in-their-states', async () => {
  const s = await setup027();
  try {
    const list = await readOwnRequests(s.me);
    const v = recordOf(list, s.vacation);
    const k = recordOf(list, s.sick);
    expect.soft(v && statesOf(v).has('approved'), `ROW-027 control: the vacation is listed approved: ${show(v)}`).toBe(true);
    expect.soft(k && statesOf(k).has('rejected'), `ROW-027 control: the sick request is listed rejected: ${show(k)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-027.REQ-006.decided-request-shows-who-decided-and-when', async () => {
  const s = await setup027();
  try {
    const tz = s.install.timeZone;
    const who = s.install.admin.name;
    const list = await readOwnRequests(s.me);
    const v = recordOf(list, s.vacation);
    const k = recordOf(list, s.sick);
    expect(v && k, `ROW-027: the decided requests are listed; ids ${idsOf(list)}`).toBeTruthy();
    expect.soft(hasString(v!, who), `ROW-027: the approved request shows who decided it, "${who}": ${show(v)}`).toBe(true);
    expect.soft(hasInstant(v!, T_APPROVE, tz), `ROW-027: the approved request shows when, ${T_APPROVE}: ${show(v)}`).toBe(true);
    expect.soft(hasInstant(v!, T_REJECT, tz), `ROW-027: the approved request does not show the other decision's instant: ${show(v)}`).toBe(false);
    expect.soft(hasString(k!, who), `ROW-027: the rejected request shows who decided it, "${who}": ${show(k)}`).toBe(true);
    expect.soft(hasInstant(k!, T_REJECT, tz), `ROW-027: the rejected request shows when, ${T_REJECT}: ${show(k)}`).toBe(true);
    expect.soft(hasInstant(k!, T_APPROVE, tz), `ROW-027: the rejected request does not show the other decision's instant: ${show(k)}`).toBe(false);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-028 — a rejected request with a note shows the note
// =====================================================================================================
// ROW-028 promise: REQ-006 "and the admin's rejection note if any"; fail-if (4) "a rejected request with a note does
// ROW-028   not show the note". Authority: REQ-006 arm 4 and A-015 (an optional note of up to 200 characters,
// ROW-028   "shown only to the person and the admin").
// ROW-028 wrong product: the note is stored but not sent to the person; it is cut short; every rejected request
// ROW-028   shows the latest note given; the note is shown on the wrong one of two rejected requests.
// ROW-028 given: the member sends three requests; the admin rejects the first with a fresh note N1, the second with
// ROW-028   a fresh note N2 carrying non-ASCII letters, the third with no note. when: the member reads their own list.
// ROW-028   then: the first record carries N1 whole and not N2, the second N2 whole and not N1, the third neither.
// ROW-028 controls: the two noted requests are listed rejected, so the rejections with a note went through.
// ROW-028 technique: fresh notes as decoys of each other on two records, exact whole-string match (no truncation).
// ROW-028 cases: ROW-028 target=ROW-028.REQ-006.rejected-request-shows-its-note control=ROW-028.control.noted-requests-listed-rejected

async function setup028() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Mia') });
  const me = await signInMember(member);
  const r1 = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const r2 = await sendAt(me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }, minutesAfter(T0, 2));
  const r3 = await sendAt(me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 3));
  const n1 = `Team offsite that week, sorry ${fresh('n1')}`;
  const n2 = `Überschneidung mit der Inventur — bitte später ${fresh('n2')}`;
  await setClock(minutesAfter(T0, 10));
  await rejectWithNoteOk(w.admin, r1, n1);
  await rejectWithNoteOk(w.admin, r2, n2);
  await reject(w.admin, r3);
  return { ...w, me, r1, r2, r3, n1, n2, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-028.control.noted-requests-listed-rejected', async () => {
  const s = await setup028();
  try {
    const list = await readOwnRequests(s.me);
    for (const id of [s.r1, s.r2]) {
      const r = recordOf(list, id);
      expect.soft(r && statesOf(r).has('rejected'), `ROW-028 control: request ${id} is listed rejected: ${show(r)}`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

test('ROW-028.REQ-006.rejected-request-shows-its-note', async () => {
  const s = await setup028();
  try {
    const list = await readOwnRequests(s.me);
    const r1 = recordOf(list, s.r1);
    const r2 = recordOf(list, s.r2);
    const r3 = recordOf(list, s.r3);
    expect(r1 && r2 && r3, `ROW-028: the three rejected requests are listed; ids ${idsOf(list)}`).toBeTruthy();
    expect.soft(hasString(r1!, s.n1), `ROW-028: the first rejected request shows its note "${s.n1}" whole: ${show(r1)}`).toBe(true);
    expect.soft(hasString(r1!, s.n2), `ROW-028: the first rejected request does not show the second's note: ${show(r1)}`).toBe(false);
    expect.soft(hasString(r2!, s.n2), `ROW-028: the second rejected request shows its note "${s.n2}" whole: ${show(r2)}`).toBe(true);
    expect.soft(hasString(r2!, s.n1), `ROW-028: the second rejected request does not show the first's note: ${show(r2)}`).toBe(false);
    expect.soft(hasString(r3!, s.n1) || hasString(r3!, s.n2), `ROW-028: the request rejected without a note shows no note: ${show(r3)}`).toBe(false);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-031 — a cancelled or partly cancelled request shows who cancelled it, when, and from which day
// =====================================================================================================
// ROW-031 promise: REQ-006 "who cancelled it and when and from which day"; fail-if (7); the row: "For a whole
// ROW-031   cancel, which records no cancel day, the page shows the whole request as cancelled with who and when".
// ROW-031   Authority: REQ-006 arm 7, A-030 (a partly cancelled request stays one request, shortened, "with the cancel
// ROW-031   date and who cancelled it recorded"; a request with no day before today becomes cancelled), A-023 (who and
// ROW-031   when for every cancellation). The partial cancel's day is today in the team zone (A-030: the admin cancels
// ROW-031   from today on), a Wednesday.
// ROW-031 wrong product: the record shows the state only; the cancel day is the UTC date (Tuesday 2027-03-09) not
// ROW-031   the team date (Wednesday 2027-03-10); the canceller of a person's own cancel is shown as the admin; a whole
// ROW-031   cancel is shown with a cancel day but not as cancelled; one cancel's instant is shown on another request.
// ROW-031 given: the member's vacation Mon 2027-03-08..Fri 2027-03-19 approved; a second vacation (April) the
// ROW-031   member cancels themselves at 2027-03-02T01:23Z while pending; a third (May) approved, then cancelled whole by
// ROW-031   the admin at 2027-03-09T22:08Z; the first cancelled by the admin at 2027-03-09T20:34Z, which is Wednesday
// ROW-031   2027-03-10 09:34 in the team zone. when: the member reads their own list. then: the partly cancelled record
// ROW-031   carries the admin's name, its cancel instant (not the other admin cancel's) and the day 2027-03-10; the
// ROW-031   member's own cancel carries the member's name, its instant, the state cancelled and no admin name; the
// ROW-031   admin's whole cancel carries the admin's name, its instant (not the partial's) and the state cancelled.
// ROW-031 controls: the member's 2027 days left is 25 − 2 = 23 (Monday and Tuesday kept, the rest returned), so the
// ROW-031   partial cancel and the whole cancels took effect, and the three requests are listed.
// ROW-031 technique: the clock's origin — an instant where the team date and the UTC date differ; distinct instants
// ROW-031   per cancel as near misses; the canceller's name checked against the other actor. Honest limit: on the two
// ROW-031   admin cancels the decider and the canceller are the same admin, so the name alone cannot tell "who
// ROW-031   cancelled" from "who decided" there; the member's own cancel carries that discrimination.
// ROW-031 cases: ROW-031 target=ROW-031.REQ-006.cancelled-request-shows-who-when-and-from-which-day control=ROW-031.control.cancels-took-effect

const T_OWN_CANCEL = '2027-03-02T01:23:00Z';
const T_PARTIAL = '2027-03-09T20:34:00Z';
const PARTIAL_DAY = '2027-03-10';
const T_WHOLE = '2027-03-09T22:08:00Z';

async function setup031() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Noor'), allowance: 25 });
  const me = await signInMember(member);
  const partial = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }, minutesAfter(T0, 1));
  const own: AccountId = await sendAt(me, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-14' }, minutesAfter(T0, 2));
  const whole = await sendAt(me, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' }, minutesAfter(T0, 3));
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, partial);
  await approve(w.admin, whole);
  await setClock(T_OWN_CANCEL);
  await cancelOwnRequest(me, own);
  await setClock(T_PARTIAL);
  await adminCancel(w.admin, partial);
  await setClock(T_WHOLE);
  await adminCancel(w.admin, whole);
  return { ...w, member, me, partial, own, whole, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-031.control.cancels-took-effect', async () => {
  const s = await setup031();
  try {
    const balance = await readBalance(s.me);
    const y2027 = balance.years.find((y) => y.year === 2027);
    expect(y2027?.daysLeft, `ROW-031 control: 2027 days left after the cancels is 25 − 2: ${JSON.stringify(balance)}`).toBe(23);
    const list = await readOwnRequests(s.me);
    for (const id of [s.partial, s.own, s.whole]) {
      expect.soft(recordOf(list, id), `ROW-031 control: request ${id} is listed; ids ${idsOf(list)}`).toBeDefined();
    }
  } finally {
    await s.close();
  }
});

test('ROW-031.REQ-006.cancelled-request-shows-who-when-and-from-which-day', async () => {
  const s = await setup031();
  try {
    const tz = s.install.timeZone;
    const adminName = s.install.admin.name;
    const list = await readOwnRequests(s.me);
    const partial = recordOf(list, s.partial);
    const own = recordOf(list, s.own);
    const whole = recordOf(list, s.whole);
    expect(partial && own && whole, `ROW-031: the three requests are listed; ids ${idsOf(list)}`).toBeTruthy();

    // Partly cancelled: who, when and from which day.
    expect.soft(hasString(partial!, adminName), `ROW-031: the partly cancelled request shows who cancelled it, "${adminName}": ${show(partial)}`).toBe(true);
    expect.soft(hasInstant(partial!, T_PARTIAL, tz), `ROW-031: the partly cancelled request shows when, ${T_PARTIAL}: ${show(partial)}`).toBe(true);
    expect.soft(hasString(partial!, PARTIAL_DAY), `ROW-031: the partly cancelled request shows the day it is cancelled from, ${PARTIAL_DAY} (team date): ${show(partial)}`).toBe(true);
    expect.soft(hasInstant(partial!, T_WHOLE, tz), `ROW-031: the partly cancelled request does not show the other cancel's instant: ${show(partial)}`).toBe(false);

    // The member's own whole cancel: the whole request cancelled, by the member, when.
    expect.soft(statesOf(own!).has('cancelled'), `ROW-031: the member's own cancel shows the whole request cancelled: ${show(own)}`).toBe(true);
    expect.soft(hasString(own!, s.member.name), `ROW-031: the member's own cancel shows who cancelled it, "${s.member.name}": ${show(own)}`).toBe(true);
    expect.soft(hasString(own!, adminName), `ROW-031: the member's own cancel is not shown as the admin's: ${show(own)}`).toBe(false);
    expect.soft(hasInstant(own!, T_OWN_CANCEL, tz), `ROW-031: the member's own cancel shows when, ${T_OWN_CANCEL}: ${show(own)}`).toBe(true);

    // The admin's whole cancel: the whole request cancelled, by the admin, when.
    expect.soft(statesOf(whole!).has('cancelled'), `ROW-031: the admin's whole cancel shows the whole request cancelled: ${show(whole)}`).toBe(true);
    expect.soft(hasString(whole!, adminName), `ROW-031: the admin's whole cancel shows who cancelled it, "${adminName}": ${show(whole)}`).toBe(true);
    expect.soft(hasInstant(whole!, T_WHOLE, tz), `ROW-031: the admin's whole cancel shows when, ${T_WHOLE}: ${show(whole)}`).toBe(true);
    expect.soft(hasInstant(whole!, T_PARTIAL, tz), `ROW-031: the admin's whole cancel does not show the partial cancel's instant: ${show(whole)}`).toBe(false);
  } finally {
    await s.close();
  }
});
