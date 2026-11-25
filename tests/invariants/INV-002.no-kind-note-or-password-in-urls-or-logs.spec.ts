// Purpose: ledger tests for ROW-181 (INV-002, REQ-015) — while people sign in, choose and change passwords, send vacation and sick requests and the admin rejects one with a note and sets a password, all through the pages, no address the browser loads or is sent to and no log line of the product carries a kind, the rejection note or a password.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-17); the install made by harness.ts (reset, team clock), everything else operated through the pages in the browser through the engine door (openPage, signInThroughPage) with the page readings of robustness.ts (the send form, the create form, the reject step), fresh per run; the product's log lines read through the log door of D-048 (doors-store.ts).
//
// Row table:
//   ROW-181 | urls and logs | n/a | every URL two browsers load, request or are redirected to on /sign-in, /password, /requests/new, /, /calendar, /admin/people, /admin/pending, /admin/people/:id; GET /api/__test/logs
//
// Page readings this file adds (D-029 names the pages, not these controls):
//   - The own password form (/password) is the form holding password fields: the first is the current password, every
//     later one the new password (D-014 types it twice); it is sent by its button named Change… / Save… / Set… /
//     Update…, or failing that its submit button.
//   - The admin sets a password from the people page (D-046): the row holding the person's display name carries a
//     button whose name holds "password"; it opens a dialog (role dialog) whose password fields all take the new
//     password, sent by the dialog's button named Set… / Save… / Confirm… / Change….
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
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  resetProduct,
  SetupError,
  signIn,
  signInThroughPage,
  type Actor,
  type Install,
  type Opened,
} from './harness';
import { readOwnRequests, readPersonRequests } from './request-records';
import { loadSettled, pollUntil } from './page-rows';
import { createForm, fillCreateForm, fillSendForm, openSendForm, rejectThroughPage, settle, submitSignIn } from './robustness';
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
    await rejectThroughPage(a.page, member.name, note);
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
