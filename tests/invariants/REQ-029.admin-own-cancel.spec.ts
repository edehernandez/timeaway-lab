// Purpose: ledger tests for ROW-292 and ROW-294 (REQ-029) — on the admin's own requests page the admin's own approved request that still has a Monday to Friday day in effect from today on carries a cancel control, and that cancel asks first through a confirmation naming the days cancelled and the days that stay: declining changes nothing, confirming cancels only the days in effect from today on.
// Provenance: hand-authored (test-author pass, fix-2026-11-25, brief test-author-1); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, the team clock, the admin's own requests, the admin's two-step approve and cancel), fresh per run; the page read and operated through request-actions.ts.
//
// Boundary (R6): what the admin's own page offers, and the confirmation it opens, are paint and operation — read and
// operated on "/" in the admin's browser (engine door, Chromium); what was cancelled is read at the HTTP harness
// (GET /api/balance and GET /api/requests on the admin's session; GET /api/calendar).
// Readings (the row, a cancel control, the confirmation step and its two exits): request-actions.ts; a day named in
// a confirmation: admin-kit.ts mentionsDay.
// Time: team zone Pacific/Kiritimati (UTC+14, request-rules.ts); "today" T is a Tuesday at 09:00 there, when the UTC
// date is still Monday, so a product reading the container's date cancels from the Monday (BASELINE "Test
// environment"); the year is fresh per run (2031–2058). Every request is sent and approved at S0 = T − 28.
//
// The world (offsets in days from T, a Tuesday), all the admin's own, the admin's allowance A fresh per run:
//   SPAN approved vacation Thu T−5 … <last>   ROW-292: last = Tue T (its one weekday from today on is today);
//                                             ROW-294: last = Fri T+3 (Thu, Fri, Mon before today; Tue … Fri from it)
//   FUT  approved vacation Mon T+6 … Tue T+7  wholly to come
//   PEND pending  vacation Thu T+9 … Fri T+10 no weekday before today
import { test, expect } from '@playwright/test';
import { adminCancel, approve, freshName, openPage, resetProduct, sendRequest, signIn, type AccountId, type Actor } from './harness';
import { addDays, countWeekdays, day, isAwayOn, moveClock, onOrAfter, ownRequest, pickYear, randomInt, teamAt, TEAM_ZONE, yearBalance } from './request-rules';
import { mentionsDay } from './admin-kit';
import { saysState } from './own-page';
import { actionRow, cancelControlsIn, openConfirmationStep, readOwnActions, requestRow, type DayRange } from './request-actions';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const Y = pickYear();
const T = onOrAfter(day(Y, 6, 9), 2); // a Tuesday
const at = (n: number) => addDays(T, n);

/** A word saying some days stay (the confirmation's other half). */
const STAY_WORD = /\b(stay|stays|remain|remains|kept|keeps|unchanged|untouched|already taken|still approved|not cancel)/i;

interface AdminWorld {
  admin: Actor;
  adminName: string;
  allowance: number;
  specs: DayRange[];
  span: DayRange;
  fut: DayRange;
  pend: DayRange;
  ids: Record<string, AccountId>;
}

/** The world in the header, with SPAN ending at T + `spanLast`; the clock is at T when it returns. */
async function adminWorld(spanLast: number): Promise<AdminWorld> {
  const adminName = freshName('Ines');
  const allowance = randomInt(25, 35);
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(at(-28)), admin: { name: adminName, allowance } });
  const admin = keep(await signIn(install.admin));
  const span: DayRange = { label: 'SPAN', firstDay: at(-5), lastDay: at(spanLast) };
  const fut: DayRange = { label: 'FUT', firstDay: at(6), lastDay: at(7) };
  const pend: DayRange = { label: 'PEND', firstDay: at(9), lastDay: at(10) };
  const ids: Record<string, AccountId> = {};
  for (const r of [span, fut, pend]) ids[r.label] = await sendRequest(admin, { kind: 'vacation', firstDay: r.firstDay, lastDay: r.lastDay });
  await approve(admin, ids.SPAN);
  await approve(admin, ids.FUT);
  await moveClock({ install, admin, members: [], people: [], dispose: async () => undefined }, teamAt(T));
  return { admin, adminName, allowance, specs: [span, fut, pend], span, fut, pend, ids };
}

