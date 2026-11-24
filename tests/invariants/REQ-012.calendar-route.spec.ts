// Purpose: ledger test for ROW-282 (REQ-012) — signed in, /calendar shows the month calendar of the team zone's current month.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, the team clock, accounts with their own chosen password, requests, approvals), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): which month the route opens on, drawn as a month of day cells, is paint, proved in the browser at
// D-029's /calendar. Who the calendar lists is REQ-012's rules at the HTTP harness (ROW-058..ROW-062); here the
// names are only the marks that tell one month from another. Day cells are read by journey-pages.ts readCalendar
// (the largest element carrying exactly one day of the shown month, by its ISO date attribute or its own day number).
//
// ROW-282 promise: REQ-012 "every signed-in person can open a month calendar for any month … for each Monday to
// ROW-282   Friday day it lists by name the people with an approved request covering that day"; the row: /calendar
// ROW-282   opens on the team zone's current month. Authority: REQ-012 (A-017, A-022, A-029); the team zone and clock
// ROW-282   are the harness's install (DEFAULT_TIME_ZONE Pacific/Auckland, the team clock).
// ROW-282 wrong product: no page at /calendar (404); a calendar that opens on the UTC month (the container's) or on
// ROW-282   the machine's real month instead of the team clock's; a flat list of every approved absence instead of a
// ROW-282   month of day cells.
// ROW-282 given: P approved for Wed 2027-04-14 and Q approved for Mon 2027-03-15 (sent and approved at Mon 2027-03-08);
// ROW-282   then the team clock set to 2027-03-31T12:00Z — 2027-04-01 01:00 in Pacific/Auckland, still 31 March in UTC.
// ROW-282   when: member V (no requests) opens /calendar once before any request, and again after. then: 200 at
// ROW-282   /calendar with one header, both times; after, the content names April and 2027; P's name is drawn in the day cell of the 14th and in no other day cell; Q's name (a March day, never
// ROW-282   inside April's weeks) is not drawn.
// ROW-282 controls: the control case reads GET /api/calendar on V's session for April and March 2027: P on 2027-04-14
// ROW-282   and not Q in April, Q on 2027-03-15 in March — the approvals and the names exist, so a red target is the page.
// ROW-282 technique: the clock's origin — an instant where the team zone's month differs from UTC's and from the real
// ROW-282   clock's; decoys — one approved person in each candidate month, each on a mid-month day no neighbouring
// ROW-282   month's weeks can show.
// ROW-282 cases: ROW-282 target=ROW-282.REQ-012.calendar-route-opens-on-the-team-zones-current-month control=ROW-282.control.approved-days-in-both-months-exist
import { test, expect } from '@playwright/test';
import { approve, createMember, freshName, openPage, PAGES, resetProduct, sendRequest, setClock, signIn, signInMember, type Actor, type Member } from './harness';
import { readCalendar } from './journey-pages';
import { awayOn, observeCalendar } from './records';
import { contentWhen, openRoute, routeProblems } from './route-reading';

const T_SEND = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland
const T_VIEW = '2027-03-31T12:00:00Z'; // Thu 2027-04-01 01:00 NZDT; in UTC still Wednesday 2027-03-31
const P_DAY = '2027-04-14';
const Q_DAY = '2027-03-15';

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface World {
  p: Member;
  q: Member;
  viewer: Actor;
}

/** The accounts alone, the viewer signed in (no requests yet): what the route check before the data needs. */
async function accounts(): Promise<World & { admin: Actor }> {
  const install = await resetProduct({ now: T_SEND });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const p = await createMember(admin, { name: freshName('Pavla') });
  const q = await createMember(admin, { name: freshName('Quentin') });
  const v = await createMember(admin, { name: freshName('Vera') });
  const viewer = await signInMember(v);
  actors.push(viewer);
  return { p, q, viewer, admin };
}

/** P's and Q's requests, sent and approved at T_SEND; then the team clock moved to T_VIEW. */
async function populate(w: World & { admin: Actor }): Promise<void> {
  for (const [m, day] of [
    [w.p, P_DAY],
    [w.q, Q_DAY],
  ] as const) {
    const s = await signInMember(m);
    try {
      const id = await sendRequest(s, { kind: 'vacation', firstDay: day, lastDay: day });
      await approve(w.admin, id);
    } finally {
      await s.dispose();
    }
  }
  await setClock(T_VIEW);
}

async function world(): Promise<World> {
  const w = await accounts();
  await populate(w);
  return w;
}

test('ROW-282.control.approved-days-in-both-months-exist', async () => {
  const w = await world();
  const april = await observeCalendar(w.viewer, 2027, 4);
  const march = await observeCalendar(w.viewer, 2027, 3);
  expect(awayOn(april, P_DAY), 'ROW-282 control: the calendar data lists P on 2027-04-14').toContain(w.p.name);
  expect(JSON.stringify(april).includes(w.q.name), 'ROW-282 control: the April data does not list Q').toBe(false);
  expect(awayOn(march, Q_DAY), 'ROW-282 control: the calendar data lists Q on 2027-03-15').toContain(w.q.name);
});

test('ROW-282.REQ-012.calendar-route-opens-on-the-team-zones-current-month', async ({ browser }) => {
  const w = await accounts();
  // Before any request exists, /calendar must already be the page inside the header; the month checks follow the data.
  const first = await openPage(browser, w.viewer);
  try {
    expect(routeProblems(await openRoute(first.page, PAGES.calendar), PAGES.calendar), 'ROW-282: /calendar is the page, inside the header (before any request)').toEqual([]);
  } finally {
    await first.close();
  }
  await populate(w);
  const opened = await openPage(browser, w.viewer);
  const page = opened.page;
  try {
    const read = await openRoute(page, PAGES.calendar);
    expect.soft(routeProblems(read, PAGES.calendar), 'ROW-282: /calendar is the page, inside the header').toEqual([]);
    const content = await contentWhen(page, (c) => c.includes(w.p.name) || c.includes(w.q.name));
    expect.soft(/\bapr(?:il)?\b/i.test(content), 'ROW-282: the calendar names April').toBe(true);
    expect.soft(/(?<!\d)2027(?!\d)/.test(content), 'ROW-282: the calendar names the year 2027').toBe(true);
    expect.soft(content.includes(w.p.name), "ROW-282: April's approved person P is drawn").toBe(true);
    expect.soft(content.includes(w.q.name), "ROW-282: March's approved person Q is not drawn (the shown month is not March)").toBe(false);
    const cal = await readCalendar(page, '2027-04', [w.p.name]);
    expect.soft(cal.daysOf[w.p.name], "ROW-282: P is drawn in April's day cell of the 14th and in no other").toEqual([14]);
  } finally {
    await opened.close();
  }
});
