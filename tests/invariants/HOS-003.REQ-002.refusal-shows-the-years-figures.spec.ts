// Purpose: hostility probe HOS-003 (protects REQ-002) — through the send form, a vacation refused for lack of days draws a refusal showing that year's days left and that year's pending days, this year and, with this year used up, next year.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-14); fixture data made through the product's public routes by harness.ts, request-rules.ts and balance-probes.ts (reset, accounts, requests, approval), fresh per run; the send form operated through harness.ts's engine door.
//
// Boundary: what a refusal shows is paint and operation, so it is read on the page the person pressed Send on
// (/requests/new): the refusal is the text the press made appear (lines absent before the press, present after;
// balance-probes.ts), so figures the page already showed before the press never count as the refusal's.
import { test, expect } from '@playwright/test';
import { openPage } from './harness';
import { weekdaySpan } from './request-rules';
import { probeCalendar, sendThroughForm, showsFigure, spentFigures, spentTeam, storedCount, type Ask } from './balance-probes';

const CAL = probeCalendar();

// HOS-003 promise: REQ-002 fail-if (3) "the refusal does not show that year's days left together with that year's
// HOS-003   pending vacation days" (A-001: refused "and the days left are shown"; A-002: days left counts approved
// HOS-003   days, "with pending days shown beside it"; D-037: the allowance refusal names the year's days left and its
// HOS-003   pending days as numbers); the probe row: the refusal's figures match the request's year.
// HOS-003 wrong product: a bare "Not enough days left" refusal (the row's disable: toggle drops the figures); one
// HOS-003   that shows days left minus pending as one figure; one that shows this year's figures for a next-year ask.
// HOS-003 given: P with allowance A (fresh), this year a approved and p pending: days left L = A − a, room k = L − p;
// HOS-003   Q with allowance A, this year used up (c approved, A − c pending), next year b approved and q pending: days
// HOS-003   left L2 = A − b, room k2 = L2 − q. Per run, every other figure a refusal could show — A, the room, the asked
// HOS-003   count, the approved days, Q's this-year figure A − c — is a number different from the two to be shown.
// HOS-003 when: P presses Send for k + 1 vacation weekdays this year; Q for k2 + 1 next year.
// HOS-003 then: the text each press made appear shows, as numbers of their own (the asked days' renderings and the
// HOS-003   person's name and email removed), that year's days left and pending: L and p for P, L2 and q for Q.
// HOS-003 controls: the control case makes the same presses and shows each is a refusal that draws text — the page
// HOS-003   says something and nothing is stored — which stays so when only the figures are dropped.
// HOS-003 technique: decoys — every figure a wrong refusal would show is a different number, so only the right two
// HOS-003   match; before/after on the page's lines; fresh per run.
// HOS-003 cases: HOS-003 target=HOS-003.REQ-002.the-forms-refusal-shows-that-years-days-left-and-pending-days control=HOS-003.control.the-presses-are-refused-and-draw-a-message
function asks(f: ReturnType<typeof spentFigures>): { p: Ask; q: Ask } {
  return {
    p: { kind: 'vacation', ...weekdaySpan(CAL.thisYearAsk, f.k + 1) },
    q: { kind: 'vacation', ...weekdaySpan(CAL.nextYearAsk, f.k2 + 1) },
  };
}

test('HOS-003.control.the-presses-are-refused-and-draw-a-message', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f);
  const a = asks(f);
  try {
    for (const [who, ask, label] of [
      [t.p, a.p, "P's this-year ask"],
      [t.q, a.q, "Q's next-year ask"],
    ] as const) {
      const n = await storedCount(who);
      const opened = await openPage(browser, who);
      try {
        const pressed = await sendThroughForm(opened.page, ask);
        expect.soft(pressed.appeared.length, `HOS-003 control: ${label} — the press draws a message`).toBeGreaterThan(0);
      } finally {
        await opened.close();
      }
      expect.soft(await storedCount(who), `HOS-003 control: ${label} — is refused, nothing stored`).toBe(n);
    }
  } finally {
    await t.dispose();
  }
});

test('HOS-003.REQ-002.the-forms-refusal-shows-that-years-days-left-and-pending-days', async ({ browser }) => {
  const f = spentFigures();
  const t = await spentTeam(CAL, f);
  const a = asks(f);
  try {
    for (const [who, member, ask, label, left, pending] of [
      [t.p, t.pMember, a.p, "P's this-year refusal", f.L, f.p],
      [t.q, t.qMember, a.q, "Q's next-year refusal", f.L2, f.q],
    ] as const) {
      const opened = await openPage(browser, who);
      let said = '';
      try {
        said = (await sendThroughForm(opened.page, ask)).appeared.join(' | ');
      } finally {
        await opened.close();
      }
      const days = [ask.firstDay, ask.lastDay];
      const literals = [member.name, member.email];
      expect.soft(showsFigure(said, left, days, literals), `HOS-003: ${label} shows that year's days left ${left} (said: "${said.slice(0, 300)}")`).toBe(true);
      expect.soft(showsFigure(said, pending, days, literals), `HOS-003: ${label} shows that year's pending days ${pending} (said: "${said.slice(0, 300)}")`).toBe(true);
    }
  } finally {
    await t.dispose();
  }
});
