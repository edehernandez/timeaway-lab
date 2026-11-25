// Purpose: the ledger test of RULE-001 (INV-001, REQ-007, REQ-008, REQ-020, REQ-022) — census-wide: every days-left, pending and forecast figure in every answer of every GET route of the route folder and on every page of the page folder, as the admin and as a member, equals the one balance (allowance minus the counted days in effect of approved vacation, pending vacation beside it).
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-19); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, approve, reject, admin cancel, own cancel, allowance changes, switch-off), fresh names and a fresh year and allowance shift per run; routes and pages read from the route and page folders' file names (route-census.ts, rule-census.ts); every expected figure and every decoy is this file's own arithmetic over the fixture, never the product's.
//
// Boundary (R6): what a route RETURNS is read at the HTTP harness, on every GET address of the route folder; what a
// page RENDERS is paint, read in the browser on every page of the page folder. HOS-011 attempts the rule through one
// toggle on the pages it names; this file is the census-wide half: a new route or page with its own figure arithmetic
// is called or loaded here without anyone naming it.
//
// RULE-001 promise: RULE-001 "every days-left, pending or forecast figure the product renders or returns is computed
// RULE-001   by the one balance function"; INV-001 (days left = allowance for the year minus counted days in effect of
// RULE-001   approved vacation, after every approval, rejection, cancellation, partial cancellation, switch-off and
// RULE-001   allowance change; the pending page's forecast equals the days left after that approval); REQ-007 (both years,
// RULE-001   pending shown beside, never subtracted); REQ-008 (the pending page's days left in the request's year);
// RULE-001   REQ-020 (the people page's days left for both years); REQ-022 (the forecast); A-002, A-018 AMENDED, A-043;
// RULE-001   D-040 (every count takes its days from the one daysInEffect()); D-043 (the people answer's `years`).
// RULE-001 wrong product: one site with its own arithmetic — a route or page that counts a partly cancelled request's
// RULE-001   whole range or a switched-off person's returned days, reads the allowance before the change or the other
// RULE-001   year's allowance or days, counts sick days, subtracts pending days, or counts calendar days instead of
// RULE-001   weekdays — while the other sites keep the one balance.
// RULE-001 given: team zone Pacific/Kiritimati (UTC+14), a fresh year Y, today D0 the first Monday on or after 2 March,
// RULE-001   allowance shift s (0-4). Ari: allowance 72+s; vacation D0+1..D0+11 (9 weekdays) approved, D0+28..D0+33 (5)
// RULE-001   approved, sick D0+14..D0+16 approved, vacation D0+42..D0+46 (5), D0+56..D0+57 (2), D0+63..D0+66 (4),
// RULE-001   D0+70..D0+71 (2) pending, sick D0+77..D0+78 pending; in Y+1, from F (first Monday of February): F..F+3 (4)
// RULE-001   approved, F+7 (1) and F+14..F+16 (3) pending. Bo: allowance 50+s; vacation D0+2..D0+4 (3) and D0+14..D0+18
// RULE-001   (5) approved, sick D0+21..D0+22 approved, vacation D0+28..D0+29 pending.
// RULE-001 when: the clock moves to D0+7; the admin cancels Ari's D0+1 request (4 days before today stay in effect),
// RULE-001   rejects her D0+42 request, sets her allowance to 80+s from this year and 90+s from next year; Ari cancels
// RULE-001   her D0+70 request; the admin switches Bo off (his D0+2..D0+4 days stay, the rest is cancelled).
// RULE-001 then (this file's model): Ari Y days left 71+s, pending 6, forecasts 69+s and 67+s; Ari Y+1 86+s, pending 4,
// RULE-001   forecasts 85+s and 83+s; Bo Y 47+s; admin 25. Every numeric field of every 200 JSON answer whose name says
// RULE-001   days left, pending or forecast equals the model's figure for its person and year (or request), read from the
// RULE-001   record it sits in, else from the address's id or the viewer; no 200 JSON answer and no page shows any decoy
// RULE-001   (the figures the wrong products above show: computed by the model's wrong formulas, kept only when above 31 and
// RULE-001   equal to no right figure and no allowance); "/" as Ari and each person's page show their days left; the people
// RULE-001   page's rows and the pending page's rows show theirs; the send refusal names 71+s.
// RULE-001 controls: the control case builds the same fixture up to the approvals, before the changes; the same census
// RULE-001   reading finds figure fields in GET /api/balance, /api/admin/people and /api/admin/pending and they equal the
// RULE-001   model's figures before the changes; Bo's people row then shows 42+s — the target's switch-off decoy — so the
// RULE-001   target's absences are the changes' doing and the readings find the figures where the target looks.
// RULE-001 technique: a property over every census site ("every figure equals the one balance"), with named examples
// RULE-001   on the pages; decoys generated by the plausible wrong formulas, checked to be distinct from every right figure.
// RULE-001 cases: RULE-001 target=RULE-001.every-figure-on-every-route-and-page-is-the-one-balance control=RULE-001.control.before-the-changes-the-census-reads-the-model
import { test, expect, type Browser } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  createMember,
  freshEmail,
  freshName,
  openPage,
  PAGES,
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
import { addDays, day, onOrAfter, pickYear, randomInt, teamAt, TEAM_ZONE, weekdaySpan } from './request-rules';
import { dayNumber, weekdaysIn } from './readings';
import { leaves, show } from './records';
import { readOwnFigures, readPendingPage } from './page-figures';
import { rowWith } from './page-rows';
import { yearFigures } from './journey-pages';
import { capturePageLoad } from './route-census';
import { addressesOf, callRoute, fillsRequest, figureText, hasParam, pageAddress, pageCensus, ruleRoutes, standsAlone, type Binding, type Called } from './rule-census';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

