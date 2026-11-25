// Purpose: ledger tests for ROW-198 (REQ-017, REQ-023), the clause "enforced by the store too" — a request record that breaks a record rule, written straight into the store past the product's routes, is refused by the store and leaves the stored records as they were.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); the starting records made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel, the admin's cancel whole and partial), fresh per run, on the team clock (setClock) in Pacific/Auckland; the bad writes made through the store door of D-048 (doors-store.ts). The row's other rules, as the product reads records back, are in tests/invariants/REQ-017.record-rules.spec.ts.
//
// Row table:
//   ROW-198 | record rules | n/a | the requests table, written through POST /api/__test/store
//
// How the requests table is read: D-040 names three of its columns (decided_by, decided_at, cancel_from); the rest are
// found by the values the routes stored, never by guessing names: the first-day and last-day columns are those whose
// values are exactly the sent first and last days; the state column the one holding each request's state word; the
// kind column the one holding each kind; the person column the one holding each sender's stored account key (keys read
// from the accounts table by email); the canceller column the one holding each canceller's key and nothing where none
// cancelled; the cancel-time column the remaining one set exactly where a canceller is. A mapping that cannot be made is
// a SETUP failure naming the column.
//
// ROW-198 promise: the row's record rules, "enforced by the store too": first day not after last; one year; a state of
// ROW-198   the four; pending: no decider; approved or rejected: a decider (with its time); a decider never written onto
// ROW-198   a request that was not decided (D-040: decided_at and decided_by are written once by an approval or
// ROW-198   rejection and never by a cancel); a cancel day only on an approved, partly cancelled request, inside its range
// ROW-198   and on a weekday (D-040: a real weekday after the first day and not after the last); who cancelled and when
// ROW-198   present exactly on cancelled and partly cancelled requests; a person that exists. Authority: the row, REQ-017
// ROW-198   (fields per state, fail-if (1), (2), (4), (5)), REQ-019, REQ-023, D-040, A-023, A-030.
// ROW-198 wrong product: the rules live only in the domain module's code, so a write past it — a hand edit, a later
// ROW-198   route that forgets a check, a migration — stores a pending request with a decider, a cancel day on a Saturday,
// ROW-198   a state "expired", a first day after its last, or a request of an account that does not exist; or the store
// ROW-198   checks a rule on INSERT (a CHECK added to a new table) but a trigger-free UPDATE still breaks it.
// ROW-198 given: at team Mon 2027-03-01, P1 holds a pending (04-05..06), an approved (04-12..13), a rejected
// ROW-198   (04-19..20), an own-cancelled pending (05-03..04) and a wholly admin-cancelled approved (05-10..11) request;
// ROW-198   P2 an approved 03-08..19 the admin cancels at Wed 03-10, partly, from 03-10. when: through the store door,
// ROW-198   one UPDATE per broken rule on the request of the state it concerns, and INSERTs copying a stored request with
// ROW-198   one rule broken. then: each bad write leaves the requests table exactly as it was (the store refused it, by an
// ROW-198   error or by changing nothing).
// ROW-198 controls: the control case — the routes' records map onto the store's columns as described, and a VALID
// ROW-198   copy of P1's pending request on free days, written through the same door the same way, is stored — so the
// ROW-198   door writes and the store does not simply refuse every write.
// ROW-198 technique: one near-miss per write form (the valid INSERT beside the bad ones; the routes' own UPDATEs keep
// ROW-198   working for the product's acts), the stored table read back whole after every attempt as the oracle, never
// ROW-198   the door's own error text.
// ROW-198 cases: ROW-198 target=ROW-198.REQ-017.store-refuses-a-request-that-breaks-a-record-rule control=ROW-198.control.store-takes-a-valid-request-written-past-the-routes
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
  SetupError,
  type Actor,
  type RequestSpec,
} from './harness';
import { ident, keyColumn, sameCell, storedAccount, storeRun, tableColumns, tableRows, type Cell, type Row } from './doors-store';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland
const TP = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00: the partial admin cancel

type Label = 'pending' | 'approved' | 'rejected' | 'ownCancelled' | 'wholeCancelled' | 'partly';

interface Known {
  label: Label;
  spec: RequestSpec;
  state: string;
  person: 'P1' | 'P2';
  canceller: 'P1' | 'admin' | null;
}

