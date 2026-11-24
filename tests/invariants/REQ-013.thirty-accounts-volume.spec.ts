// Purpose: ledger tests for volume at the team's limit of 30 switched-on accounts — ROW-122 (the calendar lists all 30 names on one weekday, each inside its day cell's visible box), ROW-123 (the people page lists every account, switched-off ones included, with all its fields and actions) and ROW-124 (the pending page lists 90 pending requests, oldest sent first, with all their fields).
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create accounts, own password change, allowances, switch off, send, approve), fresh per run; the team clock is moved one minute before each send, so every request has its own send instant.
//
// The fixture (one install, shared by the three rows): the clock starts at 2027-03-01 09:00 in Pacific/Auckland
// (2027-02-28T20:00Z: the UTC date differs). The admin and 29 members are switched on (30, REQ-013's limit, A-025);
// three more accounts were created first and switched off. Account k has allowance 101+3k for 2027 and one more for
// 2028 (set to start next year, A-043); the switched-off ones 191, 194 and 197 likewise. Every switched-on account has an
// approved vacation covering Wednesday 17 March 2027 (even k: that day alone; odd k: 15–19 March, 5 days). Then each
// of the 30 sends three pending requests, round-robin (round 0 for all 30, then round 1, then round 2), each two
// weekdays long (a Friday start runs to Monday: still 2 counted days), the first day of request (i, r) being weekday
// slot 30·(2−r) + (7i mod 30) counted from Monday 5 April 2027 — so the send order is neither the first-day order nor
// its reverse, and no two of one person's days read as each other with day and month swapped. Kinds alternate.
//
// ROW-122 promise: REQ-012 ("for each Monday to Friday day it lists by name the people with an approved request
// ROW-122   covering that day") at REQ-013's limit of 30 switched-on accounts: all 30 names on the day, readable
// ROW-122   without overlap or truncation that hides a name, and the page loads without error. Case: each name lies
// ROW-122   inside its day cell's visible box.
// ROW-122 wrong product: a day cell of fixed height with overflow hidden that shows 4 names and clips 26; a "+26
// ROW-122   more" summary; names in a cell narrower than the name, cut with an ellipsis; an absolutely placed list
// ROW-122   that spills over the next week's cells and overlaps their names.
// ROW-122 given: the fixture. when: a member's browser opens /calendar (the clock's month, March 2027). then: each
// ROW-122   of the 30 fresh names is drawn exactly once in the cell of 17 March (the nearest td / gridcell / cell /
// ROW-122   [data-date], or list item / article / section naming a day of its own, that carries the date or the day
// ROW-122   number 17; read on the month /calendar opens on, today's month); every rectangle of each name's text lies inside that cell's
// ROW-122   box and inside every clipping box between them; no two names' text rectangles overlap; the page answered
// ROW-122   200 with no console error.
// ROW-122 controls: the member's GET /api/calendar for March 2027 lists the 30 names on 2027-03-17 — the data the
// ROW-122   page must draw exists.
// ROW-122 technique: geometry of the text ranges themselves (not of their boxes, which a clipped name still has),
// ROW-122   fresh names ending in a letter so no name is a prefix of another, and multi-day decoys (odd k are also
// ROW-122   away 15, 16, 18, 19 March) so a name found in another day's cell does not count.
// ROW-122 cases: ROW-122 target=ROW-122.REQ-012.thirty-names-on-one-day-each-inside-its-day-cell control=ROW-122.control.calendar-data-lists-thirty-names
//
// ROW-123 promise: REQ-020 (the people page lists every account with its name, email, whether it is switched on,
// ROW-123   its allowance for the current and the next year and its days left for both, and the six actions start
// ROW-123   from it) at REQ-013's limit, with switched-off accounts too; INV-001 for the days-left figure (allowance
// ROW-123   minus approved vacation days).
// ROW-123 wrong product: a page that lists only switched-on accounts, or only the first 25; a row showing this
// ROW-123   year's allowance for both years; days left computed with pending days subtracted; switched-off rows
// ROW-123   drawn exactly like switched-on ones.
// ROW-123 given: the fixture (33 accounts). when: the admin's browser opens /admin/people. then: each account's
// ROW-123   row (found by its fresh email) carries its name, its email, its 2027 allowance, its 2028 allowance, its
// ROW-123   2027 days left (allowance − 1 or − 5; switched off: the allowance) and its 2028 days left (the 2028
// ROW-123   allowance), shows its switched-on state (a switch's checked state, else the words on/active vs off/
// ROW-123   inactive outside its controls) equal to the fixture's, and holds at least one control; the page has
// ROW-123   controls for create, name, email, password, allowance and switching; it answered 200 with no console error.
// ROW-123 controls: GET /api/admin/people answers the admin and carries all 33 emails.
// ROW-123 technique: distinct three-digit allowances per account, so each number is that row's and no other's;
// ROW-123   names and emails stripped before numbers are read (they carry run-id digits); soft assertions per row.
// ROW-123 cases: ROW-123 target=ROW-123.REQ-020.people-page-lists-thirty-three-accounts-with-all-fields-and-actions control=ROW-123.control.people-data-carries-every-account
//
// ROW-124 promise: REQ-008 (every pending request of every person, the admin included, oldest first, each with the
// ROW-124   person's name, kind, first and last day and counted days, and for vacation that person's days left in its
// ROW-124   year) with at least 3 pending requests from each of 30 accounts. Case: requests sent in an order different
// ROW-124   from their first days' order are listed in send order.
// ROW-124 wrong product: a list sorted by first day (or by first day descending, or by name); a list cut at 50;
// ROW-124   the days left omitted when the list is long; approved requests listed with the pending ones.
// ROW-124 given: the fixture's 90 pending requests (and 30 approved ones as decoys). when: the admin's browser opens
// ROW-124   /admin/pending. then: each request's row (the person's fresh name with its first day, bounded by the
// ROW-124   other requests) is found once; the rows' document order is the send order; each row carries its kind
// ROW-124   and not the other kind, its last day, the count 2 and, for vacation, the person's 2027 days left; no
// ROW-124   approved request's days (15 or 17 March) are drawn.
// ROW-124 controls: GET /api/admin/pending answers the admin and carries every switched-on person's name.
// ROW-124 technique: a send order chosen to differ from first-day order and its reverse and from name order, the
// ROW-124   clock moved between sends so "oldest" is never a tie, and approved requests as near-miss decoys.
// ROW-124 cases: ROW-124 target=ROW-124.REQ-008.pending-page-lists-ninety-requests-in-send-order-with-all-fields control=ROW-124.control.pending-data-carries-every-person
import { test, expect } from '@playwright/test';
import {
  approve,
  createMember,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Install,
  type RequestSpec,
} from './harness';
import { datePatterns, findRows, hasDate, hasNumber, literal, withoutDates, withoutLiterals } from './page-reading';

