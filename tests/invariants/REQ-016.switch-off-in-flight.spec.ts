// Purpose: ledger tests for ROW-167 and ROW-168 (REQ-016) — a send or an approval in flight while an account is switched off never leaves a pending request or an approved future day on it; a request sent before the switch-off is cancelled by it.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, requests, the two-step confirmed actions, switch), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): a lifecycle rule under concurrency, proved at the HTTP harness. "Switched off" is observed as a
// sign-in with the account's own password that yields no session (GET /api/me not 200); "a pending request" as the
// account's records on the admin's view of it (GET /api/admin/people/:id/requests) and its name on GET
// /api/admin/pending; "an approved future day" as the account listed on the calendar (GET /api/calendar, D-029) on
// a day from today on.
// Slice 1, brief test-author-24: ROW-167 cases added after ROW-168's — the window reached deliberately: a send (and
// an approval) whose headers reach the product before the switch-off and whose body arrives only after the
// switch-off has answered (a raw node:http request holding its last byte), and a send swept at measured offsets
// across the switch-off act, as ROW-169's case in REQ-014.sign-in-in-flight.spec.ts does. Every earlier assertion kept.
import http from 'node:http';
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  createMember,
  productUrl,
  SetupError,
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

// ---------------------------------------------------------------------------------------------------
// ROW-167, the window reached deliberately (added by test-author pass, slice 1, brief test-author-24).
// ROW-167 promise: as above — REQ-016 fail-if (2) "a switched-off account keeps a pending request", (3) "a
// ROW-167   switched-off account keeps an approved day from today on, or that day stays on the calendar"; A-022;
// ROW-167   D-047 ("every write a session authorises re-checks, inside its own write transaction, that the acting
// ROW-167   session still exists and its account is still switched on … a session ended meanwhile is refused 401").
// ROW-167 wrong product: a send route that checks the session, then awaits its body, then inserts the request without
// ROW-167   re-checking — when the switch-off completes during that await, the request is stored pending on an account
// ROW-167   already switched off; an approve route that reads the request as pending before awaiting its body and writes
// ROW-167   it approved after — the switch-off's cancel is overwritten and the days come back on the calendar. Fired in
// ROW-167   the same tick, such a send finishes long before the switch-off starts, so the earlier case cannot see it.
// ROW-167 given: today Mon 2027-03-01 (Auckland); a fresh member per round (allowance 100), its 4-day vacation in
// ROW-167   the week of Mon 2027-03-08. when (held): in each of 3 send rounds the member's POST /api/requests leaves with
// ROW-167   its headers and every byte of its body but the last, flushed to the socket; the admin's switch-off act (its
// ROW-167   token read first) runs to its answer; then the last byte goes. In each of 3 approve rounds the same with the
// ROW-167   admin's approve act on the member's pending request. when (swept): the send's and the switch-off act's
// ROW-167   uncontested times are measured (medians of three, I and S); in each of 12 rounds the send leaves at offset o
// ROW-167   from the switch-off act, o stepping evenly from S − 2·I to S + I, walking from "the send finished before the
// ROW-167   switch-off" through the switch-off to "the send started after it". A switch-off refused as stale (its effect
// ROW-167   changed) is done again, so every round ends with the account off. then: after every round the account gives
// ROW-167   no session, holds no pending request, the pending page lists nothing of it and the calendar shows it on no day
// ROW-167   from today on; in the approve rounds the request ends cancelled.
// ROW-167 controls: the control case sends a held request and a held approval with no switch-off: each is answered
// ROW-167   2xx when its last byte goes, the request is pending and then approved — so a refusal in the target is the
// ROW-167   switch-off's doing, never a malformed held request; the sweep brackets the switch-off (some send answered
// ROW-167   2xx, some was refused), else the calibration missed and the case fails as SETUP.
// ROW-167 technique: the race forced into the route's await by holding the body (deterministic for a check made
// ROW-167   before the body is read), then swept offsets for a check made after it; the end state asserted
// ROW-167   unconditionally in every round.
// ROW-167 cases: ROW-167 target=ROW-167.REQ-016.a-send-or-approval-held-across-the-switch-off-or-swept-over-it-leaves-nothing-live control=ROW-167.control.a-held-send-and-a-held-approval-go-through-with-no-switch-off

