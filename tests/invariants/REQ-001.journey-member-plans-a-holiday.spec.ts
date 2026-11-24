// Purpose: ledger journey test for ROW-120 (REQ-001, REQ-002, REQ-005, REQ-006, REQ-007, REQ-012) — a team member signs in through the form, sends a vacation from a Thursday to the next Tuesday, cancels it, sends it again, sees it approved with who decided and when and the days left reduced, and finds their name on the calendar on each counted weekday and no weekend day — every transition operated in the browser.
// Provenance: hand-authored (test-author pass, slice 0, journeys batch test-author-9); fixture data (the team, the colleague's requests, the member's earlier sick day, the admin's approval while the member waits off screen) made through the product's public routes by harness.ts, fresh per run; the journey's own transitions are operated only through the engine door.
//
// Boundary (R6): a journey — operation and paint — so the browser, through harness.openPage; setup reaches the
// starting state through the API and never performs a transition. deployed-selector: none — docker-compose.test.yml's
// x-vid-harness declares no deployed-selector:, and this journey is no (process) journey, so it runs in the one pass.
//
// The controls this file operates, by accessible name (D-029: forms labelled in plain words; the row's own words):
//   sign-in form: field "Email", field "Password", button "Sign in" (D-029);
//   "send a request link": link or button /^(send a request|send request|new request|request time off)$/i;
//   send form: a radio "Vacation" or a field labelled "Kind" offering Vacation; fields "First day", "Last day";
//     button /^(send|send request|send a request|submit)$/i;
//   "cancel control": a button or link /^cancel/i inside the request's item (a product confirmation, native or a
//     Confirm/Yes button, is accepted);
//   "team calendar link": link or button /^(team calendar|calendar)$/i.
// Pages (D-029): the member's requests page is "/", the send form "/requests/new", the calendar "/calendar".
// How items, a year's figures and calendar day cells are read: journey-pages.ts's header.
//
// The team clock (BASELINE "Test environment"): the zone is Pacific/Auckland (NZDT, UTC+13 in March 2027). The
// journey runs at Tue 2027-03-09 08:00 there (UTC still Monday 8 March); the approval is made at Wed 2027-03-10
// 13:30 there, 00:30 UTC, one date in both zones, so "when" it was decided reads 10 March whichever zone renders it.
//
// ROW-120 promise: the row's transitions, from REQ-001 (only Monday to Friday days count; a new request starts
// ROW-120   pending; A-017), REQ-002/A-002 (pending vacation days count against a new request and are shown beside
// ROW-120   the days left), REQ-005 (a person cancels their own pending request with no weekday before today; its days
// ROW-120   stop counting), REQ-006 (the own page lists every own request with kind, days, count, state, who decided
// ROW-120   and when; no other person's), REQ-007/A-027 (days left this year and next = allowance minus approved
// ROW-120   vacation, pending shown beside, not subtracted), REQ-012 (the calendar lists by name the people with an
// ROW-120   approved request on each Monday to Friday day, nothing pending, no weekend). The row's case: Thursday
// ROW-120   2027-03-11 to Tuesday 2027-03-16 counts 4, and the calendar is empty on Saturday 13 and Sunday 14.
// ROW-120 wrong product: one that counts every calendar day in the range (6, and the name on Saturday and Sunday);
// ROW-120   one that subtracts pending days from the days-left figure (19 shown while pending); one whose cancel leaves
// ROW-120   the 4 days pending or keeps the request pending; one that never reduces days left on approval, or shows
// ROW-120   "approved" without the admin's name or the decision date; one whose calendar shows pending requests (the
// ROW-120   colleague's 22–23 March) or shifts days by the UTC date.
// ROW-120 given: a member with allowances 23 (2027) and 17 (2028) — distinct figures — who has an approved sick day on
// ROW-120   Mon 2027-02-15 (never counted against the allowance); a colleague with an approved vacation Wed 10 – Fri 12
// ROW-120   March and a pending one 22–23 March (decoys: the colleague's names must sit on 10, 11, 12 only and never on
// ROW-120   the member's page). when: the six transitions, each through its real control. then, per transition:
// ROW-120   T1 the requests page "/" lists the sick day as approved, no vacation, 2027 shows 23 left and 0 pending,
// ROW-120   2028 17 and 0; T2 one vacation item naming 11 and 16 March, pending, counting 4 and not 6, 2027 shows 23
// ROW-120   left (not 19) with 4 pending; T3 that item cancelled, not pending, no cancel control left, 2027 23 and 0;
// ROW-120   T4 a second vacation item pending with 4, the first still cancelled, 2027 23 and 4; T5 after the admin's
// ROW-120   approval and a reload, that item approved with the admin's name and 10 March, 2027 19 left (not 23) and 0
// ROW-120   pending, 2028 still 17; T6 the calendar shows March 2027 and lists the member on exactly 11, 12, 15 and 16
// ROW-120   and the colleague on exactly 10, 11 and 12; the cells of 13 and 14, when drawn, name nobody.
// ROW-120 controls: before T1 the browser has no session and the page does not show the member's name; before T2
// ROW-120   no vacation item exists; the control case signs the member in through the harness's page door and
// ROW-120   reaches "/" with a 200, so the target's failures are about the journey's effects, not an unreachable app.
// ROW-120 technique: the row's own example (Thu–Tue across a weekend, 4 counted), distinct allowances so each
// ROW-120   year's figure is unambiguous, near-miss values asserted absent (6 days, 19 left while pending, 23 left after
// ROW-120   approval), a colleague's approved and pending decoys, and a set equality over the calendar's day cells.
// ROW-120 cases: ROW-120 target=ROW-120.REQ-001.REQ-002.REQ-005.REQ-006.REQ-007.REQ-012.journey-member-plans-a-holiday control=ROW-120.control.member-signs-in-through-the-page-door-and-reaches-own-requests
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  setAllowance,
  setClock,
  sendRequest,
  signIn,
  signInMember,
  signInThroughPage,
  type Actor,
  type Opened,
} from './harness';
import {
  CONFIRM_NAME,
  control,
  expectPath,
  hasNumber,
  itemLocator,
  monthToken,
  namesDay,
  pendingRequestId,
  readCalendar,
  readItems,
  recordDialogs,
  textNamesDay,
  waitItems,
  yearFigures,
  type ItemRead,
} from './journey-pages';

