// Purpose: ledger tests for ROW-288, ROW-289, ROW-290, ROW-291 and ROW-293 (REQ-029) — on a member's own requests page each request shows what that member can do with it: a cancel control only on a pending request with no weekday before today (and that control cancels it), "only the admin can cancel it" on an approved request with a Monday to Friday day in effect from today on, "the admin decides it" on a pending request with a weekday before today, and neither wording on any other request.
// Provenance: hand-authored (test-author pass, fix-2026-11-25, brief test-author-1); fixture data made through the product's public routes by harness.ts and request-rules.ts (reset, the team clock, accounts, requests, the admin's two-step approve, reject and cancel, a person's own cancel), fresh per run; the page read and operated through request-actions.ts.
//
// Boundary (R6): what the own page offers and says is paint and operation — read on "/" in the member's browser
// (engine door, Chromium); what an operated cancel did is read at the HTTP harness (GET /api/requests).
// Readings (the row, a cancel control, the two wordings): request-actions.ts, stated once at its head.
// Time: team zone Pacific/Kiritimati (UTC+14, request-rules.ts). In the main world "today" T is a Tuesday at 09:00
// there, when the UTC date is still Monday, so a product reading the container's date stands one day early (BASELINE
// "Test environment"); the year is fresh per run (2031–2058). Every request is sent, and decided where it is decided,
// at S0 = T − 28, before any of its days.
//
// The main world (offsets in days from T, a Tuesday):
//   Ilse  I1 approved vacation  Thu T−5 … Mon T−1    its last weekday in effect is yesterday: none from today on
//         I2 approved vacation  Tue T   … Tue T      its one weekday in effect from today on is today itself
//         I3 pending  sick      Thu T+2 … Fri T+3    no weekday before today
//         I4 rejected vacation  Mon T+20 … Tue T+21
//         I5 cancelled vacation Mon T+27 … Tue T+28  cancelled by Ilse while pending
//   Oskar O1 pending  vacation  Mon T−1 … Wed T+1    a weekday before today (yesterday) and days still to come
//         O2 approved vacation  Mon T+6 … Tue T+7    wholly to come
//         O3 pending  vacation  Thu T+9 … Fri T+10   no weekday before today
//         O4 rejected sick      Thu T−5 … Fri T−4    its days passed
//   Petra P1 approved vacation  Mon T−8 … Fri T+3    the admin cancels it at T: in effect Mon T−8 … Mon T−1 only,
//                                                    though its last day as sent is still to come
//         P2 approved vacation  Mon T+6 … Fri T+17   the admin cancels it at T+13, then the clock is set back to T:
//                                                    in effect Mon T+6 … Sun T+12, five weekdays still to come
//         P3 cancelled vacation Mon T+20 … Tue T+21  approved, then cancelled whole by the admin at T
// P2's state is reachable only through the clock door set back: the admin's cancel always starts at its own today, so
// a partly cancelled request keeps in-effect weekdays from today on only when today is later set earlier. ROW-289
// names the case; this is the one public path to it.
// The admin is named with a fresh name that does not carry the word "admin", so "Approved by <name>" never reads as
// either wording; the readings also accept the admin's display name in place of the word.
import { test, expect, type Browser } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshName,
  openPage,
  reject,
  resetProduct,
  sendRequest,
  SetupError,
  signIn,
  signInMember,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import { addDays, day, moveClock, onOrAfter, ownRequests, pickYear, randomInt, teamAt, TEAM_ZONE, type Team } from './request-rules';
import { saysState, type ShownState } from './own-page';
import {
  actionRow,
  cancelControlsIn,
  openConfirmationStep,
  readActionRows,
  readOwnActions,
  requestRow,
  saysAdminDecides,
  saysOnlyAdminCancels,
  type ActionPage,
  type DayRange,
} from './request-actions';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const Y = pickYear();

// ---------------------------------------------------------------------------------------------------
// The main world
// ---------------------------------------------------------------------------------------------------

const T = onOrAfter(day(Y, 5, 12), 2); // a Tuesday
const at = (n: number) => addDays(T, n);
const S0 = at(-28);

