// Purpose: the ledger test of RULE-004 (REQ-001, REQ-005, REQ-009, REQ-010, REQ-016, REQ-017, REQ-019) — a request's state moves only pending to approved, rejected or cancelled and approved to cancelled: every forbidden move is attempted through every route of the route folder with real and stale tokens, by the admin and by the owner, and none happens, nor does any state change by itself as days pass.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve, reject, own cancel, admin cancel, switch-off and on, effect tokens), a fresh year and names per run; routes read from the route folder's file names (route-census.ts, rule-census.ts).
//
// Boundary (R6): a state rule, proved at the HTTP harness, on the admin's and the owner's own sessions; the state is read
// on the admin's view of each person's requests (GET /api/admin/people/:id/requests) and on the owner's own (GET
// /api/requests), by the state field D-031's census names (records.ts stateOf: `state`, else `status`).
//
// RULE-004 promise: RULE-004 "state-machine request.state: pending pending>approved pending>rejected pending>cancelled
// RULE-004   approved>cancelled"; REQ-001 arm 5 (a new request starts pending, whatever the sender sends); REQ-005 arm 3 (a
// RULE-004   cancelled request is never decided afterwards); REQ-009 arms 1 and 6 (only a pending request is approved or
// RULE-004   rejected; a pending request never changes state by itself when its days pass); REQ-010 arm 4; REQ-016 arm 5
// RULE-004   (switching back on restores no cancelled request); REQ-019 arm 1 (a partly cancelled request stays approved);
// RULE-004   D-039 (an act on a request no longer in the state it needs is refused 409); D-041 (a token is good only for the
// RULE-004   same act on the same effect).
// RULE-004 wrong product: one route that moves a state outside the table — an approve that trusts its token and not the
// RULE-004   state (a rejected or cancelled request approved with the token read while it was pending), a reject of an
// RULE-004   approved request, a second cancel that rewrites who cancelled, a switch-on that restores cancelled requests,
// RULE-004   a send that takes a state from its body, an own cancel that revives a rejected request, a job that moves
// RULE-004   past pending requests on, a re-approval that writes a new decision.
// RULE-004 given: zone Pacific/Kiritimati, a fresh year Y, today D0 (the first Monday on or after 2 March). Member O: P
// RULE-004   (D0+21..D0+22) pending; AP (D0+7..D0+8) approved; RJ (D0+14..D0+15) rejected; OC (D0+28..D0+29) cancelled by
// RULE-004   O; AC (D0+35..D0+36) approved, then cancelled whole by the admin; PC (D0+1..D0+4) approved, then partly
// RULE-004   cancelled at D0+3. Member Z: ZP (D0+42..D0+43) pending and ZA (D0+49..D0+50) approved, both cancelled by
// RULE-004   switching Z off at D0+3. Before each request left its state, the admin's effect step was read for every act
// RULE-004   on it (approve, reject; cancel when approved), and those tokens are kept.
// RULE-004 when: at D0+3, on the admin's session: each stale token replayed on its act; the effect step asked again for
// RULE-004   every act on every non-pending request and any token it gives acted on; every route of the route folder (less
// RULE-004   the control door and the sign-in routes) with every method it answers, each :id filled with each non-pending
// RULE-004   request and its owner, the body carrying each stale token, on:true, a note, state:'pending' and
// RULE-004   status:'pending'; Z switched back on. On O's session: an own cancel of RJ, OC and AC; every route again with the
// RULE-004   same ids and bodies. O sends a new request whose body says state:'approved'. Then the clock moves past P's days.
// RULE-004 then: P is pending; AP and PC approved; RJ rejected; OC, AC, ZP and ZA cancelled; the new request is pending
// RULE-004   (or was refused and nothing was stored); every request's record on the admin's view is deep-equal to the one
// RULE-004   read before the attempts (so no decision or cancel was rewritten), and after the clock move every state is
// RULE-004   still the same.
// RULE-004 controls: the control case builds the same fixture and shows (a) each allowed move happened (AP approved, RJ
// RULE-004   rejected, OC and AC cancelled, PC approved, ZP and ZA cancelled, P pending) and the reading sees every state;
// RULE-004   (b) a token read on a pending request is still good when nothing moved: the admin approves P with the token
// RULE-004   read at the start, and P is then approved — so the target's refusals are the state's doing.
// RULE-004 technique: every forbidden (from, to) pair attempted through every door that changes a state, real tokens so
// RULE-004   no other guard stands in the way; a deep-equal before/after of every record; the clock moved past a pending
// RULE-004   request's days for "never any other way".
// RULE-004 cases: RULE-004 target=RULE-004.no-route-moves-a-request-outside-the-state-table control=RULE-004.control.the-allowed-moves-happen-and-an-unmoved-token-still-acts
import { test, expect } from '@playwright/test';
import {
  actWithToken,
  adminCancel,
  approve,
  cancelOwnRequest,
  confirmedActionRoutes,
  createMember,
  readEffect,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type ConfirmedAction,
  type Member,
} from './harness';
import { addDays, day, onOrAfter, pickYear, teamAt, TEAM_ZONE } from './request-rules';
import { observeOwnRequests, observePersonRequests, recordById, show, stateOf, type Rec } from './records';
import { addressesOf, callRoute, everyMethodOf, ruleRoutes, type Binding } from './rule-census';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

