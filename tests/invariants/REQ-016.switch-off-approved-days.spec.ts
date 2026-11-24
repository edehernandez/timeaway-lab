// Purpose: ledger tests for ROW-080, ROW-081 and ROW-245 (REQ-016, REQ-019) — switching an account off takes its approved days from today on off the calendar, keeps its approved days before today, and leaves an earlier partial cancel's record and the days left as they were.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions, switch), fresh per run.
//
// Boundary (R6): rules about the switch-off's effect on approved requests, proved at the HTTP harness: the calendar
// (D-029 GET /api/calendar?year&month {days:[{date,people:[{name,accountId}]}]}, people matched by fresh name), the
// member's own GET /api/balance {years:[{year,daysLeft,pending}]}, and the admin's GET /api/admin/people/:id/requests,
// whose field names D-029 leaves open: the request is found there by the id POST /api/requests answered, and its
// record is compared whole, before and after.
// Time: requests are sent at Wed 2027-03-03 (vacation may not include a day before today, REQ-004); the clock then
// moves to Mon 2027-03-08 (today), each at an instant where UTC is still on the day before (BASELINE "Test
// environment"). The machine's clock is never read.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  confirmedActionRoutes,
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
  type Install,
  type Member,
} from './harness';

const T_MAR03 = '2027-03-02T20:00:00Z'; // Wed 2027-03-03 09:00 NZDT
const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 NZDT; UTC still Sunday 03-07
const T_MAR10 = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 NZDT

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

async function start(): Promise<{ install: Install; admin: Actor; viewer: Actor }> {
  const install = await resetProduct({ now: T_MAR03, timeZone: DEFAULT_TIME_ZONE });
  const admin = await track(signIn(install.admin));
  const viewer = await track(signInMember(await createMember(admin, { name: freshName('Viewer') })));
  return { install, admin, viewer };
}

async function person(admin: Actor, label: string): Promise<Person> {
  const m = await createMember(admin, { name: freshName(label) });
  return { m, a: await track(signInMember(m)) };
}

