// Purpose: ledger tests for ROW-106, ROW-107 and ROW-108 (REQ-022) — the admin may approve a vacation that leaves the days left below zero, and the pending page shows, labelled, the days left each approval would leave, equal to the days left after that approval, in the request's own year.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, allowances, requests, the admin's two-step approve), read through records.ts, fresh per run; ROW-108's page cases added in slice 1 by batch test-author-8 (lesson L-1: the drawn figures read on /admin/pending beside the API), through page-figures.ts and own-page.ts.
//
// Boundaries (R6): the approval rule and the forecast's value are rules — at the HTTP harness (the two steps of
// approve, D-029; GET /api/admin/pending; GET /api/balance). "The pending page shows … labelled as such" is content on
// a page — read in the browser on /admin/pending, together with the page's data.
// The pending answer's field names are not in D-029: an entry is the record with the request's id and the forecast is
// read by value (records.ts); every figure is chosen so no other number of the entry (counted days, days left,
// allowance) or of the fixture equals it.
// The clock: Mon 2027-03-01 09:00 in Pacific/Auckland (UTC still Sun 02-28); current year 2027, next 2028.
import { test, expect } from '@playwright/test';
import {
  approve,
  confirmedActionRoutes,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  openPage,
  PAGES,
  readBalance,
  resetProduct,
  sendRequest,
  setAllowance,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import {
  daysLeftIn,
  holdsValue,
  normalState,
  observePending,
  observePersonRequests,
  recordById,
  show,
  showsNumber,
  stateOf,
  teamInstant,
  textAbout,
} from './records';
import { saysNumber } from './own-page';
import { readPendingPage, rowLabelled, type PendingPageRead, type PendingSpec, type ReadRow } from './page-figures';

const TZ = DEFAULT_TIME_ZONE;
const T_NOW = teamInstant('2027-03-01', '09:00', TZ);

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_NOW, timeZone: TZ });
  return keep(await signIn(install.admin));
}

async function member(admin: Actor, label: string, allowance: number): Promise<{ m: Member; actor: Actor }> {
  const m = await createMember(admin, { name: freshName(label), allowance });
  return { m, actor: keep(await signInMember(m)) };
}

/** The admin's approve, both steps, judged here (the act's refusal is the row's failure, not setup). */
async function approveRaw(admin: Actor, requestId: AccountId): Promise<{ effectStatus: number; actStatus: number | null }> {
  const { effect, act } = confirmedActionRoutes('approve', requestId);
  const e = await admin.api.get(effect);
  if (!e.ok()) return { effectStatus: e.status(), actStatus: null };
  const token = ((await e.json()) as { token?: string }).token;
  const a = await admin.api.post(act, { data: { token } });
  return { effectStatus: e.status(), actStatus: a.status() };
}