type Label = 'P' | 'AP' | 'RJ' | 'OC' | 'AC' | 'PC' | 'ZP' | 'ZA';

/** The state each request holds once the fixture is built (the table's allowed moves, made). */
const EXPECTED: Record<Label, string> = {
  P: 'pending',
  AP: 'approved',
  RJ: 'rejected',
  OC: 'cancelled',
  AC: 'cancelled',
  PC: 'approved',
  ZP: 'cancelled',
  ZA: 'cancelled',
};

interface World {
  Y: number;
  D0: string;
  admin: Actor;
  o: Member;
  z: Member;
  oSession: Actor;
  ids: Record<Label, AccountId>;
  owner: Record<Label, 'o' | 'z'>;
  /** Tokens read before each request left its state: [label, action, token]. */
  stale: [Label, ConfirmedAction, string][];
}

async function tokenOf(admin: Actor, action: ConfirmedAction, id: AccountId): Promise<string> {
  return (await readEffect(admin, action, id)).token;
}

async function build(): Promise<World> {
  const Y = pickYear();
  const D0 = onOrAfter(day(Y, 3, 2), 1);
  const at = (k: number) => addDays(D0, k);
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(D0) });
  const admin = keep(await signIn(install.admin));
  const o = await createMember(admin, { allowance: 30 });
  const z = await createMember(admin, { allowance: 30 });
  const oSession = keep(await signInMember(o));
  const zSession = keep(await signInMember(z));
  const span: Record<Label, [number, number]> = { P: [21, 22], AP: [7, 8], RJ: [14, 15], OC: [28, 29], AC: [35, 36], PC: [1, 4], ZP: [42, 43], ZA: [49, 50] };
  const owner: Record<Label, 'o' | 'z'> = { P: 'o', AP: 'o', RJ: 'o', OC: 'o', AC: 'o', PC: 'o', ZP: 'z', ZA: 'z' };
  const ids = {} as Record<Label, AccountId>;
  for (const label of Object.keys(span) as Label[]) {
    const [a, b] = span[label];
    ids[label] = await sendRequest(owner[label] === 'o' ? oSession : zSession, { kind: 'vacation', firstDay: at(a), lastDay: at(b) });
  }
  const stale: [Label, ConfirmedAction, string][] = [];
  const keepTokens = async (label: Label, actions: ConfirmedAction[]) => {
    for (const action of actions) stale.push([label, action, await tokenOf(admin, action, ids[label])]);
  };
  // Pending -> approved, with the pending request's approve and reject tokens kept.
  for (const label of ['AP', 'AC', 'PC', 'ZA'] as Label[]) {
    await keepTokens(label, ['approve', 'reject']);
    await approve(admin, ids[label]);
  }
  // Pending -> rejected; pending -> cancelled by the owner.
  await keepTokens('RJ', ['approve', 'reject']);
  await reject(admin, ids.RJ);
  await keepTokens('OC', ['approve', 'reject']);
  await cancelOwnRequest(oSession, ids.OC);
  await keepTokens('ZP', ['approve', 'reject']);
  // Approved -> cancelled (whole and partly) at D0+3, and the switch-off's cancels.
  await setClock(teamAt(at(3)));
  for (const label of ['AC', 'PC', 'ZA'] as Label[]) await keepTokens(label, ['cancel']);
  await adminCancel(admin, ids.AC);
  await adminCancel(admin, ids.PC);
  await switchAccount(admin, z.id, false);
  return { Y, D0, admin, o, z, oSession, ids, owner, stale };
}

