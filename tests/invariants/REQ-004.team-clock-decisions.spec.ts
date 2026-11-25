// Purpose: ledger tests for ROW-133 (REQ-004, REQ-007, REQ-010, REQ-011, REQ-016, REQ-021) — every decision on today or the current year reads the team time zone, at 23:30 and 00:30 team time in summer and winter time, and at New Year in both offset directions.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; every instant worked out by the tests' own Intl oracle, never the machine's clock.
// Slice 1, brief test-author-9 (lesson L-1): the days-left years' page cases added beside their data case — / read in
// the member's browser (own zone UTC) through journey-pages.ts yearFigures, every data assertion kept.
//
// Boundary (R6): the send window, the days-left years, the admin cancel, the switch-off refusal and cut-off and the
// year an allowance change starts are rules, proved at the HTTP harness; "the cancel action shown" is paint, proved in
// the browser on the admin's person page (D-029 /admin/people/:id), opened with the browser's own zone at UTC so a
// page that works out today in the browser is caught too.
//
// The moments. The container runs in UTC (BASELINE "Test environment"). Two team zones far from it on either side:
// Pacific/Auckland (UTC+13 in its summer, February; UTC+12 in its winter, June) and America/Los_Angeles (UTC-8 in
// February, UTC-7 in June). At 00:30 in Auckland the UTC date is still the day before; at 23:30 in Los Angeles the
// UTC date is already the day after; the other two times are the zones' same-date controls. Every day moment is a
// Wednesday, so the Monday of its week, its Tuesday and its Friday are weekdays. The New Year moments: 00:30 on
// 1 January 2027 in Auckland (UTC still 2026) and 23:30 on 31 December 2026 in Los Angeles (UTC already 2027), and
// their same-year controls.
import { test, expect, type Browser } from '@playwright/test';
import { PAGES, type Actor } from './harness';
import { yearFigures as drawnYearFigures } from './journey-pages';
import { saysNumber } from './own-page';
import {
  addDays,
  addMember,
  AUCKLAND,
  calendarDatesFor,
  canSignIn,
  disposeAll,
  firstWeekdayOfYear,
  isAccepted,
  isRefusal,
  isWeekday,
  lastWeekdayOfYear,
  LOS_ANGELES,
  openPageIn,
  pageTextWhen,
  sendApproved,
  sendOk,
  setTeamClock,
  shownDate,
  signInAgain,
  startTeam,
  teamDateOf,
  teamInstant,
  tryAllowance,
  tryConfirmed,
  trySend,
  trySwitchOn,
  utcDateOf,
  weekdaysBetween,
  yearFigures,
  yearOf,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

interface Moment {
  label: string;
  zone: string;
  today: string;
  time: string;
}

const DAY_MOMENTS: Moment[] = [
  { label: 'auckland-summer-00:30', zone: AUCKLAND, today: '2027-02-17', time: '00:30' },
  { label: 'auckland-summer-23:30', zone: AUCKLAND, today: '2027-02-17', time: '23:30' },
  { label: 'auckland-winter-00:30', zone: AUCKLAND, today: '2027-06-16', time: '00:30' },
  { label: 'auckland-winter-23:30', zone: AUCKLAND, today: '2027-06-16', time: '23:30' },
  { label: 'los-angeles-summer-00:30', zone: LOS_ANGELES, today: '2027-06-16', time: '00:30' },
  { label: 'los-angeles-summer-23:30', zone: LOS_ANGELES, today: '2027-06-16', time: '23:30' },
  { label: 'los-angeles-winter-00:30', zone: LOS_ANGELES, today: '2027-02-17', time: '00:30' },
  { label: 'los-angeles-winter-23:30', zone: LOS_ANGELES, today: '2027-02-17', time: '23:30' },
];

const NEW_YEAR_MOMENTS: Moment[] = [
  { label: 'auckland-new-year-00:30', zone: AUCKLAND, today: '2027-01-01', time: '00:30' },
  { label: 'auckland-new-years-eve-23:30', zone: AUCKLAND, today: '2026-12-31', time: '23:30' },
  { label: 'los-angeles-new-years-eve-23:30', zone: LOS_ANGELES, today: '2026-12-31', time: '23:30' },
  { label: 'los-angeles-new-year-00:30', zone: LOS_ANGELES, today: '2027-01-01', time: '00:30' },
];

/** The moment's instant, checked back by the oracle, and a label naming team and UTC dates for every message. */
function at(m: Moment): { iso: string; say: string } {
  const iso = teamInstant(m.zone, m.today, m.time);
  expect(teamDateOf(m.zone, iso), `ROW-133 setup: ${m.label} reads ${m.today} in ${m.zone}`).toBe(m.today);
  return { iso, say: `ROW-133 ${m.label} (team ${m.today} ${m.time} ${m.zone}, UTC date ${utcDateOf(iso)})` };
}

// ---------------------------------------------------------------------------------------------------
// ROW-133 promise: every decision on today or the current year uses the team time zone (REQ-004 fail-if (6): accepted
// ROW-133   or refused exactly as if today, the current and the next year were read from the team-zone date at the
// ROW-133   moment of sending; CON-003; D-007 "today is computed on the server, never in the browser"), checked at 23:30
// ROW-133   and 00:30 team time in summer and winter time and at New Year in both offset directions. The decisions:
// ROW-133   the send window (REQ-004), the days-left years (REQ-007 / A-027), the admin cancel from today on (REQ-010),
// ROW-133   the switch-off refusal and cut-off (REQ-016 / A-033), the year an allowance change starts (REQ-011 /
// ROW-133   A-043), the cancel action shown (REQ-021 / A-031).
// ROW-133 wrong product: one that reads today from the server process's own date (UTC in the container) or from the
// ROW-133   browser's, or converts the team date with a fixed offset that is right in one season only: at Auckland
// ROW-133   00:30 it believes it is still yesterday, at Los Angeles 23:30 that it is already tomorrow, and at New Year
// ROW-133   that it is the other year.
// ROW-133 given: a fresh team in the moment's zone with the clock at the moment (or set up on the Monday of that week
// ROW-133   at 09:00 and the clock then moved to the moment). when: the decision is asked at the moment. then: it
// ROW-133   answers as the team date says — vacation for team-yesterday refused and for team-today accepted; balance
// ROW-133   years exactly [team year, team year + 1]; an approved Monday–Friday request cancelled keeps exactly Monday and
// ROW-133   Tuesday (days left = allowance − 2, the calendar exactly those two days); switch-off refused while a pending
// ROW-133   request holds team-yesterday, and when allowed keeps exactly the days before team-today; a this-year change
// ROW-133   sets the team year, a next-year change the year after it only; the cancel action is on the request ending
// ROW-133   today and absent from the request that ended yesterday.
// ROW-133 controls: the control case runs at a midday moment where the team and UTC dates agree, so a right product and
// ROW-133   a UTC-reading one both pass it: the session, the send route and the balance route work. In every case the
// ROW-133   moment is checked back by the oracle, and each day moment pairs a discriminating time with a same-date one.
// ROW-133 technique: the clock's origin — values just either side of the team's midnight, at instants where the team
// ROW-133   date and the container's UTC date differ in both directions, in both seasons and at New Year — each decision
// ROW-133   asked with a case that fails a UTC-reading product in one direction and its pair in the other.
// ROW-133 cases: ROW-133 target=ROW-133.REQ-004.send-window-reads-the-team-date control=ROW-133.control.team-and-utc-dates-agree-at-midday
test('ROW-133.control.team-and-utc-dates-agree-at-midday', async () => {
  const m: Moment = { label: 'auckland-summer-13:30', zone: AUCKLAND, today: '2027-02-17', time: '13:30' };
  const { iso, say } = at(m);
  expect(utcDateOf(iso), 'ROW-133 control setup: the team and UTC dates agree').toBe(m.today);
  const team = await startTeam({ zone: m.zone, now: iso });
  const { actor } = await addMember(team);
  const t = await trySend(actor, { kind: 'vacation', firstDay: m.today, lastDay: m.today });
  expect(isAccepted(t), `${say}: a vacation for today is accepted (answered ${t.status} ${t.text.slice(0, 200)})`).toBe(true);
  const y = await trySend(actor, { kind: 'vacation', firstDay: '2027-02-16', lastDay: '2027-02-16' });
  expect(isRefusal(y), `${say}: a vacation for yesterday is refused (answered ${y.status})`).toBe(true);
  expect((await yearFigures(actor, 2027))?.pending, `${say}: today's day is pending in 2027`).toBe(1);
});

test('ROW-133.REQ-004.send-window-reads-the-team-date', async () => {
  for (const m of [...DAY_MOMENTS, ...NEW_YEAR_MOMENTS]) {
    const { iso, say } = at(m);
    const yesterday = addDays(m.today, -1);
    expect(isWeekday(m.today) && isWeekday(yesterday), `${say} setup: today and yesterday are weekdays`).toBe(true);
    const team = await startTeam({ zone: m.zone, now: iso });
    const { actor } = await addMember(team);

    const y = await trySend(actor, { kind: 'vacation', firstDay: yesterday, lastDay: yesterday });
    expect.soft(isRefusal(y), `${say}: a vacation for team-yesterday ${yesterday} is refused (answered ${y.status})`).toBe(true);
    const t = await trySend(actor, { kind: 'vacation', firstDay: m.today, lastDay: m.today });
    expect.soft(isAccepted(t), `${say}: a vacation for team-today ${m.today} is accepted (answered ${t.status} ${t.text.slice(0, 160)})`).toBe(true);

    if (NEW_YEAR_MOMENTS.includes(m)) {
      const year = yearOf(m.today);
      const lastOfNext = lastWeekdayOfYear(year + 1);
      const firstBeyond = firstWeekdayOfYear(year + 2);
      const n = await trySend(actor, { kind: 'vacation', firstDay: lastOfNext, lastDay: lastOfNext });
      expect.soft(isAccepted(n), `${say}: a vacation on ${lastOfNext}, in the team's next year, is accepted (answered ${n.status})`).toBe(true);
      const b = await trySend(actor, { kind: 'vacation', firstDay: firstBeyond, lastDay: firstBeyond });
      expect.soft(isRefusal(b), `${say}: a vacation on ${firstBeyond}, after the team's next year, is refused (answered ${b.status})`).toBe(true);
    }
    await disposeAll();
  }
});

test('ROW-133.REQ-007.days-left-years-are-the-team-years', async () => {
  for (const m of [...NEW_YEAR_MOMENTS, ...DAY_MOMENTS]) {
    const { iso, say } = at(m);
    const team = await startTeam({ zone: m.zone, now: iso });
    const { actor } = await addMember(team, { allowance: 21 });
    const year = yearOf(m.today);
    const shown = await yearFigures(actor, year);
    const next = await yearFigures(actor, year + 1);
    expect.soft(shown?.daysLeft, `${say}: days left are shown for the team year ${year}`).toBe(21);
    expect.soft(next?.daysLeft, `${say}: days left are shown for the team's next year ${year + 1}`).toBe(21);
    expect.soft(await yearFigures(actor, year - 1), `${say}: no figure for ${year - 1}, the year before the team year`).toBeUndefined();
    expect.soft(await yearFigures(actor, year + 2), `${say}: no figure for ${year + 2}`).toBeUndefined();
    await disposeAll();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-133 — the days-left years on the own page itself (added, slice 1, test-author-9; lesson L-1)
// ROW-133 promise: as above, for "the days-left years" — REQ-007 / A-027 (the person sees the current and the next
// ROW-133   year's days left), REQ-004 fail-if (6) (the current and the next year read from the team-zone date), D-007
// ROW-133   ("today is computed on the server, never in the browser") — on the page the person sees: / draws days left
// ROW-133   for the team year and for the team's next year.
// ROW-133 wrong product: GET /api/balance right, but / picks or labels its years from the browser's clock or a UTC
// ROW-133   date: at Auckland's 1 January 2027 00:30 (UTC still 2026) it draws 2026 and 2027, at Los Angeles' 31 December
// ROW-133   2026 23:30 (UTC already 2027) it draws 2027 and 2028 — the data case stays green.
// ROW-133 given: a fresh team in the moment's zone with the clock at the moment, a member with allowance 21. when: the
// ROW-133   member's browser, its own zone UTC, opens /. then: / draws figures for the team year and for the team's next
// ROW-133   year, each with 21 days left.
// ROW-133 controls: ROW-133.control.page-draws-the-team-years-at-midday — at Auckland 13:30 on 17 February 2027, where
// ROW-133   the team and UTC dates agree, / draws 2027 and 2028 with 21: the page and the reading work, and a UTC-reading
// ROW-133   page passes it too.
// ROW-133 technique: the clock's origin — the New Year moments in both offset directions, the browser's zone at UTC so
// ROW-133   a page that works the year out in the browser is caught as well as a server reading UTC; the day moments as
// ROW-133   same-year checks. Each figure a number of its own in that year's drawn figures (own-page.ts saysNumber, the
// ROW-133   years taken out). That no third year is drawn stays the data case's: a year's label may stand elsewhere on a
// ROW-133   page, so this reading proves presence only.
// ROW-133 cases: ROW-133 target=ROW-133.REQ-007.page-draws-days-left-for-the-team-years control=ROW-133.control.page-draws-the-team-years-at-midday

/** / opened as `actor` in a browser whose own zone is UTC; each of the two years' drawn figures (null when not drawn), read after a bounded wait. */
async function drawnFigures(browser: Browser, actor: Actor, years: [number, number], timeoutMs = 10_000): Promise<{ status: number; years: Record<number, string | null>; body: string }> {
  const opened = await openPageIn(browser, actor, { timezoneId: 'UTC' });
  try {
    const response = await opened.page.goto(PAGES.home);
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const [a, b] = years;
    let last: Record<number, string | null> = { [a]: null, [b]: null };
    await expect
      .poll(async () => {
        last = { [a]: await drawnYearFigures(opened.page, a, b), [b]: await drawnYearFigures(opened.page, b, a) };
        return last[a] !== null && last[b] !== null;
      }, { timeout: timeoutMs })
      .toBe(true)
      .catch(() => undefined);
    const body = (await opened.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { status: response?.status() ?? 0, years: last, body };
  } finally {
    await opened.close();
  }
}

/** True when the drawn figures for `year` carry `n` as a number of its own (the years around it left out). */
function drawsNumber(years: Record<number, string | null>, year: number, n: number): boolean {
  return saysNumber(years[year] ?? '', n, [], [year - 1, year, year + 1, year + 2].map(String));
}

test('ROW-133.control.page-draws-the-team-years-at-midday', async ({ browser }) => {
  const m: Moment = { label: 'auckland-summer-13:30', zone: AUCKLAND, today: '2027-02-17', time: '13:30' };
  const { iso, say } = at(m);
  expect(utcDateOf(iso), 'ROW-133 control setup: the team and UTC dates agree').toBe(m.today);
  const team = await startTeam({ zone: m.zone, now: iso });
  const { actor } = await addMember(team, { allowance: 21 });
  const f = await drawnFigures(browser, actor, [2027, 2028]);
  expect.soft(f.status, `${say}: / answers the member`).toBe(200);
  for (const year of [2027, 2028]) {
    expect.soft(drawsNumber(f.years, year, 21), `${say}: / draws ${year}'s days left 21: ${f.years[year] ?? `(none; page: "${f.body.slice(0, 300)}")`}`).toBe(true);
  }
});

test('ROW-133.REQ-007.page-draws-days-left-for-the-team-years', async ({ browser }) => {
  for (const m of [...NEW_YEAR_MOMENTS, ...DAY_MOMENTS]) {
    const { iso, say } = at(m);
    const team = await startTeam({ zone: m.zone, now: iso });
    const { actor } = await addMember(team, { allowance: 21 });
    const year = yearOf(m.today);
    const f = await drawnFigures(browser, actor, [year, year + 1]);
    for (const [y, which] of [
      [year, 'the team year'],
      [year + 1, "the team's next year"],
    ] as const) {
      expect.soft(f.years[y] !== null, `${say}: / draws days left for ${which} ${y}: ${f.years[y] ?? `(none; page: "${f.body.slice(0, 300)}")`}`).toBe(true);
      expect.soft(drawsNumber(f.years, y, 21), `${say}: / draws ${which} ${y}'s days left 21: ${f.years[y] ?? '(none)'}`).toBe(true);
    }
    await disposeAll();
  }
});

test('ROW-133.REQ-010.admin-cancel-starts-at-team-today', async () => {
  for (const m of DAY_MOMENTS) {
    const { say } = at(m);
    const monday = addDays(m.today, -2);
    const friday = addDays(m.today, 2);
    const kept = weekdaysBetween(monday, addDays(m.today, -1));
    const team = await startTeam({ zone: m.zone, now: teamInstant(m.zone, monday, '09:00') });
    const { member, actor } = await addMember(team, { allowance: 25 });
    const id = await sendApproved(team, actor, { kind: 'vacation', firstDay: monday, lastDay: friday });

    await setTeamClock(m.zone, m.today, m.time);
    const c = await tryConfirmed(team.admin, 'cancel', id);
    expect.soft(isAccepted(c), `${say}: the admin cancels the approved ${monday}..${friday} (answered ${c.status} ${c.text.slice(0, 160)})`).toBe(true);
    expect.soft((await yearFigures(actor, yearOf(m.today)))?.daysLeft, `${say}: exactly ${kept.join(', ')} stay counted`).toBe(25 - kept.length);
    expect
      .soft(await calendarDatesFor(actor, yearOf(m.today), Number(m.today.slice(5, 7)), member.name), `${say}: the calendar keeps exactly the days before team-today`)
      .toEqual(kept);
    await disposeAll();
  }
});

test('ROW-133.REQ-016.switch-off-refusal-reads-team-yesterday', async () => {
  for (const m of DAY_MOMENTS) {
    const { say } = at(m);
    const monday = addDays(m.today, -2);
    const friday = addDays(m.today, 2);
    const team = await startTeam({ zone: m.zone, now: teamInstant(m.zone, monday, '09:00') });
    const { member, actor } = await addMember(team);
    await sendOk(actor, { kind: 'vacation', firstDay: addDays(m.today, -1), lastDay: friday });

    await setTeamClock(m.zone, m.today, m.time);
    const r = await tryConfirmed(team.admin, 'switch-off', member.id);
    expect.soft(isRefusal(r), `${say}: switch-off is refused while a pending request holds team-yesterday (answered ${r.status})`).toBe(true);
    expect.soft(await canSignIn(member.email, member.password), `${say}: the account stays switched on and signs in`).toBe(true);
    expect.soft((await yearFigures(actor, yearOf(m.today)))?.pending, `${say}: the pending request is untouched`).toBe(4);
    await disposeAll();
  }
});

test('ROW-133.REQ-016.switch-off-cut-off-is-team-today', async () => {
  for (const m of DAY_MOMENTS) {
    const { say } = at(m);
    const monday = addDays(m.today, -2);
    const yesterday = addDays(m.today, -1);
    const friday = addDays(m.today, 2);
    const team = await startTeam({ zone: m.zone, now: teamInstant(m.zone, monday, '09:00') });
    const { member, actor } = await addMember(team, { allowance: 25 });
    await sendApproved(team, actor, { kind: 'vacation', firstDay: monday, lastDay: yesterday });
    await sendOk(actor, { kind: 'vacation', firstDay: m.today, lastDay: friday });

    await setTeamClock(m.zone, m.today, m.time);
    const off = await tryConfirmed(team.admin, 'switch-off', member.id);
    expect.soft(isAccepted(off), `${say}: switch-off is allowed when no pending request holds a weekday before team-today (answered ${off.status} ${off.text.slice(0, 160)})`).toBe(true);
    if (!isAccepted(off)) {
      await disposeAll();
      continue;
    }
    const on = await trySwitchOn(team.admin, member.id);
    expect(isAccepted(on), `${say} setup: the account is switched back on to read its balance (answered ${on.status})`).toBe(true);
    const back = await signInAgain(member);
    const fig = await yearFigures(back, yearOf(m.today));
    expect.soft(fig?.daysLeft, `${say}: the approved ${monday}..${yesterday}, all before team-today, stays counted`).toBe(23);
    expect.soft(fig?.pending, `${say}: the pending ${m.today}..${friday} was cancelled`).toBe(0);
    expect
      .soft(await calendarDatesFor(back, yearOf(m.today), Number(m.today.slice(5, 7)), member.name), `${say}: the calendar keeps exactly Monday and Tuesday`)
      .toEqual([monday, yesterday]);
    await disposeAll();
  }
});

test('ROW-133.REQ-011.allowance-change-starts-in-the-team-year', async () => {
  let x = 30;
  for (const m of NEW_YEAR_MOMENTS) {
    const { iso, say } = at(m);
    x += 1;
    const year = yearOf(m.today);
    const team = await startTeam({ zone: m.zone, now: iso });
    const p = await addMember(team, { allowance: 25 });
    const q = await addMember(team, { allowance: 25 });
    const pa = await tryAllowance(team.admin, p.member.id, { allowance: x, startsNextYear: false });
    const qa = await tryAllowance(team.admin, q.member.id, { allowance: x, startsNextYear: true });
    expect.soft(isAccepted(pa) && isAccepted(qa), `${say}: both allowance changes are accepted (answered ${pa.status}, ${qa.status})`).toBe(true);

    expect.soft((await yearFigures(p.actor, year))?.daysLeft, `${say}: a change starting this year sets the team year ${year}`).toBe(x);
    expect.soft((await yearFigures(p.actor, year + 1))?.daysLeft, `${say}: and the year after it`).toBe(x);
    expect.soft((await yearFigures(q.actor, year))?.daysLeft, `${say}: a change starting next year leaves the team year ${year} unchanged`).toBe(25);
    expect.soft((await yearFigures(q.actor, year + 1))?.daysLeft, `${say}: a change starting next year sets ${year + 1}`).toBe(x);
    await disposeAll();
  }
});

test('ROW-133.REQ-021.cancel-action-shown-by-team-today', async ({ browser }) => {
  for (const m of DAY_MOMENTS) {
    const { say } = at(m);
    const monday = addDays(m.today, -2);
    const yesterday = addDays(m.today, -1);
    const team = await startTeam({ zone: m.zone, now: teamInstant(m.zone, monday, '09:00') });
    const p = await addMember(team);
    const q = await addMember(team);
    await sendApproved(team, p.actor, { kind: 'vacation', firstDay: monday, lastDay: yesterday });
    await sendApproved(team, q.actor, { kind: 'vacation', firstDay: m.today, lastDay: m.today });

    await setTeamClock(m.zone, m.today, m.time);
    const opened = await openPageIn(browser, team.admin, { timezoneId: 'UTC' });
    const cancelControls = async () =>
      (await opened.page.getByRole('button', { name: /cancel/i }).count()) + (await opened.page.getByRole('link', { name: /cancel/i }).count());

    const pText = await pageTextWhen(opened, PAGES.adminPerson(p.member.id), [shownDate(monday)]);
    expect(shownDate(monday).test(pText), `${say}: the person page lists ${p.member.name}'s request of ${monday}..${yesterday}`).toBe(true);
    expect.soft(await cancelControls(), `${say}: no cancel action on the request that ended team-yesterday`).toBe(0);

    const qText = await pageTextWhen(opened, PAGES.adminPerson(q.member.id), [shownDate(m.today)]);
    expect(shownDate(m.today).test(qText), `${say}: the person page lists ${q.member.name}'s request of ${m.today}`).toBe(true);
    expect.soft(await cancelControls(), `${say}: one cancel action on the request for team-today`).toBe(1);
    await disposeAll();
  }
});