type Who = 'ilse' | 'oskar' | 'petra';
type Fate = 'pending' | 'approve' | 'reject' | 'own-cancel' | 'cancel-at-T' | 'cancel-at-T+13';

interface Planned extends DayRange {
  who: Who;
  kind: 'vacation' | 'sick';
  fate: Fate;
  state: ShownState;
}

const PLAN: Planned[] = [
  { label: 'I1', who: 'ilse', kind: 'vacation', firstDay: at(-5), lastDay: at(-1), fate: 'approve', state: 'approved' },
  { label: 'I2', who: 'ilse', kind: 'vacation', firstDay: at(0), lastDay: at(0), fate: 'approve', state: 'approved' },
  { label: 'I3', who: 'ilse', kind: 'sick', firstDay: at(2), lastDay: at(3), fate: 'pending', state: 'pending' },
  { label: 'I4', who: 'ilse', kind: 'vacation', firstDay: at(20), lastDay: at(21), fate: 'reject', state: 'rejected' },
  { label: 'I5', who: 'ilse', kind: 'vacation', firstDay: at(27), lastDay: at(28), fate: 'own-cancel', state: 'cancelled' },
  { label: 'O1', who: 'oskar', kind: 'vacation', firstDay: at(-1), lastDay: at(1), fate: 'pending', state: 'pending' },
  { label: 'O2', who: 'oskar', kind: 'vacation', firstDay: at(6), lastDay: at(7), fate: 'approve', state: 'approved' },
  { label: 'O3', who: 'oskar', kind: 'vacation', firstDay: at(9), lastDay: at(10), fate: 'pending', state: 'pending' },
  { label: 'O4', who: 'oskar', kind: 'sick', firstDay: at(-5), lastDay: at(-4), fate: 'reject', state: 'rejected' },
  { label: 'P1', who: 'petra', kind: 'vacation', firstDay: at(-8), lastDay: at(3), fate: 'cancel-at-T', state: 'approved' },
  { label: 'P2', who: 'petra', kind: 'vacation', firstDay: at(6), lastDay: at(17), fate: 'cancel-at-T+13', state: 'approved' },
  { label: 'P3', who: 'petra', kind: 'vacation', firstDay: at(20), lastDay: at(21), fate: 'cancel-at-T', state: 'cancelled' },
];

const planned = (label: string): Planned => {
  const p = PLAN.find((x) => x.label === label);
  if (!p) throw new Error(`no planned request ${label}`);
  return p;
};
const pageOf = (who: Who): Planned[] => PLAN.filter((p) => p.who === who);

interface World {
  adminName: string;
  admin: Actor;
  people: Record<Who, Actor>;
  ids: Record<string, AccountId>;
}

/**
 * Builds the main world (the header's table) through the public routes: a fresh install at S0, three members, every
 * request sent and decided at S0; the admin's cancels at T and at T+13; the clock set to T. Every state is then read
 * back on each person's own list, and a mismatch is a SETUP failure naming it, never a row's.
 */
async function mainWorld(): Promise<World> {
  const adminName = freshName('Ines');
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(S0), admin: { name: adminName, allowance: randomInt(25, 35) } });
  const admin = keep(await signIn(install.admin));
  const members: Member[] = [];
  const actors: Actor[] = [];
  for (const label of ['Ilse', 'Oskar', 'Petra']) {
    const m = await createMember(admin, { name: freshName(label), allowance: randomInt(26, 36) });
    members.push(m);
    actors.push(keep(await signInMember(m)));
  }
  const people: Record<Who, Actor> = { ilse: actors[0], oskar: actors[1], petra: actors[2] };
  const team: Team = { install, admin, members, people: actors, dispose: async () => undefined };

  const ids: Record<string, AccountId> = {};
  for (const p of PLAN) ids[p.label] = await sendRequest(people[p.who], { kind: p.kind, firstDay: p.firstDay, lastDay: p.lastDay });
  for (const p of PLAN) {
    if (p.fate === 'approve' || p.fate === 'cancel-at-T' || p.fate === 'cancel-at-T+13') await approve(admin, ids[p.label]);
    if (p.fate === 'reject') await reject(admin, ids[p.label]);
    if (p.fate === 'own-cancel') await cancelOwnRequest(people[p.who], ids[p.label]);
  }
  await moveClock(team, teamAt(T));
  for (const p of PLAN) if (p.fate === 'cancel-at-T') await adminCancel(admin, ids[p.label]);
  await moveClock(team, teamAt(at(13)));
  for (const p of PLAN) if (p.fate === 'cancel-at-T+13') await adminCancel(admin, ids[p.label]);
  await moveClock(team, teamAt(T));

  const wrong: string[] = [];
  for (const who of ['ilse', 'oskar', 'petra'] as Who[]) {
    const listed = await ownRequests(people[who]);
    for (const p of pageOf(who)) {
      const r = listed.find((x) => String(x.id) === String(ids[p.label]));
      if (!r || r.state.toLowerCase().replace('canceled', 'cancelled') !== p.state) wrong.push(`${p.label} is ${r?.state ?? 'not listed'}, not ${p.state}`);
    }
  }
  if (wrong.length) throw new SetupError(`the main world did not come out as built: ${wrong.join('; ')}`);
  return { adminName, admin, people, ids };
}

