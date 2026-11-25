// Purpose: ledger tests for ROW-254 and ROW-255 (REQ-024) — no two switched-on accounts share a display name, ignoring letter case, surrounding white space, characters that display as nothing and normal form (A-058), at create, rename and switch-on; and a name used only by a switched-off account is not refused.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7; the A-058 cases — invisible characters, no-break and ideographic spaces, NFC against NFD — added by batch test-author-27, with unicode-text.ts); fixture data made through the product's public routes by harness.ts (reset, accounts, rename, switch), fresh per run.
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
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { createAccountRaw, is2xx, isRefusal, renameRaw, signedIn, switchOnRaw, trySignIn } from './admin-kit';
import { assignedIgnorable, chars, drawOne, insertAt, nameKey, show, u, WHITE_SPACE } from './unicode-text';

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

// ===================================================================================================
// The A-058 cases (batch test-author-27): REQ-024 AMENDED compares names after NFC normalization, ignoring letter
// case, surrounding White_Space (the no-break and ideographic spaces included) and the default-ignorable code points
// wherever they sit. The cases above stand unchanged; these sit beside them.
// ===================================================================================================

const ZWSP = 0x200b;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const WJ = 0x2060;
const NBSP = 0x00a0;
const IDSP = 0x3000;

/** One way two names can differ while REQ-024 calls them the same name: the holder's form and the challenger's. */
interface Shape {
  label: string;
  base: () => string;
  holder: (b: string) => string;
  challenger: (b: string) => string;
}

/** The row's cases (ROW-254 obligation, A-058): each a fresh base name per call, so no product can hard-code it. */
function shapes(): Shape[] {
  const ana = () => freshName('Ana');
  const jose = () => freshName('José'); // precomposed é (NFC)
  const d = drawOne(assignedIgnorable());
  const w = drawOne(WHITE_SPACE);
  return [
    { label: 'a zero-width space inside the name', base: ana, holder: (b) => b, challenger: (b) => insertAt(b, 2, chars(ZWSP)) },
    { label: 'a word joiner and a zero-width non-joiner inside the name', base: ana, holder: (b) => b, challenger: (b) => insertAt(insertAt(b, 2, chars(WJ)), 7, chars(ZWNJ)) },
    { label: 'zero-width characters outside the surrounding spaces', base: ana, holder: (b) => b, challenger: (b) => `${chars(ZWSP)} ${b} ${chars(ZWJ)}` },
    { label: 'surrounding white space outside zero-width characters', base: ana, holder: (b) => b, challenger: (b) => ` \t${chars(WJ)}${b}${chars(ZWSP)}${chars(NBSP)}` },
    { label: 'a trailing no-break space', base: ana, holder: (b) => b, challenger: (b) => `${b}${chars(NBSP)}` },
    { label: 'ideographic spaces around the name', base: ana, holder: (b) => b, challenger: (b) => `${chars(IDSP)}${b}${chars(IDSP)}` },
    { label: 'NFD against an NFC holder', base: jose, holder: (b) => b, challenger: (b) => b.normalize('NFD') },
    { label: 'NFC against an NFD holder', base: jose, holder: (b) => b.normalize('NFD'), challenger: (b) => b },
    {
      label: 'letter case, NFD, a zero-width non-joiner inside, no-break, zero-width and ideographic spaces around, all at once',
      base: jose,
      holder: (b) => b,
      challenger: (b) => `${chars(NBSP, ZWSP)}${insertAt(b.toUpperCase().normalize('NFD'), 2, chars(ZWNJ))}${chars(IDSP)}`,
    },
    { label: `${u(d)} (a default-ignorable drawn this run) inside, ${u(w)} (a White_Space drawn this run) around`, base: ana, holder: (b) => b, challenger: (b) => `${chars(w)}${insertAt(b, 2, chars(d))}${chars(w)}` },
  ];
}

/** The holder's and the challenger's forms of a fresh base, checked against REQ-024's own key (a test bug is SETUP). */
function formsOf(s: Shape): { holder: string; challenger: string } {
  const b = s.base();
  const holder = s.holder(b);
  const challenger = s.challenger(b);
  if (holder === challenger || nameKey(holder) !== nameKey(challenger) || nameKey(holder) === '') {
    throw new SetupError(`the shape "${s.label}" does not make two different strings of one name (${show(holder)} / ${show(challenger)})`);
  }
  return { holder, challenger };
}

/** The account's name under REQ-024's key, read on its own fresh session (GET /api/me), or null when it does not sign in. */
async function keyOf(email: string, password: string): Promise<string | null> {
  const a = await trySignIn({ email, password });
  return signedIn(a) ? nameKey(String(a.me?.name ?? '')) : null;
}

