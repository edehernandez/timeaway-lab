// Purpose: ledger tests for ROW-054, ROW-251, ROW-271 and ROW-278 (REQ-011 arms 2, 6, 7 and 8) — which years an allowance change reaches: a change starting this year reaches this year at once and every later year except one set by a next-year change made this year; a change starting next year leaves this year and reaches every later year no later change has set.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, clock, accounts, allowances, requests, confirmed actions), fresh per run.
//
// Shared authority: REQ-011 and D-025 (the allowance for a year is, among the changes starting at or before it, the
// one with the latest starting year, the most recently made among those); A-043, A-046, A-047 (human). Days left
// for a year is that year's allowance minus its approved vacation days (REQ-007), read from GET /api/balance for the
// current and the next year; a year after next is read by moving the test clock into the following years.
//
// ROW-054 promise: REQ-011 fail-if (2) "a change chosen to start this year does not change the current year's days
// ROW-054   left at once"; the row's cases: after a change, next year's days left also reflects the new allowance,
// ROW-054   except a year whose allowance was set by a change starting next year made during the current year.
// ROW-054 wrong product: the change is stored for this year but the balance reads a cached / next-January figure
// ROW-054   (no change until the clock moves); or it writes only this year, leaving next year on the old allowance;
// ROW-054   or it overwrites next year even where a next-year change made this year set it.
// ROW-054 given: member 1 (fresh A) with approved vacation: 2 days in April 2027, 1 day in February 2028; member 2
// ROW-054   (fresh A2) untouched. when: with the clock not moved, the admin sets member 1's allowance to a fresh B
// ROW-054   starting this year. then: 2027 reads B − 2 and 2028 reads B − 1 at once; member 2 still A2 and A2.
// ROW-054   Second target case: a next-year change to a fresh C first, then this-year B: 2027 reads B − 2, 2028 C − 1.
// ROW-054 controls: the control case shows A − 2 and A − 1 before any change (the effect absent before the action).
// ROW-054 technique: before/after on both years without moving the clock, an untouched neighbour, fresh numbers.
// ROW-054 cases: ROW-054 target=ROW-054.REQ-011.this-year-change-reaches-this-year-at-once-and-next-year control=ROW-054.control.both-years-days-left-before-any-change
//
// ROW-251 promise: REQ-011 fail-if (6) "a change chosen to start next year changes the current year's allowance or
// ROW-251   days left, or does not change next year's, or does not change the allowance of the years after next year
// ROW-251   that no later change has set"; A-043.
// ROW-251 wrong product: a next-year change written only to next year's row (the year after reverts to the old
// ROW-251   allowance); or written as "from now on" (this year changes too); or a later change ignored for its years.
// ROW-251 given: member 1 (fresh A1, 2 approved days in 2027), member 2 (fresh A2), member 3 (fresh A3, untouched).
// ROW-251   when: in 2027 the admin sets member 1 next year to a fresh C and member 2 next year to a fresh C2; the clock
// ROW-251   moves to March 2028, where the admin sets member 2 next year to a fresh D; the clock moves to March 2029.
// ROW-251   then: 2027: member 1 still A1 − 2 (this year untouched), 2028 C; in 2028: member 1 2028 C and 2029 C,
// ROW-251   member 2 2028 C2 then 2029 D; in 2029: member 1 2029 C and 2030 C (years after next reached), member 2
// ROW-251   2029 D and 2030 D (the later change's years), member 3 A3 throughout.
// ROW-251 controls: the control case shows a next-year change is accepted and the balance lists both years.
// ROW-251 technique: the clock's origin moved year by year so a year after next becomes visible; a later change as
// ROW-251   the near miss of "no later change"; an untouched neighbour.
// ROW-251 cases: ROW-251 target=ROW-251.REQ-011.next-year-change-leaves-this-year-and-reaches-every-later-year control=ROW-251.control.next-year-change-accepted-and-both-years-listed
//
// ROW-271 promise: REQ-011 fail-if (7) "a change starting this year alters the allowance of a year after the
// ROW-271   current one that was set by a change starting next year made during the current year"; A-046 (human):
// ROW-271   next year set to 30, then this year corrected to 26 — next year keeps its 30; the row's cases: a raise
// ROW-271   scheduled for next year survives a correction of this year, and once that year is current, it can itself
// ROW-271   be corrected.
// ROW-271 wrong product: "latest change wins" for every year (D-025's why: it loses the scheduled raise); or the
// ROW-271   scheduled year frozen forever, so once current it cannot be corrected.
// ROW-271 given: member 1 and member 2 at 25 (A-046's values). when: in 2027 member 1 next year → 30, then this year
// ROW-271   → 26; member 2 this year → 26 only; the clock moves to March 2028; member 1 this year → 27. then: 2027
// ROW-271   member 1 26 and 2028 30, member 2 26 and 26 (the near miss: no schedule, so the correction reaches 2028);
// ROW-271   in 2028 member 1 reads 30 for 2028 and 2029, then 27 for 2028 and 2029 after the correction.
// ROW-271 controls: the control case shows member 1's next-year 30 is shown before any correction.
// ROW-271 technique: the owner's own example values (25, 30, 26), a neighbour without the schedule as the near miss.
// ROW-271 cases: ROW-271 target=ROW-271.REQ-011.next-year-raise-survives-this-year-correction-and-is-correctable-once-current control=ROW-271.control.next-year-30-shown-before-any-correction
//
// ROW-278 promise: REQ-011 fail-if (8) "a change chosen to start this year does not change the allowance of a year
// ROW-278   after the current one that no change starting next year made during the current year has set"; A-047; the
// ROW-278   row's cases: raise 25 to 28 starting this year; next year's allowance and days left become 28-based.
// ROW-278 wrong product: the this-year change writes only this year's row; next year keeps 25 (and the year after).
// ROW-278 given: member 1 at 25 with approved vacation, 2 days in April 2027 and 1 day in February 2028; member 2 at
// ROW-278   25 untouched. when: the admin raises member 1 to 28 starting this year. then: 2027 26, 2028 27 (28-based);
// ROW-278   member 2 25 and 25; after the clock moves to March 2028: member 1 2028 27 and 2029 28.
// ROW-278 controls: the control case shows 23 and 24 before the raise.
// ROW-278 technique: the row's own values (25, 28), approved days in next year so days left (not only the allowance)
// ROW-278   is checked, the clock moved one year to reach the year after.
// ROW-278 cases: ROW-278 target=ROW-278.REQ-011.raise-25-to-28-this-year-makes-next-year-28-based control=ROW-278.control.days-left-25-based-before-the-raise
import { test, expect } from '@playwright/test';
import { approve, sendRequest, setAllowance, setClock } from './harness';
import { AHEAD_ZONE, figures, freshInt, ok, startTeam, teamInstant, tryAllowance, type Team } from './time-off';

