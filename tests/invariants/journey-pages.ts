// Purpose: shared page readers for the browser journey tests (ROW-120, ROW-121) — a request or account item found by what it says, its text without its controls, a year's days-left figures, a month calendar's names per day, the confirmation step of the admin's four confirmed actions, and the contracted API reads a journey checks its effects against.
// Provenance: hand-authored (test-author pass, slice 0, journeys batch test-author-9); reaches the product only through harness.ts, the engine door's pages and the routes of D-029; reads no application code; asserts nothing about any row.
//
// No design pack names the pages' elements (the journeys' briefs carry no design state), so these readers find
// things by what the page says, never by a class or a test id the product would have to invent:
//   - an ITEM is the innermost list item or table row (li, tr, role listitem or row, article) whose visible text
//     carries every given string and matches every given pattern;
//   - an item's PLAIN text is its text with its controls (buttons, links, form fields) removed, so a "Cancel" button
//     never reads as a cancelled state and a "Switch off" button never reads as switched off;
//   - a DAY is named in a text by its day-of-month as a number of its own (11, 11th, 2027-03-11) beside its month
//     (Mar, March, -03-, /03/); a confirmation or an item is read for the days it names that way;
//   - a YEAR's figures are the smallest visible element that says "days left" and that year and not the other year,
//     or, when one element holds both years, its text from that year's label to the other year's;
//   - a calendar DAY CELL is the largest element that carries exactly one day of the shown month: by a datetime,
//     data-date, aria-label or title attribute holding the ISO date, or by its own text holding one day number;
//   - a CONFIRMATION is a native dialog's message, or else the text around the visible button named Confirm (or
//     Yes …): its nearest ancestor that names the person, never climbing out of a dialog.
import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';
import { anonymousApi, SetupError, type AccountId, type Actor } from './harness';

/** The elements an item can be. */
export const ITEM_SELECTOR = 'tr, li, [role="row"], [role="listitem"], article';

/** The month patterns a day is named with, as regex sources (case-insensitive). */
const MONTHS = ['jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may', 'june?', 'july?', 'aug(?:ust)?', 'sep(?:t(?:ember)?)?', 'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?'];

/** A regex source matching day-of-month `d` as a number of its own (optionally zero-padded, optionally 11th). */
export function dayToken(d: number): string {
  return `(?:^|[^0-9])0?${d}(?:st|nd|rd|th)?(?:[^0-9]|$)`;
}

/** A regex source matching month `m` (1–12) written as a name or as the middle of a numeric date. */
export function monthToken(m: number): string {
  const mm = String(m).padStart(2, '0');
  return `(?:\\b${MONTHS[m - 1]}\\b|-${mm}-|/0?${m}/|\\.0?${m}\\.)`;
}

/** The patterns that say a text names the day `iso` (YYYY-MM-DD): its day number of its own and its month. */
export function namesDay(iso: string): string[] {
  const [, m, d] = iso.split('-').map(Number);
  return [dayToken(d), monthToken(m)];
}

/** True when `text` names the day `iso` (see namesDay), or carries the ISO date itself. */
export function textNamesDay(text: string, iso: string): boolean {
  if (text.includes(iso)) return true;
  return namesDay(iso).every((p) => new RegExp(p, 'i').test(text));
}

/**
 * True when `n` stands in `text` as a number of its own: not part of a longer number, not a date's part after a
 * dash or a dot, and a positive n not read out of a negative one.
 */
export function hasNumber(text: string, n: number): boolean {
  const digits = String(Math.abs(n));
  const re = n < 0 ? `(?<![0-9.])[-−]${digits}(?![0-9])` : `(?<![0-9.\\-−])${digits}(?![0-9])`;
  return new RegExp(re).test(text);
}

/** What an item must carry: exact strings, and regex sources matched case-insensitively. */
export interface ItemMatch {
  includes?: string[];
  patterns?: string[];
}

