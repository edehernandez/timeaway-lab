// Purpose: ledger tests for ROW-090 and ROW-253 (REQ-018 arms 1 and 3) — an allowance change, a rename, a password set, a switch-off, a switch-on and an email change are each stored with a record of who did it and when, read in the store's account_events through the store door.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); fixture data made through the product's public routes by harness.ts (reset, create account, allowance, rename, password set, switch off and on, email change), fresh per run; the team clock moved through the harness (setClock) to a fresh instant before each act; the records read through the store door of D-048 (doors-store.ts).
//
// Row table:
//   ROW-090 | REQ-018 arm 1 | operator:admin | account_events after each of allowance change, rename, password set, switch off, switch on
//   ROW-253 | REQ-018 arm 3 | operator:admin | account_events after an email change
//
// How a record is read (D-048: "the account records are read through the store door"; D-043 names account_events and
// its from_value, to_value, starts_year): the rows an act adds to account_events are the rows there after it and not
// before it. A row records the act when, leaving out the table's own key and from_value, to_value and starts_year
// (the act's values, which may be small numbers that look like ids), it holds the target account's stored key in one
// column, the acting admin's stored key in ANOTHER column, and in some column a time equal (within 10 minutes) to the
// team clock's instant at the act. The stored keys are read from the accounts table by email, never assumed equal to
// the API's ids. The act's instant is the team clock's (D-031: every time read goes through the team clock), set to a
// fresh instant days apart from the others, so a constant, a creation time or another act's time cannot pass.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  changeEmail,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  rename,
  resetProduct,
  setAllowance,
  setClock,
  setPassword,
  signIn,
  switchAccount,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { cellInstants, keyColumn, newRowsSince, sameCell, storedAccount, tableColumns, tableRows, type Cell, type Row } from './doors-store';

const T0 = '2027-02-28T20:00:00Z'; // Mon 2027-03-01 09:00 Pacific/Auckland
const WINDOW_MS = 10 * 60 * 1000;
const ACT_VALUE_COLUMNS = ['from_value', 'to_value', 'starts_year'];

interface Found {
  /** The columns holding the acting admin's key in a row that records the act (empty: no such row). */
  whoColumns: string[];
  /** What the act added to account_events, for the failure message. */
  added: Row[];
}

/** The columns of account_events a who / target / when may sit in: all but the table's key and the act's values (D-043). */
async function recordColumns(): Promise<string[]> {
  const key = await keyColumn('account_events');
  return (await tableColumns('account_events')).map((c) => c.name).filter((c) => c !== key && !ACT_VALUE_COLUMNS.includes(c));
}

/** Runs `act` at the fresh team instant `at` and reads which rows it added to account_events that record it. */
async function recordOf(at: string, act: () => Promise<void>, who: Cell, target: Cell, timeZone: string): Promise<Found> {
  await setClock(at);
  const before = await tableRows('account_events');
  await act();
  const added = await newRowsSince('account_events', before);
  const cols = await recordColumns();
  const atMs = Date.parse(at);
  const whoColumns = new Set<string>();
  for (const row of added) {
    const targetCols = cols.filter((c) => sameCell(row[c], target));
    const byCols = cols.filter((c) => !targetCols.includes(c) && sameCell(row[c], who));
    const timed = cols.some((c) => cellInstants(row[c], timeZone).some((t) => Math.abs(t - atMs) <= WINDOW_MS));
    if (targetCols.length > 0 && byCols.length > 0 && timed) byCols.forEach((c) => whoColumns.add(c));
  }
  return { whoColumns: [...whoColumns], added };
}

interface World {
  install: Install;
  admin: Actor;
  adminKey: Cell;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  const adminKey = (await storedAccount(install.admin.email)).key;
  return { install, admin, adminKey };
}

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).ok();
  } finally {
    await api.dispose();
  }
}

/** The five acts of ROW-090 on member `m`, each at its own fresh team instant (days apart, odd minutes). */
function row090Acts(w: World, m: Member, next: { allowance: number; name: string; password: string }) {
  return [
    ['allowance change', '2027-03-02T21:17:00Z', () => setAllowance(w.admin, m.id, next.allowance)],
    ['rename', '2027-03-03T22:23:00Z', () => rename(w.admin, m.id, next.name)],
    ['password set', '2027-03-04T23:41:00Z', () => setPassword(w.admin, m.id, next.password)],
    ['switch off', '2027-03-07T19:53:00Z', () => switchAccount(w.admin, m.id, false)],
    ['switch on', '2027-03-08T20:07:00Z', () => switchAccount(w.admin, m.id, true)],
  ] as [string, string, () => Promise<void>][];
}

