// Purpose: ledger tests for ROW-012, ROW-013, ROW-014 and ROW-243 (REQ-003) — a person never holds two pending or approved requests sharing a weekday in effect, while rejected, cancelled and partly cancelled days, other people's requests and shared weekend days never block a request.
// Provenance: hand-authored (test-author pass, slice 0, request rules batch); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, accounts, requests, approve, reject, both cancels, the test clock), fresh per run.
import { test, expect } from '@playwright/test';
import { adminCancel, approve, cancelOwnRequest, reject, sendRequest, type AccountId } from './harness';
import {
  addDays,
  day,
  describe,
  isAcceptance,
  isRuleRefusal,
  moveClock,
  onOrAfter,
  ownRequests,
  pickYear,
  setupTeam,
  teamAt,
  trySend,
  weekdaysIn,
  yearBalance,
  type Answer,
  type Team,
} from './request-rules';

// A year fresh per run; today is a Wednesday in early March of it, 09:00 in the team zone (UTC+14).
const Y = pickYear();
const TODAY = onOrAfter(day(Y, 3, 2), 3);
const NOW = teamAt(TODAY);
const W1 = onOrAfter(addDays(TODAY, 7), 1); // a Monday
const W2 = addDays(W1, 7); // the Monday after

// ROW-012 promise: REQ-003 fail-if (1) "a person ends up with two pending or approved requests that share a day in
// ROW-012   effect"; REQ-003 "whatever the kinds of the two requests"; A-014.
// ROW-012 wrong product: an overlap check that compares only same-kind requests, only pending ones, or only the first
// ROW-012   day; or one with an off-by-one at the range ends (a request ending on another's first day passes).
// ROW-012 given: a member holding E1, a pending vacation Wednesday to Friday of one week, and E2, an approved sick
// ROW-012   request Monday to Tuesday of the next. when: they send a sick day inside E1; a vacation from E1's Friday to
// ROW-012   E2's Monday; a vacation ending on E1's first day; a sick request starting on E2's last day; and a vacation
// ROW-012   from the Sunday before E1 to the Saturday after E2. then: each is refused with a rule's refusal; afterwards
// ROW-012   the member's list holds exactly E1 pending and E2 approved, no two of them share a weekday, and the year's
// ROW-012   pending days are still E1's 3.
// ROW-012 controls: the control case sends the near misses — Monday to Tuesday ending the day before E1, and the
// ROW-012   Wednesday after E2 — and both are accepted, so the target's refusals are about the shared days.
// ROW-012 technique: each range end exactly on the other's end (thresholds), both kinds against both states; the
// ROW-012   whole list after, checked by the oracle for any shared weekday.
// ROW-012 cases: ROW-012 target=ROW-012.REQ-003.no-two-pending-or-approved-requests-of-a-person-share-a-weekday control=ROW-012.control.adjacent-days-are-accepted
async function holdE1E2(team: Team) {
  const [p] = team.people;
  const e1 = { kind: 'vacation' as const, firstDay: addDays(W1, 2), lastDay: addDays(W1, 4) };
  const e2 = { kind: 'sick' as const, firstDay: W2, lastDay: addDays(W2, 1) };
  const e1Id = await sendRequest(p, e1);
  const e2Id = await sendRequest(p, e2);
  await approve(team.admin, e2Id);
  return { e1, e2, e1Id, e2Id };
}

