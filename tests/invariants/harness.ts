// Purpose: the harness client — the ONE public surface every ledger test goes through: the control door, the actor door, the engine door and the fixture builders, all over the network at VID_PRODUCT_URL.
// Provenance: hand-authored (test-author pass, slice 0, code skeleton harness pass), from DECISIONS.md D-029 (the route contract) and D-030 (the runner).
//
// Rules this client keeps, so every test that goes through it keeps them too:
//   - It reaches the product ONLY over HTTP at VID_PRODUCT_URL (docker-compose.test.yml: http://product:3000).
//     It never opens the database, never imports application code, never reads source files.
//   - Fixture law: every record a fixture builder makes is made through the product's own public routes
//     (D-029), the same ones production uses; no hand-set flags.
//   - Fresh values: fresh(), freshName(), freshEmail(), freshPassword() are unique per run, so no product
//     can hard-code them.
//   - Setup is not the row: anything a builder or door needs that the product does not answer throws a
//     SetupError whose message starts "SETUP:" and names the route and the status, so a report reads a
//     setup failure as setup, never as the row failing.
//   - Readiness waits, never fixed sleeps: waits are bounded polls on an observable condition.
//
// Actor kinds: 'anonymous' (no session; needs no door), 'admin' (the one admin the reset creates),
// 'member' (an account the admin creates through createMember).
//
// Route contract (D-029), as this client calls it. Where D-029 elides a path ("…/effect", the act after
// it, and the bodies of name|email|password|allowance) this client's reading is stated at the function
// that calls it, so a mismatch shows up as a SETUP failure naming the route, never as a row failing.
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

// ---------------------------------------------------------------------------------------------------
// Base URL and setup failures
// ---------------------------------------------------------------------------------------------------

/** The product's base URL, from VID_PRODUCT_URL. Throws a SetupError when it is not set (the ledger runs only through sh checks/test.sh). */
export function productUrl(): string {
  const url = process.env.VID_PRODUCT_URL;
  if (!url) throw new SetupError('VID_PRODUCT_URL is not set — the ledger runs only through sh checks/test.sh');
  return url.replace(/\/+$/, '');
}

/** A failure of setup (a door or a fixture builder), never of the row under test. Its message starts "SETUP:". */
export class SetupError extends Error {
  constructor(message: string) {
    super(`SETUP: ${message}`);
    this.name = 'SetupError';
  }
}

async function bodyText(res: APIResponse): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

/** Throws a SetupError naming `what`, the status and the start of the body when `res` is not a 2xx answer. */
export async function requireOk(res: APIResponse, what: string): Promise<APIResponse> {
  if (!res.ok()) throw new SetupError(`${what} answered ${res.status()}: ${await bodyText(res)}`);
  return res;
}

async function requireJson<T>(res: APIResponse, what: string): Promise<T> {
  await requireOk(res, what);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SetupError(`${what} answered ${res.status()} without a JSON body: ${await bodyText(res)}`);
  }
}

/** A new API context against the product with no cookies: the 'anonymous' actor's door. Dispose it when done. */
export async function anonymousApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: productUrl() });
}

// ---------------------------------------------------------------------------------------------------
// Fresh values
// ---------------------------------------------------------------------------------------------------

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
let counter = 0;

/** A value unique to this run and this call: `<label>-<run id><n>` (letters, digits and dashes). */
export function fresh(label = 'v'): string {
  counter += 1;
  return `${label}-${RUN}${counter}`;
}

/** A unique display name (1 to 60 characters, D-015): `<label> <run id><n>`, e.g. "Ilse k3x9q2ab7". */
export function freshName(label = 'Person'): string {
  counter += 1;
  return `${label} ${RUN}${counter}`.slice(0, 60);
}

/** A unique, lower-case email at the reserved example.test domain. */
export function freshEmail(label = 'person'): string {
  counter += 1;
  return `${label}.${RUN}${counter}@example.test`.toLowerCase();
}

/** A unique password of at least 8 characters (D-014). */
export function freshPassword(): string {
  counter += 1;
  return `Pw-${RUN}-${counter}-ok`;
}

// ---------------------------------------------------------------------------------------------------
// The control door (test-only routes; on only with TIMEAWAY_TEST_CONTROL and VID_TEST)
// ---------------------------------------------------------------------------------------------------

