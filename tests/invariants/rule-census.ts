// Purpose: shared census doors for the rule tests RULE-001 to RULE-005 — the pages read from the page folder's file names, the routes a rule walk calls, each route's concrete addresses for a set of id bindings, one call of a route on a session or with no cookie, an answer read as text for figures, and two installs' answers compared token for token.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19), from DECISIONS.md D-029 (the routes and pages), D-031 (the rule censuses are the denominators these walks execute) and D-027 (what a calendar entry carries); a public harness boundary beside harness.ts and route-census.ts, imported by ledger tests only. It reads the NAMES of the files under app/pages (Nuxt's file-page convention), as route-census.ts reads server/api's, never their contents, and no other application file; it asserts nothing about any row.
//
// Readings, stated once:
//   - a PAGE is one .vue (or .tsx/.jsx) file under app/pages: its path segments are the directories and the file's
//     stem ([id] -> :id, [...x] -> **, a trailing "index" dropped, a "(group)" directory adding no segment) — the
//     reading checks/extractors/routes.sh gives the route table;
//   - a page's CONCRETE ADDRESS fills each :param with the account id given (D-029: /admin/people/:id is an account);
//   - the RULE WALK's routes are route-census.ts's census less the control door (DIF-001; probing it would wipe the
//     run) and less the sign-in routes under /api/auth (signing in and out is not an operation on another person's
//     data, and calling sign-out would end the walking session);
//   - a route's METHODS for a walk that must try every method are the one its file declares, or GET, POST, PUT,
//     PATCH and DELETE when it declares none;
//   - a BINDING is one choice of the ids a route's :params are filled with (route-census.ts concreteAddress: a request
//     id after a "request" segment, else an account id);
//   - an answer's FIGURE TEXT is its JSON with every value under a key naming an id, an instant or a token removed and
//     every email and instant string emptied, so an id, a time or a token is never read as a figure;
//   - two installs' answers are the SAME when, after embedded devalue payloads are read back as the values they encode,
//     escapes are written out and instants masked, they are equal token for token, a token allowed to differ only when
//     it is the id of the same role in each install.
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { productUrl, type AccountId } from './harness';
import { concreteAddress, isControlDoor, routeCensus, type CensusRoute } from './route-census';

// The mounted tree's root (docker-compose.test.yml mounts it read-only at /app, the working directory).
const ROOT = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', '..') : process.cwd();

// ---------------------------------------------------------------------------------------------------
// The page census
// ---------------------------------------------------------------------------------------------------

export interface CensusPage {
  /** The page's path pattern, e.g. /admin/people/:id. */
  pattern: string;
  /** The file it was read from, relative to the tree's root. */
  file: string;
}

const PAGE_FILE = /\.(vue|tsx|jsx)$/;

function pageSegment(name: string): string {
  if (/^\[\.\.\.[^\]]*\]$/.test(name)) return '**';
  return name.replace(/\[\[?([^\]]+?)\]?\]/g, ':$1');
}

function walkPages(abs: string, url: string, rel: string, out: CensusPage[]): void {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const childAbs = path.join(abs, e.name);
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (/^\(.*\)$/.test(e.name)) walkPages(childAbs, url, childRel, out);
      else walkPages(childAbs, `${url}/${pageSegment(e.name)}`, childRel, out);
      continue;
    }
    if (!e.isFile() || !PAGE_FILE.test(e.name)) continue;
    const stem = e.name.replace(PAGE_FILE, '');
    const pattern = stem === 'index' ? url || '/' : `${url}/${pageSegment(stem)}`;
    out.push({ pattern, file: childRel });
  }
}

