// Purpose: ledger tests for ROW-101, ROW-102, ROW-103, ROW-104 and ROW-105 (REQ-021) — the admin opens a person's requests page from the people page, it lists every request of that person, a cancel action sits on exactly the approved requests with a weekday from today on, and a member never sees or cancels another person's requests.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, the admin's two-step actions, own cancel), read through records.ts, fresh per run.
//
// Boundaries (R6): opening the page from the people page, and which requests carry a cancel action, are operation —
// read in the browser (the engine door) on /admin/people and /admin/people/:id; the list's completeness and what a
// member receives are rules — read at the HTTP harness (GET /api/admin/people/:id/requests, GET /api/requests,
// GET /api/calendar and the cancel routes, D-029), plus every response a member's browser receives.
// A cancel action is a button or link whose accessible name says cancel (D-029: controls named in plain words). The
// page's cancel actions are counted over the whole page (the denominator), with fixtures chosen so every plausible
// wrong rule gives a different count than the right one.
// The team zone is Pacific/Auckland; every clock instant is 09:00 there, where the UTC date is the day before.
import { test, expect, type Page } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  DEFAULT_TIME_ZONE,
  fresh,
  freshName,
  openPage,
  PAGES,
  productUrl,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import {
  awayOn,
  controlsAbout,
  leaves,
  normalState,
  observeCalendar,
  observeOwnRequests,
  observePersonRequests,
  recordById,
  show,
  stateOf,
  teamInstant,
  topRecordIds,
} from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_SEND = teamInstant('2027-03-01', '09:00', TZ); // Mon
const T_APPROVE = teamInstant('2027-03-02', '09:00', TZ); // Tue
const T_PARTIAL = teamInstant('2027-03-10', '09:00', TZ); // Wed
const T_FRI = teamInstant('2027-03-12', '09:00', TZ); // Fri; UTC Thu 03-11
const T_SAT = teamInstant('2027-03-13', '09:00', TZ); // Sat; UTC Fri 03-12

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
  await setClock(null).catch(() => undefined);
});

async function start(now = T_SEND): Promise<Actor> {
  const install = await resetProduct({ now, timeZone: TZ });
  return keep(await signIn(install.admin));
}

async function member(admin: Actor, label: string, allowance = 40): Promise<{ m: Member; actor: Actor }> {
  const m = await createMember(admin, { name: freshName(label), allowance });
  return { m, actor: keep(await signInMember(m)) };
}

/** The number of cancel actions the page draws: buttons and links whose accessible name says cancel. */
async function cancelActions(page: Page): Promise<number> {
  return (await page.getByRole('button', { name: /cancel/i }).count()) + (await page.getByRole('link', { name: /cancel/i }).count());
}

/** Opens the admin's page of a person and returns its cancel-action count once the page has settled on `expected` (or the count it settled on). */
async function settledCancelCount(page: Page, accountId: AccountId, expected: number): Promise<number> {
  const res = await page.goto(PAGES.adminPerson(accountId));
  expect(res?.status(), `the admin's page of person ${accountId} is reached (setup)`).toBe(200);
  await expect.poll(() => cancelActions(page), { timeout: 10_000 }).toBe(expected).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return cancelActions(page);
}

// ---------------------------------------------------------------------------------------------------
// ROW-101 promise: REQ-021 fail-if (1) "the admin cannot open a person's requests page from the people page"; REQ-021
// ROW-101   "from the people page the admin opens any person's requests page" (A-031); D-029: the page /admin/people/:id.
// ROW-101 wrong product: a people page with no way to a person's requests (the page exists only by typing its
// ROW-101   address), or one whose every row links to the first person's page.
// ROW-101 given: two members, Ines and Jon, each with a request. when: the admin opens /admin/people and operates the
// ROW-101   link in Jon's part of the page (the largest element holding his email and no other account's) that leads to his
// ROW-101   requests page. then: such a link exists, operating it lands on /admin/people/<Jon's id> (not Ines's), and the
// ROW-101   page shows Jon's name.
// ROW-101 controls: the control case opens /admin/people/<Jon's id> by its address: 200 with his name — the destination
// ROW-101   exists, so the target's failure is about reaching it from the people page.
// ROW-101 technique: the real control operated in the browser; Ines as the decoy whose page must not be the one reached.
// ROW-101 cases: ROW-101 target=ROW-101.REQ-021.the-people-page-opens-the-persons-requests-page control=ROW-101.control.the-persons-requests-page-answers-by-its-address
async function twoPeople() {
  const admin = await start();
  const ines = await member(admin, 'Ines');
  const jon = await member(admin, 'Jon');
  await sendRequest(ines.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  await sendRequest(jon.actor, { kind: 'vacation', firstDay: '2027-03-17', lastDay: '2027-03-18' });
  return { admin, ines: ines.m, jon: jon.m };
}

test('ROW-101.control.the-persons-requests-page-answers-by-its-address', async ({ browser }) => {
  const f = await twoPeople();
  const opened = await openPage(browser, f.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPerson(f.jon.id));
    expect(res?.status(), "ROW-101 control: Jon's requests page answers the admin").toBe(200);
    await expect(opened.page.getByText(f.jon.name).first(), "ROW-101 control: it shows Jon's name").toBeVisible({ timeout: 10_000 });
  } finally {
    await opened.close();
  }
});

