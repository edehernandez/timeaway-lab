// Purpose: ledger tests for ROW-171 and ROW-172 (REQ-013) — two accounts never share an email, even when created at the same moment or differing only in letter case or surrounding spaces, the store itself enforcing it; two different emails created at the same moment are both stored.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, POST /api/admin/accounts, the email change), fresh per run; simultaneous acts through readings.ts's together().
//
// Boundary (R6): a store rule under concurrency, proved at the HTTP harness: POST /api/admin/accounts
// {name,email,password,allowance} and POST /api/admin/accounts/:id/email {email} (D-029) fired in the same tick, then
// the admin's people list (GET /api/admin/people) counted by account. "The store itself enforces it" is observed
// as the race between two different routes (a create and an email change) that no single route's check can
// serialise. Display names are fresh per create, so REQ-024's name rule never stands in for the email rule.
import { test, expect } from '@playwright/test';
import { createMember, freshEmail, freshName, freshPassword, resetProduct, signIn, type AccountId, type Actor } from './harness';
import { aucklandMorning, getJson, objectsIn, together } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-08') });
  return keep(await signIn(install.admin));
}

function ok(status: number): boolean {
  return status >= 200 && status < 300;
}

async function create(admin: Actor, email: string): Promise<{ status: number; id?: AccountId }> {
  const res = await admin.api.post('/api/admin/accounts', {
    data: { name: freshName('Same'), email, password: freshPassword(), allowance: 25 },
  });
  let id: AccountId | undefined;
  try {
    id = ((await res.json()) as { id?: AccountId }).id;
  } catch {
    id = undefined;
  }
  return { status: res.status(), id };
}

