// Purpose: hostility probe HOS-011 (protects RULE-001, INV-001) — after approve, reject, a partial and a whole cancel, an allowance change and a switch-off on two accounts, every days-left figure on every page and in every answer equals the allowance minus the counted days in effect of approved vacation.
// Provenance: hand-authored (test-author pass, slice 1, brief test-author-15); fixture data made through the product's public routes by harness.ts (reset, clock, accounts, allowances, requests, approve, reject, admin cancel, switch-off), fresh per run; the pages read in the browser through page-figures.ts, page-rows.ts and route-census.ts; the expected figures are this file's own arithmetic over the fixture, never the product's.
//
// Boundary (R6): a figure "shown anywhere" is paint, so the pages are read in the browser (/, /admin/people,
// /admin/pending, /admin/people/:id); the answers the pages are built from (GET /api/balance, /api/admin/people,
// /api/admin/pending) and the send refusal are read at the HTTP harness beside them.
//
// HOS-011 promise: INV-001 "for every person and year, the vacation days left shown anywhere equal that person's
// HOS-011   allowance for that year minus the counted days in effect of their approved vacation requests in that year,
// HOS-011   after every approval, rejection, cancellation, partial cancellation, account switch-off and allowance
// HOS-011   change; the pending page's figure of what an approval would leave is a forecast ... and equals this value
// HOS-011   after that approval"; RULE-001 (every such figure comes from the one balance function); REQ-010 and
// HOS-011   REQ-019 (a cancel keeps the days before today in effect and returns the rest); REQ-016 (a switch-off cancels
// HOS-011   the pending requests and the approved days from today on, the days before today stay); A-043 (an allowance
// HOS-011   change starts this year or next year); D-043 (the people answer's `years`).
// HOS-011 wrong product: one page whose figure is computed without subtracting cancelled days (the probe's own
// HOS-011   toggle) — say the people page counting a partly cancelled request's whole range, or the pending page reading
// HOS-011   a stale total; a page that still uses the allowance before the change; a switch-off whose cancelled days
// HOS-011   stay counted on the people page.
// HOS-011 given: team zone Pacific/Auckland, today Mon 2027-03-01. Ari: allowance 52; vacation Tue 03-02..Fri 03-12
// HOS-011   (9 weekdays) approved, Mon 04-05..Fri 04-09 (5) approved, Mon 05-03..Wed 05-05 (3) pending, 2028 Mon
// HOS-011   02-07..Wed 02-09 (3) approved. Bo: allowance 44; vacation Wed 03-03..Fri 03-05 (3) approved, Mon 03-15..Fri
// HOS-011   03-19 (5) approved, sick Mon 03-22..Tue 03-23 approved, vacation Mon 07-05..Tue 07-06 pending.
// HOS-011 when: the clock moves to Mon 03-08; the admin cancels Ari's 03-02 request (4 days before today stay in
// HOS-011   effect, 5 return), cancels her April request whole, rejects her May request, sets her allowance to 61 this
// HOS-011   year and 66 from next year, and switches Bo off (his 03-15 request's days return, 03-03..03-05 stay); Ari
// HOS-011   sends a pending vacation Mon 06-07..Tue 06-08 (2); Ari sends a 65-weekday vacation that must be refused.
// HOS-011 then (this file's arithmetic): Ari 2027 days left 61 - 4 = 57 (pending 2, the forecast 55), 2028 66 - 3
// HOS-011   = 63; Bo 2027 44 - 3 = 41. On / (as Ari) the 2027 figures say 57 and the 2028 figures 63; on /admin/people
// HOS-011   Ari's row says 57 and 63 and Bo's says 41; on /admin/pending Ari's 06-07 row says 57; the answers agree
// HOS-011   (balance, people `years`, the pending record's days left and forecast); the refusal names 57. Decoys, the
// HOS-011   figures a wrong product shows, appear on NO page and in no answer: Ari 47 (cancelled days still counted),
// HOS-011   48 (the old allowance), 38 (both), 45 (the forecast from 47); Bo 36 (cancelled days still counted).
// HOS-011 controls: the control case builds the same fixture up to the approvals, before any cancel, rejection,
// HOS-011   allowance change or switch-off: the answers and the people page then say Ari 38 and Bo 36 — the decoys are
// HOS-011   exactly the figures before the changes, so the target's absences are the changes' doing, and the page
// HOS-011   readings find the figures where the target looks for them.
// HOS-011 technique: before/after around the changes; distinctive figures (above 31 and no allowance, count or
// HOS-011   date of the fixture) so each is in one exact place, with its near misses as decoys checked on every page.
// HOS-011 cases: HOS-011 target=HOS-011.RULE-001.every-days-left-figure-equals-allowance-minus-days-in-effect-on-every-page control=HOS-011.control.before-the-changes-the-figures-are-the-decoys
import { test, expect, type Browser } from '@playwright/test';
import {
  adminCancel,
  approve,
  createMember,
  freshEmail,
  freshName,
  openPage,
  PAGES,
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
import { aucklandMorning, balanceYear, forecastOf, getJson, pendingPageDaysLeft, recordById } from './readings';
import { recordByEmail, show } from './records';
import { readOwnFigures, readPendingPage } from './page-figures';
import { rowWith } from './page-rows';
import { capturePageLoad, holdsNumber } from './route-census';

const disposables: { dispose(): Promise<void> }[] = [];
function keep<T extends { dispose(): Promise<void> }>(x: T): T {
  disposables.push(x);
  return x;
}
test.afterEach(async () => {
  for (const d of disposables.splice(0)) await d.dispose().catch(() => undefined);
});

const ARI_DECOYS = [47, 48, 38, 45];
const BO_DECOYS = [36];
const A5 = { kind: 'vacation' as const, firstDay: '2027-06-07', lastDay: '2027-06-08' };

interface World {
  admin: Actor;
  ari: Member;
  bo: Member;
  ariSession: Actor;
  a5?: AccountId;
}

async function build(withChanges: boolean): Promise<World> {
  const install = await resetProduct({ now: aucklandMorning('2027-03-01') });
  const admin = keep(await signIn(install.admin));
  const ari = await createMember(admin, { name: freshName('Ari'), email: freshEmail('ari'), allowance: 52 });
  const bo = await createMember(admin, { name: freshName('Bo'), email: freshEmail('bo'), allowance: 44 });
  const ariSession = keep(await signInMember(ari));
  const boSession = keep(await signInMember(bo));

  const a1 = await sendRequest(ariSession, { kind: 'vacation', firstDay: '2027-03-02', lastDay: '2027-03-12' });
  const a2 = await sendRequest(ariSession, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-09' });
  const a3 = await sendRequest(ariSession, { kind: 'vacation', firstDay: '2027-05-03', lastDay: '2027-05-05' });
  const a4 = await sendRequest(ariSession, { kind: 'vacation', firstDay: '2028-02-07', lastDay: '2028-02-09' });
  await approve(admin, a1);
  await approve(admin, a2);
  await approve(admin, a4);
  await approve(admin, await sendRequest(boSession, { kind: 'vacation', firstDay: '2027-03-03', lastDay: '2027-03-05' }));
  await approve(admin, await sendRequest(boSession, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-19' }));
  await approve(admin, await sendRequest(boSession, { kind: 'sick', firstDay: '2027-03-22', lastDay: '2027-03-23' }));
  await sendRequest(boSession, { kind: 'vacation', firstDay: '2027-07-05', lastDay: '2027-07-06' });
  if (!withChanges) return { admin, ari, bo, ariSession };

  await setClock(aucklandMorning('2027-03-08'));
  await adminCancel(admin, a1);
  await adminCancel(admin, a2);
  await reject(admin, a3);
  await setAllowance(admin, ari.id, 61);
  await setAllowance(admin, ari.id, 66, { startsNextYear: true });
  await switchAccount(admin, bo.id, false);
  const a5 = await sendRequest(ariSession, A5);
  return { admin, ari, bo, ariSession, a5 };
}

/** One account's figure for one year in the people answer (D-043: the account's `years`, each with year and daysLeft). */
function peopleDaysLeft(people: unknown, email: string, year: number): number | undefined {
  const rec = recordByEmail(people, email);
  const years = rec?.years;
  if (!Array.isArray(years)) return undefined;
  const y = years.find((x) => x && typeof x === 'object' && Number((x as Record<string, unknown>).year) === year) as Record<string, unknown> | undefined;
  return typeof y?.daysLeft === 'number' ? y.daysLeft : undefined;
}

/**
 * The answer as text with what is not a figure taken out: every value under a key naming an id, every instant and
 * every email, so an id or a time that happens to equal a decoy is never read as a figure.
 */
function figuresOnly(json: unknown): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !/(^id$|Id$|_id$|At$|_at$)/.test(k))
          .map(([k, x]) => [k, strip(x)]),
      );
    }
    if (typeof v === 'string' && (/@/.test(v) || /^\d{4}-\d{2}-\d{2}T/.test(v))) return '';
    return v;
  };
  return JSON.stringify(strip(json));
}

