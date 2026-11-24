// Purpose: ledger test for ROW-127 (INV-003) — the control of the admin-only rule: the admin performs each admin action (approve, reject, cancel approved, set allowance, create, rename, set another's password, switch off and on) and each takes effect.
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create account, own password change, send), fresh per run. The actions under test are called raw on the admin's session so their answers are judged here, not as setup.
//
// ROW-127 promise: INV-003 "Only the admin approves, rejects, cancels approved requests, sets allowances, creates
// ROW-127   and renames accounts, ... sets another person's password and switches accounts" — the control half: the
// ROW-127   admin can, and each act takes effect. Effects from their own items: approval puts the days on the calendar
// ROW-127   and takes them from days left (REQ-012, INV-001); a rejection leaves days left and the calendar unchanged
// ROW-127   and ends pending (REQ-007); a cancel of an approved request with all its days from today on returns them
// ROW-127   and takes them off the calendar (REQ-010, A-007); a changed allowance changes this year's days left at once
// ROW-127   (REQ-011); a created account signs in (REQ-013, REQ-014); a rename shows in the account's own answer
// ROW-127   (REQ-013, A-029); after a password set the old one no longer signs in and the new one does (REQ-015); a
// ROW-127   switched-off account cannot sign in and a switched-on one can (REQ-014, A-008). Routes from D-029.
// ROW-127 wrong product: a guard so strict it refuses the admin too (every admin route 403); an approve that
// ROW-127   answers 200 but leaves the request pending; a cancel that changes the state but leaves the days on the
// ROW-127   calendar; an allowance stored for next year only; a rename that changes the people list but not the
// ROW-127   account; a password set that leaves the old password working; a switch-on that answers 200 but leaves the
// ROW-127   account unable to sign in.
// ROW-127 given: a fresh install (clock 2027-03-01 09:00 in Pacific/Auckland, 2027-02-28T20:00Z) and a fresh member
// ROW-127   with allowance 25 and their own password; vacation requests 15–16 March and 22–23 March 2027.
// ROW-127 when: the admin, on its own session, does each act through its D-029 route (the confirmed ones in their
// ROW-127   two steps). then: each act answers 2xx and its effect is read before and after it — balance 2027
// ROW-127   {daysLeft, pending} 25/2 → 23/0 on approve, 23/2 → 23/0 on reject, 23 → 25 on cancel, 25 → 30 on the
// ROW-127   allowance; the member on the 15 March calendar day absent → present → absent (cancel), absent on 22 March
// ROW-127   after the reject; a fresh email that could not sign in can after create; the member's own name before
// ROW-127   and after rename; the old password signs in before and not after the set, the new one after; the
// ROW-127   account signs in before switch-off, not after it, and again after switch-on.
// ROW-127 controls: the control case reads the observation channels before any act: the member's 2027 balance is
// ROW-127   25 days left with nothing pending, and the admin's session is the admin's.
// ROW-127 technique: before and after for every act on the observable it changes (the result absent before the
// ROW-127   act); fresh names, emails and passwords; each act's own answer asserted, not only its effect.
// ROW-127 cases: ROW-127 target=ROW-127.INV-003.admin-performs-every-admin-action-and-each-takes-effect control=ROW-127.control.balance-and-admin-session-readable-before-any-act
import { test, expect, type APIResponse } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  confirmedActionRoutes,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  readBalance,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Install,
  type Member,
} from './harness';

const T0 = '2027-02-28T20:00:00Z';

let install: Install;
let admin: Actor;
let member: Member;

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  member = await createMember(admin, { allowance: 25 });
});

test.afterAll(async () => {
  await admin?.dispose();
});

function ok(res: APIResponse): boolean {
  return res.status() >= 200 && res.status() < 300;
}

async function year2027(actor: Actor): Promise<{ daysLeft: number; pending: number } | undefined> {
  const y = (await readBalance(actor)).years.find((e) => e.year === 2027);
  return y ? { daysLeft: y.daysLeft, pending: y.pending } : undefined;
}

