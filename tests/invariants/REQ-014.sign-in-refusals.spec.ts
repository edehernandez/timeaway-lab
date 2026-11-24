// Purpose: ledger tests for ROW-068 and ROW-069 (REQ-014) — a wrong password does not sign in, and a switched-off account does not sign in.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, accounts, switch), fresh per run.
//
// Boundary (R6): sign-in rules, proved at the HTTP harness on D-029's POST /api/auth/sign-in {email,password}.
// "Signed in" is judged by the session, not by the sign-in's status alone: after each attempt the same cookie jar
// asks GET /api/me, which answers 200 only on a session.
// D-026: 5 wrong attempts within 15 minutes for one email make sign-in answer with a wait; every case here makes at
// most 4 wrong attempts per email, so a wait never stands in for a refusal.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  resetProduct,
  signIn,
  switchAccount,
  type Actor,
  type Credentials,
  type Me,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

let admin: Actor | undefined;
test.afterEach(async () => {
  await admin?.dispose().catch(() => undefined);
  admin = undefined;
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  admin = await signIn(install.admin);
  return admin;
}

/** One sign-in attempt on a fresh cookie jar: the sign-in's status, and what GET /api/me then answers on the same jar. */
async function attempt(c: Credentials): Promise<{ status: number; meStatus: number; me: Me | null }> {
  const api = await anonymousApi();
  try {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const meRes = await api.get('/api/me');
    const me = meRes.status() === 200 ? ((await meRes.json().catch(() => null)) as Me | null) : null;
    return { status: r.status(), meStatus: meRes.status(), me };
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-068 promise: REQ-014 fail-if (2) "a wrong password signs in"; D-014: a password is compared exactly as typed.
// ROW-068 wrong product: a sign-in that compares case-insensitively or trims the password, that accepts an empty
// ROW-068   password, that checks the password against any account's hash, or that sets the session cookie before the
// ROW-068   check and answers 401 afterwards (a session left behind).
// ROW-068 given: members M and N with their own fresh passwords. when: sign-in is posted with M's email and M's
// ROW-068   password plus a trailing space, M's password upper-cased, an empty password, N's password; and with N's
// ROW-068   email and M's password. then: each sign-in answers non-2xx and GET /api/me on the same jar is not 200.
// ROW-068 controls: the control case signs M in with M's own password: 2xx and GET /api/me answers M's id.
// ROW-068 technique: near misses of the right password (one space, case) and the right password on the wrong
// ROW-068   account; the session, not the status, is the observed effect.
// ROW-068 cases: ROW-068 target=ROW-068.REQ-014.a-wrong-password-does-not-sign-in control=ROW-068.control.the-right-password-signs-in
test('ROW-068.control.the-right-password-signs-in', async () => {
  const a = await start();
  const m = await createMember(a);
  const r = await attempt({ email: m.email, password: m.password });
  expect(r.status, 'ROW-068 control: the right password is accepted').toBeLessThan(300);
  expect(r.meStatus, 'ROW-068 control: a session exists').toBe(200);
  expect(String(r.me?.id), 'ROW-068 control: the session is M\'s').toBe(String(m.id));
});

test('ROW-068.REQ-014.a-wrong-password-does-not-sign-in', async () => {
  const a = await start();
  const m = await createMember(a);
  const n = await createMember(a);
  expect(m.password.toUpperCase(), 'ROW-068 setup: the upper-cased password differs').not.toBe(m.password);
  const wrongs: [string, Credentials][] = [
    ['trailing space', { email: m.email, password: `${m.password} ` }],
    ['upper-cased', { email: m.email, password: m.password.toUpperCase() }],
    ['empty', { email: m.email, password: '' }],
    ["another account's password", { email: m.email, password: n.password }],
    ["this password on another account's email", { email: n.email, password: m.password }],
  ];
  for (const [label, c] of wrongs) {
    const r = await attempt(c);
    expect.soft(r.status >= 200 && r.status < 300, `ROW-068 ${label}: the sign-in is refused (answered ${r.status})`).toBe(false);
    expect.soft(r.meStatus, `ROW-068 ${label}: no session results`).not.toBe(200);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-069 promise: REQ-014 fail-if (3) "a switched-off account signs in"; A-008: after it is switched off it cannot
// ROW-069   sign in.
// ROW-069 wrong product: a switch-off that only ends open sessions (or only cancels requests) and leaves sign-in
// ROW-069   checking the password alone.
// ROW-069 given: members M and N signed in once (their passwords work). when: the admin switches M off, then M's
// ROW-069   email and correct password are posted. then: the sign-in answers non-2xx and GET /api/me on that jar is not
// ROW-069   200; N, untouched, still signs in.
// ROW-069 controls: the control case shows M's same credentials sign in before the switch-off.
// ROW-069 technique: before/after around the switch-off with the very same credentials, and the neighbouring
// ROW-069   account that must stay able to sign in.
// ROW-069 cases: ROW-069 target=ROW-069.REQ-014.a-switched-off-account-does-not-sign-in control=ROW-069.control.the-account-signs-in-before-the-switch-off
test('ROW-069.control.the-account-signs-in-before-the-switch-off', async () => {
  const a = await start();
  const m = await createMember(a);
  const r = await attempt({ email: m.email, password: m.password });
  expect(r.meStatus, 'ROW-069 control: M signs in while switched on').toBe(200);
});

test('ROW-069.REQ-014.a-switched-off-account-does-not-sign-in', async () => {
  const a = await start();
  const m = await createMember(a);
  const n = await createMember(a);
  expect((await attempt({ email: m.email, password: m.password })).meStatus, 'ROW-069 before: M signs in').toBe(200);

  await switchAccount(a, m.id, false);

  const r = await attempt({ email: m.email, password: m.password });
  expect.soft(r.status >= 200 && r.status < 300, `ROW-069: the switched-off account's sign-in is refused (answered ${r.status})`).toBe(false);
  expect.soft(r.meStatus, 'ROW-069: no session for the switched-off account').not.toBe(200);
  expect.soft((await attempt({ email: n.email, password: n.password })).meStatus, 'ROW-069: N, still on, signs in').toBe(200);
});
