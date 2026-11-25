// Purpose: the ledger test of RULE-005 (D-007, REQ-004, REQ-005, REQ-007, REQ-010, REQ-011, REQ-014, REQ-016, REQ-017, REQ-018, REQ-025) — every today and every instant the product uses comes from the one team clock: the test clock moves across days, a year and minutes, and every today-bound decision, every recorded instant and every time the store holds follows it.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, clock, accounts, rename, requests, approve, cancels, allowance changes, effect tokens, sign-in), a fresh year and names per run; the store read through the D-048 store door (doors-store.ts), read only; every expected day and instant is this file's own arithmetic, never the machine's clock.
//
// Boundary (R6): the decisions are rules, proved at the HTTP harness on the routes that make them; what the product
// RECORDS is read where it is kept — the request and history answers, and the whole store through the test-only store
// door (DIF-001), the cheapest boundary that sees a stored time no route shows. The clock census (the extractor) lists
// the sites; this file moves the one clock and sees that every site follows it.
//
// RULE-005 promise: RULE-005 "every read of the current time or date in server code, database defaults and queries goes
// RULE-005   through the one team clock of the accounts module; no other site reads the system clock"; D-007 (today is
// RULE-005   computed on the server in the team's zone); REQ-004 AMENDED arm 6 (today, the current and the next year read from
// RULE-005   the team zone's date at the moment of sending); REQ-005 AMENDED; REQ-007 and A-027 (this year's and next year's
// RULE-005   balance); REQ-010 and D-040 (the cancel day is the first weekday on or after the team's today); REQ-011 AMENDED
// RULE-005   (a change starting this year); REQ-016 arm 7; REQ-017 and REQ-018 (when it was sent, decided, cancelled,
// RULE-005   changed); D-033 (the 15-minute wait); D-041 (a confirmation whose effect changed — a midnight passed — is refused).
// RULE-005 wrong product: one site that reads the machine's clock or the UTC date — a send window, an own-cancel or a
// RULE-005   switch-off check on the real date; a cancel day, a balance year or an allowance's starting year from the system
// RULE-005   clock; a sent_at, decided_at or history time from Date.now() or a database DEFAULT CURRENT_TIMESTAMP; a sign-in
// RULE-005   wait timed by a real timer; a confirmation token blind to the clock.
// RULE-005 given: zone Pacific/Kiritimati (UTC+14: at 09:00 team time the UTC date is still the day before); a fresh year
// RULE-005   Y from 2031 (the machine's real year is never inside the window); D0 the first Monday on or after 2 March of Y,
// RULE-005   D1 = D0+1 (Tuesday); members M, N, P (allowance 20 each) and Z.
// RULE-005 when / then, the clock moved through: T1 Tue D1 09:00 — today is D1; M's vacation on D0 refused, in June Y+2
// RULE-005   refused; P's RA (D1..D1+3) sent and approved, M's RC (D1+1) and N's RN (D1+1) sent pending, N renamed.
// RULE-005   T2 Wed — today is D1+1; N cancels RN (allowed); the admin reads RA's cancel effect. T3 Thu — today is D1+2;
// RULE-005   the Wednesday cancel token is refused and RA keeps its 4 days; RA cancelled now keeps Tue and Wed (P's Y days
// RULE-005   left 18); M's own cancel of RC refused; switching M off refused. T4 a Monday 5-11 January Y+1 — today is that
// RULE-005   day, the balance years are Y+1 and Y+2; M's June Y+2 vacation (refused at T1) accepted; N's sick day in
// RULE-005   December Y accepted; N's allowance set to 17 from this year (Y+1 days left 17, history starts Y+1) and 19 from
// RULE-005   next year (history starts Y+2). T5 first Monday of February Y+1 — N's other December sick day refused; five
// RULE-005   wrong passwords for Z, and Z's right one is then refused; at T5+16 minutes Z signs in. Every record carries
// RULE-005   the clock's instant of its act (RA sent and decided T1, cancelled T3; RN sent T1, cancelled T2; N's history
// RULE-005   at T1 and T4); every time the store holds lies within the clock's span, T1 to T5+16 minutes (plus 31 days, for
// RULE-005   a stored session end).
// RULE-005 controls: the control case, at T1 only, shows the setup works and each path is reached: today is D1; M's
// RULE-005   vacation on D1 and in June Y+1 is accepted, N's pending vacation on D1+1 is cancelled by N, the balance years are
// RULE-005   Y and Y+1, the sent request records T1, and the store door finds stored times.
// RULE-005 technique: the clock's origin moved (days, a midnight, a year, minutes) with before/after pairs on the same
// RULE-005   decision; a far zone so the UTC date differs; a far year so the real clock can never agree; a census of every
// RULE-005   stored time (a property over the whole store, its denominator counted).
// RULE-005 cases: RULE-005 target=RULE-005.every-today-bound-decision-and-recorded-instant-follows-the-moved-clock control=RULE-005.control.at-the-first-clock-each-decision-answers-as-its-today-says
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  adminCancel,
  anonymousApi,
  approve,
  createMember,
  freshName,
  freshPassword,
  readEffect,
  rename,
  setAllowance,
  setClock,
  type AccountId,
  type Actor,
} from './harness';
import {
  addDays,
  day,
  describe as describeAnswer,
  isAcceptance,
  moveClock,
  onOrAfter,
  pickYear,
  readAnswer,
  setupTeam,
  teamAt,
  TEAM_ZONE,
  trySend,
  tryCancel,
  yearBalance,
  type Team,
} from './request-rules';
import { actAt, CANCELLED, DECIDED, observeHistory, observePersonRequests, recordById, SENT, show, type Rec } from './records';
import { cellInstants, everyStoredCell } from './doors-store';

