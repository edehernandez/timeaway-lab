// Purpose: ledger tests for ROW-204 (REQ-006, REQ-017), the case "recovered by hand in the database" — after the admin account is recovered by hand in the store (a known password hash, a successor's display name and email written into its row), who decided or cancelled each request still shows correctly: the current display name, the record keeping the account id.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel, the admin's cancel, password set), fresh per run; the hand recovery written through the store door of D-048 (doors-store.ts); the person's page opened in the browser through the engine door (openPage). The renamed and switched-off cases are in tests/invariants/REQ-006.provenance-current-name.spec.ts.
//
// Row table:
//   ROW-204 | provenance | operator:admin | the admin's read of P's requests, P's own read, P's own page (/), after a hand recovery
//
// What "recovered by hand" is here (A-013: "if the admin forgets their password or leaves, recovery is done by hand in
// the database by whoever runs the server, outside the product"): with the server running, one UPDATE on the admin's
// row of the accounts table writes (a) the password columns of another account whose password is known — the columns a
// password set changes on that account, its text or blob values (not numbers, not times) — so the forgotten password is
// replaced by a known one, and (b) a successor's fresh display name into the columns holding the old name and a fresh
// email into the columns holding the old email, as a departed admin is handed on. No product route is used for it.
//
// ROW-204 promise: REQ-006 "each with … who decided it and when, who cancelled it and when", REQ-017 "who decided it
// ROW-204   and when, who cancelled it and when"; the row: "Who decided or cancelled a request still shows correctly after
// ROW-204   that account is … recovered by hand in the database. Cases: the current display name is shown, the record
// ROW-204   keeping the account id". Authority: the row, REQ-006, REQ-017, A-013 (recovery by hand), A-029 (a display
// ROW-204   name), A-023, D-040 (decided_by on the request), D-048 (the store door).
// ROW-204 wrong product: the decider is recorded by the admin's email, so after a hand-changed email the decision names
// ROW-204   no one; or display names are cached in the server's memory by account id and refreshed only by the product's own
// ROW-204   rename route, so a hand edit leaves the old name shown; or the decision copies the name text into the request.
// ROW-204 given: team Wed 2027-03-10; the admin (fresh name N0) approves P's R1 (April), rejects R3 (June), approves
// ROW-204   and then cancels R4 (July); P cancels their own pending R2 (May); member Q's password is set to a fresh
// ROW-204   password PQ. when: the admin's row is recovered by hand: Q's password columns, a fresh name N2, a fresh email
// ROW-204   E2. then: E2 with PQ signs in as the admin, with the admin's same account id; in the recovered admin's read of
// ROW-204   P's requests and in P's own read every decider and canceller is its account (by id where the record carries
// ROW-204   one) under its current name — R1, R3, R4 the admin as N2, R2 P — and none carries N0; P's page draws N2 in the
// ROW-204   April and July rows and draws N0 nowhere; every stored decider is still the admin's stored key.
// ROW-204 controls: the control case — before the recovery the same records name the admin N0 and the store holds the
// ROW-204   admin's key as their decider; the hand edit is taken by the store and E2 with PQ signs the admin in.
// ROW-204 technique: fresh values before and after a hand edit (N0 is the near miss that must not match), one exact
// ROW-204   place per request (its decider, its canceller, its row on the page), the stored decider key as the id oracle.
// ROW-204 cases: ROW-204 target=ROW-204.REQ-006.decider-and-canceller-show-the-current-name-after-hand-recovery control=ROW-204.control.hand-recovery-is-taken-and-records-are-read
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  reject,
  resetProduct,
  SetupError,
  sendRequest,
  setPassword,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { byId, readOwnRequests, readPersonRequests, refIs, type AccountRef, type RequestRecord } from './request-records';
import { loadSettled, monthMarker, rowWith } from './page-rows';
import { cellInstants, ident, sameCell, storedAccount, storeRead, storeRun, type Cell } from './doors-store';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

