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
// Slice 1, brief test-author-24: a ROW-098 case and a ROW-099 case added after each row's first — ROW-098 reads
// both years' figures and the switched-on state on the drawn people page row itself (lesson L-1), each figure in a
// cell whose column names its year and what it is; ROW-099 presses each of the six actions' controls on the page,
// operates the step each opens, and reads its effect back on that account and no other. Every earlier assertion kept.
import { test, expect, type Locator, type Page } from '@playwright/test';
import { actionControl, freshInt, openConfirmation } from './admin-kit';
import { hasNumber, withoutLiterals } from './page-reading';
import { pollUntil } from './page-rows';
import { canSignIn } from './team-calendar';
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
// ROW-098, the drawn row (added by test-author pass, slice 1, brief test-author-24).
// ROW-098 promise: REQ-020 fail-if (2) "a listed account lacks its name, email, switched-on state, either year's
// ROW-098   allowance or either year's days left" — an account AS THE PAGE LISTS IT (REQ-020 "a people page listing
// ROW-098   every account with its name, email, whether it is switched on, its allowance for the current and the next
// ROW-098   year and its days left for the current and the next year"; A-031, A-043); lesson L-1.
// ROW-098 wrong product: a people page whose data carries both years but whose table draws the current year only (no
// ROW-098   next-year allowance or days left), or the allowance without the days left, or draws the next year's figures
// ROW-098   under the current year's column, or leaves the switched-on state to the label of a Switch off button.
// ROW-098 given: Mona, switched on, allowance 37 for 2027 and 41 from 2028, 3 days approved in 2027 and 2 in 2028
// ROW-098   (days left 34 and 39); Otto, switched off, allowance 23 (days left 23). when: the admin opens /admin/people.
// ROW-098   then: Mona's drawn row (the largest element holding her email and no other account's) shows her name, her
// ROW-098   email, and 37, 41, 34 and 39 as numbers of their own; each of the four is in a cell whose column label (its
// ROW-098   table header, its own label) or own text names the figure (allowance / days left) and its year (2027 or
// ROW-098   "this year" / 2028 or "next year"), never the other year; outside its controls Mona's row says switched on
// ROW-098   (or carries a checked switch) and Otto's says switched off (or an unchecked one), never the other.
// ROW-098 controls: the control case above (Mona's record in the data holds her name); here the page is reached
// ROW-098   (200) and both rows are drawn, so a missing figure is the drawing, never a missing row.
// ROW-098 technique: unusual, distinct values per field (no id, date or count equals any), read on the row's own
// ROW-098   cells with the run-id digits of name and email removed; the column association so a swapped year fails.
// ROW-098 cases: ROW-098 target=ROW-098.REQ-020.the-drawn-row-shows-both-years-figures-and-the-switched-on-state control=ROW-098.control.the-people-data-holds-the-members-record

interface DrawnCell {
  label: string;
  text: string;
}

interface DrawnAccount {
  found: boolean;
  text: string;
  plain: string;
  switches: { name: string; checked: boolean }[];
  cells: DrawnCell[];
}

/**
 * The drawn row of one account on the loaded page: the largest element holding `email` and none of `others`
 * (records.ts textAbout's reading). `plain` is its text with every control taken out; `switches` its checkbox and
 * switch controls; `cells` its table cells (td, th, role cell or gridcell; else its child elements), each with its
 * column label — the text of every header cell covering its column, its own aria-label, data-label and title, and
 * its ::before content — and its own text.
 */
