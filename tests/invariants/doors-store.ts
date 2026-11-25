// Purpose: shared door helpers for the store, log and fault doors of D-048 — runs a statement on the store past the product's routes, reads the product's own log lines, arms a fault in the next multi-record action, and reads stored rows into plain shapes; it drives the doors and asserts nothing.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17), from DECISIONS.md D-048 (the doors), D-043 (account_events and its from_value, to_value, starts_year), D-040 (decided_at, decided_by, cancel_from) and ARCHITECTURE.md's owned tables (accounts, account_events, requests, sessions).
//
// Rules this module keeps, as harness.ts does: it reaches the product ONLY over HTTP at VID_PRODUCT_URL (through
// harness.ts), never opens the database file, never imports application code and never reads source files. Anything a
// door does not answer as its contract says throws a SetupError ("SETUP: …") naming the door and the status, so a door
// that is not there yet reads as setup, never as a row failing.
//
// The doors, as D-048 names them and as this module reads them where D-048 elides the shape:
//   - POST /api/__test/store {sql, params} → 2xx {rows, changes, error}: one statement on the store. `rows` is the
//     statement's result rows as objects keyed by column name; `changes` the rows it changed; `error` null, or the
//     store's refusal as text. A refusal is a 2xx answer carrying `error`; any non-2xx answer is a SETUP failure (a
//     404 is the door not being there), never read as a refusal.
//   - GET /api/__test/logs?since=<n> → 2xx: the server's own output lines captured since line n, read as a JSON array
//     of strings, or an object {lines: string[], next?: number}; the next mark is `next` when given, else n + lines.
//   - POST /api/__test/fault {at} → 2xx: the next multi-record action named by `at` fails at that step. D-048 does not
//     list the steps; this module's reading is `at` = "<action>:after-first-write" — the next <action> fails after its
//     first record write and before it completes (before its write transaction commits) — with <action> one of
//     FAULT_ACTIONS. A product whose door names its steps otherwise answers non-2xx, a SETUP failure naming the step.
import { createHash } from 'node:crypto';
import { anonymousApi, requireOk, SetupError } from './harness';

// ---------------------------------------------------------------------------------------------------
// The store door
// ---------------------------------------------------------------------------------------------------

/** A stored value as the store door answers it (a BLOB may come as {type:'Buffer', data:[…]} or as text). */
export type Cell = null | boolean | number | string | { [k: string]: unknown } | unknown[];
export type Row = Record<string, Cell>;

/** The store door's answer to one statement. */
export interface StoreAnswer {
  rows: Row[];
  changes: number;
  error: string | null;
}

/** Runs one statement on the store past the product's routes: POST /api/__test/store {sql, params}. A refusal comes back in `error`. */
export async function storeRun(sql: string, params: unknown[] = []): Promise<StoreAnswer> {
  const api = await anonymousApi();
  try {
    const res = await api.post('/api/__test/store', { data: { sql, params } });
    await requireOk(res, `POST /api/__test/store (${sql.slice(0, 80)})`);
    let body: { rows?: unknown; changes?: unknown; error?: unknown };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new SetupError('POST /api/__test/store answered without a JSON body');
    }
    if (body === null || typeof body !== 'object') throw new SetupError('POST /api/__test/store answered no object');
    const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : [];
    const changes = typeof body.changes === 'number' ? body.changes : 0;
    const error = body.error === null || body.error === undefined || body.error === false ? null : String(body.error);
    return { rows, changes, error };
  } finally {
    await api.dispose();
  }
}

/** Runs a reading statement and returns its rows; a refusal of a READ is a SETUP failure naming the statement. */
export async function storeRead(sql: string, params: unknown[] = []): Promise<Row[]> {
  const a = await storeRun(sql, params);
  if (a.error !== null) throw new SetupError(`the store door refused the read "${sql.slice(0, 120)}": ${a.error}`);
  return a.rows;
}

