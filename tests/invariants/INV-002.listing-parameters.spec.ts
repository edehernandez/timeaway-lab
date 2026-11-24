// Purpose: ledger tests for ROW-177 and ROW-178 (INV-002, INV-003) — no filter, sort or query parameter on the calendar or any listing a member can call changes which other people's entries are returned by kind or state; moving between months still returns that month's approved days.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals, rejection, own cancel), fresh per run.
//
// Boundary (R6): what a member's session can call, at the HTTP harness: GET /api/calendar, GET /api/requests,
// GET /api/balance and GET /api/me (D-029), each with and without added query parameters.
import { test, expect } from '@playwright/test';
import {
  approve,
  cancelOwnRequest,
  createMember,
  reject,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type Actor,
  type Member,
} from './harness';
import { aucklandMorning, datesListing, getJson, readCalendar, requestRecords, type CalendarAnswer } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const O_MARCH = ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12'];
const O_APRIL = ['2027-04-05', '2027-04-06'];

async function world(): Promise<{ o: Member; viewer: Actor }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const o = await createMember(admin);
  const vm = await createMember(admin);
  const os = keep(await signInMember(o));
  const viewer = keep(await signInMember(vm));
  await approve(admin, await sendRequest(os, { kind: 'sick', firstDay: '2027-03-08', lastDay: '2027-03-09' }));
  await approve(admin, await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-12' }));
  await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  await reject(admin, await sendRequest(os, { kind: 'sick', firstDay: '2027-03-17', lastDay: '2027-03-17' }));
  await cancelOwnRequest(os, await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' }));
  await approve(admin, await sendRequest(os, { kind: 'vacation', firstDay: O_APRIL[0], lastDay: O_APRIL[1] }));
  await approve(admin, await sendRequest(viewer, { kind: 'vacation', firstDay: '2027-03-24', lastDay: '2027-03-25' }));
  await sendRequest(viewer, { kind: 'sick', firstDay: '2027-03-29', lastDay: '2027-03-29' });
  return { o, viewer };
}

function entrySet(cal: CalendarAnswer): string[] {
  const out: string[] = [];
  for (const d of cal.days ?? []) for (const p of d.people ?? []) out.push(`${d.date}|${p.name}|${p.accountId ?? ''}`);
  return out.sort();
}

// ---------------------------------------------------------------------------------------------------
// ROW-177 promise: INV-002 (the kind is never sent to another person's browser); INV-003 "a person … sees only
// ROW-177   their own requests and days left, apart from the calendar's away entries, which carry no kind"; REQ-012
// ROW-177   (nothing pending, rejected or cancelled). The row's case: no filter, sort or query parameter on the
// ROW-177   calendar or any listing a member can call changes which other people's entries are returned by kind or
// ROW-177   state.
// ROW-177 wrong product: a calendar route that honours ?kind=sick or ?state=pending (built for the admin's view and
// ROW-177   never guarded), so a member learns who is sick or what is pending; a GET /api/requests that honours
// ROW-177   ?accountId= or ?all=true; a GET /api/balance that honours ?accountId=.
// ROW-177 given: today Mon 2027-03-01 (Auckland); member O with an approved sick 03-08..03-09, an approved vacation
// ROW-177   03-10..03-12, a pending vacation, a rejected sick, a cancelled vacation and an approved April vacation;
// ROW-177   the viewer W with its own approved vacation and pending sick. when: W calls each route with no parameter
// ROW-177   (the baseline) and then with each of the parameters below. then: every answer is either a refusal or
// ROW-177   one whose entries equal the baseline: the calendar's (date, name, id) entries unchanged, W's own request
// ROW-177   ids unchanged and O's name absent, the balance and me answers deep-equal; and no calendar answer carries
// ROW-177   the words sick, vacation, pending, rejected or cancel.
// ROW-177 controls: ROW-178's target (each month returns its approved days) — the baseline carries O's entries.
// ROW-177 technique: a relation between runs (adding a parameter never changes the entries returned), over a
// ROW-177   battery of filter, sort, scope and debug parameters, with O's id where a parameter takes one.
// ROW-177 cases: ROW-177 target=ROW-177.INV-003.no-query-parameter-changes-whose-entries-a-member-receives control=ROW-178.REQ-012.each-month-returns-its-own-approved-days
test('ROW-177.INV-003.no-query-parameter-changes-whose-entries-a-member-receives', async () => {
  const { o, viewer } = await world();
  const oid = encodeURIComponent(String(o.id));
  const calParams = [
    'kind=sick', 'kind=vacation', 'type=sick', 'state=pending', 'state=rejected', 'state=cancelled', 'status=pending',
    'status=all', 'include=pending', 'includePending=true', 'includeCancelled=true', 'includeRejected=true', 'all=true',
    'filter=sick', 'filter%5Bkind%5D=sick', 'sort=kind', 'order=kind', 'orderBy=kind', 'sortBy=state', 'view=admin',
    'admin=true', 'scope=all', `accountId=${oid}`, `userId=${oid}`, `personId=${oid}`, `person=${oid}`, 'fields=kind,state',
    'expand=requests', 'details=true', 'debug=1', 'raw=1',
  ];
  for (const month of [3, 4]) {
    const base = await readCalendar(viewer.api, 2027, month, 'ROW-177 baseline');
    for (const p of calParams) {
      const path = `/api/calendar?year=2027&month=${month}&${p}`;
      const res = await viewer.api.get(path);
      const body = await res.text();
      if (res.status() !== 200) continue; // a refusal changes nothing returned
      const lower = body.toLowerCase();
      expect.soft(entrySet(JSON.parse(body) as CalendarAnswer), `ROW-177: ${path} returns the baseline's entries`).toEqual(entrySet(base));
      for (const word of ['sick', 'vacation', 'pending', 'rejected', 'cancel']) {
        expect.soft(lower.includes(word), `ROW-177: ${path} sends no "${word}"`).toBe(false);
      }
    }
  }

  const listParams = [
    `accountId=${oid}`, `userId=${oid}`, `personId=${oid}`, `person=${oid}`, `id=${oid}`, 'all=true', 'scope=all',
    'team=true', 'everyone=1', 'kind=sick', 'state=pending', 'status=all', 'include=all', 'admin=true', 'view=admin',
  ];
  const baseList = (requestRecords(await getJson(viewer.api, '/api/requests', 'ROW-177 baseline')).map((r) => String(r.id))).sort();
  expect(baseList.length, "ROW-177 baseline: W's own list holds its 2 requests").toBe(2);
  const baseBalance = JSON.stringify(await getJson(viewer.api, '/api/balance', 'ROW-177 baseline'));
  const baseMe = JSON.stringify(await getJson(viewer.api, '/api/me', 'ROW-177 baseline'));
  for (const p of listParams) {
    for (const route of ['/api/requests', '/api/balance', '/api/me']) {
      const path = `${route}?${p}`;
      const res = await viewer.api.get(path);
      const body = await res.text();
      if (res.status() !== 200) continue;
      expect.soft(body.includes(o.name), `ROW-177: ${path} carries nothing of O`).toBe(false);
      if (route === '/api/requests') {
        const ids = requestRecords(JSON.parse(body)).map((r) => String(r.id)).sort();
        expect.soft(ids, `ROW-177: ${path} returns W's own requests only`).toEqual(baseList);
      } else {
        expect.soft(JSON.stringify(JSON.parse(body)), `ROW-177: ${path} answers as without the parameter`).toBe(route === '/api/balance' ? baseBalance : baseMe);
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-178 promise: REQ-012 "every signed-in person can open a month calendar for any month, moving to the previous
// ROW-178   and next month" and fail-if (1), (2). The row's case: moving between months still returns that month's
// ROW-178   approved days.
// ROW-178 wrong product: a calendar that ignores year and month (always the current month), or that returns the
// ROW-178   current month's entries under another month's dates.
// ROW-178 given: the ROW-177 world. when: W reads March, then April, then March again. then: March lists O on
// ROW-178   exactly 03-08..03-12, April on exactly 04-05..04-06, and the second March equals the first.
// ROW-178 controls: the control case shows the calendar answers W for March.
// ROW-178 technique: a relation between runs (back to the same month gives the same answer) plus exact day sets.
// ROW-178 cases: ROW-178 target=ROW-178.REQ-012.each-month-returns-its-own-approved-days control=ROW-178.control.the-calendar-answers-for-a-month
test('ROW-178.control.the-calendar-answers-for-a-month', async () => {
  const { viewer } = await world();
  const cal = await readCalendar(viewer.api, 2027, 3, 'ROW-178 control');
  expect(Array.isArray(cal.days), 'ROW-178 control: March answers with days').toBe(true);
});

test('ROW-178.REQ-012.each-month-returns-its-own-approved-days', async () => {
  const { o, viewer } = await world();
  const march = await readCalendar(viewer.api, 2027, 3, 'ROW-178');
  const april = await readCalendar(viewer.api, 2027, 4, 'ROW-178');
  const again = await readCalendar(viewer.api, 2027, 3, 'ROW-178');
  expect.soft(datesListing(march, o).sort(), "ROW-178: March returns O's March days").toEqual(O_MARCH);
  expect.soft(datesListing(april, o).sort(), "ROW-178: April returns O's April days").toEqual(O_APRIL);
  expect.soft(entrySet(again), 'ROW-178: March again returns what March returned').toEqual(entrySet(march));
});