/** One item as read now: its index among page.locator(ITEM_SELECTOR), its visible text and its plain text. */
export interface ItemRead {
  index: number;
  text: string;
  plain: string;
}

/** Reads every innermost visible item matching `match`, in document order, in one evaluate. */
export async function readItems(page: Page, match: ItemMatch): Promise<ItemRead[]> {
  return page.locator(ITEM_SELECTOR).evaluateAll(
    (els, m) => {
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      const plainOf = (el: Element) => {
        const copy = el.cloneNode(true) as Element;
        copy.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]').forEach((c) => c.remove());
        return norm(copy.textContent || '');
      };
      const ok = (el: Element) => {
        if (el.getClientRects().length === 0) return false;
        const t = norm((el as HTMLElement).innerText || '');
        return (m.includes || []).every((s) => t.includes(s)) && (m.patterns || []).every((p) => new RegExp(p, 'i').test(t));
      };
      const hits = els.map((el, index) => ({ el, index })).filter((h) => ok(h.el));
      return hits
        .filter((h) => !hits.some((o) => o.el !== h.el && h.el.contains(o.el)))
        .map((h) => ({ index: h.index, text: norm((h.el as HTMLElement).innerText || ''), plain: plainOf(h.el) }));
    },
    match,
  );
}

/** Waits (bounded poll) until exactly `count` items match, then returns them. Fails naming `what` otherwise. */
export async function waitItems(page: Page, match: ItemMatch, count: number, what: string, timeoutMs = 10_000): Promise<ItemRead[]> {
  let last: ItemRead[] = [];
  await expect
    .poll(
      async () => {
        last = await readItems(page, match);
        return last.length;
      },
      { message: `${what}: expected exactly ${count} matching item(s)`, timeout: timeoutMs },
    )
    .toBe(count);
  return last;
}

/** The live locator of an item read by readItems (use it at once: a re-render may move the index). */
export function itemLocator(page: Page, item: ItemRead): Locator {
  return page.locator(ITEM_SELECTOR).nth(item.index);
}

/** A button or a link whose accessible name matches `name`, inside `scope`, visible. */
export function control(scope: Page | Locator, name: RegExp): Locator {
  return scope.getByRole('button', { name }).or(scope.getByRole('link', { name })).filter({ visible: true });
}

/** The numbers standing in `text` (whole numbers, a leading minus kept), the given years left out. */
export function numbersIn(text: string, leaveOut: number[] = []): number[] {
  return (text.match(/[-−]?\d+/g) || []).map((s) => Number(s.replace('−', '-'))).filter((n) => !leaveOut.includes(n));
}

/** Waits until `page`'s path is `path` (bounded). */
export async function expectPath(page: Page, path: string, message: string, timeoutMs = 15_000): Promise<void> {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page, message).toHaveURL(new RegExp(`^[a-z]+://[^/]+${escaped}(?:[?#].*)?$`), { timeout: timeoutMs });
}

/**
 * A year's figures as the page shows them (see the header): the text of the smallest visible element saying
 * "days left", `year` and not `otherYear`; else, in the smallest one saying "days left" and both years, the text from
 * `year`'s label up to `otherYear`'s. A table row's text is read with its table's header row in front. Null when the
 * page says neither.
 */
export async function yearFigures(page: Page, year: number, otherYear: number): Promise<string | null> {
  return page.evaluate(
    ({ year, otherYear }) => {
      const y = String(year);
      const o = String(otherYear);
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      const textOf = (el: Element) => {
        let t = norm((el as HTMLElement).innerText || '');
        if (el.tagName === 'TR') {
          const head = el.closest('table')?.querySelector('thead');
          if (head && !head.contains(el)) t = `${norm((head as HTMLElement).innerText || '')} ${t}`;
        }
        return t;
      };
      const label = /days?\s+left/i;
      const all = Array.from(document.body.querySelectorAll('*')).filter((el) => el.getClientRects().length > 0);
      const cands = all.map((el) => ({ el, t: textOf(el) })).filter((c) => label.test(c.t) && c.t.includes(y));
      const solo = cands.filter((c) => !c.t.includes(o)).sort((a, b) => a.t.length - b.t.length);
      if (solo.length) return solo[0].t;
      const both = cands.sort((a, b) => a.t.length - b.t.length);
      if (!both.length) return null;
      const t = both[0].t;
      const i = t.indexOf(y);
      const j = t.indexOf(o, i + y.length);
      return j > i ? t.slice(i, j) : t.slice(i);
    },
    { year, otherYear },
  );
}

