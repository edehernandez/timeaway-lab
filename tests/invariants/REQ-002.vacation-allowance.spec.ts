// Purpose: ledger tests for ROW-007, ROW-008 and ROW-009 (REQ-002) — a vacation request is refused exactly when its counted days exceed the year's allowance minus that year's approved and pending vacation days, each year on its own, and the refusal shows that year's days left with its pending days beside it.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, approval), fresh per run.
import { test, expect } from '@playwright/test';
import { type Actor } from './harness';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  numbersShown,
  onOrAfter,
  ownRequests,
  pickYear,
  randomInt,
  setupTeam,
  spendVacation,
  teamAt,
  trySend,
  weekdaySpan,
  yearBalance,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);
// Where each year's spending starts: this year after today, next year from early February.
const THIS_YEAR_START = onOrAfter(addDays(TODAY, 7), 1);
const NEXT_YEAR_START = onOrAfter(day(Y + 1, 2, 1), 1);
// Free single days far from any spending, to ask for one more day in each year.
const THIS_YEAR_FREE = onOrAfter(day(Y, 10, 1), 2);
const NEXT_YEAR_FREE = onOrAfter(day(Y + 1, 10, 1), 2);

async function sendCount(p: Actor) {
  return (await ownRequests(p)).length;
}

// ROW-007 promise: REQ-002 fail-if (1) "a vacation request whose counted days exceed the allowance minus the approved
// ROW-007   and pending vacation days of its year is accepted" (A-001, A-002); the row's cases: this year used up by
// ROW-007   approved and pending vacation while next year is free — a next-year request within the allowance is accepted
// ROW-007   and each year's figures move independently — and the reverse.
// ROW-007 wrong product: one that checks against approved days only (pending ignored), or against one pooled figure
// ROW-007   or this year's figure whatever the request's year, or that lets the request through when it is just one day over.
// ROW-007 given: member X: allowance A (fresh), this year spent by an approved and a pending vacation that together
// ROW-007   make A; member Z: the reverse, next year spent the same way; member W: this year with k ≥ 2 days left after
// ROW-007   approved and pending. when: X asks one more day this year, then the whole allowance next year, then one more
// ROW-007   next year; Z asks the whole allowance this year, then one more in each year; W asks k + 1 days. then: every
// ROW-007   over-the-limit request is refused with a rule's refusal and stores nothing; the within-allowance ones are
// ROW-007   accepted; after each step each year's {daysLeft, pending} equals the figures the steps imply, the other
// ROW-007   year's untouched.
// ROW-007 controls: the control case shows the spending fixture lands: after it, the spent year reads
// ROW-007   {allowance − approved, pending} and the other year {allowance, 0}.
// ROW-007 technique: the threshold from both sides (k + 1 refused here, k accepted in ROW-008); two years moving
// ROW-007   independently, both directions; fresh allowances so no product can hard-code a figure.
// ROW-007 cases: ROW-007 target=ROW-007.REQ-002.a-vacation-over-the-years-remaining-days-is-refused-each-year-on-its-own control=ROW-007.control.the-spending-fixture-shows-in-the-balance
test('ROW-007.control.the-spending-fixture-shows-in-the-balance', async () => {
  const A = randomInt(10, 16);
  const a1 = randomInt(2, A - 3);
  const team = await setupTeam({ now: NOW, allowances: [A, A] });
  const [x, z] = team.people;
  try {
    await spendVacation(team.admin, x, THIS_YEAR_START, a1, A - a1);
    await spendVacation(team.admin, z, NEXT_YEAR_START, a1, A - a1);
    expect.soft(await yearBalance(x, Y), 'ROW-007 control: X this year').toEqual({ daysLeft: A - a1, pending: A - a1 });
    expect.soft(await yearBalance(x, Y + 1), 'ROW-007 control: X next year').toEqual({ daysLeft: A, pending: 0 });
    expect.soft(await yearBalance(z, Y + 1), 'ROW-007 control: Z next year').toEqual({ daysLeft: A - a1, pending: A - a1 });
    expect.soft(await yearBalance(z, Y), 'ROW-007 control: Z this year').toEqual({ daysLeft: A, pending: 0 });
  } finally {
    await team.dispose();
  }
});

