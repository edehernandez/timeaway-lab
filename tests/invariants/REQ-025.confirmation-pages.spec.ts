// Purpose: ledger tests for ROW-275, ROW-276 and ROW-277 (REQ-025) — on the pending page (approve, reject), the person's requests page (cancel approved days) and the people page (switch off), operating the action opens a confirmation naming the person, the days and what will change, and nothing changes until it is confirmed.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approvals), fresh per run; the action itself is operated in the browser through the engine door.
//
// Boundary (R6): operation — the browser (harness openPage, Chromium) operates the page's real control; the
// effect, and its absence before confirming, is read over HTTP on the people concerned (GET /api/balance on their
// own sessions; sign-in for switch-off, A-008). Setup reaches the starting state through the API and never
// performs the act under test.
// The confirmation step is read as admin-kit's openConfirmation states it: the browser's own dialog or a visible
// dialog/alertdialog element, opened by the action's control; its text must carry the facts. The pages are D-029's
// /admin/pending, /admin/people/:id and /admin/people.
// Time: team zone Pacific/Auckland, instants where the UTC date is the day before (BASELINE "Test environment").
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import {
  actionControl,
  addDays,
  freshInt,
  mentionsDay,
  openConfirmation,
  pick,
  signedIn,
  teamInstant,
  trySignIn,
  weekdaysBetween,
  yearFigures,
} from './admin-kit';

const ZONE = DEFAULT_TIME_ZONE; // Pacific/Auckland
const YEAR = 2027;
const MON = '2027-03-08';
const FRI = '2027-03-12';
const STAY_WORD = /\b(stay|stays|remain|remains|kept|keep|keeps|unchanged|untouched|already taken|still approved|not cancel)/i;
const SWITCH_OFF = /switch(?:ed|es|ing)?[\s-]*off|deactivat|disabl/i;

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

interface Person {
  member: Member;
  session: Actor;
  allowance: number;
}

async function person(admin: Actor, label: string, avoid: number[] = []): Promise<Person> {
  const allowance = freshInt(20, 40, avoid);
  const member = await createMember(admin, { name: freshName(label), allowance });
  return { member, session: keep(await signInMember(member)), allowance };
}

async function start(date: string): Promise<{ install: Install; admin: Actor }> {
  const install = await resetProduct({ now: teamInstant(ZONE, date, '09:00'), timeZone: ZONE });
  return { install, admin: keep(await signIn(install.admin)) };
}

async function goto(page: Page, address: string, mustShow: string[], what: string): Promise<void> {
  const res = await page.goto(address);
  expect(res?.status(), `${what}: ${address} answers the admin`).toBe(200);
  for (const s of mustShow) await expect(page.getByText(s).first(), `${what}: ${address} shows "${s}"`).toBeVisible();
}

function expectDays(text: string, days: [string, string][], row: string): void {
  for (const [d, role] of days) {
    expect.soft(mentionsDay(text, d), `${row}: the confirmation names ${role}, ${d} — it shows: ${JSON.stringify(text)}`).toBe(true);
  }
}

// ---------------------------------------------------------------------------------------------------
// Pending page
// ---------------------------------------------------------------------------------------------------

interface PendingWorld {
  admin: Actor;
  ilse: Person;
  oskar: Person;
  petra: Person;
  r1: { firstDay: string; lastDay: string; days: number };
  ro: { firstDay: string; lastDay: string; days: number };
  rp: { firstDay: string; lastDay: string; days: number };
}

async function pendingWorld(): Promise<PendingWorld> {
  const { admin } = await start('2027-03-08');
  const ilse = await person(admin, 'Ilse');
  const oskar = await person(admin, 'Oskar', [ilse.allowance]);
  const petra = await person(admin, 'Petra', [ilse.allowance, oskar.allowance]);
  const k = pick([2, 3, 4]);
  const r1 = { firstDay: '2027-03-15', lastDay: addDays('2027-03-15', k - 1), days: k };
  const ro = { firstDay: '2027-03-22', lastDay: '2027-03-24', days: 3 };
  const rp = { firstDay: '2027-03-29', lastDay: '2027-03-31', days: 3 };
  await sendRequest(ilse.session, { kind: 'vacation', firstDay: r1.firstDay, lastDay: r1.lastDay });
  await sendRequest(oskar.session, { kind: 'vacation', firstDay: ro.firstDay, lastDay: ro.lastDay });
  await sendRequest(petra.session, { kind: 'vacation', firstDay: rp.firstDay, lastDay: rp.lastDay });
  return { admin, ilse, oskar, petra, r1, ro, rp };
}