async function awayOn(day: string, name: string): Promise<boolean> {
  const [y, m] = day.split('-').map(Number);
  const res = await admin.api.get(`/api/calendar?year=${y}&month=${m}`);
  expect(res.status(), `ROW-127: GET /api/calendar?year=${y}&month=${m} answers`).toBe(200);
  const days = ((await res.json()) as { days: { date: string; people: { name: string }[] }[] }).days ?? [];
  return days.some((d) => d.date === day && d.people.some((p) => p.name === name));
}

/** True when the email and password sign in: the sign-in answers 2xx and GET /api/me then answers 200. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    const res = await api.post('/api/auth/sign-in', { data: { email, password } });
    if (!ok(res)) return false;
    return (await api.get('/api/me')).status() === 200;
  } finally {
    await api.dispose();
  }
}

/** A confirmed action in its two steps, raw: both answers are returned for the test to judge. */
async function confirmed(action: ConfirmedAction, id: AccountId): Promise<{ effect: number; act: number }> {
  const { effect } = confirmedActionRoutes(action, id);
  const first = await admin.api.get(effect);
  let token = '';
  try {
    token = ((await first.json()) as { token?: string }).token ?? '';
  } catch {
    /* no JSON: judged below by the status */
  }
  const act = await actWithToken(admin, action, id, token);
  return { effect: first.status(), act: act.status() };
}

test('ROW-127.control.balance-and-admin-session-readable-before-any-act', async () => {
  const m = await signInMember(member);
  try {
    expect(await year2027(m), 'ROW-127 control: the member starts with 25 days left and nothing pending in 2027').toEqual({ daysLeft: 25, pending: 0 });
  } finally {
    await m.dispose();
  }
  const me = await admin.api.get('/api/me');
  expect(me.status(), 'ROW-127 control: the admin session answers GET /api/me').toBe(200);
  expect((await me.json()).isAdmin, 'ROW-127 control: it is the admin').toBe(true);
});

