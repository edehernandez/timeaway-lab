// Purpose: ledger tests for ROW-143 (REQ-010, REQ-016, REQ-019) — "before today" means a counted weekday before today: a cancel whose only past days are a weekend is whole, a pending request whose only past day is a Saturday does not block switch-off, a weekend cancel takes effect from the next weekday, and a whole cancel records no cancel day.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): rules at the HTTP harness — the admin's cancel and switch-off (D-029's confirmed actions), the
// person's own cancel (POST /api/requests/:id/cancel), the records read back (GET /api/requests, GET
// /api/admin/people/:id/requests), GET /api/balance and GET /api/calendar. A record's cancel day is read as
// team-calendar.ts states (a day under a key naming a cancel, not a time).
// The team: Pacific/Auckland; every moment is 10:00 team time in June 2027 (UTC 22:00 the day before).
import { test, expect } from '@playwright/test';
import { type AccountId, type Actor } from './harness';
import {
  addMember,
  answerOf,
  AUCKLAND,
  calendarDatesFor,
  cancelDaysOf,
  disposeAll,
  isAccepted,
  ownRecords,
  personRecords,
  recordById,
  sendApproved,
  sendOk,
  setTeamClock,
  startTeam,
  stateOf,
  teamInstant,
  tryConfirmed,
  yearFigures,
  type Rec,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

async function ownRecord(actor: Actor, id: AccountId): Promise<Rec | undefined> {
  return recordById(await ownRecords(actor), id);
}

// ---------------------------------------------------------------------------------------------------
// ROW-143 promise: REQ-019 (an approved request with Monday to Friday days before today is shortened; one with none
// ROW-143   becomes cancelled), REQ-010 (only Monday to Friday days from today on are cancelled), REQ-016 / A-033
// ROW-143   (switch-off is refused only for a pending request with a Monday to Friday day before today) and D-020 (a
// ROW-143   whole cancel records no cancel day; a partial one the weekday it takes effect from): before today means a
// ROW-143   counted weekday before today.
// ROW-143 wrong product: one that tests "any day before today" — so a Saturday-to-Friday request cancelled on the Monday
// ROW-143   stays approved and shortened (its Saturday and Sunday counted as taken), a pending request whose only past
// ROW-143   day is a Saturday blocks switch-off, a Saturday cancel records Saturday as its cancel day — or one that
// ROW-143   writes a cancel day on every cancel.
// ROW-143 given / when / then:
// ROW-143   (a) approved Sat 12..Fri 18 June, admin cancels on Mon 14: cancelled, no cancel day, 25 days left, June empty.
// ROW-143   (b) pending Sat 12..Fri 18 June, switch-off on Sun 13: allowed; the request cancelled with no cancel day.
// ROW-143   (c) approved Mon 7..Fri 18 June, admin cancels on Sat 12: stays approved, cancel day Mon 14 (never Sat 12 or
// ROW-143       Sun 13), 20 days left, June lists exactly 7..11.
// ROW-143   (d) whole cancels on Mon 14 of Wed 16..Fri 18 — the person's own pending cancel, the admin's full cancel of an
// ROW-143       approved one, a switch-off cancel of a pending one: each cancelled with no cancel day.
// ROW-143 controls: the control case cancels an approved Mon 7..Fri 18 on Wed 9: approved, cancel day 9 June, 23 days
// ROW-143   left — the partial path, its cancel-day reading and the balance work, untouched by a weekend fault.
// ROW-143 technique: the threshold of "before today" placed on a weekend — the weekend days on one side, the first
// ROW-143   weekday on the other — with the state, the cancel day and the balance each read exactly.
// ROW-143 cases: ROW-143 target=ROW-143.REQ-019.a-cancel-whose-only-past-days-are-a-weekend-is-whole control=ROW-143.control.a-weekday-cancel-mid-request-is-partial
test('ROW-143.control.a-weekday-cancel-mid-request-is-partial', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-07', '10:00') });
  const { actor } = await addMember(team, { allowance: 25 });
  const id = await sendApproved(team, actor, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-18' });
  await setTeamClock(AUCKLAND, '2027-06-09', '10:00');
  const c = await tryConfirmed(team.admin, 'cancel', id);
  expect(isAccepted(c), `ROW-143 control: the cancel is accepted (answered ${c.status})`).toBe(true);
  const rec = await ownRecord(actor, id);
  expect(stateOf(rec), 'ROW-143 control: shortened, it stays approved').toBe('approved');
  expect(cancelDaysOf(rec), 'ROW-143 control: its cancel day is Wed 9 June').toEqual(['2027-06-09']);
  expect((await yearFigures(actor, 2027))?.daysLeft, 'ROW-143 control: Mon 7 and Tue 8 stay counted').toBe(23);
});

test('ROW-143.REQ-019.a-cancel-whose-only-past-days-are-a-weekend-is-whole', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-10', '10:00') });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const id = await sendApproved(team, actor, { kind: 'vacation', firstDay: '2027-06-12', lastDay: '2027-06-18' });
  expect((await yearFigures(actor, 2027))?.daysLeft, 'ROW-143 (a) before: the five weekdays are counted').toBe(20);
  await setTeamClock(AUCKLAND, '2027-06-14', '10:00');
  const c = await tryConfirmed(team.admin, 'cancel', id);
  expect(isAccepted(c), `ROW-143 (a): the cancel on Mon 14 is accepted (answered ${c.status})`).toBe(true);
  const rec = await ownRecord(actor, id);
  expect.soft(stateOf(rec), 'ROW-143 (a): no weekday before today, so the request becomes cancelled').toBe('cancelled');
  expect.soft(cancelDaysOf(rec), 'ROW-143 (a): a whole cancel records no cancel day').toEqual([]);
  expect.soft((await yearFigures(actor, 2027))?.daysLeft, 'ROW-143 (a): all five weekdays are returned').toBe(25);
  expect.soft(await calendarDatesFor(actor, 2027, 6, member.name), 'ROW-143 (a): June lists none of its days').toEqual([]);
});

