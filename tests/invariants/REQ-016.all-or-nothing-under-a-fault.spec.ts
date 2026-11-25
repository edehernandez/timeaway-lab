// Purpose: ledger tests for ROW-199 (REQ-016, REQ-019, REQ-015, REQ-011, REQ-009) — a switch-off, a partial cancel, a password set, a password change, an allowance change, an approval and a rejection are each all-or-nothing: made to fail part-way through the fault door, the action shows no success and leaves the store exactly as it was.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); fixture data made through the product's public routes by harness.ts (reset, accounts, sends, approvals, sign-ins), fresh per run, on the team clock (setClock) in Pacific/Auckland; the fault armed through the fault door of D-048 and the store read through its store door (doors-store.ts).
//
// Row table:
//   ROW-199 | multi-record actions | operator:admin | POST /api/__test/fault, then each action's own route
//
// The fault door's step names are not in D-048; doors-store.ts states this pass's reading ("<action>:after-first-write":
// the next such action fails after its first record write and before it completes). A door naming its steps otherwise
// answers non-2xx: a SETUP failure naming the step, never this row failing.
//
// ROW-199 promise: the row — "a switch-off, partial cancel, password set or change, allowance change, approval or
// ROW-199   rejection is all-or-nothing: a failure part-way leaves no half-done state and shows no success". Authority:
// ROW-199   the row; REQ-016 (a switch-off cancels the pending requests and the days from today on, and ends sign-in),
// ROW-199   REQ-019 (a partial cancel records the cancel day and who), REQ-015 (a password set or change ends the other
// ROW-199   sessions), REQ-011 (an allowance change), REQ-009 (a decision), D-039 (a switch-off and its cancels in one
// ROW-199   write transaction), D-048 (the fault and store doors).
// ROW-199 wrong product: a switch-off that cancels the requests in one write and switches the account in another, so a
// ROW-199   failure between them leaves a switched-on account with its future days cancelled; a password set that ends the
// ROW-199   sessions before it stores the new hash; an allowance change whose record is written but whose value is not;
// ROW-199   a route that catches the failure and answers 200 anyway.
// ROW-199 given: at team Mon 2027-03-01, M1 holds approved 03-08..19, approved 05-03..04 and pending 06-07..08; M2 an
// ROW-199   approved 03-08..19; M3 and M4 open sessions (M4 two); M6 a pending vacation, M7 a pending sick request; the
// ROW-199   clock then at Wed 03-10. when: for each of the seven actions, its confirmation read where it has one, the
// ROW-199   fault armed for it, the whole store snapshotted, and the action done once through its own route. then: the
// ROW-199   answer is not a success, and the store (every table; sessions by which rows exist) is exactly the snapshot,
// ROW-199   and what the product shows of the subject (its requests, its sign-ins, its other session, its days left) is
// ROW-199   what it showed before.
// ROW-199 controls: the control case — the same seven actions on the same world with no fault armed each answer a
// ROW-199   success, change the snapshot and change what the product shows — so the snapshot and the readings can see
// ROW-199   each action's effect, and the target's "unchanged" is not blindness.
// ROW-199 technique: before and after around each action, the whole store as the oracle (not one table the action is
// ROW-199   expected to touch), plus the product's own readings of the subject.
// ROW-199 cases: ROW-199 target=ROW-199.REQ-016.a-failure-part-way-leaves-nothing-half-done control=ROW-199.control.each-action-without-a-fault-takes-effect
import { test, expect, type APIResponse } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  approve,
  createMember,
  freshPassword,
  readEffect,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type Actor,
  type Member,
} from './harness';
import { armFault, snapshotDiff, storeSnapshot, type FaultAction } from './doors-store';
import { readPersonRequests } from './request-records';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland
const TP = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00

interface Step {
  action: FaultAction;
  /** Reads what the action needs first (a confirmation) and returns the action itself, done once. */
  prepare(): Promise<() => Promise<APIResponse>>;
  /** What the product shows of the action's subject, as text. */
  observe(): Promise<string>;
}

interface World {
  admin: Actor;
  sessions: Actor[];
  steps: Step[];
}

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).ok();
  } finally {
    await api.dispose();
  }
}

async function alive(a: Actor): Promise<boolean> {
  return (await a.api.get('/api/me')).status() === 200;
}

