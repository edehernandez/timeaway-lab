// Purpose: ledger tests for ROW-097, ROW-098, ROW-099 and ROW-100 (REQ-020) — the admin's people page lists every account, each with its name, email, switched-on state and both years' allowance and days left, starts each of the six account actions, and none of it reaches a member.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, allowances, requests, approve, switch-off), read through records.ts, fresh per run.
//
// Boundaries (R6): what the page lists is read at the HTTP harness from the page's data (GET /api/admin/people,
// D-029) and, for "missing from the page", on the page itself; "can be started from the page" is operation, read in
// the browser (the engine door) on /admin/people; ROW-100's "by the page or by any data the product sends them" is
// read on every response the member's browser receives and on the member's own HTTP answers.
// The people answer's field names are not in D-029: an account's record is the record holding its email as a value,
// its facts read by value (records.ts). The values are chosen unusual (37, 41, 34, 39, 173, 181, 170) so that no id,
// date or count of the fixture can supply them.
// The clock: Mon 2027-03-01 09:00 in Pacific/Auckland, so the current year is 2027 and the next 2028.
import { test, expect, type Page } from '@playwright/test';
import {
  anonymousApi,
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  fresh,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setAllowance,
  signIn,
  signInMember,
  switchAccount,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { controlsAbout, holdsValue, leaves, observePeople, onOffPath, recordByEmail, show, teamInstant } from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_NOW = teamInstant('2027-03-01', '09:00', TZ);

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
  on: Member; // switched on: allowance 2027 37, 2028 41; approved 3 days in 2027, 2 in 2028 → days left 34 and 39
  off: Member; // switched off: allowance 23
}

