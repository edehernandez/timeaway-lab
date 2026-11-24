// Purpose: ledger tests for ROW-167 and ROW-168 (REQ-016) — a send or an approval in flight while an account is switched off never leaves a pending request or an approved future day on it; a request sent before the switch-off is cancelled by it.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, requests, the two-step confirmed actions, switch), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): a lifecycle rule under concurrency, proved at the HTTP harness. "Switched off" is observed as a
// sign-in with the account's own password that yields no session (GET /api/me not 200); "a pending request" as the
// account's records on the admin's view of it (GET /api/admin/people/:id/requests) and its name on GET
// /api/admin/pending; "an approved future day" as the account listed on the calendar (GET /api/calendar, D-029) on
// a day from today on.
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  createMember,
  readEffect,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { addDays, aucklandMorning, datesListedAcross, getJson, recordById, requestRecords, stateOf, together } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const TODAY = '2027-03-01';
const MONDAY = '2027-03-08';
const MONTHS = [
  { year: 2027, month: 3 },
  { year: 2027, month: 4 },
];

function week(r: number): { firstDay: string; lastDay: string } {
  const mon = addDays(MONDAY, 7 * r);
  return { firstDay: mon, lastDay: addDays(mon, 3) };
}

async function start(): Promise<{ admin: Actor; member: Member }> {
  const install = await resetProduct({ now: aucklandMorning(TODAY) });
  const admin = keep(await signIn(install.admin));
  return { admin, member: await createMember(admin, { allowance: 100 }) };
}

function ok(status: number): boolean {
  return status >= 200 && status < 300;
}

async function signsIn(member: Member): Promise<boolean> {
  const api = await anonymousApi();
  try {
    await api.post('/api/auth/sign-in', { data: { email: member.email, password: member.password } });
    return (await api.get('/api/me')).status() === 200;
  } finally {
    await api.dispose();
  }
}

async function expectNothingLive(admin: Actor, member: Member, where: string): Promise<void> {
  expect.soft(await signsIn(member), `${where}: the account is switched off (its password gives no session)`).toBe(false);
  const view = await getJson(admin.api, `/api/admin/people/${encodeURIComponent(String(member.id))}/requests`, where);
  const pending = requestRecords(view).filter((o) => stateOf(o) === 'pending');
  expect.soft(pending.length, `${where}: the switched-off account holds no pending request`).toBe(0);
  const pendingPage = await admin.api.get('/api/admin/pending');
  expect.soft(pendingPage.status(), `${where}: GET /api/admin/pending answers 200`).toBe(200);
  expect.soft((await pendingPage.text()).includes(member.name), `${where}: the pending page lists nothing of the account`).toBe(false);
  const future = (await datesListedAcross(admin.api, MONTHS, member, where)).filter((d) => d >= TODAY);
  expect.soft(future, `${where}: the calendar shows no approved day of the account from today on`).toEqual([]);
}

