// Purpose: ledger tests for ROW-215 (REQ-013, REQ-014) and ROW-216 (REQ-020) — an email is trimmed and compared without regard to letter case at creation and at sign-in; creating or renaming an account with an empty or blank name is refused.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, rename, sign-in), fresh per run.
//
// Boundary (R6): rules, proved at the HTTP harness — POST /api/admin/accounts, POST /api/admin/accounts/:id/name and
// POST /api/auth/sign-in (D-029). "Signed in" is judged by the session (GET /api/me on the same jar), not the status.
import { test, expect } from '@playwright/test';
import { anonymousApi, createMember, fresh, freshEmail, freshName, freshPassword, signIn, type Actor } from './harness';
import { disposeAll, freshTeam, isRuleRefusal, keep, listOf, peopleText, stringLeaves } from './robustness';

test.afterEach(disposeAll);

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

async function tryCreate(admin: Actor, body: Record<string, unknown>): Promise<number> {
  return (await admin.api.post('/api/admin/accounts', { data: body })).status();
}

// ---------------------------------------------------------------------------------------------------
// ROW-215 promise: the row — an email is trimmed and compared without regard to letter case both when created and
// ROW-215   at sign-in, so a stray space or phone autocapital never locks a person out or creates a second account;
// ROW-215   REQ-013 (one account per email, compared without regard to letter case or surrounding spaces), REQ-014.
// ROW-215 wrong product: a sign-in that looks the email up as typed (WHERE email = ?), so "Row215…" from a phone's
// ROW-215   autocapital or a pasted trailing space finds nothing; a create that stores "  Row215…@Example.Test  " as
// ROW-215   typed, so a second create with the lower-case form makes a second account.
// ROW-215 given: the admin creates an account with "  Row215.<fresh>@Example.Test  " (spaces, capitals). when: it
// ROW-215   signs in with the trimmed lower-case form, the phone-autocapital form, the upper-case form wrapped in spaces
// ROW-215   and the form as created; the admin then creates two more accounts with that email upper-cased plus a
// ROW-215   space and lower-cased after a tab. then: every sign-in gives a session of that same account; both creates are
// ROW-215   refused; the people list holds the email once, with no surrounding spaces.
// ROW-215 controls: the control case creates an account with a plain lower-case email and signs it in — the create
// ROW-215   and sign-in routes work, so the target's failures are the normalising's.
// ROW-215 technique: near misses of one email (case, spaces, a tab), each of which a wrong product treats as a
// ROW-215   different email; the account id, not the status, shows whose session it is.
// ROW-215 cases: ROW-215 target=ROW-215.REQ-013.spaces-and-capitals-never-lock-out-or-duplicate-an-account control=ROW-215.control.a-plain-email-signs-in
test('ROW-215.control.a-plain-email-signs-in', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin, { choosePassword: false });
  expect(await signsInAs(m.email, m.password), 'ROW-215 control: the plain email signs in as the account').toBe(String(m.id));
});

