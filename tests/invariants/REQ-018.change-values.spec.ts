// Purpose: ledger tests for ROW-252 and ROW-272 (REQ-018) — every allowance and name change is stored with its old and new value, and every allowance change with the year it starts.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, rename, allowances), read through records.ts, fresh per run.
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
