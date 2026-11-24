// Purpose: ledger test for ROW-153 (INV-001) — over generated sequences of every action that touches a balance, with the team's today moved across month ends and New Year, every days-left figure equals a reference model's recount.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-11); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, decisions, cancels, switch, allowance), fresh per run; the oracle is readings.ts's weekday oracle and the model below, never the product's stored rows.
//
// Boundary (R6): a balance rule, proved at the HTTP harness. The days-left figures read are GET /api/balance's
// (D-029: {years:[{year,daysLeft,pending}]}), the member's own, for every year the answer carries that the model
// knows (at least the current and the next year), after every step.
//
// ROW-153 promise: INV-001 "for every person and year, the vacation days left shown anywhere equal that person's
// ROW-153   allowance for that year minus the counted days in effect of their approved vacation requests in that
// ROW-153   year, after every approval, rejection, cancellation, partial cancellation, account switch-off and
// ROW-153   allowance change" (A-002, A-007, A-022, A-030); the rules the model applies: REQ-010 and A-007 (an admin
// ROW-153   cancel gives back only Monday-to-Friday days from today on), REQ-019 and A-030 (a request with a weekday
// ROW-153   before today stays approved up to the day before the cancel; one with none becomes cancelled), REQ-016
// ROW-153   and A-022 (a switch-off cancels pending requests and approved days from today on), A-018 and A-043 (an
// ROW-153   allowance change starts this year or next year; one starting next year leaves this year unchanged),
// ROW-153   A-017 (only Monday-to-Friday days count), A-004 (sick days never touch the allowance).
// ROW-153 wrong product: a balance cached at approval and not recomputed after a partial cancel or switch-off; a
// ROW-153   partial cancel that returns every day of the request, or the days before today; a switch-off that
// ROW-153   returns nothing; a New Year that carries this year's days used into the next; an allowance change
// ROW-153   starting next year applied to this year; today read in UTC so a cancel at 09:00 Auckland cuts a day early.
// ROW-153 given: a fresh install, team zone Pacific/Auckland, today Monday 2027-11-22 at an instant whose UTC date
// ROW-153   is the day before; one member with allowance 20 (and the admin, untouched, as the neighbour).
// ROW-153   when: 36 generated steps from a seeded generator — sends of vacation and sick (from tomorrow on, within
// ROW-153   this year and next, never crossing New Year, never overlapping a live request, vacation never beyond what
// ROW-153   the model says is left), approvals, rejections, own cancels, admin cancels (whole or partial),
// ROW-153   switch-off and back on, allowance changes (this year or next) and moves of today, forced across the end
// ROW-153   of November and across New Year 2027/2028; two planted episodes (an approved vacation starting within
// ROW-153   days, today moved into it, then an admin cancel in December and a switch-off in January, the pending
// ROW-153   requests with a past weekday decided first as A-033 asks) so a partial cancel is reached by both causes.
// ROW-153   then: after every step, each year's daysLeft in GET
// ROW-153   /api/balance equals the model's allowance(year) minus the in-effect Monday-to-Friday days of the
// ROW-153   member's approved vacation requests in that year; at the end the admin's own balance is still its
// ROW-153   allowance. Two sequences run: the named example (seed 20271122) and a fresh seed printed on failure.
// ROW-153 controls: the control case sends, approves and moves today across New Year, and the balance answers
// ROW-153   with the new current and next year — the steps the generator uses are reachable and the figures exist;
// ROW-153   inside the target, the named example asserts it reached a partial cancel and a switch-off.
// ROW-153 technique: a property over generated inputs against an independent reference model (the row's own
// ROW-153   instruction), plus one named example seed; the generator only takes steps the model and the rules agree
// ROW-153   are legal, so a refusal is itself a reported divergence.
// ROW-153 cases: ROW-153 target=ROW-153.INV-001.days-left-equals-a-recount-over-generated-sequences control=ROW-153.control.steps-reach-the-balance-across-New-Year
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  readBalance,
  reject,
  resetProduct,
  sendRequest,
  setAllowance,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
} from './harness';
import {
  addDays,
  aucklandMorning,
  balanceYear,
  checkWeekdayAnchors,
  countWeekdays,
  dayNumber,
  freshSeed,
  isoOf,
  seeded,
  weekdaysIn,
  yearOfDate,
} from './readings';

