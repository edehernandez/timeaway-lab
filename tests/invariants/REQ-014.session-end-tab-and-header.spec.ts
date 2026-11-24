// Purpose: ledger tests for ROW-217 and ROW-218 (REQ-014) — when a session ends (switch-off, password change, sign-out elsewhere) the open tab goes to the sign-in page with a plain line saying the session ended; the header shows the signed-in person's display name on every page.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals, switch, password change, sign-out, rename), fresh per run.
//
// Boundary (R6): what an open tab does and what the header paints are browser behaviour, proved in the browser; the
// events that end a session are made at the HTTP harness, as another tab or the admin would. The tab and the actor's
// API context share one session (harness openPage copies the actor's cookie), so a sign-out on the actor is a
// sign-out "elsewhere" for the tab. The header is the banner landmark (robustness.ts).
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  freshName,
  freshPassword,
  openPage,
  rename,
  sendRequest,
  signInMember,
  signOut,
  switchAccount,
} from './harness';
import { bannerText, disposeAll, freshTeam, keep, pagesFor, settle, textLines } from './robustness';

test.afterEach(disposeAll);

/** A plain line saying the session ended. */
const SESSION_ENDED = /session[^.\n]{0,40}\b(ended|expired|is over|has ended|timed out|no longer)\b|\b(you have been|you were|you've been|you are now) signed out\b/i;

async function landsOnSignInSayingSo(page: Page, row: string, cause: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: `${row} ${cause}: the tab goes to /sign-in`, timeout: 15_000 }).toBe('/sign-in');
  await settle(page);
  const lines = await textLines(page);
  expect.soft(lines.some((l) => SESSION_ENDED.test(l)), `${row} ${cause}: a plain line says the session ended (${JSON.stringify(lines)})`).toBe(true);
}

// ---------------------------------------------------------------------------------------------------
// ROW-217 promise: the row — when a session ends (switch-off, password change, sign-out elsewhere) the open tab goes
// ROW-217   to the sign-in page with a plain line saying the session ended; REQ-014 (a switched-off account's session
// ROW-217   ends at once; signing out ends the session), REQ-015 (a password change ends the other sessions).
// ROW-217 wrong product: a tab that, on its next page, shows an empty page or "Error 401" and stays put; or one that
// ROW-217   goes to /sign-in with no word of why, so the person thinks they mistyped; or a sign-in page that always says
// ROW-217   "you are signed out" whether or not a session ended.
// ROW-217 given: members A, B, C, each with a tab open on a product page. when: the admin switches A off and A's tab
// ROW-217   reloads; B changes the password from another session and B's tab moves to another page; C's session is
// ROW-217   signed out elsewhere and C's tab reloads. then: each tab ends on /sign-in showing a line that says the
// ROW-217   session ended.
// ROW-217 controls: the control case opens /sign-in fresh, with no session ever: no such line — so the line is the
// ROW-217   session end's, not the page's standing text — and a member's tab opens /calendar while signed in.
// ROW-217 technique: the row's three causes, each on its own account; the decoy is the sign-in page without a cause.
// ROW-217 cases: ROW-217 target=ROW-217.REQ-014.an-ended-session-sends-the-tab-to-sign-in-saying-so control=ROW-217.control.a-fresh-sign-in-page-says-no-session-ended
test('ROW-217.control.a-fresh-sign-in-page-says-no-session-ended', async ({ browser }) => {
  const { admin } = await freshTeam();
  const a = keep(await signInMember(await createMember(admin)));
  const anon = await openPage(browser, 'anonymous');
  try {
    await anon.page.goto('/sign-in');
    await settle(anon.page);
    expect((await textLines(anon.page)).filter((l) => SESSION_ENDED.test(l)), 'ROW-217 control: a fresh sign-in page says no session ended').toEqual([]);
  } finally {
    await anon.close();
  }
  const tab = await openPage(browser, a);
  try {
    const r = await tab.page.goto('/calendar');
    expect(r?.status(), 'ROW-217 control: the signed-in tab opens /calendar').toBe(200);
    expect(new URL(tab.page.url()).pathname, 'ROW-217 control: and stays there').toBe('/calendar');
  } finally {
    await tab.close();
  }
});