test('ROW-007.REQ-002.a-vacation-over-the-years-remaining-days-is-refused-each-year-on-its-own', async () => {
  const A = randomInt(10, 16);
  const a1 = randomInt(2, A - 3);
  const w1 = randomInt(2, 4);
  const w2 = randomInt(2, 4);
  const k = A - w1 - w2;
  const team = await setupTeam({ now: NOW, allowances: [A, A, A] });
  const [x, z, w] = team.people;
  try {
    // X: this year spent, next year free.
    await spendVacation(team.admin, x, THIS_YEAR_START, a1, A - a1);
    const xThis = { daysLeft: A - a1, pending: A - a1 };
    let n = await sendCount(x);
    const x1 = await trySend(x, { kind: 'vacation', firstDay: THIS_YEAR_FREE, lastDay: THIS_YEAR_FREE });
    expect.soft(isRuleRefusal(x1), `ROW-007: X's one more day this year is refused (got ${describe(x1)})`).toBe(true);
    expect.soft(await sendCount(x), 'ROW-007: the refused request is not stored').toBe(n);
    const x2 = await trySend(x, { kind: 'vacation', ...weekdaySpan(NEXT_YEAR_START, A) });
    expect.soft(isAcceptance(x2), `ROW-007: X's whole allowance next year is accepted (got ${describe(x2)})`).toBe(true);
    expect.soft(await yearBalance(x, Y), 'ROW-007: X this year is untouched by the next-year request').toEqual(xThis);
    expect.soft(await yearBalance(x, Y + 1), 'ROW-007: X next year now has the allowance pending').toEqual({ daysLeft: A, pending: A });
    n = await sendCount(x);
    const x3 = await trySend(x, { kind: 'vacation', firstDay: NEXT_YEAR_FREE, lastDay: NEXT_YEAR_FREE });
    expect.soft(isRuleRefusal(x3), `ROW-007: X's one more day next year is refused (got ${describe(x3)})`).toBe(true);
    expect.soft(await sendCount(x), 'ROW-007: the refused request is not stored').toBe(n);

    // Z: the reverse — next year spent, this year free.
    await spendVacation(team.admin, z, NEXT_YEAR_START, a1, A - a1);
    const zNext = { daysLeft: A - a1, pending: A - a1 };
    const z1 = await trySend(z, { kind: 'vacation', ...weekdaySpan(THIS_YEAR_START, A) });
    expect.soft(isAcceptance(z1), `ROW-007: Z's whole allowance this year is accepted (got ${describe(z1)})`).toBe(true);
    expect.soft(await yearBalance(z, Y + 1), 'ROW-007: Z next year is untouched by the this-year request').toEqual(zNext);
    expect.soft(await yearBalance(z, Y), 'ROW-007: Z this year now has the allowance pending').toEqual({ daysLeft: A, pending: A });
    n = await sendCount(z);
    const z2 = await trySend(z, { kind: 'vacation', firstDay: THIS_YEAR_FREE, lastDay: THIS_YEAR_FREE });
    const z3 = await trySend(z, { kind: 'vacation', firstDay: NEXT_YEAR_FREE, lastDay: NEXT_YEAR_FREE });
    expect.soft(isRuleRefusal(z2), `ROW-007: Z's one more day this year is refused (got ${describe(z2)})`).toBe(true);
    expect.soft(isRuleRefusal(z3), `ROW-007: Z's one more day next year is refused (got ${describe(z3)})`).toBe(true);
    expect.soft(await sendCount(z), 'ROW-007: the refused requests are not stored').toBe(n);

    // W: k ≥ 2 days left after approved and pending; k + 1 is one over.
    await spendVacation(team.admin, w, THIS_YEAR_START, w1, w2);
    n = await sendCount(w);
    const w3 = await trySend(w, { kind: 'vacation', ...weekdaySpan(onOrAfter(day(Y, 6, 1), 1), k + 1) });
    expect.soft(isRuleRefusal(w3), `ROW-007: W's k + 1 = ${k + 1} days are refused (got ${describe(w3)})`).toBe(true);
    expect.soft(await sendCount(w), 'ROW-007: the refused request is not stored').toBe(n);
    expect.soft(await yearBalance(w, Y), "ROW-007: W's figures are unchanged by the refusal").toEqual({ daysLeft: A - w1, pending: w2 });
  } finally {
    await team.dispose();
  }
});

