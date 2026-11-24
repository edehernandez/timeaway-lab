// Purpose: ledger tests for ROW-079 and ROW-084 (REQ-016) — switching an account off cancels its pending requests, and is refused while it holds a pending request with a Monday to Friday day before today.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions), fresh per run.
//
// Boundary (R6): rules about the switch-off, proved at the HTTP harness. The switch-off under test is D-029's two
// confirmed steps, posted raw (GET /api/admin/accounts/:id/effect?action=switch-off, then
// POST /api/admin/accounts/:id/switch {on:false, token}, harness.ts confirmedActionRoutes): refused at either step
// is refused. "Still pending" is observed without the product's field names: the admin's pending list carries the
// person's fresh name (REQ-008: each pending request with the person's name), and a pending request can still be
// approved onto the calendar; a cancelled one cannot (REQ-005, REQ-009).
// Time: today is Mon 2027-03-08 in Pacific/Auckland at an instant where UTC is still Sunday 03-07; the weekdays
// before today are Fri 03-05 and earlier; Sat 03-06 and Sun 03-07 are the weekend just before today.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  approve,
  confirmedActionRoutes,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Credentials,
  type Member,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 NZDT; UTC still Sunday 03-07

const actors: Actor[] = [];
async function track(p: Promise<Actor>): Promise<Actor> {
  const a = await p;
  actors.push(a);
  return a;
}
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface Person {
  m: Member;
  a: Actor;
}

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return track(signIn(install.admin));
}

async function person(admin: Actor, label: string): Promise<Person> {
  const m = await createMember(admin, { name: freshName(label) });
  return { m, a: await track(signInMember(m)) };
}

/** The switch-off's two steps, raw: accepted only when both answer 2xx. */
async function attemptSwitchOff(admin: Actor, id: AccountId): Promise<{ ok: boolean; status: number; step: string }> {
  const { effect, act } = confirmedActionRoutes('switch-off', id);
  const e = await admin.api.get(effect);
  if (!e.ok()) return { ok: false, status: e.status(), step: `GET ${effect}` };
  const token = ((await e.json().catch(() => null)) as { token?: unknown } | null)?.token;
  const r = await admin.api.post(act, { data: { on: false, token: typeof token === 'string' ? token : '' } });
  return { ok: r.ok(), status: r.status(), step: `POST ${act}` };
}

/** An approve's two steps, raw: true when the request was approved. */
async function attemptApprove(admin: Actor, requestId: AccountId): Promise<boolean> {
  const { effect, act } = confirmedActionRoutes('approve', requestId);
  const e = await admin.api.get(effect);
  if (!e.ok()) return false;
  const token = ((await e.json().catch(() => null)) as { token?: unknown } | null)?.token;
  return (await admin.api.post(act, { data: { token: typeof token === 'string' ? token : '' } })).ok();
}

async function pendingText(admin: Actor, row: string): Promise<string> {
  const res = await admin.api.get('/api/admin/pending');
  expect(res.status(), `${row}: GET /api/admin/pending answers the admin`).toBe(200);
  return res.text();
}

async function marchDates(viewer: Actor, name: string, row: string): Promise<string[]> {
  const res = await viewer.api.get('/api/calendar?year=2027&month=3');
  expect(res.status(), `${row}: GET /api/calendar?year=2027&month=3 answers`).toBe(200);
  const body = (await res.json().catch(() => null)) as { days?: { date?: unknown; people?: { name?: unknown }[] }[] } | null;
  return (body?.days ?? [])
    .filter((d) => Array.isArray(d.people) && d.people.some((p) => p?.name === name))
    .map((d) => String(d.date))
    .sort();
}

