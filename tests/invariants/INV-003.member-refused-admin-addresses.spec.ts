// Purpose: ledger test for ROW-118 (INV-003, REQ-020, REQ-021) — a team member sees no link or control to pending requests, people or another person's requests; opening those pages directly shows a refusal with no admin data; and every address found from the server's route folder, admin reads included, refuses the member or answers only the member's own data plus the calendar's away entries.
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create accounts, own password change, send, approve), fresh per run.
//
// ROW-118 promise: INV-003 "a person ... sees only their own requests and days left, apart from the calendar's away
// ROW-118   entries, which carry no kind; a refused attempt changes nothing"; REQ-020 fail-if (4) "anyone but the admin
// ROW-118   sees any account's email, switched-on state, allowance or days left ... or starts any of the page's account
// ROW-118   actions"; REQ-021 fail-if (5) "anyone but the admin sees another person's requests, by a page or by any data
// ROW-118   the product sends them, or cancels another person's request"; D-027 (an away entry carries the display name,
// ROW-118   an optional opaque account id and the days, nothing else). Admin addresses from D-029 (/admin/pending,
// ROW-118   /admin/people, /admin/people/:id and every /api/admin route).
// ROW-118 wrong product: a header that hides the admin links but /admin/people still renders the table for anyone
// ROW-118   signed in; GET /api/admin/people/:id/requests guarded on the page but not on the API; a new admin route
// ROW-118   added later without the admin check (only a census of the route folder sees it); a member who can POST
// ROW-118   /api/requests/<another's id>/cancel; a calendar that sends {name, accountId, kind} or the email.
// ROW-118 given: a fresh install; the member under test (own pending vacation 12–13 April, own approved vacation 10
// ROW-118   March) and another member (pending vacation 24–25 May, approved sick 17 March), all 2027, clock 1 March
// ROW-118   2027 in Pacific/Auckland. The other member's email, the admin's email, and the other member's pending
// ROW-118   days are secrets everywhere; the other member's name and approved day are allowed only on the calendar.
// ROW-118 when: (pages) the member's browser loads each own page, then each admin page directly; (census) the
// ROW-118   member's session calls every route of D-029's list united with every file under server/api and
// ROW-118   server/routes (file names only), dynamic segments filled with the other member's ids, bodies empty.
// ROW-118 then: no link on the member's pages leads under /admin and no control is named for pending requests or
// ROW-118   people; each admin page shows a refusal (a 401/403/404 answer, a redirect away, or a refusal message) and
// ROW-118   neither its document nor any response received while loading carries a secret; every admin route answers
// ROW-118   401, 403 or 404 with no secret; every other route answers without a secret (the calendar may carry the
// ROW-118   other's name and day), and one that acts on another's record is refused (4xx); the calendar's entries
// ROW-118   carry only date / name / accountId and no kind; afterwards nothing of the other member changed — same
// ROW-118   sign-in, same name, same balance, still away on 17 March.
// ROW-118 controls: the admin's own session gets the other member's email from GET /api/admin/people and the
// ROW-118   other's name from GET /api/admin/pending — the secrets exist and admin routes do serve them.
// ROW-118 technique: a census over the route folder, not a hand-written list (the row's case), with D-029's list
// ROW-118   as its floor; fresh values as the secrets; a before-and-after integrity read for "a refused attempt
// ROW-118   changes nothing"; soft assertions naming the route so every route is evaluated in the one target case.
// ROW-118 cases: ROW-118 target=ROW-118.INV-003.member-sees-no-admin-link-and-every-admin-address-refuses-without-admin-data control=ROW-118.control.admin-routes-serve-the-secrets-to-the-admin
import { test, expect, type APIResponse, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  approve,
  createMember,
  openPage,
  PAGES,
  productUrl,
  readBalance,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Balance,
  type Install,
  type Member,
} from './harness';
import { hasDate, readLinks } from './page-reading';

const T0 = '2027-02-28T20:00:00Z'; // 2027-03-01 09:00 in Pacific/Auckland; the UTC date differs
const OTHER_PENDING = { kind: 'vacation' as const, firstDay: '2027-05-24', lastDay: '2027-05-25' };
const OTHER_APPROVED = { kind: 'sick' as const, firstDay: '2027-03-17', lastDay: '2027-03-17' };
const OWN_PENDING = { kind: 'vacation' as const, firstDay: '2027-04-12', lastDay: '2027-04-13' };
const OWN_APPROVED = { kind: 'vacation' as const, firstDay: '2027-03-10', lastDay: '2027-03-10' };