const ZONE = 'Pacific/Auckland';
const T_START = '2027-03-08T19:00:00Z'; // Tue 2027-03-09 08:00 in Auckland; UTC still Monday 8 March
const T_DECIDED = '2027-03-10T00:30:00Z'; // Wed 2027-03-10 13:30 in Auckland, 10 March in UTC too
const DECIDED_DAY = '2027-03-10';
const FIRST = '2027-03-11'; // Thursday
const LAST = '2027-03-16'; // the next Tuesday
const COUNTED = [11, 12, 15, 16]; // Thu, Fri, Mon, Tue; Sat 13 and Sun 14 not counted
const ALLOW_THIS = 23;
const ALLOW_NEXT = 17;
const SICK_DAY = '2027-02-15'; // a Monday, already past: sick may cover past days (A-004)
const COLLEAGUE_APPROVED = { kind: 'vacation' as const, firstDay: '2027-03-10', lastDay: '2027-03-12' };
const COLLEAGUE_PENDING = { kind: 'vacation' as const, firstDay: '2027-03-22', lastDay: '2027-03-23' };

const SEND_LINK = /^(send a request|send request|new request|request time off)$/i;
const SEND_BUTTON = /^(send|send request|send a request|submit)$/i;
const CANCEL = /^cancel/i;
const CALENDAR_LINK = /^(team calendar|calendar)$/i;
const PENDING = /\bpending\b/i;
const CANCELLED = /\bcancell?ed\b/i;
const APPROVED = /\bapproved\b/i;

/** The member's vacation items: vacation, naming 11 and 16 March. */
const VACATION_ITEMS = { patterns: ['vacation', ...namesDay(FIRST), ...namesDay(LAST)] };

