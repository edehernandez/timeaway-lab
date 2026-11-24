// Purpose: ledger tests for the signed-in shell — ROW-113 (the member header on every page, no admin link), ROW-114 (the admin header: the member header plus pending requests and people), ROW-115 (an unknown address shows a not-found page inside the header) and ROW-119 (every signed-in page shows a sign-out control that ends the session and shows the sign-in page).
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create account, the member's own password change), fresh per run.
//
// The pages: D-029's page list (/, /requests/new, /calendar, /password, /admin/pending, /admin/people,
// /admin/people/:id), united with every page file under the tree's app/pages folder (its names only, read the way
// checks/extractors/routes.sh reads them), so a page added later without the header is still visited. The header
// is the banner landmark and links are read by target path (tests/invariants/page-reading.ts), since no design
// marker names them; the paths are D-029's.
//
// ROW-113 promise: REQ-006 (my requests, /), REQ-001 via REQ-006's "offers to send one" (/requests/new), REQ-012
// ROW-113   (the team calendar, /calendar), REQ-015 (change my own password, /password), REQ-014 (signing out ends
// ROW-113   the session) and INV-003 (admin actions are the admin's): signed in as a member who chose their own
// ROW-113   password, every page carries the same header with those four links and a sign-out control, and no
// ROW-113   admin link. Addresses from D-029.
// ROW-113 wrong product: a header drawn only on the home page; a calendar page with its own, different header;
// ROW-113   a header that shows "Pending requests" and "People" to everyone because it never reads isAdmin; a
// ROW-113   sign-out control only on the home page.
// ROW-113 given: a fresh install, a fresh member who has chosen their own password (createMember's default).
// ROW-113   when: the member's browser loads each member page. then: each has exactly one banner; in it visible
// ROW-113   links to /, /requests/new, /calendar and /password and a sign-out control; the banner's link set is
// ROW-113   the same on every page; no link anywhere on the page leads under /admin and nothing in the banner is
// ROW-113   named for pending requests, people or admin.
// ROW-113 controls: the member's session is a non-admin one with no forced password change, and / answers 200
// ROW-113   with a document; the admin's header in ROW-114 shows the admin links the target looks for.
// ROW-113 technique: a census over every page (D-029 plus the page folder), a denominator over every link on the
// ROW-113   page for "no admin link", and the first page's header as the reference for "the same header";
// ROW-113   soft assertions naming the address, so every page and clause is evaluated in the one target case.
// ROW-113 cases: ROW-113 target=ROW-113.REQ-006.member-every-page-carries-the-member-header-and-no-admin-link control=ROW-113.control.member-session-reaches-home
//
// ROW-114 promise: REQ-008 (the pending requests page, /admin/pending), REQ-020 (the people page, /admin/people),
// ROW-114   REQ-014 (sign-out): signed in as the admin, every page carries the member header plus links to pending
// ROW-114   requests and people, and a sign-out control.
// ROW-114 wrong product: admin links drawn only on the admin pages (missing on /calendar); an admin header that
// ROW-114   drops "Change my password" or "Send a request" because it is a separate admin menu; the person page
// ROW-114   /admin/people/:id without the header.
// ROW-114 given: the same install; the admin's session and a member's session. when: the admin's browser loads
// ROW-114   every page, the member page /admin/people/:id included; the member's browser loads /. then: each admin
// ROW-114   page has one banner with visible links to /, /requests/new, /calendar, /password, /admin/pending and
// ROW-114   /admin/people and a sign-out control; its link set is the same on every page and holds every link of
// ROW-114   the member's header (same text, same target).
// ROW-114 controls: the admin's session is the admin's (isAdmin true) and /admin/people answers it 200.
// ROW-114 technique: the member's header as an independent reference (the relation "admin header ⊇ member
// ROW-114   header"), plus the census over every page with soft assertions naming the address.
// ROW-114 cases: ROW-114 target=ROW-114.REQ-008.admin-every-page-carries-the-member-header-plus-pending-and-people control=ROW-114.control.admin-session-reaches-people
//
// ROW-115 promise: REQ-006 (my requests is the way back, /): signed in, an address that does not exist shows a
// ROW-115   not-found page inside the header with a link back to my requests, never a server error or a stack trace.
// ROW-115 wrong product: a 500 with the framework's stack trace; a bare "404" page with no header; a not-found page
// ROW-115   whose only way back is the browser's back button; a catch-all that silently shows the home page.
// ROW-115 given: the member's session; two fresh addresses that no product can have (a top-level one and a nested
// ROW-115   one). when: the browser loads each. then: the answer is not a server error; the page says it was not
// ROW-115   found; it has the header (banner with the link to / and a sign-out control); outside the header it has
// ROW-115   a visible link to /; no stack-trace or server-error text is drawn.
// ROW-115 controls: the same member's / answers 200 and does not say "not found" (the not-found text is not drawn
// ROW-115   on every page).
// ROW-115 technique: fresh unknown addresses (no product can special-case them) and a decoy page that must not
// ROW-115   match the not-found text.
// ROW-115 cases: ROW-115 target=ROW-115.REQ-006.signed-in-unknown-address-shows-not-found-inside-the-header control=ROW-115.control.member-home-is-not-a-not-found-page
//
// ROW-119 promise: REQ-014 "signing out ends the session" (fail-if 5: a session keeps working after signing out)
// ROW-119   and D-003 (sessions are server-side rows, so sign-out ends them at once): every signed-in page shows a
// ROW-119   sign-out control; using it ends the session and the next page shown is the sign-in page.
// ROW-119 wrong product: a sign-out that only deletes the browser's cookie, so the same session token still works;
// ROW-119   a sign-out control missing on the admin pages; a sign-out that leaves the user on the page they were on.
// ROW-119 given: a fresh member session and a fresh admin session (not the shared ones). when: each browser loads
// ROW-119   every page of its actor (the census), then the member operates the sign-out control on /calendar and the
// ROW-119   admin on /admin/people. then: every page had a visible sign-out control; after the click the sign-in
// ROW-119   form (Email, Password, Sign in) is shown; the session's token, replayed from the actor's own API
// ROW-119   context, answers GET /api/me with a refusal; loading / again shows the sign-in form.
// ROW-119 controls: before the click the same session answers GET /api/me 200 and /calendar draws no sign-in form.
// ROW-119 technique: before and after on the same session token (replayed outside the browser, so a
// ROW-119   cookie-only sign-out fails), the real control operated in the browser.
// ROW-119 cases: ROW-119 target=ROW-119.REQ-014.every-signed-in-page-shows-sign-out-and-it-ends-the-session control=ROW-119.control.session-works-before-sign-out
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createMember,
  fresh,
  openPage,
  PAGES,
  resetProduct,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { header, linksTo, NOT_FOUND_TEXT, readLinks, SERVER_ERROR_TEXT, signOutControls, type PageLink } from './page-reading';