async function canSignIn(c: Credentials): Promise<boolean> {
  const api = await anonymousApi();
  try {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const me = await api.get('/api/me');
    return r.ok() && me.status() === 200;
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-079 promise: REQ-016 fail-if (2) "a switched-off account keeps a pending request"; A-022: its pending requests
// ROW-079   are cancelled. The row's cases: switching off an account whose only pending request has all its weekdays
// ROW-079   from today on succeeds and cancels it; and one whose past part is weekend days only.
// ROW-079 wrong product: a switch-off that blocks sign-in but leaves the requests alone (still pending, still
// ROW-079   approvable onto the calendar); or one that refuses any pending request with any day before today, weekend
// ROW-079   or not (the weekend-only case is then refused, not cancelled).
// ROW-079 given: today Mon 03-08; FromToday's pending vacation Mon 03-08..Wed 03-10; WeekendPast's pending sick Sat
// ROW-079   03-06..Tue 03-09; Stayer's pending vacation Mon 03-08..Wed 03-10 (the neighbour). when: the admin switches
// ROW-079   FromToday and WeekendPast off. then: both switch-offs are accepted; the pending list no longer names either
// ROW-079   and still names Stayer; neither request can be approved and neither person is on the March calendar;
// ROW-079   Stayer's request is still approved onto 03-08..10.
// ROW-079 controls: before the switch-offs the pending list names all three (the harmful case is reached); the
// ROW-079   control case shows a pending request is listed and approving it puts it on the calendar — the
// ROW-079   observations work.
// ROW-079 technique: the row's own two examples, the boundary at today, and the neighbouring account's request on
// ROW-079   the same days that must stay pending.
// ROW-079 cases: ROW-079 target=ROW-079.REQ-016.switch-off-cancels-the-accounts-pending-requests control=ROW-079.control.a-pending-request-is-listed-and-approvable
test('ROW-079.control.a-pending-request-is-listed-and-approvable', async () => {
  const admin = await start();
  const p = await person(admin, 'FromToday');
  const id = await sendRequest(p.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  expect(await pendingText(admin, 'ROW-079 control'), 'ROW-079 control: the pending list names the person').toContain(p.m.name);
  expect(await attemptApprove(admin, id), 'ROW-079 control: the pending request can be approved').toBe(true);
  expect(await marchDates(admin, p.m.name, 'ROW-079 control'), 'ROW-079 control: the approved days show').toEqual([
    '2027-03-08',
    '2027-03-09',
    '2027-03-10',
  ]);
});

test('ROW-079.REQ-016.switch-off-cancels-the-accounts-pending-requests', async () => {
  const admin = await start();
  const fromToday = await person(admin, 'FromToday');
  const weekendPast = await person(admin, 'WeekendPast');
  const stayer = await person(admin, 'Stayer');
  const id1 = await sendRequest(fromToday.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  const id2 = await sendRequest(weekendPast.a, { kind: 'sick', firstDay: '2027-03-06', lastDay: '2027-03-09' });
  const id3 = await sendRequest(stayer.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  const before = await pendingText(admin, 'ROW-079 before');
  for (const p of [fromToday, weekendPast, stayer]) expect(before, `ROW-079 before: ${p.m.name} is pending`).toContain(p.m.name);

  const r1 = await attemptSwitchOff(admin, fromToday.m.id);
  expect.soft(r1.ok, `ROW-079: switching off an account whose pending days are all from today on is accepted (${r1.step} answered ${r1.status})`).toBe(true);
  const r2 = await attemptSwitchOff(admin, weekendPast.m.id);
  expect.soft(r2.ok, `ROW-079: switching off an account whose pending past part is a weekend is accepted (${r2.step} answered ${r2.status})`).toBe(true);

  const after = await pendingText(admin, 'ROW-079');
  expect.soft(after.includes(fromToday.m.name), 'ROW-079: FromToday\'s pending request is no longer pending').toBe(false);
  expect.soft(after.includes(weekendPast.m.name), 'ROW-079: WeekendPast\'s pending request is no longer pending').toBe(false);
  expect.soft(after.includes(stayer.m.name), 'ROW-079: Stayer\'s pending request is untouched').toBe(true);
  expect.soft(await attemptApprove(admin, id1), 'ROW-079: FromToday\'s cancelled request cannot be approved').toBe(false);
  expect.soft(await attemptApprove(admin, id2), 'ROW-079: WeekendPast\'s cancelled request cannot be approved').toBe(false);
  expect.soft(await marchDates(admin, fromToday.m.name, 'ROW-079'), 'ROW-079: FromToday is on no day').toEqual([]);
  expect.soft(await marchDates(admin, weekendPast.m.name, 'ROW-079'), 'ROW-079: WeekendPast is on no day').toEqual([]);
  expect.soft(await attemptApprove(admin, id3), 'ROW-079: Stayer\'s request is still pending and approvable').toBe(true);
  expect.soft(await marchDates(admin, stayer.m.name, 'ROW-079'), 'ROW-079: Stayer approved onto its days').toEqual([
    '2027-03-08',
    '2027-03-09',
    '2027-03-10',
  ]);
});

// ---------------------------------------------------------------------------------------------------
// ROW-084 promise: REQ-016 fail-if (7) "an account is switched off while it holds a pending request with a Monday to
// ROW-084   Friday day before today"; A-033: the switch-off is refused; the admin decides those first. The row's own
// ROW-084   examples are the near misses that must NOT be refused: all weekdays from today on, and a past part of
// ROW-084   weekend days only.
// ROW-084 wrong product: a switch-off that cancels every pending request whatever its days (A-022's rule without
// ROW-084   A-033's), or one that compares only a request's last day with today (PastFriday ends today, so it would
// ROW-084   pass), or one that counts calendar days instead of weekdays before today.
// ROW-084 given: today Mon 03-08; PastFriday's pending sick Fri 03-05..Mon 03-08; AllPast's pending sick Mon
// ROW-084   03-01..Tue 03-02. when: the admin tries to switch each off. then: each is refused with a 4xx at one of the two
// ROW-084   steps; both still sign in; the pending list still names both.
// ROW-084 controls: the control case approves PastFriday's request first, then the switch-off is accepted and the
// ROW-084   account no longer signs in — the refusal is about the undecided past weekday, and the path works. The
// ROW-084   near-miss case runs the row's own examples: both accepted.
// ROW-084 technique: values either side of today (a weekday the day before the weekend before today; weekend-only
// ROW-084   past; from today on).
// ROW-084 cases: ROW-084 target=ROW-084.REQ-016.switch-off-refused-while-a-pending-request-has-a-weekday-before-today control=ROW-084.control.decided-first-then-the-switch-off-is-accepted
test('ROW-084.control.decided-first-then-the-switch-off-is-accepted', async () => {
  const admin = await start();
  const p = await person(admin, 'PastFriday');
  await approve(admin, await sendRequest(p.a, { kind: 'sick', firstDay: '2027-03-05', lastDay: '2027-03-08' }));
  const r = await attemptSwitchOff(admin, p.m.id);
  expect(r.ok, `ROW-084 control: with nothing pending the switch-off is accepted (${r.step} answered ${r.status})`).toBe(true);
  expect(await canSignIn(p.m), 'ROW-084 control: the switched-off account no longer signs in').toBe(false);
});

test('ROW-084.REQ-016.near-miss-pending-from-today-on-or-past-weekend-only-is-switched-off', async () => {
  const admin = await start();
  const fromToday = await person(admin, 'FromToday');
  const weekendPast = await person(admin, 'WeekendPast');
  await sendRequest(fromToday.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' });
  await sendRequest(weekendPast.a, { kind: 'sick', firstDay: '2027-03-06', lastDay: '2027-03-09' });
  const r1 = await attemptSwitchOff(admin, fromToday.m.id);
  const r2 = await attemptSwitchOff(admin, weekendPast.m.id);
  expect.soft(r1.ok, `ROW-084 near miss, all weekdays from today on: accepted (${r1.step} answered ${r1.status})`).toBe(true);
  expect.soft(r2.ok, `ROW-084 near miss, past part a weekend only: accepted (${r2.step} answered ${r2.status})`).toBe(true);
  expect.soft(await canSignIn(fromToday.m), 'ROW-084 near miss: FromToday is switched off').toBe(false);
  expect.soft(await canSignIn(weekendPast.m), 'ROW-084 near miss: WeekendPast is switched off').toBe(false);
});

test('ROW-084.REQ-016.switch-off-refused-while-a-pending-request-has-a-weekday-before-today', async () => {
  const admin = await start();
  const pastFriday = await person(admin, 'PastFriday');
  const allPast = await person(admin, 'AllPast');
  await sendRequest(pastFriday.a, { kind: 'sick', firstDay: '2027-03-05', lastDay: '2027-03-08' });
  await sendRequest(allPast.a, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-02' });

  for (const p of [pastFriday, allPast]) {
    const r = await attemptSwitchOff(admin, p.m.id);
    expect.soft(r.ok, `ROW-084 ${p.m.name}: the switch-off is refused (${r.step} answered ${r.status})`).toBe(false);
    expect.soft(r.status >= 400 && r.status < 500, `ROW-084 ${p.m.name}: the refusal is a 4xx (${r.step} answered ${r.status})`).toBe(true);
  }
  expect.soft(await canSignIn(pastFriday.m), 'ROW-084: PastFriday is still switched on').toBe(true);
  expect.soft(await canSignIn(allPast.m), 'ROW-084: AllPast is still switched on').toBe(true);
  expect.soft((await pastFriday.a.api.get('/api/me')).status(), 'ROW-084: PastFriday\'s session still works').toBe(200);
  const pending = await pendingText(admin, 'ROW-084');
  expect.soft(pending.includes(pastFriday.m.name), 'ROW-084: PastFriday\'s request is still pending').toBe(true);
  expect.soft(pending.includes(allPast.m.name), 'ROW-084: AllPast\'s request is still pending').toBe(true);
});
