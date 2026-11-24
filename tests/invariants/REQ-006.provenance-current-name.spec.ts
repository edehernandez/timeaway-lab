// Purpose: ledger tests for ROW-204 (REQ-006, REQ-017) — who decided or cancelled a request still shows correctly after that account is renamed or switched off: the current display name is shown, the record keeping the account id.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, send, approve, reject, own cancel, the admin's cancel, rename, switch off and on), fresh per run; the person's page opened in the browser through the engine door (openPage).
//
// ROW-204 promise: REQ-006 "each with … who decided it and when, who cancelled it and when" and REQ-017 "who
// ROW-204   decided it and when, who cancelled it and when"; the row's cases: "the current display name is shown,
// ROW-204   the record keeping the account id". Authority: REQ-006 (A-015, A-023, A-030), REQ-017, A-029 (the
// ROW-204   admin changes a display name later). The row's case "recovered by hand in the database" is NOT in this
// ROW-204   file: the harness has no door that edits the database by hand (CON-001, A-013); it is returned owed
// ROW-204   as a missing prerequisite. Renamed and switched off are here.
// ROW-204 wrong product: the decision and the cancel copy the actor's display name into the request as text,
// ROW-204   so a renamed admin's decisions still show the old name; or the reader joins on active accounts only,
// ROW-204   so a switched-off person's own cancel shows no one.
// ROW-204 given: team Wed 2027-03-10; the admin (fresh name N0) approves P's R1 (April), rejects R3 (June),
// ROW-204   approves and then cancels R4 (July); P (fresh name P0) cancels their own pending R2 (May). when: the
// ROW-204   admin renames itself to N1 and P to P1, and switches P off; later P is switched back on. then: in the
// ROW-204   admin's read of P's requests every decider and canceller is its account (by id where the record
// ROW-204   carries one) under its current name, and no decider or canceller carries N0 or P0; P's own read
// ROW-204   agrees; P's own page draws N1 in the April and July rows and draws neither N0 nor P0 anywhere.
// ROW-204 controls: the control case — before the renames the same records name the admin N0 and P P0 —
// ROW-204   so the decider and canceller fields are recorded and readable at all.
// ROW-204 technique: fresh values before and after a rename (the old name is the near miss that must not
// ROW-204   match), at one exact place per request (its decider, its canceller, its row on the page).
// ROW-204 cases: ROW-204 target=ROW-204.REQ-006.decider-and-canceller-show-the-current-name control=ROW-204.control.decider-and-canceller-are-recorded
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshName,
  openPage,
  PAGES,
  reject,
  rename,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { byId, readOwnRequests, readPersonRequests, refIs, type AccountRef, type RequestRecord } from './request-records';
import { loadSettled, monthMarker, rowWith } from './page-rows';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland

interface World {
  install: Install;
  admin: Actor;
  p: Member;
  r1: string;
  r2: string;
  r3: string;
  r4: string;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: NOW });
  const admin = await signIn(install.admin);
  const p = await createMember(admin);
  const ps = await signInMember(p);
  const r1 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }));
  await approve(admin, r1);
  const r2 = String(await sendRequest(ps, { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
  await cancelOwnRequest(ps, r2);
  const r3 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-08' }));
  await reject(admin, r3);
  const r4 = String(await sendRequest(ps, { kind: 'vacation', firstDay: '2027-07-05', lastDay: '2027-07-06' }));
  await approve(admin, r4);
  await adminCancel(admin, r4);
  await ps.dispose();
  return { install, admin, p, r1, r2, r3, r4 };
}

/** The [label, reference, account] triples a world's records must satisfy. */
function provenance(w: World, list: RequestRecord[], admin: { id: string; name: string }, person: { id: string; name: string }) {
  return [
    ['R1 decider', byId(list, w.r1)?.decidedBy ?? null, admin],
    ['R3 decider', byId(list, w.r3)?.decidedBy ?? null, admin],
    ['R4 decider', byId(list, w.r4)?.decidedBy ?? null, admin],
    ['R4 canceller', byId(list, w.r4)?.cancelledBy ?? null, admin],
    ['R2 canceller', byId(list, w.r2)?.cancelledBy ?? null, person],
  ] as [string, AccountRef | null, { id: string; name: string }][];
}

test('ROW-204.control.decider-and-canceller-are-recorded', async () => {
  const w = await world();
  try {
    const list = await readPersonRequests(w.admin, w.p.id);
    for (const [label, ref, account] of provenance(w, list, { id: String(w.admin.me.id), name: w.install.admin.name }, { id: String(w.p.id), name: w.p.name })) {
      expect.soft(refIs(ref, account), `ROW-204 control: ${label} is ${account.name} (read ${JSON.stringify(ref)})`).toBe(true);
    }
  } finally {
    await w.admin.dispose();
  }
});

test('ROW-204.REQ-006.decider-and-canceller-show-the-current-name', async ({ browser }) => {
  const w = await world();
  const n0 = w.install.admin.name;
  const p0 = w.p.name;
  const n1 = freshName('Boss');
  const p1 = freshName('Renamed');
  try {
    await rename(w.admin, w.admin.me.id, n1);
    await rename(w.admin, w.p.id, p1);
    await switchAccount(w.admin, w.p.id, false);
    const admin = { id: String(w.admin.me.id), name: n1 };
    const person = { id: String(w.p.id), name: p1 };

    const checkRecords = (list: RequestRecord[], view: string) => {
      for (const [label, ref, account] of provenance(w, list, admin, person)) {
        expect.soft(refIs(ref, account), `ROW-204 ${view}: ${label} is the account now named ${account.name} (read ${JSON.stringify(ref)})`).toBe(true);
        expect.soft([n0, p0].includes(ref?.name ?? ''), `ROW-204 ${view}: ${label} carries no old name (read ${JSON.stringify(ref)})`).toBe(false);
      }
    };
    checkRecords(await readPersonRequests(w.admin, w.p.id), 'the admin\'s read while P is switched off');

    await switchAccount(w.admin, w.p.id, true);
    const ps = await signInMember(w.p);
    const opened = await openPage(browser, ps);
    try {
      checkRecords(await readOwnRequests(ps), 'P\'s own read');
      expect.soft(await loadSettled(opened.page, PAGES.home), 'ROW-204 P\'s own page answers').toBe(200);
      for (const [label, day] of [
        ['R1 (April, decided)', '2027-04-05'],
        ['R4 (July, decided and cancelled)', '2027-07-05'],
      ] as const) {
        await expect.soft(rowWith(opened.page, monthMarker(day)), `ROW-204 P's page: the ${label} row names the admin as ${n1}`).toContainText(n1);
      }
      const text = await opened.page.locator('body').innerText();
      expect.soft(text.includes(n0), `ROW-204 P's page draws no old admin name ${n0}`).toBe(false);
      expect.soft(text.includes(p0), `ROW-204 P's page draws no old person name ${p0}`).toBe(false);
    } finally {
      await opened.close();
      await ps.dispose();
    }
  } finally {
    await w.admin.dispose();
  }
});
