// Purpose: ledger test for ROW-159 (REQ-007, REQ-008, REQ-020, REQ-002) — every days-left, pending or forecast figure is labelled with its year and says which it is: on the person's own page, the pending page, the people page and in the refusal message.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, account, allowance, requests, approvals), fresh per run; pages opened through harness.ts's engine door.
//
// Boundary (R6): a figure's label is paint, so the pages are read in the browser (D-029 pages /, /admin/pending,
// /admin/people); the refusal message is read at the HTTP harness (POST /api/requests' refusal body).
// What "labelled" means here, stated once: a figure is the element whose own text holds the number; its label
// is, in a table, the cell's text with its column header and its row header; elsewhere, the text of the largest
// enclosing element that names no other year, with the previous sibling of that element, the nearest heading
// before the figure, and any aria-label or title on the way. The label must name the figure's year and say which
// figure it is: "left" (or "remaining") for days left, "pending" for pending days, and "would leave", "after
// approval", "if approved", "leaves" or "forecast" for the pending page's forecast — and a days-left label must
// not be a forecast's. The figure values are chosen so no date, count or allowance on these pages draws them.
//
// ROW-159 promise: REQ-007 (each year's days left with that year's pending vacation days beside it), REQ-008 and
// ROW-159   REQ-022 (the pending page: the person's days left in the request's year, and "labelled as such" the days
// ROW-159   left the approval would leave), REQ-020 (the people page: days left for the current and the next year),
// ROW-159   REQ-002 (the refusal shows that year's days left with that year's pending days beside it); INV-001 (the
// ROW-159   forecast is not the days left). The row's case: every such figure is labelled with its year and says
// ROW-159   which it is.
// ROW-159 wrong product: the own page showing "38 · 11" and "54 · 13" under one heading with no years; the pending
// ROW-159   page showing the forecast in a column headed "Days left" (the F-22 confusion); the people page with a
// ROW-159   "Days left" column for this year only and next year's figure unlabelled; a refusal "Not enough days".
// ROW-159 given: today Mon 2027-03-08 (Auckland); a member with allowance 47 for 2027 and 56 from 2028 (set to start
// ROW-159   next year); approved 2027 vacation Mon 03-15..Thu 03-25 (9) → 38 left; pending 2027 vacations of 6 and 5 →
// ROW-159   11 pending; approved 2028 vacation Mon 03-06..Tue 03-07 (2) → 54 left; pending 2028 vacations of 7 and 6
// ROW-159   → 13 pending; forecasts 32, 33 (2027) and 47, 48 (2028). when: the member opens /; the admin opens
// ROW-159   /admin/pending and /admin/people; the member sends a 28-day 2027 vacation. then: on / the figures 38, 11,
// ROW-159   54, 13 are each labelled with their year and their word; on /admin/pending 38 and 54 as days left and
// ROW-159   32, 33, 47, 48 as forecasts, each with its year; on /admin/people 38 and 54 as days left with their year;
// ROW-159   the refusal names 2027, 38 as days left and 11 as pending.
// ROW-159 controls: the control case shows the setup's figures through GET /api/balance (38 and 11 for 2027, 54
// ROW-159   and 13 for 2028), so the target reads pages whose figures exist.
// ROW-159 technique: distinctive figure values (no collision with a date, a count or an allowance on the page) so
// ROW-159   each figure is in one exact place, and a label rule stated once, applied to every figure.
// ROW-159 cases: ROW-159 target=ROW-159.REQ-007.every-balance-figure-names-its-year-and-what-it-is control=ROW-159.control.the-setup-figures-exist
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  openPage,
  PAGES,
  readBalance,
  resetProduct,
  sendRequest,
  setAllowance,
  signIn,
  signInMember,
  type Actor,
} from './harness';
import { aucklandMorning, balanceYear } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
const closers: { close(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const c of closers.splice(0)) await c.close().catch(() => undefined);
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

type Which = 'left' | 'pending' | 'forecast';
interface Figure {
  value: number;
  year: number;
  which: Which;
}

async function setup(): Promise<{ admin: Actor; session: Actor }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-08') });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 47 });
  await setAllowance(admin, m.id, 56, { startsNextYear: true });
  const session = keep(await signInMember(m));
  await approve(admin, await sendRequest(session, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-25' }));
  await approve(admin, await sendRequest(session, { kind: 'vacation', firstDay: '2028-03-06', lastDay: '2028-03-07' }));
  await sendRequest(session, { kind: 'vacation', firstDay: '2027-04-19', lastDay: '2027-04-26' });
  await sendRequest(session, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-07' });
  await sendRequest(session, { kind: 'vacation', firstDay: '2028-01-17', lastDay: '2028-01-25' });
  await sendRequest(session, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-14' });
  return { admin, session };
}

/** For each figure: whether it is drawn, and whether some drawing of it carries a label naming its year and its word. */
async function labelsOn(page: Page, figures: Figure[]): Promise<{ figure: Figure; drawn: boolean; labelled: boolean; seen: string[] }[]> {
  return page.evaluate((figs) => {
    const words: Record<string, RegExp> = {
      left: /\bleft\b|remaining/i,
      pending: /pending/i,
      forecast: /would leave|after approv|if approved|\bleaves\b|forecast/i,
    };
    const numberRe = (v: number) => new RegExp(`(^|[^0-9])${v}([^0-9]|$)`);
    const yearsIn = (t: string) => (t.match(/\b20\d\d\b/g) ?? []).map(Number);
    const ownText = (el: Element) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? '')
        .join(' ');
    const text = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ');
    const attrs = (el: Element) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`;
    const headingBefore = (el: Element): string => {
      const all = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,caption'));
      let found = '';
      for (const h of all) {
        if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = text(h);
      }
      return found;
    };
    const tableLabel = (cell: HTMLTableCellElement): string => {
      const row = cell.parentElement as HTMLTableRowElement;
      const table = cell.closest('table');
      const index = Array.from(row.children).indexOf(cell);
      let header = '';
      const headRow = table?.querySelector('thead tr') ?? table?.querySelector('tr');
      if (headRow && headRow !== row) header = text(headRow.children[index] ?? null);
      const rowHeader = row.querySelector('th') ?? row.children[0];
      const caption = table?.querySelector('caption');
      return `${text(cell)} | ${header} | ${rowHeader && rowHeader !== cell ? text(rowHeader) : ''} | ${caption ? text(caption) : ''}`;
    };
    // label: everything the figure is labelled by; near: the figure's own cell and column header (in a table) or
    // its own element and previous sibling (elsewhere) — what must not call a days-left figure a forecast.
    const labelFor = (el: Element, year: number): { label: string; near: string } => {
      const cell = el.closest('td,th') as HTMLTableCellElement | null;
      if (cell) {
        const label = `${tableLabel(cell)} | ${attrs(el)}`;
        const parts = label.split(' | ');
        return { label, near: `${parts[0]} ${parts[1] ?? ''}` };
      }
      let top = el;
      let extra = attrs(el);
      while (top.parentElement && top.parentElement !== document.body) {
        const ys = yearsIn(text(top.parentElement));
        if (ys.some((y) => y !== year)) break;
        top = top.parentElement;
        extra += ` ${attrs(top)}`;
      }
      const prev = top.previousElementSibling ? text(top.previousElementSibling) : '';
      const elPrev = el.previousElementSibling ? text(el.previousElementSibling) : '';
      return { label: `${text(top)} | ${prev} | ${headingBefore(el)} | ${extra}`, near: `${text(el)} ${elPrev}` };
    };
    // The year written closest to the figure in its own text (the gap between the two tokens, either side).
    const nearestYear = (t: string, v: number): number | null => {
      const m0 = numberRe(v).exec(t);
      if (!m0) return null;
      const start = m0.index + m0[1].length;
      const end = start + String(v).length;
      let best: number | null = null;
      let gap = Infinity;
      for (const m of t.matchAll(/\b20\d\d\b/g)) {
        const ys = m.index ?? 0;
        const ye = ys + 4;
        const g = ye <= start ? start - ye : ys >= end ? ys - end : 0;
        if (g < gap) {
          gap = g;
          best = Number(m[0]);
        }
      }
      return best;
    };
    return figs.map((f) => {
      const els = Array.from(document.body.querySelectorAll('*')).filter((el) => numberRe(f.value).test(ownText(el)));
      const seen: string[] = [];
      let labelled = false;
      for (const el of els) {
        const { label, near } = labelFor(el, f.year);
        seen.push(label.slice(0, 200));
        const own = text(el);
        const yearOk = yearsIn(own).length > 1 ? nearestYear(own, f.value) === f.year : yearsIn(label).includes(f.year);
        const wordOk = words[f.which].test(label);
        const notForecast = f.which === 'forecast' || !words.forecast.test(near);
        if (yearOk && wordOk && notForecast) labelled = true;
      }
      return { figure: f, drawn: els.length > 0, labelled, seen };
    });
  }, figures);
}

async function checkPage(page: Page, path: string, figures: Figure[], row: string): Promise<void> {
  const res = await page.goto(path);
  expect.soft(res?.status(), `${row}: ${path} answers 200`).toBe(200);
  await page.waitForLoadState('networkidle');
  await expect
    .poll(async () => (await labelsOn(page, figures)).every((r) => r.drawn), { timeout: 10_000 })
    .toBe(true)
    .catch(() => undefined);
  for (const r of await labelsOn(page, figures)) {
    const f = r.figure;
    expect.soft(r.drawn, `${row}: ${path} draws the ${f.year} ${f.which} figure ${f.value}`).toBe(true);
    expect
      .soft(r.labelled, `${row}: ${path}'s ${f.value} is labelled with ${f.year} and says ${f.which} (labels seen: ${r.seen.join(' ‖ ')})`)
      .toBe(true);
  }
}

test('ROW-159.control.the-setup-figures-exist', async () => {
  const { session } = await setup();
  const b = await readBalance(session);
  expect(balanceYear(b, 2027), 'ROW-159 control: 2027 shows 38 left and 11 pending').toEqual({ daysLeft: 38, pending: 11 });
  expect(balanceYear(b, 2028), 'ROW-159 control: 2028 shows 54 left and 13 pending').toEqual({ daysLeft: 54, pending: 13 });
});

test('ROW-159.REQ-007.every-balance-figure-names-its-year-and-what-it-is', async ({ browser }) => {
  const { admin, session } = await setup();

  const own = await openPage(browser, session);
  closers.push(own);
  await checkPage(
    own.page,
    PAGES.home,
    [
      { value: 38, year: 2027, which: 'left' },
      { value: 11, year: 2027, which: 'pending' },
      { value: 54, year: 2028, which: 'left' },
      { value: 13, year: 2028, which: 'pending' },
    ],
    'ROW-159 own page',
  );

  const adm = await openPage(browser, admin);
  closers.push(adm);
  await checkPage(
    adm.page,
    PAGES.adminPending,
    [
      { value: 38, year: 2027, which: 'left' },
      { value: 54, year: 2028, which: 'left' },
      { value: 32, year: 2027, which: 'forecast' },
      { value: 33, year: 2027, which: 'forecast' },
      { value: 47, year: 2028, which: 'forecast' },
      { value: 48, year: 2028, which: 'forecast' },
    ],
    'ROW-159 pending page',
  );
  await checkPage(
    adm.page,
    PAGES.adminPeople,
    [
      { value: 38, year: 2027, which: 'left' },
      { value: 54, year: 2028, which: 'left' },
    ],
    'ROW-159 people page',
  );

  // The refusal message: a 2027 vacation of 28 days, beyond 38 − 11 = 27 (Mon 06-07 .. Wed 07-14).
  const res = await session.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-07-14' } });
  const body = (await res.text()).replace(/\s+/g, ' ');
  expect.soft(res.status(), 'ROW-159 refusal: the 28-day vacation is refused').not.toBe(201);
  expect.soft(/\b2027\b/.test(body), `ROW-159 refusal: the message names 2027 (body: ${body.slice(0, 300)})`).toBe(true);
  expect.soft(/(^|[^0-9])38([^0-9]|$)/.test(body) && /\bleft\b|remaining/i.test(body), `ROW-159 refusal: the message says 38 days left (body: ${body.slice(0, 300)})`).toBe(true);
  expect.soft(/(^|[^0-9])11([^0-9]|$)/.test(body) && /pending/i.test(body), `ROW-159 refusal: the message says 11 pending (body: ${body.slice(0, 300)})`).toBe(true);
});
