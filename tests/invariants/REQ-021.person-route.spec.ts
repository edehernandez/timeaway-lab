// Purpose: ledger test for ROW-286 (REQ-021) — signed in as the admin, /admin/people/:id shows that person's requests page, naming the person at its top.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, accounts with their own chosen password, requests), fresh per run; the pages loaded in the browser through the engine door (openPage).
//
// Boundary (R6): what the route draws is paint, proved in the browser at D-029's /admin/people/:id. The page's cancel
// actions and its full list are REQ-021's other rows (ROW-193 and the person-requests rows); here the person's name
// and request are what tell this person's page from another's. Readings: route-reading.ts (text outside the
// header), page-reading.ts (dates); the page's TOP is its first visible heading outside the header.
//
// ROW-286 promise: REQ-021 "from the people page the admin opens any person's requests page, listing all of that
// ROW-286   person's requests as the person's own page does"; the row: /admin/people/:id shows that person's requests
// ROW-286   page, naming the person at its top. Authority: REQ-021 (A-031).
// ROW-286 wrong product: no page at /admin/people/:id (404) or a redirect to /admin/people; a page drawing the admin's
// ROW-286   own requests whatever the id; a page drawing the first person's requests for every id; a page with the right
// ROW-286   requests and no name, or the admin's name, at its top.
// ROW-286 given: team today Mon 2027-03-08; members P and Q, fresh names, each with one pending request (P on
// ROW-286   5 April, Q on 3 May 2027); the admin with one of their own (24 May). when: the admin opens P's page before any
// ROW-286   request; then, the requests sent, P's page and Q's. then: each answers 200 at its own path with one header; its first heading outside the header carries that
// ROW-286   person's name and neither the other's nor the admin's; outside the header it draws that person's request
// ROW-286   day, and neither the other person's day and name nor the admin's day.
// ROW-286 controls: the control case reads GET /api/admin/people/:id/requests for P on the admin's session: it holds
// ROW-286   P's request and not Q's — so the data each page draws exists and a red target is the page.
// ROW-286 technique: decoys — two persons and the admin, each on days of their own, so one fixed page cannot pass both
// ROW-286   ids; the names read outside the header, so the header's "signed in as" never counts.
// ROW-286 cases: ROW-286 target=ROW-286.REQ-021.person-route-shows-that-persons-requests-named-at-its-top control=ROW-286.control.each-persons-requests-exist
import { test, expect, type Page } from '@playwright/test';
import { createMember, freshName, openPage, PAGES, resetProduct, sendRequest, signIn, signInMember, type AccountId, type Actor, type Install, type Member } from './harness';
import { hasDate } from './page-reading';
import { observePersonRequests, topRecordIds } from './records';
import { contentWhen, openRoute, routeProblems } from './route-reading';

const T0 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland
const P_DAY = '2027-04-05';
const Q_DAY = '2027-05-03';
const ADMIN_DAY = '2027-05-24';

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface World {
  install: Install;
  admin: Actor;
  p: Member;
  q: Member;
  requestIds: { p: AccountId; q: AccountId };
}

/** The accounts alone (no requests yet): what the route check before the data needs. */
async function accounts(): Promise<Omit<World, 'requestIds'>> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const p = await createMember(admin, { name: freshName('Pieter') });
  const q = await createMember(admin, { name: freshName('Quirine') });
  return { install, admin, p, q };
}

/** P's, Q's and the admin's own pending requests. */
async function populate(w: Omit<World, 'requestIds'>): Promise<World> {
  const ps = await signInMember(w.p);
  const qs = await signInMember(w.q);
  actors.push(ps, qs);
  const pId = await sendRequest(ps, { kind: 'vacation', firstDay: P_DAY, lastDay: P_DAY });
  const qId = await sendRequest(qs, { kind: 'vacation', firstDay: Q_DAY, lastDay: Q_DAY });
  await sendRequest(w.admin, { kind: 'vacation', firstDay: ADMIN_DAY, lastDay: ADMIN_DAY });
  return { ...w, requestIds: { p: pId, q: qId } };
}

async function world(): Promise<World> {
  return populate(await accounts());
}

/** The text of the first visible heading outside the header (h1–h6 or role="heading"), or null when there is none. */
async function topHeading(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const inHeader = (el: Element) => {
        if (el.closest('[role="banner"]')) return true;
        const h = el.closest('header');
        return !!h && !h.parentElement?.closest('article, aside, main, nav, section, [role="main"]');
      };
      const shown = (el: Element) => {
        const h = el as HTMLElement & { checkVisibility?: () => boolean };
        return typeof h.checkVisibility === 'function' ? h.checkVisibility() : h.getClientRects().length > 0;
      };
      const first = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')).find((el) => shown(el) && !inHeader(el));
      return first ? ((first as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim() : null;
    })
    .catch(() => null);
}

test('ROW-286.control.each-persons-requests-exist', async () => {
  const w = await world();
  const ids = topRecordIds(await observePersonRequests(w.admin, w.p.id));
  expect(ids, "ROW-286 control: P's requests hold P's request").toContain(String(w.requestIds.p));
  expect(ids, "ROW-286 control: P's requests do not hold Q's").not.toContain(String(w.requestIds.q));
});

test('ROW-286.REQ-021.person-route-shows-that-persons-requests-named-at-its-top', async ({ browser }) => {
  const a = await accounts();
  // Before any request exists, P's page must already be the page inside the header; the naming and list checks follow the data.
  const first = await openPage(browser, a.admin);
  try {
    const route = PAGES.adminPerson(a.p.id);
    expect(routeProblems(await openRoute(first.page, route), route), `ROW-286: ${route} is P's page, inside the header (before any request)`).toEqual([]);
  } finally {
    await first.close();
  }
  const w = await populate(a);
  const opened = await openPage(browser, w.admin);
  const page = opened.page;
  try {
    for (const [label, person, day, other, otherDay] of [
      ['P', w.p, P_DAY, w.q, Q_DAY],
      ['Q', w.q, Q_DAY, w.p, P_DAY],
    ] as const) {
      const route = PAGES.adminPerson(person.id);
      const read = await openRoute(page, route);
      expect.soft(routeProblems(read, route), `ROW-286: ${route} is ${label}'s page, inside the header`).toEqual([]);
      const content = await contentWhen(page, (c) => hasDate(c, day));
      const top = (await topHeading(page)) ?? '';
      expect.soft(top.includes(person.name), `ROW-286: the top heading of ${label}'s page names ${label} (read: "${top}")`).toBe(true);
      expect.soft(top.includes(other.name), `ROW-286: the top heading of ${label}'s page does not name the other person`).toBe(false);
      expect.soft(top.includes(w.install.admin.name), `ROW-286: the top heading of ${label}'s page does not name the admin`).toBe(false);
      expect.soft(hasDate(content, day), `ROW-286: ${label}'s page draws ${label}'s request day ${day}`).toBe(true);
      expect.soft(hasDate(content, otherDay), `ROW-286: ${label}'s page does not draw the other person's day ${otherDay}`).toBe(false);
      expect.soft(content.includes(other.name), `ROW-286: ${label}'s page does not draw the other person's name`).toBe(false);
      expect.soft(hasDate(content, ADMIN_DAY), `ROW-286: ${label}'s page does not draw the admin's own day ${ADMIN_DAY}`).toBe(false);
    }
  } finally {
    await opened.close();
  }
});