// ---------------------------------------------------------------------------------------------------
// The fixture and its model
// ---------------------------------------------------------------------------------------------------

type Who = 'ari' | 'bo' | 'admin';
type Kind = 'vacation' | 'sick';
type State = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface Ask {
  label: string;
  who: 'ari' | 'bo';
  kind: Kind;
  firstDay: string;
  lastDay: string;
  /** The state after the fixture's approvals (the control's moment). */
  before: State;
  /** The state after the changes, and the cancel day of a partial cancel. */
  after: State;
  cancelFrom?: string;
}

interface Days {
  Y: number;
  D0: string;
  F: string;
  s: number;
}

function days(): Days {
  const Y = pickYear();
  return { Y, D0: onOrAfter(day(Y, 3, 2), 1), F: onOrAfter(day(Y + 1, 2, 1), 1), s: randomInt(0, 4) };
}

function asks(d: Days): Ask[] {
  const at = (k: number) => addDays(d.D0, k);
  const atF = (k: number) => addDays(d.F, k);
  return [
    { label: 'R1', who: 'ari', kind: 'vacation', firstDay: at(1), lastDay: at(11), before: 'approved', after: 'approved', cancelFrom: at(7) },
    { label: 'R2', who: 'ari', kind: 'vacation', firstDay: at(28), lastDay: at(33), before: 'approved', after: 'approved' },
    { label: 'R3', who: 'ari', kind: 'sick', firstDay: at(14), lastDay: at(16), before: 'approved', after: 'approved' },
    { label: 'R4', who: 'ari', kind: 'vacation', firstDay: at(42), lastDay: at(46), before: 'pending', after: 'rejected' },
    { label: 'R5', who: 'ari', kind: 'vacation', firstDay: at(56), lastDay: at(57), before: 'pending', after: 'pending' },
    { label: 'R5b', who: 'ari', kind: 'vacation', firstDay: at(63), lastDay: at(66), before: 'pending', after: 'pending' },
    { label: 'R6', who: 'ari', kind: 'vacation', firstDay: at(70), lastDay: at(71), before: 'pending', after: 'cancelled' },
    { label: 'R7', who: 'ari', kind: 'sick', firstDay: at(77), lastDay: at(78), before: 'pending', after: 'pending' },
    { label: 'R8', who: 'ari', kind: 'vacation', firstDay: atF(0), lastDay: atF(3), before: 'approved', after: 'approved' },
    { label: 'R9', who: 'ari', kind: 'vacation', firstDay: atF(7), lastDay: atF(7), before: 'pending', after: 'pending' },
    { label: 'R9b', who: 'ari', kind: 'vacation', firstDay: atF(14), lastDay: atF(16), before: 'pending', after: 'pending' },
    { label: 'B1', who: 'bo', kind: 'vacation', firstDay: at(2), lastDay: at(4), before: 'approved', after: 'approved' },
    { label: 'B2', who: 'bo', kind: 'vacation', firstDay: at(14), lastDay: at(18), before: 'approved', after: 'cancelled' },
    { label: 'B3', who: 'bo', kind: 'sick', firstDay: at(21), lastDay: at(22), before: 'approved', after: 'cancelled' },
    { label: 'B4', who: 'bo', kind: 'vacation', firstDay: at(28), lastDay: at(29), before: 'pending', after: 'cancelled' },
  ];
}

