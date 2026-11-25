// Purpose: ledger tests for ROW-037, ROW-038 and ROW-039 (REQ-008) — the admin's pending list carries every pending request of every person, the admin's own included, oldest sent first, and each vacation with that person's days left in its year.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, allowances, requests, decisions), fresh names per run, the team clock set by the harness; the page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn rows read on /admin/pending beside the API), through page-figures.ts and own-page.ts.
//
// Boundary (R6): behaviour rows, proved at the HTTP harness — GET /api/admin/pending, the data of /admin/pending
// (D-029), read through lists.ts (records located by the request's id, facts read by value; the list's order is the
// page's order; the reading is stated there). Team zone Pacific/Auckland. Every expected figure is computed here.
// The page cases (at the end) open /admin/pending in the admin's browser (engine door) and read the drawn rows.
import { test, expect } from '@playwright/test';
import { approve, createMember, freshName, setAllowance, setClock, signInMember, type Actor, type RequestSpec } from './harness';
import { countWeekdays, freshInstall, hasNumber, idsOf, minutesAfter, readPending, recordOf, sendAt, show } from './lists';
import { saysNumber } from './own-page';
import { readPendingPage, rowLabelled, type PendingSpec, type ReadRow } from './page-figures';

/** Tuesday 2027-03-02 09:00 in the team zone (Monday 20:00 UTC). */
const T0 = '2027-03-01T20:00:00Z';
const world = () => freshInstall(T0, '2027-03-02');

// =====================================================================================================
// ROW-037 — every pending request of every person is listed, the admin's own included
// =====================================================================================================
// ROW-037 promise: REQ-008 "listing every pending request of every person"; fail-if (1) "a pending request of any
// ROW-037   person, the admin included, is missing from the page". Authority: REQ-008 arm 1, A-006 (the admin is also a
// ROW-037   team member and decides their own requests like anyone else's), A-021 (a pending request whose days have
// ROW-037   passed stays pending).
// ROW-037 wrong product: the list leaves out the admin's own requests (only "others" to decide); leaves out sick
// ROW-037   requests; leaves out next year's; leaves out a pending request whose days have passed.
// ROW-037 given: the admin sends a vacation of their own; member Uma sends a vacation this year and one next year;
// ROW-037   member Vic sends a sick request for a past day; Vic's other vacation is approved (no longer pending).
// ROW-037   when: the admin reads the pending list. then: each of the four pending ids is a record of the list.
// ROW-037 controls: Uma's current-year vacation is listed — the route answers the admin and lists a plain case.
// ROW-037 technique: one pending request per class a filter fault drops (the admin's own, sick, next year, past days).
// ROW-037 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup037() {
  const w = await world();
  const uma = await createMember(w.admin, { name: freshName('Uma') });
  const vic = await createMember(w.admin, { name: freshName('Vic') });
  const u = await signInMember(uma);
  const v = await signInMember(vic);
  const adminOwn = await sendAt(w.admin, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const umaVacation = await sendAt(u, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' }, minutesAfter(T0, 2));
  const umaNextYear = await sendAt(u, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-11' }, minutesAfter(T0, 3));
  const vicPastSick = await sendAt(v, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 4));
  const vicDecided = await sendAt(v, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }, minutesAfter(T0, 5));
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, vicDecided);
  const pending = [
    { label: "the admin's own vacation", id: adminOwn },
    { label: "Uma's vacation", id: umaVacation },
    { label: "Uma's next-year vacation", id: umaNextYear },
    { label: "Vic's sick request for a past day", id: vicPastSick },
  ];
  return {
    ...w,
    uma,
    vic,
    umaVacation,
    pending,
    close: async () => {
      await u.dispose();
      await v.dispose();
      await w.close();
    },
  };
}

