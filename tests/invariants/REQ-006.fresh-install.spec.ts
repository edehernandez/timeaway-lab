// Purpose: ledger tests for ROW-211 (REQ-006, REQ-008, REQ-012, REQ-020, CON-001) — on a fresh install with only the setup admin and no requests, every page shows an orderly empty state, and the admin has a name and an allowance and can send their own request.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); the fresh install is POST /api/__test/reset through harness.ts, which creates the one admin as the setup command does (D-011, D-029).
//
// Boundary (R6): what each page shows is paint, proved in the browser as the admin; the admin's name, allowance and
// own send are rules, read at the HTTP harness (GET /api/me, GET /api/balance, POST /api/requests).
import { test, expect, type Page } from '@playwright/test';
import { openPage, sendRequest } from './harness';
import { disposeAll, freshInt, freshTeam, ownRequests, pagesFor, settle, textLines } from './robustness';

test.afterEach(disposeAll);

const DISORDER = /\b(undefined|NaN|null)\b|\[object Object\]|Invalid Date|\bError\b|\bstack\b/;
const EMPTY_OWN = /\bno requests\b|haven'?t (sent|made) any|not sent any|nothing (sent|here|yet)|no .*requests yet/i;
const EMPTY_PENDING = /\bno (pending )?requests\b|nothing (is )?(pending|to (decide|approve|review))|no .*pending/i;

async function linesAt(page: Page, path: string): Promise<{ status: number | undefined; lines: string[] }> {
  const r = await page.goto(path);
  await settle(page);
  return { status: r?.status(), lines: await textLines(page) };
}

// ---------------------------------------------------------------------------------------------------
// ROW-211 promise: the row — a fresh install (only the setup admin, no requests): every page an orderly empty state;
// ROW-211   the admin has a name and an allowance and can send their own request. CON-001 (the one admin, created at
// ROW-211   setup), REQ-006 (with no requests the own page says so and offers to send one), REQ-008 (an empty pending
// ROW-211   page says so), REQ-012, REQ-020 (the people page lists every account, the admin's too).
// ROW-211 wrong product: a setup that creates the admin without a display name or allowance row, so the header
// ROW-211   reads "undefined", the people page shows "NaN days left" and the admin's send is refused for want of an
// ROW-211   allowance; or empty pages that render a bare table header with no message.
// ROW-211 given: a reset with a fresh admin (fresh name, email, allowance A in 10..40), team today Mon 8 Mar 2027.
// ROW-211 when: the admin reads /api/me and /api/balance, opens every page, sends their own vacation for 15..16 Mar,
// ROW-211   and reopens / and /admin/pending. then: me carries the admin's name, 2027 has A days left; every page
// ROW-211   answers 200 with no console error and no undefined/NaN/null/Invalid Date/Error text; / says it has no
// ROW-211   requests and links to /requests/new; /admin/pending says nothing is pending; /admin/people shows the admin's
// ROW-211   name, email and A; the send is recorded, the admin's request then shows on /admin/pending, and both empty
// ROW-211   messages are gone.
// ROW-211 controls: the control case shows the reset's admin signs in and GET /api/me answers isAdmin — the fresh
// ROW-211   install is there.
// ROW-211 technique: before/after around the admin's first send — the empty-state lines must disappear once a request
// ROW-211   exists, so static text cannot pass for an empty state; the fresh A must appear, so no fixed figure can.
// ROW-211 cases: ROW-211 target=ROW-211.REQ-006.a-fresh-install-shows-orderly-empty-pages-and-the-admin-can-send control=ROW-211.control.the-setup-admin-signs-in
test('ROW-211.control.the-setup-admin-signs-in', async () => {
  const { admin } = await freshTeam();
  expect(admin.me.isAdmin, 'ROW-211 control: the reset created the admin').toBe(true);
});

test('ROW-211.REQ-006.a-fresh-install-shows-orderly-empty-pages-and-the-admin-can-send', async ({ browser }) => {
  const allowance = freshInt(10, 40);
  const { install, admin } = await freshTeam({ adminAllowance: allowance });

  const me = (await (await admin.api.get('/api/me')).json()) as { name?: string };
  expect.soft(me.name, 'ROW-211: the admin has the display name given at setup').toBe(install.admin.name);
  const bal = (await (await admin.api.get('/api/balance')).json()) as { years?: { year: number; daysLeft: number }[] };
  expect.soft(bal.years?.find((y) => Number(y.year) === 2027)?.daysLeft, `ROW-211: the admin has the allowance ${allowance} in 2027`).toBe(allowance);

  const opened = await openPage(browser, admin);
  const page = opened.page;
  const seen = new Map<string, string[]>();
  const count = (lines: string[], s: string) => lines.join('\n').split(s).length - 1;
  try {
    for (const path of pagesFor('admin', admin.me.id)) {
      const errorsBefore = opened.consoleErrors.length;
      const { status, lines } = await linesAt(page, path);
      seen.set(path, lines);
      expect.soft(status, `ROW-211 ${path}: answers 200`).toBe(200);
      expect.soft(opened.consoleErrors.slice(errorsBefore), `ROW-211 ${path}: no console error`).toEqual([]);
      expect.soft(lines.filter((l) => DISORDER.test(l)), `ROW-211 ${path}: no disorder in the text`).toEqual([]);
      if (path === '/') {
        expect.soft(lines.some((l) => EMPTY_OWN.test(l)), `ROW-211 /: says there are no requests (${JSON.stringify(lines)})`).toBe(true);
        const offer = page.locator('a[href$="/requests/new"]').or(page.getByRole('button', { name: /send|new request/i }));
        expect.soft(await offer.count(), 'ROW-211 /: offers to send a request').toBeGreaterThan(0);
      }
      if (path === '/admin/pending') {
        expect.soft(lines.some((l) => EMPTY_PENDING.test(l)), `ROW-211 /admin/pending: says nothing is pending (${JSON.stringify(lines)})`).toBe(true);
      }
      if (path === '/admin/people') {
        const text = lines.join('\n');
        expect.soft(text.includes(install.admin.name), "ROW-211 /admin/people: lists the admin's name").toBe(true);
        expect.soft(text.toLowerCase().includes(install.admin.email), "ROW-211 /admin/people: lists the admin's email").toBe(true);
        expect.soft(new RegExp(`\\b${allowance}\\b`).test(text), `ROW-211 /admin/people: shows the allowance ${allowance}`).toBe(true);
      }
    }

    await sendRequest(admin, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' });
    expect.soft(await ownRequests(admin), "ROW-211: the admin's own request is recorded").toHaveLength(1);
    const own = await linesAt(page, '/');
    expect.soft(own.lines.filter((l) => EMPTY_OWN.test(l)), 'ROW-211 / after the send: the empty message is gone').toEqual([]);
    const pending = await linesAt(page, '/admin/pending');
    expect.soft(pending.lines.filter((l) => EMPTY_PENDING.test(l)), 'ROW-211 /admin/pending after the send: the empty message is gone').toEqual([]);
    expect.soft(
      count(pending.lines, install.admin.name),
      "ROW-211 /admin/pending after the send: the admin's request is listed (the name shows once more than in the header alone)",
    ).toBeGreaterThan(count(seen.get('/admin/pending') ?? [], install.admin.name));
  } finally {
    await opened.close();
  }
});
