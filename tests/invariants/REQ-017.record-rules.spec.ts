// Purpose: ledger tests for ROW-198 (REQ-017, REQ-023) — every stored request satisfies the record rules (days, year, cancel day, decider and canceller fields matching its state, a person that exists), checked for each way of cancelling: own pending cancel, admin cancel (whole and partial), switch-off.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel, the admin's cancel, switch off), fresh per run; the team clock moved through the harness (setClock) in Pacific/Auckland.
//
// ROW-198 promise: the row's record rules — first day not after last; one year; a cancel day only on an
// ROW-198   approved, partly cancelled request, inside its range and on a weekday; pending: no decider; approved or
// ROW-198   rejected: a decider; cancelled: a decider exactly when it was approved before the cancel; who
// ROW-198   cancelled and when present exactly on cancelled and partly cancelled requests; a person that exists —
// ROW-198   from REQ-017 (fields per state, fail-if (1), (2), (4)), REQ-019 (the partial cancel's record), REQ-023
// ROW-198   (the account), D-020 (a whole cancel records no cancel day). Authority: A-015, A-023, A-024, A-030.
// ROW-198   The row's clause "enforced by the store too" is NOT observable at any public boundary (it needs a
// ROW-198   door that writes the store past the product's own routes); it is returned owed as a missing
// ROW-198   prerequisite. This file checks every stored request as the product reads it back.
// ROW-198 wrong product: an own pending cancel that records no canceller or time; a switch-off of a pending
// ROW-198   request that stamps a decider; a whole cancel that writes a cancel day; a weekend switch-off that writes
// ROW-198   the Saturday as the cancel day; a partial cancel that records the day but not who; a rejection with no
// ROW-198   decider time.
// ROW-198 given: at team Mon 2027-03-01, P1 holds a pending, an approved, a rejected, an own-cancelled and an
// ROW-198   admin-cancelled (whole) request; P2 an approved 03-08..19 the admin cancels at Wed 03-10 (partly, from
// ROW-198   03-10); P3 a pending, an approved future and an approved 03-08..19, all cut by a switch-off at Sat 03-13
// ROW-198   (from Mon 03-15); the admin a pending request of their own. when: every account's requests are read.
// ROW-198   then: every record satisfies every rule, and each one's decider and canceller are the expected ones.
// ROW-198 controls: the control case — the same build reads each request in the state its history gives — so
// ROW-198   every way of cancelling was reached; it does not look at the decider or canceller fields.
// ROW-198 technique: a property over every stored record (the denominator is every account's whole list),
// ROW-198   plus the named history of each request as the oracle for "decider exactly when approved before".
// ROW-198 cases: ROW-198 target=ROW-198.REQ-017.every-stored-request-satisfies-the-record-rules control=ROW-198.control.every-way-of-cancelling-was-reached
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type RequestSpec,
} from './harness';
import { isWeekday, readOwnRequests, readPersonRequests, refIs, type RequestRecord } from './request-records';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland
const TP = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00: the partial admin cancel
const S = '2027-03-12T20:00:00Z'; // Sat 2027-03-13 09:00: the switch-off

type Who = 'admin' | 'P1' | null;
interface Expected {
  label: string;
  state: string;
  decided: boolean;
  canceller: Who;
  cancelDay: string | null;
}

interface Built {
  admin: Actor;
  people: Map<string, { id: string; name: string }>;
  expected: Map<string, Expected>;
}

