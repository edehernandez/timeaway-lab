// Purpose: ledger tests for ROW-024, ROW-250 and ROW-246 (REQ-005, REQ-017) — a person never cancels their own approved, rejected or cancelled request, nor a pending one with a weekday before today (the admin decides it), while a pending one whose only past days are a weekend is cancelled cleanly, recorded with who and when and no cancel day.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, own cancel, the admin's two-step actions, the test clock), fresh per run.
import { test, expect } from '@playwright/test';
import { adminCancel, approve, cancelOwnRequest, reject, sendRequest, type AccountId, type Actor } from './harness';
import {
  addDays,
  day,
  describe,
  isAwayOn,
  isRuleRefusal,
  moveClock,
  onOrAfter,
  ownRequest,
  pickYear,
  randomInt,
  setupTeam,
  teamAt,
  tryCancel,
  weekdaySpan,
  weekdaysIn,
  yearBalance,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);

// ROW-024 promise: REQ-005 fail-if (4) "a person cancels their own approved, rejected or cancelled request"; A-007
// ROW-024   ("only the admin can cancel an approved request").
// ROW-024 wrong product: an own-cancel route that checks only the owner, not the state — it turns an approved request
// ROW-024   cancelled (giving its days back without the admin), or rewrites a rejected or cancelled one.
// ROW-024 given: today a Wednesday; a member with a fresh allowance A holding R1 approved (3 future weekdays), R2
// ROW-024   rejected, R3 cancelled by the member, R4 approved then cancelled whole by the admin. when: the member asks
// ROW-024   to cancel each. then: each is refused with a rule's refusal; each is still listed in its state (approved,
// ROW-024   rejected, cancelled, cancelled); the year still reads {A − 3, 0}; R1's days are still on the calendar.
// ROW-024 controls: the control case has the member cancel their own pending request and it is cancelled — the route
// ROW-024   and the session work, so the target's refusals are about the state.
// ROW-024 technique: every forbidden state, each reached through the product's own actions; the store, balance and
// ROW-024   calendar after, not only the status.
// ROW-024 cases: ROW-024 target=ROW-024.REQ-005.a-person-never-cancels-their-own-approved-rejected-or-cancelled-request control=ROW-024.control.the-member-cancels-their-own-pending-request
test('ROW-024.control.the-member-cancels-their-own-pending-request', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const id = await sendRequest(p, { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 7), 2) });
    const a = await tryCancel(p, id);
    expect.soft(a.ok, `ROW-024 control: the cancel answers 2xx (got ${describe(a)})`).toBe(true);
    expect.soft((await ownRequest(p, id))?.state, 'ROW-024 control: cancelled').toBe('cancelled');
  } finally {
    await team.dispose();
  }
});

test('ROW-024.REQ-005.a-person-never-cancels-their-own-approved-rejected-or-cancelled-request', async () => {
  const A = randomInt(10, 20);
  const team = await setupTeam({ now: NOW, allowances: [A] });
  const [p] = team.people;
  const [m] = team.members;
  const admin = team.admin;
  try {
    const r1Days = weekdaySpan(addDays(TODAY, 7), 3);
    const r1 = await sendRequest(p, { kind: 'vacation', ...r1Days });
    await approve(admin, r1);
    const r2 = await sendRequest(p, { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 14), 2) });
    await reject(admin, r2);
    const r3 = await sendRequest(p, { kind: 'sick', ...weekdaySpan(addDays(TODAY, 21), 2) });
    await cancelOwnRequest(p, r3);
    const r4 = await sendRequest(p, { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 28), 2) });
    await approve(admin, r4);
    await adminCancel(admin, r4);

    const cases: [string, AccountId, string][] = [
      ['R1 approved', r1, 'approved'],
      ['R2 rejected', r2, 'rejected'],
      ['R3 cancelled by the member', r3, 'cancelled'],
      ['R4 cancelled by the admin', r4, 'cancelled'],
    ];
    const got: string[] = [];
    const want: string[] = [];
    for (const [label, id, state] of cases) {
      const a = await tryCancel(p, id);
      const after = (await ownRequest(p, id))?.state;
      got.push(`${label}: ${isRuleRefusal(a) ? 'refused' : describe(a)}, now ${after}`);
      want.push(`${label}: refused, now ${state}`);
    }
    expect.soft(got, 'ROW-024: each own cancel is refused and changes nothing').toEqual(want);
    expect.soft(await yearBalance(p, Y), "ROW-024: R1's days are still taken").toEqual({ daysLeft: A - 3, pending: 0 });
    const missing: string[] = [];
    for (const d of weekdaysIn(r1Days.firstDay, r1Days.lastDay)) if (!(await isAwayOn(p, m, d))) missing.push(d);
    expect.soft(missing, "ROW-024: R1's days are still on the calendar").toEqual([]);
  } finally {
    await team.dispose();
  }
});

