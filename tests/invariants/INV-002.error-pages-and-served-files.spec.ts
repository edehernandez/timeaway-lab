// Purpose: ledger tests for ROW-226 (INV-002, REQ-006) and ROW-229 (INV-002, INV-003) — error responses, including server failures and malformed parameters, never show a stack trace, query, file path or any record; no address serves the database file, configuration, environment, backups, source maps or the version-control folder.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); a fresh install with a member and a decoy account made through the product's public routes by harness.ts, fresh per run, so a database with records exists to be leaked.
//
// Boundary (R6): what an address answers is HTTP behaviour, proved at the HTTP harness: every probe's status, headers
// and body are read as a browser or a script would receive them. The leak signatures below are this file's own.
// Slice 1, brief test-author-25 (owner grant A-053): ROW-226's server failures reached through the D-048 fault door
// (doors-store.ts armFault) — each multi-record action made to fail part-way, its failure answer read for a stack, a
// query, a path, the error's own text and any stored record (the whole store read through the store door as the
// denominator). Every earlier case is kept as it was.
import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  actWithToken,
  anonymousApi,
  approve,
  createMember,
  fresh,
  freshPassword,
  readEffect,
  sendRequest,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { disposeAll, freshInt, freshTeam, isRuleRefusal, keep } from './robustness';
import { armFault, everyStoredCell, FAULT_ACTIONS, type FaultAction } from './doors-store';

test.afterEach(disposeAll);

