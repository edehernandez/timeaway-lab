// Purpose: ledger tests for ROW-222 and ROW-223 (INV-003, REQ-014) — no state change happens from a request made by another site, or from a plain link or address visit, while someone is signed in; the same change made from the product's own form takes effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests), fresh per run; the other site is a page the browser itself serves at http://evil.test (robustness.ts serveOtherSite), so no network leaves the harness.
//
// Boundary (R6): what a browser sends on a person's behalf — cookies on a cross-site form, an address visit — is
// browser behaviour, proved in the browser with the person signed in through the sign-in page itself (so the
// cookie carries exactly the attributes the product set); the state is read afterwards at the HTTP harness.
import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import {
  createMember,
  fresh,
  freshEmail,
  freshName,
  freshPassword,
  productUrl,
  readEffect,
  sendRequest,
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
  openSendForm,
  ownRequests,
  pendingDays,
  peopleText,
  serveOtherSite,
  settle,
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
