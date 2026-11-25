// Purpose: ledger tests for ROW-231 (REQ-015, REQ-023), the clauses "not stored readable" and "absent from every log line" — after every way a password is given (the install's admin, a create, a forced change, an admin set, an own change, the admin's own change, a wrong sign-in), no stored value and no log line of the product carries any password in a readable form.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); fixture data made through the product's public routes by harness.ts (reset, create account, sign-in, POST /api/me/password, the admin's password set), fresh per run; the store read through the store door and the log lines through the log door of D-048 (doors-store.ts). The response and change-record clauses are in tests/invariants/REQ-015.password-never-readable.spec.ts.
//
// Row table:
//   ROW-231 | passwords | operator:admin | every table of the store (POST /api/__test/store) and the server's own output lines (GET /api/__test/logs)
//
// ROW-231 promise: the row — "A password is never readable: not stored readable, and absent from every response, log
// ROW-231   line and change record" — this file pays "not stored readable" and "log line". Authority: the row, REQ-015
// ROW-231   (the admin sets, a person changes), REQ-023 (an account holds its password), D-032 (stored as scrypt, RFC
// ROW-231   7914, with a 16-byte random salt per password), D-048 (the store and log doors).
// ROW-231 wrong product: the password kept as typed, or base64 or hex of it, in the accounts row or in a change record;
// ROW-231   an unsalted fast digest (md5, sha1, sha256, sha512 of the password), which reads back by lookup and stores two
// ROW-231   accounts' same password the same way; a request logger that prints the JSON body of sign-in or of a password
// ROW-231   route; a refused sign-in logged with the password tried.
// ROW-231 given: a fresh install (admin password A0). when: the admin signs in with A0, creates M1 with P1; M1 signs in
// ROW-231   and makes the forced change to P2; the admin sets M1 to P3; M1 signs in with P3 and changes to P4; the admin
// ROW-231   changes its own password to A1 and signs in with it; a sign-in to M1 with a fresh wrong password W; the admin
// ROW-231   creates M2 with P4, M1's password. then: no cell of any table of the store, and no log line written since the
// ROW-231   install, holds any of A0, A1, P1..P4, W as typed, base64, base64url, hex, URL-encoded or reversed, nor an
// ROW-231   md5/sha1/sha256/sha512 digest of one (hex or base64); and M1's and M2's account rows share no long text or
// ROW-231   blob value that is not a time and that the admin's row (password A1) does not share too (their one
// ROW-231   password stored differently: salted).
// ROW-231 controls: the control case — the passwords took effect (P4 signs M1 and M2 in, P3 no longer signs M1 in,
// ROW-231   A1 signs the admin in), the store scan reaches the accounts rows of the admin, M1 and M2, and the log door
// ROW-231   answers its lines.
// ROW-231 technique: a property over the whole store and the whole log since the install (the denominator is every
// ROW-231   cell and every line, never the column the password is expected in), fresh passwords so none can be
// ROW-231   hard-coded, and the neighbouring account with the same password as the salt check.
// ROW-231 cases: ROW-231 target=ROW-231.REQ-015.no-password-stored-readable-or-in-a-log-line control=ROW-231.control.passwords-took-effect-and-the-doors-read
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  anonymousApi,
  createMember,
  freshPassword,
  requireOk,
  resetProduct,
  setPassword,
  SetupError,
  signIn,
  type Install,
  type Member,
} from './harness';
import { cellInstants, cellTexts, everyStoredCell, logLinesSince, logMark, storedAccount, type Cell } from './doors-store';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 Pacific/Auckland

/** Every readable form of a password the scan looks for. Hex and digests are compared without letter case. */
function forms(pw: string): string[] {
  const buf = Buffer.from(pw, 'utf8');
  const out = [pw, buf.toString('base64'), buf.toString('base64url'), buf.toString('hex'), encodeURIComponent(pw), [...pw].reverse().join('')];
  for (const alg of ['md5', 'sha1', 'sha256', 'sha512']) {
    const d = createHash(alg).update(pw, 'utf8').digest();
    out.push(d.toString('hex'), d.toString('base64'));
  }
  return [...new Set(out)];
}

function holds(text: string, form: string): boolean {
  return /^[0-9a-f]+$/i.test(form) ? text.toLowerCase().includes(form.toLowerCase()) : text.includes(form);
}

