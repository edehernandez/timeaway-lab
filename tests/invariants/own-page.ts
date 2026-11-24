// Purpose: shared browser reader for the person's own requests page "/" — opens it as a signed-in person, waits (bounded) until the given requests' rows are drawn, and reads each row's visible text, its state and kind words and its numbers; used by the page cases of ROW-025, ROW-026, ROW-027, ROW-028, ROW-030, ROW-031 and ROW-157.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-5), after lesson L-1 (a row promising what a page shows is read on the page, beside the API); a public harness boundary beside harness.ts and page-reading.ts. It reads only the loaded page, never application source.
//
// Readings, stated once here (no design state names this page's elements, so nothing is read by a class or a test
// id the product would have to invent):
//   - a request's ROW is found by page-reading.ts findRows from its first and last day as the page draws them in
//     English (datePatterns): the innermost visible element carrying both days, widened to the largest ancestor
//     carrying no other given request's days. Pass every request the page should show, so each row is bounded by
//     its neighbours, and choose the data so no act's date (sent, decided, cancelled) is another request's day;
//   - a row's TEXT is its innerText, whitespace collapsed: what the person sees without operating anything;
//   - a STATE word is pending, approved, rejected, or cancelled / canceled, as a word of its own (a "Cancel" button
//     never reads as cancelled); a KIND word is vacation or sick, as a word of its own;
//   - a NUMBER is read after removing every rendering of the given days, every time of day (09:10, 9:10 am) and the
//     given literals (names, emails, years), so a day of the month, an hour or a run id's digits never read as a count.
import { expect, type Browser, type Page } from '@playwright/test';
import { openPage, type Actor } from './harness';
import { datePatterns, findRows, hasDate, hasNumber, withoutDates, withoutLiterals, type FoundRow } from './page-reading';

/** A request to find on the page: a label for messages, its first and last day (YYYY-MM-DD). */
export interface DrawnSpec {
  label: string;
  firstDay: string;
  lastDay: string;
}

/** One request's row as read on the page. */
export interface DrawnRow {
  label: string;
  found: boolean;
  /** More than one separate place on the page carries the request's first and last day. */
  repeated: boolean;
  /** Visible text, whitespace collapsed ('' when not found). */
  text: string;
  /** Position among the found rows, document order (-1 when not found). */
  order: number;
}

/** What one load of "/" gave: the rows, the whole body's visible text, the document status and whatever `extra` read. */
export interface OwnPageRead<T> {
  status: number;
  rows: DrawnRow[];
  body: string;
  extra: T;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Opens "/" as `actor` through the engine door, waits for the network to settle, then polls (bounded, no sleep)
 * until every spec's row is found or `timeoutMs` passes, and reads the rows in one evaluate. `extra`, when given,
 * runs on the same loaded page after the rows are read (no navigation). The page is closed before returning.
 */
export async function readOwnPage<T = undefined>(
  browser: Browser,
  actor: Actor,
  specs: DrawnSpec[],
  extra?: (page: Page) => Promise<T>,
  timeoutMs = 15_000,
): Promise<OwnPageRead<T>> {
  const opened = await openPage(browser, actor);
  try {
    const response = await opened.page.goto('/');
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const rowSpecs = specs.map((s) => ({ key: s.label, keys: [datePatterns(s.firstDay), datePatterns(s.lastDay)] }));
    let found: FoundRow[] = [];
    await expect
      .poll(async () => (found = await findRows(opened.page, rowSpecs)).filter((r) => r.found).length, { timeout: timeoutMs })
      .toBe(specs.length)
      .catch(() => undefined);
    const body = norm(await opened.page.locator('body').innerText().catch(() => ''));
    const value = extra ? await extra(opened.page) : (undefined as T);
    return {
      status: response?.status() ?? 0,
      rows: found.map((r) => ({ label: r.key, found: r.found, repeated: r.repeated, text: norm(r.text), order: r.order })),
      body,
      extra: value,
    };
  } finally {
    await opened.close();
  }
}

/** The row read for `label` (every spec passed to readOwnPage has one). */
export function rowOf(read: OwnPageRead<unknown>, label: string): DrawnRow {
  const row = read.rows.find((r) => r.label === label);
  if (!row) throw new Error(`no row was asked for "${label}"`);
  return row;
}

export type ShownState = 'pending' | 'approved' | 'rejected' | 'cancelled';

const STATE_WORD: Record<ShownState, RegExp> = {
  pending: /(?<![a-z])pending(?![a-z])/i,
  approved: /(?<![a-z])approved(?![a-z])/i,
  rejected: /(?<![a-z])rejected(?![a-z])/i,
  cancelled: /(?<![a-z])cancell?ed(?![a-z])/i,
};

/** The text carries the state as a word of its own ("Cancel" is not "cancelled"). */
export function saysState(text: string, state: ShownState): boolean {
  return STATE_WORD[state].test(text);
}

/** The text carries the kind as a word of its own. */
export function saysKind(text: string, kind: 'vacation' | 'sick'): boolean {
  return new RegExp(`(?<![a-z])${kind}(?![a-z])`, 'i').test(text);
}

/** The text carries the day `isoDay` in an English rendering (page-reading.ts datePatterns). */
export function saysDay(text: string, isoDay: string): boolean {
  return hasDate(text, isoDay);
}

const TIME_OF_DAY = /(?<!\d)\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?(?![\d])/gi;

/** The text carries `n` as a number of its own, once every rendering of `days`, every time of day and every literal in `literals` is removed. */
export function saysNumber(text: string, n: number, days: string[], literals: string[]): boolean {
  return hasNumber(withoutLiterals(withoutDates(text, days), literals).replace(TIME_OF_DAY, ' '), n);
}
