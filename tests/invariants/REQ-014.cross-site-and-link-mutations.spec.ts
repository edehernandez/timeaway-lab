// Purpose: ledger tests for ROW-222 and ROW-223 (INV-003, REQ-014) — no state change happens from a request made by another site or by a sibling host of the same site (any origin but the product's own; another port of the same host is outside the row, A-057), or from a plain link or address visit, while someone is signed in; the same change made from the product's own form takes effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13; the A-057 sibling-host cases added by batch test-author-26, the product served to the browser under a same-site name by the file's own carrier); fixture data made through the product's public routes by harness.ts (reset, accounts, requests), fresh per run; the other site is a page the browser itself serves at http://evil.test (robustness.ts serveOtherSite), so no network leaves the harness.
//
// Boundary (R6): what a browser sends on a person's behalf — cookies on a cross-site form, an address visit — is
// browser behaviour, proved in the browser with the person signed in through the sign-in page itself (so the
// cookie carries exactly the attributes the product set); the state is read afterwards at the HTTP harness.
import { test, expect, request as playwrightRequest, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  createMember,
  fresh,
  freshEmail,
  freshName,
  freshPassword,
  productUrl,
  readEffect,
  sendRequest,
  SetupError,
  signIn,
  signInMember,
  signInThroughPage,
  type Actor,
  type Install,
  type Member,
} from './harness';
import {
  disposeAll,
  fillSendForm,
  freshTeam,
  keep,
  listOf,
  openSendForm,
  ownRequests,
  pendingDays,
  peopleText,
  serveOtherSite,
  settle,
  stringLeaves,
  submitSignIn,
  type Json,
} from './robustness';

test.afterEach(disposeAll);

