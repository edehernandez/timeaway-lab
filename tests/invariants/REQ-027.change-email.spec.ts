// Purpose: ledger tests for ROW-263, ROW-264, ROW-265 and ROW-266 (REQ-027) — the admin can change an account's email; a new email another account holds (ignoring letter case and surrounding spaces) is refused; afterwards only the new email signs in; and nobody but the admin changes an email.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, accounts, switch), fresh per run.
//
// Boundary (R6): an account rule, proved at the HTTP harness on D-029's POST /api/admin/accounts/:id/email {email}
// (harness.ts changeEmail's reading). The effect is read where an email matters: sign-in (POST /api/auth/sign-in,
// then GET /api/me on the same jar) and the admin's GET /api/admin/people (the people page's data, REQ-020).
// Emails are compared "as at creation" (A-044, REQ-013 amended): ignoring letter case and surrounding spaces.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  resetProduct,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { changeEmailRaw, getRaw, is2xx, isRefusal, postRaw, signedIn, trySignIn } from './admin-kit';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

async function start(): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return { install, admin: keep(await signIn(install.admin)) };
}

async function peopleText(admin: Actor): Promise<string> {
  const r = await getRaw(admin.api, '/api/admin/people');
  expect(r.status, 'GET /api/admin/people answers the admin').toBe(200);
  return r.text;
}

/** How many times `email` occurs in `text`, ignoring letter case. */
function occurrences(text: string, email: string): number {
  return text.toLowerCase().split(email.toLowerCase()).length - 1;
}

/** True when `email` with `password` signs in to the account `id`. */
async function signsInAs(email: string, password: string, id: Member['id']): Promise<boolean> {
  const a = await trySignIn({ email, password });
  return signedIn(a) && String(a.me?.id) === String(id);
}

// ---------------------------------------------------------------------------------------------------
// ROW-263 promise: REQ-027 fail-if (1) "the admin cannot change an account's email"; A-044 "the admin can change an
// ROW-263   account's email from the people page".
// ROW-263 wrong product: no email route (only name, password, allowance and switch); a route that answers 200 and
// ROW-263   stores nothing; one that adds the new email as a second account rather than changing this one.
// ROW-263 given: member T with fresh email E1 beside member O. when: the admin posts T's email as fresh E2. then: the
// ROW-263   act answers 2xx; the people data, which before carried E1 and not E2, now carries E2 once and E1 nowhere;
// ROW-263   O's email is still listed.
// ROW-263 controls: the control case shows the people data lists T's E1 and O's email — the admin's view is reached.
// ROW-263 technique: before and after on the admin's own list, with a neighbouring account that must stay.
// ROW-263 cases: ROW-263 target=ROW-263.REQ-027.the-admin-changes-an-accounts-email control=ROW-263.control.the-people-data-lists-the-accounts
test('ROW-263.control.the-people-data-lists-the-accounts', async () => {
  const { admin } = await start();
  const t = await createMember(admin, { email: freshEmail('first') });
  const o = await createMember(admin, { email: freshEmail('other') });
  const text = await peopleText(admin);
  expect(occurrences(text, t.email), 'ROW-263 control: T is listed with its email').toBe(1);
  expect(occurrences(text, o.email), 'ROW-263 control: O is listed with its email').toBe(1);
});

test('ROW-263.REQ-027.the-admin-changes-an-accounts-email', async () => {
  const { admin } = await start();
  const t = await createMember(admin, { email: freshEmail('first') });
  const o = await createMember(admin, { email: freshEmail('other') });
  const e2 = freshEmail('second');
  const before = await peopleText(admin);
  expect(occurrences(before, t.email), 'ROW-263 before: T is listed with E1').toBe(1);
  expect(occurrences(before, e2), 'ROW-263 before: E2 is nowhere').toBe(0);

  const r = await changeEmailRaw(admin.api, t.id, e2);
  expect.soft(is2xx(r.status), `ROW-263: the admin's email change is accepted (answered ${r.status} ${r.text.slice(0, 200)})`).toBe(true);
  const after = await peopleText(admin);
  expect.soft(occurrences(after, e2), 'ROW-263: the people data carries E2 once').toBe(1);
  expect.soft(occurrences(after, t.email), 'ROW-263: the people data no longer carries E1').toBe(0);
  expect.soft(occurrences(after, o.email), "ROW-263: O's email is untouched").toBe(1);
});