interface World {
  install: Install;
  mark: number;
  passwords: Record<string, string>;
  m1: Member;
  m2: Member;
}

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).ok();
  } finally {
    await api.dispose();
  }
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const mark = await logMark();
  const pw = { A0: install.admin.password, A1: freshPassword(), P1: freshPassword(), P2: freshPassword(), P3: freshPassword(), P4: freshPassword(), W: freshPassword() };
  const admin = await signIn(install.admin);
  try {
    const m1 = await createMember(admin, { password: pw.P1, choosePassword: false });
    let s = await signIn({ email: m1.email, password: pw.P1 });
    await requireOk(await s.api.post('/api/me/password', { data: { current: pw.P1, next: pw.P2 } }), 'POST /api/me/password (M1 forced change)');
    await s.dispose();
    await setPassword(admin, m1.id, pw.P3);
    s = await signIn({ email: m1.email, password: pw.P3 });
    await requireOk(await s.api.post('/api/me/password', { data: { current: pw.P3, next: pw.P4 } }), 'POST /api/me/password (M1 own change)');
    await s.dispose();
    await requireOk(await admin.api.post('/api/me/password', { data: { current: pw.A0, next: pw.A1 } }), 'POST /api/me/password (the admin\'s own change)');
    const again = await signIn({ email: install.admin.email, password: pw.A1 });
    const wrong = await signsIn(m1.email, pw.W);
    if (wrong) throw new SetupError('a wrong password signed M1 in');
    const m2 = await createMember(again, { password: pw.P4, choosePassword: false });
    await again.dispose();
    return { install, mark, passwords: pw, m1: { ...m1, password: pw.P4 }, m2 };
  } finally {
    await admin.dispose();
  }
}

test('ROW-231.control.passwords-took-effect-and-the-doors-read', async () => {
  const w = await world();
  expect.soft(await signsIn(w.m1.email, w.passwords.P4), 'ROW-231 control: P4 signs M1 in').toBe(true);
  expect.soft(await signsIn(w.m1.email, w.passwords.P3), 'ROW-231 control: P3 no longer signs M1 in').toBe(false);
  expect.soft(await signsIn(w.m2.email, w.passwords.P4), 'ROW-231 control: P4 signs M2 in').toBe(true);
  expect.soft(await signsIn(w.install.admin.email, w.passwords.A1), 'ROW-231 control: A1 signs the admin in').toBe(true);
  const cells = await everyStoredCell();
  for (const email of [w.install.admin.email, w.m1.email, w.m2.email]) {
    const acc = await storedAccount(email);
    expect
      .soft(cells.some((c) => c.table === 'accounts' && typeof c.value === 'string' && c.value.trim().toLowerCase() === email), `ROW-231 control: the store scan reaches the accounts row of ${email} (key ${String(acc.key)})`)
      .toBe(true);
  }
  const logs = await logLinesSince(w.mark);
  expect.soft(Array.isArray(logs.lines), 'ROW-231 control: the log door answers the lines since the install').toBe(true);
});

test('ROW-231.REQ-015.no-password-stored-readable-or-in-a-log-line', async () => {
  const w = await world();
  const cells = await everyStoredCell();
  const logs = (await logLinesSince(w.mark)).lines;
  for (const [label, pw] of Object.entries(w.passwords)) {
    const fs = forms(pw);
    const storedAt = cells
      .filter((c) => cellTexts(c.value).some((t) => fs.some((f) => holds(t, f))))
      .map((c) => `${c.table}.${c.column} (row ${c.row})`);
    expect.soft(storedAt, `ROW-231 password ${label} is stored in no readable form`).toEqual([]);
    const loggedIn = logs.filter((l) => fs.some((f) => holds(l, f)));
    expect.soft(loggedIn, `ROW-231 password ${label} appears in no log line`).toEqual([]);
  }
  const r1 = (await storedAccount(w.m1.email)).row;
  const r2 = (await storedAccount(w.m2.email)).row;
  const ra = (await storedAccount(w.install.admin.email)).row;
  const shared = Object.keys(r1).filter((c) => {
    const v: Cell = r1[c];
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return false;
    if (JSON.stringify(v) !== JSON.stringify(r2[c])) return false;
    // A value the admin's row (another password, A1) shares too is no stored form of P4 (e.g. a fixed scheme label).
    if (JSON.stringify(v) === JSON.stringify(ra[c])) return false;
    if (cellInstants(v, w.install.timeZone).length > 0) return false;
    return typeof v === 'object' || String(v).length >= 16;
  });
  expect.soft(shared, 'ROW-231 M1 and M2, holding the same password, store it differently (no shared long text or blob value)').toEqual([]);
});
