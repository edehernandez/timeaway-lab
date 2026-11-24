// Purpose: ledger tests for ROW-184 and ROW-185 (INV-003) — a member's refused action on another person's request answers exactly as for a request that does not exist, revealing no state or kind, and changes nothing; the same action on the member's own pending request takes effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel), fresh per run; the team clock fixed by the reset in Pacific/Auckland.
//
// ROW-184 promise: INV-003 "a person acts only on their own requests and sees only their own requests …; a
// ROW-184   refused attempt changes nothing" — the row's reading: the refusal answers exactly as for a request
// ROW-184   that does not exist, revealing no state or kind. Authority: INV-003 (A-005, A-007, A-008).
// ROW-184 wrong product: the cancel route looks the request up, then refuses with "not yours" (403) where a
// ROW-184   missing one gets 404, or answers "only pending requests can be cancelled" for B's approved one, or
// ROW-184   echoes the request's kind or state in the refusal — each tells A that the request exists and what it
// ROW-184   is; or the refusal still cancels B's request.
// ROW-184 given: team today Wed 2027-03-10; members A and B; B holds a pending vacation, an approved sick, a
// ROW-184   rejected vacation and a cancelled sick; the admin holds a pending vacation of their own; an id of the
// ROW-184   same form that names no request. when: A calls the member's own cancel, and the admin's approve
// ROW-184   effect and act, on each of the five and on the missing id. then: every answer on a real request is
// ROW-184   refused and equals, in status and body (the id written as <id>), the answer on the missing id; B's and
// ROW-184   the admin's records are exactly as before.
// ROW-184 controls: ROW-185's case — A's own cancel on A's own pending request takes effect — and the
// ROW-184   admin's read of B's list showing the four states, so the ids are real and the route is reached.
// ROW-184 technique: the missing id as the oracle (the answer a request that does not exist gets is the
// ROW-184   product's own, read in the same run), compared over every state and both kinds; before-and-after.
// ROW-184 cases: ROW-184 target=ROW-184.INV-003.refused-on-anothers-request-answers-as-for-none control=ROW-185.control.own-pending-cancel-takes-effect
//
// ROW-185 promise: control of ROW-184 — REQ-005 "a person can cancel their own request while it is pending and
// ROW-185   has no weekday before today; it becomes cancelled"; authority: INV-003, REQ-005.
// ROW-185 wrong product: a product that refuses every member cancel the same way, which passes ROW-184 alone.
// ROW-185 given: the same install. when: A cancels A's own pending vacation 2027-07-05..06. then: the answer is
// ROW-185   2xx and the request reads cancelled; B's four requests still read in their states.
// ROW-185 controls: before the cancel the request reads pending; ROW-184's case is untouched by this fault.
// ROW-185 technique: before-and-after on the one record.
// ROW-185 cases: ROW-185 target=ROW-185.control.own-pending-cancel-takes-effect control=ROW-184.INV-003.refused-on-anothers-request-answers-as-for-none
import { randomUUID } from 'node:crypto';
import { test, expect, type APIResponse } from '@playwright/test';
import {
  cancelOwnRequest,
  createMember,
  fresh,
  reject,
  approve,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type Actor,
} from './harness';
import { byId, readOwnRequests, readPersonRequests } from './request-records';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

