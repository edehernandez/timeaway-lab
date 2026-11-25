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
  SetupError,
  type AccountSpec,
  type Actor,
  type Credentials,
} from './harness';
import { restartProduct, runSetup, setupArgs } from './doors-process';
import { ident, storeRead, storeRun, tableColumns } from './doors-store';
import { holdsValue, recordByEmail, topRecords } from './records';

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

// ---------------------------------------------------------------------------------------------------
// ROW-186, the setup clause (added by test-author pass, slice 1, batch test-author-16, through the D-048 setup door in
// ROW-186   doors-process.ts; the header's "is NOT in this case" note above predates this door).
// ROW-186 promise: CON-001 "exactly one admin account, created when the product is set up" (A-013); D-011 "a one-time
// ROW-186   setup command"; D-013 the zone "chosen once at setup … cannot be changed": the setup path refuses and
// ROW-186   changes nothing once setup is done.
// ROW-186 wrong product: a setup command that, run again on a set-up database, adds a second admin; or "re-sets" the
// ROW-186   admin (an upsert by email that puts a new password or allowance on the installed admin, a recovery door the
// ROW-186   owner never ruled); or re-writes the team zone; or exits 0 having done nothing (a refusal nobody is told of
// ROW-186   is still a finish).
// ROW-186 given: a fresh install in Auckland at 10:00 on 2 March 2027 (1 March in Los Angeles), a member with a
// ROW-186   pending request. when: the setup command is run on that existing database (a) for a new admin with fresh
// ROW-186   values and Los Angeles as its zone, (b) for the installed admin's own email with a new password and Los
// ROW-186   Angeles. then: each ends with a non-zero exit; the people list, the pending list, the member's requests and
// ROW-186   the team's today read exactly as before; the installed admin still signs in with its password and is the
// ROW-186   one admin; neither the new admin nor the new password signs in.
// ROW-186 controls: the same arguments for the new admin finish (exit 0) on a fresh database — the precondition,
// ROW-186   SETUP when it fails — so each refusal is the existing database's and not a malformed call; before the runs
// ROW-186   today is the Auckland date and the installed admin signs in.
// ROW-186 technique: before and after around the forbidden act, the act in two forms (a second admin, a re-set of the
// ROW-186   first) with fresh values that no product can hold already, and a census of every account the test made.
// ROW-186 cases: ROW-186 target=ROW-186.CON-001.setup-on-an-existing-database-refuses-and-changes-nothing control=ROW-187.control.setup-on-an-empty-database-creates-the-one-admin
test('ROW-186.CON-001.setup-on-an-existing-database-refuses-and-changes-nothing', async () => {
  const LA = 'America/Los_Angeles';
  const second = { name: freshName('Admin'), email: freshEmail('second'), password: freshPassword(), allowance: 30, timeZone: LA };
  const pre = await runSetup(setupArgs(second), 'fresh');
  if (pre.exit !== 0) {
    throw new Error(`SETUP: the setup command did not finish on a fresh database with every argument (exit ${pre.exit}): ${pre.stderr.slice(0, 300)}`);
  }

  const install = await resetProduct({ timeZone: 'Pacific/Auckland', now: '2027-03-01T21:00:00Z' });
  const admin = await signIn(install.admin);
  const member = await createMember(admin);
  const mActor = await signIn({ email: member.email, password: member.password });
  try {
    const sent = await mActor.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' } });
    expect(sent.status(), 'ROW-186 setup: the member\'s request is sent').toBe(201);
    const json = async (a: Actor, route: string) => {
      const res = await a.api.get(route);
      return { status: res.status(), body: await res.json().catch(() => null) };
    };
    const read = async () => ({
      people: await json(admin, '/api/admin/people'),
      pending: await json(admin, '/api/admin/pending'),
      requests: await json(mActor, '/api/requests'),
      today: await json(admin, '/api/today'),
      me: await json(admin, '/api/me'),
    });
    const before = await read();
    expect(before.today, 'ROW-186 before: today is the Auckland date (2 March), not Los Angeles\' (1 March)').toEqual({ status: 200, body: { today: '2027-03-02' } });

    const runs: [string, string[]][] = [
      ['a second admin', setupArgs(second)],
      [
        'the installed admin\'s email with a new password',
        setupArgs({ name: install.admin.name, email: install.admin.email, password: freshPassword(), allowance: 30, timeZone: LA }),
      ],
    ];
    const reSetPassword = runs[1][1][runs[1][1].indexOf('--password') + 1];
    for (const [label, args] of runs) {
      const run = await runSetup(args, 'existing');
      expect.soft(run.exit, `ROW-186 setup for ${label} on the existing database ends with an exit code`).not.toBeNull();
      expect.soft(run.exit, `ROW-186 setup for ${label} on the existing database refuses (stdout: ${run.stdout.slice(0, 200)})`).not.toBe(0);
    }

    expect.soft(await read(), 'ROW-186 after: the people, the pending list, the member\'s requests, today and the admin read as before').toEqual(before);
    expect.soft(await signsIn({ email: install.admin.email, password: install.admin.password }), 'ROW-186 after: the installed admin signs in with its password').toBe(true);
    expect.soft(await signsIn({ email: install.admin.email, password: reSetPassword }), 'ROW-186 after: the re-set password does not sign in').toBe(false);
    expect.soft(await signsIn({ email: second.email, password: second.password }), 'ROW-186 after: the second admin does not sign in').toBe(false);
    const c = await census(
      new Map<string, Credentials>([
        ['the installed admin', { email: install.admin.email, password: install.admin.password }],
        ['the member', { email: member.email, password: member.password }],
        ['the second admin', { email: second.email, password: second.password }],
      ]),
    );
    expect.soft(c.admins, 'ROW-186 after: exactly one admin, the installed one').toEqual(['the installed admin']);
  } finally {
    await mActor.dispose();
    await admin.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-187, the setup command itself, served (added by test-author pass, slice 1, brief test-author-22, through the
// ROW-187   D-048 setup and restart doors in doors-process.ts and the store door in doors-store.ts).
// ROW-187 promise: control of ROW-186 — CON-001 "There is exactly one admin account, created when the product is set
// ROW-187   up" (A-013); D-011 "The one admin account … created by a one-time setup command run on the machine, before
// ROW-187   anyone signs in"; D-050 the command takes --name --email --password --allowance --time-zone.
// ROW-187 wrong product: a setup command that writes the account with the admin marker false (or none), or marks it to
// ROW-187   change its password at first sign-in, or writes a second account, or exits 0 having written nothing the
// ROW-187   server then reads; the test reset door creating the admin correctly hides all of these, since the
// ROW-187   earlier ROW-187 case never runs the command.
// ROW-187 given: a fresh install (the reset door) whose admin signs in, and setup values no install has used (fresh
// ROW-187   name, email and password, allowance 31). when: the product's own database is emptied of every row of the
// ROW-187   accounts and requests modules' tables (ARCHITECTURE.md: accounts, account_allowances, sessions,
// ROW-187   account_events, settings, requests; the migration history kept), the setup command is run on it through
// ROW-187   the setup door (database "existing"), and the product is restarted on it (the restart door), so the
// ROW-187   server serves exactly what the command wrote. then: the command exits 0; the setup credentials sign in;
// ROW-187   GET /api/me answers isAdmin true, the setup name and mustChangePassword false; GET /api/admin/people
// ROW-187   answers 200 with exactly one account, which holds the setup email and the allowance 31; the store's
// ROW-187   accounts table holds exactly one row; the previous install's admin does not sign in.
// ROW-187 controls: before, the previous admin signs in and the setup credentials do not; after the emptying and
// ROW-187   before the command, the six tables hold no row and the previous admin no longer signs in — so every
// ROW-187   "after" fact is the command's doing; the same arguments finish (exit 0) on the door's fresh database.
// ROW-187 technique: before and after around the one real setup run, fresh values no product can hold already, the
// ROW-187   result read where the served product exposes it (sign-in, /api/me, the people answer) and counted in the
// ROW-187   store (a denominator of accounts, never "the admin is somewhere").
// ROW-187 cases: ROW-187 target=ROW-187.control.the-setup-command-on-an-empty-database-serves-the-one-admin control=ROW-186.CON-001.setup-on-an-existing-database-refuses-and-changes-nothing

/** The tables of the accounts and requests modules (ARCHITECTURE.md's owned tables), emptied child tables first. */
const OWNED_TABLES = ['sessions', 'requests', 'account_events', 'account_allowances', 'settings', 'accounts'];

/** Rows a table holds now, through the store door. */
async function rowCount(table: string): Promise<number> {
  const rows = await storeRead(`SELECT COUNT(*) AS n FROM ${ident(table)}`);
  return Number(rows[0]?.n ?? NaN);
}

/** Empties the owned tables through the store door; a table the store keeps refusing is a SETUP failure naming it. */
async function emptyOwnedTables(): Promise<void> {
  for (const t of OWNED_TABLES) await tableColumns(t); // each exists (SETUP otherwise)
  const refused = new Map<string, string>();
  for (let pass = 0; pass < OWNED_TABLES.length; pass += 1) {
    refused.clear();
    for (const t of OWNED_TABLES) {
      if ((await rowCount(t)) === 0) continue;
      const a = await storeRun(`DELETE FROM ${ident(t)}`);
      if (a.error !== null) refused.set(t, a.error);
    }
    if (refused.size === 0) return;
  }
  throw new SetupError(`the store door could not empty ${JSON.stringify([...refused])}`);
}

test('ROW-187.control.the-setup-command-on-an-empty-database-serves-the-one-admin', async () => {
  const previous = await resetProduct();
  const spec = { name: freshName('Admin'), email: freshEmail('setup'), password: freshPassword(), allowance: 31, timeZone: 'Pacific/Auckland' };

  const onFresh = await runSetup(setupArgs(spec), 'fresh');
  expect.soft(onFresh.exit, `ROW-187 control: the setup command finishes on the door's fresh database (stderr: ${onFresh.stderr.slice(0, 200)})`).toBe(0);

  expect(await signsIn({ email: previous.admin.email, password: previous.admin.password }), 'ROW-187 before: the previous admin signs in').toBe(true);
  expect(await signsIn({ email: spec.email, password: spec.password }), 'ROW-187 before: the setup credentials do not sign in').toBe(false);

  await emptyOwnedTables();
  for (const t of OWNED_TABLES) expect(await rowCount(t), `ROW-187 control: after the emptying, ${t} holds no row`).toBe(0);
  expect(await signsIn({ email: previous.admin.email, password: previous.admin.password }), 'ROW-187 control: after the emptying, the previous admin no longer signs in').toBe(false);

  const run = await runSetup(setupArgs(spec), 'existing');
  expect(run.exit, `ROW-187: the setup command finishes on the empty database (stdout: ${run.stdout.slice(0, 200)}; stderr: ${run.stderr.slice(0, 200)})`).toBe(0);
  await restartProduct();

  const admin = await trySignIn({ email: spec.email, password: spec.password });
  expect(admin, 'ROW-187 after: the served product signs the setup admin in with the given password').not.toBeNull();
  try {
    expect.soft(admin!.me.isAdmin, 'ROW-187 after: GET /api/me answers isAdmin true for the setup account').toBe(true);
    expect.soft(admin!.me.name, 'ROW-187 after: with the name given to the setup command').toBe(spec.name);
    expect.soft(admin!.me.mustChangePassword, 'ROW-187 after: the setup admin is not forced to change the password it was given').toBe(false);
    const res = await admin!.api.get('/api/admin/people');
    expect.soft(res.status(), 'ROW-187 after: the setup admin reaches the people route').toBe(200);
    const people = res.ok() ? ((await res.json().catch(() => null)) as unknown) : null;
    const listed = topRecords(people).filter((r) => Object.keys(r).some((k) => /^(id|accountId|account_id)$/.test(k)));
    expect.soft(listed.length, `ROW-187 after: the people answer lists exactly one account (${JSON.stringify(people)?.slice(0, 300)})`).toBe(1);
    const own = recordByEmail(people, spec.email);
    expect.soft(own, 'ROW-187 after: that account holds the setup email').toBeDefined();
    expect.soft(holdsValue(own, 31), 'ROW-187 after: and the allowance given to the setup command (31)').toBe(true);
    expect.soft(await rowCount('accounts'), 'ROW-187 after: the store holds exactly one account').toBe(1);
    expect
      .soft(await signsIn({ email: previous.admin.email, password: previous.admin.password }), 'ROW-187 after: the previous install\'s admin does not sign in')
      .toBe(false);
  } finally {
    await admin?.dispose();
  }
});
