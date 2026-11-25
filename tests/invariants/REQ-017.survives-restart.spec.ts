// Purpose: ledger tests for ROW-201 and ROW-202 (REQ-017, REQ-023, CON-001) — a success shown to the user survives the server stopping right after it; a restart never re-seeds people or resets the admin or its password; a start on an existing database keeps every record and figure; and, as control, a restart with no change shows the same data.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-16); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; the restart through the D-048 restart door (doors-process.ts); figures worked out by the test from the values it set.
//
// Boundary (R6): a process row — the stop and the start through the restart door (it answers, then ends the server,
// which starts again on the same database), every record and figure read at the HTTP harness (D-029 read routes).
// What is not reached: a different BUILD of the product started on this database. The harness has one image; the
// restart starts that image's built release from nothing on an existing database (its start-up path: migrations,
// any seeding), which is the path by which a release start could lose or re-seed records.
import { test, expect } from '@playwright/test';
import {
  approve,
  requireOk,
  freshPassword,
  setAllowance,
  signIn,
  type AccountId,
  type Actor,
  type Credentials,
  type Member,
} from './harness';
import { restartProduct } from './doors-process';
import { observe, topRecordIds } from './records';
import {
  addMember,
  AUCKLAND,
  calendarDatesFor,
  canSignIn,
  dayLeaves,
  disposeAll,
  ownRecords,
  sendOk,
  setTeamClock,
  signInAgain,
  startTeam,
  stateOf,
  teamInstant,
  yearFigures,
} from './team-calendar';

const opened: Actor[] = [];
test.afterEach(async () => {
  while (opened.length) await opened.pop()?.dispose().catch(() => undefined);
  await disposeAll();
});

const CLOCK: [string, string] = ['2027-03-01', '10:00'];

/** Restarts through the door and puts the team clock back at the case's instant (the override is not this row's). */
async function restartAndReclock(): Promise<void> {
  await restartProduct();
  await setTeamClock(AUCKLAND, CLOCK[0], CLOCK[1]);
}

async function signInTracked(c: Credentials): Promise<Actor> {
  const a = await signIn(c);
  opened.push(a);
  return a;
}

/**
 * Keys whose values are about the reading session, not the stored records (a sign-in time, a session flag); the test
 * signs in again after every restart, so these may differ without any record changing. Every other leaf is compared.
 */
