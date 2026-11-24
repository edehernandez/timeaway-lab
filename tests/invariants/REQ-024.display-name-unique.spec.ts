// Purpose: ledger tests for ROW-254 and ROW-255 (REQ-024) — no two switched-on accounts share a display name, ignoring letter case and surrounding spaces, at create, rename and switch-on; and a name used only by a switched-off account is not refused.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, accounts, rename, switch), fresh per run.
//
// Boundary (R6): an account rule, proved at the HTTP harness on D-029's POST /api/admin/accounts, …/:id/name and
// …/:id/switch. A name is read back where the product says who an account is: GET /api/me on that account's own
// session (the name the calendar and the lists show, A-029). A switched-off account cannot sign in (A-008), so
// "still switched off" is read as a refused sign-in.
import { test, expect } from '@playwright/test';
import {
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  resetProduct,
  SetupError,
  signIn,
  switchAccount,
  type Actor,
  type Member,
} from './harness';
import { createAccountRaw, is2xx, isRefusal, renameRaw, signedIn, switchOnRaw, trySignIn } from './admin-kit';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return keep(await signIn(install.admin));
}

/** The name GET /api/me answers on a fresh session of the account, or null when it does not sign in. */
async function nameOf(email: string, password: string): Promise<string | null> {
  const a = await trySignIn({ email, password });
  return signedIn(a) ? (a.me?.name ?? '').trim() : null;
}

/** "  ILSE K3X9  " from "Ilse k3x9": the same name ignoring letter case and surrounding spaces, never equal as typed. */
function shouted(name: string): string {
  return `  ${name.toUpperCase()}  `;
}

/** "ilse k3x9" from "Ilse k3x9": the same name in another letter case. */
function whispered(name: string): string {
  return name.toLowerCase();
}

