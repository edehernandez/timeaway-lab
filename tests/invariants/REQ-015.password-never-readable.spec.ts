// Purpose: ledger tests for ROW-231 (REQ-015, REQ-023) — a password is never readable: absent from every response and every change record the product sends (the stored-readable and log-line clauses are owed to a harness door, see below).
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, password set and changes, sign-in), fresh per run.
//
// Boundary (R6): what a response carries is HTTP behaviour, proved at the HTTP harness on every route that touches an
// account, and in the browser on the pages that show accounts (every response the page receives, and its document).
// What this file cannot observe: the stored record and the server's log lines — the harness reaches the product only
// over HTTP (harness rule 1) and has no door to the product's log stream or database; those clauses are returned
// unwritable by this pass, owed to that door.
import { test, expect, type APIResponse } from '@playwright/test';
import { anonymousApi, createMember, fresh, freshEmail, freshName, openPage, signIn, type Actor } from './harness';
import { disposeAll, freshTeam, keep } from './robustness';

test.afterEach(disposeAll);

/** The forms a password could be sent in: as typed, base64, hex, URL-encoded, JSON-escaped. */
function forms(pw: string): string[] {
  const buf = Buffer.from(pw, 'utf8');
  return [pw, buf.toString('base64'), buf.toString('base64url'), buf.toString('hex'), encodeURIComponent(pw), JSON.stringify(pw).slice(1, -1)];
}

const SECRET_KEY = /"(?:password|passwordHash|password_hash|passwordDigest|hash|salt|pw|pwd)"\s*:\s*"/i;

interface Seen {
  where: string;
  text: string;
}

async function seen(where: string, res: APIResponse): Promise<Seen> {
  const headers = res.headersArray().map((h) => `${h.name}: ${h.value}`).join('\n');
  return { where, text: `${headers}\n\n${await res.text().catch(() => '')}` };
}

// ---------------------------------------------------------------------------------------------------
// ROW-231 promise: the row — a password is never readable: not stored readable, and absent from every response, log
// ROW-231   line and change record; REQ-015 (the admin sets, a person changes), REQ-023 (an account holds its
// ROW-231   password), D-004 (stored as a scrypt hash). This file pays the response and change-record clauses.
// ROW-231 wrong product: a create or set route that echoes its body back ({name, email, password, …}); a people list
// ROW-231   or a person's page that serialises the whole account row (hash and salt with it); a change history that
// ROW-231   records "password: old → new"; a sign-in answer that returns the account it matched.
// ROW-231 given: a fresh install. when: the admin creates member M with P1; M signs in with P1 and changes to P2; the
// ROW-231   admin sets P3; M signs in with P3 and changes to P4; every account route is then read by the admin and by
// ROW-231   M, the pages that show accounts are fetched, and the people pages are opened in the admin's browser. then:
// ROW-231   none of P1..P4 — as typed, base64, hex, URL-encoded or JSON-escaped — is in any status line's headers or
// ROW-231   body, in the change history, in any response the browser received or in its documents; no JSON answer
// ROW-231   carries a password, hash or salt field.
// ROW-231 controls: the control case shows the reads answer 200 with bodies that name M (the people list, the
// ROW-231   history route, M's own /api/me) — the responses searched are the ones that describe the account.
// ROW-231 technique: fresh passwords with non-ASCII characters (so a lossy encoding cannot hide them), searched in
// ROW-231   every encoding a careless serialiser uses, across every route and page that touches the account.
// ROW-231 cases: ROW-231 target=ROW-231.REQ-015.no-response-or-change-record-carries-a-password control=ROW-231.control.the-account-reads-describe-the-member
async function walk(): Promise<{ admin: Actor; id: string; name: string; email: string; passwords: string[]; bodies: Seen[] }> {
  const { admin } = await freshTeam();
  const passwords = [1, 2, 3, 4].map((n) => `Pw${n}-${fresh('s')}-Ƶ€`);
  const [p1, p2, p3, p4] = passwords;
  const name = freshName('Secret');
  const email = freshEmail('secret');
  const bodies: Seen[] = [];
  const created = await admin.api.post('/api/admin/accounts', { data: { name, email, password: p1, allowance: 20 } });
  bodies.push(await seen('POST /api/admin/accounts', created));
  expect(created.status(), 'ROW-231 setup: the account is created').toBeLessThan(300);
  const id = String(((await created.json()) as { id: unknown }).id);

  const anon = await anonymousApi();
  try {
    bodies.push(await seen('POST /api/auth/sign-in (P1)', await anon.post('/api/auth/sign-in', { data: { email, password: p1 } })));
    bodies.push(await seen('POST /api/me/password (P1→P2)', await anon.post('/api/me/password', { data: { current: p1, next: p2 } })));
  } finally {
    await anon.dispose();
  }
  bodies.push(await seen('POST /api/admin/accounts/:id/password (P3)', await admin.api.post(`/api/admin/accounts/${encodeURIComponent(id)}/password`, { data: { password: p3 } })));
  const m = keep(await signIn({ email, password: p3 }));
  bodies.push(await seen('POST /api/me/password (P3→P4)', await m.api.post('/api/me/password', { data: { current: p3, next: p4 } })));
  const again = await anonymousApi();
  try {
    bodies.push(await seen('POST /api/auth/sign-in (P4)', await again.post('/api/auth/sign-in', { data: { email, password: p4 } })));
    for (const path of ['/api/me', '/api/requests', '/api/balance', '/', '/password']) bodies.push(await seen(`member GET ${path}`, await again.get(path)));
  } finally {
    await again.dispose();
  }
  for (const path of ['/api/me', '/api/admin/people', `/api/admin/people/${encodeURIComponent(id)}/requests`, `/api/admin/people/${encodeURIComponent(id)}/history`, '/admin/people', `/admin/people/${encodeURIComponent(id)}`]) {
    bodies.push(await seen(`admin GET ${path}`, await admin.api.get(path)));
  }
  return { admin, id, name, email, passwords, bodies };
}

