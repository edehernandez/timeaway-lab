// Purpose: ledger test for ROW-067 (REQ-014) — every address found from the server's route folder refuses an anonymous caller: no data, no effect.
// Provenance: hand-authored (test-author pass, slice 0); the address list is read at run time from the names of the files under server/api and server/routes (names only, never their contents); fixture data made through the product's public routes by harness.ts, fresh per run.
//
// ROW-067 promise: REQ-014 fail-if (1) "someone who is not signed in sees any page's content or any data other
// ROW-067   than the sign-in page, or causes any action's effect"; the row's case: every address found from the
// ROW-067   server's route folder, not a hand-written list, refuses an anonymous caller.
// ROW-067 wrong product: a new route file (say server/api/admin/export.get.ts, or a request route's cancel) whose
// ROW-067   guard was forgotten, answering an anonymous caller with team data or acting on a valid token; a route that
// ROW-067   checks the confirm token but not the session.
// ROW-067 given: a fresh install at a fixed clock; the admin and a member signed in; the member's pending vacation;
// ROW-067   a real approve token for it and a real switch-off token for the member, read by the admin. when: an
// ROW-067   anonymous caller sends every method each route file declares (GET and POST for a file without one) to its
// ROW-067   address, dynamic segments filled with the real request or account id, writes carrying a complete body with
// ROW-067   the real token. then: each is answered 401 or 403; no answer carries the admin's or the member's fresh name
// ROW-067   or email; afterwards the admin's people list, pending list and the member's requests, and the member's
// ROW-067   balance and requests are deep-equal to before, and both sessions still work.
// ROW-067 controls: the control case shows the census holds every D-029 route (the floor that keeps the target from
// ROW-067   passing on a census that found nothing) and the admin, signed in, reads the member's name — the data the
// ROW-067   target looks for exists and is reachable with a session.
// ROW-067 technique: a census over the route folder (a property over every route, the row's own instruction), real
// ROW-067   ids and tokens so a missing guard would reach the effect, and a deep-equal before/after of the state.
// ROW-067   Excluded by name, never silently: /api/__test/* (the harness's control door, DIF-001/D-029, on only in the
// ROW-067   test profile; probing it would wipe the run). Probed for leaks and effects but not for the status:
// ROW-067   POST /api/auth/sign-in (the sign-in itself), /api/auth/sign-out (no session, no effect) and /api/health
// ROW-067   (the harness's readiness route).
// ROW-067 cases: ROW-067 target=ROW-067.REQ-014.every-server-route-refuses-an-anonymous-caller control=ROW-067.control.census-holds-the-D-029-routes-and-a-session-reads-the-team
import { test, expect, type APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  anonymousApi,
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
  type AccountId,
  type Actor,
  type Install,
  type Member,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

// The mounted tree's root (docker-compose.test.yml mounts it at /app, the working directory).
const ROOT = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', '..') : process.cwd();

interface Route {
  method: string | null; // null: the file declares no method, so it answers every method
  pattern: string; // /api/admin/accounts/:id/switch ; '**' for a catch-all
  file: string;
}

const METHOD = /^(.*)\.(get|post|put|patch|delete|head|options)$/i;
const CODE = /\.(ts|js|mjs|cjs|mts|cts)$/;

function segment(name: string): string {
  if (/^\[\.\.\.[^\]]*\]$/.test(name)) return '**';
  return name.replace(/\[\[?([^\]]+?)\]?\]/g, ':$1');
}

function walk(abs: string, url: string, rel: string, out: Route[]): void {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const childAbs = path.join(abs, e.name);
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      walk(childAbs, `${url}/${segment(e.name)}`, childRel, out);
      continue;
    }
    if (!e.isFile() || !CODE.test(e.name) || e.name.endsWith('.d.ts')) continue;
    const base = e.name.replace(CODE, '');
    const m = base.match(METHOD);
    const stem = m ? m[1] : base;
    const pattern = stem === 'index' ? url || '/' : `${url}/${segment(stem)}`;
    out.push({ method: m ? m[2].toUpperCase() : null, pattern, file: childRel });
  }
}

/** Every route the server's route folders declare, from their file names (Nitro's file-route convention). */
function census(): Route[] {
  const out: Route[] = [];
  for (const [dir, prefix] of [
    ['server/api', '/api'],
    ['server/routes', ''],
  ] as const) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs, prefix, dir, out);
  }
  return out;
}

