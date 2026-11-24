// Purpose: ledger tests for ROW-040 and ROW-042 (REQ-008) — on the admin's pending page /admin/pending, a request is approved or rejected from its own row and every other is left unchanged; with nothing pending the page says so.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, requests, a decision), fresh names per run.
//
// Boundary (R6): both promises are operation and paint on the page, so both run in the browser through the
// harness's engine door (openPage, signed in through the actor door); effects are read back at the HTTP harness
// (GET /api/requests per person, GET /api/admin/pending, through lists.ts). Names come from distinct labels
// (Xavi, Yara, Zeno, Wren) so no fresh name is a substring of another.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { approve, createMember, freshName, openPage, PAGES, sendRequest, signInMember, type Actor, type AccountId } from './harness';
import { freshInstall, hasString, idsOf, minutesAfter, readOwnRequests, readPending, recordOf, sendAt, show, statesOf, type State } from './lists';

/** Tuesday 2027-03-02 09:00 in the team zone (Monday 20:00 UTC). */
const T0 = '2027-03-01T20:00:00Z';
const world = () => freshInstall(T0, '2027-03-02');

async function loadPending(page: Page) {
  const res = await page.goto(PAGES.adminPending);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return res;
}

/** True when `done` holds within `timeout` ms (a bounded poll, no fixed sleep). */
async function settle(done: () => Promise<boolean>, timeout: number): Promise<boolean> {
  try {
    await expect.poll(done, { timeout }).toBe(true);
    return true;
  } catch {
    return false;
  }
}

async function stateOf(actor: Actor, id: AccountId): Promise<Set<State>> {
  const rec = recordOf(await readOwnRequests(actor), id);
  return rec ? statesOf(rec) : new Set();
}

// =====================================================================================================
// ROW-040 — a request is approved or rejected from the page, exactly that one
// =====================================================================================================
// ROW-040 promise: REQ-008 "from it the admin approves a request, or rejects it"; fail-if (4) "a request cannot be
// ROW-040   approved or rejected from the page"; the row's case: with several pending, approving the request in one row
// ROW-040   approves exactly that request and leaves every other unchanged. Authority: REQ-008 arm 4, A-006 (the admin's
// ROW-040   own requests are on the page and decided like anyone's).
// ROW-040 wrong product: the page lists requests with no controls; its Approve button acts on the first row, or on
// ROW-040   every row, or on the wrong request id; Reject approves; deciding one request also changes another's days.
// ROW-040 given: four pending requests sent in this order — Zeno's, Xavi's, Yara's, then the admin's own — so Xavi's
// ROW-040   row is not the first. when: the admin, in the browser at /admin/pending, operates the Approve control in the
// ROW-040   row carrying Xavi's name (and its confirmation step, if the page asks), then the Reject control in Yara's row.
// ROW-040   then: Xavi's request is approved, Yara's rejected; Zeno's and the admin's own are still pending with their
// ROW-040   days as sent, still on the pending list; Xavi's and Yara's are off it.
// ROW-040 controls: the control case loads /admin/pending as the admin and gets the page's 200 with Xavi's, Yara's and
// ROW-040   Zeno's names drawn — the rows exist to operate.
// ROW-040 technique: browser operation of the real controls (R6), the row located as the one element carrying exactly
// ROW-040   one person's fresh name and a button; the neighbouring requests as the isolation check; effects read at the
// ROW-040   HTTP harness after a bounded wait.
// ROW-040 cases: ROW-040 target=ROW-040.REQ-008.approve-and-reject-from-the-row-change-exactly-that-request control=ROW-040.control.pending-page-draws-the-rows