const teams: Team[] = [];
test.afterEach(async () => {
  for (const t of teams.splice(0)) await t.dispose().catch(() => undefined);
});

interface Clock {
  Y: number;
  D0: string;
  D1: string;
  J: string;
  Feb: string;
  T1: string;
  T2: string;
  T3: string;
  T4: string;
  T5: string;
  T5late: string;
}

function clock(): Clock {
  const Y = pickYear();
  const D0 = onOrAfter(day(Y, 3, 2), 1);
  const D1 = addDays(D0, 1);
  const J = onOrAfter(day(Y + 1, 1, 5), 1);
  const Feb = onOrAfter(day(Y + 1, 2, 1), 1);
  const T5 = teamAt(Feb);
  return {
    Y,
    D0,
    D1,
    J,
    Feb,
    T1: teamAt(D1),
    T2: teamAt(addDays(D1, 1)),
    T3: teamAt(addDays(D1, 2)),
    T4: teamAt(J),
    T5,
    T5late: new Date(Date.parse(T5) + 16 * 60_000).toISOString().replace('.000Z', 'Z'),
  };
}

async function today(actor: Actor): Promise<string | undefined> {
  const res = await actor.api.get('/api/today');
  const body = (await res.json().catch(() => ({}))) as { today?: string };
  return body?.today;
}

async function signsIn(email: string, password: string): Promise<{ status: number; in: boolean }> {
  const api = await anonymousApi();
  try {
    const res = await api.post('/api/auth/sign-in', { data: { email, password } });
    return { status: res.status(), in: (await api.get('/api/me')).status() === 200 };
  } finally {
    await api.dispose();
  }
}

async function balanceYears(actor: Actor): Promise<number[]> {
  const res = await actor.api.get('/api/balance');
  const body = (await res.json().catch(() => ({}))) as { years?: { year: unknown }[] };
  return (body?.years ?? []).map((y) => Number(y.year)).sort((a, b) => a - b);
}

/** Every time the store holds, and where (tables named for migrations are the migration tool's, not the product's). */
async function storedTimes(): Promise<{ where: string; readings: number[] }[]> {
  const out: { where: string; readings: number[] }[] = [];
  for (const cell of await everyStoredCell()) {
    if (/migrat/i.test(cell.table)) continue;
    const readings = cellInstants(cell.value, TEAM_ZONE);
    if (readings.length > 0) out.push({ where: `${cell.table}.${cell.column} row ${cell.row} = ${JSON.stringify(cell.value)}`, readings });
  }
  return out;
}

