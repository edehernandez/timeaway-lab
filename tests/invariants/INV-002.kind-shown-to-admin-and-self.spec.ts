// Purpose: ledger tests for the controls of RULE-002 (INV-002) — ROW-125 (the admin sees whether each request is vacation or sick on the pending page, a person's requests page and the admin's own page) and ROW-126 (a member sees the kind of each of their own requests on their own page, while the calendar shows them only as away).
// Provenance: hand-authored (test-author pass, slice 0, brief test-author-8); fixture data made through the product's public routes by harness.ts (reset, create accounts, own password change, send, approve), fresh per run.
//
// The fixture: clock 2027-03-01 09:00 in Pacific/Auckland (2027-02-28T20:00Z). Member A: vacation 15–16 March
// (pending), sick 22–23 March (pending), vacation 26–27 April (approved). The admin: vacation 29–30 March (pending),
// sick 19–20 April (pending). Member S: vacation 15–16 March (approved), sick 22–23 March (approved), sick 29–30
// March (pending). Every day of the month is above 12, so no day/month reading confuses two requests. Rows are found
// by their first day (and on the pending page the person's name), bounded by the other requests on the same page
// (tests/invariants/page-reading.ts findRows).
//
// ROW-125 promise: INV-002 "only the admin and the person themselves can ever learn whether an absence is vacation
// ROW-125   or sick" — the control half: the admin does learn it; REQ-008 (the pending page shows each request's kind);
// ROW-125   REQ-021 (a person's requests page lists them as the person's own page does, kind included); D-027 (the kind
// ROW-125   is sent to the admin). The admin sees the kind on the pending page, on a person's requests page and on the
// ROW-125   admin's own page.
// ROW-125 wrong product: a kind-hiding rule applied to everyone, the admin included (every row "Away"); a pending
// ROW-125   page that shows the kind only for vacation (beside the days left); kinds shown but swapped between rows.
// ROW-125 given: the fixture. when: the admin's browser opens /admin/pending, /admin/people/<A> and /. then: on each
// ROW-125   page each listed request's row carries its own kind word ("vacation" or "sick") and not the other one.
// ROW-125 controls: GET /api/admin/pending answers the admin and carries A's and S's names (the requests exist).
// ROW-125 technique: rows of both kinds on every page, adjacent, so a swap or a single label for all fails;
// ROW-125   right values on the right items (the row is found by its first day, then its kind is read).
// ROW-125 cases: ROW-125 target=ROW-125.INV-002.admin-sees-each-requests-kind-on-pending-person-and-own-pages control=ROW-125.control.admin-pending-data-exists
//
// ROW-126 promise: INV-002 and REQ-006 (a person's own requests page shows each request's kind); REQ-012 and D-027
// ROW-126   (the calendar lists people by name; an away entry carries the name, an optional opaque account id and
// ROW-126   the days, nothing else): a member sees the kind of each of their own requests on their own page, while
// ROW-126   the calendar shows them only as away.
// ROW-126 wrong product: an own page that hides the person's own kind (over-applying the rule); a calendar that
// ROW-126   tells the person their own entry is "sick" (and so would tell everyone, the entry being the same), or
// ROW-126   colours it by a class named for the kind, or sends the kind in its data.
// ROW-126 given: member S of the fixture. when: S's browser opens / and then /calendar (March 2027, the clock's
// ROW-126   month). then: on / each of S's three rows carries its own kind and not the other; on /calendar S's name
// ROW-126   is drawn, and neither the drawn text, nor any element's class / title / data- / aria- attribute, nor any
// ROW-126   /api/calendar response (received while loading, or fetched for March 2027 on the browser's session)
// ROW-126   carries the word vacation or sick.
// ROW-126 controls: S's GET /api/calendar for March 2027 lists S on 2027-03-15 and 2027-03-22 (S is away there).
// ROW-126 technique: the person's own approved days of both kinds in the month shown, so the calendar has a kind
// ROW-126   to leak; a denominator over every element's marking attributes and the calendar's data, not only the
// ROW-126   drawn text (the person's own data elsewhere may carry their own kind, which INV-002 allows).
// ROW-126 cases: ROW-126 target=ROW-126.INV-002.member-sees-own-kinds-and-the-calendar-only-away control=ROW-126.control.member-is-away-on-the-calendar-data
import { test, expect, type Page } from '@playwright/test';
import {
  approve,
  createMember,
  openPage,
  PAGES,
  productUrl,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
  type RequestSpec,
} from './harness';
import { datePatterns, findRows, literal, type RowSpec } from './page-reading';

