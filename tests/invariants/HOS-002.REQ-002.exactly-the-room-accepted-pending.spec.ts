// Purpose: hostility probe HOS-002 (protects REQ-002) — through the send form, a vacation of exactly the year's days left minus its pending days is accepted and stored pending, this year and, with this year used up, next year.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14; fixture repaired by brief test-author-18 so no setup send fills a year's room exactly); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; the send form operated through harness.ts's engine door.
//
// Boundary: the probe row names its surface — "through the send-request form" — so the ask is made by pressing Send
// on /requests/new in the browser; what was stored is read back over HTTP on the person's own GET /api/requests and
// GET /api/balance.
import { test, expect } from '@playwright/test';
import { openPage } from './harness';
import { weekdaySpan, yearBalance } from './request-rules';
import { awaitStored, probeCalendar, sendThroughForm, spentFigures, spentTeam, stateAndKind, type Ask } from './balance-probes';

const CAL = probeCalendar();
const Y = CAL.Y;

// HOS-002 promise: REQ-002 fail-if (2) "a vacation request within that number is refused" (A-002: a person cannot
// HOS-002   request vacation beyond the allowance minus approved minus pending — so exactly that many is allowed); the
// HOS-002   probe row: exactly the days left minus pending, accepted pending, with nonzero approved and pending in the
// HOS-002   request's year, and a variant whose request is next year with this year used up.
// HOS-002 wrong product: a balance check that refuses at equality (">=" for ">", the row's disable: toggle); or one
// HOS-002   that subtracts pending twice, or counts this year's used-up figures against a next-year request.
// HOS-002 given: P with allowance A (fresh), this year a approved and p pending, room k = A − a − p ≥ 2; Q with
// HOS-002   allowance A, this year used up (c approved, A − c pending), next year b approved and q pending, room k2 ≥ 2.
// HOS-002   No setup send asks for exactly its year's room (spentTeam's noSendFillsAYear): Q is made with A + 1, spends
// HOS-002   both years leaving a day of room, and the admin then sets Q's allowance to A starting this year (REQ-011
// HOS-002   AMENDED: this year and every later year) — so the row's toggle, refusing at equality, can change only the
// HOS-002   probe's own send, never the fixture.
// HOS-002 when: P presses Send on the form for exactly k vacation weekdays this year; Q for exactly k2 next year.
// HOS-002 then: each is stored once, a pending vacation with the asked days; P's year reads {L, p + k}; Q's next year
// HOS-002   reads {L2, q + k2} and Q's this year is unchanged {A − c, A − c}.
// HOS-002 controls: the control case shows the fixture lands (Q's lowered allowance included: this year reads
// HOS-002   {A − c, A − c}, next year {L2, q}) and that the same form's press for k − 1 (P) and
// HOS-002   k2 − 1 (Q) days is stored — a send below the room, untouched by a check that refuses only at equality, so
// HOS-002   the form, the session and the store read work and the target measures the boundary alone.
// HOS-002 technique: the threshold exactly (k + 1 refused is HOS-001's), one day under as the control; the figures
// HOS-002   after, not only the stored record; fresh allowances so no figure can be hard-coded.
// HOS-002 cases: HOS-002 target=HOS-002.REQ-002.exactly-the-years-room-is-accepted-pending-through-the-form control=HOS-002.control.the-fixture-lands-and-one-day-under-the-room-is-stored
test('HOS-002.control.the-fixture-lands-and-one-day-under-the-room-is-stored', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f, { noSendFillsAYear: true });
  try {
    expect.soft(await yearBalance(t.p, Y), 'HOS-002 control: P this year').toEqual({ daysLeft: f.L, pending: f.p });
    expect.soft(await yearBalance(t.q, Y), 'HOS-002 control: Q this year is used up').toEqual({ daysLeft: f.A - f.c, pending: f.A - f.c });
    expect.soft(await yearBalance(t.q, Y + 1), 'HOS-002 control: Q next year').toEqual({ daysLeft: f.L2, pending: f.q });
    const cases: [typeof t.p, Ask, string][] = [
      [t.p, { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, f.k - 1) }, `P's ${f.k - 1} days this year (room ${f.k})`],
      [t.q, { kind: 'vacation', ...weekdaySpan(CAL.nextYearAsk, f.k2 - 1) }, `Q's ${f.k2 - 1} days next year (room ${f.k2})`],
    ];
    for (const [who, ask, label] of cases) {
      const opened = await openPage(browser, who);
      try {
        await sendThroughForm(opened.page, ask);
        expect.soft((await awaitStored(who, ask, 1)).length, `HOS-002 control: ${label}, sent through the form, are stored`).toBe(1);
      } finally {
        await opened.close();
      }
    }
  } finally {
    await t.dispose();
  }
});

test('HOS-002.REQ-002.exactly-the-years-room-is-accepted-pending-through-the-form', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f, { noSendFillsAYear: true });
  try {
    const cases: [typeof t.p, Ask, string, number, { daysLeft: number; pending: number }, { daysLeft: number; pending: number }][] = [
      [t.p, { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, f.k) }, `P's exactly ${f.k} days this year`, Y, { daysLeft: f.L, pending: f.p + f.k }, { daysLeft: f.A, pending: 0 }],
      [t.q, { kind: 'vacation', ...weekdaySpan(CAL.nextYearAsk, f.k2) }, `Q's exactly ${f.k2} days next year (this year used up)`, Y + 1, { daysLeft: f.L2, pending: f.q + f.k2 }, { daysLeft: f.A - f.c, pending: f.A - f.c }],
    ];
    for (const [who, ask, label, year, inYear, otherYear] of cases) {
      const opened = await openPage(browser, who);
      let said = '';
      try {
        const pressed = await sendThroughForm(opened.page, ask);
        said = pressed.appeared.join(' | ').slice(0, 300);
      } finally {
        await opened.close();
      }
      const stored = await awaitStored(who, ask, 1);
      expect.soft(stored.length, `HOS-002: ${label} — the press stored the request once (the page said: "${said}")`).toBe(1);
      expect.soft(stateAndKind(stored[0]), `HOS-002: ${label} — stored as a pending vacation`).toEqual({ state: 'pending', kind: 'vacation' });
      expect.soft(await yearBalance(who, year), `HOS-002: ${label} — the request's year now has every day spoken for`).toEqual(inYear);
      expect.soft(await yearBalance(who, year === Y ? Y + 1 : Y), `HOS-002: ${label} — the other year is untouched`).toEqual(otherYear);
    }
  } finally {
    await t.dispose();
  }
});
