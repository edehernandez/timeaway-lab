// Purpose: ledger tests for ROW-239, ROW-240 and ROW-241 (REQ-014) — a session is renewed at sign-in, stays ended after a switch-off even when the account is switched back on, and its identifier cannot be guessed or forged with any default value; a fresh sign-in after switch-on works; the session cookie cannot be read by page scripts, is not sent to other sites, never appears in a URL, and the return address after sign-in never leads to another site.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, sign-in, switch off and on), fresh per run.
//
// Boundary (R6): identifier rules (renewal, replay, forgery) are proved at the HTTP harness with cookie jars built by
// hand (Playwright storage state), so a product cannot hide a live server-side session (D-003) behind a cleared
// cookie; the cookie's attributes, page-script access, URLs and the return address are browser behaviour, proved in
// the browser with the person signing in through the sign-in page itself. The session cookies are LEARNED: the
// product's cookies that a sign-in sets or changes, so no cookie name is imposed on the product.
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { createMember, productUrl, signIn, switchAccount, type Member } from './harness';
import {
  catchOtherSite,
  disposeAll,
  freshTeam,
  keep,
  OTHER_SITE,
  productOrigin,
  settle,
  submitSignIn,
  waitForSession,
} from './robustness';

test.afterEach(disposeAll);

type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None' };

const host = () => new URL(productUrl()).hostname;

async function jar(cookies: Cookie[] = []): Promise<APIRequestContext> {
  return keep(await playwrightRequest.newContext({ baseURL: productUrl(), storageState: { cookies, origins: [] } }));
}

async function cookiesOf(api: APIRequestContext): Promise<Cookie[]> {
  return (await api.storageState()).cookies as Cookie[];
}

async function signInOn(api: APIRequestContext, m: { email: string; password: string }): Promise<void> {
  await api.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } });
}

/** The cookies a sign-in set or changed on a jar that first visited /sign-in: the session's. */
async function learnSession(m: Member): Promise<{ api: APIRequestContext; before: Cookie[]; session: Cookie[] }> {
  const api = await jar();
  await api.get('/sign-in');
  await api.get('/api/me');
  const before = await cookiesOf(api);
  await signInOn(api, m);
  const after = await cookiesOf(api);
  const session = after.filter((c) => !before.some((b) => b.name === c.name && b.value === c.value));
  expect(session.length, 'setup: the sign-in sets a session cookie').toBeGreaterThan(0);
  return { api, before, session };
}

function planted(session: Cookie[], value: string): Cookie[] {
  return session.map((c) => ({ ...c, domain: host(), path: '/', expires: -1, value }));
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function b64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

// ---------------------------------------------------------------------------------------------------
// ROW-239 promise: the row — a session is renewed at sign-in, stays ended after a switch-off even when the account is
// ROW-239   switched back on, and session identifiers cannot be guessed or forged with any default value; REQ-014
// ROW-239   (a switched-off account's session ends at once), D-003 (server-side session rows, never signed tokens).
// ROW-239 wrong product: a sign-in that keeps the identifier the visitor already carried (session fixation); an
// ROW-239   identifier that is the account id, a counter or a timestamp; a stateless signed token whose secret has a
// ROW-239   default value, or that accepts alg "none"; a switch-off checked per request, so the old session revives at
// ROW-239   switch-on.
// ROW-239 given: member M, the admin. when: a jar that first visited /sign-in signs M in; a jar carrying a planted
// ROW-239   fresh identifier signs M in; the first jar signs in again; five fresh jars sign M in; jars carry forged
// ROW-239   values (empty, 0, 1, M's and the admin's ids, admin, null, undefined, true, default, secret, changeme,
// ROW-239   session, a real identifier with one character changed, cut short, lengthened, an alg-none token naming the
// ROW-239   admin); the admin switches M off and on and M's saved jar is replayed. then: the sign-in replaces any
// ROW-239   identifier carried before and the planted one; the planted one alone opens nothing; a second sign-in gives
// ROW-239   a new identifier; the five are distinct, at least 20 characters, not numbers, sharing no more than half
// ROW-239   their length as a prefix; no forged value opens /api/me or /api/admin/people; the replayed jar is refused.
// ROW-239 controls: the control case shows a real identifier, replayed in a fresh jar, opens /api/me — replaying
// ROW-239   carries a session, so every refusal in the target is the identifier's.
// ROW-239 technique: hand-built cookie jars (planted, forged, replayed) against learned cookie names; a property over
// ROW-239   five identifiers plus named forgeries.
// ROW-239 cases: ROW-239 target=ROW-239.REQ-014.identifiers-are-renewed-unguessable-unforgeable-and-stay-ended control=ROW-239.control.a-real-identifier-replayed-opens-the-session
test('ROW-239.control.a-real-identifier-replayed-opens-the-session', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const { session } = await learnSession(m);
  const replay = await jar(session);
  expect((await replay.get('/api/me')).status(), 'ROW-239 control: the replayed identifier opens the session').toBe(200);
});

