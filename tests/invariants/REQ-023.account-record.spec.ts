// Purpose: ledger tests for ROW-109, ROW-110 and ROW-111 (REQ-023) — an account holds its name, email, password, switched-on state, admin flag and the allowance for each year, and a later allowance change never rewrites an earlier year's allowance or the days left worked out from it.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, allowances, requests, approve, switch-off, sign-in), read through records.ts, fresh per run.
//
// Boundary (R6): a data entity, at the HTTP harness — the account as the product exposes it: the admin's people data
// (GET /api/admin/people), the account's own GET /api/me and GET /api/balance, and sign-in (D-029). An account's
// people record is the record holding its email (records.ts), its facts read by value.
// Time: the team zone is Pacific/Auckland. Year Y is 2027 (clock Mon 2027-03-01 09:00, UTC Sun 02-28); Y+1 is reached
// at Wed 2028-03-01 09:00. Between them D-025 is the rule: the allowance for a year is, among the changes starting at
// or before it, the one with the latest starting year (most recently made among equals). The product shows a year's
// days left only while it is the current or the next year (REQ-007, REQ-020), so ROW-110 reads year Y by setting
// the clock back into Y after the change made in Y+1: what the product holds for Y is what it then shows for Y.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  readBalance,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Install,
  type Me,
  type Member,
} from './harness';
import { daysLeftIn, holdsValue, observe, observePeople, onOffPath, recordByEmail, show, teamInstant } from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_Y = teamInstant('2027-03-01', '09:00', TZ);
const T_Y_LATER = teamInstant('2027-06-01', '09:00', TZ);
const T_Y1 = teamInstant('2028-03-01', '09:00', TZ);

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
  await setClock(null).catch(() => undefined);
});

async function start(): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({ now: T_Y, timeZone: TZ });
  return { install, admin: keep(await signIn(install.admin)) };
}

// ---------------------------------------------------------------------------------------------------
// ROW-109 promise: REQ-023 fail-if (1) "an account lacks any of the named fields" — its display name, its email, its
// ROW-109   password, whether it is switched on, whether it is the admin, and the allowance in force for each calendar
// ROW-109   year (REQ-023; A-029, A-013, A-043). (The email's uniqueness is REQ-013's and REQ-027's rows'.)
// ROW-109 wrong product: an account with a single allowance number (no year it applies to, so next year's cannot be
// ROW-109   held apart), no switched-on flag (switch-off by deleting sessions only), or no admin flag (admin by first id).
// ROW-109 given: Tess, created with a fresh name, email and password and allowance 33, then 44 set from next year;
// ROW-109   Uwe, switched off. when: the admin reads the people data; Tess reads GET /api/me and her balance; Tess's
// ROW-109   password and a near miss are tried at sign-in. then: Tess's people record holds her name, email, 33 and 44; a
// ROW-109   field reads switched on for Tess and the admin and off for Uwe; her /api/me holds her name and isAdmin false,
// ROW-109   the admin's isAdmin true; her balance holds 33 days left for 2027 and 44 for 2028; her password signs in and
// ROW-109   the near miss does not.
// ROW-109 controls: the control case shows the people data answers with Tess's record and her /api/me answers her.
// ROW-109 technique: one check per named field, each on a fresh or unusual value; the switched-off account and the
// ROW-109   admin as the decoys for the two flags; a near-miss password for "holds its password".
// ROW-109 cases: ROW-109 target=ROW-109.REQ-023.an-account-holds-every-named-field control=ROW-109.control.the-account-is-listed-and-answers-its-own-me
async function accounts() {
  const { install, admin } = await start();
  const tess = await createMember(admin, { name: freshName('Tess'), email: freshEmail('tess'), allowance: 33 });
  await setAllowance(admin, tess.id, 44, { startsNextYear: true });
  const uwe = await createMember(admin, { name: freshName('Uwe'), email: freshEmail('uwe'), allowance: 29 });
  await switchAccount(admin, uwe.id, false);
  return { install, admin, tess, uwe };
}

test('ROW-109.control.the-account-is-listed-and-answers-its-own-me', async () => {
  const f = await accounts();
  expect(recordByEmail(await observePeople(f.admin), f.tess.email), "ROW-109 control: Tess's people record is found by her email").toBeDefined();
  const t = keep(await signInMember(f.tess));
  expect((await t.api.get('/api/me')).status(), 'ROW-109 control: her /api/me answers').toBe(200);
});

