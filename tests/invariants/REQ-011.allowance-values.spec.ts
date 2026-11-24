// Purpose: ledger tests for ROW-053, ROW-055, ROW-056 and ROW-057 (REQ-011 arms 1, 3, 4 and 5) — an allowance is a whole number of days, zero or more; changing it never touches an approved request, may go below the approved days, and a mid-year joiner or change gets the full number set.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, clock, accounts, allowances, requests, confirmed actions), fresh per run.
//
// ROW-053 promise: REQ-011 "a whole number of days, zero or more", fail-if (1) "an allowance that is negative or not
// ROW-053   a whole number is accepted"; the row's cases: 0 is accepted; 10abc is refused. Both doors that take an
// ROW-053   allowance (D-029: the account's creation and the allowance change) are the harm class.
// ROW-053 wrong product: parseInt("10abc") = 10 stored; Number(2.5) stored or rounded; a "min 1" rule refusing 0;
// ROW-053   validation on the change route but not on creation (or for "starts this year" but not "next year").
// ROW-053 given: a member with a fresh allowance A. when: the admin sends "10abc", a fresh "<n>abc", -1, 2.5, -0.5,
// ROW-053   null and "" as the allowance, starting this year and starting next year, and creates accounts with
// ROW-053   "10abc", -1 and 2.5; then sends 0, and creates an account with 0. then: every bad value is refused and
// ROW-053   the member's days left stay A for both years; no account exists for the refused creations (their
// ROW-053   credentials do not sign in); 0 is accepted on both doors and the member's days left become 0.
// ROW-053 controls: the control case shows a fresh whole allowance B is accepted and days left become B — the route
// ROW-053   works and its effect is observable, so the refusals are about the value.
// ROW-053 technique: values just either side of the limit (0 accepted, -1 and -0.5 refused), the row's own example
// ROW-053   values (0, 10abc), fresh near misses, both doors.
// ROW-053 cases: ROW-053 target=ROW-053.REQ-011.zero-accepted-negative-or-not-whole-refused control=ROW-053.control.a-whole-allowance-is-accepted-and-shown
//
// ROW-055 promise: REQ-011 "no change alters an approved request", fail-if (3) "a changed allowance changes,
// ROW-055   cancels or shortens an approved request"; A-018: approved requests are never changed by it.
// ROW-055 wrong product: lowering the allowance "re-validates" approved vacation and cancels or trims what no longer
// ROW-055   fits (the newest days first), or re-kinds it; a next-year change does that to next year's request.
// ROW-055 given: a member (fresh A) with approved requests: vacation Mon 5 to Fri 9 April 2027 (5), sick Mon 12 to
// ROW-055   Tue 13 April, vacation Mon 7 to Tue 8 February 2028 (2). when: the admin lowers this year's allowance to
// ROW-055   3, sets next year's to A + 3, and raises this year's to A + 5. then: after each change every approved day
// ROW-055   is still listed (7 in 2027, 2 in 2028), nothing is pending, and days left is the new allowance minus the
// ROW-055   same approved count (3 − 5 = −2, then (A + 3) − 2 for 2028, then (A + 5) − 5 = A for 2027).
// ROW-055 controls: the control case shows the approved days listed and A − 5 / A − 2 left before any change.
// ROW-055 technique: before/after for each change, the whole window compared, days left as the cross-check that the
// ROW-055   5 vacation days still count (a shortened request would show a different figure).
// ROW-055 cases: ROW-055 target=ROW-055.REQ-011.allowance-changes-leave-approved-requests-whole control=ROW-055.control.approved-requests-listed-and-counted-before-any-change
//
// ROW-056 promise: REQ-011 "a change may leave a negative balance", fail-if (4) "lowering an allowance below the
// ROW-056   approved days is refused"; A-018: lowering below the days already approved is allowed and shows negative.
// ROW-056 wrong product: a validator "allowance ≥ approved days" refusing the change, or a balance floored at 0.
// ROW-056 given: the same member and approved requests as ROW-055. when: the admin sets this year's allowance to 2,
// ROW-056   next year's to 1, then this year's to 0. then: each change is accepted, and days left reads −3 (2027),
// ROW-056   −1 (2028), then −5 (2027).
// ROW-056 controls: the control case shows a change to exactly the approved count (5) is accepted with 0 left —
// ROW-056   the boundary's accepted side, untouched by a "below approved is refused" fault.
// ROW-056 technique: values either side of the approved count (5 accepted, 2 / 1 / 0 below it), both "starts".
// ROW-056 cases: ROW-056 target=ROW-056.REQ-011.lowering-below-approved-days-accepted-and-shown-negative control=ROW-056.control.allowance-equal-to-approved-days-accepted
//
// ROW-057 promise: REQ-011 "a person who joins mid-year gets the full number set", fail-if (5) "a mid-year joiner's
// ROW-057   allowance is reduced in proportion to the date"; A-018: no proration. The row's case: an allowance changed
// ROW-057   in early January of a moved test clock gives the full number set.
// ROW-057 wrong product: allowance × (days left in the year ÷ days in the year), at creation or at a change.
// ROW-057 given: the clock at team Monday 16 August 2027. when: the admin creates a member with a fresh allowance A
// ROW-057   and then changes it to a fresh B. then: days left reads A for 2027 and 2028, then B for 2027 (proration
// ROW-057   would give about 0.38 × A). The second target case (the row's example): the clock moved to team Monday
// ROW-057   3 January 2028, the admin changes an existing member's allowance to a fresh C and creates a joiner with a
// ROW-057   fresh D: 2028 reads C and D.
// ROW-057 controls: the control case creates a member on team Monday 4 January 2027 (proration would be ~full) and
// ROW-057   reads A — creation and the balance work, untouched by a proration fault in any visible way.
// ROW-057 technique: the clock's origin (mid-year, where proration and the full number are far apart) plus the row's
// ROW-057   own early-January example; fresh numbers so no product hard-codes them.
// ROW-057 cases: ROW-057 target=ROW-057.REQ-011.mid-year-joiner-and-mid-year-change-get-the-full-number control=ROW-057.control.member-created-early-in-the-year-gets-the-number-set
import { test, expect } from '@playwright/test';
import { approve, createMember, freshEmail, freshName, freshPassword, sendRequest, setAllowance, setClock, signInMember } from './harness';
import { AHEAD_ZONE, awayDays, figures, freshInt, ok, startTeam, teamInstant, tryAllowance, weekdaysBetween, withAnonymous, type Team } from './time-off';