const T0 = '2027-02-28T20:00:00Z'; // 2027-03-01 09:00 in Pacific/Auckland; the UTC date differs
const MEMBER_LINKS = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password];
const ADMIN_LINKS = [PAGES.adminPending, PAGES.adminPeople];

let install: Install;
let admin: Actor;
let member: Member;
let memberActor: Actor;

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  member = await createMember(admin);
  memberActor = await signInMember(member);
});

test.afterAll(async () => {
  await memberActor?.dispose();
  await admin?.dispose();
});

/** Page routes from the tree's app/pages folder (file names only), as checks/extractors/routes.sh reads them. */
function folderPages(): string[] {
  const root = path.resolve(__dirname, '..', '..', 'app', 'pages');
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.vue')) {
        const rel = path.relative(root, full).replace(/\\/g, '/').replace(/\.vue$/, '');
        const segs = rel.split('/').map((s) => s.replace(/\[([^\]]*)\]/g, ':$1')).filter((s, i, a) => !(s === 'index' && i === a.length - 1));
        out.push('/' + segs.join('/'));
      }
    }
  };
  walk(root);
  return out.map((p) => (p === '/' ? p : p.replace(/\/+$/, '')));
}

/** The pages an actor visits: D-029's list united with the folder's, the sign-in page left out, admin pages only for the admin. */
function pagesFor(kind: 'member' | 'admin', personId: string | number): { pages: string[]; skipped: string[] } {
  const d029: string[] = [...MEMBER_LINKS];
  if (kind === 'admin') d029.push(PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(personId));
  const pages = new Set(d029);
  const skipped: string[] = [];
  for (const route of folderPages()) {
    if (route === PAGES.signIn) continue;
    const isAdminPage = route === '/admin' || route.startsWith('/admin/');
    if (isAdminPage && kind !== 'admin') continue;
    if (/^\/admin\/people\/:[^/]+$/.test(route)) {
      pages.add(PAGES.adminPerson(personId));
      continue;
    }
    if (route.includes(':')) {
      skipped.push(route);
      continue;
    }
    pages.add(route);
  }
  return { pages: [...pages], skipped };
}

