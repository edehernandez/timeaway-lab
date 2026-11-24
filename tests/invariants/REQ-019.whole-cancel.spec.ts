// Purpose: ledger test for ROW-095 (REQ-019) — an approved request with no Monday to Friday day before today becomes cancelled when the admin cancels it or switches its account off, even when its past days are a Saturday and a Sunday.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve, the admin's cancel, switch off and back on), read through records.ts, fresh per run.
//
// Boundary (R6): a lifecycle rule, at the HTTP harness (the admin's view of the person's requests, the person's own
// list, the balance and the calendar, D-029). A switched-off person's own list and balance are read after the admin
// switches them back on (REQ-016: that restores nothing).
//
// The scenario (team zone Pacific/Auckland): every request sent Mon 2027-03-01 09:00 and approved Tue 03-02 09:00;
// the cancels at Mon 2027-03-08 09:00 (UTC still Sun 03-07).
//   W1 (the admin cancels) and W2 (switched off): Sat 03-06 … Wed 03-10 — past days Sat 03-06 and Sun 03-07 only, every
//      weekday (03-08, 03-09, 03-10) from today on: must become cancelled.
//   P  (the admin cancels) and Q (switched off): Fri 03-05 … Tue 03-09 — a weekday (Fri 03-05) before today: the decoys
//      that must stay approved, so a product that cancels every request wholly cannot pass.
// Each person's allowance is 25.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  readBalance,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
  type RequestSpec,
} from './harness';
import {
  actAt,
  actBy,
  awayOn,
  CANCELLED,
  daysLeftIn,
  normalState,
  observeCalendar,
  observeOwnRequests,
  observePersonRequests,
  requestViews,
  show,
  stateOf,
  teamInstant,
  whoOf,
  type Rec,
  type Who,
} from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_SEND = teamInstant('2027-03-01', '09:00', TZ);
const T_APPROVE = teamInstant('2027-03-02', '09:00', TZ);
const T_CANCEL = teamInstant('2027-03-08', '09:00', TZ); // Mon; UTC Sun 03-07
const W_SPEC: RequestSpec = { kind: 'vacation', firstDay: '2027-03-06', lastDay: '2027-03-10' };
const P_SPEC: RequestSpec = { kind: 'vacation', firstDay: '2027-03-05', lastDay: '2027-03-09' };

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
  await setClock(null).catch(() => undefined);
});

interface Case {
  label: string;
  door: 'admin cancel' | 'switch-off';
  member: Member;
  actor: Actor | null;
  requestId: AccountId;
  spec: RequestSpec;
}