function autoForm(action: string, fields: Record<string, string>, enctype = 'application/x-www-form-urlencoded'): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`)
    .join('');
  return `<!doctype html><title>prize</title><form id="f" method="POST" enctype="${enctype}" action="${action}">${inputs}</form><script>document.getElementById('f').submit()</script>`;
}

/** Opens the other site's page in the context and waits until it has done its work (its form navigated, or its script finished). */
async function visitOtherSite(context: BrowserContext, path: string, html: string): Promise<void> {
  const url = await serveOtherSite(context, path, html);
  const page = await context.newPage();
  try {
    await page.goto(url).catch(() => undefined);
    await expect
      .poll(async () => !page.url().startsWith(url) || (await page.evaluate(() => (window as unknown as { __done?: boolean }).__done === true).catch(() => false)), { timeout: 15_000 })
      .toBe(true)
      .catch(() => undefined);
    await settle(page);
  } finally {
    await page.close();
  }
}

async function browserSignedIn(browser: Browser, who: { email: string; password: string }): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: productUrl() });
  const page = await context.newPage();
  await signInThroughPage(page, who);
  await page.close();
  return context;
}

async function signsIn(email: string, password: string): Promise<boolean> {
  try {
    const a = await signIn({ email, password });
    await a.dispose();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-222 promise: the row — no state change happens from a request made by another site, or from a plain link or
// ROW-222   address visit, while someone is signed in; INV-003 ("a refused attempt changes nothing"; only the admin
// ROW-222   runs accounts, a person acts only on their own requests), REQ-014 (every action requires being signed in).
// ROW-222 wrong product: a session cookie set SameSite=None (or left to the browser's lax-for-two-minutes default)
// ROW-222   with routes that read a form-encoded or text/plain body as readily as JSON — another site's auto-submitting
// ROW-222   form sends a request, cancels one or creates an account in the signed-in person's name; or routes that also
// ROW-222   answer GET, so a link or an <img> address sends, cancels, switches off or signs out.
// ROW-222 given: member M signed in in a browser through the sign-in page, with a pending vacation P (22..23 Mar
// ROW-222   2027); the admin signed in in another browser the same way. when: a page on http://evil.test, opened in M's
// ROW-222   browser, posts a form-encoded request (15..16 Mar), fetches the same as text/plain JSON with credentials, and
// ROW-222   posts a cancel of P; one opened in the admin's browser posts a new account and a switch-off of M; then M's
// ROW-222   browser visits the addresses of a send, a cancel of P, a password change and a sign-out, and the admin's
// ROW-222   those of a create, a switch-off of M, an approve of P with a real token and a password set for M.
// ROW-222   then: M still has only P, pending, with its 2 days pending; no account with the other site's email
// ROW-222   exists; M is switched on and signs in with its own password, not the visited one; M's browser session still
// ROW-222   answers /api/me.
// ROW-222 controls: the control case shows M's browser signed in through the page and P pending — "unchanged" is
// ROW-222   measured from a live session and a live request (ROW-223 shows the same send made the product's own way
// ROW-222   takes effect).
// ROW-222 technique: the other site played in the browser itself (form-encoded, text/plain, credentials included),
// ROW-222   every mutation route reached both cross-site and by address, and the state read afterwards on each record.
// ROW-222 cases: ROW-222 target=ROW-222.INV-003.no-change-from-another-site-or-an-address-visit control=ROW-222.control.the-signed-in-browser-and-the-pending-request-are-live
async function world(): Promise<{ install: Install; admin: Actor; m: Member; mApi: Actor; p: string }> {
  const { install, admin } = await freshTeam();
  const m = await createMember(admin);
  const mApi = keep(await signInMember(m));
  const p = String(await sendRequest(mApi, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }));
  return { install, admin, m, mApi, p };
}

test('ROW-222.control.the-signed-in-browser-and-the-pending-request-are-live', async ({ browser }) => {
  const w = await world();
  const ctx = await browserSignedIn(browser, w.m);
  try {
    expect((await ctx.request.get('/api/me')).status(), "ROW-222 control: M's browser is signed in").toBe(200);
    expect((await ownRequests(w.mApi)).find((r) => r.id === w.p)?.state, 'ROW-222 control: P is pending').toBe('pending');
  } finally {
    await ctx.close();
  }
});

test('ROW-222.INV-003.no-change-from-another-site-or-an-address-visit', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  const product = productUrl();
  const evilAccount = { name: freshName('Evil'), email: freshEmail('evil'), password: freshPassword(), allowance: '25' };
  const visitedPassword = `Pw-${fresh('visited')}`;
  const mBrowser = await browserSignedIn(browser, w.m);
  const aBrowser = await browserSignedIn(browser, w.install.admin);
  try {
    expect((await mBrowser.request.get('/api/me')).status(), "ROW-222 setup: M's browser is signed in").toBe(200);

    // Another site, in M's browser.
    await visitOtherSite(mBrowser, '/send', autoForm(`${product}/api/requests`, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' }));
    await visitOtherSite(
      mBrowser,
      '/fetch',
      `<!doctype html><script>fetch(${JSON.stringify(`${product}/api/requests`)},{method:'POST',mode:'no-cors',credentials:'include',headers:{'Content-Type':'text/plain'},body:JSON.stringify({kind:'vacation',firstDay:'2027-03-24',lastDay:'2027-03-24'})}).finally(()=>{window.__done=true})</script>`,
    );
    await visitOtherSite(mBrowser, '/cancel', autoForm(`${product}/api/requests/${encodeURIComponent(w.p)}/cancel`, { go: '1' }));
    // Another site, in the admin's browser.
    await visitOtherSite(aBrowser, '/create', autoForm(`${product}/api/admin/accounts`, evilAccount));
    await visitOtherSite(aBrowser, '/switch', autoForm(`${product}/api/admin/accounts/${encodeURIComponent(String(w.m.id))}/switch`, { on: 'false' }));

    // Plain address visits, signed in.
    const mPage = await mBrowser.newPage();
    for (const addr of [
      '/api/requests?kind=vacation&firstDay=2027-03-29&lastDay=2027-03-30',
      `/api/requests/${encodeURIComponent(w.p)}/cancel`,
      `/api/me/password?current=${encodeURIComponent(w.m.password)}&next=${encodeURIComponent(visitedPassword)}`,
    ]) {
      await mPage.goto(addr).catch(() => undefined);
    }
    const aPage = await aBrowser.newPage();
    const token = (await readEffect(w.admin, 'approve', w.p)).token;
    for (const addr of [
      `/api/admin/accounts?name=${encodeURIComponent(evilAccount.name)}&email=${encodeURIComponent(evilAccount.email)}&password=${encodeURIComponent(evilAccount.password)}&allowance=25`,
      `/api/admin/accounts/${encodeURIComponent(String(w.m.id))}/switch?on=false`,
      `/api/admin/requests/${encodeURIComponent(w.p)}/approve?token=${encodeURIComponent(token)}`,
      `/api/admin/accounts/${encodeURIComponent(String(w.m.id))}/password?password=${encodeURIComponent(visitedPassword)}`,
    ]) {
      await aPage.goto(addr).catch(() => undefined);
    }
    await mPage.goto('/api/auth/sign-out').catch(() => undefined);

    expect.soft((await mBrowser.request.get('/api/me')).status(), "ROW-222: M's browser session survived the sign-out address visit").toBe(200);
  } finally {
    await mBrowser.close();
    await aBrowser.close();
  }

  expect.soft(await signsIn(w.m.email, w.m.password), 'ROW-222: M is still switched on and signs in with its own password').toBe(true);
  expect.soft(await signsIn(w.m.email, visitedPassword), 'ROW-222: the visited password does not sign in').toBe(false);
  const reader = keep(await signInMember(w.m));
  const requests = await ownRequests(reader);
  expect.soft(requests.map((r) => r.id), 'ROW-222: M has only P — nothing was sent').toEqual([w.p]);
  expect.soft(requests.find((r) => r.id === w.p)?.state, 'ROW-222: P is still pending — not cancelled, not approved').toBe('pending');
  expect.soft(await pendingDays(reader, 2027), "ROW-222: only P's 2 days are pending").toBe(2);
  expect.soft((await peopleText(w.admin)).toLowerCase().includes(evilAccount.email), "ROW-222: no account with the other site's email exists").toBe(false);
  expect.soft(await signsIn(evilAccount.email, evilAccount.password), "ROW-222: the other site's account does not sign in").toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-223 promise: the row (control of ROW-222) — the same change made from the product's own form takes effect;
// ROW-223   INV-003, REQ-014.
// ROW-223 wrong product: a cross-site defence that also refuses the product's own form (a token never sent, an Origin
// ROW-223   check that rejects the product's own origin), so nobody can send a request at all.
// ROW-223 given: member M signed in in a browser through the sign-in page. when: M sends vacation 15..16 Mar 2027 from
// ROW-223   /requests/new. then: M has exactly one request, pending, with 2 days pending.
// ROW-223 controls: the control case shows M's browser session answering /api/me — the same signed-in browser that
// ROW-223   ROW-222's attempts run in.
// ROW-223 technique: the very change ROW-222 attempts cross-site (the same days, the same route), made the product's
// ROW-223   own way, with before/after on the server.
// ROW-223 cases: ROW-223 target=ROW-223.INV-003.the-same-send-from-the-own-form-takes-effect control=ROW-223.control.the-browser-signed-in-through-the-page-answers
test('ROW-223.control.the-browser-signed-in-through-the-page-answers', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const ctx = await browserSignedIn(browser, m);
  try {
    expect((await ctx.request.get('/api/me')).status(), "ROW-223 control: M's browser is signed in").toBe(200);
  } finally {
    await ctx.close();
  }
});

test('ROW-223.INV-003.the-same-send-from-the-own-form-takes-effect', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const reader = keep(await signInMember(m));
  const ctx = await browserSignedIn(browser, m);
  try {
    const page = await ctx.newPage();
    expect(await ownRequests(reader), 'ROW-223 before: no request').toHaveLength(0);
    await openSendForm(page);
    await fillSendForm(page, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
    await settle(page);
    await expect.poll(async () => (await ownRequests(reader)).length, { message: 'ROW-223: the own form sent one request', timeout: 10_000 }).toBe(1);
    expect.soft((await ownRequests(reader))[0]?.state, 'ROW-223: it is pending').toBe('pending');
    expect.soft(await pendingDays(reader, 2027), 'ROW-223: its 2 days are pending').toBe(2);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-222 (amended, A-057) promise: the row as amended — no state change happens from a request made by ANY origin
// ROW-222   other than the product's own, a sibling host name of the same site included (F-138: "another site" in
// ROW-222   browser terms leaves sibling subdomains out); a page served from another port of the same host is outside
// ROW-222   the row (A-057, a known limit) and is deliberately not attempted here; INV-003, REQ-014.
// ROW-222 wrong product: a defence that rests on the cookie's SameSite attribute alone (Lax or Strict — both are
// ROW-222   sent on a request from a sibling host, which is the same site), or on Sec-Fetch-Site refusing only
// ROW-222   "cross-site", so a page on other.<site> posts a send, a cancel, an account, a switch-off, an approval or a
// ROW-222   password in the signed-in person's name while the product is served at app.<site>.
// ROW-222 given: the product served to the browser under the name app.<fresh site>.test (the browser's requests to it
// ROW-222   are carried to the product as they are, its Host that name, so the product's own origin is that name) and a
// ROW-222   page at other.<same site>.test; member M with a pending vacation P (22..23 Mar 2027), signed in in a browser
// ROW-222   through the sign-in page at app.<site>; the admin signed in in another browser the same way. when: a page on
// ROW-222   other.<site> in M's browser posts a form-encoded send (15..16 Mar), a text/plain form whose body reads as
// ROW-222   JSON (17 Mar), a no-cors text/plain fetch (24 Mar), a CORS JSON fetch (25 Mar) and a cancel of P; one in
// ROW-222   the admin's browser posts a new account, a switch-off of M, an approval of P with a real token and a
// ROW-222   password set for M. then: M still has only P, pending, with its 2 days pending; no account with the other
// ROW-222   page's email exists; M is switched on and signs in with its own password, not the posted one.
// ROW-222 controls: ROW-222.control.the-product-under-a-same-site-name-takes-its-own-form — M, signed in at
// ROW-222   app.<site>, sends 15..16 Mar from /requests/new there and it takes effect (the name, the cookie and the
// ROW-222   product's own-origin path all work under it); in the target, M's browser answers /api/me under the name, and
// ROW-222   the posts from other.<site> are seen reaching the product with the session cookie the browser holds for
// ROW-222   app.<site> and with their own Origin — the harmful case is reached, so only the product's own check stands
// ROW-222   between them and a change (SETUP when no post arrived with the cookie).
// ROW-222 technique: the neighbouring origin that must stay powerless — a sibling host of one site, played in the
// ROW-222   browser itself with every body a browser can post without CORS's consent, plus a CORS attempt; the state
// ROW-222   read afterwards on each record.
// ROW-222 cases: ROW-222 target=ROW-222.INV-003.no-change-from-a-sibling-host-of-the-same-site control=ROW-222.control.the-product-under-a-same-site-name-takes-its-own-form

/** A request the browser sent to the product under its same-site name, as it reached the product. */
interface Carried {
  method: string;
  path: string;
  origin: string | null;
  withCookie: boolean;
}

/** A site of its own per run: app.<site> serves the product, other.<site> is the sibling page. */
function freshSite(): { app: string; other: string } {
  const site = `${fresh('site').toLowerCase().replace(/[^a-z0-9-]/g, '')}.test`;
  return { app: `http://app.${site}`, other: `http://other.${site}` };
}

