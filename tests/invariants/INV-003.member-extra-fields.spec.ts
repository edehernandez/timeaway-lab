// Purpose: ledger tests for ROW-182 and ROW-183 (INV-003, REQ-001) — extra fields on a member's own actions (an admin flag, an allowance, a state, a decider, another person) are ignored and change nothing; the same actions with only their own fields take effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, sign in), fresh per run; the team clock fixed by the reset in Pacific/Auckland.
//
// ROW-182 promise: INV-003 "a person acts only on their own requests …; only the admin approves …, sets allowances,
// ROW-182   … creates and renames accounts; a refused attempt changes nothing"; REQ-001 fail-if (5) "a new request
// ROW-182   starts in any state other than pending" and (6) "a request is created for any person other than the
// ROW-182   signed-in sender, whatever the sender sends". Authority: INV-003 (A-005, A-007, A-008), REQ-001 (A-026).
// ROW-182 wrong product: a route that spreads the posted body into the record it writes (mass assignment): the
// ROW-182   request lands approved, decided by the admin, or on another person; the password change writes the
// ROW-182   body's isAdmin or allowance into the account, or acts on the body's id; the cancel acts on the body's id.
// ROW-182 given: team today Wed 2027-03-10 (UTC still Tue 03-09); members A and B, allowance 25; B holds one
// ROW-182   pending sick request; A holds one pending sick request R2. when: A sends a vacation 2027-04-05..09
// ROW-182   carrying state:'approved', B's id as the person, the admin as decider, isAdmin and allowance:200; A
// ROW-182   changes their own password carrying isAdmin, allowance:200 and B's id; A cancels R2 carrying B's
// ROW-182   request id and state:'approved'. then: B's records are exactly as before (one request, pending, same
// ROW-182   record); none of A's requests is approved or carries a decider; A's 2027 days left are 25 (an approved
// ROW-182   extra would make 20, an allowance extra 200); A is not the admin (GET /api/me and an admin route); B's
// ROW-182   own password still signs B in.
// ROW-182 controls: ROW-183's case — the same three actions with only their own fields take effect, so the
// ROW-182   routes exist and the target's "nothing changed" is not a refusal of everything.
// ROW-182 technique: decoys — each extra names a value visible in exactly one place (B's list, A's days left,
// ROW-182   A's isAdmin, B's password) with before-and-after reads; fresh accounts per run.
// ROW-182 cases: ROW-182 target=ROW-182.INV-003.extra-fields-on-a-members-own-actions-change-nothing control=ROW-183.control.the-same-actions-with-only-their-own-fields-take-effect
//
// ROW-183 promise: control of ROW-182 — REQ-001 (a person sends a request for themselves; it starts pending),
// ROW-183   REQ-015 (a person changes their own password after giving the current one), REQ-005 (a person cancels
// ROW-183   their own pending request); authority: REQ-001, INV-003.
// ROW-183 wrong product: a product that refuses every member action, which would pass ROW-182's target alone.
// ROW-183 given: the same install, members and dates. when: A sends the vacation, changes the password and
// ROW-183   cancels R2 with only their own fields. then: the vacation is in A's list, pending, 5 days pending and
// ROW-183   25 left; the old password no longer signs in and the new one does; R2 is cancelled.
// ROW-183 controls: before the actions A's list holds only R2 and the old password signs in; ROW-182's case,
// ROW-183   which a refuse-everything product also passes, is untouched by this row's fault.
// ROW-183 technique: before-and-after on the one record and the one figure each action changes.
// ROW-183 cases: ROW-183 target=ROW-183.control.the-same-actions-with-only-their-own-fields-take-effect control=ROW-182.INV-003.extra-fields-on-a-members-own-actions-change-nothing
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  freshPassword,
  readBalance,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { byId, readOwnRequests, readPersonRequests } from './request-records';