test('ROW-239.REQ-014.identifiers-are-renewed-unguessable-unforgeable-and-stay-ended', async () => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const first = await learnSession(m);

  // Renewed at sign-in: what was carried before is replaced.
  for (const b of first.before) {
    const now = first.session.find((c) => c.name === b.name);
    if (now) expect.soft(now.value, `ROW-239: the sign-in renews the cookie ${b.name} carried before it`).not.toBe(b.value);
  }
  // Fixation: a planted identifier is replaced and opens nothing.
  const plantedValue = Buffer.from(`${Date.now()}-${Math.random()}`).toString('hex').slice(0, 40);
  const fixed = await jar(planted(first.session, plantedValue));
  await signInOn(fixed, m);
  const fixedAfter = await cookiesOf(fixed);
  for (const c of first.session) {
    expect.soft(fixedAfter.find((x) => x.name === c.name)?.value, `ROW-239: a planted ${c.name} is replaced at sign-in`).not.toBe(plantedValue);
  }
  expect.soft((await (await jar(planted(first.session, plantedValue))).get('/api/me')).status(), 'ROW-239: the planted identifier alone opens nothing').not.toBe(200);
  // A second sign-in on the same jar gives a new identifier.
  const firstValue = first.session[0].value;
  await signInOn(first.api, m);
  const second = (await cookiesOf(first.api)).find((c) => c.name === first.session[0].name)?.value;
  expect.soft(second, 'ROW-239: a second sign-in gives a new identifier').not.toBe(firstValue);

  // Unguessable: five identifiers.
  const values: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const api = await jar();
    await signInOn(api, m);
    const v = (await cookiesOf(api)).find((c) => c.name === first.session[0].name)?.value ?? '';
    values.push(decodeURIComponent(v));
  }
  expect.soft(new Set(values).size, 'ROW-239: five sign-ins give five different identifiers').toBe(5);
  for (const v of values) {
    expect.soft(v.length, `ROW-239: identifier "${v.slice(0, 12)}…" is at least 20 characters`).toBeGreaterThanOrEqual(20);
    expect.soft(/^\d+$/.test(v), `ROW-239: identifier "${v.slice(0, 12)}…" is not a number`).toBe(false);
  }
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      expect.soft(commonPrefix(values[i], values[j]), 'ROW-239: two identifiers share no more than half their length as a prefix').toBeLessThanOrEqual(Math.floor(values[i].length / 2));
    }
  }

  // Forged values open nothing.
  const real = decodeURIComponent(firstValue);
  const flip = (s: string) => s.slice(0, -1) + (s.endsWith('a') ? 'b' : 'a');
  const forged = [
    '', '0', '1', String(m.id), String(admin.me.id), 'admin', 'null', 'undefined', 'true', 'default', 'secret', 'changeme', 'session',
    flip(real), real.slice(0, -1), `${real}a`,
    `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ id: admin.me.id, sub: admin.me.id, isAdmin: true })}.`,
  ];
  for (const value of forged) {
    const api = await jar(planted(first.session, encodeURIComponent(value)));
    expect.soft((await api.get('/api/me')).status(), `ROW-239: the forged value "${value.slice(0, 24)}" opens no session`).not.toBe(200);
    expect.soft((await api.get('/api/admin/people')).status(), `ROW-239: the forged value "${value.slice(0, 24)}" opens no admin route`).not.toBe(200);
  }

  // Stays ended after switch-off, even when switched back on.
  const saved = await learnSession(m);
  const state = await cookiesOf(saved.api);
  await switchAccount(admin, m.id, false);
  await switchAccount(admin, m.id, true);
  expect.soft((await (await jar(state)).get('/api/me')).status(), 'ROW-239: the old session stays ended after switch-off and back on').not.toBe(200);
});