test('ROW-109.REQ-023.an-account-holds-every-named-field', async () => {
  const f = await accounts();
  const people = await observePeople(f.admin);
  const tess = recordByEmail(people, f.tess.email);
  const uwe = recordByEmail(people, f.uwe.email);
  const admin = recordByEmail(people, f.install.admin.email);
  const w = `ROW-109: Tess's account (${show(tess)})`;
  expect.soft(holdsValue(tess, f.tess.name), `${w} holds her display name`).toBe(true);
  expect.soft(holdsValue(tess, f.tess.email), `${w} holds her email`).toBe(true);
  expect.soft(holdsValue(tess, 33), `${w} holds the allowance in force for 2027, 33`).toBe(true);
  expect.soft(holdsValue(tess, 44), `${w} holds the allowance in force for 2028, 44`).toBe(true);
  expect.soft(tess && uwe ? onOffPath(tess, uwe, admin) : undefined, 'ROW-109: a field reads switched on for Tess and the admin and switched off for Uwe').toBeDefined();

  const t = keep(await signInMember(f.tess));
  const me = (await observe(t.api, '/api/me')) as Me;
  expect.soft(me?.name, 'ROW-109: her account answers its display name').toBe(f.tess.name);
  expect.soft(me?.isAdmin, 'ROW-109: her account is not the admin').toBe(false);
  const adminMe = (await observe(f.admin.api, '/api/me')) as Me;
  expect.soft(adminMe?.isAdmin, 'ROW-109: the admin account is the admin').toBe(true);
  const b = await readBalance(t);
  expect.soft(daysLeftIn(b, 2027), 'ROW-109: her 2027 days left is worked out from 33').toBe(33);
  expect.soft(daysLeftIn(b, 2028), 'ROW-109: her 2028 days left is worked out from 44').toBe(44);

  const anon = keep(await anonymousApi());
  const right = await anon.post('/api/auth/sign-in', { data: { email: f.tess.email, password: f.tess.password } });
  expect.soft(right.ok(), 'ROW-109: her password signs her in').toBe(true);
  const anon2 = keep(await anonymousApi());
  const near = await anon2.post('/api/auth/sign-in', { data: { email: f.tess.email, password: `${f.tess.password}x` } });
  expect.soft(near.ok(), 'ROW-109: a near-miss password does not (the account holds its password)').toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-110 promise: REQ-023 fail-if (2) "changing an allowance changes the allowance recorded for a year before the
// ROW-110   current one"; REQ-023 "a year keeps the allowance it had when a later change applies only from a later year
// ROW-110   on" (D-025). The row's case: through the domain surfaces with the test clock, in year Y set the allowance to 20,
// ROW-110   move to Y+1 and set 25: the allowance for Y is still 20 and Y's days left is worked out from 20.
// ROW-110 wrong product: one allowance column per account that the change overwrites, so every year — 2027 included —
// ROW-110   reads 25 (2027 days left 22 instead of 17).
// ROW-110 given: Yara (allowance 30) in 2027; the admin sets 20 (from this year); 3 days approved in March 2027. when:
// ROW-110   the clock moves to 2028 and the admin sets 25 (from this year, 2028); then the clock is set back into 2027.
// ROW-110   (both sign in again after each move, D-017). then: in 2028 her 2028 days left is 25; back in 2027 her 2027 days left is 20 − 3 = 17, and
// ROW-110   the admin's people record of her holds 20 and 17.
// ROW-110 controls: the control case reads 2027 before the 2028 change: 17 days left, the people record holding 20.
// ROW-110 technique: the row's own example values; the test clock moved across the year boundary and back, never the
// ROW-110   machine's clock.
// ROW-110 cases: ROW-110 target=ROW-110.REQ-023.a-later-years-change-leaves-the-earlier-years-allowance control=ROW-110.control.in-year-y-the-allowance-is-20
async function yara() {
  const { install, admin } = await start();
  const m = await createMember(admin, { name: freshName('Yara'), email: freshEmail('yara'), allowance: 30 });
  await setAllowance(admin, m.id, 20);
  const actor = keep(await signInMember(m));
  await approve(admin, await sendRequest(actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  return { install, admin, m, actor };
}

/** Moves the team clock and signs both actors in again (D-017: a session ends after 30 days without use). */
async function moveTo(f: Awaited<ReturnType<typeof yara>>, instant: string): Promise<{ admin: Actor; actor: Actor }> {
  await setClock(instant);
  return { admin: keep(await signIn(f.install.admin)), actor: keep(await signInMember(f.m)) };
}

test('ROW-110.control.in-year-y-the-allowance-is-20', async () => {
  const f = await yara();
  expect(daysLeftIn(await readBalance(f.actor), 2027), 'ROW-110 control: in 2027 Yara has 20 − 3 = 17 days left').toBe(17);
  expect(holdsValue(recordByEmail(await observePeople(f.admin), f.m.email), 20), 'ROW-110 control: her people record holds 20').toBe(true);
});

test('ROW-110.REQ-023.a-later-years-change-leaves-the-earlier-years-allowance', async () => {
  const f = await yara();
  const inY1 = await moveTo(f, T_Y1);
  await setAllowance(inY1.admin, f.m.id, 25);
  expect.soft(daysLeftIn(await readBalance(inY1.actor), 2028), 'ROW-110: in 2028 the change applies: 25 days left for 2028').toBe(25);
  const backInY = await moveTo(f, T_Y_LATER);
  expect.soft(daysLeftIn(await readBalance(backInY.actor), 2027), "ROW-110: 2027's days left is still worked out from 20: 17, not 22").toBe(17);
  const rec = recordByEmail(await observePeople(backInY.admin), f.m.email);
  expect.soft(holdsValue(rec, 20), `ROW-110: her people record still holds 2027's allowance 20 (${show(rec)})`).toBe(true);
  expect.soft(holdsValue(rec, 17), 'ROW-110: and 2027 days left 17').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-111 promise: REQ-023 fail-if (3) "a days-left figure for an earlier year is worked out from a later year's
// ROW-111   allowance"; REQ-023 "the allowance in force for each calendar year" (A-043: a change starting next year leaves
// ROW-111   this year's allowance and days left unchanged; D-025).
// ROW-111 wrong product: days left worked out from the newest allowance change whatever year it starts (the member's
// ROW-111   2027 figure becomes 31 − 3 = 28), or from the account's single latest number.
// ROW-111 given: Zoe, allowance 20 in 2027, 3 days approved in March 2027 (17 left for 2027, 20 for 2028). when: the
// ROW-111   admin sets 31 starting next year. then: the days left Zoe herself is shown for 2027 is still 17, and for 2028 is
// ROW-111   31.
// ROW-111 controls: the control case reads Zoe's balance before the change: 17 for 2027 and 20 for 2028 — the figures
// ROW-111   the change must (2028) and must not (2027) move.
// ROW-111 technique: before and after on the member's own figures; the later year's value (31) chosen so a figure
// ROW-111   worked out from it (28) differs from every right figure.
// ROW-111 cases: ROW-111 target=ROW-111.REQ-023.an-earlier-years-days-left-is-worked-out-from-its-own-allowance control=ROW-111.control.before-the-change-both-years-read-from-20
async function zoe(): Promise<{ admin: Actor; m: Member; actor: Actor }> {
  const { admin } = await start();
  const m = await createMember(admin, { name: freshName('Zoe'), email: freshEmail('zoe'), allowance: 20 });
  const actor = keep(await signInMember(m));
  await approve(admin, await sendRequest(actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  return { admin, m, actor };
}

test('ROW-111.control.before-the-change-both-years-read-from-20', async () => {
  const f = await zoe();
  const b = await readBalance(f.actor);
  expect.soft(daysLeftIn(b, 2027), 'ROW-111 control: 2027 reads 17').toBe(17);
  expect.soft(daysLeftIn(b, 2028), 'ROW-111 control: 2028 reads 20').toBe(20);
});

test('ROW-111.REQ-023.an-earlier-years-days-left-is-worked-out-from-its-own-allowance', async () => {
  const f = await zoe();
  await setAllowance(f.admin, f.m.id, 31, { startsNextYear: true });
  const b = await readBalance(f.actor);
  expect.soft(daysLeftIn(b, 2028), 'ROW-111: the change applies to 2028: 31 days left (reached)').toBe(31);
  expect.soft(daysLeftIn(b, 2027), "ROW-111: 2027's days left is still worked out from 2027's allowance 20: 17, not 28").toBe(17);
});
