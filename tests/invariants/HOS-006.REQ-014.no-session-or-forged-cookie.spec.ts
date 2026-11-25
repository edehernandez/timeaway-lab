// Purpose: hostility probe HOS-006 (protects REQ-014) — without signing in, every page and every API address, with no cookie and with forged session cookies, shows no page content, sends no data and changes nothing.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); the address list is read at run time from the names of the files under server/api and server/routes (route-census.ts, names only), the pages from D-029 (harness.ts PAGES, the route table's eight pages); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approve, effect tokens), fresh per run.
//
// Boundary (R6): the session rule is proved at the HTTP harness for every API address, and in the browser for the
// pages, since a page is what a person without a session would see.
//
// HOS-006 promise: REQ-014 fail-if (1) "someone who is not signed in sees any page's content or any data other than
// HOS-006   the sign-in page, or causes any action's effect"; D-032 (a session is a server-side row found by its
// HOS-006   identifier's SHA-256, the identifier 43 base64url characters in its cookie); D-035 (every route checks the
// HOS-006   session first; a page with no session goes to /sign-in).
// HOS-006 wrong product: one route whose session check was skipped (the probe's own toggle) — say GET /api/calendar
// HOS-006   answering the month's names to anyone, or POST /api/admin/requests/:id/approve acting on a valid token;
// HOS-006   a session lookup that accepts any well-formed cookie, a prefix of a real identifier, or the stored hash
// HOS-006   itself sent as the cookie; a page that renders its signed-in shell for a cookie it cannot find.
// HOS-006 given: a fresh install at Mon 2027-03-08 (Pacific/Auckland); the admin and a member M (fresh names and
// HOS-006   emails); M's approved vacation 22-23 March (so the March calendar names M) and M's pending vacation 15-17
// HOS-006   March; a real approve token for the pending request and a real switch-off token for M, read by the admin;
// HOS-006   the admin's real session cookie, from which the forgeries are made.
// HOS-006 when: every census route, with every method it answers, is called with no cookie and with each forged
// HOS-006   cookie (same names: a random value of the real one's length, the real value with its last character
// HOS-006   changed, its SHA-256 in hex and in base64url, an empty value), dynamic segments filled with the real ids,
// HOS-006   writes carrying a complete body with the real token; every page is loaded in a browser with no cookie, a
// HOS-006   random forgery and the near miss.
// HOS-006 then: every API answer is 401 or 403 (sign-in, sign-out and health are read for leaks only) and carries
// HOS-006   none of the four fresh names and emails; every page ends on /sign-in (or answers 401/403), no answer the
// HOS-006   browser received carries a fresh name or email, and no sign-out control is drawn; afterwards the people
// HOS-006   list, the pending list, M's requests and M's balance are deep-equal to before and both real sessions work.
// HOS-006 controls: the control case shows the census holds D-029's routes, and that the SAME doors carry a real
// HOS-006   session: the admin's real cookie replayed on a fresh client reads the people list with M's email, and a
// HOS-006   browser holding it opens /admin/people (not /sign-in) and shows M's email; and the forgeries differ from
// HOS-006   the real value.
// HOS-006 technique: a census over the route folder (a property over every route, the probe's "every address"),
// HOS-006   real ids and tokens so a skipped check reaches the effect, near-miss forgeries of a real identifier, and a
// HOS-006   deep-equal before/after of the state.
// HOS-006 cases: HOS-006 target=HOS-006.REQ-014.no-page-content-data-or-change-without-a-session-or-with-a-forged-cookie control=HOS-006.control.the-same-doors-carry-a-real-session-and-the-census-holds-D-029
import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import {
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  PAGES,
  productUrl,
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
import {
  capturePageLoad,
  concreteAddress,
  cookieHeader,
  floorMissing,
  forgedLike,
  holdsText,
  isControlDoor,
  methodsOf,
  nearMiss,
  replay,
  routeCensus,
  sessionCookies,
  storedForms,
  type CookiePair,
} from './route-census';
import { signOutControls } from './page-reading';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

interface World {
  install: Install;
  admin: Actor;
  member: Member;
  memberActor: Actor;
  pendingId: AccountId;
  approveToken: string;
  switchToken: string;
  adminCookies: CookiePair[];
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
  await approve(admin, await sendRequest(memberActor, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }));
  const pendingId = await sendRequest(memberActor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' });
  const approveToken = (await readEffect(admin, 'approve', pendingId)).token;
  const switchToken = (await readEffect(admin, 'switch-off', member.id)).token;
  const adminCookies = await sessionCookies(admin);
  world = { install, admin, member, memberActor, pendingId, approveToken, switchToken, adminCookies };
  return world;
}

/** The forged cookie headers: the real cookies' names, each value replaced as labelled. */
function forgeries(real: CookiePair[]): { label: string; cookie: string }[] {
  const each = (f: (v: string) => string) => cookieHeader(real.map((c) => ({ name: c.name, value: f(c.value) })));
  return [
    { label: 'a random value of the real length', cookie: each((v) => forgedLike(v)) },
    { label: 'the real value with its last character changed', cookie: each((v) => nearMiss(v)) },
    { label: "the real value's SHA-256 in hex", cookie: each((v) => storedForms(v).hex) },
    { label: "the real value's SHA-256 in base64url", cookie: each((v) => storedForms(v).b64url) },
    { label: 'an empty value', cookie: each(() => '') },
  ];
}

async function getJson(api: APIRequestContext, url: string): Promise<unknown> {
  const res = await api.get(url);
  expect(res.status(), `HOS-006 snapshot: GET ${url} answers its signed-in caller`).toBe(200);
  return res.json();
}

async function snapshot(w: World): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(String(w.member.id));
  return {
    people: await getJson(w.admin.api, '/api/admin/people'),
    pending: await getJson(w.admin.api, '/api/admin/pending'),
    personRequests: await getJson(w.admin.api, `/api/admin/people/${id}/requests`),
    memberRequests: await getJson(w.memberActor.api, '/api/requests'),
    memberBalance: await getJson(w.memberActor.api, '/api/balance'),
  };
}

