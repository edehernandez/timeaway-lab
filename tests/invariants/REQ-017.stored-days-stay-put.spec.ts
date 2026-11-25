// Purpose: ledger tests for ROW-137 (REQ-017, REQ-012) — stored request days, cancel days and the calendar do not change when time passes across midnight, a month end, New Year or a daylight-saving change.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; instants worked out by the tests' own Intl oracle.
//
// Boundary (R6): the stored records and the calendar, read at the HTTP harness (GET /api/requests, GET /api/calendar).
// Not here: the row's other half — the same holding when the server PROCESS's time zone changes — needs a harness
// control that restarts the product under another TZ, which this harness lacks; that half is returned unwritable
// (missing prerequisite) by this pass, and these cases do not stand in for it.
import { test, expect } from '@playwright/test';
import { adminCancel, approve, type AccountId, type Actor, type Member } from './harness';
import {
  addMember,
  AUCKLAND,
  calendarDatesFor,
  dayLeaves,
  disposeAll,
  ownRecords,
  sendOk,
  setTeamClock,
  signInAgain,
  startTeam,
  stateOf,
  teamInstant,
} from './team-calendar';
import { restartProduct } from './doors-process';
import { LOS_ANGELES } from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const MONTHS: [number, number][] = [
  [2027, 2],
  [2027, 3],
  [2027, 4],
  [2027, 9],
  [2027, 12],
];

interface Snapshot {
  records: Record<string, { state: string | undefined; days: string[] }>;
  calendar: Record<string, string[]>;
}

async function snapshot(actor: Actor, member: Member): Promise<Snapshot> {
  const records: Snapshot['records'] = {};
  for (const r of await ownRecords(actor)) records[String(r.id)] = { state: stateOf(r), days: dayLeaves(r).sort() };
  const calendar: Snapshot['calendar'] = {};
  for (const [y, m] of MONTHS) calendar[`${y}-${m}`] = await calendarDatesFor(actor, y, m, member.name);
  return { records, calendar };
}

interface Setup {
  member: Member;
  actor: Actor;
  ids: { cut: AccountId; newYear: AccountId; sick: AccountId; pending: AccountId };
}

/** A team in Auckland: four requests of one member, one of them partly cancelled on Wed 31 March 2027. */
async function setUp(): Promise<Setup> {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-01', '15:00') });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const cut = await sendOk(actor, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-04-09' });
  const newYear = await sendOk(actor, { kind: 'vacation', firstDay: '2027-12-30', lastDay: '2027-12-31' });
  const sick = await sendOk(actor, { kind: 'sick', firstDay: '2027-02-01', lastDay: '2027-02-03' });
  const pending = await sendOk(actor, { kind: 'vacation', firstDay: '2027-09-27', lastDay: '2027-09-28' });
  for (const id of [cut, newYear, sick]) await approve(team.admin, id);
  await setTeamClock(AUCKLAND, '2027-03-31', '10:00');
  await adminCancel(team.admin, cut);
  await setTeamClock(AUCKLAND, '2027-03-31', '23:30');
  return { member, actor, ids: { cut, newYear, sick, pending } };
}