test('ROW-231.control.the-account-reads-describe-the-member', async () => {
  const w = await walk();
  const people = w.bodies.find((b) => b.where === 'admin GET /api/admin/people');
  expect.soft(people?.text ?? '', 'ROW-231 control: the people list names M').toContain(w.name);
  const history = await w.admin.api.get(`/api/admin/people/${encodeURIComponent(w.id)}/history`);
  expect.soft(history.status(), "ROW-231 control: M's change history answers").toBe(200);
  const me = w.bodies.find((b) => b.where === 'member GET /api/me');
  expect.soft(me?.text ?? '', "ROW-231 control: M's own /api/me names M").toContain(w.name);
});

test('ROW-231.REQ-015.no-response-or-change-record-carries-a-password', async ({ browser }) => {
  const w = await walk();
  const opened = await openPage(browser, w.admin);
  const received: Promise<Seen>[] = [];
  opened.page.on('response', (r) => {
    received.push(
      r
        .text()
        .then((t) => ({ where: `browser ${r.request().method()} ${new URL(r.url()).pathname}`, text: t }))
        .catch(() => ({ where: 'browser (no body)', text: '' })),
    );
  });
  try {
    for (const path of ['/admin/people', `/admin/people/${encodeURIComponent(w.id)}`]) {
      await opened.page.goto(path);
      await opened.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      w.bodies.push({ where: `browser document ${path}`, text: await opened.page.content() });
    }
  } finally {
    await opened.close();
  }
  w.bodies.push(...(await Promise.all(received)));

  for (const b of w.bodies) {
    for (const [i, pw] of w.passwords.entries()) {
      const hit = forms(pw).find((f) => b.text.includes(f));
      expect.soft(hit ?? null, `ROW-231 ${b.where}: carries no form of P${i + 1}`).toBeNull();
    }
    expect.soft(SECRET_KEY.exec(b.text)?.[0] ?? null, `ROW-231 ${b.where}: no password, hash or salt field`).toBeNull();
  }
});