const Y2027 = teamInstant(AHEAD_ZONE, '2027-03-10', '10:00');
const Y2028 = teamInstant(AHEAD_ZONE, '2028-03-08', '10:00');
const Y2029 = teamInstant(AHEAD_ZONE, '2029-03-07', '10:00');

/** A team at March 2027 with one member per allowance; member 1 has approved vacation: 2 days in April 2027, 1 day in February 2028. */
async function twoYearTeam(allowances: number[]): Promise<Team> {
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: Y2027, allowances });
  const s = team.sessions[0];
  const ids = [
    await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }),
    await sendRequest(s, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-07' }),
  ];
  for (const id of ids) await approve(team.admin, id);
  return team;
}

const left = (...pairs: [number, number][]) => Object.fromEntries(pairs.map(([y, d]) => [y, { daysLeft: d, pending: 0 }]));

// ----------------------------------------------------------------------------------------------- ROW-054

test('ROW-054.control.both-years-days-left-before-any-change', async () => {
  const A = freshInt(15, 30);
  const team = await twoYearTeam([A]);
  try {
    expect(await figures(team.sessions[0], [2027, 2028]), 'ROW-054 control: A − 2 and A − 1').toEqual(left([2027, A - 2], [2028, A - 1]));
  } finally {
    await team.close();
  }
});