test('RULE-005.control.at-the-first-clock-each-decision-answers-as-its-today-says', async () => {
  test.setTimeout(180_000);
  const c = clock();
  const team = await setupTeam({ now: c.T1, allowances: [20, 20] });
  teams.push(team);
  const [m, n] = team.people;
  expect(await today(m), `RULE-005 control: at T1 GET /api/today answers ${c.D1}`).toBe(c.D1);
  expect(await balanceYears(m), `RULE-005 control: at T1 the balance years are ${c.Y} and ${c.Y + 1}`).toEqual([c.Y, c.Y + 1]);
  const onD1 = await trySend(m, { kind: 'vacation', firstDay: c.D1, lastDay: c.D1 });
  expect(isAcceptance(onD1), `RULE-005 control: M's vacation on today ${c.D1} is accepted (${describeAnswer(onD1)})`).toBe(true);
  const juneNext = onOrAfter(day(c.Y + 1, 6, 1), 1);
  const next = await trySend(m, { kind: 'vacation', firstDay: juneNext, lastDay: juneNext });
  expect(isAcceptance(next), `RULE-005 control: M's vacation in June ${c.Y + 1} is accepted (${describeAnswer(next)})`).toBe(true);
  const rn = await trySend(n, { kind: 'vacation', firstDay: addDays(c.D1, 1), lastDay: addDays(c.D1, 1) });
  expect(isAcceptance(rn), `RULE-005 control: N's vacation on ${addDays(c.D1, 1)} is sent (${describeAnswer(rn)})`).toBe(true);
  const cancel = await tryCancel(n, rn.id as AccountId);
  expect(cancel.ok, `RULE-005 control: at T1 N cancels her own pending request (${describeAnswer(cancel)})`).toBe(true);
  const rec = recordById(await observePersonRequests(team.admin, team.members[0].id), onD1.id as AccountId);
  expect(actAt(rec, SENT, c.T1, TEAM_ZONE), `RULE-005 control: M's request records it was sent at T1 ${c.T1} (${show(rec)})`).toBe(true);
  expect((await storedTimes()).length, 'RULE-005 control: the store door finds stored times').toBeGreaterThan(0);
});