async function drawnAccount(page: Page, email: string, others: string[]): Promise<DrawnAccount> {
  return page.evaluate(
    ({ email, others }) => {
      const lower = email.toLowerCase();
      const otherLower = others.map((o) => o.toLowerCase()).filter((o) => o !== lower);
      let host: Element | null = null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if ((n.textContent || '').toLowerCase().includes(lower)) {
          host = n.parentElement;
          break;
        }
      }
      if (!host) return { found: false, text: '', plain: '', switches: [], cells: [] };
      let row: Element = host;
      while (row.parentElement && row.parentElement !== document.body && row.parentElement !== document.documentElement) {
        const t = (row.parentElement.textContent || '').toLowerCase();
        if (otherLower.some((o) => t.includes(o))) break;
        row = row.parentElement;
      }
      const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
      const CONTROLS = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="switch"], [role="checkbox"]';
      const plainOf = (el: Element): string => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(CONTROLS).forEach((c) => c.remove());
        document.body.appendChild(clone);
        clone.style.position = 'absolute';
        clone.style.left = '-99999px';
        const t = clone.innerText || clone.textContent || '';
        clone.remove();
        return norm(t);
      };
      const switches = Array.from(row.querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]')).map((c) => {
        const h = c as HTMLInputElement;
        const checked = h instanceof HTMLInputElement ? h.checked : c.getAttribute('aria-checked') === 'true';
        const labels = h.labels ? Array.from(h.labels).map((l) => l.textContent || '').join(' ') : '';
        return { name: norm(c.getAttribute('aria-label') || labels || c.textContent || ''), checked };
      });
      const before = (el: Element) => {
        const c = getComputedStyle(el, '::before').content;
        return c && c !== 'none' && c !== 'normal' ? c.replace(/^["']|["']$/g, '') : '';
      };
      const ownLabel = (el: Element) =>
        [el.getAttribute('aria-label'), el.getAttribute('data-label'), el.getAttribute('title'), before(el)].filter(Boolean).join(' ');
      const columnOf = (cell: HTMLTableCellElement): number => {
        let col = 0;
        const tr = cell.parentElement as HTMLTableRowElement;
        for (const c of Array.from(tr.cells)) {
          if (c === cell) return col;
          col += c.colSpan || 1;
        }
        return col;
      };
      const headerText = (cell: HTMLTableCellElement): string => {
        const table = cell.closest('table');
        if (!table) return '';
        const col = columnOf(cell);
        const headRows = Array.from(table.rows).filter(
          (r) => (r.parentElement && r.parentElement.tagName === 'THEAD') || (r.cells.length > 0 && Array.from(r.cells).every((c) => c.tagName === 'TH')),
        );
        const parts: string[] = [];
        for (const r of headRows) {
          if (r === cell.parentElement) continue;
          let at = 0;
          for (const c of Array.from(r.cells)) {
            const span = c.colSpan || 1;
            if (col >= at && col < at + span) {
              parts.push(norm(c.textContent || '') + ' ' + ownLabel(c));
              break;
            }
            at += span;
          }
        }
        return norm(parts.join(' '));
      };
      let cellEls = Array.from(row.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'));
      if (cellEls.length === 0) cellEls = Array.from(row.children);
      const cells = cellEls.map((c) => ({
        label: norm((c instanceof HTMLTableCellElement ? headerText(c) : '') + ' ' + ownLabel(c)),
        text: plainOf(c),
      }));
      return { found: true, text: norm((row as HTMLElement).innerText || ''), plain: plainOf(row), switches, cells };
    },
    { email, others },
  );
}

const ALLOWANCE_WORD = /allowance|entitle/i;
const DAYS_LEFT_WORD = /days?\s*left|left|remaining|balance/i;
const THIS_YEAR = (y: number) => new RegExp(`(?<!\\d)${y}(?!\\d)|this year|current`, 'i');
const NEXT_YEAR = (y: number) => new RegExp(`(?<!\\d)${y}(?!\\d)|next year`, 'i');

/** The part of `text` about the year `yRe`: from its mention up to the other year's (all of it when it names neither year; null when it names only the other). */
function yearPart(text: string, yRe: RegExp, otherRe: RegExp): string | null {
  const a = text.search(yRe);
  const b = text.search(otherRe);
  if (a < 0 && b < 0) return text;
  if (a < 0) return null;
  if (b < 0 || b < a) return text.slice(a);
  return text.slice(a, b);
}

/**
 * True when some cell shows `n` as the figure `what` of the year `yRe`: the figure's word in the cell's label or
 * text; the year named by the label (and not the other year) or by the cell's own text, n standing in that year's part.
 */
