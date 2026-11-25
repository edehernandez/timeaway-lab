// Purpose: ledger tests for ROW-252 and ROW-272 (REQ-018) — every allowance and name change is stored with its old and new value, and every allowance change with the year it starts.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, rename, allowances), read through records.ts, fresh per run.
// Slice 1, brief test-author-11: ROW-252's by-field cases added at the end — old and new read from D-043's own fields
// (from, to) so a swapped entry fails; every earlier assertion kept.
//
// Boundary (R6): a data entity, at the HTTP harness. The stored change is observed where the product exposes it: the
// admin's view of the person's change history, GET /api/admin/people/:id/history (D-029), which REQ-028 promises shows
// each allowance and name change with its old and new value and, for allowances, the year it starts.
// The history answer's field names are not in D-029: a change is a record of the answer (an object in a list, records.ts)
// and its values are read by value inside that one record — so an old value and a new value held by two different
// records are not a change "with its old and new value".
// The clock: Mon 2027-03-01 09:00 in Pacific/Auckland; the current year is 2027, the next 2028.
import { test, expect } from '@playwright/test';
import {
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  rename,
  resetProduct,
  setAllowance,
  signIn,
  type Actor,
  type Member,
} from './harness';
import { holdsValue, observeHistory, observePeople, recordByEmail, records, show, teamInstant, type Rec } from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_NOW = teamInstant('2027-03-01', '09:00', TZ);

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface Changes {
  admin: Actor;
  m: Member;
  names: [string, string, string]; // as created, first rename, second rename
}