// ROW-008 promise: REQ-002 fail-if (2) "a vacation request within that number is refused" (A-002: a person cannot
// ROW-008   request beyond allowance minus approved minus pending — so up to it, they can).
// ROW-008 wrong product: one that refuses at equality (">=" for ">"), or subtracts pending twice, or counts the
// ROW-008   other year's spending against this year.
// ROW-008 given: member W with allowance A (fresh), this year an approved vacation of w1 and a pending one of w2
// ROW-008   days, so k = A − w1 − w2 ≥ 2 are left; member X with this year spent entirely (approved + pending = A).
// ROW-008 when: W asks exactly k days this year; X asks exactly A days next year. then: both are accepted, and the
// ROW-008   pending figures move by exactly k and A in their own years while days left stay A − w1 and A.
// ROW-008 controls: the control case shows the fixture lands: W reads {A − w1, w2} this year before asking.
// ROW-008 technique: the threshold's other side (k + 1 is refused in ROW-007); equality exactly; next year at the
// ROW-008   whole allowance while this year is spent.
// ROW-008 cases: ROW-008 target=ROW-008.REQ-002.a-vacation-of-exactly-the-years-remaining-days-is-accepted control=ROW-008.control.the-remaining-days-before-asking
test('ROW-008.control.the-remaining-days-before-asking', async () => {
  const A = randomInt(10, 16);
  const w1 = randomInt(2, 4);
  const w2 = randomInt(2, 4);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [w] = team.people;
  try {
    await spendVacation(team.admin, w, THIS_YEAR_START, w1, w2);
    expect(await yearBalance(w, Y), 'ROW-008 control: W this year before asking').toEqual({ daysLeft: A - w1, pending: w2 });
  } finally {
    await team.dispose();
  }
});

test('ROW-008.REQ-002.a-vacation-of-exactly-the-years-remaining-days-is-accepted', async () => {
  const A = randomInt(10, 16);
  const w1 = randomInt(2, 4);
  const w2 = randomInt(2, 4);
  const k = A - w1 - w2;
  const a1 = randomInt(2, A - 3);
  const team = await setupTeam({ now: NOW, allowances: [A, A] });
  const [w, x] = team.people;
  try {
    await spendVacation(team.admin, w, THIS_YEAR_START, w1, w2);
    const wk = await trySend(w, { kind: 'vacation', ...weekdaySpan(onOrAfter(day(Y, 6, 1), 1), k) });
    expect.soft(isAcceptance(wk), `ROW-008: W's exactly k = ${k} days are accepted (got ${describe(wk)})`).toBe(true);
    expect.soft(await yearBalance(w, Y), 'ROW-008: W this year now has every day spoken for').toEqual({ daysLeft: A - w1, pending: w2 + k });

    await spendVacation(team.admin, x, THIS_YEAR_START, a1, A - a1);
    const xa = await trySend(x, { kind: 'vacation', ...weekdaySpan(NEXT_YEAR_START, A) });
    expect.soft(isAcceptance(xa), `ROW-008: X's exactly A = ${A} days next year are accepted (got ${describe(xa)})`).toBe(true);
    expect.soft(await yearBalance(x, Y + 1), 'ROW-008: X next year has the allowance pending').toEqual({ daysLeft: A, pending: A });
  } finally {
    await team.dispose();
  }
});