const START = '2027-11-22'; // a Monday
const INITIAL_ALLOWANCE = 20;
const STEPS = 36;
const NAMED_SEED = 20271122;

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

// ---------------------------------------------------------------------------------------------------
// The reference model (the oracle): the generated dates and the rules above, never the product's rows
// ---------------------------------------------------------------------------------------------------

type Kind = 'vacation' | 'sick';
type State = 'pending' | 'approved' | 'rejected' | 'cancelled';
interface MReq {
  id: AccountId;
  kind: Kind;
  first: string;
  last: string;
  state: State;
  cutoff: string | null; // the first day no longer in effect (the today of a partial cancel)
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

class Model {
  today: string;
  readonly allow = new Map<number, number>();
  nextSetThisYear = false;
  readonly reqs: MReq[] = [];

  constructor(today: string, initial: number) {
    this.today = today;
    this.allow.set(this.cur, initial);
    this.allow.set(this.cur + 1, initial);
  }

  get cur(): number {
    return yearOfDate(this.today);
  }

  effectiveLast(r: MReq): string {
    return r.cutoff ? addDays(r.cutoff, -1) : r.last;
  }

  inEffect(r: MReq): string[] {
    return r.state === 'approved' ? weekdaysIn(r.first, this.effectiveLast(r)) : [];
  }

  liveSpan(r: MReq): [string, string] | null {
    if (r.state === 'pending') return [r.first, r.last];
    if (r.state === 'approved') return [r.first, this.effectiveLast(r)];
    return null;
  }

  daysLeft(year: number): number {
    const used = this.reqs
      .filter((r) => r.kind === 'vacation')
      .flatMap((r) => this.inEffect(r))
      .filter((d) => yearOfDate(d) === year).length;
    return (this.allow.get(year) ?? 0) - used;
  }

  pendingVacation(year: number): number {
    return this.reqs
      .filter((r) => r.kind === 'vacation' && r.state === 'pending')
      .flatMap((r) => weekdaysIn(r.first, r.last))
      .filter((d) => yearOfDate(d) === year).length;
  }

  hasWeekdayBeforeToday(r: MReq): boolean {
    return weekdaysIn(r.first, minDate(r.last, addDays(this.today, -1))).length > 0;
  }

  canOwnCancel(r: MReq): boolean {
    return r.state === 'pending' && !this.hasWeekdayBeforeToday(r);
  }

  canAdminCancel(r: MReq): boolean {
    return r.state === 'approved' && weekdaysIn(maxDate(r.first, this.today), this.effectiveLast(r)).length > 0;
  }

  canSwitchOff(): boolean {
    return !this.reqs.some((r) => r.state === 'pending' && this.hasWeekdayBeforeToday(r));
  }

  /** REQ-010 / REQ-019: only Monday-to-Friday days from today on are cancelled. */
  cancelFromToday(r: MReq): void {
    const before = weekdaysIn(r.first, minDate(this.effectiveLast(r), addDays(this.today, -1)));
    if (before.length > 0) r.cutoff = this.today;
    else r.state = 'cancelled';
  }

  switchOff(): void {
    for (const r of this.reqs) {
      if (r.state === 'pending') r.state = 'cancelled';
      else if (this.canAdminCancel(r)) this.cancelFromToday(r);
    }
  }

  setAllowance(value: number, startsNextYear: boolean): void {
    if (startsNextYear) {
      this.allow.set(this.cur + 1, value);
      this.nextSetThisYear = true;
    } else {
      this.allow.set(this.cur, value);
      if (!this.nextSetThisYear) this.allow.set(this.cur + 1, value);
    }
  }

  moveTo(day: string): void {
    const before = this.cur;
    this.today = day;
    if (this.cur !== before) {
      // New Year: the new current year keeps what was set for it; the year after carries it on (A-018, A-043).
      this.allow.set(this.cur + 1, this.allow.get(this.cur) ?? 0);
      this.nextSetThisYear = false;
    }
  }

