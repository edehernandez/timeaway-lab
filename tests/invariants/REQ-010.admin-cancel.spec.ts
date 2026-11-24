// Purpose: ledger tests for ROW-049, ROW-050, ROW-051 and ROW-052 (REQ-010 arms 1 to 4) — the admin's cancel of an approved request gives back exactly its Monday-to-Friday days from today on (today in the team zone), only the admin cancels, and a request with no such day left is not changed.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, clock, accounts, requests, confirmed actions), fresh per run.
//
// ROW-049 promise: REQ-010 fail-if (1) "a day before today is returned to the allowance or taken off the calendar";
// ROW-049   A-007 (human): days already passed stay approved, counted and on the calendar; REQ-004: today is decided
// ROW-049   in the team's one time zone. The row's cases: approved weekdays yesterday, today and tomorrow, cancelled at
// ROW-049   an instant where the team date differs from the UTC date; yesterday stays, today and tomorrow leave; run
// ROW-049   across the test clock.
// ROW-049 wrong product: "today" read as the server's UTC date — in a zone ahead of UTC early in the team's
// ROW-049   Thursday, UTC still says Wednesday, so Wednesday is given back too; or the cancel simply cancels the whole
// ROW-049   request (state = cancelled), emptying the past day.
// ROW-049 given: a member (fresh allowance A) with an approved vacation Wed 9 to Fri 11 June 2027 (3 days). when:
// ROW-049   the admin cancels it with the clock at team Thursday 00:30 in Pacific/Auckland (UTC Wednesday), and, as
// ROW-049   a second case, at team Thursday 23:30 in Pacific/Honolulu (UTC Friday). then: Wednesday is still listed
// ROW-049   and Thursday and Friday are not; days left is A − 1; and the same holds after the clock moves on 11 days.
// ROW-049 controls: the control case shows the approved request listed on all three days with A − 3 left (the
// ROW-049   setup and the calendar are real); each target checks the clock instant's team and UTC dates differ.
// ROW-049 technique: the clock's origin — both sides of UTC, at instants where the team date and the UTC date
// ROW-049   differ, so a UTC-dated product fails one case or the other; the whole window compared, never part of it.
// ROW-049 cases: ROW-049 target=ROW-049.REQ-010.cancel-at-team-thursday-utc-wednesday-keeps-wednesday control=ROW-049.control.approved-wednesday-to-friday-listed-and-counted
//
// ROW-050 promise: REQ-010 fail-if (2) "a day from today on stays counted or stays on the calendar after the
// ROW-050   cancel"; A-007: cancelling removes its days from today on, returning them and taking them off the calendar.
// ROW-050 wrong product: "today" read as UTC — late in the team's Thursday in a zone behind UTC, UTC says Friday,
// ROW-050   so Thursday is kept as a past day; or the month query of the cancel touches only the first month, leaving
// ROW-050   the May days of an April-to-May request; or the calendar is updated but the balance is not.
// ROW-050 given: a member (fresh A) with two approved vacations: Thu 29 April to Tue 4 May 2027 (4 weekdays across
// ROW-050   a month boundary) and Mon 10 to Wed 12 May (3). when: at team Thursday 29 April 23:30 in Pacific/Honolulu
// ROW-050   (UTC Friday 30 April) the admin cancels both. then: none of the 7 days is listed and days left is A again;
// ROW-050   still so after the clock moves to 20 May.
// ROW-050 controls: the control case shows the 7 days listed and A − 7 left before any cancel.
// ROW-050 technique: today = the request's first day at a UTC-differing instant (the day just on the boundary),
// ROW-050   a month boundary inside the request, the whole window compared.
// ROW-050 cases: ROW-050 target=ROW-050.REQ-010.cancel-on-first-day-gives-back-every-day-from-today-on-across-months control=ROW-050.control.approved-days-from-today-on-listed-and-counted
//
// ROW-051 promise: REQ-010 fail-if (3) "anyone but the admin cancels an approved request"; A-007: only the admin
// ROW-051   can cancel an approved request; REQ-005: a person cannot cancel their own approved request.
// ROW-051 wrong product: the person's own cancel route checks ownership but not state, so a member cancels their
// ROW-051   approved request; or the admin cancel act trusts any session carrying a token.
// ROW-051 given: member 1's approved request (3 days) and member 2's approved request (1 day); the admin has read a
// ROW-051   real cancel token for each. when: member 1 cancels through the person's route and through the admin's
// ROW-051   effect-then-act path, replays the admin's token, on both requests; an anonymous caller does the same.
// ROW-051   then: every attempt is refused; both requests still listed on all their days; days left unchanged.
// ROW-051 controls: the control case shows a member's cancel of their own PENDING request is accepted, and the
// ROW-051   admin's cancel of an approved request is accepted — the routes work, so the refusals are about who/state.
// ROW-051 technique: the neighbouring entity (another member's request) and the admin's own token as the near miss.
// ROW-051 cases: ROW-051 target=ROW-051.REQ-010.member-and-anonymous-cannot-cancel-an-approved-request control=ROW-051.control.member-cancels-own-pending-and-admin-cancels-approved
//
// ROW-052 promise: REQ-010 "a request with no Monday to Friday day from today on cannot be cancelled", fail-if (4)
// ROW-052   "an approved request whose Monday to Friday days are all before today is changed by a cancel"; the row's
// ROW-052   cases: an approved Wednesday-to-Sunday request with today the Saturday — the cancel is refused and nothing
// ROW-052   is recorded; run across the test clock.
// ROW-052 wrong product: the guard asks "any day of the range from today on" (Saturday and Sunday count), so the
// ROW-052   cancel is accepted and a cancel is recorded on the request; or "today" is the UTC date — early on team
// ROW-052   Saturday in Auckland, UTC is still Friday, so Friday is given back.
// ROW-052 given: a member (fresh A) with an approved vacation Wed 9 to Sun 13 June 2027 (3 weekdays). when: the admin
// ROW-052   tries to cancel at team Saturday 00:30 in Pacific/Auckland (UTC Friday), and, as a second case, at team
// ROW-052   Saturday 23:30 in Pacific/Honolulu (UTC Sunday). then: the cancel is refused (effect or act not 2xx); the
// ROW-052   admin's two record views of the member (requests and history) are byte-identical before and after;
// ROW-052   Wednesday to Friday still listed; days left still A − 3.
// ROW-052 controls: the control case cancels the same request at team Friday: accepted, Friday leaves and Wednesday
// ROW-052   and Thursday stay — the cancel path is real and reached, so the refusal is about the days, not the route.
// ROW-052 technique: values either side of the deadline (Friday: allowed; Saturday: refused) and the clock's origin
// ROW-052   on both sides of UTC; "nothing recorded" as whole-body equality of the record views, not a chosen field.
// ROW-052 cases: ROW-052 target=ROW-052.REQ-010.cancel-refused-at-team-saturday-utc-friday control=ROW-052.control.cancel-at-team-friday-gives-back-friday-only
import { test, expect } from '@playwright/test';
import { approve, readEffect, sendRequest, setClock, type AccountId } from './harness';
import {
  AHEAD_ZONE,
  BEHIND_ZONE,
  actRaw,
  awayDays,
  figures,
  freshInt,
  ok,
  personRecords,
  startTeam,
  teamDateOf,
  teamInstant,
  tryConfirmed,
  tryOwnCancel,
  utcDateOf,
  weekdaysBetween,
  withAnonymous,
  type Team,
} from './time-off';

