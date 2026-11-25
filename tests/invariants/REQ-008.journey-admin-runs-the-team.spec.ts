// Purpose: ledger journey test for ROW-121 (REQ-008, REQ-009, REQ-010, REQ-013, REQ-015, REQ-016, REQ-019, REQ-020, REQ-021, REQ-025) — the admin creates an account, approves and rejects requests through their confirmations, cancels the rest of an approved vacation running across today, sets a forgotten password and switches a leaver off — every transition operated in the browser.
// Provenance: hand-authored (test-author pass, slice 0, journeys batch test-author-9); fixture data (the team, its requests, the approval of the vacation that later runs across today, the members' own password choice) made through the product's public routes by harness.ts, fresh per run; the journey's own transitions are operated only through the engine door.
// Repaired (slice 1, brief test-author-12): an item is found by its own first and last day drawn as dates (drawnDay),
// never by lone numbers a note tag or a Sent time supplies; day and figure reads take out names, emails, the note
// and times of day first. Every assertion kept.
//
// Boundary (R6): a journey — operation and paint — so the browser, through harness.openPage; setup reaches the
// starting state through the API and never performs a transition. Effects the page does not carry are read where the
// product exposes them: the calendar through GET /api/calendar (D-029's body), days left through GET /api/balance,
// sign-in through POST /api/auth/sign-in. deployed-selector: none — docker-compose.test.yml's x-vid-harness declares no
// deployed-selector:, and this journey is no (process) journey, so it runs in the one pass.
//
// The controls this file operates, by accessible name (D-029: forms labelled in plain words; the row's own words):
//   "create account control": button or link /^(create account|create|add account|add person|new account)$/i, then
//     fields "Name" (or "Display name"), "Email", every password field of the form, "Allowance", and the form's submit;
//   "approve control" /^approve$/i, "reject control" /^reject$/i with a field labelled /note|reason/i, "cancel control"
//     /^cancel/i, "switch off control" /^switch off$/i — each inside its request's or account's item;
//   "set password control" /^(set password|set new password|new password|reset password)$/i in the account's item,
//     then every password field it shows and its form's submit (or Enter);
//   an account's switched-on state is read from its item's text without controls: /switched on|on|active|enabled/
//     against /switched off|off|inactive|disabled/, and from its control: switch off when on, switch on when off;
//   the confirmation: a native dialog, or the visible button named Confirm or Yes … (journey-pages.ts).
// Pages (D-029): the people page "/admin/people", the pending requests page "/admin/pending", a person's requests
// page "/admin/people/:id". How items, item states and confirmations are read: journey-pages.ts's header.
//
// The team clock (BASELINE "Test environment"): the zone is Pacific/Auckland (NZDT, UTC+13 in March 2027). The team is
// set up at Mon 2027-03-01 10:00 there; the journey runs at Tue 2027-03-09 08:00 there, when UTC is still Monday 8
// March — so a product deciding "today" by UTC would cancel from Monday 8 and give back 3 days, not 2.
//
// ROW-121 promise: the row's transitions, from REQ-013 and REQ-020 (the admin creates an account with name, email,
// ROW-121   first password and allowance; the people page lists it switched on with its allowance and days left),
// ROW-121   REQ-008/REQ-009/REQ-025 (from the pending page the admin approves, or rejects with a note, each after a
// ROW-121   confirmation naming the person, the days and the effect; approving puts the days on the calendar; the
// ROW-121   decided request leaves the pending list; the person's page shows a rejection with its note: A-015),
// ROW-121   REQ-010/REQ-019/REQ-021 (from a person's page the admin cancels an approved request running across today:
// ROW-121   its weekdays from today on are cancelled and given back, the earlier ones stay approved, the request stays
// ROW-121   approved with the cancel day recorded; A-007, A-030, A-031), REQ-015 (after the admin sets a password the
// ROW-121   old one no longer signs in and the new one does; A-008), REQ-016 (switching an account off, after the
// ROW-121   confirmation, shows it off, stops its sign-in and takes its future approved days off the calendar; A-022).
// ROW-121   The row's case: the request of T4 is a vacation with a weekday before today and one from today on.
// ROW-121 wrong product: a create that ignores the allowance typed (25 for 21) or lists the account switched off; an
// ROW-121   approve or reject that acts on the click with no confirmation, or one naming another person; a decided
// ROW-121   request that stays on the pending list or never reaches the calendar; a rejection that drops the note; a
// ROW-121   cancel that cancels the whole request, or cancels from the UTC date (Mon 8: 3 days back, days left 23
// ROW-121   instead of 22), or keeps a cancel control on it; a password set that leaves the old password working; a
// ROW-121   switch-off that leaves the account able to sign in or its 22–23 March days on the calendar, or takes another
// ROW-121   person's days with it.
// ROW-121 given: allowances 25; Pia's approved vacation Thu 4 – Wed 10 March (5 counted: 4, 5, 8 before today; 9, 10
// ROW-121   from today), Pia's pending 29–31 March, Quinn's pending 22–23 March (Quinn's only request), Rua's approved
// ROW-121   Mon 22 March and pending 12–13 April (decoys that must stay untouched); the new account, Newcomer, allowance
// ROW-121   21 (distinct from the 25 default). when: the six transitions, each through its real control. then, per
// ROW-121   transition: T1 one people-page item for Newcomer's email, switched on, showing 21 at least twice and no 25;
// ROW-121   T2 the confirmation names Quinn, 22 and 23 March and approving, no one else; Quinn's item leaves the pending
// ROW-121   list while Pia's and Rua's stay; the calendar lists Quinn on exactly 22 and 23 March (none before); T3 the
// ROW-121   confirmation names Pia, 29 and 31 March and rejecting; Pia's item leaves the list, Rua's stays; Pia's page
// ROW-121   shows 29–31 March rejected with the fresh note; T4 the confirmation names Pia, the cancel from 9 March and
// ROW-121   the staying 4 March, and says what is cancelled and what stays; Pia's 4–10 March item shows approved with
// ROW-121   cancelled days from the 9th and no cancel control; Pia's 2027 days left go from 20 to 22 (not 23); the
// ROW-121   calendar lists Pia on exactly 4, 5 and 8 March; T5 the old password is refused and the new one signs in;
// ROW-121   T6 the confirmation names Quinn and 22 and 23 March; Quinn's item shows switched off with a switch-on
// ROW-121   control and no switch-off control; Quinn's sign-in is refused; Quinn leaves the calendar while Rua stays
// ROW-121   on 22 March and Pia on 4, 5 and 8.
// ROW-121 controls: before each transition its effect is absent (no Newcomer item; Quinn off the calendar and Pia's
// ROW-121   and Quinn's items on the pending list; no note on Pia's page; a cancel control on 4–10 March and 20 days
// ROW-121   left; the old password signing in; Quinn switched on and signing in); the control case shows the admin
// ROW-121   reaches the people and pending pages with the fixture listed, so the target's failures are the journey's.
// ROW-121 technique: the row's own case (a vacation across today) at an instant where the team date and the UTC
// ROW-121   date differ, so a UTC "today" is caught by the exact days-left figure; decoys for every list and the
// ROW-121   calendar (another pending person, another person's approved day on the same date); before/after for each
// ROW-121   effect; confirmation texts read for the person, the days and the effect, and for no other person.
// ROW-121   Items are found by their own first and last day drawn as dates ("4 Mar", "Mar 4", 2027-03-04, "4–10 March";
// ROW-121   never "March 10:00"), so the rejected 29–31 March item, whose Sent time holds a 10 and whose note tag may
// ROW-121   hold a lone 4, is never taken for the 4–10 March one; days and figures are read with the run-id literals
// ROW-121   (names, emails, note) and times taken out, so a fresh value never stands in for the promised one.
// ROW-121 cases: ROW-121 target=ROW-121.REQ-008.REQ-009.REQ-010.REQ-013.REQ-015.REQ-016.REQ-019.REQ-020.REQ-021.REQ-025.journey-admin-runs-the-team control=ROW-121.control.admin-reaches-people-and-pending-pages-with-the-fixture-listed
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  readBalance,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  type Actor,
  type Member,
  type Opened,
} from './harness';
import {
  awaitConfirmation,
  calendarApiDays,
  control,
  dayToken,
  expectPath,
  itemLocator,
  monthToken,
  numbersIn,
  readItems,
  recordDialogs,
  signInStatus,
  textNamesDay,
  waitItems,
  type ItemRead,
} from './journey-pages';
import { datePatterns, withoutLiterals } from './page-reading';