const VOLATILE = /^(last.?(sign|seen|login|active|access).*|signed.?in.*|session.*|logged.?in.*|online|server.?time|generated.?at)$/i;

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) if (!VOLATILE.test(k)) out[k] = stable((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

interface People {
  admin: Actor;
  members: { member: Member; actor: Actor }[];
}

/** Every record and figure the product shows of this team: the admin's lists, each person's own lists and figures, the calendar. */
async function snapshot(p: People): Promise<Record<string, unknown>> {
  const s: Record<string, unknown> = {};
  s['admin me'] = await observe(p.admin.api, '/api/me');
  s['admin people'] = await observe(p.admin.api, '/api/admin/people');
  s['admin pending'] = await observe(p.admin.api, '/api/admin/pending');
  s['admin own requests'] = await observe(p.admin.api, '/api/requests');
  s['admin own balance'] = await observe(p.admin.api, '/api/balance');
  for (const { member, actor } of p.members) {
    const id = encodeURIComponent(String(member.id));
    s[`${member.name} me`] = await observe(actor.api, '/api/me');
    s[`${member.name} own requests`] = await observe(actor.api, '/api/requests');
    s[`${member.name} own balance`] = await observe(actor.api, '/api/balance');
    s[`${member.name} as the admin sees`] = await observe(p.admin.api, `/api/admin/people/${id}/requests`);
    s[`${member.name} history`] = await observe(p.admin.api, `/api/admin/people/${id}/history`);
  }
  for (const [y, m] of [
    [2027, 2],
    [2027, 3],
    [2027, 5],
  ]) {
    s[`calendar ${y}-${m}`] = await observe(p.admin.api, `/api/calendar?year=${y}&month=${m}`);
  }
  return stable(s) as Record<string, unknown>;
}

async function recordOf(actor: Actor, id: AccountId) {
  return (await ownRecords(actor)).find((r) => String(r.id) === String(id));
}

// ---------------------------------------------------------------------------------------------------
// ROW-201 promise: REQ-017 (a request holds its days as sent, its state, who decided it and when) and REQ-023 (an
// ROW-201   account holds its name, email, password, whether it is the admin, and each year's allowance), CON-001 (exactly
// ROW-201   one admin, created at setup, A-013): a success shown to the user survives the server stopping right after
// ROW-201   it; a restart never re-seeds people, resets the admin or its password; a new release started on an
// ROW-201   existing database keeps every record and figure.
// ROW-201 wrong product: one that answers a send or a decision before its write is durable (a write queued after the
// ROW-201   answer, an in-memory store flushed on a timer, a transaction left open), so a stop right after loses it; one
// ROW-201   whose start-up re-runs the setup seed (re-creates the admin from start-up values, resetting its password or
// ROW-201   allowance) or adds demo people; one whose start-up migration rebuilds a table and drops rows or columns.
// ROW-201 given: an Auckland team, members M1 (allowance 21) and M2 (allowance 25). when, each act answered 2xx and
// ROW-201   the restart door called at once after it, nothing read in between: (a) M1 sends a vacation 3..5 May 2027;
// ROW-201   (b) the admin approves M1's vacation 8..10 March; (c) the admin changes its own password; (d) the admin sets
// ROW-201   M2's allowance to 31; then (e) every record and figure is read, the server restarted once more, and read again.
// ROW-201 then: (a) the 3..5 May request is there, pending, with its days as sent; (b) 8..10 March is approved and on
// ROW-201   the calendar under M1, M1's 2027 days left is 18 with 3 pending; (c) the new password signs in, the installed
// ROW-201   one does not, and the account is still the one admin with its id and name; (d) M2's 2027 days left is 31;
// ROW-201   after every restart the people list holds exactly the accounts it held before the first; (e) the two reads
// ROW-201   are equal.
// ROW-201 controls: each effect is read absent before its act (no May request; 8..10 March pending and off the
// ROW-201   calendar; the old password signs in; M2's days left 25); ROW-202's case shows the restart and the snapshot
// ROW-201   compare equal when nothing changed, so (e) is not equal by construction of the reader.
// ROW-201 technique: before and after around a stop placed right after each success; a whole-team snapshot (every
// ROW-201   read route, every account) for the release start, never a part.
// ROW-201 cases: ROW-201 target=ROW-201.REQ-017.successes-survive-a-stop-right-after-and-a-restart-keeps-everything control=ROW-202.control.a-restart-with-no-change-shows-the-same-data
test('ROW-201.REQ-017.successes-survive-a-stop-right-after-and-a-restart-keeps-everything', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, CLOCK[0], CLOCK[1]) });
  const one = await addMember(team, { allowance: 21 });
  const two = await addMember(team, { allowance: 25 });
  const adminId = team.admin.me.id;
  const adminName = team.admin.me.name;
  let adminCreds: Credentials = { email: team.install.admin.email, password: team.install.admin.password };
  const peopleIds = async (admin: Actor) => topRecordIds(await observe(admin.api, '/api/admin/people')).sort();
  const idsBefore = await peopleIds(team.admin);
  expect(idsBefore, 'ROW-201 setup: the people list holds both members').toEqual(expect.arrayContaining([String(one.member.id), String(two.member.id)]));

  // (a) a send, the server stopped right after it answered.
  expect(dayLeaves(await ownRecords(one.actor)), 'ROW-201 (a) before: M1 has no request on 3 May').not.toContain('2027-05-03');
  const may = await sendOk(one.actor, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-05' });
  await restartAndReclock();
  let a1 = await signInAgain(one.member);
  let admin = await signInTracked(adminCreds);
  const mayRec = await recordOf(a1, may);
  expect.soft(stateOf(mayRec), 'ROW-201 (a) after the stop: the 3..5 May request is there, pending').toBe('pending');
  expect.soft(dayLeaves(mayRec), 'ROW-201 (a) after the stop: with its days as sent').toEqual(expect.arrayContaining(['2027-05-03', '2027-05-05']));
  expect.soft(await peopleIds(admin), 'ROW-201 (a) after the restart: the same people, none re-seeded').toEqual(idsBefore);

  // (b) a decision, the server stopped right after it answered.
  const march = await sendOk(a1, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  expect(stateOf(await recordOf(a1, march)), 'ROW-201 (b) before: 8..10 March is pending').toBe('pending');
  expect(await calendarDatesFor(a1, 2027, 3, one.member.name), 'ROW-201 (b) before: M1 is not on the March calendar').toEqual([]);
  expect((await yearFigures(a1, 2027))?.daysLeft, 'ROW-201 (b) before: M1 has 21 days left in 2027').toBe(21);
  await approve(admin, march);
  await restartAndReclock();
  a1 = await signInAgain(one.member);
  admin = await signInTracked(adminCreds);
  expect.soft(stateOf(await recordOf(a1, march)), 'ROW-201 (b) after the stop: 8..10 March is approved').toBe('approved');
  expect
    .soft(await calendarDatesFor(a1, 2027, 3, one.member.name), 'ROW-201 (b) after the stop: 8..10 March is on the calendar under M1')
    .toEqual(['2027-03-08', '2027-03-09', '2027-03-10']);
  expect.soft(await yearFigures(a1, 2027), 'ROW-201 (b) after the stop: M1\'s 2027 days left 18, pending 3').toEqual({ daysLeft: 18, pending: 3 });
  expect.soft(await peopleIds(admin), 'ROW-201 (b) after the restart: the same people').toEqual(idsBefore);

  // (c) the admin's own password change, the server stopped right after it answered.
  const next = freshPassword();
  expect(await canSignIn(adminCreds.email, adminCreds.password), 'ROW-201 (c) before: the installed password signs in').toBe(true);
  await requireOk(await admin.api.post('/api/me/password', { data: { current: adminCreds.password, next } }), 'POST /api/me/password (the admin\'s own)');
  const installed = adminCreds.password;
  adminCreds = { email: adminCreds.email, password: next };
  await restartAndReclock();
  expect.soft(await canSignIn(adminCreds.email, next), 'ROW-201 (c) after the stop: the new password signs in').toBe(true);
  expect.soft(await canSignIn(adminCreds.email, installed), 'ROW-201 (c) after the restart: the installed password was not put back').toBe(false);
  admin = await signInTracked(adminCreds);
  expect.soft(
    { id: String(admin.me.id), name: admin.me.name, isAdmin: admin.me.isAdmin },
    'ROW-201 (c) after the restart: still the one admin, same id and name',
  ).toEqual({ id: String(adminId), name: adminName, isAdmin: true });
  expect.soft(await peopleIds(admin), 'ROW-201 (c) after the restart: the same people').toEqual(idsBefore);

  // (d) an allowance change, the server stopped right after it answered.
  let a2 = await signInAgain(two.member);
  expect((await yearFigures(a2, 2027))?.daysLeft, 'ROW-201 (d) before: M2 has 25 days left in 2027').toBe(25);
  await setAllowance(admin, two.member.id, 31);
  await restartAndReclock();
  a2 = await signInAgain(two.member);
  admin = await signInTracked(adminCreds);
  expect.soft((await yearFigures(a2, 2027))?.daysLeft, 'ROW-201 (d) after the stop: M2 has 31 days left in 2027').toBe(31);
  expect.soft(await peopleIds(admin), 'ROW-201 (d) after the restart: the same people').toEqual(idsBefore);
  for (const m of [one.member, two.member]) {
    const s = await signInAgain(m);
    expect.soft(s.me.isAdmin, `ROW-201 (d) after the restarts: ${m.name} is not an admin`).toBe(false);
  }

  // (e) the release start on the existing database: every record and figure, before and after.
  a1 = await signInAgain(one.member);
  const before = await snapshot({ admin, members: [{ member: one.member, actor: a1 }, { member: two.member, actor: a2 }] });
  await restartAndReclock();
  admin = await signInTracked(adminCreds);
  a1 = await signInAgain(one.member);
  a2 = await signInAgain(two.member);
  const after = await snapshot({ admin, members: [{ member: one.member, actor: a1 }, { member: two.member, actor: a2 }] });
  expect(after, 'ROW-201 (e) after a start on the existing database: every record and figure is as before').toEqual(before);
});

