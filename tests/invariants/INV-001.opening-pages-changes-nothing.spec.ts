// Purpose: ledger tests for ROW-203 (INV-001, REQ-017) — opening a page never changes a request or allowance record: no read expires, settles or rewrites a request, and no read materialises a year's allowance.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, allowance), fresh per run; pages opened in the browser through the engine door (openPage); the team clock moved through the harness (setClock) in Pacific/Auckland.
//
// ROW-203 promise: the row: opening a page never changes a request or allowance record; from INV-001 (days left
// ROW-203   are the allowance minus approved days "after every approval, rejection, cancellation, …, allowance
// ROW-203   change" — after those writes, and no others), REQ-009 fail-if (6) "a pending request changes state by
// ROW-203   itself when its days pass", and D-025 (a year's allowance is computed from the list of changes; its
// ROW-203   predecessor D-019 said it outright: "nothing is created when a year begins and no read writes").
// ROW-203 wrong product: a page load that "tidies": expires a pending request whose days have passed, marks an
// ROW-203   approved one taken, or writes next year's allowance row the first time a balance shows next year — a
// ROW-203   hidden write that later makes a change starting this year miss next year (the materialised row wins).
// ROW-203 given: at team Mon 2027-11-01 P (allowance 25) sends R1 vacation 11-15..16 (left pending), R2
// ROW-203   vacation 11-22..23 (approved), R3 sick 12-20..21 (pending); the clock moves to Mon 2027-12-06, R1's
// ROW-203   days now past. when: every page P and the admin can open, and every read route behind them (and the
// ROW-203   confirm steps' effect reads), are opened twice. then: each of P's request records and P's and the
// ROW-203   admin's balances read exactly as before; R1 is still pending, R2 approved, R3 pending; and after the
// ROW-203   admin sets P's allowance to 30 starting this year, P's 2028 shows 30 and 2027 shows 28.
// ROW-203 controls: the control case — the same allowance change on an account no page was opened for shows
// ROW-203   2028 at 30 — so the target's 2028 figure separates a read that wrote from a broken allowance rule.
// ROW-203 technique: before-and-after over every record the reads could touch; the allowance probe makes a
// ROW-203   hidden write visible; the clock past the pending request's days reaches the "expire on read" case.
// ROW-203 cases: ROW-203 target=ROW-203.INV-001.opening-pages-changes-no-request-or-allowance-record control=ROW-203.control.an-allowance-change-reaches-next-year-with-no-page-opened
import { test, expect, type Browser } from '@playwright/test';
import {
  approve,
  createMember,
  openPage,
  PAGES,
  readBalance,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  type Actor,
} from './harness';
import { byId, readPersonRequests } from './request-records';
import { loadSettled } from './page-rows';

const T_SEND = '2027-10-31T20:00:00Z'; // Mon 2027-11-01 09:00 Pacific/Auckland
const T_READ = '2027-12-05T20:00:00Z'; // Mon 2027-12-06 09:00

async function openAll(browser: Browser, actor: Actor, pages: string[]): Promise<void> {
  const opened = await openPage(browser, actor);
  try {
    for (const address of pages) await loadSettled(opened.page, address);
  } finally {
    await opened.close();
  }
}

async function getAll(actor: Actor, routes: string[]): Promise<void> {
  for (const r of routes) await actor.api.get(r);
}

test('ROW-203.control.an-allowance-change-reaches-next-year-with-no-page-opened', async () => {
  const install = await resetProduct({ now: T_READ });
  const admin = await signIn(install.admin);
  try {
    const q = await createMember(admin, { allowance: 25 });
    await setAllowance(admin, q.id, 30);
    const qs = await signInMember(q);
    try {
      const years = (await readBalance(qs)).years;
      expect.soft(years.find((y) => y.year === 2027)?.daysLeft, 'ROW-203 control: 2027 shows 30').toBe(30);
      expect.soft(years.find((y) => y.year === 2028)?.daysLeft, 'ROW-203 control: 2028 shows 30').toBe(30);
    } finally {
      await qs.dispose();
    }
  } finally {
    await admin.dispose();
  }
});

test('ROW-203.INV-001.opening-pages-changes-no-request-or-allowance-record', async ({ browser }) => {
  const install = await resetProduct({ now: T_SEND });
  const admin = await signIn(install.admin);
  const p = await createMember(admin, { allowance: 25 });
  const ps = await signInMember(p);
  try {
    const r1 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-11-15', lastDay: '2027-11-16' }));
    const r2 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-11-22', lastDay: '2027-11-23' }));
    await approve(admin, r2);
    const r3 = String(await sendRequest(ps, { kind: 'sick', firstDay: '2027-12-20', lastDay: '2027-12-21' }));
    await setClock(T_READ);

    const snapshot = async () => ({
      records: JSON.stringify((await readPersonRequests(admin, p.id)).map((r) => r.raw)),
      pBalance: JSON.stringify(await readBalance(ps)),
      adminBalance: JSON.stringify(await readBalance(admin)),
    });
    const before = await snapshot();

    const id = encodeURIComponent(String(p.id));
    for (let round = 1; round <= 2; round += 1) {
      await openAll(browser, ps, [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password]);
      await getAll(ps, ['/api/me', '/api/requests', '/api/balance', '/api/calendar?year=2027&month=11', '/api/calendar?year=2027&month=12', '/api/calendar?year=2028&month=1']);
      await openAll(browser, admin, [PAGES.home, PAGES.calendar, PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(p.id)]);
      await getAll(admin, [
        '/api/admin/pending',
        '/api/admin/people',
        `/api/admin/people/${id}/requests`,
        `/api/admin/people/${id}/history`,
        `/api/admin/requests/${encodeURIComponent(r1)}/effect?action=approve`,
        `/api/admin/requests/${encodeURIComponent(r1)}/effect?action=reject`,
        `/api/admin/requests/${encodeURIComponent(r2)}/effect?action=cancel`,
        `/api/admin/requests/${encodeURIComponent(r3)}/effect?action=approve`,
        `/api/admin/accounts/${id}/effect?action=switch-off`,
        '/api/balance',
        '/api/calendar?year=2027&month=12',
      ]);
    }

    const after = await snapshot();
    expect.soft(after.records, 'ROW-203 P\'s request records read exactly as before the pages were opened').toBe(before.records);
    expect.soft(after.pBalance, 'ROW-203 P\'s balance reads exactly as before').toBe(before.pBalance);
    expect.soft(after.adminBalance, 'ROW-203 the admin\'s balance reads exactly as before').toBe(before.adminBalance);
    const list = await readPersonRequests(admin, p.id);
    expect.soft([r1, r2, r3].map((x) => byId(list, x)?.state), 'ROW-203 R1 (days past) still pending, R2 approved, R3 pending').toEqual([
      'pending',
      'approved',
      'pending',
    ]);

    await setAllowance(admin, p.id, 30);
    const years = (await readBalance(ps)).years;
    expect.soft(years.find((y) => y.year === 2027)?.daysLeft, 'ROW-203 after a change starting this year: 2027 shows 28').toBe(28);
    expect.soft(years.find((y) => y.year === 2028)?.daysLeft, 'ROW-203 after a change starting this year: 2028 shows 30 (no read wrote a 2028 allowance)').toBe(30);
  } finally {
    await ps.dispose();
    await admin.dispose();
  }
});
