// Purpose: ledger tests for ROW-194 and ROW-195 (REQ-017) — a request's person, kind, days as sent, sent time and decision record are never rewritten or deleted after they are written; a decision writes the decider and the time on a pending request.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, the admin's cancel, rename, allowance, switch off and on), fresh per run; the team clock moved through the harness (setClock) in Pacific/Auckland so every write happens at a different instant.
//
// ROW-194 promise: REQ-017 "a request holds the person, the kind, its first and last day as sent, … when it was
// ROW-194   sent, who decided it and when"; fail-if (5) "a cancel overwrites who decided the request, or its first
// ROW-194   and last day as sent"; REQ-019 fail-if (6) "the request's original first and last day can no longer be
// ROW-194   told after the cancel". Authority: REQ-017 (A-015, A-023, A-024, A-030), REQ-019 (A-030).
// ROW-194 wrong product: an update that rewrites the whole row — its sent time refreshed to "now" (an updatedAt
// ROW-194   standing in for sentAt), its last day shortened to the day before the cancel, its decider replaced by
// ROW-194   the canceller, the decided time moved to the cancel time — or a switch-off that deletes the leaver's
// ROW-194   cancelled requests, or a rename that re-homes them.
// ROW-194 given: P sends R (vacation 2027-03-08..19) at team Mon 03-01 09:00; the admin approves R at Tue
// ROW-194   03-02 10:00; at Sat 03-13 09:00 P sends R2 (sick 04-05..06) and R3 (vacation 04-12..13), the admin
// ROW-194   rejects R2, approves R3, renames P, sets P's allowance to 30 and cancels R (partly: 03-15..19); at
// ROW-194   Mon 03-15 09:00 the admin switches P off (R3 cancelled) and back on. then: after every step each request
// ROW-194   is still in P's list and its kind, first and last day as sent and sent time equal what was read when it
// ROW-194   was sent, and its decider and decided time equal what was read when it was decided; P's own view
// ROW-194   agrees; none of them is in the admin's own list.
// ROW-194 controls: ROW-195's case — the decision writes the decider and the time — and the reads taken right
// ROW-194   after each write, which must name the instants of those writes (so the snapshots are not empty).
// ROW-194 technique: one clock, four distinct instants, so a field rewritten at a later write shows that
// ROW-194   write's instant; before-and-after per field after every later action.
// ROW-194 cases: ROW-194 target=ROW-194.REQ-017.a-requests-written-fields-are-never-rewritten control=ROW-195.control.a-decision-writes-the-decider-and-the-time
//
// ROW-195 promise: control of ROW-194 — REQ-017 fail-if (4) "a decision or cancel does not record who and when".
// ROW-195 wrong product: an approval that changes the state but records no decider or time.
// ROW-195 given: P's pending R sent at team Mon 03-01 09:00. when: the admin approves it at Tue 03-02 10:00.
// ROW-195   then: before, R carries no decider and no decided time; after, the decider is the admin and the
// ROW-195   decided time is that instant.
// ROW-195 controls: R reads pending before the decision and approved after.
// ROW-195 technique: before-and-after on the two fields; a clock instant distinct from the sending.
// ROW-195 cases: ROW-195 target=ROW-195.control.a-decision-writes-the-decider-and-the-time control=ROW-194.REQ-017.a-requests-written-fields-are-never-rewritten
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  reject,
  rename,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Member,
} from './harness';
import { byId, readOwnRequests, readPersonRequests, refIs, sameInstant, writtenOnce, type RequestRecord } from './request-records';

const T1 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland: P sends R
const T2 = '2027-03-01T21:00:00Z'; // Tue 2027-03-02 10:00: the admin approves R
const T3 = '2027-03-12T20:00:00Z'; // Sat 2027-03-13 09:00: R2, R3; reject, approve, rename, allowance, partial cancel of R
const T4 = '2027-03-14T20:00:00Z'; // Mon 2027-03-15 09:00: switch P off and on

function decision(r: RequestRecord | undefined): unknown {
  return r ? { decidedBy: r.decidedBy, decidedAt: r.decidedAt } : undefined;
}