/** Gil: created as names[0] with allowance 33; renamed to names[1], then names[2]; allowance 47 from this year, then 52 from next year. */
async function changes(): Promise<Changes> {
  const install = await resetProduct({ now: T_NOW, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const names: [string, string, string] = [freshName('Gil'), freshName('Gail'), freshName('Gwen')];
  const m = await createMember(admin, { name: names[0], email: freshEmail('gil'), allowance: 33 });
  await rename(admin, m.id, names[1]);
  await rename(admin, m.id, names[2]);
  await setAllowance(admin, m.id, 47);
  await setAllowance(admin, m.id, 52, { startsNextYear: true });
  return { admin, m, names };
}

function changeHolding(history: unknown, ...values: (string | number)[]): Rec | undefined {
  return records(history).find((r) => values.every((v) => holdsValue(r, v)));
}

/** The control both rows share in shape: the changes landed (the people record reads the last name and 47) and the history answers. */
async function changesLanded(row: string, f: Changes): Promise<void> {
  const rec = recordByEmail(await observePeople(f.admin), f.m.email);
  expect.soft(holdsValue(rec, f.names[2]), `${row} control: the people record reads the last name (${show(rec)})`).toBe(true);
  expect.soft(holdsValue(rec, 47) && holdsValue(rec, 52), `${row} control: the people record reads 47 for 2027 and 52 for 2028`).toBe(true);
  const res = await f.admin.api.get(`/api/admin/people/${encodeURIComponent(String(f.m.id))}/history`);
  expect.soft(res.status(), `${row} control: the history answers the admin`).toBe(200);
}

// ---------------------------------------------------------------------------------------------------
// ROW-252 promise: REQ-018 fail-if (2) "an allowance or name change is stored without its old and new value" (A-045:
// ROW-252   "allowance and name changes record the old and new value"; REQ-028 shows them).
// ROW-252 wrong product: an audit trail that stores only the value set ("name: Gail", "allowance: 47"), so the value
// ROW-252   before the change can only be guessed from the previous entry, or not at all for the first one.
// ROW-252 given: Gil created with a fresh name and allowance 33. when: the admin renames Gil → Gail → Gwen (fresh names)
// ROW-252   and changes the allowance 33 → 47 (this year) → 52 (from next year), then reads Gil's history. then: one change
// ROW-252   holds both Gil and Gail, one both Gail and Gwen, one both 33 and 47, one both 47 and 52.
// ROW-252 controls: the control case shows the changes landed — the people record reads Gwen, 47 and 52 — and the
// ROW-252   history answers the admin.
// ROW-252 technique: two changes of each kind, so the middle value is the new value of one change and the old value of
// ROW-252   the next — a product storing only new values cannot put both in one record; fresh names, unusual numbers.
// ROW-252 cases: ROW-252 target=ROW-252.REQ-018.every-allowance-and-name-change-holds-its-old-and-new-value control=ROW-252.control.the-changes-land-and-the-history-answers
test('ROW-252.control.the-changes-land-and-the-history-answers', async () => {
  await changesLanded('ROW-252', await changes());
});

test('ROW-252.REQ-018.every-allowance-and-name-change-holds-its-old-and-new-value', async () => {
  const f = await changes();
  const history = await observeHistory(f.admin, f.m.id);
  const [a, b, c] = f.names;
  expect.soft(changeHolding(history, a, b), `ROW-252: the rename ${a} → ${b} holds both names (${show(history)})`).toBeDefined();
  expect.soft(changeHolding(history, b, c), `ROW-252: the rename ${b} → ${c} holds both names`).toBeDefined();
  expect.soft(changeHolding(history, 33, 47), 'ROW-252: the allowance change 33 → 47 holds both values').toBeDefined();
  expect.soft(changeHolding(history, 47, 52), 'ROW-252: the allowance change 47 → 52 holds both values').toBeDefined();
});

// ---------------------------------------------------------------------------------------------------
// ROW-272 promise: REQ-018 fail-if (4) "an allowance change is stored without the year it starts"; REQ-018 "allowance
// ROW-272   changes with the year they start" (A-043: the admin chooses this year or next year; D-025: each change is
// ROW-272   stored with the year it starts from).
// ROW-272 wrong product: an allowance change stored with its values and when it was made but no starting year, or with
// ROW-272   the year it was made (2027) for a change that starts next year.
// ROW-272 given: Gil's allowance changed 33 → 47 starting this year (2027) and 47 → 52 starting next year (2028), both
// ROW-272   made in 2027. when: the admin reads Gil's history. then: the change to 47 holds the year 2027 and the change to
// ROW-272   52 holds the year 2028 (as a value of its own, never inside a date).
// ROW-272 controls: the control case shows the changes landed (people record 47 and 52) and the history answers.
// ROW-272 technique: a next-year change made in the current year, so the year it starts (2028) differs from the year
// ROW-272   it was made (2027) and no timestamp of the record can supply it.
// ROW-272 cases: ROW-272 target=ROW-272.REQ-018.every-allowance-change-holds-the-year-it-starts control=ROW-272.control.the-changes-land-and-the-history-answers
test('ROW-272.control.the-changes-land-and-the-history-answers', async () => {
  await changesLanded('ROW-272', await changes());
});

test('ROW-272.REQ-018.every-allowance-change-holds-the-year-it-starts', async () => {
  const f = await changes();
  const history = await observeHistory(f.admin, f.m.id);
  // each change located by its new value (so this row does not depend on ROW-252's old values)
  const thisYear = records(history).find((r) => holdsValue(r, 47) && !holdsValue(r, 52));
  const nextYear = changeHolding(history, 52);
  expect(thisYear || nextYear, `ROW-272: the allowance changes are in the history (${show(history)})`).toBeTruthy();
  expect.soft(holdsValue(thisYear, 2027), `ROW-272: the change starting this year holds 2027 (${show(thisYear)})`).toBe(true);
  expect.soft(holdsValue(nextYear, 2028), `ROW-272: the change starting next year holds 2028 (${show(nextYear)})`).toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-252 — old and new read by the entries' own fields (added, slice 1, brief test-author-11)
// ROW-252 promise: REQ-018 fail-if (2) "an allowance or name change is stored without its old and new value"
// ROW-252   (A-045: "allowance and name changes record the old and new value"); D-043 names where they are read:
// ROW-252   GET /api/admin/people/:id/history answers {history:[…]}, a rename {at, by, what:'renamed', from, to}, an
// ROW-252   allowance change {at, by, what:'allowance set', from, to, startsYear}, from "the allowance its starting year
// ROW-252   had before the change", the allowance values as numbers.
// ROW-252 wrong product: an entry that holds both values but swapped — 47 → 33 stored for a change from 33 to 47, or
// ROW-252   "Gail → Gil" for a rename of Gil to Gail — so the history says the change undid itself; the by-value cases above
// ROW-252   (both values somewhere in one record) stay green on it.
// ROW-252 given: Gil created with a fresh name g0 and a fresh allowance x0; the history read once. when: the admin
// ROW-252   renames g0 → g1 → g2 (fresh names), sets x2 starting next year and then x1 starting this year (fresh
// ROW-252   numbers, x0 < x1 < x2 in disjoint ranges), and reads the history again. then: before, no entry's `to` is g1,
// ROW-252   g2, x1 or x2; after, exactly one entry's `to` is each of them and its `from` is the old value — g0, g1, x0
// ROW-252   (2028 had x0 before x2: nothing had started by then), x0 (2027 had x0 before x1) — and no entry runs the
// ROW-252   other way (from a new value back to its old one).
// ROW-252 controls: ROW-252.control.by-field-history-answers-each-new-value — the history answers 200 with D-043's
// ROW-252   `history` list and each of the four new values sits in an entry's `from` or `to`: the changes landed and the
// ROW-252   history is reached, whichever way round a product stores them.
// ROW-252 technique: the promised field per value (D-043's from/to), the swap as the decoy that must not match, a
// ROW-252   before/after read, the next-year change made first so both allowance changes have the same, known old value.
// ROW-252 cases: ROW-252 target=ROW-252.REQ-018.each-change-stores-its-old-value-in-from-and-its-new-value-in-to control=ROW-252.control.by-field-history-answers-each-new-value

type Entry = Record<string, unknown>;

/** D-043's history list: the `history` array of GET /api/admin/people/:id/history, its objects only. */
function entriesOf(body: unknown): Entry[] | null {
  const list = (body as { history?: unknown } | null)?.history;
  if (!Array.isArray(list)) return null;
  return list.filter((e): e is Entry => e !== null && typeof e === 'object' && !Array.isArray(e));
}

/** A field's value equals `want`: a name as its exact text (trimmed), an allowance as the number (a numeric text read as its number). */
function fieldIs(v: unknown, want: string | number): boolean {
  if (typeof want === 'number') return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number(v) === want;
  return typeof v === 'string' && v.trim() === want;
}

function pick(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

interface FieldChanges {
  admin: Actor;
  m: Member;
  g: [string, string, string];
  x: [number, number, number];
  before: unknown;
  after: unknown;
}

/** Gil: created g0/x0; history read; renamed g0 → g1 → g2; allowance x2 from next year, then x1 from this year; history read again. */
async function fieldChanges(): Promise<FieldChanges> {
  const install = await resetProduct({ now: T_NOW, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const g: [string, string, string] = [freshName('Gil'), freshName('Gail'), freshName('Gwen')];
  const x: [number, number, number] = [pick(61, 79), pick(81, 99), pick(101, 119)];
  const m = await createMember(admin, { name: g[0], email: freshEmail('gil'), allowance: x[0] });
  const before = await observeHistory(admin, m.id);
  await rename(admin, m.id, g[1]);
  await rename(admin, m.id, g[2]);
  await setAllowance(admin, m.id, x[2], { startsNextYear: true });
  await setAllowance(admin, m.id, x[1], { startsNextYear: false });
  const after = await observeHistory(admin, m.id);
  return { admin, m, g, x, before, after };
}

test('ROW-252.control.by-field-history-answers-each-new-value', async () => {
  const f = await fieldChanges();
  const entries = entriesOf(f.after);
  expect(entries, `ROW-252 control: the history answers D-043's {history:[…]} (${show(f.after)})`).not.toBeNull();
  for (const v of [f.g[1], f.g[2], f.x[1], f.x[2]]) {
    expect
      .soft((entries ?? []).some((e) => fieldIs(e.from, v) || fieldIs(e.to, v)), `ROW-252 control: ${JSON.stringify(v)} sits in an entry's from or to (${show(f.after)})`)
      .toBe(true);
  }
});

test('ROW-252.REQ-018.each-change-stores-its-old-value-in-from-and-its-new-value-in-to', async () => {
  const f = await fieldChanges();
  const [g0, g1, g2] = f.g;
  const [x0, x1, x2] = f.x;
  const pairs: { what: string; from: string | number; to: string | number }[] = [
    { what: `rename ${g0} → ${g1}`, from: g0, to: g1 },
    { what: `rename ${g1} → ${g2}`, from: g1, to: g2 },
    { what: `allowance ${x0} → ${x2} from next year`, from: x0, to: x2 },
    { what: `allowance ${x0} → ${x1} from this year`, from: x0, to: x1 },
  ];
  const before = entriesOf(f.before) ?? [];
  for (const p of pairs) {
    expect.soft(before.filter((e) => fieldIs(e.to, p.to)), `ROW-252 before the changes: no entry's to is ${JSON.stringify(p.to)}`).toEqual([]);
  }
  const after = entriesOf(f.after);
  expect(after, `ROW-252: the history answers D-043's {history:[…]} (${show(f.after)})`).not.toBeNull();
  for (const p of pairs) {
    const hits = (after ?? []).filter((e) => fieldIs(e.to, p.to));
    expect.soft(hits.length, `ROW-252: exactly one entry has to = ${JSON.stringify(p.to)} for the ${p.what} (${show(f.after)})`).toBe(1);
    for (const e of hits) {
      expect.soft(fieldIs(e.from, p.from), `ROW-252: the ${p.what} stores from = ${JSON.stringify(p.from)} (${show(e)})`).toBe(true);
    }
    const swapped = (after ?? []).filter((e) => fieldIs(e.from, p.to) && fieldIs(e.to, p.from));
    expect.soft(swapped, `ROW-252: no entry runs the ${p.what} the other way (from ${JSON.stringify(p.to)} to ${JSON.stringify(p.from)})`).toEqual([]);
  }
});