// ---------------------------------------------------------------------------------------------------
// ROW-254 (A-058) promise: REQ-024 AMENDED fail-if (1) "two switched-on accounts hold the same display name, compared
// ROW-254   after NFC normalization and ignoring letter case, surrounding white space (the Unicode White_Space
// ROW-254   characters) and characters that display as nothing (the Unicode default-ignorable code points, wherever they
// ROW-254   sit)"; A-058; A-037 (refused at create, rename and switch-on). The row's cases: such characters inside the
// ROW-254   name, mixed with surrounding white space in either order, a trailing no-break space, an ideographic space,
// ROW-254   an NFC against NFD pair.
// ROW-254 wrong product: a comparison of trim().toLowerCase() — JavaScript's trim leaves U+200B, U+200C, U+200D and
// ROW-254   U+2060 in place and nothing folds NFD to NFC, so "A<U+200B>na …" or "Jose<U+0301> …" passes beside a
// ROW-254   switched-on "Ana …" / "José …"; one that strips zero-width characters only at the ends, or strips them and
// ROW-254   then does not trim again (so "<U+200B> Ana … <U+200D>" leaves its spaces); one that applies the new key at
// ROW-254   create but still compares the old way at rename or at switch-on.
// ROW-254 given: for each shape, a fresh base name b; holder H switched on with the holder form; D, switched off,
// ROW-254   holding the challenger form (made while no switched-on account held the name); member C with its own name.
// ROW-254   when: the admin creates B with the challenger form; renames C to it; switches D on. then: each act answers a
// ROW-254   4xx refusal; B does not sign in; C signs in still named as before; D still does not sign in; H still signs in
// ROW-254   under its name.
// ROW-254 controls: ROW-254.control.the-same-shapes-of-a-free-name-are-accepted-and-near-misses-stay-apart — every
// ROW-254   challenger form, on a name nobody holds, is accepted at create, rename and switch-on and reads back as that
// ROW-254   name, and visible near misses ("Jose" beside "José", "Anna" beside "Ana") are accepted; so the refusals here
// ROW-254   are the collision's, not a product that refuses names with such characters or that matches loosely.
// ROW-254 technique: one shape per case the row names (plus one default-ignorable and one White_Space character drawn
// ROW-254   afresh each run, the "every" of A-058), each tried at all three acts, as soft assertions in one target case so
// ROW-254   a fault at any act or shape fails it; the effect read on the accounts' own sessions, not the status alone.
// ROW-254 cases: ROW-254 target=ROW-254.REQ-024.a-name-differing-only-by-invisible-characters-spaces-or-normal-form-is-refused-at-create-rename-and-switch-on control=ROW-254.control.the-same-shapes-of-a-free-name-are-accepted-and-near-misses-stay-apart
test('ROW-254.control.the-same-shapes-of-a-free-name-are-accepted-and-near-misses-stay-apart', async () => {
  test.setTimeout(240_000);
  const admin = await start();

  // Visible near misses beside switched-on holders: another letter is another name.
  const jose = freshName('José');
  await createMember(admin, { name: jose });
  const plain = jose.replace('é', 'e');
  const plainEmail = freshEmail('jose');
  const plainPassword = freshPassword();
  const plainCreate = await createAccountRaw(admin.api, { name: plain, email: plainEmail, password: plainPassword, allowance: 25 });
  expect.soft(is2xx(plainCreate.status), `ROW-254 control: "${plain}" beside switched-on "${jose}" is accepted (answered ${plainCreate.status} ${plainCreate.text.slice(0, 200)})`).toBe(true);
  expect.soft(await keyOf(plainEmail, plainPassword), 'ROW-254 control: the unaccented account signs in under its name').toBe(nameKey(plain));
  const ana = freshName('Ana');
  await createMember(admin, { name: ana });
  const anna = insertAt(ana, 2, 'n');
  const annaEmail = freshEmail('anna');
  const annaPassword = freshPassword();
  const annaCreate = await createAccountRaw(admin.api, { name: anna, email: annaEmail, password: annaPassword, allowance: 25 });
  expect.soft(is2xx(annaCreate.status), `ROW-254 control: "${anna}" beside switched-on "${ana}" is accepted (answered ${annaCreate.status})`).toBe(true);

  const c = await createMember(admin, { name: freshName('Carla') });
  for (const s of shapes()) {
    // create, then switch-on of the same account after a switch-off
    const { challenger } = formsOf(s);
    const email = freshEmail('free');
    const password = freshPassword();
    const create = await createAccountRaw(admin.api, { name: challenger, email, password, allowance: 25 });
    expect.soft(is2xx(create.status), `ROW-254 control (${s.label}): creating ${show(challenger)}, a name nobody holds, is accepted (answered ${create.status} ${create.text.slice(0, 200)})`).toBe(true);
    expect.soft(await keyOf(email, password), `ROW-254 control (${s.label}): the account signs in under that name`).toBe(nameKey(challenger));
    if (is2xx(create.status)) {
      const id = (JSON.parse(create.text) as { id: AccountId }).id;
      await switchAccount(admin, id, false);
      const on = await switchOnRaw(admin.api, id);
      expect.soft(is2xx(on.status), `ROW-254 control (${s.label}): switching ${show(challenger)} back on, nobody else holding it, is accepted (answered ${on.status})`).toBe(true);
      expect.soft(signedIn(await trySignIn({ email, password })), `ROW-254 control (${s.label}): it signs in again`).toBe(true);
    }
    // rename
    const renamedTo = formsOf(s).challenger;
    const ren = await renameRaw(admin.api, c.id, renamedTo);
    expect.soft(is2xx(ren.status), `ROW-254 control (${s.label}): renaming C to ${show(renamedTo)}, a name nobody holds, is accepted (answered ${ren.status})`).toBe(true);
    expect.soft(await keyOf(c.email, c.password), `ROW-254 control (${s.label}): the rename took effect`).toBe(nameKey(renamedTo));
  }
});

