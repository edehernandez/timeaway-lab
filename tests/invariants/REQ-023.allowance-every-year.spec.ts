// Purpose: ledger tests for ROW-146, ROW-147 and ROW-148 (REQ-002, REQ-007, REQ-011, REQ-013, REQ-016, REQ-023) — after New Year both new years have the allowance with no admin action; an account created in any month or switched back on after New Years has both years; an allowance change reaches later years by the rule of A-046 and A-047.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; instants worked out by the tests' own Intl oracle.
// Slice 1, brief test-author-9 (lesson L-1): ROW-146's page cases added beside its data cases — / read in the member's
// browser through page-figures.ts readOwnFigures, every data assertion kept.
//
// Boundary (R6): rules at the HTTP harness — GET /api/balance's years and days left, POST /api/requests, the admin's
// POST /api/admin/accounts/:id/allowance {allowance, startsNextYear} and /switch.
// The team: Pacific/Auckland. Each "1 January" stop is at 15:00 team time, when the UTC date is 1 January too, so
// these cases turn on the year's change and not on the zone (ROW-133 holds the zone's midnight).
import { test, expect } from '@playwright/test';
import { createMember, switchAccount, type AccountId, type Actor, type Member } from './harness';
import { saysNumber } from './own-page';
import { readOwnFigures, type OwnFigures } from './page-figures';
import {
  addMember,
  AUCKLAND,
  disposeAll,
  isAccepted,
  sendApproved,
  setTeamClock,
  signInAgain,
  startTeam,
  teamInstant,
  tryAllowance,
  trySend,
  trySwitchOn,
  yearFigures,
  type Team,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

/** The days left of `years` for the actor, as one object {year: daysLeft} (undefined where a year is not shown). */
async function daysLeft(actor: Actor, years: number[]): Promise<Record<number, number | undefined>> {
  const out: Record<number, number | undefined> = {};
  for (const y of years) out[y] = (await yearFigures(actor, y))?.daysLeft;
  return out;
}

async function change(team: Team, id: AccountId, allowance: number, startsNextYear: boolean, say: string): Promise<void> {
  const a = await tryAllowance(team.admin, id, { allowance, startsNextYear });
  expect(isAccepted(a), `${say}: the change to ${allowance} starting ${startsNextYear ? 'next' : 'this'} year is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
}

// ---------------------------------------------------------------------------------------------------
// ROW-146 promise: REQ-007 (both years' days left shown), REQ-023 (the allowance in force for each calendar year) and
// ROW-146   REQ-002 (a vacation within the allowance of its year is accepted), with D-025 (nothing is created when a
// ROW-146   year begins): after New Year in the team zone, with no admin action, the new current and next years both
// ROW-146   have the allowance, both figures show, and a vacation within the new next year is accepted.
// ROW-146 wrong product: one that writes allowance rows per year at create time (this year and next) and has no job
// ROW-146   at New Year, so after it the new next year has no allowance — days left 0 or missing, its vacation refused.
// ROW-146 given: a member created 15 December 2027 with 23, with an approved 10..11 January 2028. when: the clock is
// ROW-146   moved to 1 January 2028 and the member signs in. then: 2028 shows 21 days left (23 − 2) and 2029 shows 23;
// ROW-146   a vacation 8..9 January 2029 is accepted and 2029 shows 2 pending.
// ROW-146 controls: the control case reads the same member before New Year: 2027 and 2028 show 23 and 21 — the balance
// ROW-146   and approval work, untouched by a fault that only bites when the year turns.
// ROW-146 technique: before and after the year's change, the clock's origin moved with nothing else done.
// ROW-146 cases: ROW-146 target=ROW-146.REQ-023.after-new-year-both-new-years-have-the-allowance control=ROW-146.control.before-new-year-both-years-have-the-allowance
async function decemberMember(): Promise<{ team: Team; member: Member; actor: Actor }> {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-12-15', '15:00') });
  const { member, actor } = await addMember(team, { allowance: 23 });
  await sendApproved(team, actor, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-11' });
  return { team, member, actor };
}

test('ROW-146.control.before-new-year-both-years-have-the-allowance', async () => {
  const { actor } = await decemberMember();
  expect(await daysLeft(actor, [2027, 2028]), 'ROW-146 control: on 15 December 2027').toEqual({ 2027: 23, 2028: 21 });
});

test('ROW-146.REQ-023.after-new-year-both-new-years-have-the-allowance', async () => {
  const { member } = await decemberMember();
  await setTeamClock(AUCKLAND, '2028-01-01', '15:00');
  const actor = await signInAgain(member);
  expect.soft(await daysLeft(actor, [2028, 2029]), 'ROW-146: on 1 January 2028, both new years have the allowance').toEqual({ 2028: 21, 2029: 23 });
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2029-01-08', lastDay: '2029-01-09' });
  expect.soft(isAccepted(a), `ROW-146: a vacation in the new next year is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect.soft((await yearFigures(actor, 2029))?.pending, 'ROW-146: 2029 shows its 2 pending days').toBe(2);
});

// ---------------------------------------------------------------------------------------------------
// ROW-146 — on the own page itself (added, slice 1, test-author-9; lesson L-1)
// ROW-146 promise: as above — REQ-007 "A person sees their vacation days left for the current year and for the next
// ROW-146   year" (fail-if (1) "either year's days left is missing"), REQ-023 and D-025, on the page the person sees: after
// ROW-146   New Year in the team zone, with no admin action, / draws both new years' days left from the allowance.
// ROW-146 wrong product: GET /api/balance right, but / keeps drawing the years the account was created in (2027 and
// ROW-146   2028), or draws the new next year 2029 with no allowance (0 days left) — every data case stays green.
// ROW-146 given: decemberMember (allowance 23, an approved vacation 10..11 January 2028). when: the member's browser
// ROW-146   opens / on 15 December 2027; the clock moves to 1 January 2028 15:00 team time and it opens / again; then a
// ROW-146   vacation 8..9 January 2029 is sent and it opens / once more. then: on 15 December / draws no figures for 2029;
// ROW-146   on 1 January it draws 2028's days left 21 (23 − 2) and 2029's 23; after the send 2029's figures draw 23 and
// ROW-146   its 2 pending days, and not 21 (the pending days subtracted).
// ROW-146 controls: ROW-146.control.page-before-new-year-draws-both-years — on 15 December / draws 2027's 23 and
// ROW-146   2028's 21: the page, the reading and the approval work where no year has turned.
// ROW-146 technique: before and after the year's change, the clock's origin moved with nothing else done; each figure
// ROW-146   a number of its own in that year's drawn figures (own-page.ts saysNumber, the years taken out), every
// ROW-146   expected value worked out here from the test's own data.
// ROW-146 cases: ROW-146 target=ROW-146.REQ-007.page-after-new-year-draws-both-new-years control=ROW-146.control.page-before-new-year-draws-both-years

/** True when the page's figures for `year` draw `n` as a number of its own (the years themselves left out). */
function drawn146(f: OwnFigures, year: number, n: number): boolean {
  return saysNumber(f.years[year] ?? '', n, [], ['2027', '2028', '2029', '2030']);
}

/** The page's figures for `year`, quoted for a message. */
function shown146(f: OwnFigures, year: number): string {
  return f.years[year] === null || f.years[year] === undefined ? `(no figures for ${year}; page: "${f.body.slice(0, 400)}")` : `"${f.years[year]}"`;
}

test('ROW-146.control.page-before-new-year-draws-both-years', async ({ browser }) => {
  const { actor } = await decemberMember();
  const f = await readOwnFigures(browser, actor, [2027, 2028]);
  expect.soft(f.status, 'ROW-146 control: / answers the member').toBe(200);
  expect.soft(drawn146(f, 2027, 23), `ROW-146 control: on 15 December 2027 / draws 2027's days left 23: ${shown146(f, 2027)}`).toBe(true);
  expect.soft(drawn146(f, 2028, 21), `ROW-146 control: on 15 December 2027 / draws 2028's days left 23 − 2 = 21: ${shown146(f, 2028)}`).toBe(true);
});

test('ROW-146.REQ-007.page-after-new-year-draws-both-new-years', async ({ browser }) => {
  const { member, actor } = await decemberMember();
  const before = await readOwnFigures(browser, actor, [2028, 2029], 5_000);
  expect.soft(before.years[2029], `ROW-146: on 15 December 2027 / draws no figures for 2029 yet: ${shown146(before, 2029)}`).toBeNull();

  await setTeamClock(AUCKLAND, '2028-01-01', '15:00');
  const again = await signInAgain(member);
  const after = await readOwnFigures(browser, again, [2028, 2029]);
  for (const year of [2028, 2029]) {
    expect.soft(after.years[year] !== null, `ROW-146: on 1 January 2028 / draws ${year}'s days left: ${shown146(after, year)}`).toBe(true);
  }
  expect.soft(drawn146(after, 2028, 21), `ROW-146: on 1 January 2028 / draws 2028's days left 23 − 2 = 21: ${shown146(after, 2028)}`).toBe(true);
  expect.soft(drawn146(after, 2029, 23), `ROW-146: on 1 January 2028 / draws the new next year 2029 with its allowance 23: ${shown146(after, 2029)}`).toBe(true);

  const a = await trySend(again, { kind: 'vacation', firstDay: '2029-01-08', lastDay: '2029-01-09' });
  expect(isAccepted(a), `ROW-146: a vacation in the new next year is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  const sent = await readOwnFigures(browser, again, [2028, 2029]);
  expect.soft(drawn146(sent, 2029, 23), `ROW-146: after the send / still draws 2029's days left 23: ${shown146(sent, 2029)}`).toBe(true);
  expect.soft(drawn146(sent, 2029, 2), `ROW-146: / draws 2029's 2 pending days beside it: ${shown146(sent, 2029)}`).toBe(true);
  expect.soft(drawn146(sent, 2029, 21), `ROW-146: / does not draw 23 − 2 = 21 for 2029: ${shown146(sent, 2029)}`).toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-147 promise: REQ-013 (an account is created with an allowance), REQ-023 (the allowance for each calendar year)
// ROW-147   and REQ-016 (switching back on restores the account), with A-018 (a joiner gets the full number): an account
// ROW-147   created in any month, December included, or switched back on after one or more New Years, has its allowance
// ROW-147   for the current and the next year.
// ROW-147 wrong product: one that gives a new account only this year's allowance (or next year's only from some
// ROW-147   month on), prorates it, or works "next year" as month + 12 and breaks in December; or one whose allowance rows
// ROW-147   stop at the years around creation, so an account switched back on after New Years has none.
// ROW-147 given / when / then: in one team, the clock moved to the 10th of each month of 2027, then to 31 December
// ROW-147   23:30 and to 1 January 2028 15:00, a member created at each stop with a fresh allowance: its current and
// ROW-147   next year both show that allowance. Separately, members created March 2027 and switched off; one switched
// ROW-147   on in February 2028 shows 2028 and 2029; the other switched on in February 2029 shows 2029 and 2030.
// ROW-147 controls: the control case creates a member in June: both years show the allowance — create and balance
// ROW-147   work, untouched by a December or New Year fault.
// ROW-147 technique: "any month" as every month of a year in turn (a property over all of them), plus the year's last
// ROW-147   evening and the next year's first day, and the neighbour switched off over one and over two New Years.
// ROW-147 cases: ROW-147 target=ROW-147.REQ-013.an-account-created-in-any-month-has-both-years control=ROW-147.control.an-account-created-in-june-has-both-years
test('ROW-147.control.an-account-created-in-june-has-both-years', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-10', '15:00') });
  const { actor } = await addMember(team, { allowance: 16 });
  expect(await daysLeft(actor, [2027, 2028]), 'ROW-147 control: created in June 2027').toEqual({ 2027: 16, 2028: 16 });
});

test('ROW-147.REQ-013.an-account-created-in-any-month-has-both-years', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-01-04', '15:00') });
  const stops: [string, string][] = [];
  for (let m = 1; m <= 12; m += 1) stops.push([`2027-${String(m).padStart(2, '0')}-10`, '15:00']);
  stops.push(['2027-12-31', '23:30'], ['2028-01-01', '15:00']);
  let allowance = 30;
  for (const [day, time] of stops) {
    await setTeamClock(AUCKLAND, day, time);
    allowance += 1;
    const { actor } = await addMember(team, { allowance });
    const year = Number(day.slice(0, 4));
    expect.soft(await daysLeft(actor, [year, year + 1]), `ROW-147: created ${day} ${time}, both years have ${allowance}`).toEqual({ [year]: allowance, [year + 1]: allowance });
  }
});

test('ROW-147.REQ-016.an-account-switched-back-on-after-new-years-has-both-years', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-10', '15:00') });
  const a = await createMember(team.admin, { allowance: 19 });
  const b = await createMember(team.admin, { allowance: 18 });
  await switchAccount(team.admin, a.id, false);
  await switchAccount(team.admin, b.id, false);

  await setTeamClock(AUCKLAND, '2028-02-14', '15:00');
  const onA = await trySwitchOn(team.admin, a.id);
  expect(isAccepted(onA), `ROW-147 setup: switched on after one New Year (answered ${onA.status})`).toBe(true);
  expect.soft(await daysLeft(await signInAgain(a), [2028, 2029]), 'ROW-147: back on in 2028, both years have 19').toEqual({ 2028: 19, 2029: 19 });

  await setTeamClock(AUCKLAND, '2029-02-14', '15:00');
  const onB = await trySwitchOn(team.admin, b.id);
  expect(isAccepted(onB), `ROW-147 setup: switched on after two New Years (answered ${onB.status})`).toBe(true);
  expect.soft(await daysLeft(await signInAgain(b), [2029, 2030]), 'ROW-147: back on in 2029, both years have 18').toEqual({ 2029: 18, 2030: 18 });
});

// ---------------------------------------------------------------------------------------------------
// ROW-148 promise: REQ-011 fail-if (6), (7), (8) with A-046, A-047 and D-025, and REQ-023: a change starting this year
// ROW-148   updates the next year as well as the current one, except a year set by a change starting next year made
// ROW-148   during the current year; years keep it when the clock passes into them.
// ROW-148 wrong product: "the most recently made change wins" (next year set to 30, then this year corrected to 26:
// ROW-148   2029 reads 26); or "a year once set by a next-year change is protected forever" (next year set to 30 in
// ROW-148   2027, this year corrected to 26 in 2028: 2029 reads 30); or a change that reaches only the years it was
// ROW-148   made for, so two years later the old allowance is back.
// ROW-148 given / when / then (member created in 2027 with 22):
// ROW-148   (a) this-year 21 made in 2027 → on 1 January 2029: 2029 and 2030 read 21;
// ROW-148   (b) next-year 27 made in 2027 → in 2027: 22 and 27; on 1 January 2029: 27 and 27;
// ROW-148   (c) next-year 30 then this-year 26, both in 2027 → in 2027: 26 and 30; on 1 January 2028: 2028 and 2029
// ROW-148       read 30;
// ROW-148   (d) next-year 30 made in 2027, clock to March 2028, this-year 26 → 2028 and 2029 read 26.
// ROW-148 controls: the control case makes one this-year change (21) in 2027: 2027 and 2028 read 21 at once — the
// ROW-148   route and the balance work, untouched by a later-years fault.
// ROW-148 technique: the row's own example values (30 and 26), the clock moved across one and two New Years, each
// ROW-148   year's figure read exactly; the near-miss baseline 22 is neither.
// ROW-148 cases: ROW-148 target=ROW-148.REQ-011.a-next-year-change-survives-a-this-year-change-the-same-year control=ROW-148.control.a-this-year-change-applies-at-once
async function memberIn2027(): Promise<{ team: Team; member: Member; actor: Actor }> {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-10', '15:00') });
  const { member, actor } = await addMember(team, { allowance: 22 });
  return { team, member, actor };
}

test('ROW-148.control.a-this-year-change-applies-at-once', async () => {
  const { team, member, actor } = await memberIn2027();
  await change(team, member.id, 21, false, 'ROW-148 control');
  expect(await daysLeft(actor, [2027, 2028]), 'ROW-148 control: in 2027').toEqual({ 2027: 21, 2028: 21 });
});

test('ROW-148.REQ-011.a-this-year-change-reaches-two-years-later', async () => {
  const { team, member } = await memberIn2027();
  await change(team, member.id, 21, false, 'ROW-148 (a)');
  await setTeamClock(AUCKLAND, '2029-01-01', '15:00');
  expect.soft(await daysLeft(await signInAgain(member), [2029, 2030]), 'ROW-148 (a): on 1 January 2029').toEqual({ 2029: 21, 2030: 21 });
});

test('ROW-148.REQ-011.a-next-year-change-reaches-two-years-later', async () => {
  const { team, member, actor } = await memberIn2027();
  await change(team, member.id, 27, true, 'ROW-148 (b)');
  expect.soft(await daysLeft(actor, [2027, 2028]), 'ROW-148 (b): in 2027').toEqual({ 2027: 22, 2028: 27 });
  await setTeamClock(AUCKLAND, '2029-01-01', '15:00');
  expect.soft(await daysLeft(await signInAgain(member), [2029, 2030]), 'ROW-148 (b): on 1 January 2029').toEqual({ 2029: 27, 2030: 27 });
});

test('ROW-148.REQ-011.a-next-year-change-survives-a-this-year-change-the-same-year', async () => {
  const { team, member, actor } = await memberIn2027();
  await change(team, member.id, 30, true, 'ROW-148 (c)');
  await change(team, member.id, 26, false, 'ROW-148 (c)');
  expect.soft(await daysLeft(actor, [2027, 2028]), 'ROW-148 (c): in 2027, this year corrected, next year kept').toEqual({ 2027: 26, 2028: 30 });
  await setTeamClock(AUCKLAND, '2028-01-01', '15:00');
  expect.soft(await daysLeft(await signInAgain(member), [2028, 2029]), 'ROW-148 (c): on 1 January 2028, 2029 uses 30').toEqual({ 2028: 30, 2029: 30 });
});

test('ROW-148.REQ-011.a-this-year-change-the-next-year-overrides-last-years-schedule', async () => {
  const { team, member } = await memberIn2027();
  await change(team, member.id, 30, true, 'ROW-148 (d)');
  await setTeamClock(AUCKLAND, '2028-03-10', '15:00');
  await change(team, member.id, 26, false, 'ROW-148 (d)');
  expect.soft(await daysLeft(await signInAgain(member), [2028, 2029]), 'ROW-148 (d): in 2028, 2029 uses 26').toEqual({ 2028: 26, 2029: 26 });
});
