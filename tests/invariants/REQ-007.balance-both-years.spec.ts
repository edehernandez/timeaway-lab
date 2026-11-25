// Purpose: ledger tests for ROW-032 to ROW-036 (REQ-007) — a person sees vacation days left for this year and next, each the allowance minus that year's approved vacation days, with that year's pending vacation days beside it, a negative figure as negative.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, allowances, requests, decisions, cancels), fresh names per run, the team clock set by the harness; the page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn figures read on / beside the API), through page-figures.ts and own-page.ts.
//
// Boundary (R6): behaviour rows, proved at the HTTP harness — GET /api/balance {years:[{year,daysLeft,pending}]}
// (D-029, harness readBalance). Every expected figure is computed here from the test's own data (allowance minus
// countWeekdays of the approved vacation ranges), never read from the product. Team zone Pacific/Auckland.
// The page cases (at the end) open / in the member's browser (engine door) and read each year's drawn figures.
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
import { saysNumber } from './own-page';
import { readOwnFigures, type OwnFigures } from './page-figures';

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
// ROW-032 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-033 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-034 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-035 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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
// ROW-036 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

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

// =====================================================================================================
// ROW-032 to ROW-036 — on the own page itself (added, slice 1, test-author-8; lesson L-1)
// =====================================================================================================
// The API cases above read GET /api/balance; a page that works its figures out on the client, drops a year or
// relabels keeps them green. These cases open / in the member's browser (engine door) and read each year's drawn
// figures (page-figures.ts readOwnFigures: the smallest visible element saying "days left" and that year and not
// the other one). A figure is a number of its own in that text once the years themselves are taken out
// (own-page.ts saysNumber). Every expected figure is worked out here from the test's own data.

const PAGE_YEARS: [number, number] = [2027, 2028];

/** True when the page's figures for `year` draw `n` as a number of its own (the years themselves left out). */
function drawn(f: OwnFigures, year: number, n: number): boolean {
  return saysNumber(f.years[year] ?? '', n, [], ['2027', '2028']);
}

/** The page's figures for `year`, quoted for a message. */
function shown(f: OwnFigures, year: number): string {
  return f.years[year] === null ? `(no figures for ${year}; page: "${f.body.slice(0, 400)}")` : `"${f.years[year]}"`;
}

// ROW-032 promise: as above — REQ-007 "A person sees their vacation days left for the current year and for the next
// ROW-032   year"; fail-if (1) "either year's days left is missing" — on the page the person sees. Authority: REQ-007
// ROW-032   arm 1, A-027 (the person sees both years' balances), D-007 (the current year is read in the team zone).
// ROW-032 wrong product: GET /api/balance carries both years, but / draws only this year's figure; or / works the
// ROW-032   years out from the browser's or the UTC date, so on the team's 1 January 2027 (UTC still 31 December 2026)
// ROW-032   it draws 2026 and 2027 and no 2028.
// ROW-032 given: setup032 — allowance 25, no request; the clock at 2026-12-31T12:00Z (team 1 January 2027, 01:00),
// ROW-032   then at 2027-07-14T14:00Z (team 15 July 2027). when: the member's browser opens / at each instant. then: at
// ROW-032   each, / draws figures for 2027 and for 2028, each with 25 days left.
// ROW-032 controls: ROW-032.control.page-draws-a-years-days-left — at 15 July / answers 200 and draws 2027's
// ROW-032   figures with 25: the page and the reading work where the team year and the UTC year agree.
// ROW-032 technique: the clock's origin — an instant where the team year and the UTC year differ — plus a mid-year one.
// ROW-032 cases: ROW-032 target=ROW-032.REQ-007.page-draws-both-years-days-left control=ROW-032.control.page-draws-a-years-days-left

test('ROW-032.control.page-draws-a-years-days-left', async ({ browser }) => {
  const s = await setup032();
  try {
    await setClock('2027-07-14T14:00:00Z');
    const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(f.status, 'ROW-032 control: / answers the member').toBe(200);
    expect(drawn(f, 2027, 25), `ROW-032 control: on 15 July / draws 2027's figures with 25 days left: ${shown(f, 2027)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-032.REQ-007.page-draws-both-years-days-left', async ({ browser }) => {
  const s = await setup032();
  try {
    for (const [instant, label] of [
      ['2026-12-31T12:00:00Z', "on the team's 1 January 2027 (UTC still 2026)"],
      ['2027-07-14T14:00:00Z', 'on 15 July 2027'],
    ] as const) {
      await setClock(instant);
      const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
      for (const year of PAGE_YEARS) {
        expect.soft(f.years[year] !== null, `ROW-032: ${label}, / draws ${year}'s days left: ${shown(f, year)}`).toBe(true);
        expect.soft(drawn(f, year, 25), `ROW-032: ${label}, / draws ${year}'s days left as 25: ${shown(f, year)}`).toBe(true);
      }
    }
  } finally {
    await s.close();
  }
});

