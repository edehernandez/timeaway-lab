// Purpose: ledger test for ROW-029 (REQ-006) — with no requests of their own, the person's own requests page says so and offers a way to send one; the message goes once a request exists.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, requests), fresh names per run.
//
// ROW-029 promise: REQ-006 "with no requests it says so and offers to send one"; fail-if (5) "the empty page shows a
// ROW-029   bare list with no message and no way to send a request". The page is D-029's "/" (the person's own
// ROW-029   requests page) and the way to send is a control reaching D-029's /requests/new.
// ROW-029 wrong product: an empty table or list with only its headings; a message shown only when the whole team
// ROW-029   has no requests (so a colleague's request hides it); a static sentence that stays when requests exist.
// ROW-029 given: the admin has sent a request of their own (the team is not empty) and a fresh member has sent none.
// ROW-029   when: the member, signed in, loads "/". then: the page's text says there are no requests (a sentence of
// ROW-029   the empty-state kind: "no … requests", "not sent any …", "nothing here yet"), and a visible link leads to
// ROW-029   /requests/new or a button takes the browser there; after the member sends one request and the page is
// ROW-029   reloaded, that same sentence is gone.
// ROW-029 controls: the control case loads "/" as the member and gets the page's own 200 at "/" (not a redirect to
// ROW-029   /sign-in or /password), so the target's failures are about the empty state, not an unreachable page.
// ROW-029 technique: browser — the promise is a message and a control on the page (R6: paint and operation); before
// ROW-029   and after: the message must be present with no requests and absent once one exists, so a static sentence
// ROW-029   fails; a neighbour's request as the decoy for "empty".
// ROW-029 cases: ROW-029 target=ROW-029.REQ-006.empty-own-requests-page-says-so-and-offers-to-send-one control=ROW-029.control.member-home-answers-200
import { test, expect, type Page } from '@playwright/test';
import { createMember, freshName, openPage, PAGES, sendRequest, signInMember } from './harness';
import { freshInstall, minutesAfter, sendAt } from './lists';

/** Tuesday 2027-03-02 09:00 in the team zone. */
const T0 = '2027-03-01T20:00:00Z';

/** A sentence of the empty-state kind. */
const EMPTY =
  /\b(?:no|not any|none|nothing)\b[^.!?\n]{0,40}\brequests?\b|\b(?:haven['’]?t|have not|not yet)\b[^.!?\n]{0,40}\b(?:sent|made|requested|asked|any)\b|\bnothing (?:here|yet)\b/i;

async function setup029() {
  const w = await freshInstall(T0, '2027-03-02');
  await sendAt(w.admin, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const member = await createMember(w.admin, { name: freshName('Omar') });
  const me = await signInMember(member);
  return { ...w, me, close: async () => { await me.dispose(); await w.close(); } };
}

async function loadHome(page: Page) {
  const res = await page.goto(PAGES.home);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return res;
}

test('ROW-029.control.member-home-answers-200', async ({ browser }) => {
  const s = await setup029();
  const opened = await openPage(browser, s.me);
  try {
    const res = await loadHome(opened.page);
    expect(res?.status(), 'ROW-029 control: "/" answers the page itself').toBe(200);
    expect(new URL(opened.page.url()).pathname, 'ROW-029 control: the member stays on "/"').toBe(PAGES.home);
  } finally {
    await opened.close();
    await s.close();
  }
});

test('ROW-029.REQ-006.empty-own-requests-page-says-so-and-offers-to-send-one', async ({ browser }) => {
  const s = await setup029();
  const opened = await openPage(browser, s.me);
  const page = opened.page;
  try {
    const res = await loadHome(page);
    expect(res?.status(), 'ROW-029: "/" is reached (setup)').toBe(200);

    // The message: a sentence saying there are no requests.
    const before = await page.locator('body').innerText();
    const said = EMPTY.exec(before)?.[0] ?? null;
    expect.soft(said, `ROW-029: the empty page says there are no requests; page text: ${before.slice(0, 400)}`).not.toBeNull();

    // A way to send one: a visible link to /requests/new, or a button that takes the browser there.
    const visibleTargets = await page.locator('a[href]').evaluateAll((els) =>
      els
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
        })
        .map((e) => new URL(e.getAttribute('href') as string, document.baseURI).pathname),
    );
    let way = visibleTargets.includes(PAGES.newRequest);
    if (!way) {
      const button = page.getByRole('button', { name: /request|send|new/i }).first();
      if ((await button.count()) > 0 && (await button.isVisible())) {
        await button.click();
        way = await page.waitForURL((u) => u.pathname === PAGES.newRequest, { timeout: 5_000 }).then(
          () => true,
          () => false,
        );
        await loadHome(page);
      }
    }
    expect.soft(way, `ROW-029: the empty page offers a way to /requests/new; visible links: ${visibleTargets.join(', ')}`).toBe(true);

    // After: once the member has a request, the same sentence is gone.
    if (said !== null) {
      await sendRequest(s.me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
      await loadHome(page);
      const after = await page.locator('body').innerText();
      expect.soft(after.includes(said), `ROW-029: with a request listed the page no longer says "${said}"`).toBe(false);
    }
  } finally {
    await opened.close();
    await s.close();
  }
});
