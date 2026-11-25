// Purpose: ledger test for ROW-158 (REQ-001, REQ-012, INV-001) — over independently generated ranges, a request's counted days, the days charged to the balance and the days shown on the calendar are the same set of weekdays.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, requests, approvals), fresh per run; the oracle is readings.ts's weekday oracle, proved against known anchor dates.
//
// Boundary (R6): a counting rule, proved at the HTTP harness: the request's counted days on its own list record
// (GET /api/requests, readings.ts's reading), the charge as GET /api/balance's change, the calendar as
// GET /api/calendar (D-029: {days:[{date,people:[{name,accountId}]}]}).
// Zones: the team zone is set through the reset to two zones far from UTC on either side, Pacific/Kiritimati
// (UTC+14) and Pacific/Pago_Pago (UTC−11), each at an instant whose UTC date differs from the team date. The
// server process's own zone is the harness's (docker-compose.test.yml sets none for the product): this file does
// not set it, and its result holds for the zone the harness runs the product in.
//
// ROW-158 promise: REQ-001 "only the Monday to Friday days in the range are counted as requested days" and fail-if
// ROW-158   (2) "a Saturday or Sunday inside the range is counted as a requested day or shown as away"; REQ-012 (each
// ROW-158   Monday-to-Friday day lists the people with an approved request covering it); INV-001 (days left subtract
// ROW-158   the counted days); A-017. The row's case: an independent weekday oracle from known anchor dates, with
// ROW-158   the team zone set away from UTC.
// ROW-158 wrong product: dates turned into instants at UTC midnight and back in the team zone (every day shifted by
// ROW-158   one on one side of UTC: Friday counted as Saturday); a calendar built with its own weekday rule that
// ROW-158   disagrees with the count at a month end or leap day; a count that includes the last day exclusively.
// ROW-158 given: for each zone, a fresh install with today Mon 2027-03-01 in the team zone (UTC 2027-02-28 18:00
// ROW-158   for +14; UTC 2027-03-02 07:00 for −11) and a member with allowance 260 (never refused); the named
// ROW-158   ranges Fri 03-05..Mon 03-08 (2), Sat 03-13..Wed 03-17 (3), Thu 04-29..Tue 05-04 across a month end (4),
// ROW-158   Sat 12-25..Fri 12-31 (5), Mon 2028-02-28..Fri 03-03 across the leap day (5), plus 6 ranges generated from a
// ROW-158   fresh seed (1 to 20 calendar days, starting on any weekday, within 2027 and 2028, never overlapping).
// ROW-158   when: each is sent as a vacation and approved. then: its list record counts the oracle's weekdays; the
// ROW-158   year's days left drop by exactly that count at approval; and across every month touched the calendar
// ROW-158   lists the member on exactly the oracle's set of weekdays — no Saturday, no Sunday, no day outside a range.
// ROW-158 controls: the control case sends and approves one range and the calendar lists the member on some day of
// ROW-158   that month — the path from a request to the calendar is reached, whatever the day arithmetic.
// ROW-158 technique: a property over generated ranges against an independent oracle, plus named examples at the
// ROW-158   weekend, month-end and leap-day edges, in two zones on either side of UTC.
// ROW-158 cases: ROW-158 target=ROW-158.REQ-001.counted-charged-and-calendar-days-are-the-oracle-weekdays control=ROW-158.control.an-approved-range-reaches-the-calendar
//
// Slice 1, brief test-author-25 (owner grant A-053): the row's "server … zones set away from UTC" — the same property
// run with the product restarted under process zones west and east of UTC through the D-048 restart door
// (doors-process.ts restartProduct); those cases come last in the file and restore the image's own zone. Every
// earlier case is kept as it was.
import { test, expect } from '@playwright/test';
import { approve, createMember, readBalance, resetProduct, sendRequest, signIn, signInMember, type Actor } from './harness';
import { restartProduct } from './doors-process';
import {
  addDays,
  balanceYear,
  checkWeekdayAnchors,
  countWeekdays,
  countedDays,
  datesListedAcross,
  dayNumber,
  freshSeed,
  getJson,
  instantAt,
  isoOf,
  monthsOf,
  recordById,
  seeded,
  weekdaysIn,
  yearOfDate,
} from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const ZONES = [
  { zone: 'Pacific/Kiritimati', offset: 14, hour: 8 }, // 2027-03-01 08:00 local = 2027-02-28T18:00Z
  { zone: 'Pacific/Pago_Pago', offset: -11, hour: 20 }, // 2027-03-01 20:00 local = 2027-03-02T07:00Z
];
const TODAY = '2027-03-01';

const NAMED: [string, string][] = [
  ['2027-03-05', '2027-03-08'],
  ['2027-03-13', '2027-03-17'],
  ['2027-04-29', '2027-05-04'],
  ['2027-12-25', '2027-12-31'],
  ['2028-02-28', '2028-03-03'],
];

