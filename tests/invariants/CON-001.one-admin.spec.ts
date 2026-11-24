// Purpose: ledger tests for ROW-186 and ROW-187 (CON-001, INV-003) — exactly one account is the admin after every action, and no admin flag is accepted on create or rename; setup on an empty database creates the one admin.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset, create account, rename, set password, switch), fresh per run. The reset is the harness's setup door: D-029 "wiping every record and creating the one admin as setup does".
//
// ROW-186 promise: CON-001 "there is exactly one admin account, created when the product is set up; inside the
// ROW-186   product admin rights cannot be given to anyone else" (A-013); INV-003 "only the admin … creates and
// ROW-186   renames accounts". The row's clause "the setup path refuses and changes nothing once setup is done"
// ROW-186   is NOT in this case: the harness has no door that runs the one-time setup command (D-011,
// ROW-186   server/scripts) against an existing database; it is returned owed as a missing prerequisite.
// ROW-186 wrong product: the create route writes the posted isAdmin/admin/role into the new account; the rename
// ROW-186   route updates the account with the whole body; an "admin" flag moves the admin right to another
// ROW-186   account (still one admin, but not the installed one); a member reaches the create route.
// ROW-186 given: a fresh install; member M2 made by the admin. when, each followed by a census of every
// ROW-186   account: the admin creates M1 with isAdmin/admin/role; renames M2 with them; changes M2's email, sets
// ROW-186   M2's password and M2's allowance with them; M2 tries to create M3 with them and to rename itself with
// ROW-186   them; the admin tries to switch its own account off. then: after every action exactly one account that
// ROW-186   signs in answers isAdmin true, and it is the installed admin; M1, M2, M3 (where they exist) are refused
// ROW-186   an admin route.
// ROW-186 controls: ROW-187's case — the reset creates an admin that signs in as admin and reaches an admin
// ROW-186   route — so the census can see an admin at all.
// ROW-186 technique: a census after every action over every account the test made (a denominator, not one
// ROW-186   account), signed in through the actor door; the flag in three spellings.
// ROW-186 cases: ROW-186 target=ROW-186.CON-001.exactly-one-admin-after-every-action control=ROW-187.control.setup-on-an-empty-database-creates-the-one-admin
//
// ROW-187 promise: control of ROW-186 — CON-001 "created when the product is set up" (A-013, D-011).
// ROW-187 wrong product: a reset/setup that makes the account but not as admin, or keeps the previous install's
// ROW-187   admin, so ROW-186's census would find none or the wrong one.
// ROW-187 given: fresh admin credentials no install has used. when: the reset (setup on a wiped database).
// ROW-187   then: before it those credentials do not sign in; after it they do, GET /api/me answers isAdmin true
// ROW-187   with the installed name, and GET /api/admin/people answers 200; the previous install's admin no
// ROW-187   longer signs in.
// ROW-187 controls: the previous install's admin signs in before the reset (the "absent after" is not vacuous).
// ROW-187 technique: fresh values, before and after.
// ROW-187 cases: ROW-187 target=ROW-187.control.setup-on-an-empty-database-creates-the-one-admin control=ROW-186.CON-001.exactly-one-admin-after-every-action
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  actWithToken,
  resetProduct,
  signIn,
  type AccountSpec,
  type Actor,
  type Credentials,
} from './harness';

const FLAGS = { isAdmin: true, admin: true, role: 'admin' };

/** Signs in with the credentials, or answers null when the product refuses them. */
async function trySignIn(c: Credentials): Promise<Actor | null> {
  const api = await anonymousApi();
  try {
    const res = await api.post('/api/auth/sign-in', { data: c });
    if (!res.ok()) return null;
  } finally {
    await api.dispose();
  }
  return signIn(c);
}

/** True when the credentials sign in. */
async function signsIn(c: Credentials): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: c })).ok();
  } finally {
    await api.dispose();
  }
}

/** Every account the test knows, and who of them signs in as admin. */
async function census(accounts: Map<string, Credentials>): Promise<{ admins: string[]; reachAdminRoute: string[] }> {
  const admins: string[] = [];
  const reachAdminRoute: string[] = [];
  for (const [label, c] of accounts) {
    const actor = await trySignIn(c);
    if (actor === null) continue;
    try {
      if (actor.me.isAdmin) admins.push(label);
      if ((await actor.api.get('/api/admin/people')).ok()) reachAdminRoute.push(label);
    } finally {
      await actor.dispose();
    }
  }
  return { admins, reachAdminRoute };
}

