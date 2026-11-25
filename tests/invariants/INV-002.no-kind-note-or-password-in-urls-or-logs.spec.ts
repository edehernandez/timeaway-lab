// Purpose: ledger tests for ROW-181 (INV-002, REQ-015) — while people sign in, choose and change passwords, send vacation and sick requests and the admin rejects one with a note and sets a password, all through the pages — after load, and with the browser's scripts turned off — no address the browser loads or is sent to and no log line of the product carries a kind, the rejection note or a password.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17; the reject step repaired in batch test-author-20 to pick the sick request's row by its own days, never by position; the two scriptless cases added in batch test-author-23, every earlier case and assertion kept as it was); the install made by harness.ts (reset, team clock), everything else operated through the pages in the browser through the engine door (openPage, signInThroughPage) with the page readings of robustness.ts (the send form, the create form, the sign-in form), fresh per run; the product's log lines read through the log door of D-048 (doors-store.ts).
//
// Row table:
//   ROW-181 | urls and logs | n/a | every URL two browsers load, request or are redirected to on /sign-in, /password, /requests/new, /, /calendar, /admin/people, /admin/pending, /admin/people/:id; GET /api/__test/logs
//   ROW-181 | urls and logs | n/a | the same pages in browsers with their scripts turned off, every form there that carries a kind, a note or a password filled and pressed; GET /api/__test/logs
//
// Page readings this file adds (D-029 names the pages, not these controls):
//   - The own password form (/password) is the form holding password fields: the first is the current password, every
//     later one the new password (D-014 types it twice); it is sent by its button named Change… / Save… / Set… /
//     Update…, or failing that its submit button.
//   - The admin sets a password from the people page (D-046): the row holding the person's display name carries a
//     button whose name holds "password"; it opens a dialog (role dialog) whose password fields all take the new
//     password, sent by the dialog's button named Set… / Save… / Confirm… / Change….
//   - The admin rejects the sick request from the pending page (REQ-008): the row holding the person's display name,
//     its days' month (April 2027: "2027-04-", "April" or "Apr") and a button named Reject…, and NOT the vacation's
//     month (May) — the pending page lists oldest sent first (REQ-008 fail-if 2), so a position never names a request;
//     its Reject button opens a step with a field labelled Note, confirmed by the step's own button named Confirm… /
//     Yes… / Reject… (inside the dialog when one shows, else inside the row when it holds the note, else inside the note's form).
// A reading the product does not match throws a SetupError naming it; every operated step is checked to have taken
// effect (read back through the API), so the scan is never run over a flow that did not happen.
//
// ROW-181 promise: the row — "The kind, rejection notes and passwords never appear in a URL or in any log line".
// ROW-181   Authority: the row; INV-002 (the kind is never shown or sent to anyone but the admin and the person: a URL
// ROW-181   is sent on to history, logs and other sites), REQ-015 (the password is the person's own), A-005, A-015 (the
// ROW-181   note is shown only to the person and the admin), D-035 (the sign-in form posts, never a return address from
// ROW-181   the URL), D-048 (the log door).
// ROW-181 wrong product: a form with no method, so its native submit puts ?email=…&password=… or ?kind=sick in the
// ROW-181   address; a confirmation step addressed /admin/requests/7/confirm?action=reject&note=…; a page that fetches
// ROW-181   /api/requests?kind=sick; a redirect to /?sent=sick; a request logger that prints each request's JSON body, or
// ROW-181   a log line "rejected … note: …"; a refused sign-in logged with the password tried.
// ROW-181 given: team Wed 2027-03-10, a fresh install. when: the admin signs in through the page; creates member M with
// ROW-181   P1 through the create form; M tries a fresh wrong password W, signs in with P1 and changes to P2 through the
// ROW-181   password form; M sends a sick request (04-05..06) and a vacation request (05-03..04) through the send form; the
// ROW-181   admin rejects the sick one with a fresh note through the pending page and sets M's password to P3 through the
// ROW-181   people page; M signs in with P3 and changes to P4; both open their other pages. then: no URL recorded in either
// ROW-181   browser (every request, every navigation, every redirect's Location; the build's /_nuxt/ files left out) holds
// ROW-181   "sick" or "vacation", the note, or any of the passwords (as typed, URL-encoded, base64); and no log line written
// ROW-181   since the install holds the word sick or vacation, the note, or any password (as typed, URL-encoded, base64, hex).
// ROW-181 controls: the control case — the same flow took effect (the sick request is stored rejected with the note, M
// ROW-181   signs in with P4 and not P3), the URL recorder saw the flow's own requests (more than one request to /api/),
// ROW-181   and the log door answers.
// ROW-181 technique: a property over every URL and every log line of the flow (the denominator is all of them, not the
// ROW-181   addresses the forms are expected to use), fresh passwords and note so none can be hard-coded.
// ROW-181 cases: ROW-181 target=ROW-181.INV-002.no-url-or-log-line-carries-a-kind-note-or-password control=ROW-181.control.the-flow-through-the-pages-took-effect
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  fresh,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  productUrl,
  resetProduct,
  sendRequest,
  SetupError,
  signIn,
  signInThroughPage,
  type Actor,
  type Install,
  type Opened,
} from './harness';
import { readOwnRequests, readPersonRequests } from './request-records';
import { loadSettled, monthMarker, pollUntil, ROW_SELECTOR } from './page-rows';
import { createForm, fillCreateForm, fillSendForm, openSendForm, settle, submitSignIn } from './robustness';
import { logLinesSince, logMark } from './doors-store';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 Pacific/Auckland
const SICK = { kind: 'sick' as const, firstDay: '2027-04-05', lastDay: '2027-04-06' };
const VACATION = { kind: 'vacation' as const, firstDay: '2027-05-03', lastDay: '2027-05-04' };

