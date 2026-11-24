// Purpose: ledger tests for ROW-001, ROW-005 and ROW-006 (REQ-001) — a request's kind is vacation or sick only, a new request starts pending, and a request is only ever created for the signed-in sender.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, approval), fresh per run.
import { test, expect } from '@playwright/test';
import { sendRequest } from './harness';
import {
  addDays,
  countWeekdays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  onOrAfter,
  ownRequest,
  ownRequests,
  pickYear,
  randomInt,
  setupTeam,
  teamAt,
  trySend,
  weekdaySpan,
  yearBalance,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14), the day before in UTC.
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);

// ROW-001 promise: REQ-001 fail-if (1) "a request is created with a kind other than vacation or sick" (A-017's
// ROW-001   kinds; REQ-001's text: "with a kind, vacation or sick").
// ROW-001 wrong product: one that stores whatever kind string arrives, or matches the kind loosely (a substring or
// ROW-001   prefix test that lets "vacations", "sickness" or "sick-leave" through), or defaults a missing or null kind.
// ROW-001 given: a fresh member with no request, today a Wednesday in a fresh year; each attempt on its own future
// ROW-001   week, so no other rule (overlap, balance, window) can be what refuses it. when: the member sends a request
// ROW-001   with each of ten wrong kinds — near misses ("vacations", "sickness", "sick-leave"), other words, empty,
// ROW-001   null, a number, an array, an object — and one with no kind at all. then: each is refused with a rule's
// ROW-001   refusal, and afterwards GET /api/requests lists no request and the year's pending days are still 0.
// ROW-001 controls: the control case sends "vacation" and "sick" on the same kind of weeks and both are accepted
// ROW-001   and listed with their kind — the send path works and the target's refusals are about the kind.
// ROW-001 technique: decoys — near-miss spellings beside the two right words; the store read after every attempt
// ROW-001   (the list must be empty), not only the status.
// ROW-001 cases: ROW-001 target=ROW-001.REQ-001.a-kind-other-than-vacation-or-sick-is-never-created control=ROW-001.control.vacation-and-sick-are-accepted-and-listed-with-their-kind
test('ROW-001.control.vacation-and-sick-are-accepted-and-listed-with-their-kind', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const vac = weekdaySpan(addDays(TODAY, 7), 2);
    const sick = weekdaySpan(addDays(TODAY, 14), 2);
    const a = await trySend(p, { kind: 'vacation', ...vac });
    const b = await trySend(p, { kind: 'sick', ...sick });
    expect.soft(isAcceptance(a), `ROW-001 control: vacation is accepted (got ${describe(a)})`).toBe(true);
    expect.soft(isAcceptance(b), `ROW-001 control: sick is accepted (got ${describe(b)})`).toBe(true);
    const listed = await ownRequests(p);
    expect(listed.map((r) => r.kind).sort(), 'ROW-001 control: both are listed with their kind').toEqual(['sick', 'vacation']);
  } finally {
    await team.dispose();
  }
});

test('ROW-001.REQ-001.a-kind-other-than-vacation-or-sick-is-never-created', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    expect(await ownRequests(p), 'ROW-001: the member starts with no request').toEqual([]);
    const wrongKinds: unknown[] = ['vacations', 'sickness', 'sick-leave', 'holiday', 'other', '', null, 42, ['vacation'], { kind: 'sick' }];
    let start = addDays(TODAY, 7);
    for (const kind of wrongKinds) {
      const span = weekdaySpan(start, 2);
      start = addDays(span.lastDay, 5);
      const a = await trySend(p, { kind, ...span });
      expect.soft(isRuleRefusal(a), `ROW-001: kind ${JSON.stringify(kind)} is refused (got ${describe(a)})`).toBe(true);
    }
    const span = weekdaySpan(start, 2);
    const noKind = await trySend(p, { ...span });
    expect.soft(isRuleRefusal(noKind), `ROW-001: a request with no kind is refused (got ${describe(noKind)})`).toBe(true);

    const stored = await ownRequests(p);
    expect.soft(stored.map((r) => ({ id: r.id, kind: r.kind })), 'ROW-001: no request was created').toEqual([]);
    expect.soft((await yearBalance(p, Y)).pending, 'ROW-001: no pending day was counted').toBe(0);
  } finally {
    await team.dispose();
  }
});

