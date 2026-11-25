// Purpose: ledger tests for ROW-091, ROW-092, ROW-093, ROW-094 and ROW-096 (REQ-019) — an approved request cancelled with weekdays before today, by the admin's cancel or by a switch-off, stays approved, stops counting and showing from the cancel day, records the cancel day and who cancelled, shows the cancelled days on the person's own list and keeps its days as sent.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve, the admin's cancel, switch off and back on), read through records.ts, fresh per run; ROW-094's page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn row read on the person's page / beside the API), through page-figures.ts and own-page.ts.
//
// Boundary (R6): a lifecycle rule, at the HTTP harness — the person's own requests (GET /api/requests, the data of
// the person's page), the admin's view of the person's requests (GET /api/admin/people/:id/requests), the balance
// (GET /api/balance) and the calendar (GET /api/calendar), D-029. A switched-off person has no session (REQ-014), so
// their own list and balance are read after the admin switches them back on (REQ-016: that restores nothing).
// Record fields are read as records.ts states (by id, by value, who and when among the facts about the cancel).
//
// Every row's cases run under BOTH doors the row names, in one case, on one reset:
//   A1 — the admin cancels;  A2 — the admin switches the account off;  both at Wed 2027-03-10 09:00 (team zone
//        Pacific/Auckland; the UTC date is still Tue 03-09) on Mon 03-08 … Fri 03-12: in effect 03-08, 03-09; the
//        cancel takes effect from 03-10.
//   B1 — the admin cancels;  B2 — switch-off;  both at Sat 2027-03-13 09:00 (UTC still Fri 03-12) on Thu 03-11 …
//        Wed 03-17: in effect 03-11, 03-12; the cancel takes effect from Mon 03-15 (REQ-017: the Monday to Friday
//        day it takes effect from), a day that is no act's date, so it can be read by value.
//   N  — a neighbour with Mon 03-08 … Fri 03-12 approved, never cancelled (isolation).
// Every request was sent Mon 03-01 and approved Tue 03-02; each person's allowance is 25.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  readBalance,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
  type RequestSpec,
} from './harness';
import {
  actAt,
  actBy,
  anyHolds,
  awayOn,
  CANCELLED,
  daysLeftIn,
  normalState,
  observeCalendar,
  observeOwnRequests,
  observePersonRequests,
  requestViews,
  show,
  stateOf,
  teamInstant,
  topRecordIds,
  whoOf,
  type Rec,
  type Who,
} from './records';
import { saysDay, saysState } from './own-page';
import { readOwnRows, type OwnSpec } from './page-figures';

const TZ = DEFAULT_TIME_ZONE;
const T_SEND = teamInstant('2027-03-01', '09:00', TZ);
const T_APPROVE = teamInstant('2027-03-02', '09:00', TZ);
const T_WEEKDAY = teamInstant('2027-03-10', '09:00', TZ); // Wed
const T_WEEKEND = teamInstant('2027-03-13', '09:00', TZ); // Sat

const A_SPEC: RequestSpec = { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' };
const B_SPEC: RequestSpec = { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-17' };

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
  await setClock(null).catch(() => undefined);
});

interface Case {
  label: string;
  door: 'admin cancel' | 'switch-off';
  member: Member;
  actor: Actor | null; // null while switched off
  requestId: AccountId;
  spec: RequestSpec;
  at: string;
  inEffect: string[];
  cancelled: string[];
  cancelDay: string;
}

interface Scenario {
  admin: Actor;
  adminWho: Who;
  cases: Case[];
  neighbour: { member: Member; actor: Actor; requestId: AccountId };
}