/** A switched-off account holding `name`, made as setup (create, then the confirmed switch-off). */
async function switchedOffHolder(admin: Actor, name: string): Promise<Member> {
  const m = await createMember(admin, { name });
  await switchAccount(admin, m.id, false);
  if (signedIn(await trySignIn({ email: m.email, password: m.password }))) {
    throw new SetupError(`the switched-off account ${m.email} still signs in, so it cannot stand as a switched-off holder`);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------
// ROW-254 promise: REQ-024 fail-if (1) "two switched-on accounts hold the same display name, ignoring letter case
// ROW-254   and surrounding spaces"; A-037 "refused at create, rename and switch-on". The row's cases: at create, at
// ROW-254   rename and at switch-on.
// ROW-254 wrong product: a uniqueness check that compares names exactly as typed (so "  ILSE K3X9  " passes beside
// ROW-254   "Ilse k3x9"); one that checks at create but not at rename, or never at switch-on; one that trims but
// ROW-254   does not fold case.
// ROW-254 given: switched-on account A named N (fresh). when: (create) the admin creates B with N upper-cased and
// ROW-254   padded with spaces; (rename) the admin renames switched-on C to N lower-cased; (switch-on) D named Q is
// ROW-254   switched off, E is created with Q while D is off, then the admin switches D on. then: each act answers
// ROW-254   a 4xx refusal; B does not sign in; C still signs in under its own name; D still does not sign in and E
// ROW-254   still signs in as Q.
// ROW-254 controls: the control case does the same three acts with near-miss names (N plus " Jr", a fresh name,
// ROW-254   a name no switched-on account holds): each is accepted and takes effect — the routes and bodies work and
// ROW-254   the refusals in the target are the rule, not a broken route.
// ROW-254 technique: near misses either side of the comparison (case and spaces must match; one extra word must
// ROW-254   not); the effect read on the account's own session, not the act's status alone; one target case holding
// ROW-254   all three cases as soft assertions, so a fault at any one of them fails it.
// ROW-254 cases: ROW-254 target=ROW-254.REQ-024.a-name-held-by-a-switched-on-account-is-refused-at-create-rename-and-switch-on control=ROW-254.control.near-miss-names-are-accepted-at-create-rename-and-switch-on
test('ROW-254.control.near-miss-names-are-accepted-at-create-rename-and-switch-on', async () => {
  const admin = await start();
  const n = freshName('Ilse');
  await createMember(admin, { name: n });

  // create: one extra word is another name.
  const bEmail = freshEmail('b');
  const bPassword = freshPassword();
  const create = await createAccountRaw(admin.api, { name: `${n} Jr`, email: bEmail, password: bPassword, allowance: 25 });
  expect(is2xx(create.status), `ROW-254 control: creating "${n} Jr" beside "${n}" is accepted (answered ${create.status} ${create.text.slice(0, 200)})`).toBe(true);
  expect(signedIn(await trySignIn({ email: bEmail, password: bPassword })), 'ROW-254 control: the created account signs in').toBe(true);

  // rename to a fresh name.
  const c = await createMember(admin, { name: freshName('Carla') });
  const fresh = freshName('Carmen');
  const ren = await renameRaw(admin.api, c.id, fresh);
  expect(is2xx(ren.status), `ROW-254 control: renaming to a free name is accepted (answered ${ren.status})`).toBe(true);
  expect(await nameOf(c.email, c.password), 'ROW-254 control: the rename took effect').toBe(fresh);

  // switch-on with a free name.
  const d = await switchedOffHolder(admin, freshName('Dora'));
  const on = await switchOnRaw(admin.api, d.id);
  expect(is2xx(on.status), `ROW-254 control: switching on an account whose name is free is accepted (answered ${on.status})`).toBe(true);
  expect(signedIn(await trySignIn({ email: d.email, password: d.password })), 'ROW-254 control: the switched-on account signs in').toBe(true);
});

test('ROW-254.REQ-024.a-name-held-by-a-switched-on-account-is-refused-at-create-rename-and-switch-on', async () => {
  const admin = await start();
  const n = freshName('Ilse');
  const a = await createMember(admin, { name: n });
  expect(await nameOf(a.email, a.password), 'ROW-254 before: A is switched on and named N').toBe(n);

  // at create
  const bEmail = freshEmail('b');
  const bPassword = freshPassword();
  const create = await createAccountRaw(admin.api, { name: shouted(n), email: bEmail, password: bPassword, allowance: 25 });
  expect.soft(isRefusal(create.status), `ROW-254 create: "${shouted(n)}" beside switched-on "${n}" is refused (answered ${create.status})`).toBe(true);
  expect.soft(signedIn(await trySignIn({ email: bEmail, password: bPassword })), 'ROW-254 create: no account B was made').toBe(false);

  // at rename
  const cName = freshName('Carla');
  const c = await createMember(admin, { name: cName });
  const ren = await renameRaw(admin.api, c.id, whispered(n));
  expect.soft(isRefusal(ren.status), `ROW-254 rename: renaming C to "${whispered(n)}" beside switched-on "${n}" is refused (answered ${ren.status})`).toBe(true);
  expect.soft(await nameOf(c.email, c.password), 'ROW-254 rename: C keeps its own name').toBe(cName);
  const renPadded = await renameRaw(admin.api, c.id, `   ${n}   `);
  expect.soft(isRefusal(renPadded.status), `ROW-254 rename: renaming C to N padded with spaces is refused (answered ${renPadded.status})`).toBe(true);
  expect.soft(await nameOf(c.email, c.password), 'ROW-254 rename: C still keeps its own name').toBe(cName);

  // at switch-on: D holds Q and is off; E takes Q while D is off (REQ-024 arm 2 allows it); D is then switched on.
  const q = freshName('Dora');
  const d = await switchedOffHolder(admin, q);
  const eEmail = freshEmail('e');
  const ePassword = freshPassword();
  const eCreate = await createAccountRaw(admin.api, { name: whispered(q), email: eEmail, password: ePassword, allowance: 25 });
  if (!is2xx(eCreate.status)) {
    throw new SetupError(`creating "${whispered(q)}" while its only holder is switched off answered ${eCreate.status}; the switch-on case needs it (REQ-024 arm 2, ROW-255)`);
  }
  const on = await switchOnRaw(admin.api, d.id);
  expect.soft(isRefusal(on.status), `ROW-254 switch-on: switching D ("${q}") on while switched-on E holds "${whispered(q)}" is refused (answered ${on.status})`).toBe(true);
  expect.soft(signedIn(await trySignIn({ email: d.email, password: d.password })), 'ROW-254 switch-on: D is still switched off (does not sign in)').toBe(false);
  expect.soft(await nameOf(eEmail, ePassword), 'ROW-254 switch-on: E is still switched on and named as created').toBe(whispered(q));
});

// ---------------------------------------------------------------------------------------------------
// ROW-255 promise: REQ-024 fail-if (2) "a name used only by a switched-off account is refused"; REQ-024 refuses a
// ROW-255   name held by "another switched-on account" only (A-037).
// ROW-255 wrong product: a uniqueness check over every account, switched on or off — a leaver's name can then never
// ROW-255   be reused; or one that ignores switch state at create but not at rename or switch-on.
// ROW-255 given: three accounts, each switched off holding its own fresh name (N1, N2, N3). when: (create) the admin
// ROW-255   creates an account named N1 lower-cased; (rename) renames a switched-on account to N2 upper-cased; (switch-
// ROW-255   on) creates F named N3 and switches F off, then switches the first N3 holder on. then: each act is
// ROW-255   accepted (2xx) and takes effect: the new account signs in named as created, the renamed one signs in under
// ROW-255   its new name, the switched-on holder signs in.
// ROW-255 controls: the control case shows the switched-off holders really are off (they do not sign in) and a
// ROW-255   create with a wholly fresh name is accepted — the target reaches "only a switched-off account holds it".
// ROW-255 technique: the same name in another case (the comparison REQ-024 uses) held only by a switched-off
// ROW-255   account, at each of the three acts, as soft assertions in one target case.
// ROW-255 cases: ROW-255 target=ROW-255.REQ-024.a-name-held-only-by-a-switched-off-account-is-accepted-at-create-rename-and-switch-on control=ROW-255.control.the-holders-are-switched-off-and-a-fresh-name-is-accepted
test('ROW-255.control.the-holders-are-switched-off-and-a-fresh-name-is-accepted', async () => {
  const admin = await start();
  const h = await switchedOffHolder(admin, freshName('Hilde'));
  expect(signedIn(await trySignIn({ email: h.email, password: h.password })), 'ROW-255 control: the holder is switched off').toBe(false);
  const email = freshEmail('fresh');
  const password = freshPassword();
  const name = freshName('Frida');
  const create = await createAccountRaw(admin.api, { name, email, password, allowance: 25 });
  expect(is2xx(create.status), `ROW-255 control: a create with a fresh name is accepted (answered ${create.status})`).toBe(true);
  expect(await nameOf(email, password), 'ROW-255 control: the created account signs in under its name').toBe(name);
});

test('ROW-255.REQ-024.a-name-held-only-by-a-switched-off-account-is-accepted-at-create-rename-and-switch-on', async () => {
  const admin = await start();

  // at create
  const n1 = freshName('Ilse');
  await switchedOffHolder(admin, n1);
  const bEmail = freshEmail('b');
  const bPassword = freshPassword();
  const create = await createAccountRaw(admin.api, { name: whispered(n1), email: bEmail, password: bPassword, allowance: 25 });
  expect.soft(is2xx(create.status), `ROW-255 create: "${whispered(n1)}", held only by a switched-off account, is accepted (answered ${create.status} ${create.text.slice(0, 200)})`).toBe(true);
  expect.soft(await nameOf(bEmail, bPassword), 'ROW-255 create: the new account signs in under that name').toBe(whispered(n1));

  // at rename
  const n2 = freshName('Greta');
  await switchedOffHolder(admin, n2);
  const c = await createMember(admin, { name: freshName('Carla') });
  const ren = await renameRaw(admin.api, c.id, n2.toUpperCase());
  expect.soft(is2xx(ren.status), `ROW-255 rename: "${n2.toUpperCase()}", held only by a switched-off account, is accepted (answered ${ren.status})`).toBe(true);
  expect.soft(await nameOf(c.email, c.password), 'ROW-255 rename: the account signs in under its new name').toBe(n2.toUpperCase());

  // at switch-on
  const n3 = freshName('Hanna');
  const d = await switchedOffHolder(admin, n3);
  const f = await createMember(admin, { name: n3 }).catch((e: Error) => {
    throw new SetupError(`creating a second "${n3}" while its holder is off failed (${e.message}); the switch-on case needs it`);
  });
  await switchAccount(admin, f.id, false);
  const on = await switchOnRaw(admin.api, d.id);
  expect.soft(is2xx(on.status), `ROW-255 switch-on: switching on "${n3}" while its only other holder is switched off is accepted (answered ${on.status})`).toBe(true);
  expect.soft(signedIn(await trySignIn({ email: d.email, password: d.password })), 'ROW-255 switch-on: the switched-on account signs in').toBe(true);
});
