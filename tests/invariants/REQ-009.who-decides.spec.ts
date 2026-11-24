// Purpose: ledger tests for ROW-044 and ROW-045 (REQ-009 arms 2 and 3) — nobody but the admin approves or rejects a request, and the admin decides their own requests like anyone else's.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, accounts, requests, confirmed actions), fresh per run.
//
// ROW-044 promise: REQ-009 fail-if (2) "anyone but the admin approves or rejects a request"; the row's cases: as a
// ROW-044   member, approve and reject called directly on the server for their own pending request and for another
// ROW-044   person's — each refused, the request left pending. "Left pending" is observed as D-029 exposes it: the
// ROW-044   days still counted as pending (REQ-007), not on the calendar, and the admin can still decide it.
// ROW-044 wrong product: the admin routes check only that a session exists, not that it is the admin's; or the
// ROW-044   effect step is guarded but the act is not, so a member replaying the admin's token (or any token) decides;
// ROW-044   or a member may decide their own request ("self-service approval").
// ROW-044 given: two members, each with a pending vacation request on its own days; the admin has read real
// ROW-044   approve and reject tokens for both. when: member 1 calls approve and reject on both requests through the
// ROW-044   effect-then-act path, and posts the acts with the admin's real tokens; an anonymous caller does the same.
// ROW-044   then: every act is refused; both requests still show their days as pending, neither is on the calendar,
// ROW-044   and afterwards the admin approves one and rejects the other, each taking (they were still pending).
// ROW-044 controls: the control case shows the admin's approve on the same kind of request is accepted and lists
// ROW-044   its day — the routes and the effect are real, so the target's refusals are about who acts.
// ROW-044 technique: the neighbouring entity (another member's request) beside the actor's own, and the admin's
// ROW-044   own valid token as the near miss of an unauthorised call (the strongest replay a member could send).
// ROW-044 cases: ROW-044 target=ROW-044.REQ-009.member-approve-and-reject-refused-request-left-pending control=ROW-044.control.admin-approve-of-a-pending-request-is-accepted
//
// ROW-045 promise: REQ-009 fail-if (3) "the admin cannot decide their own request"; A-006 (human): the admin is
// ROW-045   also a team member with an allowance and decides their own requests like anyone else's.
// ROW-045 wrong product: a conflict-of-interest guard that refuses an approver's decision on their own request,
// ROW-045   or one that accepts the call but leaves the admin's request pending / off the calendar.
// ROW-045 given: the admin (fresh allowance A) sends two vacation requests, 2 days and 1 day. when: the admin
// ROW-045   approves the first and rejects the second. then: both accepted; the first's two days are listed for the
// ROW-045   admin on the calendar, the second's day is not; the admin's days left is A − 2 and nothing is pending.
// ROW-045 controls: before the decisions the admin's 3 days are pending and none listed (the effect is absent before
// ROW-045   the action); the control case shows the admin deciding a member's request works the same way.
// ROW-045 technique: before/after on the admin's own figures and calendar entries, the member's request as the
// ROW-045   neighbouring control.
// ROW-045 cases: ROW-045 target=ROW-045.REQ-009.admin-approves-and-rejects-their-own-request control=ROW-045.control.admin-decides-a-members-request
import { test, expect } from '@playwright/test';
import { readEffect, sendRequest } from './harness';
import { AHEAD_ZONE, actRaw, awayDays, figures, freshInt, ok, startTeam, teamInstant, tryConfirmed, withAnonymous } from './time-off';

const NOW = teamInstant(AHEAD_ZONE, '2027-03-01', '09:00'); // a Monday; requests below are in April 2027

test('ROW-044.control.admin-approve-of-a-pending-request-is-accepted', async () => {
  const A = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    const id = await sendRequest(session, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-12' });
    const a = await tryConfirmed(team.admin.api, 'approve', id);
    expect(a.accepted, `ROW-044 control: the admin's approve is accepted (effect ${a.effectStatus}, act ${a.actStatus})`).toBe(true);
    expect(await awayDays(team.admin, member.id, ['2027-04-12']), 'ROW-044 control: the approved day is listed').toEqual(['2027-04-12']);
  } finally {
    await team.close();
  }
});