async function build(): Promise<Built> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const expected = new Map<string, Expected>();
  const people = new Map<string, { id: string; name: string }>([['admin', { id: String(admin.me.id), name: install.admin.name }]]);
  const send = async (a: Actor, spec: RequestSpec) => String(await sendRequest(a, spec));

  const p1 = await createMember(admin);
  const p2 = await createMember(admin);
  const p3 = await createMember(admin);
  for (const [k, m] of [
    ['P1', p1],
    ['P2', p2],
    ['P3', p3],
  ] as const) people.set(k, { id: String(m.id), name: m.name });
  const s1 = await signInMember(p1);
  const s2 = await signInMember(p2);
  const s3 = await signInMember(p3);

  const pend = await send(s1, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
  expected.set(pend, { label: 'P1 pending', state: 'pending', decided: false, canceller: null, cancelDay: null });
  const appr = await send(s1, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
  await approve(admin, appr);
  expected.set(appr, { label: 'P1 approved', state: 'approved', decided: true, canceller: null, cancelDay: null });
  const rej = await send(s1, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' });
  await reject(admin, rej);
  expected.set(rej, { label: 'P1 rejected', state: 'rejected', decided: true, canceller: null, cancelDay: null });
  const own = await send(s1, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
  await cancelOwnRequest(s1, own);
  expected.set(own, { label: 'P1 own pending cancel', state: 'cancelled', decided: false, canceller: 'P1', cancelDay: null });
  const whole = await send(s1, { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' });
  await approve(admin, whole);
  await adminCancel(admin, whole);
  expected.set(whole, { label: 'P1 whole admin cancel', state: 'cancelled', decided: true, canceller: 'admin', cancelDay: null });

  const part = await send(s2, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' });
  await approve(admin, part);
  expected.set(part, { label: 'P2 partial admin cancel', state: 'approved', decided: true, canceller: 'admin', cancelDay: '2027-03-10' });

  const p3pend = await send(s3, { kind: 'sick', firstDay: '2027-04-05', lastDay: '2027-04-06' });
  expected.set(p3pend, { label: 'P3 pending cut by switch-off', state: 'cancelled', decided: false, canceller: 'admin', cancelDay: null });
  const p3appr = await send(s3, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
  await approve(admin, p3appr);
  expected.set(p3appr, { label: 'P3 approved future cut by switch-off', state: 'cancelled', decided: true, canceller: 'admin', cancelDay: null });
  const p3mix = await send(s3, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' });
  await approve(admin, p3mix);
  expected.set(p3mix, { label: 'P3 approved partly cut by switch-off', state: 'approved', decided: true, canceller: 'admin', cancelDay: '2027-03-15' });

  const adminOwn = await send(admin, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' });
  expected.set(adminOwn, { label: 'the admin\'s pending', state: 'pending', decided: false, canceller: null, cancelDay: null });
  for (const s of [s1, s2, s3]) await s.dispose();

  await setClock(TP);
  await adminCancel(admin, part);
  await setClock(S);
  await switchAccount(admin, p3.id, false);
  return { admin, people, expected };
}

/** Every account's whole list, each record with the account whose list it came from. */
async function everyRecord(b: Built): Promise<{ owner: string; r: RequestRecord }[]> {
  const out: { owner: string; r: RequestRecord }[] = [];
  for (const [owner, p] of b.people) {
    const list = owner === 'admin' ? await readOwnRequests(b.admin) : await readPersonRequests(b.admin, p.id);
    for (const r of list) out.push({ owner, r });
  }
  return out;
}

function ruleViolations(r: RequestRecord, ownerId: string): string[] {
  const v: string[] = [];
  const has = (x: unknown) => x !== null;
  if (!['pending', 'approved', 'rejected', 'cancelled'].includes(r.state)) v.push(`state "${r.state}" is not one of the four`);
  if (r.firstDay === null || r.lastDay === null) v.push('a first or last day is missing');
  else {
    if (r.firstDay > r.lastDay) v.push('first day after last');
    if (r.firstDay.slice(0, 4) !== r.lastDay.slice(0, 4)) v.push('first and last day in different years');
  }
  if (r.personId !== null && r.personId !== ownerId) v.push(`its person ${r.personId} is not the account whose list holds it`);
  if (has(r.decidedBy) !== has(r.decidedAt)) v.push('a decider without a decided time, or the reverse');
  if (has(r.cancelledBy) !== has(r.cancelledAt)) v.push('a canceller without a cancel time, or the reverse');
  const partly = r.state === 'approved' && has(r.cancelDay);
  if (has(r.cancelDay)) {
    if (r.state !== 'approved') v.push(`a cancel day on a ${r.state} request`);
    const d = r.cancelDay as string;
    if (!isWeekday(d)) v.push(`cancel day ${d} is not a weekday`);
    if (r.firstDay !== null && r.lastDay !== null && !(r.firstDay < d && d <= r.lastDay)) v.push(`cancel day ${d} is not inside ${r.firstDay}..${r.lastDay} after its first day`);
  }
  if (r.state === 'pending' && has(r.decidedBy)) v.push('a pending request carries a decider');
  if ((r.state === 'approved' || r.state === 'rejected') && !has(r.decidedBy)) v.push(`an ${r.state} request carries no decider`);
  const cancelledOrPartly = r.state === 'cancelled' || partly;
  if (cancelledOrPartly && !has(r.cancelledBy)) v.push('a cancelled or partly cancelled request carries no canceller');
  if (!cancelledOrPartly && (has(r.cancelledBy) || has(r.cancelledAt))) v.push(`a ${r.state} request that is not partly cancelled carries a canceller`);
  return v;
}

test('ROW-198.control.every-way-of-cancelling-was-reached', async () => {
  const b = await build();
  try {
    const all = await everyRecord(b);
    for (const [id, e] of b.expected) {
      const found = all.find((x) => x.r.id === id);
      expect.soft(found?.r.state, `ROW-198 control: ${e.label} reads ${e.state}`).toBe(e.state);
    }
  } finally {
    await b.admin.dispose();
  }
});

test('ROW-198.REQ-017.every-stored-request-satisfies-the-record-rules', async () => {
  const b = await build();
  try {
    const all = await everyRecord(b);
    expect(all.length, 'ROW-198 every request the build sent is stored').toBeGreaterThanOrEqual(b.expected.size);
    for (const { owner, r } of all) {
      const label = b.expected.get(r.id)?.label ?? `${owner}'s request ${r.id}`;
      expect.soft(ruleViolations(r, b.people.get(owner)!.id), `ROW-198 ${label} satisfies the record rules`).toEqual([]);
    }
    for (const [id, e] of b.expected) {
      const found = all.find((x) => x.r.id === id);
      expect.soft(found, `ROW-198 ${e.label} is stored`).toBeDefined();
      if (!found) continue;
      const { owner, r } = found;
      const ownerRef = b.people.get(owner)!;
      expect.soft(r.decidedBy !== null, `ROW-198 ${e.label} carries a decider exactly when it was decided`).toBe(e.decided);
      if (e.decided) expect.soft(refIs(r.decidedBy, b.people.get('admin')!), `ROW-198 ${e.label}'s decider is the admin`).toBe(true);
      expect.soft(r.cancelDay, `ROW-198 ${e.label}'s cancel day`).toBe(e.cancelDay);
      const wantCanceller = e.canceller === null ? null : e.canceller === 'admin' ? b.people.get('admin')! : ownerRef;
      expect.soft(r.cancelledBy !== null, `ROW-198 ${e.label} carries a canceller exactly when it was cancelled`).toBe(wantCanceller !== null);
      if (wantCanceller) expect.soft(refIs(r.cancelledBy, wantCanceller), `ROW-198 ${e.label}'s canceller is ${e.canceller}`).toBe(true);
    }
  } finally {
    await b.admin.dispose();
  }
});