// ROW-275 promise: REQ-025 (A-040) on the pending page: "approve and reject each ask for the confirmation that names
// ROW-275   the person, the days and what will change, and nothing changes until it is confirmed"; fail-if (1), (2).
// ROW-275 wrong product: an Approve button that decides at once; a confirmation reading "Are you sure?" with no
// ROW-275   name or days; one showing the first row's person or days whichever row was pressed; a page that posts the
// ROW-275   decision when the confirmation opens and only closes it on confirm.
// ROW-275 given: three pending requests from three people with fresh names — Ilse (from Mon 15 Mar, k weekdays, k
// ROW-275   per run), Oskar (22–24 Mar), Petra (29–31 Mar). when: the admin, on /admin/pending, presses Approve in
// ROW-275   Ilse's item; then, after reloading, Reject in Oskar's item. then: each press opens a confirmation whose
// ROW-275   text carries that person's name and no other's, that request's first and last day and none of the other
// ROW-275   requests' days, and the action's word; while it is open the person's figures are unchanged; after
// ROW-275   confirming, Ilse's request is approved (pending 0, days left A − k) and Oskar's rejected (pending 0, days
// ROW-275   left A); Petra's stays pending throughout.
// ROW-275 controls: the control case loads /admin/pending as the admin and sees all three fresh names — the page
// ROW-275   and the fixture are reached.
// ROW-275 technique: decoys — two other people's pending items on the same page, each named once; the before
// ROW-275   (confirmation open) and after (confirmed) reads on the same figures.
// ROW-275 cases: ROW-275 target=ROW-275.REQ-025.pending-page-approve-and-reject-confirm-before-deciding control=ROW-275.control.the-pending-page-shows-the-three-requests
test('ROW-275.control.the-pending-page-shows-the-three-requests', async ({ browser }) => {
  const w = await pendingWorld();
  const opened = await openPage(browser, w.admin);
  try {
    await goto(opened.page, PAGES.adminPending, [w.ilse.member.name, w.oskar.member.name, w.petra.member.name], 'ROW-275 control');
  } finally {
    await opened.close();
  }
});