// ---------------------------------------------------------------------------------------------------
// ROW-240 promise: the row (control of ROW-239) — a fresh sign-in after switch-on works; REQ-014, REQ-016 (switching
// ROW-240   back on restores sign-in).
// ROW-240 wrong product: a switch-off that ends sessions by blocking the account's identifier space (or a flag never
// ROW-240   cleared), so after switch-on the account can never sign in again.
// ROW-240 given: member M switched off, then back on. when: M signs in with its password. then: a session of M.
// ROW-240 controls: the control case signs M in before the switch-off.
// ROW-240 technique: before/after around off and on with the same credentials.
// ROW-240 cases: ROW-240 target=ROW-240.REQ-014.a-fresh-sign-in-after-switch-on-works control=ROW-240.control.the-account-signs-in-before-the-switch-off
test('ROW-240.control.the-account-signs-in-before-the-switch-off', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const s = keep(await signIn({ email: m.email, password: m.password }));
  expect(String(s.me.id), 'ROW-240 control: M signs in').toBe(String(m.id));
});

test('ROW-240.REQ-014.a-fresh-sign-in-after-switch-on-works', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  await switchAccount(admin, m.id, false);
  await switchAccount(admin, m.id, true);
  const api = await jar();
  await signInOn(api, m);
  const me = await api.get('/api/me');
  expect(me.status(), 'ROW-240: the fresh sign-in after switch-on gives a session').toBe(200);
  expect(String(((await me.json()) as { id: unknown }).id), "ROW-240: it is M's").toBe(String(m.id));
});

// ---------------------------------------------------------------------------------------------------
// ROW-241 promise: the row — the session cookie cannot be read by page scripts, is not sent to other sites, and never
// ROW-241   appears in a URL; the return address after sign-in never leads to another site; REQ-014, D-003 (an httpOnly
// ROW-241   cookie).
// ROW-241 wrong product: a cookie set without HttpOnly (any injected script reads it) or with SameSite=None (sent on
// ROW-241   every other site's request); a session id put in a redirect's query; a sign-in page that honours
// ROW-241   ?redirect=https://evil.test/ (or //evil.test, /\evil.test) and sends the person there signed in.
// ROW-241 given: member M. when: M signs in through the sign-in page in a browser and opens / and /calendar; then,
// ROW-241   in fresh browsers, M signs in from /sign-in carrying return parameters (redirect, redirectTo, returnTo,
// ROW-241   return, returnUrl, next, from, to, continue, r, url, back) set to each of five other-site forms. then: every
// ROW-241   session cookie is HttpOnly, SameSite Lax or Strict, and host-only; document.cookie holds none of their
// ROW-241   values; no URL the browser requested holds one; after each sign-in the browser is on the product's origin
// ROW-241   and never navigated to the other site.
// ROW-241 controls: the control case signs M in from a plain /sign-in: a session, and the browser on the product's
// ROW-241   origin — so the return-address cases' sign-ins work and their landing is the return handling's.
// ROW-241 technique: the browser's own record of the cookie as set; a denominator over every URL requested; the
// ROW-241   other site served by the browser itself so a redirect to it would be seen, not lost to a failed lookup.
// ROW-241 cases: ROW-241 target=ROW-241.REQ-014.the-cookie-is-script-proof-same-site-and-urlfree-and-returns-stay-home control=ROW-241.control.a-plain-sign-in-lands-on-the-product
test('ROW-241.control.a-plain-sign-in-lands-on-the-product', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const context = await browser.newContext({ baseURL: productUrl() });
  try {
    const page = await context.newPage();
    await page.goto('/sign-in');
    await submitSignIn(page, m.email, m.password);
    await waitForSession(page);
    await settle(page);
    expect(new URL(page.url()).origin, 'ROW-241 control: the browser is on the product').toBe(productOrigin());
  } finally {
    await context.close();
  }
});

