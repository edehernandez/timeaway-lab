// Purpose: hostility probe HOS-009 (protects REQ-014) — a session held by an account stops working the moment the admin switches the account off: every read and write it attempts is refused and writes nothing.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, the confirmed switch-off, switch on), fresh per run; the held session replayed on fresh clients through route-census.ts; the session rows read through the store door (doors-store.ts, D-048, D-049) — store reads added by brief test-author-21.
//
// Boundary (R6): a session rule, proved at the HTTP harness: the held session is the member's real cookie, sent
// back exactly as her browser would send it; that the session has ENDED is read where it lives, in the store (D-003:
// a server-side row; D-032: the row holds the SHA-256 of the cookie's identifier), because a second guard — the
// session read refusing a switched-off account — refuses the replays even while a session row stays alive.
//
// HOS-009 promise: REQ-014 "any session it holds ends at once when it is switched off", fail-if (4) "a session of an
// HOS-009   account keeps working after the account is switched off"; D-003 (sessions are server-side rows so that a
// HOS-009   switch-off ends them at once); D-047 (a write re-checks the live session and the switched-on account).
// HOS-009 wrong product: a switch-off that leaves the account's session rows alive (the probe's own toggle) while
// HOS-009   only sign-in checks the switched-on state; one that ends the sessions only after an idle time; one whose
// HOS-009   reads refuse but whose send still inserts a request, or whose own password change still writes.
// HOS-009 given: a fresh install at Mon 2027-03-08; members M and N signed in, each holding a session; M's pending
// HOS-009   vacation 22-23 March; M's session cookie read from her client.
// HOS-009 when: the admin switches M off (the confirmed two-step action); at once, M's cookie is sent on fresh
// HOS-009   clients to GET /api/me, /api/requests, /api/balance, /api/calendar, and to POST /api/requests (a vacation
// HOS-009   19-20 April) and POST /api/me/password (her current password and a fresh one).
// HOS-009 then: at once after the switch-off, before any replay, the store holds no row of M's held session (found
// HOS-009   by its identifier's SHA-256) and no session row of M's account, while N's held session's row is still there;
// HOS-009   each replay is answered 401 or 403 and carries neither M's name nor her email; after the admin switches M
// HOS-009   back on, M's OLD password still signs her in (the password change did not write) and the admin's view of
// HOS-009   her requests holds no request for 19 April; N's session still answers GET /api/me with N's id.
// HOS-009 controls: the control case sends M's same cookie on a fresh client BEFORE the switch-off: GET /api/me
// HOS-009   answers 200 with M's id and GET /api/requests carries her 22 March request — the replay door carries her
// HOS-009   session, so the target's refusals are the switch-off's doing; the store holds the row of M's held session
// HOS-009   (by its hash) and of N's, so the store reading finds a live session's row and the target's absence is the
// HOS-009   switch-off's doing, not a reading that finds nothing.
// HOS-009 technique: before/after around the switch-off on the very same cookie; reads and writes both, the writes
// HOS-009   checked for their effect afterwards; the neighbouring account's session that must stay alive; the session
// HOS-009   row observed before and after in the store, so the probe's own toggle (leave sessions alive on switch-off)
// HOS-009   turns it red even while the session read holds.
// HOS-009 cases: HOS-009 target=HOS-009.REQ-014.a-held-session-is-refused-at-once-after-the-switch-off control=HOS-009.control.the-held-session-works-before-the-switch-off
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshPassword,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Member,
} from './harness';
import { cookieHeader, holdsText, replay, sessionCookies, type CookiePair } from './route-census';
import { sessionRowsHoldingHashOf, sessionRowsOfAccount, storedAccount, type Row } from './doors-store';

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

interface World {
  admin: Actor;
  m: Member;
  n: Member;
  nSession: Actor;
  mCookie: string;
  mPairs: CookiePair[];
  nPairs: CookiePair[];
}

/** The session cookie's value among an actor's cookies: D-032's `timeaway_session`, else every cookie value held. */
function identifiers(pairs: CookiePair[]): string[] {
  const named = pairs.filter((p) => p.name === 'timeaway_session').map((p) => p.value);
  return named.length > 0 ? named : pairs.map((p) => p.value);
}

/** The stored session rows holding the SHA-256 of any of the actor's session identifiers. */
async function heldRows(pairs: CookiePair[]): Promise<Row[]> {
  const out: Row[] = [];
  for (const v of identifiers(pairs)) out.push(...(await sessionRowsHoldingHashOf(v)));
  return out;
}