/** Sets the clock to team `date` `time` in `zone` and checks the instant's team date is `date` and its UTC date is not. */
async function moveClockTo(zone: string, date: string, time: string): Promise<void> {
  const instant = teamInstant(zone, date, time);
  expect(teamDateOf(instant, zone), `setup: ${instant} is team date ${date} in ${zone}`).toBe(date);
  expect(utcDateOf(instant), `setup: ${instant}'s UTC date differs from the team date ${date}`).not.toBe(date);
  await setClock(instant);
}

const JUNE_WINDOW = weekdaysBetween('2027-06-07', '2027-06-18');

/** A team in `zone` at Monday 7 June 2027 09:00, one member (fresh A) with an approved vacation `first`..`last`. */
async function approvedJune(zone: string, first: string, last: string): Promise<{ team: Team; A: number; id: AccountId }> {
  const A = freshInt(10, 30);
  const team = await startTeam({ timeZone: zone, now: teamInstant(zone, '2027-06-07', '09:00'), allowances: [A] });
  const id = await sendRequest(team.sessions[0], { kind: 'vacation', firstDay: first, lastDay: last });
  await approve(team.admin, id);
  return { team, A, id };
}

// ----------------------------------------------------------------------------------------------- ROW-049

test('ROW-049.control.approved-wednesday-to-friday-listed-and-counted', async () => {
  const { team, A } = await approvedJune(AHEAD_ZONE, '2027-06-09', '2027-06-11');
  try {
    expect(await awayDays(team.admin, team.members[0].id, JUNE_WINDOW), 'ROW-049 control: listed Wednesday to Friday').toEqual([
      '2027-06-09',
      '2027-06-10',
      '2027-06-11',
    ]);
    expect(await figures(team.sessions[0], [2027]), 'ROW-049 control: 3 days counted').toEqual({ 2027: { daysLeft: A - 3, pending: 0 } });
  } finally {
    await team.close();
  }
});