/** Loads `address` as the admin and returns the visible text once `ready` is drawn (bounded poll, no sleep). */
async function adminPageText(browser: Browser, admin: Actor, address: string, ready: string[]): Promise<{ status: number; text: string }> {
  const opened = await openPage(browser, admin);
  try {
    const load = await capturePageLoad(opened.page, address);
    let text = load.visible;
    await expect
      .poll(
        async () => {
          text = await opened.page.locator('body').innerText().catch(() => text);
          return ready.every((r) => text.includes(r));
        },
        { timeout: 10_000 },
      )
      .toBe(true)
      .catch(() => undefined);
    return { status: load.status, text };
  } finally {
    await opened.close();
  }
}

/** The text of the people page's row for each name, read on one load. */
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
    out['__page'] = await opened.page.locator('body').innerText().catch(() => '');
    return out;
  } finally {
    await opened.close();
  }
}

test('HOS-011.control.before-the-changes-the-figures-are-the-decoys', async ({ browser }) => {
  const w = await build(false);
  expect(balanceYear(await readBalance(w.ariSession), 2027)?.daysLeft, "HOS-011 control: Ari's 2027 balance before the changes is 52 - 14").toBe(38);
  const people = await getJson(w.admin.api, '/api/admin/people', 'HOS-011 control');
  expect(peopleDaysLeft(people, w.ari.email, 2027), `HOS-011 control: the people answer says Ari 38 (${show(recordByEmail(people, w.ari.email))})`).toBe(38);
  expect(peopleDaysLeft(people, w.bo.email, 2027), `HOS-011 control: the people answer says Bo 36 (${show(recordByEmail(people, w.bo.email))})`).toBe(36);
  const rows = await peopleRows(browser, w.admin, [w.ari.name, w.bo.name]);
  expect(holdsNumber(rows[w.ari.name], 38), `HOS-011 control: the people page's row for Ari says 38 (${rows[w.ari.name]})`).toBe(true);
  expect(holdsNumber(rows[w.bo.name], 36), `HOS-011 control: the people page's row for Bo says 36 (${rows[w.bo.name]})`).toBe(true);
});