/** Quotes an identifier for SQLite. */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The store's own tables (sqlite_* internals left out). */
export async function storeTables(): Promise<string[]> {
  const rows = await storeRead("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rows.map((r) => String(r.name));
}

/** One column as PRAGMA table_info answers it. */
export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: number;
}

/** A table's columns (PRAGMA table_info). Throws a SetupError when the table has none (it does not exist). */
export async function tableColumns(table: string): Promise<ColumnInfo[]> {
  const rows = await storeRead(`PRAGMA table_info(${ident(table)})`);
  if (rows.length === 0) throw new SetupError(`the store holds no table "${table}"`);
  return rows.map((r) => ({ name: String(r.name), type: String(r.type ?? ''), notnull: Number(r.notnull) === 1, pk: Number(r.pk ?? 0) }));
}

/** The single primary-key column of a table. Throws a SetupError when it has none or several. */
export async function keyColumn(table: string): Promise<string> {
  const pk = (await tableColumns(table)).filter((c) => c.pk > 0);
  if (pk.length !== 1) throw new SetupError(`table "${table}" has ${pk.length} primary-key columns; one is needed to name a row`);
  return pk[0].name;
}

/** Every row of a table. */
export async function tableRows(table: string): Promise<Row[]> {
  return storeRead(`SELECT * FROM ${ident(table)}`);
}

/** Two stored values are the same value (ids compared as text, so 7 and "7" agree). */
export function sameCell(a: Cell | undefined, b: Cell | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

/** A stored account: the accounts table's key column, this account's key, and its whole row. */
export interface StoredAccount {
  keyColumn: string;
  key: Cell;
  row: Row;
  /** The columns whose value is this account's email (compared without letter case or surrounding spaces). */
  emailColumns: string[];
}

/**
 * Finds an account's stored row by its email: the row of `accounts` holding `email` (any letter case, spaces trimmed)
 * in some text column. Throws a SetupError when no row or more than one holds it.
 */
export async function storedAccount(email: string): Promise<StoredAccount> {
  const key = await keyColumn('accounts');
  const want = email.trim().toLowerCase();
  const hits: { row: Row; cols: string[] }[] = [];
  for (const row of await tableRows('accounts')) {
    const cols = Object.keys(row).filter((c) => typeof row[c] === 'string' && (row[c] as string).trim().toLowerCase() === want);
    if (cols.length > 0) hits.push({ row, cols });
  }
  if (hits.length !== 1) throw new SetupError(`the accounts table holds ${hits.length} rows with the email ${email}; one was expected`);
  return { keyColumn: key, key: hits[0].row[key], row: hits[0].row, emailColumns: hits[0].cols };
}

/** One stored row as text, its columns in name order, so two snapshots compare as strings. */
function rowText(row: Row): string {
  return JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]));
}

/** A snapshot of the whole store: per table, its rows as sorted text. */
export type Snapshot = Map<string, string[]>;

/**
 * Snapshots every table of the store. For a table named in `keysOnly` only its primary-key values are kept (a table
 * whose other columns may move on a read, e.g. sessions, is compared by which rows exist).
 */
export async function storeSnapshot(opts: { keysOnly?: string[] } = {}): Promise<Snapshot> {
  const snap: Snapshot = new Map();
  for (const t of await storeTables()) {
    const rows = await tableRows(t);
    if (opts.keysOnly?.includes(t)) {
      const pk = (await tableColumns(t)).filter((c) => c.pk > 0).map((c) => c.name);
      snap.set(t, rows.map((r) => rowText(Object.fromEntries((pk.length ? pk : Object.keys(r)).map((k) => [k, r[k]])))).sort());
    } else {
      snap.set(t, rows.map(rowText).sort());
    }
  }
  return snap;
}

