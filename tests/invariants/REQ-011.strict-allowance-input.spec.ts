// Purpose: ledger tests for ROW-145 (REQ-011, REQ-023) — allowance input is parsed strictly: 1e2, 25.0, 025, a 20-digit number or negative zero are refused or stored exactly as the whole number meant, never a server error or a wrapped value.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-10); fixture data made through the product's public routes by harness.ts and team-calendar.ts, fresh per run.
//
// Boundary (R6): the input rule, proved at the HTTP harness on POST /api/admin/accounts/:id/allowance
// {allowance, startsNextYear} and POST /api/admin/accounts {…, allowance}, each form sent both as a JSON number
// written raw in the body text (as a client could) and as a JSON string (as a form field arrives). What was stored is
// read from the person's own days left for the current year (GET /api/balance; no approved request, so days left =
// the allowance in force).
import { test, expect } from '@playwright/test';
import { freshEmail, freshName, freshPassword, requireOk, signIn } from './harness';
import {
  addMember,
  AUCKLAND,
  canSignIn,
  disposeAll,
  isAccepted,
  isRefusal,
  startTeam,
  teamInstant,
  tryAllowance,
  tryCreate,
  yearFigures,
  type Answer,
} from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NOW = teamInstant(AUCKLAND, '2027-03-10', '15:00');

/** [label, the value as raw JSON text or as a string, the whole number it means — undefined when it must be refused]. */
const FORMS: [string, { raw: string } | { str: string }, number | undefined][] = [
  ['raw 1e2', { raw: '1e2' }, 100],
  ['string "1e2"', { str: '1e2' }, 100],
  ['raw 25.0', { raw: '25.0' }, 25],
  ['string "25.0"', { str: '25.0' }, 25],
  ['raw 025 (not JSON)', { raw: '025' }, undefined],
  ['string "025"', { str: '025' }, 25],
  ['raw 12345678901234567890', { raw: '12345678901234567890' }, undefined],
  ['string "12345678901234567890"', { str: '12345678901234567890' }, undefined],
  ['raw -0', { raw: '-0' }, 0],
  ['string "-0"', { str: '-0' }, 0],
  ['raw 25.5 (not whole)', { raw: '25.5' }, undefined],
  ['string "25.5" (not whole)', { str: '25.5' }, undefined],
];

function bodyOf(form: { raw: string } | { str: string }, rest: Record<string, unknown>): { body: unknown; rawText: boolean } {
  if ('raw' in form) {
    const fields = Object.entries(rest).map(([k, v]) => `,${JSON.stringify(k)}:${JSON.stringify(v)}`).join('');
    return { body: `{"allowance":${form.raw}${fields}}`, rawText: true };
  }
  return { body: { allowance: form.str, ...rest }, rawText: false };
}

