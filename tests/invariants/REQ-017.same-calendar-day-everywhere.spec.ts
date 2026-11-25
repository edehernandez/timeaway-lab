// Purpose: ledger tests for ROW-130 (REQ-001, REQ-012, REQ-017) — a picked first and last day is stored, counted and shown as the same calendar day on every page whatever the browser and team time zones, including ranges across both daylight-saving changes.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; weekday counts by the tests' own UTC calendar oracle.
//
// Boundary (R6): stored and counted at the HTTP harness (the person's records, GET /api/balance, GET /api/calendar);
// shown is paint, read in the browser on the person's own requests page "/", the admin's pending page and the admin's
// person page (D-029), with the browser's zone on the other side of UTC from the team's.
// The server's zone: the product runs in the container's UTC (BASELINE "Test environment"), far from both the team
// zone and the browser zone in each case, so a product that converts a day through the server's zone is caught here;
// a change of the server process's zone itself is ROW-137's, and needs a harness control this harness lacks.
// The calendar is paint too: read as painted (robustness.ts readGrid — dated cells and weekday headings by their boxes)
// on /calendar in browser zones at both extremes of UTC (slice 1 addition, batch test-author-10).
// Slice 1, brief test-author-25 (owner grant A-053): the server process's own zone moved off UTC through the D-048
// restart door (doors-process.ts restartProduct), west and east, with the stored, counted, shown and painted checks
// repeated there; every earlier case is kept as it was. These cases run last in the file and restore the image's zone.
import { test, expect, type Browser } from '@playwright/test';
import { approve, freshName, PAGES, type AccountId } from './harness';
import { restartProduct } from './doors-process';
import { readGrid, settle, shownMonth } from './robustness';
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

// ---------------------------------------------------------------------------------------------------
// The calendar painted in browser zones on both sides of UTC (added: test-author pass, slice 1, batch test-author-10)
// ---------------------------------------------------------------------------------------------------

/** Browser zones on both sides of UTC, to the extremes: a day placed through the browser's zone moves in one of them. */
const BROWSER_ZONES = [LOS_ANGELES, 'Pacific/Pago_Pago', AUCKLAND, 'Pacific/Kiritimati'];

/** The months each team's calendar is painted in: every month holding a range's end or a daylight-saving change, and one middle month. */
const CALENDAR_MONTHS: Record<'EAST' | 'WEST', number[]> = { EAST: [3, 4, 6, 9, 10], WEST: [3, 6, 11] };

interface Approved {
  team: Awaited<ReturnType<typeof startTeam>>;
  vera: Awaited<ReturnType<typeof addMember>>;
  sami: Awaited<ReturnType<typeof addMember>>;
  /** The weekdays each person is away, by the test's own UTC oracle. */
  veraDays: Set<string>;
  samiDays: Set<string>;
}

/** The config's ranges sent by two members named apart (no name a substring of the other) and approved, as setup. */
async function approvedWorld(cfg: Config): Promise<Approved> {
  const team = await startTeam({ zone: cfg.teamZone, now: teamInstant(cfg.teamZone, cfg.sentOn, '15:00') });
  const vera = await addMember(team, { allowance: 25, name: freshName('Vera') });
  const sami = await addMember(team, { allowance: 25, name: freshName('Sami') });
  for (const [firstDay, lastDay] of cfg.vacations) await approve(team.admin, await sendOk(vera.actor, { kind: 'vacation', firstDay, lastDay }));
  await approve(team.admin, await sendOk(sami.actor, { kind: 'sick', firstDay: cfg.sick[0], lastDay: cfg.sick[1] }));
  return {
    team,
    vera,
    sami,
    veraDays: new Set(cfg.vacations.flatMap(([a, b]) => weekdaysBetween(a, b))),
    samiDays: new Set(weekdaysBetween(cfg.sick[0], cfg.sick[1])),
  };
}

const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function utcWeekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function weekdaysOfMonth(year: number, month: number): string[] {
  const mm = String(month).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return weekdaysBetween(`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`);
}

/**
 * Opens /calendar for one month in one browser zone and lists every way the painted grid puts a day off its own date:
 * the month shown and titled, every weekday of the month drawn, each dated cell's own day number, each cell under its
 * own weekday's heading, and each person named in exactly the cells of their away weekdays (neighbouring-month cells
 * included) — never the day before or after.
 */
