// Purpose: hostility probe HOS-013 (protects RULE-003, INV-003, ROW-118) — a team member with a valid session who calls each admin action, and another person's request and allowance addresses, directly with complete bodies and real tokens is refused every time, and nothing changes.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approve, switch-off, effect tokens), fresh per run; the admin routes also read from the route folder's file names (route-census.ts, names only).
//
// Boundary (R6): an authorization rule, proved at the HTTP harness on D-029's routes, each called on the member's
// own valid session exactly as the admin's client would call it.
//
// HOS-013 promise: INV-003 "only the admin approves, rejects, cancels approved requests, sets allowances, creates and
// HOS-013   renames accounts, changes an account's email, sets another person's password, switches accounts and sees a
// HOS-013   person's change history; a person acts only on their own requests ... a refused attempt changes nothing";
// HOS-013   RULE-003 (every route calling an operation not marked member-callable checks the admin before it runs);
// HOS-013   A-008, A-044, A-045; D-037 (an own cancel of another's request answers 404).
// HOS-013 wrong product: one admin route whose admin check was removed (the probe's own toggle) — say the allowance
// HOS-013   route checking only the session, or approve checking only that the token is valid; a route that checks the
// HOS-013   admin AFTER writing; an own cancel that cancels any request by id.
// HOS-013 given: a fresh install at Mon 2027-03-08; the attacker M and the other member O, both signed in; O's pending
// HOS-013   vacations 22-23 March (P1), 12-13 April (P2) and 14-15 June (P3), O's approved vacation 10-11 May (A1); a
// HOS-013   switched-off member Z.
// HOS-013 when: on M's session: create an account; rename O; change O's email; set O's password; set O's allowance;
// HOS-013   approve P1 and reject P2 and cancel A1, each with a real token the admin's effect step just issued; switch O
// HOS-013   off with a real token; switch Z on; cancel P3 through the own-cancel address; read the people list, the
// HOS-013   pending list, O's requests, O's history and both effect steps; then every other route of the route folder
// HOS-013   under /api/admin, with every method it answers.
// HOS-013 then: every admin address answers 401, 403 or 404 and the own cancel a 4xx; no answer carries O's email or
// HOS-013   name or a token; afterwards the admin's people list, pending list, O's requests and O's history are deep-equal
// HOS-013   to before, no account holds the created email, O still signs in with her own password and not with the one
// HOS-013   M tried to set, and Z still cannot sign in.
// HOS-013 controls: the control case makes the SAME calls with the same bodies on the ADMIN's session: each answers
// HOS-013   2xx and the state then differs (O renamed, P1 approved, Z on) — so the bodies and tokens are complete and
// HOS-013   reach the effect, and the target's refusals are the admin check's doing, never a malformed call's.
// HOS-013 technique: one list of calls run on two sessions (the admin's proves each call would work, the member's
// HOS-013   must be refused), real tokens so a missing admin check meets no other guard, a census over the admin route
// HOS-013   folder for the routes the list does not name, and a deep-equal before/after of the state.
// HOS-013 cases: HOS-013 target=HOS-013.RULE-003.every-admin-act-and-anothers-address-refuses-a-member-and-changes-nothing control=HOS-013.control.the-same-calls-on-the-admins-session-take-effect
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  anonymousApi,
  approve,
  confirmedActionRoutes,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  readEffect,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Member,
} from './harness';
import { concreteAddress, holdsText, isAdminPattern, methodsOf, routeCensus, routeMatches } from './route-census';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland

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
  mSession: Actor;
  o: Member;
  z: Member;
  p1: AccountId;
  p2: AccountId;
  p3: AccountId;
  a1: AccountId;
}

async function build(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const o = await createMember(admin, { allowance: 25 });
  const z = await createMember(admin);
  const mSession = keep(await signInMember(m));
  const oSession = keep(await signInMember(o));
  const p1 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' });
  const p2 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
  const p3 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-06-14', lastDay: '2027-06-15' });
  const a1 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' });
  await approve(admin, a1);
  await switchAccount(admin, z.id, false);
  return { admin, m, mSession, o, z, p1, p2, p3, a1 };
}

interface Call {
  label: string;
  method: string;
  address: string;
  data?: Record<string, unknown>;
  /** Only the member makes it (the own-cancel address is the member's, not an admin act). */
  memberOnly?: boolean;
  /** A read: the control expects 200, the target a refusal with no data. */
  read?: boolean;
}

