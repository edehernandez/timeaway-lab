// Purpose: ledger tests for ROW-224 and ROW-225 (INV-002, REQ-014) — stored text (names, emails, notes) never runs as markup on any page or confirmation, and the same text is shown literally.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals, a rejection with a note), fresh per run.
//
// Boundary (R6): whether a page runs stored text is browser behaviour, proved in the browser on every page that shows
// a name or a note, by each actor who sees it. The payloads carry a fresh number k, so a flag set, an element made or
// a dialog opened can only come from this run's stored text. Emails are not among the payloads: a valid address
// cannot hold a tag, so a product that refuses one is right; names and notes can, and must be kept as typed.
// Slice 1 addition (batch test-author-10): this product keeps such an address, so emails — at create and by the change
// route — and a rename are now among the payloads, and the four confirmations are opened in the browser and read too.
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  actWithToken,
  approve,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  readEffect,
  rename,
  requireOk,
  sendRequest,
  SetupError,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { actionControl, openConfirmation } from './admin-kit';
import { bannerText, disposeAll, freshInt, freshTeam, keep, ownRequests, peopleText, settle, stringLeaves, textLines } from './robustness';

test.afterEach(disposeAll);

interface World {
  admin: Actor;
  n1: Member;
  n2: Member;
  a1: Actor;
  a2: Actor;
  k: number;
  note: string;
  rejected: string;
}