test('ROW-044.REQ-009.member-approve-and-reject-refused-request-left-pending', async () => {
  const A1 = freshInt(10, 30);
  const A2 = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A1, A2] });
  try {
    const [m1, m2] = team.members;
    const [s1, s2] = team.sessions;
    const own = await sendRequest(s1, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
    const other = await sendRequest(s2, { kind: 'vacation', firstDay: '2027-04-14', lastDay: '2027-04-14' });
    const days = ['2027-04-12', '2027-04-13', '2027-04-14'];
    expect(await figures(s1, [2027]), 'ROW-044 before: member 1 has 2 days pending').toEqual({ 2027: { daysLeft: A1, pending: 2 } });
    expect(await figures(s2, [2027]), 'ROW-044 before: member 2 has 1 day pending').toEqual({ 2027: { daysLeft: A2, pending: 1 } });

    for (const [label, id] of [['own', own], ['another person\'s', other]] as const) {
      for (const action of ['approve', 'reject'] as const) {
        const adminToken = (await readEffect(team.admin, action, id)).token;
        const t = await tryConfirmed(s1.api, action, id);
        expect.soft(t.accepted, `ROW-044 member ${action} on their ${label} request through effect-then-act is refused (effect ${t.effectStatus}, act ${t.actStatus})`).toBe(false);
        const replay = await actRaw(s1.api, action, id, adminToken);
        expect.soft(ok(replay), `ROW-044 member ${action} on their ${label} request with the admin's real token is refused (${replay})`).toBe(false);
        const bare = await actRaw(s1.api, action, id, null);
        expect.soft(ok(bare), `ROW-044 member ${action} on their ${label} request with no token is refused (${bare})`).toBe(false);
        await withAnonymous(async (anon) => {
          const s = await actRaw(anon, action, id, adminToken);
          expect.soft(ok(s), `ROW-044 anonymous ${action} on the ${label} request with the admin's real token is refused (${s})`).toBe(false);
        });
      }
    }

    expect.soft(await figures(s1, [2027]), 'ROW-044 after: member 1\'s days still pending').toEqual({ 2027: { daysLeft: A1, pending: 2 } });
    expect.soft(await figures(s2, [2027]), 'ROW-044 after: member 2\'s day still pending').toEqual({ 2027: { daysLeft: A2, pending: 1 } });
    expect.soft(await awayDays(team.admin, m1.id, days), 'ROW-044 after: member 1 is on no day').toEqual([]);
    expect.soft(await awayDays(team.admin, m2.id, days), 'ROW-044 after: member 2 is on no day').toEqual([]);

    // Still pending, so still decidable by the admin.
    const a = await tryConfirmed(team.admin.api, 'approve', own);
    const r = await tryConfirmed(team.admin.api, 'reject', other);
    expect.soft(a.accepted, `ROW-044 after: the admin can still approve member 1's request (effect ${a.effectStatus}, act ${a.actStatus})`).toBe(true);
    expect.soft(r.accepted, `ROW-044 after: the admin can still reject member 2's request (effect ${r.effectStatus}, act ${r.actStatus})`).toBe(true);
    expect(await figures(s2, [2027]), 'ROW-044 after: member 2\'s rejected day is no longer pending').toEqual({ 2027: { daysLeft: A2, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-045.control.admin-decides-a-members-request', async () => {
  const A = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    const id = await sendRequest(session, { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-20' });
    const a = await tryConfirmed(team.admin.api, 'approve', id);
    expect(a.accepted, `ROW-045 control: the admin approves a member's request (effect ${a.effectStatus}, act ${a.actStatus})`).toBe(true);
    expect(await awayDays(team.admin, member.id, ['2027-04-19', '2027-04-20']), 'ROW-045 control: both days listed').toEqual(['2027-04-19', '2027-04-20']);
    expect(await figures(session, [2027]), 'ROW-045 control: 2 days counted').toEqual({ 2027: { daysLeft: A - 2, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-045.REQ-009.admin-approves-and-rejects-their-own-request', async () => {
  const A = freshInt(10, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, adminAllowance: A, allowances: [] });
  try {
    const admin = team.admin;
    const first = await sendRequest(admin, { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-20' });
    const second = await sendRequest(admin, { kind: 'vacation', firstDay: '2027-04-21', lastDay: '2027-04-21' });
    const days = ['2027-04-19', '2027-04-20', '2027-04-21'];
    expect(await figures(admin, [2027]), 'ROW-045 before: the admin\'s 3 days are pending').toEqual({ 2027: { daysLeft: A, pending: 3 } });
    expect(await awayDays(admin, admin.me.id, days), 'ROW-045 before: the admin is on no day').toEqual([]);

    const a = await tryConfirmed(admin.api, 'approve', first);
    const r = await tryConfirmed(admin.api, 'reject', second);
    expect.soft(a.accepted, `ROW-045 the admin approves their own request (effect ${a.effectStatus}, act ${a.actStatus})`).toBe(true);
    expect.soft(r.accepted, `ROW-045 the admin rejects their own request (effect ${r.effectStatus}, act ${r.actStatus})`).toBe(true);
    expect.soft(await awayDays(admin, admin.me.id, days), 'ROW-045 after: the approved days are listed for the admin, the rejected day is not').toEqual([
      '2027-04-19',
      '2027-04-20',
    ]);
    expect(await figures(admin, [2027]), 'ROW-045 after: 2 days counted off the admin\'s allowance, nothing pending').toEqual({ 2027: { daysLeft: A - 2, pending: 0 } });
  } finally {
    await team.close();
  }
});
