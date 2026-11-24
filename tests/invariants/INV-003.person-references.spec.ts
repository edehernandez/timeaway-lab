// Purpose: ledger tests for ROW-179 and ROW-180 (INV-003, REQ-020) — any reference to a person sent to someone other than the admin carries only an opaque account id and a display name, never an email, password, admin flag or allowance; the admin's people page carries every field it lists.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, accounts, allowance, requests, decisions), fresh per run; pages opened through harness.ts's engine door, every answer the browser receives recorded.
//
// Boundary (R6): "sent to someone" is every answer a member's session receives: the member-callable routes of
// D-029 at the HTTP harness (GET /api/calendar, /api/requests, /api/balance, /api/me) and, in the browser, every
// document and data answer the member's pages (/, /calendar, /requests/new, /password) load. The admin's side is
// GET /api/admin/people and the /admin/people page.
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  openPage,
  PAGES,
  reject,
  resetProduct,
  sendRequest,
  setAllowance,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import { aucklandMorning, getJson, objectsIn, valuesIn } from './readings';

const disposables: { dispose(): Promise<void> }[] = [];
const closers: { close(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const c of closers.splice(0)) await c.close().catch(() => undefined);
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

// Distinctive figures: O's allowances 137 (2027) and 128 (2028), days left 135 and 125; the admin's allowance 149.
// The viewer W's own figures (131, 129) never coincide with them.
interface World {
  install: Install;
  admin: Actor;
  o: Member;
  w: Member;
  viewer: Actor;
}

async function world(): Promise<World> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01'), admin: { allowance: 149 } });
  const admin = keep(await signIn(install.admin));
  const o = await createMember(admin, { allowance: 137 });
  await setAllowance(admin, o.id, 128, { startsNextYear: true });
  const w = await createMember(admin, { allowance: 131 });
  const os = keep(await signInMember(o));
  const viewer = keep(await signInMember(w));
  await approve(admin, await sendRequest(os, { kind: 'vacation', firstDay: '2027-03-08', lastDay: '2027-03-09' }));
  await approve(admin, await sendRequest(os, { kind: 'vacation', firstDay: '2028-01-10', lastDay: '2028-01-12' }));
  await approve(admin, await sendRequest(admin, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(viewer, { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-12' }));
  await reject(admin, await sendRequest(viewer, { kind: 'sick', firstDay: '2027-03-15', lastDay: '2027-03-15' }));
  return { install, admin, o, w, viewer };
}

/** Records every document and data answer a page receives (url and body). */
function recordAnswers(page: Page): { url: string; body: string }[] {
  const seen: { url: string; body: string }[] = [];
  page.on('response', async (res) => {
    const type = res.headers()['content-type'] ?? '';
    if (!/json|html|text\/plain|javascript/.test(type)) return;
    try {
      seen.push({ url: res.url(), body: await res.text() });
    } catch {
      /* a redirect or an aborted answer has no body */
    }
  });
  return seen;
}

// ---------------------------------------------------------------------------------------------------
// ROW-179 promise: INV-003 (a person sees only their own requests and days left, apart from the calendar's away
// ROW-179   entries); REQ-020 fail-if (4) "anyone but the admin sees any account's email, switched-on state, allowance
// ROW-179   or days left that the page lists, by the page or by any data the product sends them"; D-027 (an optional
// ROW-179   opaque account id). The row's case: any reference to a person sent to someone other than the admin
// ROW-179   carries only an opaque account id and display name — no email, password value, admin flag or allowance.
// ROW-179 wrong product: a calendar entry or a "decided by" block built from the whole account row ({id, name,
// ROW-179   email, isAdmin, allowance, passwordHash}); a page payload (the server-rendered state) carrying the team's
// ROW-179   accounts; an account id that is the email.
// ROW-179 given: today Mon 2027-03-01 (Auckland); the admin (allowance 149) with an approved day on the calendar;
// ROW-179   member O (allowances 137 and 128) with approved days in 2027 and 2028; member W with a request approved
// ROW-179   and one rejected by the admin (so W's data names the admin as decider). when: W calls the four member
// ROW-179   routes and opens /, /calendar, /requests/new and /password, every answer recorded. then: no answer
// ROW-179   carries O's or the admin's email, O's passwords (its own and the one the admin set) or the admin's
// ROW-179   password; no data object of an /api/ answer (outside W's own GET /api/me) has a key naming an email, a password, an admin
// ROW-179   flag or an allowance; no data value is 137, 128, 135, 125, 149 or 148 (O's and the admin's allowances and
// ROW-179   days left).
// ROW-179 controls: ROW-180's target (the admin's people page carries every listed field) — the values searched
// ROW-179   for exist and are sent to the admin, so their absence here is shaping, not missing data.
// ROW-179 technique: fresh emails and passwords and distinctive numbers searched in every answer the member
// ROW-179   receives; a key blacklist over the whole data.
// ROW-179 cases: ROW-179 target=ROW-179.INV-003.references-to-people-sent-to-a-member-carry-only-id-and-name control=ROW-180.REQ-020.the-admin-people-page-carries-every-listed-field
test('ROW-179.INV-003.references-to-people-sent-to-a-member-carry-only-id-and-name', async ({ browser }) => {
  const x = await world();
  const secrets = [x.o.email, x.install.admin.email, x.o.password, x.o.adminSetPassword, x.install.admin.password];
  const forbiddenNumbers = [137, 128, 135, 125, 149, 148];
  const forbiddenKey = /e-?mail|password|isAdmin|^admin$|allowance/i;

  const answers: { url: string; body: string }[] = [];
  for (const path of ['/api/calendar?year=2027&month=3', '/api/calendar?year=2028&month=1', '/api/requests', '/api/balance', '/api/me']) {
    const res = await x.viewer.api.get(path);
    expect.soft(res.status(), `ROW-179: ${path} answers W`).toBe(200);
    answers.push({ url: path, body: await res.text() });
  }
  const opened = await openPage(browser, x.viewer);
  closers.push(opened);
  const pageAnswers = recordAnswers(opened.page);
  for (const path of [PAGES.home, PAGES.calendar, PAGES.newRequest, PAGES.password]) {
    await opened.page.goto(path);
    await opened.page.waitForLoadState('networkidle');
    answers.push({ url: `${path} (rendered)`, body: await opened.page.content() });
  }
  answers.push(...pageAnswers);

  for (const a of answers) {
    const lower = a.body.toLowerCase();
    for (const s of secrets) expect.soft(lower.includes(s.toLowerCase()), `ROW-179: ${a.url} does not carry ${s}`).toBe(false);
    if (!/\/api\//.test(a.url)) continue; // a page, script or build file: searched for the secrets above
    let json: unknown;
    try {
      json = JSON.parse(a.body);
    } catch {
      continue;
    }
    const isOwnMe = /\/api\/me(\?|$)/.test(a.url);
    for (const o of objectsIn(json)) {
      if (isOwnMe && o === json) continue; // W's own GET /api/me carries W's own isAdmin (D-029)
      for (const k of Object.keys(o)) expect.soft(forbiddenKey.test(k), `ROW-179: ${a.url} sends no field "${k}"`).toBe(false);
    }
    for (const n of forbiddenNumbers) {
      expect.soft(valuesIn(json).includes(n), `ROW-179: ${a.url} sends no value ${n} (another person's allowance or days left)`).toBe(false);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-180 promise: REQ-020 "a people page listing every account with its name, email, whether it is switched on,
// ROW-180   its allowance for the current and the next year and its days left for the current and the next year";
// ROW-180   A-031. The row's case: the admin's people page carries every listed field.
// ROW-180 wrong product: a people page shaped by the member rule (name and id only), or one missing next year's
// ROW-180   allowance or days left.
// ROW-180 given: the ROW-179 world. when: the admin reads GET /api/admin/people and opens /admin/people. then: the
// ROW-180   record carrying O's email also carries O's name, a true switched-on flag and the values 137, 128 (the
// ROW-180   allowances) and 135, 125 (the days left); on the page, O's row (the element holding O's email and not the
// ROW-180   admin's) shows O's name and the four numbers.
// ROW-180 controls: the control case shows the admin's people list answers and names O.
// ROW-180 technique: distinctive values in one exact place (O's record, O's row), the admin's row as the
// ROW-180   neighbour that bounds it.
// ROW-180 cases: ROW-180 target=ROW-180.REQ-020.the-admin-people-page-carries-every-listed-field control=ROW-180.control.the-people-list-answers-the-admin
test('ROW-180.control.the-people-list-answers-the-admin', async () => {
  const x = await world();
  const people = JSON.stringify(await getJson(x.admin.api, '/api/admin/people', 'ROW-180 control'));
  expect(people.includes(x.o.name), 'ROW-180 control: the list names O').toBe(true);
});

test('ROW-180.REQ-020.the-admin-people-page-carries-every-listed-field', async ({ browser }) => {
  const x = await world();
  const people = await getJson(x.admin.api, '/api/admin/people', 'ROW-180');
  const rec = objectsIn(people).find((o) => Object.values(o).some((v) => typeof v === 'string' && v.toLowerCase() === x.o.email.toLowerCase()));
  expect(rec, "ROW-180: a record carries O's email").toBeDefined();
  const values = valuesIn(rec);
  expect.soft(values.includes(x.o.name), "ROW-180: O's record carries O's name").toBe(true);
  expect.soft(
    Object.entries(rec!).some(([k, v]) => /on|active|enabled/i.test(k) && v === true),
    "ROW-180: O's record says it is switched on",
  ).toBe(true);
  for (const n of [137, 128, 135, 125]) expect.soft(values.includes(n), `ROW-180: O's record carries ${n}`).toBe(true);

  const opened = await openPage(browser, x.admin);
  closers.push(opened);
  await opened.page.goto(PAGES.adminPeople);
  await opened.page.waitForLoadState('networkidle');
  const row = await opened.page.evaluate(
    ({ email, other }) => {
      const own = Array.from(document.body.querySelectorAll('*')).find((el) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').toLowerCase().includes(email)),
      );
      if (!own) return null;
      let top: Element = own;
      while (top.parentElement && top.parentElement !== document.body && !(top.parentElement.textContent ?? '').toLowerCase().includes(other)) {
        top = top.parentElement;
      }
      return (top as HTMLElement).innerText ?? top.textContent ?? '';
    },
    { email: x.o.email.toLowerCase(), other: x.install.admin.email.toLowerCase() },
  );
  expect(row, "ROW-180: the page shows O's email").not.toBeNull();
  expect.soft(row!.includes(x.o.name), "ROW-180: O's row shows O's name").toBe(true);
  for (const n of [137, 128, 135, 125]) {
    expect.soft(new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(row!), `ROW-180: O's row shows ${n}`).toBe(true);
  }
});