test('ROW-037.control.a-members-pending-vacation-is-listed', async () => {
  const s = await setup037();
  try {
    const list = await readPending(s.admin);
    expect(recordOf(list, s.umaVacation), `ROW-037 control: Uma's vacation ${s.umaVacation} is listed; ids ${idsOf(list)}`).toBeDefined();
  } finally {
    await s.close();
  }
});

test('ROW-037.REQ-008.every-pending-request-of-every-person-listed-admin-included', async () => {
  const s = await setup037();
  try {
    const list = await readPending(s.admin);
    for (const p of s.pending) {
      expect.soft(recordOf(list, p.id), `ROW-037: ${p.label} (id ${p.id}) is listed; ids ${idsOf(list)}`).toBeDefined();
    }
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-038 — oldest sent first
// =====================================================================================================
// ROW-038 promise: REQ-008 "oldest first"; fail-if (2); the row's case: request A sent first for days in two weeks,
// ROW-038   request B sent later for tomorrow: A is listed before B. Authority: REQ-008 arm 2.
// ROW-038 wrong product: ordered by first day (B before A, the "most urgent first" reading), newest first, or grouped
// ROW-038   by person.
// ROW-038 given: today Tuesday 2027-03-02 in the team zone; member Uma sends A for 2027-03-16..17 (two weeks out) at
// ROW-038   09:01, member Vic sends B for 2027-03-03 (tomorrow) at 09:02, the admin sends C of their own for
// ROW-038   2027-03-08..09 (next week) at 09:03. when: the admin reads the pending list. then: A, B, C in that order.
// ROW-038 controls: the three requests are listed, so an order failure is not a missing record.
// ROW-038 technique: the row's own example values, plus a third request so by-first-day (B, C, A), newest-first
// ROW-038   (C, B, A) and by-person orders all differ from the right one.
// ROW-038 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup038() {
  const w = await world();
  const u = await signInMember(await createMember(w.admin, { name: freshName('Uma') }));
  const v = await signInMember(await createMember(w.admin, { name: freshName('Vic') }));
  const a = await sendAt(u, { kind: 'vacation', firstDay: '2027-03-16', lastDay: '2027-03-17' }, minutesAfter(T0, 1));
  const b = await sendAt(v, { kind: 'vacation', firstDay: '2027-03-03', lastDay: '2027-03-03' }, minutesAfter(T0, 2));
  const c = await sendAt(w.admin, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-09' }, minutesAfter(T0, 3));
  return {
    ...w,
    u,
    v,
    a,
    b,
    c,
    close: async () => {
      await u.dispose();
      await v.dispose();
      await w.close();
    },
  };
}

test('ROW-038.control.the-three-pending-requests-are-listed', async () => {
  const s = await setup038();
  try {
    const list = await readPending(s.admin);
    for (const id of [s.a, s.b, s.c]) expect.soft(recordOf(list, id), `ROW-038 control: request ${id} is listed; ids ${idsOf(list)}`).toBeDefined();
  } finally {
    await s.close();
  }
});

test('ROW-038.REQ-008.pending-listed-oldest-sent-first', async () => {
  const s = await setup038();
  try {
    const list = await readPending(s.admin);
    const order = [s.a, s.b, s.c].map(String);
    const seen = idsOf(list).filter((id) => order.includes(id));
    expect(seen, `ROW-038: A (two weeks out, ${s.a}), B (tomorrow, ${s.b}), C (next week, ${s.c}) in the order sent; list ids ${idsOf(list)}`).toEqual(order);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-039 — a vacation is shown with the person's days left in its year
// =====================================================================================================
// ROW-039 promise: REQ-008 "and for vacation that person's days left in its year"; fail-if (3); the row's case: a
// ROW-039   person with different current-year and next-year figures sends a next-year vacation: the page shows exactly
// ROW-039   that person's next-year days left, kept apart from the labelled forecast. Authority: REQ-008 arm 3; A-020
// ROW-039   (each year's balance uses that year's allowance); A-002 (days left counts approved days).
// ROW-039 wrong product: every request shows the current year's days left (17 for Pau's next-year request); shows the
// ROW-039   forecast (days left minus this request) in place of days left; shows the admin's or another person's figure.
// ROW-039 given: Pau, allowance 20 this year and 26 from next year (a change starting next year, A-043), with an
// ROW-039   approved 3-day vacation in 2027 (days left 17) and an approved 2-day vacation in 2028 (days left 24), sends a
// ROW-039   pending vacation for 2027-04-05..06 and a pending next-year vacation Thu 2028-02-03..Tue 2028-02-08
// ROW-039   (4 days, forecast 20); Ruth, allowance 15, with approved 2 days in 2027 (13) and 1 day in 2028 (14), sends a
// ROW-039   pending next-year vacation 2028-02-14..16. when: the admin reads the pending list. then: Pau's next-year
// ROW-039   record carries 24 and not Ruth's 14; Pau's current-year record carries 17; Ruth's record carries 14 and not
// ROW-039   Pau's 24.
// ROW-039 controls: the three pending vacations are listed, so a missing figure is not a missing record.
// ROW-039 technique: decoys — every figure in play distinct (17, 24, 13, 14, the counts and forecasts), each person's
// ROW-039   figure checked on that person's record and the other's as the near miss; the forecast is ROW-107's.
// ROW-039 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup039() {
  const w = await world();
  const pau = await createMember(w.admin, { name: freshName('Pau'), allowance: 20 });
  await setAllowance(w.admin, pau.id, 26, { startsNextYear: true });
  const ruth = await createMember(w.admin, { name: freshName('Ruth'), allowance: 15 });
  const p = await signInMember(pau);
  const r = await signInMember(ruth);
  let m = 0;
  const send = (a: Actor, spec: RequestSpec) => sendAt(a, spec, minutesAfter(T0, ++m));
  const pauThisYear: RequestSpec = { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' };
  const pauNextYear: RequestSpec = { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-11' };
  const ruthThisYear: RequestSpec = { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' };
  const ruthNextYear: RequestSpec = { kind: 'vacation', firstDay: '2028-01-12', lastDay: '2028-01-12' };
  const approved = [await send(p, pauThisYear), await send(p, pauNextYear), await send(r, ruthThisYear), await send(r, ruthNextYear)];
  const pauPendingNow = await send(p, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
  const pauPendingNext = await send(p, { kind: 'vacation', firstDay: '2028-02-03', lastDay: '2028-02-08' });
  const ruthPendingNext = await send(r, { kind: 'vacation', firstDay: '2028-02-14', lastDay: '2028-02-16' });
  await setClock(minutesAfter(T0, 30));
  for (const id of approved) await approve(w.admin, id);
  const expected = {
    pau2027: 20 - countWeekdays(pauThisYear.firstDay, pauThisYear.lastDay),
    pau2028: 26 - countWeekdays(pauNextYear.firstDay, pauNextYear.lastDay),
    ruth2027: 15 - countWeekdays(ruthThisYear.firstDay, ruthThisYear.lastDay),
    ruth2028: 15 - countWeekdays(ruthNextYear.firstDay, ruthNextYear.lastDay),
  };
  return {
    ...w,
    pau,
    ruth,
    pauPendingNow,
    pauPendingNext,
    ruthPendingNext,
    expected,
    close: async () => {
      await p.dispose();
      await r.dispose();
      await w.close();
    },
  };
}

test('ROW-039.control.the-three-pending-vacations-are-listed', async () => {
  const s = await setup039();
  try {
    expect(s.expected, 'ROW-039 control: the test data gives distinct figures').toEqual({ pau2027: 17, pau2028: 24, ruth2027: 13, ruth2028: 14 });
    const list = await readPending(s.admin);
    for (const id of [s.pauPendingNow, s.pauPendingNext, s.ruthPendingNext]) {
      expect.soft(recordOf(list, id), `ROW-039 control: request ${id} is listed; ids ${idsOf(list)}`).toBeDefined();
    }
  } finally {
    await s.close();
  }
});

test('ROW-039.REQ-008.vacation-shows-the-persons-days-left-in-its-year', async () => {
  const s = await setup039();
  try {
    const e = s.expected;
    const list = await readPending(s.admin);
    const pauNext = recordOf(list, s.pauPendingNext);
    const pauNow = recordOf(list, s.pauPendingNow);
    const ruthNext = recordOf(list, s.ruthPendingNext);
    expect(pauNext && pauNow && ruthNext, `ROW-039: the three pending vacations are listed; ids ${idsOf(list)}`).toBeTruthy();
    expect.soft(hasNumber(pauNext!, e.pau2028), `ROW-039: Pau's next-year vacation shows Pau's 2028 days left ${e.pau2028}: ${show(pauNext)}`).toBe(true);
    expect.soft(hasNumber(pauNext!, e.ruth2028), `ROW-039: Pau's next-year vacation does not show Ruth's figure ${e.ruth2028}: ${show(pauNext)}`).toBe(false);
    expect.soft(hasNumber(pauNow!, e.pau2027), `ROW-039: Pau's current-year vacation shows Pau's 2027 days left ${e.pau2027}: ${show(pauNow)}`).toBe(true);
    expect.soft(hasNumber(ruthNext!, e.ruth2028), `ROW-039: Ruth's next-year vacation shows Ruth's 2028 days left ${e.ruth2028}: ${show(ruthNext)}`).toBe(true);
    expect.soft(hasNumber(ruthNext!, e.pau2028), `ROW-039: Ruth's next-year vacation does not show Pau's figure ${e.pau2028}: ${show(ruthNext)}`).toBe(false);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-037, ROW-038, ROW-039 — on the pending page itself (added, slice 1, test-author-8; lesson L-1)
// =====================================================================================================
// The API cases above read GET /api/admin/pending; a page that filters, re-sorts or relabels on the client keeps
// them green. These cases open /admin/pending in the admin's browser (engine door) and read each request's drawn row
// (page-figures.ts readPendingPage: a row is found by the person's display name and the request's first day,
// bounded by the other requests given; its order is its document order). Numbers in a row are read with
// own-page.ts saysNumber, every rendering of the row's days, every time of day, the names and the years taken out.

/** The row's text quoted for a message, or why it was not read. */
function quote(row: ReadRow, body: string): string {
  return row.found ? `"${row.text}"` : `(not drawn; page: "${body.slice(0, 500)}")`;
}

// ROW-037 promise: as above — REQ-008 "listing every pending request of every person"; fail-if (1) "a pending request
// ROW-037   of any person, the admin included, is missing from the page" — on the page itself. Authority: REQ-008 arm 1,
// ROW-037   A-006 (the admin decides their own requests like anyone else's), A-021 (a pending request whose days have
// ROW-037   passed stays pending).
// ROW-037 wrong product: GET /api/admin/pending lists all four, but the page leaves out the admin's own requests
// ROW-037   ("others" to decide), sick requests, next year's, or one whose days have passed — a client-side filter; or
// ROW-037   draws every request of the team whatever its state.
// ROW-037 given: setup037 — the admin's own vacation 22..23 March 2027; Uma's vacation 29..30 March and next-year
// ROW-037   vacation 10..11 January 2028; Vic's sick request for a past day, 1 March; Vic's vacation 5..6 April, approved
// ROW-037   (no longer pending). when: the admin's browser opens /admin/pending. then: the page draws a row for each of
// ROW-037   the four pending requests — the person's name with the request's first day — and no row for Vic's approved
// ROW-037   one (Vic's name with 5 April).
// ROW-037 controls: ROW-037.control.page-draws-a-members-pending-vacation — the page answers 200 and draws Uma's
// ROW-037   current-year vacation: the page lists a plain case, untouched by a filter on the admin, sick, next year or
// ROW-037   past days.
// ROW-037 technique: one pending request per class a filter fault drops (the admin's own, sick, next year, past
// ROW-037   days), plus a decided request of a listed person as the near miss that must not be drawn.
// ROW-037 cases: ROW-037 target=ROW-037.REQ-008.page-draws-every-pending-request-of-every-person-admin-included control=ROW-037.control.page-draws-a-members-pending-vacation

function specs037(s: Awaited<ReturnType<typeof setup037>>): PendingSpec[] {
  return [
    { label: "the admin's own vacation", name: s.install.admin.name, firstDay: '2027-03-22' },
    { label: "Uma's vacation", name: s.uma.name, firstDay: '2027-03-29' },
    { label: "Uma's next-year vacation", name: s.uma.name, firstDay: '2028-01-10' },
    { label: "Vic's sick request for a past day", name: s.vic.name, firstDay: '2027-03-01' },
    { label: "Vic's approved vacation", name: s.vic.name, firstDay: '2027-04-05' },
  ];
}
const ROW037_PENDING = ["the admin's own vacation", "Uma's vacation", "Uma's next-year vacation", "Vic's sick request for a past day"];

test('ROW-037.control.page-draws-a-members-pending-vacation', async ({ browser }) => {
  const s = await setup037();
  try {
    const read = await readPendingPage(browser, s.admin, specs037(s), { mustFind: ["Uma's vacation"] });
    expect.soft(read.status, 'ROW-037 control: /admin/pending answers the admin').toBe(200);
    const row = rowLabelled(read.rows, "Uma's vacation");
    expect(row.found, `ROW-037 control: the page draws Uma's vacation: ${quote(row, read.body)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-037.REQ-008.page-draws-every-pending-request-of-every-person-admin-included', async ({ browser }) => {
  const s = await setup037();
  try {
    const read = await readPendingPage(browser, s.admin, specs037(s), { mustFind: ROW037_PENDING });
    for (const label of ROW037_PENDING) {
      const row = rowLabelled(read.rows, label);
      expect.soft(row.found, `ROW-037: the page draws ${label}: ${quote(row, read.body)}`).toBe(true);
    }
    const decided = rowLabelled(read.rows, "Vic's approved vacation");
    expect.soft(decided.found, `ROW-037: the page draws no row for Vic's approved vacation (5 April): ${quote(decided, read.body)}`).toBe(false);
  } finally {
    await s.close();
  }
});

// ROW-038 promise: as above — REQ-008 "oldest first"; fail-if (2); the row's case: request A sent first for days in
// ROW-038   two weeks, request B sent later for tomorrow: A is listed before B — on the page itself. Authority: REQ-008
// ROW-038   arm 2.
// ROW-038 wrong product: GET /api/admin/pending in send order, but the page re-sorts on the client by first day (B, C,
// ROW-038   A — "most urgent first"), newest first (C, B, A), or groups the rows by person.
// ROW-038 given: setup038 — today Tuesday 2 March 2027 (team zone); Uma sends A for 16..17 March at 09:01, Vic sends
// ROW-038   B for 3 March (tomorrow) at 09:02, the admin sends C of their own for 8..9 March at 09:03. when: the admin's
// ROW-038   browser opens /admin/pending. then: the page draws A, B and C, each once, A before B before C in the page's
// ROW-038   document order.
// ROW-038 controls: ROW-038.control.page-draws-the-three-pending-requests — the three rows are drawn, so an order
// ROW-038   failure is not a missing row.
// ROW-038 technique: the row's own example values, plus a third request so by-first-day, newest-first and by-person
// ROW-038   orders all differ from the right one.
// ROW-038 cases: ROW-038 target=ROW-038.REQ-008.page-draws-pending-oldest-sent-first control=ROW-038.control.page-draws-the-three-pending-requests

function specs038(s: Awaited<ReturnType<typeof setup038>>): PendingSpec[] {
  return [
    { label: 'A', name: s.u.me.name, firstDay: '2027-03-16' },
    { label: 'B', name: s.v.me.name, firstDay: '2027-03-03' },
    { label: 'C', name: s.install.admin.name, firstDay: '2027-03-08' },
  ];
}

test('ROW-038.control.page-draws-the-three-pending-requests', async ({ browser }) => {
  const s = await setup038();
  try {
    const read = await readPendingPage(browser, s.admin, specs038(s));
    for (const label of ['A', 'B', 'C']) {
      const row = rowLabelled(read.rows, label);
      expect.soft(row.found, `ROW-038 control: the page draws request ${label}: ${quote(row, read.body)}`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

test('ROW-038.REQ-008.page-draws-pending-oldest-sent-first', async ({ browser }) => {
  const s = await setup038();
  try {
    const read = await readPendingPage(browser, s.admin, specs038(s));
    for (const label of ['A', 'B', 'C']) {
      const row = rowLabelled(read.rows, label);
      expect.soft(row.found && !row.repeated, `ROW-038: the page draws request ${label} once: ${quote(row, read.body)}`).toBe(true);
    }
    const order = read.rows.filter((r) => r.found).sort((x, y) => x.order - y.order).map((r) => r.label);
    expect(order, `ROW-038: A (sent first, two weeks out), B (tomorrow), C (next week) drawn in the order sent; page: "${read.body.slice(0, 500)}"`).toEqual(['A', 'B', 'C']);
  } finally {
    await s.close();
  }
});

// ROW-039 promise: as above — REQ-008 "and for vacation that person's days left in its year"; fail-if (3); the row's
// ROW-039   case: a person with different current-year and next-year figures sends a next-year vacation: the page shows
// ROW-039   exactly that person's next-year days left, kept apart from the labelled forecast — on the page itself.
// ROW-039   Authority: REQ-008 arm 3; A-020 (each year's balance uses that year's allowance); A-002 (days left counts
// ROW-039   approved days); A-032 (the forecast is a figure of its own).
// ROW-039 wrong product: GET /api/admin/pending right, but the page draws the current year's days left on every row
// ROW-039   (17 on Pau's next-year row), draws the forecast (20) in place of the days left, or draws another person's
// ROW-039   figure (Ruth's 14) — a client-side join by person or a lookup of the wrong year.
// ROW-039 given: setup039 — Pau, allowance 20 this year and 26 from next year, approved 3 days in 2027 (17 left) and 2
// ROW-039   days in 2028 (24 left), pending vacations 5..6 April 2027 and Thu 3..Tue 8 February 2028 (4 days: forecast
// ROW-039   20); Ruth, allowance 15, approved 2 days in 2027 (13 left) and 1 in 2028 (14 left), pending vacation 14..16
// ROW-039   February 2028. when: the admin's browser opens /admin/pending. then: Pau's next-year row draws 24 and, apart
// ROW-039   from it, the forecast 20, and neither 17 nor 14; Pau's current-year row draws 17 and not 24; Ruth's
// ROW-039   next-year row draws 14 and neither 24 nor 13.
// ROW-039 controls: ROW-039.control.page-draws-the-three-pending-vacations — the test data gives distinct figures
// ROW-039   and the three rows are drawn, so a missing figure is not a missing row.
// ROW-039 technique: decoys — every figure in play distinct (17, 24, 13, 14, 20), each person's figure read on that
// ROW-039   person's row with the other year's and the other person's as the near misses; the forecast's label is
// ROW-039   ROW-107's and ROW-159's.
// ROW-039 cases: ROW-039 target=ROW-039.REQ-008.page-draws-the-persons-days-left-in-its-year control=ROW-039.control.page-draws-the-three-pending-vacations

function specs039(s: Awaited<ReturnType<typeof setup039>>): PendingSpec[] {
  return [
    { label: "Pau's current-year vacation", name: s.pau.name, firstDay: '2027-04-05' },
    { label: "Pau's next-year vacation", name: s.pau.name, firstDay: '2028-02-03' },
    { label: "Ruth's next-year vacation", name: s.ruth.name, firstDay: '2028-02-14' },
  ];
}
/** Every day a row of setup039 may draw: the pending requests' days and the send date. */
const DAYS_039 = ['2027-04-05', '2027-04-06', '2028-02-03', '2028-02-08', '2028-02-14', '2028-02-16', '2027-03-02'];

test('ROW-039.control.page-draws-the-three-pending-vacations', async ({ browser }) => {
  const s = await setup039();
  try {
    expect(s.expected, 'ROW-039 control: the test data gives distinct figures').toEqual({ pau2027: 17, pau2028: 24, ruth2027: 13, ruth2028: 14 });
    const read = await readPendingPage(browser, s.admin, specs039(s));
    for (const spec of specs039(s)) {
      const row = rowLabelled(read.rows, spec.label);
      expect.soft(row.found, `ROW-039 control: the page draws ${spec.label}: ${quote(row, read.body)}`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

test('ROW-039.REQ-008.page-draws-the-persons-days-left-in-its-year', async ({ browser }) => {
  const s = await setup039();
  try {
    const e = s.expected;
    const read = await readPendingPage(browser, s.admin, specs039(s));
    const lit = [s.pau.name, s.ruth.name, s.install.admin.name, '2027', '2028'];
    const says = (row: ReadRow, n: number) => saysNumber(row.text, n, DAYS_039, lit);
    const pauNext = rowLabelled(read.rows, "Pau's next-year vacation");
    const pauNow = rowLabelled(read.rows, "Pau's current-year vacation");
    const ruthNext = rowLabelled(read.rows, "Ruth's next-year vacation");
    expect(pauNext.found && pauNow.found && ruthNext.found, `ROW-039: the page draws the three pending vacations; page: "${read.body.slice(0, 500)}"`).toBe(true);
    const forecast = e.pau2028 - countWeekdays('2028-02-03', '2028-02-08');
    expect.soft(says(pauNext, e.pau2028), `ROW-039: Pau's next-year row draws Pau's 2028 days left ${e.pau2028}: ${quote(pauNext, read.body)}`).toBe(true);
    expect.soft(says(pauNext, forecast), `ROW-039: Pau's next-year row draws the forecast ${forecast} apart from the days left: ${quote(pauNext, read.body)}`).toBe(true);
    expect.soft(says(pauNext, e.pau2027), `ROW-039: Pau's next-year row does not draw Pau's current-year ${e.pau2027}: ${quote(pauNext, read.body)}`).toBe(false);
    expect.soft(says(pauNext, e.ruth2028), `ROW-039: Pau's next-year row does not draw Ruth's ${e.ruth2028}: ${quote(pauNext, read.body)}`).toBe(false);
    expect.soft(says(pauNow, e.pau2027), `ROW-039: Pau's current-year row draws Pau's 2027 days left ${e.pau2027}: ${quote(pauNow, read.body)}`).toBe(true);
    expect.soft(says(pauNow, e.pau2028), `ROW-039: Pau's current-year row does not draw next year's ${e.pau2028}: ${quote(pauNow, read.body)}`).toBe(false);
    expect.soft(says(ruthNext, e.ruth2028), `ROW-039: Ruth's next-year row draws Ruth's 2028 days left ${e.ruth2028}: ${quote(ruthNext, read.body)}`).toBe(true);
    expect.soft(says(ruthNext, e.pau2028), `ROW-039: Ruth's next-year row does not draw Pau's ${e.pau2028}: ${quote(ruthNext, read.body)}`).toBe(false);
    expect.soft(says(ruthNext, e.ruth2027), `ROW-039: Ruth's next-year row does not draw Ruth's current-year ${e.ruth2027}: ${quote(ruthNext, read.body)}`).toBe(false);
  } finally {
    await s.close();
  }
});
