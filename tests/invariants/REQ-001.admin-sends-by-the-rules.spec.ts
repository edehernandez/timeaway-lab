// Purpose: ledger tests for ROW-188 and ROW-189 (REQ-001, REQ-002, REQ-003, REQ-004) — the admin's own requests obey every sending rule (allowance, overlap, window, weekdays) exactly as anyone else's; a valid vacation within the admin's days left is stored pending.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12); fixture data made through the product's public routes by harness.ts (reset with the admin's allowance, send), fresh per run; the team clock fixed by the reset in Pacific/Auckland at an instant whose team date (Wed 2027-03-10) differs from UTC's (Tue 2027-03-09).
//
// ROW-188 promise: the sending rules hold for the admin as a person (A-006: "the admin is also a team member
// ROW-188   with an allowance"): REQ-001 fail-if (1) a kind other than vacation or sick, (3) a range with no Monday
// ROW-188   to Friday day, (4) last day before first; REQ-002 fail-if (1) a vacation over the allowance minus the
// ROW-188   approved and pending vacation days of its year; REQ-003 fail-if (1) two pending or approved requests
// ROW-188   sharing a day, whatever the kinds; REQ-004 fail-if (1) a vacation with a day before today, (4) a day
// ROW-188   after 31 December of next year, (5) a request crossing 31 December, (6) today read in the team zone.
// ROW-188 wrong product: the rule checks sit behind `if (!me.isAdmin)` (or the admin's sends take an "admin
// ROW-188   path" that skips them), so the admin overdraws, double-books, books the past or a weekend.
// ROW-188 given: admin allowance 5; team today Wed 2027-03-10. when: the admin sends, each on its own: a
// ROW-188   6-weekday vacation 2027-04-05..12; a vacation 2027-03-09..12 (03-09 is UTC's today, the team's
// ROW-188   yesterday); a vacation on 2029-01-08; a sick 2027-12-31..2028-01-03; a vacation on Sat-Sun
// ROW-188   2027-04-10..11; a vacation 2027-04-09..05; a "holiday" 2027-04-05; then, after a sick 2027-05-03..04
// ROW-188   and a 3-day vacation 2027-06-07..09 are sent, a vacation 2027-05-04 and a sick 2027-05-03 (overlap) and a
// ROW-188   3-day vacation 2027-06-14..16 (3 + 3 pending > 5). then: each is refused, and afterwards the admin's own
// ROW-188   list holds exactly the two requests sent as setup and 2027 shows 5 left with 3 pending.
// ROW-188 controls: ROW-189's case — the admin's sends within the rules are accepted — with its near misses
// ROW-188   (5 days at the allowance, a vacation starting on the team's today).
// ROW-188 technique: values just either side of each threshold (6 against 5 days; UTC's today against the
// ROW-188   team's), one case per rule, the stored list as the denominator after the refusals.
// ROW-188 cases: ROW-188 target=ROW-188.REQ-001.the-admins-own-requests-obey-every-sending-rule control=ROW-189.control.the-admin-sends-a-valid-vacation-stored-pending
//
// ROW-189 promise: control of ROW-188 — REQ-001 (the new request starts pending), REQ-002 fail-if (2) "a vacation
// ROW-189   request within that number is refused", REQ-004 (a vacation may start today).
// ROW-189 wrong product: a product that refuses every admin send, which would pass ROW-188 alone.
// ROW-189 given: admin allowance 5; team today Wed 2027-03-10. when: the admin sends a vacation on 2027-03-10
// ROW-189   (today in the team zone; UTC's date is 03-09) and a 4-day vacation 2027-04-05..08 (1 + 4 = 5, at the
// ROW-189   allowance with the pending one counted). then: both answer 201, both read pending in the admin's own
// ROW-189   list, and 2027 shows 5 left with 5 pending.
// ROW-189 controls: before the sends the admin's own list is empty.
// ROW-189 technique: boundary values — exactly the allowance, exactly today.
// ROW-189 cases: ROW-189 target=ROW-189.control.the-admin-sends-a-valid-vacation-stored-pending control=ROW-188.REQ-001.the-admins-own-requests-obey-every-sending-rule
import { test, expect } from '@playwright/test';
import { readBalance, resetProduct, sendRequest, signIn } from './harness';
import { readOwnRequests } from './request-records';

