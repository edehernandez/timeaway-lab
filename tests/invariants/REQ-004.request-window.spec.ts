// Purpose: ledger tests for ROW-015, ROW-016, ROW-017, ROW-018 and ROW-019 (REQ-004) — vacation never includes a day before today while sick may, vacation never reaches before 1 January of the current year, no request reaches past 31 December of the next year, and no request crosses 31 December.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, the test clock), fresh per run.
import { test, expect } from '@playwright/test';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  isWeekday,
  moveClock,
  onOrAfter,
  ownRequests,
  pickYear,
  setupTeam,
  teamAt,
  trySend,
  utcDateOf,
  weekdayOnOrAfter,
  weekdayOnOrBefore,
} from './request-rules';

// A year fresh per run whose 30 and 31 December of the year before are weekdays (ROW-017's probe days). Today is a
// Wednesday in early March, 09:00 in the team zone (UTC+14) — in UTC still the Tuesday before.
const Y = pickYear((y) => isWeekday(day(y - 1, 12, 30)) && isWeekday(day(y - 1, 12, 31)));
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);

// ROW-015 promise: REQ-004 fail-if (1) "a vacation request that includes a day before today is accepted"; A-004
// ROW-015   ("vacation requests may not" cover past days); today is the team zone's date (REQ-004, D-007).
// ROW-015 wrong product: one that compares with today in the server's UTC (a day behind before 14:00 team time), or
// ROW-015   checks only the last day, or only the first day against a stale date.
// ROW-015 given: today a Wednesday at 09:00 team time (UTC+14), which is Tuesday 19:00 in UTC; a fresh member. when:
// ROW-015   they send a vacation for yesterday (Tuesday) alone, for Tuesday to Wednesday, and for the Friday before to
// ROW-015   this Friday. then: each is refused with a rule's refusal and nothing is stored.
// ROW-015 controls: the control case sends a vacation from today to Friday and it is accepted — today is not before
// ROW-015   today, and the clock is honoured (the year is decades ahead of the machine's own).
// ROW-015 technique: the boundary from both sides (yesterday refused, today accepted) at an instant where the team's
// ROW-015   date and UTC's differ, so a UTC reading accepts yesterday.
// ROW-015 cases: ROW-015 target=ROW-015.REQ-004.a-vacation-with-a-day-before-today-is-refused control=ROW-015.control.a-vacation-from-today-is-accepted
test('ROW-015.control.a-vacation-from-today-is-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  try {
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: TODAY, lastDay: addDays(TODAY, 2) });
    expect(isAcceptance(a), `ROW-015 control: today to Friday is accepted (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-015.REQ-004.a-vacation-with-a-day-before-today-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const yesterday = addDays(TODAY, -1);
    expect(utcDateOf(NOW), 'ROW-015: at this instant UTC still reads yesterday').toBe(yesterday);
    const attempts = [
      { firstDay: yesterday, lastDay: yesterday },
      { firstDay: yesterday, lastDay: TODAY },
      { firstDay: addDays(TODAY, -5), lastDay: addDays(TODAY, 2) },
    ];
    for (const s of attempts) {
      const a = await trySend(p, { kind: 'vacation', ...s });
      expect.soft(isRuleRefusal(a), `ROW-015: vacation ${s.firstDay}..${s.lastDay} is refused (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-015: nothing is stored').toEqual([]);
  } finally {
    await team.dispose();
  }
});

// ROW-016 promise: REQ-004 fail-if (2) "a sick request is refused because its days are before today"; A-004 ("sick
// ROW-016   requests may cover past days").
// ROW-016 wrong product: one window rule for every kind (vacation's "not before today" applied to sick too).
// ROW-016 given: today a Wednesday in March (team zone); two fresh members. when: member 1 sends sick requests for
// ROW-016   Monday to Tuesday just past, for the Wednesday a week ago, and for the first weekday of February this year;
// ROW-016   member 2 sends one from yesterday to tomorrow. then: all four are accepted and listed pending.
// ROW-016 controls: the control case sends a vacation for yesterday and it is refused — the before-today rule is live
// ROW-016   at this clock, so the target's acceptances are about the kind.
// ROW-016 technique: near miss (the same past day as vacation, refused); past days at several distances, and a range
// ROW-016   reaching from the past into the future.
// ROW-016 cases: ROW-016 target=ROW-016.REQ-004.a-sick-request-is-never-refused-for-days-before-today control=ROW-016.control.a-vacation-for-yesterday-is-refused
test('ROW-016.control.a-vacation-for-yesterday-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  try {
    const y = addDays(TODAY, -1);
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: y, lastDay: y });
    expect(isRuleRefusal(a), `ROW-016 control: a vacation for yesterday is refused (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-016.REQ-004.a-sick-request-is-never-refused-for-days-before-today', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25] });
  const [p1, p2] = team.people;
  try {
    const feb = weekdayOnOrAfter(day(Y, 2, 1));
    const sends: [typeof p1, string, string][] = [
      [p1, addDays(TODAY, -2), addDays(TODAY, -1)],
      [p1, addDays(TODAY, -7), addDays(TODAY, -7)],
      [p1, feb, feb],
      [p2, addDays(TODAY, -1), addDays(TODAY, 1)],
    ];
    for (const [who, firstDay, lastDay] of sends) {
      const a = await trySend(who, { kind: 'sick', firstDay, lastDay });
      expect.soft(isAcceptance(a), `ROW-016: sick ${firstDay}..${lastDay} is accepted (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p1)).map((r) => r.state), "ROW-016: member 1's three are listed pending").toEqual(['pending', 'pending', 'pending']);
    expect.soft((await ownRequests(p2)).map((r) => r.state), "ROW-016: member 2's one is listed pending").toEqual(['pending']);
  } finally {
    await team.dispose();
  }
});

