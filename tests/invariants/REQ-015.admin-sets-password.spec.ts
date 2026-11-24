// Purpose: ledger tests for ROW-072, ROW-075 and ROW-077 (REQ-015) — the admin sets a new password for another account; nobody but the admin sets another person's password; the admin never sets their own without giving the current one.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts), fresh per run.
//
// Boundary (R6): password rules, proved at the HTTP harness. The admin's set is D-029's
// POST /api/admin/accounts/:id/password, body {password} as harness.ts reads it (setPassword); a person's own
// change is POST /api/me/password {current,next}. The set under test is posted raw, so its refusal is the row's
// failure, never a SETUP one. "Which password signs in" is judged by a session: sign-in then GET /api/me.
// D-026: wrong attempts per email are kept under 5 within any 15 minutes, and the clock is moved 16 minutes on
// before the sign-in checks that follow a run of wrong attempts, so a wait never stands in for a refusal.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  fresh,
  freshPassword,
  resetProduct,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Credentials,
  type Install,
  type Me,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const T_MAR08_PLUS16 = '2027-03-07T20:16:00Z';

const actors: Actor[] = [];
async function track(p: Promise<Actor>): Promise<Actor> {
  const a = await p;
  actors.push(a);
  return a;
}
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

async function start(): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return { install, admin: await track(signIn(install.admin)) };
}

function setRoute(id: AccountId): string {
  return `/api/admin/accounts/${encodeURIComponent(String(id))}/password`;
}