// ---------------------------------------------------------------------------------------------------
// ROW-264 promise: REQ-027 fail-if (2) "the new email is accepted when another account holds it, ignoring letter
// ROW-264   case and surrounding spaces"; A-044 "unique and compared the same way as at create".
// ROW-264 wrong product: a check comparing as typed (an upper-cased or space-padded copy passes); one that trims but
// ROW-264   does not fold case; one that checks only switched-on accounts, or skips the admin's account.
// ROW-264 given: member T, member O, member S switched off, the admin — each with a fresh email. when: the admin posts
// ROW-264   T's email as O's email exactly, upper-cased, padded with spaces, padded and capitalised; S's email
// ROW-264   upper-cased; the admin's email padded. then: each answers 4xx; T still signs in with its own email; each
// ROW-264   held email still occurs once at most in the people data (no second holder).
// ROW-264 controls: the control case posts a near miss — "x" + O's email, a different address — and it is accepted
// ROW-264   and signs T in: the route works and the target's refusals are the rule.
// ROW-264 technique: near misses either side of the comparison (case and spaces must collide; one extra letter must
// ROW-264   not), and a switched-off holder and the admin as holders a narrower check would miss.
// ROW-264 cases: ROW-264 target=ROW-264.REQ-027.an-email-another-account-holds-is-refused control=ROW-264.control.a-near-miss-email-is-accepted
test('ROW-264.control.a-near-miss-email-is-accepted', async () => {
  const { admin } = await start();
  const t = await createMember(admin, { email: freshEmail('t') });
  const o = await createMember(admin, { email: freshEmail('o') });
  const near = `x${o.email}`;
  const r = await changeEmailRaw(admin.api, t.id, near);
  expect(is2xx(r.status), `ROW-264 control: "${near}" is accepted (answered ${r.status})`).toBe(true);
  expect(await signsInAs(near, t.password, t.id), 'ROW-264 control: T signs in with it').toBe(true);
});

test('ROW-264.REQ-027.an-email-another-account-holds-is-refused', async () => {
  const { install, admin } = await start();
  const t = await createMember(admin, { email: freshEmail('t') });
  const o = await createMember(admin, { email: freshEmail('o') });
  const s = await createMember(admin, { email: freshEmail('s') });
  await switchAccount(admin, s.id, false);
  const capital = o.email.charAt(0).toUpperCase() + o.email.slice(1);

  const tries: [string, string][] = [
    ["O's email exactly", o.email],
    ["O's email upper-cased", o.email.toUpperCase()],
    ["O's email padded with spaces", `   ${o.email}   `],
    ["O's email capitalised and padded", ` ${capital} `],
    ["switched-off S's email upper-cased", s.email.toUpperCase()],
    ["the admin's email padded", `  ${install.admin.email}  `],
  ];
  for (const [what, email] of tries) {
    const r = await changeEmailRaw(admin.api, t.id, email);
    expect.soft(isRefusal(r.status), `ROW-264: ${what} as T's new email is refused (answered ${r.status})`).toBe(true);
  }

  expect.soft(await signsInAs(t.email, t.password, t.id), 'ROW-264: T still signs in with its own email').toBe(true);
  const text = await peopleText(admin);
  expect.soft(occurrences(text, o.email), "ROW-264: O's email has one holder").toBe(1);
  expect.soft(occurrences(text, s.email) <= 1, "ROW-264: S's email has one holder at most").toBe(true);
  expect.soft(occurrences(text, install.admin.email) <= 1, "ROW-264: the admin's email has one holder at most").toBe(true);
  expect.soft(occurrences(text, t.email), "ROW-264: T's own email is still T's").toBe(1);
});

// ---------------------------------------------------------------------------------------------------
// ROW-265 promise: REQ-027 fail-if (3) "after the change the old email still signs in or the new one does not";
// ROW-265   REQ-027 "the account then signs in only with the new email".
// ROW-265 wrong product: an email kept as an alias list (old and new both sign in); a change stored on the people
// ROW-265   record but not on the sign-in lookup (only the old one signs in); a lookup that matches the old email in
// ROW-265   another case.
// ROW-265 given: member T with fresh E1 and its own password. when: the admin changes T's email to fresh E2. then:
// ROW-265   E1 with T's password makes no session, nor does E1 upper-cased; E2 with T's password signs in to T.
// ROW-265 controls: the control case shows, before any change, E1 signs T in and E2 signs no one in — the reads
// ROW-265   distinguish the two emails.
// ROW-265 technique: before and after on the same credentials; the session (GET /api/me's id), not the status.
// ROW-265 cases: ROW-265 target=ROW-265.REQ-027.after-the-change-only-the-new-email-signs-in control=ROW-265.control.before-the-change-only-the-old-email-signs-in
test('ROW-265.control.before-the-change-only-the-old-email-signs-in', async () => {
  const { admin } = await start();
  const t = await createMember(admin, { email: freshEmail('first') });
  const e2 = freshEmail('second');
  expect(await signsInAs(t.email, t.password, t.id), 'ROW-265 control: E1 signs T in').toBe(true);
  expect(signedIn(await trySignIn({ email: e2, password: t.password })), 'ROW-265 control: E2 signs no one in').toBe(false);
});

