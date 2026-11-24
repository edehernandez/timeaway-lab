// Purpose: ledger tests for ROW-260, ROW-261 and ROW-262 (REQ-026) — a person signed in with a password the admin set (at creation or as a reset) reaches nothing but choosing a new password or signing out, by page or by address; the new password may not equal the admin's; and once chosen, the admin's password no longer signs in.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, accounts with choosePassword:false, setPassword, requests, approvals), fresh per run.
//
// Boundary (R6): a sign-in rule, proved at the HTTP harness (D-029's member routes and POST /api/me/password
// {current,next}); ROW-260's "through pages" half is the browser's (harness openPage, Chromium), because a page
// can leak through what it loads as well as what it draws.
// "Reaches" a page or an action is judged by its data and its effect, never by a status alone: a refused route
// answers 4xx and carries none of the team's fresh values; a refused write leaves nothing behind once the person
// has chosen a password and can look. GET /api/me stays answerable in the forced state (D-029 gives it
// mustChangePassword so a page can send the person to /password), and is not probed.
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshPassword,
  openPage,
  PAGES,
  productUrl,
  resetProduct,
  sendRequest,
  setPassword,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { choosePasswordRaw, getRaw, is2xx, isRefusal, loadCapturing, postRaw, signedIn, trySignIn, yearFigures } from './admin-kit';

const T_MAR08 = '2027-03-07T20:00:00Z'; // Mon 2027-03-08 09:00 in Pacific/Auckland; UTC still Sunday
const YEAR = 2027;
const PROBE_WRITE = { kind: 'vacation', firstDay: '2027-03-18', lastDay: '2027-03-19' };

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface Team {
  install: Install;
  admin: Actor;
  /** A member with their own password and an approved 15–17 Mar: their name is on every member's calendar. */
  away: Member;
}