/** Every request's record as the admin's view of its owner's requests carries it. */
async function records(w: World): Promise<Record<Label, Rec | undefined>> {
  const views = { o: await observePersonRequests(w.admin, w.o.id), z: await observePersonRequests(w.admin, w.z.id) };
  const out = {} as Record<Label, Rec | undefined>;
  for (const label of Object.keys(w.ids) as Label[]) out[label] = recordById(views[w.owner[label]], w.ids[label]);
  return out;
}

function states(recs: Record<Label, Rec | undefined>): Record<Label, string | undefined> {
  const out = {} as Record<Label, string | undefined>;
  for (const label of Object.keys(recs) as Label[]) {
    const s = stateOf(recs[label]);
    out[label] = s === 'canceled' ? 'cancelled' : s;
  }
  return out;
}

test('RULE-004.control.the-allowed-moves-happen-and-an-unmoved-token-still-acts', async () => {
  test.setTimeout(180_000);
  const tokenP = { value: '' };
  const w = await build();
  // A token read on P now, and P left as it is until the act: the token is still good.
  tokenP.value = await tokenOf(w.admin, 'approve', w.ids.P);
  expect(states(await records(w)), 'RULE-004 control: every allowed move happened and the reading sees each state').toEqual(EXPECTED);
  const res = await actWithToken(w.admin, 'approve', w.ids.P, tokenP.value);
  expect(res.status() >= 200 && res.status() < 300, `RULE-004 control: the approve act with P's unmoved token answers 2xx (answered ${res.status()})`).toBe(true);
  expect(states(await records(w)).P, 'RULE-004 control: P is then approved').toBe('approved');
});

