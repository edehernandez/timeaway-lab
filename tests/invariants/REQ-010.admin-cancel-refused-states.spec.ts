// Purpose: ledger tests for ROW-190 and ROW-191 (REQ-010) — the admin's cancel action called on a pending, rejected or cancelled request is refused and changes nothing; on an approved request with a future weekday it takes effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel, the confirmed cancel's two steps), fresh per run; the team clock fixed by the reset in Pacific/Auckland.
//
// ROW-190 promise: REQ-010 "the admin can cancel an approved request" — the cancel is the approved request's
// ROW-190   action alone (A-007; REQ-021 fail-if (4): no cancel action on a pending, rejected or cancelled
// ROW-190   request); called on another state it is refused and changes nothing (INV-003 "a refused attempt changes
// ROW-190   nothing").
// ROW-190 wrong product: the cancel act writes state 'cancelled' (and a canceller) whatever the state it finds —
// ROW-190   a pending request is withdrawn behind the person's back, a rejected one is rewritten as cancelled, an
// ROW-190   already-cancelled one gets the admin as its canceller and a new time; or the refusal still stamps the
// ROW-190   cancel fields.
// ROW-190 given: team today Wed 2027-03-10; member A holds a pending vacation 2027-04-05..09, a rejected sick
// ROW-190   2027-05-03..04 and a vacation 2027-06-07..08 A cancelled. when: for each, the admin reads the cancel's
// ROW-190   effect and posts the cancel act with the token the effect gave (a placeholder when it gave none, so the
// ROW-190   act is always called). then: every act is refused; each record reads exactly as before (the whole
// ROW-190   object), in its state; A's balance reads exactly as before.
// ROW-190 controls: ROW-191's case — the same two steps on an approved request take effect — so the route,
// ROW-190   the token and the act are reached; the target uses the token the product itself issued.
// ROW-190 technique: before-and-after on the whole record and the balance, one case per state.
// ROW-190 cases: ROW-190 target=ROW-190.REQ-010.admin-cancel-on-pending-rejected-or-cancelled-is-refused control=ROW-191.control.admin-cancel-on-an-approved-future-request-takes-effect
//
// ROW-191 promise: control of ROW-190 — REQ-010 "only its Monday to Friday days from today on are cancelled,
// ROW-191   returning those vacation days to the allowance"; REQ-019 "an approved request with no Monday to Friday
// ROW-191   day before today becomes cancelled".
// ROW-191 wrong product: a product whose cancel refuses every request, which would pass ROW-190 alone.
// ROW-191 given: team today Wed 2027-03-10; A's approved vacation 2027-04-12..16 (5 days); A has 20 days left.
// ROW-191   when: the admin's cancel in its two steps. then: the act answers 2xx, the request reads cancelled and
// ROW-191   A's 2027 days left are 25 again.
// ROW-191 controls: before the cancel the request reads approved and A has 20 left.
// ROW-191 technique: before-and-after on the record and the one figure.
// ROW-191 cases: ROW-191 target=ROW-191.control.admin-cancel-on-an-approved-future-request-takes-effect control=ROW-190.REQ-010.admin-cancel-on-pending-rejected-or-cancelled-is-refused
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  approve,
  cancelOwnRequest,
  confirmedActionRoutes,
  createMember,
  readBalance,
  reject,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
} from './harness';
import { byId, readPersonRequests } from './request-records';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

test('ROW-190.REQ-010.admin-cancel-on-pending-rejected-or-cancelled-is-refused', async () => {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const member = await createMember(admin, { allowance: 25 });
  const a = await signInMember(member);
  try {
    const pending = String(await sendRequest(a, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' }));
    const rejected = String(await sendRequest(a, { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
    await reject(admin, rejected);
    const cancelled = String(await sendRequest(a, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' }));
    await cancelOwnRequest(a, cancelled);

    const before = await readPersonRequests(admin, member.id);
    const balanceBefore = JSON.stringify(await readBalance(a));
    expect(
      [pending, rejected, cancelled].map((id) => byId(before, id)?.state),
      'ROW-190 setup: the three requests read pending, rejected, cancelled',
    ).toEqual(['pending', 'rejected', 'cancelled']);

    for (const [label, id] of [
      ['pending', pending],
      ['rejected', rejected],
      ['cancelled', cancelled],
    ] as const) {
      const { effect } = confirmedActionRoutes('cancel', id);
      const read = await admin.api.get(effect);
      const token = read.ok() ? (((await read.json().catch(() => ({}))) as { token?: string }).token ?? 'not-issued') : 'not-issued';
      const act = await actWithToken(admin, 'cancel', id, token);
      expect.soft(act.ok(), `ROW-190 the admin's cancel on the ${label} request is refused (answered ${act.status()})`).toBe(false);
    }

    const after = await readPersonRequests(admin, member.id);
    for (const [label, id] of [
      ['pending', pending],
      ['rejected', rejected],
      ['cancelled', cancelled],
    ] as const) {
      expect.soft(JSON.stringify(byId(after, id)?.raw), `ROW-190 the ${label} request reads exactly as before`).toBe(JSON.stringify(byId(before, id)?.raw));
      expect.soft(byId(after, id)?.state, `ROW-190 the ${label} request is still ${label}`).toBe(label);
    }
    expect.soft(JSON.stringify(await readBalance(a)), 'ROW-190 A\'s balance reads exactly as before').toBe(balanceBefore);
  } finally {
    await a.dispose();
    await admin.dispose();
  }
});

test('ROW-191.control.admin-cancel-on-an-approved-future-request-takes-effect', async () => {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const member = await createMember(admin, { allowance: 25 });
  const a = await signInMember(member);
  try {
    const approved = String(await sendRequest(a, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-16' }));
    await approve(admin, approved);
    expect(byId(await readPersonRequests(admin, member.id), approved)?.state, 'ROW-191 before: the request is approved').toBe('approved');
    expect((await readBalance(a)).years.find((y) => y.year === 2027)?.daysLeft, 'ROW-191 before: 20 days left').toBe(20);

    const { effect } = confirmedActionRoutes('cancel', approved);
    const read = await admin.api.get(effect);
    expect.soft(read.ok(), `ROW-191 the cancel's effect is read (answered ${read.status()})`).toBe(true);
    const token = (((await read.json().catch(() => ({}))) as { token?: string }).token ?? 'not-issued');
    const act = await actWithToken(admin, 'cancel', approved, token);
    expect.soft(act.ok(), `ROW-191 the cancel act is accepted (answered ${act.status()})`).toBe(true);

    expect.soft(byId(await readPersonRequests(admin, member.id), approved)?.state, 'ROW-191 after: the request is cancelled').toBe('cancelled');
    expect.soft((await readBalance(a)).years.find((y) => y.year === 2027)?.daysLeft, 'ROW-191 after: 25 days left').toBe(25);
  } finally {
    await a.dispose();
    await admin.dispose();
  }
});