async function requestsShown(admin: Actor, m: Member): Promise<string> {
  const list = await readPersonRequests(admin, m.id);
  return JSON.stringify(list.map((r) => [r.firstDay, r.state, r.cancelDay, r.decidedBy === null, r.cancelledBy === null]).sort());
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const m: Member[] = [];
  for (let i = 0; i < 7; i += 1) m.push(await createMember(admin, { allowance: 25 }));
  const [m1, m2, m3, m4, m5, m6, m7] = m;
  const s1 = await signInMember(m1);
  const s2 = await signInMember(m2);
  const s6 = await signInMember(m6);
  const s7 = await signInMember(m7);
  await approve(admin, await sendRequest(s1, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }));
  await approve(admin, await sendRequest(s1, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
  await sendRequest(s1, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' });
  const r2 = await sendRequest(s2, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' });
  await approve(admin, r2);
  const r6 = await sendRequest(s6, { kind: 'vacation', firstDay: '2027-06-14', lastDay: '2027-06-15' });
  const r7 = await sendRequest(s7, { kind: 'sick', firstDay: '2027-06-21', lastDay: '2027-06-22' });
  for (const s of [s2, s6, s7]) await s.dispose();
  await setClock(TP);
  const s3 = await signInMember(m3);
  const s4 = await signInMember(m4);
  const s4b = await signInMember(m4);
  const s5 = await signInMember(m5);
  const p3 = freshPassword();
  const p4 = freshPassword();
  const allowance = 3 + Math.floor(Math.random() * 7);
  const note = `Note ${Date.now().toString(36)}`;

  const steps: Step[] = [
    {
      action: 'switch-off',
      prepare: async () => {
        const e = await readEffect(admin, 'switch-off', m1.id);
        return () => actWithToken(admin, 'switch-off', m1.id, e.token);
      },
      observe: async () => JSON.stringify([await alive(s1), await requestsShown(admin, m1)]),
    },
    {
      action: 'partial-cancel',
      prepare: async () => {
        const e = await readEffect(admin, 'cancel', r2);
        return () => actWithToken(admin, 'cancel', r2, e.token);
      },
      observe: () => requestsShown(admin, m2),
    },
    {
      action: 'password-set',
      prepare: async () => () => admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(m3.id))}/password`, { data: { password: p3 } }),
      observe: async () => JSON.stringify([await signsIn(m3.email, m3.password), await signsIn(m3.email, p3), await alive(s3)]),
    },
    {
      action: 'password-change',
      prepare: async () => () => s4.api.post('/api/me/password', { data: { current: m4.password, next: p4 } }),
      observe: async () => JSON.stringify([await signsIn(m4.email, m4.password), await signsIn(m4.email, p4), await alive(s4b)]),
    },
    {
      action: 'allowance-change',
      prepare: async () => () =>
        admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(m5.id))}/allowance`, { data: { allowance, startsNextYear: false } }),
      observe: async () => (await s5.api.get('/api/balance')).text(),
    },
    {
      action: 'approve',
      prepare: async () => {
        const e = await readEffect(admin, 'approve', r6);
        return () => actWithToken(admin, 'approve', r6, e.token);
      },
      observe: () => requestsShown(admin, m6),
    },
    {
      action: 'reject',
      prepare: async () => {
        const e = await readEffect(admin, 'reject', r7);
        return () => actWithToken(admin, 'reject', r7, e.token, { note });
      },
      observe: async () => `${await requestsShown(admin, m7)} ${JSON.stringify((await readPersonRequests(admin, m7.id)).map((r) => JSON.stringify(r.raw).includes(note)))}`,
    },
  ];
  return { admin, sessions: [s1, s3, s4, s4b, s5], steps };
}

async function closeWorld(w: World): Promise<void> {
  for (const s of w.sessions) await s.dispose().catch(() => undefined);
  await w.admin.dispose();
}

test('ROW-199.control.each-action-without-a-fault-takes-effect', async () => {
  const w = await world();
  try {
    for (const step of w.steps) {
      const shownBefore = await step.observe();
      const act = await step.prepare();
      const before = await storeSnapshot({ keysOnly: ['sessions'] });
      const res = await act();
      const after = await storeSnapshot({ keysOnly: ['sessions'] });
      expect.soft(res.ok(), `ROW-199 control: the ${step.action} with no fault answers a success (${res.status()})`).toBe(true);
      expect.soft(snapshotDiff(before, after).length > 0, `ROW-199 control: the ${step.action} changes the store`).toBe(true);
      expect.soft(await step.observe(), `ROW-199 control: the ${step.action} changes what the product shows of its subject`).not.toBe(shownBefore);
    }
  } finally {
    await closeWorld(w);
  }
});

test('ROW-199.REQ-016.a-failure-part-way-leaves-nothing-half-done', async () => {
  const w = await world();
  try {
    for (const step of w.steps) {
      const shownBefore = await step.observe();
      const act = await step.prepare();
      const at = await armFault(step.action);
      const before = await storeSnapshot({ keysOnly: ['sessions'] });
      const res = await act();
      const after = await storeSnapshot({ keysOnly: ['sessions'] });
      expect.soft(res.ok(), `ROW-199 the ${step.action} failing at ${at} shows no success (answered ${res.status()})`).toBe(false);
      expect.soft(snapshotDiff(before, after), `ROW-199 the ${step.action} failing at ${at} leaves the store as it was`).toEqual([]);
      expect.soft(await step.observe(), `ROW-199 the ${step.action} failing at ${at} leaves what the product shows of its subject as it was`).toBe(shownBefore);
    }
  } finally {
    await closeWorld(w);
  }
});
