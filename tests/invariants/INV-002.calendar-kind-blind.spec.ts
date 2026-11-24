// Purpose: ledger tests for ROW-173 and ROW-174 (INV-002) — a sick and a vacation absence of other people are identical in the calendar's markup, data and order apart from the name and an optional opaque account id; the admin and the person themselves see the kind on their own pages.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approvals), fresh per run; pages opened through harness.ts's engine door.
//
// Boundary (R6): the calendar's data is GET /api/calendar (D-029, D-027), read at the HTTP harness; its markup and
// order are paint, read in the browser on /calendar (the month shown is the team's current month, moved by the
// clock, so no navigation control's label is assumed). The kind on the person's own page and the admin's person
// page: the request record's `kind` (D-029's field) on GET /api/requests and GET /api/admin/people/:id/requests, and
// the word on / and /admin/people/:id.
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { aucklandMorning, getJson, kindOf, readCalendar, recordById, sameId, weekdaysIn } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
const closers: { close(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const c of closers.splice(0)) await c.close().catch(() => undefined);
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const MARCH = { first: '2027-03-08', last: '2027-03-10' }; // A sick, B vacation
const APRIL = { first: '2027-04-05', last: '2027-04-07' }; // A vacation, B sick

interface World {
  admin: Actor;
  a: Member;
  b: Member;
  aSession: Actor;
  viewer: Actor;
  aSick: AccountId;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const a = await createMember(admin, { name: freshName('Ann') });
  const b = await createMember(admin, { name: freshName('Ben') });
  const viewer = keep(await signInMember(await createMember(admin, { name: freshName('Wes') })));
  const aSession = keep(await signInMember(a));
  const bSession = keep(await signInMember(b));
  const aSick = await sendRequest(aSession, { kind: 'sick', firstDay: MARCH.first, lastDay: MARCH.last });
  await approve(admin, aSick);
  await approve(admin, await sendRequest(bSession, { kind: 'vacation', firstDay: MARCH.first, lastDay: MARCH.last }));
  await approve(admin, await sendRequest(aSession, { kind: 'vacation', firstDay: APRIL.first, lastDay: APRIL.last }));
  await approve(admin, await sendRequest(bSession, { kind: 'sick', firstDay: APRIL.first, lastDay: APRIL.last }));
  return { admin, a, b, aSession, viewer, aSick };
}

type Entry = Record<string, unknown>;
function strip(e: Entry): string {
  const rest: Entry = {};
  for (const k of Object.keys(e).sort()) if (k !== 'name' && k !== 'accountId') rest[k] = e[k];
  return JSON.stringify(rest);
}
function isPerson(e: Entry, m: Member): boolean {
  return e.accountId !== undefined && e.accountId !== null ? sameId(e.accountId, m.id) : e.name === m.name;
}

/** The markup of each person's calendar entries (the largest element holding that name and not the other's), normalised. */
async function entryMarkup(page: Page, a: Member, b: Member): Promise<{ a: string[]; b: string[]; order: string }> {
  return page.evaluate(
    ({ people }) => {
      const result: Record<string, string[]> = { a: [], b: [] };
      const tops: { who: string; el: Element }[] = [];
      for (const [who, me, other] of [
        ['a', people[0], people[1]],
        ['b', people[1], people[0]],
      ] as const) {
        const own = Array.from(document.body.querySelectorAll('*')).filter((el) =>
          Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').includes(me.name)),
        );
        for (const el of own) {
          let top = el;
          while (top.parentElement && top.parentElement !== document.body && !(top.parentElement.textContent ?? '').includes(other.name)) {
            top = top.parentElement;
          }
          let html = top.outerHTML.split(me.name).join('NAME');
          // The optional opaque account id, where an attribute carries exactly it (never digits elsewhere).
          html = html.split(`="${me.id}"`).join('="ID"').split(`='${me.id}'`).join("='ID'");
          result[who].push(html);
          tops.push({ who, el: top });
        }
      }
      tops.sort((x, y) => (x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      return { a: result.a.sort(), b: result.b.sort(), order: tops.map((t) => t.who).join('') };
    },
    { people: [ { name: a.name, id: String(a.id) }, { name: b.name, id: String(b.id) } ] },
  );
}

async function openCalendarAt(viewer: Actor, browserOpen: (actor: Actor) => Promise<Page>, today: string): Promise<Page> {
  await setClock(aucklandMorning(today));
  const page = await browserOpen(viewer);
  const res = await page.goto(PAGES.calendar);
  expect.soft(res?.status(), `ROW-173: /calendar answers 200 on ${today}`).toBe(200);
  await page.waitForLoadState('networkidle');
  return page;
}

// ---------------------------------------------------------------------------------------------------
// ROW-173 promise: INV-002 "whether an absence is vacation or sick is never shown or sent to anyone other than the
// ROW-173   admin and the person themselves: not on the calendar, not on any page, not in any data the product sends to
// ROW-173   another person's browser"; A-005; D-027 (each away entry: name, optional opaque account id, days). The
// ROW-173   row's case: a sick and a vacation absence of other people are identical in the calendar's markup, data and
// ROW-173   order apart from the name and an optional opaque account id.
// ROW-173 wrong product: a calendar entry with class="sick", a title or an icon for sick days, a `kind` or `type`
// ROW-173   field in the entries, or vacation entries sorted before sick ones (the order leaks the kind).
// ROW-173 given: today Mon 2027-03-01 (Auckland); members Ann, Ben and the viewer Wes; approved: Ann sick and Ben
// ROW-173   vacation Mon 03-08..Wed 03-10; Ann vacation and Ben sick Mon 04-05..Wed 04-07 (the kinds swapped).
// ROW-173   when: Wes reads GET /api/calendar for March and April, and opens /calendar with today in March, then in
// ROW-173   April. then: on each of the six days Ann's and Ben's entries are equal once name and account id are
// ROW-173   removed; Ann's position relative to Ben's is the same in March and April, in the data and on the page;
// ROW-173   and on the page Ann's entries' markup equals Ben's once the name and id are replaced, in both months.
// ROW-173 controls: ROW-174's target (the admin and the person see the kind) — the kinds are stored and differ, so
// ROW-173   the sameness here is the calendar hiding them, not two requests of one kind.
// ROW-173 technique: the kinds swapped between two months, so any kind-dependent order or markup shows as a
// ROW-173   difference between the months or between the two people.
// ROW-173 cases: ROW-173 target=ROW-173.INV-002.sick-and-vacation-entries-are-identical-on-the-calendar control=ROW-174.INV-002.the-admin-and-the-person-see-the-kind
test('ROW-173.INV-002.sick-and-vacation-entries-are-identical-on-the-calendar', async ({ browser }) => {
  const w = await world();
  const orders: string[] = [];
  for (const [range, month] of [
    [MARCH, 3],
    [APRIL, 4],
  ] as const) {
    const cal = await readCalendar(w.viewer.api, 2027, month, 'ROW-173');
    let order = '';
    for (const date of weekdaysIn(range.first, range.last)) {
      const day = (cal.days ?? []).find((d) => d.date === date);
      const people = (day?.people ?? []) as Entry[];
      const ea = people.find((e) => isPerson(e, w.a));
      const eb = people.find((e) => isPerson(e, w.b));
      expect(ea && eb, `ROW-173 ${date}: both Ann and Ben are listed`).toBeTruthy();
      expect.soft(strip(ea!), `ROW-173 ${date}: Ann's entry equals Ben's apart from name and id`).toBe(strip(eb!));
      order += people.indexOf(ea!) < people.indexOf(eb!) ? 'a' : 'b';
    }
    orders.push(order);
  }
  expect.soft(orders[0], 'ROW-173: the data orders Ann and Ben the same whichever of them is sick').toBe(orders[1]);

  const open = async (actor: Actor): Promise<Page> => {
    const o = await openPage(browser, actor);
    closers.push(o);
    return o.page;
  };
  const pageOrders: string[] = [];
  for (const today of ['2027-03-01', '2027-04-01']) {
    const page = await openCalendarAt(w.viewer, open, today);
    await expect.poll(async () => (await entryMarkup(page, w.a, w.b)).a.length, { timeout: 10_000 }).toBeGreaterThan(0).catch(() => undefined);
    const m = await entryMarkup(page, w.a, w.b);
    expect.soft(m.a.length, `ROW-173 page on ${today}: Ann's entries are drawn`).toBeGreaterThan(0);
    expect.soft(m.a, `ROW-173 page on ${today}: Ann's entries' markup equals Ben's apart from name and id`).toEqual(m.b);
    pageOrders.push(m.order);
  }
  expect.soft(pageOrders[0], 'ROW-173: the page orders Ann and Ben the same whichever of them is sick').toBe(pageOrders[1]);
});

// ---------------------------------------------------------------------------------------------------
// ROW-174 promise: INV-002 "… anyone other than the admin and the person themselves"; REQ-006 (the person's own
// ROW-174   page lists each request with its kind); A-005. The row's case: the admin and the person themselves see the
// ROW-174   kind on their own pages.
// ROW-174 wrong product: kind hidden from everyone (the calendar's blindness applied to every view), so the person
// ROW-174   and the admin cannot tell a sick request from a vacation.
// ROW-174 given: the ROW-173 world; Ann's approved sick request in March. when: Ann reads her own list and opens /;
// ROW-174   the admin reads Ann's requests and opens /admin/people/<Ann>. then: the record's kind is "sick" on both
// ROW-174   lists, and both pages show the word sick.
// ROW-174 controls: the control case shows Ann's sick request is on her own list (the record the target reads).
// ROW-174 technique: one exact place (the record's kind) plus the page's word.
// ROW-174 cases: ROW-174 target=ROW-174.INV-002.the-admin-and-the-person-see-the-kind control=ROW-174.control.the-sick-request-is-listed
test('ROW-174.control.the-sick-request-is-listed', async () => {
  const w = await world();
  expect(recordById(await getJson(w.aSession.api, '/api/requests', 'ROW-174 control'), w.aSick), "ROW-174 control: Ann's sick request is on her list").toBeDefined();
});

test('ROW-174.INV-002.the-admin-and-the-person-see-the-kind', async ({ browser }) => {
  const w = await world();
  const own = recordById(await getJson(w.aSession.api, '/api/requests', 'ROW-174'), w.aSick);
  const adm = recordById(await getJson(w.admin.api, `/api/admin/people/${encodeURIComponent(String(w.a.id))}/requests`, 'ROW-174'), w.aSick);
  expect.soft(own && kindOf(own), "ROW-174: Ann's own record says sick").toBe('sick');
  expect.soft(adm && kindOf(adm), "ROW-174: the admin's record of Ann's request says sick").toBe('sick');
  for (const [actor, path] of [
    [w.aSession, PAGES.home],
    [w.admin, PAGES.adminPerson(w.a.id)],
  ] as const) {
    const o = await openPage(browser, actor);
    closers.push(o);
    await o.page.goto(path);
    await o.page.waitForLoadState('networkidle');
    await expect.soft(o.page.locator('body'), `ROW-174: ${path} shows the word sick`).toContainText(/sick/i, { timeout: 10_000 });
  }
});
