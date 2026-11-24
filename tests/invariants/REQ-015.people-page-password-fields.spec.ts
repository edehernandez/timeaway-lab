// Purpose: ledger tests for ROW-234 (REQ-013, REQ-015) — other people's password fields on the people page are never autofilled with the admin's own sign-in, and the browser is not offered to save them as the admin's.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts), fresh per run; the admin signs in through the sign-in page itself, so the browser has seen the admin's own credentials typed.
// Provenance: the strengthened cases at the end, hand-authored (test-author pass, slice 1, batch test-author-3), the same fixtures, fresh per run.
//
// Boundary (R6): autofill and save prompts are the browser's, steered by the page's markup: proved in the browser on
// /admin/people and /admin/people/:id, reading the fields as painted. Headless Chromium has no password manager, so the
// observable is the contract a password manager obeys (WHATWG autofill): a field for another person's password is
// autocomplete="new-password", empty as loaded, and not paired with a field holding the admin's own email.
import { test, expect, type Page } from '@playwright/test';
import { anonymousApi, createMember, freshEmail, freshName, freshPassword, productUrl, signInThroughPage } from './harness';
import { createForm, disposeAll, freshTeam, keep, settle, trySignIn } from './robustness';

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
// ROW-234 (this argument's target and control still run; the row's one fault-proof line is with the strengthened
// ROW-234   cases at the end of this file, which also catch the username-less form these cases cannot see)
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

// ---------------------------------------------------------------------------------------------------
// The strengthened cases (slice 1, re-brief class=test): which saved login the browser ties each password form to.
//
// Reading (WHATWG autofill and Chromium's password-form parsing): a password manager groups the password fields by
// their form owner (formless fields form one group), and takes as the group's username the text-like field
// (text, email, tel, search, url; never type="hidden", which it ignores) whose autocomplete holds "username", else the
// last text-like field before the first password field. A group with no username, or an empty one, is a
// change-password form for the site's saved login (here the admin's, typed on the sign-in page), so the browser
// fills and offers to update the admin's own sign-in. A group whose username is the admin's email is tied to the
// admin by name. Only a username that is the person the form is for (their email or display name) keeps the
// password away from the admin's sign-in.

const TEXT_LIKE = ['text', 'email', 'tel', 'search', 'url'];

interface PasswordGroup {
  where: string;
  passwordFields: number;
  username: string | null;
  usernameField: string | null;
  how: string;
}

