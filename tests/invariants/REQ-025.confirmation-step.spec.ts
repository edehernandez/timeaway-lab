// Purpose: ledger tests for ROW-256, ROW-257 and ROW-259 (REQ-025) — approve, reject, cancel approved days and switch off never take effect without their confirmation step; the confirmation names the person, the days and what will change; and declining it changes nothing.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, the confirmed two-step actions), fresh per run.
//
// Boundary (R6): a rule about the four admin acts, proved at the HTTP harness on D-029's two steps — step one
// GET …/effect?action=… answers {token, summary} (the confirmation: what the admin is shown), step two posts the
// act with its token. The pages that show the confirmation are ROW-275, ROW-276 and ROW-277's (browser).
// "Took effect" is read on the people the act concerns: GET /api/balance on their own sessions (D-029's
// {years:[{year,daysLeft,pending}]}) for approve, reject and cancel, and sign-in for switch-off (A-008).
import { test, expect } from '@playwright/test';
import {
  approve,
  confirmedActionRoutes,
  createMember,
  DEFAULT_TIME_ZONE,
  fresh,
  freshName,
  readEffect,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Member,
} from './harness';
import { addDays, freshInt, is2xx, mentionsDay, pick, postRaw, signedIn, trySignIn, weekdaysBetween, yearFigures } from './admin-kit';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const YEAR = 2027;

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

interface World {
  admin: Actor;
  /** Ilse: two pending vacation requests, R1 (k weekdays from Mon 15 Mar) and R2 (22–24 Mar). */
  ilse: Person;
  r1: { id: AccountId; firstDay: string; lastDay: string; days: number };
  r2: { id: AccountId; firstDay: string; lastDay: string; days: number };
  /** Oskar: one approved vacation request RO, 29–31 Mar. */
  oskar: Person;
  ro: { id: AccountId; firstDay: string; lastDay: string; days: number };
  /** Petra: one approved vacation request RP, 22–23 Mar; the switch-off target. */
  petra: Person;
  rp: { id: AccountId; firstDay: string; lastDay: string; days: number };
  /** Quinn: no requests; the switch-off decoy. */
  quinn: Person;
}

async function person(admin: Actor, label: string, avoid: number[]): Promise<Person> {
  const allowance = freshInt(20, 40, avoid);
  const member = await createMember(admin, { name: freshName(label), allowance });
  return { member, session: keep(await signInMember(member)), allowance };
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const used: number[] = [];
  const ilse = await person(admin, 'Ilse', used);
  used.push(ilse.allowance);
  const oskar = await person(admin, 'Oskar', used);
  used.push(oskar.allowance);
  const petra = await person(admin, 'Petra', used);
  used.push(petra.allowance);
  const quinn = await person(admin, 'Quinn', used);

  const k = pick([2, 3, 4]);
  const r1Spec = { kind: 'vacation' as const, firstDay: '2027-03-15', lastDay: addDays('2027-03-15', k - 1) };
  const r2Spec = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-24' };
  const roSpec = { kind: 'vacation' as const, firstDay: '2027-03-29', lastDay: '2027-03-31' };
  const rpSpec = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-23' };
  const r1 = { id: await sendRequest(ilse.session, r1Spec), ...r1Spec, days: k };
  const r2 = { id: await sendRequest(ilse.session, r2Spec), ...r2Spec, days: weekdaysBetween(r2Spec.firstDay, r2Spec.lastDay).length };
  const ro = { id: await sendRequest(oskar.session, roSpec), ...roSpec, days: weekdaysBetween(roSpec.firstDay, roSpec.lastDay).length };
  const rp = { id: await sendRequest(petra.session, rpSpec), ...rpSpec, days: weekdaysBetween(rpSpec.firstDay, rpSpec.lastDay).length };
  await approve(admin, ro.id);
  await approve(admin, rp.id);
  return { admin, ilse, r1, r2, oskar, ro, petra, rp, quinn };
}

