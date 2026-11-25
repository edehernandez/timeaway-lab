// Purpose: hostility probe HOS-004 (protects REQ-002) — with no vacation days left, a sick request sent through the send form is accepted, and neither sending nor approving it changes the year's days left or pending vacation days, by the data, on the person's own page or on the people page.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; the send form, the own page and the people page opened through harness.ts's engine door.
//
// Boundary: the probe row names its surfaces — the sick request is sent by pressing Send on /requests/new, and the
// figures are read where the probe says they must stay: "the person's page" read as the person's own requests page
// "/" (REQ-007 draws each year's days left with its pending days there), and the admin's people page /admin/people
// (REQ-020 draws each year's days left there); GET /api/balance is read beside them. The approval is the admin's
// confirmed two-step action over HTTP (harness.ts approve), setup for the second half of the probe.
import { test, expect } from '@playwright/test';
import { approve, openPage, type AccountId } from './harness';
import { randomInt, setupTeam, spendVacation, weekdaySpan, yearBalance, type Team } from './request-rules';
import { readOwnFigures } from './page-figures';
import { awaitStored, peoplePart, probeCalendar, sendThroughForm, showsFigure, stateAndKind, storedCount, type Ask } from './balance-probes';

const CAL = probeCalendar();
const Y = CAL.Y;

// HOS-004 promise: REQ-002 fail-if (4) "a sick request is refused for lack of allowance or changes the days left";
// HOS-004   A-004: sick requests "have no limit and are never taken from the allowance"; A-002: days left counts
// HOS-004   approved vacation days, pending vacation days shown beside it; the probe row: with zero vacation days
// HOS-004   left, a sick request is accepted with days left unchanged, and after approval days left and that year's
// HOS-004   pending vacation days stay unchanged on the person's page and on the people page.
// HOS-004 wrong product: one balance check for every kind (the row's disable: toggle) — the sick request is refused;
// HOS-004   or sick days added to the year's pending figure; or approved sick days subtracted from days left.
// HOS-004 given: allowance A (fresh); Z0 with all A days of this year approved (days left 0, pending 0); Zp with a
// HOS-004   approved and A − a pending (days left L = A − a, pending L, room 0). s (fresh, 1 ≤ s < L, s ≠ a) is chosen
// HOS-004   so that the wrong figures — days left minus s, pending plus s — differ from every right one.
// HOS-004 when: each presses Send on the form for s sick weekdays this year; then the admin approves both.
// HOS-004 then: each sick request is stored once, pending, kind sick; after sending and after approving, both years'
// HOS-004   {daysLeft, pending} equal what they were before; the own page's figures for this year show days left and
// HOS-004   pending (0 and 0; L and L) and not days left − s or pending + s; the person's part of the people page
// HOS-004   shows this year's days left and not days left − s.
// HOS-004 controls: the control case shows the fixture: the data reads {0, 0} and {L, L}; a 1-day vacation sent
// HOS-004   through the same form is refused and stores nothing (zero days left is reached); the own page and the
// HOS-004   people page draw the figures the target reads.
// HOS-004 technique: before/after across two actions (send, approve); the edge of zero days left in both readings
// HOS-004   (nothing left at all; nothing left after pending); decoy figures that only a wrong product draws.
// HOS-004 cases: HOS-004 target=HOS-004.REQ-002.a-sick-request-with-no-days-left-is-accepted-and-changes-no-figure control=HOS-004.control.no-vacation-day-is-left-and-the-pages-draw-the-figures
function sickFigures(): { A: number; a: number; L: number; s: number } {
  for (;;) {
    const A = randomInt(8, 14);
    const a = randomInt(2, A - 3);
    const L = A - a;
    const s = randomInt(1, L - 1);
    if (s !== a) return { A, a, L, s };
  }
}

interface Fixture {
  team: Team;
  /** Z0 and Zp: a label, the index into team.people and team.members, and this year's days left (= its pending). */
  people: { label: string; index: number; left: number }[];
  others(index: number): string[];
}

async function zeroLeft(f: ReturnType<typeof sickFigures>): Promise<Fixture> {
  const team = await setupTeam({ now: CAL.now, allowances: [f.A, f.A] });
  try {
    await spendVacation(team.admin, team.people[0], CAL.thisYearSpend, f.A, 0);
    await spendVacation(team.admin, team.people[1], CAL.thisYearSpend, f.a, f.A - f.a);
  } catch (e) {
    await team.dispose();
    throw e;
  }
  const emails = [team.install.admin.email, ...team.members.map((m) => m.email)];
  return {
    team,
    people: [
      { label: 'Z0 (all approved)', index: 0, left: 0 },
      { label: 'Zp (approved and pending)', index: 1, left: f.L },
    ],
    others: (i) => emails.filter((e) => e !== team.members[i].email),
  };
}

