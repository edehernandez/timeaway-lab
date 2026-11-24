// Purpose: ledger tests for ROW-267, ROW-268, ROW-269 and ROW-274 (REQ-028) — a person's allowance and name change history lists every change, each with its old and new value, who made it and when, allowance changes with the year they start, and nobody but the admin sees it.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 7); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, rename, setAllowance), fresh per run, made once per worker and only read by its cases.
//
// Boundary (R6): a record rule, proved at the HTTP harness on D-029's GET /api/admin/people/:id/history (the data of
// the history on the person's requests page, A-045), read by value as admin-kit states at its head — no field
// naming is imposed. ROW-269's "by a page or by any data sent to them" adds the browser (harness openPage,
// Chromium) to watch every body a page load receives.
// Time: each change is made at its own team-clock instant, hours apart, so every "when" belongs to one change only.
import { test, expect } from '@playwright/test';
import {
  anonymousApi,
  createMember,
  DEFAULT_TIME_ZONE,
  freshName,
  openPage,
  PAGES,
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