// ROW-017 promise: REQ-004 fail-if (3) "a vacation request with a day before 1 January of the current year is
// ROW-017   accepted"; REQ-004 "every request lies within the current or the next calendar year" (A-003, A-020; A-036
// ROW-017   keeps vacation to the current and next year); the current year is the team zone's (REQ-004 (6), D-007).
// ROW-017 wrong product: one that reads the year in UTC — on 1 January before 14:00 team time UTC is still 31
// ROW-017   December, so last December is "today" and "this year" — or one that lets vacation share the January exception
// ROW-017   sick requests have.
// ROW-017 given: a year whose 30 and 31 December before it are weekdays; the clock at 1 January 09:00 team time
// ROW-017   (31 December 19:00 UTC), then at 15 January; a fresh member. when: at 1 January they send a vacation for
// ROW-017   31 December and one for 30 to 31 December; at 15 January a vacation for 31 December again. then: each is
// ROW-017   refused with a rule's refusal; nothing is stored.
// ROW-017 controls: the control case, at 1 January 09:00, sends a vacation for the first weekday of the new year and
// ROW-017   it is accepted — the clock and the new year are read, so the refusals are about the old year's days.
// ROW-017 technique: the clock's origin — New Year at an instant where the team's year and UTC's differ; the boundary
// ROW-017   from both sides (31 December refused, the first weekday of January accepted).
// ROW-017 cases: ROW-017 target=ROW-017.REQ-004.a-vacation-with-a-day-before-1-January-is-refused control=ROW-017.control.a-vacation-in-the-new-year-is-accepted-on-1-January
const NEW_YEAR = teamAt(day(Y, 1, 1));