/** Every group of password fields on the page, with the username a password manager would read for it now. */
async function passwordGroups(page: Page): Promise<PasswordGroup[]> {
  return page.evaluate((textLike) => {
    const name = (el: HTMLInputElement | HTMLFormElement): string =>
      ((el as HTMLInputElement).labels?.[0]?.innerText ?? el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.id ?? '').trim();
    const groups = new Map<HTMLFormElement | null, HTMLInputElement[]>();
    for (const el of Array.from(document.querySelectorAll('input'))) {
      const key = el.form;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(el);
    }
    const out: PasswordGroup[] = [];
    for (const [form, els] of groups) {
      const pws = els.filter((e) => e.type === 'password');
      if (pws.length === 0) continue;
      const texts = els.filter((e) => textLike.includes(e.type));
      const tokens = (e: HTMLInputElement) => (e.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
      let chosen = texts.find((e) => tokens(e).includes('username')) ?? null;
      let how = 'its autocomplete="username" field';
      if (!chosen) {
        const before = texts.filter((e) => e.compareDocumentPosition(pws[0]) & Node.DOCUMENT_POSITION_FOLLOWING);
        chosen = before[before.length - 1] ?? null;
        how = chosen ? 'the last text field before its first password field' : 'no username field at all';
      }
      out.push({
        where: form ? `form "${name(form) || 'unnamed'}" (password fields: ${pws.map(name).join(', ')})` : '(fields outside any form)',
        passwordFields: pws.length,
        username: chosen ? chosen.value : null,
        usernameField: chosen ? name(chosen) || chosen.type : null,
        how,
      });
    }
    return out;
  }, TEXT_LIKE);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Asserts every password group on the page is tied to `person` (their email or display name), never to the admin. */
function expectGroupsTiedTo(groups: PasswordGroup[], where: string, person: { email: string; name: string }, adminEmail: string): void {
  expect.soft(groups.length, `ROW-234 ${where}: the page offers a password field for ${person.email}`).toBeGreaterThan(0);
  for (const g of groups) {
    const u = norm(g.username);
    expect.soft(u, `ROW-234 ${where} ${g.where}: its username (${g.how}) is not the admin's email`).not.toBe(norm(adminEmail));
    expect
      .soft(
        u === norm(person.email) || u === norm(person.name),
        `ROW-234 ${where} ${g.where}: its username (${g.how}${g.usernameField ? `, "${g.usernameField}"` : ''}) is "${g.username ?? ''}", ` +
          `not the person it is for (${person.email} / ${person.name}) — a browser ties this password to the admin's saved sign-in`,
      )
      .toBe(true);
  }
}

// ROW-234 promise: the row — other people's password fields on the people page are never autofilled with the admin's
// ROW-234   own sign-in, and the browser is not offered to save them as the admin's; REQ-015 arm 1 (the admin sets a new
// ROW-234   password for another account) and REQ-013 (the admin creates an account with a first password); A-008.
// ROW-234 wrong product: the person page's set-password form holds two autocomplete="new-password" fields and no
// ROW-234   username field (or one holding the admin's email, or the first member's email on every person page): every
// ROW-234   field is new-password and empty, so the earlier cases pass, yet the browser reads it as a change of the
// ROW-234   site's saved login, the admin's, and offers to update the admin's own sign-in with another person's password.
// ROW-234 given: the admin signed in through the sign-in page (the browser has seen the admin's sign-in); two members,
// ROW-234   M1 and M2, fresh names and emails (the decoy: on M1's page M2's identity must not be the username, and
// ROW-234   back). when: on /admin/people/:M1 and /admin/people/:M2 the admin opens the set-password step and types a
// ROW-234   fresh password into every password field; on /admin/people the admin opens the create form and types a
// ROW-234   fresh name, a fresh email and a password. then: every group of password fields on each page has a
// ROW-234   username, read at the moment the password is typed (what the browser captures), equal to the person the
// ROW-234   form is for — that page's member, or the new person typed — and never the admin's email.
// ROW-234 controls: the control case types a fresh password into M1's page's password form and presses its button,
// ROW-234   and M1 then signs in with that password: the form read is the one that sets that person's password.
// ROW-234 technique: a denominator over every password group on the pages; the username a password manager reads,
// ROW-234   computed from the page as painted; two members so a username fixed to one person fails on the other's page.
// ROW-234 cases: ROW-234 target=ROW-234.REQ-015.every-password-form-names-the-person-it-is-for-never-the-admin control=ROW-234.control.the-person-page-password-form-sets-that-persons-password
test('ROW-234.control.the-person-page-password-form-sets-that-persons-password', async ({ browser }) => {
  const { install, admin } = await freshTeam();
  const m1 = await createMember(admin);
  const context = await browser.newContext({ baseURL: productUrl() });
  try {
    const page = await context.newPage();
    await signInThroughPage(page, install.admin);
    await page.goto(`/admin/people/${encodeURIComponent(String(m1.id))}`);
    await settle(page);
    await openPasswordFields(page);
    const form = page.locator('form').filter({ has: page.locator('input[type="password"]') }).first();
    await expect(form, 'ROW-234 control: the person page shows a password form').toBeVisible();
    const next = freshPassword();
    const pws = form.locator('input[type="password"]');
    for (let i = 0; i < (await pws.count()); i += 1) await pws.nth(i).fill(next);
    const submit = form
      .locator('button[type="submit"], input[type="submit"], button:not([type])')
      .filter({ hasNotText: /cancel/i })
      .first();
    page.once('dialog', (d) => d.accept().catch(() => undefined));
    await Promise.all([
      page
        .waitForResponse((r) => r.request().method() === 'POST' && /\/api\/admin\/accounts\/[^/]+\/password/.test(r.url()), { timeout: 15_000 })
        .catch(() => null),
      submit.click(),
    ]);
    await settle(page);
    const anon = keep(await anonymousApi());
    const after = await trySignIn(anon, m1.email, next);
    expect(after.session, `ROW-234 control: ${m1.email} signs in with the password set through the person page's form`).toBe(true);
  } finally {
    await context.close();
  }
});

test('ROW-234.REQ-015.every-password-form-names-the-person-it-is-for-never-the-admin', async ({ browser }) => {
  const { install, admin } = await freshTeam();
  const m1 = await createMember(admin);
  const m2 = await createMember(admin);
  const context = await browser.newContext({ baseURL: productUrl() });
  try {
    const page = await context.newPage();
    await signInThroughPage(page, install.admin);

    for (const m of [m1, m2]) {
      const path = `/admin/people/${encodeURIComponent(String(m.id))}`;
      await page.goto(path);
      await settle(page);
      await openPasswordFields(page);
      const pws = page.locator('input[type="password"]');
      const typed = freshPassword();
      for (let i = 0; i < (await pws.count()); i += 1) await pws.nth(i).fill(typed);
      expectGroupsTiedTo(await passwordGroups(page), path, m, install.admin.email);
    }

    await page.goto('/admin/people');
    await settle(page);
    const form = await createForm(page);
    const person = { name: freshName('Newcomer'), email: freshEmail('newcomer') };
    await form.getByLabel(/^(display )?name$/i).first().fill(person.name);
    await form.getByLabel(/^email$/i).first().fill(person.email);
    const pws = form.locator('input[type="password"]');
    const typed = freshPassword();
    for (let i = 0; i < (await pws.count()); i += 1) await pws.nth(i).fill(typed);
    expectGroupsTiedTo(await passwordGroups(page), '/admin/people (create form)', person, install.admin.email);
  } finally {
    await context.close();
  }
});