async function signsIn(email: string, password: string): Promise<boolean> {
  const api = await anonymousApi();
  try {
    return (await api.post('/api/auth/sign-in', { data: { email, password } })).ok();
  } finally {
    await api.dispose();
  }
}

async function mustTakeEffect(what: string, check: () => Promise<boolean>): Promise<void> {
  if (!(await pollUntil(check, (v) => v, 15_000))) throw new SetupError(`${what} did not take effect`);
}

/**
 * True once the page's own session no longer owes the forced password change (GET /api/me: mustChangePassword false).
 * Read on the session, so that waiting for a change never spends a sign-in attempt (D-026 bounds wrong ones).
 */
async function changedOwnPassword(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/me');
  return res.status() === 200 && ((await res.json()) as { mustChangePassword?: boolean }).mustChangePassword === false;
}

/** Records every URL the context requests, every navigation of the page and every redirect's Location. */
function record(o: Opened, urls: string[]): void {
  o.context.on('request', (r) => urls.push(r.url()));
  o.context.on('response', (r) => {
    const loc = r.headers()['location'];
    if (loc) urls.push(new URL(loc, r.url()).href);
  });
  o.page.on('framenavigated', (f) => urls.push(f.url()));
}

/** The own password form (/password), per the reading in the header. */
async function changeOwnPasswordThroughPage(page: Page, current: string, next: string): Promise<void> {
  await loadSettled(page, PAGES.password);
  const form = page.locator('form').filter({ has: page.locator('input[type="password"]') }).first();
  try {
    await form.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new SetupError('/password shows no form with password fields');
  }
  const fields = form.locator('input[type="password"]');
  const n = await fields.count();
  if (n < 2) throw new SetupError(`the password form has ${n} password field(s); a current and a new one are needed`);
  await fields.nth(0).fill(current);
  for (let i = 1; i < n; i += 1) await fields.nth(i).fill(next);
  const named = form.getByRole('button', { name: /^(change|save|set|update)/i });
  const button: Locator = (await named.count()) > 0 ? named.first() : form.locator('button[type="submit"], input[type="submit"]').first();
  await button.click();
  await settle(page);
}

/** The admin sets a person's password from the people page's row dialog, per the reading in the header. */
async function setPasswordThroughPage(page: Page, personName: string, password: string): Promise<void> {
  await loadSettled(page, PAGES.adminPeople);
  const opener = page
    .locator('li, tr, article, [role="row"], [role="listitem"]')
    .filter({ hasText: personName })
    .last()
    .getByRole('button', { name: /password/i })
    .first();
  if ((await opener.count()) === 0) throw new SetupError(`the people page's row of ${personName} has no button naming "password"`);
  await opener.click();
  const dialog = page.getByRole('dialog').last();
  try {
    await dialog.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new SetupError('the set-password step shows no dialog with a password field');
  }
  const fields = dialog.locator('input[type="password"]');
  for (let i = 0; i < (await fields.count()); i += 1) await fields.nth(i).fill(password);
  await dialog.getByRole('button', { name: /^(set|save|confirm|change)/i }).last().click();
  await settle(page);
}

/**
 * On /admin/pending, rejects with `note` the one request of `personName` whose days fall in `day`'s month, per the
 * reading in the header: the row is picked by its own days (a row also carrying `otherDay`'s month is not it), never
 * by its position in the list.
 */
