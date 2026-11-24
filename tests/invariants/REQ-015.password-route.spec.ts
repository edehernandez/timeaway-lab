// Purpose: ledger test for ROW-283 (REQ-015) — signed in, /password shows the form to change one's own password: the current password and the new password typed twice.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, an account with its own chosen password), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): what the route draws is paint, proved in the browser at D-029's /password. Whether a change needs the
// correct current password, and what a change ends, are REQ-015's rules at the HTTP harness (ROW-073..ROW-077).
// Form reading: the password fields are the visible <input type="password"> outside the header, each named by its
// accessible label (its <label>, aria-label or aria-labelledby; a placeholder is not a label); "current" is the one
// whose label says current (or old); the two others are the new password typed twice.
//
// ROW-283 promise: REQ-015 "every person, the admin included, changes their own password after giving their current
// ROW-283   one"; fail-if (2) "a person's own password is changed … by a change that does not carry their correct
// ROW-283   current password"; the row: /password draws that form — current password, new password typed twice.
// ROW-283   Authority: REQ-015 (A-008, A-034).
// ROW-283 wrong product: no page at /password (404) or a redirect to /; a form with only a new password (the admin's
// ROW-283   set form, no current one); a new password asked once; three unlabelled fields; fields of type text that show
// ROW-283   the password as it is typed; fields in two separate forms, so no one submit carries all three.
// ROW-283 given: member M (own password chosen), team today Mon 2027-03-08. when: M opens /password and reads it
// ROW-283   untouched. then: 200 at /password with one header; exactly three visible password fields outside the header,
// ROW-283   all in one form, each with a label; exactly one labelled current (or old); the other two not labelled current;
// ROW-283   the form has a visible submit button.
// ROW-283 controls: the control case — the browser context carries M's session (GET /api/me answers M's id and
// ROW-283   mustChangePassword false, so /password is reached as a chosen visit, not REQ-026's forced change) — so a red
// ROW-283   target is the route, not the session.
// ROW-283 technique: an exact count of the fields and of the current one, so a form missing the repeat or the
// ROW-283   current field, or doubling it, fails.
// ROW-283 cases: ROW-283 target=ROW-283.REQ-015.password-route-shows-the-own-change-form control=ROW-283.control.member-session-with-own-password
import { test, expect, type Page } from '@playwright/test';
import { createMember, openPage, PAGES, resetProduct, signIn, signInMember, type Actor } from './harness';
import { openRoute, routeProblems } from './route-reading';

const T0 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

async function member(): Promise<{ id: string; actor: Actor }> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const m = await createMember(admin);
  const actor = await signInMember(m);
  actors.push(actor);
  return { id: String(m.id), actor };
}

interface PasswordField {
  label: string;
  form: number;
}

/** The visible password fields outside the header: each one's accessible label and the index of its form (-1: none). */
async function passwordFields(page: Page): Promise<PasswordField[]> {
  return page.evaluate(() => {
    const forms = Array.from(document.forms);
    const inHeader = (el: Element) => {
      if (el.closest('[role="banner"]')) return true;
      const h = el.closest('header');
      return !!h && !h.parentElement?.closest('article, aside, main, nav, section, [role="main"]');
    };
    const shown = (el: Element) => {
      const h = el as HTMLElement & { checkVisibility?: () => boolean };
      return typeof h.checkVisibility === 'function' ? h.checkVisibility() : h.getClientRects().length > 0;
    };
    return Array.from(document.querySelectorAll('input[type="password"]'))
      .filter((el) => shown(el) && !inHeader(el))
      .map((el) => {
        const input = el as HTMLInputElement;
        const byLabels = Array.from(input.labels ?? []).map((l) => (l as HTMLElement).innerText).join(' ');
        const byIds = (input.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .map((id) => (id ? (document.getElementById(id) as HTMLElement | null)?.innerText ?? '' : ''))
          .join(' ');
        const label = [byLabels, input.getAttribute('aria-label') ?? '', byIds].join(' ').replace(/\s+/g, ' ').trim();
        return { label, form: input.form ? forms.indexOf(input.form) : -1 };
      });
  });
}

test('ROW-283.control.member-session-with-own-password', async ({ browser }) => {
  const m = await member();
  const opened = await openPage(browser, m.actor);
  try {
    const me = await opened.page.request.get('/api/me');
    expect(me.status(), 'ROW-283 control: the browser context carries a session').toBe(200);
    const body = await me.json();
    expect(String(body.id), "ROW-283 control: the session is M's").toBe(m.id);
    expect(body.mustChangePassword, 'ROW-283 control: M has chosen an own password (no forced change pending)').toBe(false);
  } finally {
    await opened.close();
  }
});

test('ROW-283.REQ-015.password-route-shows-the-own-change-form', async ({ browser }) => {
  const m = await member();
  const opened = await openPage(browser, m.actor);
  const page = opened.page;
  try {
    const read = await openRoute(page, PAGES.password);
    expect.soft(routeProblems(read, PAGES.password), 'ROW-283: /password is the page, inside the header').toEqual([]);
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);

    const fields = await passwordFields(page);
    expect.soft(fields.length, `ROW-283: /password draws exactly three password fields (read: ${JSON.stringify(fields)})`).toBe(3);
    expect.soft(fields.every((f) => f.label !== ''), 'ROW-283: every password field has a label').toBe(true);
    const forms = new Set(fields.map((f) => f.form));
    expect.soft(forms.size === 1 && !forms.has(-1), 'ROW-283: the three password fields are in one form').toBe(true);
    const current = fields.filter((f) => /\b(current|old|existing|present)\b/i.test(f.label));
    expect.soft(current.length, 'ROW-283: exactly one field asks for the current password').toBe(1);
    const fresh = fields.filter((f) => f.label !== '' && !/\b(current|old|existing|present)\b/i.test(f.label));
    expect.soft(fresh.length, 'ROW-283: two fields ask for the new password (typed twice)').toBe(2);

    const form = page.locator('form').filter({ has: page.locator('input[type="password"]') }).first();
    const submit = form.locator('button[type="submit"], button:not([type]), input[type="submit"]');
    await expect.soft(submit.first(), 'ROW-283: the form has a visible submit button').toBeVisible();
  } finally {
    await opened.close();
  }
});