const T0 = Date.parse('2027-02-28T20:00:00Z');
const AWAY_DAY = '2027-03-17';

interface Account {
  id: AccountId;
  name: string;
  email: string;
  password: string;
  allowance: number;
  nextAllowance: number;
  approvedDays: number;
  on: boolean;
}

interface Pending {
  key: string;
  person: Account;
  spec: RequestSpec;
}

let install: Install;
let admin: Actor;
let accounts: Account[] = []; // the 30 switched on, the admin first
let leavers: Account[] = []; // the 3 switched off
let pending: Pending[] = []; // in send order
let minute = 0;

const nameFor = () => `${freshName('Away')}q`; // a letter after the counter: no name is a prefix of another

async function tick(): Promise<void> {
  minute += 1;
  await setClock(new Date(T0 + minute * 60_000).toISOString());
}

function isoDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function slotDay(k: number): string {
  return isoDay(Date.UTC(2027, 3, 5) + (Math.floor(k / 5) * 7 + (k % 5)) * 86_400_000);
}

function nextWeekday(day: string): string {
  let t = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
  while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
  return isoDay(t);
}

test.beforeAll(async () => {
  install = await resetProduct({ now: new Date(T0).toISOString(), admin: { name: nameFor(), allowance: 101 } });
  admin = await signIn(install.admin);
  accounts.push({
    id: admin.me.id,
    name: install.admin.name,
    email: install.admin.email,
    password: install.admin.password,
    allowance: 101,
    nextAllowance: 102,
    approvedDays: 0,
    on: true,
  });

  // Three accounts made and switched off first, so 30 can be switched on afterwards.
  for (let j = 0; j < 3; j++) {
    const allowance = 191 + 3 * j;
    const m = await createMember(admin, { name: nameFor(), allowance, choosePassword: false });
    await setAllowance(admin, m.id, allowance + 1, { startsNextYear: true });
    await switchAccount(admin, m.id, false);
    leavers.push({ id: m.id, name: m.name, email: m.email, password: m.password, allowance, nextAllowance: allowance + 1, approvedDays: 0, on: false });
  }
  for (let k = 1; k < 30; k++) {
    const allowance = 101 + 3 * k;
    const m = await createMember(admin, { name: nameFor(), allowance });
    accounts.push({ id: m.id, name: m.name, email: m.email, password: m.password, allowance, nextAllowance: allowance + 1, approvedDays: 0, on: true });
  }
  await setAllowance(admin, admin.me.id, 102, { startsNextYear: true });
  for (const a of accounts.slice(1)) await setAllowance(admin, a.id, a.nextAllowance, { startsNextYear: true });

  const sessions: Actor[] = [admin];
  for (const a of accounts.slice(1)) sessions.push(await signIn({ email: a.email, password: a.password }));
  try {
    // Every switched-on account away on 17 March (approved vacation).
    for (let k = 0; k < 30; k++) {
      const spec: RequestSpec =
        k % 2 === 0 ? { kind: 'vacation', firstDay: AWAY_DAY, lastDay: AWAY_DAY } : { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' };
      await tick();
      const id = await sendRequest(sessions[k], spec);
      await approve(admin, id);
      accounts[k].approvedDays = k % 2 === 0 ? 1 : 5;
    }
    // Three pending requests from each, round-robin, one minute apart.
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 30; i++) {
        const firstDay = slotDay(30 * (2 - r) + ((7 * i) % 30));
        const spec: RequestSpec = { kind: (i + r) % 2 === 0 ? 'sick' : 'vacation', firstDay, lastDay: nextWeekday(firstDay) };
        await tick();
        await sendRequest(sessions[i], spec);
        pending.push({ key: `${i}/${r}`, person: accounts[i], spec });
      }
    }
  } finally {
    for (const s of sessions.slice(1)) await s.dispose();
  }
});