// ---------------------------------------------------------------------------------------------------
// ROW-106 promise: REQ-022 fail-if (1) "an approval is refused because it would leave the days left below zero";
// ROW-106   REQ-022 "the admin may approve a pending vacation request even when the approval would leave the person's
// ROW-106   days left for its year below zero" (A-032; A-018: lowering an allowance below the days already asked is allowed).
// ROW-106 wrong product: an approve that re-runs the send's balance check (REQ-002) and refuses with "not enough days".
// ROW-106 given: Lea, allowance 10, sends 8 weekdays (Mon 03-15 … Wed 03-24, accepted within 10); the admin then lowers
// ROW-106   her allowance to 5. when: the admin approves it through both steps. then: the effect step answers a token, the
// ROW-106   act answers 2xx, the request reads approved, and Lea's 2027 days left is −3.
// ROW-106 controls: the control case approves Kim's 2-day request within her allowance through the same two raw steps:
// ROW-106   both answer 2xx — the approve route works, so a refusal in the target is the below-zero rule.
// ROW-106 technique: the threshold crossed by a later allowance change (the case A-032 names); the act judged raw, never
// ROW-106   through a builder that would report a refusal as setup.
// ROW-106 cases: ROW-106 target=ROW-106.REQ-022.an-approval-that-leaves-days-left-below-zero-is-not-refused control=ROW-106.control.an-approval-within-the-allowance-goes-through
test('ROW-106.control.an-approval-within-the-allowance-goes-through', async () => {
  const admin = await start();
  const kim = await member(admin, 'Kim', 10);
  const id = await sendRequest(kim.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  const r = await approveRaw(admin, id);
  expect(r.effectStatus, 'ROW-106 control: the approve effect step answers').toBe(200);
  expect(r.actStatus !== null && r.actStatus >= 200 && r.actStatus < 300, `ROW-106 control: the approve act answers 2xx (answered ${r.actStatus})`).toBe(true);
  expect(daysLeftIn(await readBalance(kim.actor), 2027), 'ROW-106 control: Kim has 8 days left').toBe(8);
});

test('ROW-106.REQ-022.an-approval-that-leaves-days-left-below-zero-is-not-refused', async () => {
  const admin = await start();
  const lea = await member(admin, 'Lea', 10);
  const id = await sendRequest(lea.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-24' });
  await setAllowance(admin, lea.m.id, 5);
  expect(daysLeftIn(await readBalance(lea.actor), 2027), 'ROW-106: before the approval Lea has 5 days left with 8 pending (setup)').toBe(5);
  const r = await approveRaw(admin, id);
  expect.soft(r.effectStatus, 'ROW-106: the approve effect step is not refused').toBe(200);
  expect.soft(r.actStatus !== null && r.actStatus >= 200 && r.actStatus < 300, `ROW-106: the approve act is not refused (answered ${r.actStatus})`).toBe(true);
  const rec = recordById(await observePersonRequests(admin, lea.m.id), id, '2027-03-15');
  expect.soft(normalState(stateOf(rec)), `ROW-106: the request reads approved (${show(rec)})`).toBe('approved');
  expect.soft(daysLeftIn(await readBalance(lea.actor), 2027), "ROW-106: Lea's 2027 days left is 5 − 8 = −3").toBe(-3);
});

// ---------------------------------------------------------------------------------------------------
// ROW-107 promise: REQ-022 fail-if (2) "the pending page does not show the days left the approval would leave";
// ROW-107   REQ-022 "before approving, the pending page shows, labelled as such, the days left the approval would leave"
// ROW-107   (A-032: "below zero if so").
// ROW-107 wrong product: a pending page that shows only the current days left (REQ-008's figure, 47 for Mara), or a
// ROW-107   forecast clamped at zero, or the right figure on the wrong person's entry.
// ROW-107 given: Mara (allowance 50, 3 days approved → 47 left) with a 6-day pending vacation → would leave 41; Nico
// ROW-107   (allowance 60) with a 4-day pending vacation → 56; Quinn (allowance 9) with a 7-day pending vacation, then the
// ROW-107   allowance lowered to 4 → −3. when: the admin reads the pending page's data and opens /admin/pending. then:
// ROW-107   Mara's entry holds 41, Nico's 56 and not 41, Quinn's −3; on the page, Mara's part shows 41, Nico's part 56 and
// ROW-107   not 41, Quinn's part −3, and the page labels the figure as what the approval would leave.
// ROW-107 controls: the control case shows the page answers the admin and shows each person's name — every entry is
// ROW-107   drawn, so a missing figure is not a missing entry.
// ROW-107 technique: decoys — the days left (47) and the forecast (41) differ, each person's figure differs, one is
// ROW-107   negative; the figure read in each person's own part of the page (one exact place).
// ROW-107 cases: ROW-107 target=ROW-107.REQ-022.the-pending-page-shows-the-labelled-days-left-each-approval-would-leave control=ROW-107.control.the-pending-page-draws-every-entry
async function forecasts() {
  const admin = await start();
  const mara = await member(admin, 'Mara', 50);
  const nico = await member(admin, 'Nico', 60);
  const quinn = await member(admin, 'Quinn', 9);
  await approve(admin, await sendRequest(mara.actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  const maraReq = await sendRequest(mara.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-22' });
  const nicoReq = await sendRequest(nico.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-18' });
  const quinnReq = await sendRequest(quinn.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-23' });
  await setAllowance(admin, quinn.m.id, 4);
  return { admin, mara: mara.m, nico: nico.m, quinn: quinn.m, maraReq, nicoReq, quinnReq };
}

test('ROW-107.control.the-pending-page-draws-every-entry', async ({ browser }) => {
  const f = await forecasts();
  const opened = await openPage(browser, f.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPending);
    expect(res?.status(), 'ROW-107 control: /admin/pending answers the admin').toBe(200);
    for (const p of [f.mara, f.nico, f.quinn]) {
      await expect.soft(opened.page.getByText(p.name).first(), `ROW-107 control: ${p.name}'s entry is drawn`).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await opened.close();
  }
});

test('ROW-107.REQ-022.the-pending-page-shows-the-labelled-days-left-each-approval-would-leave', async ({ browser }) => {
  const f = await forecasts();
  const pending = await observePending(f.admin);
  const mara = recordById(pending, f.maraReq, '2027-03-15');
  const nico = recordById(pending, f.nicoReq, '2027-03-15');
  const quinn = recordById(pending, f.quinnReq, '2027-03-15');
  expect.soft(holdsValue(mara, 41), `ROW-107: Mara's pending entry holds the days left her approval would leave, 41 (${show(mara)})`).toBe(true);
  expect.soft(holdsValue(nico, 56), `ROW-107: Nico's entry holds 56 (${show(nico)})`).toBe(true);
  expect.soft(holdsValue(nico, 41), "ROW-107: Nico's entry does not carry Mara's figure").toBe(false);
  expect.soft(holdsValue(quinn, -3), `ROW-107: Quinn's entry holds −3, below zero (${show(quinn)})`).toBe(true);

  const opened = await openPage(browser, f.admin);
  const page = opened.page;
  try {
    const res = await page.goto(PAGES.adminPending);
    expect(res?.status(), 'ROW-107: /admin/pending is reached (setup)').toBe(200);
    await expect(page.getByText(f.quinn.name).first(), 'ROW-107: the entries are drawn').toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const names = [f.mara.name, f.nico.name, f.quinn.name];
    const maraPart = await textAbout(page, f.mara.name, names);
    const nicoPart = await textAbout(page, f.nico.name, names);
    const quinnPart = await textAbout(page, f.quinn.name, names);
    expect.soft(showsNumber(maraPart.text, 41), `ROW-107: Mara's part of the page shows 41 ("${maraPart.text.slice(0, 300)}")`).toBe(true);
    expect.soft(showsNumber(nicoPart.text, 56), `ROW-107: Nico's part shows 56 ("${nicoPart.text.slice(0, 300)}")`).toBe(true);
    expect.soft(showsNumber(nicoPart.text, 41), "ROW-107: Nico's part does not show Mara's figure").toBe(false);
    expect.soft(showsNumber(quinnPart.text, -3), `ROW-107: Quinn's part shows −3 ("${quinnPart.text.slice(0, 300)}")`).toBe(true);
    const body = await page.locator('body').innerText();
    expect.soft(/\bafter\b|would leave|if approved|once approved|would be left/i.test(body), 'ROW-107: the page labels the figure as the days left after approving').toBe(true);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-108 promise: REQ-022 fail-if (3) "the shown figure differs from the days left after the approval"; INV-001 "the
// ROW-108   pending page's figure of what an approval would leave is a forecast, not the days left, and equals this value
// ROW-108   after that approval". The row's cases: with two pending vacations in one year, the forecast for one equals the
// ROW-108   days left after approving that one alone; for a next-year request, the forecast uses next year's days left.
// ROW-108 wrong product: a forecast of days left minus ALL that year's pending days (18 for both 2027 requests), or one
// ROW-108   computed from the current year's days left for a next-year request (25 instead of 19).
// ROW-108 given: Rhea, allowance 30 for 2027 and 24 from 2028, 3 days approved in each year (27 and 21 left); pending:
// ROW-108   P1 4 days and P2 5 days in 2027, Q 2 days in 2028. when: the admin reads the pending data, approves P1 alone,
// ROW-108   reads again, then approves Q. then: before, P1's entry holds 23, P2's 22 and Q's 19; after approving P1, Rhea's
// ROW-108   2027 days left is 23 and P2's entry now holds 18; after approving Q, her 2028 days left is 19.
// ROW-108 controls: the control case reads the setup: the three entries are listed, and Rhea's balance reads 27 with 9
// ROW-108   pending for 2027 and 21 with 2 pending for 2028.
// ROW-108 technique: independent golden figures (computed here from the fixture, never read from the product), two
// ROW-108   pending requests in one year as the row names, and a second year with a different days left.
// ROW-108 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)
async function twoYears() {
  const admin = await start();
  const rhea = await member(admin, 'Rhea', 30);
  await setAllowance(admin, rhea.m.id, 24, { startsNextYear: true });
  await approve(admin, await sendRequest(rhea.actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(rhea.actor, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-09' }));
  const p1 = await sendRequest(rhea.actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-18' });
  const p2 = await sendRequest(rhea.actor, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-26' });
  const q = await sendRequest(rhea.actor, { kind: 'vacation', firstDay: '2028-02-14', lastDay: '2028-02-15' });
  return { admin, rhea, p1, p2, q };
}

test('ROW-108.control.the-setup-balances-and-entries-read-as-built', async () => {
  const f = await twoYears();
  const pending = await observePending(f.admin);
  for (const [id, day] of [
    [f.p1, '2027-03-15'],
    [f.p2, '2027-03-22'],
    [f.q, '2028-02-14'],
  ] as const) {
    expect.soft(recordById(pending, id, day), `ROW-108 control: request ${id} is on the pending list (${show(pending)})`).toBeDefined();
  }
  const b = await readBalance(f.rhea.actor);
  const y27 = b.years.find((y) => Number(y.year) === 2027);
  const y28 = b.years.find((y) => Number(y.year) === 2028);
  expect.soft([y27?.daysLeft, y27?.pending], 'ROW-108 control: 2027 reads 27 left, 9 pending').toEqual([27, 9]);
  expect.soft([y28?.daysLeft, y28?.pending], 'ROW-108 control: 2028 reads 21 left, 2 pending').toEqual([21, 2]);
});

test('ROW-108.REQ-022.the-forecast-equals-the-days-left-after-that-approval-in-its-year', async () => {
  const f = await twoYears();
  const before = await observePending(f.admin);
  const p1 = recordById(before, f.p1, '2027-03-15');
  const p2 = recordById(before, f.p2, '2027-03-22');
  const q = recordById(before, f.q, '2028-02-14');
  expect.soft(holdsValue(p1, 23), `ROW-108: P1's forecast is 27 − 4 = 23, not 27 − 9 (${show(p1)})`).toBe(true);
  expect.soft(holdsValue(p2, 22), `ROW-108: P2's forecast is 27 − 5 = 22 (${show(p2)})`).toBe(true);
  expect.soft(holdsValue(q, 19), `ROW-108: Q's forecast uses next year's days left, 21 − 2 = 19, not 27 − 2 (${show(q)})`).toBe(true);

  await approve(f.admin, f.p1);
  expect.soft(daysLeftIn(await readBalance(f.rhea.actor), 2027), "ROW-108: after approving P1 alone, Rhea's 2027 days left equals P1's shown figure, 23").toBe(23);
  const p2After = recordById(await observePending(f.admin), f.p2, '2027-03-22');
  expect.soft(holdsValue(p2After, 18), `ROW-108: P2's forecast now reads 23 − 5 = 18 (${show(p2After)})`).toBe(true);

  await approve(f.admin, f.q);
  expect.soft(daysLeftIn(await readBalance(f.rhea.actor), 2028), "ROW-108: after approving Q, Rhea's 2028 days left equals Q's shown figure, 19").toBe(19);
});

// ---------------------------------------------------------------------------------------------------
// ROW-108 — on the pending page itself (added, slice 1, test-author-8; lesson L-1)
// ---------------------------------------------------------------------------------------------------
// The ROW-108 cases above read the forecast from GET /api/admin/pending; a page that works its forecast out on the
// client (days left minus every pending day of the year, or from the current year's days left) keeps them green.
// These cases open /admin/pending in the admin's browser (engine door) and read each request's drawn row
// (page-figures.ts readPendingPage: the person's name and the request's first day, bounded by the other requests);
// a figure is a number of its own once the row's days, times of day, names and years are taken out (own-page.ts).
//
// ROW-108 promise: REQ-022 fail-if (3) "the shown figure differs from the days left after the approval" — the figure
// ROW-108   the pending page shows; REQ-022 "before approving, the pending page shows, labelled as such, the days left
// ROW-108   the approval would leave" (A-032); INV-001 (the forecast equals the value after that approval). The row's
// ROW-108   cases: with two pending vacations in one year, the forecast for one equals the days left after approving
// ROW-108   that one alone; for a next-year request, the forecast uses next year's days left.
// ROW-108 wrong product: the pending data right, but the page draws days left minus ALL that year's pending days (18
// ROW-108   on both 2027 rows), or works a next-year row's forecast from the current year's days left (25 instead of 19),
// ROW-108   or keeps drawing P2's first forecast (22) after P1 is approved.
// ROW-108 given: twoYears() — Rhea, allowance 30 for 2027 and 24 from 2028, 3 days approved in each year (27 and 21
// ROW-108   left); pending P1 Mon 15..Thu 18 March 2027 (4), P2 Mon 22..Fri 26 March 2027 (5), Q Mon 14..Tue 15 February
// ROW-108   2028 (2). when: the admin's browser opens /admin/pending; the admin approves P1 alone; the page is opened
// ROW-108   again; the admin approves Q. then: before, P1's row draws 23 and not 18, P2's draws 22 and not 18, Q's draws
// ROW-108   19 and not 25; after approving P1, Rhea's 2027 days left is 23, the figure P1's row drew; the page no longer
// ROW-108   draws P1, P2's row draws 18 and not 22, Q's still 19; after approving Q, Rhea's 2028 days left is 19, the
// ROW-108   figure Q's row drew.
// ROW-108 controls: ROW-108.control.page-draws-the-three-pending-rows — the page draws P1, P2 and Q, each with its
// ROW-108   year's days left (27, 27, 21): the rows are reached and the figures read.
// ROW-108 technique: independent golden figures (worked out here from the fixture, never read from the product),
// ROW-108   two pending requests in one year as the row names, a second year with a different days left; before and
// ROW-108   after each approval, the drawn figure compared with the balance the approval leaves.
// ROW-108 cases: ROW-108 target=ROW-108.REQ-022.page-draws-the-forecast-each-approval-leaves-in-its-year control=ROW-108.control.page-draws-the-three-pending-rows

function specs108(name: string): PendingSpec[] {
  return [
    { label: 'P1', name, firstDay: '2027-03-15' },
    { label: 'P2', name, firstDay: '2027-03-22' },
    { label: 'Q', name, firstDay: '2028-02-14' },
  ];
}
/** Every day a row of twoYears() may draw: the pending requests' days and the send date. */
const DAYS_108 = ['2027-03-15', '2027-03-18', '2027-03-22', '2027-03-26', '2028-02-14', '2028-02-15', '2027-03-01'];

function reader108(f: Awaited<ReturnType<typeof twoYears>>, read: PendingPageRead) {
  const lit = [f.rhea.m.name, f.rhea.m.email, '2027', '2028'];
  return {
    row: (label: string) => rowLabelled(read.rows, label),
    says: (row: ReadRow, n: number) => saysNumber(row.text, n, DAYS_108, lit),
    quote: (row: ReadRow) => (row.found ? `"${row.text}"` : `(not drawn; page: "${read.body.slice(0, 500)}")`),
  };
}

test('ROW-108.control.page-draws-the-three-pending-rows', async ({ browser }) => {
  const f = await twoYears();
  const read = await readPendingPage(browser, f.admin, specs108(f.rhea.m.name));
  const r = reader108(f, read);
  for (const [label, left] of [
    ['P1', 27],
    ['P2', 27],
    ['Q', 21],
  ] as const) {
    const row = r.row(label);
    expect.soft(row.found, `ROW-108 control: the page draws ${label}: ${r.quote(row)}`).toBe(true);
    expect.soft(r.says(row, left), `ROW-108 control: ${label}'s row draws its year's days left ${left}: ${r.quote(row)}`).toBe(true);
  }
});

test('ROW-108.REQ-022.page-draws-the-forecast-each-approval-leaves-in-its-year', async ({ browser }) => {
  const f = await twoYears();
  const before = await readPendingPage(browser, f.admin, specs108(f.rhea.m.name));
  const b = reader108(f, before);
  const [p1, p2, q] = ['P1', 'P2', 'Q'].map((l) => b.row(l));
  expect(p1.found && p2.found && q.found, `ROW-108: the page draws P1, P2 and Q; page: "${before.body.slice(0, 500)}"`).toBe(true);
  expect.soft(b.says(p1, 23), `ROW-108: P1's row draws the forecast 27 − 4 = 23: ${b.quote(p1)}`).toBe(true);
  expect.soft(b.says(p1, 18), `ROW-108: P1's row does not draw 27 − 9 = 18 (every pending day taken off): ${b.quote(p1)}`).toBe(false);
  expect.soft(b.says(p2, 22), `ROW-108: P2's row draws the forecast 27 − 5 = 22: ${b.quote(p2)}`).toBe(true);
  expect.soft(b.says(p2, 18), `ROW-108: P2's row does not draw 27 − 9 = 18: ${b.quote(p2)}`).toBe(false);
  expect.soft(b.says(q, 19), `ROW-108: Q's row draws next year's forecast 21 − 2 = 19: ${b.quote(q)}`).toBe(true);
  expect.soft(b.says(q, 25), `ROW-108: Q's row does not draw this year's 27 − 2 = 25: ${b.quote(q)}`).toBe(false);

  await approve(f.admin, f.p1);
  const left2027 = daysLeftIn(await readBalance(f.rhea.actor), 2027);
  expect.soft(left2027, "ROW-108: after approving P1 alone, Rhea's 2027 days left is 23").toBe(23);
  expect.soft(left2027 !== undefined && b.says(p1, left2027), `ROW-108: the days left after approving P1 (${left2027}) is the figure P1's row drew: ${b.quote(p1)}`).toBe(true);

  const after = await readPendingPage(browser, f.admin, specs108(f.rhea.m.name), { mustFind: ['P2', 'Q'] });
  const a = reader108(f, after);
  expect.soft(a.row('P1').found, `ROW-108: after its approval the page no longer draws P1: ${a.quote(a.row('P1'))}`).toBe(false);
  const p2After = a.row('P2');
  const qAfter = a.row('Q');
  expect.soft(a.says(p2After, 18), `ROW-108: P2's row now draws 23 − 5 = 18: ${a.quote(p2After)}`).toBe(true);
  expect.soft(a.says(p2After, 22), `ROW-108: P2's row no longer draws its first forecast 22: ${a.quote(p2After)}`).toBe(false);
  expect.soft(a.says(qAfter, 19), `ROW-108: Q's row still draws 19 (P1 was in 2027): ${a.quote(qAfter)}`).toBe(true);

  await approve(f.admin, f.q);
  const left2028 = daysLeftIn(await readBalance(f.rhea.actor), 2028);
  expect.soft(left2028, "ROW-108: after approving Q, Rhea's 2028 days left is 19").toBe(19);
  expect.soft(left2028 !== undefined && a.says(qAfter, left2028), `ROW-108: the days left after approving Q (${left2028}) is the figure Q's row drew: ${a.quote(qAfter)}`).toBe(true);
});