function figureInCell(cells: DrawnCell[], what: RegExp, yRe: RegExp, otherRe: RegExp, n: number, literals: string[]): boolean {
  return cells.some((c) => {
    const text = withoutLiterals(c.text, literals);
    if (!what.test(`${c.label} ${text}`)) return false;
    const labelYear = yRe.test(c.label) && !otherRe.test(c.label);
    const labelOther = otherRe.test(c.label) && !yRe.test(c.label);
    if (labelOther) return false;
    if (labelYear) {
      const part = yearPart(text, yRe, otherRe);
      return part !== null && hasNumber(part.replace(yRe, ' '), n);
    }
    if (!yRe.test(text)) return false;
    const part = yearPart(text, yRe, otherRe);
    return part !== null && hasNumber(part.replace(yRe, ' '), n);
  });
}

const ON_WORD = /(?<![a-z])(switched on|on|active|enabled)(?![a-z])/i;
const OFF_WORD = /(?<![a-z])(switched off|off|inactive|disabled|deactivated)(?![a-z])/i;

test('ROW-098.REQ-020.the-drawn-row-shows-both-years-figures-and-the-switched-on-state', async ({ browser }) => {
  const t = await team();
  const emails = [t.install.admin.email, t.on.email, t.off.email];
  const opened = await openPage(browser, t.admin);
  try {
    const res = await opened.page.goto(PAGES.adminPeople);
    expect(res?.status(), 'ROW-098: /admin/people is reached (setup)').toBe(200);
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    let mona: DrawnAccount = { found: false, text: '', plain: '', switches: [], cells: [] };
    await expect
      .poll(async () => (mona = await drawnAccount(opened.page, t.on.email, emails)).found && hasNumber(withoutLiterals(mona.text, [t.on.name, t.on.email]), 39), { timeout: 10_000 })
      .toBe(true)
      .catch(() => undefined);
    const otto = await drawnAccount(opened.page, t.off.email, emails);
    expect(mona.found && otto.found, 'ROW-098: both members are drawn on the page').toBe(true);

    const lits = [t.on.name, t.on.email];
    const row = withoutLiterals(mona.plain, lits);
    const m = `ROW-098: Mona's drawn row (${JSON.stringify(mona.text)}; cells ${JSON.stringify(mona.cells)})`;
    expect.soft(mona.text.includes(t.on.name), `${m} shows her name`).toBe(true);
    expect.soft(mona.text.toLowerCase().includes(t.on.email.toLowerCase()), `${m} shows her email`).toBe(true);
    for (const [n, what] of [
      [37, "the current year's allowance"],
      [41, "the next year's allowance"],
      [34, "the current year's days left"],
      [39, "the next year's days left"],
    ] as [number, string][]) {
      expect.soft(hasNumber(row, n), `${m} shows ${what} ${n}`).toBe(true);
    }
    const y0 = THIS_YEAR(2027);
    const y1 = NEXT_YEAR(2028);
    expect.soft(figureInCell(mona.cells, ALLOWANCE_WORD, y0, y1, 37, lits), `${m}: 37 is drawn as the 2027 allowance`).toBe(true);
    expect.soft(figureInCell(mona.cells, ALLOWANCE_WORD, y1, y0, 41, lits), `${m}: 41 is drawn as the 2028 allowance`).toBe(true);
    expect.soft(figureInCell(mona.cells, DAYS_LEFT_WORD, y0, y1, 34, lits), `${m}: 34 is drawn as the 2027 days left`).toBe(true);
    expect.soft(figureInCell(mona.cells, DAYS_LEFT_WORD, y1, y0, 39, lits), `${m}: 39 is drawn as the 2028 days left`).toBe(true);

    const o = `ROW-098: Otto's drawn row (${JSON.stringify(otto.text)})`;
    expect.soft(otto.text.includes(t.off.name), `${o} shows his name`).toBe(true);
    expect.soft(hasNumber(withoutLiterals(otto.plain, [t.off.name, t.off.email]), 23), `${o} shows his allowance and days left 23`).toBe(true);
    expect.soft(hasNumber(withoutLiterals(otto.plain, [t.off.name, t.off.email]), 37), `${o} does not show Mona's allowance (the right values on the right rows)`).toBe(false);

    const monaOn = (ON_WORD.test(mona.plain) && !OFF_WORD.test(mona.plain)) || (mona.switches.length > 0 && mona.switches.every((s) => s.checked));
    const ottoOff = (OFF_WORD.test(otto.plain) && !ON_WORD.test(otto.plain)) || (otto.switches.length > 0 && otto.switches.every((s) => !s.checked));
    expect.soft(monaOn, `${m} says switched on outside its controls (plain ${JSON.stringify(mona.plain)}; switches ${JSON.stringify(mona.switches)})`).toBe(true);
    expect.soft(ottoOff, `${o} says switched off outside its controls (plain ${JSON.stringify(otto.plain)}; switches ${JSON.stringify(otto.switches)})`).toBe(true);
  } finally {
    await opened.close();
  }
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
// ROW-099, each action operated (added by test-author pass, slice 1, brief test-author-24).
// ROW-099 promise: REQ-020 fail-if (3) "any of the six account actions (including changing an email) cannot be
// ROW-099   started from the page"; REQ-020 "from it the admin creates accounts, changes a name, changes an email, sets a
// ROW-099   new password, changes an allowance and switches an account off or on" (A-031, A-044, A-043); D-046 ("the
// ROW-099   people page starts its account actions (rename, change email, set password, change allowance) from each row
// ROW-099   in a dialog that posts to that account's route by id"); REQ-025 (switching off asks to confirm).
// ROW-099 wrong product: controls named for each action that open nothing, open the wrong step (the rename button
// ROW-099   opening the email field), or post to the wrong account (every row's dialog posting to the first account's
// ROW-099   id); a switch control that only toggles a label; a create button that opens a form whose submit fails.
// ROW-099 given: Mona (on, allowance 37) and Otto (off), the admin. when: on /admin/people the admin presses, in
// ROW-099   Mona's row, the control naming her name and fills the step's name field with a fresh name and submits; the
// ROW-099   control naming email, a fresh email; password, a fresh password; allowance, a fresh number (this year); the
// ROW-099   switch control, confirming the confirmation step; in Otto's row the switch control; and the page's create
// ROW-099   control, filling name, email, password and allowance with fresh values. then: each press opens a step
// ROW-099   holding a field labelled for that action (name, email, password, allowance; the switch-off a confirmation);
// ROW-099   and each effect lands on that account: the people data holds Mona's new name, then her new email and not the
// ROW-099   old, then her new allowance; Mona signs in with the new password and not the old; Mona then gives no
// ROW-099   session (off) and Otto signs in (on); the new account is in the people data with its name and signs in.
// ROW-099   Otto's and the admin's names and emails are unchanged throughout.
// ROW-099 controls: ROW-099's first control case (the page is drawn with Mona's row); here each effect is read on
// ROW-099   the people data first absent (the fresh value is not there before its action), then present.
// ROW-099 technique: before and after per action, fresh values per run, the neighbouring account (Otto, the admin)
// ROW-099   as the decoy that must stay untouched; each action's failure is caught and reported by name so one missing
// ROW-099   step never hides the next.
// ROW-099 cases: ROW-099 target=ROW-099.REQ-020.each-account-action-pressed-on-the-page-lands-on-that-account control=ROW-099.control.the-people-page-is-drawn-with-the-members-row

const STEP = 'dialog[open], [role="dialog"], [role="alertdialog"]';
const SUBMIT = /^\s*(save|rename|change|set|update|confirm|apply|ok|submit|create|add)\b/i;
const NOT_SUBMIT = /^\s*(cancel|close|back|no)\b|^×$/i;

/** The step a press opened: a visible dialog when one opened, else `fallback` (an inline form in the row or the page). */
async function stepScope(page: Page, field: RegExp, fallback: Locator): Promise<Locator> {
  const dialog = page.locator(STEP).filter({ visible: true }).filter({ has: page.getByLabel(field) }).last();
  const inline = fallback.getByLabel(field).filter({ visible: true });
  await expect
    .poll(async () => (await dialog.count()) > 0 || (await inline.count()) > 0, { timeout: 10_000 })
    .toBe(true)
    .catch(() => undefined);
  if ((await dialog.count()) > 0) return dialog;
  return fallback;
}

/** Fills the step's visible fields labelled `field` (every one: a password and its repeat) with `value`. */
async function fillField(scope: Locator, field: RegExp, value: string, what: string): Promise<void> {
  const fields = scope.getByLabel(field).filter({ visible: true });
  const n = await fields.count();
  expect(n, `ROW-099 ${what}: the step holds a field labelled ${field}`).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    const f = fields.nth(i);
    const tag = await f.evaluate((el) => el.tagName.toLowerCase());
    const type = (await f.getAttribute('type')) ?? '';
    if (tag === 'input' && !['radio', 'checkbox', 'submit', 'button', 'hidden'].includes(type)) await f.fill(value);
    else if (tag === 'textarea') await f.fill(value);
  }
}

/** Presses the step's submitting button (save, change, set, create …), else presses Enter in its first field. */
async function submitStep(scope: Locator, firstField: RegExp): Promise<void> {
  const buttons = scope.getByRole('button').filter({ visible: true });
  const n = await buttons.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    const b = buttons.nth(i);
    const name = ((await b.getAttribute('aria-label')) ?? (await b.innerText())).trim();
    if (SUBMIT.test(name) && !NOT_SUBMIT.test(name)) {
      await b.click();
      return;
    }
  }
  await scope.getByLabel(firstField).filter({ visible: true }).first().press('Enter');
}