test('HOS-011.RULE-001.every-days-left-figure-equals-allowance-minus-days-in-effect-on-every-page', async ({ browser }) => {
  test.setTimeout(240_000);
  const w = await build(true);
  const decoysOn = (where: string, text: string, decoys: number[]) => {
    const shown = decoys.filter((n) => holdsNumber(text, n));
    expect.soft(shown, `HOS-011 ${where}: shows none of the wrong figures ${decoys.join(', ')}`).toEqual([]);
  };

  // The answers.
  const balance = await readBalance(w.ariSession);
  expect.soft(balanceYear(balance, 2027), 'HOS-011 GET /api/balance: Ari 2027').toEqual({ daysLeft: 57, pending: 2 });
  expect.soft(balanceYear(balance, 2028)?.daysLeft, 'HOS-011 GET /api/balance: Ari 2028').toBe(63);
  const people = await getJson(w.admin.api, '/api/admin/people', 'HOS-011');
  expect.soft(peopleDaysLeft(people, w.ari.email, 2027), 'HOS-011 GET /api/admin/people: Ari 2027').toBe(57);
  expect.soft(peopleDaysLeft(people, w.ari.email, 2028), 'HOS-011 GET /api/admin/people: Ari 2028').toBe(63);
  expect.soft(peopleDaysLeft(people, w.bo.email, 2027), 'HOS-011 GET /api/admin/people: Bo 2027').toBe(41);
  const pending = await getJson(w.admin.api, '/api/admin/pending', 'HOS-011');
  const a5rec = recordById(pending, w.a5 as AccountId);
  expect(a5rec, "HOS-011 GET /api/admin/pending: Ari's 06-07 request is listed").toBeDefined();
  if (a5rec) {
    expect.soft(pendingPageDaysLeft(a5rec), "HOS-011 GET /api/admin/pending: Ari's days left beside her 06-07 request").toBe(57);
    expect.soft(forecastOf(a5rec), "HOS-011 GET /api/admin/pending: the 06-07 request's forecast is 57 - 2").toBe(55);
  }
  const refusal = await w.ariSession.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-08-02', lastDay: '2027-10-29' } });
  const refusalText = await refusal.text();
  expect.soft(refusal.status() >= 400 && refusal.status() < 500, `HOS-011 the 65-weekday send is refused (answered ${refusal.status()})`).toBe(true);
  expect.soft(holdsNumber(refusalText, 57), `HOS-011 the refusal names Ari's 2027 days left 57 (${refusalText.slice(0, 200)})`).toBe(true);
  decoysOn('the refusal', refusalText, ARI_DECOYS);
  for (const [label, body] of [['GET /api/balance', balance], ['GET /api/admin/people', people], ['GET /api/admin/pending', pending]] as const) {
    decoysOn(label, figuresOnly(body), [...ARI_DECOYS, ...BO_DECOYS]);
  }

  // The own page "/", as Ari.
  const own = await readOwnFigures(browser, w.ariSession, [2027, 2028]);
  expect.soft(own.years[2027] !== null && holdsNumber(own.years[2027] as string, 57), `HOS-011 /: Ari's 2027 figures say 57 (${own.years[2027]})`).toBe(true);
  expect.soft(own.years[2028] !== null && holdsNumber(own.years[2028] as string, 63), `HOS-011 /: Ari's 2028 figures say 63 (${own.years[2028]})`).toBe(true);
  decoysOn('/ as Ari', own.body, ARI_DECOYS);

  // The people page.
  const rows = await peopleRows(browser, w.admin, [w.ari.name, w.bo.name]);
  expect.soft(holdsNumber(rows[w.ari.name], 57) && holdsNumber(rows[w.ari.name], 63), `HOS-011 /admin/people: Ari's row says 57 and 63 (${rows[w.ari.name]})`).toBe(true);
  expect.soft(holdsNumber(rows[w.bo.name], 41), `HOS-011 /admin/people: Bo's row says 41 (${rows[w.bo.name]})`).toBe(true);
  decoysOn('/admin/people', rows['__page'], [...ARI_DECOYS, ...BO_DECOYS]);

  // The pending page.
  const pend = await readPendingPage(browser, w.admin, [{ label: 'Ari 06-07', name: w.ari.name, firstDay: A5.firstDay }]);
  const pendRow = pend.rows[0];
  expect.soft(pendRow?.found && holdsNumber(pendRow.text, 57), `HOS-011 /admin/pending: Ari's 06-07 row says 57 (${pendRow?.text})`).toBe(true);
  decoysOn('/admin/pending', pend.body, ARI_DECOYS);

  // Each person's page.
  const ariPage = await adminPageText(browser, w.admin, PAGES.adminPerson(w.ari.id), [w.ari.name]);
  expect.soft(ariPage.status, "HOS-011 /admin/people/:id (Ari): answers the admin").toBe(200);
  decoysOn("/admin/people/:id (Ari)", ariPage.text, ARI_DECOYS);
  const boPage = await adminPageText(browser, w.admin, PAGES.adminPerson(w.bo.id), [w.bo.name]);
  expect.soft(boPage.status, "HOS-011 /admin/people/:id (Bo): answers the admin").toBe(200);
  decoysOn("/admin/people/:id (Bo)", boPage.text, BO_DECOYS);
});
