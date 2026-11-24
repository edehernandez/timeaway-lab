// Purpose: ledger tests for ROW-027, ROW-028 and ROW-031 (REQ-006) — on the person's own requests list, a decided request shows who decided it and when, a rejected one its note, and a cancelled or partly cancelled one who cancelled it, when and from which day.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, requests, decisions, a rejection's note, cancels), fresh names and notes per run, the team clock set by the harness; the page cases of ROW-027, ROW-028 and ROW-031 added in slice 1 by batch test-author-5 (lesson L-1: the drawn rows read on / beside the API), through own-page.ts.
//
// Boundary (R6): behaviour rows, proved at the HTTP harness — GET /api/requests, the own requests page's data
// (D-029), read through lists.ts (facts read by value inside the record carrying the request's id; the reading is
// stated there). Team zone Pacific/Auckland. Every decision and cancel happens at its own clock instant, distinct from
// every send instant and from each other, so "when" is one instant per act.
// The page cases (at the end) open / in the person's browser (engine door) and read the drawn rows themselves.
import { test, expect } from '@playwright/test';
import { readOwnPage, rowOf, saysDay, saysState, type DrawnSpec } from './own-page';
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
// ROW-027 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-028 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-031 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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

// =====================================================================================================
// ROW-027, ROW-028, ROW-031 — on the own requests page itself (added, slice 1, test-author-5; lesson L-1)
// =====================================================================================================
// The API cases above read GET /api/requests; a page that drops, merges or relabels on the client keeps them green.
// These cases open / in the person's browser (engine door) and read each request's drawn row (own-page.ts: a row is
// found by its first and last day, bounded by the other requests' days). Their data is chosen so that every act
// falls on its own team date, distinct from each send date and from every request's days, so "when" is a date the
// row can be read for and the other act's date is the near miss.

// ROW-027 promise: REQ-006 "each with … who decided it and when"; fail-if (3) "a decided request does not show who
// ROW-027   decided it and when" — on the page. Authority: REQ-006 arm 3, A-023 ("the person sees who decided each of
// ROW-027   their requests and when"). Who is the decider's display name; when is the decision's team-zone date (D-007).
// ROW-027 wrong product: the API record carries decider and time, but the page draws the state only; draws "Admin"
// ROW-027   for who; draws the sent date as the decided date; draws the UTC date (the day before in Auckland); or draws
// ROW-027   one decision's "by … on …" on every decided row.
// ROW-027 given: setup027Page — sent on Tue 2027-03-02 (team): a vacation 22..23 March, a sick day 1 March, a pending
// ROW-027   vacation 29 March; the admin (fresh name) approves the vacation at 2027-03-03T20:17Z (Thu 4 March 09:17 team,
// ROW-027   UTC still 3 March) and rejects the sick day at 2027-03-07T20:41Z (Mon 8 March 09:41 team, UTC 7 March).
// ROW-027   when: the member's browser opens /. then: the approved row draws the admin's name and 4 March, and neither
// ROW-027   8 March nor 3 March; the rejected row draws the admin's name and 8 March, and neither 4 March nor 7 March;
// ROW-027   the pending row draws no admin name.
// ROW-027 controls: ROW-027.control.page-draws-decided-rows-in-their-states — the three rows are drawn and the two
// ROW-027   decided ones draw their states, so the decisions happened and the rows are reached.
// ROW-027 technique: fresh name as who; one team date per act as when, the other act's date and the UTC date as near
// ROW-027   misses on the right row; the pending row as the neighbour that must stay without a decider.
// ROW-027 cases: ROW-027 target=ROW-027.REQ-006.page-row-draws-who-decided-and-when control=ROW-027.control.page-draws-decided-rows-in-their-states

const T_APPROVE_PAGE = '2027-03-03T20:17:00Z';
const T_REJECT_PAGE = '2027-03-07T20:41:00Z';
const ROWS_027: DrawnSpec[] = [
  { label: 'approved vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' },
  { label: 'rejected sick', firstDay: '2027-03-01', lastDay: '2027-03-01' },
  { label: 'pending vacation', firstDay: '2027-03-29', lastDay: '2027-03-29' },
];