/** The file header's scenario, stopped after the approvals ('approved') or after the cancels ('cancelled'). */
async function scenario(upTo: 'approved' | 'cancelled'): Promise<Scenario> {
  const install = await resetProduct({ now: T_SEND, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const make = async (label: string) => {
    const member = await createMember(admin, { name: freshName(label), allowance: 25 });
    return { member, actor: keep(await signInMember(member)) };
  };
  const a1 = await make('Ada');
  const a2 = await make('Arne');
  const b1 = await make('Bea');
  const b2 = await make('Bo');
  const n = await make('Nils');
  const cases: Case[] = [
    { label: 'A1', door: 'admin cancel', ...a1, requestId: await sendRequest(a1.actor, A_SPEC), spec: A_SPEC, at: T_WEEKDAY, inEffect: ['2027-03-08', '2027-03-09'], cancelled: ['2027-03-10', '2027-03-11', '2027-03-12'], cancelDay: '2027-03-10' },
    { label: 'A2', door: 'switch-off', ...a2, requestId: await sendRequest(a2.actor, A_SPEC), spec: A_SPEC, at: T_WEEKDAY, inEffect: ['2027-03-08', '2027-03-09'], cancelled: ['2027-03-10', '2027-03-11', '2027-03-12'], cancelDay: '2027-03-10' },
    { label: 'B1', door: 'admin cancel', ...b1, requestId: await sendRequest(b1.actor, B_SPEC), spec: B_SPEC, at: T_WEEKEND, inEffect: ['2027-03-11', '2027-03-12'], cancelled: ['2027-03-15', '2027-03-16', '2027-03-17'], cancelDay: '2027-03-15' },
    { label: 'B2', door: 'switch-off', ...b2, requestId: await sendRequest(b2.actor, B_SPEC), spec: B_SPEC, at: T_WEEKEND, inEffect: ['2027-03-11', '2027-03-12'], cancelled: ['2027-03-15', '2027-03-16', '2027-03-17'], cancelDay: '2027-03-15' },
  ];
  const neighbour = { ...n, requestId: await sendRequest(n.actor, A_SPEC) };
  await setClock(T_APPROVE);
  for (const c of cases) await approve(admin, c.requestId);
  await approve(admin, neighbour.requestId);
  const sc: Scenario = { admin, adminWho: whoOf(admin), cases, neighbour };
  if (upTo === 'approved') return sc;

  for (const at of [T_WEEKDAY, T_WEEKEND]) {
    await setClock(at);
    for (const c of cases.filter((x) => x.at === at)) {
      if (c.door === 'admin cancel') {
        await adminCancel(admin, c.requestId);
      } else {
        await switchAccount(admin, c.member.id, false);
        c.actor = null;
      }
    }
  }
  return sc;
}

/** Switches the switched-off cases back on and signs them in, so their own list and balance can be read. */
async function backOn(sc: Scenario): Promise<void> {
  for (const c of sc.cases) {
    if (c.actor === null) {
      await switchAccount(sc.admin, c.member.id, true);
      c.actor = keep(await signInMember(c.member));
    }
  }
}

/** The case's request as the admin's view and (when it has a session) the person's own list carry it. */
async function viewsOfCase(sc: Scenario, c: Case): Promise<Rec[]> {
  const views: unknown[] = [await observePersonRequests(sc.admin, c.member.id)];
  if (c.actor) views.push(await observeOwnRequests(c.actor));
  return requestViews(c.requestId, c.spec.firstDay, ...views);
}

function where(row: string, c: Case): string {
  return `${row}: ${c.label} (${c.door}, ${c.spec.firstDay}…${c.spec.lastDay})`;
}

// ---------------------------------------------------------------------------------------------------
// ROW-091 promise: REQ-019 fail-if (1) "a partly cancelled request becomes cancelled or rejected"; REQ-019 "the
// ROW-091   request stays approved with its days in effect ending the day before the cancel" (A-030: "it stays one
// ROW-091   approved request … the same when an account is switched off"). The row's cases: run under both the
// ROW-091   admin's cancel and a switch-off of the account.
// ROW-091 wrong product: a cancel that sets state "cancelled" on any approved request, or a switch-off that marks
// ROW-091   every request of the account cancelled; or one that splits the request into an approved and a cancelled one.
// ROW-091 given: A1, A2, B1, B2 approved with weekdays before and after the cancel day. when: the admin cancels A1
// ROW-091   and B1 and switches A2 and B2 off. then: every view of each request reads "approved" (the switched-off ones
// ROW-091   in the admin's view while off, and in their own list after switching back on), each person still has exactly
// ROW-091   one record of it, and the cancel was reached: the calendar no longer lists the person on the cancel day.
// ROW-091 controls: the control case stops after the approvals: all four read approved and the calendar lists each
// ROW-091   person on their cancel day — so "approved" after is not a no-op and "absent on the cancel day" is new.
// ROW-091 technique: both doors in one case; a weekday and a weekend cancel; the reach check on the calendar makes
// ROW-091   "stays approved" fail a product whose cancel did nothing.
// ROW-091 cases: ROW-091 target=ROW-091.REQ-019.a-partly-cancelled-request-stays-approved-under-cancel-and-switch-off control=ROW-091.control.before-the-cancels-all-read-approved-and-are-on-the-calendar
test('ROW-091.control.before-the-cancels-all-read-approved-and-are-on-the-calendar', async () => {
  const sc = await scenario('approved');
  const cal = await observeCalendar(sc.admin, 2027, 3);
  for (const c of sc.cases) {
    const views = await viewsOfCase(sc, c);
    expect.soft(views.map((r) => normalState(stateOf(r))), `${where('ROW-091 control', c)} reads approved (${show(views)})`).toContain('approved');
    expect.soft(awayOn(cal, c.cancelDay), `${where('ROW-091 control', c)} is on the calendar on ${c.cancelDay}`).toContain(c.member.name);
  }
});

test('ROW-091.REQ-019.a-partly-cancelled-request-stays-approved-under-cancel-and-switch-off', async () => {
  const sc = await scenario('cancelled');
  const check = async (phase: string) => {
    const cal = await observeCalendar(sc.admin, 2027, 3);
    for (const c of sc.cases) {
      const views = await viewsOfCase(sc, c);
      expect.soft(views.length, `${where('ROW-091', c)} is listed ${phase}`).toBeGreaterThan(0);
      for (const r of views) expect.soft(normalState(stateOf(r)), `${where('ROW-091', c)} reads approved ${phase} (${show(r)})`).toBe('approved');
      expect.soft(awayOn(cal, c.cancelDay), `${where('ROW-091', c)}: the cancel was reached — not on the calendar on ${c.cancelDay}`).not.toContain(c.member.name);
    }
  };
  await check('right after the cancel');
  await backOn(sc);
  await check('in every view, the switched-off ones switched back on');
  for (const c of sc.cases) {
    const own = await observeOwnRequests(c.actor!);
    // each case's person sent exactly one request: a split into an approved and a cancelled request shows as two
    expect.soft(topRecordIds(own), `${where('ROW-091', c)} is still the one request on the person's own list (${show(own)})`).toEqual([String(c.requestId)]);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-092 promise: REQ-019 fail-if (2) "a partly cancelled request still counts or shows a day from the cancel day on
// ROW-092   as approved"; REQ-010 / INV-001: days left = allowance − counted days in effect of approved vacation. The
// ROW-092   row's cases: run under both the admin's cancel and a switch-off.
// ROW-092 wrong product: a partial cancel that records the cancel but still counts the request's five weekdays (days
// ROW-092   left 20), or keeps the request on the calendar to its last day as sent; one that keeps today itself in
// ROW-092   effect (cancel "from tomorrow": A's days left 22, A on the calendar on 03-10); one that decides today by the
// ROW-092   UTC date (A's cancel from 03-09).
// ROW-092 given: the scenario. when: the cancels are made. then: each of A1, A2, B1, B2 has 2027 days left 23 (25 − 2
// ROW-092   days in effect), is listed on the calendar on its two days in effect and on none of its days from the cancel
// ROW-092   day on; the neighbour N, never cancelled, keeps 20 and all five days.
// ROW-092 controls: the control case stops after the approvals: each has days left 20 and is on the calendar on all
// ROW-092   five weekdays — the days the cancel must remove are there before it.
// ROW-092 technique: before and after; values just either side of the cancel day (the last day in effect and the
// ROW-092   cancel day itself); the neighbour as the isolation decoy.
// ROW-092 cases: ROW-092 target=ROW-092.REQ-019.days-from-the-cancel-day-on-stop-counting-and-showing control=ROW-092.control.before-the-cancels-every-weekday-counts-and-shows
test('ROW-092.control.before-the-cancels-every-weekday-counts-and-shows', async () => {
  const sc = await scenario('approved');
  const cal = await observeCalendar(sc.admin, 2027, 3);
  for (const c of sc.cases) {
    expect.soft(daysLeftIn(await readBalance(c.actor!), 2027), `${where('ROW-092 control', c)} has 20 days left before the cancel`).toBe(20);
    for (const d of [...c.inEffect, ...c.cancelled]) {
      expect.soft(awayOn(cal, d), `${where('ROW-092 control', c)} is on the calendar on ${d} before the cancel`).toContain(c.member.name);
    }
  }
});

test('ROW-092.REQ-019.days-from-the-cancel-day-on-stop-counting-and-showing', async () => {
  const sc = await scenario('cancelled');
  await backOn(sc);
  const cal = await observeCalendar(sc.admin, 2027, 3);
  for (const c of sc.cases) {
    expect.soft(daysLeftIn(await readBalance(c.actor!), 2027), `${where('ROW-092', c)} counts only its ${c.inEffect.length} days in effect: 23 days left`).toBe(23);
    for (const d of c.inEffect) expect.soft(awayOn(cal, d), `${where('ROW-092', c)} still shows on ${d}, before the cancel day`).toContain(c.member.name);
    for (const d of c.cancelled) expect.soft(awayOn(cal, d), `${where('ROW-092', c)} no longer shows on ${d}, from the cancel day on`).not.toContain(c.member.name);
  }
  const n = sc.neighbour;
  expect.soft(daysLeftIn(await readBalance(n.actor), 2027), 'ROW-092: the neighbour, never cancelled, keeps 20 days left').toBe(20);
  for (const d of ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12']) {
    expect.soft(awayOn(cal, d), `ROW-092: the neighbour still shows on ${d}`).toContain(n.member.name);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-093 promise: REQ-019 fail-if (3) "the cancel date or who cancelled is not recorded"; REQ-019 "records the
// ROW-093   cancel day and who cancelled"; REQ-017 the record holds "who cancelled it and when and the Monday to Friday
// ROW-093   day its cancel takes effect from" (D-020: a partial cancel records the weekday it takes effect from). The
// ROW-093   row's cases: run under both the admin's cancel and a switch-off.
// ROW-093 wrong product: a partial cancel that rewrites the days in effect but records no cancel day; a switch-off that
// ROW-093   shortens requests silently (no one recorded as cancelling); a weekend cancel recorded as taking effect on the
// ROW-093   Saturday, or a cancel day taken from the UTC date (Fri 03-12).
// ROW-093 given: the scenario. when: the cancels are made. then: B1's and B2's records hold the cancel day 2027-03-15
// ROW-093   (a value no other field of theirs carries: their days are 03-11…03-17, their acts 03-01, 03-02, 03-13); every
// ROW-093   case's facts about the cancel name the admin and carry the cancel instant; A1's and A2's hold 2027-03-10.
// ROW-093 controls: the control case stops after the approvals: no record holds its cancel day and no cancel fact
// ROW-093   names anyone — the recorded cancel is absent before the action.
// ROW-093 technique: before and after; the weekend cancel separates the cancel day from the cancel's date, so the day
// ROW-093   is read by value with no decoy able to supply it.
// ROW-093 cases: ROW-093 target=ROW-093.REQ-019.the-cancel-day-and-who-cancelled-are-recorded control=ROW-093.control.before-the-cancels-no-cancel-is-recorded
test('ROW-093.control.before-the-cancels-no-cancel-is-recorded', async () => {
  const sc = await scenario('approved');
  for (const c of sc.cases) {
    const views = await viewsOfCase(sc, c);
    expect.soft(views.length, `${where('ROW-093 control', c)} is listed`).toBeGreaterThan(0);
    if (c.label.startsWith('B')) expect.soft(anyHolds(views, c.cancelDay), `${where('ROW-093 control', c)} holds no cancel day before the cancel`).toBe(false);
    expect.soft(actBy(views, CANCELLED, sc.adminWho), `${where('ROW-093 control', c)} names no one as cancelling before the cancel`).toBe(false);
  }
});

test('ROW-093.REQ-019.the-cancel-day-and-who-cancelled-are-recorded', async () => {
  const sc = await scenario('cancelled');
  for (const c of sc.cases) {
    const views = await viewsOfCase(sc, c);
    const w = `${where('ROW-093', c)} (${show(views)})`;
    expect.soft(anyHolds(views, c.cancelDay), `${w} records the cancel day ${c.cancelDay}`).toBe(true);
    expect.soft(actBy(views, CANCELLED, sc.adminWho), `${w} records the admin as who cancelled`).toBe(true);
    expect.soft(actAt(views, CANCELLED, c.at, TZ), `${w} records when it was cancelled (${c.at})`).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-094 promise: REQ-019 fail-if (4) "the person's page does not show the cancelled days as cancelled"; A-030
// ROW-094   "the cancelled days shown as cancelled on the person's page"; REQ-006 (7) the own page shows who cancelled,
// ROW-094   when, and from which day. The row's cases: run under both the admin's cancel and a switch-off.
// ROW-094 wrong product: a person's list that shows the shortened request as plain approved with its new last day
// ROW-094   (the cancelled days vanish rather than show as cancelled), or shows the days as sent with no cancel at all.
// ROW-094 given: the scenario. when: the cancels are made; the switched-off persons are switched back on. then: on each
// ROW-094   person's own list (the data of the person's page) the request reads approved and carries, in its one record,
// ROW-094   both its last day as sent and the day the cancel takes effect from — so the page can tell the cancelled days
// ROW-094   (cancel day … last day as sent) from the days in effect — and the admin as who cancelled.
// ROW-094 controls: the control case reads the same own lists after the approvals: the request is there, approved,
// ROW-094   with its days, and without a cancel day.
// ROW-094 technique: the page's own data, at the HTTP boundary (the boundary rule: content, not paint); before and
// ROW-094   after; the weekend cases give a cancel day no other value equals.
// ROW-094 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)
test('ROW-094.control.before-the-cancels-the-own-list-shows-the-approved-request', async () => {
  const sc = await scenario('approved');
  for (const c of sc.cases) {
    const own = requestViews(c.requestId, c.spec.firstDay, await observeOwnRequests(c.actor!));
    expect.soft(own.map((r) => normalState(stateOf(r))), `${where('ROW-094 control', c)} is on the own list, approved (${show(own)})`).toContain('approved');
    expect.soft(anyHolds(own, c.spec.lastDay), `${where('ROW-094 control', c)} carries its last day`).toBe(true);
    if (c.label.startsWith('B')) expect.soft(anyHolds(own, c.cancelDay), `${where('ROW-094 control', c)} carries no cancel day yet`).toBe(false);
  }
});

test('ROW-094.REQ-019.the-persons-own-list-shows-the-cancelled-days', async () => {
  const sc = await scenario('cancelled');
  await backOn(sc);
  for (const c of sc.cases) {
    const own = requestViews(c.requestId, c.spec.firstDay, await observeOwnRequests(c.actor!));
    const w = `${where('ROW-094', c)} on the person's own list (${show(own)})`;
    expect.soft(own.length, `${w} is listed`).toBe(1);
    expect.soft(own.map((r) => normalState(stateOf(r))), `${w} reads approved`).toContain('approved');
    expect.soft(anyHolds(own, c.cancelDay), `${w} shows the day the cancel takes effect from, ${c.cancelDay}`).toBe(true);
    expect.soft(anyHolds(own, c.spec.lastDay), `${w} still shows its last day as sent, ${c.spec.lastDay}, so the cancelled days can be told`).toBe(true);
    expect.soft(actBy(own, CANCELLED, sc.adminWho), `${w} shows who cancelled`).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-096 promise: REQ-019 fail-if (6) "the request's original first and last day can no longer be told after the
// ROW-096   cancel"; REQ-019 the request "keeps its first and last day as sent" (A-030; F-13: the record keeps the days
// ROW-096   as sent). The row's cases: run under both the admin's cancel and a switch-off.
// ROW-096 wrong product: a cancel that shortens the request by overwriting its last day with the day before the cancel
// ROW-096   (A: 03-12 → 03-09; B: 03-17 → 03-12), so the original range is lost.
// ROW-096 given: the scenario. when: the cancels are made. then: every view of each request (the admin's, and the
// ROW-096   person's own list after switching back on) still holds its first and last day as sent (A 03-08/03-12, B
// ROW-096   03-11/03-17); neither last day as sent is any act's date or any other derived day of that request.
// ROW-096 controls: the control case stops after the approvals: the views hold the days as sent — the reading works.
// ROW-096 technique: before and after on the same records; both doors.
// ROW-096 cases: ROW-096 target=ROW-096.REQ-019.the-days-as-sent-can-still-be-told-after-the-cancel control=ROW-096.control.before-the-cancels-the-days-as-sent-are-held
test('ROW-096.control.before-the-cancels-the-days-as-sent-are-held', async () => {
  const sc = await scenario('approved');
  for (const c of sc.cases) {
    const views = await viewsOfCase(sc, c);
    expect.soft(anyHolds(views, c.spec.firstDay) && anyHolds(views, c.spec.lastDay), `${where('ROW-096 control', c)} holds its days as sent (${show(views)})`).toBe(true);
  }
});

test('ROW-096.REQ-019.the-days-as-sent-can-still-be-told-after-the-cancel', async () => {
  const sc = await scenario('cancelled');
  const check = async (phase: string) => {
    for (const c of sc.cases) {
      const views = await viewsOfCase(sc, c);
      expect.soft(views.length, `${where('ROW-096', c)} is listed ${phase}`).toBeGreaterThan(0);
      for (const r of views) {
        expect.soft(anyHolds(r, c.spec.firstDay), `${where('ROW-096', c)} still holds its first day as sent ${c.spec.firstDay} ${phase} (${show(r)})`).toBe(true);
        expect.soft(anyHolds(r, c.spec.lastDay), `${where('ROW-096', c)} still holds its last day as sent ${c.spec.lastDay} ${phase} (${show(r)})`).toBe(true);
      }
    }
  };
  await check('right after the cancel');
  await backOn(sc);
  await check('with the switched-off ones back on');
});

// ---------------------------------------------------------------------------------------------------
// ROW-094 — on the person's page itself (added, slice 1, test-author-8; lesson L-1)
// ---------------------------------------------------------------------------------------------------
// The ROW-094 cases above read GET /api/requests, the data of the person's page; a page that draws only the state and
// the days as sent (or the shortened range alone) keeps them green. These cases open / in each person's browser
// (engine door) and read the request's drawn row (page-figures.ts readOwnRows: the one list item carrying its first
// and last day, so a column header such as "Cancelled" is never read as the row's word); states and days are read
// with own-page.ts saysState and saysDay.
//
// ROW-094 promise: REQ-019 fail-if (4) "the person's page does not show the cancelled days as cancelled"; A-030 ("the
// ROW-094   cancelled days shown as cancelled on the person's page … the same when an account is switched off"); REQ-019
// ROW-094   (the request stays approved with its days in effect ending the day before the cancel); D-040 (the cancel
// ROW-094   takes effect from the first Monday to Friday day on or after the team's today). The row's cases: run under
// ROW-094   both the admin's cancel and a switch-off of the account.
// ROW-094 wrong product: the own list's data carries the cancel day, but the page draws the request as plain approved
// ROW-094   with its days as sent (the cancel invisible), draws it shortened to end 9 March (the cancelled days vanish),
// ROW-094   or draws the whole request cancelled; or draws the cancel for the admin's cancel and not for a switch-off.
// ROW-094 given: the file header's scenario — A1 and A2 (Mon 8..Fri 12 March 2027) cancelled on Wed 10 March by the
// ROW-094   admin's cancel and by a switch-off, so cancelled from 10 March; B1 and B2 (Thu 11..Wed 17 March) on Sat 13
// ROW-094   March, so cancelled from Mon 15 March; the neighbour N (8..12 March) never cancelled. when: the cancels are
// ROW-094   made, the switched-off persons are switched back on, and each person's browser opens /. then: each case's row
// ROW-094   — still drawn with its first and last day as sent — draws approved, draws cancelled, and draws the day the
// ROW-094   cancel takes effect from (10 March for A1 and A2, 15 March for B1 and B2); N's row draws approved and not
// ROW-094   cancelled.
// ROW-094 controls: ROW-094.control.page-draws-the-approved-request-before-the-cancels — after the approvals each
// ROW-094   person's / draws the request's row approved and not cancelled, and B1's and B2's rows draw no 15 March: the
// ROW-094   rows are reached and read, and what the target asks for is absent before the cancel.
// ROW-094 technique: before and after; both doors; the weekend cases give a cancel-from day (15 March) that is no
// ROW-094   act's date and none of the days as sent; the neighbour as the isolation decoy.
// ROW-094 cases: ROW-094 target=ROW-094.REQ-019.the-persons-page-draws-the-cancelled-days-as-cancelled control=ROW-094.control.page-draws-the-approved-request-before-the-cancels

function ownSpec(label: string, spec: RequestSpec): OwnSpec {
  return { label, firstDay: spec.firstDay, lastDay: spec.lastDay };
}

test('ROW-094.control.page-draws-the-approved-request-before-the-cancels', async ({ browser }) => {
  const sc = await scenario('approved');
  for (const c of sc.cases) {
    const read = await readOwnRows(browser, c.actor!, [ownSpec(c.label, c.spec)]);
    const row = read.rows[0];
    const w = `${where('ROW-094 control', c)} on /`;
    expect.soft(row.found, `${w} is drawn; page: "${read.body.slice(0, 500)}"`).toBe(true);
    expect.soft(saysState(row.text, 'approved'), `${w} draws approved: "${row.text}"`).toBe(true);
    expect.soft(saysState(row.text, 'cancelled'), `${w} draws nothing cancelled before the cancel: "${row.text}"`).toBe(false);
    if (c.label.startsWith('B')) expect.soft(saysDay(row.text, c.cancelDay), `${w} draws no ${c.cancelDay} before the cancel: "${row.text}"`).toBe(false);
  }
});

test('ROW-094.REQ-019.the-persons-page-draws-the-cancelled-days-as-cancelled', async ({ browser }) => {
  const sc = await scenario('cancelled');
  await backOn(sc);
  for (const c of sc.cases) {
    const read = await readOwnRows(browser, c.actor!, [ownSpec(c.label, c.spec)]);
    const row = read.rows[0];
    const w = `${where('ROW-094', c)} on the person's page /`;
    expect.soft(row.found, `${w} is still drawn with its first and last day as sent; page: "${read.body.slice(0, 500)}"`).toBe(true);
    expect.soft(saysState(row.text, 'approved'), `${w} draws its days in effect approved: "${row.text}"`).toBe(true);
    expect.soft(saysState(row.text, 'cancelled'), `${w} draws its cancelled days as cancelled: "${row.text}"`).toBe(true);
    expect.soft(saysDay(row.text, c.cancelDay), `${w} draws the day the cancel takes effect from, ${c.cancelDay}: "${row.text}"`).toBe(true);
  }
  const n = sc.neighbour;
  const read = await readOwnRows(browser, n.actor, [ownSpec('N', A_SPEC)]);
  const row = read.rows[0];
  expect.soft(row.found, `ROW-094: the neighbour's request is drawn on their /; page: "${read.body.slice(0, 500)}"`).toBe(true);
  expect.soft(saysState(row.text, 'approved'), `ROW-094: the neighbour's row draws approved: "${row.text}"`).toBe(true);
  expect.soft(saysState(row.text, 'cancelled'), `ROW-094: the neighbour's row, never cancelled, draws nothing cancelled: "${row.text}"`).toBe(false);
});
