// Purpose: ledger tests for ROW-032 to ROW-036 (REQ-007) — a person sees vacation days left for this year and next, each the allowance minus that year's approved vacation days, with that year's pending vacation days beside it, a negative figure as negative.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, allowances, requests, decisions, cancels), fresh names per run, the team clock set by the harness.
//
// Boundary (R6): behaviour rows, proved at the HTTP harness — GET /api/balance {years:[{year,daysLeft,pending}]}
// (D-029, harness readBalance). Every expected figure is computed here from the test's own data (allowance minus
// countWeekdays of the approved vacation ranges), never read from the product. Team zone Pacific/Auckland.
import { test, expect } from '@playwright/test';
import {
  approve,
  cancelOwnRequest,
  createMember,
  freshName,
  readBalance,
  reject,
  setAllowance,
  setClock,
  SetupError,
  signInMember,
  type Actor,
  type Balance,
  type RequestSpec,
} from './harness';
import { countCalendarDays, countWeekdays, freshInstall, minutesAfter, sendAt } from './lists';

/** Tuesday 2027-03-02 09:00 in the team zone (Monday 20:00 UTC). */
const T0 = '2027-03-01T20:00:00Z';
let minute = 0;

/** The one entry of `year`, or a description of why there is not exactly one. */
function entry(balance: Balance, year: number): { year: number; daysLeft: number; pending: number } | string {
  const found = (balance?.years ?? []).filter((y) => y.year === year);
  if (found.length !== 1) return `${found.length} entries for ${year} in ${JSON.stringify(balance)}`;
  return found[0];
}

function figure(balance: Balance, year: number, field: 'daysLeft' | 'pending'): number | string {
  const e = entry(balance, year);
  return typeof e === 'string' ? e : e[field];
}

async function memberWith(allowance: number, label: string) {
  minute = 0;
  const w = await freshInstall(T0, '2027-03-02');
  const member = await createMember(w.admin, { name: freshName(label), allowance });
  const me = await signInMember(member);
  return { ...w, member, me, close: async () => { await me.dispose(); await w.close(); } };
}

/** Sends at the next minute after T0 (reset per setup), so every send precedes the decisions at T0 + 30 minutes. */
async function send(me: Actor, spec: RequestSpec) {
  minute += 1;
  return sendAt(me, spec, minutesAfter(T0, minute));
}

// =====================================================================================================
// ROW-032 — both years' days left are there
// =====================================================================================================
// ROW-032 promise: REQ-007 "A person sees their vacation days left for the current year and for the next year";
// ROW-032   fail-if (1) "either year's days left is missing". Authority: REQ-007 arm 1, A-027 ("the person sees both
// ROW-032   years' balances, each with its pending days beside it"), D-007 (the current year is read in the team zone).
// ROW-032 wrong product: only the current year's figure; the years read from the server's UTC date, so on the team's
// ROW-032   1 January (still 31 December in UTC) it shows 2026 and 2027 and 2028 is missing.
// ROW-032 given: the clock at 2026-12-31T12:00Z, which is 2027-01-01 01:00 in the team zone; then at
// ROW-032   2027-07-14T14:00Z (15 July in the team zone). when: the member reads their balance at each instant. then: at
// ROW-032   each, exactly one entry for 2027 and one for 2028, each with a numeric days left and a numeric pending.
// ROW-032 controls: the balance route answers the member with at least one year carrying a numeric days left.
// ROW-032 technique: the clock's origin — an instant where the team year and the UTC year differ; plus a mid-year one.
// ROW-032 cases: ROW-032 target=ROW-032.REQ-007.current-and-next-year-days-left-both-shown control=ROW-032.control.balance-answers-a-year

async function setup032() {
  const w = await freshInstall('2026-12-31T12:00:00Z', '2027-01-01');
  const member = await createMember(w.admin, { name: freshName('Pia'), allowance: 25 });
  const me = await signInMember(member);
  return { ...w, me, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-032.control.balance-answers-a-year', async () => {
  const s = await setup032();
  try {
    const b = await readBalance(s.me);
    const numeric = (b?.years ?? []).filter((y) => typeof y.daysLeft === 'number');
    expect(numeric.length, `ROW-032 control: the balance carries a year with a numeric days left: ${JSON.stringify(b)}`).toBeGreaterThan(0);
  } finally {
    await s.close();
  }
});