interface Columns {
  key: string;
  first: string;
  last: string;
  state: string;
  kind: string;
  person: string;
  decidedBy: string;
  decidedAt: string;
  cancelFrom: string;
  cancelledBy: string;
  cancelledAt: string;
  all: string[];
}

interface World {
  admin: Actor;
  keys: { admin: Cell; P1: Cell; P2: Cell };
  cols: Columns;
  /** Each known request's stored key. */
  rowKey: Map<Label, Cell>;
}

const KNOWN: Known[] = [
  { label: 'pending', spec: { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }, state: 'pending', person: 'P1', canceller: null },
  { label: 'approved', spec: { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' }, state: 'approved', person: 'P1', canceller: null },
  { label: 'rejected', spec: { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' }, state: 'rejected', person: 'P1', canceller: null },
  { label: 'ownCancelled', spec: { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' }, state: 'cancelled', person: 'P1', canceller: 'P1' },
  { label: 'wholeCancelled', spec: { kind: 'vacation', firstDay: '2027-05-10', lastDay: '2027-05-11' }, state: 'cancelled', person: 'P1', canceller: 'admin' },
  { label: 'partly', spec: { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-19' }, state: 'approved', person: 'P2', canceller: 'admin' },
];

function setup(message: string): never {
  throw new SetupError(message);
}

/** The one column (among `candidates`) whose value on each known request's row is `want(k)`. */
function columnWhere(rows: Map<Label, Row>, candidates: string[], want: (k: Known) => Cell, what: string): string {
  const hits = candidates.filter((c) => KNOWN.every((k) => sameCell(rows.get(k.label)![c] ?? null, want(k))));
  if (hits.length !== 1) setup(`the requests table has ${hits.length} columns holding ${what} (${hits.join(', ')}); one was expected`);
  return hits[0];
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const p1 = await createMember(admin);
  const p2 = await createMember(admin);
  const s1 = await signInMember(p1);
  const s2 = await signInMember(p2);
  const ids = new Map<Label, string>();
  for (const k of KNOWN) ids.set(k.label, String(await sendRequest(k.person === 'P1' ? s1 : s2, k.spec)));
  await approve(admin, ids.get('approved')!);
  await reject(admin, ids.get('rejected')!);
  await cancelOwnRequest(s1, ids.get('ownCancelled')!);
  await approve(admin, ids.get('wholeCancelled')!);
  await adminCancel(admin, ids.get('wholeCancelled')!);
  await approve(admin, ids.get('partly')!);
  await s1.dispose();
  await s2.dispose();
  await setClock(TP);
  await adminCancel(admin, ids.get('partly')!);

  const keys = {
    admin: (await storedAccount(install.admin.email)).key,
    P1: (await storedAccount(p1.email)).key,
    P2: (await storedAccount(p2.email)).key,
  };
  const key = await keyColumn('requests');
  const all = (await tableColumns('requests')).map((c) => c.name);
  for (const named of ['decided_by', 'decided_at', 'cancel_from']) if (!all.includes(named)) setup(`the requests table has no column ${named} (D-040)`);
  const stored = await tableRows('requests');
  const others = all.filter((c) => c !== key);
  const firstCandidates = others.filter((c) => KNOWN.every((k) => stored.filter((r) => sameCell(r[c], k.spec.firstDay)).length === 1));
  const rows = new Map<Label, Row>();
  let first = '';
  for (const c of firstCandidates) {
    const m = new Map<Label, Row>(KNOWN.map((k) => [k.label, stored.find((r) => sameCell(r[c], k.spec.firstDay))!]));
    if (new Set([...m.values()]).size === KNOWN.length) {
      first = c;
      m.forEach((v, l) => rows.set(l, v));
      break;
    }
  }
  if (!first) setup('no column of the requests table holds each sent first day on its own row');
  const rest = others.filter((c) => c !== first && !['decided_by', 'decided_at', 'cancel_from'].includes(c));
  const last = columnWhere(rows, rest, (k) => k.spec.lastDay, 'each sent last day');
  const state = columnWhere(rows, rest, (k) => k.state, 'each request\'s state');
  const kind = columnWhere(rows, rest, (k) => k.spec.kind, 'each request\'s kind');
  const keyOf = (who: 'P1' | 'P2' | 'admin' | null) => (who === null ? null : keys[who]);
  const person = columnWhere(rows, rest.filter((c) => ![last, state, kind].includes(c)), (k) => keyOf(k.person), 'each sender\'s account key');
  const cancelledBy = columnWhere(rows, rest.filter((c) => ![last, state, kind, person].includes(c)), (k) => keyOf(k.canceller), 'each canceller\'s account key');
  const timeCandidates = rest
    .filter((c) => ![last, state, kind, person, cancelledBy].includes(c))
    .filter((c) => KNOWN.every((k) => (rows.get(k.label)![c] === null || rows.get(k.label)![c] === undefined) === (k.canceller === null)));
  const cancelledAt = timeCandidates.length === 1 ? timeCandidates[0] : timeCandidates.find((c) => /cancel/i.test(c));
  if (!cancelledAt) setup(`no single column of the requests table is set exactly where a canceller is (${timeCandidates.join(', ')})`);
  const rowKey = new Map<Label, Cell>([...rows].map(([l, r]) => [l, r[key]]));
  return {
    admin,
    keys,
    rowKey,
    cols: { key, first, last, state, kind, person, decidedBy: 'decided_by', decidedAt: 'decided_at', cancelFrom: 'cancel_from', cancelledBy, cancelledAt, all },
  };
}

async function rowOf(w: World, label: Label): Promise<Row> {
  const r = (await tableRows('requests')).find((x) => sameCell(x[w.cols.key], w.rowKey.get(label)!));
  if (!r) setup(`the ${label} request's row is not in the requests table`);
  return r;
}

/** A sorted text image of the whole requests table: the oracle that a refused write changed nothing. */
async function tableImage(): Promise<string[]> {
  return (await tableRows('requests')).map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();
}

/** UPDATE requests SET <sets> WHERE key = <the label's row key>. */
async function updateRow(w: World, label: Label, sets: Record<string, Cell>) {
  const cols = Object.keys(sets);
  const sql = `UPDATE requests SET ${cols.map((c) => `${ident(c)} = ?`).join(', ')} WHERE ${ident(w.cols.key)} = ?`;
  return storeRun(sql, [...cols.map((c) => sets[c]), w.rowKey.get(label)]);
}

/** INSERT a copy of the label's row with `sets` replacing some of its values (its key left to the store). */
async function insertCopy(w: World, label: Label, sets: Record<string, Cell>) {
  const cols = w.cols.all.filter((c) => c !== w.cols.key);
  const params: Cell[] = [];
  const exprs = cols.map((c) => {
    if (c in sets) {
      params.push(sets[c]);
      return '?';
    }
    return ident(c);
  });
  const sql = `INSERT INTO requests (${cols.map(ident).join(', ')}) SELECT ${exprs.join(', ')} FROM requests WHERE ${ident(w.cols.key)} = ?`;
  return storeRun(sql, [...params, w.rowKey.get(label)]);
}

test('ROW-198.control.store-takes-a-valid-request-written-past-the-routes', async () => {
  const w = await world();
  try {
    const before = (await tableRows('requests')).length;
    const a = await insertCopy(w, 'pending', { [w.cols.first]: '2027-06-07', [w.cols.last]: '2027-06-08' });
    expect.soft(a.error, 'ROW-198 control: a valid pending request on free days, written past the routes, is not refused').toBeNull();
    const after = await tableRows('requests');
    expect.soft(after.length, 'ROW-198 control: the valid copy is stored').toBe(before + 1);
    expect
      .soft(after.some((r) => r[w.cols.first] === '2027-06-07' && sameCell(r[w.cols.person], w.keys.P1) && r[w.cols.state] === 'pending'), 'ROW-198 control: the stored copy is P1\'s pending 06-07 request')
      .toBe(true);
  } finally {
    await w.admin.dispose();
  }
});

test('ROW-198.REQ-017.store-refuses-a-request-that-breaks-a-record-rule', async () => {
  const w = await world();
  try {
    const c = w.cols;
    const decidedAt = (await rowOf(w, 'approved'))[c.decidedAt];
    const cancelledAt = (await rowOf(w, 'partly'))[c.cancelledAt];
    const accountKey = await keyColumn('accounts');
    const maxKey = Math.max(0, ...(await tableRows('accounts')).map((r) => Number(r[accountKey]) || 0));
    const ghost = typeof w.keys.P1 === 'number' ? maxKey + 1000 + Math.floor(Math.random() * 1000) : `ghost-${Date.now().toString(36)}`;
    const updates: [string, Label, Record<string, Cell>][] = [
      ['a first day after its last day', 'pending', { [c.first]: '2027-04-07' }],
      ['a first and last day in different years', 'pending', { [c.last]: '2028-04-06' }],
      ['a state other than the four ("expired")', 'pending', { [c.state]: 'expired' }],
      ['a pending request with a decider', 'pending', { [c.decidedBy]: w.keys.admin, [c.decidedAt]: decidedAt }],
      ['an approved request with no decider', 'approved', { [c.decidedBy]: null, [c.decidedAt]: null }],
      ['an approved request with a decider and no decided time', 'approved', { [c.decidedAt]: null }],
      ['a rejected request with no decider', 'rejected', { [c.decidedBy]: null, [c.decidedAt]: null }],
      ['a decider written onto a cancelled request that was never decided', 'ownCancelled', { [c.decidedBy]: w.keys.admin, [c.decidedAt]: decidedAt }],
      ['a cancel day on a pending request', 'pending', { [c.cancelFrom]: '2027-04-06' }],
      ['a cancel day on a rejected request', 'rejected', { [c.cancelFrom]: '2027-04-20' }],
      ['a cancel day on a cancelled request', 'wholeCancelled', { [c.cancelFrom]: '2027-05-11' }],
      ['a cancel day on a Saturday', 'partly', { [c.cancelFrom]: '2027-03-13' }],
      ['a cancel day after the last day', 'partly', { [c.cancelFrom]: '2027-03-22' }],
      ['a cancel day before the first day', 'partly', { [c.cancelFrom]: '2027-03-05' }],
      ['a cancel day that is no real day', 'partly', { [c.cancelFrom]: '2027-02-30' }],
      ['a cancelled request with no canceller', 'ownCancelled', { [c.cancelledBy]: null, [c.cancelledAt]: null }],
      ['a partly cancelled request with no canceller', 'partly', { [c.cancelledBy]: null, [c.cancelledAt]: null }],
      ['a pending request with a canceller', 'pending', { [c.cancelledBy]: w.keys.P1, [c.cancelledAt]: cancelledAt }],
      ['an approved, not partly cancelled request with a canceller', 'approved', { [c.cancelledBy]: w.keys.admin, [c.cancelledAt]: cancelledAt }],
      ['a request of an account that does not exist', 'pending', { [c.person]: ghost }],
    ];
    for (const [rule, label, sets] of updates) {
      const before = await tableImage();
      const a = await updateRow(w, label, sets);
      const after = await tableImage();
      expect.soft(after, `ROW-198 the store refuses an UPDATE making ${rule} (door answered changes=${a.changes}, error=${a.error})`).toEqual(before);
    }
    const free = { [c.first]: '2027-08-02', [c.last]: '2027-08-13' };
    const inserts: [string, Label, Record<string, Cell>][] = [
      ['a first day after its last day', 'pending', { [c.first]: '2027-08-04', [c.last]: '2027-08-03' }],
      ['a first and last day in different years', 'pending', { [c.first]: '2027-12-30', [c.last]: '2028-01-04' }],
      ['a state other than the four ("expired")', 'pending', { ...free, [c.state]: 'expired' }],
      ['a pending request with a decider', 'pending', { ...free, [c.decidedBy]: w.keys.admin, [c.decidedAt]: decidedAt }],
      ['an approved request with no decider', 'approved', { ...free, [c.decidedBy]: null, [c.decidedAt]: null }],
      ['a cancel day on a Saturday', 'partly', { ...free, [c.cancelFrom]: '2027-08-07' }],
      ['a cancel day outside the range', 'partly', { ...free, [c.cancelFrom]: '2027-08-16' }],
      ['a partly cancelled request with no canceller', 'partly', { ...free, [c.cancelFrom]: '2027-08-09', [c.cancelledBy]: null, [c.cancelledAt]: null }],
      ['a request of an account that does not exist', 'pending', { ...free, [c.person]: ghost }],
    ];
    for (const [rule, label, sets] of inserts) {
      const before = await tableImage();
      const a = await insertCopy(w, label, sets);
      const after = await tableImage();
      expect.soft(after, `ROW-198 the store refuses an INSERT of ${rule} (door answered changes=${a.changes}, error=${a.error})`).toEqual(before);
    }
  } finally {
    await w.admin.dispose();
  }
});
