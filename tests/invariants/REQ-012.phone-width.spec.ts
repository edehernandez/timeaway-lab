// Purpose: ledger tests for ROW-210 (REQ-012, REQ-008, REQ-020) — every page works at phone width (375 pixels): no sideways page scroll, every control reachable, and 30 names on one calendar day all readable.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); fixture data made through the product's public routes by harness.ts (reset, 29 accounts, requests, approvals), fresh per run.
//
// Boundary (R6): layout at a width is paint, proved in the browser (Chromium, 375×812). Measures (sideways overflow,
// reachable controls, readable names) are robustness.ts's, computed in the page on the rendered layout.
import { test, expect } from '@playwright/test';
import { approve, createMember, freshName, openPage, sendRequest, signInMember, type Actor } from './harness';
import {
  disposeAll,
  freshTeam,
  keep,
  pagesFor,
  PHONE,
  settle,
  sidewaysOverflow,
  unreachableControls,
  unreadableNames,
} from './robustness';

test.afterEach(disposeAll);

const AWAY = '2027-03-10'; // Wed, in the team's current month (today Mon 2027-03-08)
const LABELS = [
  'Aleksandra', 'Bo', 'Christopher-James', 'Dagmar', 'Eleanor', 'Fitzgerald', 'Gwendolyn', 'Hiroshi', 'Ingrid',
  'Jean-Baptiste', 'Kai', 'Leopoldina', 'Mateusz', 'Nkechi', 'Oluwaseun', 'Priyanka', 'Quentin', 'Rosalind',
  'Siobhan', 'Thanh', 'Ulrike', 'Valentina', 'Wilhelmina', 'Xiomara', 'Yevgenia', 'Zbigniew', 'Anneliese', 'Bartholomew',
  'Cosima',
];

interface World {
  admin: Actor;
  first: Actor;
  firstId: string;
  names: string[];
}

/** The admin and 29 members (30 switched on, the most allowed), all away on AWAY; the first member also has a pending request. */
async function thirtyAway(): Promise<World> {
  const { install, admin } = await freshTeam({ adminAllowance: 25 });
  const names = [install.admin.name];
  await approve(admin, await sendRequest(admin, { kind: 'vacation', firstDay: AWAY, lastDay: AWAY }));
  let first: Actor | undefined;
  let firstId = '';
  for (const label of LABELS) {
    const m = await createMember(admin, { name: freshName(label) });
    names.push(m.name);
    const actor = keep(await signInMember(m));
    await approve(admin, await sendRequest(actor, { kind: 'vacation', firstDay: AWAY, lastDay: AWAY }));
    if (!first) {
      first = actor;
      firstId = String(m.id);
      await sendRequest(actor, { kind: 'vacation', firstDay: '2027-03-17', lastDay: '2027-03-17' });
    }
  }
  return { admin, first: first as Actor, firstId, names };
}

