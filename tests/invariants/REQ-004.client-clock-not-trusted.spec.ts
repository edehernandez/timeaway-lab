// Purpose: ledger tests for ROW-134 and ROW-135 (REQ-004) — a today, time zone or minimum date sent by the client is never trusted, and its control: a vacation for today sent with no client clock value is accepted.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; the instant worked out by the tests' own Intl oracle.
//
// Boundary (R6): the send rule, proved at the HTTP harness on POST /api/requests. A request posted straight to the
// route has no date picker at all, so "no date-picker minimum" holds by construction; the forged values ride in the
// body, the query and the headers, each attempt on its own.
//
// The moment: Wednesday 16 June 2027 at 23:30 in America/Los_Angeles, when the container's UTC date is already
// Thursday 17 June. Team-yesterday (Tuesday 15 June) is before both the team date and the UTC date, so only a product
// that believes the client's clock admits it; team-today (Wednesday 16 June) is before the UTC date, so a product
// reading the server's own date refuses it.
import { test, expect } from '@playwright/test';
import {
  addMember,
  disposeAll,
  idOf,
  isAccepted,
  isRefusal,
  LOS_ANGELES,
  ownRecords,
  dayLeaves,
  startTeam,
  teamDateOf,
  teamInstant,
  trySend,
  utcDateOf,
  yearFigures,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const ZONE = LOS_ANGELES;
const TODAY = '2027-06-16';
const YESTERDAY = '2027-06-15';
const NOW = teamInstant(ZONE, TODAY, '23:30');
const FORGED_NOW = '2027-06-15T16:00:00.000Z'; // Tuesday 15 June 09:00 in Los Angeles

function checkMoment(): void {
  expect(teamDateOf(ZONE, NOW), 'setup: the moment is Wednesday 16 June in the team zone').toBe(TODAY);
  expect(utcDateOf(NOW), 'setup: the UTC date is already Thursday 17 June').toBe('2027-06-17');
}

// ---------------------------------------------------------------------------------------------------
// ROW-134 promise: REQ-004 fail-if (1) "a vacation request that includes a day before today is accepted" and (6)
// ROW-134   today read from the team-zone date at the moment of sending; D-007 "today is computed on the server, never
// ROW-134   in the browser": a today, a time zone or a minimum date sent by the client is never trusted.
// ROW-134 wrong product: a send route that takes `today`, `now`, `timeZone`, an offset or a `min` from the body, the
// ROW-134   query or a header (Date, X-Time-Zone) when present and falls back to the server's clock otherwise; or one
// ROW-134   that relies on the date picker's `min` attribute and checks nothing on the server.
// ROW-134 given: a member of a team in Los Angeles at Wed 16 June 23:30 team time. when: a vacation for Tue 15 June is
// ROW-134   posted, each time with one forged clock: today/now/min fields in the body, a forged zone and offset in the
// ROW-134   body, the same as query values, the same as headers. then: every attempt is refused with a plain message,
// ROW-134   and afterwards the member's requests list holds no request and 2027 shows no pending day.
// ROW-134 controls: ROW-135's case: the same member and moment, today sent with no client value, is accepted — the
// ROW-134   session and route work, and the refusal here is the rule's.
// ROW-134 technique: the harmful case reached directly (the forged values on every channel a client controls), at an
// ROW-134   instant where the server's own date would also refuse, so only trust in the client can admit the day.
// ROW-134 cases: ROW-134 target=ROW-134.REQ-004.a-forged-client-clock-does-not-admit-yesterday control=ROW-135.REQ-004.today-with-no-client-clock-is-accepted
test('ROW-134.REQ-004.a-forged-client-clock-does-not-admit-yesterday', async () => {
  checkMoment();
  const team = await startTeam({ zone: ZONE, now: NOW });
  const { actor } = await addMember(team);
  const day = { kind: 'vacation', firstDay: YESTERDAY, lastDay: YESTERDAY };
  const attempts: [string, Parameters<typeof trySend>[1], Parameters<typeof trySend>[2]][] = [
    ['today, now and min in the body', { ...day, today: YESTERDAY, now: FORGED_NOW, min: YESTERDAY, minDate: YESTERDAY, clientToday: YESTERDAY }, {}],
    ['a forged zone and offset in the body', { ...day, timeZone: 'Pacific/Pago_Pago', timezone: 'Pacific/Pago_Pago', tz: 'Pacific/Pago_Pago', utcOffset: -660, offset: -660, now: FORGED_NOW }, {}],
    ['forged query values', day, { params: { today: YESTERDAY, now: FORGED_NOW, tz: 'Pacific/Pago_Pago', timeZone: 'Pacific/Pago_Pago', min: YESTERDAY } }],
    [
      'forged headers',
      day,
      { headers: { Date: 'Tue, 15 Jun 2027 16:00:00 GMT', 'X-Time-Zone': 'Pacific/Pago_Pago', 'X-Timezone': 'Pacific/Pago_Pago', 'X-Client-Today': YESTERDAY, 'X-Now': FORGED_NOW } },
    ],
  ];
  for (const [label, body, opts] of attempts) {
    const a = await trySend(actor, body, opts);
    expect.soft(isRefusal(a), `ROW-134 ${label}: the vacation for ${YESTERDAY} is refused (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    expect.soft(idOf(a), `ROW-134 ${label}: no request id is answered`).toBeUndefined();
  }
  const records = await ownRecords(actor);
  expect.soft(records.length, 'ROW-134: nothing was stored — the member has no request').toBe(0);
  expect.soft(records.flatMap(dayLeaves), `ROW-134: no stored day is ${YESTERDAY}`).not.toContain(YESTERDAY);
  expect.soft((await yearFigures(actor, 2027))?.pending, 'ROW-134: 2027 shows no pending day').toBe(0);
});

// ---------------------------------------------------------------------------------------------------
// ROW-135 promise: control of ROW-134 — REQ-004 fail-if (6) and D-007: a vacation for today sent without any client
// ROW-135   clock value is accepted, today being the team-zone date worked out on the server.
// ROW-135 wrong product: one that refuses unless the client sends its today (reading only the client), or reads the
// ROW-135   server process's UTC date (already Thursday at this moment) and so refuses Wednesday.
// ROW-135 given: a member of a team in Los Angeles at Wed 16 June 23:30 team time (UTC Thursday). when: a vacation for
// ROW-135   Wed 16 June is posted with exactly {kind, firstDay, lastDay}. then: it is accepted with an id, the member's
// ROW-135   list holds that request with 16 June as its first and last day, and 2027 shows one pending day.
// ROW-135 controls: the control case posts a vacation for Fri 18 June the same way: accepted by a right product and
// ROW-135   by a UTC-reading one alike (it is after both dates), so the session and the route are shown working.
// ROW-135 technique: the clock's origin — the instant just before the team's midnight in the west, where the team
// ROW-135   date and the server's UTC date differ.
// ROW-135 cases: ROW-135 target=ROW-135.REQ-004.today-with-no-client-clock-is-accepted control=ROW-135.control.a-later-weekday-is-accepted
test('ROW-135.control.a-later-weekday-is-accepted', async () => {
  checkMoment();
  const team = await startTeam({ zone: ZONE, now: NOW });
  const { actor } = await addMember(team);
  const a = await trySend(actor, { kind: 'vacation', firstDay: '2027-06-18', lastDay: '2027-06-18' });
  expect(isAccepted(a), `ROW-135 control: a vacation for Fri 18 June is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect(idOf(a), 'ROW-135 control: an id is answered').toBeDefined();
});

test('ROW-135.REQ-004.today-with-no-client-clock-is-accepted', async () => {
  checkMoment();
  const team = await startTeam({ zone: ZONE, now: NOW });
  const { actor } = await addMember(team);
  expect((await ownRecords(actor)).length, 'ROW-135 before: the member has no request').toBe(0);
  const a = await trySend(actor, { kind: 'vacation', firstDay: TODAY, lastDay: TODAY });
  expect(isAccepted(a), `ROW-135: a vacation for team-today ${TODAY} is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  const id = idOf(a);
  expect(id, 'ROW-135: an id is answered').toBeDefined();
  const records = await ownRecords(actor);
  const rec = records.find((r) => String(r.id) === String(id));
  expect(rec, 'ROW-135: the request is in the member\'s list').toBeDefined();
  expect([...new Set(dayLeaves(rec))], 'ROW-135: stored with 16 June as its days, and no other day').toEqual([TODAY]);
  expect((await yearFigures(actor, 2027))?.pending, 'ROW-135: one pending day in 2027').toBe(1);
});
