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
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  anonymousApi,
  approve,
  cancelOwnRequest,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setClock,
  SetupError,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { holdsValue, observePeople, topRecords, type Rec } from './records';
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

// ---------------------------------------------------------------------------------------------------
// ROW-192, every other row action (added by test-author pass, slice 1, brief test-author-22): reject on the pending
// ROW-192   page, and rename, change email, set password, change allowance, switch off and switch on on the people page,
// ROW-192   each operated after the list changed since its page loaded. The case above runs approve, switch off and the
// ROW-192   person page's cancel only.
// ROW-192 promise: REQ-008 "from it the admin approves a request, or rejects it"; REQ-020 "from it the admin creates
// ROW-192   accounts, changes a name, changes an email, sets a new password, changes an allowance and switches an
// ROW-192   account off or on" (A-031, A-044); D-046 "the people page starts its account actions (rename, change
// ROW-192   email, set password, change allowance) from each row in a dialog that posts to that account's route by id".
// ROW-192 wrong product: a row action or dialog that keeps the row's position (or re-reads the list when it opens
// ROW-192   or posts and takes the n-th entry), so after a list change the reject, the rename, the email, the
// ROW-192   password, the allowance or the switch lands on the neighbouring request or account.
// ROW-192 given, when, then — pending page: P1…P4 send pending vacations a minute apart (oldest first by REQ-008);
// ROW-192   the page loads showing all four; P1 withdraws hers (every later row moves up one); the admin rejects P3's
// ROW-192   row. Then P3's request is rejected, P2's and P4's are still pending, P1's still cancelled.
// ROW-192   People page, six phases on Cid with neighbours Bea and Dot (allowances 21, 22, 24): each phase loads the
// ROW-192   page and waits for every row, then an account named and mailed "Aa…" is created (sorted first by name or
// ROW-192   email, and first in a newest-first list: every row moves down one), then the admin operates Cid's row:
// ROW-192   (1) rename to a fresh "Cid…" name; (2) change email to a fresh one; (3) set a fresh password; (4) change
// ROW-192   the allowance to 33; (5) switch off; (6) with Bea and Dot also switched off (through the API, before the
// ROW-192   load), switch on. Then, read by id through the API: only Cid's record carries the new name, the new
// ROW-192   email and 33; every other account keeps its name, email and allowance; only Cid's sign-in changes (the
// ROW-192   new email and password sign in, the old password does not; switched off Cid does not sign in while every
// ROW-192   other account does; switched on Cid signs in while Bea and Dot still do not).
// ROW-192 controls: the control case (an approve with no change since the load acts on its row); in each phase
// ROW-192   the page draws every row and the new account exists before the action, and each effect's "before" is
// ROW-192   read first (the new name, email and 33 are on no record; Cid's new password does not sign in).
// ROW-192 technique: the neighbours that must stay untouched on both sides of the target, a fresh list change before
// ROW-192   every action (an action's own redraw cannot hide the change from the next one), fresh values per action,
// ROW-192   effects read by id. Honest limit: a list ordered oldest-account-first never moves an existing row when an
// ROW-192   account is added, and accounts cannot be removed, so on such an order the people phases cannot tell a
// ROW-192   position from an id; the pending phase can (oldest-first is the PRD's own order).
// ROW-192 cases: ROW-192 target=ROW-192.REQ-020.reject-and-every-account-action-act-on-their-row-after-the-list-changed control=ROW-192.control.a-row-action-acts-on-its-row

/** What a dialog's sending button may be named. */
const SEND = /^(save|set|change|rename|update|confirm|ok|done|submit|apply)\b/i;

/** The dialog the page opens (role dialog or alertdialog, visible). */
function openDialog(page: Page) {
  return page.getByRole('dialog').or(page.getByRole('alertdialog')).filter({ visible: true }).last();
}