async function world(): Promise<World> {
  const { admin } = await freshTeam();
  const k = freshInt(100000, 999999);
  const n1 = await createMember(admin, { name: `<img src=x onerror=window.__x${k}=1>` });
  const n2 = await createMember(admin, { name: `<i data-m${k}>Iv ${k}</i>` });
  const note = `<img src=x onerror=window.__n${k}=1><b data-n${k}>bold</b> ${k}`;
  const a1 = keep(await signInMember(n1));
  const a2 = keep(await signInMember(n2));
  await approve(admin, await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(a2, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  const rejected = String(await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-15' }));
  const effect = await readEffect(admin, 'reject', rejected);
  const res = await actWithToken(admin, 'reject', rejected, effect.token, { note });
  expect(res.status(), 'setup: the rejection with its note is accepted').toBeLessThan(300);
  await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  await sendRequest(a2, { kind: 'vacation', firstDay: '2027-03-23', lastDay: '2027-03-23' });
  return { admin, n1, n2, a1, a2, k, note, rejected };
}

function visits(w: World): [Actor, string][] {
  const person = (m: Member) => `/admin/people/${encodeURIComponent(String(m.id))}`;
  return [
    [w.admin, '/admin/pending'],
    [w.admin, '/admin/people'],
    [w.admin, person(w.n1)],
    [w.admin, person(w.n2)],
    [w.admin, '/calendar'],
    [w.admin, '/'],
    [w.a1, '/'],
    [w.a1, '/calendar'],
    [w.a1, '/requests/new'],
    [w.a1, '/password'],
    [w.a2, '/'],
    [w.a2, '/calendar'],
  ];
}

/** Loads a page and reports what the stored text did there: flags set, elements made, dialogs opened, its text. */
async function inspect(browser: Browser, actor: Actor, path: string, k: number) {
  const opened = await openPage(browser, actor);
  const dialogs: string[] = [];
  opened.page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss().catch(() => undefined);
  });
  try {
    const r = await opened.page.goto(path);
    await settle(opened.page);
    const ran = await opened.page.evaluate((n) => {
      const w = window as unknown as Record<string, unknown>;
      return {
        flags: [`__x${n}`, `__n${n}`].filter((f) => w[f] !== undefined),
        elements: [
          ...Array.from(document.querySelectorAll('img[src="x"]')).map(() => 'img[src=x]'),
          ...Array.from(document.querySelectorAll(`[data-m${n}], [data-n${n}]`)).map((e) => e.tagName.toLowerCase()),
        ],
      };
    }, k);
    return { status: r?.status(), ...ran, dialogs, text: (await textLines(opened.page)).join('\n'), banner: await bannerText(opened.page) };
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-224 promise: the row — stored text (names, emails, notes) never runs as markup on any page; INV-002 (no data
// ROW-224   reaches another person's browser but what is meant for them — a script run from stored text reads all of
// ROW-224   it), REQ-014.
// ROW-224 wrong product: a page that renders a display name or a rejection note with v-html (or innerHTML), so a
// ROW-224   member named <img src=x onerror=…> runs script in the admin's browser on the pending, people and calendar
// ROW-224   pages; or one place (the header, a confirm summary) that does.
// ROW-224 given: member N1 named "<img src=x onerror=window.__x<k>=1>", member N2 named "<i data-m<k>>Iv <k></i>",
// ROW-224   both away 10 Mar 2027 (approved) with a pending request; N1 has a request rejected with the note
// ROW-224   "<img src=x onerror=window.__n<k>=1><b data-n<k>>bold</b> <k>". when: the admin opens the pending page, the
// ROW-224   people page, both persons' pages, the calendar and /; N1 opens /, /calendar, /requests/new, /password; N2
// ROW-224   opens / and /calendar. then: on every page no __x<k> or __n<k> flag is set, no img[src=x] and no element
// ROW-224   carrying data-m<k> or data-n<k> exists, and no dialog opened.
// ROW-224 controls: the control case reads the stored text back over HTTP exactly as typed (both names in the people
// ROW-224   list, the note on N1's request) — the payloads are stored and delivered, so their not running is the pages'.
// ROW-224 technique: payloads that leave a fresh, run-specific trace (a window flag, an attribute) if parsed as markup,
// ROW-224   checked on every page that shows them, by every actor who sees them.
// ROW-224 cases: ROW-224 target=ROW-224.INV-002.stored-names-and-notes-never-run-as-markup control=ROW-224.control.the-payloads-are-stored-exactly
test('ROW-224.control.the-payloads-are-stored-exactly', async () => {
  const w = await world();
  const leaves = stringLeaves(JSON.parse(await peopleText(w.admin)));
  expect.soft(leaves, "ROW-224 control: N1's name is stored as typed").toContain(w.n1.name);
  expect.soft(leaves, "ROW-224 control: N2's name is stored as typed").toContain(w.n2.name);
  const rec = (await ownRequests(w.a1)).find((r) => r.id === w.rejected);
  expect.soft(stringLeaves(rec?.record ?? null), 'ROW-224 control: the note is stored as typed').toContain(w.note);
});

test('ROW-224.INV-002.stored-names-and-notes-never-run-as-markup', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  for (const [actor, path] of visits(w)) {
    const seen = await inspect(browser, actor, path, w.k);
    const where = `${actor.kind} ${actor.me.id} ${path}`;
    expect.soft(seen.flags, `ROW-224 ${where}: no stored text ran as script`).toEqual([]);
    expect.soft(seen.elements, `ROW-224 ${where}: no stored text became an element`).toEqual([]);
    expect.soft(seen.dialogs, `ROW-224 ${where}: no dialog opened`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-225 promise: the row (control of ROW-224) — the same text is shown literally; INV-002, REQ-014.
// ROW-225 wrong product: a "fix" for ROW-224 that strips tags or angle brackets from names and notes (N2 shows as
// ROW-225   "Iv <k>"), or that double-escapes them so the page shows "&lt;i data-m…"; either way the person's text is
// ROW-225   not what they typed.
// ROW-225 given: the same world as ROW-224. when: the admin opens /calendar and /admin/people; N1 opens /. then: the
// ROW-225   calendar and the people page show both names character for character; N1's page shows the note character
// ROW-225   for character and N1's header shows N1's name so.
// ROW-225 controls: the control case shows every page of the walk answering 200 for its actor.
// ROW-225 technique: exact substring of the whole typed text (tags, quotes, equals signs), on the pages that show it.
// ROW-225 cases: ROW-225 target=ROW-225.INV-002.stored-text-is-shown-literally control=ROW-225.control.every-page-of-the-walk-answers
test('ROW-225.control.every-page-of-the-walk-answers', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  for (const [actor, path] of visits(w)) {
    expect.soft((await inspect(browser, actor, path, w.k)).status, `ROW-225 control: ${actor.kind} ${path} answers 200`).toBe(200);
  }
});

test('ROW-225.INV-002.stored-text-is-shown-literally', async ({ browser }) => {
  const w = await world();
  const cal = await inspect(browser, w.admin, '/calendar', w.k);
  expect.soft(cal.text, "ROW-225 /calendar: N1's name shown literally").toContain(w.n1.name);
  expect.soft(cal.text, "ROW-225 /calendar: N2's name shown literally").toContain(w.n2.name);
  const people = await inspect(browser, w.admin, '/admin/people', w.k);
  expect.soft(people.text, "ROW-225 /admin/people: N1's name shown literally").toContain(w.n1.name);
  expect.soft(people.text, "ROW-225 /admin/people: N2's name shown literally").toContain(w.n2.name);
  const own = await inspect(browser, w.a1, '/', w.k);
  expect.soft(own.text, "ROW-225 N1's /: the note shown literally").toContain(w.note);
  expect.soft(own.banner ?? '', "ROW-225 N1's header: N1's name shown literally").toContain(w.n1.name);
});

// ---------------------------------------------------------------------------------------------------
// Emails, renames and email changes holding markup, and the four confirmations (added: test-author pass, slice 1,
// batch test-author-10). An email that holds a tag may be refused outright (a right product); one the product keeps
// is stored text like any other and must never run and must show as typed.
// ---------------------------------------------------------------------------------------------------

/** One stored payload: where it went in, what it leaves behind if parsed as markup (a window flag, an attribute). */
interface Payload {
  label: string;
  value: string;
  flag: string;
  selectors: string[];
}

interface Account {
  id: AccountId;
  name: string;
  email: string;
  password: string;
}

interface Attempted {
  payload: Payload;
  status: number;
  accepted: boolean;
}

interface World2 {
  admin: Actor;
  adminName: string;
  k: number;
  m1: Account;
  m2: Account;
  m3: Account;
  payloads: Payload[];
  emails: Attempted[];
  sessions: Actor[];
}

/** POST /api/admin/accounts, raw: the status and the id. */
async function createRaw(admin: Actor, spec: { name: string; email: string; password: string }): Promise<{ status: number; id?: AccountId }> {
  const res = await admin.api.post('/api/admin/accounts', { data: { ...spec, allowance: 25 } });
  const body = (await res.json().catch(() => null)) as { id?: AccountId } | null;
  return { status: res.status(), id: body?.id ?? undefined };
}

/** Completes REQ-026's forced password change the way the member does (as harness createMember does), as setup. */
async function chooseOwnPassword(email: string, adminSet: string): Promise<string> {
  const next = freshPassword();
  const s = await signIn({ email, password: adminSet });
  try {
    await requireOk(await s.api.post('/api/me/password', { data: { current: adminSet, next } }), `POST /api/me/password for ${email}`);
  } finally {
    await s.dispose();
  }
  return next;
}

/** An account named `name` whose email is the payload when the product keeps it, else a plain fresh one. */
async function accountTrying(admin: Actor, name: string, email: Payload): Promise<{ account: Account; attempt: Attempted }> {
  const adminSet = freshPassword();
  let r = await createRaw(admin, { name, email: email.value, password: adminSet });
  const attempt: Attempted = { payload: email, status: r.status, accepted: r.status >= 200 && r.status < 300 && r.id !== undefined };
  let used = email.value;
  if (!attempt.accepted) {
    used = freshEmail('plain');
    r = await createRaw(admin, { name, email: used, password: adminSet });
    if (r.status >= 300 || r.id === undefined) throw new SetupError(`POST /api/admin/accounts for "${name}" with a plain email answered ${r.status}`);
  }
  const password = await chooseOwnPassword(used, adminSet);
  return { account: { id: r.id as AccountId, name, email: used, password }, attempt };
}

async function world2(): Promise<World2> {
  const { install, admin } = await freshTeam();
  const k = freshInt(100000, 999999);
  const N1: Payload = { label: 'name N1', value: `<img src=x onerror=window.__x${k}=1>`, flag: `__x${k}`, selectors: [`[onerror*="__x${k}"]`] };
  const N2: Payload = { label: 'name N2', value: `<i data-m${k}>Iv ${k}</i>`, flag: `__m${k}`, selectors: [`[data-m${k}]`] };
  const R: Payload = { label: 'renamed N3', value: `<img src=x onerror=window.__r${k}=1><b data-r${k}>r</b>`, flag: `__r${k}`, selectors: [`[data-r${k}]`, `[onerror*="__r${k}"]`] };
  const E1: Payload = { label: 'email E1', value: `<svg/onload=window.__e${k}=1>@example.test`, flag: `__e${k}`, selectors: [`[onload*="__e${k}"]`] };
  const E2: Payload = { label: 'email E2', value: `<svg/data-e${k}/onload=window.__g${k}=1>@example.test`, flag: `__g${k}`, selectors: [`[data-e${k}]`, `[onload*="__g${k}"]`] };
  const E3: Payload = { label: 'changed email E3', value: `<svg/data-c${k}/onload=window.__c${k}=1>@example.test`, flag: `__c${k}`, selectors: [`[data-c${k}]`, `[onload*="__c${k}"]`] };

  const a1 = await accountTrying(admin, N1.value, E1);
  const a2 = await accountTrying(admin, N2.value, E2);
  // N3 is made plain, then renamed and given a new email through the admin's change routes: the other entry points.
  const plainPw = freshPassword();
  const plainEmail = freshEmail('plain');
  const c3 = await createRaw(admin, { name: freshName('Plain'), email: plainEmail, password: plainPw });
  if (c3.status >= 300 || c3.id === undefined) throw new SetupError(`POST /api/admin/accounts for N3 answered ${c3.status}`);
  const pw3 = await chooseOwnPassword(plainEmail, plainPw);
  await rename(admin, c3.id, R.value);
  const e3 = await admin.api.post(`/api/admin/accounts/${encodeURIComponent(String(c3.id))}/email`, { data: { email: E3.value } });
  const attempt3: Attempted = { payload: E3, status: e3.status(), accepted: e3.ok() };
  const m3: Account = { id: c3.id, name: R.value, email: attempt3.accepted ? E3.value : plainEmail, password: pw3 };

  const s1 = keep(await signIn({ email: a1.account.email, password: a1.account.password }));
  const s2 = keep(await signIn({ email: a2.account.email, password: a2.account.password }));
  const s3 = keep(await signIn({ email: m3.email, password: m3.password }));
  await approve(admin, await sendRequest(s1, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(s3, { kind: 'vacation', firstDay: '2027-03-12', lastDay: '2027-03-12' }));
  await sendRequest(s1, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  await sendRequest(s2, { kind: 'sick', firstDay: '2027-03-23', lastDay: '2027-03-23' });
  return {
    admin,
    adminName: install.admin.name,
    k,
    m1: a1.account,
    m2: a2.account,
    m3,
    payloads: [N1, N2, R, E1, E2, E3],
    emails: [a1.attempt, a2.attempt, attempt3],
    sessions: [s1, s2, s3],
  };
}

/** What the stored text did on the open page: payload flags set, payload elements or handler attributes present. */
async function ranOn(page: Page, payloads: Payload[]): Promise<{ flags: string[]; elements: string[] }> {
  return page.evaluate((ps: { flag: string; selectors: string[] }[]) => {
    const w = window as unknown as Record<string, unknown>;
    return {
      flags: ps.map((p) => p.flag).filter((f) => w[f] !== undefined),
      elements: ps.flatMap((p) => p.selectors.filter((s) => document.querySelector(s) !== null)),
    };
  }, payloads.map((p) => ({ flag: p.flag, selectors: p.selectors })));
}

function visits2(w: World2): [Actor, string][] {
  const [s1, s2, s3] = w.sessions;
  const out: [Actor, string][] = [
    [w.admin, PAGES.adminPending],
    [w.admin, PAGES.adminPeople],
    [w.admin, PAGES.adminPerson(w.m1.id)],
    [w.admin, PAGES.adminPerson(w.m2.id)],
    [w.admin, PAGES.adminPerson(w.m3.id)],
    [w.admin, PAGES.calendar],
    [w.admin, PAGES.home],
    [w.admin, PAGES.newRequest],
    [w.admin, PAGES.password],
  ];
  for (const s of [s1, s2, s3]) for (const p of [PAGES.home, PAGES.calendar, PAGES.newRequest, PAGES.password]) out.push([s, p]);
  return out;
}

async function inspect2(browser: Browser, actor: Actor, path: string, payloads: Payload[]) {
  const opened = await openPage(browser, actor);
  const dialogs: string[] = [];
  opened.page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss().catch(() => undefined);
  });
  try {
    const r = await opened.page.goto(path);
    await settle(opened.page);
    const ran = await ranOn(opened.page, payloads);
    return { status: r?.status(), ...ran, dialogs, text: (await textLines(opened.page)).join('\n') };
  } finally {
    await opened.close();
  }
}

// ROW-224 promise: the row — stored text (names, EMAILS, notes) never runs as markup on any page; INV-002, REQ-014;
// ROW-224   REQ-020 AMENDED (the people page lists each account's email) puts the email on the admin's pages.
// ROW-224 wrong product: a people page or person page that renders the email with v-html, so an account the admin
// ROW-224   made as "<svg/onload=…>@example.test" (the product accepts such an address) runs script in the admin's
// ROW-224   browser; or a change-email or rename path whose new value reaches a page as markup while create's is escaped.
// ROW-224 given: N1 named "<img src=x onerror=window.__x<k>=1>" with email "<svg/onload=window.__e<k>=1>@example.test";
// ROW-224   N2 named "<i data-m<k>>Iv <k></i>" with email "<svg/data-e<k>/onload=window.__g<k>=1>@example.test"; N3 made
// ROW-224   plain, then renamed "<img src=x onerror=window.__r<k>=1><b data-r<k>>r</b>" and its email changed to
// ROW-224   "<svg/data-c<k>/onload=window.__c<k>=1>@example.test"; approved and pending days for them. when: the admin
// ROW-224   opens every admin page, each person page, the calendar and its own pages; N1, N2 and N3 each open /,
// ROW-224   /calendar, /requests/new and /password. then: an email the product refused was refused as a rule (4xx, never
// ROW-224   5xx); on every page no payload flag is set, no payload element or handler attribute exists and no dialog
// ROW-224   opened; the people page shows every kept email and the new name character for character, and the calendar
// ROW-224   shows the new name so.
// ROW-224 controls: the control case reads the people list back over HTTP — the names (the renamed one too) and each
// ROW-224   email the product kept are stored exactly as typed, so the payloads reach the pages.
// ROW-224 technique: payloads that leave a fresh, run-specific trace if parsed (a window flag, a data attribute, the
// ROW-224   handler attribute itself), through every entry point that stores the text (create, rename, change email).
// ROW-224 cases: ROW-224 target=ROW-224.INV-002.stored-emails-and-renames-never-run-as-markup control=ROW-224.control.markup-emails-and-renames-are-stored
test('ROW-224.control.markup-emails-and-renames-are-stored', async () => {
  const w = await world2();
  test.info().annotations.push({
    type: 'ROW-224 markup emails',
    description: w.emails.map((e) => `${e.payload.label}: ${e.accepted ? 'kept' : `refused ${e.status}`}`).join('; '),
  });
  const leaves = stringLeaves(JSON.parse(await peopleText(w.admin)));
  for (const n of [w.m1.name, w.m2.name, w.m3.name]) expect.soft(leaves, `ROW-224 control: the name ${n} is stored as typed`).toContain(n);
  for (const e of w.emails.filter((x) => x.accepted)) expect.soft(leaves, `ROW-224 control: the kept ${e.payload.label} is stored as typed`).toContain(e.payload.value);
});

test('ROW-224.INV-002.stored-emails-and-renames-never-run-as-markup', async ({ browser }) => {
  test.setTimeout(400_000);
  const w = await world2();
  for (const e of w.emails.filter((x) => !x.accepted)) {
    expect.soft(e.status >= 400 && e.status < 500, `ROW-224 the ${e.payload.label} was refused as a rule (4xx), not by a failure: ${e.status}`).toBe(true);
  }
  for (const [actor, path] of visits2(w)) {
    const seen = await inspect2(browser, actor, path, w.payloads);
    const where = `${actor.kind} ${actor.me.id} ${path}`;
    expect.soft(seen.status, `ROW-224 ${where}: answers 200`).toBe(200);
    expect.soft(seen.flags, `ROW-224 ${where}: no stored text ran as script`).toEqual([]);
    expect.soft(seen.elements, `ROW-224 ${where}: no stored text became an element or a handler`).toEqual([]);
    expect.soft(seen.dialogs, `ROW-224 ${where}: no dialog opened`).toEqual([]);
    if (actor === w.admin && path === PAGES.adminPeople) {
      for (const e of w.emails.filter((x) => x.accepted)) expect.soft(seen.text, `ROW-224 /admin/people: the ${e.payload.label} shown literally`).toContain(e.payload.value);
      expect.soft(seen.text, 'ROW-224 /admin/people: the new name shown literally').toContain(w.m3.name);
    }
    if (actor === w.admin && path === PAGES.calendar) expect.soft(seen.text, 'ROW-224 /calendar: the new name shown literally').toContain(w.m3.name);
  }
});

const SWITCH_OFF_WORD = /switch(?:ed|es|ing)?[\s-]*off|deactivat|disabl/i;

// ROW-224 promise: the row — stored text never runs as markup on ANY page, the confirmation step included (REQ-025
// ROW-224   names the person in it); INV-002, REQ-014.
// ROW-224 wrong product: pages that escape every list but build the confirmation's summary with v-html (or
// ROW-224   innerHTML), so approving, rejecting, cancelling for, or switching off a person named
// ROW-224   "<img src=x onerror=…>" runs script the moment the admin opens the confirmation — or in the message shown
// ROW-224   after confirming.
// ROW-224 given: the world above (N1 with an approved and a pending day, N2 with a pending day, N3 renamed and with
// ROW-224   an approved day). when: the admin, in the browser, presses Approve in N1's item on /admin/pending, Reject in
// ROW-224   N2's item there, Cancel on N1's person page and Switch off in N3's item on /admin/people, each time
// ROW-224   confirming. then: each confirmation opens and shows its person's name character for character; with it open
// ROW-224   and again after confirming, no payload flag is set and no payload element or handler attribute exists.
// ROW-224 controls: the same control case — the payloads are stored as typed, so they reach the confirmations.
// ROW-224 technique: the same fresh traces, read on the open confirmation and after it, by the page's real controls.
// ROW-224 cases: ROW-224 target=ROW-224.INV-002.confirmations-never-run-stored-text control=ROW-224.control.markup-emails-and-renames-are-stored
test('ROW-224.INV-002.confirmations-never-run-stored-text', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world2();
  const [n1, n2, n3] = [w.m1.name, w.m2.name, w.m3.name];
  const opened = await openPage(browser, w.admin);
  const page = opened.page;
  const steps: [string, string, () => ReturnType<typeof actionControl>, RegExp, string][] = [
    ['approve', PAGES.adminPending, () => actionControl(page, n1, [n2, n3], /approve/i), /approve/i, n1],
    ['reject', PAGES.adminPending, () => actionControl(page, n2, [n1, n3], /reject/i), /reject/i, n2],
    ['cancel', PAGES.adminPerson(w.m1.id), () => page.getByRole('button', { name: /cancel/i }).or(page.getByRole('link', { name: /cancel/i })).first(), /cancel/i, n1],
    ['switch off', PAGES.adminPeople, () => actionControl(page, n3, [n1, n2, w.adminName], SWITCH_OFF_WORD), SWITCH_OFF_WORD, n3],
  ];
  try {
    for (const [what, path, trigger, verb, name] of steps) {
      const say = `ROW-224 ${what} on ${path}`;
      await page.goto(path);
      await settle(page);
      const before = await ranOn(page, w.payloads);
      expect.soft([...before.flags, ...before.elements], `${say}: before the confirmation, no stored text ran or became markup`).toEqual([]);
      const c = await openConfirmation(page, trigger(), verb, say);
      expect.soft(c.text, `${say}: the confirmation shows the name literally`).toContain(name);
      if (c.kind === 'element') {
        const open = await ranOn(page, w.payloads);
        expect.soft(open.flags, `${say}: with the confirmation open, no stored text ran as script`).toEqual([]);
        expect.soft(open.elements, `${say}: with the confirmation open, no stored text became an element or a handler`).toEqual([]);
      }
      await c.confirm();
      await settle(page);
      const after = await ranOn(page, w.payloads);
      expect.soft(after.flags, `${say}: after confirming, no stored text ran as script`).toEqual([]);
      expect.soft(after.elements, `${say}: after confirming, no stored text became an element or a handler`).toEqual([]);
    }
  } finally {
    await opened.close();
  }
});