async function cancelAtThursday(zone: string, time: string): Promise<void> {
  const { team, A, id } = await approvedJune(zone, '2027-06-09', '2027-06-11');
  try {
    const member = team.members[0];
    const session = team.sessions[0];
    await moveClockTo(zone, '2027-06-10', time);
    expect(await awayDays(team.admin, member.id, JUNE_WINDOW), `ROW-049 ${zone} before: listed Wednesday to Friday`).toEqual([
      '2027-06-09',
      '2027-06-10',
      '2027-06-11',
    ]);

    const c = await tryConfirmed(team.admin.api, 'cancel', id);
    expect(c.accepted, `ROW-049 ${zone}: the admin's cancel is accepted (effect ${c.effectStatus}, act ${c.actStatus})`).toBe(true);

    expect.soft(await awayDays(team.admin, member.id, JUNE_WINDOW), `ROW-049 ${zone} after: only yesterday (Wednesday) stays listed`).toEqual(['2027-06-09']);
    expect.soft(await figures(session, [2027]), `ROW-049 ${zone} after: yesterday stays counted, today and tomorrow are given back`).toEqual({
      2027: { daysLeft: A - 1, pending: 0 },
    });

    await setClock(teamInstant(zone, '2027-06-21', '09:00'));
    expect.soft(await awayDays(team.admin, member.id, JUNE_WINDOW), `ROW-049 ${zone} later: Wednesday still listed, Thursday and Friday not`).toEqual(['2027-06-09']);
    expect(await figures(session, [2027]), `ROW-049 ${zone} later: still A − 1`).toEqual({ 2027: { daysLeft: A - 1, pending: 0 } });
  } finally {
    await team.close();
  }
}

test('ROW-049.REQ-010.cancel-at-team-thursday-utc-wednesday-keeps-wednesday', async () => {
  await cancelAtThursday(AHEAD_ZONE, '00:30');
});

test('ROW-049.REQ-010.cancel-at-team-thursday-utc-friday-keeps-wednesday', async () => {
  await cancelAtThursday(BEHIND_ZONE, '23:30');
});

// ----------------------------------------------------------------------------------------------- ROW-050

const SPRING_WINDOW = weekdaysBetween('2027-04-26', '2027-05-21');
const SPRING_DAYS = ['2027-04-29', '2027-04-30', '2027-05-03', '2027-05-04', '2027-05-10', '2027-05-11', '2027-05-12'];