// ---------------------------------------------------------------------------------------------------
// ROW-090 promise: REQ-018 fail-if (1) "an allowance change, a name change, a password set or an account switch is
// ROW-090   stored with no record of who did it and when"; the row's cases: one each for allowance change, rename,
// ROW-090   password set, switch off and switch on. Authority: REQ-018, A-023 ("every … allowance change, password set
// ROW-090   and account switch records who did it and when"), A-045, D-043 (the records are kept in account_events with
// ROW-090   who and when, password, email and switch records included), D-048 (read through the store door).
// ROW-090 wrong product: the history route's two kinds (rename, allowance) are recorded and the password set and the
// ROW-090   switches are not; or a switch writes only the account's new state; or a record names the target account
// ROW-090   but not the admin who acted; or stamps a fixed or creation time instead of the act's.
// ROW-090 given: a fresh install at team Mon 2027-03-01; member M (fresh name, email, password), the one admin.
// ROW-090   when: the admin, at five fresh team instants days apart, sets M's allowance to a fresh number, renames M,
// ROW-090   sets M a fresh password, switches M off, switches M back on. then: each act added to account_events a row
// ROW-090   holding M's stored key, the admin's stored key in another column, and that act's own instant; and the
// ROW-090   admin's key sits in one same column across all five records (so a 1 that is a switch's "on" flag cannot
// ROW-090   stand in for the admin's key 1).
// ROW-090 controls: the control case — each act took effect as the product shows it (M's days left is the new
// ROW-090   allowance; the people list draws the new name; the new password signs in; switched off M cannot sign in;
// ROW-090   switched on M can) and the store door finds M's and the admin's account rows and the account_events table.
// ROW-090 technique: before and after per act (only rows the act added count), fresh instants as the "when" oracle,
// ROW-090   and the target's key as the near miss for "who" (it must be in a different column from the admin's).
// ROW-090 cases: ROW-090 target=ROW-090.REQ-018.each-account-change-records-who-and-when control=ROW-090.control.each-account-change-took-effect
// ---------------------------------------------------------------------------------------------------

test('ROW-090.control.each-account-change-took-effect', async () => {
  const w = await world();
  try {
    const m = await createMember(w.admin, { allowance: 25 });
    const mAccount = await storedAccount(m.email);
    expect.soft(sameCell(mAccount.key, w.adminKey), 'ROW-090 control: M and the admin are two stored accounts').toBe(false);
    await tableColumns('account_events');
    const next = { allowance: 11 + Math.floor(Math.random() * 9), name: freshName('Renamed'), password: freshPassword() };
    for (const [label, at, act] of row090Acts(w, m, next)) {
      await setClock(at);
      await act();
      if (label === 'allowance change') {
        const s = await signIn({ email: m.email, password: m.password });
        try {
          const bal = (await (await s.api.get('/api/balance')).json()) as { years: { year: number; daysLeft: number }[] };
          expect.soft(bal.years.find((y) => y.year === 2027)?.daysLeft, 'ROW-090 control: M\'s 2027 days left is the new allowance').toBe(next.allowance);
        } finally {
          await s.dispose();
        }
      }
      if (label === 'rename') {
        const people = await (await w.admin.api.get('/api/admin/people')).text();
        expect.soft(people.includes(next.name), 'ROW-090 control: the people list names M by the new name').toBe(true);
      }
      if (label === 'password set') expect.soft(await signsIn(m.email, next.password), 'ROW-090 control: the set password signs M in').toBe(true);
      if (label === 'switch off') expect.soft(await signsIn(m.email, next.password), 'ROW-090 control: switched off M cannot sign in').toBe(false);
      if (label === 'switch on') expect.soft(await signsIn(m.email, next.password), 'ROW-090 control: switched on M signs in').toBe(true);
    }
  } finally {
    await w.admin.dispose();
  }
});

