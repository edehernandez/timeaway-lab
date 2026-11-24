// Purpose: ledger tests for ROW-070 and ROW-071 (REQ-014) — an account's session stops working when the account is switched off (and stays dead after it is switched back on), and a session stops working when it signs out.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, accounts, switch, sign-out), fresh per run.
//
// Boundary (R6): session rules, proved at the HTTP harness. "Replaying the old session cookie" is done literally:
// the session's cookie jar (Playwright storage state) is saved while it works and loaded into a new API context
// later, so a product that clears the cookie in a Set-Cookie answer cannot hide a session that still works on the
// server (D-003: sessions are server-side rows).
// The read addresses are GET /api/me and GET /api/calendar; the write is POST /api/requests (D-029). "Refused" is
// 401 or 403; "nothing changed" is the member's own pending vacation count and the admin's pending list.
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import {
  createMember,
  DEFAULT_TIME_ZONE,
  productUrl,
  readBalance,
  resetProduct,
  signIn,
  signInMember,
  signOut,
  switchAccount,
  type Actor,
  type Member,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const WRITE = { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' };

type SavedState = Awaited<ReturnType<APIRequestContext['storageState']>>;

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return keep(await signIn(install.admin));
}

async function replay(state: SavedState): Promise<APIRequestContext> {
  return keep(await playwrightRequest.newContext({ baseURL: productUrl(), storageState: state }));
}

function refused(status: number): boolean {
  return status === 401 || status === 403;
}

async function expectNoWriteLanded(admin: Actor, member: Member, row: string): Promise<void> {
  const fresh = keep(await signInMember(member));
  const balance = await readBalance(fresh);
  const y2027 = balance.years.find((y) => y.year === 2027);
  expect.soft(y2027?.pending, `${row}: the refused write left no pending days`).toBe(0);
  const pending = await admin.api.get('/api/admin/pending');
  expect(pending.status(), `${row}: GET /api/admin/pending answers the admin`).toBe(200);
  expect.soft((await pending.text()).includes(member.name), `${row}: no pending request of the member exists`).toBe(false);
}

// ---------------------------------------------------------------------------------------------------
// ROW-070 promise: REQ-014 fail-if (4) "a session of an account keeps working after the account is switched off";
// ROW-070   REQ-014 "any session it holds ends at once when it is switched off" (D-003). The row's case: switch off,
// ROW-070   then back on, then replay the old session cookie on a read and a write address: both refused, nothing
// ROW-070   changed.
// ROW-070 wrong product: a session lookup that checks "is the account switched on" at each request instead of
// ROW-070   deleting its sessions — the old session dies while the account is off and revives when it is switched on;
// ROW-070   or a switch-off that ends sessions only for reads.
// ROW-070 given: member M signed in as session S, S's cookie jar saved while S works. when: the admin switches M
// ROW-070   off, then on; the saved jar is replayed on GET /api/me, GET /api/calendar and POST /api/requests (a valid
// ROW-070   vacation). then: S is refused while M is off; after M is back on, all three replays answer 401 or 403; M
// ROW-070   (signed in again) has no pending days and the admin's pending list has no request of M.
// ROW-070 controls: the control case replays a saved jar while the account is on (200: the replay carries the
// ROW-070   session) and posts the same write on another member's live session (201: the body would write).
// ROW-070 technique: the row's own sequence (off, on, replay); the revival is the case a per-request "switched on"
// ROW-070   check gets wrong.
// ROW-070 cases: ROW-070 target=ROW-070.REQ-014.an-old-session-stays-dead-after-switch-off-and-back-on control=ROW-070.control.a-replayed-session-works-and-the-write-is-valid
test('ROW-070.control.a-replayed-session-works-and-the-write-is-valid', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const s = keep(await signInMember(m));
  const saved = await s.api.storageState();
  const r = await replay(saved);
  expect((await r.get('/api/me')).status(), 'ROW-070 control: the replayed jar carries the live session').toBe(200);
  const n = keep(await signInMember(await createMember(admin)));
  expect((await n.api.post('/api/requests', { data: WRITE })).status(), 'ROW-070 control: the write is accepted on a live session').toBe(201);
});

