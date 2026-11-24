// Purpose: ledger tests for ROW-144 (REQ-013) — the limit of 30 counts switched-on accounts, the admin included, never switched-off ones; creating or switching on a 31st is refused; two adds at the same moment with 29 on store exactly one.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); every account made through POST /api/admin/accounts by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): rules at the HTTP harness — POST /api/admin/accounts and POST /api/admin/accounts/:id/switch. Whether
// an account exists and is switched on is judged by what it can do: sign in (GET /api/me answers 200 on its jar).
import { test, expect } from '@playwright/test';
import { createMember, freshEmail, freshName, freshPassword, switchAccount, type Member } from './harness';
import {
  AUCKLAND,
  canSignIn,
  disposeAll,
  isAccepted,
  isRefusal,
  startTeam,
  teamInstant,
  tryCreate,
  trySwitchOn,
  type Team,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NOW = teamInstant(AUCKLAND, '2027-03-10', '15:00');

/** A team with the admin plus `on` switched-on members and `off` switched-off ones (off ones were on, then switched off). */
async function teamWith(on: number, off: number): Promise<{ team: Team; offMembers: Member[] }> {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const offMembers: Member[] = [];
  for (let i = 0; i < off; i += 1) {
    const m = await createMember(team.admin, { choosePassword: false });
    await switchAccount(team.admin, m.id, false);
    offMembers.push(m);
  }
  for (let i = 0; i < on; i += 1) await createMember(team.admin, { choosePassword: false });
  return { team, offMembers };
}

function newAccount() {
  return { name: freshName('Limit'), email: freshEmail('limit'), password: freshPassword(), allowance: 25 };
}

// ---------------------------------------------------------------------------------------------------
// ROW-144 promise: REQ-013 fail-if (3) "an account is created or switched on while 30 are already switched on", with
// ROW-144   A-025 (at most 30 switched on) and A-006 (the admin is a member of the team): the limit counts switched-on
// ROW-144   accounts including the admin and never switched-off ones; two adds at the same moment store exactly one.
// ROW-144 wrong product: one that counts every account (refusing a create at 29 on when two more are off), that leaves
// ROW-144   the admin out (accepting a 31st), that checks the limit on create but not on switch-on, or that counts
// ROW-144   and inserts outside one write transaction so two adds at 29 on both pass.
// ROW-144 given / when / then:
// ROW-144   admin + 29 on: a create is refused and its account cannot sign in;
// ROW-144   admin + 28 on + 2 off: a create is accepted and signs in; separately, switching one off account on is
// ROW-144     accepted and it signs in;
// ROW-144   admin + 29 on + 1 off: switching it on is refused and it still cannot sign in;
// ROW-144   admin + 28 on: two creates sent together — exactly one accepted, exactly one signs in; admin + 28 on + 1 off:
// ROW-144     a create and a switch-on sent together — exactly one accepted, exactly one of the two signs in.
// ROW-144 controls: the control case creates at admin + 28 on (29): accepted and the account signs in — creating
// ROW-144   works below the limit, so the refusals are the limit's.
// ROW-144 technique: a threshold — values just either side of 30 switched on, with the switched-off neighbours that
// ROW-144   must not count, and the race at the threshold.
// ROW-144 cases: ROW-144 target=ROW-144.REQ-013.a-thirty-first-switched-on-account-is-refused control=ROW-144.control.the-thirtieth-switched-on-account-is-created
test('ROW-144.control.the-thirtieth-switched-on-account-is-created', async () => {
  const { team } = await teamWith(28, 0);
  const body = newAccount();
  const a = await tryCreate(team.admin, body);
  expect(isAccepted(a), `ROW-144 control: with 29 on, a create is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect(await canSignIn(body.email, body.password), 'ROW-144 control: the 30th account signs in').toBe(true);
});

test('ROW-144.REQ-013.a-thirty-first-switched-on-account-is-refused', async () => {
  const { team } = await teamWith(29, 0);
  const body = newAccount();
  const a = await tryCreate(team.admin, body);
  expect.soft(isRefusal(a), `ROW-144: with the admin and 29 others on, a create is refused (answered ${a.status})`).toBe(true);
  expect.soft(await canSignIn(body.email, body.password), 'ROW-144: the refused account does not exist').toBe(false);
});

test('ROW-144.REQ-013.switched-off-accounts-do-not-count', async () => {
  {
    const { team } = await teamWith(28, 2);
    const body = newAccount();
    const a = await tryCreate(team.admin, body);
    expect.soft(isAccepted(a), `ROW-144: with 29 on and 2 off, a create is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    expect.soft(await canSignIn(body.email, body.password), 'ROW-144: the created account signs in').toBe(true);
    await disposeAll();
  }
  {
    const { team, offMembers } = await teamWith(28, 2);
    const m = offMembers[0];
    expect(await canSignIn(m.email, m.password), 'ROW-144 before: the switched-off account cannot sign in').toBe(false);
    const a = await trySwitchOn(team.admin, m.id);
    expect.soft(isAccepted(a), `ROW-144: with 29 on and 2 off, switching one on is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
    expect.soft(await canSignIn(m.email, m.password), 'ROW-144: the account switched on signs in').toBe(true);
  }
});

test('ROW-144.REQ-013.switching-on-a-thirty-first-is-refused', async () => {
  const { team, offMembers } = await teamWith(29, 1);
  const m = offMembers[0];
  const a = await trySwitchOn(team.admin, m.id);
  expect.soft(isRefusal(a), `ROW-144: with 30 on, switching one on is refused (answered ${a.status})`).toBe(true);
  expect.soft(await canSignIn(m.email, m.password), 'ROW-144: it stays switched off').toBe(false);
});

test('ROW-144.REQ-013.simultaneous-adds-at-twenty-nine-store-exactly-one', async () => {
  {
    const { team } = await teamWith(28, 0);
    const x = newAccount();
    const y = newAccount();
    const [ax, ay] = await Promise.all([tryCreate(team.admin, x), tryCreate(team.admin, y)]);
    expect.soft([ax, ay].filter(isAccepted).length, `ROW-144: two creates together at 29 on — exactly one accepted (answered ${ax.status}, ${ay.status})`).toBe(1);
    const signs = [await canSignIn(x.email, x.password), await canSignIn(y.email, y.password)];
    expect.soft(signs.filter(Boolean).length, 'ROW-144: exactly one of the two accounts exists').toBe(1);
    await disposeAll();
  }
  {
    const { team, offMembers } = await teamWith(28, 1);
    const m = offMembers[0];
    const x = newAccount();
    const [ax, am] = await Promise.all([tryCreate(team.admin, x), trySwitchOn(team.admin, m.id)]);
    expect.soft([ax, am].filter(isAccepted).length, `ROW-144: a create and a switch-on together at 29 on — exactly one accepted (answered ${ax.status}, ${am.status})`).toBe(1);
    const signs = [await canSignIn(x.email, x.password), await canSignIn(m.email, m.password)];
    expect.soft(signs.filter(Boolean).length, 'ROW-144: exactly one of the two is switched on').toBe(1);
  }
});
