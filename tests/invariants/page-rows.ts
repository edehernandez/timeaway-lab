// Purpose: shared browser helpers for the admin's and a person's list pages — find the one row that shows a given person or month, operate a row action through its confirmation step, and load a page until it settles; used by the ledger tests of ROW-192, ROW-193 and ROW-204.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12), from DECISIONS.md D-029 (the pages; the four confirmed actions in two steps; forms in plain words) and REQ-006/REQ-008/REQ-020/REQ-021 (what each row shows).
//
// No design states exist for these pages yet, so a row is any table row, list item or article, and a row action is
// a button named in the plain words of the PRD (Approve, Reject, Cancel, Switch off). The confirmation step is a
// dialog (or a native confirm) whose confirming button is found by its plain-word name. Each helper is bounded by
// Playwright's own waits; none sleeps.
import type { Locator, Page } from '@playwright/test';

/** What counts as one row of a list page. */
export const ROW_SELECTOR = 'tr, li, [role="row"], [role="listitem"], article';

/**
 * The innermost row that shows `text`. Ancestors come before descendants in document order, so `.last()` of the
 * matching rows is the innermost one when the text is unique to one row (fresh names; one request per month).
 */
export function rowWith(page: Page, text: string | RegExp): Locator {
  return page.locator(ROW_SELECTOR).filter({ hasText: text }).last();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A pattern for the month of a YYYY-MM-DD day as a row may draw it: "2027-05-", "May" or "May"'s three letters. */
export function monthMarker(day: string): RegExp {
  const [y, m] = day.split('-');
  const name = MONTHS[Number(m) - 1];
  return new RegExp(`${y}-${m}-|\\b${name}\\b|\\b${name.slice(0, 3)}\\b`);
}

/** The confirming button of a confirmation step, in plain words. */
export const CONFIRM_NAME = /^(confirm|yes\b|ok\b|approve|reject|switch off|turn off|cancel (the )?(request|days|it|from))/i;

/**
 * Operates a row action: clicks the row's button named `action`, then confirms it — a native confirm is accepted;
 * a dialog's confirming button (CONFIRM_NAME) is pressed; failing both, an inline button named "Confirm" on the page.
 */
export async function operateRowAction(page: Page, row: Locator, action: RegExp, timeoutMs = 10_000): Promise<void> {
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: action }).first().click({ timeout: timeoutMs });
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog')).first();
  const shown = await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (shown) {
    await dialog.getByRole('button', { name: CONFIRM_NAME }).first().click({ timeout: timeoutMs });
    return;
  }
  const inline = page.getByRole('button', { name: /^confirm/i }).first();
  if (await inline.isVisible().catch(() => false)) await inline.click({ timeout: timeoutMs });
}

/** Loads an address and waits (bounded) for the network to settle; returns the document's status (0 when none). */
export async function loadSettled(page: Page, address: string): Promise<number> {
  const response = await page.goto(address);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return response?.status() ?? 0;
}

/**
 * Re-reads `read` until `want` holds or `timeoutMs` passes, and returns the last value read: a bounded poll on an
 * observable condition (an action's effect read back through the API), never a fixed sleep standing in for one.
 */
export async function pollUntil<T>(read: () => Promise<T>, want: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (!want(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    last = await read();
  }
  return last;
}