/** The differences between two snapshots, one line per table that differs (rows only before / only after, at most 3 each). */
export function snapshotDiff(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  for (const t of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(t) ?? [];
    const a = after.get(t) ?? [];
    const onlyB = b.filter((x) => !a.includes(x));
    const onlyA = a.filter((x) => !b.includes(x));
    if (onlyB.length || onlyA.length || b.length !== a.length) {
      out.push(`${t}: ${b.length} → ${a.length} rows; gone ${JSON.stringify(onlyB.slice(0, 3))}; new ${JSON.stringify(onlyA.slice(0, 3))}`);
    }
  }
  return out;
}

/** The rows of `table` now that were not there in `before` (each row as a whole: a row changed in place counts as new). */
export async function newRowsSince(table: string, before: Row[]): Promise<Row[]> {
  const seen = new Map<string, number>();
  for (const r of before) seen.set(rowText(r), (seen.get(rowText(r)) ?? 0) + 1);
  const out: Row[] = [];
  for (const r of await tableRows(table)) {
    const k = rowText(r);
    const n = seen.get(k) ?? 0;
    if (n > 0) seen.set(k, n - 1);
    else out.push(r);
  }
  return out;
}

/** The text forms a stored cell can be read in: a string as it is; a BLOB as its UTF-8 text, hex and base64; a number as digits. */
export function cellTexts(v: Cell | undefined): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return [v];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  const data = Array.isArray(v) ? v : (v as { data?: unknown }).data;
  if (Array.isArray(data) && data.every((x) => typeof x === 'number')) {
    const buf = Buffer.from(data as number[]);
    return [buf.toString('utf8'), buf.toString('hex'), buf.toString('base64'), JSON.stringify(v)];
  }
  return [JSON.stringify(v)];
}