test('ROW-217.REQ-014.an-ended-session-sends-the-tab-to-sign-in-saying-so', async ({ browser }) => {
  const { admin } = await freshTeam();

  // Switch-off.
  const aMember = await createMember(admin);
  const a = keep(await signInMember(aMember));
  const tabA = await openPage(browser, a);
  try {
    await tabA.page.goto('/calendar');
    await settle(tabA.page);
    await switchAccount(admin, aMember.id, false);
    await tabA.page.reload();
    await landsOnSignInSayingSo(tabA.page, 'ROW-217', 'switch-off');
  } finally {
    await tabA.close();
  }

  // Password change from another session.
  const bMember = await createMember(admin);
  const bTab = keep(await signInMember(bMember));
  const bOther = keep(await signInMember(bMember));
  const tabB = await openPage(browser, bTab);
  try {
    await tabB.page.goto('/');
    await settle(tabB.page);
    const res = await bOther.api.post('/api/me/password', { data: { current: bMember.password, next: freshPassword() } });
    expect(res.status(), 'ROW-217 setup: the password change from the other session is accepted').toBeLessThan(300);
    const link = tabB.page.locator('a[href="/calendar"], a[href="/requests/new"], a[href="/password"]').first();
    if ((await link.count()) > 0) await link.click();
    else await tabB.page.goto('/calendar');
    await landsOnSignInSayingSo(tabB.page, 'ROW-217', 'password change');
  } finally {
    await tabB.close();
  }

  // Sign-out elsewhere (the same session, signed out from another tab).
  const c = keep(await signInMember(await createMember(admin)));
  const tabC = await openPage(browser, c);
  try {
    await tabC.page.goto('/requests/new');
    await settle(tabC.page);
    await signOut(c);
    await tabC.page.reload();
    await landsOnSignInSayingSo(tabC.page, 'ROW-217', 'sign-out elsewhere');
  } finally {
    await tabC.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-218 promise: the row — the header shows the signed-in person's display name on every page; REQ-014 (every page
// ROW-218   is a signed-in person's), A-029 (each account carries a display name the admin can change).
// ROW-218 wrong product: a header that shows the name only on /, or the email, or the name cached at sign-in so a
// ROW-218   rename never reaches it; or the name of whoever is listed first on the page.
// ROW-218 given: member A; member B whose name differs from A's in its last letter only, away Mon 8 to Fri 12 Mar 2027
// ROW-218   (approved), so B's name is on the calendar page. when: A opens /, /requests/new, /calendar and /password;
// ROW-218   the admin opens those and /admin/pending, /admin/people, /admin/people/:A; the admin then renames A and A
// ROW-218   reloads /. then: A's header holds A's name and not B's on every page; the admin's header holds the admin's
// ROW-218   name and not A's; after the rename A's header holds the new name and not the old one.
// ROW-218 controls: the control case shows /api/me answering A's name for A's session, and B's name on A's calendar
// ROW-218   page outside the header — the decoy is on the page, so its absence from the header means something.
// ROW-218 technique: one exact place (the banner landmark), a near-miss decoy name on the same page, and a
// ROW-218   before/after rename.
// ROW-218 cases: ROW-218 target=ROW-218.REQ-014.the-header-names-the-signed-in-person-on-every-page control=ROW-218.control.the-decoy-name-is-on-the-calendar-page
async function twoNames() {
  const { install, admin } = await freshTeam();
  const aName = freshName('Ilse');
  const bName = aName.slice(0, -1) + (aName.endsWith('x') ? 'y' : 'x');
  const aMember = await createMember(admin, { name: aName });
  const bMember = await createMember(admin, { name: bName });
  const b = keep(await signInMember(bMember));
  await approve(admin, await sendRequest(b, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));
  const a = keep(await signInMember(aMember));
  return { install, admin, a, aMember, bName };
}

test('ROW-218.control.the-decoy-name-is-on-the-calendar-page', async ({ browser }) => {
  const { a, aMember, bName } = await twoNames();
  expect(a.me.name, "ROW-218 control: /api/me answers A's name").toBe(aMember.name);
  const tab = await openPage(browser, a);
  try {
    await tab.page.goto('/calendar');
    await settle(tab.page);
    expect((await textLines(tab.page)).join('\n'), "ROW-218 control: B's name is on A's calendar page").toContain(bName);
  } finally {
    await tab.close();
  }
});

test('ROW-218.REQ-014.the-header-names-the-signed-in-person-on-every-page', async ({ browser }) => {
  const { install, admin, a, aMember, bName } = await twoNames();
  const tabA = await openPage(browser, a);
  try {
    for (const path of pagesFor('member')) {
      await tabA.page.goto(path);
      await settle(tabA.page);
      const banner = await bannerText(tabA.page);
      expect.soft(banner, `ROW-218 member ${path}: the page has a header`).not.toBeNull();
      expect.soft(banner ?? '', `ROW-218 member ${path}: the header shows A's name`).toContain(aMember.name);
      expect.soft(banner ?? '', `ROW-218 member ${path}: the header does not show B's`).not.toContain(bName);
    }
  } finally {
    await tabA.close();
  }
  const tabAdmin = await openPage(browser, admin);
  try {
    for (const path of pagesFor('admin', aMember.id)) {
      await tabAdmin.page.goto(path);
      await settle(tabAdmin.page);
      const banner = await bannerText(tabAdmin.page);
      expect.soft(banner ?? '', `ROW-218 admin ${path}: the header shows the admin's name`).toContain(install.admin.name);
      expect.soft(banner ?? '', `ROW-218 admin ${path}: the header does not show A's`).not.toContain(aMember.name);
    }
  } finally {
    await tabAdmin.close();
  }
  const renamed = freshName('Renate');
  await rename(admin, aMember.id, renamed);
  const again = await openPage(browser, a);
  try {
    await again.page.goto('/');
    await settle(again.page);
    const banner = await bannerText(again.page);
    expect.soft(banner ?? '', "ROW-218 after the rename: A's header shows the new name").toContain(renamed);
    expect.soft(banner ?? '', "ROW-218 after the rename: A's header no longer shows the old name").not.toContain(aMember.name);
  } finally {
    await again.close();
  }
});