async function rejectRequestThroughPage(page: Page, personName: string, day: string, otherDay: string, note: string): Promise<void> {
  const reject = /^reject/i;
  const row = page
    .locator(ROW_SELECTOR)
    .filter({ hasText: personName })
    .filter({ hasText: monthMarker(day) })
    .filter({ hasNotText: monthMarker(otherDay) })
    .filter({ has: page.getByRole('button', { name: reject }) })
    .last();
  try {
    await row.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new SetupError(`no row on /admin/pending holds "${personName}", the month of ${day} (and not of ${otherDay}) and a Reject button`);
  }
  page.once('dialog', (d) => d.accept().catch(() => undefined));
  await row.getByRole('button', { name: reject }).first().click();
  const noteField = page.getByLabel(/note/i).first();
  try {
    await noteField.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new SetupError('the reject step shows no field labelled "Note"');
  }
  await noteField.fill(note);
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog')).last();
  const noteForm = noteField.locator('xpath=ancestor::form[1]');
  const inRow = (await row.getByLabel(/note/i).count()) > 0;
  const scope: Locator = (await dialog.isVisible().catch(() => false)) ? dialog : inRow ? row : (await noteForm.count()) > 0 ? noteForm : row;
  const confirm = scope.getByRole('button', { name: /^(confirm|yes|reject)\b/i });
  if ((await confirm.count()) === 0) throw new SetupError('the reject step shows no button named Confirm, Yes or Reject');
  await confirm.last().click();
}

interface Flow {
  install: Install;
  mark: number;
  urls: string[];
  note: string;
  passwords: Record<string, string>;
  member: { name: string; email: string };
  memberId: string;
  admin: Actor;
}

async function flow(browser: Browser): Promise<Flow> {
  const install = await resetProduct({ now: NOW });
  const mark = await logMark();
  const urls: string[] = [];
  const pw = { A0: install.admin.password, P1: freshPassword(), P2: freshPassword(), P3: freshPassword(), P4: freshPassword(), W: freshPassword() };
  const note = `Note ${freshName('n').replace(/\s+/g, '-')}`;
  const member = { name: freshName('Member'), email: freshEmail('member') };
  const admin = await signIn(install.admin);
  const a = await openPage(browser, 'anonymous');
  const m = await openPage(browser, 'anonymous');
  record(a, urls);
  record(m, urls);
  let memberId = '';
  try {
    await signInThroughPage(a.page, install.admin);
    await loadSettled(a.page, PAGES.adminPeople);
    await fillCreateForm(await createForm(a.page), { ...member, password: pw.P1, allowance: 25 });
    await mustTakeEffect('creating M through the create form', async () => (await (await admin.api.get('/api/admin/people')).text()).includes(member.email));

    await loadSettled(m.page, PAGES.signIn);
    await submitSignIn(m.page, member.email, pw.W);
    await settle(m.page);
    await signInThroughPage(m.page, { email: member.email, password: pw.P1 });
    await changeOwnPasswordThroughPage(m.page, pw.P1, pw.P2);
    await mustTakeEffect('M\'s change to P2 through the password form', () => changedOwnPassword(m.page));

    const ms = await signIn({ email: member.email, password: pw.P2 });
    memberId = String(ms.me.id);
    try {
      for (const spec of [SICK, VACATION]) {
        await openSendForm(m.page);
        await fillSendForm(m.page, spec);
        await settle(m.page);
        await mustTakeEffect(`M's ${spec.kind} request through the send form`, async () => (await readOwnRequests(ms)).some((r) => r.firstDay === spec.firstDay));
      }
    } finally {
      await ms.dispose();
    }
    await loadSettled(a.page, PAGES.adminPending);
    await rejectRequestThroughPage(a.page, member.name, SICK.firstDay, VACATION.firstDay, note);
    await settle(a.page);
    await mustTakeEffect('the rejection with a note through the pending page', async () =>
      (await readPersonRequests(admin, memberId)).some((r) => r.firstDay === SICK.firstDay && r.state === 'rejected'),
    );
    await setPasswordThroughPage(a.page, member.name, pw.P3);
    await mustTakeEffect('the admin\'s password set through the people page', async () => (await m.page.request.get('/api/me')).status() === 401);
    for (const address of [PAGES.adminPerson(memberId), PAGES.adminPending, PAGES.calendar]) await loadSettled(a.page, address);

    await signInThroughPage(m.page, { email: member.email, password: pw.P3 });
    await changeOwnPasswordThroughPage(m.page, pw.P3, pw.P4);
    await mustTakeEffect('M\'s change to P4 through the password form', () => changedOwnPassword(m.page));
    await (await signIn({ email: member.email, password: pw.P4 })).dispose();
    for (const address of [PAGES.home, PAGES.calendar, PAGES.newRequest]) await loadSettled(m.page, address);
  } finally {
    await a.close();
    await m.close();
  }
  return { install, mark, urls, note, passwords: pw, member, memberId, admin };
}

function urlForms(s: string): string[] {
  const b = Buffer.from(s, 'utf8');
  return [...new Set([s, encodeURIComponent(s), b.toString('base64'), b.toString('base64url')])];
}

function logForms(s: string): string[] {
  return [...new Set([...urlForms(s), Buffer.from(s, 'utf8').toString('hex')])];
}

