// Purpose: ledger tests for ROW-234 (REQ-013, REQ-015) — other people's password fields on the people page are never autofilled with the admin's own sign-in, and the browser is not offered to save them as the admin's.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts), fresh per run; the admin signs in through the sign-in page itself, so the browser has seen the admin's own credentials typed.
//
// Boundary (R6): autofill and save prompts are the browser's, steered by the page's markup: proved in the browser on
// /admin/people and /admin/people/:id, reading the fields as painted. Headless Chromium has no password manager, so the
// observable is the contract a password manager obeys (WHATWG autofill): a field for another person's password is
// autocomplete="new-password", empty as loaded, and not paired with a field holding the admin's own email.
import { test, expect, type Page } from '@playwright/test';
import { createMember, productUrl, signInThroughPage } from './harness';
import { createForm, disposeAll, freshTeam, settle } from './robustness';

test.afterEach(disposeAll);

/** Opens every password control the page offers: the create form, and a "Set password" step when there is one. */
async function openPasswordFields(page: Page): Promise<void> {
  if (new URL(page.url()).pathname === '/admin/people') await createForm(page).catch(() => undefined);
  const set = page.getByRole('button', { name: /set (a )?(new )?password|reset password|new password/i });
  if ((await set.count()) > 0) {
    await set.first().click().catch(() => undefined);
    await settle(page);
  }
}

async function readFields(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map((el) => ({
      type: el.type,
      autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase(),
      value: el.value,
      inPasswordForm: !!el.form?.querySelector('input[type="password"]'),
      label: (el.labels?.[0]?.innerText ?? el.getAttribute('aria-label') ?? el.name ?? '').trim(),
    })),
  );
}

// ---------------------------------------------------------------------------------------------------
// ROW-234 promise: the row — other people's password fields on the people page are never autofilled with the admin's
// ROW-234   own sign-in, and the browser is not offered to save them as the admin's; REQ-015 (the admin sets a new
// ROW-234   password for any other account), REQ-013 (the admin creates an account with a first password).
// ROW-234 wrong product: a create or set-password form with a bare <input type="password"> (autocomplete unset or
// ROW-234   "current-password") beside an email field: the browser fills the admin's saved password into a new
// ROW-234   account, and offers to overwrite the admin's saved sign-in with the password just typed for someone else.
// ROW-234 given: the admin signed in through the sign-in page (the browser has seen the admin's email and password);
// ROW-234   member M. when: the admin opens /admin/people (its create form opened) and /admin/people/:M (its set-password
// ROW-234   step opened when it has one). then: there is a password field; every password field is
// ROW-234   autocomplete="new-password" and empty; no field is autocomplete="current-password"; no field of a form with
// ROW-234   a password field holds the admin's email.
// ROW-234 controls: the control case shows /admin/people answering 200 to the admin signed in the same way.
// ROW-234 technique: a denominator over every input on the pages; the decoy is the admin's own email, the value a
// ROW-234   browser would pair.
// ROW-234 cases: ROW-234 target=ROW-234.REQ-015.password-fields-for-others-are-new-password-and-empty control=ROW-234.control.the-people-page-answers-the-admin
test('ROW-234.control.the-people-page-answers-the-admin', async ({ browser }) => {
  const { install } = await freshTeam();
  const context = await browser.newContext({ baseURL: productUrl() });
  try {
    const page = await context.newPage();
    await signInThroughPage(page, install.admin);
    const r = await page.goto('/admin/people');
    expect(r?.status(), 'ROW-234 control: /admin/people answers 200').toBe(200);
  } finally {
    await context.close();
  }
});

test('ROW-234.REQ-015.password-fields-for-others-are-new-password-and-empty', async ({ browser }) => {
  const { install, admin } = await freshTeam();
  const m = await createMember(admin);
  const context = await browser.newContext({ baseURL: productUrl() });
  try {
    const page = await context.newPage();
    await signInThroughPage(page, install.admin);
    let passwordFields = 0;
    for (const path of ['/admin/people', `/admin/people/${encodeURIComponent(String(m.id))}`]) {
      await page.goto(path);
      await settle(page);
      await openPasswordFields(page);
      const fields = await readFields(page);
      const pw = fields.filter((f) => f.type === 'password');
      passwordFields += pw.length;
      for (const f of pw) {
        expect.soft(f.autocomplete.split(/\s+/), `ROW-234 ${path} "${f.label}": autocomplete is new-password`).toContain('new-password');
        expect.soft(f.value, `ROW-234 ${path} "${f.label}": empty as loaded`).toBe('');
      }
      expect.soft(fields.filter((f) => f.autocomplete.includes('current-password')).map((f) => f.label), `ROW-234 ${path}: no current-password field`).toEqual([]);
      expect.soft(
        fields.filter((f) => f.inPasswordForm && f.value.trim().toLowerCase() === install.admin.email).map((f) => f.label),
        `ROW-234 ${path}: no field beside a password holds the admin's email`,
      ).toEqual([]);
    }
    expect.soft(passwordFields, 'ROW-234: the people pages offer a password field').toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