test('ROW-070.REQ-014.an-old-session-stays-dead-after-switch-off-and-back-on', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const s = keep(await signInMember(m));
  const saved = await s.api.storageState();
  expect((await s.api.get('/api/me')).status(), 'ROW-070 before: S works').toBe(200);

  await switchAccount(admin, m.id, false);
  const whileOff = (await s.api.get('/api/me')).status();
  expect.soft(refused(whileOff), `ROW-070: S is refused at once after the switch-off (answered ${whileOff})`).toBe(true);

  await switchAccount(admin, m.id, true);
  const r = await replay(saved);
  const me = (await r.get('/api/me')).status();
  const cal = (await r.get('/api/calendar?year=2027&month=3')).status();
  const write = (await r.post('/api/requests', { data: WRITE })).status();
  expect.soft(refused(me), `ROW-070: the old cookie is refused on GET /api/me after switching back on (answered ${me})`).toBe(true);
  expect.soft(refused(cal), `ROW-070: the old cookie is refused on GET /api/calendar after switching back on (answered ${cal})`).toBe(true);
  expect.soft(refused(write), `ROW-070: the old cookie is refused on POST /api/requests after switching back on (answered ${write})`).toBe(true);
  await expectNoWriteLanded(admin, m, 'ROW-070');
});

// ---------------------------------------------------------------------------------------------------
// ROW-071 promise: REQ-014 fail-if (5) "a session keeps working after signing out"; the row's case: the cookie
// ROW-071   value saved before signing out and replayed afterwards to a read and a write address: both refused.
// ROW-071 wrong product: a sign-out that only clears the cookie in the browser (Set-Cookie with an empty value)
// ROW-071   and leaves the server-side session row alive.
// ROW-071 given: member M signed in as session S, S's jar saved while it works. when: S signs out through
// ROW-071   POST /api/auth/sign-out; the saved jar is replayed on GET /api/me, GET /api/calendar and POST /api/requests.
// ROW-071   then: all three answer 401 or 403; M (signed in again) has no pending days and the admin's pending list has
// ROW-071   no request of M.
// ROW-071 controls: the control case replays the saved jar before signing out (200: the replay carries the session).
// ROW-071 technique: the saved cookie replayed, never the jar the sign-out answer wrote to.
// ROW-071 cases: ROW-071 target=ROW-071.REQ-014.a-signed-out-session-cookie-is-refused-on-replay control=ROW-071.control.the-saved-cookie-works-before-signing-out
test('ROW-071.control.the-saved-cookie-works-before-signing-out', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const s = keep(await signInMember(m));
  const r = await replay(await s.api.storageState());
  expect((await r.get('/api/me')).status(), 'ROW-071 control: the saved cookie carries the session').toBe(200);
});

test('ROW-071.REQ-014.a-signed-out-session-cookie-is-refused-on-replay', async () => {
  const admin = await start();
  const m = await createMember(admin);
  const s = keep(await signInMember(m));
  const saved = await s.api.storageState();
  expect((await s.api.get('/api/me')).status(), 'ROW-071 before: S works').toBe(200);

  await signOut(s);

  const r = await replay(saved);
  const me = (await r.get('/api/me')).status();
  const cal = (await r.get('/api/calendar?year=2027&month=3')).status();
  const write = (await r.post('/api/requests', { data: WRITE })).status();
  expect.soft(refused(me), `ROW-071: the saved cookie is refused on GET /api/me (answered ${me})`).toBe(true);
  expect.soft(refused(cal), `ROW-071: the saved cookie is refused on GET /api/calendar (answered ${cal})`).toBe(true);
  expect.soft(refused(write), `ROW-071: the saved cookie is refused on POST /api/requests (answered ${write})`).toBe(true);
  await expectNoWriteLanded(admin, m, 'ROW-071');
});