function decoded(u: string): string {
  try {
    return decodeURIComponent(u.replace(/\+/g, ' '));
  } catch {
    return u;
  }
}

test('ROW-181.control.the-flow-through-the-pages-took-effect', async ({ browser }) => {
  const f = await flow(browser);
  try {
    const list = await readPersonRequests(f.admin, f.memberId);
    const sick = list.find((r) => r.firstDay === SICK.firstDay);
    expect.soft(sick?.state, 'ROW-181 control: the sick request is stored rejected').toBe('rejected');
    expect.soft(JSON.stringify(sick?.raw ?? {}).includes(f.note), 'ROW-181 control: the rejection carries the note').toBe(true);
    expect.soft(await signsIn(f.member.email, f.passwords.P4), 'ROW-181 control: P4 signs M in').toBe(true);
    expect.soft(await signsIn(f.member.email, f.passwords.P3), 'ROW-181 control: P3 no longer signs M in').toBe(false);
    const api = f.urls.filter((u) => new URL(u).pathname.startsWith('/api/'));
    expect.soft(api.length > 1, `ROW-181 control: the URL recorder saw the flow's requests to /api/ (${api.length})`).toBe(true);
    expect.soft(Array.isArray((await logLinesSince(f.mark)).lines), 'ROW-181 control: the log door answers the lines since the install').toBe(true);
  } finally {
    await f.admin.dispose();
  }
});