// ROW-033 promise: as above — REQ-007 "each as the allowance minus the approved vacation days counted in that year";
// ROW-033   fail-if (2) — on the page. Authority: REQ-007 arm 2; A-002 (the shown balance counts approved days); A-020
// ROW-033   (each year's balance uses that year's allowance); A-018 (a change may start next year, A-043).
// ROW-033 wrong product: GET /api/balance right, but / works its figures out on the client from the listed requests —
// ROW-033   counting calendar days (2027: 16), the approved sick days (16), the rejected vacation (13) or the pending one
// ROW-033   (16), charging the next-year vacation to this year (15); for 2028 using this year's allowance (19) or charging
// ROW-033   2027's vacation to it (26) — every API case stays green.
// ROW-033 given: setup033 — allowance 22 this year and 30 from next year; then (act033) an approved vacation Thu 4..Tue
// ROW-033   9 March 2027 (4 counted, 6 calendar days), an approved sick 1..2 March, a rejected vacation 12..16 April, a
// ROW-033   pending vacation 3..4 May and an approved vacation Mon 7..Wed 9 February 2028 (3). when: the member's browser
// ROW-033   opens / before the requests and after the decisions. then: before, 2027's figures draw 22 and 2028's 30;
// ROW-033   after, 2027's draw 18 = 22 − 4 and none of 16, 13, 15; 2028's draw 27 = 30 − 3 and neither 19 nor 26.
// ROW-033 controls: ROW-033.control.page-draws-the-allowances-before-any-request — before any request / draws 22 for
// ROW-033   2027 and 30 for 2028: the allowances are on the page, so a wrong figure after is the counting, not the setup.
// ROW-033 technique: before and after; a decoy per wrong rule, each moving the drawn figure to a number of its own,
// ROW-033   the expectations worked out here (countWeekdays), never read from the product.
// ROW-033 cases: ROW-033 target=ROW-033.REQ-007.page-draws-allowance-minus-that-years-approved-vacation control=ROW-033.control.page-draws-the-allowances-before-any-request