/** Reads the own pages of the given people, each with every request of theirs as the row bounds. */
async function readPages(browser: Browser, w: World, who: Who[]): Promise<Record<string, ActionPage>> {
  const out: Record<string, ActionPage> = {};
  for (const x of who) out[x] = await readOwnActions(browser, w.people[x], pageOf(x));
  return out;
}

function rowFor(pages: Record<string, ActionPage>, label: string) {
  return actionRow(pages[planned(label).who], label);
}

// =====================================================================================================
// ROW-288 — no cancel control on a request the member cannot cancel
// =====================================================================================================
// ROW-288 promise: REQ-029 fail-if (1) "the page offers a cancel control on a request the signed-in person cannot
// ROW-288   cancel"; REQ-029 "a cancel control appears only on a request they can cancel — their pending request with
// ROW-288   no weekday before today …"; A-060 (a pending request with a weekday before today no longer offers a cancel
// ROW-288   that is always refused); REQ-005 AMENDED (a person other than the admin never cancels their own approved,
// ROW-288   rejected or cancelled request, nor a pending one with a weekday before today).
// ROW-288 wrong product: the page as graded — Cancel on every pending request, O1 included (its Monday passed, so
// ROW-288   the server always refuses it); or one that judges "a weekday before today" from the UTC date (O1's Monday
// ROW-288   is "today" there) or from the last day instead of the first; or one offering Cancel on anything with days
// ROW-288   still to come (I2, O2, P2, P1 by its last day as sent, I4, P3).
// ROW-288 given: the main world (header table). when: Ilse, Oskar and Petra each open "/" in their browser.
// ROW-288 then: the rows of I1, I2, I4, I5, O1, O2, O4, P1, P2 and P3 are each found, and none carries a cancel
// ROW-288   control — every case the row names: approved with days to come (I2, O2, P2), pending with a weekday before
// ROW-288   today (O1), rejected (I4, O4), cancelled (I5, P3), approved with every day in effect before today (I1, P1).
// ROW-288 controls: on the same pages, I3 and O3 (pending, no weekday before today) each carry a cancel control —
// ROW-288   the rows are found and the reading sees a cancel control where one belongs.
// ROW-288 technique: the threshold of today from both sides (O1 from yesterday-Monday against O3 from Thursday; I1
// ROW-288   ending yesterday against I2 on today), the clock's origin (UTC+14 at 09:00), decoys on the same pages.
// ROW-288 cases: ROW-288 target=ROW-288.REQ-029.no-cancel-control-on-a-request-the-member-cannot-cancel control=ROW-288.control.pending-requests-with-no-weekday-before-today-carry-a-cancel-control
test('ROW-288.control.pending-requests-with-no-weekday-before-today-carry-a-cancel-control', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar']);
  for (const label of ['I3', 'O3']) {
    const r = rowFor(pages, label);
    expect.soft(r.found, `ROW-288 control: ${label}'s row is on its owner's page`).toBe(true);
    expect.soft(r.cancelControls.length, `ROW-288 control: ${label} (pending, no weekday before today) carries a cancel control — row: ${JSON.stringify(r.text)}`).toBeGreaterThan(0);
  }
});

