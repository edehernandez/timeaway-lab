// Purpose: ledger test for ROW-279 (REQ-014) — signed out, the sign-in page /sign-in shows an email field labelled Email, a password field labelled Password and a Sign in button, and no navigation to other pages.
// Provenance: hand-authored (test-author pass, slice 0); no fixture data — the visitor is anonymous.
//
// ROW-279 promise: REQ-014 "Every page and every action requires being signed in with an account's email and
// ROW-279   password" — fail-if (1) someone not signed in sees any page's content other than the sign-in page; the
// ROW-279   sign-in page is where that email and password are given. The labels are D-029's plain words
// ROW-279   (Email, Password, Sign in); the row's own obligation names them.
// ROW-279 wrong product: a /sign-in page that renders a heading only (the skeleton), or one that shows the form
// ROW-279   with a field labelled "Username" or "Email address", a password typed in a visible text box, a
// ROW-279   "Log in" link instead of a button, or the signed-in app's navigation (Calendar, Requests) to a visitor.
// ROW-279 given: a fresh browser context with no cookies (anonymous). when: it loads /sign-in. then: exactly one
// ROW-279   editable field whose label is exactly "Email" holds what is typed into it, exactly one field whose
// ROW-279   label is exactly "Password" is a masked password input, exactly one button named exactly "Sign in" is
// ROW-279   visible and enabled; the page has no navigation landmark and no link to any address but /sign-in.
// ROW-279 controls: the control case shows the visitor reaches /sign-in and gets the page's own 200 with a
// ROW-279   document rendered, so the target's failures are about the form, not an unreachable route.
// ROW-279 technique: exact accessible-name lookups (a near-miss label such as "Email address" does not match),
// ROW-279   a fresh value typed and read back (the field is a real input, not text), soft assertions so every
// ROW-279   clause is evaluated and reported, and a denominator over every link on the page for "no navigation".
// ROW-279 cases: ROW-279 target=ROW-279.REQ-014.signed-out-sign-in-shows-Email-Password-Sign-in-and-no-navigation control=ROW-279.control.signed-out-sign-in-answers-200
import { test, expect } from '@playwright/test';
import { fresh, freshEmail, openPage, PAGES } from './harness';

test('ROW-279.control.signed-out-sign-in-answers-200', async ({ browser }) => {
  const opened = await openPage(browser, 'anonymous');
  try {
    const cookiesBefore = await opened.context.cookies();
    expect(cookiesBefore, 'ROW-279 control: the visitor starts with no cookies (anonymous)').toEqual([]);
    const response = await opened.page.goto(PAGES.signIn);
    expect(response, 'ROW-279 control: /sign-in answered').not.toBeNull();
    expect(response!.status(), 'ROW-279 control: /sign-in answers the page itself').toBe(200);
    await expect(opened.page.locator('body'), 'ROW-279 control: a document body is rendered').toBeAttached();
  } finally {
    await opened.close();
  }
});

test('ROW-279.REQ-014.signed-out-sign-in-shows-Email-Password-Sign-in-and-no-navigation', async ({ browser }) => {
  const opened = await openPage(browser, 'anonymous');
  const page = opened.page;
  try {
    const response = await page.goto(PAGES.signIn);
    expect(response?.status(), 'ROW-279: /sign-in is reached (setup)').toBe(200);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    // Email: exactly one field labelled exactly "Email", editable, holding what is typed.
    const email = page.getByLabel('Email', { exact: true });
    await expect.soft(email, 'ROW-279: exactly one field labelled "Email"').toHaveCount(1);
    if ((await email.count()) === 1) {
      await expect.soft(email, 'ROW-279: the Email field is visible').toBeVisible();
      await expect.soft(email, 'ROW-279: the Email field is editable').toBeEditable();
      const typed = freshEmail('row279');
      await email.fill(typed);
      await expect.soft(email, 'ROW-279: the Email field holds what is typed').toHaveValue(typed);
      const type = await email.evaluate((el) => (el as HTMLInputElement).type ?? '');
      expect.soft(['email', 'text'], `ROW-279: the Email field is an email or text input, not "${type}"`).toContain(type);
    }

    // Password: exactly one field labelled exactly "Password", a masked password input.
    const password = page.getByLabel('Password', { exact: true });
    await expect.soft(password, 'ROW-279: exactly one field labelled "Password"').toHaveCount(1);
    if ((await password.count()) === 1) {
      await expect.soft(password, 'ROW-279: the Password field is visible').toBeVisible();
      await expect.soft(password, 'ROW-279: the Password field is editable').toBeEditable();
      await expect.soft(password, 'ROW-279: the Password field is masked').toHaveAttribute('type', 'password');
      const typed = fresh('pw279');
      await password.fill(typed);
      await expect.soft(password, 'ROW-279: the Password field holds what is typed').toHaveValue(typed);
    }

    // Sign in: exactly one button named exactly "Sign in", visible and enabled.
    const button = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect.soft(button, 'ROW-279: exactly one button named "Sign in"').toHaveCount(1);
    if ((await button.count()) === 1) {
      await expect.soft(button, 'ROW-279: the Sign in button is visible').toBeVisible();
      await expect.soft(button, 'ROW-279: the Sign in button is enabled').toBeEnabled();
    }

    // No navigation: no navigation landmark, and no link on the page leads to any address but /sign-in.
    await expect.soft(page.getByRole('navigation'), 'ROW-279: no navigation landmark on the sign-in page').toHaveCount(0);
    const targets = await page.locator('a[href], [role="link"]').evaluateAll((els) =>
      els.map((el) => {
        const href = el.getAttribute('href');
        if (href === null) return `(link without href: ${(el.textContent || '').trim().slice(0, 40)})`;
        const url = new URL(href, document.baseURI);
        return url.origin === location.origin ? url.pathname : url.href;
      }),
    );
    const elsewhere = targets.filter((t) => t !== PAGES.signIn);
    expect.soft(elsewhere, 'ROW-279: no link from the sign-in page to another page').toEqual([]);
  } finally {
    await opened.close();
  }
});