test('ROW-101.REQ-021.the-people-page-opens-the-persons-requests-page', async ({ browser }) => {
  const f = await twoPeople();
  const opened = await openPage(browser, f.admin);
  const page = opened.page;
  try {
    const res = await page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-101: /admin/people is reached (setup)').toBe(200);
    await expect.poll(async () => (await controlsAbout(page, f.jon.email, [f.ines.email])).found, { message: "ROW-101: Jon's row is drawn", timeout: 10_000 }).toBe(true);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const target = PAGES.adminPerson(f.jon.id);
    const jonPart = await controlsAbout(page, f.jon.email, [f.ines.email]);
    const link = jonPart.controls.find((c) => c.href !== null && new URL(c.href, productUrl()).pathname === target);
    expect(link, `ROW-101: Jon's part of the people page has a link to ${target} (its controls: ${show(jonPart.controls)})`).toBeDefined();
    await page.locator(`a[href="${link!.href}"]`).first().click();
    await page.waitForURL((u) => u.pathname === target, { timeout: 10_000 });
    expect(new URL(page.url()).pathname, "ROW-101: operating it lands on Jon's requests page").toBe(target);
    await expect(page.getByText(f.jon.name).first(), "ROW-101: the page reached shows Jon's name").toBeVisible({ timeout: 10_000 });
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// The fixture of ROW-102 and ROW-104: member Mila with a request in every state the record can reach, and member Kai
// with an approved request whose only days from today on are a Saturday and Sunday. Sent Mon 03-01, decided Tue 03-02,
// one partial cancel Wed 03-10, read at Sat 03-13 (UTC Fri 03-12).
//   Mila:  pending            Mon 03-22 … Tue 03-23           no cancel action
//          pending sick       Wed 03-03 … Thu 03-04           no cancel action
//          pending next year  Mon 2028-02-07 … Tue 2028-02-08 no cancel action
//          rejected           Wed 03-24 … Thu 03-25           no cancel action
//          own cancel         Mon 03-29 … Tue 03-30           no cancel action
//          admin cancel       Wed 03-31 … Thu 04-01           no cancel action (cancelled)
//          past only          Mon 03-01 … Tue 03-02 approved  no cancel action (no weekday from today on)
//          partly cancelled   Mon 03-08 … Wed 03-17 approved, cancelled from 03-10: range as sent still reaches
//                             03-15…03-17, no weekday IN EFFECT from today on: no cancel action
//          ahead              Mon 04-05 … Tue 04-06 approved  ONE cancel action
//   Kai:   weekend ahead      Thu 03-11 … Sun 03-14 approved  no cancel action (only Sat and Sun from today on;
//                             a UTC reading of today, Fri 03-12, would give it one)
//          ahead              Mon 04-05 … Tue 04-06 approved  ONE cancel action
//   Nell:  a neighbour with one pending request (the decoy for ROW-102's list).
async function everyState() {
  const admin = await start(T_SEND);
  const mila = await member(admin, 'Mila');
  const kai = await member(admin, 'Kai');
  const nell = await member(admin, 'Nell');
  const s = (a: Actor, kind: 'vacation' | 'sick', firstDay: string, lastDay: string) => sendRequest(a, { kind, firstDay, lastDay });
  const r = {
    pending: await s(mila.actor, 'vacation', '2027-03-22', '2027-03-23'),
    sick: await s(mila.actor, 'sick', '2027-03-03', '2027-03-04'),
    nextYear: await s(mila.actor, 'vacation', '2028-02-07', '2028-02-08'),
    rejected: await s(mila.actor, 'vacation', '2027-03-24', '2027-03-25'),
    ownCancel: await s(mila.actor, 'vacation', '2027-03-29', '2027-03-30'),
    adminCancel: await s(mila.actor, 'vacation', '2027-03-31', '2027-04-01'),
    pastOnly: await s(mila.actor, 'vacation', '2027-03-01', '2027-03-02'),
    partly: await s(mila.actor, 'vacation', '2027-03-08', '2027-03-17'),
    ahead: await s(mila.actor, 'vacation', '2027-04-05', '2027-04-06'),
    kaiWeekend: await s(kai.actor, 'vacation', '2027-03-11', '2027-03-14'),
    kaiAhead: await s(kai.actor, 'vacation', '2027-04-05', '2027-04-06'),
    nell: await s(nell.actor, 'vacation', '2027-03-22', '2027-03-23'),
  };
  await setClock(T_APPROVE);
  for (const id of [r.pastOnly, r.partly, r.ahead, r.adminCancel, r.kaiWeekend, r.kaiAhead]) await approve(admin, id);
  await reject(admin, r.rejected);
  await cancelOwnRequest(mila.actor, r.ownCancel);
  await adminCancel(admin, r.adminCancel);
  await setClock(T_PARTIAL);
  await adminCancel(admin, r.partly);
  await setClock(T_SAT);
  const milaIds = [r.pending, r.sick, r.nextYear, r.rejected, r.ownCancel, r.adminCancel, r.pastOnly, r.partly, r.ahead].map(String);
  return { admin, mila, kai, nell, r, milaIds };
}

// ---------------------------------------------------------------------------------------------------
// ROW-102 promise: REQ-021 fail-if (2) "a request of that person is missing"; REQ-021 the page lists "all of that
// ROW-102   person's requests as the person's own page does" (A-031; REQ-006: every request they have sent).
// ROW-102 wrong product: a person's requests page built from the pending and approved requests only (the ones the
// ROW-102   admin can act on), or one that drops cancelled ones, next year's, or sick ones; or one that lists the
// ROW-102   neighbour's requests with the person's.
// ROW-102 given: the fixture's nine requests of Mila in every state, kind and year, and Nell's one. when: the admin reads
// ROW-102   Mila's requests page's data. then: its requests are exactly Mila's nine ids — none missing, Nell's absent — and
// ROW-102   the same ids as Mila's own list.
// ROW-102 controls: the control case shows the route answers the admin and lists Mila's pending request, and her
// ROW-102   own list answers her — the records exist and the views are reachable.
// ROW-102 technique: the whole list compared as a set (never part of it); a neighbour's request as the decoy.
// ROW-102 cases: ROW-102 target=ROW-102.REQ-021.the-persons-requests-page-lists-every-request-of-that-person control=ROW-102.control.the-persons-requests-route-answers-with-a-pending-request
test('ROW-102.control.the-persons-requests-route-answers-with-a-pending-request', async () => {
  const f = await everyState();
  const view = await observePersonRequests(f.admin, f.mila.m.id);
  expect(recordById(view, f.r.pending), `ROW-102 control: Mila's pending request is listed (${show(view)})`).toBeDefined();
  expect((await f.mila.actor.api.get('/api/requests')).status(), 'ROW-102 control: her own list answers her').toBe(200);
});

test('ROW-102.REQ-021.the-persons-requests-page-lists-every-request-of-that-person', async () => {
  const f = await everyState();
  const view = await observePersonRequests(f.admin, f.mila.m.id);
  const listed = topRecordIds(view);
  expect.soft([...listed].sort(), `ROW-102: the admin's page of Mila lists exactly her nine requests (${show(view)})`).toEqual([...f.milaIds].sort());
  for (const id of f.milaIds) expect.soft(listed, `ROW-102: request ${id} of Mila is listed`).toContain(id);
  expect.soft(listed, "ROW-102: the neighbour's request is not on Mila's page").not.toContain(String(f.r.nell));
  const own = topRecordIds(await observeOwnRequests(f.mila.actor));
  expect.soft([...listed].sort(), "ROW-102: the admin's page lists the same requests as Mila's own page").toEqual([...own].sort());
});

// ---------------------------------------------------------------------------------------------------
// ROW-103 promise: REQ-021 fail-if (3) "an approved request with a Monday to Friday day from today on has no cancel
// ROW-103   action"; REQ-021 "a cancel action on each approved request that still has a Monday to Friday day from today on"
// ROW-103   (A-031; REQ-010).
// ROW-103 wrong product: a cancel action only on approved requests that have not started (Ula's spanning request has
// ROW-103   none), or only on days after today (Vic's request whose last weekday is today has none).
// ROW-103 given: at Fri 03-12, Ula with an approved request ahead (04-05…04-06), an approved request spanning today
// ROW-103   (Wed 03-10 … Tue 03-16) and a pending one (04-07…04-08); Vic with an approved request ending today (Mon 03-08 … Fri
// ROW-103   03-12) and an approved past-only one (03-01…03-02). when: the admin opens each one's requests page. then: Ula's
// ROW-103   page draws exactly 2 cancel actions and Vic's exactly 1.
// ROW-103 controls: the control case shows both pages answer the admin and show the person's name, so a missing action
// ROW-103   is not a missing page.
// ROW-103 technique: values either side of the threshold — today itself a weekday (Vic), today inside the range (Ula);
// ROW-103   exact counts over the whole page, with decoys (pending, past-only) that a too-wide rule would also mark.
// ROW-103 cases: ROW-103 target=ROW-103.REQ-021.every-approved-request-with-a-weekday-from-today-on-has-a-cancel-action control=ROW-103.control.both-persons-pages-answer-the-admin
async function threshold() {
  const admin = await start(T_SEND);
  const ula = await member(admin, 'Ula');
  const vic = await member(admin, 'Vic');
  const ahead = await sendRequest(ula.actor, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
  const spanning = await sendRequest(ula.actor, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-16' });
  await sendRequest(ula.actor, { kind: 'vacation', firstDay: '2027-04-07', lastDay: '2027-04-08' });
  const endsToday = await sendRequest(vic.actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' });
  const pastOnly = await sendRequest(vic.actor, { kind: 'vacation', firstDay: '2027-03-01', lastDay: '2027-03-02' });
  await setClock(T_APPROVE);
  for (const id of [ahead, spanning, endsToday, pastOnly]) await approve(admin, id);
  await setClock(T_FRI);
  return { admin, ula: ula.m, vic: vic.m };
}

test('ROW-103.control.both-persons-pages-answer-the-admin', async ({ browser }) => {
  const f = await threshold();
  const opened = await openPage(browser, f.admin);
  try {
    for (const p of [f.ula, f.vic]) {
      const res = await opened.page.goto(PAGES.adminPerson(p.id));
      expect.soft(res?.status(), `ROW-103 control: ${p.name}'s requests page answers the admin`).toBe(200);
      await expect.soft(opened.page.getByText(p.name).first(), `ROW-103 control: it shows ${p.name}`).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await opened.close();
  }
});

test('ROW-103.REQ-021.every-approved-request-with-a-weekday-from-today-on-has-a-cancel-action', async ({ browser }) => {
  const f = await threshold();
  const opened = await openPage(browser, f.admin);
  try {
    expect.soft(await settledCancelCount(opened.page, f.ula.id, 2), "ROW-103: Ula's page draws a cancel action on her request ahead and on her request spanning today, and none on her pending one: 2").toBe(2);
    expect.soft(await settledCancelCount(opened.page, f.vic.id, 1), "ROW-103: Vic's page draws a cancel action on his request whose last weekday is today, none on his past-only one: 1").toBe(1);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-104 promise: REQ-021 fail-if (4) "a cancel action appears on a pending, rejected or cancelled request or on an
// ROW-104   approved request with no Monday to Friday day from today on"; REQ-021 "… and on no other request" (A-031;
// ROW-104   F-17). The row's cases: no cancel action on an already partly cancelled request with no weekday in effect from
// ROW-104   today on, nor on a request whose only days from today on are a Saturday and Sunday.
// ROW-104 wrong product: a cancel action on every approved request (4 on Mila's page), on every request whose range as
// ROW-104   sent reaches today (the partly cancelled one: 2), on any day from today on including weekends (Kai: 2), on
// ROW-104   pending requests, or today read as the UTC date (Kai's Fri 03-12 counted: 2).
// ROW-104 given: the fixture (above) at Sat 03-13. when: the admin opens Mila's and Kai's requests pages. then: each page
// ROW-104   draws exactly one cancel action — the one request ahead — so none sits on any of the other nine requests.
// ROW-104 controls: the control case shows both pages answer the admin and show the person's name.
// ROW-104 technique: one request per excluded class on one page, so each plausible wrong rule changes the count; the
// ROW-104   page's one right action keeps the target from passing on a page that draws nothing.
// ROW-104 cases: ROW-104 target=ROW-104.REQ-021.no-cancel-action-on-any-request-without-a-weekday-in-effect-from-today-on control=ROW-104.control.both-persons-pages-answer-the-admin
test('ROW-104.control.both-persons-pages-answer-the-admin', async ({ browser }) => {
  const f = await everyState();
  const opened = await openPage(browser, f.admin);
  try {
    for (const p of [f.mila.m, f.kai.m]) {
      const res = await opened.page.goto(PAGES.adminPerson(p.id));
      expect.soft(res?.status(), `ROW-104 control: ${p.name}'s requests page answers the admin`).toBe(200);
      await expect.soft(opened.page.getByText(p.name).first(), `ROW-104 control: it shows ${p.name}`).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await opened.close();
  }
});

test('ROW-104.REQ-021.no-cancel-action-on-any-request-without-a-weekday-in-effect-from-today-on', async ({ browser }) => {
  const f = await everyState();
  const opened = await openPage(browser, f.admin);
  try {
    expect.soft(await settledCancelCount(opened.page, f.mila.m.id, 1), "ROW-104: Mila's page draws one cancel action (her request ahead) and none on her pending, sick, next-year, rejected, cancelled, past-only or partly cancelled requests").toBe(1);
    expect.soft(await settledCancelCount(opened.page, f.kai.m.id, 1), "ROW-104: Kai's page draws one cancel action (his request ahead) and none on his request with only Saturday and Sunday from today on").toBe(1);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-105 promise: REQ-021 fail-if (5) "anyone but the admin sees another person's requests, by a page or by any data
// ROW-105   the product sends them, or cancels another person's request"; D-027 "the calendar sends, for each away entry,
// ROW-105   the display name, an optional opaque account id and the days, nothing else"; INV-002, INV-003. The row's case:
// ROW-105   the calendar response a member receives carries no kind, state, request id or range, only the person's name,
// ROW-105   an optional opaque account id, and the day, nothing else.
// ROW-105 wrong product: a calendar built by sending the approved request rows ({id, kind, firstDay, lastDay, state,
// ROW-105   name}) for the browser to lay out; a cancel route that checks "signed in" but not "own request"; a person's
// ROW-105   requests route that checks only "signed in".
// ROW-105 given: neighbour Pia with an approved vacation (03-08…03-10) and an approved sick request (03-15…03-16); member
// ROW-105   Max with no requests (so any kind he receives is Pia's). when: Max reads the March calendar and loads /calendar,
// ROW-105   / and /admin/people/<Pia> in the browser, every response recorded; reads Pia's requests route; and tries to cancel
// ROW-105   Pia's vacation by the own-cancel route and by both steps of the admin's cancel. then: the calendar answer has only
// ROW-105   {days:[{date, people:[{name, accountId?}]}]} (year and month allowed beside days), no response he receives holds
// ROW-105   the value vacation, sick, approved, pending, rejected or cancelled, Pia's requests route is refused to him, every
// ROW-105   cancel is refused, and afterwards Pia's vacation is still approved and on the calendar.
// ROW-105 controls: the control case shows the harmful case is reached — the calendar Max reads lists Pia on 03-08 and on
// ROW-105   03-15 — so the shape check reads entries about another person.
// ROW-105 technique: a whitelist of keys over every entry (a denominator, never "has no kind key"); a value search over
// ROW-105   every response the browser receives; the refused attempts checked for "changes nothing".
// ROW-105 cases: ROW-105 target=ROW-105.REQ-021.a-member-receives-no-other-persons-request-data-and-cancels-none control=ROW-105.control.the-members-calendar-lists-the-neighbour
async function neighbour() {
  const admin = await start(T_SEND);
  const pia = await member(admin, 'Pia');
  const vacation = await sendRequest(pia.actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  const sick = await sendRequest(pia.actor, { kind: 'sick', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  await approve(admin, vacation);
  await approve(admin, sick);
  const max = await member(admin, 'Max');
  return { admin, pia: pia.m, max: max.actor, vacation };
}

const REQUEST_WORDS = ['vacation', 'sick', 'approved', 'pending', 'rejected', 'cancelled', 'canceled'];

function calendarShapeFaults(cal: unknown): string[] {
  const faults: string[] = [];
  const keysOf = (o: unknown) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : null);
  const top = keysOf(cal);
  if (!top) return ['the calendar answer is not an object'];
  for (const k of top) if (!['days', 'year', 'month'].includes(k)) faults.push(`top-level key "${k}"`);
  const days = (cal as { days?: unknown }).days;
  if (!Array.isArray(days)) return [...faults, 'no days list'];
  days.forEach((d, i) => {
    const dk = keysOf(d);
    if (!dk) return void faults.push(`days[${i}] is not an object`);
    for (const k of dk) if (!['date', 'people'].includes(k)) faults.push(`days[${i}] key "${k}"`);
    const people = (d as { people?: unknown }).people;
    if (people !== undefined && !Array.isArray(people)) faults.push(`days[${i}].people is not a list`);
    if (Array.isArray(people))
      people.forEach((p, j) => {
        const pk = keysOf(p);
        if (!pk) return void faults.push(`days[${i}].people[${j}] is not an object`);
        for (const k of pk) if (!['name', 'accountId'].includes(k)) faults.push(`days[${i}].people[${j}] key "${k}"`);
        if (typeof (p as { name?: unknown }).name !== 'string') faults.push(`days[${i}].people[${j}] has no name`);
      });
  });
  return faults;
}

test('ROW-105.control.the-members-calendar-lists-the-neighbour', async () => {
  const f = await neighbour();
  const cal = await observeCalendar(f.max, 2027, 3);
  expect.soft(awayOn(cal, '2027-03-08'), "ROW-105 control: Max's calendar lists Pia on 03-08 (her vacation)").toContain(f.pia.name);
  expect.soft(awayOn(cal, '2027-03-15'), "ROW-105 control: Max's calendar lists Pia on 03-15 (her sick days)").toContain(f.pia.name);
});

test('ROW-105.REQ-021.a-member-receives-no-other-persons-request-data-and-cancels-none', async ({ browser }) => {
  const f = await neighbour();
  const cal = await observeCalendar(f.max, 2027, 3);
  expect.soft(awayOn(cal, '2027-03-08'), 'ROW-105: the calendar has an entry for Pia (reached)').toContain(f.pia.name);
  expect.soft(calendarShapeFaults(cal), `ROW-105: the member's calendar carries only date, name and an optional account id (${show(cal)})`).toEqual([]);

  const received: { where: string; json: unknown }[] = [{ where: 'GET /api/calendar?year=2027&month=3', json: cal }];
  received.push({ where: 'GET /api/requests (own)', json: await observeOwnRequests(f.max) });
  const opened = await openPage(browser, f.max);
  const bodies: Promise<void>[] = [];
  opened.page.on('response', (r) => {
    if (!/json/i.test(r.headers()['content-type'] || '')) return;
    bodies.push(
      r
        .json()
        .then((json) => void received.push({ where: `browser ${r.url()}`, json }))
        .catch(() => undefined),
    );
  });
  try {
    for (const p of [PAGES.calendar, PAGES.home, PAGES.adminPerson(f.pia.id)]) {
      await opened.page.goto(p).catch(() => undefined);
      await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    }
    await Promise.all(bodies);
  } finally {
    await opened.close();
  }
  for (const r of received) {
    const words = leaves(r.json).filter((l) => typeof l.value === 'string' && REQUEST_WORDS.includes(l.value.trim().toLowerCase()));
    expect.soft(words, `ROW-105: ${r.where} carries no kind or state of another person's request`).toEqual([]);
  }

  const personRoute = await f.max.api.get(`/api/admin/people/${encodeURIComponent(String(f.pia.id))}/requests`);
  expect.soft(personRoute.ok(), `ROW-105: Pia's requests route is refused to a member (answered ${personRoute.status()})`).toBe(false);

  const v = encodeURIComponent(String(f.vacation));
  const tries: [string, () => ReturnType<Actor['api']['get']>][] = [
    ['the own-cancel route on her request', () => f.max.api.post(`/api/requests/${v}/cancel`)],
    ["the admin cancel's effect step", () => f.max.api.get(`/api/admin/requests/${v}/effect?action=cancel`)],
    ["the admin cancel's act", () => f.max.api.post(`/api/admin/requests/${v}/cancel`, { data: { token: fresh('token') } })],
  ];
  for (const [what, call] of tries) {
    const res = await call();
    expect.soft(res.ok(), `ROW-105: a member's cancel of another person's request by ${what} is refused (answered ${res.status()})`).toBe(false);
  }
  const after = recordById(await observePersonRequests(f.admin, f.pia.id), f.vacation, '2027-03-08');
  expect.soft(normalState(stateOf(after)), `ROW-105: Pia's vacation is still approved (${show(after)})`).toBe('approved');
  expect.soft(awayOn(await observeCalendar(f.admin, 2027, 3), '2027-03-10'), 'ROW-105: Pia is still on the calendar on 03-10').toContain(f.pia.name);
});