test.afterAll(async () => {
  await admin?.dispose();
});

// ------------------------------------------------------------------------------------------------ ROW-122

test('ROW-122.control.calendar-data-lists-thirty-names', async () => {
  const member = await signIn({ email: accounts[1].email, password: accounts[1].password });
  try {
    const res = await member.api.get('/api/calendar?year=2027&month=3');
    expect(res.status(), 'ROW-122 control: GET /api/calendar answers the member').toBe(200);
    const body = (await res.json()) as { days: { date: string; people: { name: string }[] }[] };
    const names = body.days.find((d) => d.date === AWAY_DAY)?.people.map((p) => p.name) ?? [];
    expect([...names].sort(), 'ROW-122 control: the 30 names are away on 2027-03-17').toEqual(accounts.map((a) => a.name).sort());
  } finally {
    await member.dispose();
  }
});

test('ROW-122.REQ-012.thirty-names-on-one-day-each-inside-its-day-cell', async ({ browser }) => {
  const member = await signIn({ email: accounts[1].email, password: accounts[1].password });
  const opened = await openPage(browser, member);
  const page = opened.page;
  try {
    const response = await page.goto(PAGES.calendar);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect.soft(response?.status(), 'ROW-122: /calendar answers 200').toBe(200);

    const names = accounts.map((a) => a.name);
    const result = await page.evaluate(
      ({ names, day, dayNumber, dateSources }) => {
        const CELL = 'td, th, [role="gridcell"], [role="cell"], [data-date]';
        const LOOSE = 'li, [role="listitem"], article, section';
        const minusNames = (el: Element): string => {
          let t = (el as HTMLElement).innerText || '';
          for (const n of names) t = t.split(n).join(' ');
          return t;
        };
        // The day cell: the nearest grid cell, or the nearest list item / article / section that names a day of its own.
        const dayCellOf = (el: Element): Element | null => {
          for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
            if (a.matches(CELL)) return a;
            if (a.matches(LOOSE) && (/(?<!\d)(?:[1-9]|[12]\d|3[01])(?!\d)/.test(minusNames(a)) || a.querySelector('[datetime], [data-date]'))) return a;
          }
          return null;
        };
        const dateRes = dateSources.map((s) => new RegExp(s, 'i'));
        const dayRe = new RegExp(`(?<!\\d)${dayNumber}(?!\\d)`);
        const isTarget = (cell: Element): boolean => {
          const carriers = [cell, ...Array.from(cell.querySelectorAll('[data-date], [datetime], [aria-label]'))];
          const attrs = carriers.flatMap((e) => [e.getAttribute('data-date'), e.getAttribute('datetime'), e.getAttribute('aria-label')]).filter(Boolean) as string[];
          if (attrs.some((a) => a.includes(day) || dateRes.some((r) => r.test(a)))) return true;
          return dayRe.test(minusNames(cell));
        };
        const cellIds = new Map<Element, number>();
        const occurrences: Record<string, { cell: number; target: boolean; problems: string[]; rects: { l: number; t: number; r: number; b: number }[] }[]> = {};
        for (const n of names) occurrences[n] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, template, noscript')) continue;
          for (const n of names) {
            const at = node.data.indexOf(n);
            if (at < 0) continue;
            const cell = dayCellOf(parent);
            if (!cell) {
              occurrences[n].push({ cell: -1, target: false, problems: ['not inside a day cell'], rects: [] });
              continue;
            }
            if (!cellIds.has(cell)) cellIds.set(cell, cellIds.size);
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + n.length);
            const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
            const problems: string[] = [];
            const style = getComputedStyle(parent);
            if (rects.length === 0) problems.push('drawn with no size');
            if (style.visibility === 'hidden' || Number(style.opacity) === 0) problems.push('hidden');
            for (let a: Element | null = parent; a; a = a.parentElement) {
              const s = getComputedStyle(a);
              const clips = a === cell || s.overflowX !== 'visible' || s.overflowY !== 'visible';
              if (clips) {
                const box = a.getBoundingClientRect();
                for (const r of rects) {
                  if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
                    problems.push(`outside the visible box of ${a === cell ? 'its day cell' : `<${a.tagName.toLowerCase()}> that clips it`}`);
                    break;
                  }
                }
              }
              if (a === cell) break;
            }
            occurrences[n].push({
              cell: cellIds.get(cell)!,
              target: isTarget(cell),
              problems: [...new Set(problems)],
              rects: rects.map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })),
            });
          }
        }
        return occurrences;
      },
      { names, day: AWAY_DAY, dayNumber: 17, dateSources: datePatterns(AWAY_DAY) },
    );

    const onDay: { name: string; cell: number; rects: { l: number; t: number; r: number; b: number }[] }[] = [];
    for (const name of names) {
      const inTarget = (result[name] ?? []).filter((o) => o.target);
      expect.soft(inTarget.length, `ROW-122: ${name} is drawn exactly once in the cell of 17 March`).toBe(1);
      for (const o of inTarget) {
        expect.soft(o.problems, `ROW-122: ${name} lies inside its day cell's visible box`).toEqual([]);
        onDay.push({ name, cell: o.cell, rects: o.rects });
      }
    }
    expect.soft([...new Set(onDay.map((o) => o.cell))].length, 'ROW-122: all the names are in one day cell').toBe(1);
    const overlaps: string[] = [];
    for (let i = 0; i < onDay.length; i++) {
      for (let j = i + 1; j < onDay.length; j++) {
        for (const a of onDay[i].rects) {
          for (const b of onDay[j].rects) {
            const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (w > 1 && h > 1) overlaps.push(`${onDay[i].name} / ${onDay[j].name}`);
          }
        }
      }
    }
    expect.soft([...new Set(overlaps)], 'ROW-122: no two names overlap').toEqual([]);
    expect.soft(opened.consoleErrors, 'ROW-122: the calendar loads without a console error').toEqual([]);
  } finally {
    await opened.close();
    await member.dispose();
  }
});