async function changeEmail(admin: Actor, id: AccountId, email: string): Promise<number> {
  return (await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(id))}/email`, { data: { email } })).status();
}

/** How many accounts on the people list carry this email, compared without letter case or surrounding spaces. */
async function accountsWith(admin: Actor, email: string, row: string): Promise<number> {
  const norm = email.trim().toLowerCase();
  const people = await getJson(admin.api, '/api/admin/people', row);
  return objectsIn(people).filter((o) => Object.values(o).some((v) => typeof v === 'string' && v.trim().toLowerCase() === norm)).length;
}

function variant(email: string): string {
  // Upper-cased with surrounding spaces: the same email under REQ-013's comparison.
  return `  ${email.toUpperCase()}  `;
}

// ---------------------------------------------------------------------------------------------------
// ROW-171 promise: REQ-013 "an email belongs to at most one account, compared without regard to letter case or
// ROW-171   surrounding spaces" and fail-if (2); A-044 (an email change is "unique and compared the same way as at
// ROW-171   create"). The row's case: two accounts never share an email, even created at the same moment or differing
// ROW-171   only in letter case or surrounding spaces; the store itself enforces it.
// ROW-171 wrong product: a route that looks the email up and then inserts, so two simultaneous creates both pass;
// ROW-171   a unique index on the email as typed, so "A@x" and " a@x " are two accounts; a create route that
// ROW-171   normalises but an email-change route that does not.
// ROW-171 given: a fresh install (the admin signed in). when: (a) 4 rounds of two creates with the same fresh email
// ROW-171   in the same tick; (b) 4 rounds of two creates, one with the email, one upper-cased with surrounding
// ROW-171   spaces, in the same tick; (c) a create with the variant of an existing account's email; (d) 3 rounds of a
// ROW-171   create with a fresh email and another account's email change to that email's variant, in the same tick;
// ROW-171   (e) an email change to the variant of another account's email. then: in (a), (b) and (d) exactly one act
// ROW-171   per round answers success; (c) (the variant, and the upper case alone) and (e) are refused, while the
// ROW-171   variant form of a fresh email is accepted (so a refusal is the rule, not the format); for every email
// ROW-171   used, exactly one account on the people list carries it.
// ROW-171 controls: ROW-172's target (two different emails created at the same moment are both stored) — the
// ROW-171   creates do run together and both land when they may.
// ROW-171 technique: races repeated over rounds, across two routes; the variant (case and spaces) as the near miss
// ROW-171   that must match; the store's content counted afterwards.
// ROW-171 cases: ROW-171 target=ROW-171.REQ-013.no-two-accounts-share-an-email-even-at-the-same-moment control=ROW-172.REQ-013.two-different-emails-created-at-the-same-moment-are-both-stored
test('ROW-171.REQ-013.no-two-accounts-share-an-email-even-at-the-same-moment', async () => {
  const admin = await start();
  const used: string[] = [];

  for (let i = 0; i < 4; i += 1) {
    const e = freshEmail('twin');
    used.push(e);
    const [x, y] = await together([() => create(admin, e), () => create(admin, e)]);
    expect.soft([x, y].filter((o) => ok(o.status)).length, `ROW-171 (a) round ${i}: one of two simultaneous creates with ${e} lands (answers ${x.status}, ${y.status})`).toBe(1);
  }
  for (let i = 0; i < 4; i += 1) {
    const e = freshEmail('case');
    used.push(e);
    const [x, y] = await together([() => create(admin, e), () => create(admin, variant(e))]);
    expect.soft([x, y].filter((o) => ok(o.status)).length, `ROW-171 (b) round ${i}: one of ${e} and its variant lands (answers ${x.status}, ${y.status})`).toBe(1);
  }

  // The near miss's own control: the variant form of a FRESH email is a legal email (accepted), so a refusal of the
  // variant of an existing email below is the uniqueness rule, not the format.
  const lone = freshEmail('lone');
  used.push(lone);
  const l = await create(admin, variant(lone));
  expect.soft(ok(l.status), `ROW-171: the variant form of a fresh email is accepted (answered ${l.status})`).toBe(true);

  const existing = await createMember(admin, { choosePassword: false });
  used.push(existing.email);
  const c = await create(admin, variant(existing.email));
  expect.soft(ok(c.status), `ROW-171 (c): a create with the variant of an existing email is refused (answered ${c.status})`).toBe(false);
  const cu = await create(admin, existing.email.toUpperCase());
  expect.soft(ok(cu.status), `ROW-171 (c): a create with an existing email in upper case is refused (answered ${cu.status})`).toBe(false);

  for (let i = 0; i < 3; i += 1) {
    const other = await createMember(admin, { choosePassword: false });
    used.push(other.email);
    const e = freshEmail('cross');
    used.push(e);
    const [x, y] = await together([async () => (await create(admin, e)).status, () => changeEmail(admin, other.id, variant(e))]);
    expect.soft([x, y].filter(ok).length, `ROW-171 (d) round ${i}: one of a create and an email change to ${e} lands (answers ${x}, ${y})`).toBe(1);
  }

  const a = await createMember(admin, { choosePassword: false });
  const b = await createMember(admin, { choosePassword: false });
  used.push(a.email, b.email);
  const e5 = await changeEmail(admin, b.id, variant(a.email));
  expect.soft(ok(e5), `ROW-171 (e): an email change to the variant of another account's email is refused (answered ${e5})`).toBe(false);

  for (const e of used) {
    expect.soft(await accountsWith(admin, e, 'ROW-171'), `ROW-171: exactly one account carries ${e}`).toBe(1);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-172 promise: REQ-013 (the admin creates accounts; only a shared email is refused). The row's case: two
// ROW-172   accounts with different emails created at the same moment are both stored.
// ROW-172 wrong product: a create lock or uniqueness check so coarse (a table lock that fails the waiter, a check
// ROW-172   on the email's domain) that a second create at the same moment is refused.
// ROW-172 given: a fresh install. when: 4 rounds of two creates with two different fresh emails in the same tick.
// ROW-172   then: both answer success with two ids, and each email is carried by exactly one account on the list.
// ROW-172 controls: the control case creates one account alone and finds it on the people list.
// ROW-172 technique: the ROW-171 race with the shared email removed.
// ROW-172 cases: ROW-172 target=ROW-172.REQ-013.two-different-emails-created-at-the-same-moment-are-both-stored control=ROW-172.control.a-single-create-is-stored
test('ROW-172.control.a-single-create-is-stored', async () => {
  const admin = await start();
  const e = freshEmail('single');
  const x = await create(admin, e);
  expect(x.status, 'ROW-172 control: a single create answers 201').toBe(201);
  expect(await accountsWith(admin, e, 'ROW-172 control'), 'ROW-172 control: it is on the people list').toBe(1);
});

test('ROW-172.REQ-013.two-different-emails-created-at-the-same-moment-are-both-stored', async () => {
  const admin = await start();
  for (let i = 0; i < 4; i += 1) {
    const e1 = freshEmail('left');
    const e2 = freshEmail('right');
    const [x, y] = await together([() => create(admin, e1), () => create(admin, e2)]);
    expect.soft([x.status, y.status], `ROW-172 round ${i}: both creates land`).toEqual([201, 201]);
    expect.soft(x.id !== undefined && y.id !== undefined && String(x.id) !== String(y.id), `ROW-172 round ${i}: with two ids`).toBe(true);
    expect.soft(await accountsWith(admin, e1, 'ROW-172'), `ROW-172 round ${i}: ${e1} is stored once`).toBe(1);
    expect.soft(await accountsWith(admin, e2, 'ROW-172'), `ROW-172 round ${i}: ${e2} is stored once`).toBe(1);
  }
});
