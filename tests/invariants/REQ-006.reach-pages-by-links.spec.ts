// Purpose: ledger tests for reachability — ROW-116 (from the page shown right after signing in, a member reaches my requests, send a request, the team calendar and change my password through visible links, and every header link resolves to a page) and ROW-117 (the admin reaches pending requests, people, and from people each person's requests page, through visible links).
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create accounts, the members' own password change, send requests), fresh per run.
//
// The targets are D-029's pages: / (my requests, REQ-006), /requests/new (send a request, REQ-001), /calendar
// (REQ-012), /password (REQ-015), /admin/pending (REQ-008), /admin/people (REQ-020), /admin/people/:id (REQ-021).
// Links are found by their target path among the page's visible <a href> (tests/invariants/page-reading.ts) and
// operated with a real click; a page that is only reachable by typing its address fails.
//
// ROW-116 promise: REQ-006, REQ-001, REQ-012, REQ-015 — a member who has chosen their own password reaches each of
// ROW-116   their four pages from the first page they see after signing in, through visible links, and every link
// ROW-116   in the header resolves to a page.
// ROW-116 wrong product: a landing page with no way to /password (only typed); a "Send a request" link hidden in a
// ROW-116   collapsed menu that is never shown; a header link to /calendar/ that answers 404; a link that routes
// ROW-116   client-side to a not-found screen.
// ROW-116 given: a fresh member (own password chosen). when: the member signs in through the sign-in form, and on
// ROW-116   the page then shown clicks the visible link to each target. then: the browser is at the target and it
// ROW-116   is not a not-found page; every visible header link of the landing page, loaded directly, answers 200
// ROW-116   and is not a not-found page.
// ROW-116 controls: the control case shows the sign-in form leads to a signed-in page other than /sign-in, so the
// ROW-116   target's failures are about links, not about signing in.
// ROW-116 technique: real clicks on the visible links from the real landing page (no address typed for a
// ROW-116   target), plus a census over every header link; soft assertions per target.
// ROW-116 cases: ROW-116 target=ROW-116.REQ-006.member-reaches-own-pages-by-visible-links-and-every-header-link-resolves control=ROW-116.control.member-sign-in-lands-on-a-signed-in-page
//
// ROW-117 promise: REQ-008 (the pending page), REQ-020 (the people page), REQ-021 ("From the people page the admin
// ROW-117   opens any person's requests page"): from the page shown right after signing in, the admin reaches pending
// ROW-117   requests and people through visible links, and from people each person's requests page.
// ROW-117 wrong product: a people page listing names with no link to their requests; every person's link
// ROW-117   pointing at the same page (or at the admin's own); the admin's own row without a link; pending
// ROW-117   requests reachable only by typing /admin/pending.
// ROW-117 given: two fresh members and the admin, each with one pending request on its own distinct days
// ROW-117   (A 15–16 March, B 22–23 March, the admin 29–30 March 2027; the clock 1 March 2027 in Pacific/Auckland).
// ROW-117   when: the admin signs in through the form, clicks the visible link to /admin/pending, then from the
// ROW-117   landing page the visible link to /admin/people, and there the visible link to each person's
// ROW-117   /admin/people/:id. then: each click lands on its target; the pending page shows the three people's names;
// ROW-117   each person's page shows that person's name and their own request's first day and neither other
// ROW-117   person's first day.
// ROW-117 controls: the control case shows the admin's sign-in form lands on a signed-in page, and the admin's
// ROW-117   API sees the three pending requests (the data the pages draw exists).
// ROW-117 technique: decoys — every person's request on distinct days, so a link to the wrong person's page shows
// ROW-117   the wrong first day; days of the month above 12, so no day/month reading can confuse two of them.
// ROW-117 cases: ROW-117 target=ROW-117.REQ-021.admin-reaches-pending-people-and-each-persons-page-by-visible-links control=ROW-117.control.admin-sign-in-lands-and-pending-exists
import { test, expect, type Page } from '@playwright/test';
import {
  createMember,
  openPage,
  PAGES,
  productUrl,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  signInThroughPage,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { hasDate, header, linksTo, literal, NOT_FOUND_TEXT, readLinks } from './page-reading';

const T0 = '2027-02-28T20:00:00Z'; // 2027-03-01 09:00 in Pacific/Auckland; the UTC date differs
const MEMBER_TARGETS = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password];

