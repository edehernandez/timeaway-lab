// Purpose: ledger tests for ROW-192 (REQ-008, REQ-020, REQ-021) — every row action on the pending, people and person pages acts on the request or account shown in its row, by id, even after the list changed since the page loaded.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, own cancel), fresh per run; the pages operated in the browser through the engine door (openPage), the effects read back through the API.
//
// ROW-192 promise: REQ-008 "from it the admin approves a request"; REQ-020 "from it the admin … switches an
// ROW-192   account off or on"; REQ-021 "a cancel action on each approved request that still has a Monday to Friday
// ROW-192   day from today on" — each action acts on the request or account its row shows (the row's reading).
// ROW-192 wrong product: a row action that sends the row's position (or re-fetches the list and takes the n-th
// ROW-192   item), so once a request is withdrawn, an account added or a request sent after the page loaded, the
// ROW-192   action lands on the neighbouring request or account.
// ROW-192 given, when, then — pending page: P1, P2, P3 each send a pending vacation, oldest first; the admin's
// ROW-192   page loads showing all three; P1 then withdraws theirs; the admin approves P2's row. Then P2's request
// ROW-192   is approved, P3's still pending, P1's still cancelled.
// ROW-192   People page: Bea, Cid, Dot exist and the page loads showing them; then an account "Abe" (sorted first)
// ROW-192   is created; the admin switches Cid's row off. Then Cid cannot sign in and Bea, Dot and Abe can.
// ROW-192   Person page: Q holds approved vacations in April, May and June; the admin's page for Q loads showing
// ROW-192   them; then Q sends a July vacation (newest, drawn first); the admin cancels the May row. Then the May
// ROW-192   request is cancelled, April and June are approved, July is pending.
// ROW-192 controls: the control case — the same pending-page approve with no change since the load acts on
// ROW-192   its row — shows the page, the row, the button and the confirmation are reached; each phase also waits
// ROW-192   until the page draws every row before the list changes.
// ROW-192 technique: the neighbour that must stay untouched (the item an off-by-one or re-indexed action would
// ROW-192   hit), one change of the list per page after its load, effects read by id through the API.
// ROW-192 cases: ROW-192 target=ROW-192.REQ-008.row-actions-act-on-their-row-after-the-list-changed control=ROW-192.control.a-row-action-acts-on-its-row
import { test, expect, type Page } from '@playwright/test';
import {
  anonymousApi,
  approve,
  cancelOwnRequest,
  createMember,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type Actor,
  type Member,
} from './harness';
import { byId, readPersonRequests } from './request-records';
import { loadSettled, monthMarker, operateRowAction, pollUntil, rowWith } from './page-rows';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

async function stateOf(admin: Actor, person: Member, id: string): Promise<string | undefined> {
  return byId(await readPersonRequests(admin, person.id), id)?.state;
}

async function signsIn(m: Member): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email: m.email, password: m.password } })).ok();
  } finally {
    await api.dispose();
  }
}

async function shows(page: Page, texts: (string | RegExp)[], what: string): Promise<void> {
  for (const t of texts) await expect(rowWith(page, t), `ROW-192 ${what} draws the row of ${t}`).toBeVisible({ timeout: 15_000 });
}

