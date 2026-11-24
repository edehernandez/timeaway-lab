// Purpose: ledger test for ROW-043 (REQ-009 arm 1) — an approved, rejected or cancelled request is never approved or rejected; two decisions, or a person's cancel and a decision, sent at the same moment on one pending request: exactly one takes effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-4); fixture data made through the product's public routes by harness.ts and time-off.ts (reset, accounts, requests, confirmed actions), fresh per run.
//
// ROW-043 promise: REQ-009 fail-if (1) "an approved, rejected or cancelled request is approved or rejected", and
// ROW-043   its text "Only a pending request can be approved or rejected"; the row's own cases: two decisions, or
// ROW-043   a person's cancel and a decision, sent at the same moment on one pending request — exactly one takes
// ROW-043   effect. The cancel of one's own pending request is REQ-005 (A-007); the two-step confirm and its token
// ROW-043   are D-029. A request's state is observed through what D-029 exposes: approved = listed on the calendar
// ROW-043   on its day and counted off the days left; rejected or cancelled = neither, and no longer pending (REQ-007).
// ROW-043 wrong product: the act checks the state only when the effect is read (or not at all), with no atomic
// ROW-043   compare-and-set: an approve and a reject racing both answer 200 and the last write wins; a member's cancel
// ROW-043   racing an approve both succeed; a token read while the request was pending still approves it after a
// ROW-043   rejection or a cancel; an approved request can be rejected afterwards.
// ROW-043 given: a member with a fresh allowance A and one-day vacation requests on distinct future weekdays.
// ROW-043   when: for each of six requests, the admin reads an approve and a reject token while it is pending and
// ROW-043   sends both acts at once; for each of four more, the member's cancel and the admin's approve go at once.
// ROW-043   then: in every pair exactly one answer is 2xx; the winner's effect and only it holds on that request's
// ROW-043   day (listed iff approve won); in total days left = A − (approves that won) and pending = 0.
// ROW-043   A second target case decides or cancels a request first, then tries every further decision — fresh and
// ROW-043   with a token read while pending — and each is refused, the request's effect unchanged.
// ROW-043 controls: the control case approves one pending request and rejects another, each taking effect (listed
// ROW-043   and counted / not listed and not pending): the routes work and the effects are observable, so the
// ROW-043   targets' refusals are about state, not a missing route.
// ROW-043 technique: repeated simultaneous pairs (a race shows up in some of several trials, so the assertion is a
// ROW-043   property over all of them), a stale token as the near miss of a fresh one, and per-request day isolation
// ROW-043   (each request owns one weekday) so the right effect is read on the right item.
// ROW-043 cases: ROW-043 target=ROW-043.REQ-009.simultaneous-decisions-or-cancel-and-decision-exactly-one-takes-effect control=ROW-043.control.pending-request-approve-and-reject-each-take-effect
import { test, expect } from '@playwright/test';
import { approve, readEffect, reject, sendRequest, cancelOwnRequest, type AccountId } from './harness';
import {
  AHEAD_ZONE,
  actRaw,
  awayDays,
  figures,
  freshInt,
  ok,
  startTeam,
  teamInstant,
  tryConfirmed,
  tryOwnCancel,
  weekdaysBetween,
} from './time-off';

const NOW = teamInstant(AHEAD_ZONE, '2027-03-01', '09:00'); // a Monday; every request below is in April 2027
const DAYS = weekdaysBetween('2027-04-05', '2027-04-30');

test('ROW-043.control.pending-request-approve-and-reject-each-take-effect', async () => {
  const A = freshInt(15, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    const [d1, d2] = DAYS;
    const r1 = await sendRequest(session, { kind: 'vacation', firstDay: d1, lastDay: d1 });
    const r2 = await sendRequest(session, { kind: 'vacation', firstDay: d2, lastDay: d2 });
    expect(await figures(session, [2027]), 'ROW-043 control: both requests pending before any decision').toEqual({ 2027: { daysLeft: A, pending: 2 } });

    const a = await tryConfirmed(team.admin.api, 'approve', r1);
    const r = await tryConfirmed(team.admin.api, 'reject', r2);
    expect(a.accepted, `ROW-043 control: the admin approves a pending request (effect ${a.effectStatus}, act ${a.actStatus})`).toBe(true);
    expect(r.accepted, `ROW-043 control: the admin rejects a pending request (effect ${r.effectStatus}, act ${r.actStatus})`).toBe(true);
    expect(await awayDays(team.admin, member.id, [d1, d2]), 'ROW-043 control: the approved day is listed, the rejected day is not').toEqual([d1]);
    expect(await figures(session, [2027]), 'ROW-043 control: one day counted, nothing pending').toEqual({ 2027: { daysLeft: A - 1, pending: 0 } });
  } finally {
    await team.close();
  }
});