async function build(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const n = await createMember(admin);
  const mSession = keep(await signInMember(m));
  const nSession = keep(await signInMember(n));
  await sendRequest(mSession, HELD_REQUEST);
  const mPairs = await sessionCookies(mSession);
  const nPairs = await sessionCookies(nSession);
  const mCookie = cookieHeader(mPairs);
  return { admin, m, n, nSession, mCookie, mPairs, nPairs };
}

test('HOS-009.control.the-held-session-works-before-the-switch-off', async () => {
  const w = await build();
  const me = await replay(w.mCookie, 'GET', '/api/me');
  expect(me.status, "HOS-009 control: M's held cookie reads GET /api/me").toBe(200);
  expect(String((JSON.parse(me.body) as { id?: unknown }).id), "HOS-009 control: the session is M's").toBe(String(w.m.id));
  const requests = await replay(w.mCookie, 'GET', '/api/requests');
  expect(requests.status, "HOS-009 control: M's held cookie reads her requests").toBe(200);
  expect(requests.body, 'HOS-009 control: her requests carry the 22 March request').toContain(HELD_REQUEST.firstDay);
  expect((await heldRows(w.mPairs)).length, "HOS-009 control: the store holds the row of M's held session (by its identifier's SHA-256)").toBe(1);
  expect((await heldRows(w.nPairs)).length, "HOS-009 control: the store holds the row of N's held session").toBe(1);
  const mKey = (await storedAccount(w.m.email)).key;
  expect((await sessionRowsOfAccount(mKey)).length, "HOS-009 control: the store holds a session row of M's account").toBeGreaterThan(0);
});

test('HOS-009.REQ-014.a-held-session-is-refused-at-once-after-the-switch-off', async () => {
  const w = await build();
  const newPassword = freshPassword();
  const mKey = (await storedAccount(w.m.email)).key;
  expect((await heldRows(w.mPairs)).length, "HOS-009: before the switch-off the store holds the row of M's held session").toBe(1);

  await switchAccount(w.admin, w.m.id, false);

  // At once, before any replay touches it: the session itself has ended in the store.
  expect.soft(await heldRows(w.mPairs), "HOS-009: after the switch-off the store holds no row of M's held session").toEqual([]);
  expect.soft(await sessionRowsOfAccount(mKey), "HOS-009: after the switch-off the store holds no session row of M's account").toEqual([]);
  expect.soft((await heldRows(w.nPairs)).length, "HOS-009: N's held session's row is still in the store").toBe(1);

  const attempts: [string, string, unknown?][] = [
    ['GET', '/api/me'],
    ['GET', '/api/requests'],
    ['GET', '/api/balance'],
    ['GET', '/api/calendar?year=2027&month=3'],
    ['POST', '/api/requests', ATTEMPTED],
    ['POST', '/api/me/password', { current: w.m.password, next: newPassword }],
  ];
  for (const [method, address, data] of attempts) {
    const a = await replay(w.mCookie, method, address, data);
    expect.soft([401, 403], `HOS-009 ${method} ${address} on M's held session after the switch-off: refused (answered ${a.status})`).toContain(a.status);
    expect.soft(holdsText(a.body, w.m.email) || holdsText(a.body, w.m.name), `HOS-009 ${method} ${address}: carries none of M's data`).toBe(false);
  }

  // The writes wrote nothing: back on, M signs in with her OLD password and holds no 19 April request.
  await switchAccount(w.admin, w.m.id, true);
  const again = keep(await anonymousApi());
  const old = await again.post('/api/auth/sign-in', { data: { email: w.m.email, password: w.m.password } });
  expect.soft(old.status() >= 200 && old.status() < 400, `HOS-009: M's OLD password still signs her in, so the password change on the ended session wrote nothing (answered ${old.status()})`).toBe(true);
  const stored = await w.admin.api.get(`/api/admin/people/${encodeURIComponent(String(w.m.id))}/requests`);
  expect.soft(stored.status(), "HOS-009: the admin reads M's requests").toBe(200);
  expect.soft((await stored.text()).includes(ATTEMPTED.firstDay), 'HOS-009: the send on the ended session stored no request').toBe(false);

  const nMe = await w.nSession.api.get('/api/me');
  expect.soft(nMe.status(), "HOS-009: N's session still works").toBe(200);
  expect.soft(String(((await nMe.json().catch(() => ({}))) as { id?: unknown }).id), "HOS-009: N's session is still N's").toBe(String(w.n.id));
});