// ------------------------------------------------------------------------------------------------ ROW-123

test('ROW-123.control.people-data-carries-every-account', async () => {
  const res = await admin.api.get('/api/admin/people');
  expect(res.status(), 'ROW-123 control: GET /api/admin/people answers the admin').toBe(200);
  const body = (await res.text()).toLowerCase();
  for (const a of [...accounts, ...leavers]) expect(body, `ROW-123 control: the people data carries ${a.email}`).toContain(a.email.toLowerCase());
});

const OFF_WORDS = /\b(off|switched off|inactive|disabled|deactivated)\b/i;
const ON_WORDS = /\b(on|switched on|active|enabled)\b/i;

test('ROW-123.REQ-020.people-page-lists-thirty-three-accounts-with-all-fields-and-actions', async ({ browser }) => {
  const opened = await openPage(browser, admin);
  const page = opened.page;
  try {
    const response = await page.goto(PAGES.adminPeople);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect.soft(response?.status(), 'ROW-123: /admin/people answers 200').toBe(200);

    const everyone = [...accounts, ...leavers];
    const rows = await findRows(
      page,
      everyone.map((a) => ({ key: a.email, keys: [[literal(a.email)]] })),
    );
    for (const a of everyone) {
      const row = rows.find((r) => r.key === a.email)!;
      const who = `ROW-123 ${a.name} <${a.email}>`;
      expect.soft(row.found, `${who}: the account is listed`).toBe(true);
      if (!row.found) continue;
      expect.soft(row.repeated, `${who}: the account is listed once`).toBe(false);
      expect.soft(row.text, `${who}: the row shows the name`).toContain(a.name);
      const numbers = withoutLiterals(row.text, [a.name, a.email]);
      const daysLeftNow = a.allowance - a.approvedDays;
      expect.soft(hasNumber(numbers, a.allowance), `${who}: the row shows the 2027 allowance ${a.allowance}`).toBe(true);
      expect.soft(hasNumber(numbers, a.nextAllowance), `${who}: the row shows the 2028 allowance ${a.nextAllowance}`).toBe(true);
      expect.soft(hasNumber(numbers, daysLeftNow), `${who}: the row shows the 2027 days left ${daysLeftNow}`).toBe(true);
      expect.soft(hasNumber(numbers, a.nextAllowance), `${who}: the row shows the 2028 days left ${a.nextAllowance}`).toBe(true);

      expect.soft(row.controls.length, `${who}: the row holds a control for its actions`).toBeGreaterThan(0);
      const switches = row.controls.filter((c) => c.checked !== null);
      let shown: 'on' | 'off' | 'unknown' = 'unknown';
      if (switches.length > 0) shown = switches[0].checked ? 'on' : 'off';
      else {
        const stateText = withoutLiterals(numbers, row.controls.map((c) => c.name).filter((n) => n.length > 0));
        shown = OFF_WORDS.test(stateText) ? 'off' : ON_WORDS.test(stateText) ? 'on' : 'unknown';
      }
      expect.soft(shown, `${who}: the row shows the account is switched ${a.on ? 'on' : 'off'}`).toBe(a.on ? 'on' : 'off');
    }

    const controls = await page
      .locator('a[href], button, [role="button"], [role="link"], input[type="submit"], input[type="button"]')
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const h = el.closest('header');
            return !el.closest('[role="banner"]') && !(h && !h.closest('article, aside, main, nav, section'));
          })
          .map((el) => `${(el as HTMLElement).innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('value') || ''} ${el.getAttribute('title') || ''}`.replace(/\s+/g, ' ').trim()),
      );
    const actions: [string, RegExp][] = [
      ['create an account', /\b(create|add|new)\b/i],
      ['change a name', /\b(re)?name\b/i],
      ['change an email', /\be-?mail\b/i],
      ['set a new password', /\bpassword\b/i],
      ['change an allowance', /\ballowance\b/i],
      ['switch an account off or on', /\bswitch\b|\bturn (on|off)\b|\b(de|re)?activate\b|\b(en|dis)able\b/i],
    ];
    for (const [action, re] of actions) {
      expect.soft(controls.some((c) => re.test(c)), `ROW-123: the people page has a control to ${action}`).toBe(true);
    }
    expect.soft(opened.consoleErrors, 'ROW-123: the people page loads without a console error').toEqual([]);
  } finally {
    await opened.close();
  }
});