const ZONE = 'Pacific/Auckland';
const T_SETUP = '2027-02-28T21:00:00Z'; // Mon 2027-03-01 10:00 in Auckland; UTC still Sunday 28 February
const T_TODAY = '2027-03-08T19:00:00Z'; // Tue 2027-03-09 08:00 in Auckland; UTC still Monday 8 March

const ACROSS_TODAY = { kind: 'vacation' as const, firstDay: '2027-03-04', lastDay: '2027-03-10' }; // Thu–Wed: 4, 5, 8 | 9, 10
const TO_APPROVE = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-23' }; // Mon–Tue
const TO_REJECT = { kind: 'vacation' as const, firstDay: '2027-03-29', lastDay: '2027-03-31' }; // Mon–Wed
const DECOY_APPROVED = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-22' };
const DECOY_PENDING = { kind: 'vacation' as const, firstDay: '2027-04-12', lastDay: '2027-04-13' };
const NEW_ALLOWANCE = 21;

const CREATE = /^(create account|create|add account|add person|new account)$/i;
const APPROVE = /^approve$/i;
const REJECT = /^reject$/i;
const CANCEL = /^cancel/i;
const SET_PASSWORD = /^(set password|set new password|new password|reset password)$/i;
const SWITCH_OFF = /^switch off$/i;
const SWITCH_ON = /^switch on$/i;
const SUBMIT = /^(create account|create|add account|add|save|set password|set|reject|confirm|done)$/i;
const ON_STATE = /\b(switched on|on|active|enabled)\b/i;
const OFF_STATE = /\b(switched off|off|inactive|disabled)\b/i;

