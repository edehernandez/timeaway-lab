// Purpose: ledger test for ROW-200 (REQ-016, REQ-019, REQ-015, REQ-011, REQ-009) — a switch-off, a partial cancel, a password set and change, an allowance change, an approval and a rejection, with no failure, each complete every part of their effect.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, the admin's cancel, allowance, password set and change, switch off), fresh per run; the team clock moved through the harness (setClock) in Pacific/Auckland.
//
// ROW-200 promise: control of ROW-199 — each action's parts as its item names them: REQ-009 "approving makes it
// ROW-200   approved and puts its days on the calendar; rejecting makes it rejected and frees its pending days";
// ROW-200   REQ-019/REQ-010 a partial cancel keeps the request approved, records the cancel day and who, returns the
// ROW-200   days from today on and takes them off the calendar; REQ-011 a change starting this year changes this
// ROW-200   year's days left at once and later years'; REQ-015 the old password no longer signs in and every other
// ROW-200   open session ends; REQ-016 switching off cancels pending requests and approved days from today on,
// ROW-200   which leave the calendar, keeps days before today, and ends the account's sessions (REQ-014).
// ROW-200 wrong product: an action that does one part and drops another — an approval that flips the state but
// ROW-200   leaves the balance or the calendar; a partial cancel that records the day but leaves the days counted;
// ROW-200   a password set that leaves the old session open; a switch-off that blocks sign-in but cancels nothing.
// ROW-200 given: team Mon 2027-03-01; P (allowance 25) sends A vacation 04-05..09, B vacation 04-12..13, C
// ROW-200   vacation 03-08..19, D sick 04-19..20; C approved. when, in turn: approve A; reject B; at Wed 03-10
// ROW-200   the admin cancels C (partly); allowance 30 from this year; the admin sets P's password; P changes it;
// ROW-200   the admin switches P off. then: after each action every part of its effect reads back, as listed.
// ROW-200 controls: before each action the parts it changes read their old values (pending, the old figure,
// ROW-200   absent from the calendar, the old password signing in, the session open); the control case builds
// ROW-200   the same starting state and reads it, untouched by any action's fault.
// ROW-200 technique: before-and-after per part, each part read at its own place (record, balance year,
// ROW-200   calendar day, sign-in, session).
// ROW-200 cases: ROW-200 target=ROW-200.REQ-016.multi-record-actions-complete-every-part control=ROW-200.control.the-starting-state-reads-back
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  anonymousApi,
  approve,
  createMember,
  freshPassword,
  readBalance,
  reject,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  setPassword,
  signIn,
  switchAccount,
  type Actor,
  type Member,
} from './harness';
import { byId, readPersonRequests, refIs } from './request-records';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland
const TP = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).ok();
  } finally {
    await api.dispose();
  }
}

async function sessionWorks(a: Actor): Promise<boolean> {
  return (await a.api.get('/api/me')).status() === 200;
}

async function onCalendar(admin: Actor, person: Member, day: string): Promise<boolean> {
  const [y, m] = day.split('-').map(Number);
  const res = await admin.api.get(`/api/calendar?year=${y}&month=${m}`);
  expect(res.ok(), `GET /api/calendar?year=${y}&month=${m} answers`).toBe(true);
  const body = (await res.json()) as { days?: { date: string; people?: { name?: string; accountId?: unknown }[] }[] };
  return (body.days?.find((d) => d.date === day)?.people ?? []).some((x) => String(x.accountId) === String(person.id) || x.name === person.name);
}

async function year(a: Actor, y: number): Promise<[number | undefined, number | undefined]> {
  const e = (await readBalance(a)).years.find((x) => x.year === y);
  return [e?.daysLeft, e?.pending];
}

test('ROW-200.control.the-starting-state-reads-back', async () => {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const p = await createMember(admin, { allowance: 25 });
  const s = await signIn({ email: p.email, password: p.password });
  try {
    const ids = [
      await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' }),
      await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }),
      await sendRequest(s, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }),
      await sendRequest(s, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }),
    ].map(String);
    await approve(admin, ids[2]);
    const list = await readPersonRequests(admin, p.id);
    expect.soft(ids.map((id) => byId(list, id)?.state), 'ROW-200 control: A, B, D pending and C approved').toEqual(['pending', 'pending', 'approved', 'pending']);
    expect.soft(await year(s, 2027), 'ROW-200 control: 2027 shows 15 left, 7 pending').toEqual([15, 7]);
    expect.soft(await onCalendar(admin, p, '2027-03-09'), 'ROW-200 control: 03-09 lists P').toBe(true);
  } finally {
    await s.dispose();
    await admin.dispose();
  }
});