test('ROW-186.CON-001.exactly-one-admin-after-every-action', async () => {
  const install = await resetProduct();
  const admin = await signIn(install.admin);
  const accounts = new Map<string, Credentials>([['the installed admin', { email: install.admin.email, password: install.admin.password }]]);
  try {
    const m2 = await createMember(admin);
    accounts.set('M2', { email: m2.email, password: m2.password });

    const check = async (after: string) => {
      const c = await census(accounts);
      expect.soft(c.admins, `ROW-186 after ${after}: exactly one admin, the installed one`).toEqual(['the installed admin']);
      expect.soft(c.reachAdminRoute, `ROW-186 after ${after}: only the installed admin reaches an admin route`).toEqual(['the installed admin']);
    };
    await check('setup');

    const m1: AccountSpec = { name: freshName('M1'), email: freshEmail('m1'), password: freshPassword(), allowance: 25 };
    await admin.api.post('/api/admin/accounts', { data: { ...m1, ...FLAGS } });
    accounts.set('M1', { email: m1.email, password: m1.password });
    await check('create with an admin flag');

    const id2 = encodeURIComponent(String(m2.id));
    await admin.api.post(`/api/admin/accounts/${id2}/name`, { data: { name: freshName('M2'), ...FLAGS } });
    await check('rename with an admin flag');

    const m2Email = freshEmail('m2');
    const emailRes = await admin.api.post(`/api/admin/accounts/${id2}/email`, { data: { email: m2Email, ...FLAGS } });
    if (emailRes.ok()) accounts.set('M2', { email: m2Email, password: accounts.get('M2')!.password });
    await check('email change with an admin flag');

    const m2Password = freshPassword();
    const pwRes = await admin.api.post(`/api/admin/accounts/${id2}/password`, { data: { password: m2Password, ...FLAGS } });
    if (pwRes.ok()) accounts.set('M2', { email: accounts.get('M2')!.email, password: m2Password });
    await check('password set with an admin flag');

    await admin.api.post(`/api/admin/accounts/${id2}/allowance`, { data: { allowance: 30, startsNextYear: false, ...FLAGS } });
    await check('allowance change with an admin flag');

    const m2Actor = await trySignIn(accounts.get('M2')!);
    if (m2Actor) {
      try {
        const m3: AccountSpec = { name: freshName('M3'), email: freshEmail('m3'), password: freshPassword(), allowance: 25 };
        await m2Actor.api.post('/api/admin/accounts', { data: { ...m3, ...FLAGS } });
        accounts.set('M3', { email: m3.email, password: m3.password });
        await m2Actor.api.post(`/api/admin/accounts/${id2}/name`, { data: { name: freshName('M2'), ...FLAGS } });
      } finally {
        await m2Actor.dispose();
      }
    }
    await check('a member\'s create and rename with an admin flag');

    const ownOff = await admin.api.get(`/api/admin/accounts/${encodeURIComponent(String(admin.me.id))}/effect?action=switch-off`);
    const token = ownOff.ok() ? ((await ownOff.json().catch(() => ({}))) as { token?: string }).token ?? 'none' : 'none';
    await actWithToken(admin, 'switch-off', admin.me.id, token);
    await check('the admin switching its own account off');
  } finally {
    await admin.dispose();
  }
});

test('ROW-187.control.setup-on-an-empty-database-creates-the-one-admin', async () => {
  const previous = await resetProduct();
  const next = { name: freshName('Admin'), email: freshEmail('admin'), password: freshPassword(), allowance: 25 };
  expect(await signsIn({ email: previous.admin.email, password: previous.admin.password }), 'ROW-187 before: the previous admin signs in').toBe(true);
  expect(await signsIn({ email: next.email, password: next.password }), 'ROW-187 before: the new admin\'s credentials do not sign in').toBe(false);

  const install = await resetProduct({ admin: next });
  const admin = await trySignIn({ email: install.admin.email, password: install.admin.password });
  expect(admin, 'ROW-187 after: the installed admin signs in').not.toBeNull();
  try {
    expect.soft(admin!.me.isAdmin, 'ROW-187 after: GET /api/me answers isAdmin true').toBe(true);
    expect.soft(admin!.me.name, 'ROW-187 after: with the installed name').toBe(next.name);
    expect.soft((await admin!.api.get('/api/admin/people')).status(), 'ROW-187 after: the admin reaches the people route').toBe(200);
    expect
      .soft(await signsIn({ email: previous.admin.email, password: previous.admin.password }), 'ROW-187 after: the previous admin is gone')
      .toBe(false);
  } finally {
    await admin?.dispose();
  }
});
