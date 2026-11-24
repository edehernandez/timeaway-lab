// Purpose: ledger tests for ROW-151 and ROW-152 (REQ-023, INV-001) — the allowance of any year is, among the changes starting at or before it, the one with the latest starting year and among those the most recently made; nothing is created when a year begins, a read never writes, two changes at the same moment are both kept in order; and its control, one change just after New Year written once.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; the expected allowances worked out by the tests' own model of D-025's rule, written here, never taken from the product.
//
// Boundary (R6): rules at the HTTP harness — the admin's POST /api/admin/accounts/:id/allowance {allowance,
// startsNextYear}, the person's GET /api/balance (no request is made, so days left = the allowance in force), and the
// person's history GET /api/admin/people/:id/history (A-023: every allowance change is recorded), read by value.
// The team clock holds still between moves (harness setClock), so two changes made with no move between them are made
// at the same moment.
import { test, expect } from '@playwright/test';
import {
  addMember,
  AUCKLAND,
  disposeAll,
  historyOf,
  isAccepted,
  numberLeaves,
  setTeamClock,
  signInAgain,
  startTeam,
  teamInstant,
  tryAllowance,
  yearFigures,
  type Team,
} from './team-calendar';
import type { AccountId, Actor } from './harness';

test.afterEach(async () => {
  await disposeAll();
});

const START = teamInstant(AUCKLAND, '2027-03-10', '15:00');

/** D-025's rule, as the tests' own model: among changes starting at or before `year`, the latest start; among those, the last made. */
function modelAllowance(changes: { start: number; value: number }[], year: number): number | undefined {
  let best: { start: number; value: number; seq: number } | undefined;
  changes.forEach((c, seq) => {
    if (c.start > year) return;
    if (!best || c.start > best.start || (c.start === best.start && seq > best.seq)) best = { ...c, seq };
  });
  return best?.value;
}