const T0 = '2027-02-28T20:00:00Z';

interface Listed {
  owner: 'A' | 'admin' | 'S';
  spec: RequestSpec;
}

const A_REQUESTS: Listed[] = [
  { owner: 'A', spec: { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' } },
  { owner: 'A', spec: { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23' } },
  { owner: 'A', spec: { kind: 'vacation', firstDay: '2027-04-26', lastDay: '2027-04-27' } }, // approved
];
const ADMIN_REQUESTS: Listed[] = [
  { owner: 'admin', spec: { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' } },
  { owner: 'admin', spec: { kind: 'sick', firstDay: '2027-04-19', lastDay: '2027-04-20' } },
];
const S_REQUESTS: Listed[] = [
  { owner: 'S', spec: { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-16' } }, // approved
  { owner: 'S', spec: { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23' } }, // approved
  { owner: 'S', spec: { kind: 'sick', firstDay: '2027-03-29', lastDay: '2027-03-30' } },
];

let install: Install;
let admin: Actor;
let memberA: Member;
let memberS: Member;

test.beforeAll(async () => {
  install = await resetProduct({ now: T0 });
  admin = await signIn(install.admin);
  memberA = await createMember(admin);
  memberS = await createMember(admin);
  const a = await signInMember(memberA);
  const s = await signInMember(memberS);
  try {
    await sendRequest(a, A_REQUESTS[0].spec);
    await sendRequest(a, A_REQUESTS[1].spec);
    await approve(admin, await sendRequest(a, A_REQUESTS[2].spec));
    for (const r of ADMIN_REQUESTS) await sendRequest(admin, r.spec);
    await approve(admin, await sendRequest(s, S_REQUESTS[0].spec));
    await approve(admin, await sendRequest(s, S_REQUESTS[1].spec));
    await sendRequest(s, S_REQUESTS[2].spec);
  } finally {
    await a.dispose();
    await s.dispose();
  }
});

test.afterAll(async () => {
  await admin?.dispose();
});

function ownerName(owner: Listed['owner']): string {
  return owner === 'A' ? memberA.name : owner === 'S' ? memberS.name : install.admin.name;
}

const KIND_WORD = { vacation: /\bvacation\b/i, sick: /\bsick\b/i } as const;

/** Loads `address` and checks each listed request's row carries its own kind and not the other. */
async function checkKinds(page: Page, row: string, address: string, listed: Listed[], withName: boolean): Promise<void> {
  const response = await page.goto(address);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  expect.soft(response?.status(), `${row} ${address}: answers 200`).toBe(200);
  const specs: RowSpec[] = listed.map((l, i) => ({
    key: String(i),
    keys: withName ? [[literal(ownerName(l.owner))], datePatterns(l.spec.firstDay)] : [datePatterns(l.spec.firstDay)],
  }));
  const rows = await findRows(page, specs);
  listed.forEach((l, i) => {
    const found = rows[i];
    const who = `${row} ${address}: ${withName ? `${ownerName(l.owner)}'s ` : ''}request ${l.spec.firstDay}–${l.spec.lastDay}`;
    expect.soft(found.found, `${who} is listed`).toBe(true);
    if (!found.found) return;
    const other = l.spec.kind === 'vacation' ? 'sick' : 'vacation';
    expect.soft(KIND_WORD[l.spec.kind].test(found.text), `${who} shows its kind (${l.spec.kind})`).toBe(true);
    expect.soft(KIND_WORD[other].test(found.text), `${who} does not show the other kind (${other})`).toBe(false);
  });
}

test('ROW-125.control.admin-pending-data-exists', async () => {
  const res = await admin.api.get('/api/admin/pending');
  expect(res.status(), 'ROW-125 control: GET /api/admin/pending answers the admin').toBe(200);
  const body = await res.text();
  expect(body, 'ROW-125 control: the pending data carries member A').toContain(memberA.name);
  expect(body, 'ROW-125 control: the pending data carries member S').toContain(memberS.name);
});

test('ROW-125.INV-002.admin-sees-each-requests-kind-on-pending-person-and-own-pages', async ({ browser }) => {
  const opened = await openPage(browser, admin);
  try {
    const pendingListed = [A_REQUESTS[0], A_REQUESTS[1], ...ADMIN_REQUESTS, S_REQUESTS[2]];
    await checkKinds(opened.page, 'ROW-125', PAGES.adminPending, pendingListed, true);
    await checkKinds(opened.page, 'ROW-125', PAGES.adminPerson(memberA.id), A_REQUESTS, false);
    await checkKinds(opened.page, 'ROW-125', PAGES.home, ADMIN_REQUESTS, false);
  } finally {
    await opened.close();
  }
});

test('ROW-126.control.member-is-away-on-the-calendar-data', async () => {
  const s = await signInMember(memberS);
  try {
    const res = await s.api.get('/api/calendar?year=2027&month=3');
    expect(res.status(), 'ROW-126 control: GET /api/calendar answers the member').toBe(200);
    const days = ((await res.json()) as { days: { date: string; people: { name: string }[] }[] }).days;
    for (const day of ['2027-03-15', '2027-03-22']) {
      const names = days.find((d) => d.date === day)?.people.map((p) => p.name) ?? [];
      expect(names, `ROW-126 control: S is away on ${day}`).toContain(memberS.name);
    }
  } finally {
    await s.dispose();
  }
});

test('ROW-126.INV-002.member-sees-own-kinds-and-the-calendar-only-away', async ({ browser }) => {
  const s = await signInMember(memberS);
  const opened = await openPage(browser, s);
  const page = opened.page;
  try {
    await checkKinds(page, 'ROW-126', PAGES.home, S_REQUESTS, false);

    const origin = new URL(productUrl()).origin;
    const json: Promise<{ url: string; body: string }>[] = [];
    page.on('response', (res) => {
      if (new URL(res.url()).origin !== origin) return;
      if (!(res.headers()['content-type'] ?? '').includes('json')) return;
      json.push(res.text().then((body) => ({ url: res.url(), body })).catch(() => ({ url: res.url(), body: '' })));
    });
    const response = await page.goto(PAGES.calendar);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    expect.soft(response?.status(), 'ROW-126 /calendar: answers 200').toBe(200);
    const drawn = await page.locator('body').innerText();
    expect.soft(drawn, 'ROW-126 /calendar: S is shown as away').toContain(memberS.name);
    const kind = /\b(vacation|sick)\b/i;
    expect.soft(drawn.match(kind)?.[0] ?? null, 'ROW-126 /calendar: no kind of absence is drawn').toBeNull();
    const attributes = await page.locator('body *').evaluateAll((els) =>
      els.flatMap((el) =>
        Array.from(el.attributes)
          .filter((a) => a.name === 'class' || a.name === 'title' || a.name.startsWith('data-') || a.name.startsWith('aria-'))
          .map((a) => `<${el.tagName.toLowerCase()} ${a.name}="${a.value}">`),
      ),
    );
    expect.soft(attributes.filter((a) => kind.test(a)), 'ROW-126 /calendar: no element is marked with a kind of absence').toEqual([]);
    const calendarData = (await Promise.all(json)).filter((r) => new URL(r.url).pathname.startsWith('/api/calendar'));
    const direct = await page.request.get('/api/calendar?year=2027&month=3');
    expect.soft(direct.status(), 'ROW-126 GET /api/calendar?year=2027&month=3 on the browser\'s session: answers').toBe(200);
    calendarData.push({ url: direct.url(), body: await direct.text().catch(() => '') });
    const carrying = calendarData.filter((r) => kind.test(r.body)).map((r) => r.url);
    expect.soft(carrying, 'ROW-126 /calendar: no calendar data received while loading carries a kind of absence').toEqual([]);
  } finally {
    await opened.close();
    await s.dispose();
  }
});