  overlapsLive(first: string, last: string): boolean {
    return this.reqs.some((r) => {
      const s = this.liveSpan(r);
      return s !== null && first <= s[1] && s[0] <= last;
    });
  }
}

// ---------------------------------------------------------------------------------------------------
// The generator and the runner
// ---------------------------------------------------------------------------------------------------

type Rand = () => number;
function pick<T>(rand: Rand, xs: T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

function capFor(step: number): string {
  if (step < 12) return '2027-11-30';
  if (step < 24) return '2027-12-30';
  return '2028-02-29';
}

function genRange(rand: Rand, m: Model): { first: string; last: string } | null {
  const nextYear = rand() < 0.3;
  const y = nextYear ? m.cur + 1 : m.cur;
  const soon = rand() < 0.6; // most ranges start within a week, so later moves of today enter them
  const lo = nextYear ? `${y}-01-01` : addDays(m.today, 1);
  const hiStart = nextYear ? `${y}-02-15` : minDate(`${y}-12-31`, addDays(m.today, soon ? 7 : 40));
  if (lo > hiStart) return null;
  const first = isoOf(dayNumber(lo) + Math.floor(rand() * (dayNumber(hiStart) - dayNumber(lo) + 1)));
  const last = minDate(addDays(first, Math.floor(rand() * 7)), `${y}-12-31`);
  if (countWeekdays(first, last) === 0) return null;
  return { first, last };
}

interface Run {
  seed: number;
  log: string[];
  admin: Actor;
  member: Member;
  session: Actor;
  planted: MReq | null; // an approved vacation planted so a later step cancels it partly
}

function where(run: Run, step: number): string {
  return `ROW-153 seed ${run.seed} step ${step} (${run.log.slice(-6).join(' | ')})`;
}

async function trySend(run: Run, m: Model, rand: Rand, kind: Kind, step: number): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const r = genRange(rand, m);
    if (!r || m.overlapsLive(r.first, r.last)) continue;
    const y = yearOfDate(r.first);
    const n = countWeekdays(r.first, r.last);
    if (kind === 'vacation' && n > m.daysLeft(y) - m.pendingVacation(y)) continue;
    const res = await run.session.api.post('/api/requests', { data: { kind, firstDay: r.first, lastDay: r.last } });
    const body = await res.text();
    run.log.push(`send ${kind} ${r.first}..${r.last} (${n})`);
    expect(res.status(), `${where(run, step)}: a send the rules allow is stored (answered ${body.slice(0, 200)})`).toBe(201);
    const id = (JSON.parse(body) as { id: AccountId }).id;
    m.reqs.push({ id, kind, first: r.first, last: r.last, state: 'pending', cutoff: null });
    return true;
  }
  return false;
}

async function adminCancelStep(run: Run, m: Model, r: MReq): Promise<void> {
  await adminCancel(run.admin, r.id);
  m.cancelFromToday(r);
  run.log.push(`admin cancel ${r.first}..${r.last} at ${m.today}${r.cutoff ? ' (partial)' : ''}`);
}

async function switchStep(run: Run, m: Model): Promise<void> {
  await switchAccount(run.admin, run.member.id, false);
  m.switchOff();
  await switchAccount(run.admin, run.member.id, true);
  run.session = keep(await signInMember(run.member));
  run.log.push(`switch off and on at ${m.today}${m.reqs.some((r) => r.cutoff === m.today) ? ' (partial)' : ''}`);
}

/**
 * Sends and approves a vacation starting within three days, as long as the rules allow (null when none fits).
 * When the days left are too few, this year's allowance is raised first (an allowance change, itself a step).
 */
async function plant(run: Run, m: Model): Promise<MReq | null> {
  const y0 = m.cur;
  if (m.daysLeft(y0) - m.pendingVacation(y0) < 6) {
    const value = Math.min(260, (m.allow.get(y0) ?? 0) + 12);
    await setAllowance(run.admin, run.member.id, value, { startsNextYear: false });
    m.setAllowance(value, false);
    run.log.push(`allowance ${value} from this year`);
  }
  for (const offset of [1, 2, 3, 5, 8]) {
    for (const len of [10, 8, 6, 4]) {
      const first = addDays(m.today, offset);
      const last = addDays(first, len - 1);
      const y = yearOfDate(first);
      if (yearOfDate(last) !== y || m.overlapsLive(first, last)) continue;
      const n = countWeekdays(first, last);
      if (n === 0 || n > m.daysLeft(y) - m.pendingVacation(y)) continue;
      const id = await sendRequest(run.session, { kind: 'vacation', firstDay: first, lastDay: last });
      await approve(run.admin, id);
      const r: MReq = { id, kind: 'vacation', first, last, state: 'approved', cutoff: null };
      m.reqs.push(r);
      run.log.push(`plant approved vacation ${first}..${last} (${n})`);
      return r;
    }
  }
  return null;
}