test('ROW-275.REQ-025.pending-page-approve-and-reject-confirm-before-deciding', async ({ browser }) => {
  const w = await pendingWorld();
  const [ilse, oskar, petra] = [w.ilse.member.name, w.oskar.member.name, w.petra.member.name];
  const opened = await openPage(browser, w.admin);
  try {
    const page = opened.page;

    // approve, in Ilse's item
    await goto(page, PAGES.adminPending, [ilse], 'ROW-275 approve');
    const a = await openConfirmation(page, actionControl(page, ilse, [oskar, petra], /approve/i), /approve/i, 'ROW-275 approve');
    expect.soft(a.text.includes(ilse), `ROW-275 approve: the confirmation names ${ilse} — it shows: ${JSON.stringify(a.text)}`).toBe(true);
    for (const o of [oskar, petra]) expect.soft(a.text.includes(o), `ROW-275 approve: the confirmation does not name ${o}`).toBe(false);
    expectDays(a.text, [[w.r1.firstDay, "the request's first day"], [w.r1.lastDay, "the request's last day"]], 'ROW-275 approve');
    for (const d of [w.ro.firstDay, w.ro.lastDay, w.rp.firstDay, w.rp.lastDay]) {
      expect.soft(mentionsDay(a.text, d), `ROW-275 approve: the confirmation does not name ${d}, another request's day`).toBe(false);
    }
    expect.soft(/approv/i.test(a.text), `ROW-275 approve: the confirmation says the request will be approved — it shows: ${JSON.stringify(a.text)}`).toBe(true);
    expect.soft(await yearFigures(w.ilse.session, YEAR), 'ROW-275 approve: nothing changed while the confirmation is open').toEqual({
      daysLeft: w.ilse.allowance,
      pending: w.r1.days,
    });
    await a.confirm();
    await expect
      .poll(() => yearFigures(w.ilse.session, YEAR), { message: "ROW-275 approve: once confirmed, Ilse's request is approved", timeout: 10_000 })
      .toEqual({ daysLeft: w.ilse.allowance - w.r1.days, pending: 0 });

    // reject, in Oskar's item
    await goto(page, PAGES.adminPending, [oskar], 'ROW-275 reject');
    const r = await openConfirmation(page, actionControl(page, oskar, [ilse, petra], /reject/i), /reject/i, 'ROW-275 reject');
    expect.soft(r.text.includes(oskar), `ROW-275 reject: the confirmation names ${oskar} — it shows: ${JSON.stringify(r.text)}`).toBe(true);
    for (const o of [ilse, petra]) expect.soft(r.text.includes(o), `ROW-275 reject: the confirmation does not name ${o}`).toBe(false);
    expectDays(r.text, [[w.ro.firstDay, "the request's first day"], [w.ro.lastDay, "the request's last day"]], 'ROW-275 reject');
    for (const d of [w.r1.firstDay, w.rp.firstDay, w.rp.lastDay]) {
      expect.soft(mentionsDay(r.text, d), `ROW-275 reject: the confirmation does not name ${d}, another request's day`).toBe(false);
    }
    expect.soft(/reject/i.test(r.text), `ROW-275 reject: the confirmation says the request will be rejected — it shows: ${JSON.stringify(r.text)}`).toBe(true);
    expect.soft(await yearFigures(w.oskar.session, YEAR), 'ROW-275 reject: nothing changed while the confirmation is open').toEqual({
      daysLeft: w.oskar.allowance,
      pending: w.ro.days,
    });
    await r.confirm();
    await expect
      .poll(() => yearFigures(w.oskar.session, YEAR), { message: "ROW-275 reject: once confirmed, Oskar's request is rejected", timeout: 10_000 })
      .toEqual({ daysLeft: w.oskar.allowance, pending: 0 });

    expect.soft(await yearFigures(w.petra.session, YEAR), "ROW-275: Petra's request stays pending throughout").toEqual({
      daysLeft: w.petra.allowance,
      pending: w.rp.days,
    });
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// Person's requests page and people page: an approved Mon 8 – Fri 12 Mar, today inside it
// ---------------------------------------------------------------------------------------------------

interface SplitWorld {
  install: Install;
  admin: Actor;
  today: string;
  cancelled: number;
}

/** A fresh install on Fri 5 Mar; `setup` sends and approves what it needs; then the clock moves to Wed 10 or Thu 11 Mar 09:00 (per run). */
async function splitWorld(setup: (admin: Actor) => Promise<void>): Promise<SplitWorld> {
  const { install, admin } = await start('2027-03-05');
  await setup(admin);
  const today = pick(['2027-03-10', '2027-03-11']);
  await setClock(teamInstant(ZONE, today, '09:00'));
  return { install, admin, today, cancelled: weekdaysBetween(today, FRI).length };
}

async function approvedWeek(admin: Actor, p: Person): Promise<void> {
  const id = await sendRequest(p.session, { kind: 'vacation', firstDay: MON, lastDay: FRI });
  await approve(admin, id);
}

// ROW-276 promise: REQ-025 (A-040, A-030) on the person's requests page: "cancelling approved days asks for the
// ROW-276   confirmation that names the person, the days cancelled and the days that stay, and nothing changes until it
// ROW-276   is confirmed"; fail-if (1), (2), (3); A-007: days from today on are cancelled, days before today stay.
// ROW-276 wrong product: a Cancel button that gives the days back at once; a confirmation naming the request's whole
// ROW-276   range as cancelled; one silent about the days that stay; one computing today from the UTC date.
// ROW-276 given: Ilse (fresh name, allowance A) with an approved Mon 8 – Fri 12 Mar; today (per run) Wed 10 or Thu
// ROW-276   11 Mar 09:00 team time, the UTC date the day before. when: the admin, on /admin/people/<Ilse>, presses the
// ROW-276   request's cancel control. then: a confirmation opens carrying Ilse's name, the first and last cancelled
// ROW-276   day (today, Fri 12), the first and last staying day (Mon 8, the day before today), the word cancel and a
// ROW-276   word that the others stay; while open, Ilse's days left are still A − 5; once confirmed, A − 5 + the
// ROW-276   cancelled weekdays.
// ROW-276 controls: the control case loads /admin/people/<Ilse> as the admin and sees her name — the page is reached.
// ROW-276 technique: the threshold of today inside the request, per-run today, each side named by its endpoints;
// ROW-276   before (open) and after (confirmed) on the same figure.
// ROW-276 cases: ROW-276 target=ROW-276.REQ-025.person-page-cancel-confirms-the-days-that-go-and-stay-before-cancelling control=ROW-276.control.the-person-page-shows-the-person
test('ROW-276.control.the-person-page-shows-the-person', async ({ browser }) => {
  let ilse!: Person;
  const w = await splitWorld(async (admin) => {
    ilse = await person(admin, 'Ilse');
    await approvedWeek(admin, ilse);
  });
  const opened = await openPage(browser, w.admin);
  try {
    await goto(opened.page, PAGES.adminPerson(ilse.member.id), [ilse.member.name], 'ROW-276 control');
  } finally {
    await opened.close();
  }
});

test('ROW-276.REQ-025.person-page-cancel-confirms-the-days-that-go-and-stay-before-cancelling', async ({ browser }) => {
  let ilse!: Person;
  const w = await splitWorld(async (admin) => {
    ilse = await person(admin, 'Ilse');
    await approvedWeek(admin, ilse);
  });
  const name = ilse.member.name;
  const opened = await openPage(browser, w.admin);
  try {
    const page = opened.page;
    await goto(page, PAGES.adminPerson(ilse.member.id), [name], 'ROW-276');
    const trigger = page.getByRole('button', { name: /cancel/i }).or(page.getByRole('link', { name: /cancel/i })).first();
    const c = await openConfirmation(page, trigger, /cancel/i, 'ROW-276 cancel');
    expect.soft(c.text.includes(name), `ROW-276: the confirmation names ${name} — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expectDays(
      c.text,
      [
        [w.today, 'the first cancelled day'],
        [FRI, 'the last cancelled day'],
        [MON, 'the first day that stays'],
        [addDays(w.today, -1), 'the last day that stays'],
      ],
      'ROW-276',
    );
    expect.soft(/cancel/i.test(c.text), `ROW-276: the confirmation says days are cancelled — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(STAY_WORD.test(c.text), `ROW-276: the confirmation says which days stay — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(await yearFigures(ilse.session, YEAR), 'ROW-276: nothing changed while the confirmation is open').toEqual({
      daysLeft: ilse.allowance - 5,
      pending: 0,
    });
    await c.confirm();
    await expect
      .poll(() => yearFigures(ilse.session, YEAR), { message: 'ROW-276: once confirmed, the days from today on are given back', timeout: 10_000 })
      .toEqual({ daysLeft: ilse.allowance - 5 + w.cancelled, pending: 0 });
  } finally {
    await opened.close();
  }
});

// ROW-277 promise: REQ-025 (A-040, A-030) on the people page: "switching an account off asks for the confirmation that
// ROW-277   names the person, the days that will be cancelled and those that stay, and nothing changes until it is
// ROW-277   confirmed"; fail-if (1), (2), (3); REQ-016: switching off cancels pending requests and approved days from
// ROW-277   today on, days before today stay.
// ROW-277 wrong product: a Switch off button (or toggle) that acts at once; a confirmation that names the account
// ROW-277   but no days; one silent about the days that stay; one naming the row above's person.
// ROW-277 given: Oskar (fresh name) with an approved Mon 8 – Fri 12 Mar and a pending 22–24 Mar; Petra (fresh name,
// ROW-277   an approved Mon 8 – Fri 12 Mar too) listed on the same page; today (per run) Wed 10 or Thu 11 Mar. when: the
// ROW-277   admin, on /admin/people, presses switch off in Oskar's item. then: a confirmation opens carrying Oskar's
// ROW-277   name and not Petra's, the cancelled days (today, Fri 12, 22 and 24 Mar), the staying days (Mon 8, the day
// ROW-277   before today), the word cancel, a word that the others stay, and that the account is switched off; while
// ROW-277   open, Oskar still signs in and his figures are unchanged; once confirmed, he no longer signs in.
// ROW-277 controls: the control case loads /admin/people as the admin and sees both fresh names — page and fixture.
// ROW-277 technique: a decoy person with the same days on the same page; before (open) and after (confirmed).
// ROW-277 cases: ROW-277 target=ROW-277.REQ-025.people-page-switch-off-confirms-the-days-that-go-and-stay-before-switching control=ROW-277.control.the-people-page-shows-both-people
test('ROW-277.control.the-people-page-shows-both-people', async ({ browser }) => {
  let oskar!: Person;
  let petra!: Person;
  const w = await splitWorld(async (admin) => {
    oskar = await person(admin, 'Oskar');
    petra = await person(admin, 'Petra', [oskar.allowance]);
  });
  const opened = await openPage(browser, w.admin);
  try {
    await goto(opened.page, PAGES.adminPeople, [oskar.member.name, petra.member.name], 'ROW-277 control');
  } finally {
    await opened.close();
  }
});

test('ROW-277.REQ-025.people-page-switch-off-confirms-the-days-that-go-and-stay-before-switching', async ({ browser }) => {
  let oskar!: Person;
  let petra!: Person;
  const w = await splitWorld(async (admin) => {
    oskar = await person(admin, 'Oskar');
    petra = await person(admin, 'Petra', [oskar.allowance]);
    await approvedWeek(admin, oskar);
    await approvedWeek(admin, petra);
    await sendRequest(oskar.session, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-24' });
  });
  const [o, p] = [oskar.member.name, petra.member.name];
  const opened = await openPage(browser, w.admin);
  try {
    const page = opened.page;
    await goto(page, PAGES.adminPeople, [o, p], 'ROW-277');
    const trigger = actionControl(page, o, [p, w.install.admin.name], SWITCH_OFF);
    const c = await openConfirmation(page, trigger, SWITCH_OFF, 'ROW-277 switch off');
    expect.soft(c.text.includes(o), `ROW-277: the confirmation names ${o} — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(c.text.includes(p), `ROW-277: the confirmation does not name ${p}`).toBe(false);
    expectDays(
      c.text,
      [
        [w.today, 'the first cancelled approved day'],
        [FRI, 'the last cancelled approved day'],
        ['2027-03-22', "the pending request's first day (cancelled)"],
        ['2027-03-24', "the pending request's last day (cancelled)"],
        [MON, 'the first day that stays'],
        [addDays(w.today, -1), 'the last day that stays'],
      ],
      'ROW-277',
    );
    expect.soft(/cancel/i.test(c.text), `ROW-277: the confirmation says days are cancelled — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(STAY_WORD.test(c.text), `ROW-277: the confirmation says which days stay — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(SWITCH_OFF.test(c.text), `ROW-277: the confirmation says the account is switched off — it shows: ${JSON.stringify(c.text)}`).toBe(true);
    expect.soft(signedIn(await trySignIn(oskar.member)), 'ROW-277: Oskar still signs in while the confirmation is open').toBe(true);
    expect.soft(await yearFigures(oskar.session, YEAR), "ROW-277: Oskar's figures are unchanged while the confirmation is open").toEqual({
      daysLeft: oskar.allowance - 5,
      pending: 3,
    });
    await c.confirm();
    await expect
      .poll(async () => signedIn(await trySignIn(oskar.member)), { message: 'ROW-277: once confirmed, Oskar is switched off', timeout: 10_000 })
      .toBe(false);
    expect.soft(signedIn(await trySignIn(petra.member)), 'ROW-277: Petra is untouched').toBe(true);
  } finally {
    await opened.close();
  }
});
