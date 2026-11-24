// Purpose: ledger tests for ROW-063, ROW-064 and ROW-066 (REQ-013) — creating an account: every field required (blank and whitespace-only refused), one account per email without regard to letter case or surrounding spaces, and only the admin creates.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, accounts, switch), fresh per run.
//
// Boundary (R6): rules about account creation, proved at the HTTP harness through D-029's
// POST /api/admin/accounts {name,email,password,allowance} → 201 {id}. "Nothing was created" is observed two ways
// that do not depend on the product's field names: the admin's GET /api/admin/people answer is deep-equal before
// and after the refused attempts (the clock is fixed, so a right product's answer does not move), and the
// attempt's fresh email cannot sign in. A refusal is a 4xx answer (a 5xx is a crash, not a refusal).
import { test, expect, type APIResponse } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  resetProduct,
  signIn,
  signInMember,
  switchAccount,
  type AccountSpec,
  type Actor,
  type Credentials,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

const actors: Actor[] = [];
async function track(p: Promise<Actor>): Promise<Actor> {
  const a = await p;
  actors.push(a);
  return a;
}
test.afterEach(async () => {
  for (const a of actors.splice(0)) await a.dispose().catch(() => undefined);
});

async function start(): Promise<Actor> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  return track(signIn(install.admin));
}

function valid(label = 'New'): AccountSpec {
  return { name: freshName(label), email: freshEmail(label.toLowerCase()), password: freshPassword(), allowance: 20 };
}

async function people(admin: Actor, row: string): Promise<unknown> {
  const res = await admin.api.get('/api/admin/people');
  expect(res.status(), `${row}: GET /api/admin/people answers the admin`).toBe(200);
  return res.json();
}

async function canSignIn(c: Credentials): Promise<boolean> {
  const api = await anonymousApi();
  try {
    const r = await api.post('/api/auth/sign-in', { data: { email: c.email, password: c.password } });
    const me = await api.get('/api/me');
    return r.ok() && me.status() === 200;
  } finally {
    await api.dispose();
  }
}

function isRefusal(res: APIResponse): boolean {
  return res.status() >= 400 && res.status() < 500;
}

// ---------------------------------------------------------------------------------------------------
// ROW-063 promise: REQ-013 fail-if (1) "an account is created without a name, an email, a password or an
// ROW-063   allowance"; the row's cases: an empty string and a whitespace-only string for each field are refused.
// ROW-063 wrong product: a create that checks only that each key is present (accepting "" and "   "), or that
// ROW-063   coerces the allowance with Number() so "" and "   " become 0, or trims nothing so a name of spaces passes.
// ROW-063 given: a fresh install, the admin signed in, the people list read. when: the admin posts twelve
// ROW-063   bodies, each a valid fresh body with exactly one field set to "", to "   " or left out. then: each is
// ROW-063   answered 4xx; the people list is deep-equal to before; no attempt's fresh name or email is in it; no
// ROW-063   attempt's email and password sign in.
// ROW-063 controls: the control case posts the same shape with every field valid: 201, the people list changes and
// ROW-063   holds the email, and the account signs in — so the body shape and the observations work.
// ROW-063 technique: one field at a time against an otherwise valid body (the refusal can only be that field's),
// ROW-063   fresh values per attempt, and a deep-equal denominator over the whole people answer.
// ROW-063 cases: ROW-063 target=ROW-063.REQ-013.blank-or-missing-name-email-password-or-allowance-refused control=ROW-063.control.a-complete-body-creates-the-account
test('ROW-063.control.a-complete-body-creates-the-account', async () => {
  const admin = await start();
  const before = await people(admin, 'ROW-063 control');
  const body = valid();
  const res = await admin.api.post('/api/admin/accounts', { data: body });
  expect(res.status(), 'ROW-063 control: a complete body is created').toBe(201);
  const after = await people(admin, 'ROW-063 control');
  expect(after, 'ROW-063 control: the people list changes after a create').not.toEqual(before);
  expect(JSON.stringify(after).toLowerCase(), 'ROW-063 control: the new email is listed').toContain(body.email);
  expect(await canSignIn(body), 'ROW-063 control: the new account signs in').toBe(true);
});