/** The fresh values the writes carry, chosen once so the target can look for them afterwards. */
interface Written {
  createdEmail: string;
  name: string;
  email: string;
  password: string;
  allowance: number;
}

function written(): Written {
  return { createdEmail: freshEmail('created'), name: freshName('Renamed'), email: freshEmail('moved'), password: freshPassword(), allowance: 13 };
}

const seg = (id: AccountId) => encodeURIComponent(String(id));

/** The admin's effect step for a confirmed action, read now (a token valid for the state as it is). */
async function tokenFor(w: World, action: ConfirmedAction, id: AccountId): Promise<string> {
  return (await readEffect(w.admin, action, id)).token;
}

/** The calls, in an order the admin can complete: the decisions before the switch-off. */
async function* calls(w: World, v: Written): AsyncGenerator<Call> {
  yield { label: 'create an account', method: 'POST', address: '/api/admin/accounts', data: { name: freshName('Created'), email: v.createdEmail, password: freshPassword(), allowance: 9 } };
  yield { label: 'rename O', method: 'POST', address: `/api/admin/accounts/${seg(w.o.id)}/name`, data: { name: v.name } };
  yield { label: "set O's password", method: 'POST', address: `/api/admin/accounts/${seg(w.o.id)}/password`, data: { password: v.password } };
  yield { label: "set O's allowance", method: 'POST', address: `/api/admin/accounts/${seg(w.o.id)}/allowance`, data: { allowance: v.allowance, startsNextYear: false } };
  yield { label: 'read the people list', method: 'GET', address: '/api/admin/people', read: true };
  yield { label: 'read the pending list', method: 'GET', address: '/api/admin/pending', read: true };
  yield { label: "read O's requests", method: 'GET', address: `/api/admin/people/${seg(w.o.id)}/requests`, read: true };
  yield { label: "read O's history", method: 'GET', address: `/api/admin/people/${seg(w.o.id)}/history`, read: true };
  yield { label: "read P1's approve effect", method: 'GET', address: confirmedActionRoutes('approve', w.p1).effect, read: true };
  yield { label: "read O's switch-off effect", method: 'GET', address: confirmedActionRoutes('switch-off', w.o.id).effect, read: true };
  yield { label: 'approve P1', method: 'POST', address: confirmedActionRoutes('approve', w.p1).act, data: { token: await tokenFor(w, 'approve', w.p1) } };
  yield { label: 'reject P2', method: 'POST', address: confirmedActionRoutes('reject', w.p2).act, data: { token: await tokenFor(w, 'reject', w.p2), note: freshName('Note') } };
  yield { label: 'cancel A1', method: 'POST', address: confirmedActionRoutes('cancel', w.a1).act, data: { token: await tokenFor(w, 'cancel', w.a1) } };
  yield { label: 'switch Z on', method: 'POST', address: `/api/admin/accounts/${seg(w.z.id)}/switch`, data: { on: true } };
  yield { label: 'cancel P3 through the own-cancel address', method: 'POST', address: `/api/requests/${seg(w.p3)}/cancel`, data: {}, memberOnly: true };
  // The email change and the switch-off last: the admin's own session must still find O by her email up to here.
  yield { label: "change O's email", method: 'POST', address: `/api/admin/accounts/${seg(w.o.id)}/email`, data: { email: v.email } };
  yield { label: 'switch O off', method: 'POST', address: confirmedActionRoutes('switch-off', w.o.id).act, data: { on: false, token: await tokenFor(w, 'switch-off', w.o.id) } };
}

async function getJson(api: APIRequestContext, url: string): Promise<unknown> {
  const res = await api.get(url);
  expect(res.status(), `HOS-013 snapshot: GET ${url} answers the admin`).toBe(200);
  return res.json();
}

async function snapshot(w: World): Promise<Record<string, unknown>> {
  return {
    people: await getJson(w.admin.api, '/api/admin/people'),
    pending: await getJson(w.admin.api, '/api/admin/pending'),
    oRequests: await getJson(w.admin.api, `/api/admin/people/${seg(w.o.id)}/requests`),
    oHistory: await getJson(w.admin.api, `/api/admin/people/${seg(w.o.id)}/history`),
  };
}

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    await api.post('/api/auth/sign-in', { data: { email, password } });
    return (await api.get('/api/me')).status() === 200;
  } finally {
    await api.dispose();
  }
}