async function calendarProblems(browser: Browser, w: Approved, browserZone: string, year: number, month: number): Promise<string[]> {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const names = [w.vera.member.name, w.sami.member.name];
  const opened = await openPageIn(browser, w.vera.actor, { timezoneId: browserZone });
  const out: string[] = [];
  try {
    const res = await opened.page.goto(`/calendar?year=${year}&month=${month}`);
    if (res?.status() !== 200) return [`/calendar?year=${year}&month=${month} answered ${res?.status()}`];
    await settle(opened.page);
    const anyAway = [...w.veraDays, ...w.samiDays].some((d) => d.startsWith(ym));
    // A bounded wait for the month's cells (and, when anyone is away in it, a name) to be painted; no sleep.
    await expect
      .poll(
        async () => {
          const g = await readGrid(opened.page);
          return g.cells.some((c) => c.date.startsWith(ym)) && (!anyAway || g.cells.some((c) => names.some((n) => c.text.includes(n))));
        },
        { timeout: 10_000 },
      )
      .toBe(true)
      .catch(() => undefined);
    const grid = await readGrid(opened.page);

    if (shownMonth(grid.cells) !== ym) out.push(`the grid shows ${shownMonth(grid.cells)}, not ${ym}`);
    const lines = (await opened.page.locator('body').innerText().catch(() => '')).split('\n');
    const word = MONTH_WORDS[month - 1];
    const hasWord = (l: string | undefined) => new RegExp(`\\b${word}\\b`).test(l ?? '');
    const hasYear = (l: string | undefined) => new RegExp(`\\b${year}\\b`).test(l ?? '');
    const titled = lines.some((l, i) => hasWord(l) && (hasYear(l) || hasYear(lines[i + 1])));
    if (!titled) out.push(`no line names ${word} ${year}`);

    for (const d of weekdaysOfMonth(year, month)) if (!grid.cells.some((c) => c.date === d)) out.push(`${d}: no cell`);

    for (const c of grid.cells) {
      const veraShown = c.text.includes(w.vera.member.name);
      const samiShown = c.text.includes(w.sami.member.name);
      if (veraShown !== w.veraDays.has(c.date)) out.push(`${c.date}: Vera ${veraShown ? 'shown' : 'missing'}`);
      if (samiShown !== w.samiDays.has(c.date)) out.push(`${c.date}: Sami ${samiShown ? 'shown' : 'missing'}`);
      let bare = c.text;
      for (const n of names) bare = bare.split(n).join(' ');
      const first = (bare.match(/\d+/) ?? [])[0];
      if (first === undefined || Number(first) !== Number(c.date.slice(8, 10))) out.push(`${c.date}: its cell's day number reads ${first}`);
      const above = new Set(grid.headings.filter((h) => c.cx >= h.left - 1 && c.cx <= h.right + 1 && h.bottom <= c.top + 2).map((h) => h.weekday));
      if (above.size !== 1 || !above.has(utcWeekday(c.date))) out.push(`${c.date} (weekday ${utcWeekday(c.date)}) under heading ${[...above].join('/') || 'none'}`);
    }
  } finally {
    await opened.close();
  }
  return out;
}

async function runCalendarConfig(browser: Browser, cfg: Config, key: 'EAST' | 'WEST'): Promise<void> {
  const w = await approvedWorld(cfg);
  const team = cfg.teamZone === AUCKLAND ? 'team Pacific/Auckland' : 'team America/Los_Angeles';
  for (const zone of BROWSER_ZONES) {
    const say = `ROW-130 (${team}, browser ${zone})`;
    for (const m of CALENDAR_MONTHS[key]) {
      expect.soft(await calendarProblems(browser, w, zone, 2027, m), `${say} /calendar 2027-${m}: every away day painted on its own date`).toEqual([]);
    }
    // The other pages the row names, in the same browser zone: each first and last day shown as that day, never the day either side.
    const vDays = cfg.vacations.flat();
    const vDecoys = cfg.vacations.flatMap(([a, b]) => [addDays(a, -1), addDays(b, 1)]);
    const sDecoys = [addDays(cfg.sick[0], -1), addDays(cfg.sick[1], 1)];
    await checkShown(browser, w.vera.actor, zone, PAGES.home, vDays, vDecoys, say);
    await checkShown(browser, w.sami.actor, zone, PAGES.home, [...cfg.sick], sDecoys, say);
    await checkShown(browser, w.team.admin, zone, PAGES.adminPerson(w.vera.member.id), vDays, vDecoys, say);
    await checkShown(browser, w.team.admin, zone, PAGES.adminPerson(w.sami.member.id), [...cfg.sick], sDecoys, say);
  }
}

