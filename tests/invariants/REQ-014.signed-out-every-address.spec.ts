// Purpose: ledger test for ROW-112 (REQ-014, REQ-013) — signed out, every address shows only the sign-in page: an email and password form, no navigation, no team data, and no link to any sign-up.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, create account), fresh per run.
//
// ROW-112 promise: REQ-014 fail-if (1) "someone who is not signed in sees any page's content or any data other
// ROW-112   than the sign-in page"; REQ-013 "there is no page where anyone signs themselves up" (NG-010). The
// ROW-112   addresses are D-029's page list (the contract the owner's decisions fix), not the product's own routes;
// ROW-112   the form's plain-word labels are D-029's (Email, Password, Sign in). The route-folder census of every
// ROW-112   address is ROW-067's, not this row's.
// ROW-112 wrong product: a calendar or people page served to a visitor because its guard was forgotten; a page
// ROW-112   that draws the sign-in form but still ships the team's names in its server-rendered payload or fetches
// ROW-112   them from an API while loading; a sign-in page with the app's navigation or a "Create account" link.
// ROW-112 given: a fresh install with a fresh admin and a fresh member (unique names and emails), so the team's
// ROW-112   data exists and is drawn for the admin (the control). when: a browser with no cookies loads each
// ROW-112   address. then: each shows exactly the Email field, the masked Password field and the Sign in button;
// ROW-112   no navigation landmark and no link to any page but /sign-in; no sign-up link or button; and neither the
// ROW-112   document nor any same-origin response received while loading carries any of the four fresh values.
// ROW-112 controls: the control case signs the admin in through the actor door and loads /admin/people, which
// ROW-112   must draw the member's fresh name — the data the target looks for exists and a page does draw it.
// ROW-112 technique: fresh values as the team data (no product can hard-code their absence or presence), a
// ROW-112   denominator over every link and every response, soft assertions naming the address so every address
// ROW-112   and every clause is evaluated in one target case (a fault on any one address fails it).
// ROW-112 cases: ROW-112 target=ROW-112.REQ-014.signed-out-every-address-shows-only-the-sign-in-page control=ROW-112.control.admin-sees-the-team-data
import { test, expect, type Page } from '@playwright/test';
import { createMember, openPage, PAGES, productUrl, resetProduct, signIn, type Actor, type Install, type Member } from './harness';

let install: Install;
let admin: Actor;
let member: Member;

test.beforeAll(async () => {
  install = await resetProduct();
  admin = await signIn(install.admin);
  member = await createMember(admin, { choosePassword: false });
});

test.afterAll(async () => {
  await admin?.dispose();
});

function teamValues(): string[] {
  return [member.name, member.email, install.admin.name, install.admin.email];
}

test('ROW-112.control.admin-sees-the-team-data', async ({ browser }) => {
  const opened = await openPage(browser, admin);
  try {
    const response = await opened.page.goto(PAGES.adminPeople);
    expect(response?.status(), 'ROW-112 control: /admin/people answers the admin').toBe(200);
    await expect(opened.page.locator('body'), 'ROW-112 control: the admin sees the member\'s fresh name').toContainText(member.name);
  } finally {
    await opened.close();
  }
});

async function loadCapturing(page: Page, address: string): Promise<{ status: number; bodies: string[] }> {
  const origin = new URL(productUrl()).origin;
  const pending: Promise<string>[] = [];
  page.on('response', (res) => {
    if (new URL(res.url()).origin !== origin) return;
    pending.push(res.text().catch(() => ''));
  });
  const response = await page.goto(address);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const bodies = await Promise.all(pending);
  bodies.push(await page.content());
  return { status: response?.status() ?? 0, bodies };
}

test('ROW-112.REQ-014.signed-out-every-address-shows-only-the-sign-in-page', async ({ browser }) => {
  const addresses = [
    PAGES.signIn,
    PAGES.home,
    PAGES.newRequest,
    PAGES.calendar,
    PAGES.password,
    PAGES.adminPending,
    PAGES.adminPeople,
    PAGES.adminPerson(member.id),
  ];
  const secrets = teamValues();

  for (const address of addresses) {
    const opened = await openPage(browser, 'anonymous');
    const page = opened.page;
    try {
      expect(await opened.context.cookies(), `ROW-112 ${address}: the visitor has no cookies`).toEqual([]);
      const { status, bodies } = await loadCapturing(page, address);
      expect.soft(status, `ROW-112 ${address}: the address answers with a page (not a server error)`).toBeLessThan(500);

      // The sign-in form.
      await expect.soft(page.getByLabel('Email', { exact: true }), `ROW-112 ${address}: one field labelled "Email"`).toHaveCount(1);
      const password = page.getByLabel('Password', { exact: true });
      await expect.soft(password, `ROW-112 ${address}: one field labelled "Password"`).toHaveCount(1);
      if ((await password.count()) === 1) {
        await expect.soft(password, `ROW-112 ${address}: the Password field is masked`).toHaveAttribute('type', 'password');
      }
      await expect
        .soft(page.getByRole('button', { name: 'Sign in', exact: true }), `ROW-112 ${address}: one button named "Sign in"`)
        .toHaveCount(1);

      // No navigation.
      await expect.soft(page.getByRole('navigation'), `ROW-112 ${address}: no navigation landmark`).toHaveCount(0);
      const links = await page.locator('a[href], [role="link"]').evaluateAll((els) =>
        els.map((el) => {
          const href = el.getAttribute('href');
          if (href === null) return `(link without href: ${(el.textContent || '').trim().slice(0, 40)})`;
          const url = new URL(href, document.baseURI);
          return url.origin === location.origin ? url.pathname : url.href;
        }),
      );
      expect.soft(links.filter((l) => l !== PAGES.signIn), `ROW-112 ${address}: no link to another page`).toEqual([]);

      // No sign-up.
      const signUp = await page.locator('a, button, [role="link"], [role="button"], input[type="submit"]').evaluateAll((els) =>
        els
          .map((el) => `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('value') || ''} ${el.getAttribute('href') || ''}`)
          .filter((t) => /sign[\s_-]*up|register|create[\s_-]+(an[\s_-]+)?account|join/i.test(t))
          .map((t) => t.replace(/\s+/g, ' ').trim()),
      );
      expect.soft(signUp, `ROW-112 ${address}: no sign-up link or button`).toEqual([]);

      // No team data, in the document or in any response received while loading.
      const leaked = secrets.filter((v) => bodies.some((b) => b.toLowerCase().includes(v.toLowerCase())));
      expect.soft(leaked, `ROW-112 ${address}: no team data reaches the visitor`).toEqual([]);
    } finally {
      await opened.close();
    }
  }
});