/** A month calendar as read from the page: for each name, the days of the month whose day cell lists it, and each day cell's text. */
export interface CalendarRead {
  daysOf: Record<string, number[]>;
  cells: Record<number, string>;
}

/** Reads the shown month calendar for `isoMonth` ("2027-03") — day cells per the header — and the days each name is listed on. */
export async function readCalendar(page: Page, isoMonth: string, names: string[]): Promise<CalendarRead> {
  return page.evaluate(
    ({ isoMonth, names }) => {
      const all = Array.from(document.body.querySelectorAll('*')).filter((el) => el.getClientRects().length > 0);
      const isoRe = new RegExp(`${isoMonth}-(\\d{2})`);
      const own = (el: Element): number => {
        let mask = 0;
        for (const a of ['datetime', 'data-date', 'aria-label', 'title']) {
          const v = el.getAttribute(a);
          const m = v ? v.match(isoRe) : null;
          if (m) mask |= 1 << (Number(m[1]) - 1);
        }
        let direct = '';
        el.childNodes.forEach((n) => {
          if (n.nodeType === 3) direct += n.textContent || '';
        });
        direct = direct.trim();
        if (direct && direct.length <= 40) {
          const toks = Array.from(direct.matchAll(/(?<![0-9A-Za-z])(\d{1,2})(?:st|nd|rd|th)?(?![0-9A-Za-z])/g))
            .map((x) => Number(x[1]))
            .filter((n) => n >= 1 && n <= 31);
          if (toks.length === 1) mask |= 1 << (toks[0] - 1);
        }
        return mask;
      };
      const union = new Map<Element, number>();
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const el = all[i];
        let mask = own(el);
        for (const child of Array.from(el.children)) mask |= union.get(child) || 0;
        union.set(el, mask);
      }
      const single = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;
      const cells: Record<number, string> = {};
      for (const el of all) {
        const mask = union.get(el) || 0;
        if (!single(mask)) continue;
        const parent = el.parentElement;
        if (parent && union.get(parent) === mask) continue;
        const day = Math.round(Math.log2(mask)) + 1;
        const text = ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        cells[day] = cells[day] ? `${cells[day]} | ${text}` : text;
      }
      const daysOf: Record<string, number[]> = {};
      for (const name of names) {
        daysOf[name] = Object.keys(cells)
          .map(Number)
          .filter((d) => cells[d].includes(name))
          .sort((a, b) => a - b);
      }
      return { daysOf, cells };
    },
    { isoMonth, names },
  );
}

/** Records every native dialog the page opens (alert, confirm) and accepts it; returns the messages seen so far. */
export function recordDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', async (d) => {
    seen.push(d.message());
    await d.accept().catch(() => undefined);
  });
  return seen;
}

/** The name of the button that confirms a confirmation step. */
export const CONFIRM_NAME = /^(confirm|yes)\b/i;

/** A confirmation step that has been shown: what it says and how to confirm it. */
export interface ShownConfirmation {
  via: 'native dialog' | 'page';
  text: string;
  /** Confirms (clicks the Confirm button; a native dialog was already accepted). */
  confirm(): Promise<void>;
}

/**
 * Waits (bounded) for the confirmation step an action control opened — a native dialog seen after `dialogsBefore`
 * messages, or a visible Confirm/Yes button — and reads what it says (see the header). Throws a plain Error naming
 * `what` when no confirmation step appears.
 */