// ---------------------------------------------------------------------------------------------------
// ROW-137 promise: REQ-017 (a request holds its first and last day as sent and the weekday its cancel takes effect
// ROW-137   from) and REQ-012 (the calendar lists the approved days), with D-007 (days are calendar dates): stored
// ROW-137   request days, cancel days and the calendar do not change when time passes across midnight, a month end, New
// ROW-137   Year or a daylight-saving change.
// ROW-137 wrong product: one that keeps days as instants (team midnight turned to UTC with the offset of the moment it
// ROW-137   was written) and reads them back with the offset in force now — after Auckland leaves summer time every day
// ROW-137   moves to the day before; or one whose calendar or "days in effect" is recomputed from today, so a partly
// ROW-137   cancelled request's days shift or vanish when the month or the year turns; or one that ages a pending
// ROW-137   request into another state.
// ROW-137 given: in Auckland, a member's approved vacation 29 March..9 April 2027 cancelled by the admin on Wed 31
// ROW-137   March (in effect 29 and 30 March, cancel day 31 March), an approved 30..31 December, an approved past sick
// ROW-137   1..3 February and a pending 27..28 September. when: the clock is moved past midnight into 1 April (a month
// ROW-137   end too), past the end of summer time on 4 April, past its start on 26 September, to New Year's Eve and past
// ROW-137   New Year into 2028. then: at every stop each record's day values and state and the calendar of February,
// ROW-137   March, April, September and December 2027 equal the snapshot taken on 31 March at 23:30.
// ROW-137 controls: the control case shows the snapshot is right to begin with: the partly cancelled record carries
// ROW-137   29 March, 9 April and its cancel day 31 March; March lists exactly 29 and 30 March, April nothing, February
// ROW-137   1..3, December 30..31, September nothing (pending); two reads with no clock move agree.
// ROW-137 technique: before and after — one snapshot, then the clock's origin moved across each boundary in turn,
// ROW-137   the whole snapshot compared at each stop (every record, every listed month, never a part).
// ROW-137 cases: ROW-137 target=ROW-137.REQ-017.stored-days-and-calendar-survive-time-passing control=ROW-137.control.the-snapshot-is-right-to-begin-with
test('ROW-137.control.the-snapshot-is-right-to-begin-with', async () => {
  const { member, actor, ids } = await setUp();
  const s = await snapshot(actor, member);
  expect(s.records[String(ids.cut)]?.days, 'ROW-137 control: the partly cancelled record keeps its days as sent and its cancel day').toEqual(
    expect.arrayContaining(['2027-03-29', '2027-04-09', '2027-03-31']),
  );
  expect(s.records[String(ids.cut)]?.state, 'ROW-137 control: it stays approved (REQ-019)').toBe('approved');
  expect(s.records[String(ids.pending)]?.state, 'ROW-137 control: the September request is pending').toBe('pending');
  expect(s.calendar['2027-3'], 'ROW-137 control: March lists exactly 29 and 30 March').toEqual(['2027-03-29', '2027-03-30']);
  expect(s.calendar['2027-4'], 'ROW-137 control: April lists nothing').toEqual([]);
  expect(s.calendar['2027-2'], 'ROW-137 control: February lists the sick days').toEqual(['2027-02-01', '2027-02-02', '2027-02-03']);
  expect(s.calendar['2027-9'], 'ROW-137 control: September lists nothing pending').toEqual([]);
  expect(s.calendar['2027-12'], 'ROW-137 control: December lists 30 and 31 December').toEqual(['2027-12-30', '2027-12-31']);
  expect(await snapshot(actor, member), 'ROW-137 control: a second read agrees').toEqual(s);
});