// =====================================================================================================
// ROW-292 — the admin's own approved request with a weekday in effect from today on carries a cancel control
// =====================================================================================================
// ROW-292 promise: REQ-029 fail-if (5) "on the admin's own page, the admin's approved request that still has a Monday
// ROW-292   to Friday day in effect from today on shows no cancel control"; REQ-029 "for the admin alone, their own
// ROW-292   approved request that still has a Monday to Friday day in effect from today on"; A-061 ("Yes, show
// ROW-292   Cancel" — the same cancel the admin has from the people page); A-062.
// ROW-292 wrong product: the page as graded — no cancel on any approved request, the admin's included; or one that
// ROW-292   offers it only for requests not yet started, or only while a day after today remains (SPAN's one weekday
// ROW-292   from today on is today itself), or that reads today from the UTC date.
// ROW-292 given: the world with SPAN Thu T−5 … Tue T, FUT, PEND. when: the admin opens "/" in the browser. then:
// ROW-292   SPAN's row and FUT's row each carry a cancel control.
// ROW-292 controls: PEND's row (pending, no weekday before today) carries a cancel control, and SPAN's and FUT's rows
// ROW-292   are found showing "approved" — the page is the admin's own list and the control reading works on it.
// ROW-292 technique: the threshold of today (a request whose only weekday in effect from today on is today), the
// ROW-292   clock's origin (UTC+14 at 09:00), and a wholly future request beside it.
// ROW-292 cases: ROW-292 target=ROW-292.REQ-029.the-admins-own-approved-requests-with-days-to-come-carry-a-cancel-control control=ROW-292.control.the-admins-own-page-lists-the-requests-and-a-pending-one-carries-cancel
test('ROW-292.control.the-admins-own-page-lists-the-requests-and-a-pending-one-carries-cancel', async ({ browser }) => {
  const w = await adminWorld(0);
  const read = await readOwnActions(browser, w.admin, w.specs);
  const pend = actionRow(read, 'PEND');
  expect.soft(pend.found, "ROW-292 control: PEND's row is on the admin's own page").toBe(true);
  expect.soft(pend.cancelControls.length, `ROW-292 control: PEND (pending, no weekday before today) carries a cancel control — row: ${JSON.stringify(pend.text)}`).toBeGreaterThan(0);
  for (const label of ['SPAN', 'FUT']) {
    const r = actionRow(read, label);
    expect.soft(r.found, `ROW-292 control: ${label}'s row is on the admin's own page`).toBe(true);
    expect.soft(saysState(r.text, 'approved'), `ROW-292 control: ${label}'s row shows "approved" — row: ${JSON.stringify(r.text)}`).toBe(true);
  }
});

test('ROW-292.REQ-029.the-admins-own-approved-requests-with-days-to-come-carry-a-cancel-control', async ({ browser }) => {
  const w = await adminWorld(0);
  const read = await readOwnActions(browser, w.admin, w.specs);
  const cases: [string, string][] = [
    ['SPAN', 'approved Thu T−5 … Tue T: its one weekday in effect from today on is today'],
    ['FUT', 'approved, wholly to come'],
  ];
  for (const [label, what] of cases) {
    const r = actionRow(read, label);
    expect.soft(r.found, `ROW-292: ${label}'s row (${what}) is on the admin's own page`).toBe(true);
    expect.soft(r.cancelControls.length, `ROW-292: ${label} (${what}) carries a cancel control — row: ${JSON.stringify(r.text)}`).toBeGreaterThan(0);
  }
});

