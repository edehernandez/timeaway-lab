// Purpose: ledger tests for ROW-010 and ROW-011 (REQ-002) — a sick request is never refused for lack of allowance and never changes the days left, and vacation requests sent at the same moment never overdraw the days left together.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, approval), fresh per run.
import { test, expect } from '@playwright/test';
import { approve, type AccountId } from './harness';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
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
  type Answer,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);
const THIS_YEAR_START = onOrAfter(addDays(TODAY, 7), 1);

// ROW-010 promise: REQ-002 fail-if (4) "a sick request is refused for lack of allowance or changes the days left";
// ROW-010   A-004: sick requests "have no limit and are never taken from the allowance".
// ROW-010 wrong product: one balance check for every kind (sick refused once vacation is used up), or sick days added
// ROW-010   to the pending figure, or approved sick days subtracted from days left.
// ROW-010 given: member S with a small fresh allowance A, all of this year's A days taken by an approved vacation;
// ROW-010   member S0 with allowance 0. when: S sends a 5-day sick request this year and a 4-day one next year, S0 a
// ROW-010   3-day one this year; then the admin approves the sick requests. then: all three are accepted, and every
// ROW-010   {daysLeft, pending} figure of both years is the same after sending and after approving as before.
// ROW-010 controls: the control case shows S's allowance is used up: a 1-day vacation this year is refused — the
// ROW-010   harmful case (no days left) is reached.
// ROW-010 technique: before and after on both years' figures; an allowance of 0 as the edge; approval as the second
// ROW-010   action that could wrongly take days.
// ROW-010 cases: ROW-010 target=ROW-010.REQ-002.a-sick-request-is-never-refused-for-allowance-nor-changes-the-days-left control=ROW-010.control.a-vacation-day-is-refused-when-the-allowance-is-used-up
test('ROW-010.control.a-vacation-day-is-refused-when-the-allowance-is-used-up', async () => {
  const A = randomInt(1, 3);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [s] = team.people;
  try {
    await spendVacation(team.admin, s, THIS_YEAR_START, A, 0);
    const free = onOrAfter(day(Y, 6, 1), 2);
    const a = await trySend(s, { kind: 'vacation', firstDay: free, lastDay: free });
    expect(isRuleRefusal(a), `ROW-010 control: one more vacation day is refused (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-010.REQ-002.a-sick-request-is-never-refused-for-allowance-nor-changes-the-days-left', async () => {
  const A = randomInt(1, 3);
  const team = await setupTeam({ now: NOW, allowances: [A, 0] });
  const [s, s0] = team.people;
  try {
    await spendVacation(team.admin, s, THIS_YEAR_START, A, 0);
    const before = {
      s: [await yearBalance(s, Y), await yearBalance(s, Y + 1)],
      s0: [await yearBalance(s0, Y), await yearBalance(s0, Y + 1)],
    };
    const sends: [typeof s, { firstDay: string; lastDay: string }, string][] = [
      [s, weekdaySpan(onOrAfter(day(Y, 6, 1), 1), 5), "S's 5-day sick request this year"],
      [s, weekdaySpan(onOrAfter(day(Y + 1, 6, 1), 1), 4), "S's 4-day sick request next year"],
      [s0, weekdaySpan(onOrAfter(day(Y, 6, 1), 1), 3), "S0's 3-day sick request this year"],
    ];
    const ids: AccountId[] = [];
    for (const [who, span, label] of sends) {
      const a = await trySend(who, { kind: 'sick', ...span });
      expect.soft(isAcceptance(a), `ROW-010: ${label} is accepted (got ${describe(a)})`).toBe(true);
      if (a.id !== undefined) ids.push(a.id);
    }
    const afterSend = {
      s: [await yearBalance(s, Y), await yearBalance(s, Y + 1)],
      s0: [await yearBalance(s0, Y), await yearBalance(s0, Y + 1)],
    };
    expect.soft(afterSend, 'ROW-010: sending sick requests changes no figure').toEqual(before);
    for (const id of ids) await approve(team.admin, id);
    const afterApprove = {
      s: [await yearBalance(s, Y), await yearBalance(s, Y + 1)],
      s0: [await yearBalance(s0, Y), await yearBalance(s0, Y + 1)],
    };
    expect.soft(afterApprove, 'ROW-010: approving sick requests changes no figure').toEqual(before);
  } finally {
    await team.dispose();
  }
});

// ROW-011 promise: REQ-002 fail-if (5) "two vacation requests sent at the same moment are both accepted although
// ROW-011   together they exceed the days left"; D-005 (the check and the insert in one write transaction taken at once).
// ROW-011 wrong product: a check-then-insert outside one transaction — each request reads the same days left, each
// ROW-011   passes, both are stored.
// ROW-011 given: in each of three rounds a fresh member whose allowance A (fresh) less an approved vacation leaves
// ROW-011   exactly 4 days. when: the member sends eight 2-day vacation requests on eight different weeks all at once
// ROW-011   (each within the 4 days alone, any three together over). then: exactly two are accepted and the rest refused
// ROW-011   with a rule's refusal; the member's list holds exactly the approved one plus the two accepted; the year
// ROW-011   reads {daysLeft 4, pending 4} — never pending above 4.
// ROW-011 controls: the control case sends three such requests one after another: the first two are accepted and the
// ROW-011   third refused — the sequential check works, so the target measures the simultaneous case only.
// ROW-011 technique: a race widened by eight concurrent sends, repeated over three fresh members; the store read
// ROW-011   (list and pending) after, not only the statuses.
// ROW-011 cases: ROW-011 target=ROW-011.REQ-002.simultaneous-vacation-requests-never-overdraw-the-days-left control=ROW-011.control.sequential-requests-stop-at-the-days-left
test('ROW-011.control.sequential-requests-stop-at-the-days-left', async () => {
  const A = randomInt(6, 10);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [m] = team.people;
  try {
    await spendVacation(team.admin, m, THIS_YEAR_START, A - 4, 0);
    const answers: Answer[] = [];
    for (let i = 0; i < 3; i += 1) {
      answers.push(await trySend(m, { kind: 'vacation', ...weekdaySpan(addDays(onOrAfter(day(Y, 6, 1), 1), 7 * i), 2) }));
    }
    expect
      .soft(answers.map((a) => (isAcceptance(a) ? 'accepted' : isRuleRefusal(a) ? 'refused' : describe(a))), 'ROW-011 control: two accepted, then refused')
      .toEqual(['accepted', 'accepted', 'refused']);
  } finally {
    await team.dispose();
  }
});

test('ROW-011.REQ-002.simultaneous-vacation-requests-never-overdraw-the-days-left', async () => {
  for (let round = 1; round <= 3; round += 1) {
    const A = randomInt(6, 10);
    const team = await setupTeam({ now: NOW, allowances: [A] });
    const [m] = team.people;
    try {
      await spendVacation(team.admin, m, THIS_YEAR_START, A - 4, 0);
      const spans = Array.from({ length: 8 }, (_, i) => weekdaySpan(addDays(onOrAfter(day(Y, 6, 1), 1), 7 * i), 2));
      const answers = await Promise.all(spans.map((span) => trySend(m, { kind: 'vacation', ...span })));
      const accepted = answers.filter(isAcceptance);
      const other = answers.filter((a) => !isAcceptance(a) && !isRuleRefusal(a)).map(describe);
      expect.soft(accepted.length, `ROW-011 round ${round}: exactly two of eight simultaneous requests are accepted`).toBe(2);
      expect.soft(other, `ROW-011 round ${round}: every other answer is a rule's refusal`).toEqual([]);
      expect.soft(await yearBalance(m, Y), `ROW-011 round ${round}: the year is never overdrawn`).toEqual({ daysLeft: 4, pending: 4 });
      expect.soft((await ownRequests(m)).length, `ROW-011 round ${round}: the approved request plus two are stored`).toBe(3);
    } finally {
      await team.dispose();
    }
  }
});
