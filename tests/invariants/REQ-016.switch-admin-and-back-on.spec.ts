// Purpose: ledger tests for ROW-078, ROW-082 and ROW-083 (REQ-016) — the admin's own account can never be switched off; switching an account back on restores sign-in and brings back no cancelled request or day.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions, switch), fresh per run.
//
// Boundary (R6): account-switch rules, proved at the HTTP harness. The switch-off is D-029's two confirmed steps
// (harness.ts confirmedActionRoutes), posted raw where it is the act under test; switching on is
// POST /api/admin/accounts/:id/switch {on:true}. Observations: sign-in then GET /api/me on the same jar; the
// member's GET /api/balance; the calendar by fresh name; the admin's pending list by fresh name; whether a request
// can still be approved.
// Time: requests are sent at Wed 2027-03-03; today is then Mon 2027-03-08 in Pacific/Auckland, at an instant where
// UTC is still Sunday. The machine's clock is never read.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  approve,
  confirmedActionRoutes,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  readBalance,
  readEffect,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Credentials,
  type Install,
  type Me,
  type Member,
} from './harness';

const T_MAR03 = '2027-03-02T20:00:00Z'; // Wed 2027-03-03 09:00 NZDT
const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 NZDT; UTC still Sunday 03-07

const actors: Actor[] = [];
async function track(p: Promise<Actor>): Promise<Actor> {
  const a = await p;
  actors.push(a);
  return a;
}
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

async function start(now: string): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({ now, timeZone: DEFAULT_TIME_ZONE });
  return { install, admin: await track(signIn(install.admin)) };
}

/** The switch-off's two steps, raw: accepted only when both answer 2xx. */
async function attemptSwitchOff(admin: Actor, id: AccountId): Promise<{ ok: boolean; status: number; step: string }> {
  const { effect, act } = confirmedActionRoutes('switch-off', id);
  const e = await admin.api.get(effect);
  if (!e.ok()) return { ok: false, status: e.status(), step: `GET ${effect}` };
  const token = ((await e.json().catch(() => null)) as { token?: unknown } | null)?.token;
  const r = await admin.api.post(act, { data: { on: false, token: typeof token === 'string' ? token : '' } });
  return { ok: r.ok(), status: r.status(), step: `POST ${act}` };
}

/** An approve's two steps, raw: true when the request was approved. */
async function attemptApprove(admin: Actor, requestId: AccountId): Promise<boolean> {
  const { effect, act } = confirmedActionRoutes('approve', requestId);
  const e = await admin.api.get(effect);
  if (!e.ok()) return false;
  const token = ((await e.json().catch(() => null)) as { token?: unknown } | null)?.token;
  return (await admin.api.post(act, { data: { token: typeof token === 'string' ? token : '' } })).ok();
}

/** The account a password signs in as, and whether that session reads the calendar; null when it does not sign in. */
async function signsInAs(c: Credentials): Promise<{ me: Me; calendar: number } | null> {
  const api = await anonymousApi();
  try {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const meRes = await api.get('/api/me');
    if (!r.ok() || meRes.status() !== 200) return null;
    const me = (await meRes.json().catch(() => null)) as Me | null;
    if (!me) return null;
    return { me, calendar: (await api.get('/api/calendar?year=2027&month=3')).status() };
  } finally {
    await api.dispose();
  }
}

async function marchDates(viewer: Actor, name: string, row: string): Promise<string[]> {
  const res = await viewer.api.get('/api/calendar?year=2027&month=3');
  expect(res.status(), `${row}: GET /api/calendar?year=2027&month=3 answers`).toBe(200);
  const body = (await res.json().catch(() => null)) as { days?: { date?: unknown; people?: { name?: unknown }[] }[] } | null;
  return (body?.days ?? [])
    .filter((d) => Array.isArray(d.people) && d.people.some((p) => p?.name === name))
    .map((d) => String(d.date))
    .sort();
}

