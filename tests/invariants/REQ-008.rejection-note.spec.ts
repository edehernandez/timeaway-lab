// Purpose: ledger test for ROW-041 (REQ-008) — through the server route, a rejection note of 200 characters (non-ASCII included) is accepted and stored whole, a 201-character note is refused with the request left pending, and a rejection without a note is accepted.
// Provenance: hand-authored (test-author pass, slice 0, behavior batch 3); fixture data made through the product's public routes by harness.ts and lists.ts (reset, accounts, requests, the two-step reject), fresh names and notes per run.
//
// ROW-041 promise: REQ-008 "rejects it with an optional note of at most 200 characters"; fail-if (5) "a rejection note
// ROW-041   longer than 200 characters is accepted, or a rejection without a note is refused"; the row's case: through
// ROW-041   the server route, a 200-character note with non-ASCII characters is accepted and stored whole, and a
// ROW-041   201-character note is refused with the request left pending. Authority: REQ-008 arm 5, A-015 (an optional
// ROW-041   note of up to 200 characters, shown to the person and the admin).
// ROW-041 wrong product: the limit counted in UTF-8 bytes (a 200-character note with two-byte letters is refused, or
// ROW-041   cut); an off-by-one limit (< 200 accepted, or 201 accepted); a long note silently truncated to 200 and the
// ROW-041   reject accepted; a refused reject that still changes the request; the note required.
// ROW-041 given: a member's three pending requests; notes made of a fresh ASCII tag padded with two-byte and
// ROW-041   three-byte letters (é, ü, ñ, ø, ł, ж, δ, 中) to exactly 201 and exactly 200 UTF-16 code units, every one a
// ROW-041   single code point (no surrogate pairs, so every count of "characters" agrees). when: the admin posts the
// ROW-041   reject act on request 1 with the 201-character note, then with the 200-character note; rejects request 2 with
// ROW-041   no note. then: the 201 act is answered 4xx and request 1 is still pending on the person's list and on the
// ROW-041   pending list; the 200 act is answered 2xx and request 1 is rejected, its record carrying the 200-character
// ROW-041   note exactly; the act on request 2 is answered 2xx and request 2 is rejected.
// ROW-041 controls: a short ASCII note on request 3 is accepted and stored whole — the note's field reading (lists.ts:
// ROW-041   `note` in the act's body) and the read-back path work, untouched by a fault at the limit.
// ROW-041 technique: values just either side of the threshold (200, 201), multibyte so a byte count differs from the
// ROW-041   character count; before and after (pending before, still pending after the refusal, rejected after the 200);
// ROW-041   a fresh token read for every act, so a refusal is not a stale-token 409.
// ROW-041 cases: ROW-041 target=ROW-041.REQ-008.rejection-note-200-accepted-whole-201-refused-none-accepted control=ROW-041.control.short-note-rejection-stored-whole
import { test, expect } from '@playwright/test';
import { actWithToken, createMember, fresh, freshName, readEffect, setClock, signInMember, type AccountId, type Actor } from './harness';
import { freshInstall, hasString, idsOf, minutesAfter, readOwnRequests, readPending, recordOf, rejectWithNote, sendAt, show, statesOf } from './lists';

/** Tuesday 2027-03-02 09:00 in the team zone (Monday 20:00 UTC). */
const T0 = '2027-03-01T20:00:00Z';

const MULTIBYTE = ['é', 'ü', 'ñ', 'ø', 'ł', 'ж', 'δ', '中'];

/** A note of exactly `length` single-code-point characters: a fresh ASCII tag, then multibyte letters. */
function noteOf(length: number): string {
  let note = `${fresh('note')} `;
  for (let i = 0; note.length < length; i += 1) note += MULTIBYTE[i % MULTIBYTE.length];
  return note;
}