// ---------------------------------------------------------------------------------------------------
// ROW-167 promise: REQ-016 "switching off cancels the account's pending requests and the days from today on of its
// ROW-167   approved requests" and fail-if (2) "a switched-off account keeps a pending request", (3) "keeps an
// ROW-167   approved day from today on"; A-022. The row's case: a send in flight while the account is switched off,
// ROW-167   or an approval in flight on its request, never leaves a pending request or an approved future day.
// ROW-167 wrong product: a switch-off that reads the account's requests, cancels them, then marks the account off
// ROW-167   in separate steps, so a send stored in between survives pending, or an approval written after the
// ROW-167   cancel puts the days back on the calendar; or a send that checks the session before the switch and
// ROW-167   inserts after it.
// ROW-167 given: today Mon 2027-03-01 (Auckland); a member (allowance 100). when: (send) in each of 4 rounds the
// ROW-167   member, signed in, sends a 4-day vacation in the same tick as the admin's switch-off act (token read
// ROW-167   first); (approve) in each of 4 rounds, with a pending 4-day vacation, the admin's approve act and
// ROW-167   switch-off act in the same tick. When the switch-off is refused because its effect changed (D-029's
// ROW-167   409), the admin switches off again, so every round ends with the account off. then: after every round
// ROW-167   the account gives no session, holds no pending request, the pending page lists nothing of it, the
// ROW-167   calendar shows it on no day from today on; and in the approve rounds the request is cancelled. The
// ROW-167   account is switched back on between rounds.
// ROW-167 controls: ROW-168's target (a request sent before the switch-off is cancelled by it) — the switch-off's
// ROW-167   effect without a race, so a failure here is the in-flight interleaving.
// ROW-167 technique: races repeated over rounds; the end state is asserted unconditionally in every round (the
// ROW-167   switch is retried when refused as stale, never skipped).
// ROW-167 cases: ROW-167 target=ROW-167.REQ-016.a-send-or-approval-in-flight-at-switch-off-leaves-nothing-live control=ROW-168.REQ-016.a-request-sent-before-the-switch-off-is-cancelled-by-it
test('ROW-167.REQ-016.a-send-or-approval-in-flight-at-switch-off-leaves-nothing-live', async () => {
  const { admin, member } = await start();
  let r = 0;
  for (let i = 0; i < 4; i += 1, r += 1) {
    const session = keep(await signInMember(member));
    const off = await readEffect(admin, 'switch-off', member.id);
    const [sent, switched] = await together([
      async () => (await session.api.post('/api/requests', { data: { kind: 'vacation', ...week(r) } })).status(),
      async () => (await actWithToken(admin, 'switch-off', member.id, off.token)).status(),
    ]);
    if (!ok(switched)) await switchAccount(admin, member.id, false);
    await expectNothingLive(admin, member, `ROW-167 send round ${i} (send ${sent}, switch ${switched})`);
    await switchAccount(admin, member.id, true);
  }
  for (let i = 0; i < 4; i += 1, r += 1) {
    const session = keep(await signInMember(member));
    const id: AccountId = await sendRequest(session, { kind: 'vacation', ...week(r) });
    const appr = await readEffect(admin, 'approve', id);
    const off = await readEffect(admin, 'switch-off', member.id);
    const [approved, switched] = await together([
      async () => (await actWithToken(admin, 'approve', id, appr.token)).status(),
      async () => (await actWithToken(admin, 'switch-off', member.id, off.token)).status(),
    ]);
    if (!ok(switched)) await switchAccount(admin, member.id, false);
    const where = `ROW-167 approve round ${i} (approve ${approved}, switch ${switched})`;
    await expectNothingLive(admin, member, where);
    const rec = recordById(await getJson(admin.api, `/api/admin/people/${encodeURIComponent(String(member.id))}/requests`, where), id);
    expect.soft(rec && stateOf(rec), `${where}: the request ends cancelled`).toBe('cancelled');
    await switchAccount(admin, member.id, true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-168 promise: REQ-016 "switching off cancels the account's pending requests"; A-022. The row's case: a request
// ROW-168   sent before the switch-off began is cancelled by it like any other.
// ROW-168 wrong product: a switch-off that only stops sign-in and leaves the account's requests as they were.
// ROW-168 given: a member's pending 4-day vacation (today Mon 2027-03-01, the days in a later week). when: the
// ROW-168   admin switches the account off. then: the request's record on the admin's view is cancelled, the
// ROW-168   pending page lists nothing of the account, and the account gives no session.
// ROW-168 controls: the control case shows the request on the pending page before the switch-off.
// ROW-168 technique: before and after the one action.
// ROW-168 cases: ROW-168 target=ROW-168.REQ-016.a-request-sent-before-the-switch-off-is-cancelled-by-it control=ROW-168.control.the-request-is-pending-before-the-switch-off
test('ROW-168.control.the-request-is-pending-before-the-switch-off', async () => {
  const { admin, member } = await start();
  const id = await sendRequest(keep(await signInMember(member)), { kind: 'vacation', ...week(0) });
  expect(recordById(await getJson(admin.api, '/api/admin/pending', 'ROW-168 control'), id), 'ROW-168 control: the request is pending').toBeDefined();
});

test('ROW-168.REQ-016.a-request-sent-before-the-switch-off-is-cancelled-by-it', async () => {
  const { admin, member } = await start();
  const id = await sendRequest(keep(await signInMember(member)), { kind: 'vacation', ...week(0) });
  await switchAccount(admin, member.id, false);
  const rec = recordById(await getJson(admin.api, `/api/admin/people/${encodeURIComponent(String(member.id))}/requests`, 'ROW-168'), id);
  expect.soft(rec && stateOf(rec), 'ROW-168: the request is cancelled by the switch-off').toBe('cancelled');
  await expectNothingLive(admin, member, 'ROW-168');
});
