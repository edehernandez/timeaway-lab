// Purpose: shared doors for the hostility probes (HOS-006 to HOS-013) — the server's routes read from the route folder's file names, D-029's routes as the census floor, a session cookie read from an actor and replayed (or forged) on a fresh client, a page load that keeps every same-origin answer it received, and one submission of the sign-in page's form read back as the session it left.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15), from DECISIONS.md D-029 (the routes), D-032 (the session cookie) and D-035 (every route checks the session first); a public harness boundary beside harness.ts, imported by ledger tests only. It reads the NAMES of the files under server/api and server/routes (Nitro's file-route convention), never their contents, and no other application file; it asserts nothing about any row.
//
// Readings, stated once:
//   - a ROUTE is one code file under server/api (prefix /api) or server/routes (prefix none): its path segments are
//     the directories and the file's stem ([id] -> :id, [...x] -> **, a trailing "index" dropped), its method the
//     ".get"/".post"/... suffix, or null when the file names none (it answers every method);
//   - a route's CONCRETE ADDRESS fills each :param with a request id when the segment before it says "request",
//     else with an account id; ** becomes "x";
//   - a SESSION COOKIE is every cookie the actor's API context holds for the product's host, sent back as one
//     Cookie header; a REPLAY sends that header on a fresh client that holds no cookie jar of its own, one request
//     per client, so a Set-Cookie on one answer never changes what the next request carries;
//   - a SIGN-IN FORM SUBMISSION is the sign-in page's fields labelled "Email" and "Password" filled and its button
//     "Sign in" pressed (D-029's plain-word labels, the harness door's reading), the submission's same-origin POST
//     awaited, the network settled, and then GET /api/me asked on the page's own cookies.
import { request as playwrightRequest, type APIResponse, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { productUrl, SetupError, type AccountId, type Actor } from './harness';

// The mounted tree's root (docker-compose.test.yml mounts it read-only at /app, the working directory).
const ROOT = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', '..') : process.cwd();

// ---------------------------------------------------------------------------------------------------
// The route census
// ---------------------------------------------------------------------------------------------------

export interface CensusRoute {
  /** The method the file declares, or null when it declares none (it answers every method). */
  method: string | null;
  /** The route's path pattern, e.g. /api/admin/accounts/:id/switch; '**' for a catch-all segment. */
  pattern: string;
  /** The file it was read from, relative to the tree's root. */
  file: string;
}

const METHOD = /^(.*)\.(get|post|put|patch|delete|head|options)$/i;
const CODE = /\.(ts|js|mjs|cjs|mts|cts)$/;

function segment(name: string): string {
  if (/^\[\.\.\.[^\]]*\]$/.test(name)) return '**';
  return name.replace(/\[\[?([^\]]+?)\]?\]/g, ':$1');
}

function walk(abs: string, url: string, rel: string, out: CensusRoute[]): void {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const childAbs = path.join(abs, e.name);
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (/^\(.*\)$/.test(e.name)) walk(childAbs, url, childRel, out);
      else walk(childAbs, `${url}/${segment(e.name)}`, childRel, out);
      continue;
    }
    if (!e.isFile() || !CODE.test(e.name) || e.name.endsWith('.d.ts')) continue;
    const base = e.name.replace(CODE, '');
    const m = base.match(METHOD);
    const stem = m ? m[1] : base;
    const pattern = stem === 'index' ? url || '/' : `${url}/${segment(stem)}`;
    out.push({ method: m ? m[2].toUpperCase() : null, pattern, file: childRel });
  }
}

/** Every route the server's route folders declare, read from their file names (see the header). */
export function routeCensus(): CensusRoute[] {
  const out: CensusRoute[] = [];
  for (const [dir, prefix] of [
    ['server/api', '/api'],
    ['server/routes', ''],
  ] as const) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs, prefix, dir, out);
  }
  return out;
}

/** The methods a probe sends to a route: the one it declares, or GET and POST when it declares none. */
export function methodsOf(route: CensusRoute): string[] {
  return route.method === null ? ['GET', 'POST'] : [route.method];
}