// ------------------------------------------------------------------------------------------------ ROW-124

test('ROW-124.control.pending-data-carries-every-person', async () => {
  const res = await admin.api.get('/api/admin/pending');
  expect(res.status(), 'ROW-124 control: GET /api/admin/pending answers the admin').toBe(200);
  const body = await res.text();
  for (const a of accounts) expect(body, `ROW-124 control: the pending data carries ${a.name}`).toContain(a.name);
});

test('ROW-124.REQ-008.pending-page-lists-ninety-requests-in-send-order-with-all-fields', async ({ browser }) => {
  const opened = await openPage(browser, admin);
  const page = opened.page;
  try {
    const response = await page.goto(PAGES.adminPending);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect.soft(response?.status(), 'ROW-124: /admin/pending answers 200').toBe(200);

    const rows = await findRows(
      page,
      pending.map((p) => ({ key: p.key, keys: [[literal(p.person.name)], datePatterns(p.spec.firstDay)] })),
    );
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const p of pending) {
      const row = byKey.get(p.key)!;
      const who = `ROW-124 ${p.person.name} ${p.spec.kind} ${p.spec.firstDay}–${p.spec.lastDay}`;
      expect.soft(row.found, `${who}: the request is listed`).toBe(true);
      if (!row.found) continue;
      expect.soft(row.repeated, `${who}: the request is listed once`).toBe(false);
      const other = p.spec.kind === 'vacation' ? /\bsick\b/i : /\bvacation\b/i;
      const own = p.spec.kind === 'vacation' ? /\bvacation\b/i : /\bsick\b/i;
      expect.soft(own.test(row.text), `${who}: the row shows its kind`).toBe(true);
      expect.soft(other.test(row.text), `${who}: the row does not show the other kind`).toBe(false);
      expect.soft(hasDate(row.text, p.spec.lastDay), `${who}: the row shows its last day`).toBe(true);
      const numbers = withoutDates(withoutLiterals(row.text, [p.person.name]), [p.spec.firstDay, p.spec.lastDay]);
      expect.soft(hasNumber(numbers, 2), `${who}: the row shows its 2 counted days`).toBe(true);
      if (p.spec.kind === 'vacation') {
        const left = p.person.allowance - p.person.approvedDays;
        expect.soft(hasNumber(numbers, left), `${who}: the row shows the person's 2027 days left ${left}`).toBe(true);
      }
    }
    const listed = rows.filter((r) => r.found).sort((a, b) => a.order - b.order).map((r) => r.key);
    expect.soft(listed, 'ROW-124: the requests are listed oldest sent first').toEqual(pending.map((p) => p.key));

    const text = await page.locator('body').innerText();
    expect.soft(hasDate(text, '2027-03-15'), 'ROW-124: no approved request (15–19 March) is listed').toBe(false);
    expect.soft(hasDate(text, AWAY_DAY), 'ROW-124: no approved request (17 March) is listed').toBe(false);
    expect.soft(opened.consoleErrors, 'ROW-124: the pending page loads without a console error').toEqual([]);
  } finally {
    await opened.close();
  }
});
