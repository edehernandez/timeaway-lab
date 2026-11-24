// Purpose: ledger tests for ROW-175 and ROW-176 (INV-002, REQ-012) — the calendar response sent to a member carries no pending, rejected or cancelled entries, no cancelled days of a partly cancelled request, and for other people nothing beyond display name, optional opaque account id and days away; and it carries every approved day of every person by name.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approvals, rejection, own cancel, admin cancel), fresh per run.
//
// Boundary (R6): "the response sent to a member" is GET /api/calendar?year&month as a member's session receives it
// (D-029 {days:[{date,people:[{name,accountId}]}]}; D-027: name, optional opaque account id and the days, nothing
// else), read whole at the HTTP harness.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { aucklandMorning, datesListing, readCalendar, weekdaysIn, type CalendarAnswer } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface World {
  o: Member;
  q: Member;
  viewer: Actor;
  oRequests: AccountId[];
}

const O_DAYS = [...weekdaysIn('2027-03-08', '2027-03-12'), '2027-03-29', '2027-03-30', '2027-04-19', '2027-04-20'];
const Q_DAYS = ['2027-03-10', '2027-03-11'];

async function world(): Promise<World> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const o = await createMember(admin);
  const q = await createMember(admin);
  const viewer = keep(await signInMember(await createMember(admin)));
  const os = keep(await signInMember(o));
  const qs = keep(await signInMember(q));
  const a = await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-12' });
  const p = await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
  const r = await sendRequest(os, { kind: 'sick', firstDay: '2027-03-17', lastDay: '2027-03-18' });
  const c = await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' });
  const x = await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-04-09' });
  const s = await sendRequest(os, { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' });
  for (const id of [a, x, s]) await approve(admin, id);
  await reject(admin, r);
  await cancelOwnRequest(os, c);
  await approve(admin, await sendRequest(qs, { kind: 'vacation', firstDay: Q_DAYS[0], lastDay: Q_DAYS[1] }));
  await setClock(aucklandMorning('2027-03-31')); // Wed: Mon 03-29 and Tue 03-30 stay in effect
  await adminCancel(admin, x);
  return { o, q, viewer, oRequests: [a, p, r, c, x, s] };
}

async function months(viewer: Actor, row: string): Promise<{ raw: CalendarAnswer[]; text: string }> {
  const raw: CalendarAnswer[] = [];
  let text = '';
  for (const m of [3, 4]) {
    const res = await viewer.api.get(`/api/calendar?year=2027&month=${m}`);
    const body = await res.text();
    expect(res.status(), `${row}: GET /api/calendar for 2027-${m} answers 200`).toBe(200);
    raw.push(JSON.parse(body) as CalendarAnswer);
    text += body;
  }
  return { raw, text };
}

// ---------------------------------------------------------------------------------------------------
// ROW-175 promise: INV-002 (the kind is never sent to another person's browser); REQ-012 "nothing pending, rejected
// ROW-175   or cancelled" and fail-if (3); REQ-019 (a partly cancelled request's days from the cancel day on are
// ROW-175   cancelled); D-027 (for each away entry the display name, an optional opaque account id and the days,
// ROW-175   nothing else). The row's case: the calendar response sent to a member carries no pending, rejected or
// ROW-175   cancelled entries, no cancelled days of a partly cancelled request, and for other people no field beyond
// ROW-175   display name, optional opaque account id and days away, with no request ids or request-shaped blocks.
// ROW-175 wrong product: a calendar that sends every request with a state flag for the browser to filter (pending
// ROW-175   entries hidden by the page but in the data); entries carrying kind, requestId, firstDay or email; a
// ROW-175   partly cancelled request drawn from first to last day.
// ROW-175 given: today Mon 2027-03-01 (Auckland); member O with: approved vacation Mon 03-08..Fri 03-12; pending
// ROW-175   vacation 03-15..03-16; rejected sick 03-17..03-18; own-cancelled vacation 03-22..03-23; approved vacation
// ROW-175   Mon 03-29..Fri 04-09 cancelled by the admin on Wed 03-31 (in effect 03-29, 03-30); approved sick
// ROW-175   04-19..04-20; member Q with an approved vacation 03-10..03-11; the viewer W, a member with no requests.
// ROW-175   when: W reads March and April 2027. then: O is listed on exactly 03-08..03-12, 03-29, 03-30, 04-19, 04-20;
// ROW-175   every object in the answers uses only the keys days, year, month (the answer), date, people (a day), name,
// ROW-175   accountId (a person); O's email, O's string request ids and the words sick, vacation, pending, rejected,
// ROW-175   cancel appear nowhere in the bodies.
// ROW-175 controls: ROW-176's target (every approved day of every person is there by name) — the answer carries
// ROW-175   the people it must, so the absences here are filtering, not an empty calendar.
// ROW-175 technique: an exact set of days against every state as decoy; a whitelist of keys over the whole answer.
// ROW-175 cases: ROW-175 target=ROW-175.INV-002.the-calendar-sends-only-in-effect-approved-days-as-name-id-and-day control=ROW-176.REQ-012.the-calendar-carries-every-approved-day-of-every-person-by-name
test('ROW-175.INV-002.the-calendar-sends-only-in-effect-approved-days-as-name-id-and-day', async () => {
  const w = await world();
  const { raw, text } = await months(w.viewer, 'ROW-175');
  const listed = raw.flatMap((c) => datesListing(c, w.o)).sort();
  expect.soft(listed, 'ROW-175: O is listed on exactly the approved days in effect').toEqual([...O_DAYS].sort());

  const allowed = { answer: ['days', 'year', 'month'], day: ['date', 'people'], person: ['name', 'accountId'] };
  for (const c of raw) {
    for (const k of Object.keys(c)) expect.soft(allowed.answer, `ROW-175: the answer carries no field "${k}"`).toContain(k);
    for (const d of c.days ?? []) {
      for (const k of Object.keys(d)) expect.soft(allowed.day, `ROW-175: a day carries no field "${k}"`).toContain(k);
      for (const p of d.people ?? []) {
        for (const k of Object.keys(p)) expect.soft(allowed.person, `ROW-175: a person entry carries no field "${k}" (${d.date})`).toContain(k);
        for (const v of Object.values(p)) expect.soft(typeof v === 'object' && v !== null, `ROW-175: a person entry nests no block (${d.date})`).toBe(false);
      }
    }
  }
  const lower = text.toLowerCase();
  expect.soft(lower.includes(w.o.email.toLowerCase()), "ROW-175: O's email is not sent").toBe(false);
  for (const word of ['sick', 'vacation', 'pending', 'rejected', 'cancel']) {
    expect.soft(lower.includes(word), `ROW-175: the word "${word}" is not sent`).toBe(false);
  }
  for (const id of w.oRequests) {
    if (typeof id === 'string' && id.length >= 6) expect.soft(text.includes(id), `ROW-175: O's request id ${id} is not sent`).toBe(false);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-176 promise: REQ-012 "for each Monday to Friday day it lists by name the people with an approved request
// ROW-176   covering that day" and fail-if (2); D-027. The row's case: the calendar response carries every approved
// ROW-176   day of every person by name.
// ROW-176 wrong product: a calendar so filtered that it drops approved sick days (or a partly cancelled request
// ROW-176   whole), or names people by email instead of display name.
// ROW-176 given: the ROW-175 world. when: W reads March and April 2027. then: on each of O's approved days in effect
// ROW-176   an entry named with O's display name, and on 03-10 and 03-11 one named with Q's.
// ROW-176 controls: the control case shows the calendar answers W for March with its days.
// ROW-176 technique: every expected day checked by name, two people, both kinds approved.
// ROW-176 cases: ROW-176 target=ROW-176.REQ-012.the-calendar-carries-every-approved-day-of-every-person-by-name control=ROW-176.control.the-calendar-answers-the-member
test('ROW-176.control.the-calendar-answers-the-member', async () => {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const viewer = keep(await signInMember(await createMember(admin)));
  const cal = await readCalendar(viewer.api, 2027, 3, 'ROW-176 control');
  expect(Array.isArray(cal.days) && cal.days.length > 0, 'ROW-176 control: March has days').toBe(true);
});

test('ROW-176.REQ-012.the-calendar-carries-every-approved-day-of-every-person-by-name', async () => {
  const w = await world();
  const { raw } = await months(w.viewer, 'ROW-176');
  const named = (name: string, date: string) =>
    raw.some((c) => (c.days ?? []).some((d) => d.date === date && (d.people ?? []).some((p) => p.name === name)));
  for (const date of O_DAYS) expect.soft(named(w.o.name, date), `ROW-176: O is named on ${date}`).toBe(true);
  for (const date of Q_DAYS) expect.soft(named(w.q.name, date), `ROW-176: Q is named on ${date}`).toBe(true);
});