// =====================================================================================================
// ROW-294 — the cancel from the admin's own page confirms first, naming what goes and what stays
// =====================================================================================================
// ROW-294 promise: REQ-029 fail-if (7) "a cancel from the admin's own page takes effect without a confirmation step
// ROW-294   that names the days cancelled and the days that stay"; the row: "declining it changes nothing, confirming
// ROW-294   cancels only the days in effect from today on"; A-061 ("the same cancel, with its confirmation"); REQ-010
// ROW-294   (only the Monday to Friday days from today on are cancelled; days before today stay counted); A-007, A-030.
// ROW-294 wrong product: a Cancel that gives the days back at once; a confirmation reading "Cancel this request?"
// ROW-294   with no days, or naming the whole range as cancelled and nothing as staying; a confirmation that acts on
// ROW-294   opening, or whose decline still posts; a confirm that cancels the whole request, or from the UTC date (the
// ROW-294   Monday too), or from tomorrow; one acting on FUT, the other approved request.
// ROW-294 given: the world with SPAN Thu T−5 … Fri T+3 (7 weekdays: 3 before today, 4 from today on), FUT (2), PEND
// ROW-294   (2); the admin's figures for the year read {daysLeft A − 9, pending 2}. when: on "/" the admin operates
// ROW-294   SPAN's cancel control, reads the step, declines it; reloads, operates it again and confirms.
// ROW-294 then: a confirmation step opens; it names the first and last cancelled day (Tue T, Fri T+3) and the first
// ROW-294   and last staying day (Thu T−5, Mon T−1), says cancel and says the others stay, and names neither FUT's nor
// ROW-294   PEND's days; while it is open and after the decline the figures are still {A − 9, 2}, SPAN is still
// ROW-294   approved and the admin is still away on T; after confirming the figures become {A − 5, 2}, SPAN stays
// ROW-294   approved (partly cancelled), the admin is away on Mon T−1 and not on Tue T or Fri T+3, and still away on
// ROW-294   FUT's Monday.
// ROW-294 controls: the same world, cancelled through the HTTP two steps (the people-page cancel, D-029) instead of
// ROW-294   the own page: the figures become {A − 5, 2} — the world, the clock and the expected values hold on this
// ROW-294   product, so the target's figures are about the own page's control.
// ROW-294 technique: the threshold of today inside the request with each side named by its endpoints; the clock's
// ROW-294   origin; before (open), after the decline, after the confirm on the same figure; decoy days of the other
// ROW-294   requests in the same list.
// ROW-294 cases: ROW-294 target=ROW-294.REQ-029.cancel-from-the-admins-own-page-confirms-days-that-go-and-stay-first control=ROW-294.control.the-two-step-cancel-gives-back-only-the-days-from-today-on
test('ROW-294.control.the-two-step-cancel-gives-back-only-the-days-from-today-on', async () => {
  const w = await adminWorld(3);
  const counted = countWeekdays(w.span.firstDay, w.span.lastDay) + countWeekdays(w.fut.firstDay, w.fut.lastDay);
  expect(await yearBalance(w.admin, Y), 'ROW-294 control: before, SPAN and FUT are counted, PEND pending').toEqual({ daysLeft: w.allowance - counted, pending: 2 });
  await adminCancel(w.admin, w.ids.SPAN);
  expect(await yearBalance(w.admin, Y), 'ROW-294 control: the two-step cancel gives back Tue T … Fri T+3 only').toEqual({ daysLeft: w.allowance - 5, pending: 2 });
});

