// Purpose: ledger tests for ROW-169 and ROW-170 (REQ-014, REQ-015) — a sign-in in flight while the account is switched off or its password is set never produces a working session after the change; an uncontested sign-in does.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, accounts, the two-step switch-off, password set), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): session rules under concurrency, proved at the HTTP harness: the sign-in is POST /api/auth/sign-in
// on a fresh cookie jar (D-029), fired in the same tick as the admin's switch-off act or POST
// /api/admin/accounts/:id/password; "a working session" is that jar answered 200 on GET /api/me or 201 on a valid
// POST /api/requests afterwards. Each round uses a fresh account, so no email reaches D-026's 5 wrong attempts.
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  createMember,
  freshPassword,
  productUrl,
  readEffect,
  requireOk,
  resetProduct,
  SetupError,
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

// ---------------------------------------------------------------------------------------------------
// ROW-169, the window swept and the switch back on (added by test-author pass, slice 1, brief test-author-22).
// ROW-169 promise: as above — REQ-014 fail-if (3) "a switched-off account signs in", (4) "a session of an account
// ROW-169   keeps working after the account is switched off"; REQ-015 fail-if (3) "the old password still signs in after
// ROW-169   a change", (5) "a session other than the changer's keeps working after a password set or change"; A-008,
// ROW-169   A-034; D-003 (sessions are server-side rows so a change ends them at once); D-047 ("signIn already re-checks
// ROW-169   inside its transaction"); D-032 (no idle expiry: a session ends only by sign-out, a password set or change, or
// ROW-169   a switch-off — so switching the account back on must not bring a session back to life).
// ROW-169 wrong product: a sign-in that checks the password and the switched-on flag, awaits the password hash, then
// ROW-169   inserts its session without re-checking — a session row born after the switch-off's or the password set's
// ROW-169   sweep. While the account is off the per-request check may hide it; once the admin switches the account
// ROW-169   back on it works (a zombie). After a password set it works at once, signed in with a password that is gone.
// ROW-169 given: today Mon 2027-03-08 (Auckland); a fresh member per round. The window is where the sign-in has
// ROW-169   read the account but not yet written its session: it spans the sign-in's password check, so it is measured
// ROW-169   first (median of three uncontested sign-ins, I; median of three uncontested switch-off acts and password
// ROW-169   sets, S). when: in each of 12 rounds the change is sent and the sign-in is sent at offset o from it, the
// ROW-169   offsets stepping evenly from S − 2·I to S + I, so the rounds walk from "the sign-in finished before the
// ROW-169   change" through the window to "the sign-in started after the change", with at least three rounds inside a
// ROW-169   window as wide as I. Switch half: after both settle the account is switched back on. then: in every round
// ROW-169   the sign-in's jar answers neither GET /api/me with 200 nor the write with 201 — for the switch half both
// ROW-169   while the account is off and after it is switched back on; for the password half after the set.
// ROW-169 controls: after the switch-on the member's own password signs in afresh (the switch-on worked, so a dead
// ROW-169   jar is the sweep's doing, not a dead account); the sweep brackets the window — some round's sign-in
// ROW-169   answered success (it came before the change, its session then swept) and some answered a refusal (it came
// ROW-169   after) — else the calibration missed and the case fails as SETUP; ROW-170's target (an uncontested
// ROW-169   sign-in gives a working session) shows the jar, the sign-in and the write are sound.
// ROW-169 technique: the race forced into the window by measured, swept offsets (the stagger is the technique, not
// ROW-169   a readiness wait); the zombie looked for where it lives, after the switch back on; judged on a read and a
// ROW-169   write.
// ROW-169 cases: ROW-169 target=ROW-169.REQ-014.a-sign-in-swept-across-the-change-gives-no-working-session-even-after-switch-on control=ROW-170.REQ-014.an-uncontested-sign-in-gives-a-working-session

const ROUNDS = 12;

async function pause(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function timed<T>(f: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t = performance.now();
  const value = await f();
  return { ms: performance.now() - t, value };
}

/** Sends `change` and `signInNow` so that the sign-in leaves `offsetMs` after the change (before it when negative); answers both statuses. */
async function staggered(change: () => Promise<number>, signInNow: () => Promise<number>, offsetMs: number): Promise<{ signedIn: number; changed: number }> {
  if (offsetMs >= 0) {
    const c = change();
    await pause(offsetMs);
    const s = signInNow();
    const [signedIn, changed] = await Promise.all([s, c]);
    return { signedIn, changed };
  }
  const s = signInNow();
  await pause(-offsetMs);
  const c = change();
  const [signedIn, changed] = await Promise.all([s, c]);
  return { signedIn, changed };
}

function offsets(s: number, i: number): number[] {
  const from = s - 2 * i;
  const step = (3 * i) / (ROUNDS - 1);
  return Array.from({ length: ROUNDS }, (_, k) => Math.round(from + k * step));
}

function bracketed(statuses: number[], half: string): void {
  const before = statuses.filter((s) => ok(s)).length;
  const after = statuses.filter((s) => s >= 400).length;
  if (before === 0 || after === 0) {
    throw new SetupError(`ROW-169 ${half}: the sweep did not bracket the window (sign-in statuses ${JSON.stringify(statuses)}); the calibration missed`);
  }
}

async function signInStatusOn(jar: APIRequestContext, m: Member): Promise<number> {
  return (await jar.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } })).status();
}