async function setup040() {
  const w = await world();
  const zeno = await createMember(w.admin, { name: freshName('Zeno') });
  const xavi = await createMember(w.admin, { name: freshName('Xavi') });
  const yara = await createMember(w.admin, { name: freshName('Yara') });
  const z = await signInMember(zeno);
  const x = await signInMember(xavi);
  const y = await signInMember(yara);
  const zSpec = { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' } as const;
  const wSpec = { kind: 'vacation', firstDay: '2027-04-12', lastDay: '2027-04-13' } as const;
  const zId = await sendAt(z, zSpec, minutesAfter(T0, 1));
  const xId = await sendAt(x, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' }, minutesAfter(T0, 2));
  const yId = await sendAt(y, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }, minutesAfter(T0, 3));
  const wId = await sendAt(w.admin, wSpec, minutesAfter(T0, 4));
  return {
    ...w,
    names: { zeno: zeno.name, xavi: xavi.name, yara: yara.name, admin: w.install.admin.name },
    z,
    x,
    y,
    zId,
    xId,
    yId,
    wId,
    zSpec,
    wSpec,
    close: async () => {
      await z.dispose();
      await x.dispose();
      await y.dispose();
      await w.close();
    },
  };
}

/** The one element carrying `name`, none of `others`, and a button: the person's row (outermost such element). */
function rowFor(page: Page, name: string, others: string[]): Locator {
  let loc = page.locator('tr, li, article, section, form, fieldset, div, [role="row"], [role="listitem"]').filter({ hasText: name });
  for (const o of others) loc = loc.filter({ hasNotText: o });
  return loc.filter({ has: page.getByRole('button') }).first();
}

const CONFIRM = /confirm|yes/i;

/**
 * Operates the row's control named `verb`, then, while the effect has not happened, the page's confirmation step if it
 * shows one (a dialog's button named `verb` or confirm/yes, a confirm/yes button, the row's `verb` control again).
 */
async function operate(page: Page, row: Locator, verb: RegExp, done: () => Promise<boolean>): Promise<boolean> {
  await row.getByRole('button', { name: verb }).first().click({ timeout: 10_000 });
  for (let step = 0; step < 3; step += 1) {
    if (await settle(done, 3_000)) return true;
    const candidates = [
      page.getByRole('dialog').getByRole('button', { name: verb }),
      page.getByRole('dialog').getByRole('button', { name: CONFIRM }),
      row.getByRole('button', { name: CONFIRM }),
      page.getByRole('button', { name: CONFIRM }),
      row.getByRole('button', { name: verb }),
    ];
    let clicked = false;
    for (const c of candidates) {
      const first = c.first();
      if ((await c.count()) > 0 && (await first.isVisible())) {
        await first.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
  return settle(done, 5_000);
}

test('ROW-040.control.pending-page-draws-the-rows', async ({ browser }) => {
  const s = await setup040();
  const opened = await openPage(browser, s.admin);
  try {
    const res = await loadPending(opened.page);
    expect(res?.status(), 'ROW-040 control: /admin/pending answers the page itself').toBe(200);
    for (const n of [s.names.xavi, s.names.yara, s.names.zeno]) {
      await expect.soft(opened.page.getByText(n).first(), `ROW-040 control: the page draws "${n}"`).toBeVisible();
    }
  } finally {
    await opened.close();
    await s.close();
  }
});

test('ROW-040.REQ-008.approve-and-reject-from-the-row-change-exactly-that-request', async ({ browser }) => {
  const s = await setup040();
  const opened = await openPage(browser, s.admin);
  const page = opened.page;
  const all = Object.values(s.names);
  try {
    const res = await loadPending(page);
    expect(res?.status(), 'ROW-040: /admin/pending is reached (setup)').toBe(200);
    await expect(page.getByText(s.names.xavi).first(), "ROW-040: Xavi's request is drawn").toBeVisible();

    const xRow = rowFor(page, s.names.xavi, all.filter((n) => n !== s.names.xavi));
    expect(await xRow.count(), "ROW-040: Xavi's row carries a control").toBe(1);
    const approved = await operate(page, xRow, /approve/i, async () => (await stateOf(s.x, s.xId)).has('approved'));
    expect.soft(approved, "ROW-040: operating Approve in Xavi's row approves Xavi's request").toBe(true);

    await loadPending(page);
    const yRow = rowFor(page, s.names.yara, all.filter((n) => n !== s.names.yara));
    expect(await yRow.count(), "ROW-040: Yara's row carries a control").toBe(1);
    const rejected = await operate(page, yRow, /reject/i, async () => (await stateOf(s.y, s.yId)).has('rejected'));
    expect.soft(rejected, "ROW-040: operating Reject in Yara's row rejects Yara's request").toBe(true);

    // Every other request unchanged: still pending, days as sent, still on the pending list.
    for (const [who, actor, id, spec] of [
      ['Zeno', s.z, s.zId, s.zSpec],
      ['the admin', s.admin, s.wId, s.wSpec],
    ] as const) {
      const rec = recordOf(await readOwnRequests(actor), id);
      const states = rec ? statesOf(rec) : new Set<State>();
      expect.soft(states.has('pending'), `ROW-040: ${who}'s request is still pending: ${show(rec)}`).toBe(true);
      expect.soft(['approved', 'rejected', 'cancelled'].some((x) => states.has(x as State)), `ROW-040: ${who}'s request was not decided: ${show(rec)}`).toBe(false);
      expect.soft(!!rec && hasString(rec, spec.firstDay) && hasString(rec, spec.lastDay), `ROW-040: ${who}'s request keeps its days ${spec.firstDay}..${spec.lastDay}: ${show(rec)}`).toBe(true);
    }
    const pending = await readPending(s.admin);
    expect.soft(recordOf(pending, s.zId), `ROW-040: Zeno's request is still on the pending list; ids ${idsOf(pending)}`).toBeDefined();
    expect.soft(recordOf(pending, s.wId), `ROW-040: the admin's own request is still on the pending list; ids ${idsOf(pending)}`).toBeDefined();
    expect.soft(recordOf(pending, s.xId), `ROW-040: Xavi's approved request is off the pending list`).toBeUndefined();
    expect.soft(recordOf(pending, s.yId), `ROW-040: Yara's rejected request is off the pending list`).toBeUndefined();
  } finally {
    await opened.close();
    await s.close();
  }
});

// =====================================================================================================
// ROW-042 — with nothing pending the page says so
// =====================================================================================================
// ROW-042 promise: REQ-008 "with nothing pending it says so"; fail-if (6) "an empty page shows a bare list with no
// ROW-042   message". Authority: REQ-008 arm 6.
// ROW-042 wrong product: an empty table with its headings only; a message shown only when the team has no requests
// ROW-042   at all (so a decided request hides it); a static sentence that stays when a request is pending.
// ROW-042 given: member Wren's only request has been approved, so requests exist and none is pending. when: the admin
// ROW-042   loads /admin/pending. then: the page's text says nothing is pending (a sentence of the empty-state kind:
// ROW-042   "no pending requests", "nothing to decide", "all caught up"); after Wren sends a new request and the page is
// ROW-042   reloaded, that sentence is gone and Wren's name is drawn.
// ROW-042 controls: the control case loads /admin/pending as the admin and gets the page's 200 at that address.
// ROW-042 technique: browser (paint, R6); before and after, so a static sentence fails; a decided request as the decoy
// ROW-042   for "nothing pending".
// ROW-042 cases: ROW-042 target=ROW-042.REQ-008.empty-pending-page-says-nothing-is-pending control=ROW-042.control.pending-page-answers-200

const EMPTY_PENDING =
  /\b(?:no|nothing|none|not any)\b[^.!?\n]{0,40}\b(?:pending|requests?|to (?:decide|approve|review))\b|\ball (?:caught up|clear|done)\b/i;

async function setup042() {
  const w = await world();
  const wrenM = await createMember(w.admin, { name: freshName('Wren') });
  const wren = await signInMember(wrenM);
  const id = await sendAt(wren, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  await approve(w.admin, id);
  return { ...w, wren, wrenName: wrenM.name, close: async () => { await wren.dispose(); await w.close(); } };
}

test('ROW-042.control.pending-page-answers-200', async ({ browser }) => {
  const s = await setup042();
  const opened = await openPage(browser, s.admin);
  try {
    const res = await loadPending(opened.page);
    expect(res?.status(), 'ROW-042 control: /admin/pending answers the page itself').toBe(200);
    expect(new URL(opened.page.url()).pathname, 'ROW-042 control: the admin stays on /admin/pending').toBe(PAGES.adminPending);
  } finally {
    await opened.close();
    await s.close();
  }
});

test('ROW-042.REQ-008.empty-pending-page-says-nothing-is-pending', async ({ browser }) => {
  const s = await setup042();
  const opened = await openPage(browser, s.admin);
  const page = opened.page;
  try {
    const res = await loadPending(page);
    expect(res?.status(), 'ROW-042: /admin/pending is reached (setup)').toBe(200);
    const before = await page.locator('body').innerText();
    const said = EMPTY_PENDING.exec(before)?.[0] ?? null;
    expect(said, `ROW-042: with nothing pending the page says so; page text: ${before.slice(0, 400)}`).not.toBeNull();

    await sendRequest(s.wren, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' });
    await loadPending(page);
    await expect.soft(page.getByText(s.wrenName).first(), "ROW-042: with a request pending, Wren's name is drawn").toBeVisible();
    const after = await page.locator('body').innerText();
    expect.soft(after.includes(said!), `ROW-042: with a request pending the page no longer says "${said}"`).toBe(false);
  } finally {
    await opened.close();
    await s.close();
  }
});