const disposables: { dispose(): Promise<void> }[] = [];
const pages: Opened[] = [];
test.afterEach(async () => {
  for (const o of pages.splice(0)) await o.close().catch(() => undefined);
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORD = '(?:st|nd|rd|th)?';
const RANGE_DASH = '\\s*(?:[-–—]|to|until|till|through)\\s*';
/** After a day number: no further digit, and no time of day (":00", " am") — so "1 March 10:00" never draws 10 March. */
const NOT_TIME = '(?!\\d)(?!\\s*(?::\\d|[ap]\\.?m\\b))';

/**
 * ROW-121: a regex source (case-insensitive) matching the day `iso` drawn AS A DATE — its day number joined to its
 * month in one English rendering (page-reading.ts datePatterns: "4 March", "Mar 4", 2027-03-04, 04/03/2027 …), or as
 * one end of a range whose month is written once ("4–10 March", "March 4–10") — never a lone number a note, a name,
 * a Sent time or a count supplies.
 */
function drawnDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const full = MONTH_NAMES[m - 1];
  const abbr = full.slice(0, 3);
  const month = `(?:${full}|${abbr === 'Sep' ? 'Sept?' : abbr}\\.?)`;
  const day = `0?${d}${ORD}`;
  const forms = [
    ...datePatterns(iso),
    `(?<!\\d)${day}${RANGE_DASH}\\d{1,2}${ORD}\\s+(?:of\\s+)?${month}(?![a-z])`,
    `(?<![a-z])${month}\\s+\\d{1,2}${ORD}${RANGE_DASH}${day}`,
  ];
  return `(?:${forms.map((f) => `(?:${f})${NOT_TIME}`).join('|')})`;
}

/** ROW-121: an item is found by its own first and last day as drawn (drawnDay), both. */
function days(spec: { firstDay: string; lastDay: string }): string[] {
  return [drawnDay(spec.firstDay), drawnDay(spec.lastDay)];
}

/** ROW-121: `text` without its times of day ("10:00", "9:05 am"), so an hour never reads as a day of the month. */
function withoutTimes(text: string): string {
  return text.replace(/(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?/gi, ' ');
}

/** ROW-121: `text` with the fixture's run-id-bearing literals (names, emails, the note) and its times removed. */
function scrub(text: string, literals: string[]): string {
  return withoutTimes(withoutLiterals(text, literals.filter((l) => l.length > 0)));
}

/** Submits the form holding `field`: its submit button, else a button named like a submit inside it, else Enter. */
async function submitFormOf(page: Page, field: Locator): Promise<void> {
  const scope = field.locator('xpath=ancestor::*[self::form or self::dialog or @role="dialog"][1]');
  if ((await scope.count()) > 0) {
    const submit = scope.locator('button[type="submit"], input[type="submit"]').filter({ visible: true });
    if ((await submit.count()) > 0) return submit.first().click();
    const named = scope.getByRole('button', { name: SUBMIT }).filter({ visible: true });
    if ((await named.count()) > 0) return named.last().click();
  }
  await field.press('Enter');
}

/** Reads the confirmation an action control opens and checks what it says; then confirms it. */
async function confirmChecked(
  page: Page,
  dialogs: string[],
  before: number,
  step: string,
  person: string,
  must: { days: string[]; effect: RegExp; also?: RegExp[] },
  others: string[],
  noise: string[] = [],
): Promise<void> {
  const shown = await awaitConfirmation(page, dialogs, before, person, `ROW-121 ${step}`);
  const t = shown.text;
  // The days are read with the names (run-id digits), the emails, the note and every time of day taken out first, so
  // a "22" inside a name or the "10" of 10:00 never stands in for a day the confirmation should name.
  const daysText = scrub(t, [person, ...others, ...noise]);
  expect.soft(t.includes(person), `ROW-121 ${step}: the confirmation names the person, ${person} (read: "${t}")`).toBe(true);
  for (const iso of must.days) expect.soft(textNamesDay(daysText, iso), `ROW-121 ${step}: the confirmation names ${iso} (read: "${t}"; days read in: "${daysText}")`).toBe(true);
  expect.soft(must.effect.test(t), `ROW-121 ${step}: the confirmation says what will change, ${must.effect} (read: "${t}")`).toBe(true);
  for (const re of must.also ?? []) expect.soft(re.test(t), `ROW-121 ${step}: the confirmation says ${re} (read: "${t}")`).toBe(true);
  for (const o of others) expect.soft(t.includes(o), `ROW-121 ${step}: the confirmation names no other person — not ${o}`).toBe(false);
  await shown.confirm();
}

async function team(): Promise<{ admin: Actor; pia: Member; quinn: Member; rua: Member; pia$: Actor }> {
  const install = await resetProduct({ now: T_SETUP, timeZone: ZONE });
  const admin = await signIn(install.admin);
  disposables.push(admin);
  const pia = await createMember(admin, { name: freshName('Pia'), allowance: 25 });
  const quinn = await createMember(admin, { name: freshName('Quinn'), allowance: 25 });
  const rua = await createMember(admin, { name: freshName('Rua'), allowance: 25 });
  const pia$ = await signInMember(pia);
  const quinn$ = await signInMember(quinn);
  const rua$ = await signInMember(rua);
  disposables.push(pia$, quinn$, rua$);
  await approve(admin, await sendRequest(pia$, ACROSS_TODAY));
  await approve(admin, await sendRequest(rua$, DECOY_APPROVED));
  await sendRequest(rua$, DECOY_PENDING);
  await sendRequest(quinn$, TO_APPROVE);
  await sendRequest(pia$, TO_REJECT);
  await setClock(T_TODAY);
  return { admin, pia, quinn, rua, pia$ };
}

test('ROW-121.control.admin-reaches-people-and-pending-pages-with-the-fixture-listed', async ({ browser }) => {
  const { admin, pia, quinn } = await team();
  const opened = await openPage(browser, admin);
  pages.push(opened);
  const page = opened.page;
  expect((await page.goto(PAGES.adminPeople))?.status(), 'ROW-121 control: the admin reaches the people page').toBe(200);
  await waitItems(page, { includes: [pia.email] }, 1, 'ROW-121 control: Pia is listed on the people page');
  expect((await page.goto(PAGES.adminPending))?.status(), 'ROW-121 control: the admin reaches the pending requests page').toBe(200);
  await waitItems(page, { includes: [quinn.name] }, 1, 'ROW-121 control: Quinn\'s pending request is listed');
});

test('ROW-121.REQ-008.REQ-009.REQ-010.REQ-013.REQ-015.REQ-016.REQ-019.REQ-020.REQ-021.REQ-025.journey-admin-runs-the-team', async ({ browser }) => {
  const { admin, pia, quinn, rua, pia$ } = await team();
  const newcomer = { name: freshName('Newcomer'), email: freshEmail('newcomer'), password: freshPassword(), allowance: NEW_ALLOWANCE };
  const note = `Note ${freshName('clash')} — the release week`;
  const noise = [pia.email, quinn.email, rua.email, newcomer.name, newcomer.email, note];
  const opened = await openPage(browser, admin);
  pages.push(opened);
  const page = opened.page;
  const dialogs = recordDialogs(page);

  await test.step('ROW-121 T1 · admin at people page · create account control · enters name, email, first password and allowance · people page · the account listed switched on with its allowance and days left', async () => {
    expect((await page.goto(PAGES.adminPeople))?.status(), 'ROW-121 T1 setup: the people page is reached').toBe(200);
    await waitItems(page, { includes: [pia.email] }, 1, 'ROW-121 T1 setup: the people page lists the team');
    expect.soft(await readItems(page, { includes: [newcomer.email] }), 'ROW-121 T1 before: no account with the new email is listed').toHaveLength(0);

    const nameField = page.getByLabel(/^(display )?name$/i).filter({ visible: true });
    if ((await nameField.count()) === 0) await control(page, CREATE).first().click();
    await nameField.first().fill(newcomer.name);
    await page.getByLabel(/^email$/i).filter({ visible: true }).first().fill(newcomer.email);
    const passwords = page.locator('input[type="password"]').filter({ visible: true });
    expect(await passwords.count(), 'ROW-121 T1: the create form has a first-password field').toBeGreaterThan(0);
    for (let i = 0; i < (await passwords.count()); i += 1) await passwords.nth(i).fill(newcomer.password);
    const allowance = page.getByLabel(/allowance/i).filter({ visible: true });
    for (let i = 0; i < (await allowance.count()); i += 1) await allowance.nth(i).fill(String(NEW_ALLOWANCE));
    await submitFormOf(page, nameField.first());

    await expectPath(page, PAGES.adminPeople, 'ROW-121 T1: creating returns to the people page');
    const [row] = await waitItems(page, { includes: [newcomer.email] }, 1, 'ROW-121 T1: the new account is listed once');
    expect.soft(row.text.includes(newcomer.name), `ROW-121 T1: the item shows the name typed (read: "${row.text}")`).toBe(true);
    expect.soft(ON_STATE.test(row.plain) && !OFF_STATE.test(row.plain), `ROW-121 T1: the account is shown switched on (read: "${row.plain}")`).toBe(true);
    // The figures are read with the name and the email taken out: their run-id digits ("…k21…", "…25…") are no figure.
    const figures = numbersIn(scrub(row.plain, [newcomer.name, newcomer.email]), [2027, 2028]);
    expect.soft(figures.filter((n) => n === NEW_ALLOWANCE).length, `ROW-121 T1: the item shows the allowance 21 and the days left 21 (read: "${row.plain}")`).toBeGreaterThanOrEqual(2);
    expect.soft(figures.includes(25), `ROW-121 T1: the item does not show the default 25 for the 21 typed (read: "${row.plain}")`).toBe(false);
    await expect.soft(control(itemLocator(page, row), SWITCH_OFF), 'ROW-121 T1: a switched-on account offers switch off').toHaveCount(1);
  });

  await test.step('ROW-121 T2 · admin at pending requests · approve control on a request, then the confirmation naming the person, the days and the effect · approves and confirms · pending requests · request gone from the list and on the calendar for its days', async () => {
    expect((await page.goto(PAGES.adminPending))?.status(), 'ROW-121 T2 setup: the pending requests page is reached').toBe(200);
    const [item] = await waitItems(page, { includes: [quinn.name] }, 1, 'ROW-121 T2 before: Quinn\'s request is on the pending list');
    expect.soft(await calendarApiDays(admin, 2027, 3, quinn), 'ROW-121 T2 before: Quinn is on no day of the calendar while pending').toEqual([]);

    const before = dialogs.length;
    await control(itemLocator(page, item), APPROVE).first().click();
    await confirmChecked(page, dialogs, before, 'T2', quinn.name, { days: [TO_APPROVE.firstDay, TO_APPROVE.lastDay], effect: /approv/i }, [pia.name, rua.name], noise);

    await expectPath(page, PAGES.adminPending, 'ROW-121 T2: approving returns to the pending requests page');
    await waitItems(page, { includes: [quinn.name] }, 0, 'ROW-121 T2: Quinn\'s request is gone from the pending list');
    expect.soft(await readItems(page, { includes: [pia.name], patterns: days(TO_REJECT) }), 'ROW-121 T2: Pia\'s pending request stays listed').toHaveLength(1);
    expect.soft(await readItems(page, { includes: [rua.name] }), 'ROW-121 T2: Rua\'s pending request stays listed').toHaveLength(1);
    expect.soft(await calendarApiDays(admin, 2027, 3, quinn), 'ROW-121 T2: the calendar lists Quinn on exactly 22 and 23 March').toEqual([22, 23]);
    expect.soft(await calendarApiDays(admin, 2027, 3, rua), 'ROW-121 T2: Rua stays on 22 March').toEqual([22]);
  });

  await test.step('ROW-121 T3 · admin at pending requests · reject control with a note, then the confirmation · rejects and confirms · pending requests · request gone; the person\'s page shows it rejected with the note', async () => {
    const [item] = await waitItems(page, { includes: [pia.name] }, 1, 'ROW-121 T3 before: Pia\'s request is on the pending list');
    const scope = itemLocator(page, item);
    const noteBox = (s: Page | Locator) => s.getByRole('textbox', { name: /note|reason/i }).filter({ visible: true });
    let noted = false;
    if ((await noteBox(scope).count()) > 0) {
      await noteBox(scope).first().fill(note);
      noted = true;
    }
    const before = dialogs.length;
    await control(scope, REJECT).first().click();
    if (!noted) {
      await expect(noteBox(page).first(), 'ROW-121 T3: the reject control offers a note field (labelled Note or Reason)').toBeVisible({ timeout: 10_000 });
      await noteBox(page).first().fill(note);
      const confirmNow = page.getByRole('button', { name: /^(confirm|yes)\b/i }).filter({ visible: true });
      if ((await confirmNow.count()) === 0) await submitFormOf(page, noteBox(page).first());
    }
    await confirmChecked(page, dialogs, before, 'T3', pia.name, { days: [TO_REJECT.firstDay, TO_REJECT.lastDay], effect: /reject/i }, [quinn.name, rua.name], noise);

    await expectPath(page, PAGES.adminPending, 'ROW-121 T3: rejecting returns to the pending requests page');
    await waitItems(page, { includes: [pia.name] }, 0, 'ROW-121 T3: Pia\'s request is gone from the pending list');
    expect.soft(await readItems(page, { includes: [rua.name] }), 'ROW-121 T3: Rua\'s pending request stays listed').toHaveLength(1);

    expect((await page.goto(PAGES.adminPerson(pia.id)))?.status(), 'ROW-121 T3: Pia\'s requests page is reached').toBe(200);
    const [rejected] = await waitItems(page, { patterns: days(TO_REJECT) }, 1, 'ROW-121 T3: Pia\'s page lists the 29–31 March request');
    expect.soft(/\brejected\b/i.test(rejected.plain), `ROW-121 T3: Pia's page shows it rejected (read: "${rejected.plain}")`).toBe(true);
    expect.soft(rejected.text.includes(note), `ROW-121 T3: Pia's page shows the note "${note}" on it (read: "${rejected.text}")`).toBe(true);
  });

  await test.step('ROW-121 T4 · admin at a person\'s requests page · cancel control on an approved request running across today, then the confirmation saying which days are cancelled and which stay · cancels and confirms · that page · the request shown approved up to the day before with the later days cancelled, days left restored by the cancelled days', async () => {
    const piaPage = PAGES.adminPerson(pia.id);
    await expectPath(page, piaPage, 'ROW-121 T4 setup: the admin is at Pia\'s requests page');
    const across = { patterns: days(ACROSS_TODAY) };
    const [item] = await waitItems(page, across, 1, 'ROW-121 T4 before: the 4–10 March request is listed');
    expect.soft(/\bapproved\b/i.test(item.plain) && !/cancel/i.test(item.plain), `ROW-121 T4 before: it is approved, nothing cancelled (read: "${item.plain}")`).toBe(true);
    expect.soft(((await readBalance(pia$)).years.find((y) => y.year === 2027) ?? { daysLeft: NaN }).daysLeft, 'ROW-121 T4 before: Pia has 20 days left in 2027').toBe(20);
    const [rejectedItem] = await readItems(page, { patterns: days(TO_REJECT) });
    if (rejectedItem) await expect.soft(control(itemLocator(page, rejectedItem), CANCEL), 'ROW-121 T4: the rejected request offers no cancel').toHaveCount(0);
    const cancel = control(itemLocator(page, item), CANCEL);
    await expect(cancel, 'ROW-121 T4: the approved request with days from today on offers one cancel control').toHaveCount(1);

    const before = dialogs.length;
    await cancel.click();
    await confirmChecked(
      page,
      dialogs,
      before,
      'T4',
      pia.name,
      { days: ['2027-03-09', '2027-03-04'], effect: /cancel/i, also: [/\b(stay|stays|remain|remains|kept|keep|keeps|unchanged)\b/i] },
      [quinn.name, rua.name],
      noise,
    );

    await expectPath(page, piaPage, 'ROW-121 T4: cancelling stays on Pia\'s requests page');
    let now: ItemRead[] = [];
    await expect
      .poll(
        async () => {
          now = await readItems(page, across);
          return now.length === 1 && /cancel/i.test(now[0].plain);
        },
        { message: 'ROW-121 T4: the 4–10 March request shows cancelled days', timeout: 10_000 },
      )
      .toBe(true)
      .catch(() => undefined);
    const after = now[0] ?? { plain: '', text: '', index: -1 };
    expect.soft(/\bapproved\b/i.test(after.plain), `ROW-121 T4: the request stays approved (read: "${after.plain}")`).toBe(true);
    expect.soft(/cancel/i.test(after.plain), `ROW-121 T4: its later days are shown cancelled (read: "${after.plain}")`).toBe(true);
    // The cancel day is read with every time of day and the fixture's names taken out, so "09:00" never reads as 9 March.
    const cancelText = scrub(after.plain, [pia.name, pia.email, note]);
    expect.soft(new RegExp(dayToken(9)).test(cancelText) && new RegExp(monthToken(3), 'i').test(cancelText), `ROW-121 T4: it shows the cancel from 9 March, today in the team zone (read: "${after.plain}")`).toBe(true);
    if (after.index >= 0) await expect.soft(control(itemLocator(page, after), CANCEL), 'ROW-121 T4: no cancel control is left on it (no weekday from today on)').toHaveCount(0);
    const left = ((await readBalance(pia$)).years.find((y) => y.year === 2027) ?? { daysLeft: NaN }).daysLeft;
    expect.soft(left, 'ROW-121 T4: Pia\'s 2027 days left are restored by the 2 cancelled days, 20 → 22 (23 would cancel from the UTC date)').toBe(22);
    expect.soft(await calendarApiDays(admin, 2027, 3, pia), 'ROW-121 T4: the calendar keeps Pia on exactly 4, 5 and 8 March').toEqual([4, 5, 8]);
  });

  await test.step('ROW-121 T5 · admin at people page · set password control · sets a new password · people page · the old password no longer signs in and the new one does', async () => {
    const next = freshPassword();
    expect((await page.goto(PAGES.adminPeople))?.status(), 'ROW-121 T5 setup: the people page is reached').toBe(200);
    expect.soft(await signInStatus(newcomer.email, newcomer.password), 'ROW-121 T5 before: the first password signs in').toBeLessThan(300);
    const [row] = await waitItems(page, { includes: [newcomer.email] }, 1, 'ROW-121 T5: the new account is listed');
    // Password fields already on the page (a create form, say) are marked, so only the ones the control shows are filled.
    await page.locator('input[type="password"]').evaluateAll((els) => els.forEach((e) => e.setAttribute('data-journey-seen', '1')));
    await control(itemLocator(page, row), SET_PASSWORD).first().click();
    const fields = page.locator('input[type="password"]:not([data-journey-seen])').filter({ visible: true });
    await expect(fields.first(), 'ROW-121 T5: the set password control shows a password field').toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < (await fields.count()); i += 1) await fields.nth(i).fill(next);
    await submitFormOf(page, fields.last());

    await expectPath(page, PAGES.adminPeople, 'ROW-121 T5: setting the password returns to the people page');
    let old = 0;
    await expect
      .poll(async () => (old = await signInStatus(newcomer.email, newcomer.password)) >= 400, { timeout: 10_000 })
      .toBe(true)
      .catch(() => undefined);
    expect.soft(old, 'ROW-121 T5: the old password no longer signs in').toBeGreaterThanOrEqual(400);
    expect.soft(await signInStatus(newcomer.email, next), 'ROW-121 T5: the new password signs in').toBeLessThan(300);
  });

  await test.step('ROW-121 T6 · admin at people page · switch off control on an account with no past pending request, then the confirmation · switches it off and confirms · people page · the account shown switched off; it cannot sign in and its future approved days leave the calendar', async () => {
    await expectPath(page, PAGES.adminPeople, 'ROW-121 T6 setup: the admin is at the people page');
    const [row] = await waitItems(page, { includes: [quinn.email] }, 1, 'ROW-121 T6 before: Quinn is listed');
    expect.soft(ON_STATE.test(row.plain) && !OFF_STATE.test(row.plain), `ROW-121 T6 before: Quinn is shown switched on (read: "${row.plain}")`).toBe(true);
    expect.soft(await signInStatus(quinn.email, quinn.password), 'ROW-121 T6 before: Quinn signs in').toBeLessThan(300);

    const before = dialogs.length;
    await control(itemLocator(page, row), SWITCH_OFF).first().click();
    await confirmChecked(page, dialogs, before, 'T6', quinn.name, { days: [TO_APPROVE.firstDay, TO_APPROVE.lastDay], effect: /\boff\b|switch/i }, [pia.name, rua.name, newcomer.name], noise);

    await expectPath(page, PAGES.adminPeople, 'ROW-121 T6: switching off returns to the people page');
    let after: ItemRead[] = [];
    await expect
      .poll(
        async () => {
          after = await readItems(page, { includes: [quinn.email] });
          return after.length === 1 && OFF_STATE.test(after[0].plain) && !ON_STATE.test(after[0].plain);
        },
        { message: 'ROW-121 T6: Quinn is shown switched off', timeout: 10_000 },
      )
      .toBe(true)
      .catch(() => undefined);
    const q = after[0] ?? { plain: '', text: '', index: -1 };
    expect.soft(OFF_STATE.test(q.plain) && !ON_STATE.test(q.plain), `ROW-121 T6: Quinn is shown switched off (read: "${q.plain}")`).toBe(true);
    if (q.index >= 0) {
      await expect.soft(control(itemLocator(page, q), SWITCH_ON), 'ROW-121 T6: a switched-off account offers switch on').toHaveCount(1);
      await expect.soft(control(itemLocator(page, q), SWITCH_OFF), 'ROW-121 T6: a switched-off account offers no switch off').toHaveCount(0);
    }
    expect.soft(await signInStatus(quinn.email, quinn.password), 'ROW-121 T6: Quinn can no longer sign in').toBeGreaterThanOrEqual(400);
    expect.soft(await calendarApiDays(admin, 2027, 3, quinn), 'ROW-121 T6: Quinn\'s future approved days 22 and 23 March leave the calendar').toEqual([]);
    expect.soft(await calendarApiDays(admin, 2027, 3, rua), 'ROW-121 T6: Rua stays on 22 March').toEqual([22]);
    expect.soft(await calendarApiDays(admin, 2027, 3, pia), 'ROW-121 T6: Pia stays on 4, 5 and 8 March').toEqual([4, 5, 8]);
  });
});