test('ROW-181.INV-002.no-url-or-log-line-carries-a-kind-note-or-password', async ({ browser }) => {
  const f = await flow(browser);
  try {
    const urls = [...new Set(f.urls)].filter((u) => !/^\/_nuxt\//.test(new URL(u).pathname));
    const secrets: [string, string][] = [['the rejection note', f.note], ...Object.entries(f.passwords).map(([k, v]) => [`password ${k}`, v] as [string, string])];
    expect.soft(urls.filter((u) => /sick|vacation/i.test(decoded(u))), 'ROW-181 no URL carries a kind').toEqual([]);
    for (const [label, value] of secrets) {
      const forms = urlForms(value);
      expect.soft(urls.filter((u) => forms.some((x) => u.includes(x) || decoded(u).includes(x))), `ROW-181 no URL carries ${label}`).toEqual([]);
    }
    const lines = (await logLinesSince(f.mark)).lines;
    expect.soft(lines.filter((l) => /\b(sick|vacation)\b/i.test(l)), 'ROW-181 no log line carries a kind').toEqual([]);
    for (const [label, value] of secrets) {
      const forms = logForms(value);
      expect.soft(lines.filter((l) => forms.some((x) => l.includes(x))), `ROW-181 no log line carries ${label}`).toEqual([]);
    }
  } finally {
    await f.admin.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// The scriptless presses (batch test-author-23)
// ---------------------------------------------------------------------------------------------------
//
// ROW-181 promise: the row — "The kind, rejection notes and passwords never appear in a URL or in any log line" — holds
// ROW-181   for a press made before the page's scripts have run, not only for one made after load: INV-002 (the kind is
// ROW-181   never sent to anyone but the admin and the person; an address goes on to history, logs and other sites),
// ROW-181   REQ-015 (a password is the person's own), A-005, D-053 (every form posts, so no native submit is a GET
// ROW-181   carrying what was typed; the sign-in and sign-out forms post to their own routes, every other form to its own
// ROW-181   page, which answers 303 to that page without acting).
// ROW-181 wrong product: the send form rendered by the server with no method, so pressing Send before hydration makes
// ROW-181   the browser's native GET /requests/new?kind=sick&firstDay=…; likewise a password page whose form makes
// ROW-181   /password?current=…&next=…, a people page whose create form (or a set-password dialog served in the HTML)
// ROW-181   makes /admin/people?password=…, a sign-in form that makes /sign-in?email=…&password=…, a reject step served
// ROW-181   with a note field that makes ?note=…; or a page-post bounce that logs the form body it never reads.
// ROW-181 given: team Wed 2027-03-10, a fresh install; member M made through the admin's route with a sick
// ROW-181   (2027-04-05..06) and a vacation (2027-05-03..04) request pending, so the admin's pages draw M's rows; fresh
// ROW-181   passwords and a fresh note. when: in browser contexts with JavaScript turned off (javaScriptEnabled false),
// ROW-181   anonymous on /sign-in, M on /requests/new, /, /calendar, /password, and the admin on /admin/people,
// ROW-181   /admin/pending, /admin/people/<M>, /requests/new, /, /calendar, /password, EVERY form the served page carries
// ROW-181   that holds a password field, a kind control (a radio, checkbox or option reading sick or vacation) or a note
// ROW-181   field (a textarea, or a field labelled note, reason or comment) is filled — sick chosen, the note typed, the
// ROW-181   current password where one is asked and a fresh new one elsewhere, the sign-in form with M's email and
// ROW-181   password, every other required field with a fresh value, read-only and disabled fields left as served — and
// ROW-181   pressed, each from a fresh load of its page:
// ROW-181   by its first shown and enabled submit button, or, for a form the page serves but does not show (a closed
// ROW-181   dialog's), by the form's own native requestSubmit(). then: no URL the scriptless browsers requested, were
// ROW-181   redirected to or landed on (the build's /_nuxt/ files left out) holds "sick" or "vacation", the note or any
// ROW-181   password (as typed, URL-encoded, base64); and no log line since the install holds the word sick or vacation,
// ROW-181   the note or any password (as typed, URL-encoded, base64, hex).
// ROW-181 controls: the control case — the contexts really run no page script (a probe page served by the test, whose
// ROW-181   own script would retitle it, keeps its title); the four forms the brief names were found in the scriptless
// ROW-181   pages, filled valid and their press SENT a navigation request (the sign-in form on /sign-in, the send form —
// ROW-181   the form with a field labelled First day and a kind control — on M's /requests/new, the own password form on
// ROW-181   M's and the admin's /password, the create form — Email, Allowance and a password field — on /admin/people),
// ROW-181   so the harmful case, a native submit, is reached; and the recorder saw those submissions' own URLs.
// ROW-181 technique: a property over every form the served pages carry (the denominator is every form holding a kind,
// ROW-181   note or password field, visible or not, not the forms the reading expects) and over every URL and log line of
// ROW-181   the presses; fresh passwords and note so none can be hard-coded; scripts turned off, which is exactly the page
// ROW-181   a person presses before hydration, since a server-rendered page is the same HTML before its scripts run.
// ROW-181 cases: ROW-181 target=ROW-181.INV-002.scriptless-form-presses-put-no-kind-note-or-password-in-a-url control=ROW-181.control.scriptless-forms-were-found-and-sent

const SCRIPTLESS_SICK = { member: { firstDay: '2027-04-19', lastDay: '2027-04-20' }, admin: { firstDay: '2027-04-26', lastDay: '2027-04-27' } };
const KIND_WORD = /\b(sick|vacation)\b/i;
const SICK_WORD = /\bsick\b/i;
const NOTE_WORD = /\bnote\b|reason|comment/i;
const CURRENT_WORD = /current|\bold\b|existing/i;
const SKIPPED_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);
const TEXTISH_TYPES = new Set(['', 'text', 'search', 'tel', 'url']);

/** One field of a form as the served page carries it: its tag, type, the words naming it (labels, aria, placeholder, name, id). */
interface FieldInfo {
  tag: string;
  type: string;
  words: string;
  value: string;
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  options: { value: string; text: string }[];
}

/** What a served form carries, as this file reads it. */
interface FormInfo {
  index: number;
  passwords: number;
  kind: boolean;
  note: boolean;
  firstDay: boolean;
  email: boolean;
  allowance: boolean;
}

/** The named forms of the control (the brief's list), by the readings of robustness.ts and this file's header. */
type Named = 'sign-in' | 'send' | 'own password' | 'create';

interface Press {
  actor: string;
  address: string;
  form: number;
  named: Named | null;
  shown: boolean;
  how: string;
  valid: boolean;
  sent: boolean;
  method: string | null;
  url: string | null;
}

async function fieldsOf(form: Locator): Promise<FieldInfo[]> {
  return form.locator('input, select, textarea').evaluateAll((els) =>
    els.map((el) => {
      const e = el as HTMLInputElement;
      const words: string[] = [];
      if (e.labels) for (const l of Array.from(e.labels)) words.push(l.textContent ?? '');
      for (const a of ['aria-label', 'placeholder', 'name', 'id', 'title']) words.push(el.getAttribute(a) ?? '');
      const by = el.getAttribute('aria-labelledby');
      if (by) for (const id of by.split(/\s+/)) words.push(document.getElementById(id)?.textContent ?? '');
      const tag = el.tagName.toLowerCase();
      const options =
        tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, text: o.textContent ?? '' })) : [];
      return {
        tag,
        type: tag === 'input' ? (el.getAttribute('type') ?? '').toLowerCase() : tag,
        words: words.join(' ').replace(/\s+/g, ' ').trim().toLowerCase(),
        value: tag === 'select' ? '' : (e.value ?? ''),
        required: e.required === true,
        disabled: e.disabled === true,
        readonly: e.readOnly === true,
        options,
      };
    }),
  );
}

function carriesKind(f: FieldInfo): boolean {
  if (f.type === 'radio' || f.type === 'checkbox') return KIND_WORD.test(`${f.words} ${f.value}`);
  if (f.type === 'hidden') return KIND_WORD.test(f.value);
  return f.tag === 'select' && f.options.some((o) => KIND_WORD.test(`${o.value} ${o.text}`));
}

