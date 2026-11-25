// Purpose: shared browser readers for what a person's own requests page "/" offers on each request (REQ-029) — the request's row found by its days, the cancel controls it carries, whether it says only the admin can cancel it or that the admin decides it — and the confirmation step a page action opens, with its confirm and its decline; used by the ledger tests of ROW-288 to ROW-294.
// Provenance: hand-authored (test-author pass, fix-2026-11-25, brief test-author-1); a public harness boundary beside harness.ts, page-reading.ts and own-page.ts. It reads only the loaded page, never application source, and asserts no row by itself.
//
// Readings, stated once here (no design state names this page's elements, so nothing is read by a class or a test
// id the product would have to invent):
//   - a request's ROW is the outermost visible element that carries the request's first day and its last day (in an
//     English rendering, page-reading.ts datePatterns) and carries no other listed request's first day — a table
//     row, a list item, a card: whatever the product draws. Pass every request the page shows, so each row is
//     bounded by its neighbours, and choose the data so no act's date (sent, decided, cancelled, cancelled from) is
//     another listed request's first day;
//   - a CANCEL CONTROL is a button or a link inside the row, exposed to assistive technology (a hidden one is not
//     offered), whose accessible name carries the word "cancel" on its own ("Cancel", "Cancel request", "Cancel
//     days"; never "Cancelled");
//   - a row's TEXT is its innerText, whitespace collapsed — what the person reads without operating anything;
//   - a row SAYS ONLY THE ADMIN CAN CANCEL IT when its text carries one of ONLY_ADMIN_CANCELS: the admin (the word
//     admin or administrator, or the admin's display name when given) tied to cancelling by "only", by "ask" or
//     "contact", or by can / must / will / could — never "may", which is also a month ("Only the admin can cancel
//     this", "You can't cancel it; only the admin can", "Can be cancelled only by Ines", "Ask the admin to cancel
//     it");
//   - a row SAYS THE ADMIN DECIDES IT when its text carries one of ADMIN_DECIDES: the admin with decide / decides /
//     deciding (never the past "decided", which tells who decided a decided request), with "approve or reject", with
//     "waiting / awaiting … decision", or "up to the admin" ("The admin decides it", "Waiting for the admin's
//     decision", "Only the admin can approve or reject it");
//   - a CONFIRMATION STEP is what operating an action's control opens before anything is done: the browser's own
//     dialog (window.confirm), a visible element with the dialog or alertdialog role, or — inline — a visible
//     button named Confirm or Yes that was not on the page before. Its text is the dialog's message, or the
//     element's text without its buttons' names (inline: the nearest ancestor of the Confirm button that names one
//     of the given days, likewise without buttons), so an exit named "Keep" never reads as a word. Its CONFIRM is the
//     dialog accepted, or the button named Confirm / Yes / OK, or failing those one naming the action ("Cancel
//     days"); its DECLINE is the dialog dismissed, or a button named No, Back, Keep…, Don't…, Close, Not now,
//     Dismiss, Never mind or a bare "Cancel", or failing those the Escape key — after which the step must be gone.
import { expect, type Browser, type Dialog, type Locator, type Page } from '@playwright/test';
import { openPage, type Actor } from './harness';
import { datePatterns, literal } from './page-reading';

/** A request to find on a page: a label for messages, its first and last day (YYYY-MM-DD). */
export interface DayRange {
  label: string;
  firstDay: string;
  lastDay: string;
}

/** What one request's row offers and says, as read on the loaded page. */
export interface ActionRow {
  label: string;
  found: boolean;
  /** Visible text, whitespace collapsed ('' when not found). */
  text: string;
  /** The accessible names of the cancel controls the row carries (empty when none, or when not found). */
  cancelControls: string[];
}