test('ROW-200.REQ-016.multi-record-actions-complete-every-part', async () => {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const adminRef = { id: admin.me.id, name: install.admin.name };
  const p = await createMember(admin, { allowance: 25 });
  const sessions: Actor[] = [];
  const open = async (password: string) => {
    const s = await signIn({ email: p.email, password });
    sessions.push(s);
    return s;
  };
  try {
    let s = await open(p.password);
    const a = String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' }));
    const b = String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }));
    const c = String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }));
    const d = String(await sendRequest(s, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }));
    await approve(admin, c);
    const rec = async (id: string) => byId(await readPersonRequests(admin, p.id), id);

    // Approval.
    expect([await year(s, 2027), await onCalendar(admin, p, '2027-04-05')], 'ROW-200 before approval: 15 left, 7 pending; 04-05 not on the calendar').toEqual([[15, 7], false]);
    await approve(admin, a);
    const ra = await rec(a);
    expect.soft(ra?.state, 'ROW-200 approval: A is approved').toBe('approved');
    expect.soft(refIs(ra?.decidedBy ?? null, adminRef), 'ROW-200 approval: A records the admin as decider').toBe(true);
    expect.soft(await year(s, 2027), 'ROW-200 approval: 10 left, 2 pending').toEqual([10, 2]);
    expect.soft(await onCalendar(admin, p, '2027-04-05'), 'ROW-200 approval: 04-05 lists P on the calendar').toBe(true);

    // Rejection.
    await reject(admin, b);
    const rb = await rec(b);
    expect.soft(rb?.state, 'ROW-200 rejection: B is rejected').toBe('rejected');
    expect.soft(refIs(rb?.decidedBy ?? null, adminRef), 'ROW-200 rejection: B records the admin as decider').toBe(true);
    expect.soft(await year(s, 2027), 'ROW-200 rejection: 10 left, 0 pending').toEqual([10, 0]);
    expect.soft(await onCalendar(admin, p, '2027-04-12'), 'ROW-200 rejection: 04-12 does not list P').toBe(false);

    // Partial cancel, at Wed 03-10.
    await setClock(TP);
    expect(await onCalendar(admin, p, '2027-03-10'), 'ROW-200 before partial cancel: 03-10 lists P').toBe(true);
    await adminCancel(admin, c);
    const rc = await rec(c);
    expect.soft(rc?.state, 'ROW-200 partial cancel: C stays approved').toBe('approved');
    expect.soft(rc?.cancelDay, 'ROW-200 partial cancel: C records the cancel day 03-10').toBe('2027-03-10');
    expect.soft(refIs(rc?.cancelledBy ?? null, adminRef), 'ROW-200 partial cancel: C records the admin as canceller').toBe(true);
    expect.soft(await year(s, 2027), 'ROW-200 partial cancel: 18 left (5 + 2 days in effect), 0 pending').toEqual([18, 0]);
    expect.soft(await onCalendar(admin, p, '2027-03-10'), 'ROW-200 partial cancel: 03-10 no longer lists P').toBe(false);
    expect.soft(await onCalendar(admin, p, '2027-03-09'), 'ROW-200 partial cancel: 03-09 still lists P').toBe(true);

    // Allowance change, starting this year.
    expect((await year(s, 2028))[0], 'ROW-200 before allowance change: 2028 shows 25').toBe(25);
    await setAllowance(admin, p.id, 30);
    expect.soft((await year(s, 2027))[0], 'ROW-200 allowance change: 2027 shows 23 left at once').toBe(23);
    expect.soft((await year(s, 2028))[0], 'ROW-200 allowance change: 2028 shows 30').toBe(30);

    // Password set by the admin.
    expect(await sessionWorks(s), 'ROW-200 before password set: P\'s session works').toBe(true);
    const set = freshPassword();
    await setPassword(admin, p.id, set);
    expect.soft(await signsIn(p.email, p.password), 'ROW-200 password set: the old password no longer signs in').toBe(false);
    expect.soft(await signsIn(p.email, set), 'ROW-200 password set: the set password signs in').toBe(true);
    expect.soft(await sessionWorks(s), 'ROW-200 password set: P\'s open session has ended').toBe(false);

    // Password change by P.
    const changer = await open(set);
    const other = await open(set);
    const chosen = freshPassword();
    const res = await changer.api.post('/api/me/password', { data: { current: set, next: chosen } });
    expect.soft(res.ok(), `ROW-200 password change: accepted (answered ${res.status()})`).toBe(true);
    expect.soft(await signsIn(p.email, set), 'ROW-200 password change: the old password no longer signs in').toBe(false);
    expect.soft(await signsIn(p.email, chosen), 'ROW-200 password change: the new password signs in').toBe(true);
    expect.soft(await sessionWorks(other), 'ROW-200 password change: P\'s other session has ended').toBe(false);
    expect.soft(await sessionWorks(changer), 'ROW-200 password change: the changer\'s session still works').toBe(true);

    // Switch-off, at Wed 03-10: D pending, A approved future, C already cut.
    s = await open(chosen);
    expect(await onCalendar(admin, p, '2027-04-05'), 'ROW-200 before switch-off: 04-05 lists P').toBe(true);
    await switchAccount(admin, p.id, false);
    const [rd, ra2, rc2] = [await rec(d), await rec(a), await rec(c)];
    expect.soft(rd?.state, 'ROW-200 switch-off: the pending D is cancelled').toBe('cancelled');
    expect.soft(ra2?.state, 'ROW-200 switch-off: the approved future A is cancelled').toBe('cancelled');
    expect.soft([rc2?.state, rc2?.cancelDay], 'ROW-200 switch-off: C (no day in effect from today on) is unchanged').toEqual(['approved', '2027-03-10']);
    expect.soft(await onCalendar(admin, p, '2027-04-05'), 'ROW-200 switch-off: 04-05 no longer lists P').toBe(false);
    expect.soft(await onCalendar(admin, p, '2027-03-09'), 'ROW-200 switch-off: 03-09 (before today) still lists P').toBe(true);
    expect.soft(await signsIn(p.email, chosen), 'ROW-200 switch-off: P can no longer sign in').toBe(false);
    expect.soft(await sessionWorks(s), 'ROW-200 switch-off: P\'s open session has ended').toBe(false);
  } finally {
    for (const x of sessions) await x.dispose().catch(() => undefined);
    await admin.dispose();
  }
});
