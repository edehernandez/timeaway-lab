// Purpose: ledger tests for ROW-025, ROW-026, ROW-030 and ROW-244 (REQ-006) — the person's own requests list carries every request they sent, each with its kind, days, count and state, newest first, and no other person's request.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, decisions, cancels), fresh names per run, the team clock set by the harness; ROW-244's page case added in slice 1 by batch test-author-4 (the order read on the own requests page in the browser); the page cases of ROW-025, ROW-026 and ROW-030 added in slice 1 by batch test-author-5 (lesson L-1: the drawn rows read on / beside the API), through own-page.ts.
//
// Boundary (R6): these are behaviour rows, proved at the HTTP harness — GET /api/requests, the own requests page's
// data (D-029), read through lists.ts, whose docstring states the reading of the record (facts read by value inside
// the record carrying the request's id; the list's order is the page's order). Team zone Pacific/Auckland; the
// clock starts at 2027-03-01T20:00:00Z, which is Tuesday 2027-03-02 09:00 in the team zone and Monday in UTC.
// ROW-244's page cases (at the end) read the order where the person reads it: on / in the browser (engine door).
// The page cases of ROW-025, ROW-026 and ROW-030 (at the end) read the drawn rows themselves on / (engine door).
import { test, expect, type Browser } from '@playwright/test';
import { datePatterns, findRows, type FoundRow, type RowSpec } from './page-reading';
import { readOwnPage, rowOf, saysDay, saysKind, saysNumber, saysState, type DrawnSpec, type ShownState } from './own-page';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshName,
  openPage,
  reject,
  setClock,
  signInMember,
  type AccountId,
  type Member,
  type RequestSpec,
} from './harness';
import {
  countCalendarDays,
  countWeekdays,
  freshInstall,
  hasNumber,
  hasString,
  idsOf,
  kindsOf,
  minutesAfter,
  readOwnRequests,
  recordOf,
  sendAt,
  show,
  statesOf,
  type State,
} from './lists';

const T0 = '2027-03-01T20:00:00Z';

const world = () => freshInstall(T0, '2027-03-02');

