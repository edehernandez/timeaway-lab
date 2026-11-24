// Purpose: ledger tests for ROW-224 and ROW-225 (INV-002, REQ-014) — stored text (names, notes) never runs as markup on any page, and the same text is shown literally.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, accounts, requests, approvals, a rejection with a note), fresh per run.
//
// Boundary (R6): whether a page runs stored text is browser behaviour, proved in the browser on every page that shows
// a name or a note, by each actor who sees it. The payloads carry a fresh number k, so a flag set, an element made or
// a dialog opened can only come from this run's stored text. Emails are not among the payloads: a valid address
// cannot hold a tag, so a product that refuses one is right; names and notes can, and must be kept as typed.
import { test, expect, type Browser } from '@playwright/test';
import { actWithToken, approve, createMember, openPage, readEffect, sendRequest, signInMember, type Actor, type Member } from './harness';
import { bannerText, disposeAll, freshInt, freshTeam, keep, ownRequests, peopleText, settle, stringLeaves, textLines } from './robustness';

test.afterEach(disposeAll);

interface World {
  admin: Actor;
  n1: Member;
  n2: Member;
  a1: Actor;
  a2: Actor;
  k: number;
  note: string;
  rejected: string;
}

async function world(): Promise<World> {
  const { admin } = await freshTeam();
  const k = freshInt(100000, 999999);
  const n1 = await createMember(admin, { name: `<img src=x onerror=window.__x${k}=1>` });
  const n2 = await createMember(admin, { name: `<i data-m${k}>Iv ${k}</i>` });
  const note = `<img src=x onerror=window.__n${k}=1><b data-n${k}>bold</b> ${k}`;
  const a1 = keep(await signInMember(n1));
  const a2 = keep(await signInMember(n2));
  await approve(admin, await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  await approve(admin, await sendRequest(a2, { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' }));
  const rejected = String(await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-15', lastDay: '2027-03-15' }));
  const effect = await readEffect(admin, 'reject', rejected);
  const res = await actWithToken(admin, 'reject', rejected, effect.token, { note });
  expect(res.status(), 'setup: the rejection with its note is accepted').toBeLessThan(300);
  await sendRequest(a1, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-22' });
  await sendRequest(a2, { kind: 'vacation', firstDay: '2027-03-23', lastDay: '2027-03-23' });
  return { admin, n1, n2, a1, a2, k, note, rejected };
}

function visits(w: World): [Actor, string][] {
  const person = (m: Member) => `/admin/people/${encodeURIComponent(String(m.id))}`;
  return [
    [w.admin, '/admin/pending'],
    [w.admin, '/admin/people'],
    [w.admin, person(w.n1)],
    [w.admin, person(w.n2)],
    [w.admin, '/calendar'],
    [w.admin, '/'],
    [w.a1, '/'],
    [w.a1, '/calendar'],
    [w.a1, '/requests/new'],
    [w.a1, '/password'],
    [w.a2, '/'],
    [w.a2, '/calendar'],
  ];
}

/** Loads a page and reports what the stored text did there: flags set, elements made, dialogs opened, its text. */
async function inspect(browser: Browser, actor: Actor, path: string, k: number) {
  const opened = await openPage(browser, actor);
  const dialogs: string[] = [];
  opened.page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss().catch(() => undefined);
  });
  try {
    const r = await opened.page.goto(path);
    await settle(opened.page);
    const ran = await opened.page.evaluate((n) => {
      const w = window as unknown as Record<string, unknown>;
      return {
        flags: [`__x${n}`, `__n${n}`].filter((f) => w[f] !== undefined),
        elements: [
          ...Array.from(document.querySelectorAll('img[src="x"]')).map(() => 'img[src=x]'),
          ...Array.from(document.querySelectorAll(`[data-m${n}], [data-n${n}]`)).map((e) => e.tagName.toLowerCase()),
        ],
      };
    }, k);
    return { status: r?.status(), ...ran, dialogs, text: (await textLines(opened.page)).join('\n'), banner: await bannerText(opened.page) };
  } finally {
    await opened.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// ROW-224 promise: the row — stored text (names, emails, notes) never runs as markup on any page; INV-002 (no data
// ROW-224   reaches another person's browser but what is meant for them — a script run from stored text reads all of
// ROW-224   it), REQ-014.
// ROW-224 wrong product: a page that renders a display name or a rejection note with v-html (or innerHTML), so a
// ROW-224   member named <img src=x onerror=…> runs script in the admin's browser on the pending, people and calendar
// ROW-224   pages; or one place (the header, a confirm summary) that does.
// ROW-224 given: member N1 named "<img src=x onerror=window.__x<k>=1>", member N2 named "<i data-m<k>>Iv <k></i>",
// ROW-224   both away 10 Mar 2027 (approved) with a pending request; N1 has a request rejected with the note
// ROW-224   "<img src=x onerror=window.__n<k>=1><b data-n<k>>bold</b> <k>". when: the admin opens the pending page, the
// ROW-224   people page, both persons' pages, the calendar and /; N1 opens /, /calendar, /requests/new, /password; N2
// ROW-224   opens / and /calendar. then: on every page no __x<k> or __n<k> flag is set, no img[src=x] and no element
// ROW-224   carrying data-m<k> or data-n<k> exists, and no dialog opened.
// ROW-224 controls: the control case reads the stored text back over HTTP exactly as typed (both names in the people
// ROW-224   list, the note on N1's request) — the payloads are stored and delivered, so their not running is the pages'.
// ROW-224 technique: payloads that leave a fresh, run-specific trace (a window flag, an attribute) if parsed as markup,
// ROW-224   checked on every page that shows them, by every actor who sees them.
// ROW-224 cases: ROW-224 target=ROW-224.INV-002.stored-names-and-notes-never-run-as-markup control=ROW-224.control.the-payloads-are-stored-exactly
test('ROW-224.control.the-payloads-are-stored-exactly', async () => {
  const w = await world();
  const leaves = stringLeaves(JSON.parse(await peopleText(w.admin)));
  expect.soft(leaves, "ROW-224 control: N1's name is stored as typed").toContain(w.n1.name);
  expect.soft(leaves, "ROW-224 control: N2's name is stored as typed").toContain(w.n2.name);
  const rec = (await ownRequests(w.a1)).find((r) => r.id === w.rejected);
  expect.soft(stringLeaves(rec?.record ?? null), 'ROW-224 control: the note is stored as typed').toContain(w.note);
});

test('ROW-224.INV-002.stored-names-and-notes-never-run-as-markup', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  for (const [actor, path] of visits(w)) {
    const seen = await inspect(browser, actor, path, w.k);
    const where = `${actor.kind} ${actor.me.id} ${path}`;
    expect.soft(seen.flags, `ROW-224 ${where}: no stored text ran as script`).toEqual([]);
    expect.soft(seen.elements, `ROW-224 ${where}: no stored text became an element`).toEqual([]);
    expect.soft(seen.dialogs, `ROW-224 ${where}: no dialog opened`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-225 promise: the row (control of ROW-224) — the same text is shown literally; INV-002, REQ-014.
// ROW-225 wrong product: a "fix" for ROW-224 that strips tags or angle brackets from names and notes (N2 shows as
// ROW-225   "Iv <k>"), or that double-escapes them so the page shows "&lt;i data-m…"; either way the person's text is
// ROW-225   not what they typed.
// ROW-225 given: the same world as ROW-224. when: the admin opens /calendar and /admin/people; N1 opens /. then: the
// ROW-225   calendar and the people page show both names character for character; N1's page shows the note character
// ROW-225   for character and N1's header shows N1's name so.
// ROW-225 controls: the control case shows every page of the walk answering 200 for its actor.
// ROW-225 technique: exact substring of the whole typed text (tags, quotes, equals signs), on the pages that show it.
// ROW-225 cases: ROW-225 target=ROW-225.INV-002.stored-text-is-shown-literally control=ROW-225.control.every-page-of-the-walk-answers
test('ROW-225.control.every-page-of-the-walk-answers', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await world();
  for (const [actor, path] of visits(w)) {
    expect.soft((await inspect(browser, actor, path, w.k)).status, `ROW-225 control: ${actor.kind} ${path} answers 200`).toBe(200);
  }
});

test('ROW-225.INV-002.stored-text-is-shown-literally', async ({ browser }) => {
  const w = await world();
  const cal = await inspect(browser, w.admin, '/calendar', w.k);
  expect.soft(cal.text, "ROW-225 /calendar: N1's name shown literally").toContain(w.n1.name);
  expect.soft(cal.text, "ROW-225 /calendar: N2's name shown literally").toContain(w.n2.name);
  const people = await inspect(browser, w.admin, '/admin/people', w.k);
  expect.soft(people.text, "ROW-225 /admin/people: N1's name shown literally").toContain(w.n1.name);
  expect.soft(people.text, "ROW-225 /admin/people: N2's name shown literally").toContain(w.n2.name);
  const own = await inspect(browser, w.a1, '/', w.k);
  expect.soft(own.text, "ROW-225 N1's /: the note shown literally").toContain(w.note);
  expect.soft(own.banner ?? '', "ROW-225 N1's header: N1's name shown literally").toContain(w.n1.name);
});
