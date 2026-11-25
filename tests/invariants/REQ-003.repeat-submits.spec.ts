// Purpose: ledger tests for ROW-208 and ROW-209 (REQ-003, REQ-009) — a double click, reload or Back after a submitted send form never repeats the send and never shows a refusal of the person's own first submit; one submit records exactly one request and shows its success.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-13); repaired by the test-author pass of slice 1 (brief test-author-6): every read after a press now waits for the press's answers instead of reading once. Fixture data made through the product's public routes by harness.ts (reset, accounts), fresh per run.
//
// Boundary (R6): double click, reload and Back are browser operations, proved in the browser on /requests/new; what
// was recorded is read at the HTTP harness (GET /api/requests, GET /api/balance). Form readings: robustness.ts.
// The overlap refusal's text is LEARNED at the end of ROW-208's case by deliberately sending the same days again, so
// "never shows a refusal of its own first submit" looks for the product's own refusal text, not a guess.
// Slice 1, brief test-author-11: ROW-208's second pair of cases added at the end — the send route's POSTs counted on the
// page itself, and every line the page draws watched as it is drawn (so a refusal erased by the move to / is seen);
// every earlier assertion kept.
//
// Readiness (why no read is one-shot): settle() waits on the page's load state, which a fetch made after the page
// loaded never changes, so it does not wait for a send. Each case therefore watches the writes the page itself starts
// (every request that is not GET/HEAD/OPTIONS, navigations included) and, before it reads the server or the page,
// waits (bounded) until each of those writes has had its answer and two frames have painted; where the press must
// draw words, it then polls the lines the press made appear until those words are there (as REQ-002's refusal reader
// does). A timeout in any wait is swallowed, so the row's own assertions, not the wait, decide the case.
import { test, expect, type Page, type Request } from '@playwright/test';
import { createMember, openPage, signInMember } from './harness';
import {
  disposeAll,
  fillSendForm,
  freshInt,
  freshTeam,
  keep,
  newLines,
  openSendForm,
  ownRequests,
  pendingDays,
  sendButton,
  settle,
  SUCCESS_WORDS,
  textLines,
  weekdaysBetween,
} from './robustness';

test.afterEach(disposeAll);

const REFUSAL_WORDS = /\b(refused|overlap|overlaps|overlapping|conflict|conflicts)\b/i;

/** A fresh range of 1..4 weekdays starting Mon 2027-03-15 (today is Mon 2027-03-08). */
function freshRange(): { kind: 'vacation'; firstDay: string; lastDay: string; days: number } {
  const days = freshInt(1, 4);
  const lastDay = ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18'][days - 1];
  return { kind: 'vacation', firstDay: '2027-03-15', lastDay, days: weekdaysBetween('2027-03-15', lastDay).length };
}

/** The writes a page starts (requests other than GET/HEAD/OPTIONS, navigations included), counted and held while open. */
interface Writes {
  started(): number;
  open(): number;
}

/** Starts watching the page's writes. Attach before the first press. */
function watchWrites(page: Page): Writes {
  const open = new Set<Request>();
  let started = 0;
  page.on('request', (r) => {
    if (!/^(GET|HEAD|OPTIONS)$/i.test(r.method())) {
      open.add(r);
      started += 1;
    }
  });
  page.on('requestfinished', (r) => open.delete(r));
  page.on('requestfailed', (r) => open.delete(r));
  return { started: () => started, open: () => open.size };
}

/** Two painted frames in the page (the draw that follows an answer); a navigation in between is not an error. */
async function frames(page: Page): Promise<void> {
  await page
    .evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    .catch(() => undefined);
}

/**
 * Waits (bounded) until at least `atLeast` writes have started since `mark` (a value of writes.started()) and no write
 * of the page is still waiting for its answer, then for two painted frames. Never fails: the caller's assertions decide.
 */
async function answered(page: Page, writes: Writes, mark: number, atLeast: number, timeoutMs = 10_000): Promise<void> {
  await expect
    .poll(() => writes.started() - mark >= atLeast && writes.open() === 0, { timeout: timeoutMs })
    .toBe(true)
    .catch(() => undefined);
  await frames(page);
}

/**
 * Polls (bounded) the lines that appeared since `before` until one of them satisfies `drawn`; answers the lines
 * appeared at the last read (whatever they are, when the wait times out).
 */
async function appearedUntil(page: Page, before: string[], drawn: (lines: string[]) => boolean, timeoutMs = 10_000): Promise<string[]> {
  let lines: string[] = [];
  await expect
    .poll(async () => drawn((lines = newLines(before, await textLines(page)))), { timeout: timeoutMs })
    .toBe(true)
    .catch(() => undefined);
  return lines;
}