test('ROW-043.REQ-009.simultaneous-decisions-or-cancel-and-decision-exactly-one-takes-effect', async () => {
  const A = freshInt(15, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    const outcomes: { day: string; approved: boolean }[] = [];

    // Two decisions at the same moment.
    for (let i = 0; i < 6; i += 1) {
      const day = DAYS[i];
      const id = await sendRequest(session, { kind: 'vacation', firstDay: day, lastDay: day });
      const tApprove = await readEffect(team.admin, 'approve', id);
      const tReject = await readEffect(team.admin, 'reject', id);
      const [sa, sr] = await Promise.all([
        actRaw(team.admin.api, 'approve', id, tApprove.token),
        actRaw(team.admin.api, 'reject', id, tReject.token),
      ]);
      const taken = [ok(sa), ok(sr)].filter(Boolean).length;
      expect.soft(taken, `ROW-043 ${day}: approve (${sa}) and reject (${sr}) sent at once — exactly one takes effect`).toBe(1);
      outcomes.push({ day, approved: ok(sa) && !ok(sr) });
    }

    // A person's cancel and a decision at the same moment.
    for (let i = 6; i < 10; i += 1) {
      const day = DAYS[i];
      const id = await sendRequest(session, { kind: 'vacation', firstDay: day, lastDay: day });
      const tApprove = await readEffect(team.admin, 'approve', id);
      const [sc, sa] = await Promise.all([tryOwnCancel(session.api, id), actRaw(team.admin.api, 'approve', id, tApprove.token)]);
      const taken = [ok(sc), ok(sa)].filter(Boolean).length;
      expect.soft(taken, `ROW-043 ${day}: the member's cancel (${sc}) and the admin's approve (${sa}) sent at once — exactly one takes effect`).toBe(1);
      outcomes.push({ day, approved: ok(sa) && !ok(sc) });
    }

    // The winner's effect, and only it, on each request's own day.
    const listed = await awayDays(team.admin, member.id, outcomes.map((o) => o.day));
    expect.soft(listed, 'ROW-043: exactly the days whose approve won are on the calendar').toEqual(outcomes.filter((o) => o.approved).map((o) => o.day));
    const approvedCount = outcomes.filter((o) => o.approved).length;
    expect(await figures(session, [2027]), 'ROW-043: days left counts exactly the approves that won, and nothing is left pending').toEqual({
      2027: { daysLeft: A - approvedCount, pending: 0 },
    });
  } finally {
    await team.close();
  }
});

test('ROW-043.REQ-009.decided-or-cancelled-request-is-never-decided-again', async () => {
  const A = freshInt(15, 30);
  const team = await startTeam({ timeZone: AHEAD_ZONE, now: NOW, allowances: [A] });
  try {
    const [member] = team.members;
    const [session] = team.sessions;
    const [dA, dB, dC] = DAYS;
    const send = (d: string) => sendRequest(session, { kind: 'vacation', firstDay: d, lastDay: d });
    const rA: AccountId = await send(dA);
    const rB: AccountId = await send(dB);
    const rC: AccountId = await send(dC);

    // Tokens read while every request is still pending (the stale near misses).
    const staleRejectA = (await readEffect(team.admin, 'reject', rA)).token;
    const staleApproveB = (await readEffect(team.admin, 'approve', rB)).token;
    const staleApproveC = (await readEffect(team.admin, 'approve', rC)).token;
    const staleRejectC = (await readEffect(team.admin, 'reject', rC)).token;

    await approve(team.admin, rA);
    await reject(team.admin, rB);
    await cancelOwnRequest(session, rC);
    expect(await awayDays(team.admin, member.id, [dA, dB, dC]), 'ROW-043 before: only the approved request is listed').toEqual([dA]);
    expect(await figures(session, [2027]), 'ROW-043 before: one day counted, nothing pending').toEqual({ 2027: { daysLeft: A - 1, pending: 0 } });

    const fresh = async (action: 'approve' | 'reject', id: AccountId, label: string) => {
      const t = await tryConfirmed(team.admin.api, action, id);
      expect.soft(t.accepted, `ROW-043 ${label}: a fresh ${action} is refused (effect ${t.effectStatus}, act ${t.actStatus})`).toBe(false);
    };
    const stale = async (action: 'approve' | 'reject', id: AccountId, token: string, label: string) => {
      const s = await actRaw(team.admin.api, action, id, token);
      expect.soft(ok(s), `ROW-043 ${label}: a ${action} with the token read while pending is refused (${s})`).toBe(false);
    };

    await fresh('reject', rA, 'approved request');
    await fresh('approve', rA, 'approved request');
    await stale('reject', rA, staleRejectA, 'approved request');
    await fresh('approve', rB, 'rejected request');
    await fresh('reject', rB, 'rejected request');
    await stale('approve', rB, staleApproveB, 'rejected request');
    await fresh('approve', rC, 'cancelled request');
    await fresh('reject', rC, 'cancelled request');
    await stale('approve', rC, staleApproveC, 'cancelled request');
    await stale('reject', rC, staleRejectC, 'cancelled request');

    expect.soft(await awayDays(team.admin, member.id, [dA, dB, dC]), 'ROW-043 after: still only the approved request is listed').toEqual([dA]);
    expect(await figures(session, [2027]), 'ROW-043 after: still one day counted and nothing pending').toEqual({ 2027: { daysLeft: A - 1, pending: 0 } });
  } finally {
    await team.close();
  }
});