/** The site of an origin, for these tests' names: its host without the first label (app.<site> → <site>). */
function siteOf(origin: string): string {
  return new URL(origin).hostname.split('.').slice(1).join('.');
}

/** What a browser puts in Sec-Fetch-Site for a request to `target` made from `from` (an origin, or null for none). */
function fetchSite(from: string | null, target: string): string {
  if (!from) return 'none';
  if (from === target) return 'same-origin';
  return siteOf(from) === siteOf(target) ? 'same-site' : 'cross-site';
}

/**
 * Serves the product to `context` under `origin`: every request the browser sends there is carried to the product as
 * the browser sent it — method, body and the headers the page gave it, its Host the served name — on a fresh cookie
 * jar each time, and the product's answer returned as it is (a Location naming the product's address rewritten to the
 * served name; its Set-Cookie reaching the browser's own store). What an intercepted request's headers lack is put
 * back as the browser sends it: the cookies the browser's own store holds for the address (every request here is
 * same-origin or same-site, and SameSite Lax and Strict both send a cookie on a same-site request, a form post
 * included) and, when absent, Sec-Fetch-Site worked out from the request's Origin (or Referer). Each carried request
 * is recorded in `log`.
 */
async function serveProductAt(context: BrowserContext, origin: string, log: Carried[]): Promise<void> {
  const product = productUrl();
  const host = new URL(origin).host;
  await context.route(
    (u) => u.origin === origin,
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const all = req.headers();
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(all)) {
        const n = k.toLowerCase();
        if (n.startsWith(':') || ['host', 'content-length', 'accept-encoding', 'connection'].includes(n)) continue;
        headers[n] = String(v);
      }
      headers.host = host;
      if (!headers.cookie) {
        const held = await context.cookies(req.url());
        if (held.length > 0) headers.cookie = held.map((c) => `${c.name}=${c.value}`).join('; ');
      }
      if (!headers['sec-fetch-site']) {
        let from: string | null = headers.origin && headers.origin !== 'null' ? headers.origin : null;
        if (!from && headers.referer) from = new URL(headers.referer).origin;
        headers['sec-fetch-site'] = fetchSite(from, origin);
      }
      log.push({ method: req.method(), path: url.pathname, origin: headers.origin ?? null, withCookie: (headers.cookie ?? '').length > 0 });
      const carrier = await playwrightRequest.newContext();
      try {
        const res = await carrier.fetch(`${product}${url.pathname}${url.search}`, {
          method: req.method(),
          headers,
          data: req.postDataBuffer() ?? undefined,
          maxRedirects: 0,
          failOnStatusCode: false,
          timeout: 60_000,
        });
        const out: Record<string, string> = {};
        for (const { name, value } of res.headersArray()) {
          const n = name.toLowerCase();
          if (['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(n)) continue;
          const v = n === 'location' ? value.split(product).join(origin) : value;
          out[n] = n in out ? `${out[n]}${n === 'set-cookie' ? '\n' : ', '}${v}` : v;
        }
        await route.fulfill({ status: res.status(), headers: out, body: await res.body() });
      } catch {
        await route.abort().catch(() => undefined);
      } finally {
        await carrier.dispose().catch(() => undefined);
      }
    },
  );
}