/** What one load of "/" gave. */
export interface ActionPage {
  status: number;
  path: string;
  rows: ActionRow[];
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function anyOf(sources: string[]): RegExp {
  return new RegExp(sources.map((s) => `(?:${s})`).join('|'), 'i');
}

/** The accessible name a cancel control carries: the word "cancel" on its own. */
export const CANCEL_CONTROL_NAME = /(?<![a-z])cancel(?![a-z])/i;

/** The row of `spec` on the loaded page (see the header); `all` is every request the page should show. */
export function requestRow(page: Page, spec: DayRange, all: DayRange[]): Locator {
  let row = page
    .locator('body *')
    .filter({ visible: true })
    .filter({ hasText: anyOf(datePatterns(spec.firstDay)) })
    .filter({ hasText: anyOf(datePatterns(spec.lastDay)) });
  for (const other of all) {
    if (other === spec || other.label === spec.label) continue;
    const mark = [other.firstDay, other.lastDay].find((d) => d !== spec.firstDay && d !== spec.lastDay);
    if (mark) row = row.filter({ hasNotText: anyOf(datePatterns(mark)) });
  }
  return row.first();
}

/** The cancel controls inside a row (buttons and links exposed to assistive technology). */
export function cancelControlsIn(row: Locator): Locator {
  return row.getByRole('button', { name: CANCEL_CONTROL_NAME }).or(row.getByRole('link', { name: CANCEL_CONTROL_NAME }));
}

/**
 * Reads every spec's row on the loaded page: polls (bounded, no sleep) until each row is found or `timeoutMs` passes,
 * then reads each row's text and cancel controls.
 */
export async function readActionRows(page: Page, specs: DayRange[], timeoutMs = 15_000): Promise<ActionRow[]> {
  const countFound = async () => {
    let n = 0;
    for (const s of specs) if ((await requestRow(page, s, specs).count()) > 0) n += 1;
    return n;
  };
  await expect.poll(countFound, { timeout: timeoutMs }).toBe(specs.length).catch(() => undefined);
  const rows: ActionRow[] = [];
  for (const s of specs) {
    const row = requestRow(page, s, specs);
    if ((await row.count()) === 0) {
      rows.push({ label: s.label, found: false, text: '', cancelControls: [] });
      continue;
    }
    const text = norm(await row.innerText());
    const cancelControls = await cancelControlsIn(row).evaluateAll((els) =>
      els.map((e) =>
        (
          (e as HTMLElement).innerText ||
          e.getAttribute('aria-label') ||
          e.getAttribute('value') ||
          e.getAttribute('title') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    );
    rows.push({ label: s.label, found: true, text, cancelControls });
  }
  return rows;
}

/**
 * Opens "/" as `actor` through the engine door, waits (bounded) for the network to settle, reads every spec's row
 * (readActionRows) and closes the page. The status is the document's; the path is where the page landed.
 */
export async function readOwnActions(browser: Browser, actor: Actor, specs: DayRange[]): Promise<ActionPage> {
  const opened = await openPage(browser, actor);
  try {
    const response = await opened.page.goto('/');
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const rows = await readActionRows(opened.page, specs);
    return { status: response?.status() ?? 0, path: new URL(opened.page.url()).pathname, rows };
  } finally {
    await opened.close();
  }
}

/** The row read for `label`. */
export function actionRow(read: ActionPage, label: string): ActionRow {
  const row = read.rows.find((r) => r.label === label);
  if (!row) throw new Error(`no row was asked for "${label}"`);
  return row;
}

function adminToken(adminName?: string): string {
  const words = ['admin(?:istrator)?'];
  if (adminName && adminName.trim() !== '') words.push(literal(adminName.trim()));
  return `(?<![a-z])(?:${words.join('|')})(?:['’]s)?(?![a-z])`;
}

/** The wordings read as "only the admin can cancel it" (see the header). */
export function onlyAdminCancelsPatterns(adminName?: string): RegExp[] {
  const A = adminToken(adminName);
  return [
    `\\bonly\\b.{0,40}${A}.{0,60}\\bcancel`,
    `\\bcancel\\w*\\b.{0,80}\\bonly\\b.{0,20}${A}`,
    `\\bcancel\\w*\\b.{0,40}${A}\\s+only\\b`,
    `\\b(?:ask|contact)\\b.{0,30}${A}.{0,40}\\bcancel`,
    `\\bcancel\\w*\\b.{0,30}\\b(?:ask|contact)\\b.{0,20}${A}`,
    `${A}.{0,30}\\b(?:can|must|will|could)\\b.{0,20}\\bcancel`,
  ].map((s) => new RegExp(s, 'i'));
}

/** The wordings read as "the admin decides it" (see the header). */
export function adminDecidesPatterns(adminName?: string): RegExp[] {
  const A = adminToken(adminName);
  return [
    `${A}.{0,40}\\b(?:decide|decides|deciding)\\b`,
    `\\b(?:decide|decides|deciding)\\b.{0,40}${A}`,
    `${A}.{0,40}\\bapproves? or rejects?\\b`,
    `\\bapprove[sd]? or reject(?:s|ed)?\\b.{0,40}${A}`,
    `\\b(?:await\\w*|wait\\w*)\\b.{0,40}${A}.{0,20}\\bdecision\\b`,
    `\\bup to\\b.{0,10}${A}`,
  ].map((s) => new RegExp(s, 'i'));
}

/** True when the text says only the admin can cancel the request (ONLY_ADMIN_CANCELS, see the header). */
export function saysOnlyAdminCancels(text: string, adminName?: string): boolean {
  return onlyAdminCancelsPatterns(adminName).some((r) => r.test(text));
}

/** True when the text says the admin decides the request (ADMIN_DECIDES, see the header). */
export function saysAdminDecides(text: string, adminName?: string): boolean {
  return adminDecidesPatterns(adminName).some((r) => r.test(text));
}

// ---------------------------------------------------------------------------------------------------
// The confirmation step, with both its exits
// ---------------------------------------------------------------------------------------------------

/** An open confirmation step: what it shows, and its two exits. */
export interface ConfirmationStep {
  kind: 'native' | 'element' | 'inline';
  text: string;
  confirm(): Promise<void>;
  /** Declines the step and waits (bounded) until it is gone; fails the test, naming `what`, when it stays. */
  decline(): Promise<void>;
}

const CONFIRM_WORD = /\b(confirm|yes|ok)\b/i;
const INLINE_CONFIRM = /^\s*(confirm|yes)\b/i;
const DECLINE_NAME = /^\s*(no\b.*|back|go back|close|keep\b.*|don.?t\b.*|not now|dismiss|abort|never ?mind|cancel|×|x)\s*$/i;

async function buttonNames(scope: Locator): Promise<string[]> {
  return scope.getByRole('button').evaluateAll((els) =>
    els.map((e) => ((e as HTMLElement).innerText || e.getAttribute('aria-label') || e.getAttribute('value') || '').replace(/\s+/g, ' ').trim()),
  );
}

/**
 * Operates `trigger` and waits (bounded, no sleep) for the confirmation step it opens (see the header). Answers null
 * when none appears within `timeoutMs` — the control acted, or did nothing, without asking. `days` (YYYY-MM-DD) help
 * read an inline step's text. Fails the test, naming `what`, when the trigger is not on the page.
 */
export async function openConfirmationStep(
  page: Page,
  trigger: Locator,
  what: string,
  days: string[] = [],
  timeoutMs = 10_000,
): Promise<ConfirmationStep | null> {
  await expect(trigger, `${what}: the action's control is on the page`).toBeVisible({ timeout: timeoutMs });
  const element = page.getByRole('dialog').or(page.getByRole('alertdialog')).filter({ visible: true }).first();
  const inline = page.getByRole('button', { name: INLINE_CONFIRM }).filter({ visible: true });
  const inlineBefore = await inline.count();

  let nativeDialog: Dialog | null = null;
  const nativeP = page
    .waitForEvent('dialog', { timeout: timeoutMs })
    .then((d) => {
      nativeDialog = d;
      return 'native' as const;
    })
    .catch(() => null);
  const elementP = element
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => 'element' as const)
    .catch(() => null);
  const inlineP = expect
    .poll(async () => (await inline.count()) > inlineBefore, { timeout: timeoutMs })
    .toBe(true)
    .then(() => 'inline' as const)
    .catch(() => null);
  const clickP = trigger.click({ timeout: timeoutMs }).then(
    () => null,
    (e: Error) => e,
  );

  const kind = await new Promise<'native' | 'element' | 'inline' | null>((resolve) => {
    let left = 3;
    for (const p of [nativeP, elementP, inlineP]) {
      void p.then((v) => {
        if (v) resolve(v);
        else if (--left === 0) resolve(null);
      });
    }
  });
  if (kind === null) {
    await clickP;
    return null;
  }

  if (kind === 'native') {
    const d = nativeDialog as unknown as Dialog;
    return {
      kind,
      text: d.message(),
      confirm: async () => {
        await d.accept();
        await clickP;
      },
      decline: async () => {
        await d.dismiss();
        await clickP;
      },
    };
  }

  await clickP;
  const scope: Locator = kind === 'element' ? element : page.locator('body');
  let text: string;
  if (kind === 'element') {
    // The step's own words, without its buttons' names ("Keep", "Cancel days" are exits, not what it says).
    text = norm(
      await element.evaluate((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('button, [role="button"]').forEach((b) => b.remove());
        return copy.textContent ?? '';
      }),
    );
  } else {
    const sources = days.flatMap((d) => datePatterns(d));
    text = norm(
      await inline.last().evaluate((el, srcs) => {
        const res = srcs.map((s) => new RegExp(s, 'i'));
        let e: Element | null = el;
        while (e && e !== document.body) {
          const copy = e.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('button, [role="button"]').forEach((b) => b.remove());
          const t = copy.textContent || '';
          if (res.some((r) => r.test(t))) return t;
          e = e.parentElement;
        }
        return ((el.parentElement as HTMLElement | null)?.textContent || '').trim();
      }, sources),
    );
  }

  const gone = async (label: string) => {
    if (kind === 'element') {
      await expect(element, `${what}: the confirmation step is gone after it is ${label}`).toBeHidden({ timeout: timeoutMs });
    } else {
      await expect
        .poll(async () => inline.count(), { message: `${what}: the confirmation step is gone after it is ${label}`, timeout: timeoutMs })
        .toBeLessThanOrEqual(inlineBefore);
    }
  };

  return {
    kind,
    text,
    confirm: async () => {
      if (kind === 'inline') {
        await inline.last().click({ timeout: timeoutMs });
        return;
      }
      const names = await buttonNames(scope);
      let i = names.findIndex((n) => CONFIRM_WORD.test(n) && !DECLINE_NAME.test(n));
      if (i < 0) i = names.findIndex((n) => CANCEL_CONTROL_NAME.test(n) && !DECLINE_NAME.test(n));
      expect(i, `${what}: the confirmation offers a confirming button (buttons: ${names.map((n) => JSON.stringify(n)).join(', ') || 'none'})`).toBeGreaterThanOrEqual(0);
      await scope.getByRole('button').nth(i).click({ timeout: timeoutMs });
    },
    decline: async () => {
      const declineScope = kind === 'element' ? element : page.locator('body');
      const names = await buttonNames(declineScope);
      const confirming = names.some((n) => CONFIRM_WORD.test(n) || (CANCEL_CONTROL_NAME.test(n) && !DECLINE_NAME.test(n)));
      let i = names.findIndex((n) => DECLINE_NAME.test(n) && !/^\s*cancel\s*$/i.test(n));
      if (i < 0 && confirming) i = names.findIndex((n) => /^\s*cancel\s*$/i.test(n));
      if (kind === 'inline' && i >= 0) {
        // On the page itself a bare "Cancel" may be another request's control; only a named decline is used inline.
        if (/^\s*cancel\s*$/i.test(names[i])) i = -1;
      }
      if (i >= 0) await declineScope.getByRole('button').nth(i).click({ timeout: timeoutMs });
      else await page.keyboard.press('Escape');
      await gone('declined');
    },
  };
}