test('ROW-137.REQ-017.stored-days-and-calendar-survive-time-passing', async () => {
  const { member, actor } = await setUp();
  const before = await snapshot(actor, member);
  expect(Object.keys(before.records).length, 'ROW-137 before: four records').toBe(4);
  const stops: [string, string, string][] = [
    ['past midnight and the month end', '2027-04-01', '00:30'],
    ['past the end of summer time', '2027-04-04', '03:30'],
    ['past the start of summer time', '2027-09-26', '04:00'],
    ["on New Year's Eve", '2027-12-31', '23:30'],
    ['past New Year', '2028-01-01', '00:30'],
  ];
  for (const [label, day, time] of stops) {
    await setTeamClock(AUCKLAND, day, time);
    const again = await signInAgain(member);
    expect.soft(await snapshot(again, member), `ROW-137 ${label} (${day} ${time} Auckland): records and calendar are unchanged`).toEqual(before);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-137, the process time zone half (added by test-author pass, slice 1, batch test-author-16, through the D-048
// ROW-137   restart door in doors-process.ts; the header's "returned unwritable" note above predates this door).
// ROW-137 promise: as above — REQ-017 (a request holds its first and last day as sent and the day its cancel takes
// ROW-137   effect from), REQ-012 (the calendar lists the approved days), D-007 (days are calendar dates in the team's
// ROW-137   zone): stored request days, cancel days and the calendar do not change when the server PROCESS time zone
// ROW-137   changes.
// ROW-137 wrong product: one that turns a YYYY-MM-DD day into a Date and back with the process's local zone — parsed
// ROW-137   as UTC midnight and printed in local time (every day one earlier under Los Angeles), or built at local
// ROW-137   midnight and printed as UTC (every day one earlier under Kiritimati, UTC+14) — on the read path, the
// ROW-137   calendar's path or the write path of a new request.
// ROW-137 given: the four requests of setUp (a partly cancelled one with cancel day 31 March 2027), read under the
// ROW-137   image's own process zone. when: the server is restarted under America/Los_Angeles, a new vacation 3..5 May
// ROW-137   is sent there; restarted under Pacific/Kiritimati, a new vacation 7..8 June is sent there; restarted under
// ROW-137   the image's own zone again. then: after each restart the four records (days, cancel day, state) and the
// ROW-137   calendar of February, March, April, September and December equal the first read; each new request carries
// ROW-137   exactly its first and last day as sent, under every zone it is read in, and never the day before or after.
// ROW-137 controls: ROW-137.control.the-snapshot-is-right-to-begin-with shows the first read is right; the restart
// ROW-137   door's wait saw the server end and come back each time (so each read is a start under that zone).
// ROW-137 technique: the same snapshot compared across process zones either side of UTC (west and the far east), the
// ROW-137   write path exercised under each, the team clock put back to the same instant after each restart.
// ROW-137 cases: ROW-137 target=ROW-137.REQ-017.stored-days-and-calendar-survive-a-process-time-zone-change control=ROW-137.control.the-snapshot-is-right-to-begin-with
test('ROW-137.REQ-017.stored-days-and-calendar-survive-a-process-time-zone-change', async () => {
  const { member, actor } = await setUp();
  const before = await snapshot(actor, member);
  expect(Object.keys(before.records).length, 'ROW-137 before: four records').toBe(4);
  const sent: { id: string; first: string; last: string }[] = [];
  const shifted = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  const check = async (label: string) => {
    const again = await signInAgain(member);
    const now = await snapshot(again, member);
    const fourNow = Object.fromEntries(Object.entries(now.records).filter(([id]) => !sent.some((w) => w.id === id)));
    expect.soft(fourNow, `ROW-137 ${label}: the four records keep their days, cancel day and state`).toEqual(before.records);
    expect.soft(now.calendar, `ROW-137 ${label}: the calendar is unchanged`).toEqual(before.calendar);
    for (const w of sent) {
      const days = now.records[w.id]?.days ?? [];
      expect.soft(days, `ROW-137 ${label}: the request sent for ${w.first}..${w.last} carries its days as sent`).toEqual(
        expect.arrayContaining([w.first, w.last]),
      );
      expect.soft(days, `ROW-137 ${label}: and not the day before ${w.first}`).not.toContain(shifted(w.first, -1));
      expect.soft(days, `ROW-137 ${label}: and not the day after ${w.last}`).not.toContain(shifted(w.last, 1));
    }
    return again;
  };

  try {
    await restartProduct({ timeZone: LOS_ANGELES });
    await setTeamClock(AUCKLAND, '2027-03-31', '23:30');
    const la = await check('under America/Los_Angeles');
    sent.push({ id: String(await sendOk(la, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-05' })), first: '2027-05-03', last: '2027-05-05' });
    await check('under America/Los_Angeles, after a send there');

    await restartProduct({ timeZone: 'Pacific/Kiritimati' });
    await setTeamClock(AUCKLAND, '2027-03-31', '23:30');
    const kiri = await check('under Pacific/Kiritimati');
    sent.push({ id: String(await sendOk(kiri, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' })), first: '2027-06-07', last: '2027-06-08' });
    await check('under Pacific/Kiritimati, after a send there');
  } finally {
    await restartProduct();
  }
  await setTeamClock(AUCKLAND, '2027-03-31', '23:30');
  await check('back under the image\'s own zone');
});