// ROW-009 promise: REQ-002 fail-if (3) "the refusal does not show that year's days left together with that year's
// ROW-009   pending vacation days" (A-001: the days left are shown; A-002: days left counts approved days, pending
// ROW-009   shown beside it; F-12's repair).
// ROW-009 wrong product: a bare "not enough days" refusal; one that shows days left minus pending as a single
// ROW-009   figure; one that shows this year's figures for a next-year request.
// ROW-009 given: member P with allowance A, this year L = A − approved days left and P = pending days, figures
// ROW-009   chosen per run so that A, L, P, L − P and the asked count are all different numbers; member Q with this year
// ROW-009   spent and next year L′ left and P′ pending, different from every figure of this year. when: P asks L − P + 1
// ROW-009   days this year; Q asks L′ − P′ + 1 days next year. then: each is refused, and the refusal shows L and P
// ROW-009   (for Q, L′ and P′) — read as the whole numbers in the refusal's message and data, dates removed.
// ROW-009 controls: the control case shows the fixture: P reads {L, P} this year and Q reads {L′, P′} next year.
// ROW-009 technique: decoys — every other figure the product could show (allowance, the difference, the asked count,
// ROW-009   the other year's) is a different number, so only the right two match; fresh per run.
// ROW-009 cases: ROW-009 target=ROW-009.REQ-002.the-refusal-shows-that-years-days-left-and-pending-days control=ROW-009.control.the-figures-the-refusal-must-show
function refusalFigures() {
  for (;;) {
    const A = randomInt(18, 28);
    const a1 = randomInt(2, 6);
    const a2 = randomInt(3, 7);
    const L = A - a1;
    const P = a2;
    const c1 = randomInt(2, 6);
    const b1 = randomInt(2, 6);
    const b2 = randomInt(3, 7);
    const L2 = A - b1;
    const P2 = b2;
    const thisYear = [A, L, P, L - P, L - P + 1];
    const nextYear = [A, L2, P2, L2 - P2, L2 - P2 + 1, A - c1];
    const distinct = (xs: number[]) => new Set(xs).size === xs.length;
    if (distinct(thisYear) && distinct(nextYear) && L2 !== A - c1 && P2 !== A - c1 && b1 !== b2 && a1 !== a2) {
      return { A, a1, a2, L, P, c1, b1, b2, L2, P2 };
    }
  }
}

test('ROW-009.control.the-figures-the-refusal-must-show', async () => {
  const f = refusalFigures();
  const team = await setupTeam({ now: NOW, allowances: [f.A, f.A] });
  const [p, q] = team.people;
  try {
    await spendVacation(team.admin, p, THIS_YEAR_START, f.a1, f.a2);
    await spendVacation(team.admin, q, THIS_YEAR_START, f.c1, f.A - f.c1);
    await spendVacation(team.admin, q, NEXT_YEAR_START, f.b1, f.b2);
    expect.soft(await yearBalance(p, Y), 'ROW-009 control: P this year').toEqual({ daysLeft: f.L, pending: f.P });
    expect.soft(await yearBalance(q, Y + 1), 'ROW-009 control: Q next year').toEqual({ daysLeft: f.L2, pending: f.P2 });
  } finally {
    await team.dispose();
  }
});

test('ROW-009.REQ-002.the-refusal-shows-that-years-days-left-and-pending-days', async () => {
  const f = refusalFigures();
  const team = await setupTeam({ now: NOW, allowances: [f.A, f.A] });
  const [p, q] = team.people;
  try {
    await spendVacation(team.admin, p, THIS_YEAR_START, f.a1, f.a2);
    const pa = await trySend(p, { kind: 'vacation', ...weekdaySpan(onOrAfter(day(Y, 6, 1), 1), f.L - f.P + 1) });
    expect.soft(isRuleRefusal(pa), `ROW-009: P's request is refused (got ${describe(pa)})`).toBe(true);
    const pShown = numbersShown(pa);
    expect.soft(pShown, `ROW-009: P's refusal shows this year's days left ${f.L} (got ${describe(pa)})`).toContain(f.L);
    expect.soft(pShown, `ROW-009: P's refusal shows this year's pending days ${f.P} (got ${describe(pa)})`).toContain(f.P);

    await spendVacation(team.admin, q, THIS_YEAR_START, f.c1, f.A - f.c1);
    await spendVacation(team.admin, q, NEXT_YEAR_START, f.b1, f.b2);
    const qa = await trySend(q, { kind: 'vacation', ...weekdaySpan(onOrAfter(day(Y + 1, 6, 1), 1), f.L2 - f.P2 + 1) });
    expect.soft(isRuleRefusal(qa), `ROW-009: Q's next-year request is refused (got ${describe(qa)})`).toBe(true);
    const qShown = numbersShown(qa);
    expect.soft(qShown, `ROW-009: Q's refusal shows next year's days left ${f.L2} (got ${describe(qa)})`).toContain(f.L2);
    expect.soft(qShown, `ROW-009: Q's refusal shows next year's pending days ${f.P2} (got ${describe(qa)})`).toContain(f.P2);
  } finally {
    await team.dispose();
  }
});
