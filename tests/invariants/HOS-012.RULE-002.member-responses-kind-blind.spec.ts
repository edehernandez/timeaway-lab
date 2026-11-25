// Purpose: hostility probe HOS-012 (protects RULE-002, INV-002) — a team member's every answer, the calendar's included, carries no other person's kind of absence: two installs differing only in one colleague's kind give the member identical pages, embedded page data and API answers once ids and times are masked.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve), the same fresh names and emails in both installs, fresh per run; the addresses read from the route folder's file names and the pages from D-029 (route-census.ts, harness.ts PAGES).
//
// Boundary (R6): what the member's browser is SENT is read where it arrives — every same-origin answer a page load
// receives (the server-rendered document with its embedded data, and every API call the page makes), the live
// document after it settles, and every GET address of the route folder called on the member's session.
//
// HOS-012 promise: INV-002 "whether an absence is vacation or sick is never shown or sent to anyone other than the
// HOS-012   admin and the person themselves: not on the calendar, not on any page, not in any data the product sends to
// HOS-012   another person's browser"; RULE-002 (no response or server-rendered page sent to a non-admin viewer carries
// HOS-012   another person's kind of absence under any name or shape); A-005.
// HOS-012 wrong product: a calendar answer that includes the kind (the probe's own toggle); one that encodes it as a
// HOS-012   class, a colour, an icon name, an order (sick listed first) or a boolean ("ill": true); a page whose embedded
// HOS-012   data carries the colleague's request records though the page draws only names.
// HOS-012 given: two installs, X and Y, made by the same steps with the same fresh names and emails, team zone
// HOS-012   Pacific/Auckland, today Mon 2027-03-01: the admin, a member V (the viewer) and a colleague C; C's approved
// HOS-012   request Wed 03-10..Thu 03-11 is VACATION in X and SICK in Y; C's pending vacation 04-14..04-15 and V's
// HOS-012   approved vacation 03-16..03-17 are the same in both.
// HOS-012 when: in each install, signed in as V: every page of D-029 (the admin pages and C's person page too) is
// HOS-012   loaded in a browser, every answer received kept; every GET address of the route folder is called on V's
// HOS-012   session, :ids filled with C's account and C's approved request, the calendar for March 2027.
// HOS-012 then: for every page and every address, X's and Y's answers are identical token for token, apart from
// HOS-012   instants and the ids of the same account or request in the two installs (embedded devalue payloads read
// HOS-012   back as the values they encode, escapes written out); every census address and every page's document is
// HOS-012   sent in both installs; and no JSON answer V receives in Y holds the word "sick". An answer a page fetched in
// HOS-012   one install only (a month fetched ahead, by timing) has no partner and is read by the word check alone.
// HOS-012 controls: the control case shows (a) the same comparison SEES a kind where one is sent: the admin's answer
// HOS-012   for C's requests differs between X and Y and holds "sick" in Y; (b) the harmful case is reached: in both
// HOS-012   installs V's calendar answer for March names C (the colleague's absence is in V's data); (c) the
// HOS-012   comparison covered every page and at least one answer per page.
// HOS-012 technique: a relation between two runs (the probe's own "two fixtures differing only in one colleague's
// HOS-012   kind"), so no list of field names or words has to be guessed; plus one named example (the word in JSON).
// HOS-012   Honest limit: two ids of the same role are allowed to differ position for position; a number that is not an
// HOS-012   id but equals the role's id in both installs at that position would be read as one.
// HOS-012 cases: HOS-012 target=HOS-012.RULE-002.member-answers-identical-whatever-a-colleagues-kind control=HOS-012.control.the-comparison-sees-the-kind-the-admin-is-sent-and-the-member-sees-the-colleague
import { test, expect, type Browser } from '@playwright/test';
import {
  approve,
  createMember,
  freshEmail,
  freshName,
  freshPassword,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  signIn,
  signInMember,
  type AccountId,
  type AccountSpec,
} from './harness';
import { aucklandMorning } from './readings';
import { capturePageLoad, concreteAddress, isControlDoor, routeCensus, type CensusRoute } from './route-census';

type Kind = 'vacation' | 'sick';

/** What one install sent: surface key -> text, for the viewer and for the admin's view of C's requests. */
interface Seen {
  ids: Map<string, string>; // id value (as text) -> role
  viewer: Map<string, string>;
  json: { key: string; body: string }[];
  calendarNamesC: boolean;
  adminCRequests: string;
  pagesWithAnswers: Set<string>;
}

const ADMIN: AccountSpec = { name: freshName('Admin'), email: freshEmail('admin'), password: freshPassword(), allowance: 25 };
const VIEWER = { name: freshName('Vera'), email: freshEmail('vera'), allowance: 25 };
const COLLEAGUE = { name: freshName('Cato'), email: freshEmail('cato'), allowance: 25 };
const C_APPROVED = { firstDay: '2027-03-10', lastDay: '2027-03-11' };

const INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g;
const EPOCH = /(?<![0-9])1[0-9]{12}(?![0-9])/g;

/**
 * A devalue payload (Nuxt's __NUXT_DATA__ and _payload.json: a flat array of values whose numbers point at other
 * entries, equal values stored once) read back as the plain value it encodes — so the comparison sees the data, not
 * the array's indices, which shift when two values happen to be equal in one install and not in the other.
 */
function unflatten(arr: unknown[]): unknown {
  const memo = new Map<number, unknown>();
  const at = (i: number, depth: number): unknown => {
    if (i < 0) return `<special ${i}>`;
    if (memo.has(i)) return memo.get(i);
    if (depth > 300) return '<deep>';
    const v = arr[i];
    const ref = (x: unknown) => (typeof x === 'number' ? at(x, depth + 1) : x);
    let out: unknown;
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') out = { [v[0]]: ['Date', 'RegExp', 'BigInt'].includes(v[0]) ? v.slice(1) : v.slice(1).map(ref) };
      else out = v.map(ref);
    } else if (v !== null && typeof v === 'object') {
      out = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, ref(x)]));
    } else {
      out = v;
    }
    memo.set(i, out);
    return out;
  };
  return at(0, 0);
}

/** `text` with a devalue payload read back as plain JSON; unchanged when it is none. */
function readPayload(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? JSON.stringify(unflatten(parsed)) : text;
  } catch {
    return text;
  }
}

/** A document with every embedded JSON script (Nuxt's __NUXT_DATA__ among them) read back as plain JSON. */
function readDocument(html: string): string {
  return html.replace(/(<script\b[^>]*type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open: string, body: string, close: string) => `${open}${readPayload(body)}${close}`);
}

/** The text with escapes written out (/, &#x2F;, &#47;, %2F — so an id inside an escaped path is its own token) and instants masked. */
function masked(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/%2F/gi, '/')
    .replace(INSTANT, '<instant>')
    .replace(EPOCH, '<instant>');
}

/** The key a surface is compared under: its method and address with every known id replaced by its role. */
function keyOf(method: string, url: string, ids: Map<string, string>): string {
  const [pathPart, query] = url.split(/\?(.*)/s);
  const parts = pathPart.split(/(\/)/).map((p) => {
    const decoded = (() => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    })();
    return ids.has(decoded) ? `<${ids.get(decoded)}>` : p;
  });
  return `${method} ${parts.join('')}${query !== undefined ? `?${query}` : ''}`;
}

async function install(browser: Browser, kind: Kind, routes: CensusRoute[]): Promise<Seen> {
  await resetProduct({ now: aucklandMorning('2027-03-01'), admin: ADMIN });
  const admin = await signIn(ADMIN);
  const viewer = await createMember(admin, VIEWER);
  const colleague = await createMember(admin, COLLEAGUE);
  const v = await signInMember(viewer);
  const c = await signInMember(colleague);
  try {
    const cApproved = await sendRequest(c, { kind, ...C_APPROVED });
    await approve(admin, cApproved);
    const cPending = await sendRequest(c, { kind: 'vacation', firstDay: '2027-04-14', lastDay: '2027-04-15' });
    const vApproved = await sendRequest(v, { kind: 'vacation', firstDay: '2027-03-16', lastDay: '2027-03-17' });
    await approve(admin, vApproved);

    const ids = new Map<string, string>([
      [String(admin.me.id), 'admin'],
      [String(viewer.id), 'viewer'],
      [String(colleague.id), 'colleague'],
      [String(cApproved), 'c-approved'],
      [String(cPending), 'c-pending'],
      [String(vApproved), 'v-approved'],
    ]);
    const seen: Seen = { ids, viewer: new Map(), json: [], calendarNamesC: false, adminCRequests: '', pagesWithAnswers: new Set() };
    const put = (key: string, body: string) => {
      const prev = seen.viewer.get(key);
      seen.viewer.set(key, prev === undefined ? body : [prev, body].sort().join('\n<next>\n'));
    };

    // Every GET address of the route folder, on V's session.
    for (const route of routes) {
      if (route.method !== null && route.method !== 'GET') continue;
      const address = `${concreteAddress(route.pattern, { request: cApproved, account: colleague.id })}?year=2027&month=3&action=approve`;
      const res = await v.api.get(address);
      const body = await res.text().catch(() => '');
      const key = keyOf('GET', address, ids);
      put(`api ${key}`, `${res.status()}\n${body}`);
      if ((res.headers()['content-type'] ?? '').includes('json')) seen.json.push({ key, body });
      if (/^\/api\/calendar/.test(route.pattern) && res.status() === 200) seen.calendarNamesC = body.includes(COLLEAGUE.name);
    }

    // Every page, in V's browser: the document as sent, every same-origin answer but static files, the live document.
    const pages = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password, PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(colleague.id), PAGES.signIn];
    const opened = await openPage(browser, v);
    try {
      for (const address of pages) {
        const load = await capturePageLoad(opened.page, address);
        const pageKey = keyOf('PAGE', address, ids);
        put(`${pageKey} status`, `${load.status} ${load.finalPath}`);
        put(`${pageKey} live document`, readDocument(load.dom));
        for (const r of load.received) {
          if (/\.(js|mjs|css|map|woff2?|ttf|png|svg|ico|jpe?g|webp)(\?|$)/i.test(r.url.split('?')[0])) continue;
          const key = keyOf(r.method, r.url, ids);
          const body = r.contentType.includes('html') ? readDocument(r.body) : r.contentType.includes('json') ? readPayload(r.body) : r.body;
          put(`${pageKey} received ${key}${r.isDocument ? ' (document)' : ''}`, `${r.status}\n${body}`);
          seen.pagesWithAnswers.add(pageKey);
          if (r.contentType.includes('json')) seen.json.push({ key, body: r.body });
        }
      }
    } finally {
      await opened.close();
    }

    const adminView = await admin.api.get(`/api/admin/people/${encodeURIComponent(String(colleague.id))}/requests`);
    seen.adminCRequests = await adminView.text();
    return seen;
  } finally {
    await v.dispose();
    await c.dispose();
    await admin.dispose();
  }
}