let install: Install;
let admin: Actor;
let member: Member;
let other: Member;
let memberActor: Actor;
let otherPendingId: AccountId;
let otherApprovedId: AccountId;

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  member = await createMember(admin);
  other = await createMember(admin);
  memberActor = await signInMember(member);
  const otherActor = await signInMember(other);
  try {
    otherPendingId = await sendRequest(otherActor, OTHER_PENDING);
    otherApprovedId = await sendRequest(otherActor, OTHER_APPROVED);
    await approve(admin, otherApprovedId);
    await sendRequest(memberActor, OWN_PENDING);
    await approve(admin, await sendRequest(memberActor, OWN_APPROVED));
  } finally {
    await otherActor.dispose();
  }
});

test.afterAll(async () => {
  await memberActor?.dispose();
  await admin?.dispose();
});

interface Route {
  method: string;
  path: string;
  from: string;
}

/** D-029's routes a signed-in session can call (the census floor); the control door, sign-in/out and health are left out. */
const D029: Route[] = [
  ['GET', '/api/me'],
  ['POST', '/api/me/password'],
  ['GET', '/api/requests'],
  ['POST', '/api/requests'],
  ['POST', '/api/requests/:id/cancel'],
  ['GET', '/api/balance'],
  ['GET', '/api/calendar'],
  ['GET', '/api/admin/pending'],
  ['GET', '/api/admin/people'],
  ['GET', '/api/admin/people/:id/requests'],
  ['GET', '/api/admin/people/:id/history'],
  ['POST', '/api/admin/accounts'],
  ['POST', '/api/admin/accounts/:id/name'],
  ['POST', '/api/admin/accounts/:id/email'],
  ['POST', '/api/admin/accounts/:id/password'],
  ['POST', '/api/admin/accounts/:id/allowance'],
  ['POST', '/api/admin/accounts/:id/switch'],
  ['GET', '/api/admin/accounts/:id/effect'],
  ['GET', '/api/admin/requests/:id/effect'],
  ['POST', '/api/admin/requests/:id/approve'],
  ['POST', '/api/admin/requests/:id/reject'],
  ['POST', '/api/admin/requests/:id/cancel'],
].map(([method, p]) => ({ method, path: p, from: 'D-029' }));

/** Every route file under server/api and server/routes (names only), read by Nitro's file-route convention. */
function folderRoutes(): Route[] {
  const out: Route[] = [];
  for (const [dir, prefix] of [
    ['api', '/api'],
    ['routes', ''],
  ] as const) {
    const root = path.resolve(__dirname, '..', '..', 'server', dir);
    if (!fs.existsSync(root)) continue;
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|js|mjs|cjs)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
        let rel = path.relative(root, full).replace(/\\/g, '/').replace(/\.(ts|js|mjs|cjs)$/, '');
        let method = 'GET';
        const m = rel.match(/\.(get|post|put|patch|delete|head|options)$/i);
        if (m) {
          method = m[1].toUpperCase();
          rel = rel.slice(0, -m[0].length);
        }
        const segs = rel
          .split('/')
          .filter((s) => !/^\(.*\)$/.test(s))
          .map((s) => s.replace(/^\[\.\.\.([^\]]*)\]$/, 'any').replace(/\[([^\]]*)\]/g, ':$1'))
          .filter((s, i, a) => !(s === 'index' && i === a.length - 1));
        out.push({ method, path: `${prefix}/${segs.join('/')}`.replace(/\/+$/, '') || '/', from: `server/${dir}` });
      }
    };
    walk(root);
  }
  return out;
}

