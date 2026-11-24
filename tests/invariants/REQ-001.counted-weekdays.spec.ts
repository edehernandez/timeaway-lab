// Purpose: ledger tests for ROW-002, ROW-003, ROW-004 and ROW-242 (REQ-001) — only Monday to Friday days in a range are counted and shown away, a range with no weekday or ending before it starts is refused, and the count is the weekdays from first to last day, both included.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, approval), fresh per run.
import { test, expect } from '@playwright/test';
import { approve, sendRequest, type AccountId } from './harness';
import {
  addDays,
  countWeekdays,
  day,
  describe,
  isAcceptance,
  isAwayOn,
  isRuleRefusal,
  isWeekday,
  onOrAfter,
  ownRequests,
  pickYear,
  randomInt,
  setupTeam,
  teamAt,
  trySend,
  yearBalance,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);

function everyDay(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

// ROW-002 promise: REQ-001 fail-if (2) "a Saturday or Sunday inside the range is counted as a requested day or shown
// ROW-002   as away"; A-017 "Saturdays and Sundays inside the range are ignored" and appear on no calendar.
// ROW-002 wrong product: one that counts calendar days (Friday to Monday = 4), or counts weekdays but draws the
// ROW-002   whole range on the calendar, Saturday and Sunday included.
// ROW-002 given: a member with a fresh allowance; a vacation Friday to Monday (2 weekdays, a weekend inside) and a
// ROW-002   vacation from a Saturday to the Sunday fifteen days later (10 weekdays, three weekend days at its ends and
// ROW-002   one weekend inside). when: both are sent, then approved by the admin. then: after sending, the year's
// ROW-002   pending days are exactly 12 and days left unchanged; after approval days left are allowance − 12; on the
// ROW-002   calendar every day of both ranges shows the member away exactly when it is a weekday — no Saturday or
// ROW-002   Sunday shows them.
// ROW-002 controls: the control case shows the approved Friday on the calendar with the member — the calendar read
// ROW-002   reaches approved days, so a weekend's absence is not an empty calendar.
// ROW-002 technique: the oracle's count (request-rules.ts, independent of the product) for the figures; every day of
// ROW-002   both ranges checked, the whole list, not a sample.
// ROW-002 cases: ROW-002 target=ROW-002.REQ-001.a-Saturday-or-Sunday-in-a-range-is-never-counted-or-shown-away control=ROW-002.control.an-approved-Friday-is-shown-away
test('ROW-002.control.an-approved-Friday-is-shown-away', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  const [m] = team.members;
  try {
    const fri = onOrAfter(addDays(TODAY, 1), 5);
    expect(await isAwayOn(p, m, fri), 'ROW-002 control: the Friday shows nobody before').toBe(false);
    const id = await sendRequest(p, { kind: 'vacation', firstDay: fri, lastDay: fri });
    await approve(team.admin, id);
    expect(await isAwayOn(p, m, fri), 'ROW-002 control: the approved Friday shows the member away').toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-002.REQ-001.a-Saturday-or-Sunday-in-a-range-is-never-counted-or-shown-away', async () => {
  const allowance = randomInt(20, 30);
  const team = await setupTeam({ now: NOW, allowances: [allowance] });
  const [p] = team.people;
  const [m] = team.members;
  try {
    const fri = onOrAfter(addDays(TODAY, 1), 5);
    const short = { firstDay: fri, lastDay: addDays(fri, 3) };
    const sat = onOrAfter(addDays(TODAY, 14), 6);
    const long = { firstDay: sat, lastDay: addDays(sat, 15) };
    expect([countWeekdays(short.firstDay, short.lastDay), countWeekdays(long.firstDay, long.lastDay)], 'ROW-002: the oracle counts').toEqual([2, 10]);

    const before = await yearBalance(p, Y);
    const shortId = await sendRequest(p, { kind: 'vacation', ...short });
    const longId = await sendRequest(p, { kind: 'vacation', ...long });
    expect.soft(await yearBalance(p, Y), 'ROW-002: only the 12 weekdays are pending').toEqual({ daysLeft: before.daysLeft, pending: before.pending + 12 });

    await approve(team.admin, shortId);
    await approve(team.admin, longId);
    expect.soft(await yearBalance(p, Y), 'ROW-002: only the 12 weekdays are taken from the allowance').toEqual({
      daysLeft: before.daysLeft - 12,
      pending: before.pending,
    });

    const wrong: string[] = [];
    for (const d of [...everyDay(short.firstDay, short.lastDay), ...everyDay(long.firstDay, long.lastDay)]) {
      const away = await isAwayOn(p, m, d);
      if (away !== isWeekday(d)) wrong.push(`${d} ${isWeekday(d) ? 'weekday not shown' : 'weekend shown away'}`);
    }
    expect.soft(wrong, 'ROW-002: the calendar shows the member away on exactly the weekdays of both ranges').toEqual([]);
  } finally {
    await team.dispose();
  }
});

// ROW-003 promise: REQ-001 fail-if (3) "a range containing no Monday to Friday day is accepted"; A-017 "a range with
// ROW-003   no Monday-to-Friday day is refused".
// ROW-003 wrong product: one that accepts a weekend-only range as a request of 0 days, or refuses only Saturday to
// ROW-003   Sunday but not a single Saturday or Sunday, or checks only vacation and lets a sick weekend through.
// ROW-003 given: a fresh member, no request. when: they send Saturday to Sunday (vacation and sick, on two
// ROW-003   weekends), a single Saturday (sick) and a single Sunday (vacation). then: each is refused with a rule's
// ROW-003   refusal, GET /api/requests lists nothing and no day is pending.
// ROW-003 controls: the control case sends Sunday to Monday — the near miss, one weekday — and it is accepted with
// ROW-003   exactly 1 pending day, so the target's refusals are about the missing weekday, not the weekend dates.
// ROW-003 technique: near miss (one weekday added) beside the empty ranges; both kinds; the store read afterwards.
// ROW-003 cases: ROW-003 target=ROW-003.REQ-001.a-range-with-no-weekday-is-refused control=ROW-003.control.Sunday-to-Monday-is-accepted-counting-1
test('ROW-003.control.Sunday-to-Monday-is-accepted-counting-1', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const sun = onOrAfter(addDays(TODAY, 7), 0);
    const a = await trySend(p, { kind: 'vacation', firstDay: sun, lastDay: addDays(sun, 1) });
    expect.soft(isAcceptance(a), `ROW-003 control: Sunday to Monday is accepted (got ${describe(a)})`).toBe(true);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-003 control: it counts 1 day').toBe(1);
  } finally {
    await team.dispose();
  }
});