const STATUS_EXEMPT = ['/api/auth/sign-in', '/api/auth/sign-out', '/api/health'];

async function openWithCookies(browser: Browser, cookies: CookiePair[] | null) {
  const context = await browser.newContext({ baseURL: productUrl() });
  if (cookies !== null) await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: productUrl() })));
  const page = await context.newPage();
  return { context, page };
}

test('HOS-006.control.the-same-doors-carry-a-real-session-and-the-census-holds-D-029', async ({ browser }) => {
  const w = await build();
  expect(floorMissing(routeCensus()), 'HOS-006 control: the route-folder census holds every D-029 route').toEqual([]);

  const real = cookieHeader(w.adminCookies);
  for (const f of forgeries(w.adminCookies)) expect(f.cookie, `HOS-006 control: the forgery "${f.label}" differs from the real cookie`).not.toBe(real);

  const people = await replay(real, 'GET', '/api/admin/people');
  expect(people.status, 'HOS-006 control: the real cookie replayed on a fresh client reads the people list').toBe(200);
  expect(holdsText(people.body, w.member.email), "HOS-006 control: the people list carries M's fresh email").toBe(true);

  const { context, page } = await openWithCookies(browser, w.adminCookies);
  try {
    const load = await capturePageLoad(page, PAGES.adminPeople);
    expect(load.finalPath, 'HOS-006 control: a browser holding the real cookie stays on /admin/people').toBe(PAGES.adminPeople);
    await expect
      .poll(async () => holdsText(await page.locator('body').innerText(), w.member.email), {
        message: "HOS-006 control: the page shows M's fresh email",
        timeout: 10_000,
      })
      .toBe(true);
  } finally {
    await context.close();
  }
});

test('HOS-006.REQ-014.no-page-content-data-or-change-without-a-session-or-with-a-forged-cookie', async ({ browser }) => {
  test.setTimeout(400_000);
  const w = await build();
  const routes = routeCensus().filter((r) => !isControlDoor(r));
  expect(routes.length, 'HOS-006 (setup): the route-folder census found routes to probe').toBeGreaterThan(0);
  const before = await snapshot(w);
  const secrets = [w.member.name, w.member.email, w.install.admin.name, w.install.admin.email];
  const written = { name: freshName('Anon'), email: freshEmail('anon') };
  const cookies: { label: string; cookie: string | null }[] = [{ label: 'no cookie', cookie: null }, ...forgeries(w.adminCookies)];

  // Every API address, every method, every cookie.
  for (const route of routes) {
    const url = concreteAddress(route.pattern, { request: w.pendingId, account: w.member.id });
    for (const method of methodsOf(route)) {
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
        firstDay: '2027-04-19',
        lastDay: '2027-04-21',
      };
      const target = method === 'GET' || method === 'HEAD' ? `${url}?year=2027&month=3&action=approve` : url;
      for (const c of cookies) {
        const a = await replay(c.cookie, method, target, data);
        const label = `HOS-006 ${method} ${route.pattern} (${route.file}) with ${c.label}`;
        if (!STATUS_EXEMPT.includes(route.pattern)) {
          expect.soft([401, 403], `${label}: refused (answered ${a.status})`).toContain(a.status);
        }
        const leaked = secrets.filter((s) => holdsText(a.body, s));
        expect.soft(leaked, `${label}: no team data in the answer`).toEqual([]);
      }
    }
  }

  // Every page, in a browser, with no cookie, a random forgery and the near miss.
  const pageCookies: { label: string; cookies: CookiePair[] | null }[] = [
    { label: 'no cookie', cookies: null },
    { label: 'a random forgery', cookies: w.adminCookies.map((c) => ({ name: c.name, value: forgedLike(c.value) })) },
    { label: 'the near miss', cookies: w.adminCookies.map((c) => ({ name: c.name, value: nearMiss(c.value) })) },
  ];
  const pages = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password, PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(w.member.id), PAGES.signIn];
  for (const pc of pageCookies) {
    const { context, page } = await openWithCookies(browser, pc.cookies);
    try {
      for (const address of pages) {
        const load = await capturePageLoad(page, address);
        const label = `HOS-006 page ${address} with ${pc.label}`;
        const refused = load.finalPath === PAGES.signIn || [401, 403].includes(load.status);
        expect.soft(refused, `${label}: shows the sign-in page or a refusal (answered ${load.status}, ended on ${load.finalPath})`).toBe(true);
        const bodies = [...load.received.map((r) => r.body), load.dom];
        const leaked = secrets.filter((s) => bodies.some((b) => holdsText(b, s)));
        expect.soft(leaked, `${label}: no team data in the page or in any answer received while loading`).toEqual([]);
        expect.soft(await signOutControls(page).count(), `${label}: no signed-in shell (no sign-out control)`).toBe(0);
      }
    } finally {
      await context.close();
    }
  }

  const after = await snapshot(w);
  expect.soft(after, 'HOS-006: no call without a real session changed any record').toEqual(before);
  expect.soft(holdsText(JSON.stringify(after.people), written.email), 'HOS-006: no account was created').toBe(false);
  expect.soft((await w.admin.api.get('/api/me')).status(), "HOS-006: the admin's real session still works").toBe(200);
  expect.soft((await w.memberActor.api.get('/api/me')).status(), "HOS-006: the member's real session still works").toBe(200);
});
