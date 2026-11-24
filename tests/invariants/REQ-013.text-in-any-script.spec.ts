// Purpose: ledger tests for ROW-214 (REQ-013, REQ-008, REQ-020) — names and notes in any script or with emoji survive every save and display; the 200 limit counts characters (Unicode code points), tested with 200 characters outside the basic plane through the browser form; long unbroken names, emails or notes never widen a page beyond the screen.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals, rejections), fresh per run; the reject note's field is `note` on the reject act (harness confirmedActionRoutes' `extra`).
//
// Boundary (R6): the 200-character note goes through the browser form, as the row's case says (a textarea's
// maxlength counts UTF-16 units, so only the browser shows that fault); what is stored is read back at the HTTP
// harness; display and width are paint, proved in the browser. Readings: robustness.ts.
import { test, expect } from '@playwright/test';
import { actWithToken, approve, createMember, fresh, openPage, readEffect, sendRequest, signInMember, type Actor } from './harness';
import {
  bannerText,
  disposeAll,
  freshTeam,
  isRuleRefusal,
  keep,
  ownRequests,
  peopleText,
  PHONE,
  rejectThroughPage,
  settle,
  sidewaysOverflow,
  stringLeaves,
  textLines,
} from './robustness';

test.afterEach(disposeAll);

/** `n` fresh characters outside the basic plane (emoticons U+1F600..U+1F64F), no spaces: one unbroken run. */
function astral(n: number): string {
  return Array.from({ length: n }, () => String.fromCodePoint(0x1f600 + Math.floor(Math.random() * 80))).join('');
}

async function rejectWithNote(admin: Actor, requestId: string, note: string): Promise<number> {
  const effect = await readEffect(admin, 'reject', requestId);
  return (await actWithToken(admin, 'reject', requestId, effect.token, { note })).status();
}

