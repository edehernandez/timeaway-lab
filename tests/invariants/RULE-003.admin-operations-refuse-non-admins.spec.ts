// Purpose: the ledger test of RULE-003 (INV-003, REQ-020, REQ-021) — census-wide: every route of the route folder, wherever it lives, called with every method by a signed-in team member and by a visitor with no cookie, with bodies carrying every admin operation's fields and the admin's real confirmation tokens, performs no admin operation, hands over no admin-only data, and changes nothing.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19); fixture data made through the product's public routes by harness.ts (reset, accounts, rename, requests, approve, switch-off, effect tokens), fresh per run; routes read from the route folder's file names (route-census.ts, rule-census.ts).
//
// Boundary (R6): an authorization rule, proved at the HTTP harness on every route of the route folder, each called on
// the member's own valid session (and with no cookie) exactly as a client would call it. HOS-013 attempts the rule on
// D-029's named admin calls and the /api/admin folder; this file is the census-wide half: every route wherever it
// lives (an admin operation reachable from a route outside /api/admin is the rule's "wherever it lives"), every method a
// method-less file answers, and each :id filled with every target.
//
// RULE-003 promise: RULE-003 "every server route that calls any operation of the accounts or requests modules not marked
// RULE-003   member-callable (deny by default: approve, reject, admin cancel, list pending, the forecast, set allowance,
// RULE-003   create, rename, set password, change email, switch, list people, another person's requests, a person's change
// RULE-003   history), wherever it lives, checks the admin before the operation runs"; INV-003 (only the admin ...; a
// RULE-003   refused attempt changes nothing); REQ-020 arm 4 (anyone but the admin sees no account's email, switched-on
// RULE-003   state, allowance or days left, by any data the product sends them); REQ-021 arm 5; A-008, A-044, A-045.
// RULE-003 wrong product: one route — inside /api/admin or not — whose admin check is missing or comes after the write:
// RULE-003   an allowance route checking only the session, an approve that trusts any valid token, a people or history
// RULE-003   read served to any session, an extra route (a bulk or legacy path) that renames or switches without the check.
// RULE-003 given: a fresh install at Mon 2027-03-08 in Pacific/Auckland; the attacker M and the member O (renamed once by
// RULE-003   the admin, so her former name lives only in her change history), both signed in; O's pending vacations P1
// RULE-003   (22-23 March) and P2 (12-13 April), her approved vacation A1 (10-11 May); the admin's own pending vacation AD
// RULE-003   (14-15 June); a switched-off member Z; the admin's real tokens for approve P1, reject P2, cancel A1, approve AD
// RULE-003   and switch O off, read from the effect step.
// RULE-003 when: on M's session and with no cookie: every route of the route folder (less the control door and the
// RULE-003   sign-in routes), with every method it answers (GET, POST, PUT, PATCH and DELETE for a file naming none), each
// RULE-003   :id filled with each target binding (P1/O, P2/O, A1/O, A1/Z, AD/admin), every body carrying a binding's token,
// RULE-003   a fresh name, email and password, an allowance, startsNextYear, on and a note; GETs ask ?action=approve.
// RULE-003 then: every address under /api/admin or /admin answers 401, 403 or 404; no answer anywhere carries O's, Z's or
// RULE-003   the admin's email, O's former name, the days of O's or the admin's pending requests, or a token field; afterwards
// RULE-003   the admin's people list, pending list and every account's requests and change history are deep-equal to before,
// RULE-003   no account holds any email or name the bodies carried, O signs in with her own password and with none the
// RULE-003   bodies carried, and Z still cannot sign in.
// RULE-003 controls: the control case shows the walk's addresses and bodies are complete: on the ADMIN's session the
// RULE-003   same address and body of the census route for each of D-029's admin acts (create, rename, password, allowance,
// RULE-003   approve, reject, cancel, switch Z on, email, switch O off) answers 2xx and the admin's state then shows it; the
// RULE-003   admin's reads carry O's email and former name — so the secrets are reachable and the snapshot sees a change, and
// RULE-003   the target's refusals are the admin check's doing, never a malformed call's.
// RULE-003 technique: one walk run on two sessions (the admin's proves each call would work, the member's and the
// RULE-003   visitor's must be refused), real tokens so a missing admin check meets no other guard, a census over every
// RULE-003   route and method, and a deep-equal before/after of the state.
// RULE-003 cases: RULE-003 target=RULE-003.every-route-and-method-refuses-a-non-admin-any-admin-operation-and-changes-nothing control=RULE-003.control.the-walks-addresses-and-bodies-take-effect-for-the-admin
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  anonymousApi,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  readEffect,
  rename,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { D029_ROUTES, floorMissing, isAdminPattern, routeMatches, type CensusRoute } from './route-census';
