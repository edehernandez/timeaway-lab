// Purpose: ledger tests for ROW-235, ROW-236, ROW-237 and ROW-238 (REQ-014, REQ-015) — sign-in answers identically for an unknown email, a wrong password and a switched-off account, and a correct sign-in succeeds; wrong-password attempts at sign-in and at the change-password form are bounded per normalised email (5 within 15 minutes, then a 15-minute wait), cannot be evaded by a forwarded-address header or the email's case or spaces, and never lock an account for good.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, switch-off, sign-in, password change), fresh per run; time moves only through the harness's team clock (setClock), never by waiting.
//
// Boundary (R6): sign-in rules, proved at the HTTP harness on POST /api/auth/sign-in and POST /api/me/password
// (D-029). "Signed in" is judged by GET /api/me on the attempt's own jar. D-026 gives the numbers: 5 wrong attempts
// within 15 minutes per normalised submitted email, whether or not an account exists, then a 15-minute wait.
import { test, expect } from '@playwright/test';
import { anonymousApi, createMember, fresh, freshEmail, freshPassword, setClock, signInMember, switchAccount, type Member } from './harness';
import { disposeAll, freshTeam, keep, minutesAfter, T0, trySignIn } from './robustness';

test.afterEach(disposeAll);

type Answer = Awaited<ReturnType<typeof trySignIn>>;

async function attempt(email: string, password: string, headers: Record<string, string> = {}): Promise<Answer> {
  const api = await anonymousApi();
  try {
    return await trySignIn(api, email, password, headers);
  } finally {
    await api.dispose();
  }
}

function wrong(): string {
  return `Wrong-${fresh('w')}`;
}

/** The comparable shape of an answer: status, content type, cookie-setting and the body itself. */
function shape(a: Answer): { status: number; contentType: string; setsCookie: boolean; body: string } {
  return { status: a.status, contentType: a.contentType, setsCookie: a.setsCookie, body: a.body };
}

const at = (minutes: number) => minutesAfter(T0, minutes);

// ---------------------------------------------------------------------------------------------------
// ROW-235 promise: the row — sign-in answers identically, in message and shape, for an unknown email, a wrong
// ROW-235   password and a switched-off account; REQ-014 (a wrong password and a switched-off account never sign in).
// ROW-235 wrong product: "No account with that email" against "Wrong password" against "This account is switched off"
// ROW-235   (or a 404 against a 401 against a 403), so anyone can learn who is on the team and who has left.
// ROW-235 given: member K (on), member O (switched off). when: sign-in is posted with a fresh unknown email; with
// ROW-235   K's email and a wrong password; with O's email and O's correct password; with O's email and a wrong one.
// ROW-235   then: none gives a session, and all four answers have the same status, content type, cookie-setting and
// ROW-235   body, byte for byte.
// ROW-235 controls: the control case signs K in with its correct password: a session — so the shared answer is a
// ROW-235   refusal of these three causes and not the route failing for everyone.
// ROW-235 technique: one answer compared whole against the others (a near-miss message differs in one word).
// ROW-235 cases: ROW-235 target=ROW-235.REQ-014.unknown-wrong-and-switched-off-answer-alike control=ROW-235.control.the-known-account-signs-in-correctly
async function knownAndOff(): Promise<{ k: Member; o: Member }> {
  const { admin } = await freshTeam();
  const k = await createMember(admin);
  const o = await createMember(admin);
  await switchAccount(admin, o.id, false);
  return { k, o };
}

test('ROW-235.control.the-known-account-signs-in-correctly', async () => {
  const { k } = await knownAndOff();
  expect((await attempt(k.email, k.password)).session, 'ROW-235 control: K signs in').toBe(true);
});