test('ROW-288.REQ-029.no-cancel-control-on-a-request-the-member-cannot-cancel', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar', 'petra']);
  const cases: [string, string][] = [
    ['I2', 'approved, its one weekday in effect is today'],
    ['O2', 'approved, wholly to come'],
    ['P2', 'approved and partly cancelled, five weekdays in effect still to come'],
    ['O1', 'pending with a weekday before today (yesterday)'],
    ['I4', 'rejected, days to come'],
    ['O4', 'rejected, days passed'],
    ['I5', 'cancelled by the member'],
    ['P3', 'cancelled whole by the admin'],
    ['I1', 'approved, every day in effect before today'],
    ['P1', 'approved and partly cancelled, every day in effect before today though its last day as sent is to come'],
  ];
  for (const [label, what] of cases) {
    const r = rowFor(pages, label);
    expect.soft(r.found, `ROW-288: ${label}'s row (${what}) is on its owner's page`).toBe(true);
    expect.soft(r.cancelControls, `ROW-288: ${label} (${what}) carries no cancel control — row: ${JSON.stringify(r.text)}`).toEqual([]);
  }
});

// =====================================================================================================
// ROW-289 — an approved request with a weekday in effect from today on says only the admin can cancel it
// =====================================================================================================
// ROW-289 promise: REQ-029 fail-if (2) "for a person other than the admin, an approved request that still has a
// ROW-289   Monday to Friday day in effect from today on is shown without saying that only the admin can cancel it";
// ROW-289   A-060 (the own page tells a person what they can do with a request); F-155 ("in effect", not as sent).
// ROW-289 wrong product: the page as graded — an approved request shown with no word at all; or one that says it
// ROW-289   only for requests not yet started, or only when a day after today remains (I2's one day is today), or that
// ROW-289   keys the wording on "no cancel recorded" and so stays silent on a partly cancelled request (P2).
// ROW-289 given: the main world. when: Ilse, Oskar and Petra open "/". then: the rows of I2 (only today in effect
// ROW-289   from today on), O2 (wholly to come) and P2 (partly cancelled, five weekdays in effect still to come) each
// ROW-289   say that only the admin can cancel it (request-actions.ts ONLY_ADMIN_CANCELS), in that request's own row.
// ROW-289 controls: the same three rows are found and show the state "approved" — the page is reached and each
// ROW-289   row is the right request.
// ROW-289 technique: the threshold of today (a request whose only remaining weekday is today), both cases the row
// ROW-289   names (whole; partly cancelled), the wording read inside one request's row, never anywhere on the page;
// ROW-289   ROW-293 is the near miss (the same reading must not fire on the other kinds).
// ROW-289 cases: ROW-289 target=ROW-289.REQ-029.approved-requests-with-days-to-come-say-only-the-admin-can-cancel control=ROW-289.control.the-approved-requests-are-shown-approved
test('ROW-289.control.the-approved-requests-are-shown-approved', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar', 'petra']);
  for (const label of ['I2', 'O2', 'P2']) {
    const r = rowFor(pages, label);
    expect.soft(r.found, `ROW-289 control: ${label}'s row is on its owner's page`).toBe(true);
    expect.soft(saysState(r.text, 'approved'), `ROW-289 control: ${label}'s row shows "approved" — row: ${JSON.stringify(r.text)}`).toBe(true);
  }
});

test('ROW-289.REQ-029.approved-requests-with-days-to-come-say-only-the-admin-can-cancel', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar', 'petra']);
  const cases: [string, string][] = [
    ['I2', 'a whole approved request whose one weekday in effect is today'],
    ['O2', 'a whole approved request wholly to come'],
    ['P2', 'a partly cancelled request with five weekdays in effect still to come'],
  ];
  for (const [label, what] of cases) {
    const r = rowFor(pages, label);
    expect.soft(r.found, `ROW-289: ${label}'s row (${what}) is on its owner's page`).toBe(true);
    expect.soft(saysOnlyAdminCancels(r.text, w.adminName), `ROW-289: ${label} (${what}) says that only the admin can cancel it — row: ${JSON.stringify(r.text)}`).toBe(true);
  }
});