async function team(): Promise<Team> {
  const install = await resetProduct({ now: T_MAR08, timeZone: DEFAULT_TIME_ZONE });
  const admin = keep(await signIn(install.admin));
  const away = await createMember(admin);
  const s = keep(await signInMember(away));
  await approve(admin, await sendRequest(s, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-17' }));
  await approve(admin, await sendRequest(admin, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' }));
  return { install, admin, away };
}

/** Case "after account creation": a new account left with the password the admin set. */
async function afterCreation(t: Team): Promise<{ member: Member; adminSet: string; ownPending: AccountId | null }> {
  const member = await createMember(t.admin, { choosePassword: false });
  return { member, adminSet: member.adminSetPassword, ownPending: null };
}

/** Case "after a reset": an account that chose its own password, holds an approved 22–24 Mar and a pending 29–31 Mar, then gets a new password from the admin. */
async function afterReset(t: Team): Promise<{ member: Member; adminSet: string; ownPending: AccountId | null }> {
  const member = await createMember(t.admin);
  const s = keep(await signInMember(member));
  await approve(t.admin, await sendRequest(s, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' }));
  const ownPending = await sendRequest(s, { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-31' });
  const adminSet = freshPassword();
  await setPassword(t.admin, member.id, adminSet);
  return { member: { ...member, password: adminSet }, adminSet, ownPending };
}

function secretsOf(t: Team): string[] {
  return [t.away.name, t.install.admin.name];
}

function leaked(text: string, secrets: string[]): string[] {
  return secrets.filter((s) => text.includes(s));
}

/** Every same-origin link on the page except a sign-out (which is allowed and would end the session). */
async function linksOn(page: Page): Promise<string[]> {
  const origin = new URL(productUrl()).origin;
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  const paths = new Set<string>();
  for (const h of hrefs) {
    try {
      const u = new URL(h);
      if (u.origin !== origin || /sign-?out|log-?out/i.test(u.pathname)) continue;
      paths.add(u.pathname + u.search);
    } catch {
      /* not a URL */
    }
  }
  return [...paths];
}

// ---------------------------------------------------------------------------------------------------
// ROW-260 promise: REQ-026 fail-if (1) "a person signed in with a password the admin set reaches any page or action
// ROW-260   other than choosing a new password or signing out"; A-041; the row's cases: after account creation and
// ROW-260   after a reset, through pages and direct addresses.
// ROW-260 wrong product: a redirect to /password done only by the home page's script, so /calendar typed in, a link
// ROW-260   followed, or GET /api/calendar called directly still serves the team; a flag set at creation but not by
// ROW-260   the admin's reset; a guard on pages but not on the API, so a request can still be sent or cancelled.
// ROW-260 given: a team whose calendar holds two fresh names (a member away 15–17 Mar, the admin away 15–16 Mar);
// ROW-260   (creation) a new account with the admin's password; (reset) an account that chose its own password, holds
// ROW-260   an approved and a pending request, then gets a new password from the admin. when: each signs in with the
// ROW-260   admin's password and calls GET /api/requests, GET /api/balance, GET /api/calendar, GET /api/admin/people,
// ROW-260   POST /api/requests (a valid vacation) and, for the reset case, cancels its own pending request; and loads
// ROW-260   every D-029 page in the browser and follows every link the page it lands on offers. then: every call
// ROW-260   answers 4xx carrying neither fresh name; no page load receives either name in any same-origin body; the
// ROW-260   /password page offers a password field; and once each person has chosen a password, the write never
// ROW-260   landed and the own pending request is still pending.
// ROW-260 controls: the control case takes the reset person through the choice and shows the same calls answer 2xx,
// ROW-260   GET /api/calendar and the /calendar page carry the away member's name — the probes see the team when
// ROW-260   allowed to.
// ROW-260 technique: fresh names as the team data; every address and link as the denominator; soft assertions per
// ROW-260   address and case, so a gap at any one fails the target.
// ROW-260 cases: ROW-260 target=ROW-260.REQ-026.with-the-admins-password-nothing-but-choosing-is-reachable control=ROW-260.control.after-choosing-the-same-probes-reach-the-team
test('ROW-260.control.after-choosing-the-same-probes-reach-the-team', async ({ browser }) => {
  const t = await team();
  const c = await afterReset(t);
  const forced = keep(await signIn({ email: c.member.email, password: c.adminSet }));
  const own = freshPassword();
  const chose = await choosePasswordRaw(forced.api, c.adminSet, own);
  expect(is2xx(chose.status), `ROW-260 control: choosing a password is accepted (answered ${chose.status})`).toBe(true);
  const s = keep(await signIn({ email: c.member.email, password: own }));
  expect((await getRaw(s.api, '/api/requests')).status, 'ROW-260 control: GET /api/requests answers').toBe(200);
  expect((await getRaw(s.api, '/api/balance')).status, 'ROW-260 control: GET /api/balance answers').toBe(200);
  const cal = await getRaw(s.api, '/api/calendar?year=2027&month=3');
  expect(cal.status, 'ROW-260 control: GET /api/calendar answers').toBe(200);
  expect(cal.text.includes(t.away.name), 'ROW-260 control: the calendar carries the away member').toBe(true);
  const opened = await openPage(browser, s);
  try {
    await opened.page.goto(PAGES.calendar);
    await expect(opened.page.getByText(t.away.name).first(), 'ROW-260 control: the /calendar page shows the away member').toBeVisible();
  } finally {
    await opened.close();
  }
});

test('ROW-260.REQ-026.with-the-admins-password-nothing-but-choosing-is-reachable', async ({ browser }) => {
  const t = await team();
  const secrets = secretsOf(t);
  const cases = [
    { label: 'after creation', ...(await afterCreation(t)) },
    { label: 'after a reset', ...(await afterReset(t)) },
  ];

  for (const c of cases) {
    const row = `ROW-260 ${c.label}`;
    const s = keep(await signIn({ email: c.member.email, password: c.adminSet }));

    // direct addresses
    const probes: { what: string; call: () => Promise<{ status: number; text: string }> }[] = [
      { what: 'GET /api/requests', call: () => getRaw(s.api, '/api/requests') },
      { what: 'GET /api/balance', call: () => getRaw(s.api, '/api/balance') },
      { what: 'GET /api/calendar', call: () => getRaw(s.api, '/api/calendar?year=2027&month=3') },
      { what: 'GET /api/admin/people', call: () => getRaw(s.api, '/api/admin/people') },
      { what: 'POST /api/requests', call: () => postRaw(s.api, '/api/requests', PROBE_WRITE) },
    ];
    if (c.ownPending !== null) {
      const id = c.ownPending;
      probes.push({ what: 'POST /api/requests/:id/cancel (own pending)', call: () => postRaw(s.api, `/api/requests/${encodeURIComponent(String(id))}/cancel`) });
    }
    for (const p of probes) {
      const r = await p.call();
      expect.soft(isRefusal(r.status), `${row}: ${p.what} is refused (answered ${r.status})`).toBe(true);
      expect.soft(leaked(r.text, secrets), `${row}: ${p.what} carries no team data`).toEqual([]);
    }

    // pages, and every link the landing page offers
    const opened = await openPage(browser, s);
    try {
      const page = opened.page;
      const addresses = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(t.away.id)];
      for (const a of addresses) {
        const load = await loadCapturing(page, a);
        expect.soft(leaked(load.bodies.join('\n'), secrets), `${row}: loading ${a} receives no team data (landed on ${load.path})`).toEqual([]);
      }
      await loadCapturing(page, PAGES.home);
      for (const link of await linksOn(page)) {
        const load = await loadCapturing(page, link);
        expect.soft(leaked(load.bodies.join('\n'), secrets), `${row}: following the link ${link} receives no team data`).toEqual([]);
      }
      const pw = await loadCapturing(page, PAGES.password);
      expect.soft(pw.status, `${row}: /password answers`).toBe(200);
      await expect.soft(page.locator('input[type=password]').first(), `${row}: /password offers a password field`).toBeVisible();
    } finally {
      await opened.close();
    }

    // nothing landed: choose a password, then look
    const own = freshPassword();
    const chose = await choosePasswordRaw(s.api, c.adminSet, own);
    expect.soft(is2xx(chose.status), `${row}: choosing a password stays available (answered ${chose.status})`).toBe(true);
    if (is2xx(chose.status)) {
      const after = keep(await signIn({ email: c.member.email, password: own }));
      const fig = await yearFigures(after, YEAR);
      const wantPending = c.ownPending === null ? 0 : 3;
      expect.soft(fig?.pending, `${row}: the refused write did not land and the own pending request was not cancelled`).toBe(wantPending);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-261 promise: REQ-026 fail-if (2) "the new password may equal the one the admin set"; A-041 "choose a new
// ROW-261   password" — the admin, who set it, must not still know it.
// ROW-261 wrong product: a change route that checks only the current password and the length (D-014), so typing
// ROW-261   the admin's password again clears the forced state; one that compares after trimming or folding case in
// ROW-261   one place but not the other.
// ROW-261 given: (creation) a new account with the admin's password P; (reset) an account that chose its own
// ROW-261   password, then got P' from the admin. when: each, signed in with the admin's password, posts
// ROW-261   POST /api/me/password {current: P, next: P}. then: the post answers 4xx; the session is still held to the
// ROW-261   choice (GET /api/balance refused); and a fresh sign-in with P still signs in and is still held to it.
// ROW-261 controls: the control case posts a fresh next password instead: 2xx, and the new session reaches
// ROW-261   GET /api/balance — the route, the body and the observation work.
// ROW-261 technique: the forbidden value itself (the admin's password) beside a control with a fresh one; the
// ROW-261   forced state read after the attempt, not only the attempt's status.
// ROW-261 cases: ROW-261 target=ROW-261.REQ-026.the-admins-password-is-refused-as-the-new-one control=ROW-261.control.a-fresh-new-password-is-accepted
test('ROW-261.control.a-fresh-new-password-is-accepted', async () => {
  const t = await team();
  const c = await afterCreation(t);
  const s = keep(await signIn({ email: c.member.email, password: c.adminSet }));
  expect(isRefusal((await getRaw(s.api, '/api/balance')).status), 'ROW-261 control before: the session is held to the choice').toBe(true);
  const own = freshPassword();
  const r = await choosePasswordRaw(s.api, c.adminSet, own);
  expect(is2xx(r.status), `ROW-261 control: a fresh new password is accepted (answered ${r.status})`).toBe(true);
  const after = keep(await signIn({ email: c.member.email, password: own }));
  expect((await getRaw(after.api, '/api/balance')).status, 'ROW-261 control: the new session reaches GET /api/balance').toBe(200);
});

test('ROW-261.REQ-026.the-admins-password-is-refused-as-the-new-one', async () => {
  const t = await team();
  for (const c of [
    { label: 'after creation', ...(await afterCreation(t)) },
    { label: 'after a reset', ...(await afterReset(t)) },
  ]) {
    const row = `ROW-261 ${c.label}`;
    const s = keep(await signIn({ email: c.member.email, password: c.adminSet }));
    const r = await choosePasswordRaw(s.api, c.adminSet, c.adminSet);
    expect.soft(isRefusal(r.status), `${row}: the admin's password as the new one is refused (answered ${r.status})`).toBe(true);
    expect.soft(isRefusal((await getRaw(s.api, '/api/balance')).status), `${row}: the session is still held to the choice`).toBe(true);
    const again = await trySignIn({ email: c.member.email, password: c.adminSet });
    expect.soft(signedIn(again), `${row}: the admin's password still signs in (nothing was chosen)`).toBe(true);
    expect.soft(again.me?.mustChangePassword, `${row}: and that session is still held to the choice`).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-262 promise: REQ-026 fail-if (3) "after choosing, the admin-set password still signs in"; A-041.
// ROW-262 wrong product: a choice stored beside the admin's password (either signs in); a choice that clears the
// ROW-262   forced flag but leaves the admin's hash in place; one that works after creation but, after a reset, keeps
// ROW-262   the reset password valid.
// ROW-262 given: (creation) a new account with the admin's password P; (reset) an account that chose its own,
// ROW-262   then got P' from the admin. when: each signs in with the admin's password and chooses a fresh password N.
// ROW-262   then: signing in with the admin's password is refused (no session: GET /api/me not 200), and N signs in
// ROW-262   to the same account.
// ROW-262 controls: the control case shows the admin's password signs in before the choice — the refusal after it
// ROW-262   is the choice's effect, not a password that never worked.
// ROW-262 technique: before and after on the same credentials; the session, not the status, as the effect.
// ROW-262 cases: ROW-262 target=ROW-262.REQ-026.after-choosing-the-admins-password-no-longer-signs-in control=ROW-262.control.the-admins-password-signs-in-before-the-choice
test('ROW-262.control.the-admins-password-signs-in-before-the-choice', async () => {
  const t = await team();
  for (const c of [await afterCreation(t), await afterReset(t)]) {
    expect(signedIn(await trySignIn({ email: c.member.email, password: c.adminSet })), "ROW-262 control: the admin's password signs in before the choice").toBe(true);
  }
});

test('ROW-262.REQ-026.after-choosing-the-admins-password-no-longer-signs-in', async () => {
  const t = await team();
  for (const c of [
    { label: 'after creation', ...(await afterCreation(t)) },
    { label: 'after a reset', ...(await afterReset(t)) },
  ]) {
    const row = `ROW-262 ${c.label}`;
    const s = keep(await signIn({ email: c.member.email, password: c.adminSet }));
    const own = freshPassword();
    const r = await choosePasswordRaw(s.api, c.adminSet, own);
    expect(is2xx(r.status), `${row}: choosing a fresh password is accepted (answered ${r.status})`).toBe(true);
    expect.soft(signedIn(await trySignIn({ email: c.member.email, password: c.adminSet })), `${row}: the admin's password no longer signs in`).toBe(false);
    const mine = await trySignIn({ email: c.member.email, password: own });
    expect.soft(signedIn(mine) && String(mine.me?.id) === String(c.member.id), `${row}: the chosen password signs in to the same account`).toBe(true);
  }
});