test('ROW-241.REQ-014.the-cookie-is-script-proof-same-site-and-urlfree-and-returns-stay-home', async ({ browser }) => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam();
  const m = await createMember(admin);

  const context = await browser.newContext({ baseURL: productUrl() });
  const urls: string[] = [];
  context.on('request', (r) => urls.push(r.url()));
  try {
    const page = await context.newPage();
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) urls.push(f.url());
    });
    await page.goto('/sign-in');
    await settle(page);
    const before = await context.cookies();
    await submitSignIn(page, m.email, m.password);
    await waitForSession(page);
    await page.goto('/');
    await settle(page);
    await page.goto('/calendar');
    await settle(page);
    const session = (await context.cookies()).filter((c) => !before.some((b) => b.name === c.name && b.value === c.value));
    expect(session.length, 'ROW-241 setup: the sign-in set a session cookie').toBeGreaterThan(0);
    const scriptSees = await page.evaluate(() => document.cookie);
    for (const c of session) {
      expect.soft(c.httpOnly, `ROW-241 cookie ${c.name}: HttpOnly`).toBe(true);
      expect.soft(['Lax', 'Strict'], `ROW-241 cookie ${c.name}: SameSite Lax or Strict (is ${c.sameSite})`).toContain(c.sameSite);
      expect.soft(c.domain.startsWith('.'), `ROW-241 cookie ${c.name}: host-only (domain ${c.domain})`).toBe(false);
      expect.soft(scriptSees.includes(c.value), `ROW-241 cookie ${c.name}: not readable by page scripts`).toBe(false);
      const v = decodeURIComponent(c.value);
      expect.soft(urls.filter((u) => u.includes(c.value) || decodeURIComponent(u).includes(v)), `ROW-241 cookie ${c.name}: in no URL`).toEqual([]);
    }
  } finally {
    await context.close();
  }

  const params = ['redirect', 'redirectTo', 'returnTo', 'return', 'returnUrl', 'next', 'from', 'to', 'continue', 'r', 'url', 'back'];
  for (const target of ['https://evil.test/', '//evil.test/', '/\\evil.test/', 'https:evil.test', `${OTHER_SITE}/after`]) {
    const ctx = await browser.newContext({ baseURL: productUrl() });
    try {
      await catchOtherSite(ctx);
      const page = await ctx.newPage();
      const visited: string[] = [];
      page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) visited.push(f.url());
      });
      await page.goto(`/sign-in?${params.map((p) => `${p}=${encodeURIComponent(target)}`).join('&')}`);
      await submitSignIn(page, m.email, m.password);
      await waitForSession(page);
      await settle(page);
      expect.soft(new URL(page.url()).origin, `ROW-241 return ${target}: the browser stays on the product`).toBe(productOrigin());
      expect.soft(visited.filter((u) => u.startsWith('http') && new URL(u).origin !== productOrigin()), `ROW-241 return ${target}: never navigated to another site`).toEqual([]);
    } finally {
      await ctx.close();
    }
  }
});