async function monthDates(viewer: Actor, year: number, month: number, name: string, row: string): Promise<string[]> {
  const res = await viewer.api.get(`/api/calendar?year=${year}&month=${month}`);
  expect(res.status(), `${row}: GET /api/calendar?year=${year}&month=${month} answers the member`).toBe(200);
  const body = (await res.json().catch(() => null)) as { days?: { date?: unknown; people?: { name?: unknown }[] }[] } | null;
  return (body?.days ?? [])
    .filter((d) => Array.isArray(d.people) && d.people.some((p) => p?.name === name))
    .map((d) => String(d.date))
    .sort();
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

const BEFORE_TODAY = ['2027-03-04', '2027-03-05'];
const FROM_TODAY = ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'];

/** Leaver: approved vacation Thu 03-04..Fri 03-12 and approved sick Mon 02-15..Tue 02-16; Stayer: approved vacation 03-08..12. Clock then at Mon 03-08. */
async function leaverWithApprovedDays(): Promise<{ admin: Actor; viewer: Actor; leaver: Person; stayer: Person }> {
  const { admin, viewer } = await start();
  const leaver = await person(admin, 'Leaver');
  const stayer = await person(admin, 'Stayer');
  await approve(admin, await sendRequest(leaver.a, { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-12' }));
  await approve(admin, await sendRequest(leaver.a, { kind: 'sick', firstDay: '2027-02-15', lastDay: '2027-02-16' }));
  await approve(admin, await sendRequest(stayer.a, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' }));
  await setClock(T_MAR08);
  return { admin, viewer, leaver, stayer };
}

// ---------------------------------------------------------------------------------------------------
// ROW-080 promise: REQ-016 fail-if (3) "a switched-off account keeps an approved day from today on, or that day
// ROW-080   stays on the calendar"; A-022: its approved requests lose their days from today on, which leave the
// ROW-080   calendar.
// ROW-080 wrong product: a switch-off that blocks sign-in and cancels pending requests but leaves approved requests
// ROW-080   whole; or one that cuts from tomorrow (today stays), or that decides today in UTC (still Sunday 03-07 at
// ROW-080   the instant used) and so keeps Monday 03-08.
// ROW-080 given: today Mon 03-08; Leaver approved Thu 03-04..Fri 03-12; Stayer approved 03-08..12 (the neighbour).
// ROW-080   when: the admin switches Leaver off. then: Leaver is on no March day from 03-08 on; Stayer is still on
// ROW-080   exactly 03-08..12.
// ROW-080 controls: before the switch-off Leaver is on 03-04, 03-05 and 03-08..12 (the days from today on are there
// ROW-080   to be taken off); the control case shows it alone.
// ROW-080 technique: the boundary at today in the team zone, at an instant where UTC's date differs; the
// ROW-080   neighbouring account's identical days that must stay.
// ROW-080 cases: ROW-080 target=ROW-080.REQ-016.switch-off-takes-approved-days-from-today-on-off-the-calendar control=ROW-080.control.before-the-switch-off-the-days-from-today-on-show
test('ROW-080.control.before-the-switch-off-the-days-from-today-on-show', async () => {
  const { viewer, leaver } = await leaverWithApprovedDays();
  expect(await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-080 control'), 'ROW-080 control: Leaver on every approved weekday').toEqual([
    ...BEFORE_TODAY,
    ...FROM_TODAY,
  ]);
});

test('ROW-080.REQ-016.switch-off-takes-approved-days-from-today-on-off-the-calendar', async () => {
  const { admin, viewer, leaver, stayer } = await leaverWithApprovedDays();
  expect(await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-080 before'), 'ROW-080 before: Leaver on every approved weekday').toEqual([
    ...BEFORE_TODAY,
    ...FROM_TODAY,
  ]);

  const r = await attemptSwitchOff(admin, leaver.m.id);
  expect(r.ok, `ROW-080: the switch-off is accepted (${r.step} answered ${r.status})`).toBe(true);

  const march = await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-080');
  expect.soft(march.filter((d) => d >= '2027-03-08'), 'ROW-080: no day from today on stays on the calendar').toEqual([]);
  expect
    .soft(await monthDates(viewer, 2027, 3, stayer.m.name, 'ROW-080'), 'ROW-080: Stayer\'s days are untouched')
    .toEqual(FROM_TODAY);
});

// ---------------------------------------------------------------------------------------------------
// ROW-081 promise: REQ-016 fail-if (4) "a switched-off account loses an approved day before today"; A-022: days
// ROW-081   already passed stay approved and on past months of the calendar.
// ROW-081 wrong product: a switch-off that cancels every approved request of the account whole, or cuts from the
// ROW-081   request's first day, or cuts one weekday too early (yesterday, Friday 03-05, lost).
// ROW-081 given: as ROW-080 — Leaver approved Thu 03-04..Fri 03-12 and sick Mon 02-15..Tue 02-16; today Mon 03-08.
// ROW-081   when: the admin switches Leaver off. then: Leaver's March days before today are exactly 03-04, 03-05, and
// ROW-081   February shows exactly 02-15, 02-16.
// ROW-081 controls: before the switch-off the same days show (the control case), so their survival is the
// ROW-081   switch-off's doing.
// ROW-081 technique: the last weekday before today (Friday, across the weekend) and a whole past month; only the
// ROW-081   days before today are judged here, so a ROW-080 fault does not fail this row.
// ROW-081 cases: ROW-081 target=ROW-081.REQ-016.switch-off-keeps-approved-days-before-today control=ROW-081.control.before-the-switch-off-the-past-days-show
test('ROW-081.control.before-the-switch-off-the-past-days-show', async () => {
  const { viewer, leaver } = await leaverWithApprovedDays();
  const march = await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-081 control');
  expect(march.filter((d) => d < '2027-03-08'), 'ROW-081 control: March days before today show').toEqual(BEFORE_TODAY);
  expect(await monthDates(viewer, 2027, 2, leaver.m.name, 'ROW-081 control'), 'ROW-081 control: February days show').toEqual([
    '2027-02-15',
    '2027-02-16',
  ]);
});

test('ROW-081.REQ-016.switch-off-keeps-approved-days-before-today', async () => {
  const { admin, viewer, leaver } = await leaverWithApprovedDays();
  const r = await attemptSwitchOff(admin, leaver.m.id);
  expect(r.ok, `ROW-081: the switch-off is accepted (${r.step} answered ${r.status})`).toBe(true);

  const march = await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-081');
  expect.soft(march.filter((d) => d < '2027-03-08'), 'ROW-081: the March days before today stay').toEqual(BEFORE_TODAY);
  expect
    .soft(await monthDates(viewer, 2027, 2, leaver.m.name, 'ROW-081'), 'ROW-081: the past month\'s days stay')
    .toEqual(['2027-02-15', '2027-02-16']);
});

// ---------------------------------------------------------------------------------------------------
// ROW-245 promise: REQ-016 with REQ-019 (A-030): the admin partly cancels an approved request and days later
// ROW-245   switches the account off: the request keeps its first cancel day and canceller, and days left do not
// ROW-245   change. REQ-019 fail-if (3): the cancel date or who cancelled is not recorded; REQ-016 cancels only the days
// ROW-245   from today on, which a partial cancel has already taken.
// ROW-245 wrong product: a switch-off that runs the admin cancel again on every approved request, overwriting the
// ROW-245   cancel day (03-08 → 03-10) and canceller; or one that recounts the cut request and changes the days left (a
// ROW-245   double return, or 03-08 and 03-09 counted back in).
// ROW-245 given: Leaver's vacation Thu 03-04..Fri 03-19 approved (12 weekdays; allowance 25); at Mon 03-08 the admin
// ROW-245   cancels it (partial: 03-04, 03-05 stay; days left 23). when: at Wed 03-10 the admin switches Leaver off.
// ROW-245   then: the request's record in the admin's GET /api/admin/people/:id/requests is deep-equal to before the
// ROW-245   switch-off; switched back on and signed in, Leaver's 2027 days left are 23, as before.
// ROW-245 controls: the control case shows, after the partial cancel, the record is found by its id, carries the
// ROW-245   cancel day 2027-03-08 and the canceller (the admin's id or name), the calendar shows only 03-04, 03-05 and the
// ROW-245   days left are 23 — so the target compares a record that holds what must be kept.
// ROW-245 technique: a deep-equal before/after of the whole record (independent of field names), with the days left
// ROW-245   computed by hand from the allowance (25 − 2), never from the product.
// ROW-245 cases: ROW-245 target=ROW-245.REQ-016.a-later-switch-off-keeps-the-partial-cancel-and-the-days-left control=ROW-245.control.the-partial-cancel-is-recorded-and-counted
/** The object carrying `id` whose own record also holds the request's first day as sent (so an account or a decider sharing the number is never taken for it). */
function findById(node: unknown, id: AccountId, firstDay: string): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = findById(x, id, firstDay);
      if (f) return f;
    }
    return undefined;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if ('id' in o && String(o.id) === String(id) && JSON.stringify(o).includes(firstDay)) return o;
    for (const v of Object.values(o)) {
      const f = findById(v, id, firstDay);
      if (f) return f;
    }
  }
  return undefined;
}

async function requestRecord(admin: Actor, accountId: AccountId, requestId: AccountId, row: string): Promise<Record<string, unknown> | undefined> {
  const route = `/api/admin/people/${encodeURIComponent(String(accountId))}/requests`;
  const res = await admin.api.get(route);
  expect(res.status(), `${row}: GET ${route} answers the admin`).toBe(200);
  return findById(await res.json(), requestId, '2027-03-04');
}

async function daysLeft2027(actor: Actor): Promise<number | undefined> {
  return (await readBalance(actor)).years.find((y) => y.year === 2027)?.daysLeft;
}

async function partlyCancelled(): Promise<{ install: Install; admin: Actor; viewer: Actor; leaver: Person; requestId: AccountId }> {
  const { install, admin, viewer } = await start();
  const leaver = await person(admin, 'Leaver');
  const requestId = await sendRequest(leaver.a, { kind: 'vacation', firstDay: '2027-03-04', lastDay: '2027-03-19' });
  await approve(admin, requestId);
  await setClock(T_MAR08);
  await adminCancel(admin, requestId);
  return { install, admin, viewer, leaver, requestId };
}

test('ROW-245.control.the-partial-cancel-is-recorded-and-counted', async () => {
  const { admin, viewer, leaver, requestId } = await partlyCancelled();
  const record = await requestRecord(admin, leaver.m.id, requestId, 'ROW-245 control');
  expect(record, 'ROW-245 control: the request is found by its id in the person\'s requests').toBeDefined();
  const text = JSON.stringify(record);
  expect(text, 'ROW-245 control: the record carries the cancel day').toContain('2027-03-08');
  expect(
    text.includes(JSON.stringify(admin.me.name)) || text.includes(String(admin.me.id)),
    'ROW-245 control: the record names the canceller',
  ).toBe(true);
  expect(await monthDates(viewer, 2027, 3, leaver.m.name, 'ROW-245 control'), 'ROW-245 control: only the days before the cancel show').toEqual(
    BEFORE_TODAY,
  );
  expect(await daysLeft2027(leaver.a), 'ROW-245 control: days left are 25 - 2').toBe(23);
});

test('ROW-245.REQ-016.a-later-switch-off-keeps-the-partial-cancel-and-the-days-left', async () => {
  const { admin, leaver, requestId } = await partlyCancelled();
  const recordBefore = await requestRecord(admin, leaver.m.id, requestId, 'ROW-245 before');
  expect(recordBefore, 'ROW-245 before: the request is found by its id').toBeDefined();
  const leftBefore = await daysLeft2027(leaver.a);
  expect(leftBefore, 'ROW-245 before: days left are 25 - 2').toBe(23);

  await setClock(T_MAR10);
  const adminLater = await track(signIn({ email: admin.credentials.email, password: admin.credentials.password }));
  const r = await attemptSwitchOff(adminLater, leaver.m.id);
  expect(r.ok, `ROW-245: the switch-off is accepted (${r.step} answered ${r.status})`).toBe(true);

  const recordAfter = await requestRecord(adminLater, leaver.m.id, requestId, 'ROW-245');
  expect.soft(recordAfter, 'ROW-245: the request keeps its first cancel day, canceller and every other field').toEqual(recordBefore);

  await switchAccount(adminLater, leaver.m.id, true);
  const leaverAgain = await track(signInMember(leaver.m));
  const leftAfter = await daysLeft2027(leaverAgain);
  expect.soft(leftAfter, 'ROW-245: the days left do not change').toBe(leftBefore);
  expect.soft(leftAfter, 'ROW-245: the days left are still 25 - 2').toBe(23);
});