test('ROW-054.REQ-011.this-year-change-reaches-this-year-at-once-and-next-year', async () => {
  const A = freshInt(15, 30);
  const A2 = freshInt(15, 30);
  const B = freshInt(15, 30, [A]);
  const team = await twoYearTeam([A, A2]);
  try {
    const [s1, s2] = team.sessions;
    expect(await figures(s1, [2027, 2028]), 'ROW-054 before').toEqual(left([2027, A - 2], [2028, A - 1]));
    await setAllowance(team.admin, team.members[0].id, B);
    expect.soft(await figures(s1, [2027, 2028]), 'ROW-054 at once: B − 2 this year, B − 1 next year').toEqual(left([2027, B - 2], [2028, B - 1]));
    expect(await figures(s2, [2027, 2028]), 'ROW-054: the untouched member still A2').toEqual(left([2027, A2], [2028, A2]));
  } finally {
    await team.close();
  }
});

test('ROW-054.REQ-011.this-year-change-skips-a-year-set-by-a-next-year-change-made-this-year', async () => {
  const A = freshInt(15, 30);
  const C = freshInt(15, 30, [A]);
  const B = freshInt(15, 30, [A, C]);
  const team = await twoYearTeam([A]);
  try {
    const s = team.sessions[0];
    const id = team.members[0].id;
    await setAllowance(team.admin, id, C, { startsNextYear: true });
    expect(await figures(s, [2027, 2028]), 'ROW-054 after next year → C').toEqual(left([2027, A - 2], [2028, C - 1]));
    await setAllowance(team.admin, id, B);
    expect(await figures(s, [2027, 2028]), 'ROW-054 after this year → B: this year B − 2 at once, next year keeps C − 1').toEqual(left([2027, B - 2], [2028, C - 1]));
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-251

test('ROW-251.control.next-year-change-accepted-and-both-years-listed', async () => {
  const A = freshInt(15, 30);
  const C = freshInt(15, 30, [A]);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: Y2027, allowances: [A] });
  try {
    const st = await tryAllowance(team.admin.api, team.members[0].id, C, true);
    expect(ok(st), `ROW-251 control: a next-year change is accepted (${st})`).toBe(true);
    const f = await figures(team.sessions[0], [2027, 2028]);
    expect(f[2027], 'ROW-251 control: the balance lists 2027').not.toBeNull();
    expect(f[2028], 'ROW-251 control: the balance lists 2028').not.toBeNull();
  } finally {
    await team.close();
  }
});

test('ROW-251.REQ-011.next-year-change-leaves-this-year-and-reaches-every-later-year', async () => {
  const A1 = freshInt(15, 30);
  const A2 = freshInt(15, 30);
  const A3 = freshInt(15, 30);
  const C = freshInt(15, 30, [A1]);
  const C2 = freshInt(15, 30, [A2]);
  const D = freshInt(15, 30, [A2, C2]);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: Y2027, allowances: [A1, A2, A3] });
  try {
    const [m1, m2] = team.members;
    const [s1, s2, s3] = team.sessions;
    await approve(team.admin, await sendRequest(s1, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }));
    expect(await figures(s1, [2027]), 'ROW-251 before: member 1 this year A1 − 2').toEqual(left([2027, A1 - 2]));

    await setAllowance(team.admin, m1.id, C, { startsNextYear: true });
    await setAllowance(team.admin, m2.id, C2, { startsNextYear: true });
    expect.soft(await figures(s1, [2027, 2028]), 'ROW-251 2027: member 1 this year unchanged, next year C').toEqual(left([2027, A1 - 2], [2028, C]));
    expect.soft(await figures(s2, [2027, 2028]), 'ROW-251 2027: member 2 this year unchanged, next year C2').toEqual(left([2027, A2], [2028, C2]));

    await setClock(Y2028);
    expect.soft(await figures(s1, [2028, 2029]), 'ROW-251 in 2028: member 1 C this year and the year after').toEqual(left([2028, C], [2029, C]));
    await setAllowance(team.admin, m2.id, D, { startsNextYear: true });
    expect.soft(await figures(s2, [2028, 2029]), 'ROW-251 in 2028: member 2 C2 this year, the later change D next year').toEqual(left([2028, C2], [2029, D]));

    await setClock(Y2029);
    expect.soft(await figures(s1, [2029, 2030]), 'ROW-251 in 2029: member 1 still C, two and three years after the change').toEqual(left([2029, C], [2030, C]));
    expect.soft(await figures(s2, [2029, 2030]), 'ROW-251 in 2029: member 2 D for the later change\'s years').toEqual(left([2029, D], [2030, D]));
    expect(await figures(s3, [2029, 2030]), 'ROW-251 in 2029: the untouched member still A3').toEqual(left([2029, A3], [2030, A3]));
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-271

test('ROW-271.control.next-year-30-shown-before-any-correction', async () => {
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: Y2027, allowances: [25] });
  try {
    await setAllowance(team.admin, team.members[0].id, 30, { startsNextYear: true });
    expect(await figures(team.sessions[0], [2027, 2028]), 'ROW-271 control: 25 this year, 30 next year').toEqual(left([2027, 25], [2028, 30]));
  } finally {
    await team.close();
  }
});