test('RULE-005.every-today-bound-decision-and-recorded-instant-follows-the-moved-clock', async () => {
  test.setTimeout(300_000);
  const c = clock();
  const team = await setupTeam({ now: c.T1, allowances: [20, 20, 20] });
  teams.push(team);
  const [m, n, p] = team.people;
  const [mAcct, nAcct, pAcct] = team.members;
  const z = await createMember(team.admin, { name: freshName('Zed') });
  const juneAfterNext = onOrAfter(day(c.Y + 2, 6, 1), 1);
  const decSick = onOrAfter(day(c.Y, 12, 7), 1);

  // T1, Tuesday D1 (UTC still Monday D0).
  expect.soft(await today(m), `RULE-005 T1: today is ${c.D1}`).toBe(c.D1);
  const onD0 = await trySend(m, { kind: 'vacation', firstDay: c.D0, lastDay: c.D0 });
  expect.soft(isAcceptance(onD0), `RULE-005 T1: M's vacation on Monday ${c.D0}, a weekday before today, is refused (${describeAnswer(onD0)})`).toBe(false);
  const farT1 = await trySend(m, { kind: 'vacation', firstDay: juneAfterNext, lastDay: juneAfterNext });
  expect.soft(isAcceptance(farT1), `RULE-005 T1: M's vacation in June ${c.Y + 2}, after next year, is refused (${describeAnswer(farT1)})`).toBe(false);
  const ra = await trySend(p, { kind: 'vacation', firstDay: c.D1, lastDay: addDays(c.D1, 3) });
  expect(isAcceptance(ra), `RULE-005 (setup) T1: RA ${c.D1}..${addDays(c.D1, 3)} is sent (${describeAnswer(ra)})`).toBe(true);
  await approve(team.admin, ra.id as AccountId);
  const rc = await trySend(m, { kind: 'vacation', firstDay: addDays(c.D1, 1), lastDay: addDays(c.D1, 1) });
  const rn = await trySend(n, { kind: 'vacation', firstDay: addDays(c.D1, 1), lastDay: addDays(c.D1, 1) });
  expect(isAcceptance(rc) && isAcceptance(rn), `RULE-005 (setup) T1: RC and RN are sent (${describeAnswer(rc)} / ${describeAnswer(rn)})`).toBe(true);
  await rename(team.admin, nAcct.id, freshName('Nova'));

  // T2, Wednesday (UTC Tuesday).
  await moveClock(team, c.T2);
  expect.soft(await today(m), `RULE-005 T2: today is ${addDays(c.D1, 1)}`).toBe(addDays(c.D1, 1));
  const cancelRn = await tryCancel(n, rn.id as AccountId);
  expect.soft(cancelRn.ok, `RULE-005 T2: N cancels RN, which has no weekday before today (${describeAnswer(cancelRn)})`).toBe(true);
  const wedToken = (await readEffect(team.admin, 'cancel', ra.id as AccountId)).token;

  // T3, Thursday (UTC Wednesday).
  await moveClock(team, c.T3);
  expect.soft(await today(m), `RULE-005 T3: today is ${addDays(c.D1, 2)}`).toBe(addDays(c.D1, 2));
  const stale = await readAnswer(await actWithToken(team.admin, 'cancel', ra.id as AccountId, wedToken));
  expect.soft(stale.ok, `RULE-005 T3: the cancel confirmed on Wednesday is refused on Thursday, its effect having moved (${describeAnswer(stale)})`).toBe(false);
  expect.soft((await yearBalance(p, c.Y)).daysLeft, `RULE-005 T3: after the refused cancel RA still counts its 4 days (20 - 4)`).toBe(16);
  await adminCancel(team.admin, ra.id as AccountId);
  expect.soft((await yearBalance(p, c.Y)).daysLeft, `RULE-005 T3: the cancel keeps Tuesday and Wednesday, the weekdays before today (20 - 2)`).toBe(18);
  const cancelRc = await tryCancel(m, rc.id as AccountId);
  expect.soft(cancelRc.ok, `RULE-005 T3: M's own cancel of RC, whose Wednesday is before today, is refused (${describeAnswer(cancelRc)})`).toBe(false);
  // Switching M off: refused at the effect step, or — when the effect step gives a token — at the act.
  const switchEffect = await team.admin.api.get(`/api/admin/accounts/${encodeURIComponent(String(mAcct.id))}/effect?action=switch-off`);
  const switchToken = switchEffect.ok() ? ((await switchEffect.json().catch(() => ({}))) as { token?: string }).token : undefined;
  const switchAct = switchToken ? await readAnswer(await actWithToken(team.admin, 'switch-off', mAcct.id, switchToken)) : undefined;
  expect.soft(switchAct === undefined ? switchEffect.ok() : switchAct.ok, `RULE-005 T3: switching M off is refused while RC, with a weekday before today, is pending (effect ${switchEffect.status()}${switchAct ? `, act ${describeAnswer(switchAct)}` : ''})`).toBe(false);

  // T4, a Monday 5-11 January of Y+1.
  await moveClock(team, c.T4);
  expect.soft(await today(m), `RULE-005 T4: today is ${c.J}`).toBe(c.J);
  expect.soft(await balanceYears(m), `RULE-005 T4: the balance years are ${c.Y + 1} and ${c.Y + 2}`).toEqual([c.Y + 1, c.Y + 2]);
  const farT4 = await trySend(m, { kind: 'vacation', firstDay: juneAfterNext, lastDay: juneAfterNext });
  expect.soft(isAcceptance(farT4), `RULE-005 T4: M's vacation in June ${c.Y + 2}, now next year, is accepted (${describeAnswer(farT4)})`).toBe(true);
  const sickJan = await trySend(n, { kind: 'sick', firstDay: decSick, lastDay: decSick });
  expect.soft(isAcceptance(sickJan), `RULE-005 T4: in January N's sick day ${decSick} of the previous year is accepted (${describeAnswer(sickJan)})`).toBe(true);
  await setAllowance(team.admin, nAcct.id, 17);
  await setAllowance(team.admin, nAcct.id, 19, { startsNextYear: true });
  expect.soft((await yearBalance(n, c.Y + 1)).daysLeft, `RULE-005 T4: N's allowance set to 17 from this year applies to ${c.Y + 1}`).toBe(17);
  expect.soft((await yearBalance(n, c.Y + 2)).daysLeft, `RULE-005 T4: N's allowance set to 19 from next year applies to ${c.Y + 2}`).toBe(19);

  // T5, the first Monday of February of Y+1; then 16 minutes later.
  await moveClock(team, c.T5);
  const sickFeb = await trySend(n, { kind: 'sick', firstDay: addDays(decSick, 2), lastDay: addDays(decSick, 2) });
  expect.soft(isAcceptance(sickFeb), `RULE-005 T5: in February N's sick day ${addDays(decSick, 2)} of the previous year is refused (${describeAnswer(sickFeb)})`).toBe(false);
  const wrong = freshPassword();
  for (let i = 0; i < 5; i += 1) await signsIn(z.email, wrong);
  const during = await signsIn(z.email, z.password);
  expect.soft(during.in, `RULE-005 T5: after five wrong passwords Z's right one is refused for now (answered ${during.status})`).toBe(false);
  await setClock(c.T5late);
  const afterWait = await signsIn(z.email, z.password);
  expect.soft(afterWait.in, `RULE-005 T5+16 min: the wait has ended on the team clock and Z signs in (answered ${afterWait.status})`).toBe(true);

  // Every record carries its act's clock instant.
  const pView = await observePersonRequests(team.admin, pAcct.id);
  const nView = await observePersonRequests(team.admin, nAcct.id);
  const raRec = recordById(pView, ra.id as AccountId);
  const rnRec = recordById(nView, rn.id as AccountId);
  expect.soft(actAt(raRec, SENT, c.T1, TEAM_ZONE), `RULE-005 RA records it was sent at T1 (${show(raRec)})`).toBe(true);
  expect.soft(actAt(raRec, DECIDED, c.T1, TEAM_ZONE), `RULE-005 RA records it was decided at T1 (${show(raRec)})`).toBe(true);
  expect.soft(actAt(raRec, CANCELLED, c.T3, TEAM_ZONE), `RULE-005 RA records it was cancelled at T3 (${show(raRec)})`).toBe(true);
  expect.soft(actAt(rnRec, SENT, c.T1, TEAM_ZONE), `RULE-005 RN records it was sent at T1 (${show(rnRec)})`).toBe(true);
  expect.soft(actAt(rnRec, CANCELLED, c.T2, TEAM_ZONE), `RULE-005 RN records it was cancelled at T2 (${show(rnRec)})`).toBe(true);
  const history = (await observeHistory(team.admin, nAcct.id)) as { history?: Rec[] };
  const entries = Array.isArray(history?.history) ? history.history : [];
  const renamed = entries.find((e) => String(e.what) === 'renamed');
  const allowances = entries.filter((e) => String(e.what) === 'allowance set');
  expect.soft(renamed !== undefined && actAt(renamed, /^at$/, c.T1, TEAM_ZONE), `RULE-005 N's rename is recorded at T1 (${show(renamed)})`).toBe(true);
  expect.soft(allowances.length, `RULE-005 N's history lists her two allowance changes (${show(entries)})`).toBe(2);
  for (const e of allowances) expect.soft(actAt(e, /^at$/, c.T4, TEAM_ZONE), `RULE-005 N's allowance change is recorded at T4 (${show(e)})`).toBe(true);
  expect.soft(allowances.map((e) => Number(e.startsYear)).sort(), `RULE-005 N's allowance changes start ${c.Y + 1} and ${c.Y + 2} (${show(allowances)})`).toEqual([c.Y + 1, c.Y + 2]);

  // Every time the store holds lies within the team clock's span.
  const lo = Date.parse(c.T1) - 2 * 60_000;
  const hi = Date.parse(c.T5late) + 31 * 86_400_000;
  const times = await storedTimes();
  expect(times.length, 'RULE-005: the store holds times (the census has a denominator)').toBeGreaterThanOrEqual(5);
  const outside = times.filter((t) => !t.readings.some((r) => r >= lo && r <= hi)).map((t) => `${t.where} (read as ${t.readings.map((r) => new Date(r).toISOString()).join(' or ')})`);
  expect.soft(outside, `RULE-005: every stored time lies between T1 ${c.T1} and T5+16 min ${c.T5late} plus 31 days — none read from another clock`).toEqual([]);
});