const ROW033_VACATION: RequestSpec = { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-09' };
const ROW033_NEXT_YEAR: RequestSpec = { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-09' };

/** The API case's requests and decisions, for the page case. */
async function act033(s: Awaited<ReturnType<typeof setup033>>) {
  if (countWeekdays(ROW033_VACATION.firstDay, ROW033_VACATION.lastDay) !== 4) throw new SetupError('ROW-033: the test data must count 4 days');
  if (countWeekdays(ROW033_NEXT_YEAR.firstDay, ROW033_NEXT_YEAR.lastDay) !== 3) throw new SetupError('ROW-033: the test data must count 3 days');
  const approvedVacation = await send(s.me, ROW033_VACATION);
  const approvedSick = await send(s.me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-02' });
  const rejected = await send(s.me, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-16' });
  await send(s.me, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
  const nextYear = await send(s.me, ROW033_NEXT_YEAR);
  await setClock(minutesAfter(T0, 30));
  await approve(s.admin, approvedVacation);
  await approve(s.admin, approvedSick);
  await reject(s.admin, rejected);
  await approve(s.admin, nextYear);
}

test('ROW-033.control.page-draws-the-allowances-before-any-request', async ({ browser }) => {
  const s = await setup033();
  try {
    const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(f, 2027, 22), `ROW-033 control: before any request / draws 22 for 2027: ${shown(f, 2027)}`).toBe(true);
    expect.soft(drawn(f, 2028, 30), `ROW-033 control: before any request / draws 30 for 2028: ${shown(f, 2028)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-033.REQ-007.page-draws-allowance-minus-that-years-approved-vacation', async ({ browser }) => {
  const s = await setup033();
  try {
    const before = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(before, 2027, 22), `ROW-033: before, / draws 22 for 2027: ${shown(before, 2027)}`).toBe(true);
    expect.soft(drawn(before, 2028, 30), `ROW-033: before, / draws 30 for 2028: ${shown(before, 2028)}`).toBe(true);
    await act033(s);
    const after = await readOwnFigures(browser, s.me, PAGE_YEARS);
    const want2027 = 22 - countWeekdays(ROW033_VACATION.firstDay, ROW033_VACATION.lastDay);
    const want2028 = 30 - countWeekdays(ROW033_NEXT_YEAR.firstDay, ROW033_NEXT_YEAR.lastDay);
    expect.soft(drawn(after, 2027, want2027), `ROW-033: after, / draws 2027's days left 22 − 4 = ${want2027}: ${shown(after, 2027)}`).toBe(true);
    for (const [wrong, why] of [
      [16, 'calendar days, or the sick or pending days counted'],
      [13, 'the rejected vacation counted'],
      [15, 'the next-year vacation charged to 2027'],
    ] as const) {
      expect.soft(drawn(after, 2027, wrong), `ROW-033: / does not draw ${wrong} for 2027 (${why}): ${shown(after, 2027)}`).toBe(false);
    }
    expect.soft(drawn(after, 2028, want2028), `ROW-033: after, / draws 2028's days left 30 − 3 = ${want2028}: ${shown(after, 2028)}`).toBe(true);
    for (const [wrong, why] of [
      [19, "this year's allowance used for 2028"],
      [26, "2027's vacation charged to 2028"],
    ] as const) {
      expect.soft(drawn(after, 2028, wrong), `ROW-033: / does not draw ${wrong} for 2028 (${why}): ${shown(after, 2028)}`).toBe(false);
    }
  } finally {
    await s.close();
  }
});

// ROW-034 promise: as above — REQ-007 "with the pending vacation days of that year shown beside it"; fail-if (3)
// ROW-034   "pending days are subtracted from the days-left number instead of shown beside it" — on the page.
// ROW-034   Authority: REQ-007 arm 3, A-002 ("the remaining balance shown counts approved days, with pending days shown
// ROW-034   beside it").
// ROW-034 wrong product: GET /api/balance right, but / draws the send check's figure (allowance − approved − pending)
// ROW-034   as the days left: 20 for 2027 with a pending week, 23 for 2028 with 2 days pending, 18 after an approval —
// ROW-034   or draws the allowance 25 with the subtracted figure as what is left.
// ROW-034 given: allowance 25; pending vacation Mon 22..Fri 26 March 2027 (5) and pending next-year vacation 6..7
// ROW-034   March 2028 (2); then a vacation 5..6 April 2027 (2) approved. when: the member's browser opens / before,
// ROW-034   after the sends and after the approval. then: before, 2027's figures draw 25; after the sends, 2027's draw 25
// ROW-034   and 5 and not 20, 2028's draw 25 and 2 and not 23; after the approval, 2027's draw 23 and 5 and not 18.
// ROW-034 controls: ROW-034.control.page-draws-the-sent-days-as-pending — after the send / draws 5 in 2027's
// ROW-034   figures: the request is pending on the page, so an unchanged 25 is not a send that never happened.
// ROW-034 technique: before and after the pending act, then an approval as the act that must move the figure; the
// ROW-034   subtracted figure as the near miss that must not be drawn in that year's figures.
// ROW-034 cases: ROW-034 target=ROW-034.REQ-007.page-draws-pending-beside-days-left-not-subtracted control=ROW-034.control.page-draws-the-sent-days-as-pending

test('ROW-034.control.page-draws-the-sent-days-as-pending', async ({ browser }) => {
  const s = await memberWith(25, 'Rosa');
  try {
    await send(s.me, ROW034_PENDING);
    const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect(drawn(f, 2027, 5), `ROW-034 control: after the send / draws 5 pending in 2027's figures: ${shown(f, 2027)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-034.REQ-007.page-draws-pending-beside-days-left-not-subtracted', async ({ browser }) => {
  const s = await memberWith(25, 'Rosa');
  try {
    const before = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(before, 2027, 25), `ROW-034: before, / draws 25 for 2027: ${shown(before, 2027)}`).toBe(true);
    await send(s.me, ROW034_PENDING);
    await send(s.me, ROW034_PENDING_NEXT);
    const sent = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(sent, 2027, 25), `ROW-034: with 5 days pending, / still draws 2027's days left 25: ${shown(sent, 2027)}`).toBe(true);
    expect.soft(drawn(sent, 2027, 5), `ROW-034: / draws 2027's 5 pending days beside it: ${shown(sent, 2027)}`).toBe(true);
    expect.soft(drawn(sent, 2027, 20), `ROW-034: / does not draw 25 − 5 = 20 for 2027: ${shown(sent, 2027)}`).toBe(false);
    expect.soft(drawn(sent, 2028, 25), `ROW-034: with 2 days pending, / still draws 2028's days left 25: ${shown(sent, 2028)}`).toBe(true);
    expect.soft(drawn(sent, 2028, 2), `ROW-034: / draws 2028's 2 pending days beside it: ${shown(sent, 2028)}`).toBe(true);
    expect.soft(drawn(sent, 2028, 23), `ROW-034: / does not draw 25 − 2 = 23 for 2028: ${shown(sent, 2028)}`).toBe(false);
    const approved = await send(s.me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
    await setClock(minutesAfter(T0, 30));
    await approve(s.admin, approved);
    const after = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(after, 2027, 23), `ROW-034: after approving 2 days, / draws 2027's days left 23: ${shown(after, 2027)}`).toBe(true);
    expect.soft(drawn(after, 2027, 5), `ROW-034: / still draws 2027's 5 pending days beside it: ${shown(after, 2027)}`).toBe(true);
    expect.soft(drawn(after, 2027, 18), `ROW-034: / does not draw 23 − 5 = 18 for 2027: ${shown(after, 2027)}`).toBe(false);
  } finally {
    await s.close();
  }
});

// ROW-035 promise: as above — REQ-007 "with the pending vacation days of that year shown beside it"; fail-if (4) "a
// ROW-035   year's pending vacation days are missing or wrong" — on the page. Authority: REQ-007 arm 4, A-027 (each year
// ROW-035   with its pending days).
// ROW-035 wrong product: GET /api/balance right, but / sums its pending figure on the client from the listed requests
// ROW-035   — calendar days (6), the pending sick day too (5), the approved (7), cancelled (7) or rejected (6) vacation
// ROW-035   too, next year's pending charged to this year (6) — or draws no pending figure for next year.
// ROW-035 given: allowance 25 and the API case's requests (act035): pending vacation Thu 11..Tue 16 March 2027 (4),
// ROW-035   pending sick 1 March, pending next-year vacation Thu 13..Fri 14 January 2028 (2), approved vacation 5..7
// ROW-035   April, a vacation 10..12 May the member cancelled, a rejected vacation 7..8 June. when: the member's browser
// ROW-035   opens / before the requests and after. then: before, 2027's figures do not draw 4; after, 2027's draw 4 and
// ROW-035   none of 5, 6, 7, and 2028's draw 2.
// ROW-035 controls: ROW-035.control.page-draws-the-figures-before-any-request — before any request / draws 25 days
// ROW-035   left in 2027's and in 2028's figures: the figures are on the page and read.
// ROW-035 technique: a decoy per wrong rule, each moving the drawn figure to a number of its own; before and after.
// ROW-035 cases: ROW-035 target=ROW-035.REQ-007.page-draws-each-years-pending-vacation-days control=ROW-035.control.page-draws-the-figures-before-any-request

const ROW035_PENDING: RequestSpec = { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-16' };
const ROW035_PENDING_NEXT: RequestSpec = { kind: 'vacation', firstDay: '2028-01-13', lastDay: '2028-01-14' };

/** The API case's requests and decisions, for the page case. */
async function act035(s: Awaited<ReturnType<typeof memberWith>>) {
  if (countWeekdays(ROW035_PENDING.firstDay, ROW035_PENDING.lastDay) !== 4) throw new SetupError('ROW-035: the test data must count 4 days');
  await send(s.me, ROW035_PENDING);
  await send(s.me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' });
  await send(s.me, ROW035_PENDING_NEXT);
  const approved = await send(s.me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-07' });
  const cancelled = await send(s.me, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-12' });
  const rejected = await send(s.me, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' });
  await setClock(minutesAfter(T0, 30));
  await approve(s.admin, approved);
  await cancelOwnRequest(s.me, cancelled);
  await reject(s.admin, rejected);
}

test('ROW-035.control.page-draws-the-figures-before-any-request', async ({ browser }) => {
  const s = await memberWith(25, 'Sami');
  try {
    const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(f, 2027, 25), `ROW-035 control: before any request / draws 25 days left for 2027: ${shown(f, 2027)}`).toBe(true);
    expect.soft(drawn(f, 2028, 25), `ROW-035 control: before any request / draws 25 days left for 2028: ${shown(f, 2028)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-035.REQ-007.page-draws-each-years-pending-vacation-days', async ({ browser }) => {
  const s = await memberWith(25, 'Sami');
  try {
    const before = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(before, 2027, 4), `ROW-035: before any request, / draws no 4 in 2027's figures: ${shown(before, 2027)}`).toBe(false);
    await act035(s);
    const after = await readOwnFigures(browser, s.me, PAGE_YEARS);
    const want2027 = countWeekdays(ROW035_PENDING.firstDay, ROW035_PENDING.lastDay);
    const want2028 = countWeekdays(ROW035_PENDING_NEXT.firstDay, ROW035_PENDING_NEXT.lastDay);
    expect.soft(drawn(after, 2027, want2027), `ROW-035: / draws 2027's pending vacation days ${want2027}: ${shown(after, 2027)}`).toBe(true);
    for (const [wrong, why] of [
      [5, 'the pending sick day counted'],
      [6, 'calendar days, the rejected vacation or next year counted'],
      [7, 'the approved or the cancelled vacation counted'],
    ] as const) {
      expect.soft(drawn(after, 2027, wrong), `ROW-035: / does not draw ${wrong} in 2027's figures (${why}): ${shown(after, 2027)}`).toBe(false);
    }
    expect.soft(drawn(after, 2028, want2028), `ROW-035: / draws 2028's pending vacation days ${want2028}: ${shown(after, 2028)}`).toBe(true);
  } finally {
    await s.close();
  }
});

// ROW-036 promise: as above — REQ-007 "a negative number is shown as negative"; fail-if (5) "a negative balance is
// ROW-036   shown as zero or hidden" — on the page. Authority: REQ-007 arm 5, A-018 ("lowering it below the days
// ROW-036   already approved is allowed and shows a negative balance").
// ROW-036 wrong product: GET /api/balance answers −3, but / clamps the drawn figure at 0, draws its absolute value 3,
// ROW-036   or leaves the year out when its figure is below zero.
// ROW-036 given: setup036 — allowance 10 and an approved vacation Mon 8..Wed 17 March 2027 (8), so 2027 shows 2; then
// ROW-036   the admin lowers this year's allowance to 5. when: the member's browser opens / before and after the
// ROW-036   lowering. then: before, 2027's figures draw 2; after, they are drawn and draw −3 (a minus sign or "−"), and
// ROW-036   not a plain 3.
// ROW-036 controls: ROW-036.control.page-draws-two-days-left-before-the-lowering — before the lowering / draws 2 in
// ROW-036   2027's figures: the approval counted and the figure reads.
// ROW-036 technique: before and after; −3 differs from each wrong rendering (0, 3, missing).
// ROW-036 cases: ROW-036 target=ROW-036.REQ-007.page-draws-a-negative-days-left-as-negative control=ROW-036.control.page-draws-two-days-left-before-the-lowering

test('ROW-036.control.page-draws-two-days-left-before-the-lowering', async ({ browser }) => {
  const s = await setup036();
  try {
    const f = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect(drawn(f, 2027, 2), `ROW-036 control: / draws 2027's days left 10 − 8 = 2: ${shown(f, 2027)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-036.REQ-007.page-draws-a-negative-days-left-as-negative', async ({ browser }) => {
  const s = await setup036();
  try {
    const before = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(drawn(before, 2027, 2), `ROW-036: before the lowering, / draws 2 for 2027: ${shown(before, 2027)}`).toBe(true);
    await setAllowance(s.admin, s.member.id, 5);
    const after = await readOwnFigures(browser, s.me, PAGE_YEARS);
    expect.soft(after.years[2027] !== null, `ROW-036: after the lowering, / still draws 2027's figures: ${shown(after, 2027)}`).toBe(true);
    expect.soft(drawn(after, 2027, -3), `ROW-036: after lowering the allowance to 5, / draws 2027's days left 5 − 8 = −3: ${shown(after, 2027)}`).toBe(true);
    expect.soft(drawn(after, 2027, 3), `ROW-036: / does not draw the figure as a plain 3: ${shown(after, 2027)}`).toBe(false);
  } finally {
    await s.close();
  }
});