test('ROW-003.REQ-001.a-range-with-no-weekday-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const sat1 = onOrAfter(addDays(TODAY, 7), 6);
    const sat2 = addDays(sat1, 7);
    const sat3 = addDays(sat1, 14);
    const sun4 = addDays(sat1, 22);
    const attempts = [
      { kind: 'vacation', firstDay: sat1, lastDay: addDays(sat1, 1) },
      { kind: 'sick', firstDay: sat2, lastDay: addDays(sat2, 1) },
      { kind: 'sick', firstDay: sat3, lastDay: sat3 },
      { kind: 'vacation', firstDay: sun4, lastDay: sun4 },
    ];
    for (const s of attempts) {
      expect(countWeekdays(s.firstDay, s.lastDay), `ROW-003: the oracle finds no weekday in ${s.firstDay}..${s.lastDay}`).toBe(0);
      const a = await trySend(p, s);
      expect.soft(isRuleRefusal(a), `ROW-003: ${s.kind} ${s.firstDay}..${s.lastDay} is refused (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-003: no request was stored').toEqual([]);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-003: no day is pending').toBe(0);
  } finally {
    await team.dispose();
  }
});

// ROW-004 promise: REQ-001 fail-if (4) "a range whose last day is before its first day is accepted".
// ROW-004 wrong product: one that swaps the two days and accepts, or counts the range as empty and accepts it with
// ROW-004   0 days, or checks the order for vacation only.
// ROW-004 given: a fresh member, no request. when: they send a Thursday to the Wednesday just before it (vacation),
// ROW-004   and a Friday to the Monday four days before it (sick) — each with weekdays at both ends. then: each is refused
// ROW-004   with a rule's refusal; GET /api/requests lists nothing; no day is pending.
// ROW-004 controls: the control case sends the same Wednesday to Thursday in order — the near miss — and it is
// ROW-004   accepted with 2 pending days, so the target's refusals are about the order, not the days.
// ROW-004 technique: near miss (the same two days, in order); both kinds; the store read afterwards.
// ROW-004 cases: ROW-004 target=ROW-004.REQ-001.a-range-ending-before-it-starts-is-refused control=ROW-004.control.the-same-days-in-order-are-accepted
test('ROW-004.control.the-same-days-in-order-are-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const wed = onOrAfter(addDays(TODAY, 7), 3);
    const a = await trySend(p, { kind: 'vacation', firstDay: wed, lastDay: addDays(wed, 1) });
    expect.soft(isAcceptance(a), `ROW-004 control: Wednesday to Thursday is accepted (got ${describe(a)})`).toBe(true);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-004 control: it counts 2 days').toBe(2);
  } finally {
    await team.dispose();
  }
});

test('ROW-004.REQ-001.a-range-ending-before-it-starts-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const wed = onOrAfter(addDays(TODAY, 7), 3);
    const mon = onOrAfter(addDays(TODAY, 14), 1);
    const attempts = [
      { kind: 'vacation', firstDay: addDays(wed, 1), lastDay: wed },
      { kind: 'sick', firstDay: addDays(mon, 4), lastDay: mon },
    ];
    for (const s of attempts) {
      const a = await trySend(p, s);
      expect.soft(isRuleRefusal(a), `ROW-004: ${s.kind} ${s.firstDay}..${s.lastDay} is refused (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-004: no request was stored').toEqual([]);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-004: no day is pending').toBe(0);
  } finally {
    await team.dispose();
  }
});

