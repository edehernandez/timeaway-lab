// Purpose: ledger tests for ROW-196 and ROW-197 (REQ-016, REQ-019, REQ-017) — switching an account off never rewrites an approved request with no weekday from today on, and records the admin and the switch-off time as the canceller of what it cancels; switching off cancels a future approved weekday.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, switch off), fresh per run; the team clock moved through the harness (setClock) in Pacific/Auckland to a Saturday whose UTC date is the Friday before.
//
// ROW-196 promise: REQ-016 "switching off cancels the account's pending requests and the days from today on of
// ROW-196   its approved requests …, while its days before today stay"; REQ-019 "when the admin … switches off its
// ROW-196   account, the request stays approved with its days in effect ending the day before the cancel, keeps
// ROW-196   its first and last day as sent, and records the cancel day and who cancelled"; REQ-017 fail-if (4) "a
// ROW-196   decision or cancel does not record who and when"; D-020 (a whole cancel records no cancel day).
// ROW-196   Authority: A-022, A-030, A-033.
// ROW-196 wrong product: a switch-off that walks every approved request of the account and stamps it — a
// ROW-196   past-only request gets a canceller and a cancel day; a request whose only days from today on are a
// ROW-196   weekend (Thu..Sun, today Saturday) is "partly cancelled" from the Saturday; or one that records the
// ROW-196   account owner (the own-cancel path) or nobody as the canceller of the pending request, or no time, or
// ROW-196   the approval's time.
// ROW-196 given: team today Sat 2027-03-13 (UTC Fri 03-12); P1 holds, approved at Mon 03-01, a past vacation
// ROW-196   03-02..03, a vacation 03-11..14 (its weekdays all before today), a future vacation 04-05..06, and a
// ROW-196   pending sick 04-19..20; P2 holds an approved vacation 03-08..19. when: the admin switches P1 and P2
// ROW-196   off. then: the two requests with no weekday from today on read exactly as before (state, days,
// ROW-196   decider, no cancel record); the future vacation and the pending sick read cancelled, the canceller
// ROW-196   the admin, the time the switch-off's; P2's vacation stays approved, cancel day Mon 03-15, canceller
// ROW-196   the admin at the switch-off's time, first and last day as sent.
// ROW-196 controls: ROW-197's case — the switch-off cancels a future approved weekday — so the action ran;
// ROW-196   before the switch-off each request reads approved or pending with no cancel record.
// ROW-196 technique: the clock's origin at the boundary (a Saturday, UTC's Friday; a request whose remaining
// ROW-196   days are only a weekend); the neighbouring requests that must stay untouched.
// ROW-196 cases: ROW-196 target=ROW-196.REQ-016.switch-off-rewrites-no-past-request-and-records-its-canceller control=ROW-197.control.switch-off-cancels-a-future-approved-weekday
//
// ROW-197 promise: control of ROW-196 — REQ-016 fail-if (3) "a switched-off account keeps an approved day from
// ROW-197   today on, or that day stays on the calendar".
// ROW-197 wrong product: a switch-off that only blocks sign-in and cancels nothing, which passes ROW-196's
// ROW-197   untouched-request clauses.
// ROW-197 given: team today Sat 2027-03-13; P holds an approved vacation 2027-04-05..06. when: the admin switches
// ROW-197   P off. then: the request is no longer approved (it reads cancelled) and 2027-04-05 on the calendar no
// ROW-197   longer lists P.
// ROW-197 controls: before the switch-off the request reads approved and the calendar lists P on 04-05.
// ROW-197 technique: before-and-after on the record and the calendar day.
// ROW-197 cases: ROW-197 target=ROW-197.control.switch-off-cancels-a-future-approved-weekday control=ROW-196.REQ-016.switch-off-rewrites-no-past-request-and-records-its-canceller
import { test, expect } from '@playwright/test';
import { approve, createMember, DEFAULT_TIME_ZONE, resetProduct, sendRequest, setClock, signIn, signInMember, switchAccount, type Actor, type Member } from './harness';
import { byId, readPersonRequests, refIs, sameInstant, type RequestRecord } from './request-records';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland: everything is sent and approved
const S = '2027-03-12T20:00:00Z'; // Sat 2027-03-13 09:00 Pacific/Auckland (UTC Fri 03-12): the switch-off

function stored(r: RequestRecord | undefined): unknown {
  if (!r) return undefined;
  const { raw: _raw, ...fields } = r;
  return fields;
}

async function approved(admin: Actor, who: Actor, firstDay: string, lastDay: string): Promise<string> {
  const id = String(await sendRequest(who, { kind: 'vacation', firstDay, lastDay }));
  await approve(admin, id);
  return id;
}

async function onCalendar(admin: Actor, person: Member, day: string): Promise<boolean> {
  const [y, m] = day.split('-').map(Number);
  const res = await admin.api.get(`/api/calendar?year=${y}&month=${m}`);
  expect(res.ok(), `GET /api/calendar?year=${y}&month=${m} answers`).toBe(true);
  const body = (await res.json()) as { days?: { date: string; people?: { name?: string; accountId?: unknown }[] }[] };
  const entry = body.days?.find((d) => d.date === day);
  return (entry?.people ?? []).some((x) => String(x.accountId) === String(person.id) || x.name === person.name);
}

