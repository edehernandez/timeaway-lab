// Purpose: ledger test for ROW-159 (REQ-007, REQ-008, REQ-020, REQ-002, REQ-021, REQ-025, REQ-022) — every days-left, pending or forecast figure is labelled with its year and says which it is: on the person's own page, the pending page, the people page, the admin's person page, the approve confirmation and in the refusal message.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11; the A-055 case added by batch test-author-26); fixture data made through the product's public routes by harness.ts (reset, account, allowance, requests, approvals), fresh per run; pages opened through harness.ts's engine door.
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
  freshName,
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
import { openConfirmation } from './admin-kit';

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

async function setup(names: { admin?: string; member?: string } = {}): Promise<{ admin: Actor; session: Actor }> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-08'), admin: names.admin === undefined ? undefined : { name: names.admin } });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { allowance: 47, ...(names.member === undefined ? {} : { name: names.member }) });
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
async function labelsOn(
  page: Page,
  figures: Figure[],
  opts: { renderedOnly?: boolean } = {},
): Promise<{ figure: Figure; drawn: boolean; labelled: boolean; seen: string[] }[]> {
  return page.evaluate(({ figs, renderedOnly }) => {
    // renderedOnly: count only elements the page draws — never a script's, style's or template's text (a page's data
    // payload), nor an element with no box.
    const rendered = (el: Element) =>
      !el.closest('script, style, noscript, template') && (el as HTMLElement).getClientRects().length > 0;
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
      const els = Array.from(document.body.querySelectorAll('*')).filter((el) => numberRe(f.value).test(ownText(el)) && (!renderedOnly || rendered(el)));
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
  }, { figs: figures, renderedOnly: opts.renderedOnly === true });
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

// ---------------------------------------------------------------------------------------------------
// ROW-159 (amended, A-055) promise: the row as amended — every days-left, pending or forecast figure on every page
// ROW-159   and confirmation, the admin's person page and the approve confirmation included (A-055: "yes, as
// ROW-159   recommended"), is labelled with its year and says which it is; REQ-021 (the person's requests page lists the
// ROW-159   requests as the person's own page does), REQ-025 (the approve confirmation names what will change), REQ-022
// ROW-159   (the forecast is labelled as such); INV-001 (the forecast is not the days left).
// ROW-159 wrong product: a person page drawing the person's balance as "38 · 11" and "54 · 13" with no year (the
// ROW-159   own page's labels left behind when the component was reused); an approve confirmation saying "Approve? 32
// ROW-159   days left" — no year, and a forecast called days left — or "Leaves 47." for a 2028 request with no year.
// ROW-159 given: the setup above (today Mon 2027-03-08; 2027: 38 left, 11 pending; 2028: 54 left, 13 pending; the
// ROW-159   pending 2027 vacation 19..26 Apr of 6 days, forecast 32; the pending 2028 vacation 17..25 Jan of 7 days,
// ROW-159   forecast 47). when: the admin opens /admin/people/:id for the member; then, on /admin/pending, presses Approve
// ROW-159   on the 19..26 Apr request and reads its confirmation, declines it, and does the same for the 17..25 Jan 2028
// ROW-159   request. then: on the person page 38 and 54 are drawn, each labelled with its year and as days left, and 11
// ROW-159   and 13, wherever drawn, with their year and as pending; in each confirmation every one of that request's
// ROW-159   year's figures it shows (days left, pending, forecast) carries its year and its word.
// ROW-159 controls: ROW-159.control.the-setup-figures-exist (the figures exist, through GET /api/balance); in the
// ROW-159   target, the confirmation opening at all (openConfirmation fails the case when no confirmation opens) and the
// ROW-159   person page answering 200 with the person's name.
// ROW-159 technique: distinctive figure values (no date, count or allowance on these surfaces draws them), the page
// ROW-159   label rule stated above (on the person page counting only rendered elements, never the page's data payload), and for a confirmation's text the same rule on text: the label is the whole
// ROW-159   confirmation when it names one year only, else the clause holding the figure, whose nearest year must be the
// ROW-159   figure's. A confirmation that shows no figure has nothing to label; a figure it shows must be labelled.
// ROW-159 cases: ROW-159 target=ROW-159.REQ-021.person-page-and-approve-confirmation-figures-name-their-year control=ROW-159.control.the-setup-figures-exist

/** For each figure: whether the confirmation's text draws it, and whether a drawing of it carries its year and its word (the rule above). */
function confirmationLabels(text: string, figures: Figure[]): { figure: Figure; drawn: boolean; labelled: boolean; seen: string[] }[] {
  const words: Record<Which, RegExp> = {
    left: /\bleft\b|remaining/i,
    pending: /pending/i,
    forecast: /would|\bwill\b|\bafter\b|if approved|\bleaves\b|forecast/i,
  };
  const yearsIn = (t: string) => Array.from(new Set((t.match(/\b20\d\d\b/g) ?? []).map(Number)));
  const flat = text.replace(/[ \t]+/g, ' ');
  const whole = yearsIn(flat);
  const clauses = flat.split(/\n|;|\||•|·|\.\s+(?=[A-Z])/);
  return figures.map((f) => {
    const re = new RegExp(`(^|[^0-9])${f.value}([^0-9]|$)`, 'g');
    const seen: string[] = [];
    let drawn = false;
    let labelled = false;
    for (const clause of clauses) {
      for (const m of clause.matchAll(re)) {
        drawn = true;
        const start = (m.index ?? 0) + m[1].length;
        let yearOk: boolean;
        let label: string;
        if (whole.length === 1) {
          label = flat;
          yearOk = whole[0] === f.year;
        } else {
          label = clause;
          let best: number | null = null;
          let gap = Infinity;
          for (const y of clause.matchAll(/\b20\d\d\b/g)) {
            const ys = y.index ?? 0;
            const g = ys + 4 <= start ? start - (ys + 4) : ys - (start + String(f.value).length);
            if (Math.abs(g) < gap) {
              gap = Math.abs(g);
              best = Number(y[0]);
            }
          }
          yearOk = best === f.year;
        }
        seen.push(label.trim().slice(0, 200));
        if (yearOk && words[f.which].test(label)) labelled = true;
      }
    }
    return { figure: f, drawn, labelled, seen };
  });
}

test('ROW-159.REQ-021.person-page-and-approve-confirmation-figures-name-their-year', async ({ browser }) => {
  test.setTimeout(300_000);
  // Names without digits, so no name drawn on a page or in a confirmation reads as a figure.
  const letters = (n: string) => n.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
  const { admin, session } = await setup({ admin: letters(freshName('Admin')), member: letters(freshName('Member')) });
  const name = session.me.name;
  const adm = await openPage(browser, admin);
  closers.push(adm);
  const page = adm.page;

  // The admin's person page: days left drawn and labelled; pending, wherever drawn, labelled.
  const res = await page.goto(PAGES.adminPerson(session.me.id));
  expect(res?.status(), "ROW-159 person page: /admin/people/:id answers the admin").toBe(200);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.getByText(name).first(), "ROW-159 person page: it is the member's page").toBeVisible();
  const personFigures: Figure[] = [
    { value: 38, year: 2027, which: 'left' },
    { value: 11, year: 2027, which: 'pending' },
    { value: 54, year: 2028, which: 'left' },
    { value: 13, year: 2028, which: 'pending' },
  ];
  await expect
    .poll(async () => (await labelsOn(page, personFigures, { renderedOnly: true })).filter((r) => r.figure.which === 'left').every((r) => r.drawn), { timeout: 10_000 })
    .toBe(true)
    .catch(() => undefined);
  for (const r of await labelsOn(page, personFigures, { renderedOnly: true })) {
    const f = r.figure;
    if (f.which === 'left') expect.soft(r.drawn, `ROW-159 person page draws the ${f.year} days-left figure ${f.value}`).toBe(true);
    if (r.drawn) {
      expect
        .soft(r.labelled, `ROW-159 person page: ${f.value} is labelled with ${f.year} and says ${f.which} (labels seen: ${r.seen.join(' ‖ ')})`)
        .toBe(true);
    }
  }

  // The approve confirmation, for a 2027 request and for a 2028 request; each declined (dismissed or left by reloading).
  page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
  const dayRe = (d: number) => new RegExp(`(^|[^0-9])0?${d}([^0-9]|$)`);
  const approveControl = (days: [number, number]) => {
    const verb = /approve/i;
    const control = page.getByRole('button', { name: verb }).or(page.getByRole('link', { name: verb }));
    const item = page
      .locator('li, tr, article, section, form, fieldset, div, [role="row"], [role="listitem"]')
      .filter({ hasText: name })
      .filter({ hasText: dayRe(days[0]) })
      .filter({ hasText: dayRe(days[1]) })
      .filter({ has: control })
      .last();
    return item.getByRole('button', { name: verb }).or(item.getByRole('link', { name: verb })).first();
  };
  const confirmations: [string, [number, number], Figure[]][] = [
    [
      'the 19..26 Apr 2027 request',
      [19, 26],
      [
        { value: 38, year: 2027, which: 'left' },
        { value: 11, year: 2027, which: 'pending' },
        { value: 32, year: 2027, which: 'forecast' },
      ],
    ],
    [
      'the 17..25 Jan 2028 request',
      [17, 25],
      [
        { value: 54, year: 2028, which: 'left' },
        { value: 13, year: 2028, which: 'pending' },
        { value: 47, year: 2028, which: 'forecast' },
      ],
    ],
  ];
  for (const [what, days, figures] of confirmations) {
    const pending = await page.goto(PAGES.adminPending);
    expect(pending?.status(), 'ROW-159 approve confirmation: /admin/pending answers the admin').toBe(200);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const shown = await openConfirmation(page, approveControl(days), /approve/i, `ROW-159 approve confirmation for ${what}`);
    for (const r of confirmationLabels(shown.text.split(name).join(' '), figures)) {
      const f = r.figure;
      if (!r.drawn) continue;
      expect
        .soft(r.labelled, `ROW-159 approve confirmation for ${what}: ${f.value} is labelled with ${f.year} and says ${f.which} (it shows: ${JSON.stringify(shown.text.slice(0, 400))})`)
        .toBe(true);
    }
  }
});
