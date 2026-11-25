// Purpose: the ledger test of RULE-002 (INV-002, A-005, D-027) — census-wide: two installs that differ only in the kind of every request of two colleagues (a member and the admin), in every state, send a team member and an anonymous visitor identical answers on every route of the route folder and every page of the page folder, at two clock positions.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve, reject, admin cancel, own cancel), the same fresh names, emails and year in both installs, fresh per run; routes and pages read from the route and page folders' file names (route-census.ts, rule-census.ts).
//
// Boundary (R6): what a non-admin's browser is SENT is read where it arrives — every answer of every route of the route
// folder called on the member's session and with no cookie, and every same-origin answer a page load receives (the
// server-rendered document with its embedded data, every call the page makes) with the live document after it settles.
// HOS-012 attempts the rule through one toggle, one colleague and one approved request; this file is the census-wide
// half: every state a colleague's request can be in, the admin as a colleague, POST routes, the anonymous visitor, the
// page folder's every page and next year's month, so a new route or page that leaks a kind is reached unnamed.
//
// RULE-002 promise: RULE-002 "no response or server-rendered page sent to a non-admin viewer carries another person's
// RULE-002   kind of absence under any name or shape"; INV-002 (not on the calendar, not on any page, not in any data sent
// RULE-002   to another person's browser); A-005 (everyone sees only away); D-027 (an away entry carries the display name,
// RULE-002   an optional opaque account id and the days, nothing else).
// RULE-002 wrong product: one route or page that carries the kind — a calendar entry with a kind, class or colour; a
// RULE-002   sick colleague left off the calendar or listed first; a page payload holding the colleague's request records; a
// RULE-002   refusal that says "this sick request"; a pending or partly cancelled request's kind leaking where the approved
// RULE-002   one's does not; the admin's own sick days shown as sick to the team.
// RULE-002 given: installs X and Y made by the same steps, the same fresh names and emails, zone Pacific/Kiritimati, a
// RULE-002   fresh year Y, today D0 (the first Monday on or after 2 March): the admin, the viewer V, colleagues C and Dana.
// RULE-002   C's requests — D0+2..D0+3 approved, D0+8..D0+11 approved then partly cancelled, D0+21..D0+22 pending,
// RULE-002   D0+28..D0+29 rejected, D0+35..D0+36 cancelled by C, D0+42..D0+43 approved then cancelled by the admin, next
// RULE-002   year F..F+1 approved — and the admin's own D0+2..D0+3 approved and D0+49..D0+50 pending are all VACATION in X
// RULE-002   and all SICK in Y. Dana's vacation D0+2..D0+3 and V's vacation D0+15..D0+16, both approved, are the same in both.
// RULE-002 when: in each install, at D0+9 (after the cancels): every GET address of the route folder for March, April
// RULE-002   and next February, and every POST address with an empty body, each :id filled with each of C's and the admin's
// RULE-002   requests and accounts, on V's session and with no cookie; every page of the page folder (:id = C) loaded in V's
// RULE-002   browser and in a cookie-less browser; then the clock moves to F+1 and V loads "/" and the calendar page again.
// RULE-002 then: for every surface, X's and Y's answers are identical token for token, apart from instants and the ids
// RULE-002   of the same role in the two installs (embedded devalue payloads read back as values, escapes written out);
// RULE-002   every census address and every page document is sent in both installs; no JSON answer V or the visitor
// RULE-002   receives in Y says "sick" or "ill" where the same surface in X does not (a refusal naming the two kinds a
// RULE-002   request may have says it in both). An answer a page fetched in one install only (a neighbouring month fetched
// RULE-002   ahead, by timing) has no partner and is read by the word check alone.
// RULE-002 controls: the control case shows (a) the comparison SEES a kind where one is rightly sent: the admin's answer
// RULE-002   for C's requests and C's own GET /api/requests differ between X and Y and say sick in Y; (b) the harmful case is
// RULE-002   reached: in both installs V's calendar answer for March lists C and the admin on D0+2 (their absences are in V's
// RULE-002   data); (c) the census covered routes and pages: every census GET address and every page answered in both.
// RULE-002 technique: a relation between two runs (two fixtures differing only in the colleagues' kinds), so no list of
// RULE-002   field names, words or shapes has to be guessed; plus one named example (the word in JSON).
// RULE-002   Honest limit: ids of the same role may differ position for position; a number equal to a role's id at that
// RULE-002   position in both installs is read as that id.
// RULE-002 cases: RULE-002 target=RULE-002.every-route-and-page-sends-a-non-admin-the-same-whatever-the-colleagues-kinds control=RULE-002.control.the-comparison-sees-a-kind-rightly-sent-and-the-viewer-sees-the-colleagues
import { test, expect, type Browser } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  reject,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  PAGES,
  type AccountSpec,
  type Actor,
} from './harness';
import { addDays, day, onOrAfter, pickYear, teamAt, TEAM_ZONE } from './request-rules';
import { awayOn } from './records';
import { capturePageLoad, methodsOf } from './route-census';
import {
  addressesOf,
  addRole,
  callRoute,
  difference,
  pageAddress,
  pageCensus,
  readDocument,
  readPayload,
  ruleRoutes,
  surfaceKey,
  type Binding,
  type IdRoles,
} from './rule-census';

