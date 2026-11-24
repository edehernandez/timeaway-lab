// Purpose: ledger test for ROW-280 (REQ-006) — signed in as a member who has chosen their own password, / is that person's own requests page: it loads inside the header and shows their requests, or a message that there are none with a way to send one.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, accounts with their own chosen password, requests), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): a route that loads, inside the header, and draws a person's own list or its empty state is paint,
// proved in the browser at D-029's "/". Readings: route-reading.ts (status, path, header, text outside the header),
// page-reading.ts (English dates, links and whether they sit in the header).
//
// ROW-280 promise: REQ-006 "a person's own requests page lists every request they have sent … with no requests it
// ROW-280   says so and offers to send one; it shows no other person's requests"; the row: signed in as a member who
// ROW-280   has chosen their own password, / is that page, inside the header. Authority: REQ-006 (A-015, A-023, A-030).
// ROW-280 wrong product: no page at / (404) or / redirecting a signed-in member to /sign-in or /requests/new; a /
// ROW-280   drawn without the header; a / listing the whole team's requests (or only the first of the member's); a
// ROW-280   / that draws the empty-state sentence whatever the list holds, or an empty list with no message and only
// ROW-280   the header's link to send.
// ROW-280 given: team today Mon 2027-03-08 (Pacific/Auckland); member M (own password) with two requests,
// ROW-280   15–17 March and 19–20 April 2027; member N with one, 22–23 March; member E with none. when: M opens / before
// ROW-280   any request is sent; then, the requests sent, M opens /, then E opens /. then: each answers 200 at /, with
// ROW-280   one header and something drawn outside it; M's page draws the first day of each of M's two requests, not N's days or N's name, and no empty-state sentence; E's page draws an
// ROW-280   empty-state sentence, none of M's or N's days, and outside the header a link to /requests/new (or a button
// ROW-280   that lands there).
// ROW-280 controls: the control case — the browser context carries M's session (GET /api/me answers M's id) and the
// ROW-280   product's own list route holds M's two requests and none of E's — so a red target is the page, not the
// ROW-280   session or the data.
// ROW-280 technique: decoys — N's request on days of its own, and a neighbour of E with requests, so a page of the
// ROW-280   team's list or a fixed empty sentence fails; days of the month above 12, so no day/month reading confuses them.
// ROW-280 cases: ROW-280 target=ROW-280.REQ-006.home-is-the-members-own-requests-page-inside-the-header control=ROW-280.control.member-session-and-own-requests-exist
import { test, expect, type Page } from '@playwright/test';
import { createMember, freshName, openPage, PAGES, resetProduct, sendRequest, signIn, signInMember, type Actor, type Member } from './harness';
import { hasDate, linksTo, readLinks } from './page-reading';
import { readOwnRequests } from './lists';
import { contentWhen, currentPath, openRoute, routeProblems } from './route-reading';

const T0 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; in UTC still Sunday 2027-03-07
const M_DAYS = [
  { firstDay: '2027-03-15', lastDay: '2027-03-17' },
  { firstDay: '2027-04-19', lastDay: '2027-04-20' },
];
const N_DAYS = { firstDay: '2027-03-22', lastDay: '2027-03-23' };

