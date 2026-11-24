// Purpose: ledger tests for ROW-220, ROW-232 and ROW-233 (REQ-015, REQ-013) — changing one's own password ends every other session but keeps the changer signed in, and the admin setting another's password keeps the admin signed in; a blank password can never be set or sign in; a password round-trips exactly as typed, spaces and accents included.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, password set and change, sign-in), fresh per run.
//
// Boundary (R6): session and password rules, proved at the HTTP harness — POST /api/me/password {current,next},
// POST /api/admin/accounts/:id/password {password}, POST /api/admin/accounts, POST /api/auth/sign-in (D-029).
// "Signed in" is judged by GET /api/me on the session's own jar. D-026: no email here takes more than 3 wrong
// attempts, so the attempt bound never stands in for a refusal.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  fresh,
  freshEmail,
  freshName,
  setPassword,
  signIn,
  signInMember,
  type Actor,
} from './harness';
import { disposeAll, freshTeam, isRuleRefusal, keep, peopleText } from './robustness';

test.afterEach(disposeAll);

async function alive(actor: Actor): Promise<number> {
  return (await actor.api.get('/api/me')).status();
}

/** Signs in on a fresh jar; answers the session's account id, or null when no session resulted. */
async function signsInAs(email: string, password: string): Promise<string | null> {
  const api = await anonymousApi();
  try {
    await api.post('/api/auth/sign-in', { data: { email, password } });
    const me = await api.get('/api/me');
    return me.status() === 200 ? String(((await me.json()) as { id: unknown }).id) : null;
  } finally {
    await api.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-220 promise: the row — changing one's own password ends every other session but keeps the changer signed in;
// ROW-220   the admin setting another's password keeps the admin signed in; REQ-015 fail-if (5) a session other than
// ROW-220   the changer's keeps working after a set or change; A-034.
// ROW-220 wrong product: a change that deletes every session of the account, the changer's own too (the person is
// ROW-220   thrown out mid-task); an admin password set that ends the ADMIN's sessions (the actor's) instead of, or as
// ROW-220   well as, the target's; or a change that ends no session at all.
// ROW-220 given: member M with sessions S1 and S2; member N with session N1; the admin with sessions A1 and A2. when:
// ROW-220   S1 changes M's password; A1 sets N's password. then: S1 still answers /api/me and /api/balance; S2 does
// ROW-220   not; M's new password signs in and the old does not; A1 and A2 still answer /api/me and A1 still reads the
// ROW-220   people list; N1 does not answer.
// ROW-220 controls: the control case shows all five sessions answering /api/me before any change — each was alive,
// ROW-220   so a dead one after is the change's doing.
// ROW-220 technique: before/after on each session; the neighbouring sessions (the admin's second, the changer's
// ROW-220   own) that must stay untouched beside the ones that must end.
// ROW-220 cases: ROW-220 target=ROW-220.REQ-015.a-change-ends-the-other-sessions-and-keeps-the-changer control=ROW-220.control.every-session-answers-before-the-change
async function fiveSessions() {
  const { install, admin } = await freshTeam();
  const m = await createMember(admin);
  const n = await createMember(admin);
  const s1 = keep(await signInMember(m));
  const s2 = keep(await signInMember(m));
  const n1 = keep(await signInMember(n));
  const a2 = keep(await signIn(install.admin));
  return { admin, a2, m, n, s1, s2, n1 };
}

test('ROW-220.control.every-session-answers-before-the-change', async () => {
  const w = await fiveSessions();
  for (const [label, s] of [['S1', w.s1], ['S2', w.s2], ['N1', w.n1], ['A1', w.admin], ['A2', w.a2]] as [string, Actor][]) {
    expect.soft(await alive(s), `ROW-220 control: ${label} answers /api/me`).toBe(200);
  }
});

test('ROW-220.REQ-015.a-change-ends-the-other-sessions-and-keeps-the-changer', async () => {
  const w = await fiveSessions();
  const next = `Pw-${fresh('own')}`;
  const res = await w.s1.api.post('/api/me/password', { data: { current: w.m.password, next } });
  expect(res.status(), 'ROW-220 setup: the own change is accepted').toBeLessThan(300);
  expect.soft(await alive(w.s1), "ROW-220: the changer's session still answers").toBe(200);
  expect.soft((await w.s1.api.get('/api/balance')).status(), "ROW-220: the changer's session still acts").toBe(200);
  expect.soft(await alive(w.s2), "ROW-220: M's other session has ended").not.toBe(200);
  expect.soft(await signsInAs(w.m.email, next), 'ROW-220: the new password signs in').toBe(String(w.m.id));
  expect.soft(await signsInAs(w.m.email, w.m.password), 'ROW-220: the old password does not').toBeNull();

  await setPassword(w.admin, w.n.id, `Pw-${fresh('set')}`);
  expect.soft(await alive(w.admin), "ROW-220: the admin's own session (A1) still answers").toBe(200);
  expect.soft((await w.admin.api.get('/api/admin/people')).status(), 'ROW-220: A1 still reads the people list').toBe(200);
  expect.soft(await alive(w.a2), "ROW-220: the admin's other session (A2) still answers").toBe(200);
  expect.soft(await alive(w.n1), "ROW-220: N's session has ended").not.toBe(200);
});

// ---------------------------------------------------------------------------------------------------
// ROW-232 promise: the row — a blank password can never be set or sign in; a password round-trips exactly as typed,
// ROW-232   spaces and non-ASCII included; its examples: after setting a password with surrounding spaces, the trimmed
// ROW-232   form is refused; a password of only spaces counts as blank. REQ-015, REQ-013 (an account is never created
// ROW-232   without a password), D-014 (never blank; compared exactly as typed).
// ROW-232 wrong product: a check of length >= 8 alone, so eight spaces pass as a password; a form or route that trims
// ROW-232   the password at set but not at sign-in (or at both, so "  pw  " and "pw" are one password); a hash taken
// ROW-232   after an ASCII-folding or NFKD step.
// ROW-232 given: member M (own password); member N. when: the admin creates accounts with passwords "", eight spaces,
// ROW-232   eight tabs; sets M's password to ten spaces; M changes its own to ten spaces; M's email signs in with "" and
// ROW-232   eight spaces; the admin sets N's password to "  Ça va ñ <fresh>  "; N signs in with it and with it trimmed;
// ROW-232   N changes its own to "  Grüße <fresh> à tous  " and signs in with it and with it trimmed.
// ROW-232   then: every blank create, set and change is refused, no such account exists and M's own password still signs
// ROW-232   in; blank sign-ins give no session; N's exact passwords give sessions of N; the trimmed forms do not.
// ROW-232 controls: the control case has the admin set an ordinary fresh password for N, which then signs in — the
// ROW-232   set route and sign-in work; in the target N's exact sign-ins show the set and change took effect, so the
// ROW-232   trimmed refusals mean something.
// ROW-232 technique: the boundary of blank (empty; only spaces at the length minimum; other white space) and near
// ROW-232   misses of an exact password (the same characters trimmed).
// ROW-232 cases: ROW-232 target=ROW-232.REQ-015.blank-passwords-never-set-or-sign-in-and-passwords-are-exact control=ROW-232.control.an-ordinary-password-set-by-the-admin-signs-in
test('ROW-232.control.an-ordinary-password-set-by-the-admin-signs-in', async () => {
  const { admin } = await freshTeam();
  const n = await createMember(admin);
  const pw = `Pw-${fresh('ok')}`;
  await setPassword(admin, n.id, pw);
  expect(await signsInAs(n.email, pw), 'ROW-232 control: the password the admin set signs in').toBe(String(n.id));
});

test('ROW-232.REQ-015.blank-passwords-never-set-or-sign-in-and-passwords-are-exact', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const emails: string[] = [];
  for (const [label, pw] of [['empty', ''], ['eight spaces', '        '], ['eight tabs', '\t\t\t\t\t\t\t\t']]) {
    const email = freshEmail('blankpw');
    emails.push(email);
    const res = await admin.api.post('/api/admin/accounts', { data: { name: freshName('Blank'), email, password: pw, allowance: 10 } });
    expect.soft(isRuleRefusal(res.status()), `ROW-232 create with a ${label} password is refused (answered ${res.status()})`).toBe(true);
  }
  const people = (await peopleText(admin)).toLowerCase();
  expect.soft(emails.filter((e) => people.includes(e)), 'ROW-232: no account was created with a blank password').toEqual([]);

  const ten = '          ';
  const set = await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(m.id))}/password`, { data: { password: ten } });
  expect.soft(isRuleRefusal(set.status()), `ROW-232 the admin setting ten spaces is refused (answered ${set.status()})`).toBe(true);
  const mSession = keep(await signInMember(m));
  const change = await mSession.api.post('/api/me/password', { data: { current: m.password, next: ten } });
  expect.soft(isRuleRefusal(change.status()), `ROW-232 M changing its own to ten spaces is refused (answered ${change.status()})`).toBe(true);
  expect.soft(await signsInAs(m.email, m.password), "ROW-232: M's own password still signs in").toBe(String(m.id));
  expect.soft(await signsInAs(m.email, ''), 'ROW-232: an empty password gives no session').toBeNull();
  expect.soft(await signsInAs(m.email, '        '), 'ROW-232: a password of spaces gives no session').toBeNull();

  const n = await createMember(admin);
  const tag = fresh('p');
  const adminSet = `  Ça va ñ ${tag}  `;
  await setPassword(admin, n.id, adminSet);
  expect.soft(await signsInAs(n.email, adminSet), 'ROW-232: the spaced accented password set by the admin signs in exactly').toBe(String(n.id));
  expect.soft(await signsInAs(n.email, adminSet.trim()), 'ROW-232: its trimmed form is refused').toBeNull();
  const nSession = keep(await signIn({ email: n.email, password: adminSet }));
  const own = `  Grüße ${tag} à tous  `;
  const ownChange = await nSession.api.post('/api/me/password', { data: { current: adminSet, next: own } });
  expect(ownChange.status(), "ROW-232 setup: N's own change is accepted").toBeLessThan(300);
  expect.soft(await signsInAs(n.email, own), "ROW-232: N's own spaced accented password signs in exactly").toBe(String(n.id));
  expect.soft(await signsInAs(n.email, own.trim()), 'ROW-232: its trimmed form is refused').toBeNull();
});

// ---------------------------------------------------------------------------------------------------
// ROW-233 promise: the row (control of ROW-232) — a password with spaces and accents signs in exactly as set;
// ROW-233   REQ-015, REQ-013, D-014 (compared exactly as typed).
// ROW-233 wrong product: a sign-in that NFC/NFD-normalises or trims only one side, so a password set as "  Café crème
// ROW-233   …  " never signs in again (the person is locked out by their own choice); or a form that drops non-ASCII.
// ROW-233 given: member X with its own password. when: X changes it to "  Café crème <fresh>  " (current given) and
// ROW-233   signs in with exactly that. then: the sign-in gives a session of X.
// ROW-233 controls: the control case signs X in with its earlier password before the change: the account and the
// ROW-233   sign-in route work.
// ROW-233 technique: the row's own example (spaces and accents), exact equality of the account id.
// ROW-233 cases: ROW-233 target=ROW-233.REQ-015.a-spaced-accented-password-signs-in-exactly-as-set control=ROW-233.control.the-earlier-password-signs-in
test('ROW-233.control.the-earlier-password-signs-in', async () => {
  const { admin } = await freshTeam();
  const x = await createMember(admin);
  expect(await signsInAs(x.email, x.password), 'ROW-233 control: X signs in with its earlier password').toBe(String(x.id));
});

test('ROW-233.REQ-015.a-spaced-accented-password-signs-in-exactly-as-set', async () => {
  const { admin } = await freshTeam();
  const x = await createMember(admin);
  const session = keep(await signInMember(x));
  const next = `  Café crème ${fresh('c')}  `;
  const res = await session.api.post('/api/me/password', { data: { current: x.password, next } });
  expect(res.status(), 'ROW-233 setup: the change is accepted').toBeLessThan(300);
  expect(await signsInAs(x.email, next), 'ROW-233: the spaced accented password signs in exactly as set').toBe(String(x.id));
});