import { addressesOf, callRoute, everyMethodOf, ruleRoutes, type Binding } from './rule-census';

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
  oFormerName: string;
  z: Member;
  p1: AccountId;
  p2: AccountId;
  a1: AccountId;
  ad: AccountId;
}

async function build(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const oFormerName = freshName('Olga');
  const o0 = await createMember(admin, { name: oFormerName, allowance: 25 });
  const oName = freshName('Oda');
  await rename(admin, o0.id, oName);
  const o: Member = { ...o0, name: oName };
  const z = await createMember(admin);
  const mSession = keep(await signInMember(m));
  const oSession = keep(await signInMember(o));
  const p1 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' });
  const p2 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
  const a1 = await sendRequest(oSession, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' });
  await approve(admin, a1);
  const ad = await sendRequest(admin, { kind: 'vacation', firstDay: '2027-06-14', lastDay: '2027-06-15' });
  await switchAccount(admin, z.id, false);
  return { admin, m, mSession, o, oFormerName, z, p1, p2, a1, ad };
}

/** One target of the walk: the ids its :params are filled with and the body it carries (a real token for its act). */
interface Target extends Binding {
  body: Record<string, unknown>;
}

/** The targets, each body with a fresh name, email and password, so the after-checks can look for every one. */
async function targets(w: World): Promise<Target[]> {
  const body = (token: string, on: boolean) => ({
    token,
    name: freshName('Taken'),
    email: freshEmail('taken'),
    password: freshPassword(),
    allowance: 13,
    startsNextYear: false,
    on,
    note: freshName('Note'),
  });
  const tok = async (action: 'approve' | 'reject' | 'cancel' | 'switch-off', id: AccountId) => (await readEffect(w.admin, action, id)).token;
  return [
    { label: 'P1/O approve', request: w.p1, account: w.o.id, body: body(await tok('approve', w.p1), false) },
    { label: 'P2/O reject', request: w.p2, account: w.o.id, body: body(await tok('reject', w.p2), false) },
    { label: 'A1/O switch-off', request: w.a1, account: w.o.id, body: body(await tok('switch-off', w.o.id), false) },
    { label: 'A1/Z cancel, switch on', request: w.a1, account: w.z.id, body: body(await tok('cancel', w.a1), true) },
    { label: 'AD/admin approve', request: w.ad, account: w.admin.me.id, body: body(await tok('approve', w.ad), false) },
  ];
}

const seg = (id: AccountId) => encodeURIComponent(String(id));

/**
 * The body D-029 gives the route's act, built from the target's fields, for the routes D-029 names; undefined for any
 * other route. The walk sends it beside the target's whole body, so a product that refuses unknown fields still meets
 * each named act with a body it accepts.
 */
function exactBody(pattern: string, t: Target): Record<string, unknown> | undefined {
  const b = t.body;
  if (/^\/api\/admin\/accounts$/.test(pattern)) return { name: b.name, email: b.email, password: b.password, allowance: b.allowance };
  if (/\/accounts\/:[^/]+\/name$/.test(pattern)) return { name: b.name };
  if (/\/accounts\/:[^/]+\/email$/.test(pattern)) return { email: b.email };
  if (/\/accounts\/:[^/]+\/password$/.test(pattern)) return { password: b.password };
  if (/\/accounts\/:[^/]+\/allowance$/.test(pattern)) return { allowance: b.allowance, startsNextYear: b.startsNextYear };
  if (/\/accounts\/:[^/]+\/switch$/.test(pattern)) return b.on ? { on: true } : { on: false, token: b.token };
  if (/\/requests\/:[^/]+\/reject$/.test(pattern)) return { token: b.token, note: b.note };
  if (/\/requests\/:[^/]+\/(approve|cancel)$/.test(pattern)) return { token: b.token };
  return undefined;
}

async function getJson(api: APIRequestContext, url: string): Promise<unknown> {
  const res = await api.get(url);
  expect(res.status(), `RULE-003 snapshot: GET ${url} answers the admin`).toBe(200);
  return res.json();
}

/** The admin's view of the whole team: people, pending, and every account's requests and change history. */
async function snapshot(w: World): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    people: await getJson(w.admin.api, '/api/admin/people'),
    pending: await getJson(w.admin.api, '/api/admin/pending'),
  };
  for (const [label, id] of [['admin', w.admin.me.id], ['m', w.m.id], ['o', w.o.id], ['z', w.z.id]] as const) {
    out[`${label} requests`] = await getJson(w.admin.api, `/api/admin/people/${seg(id)}/requests`);
    out[`${label} history`] = await getJson(w.admin.api, `/api/admin/people/${seg(id)}/history`);
  }
  return out;
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
  return /"token"\s*:/.test(body);
}

