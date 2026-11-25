// Purpose: hostility probe HOS-008 (protects REQ-014) — through the sign-in page's form, a switched-off account with its correct password gets no session.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, accounts with their own chosen passwords, the confirmed switch-off), fresh per run; the form operated in the browser through route-census.ts submitSignInForm; the session rows read through the store door (doors-store.ts, D-048, D-049) — store reads added by brief test-author-21.
//
// Boundary (R6): "through the sign-in form" is the probe's own door, so the attempt is made in the browser; "no
// session" is read at GET /api/me on the page's own cookies AND in the store itself (D-003: a session is a server-side
// row), because a second guard — the session read refusing a switched-off account — hides from GET /api/me a session
// row the sign-in should never have made.
//
// HOS-008 promise: REQ-014 fail-if (3) "a switched-off account signs in"; A-008 (after an account is switched off
// HOS-008   it cannot sign in); D-045 (the refusal is the same 401 as any other).
// HOS-008 wrong product: a sign-in that skips the switched-on check (the probe's own toggle) and checks the password
// HOS-008   alone; a switch-off that only ends the open sessions; a check made on the page while the sign-in route
// HOS-008   itself still makes the session.
// HOS-008 given: a fresh install; members M and N, each with her own chosen password; the admin switches M off
// HOS-008   through the confirmed two-step action.
// HOS-008 when: in a fresh browser, the sign-in form is submitted with M's email and M's correct password; then, in
// HOS-008   another fresh browser, with N's.
// HOS-008 then: M's submission's POST was seen answered with a refusal (D-033/D-045's 401, a 429 wait, or D-035's 303
// HOS-008   for a native form post — never a 2xx) and GET /api/me on that browser's cookies is not 200; the store holds
// HOS-008   no session row made by the attempt and no session row of M's account at all; N, still switched on, gets a
// HOS-008   session with her own id through the same form in the same state.
// HOS-008 controls: the control case submits M's same email and password through the form BEFORE the switch-off
// HOS-008   and gets a session with M's id — the very credentials work until the switch-off, so the target's refusal is
// HOS-008   the switch-off's doing; the same submission makes a session row of M's account in the store that was not
// HOS-008   there before it, so the store reading sees the row a sign-in makes (it is not empty by construction); the
// HOS-008   target's N is the neighbour that must stay able to sign in.
// HOS-008 technique: before/after around the switch-off with the very same credentials, and the neighbouring
// HOS-008   account that must stay untouched; the session observed where it lives (the store), before/after the attempt,
// HOS-008   so the probe's own toggle (skip the switched-on check at sign-in) turns it red even while the session read holds.
// HOS-008 cases: HOS-008 target=HOS-008.REQ-014.a-switched-off-account-gets-no-session-through-the-sign-in-form control=HOS-008.control.the-same-credentials-make-a-session-before-the-switch-off
import { test, expect, type Browser } from '@playwright/test';
import { createMember, DEFAULT_TIME_ZONE, openPage, resetProduct, signIn, switchAccount, type Actor, type Member } from './harness';
import { submitSignInForm, type FormSignIn } from './route-census';
import { newRowsSince, sessionRowsOfAccount, storedAccount, tableRows } from './doors-store';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland

let admin: Actor | undefined;
test.afterEach(async () => {
  await admin?.dispose().catch(() => undefined);
  admin = undefined;
});

async function start(): Promise<{ admin: Actor; m: Member; n: Member }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  admin = await signIn(install.admin);
  const m = await createMember(admin);
  const n = await createMember(admin);
  return { admin, m, n };
}

async function throughForm(browser: Browser, member: Member): Promise<FormSignIn> {
  const opened = await openPage(browser, 'anonymous');
  try {
    return await submitSignInForm(opened.page, member.email, member.password);
  } finally {
    await opened.close();
  }
}

test('HOS-008.control.the-same-credentials-make-a-session-before-the-switch-off', async ({ browser }) => {
  const { m } = await start();
  const mKey = (await storedAccount(m.email)).key;
  const sessionsBefore = await tableRows('sessions');
  const mineBefore = await sessionRowsOfAccount(mKey);
  const r = await throughForm(browser, m);
  expect(r.post, 'HOS-008 control: the form sent its POST').not.toBeNull();
  expect(r.meStatus, 'HOS-008 control: M, switched on, gets a session through the form').toBe(200);
  expect(String(r.meId), "HOS-008 control: the session is M's").toBe(String(m.id));
  const made = await newRowsSince('sessions', sessionsBefore);
  const mineAfter = await sessionRowsOfAccount(mKey);
  expect(
    mineAfter.length,
    `HOS-008 control: the form's sign-in made a session row of M's account in the store (${mineBefore.length} before, ${mineAfter.length} after)`,
  ).toBeGreaterThan(mineBefore.length);
  expect(made.length, 'HOS-008 control: the store shows a session row the sign-in made').toBeGreaterThan(0);
});

test('HOS-008.REQ-014.a-switched-off-account-gets-no-session-through-the-sign-in-form', async ({ browser }) => {
  const t = await start();
  await switchAccount(t.admin, t.m.id, false);
  const mKey = (await storedAccount(t.m.email)).key;
  const sessionsBefore = await tableRows('sessions');

  const r = await throughForm(browser, t.m);
  expect.soft(r.post, 'HOS-008: the form sent its POST for the switched-off account (the attempt reached the product)').not.toBeNull();
  expect.soft(r.meStatus, `HOS-008: no session for the switched-off account (GET /api/me answered ${r.meStatus})`).not.toBe(200);
  const answered = r.post?.status ?? 0;
  expect.soft(
    answered === 401 || answered === 429 || answered === 303,
    `HOS-008: the sign-in answer to the switched-off account is a refusal (401, a 429 wait, or a native form post's 303), never a sign-in (answered ${r.post ? answered : 'nothing'} at ${r.post?.path ?? '-'})`,
  ).toBe(true);
  const made = await newRowsSince('sessions', sessionsBefore);
  expect.soft(made, "HOS-008: the store holds no session row made by the switched-off account's sign-in attempt").toEqual([]);
  const mine = await sessionRowsOfAccount(mKey);
  expect.soft(mine, "HOS-008: the store holds no session row of the switched-off account").toEqual([]);

  const n = await throughForm(browser, t.n);
  expect.soft(n.meStatus, 'HOS-008: N, still switched on, gets a session through the same form').toBe(200);
  expect.soft(String(n.meId), "HOS-008: N's session is N's").toBe(String(t.n.id));
});