test('ROW-017.control.a-vacation-in-the-new-year-is-accepted-on-1-January', async () => {
  const team = await setupTeam({ now: NEW_YEAR, allowances: [25] });
  try {
    const first = weekdayOnOrAfter(day(Y, 1, 1));
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: first, lastDay: first });
    expect(isAcceptance(a), `ROW-017 control: a vacation on ${first} is accepted (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-017.REQ-004.a-vacation-with-a-day-before-1-January-is-refused', async () => {
  const team = await setupTeam({ now: NEW_YEAR, allowances: [25] });
  const [p] = team.people;
  try {
    expect(utcDateOf(NEW_YEAR), 'ROW-017: at this instant UTC still reads 31 December').toBe(day(Y - 1, 12, 31));
    const dec30 = day(Y - 1, 12, 30);
    const dec31 = day(Y - 1, 12, 31);
    const a = await trySend(p, { kind: 'vacation', firstDay: dec31, lastDay: dec31 });
    const b = await trySend(p, { kind: 'vacation', firstDay: dec30, lastDay: dec31 });
    expect.soft(isRuleRefusal(a), `ROW-017: on 1 January, a vacation for 31 December is refused (got ${describe(a)})`).toBe(true);
    expect.soft(isRuleRefusal(b), `ROW-017: on 1 January, a vacation for 30 to 31 December is refused (got ${describe(b)})`).toBe(true);
    await moveClock(team, teamAt(day(Y, 1, 15)));
    const c = await trySend(p, { kind: 'vacation', firstDay: dec31, lastDay: dec31 });
    expect.soft(isRuleRefusal(c), `ROW-017: on 15 January, a vacation for 31 December is refused (got ${describe(c)})`).toBe(true);
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-017: nothing is stored').toEqual([]);
  } finally {
    await team.dispose();
  }
});

// ROW-018 promise: REQ-004 fail-if (4) "a request with a day after 31 December of the next year is accepted" (A-020:
// ROW-018   the current calendar year and the next one).
// ROW-018 wrong product: no upper limit, a rolling "twelve months ahead" limit, or a limit checked for vacation only.
// ROW-018 given: today in March of the year; a fresh member. when: they send a vacation and a sick request for the
// ROW-018   first weekday of the year after next, and a vacation for a June weekday of that year. then: each is refused
// ROW-018   with a rule's refusal; nothing is stored.
// ROW-018 controls: the control case sends a vacation for the last weekday of next year — the boundary's inside — and
// ROW-018   it is accepted (21 months ahead, past any rolling twelve months).
// ROW-018 technique: the threshold from both sides (last weekday of next year accepted, first weekday after refused).
// ROW-018 cases: ROW-018 target=ROW-018.REQ-004.a-day-after-31-December-of-next-year-is-refused control=ROW-018.control.the-last-weekday-of-next-year-is-accepted
test('ROW-018.control.the-last-weekday-of-next-year-is-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  try {
    const last = weekdayOnOrBefore(day(Y + 1, 12, 31));
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: last, lastDay: last });
    expect(isAcceptance(a), `ROW-018 control: a vacation on ${last} is accepted (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-018.REQ-004.a-day-after-31-December-of-next-year-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const first = weekdayOnOrAfter(day(Y + 2, 1, 1));
    const june = weekdayOnOrAfter(day(Y + 2, 6, 10));
    const attempts = [
      { kind: 'vacation', firstDay: first, lastDay: first },
      { kind: 'sick', firstDay: first, lastDay: first },
      { kind: 'vacation', firstDay: june, lastDay: june },
    ];
    for (const s of attempts) {
      const a = await trySend(p, s);
      expect.soft(isRuleRefusal(a), `ROW-018: ${s.kind} on ${s.firstDay} is refused (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-018: nothing is stored').toEqual([]);
  } finally {
    await team.dispose();
  }
});

// ROW-019 promise: REQ-004 fail-if (5) "a request whose first and last days fall in different years is accepted";
// ROW-019   A-003 ("a request may not cross 31 December, so the person sends two requests").
// ROW-019 wrong product: one that accepts the crossing range and books its days into the first day's year, or checks
// ROW-019   the crossing for vacation only.
// ROW-019 given: today in March of the year; a fresh member. when: they send a vacation and a sick request from the
// ROW-019   last weekdays of December this year into the first weekdays of January next year, and a vacation from 31
// ROW-019   December next year into January of the year after. then: each is refused with a rule's refusal; nothing is
// ROW-019   stored.
// ROW-019 controls: the control case sends the first crossing range's two halves as two requests, each in its year,
// ROW-019   and both are accepted — the days themselves are requestable, so the target's refusals are about the crossing.
// ROW-019 technique: near miss (the same days split at 31 December, A-003's own remedy); both kinds.
// ROW-019 cases: ROW-019 target=ROW-019.REQ-004.a-request-crossing-31-December-is-refused control=ROW-019.control.the-two-halves-are-accepted
const CROSS_FIRST = weekdayOnOrBefore(day(Y, 12, 30));
const CROSS_LAST = weekdayOnOrAfter(day(Y + 1, 1, 2));

test('ROW-019.control.the-two-halves-are-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const a = await trySend(p, { kind: 'vacation', firstDay: CROSS_FIRST, lastDay: day(Y, 12, 31) });
    const b = await trySend(p, { kind: 'vacation', firstDay: day(Y + 1, 1, 1), lastDay: CROSS_LAST });
    expect.soft(isAcceptance(a), `ROW-019 control: ${CROSS_FIRST}..31 December is accepted (got ${describe(a)})`).toBe(true);
    expect.soft(isAcceptance(b), `ROW-019 control: 1 January..${CROSS_LAST} is accepted (got ${describe(b)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-019.REQ-004.a-request-crossing-31-December-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const attempts = [
      { kind: 'vacation', firstDay: CROSS_FIRST, lastDay: CROSS_LAST },
      { kind: 'sick', firstDay: CROSS_FIRST, lastDay: CROSS_LAST },
      { kind: 'vacation', firstDay: weekdayOnOrBefore(day(Y + 1, 12, 31)), lastDay: weekdayOnOrAfter(day(Y + 2, 1, 1)) },
    ];
    for (const s of attempts) {
      const a = await trySend(p, s);
      expect.soft(isRuleRefusal(a), `ROW-019: ${s.kind} ${s.firstDay}..${s.lastDay} is refused (got ${describe(a)})`).toBe(true);
    }
    expect.soft((await ownRequests(p)).map((r) => r.id), 'ROW-019: nothing is stored').toEqual([]);
  } finally {
    await team.dispose();
  }
});
