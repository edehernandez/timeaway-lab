// Purpose: ledger tests for ROW-221 (REQ-014, NG-001, NG-010) — the sign-in page offers no forgot-password, reset or sign-up link, no such route answers, and the page says the admin sets new passwords.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); a fresh install through harness.ts (reset), the visitor anonymous.
//
// Boundary (R6): the links and the line are paint, proved in the browser on /sign-in; that no route answers is
// proved at the HTTP harness, with the harm itself checked: no account results from a would-be sign-up.
import { test, expect } from '@playwright/test';
import { anonymousApi, freshEmail, freshName, freshPassword, openPage } from './harness';
import { disposeAll, freshTeam, settle, textLines } from './robustness';

test.afterEach(disposeAll);

const SELF_SERVICE = /forgot|reset|recover|sign ?-?up|register|create (an |your )?account|join/i;
const ADMIN_SETS = /admin[^.\n]*password|password[^.\n]*admin/i;
const PAGES = ['/forgot-password', '/forgot', '/reset-password', '/reset', '/password/reset', '/password/forgot', '/sign-up', '/signup', '/register', '/join', '/recover'];
const ROUTES = [
  '/api/auth/forgot-password', '/api/auth/forgot', '/api/auth/reset-password', '/api/auth/reset', '/api/auth/sign-up',
  '/api/auth/signup', '/api/auth/register', '/api/register', '/api/sign-up', '/api/signup', '/api/password/reset',
  '/api/accounts', '/api/users',
];

// ---------------------------------------------------------------------------------------------------
// ROW-221 promise: the row — the sign-in page offers no forgot-password, reset or sign-up link, and no such route
// ROW-221   answers; it says the admin sets new passwords. NG-001 (no email of any kind), NG-010 (no self sign-up),
// ROW-221   REQ-014 (every page needs signing in), A-008 (the admin sets a new password for a person).
// ROW-221 wrong product: a sign-in page from a template with "Forgot password?" and "Create an account" links; a
// ROW-221   leftover /api/auth/register route that creates an account for anyone; a page that leaves a person who
// ROW-221   forgot their password with no word of what to do.
// ROW-221 given: a fresh install; an anonymous visitor. when: the visitor opens /sign-in; asks for each would-be
// ROW-221   self-service page; posts a fresh name, email and password to each would-be sign-up or reset route, then
// ROW-221   tries that email and password at sign-in. then: no link or button on the page names or points to forgot,
// ROW-221   reset, recover, sign-up, register or join; a line on the page says the admin sets passwords; each page
// ROW-221   answers 404 or sends to /sign-in; each route answers 401, 403, 404 or 405; the email and password sign in
// ROW-221   to nothing.
// ROW-221 controls: the control case shows /sign-in answering 200 with its Email field — the page is the real one.
// ROW-221 technique: a denominator over every link and button on the page; for the routes, the harm (an account
// ROW-221   made) checked after the posts, not only the status.
// ROW-221 cases: ROW-221 target=ROW-221.REQ-014.no-self-service-link-or-route-and-the-admin-sets-passwords control=ROW-221.control.the-sign-in-page-answers-with-its-form
test('ROW-221.control.the-sign-in-page-answers-with-its-form', async ({ browser }) => {
  await freshTeam();
  const opened = await openPage(browser, 'anonymous');
  try {
    const r = await opened.page.goto('/sign-in');
    expect(r?.status(), 'ROW-221 control: /sign-in answers 200').toBe(200);
    await expect(opened.page.getByLabel('Email', { exact: true }), 'ROW-221 control: the Email field is there').toBeVisible();
  } finally {
    await opened.close();
  }
});

test('ROW-221.REQ-014.no-self-service-link-or-route-and-the-admin-sets-passwords', async ({ browser }) => {
  await freshTeam();
  const opened = await openPage(browser, 'anonymous');
  try {
    await opened.page.goto('/sign-in');
    await settle(opened.page);
    const offers = await opened.page.locator('a, button, [role="link"], [role="button"]').evaluateAll((els) =>
      els.map((el) => `${(el.textContent ?? '').trim()} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('href') ?? ''}`.trim()),
    );
    expect.soft(offers.filter((o) => SELF_SERVICE.test(o)), 'ROW-221: no forgot, reset or sign-up link or button').toEqual([]);
    const lines = await textLines(opened.page);
    expect.soft(lines.some((l) => ADMIN_SETS.test(l)), `ROW-221: the page says the admin sets new passwords (${JSON.stringify(lines)})`).toBe(true);
  } finally {
    await opened.close();
  }

  const api = await anonymousApi();
  try {
    for (const path of PAGES) {
      const r = await api.get(path, { maxRedirects: 0 });
      const to = r.headers()['location'] ? new URL(r.headers()['location'], 'http://x').pathname : null;
      const ok = r.status() === 404 || (r.status() >= 300 && r.status() < 400 && to === '/sign-in');
      expect.soft(ok, `ROW-221 GET ${path}: no such page answers (status ${r.status()}${to ? `, to ${to}` : ''})`).toBe(true);
    }
    const tries: { email: string; password: string }[] = [];
    for (const path of ROUTES) {
      const body = { name: freshName('Self'), email: freshEmail('self'), password: freshPassword(), allowance: 25 };
      tries.push(body);
      const r = await api.post(path, { data: body });
      expect.soft([401, 403, 404, 405], `ROW-221 POST ${path}: no such route answers (status ${r.status()})`).toContain(r.status());
    }
    for (const t of tries) {
      const s = await anonymousApi();
      try {
        await s.post('/api/auth/sign-in', { data: { email: t.email, password: t.password } });
        expect.soft((await s.get('/api/me')).status(), `ROW-221: no account was made for ${t.email}`).not.toBe(200);
      } finally {
        await s.dispose();
      }
    }
  } finally {
    await api.dispose();
  }
});