const NOW = '2027-03-09T20:00:00Z'; // Wed 2027-03-10 09:00 in Pacific/Auckland; Tue 2027-03-09 in UTC

test('ROW-188.REQ-001.the-admins-own-requests-obey-every-sending-rule', async () => {
  const install = await resetProduct({ now: NOW, admin: { allowance: 5 } });
  const admin = await signIn(install.admin);
  try {
    expect(await readOwnRequests(admin), 'ROW-188 before: the admin holds no request').toEqual([]);
    const refused = async (rule: string, data: Record<string, string>) => {
      const res = await admin.api.post('/api/requests', { data });
      expect.soft(res.ok(), `ROW-188 ${rule}: refused for the admin (answered ${res.status()})`).toBe(false);
    };

    await refused('allowance: 6 weekdays against 5 days left', { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-12' });
    await refused('window: a vacation day before the team\'s today (UTC\'s today)', { kind: 'vacation', firstDay: '2027-03-09', lastDay: '2027-03-12' });
    await refused('window: a day after 31 December of next year', { kind: 'vacation', firstDay: '2029-01-08', lastDay: '2029-01-08' });
    await refused('window: a range crossing 31 December', { kind: 'sick', firstDay: '2027-12-31', lastDay: '2028-01-03' });
    await refused('weekdays: a range with no Monday to Friday day', { kind: 'vacation', firstDay: '2027-04-10', lastDay: '2027-04-11' });
    await refused('weekdays: last day before first', { kind: 'vacation', firstDay: '2027-04-09', lastDay: '2027-04-05' });
    await refused('kind: neither vacation nor sick', { kind: 'holiday', firstDay: '2027-04-05', lastDay: '2027-04-05' });

    const sick = String(await sendRequest(admin, { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-04' }));
    const three = String(await sendRequest(admin, { kind: 'vacation', firstDay: '2027-06-07', lastDay: '2027-06-09' }));
    await refused('overlap: a vacation on a day of the admin\'s pending sick', { kind: 'vacation', firstDay: '2027-05-04', lastDay: '2027-05-04' });
    await refused('overlap: a sick on a day of the admin\'s pending sick', { kind: 'sick', firstDay: '2027-05-03', lastDay: '2027-05-03' });
    await refused('allowance: 3 days against 5 left with 3 pending', { kind: 'vacation', firstDay: '2027-06-14', lastDay: '2027-06-16' });

    const after = await readOwnRequests(admin);
    expect.soft(after.map((r) => r.id).sort(), 'ROW-188 after: the admin holds exactly the two setup requests').toEqual([sick, three].sort());
    const year = (await readBalance(admin)).years.find((y) => y.year === 2027);
    expect.soft([year?.daysLeft, year?.pending], 'ROW-188 after: 2027 shows 5 left and 3 pending').toEqual([5, 3]);
  } finally {
    await admin.dispose();
  }
});

test('ROW-189.control.the-admin-sends-a-valid-vacation-stored-pending', async () => {
  const install = await resetProduct({ now: NOW, admin: { allowance: 5 } });
  const admin = await signIn(install.admin);
  try {
    expect(await readOwnRequests(admin), 'ROW-189 before: the admin holds no request').toEqual([]);
    const today = await admin.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-03-10', lastDay: '2027-03-10' } });
    expect.soft(today.status(), 'ROW-189 a vacation on the team\'s today is accepted').toBe(201);
    const four = await admin.api.post('/api/requests', { data: { kind: 'vacation', firstDay: '2027-04-05', lastDay: '2027-04-08' } });
    expect.soft(four.status(), 'ROW-189 a 4-day vacation reaching the allowance exactly is accepted').toBe(201);

    const list = await readOwnRequests(admin);
    expect.soft(list.map((r) => [r.firstDay, r.state]).sort(), 'ROW-189 both read pending').toEqual([
      ['2027-03-10', 'pending'],
      ['2027-04-05', 'pending'],
    ]);
    const year = (await readBalance(admin)).years.find((y) => y.year === 2027);
    expect.soft([year?.daysLeft, year?.pending], 'ROW-189 2027 shows 5 left and 5 pending').toEqual([5, 5]);
  } finally {
    await admin.dispose();
  }
});
