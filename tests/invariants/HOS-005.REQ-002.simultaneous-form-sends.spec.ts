// Purpose: hostility probe HOS-005 (protects REQ-002) — two vacation requests sent through the send form at the same moment, each within the year's room alone but over it together, never both stored.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14; repaired by brief test-author-18 — sends held and released together at the browser's network layer, separate sessions); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; two send forms opened through harness.ts's engine door.
//
// Boundary: the probe row names its surface — "through the send-request form" — so the two sends are two browser
// pages of the same person, each with the form on /requests/new filled, whose Send buttons are pressed together; the
// request each press sends is held at the browser's network layer until both are held and then released together
// (balance-probes.ts pressAtOnce), so both have left the browser before the product answers either. What was stored
// is read back over HTTP on the person's own GET /api/requests and GET /api/balance.
import { test, expect, type Browser } from '@playwright/test';
import { openPage, signInMember, type Actor, type Opened } from './harness';
import { addDays, randomInt, setupTeam, spendVacation, weekdaySpan, weekdaysIn, yearBalance, type Team } from './request-rules';
import { awaitStored, pressAtOnce, probeCalendar, sendThroughFormWatched, storedCount, storedFor, type Ask } from './balance-probes';

const CAL = probeCalendar();
const Y = CAL.Y;
const ROUNDS = 4;

// HOS-005 promise: REQ-002 fail-if (5) "two vacation requests sent at the same moment are both accepted although
// HOS-005   together they exceed the days left"; D-005 (the balance check and the insert inside one write transaction
// HOS-005   taken immediately); the probe row: two such sends through the form, exactly one stored.
// HOS-005 wrong product: a balance read outside the write transaction with an await before the insert (the row's
// HOS-005   disable: toggle, with its pause between the read and the insert) — each send reads the same room, each
// HOS-005   passes, both are stored.
// HOS-005 given: per round a fresh member with allowance A = a + p + 3 (a, p fresh), this year a approved and p
// HOS-005   pending, so the room is exactly 3; two asks of 2 vacation weekdays, Monday–Tuesday of June's first week and
// HOS-005   of two weeks later — they share no weekday, so the overlap rule (REQ-003) cannot refuse either; each fits
// HOS-005   alone (2 ≤ 3), the two together (4) do not. Odd rounds send from two sessions of the member (two sign-ins,
// HOS-005   as from two devices), even rounds from two tabs of one session — so nothing tied to one session can stand in
// HOS-005   for the balance guard.
// HOS-005 when: the member's two pages each fill the form with one ask; both Send buttons are pressed together and
// HOS-005   each press's request is held in its page until both are held, then both are released at once — both sends
// HOS-005   have left the browser before either answer arrives, whatever the clicks' own timing.
// HOS-005 then: exactly one of the two asks is stored; the member's stored count rose by exactly one; the year reads
// HOS-005   {A − a, p + 2} — pending never p + 4.
// HOS-005 controls: the control case sends the same two asks one after the other, for two members in both orders:
// HOS-005   whichever is first is stored (each ask fits alone), the second is not (together they exceed the room) — the
// HOS-005   fixture, the form and the sequential check work, so the target measures the simultaneous case only. In the
// HOS-005   target, a press whose request never leaves its page is a SetupError (pressAtOnce), never a pass.
// HOS-005 technique: a race through the real control, its two sends synchronised at the browser's network layer so
// HOS-005   the race window is reached every round, repeated over four fresh members; the store read after (the stored
// HOS-005   count, the asks' records and the year's figures), never the pages' messages.
// HOS-005 cases: HOS-005 target=HOS-005.REQ-002.two-form-sends-at-the-same-moment-never-both-stored control=HOS-005.control.the-same-two-sends-one-after-the-other-store-one
function figures(): { A: number; a: number; p: number } {
  const a = randomInt(2, 4);
  const p = randomInt(1, 3);
  return { A: a + p + 3, a, p };
}

function twoAsks(): [Ask, Ask] {
  const asks: [Ask, Ask] = [
    { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, 2) },
    { kind: 'vacation', ...weekdaySpan(addDays(CAL.thisYearAsk, 14), 2) },
  ];
  const shared = weekdaysIn(asks[0].firstDay, asks[0].lastDay).filter((d) => weekdaysIn(asks[1].firstDay, asks[1].lastDay).includes(d));
  if (shared.length > 0) throw new Error(`HOS-005 setup: the two asks share ${shared.join(', ')}`);
  return asks;
}