test('ROW-063.REQ-013.blank-or-missing-name-email-password-or-allowance-refused', async () => {
  const admin = await start();
  const before = await people(admin, 'ROW-063');
  const attempts: { label: string; body: Record<string, unknown>; spec: AccountSpec; field: keyof AccountSpec }[] = [];
  for (const field of ['name', 'email', 'password', 'allowance'] as const) {
    for (const [how, value] of [
      ['empty', ''],
      ['whitespace-only', '   '],
      ['missing', undefined],
    ] as const) {
      const spec = valid('Blank');
      const body: Record<string, unknown> = { ...spec };
      if (value === undefined) delete body[field];
      else body[field] = value;
      attempts.push({ label: `${field} ${how}`, body, spec, field });
    }
  }

  for (const a of attempts) {
    const res = await admin.api.post('/api/admin/accounts', { data: a.body });
    expect.soft(isRefusal(res), `ROW-063 ${a.label}: refused with a 4xx (answered ${res.status()})`).toBe(true);
  }

  const after = await people(admin, 'ROW-063');
  expect.soft(after, 'ROW-063: the people list is unchanged by the refused creates').toEqual(before);
  const listed = JSON.stringify(after).toLowerCase();
  for (const a of attempts) {
    const marks = [...(a.field !== 'email' ? [a.spec.email] : []), ...(a.field !== 'name' ? [a.spec.name.toLowerCase()] : [])];
    for (const v of marks) expect.soft(listed.includes(v), `ROW-063 ${a.label}: ${v} is not listed`).toBe(false);
    if (a.field !== 'email' && a.field !== 'password') {
      expect.soft(await canSignIn(a.spec), `ROW-063 ${a.label}: no account signs in with the attempt's email`).toBe(false);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-064 promise: REQ-013 fail-if (2) "two accounts share an email, compared without regard to letter case or
// ROW-064   surrounding spaces"; the row's case: the existing holder of the email is switched off and differs only by
// ROW-064   letter case: refused. A-044: an email change is unique and compared the same way as at create.
// ROW-064 wrong product: uniqueness checked only among switched-on accounts, or by exact string (a UNIQUE column
// ROW-064   without lower-casing or trimming), or at create but not at the email change.
// ROW-064 given: Holder (switched off) and OnHolder (switched on) with fresh lower-case emails, and Other. when: the
// ROW-064   admin creates with Holder's email upper-cased, with its first letter and domain capitalised, padded with
// ROW-064   spaces, padded with a tab and upper-cased, exactly as held, and with OnHolder's email upper-cased; and changes
// ROW-064   Other's email to Holder's upper-cased. then: each is answered 4xx; the people list is deep-equal to before;
// ROW-064   no attempt's fresh name is listed.
// ROW-064 controls: the control case creates with a near miss (Holder's local part plus one letter): 201 — the
// ROW-064   comparison is not over-broad and the create path works with the same body.
// ROW-064 technique: near misses on both sides (case and spaces must match; one letter must not).
// ROW-064 cases: ROW-064 target=ROW-064.REQ-013.an-email-differing-only-by-case-or-spaces-is-refused control=ROW-064.control.a-near-miss-email-is-accepted
test('ROW-064.control.a-near-miss-email-is-accepted', async () => {
  const admin = await start();
  const holder = await createMember(admin, { email: freshEmail('holder') });
  await switchAccount(admin, holder.id, false);
  const [local, domain] = holder.email.split('@');
  const near = { ...valid('Near'), email: `${local}x@${domain}` };
  const res = await admin.api.post('/api/admin/accounts', { data: near });
  expect(res.status(), 'ROW-064 control: an email one letter away from a held one is created').toBe(201);
});

test('ROW-064.REQ-013.an-email-differing-only-by-case-or-spaces-is-refused', async () => {
  const admin = await start();
  const holder = await createMember(admin, { email: freshEmail('holder') });
  const onHolder = await createMember(admin, { email: freshEmail('onholder') });
  const other = await createMember(admin, { email: freshEmail('other') });
  await switchAccount(admin, holder.id, false);
  const before = await people(admin, 'ROW-064');

  const [local, domain] = holder.email.split('@');
  const variants: [string, string][] = [
    ['upper-cased, holder switched off', holder.email.toUpperCase()],
    ['first letter and domain capitalised', `${local.charAt(0).toUpperCase()}${local.slice(1)}@${domain.toUpperCase()}`],
    ['surrounding spaces', `  ${holder.email}  `],
    ['tab, space and upper case', `\t${holder.email.toUpperCase()} `],
    ['exactly as held', holder.email],
    ['upper-cased, holder switched on', onHolder.email.toUpperCase()],
  ];
  const names: string[] = [];
  for (const [label, email] of variants) {
    const body = { ...valid('Dup'), email };
    names.push(body.name);
    const res = await admin.api.post('/api/admin/accounts', { data: body });
    expect.soft(isRefusal(res), `ROW-064 create, ${label}: refused with a 4xx (answered ${res.status()})`).toBe(true);
  }
  const change = await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(other.id))}/email`, {
    data: { email: ` ${holder.email.toUpperCase()} ` },
  });
  expect.soft(isRefusal(change), `ROW-064 email change to a held email: refused with a 4xx (answered ${change.status()})`).toBe(true);

  const after = await people(admin, 'ROW-064');
  expect.soft(after, 'ROW-064: the people list is unchanged by the refused creates and change').toEqual(before);
  const listed = JSON.stringify(after);
  for (const n of names) expect.soft(listed.includes(n), `ROW-064: ${n} was not created`).toBe(false);
  expect.soft(await canSignIn({ email: other.email, password: other.password }), 'ROW-064: Other keeps its own email').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-066 promise: REQ-013 fail-if (4) "anyone creates an account without being signed in as the admin"; the
// ROW-066   row's cases: as a member and as an anonymous caller, a create is refused and the number of accounts is
// ROW-066   unchanged.
// ROW-066 wrong product: an accounts route guarded only by "signed in" (any member creates), or a page-level guard
// ROW-066   on /admin/people with the API route left open to anonymous callers.
// ROW-066 given: a fresh install, the admin and a member signed in, an anonymous API context. when: the member and
// ROW-066   the anonymous caller each post a complete fresh body to POST /api/admin/accounts. then: both answered 401
// ROW-066   or 403; the admin's people list is deep-equal to before; neither email is listed; neither signs in.
// ROW-066 controls: the control case shows the admin posting the same body shape gets 201 (the body would create).
// ROW-066 technique: the same valid body from three actors; only the actor differs.
// ROW-066 cases: ROW-066 target=ROW-066.REQ-013.a-member-or-anonymous-caller-cannot-create-an-account control=ROW-066.control.the-admin-creates-with-the-same-body
test('ROW-066.control.the-admin-creates-with-the-same-body', async () => {
  const admin = await start();
  const body = valid('ByAdmin');
  const res = await admin.api.post('/api/admin/accounts', { data: body });
  expect(res.status(), 'ROW-066 control: the admin creates with a complete body').toBe(201);
  expect(await canSignIn(body), 'ROW-066 control: the created account signs in').toBe(true);
});

test('ROW-066.REQ-013.a-member-or-anonymous-caller-cannot-create-an-account', async () => {
  const admin = await start();
  const member = await track(signInMember(await createMember(admin)));
  const anon = await anonymousApi();
  try {
    const before = await people(admin, 'ROW-066');
    const byMember = valid('ByMember');
    const byAnon = valid('ByAnon');
    const rm = await member.api.post('/api/admin/accounts', { data: byMember });
    expect.soft([401, 403], `ROW-066 a member's create is refused (answered ${rm.status()})`).toContain(rm.status());
    const ra = await anon.post('/api/admin/accounts', { data: byAnon });
    expect.soft([401, 403], `ROW-066 an anonymous create is refused (answered ${ra.status()})`).toContain(ra.status());

    const after = await people(admin, 'ROW-066');
    expect.soft(after, 'ROW-066: the number and content of accounts is unchanged').toEqual(before);
    const listed = JSON.stringify(after).toLowerCase();
    expect.soft(listed.includes(byMember.email), 'ROW-066: the member\'s attempt is not listed').toBe(false);
    expect.soft(listed.includes(byAnon.email), 'ROW-066: the anonymous attempt is not listed').toBe(false);
    expect.soft(await canSignIn(byMember), 'ROW-066: the member\'s attempt does not sign in').toBe(false);
    expect.soft(await canSignIn(byAnon), 'ROW-066: the anonymous attempt does not sign in').toBe(false);
  } finally {
    await anon.dispose();
  }
});