test('ROW-235.REQ-014.unknown-wrong-and-switched-off-answer-alike', async () => {
  const { k, o } = await knownAndOff();
  const answers: [string, Answer][] = [
    ['an unknown email', await attempt(freshEmail('nobody'), freshPassword())],
    ['a wrong password', await attempt(k.email, wrong())],
    ['a switched-off account, correct password', await attempt(o.email, o.password)],
    ['a switched-off account, wrong password', await attempt(o.email, wrong())],
  ];
  for (const [label, a] of answers) expect.soft(a.session, `ROW-235 ${label}: no session`).toBe(false);
  const first = shape(answers[0][1]);
  for (const [label, a] of answers.slice(1)) {
    expect.soft(shape(a), `ROW-235 ${label}: answers exactly as an unknown email does`).toEqual(first);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-236 promise: the row (control of ROW-235) — a correct sign-in succeeds; REQ-014.
// ROW-236 wrong product: a "uniform answer" that refuses everyone (the generic refusal returned unconditionally).
// ROW-236 given: member K (on). when: sign-in is posted with K's email and password. then: it answers 2xx and GET
// ROW-236   /api/me on the same jar answers K's session.
// ROW-236 controls: the control case shows an unknown email gives no session on the same route — the session is not
// ROW-236   handed out by default.
// ROW-236 technique: the right credentials beside the near miss, read through the session.
// ROW-236 cases: ROW-236 target=ROW-236.REQ-014.a-correct-sign-in-succeeds control=ROW-236.control.an-unknown-email-gives-no-session
test('ROW-236.control.an-unknown-email-gives-no-session', async () => {
  await freshTeam();
  expect((await attempt(freshEmail('nobody'), freshPassword())).session, 'ROW-236 control: an unknown email gives no session').toBe(false);
});

test('ROW-236.REQ-014.a-correct-sign-in-succeeds', async () => {
  const { k } = await knownAndOff();
  const a = await attempt(k.email, k.password);
  expect.soft(a.status, 'ROW-236: the correct sign-in answers 2xx').toBeLessThan(300);
  expect(a.session, 'ROW-236: it gives a session').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-237 promise: the row — wrong-password attempts at sign-in and at the change-password form are bounded per
// ROW-237   account, cannot be evaded by a forwarded address header or the email's case, and never lock an account for
// ROW-237   good; its examples: surrounding spaces do not evade the bound; the bound is keyed on the normalised submitted
// ROW-237   email whether or not an account exists, so known and unknown emails answer alike; 5 wrong attempts within
// ROW-237   15 minutes per normalised email, then a 15-minute wait (D-026). REQ-014, REQ-015.
// ROW-237 wrong product: no bound; a bound keyed on the client address (reset by a fresh X-Forwarded-For) or on the
// ROW-237   email as typed (reset by "A@X" or " a@x "); a bound only at sign-in, so the change-password form guesses
// ROW-237   freely; a bound only for existing accounts (so the wait itself tells who exists); a lock never lifted.
// ROW-237 given: the team clock at Mon 8 Mar 2027 09:00 (team zone), held still; members A, B, C, D, E, F and N;
// ROW-237   an unknown email U; D signed in. when, at T0: 5 wrong sign-ins for A; for B, each with a different
// ROW-237   X-Forwarded-For, X-Real-IP and Forwarded; for C as C, C upper-cased, C in spaces, C capitalised, C with a
// ROW-237   trailing space; for U; 5 wrong current passwords on D's change form; 4 for E; F's first. At T0+1 min:
// ROW-237   A, B (another forwarded address), C with their correct passwords, U again, D's form with the correct current
// ROW-237   password, E and N correctly. F wrong again at +4, +8, +12, +16 min. At T0+14: A correctly. At T0+16: A
// ROW-237   correctly, D's old password; at T0+16.5: F correctly.
// ROW-237 then: at +1 A, B and C get no session, D's change is refused, U's answer equals A's in status and body,
// ROW-237   while E (4 wrong) and N (none) sign in; at +14 A still waits; at +16 A signs in and D's old password still
// ROW-237   signs in (the refused change changed nothing); F, never 5 wrong within 15 minutes, signs in at +16.5.
// ROW-237 controls: the control case is N's correct sign-in at T0+1 while A waits — the bound is A's alone and the
// ROW-237   correct path works at that instant.
// ROW-237 technique: the clock's origin held still, values just either side of the bound (4 and 5 attempts; 14 and 16
// ROW-237   minutes; five attempts spread over 16 minutes), and each evasion on its own account.
// ROW-237 cases: ROW-237 target=ROW-237.REQ-014.wrong-attempts-are-bounded-per-normalised-email-and-the-wait-ends control=ROW-237.control.a-neighbour-signs-in-while-another-email-waits
async function signsIn(email: string, password: string, headers: Record<string, string> = {}): Promise<boolean> {
  return (await attempt(email, password, headers)).session;
}

test('ROW-237.control.a-neighbour-signs-in-while-another-email-waits', async () => {
  const { admin } = await freshTeam({ now: T0 });
  const a = await createMember(admin);
  const n = await createMember(admin);
  for (let i = 0; i < 5; i += 1) await attempt(a.email, wrong());
  await setClock(at(1));
  expect(await signsIn(n.email, n.password), 'ROW-237 control: N signs in while A waits').toBe(true);
});

test('ROW-237.REQ-014.wrong-attempts-are-bounded-per-normalised-email-and-the-wait-ends', async () => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam({ now: T0 });
  const members: Member[] = [];
  for (let i = 0; i < 7; i += 1) members.push(await createMember(admin));
  const [A, B, C, D, E, F, N] = members;
  const U = freshEmail('unknown');
  const dSession = keep(await signInMember(D));

  // T0: the wrong attempts.
  await setClock(at(0));
  for (let i = 0; i < 5; i += 1) await attempt(A.email, wrong());
  for (let i = 0; i < 5; i += 1) {
    const ip = `203.0.113.${10 + i}`;
    await attempt(B.email, wrong(), { 'x-forwarded-for': ip, 'x-real-ip': ip, forwarded: `for=${ip}` });
  }
  const cForms = [C.email, C.email.toUpperCase(), `  ${C.email}  `, C.email.charAt(0).toUpperCase() + C.email.slice(1), `${C.email} `];
  for (const form of cForms) await attempt(form, wrong());
  for (let i = 0; i < 5; i += 1) await attempt(U, wrong());
  for (let i = 0; i < 5; i += 1) await dSession.api.post('/api/me/password', { data: { current: wrong(), next: freshPassword() } });
  for (let i = 0; i < 4; i += 1) await attempt(E.email, wrong());
  await attempt(F.email, wrong());

  // T0+1: inside the wait.
  await setClock(at(1));
  const a6 = await attempt(A.email, A.password);
  expect.soft(a6.session, 'ROW-237 +1 min: A, after 5 wrong attempts, gets no session with its correct password').toBe(false);
  const fresh6 = '198.51.100.77';
  expect.soft(await signsIn(B.email, B.password, { 'x-forwarded-for': fresh6, 'x-real-ip': fresh6, forwarded: `for=${fresh6}` }), 'ROW-237 +1 min: a new forwarded address does not evade the bound').toBe(false);
  expect.soft(await signsIn(C.email, C.password), "ROW-237 +1 min: the email's case and spaces do not evade the bound").toBe(false);
  const u6 = await attempt(U, freshPassword());
  expect.soft({ status: u6.status, body: u6.body }, 'ROW-237 +1 min: an unknown email answers as a known one does').toEqual({ status: a6.status, body: a6.body });
  const newer = freshPassword();
  const d6 = await dSession.api.post('/api/me/password', { data: { current: D.password, next: newer } });
  expect.soft(d6.status() >= 200 && d6.status() < 300, `ROW-237 +1 min: the change form, after 5 wrong current passwords, refuses the correct one (answered ${d6.status()})`).toBe(false);
  expect.soft(await signsIn(E.email, E.password), 'ROW-237 +1 min: E, after only 4 wrong attempts, signs in').toBe(true);
  expect.soft(await signsIn(N.email, N.password), 'ROW-237 +1 min: N, untouched, signs in').toBe(true);

  // F spreads five wrong attempts over 16 minutes; A is checked at 14 and 16.
  for (const m of [4, 8, 12]) {
    await setClock(at(m));
    await attempt(F.email, wrong());
  }
  await setClock(at(14));
  expect.soft(await signsIn(A.email, A.password), 'ROW-237 +14 min: A still waits').toBe(false);
  await setClock(at(16));
  await attempt(F.email, wrong());
  expect.soft(await signsIn(A.email, A.password), 'ROW-237 +16 min: the wait is over and A signs in — never a permanent lock').toBe(true);
  expect.soft(await signsIn(D.email, D.password), "ROW-237 +16 min: D's old password still signs in (the refused change changed nothing)").toBe(true);
  expect.soft(await signsIn(D.email, newer), 'ROW-237 +16 min: the refused change\'s password does not').toBe(false);
  await setClock(at(16.5));
  expect.soft(await signsIn(F.email, F.password), 'ROW-237 +16.5 min: F, never 5 wrong within 15 minutes, signs in').toBe(true);
});

// ---------------------------------------------------------------------------------------------------
// ROW-238 promise: the row (control of ROW-237) — after the 15-minute wait, the correct password signs in; REQ-014,
// ROW-238   REQ-015, D-026 ("never a permanent lock").
// ROW-238 wrong product: a lock that needs the admin to lift it (none can, with no email and one admin), or a wait
// ROW-238   counted from the latest refused attempt including correct ones, so a person who keeps trying never gets in.
// ROW-238 given: member G; the clock held at T0. when: 5 wrong sign-ins for G at T0, the correct one at T0+16 min.
// ROW-238   then: the correct sign-in gives a session of G.
// ROW-238 controls: the control case signs G in correctly at T0 before any wrong attempt.
// ROW-238 technique: the clock moved just past the wait through the harness, never slept.
// ROW-238 cases: ROW-238 target=ROW-238.REQ-014.after-the-wait-the-correct-password-signs-in control=ROW-238.control.the-correct-password-signs-in-before-any-attempt
test('ROW-238.control.the-correct-password-signs-in-before-any-attempt', async () => {
  const { admin } = await freshTeam({ now: T0 });
  const g = await createMember(admin);
  expect(await signsIn(g.email, g.password), 'ROW-238 control: G signs in').toBe(true);
});

test('ROW-238.REQ-014.after-the-wait-the-correct-password-signs-in', async () => {
  const { admin } = await freshTeam({ now: T0 });
  const g = await createMember(admin);
  await setClock(at(0));
  for (let i = 0; i < 5; i += 1) await attempt(g.email, wrong());
  await setClock(at(16));
  expect(await signsIn(g.email, g.password), 'ROW-238: after the 15-minute wait the correct password signs in').toBe(true);
});