interface Fated {
  ask: Ask;
  state: State;
  cancelFrom?: string;
  wasApproved: boolean;
}

interface Decoy {
  value: number;
  family: string;
}

/** The model: the right figures (this file's arithmetic) and the decoys the wrong formulas give. */
interface Model {
  Y: number;
  daysLeft: Map<string, number>;
  pending: Map<string, number>;
  /** Per pending request label: the days left its approval would leave. */
  forecast: Map<string, number>;
  /** Decoys shown nowhere: above 31, equal to no right figure, no room figure and no allowance, the room family left out. */
  decoys: Decoy[];
  allowances: Set<number>;
}

const yearOf = (d: string) => Number(d.slice(0, 4));
const key = (who: Who, year: number) => `${who}:${year}`;

function model(d: Days, withChanges: boolean): Model {
  const { Y, s } = d;
  const allowance: Record<Who, Record<number, number>> = withChanges
    ? { ari: { [Y]: 80 + s, [Y + 1]: 90 + s }, bo: { [Y]: 50 + s, [Y + 1]: 50 + s }, admin: { [Y]: 25, [Y + 1]: 25 } }
    : { ari: { [Y]: 72 + s, [Y + 1]: 72 + s }, bo: { [Y]: 50 + s, [Y + 1]: 50 + s }, admin: { [Y]: 25, [Y + 1]: 25 } };
  const oldAllowance: Record<Who, number> = { ari: 72 + s, bo: 50 + s, admin: 25 };
  const fated: Fated[] = asks(d).map((a) => ({
    ask: a,
    state: withChanges ? a.after : a.before,
    cancelFrom: withChanges ? a.cancelFrom : undefined,
    wasApproved: a.before === 'approved',
  }));
  const inEffect = (f: Fated): string[] =>
    f.state !== 'approved' ? [] : weekdaysIn(f.ask.firstDay, f.ask.lastDay).filter((x) => !f.cancelFrom || x < f.cancelFrom);
  const sum = (who: Who, year: number, pick: (f: Fated) => string[]) =>
    fated.filter((f) => f.ask.who === who).flatMap(pick).filter((x) => yearOf(x) === year).length;
  const vac = (f: Fated) => f.ask.kind === 'vacation';
  const used = (who: Who, year: number) => sum(who, year, (f) => (vac(f) ? inEffect(f) : []));
  const pend = (who: Who, year: number) => sum(who, year, (f) => (vac(f) && f.state === 'pending' ? weekdaysIn(f.ask.firstDay, f.ask.lastDay) : []));
  const left = (who: Who, year: number) => allowance[who][year] - used(who, year);

  const m: Model = { Y, daysLeft: new Map(), pending: new Map(), forecast: new Map(), decoys: [], allowances: new Set() };
  const raw: Decoy[] = [];
  const rooms = new Set<number>();
  for (const who of ['ari', 'bo', 'admin'] as Who[]) {
    for (const year of [Y, Y + 1]) {
      const other = year === Y ? Y + 1 : Y;
      const L = left(who, year);
      m.daysLeft.set(key(who, year), L);
      m.pending.set(key(who, year), pend(who, year));
      m.allowances.add(allowance[who][year]);
      m.allowances.add(oldAllowance[who]);
      rooms.add(L - pend(who, year));
      if (who === 'admin') continue;
      const calendarDays = fated
        .filter((f) => f.ask.who === who && vac(f) && f.state === 'approved')
        .map((f) => {
          const last = f.cancelFrom ? addDays(f.cancelFrom, -1) : f.ask.lastDay;
          return { year: yearOf(f.ask.firstDay), n: dayNumber(last) - dayNumber(f.ask.firstDay) + 1 };
        })
        .filter((x) => x.year === year)
        .reduce((t, x) => t + x.n, 0);
      const families: Record<string, number> = {
        'cancelled days still counted': allowance[who][year] - sum(who, year, (f) => (vac(f) && (f.state === 'approved' || f.wasApproved) ? weekdaysIn(f.ask.firstDay, f.ask.lastDay) : [])),
        'the allowance before the change': oldAllowance[who] - used(who, year),
        "the other year's allowance": allowance[who][other] - used(who, year),
        "the other year's days": allowance[who][year] - used(who, other),
        'sick days counted': L - sum(who, year, (f) => (f.ask.kind === 'sick' ? inEffect(f) : [])),
        'calendar days counted': allowance[who][year] - calendarDays,
        room: L - pend(who, year),
      };
      for (const [family, value] of Object.entries(families)) if (value !== L) raw.push({ value, family: `${who} ${year} ${family}` });
      for (const f of fated.filter((x) => x.ask.who === who && x.state === 'pending' && yearOf(x.ask.firstDay) === year)) {
        const n = vac(f) ? weekdaysIn(f.ask.firstDay, f.ask.lastDay).length : 0;
        m.forecast.set(f.ask.label, L - n);
        for (const [family, value] of Object.entries(families)) {
          if (value !== L) raw.push({ value: value - n, family: `${who} ${year} forecast of ${f.ask.label} from ${family}` });
        }
      }
    }
  }
  const right = new Set<number>([...m.daysLeft.values(), ...m.forecast.values()]);
  for (const dcy of raw) {
    if (/room/.test(dcy.family)) continue; // a room figure ("can still ask for") is no days-left figure; the field check covers it
    // A room figure (days left minus pending: what can still be asked for) may rightly be shown beside the balance,
    // so a decoy equal to one is no evidence and is left out.
    if (dcy.value <= 31 || right.has(dcy.value) || m.allowances.has(dcy.value) || rooms.has(dcy.value)) continue;
    m.decoys.push(dcy);
  }
  return m;
}