let install: Install;
let admin: Actor;
let memberA: Member;
let memberB: Member;
const firstDays: Record<string, string> = {};

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  memberA = await createMember(admin);
  memberB = await createMember(admin);
  const a = await signInMember(memberA);
  const b = await signInMember(memberB);
  try {
    await sendRequest(a, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
    await sendRequest(b, { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23' });
    await sendRequest(admin, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' });
  } finally {
    await a.dispose();
    await b.dispose();
  }
  firstDays[String(memberA.id)] = '2027-03-15';
  firstDays[String(memberB.id)] = '2027-03-22';
  firstDays[String(admin.me.id)] = '2027-03-29';
});

test.afterAll(async () => {
  await admin?.dispose();
});

function urlOf(target: string): RegExp {
  return new RegExp(`^${literal(productUrl() + target)}(?:[?#].*)?$`);
}

/** Signs in through the form and waits for the page then shown; returns its path. */
async function signInAndLand(page: Page, credentials: { email: string; password: string }): Promise<string> {
  await signInThroughPage(page, credentials);
  await page.waitForURL((u) => u.pathname !== PAGES.signIn, { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return new URL(page.url()).pathname;
}

/** Clicks the first visible link to `target` on the loaded page; returns false (and records a soft failure) when there is none. */
async function clickLinkTo(page: Page, target: string, row: string, from: string): Promise<boolean> {
  const found = linksTo(await readLinks(page), target);
  expect.soft(found.length, `${row}: ${from} shows a visible link to ${target}`).toBeGreaterThan(0);
  if (found.length === 0) return false;
  await page.locator('a[href]').nth(found[0].index).click();
  await expect.soft(page, `${row}: the link from ${from} leads to ${target}`).toHaveURL(urlOf(target), { timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const text = await page.locator('body').innerText().catch(() => '');
  expect.soft(NOT_FOUND_TEXT.test(text), `${row}: ${target}, reached by its link, is not a not-found page`).toBe(false);
  return true;
}

test('ROW-116.control.member-sign-in-lands-on-a-signed-in-page', async ({ browser }) => {
  const opened = await openPage(browser, 'anonymous');
  try {
    const landing = await signInAndLand(opened.page, memberA);
    expect(landing, 'ROW-116 control: the page shown after signing in is not the sign-in page').not.toBe(PAGES.signIn);
  } finally {
    await opened.close();
  }
});

test('ROW-116.REQ-006.member-reaches-own-pages-by-visible-links-and-every-header-link-resolves', async ({ browser }) => {
  const opened = await openPage(browser, 'anonymous');
  const page = opened.page;
  try {
    const landing = await signInAndLand(page, memberA);
    for (const target of MEMBER_TARGETS) {
      if (new URL(page.url()).pathname !== landing) {
        await page.goto(landing);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      }
      await clickLinkTo(page, target, 'ROW-116', `the landing page ${landing}`);
    }

    await page.goto(landing);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await expect.soft(header(page), 'ROW-116: the landing page has a header').toHaveCount(1);
    const headerLinks = (await readLinks(page)).filter((l) => l.inBanner && l.visible);
    expect.soft(headerLinks.length, 'ROW-116: the landing page header has links').toBeGreaterThan(0);
    for (const target of [...new Set(headerLinks.map((l) => l.path))]) {
      expect.soft(target.startsWith('/'), `ROW-116: the header link ${target} stays in the product`).toBe(true);
      if (!target.startsWith('/')) continue;
      const response = await page.goto(target);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      expect.soft(response?.status(), `ROW-116: the header link ${target} resolves to a page (200)`).toBe(200);
      const text = await page.locator('body').innerText().catch(() => '');
      expect.soft(NOT_FOUND_TEXT.test(text), `ROW-116: the header link ${target} is not a not-found page`).toBe(false);
    }
  } finally {
    await opened.close();
  }
});

test('ROW-117.control.admin-sign-in-lands-and-pending-exists', async ({ browser }) => {
  const pending = await admin.api.get('/api/admin/pending');
  expect(pending.status(), 'ROW-117 control: GET /api/admin/pending answers the admin').toBe(200);
  const body = await pending.text();
  for (const name of [memberA.name, memberB.name, install.admin.name]) {
    expect(body, `ROW-117 control: the pending data carries ${name}`).toContain(name);
  }
  const opened = await openPage(browser, 'anonymous');
  try {
    const landing = await signInAndLand(opened.page, install.admin);
    expect(landing, 'ROW-117 control: the page shown after signing in is not the sign-in page').not.toBe(PAGES.signIn);
  } finally {
    await opened.close();
  }
});

test('ROW-117.REQ-021.admin-reaches-pending-people-and-each-persons-page-by-visible-links', async ({ browser }) => {
  const opened = await openPage(browser, 'anonymous');
  const page = opened.page;
  try {
    const landing = await signInAndLand(page, install.admin);

    if (await clickLinkTo(page, PAGES.adminPending, 'ROW-117', `the landing page ${landing}`)) {
      const text = await page.locator('body').innerText();
      for (const name of [memberA.name, memberB.name, install.admin.name]) {
        expect.soft(text, `ROW-117: the pending page reached by its link shows ${name}'s request`).toContain(name);
      }
    }

    await page.goto(landing);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    if (!(await clickLinkTo(page, PAGES.adminPeople, 'ROW-117', `the landing page ${landing}`))) return;

    const people: { id: string | number; name: string }[] = [
      { id: admin.me.id, name: install.admin.name },
      { id: memberA.id, name: memberA.name },
      { id: memberB.id, name: memberB.name },
    ];
    for (const person of people) {
      if (new URL(page.url()).pathname !== PAGES.adminPeople) {
        await page.goto(PAGES.adminPeople);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      }
      const target = PAGES.adminPerson(person.id);
      if (!(await clickLinkTo(page, target, 'ROW-117', 'the people page'))) continue;
      const text = await page.locator('body').innerText();
      expect.soft(text, `ROW-117 ${target}: the page shows ${person.name}`).toContain(person.name);
      const own = firstDays[String(person.id)];
      expect.soft(hasDate(text, own), `ROW-117 ${target}: the page shows ${person.name}'s request (first day ${own})`).toBe(true);
      for (const other of people.filter((p) => p !== person)) {
        const day = firstDays[String(other.id)];
        expect.soft(hasDate(text, day), `ROW-117 ${target}: the page does not show ${other.name}'s request (first day ${day})`).toBe(false);
      }
    }
  } finally {
    await opened.close();
  }
});