function carriesNote(f: FieldInfo): boolean {
  return f.tag === 'textarea' || (f.tag === 'input' && TEXTISH_TYPES.has(f.type) && NOTE_WORD.test(f.words));
}

async function describeForms(page: Page): Promise<FormInfo[]> {
  const forms = page.locator('form');
  const out: FormInfo[] = [];
  const n = await forms.count();
  for (let index = 0; index < n; index += 1) {
    const fields = await fieldsOf(forms.nth(index));
    out.push({
      index,
      passwords: fields.filter((f) => f.type === 'password').length,
      kind: fields.some(carriesKind),
      note: fields.some(carriesNote),
      firstDay: fields.some((f) => /first day/.test(f.words)),
      email: fields.some((f) => f.type === 'email' || /\bemail\b/.test(f.words)),
      allowance: fields.some((f) => /allowance/.test(f.words)),
    });
  }
  return out;
}

function eligible(f: FormInfo): boolean {
  return f.passwords > 0 || f.kind || f.note;
}

function namedForm(actor: string, address: string, f: FormInfo): Named | null {
  if (address === PAGES.signIn && f.passwords > 0 && f.email) return 'sign-in';
  if (actor === 'member' && address === PAGES.newRequest && f.firstDay && f.kind) return 'send';
  if (address === PAGES.password && f.passwords >= 2) return 'own password';
  if (actor === 'admin' && address === PAGES.adminPeople && f.email && f.allowance && f.passwords > 0) return 'create';
  return null;
}

/** What a scriptless fill types: the page it is on, the email and current password asked, the note and the days. */
interface Typing {
  address: string;
  email: string;
  current: string;
  note: string;
  firstDay: string;
  lastDay: string;
  /** Every password typed anywhere, so the scan can look for each. */
  typed: string[];
}

/** Fills one served form: shown fields through the page's controls, fields the page serves but does not show set in place. */
async function fillServedForm(form: Locator, t: Typing): Promise<void> {
  const info = await fieldsOf(form);
  const fields = form.locator('input, select, textarea');
  const passwordAt = info.flatMap((f, i) => (f.type === 'password' ? [i] : []));
  const labelledCurrent = info.some((f) => f.type === 'password' && CURRENT_WORD.test(f.words));
  const firstIsCurrent = !labelledCurrent && t.address === PAGES.password && passwordAt.length >= 2;
  const next = freshPassword();
  t.typed.push(next);
  let dates = 0;
  for (let i = 0; i < info.length; i += 1) {
    const f = info[i];
    if (f.disabled || f.readonly || SKIPPED_TYPES.has(f.type)) continue;
    let value: string | null = null;
    let check = false;
    if (f.type === 'password') {
      const current = t.address === PAGES.signIn || CURRENT_WORD.test(f.words) || (firstIsCurrent && i === passwordAt[0]);
      value = current ? t.current : next;
    } else if (f.type === 'radio' || f.type === 'checkbox') {
      if (f.type !== 'radio' || !SICK_WORD.test(`${f.words} ${f.value}`)) continue;
      check = true;
    } else if (f.tag === 'select') {
      const sick = f.options.find((o) => SICK_WORD.test(`${o.value} ${o.text}`));
      if (!sick) continue;
      value = sick.value;
    } else if (carriesNote(f)) {
      value = t.note;
    } else if (/first day|\bstart|\bfrom\b/.test(f.words) || (f.type === 'date' && dates === 0)) {
      value = t.firstDay;
      dates += 1;
    } else if (/last day|\bend\b|\buntil\b/.test(f.words) || f.type === 'date') {
      value = t.lastDay;
      dates += 1;
    } else if (f.type === 'email' || /\bemail\b/.test(f.words)) {
      value = t.email;
    } else if (f.type === 'number' || /allowance/.test(f.words)) {
      value = '25';
    } else if (/name/.test(f.words) && TEXTISH_TYPES.has(f.type)) {
      value = freshName('Scriptless');
    } else if (TEXTISH_TYPES.has(f.type) && f.required && f.value === '') {
      value = fresh('v');
    } else {
      continue;
    }
    const el = fields.nth(i);
    if (await el.isVisible()) {
      if (check) await el.check();
      else if (f.tag === 'select') await el.selectOption(value as string);
      else await el.fill(value as string);
    } else {
      await el.evaluate((node, [v, c]) => {
        if (c) (node as HTMLInputElement).checked = true;
        else (node as HTMLInputElement).value = v as string;
      }, [value, check] as [string | null, boolean]);
    }
  }
}