// ---------------------------------------------------------------------------------------------------
// ROW-208 promise: the row — a double click, reload or Back after a submitted form never repeats the action and
// ROW-208   never shows a refusal of the user's own first submit; REQ-003 (a second request sharing a day would be
// ROW-208   refused — so a repeat shows as either a second request or that refusal), REQ-009.
// ROW-208 wrong product: a Send button that stays enabled while the post is in flight, so a double click posts twice
// ROW-208   (two requests, or the second refused "you already have a request on these days" over the first's
// ROW-208   success); or a form that posts as a page navigation, so a reload re-posts it.
// ROW-208 given: member M with no requests; a fresh range of N (1..4) weekdays from Mon 15 Mar 2027. when: M fills
// ROW-208   the form and double-clicks Send; then reloads the page; then goes Back. then: after each, once every write
// ROW-208   the page started has had its answer and the answer is drawn, M has exactly one request and N pending days,
// ROW-208   and no line of the product's own overlap refusal (learned last by sending the same days again from a fresh
// ROW-208   form) nor refusal wording appeared.
// ROW-208 controls: the control case clicks Send once and gets exactly one request — the form, days and session
// ROW-208   work; in the target the learned refusal must itself record nothing and must draw text, showing the overlap
// ROW-208   rule is on and its text is what a refused repeat would show.
// ROW-208 technique: before/after counts on the server around each browser operation, read only after the page's own
// ROW-208   writes are answered (a late second post, or a late refusal draw, is waited for rather than raced); the decoy
// ROW-208   is the product's own refusal text, learned, so a repeat refused by the server cannot hide behind unguessed
// ROW-208   wording.
// ROW-208 cases: ROW-208 target=ROW-208.REQ-003.double-click-reload-and-back-never-repeat-the-send control=ROW-208.control.one-click-records-one-request
test('ROW-208.control.one-click-records-one-request', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, m);
  try {
    await openSendForm(opened.page);
    await fillSendForm(opened.page, freshRange());
    await settle(opened.page);
    await expect.poll(async () => (await ownRequests(m)).length, { message: 'ROW-208 control: one click records one request', timeout: 10_000 }).toBe(1);
  } finally {
    await opened.close();
  }
});