const holds = (text: string, value: string) => text.toLowerCase().includes(value.toLowerCase());

test('RULE-003.control.the-walks-addresses-and-bodies-take-effect-for-the-admin', async () => {
  test.setTimeout(240_000);
  const w = await build();
  const ts = await targets(w);
  const routes = ruleRoutes();
  expect(floorMissing(routes), 'RULE-003 control: the route census holds every route of D-029').toEqual([]);
  const before = await snapshot(w);
  expect(holds(JSON.stringify(before.people), w.o.email), "RULE-003 control: the admin's people answer carries O's email").toBe(true);
  expect(holds(JSON.stringify(before['o history']), w.oFormerName), "RULE-003 control: the admin's history answer carries O's former name").toBe(true);

  // Each of D-029's admin acts, through the census route the walk calls, the walk's address for the target and the
  // exact body the walk sends it; a confirmed act's token is read again just before it (an earlier act in this list
  // changes the effect a token was read for: the decisions move the switch-off's effect).
  const plan: [string, string, Target, ('approve' | 'reject' | 'cancel' | 'switch-off')?][] = [
    ['POST', '/api/admin/requests/:id/approve', ts[0], 'approve'],
    ['POST', '/api/admin/requests/:id/reject', ts[1], 'reject'],
    ['POST', '/api/admin/requests/:id/cancel', ts[3], 'cancel'],
    ['POST', '/api/admin/accounts/:id/switch', ts[3]],
    ['POST', '/api/admin/accounts', ts[4]],
    ['POST', '/api/admin/accounts/:id/name', ts[0]],
    ['POST', '/api/admin/accounts/:id/password', ts[0]],
    ['POST', '/api/admin/accounts/:id/allowance', ts[0]],
    ['POST', '/api/admin/accounts/:id/email', ts[1]],
    ['POST', '/api/admin/accounts/:id/switch', ts[2], 'switch-off'],
  ];
  for (const [method, pattern, t0, action] of plan) {
    // The route the census reads for this act: the one whose pattern is D-029's (its :param named anything), else the
    // most specific one answering it — never a catch-all.
    const norm = (x: string) => x.replace(/:[^/]+/g, ':id');
    const route = (routes.find((r) => (r.method === null || r.method === method) && norm(r.pattern) === pattern) ??
      routes.find((r) => !r.pattern.includes('**') && routeMatches(r, method, pattern.replace(/:id/g, 'X')))) as CensusRoute;
    expect(route, `RULE-003 control: the census has a route for ${method} ${pattern}`).toBeDefined();
    const t: Target = action ? { ...t0, body: { ...t0.body, token: (await readEffect(w.admin, action, action === 'switch-off' ? t0.account : t0.request)).token } } : t0;
    const [{ address }] = addressesOf(route, [t]);
    const res = await callRoute(w.admin.api, method, address, exactBody(route.pattern, t) ?? t.body);
    expect.soft(res.status >= 200 && res.status < 300, `RULE-003 control: on the admin's session, ${method} ${address} [${t.label}] answers 2xx (answered ${res.status}: ${res.body.slice(0, 200)})`).toBe(true);
  }
  const after = await snapshot(w);
  expect(after, "RULE-003 control: the admin's acts changed the snapshot").not.toEqual(before);
  expect(holds(JSON.stringify(after.people), ts[4].body.email as string), 'RULE-003 control: the account was created').toBe(true);
  expect(holds(JSON.stringify(after.people), ts[0].body.name as string), 'RULE-003 control: O was renamed').toBe(true);
  expect(await signsIn(w.z.email, w.z.password), 'RULE-003 control: Z, switched on, signs in').toBe(true);
  expect(D029_ROUTES.length, 'RULE-003 control: D-029 names routes').toBeGreaterThan(0);
});

