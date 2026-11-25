// Purpose: shared browser readers for the page cases of the balance and pending-list rows (ROW-033 to ROW-039, ROW-094, ROW-108, ROW-150, ROW-160) — a year's figures on the own page "/", one request's row on "/" bounded by the balance figures, and the pending requests' rows on /admin/pending, each read on the loaded page after a bounded wait.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-8), after lesson L-1 (a row promising what a page shows is read on the page, beside the API); a public harness boundary beside harness.ts, page-reading.ts, own-page.ts and journey-pages.ts. It reads only the loaded page, never application source, and asserts nothing about any row.
//
// Readings, stated once here (no design state names these pages' elements, so nothing is read by a class or a test
// id the product would have to invent):
//   - a YEAR'S FIGURES on "/" are journey-pages.ts yearFigures: the text of the smallest visible element that says
//     "days left" and that year and not the other year (or, when one element holds both years, its text from that
//     year's label to the other year's);
//   - a REQUEST'S ROW on "/" is the one list item (journey-pages.ts readItems: the innermost tr, li, role row or
//     listitem, or article) carrying its first and last day — so a table's column headers ("State", "Cancelled")
//     never read as the row's own words; when no single such item carries them, page-reading.ts findRows' row for
//     the two days, bounded by the balance figures (an element saying "days left"), never the header or the figures;
//   - a PENDING ROW on /admin/pending is findRows' row for the person's display name and the request's first day
//     (the reading ROW-124 uses), bounded by the other given requests: pass every request the page should show. A
//     notice the page draws after a decision ("… request of 8 March … is now approved") carries the same keys, so
//     whether a request is still LISTED is read with pendingItemCount (list items only, never a notice);
//   - a row's TEXT is its innerText, whitespace collapsed; numbers, states and days in it are read with own-page.ts
//     (saysNumber, saysState, saysDay).
import { expect, type Browser, type Page } from '@playwright/test';
import { openPage, PAGES, type Actor } from './harness';
import { readItems, yearFigures } from './journey-pages';
import { datePatterns, findRows, literal, type FoundRow, type RowSpec } from './page-reading';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One row as read on a page. */
export interface ReadRow {
  label: string;
  found: boolean;
  /** More than one separate place on the page carries the row's keys. */
  repeated: boolean;
  /** Visible text, whitespace collapsed ('' when not found). */
  text: string;
  /** Position among the found rows, in document order (-1 when not found). */
  order: number;
}

function tidy(rows: FoundRow[]): ReadRow[] {
  return rows.map((r) => ({ label: r.key, found: r.found, repeated: r.repeated, text: norm(r.text), order: r.order }));
}