/** Two pages of the member: from two sessions (the member's and a second sign-in) or two tabs of the member's one session. */
async function twoPages(browser: Browser, team: Team, index: number, twoSessions: boolean): Promise<{ pages: Opened[]; extra: Actor[] }> {
  const m = team.people[index];
  const extra: Actor[] = [];
  const second = twoSessions ? await signInMember(team.members[index]) : m;
  if (twoSessions) extra.push(second);
  return { pages: [await openPage(browser, m), await openPage(browser, second)], extra };
}

test('HOS-005.control.the-same-two-sends-one-after-the-other-store-one', async ({ browser }) => {
  const f = figures();
  const team = await setupTeam({ now: CAL.now, allowances: [f.A, f.A] });
  const opened: Opened[] = [];
  const extra: Actor[] = [];
  try {
    const [ask0, ask1] = twoAsks();
    const orders: [number, Ask, Ask, string][] = [
      [0, ask0, ask1, 'member 1, the first week then the third'],
      [1, ask1, ask0, 'member 2, the third week then the first'],
    ];
    for (const [i, first, second, label] of orders) {
      const m = team.people[i];
      await spendVacation(team.admin, m, CAL.thisYearSpend, f.a, f.p);
      expect.soft(await yearBalance(m, Y), `HOS-005 control: ${label} — the room is exactly 3`).toEqual({ daysLeft: f.A - f.a, pending: f.p });
      const two = await twoPages(browser, team, i, true);
      opened.push(...two.pages);
      extra.push(...two.extra);
      const one = await sendThroughFormWatched(two.pages[0].page, first);
      expect.soft((await awaitStored(m, first, 1)).length, `HOS-005 control: ${label} — the first send alone is stored (sent: ${one.sent}, status ${one.status})`).toBe(1);
      const n = await storedCount(m);
      const other = await sendThroughFormWatched(two.pages[1].page, second);
      expect.soft(await storedCount(m), `HOS-005 control: ${label} — the second send, over the room with the first, stores nothing (sent: ${other.sent}, status ${other.status})`).toBe(n);
      expect.soft(await storedFor(m, second), `HOS-005 control: ${label} — no request carries the second ask`).toEqual([]);
      expect.soft(await yearBalance(m, Y), `HOS-005 control: ${label} — the year after both sends`).toEqual({ daysLeft: f.A - f.a, pending: f.p + 2 });
    }
  } finally {
    for (const o of opened) await o.close();
    for (const a of extra) await a.dispose();
    await team.dispose();
  }
});

test('HOS-005.REQ-002.two-form-sends-at-the-same-moment-never-both-stored', async ({ browser }) => {
  for (let round = 1; round <= ROUNDS; round += 1) {
    const twoSessions = round % 2 === 1;
    const how = twoSessions ? 'two sessions' : 'two tabs of one session';
    const f = figures();
    const team = await setupTeam({ now: CAL.now, allowances: [f.A] });
    const [m] = team.people;
    let two: { pages: Opened[]; extra: Actor[] } = { pages: [], extra: [] };
    try {
      await spendVacation(team.admin, m, CAL.thisYearSpend, f.a, f.p);
      two = await twoPages(browser, team, 0, twoSessions);
      const n = await storedCount(m);
      const asks = twoAsks();
      const pressed = await pressAtOnce(
        two.pages.map((o) => o.page),
        asks,
      );
      const said = pressed.map((x, i) => `send ${i + 1}: status ${x.status}`).join('; ');
      const stored = (await storedFor(m, asks[0])).length + (await storedFor(m, asks[1])).length;
      expect.soft(stored, `HOS-005 round ${round} (${how}): exactly one of the two simultaneous sends is stored (${said})`).toBe(1);
      expect.soft(await storedCount(m), `HOS-005 round ${round} (${how}): the stored count rose by exactly one`).toBe(n + 1);
      expect.soft(await yearBalance(m, Y), `HOS-005 round ${round} (${how}): the year is never overdrawn`).toEqual({ daysLeft: f.A - f.a, pending: f.p + 2 });
    } finally {
      for (const o of two.pages) await o.close();
      for (const a of two.extra) await a.dispose();
      await team.dispose();
    }
  }
});