async function load(page: Page, address: string): Promise<number> {
  const response = await page.goto(address);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return response?.status() ?? 0;
}

function signature(links: PageLink[]): string[] {
  return [...new Set(links.filter((l) => l.inBanner && l.visible).map((l) => `${l.text} -> ${l.path}`))].sort();
}

/** Checks one loaded page's header for the given link targets and a sign-out control; returns the header's link signature. */
async function checkHeader(page: Page, row: string, address: string, targets: string[]): Promise<string[]> {
  await expect.soft(header(page), `${row} ${address}: exactly one header (banner landmark)`).toHaveCount(1);
  const links = await readLinks(page);
  const inHeader = links.filter((l) => l.inBanner);
  for (const target of targets) {
    const found = linksTo(inHeader, target);
    expect.soft(found.length, `${row} ${address}: the header has a visible link to ${target}`).toBeGreaterThan(0);
    for (const l of found) expect.soft(l.text, `${row} ${address}: the header's link to ${target} has a name`).not.toBe('');
  }
  const signOut = signOutControls(header(page).first());
  expect.soft(await signOut.count(), `${row} ${address}: the header has a sign-out control`).toBeGreaterThan(0);
  if ((await signOut.count()) > 0) await expect.soft(signOut.first(), `${row} ${address}: the sign-out control is visible`).toBeVisible();
  return signature(links);
}

test('ROW-113.control.member-session-reaches-home', async ({ browser }) => {
  expect(memberActor.me.isAdmin, 'ROW-113 control: the member is not the admin').toBe(false);
  const me = await memberActor.api.get('/api/me');
  expect(me.status(), 'ROW-113 control: the member session answers GET /api/me').toBe(200);
  expect((await me.json()).mustChangePassword, 'ROW-113 control: the member has chosen their own password').toBe(false);
  const opened = await openPage(browser, memberActor);
  try {
    expect(await load(opened.page, PAGES.home), 'ROW-113 control: / answers the member 200').toBe(200);
    await expect(opened.page.locator('body'), 'ROW-113 control: a document is rendered').toBeAttached();
  } finally {
    await opened.close();
  }
});

test('ROW-113.REQ-006.member-every-page-carries-the-member-header-and-no-admin-link', async ({ browser }) => {
  const { pages, skipped } = pagesFor('member', member.id);
  if (skipped.length) test.info().annotations.push({ type: 'ROW-113 pages not visited (unknown dynamic segment)', description: skipped.join(', ') });
  const opened = await openPage(browser, memberActor);
  const page = opened.page;
  let reference: string[] | null = null;
  try {
    for (const address of pages) {
      const status = await load(page, address);
      expect.soft(status, `ROW-113 ${address}: the page answers 200`).toBe(200);
      const sig = await checkHeader(page, 'ROW-113', address, MEMBER_LINKS);
      if (reference === null) reference = sig;
      else expect.soft(sig, `ROW-113 ${address}: the same header as on ${pages[0]}`).toEqual(reference);

      const links = await readLinks(page);
      const adminLinks = links.filter((l) => /^\/admin(\/|$)/.test(l.path)).map((l) => `${l.text} -> ${l.path}`);
      expect.soft(adminLinks, `ROW-113 ${address}: no link to an admin page`).toEqual([]);
      const named = await header(page)
        .locator('a, button, [role="link"], [role="button"]')
        .evaluateAll((els) =>
          els
            .map((el) => `${(el as HTMLElement).innerText || ''} ${el.getAttribute('aria-label') || ''}`.replace(/\s+/g, ' ').trim())
            .filter((t) => /\b(pending|people|admin)\b/i.test(t)),
        );
      expect.soft(named, `ROW-113 ${address}: nothing in the header is named for pending requests, people or admin`).toEqual([]);
    }
  } finally {
    await opened.close();
  }
});