/** A browser context that reaches the product at `origin` only, signed in through the sign-in page there. */
async function browserAtSameSiteName(browser: Browser, origin: string, who: { email: string; password: string }, log: Carried[]): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: origin });
  await serveProductAt(context, origin, log);
  const page = await context.newPage();
  try {
    await page.goto('/sign-in');
    await submitSignIn(page, who.email, who.password);
    await meUnderName(page, 15_000).then((s) => {
      if (s !== 200) throw new SetupError(`no session under ${origin} after signing in through its sign-in page (GET /api/me answered ${s})`);
    });
  } finally {
    await page.close();
  }
  return context;
}

/** GET /api/me from a page of the served name (through the browser, so through the served name), polled (bounded) until 200 or `timeoutMs`. */
async function meUnderName(page: Page, timeoutMs = 5_000): Promise<number> {
  let status = 0;
  await expect
    .poll(
      async () => {
        status = await page.evaluate(() => fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.status, () => 0)).catch(() => 0);
        return status;
      },
      { timeout: timeoutMs },
    )
    .toBe(200)
    .catch(() => undefined);
  return status;
}

/** Opens a page at `url` (served with `html`) in the context and waits until it has done its work (its form navigated, or its script set window.__done). */
async function visitAt(context: BrowserContext, url: string, html: string): Promise<void> {
  await context.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  const page = await context.newPage();
  try {
    await page.goto(url).catch(() => undefined);
    await expect
      .poll(async () => !page.url().startsWith(url) || (await page.evaluate(() => (window as unknown as { __done?: boolean }).__done === true).catch(() => false)), { timeout: 15_000 })
      .toBe(true)
      .catch(() => undefined);
    await settle(page);
  } finally {
    await page.close();
  }
}