const disposables: { dispose(): Promise<void> }[] = [];
const pages: Opened[] = [];
test.afterEach(async () => {
  for (const o of pages.splice(0)) await o.close().catch(() => undefined);
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

/** Asserts a year's figures on the page: its days left and pending figures present, near misses absent. */
async function expectYear(page: Page, year: number, other: number, left: number, pending: number, notLeft: number[], step: string): Promise<void> {
  let seg: string | null = null;
  await expect
    .poll(
      async () => {
        seg = await yearFigures(page, year, other);
        return seg !== null && hasNumber(seg, left) && hasNumber(seg, pending) && notLeft.every((n) => !hasNumber(seg as string, n));
      },
      { timeout: 10_000 },
    )
    .toBe(true)
    .catch(() => undefined);
  const text = seg ?? '';
  expect.soft(seg, `ROW-120 ${step}: the page shows ${year}'s days left, labelled with the year`).not.toBeNull();
  expect.soft(hasNumber(text, left), `ROW-120 ${step}: ${year} shows ${left} days left (read: "${text}")`).toBe(true);
  expect.soft(PENDING.test(text), `ROW-120 ${step}: ${year}'s pending days are shown beside its days left (read: "${text}")`).toBe(true);
  expect.soft(hasNumber(text, pending), `ROW-120 ${step}: ${year} shows ${pending} pending days (read: "${text}")`).toBe(true);
  for (const n of notLeft) expect.soft(hasNumber(text, n), `ROW-120 ${step}: ${year} does not show ${n} (read: "${text}")`).toBe(false);
}

/** Operates the send a request link and the send form: Vacation, 11 to 16 March, Send (the transition's real controls). */
async function sendVacationThroughForm(page: Page, step: string): Promise<void> {
  await control(page, SEND_LINK).first().click();
  await expectPath(page, PAGES.newRequest, `ROW-120 ${step}: the send a request link opens the send form`);
  const radio = page.getByRole('radio', { name: /^vacation$/i });
  if ((await radio.count()) > 0) {
    await radio.first().check();
  } else {
    const kind = page.getByLabel(/^kind$/i);
    const label = await kind
      .locator('option')
      .evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.label || o.textContent || '').find((t) => /vacation/i.test(t)) ?? null);
    expect(label, `ROW-120 ${step}: the send form offers the kind Vacation (a radio "Vacation" or a field "Kind")`).not.toBeNull();
    await kind.selectOption({ label: label as string });
  }
  await page.getByLabel(/^first day$/i).fill(FIRST);
  await page.getByLabel(/^last day$/i).fill(LAST);
  await page.getByRole('button', { name: SEND_BUTTON }).first().click();
}

function counts(item: ItemRead, n: number): boolean {
  return hasNumber(item.plain, n);
}

test('ROW-120.control.member-signs-in-through-the-page-door-and-reaches-own-requests', async ({ browser }) => {
  const install = await resetProduct({ now: T_START, timeZone: ZONE });
  const admin = await signIn(install.admin);
  disposables.push(admin);
  const member = await createMember(admin, { name: freshName('Mere'), allowance: ALLOW_THIS });
  const opened = await openPage(browser, 'anonymous');
  pages.push(opened);
  const me = await signInThroughPage(opened.page, member);
  expect(String(me.id), 'ROW-120 control: the page door signs the member in').toBe(String(member.id));
  const res = await opened.page.goto(PAGES.home);
  expect(res?.status(), 'ROW-120 control: the member reaches their requests page').toBe(200);
});