/** Every page the page folder declares, read from its file names (see the header). */
export function pageCensus(): CensusPage[] {
  const out: CensusPage[] = [];
  const abs = path.join(ROOT, 'app/pages');
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walkPages(abs, '', 'app/pages', out);
  return out.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/** The page's concrete address: every :param filled with `accountId`, ** with "x". */
export function pageAddress(pattern: string, accountId: AccountId): string {
  return pattern
    .split('/')
    .map((s) => (s === '**' ? 'x' : s.startsWith(':') ? encodeURIComponent(String(accountId)) : s))
    .join('/');
}

/** True when the pattern has a :param or ** segment (its address depends on the id it is filled with). */
export function hasParam(pattern: string): boolean {
  return pattern.split('/').some((s) => s.startsWith(':') || s === '**');
}

// ---------------------------------------------------------------------------------------------------
// The rule walk's routes and addresses
// ---------------------------------------------------------------------------------------------------

/** The routes a rule walk calls (see the header): the route census less the control door and /api/auth. */
export function ruleRoutes(): CensusRoute[] {
  return routeCensus().filter((r) => !isControlDoor(r) && !/^\/api\/auth(\/|$)/.test(r.pattern));
}

export const EVERY_METHOD = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** The method the route's file declares, or every method of EVERY_METHOD when it declares none. */
export function everyMethodOf(route: CensusRoute): string[] {
  return route.method === null ? [...EVERY_METHOD] : [route.method];
}

/** One choice of the ids a route's :params are filled with. */
export interface Binding {
  label: string;
  request: AccountId;
  account: AccountId;
}

/** True when the route's :params are filled from the binding's request id (a :param after a "request" segment). */
export function fillsRequest(pattern: string): boolean {
  const parts = pattern.split('/');
  return parts.some((s, i) => s.startsWith(':') && /request/i.test(parts.slice(0, i).join('/')));
}

/** The route's concrete addresses for the bindings, each once (a route with no :param has one address). */
export function addressesOf(route: CensusRoute, bindings: Binding[]): { address: string; binding: Binding }[] {
  const seen = new Set<string>();
  const out: { address: string; binding: Binding }[] = [];
  for (const b of bindings) {
    const address = concreteAddress(route.pattern, { request: b.request, account: b.account });
    if (seen.has(address)) continue;
    seen.add(address);
    out.push({ address, binding: b });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// One call
// ---------------------------------------------------------------------------------------------------

/** One answer read whole. */
export interface Called {
  method: string;
  address: string;
  status: number;
  contentType: string;
  body: string;
  /** The body parsed as JSON, or undefined when it is none. */
  json: unknown;
}

/**
 * Calls `method address` on `api` (a signed-in actor's context), or — when `api` is null — on a fresh client with no
 * cookie at all, and reads the answer whole. Redirects are not followed. GET and HEAD carry no body; every other
 * method carries `data` (default {}).
 */
export async function callRoute(api: APIRequestContext | null, method: string, address: string, data?: unknown): Promise<Called> {
  const own = api === null ? await playwrightRequest.newContext({ baseURL: productUrl() }) : null;
  const ctx = (api ?? own) as APIRequestContext;
  try {
    const withBody = method !== 'GET' && method !== 'HEAD';
    const res = await ctx.fetch(address, { method, maxRedirects: 0, ...(withBody ? { data: data ?? {} } : {}) });
    const body = await res.text().catch(() => '');
    let json: unknown = undefined;
    try {
      json = body ? (JSON.parse(body) as unknown) : undefined;
    } catch {
      json = undefined;
    }
    return { method, address, status: res.status(), contentType: (res.headers()['content-type'] ?? '').toLowerCase(), body, json };
  } finally {
    if (own) await own.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// Figure text
// ---------------------------------------------------------------------------------------------------

const NOT_A_FIGURE_KEY = /(^id$|Id$|_id$|^ids$|At$|_at$|^at$|token|Token|^on$|^date$|Date$|_date$|Day$|_day$|^year$|Year$|_year$|^month$)/;

/** The answer's figure text (see the header): ids, instants, tokens, dates, emails and years taken out. */
export function figureText(json: unknown): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !NOT_A_FIGURE_KEY.test(k))
          .map(([k, x]) => [k, strip(x)]),
      );
    }
    if (typeof v === 'string') {
      return v
        .replace(/[^\s"]+@[^\s"]+/g, ' ')
        .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?/g, ' ')
        .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ');
    }
    return v;
  };
  return JSON.stringify(strip(json));
}

/** True when `text` holds the whole number `n` standing alone (no digit, letter or decimal point against it). */
export function standsAlone(text: string, n: number): boolean {
  return new RegExp(`(?<![0-9A-Za-z.])${String(n).replace('-', '[-−]')}(?![0-9A-Za-z]|\\.[0-9])`).test(text);
}

