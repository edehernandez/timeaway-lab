// Purpose: ledger tests for ROW-169 and ROW-170 (REQ-014, REQ-015) — a sign-in in flight while the account is switched off or its password is set never produces a working session after the change; an uncontested sign-in does.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, accounts, the two-step switch-off, password set), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): session rules under concurrency, proved at the HTTP harness: the sign-in is POST /api/auth/sign-in
// on a fresh cookie jar (D-029), fired in the same tick as the admin's switch-off act or POST
// /api/admin/accounts/:id/password; "a working session" is that jar answered 200 on GET /api/me or 201 on a valid
// POST /api/requests afterwards. Each round uses a fresh account, so no email reaches D-026's 5 wrong attempts.
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  createMember,
  freshPassword,
  readEffect,
  requireOk,
  resetProduct,
  signIn,
  switchAccount,
  type Actor,
  type Member,
} from './harness';
import { aucklandMorning, getJson, occurrences, together } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const WRITE = { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' };

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-08') });
  return keep(await signIn(install.admin));
}

function ok(status: number): boolean {
  return status >= 200 && status < 300;
}

async function works(jar: APIRequestContext): Promise<{ me: number; write: number }> {
  const me = (await jar.get('/api/me')).status();
  const write = (await jar.post('/api/requests', { data: WRITE })).status();
  return { me, write };
}

// ---------------------------------------------------------------------------------------------------
// ROW-169 promise: REQ-014 "a switched-off account cannot sign in, and any session it holds ends at once when it is
// ROW-169   switched off" (fail-if (3), (4)); REQ-015 "after either change the old password no longer signs in, and
// ROW-169   every other open session of that account ends" (fail-if (3), (5)); A-008, A-034; D-003. The row's case:
// ROW-169   a sign-in in flight while the account is switched off or its password is set never produces a working
// ROW-169   session after the change.
// ROW-169 wrong product: a sign-in that checks the password and the switched-on flag, then (after the switch-off or
// ROW-169   password set has deleted the account's sessions) inserts its new session row — a session born after the
// ROW-169   sweep, working although the account is off or the password it used is gone.
// ROW-169 given: today Mon 2027-03-08 (Auckland). when: (switch) in each of 5 rounds a fresh member, a switch-off
// ROW-169   token read first, the member's sign-in on a fresh jar and the switch-off act in the same tick (retried
// ROW-169   when refused as stale, so the account always ends off); (password) in each of 5 rounds a fresh member,
// ROW-169   its sign-in with its current password and the admin's password set in the same tick. then: after
// ROW-169   both settle, the jar answers neither GET /api/me with 200 nor the write with 201.
// ROW-169 controls: ROW-170's target (an uncontested sign-in produces a working session) — the jar, the sign-in
// ROW-169   and the write are sound, so a refusal here is the change's effect.
// ROW-169 technique: races repeated over rounds; the session judged after both acts settle, on both a read and a
// ROW-169   write.
// ROW-169 cases: ROW-169 target=ROW-169.REQ-014.a-sign-in-in-flight-at-switch-off-or-password-set-gives-no-working-session control=ROW-170.REQ-014.an-uncontested-sign-in-gives-a-working-session
test('ROW-169.REQ-014.a-sign-in-in-flight-at-switch-off-or-password-set-gives-no-working-session', async () => {
  const admin = await start();
  for (let i = 0; i < 5; i += 1) {
    const m: Member = await createMember(admin);
    const off = await readEffect(admin, 'switch-off', m.id);
    const jar = keep(await anonymousApi());
    const [signedIn, switched] = await together([
      async () => (await jar.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } })).status(),
      async () => (await actWithToken(admin, 'switch-off', m.id, off.token)).status(),
    ]);
    if (!ok(switched)) await switchAccount(admin, m.id, false);
    const w = await works(jar);
    const where = `ROW-169 switch round ${i} (sign-in ${signedIn}, switch ${switched})`;
    expect.soft(w.me, `${where}: no working session after the switch-off (GET /api/me)`).not.toBe(200);
    expect.soft(w.write, `${where}: no working session after the switch-off (POST /api/requests)`).not.toBe(201);
  }
  for (let i = 0; i < 5; i += 1) {
    const m: Member = await createMember(admin);
    const jar = keep(await anonymousApi());
    const route = `/api/admin/accounts/${encodeURIComponent(String(m.id))}/password`;
    const [signedIn, set] = await together([
      async () => (await jar.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } })).status(),
      async () => {
        const res = await admin.api.post(route, { data: { password: freshPassword() } });
        await requireOk(res, `POST ${route}`);
        return res.status();
      },
    ]);
    const w = await works(jar);
    const where = `ROW-169 password round ${i} (sign-in ${signedIn}, set ${set})`;
    expect.soft(w.me, `${where}: no working session after the password set (GET /api/me)`).not.toBe(200);
    expect.soft(w.write, `${where}: no working session after the password set (POST /api/requests)`).not.toBe(201);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-170 promise: REQ-014 "every page and every action requires being signed in with an account's email and
// ROW-170   password"; the sign-in itself. The row's case: a sign-in with no competing change produces a working
// ROW-170   session.
// ROW-170 wrong product: a sign-in that answers success but whose cookie the next request does not honour.
// ROW-170 given: a fresh member with its own password. when: it signs in on a fresh jar. then: the jar answers GET
// ROW-170   /api/me with 200 and the valid write with 201.
// ROW-170 controls: the control case shows the account exists: the admin's people list carries its email.
// ROW-170 technique: the plain path, judged on a read and a write.
// ROW-170 cases: ROW-170 target=ROW-170.REQ-014.an-uncontested-sign-in-gives-a-working-session control=ROW-170.control.the-account-exists
test('ROW-170.control.the-account-exists', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const people = JSON.stringify(await getJson(admin.api, '/api/admin/people', 'ROW-170 control'));
  expect(occurrences(people, m.email), "ROW-170 control: the people list carries the member's email").toBeGreaterThan(0);
});

test('ROW-170.REQ-014.an-uncontested-sign-in-gives-a-working-session', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const jar = keep(await anonymousApi());
  const res = await jar.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } });
  expect.soft(ok(res.status()), 'ROW-170: the sign-in answers success').toBe(true);
  const w = await works(jar);
  expect.soft(w.me, 'ROW-170: the session reads GET /api/me').toBe(200);
  expect.soft(w.write, 'ROW-170: the session writes').toBe(201);
});