/** Opens /admin/people and waits (bounded) until the account holding `email` is drawn. */
async function peoplePage(page: Page, email: string): Promise<void> {
  await page.goto(PAGES.adminPeople);
  await expect.poll(() => pageHolds(page, email), { timeout: 10_000 }).toBe(true).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

/** The innermost row-like element that shows `email` and none of `others` (the account's row as a locator). */
function rowOf(page: Page, email: string, others: string[]): Locator {
  let row = page.locator('tr, li, article, section, form, fieldset, div').filter({ hasText: email });
  for (const o of others) if (o.toLowerCase() !== email.toLowerCase()) row = row.filter({ hasNotText: o });
  return row.last();
}

async function attempt(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    expect.soft(`${(e as Error).message}`.split('\n').slice(0, 4).join(' | '), `ROW-099: ${what} could not be done from the page`).toBe('');
  }
}

test('ROW-099.REQ-020.each-account-action-pressed-on-the-page-lands-on-that-account', async ({ browser }) => {
  const t = await team();
  const opened = await openPage(browser, t.admin);
  const page = opened.page;
  const admin = t.install.admin;
  let monaEmail = t.on.email;
  let monaPassword = t.on.password;
  const everyone = () => [admin.email, monaEmail, t.off.email];
  const people = () => observePeople(t.admin);
  try {
    // Change a name.
    const newName = freshName('Mona');
    await attempt('changing a name', async () => {
      expect(recordByEmail(await people(), monaEmail) && holdsValue(recordByEmail(await people(), monaEmail), newName), 'ROW-099 rename: the new name is not there before').toBe(false);
      await peoplePage(page, monaEmail);
      const row = rowOf(page, monaEmail, everyone());
      await actionControl(page, monaEmail, everyone().filter((e) => e !== monaEmail), /name/i).click();
      const scope = await stepScope(page, /name/i, row);
      await fillField(scope, /name/i, newName, 'rename');
      await submitStep(scope, /name/i);
      const after = await pollUntil(people, (p) => holdsValue(recordByEmail(p, monaEmail), newName));
      expect.soft(holdsValue(recordByEmail(after, monaEmail), newName), `ROW-099 rename: Mona's record holds the new name (${show(recordByEmail(after, monaEmail))})`).toBe(true);
    });

    // Change an email.
    const newEmail = freshEmail('mona-new');
    await attempt('changing an email', async () => {
      expect(recordByEmail(await people(), newEmail), 'ROW-099 email: the new email is not there before').toBeUndefined();
      await peoplePage(page, monaEmail);
      const row = rowOf(page, monaEmail, everyone());
      await actionControl(page, monaEmail, everyone().filter((e) => e !== monaEmail), /e-?mail/i).click();
      const scope = await stepScope(page, /e-?mail/i, row);
      await fillField(scope, /e-?mail/i, newEmail, 'email');
      await submitStep(scope, /e-?mail/i);
      const after = await pollUntil(people, (p) => recordByEmail(p, newEmail) !== undefined);
      const rec = recordByEmail(after, newEmail);
      expect.soft(rec, 'ROW-099 email: an account now holds the new email').toBeDefined();
      expect.soft(rec && (holdsValue(rec, newName) || holdsValue(rec, t.on.name) || holdsValue(rec, t.on.id)), `ROW-099 email: it is Mona's account (${show(rec)})`).toBe(true);
      expect.soft(recordByEmail(after, t.on.email), "ROW-099 email: Mona's old email is gone").toBeUndefined();
      if (rec) monaEmail = newEmail;
    });

    // Set a new password.
    const newPassword = freshPassword();
    await attempt('setting a new password', async () => {
      expect(await canSignIn(monaEmail, newPassword), 'ROW-099 password: the new password does not sign in before').toBe(false);
      expect(await canSignIn(monaEmail, monaPassword), 'ROW-099 password: her current password signs her in before').toBe(true);
      await peoplePage(page, monaEmail);
      const row = rowOf(page, monaEmail, everyone());
      await actionControl(page, monaEmail, everyone().filter((e) => e !== monaEmail), /password/i).click();
      const scope = await stepScope(page, /password/i, row);
      await fillField(scope, /password/i, newPassword, 'password');
      await submitStep(scope, /password/i);
      const ok = await pollUntil(() => canSignIn(monaEmail, newPassword), (v) => v);
      expect.soft(ok, 'ROW-099 password: Mona signs in with the new password').toBe(true);
      expect.soft(await canSignIn(monaEmail, t.on.password), 'ROW-099 password: her old password no longer signs her in').toBe(false);
      if (ok) monaPassword = newPassword;
    });

    // Change an allowance (this year).
    const newAllowance = freshInt(43, 49);
    await attempt('changing an allowance', async () => {
      expect(holdsValue(recordByEmail(await people(), monaEmail), newAllowance), 'ROW-099 allowance: the new allowance is not there before').toBe(false);
      await peoplePage(page, monaEmail);
      const row = rowOf(page, monaEmail, everyone());
      await actionControl(page, monaEmail, everyone().filter((e) => e !== monaEmail), /allowance/i).click();
      const field = /allowance|days/i;
      const scope = await stepScope(page, field, row);
      const thisYear = scope.getByLabel(/this year|2027|current/i).filter({ visible: true });
      for (let i = 0; i < (await thisYear.count()); i += 1) {
        const type = (await thisYear.nth(i).getAttribute('type')) ?? '';
        if (type === 'radio' || type === 'checkbox') await thisYear.nth(i).check();
      }
      const selects = scope.locator('select').filter({ visible: true });
      for (let i = 0; i < (await selects.count()); i += 1) {
        const labels = await selects.nth(i).locator('option').allInnerTexts();
        const pick = labels.find((l) => /this year|2027|current/i.test(l));
        if (pick) await selects.nth(i).selectOption({ label: pick });
      }
      await fillField(scope, field, String(newAllowance), 'allowance');
      await submitStep(scope, field);
      const after = await pollUntil(people, (p) => holdsValue(recordByEmail(p, monaEmail), newAllowance));
      expect.soft(holdsValue(recordByEmail(after, monaEmail), newAllowance), `ROW-099 allowance: Mona's record holds the new allowance ${newAllowance} (${show(recordByEmail(after, monaEmail))})`).toBe(true);
    });

    // Switch an account off (Mona), through its confirmation.
    await attempt('switching an account off', async () => {
      expect(await canSignIn(monaEmail, monaPassword), 'ROW-099 switch off: Mona signs in before').toBe(true);
      await peoplePage(page, monaEmail);
      const control = actionControl(page, monaEmail, everyone().filter((e) => e !== monaEmail), /switch|turn\s*off|deactivat|disable|\boff\b/i);
      const conf = await openConfirmation(page, control, /switch off|turn off|deactivat|disable|confirm/i, 'ROW-099 switch off');
      await conf.confirm();
      const off = await pollUntil(() => canSignIn(monaEmail, monaPassword), (v) => !v);
      expect.soft(off, 'ROW-099 switch off: Mona gives no session afterwards').toBe(false);
    });

    // Switch an account on (Otto).
    await attempt('switching an account on', async () => {
      expect(await canSignIn(t.off.email, t.off.password), 'ROW-099 switch on: Otto gives no session before').toBe(false);
      await peoplePage(page, t.off.email);
      page.once('dialog', (d) => void d.accept());
      await actionControl(page, t.off.email, everyone().filter((e) => e !== t.off.email), /switch|turn\s*on|reactivat|activat|enable|\bon\b/i).click();
      const dialog = page.locator(STEP).filter({ visible: true }).last();
      if (await dialog.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) {
        const b = dialog.getByRole('button', { name: /^\s*(confirm|yes|ok|switch on|turn on|activate|enable)\b/i }).first();
        if ((await b.count()) > 0) await b.click();
      }
      const on = await pollUntil(() => canSignIn(t.off.email, t.off.password), (v) => v);
      expect.soft(on, 'ROW-099 switch on: Otto signs in afterwards').toBe(true);
    });

    // Create an account.
    const created = { name: freshName('Cleo'), email: freshEmail('cleo'), password: freshPassword(), allowance: freshInt(11, 19) };
    await attempt('creating an account', async () => {
      expect(recordByEmail(await people(), created.email), 'ROW-099 create: the new account is not there before').toBeUndefined();
      await peoplePage(page, monaEmail);
      const sel = 'button, a[href], [role="button"], input[type="submit"]';
      const createRe = /\b(create|add)\b|\bnew\b.*\b(account|person|member)\b/i;
      const candidates = page.locator(sel).filter({ visible: true });
      let at = -1;
      for (let i = 0; i < (await candidates.count()) && at < 0; i += 1) {
        const c = candidates.nth(i);
        const name = ((await c.getAttribute('aria-label')) ?? (await c.innerText().catch(() => '')) ?? (await c.getAttribute('value')) ?? '').trim() || ((await c.getAttribute('value')) ?? '');
        const outside = await c.evaluate((el) => !el.closest('nav, header, [role="navigation"], [role="banner"]'));
        if (outside && createRe.test(name)) at = i;
      }
      expect(at, 'ROW-099 create: the page has a create control outside its navigation').toBeGreaterThanOrEqual(0);
      const control = candidates.nth(at);
      const form = control.locator('xpath=ancestor::form[1]');
      let scope: Locator;
      if ((await form.count()) > 0 && (await form.getByLabel(/e-?mail/i).filter({ visible: true }).count()) > 0) {
        scope = form;
      } else {
        await control.click();
        scope = await stepScope(page, /e-?mail/i, page.locator('main').or(page.locator('body')).first());
      }
      await fillField(scope, /^\s*(display\s*)?name\b|full name/i, created.name, 'create (name)');
      await fillField(scope, /e-?mail/i, created.email, 'create (email)');
      await fillField(scope, /password/i, created.password, 'create (password)');
      await fillField(scope, /allowance|days/i, String(created.allowance), 'create (allowance)');
      if (scope === form) await control.click();
      else await submitStep(scope, /e-?mail/i);
      const after = await pollUntil(people, (p) => recordByEmail(p, created.email) !== undefined);
      const rec = recordByEmail(after, created.email);
      expect.soft(rec && holdsValue(rec, created.name), `ROW-099 create: the new account is listed with its name (${show(rec)})`).toBe(true);
      expect.soft(await canSignIn(created.email, created.password), 'ROW-099 create: the new account signs in with the password given').toBe(true);
    });

    // The neighbours stayed untouched.
    const finalPeople = await people();
    const ottoRec = recordByEmail(finalPeople, t.off.email);
    expect.soft(ottoRec && holdsValue(ottoRec, t.off.name), `ROW-099: Otto's name and email are unchanged (${show(ottoRec)})`).toBe(true);
    const adminRec = recordByEmail(finalPeople, admin.email);
    expect.soft(adminRec && holdsValue(adminRec, admin.name), `ROW-099: the admin's name and email are unchanged (${show(adminRec)})`).toBe(true);
    expect.soft(holdsValue(ottoRec, newAllowance), "ROW-099: Otto did not get Mona's new allowance").toBe(false);
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