test('ROW-114.control.admin-session-reaches-people', async ({ browser }) => {
  expect(admin.me.isAdmin, 'ROW-114 control: the admin session is the admin').toBe(true);
  const opened = await openPage(browser, admin);
  try {
    expect(await load(opened.page, PAGES.adminPeople), 'ROW-114 control: /admin/people answers the admin 200').toBe(200);
  } finally {
    await opened.close();
  }
});

test('ROW-114.REQ-008.admin-every-page-carries-the-member-header-plus-pending-and-people', async ({ browser }) => {
  // The member's header, read on the member's own home page: the independent reference.
  const memberOpened = await openPage(browser, memberActor);
  let memberHeader: string[] = [];
  try {
    expect.soft(await load(memberOpened.page, PAGES.home), 'ROW-114 member /: answers 200').toBe(200);
    memberHeader = signature(await readLinks(memberOpened.page));
  } finally {
    await memberOpened.close();
  }
  expect.soft(memberHeader.length, 'ROW-114: the member header has links to compare with').toBeGreaterThan(0);

  const { pages, skipped } = pagesFor('admin', member.id);
  if (skipped.length) test.info().annotations.push({ type: 'ROW-114 pages not visited (unknown dynamic segment)', description: skipped.join(', ') });
  const opened = await openPage(browser, admin);
  const page = opened.page;
  let reference: string[] | null = null;
  try {
    for (const address of pages) {
      const status = await load(page, address);
      expect.soft(status, `ROW-114 ${address}: the page answers 200`).toBe(200);
      const sig = await checkHeader(page, 'ROW-114', address, [...MEMBER_LINKS, ...ADMIN_LINKS]);
      if (reference === null) reference = sig;
      else expect.soft(sig, `ROW-114 ${address}: the same header as on ${pages[0]}`).toEqual(reference);
      const missing = memberHeader.filter((l) => !sig.includes(l));
      expect.soft(missing, `ROW-114 ${address}: the admin header carries every link of the member header`).toEqual([]);
    }
  } finally {
    await opened.close();
  }
});

test('ROW-115.control.member-home-is-not-a-not-found-page', async ({ browser }) => {
  const opened = await openPage(browser, memberActor);
  try {
    expect(await load(opened.page, PAGES.home), 'ROW-115 control: / answers the member 200').toBe(200);
    const text = await opened.page.locator('body').innerText();
    expect(NOT_FOUND_TEXT.test(text), 'ROW-115 control: the member\'s home does not say "not found"').toBe(false);
  } finally {
    await opened.close();
  }
});