// ---------------------------------------------------------------------------------------------------
// ROW-078 promise: REQ-016 fail-if (1) "the admin account can be switched off"; A-013: inside the product the admin
// ROW-078   account cannot be switched off.
// ROW-078 wrong product: a switch-off that refuses the admin only on the effect step (the act, posted with a token
// ROW-078   read for another account or none, still switches the admin off), or a people page that merely hides the
// ROW-078   button for the admin while the route accepts it.
// ROW-078 given: the admin signed in; member M. when: the admin runs both steps on its own id; posts the act on its
// ROW-078   own id with no token; and with the switch-off token read for M. then: none is accepted; the admin's session
// ROW-078   still answers GET /api/me as admin; the admin signs in afresh; GET /api/admin/people still answers it.
// ROW-078 controls: the control case runs the same two steps on M: accepted, and M no longer signs in — the path
// ROW-078   works, so the target's refusals are about the admin.
// ROW-078 technique: each door to the same act (both steps, the act alone, a borrowed token).
// ROW-078 cases: ROW-078 target=ROW-078.REQ-016.the-admin-account-cannot-be-switched-off control=ROW-078.control.the-same-steps-switch-a-member-off
test('ROW-078.control.the-same-steps-switch-a-member-off', async () => {
  const { admin } = await start(T_MAR08);
  const m = await createMember(admin);
  const r = await attemptSwitchOff(admin, m.id);
  expect(r.ok, `ROW-078 control: the member's switch-off is accepted (${r.step} answered ${r.status})`).toBe(true);
  expect(await signsInAs(m), 'ROW-078 control: the member no longer signs in').toBeNull();
});

test('ROW-078.REQ-016.the-admin-account-cannot-be-switched-off', async () => {
  const { install, admin } = await start(T_MAR08);
  const m = await createMember(admin);
  const own = await attemptSwitchOff(admin, admin.me.id);
  expect.soft(own.ok, `ROW-078: both steps on the admin's own id are refused (${own.step} answered ${own.status})`).toBe(false);

  const { act } = confirmedActionRoutes('switch-off', admin.me.id);
  const noToken = await admin.api.post(act, { data: { on: false } });
  expect.soft(noToken.ok(), `ROW-078: the act on the admin with no token is refused (answered ${noToken.status()})`).toBe(false);
  const borrowed = await readEffect(admin, 'switch-off', m.id);
  const withBorrowed = await admin.api.post(act, { data: { on: false, token: borrowed.token } });
  expect.soft(withBorrowed.ok(), `ROW-078: the act on the admin with another account's token is refused (answered ${withBorrowed.status()})`).toBe(false);

  const meRes = await admin.api.get('/api/me');
  expect.soft(meRes.status(), 'ROW-078: the admin\'s session still works').toBe(200);
  if (meRes.status() === 200) expect.soft(((await meRes.json()) as Me).isAdmin, 'ROW-078: still the admin').toBe(true);
  expect.soft(String((await signsInAs(install.admin))?.me.id), 'ROW-078: the admin signs in afresh').toBe(String(admin.me.id));
  expect.soft((await admin.api.get('/api/admin/people')).status(), 'ROW-078: the admin still reaches the people list').toBe(200);
});

