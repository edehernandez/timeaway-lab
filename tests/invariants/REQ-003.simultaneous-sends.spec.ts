// Purpose: ledger tests for ROW-161 and ROW-162 (REQ-003) — two overlapping requests of any kind sent at the same moment by the same person store exactly one; two non-overlapping ones sent at the same moment are both stored.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, sessions), fresh per run; simultaneous sends through readings.ts's together().
//
// Boundary (R6): a store rule under concurrency, proved at the HTTP harness: POST /api/requests (D-029) fired on two
// sessions of the same person in the same tick, then the person's own list (GET /api/requests) and balance.
// Repeated over several rounds so an interleaving that lets both through has many chances to show.
import { test, expect } from '@playwright/test';
import { createMember, readBalance, resetProduct, signIn, signInMember, type AccountId, type Actor } from './harness';
import { addDays, aucklandMorning, balanceYear, countWeekdays, getJson, requestRecords, sameId, together } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

type Kind = 'vacation' | 'sick';
interface Spec {
  kind: Kind;
  firstDay: string;
  lastDay: string;
}

async function twoSessions(): Promise<{ a: Actor; b: Actor }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 260 });
  return { a: keep(await signInMember(m)), b: keep(await signInMember(m)) };
}

async function send(actor: Actor, spec: Spec): Promise<{ status: number; id?: AccountId }> {
  const res = await actor.api.post('/api/requests', { data: spec });
  let id: AccountId | undefined;
  try {
    id = ((await res.json()) as { id?: AccountId }).id;
  } catch {
    id = undefined;
  }
  return { status: res.status(), id };
}

const ROUNDS = 8;
const MONDAY = '2027-03-08';

// ---------------------------------------------------------------------------------------------------
// ROW-161 promise: REQ-003 "a request that shares a day with a day still in effect of the same person's pending or
// ROW-161   approved request is refused, whatever the kinds of the two requests" and fail-if (1) "a person ends up
// ROW-161   with two pending or approved requests that share a day in effect"; A-014. The row's case: two
// ROW-161   overlapping requests of any kind sent at the same moment by the same person store exactly one.
// ROW-161 wrong product: an overlap check that reads the person's requests and inserts in two separate steps, so two
// ROW-161   sends interleaved both pass the check (a check-then-insert outside one write transaction).
// ROW-161 given: a member (allowance 260, so no balance refusal) signed in on two sessions; today Mon 2027-03-01.
// ROW-161   when: in each of 8 rounds, two overlapping requests — round r's week: Mon..Fri and Wed..the next Tue —
// ROW-161   are sent in the same tick on the two sessions, the kinds cycling vacation+vacation, vacation+sick,
// ROW-161   sick+sick, sick+vacation. then: in every round exactly one answers 201; the member's list holds exactly
// ROW-161   one request per round, the one that answered 201; the pending vacation days equal the winners'
// ROW-161   vacation days.
// ROW-161 controls: ROW-162's target (two non-overlapping requests at the same moment are both stored) — the two
// ROW-161   sessions do send simultaneously and both land when they may, so a single 201 here is the overlap rule.
// ROW-161 technique: a race repeated over rounds, with every kind pair; the store's content counted afterwards, not
// ROW-161   only the answers.
// ROW-161 cases: ROW-161 target=ROW-161.REQ-003.two-overlapping-requests-at-the-same-moment-store-one control=ROW-162.REQ-003.two-non-overlapping-requests-at-the-same-moment-are-both-stored
test('ROW-161.REQ-003.two-overlapping-requests-at-the-same-moment-store-one', async () => {
  const { a, b } = await twoSessions();
  const kinds: [Kind, Kind][] = [
    ['vacation', 'vacation'],
    ['vacation', 'sick'],
    ['sick', 'sick'],
    ['sick', 'vacation'],
  ];
  const winners: { id: AccountId; spec: Spec }[] = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    const mon = addDays(MONDAY, 14 * r);
    const [k1, k2] = kinds[r % kinds.length];
    const s1: Spec = { kind: k1, firstDay: mon, lastDay: addDays(mon, 4) };
    const s2: Spec = { kind: k2, firstDay: addDays(mon, 2), lastDay: addDays(mon, 8) };
    const [x, y] = await together([() => send(a, s1), () => send(b, s2)]);
    const ok = [x, y].filter((o) => o.status === 201).length;
    expect.soft(ok, `ROW-161 round ${r} (${k1} ${s1.firstDay}..${s1.lastDay} with ${k2} ${s2.firstDay}..${s2.lastDay}): exactly one is stored (answers ${x.status}, ${y.status})`).toBe(1);
    if (x.status === 201 && x.id !== undefined) winners.push({ id: x.id, spec: s1 });
    if (y.status === 201 && y.id !== undefined) winners.push({ id: y.id, spec: s2 });
  }
  const list = requestRecords(await getJson(a.api, '/api/requests', 'ROW-161'));
  for (let r = 0; r < ROUNDS; r += 1) {
    const mon = addDays(MONDAY, 14 * r);
    const end = addDays(mon, 8);
    const stored = list.filter((o) => String(o.firstDay) <= end && mon <= String(o.lastDay));
    expect.soft(stored.length, `ROW-161 round ${r}: the member's list holds exactly one request in ${mon}..${end}`).toBe(1);
  }
  for (const w of winners) {
    expect.soft(list.some((o) => sameId(o.id, w.id)), `ROW-161: the request that answered 201 (${w.spec.firstDay}) is the one stored`).toBe(true);
  }
  const vacationDays = winners.filter((w) => w.spec.kind === 'vacation').reduce((n, w) => n + countWeekdays(w.spec.firstDay, w.spec.lastDay), 0);
  expect.soft(balanceYear(await readBalance(a), 2027)?.pending, 'ROW-161: pending vacation days are the stored vacations only').toBe(vacationDays);
});