async function scenario(upTo: 'approved' | 'cancelled'): Promise<{ admin: Actor; adminWho: Who; whole: Case[]; decoys: Case[] }> {
  const install = await resetProduct({ now: T_SEND, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const make = async (label: string, door: Case['door'], spec: RequestSpec): Promise<Case> => {
    const member = await createMember(admin, { name: freshName(label), allowance: 25 });
    const actor = keep(await signInMember(member));
    return { label, door, member, actor, requestId: await sendRequest(actor, spec), spec };
  };
  const whole = [await make('W1', 'admin cancel', W_SPEC), await make('W2', 'switch-off', W_SPEC)];
  const decoys = [await make('P', 'admin cancel', P_SPEC), await make('Q', 'switch-off', P_SPEC)];
  await setClock(T_APPROVE);
  for (const c of [...whole, ...decoys]) await approve(admin, c.requestId);
  const sc = { admin, adminWho: whoOf(admin), whole, decoys };
  if (upTo === 'approved') return sc;
  await setClock(T_CANCEL);
  for (const c of [...whole, ...decoys]) {
    if (c.door === 'admin cancel') await adminCancel(admin, c.requestId);
    else {
      await switchAccount(admin, c.member.id, false);
      c.actor = null;
    }
  }
  return sc;
}

async function viewsOfCase(admin: Actor, c: Case): Promise<Rec[]> {
  const views: unknown[] = [await observePersonRequests(admin, c.member.id)];
  if (c.actor) views.push(await observeOwnRequests(c.actor));
  return requestViews(c.requestId, c.spec.firstDay, ...views);
}

// ---------------------------------------------------------------------------------------------------
// ROW-095 promise: REQ-019 fail-if (5) "an approved request with no Monday to Friday day before today stays approved
// ROW-095   after a cancel"; REQ-019 "an approved request with no Monday to Friday day before today becomes cancelled
// ROW-095   instead" (A-030: "a request with no day before today becomes cancelled; the same when an account is switched
// ROW-095   off"; F-17: day means Monday to Friday day). The row's cases: run under both the admin's cancel and a
// ROW-095   switch-off; a request whose only past days are a Saturday and Sunday and every weekday from today on becomes
// ROW-095   cancelled.
// ROW-095 wrong product: a rule "has any day before today → partial" that counts Saturday and Sunday as days, so W1
// ROW-095   and W2 stay approved with nothing in effect; or a switch-off that always shortens and never cancels.
// ROW-095 given: W1 and W2 (past days Sat and Sun only), P and Q (a past Friday) approved. when: on Mon 03-08 the admin
// ROW-095   cancels W1 and P and switches W2 and Q off. then: W1 and W2 read "cancelled" in every view (W2's own list
// ROW-095   after switching back on), record the admin and the cancel instant as who and when (D-020), give back all
// ROW-095   three days (25 left) and leave the calendar; P and Q stay approved with Fri 03-05 in effect (24 left).
// ROW-095 controls: the control case stops after the approvals: W1 and W2 read approved, show on 03-08…03-10 and have
// ROW-095   22 days left — so "cancelled" and the given-back days are new after the action.
// ROW-095 technique: the threshold of the rule — only weekend days before today against a single weekday before
// ROW-095   today — under both doors, the decoys run in the same cancel moment.
// ROW-095 cases: ROW-095 target=ROW-095.REQ-019.a-request-with-only-weekend-days-past-becomes-cancelled control=ROW-095.control.before-the-cancels-the-requests-are-approved-and-counted
test('ROW-095.control.before-the-cancels-the-requests-are-approved-and-counted', async () => {
  const sc = await scenario('approved');
  const cal = await observeCalendar(sc.admin, 2027, 3);
  for (const c of sc.whole) {
    const views = await viewsOfCase(sc.admin, c);
    expect.soft(views.map((r) => normalState(stateOf(r))), `ROW-095 control: ${c.label} reads approved (${show(views)})`).toContain('approved');
    expect.soft(daysLeftIn(await readBalance(c.actor!), 2027), `ROW-095 control: ${c.label} has 22 days left`).toBe(22);
    for (const d of ['2027-03-08', '2027-03-09', '2027-03-10']) {
      expect.soft(awayOn(cal, d), `ROW-095 control: ${c.label} is on the calendar on ${d}`).toContain(c.member.name);
    }
  }
});

test('ROW-095.REQ-019.a-request-with-only-weekend-days-past-becomes-cancelled', async () => {
  const sc = await scenario('cancelled');
  const readStates = async (phase: string) => {
    for (const c of sc.whole) {
      const views = await viewsOfCase(sc.admin, c);
      expect.soft(views.length, `ROW-095: ${c.label} (${c.door}) is listed ${phase}`).toBeGreaterThan(0);
      for (const r of views) expect.soft(normalState(stateOf(r)), `ROW-095: ${c.label} (${c.door}) reads cancelled ${phase} (${show(r)})`).toBe('cancelled');
      expect.soft(actBy(views, CANCELLED, sc.adminWho), `ROW-095: ${c.label} (${c.door}) records the admin as who cancelled`).toBe(true);
      expect.soft(actAt(views, CANCELLED, T_CANCEL, TZ), `ROW-095: ${c.label} (${c.door}) records when it was cancelled`).toBe(true);
    }
    for (const c of sc.decoys) {
      const views = await viewsOfCase(sc.admin, c);
      for (const r of views) expect.soft(normalState(stateOf(r)), `ROW-095: decoy ${c.label} (${c.door}, a weekday before today) stays approved ${phase} (${show(r)})`).toBe('approved');
    }
  };
  await readStates('right after the cancel');
  for (const c of [...sc.whole, ...sc.decoys]) {
    if (c.actor === null) {
      await switchAccount(sc.admin, c.member.id, true);
      c.actor = keep(await signInMember(c.member));
    }
  }
  await readStates('with the switched-off ones back on');
  const cal = await observeCalendar(sc.admin, 2027, 3);
  for (const c of sc.whole) {
    expect.soft(daysLeftIn(await readBalance(c.actor!), 2027), `ROW-095: ${c.label} (${c.door}) gives back all three days: 25 left`).toBe(25);
    for (const d of ['2027-03-08', '2027-03-09', '2027-03-10']) {
      expect.soft(awayOn(cal, d), `ROW-095: ${c.label} (${c.door}) is off the calendar on ${d}`).not.toContain(c.member.name);
    }
  }
  for (const c of sc.decoys) {
    expect.soft(daysLeftIn(await readBalance(c.actor!), 2027), `ROW-095: decoy ${c.label} (${c.door}) keeps Fri 03-05 in effect: 24 left`).toBe(24);
    expect.soft(awayOn(cal, '2027-03-05'), `ROW-095: decoy ${c.label} still shows on Fri 03-05`).toContain(c.member.name);
  }
});
