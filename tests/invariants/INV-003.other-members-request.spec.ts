// Purpose: ledger test for ROW-270 (INV-003, REQ-005, REQ-006) — as one member, cancelling or reading another member's request by its id through any member-callable address is refused, returns none of that member's data and changes nothing.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals), fresh per run.
//
// Boundary (R6): isolation, proved at the HTTP harness. The addresses a member can call with a request id are
// D-029's POST /api/requests/:id/cancel, the by-id shapes a member route could grow (GET and DELETE
// /api/requests/:id, GET /api/requests?id=), and the admin's request and person routes (callable by anyone; they
// must refuse a member). The neighbouring entity that must stay untouched is the other member's request: still
// pending, its days still counted, still cancellable by its owner.
import { test, expect } from '@playwright/test';
import {
  approve,
  cancelOwnRequest,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { freshInt, getRaw, is2xx, postRaw, yearFigures } from './admin-kit';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const YEAR = 2027;
const B_PENDING = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-24' };
const B_APPROVED = { kind: 'vacation' as const, firstDay: '2027-03-29', lastDay: '2027-03-31' };
const A_OWN = { kind: 'vacation' as const, firstDay: '2027-03-15', lastDay: '2027-03-16' };

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface World {
  admin: Actor;
  a: Actor;
  aOwn: AccountId;
  b: Actor;
  bMember: Member;
  bAllowance: number;
  bPending: AccountId;
  bApproved: AccountId;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const aMember = await createMember(admin, { name: freshName('Ilse') });
  const bAllowance = freshInt(20, 40);
  const bMember = await createMember(admin, { name: freshName('Oskar'), allowance: bAllowance });
  const a = keep(await signInMember(aMember));
  const b = keep(await signInMember(bMember));
  const aOwn = await sendRequest(a, A_OWN);
  const bPending = await sendRequest(b, B_PENDING);
  const bApproved = await sendRequest(b, B_APPROVED);
  await approve(admin, bApproved);
  return { admin, a, aOwn, b, bMember, bAllowance, bPending, bApproved };
}

function seg(id: AccountId): string {
  return encodeURIComponent(String(id));
}

// ROW-270 promise: INV-003 "a person acts only on their own requests and sees only their own requests …; a refused
// ROW-270   attempt changes nothing"; REQ-005 (a person cancels their own pending request), REQ-006 fail-if (6) "the
// ROW-270   page shows any other person's request". The row: by its id, through any member-callable address.
// ROW-270 wrong product: a cancel route that looks the request up by id without checking its owner (the classic
// ROW-270   insecure direct object reference); a refusal message that echoes the request ("Oskar's 22–24 Mar is not
// ROW-270   yours"); a by-id read route added for the page that returns any id; a 403 sent after the cancel was stored.
// ROW-270 given: members A and B with fresh names; B holds a pending 22–24 Mar and an approved 29–31 Mar (B's days
// ROW-270   are on no request of A's). when: on A's session, A posts cancel on each of B's ids, GETs and DELETEs
// ROW-270   /api/requests/<id>, GETs /api/requests?id=<id>, and calls the admin's effect, approve and person-requests
// ROW-270   routes for B's ids. then: every by-id address answers non-2xx; no answer carries B's name, B's email or any
// ROW-270   of B's days; B's figures are unchanged (pending 3, days left allowance − 3); and B can still cancel the
// ROW-270   pending request itself.
// ROW-270 controls: the control case has A cancel A's own pending request on the same route (2xx) — the route and
// ROW-270   the body work, so the target's refusals are the ownership check.
// ROW-270 technique: the neighbouring entity that must stay untouched, read before and after; B's fresh values as
// ROW-270   the data that must not leak; every address in one target case as soft assertions.
// ROW-270 cases: ROW-270 target=ROW-270.INV-003.another-members-request-by-id-is-refused-leaks-nothing-and-stays control=ROW-270.control.a-member-cancels-their-own-request
test('ROW-270.control.a-member-cancels-their-own-request', async () => {
  const w = await world();
  await cancelOwnRequest(w.a, w.aOwn);
  expect(await yearFigures(w.a, YEAR), "ROW-270 control: A's own request is cancelled").toEqual({ daysLeft: expect.any(Number), pending: 0 });
});

test('ROW-270.INV-003.another-members-request-by-id-is-refused-leaks-nothing-and-stays', async () => {
  const w = await world();
  const secrets = [w.bMember.name, w.bMember.email, B_PENDING.firstDay, B_PENDING.lastDay, B_APPROVED.firstDay, B_APPROVED.lastDay];
  const leaked = (t: string) => secrets.filter((s) => t.includes(s));
  const before = await yearFigures(w.b, YEAR);
  expect(before, "ROW-270 before: B's figures").toEqual({ daysLeft: w.bAllowance - 3, pending: 3 });

  const byId: { what: string; call: () => Promise<{ status: number; text: string }> }[] = [];
  for (const [label, id] of [
    ['pending', w.bPending],
    ['approved', w.bApproved],
  ] as [string, AccountId][]) {
    byId.push(
      { what: `POST /api/requests/<B ${label}>/cancel`, call: () => postRaw(w.a.api, `/api/requests/${seg(id)}/cancel`) },
      { what: `GET /api/requests/<B ${label}>`, call: () => getRaw(w.a.api, `/api/requests/${seg(id)}`) },
      { what: `DELETE /api/requests/<B ${label}>`, call: async () => {
        const r = await w.a.api.delete(`/api/requests/${seg(id)}`);
        return { status: r.status(), text: await r.text().catch(() => '') };
      } },
      { what: `GET /api/admin/requests/<B ${label}>/effect?action=cancel`, call: () => getRaw(w.a.api, `/api/admin/requests/${seg(id)}/effect?action=cancel`) },
      { what: `POST /api/admin/requests/<B ${label}>/cancel`, call: () => postRaw(w.a.api, `/api/admin/requests/${seg(id)}/cancel`, { token: 'x' }) },
    );
  }
  byId.push(
    { what: 'POST /api/admin/requests/<B pending>/reject', call: () => postRaw(w.a.api, `/api/admin/requests/${seg(w.bPending)}/reject`, { token: 'x' }) },
    { what: 'GET /api/admin/people/<B>/requests', call: () => getRaw(w.a.api, `/api/admin/people/${seg(w.bMember.id)}/requests`) },
  );
  for (const p of byId) {
    const r = await p.call();
    expect.soft(is2xx(r.status), `ROW-270: ${p.what} on A's session is refused (answered ${r.status})`).toBe(false);
    expect.soft(leaked(r.text), `ROW-270: ${p.what} returns none of B's data`).toEqual([]);
  }
  const q = await getRaw(w.a.api, `/api/requests?id=${seg(w.bPending)}`);
  expect.soft(leaked(q.text), `ROW-270: GET /api/requests?id=<B pending> (answered ${q.status}) returns none of B's data`).toEqual([]);

  expect.soft(await yearFigures(w.b, YEAR), "ROW-270: B's figures are unchanged").toEqual(before);
  const own = await postRaw(w.b.api, `/api/requests/${seg(w.bPending)}/cancel`);
  expect.soft(is2xx(own.status), `ROW-270: B's pending request is still pending — B cancels it (answered ${own.status})`).toBe(true);
});