/** Posts the act of `action` on `target` with exactly `body` (no token, a forged one, another confirmation's), unjudged. */
async function actWithBody(admin: Actor, action: ConfirmedAction, target: AccountId, body: Record<string, unknown>): Promise<number> {
  const { act } = confirmedActionRoutes(action, target);
  return (await postRaw(admin.api, act, body)).status;
}

/** What each person's figures should read while none of the four acts has taken effect. */
async function expectUntouched(w: World, row: string): Promise<void> {
  const ilse = await yearFigures(w.ilse.session, YEAR);
  expect.soft(ilse, `${row}: Ilse's ${YEAR} figures: R1 and R2 still pending, nothing approved`).toEqual({
    daysLeft: w.ilse.allowance,
    pending: w.r1.days + w.r2.days,
  });
  const oskar = await yearFigures(w.oskar.session, YEAR);
  expect.soft(oskar, `${row}: Oskar's ${YEAR} figures: RO still approved, nothing given back`).toEqual({
    daysLeft: w.oskar.allowance - w.ro.days,
    pending: 0,
  });
  expect.soft((await w.petra.session.api.get('/api/me')).status(), `${row}: Petra's open session still works (not switched off)`).toBe(200);
  expect.soft(signedIn(await trySignIn(w.petra.member)), `${row}: Petra still signs in (not switched off)`).toBe(true);
  const petra = await yearFigures(w.petra.session, YEAR);
  expect.soft(petra, `${row}: Petra's ${YEAR} figures: RP still approved`).toEqual({ daysLeft: w.petra.allowance - w.rp.days, pending: 0 });
  expect.soft(signedIn(await trySignIn(w.quinn.member)), `${row}: Quinn still signs in (not switched off)`).toBe(true);
}

// ---------------------------------------------------------------------------------------------------
// ROW-256 promise: REQ-025 fail-if (1) "any of the four actions takes effect without a confirmation step"; A-040
// ROW-256   "nothing happens until it is confirmed"; D-029: the act carries the token its own effect step gave.
// ROW-256 wrong product: an act route that ignores the token (or accepts any non-empty one), so a script, a double
// ROW-256   tap or a stale page approves without the step; a token checked for existence but not bound to its action
// ROW-256   or its target, so the confirmation shown for R2 (or for rejecting R1) approves R1.
// ROW-256 given: Ilse with pending R1 and R2, Oskar with approved RO, Petra with approved RP, Quinn; the admin reads
// ROW-256   the effect (gets the token) of: approve R2, reject R1, reject R2, cancel RP, switch-off Quinn — and never of
// ROW-256   approve R1, reject R1's approve, cancel RO or switch-off Petra. when: the admin posts approve R1, reject R1,
// ROW-256   cancel RO and switch-off Petra with no token, an empty token, a forged fresh token, and a token from
// ROW-256   another action's or another target's confirmation. then: every post answers non-2xx, and Ilse's, Oskar's,
// ROW-256   Petra's and Quinn's figures and sign-in are exactly as before.
// ROW-256 controls: the control case confirms approve R1 through both steps: 2xx, and Ilse's figures move (pending
// ROW-256   down by R1's days, days left down by R1's days) — the act and the observation both work.
// ROW-256 technique: every way of skipping the step (none, empty, forged, misbound) against each of the four acts,
// ROW-256   with the effect read on the people concerned, not on the act's status alone.
// ROW-256 cases: ROW-256 target=ROW-256.REQ-025.no-act-takes-effect-without-its-own-confirmation control=ROW-256.control.a-confirmed-approve-takes-effect
test('ROW-256.control.a-confirmed-approve-takes-effect', async () => {
  const w = await world();
  const before = await yearFigures(w.ilse.session, YEAR);
  expect(before, 'ROW-256 control before: Ilse has R1 and R2 pending').toEqual({ daysLeft: w.ilse.allowance, pending: w.r1.days + w.r2.days });
  const effect = await readEffect(w.admin, 'approve', w.r1.id);
  const status = await actWithBody(w.admin, 'approve', w.r1.id, { token: effect.token });
  expect(is2xx(status), `ROW-256 control: the confirmed approve is accepted (answered ${status})`).toBe(true);
  expect(await yearFigures(w.ilse.session, YEAR), 'ROW-256 control: R1 is approved').toEqual({
    daysLeft: w.ilse.allowance - w.r1.days,
    pending: w.r2.days,
  });
});