/** Every cell of every table, with where it is: the denominator of a scan of the whole store. */
export async function everyStoredCell(): Promise<{ table: string; column: string; row: number; value: Cell }[]> {
  const out: { table: string; column: string; row: number; value: Cell }[] = [];
  for (const t of await storeTables()) {
    const rows = await tableRows(t);
    rows.forEach((r, i) => {
      for (const c of Object.keys(r)) out.push({ table: t, column: c, row: i, value: r[c] });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Reading a stored time
// ---------------------------------------------------------------------------------------------------

function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instants (epoch ms) a stored value can mean: a number as epoch milliseconds or seconds; a date-time text with a
 * zone as that instant; a date-time text without one both as UTC and as the team zone's wall time. [] when it is no time.
 */
export function cellInstants(v: Cell | undefined, timeZone: string): number[] {
  if (typeof v === 'number') {
    if (v > 1e11) return [v];
    if (v > 1e8) return [v * 1000];
    return [];
  }
  if (typeof v !== 'string') return [];
  const s = v.trim();
  if (/^\d{10,13}$/.test(s)) return cellInstants(Number(s), timeZone);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return [];
  const iso = s.replace(' ', 'T');
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? [] : [t];
  }
  const asUtc = Date.parse(`${iso}Z`);
  if (Number.isNaN(asUtc)) return [];
  return [asUtc, asUtc - zoneOffsetMs(asUtc, timeZone)];
}

// ---------------------------------------------------------------------------------------------------
// The log door
// ---------------------------------------------------------------------------------------------------

/** The server's own output lines since mark `since`, and the mark after them: GET /api/__test/logs?since=<n>. */
export async function logLinesSince(since: number): Promise<{ lines: string[]; next: number }> {
  const api = await anonymousApi();
  try {
    const route = `/api/__test/logs?since=${since}`;
    const res = await requireOk(await api.get(route), `GET ${route}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SetupError(`GET ${route} answered without a JSON body`);
    }
    const raw = Array.isArray(body) ? body : (body as { lines?: unknown })?.lines;
    if (!Array.isArray(raw)) throw new SetupError(`GET ${route} answered no list of lines`);
    const lines = raw.map((l) => (typeof l === 'string' ? l : JSON.stringify(l)));
    const n = (body as { next?: unknown })?.next;
    return { lines, next: typeof n === 'number' ? n : since + lines.length };
  } finally {
    await api.dispose();
  }
}

/** The log mark now: lines captured after this call are read with logLinesSince(mark). */
export async function logMark(): Promise<number> {
  return (await logLinesSince(0)).next;
}

// ---------------------------------------------------------------------------------------------------
// The fault door
// ---------------------------------------------------------------------------------------------------

/** The multi-record actions the fault door is armed for (ROW-199's list), as this module names them. */
export const FAULT_ACTIONS = ['switch-off', 'partial-cancel', 'password-set', 'password-change', 'allowance-change', 'approve', 'reject'] as const;
export type FaultAction = (typeof FAULT_ACTIONS)[number];

/** Arms the fault door: the next `action` fails after its first record write, before it completes. POST /api/__test/fault {at}. */
export async function armFault(action: FaultAction): Promise<string> {
  const at = `${action}:after-first-write`;
  const api = await anonymousApi();
  try {
    await requireOk(await api.post('/api/__test/fault', { data: { at } }), `POST /api/__test/fault {at:"${at}"}`);
  } finally {
    await api.dispose();
  }
  return at;
}

// ---------------------------------------------------------------------------------------------------
// Session rows (added by the test-author pass, slice 1, brief test-author-21, for HOS-008 and HOS-009)
// ---------------------------------------------------------------------------------------------------
//
// D-003: sessions are server-side rows (ARCHITECTURE.md names the accounts module's `sessions` table); D-032: the
// server stores only the SHA-256 of the session identifier the cookie carries. These readings find a session's row
// by that hash, and an account's session rows by the column of `sessions` that refers to `accounts`.

/**
 * The column of `sessions` that names the account a session belongs to: the column a foreign key of `sessions` points
 * from into `accounts`; failing a declared one, the single column whose name says account, user, person, member or
 * owner. Throws a SetupError when neither reading finds exactly one.
 */
export async function sessionAccountColumn(): Promise<string> {
  const columns = await tableColumns('sessions');
  const fks = (await storeRead(`PRAGMA foreign_key_list(${ident('sessions')})`))
    .filter((r) => String(r.table).toLowerCase() === 'accounts')
    .map((r) => String(r.from));
  const declared = [...new Set(fks)];
  if (declared.length === 1) return declared[0];
  const named = columns.map((c) => c.name).filter((n) => /account|user|person|member|owner/i.test(n));
  if (declared.length === 0 && named.length === 1) return named[0];
  throw new SetupError(
    `the sessions table's account column could not be read: foreign keys into accounts from ${JSON.stringify(declared)}, account-named columns ${JSON.stringify(named)}`,
  );
}

/** Every stored session row of the account whose stored key is `accountKey` (compared as text). */
export async function sessionRowsOfAccount(accountKey: Cell): Promise<Row[]> {
  const col = await sessionAccountColumn();
  return (await tableRows('sessions')).filter((r) => sameCell(r[col], accountKey));
}

/** The text forms the SHA-256 of a session identifier can be stored in: hex (either case), base64, base64url. */
export function identifierHashForms(identifier: string): string[] {
  const forms = new Set<string>();
  const values = new Set([identifier]);
  try {
    values.add(decodeURIComponent(identifier));
  } catch {
    /* not URI-encoded */
  }
  for (const v of values) {
    const h = createHash('sha256').update(v).digest();
    forms.add(h.toString('hex'));
    forms.add(h.toString('hex').toUpperCase());
    forms.add(h.toString('base64'));
    forms.add(h.toString('base64').replace(/=+$/, ''));
    forms.add(h.toString('base64url'));
  }
  return [...forms];
}

/** The stored session rows holding, in any column, the SHA-256 of `identifier` (a session cookie's value, D-032). */
export async function sessionRowsHoldingHashOf(identifier: string): Promise<Row[]> {
  const forms = identifierHashForms(identifier);
  return (await tableRows('sessions')).filter((r) => Object.values(r).some((v) => cellTexts(v).some((t) => forms.includes(t))));
}
