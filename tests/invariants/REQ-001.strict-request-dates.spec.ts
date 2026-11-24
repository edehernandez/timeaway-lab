// Purpose: ledger tests for ROW-131 and ROW-132 (REQ-001, REQ-004, REQ-017) — an impossible date is refused and never rolled over, a real leap day is accepted and shown, and only the one exact YYYY-MM-DD form is accepted from a client.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): the date rules are proved at the HTTP harness on POST /api/requests (D-029: days YYYY-MM-DD, D-007);
// "shown" for the leap day is paint, read in the browser on the person's own requests page (D-029 "/"), opened in a
// browser zone far west of the team's so a page that turns the day into an instant and back shows the day before.
// The clock: Monday 11 January 2027, 15:00 in Pacific/Auckland; every day posted here is after it.
import { test, expect } from '@playwright/test';
import { PAGES } from './harness';
import {
  addMember,
  AUCKLAND,
  dayLeaves,
  disposeAll,
  idOf,
  isAccepted,
  isRefusal,
  isWeekday,
  LOS_ANGELES,
  openPageIn,
  ownRecords,
  pageTextWhen,
  shownDate,
  startTeam,
  teamInstant,
  trySend,
  yearFigures,
  type Answer,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NOW = teamInstant(AUCKLAND, '2027-01-11', '15:00');

/** The plain message of a refusal: its JSON message/statusMessage/error string, else its text. */
function messageOf(a: Answer): string {
  const j = a.json as Record<string, unknown> | undefined;
  for (const k of ['message', 'statusMessage', 'error']) if (j && typeof j[k] === 'string') return j[k] as string;
  return a.text;
}

function isPlain(a: Answer): boolean {
  const msg = messageOf(a).trim();
  return /[A-Za-z]{3}/.test(msg) && msg.length <= 400 && !/\n\s+at\s/.test(a.text) && !/internal server error|stack|exception/i.test(msg);
}

// ---------------------------------------------------------------------------------------------------
// ROW-131 promise: REQ-001 (a request has a first and a last day) and REQ-004, with D-007 (days are calendar dates
// ROW-131   YYYY-MM-DD): an impossible date (30 February, a 31st in a 30-day month, month 13) is refused, never rolled
// ROW-131   over to another day; a real leap day such as 29 February 2028 is accepted and shown.
// ROW-131 wrong product: one that parses the day with a lenient date constructor (new Date(y, m-1, d), a library in
// ROW-131   lenient mode), so 2027-02-30 is stored as Tue 2 March, 2027-06-31 as Thu 1 July, 2027-13-03 as Mon 3 January
// ROW-131   2028 — each rolled day a weekday, so no other rule refuses it; or one whose own validity check wrongly
// ROW-131   rejects 29 February in a leap year.
// ROW-131 given: a member, clock 11 January 2027. when: vacations are posted for 2027-02-30, 2027-02-29 (not a leap
// ROW-131   year), 2027-06-31, 2027-09-31, 2027-13-03 and the range 2027-02-26..2027-02-30. then: each is refused with no
// ROW-131   id; afterwards the member has no request and no pending day in 2027 or 2028, and the rolled-over day 2 March
// ROW-131   is still free (a vacation for it is accepted).
// ROW-131   Leap day: a vacation for 2028-02-29 is accepted, stored with that day only, counted as 1 pending day of 2028,
// ROW-131   and its page shows 29 February 2028 and neither 28 February 2028 nor 1 March 2028.
// ROW-131 controls: the control case posts a real date (2027-03-02) the same way and it is accepted — the route and
// ROW-131   session work and the refusals are about the dates.
// ROW-131 technique: values just either side of the month's end (the last real day accepted, the first impossible
// ROW-131   one refused), with each impossible day chosen so its roll-over lands on a weekday; decoys for the leap day's
// ROW-131   neighbours on the page.
// ROW-131 cases: ROW-131 target=ROW-131.REQ-004.an-impossible-date-is-refused-never-rolled-over control=ROW-131.control.a-real-date-is-accepted
test('ROW-131.control.a-real-date-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2027-03-02', lastDay: '2027-03-02' });
  expect(isAccepted(a), `ROW-131 control: 2027-03-02 is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
});

test('ROW-131.REQ-004.an-impossible-date-is-refused-never-rolled-over', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const impossible: [string, string, string][] = [
    ['30 February', '2027-02-30', '2027-02-30'],
    ['29 February in 2027, not a leap year', '2027-02-29', '2027-02-29'],
    ['31 June', '2027-06-31', '2027-06-31'],
    ['31 September', '2027-09-31', '2027-09-31'],
    ['month 13', '2027-13-03', '2027-13-03'],
    ['a range ending 30 February', '2027-02-26', '2027-02-30'],
  ];
  for (const [label, firstDay, lastDay] of impossible) {
    const a = await trySend(actor, { kind: 'vacation', firstDay, lastDay });
    expect.soft(isRefusal(a), `ROW-131 ${label}: refused (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    expect.soft(idOf(a), `ROW-131 ${label}: no id is answered`).toBeUndefined();
  }
  expect.soft((await ownRecords(actor)).length, 'ROW-131: nothing was stored').toBe(0);
  expect.soft((await yearFigures(actor, 2027))?.pending, 'ROW-131: no pending day in 2027').toBe(0);
  expect.soft((await yearFigures(actor, 2028))?.pending, 'ROW-131: no pending day in 2028').toBe(0);
  const free = await trySend(actor, { kind: 'vacation', firstDay: '2027-03-02', lastDay: '2027-03-02' });
  expect.soft(isAccepted(free), `ROW-131: 2 March, where 30 February would roll over, is still free (answered ${free.status})`).toBe(true);
});

