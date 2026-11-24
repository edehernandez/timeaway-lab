// Purpose: ledger test for ROW-020 (REQ-004) — today, the current year and the next year are read from the date in the team's time zone at the moment a request is sent, on both sides of midnight and across New Year, with the team zone (UTC+14) far from the server's UTC.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, the test clock), fresh per run.
//
// ROW-020 promise: REQ-004 fail-if (6) "a request is accepted or refused differently from how it would be if today,
// ROW-020   the current year and the next year were all read from the date in the team's time zone at the moment it is
// ROW-020   sent"; CON-003, A-019, D-007 (today computed on the server in the team zone); the row's cases: the team zone
// ROW-020   far from the server zone (UTC+14 against UTC), the test clock at instants where the two dates differ, on both
// ROW-020   sides of midnight and across 31 December to 1 January.
// ROW-020 wrong product: one that reads today with the server's local date (UTC), or the date at start-up, or the
// ROW-020   year with getFullYear() on the server — a day and, at New Year, a year behind the team before 14:00 team time.
// ROW-020 given: the team zone Pacific/Kiritimati (UTC+14); a year whose 31 December is a weekday; a fresh member per
// ROW-020   probe so no earlier probe's request can be what refuses a later one. when / then, each sent at its instant:
// ROW-020   (a) Wednesday 00:30 team (Tuesday 10:30 UTC): a vacation for Tuesday is refused;
// ROW-020   (b) Wednesday 13:30 team (Tuesday 23:30 UTC): a vacation for Tuesday is refused;
// ROW-020   (c) Tuesday 23:30 team (Tuesday 09:30 UTC), before the team's midnight: a vacation for Tuesday is accepted;
// ROW-020   (d) 1 January 00:30 team (31 December 10:30 UTC): a vacation in January of the year after the new one is
// ROW-020       accepted (it is next year now) and a vacation for 31 December is refused (yesterday, last year);
// ROW-020   (e) 1 January 13:30 team (31 December 23:30 UTC): the same, on February of the year after and 31 December;
// ROW-020   (f) 31 December 23:30 team (31 December 09:30 UTC), before New Year: a vacation for 31 December is accepted
// ROW-020       and one in January of the year after next is refused.
// ROW-020 controls: the control case resets at Tuesday 23:30 team and a vacation for that Tuesday is accepted — the
// ROW-020   install takes the clock and the zone, so the target's refusals are about the reading of today.
// ROW-020 technique: the clock's origin — instants on both sides of the team's midnight and of New Year, chosen where
// ROW-020   the team's date and UTC's differ; the expectation computed by this file's own date arithmetic, never the product's.
// ROW-020 cases: ROW-020 target=ROW-020.REQ-004.today-and-the-years-are-the-team-zones-at-the-moment-of-sending control=ROW-020.control.the-install-takes-the-team-clock
import { test, expect } from '@playwright/test';
import { setClock, signInMember } from './harness';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  isWeekday,
  onOrAfter,
  pickYear,
  setupTeam,
  teamAt,
  trySend,
  utcDateOf,
  weekdayOnOrAfter,
  type Answer,
} from './request-rules';

const Y = pickYear((y) => isWeekday(day(y, 12, 31)) && y <= 2056);
const WED = onOrAfter(day(Y, 3, 2), 3);
const TUE = addDays(WED, -1);
const DEC31 = day(Y, 12, 31);
const JAN1 = day(Y + 1, 1, 1);

test('ROW-020.control.the-install-takes-the-team-clock', async () => {
  const team = await setupTeam({ now: teamAt(TUE, '23:30'), allowances: [25] });
  try {
    const a = await trySend(team.people[0], { kind: 'vacation', firstDay: TUE, lastDay: TUE });
    expect(isAcceptance(a), `ROW-020 control: at Tuesday 23:30 team time a vacation for Tuesday is accepted (got ${describe(a)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-020.REQ-004.today-and-the-years-are-the-team-zones-at-the-moment-of-sending', async () => {
  // One fresh member per probe, made at the install; each signs in afresh after the clock has moved to its instant.
  const team = await setupTeam({ now: teamAt(WED, '00:30'), allowances: [25, 25, 25, 25, 25, 25] });
  const verdict = (a: Answer) => (isAcceptance(a) ? 'accepted' : isRuleRefusal(a) ? 'refused' : `other: ${describe(a)}`);
  try {
    const probes: { at: string; label: string; sends: { firstDay: string; lastDay: string; expected: 'accepted' | 'refused' }[] }[] = [
      { at: teamAt(WED, '00:30'), label: '(a) Wednesday 00:30 team', sends: [{ firstDay: TUE, lastDay: TUE, expected: 'refused' }] },
      { at: teamAt(WED, '13:30'), label: '(b) Wednesday 13:30 team', sends: [{ firstDay: TUE, lastDay: TUE, expected: 'refused' }] },
      { at: teamAt(TUE, '23:30'), label: '(c) Tuesday 23:30 team', sends: [{ firstDay: TUE, lastDay: TUE, expected: 'accepted' }] },
      {
        at: teamAt(JAN1, '00:30'),
        label: '(d) 1 January 00:30 team',
        sends: [
          { ...oneDay(weekdayOnOrAfter(day(Y + 2, 1, 5))), expected: 'accepted' },
          { ...oneDay(DEC31), expected: 'refused' },
        ],
      },
      {
        at: teamAt(JAN1, '13:30'),
        label: '(e) 1 January 13:30 team',
        sends: [
          { ...oneDay(weekdayOnOrAfter(day(Y + 2, 2, 5))), expected: 'accepted' },
          { ...oneDay(DEC31), expected: 'refused' },
        ],
      },
      {
        at: teamAt(DEC31, '23:30'),
        label: '(f) 31 December 23:30 team',
        sends: [
          { ...oneDay(DEC31), expected: 'accepted' },
          { ...oneDay(weekdayOnOrAfter(day(Y + 2, 1, 5))), expected: 'refused' },
        ],
      },
    ];
    // The oracle's own check of the instants: (a), (b), (d), (e) are where the team's date and UTC's differ.
    expect([probes[0], probes[1], probes[3], probes[4]].map((p) => utcDateOf(p.at)), 'ROW-020: UTC reads the day before').toEqual([
      TUE,
      TUE,
      DEC31,
      DEC31,
    ]);

    const got: string[] = [];
    const want: string[] = [];
    for (const [i, probe] of probes.entries()) {
      await setClock(probe.at);
      const person = await signInMember(team.members[i]);
      try {
        for (const s of probe.sends) {
          const a = await trySend(person, { kind: 'vacation', firstDay: s.firstDay, lastDay: s.lastDay });
          got.push(`${probe.label}: vacation ${s.firstDay} ${verdict(a)}`);
          want.push(`${probe.label}: vacation ${s.firstDay} ${s.expected}`);
        }
      } finally {
        await person.dispose();
      }
    }
    expect(got, 'ROW-020: every probe is decided by the team zone’s date at the moment of sending').toEqual(want);
  } finally {
    await team.dispose();
  }
});

function oneDay(d: string) {
  return { firstDay: d, lastDay: d };
}