async function textOf(browser: import('@playwright/test').Browser, actor: Actor, path: string, width?: { width: number; height: number }): Promise<{ text: string; banner: string | null; overflow: number }> {
  const opened = await openPage(browser, actor);
  try {
    if (width) await opened.page.setViewportSize(width);
    await opened.page.goto(path);
    await settle(opened.page);
    return { text: (await textLines(opened.page)).join('\n'), banner: await bannerText(opened.page), overflow: await sidewaysOverflow(opened.page) };
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-214 promise: the row — names and notes in any script or with emoji survive every save and display; the 200
// ROW-214   limit counts characters; long unbroken names, emails or notes never widen a page beyond the screen; its
// ROW-214   case: the limit counts Unicode code points, tested with 200 characters outside the basic plane through
// ROW-214   the browser form. REQ-008 (a rejection note of at most 200 characters), REQ-013/REQ-020 (names, emails).
// ROW-214 wrong product: a note field with maxlength=200 (UTF-16 units), so 200 emoji are cut to 100; a server
// ROW-214   that checks note.length (UTF-16), refusing 200 emoji as 400 "characters"; a column or a slugging step that
// ROW-214   mangles 李雷, Ω or a ZWJ emoji; a people table without word breaking, so a 48-letter name or email makes
// ROW-214   the page scroll sideways at 375px.
// ROW-214 given: member U named "李雷 Zoë Ωμέγα 👩🏽‍💻 <fresh>", member L named a fresh 48-letter unbroken word with a
// ROW-214   61-letter unbroken email; U has an approved day (10 Mar) and a request rejected with an Arabic+emoji note;
// ROW-214   L has an approved day, a pending one to reject, then two more pending. when: the admin rejects L's request
// ROW-214   through the pending page's form with a fresh note of 200 emoticons (each outside the basic plane), and
// ROW-214   through the reject act with 201 of them on another. then: U's name comes back exactly from /api/me, the
// ROW-214   people list and the calendar, and shows on the people page, the calendar and U's header; the Arabic note
// ROW-214   comes back exactly; the 200-emoticon note is stored whole (the request rejected) and shows on L's page; the
// ROW-214   201 one is refused and its request stays pending; at 375px no page holding L's name, email or the note
// ROW-214   scrolls sideways.
// ROW-214 controls: the control case rejects through the same form with a short ASCII note and reads it back — the
// ROW-214   form path works, so a failure of the 200 case is about counting.
// ROW-214 technique: the limit at exactly 200 and 201 code points (400 and 402 UTF-16 units) — the edge where code
// ROW-214   points and UTF-16 units disagree; fresh random emoji per run; exact equality on read-back (no partial match).
// ROW-214 cases: ROW-214 target=ROW-214.REQ-013.any-script-survives-200-code-points-count-and-long-text-fits control=ROW-214.control.a-short-note-through-the-form-is-stored
test('ROW-214.control.a-short-note-through-the-form-is-stored', async ({ browser }) => {
  const { admin } = await freshTeam();
  const x = await createMember(admin);
  const xa = keep(await signInMember(x));
  const id = String(await sendRequest(xa, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-15' }));
  const note = `ok ${fresh('n')}`;
  const opened = await openPage(browser, admin);
  try {
    await opened.page.goto('/admin/pending');
    await settle(opened.page);
    await rejectThroughPage(opened.page, x.name, note);
    await settle(opened.page);
  } finally {
    await opened.close();
  }
  await expect
    .poll(async () => stringLeaves((await ownRequests(xa)).find((r) => r.id === id)?.record ?? null).includes(note), { message: 'ROW-214 control: the note is stored', timeout: 10_000 })
    .toBe(true);
});

test('ROW-214.REQ-013.any-script-survives-200-code-points-count-and-long-text-fits', async ({ browser }) => {
  test.setTimeout(300_000);
  const { admin } = await freshTeam();
  const tag = fresh('u');
  const plain = tag.replace(/[^a-z0-9]/gi, '');
  const uName = `李雷 Zoë Ωμέγα 👩🏽‍💻 ${tag}`;
  const lName = `Wolfeschlegelsteinhausenbergerdorff${plain}`.slice(0, 48);
  const lEmail = `${'a'.repeat(48)}${plain}@example.test`.toLowerCase();
  const scriptNote = `مرحبا بالعالم 🌍 Ñandú ${tag}`;
  const note200 = astral(200);
  const note201 = astral(201);
  expect([...note200].length, 'ROW-214 setup: 200 code points').toBe(200);
  expect(note200.length, 'ROW-214 setup: 400 UTF-16 units').toBe(400);

  const u = await createMember(admin, { name: uName });
  const l = await createMember(admin, { name: lName, email: lEmail });
  const ua = keep(await signInMember(u));
  const la = keep(await signInMember(l));

  // Saves and read-backs over HTTP.
  expect.soft(ua.me.name, "ROW-214: U's name comes back exactly from /api/me").toBe(uName);
  const people = await peopleText(admin);
  const leaves = stringLeaves(JSON.parse(people));
  expect.soft(leaves.includes(uName), "ROW-214: U's name comes back exactly in the people list").toBe(true);
  expect.soft(leaves.includes(lName), "ROW-214: L's long name comes back exactly").toBe(true);
  expect.soft(leaves.includes(lEmail), "ROW-214: L's long email comes back exactly").toBe(true);
  await approve(admin, await sendRequest(ua, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  const cal = (await (await ua.api.get('/api/calendar?year=2027&month=3')).json()) as { days?: { date: string; people?: { name: string }[] }[] };
  expect.soft((cal.days ?? []).find((d) => d.date === '2027-03-10')?.people?.map((p) => p.name), "ROW-214: U's name comes back exactly on the calendar").toContain(uName);
  const uRejected = String(await sendRequest(ua, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-15' }));
  expect(await rejectWithNote(admin, uRejected, scriptNote), 'ROW-214 setup: the Arabic+emoji note is accepted').toBeLessThan(300);
  expect.soft(stringLeaves((await ownRequests(ua)).find((r) => r.id === uRejected)?.record ?? null), 'ROW-214: the Arabic+emoji note comes back exactly').toContain(scriptNote);

  // The 200 limit, through the browser form, with 200 characters outside the basic plane.
  const l1 = String(await sendRequest(la, { kind: 'vacation', firstDay: '2027-03-17', lastDay: '2027-03-18' }));
  await approve(admin, await sendRequest(la, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  const form = await openPage(browser, admin);
  try {
    await form.page.goto('/admin/pending');
    await settle(form.page);
    await rejectThroughPage(form.page, lName, note200);
    await settle(form.page);
  } finally {
    await form.close();
  }
  await expect
    .poll(async () => (await ownRequests(la)).find((r) => r.id === l1)?.state, { message: 'ROW-214: the 200-code-point note is accepted (the request is rejected)', timeout: 10_000 })
    .toBe('rejected');
  expect.soft(stringLeaves((await ownRequests(la)).find((r) => r.id === l1)?.record ?? null), 'ROW-214: the 200-code-point note is stored whole').toContain(note200);

  // 201 code points: refused, the request stays pending.
  await sendRequest(la, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  const l4 = String(await sendRequest(la, { kind: 'vacation', firstDay: '2027-03-24', lastDay: '2027-03-24' }));
  const status201 = await rejectWithNote(admin, l4, note201);
  expect.soft(isRuleRefusal(status201), `ROW-214: a 201-code-point note is refused (answered ${status201})`).toBe(true);
  expect.soft((await ownRequests(la)).find((r) => r.id === l4)?.state, 'ROW-214: after the refused note the request stays pending').toBe('pending');

  // Display.
  const peoplePage = await textOf(browser, admin, '/admin/people');
  expect.soft(peoplePage.text.includes(uName), "ROW-214 /admin/people: U's name shows exactly").toBe(true);
  expect.soft(peoplePage.text.includes(lEmail), "ROW-214 /admin/people: L's email shows exactly").toBe(true);
  const calendar = await textOf(browser, admin, '/calendar');
  expect.soft(calendar.text.includes(uName), "ROW-214 /calendar: U's name shows exactly").toBe(true);
  const uHome = await textOf(browser, ua, '/');
  expect.soft(uHome.banner ?? '', "ROW-214 U's header shows U's name exactly").toContain(uName);
  expect.soft(uHome.text.includes(scriptNote), "ROW-214 U's page shows the Arabic+emoji note exactly").toBe(true);
  const lHome = await textOf(browser, la, '/');
  expect.soft(lHome.text.includes(note200), "ROW-214 L's page shows the 200-code-point note whole").toBe(true);

  // Long unbroken text at phone width.
  for (const [actor, path] of [
    [admin, '/admin/people'],
    [admin, '/admin/pending'],
    [admin, `/admin/people/${encodeURIComponent(String(l.id))}`],
    [admin, '/calendar'],
    [la, '/'],
    [la, '/calendar'],
  ] as [Actor, string][]) {
    const seen = await textOf(browser, actor, path, PHONE);
    expect.soft(seen.overflow, `ROW-214 ${actor.kind} ${path} at 375px: long unbroken text does not widen the page`).toBeLessThanOrEqual(1);
  }
});