// ROW-250 promise: REQ-005 fail-if (5) "a person cancels their own pending request that has a weekday before today";
// ROW-250   A-038 ("the admin approves or rejects it"); the row's cases: run across the test clock; the refusal says the
// ROW-250   admin decides it. Today is the team zone's (D-007).
// ROW-250 wrong product: a limit on the first day only as of sending; a "day before today" read in UTC (a day behind
// ROW-250   before 14:00 team time); a limit that ignores sick requests sent for past days; a bare refusal.
// ROW-250 given: today a Wednesday 09:00 team. Member 1 sends a vacation Wednesday to Friday; member 2 a vacation
// ROW-250   Friday to Tuesday. when / then, each cancel refused with a rule's refusal whose text names the admin, the
// ROW-250   request still listed pending and its days still pending: (a) the clock at Thursday 09:00 team (Wednesday 19:00
// ROW-250   UTC), member 1 cancels; (b) the clock at Saturday 09:00 team, member 2 cancels (its Friday is past);
// ROW-250   (c) the same Saturday, member 3 sends a sick request for Wednesday to Thursday just past and cancels it.
// ROW-250 controls: the control case, at the Thursday, has member 1 cancel a second request of theirs for the week
// ROW-250   after and it is cancelled — the cancel works at the moved clock, so the refusals are about the past weekday.
// ROW-250 technique: the clock's origin — the moved instant is one where UTC still reads the request's first day;
// ROW-250   three ways to have a past weekday (time passing, a weekend between, a sick request sent late).
// ROW-250 cases: ROW-250 target=ROW-250.REQ-005.a-person-never-cancels-their-own-pending-request-with-a-weekday-before-today control=ROW-250.control.a-pending-request-with-no-past-weekday-is-cancelled-at-the-moved-clock
test('ROW-250.control.a-pending-request-with-no-past-weekday-is-cancelled-at-the-moved-clock', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const later = await sendRequest(p, { kind: 'vacation', firstDay: addDays(TODAY, 7), lastDay: addDays(TODAY, 8) });
    await moveClock(team, teamAt(addDays(TODAY, 1)));
    const a = await tryCancel(p, later);
    expect.soft(a.ok, `ROW-250 control: the cancel answers 2xx (got ${describe(a)})`).toBe(true);
    expect.soft((await ownRequest(p, later))?.state, 'ROW-250 control: cancelled').toBe('cancelled');
  } finally {
    await team.dispose();
  }
});

test('ROW-250.REQ-005.a-person-never-cancels-their-own-pending-request-with-a-weekday-before-today', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25, 25] });
  const [p1, p2, p3] = team.people;
  try {
    const fri = addDays(TODAY, 2);
    const r1 = await sendRequest(p1, { kind: 'vacation', firstDay: TODAY, lastDay: fri });
    const r2 = await sendRequest(p2, { kind: 'vacation', firstDay: fri, lastDay: addDays(fri, 4) });

    const got: string[] = [];
    const want: string[] = [];
    const probe = async (label: string, who: Actor, id: AccountId, pendingDays: number) => {
      const a = await tryCancel(who, id);
      const verdict = isRuleRefusal(a) ? (/admin/i.test(a.text) ? 'refused naming the admin' : `refused without naming the admin: ${describe(a)}`) : describe(a);
      const state = (await ownRequest(who, id))?.state;
      const pending = (await yearBalance(who, Y)).pending;
      got.push(`${label}: ${verdict}; ${state}; pending ${pending}`);
      want.push(`${label}: refused naming the admin; pending; pending ${pendingDays}`);
    };

    await moveClock(team, teamAt(addDays(TODAY, 1)));
    await probe('(a) Thursday, Wednesday-to-Friday vacation', p1, r1, 3);
    await moveClock(team, teamAt(addDays(TODAY, 3)));
    await probe('(b) Saturday, Friday-to-Tuesday vacation', p2, r2, 3);
    const r3 = await sendRequest(p3, { kind: 'sick', firstDay: TODAY, lastDay: addDays(TODAY, 1) });
    await probe('(c) Saturday, sick request sent for Wednesday to Thursday', p3, r3, 0);
    expect(got, 'ROW-250: each cancel is refused, names the admin, and changes nothing').toEqual(want);
  } finally {
    await team.dispose();
  }
});