/** A sentence of the empty-state kind (the reading of ROW-029's test). */
const EMPTY =
  /\b(?:no|not any|none|nothing)\b[^.!?\n]{0,40}\brequests?\b|\b(?:haven['’]?t|have not|not yet)\b[^.!?\n]{0,40}\b(?:sent|made|requested|asked|any)\b|\bnothing (?:here|yet)\b/i;

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface World {
  m: Member;
  n: Member;
  e: Member;
  mActor: Actor;
  eActor: Actor;
}

/** The accounts alone (no requests yet): what the route check before the data needs. */
async function accounts(): Promise<World & { nActor: Actor }> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const m = await createMember(admin, { name: freshName('Mira') });
  const n = await createMember(admin, { name: freshName('Nils') });
  const e = await createMember(admin, { name: freshName('Elif') });
  const mActor = await signInMember(m);
  const nActor = await signInMember(n);
  const eActor = await signInMember(e);
  actors.push(mActor, nActor, eActor);
  return { m, n, e, mActor, nActor, eActor };
}

/** M's two requests and N's one. */
async function populate(w: World & { nActor: Actor }): Promise<void> {
  for (const days of M_DAYS) await sendRequest(w.mActor, { kind: 'vacation', ...days });
  await sendRequest(w.nActor, { kind: 'vacation', ...N_DAYS });
}

async function world(): Promise<World> {
  const w = await accounts();
  await populate(w);
  return w;
}

/** True when the element is inside the page's header (banner landmark). */
async function inHeader(page: Page, index: number, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .nth(index)
    .evaluate((el) => {
      if (el.closest('[role="banner"]')) return true;
      const h = el.closest('header');
      return !!h && !h.parentElement?.closest('article, aside, main, nav, section, [role="main"]');
    })
    .catch(() => false);
}

/** Whether the page offers, outside the header, a link to /requests/new or a button that lands there. */
async function offersToSend(page: Page): Promise<boolean> {
  const links = linksTo(await readLinks(page), PAGES.newRequest).filter((l) => !l.inBanner);
  if (links.length > 0) return true;
  const selector = 'button, [role="button"]';
  const count = await page.locator(selector).count();
  for (let i = 0; i < count; i += 1) {
    const b = page.locator(selector).nth(i);
    const name = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || '').trim();
    if (!/\b(send|new|request|ask)\b/i.test(name)) continue;
    if (!(await b.isVisible().catch(() => false)) || (await inHeader(page, i, selector))) continue;
    await b.click().catch(() => undefined);
    await page.waitForURL((u) => u.pathname.replace(/\/+$/, '') === PAGES.newRequest, { timeout: 10_000 }).catch(() => undefined);
    return currentPath(page) === PAGES.newRequest;
  }
  return false;
}

test('ROW-280.control.member-session-and-own-requests-exist', async ({ browser }) => {
  const w = await world();
  const opened = await openPage(browser, w.mActor);
  try {
    const me = await opened.page.request.get('/api/me');
    expect(me.status(), 'ROW-280 control: the browser context carries a session').toBe(200);
    expect(String((await me.json()).id), "ROW-280 control: the session is M's").toBe(String(w.m.id));
    expect((await readOwnRequests(w.mActor)).records, "ROW-280 control: M's own list holds M's two requests").toHaveLength(2);
    expect((await readOwnRequests(w.eActor)).records, "ROW-280 control: E's own list is empty").toHaveLength(0);
  } finally {
    await opened.close();
  }
});

test('ROW-280.REQ-006.home-is-the-members-own-requests-page-inside-the-header', async ({ browser }) => {
  const w = await accounts();
  // Before any request exists, / must already be M's page inside the header; the data checks follow the sends.
  const first = await openPage(browser, w.mActor);
  try {
    expect(routeProblems(await openRoute(first.page, PAGES.home), PAGES.home), "ROW-280: / is M's page, inside the header (before any request)").toEqual([]);
  } finally {
    await first.close();
  }
  await populate(w);
  const ownDays = M_DAYS.map((d) => d.firstDay);
  const nDays = [N_DAYS.firstDay, N_DAYS.lastDay];

  const mPage = await openPage(browser, w.mActor);
  try {
    const read = await openRoute(mPage.page, PAGES.home);
    expect.soft(routeProblems(read, PAGES.home), "ROW-280: / is M's page, inside the header").toEqual([]);
    const content = await contentWhen(mPage.page, (c) => ownDays.every((d) => hasDate(c, d)));
    for (const d of ownDays) expect.soft(hasDate(content, d), `ROW-280: M's / draws the first day ${d} of M's request`).toBe(true);
    for (const d of nDays) expect.soft(hasDate(content, d), `ROW-280: M's / does not draw N's request day ${d}`).toBe(false);
    expect.soft(content.includes(w.n.name), "ROW-280: M's / does not draw N's name").toBe(false);
    expect.soft(EMPTY.test(content), "ROW-280: M's / (two requests) draws no empty-state sentence").toBe(false);
  } finally {
    await mPage.close();
  }

  const ePage = await openPage(browser, w.eActor);
  try {
    const read = await openRoute(ePage.page, PAGES.home);
    expect.soft(routeProblems(read, PAGES.home), "ROW-280: / is E's page, inside the header").toEqual([]);
    const content = await contentWhen(ePage.page, (c) => EMPTY.test(c));
    expect.soft(EMPTY.test(content), "ROW-280: E's / (no requests) says there are none").toBe(true);
    for (const d of [...ownDays, ...nDays]) expect.soft(hasDate(content, d), `ROW-280: E's / draws no one else's request day ${d}`).toBe(false);
    expect.soft(await offersToSend(ePage.page), "ROW-280: E's / offers, outside the header, a way to /requests/new").toBe(true);
  } finally {
    await ePage.close();
  }
});