// ROW-242 promise: REQ-001 "only the Monday to Friday days in the range are counted as requested days"; A-017; the
// ROW-242   row's own examples: Monday to Friday counts 5, Friday to Monday counts 2, a single weekday with first day
// ROW-242   equal to last day is accepted and counts 1.
// ROW-242 wrong product: an exclusive end (Monday to Friday = 4, a single day = 0 and refused), or a calendar-day count
// ROW-242   (Friday to Monday = 4), or one that refuses first day equal to last day.
// ROW-242 given: a member with a fresh allowance, no request. when: they send Monday to Friday, then the next
// ROW-242   Friday to the Monday after, then a single Wednesday; then the admin approves all three. then: after each send
// ROW-242   the year's pending days grow by exactly 5, 2 and 1, and after the approvals days left are allowance − 8.
// ROW-242 controls: the control case reads a fresh member's balance: days left equal the fresh allowance and nothing
// ROW-242   is pending — the balance reads the allowance, so the target's deltas are the product's counts.
// ROW-242 technique: the row's own example values; before and after each send (deltas, not totals); the oracle checks
// ROW-242   the example ranges independently of the product.
// ROW-242 cases: ROW-242 target=ROW-242.REQ-001.the-count-is-the-weekdays-from-first-to-last-day-both-included control=ROW-242.control.a-fresh-balance-shows-the-allowance
test('ROW-242.control.a-fresh-balance-shows-the-allowance', async () => {
  const allowance = randomInt(11, 29);
  const team = await setupTeam({ now: NOW, allowances: [allowance] });
  try {
    expect(await yearBalance(team.people[0], Y), 'ROW-242 control: days left are the allowance, nothing pending').toEqual({
      daysLeft: allowance,
      pending: 0,
    });
  } finally {
    await team.dispose();
  }
});

test('ROW-242.REQ-001.the-count-is-the-weekdays-from-first-to-last-day-both-included', async () => {
  const allowance = randomInt(12, 29);
  const team = await setupTeam({ now: NOW, allowances: [allowance] });
  const [p] = team.people;
  try {
    const mon = onOrAfter(addDays(TODAY, 7), 1);
    const monToFri = { firstDay: mon, lastDay: addDays(mon, 4) };
    const friToMon = { firstDay: addDays(mon, 11), lastDay: addDays(mon, 14) };
    const wed = addDays(mon, 16);
    const single = { firstDay: wed, lastDay: wed };
    expect(
      [countWeekdays(monToFri.firstDay, monToFri.lastDay), countWeekdays(friToMon.firstDay, friToMon.lastDay), countWeekdays(wed, wed)],
      'ROW-242: the oracle agrees with the row',
    ).toEqual([5, 2, 1]);

    const ids: AccountId[] = [];
    let last = await yearBalance(p, Y);
    for (const [range, expected] of [
      [monToFri, 5],
      [friToMon, 2],
      [single, 1],
    ] as const) {
      const a = await trySend(p, { kind: 'vacation', ...range });
      expect.soft(isAcceptance(a), `ROW-242: ${range.firstDay}..${range.lastDay} is accepted (got ${describe(a)})`).toBe(true);
      if (a.id !== undefined) ids.push(a.id);
      const now = await yearBalance(p, Y);
      expect.soft(now.pending - last.pending, `ROW-242: ${range.firstDay}..${range.lastDay} counts ${expected}`).toBe(expected);
      last = now;
    }
    for (const id of ids) await approve(team.admin, id);
    expect.soft(await yearBalance(p, Y), 'ROW-242: the 8 counted days are taken on approval').toEqual({ daysLeft: allowance - 8, pending: 0 });
  } finally {
    await team.dispose();
  }
});