test('ROW-169.REQ-014.a-sign-in-swept-across-the-change-gives-no-working-session-even-after-switch-on', async () => {
  const admin = await start();

  // Calibration: I (an uncontested sign-in), S for the switch-off act and for the password set.
  const probe = await createMember(admin);
  const signInMs: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const jar = keep(await anonymousApi());
    const t = await timed(() => signInStatusOn(jar, probe));
    await requireOk(await jar.get('/api/me'), 'ROW-169 calibration: GET /api/me after an uncontested sign-in');
    signInMs.push(t.ms);
  }
  const offMs: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const effect = await readEffect(admin, 'switch-off', probe.id);
    const t = await timed(async () => (await actWithToken(admin, 'switch-off', probe.id, effect.token)).status());
    if (!ok(t.value)) throw new SetupError(`ROW-169 calibration: the switch-off act answered ${t.value}`);
    offMs.push(t.ms);
    await switchAccount(admin, probe.id, true);
  }
  const setMs: number[] = [];
  const probeRoute = `/api/admin/accounts/${encodeURIComponent(String(probe.id))}/password`;
  for (let k = 0; k < 3; k += 1) {
    const t = await timed(async () => (await requireOk(await admin.api.post(probeRoute, { data: { password: freshPassword() } }), `POST ${probeRoute}`)).status());
    setMs.push(t.ms);
  }
  const I = median(signInMs);
  const sOff = median(offMs);
  const sSet = median(setMs);
  test.info().annotations.push({ type: 'ROW-169 calibration', description: `sign-in ${Math.round(I)} ms, switch-off act ${Math.round(sOff)} ms, password set ${Math.round(sSet)} ms` });

  // Switch half.
  const offStatuses: number[] = [];
  for (const o of offsets(sOff, I)) {
    const m: Member = await createMember(admin);
    const effect = await readEffect(admin, 'switch-off', m.id);
    const jar = keep(await anonymousApi());
    const r = await staggered(async () => (await actWithToken(admin, 'switch-off', m.id, effect.token)).status(), () => signInStatusOn(jar, m), o);
    if (!ok(r.changed)) await switchAccount(admin, m.id, false);
    offStatuses.push(r.signedIn);
    // A twin of the jar, holding the same cookie, that sends nothing while the account is off (so no answer to a
    // request made while off can clear the cookie it would revive with).
    const twin = keep(await playwrightRequest.newContext({ baseURL: productUrl(), storageState: await jar.storageState() }));
    const where = `ROW-169 switch round at offset ${o} ms (sign-in ${r.signedIn}, switch ${r.changed})`;
    const whileOff = await works(jar);
    expect.soft(whileOff.me, `${where}: no working session while switched off (GET /api/me)`).not.toBe(200);
    expect.soft(whileOff.write, `${where}: no working session while switched off (POST /api/requests)`).not.toBe(201);
    await switchAccount(admin, m.id, true);
    const fresh = keep(await anonymousApi());
    expect.soft(ok(await signInStatusOn(fresh, m)), `${where} control: after the switch back on the member's own password signs in afresh`).toBe(true);
    for (const [label, j] of [
      ['its twin', twin],
      ['the jar', jar],
    ] as const) {
      const afterOn = await works(j);
      expect.soft(afterOn.me, `${where}: the in-flight session (${label}) does not come back to life after the switch back on (GET /api/me)`).not.toBe(200);
      expect.soft(afterOn.write, `${where}: the in-flight session (${label}) does not come back to life after the switch back on (POST /api/requests)`).not.toBe(201);
    }
  }

  // Password half.
  const setStatuses: number[] = [];
  for (const o of offsets(sSet, I)) {
    const m: Member = await createMember(admin);
    const jar = keep(await anonymousApi());
    const route = `/api/admin/accounts/${encodeURIComponent(String(m.id))}/password`;
    const r = await staggered(
      async () => (await requireOk(await admin.api.post(route, { data: { password: freshPassword() } }), `POST ${route}`)).status(),
      () => signInStatusOn(jar, m),
      o,
    );
    setStatuses.push(r.signedIn);
    const w = await works(jar);
    const where = `ROW-169 password round at offset ${o} ms (sign-in ${r.signedIn}, set ${r.changed})`;
    expect.soft(w.me, `${where}: no working session after the password set (GET /api/me)`).not.toBe(200);
    expect.soft(w.write, `${where}: no working session after the password set (POST /api/requests)`).not.toBe(201);
  }

  bracketed(offStatuses, 'switch half');
  bracketed(setStatuses, 'password half');
});