// ROW-130 promise: as above — REQ-012 (the calendar lists by name, for each Monday to Friday day, the people with an
// ROW-130   approved request covering it), REQ-017 (the first and last day as sent) and D-007 (days are calendar dates,
// ROW-130   never instants): each approved day is painted on its own date whatever the browser's zone.
// ROW-130 wrong product: a calendar page that places a day by new Date('2027-04-05').getDate() (or getDay() for its
// ROW-130   column, or builds its cells as local midnights and keys them with toISOString()): in America/Los_Angeles or
// ROW-130   Pacific/Pago_Pago every away day lands one cell early, in Pacific/Auckland or Pacific/Kiritimati one cell
// ROW-130   late, while the container's UTC — the only zone the other tests paint the calendar in — shows it right.
// ROW-130 given: per case a team in one zone (Auckland, then Los Angeles); Vera's two approved vacations each across
// ROW-130   one of its daylight-saving changes; Sami's approved sick range across both. when: Vera opens /calendar for
// ROW-130   each month holding a range's end or a change, and one middle month, in browsers set to Los Angeles,
// ROW-130   Pago Pago, Auckland and Kiritimati; Vera and Sami open /, and the admin each one's person page, in the same
// ROW-130   browsers. then: the grid shows and titles the asked month, draws every weekday of it, each dated cell reads
// ROW-130   its own day number and sits under its own weekday's heading, and each name is in exactly the cells of that
// ROW-130   person's away weekdays (the oracle's), never the cell before or after; the other pages show each first and
// ROW-130   last day as that day and never the day before the first or after the last.
// ROW-130 controls: the control case paints one approved day in a browser in the team's own zone — the fixture, the
// ROW-130   address reading and the grid reading work, untouched by a browser-zone fault (the browser and the team agree).
// ROW-130 technique: the clock's origin — browser zones at both extremes of UTC, each crossing the date line against
// ROW-130   the stored day — with the neighbouring cells as decoys, against the test's own UTC weekday oracle.
// ROW-130 cases: ROW-130 target=ROW-130.REQ-012.calendar-paints-days-on-their-dates-in-every-browser-zone-team-east control=ROW-130.control.calendar-paints-one-day-with-the-browser-in-the-team-zone
test('ROW-130.control.calendar-paints-one-day-with-the-browser-in-the-team-zone', async ({ browser }) => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-10', '15:00') });
  const vera = await addMember(team, { name: freshName('Vera') });
  const sami = await addMember(team, { name: freshName('Sami') });
  await approve(team.admin, await sendOk(vera.actor, { kind: 'vacation', firstDay: '2027-05-12', lastDay: '2027-05-12' }));
  const w: Approved = { team, vera, sami, veraDays: new Set(['2027-05-12']), samiDays: new Set() };
  expect(await calendarProblems(browser, w, AUCKLAND, 2027, 5), 'ROW-130 control: 12 May painted on 12 May, browser in the team zone').toEqual([]);
});

test('ROW-130.REQ-012.calendar-paints-days-on-their-dates-in-every-browser-zone-team-east', async ({ browser }) => {
  test.setTimeout(600_000);
  await runCalendarConfig(browser, EAST, 'EAST');
});

test('ROW-130.REQ-012.calendar-paints-days-on-their-dates-in-every-browser-zone-team-west', async ({ browser }) => {
  test.setTimeout(600_000);
  await runCalendarConfig(browser, WEST, 'WEST');
});

// ---------------------------------------------------------------------------------------------------
// The server process's zone away from UTC (added: test-author pass, slice 1, brief test-author-25, through the D-048
// restart door; these cases come last in the file and put the image's own zone back when they end)
// ---------------------------------------------------------------------------------------------------

/** Process zones west and east of UTC, each with its own daylight-saving changes inside the configs' ranges. */
const SERVER_ZONES = [LOS_ANGELES, AUCKLAND];

/** Runs `fn` with the product restarted under the process time zone `zone`, and restarts it under the image's own zone after, whatever happened. */
async function withServerZone(zone: string, fn: () => Promise<void>): Promise<void> {
  try {
    await restartProduct({ timeZone: zone });
    await fn();
  } finally {
    await restartProduct();
  }
}

/** Every check of runConfig and the painted calendar, for both team configs, under one server zone. */
async function runUnderServerZone(browser: Browser, serverZone: string): Promise<void> {
  await withServerZone(serverZone, async () => {
    for (const [key, cfg] of [['EAST', EAST], ['WEST', WEST]] as const) {
      const label = `${cfg.label}, server process ${serverZone}`;
      await runConfig(browser, { ...cfg, label });
      const w = await approvedWorld(cfg);
      for (const m of CALENDAR_MONTHS[key]) {
        expect
          .soft(await calendarProblems(browser, w, cfg.teamZone, 2027, m), `ROW-130 (${label}, browser in the team zone) /calendar 2027-${m}: every away day painted on its own date`)
          .toEqual([]);
      }
    }
  });
}

