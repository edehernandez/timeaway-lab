// Purpose: ledger tests for ROW-258 and ROW-273 (REQ-025) — a cancel or switch-off confirmation says which days are cancelled and which stay, and a confirmation whose effect has changed by the moment it is confirmed (a cancel opened before the team's midnight, confirmed after it) is not applied.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, the confirmed two-step actions), fresh per run.
//
// Boundary (R6): the confirmation's content and its staleness, proved at the HTTP harness on D-029's two steps
// (GET …/effect?action=… → {token, summary}; the act with its token; "a stale token refused 409").
// Time: the team zone is Pacific/Auckland (UTC+13 in March) and every "today" here is a team-zone date at an instant
// where the UTC date differs or (at the midnight case) does not move at all, so a product reading the container's
// date gets the wrong days (BASELINE "Test environment"). Days before today stay; days from today on are cancelled
// (A-007, A-030).
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  readEffect,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { addDays, freshInt, is2xx, mentionsDay, pick, teamDateOf, teamInstant, utcDateOf, weekdaysBetween, yearFigures } from './admin-kit';

const ZONE = DEFAULT_TIME_ZONE; // Pacific/Auckland
const YEAR = 2027;
const MON = '2027-03-08';
const FRI = '2027-03-12';
const STAY_WORD = /\b(stay|stays|remain|remains|kept|keep|keeps|unchanged|untouched|already taken|still approved|not cancel)/i;
const CANCEL_WORD = /cancel/i;

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface Person {
  member: Member;
  session: Actor;
  allowance: number;
}

async function person(admin: Actor, label: string, avoid: number[] = []): Promise<Person> {
  const allowance = freshInt(20, 40, avoid);
  const member = await createMember(admin, { name: freshName(label), allowance });
  return { member, session: keep(await signInMember(member)), allowance };
}

/** A fresh install on Fri 5 Mar 2027 09:00 team time, the admin signed in. */
async function start(): Promise<Actor> {
  const install = await resetProduct({ now: teamInstant(ZONE, '2027-03-05', '09:00'), timeZone: ZONE });
  return keep(await signIn(install.admin));
}

/** Sends Mon 8 – Fri 12 Mar for `p` (on Fri 5 Mar, so every day is ahead) and approves it. */
async function approvedWeek(admin: Actor, p: Person): Promise<AccountId> {
  const id = await sendRequest(p.session, { kind: 'vacation', firstDay: MON, lastDay: FRI });
  await approve(admin, id);
  return id;
}