test('ROW-090.REQ-018.each-account-change-records-who-and-when', async () => {
  const w = await world();
  try {
    const m = await createMember(w.admin, { allowance: 25 });
    const mKey = (await storedAccount(m.email)).key;
    const next = { allowance: 11 + Math.floor(Math.random() * 9), name: freshName('Renamed'), password: freshPassword() };
    const whoSets: [string, string[]][] = [];
    for (const [label, at, act] of row090Acts(w, m, next)) {
      const found = await recordOf(at, act, w.adminKey, mKey, w.install.timeZone);
      expect
        .soft(found.whoColumns.length > 0, `ROW-090 the ${label} at ${at} is stored with a record naming M, the admin who did it, and when (added: ${JSON.stringify(found.added)})`)
        .toBe(true);
      whoSets.push([label, found.whoColumns]);
    }
    const common = whoSets.reduce<string[] | null>((acc, [, cols]) => (acc === null ? cols : acc.filter((c) => cols.includes(c))), null) ?? [];
    expect.soft(common.length > 0, `ROW-090 the five records name the admin in one same column (per act: ${JSON.stringify(whoSets)})`).toBe(true);
  } finally {
    await w.admin.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-253 promise: REQ-018 fail-if (3) "an email change is stored with no record of who did it and when". Authority:
// ROW-253   REQ-018, A-044 ("the admin can change an account's email … and the change is recorded"), D-043 (email
// ROW-253   records are kept with who and when), D-048 (read through the store door).
// ROW-253 wrong product: the email change updates the account and writes no record; or a record that names the
// ROW-253   account but not who changed it, or carries no time, or the account's creation time.
// ROW-253 given: a fresh install at team Mon 2027-03-01; members M1 and M2. when: the admin changes M1's email at
// ROW-253   one fresh team instant and M2's at another, days later. then: each change added to account_events a row
// ROW-253   holding that member's stored key, the admin's stored key in another column, and that change's own instant;
// ROW-253   and the admin's key sits in one same column in both records.
// ROW-253 controls: the control case — each new email signs its member in, the old one no longer does, and the store
// ROW-253   door finds the account under its new email with the key it had.
// ROW-253 technique: before and after per change; two targets so the "who" column is fixed by agreement, the target's
// ROW-253   key the near miss for "who"; fresh instants as the "when" oracle.
// ROW-253 cases: ROW-253 target=ROW-253.REQ-018.email-change-records-who-and-when control=ROW-253.control.email-change-took-effect
// ---------------------------------------------------------------------------------------------------

const EMAIL_ACTS = ['2027-03-09T21:29:00Z', '2027-03-11T22:11:00Z'];

test('ROW-253.control.email-change-took-effect', async () => {
  const w = await world();
  try {
    const members = [await createMember(w.admin), await createMember(w.admin)];
    for (const [i, m] of members.entries()) {
      const key = (await storedAccount(m.email)).key;
      const email = freshEmail('moved');
      await setClock(EMAIL_ACTS[i]);
      await changeEmail(w.admin, m.id, email);
      expect.soft(await signsIn(email, m.password), `ROW-253 control: member ${i + 1}'s new email signs in`).toBe(true);
      expect.soft(await signsIn(m.email, m.password), `ROW-253 control: member ${i + 1}'s old email no longer signs in`).toBe(false);
      expect.soft(sameCell((await storedAccount(email)).key, key), `ROW-253 control: member ${i + 1}'s account keeps its key under the new email`).toBe(true);
    }
  } finally {
    await w.admin.dispose();
  }
});

test('ROW-253.REQ-018.email-change-records-who-and-when', async () => {
  const w = await world();
  try {
    const members = [await createMember(w.admin), await createMember(w.admin)];
    const whoSets: string[][] = [];
    for (const [i, m] of members.entries()) {
      const key = (await storedAccount(m.email)).key;
      const email = freshEmail('moved');
      const found = await recordOf(EMAIL_ACTS[i], () => changeEmail(w.admin, m.id, email), w.adminKey, key, w.install.timeZone);
      expect
        .soft(found.whoColumns.length > 0, `ROW-253 the email change of member ${i + 1} at ${EMAIL_ACTS[i]} is stored with a record naming the account, the admin who did it, and when (added: ${JSON.stringify(found.added)})`)
        .toBe(true);
      whoSets.push(found.whoColumns);
    }
    const common = whoSets[0].filter((c) => whoSets[1].includes(c));
    expect.soft(common.length > 0, `ROW-253 both email-change records name the admin in one same column (${JSON.stringify(whoSets)})`).toBe(true);
  } finally {
    await w.admin.dispose();
  }
});