function judge(a: Answer, meant: number | undefined, stored: number | undefined, before: number | undefined, label: string): void {
  expect.soft(a.status < 500, `ROW-145 ${label}: never a server error (answered ${a.status} ${a.text.slice(0, 120)})`).toBe(true);
  if (meant === undefined) {
    expect.soft(isRefusal(a), `ROW-145 ${label}: refused (answered ${a.status})`).toBe(true);
    expect.soft(stored, `ROW-145 ${label}: nothing changed`).toBe(before);
  } else if (isAccepted(a)) {
    expect.soft(stored, `ROW-145 ${label}: stored exactly as ${meant}`).toBe(meant);
  } else {
    expect.soft(isRefusal(a), `ROW-145 ${label}: either stored as ${meant} or plainly refused (answered ${a.status})`).toBe(true);
    expect.soft(stored, `ROW-145 ${label}: refused, so nothing changed`).toBe(before);
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-145 promise: REQ-011 fail-if (1) "an allowance that is negative or not a whole number is accepted" and REQ-023
// ROW-145   (the account holds its allowance), with D-016 (a whole number from 0 to 260): allowance input is parsed
// ROW-145   strictly — 1e2, 25.0, 025, a 20-digit number or negative zero are refused or stored exactly as the whole
// ROW-145   number meant, never a server error or a wrapped value.
// ROW-145 wrong product: parseInt ("1e2" → 1, "25.5" → 25), Number without a range check (12345678901234567890 stored,
// ROW-145   wrapped by the database to another integer, or a 500), an octal reading of "025" (21), a raw body that is not
// ROW-145   JSON answered with a 500, "-0" stored and shown as -0.
// ROW-145 given: a member whose allowance is set to a fresh baseline before each attempt. when: the admin posts each
// ROW-145   form, raw and as a string. then: the answer is never 5xx; a form with a whole meaning (1e2 → 100, 25.0 → 25,
// ROW-145   "025" → 25, -0 → 0) is either stored as exactly that — the member's days left equal it — or refused with
// ROW-145   the baseline kept; a form with none (025 raw, 20 digits, 25.5) is refused with the baseline kept. The same
// ROW-145   forms on create: accepted only with the meant number, else refused and no account made.
// ROW-145 controls: the control case sets 23 as a plain JSON number: accepted, days left 23 — the route and the
// ROW-145   reading work.
// ROW-145 technique: near misses of a whole number, one per loosening, each with its exact expected value, and the
// ROW-145   baseline moved before each so a refused attempt cannot pass by luck.
// ROW-145 cases: ROW-145 target=ROW-145.REQ-011.allowance-forms-are-refused-or-stored-exactly control=ROW-145.control.a-plain-whole-number-is-stored
test('ROW-145.control.a-plain-whole-number-is-stored', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { member, actor } = await addMember(team, { allowance: 17 });
  const a = await tryAllowance(team.admin, member.id, { allowance: 23, startsNextYear: false });
  expect(isAccepted(a), `ROW-145 control: 23 is accepted (answered ${a.status} ${a.text.slice(0, 160)})`).toBe(true);
  expect((await yearFigures(actor, 2027))?.daysLeft, 'ROW-145 control: days left are 23').toBe(23);
});

test('ROW-145.REQ-011.allowance-forms-are-refused-or-stored-exactly', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  const { member, actor } = await addMember(team, { allowance: 17 });
  let baseline = 40;
  for (const [label, form, meant] of FORMS) {
    baseline += 1;
    const set = await tryAllowance(team.admin, member.id, { allowance: baseline, startsNextYear: false });
    expect(isAccepted(set), `ROW-145 setup: the baseline ${baseline} is set (answered ${set.status})`).toBe(true);
    const before = (await yearFigures(actor, 2027))?.daysLeft;
    expect(before, `ROW-145 setup: days left are the baseline ${baseline}`).toBe(baseline);
    const { body, rawText } = bodyOf(form, { startsNextYear: false });
    const a = await tryAllowance(team.admin, member.id, body, rawText);
    const stored = (await yearFigures(actor, 2027))?.daysLeft;
    judge(a, meant, stored, before, label);
    if (meant === 0 && stored !== undefined) expect.soft(Object.is(stored, -0), `ROW-145 ${label}: never a negative zero`).toBe(false);
  }
});

test('ROW-145.REQ-023.create-allowance-forms-are-refused-or-stored-exactly', async () => {
  const team = await startTeam({ zone: AUCKLAND, now: NOW });
  for (const [label, form, meant] of FORMS) {
    const email = freshEmail('allow');
    const password = freshPassword();
    const { body, rawText } = bodyOf(form, { name: freshName('Allow'), email, password });
    const a = await tryCreate(team.admin, body, rawText);
    expect.soft(a.status < 500, `ROW-145 create ${label}: never a server error (answered ${a.status} ${a.text.slice(0, 120)})`).toBe(true);
    if (meant === undefined || !isAccepted(a)) {
      expect.soft(isRefusal(a), `ROW-145 create ${label}: ${meant === undefined ? 'refused' : `either stored as ${meant} or refused`} (answered ${a.status})`).toBe(true);
      expect.soft(await canSignIn(email, password), `ROW-145 create ${label}: refused, so no account was made`).toBe(false);
      continue;
    }
    const s = await signIn({ email, password });
    try {
      await requireOk(await s.api.post('/api/me/password', { data: { current: password, next: freshPassword() } }), 'POST /api/me/password');
      expect.soft((await yearFigures(s, 2027))?.daysLeft, `ROW-145 create ${label}: stored exactly as ${meant}`).toBe(meant);
    } finally {
      await s.dispose();
    }
  }
});