test('ROW-256.REQ-025.no-act-takes-effect-without-its-own-confirmation', async () => {
  const w = await world();
  await expectUntouched(w, 'ROW-256 before');

  const approveR2 = await readEffect(w.admin, 'approve', w.r2.id);
  const rejectR1 = await readEffect(w.admin, 'reject', w.r1.id);
  const rejectR2 = await readEffect(w.admin, 'reject', w.r2.id);
  const cancelRp = await readEffect(w.admin, 'cancel', w.rp.id);
  const offQuinn = await readEffect(w.admin, 'switch-off', w.quinn.member.id);

  const attempts: { what: string; action: ConfirmedAction; target: AccountId; body: Record<string, unknown> }[] = [
    { what: 'approve R1 with no token', action: 'approve', target: w.r1.id, body: {} },
    { what: 'approve R1 with an empty token', action: 'approve', target: w.r1.id, body: { token: '' } },
    { what: 'approve R1 with a forged token', action: 'approve', target: w.r1.id, body: { token: fresh('forged') } },
    { what: "approve R1 with R2's approve token", action: 'approve', target: w.r1.id, body: { token: approveR2.token } },
    { what: "approve R1 with R1's reject token", action: 'approve', target: w.r1.id, body: { token: rejectR1.token } },
    { what: 'reject R1 with no token', action: 'reject', target: w.r1.id, body: {} },
    { what: 'reject R1 with a forged token', action: 'reject', target: w.r1.id, body: { token: fresh('forged') } },
    { what: "reject R1 with R2's reject token", action: 'reject', target: w.r1.id, body: { token: rejectR2.token } },
    { what: 'cancel RO with no token', action: 'cancel', target: w.ro.id, body: {} },
    { what: 'cancel RO with a forged token', action: 'cancel', target: w.ro.id, body: { token: fresh('forged') } },
    { what: "cancel RO with RP's cancel token", action: 'cancel', target: w.ro.id, body: { token: cancelRp.token } },
    { what: 'switch Petra off with no token', action: 'switch-off', target: w.petra.member.id, body: { on: false } },
    { what: 'switch Petra off with a forged token', action: 'switch-off', target: w.petra.member.id, body: { on: false, token: fresh('forged') } },
    { what: "switch Petra off with Quinn's switch-off token", action: 'switch-off', target: w.petra.member.id, body: { on: false, token: offQuinn.token } },
    { what: "switch Petra off with RP's cancel token", action: 'switch-off', target: w.petra.member.id, body: { on: false, token: cancelRp.token } },
  ];
  for (const a of attempts) {
    const status = await actWithBody(w.admin, a.action, a.target, a.body);
    expect.soft(is2xx(status), `ROW-256: ${a.what} is refused (answered ${status})`).toBe(false);
  }

  await expectUntouched(w, 'ROW-256 after');
});

