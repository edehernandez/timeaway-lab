// Purpose: ledger tests for ROW-226 (INV-002, REQ-006) and ROW-229 (INV-002, INV-003) — error responses, including server failures and malformed parameters, never show a stack trace, query, file path or any record; no address serves the database file, configuration, environment, backups, source maps or the version-control folder.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); a fresh install with a member and a decoy account made through the product's public routes by harness.ts, fresh per run, so a database with records exists to be leaked.
//
// Boundary (R6): what an address answers is HTTP behaviour, proved at the HTTP harness: every probe's status, headers
// and body are read as a browser or a script would receive them. The leak signatures below are this file's own.
import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { anonymousApi, createMember, fresh, signInMember, type Actor, type Member } from './harness';
import { disposeAll, freshTeam, isRuleRefusal, keep } from './robustness';

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