test('HOS-004.control.no-vacation-day-is-left-and-the-pages-draw-the-figures', async ({ browser }) => {
  const f = sickFigures();
  const z = await zeroLeft(f);
  try {
    for (const p of z.people) {
      const who = z.team.people[p.index];
      const member = z.team.members[p.index];
      expect.soft(await yearBalance(who, Y), `HOS-004 control: ${p.label} this year`).toEqual({ daysLeft: p.left, pending: p.left });
      const ask: Ask = { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, 1) };
      const n = await storedCount(who);
      const opened = await openPage(browser, who);
      try {
        await sendThroughForm(opened.page, ask);
      } finally {
        await opened.close();
      }
      expect.soft(await storedCount(who), `HOS-004 control: ${p.label} — a 1-day vacation through the form is refused`).toBe(n);
      const own = (await readOwnFigures(browser, who, [Y, Y + 1])).years[Y] ?? '';
      expect.soft(showsFigure(own, p.left, [], [member.name, member.email]), `HOS-004 control: ${p.label} — the own page draws this year's ${p.left} (read: "${own}")`).toBe(true);
      const part = await peoplePart(browser, z.team.admin, member, z.others(p.index));
      expect.soft(part.found, `HOS-004 control: ${p.label} — the people page draws the person's part`).toBe(true);
      expect.soft(showsFigure(part.text, p.left), `HOS-004 control: ${p.label} — the people page draws this year's days left ${p.left} (read: "${part.text}")`).toBe(true);
    }
  } finally {
    await z.team.dispose();
  }
});

test('HOS-004.REQ-002.a-sick-request-with-no-days-left-is-accepted-and-changes-no-figure', async ({ browser }) => {
  const f = sickFigures();
  const z = await zeroLeft(f);
  const sick: Ask = { kind: 'sick', ...weekdaySpan(CAL.thisYearAsk, f.s) };
  try {
    const before = new Map<number, { y: { daysLeft: number; pending: number }; y1: { daysLeft: number; pending: number } }>();
    for (const p of z.people) {
      const who = z.team.people[p.index];
      before.set(p.index, { y: await yearBalance(who, Y), y1: await yearBalance(who, Y + 1) });
    }

    const ids: AccountId[] = [];
    for (const p of z.people) {
      const who = z.team.people[p.index];
      const opened = await openPage(browser, who);
      let said = '';
      try {
        said = (await sendThroughForm(opened.page, sick)).appeared.join(' | ').slice(0, 300);
      } finally {
        await opened.close();
      }
      const stored = await awaitStored(who, sick, 1);
      expect.soft(stored.length, `HOS-004: ${p.label} — the ${f.s}-day sick request sent through the form is accepted and stored (the page said: "${said}")`).toBe(1);
      expect.soft(stateAndKind(stored[0]), `HOS-004: ${p.label} — stored as a pending sick request`).toEqual({ state: 'pending', kind: 'sick' });
      if (stored[0]) ids.push(stored[0].id);
    }

    const check = async (moment: string) => {
      for (const p of z.people) {
        const who = z.team.people[p.index];
        const member = z.team.members[p.index];
        const was = before.get(p.index)!;
        expect.soft(await yearBalance(who, Y), `HOS-004 ${moment}: ${p.label} — this year's figures are unchanged`).toEqual(was.y);
        expect.soft(await yearBalance(who, Y + 1), `HOS-004 ${moment}: ${p.label} — next year's figures are unchanged`).toEqual(was.y1);
        const own = (await readOwnFigures(browser, who, [Y, Y + 1])).years[Y] ?? '';
        const lit = [member.name, member.email];
        expect.soft(showsFigure(own, p.left, [], lit), `HOS-004 ${moment}: ${p.label} — the own page still shows this year's days left and pending ${p.left} (read: "${own}")`).toBe(true);
        expect.soft(showsFigure(own, p.left - f.s, [], lit), `HOS-004 ${moment}: ${p.label} — the own page does not show days left less the sick days, ${p.left - f.s} (read: "${own}")`).toBe(false);
        expect.soft(showsFigure(own, p.left + f.s, [], lit), `HOS-004 ${moment}: ${p.label} — the own page does not show pending plus the sick days, ${p.left + f.s} (read: "${own}")`).toBe(false);
        const part = await peoplePart(browser, z.team.admin, member, z.others(p.index));
        expect.soft(showsFigure(part.text, p.left), `HOS-004 ${moment}: ${p.label} — the people page still shows this year's days left ${p.left} (read: "${part.text}")`).toBe(true);
        expect.soft(showsFigure(part.text, p.left - f.s), `HOS-004 ${moment}: ${p.label} — the people page does not show days left less the sick days, ${p.left - f.s} (read: "${part.text}")`).toBe(false);
      }
    };
    await check('after sending');
    for (const id of ids) await approve(z.team.admin, id);
    await check('after approving');
  } finally {
    await z.team.dispose();
  }
});