/** A form whose text/plain body reads as the JSON object `obj` (the name carries all but a trailing `"}` that the value supplies). */
function textPlainJsonForm(action: string, obj: Record<string, string>): string {
  const json = JSON.stringify({ ...obj, pad: '' });
  const name = json.slice(0, -2);
  return `<!doctype html><form id="f" method="POST" enctype="text/plain" action="${action}"><input type="hidden" name='${name.replace(/'/g, '&#39;')}' value='"}'></form><script>document.getElementById('f').submit()</script>`;
}

/** A person's requests as the admin reads them (GET /api/admin/people/:id/requests), each with its id and its state leaf. */
async function personRequests(admin: Actor, id: string | number): Promise<{ id: string; state: string | null }[]> {
  const route = `/api/admin/people/${encodeURIComponent(String(id))}/requests`;
  const res = await admin.api.get(route);
  if (!res.ok()) throw new SetupError(`GET ${route} answered ${res.status()}`);
  return listOf((await res.json()) as Json).map((r) => {
    const states = stringLeaves(r)
      .map((x) => x.toLowerCase())
      .map((x) => (x === 'canceled' ? 'cancelled' : x))
      .filter((x) => ['pending', 'approved', 'rejected', 'cancelled'].includes(x));
    return { id: String(r.id), state: states[0] ?? null };
  });
}