// ROW-130 promise: as above — REQ-001 (only Monday to Friday counted), REQ-017 (the first and last day as sent),
// ROW-130   REQ-012 (each approved weekday on the calendar) and D-007 (days are calendar dates in the team's zone, today
// ROW-130   computed on the server): the same calendar day stored, counted and shown "whatever the SERVER, browser and
// ROW-130   team time zones" — the server half, which the earlier cases left at the container's UTC.
// ROW-130 wrong product: a server that reads a sent day with new Date('2027-04-05') and takes its weekday or its date
// ROW-130   back with the process's local getDay()/getDate() — right under UTC, one day early under America/Los_Angeles
// ROW-130   (Monday read as Sunday, Saturday as Friday, so the count, the stored day and the calendar move) — or one that
// ROW-130   builds a day as a local midnight (new Date(y, m, d)) and writes it with toISOString(), one day early under
// ROW-130   Pacific/Auckland; or one that walks a range in 24-hour steps from a local midnight, so the 23- and 25-hour
// ROW-130   days of the process zone's own daylight-saving changes (Los Angeles 14 Mar and 7 Nov 2027, Auckland 4 Apr and
// ROW-130   26 Sep 2027, all inside the ranges) drop or double a day; server-rendered pages formatting in the process zone.
// ROW-130 given: the product restarted under process zone America/Los_Angeles, then under Pacific/Auckland; under each,
// ROW-130   both configs of the earlier cases (team Auckland with a Los Angeles browser, team Los Angeles with an Auckland
// ROW-130   browser): member V's two vacations each across one of the team zone's changes, member S's sick range across
// ROW-130   both. when: the requests are sent, read, shown, approved, listed on the calendar and the calendar painted.
// ROW-130 then: every check of runConfig — each record carries exactly its first and last day as sent; V's pending count
// ROW-130   and S's count are the oracle's weekdays and never one off; the own page, the pending page and the person page
// ROW-130   show each first and last day and never the day before the first or after the last; each calendar month lists
// ROW-130   the person on exactly the range's weekdays — and /calendar, painted in a browser in the team's zone, puts each
// ROW-130   away weekday in its own dated cell under its own weekday's heading, never the cell either side.
// ROW-130 controls: ROW-130.control.a-day-reaches-the-calendar-after-a-server-zone-restart — after a restart under Los
// ROW-130   Angeles the product answers, a send is recorded, and an approved day reaches the calendar's month on some day:
// ROW-130   the restart door, the reset and the paths work there, whatever the day arithmetic.
// ROW-130 technique: the clock's origin — the process zone on each side of UTC, crossed with team and browser zones on
// ROW-130   each side, and ranges straddling every daylight-saving change of all of them — against the test's own UTC
// ROW-130   weekday oracle, with the day either side of every range as the decoy.
// ROW-130 cases: ROW-130 target=ROW-130.REQ-017.days-stay-put-with-the-server-process-in-los-angeles control=ROW-130.control.a-day-reaches-the-calendar-after-a-server-zone-restart
test('ROW-130.control.a-day-reaches-the-calendar-after-a-server-zone-restart', async () => {
  test.setTimeout(300_000);
  await withServerZone(LOS_ANGELES, async () => {
    const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-10', '15:00') });
    const v = await addMember(team);
    const id = await sendOk(v.actor, { kind: 'vacation', firstDay: '2027-05-12', lastDay: '2027-05-12' });
    expect((await ownRecords(v.actor)).some((r) => String(r.id) === String(id)), 'ROW-130 control (server Los Angeles): the send is recorded').toBe(true);
    await approve(team.admin, id);
    expect((await calendarDatesFor(v.actor, 2027, 5, v.member.name)).length, 'ROW-130 control (server Los Angeles): the approved day is listed on some day of May 2027').toBeGreaterThan(0);
  });
});

test('ROW-130.REQ-017.days-stay-put-with-the-server-process-in-los-angeles', async ({ browser }) => {
  test.setTimeout(900_000);
  await runUnderServerZone(browser, SERVER_ZONES[0]);
});

test('ROW-130.REQ-017.days-stay-put-with-the-server-process-in-auckland', async ({ browser }) => {
  test.setTimeout(900_000);
  await runUnderServerZone(browser, SERVER_ZONES[1]);
});