function generated(seed: number, taken: [string, string][]): [string, string][] {
  const rand = seeded(seed);
  const out: [string, string][] = [];
  const lo = dayNumber('2027-03-02');
  const hi = dayNumber('2028-12-10');
  for (let tries = 0; out.length < 6 && tries < 200; tries += 1) {
    const first = isoOf(lo + Math.floor(rand() * (hi - lo)));
    let last = addDays(first, Math.floor(rand() * 20));
    if (yearOfDate(last) !== yearOfDate(first)) last = `${yearOfDate(first)}-12-31`;
    if (countWeekdays(first, last) === 0) continue;
    const all = [...taken, ...out];
    if (all.some(([a, b]) => first <= b && a <= last)) continue;
    out.push([first, last]);
  }
  return out;
}

test('ROW-158.control.an-approved-range-reaches-the-calendar', async () => {
  const install = await resetProduct({ timeZone: ZONES[0].zone, now: instantAt(TODAY, ZONES[0].hour, ZONES[0].offset) });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 260 });
  const session = keep(await signInMember(m));
  await approve(admin, await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' }));
  const dates = await datesListedAcross(session.api, [{ year: 2027, month: 3 }], m, 'ROW-158 control');
  expect(dates.length, 'ROW-158 control: the member is listed on some day of March 2027').toBeGreaterThan(0);
});

test('ROW-158.REQ-001.counted-charged-and-calendar-days-are-the-oracle-weekdays', async () => {
  checkWeekdayAnchors();
  const seed = freshSeed();
  for (const z of ZONES) {
    const where = `ROW-158 ${z.zone} seed ${seed}`;
    const install = await resetProduct({ timeZone: z.zone, now: instantAt(TODAY, z.hour, z.offset) });
    const admin: Actor = keep(await signIn(install.admin));
    const m = await createMember(admin, { allowance: 260 });
    const session = keep(await signInMember(m));
    const ranges = [...NAMED, ...generated(seed, NAMED)];
    const expected: string[] = [];
    for (const [first, last] of ranges) {
      const oracle = weekdaysIn(first, last);
      const y = yearOfDate(first);
      const before = balanceYear(await readBalance(session), y)?.daysLeft;
      const id = await sendRequest(session, { kind: 'vacation', firstDay: first, lastDay: last });
      const rec = recordById(await getJson(session.api, '/api/requests', 'ROW-158'), id);
      expect(rec, `${where}: the request ${first}..${last} is listed`).toBeDefined();
      expect.soft(countedDays(rec!), `${where}: ${first}..${last} counts the oracle's ${oracle.length} weekdays`).toBe(oracle.length);
      await approve(admin, id);
      const after = balanceYear(await readBalance(session), y)?.daysLeft;
      expect.soft((before ?? NaN) - (after ?? NaN), `${where}: approving ${first}..${last} charges ${oracle.length} days`).toBe(oracle.length);
      expected.push(...oracle);
    }
    const months = ranges.flatMap(([a, b]) => monthsOf(a, b));
    const shown = await datesListedAcross(session.api, months, m, 'ROW-158');
    expect.soft(shown, `${where}: the calendar lists the member on exactly the oracle's weekdays`).toEqual([...expected].sort());
  }
});

// ---------------------------------------------------------------------------------------------------
// The server process's zone away from UTC (added: test-author pass, slice 1, brief test-author-25)
// ---------------------------------------------------------------------------------------------------

/** Process zones west and east of UTC (each with daylight-saving changes inside the ranges' years). */
const SERVER_ZONES = ['America/Los_Angeles', 'Pacific/Auckland'];

/** The property of the case above, for both team zones, under whatever process zone the product now runs in. */
async function propertyHolds(seed: number, server: string): Promise<void> {
  for (const z of ZONES) {
    const where = `ROW-158 server process ${server}, team ${z.zone}, seed ${seed}`;
    const install = await resetProduct({ timeZone: z.zone, now: instantAt(TODAY, z.hour, z.offset) });
    const admin: Actor = keep(await signIn(install.admin));
    const m = await createMember(admin, { allowance: 260 });
    const session = keep(await signInMember(m));
    const ranges = [...NAMED, ...generated(seed, NAMED)];
    const expected: string[] = [];
    for (const [first, last] of ranges) {
      const oracle = weekdaysIn(first, last);
      const y = yearOfDate(first);
      const before = balanceYear(await readBalance(session), y)?.daysLeft;
      const id = await sendRequest(session, { kind: 'vacation', firstDay: first, lastDay: last });
      const rec = recordById(await getJson(session.api, '/api/requests', 'ROW-158'), id);
      expect(rec, `${where}: the request ${first}..${last} is listed`).toBeDefined();
      expect.soft(countedDays(rec!), `${where}: ${first}..${last} counts the oracle's ${oracle.length} weekdays`).toBe(oracle.length);
      await approve(admin, id);
      const after = balanceYear(await readBalance(session), y)?.daysLeft;
      expect.soft((before ?? NaN) - (after ?? NaN), `${where}: approving ${first}..${last} charges ${oracle.length} days`).toBe(oracle.length);
      expected.push(...oracle);
    }
    const months = ranges.flatMap(([a, b]) => monthsOf(a, b));
    const shown = await datesListedAcross(session.api, months, m, 'ROW-158');
    expect.soft(shown, `${where}: the calendar lists the member on exactly the oracle's weekdays`).toEqual([...expected].sort());
  }
}