/** An account's creation fields, as POST /api/admin/accounts and the reset's admin take them. */
export interface AccountSpec {
  name: string;
  email: string;
  password: string;
  allowance: number;
}

/** What resetProduct installed: the admin's spec (its password is the one to sign in with), the team time zone, the clock instant (null: the real clock). */
export interface Install {
  admin: AccountSpec;
  timeZone: string;
  now: string | null;
}

/** The team time zone a reset uses unless told otherwise: far from the container's UTC (BASELINE "Test environment"). */
export const DEFAULT_TIME_ZONE = 'Pacific/Auckland';

/**
 * Resets the product to a fresh install: POST /api/__test/reset {timeZone, now, admin:{name,email,password,allowance}}
 * wipes every record and creates the one admin as the setup command does (D-011, D-029).
 * Defaults: a fresh admin (fresh name, email and password, allowance 25), DEFAULT_TIME_ZONE, now = null (the real clock).
 * `now` is an ISO 8601 instant ("2027-03-01T09:00:00Z") that the team clock reports until changed by setClock.
 * Returns what was installed; sign the admin in with signIn(install.admin).
 */
export async function resetProduct(opts: { timeZone?: string; now?: string | null; admin?: Partial<AccountSpec> } = {}): Promise<Install> {
  const admin: AccountSpec = {
    name: opts.admin?.name ?? freshName('Admin'),
    email: opts.admin?.email ?? freshEmail('admin'),
    password: opts.admin?.password ?? freshPassword(),
    allowance: opts.admin?.allowance ?? 25,
  };
  const install: Install = { admin, timeZone: opts.timeZone ?? DEFAULT_TIME_ZONE, now: opts.now ?? null };
  const api = await anonymousApi();
  try {
    await requireOk(await api.post('/api/__test/reset', { data: install }), 'POST /api/__test/reset');
  } finally {
    await api.dispose();
  }
  return install;
}

