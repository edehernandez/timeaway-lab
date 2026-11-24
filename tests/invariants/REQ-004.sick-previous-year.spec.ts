// Purpose: ledger tests for ROW-248 and ROW-249 (REQ-004) — during January (team zone) a sick request may cover weekdays of the previous year, never earlier, and outside January never any day before 1 January of the current year.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, the test clock), fresh per run.
import { test, expect } from '@playwright/test';
import { setClock, signInMember, type Actor } from './harness';
import {
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  isWeekday,
  onOrAfter,
  ownRequests,
  pickYear,
  setupTeam,
  teamAt,
  trySend,
  utcDateOf,
  weekdayOnOrAfter,
  weekdayOnOrBefore,
  type Team,
} from './request-rules';

// A year fresh per run whose 30 and 31 December of the year before are weekdays (ROW-249's own example days).
const Y = pickYear((y) => isWeekday(day(y - 1, 12, 30)) && isWeekday(day(y - 1, 12, 31)));
const DEC30 = day(Y - 1, 12, 30);
const DEC31 = day(Y - 1, 12, 31);

/** Moves the team clock and signs member i in afresh at the new instant. */
async function at(team: Team, instant: string, i: number): Promise<Actor> {
  await setClock(instant);
  return signInMember(team.members[i]);
}

// ROW-248 promise: REQ-004 fail-if (7) "a sick request with a day before 1 January of the current year is accepted
// ROW-248   when sent outside January, or with a day before 1 January of the previous year at any time"; A-036 (the
// ROW-248   exception is January's, and reaches back one year only); January and the years are the team zone's (D-007).
// ROW-248 wrong product: one with no lower limit for sick days; one with a rolling window ("the last 31 days", "the
// ROW-248   last year"); one that reads January in UTC — on 1 February before 14:00 team time UTC still says 31 January.
// ROW-248 given: fresh members, a fresh year. when / then, each refused with a rule's refusal:
// ROW-248   (a) 1 February 09:00 team (31 January 19:00 UTC): sick for 31 December, and for 30 to 31 December;
// ROW-248   (b) a Wednesday in March: sick for a mid-December weekday of last year;
// ROW-248   (c) 15 January: sick for the last weekday of the year before last, and for a November weekday of that year.
// ROW-248   Nothing is stored for any of them.
// ROW-248 controls: the control case sends the near misses: on 1 February sick for the first weekday of January this
// ROW-248   year, and on 15 January sick for 30 December — both accepted, so the refusals are about the limit.
// ROW-248 technique: the clock's origin — the first instant after January in the team zone while UTC is still in
// ROW-248   January; near misses one step inside each limit.
// ROW-248 cases: ROW-248 target=ROW-248.REQ-004.a-sick-day-before-the-allowed-year-is-refused control=ROW-248.control.sick-days-just-inside-the-limit-are-accepted
test('ROW-248.control.sick-days-just-inside-the-limit-are-accepted', async () => {
  const team = await setupTeam({ now: teamAt(day(Y, 2, 1)), allowances: [25, 25] });
  try {
    const jan = weekdayOnOrAfter(day(Y, 1, 1));
    const a = await trySend(team.people[0], { kind: 'sick', firstDay: jan, lastDay: jan });
    expect.soft(isAcceptance(a), `ROW-248 control: on 1 February, sick for ${jan} is accepted (got ${describe(a)})`).toBe(true);
    const p2 = await at(team, teamAt(day(Y, 1, 15)), 1);
    try {
      const b = await trySend(p2, { kind: 'sick', firstDay: DEC30, lastDay: DEC30 });
      expect.soft(isAcceptance(b), `ROW-248 control: on 15 January, sick for ${DEC30} is accepted (got ${describe(b)})`).toBe(true);
    } finally {
      await p2.dispose();
    }
  } finally {
    await team.dispose();
  }
});

test('ROW-248.REQ-004.a-sick-day-before-the-allowed-year-is-refused', async () => {
  const feb1 = teamAt(day(Y, 2, 1));
  const team = await setupTeam({ now: feb1, allowances: [25, 25, 25] });
  try {
    expect(utcDateOf(feb1), 'ROW-248: at this instant UTC still reads 31 January').toBe(day(Y, 1, 31));
    const probes: { at: string; label: string; days: [string, string][] }[] = [
      { at: feb1, label: '(a) 1 February', days: [[DEC31, DEC31], [DEC30, DEC31]] },
      { at: teamAt(onOrAfter(day(Y, 3, 2), 3)), label: '(b) March', days: [[weekdayOnOrAfter(day(Y - 1, 12, 14)), weekdayOnOrAfter(day(Y - 1, 12, 14))]] },
      {
        at: teamAt(day(Y, 1, 15)),
        label: '(c) 15 January',
        days: [
          [weekdayOnOrBefore(day(Y - 2, 12, 31)), weekdayOnOrBefore(day(Y - 2, 12, 31))],
          [weekdayOnOrAfter(day(Y - 2, 11, 10)), weekdayOnOrAfter(day(Y - 2, 11, 10))],
        ],
      },
    ];
    for (const [i, probe] of probes.entries()) {
      const person = await at(team, probe.at, i);
      try {
        for (const [firstDay, lastDay] of probe.days) {
          const a = await trySend(person, { kind: 'sick', firstDay, lastDay });
          expect.soft(isRuleRefusal(a), `ROW-248 ${probe.label}: sick ${firstDay}..${lastDay} is refused (got ${describe(a)})`).toBe(true);
        }
        expect.soft((await ownRequests(person)).map((r) => r.id), `ROW-248 ${probe.label}: nothing is stored`).toEqual([]);
      } finally {
        await person.dispose();
      }
    }
  } finally {
    await team.dispose();
  }
});