test('ROW-254.REQ-024.a-name-differing-only-by-invisible-characters-spaces-or-normal-form-is-refused-at-create-rename-and-switch-on', async () => {
  test.setTimeout(240_000);
  const admin = await start();
  const cName = freshName('Carla');
  const c = await createMember(admin, { name: cName });

  for (const s of shapes()) {
    const { holder, challenger } = formsOf(s);

    // Setup: D takes the challenger form while nobody holds the name, and is switched off; H then takes the holder
    // form (REQ-024 arm 2 lets it: the name's only other holder is switched off) and stays switched on.
    const d = await createMember(admin, { name: challenger }).catch((e: Error) => {
      throw new SetupError(`creating ${show(challenger)} while nobody holds the name failed (${e.message}); the switch-on case needs it (${s.label})`);
    });
    await switchAccount(admin, d.id, false);
    if (signedIn(await trySignIn({ email: d.email, password: d.password }))) {
      throw new SetupError(`the switched-off account ${d.email} still signs in (${s.label})`);
    }
    const h = await createMember(admin, { name: holder }).catch((e: Error) => {
      throw new SetupError(`creating ${show(holder)} while its only other holder is switched off failed (${e.message}); REQ-024 arm 2, ROW-255 (${s.label})`);
    });
    expect(await keyOf(h.email, h.password), `ROW-254 before (${s.label}): H is switched on and named ${show(holder)}`).toBe(nameKey(holder));

    // at create
    const bEmail = freshEmail('b');
    const bPassword = freshPassword();
    const create = await createAccountRaw(admin.api, { name: challenger, email: bEmail, password: bPassword, allowance: 25 });
    expect.soft(isRefusal(create.status), `ROW-254 create (${s.label}): ${show(challenger)} beside switched-on ${show(holder)} is refused (answered ${create.status})`).toBe(true);
    expect.soft(signedIn(await trySignIn({ email: bEmail, password: bPassword })), `ROW-254 create (${s.label}): no account B was made`).toBe(false);

    // at rename
    const ren = await renameRaw(admin.api, c.id, challenger);
    expect.soft(isRefusal(ren.status), `ROW-254 rename (${s.label}): renaming C to ${show(challenger)} beside switched-on ${show(holder)} is refused (answered ${ren.status})`).toBe(true);
    expect.soft(await nameOf(c.email, c.password), `ROW-254 rename (${s.label}): C keeps its own name`).toBe(cName);

    // at switch-on
    const on = await switchOnRaw(admin.api, d.id);
    expect.soft(isRefusal(on.status), `ROW-254 switch-on (${s.label}): switching D (${show(challenger)}) on while switched-on H holds ${show(holder)} is refused (answered ${on.status})`).toBe(true);
    expect.soft(signedIn(await trySignIn({ email: d.email, password: d.password })), `ROW-254 switch-on (${s.label}): D is still switched off (does not sign in)`).toBe(false);
    expect.soft(await keyOf(h.email, h.password), `ROW-254 switch-on (${s.label}): H is still switched on under its name`).toBe(nameKey(holder));
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-255 (A-058) promise: REQ-024 AMENDED fail-if (2) "a name used only by a switched-off account is refused", under
// ROW-255   the same comparison (A-058): a name differing from a switched-off holder's only by surrounding White_Space,
// ROW-255   default-ignorable code points, letter case or normal form is accepted at create, rename and switch-on.
// ROW-255 wrong product: one that, to meet A-058, refuses every name carrying a zero-width or other default-ignorable
// ROW-255   character, or a no-break or ideographic space; one that applies the new key over every account, switched on
// ROW-255   or off; one that strips invisible characters before storing and then compares against the switched-off
// ROW-255   accounts at rename or switch-on only.
// ROW-255 given: for each shape, a fresh base: H switched off with the holder form; and, for the rename, another
// ROW-255   fresh base held only by a switched-off account. when: (create) the admin creates B with the challenger form;
// ROW-255   (switch-on) switches B off and H on; (rename) renames switched-on C to the other base's challenger form.
// ROW-255   then: each act is accepted (2xx) and takes effect: B signs in under the challenger name, H signs in after
// ROW-255   being switched on, C signs in under its new name (each read back under REQ-024's key).
// ROW-255 controls: ROW-255.control.the-holders-are-switched-off-and-a-fresh-name-is-accepted (the holders really are
// ROW-255   off; a create works); and in this case, each holder is seen not to sign in before the act.
// ROW-255 technique: the row's shapes (as ROW-254, one ignorable and one White_Space drawn afresh per run) held only
// ROW-255   by a switched-off account, at each of the three acts, as soft assertions in one target case. The switch-on act
// ROW-255   needs B, made by the create act: when that create is refused the create's own assertion has already failed the
// ROW-255   row, and the switch-on is reported unreachable for that shape, as a failure, never skipped silently.
// ROW-255 cases: ROW-255 target=ROW-255.REQ-024.a-name-differing-only-by-invisible-characters-from-a-switched-off-holder-is-accepted-at-create-rename-and-switch-on control=ROW-255.control.the-holders-are-switched-off-and-a-fresh-name-is-accepted
test('ROW-255.REQ-024.a-name-differing-only-by-invisible-characters-from-a-switched-off-holder-is-accepted-at-create-rename-and-switch-on', async () => {
  test.setTimeout(240_000);
  const admin = await start();
  const c = await createMember(admin, { name: freshName('Carla') });

  for (const s of shapes()) {
    // at create
    const { holder, challenger } = formsOf(s);
    const h = await switchedOffHolder(admin, holder);
    const bEmail = freshEmail('b');
    const bPassword = freshPassword();
    const create = await createAccountRaw(admin.api, { name: challenger, email: bEmail, password: bPassword, allowance: 25 });
    expect.soft(is2xx(create.status), `ROW-255 create (${s.label}): ${show(challenger)}, held only by switched-off ${show(holder)}, is accepted (answered ${create.status} ${create.text.slice(0, 200)})`).toBe(true);
    expect.soft(await keyOf(bEmail, bPassword), `ROW-255 create (${s.label}): B signs in under that name`).toBe(nameKey(challenger));

    // at switch-on: B goes off, then H (the other form) comes on.
    if (is2xx(create.status)) {
      const bId = (JSON.parse(create.text) as { id: AccountId }).id;
      await switchAccount(admin, bId, false);
      if (signedIn(await trySignIn({ email: bEmail, password: bPassword }))) throw new SetupError(`the switched-off account ${bEmail} still signs in (${s.label})`);
      const on = await switchOnRaw(admin.api, h.id);
      expect.soft(is2xx(on.status), `ROW-255 switch-on (${s.label}): switching on ${show(holder)} while its only other holder ${show(challenger)} is switched off is accepted (answered ${on.status})`).toBe(true);
      expect.soft(signedIn(await trySignIn({ email: h.email, password: h.password })), `ROW-255 switch-on (${s.label}): H signs in`).toBe(true);
    } else {
      expect.soft(false, `ROW-255 switch-on (${s.label}): unreachable — the create it needs was refused (above)`).toBe(true);
    }

    // at rename
    const other = formsOf(s);
    await switchedOffHolder(admin, other.holder);
    const ren = await renameRaw(admin.api, c.id, other.challenger);
    expect.soft(is2xx(ren.status), `ROW-255 rename (${s.label}): renaming C to ${show(other.challenger)}, held only by switched-off ${show(other.holder)}, is accepted (answered ${ren.status})`).toBe(true);
    expect.soft(await keyOf(c.email, c.password), `ROW-255 rename (${s.label}): C signs in under its new name`).toBe(nameKey(other.challenger));
  }
});