/** The fields of the form that would block a native submit (constraint validation), by name. */
async function invalidFields(form: Locator): Promise<string[]> {
  return form.evaluate((f) =>
    Array.from((f as HTMLFormElement).elements)
      .filter((e) => 'checkValidity' in e && !(e as HTMLInputElement).checkValidity())
      .map((e) => (e as HTMLInputElement).name || e.id || e.tagName.toLowerCase()),
  );
}

/**
 * Presses the served form natively (the page runs no script): its first shown, enabled submit button, else the form's
 * own requestSubmit(); returns whether the browser then sent a navigation request, and which.
 */
async function pressServedForm(page: Page, form: Locator): Promise<{ how: string; sent: boolean; method: string | null; url: string | null }> {
  const nav = page
    .waitForRequest((r) => r.isNavigationRequest() && r.frame() === page.mainFrame(), { timeout: 10_000 })
    .catch(() => null);
  const submitters = form.locator('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]');
  let how = '';
  for (let i = 0; i < (await submitters.count()); i += 1) {
    const b = submitters.nth(i);
    if ((await b.isVisible()) && (await b.isEnabled())) {
      how = `pressed "${((await b.textContent()) || (await b.getAttribute('value')) || '').trim()}"`;
      await b.click();
      break;
    }
  }
  if (how === '') {
    how = 'requestSubmit() (no shown, enabled submit button)';
    await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());
  }
  const req = await nav;
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  return { how, sent: req !== null, method: req?.method() ?? null, url: req?.url() ?? null };
}

/** A browser context with its scripts turned off, on the actor's session (taken from the actor door) or none. */
async function openScriptless(browser: Browser, actor: Actor | 'anonymous'): Promise<Opened> {
  const storageState = actor === 'anonymous' ? undefined : await actor.api.storageState();
  const context = await browser.newContext({ baseURL: productUrl(), storageState, javaScriptEnabled: false });
  const page = await context.newPage();
  return { context, page, consoleErrors: [], close: () => context.close() };
}