// ROW-249 promise: REQ-004 fail-if (8) "a sick request sent in January for weekdays of the previous year is refused
// ROW-249   because those days fall in the previous year"; A-036 ("during January a sick request may cover weekdays of the
// ROW-249   previous calendar year"); the row's own cases: sent on 2 January in the team zone for 30 and 31 December, run
// ROW-249   across the test clock; sent on 31 January for a weekday in the first half of the previous year: accepted.
// ROW-249 wrong product: no January exception at all; an exception as a rolling window (the last 31 days), which
// ROW-249   refuses a weekday of last spring on 31 January; an exception for December days only.
// ROW-249 given: a fresh year whose 30 and 31 December before it are weekdays; one fresh member per probe. when /
// ROW-249   then, each sick request accepted and listed pending:
// ROW-249   (a) 2 January 09:00 team (1 January 19:00 UTC): 30 to 31 December;
// ROW-249   (b) 2 January 13:30 team (1 January 23:30 UTC): 30 to 31 December;
// ROW-249   (c) 1 January 00:30 team (31 December 10:30 UTC): 30 to 31 December;
// ROW-249   (d) 31 January 09:00 team: a weekday in March of last year, and (31 January 13:30) one in May of last year.
// ROW-249 controls: the control case, on 2 January, sends a vacation for 31 December and it is refused — the window
// ROW-249   is live at this clock, so the acceptances are the sick exception's.
// ROW-249 technique: the row's own example values; the test clock at several instants of January (both sides of a
// ROW-249   UTC midnight, the month's first and last day); a fresh member per probe so no overlap can refuse one.
// ROW-249 cases: ROW-249 target=ROW-249.REQ-004.in-January-a-sick-request-for-last-years-weekdays-is-accepted control=ROW-249.control.in-January-a-vacation-for-last-December-is-refused
test('ROW-249.control.in-January-a-vacation-for-last-December-is-refused', async () => {
  const team = await setupTeam({ now: teamAt(day(Y, 1, 2)), allowances: [25] });
  try {
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: DEC31, lastDay: DEC31 });
    expect(isRuleRefusal(a), `ROW-249 control: on 2 January, a vacation for ${DEC31} is refused (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-249.REQ-004.in-January-a-sick-request-for-last-years-weekdays-is-accepted', async () => {
  const team = await setupTeam({ now: teamAt(day(Y, 1, 2)), allowances: [25, 25, 25, 25] });
  try {
    const march = weekdayOnOrAfter(day(Y - 1, 3, 10));
    const may = weekdayOnOrAfter(day(Y - 1, 5, 12));
    const probes: { at: string; label: string; i: number; firstDay: string; lastDay: string }[] = [
      { at: teamAt(day(Y, 1, 2), '09:00'), label: '(a) 2 January 09:00', i: 0, firstDay: DEC30, lastDay: DEC31 },
      { at: teamAt(day(Y, 1, 2), '13:30'), label: '(b) 2 January 13:30', i: 1, firstDay: DEC30, lastDay: DEC31 },
      { at: teamAt(day(Y, 1, 1), '00:30'), label: '(c) 1 January 00:30', i: 2, firstDay: DEC30, lastDay: DEC31 },
      { at: teamAt(day(Y, 1, 31), '09:00'), label: '(d) 31 January 09:00', i: 3, firstDay: march, lastDay: march },
      { at: teamAt(day(Y, 1, 31), '13:30'), label: '(d) 31 January 13:30', i: 3, firstDay: may, lastDay: may },
    ];
    for (const probe of probes) {
      const person = await at(team, probe.at, probe.i);
      try {
        const a = await trySend(person, { kind: 'sick', firstDay: probe.firstDay, lastDay: probe.lastDay });
        expect.soft(isAcceptance(a), `ROW-249 ${probe.label}: sick ${probe.firstDay}..${probe.lastDay} is accepted (got ${describe(a)})`).toBe(true);
        const listed = a.id === undefined ? undefined : (await ownRequests(person)).find((r) => String(r.id) === String(a.id));
        expect.soft(listed?.state, `ROW-249 ${probe.label}: it is listed pending`).toBe('pending');
      } finally {
        await person.dispose();
      }
    }
  } finally {
    await team.dispose();
  }
});