const MARCH = teamInstant(AHEAD_ZONE, '2027-03-01', '09:00'); // Monday 1 March 2027

// ----------------------------------------------------------------------------------------------- ROW-053

test('ROW-053.control.a-whole-allowance-is-accepted-and-shown', async () => {
  const A = freshInt(11, 29);
  const B = freshInt(11, 29, [A]);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: MARCH, allowances: [A] });
  try {
    expect(await figures(team.sessions[0], [2027]), 'ROW-053 control: days left A before').toEqual({ 2027: { daysLeft: A, pending: 0 } });
    const s = await tryAllowance(team.admin.api, team.members[0].id, B, false);
    expect(ok(s), `ROW-053 control: a whole allowance is accepted (${s})`).toBe(true);
    expect(await figures(team.sessions[0], [2027]), 'ROW-053 control: days left B after').toEqual({ 2027: { daysLeft: B, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-053.REQ-011.zero-accepted-negative-or-not-whole-refused', async () => {
  const A = freshInt(11, 29);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: MARCH, allowances: [A] });
  try {
    const member = team.members[0];
    const session = team.sessions[0];
    const bad: unknown[] = ['10abc', `${freshInt(11, 29)}abc`, -1, 2.5, -0.5, null, ''];
    for (const startsNextYear of [false, true]) {
      for (const v of bad) {
        const s = await tryAllowance(team.admin.api, member.id, v, startsNextYear);
        expect.soft(ok(s), `ROW-053 allowance ${JSON.stringify(v)} (startsNextYear ${startsNextYear}) is refused (${s})`).toBe(false);
      }
    }
    expect.soft(await figures(session, [2027, 2028]), 'ROW-053 after the refusals: days left still A in both years').toEqual({
      2027: { daysLeft: A, pending: 0 },
      2028: { daysLeft: A, pending: 0 },
    });

    for (const v of ['10abc', -1, 2.5]) {
      const email = freshEmail('refused');
      const password = freshPassword();
      const res = await team.admin.api.post('/api/admin/accounts', { data: { name: freshName('Refused'), email, password, allowance: v } });
      expect.soft(ok(res.status()), `ROW-053 an account created with allowance ${JSON.stringify(v)} is refused (${res.status()})`).toBe(false);
      await withAnonymous(async (anon) => {
        const signIn = await anon.post('/api/auth/sign-in', { data: { email, password } });
        expect.soft(ok(signIn.status()), `ROW-053 no account exists for the refused creation with ${JSON.stringify(v)} (${signIn.status()})`).toBe(false);
      });
    }

    const zero = await tryAllowance(team.admin.api, member.id, 0, false);
    expect.soft(ok(zero), `ROW-053 allowance 0 is accepted (${zero})`).toBe(true);
    expect.soft(await figures(session, [2027]), 'ROW-053 after 0: days left 0').toEqual({ 2027: { daysLeft: 0, pending: 0 } });
    const created = await team.admin.api.post('/api/admin/accounts', {
      data: { name: freshName('Zero'), email: freshEmail('zero'), password: freshPassword(), allowance: 0 },
    });
    expect(ok(created.status()), `ROW-053 an account created with allowance 0 is accepted (${created.status()})`).toBe(true);
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-055 / ROW-056

const DAYS_2027 = weekdaysBetween('2027-04-05', '2027-04-16');
const DAYS_2028 = weekdaysBetween('2028-02-07', '2028-02-11');
const LISTED_2027 = ['2027-04-05', '2027-04-06', '2027-04-07', '2027-04-08', '2027-04-09', '2027-04-12', '2027-04-13'];
const LISTED_2028 = ['2028-02-07', '2028-02-08'];

/** One member (fresh A, 20 to 30) with approved: 5 vacation days in April 2027, 2 sick days, 2 vacation days in February 2028. */
async function approvedMember(): Promise<{ team: Team; A: number }> {
  const A = freshInt(20, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: MARCH, allowances: [A] });
  const s = team.sessions[0];
  const ids = [
    await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' }),
    await sendRequest(s, { kind: 'sick', firstDay: '2027-04-12', lastDay: '2027-04-13' }),
    await sendRequest(s, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-08' }),
  ];
  for (const id of ids) await approve(team.admin, id);
  return { team, A };
}

async function expectWhole(team: Team, label: string): Promise<void> {
  const id = team.members[0].id;
  expect.soft(await awayDays(team.admin, id, DAYS_2027), `${label}: every approved 2027 day still listed`).toEqual(LISTED_2027);
  expect.soft(await awayDays(team.admin, id, DAYS_2028), `${label}: every approved 2028 day still listed`).toEqual(LISTED_2028);
}

test('ROW-055.control.approved-requests-listed-and-counted-before-any-change', async () => {
  const { team, A } = await approvedMember();
  try {
    await expectWhole(team, 'ROW-055 control');
    expect(await figures(team.sessions[0], [2027, 2028]), 'ROW-055 control: A − 5 and A − 2 left').toEqual({
      2027: { daysLeft: A - 5, pending: 0 },
      2028: { daysLeft: A - 2, pending: 0 },
    });
  } finally {
    await team.close();
  }
});

test('ROW-055.REQ-011.allowance-changes-leave-approved-requests-whole', async () => {
  const { team, A } = await approvedMember();
  try {
    const id = team.members[0].id;
    const s = team.sessions[0];

    await setAllowance(team.admin, id, 3);
    await expectWhole(team, 'ROW-055 after lowering this year to 3');
    expect.soft((await figures(s, [2027]))[2027], 'ROW-055 after lowering this year to 3: 3 − 5').toEqual({ daysLeft: -2, pending: 0 });

    await setAllowance(team.admin, id, A + 3, { startsNextYear: true });
    await expectWhole(team, 'ROW-055 after setting next year to A + 3');
    expect.soft((await figures(s, [2028]))[2028], 'ROW-055 after setting next year to A + 3: (A + 3) − 2').toEqual({ daysLeft: A + 1, pending: 0 });

    await setAllowance(team.admin, id, A + 5);
    await expectWhole(team, 'ROW-055 after raising this year to A + 5');
    expect((await figures(s, [2027]))[2027], 'ROW-055 after raising this year to A + 5: (A + 5) − 5').toEqual({ daysLeft: A, pending: 0 });
  } finally {
    await team.close();
  }
});

test('ROW-056.control.allowance-equal-to-approved-days-accepted', async () => {
  const { team } = await approvedMember();
  try {
    const st = await tryAllowance(team.admin.api, team.members[0].id, 5, false);
    expect(ok(st), `ROW-056 control: an allowance equal to the 5 approved days is accepted (${st})`).toBe(true);
    expect((await figures(team.sessions[0], [2027]))[2027], 'ROW-056 control: 0 left').toEqual({ daysLeft: 0, pending: 0 });
  } finally {
    await team.close();
  }
});

test('ROW-056.REQ-011.lowering-below-approved-days-accepted-and-shown-negative', async () => {
  const { team } = await approvedMember();
  try {
    const id = team.members[0].id;
    const s = team.sessions[0];

    const two = await tryAllowance(team.admin.api, id, 2, false);
    expect.soft(ok(two), `ROW-056 this year lowered to 2, below the 5 approved days, is accepted (${two})`).toBe(true);
    expect.soft((await figures(s, [2027]))[2027], 'ROW-056 2027 shows 2 − 5 = −3').toEqual({ daysLeft: -3, pending: 0 });

    const one = await tryAllowance(team.admin.api, id, 1, true);
    expect.soft(ok(one), `ROW-056 next year lowered to 1, below the 2 approved days, is accepted (${one})`).toBe(true);
    expect.soft((await figures(s, [2028]))[2028], 'ROW-056 2028 shows 1 − 2 = −1').toEqual({ daysLeft: -1, pending: 0 });

    const zero = await tryAllowance(team.admin.api, id, 0, false);
    expect.soft(ok(zero), `ROW-056 this year lowered to 0 is accepted (${zero})`).toBe(true);
    expect((await figures(s, [2027]))[2027], 'ROW-056 2027 shows 0 − 5 = −5').toEqual({ daysLeft: -5, pending: 0 });
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-057

test('ROW-057.control.member-created-early-in-the-year-gets-the-number-set', async () => {
  const A = freshInt(20, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: teamInstant(AHEAD_ZONE, '2027-01-04', '15:00'), allowances: [A] });
  try {
    expect((await figures(team.sessions[0], [2027]))[2027], 'ROW-057 control: days left A').toEqual({ daysLeft: A, pending: 0 });
  } finally {
    await team.close();
  }
});

test('ROW-057.REQ-011.mid-year-joiner-and-mid-year-change-get-the-full-number', async () => {
  const A = freshInt(20, 30);
  const B = freshInt(20, 30, [A]);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: teamInstant(AHEAD_ZONE, '2027-08-16', '10:00'), allowances: [A] });
  try {
    const s = team.sessions[0];
    expect.soft(await figures(s, [2027, 2028]), 'ROW-057 joined in August: the full A for this year and next').toEqual({
      2027: { daysLeft: A, pending: 0 },
      2028: { daysLeft: A, pending: 0 },
    });
    await setAllowance(team.admin, team.members[0].id, B);
    expect((await figures(s, [2027]))[2027], 'ROW-057 changed in August: the full B').toEqual({ daysLeft: B, pending: 0 });
  } finally {
    await team.close();
  }
});

test('ROW-057.REQ-011.allowance-changed-in-early-january-gives-the-full-number', async () => {
  const A = freshInt(20, 30);
  const C = freshInt(20, 30, [A]);
  const D = freshInt(20, 30, [A, C]);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: teamInstant(AHEAD_ZONE, '2027-11-15', '10:00'), allowances: [A] });
  try {
    await setClock(teamInstant(AHEAD_ZONE, '2028-01-03', '10:00'));
    await setAllowance(team.admin, team.members[0].id, C);
    expect.soft((await figures(team.sessions[0], [2028]))[2028], 'ROW-057 changed on 3 January: the full C').toEqual({ daysLeft: C, pending: 0 });

    const joiner = await createMember(team.admin, { allowance: D });
    const js = await signInMember(joiner);
    try {
      expect((await figures(js, [2028]))[2028], 'ROW-057 joined on 3 January: the full D').toEqual({ daysLeft: D, pending: 0 });
    } finally {
      await js.dispose();
    }
  } finally {
    await team.close();
  }
});