async function approvedSpring(): Promise<{ team: Team; A: number; ids: AccountId[] }> {
  const A = freshInt(10, 30);
  const team = await startTeam({ timeZone: BEHIND_ZONE, now: teamInstant(BEHIND_ZONE, '2027-04-26', '09:00'), allowances: [A] });
  const s = team.sessions[0];
  const ids = [
    await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-29', lastDay: '2027-05-04' }),
    await sendRequest(s, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-12' }),
  ];
  for (const id of ids) await approve(team.admin, id);
  return { team, A, ids };
}

test('ROW-050.control.approved-days-from-today-on-listed-and-counted', async () => {
  const { team, A } = await approvedSpring();
  try {
    expect(await awayDays(team.admin, team.members[0].id, SPRING_WINDOW), 'ROW-050 control: all 7 approved days listed').toEqual(SPRING_DAYS);
    expect(await figures(team.sessions[0], [2027]), 'ROW-050 control: 7 days counted').toEqual({ 2027: { daysLeft: A - 7, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-050.REQ-010.cancel-on-first-day-gives-back-every-day-from-today-on-across-months', async () => {
  const { team, A, ids } = await approvedSpring();
  try {
    const member = team.members[0];
    const session = team.sessions[0];
    await moveClockTo(BEHIND_ZONE, '2027-04-29', '23:30');
    expect(await awayDays(team.admin, member.id, SPRING_WINDOW), 'ROW-050 before: all 7 days listed').toEqual(SPRING_DAYS);

    for (const id of ids) {
      const c = await tryConfirmed(team.admin.api, 'cancel', id);
      expect(c.accepted, `ROW-050: the admin's cancel of request ${id} is accepted (effect ${c.effectStatus}, act ${c.actStatus})`).toBe(true);
    }

    expect.soft(await awayDays(team.admin, member.id, SPRING_WINDOW), 'ROW-050 after: no day from today on stays listed, in April or May').toEqual([]);
    expect.soft(await figures(session, [2027]), 'ROW-050 after: every day from today on is given back').toEqual({ 2027: { daysLeft: A, pending: 0 } });

    await setClock(teamInstant(BEHIND_ZONE, '2027-05-20', '09:00'));
    expect.soft(await awayDays(team.admin, member.id, SPRING_WINDOW), 'ROW-050 later: still none listed').toEqual([]);
    expect(await figures(session, [2027]), 'ROW-050 later: still A').toEqual({ 2027: { daysLeft: A, pending: 0 } });
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-051

test('ROW-051.control.member-cancels-own-pending-and-admin-cancels-approved', async () => {
  const { team, A, id } = await approvedJune(AHEAD_ZONE, '2027-06-14', '2027-06-16');
  try {
    const session = team.sessions[0];
    const pending = await sendRequest(session, { kind: 'vacation', firstDay: '2027-06-18', lastDay: '2027-06-18' });
    expect(await figures(session, [2027]), 'ROW-051 control: 3 approved, 1 pending').toEqual({ 2027: { daysLeft: A - 3, pending: 1 } });
    const own = await tryOwnCancel(session.api, pending);
    expect(ok(own), `ROW-051 control: the member cancels their own pending request (${own})`).toBe(true);
    const c = await tryConfirmed(team.admin.api, 'cancel', id);
    expect(c.accepted, `ROW-051 control: the admin cancels the approved request (effect ${c.effectStatus}, act ${c.actStatus})`).toBe(true);
    expect(await figures(session, [2027]), 'ROW-051 control: everything given back').toEqual({ 2027: { daysLeft: A, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-051.REQ-010.member-and-anonymous-cannot-cancel-an-approved-request', async () => {
  const A1 = freshInt(10, 30);
  const A2 = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: teamInstant(AHEAD_ZONE, '2027-06-07', '09:00'), allowances: [A1, A2] });
  try {
    const [m1, m2] = team.members;
    const [s1, s2] = team.sessions;
    const own = await sendRequest(s1, { kind: 'vacation', firstDay: '2027-06-14', lastDay: '2027-06-16' });
    const other = await sendRequest(s2, { kind: 'vacation', firstDay: '2027-06-17', lastDay: '2027-06-17' });
    await approve(team.admin, own);
    await approve(team.admin, other);

    for (const [label, id] of [['own', own], ['another person\'s', other]] as const) {
      const adminToken = (await readEffect(team.admin, 'cancel', id)).token;
      const personal = await tryOwnCancel(s1.api, id);
      expect.soft(ok(personal), `ROW-051 member cancels their ${label} approved request through the person's route (${personal})`).toBe(false);
      const t = await tryConfirmed(s1.api, 'cancel', id);
      expect.soft(t.accepted, `ROW-051 member cancels their ${label} approved request through the admin's path (effect ${t.effectStatus}, act ${t.actStatus})`).toBe(false);
      const replay = await actRaw(s1.api, 'cancel', id, adminToken);
      expect.soft(ok(replay), `ROW-051 member cancels their ${label} approved request with the admin's real token (${replay})`).toBe(false);
      await withAnonymous(async (anon) => {
        const p = await tryOwnCancel(anon, id);
        expect.soft(ok(p), `ROW-051 anonymous cancels the ${label} approved request through the person's route (${p})`).toBe(false);
        const r = await actRaw(anon, 'cancel', id, adminToken);
        expect.soft(ok(r), `ROW-051 anonymous cancels the ${label} approved request with the admin's real token (${r})`).toBe(false);
      });
    }

    expect.soft(await awayDays(team.admin, m1.id, JUNE_WINDOW),'ROW-051 after: member 1 still listed on all 3 days').toEqual([
      '2027-06-14',
      '2027-06-15',
      '2027-06-16',
    ]);
    expect.soft(await awayDays(team.admin, m2.id, JUNE_WINDOW), 'ROW-051 after: member 2 still listed').toEqual(['2027-06-17']);
    expect.soft(await figures(s1, [2027]), 'ROW-051 after: member 1\'s 3 days still counted').toEqual({ 2027: { daysLeft: A1 - 3, pending: 0 } });
    expect(await figures(s2, [2027]), 'ROW-051 after: member 2\'s day still counted').toEqual({ 2027: { daysLeft: A2 - 1, pending: 0 } });
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-052

test('ROW-052.control.cancel-at-team-friday-gives-back-friday-only', async () => {
  const { team, A, id } = await approvedJune(AHEAD_ZONE, '2027-06-09', '2027-06-13');
  try {
    await setClock(teamInstant(AHEAD_ZONE, '2027-06-11', '12:00'));
    const c = await tryConfirmed(team.admin.api, 'cancel', id);
    expect(c.accepted, `ROW-052 control: a cancel with Friday still to come is accepted (effect ${c.effectStatus}, act ${c.actStatus})`).toBe(true);
    expect(await awayDays(team.admin, team.members[0].id, JUNE_WINDOW), 'ROW-052 control: Wednesday and Thursday stay, Friday leaves').toEqual([
      '2027-06-09',
      '2027-06-10',
    ]);
    expect(await figures(team.sessions[0], [2027]), 'ROW-052 control: Friday given back').toEqual({ 2027: { daysLeft: A - 2, pending: 0 } });
  } finally {
    await team.close();
  }
});

async function cancelAtSaturday(zone: string, time: string): Promise<void> {
  const { team, A, id } = await approvedJune(zone, '2027-06-09', '2027-06-13');
  try {
    const member = team.members[0];
    await moveClockTo(zone, '2027-06-12', time);
    const before = await personRecords(team.admin, member.id);
    expect(await awayDays(team.admin, member.id, JUNE_WINDOW), `ROW-052 ${zone} before: listed Wednesday to Friday`).toEqual([
      '2027-06-09',
      '2027-06-10',
      '2027-06-11',
    ]);

    const c = await tryConfirmed(team.admin.api, 'cancel', id);
    expect.soft(c.accepted, `ROW-052 ${zone}: the cancel is refused with no weekday from today on (effect ${c.effectStatus}, act ${c.actStatus})`).toBe(false);

    const after = await personRecords(team.admin, member.id);
    expect.soft(after.requests, `ROW-052 ${zone}: nothing is recorded on the member's requests`).toBe(before.requests);
    expect.soft(after.history, `ROW-052 ${zone}: nothing is recorded in the member's history`).toBe(before.history);
    expect.soft(await awayDays(team.admin, member.id, JUNE_WINDOW), `ROW-052 ${zone} after: still listed Wednesday to Friday`).toEqual([
      '2027-06-09',
      '2027-06-10',
      '2027-06-11',
    ]);
    expect(await figures(team.sessions[0], [2027]), `ROW-052 ${zone} after: still 3 days counted`).toEqual({ 2027: { daysLeft: A - 3, pending: 0 } });
  } finally {
    await team.close();
  }
}

test('ROW-052.REQ-010.cancel-refused-at-team-saturday-utc-friday', async () => {
  await cancelAtSaturday(AHEAD_ZONE, '00:30');
});

test('ROW-052.REQ-010.cancel-refused-at-team-saturday-utc-sunday', async () => {
  await cancelAtSaturday(BEHIND_ZONE, '23:30');
});