async function step(run: Run, m: Model, rand: Rand, s: number): Promise<void> {
  // Planted partial cancels: in December an admin cancel, after New Year a switch-off, each of an approved vacation
  // that today has moved into (the generated steps around them stay random).
  if (s === 13 || s === 26) {
    run.planted = await plant(run, m);
    if (run.planted) return;
  }
  if ((s === 14 || s === 27) && run.planted) {
    // Today moves to the day after the planted vacation's first weekday: one weekday before today, the rest after.
    const firstWeekday = weekdaysIn(run.planted.first, run.planted.last)[0];
    const to = minDate(addDays(firstWeekday, 1), capFor(s));
    if (to > m.today) {
      await setClock(aucklandMorning(to));
      m.moveTo(to);
      run.log.push(`today ${to}`);
      return;
    }
  }
  if ((s === 15 || s === 28) && run.planted && m.canAdminCancel(run.planted) && m.hasWeekdayBeforeToday(run.planted)) {
    const r = run.planted;
    run.planted = null;
    if (s === 28) {
      // A-033: the admin first decides the pending requests with a weekday before today, then switches off.
      for (const b of m.reqs.filter((x) => x.state === 'pending' && m.hasWeekdayBeforeToday(x))) {
        await approve(run.admin, b.id);
        b.state = 'approved';
        run.log.push(`approve ${b.first}..${b.last} (before the switch-off)`);
      }
      await switchStep(run, m);
    } else await adminCancelStep(run, m, r);
    return;
  }

  // Forced moves of today: across the end of November, then across New Year.
  const forced: Record<number, string> = {
    12: addDays('2027-12-01', Math.floor(rand() * 3)),
    24: '2027-12-31',
    25: addDays('2028-01-03', Math.floor(rand() * 2)),
  };
  if (forced[s] && forced[s] > m.today) {
    await setClock(aucklandMorning(forced[s]));
    m.moveTo(forced[s]);
    run.log.push(`today ${forced[s]}`);
    return;
  }

  const pending = m.reqs.filter((r) => r.state === 'pending');
  const ownCancellable = m.reqs.filter((r) => m.canOwnCancel(r));
  // Admin cancels prefer a request with days in effect both before today and from today on (a partial cancel).
  const cancellableAll = m.reqs.filter((r) => m.canAdminCancel(r));
  const straddling = cancellableAll.filter((r) => m.hasWeekdayBeforeToday(r));
  const cancellable = straddling.length > 0 ? straddling : cancellableAll;

  const moveToday = async (): Promise<boolean> => {
    const to = minDate(addDays(m.today, 1 + Math.floor(rand() * 4)), capFor(s));
    if (to <= m.today) return false;
    await setClock(aucklandMorning(to));
    m.moveTo(to);
    run.log.push(`today ${to}`);
    return true;
  };

  // Weighted choice among the steps that are legal now.
  const options: [number, () => Promise<boolean>][] = [
    [26, () => trySend(run, m, rand, 'vacation', s)],
    [6, () => trySend(run, m, rand, 'sick', s)],
    [16, moveToday],
    [6, async () => {
      const nextYear = m.nextSetThisYear ? true : rand() < 0.5;
      const value = Math.floor(rand() * 31);
      await setAllowance(run.admin, run.member.id, value, { startsNextYear: nextYear });
      m.setAllowance(value, nextYear);
      run.log.push(`allowance ${value} from ${nextYear ? 'next' : 'this'} year`);
      return true;
    }],
  ];
  if (pending.length > 0) {
    options.push([20, async () => {
      const r = pick(rand, pending);
      await approve(run.admin, r.id);
      r.state = 'approved';
      run.log.push(`approve ${r.first}..${r.last}`);
      return true;
    }]);
    options.push([6, async () => {
      const r = pick(rand, pending);
      await reject(run.admin, r.id);
      r.state = 'rejected';
      run.log.push(`reject ${r.first}..${r.last}`);
      return true;
    }]);
  }
  if (ownCancellable.length > 0) {
    options.push([5, async () => {
      const r = pick(rand, ownCancellable);
      await cancelOwnRequest(run.session, r.id);
      r.state = 'cancelled';
      run.log.push(`own cancel ${r.first}..${r.last}`);
      return true;
    }]);
  }
  if (cancellable.length > 0) {
    options.push([straddling.length > 0 ? 20 : 6, async () => {
      await adminCancelStep(run, m, pick(rand, cancellable));
      return true;
    }]);
  }
  if (m.canSwitchOff()) {
    options.push([4, async () => {
      await switchStep(run, m);
      return true;
    }]);
  }
  const total = options.reduce((n, [w]) => n + w, 0);
  let roll = rand() * total;
  let chosen = options[0][1];
  for (const [w, op] of options) {
    if (roll < w) {
      chosen = op;
      break;
    }
    roll -= w;
  }
  if (await chosen()) return;
  if (await moveToday()) return;
  if (!(await trySend(run, m, rand, 'vacation', s))) run.log.push('no legal step');
}

