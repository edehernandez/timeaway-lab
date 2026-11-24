// Purpose: ledger tests for ROW-227 (REQ-014, INV-002), ROW-228 (INV-003) and ROW-230 (INV-002) — signed-in pages are not stored by the browser and no team data remains in browser storage after sign-out, so Back shows nothing; no page can be framed by another site; no page loads anything from another site or sends team data there.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals), fresh per run; the other site is a page the browser itself serves at http://evil.test (robustness.ts serveOtherSite).
//
// Boundary (R6): caching, framing and what a page loads are browser behaviour, proved in the browser (with the HTTP
// headers that govern them read at the HTTP harness for every signed-in page and data route); the person signs in
// and out through the pages themselves, so the browser holds exactly what the product gave it.
import { test, expect, type Browser } from '@playwright/test';
import { approve, createMember, openPage, productUrl, sendRequest, signInMember, signInThroughPage, type Actor, type Member } from './harness';
import {
  disposeAll,
  freshTeam,
  keep,
  pagesFor,
  productOrigin,
  serveOtherSite,
  settle,
  signOutThroughPage,
  textLines,
} from './robustness';

test.afterEach(disposeAll);

interface World {
  admin: Actor;
  m: Member;
  ma: Actor;
  c: Member;
}

/** Member M (the viewer) and colleague C, away on Wed 10 Mar 2027 (approved), so team data is on M's calendar. */
async function world(): Promise<World> {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const c = await createMember(admin);
  const ca = keep(await signInMember(c));
  await approve(admin, await sendRequest(ca, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  const ma = keep(await signInMember(m));
  await sendRequest(ma, { kind: 'sick', firstDay: '2027-03-17', lastDay: '2027-03-17' });
  return { admin, m, ma, c };
}

// ---------------------------------------------------------------------------------------------------
// ROW-227 promise: the row — signed-in pages are not stored by the browser and no team data remains in browser
// ROW-227   storage after sign-out, so Back on a shared computer shows nothing; REQ-014 (signing out ends the session),
// ROW-227   INV-002 (a kind reaches nobody it is not meant for — a page left in a shared browser reaches the next user).
// ROW-227 wrong product: pages and API answers sent without Cache-Control: no-store, so Back after sign-out restores
// ROW-227   the calendar from the back-forward cache; a client store persisted to localStorage (requests, names,
// ROW-227   kinds) and left there at sign-out; a service worker caching /api answers.
// ROW-227 given: member M with a sick day pending; colleague C away 10 Mar 2027, so C's name is on M's calendar.
// ROW-227 when: every signed-in page and data route is asked for by M and the admin; M signs in through the sign-in
// ROW-227   page, opens /calendar, signs out through the page's own control and presses Back. then: every one of those
// ROW-227   answers carries Cache-Control: no-store; after Back the page shows neither C's nor M's name (within a bounded
// ROW-227   wait); localStorage, sessionStorage, the cookies and Cache Storage hold no name, email, kind or day; no
// ROW-227   IndexedDB database remains; Cache Storage holds no product page or /api answer.
// ROW-227 controls: the control case shows C's name on M's calendar before the sign-out — the data a Back could
// ROW-227   restore is there.
// ROW-227 technique: before/after around the sign-out on the same tab; the storage denominators are every key of
// ROW-227   every store the browser offers a page.
// ROW-227 cases: ROW-227 target=ROW-227.REQ-014.after-sign-out-back-and-storage-show-no-team-data control=ROW-227.control.the-calendar-shows-the-colleague-before-sign-out
async function calendarSignedIn(browser: Browser, w: World) {
  const context = await browser.newContext({ baseURL: productUrl() });
  const page = await context.newPage();
  await signInThroughPage(page, w.m);
  await page.goto('/calendar');
  await settle(page);
  return { context, page };
}

test('ROW-227.control.the-calendar-shows-the-colleague-before-sign-out', async ({ browser }) => {
  const w = await world();
  const { context, page } = await calendarSignedIn(browser, w);
  try {
    expect((await textLines(page)).join('\n'), "ROW-227 control: C's name is on M's calendar").toContain(w.c.name);
  } finally {
    await context.close();
  }
});

test('ROW-227.REQ-014.after-sign-out-back-and-storage-show-no-team-data', async ({ browser }) => {
  const w = await world();
  const routes: [Actor, string][] = [
    ...pagesFor('member').map((p) => [w.ma, p] as [Actor, string]),
    ...['/api/me', '/api/requests', '/api/balance', '/api/calendar?year=2027&month=3'].map((p) => [w.ma, p] as [Actor, string]),
    ...['/admin/pending', '/admin/people', `/admin/people/${encodeURIComponent(String(w.m.id))}`, '/api/admin/people', '/api/admin/pending'].map(
      (p) => [w.admin, p] as [Actor, string],
    ),
  ];
  for (const [actor, path] of routes) {
    const res = await actor.api.get(path);
    expect.soft(res.headers()['cache-control'] ?? '', `ROW-227 ${actor.kind} ${path}: Cache-Control no-store`).toMatch(/no-store/i);
  }

  const { context, page } = await calendarSignedIn(browser, w);
  try {
    expect((await textLines(page)).join('\n'), "ROW-227 before: C's name is on the calendar").toContain(w.c.name);
    await signOutThroughPage(page);
    await page.goBack().catch(() => null);
    await settle(page);
    await expect
      .poll(async () => {
        const text = (await textLines(page)).join('\n');
        return [w.c.name, w.m.name].filter((n) => text.includes(n));
      }, { message: 'ROW-227: Back after sign-out shows no team data', timeout: 5_000 })
      .toEqual([]);

    if (!page.url().startsWith(productOrigin())) await page.goto('/sign-in');
    const stores = await page.evaluate(async () => {
      const dump = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i) ?? '')}`).join('\n');
      const cached: string[] = [];
      if ('caches' in window) {
        for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) cached.push(req.url);
      }
      const dbs = 'databases' in indexedDB ? (await indexedDB.databases()).map((d) => d.name ?? '?') : [];
      return { local: dump(localStorage), session: dump(sessionStorage), cached, dbs };
    });
    const cookies = (await context.cookies()).map((c) => `${c.name}=${decodeURIComponent(c.value)}`).join('\n');
    const team = [w.c.name, w.m.name, w.m.email, w.c.email, 'vacation', 'sick', '2027-03-10', '2027-03-17'];
    for (const [store, text] of [['localStorage', stores.local], ['sessionStorage', stores.session], ['cookies', cookies], ['Cache Storage', stores.cached.join('\n')]] as [string, string][]) {
      expect.soft(team.filter((t) => text.toLowerCase().includes(t.toLowerCase())), `ROW-227 ${store} after sign-out: no team data`).toEqual([]);
    }
    expect.soft(stores.dbs, 'ROW-227 after sign-out: no IndexedDB database').toEqual([]);
    expect.soft(stores.cached.filter((u) => !/\/_nuxt\/|\.(?:js|mjs|css|woff2?|png|svg|ico|webp)(?:\?|$)/.test(u)), 'ROW-227 Cache Storage: no page or /api answer').toEqual([]);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-228 promise: the row — no page can be framed by another site; INV-003 (only the admin decides and runs
// ROW-228   accounts — a framed admin page can be clicked by a hidden overlay: clickjacking).
// ROW-228 wrong product: no X-Frame-Options and no CSP frame-ancestors on the pages, so another site frames
// ROW-228   /admin/pending invisibly and steers the admin's click onto Approve; or headers set on some pages only.
// ROW-228 given: member M signed in in a browser; the admin. when: every page is asked for by its actor (/sign-in
// ROW-228   anonymous, M's four, the admin's three); a page on http://evil.test, opened in M's browser, frames /sign-in
// ROW-228   and /calendar. then: every page answers with X-Frame-Options DENY or SAMEORIGIN, or a CSP frame-ancestors
// ROW-228   of 'none' or 'self' only; neither frame shows the product's document (no frame stays at a product address).
// ROW-228 controls: the control case opens /sign-in at the top level: 200 and its Email field — the page renders,
// ROW-228   so its absence inside the frame is the framing refusal.
// ROW-228 technique: the header on every page (the denominator is D-029's page list) and the browser's own refusal
// ROW-228   observed from the other site's page.
// ROW-228 cases: ROW-228 target=ROW-228.INV-003.no-page-can-be-framed-by-another-site control=ROW-228.control.the-sign-in-page-renders-at-the-top-level
function framingRefused(h: Record<string, string>): boolean {
  const xfo = (h['x-frame-options'] ?? '').trim().toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return true;
  const fa = /frame-ancestors\s+([^;]+)/i.exec(h['content-security-policy'] ?? '')?.[1]?.trim().split(/\s+/) ?? [];
  return fa.length > 0 && fa.every((s) => s === "'none'" || s === "'self'");
}

test('ROW-228.control.the-sign-in-page-renders-at-the-top-level', async ({ browser }) => {
  await freshTeam();
  const opened = await openPage(browser, 'anonymous');
  try {
    const r = await opened.page.goto('/sign-in');
    expect(r?.status(), 'ROW-228 control: /sign-in answers 200').toBe(200);
    await expect(opened.page.getByLabel('Email', { exact: true }), 'ROW-228 control: the form renders').toBeVisible();
  } finally {
    await opened.close();
  }
});

test('ROW-228.INV-003.no-page-can-be-framed-by-another-site', async ({ browser, playwright }) => {
  const w = await world();
  const anon = await playwright.request.newContext({ baseURL: productUrl() });
  try {
    const visits: [Actor | 'anonymous', string][] = [
      ['anonymous', '/sign-in'],
      ...pagesFor('member').map((p) => [w.ma, p] as [Actor, string]),
      ...['/admin/pending', '/admin/people', `/admin/people/${encodeURIComponent(String(w.m.id))}`].map((p) => [w.admin, p] as [Actor, string]),
    ];
    for (const [actor, path] of visits) {
      const res = await (actor === 'anonymous' ? anon : actor.api).get(path);
      expect.soft(framingRefused(res.headers()), `ROW-228 ${actor === 'anonymous' ? 'anonymous' : actor.kind} ${path}: refuses framing by another site`).toBe(true);
    }
  } finally {
    await anon.dispose();
  }

  const opened = await openPage(browser, w.ma);
  try {
    const product = productUrl();
    const url = await serveOtherSite(
      opened.context,
      '/frame',
      `<!doctype html><script>window.__loaded=0</script><iframe src="${product}/sign-in" onload="window.__loaded++"></iframe><iframe src="${product}/calendar" onload="window.__loaded++"></iframe>`,
    );
    await opened.page.goto(url);
    await expect.poll(() => opened.page.evaluate(() => (window as unknown as { __loaded: number }).__loaded), { timeout: 15_000 }).toBe(2).catch(() => undefined);
    const framed = opened.page.frames().filter((f) => f !== opened.page.mainFrame() && f.url().startsWith(productOrigin()));
    const shown: string[] = [];
    for (const f of framed) {
      const text = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      if (text.trim() !== '') shown.push(f.url());
    }
    expect.soft(shown, 'ROW-228: another site cannot show the product in a frame').toEqual([]);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-230 promise: the row — no page loads scripts, styles, fonts or trackers from another site, and no team data is
// ROW-230   sent to another site; INV-002 (no data the product sends reaches anyone it is not meant for).
// ROW-230 wrong product: a page template pulling Google Fonts, a CDN copy of a library, an analytics snippet or an
// ROW-230   error reporter that posts page state (names, kinds) to its own servers; a form whose action is elsewhere.
// ROW-230 given: member M with a sick day pending, colleague C away 10 Mar 2027, the admin. when: each page is
// ROW-230   loaded by its actor — /sign-in anonymous, M's four pages, the admin's seven — with every request the
// ROW-230   browser makes observed. then: no request leaves the product's origin (each is recorded and refused at the
// ROW-230   browser), no form's action and no preconnect or prefetch hint points elsewhere.
// ROW-230 controls: the control case shows the observer sees each page's own requests to the product's origin — the
// ROW-230   denominator is every request, and it is not empty.
// ROW-230 technique: a denominator over every request the browser makes (scripts, styles, fonts, images, beacons,
// ROW-230   fetches), on every page, by every actor.
// ROW-230 cases: ROW-230 target=ROW-230.INV-002.no-page-reaches-another-site control=ROW-230.control.the-observer-sees-each-pages-own-requests
async function observe(browser: Browser, actor: Actor | 'anonymous', path: string) {
  const opened = await openPage(browser, actor);
  const own: string[] = [];
  const foreign: string[] = [];
  const origin = productOrigin();
  await opened.context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (new URL(u).origin === origin) {
      own.push(u);
      return route.continue();
    }
    foreign.push(`${route.request().resourceType()} ${u}`);
    return route.abort();
  });
  try {
    await opened.page.goto(path);
    await settle(opened.page);
    const pointers = await opened.page.evaluate((o) => {
      const out: string[] = [];
      document.querySelectorAll('form[action]').forEach((f) => {
        const a = new URL(f.getAttribute('action') ?? '', document.baseURI);
        if (a.origin !== o) out.push(`form ${a.href}`);
      });
      document.querySelectorAll('link[rel~="preconnect"], link[rel~="dns-prefetch"], link[rel~="prefetch"], link[rel~="preload"]').forEach((l) => {
        const a = new URL(l.getAttribute('href') ?? '', document.baseURI);
        if (a.origin !== o) out.push(`link ${a.href}`);
      });
      return out;
    }, origin);
    return { own, foreign, pointers };
  } finally {
    await opened.close();
  }
}

function visitsFor(w: World): [Actor | 'anonymous', string][] {
  return [
    ['anonymous', '/sign-in'],
    ...pagesFor('member').map((p) => [w.ma, p] as [Actor, string]),
    ...pagesFor('admin', w.m.id).map((p) => [w.admin, p] as [Actor, string]),
  ];
}

test('ROW-230.control.the-observer-sees-each-pages-own-requests', async ({ browser }) => {
  const w = await world();
  for (const [actor, path] of visitsFor(w)) {
    const seen = await observe(browser, actor, path);
    expect.soft(seen.own.length, `ROW-230 control: ${actor === 'anonymous' ? 'anonymous' : actor.kind} ${path} makes requests to the product`).toBeGreaterThan(0);
  }
});

test('ROW-230.INV-002.no-page-reaches-another-site', async ({ browser }) => {
  const w = await world();
  for (const [actor, path] of visitsFor(w)) {
    const who = actor === 'anonymous' ? 'anonymous' : actor.kind;
    const seen = await observe(browser, actor, path);
    expect.soft(seen.own.length, `ROW-230 ${who} ${path}: the page loaded from the product`).toBeGreaterThan(0);
    expect.soft(seen.foreign, `ROW-230 ${who} ${path}: no request to another site`).toEqual([]);
    expect.soft(seen.pointers, `ROW-230 ${who} ${path}: no form or hint pointing to another site`).toEqual([]);
  }
});