/** A small seeded generator (mulberry32), so a failing run names its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function change(team: Team, id: AccountId, allowance: number, startsNextYear: boolean, say: string): Promise<void> {
  const a = await tryAllowance(team.admin, id, { allowance, startsNextYear });
  expect(isAccepted(a), `${say}: the change to ${allowance} starting ${startsNextYear ? 'next' : 'this'} year is accepted (answered ${a.status})`).toBe(true);
}

async function figuresOf(actor: Actor, year: number): Promise<[number | undefined, number | undefined]> {
  return [(await yearFigures(actor, year))?.daysLeft, (await yearFigures(actor, year + 1))?.daysLeft];
}

// ---------------------------------------------------------------------------------------------------
// ROW-151 promise: REQ-023 (the allowance in force for each calendar year; a year keeps the allowance it had when a
// ROW-151   later change applies only from a later year on) and INV-001 (days left = that year's allowance − its approved
// ROW-151   days), with D-025: the allowance of any year is, among the changes starting at or before it, the one with
// ROW-151   the latest starting year, and among those the most recently made; nothing is created when a year begins, a
// ROW-151   read never writes, two changes at the same moment are both kept in order.
// ROW-151 wrong product: "the most recently made change wins" (D-019's reading, losing a scheduled next-year change);
// ROW-151   ordering by the made-at time alone, so two changes in the same instant come back in any order (the first, the
// ROW-151   larger); a keyed row per year that the second change of an instant overwrites or that the first read of a
// ROW-151   new year writes (and so records in the history).
// ROW-151 given / when / then: (property) generated sequences of this-year and next-year changes, with clock moves of
// ROW-151   a year between some, on a fresh member each — after every step the current and next year's days left equal
// ROW-151   the model's; (example) at one instant, member A set 47 then 53 reads 53, member B set 53 then 47 reads 47,
// ROW-151   and A's history holds both 47 and 53; (reads) a member's history is the same after reading its balance in
// ROW-151   2027, on 1 January 2028 and on 1 January 2029 as it was before those reads, and each year reads the allowance.
// ROW-151 controls: ROW-152's case — one change just after New Year, read back at once and written once — shows the
// ROW-151   route, the balance and the history reading work.
// ROW-151 technique: "for any year" as a property over generated change sequences against an independent model (the
// ROW-151   seed in every message), plus one named example of the same-instant order and the before/after history.
// ROW-151 cases: ROW-151 target=ROW-151.REQ-023.any-years-allowance-follows-the-rule-over-generated-changes control=ROW-152.REQ-023.a-single-change-after-new-year-is-written-once
test('ROW-151.REQ-023.any-years-allowance-follows-the-rule-over-generated-changes', async () => {
  const seed = Date.now() % 4294967296;
  const next = rng(seed);
  for (let run = 0; run < 5; run += 1) {
    const team = await startTeam({ zone: AUCKLAND, now: START });
    const initial = 10 + Math.floor(next() * 40);
    const { member } = await addMember(team, { allowance: initial });
    let actor = await signInAgain(member);
    let year = 2027;
    const changes: { start: number; value: number }[] = [{ start: 2027, value: initial }];
    const steps: string[] = [`create ${initial}`];
    const count = 4 + Math.floor(next() * 4);
    for (let i = 0; i < count; i += 1) {
      const r = next();
      if (r < 0.25 && year < 2029) {
        year += 1;
        await setTeamClock(AUCKLAND, `${year}-03-10`, '15:00');
        actor = await signInAgain(member);
        steps.push(`clock to ${year}`);
      } else {
        const startsNextYear = r >= 0.6;
        const value = 1 + Math.floor(next() * 60);
        await change(team, member.id, value, startsNextYear, `ROW-151 seed ${seed} run ${run}`);
        changes.push({ start: startsNextYear ? year + 1 : year, value });
        steps.push(`${startsNextYear ? 'next' : 'this'}-year ${value}`);
      }
      const want = [modelAllowance(changes, year), modelAllowance(changes, year + 1)];
      expect.soft(await figuresOf(actor, year), `ROW-151 seed ${seed} run ${run} after [${steps.join(', ')}]: ${year} and ${year + 1}`).toEqual(want);
    }
    await disposeAll();
  }
});

test('ROW-151.REQ-023.two-changes-at-the-same-moment-are-kept-in-order', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: START });
  const a = await addMember(team, { allowance: 20 });
  const b = await addMember(team, { allowance: 20 });
  await change(team, a.member.id, 47, false, 'ROW-151 A');
  await change(team, a.member.id, 53, false, 'ROW-151 A');
  await change(team, b.member.id, 53, false, 'ROW-151 B');
  await change(team, b.member.id, 47, false, 'ROW-151 B');
  expect.soft(await figuresOf(a.actor, 2027), 'ROW-151: A set 47 then 53 in one instant reads 53').toEqual([53, 53]);
  expect.soft(await figuresOf(b.actor, 2027), 'ROW-151: B set 53 then 47 in one instant reads 47').toEqual([47, 47]);
  const nums = numberLeaves(await historyOf(team.admin, a.member.id));
  expect.soft(nums, "ROW-151: A's history keeps the change to 47").toContain(47);
  expect.soft(nums, "ROW-151: A's history keeps the change to 53").toContain(53);
});

test('ROW-151.INV-001.a-read-never-writes', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: START });
  const { member, actor } = await addMember(team, { allowance: 24 });
  const before = await historyOf(team.admin, member.id);
  expect.soft(await figuresOf(actor, 2027), 'ROW-151 reads: 2027').toEqual([24, 24]);
  for (const y of [2028, 2029]) {
    await setTeamClock(AUCKLAND, `${y}-01-01`, '15:00');
    const again = await signInAgain(member);
    expect.soft(await figuresOf(again, y), `ROW-151 reads: on 1 January ${y}`).toEqual([24, 24]);
    expect.soft(await figuresOf(again, y), `ROW-151 reads: on 1 January ${y}, read twice`).toEqual([24, 24]);
  }
  expect.soft(await historyOf(team.admin, member.id), 'ROW-151 reads: the history is unchanged by the reads and the New Years').toEqual(before);
});

// ---------------------------------------------------------------------------------------------------
// ROW-152 promise: control of ROW-151 — REQ-023 and INV-001 with D-025 and A-023 (an allowance change is recorded):
// ROW-152   a single allowance change just after New Year writes that year's record once and days left reflect it.
// ROW-152 wrong product: one whose first touch of a new year writes a record and so the change lands twice (or not at
// ROW-152   all, the new year's row shadowing it), or that applies a this-year change made on 1 January to the year
// ROW-152   just ended.
// ROW-152 given: a member created in March 2027 with 25. when: on 1 January 2028 at 15:00 the admin sets 19 starting
// ROW-152   this year. then: 2028 and 2029 read 19, and the history holds the value 19 exactly once.
// ROW-152 controls: the control case reads the same moment before the change: 2028 and 2029 read 25 and the history
// ROW-152   holds no 19 — so the 19 after is the change's.
// ROW-152 technique: before and after the one change, the record counted (exactly once), never "somewhere".
// ROW-152 cases: ROW-152 target=ROW-152.REQ-023.a-single-change-after-new-year-is-written-once control=ROW-152.control.just-after-new-year-before-the-change
async function januaryMember() {
  const team = await startTeam({ zone: AUCKLAND, now: START });
  const { member } = await addMember(team, { allowance: 25 });
  await setTeamClock(AUCKLAND, '2028-01-01', '15:00');
  const actor = await signInAgain(member);
  return { team, member, actor };
}

test('ROW-152.control.just-after-new-year-before-the-change', async () => {
  const { team, member, actor } = await januaryMember();
  expect(await figuresOf(actor, 2028), 'ROW-152 control: 2028 and 2029 read 25').toEqual([25, 25]);
  expect(numberLeaves(await historyOf(team.admin, member.id)), 'ROW-152 control: no 19 in the history yet').not.toContain(19);
});

test('ROW-152.REQ-023.a-single-change-after-new-year-is-written-once', async () => {
  const { team, member, actor } = await januaryMember();
  expect(numberLeaves(await historyOf(team.admin, member.id)), 'ROW-152 before: no 19 in the history').not.toContain(19);
  await change(team, member.id, 19, false, 'ROW-152');
  expect.soft(await figuresOf(actor, 2028), 'ROW-152: 2028 and 2029 read 19 at once').toEqual([19, 19]);
  expect.soft(numberLeaves(await historyOf(team.admin, member.id)).filter((n) => n === 19).length, 'ROW-152: the change is recorded exactly once').toBe(1);
});