/** A person's pending days for `year` as the people data gives them (D-043: each account's `years` with pending). */
async function personPending(admin: Actor, id: string | number, year: number): Promise<number | null> {
  const people = listOf(JSON.parse(await peopleText(admin)) as Json);
  const row = people.find((r) => String(r.id) === String(id)) as { years?: { year: number; pending: number }[] } | undefined;
  return row?.years?.find((y) => Number(y.year) === year)?.pending ?? null;
}

test('ROW-222.control.the-product-under-a-same-site-name-takes-its-own-form', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const reader = keep(await signInMember(m));
  const site = freshSite();
  const log: Carried[] = [];
  const ctx = await browserAtSameSiteName(browser, site.app, m, log);
  try {
    const page = await ctx.newPage();
    expect(await ownRequests(reader), 'ROW-222 control: before, M has no request').toHaveLength(0);
    await openSendForm(page);
    await fillSendForm(page, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
    await settle(page);
    await expect
      .poll(async () => (await ownRequests(reader)).length, { message: `ROW-222 control: M's own form at ${site.app} sent one request`, timeout: 10_000 })
      .toBe(1);
    expect.soft(await pendingDays(reader, 2027), 'ROW-222 control: its 2 days are pending').toBe(2);
  } finally {
    await ctx.close();
  }
});