/** The fixture's own check that the wrong formulas it guards against are each visible as a decoy (a test's own mistake if not). */
function requireLiveDecoys(m: Model): void {
  const families = ['cancelled days still counted', 'the allowance before the change', "the other year's allowance", "the other year's days", 'sick days counted', 'calendar days counted'];
  for (const f of families) {
    const family = `ari ${m.Y} ${f}`;
    if (!m.decoys.some((d) => d.family === family)) throw new Error(`RULE-001 fixture: the decoy family "${family}" collides with a right figure`);
  }
  if (!m.decoys.some((d) => d.family === `bo ${m.Y} cancelled days still counted`)) throw new Error('RULE-001 fixture: the switch-off decoy collides');
  if (m.decoys.some((d) => d.value === refusalAsk(m))) throw new Error('RULE-001 fixture: the refused ask\'s day count is a decoy');
}

/** The counted days of the send the target expects refused: more than Ari's room this year, and no decoy. */
function refusalAsk(m: Model): number {
  return 70 + ((m.daysLeft.get(key('ari', m.Y)) as number) - 71);
}

// ---------------------------------------------------------------------------------------------------
// Building the fixture through the public routes
// ---------------------------------------------------------------------------------------------------

interface World {
  d: Days;
  admin: Actor;
  ari: Member;
  bo: Member;
  ariSession: Actor;
  ids: Map<string, AccountId>;
  /** request id (as text) -> the ask */
  byId: Map<string, Ask>;
}

async function build(withChanges: boolean): Promise<World> {
  const d = days();
  const install = await resetProduct({ timeZone: TEAM_ZONE, now: teamAt(d.D0) });
  const admin = keep(await signIn(install.admin));
  const ari = await createMember(admin, { name: freshName('Ari'), email: freshEmail('ari'), allowance: 72 + d.s });
  const bo = await createMember(admin, { name: freshName('Bo'), email: freshEmail('bo'), allowance: 50 + d.s });
  const ariSession = keep(await signInMember(ari));
  const boSession = keep(await signInMember(bo));
  const ids = new Map<string, AccountId>();
  const byId = new Map<string, Ask>();
  const all = asks(d);
  for (const a of all) {
    const id = await sendRequest(a.who === 'ari' ? ariSession : boSession, { kind: a.kind, firstDay: a.firstDay, lastDay: a.lastDay });
    ids.set(a.label, id);
    byId.set(String(id), a);
  }
  for (const a of all) if (a.before === 'approved') await approve(admin, ids.get(a.label) as AccountId);
  if (withChanges) {
    await setClock(teamAt(addDays(d.D0, 7)));
    await adminCancel(admin, ids.get('R1') as AccountId);
    await reject(admin, ids.get('R4') as AccountId);
    await cancelOwnRequest(ariSession, ids.get('R6') as AccountId);
    await setAllowance(admin, ari.id, 80 + d.s);
    await setAllowance(admin, ari.id, 90 + d.s, { startsNextYear: true });
    await switchAccount(admin, bo.id, false);
  }
  return { d, admin, ari, bo, ariSession, ids, byId };
}