/**
 * Operates one of the people page's dialog actions on `row`: presses the row's button named `opener`, waits for the
 * dialog, lets `fill` fill it, sends it (its submit button, else a button named SEND), and accepts a confirmation
 * step if one follows. A control or a dialog that is not there is a SETUP failure naming it (ROW-099 owns "it can be
 * started from the page").
 */
async function viaDialog(page: Page, row: Locator, opener: RegExp, fill: (dialog: Locator) => Promise<void>, what: string): Promise<void> {
  page.once('dialog', (d) => void d.accept().catch(() => undefined));
  try {
    await row.getByRole('button', { name: opener }).filter({ visible: true }).first().click({ timeout: 10_000 });
  } catch {
    throw new SetupError(`ROW-192 ${what}: the row has no visible button named ${opener}`);
  }
  const dialog = openDialog(page);
  try {
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new SetupError(`ROW-192 ${what}: the button opened no dialog`);
  }
  await fill(dialog);
  const submit = dialog.locator('button[type="submit"], input[type="submit"]').filter({ visible: true });
  const named = dialog.getByRole('button', { name: SEND }).filter({ visible: true });
  if ((await submit.count()) > 0) await submit.last().click();
  else if ((await named.count()) > 0) await named.last().click();
  else throw new SetupError(`ROW-192 ${what}: the dialog has no button that sends it`);
  const confirm = page.getByRole('button', { name: /^(confirm|yes)\b/i }).filter({ visible: true }).first();
  if (await confirm.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true, () => false)) await confirm.click();
}

/** Fills the dialog's visible field labelled `label` with `value`; a missing field is a SETUP failure. */
async function fillLabelled(dialog: Locator, label: RegExp, value: string, what: string): Promise<void> {
  const field = dialog.getByLabel(label).filter({ visible: true }).first();
  try {
    await field.fill(value, { timeout: 10_000 });
  } catch {
    throw new SetupError(`ROW-192 ${what}: the dialog has no field labelled ${label}`);
  }
}

/**
 * An account's own record on the people answer, by its id: the list's own entry (not a nested one) whose id field
 * (id, accountId or account_id) is the id POST /api/admin/accounts answered. None is a SETUP failure naming the id.
 */
function accountRecord(list: unknown, id: AccountId): Rec {
  const rec = topRecords(list).find((r) => Object.entries(r).some(([k, v]) => /^(id|accountId|account_id)$/.test(k) && String(v) === String(id)));
  if (!rec) throw new SetupError(`ROW-192: the people answer holds no record with the account id ${id}: ${JSON.stringify(list)?.slice(0, 300)}`);
  return rec;
}

async function signsInWith(c: { email: string; password: string }): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } })).ok();
  } finally {
    await api.dispose();
  }
}

