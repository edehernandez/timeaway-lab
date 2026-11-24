// Purpose: shared page readers for ledger tests on a product with no design markers — a loaded page's links, its header (the banner landmark), its sign-out control, English date renderings and the rows a list draws for given records.
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); a public harness boundary beside harness.ts. It reads only the loaded page, never application source.
//
// Conventions it reads, all public and accessible, none a design marker:
//   - the header is the page's banner landmark: an element with role="banner", or a <header> not inside
//     article, aside, main, nav or section (the HTML rule for the implicit banner role);
//   - a link is an <a href>; its target is read as a same-origin path ("/calendar"), so an absolute href
//     to the same origin and a relative one compare equal;
//   - a sign-out control is a button or link whose accessible name is "Sign out" or "Log out" (any case);
//   - a date the product draws is English (CON-003): ISO 2027-04-05, "5 April 2027", "5 Apr", "April 5",
//     "Apr 5, 2027", 05/04/2027, 04/05/2027 or 05.04.2027 — digits never run into the match, so "5 Apr"
//     does not match inside "15 Apr";
//   - a record's row is found from what it must carry, never from the product's markup: the innermost
//     element carrying all of the record's keys, widened to the largest ancestor that carries no other
//     record's keys (a table row, a card, a list item — whatever the product draws).
import type { Locator, Page } from '@playwright/test';

/** One link on the page. `index` is its position among page.locator('a[href]'). */
export interface PageLink {
  index: number;
  /** Same-origin path without a trailing slash ("/" for the root), or the full URL for another origin. */
  path: string;
  /** The link's visible text, whitespace collapsed (its aria-label when it has no text). */
  text: string;
  visible: boolean;
  inBanner: boolean;
}

/** Every <a href> on the loaded page, in document order. */
export async function readLinks(page: Page): Promise<PageLink[]> {
  return page.locator('a[href]').evaluateAll((els) =>
    els.map((el, index) => {
      const href = el.getAttribute('href') ?? '';
      let path = href;
      try {
        const url = new URL(href, document.baseURI);
        path = url.origin === location.origin ? url.pathname.replace(/\/+$/, '') || '/' : url.href;
      } catch {
        /* an unparsable href stays as written */
      }
      const h = el as HTMLElement;
      const style = getComputedStyle(h);
      const rect = h.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      const roleBanner = h.closest('[role="banner"]');
      const header = h.closest('header');
      const inBanner = !!roleBanner || (!!header && !header.closest('article, aside, main, nav, section, [role="main"]'));
      const text = ((h.innerText || '').trim() || h.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      return { index, path, text, visible, inBanner };
    }),
  );
}

/** The visible links whose target path is exactly `path`. */
export function linksTo(links: PageLink[], path: string): PageLink[] {
  return links.filter((l) => l.visible && l.path === path);
}

/** The page's header: its banner landmark(s). A right page has exactly one. */
export function header(page: Page): Locator {
  return page.getByRole('banner');
}

/** The accessible name a sign-out control carries. */
export const SIGN_OUT_NAME = /^\s*(sign|log)\s*-?\s*out\s*$/i;

/** Sign-out controls (buttons or links named "Sign out" / "Log out") inside `scope` (the page by default). */
export function signOutControls(scope: Page | Locator): Locator {
  return scope.getByRole('button', { name: SIGN_OUT_NAME }).or(scope.getByRole('link', { name: SIGN_OUT_NAME }));
}

/** Text a not-found page shows in plain English. */
export const NOT_FOUND_TEXT = /not found|doesn['’]t exist|does not exist|no such page|could not be found|can['’]t be found|cannot be found/i;

/** Signs of a server error or a stack trace drawn on a page. */
export const SERVER_ERROR_TEXT =
  /\bat\s+[\w.$<>]+\s+\([^)]*:\d+:\d+\)|\.(?:m?js|ts|vue):\d+:\d+|\b(?:TypeError|ReferenceError|SyntaxError|H3Error|Internal Server Error)\b|\bstack ?trace\b/i;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Regex sources (case-insensitive) for the English renderings of an ISO day "YYYY-MM-DD" (see the header). */
export function datePatterns(isoDay: string): string[] {
  const [y, m, d] = isoDay.split('-').map(Number);
  const full = MONTHS[m - 1];
  const abbr = full.slice(0, 3);
  const month = `(?:${full}|${abbr === 'Sep' ? 'Sept?' : abbr}\\.?)`;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const nd = '(?<!\\d)';
  const na = '(?!\\d)';
  const ord = '(?:st|nd|rd|th)?';
  return [
    `${nd}${y}-${mm}-${dd}${na}`,
    `${nd}0?${d}${ord}\\s+(?:of\\s+)?${month}(?![a-z])`,
    `(?<![a-z])${month}\\s+0?${d}${ord}${na}`,
    `${nd}0?${d}/0?${m}/${y}${na}`,
    `${nd}0?${m}/0?${d}/${y}${na}`,
    `${nd}0?${d}\\.0?${m}\\.${y}${na}`,
  ];
}

/** True when `text` carries the ISO day in one of its English renderings. */
export function hasDate(text: string, isoDay: string): boolean {
  return datePatterns(isoDay).some((src) => new RegExp(src, 'i').test(text));
}