test('ROW-196.REQ-016.switch-off-rewrites-no-past-request-and-records-its-canceller', async () => {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const adminRef = { id: admin.me.id, name: install.admin.name };
  try {
    const p1 = await createMember(admin);
    const p2 = await createMember(admin);
    const s1 = await signInMember(p1);
    const s2 = await signInMember(p2);
    const past = await approved(admin, s1, '2027-03-02', '2027-03-03');
    const weekendTail = await approved(admin, s1, '2027-03-11', '2027-03-14');
    const future = await approved(admin, s1, '2027-04-05', '2027-04-06');
    const pending = String(await sendRequest(s1, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }));
    const mixed = await approved(admin, s2, '2027-03-08', '2027-03-19');
    await s1.dispose();
    await s2.dispose();

    await setClock(S);
    const before1 = await readPersonRequests(admin, p1.id);
    const before2 = await readPersonRequests(admin, p2.id);
    for (const [label, r] of [
      ['past', byId(before1, past)],
      ['weekend-tail', byId(before1, weekendTail)],
      ['future', byId(before1, future)],
      ['pending', byId(before1, pending)],
      ['mixed', byId(before2, mixed)],
    ] as const) {
      expect([r?.cancelledBy, r?.cancelledAt, r?.cancelDay], `ROW-196 before: the ${label} request carries no cancel record`).toEqual([null, null, null]);
    }

    await switchAccount(admin, p1.id, false);
    await switchAccount(admin, p2.id, false);
    const after1 = await readPersonRequests(admin, p1.id);
    const after2 = await readPersonRequests(admin, p2.id);

    // No weekday from today on: never rewritten.
    expect.soft(stored(byId(after1, past)), 'ROW-196 the past request (03-02..03) reads exactly as before').toEqual(stored(byId(before1, past)));
    expect.soft(stored(byId(after1, weekendTail)), 'ROW-196 the request whose days from today on are only Sat-Sun reads exactly as before').toEqual(
      stored(byId(before1, weekendTail)),
    );

    // What the switch-off cancels: the admin, at the switch-off's time.
    for (const [label, before, r] of [
      ['future vacation', byId(before1, future), byId(after1, future)],
      ['pending sick', byId(before1, pending), byId(after1, pending)],
    ] as const) {
      expect.soft(r?.state, `ROW-196 the ${label} is cancelled`).toBe('cancelled');
      expect.soft(refIs(r?.cancelledBy ?? null, adminRef), `ROW-196 the ${label}'s canceller is the admin (read ${JSON.stringify(r?.cancelledBy)})`).toBe(true);
      expect.soft(refIs(r?.cancelledBy ?? null, { id: p1.id, name: p1.name }), `ROW-196 the ${label}'s canceller is not its owner`).toBe(false);
      expect.soft(sameInstant(r?.cancelledAt ?? null, S, DEFAULT_TIME_ZONE), `ROW-196 the ${label}'s cancel time is the switch-off's (read ${r?.cancelledAt})`).toBe(true);
      expect.soft([r?.decidedBy, r?.decidedAt], `ROW-196 the ${label}'s decision record is unchanged`).toEqual([before?.decidedBy, before?.decidedAt]);
    }
    const m = byId(after2, mixed);
    expect.soft(m?.state, 'ROW-196 P2\'s 03-08..19 vacation stays approved').toBe('approved');
    expect.soft([m?.firstDay, m?.lastDay], 'ROW-196 P2\'s vacation keeps its days as sent').toEqual(['2027-03-08', '2027-03-19']);
    expect.soft(m?.cancelDay, 'ROW-196 P2\'s vacation is cancelled from Mon 03-15, the first weekday from today on').toBe('2027-03-15');
    expect.soft(refIs(m?.cancelledBy ?? null, adminRef), `ROW-196 P2's vacation's canceller is the admin (read ${JSON.stringify(m?.cancelledBy)})`).toBe(true);
    expect.soft(sameInstant(m?.cancelledAt ?? null, S, DEFAULT_TIME_ZONE), `ROW-196 P2's vacation's cancel time is the switch-off's (read ${m?.cancelledAt})`).toBe(true);
  } finally {
    await admin.dispose();
  }
});

test('ROW-197.control.switch-off-cancels-a-future-approved-weekday', async () => {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  try {
    const p = await createMember(admin);
    const s = await signInMember(p);
    const future = await approved(admin, s, '2027-04-05', '2027-04-06');
    await s.dispose();
    await setClock(S);
    expect(byId(await readPersonRequests(admin, p.id), future)?.state, 'ROW-197 before: the request is approved').toBe('approved');
    expect(await onCalendar(admin, p, '2027-04-05'), 'ROW-197 before: the calendar lists P on 2027-04-05').toBe(true);

    await switchAccount(admin, p.id, false);
    expect.soft(byId(await readPersonRequests(admin, p.id), future)?.state, 'ROW-197 after: the request is cancelled').toBe('cancelled');
    expect.soft(await onCalendar(admin, p, '2027-04-05'), 'ROW-197 after: the calendar no longer lists P on 2027-04-05').toBe(false);
  } finally {
    await admin.dispose();
  }
});