const STACK = /^\s+at\s+\S+|\bat\s+[^\s(]+\s+\([^)]*:\d+:\d+\)|\.(?:ts|js|mjs|cjs|vue):\d+(?::\d+)?\b|"stack"\s*:\s*"[^"]/m;
const PATH = /(?:\/app\/|\/usr\/|\/home\/|\/var\/|\/tmp\/|\/root\/|node_modules|\.output\/|\/server\/(?:api|domain|db|scripts)\/|[A-Z]:\\\\)/;
const QUERY = /\bfrom\s+["'`]?\w+["'`]?\s+(?:where|limit|order by|inner join|left join|join)\b|\binsert\s+into\s+["'`]?\w+|\bupdate\s+["'`]?\w+["'`]?\s+set\b|\bdelete\s+from\b|failed query|SQLITE_|SqliteError|no such (?:table|column)|\bsqlite3?\b|drizzle/i;

interface Probe {
  who: 'member' | 'admin';
  method: 'GET' | 'POST';
  path: string;
  data?: unknown;
  raw?: string;
}

async function send(api: APIRequestContext, p: Probe): Promise<APIResponse> {
  if (p.method === 'GET') return api.get(p.path, { maxRedirects: 0 });
  if (p.raw !== undefined) return api.post(p.path, { headers: { 'content-type': 'application/json' }, data: p.raw, maxRedirects: 0 });
  return api.post(p.path, { data: p.data ?? {}, maxRedirects: 0 });
}

function probes(): Probe[] {
  const miss = fresh('nope');
  return [
    { who: 'member', method: 'GET', path: '/api/calendar?year=abc&month=13' },
    { who: 'member', method: 'GET', path: '/api/calendar?year=2027&month=1e400' },
    { who: 'member', method: 'GET', path: '/api/calendar?year[]=1&month[$gt]=0' },
    { who: 'member', method: 'POST', path: '/api/requests', raw: '{"kind":' },
    { who: 'member', method: 'POST', path: '/api/requests', data: { kind: { $gt: '' }, firstDay: [], lastDay: null } },
    { who: 'member', method: 'POST', path: '/api/requests', data: { kind: 'vacation', firstDay: '2027-02-30', lastDay: '2027-02-31' } },
    { who: 'member', method: 'POST', path: '/api/requests', data: { kind: 'vacation', firstDay: "'; DROP TABLE requests;--", lastDay: 'x'.repeat(100_000) } },
    { who: 'member', method: 'POST', path: '/api/requests/abc/cancel' },
    { who: 'member', method: 'POST', path: '/api/requests/99999999999999999999999/cancel' },
    { who: 'member', method: 'POST', path: "/api/requests/1'%20OR%201%3D1--/cancel" },
    { who: 'member', method: 'POST', path: '/api/me/password', data: { current: 123, next: {} } },
    { who: 'member', method: 'GET', path: '/api/admin/people' },
    { who: 'member', method: 'GET', path: `/api/${miss}` },
    { who: 'member', method: 'GET', path: '/calendar?year=abc&month=99' },
    { who: 'member', method: 'GET', path: '/requests/new?x=%00' },
    { who: 'member', method: 'GET', path: '/admin/pending' },
    { who: 'member', method: 'GET', path: `/${miss}` },
    { who: 'admin', method: 'GET', path: '/api/admin/people/abc/requests' },
    { who: 'admin', method: 'GET', path: '/api/admin/people/-1/history' },
    { who: 'admin', method: 'GET', path: '/api/admin/people/1e999/requests' },
    { who: 'admin', method: 'GET', path: '/api/admin/people/99999999/requests' },
    { who: 'admin', method: 'GET', path: '/api/admin/requests/abc/effect?action=explode' },
    { who: 'admin', method: 'POST', path: '/api/admin/accounts', data: { name: null, email: 123, password: {}, allowance: 'lots' } },
    { who: 'admin', method: 'POST', path: '/api/admin/accounts/abc/allowance', raw: '{"allowance": 1e400, "startsNextYear": "maybe"}' },
    { who: 'admin', method: 'POST', path: '/api/admin/requests/abc/approve', data: { token: 'x' } },
    { who: 'admin', method: 'GET', path: '/admin/people/abc' },
    { who: 'admin', method: 'GET', path: "/admin/people/'" },
  ];
}

// ---------------------------------------------------------------------------------------------------
// ROW-226 promise: the row — error responses, including server failures and malformed parameters, never show a stack
// ROW-226   trace, query, file path or any record; INV-002 (nothing reaches a browser but what is meant for it),
// ROW-226   REQ-006 (a person sees no other person's requests).
// ROW-226 wrong product: the framework's development error page (or a handler that returns err.message/err.stack)
// ROW-226   answering a malformed body with "SyntaxError … at JSON.parse (/app/server/api/requests.post.ts:12:9)", a
// ROW-226   SQLITE_ERROR with the failing SELECT, or a refusal that echoes the record it looked up — another person's
// ROW-226   email in a 403 body.
// ROW-226 given: a fresh install, member M (the prober) and decoy account D, who appears in no probe. when: M and the
// ROW-226   admin send 27 malformed or out-of-range requests (broken JSON, objects for strings, impossible dates,
// ROW-226   SQL-shaped and 100 000-character values, overflowing ids and numbers, unknown routes and pages, a member at
// ROW-226   admin addresses). then: no answer carries a stack frame, a source file and line, a server file path or a
// ROW-226   query; no error answer (4xx, 5xx) carries D's name or email, nor, to M, the admin's email.
// ROW-226 controls: the control case shows the probes reach the product's own handling: a send of kind "holiday"
// ROW-226   is refused by the rule (a 4xx other than 401/404/405) and an unknown /api address answers 404.
// ROW-226 technique: values of the wrong type and beyond every edge at every input the routes take; a neighbouring
// ROW-226   record (D) that no probe concerns, so any appearance of it is a leak.
// ROW-226 cases: ROW-226 target=ROW-226.INV-002.error-answers-carry-no-stack-query-path-or-record control=ROW-226.control.the-probes-reach-the-products-own-handling
async function prober(): Promise<{ admin: Actor; m: Actor; d: Member; adminEmail: string }> {
  const { install, admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const d = await createMember(admin);
  return { admin, m, d, adminEmail: install.admin.email };
}

test('ROW-226.control.the-probes-reach-the-products-own-handling', async () => {
  const { m } = await prober();
  const res = await m.api.post('/api/requests', { data: { kind: 'holiday', firstDay: '2027-03-15', lastDay: '2027-03-15' } });
  expect(isRuleRefusal(res.status()), `ROW-226 control: kind "holiday" is refused by the rule (answered ${res.status()})`).toBe(true);
  expect((await m.api.get(`/api/${fresh('nope')}`)).status(), 'ROW-226 control: an unknown /api address answers 404').toBe(404);
});

test('ROW-226.INV-002.error-answers-carry-no-stack-query-path-or-record', async () => {
  const { admin, m, d, adminEmail } = await prober();
  for (const p of probes()) {
    const res = await send(p.who === 'admin' ? admin.api : m.api, p);
    const body = await res.text().catch(() => '');
    const where = `${p.who} ${p.method} ${p.path.slice(0, 80)} (${res.status()})`;
    expect.soft(STACK.exec(body)?.[0] ?? null, `ROW-226 ${where}: no stack trace`).toBeNull();
    expect.soft(PATH.exec(body)?.[0] ?? null, `ROW-226 ${where}: no file path`).toBeNull();
    expect.soft(QUERY.exec(body)?.[0] ?? null, `ROW-226 ${where}: no query`).toBeNull();
    if (res.status() >= 400) {
      const low = body.toLowerCase();
      expect.soft(low.includes(d.email), `ROW-226 ${where}: no record — D's email`).toBe(false);
      expect.soft(body.includes(d.name), `ROW-226 ${where}: no record — D's name`).toBe(false);
      if (p.who === 'member') expect.soft(low.includes(adminEmail), `ROW-226 ${where}: no record — the admin's email`).toBe(false);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-229 promise: the row — no address serves the database file, configuration, environment, backups, source maps or
// ROW-229   the version-control folder; INV-002 (no team data, kinds included, reaches anyone it is not meant for),
// ROW-229   INV-003 (only the admin runs accounts — a served database gives every hash and record to anyone).
// ROW-229 wrong product: a static server rooted at the project instead of public/, or a SQLite file kept under
// ROW-229   public/; a build that ships .map files or inline source maps; a ../ that the static handler resolves.
// ROW-229 given: a fresh install with the admin and a member M whose fresh email is in the database. when: an anonymous
// ROW-229   visitor asks for 48 well-known addresses of databases, journals, backups, dumps, env files, configs, lock
// ROW-229   files, the build output and .git, plainly and through encoded ../; and for each script and stylesheet the
// ROW-229   sign-in page loads, its SourceMap headers, its sourceMappingURL and its ".map" twin. then: no answer is a
// ROW-229   database (SQLite header), a git file, an env file, a config or manifest, a dump, a build file or a source
// ROW-229   map; no 2xx answer has a database or SQL content type; no answer carries M's email; no asset names or
// ROW-229   embeds a map that is served.
// ROW-229 controls: the control case shows /sign-in answering 200 and loading at least one script from the product
// ROW-229   — the asset probes reach real files.
// ROW-229 technique: content signatures, not statuses alone (a 200 fallback page is fine, the file's bytes are not);
// ROW-229   the member's fresh email as a canary any database or dump would carry.
// ROW-229 cases: ROW-229 target=ROW-229.INV-002.no-address-serves-database-config-env-backup-map-or-git control=ROW-229.control.the-sign-in-page-loads-its-scripts
const FILES = [
  '/.env', '/.env.local', '/.env.production', '/.env.test', '/.git/HEAD', '/.git/config', '/.git/index', '/.gitignore',
  '/data.db', '/db.sqlite', '/database.sqlite', '/sqlite.db', '/timeaway.db', '/timeaway.sqlite', '/data/timeaway.db',
  '/data/db.sqlite', '/server/db/timeaway.db', '/app.db', '/.data/db.sqlite', '/.data/timeaway.db', '/backup.db',
  '/timeaway.db.bak', '/db.sqlite.bak', '/timeaway.db-journal', '/timeaway.db-wal', '/backup.sql', '/dump.sql', '/backups/',
  '/nuxt.config.ts', '/drizzle.config.ts', '/package.json', '/pnpm-lock.yaml', '/tsconfig.json', '/docker-compose.yml',
  '/docker-compose.test.yml', '/Dockerfile', '/.npmrc', '/.output/server/index.mjs', '/.output/nitro.json', '/.nuxt/nuxt.d.ts',
  '/server/db/schema.ts', '/config.json', '/_nuxt/%2e%2e/.env', '/%2e%2e/.env', '/..%2f.env', '/_nuxt/%2e%2e/%2e%2e/package.json',
  '/public/%2e%2e/.env', '/.vid/budget',
];
const SIGNATURES: [string, RegExp][] = [
  ['a SQLite database', /^SQLite format 3/],
  ['a git file', /^ref: refs\/|\[core\]|repositoryformatversion|^DIRC/m],
  ['an env file', /^\s*[A-Z][A-Z0-9_]{2,}=\S*/m],
  ['a config or manifest', /defineNuxtConfig|defineConfig\s*\(|"(dev)?[dD]ependencies"\s*:|lockfileVersion|"compilerOptions"\s*:|^services:\s*$|^FROM\s+\S+/m],
  ['a SQL dump', /\bCREATE TABLE\b|\bINSERT INTO\b/i],
  ['a build file', /\bimport\s*\{[^}]*\}\s*from\s*['"]node:|"preset"\s*:|_importMeta_/],
  ['a source map', /"mappings"\s*:\s*"|"sourcesContent"\s*:/],
];
const DATA_TYPES = /application\/(octet-stream|x-sqlite3|vnd\.sqlite3|sql|x-sql)|text\/(x-)?sql/;

function leakOf(body: string): string | null {
  for (const [what, re] of SIGNATURES) if (re.test(body)) return what;
  return null;
}

async function assets(api: APIRequestContext): Promise<string[]> {
  const html = await (await api.get('/sign-in')).text();
  const found = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) found.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.(?:js|mjs|css))"/g)) found.add(m[1]);
  return [...found].filter((u) => u.startsWith('/') && !u.startsWith('//'));
}

test('ROW-229.control.the-sign-in-page-loads-its-scripts', async () => {
  await freshTeam();
  const api = await anonymousApi();
  try {
    expect((await api.get('/sign-in')).status(), 'ROW-229 control: /sign-in answers 200').toBe(200);
    expect((await assets(api)).length, 'ROW-229 control: the page loads at least one script or stylesheet from the product').toBeGreaterThan(0);
  } finally {
    await api.dispose();
  }
});

test('ROW-229.INV-002.no-address-serves-database-config-env-backup-map-or-git', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const api = await anonymousApi();
  try {
    for (const path of FILES) {
      const res = await api.get(path, { maxRedirects: 0 });
      const body = await res.text().catch(() => '');
      const type = res.headers()['content-type'] ?? '';
      expect.soft(leakOf(body), `ROW-229 GET ${path} (${res.status()}): serves no file`).toBeNull();
      expect.soft(body.toLowerCase().includes(m.email), `ROW-229 GET ${path}: carries no record`).toBe(false);
      if (res.ok()) expect.soft(DATA_TYPES.test(type), `ROW-229 GET ${path}: no data file content type (${type})`).toBe(false);
    }
    for (const asset of await assets(api)) {
      const res = await api.get(asset);
      const body = await res.text().catch(() => '');
      const h = res.headers();
      expect.soft(h['sourcemap'] ?? h['x-sourcemap'] ?? null, `ROW-229 ${asset}: names no source map in its headers`).toBeNull();
      expect.soft(/sourceMappingURL=data:/.test(body), `ROW-229 ${asset}: embeds no source map`).toBe(false);
      const named = /sourceMappingURL=([^\s*]+)/.exec(body)?.[1];
      const twins = [`${asset}.map`, ...(named ? [new URL(named, `http://x${asset}`).pathname] : [])];
      for (const twin of twins) {
        const map = await api.get(twin, { maxRedirects: 0 });
        expect.soft(leakOf(await map.text().catch(() => '')), `ROW-229 GET ${twin}: serves no source map`).toBeNull();
      }
    }
  } finally {
    await api.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-226 — server failures, reached through the fault door (added, slice 1, brief test-author-25)
// ---------------------------------------------------------------------------------------------------
// ROW-226 promise: the row — error responses, INCLUDING SERVER FAILURES, never show a stack trace, query, file path or
// ROW-226   any record; INV-002 (nothing reaches a browser but what is meant for it), REQ-006 (no other person's
// ROW-226   requests). D-048/D-049: POST /api/__test/fault {at:"<action>:after-first-write"} makes the next such action
// ROW-226   fail after its first write, before it commits — a real server failure inside a write transaction.
// ROW-226 wrong product: a route whose catch answers createError({ statusCode: 500, message: err.message }) or sends
// ROW-226   err.stack — the injected failure's own text ("… approve:after-first-write"), an SqliteError ("SQLITE_ERROR:
// ROW-226   cannot commit — no transaction is active", "UPDATE requests SET …"), a frame "at faultPoint
// ROW-226   (/app/.output/server/chunks/…mjs:12:9)" — or one that answers the failure with the record it was writing
// ROW-226   (the account row with its email and password hash, the request row with its columns), or the new password
// ROW-226   the body carried. None of the 27 malformed probes above reaches a 5xx, so they never see this.
// ROW-226 given: today Mon 2027-03-08 in Pacific/Auckland; member M (signed in) with two pending vacations and an
// ROW-226   approved sick range 3..12 March (days before and after today); member Q; member O (signed in) with a pending
// ROW-226   vacation; decoy D, whom no action concerns. when: for each of the fault door's seven actions — approve,
// ROW-226   reject, partial cancel, own password change, password set, allowance change, switch off — its first step is
// ROW-226   read where it has one, the fault is armed on it, and the action is sent through its public route. then: the
// ROW-226   answer is a failure (non-2xx: the fault was reached); its body and headers carry no stack frame, no source
// ROW-226   file and line, no server path, no query or SQLite error text, not the fault's own name nor the words of an
// ROW-226   injected fault, no stored-record keys (column names), no email of any account, not D's name, not the
// ROW-226   passwords or the token the body carried, and no stored string value of the store at all (every cell of
// ROW-226   every table holding a digit, an @ or a $ and at least 12 characters — hashes, emails, instants, session
// ROW-226   hashes — display names and a value the asked address itself carries aside).
// ROW-226 controls: ROW-226.control.an-armed-action-fails-and-the-same-action-unarmed-succeeds — the fault door is
// ROW-226   reached (an armed approve answers a failure) and the action itself is sound (the same approve, unarmed,
// ROW-226   succeeds), so the target's failure answers are the injected failure's, untouched by what they carry.
// ROW-226 technique: every action the fault door names (FAULT_ACTIONS is the denominator, checked against the seven
// ROW-226   driven here); the whole store as the record canary; the body's own secrets (new password, token) and the
// ROW-226   neighbour D as decoys that must not appear.
// ROW-226 cases: ROW-226 target=ROW-226.INV-002.server-failures-at-every-action-carry-no-stack-query-path-or-record control=ROW-226.control.an-armed-action-fails-and-the-same-action-unarmed-succeeds

/** Column-like keys of a stored record, as a failure answer that dumps a row would carry them. */
const RECORD_KEYS = /"(?:email|password|password_hash|pass_hash|hash|salt|first_day|last_day|account_id|person_id|decided_by|decided_at|cancel_from|cancelled_by|cancelled_at|from_value|to_value|starts_year|token_hash|session_hash|created_at|updated_at)"\s*:/i;
/** The words of an injected fault, as its own error text would carry them. */
const FAULT_TEXT = /after-first-write|faultPoint|\bfault(?:s|ed)?\b|\binjected\b|\barmed\b/i;

interface FaultWorld {
  admin: Actor;
  m: Member;
  mA: Actor;
  q: Member;
  o: Member;
  d: Member;
  adminEmail: string;
  p1: AccountId;
  p2: AccountId;
  sick: AccountId;
}

async function faultWorld(): Promise<FaultWorld> {
  const { install, admin } = await freshTeam();
  const m = await createMember(admin);
  const mA = keep(await signInMember(m));
  const q = await createMember(admin);
  const o = await createMember(admin);
  const oA = keep(await signInMember(o));
  const d = await createMember(admin);
  const p1 = await sendRequest(mA, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
  const p2 = await sendRequest(mA, { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' });
  const sick = await sendRequest(mA, { kind: 'sick', firstDay: '2027-03-03', lastDay: '2027-03-12' });
  await approve(admin, sick);
  await sendRequest(oA, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-04' });
  return { admin, m, mA, q, o, d, adminEmail: install.admin.email, p1, p2, sick };
}

interface Step {
  action: FaultAction;
  /** Reads what the act needs (a token), and answers the act itself and the secrets its body carries. */
  prepare: () => Promise<{ act: () => Promise<APIResponse>; secrets: string[] }>;
}

function steps(w: FaultWorld): Step[] {
  const confirmed = (action: 'approve' | 'reject' | 'cancel' | 'switch-off', id: AccountId) => async () => {
    const e = await readEffect(w.admin, action, id);
    return { act: () => actWithToken(w.admin, action, id, e.token), secrets: [e.token] };
  };
  const route = (id: AccountId, what: string) => `/api/admin/accounts/${encodeURIComponent(String(id))}/${what}`;
  return [
    { action: 'approve', prepare: confirmed('approve', w.p1) },
    { action: 'reject', prepare: confirmed('reject', w.p2) },
    { action: 'partial-cancel', prepare: confirmed('cancel', w.sick) },
    {
      action: 'password-change',
      prepare: async () => {
        const next = freshPassword();
        return { act: () => w.mA.api.post('/api/me/password', { data: { current: w.m.password, next } }), secrets: [w.m.password, next] };
      },
    },
    {
      action: 'password-set',
      prepare: async () => {
        const password = freshPassword();
        return { act: () => w.admin.api.post(route(w.q.id, 'password'), { data: { password } }), secrets: [password] };
      },
    },
    {
      action: 'allowance-change',
      prepare: async () => ({ act: () => w.admin.api.post(route(w.q.id, 'allowance'), { data: { allowance: freshInt(31, 59), startsNextYear: false } }), secrets: [] }),
    },
    { action: 'switch-off', prepare: confirmed('switch-off', w.o.id) },
  ];
}

/** Every stored string value a failure answer must never carry: a digit, an @ or a $, at least 12 characters, display names aside. */
async function storedSecrets(names: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const c of await everyStoredCell()) {
    if (typeof c.value !== 'string') continue;
    const v = c.value.trim();
    if (v.length >= 12 && /[\d@$]/.test(v) && !names.includes(v)) out.add(v);
  }
  return [...out];
}

test('ROW-226.control.an-armed-action-fails-and-the-same-action-unarmed-succeeds', async () => {
  const w = await faultWorld();
  const e = await readEffect(w.admin, 'approve', w.p1);
  await armFault('approve');
  const failed = await actWithToken(w.admin, 'approve', w.p1, e.token);
  expect(failed.ok(), `ROW-226 control: the armed approve answers a failure (answered ${failed.status()})`).toBe(false);
  await approve(w.admin, w.p1);
});

test('ROW-226.INV-002.server-failures-at-every-action-carry-no-stack-query-path-or-record', async () => {
  test.setTimeout(300_000);
  const w = await faultWorld();
  const all = steps(w);
  expect([...all.map((x) => x.action)].sort(), "ROW-226: every action the fault door names is driven").toEqual([...FAULT_ACTIONS].sort());
  const people = [w.m, w.q, w.o, w.d];
  const names = [w.admin.me.name, ...people.map((p) => p.name)];
  const emails = [w.adminEmail, ...people.map((p) => p.email)].map((x) => x.toLowerCase());
  const stored = await storedSecrets(names);
  expect(stored.length, 'ROW-226: the store holds values to leak (emails, hashes, instants)').toBeGreaterThan(0);
  for (const step of all) {
    const { act, secrets } = await step.prepare();
    const at = await armFault(step.action);
    const res = await act();
    const body = await res.text().catch(() => '');
    const heads = res.headersArray().map((h) => `${h.name}: ${h.value}`).join('\n');
    const text = `${heads}\n${body}`;
    const low = text.toLowerCase();
    const where = `${step.action} under the fault ${at} (${res.status()})`;
    expect.soft(res.ok(), `ROW-226 ${where}: the armed fault was reached — the action answers a failure`).toBe(false);
    expect.soft(STACK.exec(text)?.[0] ?? null, `ROW-226 ${where}: no stack trace`).toBeNull();
    expect.soft(PATH.exec(text)?.[0] ?? null, `ROW-226 ${where}: no file path`).toBeNull();
    expect.soft(QUERY.exec(text)?.[0] ?? null, `ROW-226 ${where}: no query or SQLite error text`).toBeNull();
    expect.soft(low.includes(at.toLowerCase()) ? at : FAULT_TEXT.exec(text)?.[0] ?? null, `ROW-226 ${where}: not the injected failure's own text (err.message)`).toBeNull();
    expect.soft(RECORD_KEYS.exec(body)?.[0] ?? null, `ROW-226 ${where}: no stored record's keys`).toBeNull();
    expect.soft(emails.filter((x) => low.includes(x)), `ROW-226 ${where}: no account's email`).toEqual([]);
    expect.soft(text.includes(w.d.name), `ROW-226 ${where}: not D's name`).toBe(false);
    expect.soft(secrets.filter((x) => text.includes(x)), `ROW-226 ${where}: not the password or token its body carried`).toEqual([]);
    // A stored value that is also in the address asked (an opaque id in the route) is the caller's own, not a leak.
    const asked = decodeURIComponent(res.url());
    expect.soft(stored.filter((x) => text.includes(x) && !asked.includes(x)).slice(0, 3), `ROW-226 ${where}: no stored value of the store`).toEqual([]);
  }
});
