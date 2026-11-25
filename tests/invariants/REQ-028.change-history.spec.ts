// Purpose: ledger tests for ROW-267, ROW-268, ROW-269 and ROW-274 (REQ-028) — a person's allowance and name change history lists every change, each with its old and new value, who made it and when, allowance changes with the year they start, and nobody but the admin sees it.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, rename, setAllowance), fresh per run, made once per worker and only read by its cases.
//
// Boundary (R6): a record rule, proved at the HTTP harness on D-029's GET /api/admin/people/:id/history (the data of
// the history on the person's requests page, A-045), read by value as admin-kit states at its head — no field
// naming is imposed. ROW-269's "by a page or by any data sent to them" adds the browser (harness openPage,
// Chromium) to watch every body a page load receives.
// Time: each change is made at its own team-clock instant, hours apart, so every "when" belongs to one change only.
// Slice 1, brief test-author-11: at the end, ROW-268's case reading D-043's own fields (from, to, by, at) so a swapped
// entry fails, and ROW-269's cases probing every member route and page for the entries' facts (values, starting year,
// who, when), not only the earlier names; every earlier assertion kept.
// Slice 1, brief test-author-25 (owner grant A-053, lesson L-1): the entries read on the person page itself
// (/admin/people/:id, where A-045 puts the history), entry by entry, for ROW-268 and its siblings ROW-267 and ROW-274,
// beside the API readings above; these cases make their own install and come last in the file.
import { test, expect, type Browser, type Page, type Response } from '@playwright/test';
import { datePatterns, findRows, literal, type FoundRow } from './page-reading';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  openPage,
  PAGES,
  productUrl,
  rename,
  resetProduct,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  type Actor,
  type Install,
  type Member,
} from './harness';
import {
  carries,
  freshInt,
  getRaw,
  is2xx,
  loadCapturing,
  readHistory,
  recordCarriesInstant,
  recordCarriesNumber,
  recordCarriesString,
  recordCarriesYear,
  showRecord,
  teamInstant,
  teamTimeOf,
  type Rec,
} from './admin-kit';

const ZONE = DEFAULT_TIME_ZONE; // Pacific/Auckland
const DAY = '2027-03-08';
const THIS_YEAR = 2027;

interface Change {
  what: string;
  /** Picks this change's record out of the history by its new value. */
  isIt: (r: Rec) => boolean;
  hasOld: (r: Rec) => boolean;
  at: string;
  year?: number;
}

interface World {
  install: Install;
  admin: Actor;
  subject: Member;
  other: Member;
  names: { n0: string; n1: string; n2: string; otherNew: string };
  allowances: { a0: number; a1: number; a2: number; otherNew: number };
  changes: Change[];
  before: { status: number; records: Rec[] | null; text: string };
  after: { status: number; records: Rec[] | null; text: string };
}

let w: World;
let built: Promise<World> | null = null;

/** Builds the file's world once per worker and hands it to each case, so a setup failure fails every case (red), never skips one. */
async function world(): Promise<World> {
  built ??= build();
  w = await built;
  return w;
}

async function build(): Promise<World> {
  const install = await resetProduct({ now: teamInstant(ZONE, DAY, '09:00'), timeZone: ZONE });
  const admin = await signIn(install.admin);
  const a0 = freshInt(120, 139);
  const a1 = freshInt(140, 159);
  const a2 = freshInt(160, 179);
  const otherNew = freshInt(180, 199);
  const n0 = freshName('Ilse');
  const n1 = freshName('Greta');
  const n2 = freshName('Hanna');
  const otherName = freshName('Wanda');
  const subject = await createMember(admin, { name: n0, allowance: a0 });
  const other = await createMember(admin, { name: freshName('Oskar') });
  const before = await readHistory(admin.api, subject.id);

  const t2 = teamInstant(ZONE, DAY, '10:17');
  const t3 = teamInstant(ZONE, DAY, '11:34');
  const t4 = teamInstant(ZONE, DAY, '13:05');
  const t5 = teamInstant(ZONE, DAY, '14:46');
  await setClock(t2);
  await rename(admin, subject.id, n1);
  await setClock(t3);
  await rename(admin, subject.id, n2);
  await setClock(t4);
  await setAllowance(admin, subject.id, a2, { startsNextYear: true });
  await setClock(t5);
  await setAllowance(admin, subject.id, a1, { startsNextYear: false });
  await setClock(teamInstant(ZONE, DAY, '15:20'));
  await rename(admin, other.id, otherName);
  await setAllowance(admin, other.id, otherNew);
  const after = await readHistory(admin.api, subject.id);

  const changes: Change[] = [
    {
      what: `rename "${n0}" → "${n1}"`,
      isIt: (r) => recordCarriesString(r, n1) && !recordCarriesString(r, n2),
      hasOld: (r) => recordCarriesString(r, n0),
      at: t2,
    },
    {
      what: `rename "${n1}" → "${n2}"`,
      isIt: (r) => recordCarriesString(r, n2),
      hasOld: (r) => recordCarriesString(r, n1),
      at: t3,
    },
    {
      what: `allowance ${a0} → ${a2} starting ${THIS_YEAR + 1}`,
      isIt: (r) => recordCarriesNumber(r, a2),
      hasOld: (r) => recordCarriesNumber(r, a0),
      at: t4,
      year: THIS_YEAR + 1,
    },
    {
      what: `allowance ${a0} → ${a1} starting ${THIS_YEAR}`,
      isIt: (r) => recordCarriesNumber(r, a1),
      hasOld: (r) => recordCarriesNumber(r, a0),
      at: t5,
      year: THIS_YEAR,
    },
  ];
  return {
    install,
    admin,
    subject,
    other,
    names: { n0, n1, n2, otherNew: otherName },
    allowances: { a0, a1, a2, otherNew },
    changes,
    before,
    after,
  };
}

test.afterAll(async () => {
  await w?.admin.dispose().catch(() => undefined);
});

function recordFor(c: Change): Rec | undefined {
  return (w.after.records ?? []).find((r) => c.isIt(r));
}