test('ROW-131.REQ-004.a-real-leap-day-is-accepted-and-shown', async ({ browser }) => {
  expect(isWeekday('2028-02-29'), 'ROW-131 setup: 29 February 2028 is a Tuesday').toBe(true);
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2028-02-29', lastDay: '2028-02-29' });
  expect(isAccepted(a), `ROW-131: 29 February 2028 is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  const rec = (await ownRecords(actor)).find((r) => String(r.id) === String(idOf(a)));
  expect.soft([...new Set(dayLeaves(rec))], 'ROW-131: stored as 2028-02-29 and no other day').toEqual(['2028-02-29']);
  expect.soft((await yearFigures(actor, 2028))?.pending, 'ROW-131: counted as one pending day of 2028').toBe(1);

  const opened = await openPageIn(browser, actor, { timezoneId: LOS_ANGELES });
  const text = await pageTextWhen(opened, PAGES.home, [shownDate('2028-02-29')]);
  expect.soft(shownDate('2028-02-29').test(text), 'ROW-131: the own requests page shows 29 February 2028').toBe(true);
  expect.soft(shownDate('2028-02-28').test(text), 'ROW-131: the page does not show 28 February 2028').toBe(false);
  expect.soft(shownDate('2028-03-01').test(text), 'ROW-131: the page does not show 1 March 2028').toBe(false);
});

// ---------------------------------------------------------------------------------------------------
// ROW-132 promise: REQ-001 and REQ-017 with D-007 and D-029 ("days YYYY-MM-DD; 201 {id} or a refusal with a plain
// ROW-132   message"): only that one exact form is accepted from a client; an ambiguous or loosely formatted date is
// ROW-132   refused with a plain message, never read by locale.
// ROW-132 wrong product: one that hands the client's string to a lenient parser (Date.parse, a locale-aware library)
// ROW-132   so 05/04/2027 becomes 4 May (en-US) or 5 April (en-GB) — both weekdays, so nothing else refuses it — and
// ROW-132   2027-5-4 becomes 4 May; or one that answers a server error (500, a stack trace) instead of a plain refusal.
// ROW-132 given: a member, clock 11 January 2027. when: vacations are posted with each loose form as first and last
// ROW-132   day — 05/04/2027 and 04/05/2027 (under en-US and en-GB Accept-Language), 2027-5-4, 2027-05-4, 2027-5-04,
// ROW-132   2027/05/04, 04.05.2027, 4 May 2027, May 4, 2027, 20270504, 2027-05-04T00:00:00Z, the exact form with a space
// ROW-132   before or after, and the epoch number of 4 May. then: each is refused (4xx, not 500) with a plain message
// ROW-132   and no id; afterwards nothing is stored and 2027 shows no pending day.
// ROW-132 controls: the control case posts exactly 2027-05-04 and it is accepted.
// ROW-132 technique: near misses of the one accepted form, one per loosening, with the ambiguous pair chosen so both
// ROW-132   readings are weekdays (Tue 4 May, Mon 5 April 2027).
// ROW-132 cases: ROW-132 target=ROW-132.REQ-001.a-loose-or-ambiguous-date-is-refused-plainly control=ROW-132.control.the-exact-form-is-accepted
test('ROW-132.control.the-exact-form-is-accepted', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2027-05-04', lastDay: '2027-05-04' });
  expect(isAccepted(a), `ROW-132 control: 2027-05-04 is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect(idOf(a), 'ROW-132 control: an id is answered').toBeDefined();
});

test('ROW-132.REQ-001.a-loose-or-ambiguous-date-is-refused-plainly', async () => {
  expect(isWeekday('2027-05-04') && isWeekday('2027-04-05'), 'ROW-132 setup: both readings of 05/04/2027 are weekdays').toBe(true);
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { actor } = await addMember(team);
  const loose: [string, unknown, Record<string, string>][] = [
    ['05/04/2027 under en-US', '05/04/2027', { 'Accept-Language': 'en-US' }],
    ['05/04/2027 under en-GB', '05/04/2027', { 'Accept-Language': 'en-GB' }],
    ['04/05/2027 under en-GB', '04/05/2027', { 'Accept-Language': 'en-GB' }],
    ['2027-5-4', '2027-5-4', {}],
    ['2027-05-4', '2027-05-4', {}],
    ['2027-5-04', '2027-5-04', {}],
    ['2027/05/04', '2027/05/04', {}],
    ['04.05.2027', '04.05.2027', { 'Accept-Language': 'de-DE' }],
    ['4 May 2027', '4 May 2027', {}],
    ['May 4, 2027', 'May 4, 2027', {}],
    ['20270504', '20270504', {}],
    ['an ISO instant', '2027-05-04T00:00:00Z', {}],
    ['a leading space', ' 2027-05-04', {}],
    ['a trailing space', '2027-05-04 ', {}],
    ['an epoch number', Date.UTC(2027, 4, 4), {}],
  ];
  for (const [label, value, headers] of loose) {
    const a = await trySend(actor, { kind: 'vacation', firstDay: value, lastDay: value }, { headers });
    expect.soft(isRefusal(a), `ROW-132 ${label}: refused with a 4xx (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    expect.soft(isPlain(a), `ROW-132 ${label}: the refusal is a plain message (got ${JSON.stringify(messageOf(a).slice(0, 160))})`).toBe(true);
    expect.soft(idOf(a), `ROW-132 ${label}: no id is answered`).toBeUndefined();
  }
  expect.soft((await ownRecords(actor)).length, 'ROW-132: nothing was stored').toBe(0);
  expect.soft((await yearFigures(actor, 2027))?.pending, 'ROW-132: no pending day in 2027').toBe(0);
});