type Kind = 'vacation' | 'sick';

const Y = pickYear();
const D0 = onOrAfter(day(Y, 3, 2), 1);
const F = onOrAfter(day(Y + 1, 2, 1), 1);
const at = (k: number) => addDays(D0, k);
const ADMIN: AccountSpec = { name: freshName('Admin'), email: freshEmail('admin'), password: freshPassword(), allowance: 25 };
const VIEWER = { name: freshName('Vera'), email: freshEmail('vera'), allowance: 25 };
const COLLEAGUE = { name: freshName('Cato'), email: freshEmail('cato'), allowance: 25 };
const DANA = { name: freshName('Dana'), email: freshEmail('dana'), allowance: 25 };
const MONTHS: [number, number][] = [
  [Y, 3],
  [Y, 4],
  [Y + 1, 2],
];
const STATIC = /\.(js|mjs|css|map|woff2?|ttf|png|svg|ico|jpe?g|webp)(\?|$)/i;

/** What one install sent: surface key -> answer text, for the non-admin viewers; and the control's readings. */
interface Seen {
  ids: IdRoles;
  sent: Map<string, string>;
  json: { key: string; body: string }[];
  calendarMarch: unknown;
  adminCRequests: string;
  cOwnRequests: string;
  censusKeys: Set<string>;
  pageKeys: Set<string>;
}