interface World {
  install: Install;
  admin: Actor;
  adminKey: Cell;
  p: Member;
  q: Member;
  pq: string;
  r1: string;
  r2: string;
  r3: string;
  r4: string;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const adminKey = (await storedAccount(install.admin.email)).key;
  const p = await createMember(admin);
  const q = await createMember(admin);
  const ps = await signInMember(p);
  const r1 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }));
  await approve(admin, r1);
  const r2 = String(await sendRequest(ps, { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
  await cancelOwnRequest(ps, r2);
  const r3 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' }));
  await reject(admin, r3);
  const r4 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-07-05', lastDay: '2027-07-06' }));
  await approve(admin, r4);
  await adminCancel(admin, r4);
  await ps.dispose();
  const pq = freshPassword();
  return { install, admin, adminKey, p, q, pq, r1, r2, r3, r4 };
}

/**
 * Recovers the admin's account by hand: one UPDATE on its accounts row through the store door (see the header).
 * Returns the successor's name and email. Throws a SetupError when the columns cannot be found or the store refuses.
 */
async function recoverByHand(w: World): Promise<{ name: string; email: string }> {
  const qBefore = (await storedAccount(w.q.email)).row;
  await setPassword(w.admin, w.q.id, w.pq);
  const qAfter = await storedAccount(w.q.email);
  const passwordCols = Object.keys(qAfter.row).filter((c) => {
    const v = qAfter.row[c];
    if (sameCell(v, qBefore[c]) || v === null || typeof v === 'number' || typeof v === 'boolean') return false;
    if (cellInstants(v, w.install.timeZone).length > 0) return false;
    return typeof v === 'object' || String(v).length >= 16;
  });
  if (passwordCols.length === 0) throw new SetupError('a password set changed no text or blob column of the account\'s row: no password columns to copy');
  const admin = await storedAccount(w.install.admin.email);
  const nameCols = Object.keys(admin.row).filter((c) => admin.row[c] === w.install.admin.name);
  if (nameCols.length === 0) throw new SetupError('no column of the admin\'s accounts row holds its display name');
  const name = freshName('Successor');
  const email = freshEmail('successor');
  const sets: [string, Cell][] = [
    ...passwordCols.map((c) => [c, qAfter.row[c]] as [string, Cell]),
    ...nameCols.map((c) => [c, name] as [string, Cell]),
    ...admin.emailColumns.map((c) => [c, email] as [string, Cell]),
  ];
  const a = await storeRun(
    `UPDATE accounts SET ${sets.map(([c]) => `${ident(c)} = ?`).join(', ')} WHERE ${ident(admin.keyColumn)} = ?`,
    [...sets.map(([, v]) => v), admin.key],
  );
  if (a.error !== null || a.changes !== 1) throw new SetupError(`the store did not take the hand recovery (changes=${a.changes}, error=${a.error})`);
  return { name, email };
}

/** The [label, reference, account] triples a world's records must satisfy. */
function provenance(w: World, list: RequestRecord[], admin: { id: string; name: string }, person: { id: string; name: string }) {
  return [
    ['R1 decider', byId(list, w.r1)?.decidedBy ?? null, admin],
    ['R3 decider', byId(list, w.r3)?.decidedBy ?? null, admin],
    ['R4 decider', byId(list, w.r4)?.decidedBy ?? null, admin],
    ['R4 canceller', byId(list, w.r4)?.cancelledBy ?? null, admin],
    ['R2 canceller', byId(list, w.r2)?.cancelledBy ?? null, person],
  ] as [string, AccountRef | null, { id: string; name: string }][];
}

/** The stored deciders of every decided request (D-040's decided_by). */
async function storedDeciders(): Promise<Cell[]> {
  return (await storeRead('SELECT decided_by FROM requests WHERE decided_by IS NOT NULL')).map((r) => r.decided_by);
}

test('ROW-204.control.hand-recovery-is-taken-and-records-are-read', async () => {
  const w = await world();
  try {
    const list = await readPersonRequests(w.admin, w.p.id);
    for (const [label, ref, account] of provenance(w, list, { id: String(w.admin.me.id), name: w.install.admin.name }, { id: String(w.p.id), name: w.p.name })) {
      expect.soft(refIs(ref, account), `ROW-204 control: ${label} is ${account.name} before the recovery (read ${JSON.stringify(ref)})`).toBe(true);
    }
    const deciders = await storedDeciders();
    expect.soft(deciders.length, 'ROW-204 control: the store holds a decider for R1, R3 and R4').toBe(3);
    expect.soft(deciders.every((d) => sameCell(d, w.adminKey)), `ROW-204 control: each stored decider is the admin's key ${String(w.adminKey)}`).toBe(true);
    const succ = await recoverByHand(w);
    const recovered = await signIn({ email: succ.email, password: w.pq });
    try {
      expect.soft(recovered.me.isAdmin, 'ROW-204 control: the hand-recovered credentials sign in as the admin').toBe(true);
    } finally {
      await recovered.dispose();
    }
  } finally {
    await w.admin.dispose();
  }
});

test('ROW-204.REQ-006.decider-and-canceller-show-the-current-name-after-hand-recovery', async ({ browser }) => {
  const w = await world();
  const n0 = w.install.admin.name;
  try {
    const succ = await recoverByHand(w);
    const recovered = await signIn({ email: succ.email, password: w.pq });
    try {
      expect.soft(String(recovered.me.id), 'ROW-204 the recovered admin keeps the account id it had').toBe(String(w.admin.me.id));
      const admin = { id: String(w.admin.me.id), name: succ.name };
      const person = { id: String(w.p.id), name: w.p.name };
      const checkRecords = (list: RequestRecord[], view: string) => {
        for (const [label, ref, account] of provenance(w, list, admin, person)) {
          expect.soft(refIs(ref, account), `ROW-204 ${view}: ${label} is the account now named ${account.name} (read ${JSON.stringify(ref)})`).toBe(true);
          expect.soft(ref?.name === n0, `ROW-204 ${view}: ${label} carries no old name ${n0} (read ${JSON.stringify(ref)})`).toBe(false);
        }
      };
      checkRecords(await readPersonRequests(recovered, w.p.id), 'the recovered admin\'s read');
      const deciders = await storedDeciders();
      expect.soft(deciders.length === 3 && deciders.every((d) => sameCell(d, w.adminKey)), `ROW-204 every stored decider is still the admin's key (${JSON.stringify(deciders)})`).toBe(true);

      const ps = await signInMember(w.p);
      const opened = await openPage(browser, ps);
      try {
        checkRecords(await readOwnRequests(ps), 'P\'s own read');
        expect.soft(await loadSettled(opened.page, PAGES.home), 'ROW-204 P\'s own page answers').toBe(200);
        for (const [label, day] of [
          ['R1 (April, decided)', '2027-04-05'],
          ['R4 (July, decided and cancelled)', '2027-07-05'],
        ] as const) {
          await expect.soft(rowWith(opened.page, monthMarker(day)), `ROW-204 P's page: the ${label} row names the admin as ${succ.name}`).toContainText(succ.name);
        }
        const text = await opened.page.locator('body').innerText();
        expect.soft(text.includes(n0), `ROW-204 P's page draws no old admin name ${n0}`).toBe(false);
      } finally {
        await opened.close();
        await ps.dispose();
      }
    } finally {
      await recovered.dispose();
    }
  } finally {
    await w.admin.dispose();
  }
});