function censusRoutes(): Route[] {
  const seen = new Set<string>();
  const all: Route[] = [];
  for (const r of [...D029, ...folderRoutes()]) {
    if (r.path.startsWith('/api/__test') || r.path.startsWith('/api/auth/') || r.path === '/api/auth' || r.path === '/api/health') continue;
    const key = `${r.method} ${r.path.replace(/:[^/]+/g, ':')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(r);
  }
  return all;
}

const isAdminRoute = (p: string) => /^\/(api\/)?admin(\/|$)/.test(p);
const isCalendarRoute = (p: string) => /^\/api\/calendar(\/|$)/.test(p);

/** The concrete address a route is probed at: dynamic segments filled with the OTHER member's ids. */
function addressOf(route: Route): string {
  const segs = route.path.split('/');
  const filled = segs.map((s, i) => {
    if (!s.startsWith(':')) return s;
    return encodeURIComponent(String(segs[i - 1] === 'requests' ? otherPendingId : other.id));
  });
  let address = filled.join('/');
  if (address.endsWith('/effect')) address += route.path.includes('/requests/') ? '?action=approve' : '?action=switch-off';
  return address;
}

function secretsFor(routePath: string): string[] {
  const always = [other.email, install.admin.email, OTHER_PENDING.firstDay, OTHER_PENDING.lastDay];
  return isCalendarRoute(routePath) ? always : [...always, other.name, OTHER_APPROVED.firstDay];
}

function leaked(body: string, secrets: string[]): string[] {
  const lower = body.toLowerCase();
  return secrets.filter((s) => lower.includes(s.toLowerCase()));
}

async function text(res: APIResponse): Promise<string> {
  return res.text().catch(() => '');
}

interface Integrity {
  name: string;
  isAdmin: boolean;
  balance: Balance;
  awayOn17: boolean;
}

/** What the other member's own session reads: a fresh sign-in (same email and password), its name, its balance, and its away entry on 17 March. */
async function readOther(): Promise<Integrity> {
  const session = await signIn({ email: other.email, password: other.password });
  try {
    const cal = await session.api.get('/api/calendar?year=2027&month=3');
    const days = ((await cal.json().catch(() => ({}))) as { days?: { date: string; people: { name: string }[] }[] }).days ?? [];
    return {
      name: session.me.name,
      isAdmin: session.me.isAdmin,
      balance: await readBalance(session),
      awayOn17: days.some((d) => d.date === OTHER_APPROVED.firstDay && d.people.some((p) => p.name === other.name)),
    };
  } finally {
    await session.dispose();
  }
}

async function loadCapturing(page: Page, address: string): Promise<{ status: number; bodies: string[]; finalPath: string; visible: string }> {
  const origin = new URL(productUrl()).origin;
  const pending: Promise<string>[] = [];
  const onResponse = (res: { url(): string; text(): Promise<string> }) => {
    if (new URL(res.url()).origin === origin) pending.push(res.text().catch(() => ''));
  };
  page.on('response', onResponse);
  const response = await page.goto(address);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  page.off('response', onResponse);
  const bodies = await Promise.all(pending);
  bodies.push(await page.content());
  const visible = await page.locator('body').innerText().catch(() => '');
  return { status: response?.status() ?? 0, bodies, finalPath: new URL(page.url()).pathname, visible };
}

const REFUSAL_TEXT = /not allowed|forbidden|no access|access denied|only the admin|admins? only|not authori[sz]ed|unauthori[sz]ed|permission|not found/i;

test('ROW-118.control.admin-routes-serve-the-secrets-to-the-admin', async () => {
  const people = await admin.api.get('/api/admin/people');
  expect(people.status(), 'ROW-118 control: GET /api/admin/people answers the admin').toBe(200);
  expect((await text(people)).toLowerCase(), 'ROW-118 control: the people data carries the other member\'s email').toContain(other.email.toLowerCase());
  const pending = await admin.api.get('/api/admin/pending');
  expect(pending.status(), 'ROW-118 control: GET /api/admin/pending answers the admin').toBe(200);
  expect(await text(pending), 'ROW-118 control: the pending data carries the other member\'s name').toContain(other.name);
});

test('ROW-118.INV-003.member-sees-no-admin-link-and-every-admin-address-refuses-without-admin-data', async ({ browser }) => {
  const before = await readOther();
  expect(before.awayOn17, 'ROW-118 (setup): the other member is away on 17 March before the probes').toBe(true);

  // Pages: no admin link or control on the member's own pages; the admin pages refuse with no admin data.
  const opened = await openPage(browser, memberActor);
  const page = opened.page;
  try {
    for (const address of [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password]) {
      await loadCapturing(page, address);
      const links = (await readLinks(page)).filter((l) => /^\/admin(\/|$)/.test(l.path)).map((l) => `${l.text} -> ${l.path}`);
      expect.soft(links, `ROW-118 ${address}: no link to an admin page`).toEqual([]);
      const controls = await page.locator('a, button, [role="link"], [role="button"], input[type="submit"]').evaluateAll((els) =>
        els
          .map((el) => `${(el as HTMLElement).innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('value') || ''}`.replace(/\s+/g, ' ').trim())
          .filter((t) => /pending requests|\bpeople\b|\badmin\b/i.test(t)),
      );
      expect.soft(controls, `ROW-118 ${address}: no control named for pending requests, people or admin`).toEqual([]);
    }
    const pageSecrets = [other.email, install.admin.email, other.name, OTHER_PENDING.firstDay];
    for (const address of [PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(other.id)]) {
      const { status, bodies, finalPath, visible } = await loadCapturing(page, address);
      expect.soft(status, `ROW-118 ${address}: not a server error`).toBeLessThan(500);
      const refused = [401, 403, 404].includes(status) || finalPath !== address || REFUSAL_TEXT.test(visible);
      expect.soft(refused, `ROW-118 ${address}: the member is shown a refusal (answered ${status}, at ${finalPath})`).toBe(true);
      const found = pageSecrets.filter((s) => bodies.some((b) => b.toLowerCase().includes(s.toLowerCase())));
      expect.soft(found, `ROW-118 ${address}: no admin data in the page or any response while loading`).toEqual([]);
      expect.soft(hasDate(visible, OTHER_PENDING.firstDay), `ROW-118 ${address}: the other member's pending day is not drawn`).toBe(false);
    }
  } finally {
    await opened.close();
  }

  // Census: every route of D-029 and of the server's route folder, called on the member's session.
  const routes = censusRoutes();
  test.info().annotations.push({ type: 'ROW-118 census', description: routes.map((r) => `${r.method} ${r.path} (${r.from})`).join('; ') });
  for (const route of routes) {
    const address = addressOf(route);
    const label = `ROW-118 ${route.method} ${route.path} (${route.from}) as ${address}`;
    const res =
      route.method === 'GET'
        ? await memberActor.api.get(address)
        : await memberActor.api.fetch(address, { method: route.method, data: {} });
    const status = res.status();
    const body = await text(res);
    expect.soft(leaked(body, secretsFor(route.path)), `${label}: carries no admin data or another person's data`).toEqual([]);
    if (isAdminRoute(route.path)) {
      expect.soft([401, 403, 404], `${label}: an admin route refuses the member (answered ${status})`).toContain(status);
    } else if (route.method === 'GET') {
      expect.soft(status, `${label}: not a server error`).toBeLessThan(500);
    } else if (route.path.includes(':')) {
      expect.soft(status >= 400 && status < 500, `${label}: acting on another person's record is refused (answered ${status})`).toBe(true);
    }
  }

  // The calendar's away entries: date, name, an optional account id, nothing else; no kind.
  const cal = await memberActor.api.get('/api/calendar?year=2027&month=3');
  expect.soft(cal.status(), 'ROW-118 GET /api/calendar?year=2027&month=3: answers the member').toBe(200);
  const calBody = await text(cal);
  expect.soft(/\b(vacation|sick)\b/i.test(calBody), 'ROW-118 calendar: carries no kind of absence').toBe(false);
  let days: Record<string, unknown>[] = [];
  try {
    days = ((JSON.parse(calBody || '{}') as { days?: Record<string, unknown>[] }).days ?? []) as Record<string, unknown>[];
  } catch {
    expect.soft(false, 'ROW-118 calendar: answers JSON').toBe(true);
  }
  expect.soft(days.length, 'ROW-118 calendar: carries the month\'s days').toBeGreaterThan(0);
  const extraDayKeys = [...new Set(days.flatMap((d) => Object.keys(d).filter((k) => k !== 'date' && k !== 'people')))];
  expect.soft(extraDayKeys, 'ROW-118 calendar: a day carries only its date and its people').toEqual([]);
  const entries = days.flatMap((d) => (Array.isArray(d.people) ? (d.people as Record<string, unknown>[]) : []));
  const extraEntryKeys = [...new Set(entries.flatMap((e) => Object.keys(e).filter((k) => k !== 'name' && k !== 'accountId')))];
  expect.soft(extraEntryKeys, 'ROW-118 calendar: an away entry carries only the name and an optional account id').toEqual([]);

  // A refused attempt changes nothing.
  const after = await readOther();
  expect.soft(after, 'ROW-118: nothing of the other member changed (sign-in, name, balance, away day)').toEqual(before);
  const me = await admin.api.get('/api/me');
  expect.soft(me.status(), 'ROW-118: the admin session still works').toBe(200);
});