/** The account a password signs in as, or null when it does not sign in. */
async function signsInAs(c: Credentials): Promise<Me | null> {
  const api = await anonymousApi();
  try {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const me = await api.get('/api/me');
    if (!r.ok() || me.status() !== 200) return null;
    return ((await me.json().catch(() => null)) as Me | null) ?? null;
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-072 promise: REQ-015 fail-if (1) "the admin cannot set a new password for an account"; A-008: the admin sets
// ROW-072   a new password for a person.
// ROW-072 wrong product: an admin set that demands the target's current password (which the admin does not have),
// ROW-072   or that stores the new password on the admin's own account or on the wrong id.
// ROW-072 given: members M and N with their own passwords; a fresh password X that signs in no one. when: the admin
// ROW-072   posts X to M's password route. then: 2xx; X signs in as M (GET /api/me answers M's id); N still signs in with
// ROW-072   N's password and X does not sign in as N.
// ROW-072 controls: the control case shows M signs in with its own password before, and X does not (before/after).
// ROW-072 technique: before/after on a fresh value, with the neighbouring account that must stay untouched.
// ROW-072 cases: ROW-072 target=ROW-072.REQ-015.the-admin-sets-a-new-password-that-signs-the-account-in control=ROW-072.control.before-the-set-the-own-password-signs-in-and-the-new-one-does-not
test('ROW-072.control.before-the-set-the-own-password-signs-in-and-the-new-one-does-not', async () => {
  const { admin } = await start();
  const m = await createMember(admin);
  expect(String((await signsInAs(m))?.id), 'ROW-072 control: M signs in with its own password').toBe(String(m.id));
  expect(await signsInAs({ email: m.email, password: freshPassword() }), 'ROW-072 control: a fresh password does not sign M in').toBeNull();
});

test('ROW-072.REQ-015.the-admin-sets-a-new-password-that-signs-the-account-in', async () => {
  const { admin } = await start();
  const m = await createMember(admin);
  const n = await createMember(admin);
  const x = freshPassword();
  expect(await signsInAs({ email: m.email, password: x }), 'ROW-072 before: X does not sign M in').toBeNull();

  const res = await admin.api.post(setRoute(m.id), { data: { password: x } });
  expect.soft(res.ok(), `ROW-072: the admin's set is accepted (answered ${res.status()})`).toBe(true);

  expect.soft(String((await signsInAs({ email: m.email, password: x }))?.id), 'ROW-072: X now signs in as M').toBe(String(m.id));
  expect.soft(String((await signsInAs(n))?.id), 'ROW-072: N still signs in with its own password').toBe(String(n.id));
  expect.soft(await signsInAs({ email: n.email, password: x }), 'ROW-072: X does not sign N in').toBeNull();
});

// ---------------------------------------------------------------------------------------------------
// ROW-075 promise: REQ-015 fail-if (4) "anyone but the admin sets another person's password".
// ROW-075 wrong product: an admin password route guarded only by "signed in"; or an own-change route that reads the
// ROW-075   target from the body (id, accountId or email) instead of from the session.
// ROW-075 given: members M1 (signed in) and M2, the admin, an anonymous caller; fresh passwords X and Y. when: M1
// ROW-075   posts X to M2's and to the admin's password route; the anonymous caller posts X to M2's; M1 posts its own
// ROW-075   change {current: M1's password, next: Y} carrying M2's id, accountId and email. then: the three set routes
// ROW-075   answer 401 or 403; X and Y sign in as neither M2 nor the admin; M2's and the admin's own passwords still
// ROW-075   sign them in.
// ROW-075 controls: the control case shows the admin posting the same body to M2's route sets it (Z signs M2 in).
// ROW-075 technique: the same body from each actor kind; the body-borne target as the near miss.
// ROW-075 cases: ROW-075 target=ROW-075.REQ-015.no-one-but-the-admin-sets-another-persons-password control=ROW-075.control.the-admin-sets-it-with-the-same-body
test('ROW-075.control.the-admin-sets-it-with-the-same-body', async () => {
  const { admin } = await start();
  const m2 = await createMember(admin);
  const z = freshPassword();
  const res = await admin.api.post(setRoute(m2.id), { data: { password: z } });
  expect(res.ok(), `ROW-075 control: the admin's set is accepted (answered ${res.status()})`).toBe(true);
  expect(String((await signsInAs({ email: m2.email, password: z }))?.id), 'ROW-075 control: Z signs M2 in').toBe(String(m2.id));
});

test('ROW-075.REQ-015.no-one-but-the-admin-sets-another-persons-password', async () => {
  const { install, admin } = await start();
  const m1 = await createMember(admin);
  const m2 = await createMember(admin);
  const m1Actor = await track(signInMember(m1));
  const anon = await anonymousApi();
  const x = freshPassword();
  const y = freshPassword();
  try {
    const byMemberOnOther = await m1Actor.api.post(setRoute(m2.id), { data: { password: x } });
    expect.soft([401, 403], `ROW-075: a member setting another member's password is refused (answered ${byMemberOnOther.status()})`).toContain(byMemberOnOther.status());
    const byMemberOnAdmin = await m1Actor.api.post(setRoute(admin.me.id), { data: { password: x } });
    expect.soft([401, 403], `ROW-075: a member setting the admin's password is refused (answered ${byMemberOnAdmin.status()})`).toContain(byMemberOnAdmin.status());
    const byAnon = await anon.post(setRoute(m2.id), { data: { password: x } });
    expect.soft([401, 403], `ROW-075: an anonymous set is refused (answered ${byAnon.status()})`).toContain(byAnon.status());
    await m1Actor.api.post('/api/me/password', {
      data: { current: m1.password, next: y, id: m2.id, accountId: m2.id, email: m2.email },
    });
  } finally {
    await anon.dispose();
  }

  await setClock(T_MAR08_PLUS16);
  expect.soft(await signsInAs({ email: m2.email, password: x }), 'ROW-075: X does not sign M2 in').toBeNull();
  expect.soft(await signsInAs({ email: m2.email, password: y }), 'ROW-075: Y does not sign M2 in').toBeNull();
  expect.soft(String((await signsInAs(m2))?.id), 'ROW-075: M2 still signs in with its own password').toBe(String(m2.id));
  expect.soft(await signsInAs({ email: install.admin.email, password: x }), 'ROW-075: X does not sign the admin in').toBeNull();
  expect.soft(String((await signsInAs(install.admin))?.id), 'ROW-075: the admin still signs in with its own password').toBe(String(admin.me.id));
});

// ---------------------------------------------------------------------------------------------------
// ROW-077 promise: REQ-015 fail-if (6) "the admin sets their own password without giving the current one";
// ROW-077   REQ-015 "every person, the admin included, changes their own password after giving their current one".
// ROW-077 wrong product: an admin password route that excludes nobody (the admin posts to their own id and skips the
// ROW-077   current-password check), or an own-change route that waives the current password for the admin.
// ROW-077 given: the admin signed in; a fresh password X. when: the admin posts X to its own id's admin password
// ROW-077   route, and posts own changes with no current, with an empty current and with a wrong current. then: each is
// ROW-077   answered 4xx; after 16 minutes X does not sign the admin in and the admin's own password does; the admin's
// ROW-077   session still works.
// ROW-077 controls: the control case shows the admin's own change with the right current password is accepted and
// ROW-077   its new password signs in — the route exists and the refusal is about the missing current.
// ROW-077 technique: each door to the same harm (the admin's set route on self, the own-change route), with near
// ROW-077   misses of the current password.
// ROW-077 cases: ROW-077 target=ROW-077.REQ-015.the-admin-cannot-set-their-own-password-without-the-current-one control=ROW-077.control.the-admin-changes-their-own-password-with-the-current-one
test('ROW-077.control.the-admin-changes-their-own-password-with-the-current-one', async () => {
  const { install, admin } = await start();
  const next = freshPassword();
  const res = await admin.api.post('/api/me/password', { data: { current: install.admin.password, next } });
  expect(res.ok(), `ROW-077 control: the change with the current password is accepted (answered ${res.status()})`).toBe(true);
  expect(String((await signsInAs({ email: install.admin.email, password: next }))?.id), 'ROW-077 control: the new password signs the admin in').toBe(
    String(admin.me.id),
  );
});

test('ROW-077.REQ-015.the-admin-cannot-set-their-own-password-without-the-current-one', async () => {
  const { install, admin } = await start();
  const x = freshPassword();
  const attempts: [string, () => Promise<number>][] = [
    ['the admin password route on the admin\'s own id', async () => (await admin.api.post(setRoute(admin.me.id), { data: { password: x } })).status()],
    ['an own change with no current', async () => (await admin.api.post('/api/me/password', { data: { next: x } })).status()],
    ['an own change with an empty current', async () => (await admin.api.post('/api/me/password', { data: { current: '', next: x } })).status()],
    ['an own change with a wrong current', async () => (await admin.api.post('/api/me/password', { data: { current: fresh('wrong'), next: x } })).status()],
  ];
  for (const [label, run] of attempts) {
    const status = await run();
    expect.soft(status >= 400 && status < 500, `ROW-077 ${label}: refused with a 4xx (answered ${status})`).toBe(true);
  }

  await setClock(T_MAR08_PLUS16);
  expect.soft(await signsInAs({ email: install.admin.email, password: x }), 'ROW-077: X does not sign the admin in').toBeNull();
  expect.soft(String((await signsInAs(install.admin))?.id), 'ROW-077: the admin\'s own password still signs in').toBe(String(admin.me.id));
  expect.soft((await admin.api.get('/api/me')).status(), 'ROW-077: the admin\'s session still works').toBe(200);
});