// =====================================================================================================
// ROW-290 — a pending request with a weekday before today says the admin decides it
// =====================================================================================================
// ROW-290 promise: REQ-029 fail-if (3) "for a person other than the admin, a pending request with a weekday before
// ROW-290   today is shown without saying that the admin decides it"; A-038 (once it has a weekday before today the
// ROW-290   admin approves or rejects it); A-060.
// ROW-290 wrong product: the page as graded — such a request shown "pending" with a Cancel that is always refused
// ROW-290   and no word; or one that says it only once every day has passed (last day before today), or that reads
// ROW-290   today from the UTC date (where O1's Monday is today, so no weekday is before it).
// ROW-290 given: the main world; Oskar's O1 runs Mon T−1 … Wed T+1, pending, today Tuesday 09:00 at UTC+14. when:
// ROW-290   Oskar opens "/". then: O1's row says that the admin decides it (request-actions.ts ADMIN_DECIDES).
// ROW-290 controls: O1's row is found and shows the state "pending" — the page is reached and the row is O1's.
// ROW-290 technique: the threshold of today (its one weekday before today is yesterday), the clock's origin, a
// ROW-290   request with days still to come (so "all days passed" does not stand in for "a weekday before today");
// ROW-290   O3 on the same page is the near miss ROW-293 reads.
// ROW-290 cases: ROW-290 target=ROW-290.REQ-029.a-pending-request-with-a-weekday-before-today-says-the-admin-decides-it control=ROW-290.control.the-started-pending-request-is-shown-pending
test('ROW-290.control.the-started-pending-request-is-shown-pending', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['oskar']);
  const r = rowFor(pages, 'O1');
  expect(r.found, "ROW-290 control: O1's row is on Oskar's page").toBe(true);
  expect(saysState(r.text, 'pending'), `ROW-290 control: O1's row shows "pending" — row: ${JSON.stringify(r.text)}`).toBe(true);
});

test('ROW-290.REQ-029.a-pending-request-with-a-weekday-before-today-says-the-admin-decides-it', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['oskar']);
  const r = rowFor(pages, 'O1');
  expect(r.found, "ROW-290: O1's row is on Oskar's page").toBe(true);
  expect(saysAdminDecides(r.text, w.adminName), `ROW-290: O1 (pending, Monday before today) says that the admin decides it — row: ${JSON.stringify(r.text)}`).toBe(true);
});

// =====================================================================================================
// ROW-293 — neither wording on a request that is not of its kind
// =====================================================================================================
// ROW-293 promise: REQ-029 fail-if (6) "a request says that only the admin can cancel it, or that the admin decides
// ROW-293   it, when it is not a request of that kind"; REQ-029 (the two wordings belong to an approved request with a
// ROW-293   Monday to Friday day in effect from today on, and to a pending request with a weekday before today); F-155
// ROW-293   ("in effect" throughout).
// ROW-293 wrong product: one printing "only the admin can cancel" on every approved request, or judging it by the
// ROW-293   last day as sent (P1, whose sent range reaches T+3 though nothing is in effect from today on) or by the UTC
// ROW-293   date (I1's last day, yesterday, is "today" there); one printing "the admin decides it" on every pending
// ROW-293   request, or on any request whose days have passed (O4 rejected); one printing either on a rejected or a
// ROW-293   cancelled request.
// ROW-293 given: the main world. when: Ilse, Oskar and Petra open "/". then: the rows of I3 and O3 (pending, no
// ROW-293   weekday before today), I1 and P1 (approved, every day in effect before today), I4 and O4 (rejected), I5 and
// ROW-293   P3 (cancelled) are each found and say neither wording.
// ROW-293 controls: the same rows are found and each shows its state word (pending, approved, rejected, cancelled) —
// ROW-293   the rows read are those requests, so silence is about the wording, not a missing row.
// ROW-293 technique: near misses for both wordings, each just across its threshold (I1 ends yesterday; P1's sent
// ROW-293   range crosses today; I3 starts the day after tomorrow, O3 next week), every state the row names.
// ROW-293 cases: ROW-293 target=ROW-293.REQ-029.no-admin-wording-on-a-request-that-is-not-of-its-kind control=ROW-293.control.the-other-requests-are-shown-with-their-states
const ROW_293_CASES: [string, string][] = [
  ['I3', 'pending, no weekday before today'],
  ['O3', 'pending, no weekday before today'],
  ['I1', 'approved, every day in effect before today'],
  ['P1', 'approved and partly cancelled, every day in effect before today'],
  ['I4', 'rejected'],
  ['O4', 'rejected, days passed'],
  ['I5', 'cancelled by the member'],
  ['P3', 'cancelled by the admin'],
];