test('ROW-265.REQ-027.after-the-change-only-the-new-email-signs-in', async () => {
  const { admin } = await start();
  const t = await createMember(admin, { email: freshEmail('first') });
  const e2 = freshEmail('second');
  const r = await changeEmailRaw(admin.api, t.id, e2);
  expect(is2xx(r.status), `ROW-265: the email change is accepted (answered ${r.status})`).toBe(true);
  expect.soft(signedIn(await trySignIn({ email: t.email, password: t.password })), 'ROW-265: the old email no longer signs in').toBe(false);
  expect.soft(signedIn(await trySignIn({ email: t.email.toUpperCase(), password: t.password })), 'ROW-265: nor the old email upper-cased').toBe(false);
  expect.soft(await signsInAs(e2, t.password, t.id), 'ROW-265: the new email signs T in').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-266 promise: REQ-027 fail-if (4) "anyone but the admin changes an email"; INV-003 "only the admin … changes an
// ROW-266   account's email … a refused attempt changes nothing".
// ROW-266 wrong product: an email route under /api/admin that checks for a session but not for the admin; one that
// ROW-266   lets a member change their own account's email; a member-side /api/me/email route; a refusal answered
// ROW-266   after the change was stored.
// ROW-266 given: members M1 (signed in) and M2, fresh emails. when: M1 posts M2's email as fresh F1 and its own
// ROW-266   account's email as fresh F2 on the admin route, and its own email as fresh F3 on POST /api/me/email; an
// ROW-266   anonymous caller posts M2's email as fresh F4. then: each answers non-2xx; F1–F4 sign no one in and occur
// ROW-266   nowhere in the people data; M1 and M2 still sign in with their own emails.
// ROW-266 controls: the control case has the admin post M2's email as fresh F5 on the same route: 2xx, and F5 signs
// ROW-266   M2 in — the route and the body work, so the target's refusals are the guard.
// ROW-266 technique: every non-admin actor (another member, the account's owner, the anonymous caller) at every
// ROW-266   door, with the effect read afterwards.
// ROW-266 cases: ROW-266 target=ROW-266.REQ-027.nobody-but-the-admin-changes-an-email control=ROW-266.control.the-admin-changes-an-email-on-the-same-route
test('ROW-266.control.the-admin-changes-an-email-on-the-same-route', async () => {
  const { admin } = await start();
  const m2 = await createMember(admin, { email: freshEmail('m2') });
  const f5 = freshEmail('f5');
  const r = await changeEmailRaw(admin.api, m2.id, f5);
  expect(is2xx(r.status), `ROW-266 control: the admin's change is accepted (answered ${r.status})`).toBe(true);
  expect(await signsInAs(f5, m2.password, m2.id), 'ROW-266 control: F5 signs M2 in').toBe(true);
});

test('ROW-266.REQ-027.nobody-but-the-admin-changes-an-email', async () => {
  const { admin } = await start();
  const m1 = await createMember(admin, { email: freshEmail('m1') });
  const m2 = await createMember(admin, { email: freshEmail('m2') });
  const s1 = keep(await signInMember(m1));
  const [f1, f2, f3, f4] = [freshEmail('f1'), freshEmail('f2'), freshEmail('f3'), freshEmail('f4')];

  const byMember: [string, () => Promise<{ status: number }>][] = [
    ["M1 changes M2's email", () => changeEmailRaw(s1.api, m2.id, f1)],
    ["M1 changes its own account's email on the admin route", () => changeEmailRaw(s1.api, m1.id, f2)],
    ['M1 changes its own email on /api/me/email', () => postRaw(s1.api, '/api/me/email', { email: f3 })],
  ];
  for (const [what, call] of byMember) {
    const r = await call();
    expect.soft(is2xx(r.status), `ROW-266: ${what} is refused (answered ${r.status})`).toBe(false);
  }
  const anon = await anonymousApi();
  try {
    const r = await changeEmailRaw(anon, m2.id, f4);
    expect.soft(is2xx(r.status), `ROW-266: an anonymous caller changing M2's email is refused (answered ${r.status})`).toBe(false);
  } finally {
    await anon.dispose();
  }

  const text = await peopleText(admin);
  for (const [f, pw] of [
    [f1, m2.password],
    [f2, m1.password],
    [f3, m1.password],
    [f4, m2.password],
  ] as [string, string][]) {
    expect.soft(signedIn(await trySignIn({ email: f, password: pw })), `ROW-266: ${f} signs no one in`).toBe(false);
    expect.soft(occurrences(text, f), `ROW-266: ${f} is nowhere in the people data`).toBe(0);
  }
  expect.soft(await signsInAs(m1.email, m1.password, m1.id), 'ROW-266: M1 still signs in with its own email').toBe(true);
  expect.soft(await signsInAs(m2.email, m2.password, m2.id), 'ROW-266: M2 still signs in with its own email').toBe(true);
});
