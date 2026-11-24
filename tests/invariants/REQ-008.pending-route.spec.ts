// Purpose: ledger test for ROW-284 (REQ-008) — signed in as the admin, /admin/pending shows the pending requests page.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, accounts with their own chosen password, requests, an approval), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): what the route draws is paint, proved in the browser at D-029's /admin/pending. The list's order, its
// days-left figures and its actions are REQ-008's other rows; here the requests drawn are only the marks that tell
// the pending page from another list. Readings: route-reading.ts (text outside the header), page-reading.ts (dates).
//
// ROW-284 promise: REQ-008 "the admin has a pending requests page listing every pending request of every person …
// ROW-284   each with the person's name, kind, first and last day"; fail-if (1) "a pending request of any person, the
// ROW-284   admin included, is missing from the page"; the row: /admin/pending shows that page. Authority: REQ-008
// ROW-284   (A-006, A-015).
// ROW-284 wrong product: no page at /admin/pending (404) or a redirect to /; a page drawing the admin's own requests
// ROW-284   (their / page) instead of the team's pending ones; a page listing every request whatever its state; a page
// ROW-284   that leaves out the admin's own pending request.
// ROW-284 given: team today Mon 2027-03-08; member M's pending request 15–16 March; member N's request 22–23 March,
// ROW-284   approved; the admin's own pending request 29–30 March. when: the admin opens /admin/pending before any request,
// ROW-284   and again after. then: 200 at /admin/pending with one header, both times; after, outside the header the page draws M's name with 15 March and the admin's
// ROW-284   name with 29 March, and neither N's name nor 22 March.
// ROW-284 controls: the control case reads GET /api/admin/pending on the admin's session: M's and the admin's
// ROW-284   requests are pending there and N's is not — so a red target is the page, not the data.
// ROW-284 technique: decoys — an approved request of its own person and days, which a pending page must leave out; the
// ROW-284   admin's own pending request, read outside the header so the header's "signed in as" name never counts.
// ROW-284 cases: ROW-284 target=ROW-284.REQ-008.pending-route-shows-the-pending-requests-page control=ROW-284.control.pending-and-approved-requests-exist
import { test, expect } from '@playwright/test';
import { approve, createMember, freshName, openPage, PAGES, resetProduct, sendRequest, signIn, signInMember, type AccountId, type Actor, type Install, type Member } from './harness';
import { idsOf, readPending } from './lists';
import { hasDate } from './page-reading';
import { contentWhen, openRoute, routeProblems } from './route-reading';

const T0 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland
const M_DAYS = { firstDay: '2027-03-15', lastDay: '2027-03-16' };
const N_DAYS = { firstDay: '2027-03-22', lastDay: '2027-03-23' };
const ADMIN_DAYS = { firstDay: '2027-03-29', lastDay: '2027-03-30' };

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface World {
  install: Install;
  admin: Actor;
  m: Member;
  n: Member;
  ids: { m: AccountId; n: AccountId; admin: AccountId };
}

/** The accounts alone (no requests yet): what the route check before the data needs. */
async function accounts(): Promise<Omit<World, 'ids'>> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const m = await createMember(admin, { name: freshName('Marit') });
  const n = await createMember(admin, { name: freshName('Noor') });
  return { install, admin, m, n };
}

/** M's pending request, N's approved one and the admin's own pending one. */
async function populate(w: Omit<World, 'ids'>): Promise<World> {
  const ms = await signInMember(w.m);
  const ns = await signInMember(w.n);
  actors.push(ms, ns);
  const mId = await sendRequest(ms, { kind: 'vacation', ...M_DAYS });
  const nId = await sendRequest(ns, { kind: 'vacation', ...N_DAYS });
  await approve(w.admin, nId);
  const adminId = await sendRequest(w.admin, { kind: 'vacation', ...ADMIN_DAYS });
  return { ...w, ids: { m: mId, n: nId, admin: adminId } };
}

async function world(): Promise<World> {
  return populate(await accounts());
}

test('ROW-284.control.pending-and-approved-requests-exist', async () => {
  const w = await world();
  const ids = idsOf(await readPending(w.admin));
  expect(ids, "ROW-284 control: M's request is pending").toContain(String(w.ids.m));
  expect(ids, "ROW-284 control: the admin's own request is pending").toContain(String(w.ids.admin));
  expect(ids, "ROW-284 control: N's approved request is not pending").not.toContain(String(w.ids.n));
});

test('ROW-284.REQ-008.pending-route-shows-the-pending-requests-page', async ({ browser }) => {
  const a = await accounts();
  // Before any request exists, /admin/pending must already be the page inside the header; the list checks follow the data.
  const first = await openPage(browser, a.admin);
  try {
    expect(routeProblems(await openRoute(first.page, PAGES.adminPending), PAGES.adminPending), 'ROW-284: /admin/pending is the page, inside the header (before any request)').toEqual([]);
  } finally {
    await first.close();
  }
  const w = await populate(a);
  const opened = await openPage(browser, w.admin);
  const page = opened.page;
  try {
    const read = await openRoute(page, PAGES.adminPending);
    expect.soft(routeProblems(read, PAGES.adminPending), 'ROW-284: /admin/pending is the page, inside the header').toEqual([]);
    const content = await contentWhen(page, (c) => c.includes(w.m.name) && c.includes(w.install.admin.name));
    expect.soft(content.includes(w.m.name), "ROW-284: the page draws M's name").toBe(true);
    expect.soft(hasDate(content, M_DAYS.firstDay), "ROW-284: the page draws M's first day, 15 March").toBe(true);
    expect.soft(content.includes(w.install.admin.name), "ROW-284: the page draws the admin's name outside the header").toBe(true);
    expect.soft(hasDate(content, ADMIN_DAYS.firstDay), "ROW-284: the page draws the admin's first day, 29 March").toBe(true);
    expect.soft(content.includes(w.n.name), "ROW-284: the page does not draw N, whose request is approved").toBe(false);
    for (const d of [N_DAYS.firstDay, N_DAYS.lastDay]) {
      expect.soft(hasDate(content, d), `ROW-284: the page does not draw N's approved day ${d}`).toBe(false);
    }
  } finally {
    await opened.close();
  }
});