test('ROW-215.REQ-013.spaces-and-capitals-never-lock-out-or-duplicate-an-account', async () => {
  const { admin } = await freshTeam();
  const local = `Row215.${fresh('e').replace(/-/g, '')}`;
  const typed = `  ${local}@Example.Test  `;
  const canonical = `${local}@example.test`.toLowerCase();
  const m = await createMember(admin, { email: typed, choosePassword: false });

  for (const [label, email] of [
    ['trimmed lower case', canonical],
    ['phone autocapital', canonical.charAt(0).toUpperCase() + canonical.slice(1)],
    ['upper case in spaces', `  ${canonical.toUpperCase()}  `],
    ['as created', typed],
  ]) {
    expect.soft(await signsInAs(email, m.password), `ROW-215 sign-in with the ${label} email: a session of the same account`).toBe(String(m.id));
  }

  for (const [label, email] of [
    ['upper case plus a space', `${canonical.toUpperCase()} `],
    ['lower case after a tab', `\t${canonical}`],
  ]) {
    const status = await tryCreate(admin, { name: freshName('Second'), email, password: freshPassword(), allowance: 10 });
    expect.soft(isRuleRefusal(status), `ROW-215 a second account with the email ${label} is refused (answered ${status})`).toBe(true);
  }
  const people = await peopleText(admin);
  const holders = listOf(JSON.parse(people)).filter((r) => stringLeaves(r).some((s) => s.trim().toLowerCase() === canonical));
  expect.soft(holders.length, 'ROW-215: the people list holds one account with the email').toBe(1);
  const leaves = stringLeaves(JSON.parse(people));
  expect.soft(leaves.some((s) => s.toLowerCase() === canonical), 'ROW-215: the email is stored without surrounding spaces').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-216 promise: the row — creating or renaming an account with an empty or blank name is refused; REQ-020 (the
// ROW-216   admin creates accounts and changes a name from the people page), REQ-013 (an account is never created
// ROW-216   without a name), D-015 (a display name is 1 to 60 characters after trimming).
// ROW-216 wrong product: a check of name.length > 0 before trimming, so "   " or a tab passes and the calendar shows a
// ROW-216   blank entry; or a create that checks the name while rename does not.
// ROW-216 given: member M with a fresh name N. when: the admin creates accounts with the name missing, "", " ",
// ROW-216   "   ", tab-newline-space, and no-break + ideographic spaces (each with a fresh email); and renames M to each
// ROW-216   of the blank names. then: each is refused (a rule's 4xx); no account with those emails exists; M signs in
// ROW-216   still named N.
// ROW-216 controls: the control case creates an account with a fresh name and renames it to another fresh name —
// ROW-216   both take effect, so the routes and bodies are right and the refusals are the blankness's.
// ROW-216 technique: the boundary of blank — empty, one space, several kinds of white space — beside the valid name
// ROW-216   in the control; the neighbouring record (M's name) must stay untouched.
// ROW-216 cases: ROW-216 target=ROW-216.REQ-020.blank-names-are-refused-at-create-and-rename control=ROW-216.control.a-real-name-creates-and-renames
const BLANKS = ['', ' ', '   ', '\t\n ', ' 　'];

test('ROW-216.control.a-real-name-creates-and-renames', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const next = freshName('Renamed');
  const res = await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(m.id))}/name`, { data: { name: next } });
  expect(res.status(), 'ROW-216 control: the rename is accepted').toBeLessThan(300);
  const session = keep(await signIn({ email: m.email, password: m.password }));
  expect(session.me.name, 'ROW-216 control: the new name took effect').toBe(next);
});

test('ROW-216.REQ-020.blank-names-are-refused-at-create-and-rename', async () => {
  const { admin } = await freshTeam();
  const m = await createMember(admin);
  const emails: string[] = [];
  const bodies: [string, Record<string, unknown>][] = [['name missing', {}], ...BLANKS.map((b) => [JSON.stringify(b), { name: b }] as [string, Record<string, unknown>])];
  for (const [label, extra] of bodies) {
    const email = freshEmail('blank');
    emails.push(email);
    const status = await tryCreate(admin, { email, password: freshPassword(), allowance: 10, ...extra });
    expect.soft(isRuleRefusal(status), `ROW-216 create with name ${label} is refused (answered ${status})`).toBe(true);
  }
  for (const b of BLANKS) {
    const res = await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(m.id))}/name`, { data: { name: b } });
    expect.soft(isRuleRefusal(res.status()), `ROW-216 rename to ${JSON.stringify(b)} is refused (answered ${res.status()})`).toBe(true);
  }
  const people = (await peopleText(admin)).toLowerCase();
  expect.soft(emails.filter((e) => people.includes(e)), 'ROW-216: no account was created with a blank name').toEqual([]);
  const session = keep(await signIn({ email: m.email, password: m.password }));
  expect.soft(session.me.name, "ROW-216: M's name is unchanged").toBe(m.name);
});