test('ROW-293.control.the-other-requests-are-shown-with-their-states', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar', 'petra']);
  for (const [label, what] of ROW_293_CASES) {
    const r = rowFor(pages, label);
    const state = planned(label).state;
    expect.soft(r.found, `ROW-293 control: ${label}'s row (${what}) is on its owner's page`).toBe(true);
    expect.soft(saysState(r.text, state), `ROW-293 control: ${label}'s row shows "${state}" — row: ${JSON.stringify(r.text)}`).toBe(true);
  }
});

test('ROW-293.REQ-029.no-admin-wording-on-a-request-that-is-not-of-its-kind', async ({ browser }) => {
  const w = await mainWorld();
  const pages = await readPages(browser, w, ['ilse', 'oskar', 'petra']);
  for (const [label, what] of ROW_293_CASES) {
    const r = rowFor(pages, label);
    expect.soft(r.found, `ROW-293: ${label}'s row (${what}) is on its owner's page`).toBe(true);
    expect.soft(saysOnlyAdminCancels(r.text, w.adminName), `ROW-293: ${label} (${what}) does not say that only the admin can cancel it — row: ${JSON.stringify(r.text)}`).toBe(false);
    expect.soft(saysAdminDecides(r.text, w.adminName), `ROW-293: ${label} (${what}) does not say that the admin decides it — row: ${JSON.stringify(r.text)}`).toBe(false);
  }
});

// =====================================================================================================
// ROW-291 — a pending request with no weekday before today carries a cancel control, and it cancels it
// =====================================================================================================
// The weekend world (offsets in days from T2, a Monday at 09:00 UTC+14 — the UTC date is Sunday; sent and decided at
// T2 − 28): Ilse W1 pending vacation Sat T2−2 … Tue T2+1 (days before today, none a weekday); W2 pending vacation
// Thu T2+3 … Fri T2+4; W3 pending sick Thu T2−4 … Fri T2−3 (weekdays before today); W4 approved vacation Mon T2+7 …
// Tue T2+8.
const T2 = onOrAfter(day(Y, 9, 14), 1); // a Monday
const at2 = (n: number) => addDays(T2, n);
const WEEKEND: (DayRange & { kind: 'vacation' | 'sick'; approve: boolean })[] = [
  { label: 'W1', kind: 'vacation', firstDay: at2(-2), lastDay: at2(1), approve: false },
  { label: 'W2', kind: 'vacation', firstDay: at2(3), lastDay: at2(4), approve: false },
  { label: 'W3', kind: 'sick', firstDay: at2(-4), lastDay: at2(-3), approve: false },
  { label: 'W4', kind: 'vacation', firstDay: at2(7), lastDay: at2(8), approve: true },
];

async function weekendWorld(): Promise<{ ilse: Actor; ids: Record<string, AccountId> }> {
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(at2(-28)), admin: { name: freshName('Ines'), allowance: 25 } });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin, { name: freshName('Ilse'), allowance: randomInt(20, 30) });
  const ilse = keep(await signInMember(m));
  const ids: Record<string, AccountId> = {};
  for (const r of WEEKEND) ids[r.label] = await sendRequest(ilse, { kind: r.kind, firstDay: r.firstDay, lastDay: r.lastDay });
  for (const r of WEEKEND) if (r.approve) await approve(admin, ids[r.label]);
  await moveClock({ install, admin, members: [m], people: [ilse], dispose: async () => undefined }, teamAt(T2));
  return { ilse, ids };
}

async function statesOf(actor: Actor, ids: Record<string, AccountId>): Promise<Record<string, string>> {
  const listed = await ownRequests(actor);
  const out: Record<string, string> = {};
  for (const [label, id] of Object.entries(ids)) {
    out[label] = (listed.find((r) => String(r.id) === String(id))?.state ?? 'not listed').toLowerCase().replace('canceled', 'cancelled');
  }
  return out;
}

