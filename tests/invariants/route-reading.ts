// Purpose: shared page readers for the route reachability rows (ROW-280 to ROW-286) — open one of D-029's pages in a browser context and read what it answered: the document's status, the path the browser ends on, the header landmarks, not-found or server-error text, and the text drawn outside the header.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-1); a public harness boundary beside harness.ts and page-reading.ts. It reads only the loaded page, never application source, and asserts nothing about any row.
//
// Readings, all public and accessible, none a design marker:
//   - the header is the page's banner landmark, by the rule page-reading.ts states: an element with role="banner", or
//     a <header> not inside article, aside, main, nav or section; nested banners count once (the outermost);
//   - the CONTENT of a page is its visible text with every header's text taken out, so a name the header shows (the
//     signed-in person's) never reads as something the page itself draws; the values shown in its visible text
//     fields outside the header (never a password field's) are added as lines of their own, since a value drawn in
//     an editable field is drawn too;
//   - a page is NOT FOUND or a SERVER ERROR when its visible text carries page-reading.ts's NOT_FOUND_TEXT or
//     SERVER_ERROR_TEXT;
//   - waits are bounded (Playwright's load states and expect.poll), never fixed sleeps.
import { expect, type Page } from '@playwright/test';
import { NOT_FOUND_TEXT, SERVER_ERROR_TEXT } from './page-reading';

/** What a route answered and drew, read once. */
export interface RouteRead {
  /** The document's HTTP status (0 when the navigation answered none). */
  status: number;
  /** The path the browser ends on, without a trailing slash ("/" for the root). */
  path: string;
  /** Visible banner landmarks (the header), outermost only. A page inside the header has exactly one. */
  banners: number;
  /** The visible text with the header's text taken out, whitespace runs inside a line collapsed. */
  content: string;
  /** The visible text reads as a not-found page. */
  notFound: boolean;
  /** The visible text reads as a server error or a stack trace. */
  serverError: boolean;
}

/** The path of the page's current URL, without a trailing slash ("/" for the root). */
export function currentPath(page: Page): string {
  return new URL(page.url()).pathname.replace(/\/+$/, '') || '/';
}

/** Reads the loaded page now (see the header for the readings). */
export async function readRoute(page: Page): Promise<Omit<RouteRead, 'status'>> {
  const read = await page
    .evaluate(() => {
      const visible = (el: Element) => {
        const h = el as HTMLElement & { checkVisibility?: () => boolean };
        if (typeof h.checkVisibility === 'function') return h.checkVisibility();
        return h.getClientRects().length > 0;
      };
      const isBanner = (el: Element) =>
        el.getAttribute('role') === 'banner' ||
        (el.tagName === 'HEADER' && !el.parentElement?.closest('article, aside, main, nav, section, [role="main"]'));
      const candidates = Array.from(document.querySelectorAll('[role="banner"], header')).filter(isBanner);
      const outer = candidates.filter((el) => !candidates.some((o) => o !== el && o.contains(el))).filter(visible);
      const body = document.body?.innerText ?? '';
      let content = body;
      for (const b of outer) {
        const t = (b as HTMLElement).innerText ?? '';
        if (t.trim() !== '') content = content.replace(t, '\n');
      }
      const values = Array.from(document.querySelectorAll('input, textarea'))
        .filter((el) => {
          const type = (el.getAttribute('type') ?? 'text').toLowerCase();
          return !['password', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file'].includes(type);
        })
        .filter((el) => visible(el) && !outer.some((b) => b.contains(el)))
        .map((el) => (el as HTMLInputElement).value)
        .filter((v) => v.trim() !== '');
      if (values.length > 0) content = `${content}\n${values.join('\n')}`;
      return { banners: outer.length, body, content };
    })
    .catch(() => ({ banners: 0, body: '', content: '' }));
  const tidy = (s: string) =>
    s
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l !== '')
      .join('\n');
  return {
    path: currentPath(page),
    banners: read.banners,
    content: tidy(read.content),
    notFound: NOT_FOUND_TEXT.test(read.body),
    serverError: SERVER_ERROR_TEXT.test(read.body),
  };
}

/** Loads `address`, waits (bounded) for the network to settle, and reads the page. */
export async function openRoute(page: Page, address: string): Promise<RouteRead> {
  const response = await page.goto(address).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return { status: response?.status() ?? 0, ...(await readRoute(page)) };
}

/**
 * What keeps a read from being `route`'s own page drawn inside the header, in plain words (empty when nothing does):
 * a status other than 200, the browser ending on another path (a redirect to /sign-in or /password), a not-found or
 * server-error page, a header count other than one, nothing drawn outside the header.
 */
export function routeProblems(read: RouteRead, route: string): string[] {
  const out: string[] = [];
  if (read.status !== 200) out.push(`${route} answered ${read.status}, not 200`);
  if (read.path !== route) out.push(`the browser ended on ${read.path}, not ${route}`);
  if (read.notFound) out.push(`${route} draws a not-found page`);
  if (read.serverError) out.push(`${route} draws a server error`);
  if (read.banners !== 1) out.push(`${route} draws ${read.banners} headers (banner landmarks), not one`);
  if (read.content.trim() === '') out.push(`${route} draws nothing outside the header`);
  return out;
}

/**
 * Waits (bounded poll) until the page's content (text outside the header) satisfies `want`, and returns the last
 * content read — whether or not it came to satisfy it, so the caller asserts on it and names the row.
 */
export async function contentWhen(page: Page, want: (content: string) => boolean, timeoutMs = 10_000): Promise<string> {
  let last = '';
  await expect
    .poll(
      async () => {
        last = (await readRoute(page)).content;
        return want(last);
      },
      { timeout: timeoutMs },
    )
    .toBe(true)
    .catch(() => undefined);
  return last;
}