// ROW-005 promise: REQ-001 fail-if (5) "a new request starts in any state other than pending" (REQ-001: "the new
// ROW-005   request starts pending"; A-002: days left counts approved days, pending days beside it).
// ROW-005 wrong product: one that approves sick requests at once ("sick needs no approval"), or approves the admin's
// ROW-005   own requests at once since the admin is the approver, or stores a new request with no state or "approved".
// ROW-005 given: a fresh member with a fresh allowance and the admin, no request yet. when: the member sends a
// ROW-005   vacation and a sick request, and the admin sends a vacation request of their own. then: each is listed
// ROW-005   on its sender's GET /api/requests with state exactly "pending" (absent before), and each sender's days
// ROW-005   left for the year is unchanged while its pending days equal the vacation's counted days.
// ROW-005 controls: the control case shows a sent request is listed with the kind and days it was sent with, so
// ROW-005   the state read in the target is about this request.
// ROW-005 technique: before and after on the store; three senders and kinds (the plausible faults are by kind and by
// ROW-005   sender); the days-left figure as a second observer of "not approved".
// ROW-005 cases: ROW-005 target=ROW-005.REQ-001.a-new-request-starts-pending-whatever-its-kind-or-sender control=ROW-005.control.a-sent-request-is-listed-with-its-kind-and-days
test('ROW-005.control.a-sent-request-is-listed-with-its-kind-and-days', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const span = weekdaySpan(addDays(TODAY, 7), 3);
    const id = await sendRequest(p, { kind: 'vacation', ...span });
    const r = await ownRequest(p, id);
    expect(r, 'ROW-005 control: the sent request is listed').toBeDefined();
    expect({ kind: r?.kind, firstDay: r?.firstDay, lastDay: r?.lastDay }, 'ROW-005 control: with its kind and days').toEqual({
      kind: 'vacation',
      ...span,
    });
  } finally {
    await team.dispose();
  }
});

test('ROW-005.REQ-001.a-new-request-starts-pending-whatever-its-kind-or-sender', async () => {
  const allowance = randomInt(14, 30);
  const team = await setupTeam({ now: NOW, allowances: [allowance], adminAllowance: 25 });
  const [p] = team.people;
  const admin = team.admin;
  try {
    const vac = weekdaySpan(addDays(TODAY, 7), randomInt(2, 4));
    const sick = weekdaySpan(addDays(TODAY, 21), 2);
    const adminVac = weekdaySpan(addDays(TODAY, 28), 3);
    expect(await ownRequests(p), 'ROW-005: the member has no request before').toEqual([]);
    expect(await ownRequests(admin), 'ROW-005: the admin has no request before').toEqual([]);
    const pBefore = await yearBalance(p, Y);
    const aBefore = await yearBalance(admin, Y);

    const vacId = await sendRequest(p, { kind: 'vacation', ...vac });
    const sickId = await sendRequest(p, { kind: 'sick', ...sick });
    const adminId = await sendRequest(admin, { kind: 'vacation', ...adminVac });

    expect.soft((await ownRequest(p, vacId))?.state, "ROW-005: the member's vacation starts pending").toBe('pending');
    expect.soft((await ownRequest(p, sickId))?.state, "ROW-005: the member's sick request starts pending").toBe('pending');
    expect.soft((await ownRequest(admin, adminId))?.state, "ROW-005: the admin's own request starts pending").toBe('pending');

    const pAfter = await yearBalance(p, Y);
    const aAfter = await yearBalance(admin, Y);
    expect.soft(pAfter, "ROW-005: the member's days left are unchanged; the vacation's days are pending").toEqual({
      daysLeft: pBefore.daysLeft,
      pending: pBefore.pending + countWeekdays(vac.firstDay, vac.lastDay),
    });
    expect.soft(aAfter, "ROW-005: the admin's days left are unchanged; the vacation's days are pending").toEqual({
      daysLeft: aBefore.daysLeft,
      pending: aBefore.pending + countWeekdays(adminVac.firstDay, adminVac.lastDay),
    });
  } finally {
    await team.dispose();
  }
});