async function team(): Promise<Team> {
  const install = await resetProduct({ now: T_NOW, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const on = await createMember(admin, { name: freshName('Mona'), email: freshEmail('mona'), allowance: 37 });
  const off = await createMember(admin, { name: freshName('Otto'), email: freshEmail('otto'), allowance: 23 });
  await setAllowance(admin, on.id, 41, { startsNextYear: true });
  const onActor = keep(await signInMember(on));
  await approve(admin, await sendRequest(onActor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(onActor, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-08' }));
  await switchAccount(admin, off.id, false);
  return { install, admin, on, off };
}

/** True when the page shows `text`, as text or as an input's value. */
async function pageHolds(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const lower = t.toLowerCase();
    if ((document.body.innerText || '').toLowerCase().includes(lower)) return true;
    return Array.from(document.querySelectorAll('input')).some((i) => (i.value || '').toLowerCase().includes(lower));
  }, text);
}

// ---------------------------------------------------------------------------------------------------
// ROW-097 promise: REQ-020 fail-if (1) "an account is missing from the page"; REQ-020 "a people page listing every
// ROW-097   account" (A-031). The row's case: a switched-off account and the admin are both listed.
// ROW-097 wrong product: a people page that lists only switched-on accounts, or only the members (the admin left
// ROW-097   out as "not a person"), or one built from the accounts that have requests.
// ROW-097 given: the admin, a switched-on member (Mona) and a switched-off member (Otto), each with a fresh email.
// ROW-097   when: the admin reads the people page's data and opens /admin/people. then: the data holds a record for each
// ROW-097   of the three emails, and the page shows each of the three emails.
// ROW-097 controls: the control case shows the page and its data answer the admin (200) and the switched-on member is
// ROW-097   listed — so the target's failures are about the switched-off account and the admin.
// ROW-097 technique: a denominator over every account the product holds (three), each by its fresh email; the two
// ROW-097   accounts a plausible filter drops are the row's own cases.
// ROW-097 cases: ROW-097 target=ROW-097.REQ-020.every-account-the-switched-off-one-and-the-admin-is-listed control=ROW-097.control.the-people-page-answers-the-admin-and-lists-a-member
test('ROW-097.control.the-people-page-answers-the-admin-and-lists-a-member', async ({ browser }) => {
  const t = await team();
  const people = await observePeople(t.admin);
  expect(recordByEmail(people, t.on.email), `ROW-097 control: the switched-on member is in the people data (${show(people)})`).toBeDefined();
  const opened = await openPage(browser, t.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-097 control: /admin/people answers the admin').toBe(200);
    await expect.poll(() => pageHolds(opened.page, t.on.email), { message: 'ROW-097 control: the page shows the switched-on member', timeout: 10_000 }).toBe(true);
  } finally {
    await opened.close();
  }
});

test('ROW-097.REQ-020.every-account-the-switched-off-one-and-the-admin-is-listed', async ({ browser }) => {
  const t = await team();
  const accounts = [
    { label: 'the admin', email: t.install.admin.email },
    { label: 'the switched-on member', email: t.on.email },
    { label: 'the switched-off member', email: t.off.email },
  ];
  const people = await observePeople(t.admin);
  for (const a of accounts) {
    expect.soft(recordByEmail(people, a.email), `ROW-097: ${a.label} (${a.email}) has a record in the people page's data (${show(people)})`).toBeDefined();
  }
  const opened = await openPage(browser, t.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-097: /admin/people is reached (setup)').toBe(200);
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    // readiness: a bounded wait for the whole list to be drawn, then one assertion per account
    const allShown = async () => (await Promise.all(accounts.map((a) => pageHolds(opened.page, a.email)))).every(Boolean);
    await expect.poll(allShown, { timeout: 10_000 }).toBe(true).catch(() => undefined);
    for (const a of accounts) {
      expect.soft(await pageHolds(opened.page, a.email), `ROW-097: the page lists ${a.label} (${a.email})`).toBe(true);
    }
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-098 promise: REQ-020 fail-if (2) "a listed account lacks its name, email, switched-on state, either year's
// ROW-098   allowance or either year's days left" (REQ-020: allowance and days left for the current and the next year;
// ROW-098   A-031, A-043).
// ROW-098 wrong product: a people list with the current year only (no next-year allowance or days left), with the
// ROW-098   allowance but no days left, or with no switched-on state.
// ROW-098 given: Mona, switched on, allowance 37 for 2027 and 41 from 2028, 3 days approved in 2027 and 2 in 2028
// ROW-098   (days left 34 and 39); Otto, switched off, allowance 23. when: the admin reads the people page's data. then:
// ROW-098   Mona's record holds her name, her email, 37, 41, 34 and 39; Otto's holds his name, email and 23; a field the
// ROW-098   two records share reads switched on for Mona and the admin and switched off for Otto.
// ROW-098 controls: the control case shows the people data answers the admin with Mona's record holding her name, so
// ROW-098   the target's failures are about the further fields.
// ROW-098 technique: unusual, distinct values per field (no id, date or count equals any), so "holds 39" can only be
// ROW-098   the next year's days left; the on/off state read as the one field whose value differs between an on and an
// ROW-098   off account and agrees with the admin's.
// ROW-098 cases: ROW-098 target=ROW-098.REQ-020.each-listed-account-holds-every-named-field control=ROW-098.control.the-people-data-holds-the-members-record
test('ROW-098.control.the-people-data-holds-the-members-record', async () => {
  const t = await team();
  const people = await observePeople(t.admin);
  const mona = recordByEmail(people, t.on.email);
  expect(mona, `ROW-098 control: Mona's record is found by her email (${show(people)})`).toBeDefined();
  expect(holdsValue(mona, t.on.name), 'ROW-098 control: it holds her name').toBe(true);
});

test('ROW-098.REQ-020.each-listed-account-holds-every-named-field', async () => {
  const t = await team();
  const people = await observePeople(t.admin);
  const mona = recordByEmail(people, t.on.email);
  const otto = recordByEmail(people, t.off.email);
  const admin = recordByEmail(people, t.install.admin.email);
  expect(mona && otto, `ROW-098: both members' records are listed (${show(people)})`).toBeTruthy();
  const m = `ROW-098: Mona's record (${show(mona)})`;
  expect.soft(holdsValue(mona, t.on.name), `${m} holds her name`).toBe(true);
  expect.soft(holdsValue(mona, t.on.email), `${m} holds her email`).toBe(true);
  expect.soft(holdsValue(mona, 37), `${m} holds the current year's allowance 37`).toBe(true);
  expect.soft(holdsValue(mona, 41), `${m} holds the next year's allowance 41`).toBe(true);
  expect.soft(holdsValue(mona, 34), `${m} holds the current year's days left 34`).toBe(true);
  expect.soft(holdsValue(mona, 39), `${m} holds the next year's days left 39`).toBe(true);
  const o = `ROW-098: Otto's record (${show(otto)})`;
  expect.soft(holdsValue(otto, t.off.name), `${o} holds his name`).toBe(true);
  expect.soft(holdsValue(otto, t.off.email), `${o} holds his email`).toBe(true);
  expect.soft(holdsValue(otto, 23), `${o} holds his allowance and days left 23`).toBe(true);
  expect.soft(holdsValue(otto, 37), `${o} does not carry Mona's allowance (the right values on the right items)`).toBe(false);
  expect.soft(onOffPath(mona!, otto!, admin), 'ROW-098: a shared field reads switched on for Mona and the admin and switched off for Otto').toBeDefined();
});

// ---------------------------------------------------------------------------------------------------
// ROW-099 promise: REQ-020 fail-if (3) "any of the six account actions (including changing an email) cannot be started
// ROW-099   from the page"; REQ-020 "from it the admin creates accounts, changes a name, changes an email, sets a new
// ROW-099   password, changes an allowance and switches an account off or on" (A-031, A-044). D-029: forms are labelled
// ROW-099   in plain words, so each action's control is named with the action's own word.
// ROW-099 wrong product: a people page that is a read-only table, or one with every action but "change email" (the
// ROW-099   action added last, A-044), or a switch control on switched-on rows only so a switched-off account cannot be
// ROW-099   switched back on.
// ROW-099 given: Mona (on) and Otto (off). when: the admin opens /admin/people. then: outside the page's navigation, an
// ROW-099   enabled control names creating an account (create / add); within Mona's part of the page (the largest element
// ROW-099   holding her email and no other account's) enabled controls or labelled fields name her name, email, password,
// ROW-099   allowance and switching; within Otto's part, a control names switching.
// ROW-099 controls: the control case shows /admin/people answers the admin and holds Mona's email, so a missing
// ROW-099   control is not a missing page.
// ROW-099 technique: one exact place per action (the account's own part of the page, by its fresh email), plain-word
// ROW-099   names per D-029, a control or a labelled field accepted alike (inline editing is starting an action).
// ROW-099 cases: ROW-099 target=ROW-099.REQ-020.each-of-the-six-account-actions-starts-from-the-page control=ROW-099.control.the-people-page-is-drawn-with-the-members-row
test('ROW-099.control.the-people-page-is-drawn-with-the-members-row', async ({ browser }) => {
  const t = await team();
  const opened = await openPage(browser, t.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-099 control: /admin/people answers the admin').toBe(200);
    await expect.poll(() => pageHolds(opened.page, t.on.email), { message: "ROW-099 control: Mona's row is drawn", timeout: 10_000 }).toBe(true);
  } finally {
    await opened.close();
  }
});

test('ROW-099.REQ-020.each-of-the-six-account-actions-starts-from-the-page', async ({ browser }) => {
  const t = await team();
  const opened = await openPage(browser, t.admin);
  const page = opened.page;
  try {
    const res = await page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-099: /admin/people is reached (setup)').toBe(200);
    await expect.poll(() => pageHolds(page, t.on.email), { timeout: 10_000 }).toBe(true);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    const pageWide = await page.evaluate(() => {
      const sel = 'button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"]';
      return Array.from(document.querySelectorAll(sel))
        .filter((el) => !el.closest('nav, header, [role="navigation"], [role="banner"]'))
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => ({
          name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim(),
          enabled: !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
        }));
    });
    const create = pageWide.filter((c) => c.enabled && (/\b(create|add)\b/i.test(c.name) || /\bnew\b.*\b(account|person|member)\b/i.test(c.name)));
    expect.soft(create.length, `ROW-099: an enabled control starts creating an account (controls: ${show(pageWide)})`).toBeGreaterThan(0);

    const others = [t.install.admin.email, t.on.email, t.off.email];
    const mona = await controlsAbout(page, t.on.email, others);
    const otto = await controlsAbout(page, t.off.email, others);
    expect(mona.found && otto.found, 'ROW-099: both members are on the page').toBe(true);
    const has = (cs: typeof mona.controls, re: RegExp) => cs.some((c) => c.enabled && re.test(c.name));
    const perAccount: [string, RegExp][] = [
      ['change her name', /name/i],
      ['change her email', /e-?mail/i],
      ['set a new password', /password/i],
      ['change her allowance', /allowance/i],
      ['switch her off', /switch|turn\s*off|deactivat|disable|\boff\b/i],
    ];
    for (const [what, re] of perAccount) {
      expect.soft(has(mona.controls, re), `ROW-099: Mona's row starts "${what}" (her row's controls: ${show(mona.controls)})`).toBe(true);
    }
    expect.soft(has(otto.controls, /switch|turn\s*on|reactivat|activat|enable|\bon\b/i), `ROW-099: Otto's row (switched off) starts switching him on (his row's controls: ${show(otto.controls)})`).toBe(true);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-100 promise: REQ-020 fail-if (4) "anyone but the admin sees any other account's email, switched-on state,
// ROW-100   allowance or days left that the page lists, by the page or by any data the product sends them, or starts any
// ROW-100   of the page's account actions"; INV-003; D-027 (every response shaped per viewer). The row's case: a member's
// ROW-100   own-page response carries no other account's email, allowance or days left.
// ROW-100 wrong product: a home page that loads the people list to draw names (sending every email and balance to every
// ROW-100   browser), an admin people route that checks only "signed in", or an account-action route without the admin check.
// ROW-100 given: neighbour Nora with a fresh email, allowance 173 for 2027 and 181 from 2028, 3 days approved in March
// ROW-100   2027 (days left 170 and 181); member Max, allowance 25, no requests. when: Max loads his own pages (/, /calendar,
// ROW-100   /requests/new) and the admin's (/admin/people, /admin/people/:Nora) in the browser, every response recorded, and
// ROW-100   calls the people routes and all six account actions on Nora over HTTP. then: no response Max receives contains
// ROW-100   Nora's email, no JSON he receives holds 173, 181 or 170, no page he sees shows them; the people routes and every
// ROW-100   action are refused, and afterwards Nora's record is unchanged, no account was created, and Nora still signs in.
// ROW-100 controls: the control case shows the same data exists to leak — the admin's people data holds Nora's email
// ROW-100   and 173 — and Max's own answers (GET /api/me, /api/balance, /api/calendar) answer 200 with his own figures.
// ROW-100 technique: a denominator over every response the member's browser receives (never one field), fresh email
// ROW-100   and unusual numbers no product can hold by chance; a refused attempt checked for "changes nothing".
// ROW-100 cases: ROW-100 target=ROW-100.REQ-020.a-member-receives-no-other-accounts-people-data-and-starts-no-account-action control=ROW-100.control.the-data-exists-and-the-members-own-answers-work
async function neighbourAndMember(): Promise<{ admin: Actor; nora: Member; max: Member; maxActor: Actor }> {
  const install = await resetProduct({ now: T_NOW, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const nora = await createMember(admin, { name: freshName('Nora'), email: freshEmail('nora'), allowance: 173 });
  await setAllowance(admin, nora.id, 181, { startsNextYear: true });
  const noraActor = keep(await signInMember(nora));
  await approve(admin, await sendRequest(noraActor, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-10' }));
  const max = await createMember(admin, { name: freshName('Max'), email: freshEmail('max'), allowance: 25 });
  const maxActor = keep(await signInMember(max));
  return { admin, nora, max, maxActor };
}

const SECRET_NUMBERS = [173, 181, 170];

test('ROW-100.control.the-data-exists-and-the-members-own-answers-work', async () => {
  const f = await neighbourAndMember();
  const people = await observePeople(f.admin);
  const nora = recordByEmail(people, f.nora.email);
  expect(nora, "ROW-100 control: the admin's people data holds Nora's email").toBeDefined();
  expect(holdsValue(nora, 173), "ROW-100 control: the admin's people data holds Nora's allowance 173").toBe(true);
  for (const route of ['/api/me', '/api/balance', '/api/calendar?year=2027&month=3', '/api/requests']) {
    expect.soft((await f.maxActor.api.get(route)).status(), `ROW-100 control: Max's own ${route} answers him`).toBe(200);
  }
});

test('ROW-100.REQ-020.a-member-receives-no-other-accounts-people-data-and-starts-no-account-action', async ({ browser }) => {
  const f = await neighbourAndMember();
  const received: { where: string; contentType: string; text: string }[] = [];

  // By the page: every response Max's browser receives on his own pages and on the admin's.
  const opened = await openPage(browser, f.maxActor);
  const bodies: Promise<void>[] = [];
  opened.page.on('response', (r) => {
    bodies.push(
      r
        .text()
        .then((text) => void received.push({ where: `browser ${r.request().method()} ${r.url()}`, contentType: r.headers()['content-type'] || '', text }))
        .catch(() => undefined),
    );
  });
  const pageTexts: { where: string; text: string }[] = [];
  try {
    for (const p of [PAGES.home, PAGES.calendar, PAGES.newRequest, PAGES.adminPeople, PAGES.adminPerson(f.nora.id)]) {
      await opened.page.goto(p).catch(() => undefined);
      await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      pageTexts.push({ where: `page ${p}`, text: await opened.page.locator('body').innerText().catch(() => '') });
    }
    await Promise.all(bodies);
  } finally {
    await opened.close();
  }

  // By any data: Max's own API answers and the people routes.
  for (const route of ['/api/me', '/api/balance', '/api/requests', '/api/calendar?year=2027&month=3', '/api/calendar?year=2028&month=2']) {
    const res = await f.maxActor.api.get(route);
    received.push({ where: `GET ${route}`, contentType: res.headers()['content-type'] || '', text: await res.text() });
  }
  for (const route of ['/api/admin/people', `/api/admin/people/${f.nora.id}/requests`, `/api/admin/people/${f.nora.id}/history`]) {
    const res = await f.maxActor.api.get(route);
    expect.soft(res.ok(), `ROW-100: GET ${route} is refused to a member (answered ${res.status()})`).toBe(false);
    received.push({ where: `GET ${route}`, contentType: res.headers()['content-type'] || '', text: await res.text() });
  }

  for (const r of received) {
    expect.soft(r.text.toLowerCase().includes(f.nora.email.toLowerCase()), `ROW-100: ${r.where} carries no other account's email`).toBe(false);
    if (/json/i.test(r.contentType)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        parsed = undefined;
      }
      const hits = leaves(parsed).filter((l) => SECRET_NUMBERS.some((n) => l.value === n || l.value === String(n)));
      expect.soft(hits, `ROW-100: ${r.where} holds no other account's allowance or days left`).toEqual([]);
    }
  }
  for (const p of pageTexts) {
    expect.soft(p.text.toLowerCase().includes(f.nora.email.toLowerCase()), `ROW-100: ${p.where} shows no other account's email`).toBe(false);
    const shown = SECRET_NUMBERS.filter((n) => new RegExp(`(^|[^\\d])${n}([^\\d]|$)`).test(p.text));
    expect.soft(shown, `ROW-100: ${p.where} shows no other account's allowance or days left`).toEqual([]);
  }

  // Starts no account action.
  const createdEmail = freshEmail('intruder');
  const n = encodeURIComponent(String(f.nora.id));
  const attempts: [string, () => ReturnType<Actor['api']['get']>][] = [
    ['create an account', () => f.maxActor.api.post('/api/admin/accounts', { data: { name: freshName('Intruder'), email: createdEmail, password: freshPassword(), allowance: 5 } })],
    ['rename', () => f.maxActor.api.post(`/api/admin/accounts/${n}/name`, { data: { name: freshName('Renamed') } })],
    ['change email', () => f.maxActor.api.post(`/api/admin/accounts/${n}/email`, { data: { email: freshEmail('stolen') } })],
    ['set password', () => f.maxActor.api.post(`/api/admin/accounts/${n}/password`, { data: { password: freshPassword() } })],
    ['change allowance', () => f.maxActor.api.post(`/api/admin/accounts/${n}/allowance`, { data: { allowance: 3, startsNextYear: false } })],
    ['read the switch-off effect', () => f.maxActor.api.get(`/api/admin/accounts/${n}/effect?action=switch-off`)],
    ['switch off', () => f.maxActor.api.post(`/api/admin/accounts/${n}/switch`, { data: { on: false, token: fresh('token') } })],
  ];
  for (const [what, call] of attempts) {
    const res = await call();
    expect.soft(res.ok(), `ROW-100: a member's "${what}" on another account is refused (answered ${res.status()})`).toBe(false);
  }
  const people = await observePeople(f.admin);
  const nora = recordByEmail(people, f.nora.email);
  expect.soft(nora, "ROW-100: Nora's email is unchanged").toBeDefined();
  expect.soft(holdsValue(nora, f.nora.name), "ROW-100: Nora's name is unchanged").toBe(true);
  expect.soft(holdsValue(nora, 173), "ROW-100: Nora's allowance is unchanged").toBe(true);
  expect.soft(recordByEmail(people, createdEmail), 'ROW-100: no account was created by the member').toBeUndefined();
  const anon = keep(await anonymousApi());
  const signInRes = await anon.post('/api/auth/sign-in', { data: { email: f.nora.email, password: f.nora.password } });
  expect.soft(signInRes.ok(), 'ROW-100: Nora still signs in with her own password (not switched off, password not set)').toBe(true);
});