// ---------------------------------------------------------------------------------------------------
// ROW-258 promise: REQ-025 fail-if (3) "a cancel or switch-off confirmation does not say which days are cancelled
// ROW-258   and which stay"; REQ-025 "including which days are cancelled and which stay"; A-007/A-030: days from today
// ROW-258   on are cancelled, days before today stay approved.
// ROW-258 wrong product: a summary that repeats the request's whole range ("Cancel 8–12 Mar") as if every day goes;
// ROW-258   one that names only the days that go and is silent about those that stay; one computing "today" from the
// ROW-258   container's UTC date, so the split falls a day early.
// ROW-258 given: Ilse and Oskar each hold an approved Mon 8 – Fri 12 Mar; Oskar also a pending 22–24 Mar; today is
// ROW-258   (per run) Wed 10 or Thu 11 Mar at 09:00 team time, while the UTC date is still the day before. when: the
// ROW-258   admin reads the cancel effect of Ilse's request and the switch-off effect of Oskar. then: each summary
// ROW-258   names the first and last cancelled day (today, Fri 12; and for Oskar 22 and 24 Mar), the first and last
// ROW-258   staying day (Mon 8 and the day before today — the UTC "today", which a UTC-reading product would cancel),
// ROW-258   the word cancel, and a word saying the other days stay.
// ROW-258 controls: the control case reads the cancel effect of Petra's approved request wholly ahead (22–23 Mar):
// ROW-258   its summary names 22 and 23 Mar — the day reading works on this product's summaries.
// ROW-258 technique: the threshold of "today" placed inside the request, its two sides each named by their
// ROW-258   endpoints, with today chosen per run (fresh) and the team date ahead of the UTC date.
// ROW-258 cases: ROW-258 target=ROW-258.REQ-025.cancel-and-switch-off-confirmations-say-which-days-go-and-which-stay control=ROW-258.control.a-cancel-summary-names-its-days
test('ROW-258.control.a-cancel-summary-names-its-days', async () => {
  const admin = await start();
  const petra = await person(admin, 'Petra');
  const id = await sendRequest(petra.session, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' });
  await approve(admin, id);
  await setClock(teamInstant(ZONE, '2027-03-10', '09:00'));
  const { summary } = await readEffect(admin, 'cancel', id);
  const s = String(summary ?? '');
  expect(mentionsDay(s, '2027-03-22') && mentionsDay(s, '2027-03-23'), `ROW-258 control: the summary names 22 and 23 Mar — ${JSON.stringify(s)}`).toBe(true);
});

test('ROW-258.REQ-025.cancel-and-switch-off-confirmations-say-which-days-go-and-which-stay', async () => {
  const admin = await start();
  const ilse = await person(admin, 'Ilse');
  const oskar = await person(admin, 'Oskar', [ilse.allowance]);
  const ilseReq = await approvedWeek(admin, ilse);
  await approvedWeek(admin, oskar);
  await sendRequest(oskar.session, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' });

  const today = pick(['2027-03-10', '2027-03-11']);
  const now = teamInstant(ZONE, today, '09:00');
  expect(teamDateOf(now, ZONE), 'ROW-258 setup: the team date is today').toBe(today);
  expect(utcDateOf(now), 'ROW-258 setup: the UTC date is the day before').toBe(addDays(today, -1));
  await setClock(now);

  const stayFirst = MON;
  const stayLast = addDays(today, -1);
  const goFirst = today;
  const goLast = FRI;

  const cancel = String((await readEffect(admin, 'cancel', ilseReq)).summary ?? '');
  for (const [d, role] of [
    [goFirst, 'the first cancelled day'],
    [goLast, 'the last cancelled day'],
    [stayFirst, 'the first day that stays'],
    [stayLast, 'the last day that stays'],
  ] as [string, string][]) {
    expect.soft(mentionsDay(cancel, d), `ROW-258 cancel: the confirmation names ${role}, ${d} — summary: ${JSON.stringify(cancel)}`).toBe(true);
  }
  expect.soft(CANCEL_WORD.test(cancel), `ROW-258 cancel: the confirmation says days are cancelled — summary: ${JSON.stringify(cancel)}`).toBe(true);
  expect.soft(STAY_WORD.test(cancel), `ROW-258 cancel: the confirmation says which days stay — summary: ${JSON.stringify(cancel)}`).toBe(true);

  const off = String((await readEffect(admin, 'switch-off', oskar.member.id)).summary ?? '');
  for (const [d, role] of [
    [goFirst, 'the first cancelled approved day'],
    [goLast, 'the last cancelled approved day'],
    ['2027-03-22', 'the first day of the pending request that is cancelled'],
    ['2027-03-24', 'the last day of the pending request that is cancelled'],
    [stayFirst, 'the first day that stays'],
    [stayLast, 'the last day that stays'],
  ] as [string, string][]) {
    expect.soft(mentionsDay(off, d), `ROW-258 switch-off: the confirmation names ${role}, ${d} — summary: ${JSON.stringify(off)}`).toBe(true);
  }
  expect.soft(CANCEL_WORD.test(off), `ROW-258 switch-off: the confirmation says days are cancelled — summary: ${JSON.stringify(off)}`).toBe(true);
  expect.soft(STAY_WORD.test(off), `ROW-258 switch-off: the confirmation says which days stay — summary: ${JSON.stringify(off)}`).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-273 promise: REQ-025 fail-if (5) "a confirmation is applied although its effect at the moment of confirming
// ROW-273   differs from what it showed"; REQ-025 "nothing changes and the confirmation is shown again"; D-029 "a stale
// ROW-273   token refused 409". The row's case: a cancel confirmation opened before midnight and confirmed after it,
// ROW-273   run across the test clock.
// ROW-273 wrong product: a token that never expires, so the cancel shown at 23:58 Tuesday ("cancels Tue–Fri") is
// ROW-273   applied at 00:02 Wednesday, where it now cancels Wed–Fri, without the admin seeing the new effect; or one
// ROW-273   that applies the old effect (Tuesday given back although it is now in the past); or one that tells today
// ROW-273   by the UTC date, which does not change across the team's midnight here.
// ROW-273 given: Ilse's approved Mon 8 – Fri 12 Mar (5 days), allowance A fresh. when: at Tue 9 Mar 23:58 team time
// ROW-273   the admin reads the cancel effect (token T); the clock moves to Wed 10 Mar 00:02 team time (the UTC date is
// ROW-273   9 Mar on both sides); the admin posts the cancel with T. then: the post answers 409; Ilse's days left are
// ROW-273   still A − 5 (nothing cancelled); a fresh effect read gives another token whose summary names Tue 9 Mar (now
// ROW-273   staying); confirming that one is accepted and leaves A − 2 (Mon and Tue stay).
// ROW-273 controls: the control case reads the effect at 23:57 and confirms at 23:58 the same evening (same effect):
// ROW-273   accepted, days left A − 1 (only Monday stays) — a moved clock alone does not refuse a token.
// ROW-273 technique: the clock's origin — the team's midnight with the UTC date unmoved — values just either side.
// ROW-273 cases: ROW-273 target=ROW-273.REQ-025.a-cancel-confirmed-after-midnight-is-not-applied control=ROW-273.control.a-cancel-confirmed-the-same-evening-is-applied
test('ROW-273.control.a-cancel-confirmed-the-same-evening-is-applied', async () => {
  const admin = await start();
  const ilse = await person(admin, 'Ilse');
  const id = await approvedWeek(admin, ilse);
  await setClock(teamInstant(ZONE, '2027-03-09', '23:57'));
  const effect = await readEffect(admin, 'cancel', id);
  await setClock(teamInstant(ZONE, '2027-03-09', '23:58'));
  const res = await actWithToken(admin, 'cancel', id, effect.token);
  expect(is2xx(res.status()), `ROW-273 control: the same-evening confirmation is accepted (answered ${res.status()})`).toBe(true);
  expect(await yearFigures(ilse.session, YEAR), 'ROW-273 control: Tue–Fri cancelled, Monday stays').toEqual({
    daysLeft: ilse.allowance - 1,
    pending: 0,
  });
});

test('ROW-273.REQ-025.a-cancel-confirmed-after-midnight-is-not-applied', async () => {
  const admin = await start();
  const ilse = await person(admin, 'Ilse');
  const id = await approvedWeek(admin, ilse);
  const week = weekdaysBetween(MON, FRI).length;
  expect(await yearFigures(ilse.session, YEAR), 'ROW-273 before: the whole week is approved').toEqual({ daysLeft: ilse.allowance - week, pending: 0 });

  const before = teamInstant(ZONE, '2027-03-09', '23:58');
  const after = teamInstant(ZONE, '2027-03-10', '00:02');
  expect(utcDateOf(before) === utcDateOf(after), 'ROW-273 setup: the UTC date does not move across the team midnight').toBe(true);

  await setClock(before);
  const shown = await readEffect(admin, 'cancel', id);
  await setClock(after);
  const res = await actWithToken(admin, 'cancel', id, shown.token);
  expect.soft(res.status(), `ROW-273: the confirmation shown before midnight is refused after it (answered ${res.status()})`).toBe(409);
  expect.soft(await yearFigures(ilse.session, YEAR), 'ROW-273: nothing was cancelled by the stale confirmation').toEqual({
    daysLeft: ilse.allowance - week,
    pending: 0,
  });

  const again = await readEffect(admin, 'cancel', id);
  expect.soft(again.token, 'ROW-273: the confirmation shown again carries a new token').not.toBe(shown.token);
  expect.soft(mentionsDay(String(again.summary ?? ''), '2027-03-09'), `ROW-273: the confirmation shown again names Tue 9 Mar (now staying) — ${JSON.stringify(again.summary)}`).toBe(true);
  const confirmed = await actWithToken(admin, 'cancel', id, again.token);
  expect.soft(is2xx(confirmed.status()), `ROW-273: the confirmation shown again is accepted (answered ${confirmed.status()})`).toBe(true);
  expect.soft(await yearFigures(ilse.session, YEAR), 'ROW-273: Wed–Fri cancelled, Mon and Tue stay').toEqual({
    daysLeft: ilse.allowance - 2,
    pending: 0,
  });
});