/**
 * Null when `a` (install X) and `b` (install Y) are the same once instants are masked, token for token, a token
 * allowed to differ only when it is the same role's id in each install; else the first difference, in plain words.
 */
function difference(a: string, idsA: Map<string, string>, b: string, idsB: Map<string, string>): string | null {
  const tokens = (s: string) => masked(s).match(/[A-Za-z0-9_-]+|[^A-Za-z0-9_-]/g) ?? [];
  const ta = tokens(a);
  const tb = tokens(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i += 1) {
    if (ta[i] === tb[i]) continue;
    const ra = idsA.get(ta[i]);
    if (ra !== undefined && ra === idsB.get(tb[i])) continue;
    const at = (t: string[]) => t.slice(Math.max(0, i - 12), i + 12).join('');
    return `token ${i}: X has "${ta[i]}", Y has "${tb[i]}" — X …${at(ta)}… / Y …${at(tb)}…`;
  }
  if (ta.length !== tb.length) return `lengths differ (${ta.length} and ${tb.length} tokens) after token ${n}`;
  return null;
}

let X: Seen;
let Y: Seen;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(400_000);
  const routes = routeCensus().filter((r) => !isControlDoor(r) && !r.pattern.startsWith('/api/auth'));
  X = await install(browser, 'vacation', routes);
  Y = await install(browser, 'sick', routes);
});

test('HOS-012.control.the-comparison-sees-the-kind-the-admin-is-sent-and-the-member-sees-the-colleague', async () => {
  expect(difference(X.adminCRequests, X.ids, Y.adminCRequests, Y.ids), "HOS-012 control: the admin's answer for C's requests differs between the installs").not.toBeNull();
  expect(/\bsick\b/i.test(Y.adminCRequests), "HOS-012 control: the admin's answer for C's requests says sick in Y").toBe(true);
  expect(X.calendarNamesC, "HOS-012 control: in X, V's calendar answer for March names C").toBe(true);
  expect(Y.calendarNamesC, "HOS-012 control: in Y, V's calendar answer for March names C").toBe(true);
  for (const address of [PAGES.home, PAGES.calendar]) {
    expect(X.pagesWithAnswers.has(`PAGE ${address}`), `HOS-012 control: the load of ${address} received answers to compare`).toBe(true);
  }
});

test('HOS-012.RULE-002.member-answers-identical-whatever-a-colleagues-kind', async () => {
  const keys = new Set([...X.viewer.keys(), ...Y.viewer.keys()]);
  for (const key of [...keys].sort()) {
    const a = X.viewer.get(key);
    const b = Y.viewer.get(key);
    if (a === undefined || b === undefined) {
      // An answer a page fetched in one install only (a neighbouring month fetched ahead, by timing) has no partner to
      // compare; its words are still read by the JSON check below. Every census address and every page's own
      // document has its partner by construction, so their absence fails.
      const timed = / received /.test(key) && !/\(document\)$/.test(key);
      if (timed) test.info().annotations.push({ type: 'HOS-012 unpaired', description: `${key} received only in ${a === undefined ? 'Y' : 'X'}` });
      else expect.soft(`${key} sent only in ${a === undefined ? 'Y' : 'X'}`, 'HOS-012: the member is sent the same answers in both installs').toBe('');
      continue;
    }
    expect.soft(difference(a, X.ids, b, Y.ids), `HOS-012 ${key}: identical for the member whatever C's kind`).toBeNull();
  }
  const saysSick = Y.json.filter((j) => /\bsick(ness)?\b/i.test(j.body)).map((j) => j.key);
  expect.soft(saysSick, 'HOS-012: no JSON answer the member receives in Y (C sick) says sick').toEqual([]);
});