// ---------------------------------------------------------------------------------------------------
// ROW-082 promise: REQ-016 fail-if (5) "switching back on brings back a cancelled request or day"; A-022 with REQ-016:
// ROW-082   switching back on restores sign-in and restores no cancelled request.
// ROW-082 wrong product: a switch-off stored as a flag that the calendar, the balance and the pending list read
// ROW-082   (so switching on "uncancels" everything), or a switch-on that replays an undo log of the switch-off.
// ROW-082 given: Leaver (allowance 25) with an approved vacation Thu 03-04..Fri 03-12 (7 weekdays) and a pending
// ROW-082   vacation Mon 03-15..Wed 03-17 (3), sent at 03-03; today Mon 03-08; Leaver switched off (only 03-04, 03-05
// ROW-082   left on the calendar). when: the admin switches Leaver back on. then: Leaver's 2027 days left are 23 and
// ROW-082   pending 0; the calendar shows Leaver on exactly 03-04, 03-05; the pending list does not name Leaver; the
// ROW-082   pending request cannot be approved.
// ROW-082 controls: the control case shows, before the switch-off, days left 18 and pending 3 and all seven days on
// ROW-082   the calendar — so 23, 0 and two days are the cancel's doing, and their survival is the switch-on's test.
// ROW-082   In the target the post-switch-off calendar (two days) is checked before switching on.
// ROW-082 technique: before/after across off and on, with hand-computed balances (25 − 7, 25 − 2), never the product's.
// ROW-082 cases: ROW-082 target=ROW-082.REQ-016.switching-back-on-brings-back-no-cancelled-request-or-day control=ROW-082.control.before-the-switch-off-the-days-count-and-show
async function leaverWithRequests(): Promise<{ admin: Actor; leaver: Member; leaverActor: Actor; pendingId: AccountId }> {
  const { admin } = await start(T_MAR03);
  const leaver = await createMember(admin, { name: freshName('Leaver'), allowance: 25 });
  const leaverActor = await track(signInMember(leaver));
  await approve(admin, await sendRequest(leaverActor, { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-12' }));
  const pendingId = await sendRequest(leaverActor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
  await setClock(T_MAR08);
  return { admin, leaver, leaverActor, pendingId };
}

const ALL_APPROVED = ['2027-03-04', '2027-03-05', '2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'];

test('ROW-082.control.before-the-switch-off-the-days-count-and-show', async () => {
  const { admin, leaver, leaverActor } = await leaverWithRequests();
  const y = (await readBalance(leaverActor)).years.find((x) => x.year === 2027);
  expect(y?.daysLeft, 'ROW-082 control: days left are 25 - 7').toBe(18);
  expect(y?.pending, 'ROW-082 control: 3 days pending').toBe(3);
  expect(await marchDates(admin, leaver.name, 'ROW-082 control'), 'ROW-082 control: every approved day shows').toEqual(ALL_APPROVED);
});

test('ROW-082.REQ-016.switching-back-on-brings-back-no-cancelled-request-or-day', async () => {
  const { admin, leaver, pendingId } = await leaverWithRequests();
  await switchAccount(admin, leaver.id, false);
  expect(await marchDates(admin, leaver.name, 'ROW-082 switched off'), 'ROW-082 switched off: only the days before today show').toEqual([
    '2027-03-04',
    '2027-03-05',
  ]);

  await switchAccount(admin, leaver.id, true);

  const back = await track(signInMember(leaver));
  const y = (await readBalance(back)).years.find((x) => x.year === 2027);
  expect.soft(y?.daysLeft, 'ROW-082: the cancelled approved days are not counted again (25 - 2)').toBe(23);
  expect.soft(y?.pending, 'ROW-082: the cancelled pending request is not pending again').toBe(0);
  expect.soft(await marchDates(admin, leaver.name, 'ROW-082'), 'ROW-082: the cancelled days are not back on the calendar').toEqual([
    '2027-03-04',
    '2027-03-05',
  ]);
  const pending = await admin.api.get('/api/admin/pending');
  expect(pending.status(), 'ROW-082: GET /api/admin/pending answers the admin').toBe(200);
  expect.soft((await pending.text()).includes(leaver.name), 'ROW-082: the pending list does not name Leaver').toBe(false);
  expect.soft(await attemptApprove(admin, pendingId), 'ROW-082: the cancelled request cannot be approved').toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-083 promise: REQ-016 fail-if (6) "an account switched back on, where the limit on switched-on accounts allowed
// ROW-083   it, cannot sign in"; A-008: the admin can switch the account back on.
// ROW-083 wrong product: a switch-on that flips the flag the people page reads but not the one sign-in reads, or a
// ROW-083   switch-off that also wipes the password so the account stays locked out.
// ROW-083 given: member M (a 3-account team, far under the limit of 30), switched off, unable to sign in. when: the
// ROW-083   admin posts the switch on. then: 2xx; M's own password signs M in (GET /api/me answers M's id) and that
// ROW-083   session reads the calendar (200).
// ROW-083 controls: the control case shows M signs in before the switch-off and not after — the switch-off took
// ROW-083   effect, so the target's sign-in is the switch-on's doing.
// ROW-083 technique: before/after across off and on with the same credentials.
// ROW-083 cases: ROW-083 target=ROW-083.REQ-016.an-account-switched-back-on-signs-in control=ROW-083.control.switched-off-the-account-cannot-sign-in
test('ROW-083.control.switched-off-the-account-cannot-sign-in', async () => {
  const { admin } = await start(T_MAR08);
  const m = await createMember(admin);
  expect(String((await signsInAs(m))?.me.id), 'ROW-083 control: M signs in while on').toBe(String(m.id));
  await switchAccount(admin, m.id, false);
  expect(await signsInAs(m), 'ROW-083 control: M cannot sign in while off').toBeNull();
});

test('ROW-083.REQ-016.an-account-switched-back-on-signs-in', async () => {
  const { admin } = await start(T_MAR08);
  const m = await createMember(admin);
  await createMember(admin);
  await switchAccount(admin, m.id, false);
  expect(await signsInAs(m), 'ROW-083 precondition: M cannot sign in while off').toBeNull();

  const route = `/api/admin/accounts/${encodeURIComponent(String(m.id))}/switch`;
  const on = await admin.api.post(route, { data: { on: true } });
  expect.soft(on.ok(), `ROW-083: the switch on is accepted (answered ${on.status()})`).toBe(true);

  const back = await signsInAs(m);
  expect.soft(String(back?.me.id), 'ROW-083: M signs in with its own password again').toBe(String(m.id));
  expect.soft(back?.calendar, 'ROW-083: the new session reads the calendar').toBe(200);
});