test('ROW-120.REQ-001.REQ-002.REQ-005.REQ-006.REQ-007.REQ-012.journey-member-plans-a-holiday', async ({ browser }) => {
  // Setup: the team, through the public routes; no transition of this journey is performed here.
  const install = await resetProduct({ now: T_START, timeZone: ZONE });
  const admin: Actor = await signIn(install.admin);
  disposables.push(admin);
  const member = await createMember(admin, { name: freshName('Mere'), allowance: ALLOW_THIS });
  await setAllowance(admin, member.id, ALLOW_NEXT, { startsNextYear: true });
  const colleague = await createMember(admin, { name: freshName('Colleague'), allowance: 25 });
  const col = await signInMember(colleague);
  disposables.push(col);
  await approve(admin, await sendRequest(col, COLLEAGUE_APPROVED));
  await sendRequest(col, COLLEAGUE_PENDING);
  const own = await signInMember(member);
  disposables.push(own);
  await approve(admin, await sendRequest(own, { kind: 'sick', firstDay: SICK_DAY, lastDay: SICK_DAY }));

  const opened = await openPage(browser, 'anonymous');
  pages.push(opened);
  const page = opened.page;
  recordDialogs(page); // a product's own native confirm on the member's cancel is accepted

  await test.step('ROW-120 T1 · member at signed out · sign-in form · signs in with email and password · my requests page · own requests and days left for this year and next shown', async () => {
    const before = await page.goto(PAGES.signIn);
    expect(before?.status(), 'ROW-120 T1 setup: the sign-in page is reached').toBe(200);
    expect((await page.request.get('/api/me')).status(), 'ROW-120 T1 before: the browser has no session').not.toBe(200);
    await expect(page.locator('body'), 'ROW-120 T1 before: the member\'s name is not shown signed out').not.toContainText(member.name);

    await page.getByLabel('Email', { exact: true }).fill(member.email);
    await page.getByLabel('Password', { exact: true }).fill(member.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expectPath(page, PAGES.home, 'ROW-120 T1: signing in lands on the member\'s requests page');
    const sick = await waitItems(page, { patterns: ['sick', ...namesDay(SICK_DAY)] }, 1, 'ROW-120 T1: the member\'s own sick day is listed');
    expect.soft(APPROVED.test(sick[0].plain), `ROW-120 T1: the sick day is shown approved (read: "${sick[0].plain}")`).toBe(true);
    expect.soft(await readItems(page, VACATION_ITEMS), 'ROW-120 T1 before T2: no vacation of 11–16 March is listed yet').toHaveLength(0);
    await expectYear(page, 2027, 2028, ALLOW_THIS, 0, [], 'T1');
    await expectYear(page, 2028, 2027, ALLOW_NEXT, 0, [], 'T1');
    await expect.soft(page.locator('body'), 'ROW-120 T1: no other person\'s request is on the member\'s page').not.toContainText(colleague.name);
  });

  await test.step('ROW-120 T2 · member at my requests · send a request link · submits vacation from a first to a last weekday within days left · my requests page · the request listed pending with its counted days and pending days shown beside days left', async () => {
    await sendVacationThroughForm(page, 'T2');

    await expectPath(page, PAGES.home, 'ROW-120 T2: sending returns to the member\'s requests page');
    const items = await waitItems(page, VACATION_ITEMS, 1, 'ROW-120 T2: the vacation of 11–16 March is listed once');
    const item = items[0];
    expect.soft(PENDING.test(item.plain), `ROW-120 T2: the request is shown pending (read: "${item.plain}")`).toBe(true);
    expect.soft(counts(item, 4), `ROW-120 T2: the request shows its 4 counted days (read: "${item.plain}")`).toBe(true);
    expect.soft(counts(item, 6), `ROW-120 T2: the weekend is not counted — not 6 days (read: "${item.plain}")`).toBe(false);
    await expectYear(page, 2027, 2028, ALLOW_THIS, 4, [ALLOW_THIS - 4], 'T2');
    await expectYear(page, 2028, 2027, ALLOW_NEXT, 0, [], 'T2');
  });

  await test.step('ROW-120 T3 · member at my requests · cancel control on the pending request · cancels it · my requests page · request shown cancelled and pending days back to zero', async () => {
    const [pending] = await waitItems(page, VACATION_ITEMS, 1, 'ROW-120 T3 before: the pending request is listed');
    const cancel = control(itemLocator(page, pending), CANCEL);
    await expect(cancel, 'ROW-120 T3: the pending request carries one cancel control').toHaveCount(1);
    await cancel.click();
    let confirmed = false;
    let now: ItemRead[] = [];
    await expect
      .poll(
        async () => {
          const confirm = page.getByRole('button', { name: CONFIRM_NAME }).filter({ visible: true });
          if (!confirmed && (await confirm.count()) > 0) {
            confirmed = true;
            await confirm.first().click();
          }
          now = await readItems(page, VACATION_ITEMS);
          return now.length === 1 && CANCELLED.test(now[0].plain);
        },
        { message: 'ROW-120 T3: the request is shown cancelled', timeout: 15_000 },
      )
      .toBe(true)
      .catch(() => undefined);
    await expectPath(page, PAGES.home, 'ROW-120 T3: cancelling stays on the member\'s requests page');
    expect.soft(now, 'ROW-120 T3: the cancelled request is still listed, once').toHaveLength(1);
    const item = now[0] ?? { plain: '', text: '', index: -1 };
    expect.soft(CANCELLED.test(item.plain), `ROW-120 T3: the request is shown cancelled (read: "${item.plain}")`).toBe(true);
    expect.soft(PENDING.test(item.plain), `ROW-120 T3: the request is no longer shown pending (read: "${item.plain}")`).toBe(false);
    if (item.index >= 0) await expect.soft(control(itemLocator(page, item), CANCEL), 'ROW-120 T3: a cancelled request has no cancel control').toHaveCount(0);
    await expectYear(page, 2027, 2028, ALLOW_THIS, 0, [ALLOW_THIS - 4], 'T3');
  });

  await test.step('ROW-120 T4 · member at my requests · send a request link · submits it again · my requests page · request listed pending', async () => {
    await sendVacationThroughForm(page, 'T4');

    await expectPath(page, PAGES.home, 'ROW-120 T4: sending returns to the member\'s requests page');
    const items = await waitItems(page, VACATION_ITEMS, 2, 'ROW-120 T4: both vacations of 11–16 March are listed');
    const pendingOnes = items.filter((i) => PENDING.test(i.plain) && !CANCELLED.test(i.plain));
    const cancelledOnes = items.filter((i) => CANCELLED.test(i.plain));
    expect.soft(pendingOnes, 'ROW-120 T4: exactly one of them is pending — the new one').toHaveLength(1);
    expect.soft(cancelledOnes, 'ROW-120 T4: the first stays cancelled').toHaveLength(1);
    if (pendingOnes[0]) expect.soft(counts(pendingOnes[0], 4), `ROW-120 T4: the new request counts 4 days (read: "${pendingOnes[0].plain}")`).toBe(true);
    await expectYear(page, 2027, 2028, ALLOW_THIS, 4, [ALLOW_THIS - 4], 'T4');
  });

  await test.step('ROW-120 T5 · member at my requests after the admin approved it · reloads · my requests page · request shown approved with who decided and when, days left reduced by its counted days', async () => {
    // Off screen: the admin decides, at a later instant (setup through the API; not a transition of this journey).
    await setClock(T_DECIDED);
    await approve(admin, await pendingRequestId(admin, FIRST));

    await page.reload();
    await expectPath(page, PAGES.home, 'ROW-120 T5: the reload stays on the member\'s requests page');
    let items: ItemRead[] = [];
    await expect
      .poll(
        async () => {
          items = await readItems(page, VACATION_ITEMS);
          return items.filter((i) => APPROVED.test(i.plain)).length;
        },
        { message: 'ROW-120 T5: one vacation of 11–16 March is shown approved', timeout: 10_000 },
      )
      .toBe(1)
      .catch(() => undefined);
    const approved = items.filter((i) => APPROVED.test(i.plain));
    expect.soft(approved, 'ROW-120 T5: exactly one vacation of 11–16 March is shown approved').toHaveLength(1);
    const a = approved[0] ?? { plain: '', text: '', index: -1 };
    expect.soft(a.text.includes(install.admin.name), `ROW-120 T5: the approved request shows who decided it, ${install.admin.name} (read: "${a.text}")`).toBe(true);
    expect.soft(textNamesDay(a.text, DECIDED_DAY), `ROW-120 T5: the approved request shows when it was decided, 10 March (read: "${a.text}")`).toBe(true);
    expect.soft(PENDING.test(a.plain), `ROW-120 T5: the approved request is no longer shown pending (read: "${a.plain}")`).toBe(false);
    expect.soft(items.filter((i) => CANCELLED.test(i.plain)), 'ROW-120 T5: the first request stays cancelled').toHaveLength(1);
    await expectYear(page, 2027, 2028, ALLOW_THIS - 4, 0, [ALLOW_THIS], 'T5');
    await expectYear(page, 2028, 2027, ALLOW_NEXT, 0, [ALLOW_NEXT - 4], 'T5');
  });

  await test.step('ROW-120 T6 · member at my requests · team calendar link · opens the month of the request · calendar · own name listed as away on each counted weekday and on no weekend day', async () => {
    await control(page, CALENDAR_LINK).first().click();
    await expectPath(page, PAGES.calendar, 'ROW-120 T6: the team calendar link opens the calendar');
    await expect(page.locator('body'), 'ROW-120 T6: the calendar shows March 2027, the month of the request').toContainText(new RegExp(`${monthToken(3)}[^0-9]{0,12}2027|2027-03`, 'i'));
    let read = { daysOf: {} as Record<string, number[]>, cells: {} as Record<number, string> };
    await expect
      .poll(
        async () => {
          read = await readCalendar(page, '2027-03', [member.name, colleague.name]);
          return read.daysOf[member.name];
        },
        { message: 'ROW-120 T6: the member is listed on exactly the counted weekdays 11, 12, 15 and 16 March', timeout: 10_000 },
      )
      .toEqual(COUNTED)
      .catch(() => undefined);
    expect.soft(read.daysOf[member.name], `ROW-120 T6: the member is listed as away on exactly 11, 12, 15 and 16 March (cells: ${JSON.stringify(read.cells)})`).toEqual(COUNTED);
    expect.soft(read.daysOf[colleague.name], 'ROW-120 T6: the colleague is listed on exactly their approved 10, 11 and 12 March — nothing pending').toEqual([10, 11, 12]);
    for (const day of [13, 14]) {
      const cell = read.cells[day] ?? '';
      expect.soft(cell.includes(member.name) || cell.includes(colleague.name), `ROW-120 T6: ${day} March (a weekend day) lists nobody as away (cell: "${cell}")`).toBe(false);
    }
  });
});