// ROW-006 promise: REQ-001 fail-if (6) "a request is created for any person other than the signed-in sender, whatever
// ROW-006   the sender sends"; REQ-001 "nobody, the admin included, sends a request for another person"; A-026.
// ROW-006 wrong product: a send route that takes the person from the body or the query when one is given (personId,
// ROW-006   accountId, userId, memberId, email …) instead of from the session — the admin-can-file-for-others shortcut.
// ROW-006 given: two fresh members, A and B, B with no request; the admin. when: A sends requests whose body and
// ROW-006   query name B in every plausible field (B's id, email and name), as vacation and as sick; the admin sends
// ROW-006   one naming B the same way. then: B's own GET /api/requests still lists nothing and B's pending days are
// ROW-006   still 0; every send that was accepted is listed on its sender's own requests.
// ROW-006 controls: the control case has B send a request of its own and finds it on B's list — B's read shows a
// ROW-006   request created for B, so the target's empty list means none was.
// ROW-006 technique: the neighbouring entity that must stay untouched (B), read through B's own session; every field
// ROW-006   name a wrong product might honour, at once, so one honoured name is enough to fail.
// ROW-006 cases: ROW-006 target=ROW-006.REQ-001.no-sender-creates-a-request-for-another-person control=ROW-006.control.a-request-B-sends-is-listed-for-B
test('ROW-006.control.a-request-B-sends-is-listed-for-B', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25] });
  const [, b] = team.people;
  try {
    const span = weekdaySpan(addDays(TODAY, 7), 2);
    const id = await sendRequest(b, { kind: 'vacation', ...span });
    expect((await ownRequests(b)).map((r) => String(r.id)), "ROW-006 control: B's own request is on B's list").toEqual([String(id)]);
  } finally {
    await team.dispose();
  }
});

test('ROW-006.REQ-001.no-sender-creates-a-request-for-another-person', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25] });
  const [a, b] = team.people;
  const [, bAccount] = team.members;
  const admin = team.admin;
  try {
    expect(await ownRequests(b), 'ROW-006: B has no request before').toEqual([]);
    const naming = {
      personId: bAccount.id,
      person_id: bAccount.id,
      person: bAccount.id,
      accountId: bAccount.id,
      account_id: bAccount.id,
      account: bAccount.id,
      userId: bAccount.id,
      memberId: bAccount.id,
      ownerId: bAccount.id,
      forAccountId: bAccount.id,
      email: bAccount.email,
      name: bAccount.name,
    };
    const query = `?personId=${encodeURIComponent(String(bAccount.id))}&accountId=${encodeURIComponent(String(bAccount.id))}`;
    const sends = [
      { by: a, label: 'A, vacation, B named in the body', body: { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 7), 2), ...naming }, query: '' },
      { by: a, label: 'A, sick, B named in the body', body: { kind: 'sick', ...weekdaySpan(addDays(TODAY, 14), 2), ...naming }, query: '' },
      { by: a, label: 'A, vacation, B named in the query', body: { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 21), 2) }, query },
      { by: admin, label: 'the admin, vacation, B named in body and query', body: { kind: 'vacation', ...weekdaySpan(addDays(TODAY, 28), 2), ...naming }, query },
    ];
    const accepted: { by: typeof a; id: unknown; label: string }[] = [];
    for (const s of sends) {
      const ans = await trySend(s.by, s.body, s.query);
      if (isAcceptance(ans)) accepted.push({ by: s.by, id: ans.id, label: s.label });
    }

    expect.soft((await ownRequests(b)).map((r) => r.id), "ROW-006: B's own list is still empty").toEqual([]);
    expect.soft((await yearBalance(b, Y)).pending, "ROW-006: B's pending days are still 0").toBe(0);
    const misplaced: string[] = [];
    for (const x of accepted) {
      const mine = (await ownRequests(x.by)).map((r) => String(r.id));
      if (!mine.includes(String(x.id))) misplaced.push(x.label);
    }
    expect.soft(misplaced, "ROW-006: every accepted send is the sender's own request").toEqual([]);
  } finally {
    await team.dispose();
  }
});