async function install(browser: Browser, kind: Kind): Promise<Seen> {
  await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(D0), admin: ADMIN });
  const admin = await signIn(ADMIN);
  const viewer = await createMember(admin, VIEWER);
  const colleague = await createMember(admin, COLLEAGUE);
  const dana = await createMember(admin, DANA);
  const v = await signInMember(viewer);
  const c = await signInMember(colleague);
  const dn = await signInMember(dana);
  try {
    const ids: IdRoles = new Map();
    addRole(ids, admin.me.id, 'admin');
    addRole(ids, viewer.id, 'viewer');
    addRole(ids, colleague.id, 'colleague');
    addRole(ids, dana.id, 'dana');
    const send = async (who: Actor, role: string, k: Kind, first: number, last: number, firstDay?: string, lastDay?: string) => {
      const id = await sendRequest(who, { kind: k, firstDay: firstDay ?? at(first), lastDay: lastDay ?? at(last) });
      addRole(ids, id, role);
      return id;
    };
    const c1 = await send(c, 'c-approved', kind, 2, 3);
    const c2 = await send(c, 'c-partly-cancelled', kind, 8, 11);
    const c3 = await send(c, 'c-pending', kind, 21, 22);
    const c4 = await send(c, 'c-rejected', kind, 28, 29);
    const c5 = await send(c, 'c-own-cancelled', kind, 35, 36);
    const c6 = await send(c, 'c-admin-cancelled', kind, 42, 43);
    const c7 = await send(c, 'c-next-year', kind, 0, 0, F, addDays(F, 1));
    const a1 = await send(admin, 'a-approved', kind, 2, 3);
    const a2 = await send(admin, 'a-pending', kind, 49, 50);
    const d1 = await send(dn, 'dana-approved', 'vacation', 2, 3);
    const v1 = await send(v, 'v-approved', 'vacation', 15, 16);
    for (const id of [c1, c2, c6, c7, a1, d1, v1]) await approve(admin, id);
    await reject(admin, c4);
    await cancelOwnRequest(c, c5);
    await setClock(teamAt(at(9)));
    await adminCancel(admin, c2);
    await adminCancel(admin, c6);

    const seen: Seen = { ids, sent: new Map(), json: [], calendarMarch: undefined, adminCRequests: '', cOwnRequests: '', censusKeys: new Set(), pageKeys: new Set() };
    const put = (key: string, body: string) => {
      const prev = seen.sent.get(key);
      seen.sent.set(key, prev === undefined ? body : [prev, body].sort().join('\n<next>\n'));
    };

    // Every address of the route folder, on V's session and with no cookie.
    const bindings: Binding[] = [
      { label: 'c-approved/colleague', request: c1, account: colleague.id },
      { label: 'c-pending/colleague', request: c3, account: colleague.id },
      { label: 'c-partly-cancelled/colleague', request: c2, account: colleague.id },
      { label: 'a-approved/admin', request: a1, account: admin.me.id },
      { label: 'a-pending/admin', request: a2, account: admin.me.id },
    ];
    const sessions: { label: string; api: Actor['api'] | null }[] = [
      { label: 'viewer', api: v.api },
      { label: 'anonymous', api: null },
    ];
    for (const route of ruleRoutes()) {
      for (const method of methodsOf(route)) {
        for (const { address, binding } of addressesOf(route, bindings)) {
          const queries = method === 'GET' ? MONTHS.map(([y, m]) => `?year=${y}&month=${m}&action=approve`) : [''];
          for (const q of queries) {
            for (const s of sessions) {
              const called = await callRoute(s.api, method, `${address}${q}`, method === 'GET' ? undefined : {});
              const key = `api ${s.label} ${method} ${route.pattern} [${binding.label}]${q}`;
              seen.censusKeys.add(key);
              put(key, `${called.status}\n${called.body}`);
              if (called.contentType.includes('json')) seen.json.push({ key, body: called.body });
              if (s.label === 'viewer' && /calendar/.test(route.pattern) && q.startsWith(`?year=${Y}&month=3&`) && called.status === 200) seen.calendarMarch = called.json;
            }
          }
        }
      }
    }

    // Every page of the page folder, in V's browser and in a cookie-less one.
    const loadPages = async (label: string, actor: Actor | 'anonymous', addresses: string[]) => {
      const opened = await openPage(browser, actor);
      try {
        for (const address of addresses) {
          const load = await capturePageLoad(opened.page, address);
          const pageKey = surfaceKey(`page ${label}`, address, ids);
          seen.pageKeys.add(pageKey);
          put(`${pageKey} status`, `${load.status} ${load.finalPath}`);
          put(`${pageKey} live document`, readDocument(load.dom));
          for (const r of load.received) {
            if (STATIC.test(r.url.split('?')[0])) continue;
            const key = surfaceKey(`${pageKey} received ${r.method}`, r.url, ids);
            const body = r.contentType.includes('html') ? readDocument(r.body) : r.contentType.includes('json') ? readPayload(r.body) : r.body;
            put(`${key}${r.isDocument ? ' (document)' : ''}`, `${r.status}\n${body}`);
            if (r.contentType.includes('json')) seen.json.push({ key, body: r.body });
          }
        }
      } finally {
        await opened.close();
      }
    };
    const pages = pageCensus().map((p) => pageAddress(p.pattern, colleague.id));
    await loadPages('viewer', v, pages);
    await loadPages('anonymous', 'anonymous', pages);

    // Next year's month: the clock moves to F+1; V loads "/" and the calendar page again.
    await setClock(teamAt(addDays(F, 1)));
    await loadPages('viewer in February', v, [PAGES.home, PAGES.calendar]);

    seen.adminCRequests = await (await admin.api.get(`/api/admin/people/${encodeURIComponent(String(colleague.id))}/requests`)).text();
    seen.cOwnRequests = await (await c.api.get('/api/requests')).text();
    return seen;
  } finally {
    await v.dispose();
    await c.dispose();
    await dn.dispose();
    await admin.dispose();
  }
}