test('ROW-208.REQ-003.double-click-reload-and-back-never-repeat-the-send', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  const page = opened.page;
  const writes = watchWrites(page);
  const seen: { step: string; lines: string[] }[] = [];
  try {
    await openSendForm(page);
    const form = await fillSendForm(page, range, { press: false });
    let before = await textLines(page);
    let mark = writes.started();
    await sendButton(form).click({ clickCount: 2 });
    await settle(page);
    // Every post the double click made has its answer, the first answer's words are drawn, and any write started
    // late (a second post) has its answer too — then the page and the server are read.
    await answered(page, writes, mark, 1);
    await appearedUntil(page, before, (lines) => lines.some((l) => SUCCESS_WORDS.test(l) || REFUSAL_WORDS.test(l)));
    await answered(page, writes, mark, 1);
    seen.push({ step: 'double click', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 double click: exactly one request recorded').toBe(1);
    expect.soft(await pendingDays(m, 2027), `ROW-208 double click: exactly ${range.days} days pending`).toBe(range.days);

    before = await textLines(page);
    mark = writes.started();
    await page.reload();
    await settle(page);
    await answered(page, writes, mark, 0);
    seen.push({ step: 'reload', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 reload: still exactly one request').toBe(1);

    before = await textLines(page);
    mark = writes.started();
    await page.goBack().catch(() => null);
    await settle(page);
    await answered(page, writes, mark, 0);
    seen.push({ step: 'back', lines: newLines(before, await textLines(page)) });
    expect.soft((await ownRequests(m)).length, 'ROW-208 back: still exactly one request').toBe(1);
    expect.soft(await pendingDays(m, 2027), `ROW-208: still exactly ${range.days} days pending`).toBe(range.days);

    // Learn the product's own overlap refusal: the same days sent again, deliberately, from a fresh form; read once
    // its post has its answer and the press has drawn text.
    await openSendForm(page);
    const again = await fillSendForm(page, range, { press: false });
    before = await textLines(page);
    mark = writes.started();
    await sendButton(again).click();
    await settle(page);
    await answered(page, writes, mark, 1);
    const refusal = await appearedUntil(page, before, (lines) => lines.length > 0);
    expect((await ownRequests(m)).length, 'ROW-208 setup: the deliberate repeat is refused (overlap rule on)').toBe(1);
    expect(refusal.length, 'ROW-208 setup: the deliberate repeat draws its refusal, so there is a text to look for').toBeGreaterThan(0);
    for (const s of seen) {
      expect.soft(s.lines.filter((l) => refusal.includes(l)), `ROW-208 ${s.step}: the product's overlap refusal does not appear (learned: ${JSON.stringify(refusal)})`).toEqual([]);
      expect.soft(s.lines.filter((l) => REFUSAL_WORDS.test(l)), `ROW-208 ${s.step}: no refusal wording appears`).toEqual([]);
    }
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-209 promise: the row (control of ROW-208) — one submit records exactly one action and shows its success;
// ROW-209   REQ-003, REQ-009.
// ROW-209 wrong product: a send that records the request but shows nothing (the person cannot tell it was sent and
// ROW-209   sends again); or one that shows success and records nothing, or records the wrong days.
// ROW-209 given: member M with no requests; a fresh range of N weekdays. when: M fills the form and clicks Send once.
// ROW-209   then: M has exactly one request, pending, with N pending days in 2027, and the press made text appear in
// ROW-209   plain success words (sent, saved, submitted, recorded, success) — waited for (bounded) after the send's
// ROW-209   answer, so a product that draws its success line when the answer arrives is read after it draws.
// ROW-209 controls: the control case opens the send form for M: the page and its form are there, so a target
// ROW-209   failure is the submit's.
// ROW-209 technique: before/after on the server count and the pending days (the exact N, fresh per run), and a
// ROW-209   bounded poll on the text the press made appear, read after the page's own post has its answer.
// ROW-209 cases: ROW-209 target=ROW-209.REQ-003.one-submit-records-one-request-and-shows-success control=ROW-209.control.the-send-form-opens-for-the-member
test('ROW-209.control.the-send-form-opens-for-the-member', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const opened = await openPage(browser, m);
  try {
    await openSendForm(opened.page);
    await expect(opened.page.getByLabel(/last day/i).first(), 'ROW-209 control: the form has its Last day field').toBeVisible();
  } finally {
    await opened.close();
  }
});

test('ROW-209.REQ-003.one-submit-records-one-request-and-shows-success', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  const writes = watchWrites(opened.page);
  try {
    await openSendForm(opened.page);
    const form = await fillSendForm(opened.page, range, { press: false });
    expect(await ownRequests(m), 'ROW-209 before: no request').toHaveLength(0);
    const before = await textLines(opened.page);
    const mark = writes.started();
    await sendButton(form).click();
    await settle(opened.page);
    await answered(opened.page, writes, mark, 1);
    await expect.poll(async () => (await ownRequests(m)).length, { message: 'ROW-209: exactly one request recorded', timeout: 10_000 }).toBe(1);
    expect.soft((await ownRequests(m))[0]?.state, 'ROW-209: it is pending').toBe('pending');
    expect.soft(await pendingDays(m, 2027), `ROW-209: exactly ${range.days} days pending`).toBe(range.days);
    const appeared = await appearedUntil(opened.page, before, (lines) => lines.some((l) => SUCCESS_WORDS.test(l)));
    expect.soft(appeared.some((l) => SUCCESS_WORDS.test(l)), `ROW-209: the page says the request was sent (appeared: ${JSON.stringify(appeared)})`).toBe(true);
  } finally {
    await opened.close();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-208 — the send route's POSTs counted and every drawn line watched (added, slice 1, brief test-author-11)
//
// Two instruments, both on the page from its first load (and on every document it loads after):
//   - watchSends counts the POSTs the page itself starts to the send route, POST /api/requests (D-029), and every
//     other write to a /api/requests… route, so a repeat is seen as a second post whatever the server then does
//     with it;
//   - watchDrawn is a MutationObserver installed by an init script that reports to the test the text of every node
//     the page inserts, every text it changes and every element whose class, style or hidden state changes — at the
//     moment it happens, so a refusal drawn and then erased by the move to / is still seen.
// ---------------------------------------------------------------------------------------------------

/** The page's writes to the request routes: POSTs to the send route exactly, and every non-GET to /api/requests…. */
interface Sends {
  posts(): number;
  writes(): number;
}

function watchSends(page: Page): Sends {
  let posts = 0;
  let writes = 0;
  page.on('request', (r) => {
    if (/^(GET|HEAD|OPTIONS)$/i.test(r.method())) return;
    let path = '';
    try {
      path = new URL(r.url()).pathname.replace(/\/+$/, '');
    } catch {
      return;
    }
    if (path === '/api/requests' || path.startsWith('/api/requests/')) writes += 1;
    if (path === '/api/requests' && r.method().toUpperCase() === 'POST') posts += 1;
  });
  return { posts: () => posts, writes: () => writes };
}

/** Every line the page drew, in the order drawn; `mark()` is a position, `since(m)` the lines drawn after it. */
interface Drawn {
  mark(): number;
  since(m: number): string[];
}

/** Installs the drawn-text watch on `page`. Call before the page's first navigation. */
async function watchDrawn(page: Page): Promise<Drawn> {
  const seen: string[] = [];
  await page.exposeFunction('__vidDrawn', (t: string) => {
    for (const l of String(t).split('\n')) {
      const s = l.trim();
      if (s !== '') seen.push(s);
    }
  });
  await page.addInitScript(() => {
    const report = (node: Node | null) => {
      const el = node === null ? null : node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
      if (!el) return;
      const t = (el as HTMLElement).innerText ?? el.textContent ?? '';
      if (t.trim() === '') return;
      try {
        void (window as unknown as { __vidDrawn?: (t: string) => unknown }).__vidDrawn?.(t.slice(0, 8000));
      } catch {
        /* the test reads what arrived */
      }
    };
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => report(n));
        else report(m.target);
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open'],
    });
  });
  return { mark: () => seen.length, since: (m) => seen.slice(m) };
}

/** The lines of `drawn` that show `refusal` (one of its lines, of 6 characters or more, inside a drawn line) or refusal wording. */
function refusalsIn(drawn: string[], refusal: string[], before: string[]): string[] {
  const known = new Set(before);
  const learned = refusal.filter((l) => l.length >= 6);
  return [...new Set(drawn.filter((l) => !known.has(l) && (REFUSAL_WORDS.test(l) || learned.some((r) => l.includes(r)))))];
}

// ROW-208 promise: the row — a double click, reload or Back after a submitted send-request form never repeats the send
// ROW-208   and never shows a refusal of the user's own first submit; REQ-003 (a second request sharing a day is refused,
// ROW-208   so a repeated send is either a second post refused as an overlap or a second request); D-029 (the send is
// ROW-208   POST /api/requests); D-037 (that refusal is a 409 with one plain message).
// ROW-208 wrong product: a Send button left enabled while its post is in flight, so a double click posts twice; the
// ROW-208   server refuses the second as an overlap (one request stays — REQ-003 makes that true anyway) and the page draws
// ROW-208   the refusal, then the first post's success moves it to / and the refusal is erased before anyone reads the
// ROW-208   page; or a form posted as a document, so a reload or Back re-posts it.
// ROW-208 given: member M with no requests; a fresh range of N (1..4) weekdays from Mon 15 Mar 2027; the send counter
// ROW-208   and the drawn-text watch on M's page from its first load. when: M fills the form and double-clicks Send; then
// ROW-208   reloads; then goes Back. then: the double click made exactly one POST to /api/requests and one write to the
// ROW-208   request routes, and the reload and Back none; and no line drawn at any moment from the double click to the end
// ROW-208   of Back — read from the watch, so before the move to / as well as after — shows the product's own overlap
// ROW-208   refusal (learned last, from a deliberate repeat) or refusal wording.
// ROW-208 controls: ROW-208.control.a-deliberate-repeat-posts-once-and-the-watch-sees-its-refusal — one press of Send
// ROW-208   on the same days again is one POST, is refused (still one request) and the refusal it draws is in the watch:
// ROW-208   the counter counts and the watch sees a drawn refusal, so a target that sees none means none was drawn.
// ROW-208 technique: before/after counts at the network boundary of the page itself (the post, not the record the server
// ROW-208   keeps), and a watch on the drawing rather than a read of the page at the end; the decoy is the product's own
// ROW-208   refusal text, learned.
// ROW-208 cases: ROW-208 target=ROW-208.REQ-003.double-click-posts-the-send-once-and-no-refusal-is-ever-drawn control=ROW-208.control.a-deliberate-repeat-posts-once-and-the-watch-sees-its-refusal

/** M's own request on `range` already sent (through the form, once), then a fresh form with the same days pressed once: what it posted and drew. */
async function deliberateRepeat(
  page: Page,
  m: Parameters<typeof ownRequests>[0],
  range: ReturnType<typeof freshRange>,
  writes: Writes,
  sends: Sends,
  drawn: Drawn,
): Promise<{ posts: number; requests: number; refusal: string[]; watched: string[]; before: string[] }> {
  await openSendForm(page);
  const again = await fillSendForm(page, range, { press: false });
  const before = await textLines(page);
  const mark = writes.started();
  const postMark = sends.posts();
  const drawMark = drawn.mark();
  await sendButton(again).click();
  await settle(page);
  await answered(page, writes, mark, 1);
  const refusal = await appearedUntil(page, before, (lines) => lines.length > 0);
  await frames(page);
  return { posts: sends.posts() - postMark, requests: (await ownRequests(m)).length, refusal, watched: drawn.since(drawMark), before };
}

test('ROW-208.control.a-deliberate-repeat-posts-once-and-the-watch-sees-its-refusal', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  const page = opened.page;
  const writes = watchWrites(page);
  const sends = watchSends(page);
  const drawn = await watchDrawn(page);
  try {
    await openSendForm(page);
    await fillSendForm(page, range);
    await settle(page);
    await expect.poll(async () => (await ownRequests(m)).length, { message: 'ROW-208 control: the first send records one request', timeout: 10_000 }).toBe(1);
    const r = await deliberateRepeat(page, m, range, writes, sends, drawn);
    expect.soft(r.posts, 'ROW-208 control: one press of Send is one POST to /api/requests').toBe(1);
    expect.soft(r.requests, 'ROW-208 control: the repeat is refused (still one request)').toBe(1);
    expect(r.refusal.length, 'ROW-208 control: the refusal is drawn').toBeGreaterThan(0);
    const missed = r.refusal.filter((l) => !r.watched.some((w) => w.includes(l)));
    expect.soft(missed, `ROW-208 control: every drawn refusal line is in the watch (watched: ${JSON.stringify(r.watched.slice(0, 40))})`).toEqual([]);
  } finally {
    await opened.close();
  }
});

test('ROW-208.REQ-003.double-click-posts-the-send-once-and-no-refusal-is-ever-drawn', async ({ browser }) => {
  const { admin } = await freshTeam();
  const m = keep(await signInMember(await createMember(admin)));
  const range = freshRange();
  const opened = await openPage(browser, m);
  const page = opened.page;
  const writes = watchWrites(page);
  const sends = watchSends(page);
  const drawn = await watchDrawn(page);
  try {
    await openSendForm(page);
    const form = await fillSendForm(page, range, { press: false });
    expect(await ownRequests(m), 'ROW-208 before: M has no request').toHaveLength(0);
    const formLines = await textLines(page);
    const drawFrom = drawn.mark();

    // The double click: exactly one post, read after every write the page started has had its answer and the move
    // that follows the answer has been drawn.
    let mark = writes.started();
    let postMark = sends.posts();
    let writeMark = sends.writes();
    await sendButton(form).click({ clickCount: 2 });
    await settle(page);
    await answered(page, writes, mark, 1);
    await appearedUntil(page, formLines, (lines) => lines.some((l) => SUCCESS_WORDS.test(l) || REFUSAL_WORDS.test(l)));
    await settle(page);
    await answered(page, writes, mark, 1);
    expect.soft(sends.posts() - postMark, 'ROW-208 double click: exactly one POST to /api/requests').toBe(1);
    expect.soft(sends.writes() - writeMark, 'ROW-208 double click: exactly one write to the request routes').toBe(1);

    mark = writes.started();
    postMark = sends.posts();
    writeMark = sends.writes();
    await page.reload();
    await settle(page);
    await answered(page, writes, mark, 0);
    expect.soft(sends.writes() - writeMark, 'ROW-208 reload: no write to the request routes').toBe(0);

    mark = writes.started();
    await page.goBack().catch(() => null);
    await settle(page);
    await answered(page, writes, mark, 0);
    expect.soft(sends.writes() - writeMark, 'ROW-208 reload and back: no write to the request routes').toBe(0);
    expect.soft(sends.posts() - postMark, 'ROW-208 reload and back: no POST to /api/requests').toBe(0);
    expect.soft((await ownRequests(m)).length, 'ROW-208: exactly one request recorded').toBe(1);
    await frames(page);
    const watched = drawn.since(drawFrom);

    // The product's own overlap refusal, learned from a deliberate repeat; it must itself be drawn and watched.
    const r = await deliberateRepeat(page, m, range, writes, sends, drawn);
    expect(r.requests, 'ROW-208 setup: the deliberate repeat is refused (overlap rule on)').toBe(1);
    expect(r.refusal.length, 'ROW-208 setup: the deliberate repeat draws its refusal, so there is a text to look for').toBeGreaterThan(0);
    expect
      .soft(refusalsIn(watched, r.refusal, formLines), `ROW-208: no line drawn from the double click to the end of Back shows a refusal (learned: ${JSON.stringify(r.refusal)})`)
      .toEqual([]);
  } finally {
    await opened.close();
  }
});