/** Sets the team clock: POST /api/__test/clock {now}; `now` an ISO 8601 instant, or null for the real clock again. */
export async function setClock(now: string | null): Promise<void> {
  const api = await anonymousApi();
  try {
    await requireOk(await api.post('/api/__test/clock', { data: { now } }), 'POST /api/__test/clock');
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// The actor door
// ---------------------------------------------------------------------------------------------------

export type AccountId = string | number;

/** GET /api/me's answer (D-029). */
export interface Me {
  id: AccountId;
  name: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

export interface Credentials {
  email: string;
  password: string;
}

/** A signed-in actor: its API context carries the session cookie; `me` is what GET /api/me answered at sign-in. */
export interface Actor {
  kind: 'admin' | 'member';
  me: Me;
  credentials: Credentials;
  api: APIRequestContext;
  /** Ends the client side of the session (disposes the API context). It does not sign out; call signOut for that. */
  dispose(): Promise<void>;
}

/**
 * Signs in through the product's sign-in route and verifies the session:
 * POST /api/auth/sign-in {email,password} (sets the session cookie), then GET /api/me must answer 200 with an id.
 * The actor kind is read from me.isAdmin. Throws a SetupError when either step fails.
 * Use this for actors a test needs as setup; a test about sign-in itself calls the routes directly on anonymousApi().
 */
export async function signIn(credentials: Credentials): Promise<Actor> {
  const api = await anonymousApi();
  try {
    await requireOk(
      await api.post('/api/auth/sign-in', { data: { email: credentials.email, password: credentials.password } }),
      `POST /api/auth/sign-in as ${credentials.email}`,
    );
    const me = await requireJson<Me>(await api.get('/api/me'), `GET /api/me after signing in as ${credentials.email}`);
    if (me === null || typeof me !== 'object' || me.id === undefined || me.id === null) {
      throw new SetupError(`GET /api/me after signing in as ${credentials.email} carried no id`);
    }
    return {
      kind: me.isAdmin ? 'admin' : 'member',
      me,
      credentials: { ...credentials },
      api,
      dispose: () => api.dispose(),
    };
  } catch (e) {
    await api.dispose();
    throw e;
  }
}

/** Signs the actor out: POST /api/auth/sign-out on its session. Throws a SetupError when the route does not answer 2xx. */
export async function signOut(actor: Actor): Promise<void> {
  await requireOk(await actor.api.post('/api/auth/sign-out'), 'POST /api/auth/sign-out');
}

/**
 * Signs in through the sign-in page's form, in the browser, and verifies the session:
 * opens /sign-in, fills the field labelled "Email" and the field labelled "Password", presses the button named
 * "Sign in" (D-029's plain-word labels), then waits (bounded poll, no sleep) until GET /api/me on the page's own
 * cookies answers 200, and returns that answer. Throws a SetupError when the form or the session is not there.
 * A test ABOUT the sign-in page operates the form itself; this door is for tests that need a browser signed in
 * the way a person signs in.
 */
export async function signInThroughPage(page: Page, credentials: Credentials, timeoutMs = 15_000): Promise<Me> {
  try {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(credentials.email, { timeout: timeoutMs });
    await page.getByLabel('Password', { exact: true }).fill(credentials.password, { timeout: timeoutMs });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: timeoutMs });
  } catch (e) {
    throw new SetupError(`the sign-in page's form could not be operated: ${(e as Error).message.split('\n')[0]}`);
  }
  let me: Me | null = null;
  try {
    await expect
      .poll(
        async () => {
          const res = await page.request.get('/api/me');
          if (res.status() !== 200) return res.status();
          me = (await res.json()) as Me;
          return 200;
        },
        { timeout: timeoutMs },
      )
      .toBe(200);
  } catch {
    throw new SetupError(`no session after signing in through the page as ${credentials.email}`);
  }
  return me as unknown as Me;
}

// ---------------------------------------------------------------------------------------------------
// The engine door (browser-class rows)
// ---------------------------------------------------------------------------------------------------

/** A browser context and page opened through the engine door, with the console errors and page errors it has seen so far. */
export interface Opened {
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
  close(): Promise<void>;
}

/**
 * Opens a fresh browser context and page on the harness's one engine (Chromium, playwright.config.ts) at the product's
 * base URL. With an actor, the context starts with that actor's session cookie (taken from its API context: the
 * session the actor door verified); with 'anonymous' it starts with no cookies at all.
 * Console errors and uncaught page errors are collected in `consoleErrors`. Close it when done.
 */
export async function openPage(browser: Browser, actor: Actor | 'anonymous'): Promise<Opened> {
  const storageState = actor === 'anonymous' ? undefined : await actor.api.storageState();
  const context = await browser.newContext({ baseURL: productUrl(), storageState });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  return { context, page, consoleErrors, close: () => context.close() };
}

// ---------------------------------------------------------------------------------------------------
// Fixture builders (public routes only, D-029)
// ---------------------------------------------------------------------------------------------------

/** A member account made by createMember. `password` signs it in now; `adminSetPassword` is the one the admin gave it. */
export interface Member extends AccountSpec {
  id: AccountId;
  adminSetPassword: string;
  /** True when createMember chose the member's own password (REQ-026's forced change) through POST /api/me/password. */
  choseOwnPassword: boolean;
}

/**
 * Creates a member through the admin's session: POST /api/admin/accounts {name,email,password,allowance} → 201 {id}.
 * Defaults: fresh name, email and admin-set password; allowance 25.
 * Then, unless `choosePassword: false`, completes REQ-026's forced password change the way the member would: signs the
 * member in with the admin-set password and POST /api/me/password {current, next} with a fresh password, so the
 * returned `password` is the member's own and the account can reach every page. With `choosePassword: false` the
 * account is left with the admin-set password (a test of REQ-026 itself wants that).
 */
export async function createMember(
  admin: Actor,
  spec: Partial<AccountSpec> & { choosePassword?: boolean } = {},
): Promise<Member> {
  const body: AccountSpec = {
    name: spec.name ?? freshName('Member'),
    email: spec.email ?? freshEmail('member'),
    password: spec.password ?? freshPassword(),
    allowance: spec.allowance ?? 25,
  };
  const res = await admin.api.post('/api/admin/accounts', { data: body });
  const created = await requireJson<{ id: AccountId }>(res, `POST /api/admin/accounts for ${body.email}`);
  if (created?.id === undefined || created?.id === null) {
    throw new SetupError(`POST /api/admin/accounts for ${body.email} answered ${res.status()} without an id`);
  }
  const member: Member = { ...body, id: created.id, adminSetPassword: body.password, choseOwnPassword: false };
  if (spec.choosePassword === false) return member;

  const next = freshPassword();
  const session = await signIn({ email: body.email, password: body.password });
  try {
    await requireOk(
      await session.api.post('/api/me/password', { data: { current: body.password, next } }),
      `POST /api/me/password (forced change) for ${body.email}`,
    );
  } finally {
    await session.dispose();
  }
  return { ...member, password: next, choseOwnPassword: true };
}

/** Signs a member made by createMember in through the actor door, with its current password. */
export async function signInMember(member: Member): Promise<Actor> {
  return signIn({ email: member.email, password: member.password });
}

/** A request's fields as POST /api/requests takes them: kind 'vacation' or 'sick' (REQ-001), days YYYY-MM-DD in the team time zone. */
export interface RequestSpec {
  kind: 'vacation' | 'sick';
  firstDay: string;
  lastDay: string;
}

/**
 * Sends a request on the actor's own session: POST /api/requests {kind,firstDay,lastDay} → 201 {id}.
 * Throws a SetupError on a refusal; a test about refusals posts on actor.api itself and reads the answer.
 */
export async function sendRequest(actor: Actor, spec: RequestSpec): Promise<AccountId> {
  const res = await actor.api.post('/api/requests', { data: spec });
  const body = await requireJson<{ id: AccountId }>(res, `POST /api/requests ${JSON.stringify(spec)}`);
  if (body?.id === undefined || body?.id === null) throw new SetupError('POST /api/requests answered without an id');
  return body.id;
}

/** Cancels one of the actor's own requests: POST /api/requests/:id/cancel. */
export async function cancelOwnRequest(actor: Actor, requestId: AccountId): Promise<void> {
  await requireOk(await actor.api.post(`/api/requests/${seg(requestId)}/cancel`), `POST /api/requests/${requestId}/cancel`);
}

/** GET /api/balance's answer (D-029). */
export interface Balance {
  years: { year: number; daysLeft: number; pending: number }[];
}

/** Reads the actor's own balance: GET /api/balance → {years:[{year,daysLeft,pending}]}. */
export async function readBalance(actor: Actor): Promise<Balance> {
  return requireJson<Balance>(await actor.api.get('/api/balance'), 'GET /api/balance');
}

/** The four admin actions confirmed in two steps (D-029). */
export type ConfirmedAction = 'approve' | 'reject' | 'cancel' | 'switch-off';

/** The first step's answer: the token the act must carry and the plain summary of its effect. */
export interface Effect {
  token: string;
  summary: string;
}

function seg(id: AccountId): string {
  return encodeURIComponent(String(id));
}

/**
 * Where the two steps of a confirmed action live. D-029 names the first step "GET …/effect?action=…" and the
 * switch act "POST /api/admin/accounts/:id/switch {on, token}", and elides the rest; this client reads it as:
 *   approve | reject | cancel  on a request:  GET /api/admin/requests/:id/effect?action=<a>
 *                                             POST /api/admin/requests/:id/<a> {token, ...extra}
 *   switch-off                 on an account: GET /api/admin/accounts/:id/effect?action=switch-off
 *                                             POST /api/admin/accounts/:id/switch {on:false, token, ...extra}
 * If the product's routes differ, the builders below fail as SETUP naming the route — a contract question for D-029.
 */
export function confirmedActionRoutes(action: ConfirmedAction, targetId: AccountId): { effect: string; act: string } {
  if (action === 'switch-off') {
    return {
      effect: `/api/admin/accounts/${seg(targetId)}/effect?action=switch-off`,
      act: `/api/admin/accounts/${seg(targetId)}/switch`,
    };
  }
  return {
    effect: `/api/admin/requests/${seg(targetId)}/effect?action=${action}`,
    act: `/api/admin/requests/${seg(targetId)}/${action}`,
  };
}

/** Step one of a confirmed action: reads its effect and token (GET …/effect?action=…, routes per confirmedActionRoutes). */
export async function readEffect(admin: Actor, action: ConfirmedAction, targetId: AccountId): Promise<Effect> {
  const { effect } = confirmedActionRoutes(action, targetId);
  const body = await requireJson<Effect>(await admin.api.get(effect), `GET ${effect}`);
  if (!body || typeof body.token !== 'string' || body.token === '') throw new SetupError(`GET ${effect} answered without a token`);
  return body;
}

/**
 * Step two of a confirmed action, RAW: posts the act with the given token and returns the product's answer unjudged
 * (a stale token is refused 409 by contract; a test of that reads the status). `extra` is merged into the body
 * (e.g. a partial cancel's day).
 */
export async function actWithToken(
  admin: Actor,
  action: ConfirmedAction,
  targetId: AccountId,
  token: string,
  extra: Record<string, unknown> = {},
): Promise<APIResponse> {
  const { act } = confirmedActionRoutes(action, targetId);
  const data = action === 'switch-off' ? { on: false, token, ...extra } : { token, ...extra };
  return admin.api.post(act, { data });
}

/** A confirmed action done in its two steps as setup: readEffect then actWithToken, which must answer 2xx. Returns the effect read. */
export async function confirmedAction(
  admin: Actor,
  action: ConfirmedAction,
  targetId: AccountId,
  extra: Record<string, unknown> = {},
): Promise<Effect> {
  const effect = await readEffect(admin, action, targetId);
  const { act } = confirmedActionRoutes(action, targetId);
  await requireOk(await actWithToken(admin, action, targetId, effect.token, extra), `POST ${act} (${action})`);
  return effect;
}

/** Approves a request through the confirmed two-step action. */
export async function approve(admin: Actor, requestId: AccountId): Promise<Effect> {
  return confirmedAction(admin, 'approve', requestId);
}

/** Rejects a request through the confirmed two-step action. */
export async function reject(admin: Actor, requestId: AccountId): Promise<Effect> {
  return confirmedAction(admin, 'reject', requestId);
}

/** The admin cancels a request through the confirmed two-step action; `extra` carries a partial cancel's fields. */
export async function adminCancel(admin: Actor, requestId: AccountId, extra: Record<string, unknown> = {}): Promise<Effect> {
  return confirmedAction(admin, 'cancel', requestId, extra);
}

/**
 * Switches an account. Off: the confirmed two-step action (effect, then POST /api/admin/accounts/:id/switch {on:false, token}).
 * On: POST /api/admin/accounts/:id/switch {on:true} — switching on is not one of D-029's four confirmed actions.
 */
export async function switchAccount(admin: Actor, accountId: AccountId, on: boolean): Promise<void> {
  if (!on) {
    await confirmedAction(admin, 'switch-off', accountId);
    return;
  }
  const route = `/api/admin/accounts/${seg(accountId)}/switch`;
  await requireOk(await admin.api.post(route, { data: { on: true } }), `POST ${route} {on:true}`);
}

/**
 * Sets an account's allowance: POST /api/admin/accounts/:id/allowance {allowance, startsNextYear}.
 * (D-029 writes the body "{…, startsNextYear}"; this client names the value field `allowance`, as the create body does.)
 */
export async function setAllowance(
  admin: Actor,
  accountId: AccountId,
  allowance: number,
  opts: { startsNextYear?: boolean } = {},
): Promise<void> {
  const route = `/api/admin/accounts/${seg(accountId)}/allowance`;
  await requireOk(
    await admin.api.post(route, { data: { allowance, startsNextYear: opts.startsNextYear ?? false } }),
    `POST ${route}`,
  );
}

/** The admin sets another account's password: POST /api/admin/accounts/:id/password {password} (field named as in the create body). */
export async function setPassword(admin: Actor, accountId: AccountId, password: string): Promise<void> {
  const route = `/api/admin/accounts/${seg(accountId)}/password`;
  await requireOk(await admin.api.post(route, { data: { password } }), `POST ${route}`);
}

/** The admin renames an account: POST /api/admin/accounts/:id/name {name}. */
export async function rename(admin: Actor, accountId: AccountId, name: string): Promise<void> {
  const route = `/api/admin/accounts/${seg(accountId)}/name`;
  await requireOk(await admin.api.post(route, { data: { name } }), `POST ${route}`);
}

/** The admin changes an account's email: POST /api/admin/accounts/:id/email {email}. */
export async function changeEmail(admin: Actor, accountId: AccountId, email: string): Promise<void> {
  const route = `/api/admin/accounts/${seg(accountId)}/email`;
  await requireOk(await admin.api.post(route, { data: { email } }), `POST ${route}`);
}

/** The pages of D-029, as the product serves them; `:id` is an account id. */
export const PAGES = {
  signIn: '/sign-in',
  home: '/',
  newRequest: '/requests/new',
  calendar: '/calendar',
  password: '/password',
  adminPending: '/admin/pending',
  adminPeople: '/admin/people',
  adminPerson: (id: AccountId) => `/admin/people/${seg(id)}`,
} as const;
