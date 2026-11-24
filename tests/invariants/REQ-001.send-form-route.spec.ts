// Purpose: ledger test for ROW-281 (REQ-001) — signed in, /requests/new shows the send form: the kind (vacation or sick, nothing preselected), the first day and the last day, and a Send button.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, an account with its own chosen password), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): what the route draws is paint, proved in the browser at D-029's /requests/new. That a send without
// a kind is refused, and what a send records, are other rows' (ROW-205 and REQ-001's rules at the HTTP harness).
// Form readings, D-029's plain-word labels as robustness.ts reads them: the form is the <form> holding a field
// labelled "First day"; the kind is radios named Vacation and Sick, or a select labelled Kind; the days are the
// fields labelled "First day" and "Last day"; Send is the form's button whose name begins "Send".
//
// ROW-281 promise: REQ-001 "a signed-in person sends a request for themselves with a kind, vacation or sick, and a
// ROW-281   first and last day"; fail-if (1) "a request is created with a kind other than vacation or sick"; the row:
// ROW-281   /requests/new shows that form, nothing preselected. Authority: REQ-001 (A-017, A-026).
// ROW-281 wrong product: no page at /requests/new (404) or a redirect to /; a form whose Vacation radio, or a select
// ROW-281   with no empty first option, starts chosen; a kind list with a third kind ("Personal"); a single-day form
// ROW-281   with no last day; a form submitted by a "Submit" button; the form drawn outside the header-wrapped page.
// ROW-281 given: member M (own password chosen), team today Mon 2027-03-08. when: M opens /requests/new and reads the
// ROW-281   form untouched. then: 200 at /requests/new with one header; the form is there; its kind choices are exactly
// ROW-281   Vacation and Sick and neither is chosen; a First day field and a separate Last day field are visible; a
// ROW-281   visible button named Send is in the form.
// ROW-281 controls: the control case — the browser context carries M's session (GET /api/me answers M's id) and
// ROW-281   /sign-in loads as a page in another context — so a red target is the route, not the session or the engine.
// ROW-281 technique: the exact set of kind choices (not "Vacation is there"), so a third kind fails; the untouched
// ROW-281   form's chosen kind read from the control's own state (checked radio, selected option).
// ROW-281 cases: ROW-281 target=ROW-281.REQ-001.new-request-route-shows-the-send-form control=ROW-281.control.member-session-in-the-browser
import { test, expect, type Locator } from '@playwright/test';
import { createMember, openPage, PAGES, resetProduct, signIn, signInMember, type Actor } from './harness';
import { chosenKind, dayFields, kindControls, sendButton } from './robustness';
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

/** The kind choices the form offers, lower-cased: its radios' names, else its Kind select's non-empty options. */
async function kindChoices(form: Locator): Promise<string[]> {
  const radios = form.getByRole('radio');
  const n = await radios.count();
  if (n > 0) {
    const names: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = radios.nth(i);
      const name = await r.evaluate((el) => {
        const input = el as HTMLInputElement;
        const label = input.labels?.[0]?.innerText ?? el.getAttribute('aria-label') ?? '';
        return label.replace(/\s+/g, ' ').trim();
      });
      names.push(name.toLowerCase());
    }
    return names.sort();
  }
  const select = kindControls(form).select;
  if ((await select.count()) === 0) return [];
  return (
    await select.first().evaluate((el) =>
      Array.from((el as HTMLSelectElement).options)
        .filter((o) => o.value !== '' && !o.disabled)
        .map((o) => (o.label || o.text).replace(/\s+/g, ' ').trim().toLowerCase()),
    )
  ).sort();
}

test('ROW-281.control.member-session-in-the-browser', async ({ browser }) => {
  const m = await member();
  const opened = await openPage(browser, m.actor);
  const anon = await openPage(browser, 'anonymous');
  try {
    const me = await opened.page.request.get('/api/me');
    expect(me.status(), 'ROW-281 control: the browser context carries a session').toBe(200);
    expect(String((await me.json()).id), "ROW-281 control: the session is M's").toBe(m.id);
    const signInRead = await openRoute(anon.page, PAGES.signIn);
    expect(signInRead.status, 'ROW-281 control: the engine loads a page of the product (/sign-in)').toBe(200);
  } finally {
    await anon.close();
    await opened.close();
  }
});

test('ROW-281.REQ-001.new-request-route-shows-the-send-form', async ({ browser }) => {
  const m = await member();
  const opened = await openPage(browser, m.actor);
  const page = opened.page;
  try {
    const read = await openRoute(page, PAGES.newRequest);
    expect.soft(routeProblems(read, PAGES.newRequest), 'ROW-281: /requests/new is the page, inside the header').toEqual([]);

    const form = page.locator('form').filter({ has: page.getByLabel(/first day/i) }).first();
    await expect.soft(form, 'ROW-281: /requests/new draws the send form (a form with a First day field)').toBeVisible({ timeout: 10_000 });

    expect.soft(await kindChoices(form), 'ROW-281: the kind choices are exactly Vacation and Sick').toEqual(['sick', 'vacation']);
    expect.soft(await chosenKind(form), 'ROW-281: no kind is chosen on the untouched form').toBeNull();

    const days = dayFields(form);
    await expect.soft(days.first, 'ROW-281: the form has a First day field').toBeVisible();
    await expect.soft(days.last, 'ROW-281: the form has a Last day field').toBeVisible();
    const lastHandle = await days.last.elementHandle({ timeout: 2_000 }).catch(() => null);
    const distinct = lastHandle === null ? false : await days.first.evaluate((a, b) => a !== b, lastHandle).catch(() => false);
    expect.soft(distinct, 'ROW-281: the First day and the Last day are two separate fields').toBe(true);

    await expect.soft(sendButton(form), 'ROW-281: the form has a button named Send').toBeVisible();
  } finally {
    await opened.close();
  }
});