// ---------------------------------------------------------------------------------------------------
// Two installs compared
// ---------------------------------------------------------------------------------------------------

const INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g;
const ZONELESS = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?/g;
const EPOCH = /(?<![0-9])1[0-9]{12}(?![0-9])/g;

/**
 * A devalue payload (Nuxt's __NUXT_DATA__ and _payload.json: a flat array whose numbers point at other entries, equal
 * values stored once) read back as the plain value it encodes, so a comparison sees the data, not the array's indices.
 */
export function unflatten(arr: unknown[]): unknown {
  const memo = new Map<number, unknown>();
  const at = (i: number, depth: number): unknown => {
    if (i < 0) return `<special ${i}>`;
    if (memo.has(i)) return memo.get(i);
    if (depth > 300) return '<deep>';
    const v = arr[i];
    const ref = (x: unknown) => (typeof x === 'number' ? at(x, depth + 1) : x);
    let out: unknown;
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') out = { [v[0]]: ['Date', 'RegExp', 'BigInt'].includes(v[0]) ? v.slice(1) : v.slice(1).map(ref) };
      else out = v.map(ref);
    } else if (v !== null && typeof v === 'object') {
      out = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, ref(x)]));
    } else {
      out = v;
    }
    memo.set(i, out);
    return out;
  };
  return at(0, 0);
}

/** `text` with a devalue payload read back as plain JSON; unchanged when it is none. */
export function readPayload(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? JSON.stringify(unflatten(parsed)) : text;
  } catch {
    return text;
  }
}

/** A document with every embedded JSON script (Nuxt's __NUXT_DATA__ among them) read back as plain JSON. */
export function readDocument(html: string): string {
  return html.replace(/(<script\b[^>]*type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open: string, body: string, close: string) => `${open}${readPayload(body)}${close}`);
}

/** The text with escapes written out (so an id inside an escaped path is its own token) and instants masked. */
export function masked(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/%2F/gi, '/')
    .replace(INSTANT, '<instant>')
    .replace(ZONELESS, '<instant>')
    .replace(EPOCH, '<instant>');
}

/** Every id (as text) of an install, with the roles it plays there (an account id and a request id may share a text). */
export type IdRoles = Map<string, Set<string>>;

/** Records that `id` plays `role` in the install. */
export function addRole(ids: IdRoles, id: AccountId, role: string): void {
  const k = String(id);
  const set = ids.get(k) ?? new Set<string>();
  set.add(role);
  ids.set(k, set);
}

function rolesText(set: Set<string>): string {
  return [...set].sort().join('|');
}

/** The key a surface is compared under: its label and address with every known id replaced by its roles. */
export function surfaceKey(label: string, url: string, ids: IdRoles): string {
  const [pathPart, query] = url.split(/\?(.*)/s);
  const parts = pathPart.split(/(\/)/).map((p) => {
    let decoded = p;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      decoded = p;
    }
    const roles = ids.get(decoded);
    return roles ? `<${rolesText(roles)}>` : p;
  });
  return `${label} ${parts.join('')}${query !== undefined ? `?${query}` : ''}`;
}

/**
 * Null when `a` (install X, ids `idsA`) and `b` (install Y, ids `idsB`) are the same (see the header): token for token,
 * a token allowed to differ only when the two share a role; else the first difference, in plain words.
 */
export function difference(a: string, idsA: IdRoles, b: string, idsB: IdRoles): string | null {
  const tokens = (s: string) => masked(s).match(/[A-Za-z0-9_-]+|[^A-Za-z0-9_-]/g) ?? [];
  const ta = tokens(a);
  const tb = tokens(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i += 1) {
    if (ta[i] === tb[i]) continue;
    const ra = idsA.get(ta[i]);
    const rb = idsB.get(tb[i]);
    if (ra && rb && [...ra].some((r) => rb.has(r))) continue;
    const at = (t: string[]) => t.slice(Math.max(0, i - 12), i + 12).join('');
    return `token ${i}: X has "${ta[i]}", Y has "${tb[i]}" — X …${at(ta)}… / Y …${at(tb)}…`;
  }
  if (ta.length !== tb.length) return `lengths differ (${ta.length} and ${tb.length} tokens) after token ${n}`;
  return null;
}