// ---------------------------------------------------------------------------------------------------
// Reading figure fields (the census reading)
// ---------------------------------------------------------------------------------------------------

type FigureType = 'daysLeft' | 'pending' | 'forecast';

interface FigureField {
  type: FigureType;
  path: string;
  value: number;
  /** The objects the field sits in, nearest first. */
  chain: Record<string, unknown>[];
}

function typeOfKey(k: string): FigureType | null {
  if (/forecast/i.test(k) || (/would|after/i.test(k) && /left|leave|remain|balance/i.test(k))) return 'forecast';
  if (/would|after|before/i.test(k)) return null; // a figure of another moment than now (e.g. pending after a decision) is no balance field
  if (/left|remain|balance/i.test(k)) return 'daysLeft';
  if (/^pending(_?days|_?vacation(_?days)?)?$/i.test(k)) return 'pending';
  return null;
}

/** Every numeric field anywhere in `json` whose name says days left, pending or forecast, with the objects it sits in. */
function figureFields(json: unknown): FigureField[] {
  const out: FigureField[] = [];
  const walk = (v: unknown, path: string, chain: Record<string, unknown>[]) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`, chain));
      return;
    }
    if (v === null || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const here = [o, ...chain];
    for (const [k, x] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k;
      const t = typeOfKey(k);
      if (t && typeof x === 'number') out.push({ type: t, path: p, value: x, chain: here });
      else walk(x, p, here);
    }
  };
  walk(json, '', []);
  return out;
}

interface People {
  who: Who;
  name: string;
  email: string;
  id: AccountId;
}

const ACTOR_PATH = /by$|By$|_by|decid|cancel|approv|reject|actor|maker/i;
const PERSON_ID_PATH = /(account|person|user|owner)_?id$|(account|person|user|owner)\.id$/i;

/** The one person an object names (by email, display name or a person-id field, never an actor's field); null when none or several. */
function personNamed(o: Record<string, unknown>, people: People[]): Who | null | 'several' {
  const ls = leaves(o).filter((l) => !ACTOR_PATH.test(l.path));
  const hits = people.filter((p) =>
    ls.some(
      (l) =>
        (typeof l.value === 'string' && (l.value.trim().toLowerCase() === p.email.toLowerCase() || l.value.trim() === p.name)) ||
        (PERSON_ID_PATH.test(l.path) && String(l.value) === String(p.id)),
    ),
  );
  if (hits.length === 1) return hits[0].who;
  return hits.length > 1 ? 'several' : null;
}

interface Context {
  who?: Who;
  year?: number;
  request?: Ask;
}

/** The person, year and request a figure field belongs to: read from the objects it sits in, else the fallback person. */
function contextOf(f: FigureField, w: World, people: People[], fallback?: Who): Context {
  const ctx: Context = {};
  for (const o of f.chain) {
    if (ctx.year === undefined && o.year !== undefined && /^\d{4}$/.test(String(o.year))) ctx.year = Number(o.year);
    if (ctx.request === undefined && o.id !== undefined && typeof o.firstDay === 'string') {
      const a = w.byId.get(String(o.id));
      if (a && a.firstDay === o.firstDay) ctx.request = a;
    }
    if (ctx.who === undefined) {
      const named = personNamed(o, people);
      if (named === 'several') break;
      if (named) ctx.who = named;
    }
  }
  if (ctx.request) {
    ctx.who = ctx.request.who;
    if (ctx.year === undefined) ctx.year = yearOf(ctx.request.firstDay);
  }
  if (ctx.who === undefined) ctx.who = fallback;
  return ctx;
}

/** The figures a field may rightly hold: exactly one when its context says which, else every right figure of its type. */
function rightValues(f: FigureField, ctx: Context, m: Model): number[] {
  const years = ctx.year !== undefined ? [ctx.year] : [m.Y, m.Y + 1];
  const whos: Who[] = ctx.who ? [ctx.who] : ['ari', 'bo', 'admin'];
  if (f.type === 'forecast') {
    if (ctx.request && m.forecast.has(ctx.request.label)) return [m.forecast.get(ctx.request.label) as number];
    return [...m.forecast.values(), ...m.daysLeft.values()];
  }
  const table = f.type === 'daysLeft' ? m.daysLeft : m.pending;
  return whos.flatMap((who) => years.map((y) => table.get(key(who, y)))).filter((x): x is number => x !== undefined);
}

// ---------------------------------------------------------------------------------------------------
// The census walks
// ---------------------------------------------------------------------------------------------------

interface Walked {
  session: string;
  called: Called;
  fallback?: Who;
}

function peopleOf(w: World): People[] {
  return [
    { who: 'ari', name: w.ari.name, email: w.ari.email, id: w.ari.id },
    { who: 'bo', name: w.bo.name, email: w.bo.email, id: w.bo.id },
    { who: 'admin', name: w.admin.me.name, email: w.admin.credentials.email, id: w.admin.me.id },
  ];
}

/** Every GET address of the rule walk's routes, called on each session, the bindings filling the :ids. */
async function walkGets(w: World, sessions: { label: string; actor: Actor; viewer?: Who }[]): Promise<Walked[]> {
  const bindings: Binding[] = [
    { label: 'ari', request: w.ids.get('R5') as AccountId, account: w.ari.id },
    { label: 'bo', request: w.ids.get('R9') as AccountId, account: w.bo.id },
    { label: 'admin', request: w.ids.get('R2') as AccountId, account: w.admin.me.id },
  ];
  const whoOfAccount = (id: AccountId): Who => (String(id) === String(w.ari.id) ? 'ari' : String(id) === String(w.bo.id) ? 'bo' : 'admin');
  const out: Walked[] = [];
  for (const route of ruleRoutes()) {
    if (route.method !== null && route.method !== 'GET') continue;
    // A confirmation's effect is read for approve (its forecast is the rule's) and reject; a cancel's or switch-off's
    // effect describes days returned, a figure of another moment, so it is not read here.
    const actions = /effect/.test(route.pattern) ? ['approve', 'reject'] : ['approve'];
    for (const { address, binding } of addressesOf(route, bindings)) {
      for (const action of actions) {
        for (const s of sessions) {
          const called = await callRoute(s.actor.api, 'GET', `${address}?year=${w.d.Y}&month=3&action=${action}`);
          let fallback: Who | undefined = s.viewer;
          if (hasParam(route.pattern)) {
            fallback = fillsRequest(route.pattern) ? (w.byId.get(String(binding.request))?.who as Who | undefined) : whoOfAccount(binding.account);
          }
          out.push({ session: s.label, called, fallback });
        }
      }
    }
  }
  return out;
}

/** Checks every figure field of every 200 JSON answer against the model; returns the fields read per answer. */
function checkFields(walked: Walked[], w: World, m: Model, row: string): Map<string, number> {
  const people = peopleOf(w);
  const counts = new Map<string, number>();
  for (const a of walked) {
    if (a.called.status !== 200 || a.called.json === undefined) continue;
    const fields = figureFields(a.called.json);
    counts.set(`${a.session} ${a.called.address.split('?')[0]}`, (counts.get(`${a.session} ${a.called.address.split('?')[0]}`) ?? 0) + fields.length);
    for (const f of fields) {
      const ctx = contextOf(f, w, people, a.fallback);
      const right = rightValues(f, ctx, m);
      const where = `${row} GET ${a.called.address} as ${a.session}: ${f.type} field ${f.path} (${ctx.who ?? '?'} ${ctx.year ?? '?'}${ctx.request ? ` ${ctx.request.label}` : ''})`;
      if (right.length === 1) expect.soft(f.value, `${where} is the one balance's figure`).toBe(right[0]);
      else expect.soft(right, `${where} = ${f.value} is one of the right figures`).toContain(f.value);
    }
  }
  return counts;
}

