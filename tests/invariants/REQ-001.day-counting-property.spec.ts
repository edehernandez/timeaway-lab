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
import { test, expect } from '@playwright/test';
import { approve, createMember, readBalance, resetProduct, sendRequest, signIn, signInMember, type Actor } from './harness';
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