let X: Seen;
let Ysent: Seen;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(900_000);
  X = await install(browser, 'vacation');
  Ysent = await install(browser, 'sick');
});

test('RULE-002.control.the-comparison-sees-a-kind-rightly-sent-and-the-viewer-sees-the-colleagues', async () => {
  expect(difference(X.adminCRequests, X.ids, Ysent.adminCRequests, Ysent.ids), "RULE-002 control: the admin's answer for C's requests differs between the installs").not.toBeNull();
  expect(/\bsick\b/i.test(Ysent.adminCRequests), "RULE-002 control: the admin's answer for C's requests says sick in Y").toBe(true);
  expect(difference(X.cOwnRequests, X.ids, Ysent.cOwnRequests, Ysent.ids), "RULE-002 control: C's own requests answer differs between the installs (the person sees her own kind)").not.toBeNull();
  for (const [label, s] of [['X', X], ['Y', Ysent]] as const) {
    const names = awayOn(s.calendarMarch, at(2));
    expect(names, `RULE-002 control: in ${label}, V's March calendar answer lists C on ${at(2)}`).toContain(COLLEAGUE.name);
    expect(names, `RULE-002 control: in ${label}, V's March calendar answer lists the admin on ${at(2)}`).toContain(ADMIN.name);
  }
  expect(X.censusKeys.size, 'RULE-002 control: the census walk called addresses').toBeGreaterThan(0);
  expect([...X.censusKeys].filter((k) => !Ysent.censusKeys.has(k)), 'RULE-002 control: every census address was called in both installs').toEqual([]);
  expect(X.pageKeys.size, 'RULE-002 control: the page census loaded pages').toBeGreaterThanOrEqual(pageCensus().length);
});

test('RULE-002.every-route-and-page-sends-a-non-admin-the-same-whatever-the-colleagues-kinds', async () => {
  const keys = new Set([...X.sent.keys(), ...Ysent.sent.keys()]);
  let compared = 0;
  for (const key of [...keys].sort()) {
    const a = X.sent.get(key);
    const b = Ysent.sent.get(key);
    if (a === undefined || b === undefined) {
      // An answer a page fetched in one install only (a neighbouring month fetched ahead, by timing) has no partner; its
      // words are still read by the JSON check below. Every census address and every page's own document has its
      // partner by construction, so its absence fails.
      const timed = / received /.test(key) && !/\(document\)$/.test(key);
      if (timed) test.info().annotations.push({ type: 'RULE-002 unpaired', description: `${key} received only in ${a === undefined ? 'Y' : 'X'}` });
      else expect.soft(`${key} sent only in ${a === undefined ? 'Y' : 'X'}`, 'RULE-002: a non-admin is sent the same surfaces in both installs').toBe('');
      continue;
    }
    compared += 1;
    expect.soft(difference(a, X.ids, b, Ysent.ids), `RULE-002 ${key}: identical for a non-admin whatever the colleagues' kinds`).toBeNull();
  }
  expect(compared, 'RULE-002: surfaces were compared').toBeGreaterThan(0);
  // The word check: a JSON answer in Y (the colleagues sick) that says sick or ill where the same surface in X (the
  // colleagues on vacation) does not — or that has no partner in X. A word both installs send (a refusal naming the two
  // kinds a request may have) says nothing about a colleague.
  const word = /\b(sick(ness)?|ill(ness)?)\b/i;
  const inX = new Map<string, boolean>();
  for (const j of X.json) inX.set(j.key, (inX.get(j.key) ?? false) || word.test(j.body));
  const saysKind = Ysent.json.filter((j) => word.test(j.body) && inX.get(j.key) !== true).map((j) => j.key);
  expect.soft(saysKind, 'RULE-002: no JSON answer a non-admin receives in Y (the colleagues sick) says sick or ill where X\'s does not').toEqual([]);
});