// ---------------------------------------------------------------------------------------------------
// ROW-257 promise: REQ-025 fail-if (2) "the confirmation does not name the person, the days or what will change";
// ROW-257   A-040 "a confirmation naming the person, the days and what will change". The confirmation's words are
// ROW-257   D-029's effect `summary`.
// ROW-257 wrong product: a generic "Are you sure?"; a summary naming the request id but not the person; one naming
// ROW-257   the person but not the days; one that names the days of the person's other request, or another person.
// ROW-257 given: Ilse (pending R1 from Mon 15 Mar, k weekdays, k chosen per run; pending R2 22–24 Mar), Oskar
// ROW-257   (approved RO 29–31 Mar), Petra (approved RP 22–23 Mar), fresh names. when: the admin reads the effect of
// ROW-257   approve R1, reject R2, cancel RO and switch-off Oskar. then: each summary carries the person's fresh name and
// ROW-257   no other person's, the first and last day of the request concerned and none of the decoy request's days,
// ROW-257   and the action's own word (approve, reject, cancel, switch off).
// ROW-257 controls: the control case shows the effect step answers each action with a non-empty summary and a
// ROW-257   token, and that the admin still sees R1 and R2 pending — the step is reached and nothing was decided.
// ROW-257 technique: decoys — the same person's other request and another person in the same fixture, each named
// ROW-257   exactly once; days read in any plain date form (admin-kit's mentionsDay), never one product's format.
// ROW-257 cases: ROW-257 target=ROW-257.REQ-025.each-confirmation-names-the-person-the-days-and-the-change control=ROW-257.control.each-effect-answers-a-summary-and-a-token
test('ROW-257.control.each-effect-answers-a-summary-and-a-token', async () => {
  const w = await world();
  for (const [action, target] of [
    ['approve', w.r1.id],
    ['reject', w.r2.id],
    ['cancel', w.ro.id],
    ['switch-off', w.oskar.member.id],
  ] as [ConfirmedAction, AccountId][]) {
    const e = await readEffect(w.admin, action, target);
    expect(typeof e.summary === 'string' && e.summary.trim() !== '', `ROW-257 control: the ${action} effect carries a summary`).toBe(true);
  }
  expect(await yearFigures(w.ilse.session, YEAR), 'ROW-257 control: reading the effects decided nothing').toEqual({
    daysLeft: w.ilse.allowance,
    pending: w.r1.days + w.r2.days,
  });
});

