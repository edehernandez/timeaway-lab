// Purpose: ledger tests for ROW-073, ROW-074 and ROW-076 (REQ-015) — a person's own change needs their correct current password; the old password stops signing in after any change; a change or a set ends every session but the changer's.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts), fresh per run.
//
// Boundary (R6): password and session rules, proved at the HTTP harness: the own change is D-029's
// POST /api/me/password {current,next}; the admin's set is POST /api/admin/accounts/:id/password {password} as
// harness.ts reads it. The change under test is posted raw. "Which password signs in" is judged by a session:
// sign-in then GET /api/me on the same jar.
// D-026: wrong attempts per email stay under 5 within any 15 minutes, or the clock is moved 16 minutes on (then 32)
// between runs of wrong attempts and the checks after them, so a wait never stands in for a refusal.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
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
  type Member,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const T_MAR08_PLUS16 = '2027-03-07T20:16:00Z';
const T_MAR08_PLUS48 = '2027-03-07T20:48:00Z';
const WRITE = { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' };

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

function flipCase(s: string): string {
  return [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
}

// ---------------------------------------------------------------------------------------------------
// ROW-073 promise: REQ-015 fail-if (2) "a person's own password is changed through their session by a change that
// ROW-073   does not carry their correct current password".
// ROW-073 wrong product: an own change that skips the check when `current` is absent or empty, compares it
// ROW-073   case-insensitively, or accepts any account's password as "a correct password".
// ROW-073 given: members M (signed in as S) and N; four fresh next passwords. when: S posts own changes with
// ROW-073   current missing, empty, M's password with its letter case flipped, and N's password. then: each is answered
// ROW-073   4xx; 16 minutes later none of the four next passwords signs M in; 32 minutes after that M's own password
// ROW-073   still does.
// ROW-073 controls: the control case shows S's change with M's correct current password is accepted and its next
// ROW-073   password signs M in — the route works and only the current password differs.
// ROW-073 technique: near misses of the correct current password; the observed effect is which password signs in.
// ROW-073 cases: ROW-073 target=ROW-073.REQ-015.an-own-change-without-the-correct-current-password-is-refused control=ROW-073.control.an-own-change-with-the-correct-current-password-is-accepted
test('ROW-073.control.an-own-change-with-the-correct-current-password-is-accepted', async () => {
  const { admin } = await start();
  const m = await createMember(admin);
  const s = await track(signInMember(m));
  const next = freshPassword();
  const res = await s.api.post('/api/me/password', { data: { current: m.password, next } });
  expect(res.ok(), `ROW-073 control: the change is accepted (answered ${res.status()})`).toBe(true);
  expect(String((await signsInAs({ email: m.email, password: next }))?.id), 'ROW-073 control: the next password signs M in').toBe(String(m.id));
});

test('ROW-073.REQ-015.an-own-change-without-the-correct-current-password-is-refused', async () => {
  const { admin } = await start();
  const m = await createMember(admin);
  const n = await createMember(admin);
  const s = await track(signInMember(m));
  expect(flipCase(m.password), 'ROW-073 setup: the flipped password differs').not.toBe(m.password);
  const attempts: [string, Record<string, unknown>][] = [
    ['current missing', {}],
    ['current empty', { current: '' }],
    ['current with its case flipped', { current: flipCase(m.password) }],
    ["another account's password as current", { current: n.password }],
  ];
  const nexts: string[] = [];
  for (const [label, body] of attempts) {
    const next = freshPassword();
    nexts.push(next);
    const res = await s.api.post('/api/me/password', { data: { ...body, next } });
    expect.soft(res.status() >= 400 && res.status() < 500, `ROW-073 ${label}: refused with a 4xx (answered ${res.status()})`).toBe(true);
  }

  await setClock(T_MAR08_PLUS16);
  for (const next of nexts) expect.soft(await signsInAs({ email: m.email, password: next }), 'ROW-073: a refused next password does not sign M in').toBeNull();
  await setClock(T_MAR08_PLUS48);
  expect.soft(String((await signsInAs(m))?.id), 'ROW-073: M\'s own password still signs M in').toBe(String(m.id));
});

// ---------------------------------------------------------------------------------------------------
// ROW-074 promise: REQ-015 fail-if (3) "the old password still signs in after a change"; REQ-015 "after either
// ROW-074   change the old password no longer signs in" — the own change (a member's and the admin's) and the admin's set.
// ROW-074 wrong product: a change that adds the new password beside the old one (a second hash, a "temporary"
// ROW-074   password from the admin's set that leaves the old one valid), or that updates a different record than the
// ROW-074   one sign-in reads.
// ROW-074 given: member M (signed in as S), member M2, the admin. when: S changes M's password with its current one;
// ROW-074   the admin sets M2's password; the admin changes its own with its current one. then: each old password no
// ROW-074   longer signs its account in, and each new one does.
// ROW-074 controls: the control case shows, before any change, each old password signs in and each new one does not.
// ROW-074 technique: before/after on the same credentials, over the three kinds of change.
// ROW-074 cases: ROW-074 target=ROW-074.REQ-015.the-old-password-no-longer-signs-in-after-a-change control=ROW-074.control.before-a-change-the-old-password-signs-in
test('ROW-074.control.before-a-change-the-old-password-signs-in', async () => {
  const { install, admin } = await start();
  const m = await createMember(admin);
  expect(String((await signsInAs(m))?.id), 'ROW-074 control: M\'s password signs in').toBe(String(m.id));
  expect(String((await signsInAs(install.admin))?.id), 'ROW-074 control: the admin\'s password signs in').toBe(String(admin.me.id));
  expect(await signsInAs({ email: m.email, password: freshPassword() }), 'ROW-074 control: a fresh password does not').toBeNull();
});

test('ROW-074.REQ-015.the-old-password-no-longer-signs-in-after-a-change', async () => {
  const { install, admin } = await start();
  const m = await createMember(admin);
  const m2 = await createMember(admin);
  const s = await track(signInMember(m));

  const mNext = freshPassword();
  expect((await s.api.post('/api/me/password', { data: { current: m.password, next: mNext } })).ok(), 'ROW-074: M\'s own change is accepted').toBe(true);
  const m2Set = freshPassword();
  expect((await admin.api.post(setRoute(m2.id), { data: { password: m2Set } })).ok(), 'ROW-074: the admin\'s set on M2 is accepted').toBe(true);
  const adminNext = freshPassword();
  expect(
    (await admin.api.post('/api/me/password', { data: { current: install.admin.password, next: adminNext } })).ok(),
    'ROW-074: the admin\'s own change is accepted',
  ).toBe(true);

  expect.soft(await signsInAs(m), 'ROW-074: M\'s old password no longer signs in (own change)').toBeNull();
  expect.soft(String((await signsInAs({ email: m.email, password: mNext }))?.id), 'ROW-074: M\'s new password signs in').toBe(String(m.id));
  expect.soft(await signsInAs(m2), 'ROW-074: M2\'s old password no longer signs in (admin set)').toBeNull();
  expect.soft(String((await signsInAs({ email: m2.email, password: m2Set }))?.id), 'ROW-074: M2\'s set password signs in').toBe(String(m2.id));
  expect.soft(await signsInAs(install.admin), 'ROW-074: the admin\'s old password no longer signs in').toBeNull();
  expect
    .soft(String((await signsInAs({ email: install.admin.email, password: adminNext }))?.id), 'ROW-074: the admin\'s new password signs in')
    .toBe(String(admin.me.id));
});

// ---------------------------------------------------------------------------------------------------
// ROW-076 promise: REQ-015 fail-if (5) "a session other than the changer's keeps working after a password set or
// ROW-076   change"; A-034. The row's cases: a person's own change ends their other sessions but not the current one;
// ROW-076   an admin set ends every session of the target account.
// ROW-076 wrong product: a change that ends no sessions (the password alone changes); one that ends every session
// ROW-076   of the account including the changer's current one; one that, on the admin's set, ends the admin's sessions
// ROW-076   instead of the target's.
// ROW-076 given: member M signed in twice (S1, S2); member T signed in twice (T1, T2); member N signed in (the
// ROW-076   neighbour). when: S1 changes M's password with its current one; the admin sets T's password. then: S1 still
// ROW-076   reads GET /api/me and GET /api/calendar (200); S2 is refused (401/403) on GET /api/me and on a write; T1 and T2
// ROW-076   are refused on GET /api/me and T1 on a write; the admin's and N's sessions still answer 200; no refused write
// ROW-076   landed (the admin's pending list has no request of M or T).
// ROW-076 controls: the control case shows, before any change, S2 and T1 answer 200 and the write is accepted on a
// ROW-076   live session (N's) — the sessions work and the write would land.
// ROW-076 technique: the neighbouring sessions that must stay alive (the changer's, the admin's, N's) beside the ones
// ROW-076   that must end, so neither "end none" nor "end all" passes.
// ROW-076 cases: ROW-076 target=ROW-076.REQ-015.a-change-or-set-ends-every-other-session-of-the-account control=ROW-076.control.before-the-change-every-session-works
async function sessions(admin: Actor): Promise<{ m: Member; s1: Actor; s2: Actor; t: Member; t1: Actor; t2: Actor; n: Actor }> {
  const m = await createMember(admin);
  const t = await createMember(admin);
  const n = await createMember(admin);
  return {
    m,
    s1: await track(signInMember(m)),
    s2: await track(signInMember(m)),
    t,
    t1: await track(signInMember(t)),
    t2: await track(signInMember(t)),
    n: await track(signInMember(n)),
  };
}

test('ROW-076.control.before-the-change-every-session-works', async () => {
  const { admin } = await start();
  const w = await sessions(admin);
  expect((await w.s2.api.get('/api/me')).status(), 'ROW-076 control: S2 works').toBe(200);
  expect((await w.t1.api.get('/api/me')).status(), 'ROW-076 control: T1 works').toBe(200);
  expect((await w.n.api.post('/api/requests', { data: WRITE })).status(), 'ROW-076 control: the write is accepted on a live session').toBe(201);
});

test('ROW-076.REQ-015.a-change-or-set-ends-every-other-session-of-the-account', async () => {
  const { admin } = await start();
  const w = await sessions(admin);
  const refused = (s: number) => s === 401 || s === 403;

  const own = await w.s1.api.post('/api/me/password', { data: { current: w.m.password, next: freshPassword() } });
  expect(own.ok(), `ROW-076: M's own change is accepted (answered ${own.status()})`).toBe(true);
  const set = await admin.api.post(setRoute(w.t.id), { data: { password: freshPassword() } });
  expect(set.ok(), `ROW-076: the admin's set on T is accepted (answered ${set.status()})`).toBe(true);

  expect.soft((await w.s1.api.get('/api/me')).status(), 'ROW-076: the changer\'s current session still works').toBe(200);
  expect.soft((await w.s1.api.get('/api/calendar?year=2027&month=3')).status(), 'ROW-076: the changer\'s session still reads').toBe(200);
  const s2Me = (await w.s2.api.get('/api/me')).status();
  expect.soft(refused(s2Me), `ROW-076: M's other session is ended (answered ${s2Me})`).toBe(true);
  const s2Write = (await w.s2.api.post('/api/requests', { data: WRITE })).status();
  expect.soft(refused(s2Write), `ROW-076: M's other session cannot write (answered ${s2Write})`).toBe(true);
  const t1Me = (await w.t1.api.get('/api/me')).status();
  const t2Me = (await w.t2.api.get('/api/me')).status();
  expect.soft(refused(t1Me), `ROW-076: T's first session is ended by the admin's set (answered ${t1Me})`).toBe(true);
  expect.soft(refused(t2Me), `ROW-076: T's second session is ended by the admin's set (answered ${t2Me})`).toBe(true);
  const t1Write = (await w.t1.api.post('/api/requests', { data: WRITE })).status();
  expect.soft(refused(t1Write), `ROW-076: T's ended session cannot write (answered ${t1Write})`).toBe(true);
  expect.soft((await admin.api.get('/api/me')).status(), 'ROW-076: the admin\'s session (the setter\'s) still works').toBe(200);
  expect.soft((await w.n.api.get('/api/me')).status(), 'ROW-076: an untouched member\'s session still works').toBe(200);

  const pending = await admin.api.get('/api/admin/pending');
  expect(pending.status(), 'ROW-076: GET /api/admin/pending answers the admin').toBe(200);
  const text = await pending.text();
  expect.soft(text.includes(w.m.name), 'ROW-076: no write of M\'s ended session landed').toBe(false);
  expect.soft(text.includes(w.t.name), 'ROW-076: no write of T\'s ended session landed').toBe(false);
});