// Team time zone Pacific/Auckland (the reset's default): 2027-03-09T20:00Z is Wed 2027-03-10 09:00 there.
const NOW = '2027-03-09T20:00:00Z';
const VACATION = { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' } as const; // Mon..Fri, 5 days

interface World {
  install: Install;
  admin: Actor;
  a: Member;
  b: Member;
  aActor: Actor;
  bRequest: string;
  r2: string;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const a = await createMember(admin, { allowance: 25 });
  const b = await createMember(admin, { allowance: 25 });
  const bActor = await signInMember(b);
  const bRequest = String(await sendRequest(bActor, { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
  await bActor.dispose();
  const aActor = await signInMember(a);
  const r2 = String(await sendRequest(aActor, { kind: 'sick', firstDay: '2027-06-07', lastDay: '2027-06-08' }));
  return { install, admin, a, b, aActor, bRequest, r2 };
}

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    const res = await api.post('/api/auth/sign-in', { data: { email, password } });
    return res.ok();
  } finally {
    await api.dispose();
  }
}

test('ROW-182.INV-003.extra-fields-on-a-members-own-actions-change-nothing', async () => {
  const w = await world();
  try {
    const bBefore = await readPersonRequests(w.admin, w.b.id);
    expect(bBefore.map((r) => r.id), 'ROW-182 before: B holds exactly one request').toEqual([w.bRequest]);
    const aDaysBefore = (await readBalance(w.aActor)).years.find((y) => y.year === 2027)?.daysLeft;
    expect(aDaysBefore, 'ROW-182 before: A has 25 days left in 2027').toBe(25);

    // The three own actions, each carrying fields that are not its own.
    await w.aActor.api.post('/api/requests', {
      data: {
        ...VACATION,
        state: 'approved',
        status: 'approved',
        personId: w.b.id,
        accountId: w.b.id,
        userId: w.b.id,
        decidedBy: w.admin.me.id,
        decidedAt: NOW,
        isAdmin: true,
        allowance: 200,
      },
    });
    const next = freshPassword();
    await w.aActor.api.post('/api/me/password', {
      data: { current: w.a.password, next, id: w.b.id, accountId: w.b.id, isAdmin: true, admin: true, role: 'admin', allowance: 200 },
    });
    await w.aActor.api.post(`/api/requests/${encodeURIComponent(w.r2)}/cancel`, {
      data: { id: w.bRequest, requestId: w.bRequest, accountId: w.b.id, state: 'approved', decidedBy: w.admin.me.id },
    });

    // B: untouched.
    const bAfter = await readPersonRequests(w.admin, w.b.id);
    expect.soft(bAfter.map((r) => r.id), 'ROW-182 B still holds exactly its one request').toEqual([w.bRequest]);
    expect.soft(JSON.stringify(byId(bAfter, w.bRequest)?.raw), 'ROW-182 B\'s request is exactly as before').toBe(
      JSON.stringify(byId(bBefore, w.bRequest)?.raw),
    );
    expect.soft(await signsIn(w.b.email, w.b.password), 'ROW-182 B\'s own password still signs B in').toBe(true);

    // A: no extra took effect.
    const aSession = (await signsIn(w.a.email, next)) ? await signIn({ email: w.a.email, password: next }) : await signInMember(w.a);
    try {
      expect.soft(aSession.me.isAdmin, 'ROW-182 A is not the admin').toBe(false);
      const adminRoute = await aSession.api.get('/api/admin/people');
      expect.soft(adminRoute.ok(), `ROW-182 an admin route refuses A (answered ${adminRoute.status()})`).toBe(false);
      const aList = await readOwnRequests(aSession);
      expect.soft(
        aList.filter((r) => r.state === 'approved' || r.state === 'rejected').map((r) => `${r.id}:${r.state}`),
        'ROW-182 none of A\'s requests is approved or rejected',
      ).toEqual([]);
      expect.soft(aList.filter((r) => r.decidedBy !== null).map((r) => r.id), 'ROW-182 none of A\'s requests carries a decider').toEqual([]);
      expect
        .soft(
          aList.filter((r) => r.personId !== null && r.personId !== String(w.a.id)).map((r) => r.id),
          'ROW-182 every request in A\'s list is A\'s',
        )
        .toEqual([]);
      const year = (await readBalance(aSession)).years.find((y) => y.year === 2027);
      expect.soft(year?.daysLeft, 'ROW-182 A\'s 2027 days left are still 25 (no approval, no allowance change)').toBe(25);
    } finally {
      await aSession.dispose();
    }
  } finally {
    await w.aActor.dispose();
    await w.admin.dispose();
  }
});

test('ROW-183.control.the-same-actions-with-only-their-own-fields-take-effect', async () => {
  const w = await world();
  try {
    expect((await readOwnRequests(w.aActor)).map((r) => r.id), 'ROW-183 before: A holds only R2').toEqual([w.r2]);
    expect(await signsIn(w.a.email, w.a.password), 'ROW-183 before: A\'s password signs in').toBe(true);

    const sent = await w.aActor.api.post('/api/requests', { data: { ...VACATION } });
    expect.soft(sent.status(), 'ROW-183 the vacation is accepted').toBe(201);
    const next = freshPassword();
    const changed = await w.aActor.api.post('/api/me/password', { data: { current: w.a.password, next } });
    expect.soft(changed.ok(), `ROW-183 the password change is accepted (answered ${changed.status()})`).toBe(true);
    const cancelled = await w.aActor.api.post(`/api/requests/${encodeURIComponent(w.r2)}/cancel`);
    expect.soft(cancelled.ok(), `ROW-183 the own cancel is accepted (answered ${cancelled.status()})`).toBe(true);

    expect.soft(await signsIn(w.a.email, w.a.password), 'ROW-183 the old password no longer signs in').toBe(false);
    expect.soft(await signsIn(w.a.email, next), 'ROW-183 the new password signs in').toBe(true);
    const aSession = await signIn({ email: w.a.email, password: next });
    try {
      const list = await readOwnRequests(aSession);
      const vacation = list.find((r) => r.id !== w.r2);
      expect.soft(vacation?.state, 'ROW-183 the vacation is in A\'s list, pending').toBe('pending');
      expect.soft([vacation?.firstDay, vacation?.lastDay], 'ROW-183 the vacation keeps its days').toEqual([VACATION.firstDay, VACATION.lastDay]);
      expect.soft(byId(list, w.r2)?.state, 'ROW-183 R2 is cancelled').toBe('cancelled');
      const year = (await readBalance(aSession)).years.find((y) => y.year === 2027);
      expect.soft([year?.daysLeft, year?.pending], 'ROW-183 2027: 25 left, 5 pending').toEqual([25, 5]);
    } finally {
      await aSession.dispose();
    }
  } finally {
    await w.aActor.dispose();
    await w.admin.dispose();
  }
});