interface Held {
  /** Sends the held last byte and answers the product's status and body (the answer may already have come). */
  release(): Promise<{ status: number; text: string }>;
}

/**
 * POSTs `data` as JSON to `path` on the actor's session with a raw node:http request whose headers and every byte of
 * the body but the last are written and flushed to the socket before this returns; release() sends the last byte.
 */
async function holdPost(actor: Actor, path: string, data: unknown): Promise<Held> {
  const url = new URL(path, productUrl());
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  const cookie = (await actor.api.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const req = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(payload.length), accept: 'application/json', cookie },
  });
  const answer = new Promise<{ status: number; text: string }>((resolve, reject) => {
    req.on('response', (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
  answer.catch(() => undefined);
  await new Promise<void>((resolve, reject) => req.write(payload.subarray(0, payload.length - 1), (e) => (e ? reject(new SetupError(`holding POST ${path}: ${e.message}`)) : resolve())));
  return {
    release: async () => {
      if (!req.writableEnded) req.end(payload.subarray(payload.length - 1));
      return answer;
    },
  };
}

async function freshMemberSession(admin: Actor): Promise<{ m: Member; session: Actor }> {
  const m = await createMember(admin, { allowance: 100 });
  return { m, session: keep(await signInMember(m)) };
}

function personRequestsRoute(m: Member): string {
  return `/api/admin/people/${encodeURIComponent(String(m.id))}/requests`;
}

test('ROW-167.control.a-held-send-and-a-held-approval-go-through-with-no-switch-off', async () => {
  const { admin } = await start();
  const { m, session } = await freshMemberSession(admin);
  const held = await holdPost(session, '/api/requests', { kind: 'vacation', ...week(0) });
  const sent = await held.release();
  expect(ok(sent.status), `ROW-167 control: the held send is answered 2xx once its last byte goes (answered ${sent.status} ${sent.text.slice(0, 200)})`).toBe(true);
  const id = (JSON.parse(sent.text) as { id: AccountId }).id;
  const rec = recordById(await getJson(admin.api, personRequestsRoute(m), 'ROW-167 control'), id);
  expect(rec && stateOf(rec), 'ROW-167 control: the held send is stored pending').toBe('pending');
  const appr = await readEffect(admin, 'approve', id);
  const heldApprove = await holdPost(admin, `/api/admin/requests/${encodeURIComponent(String(id))}/approve`, { token: appr.token });
  const approved = await heldApprove.release();
  expect(ok(approved.status), `ROW-167 control: the held approval is answered 2xx (answered ${approved.status} ${approved.text.slice(0, 200)})`).toBe(true);
  const after = recordById(await getJson(admin.api, personRequestsRoute(m), 'ROW-167 control'), id);
  expect(after && stateOf(after), 'ROW-167 control: the held approval approved the request').toBe('approved');
});

const SWEEP_ROUNDS = 12;

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

/** Starts the switch-off act and the send so that the send leaves `offsetMs` after the act (before it when negative). */
async function staggered(change: () => Promise<number>, sendNow: () => Promise<number>, offsetMs: number): Promise<{ sent: number; changed: number }> {
  if (offsetMs >= 0) {
    const c = change();
    await pause(offsetMs);
    const s = sendNow();
    const [sent, changed] = await Promise.all([s, c]);
    return { sent, changed };
  }
  const s = sendNow();
  await pause(-offsetMs);
  const c = change();
  const [sent, changed] = await Promise.all([s, c]);
  return { sent, changed };
}

test('ROW-167.REQ-016.a-send-or-approval-held-across-the-switch-off-or-swept-over-it-leaves-nothing-live', async () => {
  const { admin } = await start();

  // Held sends: the switch-off completes while the send's body is still in flight.
  for (let i = 0; i < 3; i += 1) {
    const { m, session } = await freshMemberSession(admin);
    const off = await readEffect(admin, 'switch-off', m.id);
    const held = await holdPost(session, '/api/requests', { kind: 'vacation', ...week(0) });
    const switched = (await actWithToken(admin, 'switch-off', m.id, off.token)).status();
    const sent = await held.release();
    if (!ok(switched)) await switchAccount(admin, m.id, false);
    test.info().annotations.push({ type: 'ROW-167 held send', description: `round ${i}: switch ${switched}, send ${sent.status}` });
    await expectNothingLive(admin, m, `ROW-167 held send round ${i} (switch ${switched}, send ${sent.status})`);
  }

  // Held approvals: the switch-off completes while the approval's body is still in flight.
  for (let i = 0; i < 3; i += 1) {
    const { m, session } = await freshMemberSession(admin);
    const id: AccountId = await sendRequest(session, { kind: 'vacation', ...week(0) });
    const appr = await readEffect(admin, 'approve', id);
    const off = await readEffect(admin, 'switch-off', m.id);
    const held = await holdPost(admin, `/api/admin/requests/${encodeURIComponent(String(id))}/approve`, { token: appr.token });
    const switched = (await actWithToken(admin, 'switch-off', m.id, off.token)).status();
    const approved = await held.release();
    if (!ok(switched)) await switchAccount(admin, m.id, false);
    const where = `ROW-167 held approve round ${i} (switch ${switched}, approve ${approved.status})`;
    test.info().annotations.push({ type: 'ROW-167 held approve', description: `round ${i}: switch ${switched}, approve ${approved.status}` });
    await expectNothingLive(admin, m, where);
    const rec = recordById(await getJson(admin.api, personRequestsRoute(m), where), id);
    expect.soft(rec && stateOf(rec), `${where}: the request ends cancelled`).toBe('cancelled');
  }

  // Calibration: I (an uncontested send), S (an uncontested switch-off act).
  const probe = await freshMemberSession(admin);
  const sendMs: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const t = await timed(async () => (await probe.session.api.post('/api/requests', { data: { kind: 'vacation', ...week(k + 1) } })).status());
    if (!ok(t.value)) throw new SetupError(`ROW-167 calibration: an uncontested send answered ${t.value}`);
    sendMs.push(t.ms);
  }
  const offMs: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const effect = await readEffect(admin, 'switch-off', probe.m.id);
    const t = await timed(async () => (await actWithToken(admin, 'switch-off', probe.m.id, effect.token)).status());
    if (!ok(t.value)) throw new SetupError(`ROW-167 calibration: the switch-off act answered ${t.value}`);
    offMs.push(t.ms);
    await switchAccount(admin, probe.m.id, true);
  }
  const I = median(sendMs);
  const S = median(offMs);
  test.info().annotations.push({ type: 'ROW-167 calibration', description: `send ${Math.round(I)} ms, switch-off act ${Math.round(S)} ms` });

  // Swept sends.
  const from = S - 2 * I;
  const step = (3 * I) / (SWEEP_ROUNDS - 1);
  const statuses: number[] = [];
  for (let k = 0; k < SWEEP_ROUNDS; k += 1) {
    const o = Math.round(from + k * step);
    const { m, session } = await freshMemberSession(admin);
    const off = await readEffect(admin, 'switch-off', m.id);
    const r = await staggered(
      async () => (await actWithToken(admin, 'switch-off', m.id, off.token)).status(),
      async () => (await session.api.post('/api/requests', { data: { kind: 'vacation', ...week(0) } })).status(),
      o,
    );
    statuses.push(r.sent);
    if (!ok(r.changed)) await switchAccount(admin, m.id, false);
    await expectNothingLive(admin, m, `ROW-167 swept send at offset ${o} ms (send ${r.sent}, switch ${r.changed})`);
  }
  test.info().annotations.push({ type: 'ROW-167 sweep', description: `send statuses ${JSON.stringify(statuses)}` });
  if (statuses.filter(ok).length === 0 || statuses.filter((s) => s >= 400).length === 0) {
    throw new SetupError(`ROW-167 sweep: the offsets did not bracket the switch-off (send statuses ${JSON.stringify(statuses)}); the calibration missed`);
  }
});