test('ROW-143.REQ-016.a-pending-request-whose-only-past-day-is-a-saturday-does-not-block-switch-off', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-11', '10:00') });
  const { member, actor } = await addMember(team);
  const id = await sendOk(actor, { kind: 'vacation', firstDay: '2027-06-12', lastDay: '2027-06-18' });
  await setTeamClock(AUCKLAND, '2027-06-13', '10:00');
  const off = await tryConfirmed(team.admin, 'switch-off', member.id);
  expect(isAccepted(off), `ROW-143 (b): switch-off on Sun 13 is allowed — the only past day is Sat 12 (answered ${off.status} ${off.text.slice(0, 160)})`).toBe(true);
  const rec = recordById(await personRecords(team.admin, member.id), id);
  expect.soft(stateOf(rec), 'ROW-143 (b): the pending request is cancelled').toBe('cancelled');
  expect.soft(cancelDaysOf(rec), 'ROW-143 (b): a switch-off cancel of a pending request records no cancel day').toEqual([]);
});

test('ROW-143.REQ-019.a-weekend-cancel-takes-effect-from-the-next-weekday', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-07', '10:00') });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const id = await sendApproved(team, actor, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-18' });
  await setTeamClock(AUCKLAND, '2027-06-12', '10:00');
  const c = await tryConfirmed(team.admin, 'cancel', id);
  expect(isAccepted(c), `ROW-143 (c): the cancel on Sat 12 is accepted (answered ${c.status})`).toBe(true);
  const rec = await ownRecord(actor, id);
  expect.soft(stateOf(rec), 'ROW-143 (c): Mon 7..Fri 11 are before today, so it stays approved').toBe('approved');
  expect.soft(cancelDaysOf(rec), 'ROW-143 (c): the cancel takes effect from Mon 14, the next weekday — never Sat 12 or Sun 13').toEqual(['2027-06-14']);
  expect.soft((await yearFigures(actor, 2027))?.daysLeft, 'ROW-143 (c): Mon 7..Fri 11 stay counted').toBe(20);
  expect
    .soft(await calendarDatesFor(actor, 2027, 6, member.name), 'ROW-143 (c): June lists exactly 7..11')
    .toEqual(['2027-06-07', '2027-06-08', '2027-06-09', '2027-06-10', '2027-06-11']);
});

test('ROW-143.REQ-017.a-whole-cancel-records-no-cancel-day', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-14', '10:00') });
  const spec = { kind: 'vacation' as const, firstDay: '2027-06-16', lastDay: '2027-06-18' };

  const own = await addMember(team);
  const ownId = await sendOk(own.actor, spec);
  const ownCancel = await answerOf(await own.actor.api.post(`/api/requests/${encodeURIComponent(String(ownId))}/cancel`));
  expect.soft(isAccepted(ownCancel), `ROW-143 (d) own: the person cancels their pending request (answered ${ownCancel.status})`).toBe(true);
  const ownRec = await ownRecord(own.actor, ownId);
  expect.soft(stateOf(ownRec), 'ROW-143 (d) own: cancelled').toBe('cancelled');
  expect.soft(cancelDaysOf(ownRec), "ROW-143 (d) own: a person's own pending cancel records no cancel day").toEqual([]);

  const full = await addMember(team);
  const fullId = await sendApproved(team, full.actor, spec);
  const fullCancel = await tryConfirmed(team.admin, 'cancel', fullId);
  expect.soft(isAccepted(fullCancel), `ROW-143 (d) full: the admin cancels the approved request (answered ${fullCancel.status})`).toBe(true);
  const fullRec = await ownRecord(full.actor, fullId);
  expect.soft(stateOf(fullRec), 'ROW-143 (d) full: no weekday before today, so cancelled').toBe('cancelled');
  expect.soft(cancelDaysOf(fullRec), 'ROW-143 (d) full: a full admin cancel records no cancel day').toEqual([]);

  const leaver = await addMember(team);
  const leaverId = await sendOk(leaver.actor, spec);
  const off = await tryConfirmed(team.admin, 'switch-off', leaver.member.id);
  expect.soft(isAccepted(off), `ROW-143 (d) switch-off: allowed (answered ${off.status})`).toBe(true);
  const leaverRec = recordById(await personRecords(team.admin, leaver.member.id), leaverId);
  expect.soft(stateOf(leaverRec), 'ROW-143 (d) switch-off: the pending request is cancelled').toBe('cancelled');
  expect.soft(cancelDaysOf(leaverRec), 'ROW-143 (d) switch-off: a switch-off cancel records no cancel day').toEqual([]);
});