test('ROW-195.control.a-decision-writes-the-decider-and-the-time', async () => {
  const install = await resetProduct({ now: T1 });
  const admin = await signIn(install.admin);
  const p = await createMember(admin);
  const ps = await signInMember(p);
  try {
    const r = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }));
    const before = byId(await readPersonRequests(admin, p.id), r);
    expect(before?.state, 'ROW-195 before: R is pending').toBe('pending');
    expect.soft([before?.decidedBy, before?.decidedAt], 'ROW-195 before: R carries no decider and no decided time').toEqual([null, null]);

    await setClock(T2);
    await approve(admin, r);
    const after = byId(await readPersonRequests(admin, p.id), r);
    expect.soft(after?.state, 'ROW-195 after: R is approved').toBe('approved');
    expect.soft(refIs(after?.decidedBy ?? null, { id: admin.me.id, name: install.admin.name }), 'ROW-195 after: the decider is the admin').toBe(true);
    expect.soft(sameInstant(after?.decidedAt ?? null, T2, DEFAULT_TIME_ZONE), `ROW-195 after: the decided time is ${T2} (read ${after?.decidedAt})`).toBe(true);
  } finally {
    await ps.dispose();
    await admin.dispose();
  }
});

test('ROW-194.REQ-017.a-requests-written-fields-are-never-rewritten', async () => {
  const install = await resetProduct({ now: T1 });
  const admin = await signIn(install.admin);
  const p: Member = await createMember(admin, { allowance: 25 });
  let ps: Actor = await signInMember(p);
  try {
    const written = new Map<string, ReturnType<typeof writtenOnce>>();
    const decided = new Map<string, unknown>();
    const read = async () => readPersonRequests(admin, p.id);
    const check = async (after: string) => {
      const list = await read();
      for (const [id, w] of written) {
        const r = byId(list, id);
        expect.soft(r, `ROW-194 after ${after}: request ${id} is still in P's list`).toBeDefined();
        expect.soft(r ? writtenOnce(r) : undefined, `ROW-194 after ${after}: request ${id}'s kind, days as sent and sent time are unchanged`).toEqual(w);
        if (decided.has(id)) expect.soft(decision(r), `ROW-194 after ${after}: request ${id}'s decider and decided time are unchanged`).toEqual(decided.get(id));
      }
    };

    // R, sent at T1, decided at T2.
    const r = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }));
    const rSent = byId(await read(), r)!;
    expect(sameInstant(rSent.sentAt, T1, DEFAULT_TIME_ZONE), `ROW-194 R's sent time names its sending (read ${rSent.sentAt})`).toBe(true);
    expect([rSent.kind, rSent.firstDay, rSent.lastDay], 'ROW-194 R reads as sent').toEqual(['vacation', '2027-03-08', '2027-03-19']);
    written.set(r, writtenOnce(rSent));
    await setClock(T2);
    await approve(admin, r);
    const rDecided = byId(await read(), r)!;
    expect(sameInstant(rDecided.decidedAt, T2, DEFAULT_TIME_ZONE), `ROW-194 R's decided time names the approval (read ${rDecided.decidedAt})`).toBe(true);
    decided.set(r, decision(rDecided));
    await check('the approval');

    // R2 and R3, sent and decided at T3; then the rename, the allowance change and R's partial cancel.
    await setClock(T3);
    const r2 = String(await sendRequest(ps, { kind: 'sick', firstDay: '2027-04-05', lastDay: '2027-04-06' }));
    const r3 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }));
    for (const id of [r2, r3]) written.set(id, writtenOnce(byId(await read(), id)!));
    await reject(admin, r2);
    await approve(admin, r3);
    for (const id of [r2, r3]) decided.set(id, decision(byId(await read(), id)));
    await check('the rejection and the approval');
    await rename(admin, p.id, freshName('Renamed'));
    await check('the rename');
    await setAllowance(admin, p.id, 30);
    await check('the allowance change');
    await adminCancel(admin, r);
    const rCancelled = byId(await read(), r);
    expect.soft(rCancelled?.state, 'ROW-194 R stays approved after its partial cancel').toBe('approved');
    await check('R\'s partial cancel');

    // The switch-off cancels R3; switching back on restores nothing.
    await setClock(T4);
    await ps.dispose();
    await switchAccount(admin, p.id, false);
    expect.soft(byId(await read(), r3)?.state, 'ROW-194 R3 is cancelled by the switch-off').toBe('cancelled');
    await check('the switch-off');
    await switchAccount(admin, p.id, true);
    await check('switching back on');

    // P's own view agrees; the admin's own list holds none of them.
    ps = await signInMember(p);
    const own = await readOwnRequests(ps);
    for (const [id, w] of written) {
      const o = byId(own, id);
      expect.soft(o ? writtenOnce(o) : undefined, `ROW-194 P's own view of ${id} reads as sent`).toEqual(w);
    }
    const adminOwn = (await readOwnRequests(admin)).map((x) => x.id);
    expect.soft([...written.keys()].filter((id) => adminOwn.includes(id)), 'ROW-194 none of P\'s requests is in the admin\'s own list').toEqual([]);
  } finally {
    await ps.dispose().catch(() => undefined); // may already be disposed before the switch-off
    await admin.dispose();
  }
});