async function verify(run: Run, m: Model, s: number): Promise<void> {
  const b = await readBalance(run.session);
  for (const y of [m.cur, m.cur + 1]) {
    expect(balanceYear(b, y), `${where(run, s)}: GET /api/balance carries ${y}`).toBeDefined();
  }
  for (const entry of b.years ?? []) {
    const y = Number(entry.year);
    if (!m.allow.has(y)) continue;
    expect(entry.daysLeft, `${where(run, s)}: daysLeft for ${y} equals the recount`).toBe(m.daysLeft(y));
  }
}

async function runSequence(seed: number): Promise<void> {
  const rand = seeded(seed);
  const install = await resetProduct({ now: aucklandMorning(START) });
  const admin = keep(await signIn(install.admin));
  const member = await createMember(admin, { allowance: INITIAL_ALLOWANCE });
  const run: Run = { seed, log: [], admin, member, session: keep(await signInMember(member)), planted: null };
  const m = new Model(START, INITIAL_ALLOWANCE);
  await verify(run, m, 0);
  for (let s = 1; s <= STEPS; s += 1) {
    await step(run, m, rand, s);
    await verify(run, m, s);
  }
  expect(m.cur, `ROW-153 seed ${seed}: the sequence crossed New Year`).toBe(2028);
  if (seed === NAMED_SEED) {
    // The named example is deterministic: it reaches a partial cancel and a switch-off, the harmful steps.
    expect(run.log.some((l) => /partial/.test(l)), 'ROW-153 named example: a partial cancel was reached').toBe(true);
    expect(run.log.some((l) => /^switch off/.test(l)), 'ROW-153 named example: a switch-off was reached').toBe(true);
  }
  const adminBalance = await readBalance(admin);
  for (const y of [2028, 2029]) {
    expect(balanceYear(adminBalance, y)?.daysLeft, `ROW-153 seed ${seed}: the admin's untouched ${y} balance is its allowance`).toBe(
      install.admin.allowance,
    );
  }
}

test('ROW-153.control.steps-reach-the-balance-across-New-Year', async () => {
  checkWeekdayAnchors();
  const install = await resetProduct({ now: aucklandMorning('2027-12-27') });
  const admin = keep(await signIn(install.admin));
  const member = await createMember(admin, { allowance: INITIAL_ALLOWANCE });
  const session = keep(await signInMember(member));
  const id = await sendRequest(session, { kind: 'vacation', firstDay: '2027-12-29', lastDay: '2027-12-30' });
  await approve(admin, id);
  await setClock(aucklandMorning('2028-01-03'));
  const b = await readBalance(session);
  expect(balanceYear(b, 2028), 'ROW-153 control: after New Year the balance carries the new current year').toBeDefined();
  expect(balanceYear(b, 2029), 'ROW-153 control: after New Year the balance carries the new next year').toBeDefined();
});

test('ROW-153.INV-001.days-left-equals-a-recount-over-generated-sequences', async () => {
  checkWeekdayAnchors();
  await runSequence(NAMED_SEED); // the named example
  await runSequence(freshSeed()); // a fresh sequence, its seed printed on failure
});
