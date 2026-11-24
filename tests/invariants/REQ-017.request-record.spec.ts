// Purpose: ledger tests for ROW-085, ROW-086, ROW-087, ROW-088 and ROW-089 (REQ-017) — a request's record holds the fields its state calls for, only the four states, no free text from the person, who and when of every decision and cancel, and a cancel never overwrites who decided it or its days as sent.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-6); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, requests, the admin's two-step actions, own cancel, switch-off), read through records.ts, fresh per run.
//
// Boundary (R6): REQ-017 is a data entity; its record is observed where the product exposes it — the person's own
// requests (GET /api/requests), the admin's view of that person's requests (GET /api/admin/people/:id/requests) and
// the admin's pending list (GET /api/admin/pending), D-029 — at the HTTP harness. ROW-087's "offers" clause is the
// one operation clause and reads the request form in the browser (the harness's engine door).
// The record's field names are not in D-029: records.ts states the one reading (a request's record is the record
// with its id; facts are read by value; who and when of an act are read among the record's facts about that act).
// A field the product stores but returns on none of these views is, at this boundary, a field the request lacks.
//
// The timeline (team zone Pacific/Auckland, every act at 09:00 on its own team date, where the UTC date is the
// day before): sent Mon 2027-03-01 · approved Tue 03-02 · rejected Wed 03-03 · own cancel Thu 03-04 · whole admin
// cancel Fri 03-05 · partial admin cancel Sat 03-13 (takes effect from Mon 03-15, D-020/REQ-017) · switch-off Sun
// 03-14 (takes effect from Mon 03-15). Every request's days are chosen so none of them is one of those dates' days
// as an act date would be read, and the cancel day 03-15 is no act's date.
import { test, expect } from '@playwright/test';
import {
  adminCancel,
  approve,
  cancelOwnRequest,
  confirmedAction,
  createMember,
  DEFAULT_TIME_ZONE,
  fresh,
  freshName,
  openPage,
  PAGES,
  resetProduct,
  sendRequest,
  setClock,
  signIn,
  signInMember,
  switchAccount,
  type AccountId,
  type Actor,
  type Member,
  type RequestSpec,
} from './harness';
import {
  actAt,
  actBy,
  anyHolds,
  CANCELLED,
  DECIDED,
  FOUR_STATES,
  normalState,
  observeCalendar,
  observeOwnRequests,
  observePending,
  observePersonRequests,
  recordById,
  SENT,
  show,
  stateOf,
  teamInstant,
  topRecords,
  requestViews,
  whoOf,
  type Who,
} from './records';

const TZ = DEFAULT_TIME_ZONE;
const T_SEND = teamInstant('2027-03-01', '09:00', TZ); // Mon; UTC still Sun 02-28
const T_APPROVE = teamInstant('2027-03-02', '09:00', TZ); // Tue
const T_REJECT = teamInstant('2027-03-03', '09:00', TZ); // Wed
const T_OWN = teamInstant('2027-03-04', '09:00', TZ); // Thu
const T_WHOLE = teamInstant('2027-03-05', '09:00', TZ); // Fri
const T_PARTIAL = teamInstant('2027-03-13', '09:00', TZ); // Sat: the cancel takes effect from Mon 03-15
const T_SWITCH = teamInstant('2027-03-14', '09:00', TZ); // Sun: the cancel takes effect from Mon 03-15
const CANCEL_DAY = '2027-03-15';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
  await setClock(null).catch(() => undefined);
});

interface Expected {
  label: string;
  owner: 'm' | 's';
  spec: RequestSpec;
  id: AccountId;
  state: (typeof FOUR_STATES)[number];
  decided?: { who: Who; at: string };
  cancelled?: { who: Who; at: string };
  cancelDay?: string;
  note?: string;
}

interface Lifecycle {
  admin: Actor;
  adminWho: Who;
  m: Member;
  mActor: Actor;
  s: Member;
  expected: Expected[];
}