test('ROW-115.REQ-006.signed-in-unknown-address-shows-not-found-inside-the-header', async ({ browser }) => {
  const addresses = [`/${fresh('no-such-page')}`, `/${fresh('nowhere')}/${fresh('deeper')}`];
  const opened = await openPage(browser, memberActor);
  const page = opened.page;
  try {
    for (const address of addresses) {
      const status = await load(page, address);
      expect.soft(status, `ROW-115 ${address}: not a server error`).toBeLessThan(500);
      expect.soft(status, `ROW-115 ${address}: the address answered`).toBeGreaterThan(0);
      const text = await page.locator('body').innerText().catch(() => '');
      expect.soft(NOT_FOUND_TEXT.test(text), `ROW-115 ${address}: the page says it was not found`).toBe(true);
      expect.soft(text.match(SERVER_ERROR_TEXT)?.[0] ?? null, `ROW-115 ${address}: no server error or stack trace drawn`).toBeNull();

      await expect.soft(header(page), `ROW-115 ${address}: the not-found page is inside the header`).toHaveCount(1);
      const links = await readLinks(page);
      expect.soft(linksTo(links.filter((l) => l.inBanner), PAGES.home).length, `ROW-115 ${address}: the header links to my requests`).toBeGreaterThan(0);
      expect
        .soft(await signOutControls(header(page).first()).count(), `ROW-115 ${address}: the header has its sign-out control`)
        .toBeGreaterThan(0);
      const back = linksTo(links.filter((l) => !l.inBanner), PAGES.home);
      expect.soft(back.length, `ROW-115 ${address}: the not-found page itself links back to my requests (/)`).toBeGreaterThan(0);
    }
  } finally {
    await opened.close();
  }
});

test('ROW-119.control.session-works-before-sign-out', async ({ browser }) => {
  const session = await signInMember(member);
  const opened = await openPage(browser, session);
  try {
    expect((await session.api.get('/api/me')).status(), 'ROW-119 control: the fresh session answers GET /api/me').toBe(200);
    expect(await load(opened.page, PAGES.calendar), 'ROW-119 control: /calendar answers 200').toBe(200);
    await expect(opened.page.getByLabel('Password', { exact: true }), 'ROW-119 control: /calendar draws no sign-in form').toHaveCount(0);
  } finally {
    await opened.close();
    await session.dispose();
  }
});

async function signOutFrom(page: Page, session: Actor, address: string, row: string): Promise<void> {
  expect((await session.api.get('/api/me')).status(), `${row} ${address}: before the click the session works`).toBe(200);
  expect.soft(await load(page, address), `${row} ${address}: answers 200`).toBe(200);
  const control = signOutControls(page).first();
  await control.click({ timeout: 10_000 });
  await expect(page.getByLabel('Password', { exact: true }), `${row}: after signing out from ${address} the sign-in page is shown`).toBeVisible({ timeout: 10_000 });
  await expect.soft(page.getByLabel('Email', { exact: true }), `${row}: the sign-in page's Email field`).toBeVisible();
  await expect.soft(page.getByRole('button', { name: 'Sign in', exact: true }), `${row}: the sign-in page's Sign in button`).toBeVisible();
  const replay = await session.api.get('/api/me');
  expect.soft([401, 403], `${row}: the signed-out session's own token is refused by GET /api/me (answered ${replay.status()})`).toContain(replay.status());
  const inBrowser = await page.request.get('/api/me');
  expect.soft([401, 403], `${row}: the browser's GET /api/me is refused after signing out (answered ${inBrowser.status()})`).toContain(inBrowser.status());
  await load(page, PAGES.home);
  await expect.soft(page.getByLabel('Password', { exact: true }), `${row}: loading / after signing out shows the sign-in page`).toBeVisible();
}

test('ROW-119.REQ-014.every-signed-in-page-shows-sign-out-and-it-ends-the-session', async ({ browser }) => {
  const memberSession = await signInMember(member);
  const adminSession = await signIn(install.admin);
  try {
    for (const [session, kind] of [
      [memberSession, 'member'],
      [adminSession, 'admin'],
    ] as const) {
      const opened = await openPage(browser, session);
      try {
        for (const address of pagesFor(kind, member.id).pages) {
          await load(opened.page, address);
          const controls = signOutControls(opened.page);
          expect.soft(await controls.count(), `ROW-119 ${kind} ${address}: a sign-out control is shown`).toBeGreaterThan(0);
          if ((await controls.count()) > 0) await expect.soft(controls.first(), `ROW-119 ${kind} ${address}: it is visible`).toBeVisible();
        }
        await signOutFrom(opened.page, session, kind === 'member' ? PAGES.calendar : PAGES.adminPeople, `ROW-119 ${kind}`);
      } finally {
        await opened.close();
      }
    }
  } finally {
    await memberSession.dispose();
    await adminSession.dispose();
  }
});
