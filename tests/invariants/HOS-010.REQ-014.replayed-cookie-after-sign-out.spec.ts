// Purpose: hostility probe HOS-010 (protects REQ-014) — after signing out, the old session cookie replayed is refused for every read and write and writes nothing.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, sign-out), fresh per run; the old cookie replayed on fresh clients through route-census.ts.
//
// Boundary (R6): a session rule, proved at the HTTP harness: the replay carries the exact cookie value the member's
// client held before she signed out, on a client with no cookie jar of its own, so a cookie cleared by the
// sign-out's answer is still sent — as a thief who copied it would send it.
//
// HOS-010 promise: REQ-014 "signing out ends the session", fail-if (5) "a session keeps working after signing out";
// HOS-010   D-003 (sessions are server-side rows, so signing out ends them at once); D-032 (a session ends by signing
// HOS-010   out).
// HOS-010 wrong product: a sign-out that only clears the browser's cookie and leaves the session row (the probe's own
// HOS-010   toggle); one that marks the session ended but whose writes still accept it; one that ends another session of
// HOS-010   the account and leaves this one.
// HOS-010 given: a fresh install at Mon 2027-03-08; a member M signed in, her pending vacation 22-23 March; her
// HOS-010   session cookie copied from her client.
// HOS-010 when: M signs out (POST /api/auth/sign-out on her session); then the copied cookie is sent on fresh clients
// HOS-010   to GET /api/me, /api/requests, /api/balance, /api/calendar, and to POST /api/requests (a vacation 19-20
// HOS-010   April).
// HOS-010 then: each is answered 401 or 403 and carries neither M's name nor her email; M, signing in again, holds no
// HOS-010   request for 19 April.
// HOS-010 controls: the control case replays the same copied cookie BEFORE the sign-out: GET /api/me answers 200 with
// HOS-010   M's id and GET /api/requests carries her 22 March request — the replay door carries the session, so the
// HOS-010   target's refusals are the sign-out's doing; the target itself repeats that read just before signing out.
// HOS-010 technique: before/after around the sign-out on the very same cookie value; reads and a write, the write
// HOS-010   checked for its effect afterwards.
// HOS-010 cases: HOS-010 target=HOS-010.REQ-014.the-old-cookie-replayed-after-sign-out-is-refused control=HOS-010.control.the-copied-cookie-works-before-the-sign-out
import { test, expect } from '@playwright/test';
import { createMember, DEFAULT_TIME_ZONE, resetProduct, sendRequest, signIn, signInMember, signOut, type Actor, type Member } from './harness';
import { cookieHeader, holdsText, replay, sessionCookies } from './route-census';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland
const HELD_REQUEST = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-23' };
const ATTEMPTED = { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-20' };

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function build(): Promise<{ m: Member; mSession: Actor; cookie: string }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const mSession = keep(await signInMember(m));
  await sendRequest(mSession, HELD_REQUEST);
  return { m, mSession, cookie: cookieHeader(await sessionCookies(mSession)) };
}

async function readsHerSession(cookie: string, m: Member, row: string): Promise<void> {
  const me = await replay(cookie, 'GET', '/api/me');
  expect(me.status, `${row}: the copied cookie reads GET /api/me`).toBe(200);
  expect(String((JSON.parse(me.body) as { id?: unknown }).id), `${row}: the session is M's`).toBe(String(m.id));
  const requests = await replay(cookie, 'GET', '/api/requests');
  expect(requests.body, `${row}: her requests carry the 22 March request`).toContain(HELD_REQUEST.firstDay);
}

test('HOS-010.control.the-copied-cookie-works-before-the-sign-out', async () => {
  const w = await build();
  await readsHerSession(w.cookie, w.m, 'HOS-010 control');
});

test('HOS-010.REQ-014.the-old-cookie-replayed-after-sign-out-is-refused', async () => {
  const w = await build();
  await readsHerSession(w.cookie, w.m, 'HOS-010 (before the sign-out)');

  await signOut(w.mSession);

  const attempts: [string, string, unknown?][] = [
    ['GET', '/api/me'],
    ['GET', '/api/requests'],
    ['GET', '/api/balance'],
    ['GET', '/api/calendar?year=2027&month=3'],
    ['POST', '/api/requests', ATTEMPTED],
  ];
  for (const [method, address, data] of attempts) {
    const a = await replay(w.cookie, method, address, data);
    expect.soft([401, 403], `HOS-010 ${method} ${address} on the old cookie after the sign-out: refused (answered ${a.status})`).toContain(a.status);
    expect.soft(holdsText(a.body, w.m.email) || holdsText(a.body, w.m.name), `HOS-010 ${method} ${address}: carries none of M's data`).toBe(false);
  }

  const again = keep(await signIn({ email: w.m.email, password: w.m.password }));
  const own = await again.api.get('/api/requests');
  expect.soft(own.status(), 'HOS-010: M, signed in again, reads her requests').toBe(200);
  expect.soft((await own.text()).includes(ATTEMPTED.firstDay), 'HOS-010: the send on the old cookie stored no request').toBe(false);
});