// ---------------------------------------------------------------------------------------------------
// ROW-210 promise: the row — every page works at phone width (about 375 pixels) with no sideways page scroll, every
// ROW-210   control reachable, and 30 names on one calendar day all readable; REQ-012 (the calendar lists by name
// ROW-210   everyone away that day), REQ-008 (the pending page), REQ-020 (the people page), REQ-013 (at most 30 on).
// ROW-210 wrong product: a desktop table layout — the people page's six columns or the calendar's seven fixed-width
// ROW-210   columns push the page wider than 375px; a navigation bar whose last links sit off-screen; a day cell of
// ROW-210   fixed height with overflow hidden, so names after the third are cut off or drawn over each other.
// ROW-210 given: 30 switched-on accounts (the admin and 29 members with fresh names of 2 to 30 letters), all with an
// ROW-210   approved vacation on Wed 10 Mar 2027; the first member also has a pending day (so the pending and own
// ROW-210   pages have rows). when: each page is loaded at 375×812 by its actor — /sign-in anonymous; /, /requests/new,
// ROW-210   /calendar, /password as the member; those and /admin/pending, /admin/people, /admin/people/:id as the admin.
// ROW-210   then: each answers 200, the document is no wider than the viewport, every visible control lies within the
// ROW-210   screen and is the element hit at its centre; on /calendar all 30 names are painted whole, inside the screen,
// ROW-210   unclipped, at 10px type or more, none overlapping another (after a tap on the day, when the day must open).
// ROW-210 controls: the control case reads GET /api/calendar for March 2027: all 30 names on 10 March — the data the
// ROW-210   page must show is there — and the calendar page answers 200 at desktop width.
// ROW-210 technique: measured on the rendered layout (scroll width, hit testing, text-range boxes), with the row's
// ROW-210   own number (30, the switched-on limit) and names of very different lengths.
// ROW-210 cases: ROW-210 target=ROW-210.REQ-012.every-page-works-at-375px-and-30-names-are-readable control=ROW-210.control.thirty-are-away-on-the-day-and-the-calendar-answers
test('ROW-210.control.thirty-are-away-on-the-day-and-the-calendar-answers', async ({ browser }) => {
  test.setTimeout(300_000);
  const w = await thirtyAway();
  const res = await w.first.api.get('/api/calendar?year=2027&month=3');
  expect(res.status(), 'ROW-210 control: GET /api/calendar answers').toBe(200);
  const body = (await res.json()) as { days?: { date: string; people?: { name: string }[] }[] };
  const onDay = (body.days ?? []).find((d) => d.date === AWAY)?.people?.map((p) => p.name) ?? [];
  expect([...onDay].sort(), 'ROW-210 control: all 30 names are on 10 March').toEqual([...w.names].sort());
  const opened = await openPage(browser, w.first);
  try {
    const r = await opened.page.goto('/calendar');
    expect(r?.status(), 'ROW-210 control: /calendar answers 200').toBe(200);
  } finally {
    await opened.close();
  }
});

test('ROW-210.REQ-012.every-page-works-at-375px-and-30-names-are-readable', async ({ browser }) => {
  test.setTimeout(420_000);
  const w = await thirtyAway();
  const visits: [Actor | 'anonymous', string][] = [
    ...pagesFor('anonymous').map((p) => ['anonymous', p] as [Actor | 'anonymous', string]),
    ...pagesFor('member').map((p) => [w.first, p] as [Actor | 'anonymous', string]),
    ...pagesFor('admin', w.firstId).map((p) => [w.admin, p] as [Actor | 'anonymous', string]),
  ];
  for (const [actor, path] of visits) {
    const who = actor === 'anonymous' ? 'anonymous' : actor.kind;
    const opened = await openPage(browser, actor);
    try {
      await opened.page.setViewportSize(PHONE);
      const r = await opened.page.goto(path);
      await settle(opened.page);
      expect.soft(r?.status(), `ROW-210 ${who} ${path}: answers 200`).toBe(200);
      const over = await sidewaysOverflow(opened.page);
      expect.soft(over, `ROW-210 ${who} ${path}: no sideways page scroll at 375px (document ${over}px too wide)`).toBeLessThanOrEqual(1);
      expect.soft(await unreachableControls(opened.page), `ROW-210 ${who} ${path}: every control reachable at 375px`).toEqual([]);
      if (path === '/calendar') {
        let bad = await unreadableNames(opened.page, w.names);
        if (bad.some((b) => b.endsWith('not shown in one text run'))) {
          const day = opened.page.locator(`[data-date="${AWAY}"], time[datetime="${AWAY}"]`).first();
          if ((await day.count()) > 0) {
            await day.click().catch(() => undefined);
            await settle(opened.page);
            bad = await unreadableNames(opened.page, w.names);
          }
        }
        expect.soft(bad, `ROW-210 ${who} /calendar: all 30 names on 10 March readable at 375px`).toEqual([]);
      }
    } finally {
      await opened.close();
    }
  }
});