function decoysIn(text: string, m: Model): string[] {
  const shown = new Map<number, string[]>();
  for (const d of m.decoys) if (standsAlone(text, d.value)) shown.set(d.value, [...(shown.get(d.value) ?? []), d.family]);
  return [...shown].map(([v, families]) => `${v} (${families.join('; ')})`);
}

// ---------------------------------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------------------------------

interface PageRead {
  session: string;
  address: string;
  status: number;
  visible: string;
  /** For "/" and a person's page: that person's figures text per year, null when the page draws none. */
  years: Record<number, string | null> | null;
  person?: Who;
}

async function readPages(browser: Browser, w: World, sessions: { label: string; actor: Actor; viewer: Who }[]): Promise<PageRead[]> {
  const out: PageRead[] = [];
  const { Y } = w.d;
  for (const page of pageCensus()) {
    const targets: { address: string; person?: Who }[] = hasParam(page.pattern)
      ? [
          { address: pageAddress(page.pattern, w.ari.id), person: 'ari' },
          { address: pageAddress(page.pattern, w.bo.id), person: 'bo' },
        ]
      : [{ address: page.pattern }];
    for (const s of sessions) {
      for (const t of targets) {
        const opened = await openPage(browser, s.actor);
        try {
          const load = await capturePageLoad(opened.page, t.address);
          const figurePerson = page.pattern === '/' ? s.viewer : /^\/admin\/people\/:/.test(page.pattern) && s.viewer === 'admin' ? t.person : undefined;
          let years: Record<number, string | null> | null = null;
          if (figurePerson) {
            let last: Record<number, string | null> = { [Y]: null, [Y + 1]: null };
            await expect
              .poll(async () => {
                last = { [Y]: await yearFigures(opened.page, Y, Y + 1), [Y + 1]: await yearFigures(opened.page, Y + 1, Y) };
                return last[Y] !== null && last[Y + 1] !== null;
              }, { timeout: 5_000 })
              .toBe(true)
              .catch(() => undefined);
            years = last;
          }
          const visible = await opened.page.locator('body').innerText().catch(() => load.visible);
          out.push({ session: s.label, address: t.address, status: load.status, visible, years, person: figurePerson });
        } finally {
          await opened.close();
        }
      }
    }
  }
  return out;
}