// ---------------------------------------------------------------------------------------------------
// ROW-267 promise: REQ-028 fail-if (1) "an allowance or name change is missing from the history"; A-045 "allowance and
// ROW-267   name changes record the old and new value, and the admin sees each person's change history".
// ROW-267 wrong product: a history that keeps only the latest name (the account's current row) so the first rename
// ROW-267   is lost; one listing allowance changes but not renames; one that loses the change scheduled for next year
// ROW-267   when a this-year change follows it; one that lists everybody's changes on each person.
// ROW-267 given: the subject (fresh name N0, allowance A0) is renamed N0→N1, then N1→N2, given A2 from next year, then
// ROW-267   A1 from this year — four changes at four team-clock instants; a neighbour is renamed and given a fresh
// ROW-267   allowance afterwards. when: the admin reads the subject's history. then: before the changes no record
// ROW-267   carries N1, N2, A1 or A2; after them a record exists for each of the four (picked by its new value), and
// ROW-267   none carries the neighbour's new name or new allowance.
// ROW-267 controls: the control case shows the changes took effect (the subject signs in named N2) and the history
// ROW-267   route answers the admin with a list — the setup worked and the history is reached.
// ROW-267 technique: two changes of each kind in sequence (the second must not replace the first), fresh values
// ROW-267   each carried by exactly one change, and the neighbour as the decoy that must not match.
// ROW-267 cases: ROW-267 target=ROW-267.REQ-028.every-allowance-and-name-change-is-in-the-history control=ROW-267.control.the-changes-took-effect-and-the-history-answers
test('ROW-267.control.the-changes-took-effect-and-the-history-answers', async () => {
  await world();
  const s = await signInMember(w.subject);
  try {
    expect(s.me.name.trim(), 'ROW-267 control: the subject is now named N2').toBe(w.names.n2);
  } finally {
    await s.dispose();
  }
  expect(w.after.status, 'ROW-267 control: the history route answers the admin').toBe(200);
  expect(w.after.records, `ROW-267 control: the history holds a list of records — body: ${w.after.text.slice(0, 300)}`).not.toBeNull();
});