function hasTokenField(body: string): boolean {
  try {
    return /"token"\s*:/.test(JSON.stringify(JSON.parse(body)));
  } catch {
    return /"token"\s*:/.test(body);
  }
}

test('HOS-013.control.the-same-calls-on-the-admins-session-take-effect', async () => {
  const w = await build();
  const v = written();
  const before = await snapshot(w);
  for await (const call of calls(w, v)) {
    if (call.memberOnly) continue;
    const res = await w.admin.api.fetch(call.address, { method: call.method, ...(call.data ? { data: call.data } : {}) });
    expect.soft(res.status() >= 200 && res.status() < 300, `HOS-013 control: on the admin's session, ${call.label} answers 2xx (answered ${res.status()}: ${(await res.text()).slice(0, 200)})`).toBe(true);
  }
  const after = await snapshot(w);
  expect(after, 'HOS-013 control: the calls changed the state').not.toEqual(before);
  expect(holdsText(JSON.stringify(after.people), v.name), 'HOS-013 control: O was renamed').toBe(true);
  expect(holdsText(JSON.stringify(after.people), v.createdEmail), 'HOS-013 control: the account was created').toBe(true);
  expect(await signsIn(w.z.email, w.z.password), 'HOS-013 control: Z, switched on, signs in').toBe(true);
});

test('HOS-013.RULE-003.every-admin-act-and-anothers-address-refuses-a-member-and-changes-nothing', async () => {
  test.setTimeout(240_000);
  const w = await build();
  const v = written();
  const before = await snapshot(w);
  const secrets = [w.o.email, w.o.name];
  const made: Call[] = [];

  for await (const call of calls(w, v)) {
    made.push(call);
    const res = await w.mSession.api.fetch(call.address, { method: call.method, ...(call.data ? { data: call.data } : {}) });
    const status = res.status();
    const body = await res.text().catch(() => '');
    if (call.memberOnly) {
      expect.soft(status >= 400 && status < 500, `HOS-013 ${call.label} on M's session: refused (answered ${status})`).toBe(true);
    } else {
      expect.soft([401, 403, 404], `HOS-013 ${call.label} on M's session: refused (answered ${status})`).toContain(status);
    }
    expect.soft(secrets.filter((s) => holdsText(body, s)), `HOS-013 ${call.label}: carries none of O's data`).toEqual([]);
    expect.soft(hasTokenField(body), `HOS-013 ${call.label}: hands M no token`).toBe(false);
  }

  // The admin routes of the route folder that the list does not name, with every method they answer.
  const routes = routeCensus().filter((r) => isAdminPattern(r.pattern) && r.pattern.startsWith('/api/'));
  expect(routes.length, 'HOS-013 (setup): the census found admin routes').toBeGreaterThan(0);
  const body = { name: v.name, email: v.email, password: v.password, allowance: v.allowance, startsNextYear: false, on: true };
  for (const route of routes) {
    for (const method of methodsOf(route)) {
      const address = concreteAddress(route.pattern, { request: w.p1, account: w.o.id });
      if (made.some((c) => c.method === method && routeMatches(route, method, c.address.split('?')[0]))) continue;
      const res = await w.mSession.api.fetch(`${address}${method === 'GET' ? '?action=approve' : ''}`, { method, ...(method === 'GET' ? {} : { data: body }) });
      const text = await res.text().catch(() => '');
      expect.soft([401, 403, 404], `HOS-013 ${method} ${route.pattern} (${route.file}) on M's session: refused (answered ${res.status()})`).toContain(res.status());
      expect.soft(secrets.filter((s) => holdsText(text, s)), `HOS-013 ${method} ${route.pattern}: carries none of O's data`).toEqual([]);
    }
  }

  const after = await snapshot(w);
  expect.soft(after, 'HOS-013: nothing the member attempted changed the people list, the pending list, or O\'s requests or history').toEqual(before);
  expect.soft(holdsText(JSON.stringify(after.people), v.createdEmail), 'HOS-013: no account was created').toBe(false);
  expect.soft(await signsIn(w.o.email, w.o.password), 'HOS-013: O still signs in with her own password').toBe(true);
  expect.soft(await signsIn(w.o.email, v.password), 'HOS-013: the password M tried to set does not sign O in').toBe(false);
  expect.soft(await signsIn(w.z.email, w.z.password), 'HOS-013: Z is still switched off').toBe(false);
});
