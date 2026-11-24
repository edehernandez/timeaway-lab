// Purpose: ledger test for ROW-065 (REQ-013) — at most 30 accounts are switched on: with 29 on and one off a create succeeds, and with 30 on both a create and switching an account on are refused.
// Provenance: hand-authored (test-author pass, slice 0); fixture data made through the product's public routes by harness.ts (reset, 29 accounts, switch), fresh per run.
//
// ROW-065 promise: REQ-013 fail-if (3) "an account is created or switched on while 30 are already switched on";
// ROW-065   A-025: at most 30 accounts that are switched on; creating or switching on a 31st is refused. The row's
// ROW-065   cases: with the admin and 28 others switched on and one switched off, creating one more succeeds; with 30
// ROW-065   switched on, creating and switching on are both refused.
// ROW-065 wrong product: a limit checked only at create (switching on a 31st passes), or one that excludes the admin
// ROW-065   from the count (31 switched on), or an off-by-one that refuses at 30 instead of 31.
// ROW-065 given: a fresh install; the admin creates 28 accounts and one more it switches off (29 switched on, 30
// ROW-065   accounts). when: the admin creates one more (30 switched on), then posts a 31st create and switches the
// ROW-065   switched-off account on. then: the 30th create is 201 and signs in; the 31st create and the switch on are
// ROW-065   each answered 4xx; the people list is deep-equal to before the two refused acts; the 31st's email does not
// ROW-065   sign in and the switched-off account still does not.
// ROW-065 controls: the control case builds the same 29-on-one-off team and shows the next create succeeds and
// ROW-065   signs in — a limit counting switched-off accounts, or set one too low, fails there, not in the target.
// ROW-065 technique: values just either side of the threshold (29→30 accepted, 30→31 refused), and both entry
// ROW-065   points to the same harm (create, switch on).
// ROW-065 cases: ROW-065 target=ROW-065.REQ-013.at-30-switched-on-create-and-switch-on-are-refused control=ROW-065.control.at-29-switched-on-and-one-off-a-create-succeeds
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshEmail,
  freshName,
  freshPassword,
  resetProduct,
  signIn,
  switchAccount,
  type AccountSpec,
  type Actor,
  type Credentials,
  type Member,
} from './harness';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday

let admin: Actor | undefined;
test.afterEach(async () => {
  await admin?.dispose().catch(() => undefined);
  admin = undefined;
});

function valid(label: string): AccountSpec {
  return { name: freshName(label), email: freshEmail(label.toLowerCase()), password: freshPassword(), allowance: 20 };
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

/** The admin plus 28 switched-on accounts and one switched-off account: 29 switched on, 30 accounts. */
async function twentyNineOnOneOff(): Promise<{ admin: Actor; off: Member }> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  admin = await signIn(install.admin);
  for (let i = 0; i < 28; i++) await createMember(admin, { choosePassword: false });
  const off = await createMember(admin, { choosePassword: false });
  await switchAccount(admin, off.id, false);
  return { admin, off };
}

test('ROW-065.control.at-29-switched-on-and-one-off-a-create-succeeds', async () => {
  const { admin } = await twentyNineOnOneOff();
  const body = valid('Thirtieth');
  const res = await admin.api.post('/api/admin/accounts', { data: body });
  expect(res.status(), 'ROW-065 control: the 30th switched-on account is created').toBe(201);
  expect(await canSignIn(body), 'ROW-065 control: the 30th account signs in').toBe(true);
});

test('ROW-065.REQ-013.at-30-switched-on-create-and-switch-on-are-refused', async () => {
  const { admin, off } = await twentyNineOnOneOff();
  const thirtieth = valid('Thirtieth');
  const r30 = await admin.api.post('/api/admin/accounts', { data: thirtieth });
  expect(r30.status(), 'ROW-065: with 29 switched on, one more is created (the threshold is reached)').toBe(201);

  const peopleBefore = await admin.api.get('/api/admin/people');
  expect(peopleBefore.status(), 'ROW-065: GET /api/admin/people answers the admin').toBe(200);
  const before = await peopleBefore.json();

  const thirtyFirst = valid('ThirtyFirst');
  const r31 = await admin.api.post('/api/admin/accounts', { data: thirtyFirst });
  expect.soft(r31.status() >= 400 && r31.status() < 500, `ROW-065: the 31st create is refused with a 4xx (answered ${r31.status()})`).toBe(true);

  const route = `/api/admin/accounts/${encodeURIComponent(String(off.id))}/switch`;
  const on = await admin.api.post(route, { data: { on: true } });
  expect.soft(on.status() >= 400 && on.status() < 500, `ROW-065: switching a 31st on is refused with a 4xx (answered ${on.status()})`).toBe(true);

  const peopleAfter = await admin.api.get('/api/admin/people');
  expect(peopleAfter.status(), 'ROW-065: GET /api/admin/people answers the admin').toBe(200);
  expect.soft(await peopleAfter.json(), 'ROW-065: the people list is unchanged by the refused acts').toEqual(before);
  expect.soft(await canSignIn(thirtyFirst), 'ROW-065: the 31st does not sign in').toBe(false);
  expect.soft(await canSignIn({ email: off.email, password: off.password }), 'ROW-065: the switched-off account is still off').toBe(false);
});