// ---------------------------------------------------------------------------------------------------
// ROW-162 promise: REQ-003 fail-if (3)'s sibling: the rule refuses only requests that share a day; ROW-161's
// ROW-162   control. The row's case: two non-overlapping requests sent at the same moment are both stored.
// ROW-162 wrong product: a send lock that refuses (or drops) any second request arriving while one is being stored,
// ROW-162   or an overlap check that compares whole weeks.
// ROW-162 given: the member on two sessions. when: in each of 4 rounds, Mon..Tue and Thu..Fri of one week (a vacation
// ROW-162   and a sick request) are sent in the same tick. then: both answer 201 with different ids, and both are on
// ROW-162   the member's list.
// ROW-162 controls: the control case sends one request alone and finds it stored — the send path works.
// ROW-162 technique: the same race as ROW-161 with the overlap removed.
// ROW-162 cases: ROW-162 target=ROW-162.REQ-003.two-non-overlapping-requests-at-the-same-moment-are-both-stored control=ROW-162.control.a-single-send-is-stored
test('ROW-162.control.a-single-send-is-stored', async () => {
  const { a } = await twoSessions();
  const x = await send(a, { kind: 'vacation', firstDay: MONDAY, lastDay: addDays(MONDAY, 1) });
  expect(x.status, 'ROW-162 control: a single send answers 201').toBe(201);
  const list = requestRecords(await getJson(a.api, '/api/requests', 'ROW-162 control'));
  expect(list.some((o) => sameId(o.id, x.id as AccountId)), 'ROW-162 control: it is on the list').toBe(true);
});

test('ROW-162.REQ-003.two-non-overlapping-requests-at-the-same-moment-are-both-stored', async () => {
  const { a, b } = await twoSessions();
  const ids: AccountId[] = [];
  for (let r = 0; r < 4; r += 1) {
    const mon = addDays(MONDAY, 7 * r);
    const [x, y] = await together([
      () => send(a, { kind: 'vacation', firstDay: mon, lastDay: addDays(mon, 1) }),
      () => send(b, { kind: 'sick', firstDay: addDays(mon, 3), lastDay: addDays(mon, 4) }),
    ]);
    expect.soft([x.status, y.status], `ROW-162 round ${r}: both non-overlapping requests are stored`).toEqual([201, 201]);
    expect.soft(x.id !== undefined && y.id !== undefined && String(x.id) !== String(y.id), `ROW-162 round ${r}: with two ids`).toBe(true);
    for (const o of [x, y]) if (o.id !== undefined) ids.push(o.id);
  }
  const list = requestRecords(await getJson(a.api, '/api/requests', 'ROW-162'));
  expect(ids.length, 'ROW-162: eight requests answered with ids').toBe(8);
  for (const id of ids) expect.soft(list.some((o) => sameId(o.id, id)), `ROW-162: request ${id} is on the list`).toBe(true);
});