// =====================================================================================================
// ROW-025 — every request the person sent is listed
// =====================================================================================================
// ROW-025 promise: REQ-006 "A person's own requests page lists every request they have sent"; fail-if (1) "a request
// ROW-025   the person sent is missing from the page". Authority: REQ-006 arm 1; the states a sent request can reach
// ROW-025   (pending, approved, rejected, cancelled) from A-023 and A-030 in its source.
// ROW-025 wrong product: a list that shows only pending requests (a "to do" list), or only the current year's, or
// ROW-025   only vacation, or drops cancelled ones (a whole cancel by the person or by the admin).
// ROW-025 given: one member who has sent seven requests: a pending vacation, an approved vacation, a rejected sick
// ROW-025   request for past days, a vacation the member cancelled, a pending next-year vacation, an approved sick day
// ROW-025   for today, and a vacation the admin approved then cancelled whole. when: the member reads their own list.
// ROW-025   then: each of the seven ids is a record of the list.
// ROW-025 controls: the same setup, and the plain pending current-year vacation is listed — the list route answers
// ROW-025   for the member and carries the sent request a dropping fault leaves alone.
// ROW-025 technique: one request per state, kind and year (the classes a filter fault drops), each checked by its id.
// ROW-025 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup025() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Ines') });
  const me = await signInMember(member);
  const sent: { label: string; spec: RequestSpec; id: AccountId }[] = [];
  const send = async (label: string, spec: RequestSpec, m: number) => {
    const id = await sendAt(me, spec, minutesAfter(T0, m));
    sent.push({ label, spec, id });
    return id;
  };
  const pending = await send('pending vacation', { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' }, 1);
  const approved = await send('approved vacation', { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }, 2);
  const rejected = await send('rejected sick (past days)', { kind: 'sick', firstDay: '2027-02-25', lastDay: '2027-02-26' }, 3);
  const ownCancel = await send('vacation cancelled by the member', { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' }, 4);
  await send('pending next-year vacation', { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-12' }, 5);
  const sickToday = await send('approved sick today', { kind: 'sick', firstDay: '2027-03-02', lastDay: '2027-03-02' }, 6);
  const adminWhole = await send('vacation the admin cancelled whole', { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' }, 7);
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, approved);
  await reject(w.admin, rejected);
  await cancelOwnRequest(me, ownCancel);
  await approve(w.admin, sickToday);
  await approve(w.admin, adminWhole);
  await setClock(minutesAfter(T0, 20));
  await adminCancel(w.admin, adminWhole);
  return { ...w, member, me, sent, pending, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-025.control.a-pending-vacation-is-listed', async () => {
  const s = await setup025();
  try {
    const list = await readOwnRequests(s.me);
    expect(recordOf(list, s.pending), `ROW-025 control: the pending vacation ${s.pending} is listed; ids ${idsOf(list)}`).toBeDefined();
  } finally {
    await s.close();
  }
});

test('ROW-025.REQ-006.every-sent-request-is-listed-whatever-its-state-kind-or-year', async () => {
  const s = await setup025();
  try {
    const list = await readOwnRequests(s.me);
    for (const r of s.sent) {
      expect
        .soft(recordOf(list, r.id), `ROW-025: the ${r.label} ${JSON.stringify(r.spec)} (id ${r.id}) is listed; ids ${idsOf(list)}`)
        .toBeDefined();
    }
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-026 — each listed request carries its kind, its days, its count and its state
// =====================================================================================================
// ROW-026 promise: REQ-006 "each with its kind, first and last day, counted days, state"; fail-if (2) "a listed
// ROW-026   request lacks its kind, its days, its count or its state". The count is REQ-006's "counted days": the
// ROW-026   Monday-to-Friday days of the range, computed here by the test (countWeekdays), never read from the product.
// ROW-026 wrong product: a record without its kind (hidden for privacy even from the person), with only the first
// ROW-026   day, with the calendar length of the range (9 for Monday to the next Tuesday) instead of the counted 7, a
// ROW-026   constant "pending" state, or one request's facts drawn on another's record.
// ROW-026 given: three requests of one member, each with its own kind, year, count and state, each range chosen so
// ROW-026   the counted days differ from its calendar length and from the other two counts: an approved vacation
// ROW-026   Mon 2027-03-08..Tue 2027-03-16 (7 counted, 9 calendar), a rejected sick Thu 2027-02-25..Mon 2027-03-01
// ROW-026   (3 counted, 5 calendar), a pending vacation Fri 2028-01-14..Mon 2028-01-17 (2 counted, 4 calendar).
// ROW-026   when: the member reads their own list. then: each request's record carries its own kind and not the
// ROW-026   other, its first and its last day, its counted days, and its own state.
// ROW-026 controls: the three records are listed, and the test data separates counted from calendar days.
// ROW-026 technique: decoys — distinct counts, kinds, years and states per record, so the right values on the wrong
// ROW-026   record fail; values read by value inside the record carrying the id (lists.ts).
// ROW-026 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup026() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Joao') });
  const me = await signInMember(member);
  const items: { label: string; spec: RequestSpec; state: State; id: AccountId }[] = [];
  const add = async (label: string, spec: RequestSpec, state: State, m: number) => {
    items.push({ label, spec, state, id: await sendAt(me, spec, minutesAfter(T0, m)) });
  };
  await add('approved vacation', { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-16' }, 'approved', 1);
  await add('rejected sick', { kind: 'sick', firstDay: '2027-02-25', lastDay: '2027-03-01' }, 'rejected', 2);
  await add('pending next-year vacation', { kind: 'vacation', firstDay: '2028-01-14', lastDay: '2028-01-17' }, 'pending', 3);
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, items[0].id);
  await reject(w.admin, items[1].id);
  return { ...w, member, me, items, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-026.control.the-three-requests-are-listed', async () => {
  const s = await setup026();
  try {
    const counts = s.items.map((i) => countWeekdays(i.spec.firstDay, i.spec.lastDay));
    expect(counts, 'ROW-026 control: the test data counts 7, 3 and 2 Monday-to-Friday days').toEqual([7, 3, 2]);
    for (const i of s.items) {
      expect(countCalendarDays(i.spec.firstDay, i.spec.lastDay), `ROW-026 control: ${i.label} spans more calendar days than counted`).toBeGreaterThan(
        countWeekdays(i.spec.firstDay, i.spec.lastDay),
      );
    }
    const list = await readOwnRequests(s.me);
    for (const i of s.items) {
      expect.soft(recordOf(list, i.id), `ROW-026 control: the ${i.label} (id ${i.id}) is listed; ids ${idsOf(list)}`).toBeDefined();
    }
  } finally {
    await s.close();
  }
});

test('ROW-026.REQ-006.each-listed-request-carries-its-kind-days-count-and-state', async () => {
  const s = await setup026();
  try {
    const list = await readOwnRequests(s.me);
    for (const i of s.items) {
      const rec = recordOf(list, i.id);
      expect.soft(rec, `ROW-026: the ${i.label} (id ${i.id}) is listed`).toBeDefined();
      if (!rec) continue;
      const other = i.spec.kind === 'vacation' ? 'sick' : 'vacation';
      const count = countWeekdays(i.spec.firstDay, i.spec.lastDay);
      const kinds = kindsOf(rec);
      expect.soft(kinds.has(i.spec.kind), `ROW-026: the ${i.label} carries its kind "${i.spec.kind}": ${show(rec)}`).toBe(true);
      expect.soft(kinds.has(other), `ROW-026: the ${i.label} does not carry the other kind "${other}": ${show(rec)}`).toBe(false);
      expect.soft(hasString(rec, i.spec.firstDay), `ROW-026: the ${i.label} carries its first day ${i.spec.firstDay}: ${show(rec)}`).toBe(true);
      expect.soft(hasString(rec, i.spec.lastDay), `ROW-026: the ${i.label} carries its last day ${i.spec.lastDay}: ${show(rec)}`).toBe(true);
      expect.soft(hasNumber(rec, count), `ROW-026: the ${i.label} carries its counted days ${count}: ${show(rec)}`).toBe(true);
      expect.soft(statesOf(rec).has(i.state), `ROW-026: the ${i.label} carries its state "${i.state}": ${show(rec)}`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-030 — no other person's request is listed
// =====================================================================================================
// ROW-030 promise: REQ-006 "it shows no other person's requests"; fail-if (6) "the page shows any other person's
// ROW-030   request". Authority: REQ-006 arm 6.
// ROW-030 wrong product: GET /api/requests answers every request in the team (the page filters, or nobody does),
// ROW-030   or adds a colleague's request that overlaps the person's days, or the admin's own request.
// ROW-030 given: members Ana and Bo (fresh names and emails) and the admin each send requests; Bo's first request
// ROW-030   has exactly Ana's first request's days and is approved. when: Ana reads her list, and Bo reads his.
// ROW-030   then: Ana's list carries none of Bo's or the admin's request ids, and its body carries neither Bo's name
// ROW-030   nor his email; the same for Bo's list with Ana's.
// ROW-030 controls: each list carries its own person's two requests — the route answers and lists, so an absence in
// ROW-030   the target is not an empty list.
// ROW-030 technique: isolation — the neighbouring person's records, same days as a decoy, and fresh identifying
// ROW-030   values searched in the whole body (a leak in any field fails).
// ROW-030 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup030() {
  const w = await world();
  const ana: Member = await createMember(w.admin, { name: freshName('Ana') });
  const bo: Member = await createMember(w.admin, { name: freshName('Bo') });
  const anaS = await signInMember(ana);
  const boS = await signInMember(bo);
  const a1 = await sendAt(anaS, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const a2 = await sendAt(anaS, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 2));
  const b1 = await sendAt(boS, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 3));
  const b2 = await sendAt(boS, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-05' }, minutesAfter(T0, 4));
  const w1 = await sendAt(w.admin, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' }, minutesAfter(T0, 5));
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, b1);
  return {
    ...w,
    ana,
    bo,
    anaS,
    boS,
    anaIds: [a1, a2],
    boIds: [b1, b2],
    adminIds: [w1],
    close: async () => {
      await anaS.dispose();
      await boS.dispose();
      await w.close();
    },
  };
}

test('ROW-030.control.each-list-carries-its-own-requests', async () => {
  const s = await setup030();
  try {
    const anaList = await readOwnRequests(s.anaS);
    const boList = await readOwnRequests(s.boS);
    for (const id of s.anaIds) expect.soft(recordOf(anaList, id), `ROW-030 control: Ana's request ${id} is on her list`).toBeDefined();
    for (const id of s.boIds) expect.soft(recordOf(boList, id), `ROW-030 control: Bo's request ${id} is on his list`).toBeDefined();
  } finally {
    await s.close();
  }
});

test('ROW-030.REQ-006.no-other-persons-request-is-listed', async () => {
  const s = await setup030();
  try {
    const anaList = await readOwnRequests(s.anaS);
    const boList = await readOwnRequests(s.boS);
    for (const id of [...s.boIds, ...s.adminIds]) {
      expect.soft(recordOf(anaList, id), `ROW-030: Ana's list carries no request ${id} of Bo or the admin; ids ${idsOf(anaList)}`).toBeUndefined();
    }
    for (const id of [...s.anaIds, ...s.adminIds]) {
      expect.soft(recordOf(boList, id), `ROW-030: Bo's list carries no request ${id} of Ana or the admin; ids ${idsOf(boList)}`).toBeUndefined();
    }
    expect.soft(anaList.text.includes(s.bo.name), `ROW-030: Ana's list carries Bo's name "${s.bo.name}" nowhere`).toBe(false);
    expect.soft(anaList.text.includes(s.bo.email), `ROW-030: Ana's list carries Bo's email nowhere`).toBe(false);
    expect.soft(boList.text.includes(s.ana.name), `ROW-030: Bo's list carries Ana's name "${s.ana.name}" nowhere`).toBe(false);
    expect.soft(boList.text.includes(s.ana.email), `ROW-030: Bo's list carries Ana's email nowhere`).toBe(false);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-244 — newest first
// =====================================================================================================
// ROW-244 promise: REQ-006 "lists every request they have sent, newest first"; the row's case: three requests sent
// ROW-244   in the order next month, then tomorrow, then two weeks out are listed two weeks out, tomorrow, next month.
// ROW-244 wrong product: a list ordered by first day (tomorrow, two weeks out, next month), by first day descending
// ROW-244   (next month, two weeks out, tomorrow), or by id / oldest sent first (next month, tomorrow, two weeks out).
// ROW-244 given: today is Tuesday 2027-03-02 in the team zone; the member sends a vacation for next month
// ROW-244   (2027-04-05..07) at 09:01, one for tomorrow (2027-03-03) at 09:02, one two weeks out (2027-03-16..17) at
// ROW-244   09:03, the clock moved between sends. when: the member reads their own list. then: the three records stand
// ROW-244   in the order two weeks out, tomorrow, next month.
// ROW-244 controls: all three records are listed, so an order failure is not a missing record.
// ROW-244 technique: the row's own example values; the three plausible wrong orders each differ from the right one.
// ROW-244 (the row's cases: line stands with the page argument at the end of this file: the row is about the page.)

async function setup244() {
  const w = await world();
  const member = await createMember(w.admin, { name: freshName('Kai') });
  const me = await signInMember(member);
  const nextMonth = await sendAt(me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-07' }, minutesAfter(T0, 1));
  const tomorrow = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-03', lastDay: '2027-03-03' }, minutesAfter(T0, 2));
  const twoWeeks = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-16', lastDay: '2027-03-17' }, minutesAfter(T0, 3));
  return { ...w, me, nextMonth, tomorrow, twoWeeks, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-244.control.the-three-requests-are-listed', async () => {
  const s = await setup244();
  try {
    const list = await readOwnRequests(s.me);
    for (const id of [s.nextMonth, s.tomorrow, s.twoWeeks]) {
      expect.soft(recordOf(list, id), `ROW-244 control: request ${id} is listed; ids ${idsOf(list)}`).toBeDefined();
    }
  } finally {
    await s.close();
  }
});

test('ROW-244.REQ-006.own-requests-listed-most-recently-sent-first', async () => {
  const s = await setup244();
  try {
    const list = await readOwnRequests(s.me);
    const order = [s.twoWeeks, s.tomorrow, s.nextMonth].map(String);
    const seen = idsOf(list).filter((id) => order.includes(id));
    expect(seen, `ROW-244: listed two weeks out (${s.twoWeeks}), tomorrow (${s.tomorrow}), next month (${s.nextMonth}); list ids ${idsOf(list)}`).toEqual(order);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-244 — newest first, on the own requests page itself (added, slice 1, test-author-4)
// =====================================================================================================
// ROW-244 promise: REQ-006 "A person's own requests PAGE lists every request they have sent, newest first"; the
// ROW-244   row's case: three requests sent in the order next month, then tomorrow, then two weeks out are listed
// ROW-244   two weeks out, tomorrow, next month. The page is / (D-029's own requests page).
// ROW-244 wrong product: GET /api/requests answers newest first but the page re-sorts on the client — by first day
// ROW-244   (tomorrow, two weeks out, next month), by first day descending (next month, two weeks out, tomorrow) — or
// ROW-244   draws the answer reversed (next month, tomorrow, two weeks out, oldest sent first); the API case above
// ROW-244   stays green for every one of them.
// ROW-244 given: setup244 — today Tue 2027-03-02 in the team zone; the member sends vacation 5..7 Apr at 09:01,
// ROW-244   3 Mar at 09:02, 16..17 Mar at 09:03, the clock moved between sends. when: the member's browser opens /.
// ROW-244   then: the three requests' rows, each found by its first day and bounded by the other two, stand on the
// ROW-244   page in document order two weeks out, tomorrow, next month.
// ROW-244 controls: ROW-244.control.the-three-requests-are-drawn-on-the-page — each of the three is drawn as one
// ROW-244   row of its own, so an order failure is never a missing or merged row.
// ROW-244 technique: the row's own example values, read where the person reads them (R6: paint and operation in the
// ROW-244   browser); every plausible wrong order differs from the right one; rows found by what they say
// ROW-244   (page-reading.ts findRows), never by markup the product would have to invent.
// ROW-244 cases: ROW-244 target=ROW-244.REQ-006.own-requests-page-shows-most-recently-sent-first control=ROW-244.control.the-three-requests-are-drawn-on-the-page

/** Opens / as the member and waits (bounded) until each of `days`' rows is drawn; answers the rows found, in `days`' order. */
async function rowsOnOwnPage(browser: Browser, s: Awaited<ReturnType<typeof setup244>>, days: string[]): Promise<FoundRow[]> {
  const opened = await openPage(browser, s.me);
  try {
    await opened.page.goto('/');
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const specs: RowSpec[] = days.map((d) => ({ key: d, keys: [datePatterns(d)] }));
    let rows: FoundRow[] = [];
    await expect
      .poll(async () => (rows = await findRows(opened.page, specs)).filter((r) => r.found).length, { timeout: 15_000 })
      .toBe(days.length)
      .catch(() => undefined);
    return rows;
  } finally {
    await opened.close();
  }
}

const TWO_WEEKS = '2027-03-16';
const TOMORROW = '2027-03-03';
const NEXT_MONTH = '2027-04-05';

test('ROW-244.control.the-three-requests-are-drawn-on-the-page', async ({ browser }) => {
  const s = await setup244();
  try {
    const days = [NEXT_MONTH, TOMORROW, TWO_WEEKS];
    const rows = await rowsOnOwnPage(browser, s, days);
    for (const r of rows) {
      expect.soft(r.found, `ROW-244 control: the request starting ${r.key} is drawn on /`).toBe(true);
      // a row of its own: it carries no other request's first day (a one-day request draws its day twice, as first
      // and last, so findRows' `repeated` is no reading here)
      for (const other of days.filter((d) => d !== r.key)) {
        expect
          .soft(datePatterns(other).some((p) => new RegExp(p, 'i').test(r.text)), `ROW-244 control: the row of ${r.key} carries no day ${other} (text: "${r.text}")`)
          .toBe(false);
      }
    }
    expect.soft(new Set(rows.filter((r) => r.found).map((r) => r.order)).size, 'ROW-244 control: three separate rows').toBe(3);
  } finally {
    await s.close();
  }
});

test('ROW-244.REQ-006.own-requests-page-shows-most-recently-sent-first', async ({ browser }) => {
  const s = await setup244();
  try {
    const want = [TWO_WEEKS, TOMORROW, NEXT_MONTH];
    const rows = await rowsOnOwnPage(browser, s, want);
    const drawn = rows
      .filter((r) => r.found)
      .sort((a, b) => a.order - b.order)
      .map((r) => r.key);
    expect(drawn, `ROW-244: / draws two weeks out (${TWO_WEEKS}), tomorrow (${TOMORROW}), next month (${NEXT_MONTH}) in that order; drawn ${drawn.join(', ')}`).toEqual(want);
  } finally {
    await s.close();
  }
});

// =====================================================================================================
// ROW-025, ROW-026, ROW-030 — on the own requests page itself (added, slice 1, test-author-5; lesson L-1)
// =====================================================================================================
// The API cases above read GET /api/requests; a page that filters, merges or relabels on the client keeps them
// green. These cases open / in the person's browser (engine door) and read the drawn rows (own-page.ts: a row is
// found by its first and last day, bounded by the other requests' days), beside the API reading.

/** Monday 2027-03-01 09:00 in the team zone (Sunday 20:00 UTC). */
const T_MON = '2027-02-28T20:00:00Z';

// ROW-025 promise: REQ-006 "A person's own requests PAGE lists every request they have sent"; fail-if (1) "a request
// ROW-025   the person sent is missing from the page". Authority: REQ-006 arm 1; the states a sent request reaches
// ROW-025   (pending, approved, rejected, cancelled) from A-023 and A-030.
// ROW-025 wrong product: GET /api/requests answers all seven, but the page draws only pending ones, or only this
// ROW-025   year's, or only vacation, or hides cancelled and rejected ones client-side ("active requests") — the API case
// ROW-025   above stays green for every one of them.
// ROW-025 given: setup025Page — the member sends six requests on Monday 2027-03-01 (a pending vacation, a vacation
// ROW-025   approved, a sick request for past days rejected, a vacation they cancel themselves, a pending next-year
// ROW-025   vacation, a vacation the admin approves then cancels whole), all acts that Monday; on Tuesday 2027-03-02 a
// ROW-025   sick day for that day, approved that day — so no act's date is another request's day and each row is told
// ROW-025   by its own first and last day. when: the member's browser opens /. then: each of the seven is drawn as a row.
// ROW-025 controls: ROW-025.control.page-draws-a-pending-vacation — the API lists all seven ids (the setup worked)
// ROW-025   and the page draws the plain pending vacation, a row no dropping fault removes.
// ROW-025 technique: one request per state, kind and year (the classes a client filter drops), each found on the
// ROW-025   page by its own days; read where the person reads (R6: paint in the browser).
// ROW-025 cases: ROW-025 target=ROW-025.REQ-006.page-draws-every-sent-request-whatever-its-state-kind-or-year control=ROW-025.control.page-draws-a-pending-vacation

async function setup025Page() {
  const w = await freshInstall(T_MON, '2027-03-01');
  const member = await createMember(w.admin, { name: freshName('Ines') });
  const me = await signInMember(member);
  const sent: (DrawnSpec & { id: AccountId })[] = [];
  const send = async (label: string, spec: RequestSpec, instant: string) => {
    const id = await sendAt(me, spec, instant);
    sent.push({ label, firstDay: spec.firstDay, lastDay: spec.lastDay, id });
    return id;
  };
  await send('pending vacation', { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' }, minutesAfter(T_MON, 1));
  const approved = await send('approved vacation', { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }, minutesAfter(T_MON, 2));
  const rejected = await send('rejected sick (past days)', { kind: 'sick', firstDay: '2027-02-25', lastDay: '2027-02-26' }, minutesAfter(T_MON, 3));
  const ownCancel = await send('vacation cancelled by the member', { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' }, minutesAfter(T_MON, 4));
  await send('pending next-year vacation', { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-12' }, minutesAfter(T_MON, 5));
  const adminWhole = await send('vacation the admin cancelled whole', { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' }, minutesAfter(T_MON, 6));
  await setClock(minutesAfter(T_MON, 10));
  await approve(w.admin, approved);
  await reject(w.admin, rejected);
  await cancelOwnRequest(me, ownCancel);
  await approve(w.admin, adminWhole);
  await setClock(minutesAfter(T_MON, 20));
  await adminCancel(w.admin, adminWhole);
  const sickToday = await send('approved sick today', { kind: 'sick', firstDay: '2027-03-02', lastDay: '2027-03-02' }, minutesAfter(T0, 1));
  await setClock(minutesAfter(T0, 10));
  await approve(w.admin, sickToday);
  return { ...w, member, me, sent, close: async () => { await me.dispose(); await w.close(); } };
}

test('ROW-025.control.page-draws-a-pending-vacation', async ({ browser }) => {
  const s = await setup025Page();
  try {
    const list = await readOwnRequests(s.me);
    for (const r of s.sent) expect.soft(recordOf(list, r.id), `ROW-025 control: the API lists the ${r.label} (id ${r.id}); ids ${idsOf(list)}`).toBeDefined();
    const read = await readOwnPage(browser, s.me, s.sent);
    expect(read.status, 'ROW-025 control: / answers 200').toBe(200);
    expect(rowOf(read, 'pending vacation').found, `ROW-025 control: / draws the pending vacation 2027-03-22..24; page: "${read.body.slice(0, 600)}"`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-025.REQ-006.page-draws-every-sent-request-whatever-its-state-kind-or-year', async ({ browser }) => {
  const s = await setup025Page();
  try {
    const read = await readOwnPage(browser, s.me, s.sent);
    for (const r of s.sent) {
      expect.soft(rowOf(read, r.label).found, `ROW-025: / draws the ${r.label} ${r.firstDay}..${r.lastDay} (id ${r.id}); page: "${read.body.slice(0, 600)}"`).toBe(true);
    }
  } finally {
    await s.close();
  }
});

// ROW-026 promise: REQ-006 "each with its kind, first and last day, counted days, state"; fail-if (2) "a listed
// ROW-026   request lacks its kind, its days, its count or its state" — on the page. The count is REQ-006's "counted
// ROW-026   days", computed here by the test (countWeekdays), never read from the product.
// ROW-026 wrong product: the API record carries every fact, but the page draws no kind (hidden "for privacy" even
// ROW-026   from the person), only the first day, the calendar length (9, 5, 4) instead of the counted days (7, 3, 2),
// ROW-026   one state label for all rows, or relabels the state on the client — the API case stays green.
// ROW-026 given: setup026 — an approved vacation Mon 2027-03-08..Tue 2027-03-16 (7 counted, 9 calendar), a rejected
// ROW-026   sick Thu 2027-02-25..Mon 2027-03-01 (3 counted, 5 calendar), a pending vacation Fri 2028-01-14..Mon
// ROW-026   2028-01-17 (2 counted, 4 calendar); sent and decided on 2027-03-02, no request's day. when: the member's
// ROW-026   browser opens /. then: each request's row draws its own kind word and not the other, its first and its last
// ROW-026   day, its counted days as a number of its own (dates, names and years removed first), its own state word,
// ROW-026   and neither of the other two states.
// ROW-026 controls: ROW-026.control.page-draws-the-three-requests — the three rows are drawn on / at all.
// ROW-026 technique: decoys — distinct kinds, counts, years and states per row, so the right values on the wrong
// ROW-026   row fail; each row bounded by the other two (own-page.ts).
// ROW-026 cases: ROW-026 target=ROW-026.REQ-006.page-row-draws-its-kind-days-count-and-state control=ROW-026.control.page-draws-the-three-requests

function specs026(s: Awaited<ReturnType<typeof setup026>>): DrawnSpec[] {
  return s.items.map((i) => ({ label: i.label, firstDay: i.spec.firstDay, lastDay: i.spec.lastDay }));
}

test('ROW-026.control.page-draws-the-three-requests', async ({ browser }) => {
  const s = await setup026();
  try {
    const read = await readOwnPage(browser, s.me, specs026(s));
    for (const i of s.items) expect.soft(rowOf(read, i.label).found, `ROW-026 control: / draws the ${i.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-026.REQ-006.page-row-draws-its-kind-days-count-and-state', async ({ browser }) => {
  const s = await setup026();
  try {
    const read = await readOwnPage(browser, s.me, specs026(s));
    const days = [...s.items.flatMap((i) => [i.spec.firstDay, i.spec.lastDay]), '2027-03-02'];
    const literals = [s.member.name, s.member.email, s.install.admin.name, s.install.admin.email, '2027', '2028'];
    const states: ShownState[] = ['pending', 'approved', 'rejected'];
    for (const i of s.items) {
      const row = rowOf(read, i.label);
      expect.soft(row.found, `ROW-026: / draws the ${i.label}; page: "${read.body.slice(0, 600)}"`).toBe(true);
      if (!row.found) continue;
      const other = i.spec.kind === 'vacation' ? 'sick' : 'vacation';
      const count = countWeekdays(i.spec.firstDay, i.spec.lastDay);
      expect.soft(saysKind(row.text, i.spec.kind), `ROW-026: the ${i.label}'s row draws its kind "${i.spec.kind}": "${row.text}"`).toBe(true);
      expect.soft(saysKind(row.text, other), `ROW-026: the ${i.label}'s row does not draw the other kind "${other}": "${row.text}"`).toBe(false);
      expect.soft(saysDay(row.text, i.spec.firstDay), `ROW-026: the ${i.label}'s row draws its first day ${i.spec.firstDay}: "${row.text}"`).toBe(true);
      expect.soft(saysDay(row.text, i.spec.lastDay), `ROW-026: the ${i.label}'s row draws its last day ${i.spec.lastDay}: "${row.text}"`).toBe(true);
      expect.soft(saysNumber(row.text, count, days, literals), `ROW-026: the ${i.label}'s row draws its counted days ${count}: "${row.text}"`).toBe(true);
      expect.soft(saysState(row.text, i.state), `ROW-026: the ${i.label}'s row draws its state "${i.state}": "${row.text}"`).toBe(true);
      for (const st of states.filter((x) => x !== i.state)) {
        expect.soft(saysState(row.text, st), `ROW-026: the ${i.label}'s row does not draw the state "${st}": "${row.text}"`).toBe(false);
      }
    }
  } finally {
    await s.close();
  }
});

// ROW-030 promise: REQ-006 "it shows no other person's requests"; fail-if (6) "the page shows any other person's
// ROW-030   request" — on the page.
// ROW-030 wrong product: GET /api/requests answers only the person's own, but the page reads a team-wide source
// ROW-030   (or merges in the calendar's approved days) and draws a colleague's request — the API case stays green.
// ROW-030 given: setup030 — Ana sends 22..23 March (vacation) and 1 March (sick); Bo sends exactly 22..23 March,
// ROW-030   approved, and 5 April; the admin sends 29..30 March; every send on 2027-03-02. when: Ana's browser opens /,
// ROW-030   then Bo's. then: on Ana's page the 22..23 March row is drawn once (Bo's same-days request is not drawn
// ROW-030   beside it) and no rendering of 5 April, 29 March or 30 March appears anywhere; on Bo's page the 22..23 March
// ROW-030   row is drawn once and no rendering of 1 March, 29 March or 30 March appears.
// ROW-030 controls: ROW-030.control.each-page-draws-its-own-requests — each page draws its own person's two rows, so
// ROW-030   an absence in the target is not an empty or unloaded page.
// ROW-030 technique: isolation — the neighbouring person's records, one with the same days as a decoy (caught as a
// ROW-030   second place carrying those days), the others by days that only they carry, searched in the whole page.
// ROW-030 cases: ROW-030 target=ROW-030.REQ-006.page-draws-no-other-persons-request control=ROW-030.control.each-page-draws-its-own-requests

const ANA_ROWS: DrawnSpec[] = [
  { label: 'Ana 22..23 March', firstDay: '2027-03-22', lastDay: '2027-03-23' },
  { label: 'Ana 1 March', firstDay: '2027-03-01', lastDay: '2027-03-01' },
];
const BO_ROWS: DrawnSpec[] = [
  { label: 'Bo 22..23 March', firstDay: '2027-03-22', lastDay: '2027-03-23' },
  { label: 'Bo 5 April', firstDay: '2027-04-05', lastDay: '2027-04-05' },
];

test('ROW-030.control.each-page-draws-its-own-requests', async ({ browser }) => {
  const s = await setup030();
  try {
    const ana = await readOwnPage(browser, s.anaS, ANA_ROWS);
    for (const r of ANA_ROWS) expect.soft(rowOf(ana, r.label).found, `ROW-030 control: Ana's page draws ${r.label}; page: "${ana.body.slice(0, 600)}"`).toBe(true);
    const bo = await readOwnPage(browser, s.boS, BO_ROWS);
    for (const r of BO_ROWS) expect.soft(rowOf(bo, r.label).found, `ROW-030 control: Bo's page draws ${r.label}; page: "${bo.body.slice(0, 600)}"`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-030.REQ-006.page-draws-no-other-persons-request', async ({ browser }) => {
  const s = await setup030();
  try {
    const ana = await readOwnPage(browser, s.anaS, ANA_ROWS);
    const anaRow = rowOf(ana, 'Ana 22..23 March');
    expect.soft(anaRow.found && !anaRow.repeated, `ROW-030: Ana's page draws 22..23 March once — Bo's same-days request is not drawn; page: "${ana.body.slice(0, 600)}"`).toBe(true);
    for (const [whose, day] of [['Bo', '2027-04-05'], ['the admin', '2027-03-29'], ['the admin', '2027-03-30']] as const) {
      expect.soft(saysDay(ana.body, day), `ROW-030: Ana's page draws no ${day} (${whose}'s request); page: "${ana.body.slice(0, 600)}"`).toBe(false);
    }
    const bo = await readOwnPage(browser, s.boS, BO_ROWS);
    const boRow = rowOf(bo, 'Bo 22..23 March');
    expect.soft(boRow.found && !boRow.repeated, `ROW-030: Bo's page draws 22..23 March once — Ana's same-days request is not drawn; page: "${bo.body.slice(0, 600)}"`).toBe(true);
    for (const [whose, day] of [['Ana', '2027-03-01'], ['the admin', '2027-03-29'], ['the admin', '2027-03-30']] as const) {
      expect.soft(saysDay(bo.body, day), `ROW-030: Bo's page draws no ${day} (${whose}'s request); page: "${bo.body.slice(0, 600)}"`).toBe(false);
    }
  } finally {
    await s.close();
  }
});