// ROW-291 promise: REQ-029 fail-if (4) "a pending request with no weekday before today shows no cancel control"
// ROW-291   (the row: "on its sender's own page, and the control cancels it"); REQ-005 AMENDED fail-if (1) "a person
// ROW-291   cannot cancel their own pending request that has no weekday before today"; A-038 (the limit is a weekday
// ROW-291   before today — a Saturday or Sunday is not one).
// ROW-291 wrong product: a fix scoped too wide — no Cancel once any day (a Saturday) is before today, or Cancel
// ROW-291   removed from pending requests altogether; or a control that is drawn but does nothing, or that the server
// ROW-291   refuses for W1, or that cancels another request of the page (the first in the list, W3).
// ROW-291 given: the weekend world (above). when: Ilse opens "/" and operates W1's cancel control (confirming a
// ROW-291   confirmation step if the page asks one). then: W1 and W2 each carry a cancel control; W1 was pending before
// ROW-291   and is cancelled after; W2 and W3 stay pending and W4 approved.
// ROW-291 controls: W1 is listed pending (GET /api/requests) and its row is on the page showing "pending" — the
// ROW-291   world is built and the row is reached.
// ROW-291 technique: the threshold's weekend edge (days before today that are not weekdays), before and after on
// ROW-291   the request's state, the neighbouring requests that must stay untouched.
// ROW-291 cases: ROW-291 target=ROW-291.REQ-029.a-pending-request-with-no-weekday-before-today-carries-a-cancel-control-that-cancels-it control=ROW-291.control.the-pending-request-is-listed-and-shown-pending
test('ROW-291.control.the-pending-request-is-listed-and-shown-pending', async ({ browser }) => {
  const { ilse, ids } = await weekendWorld();
  expect.soft((await statesOf(ilse, ids)).W1, 'ROW-291 control: W1 is listed pending').toBe('pending');
  const read = await readOwnActions(browser, ilse, WEEKEND);
  const r = actionRow(read, 'W1');
  expect.soft(r.found, "ROW-291 control: W1's row is on Ilse's page").toBe(true);
  expect.soft(saysState(r.text, 'pending'), `ROW-291 control: W1's row shows "pending" — row: ${JSON.stringify(r.text)}`).toBe(true);
});

test('ROW-291.REQ-029.a-pending-request-with-no-weekday-before-today-carries-a-cancel-control-that-cancels-it', async ({ browser }) => {
  const { ilse, ids } = await weekendWorld();
  expect(await statesOf(ilse, ids), 'ROW-291 before: W1, W2, W3 pending, W4 approved').toEqual({ W1: 'pending', W2: 'pending', W3: 'pending', W4: 'approved' });

  const opened = await openPage(browser, ilse);
  try {
    const page = opened.page;
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const rows = await readActionRows(page, WEEKEND);
    for (const label of ['W1', 'W2']) {
      const r = rows.find((x) => x.label === label)!;
      expect.soft(r.found, `ROW-291: ${label}'s row is on Ilse's page`).toBe(true);
      expect.soft(r.cancelControls.length, `ROW-291: ${label} (pending, no weekday before today) carries a cancel control — row: ${JSON.stringify(r.text)}`).toBeGreaterThan(0);
    }
    const control = cancelControlsIn(requestRow(page, WEEKEND[0], WEEKEND)).first();
    const step = await openConfirmationStep(page, control, "ROW-291: W1's cancel control", [WEEKEND[0].firstDay, WEEKEND[0].lastDay]);
    if (step) await step.confirm();
  } finally {
    await opened.close();
  }

  await expect
    .poll(async () => (await statesOf(ilse, ids)).W1, { message: "ROW-291: operating W1's cancel control cancels W1", timeout: 10_000 })
    .toBe('cancelled');
  expect.soft(await statesOf(ilse, ids), 'ROW-291: only W1 changed — W2 and W3 stay pending, W4 approved').toEqual({
    W1: 'cancelled',
    W2: 'pending',
    W3: 'pending',
    W4: 'approved',
  });
});