/** The row read for `label`. Throws a plain Error when no row was asked for it (a test's own mistake). */
export function rowLabelled(rows: ReadRow[], label: string): ReadRow {
  const row = rows.find((r) => r.label === label);
  if (!row) throw new Error(`no row was asked for "${label}"`);
  return row;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------------
// The own page "/": a year's figures
// ---------------------------------------------------------------------------------------------------

/** What one load of "/" showed for the two years: each year's figures text (null when the page says neither). */
export interface OwnFigures {
  status: number;
  years: Record<number, string | null>;
  body: string;
}

/**
 * Opens "/" as `actor` through the engine door, waits for the network to settle, then polls (bounded, no sleep) until
 * both years' figures are drawn or `timeoutMs` passes, and reads them. The page is closed before returning.
 */
export async function readOwnFigures(browser: Browser, actor: Actor, years: [number, number], timeoutMs = 15_000): Promise<OwnFigures> {
  const opened = await openPage(browser, actor);
  try {
    const response = await opened.page.goto(PAGES.home);
    await settle(opened.page);
    const [a, b] = years;
    const read = async () => ({ [a]: await yearFigures(opened.page, a, b), [b]: await yearFigures(opened.page, b, a) });
    let last: Record<number, string | null> = { [a]: null, [b]: null };
    await expect
      .poll(async () => {
        last = await read();
        return last[a] !== null && last[b] !== null;
      }, { timeout: timeoutMs })
      .toBe(true)
      .catch(() => undefined);
    const body = norm(await opened.page.locator('body').innerText().catch(() => ''));
    return { status: response?.status() ?? 0, years: last, body };
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// The own page "/": one request's row, bounded by the balance figures
// ---------------------------------------------------------------------------------------------------

/** A request to find on "/": a label for messages, its first and last day (YYYY-MM-DD). */
export interface OwnSpec {
  label: string;
  firstDay: string;
  lastDay: string;
}

/** The figures' bound: any element saying "days left" (the balance), so a request's row never widens over it. */
const FIGURES_BOUND = '__balance figures';

/** What one load of "/" gave for the given requests. */
export interface OwnRowsRead {
  status: number;
  rows: ReadRow[];
  body: string;
}

/**
 * Opens "/" as `actor`, waits for the network to settle, polls (bounded) until every spec's row is found, and reads the
 * rows — each bounded by the other specs and by the balance figures (see the header). The page is closed before
 * returning.
 */
export async function readOwnRows(browser: Browser, actor: Actor, specs: OwnSpec[], timeoutMs = 15_000): Promise<OwnRowsRead> {
  const opened = await openPage(browser, actor);
  try {
    const response = await opened.page.goto(PAGES.home);
    await settle(opened.page);
    const rowSpecs: RowSpec[] = [
      ...specs.map((s) => ({ key: s.label, keys: [datePatterns(s.firstDay), datePatterns(s.lastDay)] })),
      { key: FIGURES_BOUND, keys: [['days?\\s+left']] },
    ];
    let found: FoundRow[] = [];
    const wanted = (rows: FoundRow[]) => rows.filter((r) => r.key !== FIGURES_BOUND && r.found).length;
    await expect
      .poll(async () => wanted((found = await findRows(opened.page, rowSpecs))), { timeout: timeoutMs })
      .toBe(specs.length)
      .catch(() => undefined);
    const rows = tidy(found.filter((r) => r.key !== FIGURES_BOUND));
    for (const [i, s] of specs.entries()) {
      const items = await readItems(opened.page, { patterns: [datePatterns(s.firstDay).join('|'), datePatterns(s.lastDay).join('|')] });
      if (items.length === 1) rows[i] = { ...rows[i], found: true, text: items[0].text };
    }
    const body = norm(await opened.page.locator('body').innerText().catch(() => ''));
    return { status: response?.status() ?? 0, rows, body };
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// The pending page /admin/pending: the requests' rows
// ---------------------------------------------------------------------------------------------------

/** A pending request to find on /admin/pending: a label for messages, the person's display name, its first day. */
export interface PendingSpec {
  label: string;
  name: string;
  firstDay: string;
}

/** The regex sources that say a text carries the request: the person's name, and its first day in English. */
export function pendingKeys(spec: PendingSpec): string[][] {
  return [[literal(spec.name)], datePatterns(spec.firstDay)];
}

/**
 * On the loaded page (no navigation), polls (bounded, no sleep) until every spec in `mustFind` is found and `until`
 * holds, and returns the last rows read for every spec — found or not. Specs not in `mustFind` (requests that must
 * NOT be drawn) still bound the others. Default `mustFind`: every spec.
 */
export async function pendingRowsNow(
  page: Page,
  specs: PendingSpec[],
  opts: { mustFind?: string[]; until?: (rows: ReadRow[]) => boolean; timeoutMs?: number } = {},
): Promise<ReadRow[]> {
  const mustFind = opts.mustFind ?? specs.map((s) => s.label);
  const rowSpecs: RowSpec[] = specs.map((s) => ({ key: s.label, keys: pendingKeys(s) }));
  let last: ReadRow[] = [];
  await expect
    .poll(
      async () => {
        last = tidy(await findRows(page, rowSpecs));
        const allFound = mustFind.every((l) => last.find((r) => r.label === l)?.found);
        return allFound && (opts.until ? opts.until(last) : true);
      },
      { timeout: opts.timeoutMs ?? 15_000 },
    )
    .toBe(true)
    .catch(() => undefined);
  return last;
}

/**
 * How many list items (journey-pages.ts readItems: tr, li, role row or listitem, article) on the loaded page carry the
 * request's person's name and first day, after polling (bounded, no sleep) until the count is `want` or `timeoutMs`
 * passes. A notice drawn outside the list never counts.
 */
export async function pendingItemCount(page: Page, spec: PendingSpec, want: number, timeoutMs = 10_000): Promise<number> {
  const match = { includes: [spec.name], patterns: [datePatterns(spec.firstDay).join('|')] };
  let count = -1;
  await expect
    .poll(async () => (count = (await readItems(page, match)).length), { timeout: timeoutMs })
    .toBe(want)
    .catch(() => undefined);
  return count;
}

/** What one load of /admin/pending gave. */
export interface PendingPageRead {
  status: number;
  rows: ReadRow[];
  body: string;
  consoleErrors: string[];
}

/**
 * Opens /admin/pending as `admin` through the engine door, waits for the network to settle, reads the rows with
 * pendingRowsNow and the body's visible text. The page is closed before returning.
 */
export async function readPendingPage(
  browser: Browser,
  admin: Actor,
  specs: PendingSpec[],
  opts: { mustFind?: string[]; timeoutMs?: number } = {},
): Promise<PendingPageRead> {
  const opened = await openPage(browser, admin);
  try {
    const response = await opened.page.goto(PAGES.adminPending);
    await settle(opened.page);
    const rows = await pendingRowsNow(opened.page, specs, opts);
    const body = norm(await opened.page.locator('body').innerText().catch(() => ''));
    return { status: response?.status() ?? 0, rows, body, consoleErrors: [...opened.consoleErrors] };
  } finally {
    await opened.close();
  }
}
