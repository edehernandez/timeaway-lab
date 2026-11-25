// Purpose: hostility probe HOS-007 (protects REQ-014, ROW-068) — through the sign-in page's form, a correct email with a wrong password leaves no session.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, accounts with their own chosen passwords), fresh per run; the form operated in the browser through harness.ts's engine and route-census.ts submitSignInForm.
//
// Boundary (R6): the probe's own words are "through the sign-in form", so the attempt is made where a person makes
// it, in the browser; "no session" is read where the product decides it, GET /api/me on the page's own cookies.
//
// HOS-007 promise: REQ-014 fail-if (2) "a wrong password signs in"; D-032 (passwords are scrypt hashes compared
// HOS-007   with timingSafeEqual); D-026/D-033 (5 wrong attempts within 15 minutes start a wait — every case here makes
// HOS-007   at most 3 wrong attempts per email, so a wait never stands in for a refusal).
// HOS-007 wrong product: a sign-in that skips the password comparison (the probe's own toggle) and makes a session
// HOS-007   for any password of a known email; one that compares case-insensitively, or only a prefix; one that checks
// HOS-007   the password against any account's hash (so the admin's password opens the member's account); one that sets
// HOS-007   the session cookie before the check and answers a refusal after it, leaving a working session behind.
// HOS-007 given: a fresh install; a member M with her own chosen password, and the admin with his.
// HOS-007 when: in a fresh browser each time, the sign-in form is submitted with M's email and (1) M's password with
// HOS-007   its last character changed, (2) M's password with its letter case swapped, (3) the admin's real password.
// HOS-007 then: each submission's POST was seen answered, and afterwards GET /api/me on that browser's cookies is
// HOS-007   not 200.
// HOS-007 controls: the control case submits the same form with M's email and M's own password: its POST is seen and
// HOS-007   GET /api/me then answers 200 with M's id — the form path does make a session, so the target's "no session"
// HOS-007   is the password's doing.
// HOS-007 technique: near misses of the right password (one character, letter case) and a real password of another
// HOS-007   account as decoys; the session, not the page or the status, is the observed effect.
// HOS-007 cases: HOS-007 target=HOS-007.REQ-014.a-wrong-password-through-the-sign-in-form-leaves-no-session control=HOS-007.control.the-right-password-through-the-form-makes-a-session
import { test, expect, type Browser } from '@playwright/test';
import { createMember, DEFAULT_TIME_ZONE, openPage, resetProduct, signIn, type Actor, type Install, type Member } from './harness';
import { submitSignInForm, type FormSignIn } from './route-census';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland

let admin: Actor | undefined;
test.afterEach(async () => {
  await admin?.dispose().catch(() => undefined);
  admin = undefined;
});

async function start(): Promise<{ install: Install; member: Member }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  admin = await signIn(install.admin);
  const member = await createMember(admin);
  return { install, member };
}

/** One submission of the form in a fresh browser context (no cookie from an earlier attempt). */
async function throughForm(browser: Browser, email: string, password: string): Promise<FormSignIn> {
  const opened = await openPage(browser, 'anonymous');
  try {
    return await submitSignInForm(opened.page, email, password);
  } finally {
    await opened.close();
  }
}

function swapCase(s: string): string {
  return [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
}

function changeLast(s: string): string {
  const last = s[s.length - 1];
  return s.slice(0, -1) + (last === 'x' ? 'y' : 'x');
}

test('HOS-007.control.the-right-password-through-the-form-makes-a-session', async ({ browser }) => {
  const { member } = await start();
  const r = await throughForm(browser, member.email, member.password);
  expect(r.post, 'HOS-007 control: the form sent its POST').not.toBeNull();
  expect(r.meStatus, 'HOS-007 control: the right password makes a session').toBe(200);
  expect(String(r.meId), "HOS-007 control: the session is M's").toBe(String(member.id));
});

test('HOS-007.REQ-014.a-wrong-password-through-the-sign-in-form-leaves-no-session', async ({ browser }) => {
  const { install, member } = await start();
  const wrongs: [string, string][] = [
    ['her password with its last character changed', changeLast(member.password)],
    ['her password with its letter case swapped', swapCase(member.password)],
    ["the admin's real password", install.admin.password],
  ];
  for (const [label, password] of wrongs) {
    expect(password, `HOS-007 (setup): ${label} differs from her password`).not.toBe(member.password);
    const r = await throughForm(browser, member.email, password);
    expect.soft(r.post, `HOS-007 ${label}: the form sent its POST (the attempt reached the product)`).not.toBeNull();
    expect.soft(r.meStatus, `HOS-007 ${label}: no session after the form (GET /api/me answered ${r.meStatus})`).not.toBe(200);
  }
});