test('ROW-257.REQ-025.each-confirmation-names-the-person-the-days-and-the-change', async () => {
  const w = await world();
  const names = { ilse: w.ilse.member.name, oskar: w.oskar.member.name, petra: w.petra.member.name };

  const checks: {
    what: string;
    action: ConfirmedAction;
    target: AccountId;
    person: string;
    others: string[];
    days: string[];
    decoyDays: string[];
    verb: RegExp;
  }[] = [
    {
      what: 'approve R1',
      action: 'approve',
      target: w.r1.id,
      person: names.ilse,
      others: [names.oskar, names.petra],
      days: [w.r1.firstDay, w.r1.lastDay],
      decoyDays: [w.r2.firstDay, w.r2.lastDay, w.ro.firstDay, w.ro.lastDay],
      verb: /approv/i,
    },
    {
      what: 'reject R2',
      action: 'reject',
      target: w.r2.id,
      person: names.ilse,
      others: [names.oskar, names.petra],
      days: [w.r2.firstDay, w.r2.lastDay],
      decoyDays: [w.r1.firstDay, w.ro.firstDay, w.ro.lastDay],
      verb: /reject/i,
    },
    {
      what: 'cancel RO',
      action: 'cancel',
      target: w.ro.id,
      person: names.oskar,
      others: [names.ilse, names.petra],
      days: [w.ro.firstDay, w.ro.lastDay],
      decoyDays: [w.r1.firstDay, w.r2.firstDay, w.r2.lastDay],
      verb: /cancel/i,
    },
    {
      what: 'switch Oskar off',
      action: 'switch-off',
      target: w.oskar.member.id,
      person: names.oskar,
      others: [names.ilse, names.petra],
      days: [w.ro.firstDay, w.ro.lastDay],
      decoyDays: [w.r1.firstDay, w.r2.firstDay, w.r2.lastDay],
      verb: /switch(?:ed|es|ing)?[\s-]*off|deactivat|disabl/i,
    },
  ];

  for (const c of checks) {
    const { summary } = await readEffect(w.admin, c.action, c.target);
    const s = String(summary ?? '');
    expect.soft(s.includes(c.person), `ROW-257 ${c.what}: the confirmation names the person "${c.person}" — summary: ${JSON.stringify(s)}`).toBe(true);
    for (const o of c.others) {
      expect.soft(s.includes(o), `ROW-257 ${c.what}: the confirmation does not name another person "${o}" — summary: ${JSON.stringify(s)}`).toBe(false);
    }
    for (const d of c.days) {
      expect.soft(mentionsDay(s, d), `ROW-257 ${c.what}: the confirmation names the day ${d} — summary: ${JSON.stringify(s)}`).toBe(true);
    }
    for (const d of c.decoyDays) {
      expect.soft(mentionsDay(s, d), `ROW-257 ${c.what}: the confirmation does not name ${d}, a day of another request — summary: ${JSON.stringify(s)}`).toBe(false);
    }
    expect.soft(c.verb.test(s), `ROW-257 ${c.what}: the confirmation says what will change (${c.verb}) — summary: ${JSON.stringify(s)}`).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-259 promise: REQ-025 fail-if (4) "declining the confirmation changes anything"; A-040 "nothing happens until
// ROW-259   it is confirmed". Declining is the admin seeing the confirmation (step one, the effect read the page makes
// ROW-259   when it opens the confirmation) and never confirming (no step two).
// ROW-259 wrong product: an effect step that applies the act, or part of it, when it is read (the request moves to
// ROW-259   approved or rejected, the days are given back, the account's sessions end or its pending days are frozen),
// ROW-259   leaving the confirm step to merely record it.
// ROW-259 given: the same four people and requests as ROW-256. when: the admin reads the effect of approve R1, reject
// ROW-259   R2, cancel RO and switch-off Petra (each twice, as a hesitating admin would) and posts nothing. then:
// ROW-259   Ilse's figures still show R1 and R2 pending and nothing approved; Oskar's still show RO approved; Petra's
// ROW-259   open session still works, she still signs in and RP is still approved; and R1 can still be decided.
// ROW-259 controls: the control case confirms all four through both steps and sees each figure move (Ilse's pending
// ROW-259   and days left, Oskar's days left, Petra's sign-in) — the same reads detect a change when one happens.
// ROW-259 technique: before and after on the people concerned, with the confirmed case as the control that the
// ROW-259   reads are sensitive.
// ROW-259 cases: ROW-259 target=ROW-259.REQ-025.declining-each-confirmation-changes-nothing control=ROW-259.control.confirming-each-action-changes-what-declining-left
test('ROW-259.control.confirming-each-action-changes-what-declining-left', async () => {
  const w = await world();
  for (const [action, target, extra] of [
    ['approve', w.r1.id, {}],
    ['reject', w.r2.id, {}],
    ['cancel', w.ro.id, {}],
    ['switch-off', w.petra.member.id, { on: false }],
  ] as [ConfirmedAction, AccountId, Record<string, unknown>][]) {
    const e = await readEffect(w.admin, action, target);
    const status = await actWithBody(w.admin, action, target, { ...extra, token: e.token });
    expect(is2xx(status), `ROW-259 control: the confirmed ${action} is accepted (answered ${status})`).toBe(true);
  }
  expect(await yearFigures(w.ilse.session, YEAR), 'ROW-259 control: R1 approved, R2 rejected').toEqual({
    daysLeft: w.ilse.allowance - w.r1.days,
    pending: 0,
  });
  expect(await yearFigures(w.oskar.session, YEAR), 'ROW-259 control: RO cancelled, its future days given back').toEqual({
    daysLeft: w.oskar.allowance,
    pending: 0,
  });
  expect(signedIn(await trySignIn(w.petra.member)), 'ROW-259 control: Petra is switched off').toBe(false);
});

test('ROW-259.REQ-025.declining-each-confirmation-changes-nothing', async () => {
  const w = await world();
  await expectUntouched(w, 'ROW-259 before');

  for (let i = 0; i < 2; i += 1) {
    await readEffect(w.admin, 'approve', w.r1.id);
    await readEffect(w.admin, 'reject', w.r2.id);
    await readEffect(w.admin, 'cancel', w.ro.id);
    await readEffect(w.admin, 'switch-off', w.petra.member.id);
  }

  await expectUntouched(w, 'ROW-259 after declining');
  const again = await readEffect(w.admin, 'approve', w.r1.id);
  const status = await actWithBody(w.admin, 'approve', w.r1.id, { token: again.token });
  expect.soft(is2xx(status), `ROW-259: R1 is still pending and decidable after the declined confirmations (approve answered ${status})`).toBe(true);
});