interface World {
  admin: Actor;
  a: Actor;
  bId: string;
  others: { label: string; id: string }[];
  missing: string;
  aOwn: string;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const aMember = await createMember(admin);
  const bMember = await createMember(admin);
  const b = await signInMember(bMember);
  const pending = String(await sendRequest(b, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }));
  const approved = String(await sendRequest(b, { kind: 'sick', firstDay: '2027-04-12', lastDay: '2027-04-13' }));
  await approve(admin, approved);
  const rejected = String(await sendRequest(b, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
  await reject(admin, rejected);
  const cancelled = String(await sendRequest(b, { kind: 'sick', firstDay: '2027-06-07', lastDay: '2027-06-08' }));
  await cancelOwnRequest(b, cancelled);
  await b.dispose();
  const adminOwn = String(await sendRequest(admin, { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-20' }));
  const a = await signInMember(aMember);
  const aOwn = String(await sendRequest(a, { kind: 'vacation', firstDay: '2027-07-05', lastDay: '2027-07-06' }));
  const ids = [pending, approved, rejected, cancelled, adminOwn, aOwn];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const missing = ids.every((id) => /^\d+$/.test(id))
    ? String(Math.max(...ids.map(Number)) + 900_000)
    : ids.every((id) => uuid.test(id))
      ? randomUUID()
      : fresh('no-such-request');
  return {
    admin,
    a,
    bId: String(bMember.id),
    others: [
      { label: 'B pending vacation', id: pending },
      { label: 'B approved sick', id: approved },
      { label: 'B rejected vacation', id: rejected },
      { label: 'B cancelled sick', id: cancelled },
      { label: 'the admin\'s pending vacation', id: adminOwn },
    ],
    missing,
    aOwn,
  };
}

/** The member's actions on a request id, each answered raw. */
function attempts(a: Actor): { name: string; run: (id: string) => Promise<APIResponse> }[] {
  return [
    { name: 'POST /api/requests/:id/cancel', run: (id) => a.api.post(`/api/requests/${encodeURIComponent(id)}/cancel`) },
    { name: 'GET /api/admin/requests/:id/effect?action=approve', run: (id) => a.api.get(`/api/admin/requests/${encodeURIComponent(id)}/effect?action=approve`) },
    { name: 'POST /api/admin/requests/:id/approve', run: (id) => a.api.post(`/api/admin/requests/${encodeURIComponent(id)}/approve`, { data: { token: 'x' } }) },
  ];
}

async function answerOf(res: APIResponse, id: string): Promise<{ status: number; body: string }> {
  const body = (await res.text().catch(() => '')).split(id).join('<id>');
  return { status: res.status(), body };
}

test('ROW-184.INV-003.refused-on-anothers-request-answers-as-for-none', async () => {
  const w = await world();
  try {
    const bBefore = JSON.stringify((await readPersonRequests(w.admin, w.bId)).map((r) => r.raw));
    const adminBefore = JSON.stringify((await readOwnRequests(w.admin)).map((r) => r.raw));

    for (const attempt of attempts(w.a)) {
      const none = await answerOf(await attempt.run(w.missing), w.missing);
      expect.soft(none.status, `ROW-184 ${attempt.name} on a missing request is refused`).toBeGreaterThanOrEqual(400);
      for (const other of w.others) {
        const res = await attempt.run(other.id);
        expect.soft(res.ok(), `ROW-184 ${attempt.name} on ${other.label} is refused (answered ${res.status()})`).toBe(false);
        expect.soft(await answerOf(res, other.id), `ROW-184 ${attempt.name} on ${other.label} answers exactly as for a missing request`).toEqual(none);
      }
    }

    expect.soft(JSON.stringify((await readPersonRequests(w.admin, w.bId)).map((r) => r.raw)), 'ROW-184 B\'s records are exactly as before').toBe(bBefore);
    expect.soft(JSON.stringify((await readOwnRequests(w.admin)).map((r) => r.raw)), 'ROW-184 the admin\'s records are exactly as before').toBe(adminBefore);
  } finally {
    await w.a.dispose();
    await w.admin.dispose();
  }
});

test('ROW-185.control.own-pending-cancel-takes-effect', async () => {
  const w = await world();
  try {
    const bList = await readPersonRequests(w.admin, w.bId);
    expect(
      w.others.slice(0, 4).map((o) => byId(bList, o.id)?.state),
      'ROW-185 setup: B\'s four requests read in their states',
    ).toEqual(['pending', 'approved', 'rejected', 'cancelled']);
    expect(byId(await readOwnRequests(w.a), w.aOwn)?.state, 'ROW-185 before: A\'s own request is pending').toBe('pending');

    const res = await w.a.api.post(`/api/requests/${encodeURIComponent(w.aOwn)}/cancel`);
    expect.soft(res.ok(), `ROW-185 A's own pending cancel is accepted (answered ${res.status()})`).toBe(true);
    expect.soft(byId(await readOwnRequests(w.a), w.aOwn)?.state, 'ROW-185 after: A\'s own request is cancelled').toBe('cancelled');
  } finally {
    await w.a.dispose();
    await w.admin.dispose();
  }
});
