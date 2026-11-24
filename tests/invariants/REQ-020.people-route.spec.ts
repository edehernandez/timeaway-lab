// Purpose: ledger test for ROW-285 (REQ-020) — signed in as the admin, /admin/people shows the people page listing every account.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); fixture data made through the product's public routes by harness.ts (reset at a fixed instant, accounts with their own chosen password, a switch-off), fresh per run; the page loaded in the browser through the engine door (openPage).
//
// Boundary (R6): what the route draws is paint, proved in the browser at D-029's /admin/people. Each account's figures
// and the six actions are REQ-020's other rows (ROW-192 and the people rows); here every account's name and email
// are what tells the people page from another list. Readings: route-reading.ts (text outside the header).
//
// ROW-285 promise: REQ-020 "the admin has a people page listing every account with its name, email, whether it is
// ROW-285   switched on …"; fail-if (1) "an account is missing from the page"; the row: /admin/people shows that page
// ROW-285   listing every account. Authority: REQ-020 (A-031, A-029, A-043, A-044).
// ROW-285 wrong product: no page at /admin/people (404) or a redirect to /; a list of switched-on accounts only; a list
// ROW-285   of members that leaves out the admin's own account; a list drawing names without emails.
// ROW-285 given: team today Mon 2027-03-08; the admin, members A and B, and member S switched off by the admin, each
// ROW-285   with a fresh name and email. when: the admin opens /admin/people before the switch-off,
// ROW-285   and again after. then: 200 at /admin/people with one header, both times; after, outside the header the page draws the name and the email of each of the four accounts.
// ROW-285 controls: the control case reads GET /api/admin/people on the admin's session: it carries all four emails —
// ROW-285   so the accounts exist, S included, and a red target is the page.
// ROW-285 technique: every account of the install, the near misses being the switched-off account and the admin's
// ROW-285   own (each a likely omission), read outside the header so the header's "signed in as" never counts.
// ROW-285 cases: ROW-285 target=ROW-285.REQ-020.people-route-lists-every-account control=ROW-285.control.four-accounts-exist
import { test, expect } from '@playwright/test';
import { createMember, freshName, openPage, PAGES, resetProduct, signIn, switchAccount, type Actor, type Install, type Member } from './harness';
import { observePeople, recordByEmail } from './records';
import { contentWhen, openRoute, routeProblems } from './route-reading';

const T0 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland

const actors: Actor[] = [];
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

interface World {
  install: Install;
  admin: Actor;
  accounts: { label: string; name: string; email: string }[];
}

/** The four accounts, S not yet switched off: what the route check before the switch needs. */
async function accounts(): Promise<World & { s: Member }> {
  const install = await resetProduct({ now: T0 });
  const admin = await signIn(install.admin);
  actors.push(admin);
  const a: Member = await createMember(admin, { name: freshName('Anouk') });
  const b: Member = await createMember(admin, { name: freshName('Bram') });
  const s: Member = await createMember(admin, { name: freshName('Saskia') });
  return {
    s,
    install,
    admin,
    accounts: [
      { label: 'the admin', name: install.admin.name, email: install.admin.email },
      { label: 'A', name: a.name, email: a.email },
      { label: 'B', name: b.name, email: b.email },
      { label: 'S (switched off)', name: s.name, email: s.email },
    ],
  };
}

/** The admin switches S off. */
async function populate(w: World & { s: Member }): Promise<void> {
  await switchAccount(w.admin, w.s.id, false);
}

async function world(): Promise<World> {
  const w = await accounts();
  await populate(w);
  return w;
}

test('ROW-285.control.four-accounts-exist', async () => {
  const w = await world();
  const people = await observePeople(w.admin);
  for (const acc of w.accounts) {
    expect(recordByEmail(people, acc.email), `ROW-285 control: the people data carries ${acc.label}`).toBeDefined();
  }
});

test('ROW-285.REQ-020.people-route-lists-every-account', async ({ browser }) => {
  const w = await accounts();
  // Before S is switched off, /admin/people must already be the page inside the header; the list checks follow the switch.
  const first = await openPage(browser, w.admin);
  try {
    expect(routeProblems(await openRoute(first.page, PAGES.adminPeople), PAGES.adminPeople), 'ROW-285: /admin/people is the page, inside the header (before the switch-off)').toEqual([]);
  } finally {
    await first.close();
  }
  await populate(w);
  const opened = await openPage(browser, w.admin);
  const page = opened.page;
  try {
    const read = await openRoute(page, PAGES.adminPeople);
    expect.soft(routeProblems(read, PAGES.adminPeople), 'ROW-285: /admin/people is the page, inside the header').toEqual([]);
    const content = await contentWhen(page, (c) => w.accounts.every((acc) => c.includes(acc.name)));
    const lower = content.toLowerCase();
    for (const acc of w.accounts) {
      expect.soft(content.includes(acc.name), `ROW-285: the page draws ${acc.label}'s name`).toBe(true);
      expect.soft(lower.includes(acc.email.toLowerCase()), `ROW-285: the page draws ${acc.label}'s email`).toBe(true);
    }
  } finally {
    await opened.close();
  }
});