test('ROW-271.REQ-011.next-year-raise-survives-this-year-correction-and-is-correctable-once-current', async () => {
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: Y2027, allowances: [25, 25] });
  try {
    const [m1, m2] = team.members;
    const [s1, s2] = team.sessions;
    await setAllowance(team.admin, m1.id, 30, { startsNextYear: true });
    await setAllowance(team.admin, m1.id, 26);
    await setAllowance(team.admin, m2.id, 26);
    expect.soft(await figures(s1, [2027, 2028]), 'ROW-271 2027: member 1 corrected to 26, next year keeps its scheduled 30').toEqual(left([2027, 26], [2028, 30]));
    expect.soft(await figures(s2, [2027, 2028]), 'ROW-271 2027: member 2 (no schedule) 26 both years').toEqual(left([2027, 26], [2028, 26]));

    await setClock(Y2028);
    expect.soft(await figures(s1, [2028, 2029]), 'ROW-271 in 2028: the scheduled 30 is this year\'s and the year after\'s').toEqual(left([2028, 30], [2029, 30]));
    await setAllowance(team.admin, m1.id, 27);
    expect(await figures(s1, [2028, 2029]), 'ROW-271 in 2028: the once-scheduled year corrected to 27, and the year after with it').toEqual(left([2028, 27], [2029, 27]));
  } finally {
    await team.close();
  }
});

// ----------------------------------------------------------------------------------------------- ROW-278

test('ROW-278.control.days-left-25-based-before-the-raise', async () => {
  const team = await twoYearTeam([25]);
  try {
    expect(await figures(team.sessions[0], [2027, 2028]), 'ROW-278 control: 25 − 2 and 25 − 1').toEqual(left([2027, 23], [2028, 24]));
  } finally {
    await team.close();
  }
});

test('ROW-278.REQ-011.raise-25-to-28-this-year-makes-next-year-28-based', async () => {
  const team = await twoYearTeam([25, 25]);
  try {
    const [s1, s2] = team.sessions;
    await setAllowance(team.admin, team.members[0].id, 28);
    expect.soft(await figures(s1, [2027, 2028]), 'ROW-278: 28 − 2 this year, 28 − 1 next year').toEqual(left([2027, 26], [2028, 27]));
    expect.soft(await figures(s2, [2027, 2028]), 'ROW-278: the untouched member still 25').toEqual(left([2027, 25], [2028, 25]));
    await setClock(Y2028);
    expect(await figures(s1, [2028, 2029]), 'ROW-278 in 2028: 28 − 1, and 28 the year after').toEqual(left([2028, 27], [2029, 28]));
  } finally {
    await team.close();
  }
});