const SPECS = {
  sick: { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-02' } as RequestSpec,
  approvedOnly: { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' } as RequestSpec,
  rejected: { kind: 'vacation', firstDay: '2027-03-24', lastDay: '2027-03-25' } as RequestSpec,
  ownCancelled: { kind: 'vacation', firstDay: '2027-03-29', lastDay: '2027-03-30' } as RequestSpec,
  wholeCancelled: { kind: 'vacation', firstDay: '2027-03-31', lastDay: '2027-04-01' } as RequestSpec,
  partlyCancelled: { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-17' } as RequestSpec,
  switchPending: { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' } as RequestSpec,
  switchPartly: { kind: 'vacation', firstDay: '2027-03-11', lastDay: '2027-03-17' } as RequestSpec,
};

/**
 * Runs the timeline (file header) for member M (six requests) and member S (two requests, switched off at the end).
 * `upTo` stops it early: 'sent' after every send, 'approved' after the approvals, 'all' at the end.
 */
async function lifecycle(upTo: 'sent' | 'approved' | 'all' = 'all'): Promise<Lifecycle> {
  const install = await resetProduct({ now: T_SEND, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const adminWho = whoOf(admin);
  const m = await createMember(admin, { name: freshName('Mira'), allowance: 25 });
  const s = await createMember(admin, { name: freshName('Sven'), allowance: 25 });
  const mActor = keep(await signInMember(m));
  const sActor = keep(await signInMember(s));
  const mWho = whoOf(m);

  const id = {
    sick: await sendRequest(mActor, SPECS.sick),
    approvedOnly: await sendRequest(mActor, SPECS.approvedOnly),
    rejected: await sendRequest(mActor, SPECS.rejected),
    ownCancelled: await sendRequest(mActor, SPECS.ownCancelled),
    wholeCancelled: await sendRequest(mActor, SPECS.wholeCancelled),
    partlyCancelled: await sendRequest(mActor, SPECS.partlyCancelled),
    switchPending: await sendRequest(sActor, SPECS.switchPending),
    switchPartly: await sendRequest(sActor, SPECS.switchPartly),
  };
  const note = fresh('rejection-note');
  const expected: Expected[] = [
    { label: 'pending sick', owner: 'm', spec: SPECS.sick, id: id.sick, state: 'pending' },
    { label: 'approved', owner: 'm', spec: SPECS.approvedOnly, id: id.approvedOnly, state: 'approved', decided: { who: adminWho, at: T_APPROVE } },
    { label: 'rejected with a note', owner: 'm', spec: SPECS.rejected, id: id.rejected, state: 'rejected', decided: { who: adminWho, at: T_REJECT }, note },
    { label: 'cancelled by the person', owner: 'm', spec: SPECS.ownCancelled, id: id.ownCancelled, state: 'cancelled', cancelled: { who: mWho, at: T_OWN } },
    { label: 'approved then wholly cancelled by the admin', owner: 'm', spec: SPECS.wholeCancelled, id: id.wholeCancelled, state: 'cancelled', decided: { who: adminWho, at: T_APPROVE }, cancelled: { who: adminWho, at: T_WHOLE } },
    { label: 'approved then partly cancelled by the admin', owner: 'm', spec: SPECS.partlyCancelled, id: id.partlyCancelled, state: 'approved', decided: { who: adminWho, at: T_APPROVE }, cancelled: { who: adminWho, at: T_PARTIAL }, cancelDay: CANCEL_DAY },
    { label: 'pending, cancelled by the switch-off', owner: 's', spec: SPECS.switchPending, id: id.switchPending, state: 'cancelled', cancelled: { who: adminWho, at: T_SWITCH } },
    { label: 'approved, partly cancelled by the switch-off', owner: 's', spec: SPECS.switchPartly, id: id.switchPartly, state: 'approved', decided: { who: adminWho, at: T_APPROVE }, cancelled: { who: adminWho, at: T_SWITCH }, cancelDay: CANCEL_DAY },
  ];
  const sc: Lifecycle = { admin, adminWho, m, mActor, s, expected };
  if (upTo === 'sent') return sc;

  await setClock(T_APPROVE);
  for (const r of [id.approvedOnly, id.wholeCancelled, id.partlyCancelled, id.switchPartly]) await approve(admin, r);
  if (upTo === 'approved') return sc;

  await setClock(T_REJECT);
  await confirmedAction(admin, 'reject', id.rejected, { note });
  await setClock(T_OWN);
  await cancelOwnRequest(mActor, id.ownCancelled);
  await setClock(T_WHOLE);
  await adminCancel(admin, id.wholeCancelled);
  await setClock(T_PARTIAL);
  await adminCancel(admin, id.partlyCancelled);
  await setClock(T_SWITCH);
  await switchAccount(admin, s.id, false);
  return sc;
}

/** Every view of the timeline's requests: M's own list, the admin's view of M's and of S's requests, the pending list. */
async function allViews(sc: Lifecycle): Promise<{ own: unknown; personM: unknown; personS: unknown; pending: unknown }> {
  return {
    own: await observeOwnRequests(sc.mActor),
    personM: await observePersonRequests(sc.admin, sc.m.id),
    personS: await observePersonRequests(sc.admin, sc.s.id),
    pending: await observePending(sc.admin),
  };
}

function viewsFor(e: Expected, v: { own: unknown; personM: unknown; personS: unknown; pending: unknown }) {
  return e.owner === 'm' ? requestViews(e.id, e.spec.firstDay, v.own, v.personM, v.pending) : requestViews(e.id, e.spec.firstDay, v.personS, v.pending);
}

// ---------------------------------------------------------------------------------------------------
// ROW-085 promise: REQ-017 fail-if (1) "a stored request lacks any of the named fields its state calls for" — the
// ROW-085   person, the kind, its first and last day as sent, its state, when it was sent, who decided it and when,
// ROW-085   who cancelled it and when and the Monday to Friday day its cancel takes effect from, and the admin's
// ROW-085   rejection note if any (REQ-017; A-023, A-024, A-030, A-015; D-020: a whole cancel records who and when,
// ROW-085   only a partial cancel records its day).
// ROW-085 wrong product: a request table with kind, days and state only, or one whose partial cancel keeps "who
// ROW-085   cancelled" but no cancel day, or whose rejection drops the note, or whose records never carry when they
// ROW-085   were sent.
// ROW-085 given: the timeline's eight requests, one per state the record can be in (pending sick, approved,
// ROW-085   rejected with a fresh note, cancelled by the person, wholly cancelled by the admin, partly cancelled by the
// ROW-085   admin, cancelled and partly cancelled by a switch-off), each act on its own team date. when: every view is
// ROW-085   read at the end. then: each request's record (by its id, in the views of its owner) holds its kind, its
// ROW-085   first and last day as sent, its state, the send instant among its facts about sending, and exactly the
// ROW-085   further fields its state calls for: decided who and when, cancelled who and when, the cancel day 03-15
// ROW-085   (a weekend cancel, so the day is no act's date), the note.
// ROW-085 controls: the control case reads the views right after the sends: every request's record is found by
// ROW-085   its id with its days, so the target's failures are about fields, not an unreachable record.
// ROW-085 technique: one case per state the entity has (the "every" of the arm over its finite state set), values
// ROW-085   read by value inside the one record, fresh note, distinct act dates as decoys for the times.
// ROW-085 cases: ROW-085 target=ROW-085.REQ-017.each-state-of-a-request-holds-its-named-fields control=ROW-085.control.every-sent-request-is-found-by-its-id
test('ROW-085.control.every-sent-request-is-found-by-its-id', async () => {
  const sc = await lifecycle('sent');
  const v = await allViews(sc);
  for (const e of sc.expected) {
    const views = viewsFor(e, v);
    expect.soft(views.length, `ROW-085 control: the ${e.label} request ${e.id} is found by its id (${show(v.personM)})`).toBeGreaterThan(0);
    expect.soft(anyHolds(views, e.spec.firstDay), `ROW-085 control: the ${e.label} record carries its first day`).toBe(true);
  }
});

test('ROW-085.REQ-017.each-state-of-a-request-holds-its-named-fields', async () => {
  const sc = await lifecycle('all');
  const v = await allViews(sc);
  for (const e of sc.expected) {
    const views = viewsFor(e, v);
    const where = `ROW-085: the ${e.label} request ${e.id} (${show(views)})`;
    expect.soft(views.length, `${where} is listed`).toBeGreaterThan(0);
    expect.soft(anyHolds(views, e.spec.kind), `${where} holds its kind "${e.spec.kind}"`).toBe(true);
    expect.soft(anyHolds(views, e.spec.firstDay), `${where} holds its first day as sent ${e.spec.firstDay}`).toBe(true);
    expect.soft(anyHolds(views, e.spec.lastDay), `${where} holds its last day as sent ${e.spec.lastDay}`).toBe(true);
    expect.soft(views.map((r) => normalState(stateOf(r))), `${where} holds its state ${e.state}`).toContain(e.state);
    expect.soft(actAt(views, SENT, T_SEND, TZ), `${where} holds when it was sent (${T_SEND})`).toBe(true);
    if (e.decided) {
      expect.soft(actBy(views, DECIDED, e.decided.who), `${where} holds who decided it (${e.decided.who.name})`).toBe(true);
      expect.soft(actAt(views, DECIDED, e.decided.at, TZ), `${where} holds when it was decided (${e.decided.at})`).toBe(true);
    }
    if (e.cancelled) {
      expect.soft(actBy(views, CANCELLED, e.cancelled.who), `${where} holds who cancelled it (${e.cancelled.who.name})`).toBe(true);
      expect.soft(actAt(views, CANCELLED, e.cancelled.at, TZ), `${where} holds when it was cancelled (${e.cancelled.at})`).toBe(true);
    }
    if (e.cancelDay) {
      expect.soft(anyHolds(views, e.cancelDay), `${where} holds the weekday its cancel takes effect from (${e.cancelDay})`).toBe(true);
    }
    if (e.note) {
      expect.soft(anyHolds(views, e.note), `${where} holds the admin's rejection note`).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-086 promise: REQ-017 fail-if (2) "a request's state is anything other than the four named" — pending,
// ROW-086   approved, rejected or cancelled (REQ-017); a partly cancelled request stays approved (REQ-019, A-030).
// ROW-086 wrong product: a fifth state for the partial cancel ("partially_cancelled", "shortened"), a "withdrawn"
// ROW-086   state for the person's own cancel, a "deactivated" state for a switch-off cancel, or an "expired" state.
// ROW-086 given: the timeline's eight requests in every state the record can reach. when: every view is read at the
// ROW-086   end. then: every request record of every view carries a state that is one of the four, and each request's
// ROW-086   state is the one named for it (the partly cancelled ones read "approved", the switch-off ones "cancelled"
// ROW-086   and "approved").
// ROW-086 controls: the control case reads the views right after the sends: every record reads "pending", so the
// ROW-086   state is read where the record carries it.
// ROW-086 technique: a property over every record of every view (the "anything other"), plus the named example per
// ROW-086   reachable state, the partial cancel being the case a fifth state is most plausible for.
// ROW-086 cases: ROW-086 target=ROW-086.REQ-017.every-request-is-in-one-of-the-four-states control=ROW-086.control.sent-requests-read-pending
test('ROW-086.control.sent-requests-read-pending', async () => {
  const sc = await lifecycle('sent');
  const v = await allViews(sc);
  for (const e of sc.expected) {
    const views = viewsFor(e, v);
    expect.soft(views.map((r) => normalState(stateOf(r))), `ROW-086 control: the ${e.label} request reads pending right after it is sent (${show(views)})`).toContain('pending');
  }
});

test('ROW-086.REQ-017.every-request-is-in-one-of-the-four-states', async () => {
  const sc = await lifecycle('all');
  const v = await allViews(sc);
  const byId = new Map(sc.expected.map((e) => [String(e.id), e]));
  for (const [name, view] of Object.entries(v)) {
    for (const r of topRecords(view)) {
      const mine = r.id === undefined || r.id === null ? undefined : byId.get(String(r.id));
      if (!mine || !anyHolds(r, mine.spec.firstDay)) continue; // a request record of the timeline, not an id that happens to match
      const s = normalState(stateOf(r));
      expect.soft(FOUR_STATES as readonly string[], `ROW-086: request ${String(r.id)} in ${name} has state "${s}", one of the four (${show(r)})`).toContain(s);
    }
  }
  for (const e of sc.expected) {
    const views = viewsFor(e, v);
    expect.soft(views.length, `ROW-086: the ${e.label} request is listed`).toBeGreaterThan(0);
    for (const r of views) {
      expect.soft(normalState(stateOf(r)), `ROW-086: the ${e.label} request reads ${e.state} (${show(r)})`).toBe(e.state);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-087 promise: REQ-017 fail-if (3) "a request offers or stores any free text from the person"; REQ-017 "it
// ROW-087   holds no free-text field filled by the person, so no health detail is ever entered" (A-024). The row's
// ROW-087   case: a send carrying extra free-text keys (reason, note) stores none of them and no response echoes them.
// ROW-087 wrong product: a request handler that spreads the whole body into the row (an extra JSON column, or a
// ROW-087   `note` column the admin's rejection note shares) and lists it back; or a request form with a "Reason"
// ROW-087   textarea.
// ROW-087 given: member M sends a sick request and a vacation request whose bodies carry fresh values under reason,
// ROW-087   note, comment, description, message, details and text; the admin approves whatever was accepted. when: every
// ROW-087   answer M and the admin then get is read — the send answers, M's own list, the admin's view of M's requests,
// ROW-087   the pending list, the calendar, and every response the browser receives loading M's pages and the admin's
// ROW-087   pages. then: no answer contains any of the fresh values; the request form at /requests/new draws no textarea
// ROW-087   and no editable free-text area.
// ROW-087 controls: the control case sends the same request without extra keys: 201, and its record is listed with
// ROW-087   its days — so a send is stored and the reads reach the record; and the form page answers M with a form.
// ROW-087 technique: fresh unique values that no product can hard-code, searched in the raw text of every answer
// ROW-087   (a denominator over all responses, never one field); both kinds, the sick one being the harm.
// ROW-087 cases: ROW-087 target=ROW-087.REQ-017.free-text-keys-are-never-stored-or-echoed-and-the-form-offers-none control=ROW-087.control.a-plain-send-is-stored-and-listed
test('ROW-087.control.a-plain-send-is-stored-and-listed', async ({ browser }) => {
  const install = await resetProduct({ now: T_SEND, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const mActor = keep(await signInMember(m));
  const res = await mActor.api.post('/api/requests', { data: { kind: 'sick', firstDay: '2027-03-08', lastDay: '2027-03-09' } });
  expect(res.status(), 'ROW-087 control: a plain send is accepted').toBe(201);
  const id = ((await res.json()) as { id: AccountId }).id;
  const rec = recordById(await observeOwnRequests(mActor), id);
  expect(rec, 'ROW-087 control: the plain request is listed by its id').toBeDefined();
  expect(anyHolds(rec, '2027-03-08'), 'ROW-087 control: the listed record carries its first day').toBe(true);
  const opened = await openPage(browser, mActor);
  try {
    const r = await opened.page.goto(PAGES.newRequest);
    expect(r?.status(), 'ROW-087 control: the request form page answers the member').toBe(200);
    await expect(opened.page.locator('input, select').first(), 'ROW-087 control: the page draws a form').toBeAttached({ timeout: 10_000 });
  } finally {
    await opened.close();
  }
});

test('ROW-087.REQ-017.free-text-keys-are-never-stored-or-echoed-and-the-form-offers-none', async ({ browser }) => {
  const install = await resetProduct({ now: T_SEND, timeZone: TZ });
  const admin = keep(await signIn(install.admin));
  const m = await createMember(admin);
  const mActor = keep(await signInMember(m));
  const marks: Record<string, string> = {};
  for (const k of ['reason', 'note', 'comment', 'description', 'message', 'details', 'text']) marks[k] = fresh(`ft-${k}`);
  const markValues = Object.values(marks);
  const answers: { where: string; text: string }[] = [];

  const sends: { spec: RequestSpec; extra: Record<string, string> }[] = [
    { spec: { kind: 'sick', firstDay: '2027-03-08', lastDay: '2027-03-09' }, extra: marks },
    { spec: { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, extra: { note: marks.note, reason: marks.reason } },
  ];
  const accepted: AccountId[] = [];
  for (const s of sends) {
    const res = await mActor.api.post('/api/requests', { data: { ...s.spec, ...s.extra } });
    const text = await res.text();
    answers.push({ where: `POST /api/requests (${s.spec.kind}) answer`, text });
    if (res.status() === 201) accepted.push((JSON.parse(text) as { id: AccountId }).id);
  }
  answers.push({ where: 'GET /api/admin/pending', text: JSON.stringify(await observePending(admin)) });
  for (const r of accepted) await approve(admin, r);
  answers.push({ where: 'GET /api/requests (own)', text: JSON.stringify(await observeOwnRequests(mActor)) });
  answers.push({ where: 'GET /api/admin/people/:id/requests', text: JSON.stringify(await observePersonRequests(admin, m.id)) });
  answers.push({ where: 'GET /api/calendar (member)', text: JSON.stringify(await observeCalendar(mActor, 2027, 3)) });

  const visit = async (actor: Actor, paths: string[]) => {
    const opened = await openPage(browser, actor);
    const pendingBodies: Promise<void>[] = [];
    opened.page.on('response', (r) => {
      pendingBodies.push(
        r
          .text()
          .then((t) => void answers.push({ where: `browser ${r.url()}`, text: t }))
          .catch(() => undefined),
      );
    });
    try {
      for (const p of paths) {
        await opened.page.goto(p);
        await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        answers.push({ where: `page text ${p}`, text: await opened.page.locator('body').innerText().catch(() => '') });
      }
      await Promise.all(pendingBodies);
    } finally {
      await opened.close();
    }
  };
  await visit(mActor, [PAGES.home, PAGES.calendar]);
  await visit(admin, [PAGES.adminPending, PAGES.adminPerson(m.id), PAGES.calendar]);

  for (const a of answers) {
    const lower = a.text.toLowerCase();
    const echoed = markValues.filter((mark) => lower.includes(mark.toLowerCase()));
    expect.soft(echoed, `ROW-087: ${a.where} carries none of the person's free text`).toEqual([]);
  }

  // "offers": the request form draws no free-text area.
  const opened = await openPage(browser, mActor);
  try {
    const r = await opened.page.goto(PAGES.newRequest);
    expect(r?.status(), 'ROW-087: the request form page is reached (setup)').toBe(200);
    await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await expect(opened.page.locator('input, select').first(), 'ROW-087: the form is drawn').toBeAttached({ timeout: 10_000 });
    await expect.soft(opened.page.locator('textarea'), 'ROW-087: the request form draws no textarea').toHaveCount(0);
    await expect.soft(opened.page.locator('[contenteditable]:not([contenteditable="false"])'), 'ROW-087: the request form draws no editable text area').toHaveCount(0);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-088 promise: REQ-017 fail-if (4) "a decision or cancel does not record who and when" (A-023: every approval,
// ROW-088   rejection and cancellation records who did it and when; D-020: every cancel, whole or partial, records who
// ROW-088   and when).
// ROW-088 wrong product: one "updatedAt" stamp per request and no actor; a decision recorded with the request's
// ROW-088   sender as its actor; a cancel by switch-off that records nobody; times taken from the machine's clock or
// ROW-088   written as the UTC date instead of the team clock's instant.
// ROW-088 given: the timeline — approve (03-02), reject (03-03), the person's own cancel (03-04, by M, not the
// ROW-088   admin), a whole admin cancel (03-05), a partial admin cancel (03-13), a switch-off cancelling a pending and
// ROW-088   partly cancelling an approved request (03-14). when: every view is read at the end. then: each act's
// ROW-088   request carries, among its facts about that act, the actor (the admin, or M for the own cancel) and the
// ROW-088   act's instant — each act's date being no other act's date and not the UTC date.
// ROW-088 controls: the control case stops after the approvals and shows an approved request reads "approved" with
// ROW-088   the admin and the approval instant among its decision facts — the reading works on this product's records.
// ROW-088 technique: one case per kind of act (decision ×2, cancel ×4 doors), each act on its own team date where
// ROW-088   UTC disagrees, the person as a decoy actor for the own cancel.
// ROW-088 cases: ROW-088 target=ROW-088.REQ-017.every-decision-and-cancel-records-who-and-when control=ROW-088.control.an-approval-reads-approved-with-its-facts
test('ROW-088.control.an-approval-reads-approved-with-its-facts', async () => {
  const sc = await lifecycle('approved');
  const v = await allViews(sc);
  const e = sc.expected.find((x) => x.label === 'approved')!;
  const views = viewsFor(e, v);
  expect(views.map((r) => normalState(stateOf(r))), `ROW-088 control: the approved request reads approved (${show(views)})`).toContain('approved');
  expect.soft(actBy(views, DECIDED, sc.adminWho), 'ROW-088 control: its decision facts name the admin').toBe(true);
  expect.soft(actAt(views, DECIDED, T_APPROVE, TZ), 'ROW-088 control: its decision facts carry the approval instant').toBe(true);
});

test('ROW-088.REQ-017.every-decision-and-cancel-records-who-and-when', async () => {
  const sc = await lifecycle('all');
  const v = await allViews(sc);
  for (const e of sc.expected) {
    const views = viewsFor(e, v);
    const where = `ROW-088: the ${e.label} request (${show(views)})`;
    if (e.decided) {
      expect.soft(actBy(views, DECIDED, e.decided.who), `${where} records who decided it: ${e.decided.who.name}`).toBe(true);
      expect.soft(actAt(views, DECIDED, e.decided.at, TZ), `${where} records when it was decided: ${e.decided.at}`).toBe(true);
    }
    if (e.cancelled) {
      expect.soft(actBy(views, CANCELLED, e.cancelled.who), `${where} records who cancelled it: ${e.cancelled.who.name}`).toBe(true);
      expect.soft(actAt(views, CANCELLED, e.cancelled.at, TZ), `${where} records when it was cancelled: ${e.cancelled.at}`).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-089 promise: REQ-017 fail-if (5) "a cancel overwrites who decided the request, or its first and last day as
// ROW-089   sent" (REQ-017 keeps "separate decided and cancelled records", F-13; A-030). The row's cases: approve then
// ROW-089   cancel fully, and approve then cancel partly: who decided stays recorded.
// ROW-089 wrong product: one actor/at pair per request that the cancel rewrites (so "decided" now reads the cancel's
// ROW-089   instant), or a partial cancel that shortens the request by rewriting its last day to the day before the
// ROW-089   cancel.
// ROW-089 given: two requests of M approved by the admin on Tue 03-02. when: the admin cancels one wholly (Fri 03-05)
// ROW-089   and the other partly (Sat 03-13, from Mon 03-15). then: after each cancel, the request's decision facts still
// ROW-089   name the admin and carry Tue 03-02's instant (not the cancel's), and the record still holds its first and
// ROW-089   last day as sent (03-31/04-01 and 03-11/03-17).
// ROW-089 controls: the control case reads the same two records before the cancels: decided by the admin at 03-02,
// ROW-089   days as sent — the before half of the before/after.
// ROW-089 technique: before and after on the same records, the cancel at a different date from the decision so an
// ROW-089   overwrite is visible even though the same admin does both.
// ROW-089 cases: ROW-089 target=ROW-089.REQ-017.a-cancel-keeps-who-decided-and-the-days-as-sent control=ROW-089.control.before-the-cancels-the-records-read-decided-with-their-days
async function row089Requests(sc: Lifecycle) {
  return {
    whole: sc.expected.find((x) => x.label === 'approved then wholly cancelled by the admin')!,
    partly: sc.expected.find((x) => x.label === 'approved then partly cancelled by the admin')!,
  };
}

test('ROW-089.control.before-the-cancels-the-records-read-decided-with-their-days', async () => {
  const sc = await lifecycle('approved');
  const { whole, partly } = await row089Requests(sc);
  for (const e of [whole, partly]) {
    const views = requestViews(e.id, e.spec.firstDay, await observeOwnRequests(sc.mActor), await observePersonRequests(sc.admin, sc.m.id));
    expect.soft(actBy(views, DECIDED, sc.adminWho), `ROW-089 control: before the cancel, ${e.label} names the admin as decider (${show(views)})`).toBe(true);
    expect.soft(actAt(views, DECIDED, T_APPROVE, TZ), `ROW-089 control: before the cancel, ${e.label} carries the approval instant`).toBe(true);
    expect.soft(anyHolds(views, e.spec.firstDay) && anyHolds(views, e.spec.lastDay), `ROW-089 control: ${e.label} holds its days as sent`).toBe(true);
  }
});

test('ROW-089.REQ-017.a-cancel-keeps-who-decided-and-the-days-as-sent', async () => {
  const sc = await lifecycle('approved');
  const { whole, partly } = await row089Requests(sc);
  const read = async (e: Expected) => requestViews(e.id, e.spec.firstDay, await observeOwnRequests(sc.mActor), await observePersonRequests(sc.admin, sc.m.id));

  await setClock(T_WHOLE);
  await adminCancel(sc.admin, whole.id);
  await setClock(T_PARTIAL);
  await adminCancel(sc.admin, partly.id);

  for (const [e, cancelAt] of [
    [whole, T_WHOLE],
    [partly, T_PARTIAL],
  ] as const) {
    const views = await read(e);
    const where = `ROW-089: after the ${e === whole ? 'whole' : 'partial'} cancel, the request (${show(views)})`;
    expect.soft(actAt(views, CANCELLED, cancelAt, TZ), `${where} records the cancel (reached)`).toBe(true);
    expect.soft(actBy(views, DECIDED, sc.adminWho), `${where} still names the admin as who decided it`).toBe(true);
    expect.soft(actAt(views, DECIDED, T_APPROVE, TZ), `${where} still carries the decision's instant ${T_APPROVE}`).toBe(true);
    expect.soft(actAt(views, DECIDED, cancelAt, TZ), `${where} has no decision fact rewritten to the cancel's instant`).toBe(false);
    expect.soft(anyHolds(views, e.spec.firstDay), `${where} still holds its first day as sent ${e.spec.firstDay}`).toBe(true);
    expect.soft(anyHolds(views, e.spec.lastDay), `${where} still holds its last day as sent ${e.spec.lastDay}`).toBe(true);
  }
});
