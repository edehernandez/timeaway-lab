// Purpose: ledger test for ROW-048 (REQ-009 arm 6) — a pending request whose days have all passed stays pending through every page load and a server restart, and can still be approved or rejected.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-16); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run; the restart through doors-process.ts (D-048); instants worked out by the tests' own Intl oracle.
//
// Boundary (R6): a process row — the stored states read at the HTTP harness (GET /api/requests, GET /api/admin/pending),
// the pages loaded in the harness's one engine (a page load is the action that could age a request), the restart
// through the D-048 restart door, the decisions through the admin's two-step routes.
//
// ROW-048 promise: REQ-009 fail-if (6) "a pending request changes state by itself when its days pass"; REQ-009 "a
// ROW-048   pending request whose days have passed stays pending and decidable"; A-021 "it stays pending until the
// ROW-048   admin approves or rejects it; nothing expires by itself".
// ROW-048 wrong product: one that expires (rejects, cancels or marks "expired") a pending request once its last day is
// ROW-048   before today — in a sweep run when a page or list is read, or at server start; or one whose decide routes
// ROW-048   refuse a request whose days are past ("these days have passed"), so it is pending but no longer decidable.
// ROW-048 given: an Auckland team at Mon 1 March 2027 10:00 (UTC 28 February, so a UTC-dated product is off by one);
// ROW-048   a member's pending vacation 8..10 March, pending vacation 15..16 March and pending sick 22..23 February
// ROW-048   (already past when sent). when: the team clock moves to Mon 12 April 2027 (past every day of all three);
// ROW-048   every page is loaded and reloaded, as the admin and as the member; the server is restarted (D-048).
// ROW-048 then: after the page loads and again after the restart, each of the three is pending on the member's own
// ROW-048   list and on the admin's pending list; then the admin approves the 8..10 March vacation and the sick request
// ROW-048   and rejects the 15..16 March one, each act answering 2xx, and they read approved, approved, rejected.
// ROW-048 controls: the control case — the same three requests with no clock move are pending and the same acts take
// ROW-048   them to approved / rejected — shows the setup and the decide path work; in the target, each request is read
// ROW-048   pending BEFORE the clock moves (the "still pending" after is not true by construction).
// ROW-048 technique: the clock's origin moved past every day (the deadline the wrong product would apply), then every
// ROW-048   reader that could trigger an expiry (every page, both actors) and the restart; states read per request id.
// ROW-048 cases: ROW-048 target=ROW-048.REQ-009.pending-stays-pending-and-decidable-after-its-days-pass control=ROW-048.control.pending-requests-are-decidable-before-their-days-pass
import { test, expect, type Browser } from '@playwright/test';
import { confirmedActionRoutes, openPage, PAGES, signIn, type AccountId, type Actor, type ConfirmedAction } from './harness';
import { restartProduct } from './doors-process';
import {
  addMember,
  AUCKLAND,
  disposeAll,
  ownRecords,
  pendingRecords,
  sendOk,
  setTeamClock,
  signInAgain,
  startTeam,
  stateOf,
  teamInstant,
  type Team,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

interface Three {
  team: Team;
  memberId: AccountId;
  member: Awaited<ReturnType<typeof addMember>>['member'];
  actor: Actor;
  ids: { early: AccountId; late: AccountId; sick: AccountId };
}

async function setUp(): Promise<Three> {
  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-03-01', '10:00') });
  const { member, actor } = await addMember(team, { allowance: 25 });
  const early = await sendOk(actor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  const late = await sendOk(actor, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  const sick = await sendOk(actor, { kind: 'sick', firstDay: '2027-02-22', lastDay: '2027-02-23' });
  return { team, memberId: member.id, member, actor, ids: { early, late, sick } };
}

async function statesOn(actor: Actor, ids: AccountId[]): Promise<(string | undefined)[]> {
  const recs = await ownRecords(actor);
  return ids.map((id) => stateOf(recs.find((r) => String(r.id) === String(id))));
}

async function pendingIds(admin: Actor): Promise<string[]> {
  return (await pendingRecords(admin)).map((r) => String(r.id));
}

/** The two steps of a confirmed act, raw: the effect's status and the act's status (a refusal is the row's, never SETUP). */
async function decide(admin: Actor, action: ConfirmedAction, id: AccountId): Promise<{ effect: number; act: number }> {
  const { effect, act } = confirmedActionRoutes(action, id);
  const e = await admin.api.get(effect);
  const token = e.ok() ? ((await e.json().catch(() => ({}))) as { token?: string }).token : undefined;
  if (!e.ok() || !token) return { effect: e.status(), act: 0 };
  const a = await admin.api.post(act, { data: { token } });
  return { effect: e.status(), act: a.status() };
}

function ok(status: number): boolean {
  return status >= 200 && status < 300;
}

async function loadEvery(browser: Browser, actor: Actor, paths: string[]): Promise<void> {
  const opened = await openPage(browser, actor);
  try {
    for (const path of paths) {
      await opened.page.goto(path, { waitUntil: 'networkidle' });
      await opened.page.reload({ waitUntil: 'networkidle' });
    }
  } finally {
    await opened.close();
  }
}

test('ROW-048.control.pending-requests-are-decidable-before-their-days-pass', async () => {
  const { team, actor, ids } = await setUp();
  const all = [ids.early, ids.late, ids.sick];
  expect(await statesOn(actor, all), 'ROW-048 control: the three requests are pending when sent').toEqual(['pending', 'pending', 'pending']);
  expect(await pendingIds(team.admin), 'ROW-048 control: the admin\'s pending list holds all three').toEqual(
    expect.arrayContaining(all.map(String)),
  );
  for (const [action, id, what] of [
    ['approve', ids.early, 'approves the 8..10 March vacation'],
    ['approve', ids.sick, 'approves the sick request'],
    ['reject', ids.late, 'rejects the 15..16 March vacation'],
  ] as const) {
    const d = await decide(team.admin, action, id);
    expect(ok(d.effect) && ok(d.act), `ROW-048 control: the admin ${what} (effect ${d.effect}, act ${d.act})`).toBe(true);
  }
  expect(await statesOn(actor, all), 'ROW-048 control: they read approved, rejected, approved').toEqual(['approved', 'rejected', 'approved']);
});

test('ROW-048.REQ-009.pending-stays-pending-and-decidable-after-its-days-pass', async ({ browser }) => {
  const { team, member, memberId, actor, ids } = await setUp();
  const all = [ids.early, ids.late, ids.sick];
  expect(await statesOn(actor, all), 'ROW-048 before: the three requests are pending').toEqual(['pending', 'pending', 'pending']);

  await setTeamClock(AUCKLAND, '2027-04-12', '10:00');
  await loadEvery(browser, team.admin, [
    PAGES.home,
    PAGES.newRequest,
    PAGES.calendar,
    PAGES.password,
    PAGES.adminPending,
    PAGES.adminPeople,
    PAGES.adminPerson(memberId),
  ]);
  await loadEvery(browser, actor, [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password]);
  expect.soft(await statesOn(actor, all), 'ROW-048 after the days passed and every page loaded: all three still pending').toEqual([
    'pending',
    'pending',
    'pending',
  ]);
  expect
    .soft(await pendingIds(team.admin), 'ROW-048 after every page loaded: the admin\'s pending list still holds all three')
    .toEqual(expect.arrayContaining(all.map(String)));

  await restartProduct();
  await setTeamClock(AUCKLAND, '2027-04-12', '10:00');
  const admin = await signIn(team.install.admin);
  try {
    const again = await signInAgain(member);
    expect.soft(await statesOn(again, all), 'ROW-048 after the restart: all three still pending').toEqual(['pending', 'pending', 'pending']);
    expect
      .soft(await pendingIds(admin), 'ROW-048 after the restart: the admin\'s pending list still holds all three')
      .toEqual(expect.arrayContaining(all.map(String)));

    for (const [action, id, what] of [
      ['approve', ids.early, 'approving the passed 8..10 March vacation'],
      ['approve', ids.sick, 'approving the passed sick request'],
      ['reject', ids.late, 'rejecting the passed 15..16 March vacation'],
    ] as const) {
      const d = await decide(admin, action, id);
      expect.soft(ok(d.effect) && ok(d.act), `ROW-048: ${what} is accepted (effect ${d.effect}, act ${d.act})`).toBe(true);
    }
    expect(await statesOn(again, all), 'ROW-048: after the decisions they read approved, rejected, approved').toEqual([
      'approved',
      'rejected',
      'approved',
    ]);
  } finally {
    await admin.dispose();
  }
});