/** True when a page the test serves in this context, whose own script would retitle it, keeps its title. */
async function runsNoScript(o: Opened): Promise<boolean> {
  const probe = `${productUrl()}/__row-181-scriptless-probe`;
  await o.context.route(probe, (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>kept</title><script>document.title = "ran"</script>' }),
  );
  await o.page.goto(probe);
  const title = await o.page.title();
  await o.context.unroute(probe);
  return title === 'kept';
}

/** On `address`, fills and presses every served form carrying a kind, a note or a password, each from a fresh load. */
async function pressEveryForm(o: Opened, actor: string, address: string, t: Typing, presses: Press[]): Promise<void> {
  await o.page.goto(address);
  const first = (await describeForms(o.page)).filter(eligible);
  for (const target of first) {
    if (target !== first[0]) await o.page.goto(address);
    const now = (await describeForms(o.page)).find((f) => f.index === target.index);
    if (!now || !eligible(now)) continue;
    const form = o.page.locator('form').nth(target.index);
    const shown = await form.isVisible();
    await fillServedForm(form, { ...t, address });
    const bad = await invalidFields(form);
    const base = { actor, address, form: target.index, named: namedForm(actor, address, now), shown };
    if (bad.length > 0) {
      presses.push({ ...base, how: `not pressed: invalid ${bad.join(', ')}`, valid: false, sent: false, method: null, url: null });
      continue;
    }
    presses.push({ ...base, valid: true, ...(await pressServedForm(o.page, form)) });
  }
}

interface ScriptlessFlow {
  mark: number;
  urls: string[];
  note: string;
  secrets: [string, string][];
  presses: Press[];
  scriptsOff: boolean[];
}

async function scriptlessFlow(browser: Browser): Promise<ScriptlessFlow> {
  const install = await resetProduct({ now: NOW });
  const mark = await logMark();
  const urls: string[] = [];
  const presses: Press[] = [];
  const scriptsOff: boolean[] = [];
  const note = `Note ${freshName('s').replace(/\s+/g, '-')}`;
  const typed: string[] = [];
  const admin = await signIn(install.admin);
  let memberPassword = '';
  try {
    const m = await createMember(admin, { name: freshName('Member'), email: freshEmail('member') });
    memberPassword = m.password;
    const ms = await signIn({ email: m.email, password: m.password });
    try {
      await sendRequest(ms, SICK);
      await sendRequest(ms, VACATION);
    } finally {
      await ms.dispose();
    }
    const msPage = await signIn({ email: m.email, password: m.password });

    // Anonymous: the sign-in form, with M's email and password.
    const anon = await openScriptless(browser, 'anonymous');
    try {
      scriptsOff.push(await runsNoScript(anon));
      record(anon, urls);
      const t: Typing = { address: '', email: m.email, current: m.password, note, ...SCRIPTLESS_SICK.member, typed };
      await pressEveryForm(anon, 'anonymous', PAGES.signIn, t, presses);
    } finally {
      await anon.close();
    }

    // M: its own pages, the password page last (a product that acted on it would end M's other sessions).
    const mo = await openScriptless(browser, msPage);
    try {
      scriptsOff.push(await runsNoScript(mo));
      record(mo, urls);
      const t: Typing = { address: '', email: freshEmail('typed'), current: m.password, note, ...SCRIPTLESS_SICK.member, typed };
      for (const address of [PAGES.newRequest, PAGES.home, PAGES.calendar, PAGES.password]) await pressEveryForm(mo, 'member', address, t, presses);
    } finally {
      await mo.close();
      await msPage.dispose();
    }

    // The admin: the people page, the pending page, M's person page, its own pages, the password page last.
    const ao = await openScriptless(browser, admin);
    try {
      scriptsOff.push(await runsNoScript(ao));
      record(ao, urls);
      const t: Typing = { address: '', email: freshEmail('created'), current: install.admin.password, note, ...SCRIPTLESS_SICK.admin, typed };
      const addresses = [PAGES.adminPeople, PAGES.adminPending, PAGES.adminPerson(m.id), PAGES.newRequest, PAGES.home, PAGES.calendar, PAGES.password];
      for (const address of addresses) await pressEveryForm(ao, 'admin', address, t, presses);
    } finally {
      await ao.close();
    }
  } finally {
    await admin.dispose();
  }
  test.info().annotations.push({
    type: 'ROW-181 scriptless presses',
    description: presses
      .map((p) => `${p.actor} ${p.address} form ${p.form}${p.named ? ` (${p.named})` : ''}${p.shown ? '' : ' [not shown]'}: ${p.how}; ${p.sent ? `sent ${p.method} ${p.url}` : 'nothing sent'}`)
      .join(' | '),
  });
  const secrets: [string, string][] = [
    ['the rejection note', note],
    ['the admin\'s password', install.admin.password],
    ['M\'s password', memberPassword],
    ...typed.map((v, i) => [`typed password ${i + 1}`, v] as [string, string]),
  ];
  return { mark, urls, note, secrets, presses, scriptsOff };
}

test('ROW-181.control.scriptless-forms-were-found-and-sent', async ({ browser }) => {
  const f = await scriptlessFlow(browser);
  expect.soft(f.scriptsOff, 'ROW-181 control: every scriptless context ran no page script').toEqual([true, true, true]);
  const wanted: [string, string, Named][] = [
    ['anonymous', PAGES.signIn, 'sign-in'],
    ['member', PAGES.newRequest, 'send'],
    ['member', PAGES.password, 'own password'],
    ['admin', PAGES.password, 'own password'],
    ['admin', PAGES.adminPeople, 'create'],
  ];
  for (const [actor, address, named] of wanted) {
    const p = f.presses.filter((x) => x.actor === actor && x.address === address && x.named === named);
    expect.soft(p.length > 0, `ROW-181 control: the ${named} form is served on ${actor}'s scriptless ${address}`).toBe(true);
    expect.soft(p.some((x) => x.valid), `ROW-181 control: the ${named} form on ${actor}'s ${address} was filled valid (${p.map((x) => x.how).join('; ')})`).toBe(true);
    const sent = p.filter((x) => x.sent);
    expect.soft(sent.length > 0, `ROW-181 control: pressing the ${named} form on ${actor}'s scriptless ${address} sent a request`).toBe(true);
    for (const x of sent) expect.soft(f.urls, `ROW-181 control: the recorder saw the ${named} submission's URL`).toContain(x.url);
  }
});

test('ROW-181.INV-002.scriptless-form-presses-put-no-kind-note-or-password-in-a-url', async ({ browser }) => {
  const f = await scriptlessFlow(browser);
  const urls = [...new Set([...f.urls, ...f.presses.flatMap((p) => (p.url ? [p.url] : []))])].filter((u) => !/^\/_nuxt\//.test(new URL(u).pathname));
  expect.soft(urls.filter((u) => /sick|vacation/i.test(decoded(u))), 'ROW-181 no URL of a scriptless press carries a kind').toEqual([]);
  for (const [label, value] of f.secrets) {
    const forms = urlForms(value);
    expect.soft(urls.filter((u) => forms.some((x) => u.includes(x) || decoded(u).includes(x))), `ROW-181 no URL of a scriptless press carries ${label}`).toEqual([]);
  }
  const lines = (await logLinesSince(f.mark)).lines;
  expect.soft(lines.filter((l) => /\b(sick|vacation)\b/i.test(l)), 'ROW-181 no log line of the scriptless presses carries a kind').toEqual([]);
  for (const [label, value] of f.secrets) {
    const forms = logForms(value);
    expect.soft(lines.filter((l) => forms.some((x) => l.includes(x))), `ROW-181 no log line of the scriptless presses carries ${label}`).toEqual([]);
  }
});
