// Purpose: ledger test for ROW-128 (REQ-014, REQ-013) — the control of the sign-in guard: a switched-on account signs in with its correct email and password, the email compared without regard to letter case, and reaches its pages.
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create accounts, the members' own password change), fresh per run.
//
// ROW-128 promise: REQ-014 "Every page and every action requires being signed in with an account's email and
// ROW-128   password" — the control half: the right email and password do sign in; REQ-013 "an email belongs to at
// ROW-128   most one account, compared without regard to letter case or surrounding spaces", so the account's email
// ROW-128   is the same email in any letter case; signed in, the account reaches its pages (D-029: /, /requests/new,
// ROW-128   /calendar, /password).
// ROW-128 wrong product: sign-in that compares the email exactly as stored, so "Ana@Example.test" is refused for
// ROW-128   ana@example.test (or an account created with capitals cannot sign in typed in lower case); a sign-in that
// ROW-128   answers 200 but sets no working session, so every page sends the person back to /sign-in; a guard so
// ROW-128   loose that any password signs in once the email matches in some case.
// ROW-128 given: a fresh install; member L created with a lower-case email and member M created with a mixed-case
// ROW-128   email, both switched on and with their own passwords chosen. when: L signs in with its email in upper case
// ROW-128   and in a mixed case, M with its email in lower case, each with the right password; then the browser
// ROW-128   carrying L's upper-case session loads each of L's pages. then: before signing in GET /api/me is refused;
// ROW-128   after, each sign-in answers 2xx and GET /api/me answers 200 with that account's own id; each page answers
// ROW-128   200 at its own address and draws no sign-in form. Decoy: L's upper-case email with a wrong password is
// ROW-128   refused and gets no session.
// ROW-128 controls: L signs in with its email exactly as created (the guard and the session work at all).
// ROW-128 technique: the letter case is the discriminating value (each variant differs from the stored email
// ROW-128   only in case); a near-miss decoy (right email, wrong password) so an open guard fails; fresh emails.
// ROW-128 cases: ROW-128 target=ROW-128.REQ-014.switched-on-account-signs-in-whatever-the-email-letter-case-and-reaches-its-pages control=ROW-128.control.exact-email-signs-in
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  fresh,
  freshPassword,
  openPage,
  PAGES,
  resetProduct,
  signIn,
  type Actor,
  type Install,
  type Member,
} from './harness';

const T0 = '2027-02-28T20:00:00Z';

let install: Install;
let admin: Actor;
let lower: Member;
let mixed: Member;

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  lower = await createMember(admin);
  mixed = await createMember(admin, { email: `Mixed.${fresh('Case')}@Example.Test` });
});

test.afterAll(async () => {
  await admin?.dispose();
});

function mixCase(email: string): string {
  return email
    .split('')
    .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
}

/** Signs in on a new context and returns the context with GET /api/me's status and id. */
async function attempt(email: string, password: string) {
  const api = await anonymousApi();
  const before = (await api.get('/api/me')).status();
  const signInStatus = (await api.post('/api/auth/sign-in', { data: { email, password } })).status();
  const me = await api.get('/api/me');
  let id: unknown = undefined;
  if (me.status() === 200) id = ((await me.json()) as { id?: unknown }).id;
  return { api, before, signInStatus, meStatus: me.status(), id };
}

test('ROW-128.control.exact-email-signs-in', async () => {
  const a = await attempt(lower.email, lower.password);
  try {
    expect(a.signInStatus, 'ROW-128 control: the exact email and password sign in').toBeLessThan(300);
    expect(a.meStatus, 'ROW-128 control: GET /api/me answers the session').toBe(200);
    expect(String(a.id), 'ROW-128 control: the session is the account\'s own').toBe(String(lower.id));
  } finally {
    await a.api.dispose();
  }
});

test('ROW-128.REQ-014.switched-on-account-signs-in-whatever-the-email-letter-case-and-reaches-its-pages', async ({ browser }) => {
  // Decoy: the right email in another case with a wrong password gets nothing.
  const decoy = await attempt(lower.email.toUpperCase(), freshPassword());
  try {
    expect.soft(decoy.signInStatus >= 200 && decoy.signInStatus < 300, 'ROW-128 decoy: a wrong password is refused').toBe(false);
    expect.soft(decoy.meStatus, 'ROW-128 decoy: no session after a wrong password').not.toBe(200);
  } finally {
    await decoy.api.dispose();
  }

  const variants: { label: string; email: string; account: Member }[] = [
    { label: 'L in upper case', email: lower.email.toUpperCase(), account: lower },
    { label: 'L in mixed case', email: mixCase(lower.email), account: lower },
    { label: 'M (created mixed) in lower case', email: mixed.email.toLowerCase(), account: mixed },
  ];
  for (const v of variants) {
    expect(v.email, `ROW-128 ${v.label}: the variant differs from the stored email`).not.toBe(v.account.email);
    expect(v.email.toLowerCase(), `ROW-128 ${v.label}: the variant differs only in letter case`).toBe(v.account.email.toLowerCase());
  }

  let pageSession: Awaited<ReturnType<typeof attempt>> | null = null;
  try {
    for (const v of variants) {
      const a = await attempt(v.email, v.account.password);
      expect.soft(a.before, `ROW-128 ${v.label}: before signing in GET /api/me is refused`).not.toBe(200);
      expect.soft(a.signInStatus >= 200 && a.signInStatus < 300, `ROW-128 ${v.label}: signs in (answered ${a.signInStatus})`).toBe(true);
      expect.soft(a.meStatus, `ROW-128 ${v.label}: GET /api/me answers the session`).toBe(200);
      expect.soft(String(a.id), `ROW-128 ${v.label}: the session is the account's own`).toBe(String(v.account.id));
      if (pageSession === null && a.meStatus === 200) pageSession = a;
      else await a.api.dispose();
    }
    expect(pageSession, 'ROW-128: a session from a letter-case variant exists to load the pages with').not.toBeNull();

    const actor: Actor = {
      kind: 'member',
      me: { id: lower.id, name: lower.name, isAdmin: false, mustChangePassword: false },
      credentials: { email: variants[0].email, password: lower.password },
      api: pageSession!.api,
      dispose: () => pageSession!.api.dispose(),
    };
    const opened = await openPage(browser, actor);
    try {
      for (const address of [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password]) {
        const response = await opened.page.goto(address);
        await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        expect.soft(response?.status(), `ROW-128 ${address}: answers 200`).toBe(200);
        expect.soft(new URL(opened.page.url()).pathname, `ROW-128 ${address}: the page stays at its address`).toBe(address);
        await expect
          .soft(opened.page.getByRole('button', { name: 'Sign in', exact: true }), `ROW-128 ${address}: no sign-in form is drawn`)
          .toHaveCount(0);
      }
    } finally {
      await opened.close();
    }
  } finally {
    await pageSession?.api.dispose();
  }
});