test('RULE-003.every-route-and-method-refuses-a-non-admin-any-admin-operation-and-changes-nothing', async () => {
  test.setTimeout(600_000);
  const w = await build();
  const ts = await targets(w);
  const before = await snapshot(w);
  const routes = ruleRoutes();
  expect(routes.filter((r) => isAdminPattern(r.pattern)).length, 'RULE-003 (setup): the census found admin routes').toBeGreaterThan(0);
  const secrets = [w.o.email, w.z.email, w.admin.credentials.email, w.oFormerName];
  let calls = 0;

  for (const [label, api] of [['M', w.mSession.api], ['no cookie', null]] as const) {
    for (const route of routes) {
      for (const method of everyMethodOf(route)) {
        for (const { address, binding } of addressesOf(route, ts)) {
          const t = binding as Target;
          const exact = exactBody(route.pattern, t);
          const bodies: (Record<string, unknown> | undefined)[] = method === 'GET' || method === 'HEAD' ? [undefined] : exact ? [t.body, exact] : [t.body];
          for (const body of bodies) {
            const url = method === 'GET' ? `${address}?action=approve` : address;
            const res = await callRoute(api, method, url, body);
            calls += 1;
            const where = `RULE-003 ${method} ${route.pattern} (${route.file}) [${t.label}${body === exact && exact ? ', exact body' : ''}] as ${label}`;
            if (isAdminPattern(route.pattern)) expect.soft([401, 403, 404], `${where}: refused (answered ${res.status})`).toContain(res.status);
            expect.soft(secrets.filter((s) => holds(res.body, s)), `${where}: carries no admin-only data`).toEqual([]);
            expect.soft(hasTokenField(res.body), `${where}: hands over no token`).toBe(false);
          }
        }
      }
    }
  }
  expect(calls, 'RULE-003: the walk made its calls').toBeGreaterThan(0);

  const after = await snapshot(w);
  expect.soft(after, "RULE-003: nothing the non-admins attempted changed the people list, the pending list, or any account's requests or history").toEqual(before);
  const people = JSON.stringify(after.people);
  // O's own password first: the wrong ones below are five wrong attempts on her email, which start the sign-in wait.
  expect.soft(await signsIn(w.o.email, w.o.password), 'RULE-003: O still signs in with her own password').toBe(true);
  expect.soft(await signsIn(w.z.email, w.z.password), 'RULE-003: Z is still switched off').toBe(false);
  for (const t of ts) {
    expect.soft(holds(people, t.body.email as string), `RULE-003: no account holds the email the body [${t.label}] carried`).toBe(false);
    expect.soft(holds(people, t.body.name as string), `RULE-003: no account holds the name the body [${t.label}] carried`).toBe(false);
    expect.soft(await signsIn(w.o.email, t.body.password as string), `RULE-003: the password the body [${t.label}] carried does not sign O in`).toBe(false);
  }
});