test('ROW-012.control.adjacent-days-are-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [30] });
  const [p] = team.people;
  try {
    await holdE1E2(team);
    const before = await trySend(p, { kind: 'vacation', firstDay: W1, lastDay: addDays(W1, 1) });
    const after = await trySend(p, { kind: 'sick', firstDay: addDays(W2, 2), lastDay: addDays(W2, 2) });
    expect.soft(isAcceptance(before), `ROW-012 control: the two days before E1 are accepted (got ${describe(before)})`).toBe(true);
    expect.soft(isAcceptance(after), `ROW-012 control: the day after E2 is accepted (got ${describe(after)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-012.REQ-003.no-two-pending-or-approved-requests-of-a-person-share-a-weekday', async () => {
  const team = await setupTeam({ now: NOW, allowances: [30] });
  const [p] = team.people;
  try {
    const { e1, e1Id, e2Id } = await holdE1E2(team);
    const attempts = [
      { label: 'a sick day inside E1', body: { kind: 'sick', firstDay: addDays(W1, 3), lastDay: addDays(W1, 3) } },
      { label: "E1's Friday to E2's Monday", body: { kind: 'vacation', firstDay: addDays(W1, 4), lastDay: W2 } },
      { label: "a vacation ending on E1's first day", body: { kind: 'vacation', firstDay: W1, lastDay: addDays(W1, 2) } },
      { label: "a sick request starting on E2's last day", body: { kind: 'sick', firstDay: addDays(W2, 1), lastDay: addDays(W2, 3) } },
      { label: 'a vacation enclosing E1 and E2', body: { kind: 'vacation', firstDay: addDays(W1, -1), lastDay: addDays(W2, 5) } },
    ];
    for (const a of attempts) {
      const ans = await trySend(p, a.body);
      expect.soft(isRuleRefusal(ans), `ROW-012: ${a.label} is refused (got ${describe(ans)})`).toBe(true);
    }
    const listed = await ownRequests(p);
    expect
      .soft(listed.map((r) => `${r.id}:${r.state}`).sort(), 'ROW-012: the list holds exactly E1 pending and E2 approved')
      .toEqual([`${e1Id}:pending`, `${e2Id}:approved`].sort());
    const days = new Map<string, number>();
    for (const r of listed.filter((x) => x.state === 'pending' || x.state === 'approved')) {
      if (typeof r.firstDay !== 'string' || typeof r.lastDay !== 'string') continue;
      for (const d of weekdaysIn(r.firstDay, r.lastDay)) days.set(d, (days.get(d) ?? 0) + 1);
    }
    expect.soft([...days].filter(([, n]) => n > 1).map(([d]) => d), 'ROW-012: no weekday is held twice').toEqual([]);
    expect.soft((await yearBalance(p, Y)).pending, "ROW-012: the pending days are still E1's 3").toBe(weekdaysIn(e1.firstDay, e1.lastDay).length);
  } finally {
    await team.dispose();
  }
});

// ROW-013 promise: REQ-003 fail-if (2) "a request is refused because it shares a day only with the person's own
// ROW-013   rejected or cancelled request, or with the cancelled days of a partly cancelled one"; REQ-003 "the days of a
// ROW-013   partly cancelled approved request from its cancel day on are not in effect"; A-030, A-007.
// ROW-013 wrong product: an overlap check over every request whatever its state, or over a partly cancelled request's
// ROW-013   whole range as sent (its first and last day kept by REQ-017) instead of its days in effect.
// ROW-013 given: today a Wednesday; a member's R1 rejected, R2 cancelled by the member, R3 approved then cancelled
// ROW-013   whole by the admin (no day before today), all on later weeks; R4 approved Thursday to next Wednesday, then
// ROW-013   the clock moved to the Monday and R4 cancelled by the admin — in effect Thursday and Friday, cancelled from
// ROW-013   Monday on. when: the member sends a vacation on R1's days, a sick request on R2's, a vacation on R3's, and a
// ROW-013   vacation on R4's cancelled Monday to Wednesday. then: all four are accepted and listed pending.
// ROW-013 controls: the control case builds the same requests and shows the overlap rule is live on them: a sick day
// ROW-013   on R1's days is refused while R1 is still pending, and after the partial cancel a sick day on R4's Friday,
// ROW-013   still in effect, is refused.
// ROW-013 technique: one request per freeing path (reject, own cancel, whole admin cancel, partial admin cancel), each
// ROW-013   probed on exactly its freed days; the test clock moved, never the machine's.
// ROW-013 cases: ROW-013 target=ROW-013.REQ-003.rejected-cancelled-and-cancelled-days-never-block-a-new-request control=ROW-013.control.pending-and-in-effect-days-still-block
function rows013() {
  const r1 = { kind: 'vacation' as const, firstDay: addDays(TODAY, 12), lastDay: addDays(TODAY, 14) };
  const r2 = { kind: 'vacation' as const, firstDay: addDays(TODAY, 19), lastDay: addDays(TODAY, 21) };
  const r3 = { kind: 'vacation' as const, firstDay: addDays(TODAY, 26), lastDay: addDays(TODAY, 28) };
  const r4 = { kind: 'vacation' as const, firstDay: addDays(TODAY, 1), lastDay: addDays(TODAY, 7) };
  const monday = addDays(TODAY, 5);
  return { r1, r2, r3, r4, monday };
}

async function buildFreed(team: Team, whileR1Pending?: () => Promise<void>) {
  const [p] = team.people;
  const { r1, r2, r3, r4, monday } = rows013();
  const r1Id = await sendRequest(p, r1);
  if (whileR1Pending) await whileR1Pending();
  const r2Id = await sendRequest(p, r2);
  const r3Id = await sendRequest(p, r3);
  const r4Id = await sendRequest(p, r4);
  await reject(team.admin, r1Id);
  await cancelOwnRequest(p, r2Id);
  await approve(team.admin, r3Id);
  await adminCancel(team.admin, r3Id);
  await approve(team.admin, r4Id);
  await moveClock(team, teamAt(monday));
  await adminCancel(team.admin, r4Id);
}

test('ROW-013.control.pending-and-in-effect-days-still-block', async () => {
  const team = await setupTeam({ now: NOW, allowances: [30] });
  const [p] = team.people;
  const { r1, r4 } = rows013();
  try {
    let whilePending: Answer | undefined;
    await buildFreed(team, async () => {
      whilePending = await trySend(p, { kind: 'sick', firstDay: addDays(r1.firstDay, 1), lastDay: addDays(r1.firstDay, 1) });
    });
    expect
      .soft(whilePending !== undefined && isRuleRefusal(whilePending), `ROW-013 control: a day of pending R1 is refused (got ${whilePending ? describe(whilePending) : 'nothing'})`)
      .toBe(true);
    const friday = addDays(r4.firstDay, 1);
    const inEffect = await trySend(p, { kind: 'sick', firstDay: friday, lastDay: friday });
    expect.soft(isRuleRefusal(inEffect), `ROW-013 control: R4's Friday, still in effect, is refused (got ${describe(inEffect)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-013.REQ-003.rejected-cancelled-and-cancelled-days-never-block-a-new-request', async () => {
  const team = await setupTeam({ now: NOW, allowances: [30] });
  const [p] = team.people;
  const { r1, r2, r3, r4, monday } = rows013();
  try {
    await buildFreed(team);
    const probes = [
      { label: "a vacation on rejected R1's days", body: { kind: 'vacation', firstDay: r1.firstDay, lastDay: r1.lastDay } },
      { label: "a sick request on cancelled R2's days", body: { kind: 'sick', firstDay: r2.firstDay, lastDay: r2.lastDay } },
      { label: "a vacation on admin-cancelled R3's days", body: { kind: 'vacation', firstDay: r3.firstDay, lastDay: r3.lastDay } },
      { label: "a vacation on R4's cancelled Monday to Wednesday", body: { kind: 'vacation', firstDay: monday, lastDay: r4.lastDay } },
    ];
    const ids: AccountId[] = [];
    for (const pr of probes) {
      const a = await trySend(p, pr.body);
      expect.soft(isAcceptance(a), `ROW-013: ${pr.label} is accepted (got ${describe(a)})`).toBe(true);
      if (a.id !== undefined) ids.push(a.id);
    }
    const listed = await ownRequests(p);
    const states = ids.map((id) => listed.find((r) => String(r.id) === String(id))?.state);
    expect.soft(states, 'ROW-013: the four new requests are listed pending').toEqual(['pending', 'pending', 'pending', 'pending']);
  } finally {
    await team.dispose();
  }
});

// ROW-014 promise: REQ-003 fail-if (3) "a request is refused because it shares a day with another person's request";
// ROW-014   REQ-003 and A-014 speak of "the same person's" requests only.
// ROW-014 wrong product: an overlap check that forgets the person (every request in the team blocks the day) — a
// ROW-014   "one person off at a time" rule nobody asked for.
// ROW-014 given: member A holding an approved vacation Thursday to Friday and a pending sick Monday after; member B
// ROW-014   and the admin with nothing. when: B sends a vacation Thursday to Monday (every day of A's), and the admin a
// ROW-014   sick request Friday to Monday. then: both are accepted and listed pending on their own lists, B's pending
// ROW-014   days are the 3 weekdays.
// ROW-014 controls: the control case has A send a day already its own and it is refused — the overlap rule is live
// ROW-014   on these days, so the target's acceptances are about the other person.
// ROW-014 technique: the neighbouring entity — the same days, a different person; two different others (a member, the
// ROW-014   admin).
// ROW-014 cases: ROW-014 target=ROW-014.REQ-003.another-persons-request-never-blocks-a-day control=ROW-014.control.the-persons-own-day-is-refused
async function holdA(team: Team) {
  const [a] = team.people;
  const thu = onOrAfter(addDays(TODAY, 7), 4);
  const approvedId = await sendRequest(a, { kind: 'vacation', firstDay: thu, lastDay: addDays(thu, 1) });
  await approve(team.admin, approvedId);
  await sendRequest(a, { kind: 'sick', firstDay: addDays(thu, 4), lastDay: addDays(thu, 4) });
  return thu;
}

test('ROW-014.control.the-persons-own-day-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25] });
  const [a] = team.people;
  try {
    const thu = await holdA(team);
    const ans = await trySend(a, { kind: 'sick', firstDay: addDays(thu, 1), lastDay: addDays(thu, 1) });
    expect(isRuleRefusal(ans), `ROW-014 control: A's own Friday again is refused (got ${describe(ans)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-014.REQ-003.another-persons-request-never-blocks-a-day', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25, 25] });
  const [, b] = team.people;
  try {
    const thu = await holdA(team);
    const bAns = await trySend(b, { kind: 'vacation', firstDay: thu, lastDay: addDays(thu, 4) });
    const adminAns = await trySend(team.admin, { kind: 'sick', firstDay: addDays(thu, 1), lastDay: addDays(thu, 4) });
    expect.soft(isAcceptance(bAns), `ROW-014: B's request on A's days is accepted (got ${describe(bAns)})`).toBe(true);
    expect.soft(isAcceptance(adminAns), `ROW-014: the admin's request on A's days is accepted (got ${describe(adminAns)})`).toBe(true);
    expect.soft((await ownRequests(b)).map((r) => r.state), "ROW-014: B's request is listed pending").toEqual(['pending']);
    expect.soft((await ownRequests(team.admin)).map((r) => r.state), "ROW-014: the admin's request is listed pending").toEqual(['pending']);
    expect.soft((await yearBalance(b, Y)).pending, "ROW-014: B's 3 weekdays are pending").toBe(3);
  } finally {
    await team.dispose();
  }
});

// ROW-243 promise: REQ-003 refuses a request sharing "a day" of a request; REQ-001 "only the Monday to Friday days in
// ROW-243   the range are counted as requested days" and A-017 (weekends ignored) — so sharing only a Saturday or Sunday
// ROW-243   with the person's own pending or approved request is no shared day; the row's own statement.
// ROW-243 wrong product: an overlap check on the raw date ranges as sent (first to last day), which sees the shared
// ROW-243   weekend and refuses.
// ROW-243 given: a member holding E1, a pending vacation Friday to Sunday (1 weekday), and E2, an approved vacation
// ROW-243   Thursday to Saturday of the next week (2 weekdays). when: they send a vacation Saturday to Monday (shares
// ROW-243   only E1's Saturday and Sunday) and a sick request Saturday to Tuesday (shares only E2's Saturday). then: both
// ROW-243   are accepted and listed pending; the year's pending vacation days are E1's 1 + the new Monday's 1.
// ROW-243 controls: the control case sends Friday to Monday — the near miss, sharing E1's Friday — and it is refused,
// ROW-243   so the overlap rule is live on these ranges.
// ROW-243 technique: near miss (one shared weekday added); both states (pending, approved) as the existing request.
// ROW-243 cases: ROW-243 target=ROW-243.REQ-003.sharing-only-a-weekend-day-is-accepted control=ROW-243.control.sharing-a-Friday-is-refused
async function holdWeekendEnds(team: Team) {
  const [p] = team.people;
  const fri = onOrAfter(addDays(TODAY, 7), 5);
  await sendRequest(p, { kind: 'vacation', firstDay: fri, lastDay: addDays(fri, 2) });
  const thu = addDays(fri, 6);
  const e2 = await sendRequest(p, { kind: 'vacation', firstDay: thu, lastDay: addDays(thu, 2) });
  await approve(team.admin, e2);
  return { fri, thu };
}

test('ROW-243.control.sharing-a-Friday-is-refused', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const { fri } = await holdWeekendEnds(team);
    const ans = await trySend(p, { kind: 'vacation', firstDay: fri, lastDay: addDays(fri, 3) });
    expect(isRuleRefusal(ans), `ROW-243 control: Friday to Monday, sharing E1's Friday, is refused (got ${describe(ans)})`).toBe(true);
  } finally {
    await team.dispose();
  }
});

test('ROW-243.REQ-003.sharing-only-a-weekend-day-is-accepted', async () => {
  const team = await setupTeam({ now: NOW, allowances: [25] });
  const [p] = team.people;
  try {
    const { fri, thu } = await holdWeekendEnds(team);
    const a = await trySend(p, { kind: 'vacation', firstDay: addDays(fri, 1), lastDay: addDays(fri, 3) });
    const b = await trySend(p, { kind: 'sick', firstDay: addDays(thu, 2), lastDay: addDays(thu, 5) });
    expect.soft(isAcceptance(a), `ROW-243: Saturday to Monday, sharing only E1's weekend, is accepted (got ${describe(a)})`).toBe(true);
    expect.soft(isAcceptance(b), `ROW-243: Saturday to Tuesday, sharing only E2's Saturday, is accepted (got ${describe(b)})`).toBe(true);
    const listed = await ownRequests(p);
    const states = [a.id, b.id].map((id) => listed.find((r) => String(r.id) === String(id))?.state);
    expect.soft(states, 'ROW-243: both are listed pending').toEqual(['pending', 'pending']);
    expect.soft((await yearBalance(p, Y)).pending, "ROW-243: pending vacation is E1's 1 plus the Monday").toBe(2);
  } finally {
    await team.dispose();
  }
});