async function setup027Page() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Lena') });
  const me = await signInMember(member);
  const vacation = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const sick = await sendAt(me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 2));
  await sendAt(me, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-29' }, minutesAfter(T0, 3));
  await setClock(T_APPROVE_PAGE);
  await approve(w.admin, vacation);
  await setClock(T_REJECT_PAGE);
  await reject(w.admin, sick);
  return { ...w, me, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-027.control.page-draws-decided-rows-in-their-states', async ({ browser }) => {
  const s = await setup027Page();
  try {
    const read = await readOwnPage(browser, s.me, ROWS_027);
    for (const r of ROWS_027) expect.soft(rowOf(read, r.label).found, `ROW-027 control: / draws the ${r.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
    const v = rowOf(read, 'approved vacation');
    const k = rowOf(read, 'rejected sick');
    expect.soft(saysState(v.text, 'approved'), `ROW-027 control: the vacation's row draws approved: "${v.text}"`).toBe(true);
    expect.soft(saysState(k.text, 'rejected'), `ROW-027 control: the sick day's row draws rejected: "${k.text}"`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-027.REQ-006.page-row-draws-who-decided-and-when', async ({ browser }) => {
  const s = await setup027Page();
  try {
    const who = s.install.admin.name;
    const read = await readOwnPage(browser, s.me, ROWS_027);
    const v = rowOf(read, 'approved vacation');
    const k = rowOf(read, 'rejected sick');
    const p = rowOf(read, 'pending vacation');
    expect(v.found && k.found && p.found, `ROW-027: / draws the three rows; page: "${read.body.slice(0, 600)}"`).toBe(true);
    expect.soft(v.text.includes(who), `ROW-027: the approved row draws who decided it, "${who}": "${v.text}"`).toBe(true);
    expect.soft(saysDay(v.text, '2027-03-04'), `ROW-027: the approved row draws when, 4 March 2027 (team date): "${v.text}"`).toBe(true);
    expect.soft(saysDay(v.text, '2027-03-08'), `ROW-027: the approved row does not draw the rejection's date 8 March: "${v.text}"`).toBe(false);
    expect.soft(saysDay(v.text, '2027-03-03'), `ROW-027: the approved row does not draw the approval's UTC date 3 March: "${v.text}"`).toBe(false);
    expect.soft(k.text.includes(who), `ROW-027: the rejected row draws who decided it, "${who}": "${k.text}"`).toBe(true);
    expect.soft(saysDay(k.text, '2027-03-08'), `ROW-027: the rejected row draws when, 8 March 2027 (team date): "${k.text}"`).toBe(true);
    expect.soft(saysDay(k.text, '2027-03-04'), `ROW-027: the rejected row does not draw the approval's date 4 March: "${k.text}"`).toBe(false);
    expect.soft(saysDay(k.text, '2027-03-07'), `ROW-027: the rejected row does not draw the rejection's UTC date 7 March: "${k.text}"`).toBe(false);
    expect.soft(p.text.includes(who), `ROW-027: the pending row draws no decider: "${p.text}"`).toBe(false);
  } finally {
    await s.close();
  }
});

// ROW-028 promise: REQ-006 "and the admin's rejection note if any"; fail-if (4) "a rejected request with a note does
// ROW-028   not show the note" — on the page. Authority: REQ-006 arm 4, A-015 (an optional note of up to 200
// ROW-028   characters, shown only to the person and the admin).
// ROW-028 wrong product: the API record carries the note, but the page does not draw it; cuts it short (an
// ROW-028   ellipsis after 40 characters); draws it on the wrong one of two rejected rows; or draws the latest note on
// ROW-028   every rejected row.
// ROW-028 given: setup028 — three requests (22..23 March, 5..6 April, sick 1 March) rejected on 2027-03-02, the first
// ROW-028   with fresh note N1, the second with fresh note N2 carrying non-ASCII letters, the third with none. when: the
// ROW-028   member's browser opens /. then: the first row draws N1 whole and not N2, the second N2 whole and not N1, the
// ROW-028   third neither.
// ROW-028 controls: ROW-028.control.page-draws-the-noted-rows-rejected — the three rows are drawn and the two noted
// ROW-028   ones draw rejected, so the rejections with a note went through and the rows are reached.
// ROW-028 technique: fresh notes as decoys of each other on two rows, whole-string match (no truncation passes).
// ROW-028 cases: ROW-028 target=ROW-028.REQ-006.page-row-draws-its-rejection-note control=ROW-028.control.page-draws-the-noted-rows-rejected

const ROWS_028: DrawnSpec[] = [
  { label: 'first rejected (note N1)', firstDay: '2027-03-22', lastDay: '2027-03-23' },
  { label: 'second rejected (note N2)', firstDay: '2027-04-05', lastDay: '2027-04-06' },
  { label: 'third rejected (no note)', firstDay: '2027-03-01', lastDay: '2027-03-01' },
];

test('ROW-028.control.page-draws-the-noted-rows-rejected', async ({ browser }) => {
  const s = await setup028();
  try {
    const read = await readOwnPage(browser, s.me, ROWS_028);
    for (const r of ROWS_028) {
      const row = rowOf(read, r.label);
      expect.soft(row.found, `ROW-028 control: / draws the ${r.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
      expect.soft(saysState(row.text, 'rejected'), `ROW-028 control: the ${r.label}'s row draws rejected: "${row.text}"`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

test('ROW-028.REQ-006.page-row-draws-its-rejection-note', async ({ browser }) => {
  const s = await setup028();
  try {
    const n1 = s.n1.replace(/\s+/g, ' ').trim();
    const n2 = s.n2.replace(/\s+/g, ' ').trim();
    const read = await readOwnPage(browser, s.me, ROWS_028);
    const [r1, r2, r3] = ROWS_028.map((r) => rowOf(read, r.label));
    expect(r1.found && r2.found && r3.found, `ROW-028: / draws the three rejected rows; page: "${read.body.slice(0, 600)}"`).toBe(true);
    expect.soft(r1.text.includes(n1), `ROW-028: the first row draws its note "${n1}" whole: "${r1.text}"`).toBe(true);
    expect.soft(r1.text.includes(n2), `ROW-028: the first row does not draw the second's note: "${r1.text}"`).toBe(false);
    expect.soft(r2.text.includes(n2), `ROW-028: the second row draws its note "${n2}" whole: "${r2.text}"`).toBe(true);
    expect.soft(r2.text.includes(n1), `ROW-028: the second row does not draw the first's note: "${r2.text}"`).toBe(false);
    expect.soft(r3.text.includes(n1) || r3.text.includes(n2), `ROW-028: the row rejected without a note draws no note: "${r3.text}"`).toBe(false);
  } finally {
    await s.close();
  }
});

// ROW-031 promise: REQ-006 "who cancelled it and when and from which day"; fail-if (7); the row: "For a whole
// ROW-031   cancel, which records no cancel day, the page shows the whole request as cancelled with who and when" — on
// ROW-031   the page. Authority: REQ-006 arm 7, A-030 (a partly cancelled request stays one request, "the cancelled days
// ROW-031   shown as cancelled on the person's page", the cancel date and who cancelled recorded), A-023, and D-040 (the
// ROW-031   cancel day is the first Monday-to-Friday day on or after the team's today; a whole cancel records none).
// ROW-031 wrong product: the API record carries canceller, instant and cancel day, but the page draws the state only;
// ROW-031   draws the cancel's date as the day it is cancelled from (or the day as the date); names the admin as the
// ROW-031   canceller of the person's own cancel; draws a whole cancel as approved; or one cancel's date on another row.
// ROW-031 given: setup031Page — sent Tue 2027-03-02 (team): vacation 8..19 March, vacation 12..14 April, vacation
// ROW-031   10..11 May; the first and third approved that day. The member cancels the April request (pending) at
// ROW-031   2027-03-03T21:23Z (Thu 4 March team); the admin cancels the May request whole at 2027-03-04T22:08Z (Fri 5
// ROW-031   March team); the admin cancels the March request at 2027-03-12T21:34Z — Saturday 13 March 10:34 team (UTC
// ROW-031   still Friday 12 March), so by D-040 it is cancelled from Monday 15 March: the cancel's date and the day it is
// ROW-031   cancelled from differ. when: the member's browser opens /. then: the March row draws the admin's name,
// ROW-031   13 March (when) and 15 March (from which day), and neither 4 nor 5 March; the April row draws cancelled, who
// ROW-031   (the member's name, or "you"), 4 March, no admin name, and neither 5 nor 13 March; the May row draws
// ROW-031   cancelled, the admin's name, 5 March, and neither 4 nor 13 March.
// ROW-031 controls: ROW-031.control.page-draws-the-cancelled-rows — the member's 2027 days left is 25 − 5 = 20 (8..12
// ROW-031   March kept, the rest returned; the API balance), so the cancels took effect, and the three rows are drawn.
// ROW-031 technique: the clock's origin — a weekend cancel, where the cancel date and the cancelled-from day part —
// ROW-031   one team date per cancel, the other cancels' dates as near misses on the right row; the canceller checked
// ROW-031   against the other actor. Honest limit: on the two admin cancels the decider and the canceller are the same
// ROW-031   admin, so the name alone cannot tell "who cancelled" from "who decided" there; the own cancel carries that.
// ROW-031 cases: ROW-031 target=ROW-031.REQ-006.page-row-draws-who-cancelled-when-and-from-which-day control=ROW-031.control.page-draws-the-cancelled-rows

const T_OWN_CANCEL_PAGE = '2027-03-03T21:23:00Z';
const T_WHOLE_PAGE = '2027-03-04T22:08:00Z';
const T_PARTIAL_PAGE = '2027-03-12T21:34:00Z';
const ROWS_031: DrawnSpec[] = [
  { label: 'partly cancelled March vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' },
  { label: "April vacation the member cancelled", firstDay: '2027-04-12', lastDay: '2027-04-14' },
  { label: 'May vacation the admin cancelled whole', firstDay: '2027-05-10', lastDay: '2027-05-11' },
];

async function setup031Page() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Noor'), allowance: 25 });
  const me = await signInMember(member);
  const partial = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }, minutesAfter(T0, 1));
  const own = await sendAt(me, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-14' }, minutesAfter(T0, 2));
  const whole = await sendAt(me, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' }, minutesAfter(T0, 3));
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, partial);
  await approve(w.admin, whole);
  await setClock(T_OWN_CANCEL_PAGE);
  await cancelOwnRequest(me, own);
  await setClock(T_WHOLE_PAGE);
  await adminCancel(w.admin, whole);
  await setClock(T_PARTIAL_PAGE);
  await adminCancel(w.admin, partial);
  return { ...w, member, me, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-031.control.page-draws-the-cancelled-rows', async ({ browser }) => {
  const s = await setup031Page();
  try {
    const balance = await readBalance(s.me);
    const y2027 = balance.years.find((y) => y.year === 2027);
    expect.soft(y2027?.daysLeft, `ROW-031 control: 2027 days left after the cancels is 25 − 5: ${JSON.stringify(balance)}`).toBe(20);
    const read = await readOwnPage(browser, s.me, ROWS_031);
    for (const r of ROWS_031) expect.soft(rowOf(read, r.label).found, `ROW-031 control: / draws the ${r.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-031.REQ-006.page-row-draws-who-cancelled-when-and-from-which-day', async ({ browser }) => {
  const s = await setup031Page();
  try {
    const adminName = s.install.admin.name;
    const read = await readOwnPage(browser, s.me, ROWS_031);
    const [partial, own, whole] = ROWS_031.map((r) => rowOf(read, r.label));
    expect(partial.found && own.found && whole.found, `ROW-031: / draws the three rows; page: "${read.body.slice(0, 600)}"`).toBe(true);

    // Partly cancelled: who, when (13 March) and from which day (15 March).
    expect.soft(partial.text.includes(adminName), `ROW-031: the partly cancelled row draws who cancelled it, "${adminName}": "${partial.text}"`).toBe(true);
    expect.soft(saysDay(partial.text, '2027-03-13'), `ROW-031: the partly cancelled row draws when, 13 March 2027 (team date): "${partial.text}"`).toBe(true);
    expect.soft(saysDay(partial.text, '2027-03-15'), `ROW-031: the partly cancelled row draws the day it is cancelled from, 15 March 2027: "${partial.text}"`).toBe(true);
    for (const d of ['2027-03-04', '2027-03-05']) {
      expect.soft(saysDay(partial.text, d), `ROW-031: the partly cancelled row draws no other cancel's date ${d}: "${partial.text}"`).toBe(false);
    }

    // The member's own cancel: cancelled, by the member, when (4 March).
    expect.soft(saysState(own.text, 'cancelled'), `ROW-031: the member's own cancel's row draws cancelled: "${own.text}"`).toBe(true);
    expect
      .soft(own.text.includes(s.member.name) || /(?<![a-z])you(?![a-z])/i.test(own.text), `ROW-031: the member's own cancel's row draws who cancelled it, "${s.member.name}" (or "you"): "${own.text}"`)
      .toBe(true);
    expect.soft(own.text.includes(adminName), `ROW-031: the member's own cancel's row does not name the admin: "${own.text}"`).toBe(false);
    expect.soft(saysDay(own.text, '2027-03-04'), `ROW-031: the member's own cancel's row draws when, 4 March 2027: "${own.text}"`).toBe(true);
    for (const d of ['2027-03-05', '2027-03-13']) {
      expect.soft(saysDay(own.text, d), `ROW-031: the member's own cancel's row draws no other cancel's date ${d}: "${own.text}"`).toBe(false);
    }

    // The admin's whole cancel: the whole request cancelled, by the admin, when (5 March).
    expect.soft(saysState(whole.text, 'cancelled'), `ROW-031: the admin's whole cancel's row draws the whole request cancelled: "${whole.text}"`).toBe(true);
    expect.soft(whole.text.includes(adminName), `ROW-031: the admin's whole cancel's row draws who cancelled it, "${adminName}": "${whole.text}"`).toBe(true);
    expect.soft(saysDay(whole.text, '2027-03-05'), `ROW-031: the admin's whole cancel's row draws when, 5 March 2027: "${whole.text}"`).toBe(true);
    for (const d of ['2027-03-04', '2027-03-13']) {
      expect.soft(saysDay(whole.text, d), `ROW-031: the admin's whole cancel's row draws no other cancel's date ${d}: "${whole.text}"`).toBe(false);
    }
  } finally {
    await s.close();
  }
});