async function setup041() {
  const w = await freshInstall(T0, '2027-03-02');
  const member = await createMember(w.admin, { name: freshName('Yusuf') });
  const me = await signInMember(member);
  const r1 = await sendAt(me, { kind: 'vacation', firstDay: '2027-03-22', lastDay: '2027-03-23' }, minutesAfter(T0, 1));
  const r2 = await sendAt(me, { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-06' }, minutesAfter(T0, 2));
  const r3 = await sendAt(me, { kind: 'sick', firstDay: '2027-03-01', lastDay: '2027-03-01' }, minutesAfter(T0, 3));
  await setClock(minutesAfter(T0, 10));
  return { ...w, me, r1, r2, r3, close: async () => { await me.dispose(); await w.close(); } };
}

async function stateIn(me: Actor, id: AccountId) {
  const rec = recordOf(await readOwnRequests(me), id);
  return { rec, states: rec ? statesOf(rec) : new Set<string>() };
}

test('ROW-041.control.short-note-rejection-stored-whole', async () => {
  const s = await setup041();
  try {
    const note = `Short note ${fresh('ok')}`;
    const res = await rejectWithNote(s.admin, s.r3, note);
    expect(res.status(), `ROW-041 control: a short note is accepted: ${await res.text().catch(() => '')}`).toBeLessThan(300);
    const { rec, states } = await stateIn(s.me, s.r3);
    expect.soft(states.has('rejected'), `ROW-041 control: the request is rejected: ${show(rec)}`).toBe(true);
    expect.soft(!!rec && hasString(rec, note), `ROW-041 control: the short note is stored whole: ${show(rec)}`).toBe(true);
  } finally {
    await s.close();
  }
});

test('ROW-041.REQ-008.rejection-note-200-accepted-whole-201-refused-none-accepted', async () => {
  const s = await setup041();
  try {
    const note201 = noteOf(201);
    const note200 = noteOf(200);
    expect([note201.length, [...note201].length, note200.length, [...note200].length], 'ROW-041: the notes are 201 and 200 characters').toEqual([201, 201, 200, 200]);
    expect(new TextEncoder().encode(note200).length, 'ROW-041: the 200-character note is over 200 bytes').toBeGreaterThan(200);

    // Before: request 1 is pending.
    expect((await stateIn(s.me, s.r1)).states.has('pending'), 'ROW-041: request 1 is pending before (setup)').toBe(true);

    // 201 characters: refused, request left pending.
    const over = await rejectWithNote(s.admin, s.r1, note201);
    expect.soft(over.status() >= 400 && over.status() < 500, `ROW-041: a 201-character note is refused with a 4xx, got ${over.status()}`).toBe(true);
    const afterOver = await stateIn(s.me, s.r1);
    expect.soft(afterOver.states.has('pending') && !afterOver.states.has('rejected'), `ROW-041: after the refusal request 1 is still pending: ${show(afterOver.rec)}`).toBe(true);
    const pendingList = await readPending(s.admin);
    expect.soft(recordOf(pendingList, s.r1), `ROW-041: after the refusal request 1 is still on the pending list; ids ${idsOf(pendingList)}`).toBeDefined();

    // 200 characters: accepted and stored whole.
    const at = await rejectWithNote(s.admin, s.r1, note200);
    expect.soft(at.ok(), `ROW-041: a 200-character note is accepted, got ${at.status()}: ${(await at.text().catch(() => '')).slice(0, 200)}`).toBe(true);
    const afterAt = await stateIn(s.me, s.r1);
    expect.soft(afterAt.states.has('rejected'), `ROW-041: request 1 is rejected after the 200-character note: ${show(afterAt.rec)}`).toBe(true);
    expect.soft(!!afterAt.rec && hasString(afterAt.rec, note200), `ROW-041: the 200-character note is stored whole: ${show(afterAt.rec)}`).toBe(true);

    // No note: accepted.
    const effect = await readEffect(s.admin, 'reject', s.r2);
    const none = await actWithToken(s.admin, 'reject', s.r2, effect.token);
    expect.soft(none.ok(), `ROW-041: a rejection without a note is accepted, got ${none.status()}: ${(await none.text().catch(() => '')).slice(0, 200)}`).toBe(true);
    const afterNone = await stateIn(s.me, s.r2);
    expect.soft(afterNone.states.has('rejected'), `ROW-041: request 2 is rejected without a note: ${show(afterNone.rec)}`).toBe(true);
  } finally {
    await s.close();
  }
});