async function peopleRows(browser: Browser, admin: Actor, names: string[]): Promise<Record<string, string>> {
  const opened = await openPage(browser, admin);
  try {
    await capturePageLoad(opened.page, PAGES.adminPeople);
    const out: Record<string, string> = {};
    for (const name of names) {
      const row = rowWith(opened.page, name);
      await row.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
      out[name] = ((await row.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    }
    return out;
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------------

test('RULE-001.control.before-the-changes-the-census-reads-the-model', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await build(false);
  const m = model(w.d, false);
  const walked = await walkGets(w, [
    { label: 'admin', actor: w.admin },
    { label: 'ari', actor: w.ariSession, viewer: 'ari' },
  ]);
  const counts = checkFields(walked, w, m, 'RULE-001 control');
  for (const site of ['ari /api/balance', 'admin /api/admin/people', 'admin /api/admin/pending']) {
    expect(counts.get(site) ?? 0, `RULE-001 control: the census reading finds figure fields in ${site} (fields per answer: ${show(Object.fromEntries(counts))})`).toBeGreaterThan(0);
  }
  const rows = await peopleRows(browser, w.admin, [w.bo.name]);
  expect(standsAlone(rows[w.bo.name], 42 + w.d.s), `RULE-001 control: before the switch-off Bo's people row shows ${42 + w.d.s}, the target's switch-off decoy (${rows[w.bo.name]})`).toBe(true);
});

test('RULE-001.every-figure-on-every-route-and-page-is-the-one-balance', async ({ browser }) => {
  test.setTimeout(480_000);
  const w = await build(true);
  const m = model(w.d, true);
  requireLiveDecoys(m);
  const { Y } = w.d;
  const L = (who: Who, year: number) => m.daysLeft.get(key(who, year)) as number;

  // 1. Every GET address of the route folder, as the admin and as Ari: every figure field is the model's figure.
  const walked = await walkGets(w, [
    { label: 'admin', actor: w.admin },
    { label: 'ari', actor: w.ariSession, viewer: 'ari' },
  ]);
  const counts = checkFields(walked, w, m, 'RULE-001');
  expect(counts.get('ari /api/balance') ?? 0, 'RULE-001: the census reaches the member balance answer').toBeGreaterThan(0);
  expect(counts.get('admin /api/admin/pending') ?? 0, 'RULE-001: the census reaches the pending answer').toBeGreaterThan(0);

  // 2. No 200 JSON answer carries a decoy anywhere, whatever the field's name.
  for (const a of walked) {
    if (a.called.status !== 200 || a.called.json === undefined) continue;
    expect.soft(decoysIn(figureText(a.called.json), m), `RULE-001 GET ${a.called.address} as ${a.session}: no wrong figure`).toEqual([]);
  }

  // 3. The send refusal names this year's days left and no decoy.
  const ask = weekdaySpan(addDays(w.d.D0, 84), refusalAsk(m)); // more than the room 65+s; no decoy, so the refusal may name it
  const refusal = await callRoute(w.ariSession.api, 'POST', '/api/requests', { kind: 'vacation', ...ask });
  const refusalText = refusal.json !== undefined ? figureText(refusal.json) : refusal.body;
  expect.soft(refusal.status >= 400 && refusal.status < 500, `RULE-001 a ${refusalAsk(m)}-weekday send is refused (answered ${refusal.status})`).toBe(true);
  expect.soft(standsAlone(refusalText, L('ari', Y)), `RULE-001 the refusal names Ari's ${Y} days left ${L('ari', Y)} (${refusal.body.slice(0, 200)})`).toBe(true);
  expect.soft(decoysIn(refusalText, m), 'RULE-001 the refusal: no wrong figure').toEqual([]);

  // 4. Every page of the page folder, as the admin and as Ari: no decoy; "/" and each person's page show the model.
  const pages = await readPages(browser, w, [
    { label: 'admin', actor: w.admin, viewer: 'admin' },
    { label: 'ari', actor: w.ariSession, viewer: 'ari' },
  ]);
  expect(pages.length, 'RULE-001: the page census found pages').toBeGreaterThan(0);
  for (const p of pages) {
    expect.soft(decoysIn(p.visible, m), `RULE-001 page ${p.address} as ${p.session} (status ${p.status}): no wrong figure`).toEqual([]);
    if (p.years && p.person) {
      for (const year of [Y, Y + 1]) {
        const text = p.years[year];
        if (text === null) continue;
        expect.soft(standsAlone(text, L(p.person, year)), `RULE-001 page ${p.address} as ${p.session}: ${p.person}'s ${year} figures say ${L(p.person, year)} (${text})`).toBe(true);
      }
    }
  }

  // 5. The named sites: "/" as Ari, the people page's rows, the pending page's rows.
  const own = await readOwnFigures(browser, w.ariSession, [Y, Y + 1]);
  expect.soft(own.years[Y] !== null && standsAlone(own.years[Y] as string, L('ari', Y)), `RULE-001 /: Ari's ${Y} figures say ${L('ari', Y)} (${own.years[Y]})`).toBe(true);
  expect.soft(own.years[Y + 1] !== null && standsAlone(own.years[Y + 1] as string, L('ari', Y + 1)), `RULE-001 /: Ari's ${Y + 1} figures say ${L('ari', Y + 1)} (${own.years[Y + 1]})`).toBe(true);
  const rows = await peopleRows(browser, w.admin, [w.ari.name, w.bo.name]);
  expect.soft(standsAlone(rows[w.ari.name], L('ari', Y)) && standsAlone(rows[w.ari.name], L('ari', Y + 1)), `RULE-001 /admin/people: Ari's row says ${L('ari', Y)} and ${L('ari', Y + 1)} (${rows[w.ari.name]})`).toBe(true);
  expect.soft(standsAlone(rows[w.bo.name], L('bo', Y)), `RULE-001 /admin/people: Bo's row says ${L('bo', Y)} (${rows[w.bo.name]})`).toBe(true);
  const all = asks(w.d);
  const pendingSpecs = all.filter((a) => a.after === 'pending' && a.who === 'ari').map((a) => ({ label: a.label, name: w.ari.name, firstDay: a.firstDay }));
  const pend = await readPendingPage(browser, w.admin, pendingSpecs);
  for (const label of ['R5', 'R5b', 'R9', 'R9b']) {
    const a = all.find((x) => x.label === label) as Ask;
    const row = pend.rows.find((r) => r.label === label);
    const year = yearOf(a.firstDay);
    expect.soft(row?.found === true && standsAlone(row.text, L('ari', year)), `RULE-001 /admin/pending: ${label}'s row says ${year}'s days left ${L('ari', year)} (${row?.text})`).toBe(true);
    expect.soft(row?.found === true && standsAlone(row.text, m.forecast.get(label) as number), `RULE-001 /admin/pending: ${label}'s row says the forecast ${m.forecast.get(label)} (${row?.text})`).toBe(true);
  }
});
