// Purpose: ledger tests for ROW-247 (REQ-004, CON-003) — the test clock override is honoured only in the test profile: a production start with the override set refuses to start.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-16); the production start through the D-048 production-start door (doors-process.ts), the team made through harness.ts and team-calendar.ts, fresh per run; instants worked out by the tests' own Intl oracle.
//
// Boundary (R6): a process start — the built server's own start in its production profile, its exit and output read
// through the production-start door; the test profile's honouring of the override read at the HTTP harness
// (POST /api/__test/clock, GET /api/today).
//
// ROW-247 promise: BASELINE "Test environment" and DIF-001 "the injected instant … honoured only in the test profile; a
// ROW-247   production start with the override set refuses to start"; docker-compose.test.yml "TIMEAWAY_TEST_CONTROL with
// ROW-247   VID_TEST enables the test-only control routes (the clock and the reset) … the product refuses to start with
// ROW-247   it set outside the test"; REQ-004 "today is decided in the team's one time zone" (fail-if 6) and CON-003 — a
// ROW-247   production team whose today could be set from outside would be decided by something other than its clock.
// ROW-247 wrong product: one whose production start, with TIMEAWAY_TEST_CONTROL set, starts and serves (merely
// ROW-247   ignoring the override, or honouring it); one that checks only VID_TEST and so never looks at the override.
// ROW-247 given: the production profile (VID_TEST unset), first with no override, then with TIMEAWAY_TEST_CONTROL=1.
// ROW-247   when: each is started through the production-start door. then: the start with the override ends by itself
// ROW-247   with a non-zero exit; the start without it is still running at the door's bound (it started).
// ROW-247 controls: the control case — the production start without the override is still running (so a refusal is
// ROW-247   the override's, not a production start that cannot start at all), and in the test profile the override is
// ROW-247   honoured (the clock set where the Auckland and UTC dates differ moves today to the Auckland date of that
// ROW-247   instant), so the override the target sets is a real one.
// ROW-247 technique: the same start with exactly one knob different (the override absent / set), before and after.
// ROW-247 cases: ROW-247 target=ROW-247.REQ-004.production-start-with-the-clock-override-refuses control=ROW-247.control.production-start-without-the-override-starts
import { test, expect } from '@playwright/test';
import { productionStart } from './doors-process';
import { AUCKLAND, disposeAll, setTeamClock, startTeam, teamDateOf, teamInstant, utcDateOf } from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

test('ROW-247.control.production-start-without-the-override-starts', async () => {
  const start = await productionStart({});
  expect(start.exit, `ROW-247 control: the production start without the override is still running at the door's bound (output: ${start.output.slice(-400)})`).toBeNull();

  const team = await startTeam({ zone: AUCKLAND, now: teamInstant(AUCKLAND, '2027-06-01', '09:00') });
  const instant = await setTeamClock(AUCKLAND, '2027-09-14', '08:30');
  const auckland = teamDateOf(AUCKLAND, instant);
  expect(utcDateOf(instant), 'ROW-247 control: the UTC date differs from the Auckland date at this instant').not.toBe(auckland);
  const res = await team.admin.api.get('/api/today');
  const body = (await res.json().catch(() => null)) as { today?: unknown } | null;
  expect({ status: res.status(), today: body?.today }, 'ROW-247 control: in the test profile the override is honoured').toEqual({
    status: 200,
    today: auckland,
  });
});

test('ROW-247.REQ-004.production-start-with-the-clock-override-refuses', async () => {
  const start = await productionStart({ TIMEAWAY_TEST_CONTROL: '1' });
  expect(start.exit, `ROW-247: the production start with the override set ends by itself (output: ${start.output.slice(-400)})`).not.toBeNull();
  expect(start.exit, `ROW-247: and refuses, with a non-zero exit (output: ${start.output.slice(-400)})`).not.toBe(0);
});