test('ROW-267.REQ-028.every-allowance-and-name-change-is-in-the-history', async () => {
  await world();
  const fresh = [w.names.n1, w.names.n2];
  for (const n of fresh) expect.soft(w.before.text.includes(n), `ROW-267 before: the history does not yet carry "${n}"`).toBe(false);
  for (const r of w.before.records ?? []) {
    expect.soft(recordCarriesNumber(r, w.allowances.a1) || recordCarriesNumber(r, w.allowances.a2), 'ROW-267 before: no record carries A1 or A2').toBe(false);
  }
  expect(w.after.records, `ROW-267: the history answers a list of records — body: ${w.after.text.slice(0, 300)}`).not.toBeNull();
  for (const c of w.changes) {
    expect.soft(recordFor(c), `ROW-267: the history lists the change ${c.what} — history: ${w.after.text.slice(0, 600)}`).toBeDefined();
  }
  for (const r of w.after.records ?? []) {
    expect.soft(recordCarriesString(r, w.names.otherNew), `ROW-267: the neighbour's rename is not in the subject's history — ${showRecord(r)}`).toBe(false);
    expect.soft(recordCarriesNumber(r, w.allowances.otherNew), `ROW-267: the neighbour's allowance is not in the subject's history — ${showRecord(r)}`).toBe(false);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-268 promise: REQ-028 fail-if (2) "a listed change lacks its old value, new value, who or when"; REQ-028 "each
// ROW-268   change with its old and new value …, who made it and when".
// ROW-268 wrong product: a history row of "name changed to N2" with no old value; one with the old value but no
// ROW-268   author; one stamped with the time it is read, or with the account's last-updated time on every row (the
// ROW-268   right "when" on the wrong items).
// ROW-268 given: the four changes of ROW-267, made by the admin (fresh name) at 10:17, 11:34, 13:05 and 14:46 team
// ROW-268   time on 8 Mar 2027. when: the admin reads the subject's history. then: each change's record (picked by its
// ROW-268   new value) carries its old value (N0, N1, A0, A0), the admin's name, and its own instant — not another's.
// ROW-268 controls: the control case shows each of the four changes is listed — the records the target inspects
// ROW-268   exist, so a failing target is a missing field, not a missing row (that is ROW-267's).
// ROW-268 technique: per-record checks (never "somewhere in the history"), with the instants hours apart so each
// ROW-268   "when" fits one change only.
// ROW-268 cases: ROW-268 target=ROW-268.REQ-028.each-listed-change-carries-old-new-who-and-when control=ROW-268.control.each-change-is-listed
test('ROW-268.control.each-change-is-listed', async () => {
  await world();
  for (const c of w.changes) expect(recordFor(c), `ROW-268 control: ${c.what} is listed`).toBeDefined();
});

test('ROW-268.REQ-028.each-listed-change-carries-old-new-who-and-when', async () => {
  await world();
  for (const c of w.changes) {
    const r = recordFor(c);
    expect.soft(r, `ROW-268: ${c.what} is listed`).toBeDefined();
    if (r === undefined) continue;
    expect.soft(c.hasOld(r), `ROW-268: ${c.what} carries its old value — ${showRecord(r)}`).toBe(true);
    expect.soft(recordCarriesString(r, w.install.admin.name), `ROW-268: ${c.what} carries who made it ("${w.install.admin.name}") — ${showRecord(r)}`).toBe(true);
    expect.soft(recordCarriesInstant(r, c.at, ZONE), `ROW-268: ${c.what} carries when it was made (${c.at}) — ${showRecord(r)}`).toBe(true);
    for (const o of w.changes.filter((x) => x !== c)) {
      expect.soft(recordCarriesInstant(r, o.at, ZONE), `ROW-268: ${c.what} does not carry another change's time (${o.at}) — ${showRecord(r)}`).toBe(false);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-274 promise: REQ-028 fail-if (4) "a listed allowance change lacks the year it starts"; REQ-028 "for allowances
// ROW-274   the year it starts".
// ROW-274 wrong product: an allowance row without its starting year (the reader cannot tell a correction of this
// ROW-274   year from a raise scheduled for next year); one recording a year only for next-year changes; one taking the
// ROW-274   year from the change's timestamp (always this year).
// ROW-274 given: the subject's two allowance changes — A2 starting 2028, then A1 starting 2027, both made in 2027.
// ROW-274   when: the admin reads the history. then: A2's record carries 2028 and A1's record carries 2027, each as a
// ROW-274   year on its own (a number, or "from 2027"), never only inside a timestamp.
// ROW-274 controls: the control case shows both allowance changes are listed (records carrying A2 and A1 exist).
// ROW-274 technique: the two sides of "starts" — this year and next year — made in the same year, so a year read off
// ROW-274   the timestamp is wrong for one of them; strict year reading so a timestamp never counts.
// ROW-274 cases: ROW-274 target=ROW-274.REQ-028.each-allowance-change-carries-the-year-it-starts control=ROW-274.control.both-allowance-changes-are-listed
test('ROW-274.control.both-allowance-changes-are-listed', async () => {
  await world();
  for (const c of w.changes.filter((x) => x.year !== undefined)) expect(recordFor(c), `ROW-274 control: ${c.what} is listed`).toBeDefined();
});

test('ROW-274.REQ-028.each-allowance-change-carries-the-year-it-starts', async () => {
  await world();
  for (const c of w.changes.filter((x) => x.year !== undefined)) {
    const r = recordFor(c);
    expect.soft(r, `ROW-274: ${c.what} is listed`).toBeDefined();
    if (r === undefined) continue;
    expect.soft(recordCarriesYear(r, c.year as number), `ROW-274: ${c.what} carries the year it starts, ${c.year} — ${showRecord(r)}`).toBe(true);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-269 promise: REQ-028 fail-if (3) "anyone but the admin sees the history"; INV-003 "only the admin … sees a
// ROW-269   person's change history"; the row: "by a page or by any data sent to them".
// ROW-269 wrong product: a history route that checks for a session but not the admin; a person's own page that
// ROW-269   embeds "formerly known as …"; a page payload or API answer (/api/me, the calendar) carrying the account's
// ROW-269   earlier names; a member allowed to read their own history.
// ROW-269 given: the subject, renamed N0→N1→N2 (N0 and N1 now live only in the history), and the neighbour, both
// ROW-269   members. when: the subject, on its own session, calls the history route for itself, the admin's person
// ROW-269   routes, and its own GET /api/me, /api/requests, /api/balance and /api/calendar, and loads every D-029 page in
// ROW-269   the browser; the neighbour calls the subject's history route and loads the subject's person page; an
// ROW-269   anonymous caller calls the history route. then: each history call answers non-2xx; no answer, no page
// ROW-269   document and no same-origin body a page load receives carries N0 or N1.
// ROW-269 controls: the control case shows the admin's history answer does carry N0 and N1, and the subject's
// ROW-269   session works (GET /api/me 200, named N2) — the secret exists and the probes are signed in.
// ROW-269 technique: the earlier names as fresh values only the history holds; every route and page, and every
// ROW-269   body they receive, as the denominator; three non-admin actors.
// ROW-269 cases: ROW-269 target=ROW-269.REQ-028.nobody-but-the-admin-sees-the-history control=ROW-269.control.the-admin-sees-the-earlier-names
test('ROW-269.control.the-admin-sees-the-earlier-names', async () => {
  await world();
  expect(w.after.text.includes(w.names.n0) && w.after.text.includes(w.names.n1), "ROW-269 control: the admin's history answer carries N0 and N1").toBe(true);
  const s = await signInMember(w.subject);
  try {
    const me = await getRaw(s.api, '/api/me');
    expect(me.status, "ROW-269 control: the subject's session works").toBe(200);
    expect(me.text.includes(w.names.n2), 'ROW-269 control: and is named N2').toBe(true);
  } finally {
    await s.dispose();
  }
});

test('ROW-269.REQ-028.nobody-but-the-admin-sees-the-history', async ({ browser }) => {
  await world();
  const secrets = [w.names.n0, w.names.n1];
  const leaked = (t: string) => secrets.filter((x) => t.includes(x));
  const history = `/api/admin/people/${encodeURIComponent(String(w.subject.id))}/history`;

  const subject = await signInMember(w.subject);
  const neighbour = await signInMember(w.other);
  try {
    const h = await getRaw(subject.api, history);
    expect.soft(is2xx(h.status), `ROW-269 subject: its own history route is refused (answered ${h.status})`).toBe(false);
    expect.soft(leaked(h.text), 'ROW-269 subject: the history route carries no earlier name').toEqual([]);
    for (const route of [
      `/api/admin/people/${encodeURIComponent(String(w.subject.id))}/requests`,
      '/api/admin/people',
      '/api/me',
      '/api/requests',
      '/api/balance',
      '/api/calendar?year=2027&month=3',
    ]) {
      const r = await getRaw(subject.api, route);
      expect.soft(leaked(r.text), `ROW-269 subject: ${route} (answered ${r.status}) carries no earlier name`).toEqual([]);
    }
    const opened = await openPage(browser, subject);
    try {
      for (const a of [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password, PAGES.adminPeople, PAGES.adminPerson(w.subject.id)]) {
        const load = await loadCapturing(opened.page, a);
        expect.soft(leaked(load.bodies.join('\n')), `ROW-269 subject: loading ${a} receives no earlier name`).toEqual([]);
      }
    } finally {
      await opened.close();
    }

    const n = await getRaw(neighbour.api, history);
    expect.soft(is2xx(n.status), `ROW-269 neighbour: the subject's history route is refused (answered ${n.status})`).toBe(false);
    expect.soft(leaked(n.text), "ROW-269 neighbour: the subject's history route carries no earlier name").toEqual([]);
    const nOpened = await openPage(browser, neighbour);
    try {
      const load = await loadCapturing(nOpened.page, PAGES.adminPerson(w.subject.id));
      expect.soft(leaked(load.bodies.join('\n')), "ROW-269 neighbour: loading the subject's person page receives no earlier name").toEqual([]);
    } finally {
      await nOpened.close();
    }

    const anon = await anonymousApi();
    try {
      const a = await getRaw(anon, history);
      expect.soft(is2xx(a.status), `ROW-269 anonymous: the history route is refused (answered ${a.status})`).toBe(false);
      expect.soft(leaked(a.text), 'ROW-269 anonymous: the history route carries no earlier name').toEqual([]);
    } finally {
      await anon.dispose();
    }
  } finally {
    await subject.dispose();
    await neighbour.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// Added, slice 1, brief test-author-11: ROW-268 read by D-043's own fields, and ROW-269 probed for the entries' facts.
// D-043: GET /api/admin/people/:id/history answers {history:[…]} newest first, a rename {at, by, what:'renamed', from,
// to} and an allowance change {at, by, what:'allowance set', from, to, startsYear}; `by` the maker's display name.
// ---------------------------------------------------------------------------------------------------

type Entry = Record<string, unknown>;

/** D-043's history list from a raw history answer's text: the `history` array's objects, or null when there is none. */
function entriesIn(text: string): Entry[] | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (body as { history?: unknown } | null)?.history;
  if (!Array.isArray(list)) return null;
  return list.filter((e): e is Entry => e !== null && typeof e === 'object' && !Array.isArray(e));
}

/** A field's value equals `want`: a name as its exact text (trimmed), an allowance as the number (a numeric text read as its number). */
function fieldIs(v: unknown, want: string | number): boolean {
  if (typeof want === 'number') return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number(v) === want;
  return typeof v === 'string' && v.trim() === want;
}

/** The four changes of the world with their raw old and new values, in the order they were made. */
function rawChanges(): { what: string; from: string | number; to: string | number; at: string }[] {
  const { n0, n1, n2 } = w.names;
  const { a0, a1, a2 } = w.allowances;
  return [
    { what: `rename "${n0}" → "${n1}"`, from: n0, to: n1, at: w.changes[0].at },
    { what: `rename "${n1}" → "${n2}"`, from: n1, to: n2, at: w.changes[1].at },
    { what: `allowance ${a0} → ${a2} starting ${THIS_YEAR + 1}`, from: a0, to: a2, at: w.changes[2].at },
    { what: `allowance ${a0} → ${a1} starting ${THIS_YEAR}`, from: a0, to: a1, at: w.changes[3].at },
  ];
}

// ROW-268 promise: REQ-028 fail-if (2) "a listed change lacks its old value, new value, who or when"; REQ-028 "each
// ROW-268   change with its old and new value …, who made it and when"; D-043 names the fields: from, to, by, at.
// ROW-268 wrong product: an entry listing a2 → a0 for the change from a0 to a2 (old and new swapped), or "Hanna →
// ROW-268   Greta" for the rename of Greta to Hanna; the by-value case above (the old value anywhere in the record)
// ROW-268   stays green on it; or `by` naming the person changed instead of the admin, `at` the time of the read.
// ROW-268 given: the four changes of ROW-267 (renames N0→N1 at 10:17, N1→N2 at 11:34; allowance A0→A2 from next year
// ROW-268   at 13:05, A0→A1 from this year at 14:46 team time, 8 Mar 2027), made by the admin (fresh name). when: the admin
// ROW-268   reads the subject's history. then: for each change exactly one entry's `to` is its new value, and that entry's
// ROW-268   `from` is its old value, its `by` the admin's name, its `at` its own instant (no other change's); no entry runs a
// ROW-268   change the other way (from its new value to its old one).
// ROW-268 controls: ROW-268.control.each-change-is-listed (above) — a record for each change exists, found by its new
// ROW-268   value wherever it sits, so it stands whichever way round a product stores the values: a red target here is a
// ROW-268   wrong field, not a missing change (ROW-267's).
// ROW-268 technique: the promised field per fact (D-043), the swapped entry as the decoy that must not match, the
// ROW-268   instants hours apart so each `at` fits one change only.
// ROW-268 cases: ROW-268 target=ROW-268.REQ-028.each-entry-carries-from-to-by-and-at-in-its-own-fields control=ROW-268.control.each-change-is-listed
test('ROW-268.REQ-028.each-entry-carries-from-to-by-and-at-in-its-own-fields', async () => {
  await world();
  const entries = entriesIn(w.after.text);
  expect(entries, `ROW-268: the history answers D-043's {history:[…]} — body: ${w.after.text.slice(0, 300)}`).not.toBeNull();
  const changes = rawChanges();
  for (const c of changes) {
    const hits = (entries ?? []).filter((e) => fieldIs(e.to, c.to));
    expect.soft(hits.length, `ROW-268: exactly one entry has to = ${JSON.stringify(c.to)} for the ${c.what} — ${w.after.text.slice(0, 600)}`).toBe(1);
    for (const e of hits) {
      expect.soft(fieldIs(e.from, c.from), `ROW-268: the ${c.what} has from = ${JSON.stringify(c.from)} — ${showRecord(e as Rec)}`).toBe(true);
      expect.soft(fieldIs(e.by, w.install.admin.name), `ROW-268: the ${c.what} has by = "${w.install.admin.name}" — ${showRecord(e as Rec)}`).toBe(true);
      expect.soft(recordCarriesInstant({ at: e.at as Rec[string] }, c.at, ZONE), `ROW-268: the ${c.what} has at = its instant ${c.at} — ${showRecord(e as Rec)}`).toBe(true);
      for (const o of changes.filter((x) => x !== c)) {
        expect.soft(recordCarriesInstant({ at: e.at as Rec[string] }, o.at, ZONE), `ROW-268: the ${c.what}'s at is not another change's (${o.at})`).toBe(false);
      }
    }
    const swapped = (entries ?? []).filter((e) => fieldIs(e.from, c.to) && fieldIs(e.to, c.from));
    expect.soft(swapped.map((e) => showRecord(e as Rec)), `ROW-268: no entry runs the ${c.what} the other way`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-269 promise: REQ-028 fail-if (3) "anyone but the admin sees the history"; the row: "by a page or by any data sent
// ROW-269   to them"; what the history holds is D-043's entries — the old and new values, the year an allowance change
// ROW-269   starts, who made it and when — so seeing the history is receiving any of those facts.
// ROW-269 wrong product: a member route or page that sends the person's allowance-change entries — {what:'allowance
// ROW-269   set', from: A0, to: A1, startsYear, by, at} in /api/me or /api/balance, "changed by <admin> at 14:46" on the own
// ROW-269   page, the entries in the page's payload — none of which carries an earlier NAME, so the case above stays green.
// ROW-269 given: the world of ROW-267 (the subject's allowance A0 → A2 from next year and A0 → A1 from this year, two
// ROW-269   renames, all by the admin at 10:17, 11:34, 13:05 and 14:46 team time), the neighbour renamed and given a fresh
// ROW-269   allowance. when: the subject, the neighbour and an anonymous caller GET the history routes and every member
// ROW-269   data route (/api/me, /api/requests, /api/balance, /api/calendar, /api/today, the admin's people, pending and
// ROW-269   person routes), and the subject and neighbour load the pages in the browser. then: no JSON answer or JSON body a
// ROW-269   page receives holds a history entry (an object whose what is 'renamed' or 'allowance set', carrying startsYear,
// ROW-269   or carrying from, to and by together), the subject's old allowance A0 as a number (the neighbour: A0, A1 or A2,
// ROW-269   the subject's allowances), the admin's name, or a change's instant (ISO or epoch); no page document or drawn
// ROW-269   text carries the admin's name, a change's instant or its team time (10:17, 11:34, 13:05, 14:46), and no drawn
// ROW-269   text the old allowance as a number of its own.
// ROW-269 controls: ROW-269.control.the-history-holds-the-entry-facts-and-the-page-capture-sees-data — the admin's
// ROW-269   history carries the allowance entry from A0 by the admin at 14:46 (the facts probed for exist and are what the
// ROW-269   history holds), and the subject's /calendar load receives an /api/ JSON body (the capture reaches page data).
// ROW-269 technique: the entries' facts as fresh values only the history holds (A0 is no year's allowance after the
// ROW-269   changes; the subject has no request, so no admin decided anything of theirs), D-043's entry shape as a
// ROW-269   structural probe, every member route and page as the denominator, three non-admin actors.
// ROW-269 cases: ROW-269 target=ROW-269.REQ-028.no-member-route-or-page-carries-the-history-entries control=ROW-269.control.the-history-holds-the-entry-facts-and-the-page-capture-sees-data

interface EntrySecrets {
  numbers: number[];
  strings: string[];
  instants: string[];
}

const ID_FIELD = /(^id$|Id$|_id$|^ids?$|Ids$)/;

/** Every way the JSON value carries a history entry or one of its facts, described. */
function jsonLeaks(v: unknown, s: EntrySecrets, key = ''): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) {
    for (const x of v) out.push(...jsonLeaks(x, s, key));
    return out;
  }
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.what === 'renamed' || o.what === 'allowance set') out.push(`a history entry (what: ${String(o.what)})`);
    if ('startsYear' in o) out.push('a startsYear field');
    if ('from' in o && 'to' in o && 'by' in o) out.push('an object with from, to and by');
    for (const [k, x] of Object.entries(o)) out.push(...jsonLeaks(x, s, k));
    return out;
  }
  if (typeof v === 'number' && !ID_FIELD.test(key)) {
    if (s.numbers.includes(v)) out.push(`the allowance ${v} (under "${key}")`);
    for (const i of s.instants) {
      const t = Date.parse(i);
      if (Math.abs(v - t) <= 60_000 || Math.abs(v * 1000 - t) <= 60_000) out.push(`the instant ${i} as ${v} (under "${key}")`);
    }
  }
  if (typeof v === 'string') out.push(...textLeaks(v, s, ''));
  return out;
}

/** Every way a text carries the admin's name or a change's instant (as ISO, to the minute in UTC, or parsed). */
function textLeaks(text: string, s: EntrySecrets, where: string): string[] {
  const out: string[] = [];
  for (const x of s.strings) if (carries(text, x)) out.push(`"${x}"${where}`);
  for (const i of s.instants) {
    if (text.includes(i.slice(0, 16))) out.push(`the instant ${i}${where}`);
  }
  return out;
}

/** Every way drawn text carries the facts: the strings, a change's team time, or an allowance as a number of its own. */
function drawnLeaks(text: string, s: EntrySecrets): string[] {
  const out = textLeaks(text, s, ' (drawn)');
  for (const i of s.instants) {
    const hhmm = teamTimeOf(i, ZONE);
    if (carries(text, hhmm)) out.push(`the team time ${hhmm} of ${i} (drawn)`);
  }
  for (const n of s.numbers) if (carries(text, String(n))) out.push(`the allowance ${n} (drawn)`);
  return out;
}

interface Captured {
  url: string;
  path: string;
  type: string;
  text: string;
}

/** Loads `address`, keeping every same-origin answer the load receives (its path, content type and text), the final document and its drawn text. */
async function loadKeeping(page: Page, address: string): Promise<{ status: number; bodies: Captured[]; html: string; drawn: string }> {
  const origin = new URL(productUrl()).origin;
  const pending: Promise<Captured | null>[] = [];
  const onResponse = (res: Response) => {
    let u: URL;
    try {
      u = new URL(res.url());
    } catch {
      return;
    }
    if (u.origin !== origin) return;
    const type = (res.headers()['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    pending.push(
      res
        .text()
        .then((text) => ({ url: res.url(), path: u.pathname, type, text }))
        .catch(() => null),
    );
  };
  page.on('response', onResponse);
  try {
    const response = await page.goto(address);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const bodies = (await Promise.all(pending)).filter((b): b is Captured => b !== null);
    const html = await page.content().catch(() => '');
    const drawn = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    return { status: response?.status() ?? 0, bodies, html, drawn };
  } finally {
    page.off('response', onResponse);
  }
}

/** Every leak of a page load: its /api/ JSON bodies read as data, its HTML and other JSON as text, its drawn text. Script, style and font bodies are code, not data, and are not read. */
function loadLeaks(load: { bodies: Captured[]; html: string; drawn: string }, s: EntrySecrets): string[] {
  const out: string[] = [];
  for (const b of load.bodies) {
    if (b.type.includes('json')) {
      let parsed: unknown;
      let ok = true;
      try {
        parsed = JSON.parse(b.text);
      } catch {
        ok = false;
      }
      if (ok && b.path.startsWith('/api/')) out.push(...jsonLeaks(parsed, s).map((x) => `${x} in ${b.path}`));
      else out.push(...textLeaks(b.text, s, ` in ${b.path}`));
    } else if (b.type.includes('html')) {
      out.push(...textLeaks(b.text, s, ` in ${b.path}`));
    }
  }
  out.push(...textLeaks(load.html, s, ' in the document'));
  out.push(...drawnLeaks(load.drawn, s));
  return [...new Set(out)];
}

/** Every leak of a raw data answer: as data when it is JSON, else as text. */
function answerLeaks(text: string, s: EntrySecrets): string[] {
  try {
    return [...new Set(jsonLeaks(JSON.parse(text), s))];
  } catch {
    return textLeaks(text, s, '');
  }
}

function changeInstants(): string[] {
  return w.changes.map((c) => c.at);
}

test('ROW-269.control.the-history-holds-the-entry-facts-and-the-page-capture-sees-data', async ({ browser }) => {
  await world();
  const entries = entriesIn(w.after.text) ?? [];
  const thisYear = entries.find((e) => fieldIs(e.to, w.allowances.a1));
  expect(thisYear, `ROW-269 control: the admin's history holds the allowance change to A1 — ${w.after.text.slice(0, 400)}`).toBeDefined();
  expect.soft(fieldIs(thisYear?.from, w.allowances.a0), 'ROW-269 control: its from is A0 (the old allowance probed for)').toBe(true);
  expect.soft(fieldIs(thisYear?.by, w.install.admin.name), "ROW-269 control: its by is the admin's name (the who probed for)").toBe(true);
  expect.soft(recordCarriesInstant({ at: (thisYear?.at ?? null) as Rec[string] }, w.changes[3].at, ZONE), 'ROW-269 control: its at is 14:46 (the when probed for)').toBe(true);
  const subject = await signInMember(w.subject);
  const opened = await openPage(browser, subject);
  try {
    const load = await loadKeeping(opened.page, PAGES.calendar);
    expect(load.status, 'ROW-269 control: /calendar answers the subject').toBe(200);
    expect(load.bodies.filter((b) => b.path.startsWith('/api/') && b.type.includes('json')).map((b) => b.path), 'ROW-269 control: the /calendar load receives /api/ JSON data').not.toEqual([]);
  } finally {
    await opened.close();
    await subject.dispose();
  }
});

test('ROW-269.REQ-028.no-member-route-or-page-carries-the-history-entries', async ({ browser }) => {
  test.setTimeout(180_000);
  await world();
  const { a0, a1, a2 } = w.allowances;
  const forSubject: EntrySecrets = { numbers: [a0], strings: [w.install.admin.name], instants: changeInstants() };
  const forOthers: EntrySecrets = { numbers: [a0, a1, a2], strings: [w.install.admin.name], instants: changeInstants() };
  const sid = encodeURIComponent(String(w.subject.id));
  const oid = encodeURIComponent(String(w.other.id));
  const routes = [
    `/api/admin/people/${sid}/history`,
    `/api/admin/people/${oid}/history`,
    `/api/admin/people/${sid}/requests`,
    `/api/admin/people/${sid}`,
    '/api/admin/people',
    '/api/admin/pending',
    '/api/me',
    '/api/requests',
    '/api/balance',
    '/api/calendar?year=2027&month=3',
    '/api/calendar?year=2028&month=1',
    '/api/today',
  ];
  const pages = [PAGES.home, PAGES.newRequest, PAGES.calendar, PAGES.password, PAGES.adminPending, PAGES.adminPeople, PAGES.adminPerson(w.subject.id), PAGES.adminPerson(w.other.id)];

  const subject = await signInMember(w.subject);
  const neighbour = await signInMember(w.other);
  try {
    for (const [label, actor, secrets] of [
      ['subject', subject, forSubject],
      ['neighbour', neighbour, forOthers],
    ] as const) {
      for (const route of routes) {
        const r = await getRaw(actor.api, route);
        if (route.endsWith('/history')) expect.soft(is2xx(r.status), `ROW-269 ${label}: ${route} is refused (answered ${r.status})`).toBe(false);
        expect.soft(answerLeaks(r.text, secrets), `ROW-269 ${label}: ${route} (answered ${r.status}) carries no history entry or fact`).toEqual([]);
      }
      const opened = await openPage(browser, actor);
      try {
        for (const address of pages) {
          const load = await loadKeeping(opened.page, address);
          expect.soft(loadLeaks(load, secrets), `ROW-269 ${label}: loading ${address} receives and draws no history entry or fact`).toEqual([]);
        }
      } finally {
        await opened.close();
      }
    }
    const anon = await anonymousApi();
    try {
      for (const route of [`/api/admin/people/${sid}/history`, `/api/admin/people/${sid}`]) {
        const a = await getRaw(anon, route);
        if (route.endsWith('/history')) expect.soft(is2xx(a.status), `ROW-269 anonymous: ${route} is refused (answered ${a.status})`).toBe(false);
        expect.soft(answerLeaks(a.text, forOthers), `ROW-269 anonymous: ${route} carries no history entry or fact`).toEqual([]);
      }
    } finally {
      await anon.dispose();
    }
  } finally {
    await subject.dispose();
    await neighbour.dispose();
  }
});

// ---------------------------------------------------------------------------------------------------
// The history as the person page draws it (added, slice 1, brief test-author-25; lesson L-1). Its own install, made
// after every case above has read the shared world, so it comes last in the file.
// ---------------------------------------------------------------------------------------------------
//
// Readings, stated once: an entry's ROW on the page is found by page-reading.ts findRows from the day the change was
// made, as the page draws it in English (each change made on its own day, so the day is the entry's own key): the
// innermost drawn element carrying that day, widened to the largest ancestor carrying no other change's day. Its TEXT
// is its innerText, whitespace collapsed. A name is matched as a whole name, a number as a whole number. The changes
// are made after 13:00 Auckland time, so the team's date and the UTC date agree (the browser zone is the container's
// UTC): a page formatting a date through the browser's zone is ROW-138's harm, not these rows'.

interface DrawnChange {
  key: string;
  kind: 'rename' | 'allowance';
  from: string | number;
  to: string | number;
  /** The team day it was made on (its key on the page) and its instant. */
  day: string;
  at: string;
  startsYear?: number;
}

interface PageWorld {
  install: Install;
  admin: Actor;
  subject: Member;
  names: { n0: string; n1: string; n2: string; otherNew: string };
  allowances: { a0: number; a1: number; a2: number; otherNew: number };
  changes: DrawnChange[];
  /** The neighbour's change day, drawn on nobody's page but the neighbour's. */
  otherDay: string;
  api: { status: number; records: Rec[] | null; text: string };
  page: { status: number; rows: FoundRow[]; body: string };
}

let pw: PageWorld;
let pageBuilt: Promise<PageWorld> | null = null;

async function pageWorld(browser: Browser): Promise<PageWorld> {
  pageBuilt ??= buildPageWorld(browser);
  pw = await pageBuilt;
  return pw;
}

async function buildPageWorld(browser: Browser): Promise<PageWorld> {
  const install = await resetProduct({ now: teamInstant(ZONE, '2027-03-01', '09:00'), timeZone: ZONE });
  const admin = await signIn(install.admin);
  const a0 = freshInt(120, 139);
  const a1 = freshInt(140, 159);
  const a2 = freshInt(160, 179);
  const otherAllowance = freshInt(180, 199);
  const n0 = freshName('Ilse');
  const n1 = freshName('Greta');
  const n2 = freshName('Hanna');
  const otherNew = freshName('Wanda');
  const subject = await createMember(admin, { name: n0, allowance: a0 });
  const other = await createMember(admin, { name: freshName('Oskar') });

  const changes: DrawnChange[] = [
    { key: 'rename N0 to N1', kind: 'rename', from: n0, to: n1, day: '2027-03-08', at: teamInstant(ZONE, '2027-03-08', '14:17') },
    { key: 'rename N1 to N2', kind: 'rename', from: n1, to: n2, day: '2027-03-10', at: teamInstant(ZONE, '2027-03-10', '15:34') },
    { key: 'allowance A0 to A2 from next year', kind: 'allowance', from: a0, to: a2, day: '2027-03-15', at: teamInstant(ZONE, '2027-03-15', '16:05'), startsYear: THIS_YEAR + 1 },
    { key: 'allowance A0 to A1 from this year', kind: 'allowance', from: a0, to: a1, day: '2027-03-19', at: teamInstant(ZONE, '2027-03-19', '17:46'), startsYear: THIS_YEAR },
  ];
  const otherDay = '2027-03-17';
  for (const c of changes) {
    if (c.day === '2027-03-19') {
      // the neighbour's changes, on a day of their own, before the last of the subject's
      await setClock(teamInstant(ZONE, otherDay, '16:30'));
      await rename(admin, other.id, otherNew);
      await setAllowance(admin, other.id, otherAllowance);
    }
    await setClock(c.at);
    if (c.kind === 'rename') await rename(admin, subject.id, String(c.to));
    else await setAllowance(admin, subject.id, Number(c.to), { startsNextYear: c.startsYear === THIS_YEAR + 1 });
  }
  await setClock(teamInstant(ZONE, '2027-03-22', '14:00'));
  const api = await readHistory(admin.api, subject.id);

  const opened = await openPage(browser, admin);
  let page: PageWorld['page'];
  try {
    const response = await opened.page.goto(PAGES.adminPerson(subject.id));
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const specs = changes.map((c) => ({ key: c.key, keys: [datePatterns(c.day)] }));
    let rows: FoundRow[] = [];
    await expect
      .poll(async () => (rows = await findRows(opened.page, specs)).filter((r) => r.found).length, { timeout: 15_000 })
      .toBe(specs.length)
      .catch(() => undefined);
    const body = (await opened.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    page = { status: response?.status() ?? 0, rows, body };
  } finally {
    await opened.close();
  }
  return {
    install,
    admin,
    subject,
    names: { n0, n1, n2, otherNew },
    allowances: { a0, a1, a2, otherNew: otherAllowance },
    changes,
    otherDay,
    api,
    page,
  };
}

test.afterAll(async () => {
  await pw?.admin.dispose().catch(() => undefined);
});

function drawnRow(c: DrawnChange): FoundRow | undefined {
  return pw.page.rows.find((r) => r.key === c.key);
}

function rowText(r: FoundRow | undefined): string {
  return (r?.text ?? '').replace(/\s+/g, ' ').trim();
}

/** Where a value is first drawn in `text`: a name as a whole name, a number as a whole number of its own; -1 when it is not. */
function drawnAt(text: string, v: string | number): number {
  const src = typeof v === 'number' ? `(?<![\\w.,])${v}(?![\\w])` : `(?<![\\w])${literal(v)}(?![\\w])`;
  const m = new RegExp(src).exec(text);
  return m ? m.index : -1;
}

/** The old value is drawn as the old one: before the new value in reading order, or right after an old-value word. */
function oldThenNew(text: string, from: string | number, to: string | number): boolean {
  const f = drawnAt(text, from);
  const t = drawnAt(text, to);
  if (f < 0 || t < 0) return false;
  if (f < t) return true;
  const oldWord = new RegExp(`\\b(?:from|old|was|before|previous(?:ly)?)\\b[^\\d]{0,25}${literal(String(from))}(?![\\w])`, 'i');
  const newWord = new RegExp(`\\b(?:to|new|now|after)\\b[^\\d]{0,25}${literal(String(to))}(?![\\w])`, 'i');
  return oldWord.test(text) && newWord.test(text);
}

/** `text` with every English rendering of `day` removed, together with a year written right after it. */
function withoutDay(text: string, day: string): string {
  let out = text;
  for (const src of datePatterns(day)) out = out.replace(new RegExp(`${src}(?:,?\\s*\\d{4}(?!\\d))?`, 'gi'), ' ');
  return out;
}

// ROW-268 promise: REQ-028 "On a person's requests page the admin sees that person's allowance and name change history,
// ROW-268   each change with its old and new value …, who made it and when"; fail-if (2) "a listed change lacks its old
// ROW-268   value, new value, who or when"; A-045 (the admin sees the history on that person's requests page).
// ROW-268 wrong product: a person page that re-draws the right API entries wrongly — the old and new value swapped
// ROW-268   ("Greta → Ilse" for the rename of Ilse to Greta, "a2 → a0" for a change from a0 to a2), only the new value
// ROW-268   ("renamed to Greta"), no author, or every entry stamped with the latest change's time or the time of the
// ROW-268   read (the right when on the wrong items) — while GET …/history stays right, so the API cases above stay green.
// ROW-268 given: Pacific/Auckland; the subject made on 1 Mar 2027 as N0 with allowance A0 (fresh); the admin (fresh
// ROW-268   name) renames N0 → N1 on Mon 8 Mar, N1 → N2 on Wed 10 Mar, sets A2 from next year on Mon 15 Mar and A1 from
// ROW-268   this year on Fri 19 Mar, each after 13:00; a neighbour is renamed and given a fresh allowance on Wed 17 Mar.
// ROW-268   when: on Mon 22 Mar the admin opens the subject's page /admin/people/:id in the browser. then: each change's
// ROW-268   entry (found by the day it was made) is drawn once, carries no other change's day, draws its old value as
// ROW-268   the old one (before the new value, or after an old-value word: from, old, was) and its new value, and the
// ROW-268   admin's name.
// ROW-268 controls: ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes — the page answers
// ROW-268   200 drawing the subject's current name N2, and the API history lists the four changes by their new values:
// ROW-268   the setup worked and the page is reached, whatever the page draws of the history.
// ROW-268 technique: per entry, on the entry's own drawn row (never "somewhere on the page"); the swapped entry as the
// ROW-268   near miss; each change on its own day so a when on the wrong entry is seen; fresh names and numbers.
// ROW-268 cases: ROW-268 target=ROW-268.REQ-028.each-entry-drawn-on-the-person-page-shows-old-then-new-who-and-when control=ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes
test('ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes', async ({ browser }) => {
  await pageWorld(browser);
  expect(pw.page.status, 'ROW-268 control: the person page answers the admin').toBe(200);
  expect(drawnAt(pw.page.body, pw.names.n2), "ROW-268 control: the person page draws the subject's current name N2").toBeGreaterThanOrEqual(0);
  const entries = entriesIn(pw.api.text) ?? [];
  for (const c of pw.changes) {
    expect(entries.filter((e) => fieldIs(e.to, c.to)).length, `ROW-268 control: the API history lists the ${c.key} — ${pw.api.text.slice(0, 400)}`).toBe(1);
  }
});

test('ROW-268.REQ-028.each-entry-drawn-on-the-person-page-shows-old-then-new-who-and-when', async ({ browser }) => {
  await pageWorld(browser);
  for (const c of pw.changes) {
    const r = drawnRow(c);
    const text = rowText(r);
    const say = `ROW-268 the ${c.key} (made ${c.day}) on the person page`;
    expect.soft(r?.found, `${say}: its entry is drawn — the page draws: ${JSON.stringify(pw.page.body.slice(0, 1500))}`).toBe(true);
    if (!r?.found) continue;
    expect.soft(r.repeated, `${say}: drawn in one place`).toBe(false);
    for (const o of pw.changes.filter((x) => x !== c)) {
      expect.soft(datePatterns(o.day).some((src) => new RegExp(src, 'i').test(text)), `${say}: carries no other change's day (${o.day}) — "${text}"`).toBe(false);
    }
    expect.soft(drawnAt(text, c.to), `${say}: draws its new value ${JSON.stringify(c.to)} — "${text}"`).toBeGreaterThanOrEqual(0);
    expect.soft(drawnAt(text, c.from), `${say}: draws its old value ${JSON.stringify(c.from)} — "${text}"`).toBeGreaterThanOrEqual(0);
    expect.soft(oldThenNew(text, c.from, c.to), `${say}: draws ${JSON.stringify(c.from)} as the old value and ${JSON.stringify(c.to)} as the new one, never the other way — "${text}"`).toBe(true);
    expect.soft(drawnAt(text, pw.install.admin.name), `${say}: draws who made it ("${pw.install.admin.name}") — "${text}"`).toBeGreaterThanOrEqual(0);
  }
});

// ROW-267 promise: REQ-028 fail-if (1) "an allowance or name change is missing from the history"; A-045 (the admin sees
// ROW-267   each person's change history on that person's requests page).
// ROW-267 wrong product: a person page that draws only the latest rename, or the renames and not the allowance changes,
// ROW-267   or loses the next-year change once a this-year change follows, or draws everybody's changes on each person —
// ROW-267   while the API history the cases above read stays whole.
// ROW-267 given: the world of the ROW-268 page case (four changes of the subject on 8, 10, 15 and 19 Mar 2027; the
// ROW-267   neighbour's rename and allowance on 17 Mar). when: the admin opens the subject's page. then: an entry is drawn
// ROW-267   for each of the four, carrying its new value; the page draws neither the neighbour's new name, nor its new
// ROW-267   allowance, nor the neighbour's change day.
// ROW-267 controls: ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes — the page is reached
// ROW-267   and the four changes exist in the API history.
// ROW-267 technique: two changes of each kind in sequence (the second must not replace the first), each on its own day,
// ROW-267   and the neighbour as the decoy that must not be drawn.
// ROW-267 cases: ROW-267 target=ROW-267.REQ-028.every-change-is-drawn-on-the-person-page control=ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes
test('ROW-267.REQ-028.every-change-is-drawn-on-the-person-page', async ({ browser }) => {
  await pageWorld(browser);
  for (const c of pw.changes) {
    const r = drawnRow(c);
    expect.soft(r?.found, `ROW-267: the ${c.key} (made ${c.day}) is drawn on the person page — the page draws: ${JSON.stringify(pw.page.body.slice(0, 1500))}`).toBe(true);
    if (r?.found) expect.soft(drawnAt(rowText(r), c.to), `ROW-267: its entry carries the new value ${JSON.stringify(c.to)} — "${rowText(r)}"`).toBeGreaterThanOrEqual(0);
  }
  expect.soft(drawnAt(pw.page.body, pw.names.otherNew), "ROW-267: the neighbour's rename is not drawn on the subject's page").toBe(-1);
  expect.soft(drawnAt(pw.page.body, pw.allowances.otherNew), "ROW-267: the neighbour's new allowance is not drawn on the subject's page").toBe(-1);
  expect.soft(datePatterns(pw.otherDay).some((src) => new RegExp(src, 'i').test(pw.page.body)), "ROW-267: the neighbour's change day is not drawn on the subject's page").toBe(false);
});

// ROW-274 promise: REQ-028 fail-if (4) "a listed allowance change lacks the year it starts"; REQ-028 "for allowances
// ROW-274   the year it starts", on the person's requests page.
// ROW-274 wrong product: a person page whose allowance entries draw the value and the date but not the starting year,
// ROW-274   or a starting year read off the change's own date (2027 for both), while the API's startsYear is right.
// ROW-274 given: the world of the ROW-268 page case: A2 from next year (2028) set on 15 Mar 2027, A1 from this year
// ROW-274   (2027) set on 19 Mar 2027. when: the admin opens the subject's page. then: with the change's own drawn date
// ROW-274   (and a year written right after it) removed, A2's entry still draws 2028 and A1's entry still draws 2027.
// ROW-274 controls: ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes — the page is reached
// ROW-274   and both allowance changes exist in the API history.
// ROW-274 technique: both sides of "starts" made in the same year, so a year taken from the date is wrong for one; the
// ROW-274   date's own year removed before the year is looked for, so a date never counts as the starting year.
// ROW-274 cases: ROW-274 target=ROW-274.REQ-028.each-allowance-entry-drawn-on-the-person-page-shows-the-year-it-starts control=ROW-268.control.the-person-page-answers-and-the-history-holds-the-four-changes
test('ROW-274.REQ-028.each-allowance-entry-drawn-on-the-person-page-shows-the-year-it-starts', async ({ browser }) => {
  await pageWorld(browser);
  for (const c of pw.changes.filter((x) => x.startsYear !== undefined)) {
    const r = drawnRow(c);
    expect.soft(r?.found, `ROW-274: the ${c.key} (made ${c.day}) is drawn on the person page`).toBe(true);
    if (!r?.found) continue;
    const rest = withoutDay(rowText(r), c.day);
    expect.soft(drawnAt(rest, c.startsYear as number), `ROW-274: the ${c.key} draws the year it starts, ${c.startsYear}, apart from its date — "${rowText(r)}"`).toBeGreaterThanOrEqual(0);
  }
});
