// Purpose: ledger tests for ROW-025, ROW-026, ROW-030 and ROW-244 (REQ-006) — the person's own requests list carries every request they sent, each with its kind, days, count and state, newest first, and no other person's request.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, decisions, cancels), fresh names per run, the team clock set by the harness; ROW-244's page case added in slice 1 by batch test-author-4 (the order read on the own requests page in the browser).
//
// Boundary (R6): these are behaviour rows, proved at the HTTP harness — GET /api/requests, the own requests page's
// data (D-029), read through lists.ts, whose docstring states the reading of the record (facts read by value inside
// the record carrying the request's id; the list's order is the page's order). Team zone Pacific/Auckland; the
// clock starts at 2027-03-01T20:00:00Z, which is Tuesday 2027-03-02 09:00 in the team zone and Monday in UTC.
// ROW-244's page cases (at the end) read the order where the person reads it: on / in the browser (engine door).
import { test, expect, type Browser } from '@playwright/test';
import { datePatterns, findRows, type FoundRow, type RowSpec } from './page-reading';
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
// ROW-025 cases: ROW-025 target=ROW-025.REQ-006.every-sent-request-is-listed-whatever-its-state-kind-or-year control=ROW-025.control.a-pending-vacation-is-listed

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
// ROW-026 cases: ROW-026 target=ROW-026.REQ-006.each-listed-request-carries-its-kind-days-count-and-state control=ROW-026.control.the-three-requests-are-listed

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
// ROW-030 cases: ROW-030 target=ROW-030.REQ-006.no-other-persons-request-is-listed control=ROW-030.control.each-list-carries-its-own-requests

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