// ROW-246 promise: REQ-005 "a person can cancel their own request while it is pending and has no weekday before
// ROW-246   today; it becomes cancelled"; REQ-017 "a request holds … who cancelled it and when and the Monday to Friday
// ROW-246   day its cancel takes effect from" — a whole cancel has no such day (fail-if (4): a cancel records who and
// ROW-246   when); the row's case: on a Sunday, the person cancels their own pending request running from the Saturday
// ROW-246   just past to the following Friday; it is stored cancelled.
// ROW-246 wrong product: a limit on the first day rather than the first weekday (the past Saturday refuses it); a
// ROW-246   cancel that treats it as partial and stores a cancel day (Sunday or Monday), or stores no who or when.
// ROW-246 given: a Friday 09:00 team; a member sends a vacation Saturday to the next Friday (5 weekdays). when: the
// ROW-246   clock moves to the Sunday 09:00 team and the member cancels it. then: the cancel answers 2xx; the request is
// ROW-246   listed "cancelled"; among its fields whose name speaks of cancel, one holds the member (id or name), one holds
// ROW-246   an instant within a day and a half of the Sunday's clock, and none holds a day (YYYY-MM-DD) or is a non-empty
// ROW-246   field named for a day or a "from"; the year reads 0 pending.
// ROW-246 controls: the control case shows the harmful case is reached: on the Sunday, before cancelling, the
// ROW-246   request is listed pending with its 5 weekdays pending and its Saturday already past.
// ROW-246 technique: the boundary (the only past days are a weekend); the stored record read after, field by field,
// ROW-246   by name pattern since D-029 does not name the cancel fields (stated here, so a reader sees the reading).
// ROW-246 cases: ROW-246 target=ROW-246.REQ-005.on-a-Sunday-a-request-whose-past-days-are-a-weekend-is-cancelled-with-who-and-when-and-no-day control=ROW-246.control.on-the-Sunday-the-request-is-still-pending
const FRIDAY = addDays(TODAY, 2);
const SATURDAY = addDays(FRIDAY, 1);
const SUNDAY = addDays(FRIDAY, 2);

async function sundayWithPending() {
  const team = await setupTeam({ now: teamAt(FRIDAY), allowances: [25] });
  const id = await sendRequest(team.people[0], { kind: 'vacation', firstDay: SATURDAY, lastDay: addDays(SATURDAY, 6) });
  await moveClock(team, teamAt(SUNDAY));
  return { team, id };
}

function flatten(v: unknown, prefix = ''): [string, unknown][] {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flatten(x, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, v]];
}

test('ROW-246.control.on-the-Sunday-the-request-is-still-pending', async () => {
  const { team, id } = await sundayWithPending();
  const [p] = team.people;
  try {
    expect.soft((await ownRequest(p, id))?.state, 'ROW-246 control: pending on the Sunday').toBe('pending');
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-246 control: its 5 weekdays are pending').toBe(5);
  } finally {
    await team.dispose();
  }
});

test('ROW-246.REQ-005.on-a-Sunday-a-request-whose-past-days-are-a-weekend-is-cancelled-with-who-and-when-and-no-day', async () => {
  const { team, id } = await sundayWithPending();
  const [p] = team.people;
  const [m] = team.members;
  try {
    const a = await tryCancel(p, id);
    expect.soft(a.ok, `ROW-246: the cancel answers 2xx (got ${describe(a)})`).toBe(true);
    const r = await ownRequest(p, id);
    expect.soft(r?.state, 'ROW-246: stored cancelled').toBe('cancelled');

    const fields = flatten(r?.raw ?? {}).filter(([k]) => /cancel/i.test(k));
    const sundayAt = Date.parse(teamAt(SUNDAY));
    const instantOf = (v: unknown): number => {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return Date.parse(v.replace(' ', 'T'));
      if (typeof v === 'number' && v > 1e12) return v;
      if (typeof v === 'number' && v > 1e9) return v * 1000;
      return NaN;
    };
    const who = fields.filter(([k, v]) => !/day|from|effective/i.test(k) && (String(v) === String(m.id) || v === m.name));
    const when = fields.filter(([, v]) => Math.abs(instantOf(v) - sundayAt) <= 36 * 3_600_000);
    const days = fields.filter(
      ([k, v]) =>
        (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) || (/day|from|effective/i.test(k) && v !== null && v !== undefined && v !== ''),
    );
    expect.soft(who.length, `ROW-246: a cancel field holds the member (cancel fields: ${JSON.stringify(fields)})`).toBeGreaterThan(0);
    expect.soft(when.length, `ROW-246: a cancel field holds when, the Sunday's instant (cancel fields: ${JSON.stringify(fields)})`).toBeGreaterThan(0);
    expect.soft(days, 'ROW-246: no cancel day is stored').toEqual([]);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-246: nothing is pending').toBe(0);
  } finally {
    await team.dispose();
  }
});