export async function awaitConfirmation(
  page: Page,
  dialogs: string[],
  dialogsBefore: number,
  personName: string,
  what: string,
  timeoutMs = 10_000,
): Promise<ShownConfirmation> {
  const button = page.getByRole('button', { name: CONFIRM_NAME }).filter({ visible: true });
  try {
    await expect
      .poll(async () => dialogs.length > dialogsBefore || (await button.count()) > 0, { timeout: timeoutMs })
      .toBe(true);
  } catch {
    throw new Error(`${what}: no confirmation step (no native dialog and no visible button named Confirm or Yes) after the action control`);
  }
  if (dialogs.length > dialogsBefore) {
    return { via: 'native dialog', text: dialogs.slice(dialogsBefore).join(' | '), confirm: async () => undefined };
  }
  const first = button.first();
  const text = await first.evaluate((el, name) => {
    let e: Element | null = el;
    while (e) {
      const t = ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
      if (t.includes(name)) return t;
      if (e.matches('dialog, [role="dialog"], [role="alertdialog"]')) return t;
      e = e.parentElement;
    }
    return ((el as HTMLElement).innerText || '').trim();
  }, personName);
  return { via: 'page', text, confirm: () => first.click() };
}

/** The status POST /api/auth/sign-in answers for these credentials, on a fresh anonymous context (disposed). */
export async function signInStatus(email: string, password: string): Promise<number> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).status();
  } finally {
    await api.dispose();
  }
}

async function jsonOf(res: APIResponse, what: string): Promise<unknown> {
  if (!res.ok()) throw new SetupError(`${what} answered ${res.status()}`);
  try {
    return await res.json();
  } catch {
    throw new SetupError(`${what} answered without a JSON body`);
  }
}

/**
 * The days of `year`-`month` on which GET /api/calendar?year&month (D-029: {days:[{date,people:[{name,accountId}]}]})
 * lists the person — by accountId when the entry carries one, else by display name. Read on `viewer`'s session.
 */
export async function calendarApiDays(viewer: Actor, year: number, month: number, person: { id: AccountId; name: string }): Promise<number[]> {
  const route = `/api/calendar?year=${year}&month=${month}`;
  const body = (await jsonOf(await viewer.api.get(route), `GET ${route}`)) as { days?: { date: string; people?: { name?: string; accountId?: AccountId }[] }[] };
  if (!body || !Array.isArray(body.days)) throw new SetupError(`GET ${route} answered without a days list`);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return body.days
    .filter((d) => typeof d.date === 'string' && d.date.startsWith(prefix))
    .filter((d) =>
      (d.people || []).some((p) =>
        p.accountId !== undefined && p.accountId !== null ? String(p.accountId) === String(person.id) : p.name === person.name,
      ),
    )
    .map((d) => Number(d.date.slice(8, 10)))
    .sort((a, b) => a - b);
}

/**
 * The id of the one pending request whose fields carry `firstDay` on the admin's GET /api/admin/pending (D-029 names
 * the route, not its body: any object with an id and a field equal to `firstDay` is read as a request). Setup only:
 * a SetupError when not exactly one is found.
 */
export async function pendingRequestId(admin: Actor, firstDay: string): Promise<AccountId> {
  const body = await jsonOf(await admin.api.get('/api/admin/pending'), 'GET /api/admin/pending');
  const found: AccountId[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ((typeof o.id === 'string' || typeof o.id === 'number') && Object.values(o).includes(firstDay)) found.push(o.id);
      Object.values(o).forEach(walk);
    }
  };
  walk(body);
  const unique = Array.from(new Set(found.map(String)));
  if (unique.length !== 1) throw new SetupError(`GET /api/admin/pending: expected one pending request starting ${firstDay}, found ${unique.length}`);
  return found[0];
}