test('ROW-032.REQ-007.current-and-next-year-days-left-both-shown', async () => {
  const s = await setup032();
  try {
    for (const [instant, label] of [
      ['2026-12-31T12:00:00Z', 'on the team\'s 1 January 2027 (UTC still 2026)'],
      ['2027-07-14T14:00:00Z', 'on 15 July 2027'],
    ] as const) {
      await setClock(instant);
      const b = await readBalance(s.me);
      for (const year of [2027, 2028]) {
        const e = entry(b, year);
        expect.soft(typeof e === 'string' ? e : 'one entry', `ROW-032: ${label}, ${year} is shown once`).toBe('one entry');
        if (typeof e === 'string') continue;
        expect.soft(Number.isFinite(e.daysLeft), `ROW-032: ${label}, ${year} days left is a number: ${JSON.stringify(e)}`).toBe(true);
        expect.soft(Number.isFinite(e.pending), `ROW-032: ${label}, ${year} pending is a number: ${JSON.stringify(e)}`).toBe(true);
      }
    }
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-033 — days left = allowance minus that year's approved vacation days
// =====================================================================================================
// ROW-033 promise: REQ-007 "each as the allowance minus the approved vacation days counted in that year"; fail-if (2).
// ROW-033   Authority: REQ-007 arm 2; A-002 (the shown balance counts approved days); A-020 ("each year's balance uses
// ROW-033   that year's allowance"); A-018 (a change may start next year, A-043).
// ROW-033 wrong product: counts calendar days (Thu–Tue = 6, not 4); subtracts approved sick days; subtracts rejected
// ROW-033   or pending vacation; charges a next-year vacation to this year; uses this year's allowance for next year.
// ROW-033 given: a member with allowance 22 this year and 30 from next year; before any request both figures equal
// ROW-033   the allowances; then an approved vacation Thu 2027-03-04..Tue 2027-03-09 (4 counted), an approved sick
// ROW-033   2027-03-01..02, a rejected vacation 2027-04-12..16, a pending vacation 2027-05-03..04 and an approved
// ROW-033   next-year vacation Mon 2028-02-07..Wed 2028-02-09 (3). when: the member reads their balance before and after.
// ROW-033   then: before 22 and 30; after 2027 is 22 − 4 = 18 and 2028 is 30 − 3 = 27.
// ROW-033 controls: the control case reads the balance before any request: 22 for 2027 and 30 for 2028 — the
// ROW-033   allowances are in place, so a wrong figure after is the counting, not the setup.
// ROW-033 technique: before and after; a decoy per wrong rule (sick, rejected, pending, calendar days, the other year),
// ROW-033   each moving the figure to a different number.
// ROW-033 cases: ROW-033 target=ROW-033.REQ-007.days-left-is-allowance-minus-that-years-approved-vacation control=ROW-033.control.days-left-before-any-request-is-the-allowance

async function setup033() {
  const s = await memberWith(22, 'Quinn');
  await setAllowance(s.admin, s.member.id, 30, { startsNextYear: true });
  return s;
}

test('ROW-033.control.days-left-before-any-request-is-the-allowance', async () => {
  const s = await setup033();
  try {
    const b = await readBalance(s.me);
    expect.soft(figure(b, 2027, 'daysLeft'), 'ROW-033 control: 2027 days left before any request is 22').toBe(22);
    expect.soft(figure(b, 2028, 'daysLeft'), 'ROW-033 control: 2028 days left before any request is 30').toBe(30);
  } finally {
    await s.close();
  }
});

test('ROW-033.REQ-007.days-left-is-allowance-minus-that-years-approved-vacation', async () => {
  const s = await setup033();
  try {
    const before = await readBalance(s.me);
    expect.soft(figure(before, 2027, 'daysLeft'), 'ROW-033: before, 2027 days left is 22').toBe(22);
    expect.soft(figure(before, 2028, 'daysLeft'), 'ROW-033: before, 2028 days left is 30').toBe(30);

    const va: RequestSpec = { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-09' };
    const vn: RequestSpec = { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-09' };
    expect(countWeekdays(va.firstDay, va.lastDay), 'ROW-033: the test data counts 4 days for Thu–Tue').toBe(4);
    expect(countCalendarDays(va.firstDay, va.lastDay), 'ROW-033: the test data spans 6 calendar days').toBe(6);
    const approvedVacation = await send(s.me, va);
    const approvedSick = await send(s.me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-02' });
    const rejected = await send(s.me, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-16' });
    await send(s.me, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
    const nextYear = await send(s.me, vn);
    await setClock(minutesAfter(T0, 30));
    await approve(s.admin, approvedVacation);
    await approve(s.admin, approvedSick);
    await reject(s.admin, rejected);
    await approve(s.admin, nextYear);

    const after = await readBalance(s.me);
    const want2027 = 22 - countWeekdays(va.firstDay, va.lastDay);
    const want2028 = 30 - countWeekdays(vn.firstDay, vn.lastDay);
    expect.soft(figure(after, 2027, 'daysLeft'), `ROW-033: 2027 days left is 22 − 4 = ${want2027}: ${JSON.stringify(after)}`).toBe(want2027);
    expect.soft(figure(after, 2028, 'daysLeft'), `ROW-033: 2028 days left is 30 − 3 = ${want2028}: ${JSON.stringify(after)}`).toBe(want2028);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-034 — pending days are shown beside days left, not subtracted from it
// =====================================================================================================
// ROW-034 promise: REQ-007 "with the pending vacation days of that year shown beside it"; fail-if (3) "pending days are
// ROW-034   subtracted from the days-left number instead of shown beside it". Authority: REQ-007 arm 3, A-002 ("the
// ROW-034   remaining balance shown counts approved days, with pending days shown beside it").
// ROW-034 wrong product: the send check's figure (allowance − approved − pending, A-002's refusal rule) shown as days
// ROW-034   left, so a pending week drops 2027 from 25 to 20.
// ROW-034 given: allowance 25; before any request 2027 shows 25; the member sends a pending vacation
// ROW-034   Mon 2027-03-22..Fri 2027-03-26 (5) and a pending next-year vacation 2028-03-06..07 (2); then a vacation
// ROW-034   2027-04-05..06 (2) is approved. when: the member reads their balance at each step. then: after the sends,
// ROW-034   2027 days left is still 25 and 2028 still 25; after the approval, 2027 is 23 (not 18).
// ROW-034 controls: after the sends, 2027 pending is 5 — the requests are pending, so an unchanged days left is not a
// ROW-034   send that never happened.
// ROW-034 technique: before and after the pending act, then an approval as the act that must move the figure.
// ROW-034 cases: ROW-034 target=ROW-034.REQ-007.pending-days-not-subtracted-from-days-left control=ROW-034.control.sent-request-counts-as-pending

const ROW034_PENDING: RequestSpec = { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-26' };
const ROW034_PENDING_NEXT: RequestSpec = { kind: 'vacation', firstDay: '2028-03-06', lastDay: '2028-03-07' };

test('ROW-034.control.sent-request-counts-as-pending', async () => {
  const s = await memberWith(25, 'Rosa');
  try {
    await send(s.me, ROW034_PENDING);
    const b = await readBalance(s.me);
    expect(figure(b, 2027, 'pending'), `ROW-034 control: 2027 pending is 5 after the send: ${JSON.stringify(b)}`).toBe(5);
  } finally {
    await s.close();
  }
});

test('ROW-034.REQ-007.pending-days-not-subtracted-from-days-left', async () => {
  const s = await memberWith(25, 'Rosa');
  try {
    const before = await readBalance(s.me);
    expect.soft(figure(before, 2027, 'daysLeft'), 'ROW-034: before, 2027 days left is 25').toBe(25);
    await send(s.me, ROW034_PENDING);
    await send(s.me, ROW034_PENDING_NEXT);
    const afterSend = await readBalance(s.me);
    expect.soft(figure(afterSend, 2027, 'daysLeft'), `ROW-034: with 5 days pending, 2027 days left stays 25: ${JSON.stringify(afterSend)}`).toBe(25);
    expect.soft(figure(afterSend, 2028, 'daysLeft'), `ROW-034: with 2 days pending, 2028 days left stays 25: ${JSON.stringify(afterSend)}`).toBe(25);
    const approved = await send(s.me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
    await setClock(minutesAfter(T0, 30));
    await approve(s.admin, approved);
    const afterApprove = await readBalance(s.me);
    expect.soft(figure(afterApprove, 2027, 'daysLeft'), `ROW-034: after approving 2 days, 2027 days left is 23 with 5 still pending: ${JSON.stringify(afterApprove)}`).toBe(23);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-035 — each year's pending vacation days are there and right
// =====================================================================================================
// ROW-035 promise: REQ-007 "with the pending vacation days of that year shown beside it"; fail-if (4) "a year's pending
// ROW-035   vacation days are missing or wrong". Authority: REQ-007 arm 4, A-027 (each year with its pending days).
// ROW-035 wrong product: pending counts calendar days (Thu–Tue = 6, not 4); counts pending sick days; counts approved,
// ROW-035   cancelled or rejected requests; charges next year's pending to this year; omits next year's pending.
// ROW-035 given: allowance 25; a pending vacation Thu 2027-03-11..Tue 2027-03-16 (4), a pending sick day 2027-03-01, a
// ROW-035   pending next-year vacation Thu 2028-01-13..Fri 2028-01-14 (2), an approved vacation 2027-04-05..07, a
// ROW-035   vacation the member cancelled 2027-05-10..12, a rejected vacation 2027-06-07..08. when: the member reads their
// ROW-035   balance. then: 2027 pending is exactly 4 and 2028 pending exactly 2.
// ROW-035 controls: before any request, 2027 pending is 0 — the field reads, and the target's figure is the requests'.
// ROW-035 technique: a decoy per wrong rule, each moving the figure to a different number; before and after.
// ROW-035 cases: ROW-035 target=ROW-035.REQ-007.each-years-pending-vacation-days-shown-and-right control=ROW-035.control.pending-before-any-request-is-zero

test('ROW-035.control.pending-before-any-request-is-zero', async () => {
  const s = await memberWith(25, 'Sami');
  try {
    const b = await readBalance(s.me);
    expect(figure(b, 2027, 'pending'), `ROW-035 control: 2027 pending before any request is 0: ${JSON.stringify(b)}`).toBe(0);
  } finally {
    await s.close();
  }
});

test('ROW-035.REQ-007.each-years-pending-vacation-days-shown-and-right', async () => {
  const s = await memberWith(25, 'Sami');
  try {
    const p1: RequestSpec = { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-16' };
    const pn: RequestSpec = { kind: 'vacation', firstDay: '2028-01-13', lastDay: '2028-01-14' };
    expect(countWeekdays(p1.firstDay, p1.lastDay), 'ROW-035: the test data counts 4 days for Thu–Tue').toBe(4);
    await send(s.me, p1);
    await send(s.me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' });
    await send(s.me, pn);
    const approved = await send(s.me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-07' });
    const cancelled = await send(s.me, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-12' });
    const rejected = await send(s.me, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' });
    await setClock(minutesAfter(T0, 30));
    await approve(s.admin, approved);
    await cancelOwnRequest(s.me, cancelled);
    await reject(s.admin, rejected);
    const b = await readBalance(s.me);
    expect.soft(figure(b, 2027, 'pending'), `ROW-035: 2027 pending vacation days is 4: ${JSON.stringify(b)}`).toBe(countWeekdays(p1.firstDay, p1.lastDay));
    expect.soft(figure(b, 2028, 'pending'), `ROW-035: 2028 pending vacation days is 2: ${JSON.stringify(b)}`).toBe(countWeekdays(pn.firstDay, pn.lastDay));
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-036 — a negative balance is shown as negative
// =====================================================================================================
// ROW-036 promise: REQ-007 "a negative number is shown as negative"; fail-if (5) "a negative balance is shown as zero
// ROW-036   or hidden". Authority: REQ-007 arm 5, A-018 ("lowering it below the days already approved is allowed and
// ROW-036   shows a negative balance").
// ROW-036 wrong product: days left clamped at 0; shown as its absolute value 3; the year dropped from the balance
// ROW-036   when its figure is below zero.
// ROW-036 given: allowance 10; an approved vacation Mon 2027-03-08..Wed 2027-03-17 (8), so 2027 shows 2; then the
// ROW-036   admin lowers this year's allowance to 5. when: the member reads their balance after. then: 2027 days left
// ROW-036   is exactly −3.
// ROW-036 controls: before the lowering, 2027 days left is 2 — the approval counted and the figure reads.
// ROW-036 technique: before and after; −3 differs from each wrong rendering (0, 3, missing).
// ROW-036 cases: ROW-036 target=ROW-036.REQ-007.negative-days-left-shown-negative control=ROW-036.control.days-left-before-lowering-is-two

async function setup036() {
  const s = await memberWith(10, 'Tove');
  const spec: RequestSpec = { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-17' };
  if (countWeekdays(spec.firstDay, spec.lastDay) !== 8) throw new SetupError('ROW-036: the test data must count 8 days');
  const id = await send(s.me, spec);
  await setClock(minutesAfter(T0, 30));
  await approve(s.admin, id);
  return s;
}

test('ROW-036.control.days-left-before-lowering-is-two', async () => {
  const s = await setup036();
  try {
    const b = await readBalance(s.me);
    expect(figure(b, 2027, 'daysLeft'), `ROW-036 control: 2027 days left is 10 − 8 = 2: ${JSON.stringify(b)}`).toBe(2);
  } finally {
    await s.close();
  }
});

test('ROW-036.REQ-007.negative-days-left-shown-negative', async () => {
  const s = await setup036();
  try {
    const before = await readBalance(s.me);
    expect.soft(figure(before, 2027, 'daysLeft'), 'ROW-036: before the lowering, 2027 days left is 2').toBe(2);
    await setAllowance(s.admin, s.member.id, 5);
    const after = await readBalance(s.me);
    expect(figure(after, 2027, 'daysLeft'), `ROW-036: after lowering the allowance to 5, 2027 days left is 5 − 8 = −3: ${JSON.stringify(after)}`).toBe(-3);
  } finally {
    await s.close();
  }
});