test('ROW-192.control.a-row-action-acts-on-its-row', async ({ browser }) => {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const opened = await openPage(browser, admin);
  try {
    const p1 = await createMember(admin, { name: freshName('Ana') });
    const p2 = await createMember(admin, { name: freshName('Ben') });
    const ids: string[] = [];
    for (const p of [p1, p2]) {
      const s = await signInMember(p);
      ids.push(String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' })));
      await s.dispose();
    }
    expect(await loadSettled(opened.page, PAGES.adminPending), 'ROW-192 control: the pending page answers').toBe(200);
    await shows(opened.page, [p1.name, p2.name], 'control: the pending page');
    await operateRowAction(opened.page, rowWith(opened.page, p2.name), /^approve/i);
    expect.soft(await pollUntil(() => stateOf(admin, p2, ids[1]), (s) => s === 'approved'), 'ROW-192 control: Ben\'s request is approved').toBe('approved');
    expect.soft(await stateOf(admin, p1, ids[0]), 'ROW-192 control: Ana\'s request is still pending').toBe('pending');
  } finally {
    await opened.close();
    await admin.dispose();
  }
});

test('ROW-192.REQ-008.row-actions-act-on-their-row-after-the-list-changed', async ({ browser }) => {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const opened = await openPage(browser, admin);
  const page = opened.page;
  try {
    // Pending page.
    const ps = [await createMember(admin, { name: freshName('Ana') }), await createMember(admin, { name: freshName('Ben') }), await createMember(admin, { name: freshName('Cal') })];
    const sessions: Actor[] = [];
    const reqs: string[] = [];
    for (const p of ps) {
      const s = await signInMember(p);
      sessions.push(s);
      reqs.push(String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' })));
    }
    expect.soft(await loadSettled(page, PAGES.adminPending), 'ROW-192 the pending page answers').toBe(200);
    await shows(page, ps.map((p) => p.name), 'the pending page');
    await cancelOwnRequest(sessions[0], reqs[0]); // the list changes after the load
    await operateRowAction(page, rowWith(page, ps[1].name), /^approve/i);
    expect.soft(await pollUntil(() => stateOf(admin, ps[1], reqs[1]), (s) => s === 'approved'), 'ROW-192 pending page: Ben\'s row approved Ben\'s request').toBe('approved');
    expect.soft(await stateOf(admin, ps[2], reqs[2]), 'ROW-192 pending page: Cal\'s request is still pending').toBe('pending');
    expect.soft(await stateOf(admin, ps[0], reqs[0]), 'ROW-192 pending page: Ana\'s request is still cancelled').toBe('cancelled');
    for (const s of sessions) await s.dispose();

    // People page.
    const bea = await createMember(admin, { name: freshName('Bea') });
    const cid = await createMember(admin, { name: freshName('Cid') });
    const dot = await createMember(admin, { name: freshName('Dot') });
    expect.soft(await loadSettled(page, PAGES.adminPeople), 'ROW-192 the people page answers').toBe(200);
    await shows(page, [bea.name, cid.name, dot.name], 'the people page');
    const abe = await createMember(admin, { name: freshName('Abe') }); // the list changes after the load
    await operateRowAction(page, rowWith(page, cid.name), /switch(ed)? off|turn off/i);
    expect.soft(await pollUntil(() => signsIn(cid), (ok) => !ok), 'ROW-192 people page: Cid\'s row switched Cid off').toBe(false);
    // Every other account, the neighbours on either side of Cid in any order the page may draw (by name or by age).
    for (const [label, m] of [
      ['Ana', ps[0]],
      ['Ben', ps[1]],
      ['Cal', ps[2]],
      ['Bea', bea],
      ['Dot', dot],
      ['Abe', abe],
    ] as const) {
      expect.soft(await signsIn(m), `ROW-192 people page: ${label} still signs in`).toBe(true);
    }

    // Person page.
    const q = await createMember(admin, { name: freshName('Quin') });
    const qs = await signInMember(q);
    const days = [
      ['2027-04-12', '2027-04-13'],
      ['2027-05-10', '2027-05-11'],
      ['2027-06-14', '2027-06-15'],
    ];
    const approved: string[] = [];
    for (const [firstDay, lastDay] of days) {
      const id = String(await sendRequest(qs, { kind: 'vacation', firstDay, lastDay }));
      await approve(admin, id);
      approved.push(id);
    }
    expect.soft(await loadSettled(page, PAGES.adminPerson(q.id)), 'ROW-192 the person page answers').toBe(200);
    await shows(page, days.map(([d]) => monthMarker(d)), 'the person page');
    const july = String(await sendRequest(qs, { kind: 'vacation', firstDay: '2027-07-05', lastDay: '2027-07-06' })); // the list changes after the load
    await operateRowAction(page, rowWith(page, monthMarker('2027-05-10')), /^cancel/i);
    expect.soft(await pollUntil(() => stateOf(admin, q, approved[1]), (s) => s === 'cancelled'), 'ROW-192 person page: the May row cancelled the May request').toBe('cancelled');
    expect.soft(await stateOf(admin, q, approved[0]), 'ROW-192 person page: the April request is still approved').toBe('approved');
    expect.soft(await stateOf(admin, q, approved[2]), 'ROW-192 person page: the June request is still approved').toBe('approved');
    expect.soft(await stateOf(admin, q, july), 'ROW-192 person page: the July request is still pending').toBe('pending');
    await qs.dispose();
  } finally {
    await opened.close();
    await admin.dispose();
  }
});