test('RULE-004.no-route-moves-a-request-outside-the-state-table', async () => {
  test.setTimeout(600_000);
  const w = await build();
  const before = await records(w);
  expect(states(before), 'RULE-004 (setup): the fixture holds the allowed moves').toEqual(EXPECTED);
  const moved = (label: Label) => label !== 'P';

  // 1. Every stale token on its own act (rejected -> approved, approved -> rejected, cancelled -> approved, cancelled again …).
  for (const [label, action, token] of w.stale) {
    if (!moved(label)) continue;
    const res = await actWithToken(w.admin, action, w.ids[label], token);
    expect.soft(res.status() >= 200 && res.status() < 300, `RULE-004 ${label} (${EXPECTED[label]}): the ${action} act with the token read before it moved is refused (answered ${res.status()})`).toBe(false);
  }

  // 2. The effect step asked again for every act on every non-pending request; any token it gives is acted on.
  for (const label of (Object.keys(w.ids) as Label[]).filter(moved)) {
    for (const action of ['approve', 'reject', 'cancel'] as ConfirmedAction[]) {
      if (action === 'cancel' && (label === 'AP' || label === 'PC')) continue; // approved -> cancelled is a move the table allows
      const { effect } = confirmedActionRoutes(action, w.ids[label]);
      const eff = await w.admin.api.get(effect);
      let token: string | undefined;
      try {
        token = eff.ok() ? ((await eff.json()) as { token?: string }).token : undefined;
      } catch {
        token = undefined;
      }
      if (!token) continue;
      const res = await actWithToken(w.admin, action, w.ids[label], token);
      expect.soft(res.status() >= 200 && res.status() < 300, `RULE-004 ${label} (${EXPECTED[label]}): the ${action} act with a fresh effect token is refused (answered ${res.status()})`).toBe(false);
    }
  }

  // 3. Every route of the route folder, every method, each :id a non-pending request and its owner, on the admin's and
  //    the owner's sessions, with each stale token in the body and a state the body asks for.
  const owners = { o: w.o.id, z: w.z.id };
  const bindings: (Binding & { token: string })[] = w.stale
    .filter(([label]) => moved(label))
    .map(([label, action, token]) => ({ label: `${label} ${action}`, request: w.ids[label], account: owners[w.owner[label]], token }));
  for (const api of [w.admin.api, w.oSession.api]) {
    for (const route of ruleRoutes()) {
      for (const method of everyMethodOf(route)) {
        if (method === 'GET') continue; // a read changes no state; the effect reads are step 2's
        for (const { address, binding } of addressesOf(route, bindings)) {
          const b = binding as Binding & { token: string };
          // A cancel route on an approved request is the table's own approved -> cancelled (who may make it is REQ-005's
          // and INV-003's question, not this rule's); the walk leaves it out.
          if (/cancel/.test(route.pattern) && [w.ids.AP, w.ids.PC].map(String).includes(String(b.request))) continue;
          await callRoute(api, method, address, { token: b.token, on: true, note: 'x', state: 'pending', status: 'pending' });
        }
      }
    }
  }

  // 4. The owner's own cancel of a rejected and of a cancelled request; Z switched back on.
  for (const label of ['RJ', 'OC', 'AC'] as Label[]) {
    const res = await w.oSession.api.post(`/api/requests/${encodeURIComponent(String(w.ids[label]))}/cancel`);
    expect.soft(res.status() >= 200 && res.status() < 300, `RULE-004 ${label} (${EXPECTED[label]}): the owner's own cancel is refused (answered ${res.status()})`).toBe(false);
  }
  // Z switched back on (the walk above may already have done it; either way the act is attempted once more here).
  await w.admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(w.z.id))}/switch`, { data: { on: true } });

  // 5. A send whose body asks for a state.
  const sent = await w.oSession.api.post('/api/requests', {
    data: { kind: 'vacation', firstDay: addDays(w.D0, 56), lastDay: addDays(w.D0, 57), state: 'approved', status: 'approved' },
  });
  let newId: AccountId | undefined;
  if (sent.ok()) newId = ((await sent.json().catch(() => ({}))) as { id?: AccountId }).id;
  const own = await observeOwnRequests(w.oSession);
  if (newId !== undefined) {
    const s = stateOf(recordById(own, newId));
    expect.soft(s, `RULE-004 a send whose body says state:'approved' starts pending (${show(recordById(own, newId))})`).toBe('pending');
  } else {
    const stored = JSON.stringify(own).includes(addDays(w.D0, 56));
    expect.soft(stored, `RULE-004 a refused send whose body says state:'approved' stored nothing (answered ${sent.status()})`).toBe(false);
  }

  // Then: every state where the table left it, every record as it was.
  const after = await records(w);
  expect.soft(states(after), 'RULE-004: after every attempt each request is in the state the allowed moves left it').toEqual(EXPECTED);
  for (const label of Object.keys(w.ids) as Label[]) {
    expect.soft(after[label], `RULE-004 ${label}: its record is as it was (no decision or cancel rewritten)`).toEqual(before[label]);
  }

  // Never any other way: the clock moves past P's days; nothing moves by itself.
  await setClock(teamAt(addDays(w.D0, 30)));
  expect.soft(states(await records(w)), 'RULE-004: after P\'s days pass, P is still pending and every other state is the same').toEqual(EXPECTED);
});