test('ROW-222.INV-003.no-change-from-a-sibling-host-of-the-same-site', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  const site = freshSite();
  const evilAccount = { name: freshName('Sibling'), email: freshEmail('sibling'), password: freshPassword(), allowance: '25' };
  const postedPassword = `Pw-${fresh('posted')}`;
  const mLog: Carried[] = [];
  const aLog: Carried[] = [];
  const mBrowser = await browserAtSameSiteName(browser, site.app, w.m, mLog);
  const aBrowser = await browserAtSameSiteName(browser, site.app, w.install.admin, aLog);
  const app = site.app;
  const at = (path: string) => `${site.other}${path}`;
  try {
    const probe = await mBrowser.newPage();
    await probe.goto('/');
    await settle(probe);
    expect(await meUnderName(probe), `ROW-222 setup: M's browser is signed in at ${app}`).toBe(200);
    await probe.close();

    const token = (await readEffect(w.admin, 'approve', w.p)).token;

    // The sibling host, in M's browser.
    await visitAt(mBrowser, at('/send'), autoForm(`${app}/api/requests`, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' }));
    await visitAt(mBrowser, at('/send-json-form'), textPlainJsonForm(`${app}/api/requests`, { kind: 'vacation', firstDay: '2027-03-17', lastDay: '2027-03-17' }));
    await visitAt(
      mBrowser,
      at('/fetch'),
      `<!doctype html><script>fetch(${JSON.stringify(`${app}/api/requests`)},{method:'POST',mode:'no-cors',credentials:'include',headers:{'Content-Type':'text/plain'},body:JSON.stringify({kind:'vacation',firstDay:'2027-03-24',lastDay:'2027-03-24'})}).catch(()=>{}).finally(()=>{window.__done=true})</script>`,
    );
    await visitAt(
      mBrowser,
      at('/cors'),
      `<!doctype html><script>fetch(${JSON.stringify(`${app}/api/requests`)},{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'vacation',firstDay:'2027-03-25',lastDay:'2027-03-25'})}).catch(()=>{}).finally(()=>{window.__done=true})</script>`,
    );
    await visitAt(mBrowser, at('/cancel'), autoForm(`${app}/api/requests/${encodeURIComponent(w.p)}/cancel`, { go: '1' }));

    // The sibling host, in the admin's browser (the approval's token read before any attempt, so a change an attempt
    // makes shows as the row's failure below, never as setup).
    await visitAt(aBrowser, at('/create'), autoForm(`${app}/api/admin/accounts`, evilAccount));
    await visitAt(aBrowser, at('/switch'), autoForm(`${app}/api/admin/accounts/${encodeURIComponent(String(w.m.id))}/switch`, { on: 'false' }));
    await visitAt(aBrowser, at('/approve'), autoForm(`${app}/api/admin/requests/${encodeURIComponent(w.p)}/approve`, { token }));
    await visitAt(aBrowser, at('/approve-json-form'), textPlainJsonForm(`${app}/api/admin/requests/${encodeURIComponent(w.p)}/approve`, { token }));
    await visitAt(aBrowser, at('/password'), autoForm(`${app}/api/admin/accounts/${encodeURIComponent(String(w.m.id))}/password`, { password: postedPassword }));

    // The harmful case was reached: the sibling's posts arrived at the product with the session cookie.
    const siblingPosts = [...mLog, ...aLog].filter((c) => c.method === 'POST' && c.origin !== site.app);
    if (!siblingPosts.some((c) => c.withCookie)) {
      throw new SetupError(`no post from ${site.other} reached the product with the session cookie (carried: ${JSON.stringify(siblingPosts)})`);
    }
  } finally {
    await mBrowser.close();
    await aBrowser.close();
  }

  expect.soft(await signsIn(w.m.email, w.m.password), 'ROW-222 sibling host: M is still switched on and signs in with its own password').toBe(true);
  expect.soft(await signsIn(w.m.email, postedPassword), 'ROW-222 sibling host: the posted password does not sign in').toBe(false);
  // M's requests and pending days are read on the admin's routes (D-029 GET /api/admin/people/:id/requests, D-043
  // GET /api/admin/people), so a changed password or a forced password change cannot hide the other changes.
  const requests = await personRequests(w.admin, w.m.id);
  expect.soft(requests.map((r) => r.id), 'ROW-222 sibling host: M has only P — nothing was sent').toEqual([w.p]);
  expect.soft(requests.find((r) => r.id === w.p)?.state, 'ROW-222 sibling host: P is still pending — not cancelled, not approved').toBe('pending');
  expect.soft(await personPending(w.admin, w.m.id, 2027), "ROW-222 sibling host: only P's 2 days are pending").toBe(2);
  expect.soft((await peopleText(w.admin)).toLowerCase().includes(evilAccount.email), "ROW-222 sibling host: no account with the sibling page's email exists").toBe(false);
  expect.soft(await signsIn(evilAccount.email, evilAccount.password), "ROW-222 sibling host: the sibling page's account does not sign in").toBe(false);
});