// ---------------------------------------------------------------------------------------------------
// ROW-202 promise: control of ROW-201 — REQ-017, REQ-023, CON-001: a restart with no pending change shows the same data.
// ROW-202 wrong product: a start-up that rewrites what it reads (re-derives states, re-sorts or re-stamps records,
// ROW-202   recomputes figures from a different rule), or a reader whose answers differ run to run, so ROW-201's
// ROW-202   whole-team compare would fail for a reason that is not a lost write.
// ROW-202 given: an Auckland team; a member with an approved vacation 8..10 March 2027, a pending vacation 3..4 May, an
// ROW-202   approved sick 22..23 February, an allowance changed to 19; nothing in flight. when: every record and figure
// ROW-202   is read, the server is restarted through the door (seen ending, then healthy), every actor signs in again.
// ROW-202 then: the second read equals the first, and the first is not empty: it holds the member's name and the three
// ROW-202   request ids.
// ROW-202 controls: two reads with no restart agree (the reader is stable); the restart door's wait saw the server end.
// ROW-202 technique: before and after with nothing changed — the identity a durable product keeps, over every route.
// ROW-202 cases: ROW-202 target=ROW-202.control.a-restart-with-no-change-shows-the-same-data control=ROW-201.REQ-017.successes-survive-a-stop-right-after-and-a-restart-keeps-everything
test('ROW-202.control.a-restart-with-no-change-shows-the-same-data', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, CLOCK[0], CLOCK[1]) });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const march = await sendOk(actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  const may = await sendOk(actor, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
  const sick = await sendOk(actor, { kind: 'sick', firstDay: '2027-02-22', lastDay: '2027-02-23' });
  await approve(team.admin, march);
  await approve(team.admin, sick);
  await setAllowance(team.admin, member.id, 19);
  const creds: Credentials = { email: team.install.admin.email, password: team.install.admin.password };

  const before = await snapshot({ admin: team.admin, members: [{ member, actor }] });
  const text = JSON.stringify(before);
  expect(text.includes(member.name), 'ROW-202: the read holds the member').toBe(true);
  for (const id of [march, may, sick]) {
    expect(
      (await ownRecords(actor)).some((r) => String(r.id) === String(id)),
      `ROW-202: the read holds request ${id}`,
    ).toBe(true);
  }
  expect(await snapshot({ admin: team.admin, members: [{ member, actor }] }), 'ROW-202: two reads with no restart agree').toEqual(before);

  await restartAndReclock();
  const admin = await signInTracked(creds);
  const again = await signInAgain(member);
  const after = await snapshot({ admin, members: [{ member, actor: again }] });
  expect(after, 'ROW-202: after a restart with no change, every record and figure is the same').toEqual(before);
});