/** True when `route` answers `method` at the concrete address `concrete` (an :param matches one segment). */
export function routeMatches(route: CensusRoute, method: string, concrete: string): boolean {
  if (route.method !== null && route.method !== method) return false;
  const re = new RegExp(
    '^' +
      route.pattern
        .split('/')
        .map((s) => (s === '**' ? '.*' : s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/') +
      '/?$',
  );
  return re.test(concrete);
}

/** D-029's routes outside the control door and the readiness route — the floor every census must hold. */
export const D029_ROUTES: readonly [string, string][] = [
  ['POST', '/api/auth/sign-in'],
  ['POST', '/api/auth/sign-out'],
  ['GET', '/api/me'],
  ['POST', '/api/me/password'],
  ['GET', '/api/requests'],
  ['POST', '/api/requests'],
  ['POST', '/api/requests/:id/cancel'],
  ['GET', '/api/balance'],
  ['GET', '/api/calendar'],
  ['GET', '/api/admin/pending'],
  ['GET', '/api/admin/people'],
  ['GET', '/api/admin/people/:id/requests'],
  ['GET', '/api/admin/people/:id/history'],
  ['POST', '/api/admin/accounts'],
  ['POST', '/api/admin/accounts/:id/name'],
  ['POST', '/api/admin/accounts/:id/email'],
  ['POST', '/api/admin/accounts/:id/password'],
  ['POST', '/api/admin/accounts/:id/allowance'],
  ['POST', '/api/admin/accounts/:id/switch'],
  ['GET', '/api/admin/accounts/:id/effect'],
  ['GET', '/api/admin/requests/:id/effect'],
  ['POST', '/api/admin/requests/:id/approve'],
  ['POST', '/api/admin/requests/:id/reject'],
  ['POST', '/api/admin/requests/:id/cancel'],
];

/** The D-029 routes (as "METHOD /pattern") that no census route answers; empty when the census holds the floor. */
export function floorMissing(routes: CensusRoute[]): string[] {
  return D029_ROUTES.filter(([m, p]) => !routes.some((r) => routeMatches(r, m, p.replace(/:id/g, 'X')))).map(([m, p]) => `${m} ${p}`);
}

/** The control door (DIF-001, on only in the test profile): never probed, since probing it would wipe the run. */
export function isControlDoor(route: CensusRoute): boolean {
  return route.pattern === '/api/__test' || route.pattern.startsWith('/api/__test/');
}

/** An admin route: under /api/admin or /admin. */
export function isAdminPattern(pattern: string): boolean {
  return /^\/(api\/)?admin(\/|$)/.test(pattern);
}

/** The route's concrete address (see the header), with the given ids. */
export function concreteAddress(pattern: string, ids: { request: AccountId; account: AccountId }): string {
  const parts = pattern.split('/');
  return parts
    .map((s, i) => {
      if (s === '**') return 'x';
      if (!s.startsWith(':')) return s;
      const before = parts.slice(0, i).join('/');
      return encodeURIComponent(String(/request/i.test(before) ? ids.request : ids.account));
    })
    .join('/');
}

// ---------------------------------------------------------------------------------------------------
// Session cookies: read, forged, replayed
// ---------------------------------------------------------------------------------------------------

export interface CookiePair {
  name: string;
  value: string;
}

/** Every cookie the actor's API context holds for the product's host. Throws a SetupError when it holds none. */
export async function sessionCookies(actor: Actor): Promise<CookiePair[]> {
  const host = new URL(productUrl()).hostname;
  const state = await actor.api.storageState();
  const pairs = state.cookies
    .filter((c) => c.domain.replace(/^\./, '') === host || host.endsWith(c.domain.replace(/^\./, '')))
    .map((c) => ({ name: c.name, value: c.value }));
  if (pairs.length === 0) throw new SetupError(`the signed-in actor ${actor.credentials.email} holds no cookie for ${host}`);
  return pairs;
}

/** The cookies as one Cookie header value. */
export function cookieHeader(pairs: CookiePair[]): string {
  return pairs.map((p) => `${p.name}=${p.value}`).join('; ');
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A value of the same length and alphabet as `like`, with none of its characters in place (a fresh random forgery). */
export function forgedLike(like: string): string {
  const bytes = randomBytes(Math.max(like.length, 1));
  let out = '';
  for (let i = 0; i < like.length; i += 1) {
    let c = B64URL[bytes[i] % 64];
    if (c === like[i]) c = B64URL[(bytes[i] + 1) % 64];
    out += c;
  }
  return out || 'x';
}

/** `value` with its last character changed to another of the base64url alphabet (a near miss of a real identifier). */
export function nearMiss(value: string): string {
  if (value === '') return 'x';
  const last = value[value.length - 1];
  const i = B64URL.indexOf(last);
  return value.slice(0, -1) + B64URL[(i < 0 ? 0 : i + 1) % 64];
}

/** The SHA-256 of `value`, hex and base64url: what a server that stores only the hash keeps (D-032). */
export function storedForms(value: string): { hex: string; b64url: string } {
  const h = createHash('sha256').update(value).digest();
  return { hex: h.toString('hex'), b64url: h.toString('base64url') };
}

/** One answer read whole: status, body text and the Set-Cookie header lines. */
export interface Answer {
  status: number;
  body: string;
  setCookie: string[];
}

async function readAnswer(res: APIResponse): Promise<Answer> {
  const body = await res.text().catch(() => '');
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  return { status: res.status(), body, setCookie };
}

/**
 * Sends ONE request on a fresh client with no cookie jar of its own, carrying `cookie` as its Cookie header (none when
 * null), and returns the answer whole. Redirects are not followed, so a redirect is read as the 3xx it is.
 */
export async function replay(cookie: string | null, method: string, address: string, data?: unknown): Promise<Answer> {
  const api = await playwrightRequest.newContext({
    baseURL: productUrl(),
    extraHTTPHeaders: cookie === null ? {} : { cookie },
  });
  try {
    const withBody = method !== 'GET' && method !== 'HEAD';
    const res = await api.fetch(address, { method, maxRedirects: 0, ...(withBody ? { data: data ?? {} } : {}) });
    return await readAnswer(res);
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// A page load that keeps what it received
// ---------------------------------------------------------------------------------------------------

/** One same-origin answer the browser received while loading a page. */
export interface Received {
  method: string;
  url: string;
  status: number;
  contentType: string;
  /** The navigation's own document answer (the first document requested for the address). */
  isDocument: boolean;
  body: string;
}

export interface PageLoad {
  address: string;
  /** The navigation's final status (0 when it answered none). */
  status: number;
  /** The path the browser ends on, without a trailing slash ("/" for the root), query kept apart. */
  finalPath: string;
  /** The live document after the network settled. */
  dom: string;
  /** The visible text of the body after the network settled. */
  visible: string;
  received: Received[];
}

/**
 * Loads `address` on `page`, waits (bounded) for the network to settle, and returns every same-origin answer the
 * browser received (bodies read whole; a redirect's body is ''), the live document and the visible text.
 */
export async function capturePageLoad(page: Page, address: string): Promise<PageLoad> {
  const origin = new URL(productUrl()).origin;
  const pending: Promise<Received>[] = [];
  const onResponse = (res: import('@playwright/test').Response) => {
    let u: URL;
    try {
      u = new URL(res.url());
    } catch {
      return;
    }
    if (u.origin !== origin) return;
    const req = res.request();
    pending.push(
      (async () => ({
        method: req.method(),
        url: `${u.pathname}${u.search}`,
        status: res.status(),
        contentType: (res.headers()['content-type'] ?? '').toLowerCase(),
        isDocument: req.resourceType() === 'document',
        body: res.status() >= 300 && res.status() < 400 ? '' : await res.text().catch(() => ''),
      }))(),
    );
  };
  page.on('response', onResponse);
  try {
    const response = await page.goto(address).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const received = await Promise.all(pending);
    const dom = await page.content().catch(() => '');
    const visible = await page.locator('body').innerText().catch(() => '');
    const finalPath = new URL(page.url()).pathname.replace(/\/+$/, '') || '/';
    return { address, status: response?.status() ?? 0, finalPath, dom, visible, received };
  } finally {
    page.off('response', onResponse);
  }
}

// ---------------------------------------------------------------------------------------------------
// Values in text
// ---------------------------------------------------------------------------------------------------

/** True when `text` holds `value` case-insensitively. */
export function holdsText(text: string, value: string): boolean {
  return text.toLowerCase().includes(value.toLowerCase());
}

/** True when `text` holds the whole number `n` standing alone (no digit, letter or decimal point against it). */
export function holdsNumber(text: string, n: number): boolean {
  return new RegExp(`(?<![0-9A-Za-z.])${String(n).replace('-', '[-−]')}(?![0-9A-Za-z]|\\.[0-9])`).test(text);
}

// ---------------------------------------------------------------------------------------------------
// One submission of the sign-in page's form
// ---------------------------------------------------------------------------------------------------

/** What one submission of the sign-in form left: the POST it sent, and what GET /api/me then answers on the page's cookies. */
export interface FormSignIn {
  /** The submission's same-origin POST, or null when none was seen within the bound. */
  post: { path: string; status: number } | null;
  /** GET /api/me's status on the page's own cookies after the submission settled. */
  meStatus: number;
  /** GET /api/me's id when it answered 200. */
  meId: AccountId | null;
}

/**
 * Opens /sign-in on `page`, fills "Email" and "Password", presses "Sign in", waits (bounded) for the submission's
 * same-origin POST answer and for the network to settle, then asks GET /api/me on the page's own cookies.
 * Throws a SetupError when the form cannot be operated; a POST never seen is returned as post: null.
 */
export async function submitSignInForm(page: Page, email: string, password: string, timeoutMs = 15_000): Promise<FormSignIn> {
  const origin = new URL(productUrl()).origin;
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(email, { timeout: timeoutMs });
    await page.getByLabel('Password', { exact: true }).fill(password, { timeout: timeoutMs });
  } catch (e) {
    throw new SetupError(`the sign-in page's form could not be filled: ${(e as Error).message.split('\n')[0]}`);
  }
  const posted = page
    .waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).origin === origin, { timeout: timeoutMs })
    .then((r) => ({ path: new URL(r.url()).pathname, status: r.status() }))
    .catch(() => null);
  try {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: timeoutMs });
  } catch (e) {
    throw new SetupError(`the sign-in page's button could not be pressed: ${(e as Error).message.split('\n')[0]}`);
  }
  const post = await posted;
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const me = await page.request.get('/api/me');
  let meId: AccountId | null = null;
  if (me.status() === 200) {
    const body = (await me.json().catch(() => null)) as { id?: AccountId } | null;
    meId = body?.id ?? null;
  }
  return { post, meStatus: me.status(), meId };
}