function matches(route: Route, method: string, concrete: string): boolean {
  if (route.method !== null && route.method !== method) return false;
  const re = new RegExp(
    '^' +
      route.pattern
        .split('/')
        .map((s) => (s === '**' ? '.*' : s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/') +
      '/?$',
  );
  return re.test(concrete);
}

// D-029's routes, outside the control door: the census must hold each (the floor), never the list probed.
const D029: [string, string][] = [
  ['POST', '/api/auth/sign-out'],
  ['GET', '/api/me'],
  ['POST', '/api/me/password'],
  ['GET', '/api/requests'],
  ['POST', '/api/requests'],
  ['POST', '/api/requests/X/cancel'],
  ['GET', '/api/balance'],
  ['GET', '/api/calendar'],
  ['GET', '/api/admin/pending'],
  ['GET', '/api/admin/people'],
  ['GET', '/api/admin/people/X/requests'],
  ['GET', '/api/admin/people/X/history'],
  ['POST', '/api/admin/accounts'],
  ['POST', '/api/admin/accounts/X/name'],
  ['POST', '/api/admin/accounts/X/email'],
  ['POST', '/api/admin/accounts/X/password'],
  ['POST', '/api/admin/accounts/X/allowance'],
  ['POST', '/api/admin/accounts/X/switch'],
];

const EXCLUDED = (r: Route) => r.pattern.startsWith('/api/__test');
const STATUS_EXEMPT = (r: Route) => ['/api/auth/sign-in', '/api/auth/sign-out', '/api/health'].includes(r.pattern);

interface World {
  install: Install;
  admin: Actor;
  member: Member;
  memberActor: Actor;
  requestId: AccountId;
  approveToken: string;
  switchToken: string;
}

let world: World | undefined;
test.afterEach(async () => {
  await world?.admin.dispose().catch(() => undefined);
  await world?.memberActor.dispose().catch(() => undefined);
  world = undefined;
});

async function build(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = await signIn(install.admin);
  const member = await createMember(admin);
  const memberActor = await signInMember(member);
  const requestId = await sendRequest(memberActor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
  const approveToken = (await readEffect(admin, 'approve', requestId)).token;
  const switchToken = (await readEffect(admin, 'switch-off', member.id)).token;
  world = { install, admin, member, memberActor, requestId, approveToken, switchToken };
  return world;
}

async function getJson(api: APIRequestContext, url: string, row: string): Promise<unknown> {
  const res = await api.get(url);
  expect(res.status(), `${row}: GET ${url} answers its signed-in caller`).toBe(200);
  return res.json();
}

async function snapshot(w: World): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(String(w.member.id));
  return {
    people: await getJson(w.admin.api, '/api/admin/people', 'ROW-067 snapshot'),
    pending: await getJson(w.admin.api, '/api/admin/pending', 'ROW-067 snapshot'),
    personRequests: await getJson(w.admin.api, `/api/admin/people/${id}/requests`, 'ROW-067 snapshot'),
    memberRequests: await getJson(w.memberActor.api, '/api/requests', 'ROW-067 snapshot'),
    memberBalance: await getJson(w.memberActor.api, '/api/balance', 'ROW-067 snapshot'),
  };
}

function concreteUrl(route: Route, w: World): string {
  const parts = route.pattern.split('/');
  return parts
    .map((s, i) => {
      if (s === '**') return 'x';
      if (!s.startsWith(':')) return s;
      const before = parts.slice(0, i).join('/');
      return encodeURIComponent(String(/request/i.test(before) ? w.requestId : w.member.id));
    })
    .join('/');
}

test('ROW-067.control.census-holds-the-D-029-routes-and-a-session-reads-the-team', async () => {
  const w = await build();
  const routes = census();
  const missing = D029.filter(([m, p]) => !routes.some((r) => matches(r, m, p))).map(([m, p]) => `${m} ${p.replace(/X/g, ':id')}`);
  expect(missing, 'ROW-067 control: the route-folder census holds every D-029 route').toEqual([]);
  const people = await w.admin.api.get('/api/admin/people');
  expect(people.status(), 'ROW-067 control: the admin reads the people list').toBe(200);
  expect(await people.text(), 'ROW-067 control: the people list carries the member\'s fresh name').toContain(w.member.name);
});

test('ROW-067.REQ-014.every-server-route-refuses-an-anonymous-caller', async () => {
  const w = await build();
  const routes = census().filter((r) => !EXCLUDED(r));
  expect(routes.length, 'ROW-067: the route-folder census found routes to probe').toBeGreaterThan(0);
  const before = await snapshot(w);
  const secrets = [w.member.name, w.member.email, w.install.admin.name, w.install.admin.email].map((s) => s.toLowerCase());
  const written = { name: freshName('Anon'), email: freshEmail('anon') };

  const anon = await anonymousApi();
  try {
    for (const route of routes) {
      const methods = route.method === null ? ['GET', 'POST'] : [route.method];
      const url = concreteUrl(route, w);
      for (const method of methods) {
        const isRequestRoute = /\/requests?\b/.test(route.pattern);
        const data = {
          name: written.name,
          email: written.email,
          password: freshPassword(),
          allowance: 7,
          startsNextYear: false,
          on: false,
          token: isRequestRoute ? w.approveToken : w.switchToken,
          current: w.member.password,
          next: freshPassword(),
          kind: 'vacation',
          firstDay: '2027-03-22',
          lastDay: '2027-03-24',
        };
        const target = method === 'GET' || method === 'HEAD' ? `${url}?year=2027&month=3&action=approve` : url;
        const res = await anon.fetch(target, method === 'GET' || method === 'HEAD' ? { method } : { method, data });
        const label = `ROW-067 ${method} ${route.pattern} (${route.file})`;
        if (!STATUS_EXEMPT(route)) {
          expect.soft([401, 403], `${label}: refused to an anonymous caller (answered ${res.status()})`).toContain(res.status());
        }
        const body = (await res.text().catch(() => '')).toLowerCase();
        const leaked = secrets.filter((s) => body.includes(s));
        expect.soft(leaked, `${label}: no team data in the answer`).toEqual([]);
      }
    }
  } finally {
    await anon.dispose();
  }

  const after = await snapshot(w);
  expect.soft(after, 'ROW-067: no anonymous call changed any record').toEqual(before);
  expect.soft(JSON.stringify(after.people).toLowerCase().includes(written.email), 'ROW-067: no account was created').toBe(false);
  expect.soft((await w.admin.api.get('/api/me')).status(), 'ROW-067: the admin\'s session still works').toBe(200);
  expect.soft((await w.memberActor.api.get('/api/me')).status(), 'ROW-067: the member\'s session still works').toBe(200);
});