test('ROW-192.REQ-020.reject-and-every-account-action-act-on-their-row-after-the-list-changed', async ({ browser }) => {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const opened = await openPage(browser, admin);
  const page = opened.page;
  try {
    // ---- Pending page: reject after the oldest request was withdrawn.
    const ps = [
      await createMember(admin, { name: freshName('Pam') }),
      await createMember(admin, { name: freshName('Pat') }),
      await createMember(admin, { name: freshName('Pia') }),
      await createMember(admin, { name: freshName('Pip') }),
    ];
    const sessions: Actor[] = [];
    const reqs: string[] = [];
    for (let i = 0; i < ps.length; i += 1) {
      await setClock(new Date(Date.parse(NOW) + i * 60_000).toISOString().replace('.000Z', 'Z'));
      const s = await signInMember(ps[i]);
      sessions.push(s);
      reqs.push(String(await sendRequest(s, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' })));
    }
    await setClock(new Date(Date.parse(NOW) + 10 * 60_000).toISOString().replace('.000Z', 'Z'));
    expect.soft(await loadSettled(page, PAGES.adminPending), 'ROW-192 the pending page answers').toBe(200);
    await shows(page, ps.map((p) => p.name), 'the pending page');
    await cancelOwnRequest(sessions[0], reqs[0]); // the list changes after the load: every later row moves up one
    await operateRowAction(page, rowWith(page, ps[2].name), /^reject/i);
    expect.soft(await pollUntil(() => stateOf(admin, ps[2], reqs[2]), (s) => s === 'rejected'), 'ROW-192 pending page: the third row rejected the third request').toBe('rejected');
    expect.soft(await stateOf(admin, ps[1], reqs[1]), 'ROW-192 pending page: the second request (the row above) is still pending').toBe('pending');
    expect.soft(await stateOf(admin, ps[3], reqs[3]), 'ROW-192 pending page: the fourth request (the row below) is still pending').toBe('pending');
    expect.soft(await stateOf(admin, ps[0], reqs[0]), 'ROW-192 pending page: the withdrawn request is still cancelled').toBe('cancelled');
    for (const s of sessions) await s.dispose();

    // ---- People page: the six account actions on Cid's row, each after an account was added since the load.
    const bea = await createMember(admin, { name: freshName('Bea'), email: freshEmail('bea'), allowance: 21 });
    const cid = await createMember(admin, { name: freshName('Cid'), email: freshEmail('cid'), allowance: 22 });
    const dot = await createMember(admin, { name: freshName('Dot'), email: freshEmail('dot'), allowance: 24 });
    const others: { label: string; id: AccountId; name: string; email: string; password: string; allowance: number }[] = [
      { label: 'the admin', id: admin.me.id, name: install.admin.name, email: install.admin.email, password: install.admin.password, allowance: install.admin.allowance },
      ...ps.map((p, i) => ({ label: `P${i + 1}`, id: p.id, name: p.name, email: p.email, password: p.password, allowance: p.allowance })),
      { label: 'Bea', id: bea.id, name: bea.name, email: bea.email, password: bea.password, allowance: 21 },
      { label: 'Dot', id: dot.id, name: dot.name, email: dot.email, password: dot.password, allowance: 24 },
    ];
    const target = { name: cid.name, email: cid.email, password: cid.password };
    let added = 0;

    const phase = async (what: string, act: (row: Locator) => Promise<void>) => {
      expect.soft(await loadSettled(page, PAGES.adminPeople), `ROW-192 people page (${what}) answers`).toBe(200);
      await shows(page, [bea.email, target.email, dot.email], `the people page (${what})`);
      added += 1;
      const aa = await createMember(admin, { name: freshName('Aa'), email: freshEmail('aa') }); // the list changes after the load
      others.push({ label: `Aa${added}`, id: aa.id, name: aa.name, email: aa.email, password: aa.password, allowance: aa.allowance });
      await act(rowWith(page, target.email));
    };
    const people = async () => observePeople(admin);
    const othersUnchanged = async (what: string, field: 'name' | 'email' | 'allowance') => {
      const list = await people();
      for (const o of others) {
        const rec = accountRecord(list, o.id);
        expect.soft(holdsValue(rec, o[field]), `ROW-192 people page (${what}): ${o.label}'s ${field} is unchanged (${JSON.stringify(rec)?.slice(0, 200)})`).toBe(true);
      }
    };

    // (1) rename
    const newName = freshName('Cid');
    expect.soft(holdsValue(await people(), newName), 'ROW-192 rename before: no record carries the new name').toBe(false);
    await phase('rename', (row) => viaDialog(page, row, /rename|\bname\b/i, (d) => fillLabelled(d, /name/i, newName, 'rename'), 'rename'));
    expect.soft(await pollUntil(async () => holdsValue(accountRecord(await people(), cid.id), newName), (v) => v), "ROW-192 rename: Cid's record carries the new name").toBe(true);
    await othersUnchanged('rename', 'name');
    target.name = newName;

    // (2) change email
    const newEmail = freshEmail('cid');
    expect.soft(holdsValue(await people(), newEmail), 'ROW-192 email before: no record carries the new email').toBe(false);
    await phase('change email', (row) => viaDialog(page, row, /e-?mail/i, (d) => fillLabelled(d, /e-?mail/i, newEmail, 'change email'), 'change email'));
    expect.soft(await pollUntil(async () => holdsValue(accountRecord(await people(), cid.id), newEmail), (v) => v), "ROW-192 change email: Cid's record carries the new email").toBe(true);
    await othersUnchanged('change email', 'email');
    target.email = newEmail;

    // (3) set password
    const newPassword = freshPassword();
    expect.soft(await signsInWith({ email: target.email, password: newPassword }), 'ROW-192 set password before: the new password does not sign Cid in').toBe(false);
    await phase('set password', (row) =>
      viaDialog(
        page,
        row,
        /password/i,
        async (d) => {
          const fields = d.locator('input[type="password"]').filter({ visible: true });
          if ((await fields.count()) === 0) throw new SetupError('ROW-192 set password: the dialog has no password field');
          for (let i = 0; i < (await fields.count()); i += 1) await fields.nth(i).fill(newPassword);
        },
        'set password',
      ),
    );
    expect.soft(await pollUntil(() => signsInWith({ email: target.email, password: newPassword }), (v) => v), "ROW-192 set password: Cid's row set Cid's password").toBe(true);
    expect.soft(await signsInWith({ email: target.email, password: target.password }), "ROW-192 set password: Cid's old password no longer signs in").toBe(false);
    for (const o of others) expect.soft(await signsInWith(o), `ROW-192 set password: ${o.label} still signs in with their own password`).toBe(true);
    target.password = newPassword;

    // (4) change allowance
    expect.soft(holdsValue(await people(), 33), 'ROW-192 allowance before: no record carries 33').toBe(false);
    await phase('change allowance', (row) =>
      viaDialog(
        page,
        row,
        /allowance/i,
        async (d) => {
          await fillLabelled(d, /allowance|days/i, '33', 'change allowance');
          const thisYear = d.getByLabel(/this year|current year|\b2027\b/i).filter({ visible: true });
          if ((await thisYear.count()) > 0 && (await thisYear.first().getAttribute('type')) === 'radio') await thisYear.first().check();
        },
        'change allowance',
      ),
    );
    expect.soft(await pollUntil(async () => holdsValue(accountRecord(await people(), cid.id), 33), (v) => v), "ROW-192 change allowance: Cid's record carries 33").toBe(true);
    const afterAllowance = await people();
    for (const o of others) expect.soft(holdsValue(accountRecord(afterAllowance, o.id), 33), `ROW-192 change allowance: ${o.label}'s record does not carry 33`).toBe(false);
    await othersUnchanged('change allowance', 'allowance');

    // (5) switch off
    await phase('switch off', (row) => operateRowAction(page, row, /switch(ed)? off|turn off/i));
    expect.soft(await pollUntil(() => signsInWith(target), (ok) => !ok), "ROW-192 switch off: Cid's row switched Cid off").toBe(false);
    for (const o of others) expect.soft(await signsInWith(o), `ROW-192 switch off: ${o.label} still signs in`).toBe(true);

    // (6) switch on, with both neighbours switched off too
    await switchAccount(admin, bea.id, false);
    await switchAccount(admin, dot.id, false);
    await phase('switch on', (row) => operateRowAction(page, row, /^(switch(ed)? on|turn on|reactivate|activate|enable)\b/i));
    expect.soft(await pollUntil(() => signsInWith(target), (ok) => ok), "ROW-192 switch on: Cid's row switched Cid on").toBe(true);
    expect.soft(await signsInWith(bea), 'ROW-192 switch on: Bea (switched off) is still off').toBe(false);
    expect.soft(await signsInWith(dot), 'ROW-192 switch on: Dot (switched off) is still off').toBe(false);
  } finally {
    await opened.close();
    await admin.dispose();
  }
});