/** `text` with every rendering of the given days removed (so a number search does not read a day of the month). */
export function withoutDates(text: string, isoDays: string[]): string {
  let out = text;
  for (const day of isoDays) for (const src of datePatterns(day)) out = out.replace(new RegExp(src, 'gi'), ' ');
  return out;
}

/** `text` with every occurrence of the given literal strings removed (names and emails carry run-id digits). */
export function withoutLiterals(text: string, literals: string[]): string {
  let out = text;
  for (const lit of literals) out = out.split(lit).join(' ');
  return out;
}

/** True when `text` carries `n` as a whole number (digits never run into it; a leading minus is read as part of it). */
export function hasNumber(text: string, n: number): boolean {
  const src = n < 0 ? `(?<![\\d])[-−]\\s?${Math.abs(n)}(?!\\d)` : `(?<![\\d−-])${n}(?!\\d)`;
  return new RegExp(src).test(text);
}

/** Escapes a literal for use inside a regex source. */
export function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A record to find on the page: `keys` are groups of regex sources (case-insensitive); every group must match. */
export interface RowSpec {
  key: string;
  keys: string[][];
}

/** What findRows found for one record. */
export interface FoundRow {
  key: string;
  found: boolean;
  /** The record's keys are carried by more than one separate place on the page. */
  repeated: boolean;
  /** The row's visible text (innerText). */
  text: string;
  /** The row's position among the found rows, in document order (-1 when not found). */
  order: number;
  /** The controls inside the row: links, buttons, switches and form fields, with their accessible names. */
  controls: RowControl[];
}

/** A control inside a found row. `checked` is set for a checkbox, a radio or an ARIA switch / checkbox. */
export interface RowControl {
  name: string;
  tag: string;
  role: string | null;
  checked: boolean | null;
}

/**
 * Finds each record's row on the loaded page (see the header): the innermost visible element whose text carries all of
 * the record's keys, widened to the largest ancestor that carries no other record's keys. Pass every record the page
 * should show together, so each row is bounded by its neighbours.
 */
export async function findRows(page: Page, specs: RowSpec[]): Promise<FoundRow[]> {
  return page.evaluate((input) => {
    const compiled = input.map((s) => s.keys.map((g) => g.map((src) => new RegExp(src, 'i'))));
    const cache = new Map<Element, string>();
    const text = (el: Element): string => {
      let t = cache.get(el);
      if (t === undefined) {
        t = (el as HTMLElement).innerText ?? el.textContent ?? '';
        cache.set(el, t);
      }
      return t;
    };
    const rendered = (el: Element): boolean => {
      const h = el as HTMLElement & { checkVisibility?: () => boolean };
      if (typeof h.checkVisibility === 'function') return h.checkVisibility();
      return h.getClientRects().length > 0;
    };
    const carries = (el: Element, k: number) => compiled[k].every((g) => g.some((r) => r.test(text(el))));
    const rows: { key: string; el: Element | null; repeated: boolean }[] = input.map((spec, k) => {
      let el: Element = document.body;
      if (!carries(el, k)) return { key: spec.key, el: null, repeated: false };
      let repeated = false;
      for (;;) {
        const kids = Array.from(el.children).filter((c) => rendered(c) && carries(c, k));
        if (kids.length === 0) break;
        if (kids.length > 1) {
          repeated = true;
          break;
        }
        el = kids[0];
      }
      let cur = el;
      while (cur.parentElement && cur.parentElement !== document.body && cur.parentElement !== document.documentElement) {
        const parent = cur.parentElement;
        if (input.some((_, j) => j !== k && carries(parent, j))) break;
        cur = parent;
      }
      return { key: spec.key, el: cur, repeated };
    });
    const found = rows.filter((r) => r.el !== null) as { key: string; el: Element; repeated: boolean }[];
    const sorted = [...found].sort((a, b) =>
      a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const controlsOf = (row: Element) =>
      Array.from(
        row.querySelectorAll('a[href], button, [role="button"], [role="link"], [role="switch"], [role="checkbox"], input, select, textarea'),
      )
        .filter((c) => !(c instanceof HTMLInputElement && c.type === 'hidden'))
        .map((c) => {
          const h = c as HTMLElement;
          const labelled = c.id ? document.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null;
          const wrapping = c.closest('label');
          const name = (
            (h.innerText || '').trim() ||
            c.getAttribute('aria-label') ||
            (labelled as HTMLElement | null)?.innerText ||
            (wrapping as HTMLElement | null)?.innerText ||
            c.getAttribute('value') ||
            c.getAttribute('title') ||
            ''
          )
            .replace(/\s+/g, ' ')
            .trim();
          const role = c.getAttribute('role');
          let checked: boolean | null = null;
          if (c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')) checked = c.checked;
          else if (role === 'switch' || role === 'checkbox') checked = c.getAttribute('aria-checked') === 'true';
          return { name, tag: c.tagName.toLowerCase(), role, checked };
        });
    return rows.map((r) => ({
      key: r.key,
      found: r.el !== null,
      repeated: r.repeated,
      text: r.el ? text(r.el) : '',
      order: r.el ? sorted.findIndex((s) => s.key === r.key) : -1,
      controls: r.el ? controlsOf(r.el) : [],
    }));
  }, specs);
}
