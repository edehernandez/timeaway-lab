// Purpose: hostility probe HOS-005 (protects REQ-002) — two vacation requests sent through the send form at the same moment, each within the year's room alone but over it together, never both stored.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; two send forms opened through harness.ts's engine door.
//
// Boundary: the probe row names its surface — "through the send-request form" — so the two sends are two browser
// pages of the same person, each with the form on /requests/new filled, whose Send buttons are pressed at the same
// moment; what was stored is read back over HTTP on the person's own GET /api/requests and GET /api/balance.
import { test, expect } from '@playwright/test';
import { addDays, randomInt, setupTeam, spendVacation, weekdaySpan, yearBalance } from './request-rules';
import { awaitStored, openPages, pressTogether, probeCalendar, sendThroughForm, storedCount, storedFor, type Ask } from './balance-probes';

const CAL = probeCalendar();
const Y = CAL.Y;
const ROUNDS = 3;

// HOS-005 promise: REQ-002 fail-if (5) "two vacation requests sent at the same moment are both accepted although
// HOS-005   together they exceed the days left"; D-005 (the balance check and the insert inside one write transaction
// HOS-005   taken immediately); the probe row: two such sends through the form, exactly one stored.
// HOS-005 wrong product: a balance read outside the write transaction with an await before the insert (the row's
// HOS-005   disable: toggle, with its pause between the read and the insert) — each send reads the same room, each
// HOS-005   passes, both are stored.
// HOS-005 given: per round a fresh member with allowance A = a + p + 3 (a, p fresh), this year a approved and p
// HOS-005   pending, so the room is exactly 3; two asks of 2 vacation weekdays on different weeks of June — each fits
// HOS-005   alone, the two together (4) do not.
// HOS-005 when: the member's two pages each fill the form with one ask, then both Send buttons are pressed at once.
// HOS-005 then: exactly one of the two asks is stored; the member's stored count rose by exactly one; the year reads
// HOS-005   {A − a, p + 2} — pending never p + 4.
// HOS-005 controls: the control case presses the same two asks on the member's two pages one after the other: the
// HOS-005   first is stored and the second refused — both pages' forms reach the server, the sequential check works,
// HOS-005   and the two asks really are over the room together, so the target measures the simultaneous case only.
// HOS-005 technique: a race through the real control, repeated over three fresh members; the store read after (the
// HOS-005   stored count, the asks' records and the year's figures), never the pages' messages.
// HOS-005 cases: HOS-005 target=HOS-005.REQ-002.two-form-sends-at-the-same-moment-never-both-stored control=HOS-005.control.the-same-two-sends-one-after-the-other-store-one
function figures(): { A: number; a: number; p: number } {
  const a = randomInt(2, 4);
  const p = randomInt(1, 3);
  return { A: a + p + 3, a, p };
}

function twoAsks(): [Ask, Ask] {
  return [
    { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, 2) },
    { kind: 'vacation', ...weekdaySpan(addDays(CAL.thisYearAsk, 14), 2) },
  ];
}

test('HOS-005.control.the-same-two-sends-one-after-the-other-store-one', async ({ browser }) => {
  const f = figures();
  const team = await setupTeam({ now: CAL.now, allowances: [f.A] });
  const [m] = team.people;
  const pages = await openPages(browser, m, 2);
  try {
    await spendVacation(team.admin, m, CAL.thisYearSpend, f.a, f.p);
    expect.soft(await yearBalance(m, Y), 'HOS-005 control: the room is exactly 3').toEqual({ daysLeft: f.A - f.a, pending: f.p });
    const [first, second] = twoAsks();
    await sendThroughForm(pages[0].page, first);
    expect.soft((await awaitStored(m, first, 1)).length, 'HOS-005 control: the first send is stored').toBe(1);
    const n = await storedCount(m);
    await sendThroughForm(pages[1].page, second);
    expect.soft(await storedCount(m), 'HOS-005 control: the second send, over the room with the first, is refused').toBe(n);
    expect.soft(await storedFor(m, second), 'HOS-005 control: no request carries the second ask').toEqual([]);
  } finally {
    for (const o of pages) await o.close();
    await team.dispose();
  }
});

test('HOS-005.REQ-002.two-form-sends-at-the-same-moment-never-both-stored', async ({ browser }) => {
  for (let round = 1; round <= ROUNDS; round += 1) {
    const f = figures();
    const team = await setupTeam({ now: CAL.now, allowances: [f.A] });
    const [m] = team.people;
    const pages = await openPages(browser, m, 2);
    try {
      await spendVacation(team.admin, m, CAL.thisYearSpend, f.a, f.p);
      const n = await storedCount(m);
      const asks = twoAsks();
      await pressTogether(
        pages.map((o) => o.page),
        asks,
      );
      const stored = (await storedFor(m, asks[0])).length + (await storedFor(m, asks[1])).length;
      expect.soft(stored, `HOS-005 round ${round}: exactly one of the two simultaneous sends is stored`).toBe(1);
      expect.soft(await storedCount(m), `HOS-005 round ${round}: the stored count rose by exactly one`).toBe(n + 1);
      expect.soft(await yearBalance(m, Y), `HOS-005 round ${round}: the year is never overdrawn`).toEqual({ daysLeft: f.A - f.a, pending: f.p + 2 });
    } finally {
      for (const o of pages) await o.close();
      await team.dispose();
    }
  }
});