test('ROW-127.INV-003.admin-performs-every-admin-action-and-each-takes-effect', async () => {
  // create
  const created = { name: freshName('Created'), email: freshEmail('created'), password: freshPassword(), allowance: 20 };
  expect(await canSignIn(created.email, created.password), 'ROW-127 create (before): the fresh email does not sign in').toBe(false);
  const create = await admin.api.post('/api/admin/accounts', { data: created });
  expect(ok(create), `ROW-127 create: POST /api/admin/accounts answers 2xx (answered ${create.status()})`).toBe(true);
  expect.soft(await canSignIn(created.email, created.password), 'ROW-127 create (after): the created account signs in').toBe(true);

  const m = await signInMember(member);
  try {
    // approve
    const first = await sendRequest(m, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
    expect(await year2027(m), 'ROW-127 approve (before): 25 days left, 2 pending').toEqual({ daysLeft: 25, pending: 2 });
    expect(await awayOn('2027-03-15', member.name), 'ROW-127 approve (before): not away on 15 March').toBe(false);
    const approved = await confirmed('approve', first);
    expect(approved.effect >= 200 && approved.effect < 300 && approved.act >= 200 && approved.act < 300, `ROW-127 approve: effect ${approved.effect}, act ${approved.act}`).toBe(true);
    expect.soft(await year2027(m), 'ROW-127 approve (after): 23 days left, nothing pending').toEqual({ daysLeft: 23, pending: 0 });
    expect.soft(await awayOn('2027-03-15', member.name), 'ROW-127 approve (after): away on 15 March').toBe(true);

    // reject
    const second = await sendRequest(m, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' });
    expect(await year2027(m), 'ROW-127 reject (before): 23 days left, 2 pending').toEqual({ daysLeft: 23, pending: 2 });
    const rejected = await confirmed('reject', second);
    expect(rejected.effect >= 200 && rejected.effect < 300 && rejected.act >= 200 && rejected.act < 300, `ROW-127 reject: effect ${rejected.effect}, act ${rejected.act}`).toBe(true);
    expect.soft(await year2027(m), 'ROW-127 reject (after): still 23 days left, nothing pending').toEqual({ daysLeft: 23, pending: 0 });
    expect.soft(await awayOn('2027-03-22', member.name), 'ROW-127 reject (after): not away on 22 March').toBe(false);

    // cancel approved
    const cancelled = await confirmed('cancel', first);
    expect(cancelled.effect >= 200 && cancelled.effect < 300 && cancelled.act >= 200 && cancelled.act < 300, `ROW-127 cancel: effect ${cancelled.effect}, act ${cancelled.act}`).toBe(true);
    expect.soft(await year2027(m), 'ROW-127 cancel (after): the 2 days are returned, 25 days left').toEqual({ daysLeft: 25, pending: 0 });
    expect.soft(await awayOn('2027-03-15', member.name), 'ROW-127 cancel (after): no longer away on 15 March').toBe(false);

    // set allowance
    const allowanceRoute = `/api/admin/accounts/${encodeURIComponent(String(member.id))}/allowance`;
    const allowance = await admin.api.post(allowanceRoute, { data: { allowance: 30, startsNextYear: false } });
    expect(ok(allowance), `ROW-127 set allowance: POST ${allowanceRoute} answers 2xx (answered ${allowance.status()})`).toBe(true);
    expect.soft(await year2027(m), 'ROW-127 set allowance (after): 30 days left in 2027 at once').toEqual({ daysLeft: 30, pending: 0 });

    // rename
    const newName = freshName('Renamed');
    expect((await (await m.api.get('/api/me')).json()).name, 'ROW-127 rename (before): the member has its first name').toBe(member.name);
    const nameRoute = `/api/admin/accounts/${encodeURIComponent(String(member.id))}/name`;
    const renamed = await admin.api.post(nameRoute, { data: { name: newName } });
    expect(ok(renamed), `ROW-127 rename: POST ${nameRoute} answers 2xx (answered ${renamed.status()})`).toBe(true);
    expect.soft((await (await m.api.get('/api/me')).json()).name, 'ROW-127 rename (after): the member\'s own answer carries the new name').toBe(newName);
  } finally {
    await m.dispose();
  }

  // set another's password
  const newPassword = freshPassword();
  expect(await canSignIn(member.email, member.password), 'ROW-127 set password (before): the member\'s password signs in').toBe(true);
  const passwordRoute = `/api/admin/accounts/${encodeURIComponent(String(member.id))}/password`;
  const set = await admin.api.post(passwordRoute, { data: { password: newPassword } });
  expect(ok(set), `ROW-127 set password: POST ${passwordRoute} answers 2xx (answered ${set.status()})`).toBe(true);
  expect.soft(await canSignIn(member.email, member.password), 'ROW-127 set password (after): the old password no longer signs in').toBe(false);
  expect.soft(await canSignIn(member.email, newPassword), 'ROW-127 set password (after): the new password signs in').toBe(true);

  // switch off
  const off = await confirmed('switch-off', member.id);
  expect(off.effect >= 200 && off.effect < 300 && off.act >= 200 && off.act < 300, `ROW-127 switch off: effect ${off.effect}, act ${off.act}`).toBe(true);
  expect.soft(await canSignIn(member.email, newPassword), 'ROW-127 switch off (after): the account cannot sign in').toBe(false);

  // switch on
  const switchRoute = `/api/admin/accounts/${encodeURIComponent(String(member.id))}/switch`;
  const on = await admin.api.post(switchRoute, { data: { on: true } });
  expect(ok(on), `ROW-127 switch on: POST ${switchRoute} {on:true} answers 2xx (answered ${on.status()})`).toBe(true);
  expect.soft(await canSignIn(member.email, newPassword), 'ROW-127 switch on (after): the account signs in again').toBe(true);
});
