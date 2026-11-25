// Purpose: hostility probe HOS-001 (protects REQ-002) — through the send form, a vacation of one counted day more than the allowance minus the approved and pending days of its year is refused and nothing is stored, this year and, with this year used up, next year.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; the send form operated through harness.ts's engine door.
//
// Boundary: the probe row names its surface — "through the send-request form" — so the forbidden thing is attempted
// by pressing Send on /requests/new in the browser; the forbidden effect (a stored request) is read back over HTTP
// on the person's own GET /api/requests and GET /api/balance, never from a guard or a message.
import { test, expect } from '@playwright/test';
import { openPage } from './harness';
import { weekdaySpan, yearBalance } from './request-rules';
import { awaitStored, probeCalendar, sendThroughForm, spentFigures, spentTeam, storedCount, storedFor, type Ask } from './balance-probes';

const CAL = probeCalendar();
const Y = CAL.Y;

// HOS-001 promise: REQ-002 fail-if (1) "a vacation request whose counted days exceed the allowance minus the approved
// HOS-001   and pending vacation days of its year is accepted" (A-001: "the request cannot be sent; it is refused";
// HOS-001   A-002: no vacation beyond the allowance minus approved minus pending); the probe row: nonzero approved and
// HOS-001   nonzero pending in the request's year, and a variant whose request is next year with this year used up.
// HOS-001 wrong product: the send path with no balance check (the row's disable: toggle) — the form's request is
// HOS-001   stored pending; or a check that counts approved days only, or this year's figures for a next-year request.
// HOS-001 given: P with allowance A (fresh), this year a approved and p pending, room k = A − a − p ≥ 2; Q with
// HOS-001   allowance A, this year used up (c approved, A − c pending), next year b approved and q pending, room k2 ≥ 2.
// HOS-001 when: P presses Send on the form for k + 1 vacation weekdays this year; Q for k2 + 1 next year.
// HOS-001 then: neither is stored — the person's request count is what it was before the press, no request carries
// HOS-001   the asked days, and both years' {daysLeft, pending} are what they were.
// HOS-001 controls: the control case shows the fixture lands (P {L, p}; Q this year {A − c, A − c}, next year
// HOS-001   {L2, q}) and that the same form's press for exactly k (P, this year) and k2 (Q, next year) days is stored —
// HOS-001   the form reaches the server and the store read sees a form send, with or without the balance check.
// HOS-001 technique: the threshold's over side, one day past the room, in each year; before/after on the stored count
// HOS-001   and both years' figures; fresh allowances so no figure can be hard-coded.
// HOS-001 cases: HOS-001 target=HOS-001.REQ-002.one-day-over-the-years-room-is-refused-through-the-form-and-nothing-stored control=HOS-001.control.the-fixture-lands-and-a-send-within-the-room-is-stored
test('HOS-001.control.the-fixture-lands-and-a-send-within-the-room-is-stored', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f);
  try {
    expect.soft(await yearBalance(t.p, Y), 'HOS-001 control: P this year').toEqual({ daysLeft: f.L, pending: f.p });
    expect.soft(await yearBalance(t.q, Y), 'HOS-001 control: Q this year is used up').toEqual({ daysLeft: f.A - f.c, pending: f.A - f.c });
    expect.soft(await yearBalance(t.q, Y + 1), 'HOS-001 control: Q next year').toEqual({ daysLeft: f.L2, pending: f.q });
    const cases: [typeof t.p, Ask, string][] = [
      [t.p, { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, f.k) }, `P's ${f.k} days this year`],
      [t.q, { kind: 'vacation', ...weekdaySpan(CAL.nextYearAsk, f.k2) }, `Q's ${f.k2} days next year`],
    ];
    for (const [who, ask, label] of cases) {
      const opened = await openPage(browser, who);
      try {
        await sendThroughForm(opened.page, ask);
        expect.soft((await awaitStored(who, ask, 1)).length, `HOS-001 control: ${label}, sent through the form, are stored`).toBe(1);
      } finally {
        await opened.close();
      }
    }
  } finally {
    await t.dispose();
  }
});

test('HOS-001.REQ-002.one-day-over-the-years-room-is-refused-through-the-form-and-nothing-stored', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f);
  try {
    const cases: [typeof t.p, Ask, string][] = [
      [t.p, { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, f.k + 1) }, `P's ${f.k + 1} days this year (room ${f.k})`],
      [t.q, { kind: 'vacation', ...weekdaySpan(CAL.nextYearAsk, f.k2 + 1) }, `Q's ${f.k2 + 1} days next year (room ${f.k2}, this year used up)`],
    ];
    for (const [who, ask, label] of cases) {
      const before = { count: await storedCount(who), y: await yearBalance(who, Y), y1: await yearBalance(who, Y + 1) };
      const opened = await openPage(browser, who);
      let said = '';
      try {
        const pressed = await sendThroughForm(opened.page, ask);
        said = pressed.appeared.join(' | ').slice(0, 300);
      } finally {
        await opened.close();
      }
      expect.soft(await storedCount(who), `HOS-001: ${label} — the press stored no request (the page said: "${said}")`).toBe(before.count);
      expect.soft((await storedFor(who, ask)).map((r) => JSON.stringify(r.raw)), `HOS-001: ${label} — no request carries the asked days`).toEqual([]);
      expect.soft(await yearBalance(who, Y), `HOS-001: ${label} — this year's figures are unchanged`).toEqual(before.y);
      expect.soft(await yearBalance(who, Y + 1), `HOS-001: ${label} — next year's figures are unchanged`).toEqual(before.y1);
    }
  } finally {
    await t.dispose();
  }
});
