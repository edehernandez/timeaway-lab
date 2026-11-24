// Purpose: ledger tests for ROW-130 (REQ-001, REQ-012, REQ-017) — a picked first and last day is stored, counted and shown as the same calendar day on every page whatever the browser and team time zones, including ranges across both daylight-saving changes.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; weekday counts by the tests' own UTC calendar oracle.
//
// Boundary (R6): stored and counted at the HTTP harness (the person's records, GET /api/balance, GET /api/calendar);
// shown is paint, read in the browser on the person's own requests page "/", the admin's pending page and the admin's
// person page (D-029), with the browser's zone on the other side of UTC from the team's.
// The server's zone: the product runs in the container's UTC (BASELINE "Test environment"), far from both the team
// zone and the browser zone in each case, so a product that converts a day through the server's zone is caught here;
// a change of the server process's zone itself is ROW-137's, and needs a harness control this harness lacks.
import { test, expect, type Browser } from '@playwright/test';
import { approve, PAGES, type AccountId } from './harness';
import {
  addDays,
  addMember,
  AUCKLAND,
  calendarDatesFor,
  dayLeaves,
  disposeAll,
  LOS_ANGELES,
  numberLeaves,
  openPageIn,
  ownRecords,
  pageTextWhen,
  sendOk,
  shownDate,
  startTeam,
  teamInstant,
  weekdaysBetween,
  yearFigures,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

interface Config {
  label: string;
  teamZone: string;
  browserZone: string;
  sentOn: string;
  /** Two vacations, each across one of the team zone's daylight-saving changes. */
  vacations: [string, string][];
  /** One sick range across both changes. */
  sick: [string, string];
}

const EAST: Config = {
  label: 'team Pacific/Auckland, browser America/Los_Angeles',
  teamZone: AUCKLAND,
  browserZone: LOS_ANGELES,
  sentOn: '2027-03-10',
  vacations: [
    ['2027-04-02', '2027-04-06'], // Auckland leaves summer time on Sun 4 April 2027
    ['2027-09-24', '2027-09-28'], // and enters it on Sun 26 September 2027
  ],
  sick: ['2027-03-29', '2027-10-01'],
};

const WEST: Config = {
  label: 'team America/Los_Angeles, browser Pacific/Auckland',
  teamZone: LOS_ANGELES,
  browserZone: AUCKLAND,
  sentOn: '2027-03-01',
  vacations: [
    ['2027-03-12', '2027-03-16'], // Los Angeles enters summer time on Sun 14 March 2027
    ['2027-11-05', '2027-11-09'], // and leaves it on Sun 7 November 2027
  ],
  sick: ['2027-03-08', '2027-11-12'],
};

function monthsOf(first: string, last: string): number[] {
  const out: number[] = [];
  for (let m = Number(first.slice(5, 7)); m <= Number(last.slice(5, 7)); m += 1) out.push(m);
  return out;
}

/** The page shows each of `days` and none of `decoys`. */
async function checkShown(
  browser: Browser,
  who: Parameters<typeof openPageIn>[1],
  browserZone: string,
  path: string,
  days: string[],
  decoys: string[],
  say: string,
): Promise<void> {
  const opened = await openPageIn(browser, who, { timezoneId: browserZone });
  const text = await pageTextWhen(opened, path, days.map(shownDate));
  for (const d of days) expect.soft(shownDate(d).test(text), `${say} ${path}: shows ${d} as that day`).toBe(true);
  for (const d of decoys) expect.soft(shownDate(d).test(text), `${say} ${path}: does not show ${d}`).toBe(false);
  await opened.close();
}

async function runConfig(browser: Browser, cfg: Config): Promise<void> {
  const say = `ROW-130 (${cfg.label})`;
  const team = await startTeam({ zone: cfg.teamZone, now: teamInstant(cfg.teamZone, cfg.sentOn, '15:00') });
  const v = await addMember(team, { allowance: 25 });
  const s = await addMember(team, { allowance: 25 });
  const vIds: AccountId[] = [];
  for (const [firstDay, lastDay] of cfg.vacations) vIds.push(await sendOk(v.actor, { kind: 'vacation', firstDay, lastDay }));
  const sId = await sendOk(s.actor, { kind: 'sick', firstDay: cfg.sick[0], lastDay: cfg.sick[1] });

  // Stored as sent.
  const vRecs = await ownRecords(v.actor);
  cfg.vacations.forEach(([firstDay, lastDay], i) => {
    const rec = vRecs.find((r) => String(r.id) === String(vIds[i]));
    expect.soft([...new Set(dayLeaves(rec))].sort(), `${say}: vacation ${i + 1} is stored with exactly ${firstDay} and ${lastDay}`).toEqual([firstDay, lastDay]);
  });
  const sRec = (await ownRecords(s.actor)).find((r) => String(r.id) === String(sId));
  expect.soft([...new Set(dayLeaves(sRec))].sort(), `${say}: the sick range is stored with exactly ${cfg.sick.join(' and ')}`).toEqual([...cfg.sick]);

  // Counted: Monday to Friday, across each change.
  const vCount = cfg.vacations.reduce((n, [a, b]) => n + weekdaysBetween(a, b).length, 0);
  expect.soft((await yearFigures(v.actor, 2027))?.pending, `${say}: the two vacations count ${vCount} weekdays`).toBe(vCount);
  const sCount = weekdaysBetween(cfg.sick[0], cfg.sick[1]).length;
  const sNumbers = numberLeaves(sRec);
  expect.soft(sNumbers, `${say}: the sick range counts ${sCount} weekdays`).toContain(sCount);
  expect.soft(sNumbers.includes(sCount - 1) || sNumbers.includes(sCount + 1), `${say}: the sick range's count is not one off`).toBe(false);

  // Shown, before approval: the person's own page and the admin's pending page.
  const vDays = cfg.vacations.flat();
  const vDecoys = cfg.vacations.flatMap(([a, b]) => [addDays(a, -1), addDays(b, 1)]);
  const sDecoys = [addDays(cfg.sick[0], -1), addDays(cfg.sick[1], 1)];
  await checkShown(browser, v.actor, cfg.browserZone, PAGES.home, vDays, vDecoys, say);
  await checkShown(browser, s.actor, cfg.browserZone, PAGES.home, [...cfg.sick], sDecoys, say);
  await checkShown(browser, team.admin, cfg.browserZone, PAGES.adminPending, [...vDays, ...cfg.sick], [...vDecoys, ...sDecoys], say);

  // On the calendar after approval: exactly the weekdays of each range, month by month.
  for (const id of [...vIds, sId]) await approve(team.admin, id);
  for (const [a, b] of cfg.vacations) {
    for (const m of monthsOf(a, b)) {
      const want = weekdaysBetween(a, b).filter((d) => Number(d.slice(5, 7)) === m);
      expect.soft(await calendarDatesFor(v.actor, 2027, m, v.member.name), `${say}: the calendar for 2027-${m} lists the vacation exactly on its weekdays`).toEqual(want);
    }
  }
  for (const m of monthsOf(cfg.sick[0], cfg.sick[1])) {
    const want = weekdaysBetween(cfg.sick[0], cfg.sick[1]).filter((d) => Number(d.slice(5, 7)) === m);
    expect.soft(await calendarDatesFor(v.actor, 2027, m, s.member.name), `${say}: the calendar for 2027-${m} lists the sick range exactly on its weekdays`).toEqual(want);
  }
  await checkShown(browser, team.admin, cfg.browserZone, PAGES.adminPerson(v.member.id), vDays, vDecoys, say);
}

// ---------------------------------------------------------------------------------------------------
// ROW-130 promise: REQ-001 (a first and a last day; only Monday to Friday counted), REQ-017 (the first and last day as
// ROW-130   sent) and REQ-012 (the calendar lists each approved weekday), with D-007 (days are calendar dates in the
// ROW-130   team's zone, never instants): the picked day is stored, counted and shown as the same calendar day on every
// ROW-130   page whatever the server, browser and team zones, including ranges across both daylight-saving changes.
// ROW-130 wrong product: one that turns a picked day into an instant (midnight in the team, server or browser zone)
// ROW-130   and back in another zone — the browser in Los Angeles then shows a day picked in Auckland as the day before,
// ROW-130   the server's UTC moves an Auckland midnight to the previous date — or one that counts or lays out a range
// ROW-130   by adding 24-hour steps, so a 23- or 25-hour day at a change drops or doubles a day.
// ROW-130 given: per case a team in one zone and a browser on the other side of UTC (Auckland/Los Angeles, then the
// ROW-130   reverse); member V's two vacations each across one change; member S's sick range across both. when: the
// ROW-130   requests are sent, read, shown, approved and laid on the calendar. then: each record carries exactly its
// ROW-130   first and last day as sent; V's pending count and S's count are the oracle's weekdays; the own page, the
// ROW-130   pending page and the person page show each first and last day and never the day before the first or after
// ROW-130   the last; each calendar month lists the person on exactly the range's weekdays in that month.
// ROW-130 controls: the control case — one weekday away from any change, team and browser in the same zone — shows the
// ROW-130   send, the record, the page and the calendar paths working, untouched by a zone fault.
// ROW-130 technique: the clock's origin and zones far apart — the team zone, the browser zone and the server's UTC on
// ROW-130   three sides — and ranges straddling each daylight-saving change, with decoys one day either side.
// ROW-130 cases: ROW-130 target=ROW-130.REQ-017.days-stay-put-team-east-browser-west control=ROW-130.control.one-weekday-in-one-zone
test('ROW-130.control.one-weekday-in-one-zone', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-10', '15:00') });
  const v = await addMember(team);
  const id = await sendOk(v.actor, { kind: 'vacation', firstDay: '2027-05-12', lastDay: '2027-05-12' });
  const rec = (await ownRecords(v.actor)).find((r) => String(r.id) === String(id));
  expect([...new Set(dayLeaves(rec))], 'ROW-130 control: stored as 2027-05-12').toEqual(['2027-05-12']);
  await checkShown(browser, v.actor, AUCKLAND, PAGES.home, ['2027-05-12'], [], 'ROW-130 control');
  await approve(team.admin, id);
  expect(await calendarDatesFor(v.actor, 2027, 5, v.member.name), 'ROW-130 control: on the calendar on 12 May').toEqual(['2027-05-12']);
});

test('ROW-130.REQ-017.days-stay-put-team-east-browser-west', async ({ browser }) => {
  await runConfig(browser, EAST);
});

test('ROW-130.REQ-017.days-stay-put-team-west-browser-east', async ({ browser }) => {
  await runConfig(browser, WEST);
});