// ROW-158 promise: as above — REQ-001 (only the Monday to Friday days of a range are counted; fail-if 2), REQ-012
// ROW-158   (the calendar lists each Monday-to-Friday day of an approved request), INV-001 (days left subtract the
// ROW-158   counted days), A-017, D-007 (dates are calendar dates, today computed on the server); the row's case "with
// ROW-158   SERVER and team zones set away from UTC" — the server half, which the case above left at the container's UTC.
// ROW-158 wrong product: a server that takes a day's weekday from new Date('2027-03-05').getDay() (UTC midnight read in
// ROW-158   the process's local zone): under America/Los_Angeles every day reads as the day before — Saturday counted as
// ROW-158   Friday, Monday dropped as Sunday — so counts, charges and calendar days move, while under UTC it is right; or
// ROW-158   one that builds local midnights (new Date(y, m - 1, d)) and keys them by toISOString(), one day early under
// ROW-158   Pacific/Auckland; or one that walks a range in 24-hour steps across the process zone's own changes.
// ROW-158 given: the product restarted under process zone America/Los_Angeles, then under Pacific/Auckland; under each,
// ROW-158   the case above's two team zones (Pacific/Kiritimati at UTC+14 and Pacific/Pago_Pago at UTC-11, today Mon
// ROW-158   2027-03-01 in the team zone at an instant whose UTC date differs), a member with allowance 260, the five named
// ROW-158   ranges (weekend edges, a month end, the end of 2027, the 2028 leap day) and six ranges from one fresh seed.
// ROW-158   when: each is sent as a vacation and approved. then: its list record counts the oracle's weekdays; approving
// ROW-158   it lowers its year's days left by exactly that count; across every month touched the calendar lists the
// ROW-158   member on exactly the oracle's set of weekdays — no Saturday, no Sunday, no day outside a range.
// ROW-158 controls: ROW-158.control.an-approved-range-reaches-the-calendar-after-a-server-zone-restart — after a restart
// ROW-158   under Los Angeles a sent and approved range lists the member on some day of its month: the restart, the reset
// ROW-158   and the path from a request to the calendar work there, whatever the day arithmetic.
// ROW-158 technique: a property over generated ranges against the independent oracle (readings.ts, proved on known
// ROW-158   anchor dates by checkWeekdayAnchors), plus named edge examples, in four server-by-team zone pairings, each zone
// ROW-158   off UTC; one seed for both server zones, printed in every message.
// ROW-158 cases: ROW-158 target=ROW-158.REQ-001.oracle-weekdays-hold-with-the-server-process-away-from-utc control=ROW-158.control.an-approved-range-reaches-the-calendar-after-a-server-zone-restart
test('ROW-158.control.an-approved-range-reaches-the-calendar-after-a-server-zone-restart', async () => {
  test.setTimeout(300_000);
  try {
    await restartProduct({ timeZone: SERVER_ZONES[0] });
    const install = await resetProduct({ timeZone: ZONES[0].zone, now: instantAt(TODAY, ZONES[0].hour, ZONES[0].offset) });
    const admin = keep(await signIn(install.admin));
    const m = await createMember(admin, { allowance: 260 });
    const session = keep(await signInMember(m));
    await approve(admin, await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' }));
    const dates = await datesListedAcross(session.api, [{ year: 2027, month: 3 }], m, 'ROW-158 control');
    expect(dates.length, 'ROW-158 control (server Los Angeles): the member is listed on some day of March 2027').toBeGreaterThan(0);
  } finally {
    await restartProduct();
  }
});

test('ROW-158.REQ-001.oracle-weekdays-hold-with-the-server-process-away-from-utc', async () => {
  test.setTimeout(900_000);
  checkWeekdayAnchors();
  const seed = freshSeed();
  try {
    for (const server of SERVER_ZONES) {
      await restartProduct({ timeZone: server });
      await propertyHolds(seed, server);
    }
  } finally {
    await restartProduct();
  }
});