test('ROW-294.REQ-029.cancel-from-the-admins-own-page-confirms-days-that-go-and-stay-first', async ({ browser }) => {
  const w = await adminWorld(3);
  const me = { id: w.admin.me.id, name: w.adminName };
  const before = { daysLeft: w.allowance - 9, pending: 2 };
  const goFirst = at(0);
  const goLast = at(3);
  const stayFirst = at(-5);
  const stayLast = at(-1);
  expect(await yearBalance(w.admin, Y), 'ROW-294 before: SPAN (7) and FUT (2) counted, PEND (2) pending').toEqual(before);
  expect(await isAwayOn(w.admin, me, goFirst), 'ROW-294 before: the admin is away today').toBe(true);

  const opened = await openPage(browser, w.admin);
  try {
    const page = opened.page;
    const control = () => cancelControlsIn(requestRow(page, w.span, w.specs)).first();
    const days = [w.span.firstDay, w.span.lastDay, goFirst, stayLast];

    // First press: read the step, then decline it.
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const step = await openConfirmationStep(page, control(), "ROW-294: SPAN's cancel control on the admin's own page", days);
    if (!step) {
      const after = await yearBalance(w.admin, Y);
      expect(step, `ROW-294: operating the cancel opens a confirmation step, not the cancel itself (the figures now read ${JSON.stringify(after)})`).not.toBeNull();
      return;
    }
    const text = step.text;
    for (const [d, role] of [
      [goFirst, 'the first cancelled day (today)'],
      [goLast, 'the last cancelled day'],
      [stayFirst, 'the first day that stays'],
      [stayLast, 'the last day that stays (yesterday)'],
    ] as [string, string][]) {
      expect.soft(mentionsDay(text, d), `ROW-294: the confirmation names ${role}, ${d} — it shows: ${JSON.stringify(text)}`).toBe(true);
    }
    expect.soft(/cancel/i.test(text), `ROW-294: the confirmation says days are cancelled — it shows: ${JSON.stringify(text)}`).toBe(true);
    expect.soft(STAY_WORD.test(text), `ROW-294: the confirmation says which days stay — it shows: ${JSON.stringify(text)}`).toBe(true);
    for (const d of [w.fut.firstDay, w.fut.lastDay, w.pend.firstDay, w.pend.lastDay]) {
      expect.soft(mentionsDay(text, d), `ROW-294: the confirmation does not name ${d}, a day of another request — it shows: ${JSON.stringify(text)}`).toBe(false);
    }
    expect.soft(await yearBalance(w.admin, Y), 'ROW-294: nothing changed while the confirmation is open').toEqual(before);

    await step.decline();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    expect.soft(await yearBalance(w.admin, Y), 'ROW-294: declining changed nothing — the figures').toEqual(before);
    expect.soft((await ownRequest(w.admin, w.ids.SPAN))?.state, 'ROW-294: declining changed nothing — SPAN is still approved').toBe('approved');
    expect.soft(await isAwayOn(w.admin, me, goFirst), 'ROW-294: declining changed nothing — the admin is still away today').toBe(true);

    // Second press, on a fresh load: confirm.
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const again = await openConfirmationStep(page, control(), "ROW-294: SPAN's cancel control, pressed again", days);
    expect(again, 'ROW-294: the second press opens the confirmation step again').not.toBeNull();
    await again!.confirm();
  } finally {
    await opened.close();
  }

  await expect
    .poll(() => yearBalance(w.admin, Y), { message: 'ROW-294: confirming gives back Tue T … Fri T+3 only (4 weekdays)', timeout: 10_000 })
    .toEqual({ daysLeft: w.allowance - 5, pending: 2 });
  expect.soft((await ownRequest(w.admin, w.ids.SPAN))?.state, 'ROW-294: SPAN stays approved, partly cancelled').toBe('approved');
  expect.soft(await isAwayOn(w.admin, me, stayLast), 'ROW-294: Mon T−1, before today, stays on the calendar').toBe(true);
  expect.soft(await isAwayOn(w.admin, me, goFirst), 'ROW-294: today leaves the calendar').toBe(false);
  expect.soft(await isAwayOn(w.admin, me, goLast), 'ROW-294: Fri T+3 leaves the calendar').toBe(false);
  expect.soft(await isAwayOn(w.admin, me, w.fut.firstDay), "ROW-294: FUT's Monday is untouched").toBe(true);
});
