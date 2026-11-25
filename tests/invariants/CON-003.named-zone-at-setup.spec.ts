// Purpose: ledger tests for ROW-136 (CON-003, REQ-004) — setup cannot finish without an explicitly chosen named time zone (never a fixed offset or a silent default; every fixed-offset name refused by name, a geographic zone without daylight saving accepted, A-054), shows the chosen zone afterwards, and a runtime without time-zone data refuses to start.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-16; the A-054 cases added by batch test-author-26); the setup command run through the D-048 setup door and the restart and logs doors (doors-process.ts), the team made through harness.ts and team-calendar.ts, fresh per run; instants worked out by the tests' own Intl oracle.
//
// Boundary (R6): a machine command and a process start — the setup command's own entry point (its arguments, exit
// and output, through the setup door) and the server's own start (the restart door's start without time-zone data,
// its output through the logs door); the team's today read at the HTTP harness (GET /api/today, D-044).
//
// ROW-136 promise: CON-003 "the team has one time zone, set when the product is set up, that decides what today is and
// ROW-136   every date" (A-019); D-013 "chosen once at setup as a named zone"; D-011 the setup command; REQ-004 "today is
// ROW-136   decided in the team's one time zone" (fail-if 6). The row: setup cannot finish without an explicitly chosen
// ROW-136   named zone, never a fixed offset or a silent default; the chosen zone is shown to the admin afterwards; a
// ROW-136   runtime without time-zone data refuses to start.
// ROW-136 wrong product: a setup command that, given no zone, takes the machine's zone or UTC and finishes; one that
// ROW-136   validates the zone with a lenient parser that accepts "+05:30" or "UTC+2" as a zone (Intl takes offsets);
// ROW-136   one that accepts any string ("Mars/Olympus") and fails later; one that prints a hard-coded or default zone
// ROW-136   rather than the one chosen; a server that, with no time-zone data, starts anyway and works out today in UTC
// ROW-136   (or answers errors), so every today decision is silently wrong.
// ROW-136 given: a fresh database each run; a named zone drawn per run from zones far from the default and from UTC;
// ROW-136   fresh admin values. when: setup with every argument and that zone; then setup with the zone left out, empty,
// ROW-136   given as fixed offsets, and given as an unknown name. then: the first finishes (exit 0) and its output names
// ROW-136   the chosen zone; each of the others ends with a non-zero exit.
// ROW-136 given (start): an Auckland team with the clock at 10:00 Auckland (the UTC date the day before). when: the
// ROW-136   restart door starts the server once without time-zone data. then: that start refuses — its output says so,
// ROW-136   naming the time zone — and the server that serves afterwards answers today as the Auckland date, never the UTC
// ROW-136   date and never an error.
// ROW-136 controls: the control case (setup with every argument and a named zone finishes and names it) shows the
// ROW-136   arguments are the command's, so each refusal in the target is the zone's and not a malformed call; the target
// ROW-136   re-runs that finish first as its own precondition (SETUP when it fails). In the start case, today is read
// ROW-136   before the restart too.
// ROW-136 technique: a named example plus its near misses (offset spellings, empty, unknown) either side of "a named
// ROW-136   zone"; fresh zone per run so a hard-coded print cannot match; the clock set where the team and UTC dates differ.
// ROW-136 cases: ROW-136 target=ROW-136.CON-003.setup-refuses-without-a-named-zone control=ROW-136.control.setup-with-a-named-zone-finishes-and-shows-it
import { test, expect } from '@playwright/test';
import { DEFAULT_TIME_ZONE, freshEmail, freshName, freshPassword, signIn, type Actor } from './harness';
import { logMark, readLogs, restartProduct, runSetup, setupArgs, type SetupSpec } from './doors-process';
import { AUCKLAND, disposeAll, setTeamClock, startTeam, teamDateOf, teamInstant, utcDateOf } from './team-calendar';

test.afterEach(async () => {
  await disposeAll();
});

const NAMED_ZONES = ['America/St_Johns', 'Asia/Kathmandu', 'Australia/Adelaide', 'America/Halifax', 'Asia/Kolkata', 'Europe/Lisbon'];

function chosenZone(): string {
  const zones = NAMED_ZONES.filter((z) => z !== DEFAULT_TIME_ZONE);
  return zones[Math.floor(Math.random() * zones.length)];
}

function freshSpec(timeZone?: string): SetupSpec {
  return { name: freshName('Admin'), email: freshEmail('setup'), password: freshPassword(), allowance: 23, timeZone };
}

test('ROW-136.control.setup-with-a-named-zone-finishes-and-shows-it', async () => {
  const zone = chosenZone();
  const run = await runSetup(setupArgs(freshSpec(zone)), 'fresh');
  expect(run.exit, `ROW-136 control: setup with every argument and ${zone} finishes (stderr: ${run.stderr.slice(0, 300)})`).toBe(0);
  expect(run.stdout, `ROW-136 control: the output shown to the admin names the chosen zone ${zone}`).toContain(zone);
});

test('ROW-136.CON-003.setup-refuses-without-a-named-zone', async () => {
  const zone = chosenZone();
  const pre = await runSetup(setupArgs(freshSpec(zone)), 'fresh');
  if (pre.exit !== 0) {
    throw new Error(`SETUP: the setup command did not finish with every argument and ${zone} (exit ${pre.exit}): ${pre.stderr.slice(0, 300)}`);
  }

  const withZone = (tz: string | undefined) => setupArgs(freshSpec(tz));
  const blankFlag = [...setupArgs(freshSpec(undefined)), '--time-zone'];
  const cases: [string, string[]][] = [
    ['no zone at all (a silent default)', withZone(undefined)],
    ['the zone flag with no value', blankFlag],
    ['an empty zone', withZone('')],
    ['the fixed offset +05:30', withZone('+05:30')],
    ['the fixed offset -08:00', withZone('-08:00')],
    ['the fixed offset UTC+2', withZone('UTC+2')],
    ['the fixed offset GMT-3', withZone('GMT-3')],
    ['an unknown zone name', withZone('Mars/Olympus_Mons')],
  ];
  for (const [label, args] of cases) {
    const run = await runSetup(args, 'fresh');
    expect.soft(run.exit, `ROW-136 setup with ${label} does not finish (stdout: ${run.stdout.slice(0, 200)})`).not.toBe(0);
    expect.soft(run.exit, `ROW-136 setup with ${label} ends with an exit code`).not.toBeNull();
  }
});

test('ROW-136.CON-003.runtime-without-tz-data-refuses-to-start', async () => {
  const instant = teamInstant(AUCKLAND, '2027-03-02', '10:00');
  const team = await startTeam({ zone: AUCKLAND, now: instant });
  const auckland = teamDateOf(AUCKLAND, instant);
  expect(utcDateOf(instant), 'ROW-136 setup: the UTC date differs from the Auckland date at this instant').not.toBe(auckland);

  const today = async (actor: Actor) => {
    const res = await actor.api.get('/api/today');
    const body = (await res.json().catch(() => null)) as { today?: unknown } | null;
    return { status: res.status(), today: body?.today };
  };
  expect(await today(team.admin), 'ROW-136 before: today is the Auckland date').toEqual({ status: 200, today: auckland });

  const mark = await logMark();
  let admin: Actor | null = null;
  try {
    await restartProduct({ withoutTzData: true });
    const { lines } = await readLogs(mark);
    const refusal = lines.filter((l) => /time.?zone/i.test(l) && /refus|cannot|can't|unable|not start|missing|unavailable|without/i.test(l));
    expect.soft(refusal.length, `ROW-136: the start without time-zone data refused, naming the time zone (output since the restart: ${JSON.stringify(lines.slice(-20))})`).toBeGreaterThan(0);

    await setTeamClock(AUCKLAND, '2027-03-02', '10:00');
    admin = await signIn(team.install.admin);
    expect(await today(admin), 'ROW-136 after: the server that serves works out today as the Auckland date').toEqual({ status: 200, today: auckland });
  } finally {
    await admin?.dispose();
    await restartProduct();
  }
});

// ---------------------------------------------------------------------------------------------------
// ROW-136 (amended, A-054) promise: the row as amended — setup refuses by name every fixed-offset zone spelling: an
// ROW-136   offset spelling (GMT+0 and GMT-0 included), the Etc/ zones, the UTC and GMT aliases UTC, UCT, GMT, GMT0,
// ROW-136   Greenwich, Universal and Zulu, and the legacy fixed names EST, MST and HST; and it accepts a named geographic
// ROW-136   zone whether or not it observes daylight saving, America/Guatemala and America/Costa_Rica included (A-054:
// ROW-136   "the team's zone is UTC-6 in Central America, entered by its named zone"); CON-003, D-013.
// ROW-136 wrong product: (a) a check that asks Intl whether the zone exists — Intl takes "Etc/GMT+6", "UTC", "Zulu",
// ROW-136   "GMT0" and "EST" (in current zone data EST is a link to America/Panama), so each finishes setup as if named;
// ROW-136   (b) a deny list compared exactly, so "utc" or "etc/gmt+6" (which Intl takes, case-insensitively) slips past;
// ROW-136   (c) a behavioural fixed-offset test ("refuse a zone whose offset never changes in the year"), which refuses
// ROW-136   the owner's own America/Guatemala and America/Costa_Rica (F-139).
// ROW-136 given: a fresh database per run and fresh admin values per call. when: setup with each fixed-offset
// ROW-136   spelling (the row's list, UTC-6's own offset spellings, and lower-case forms of two names); then setup with
// ROW-136   America/Guatemala and with America/Costa_Rica. then: every fixed spelling ends with a non-zero exit; each
// ROW-136   Central American zone finishes (exit 0) and its output names that zone.
// ROW-136 controls: ROW-136.control.setup-with-a-daylight-saving-zone-finishes — setup with America/Chicago (UTC-6 in
// ROW-136   winter, with daylight saving) finishes and names it, so the arguments are the command's and a refusal in a
// ROW-136   target is the zone's; the refusal case re-runs that finish as its own precondition (SETUP when it fails).
// ROW-136 technique: near misses either side of the line — Etc/GMT+6, GMT-6 and UTC-06:00 (the team's offset by a
// ROW-136   fixed name) against America/Guatemala and America/Costa_Rica (the team's offset by a geographic name), and
// ROW-136   America/Chicago (the same offset with daylight saving) as the control.
// ROW-136 cases: ROW-136 target=ROW-136.CON-003.setup-refuses-every-fixed-offset-zone-by-name control=ROW-136.control.setup-with-a-daylight-saving-zone-finishes
// ROW-136 cases: ROW-136 target=ROW-136.CON-003.setup-accepts-named-zones-without-daylight-saving control=ROW-136.control.setup-with-a-daylight-saving-zone-finishes
const DAYLIGHT_SAVING_ZONE = 'America/Chicago';
const NO_DAYLIGHT_SAVING_ZONES = ['America/Guatemala', 'America/Costa_Rica'];
const FIXED_OFFSET_NAMES = [
  // offset spellings
  'GMT+0', 'GMT-0', 'UTC-6', 'GMT-6', 'UTC-06:00', '-06:00',
  // the Etc/ zones
  'Etc/GMT+6', 'Etc/GMT-14', 'Etc/GMT+0', 'Etc/GMT-0', 'Etc/GMT0', 'Etc/GMT', 'Etc/UTC', 'Etc/UCT', 'Etc/Universal', 'Etc/Zulu', 'Etc/Greenwich',
  // the UTC and GMT aliases
  'UTC', 'UCT', 'GMT', 'GMT0', 'Greenwich', 'Universal', 'Zulu',
  // the legacy fixed names
  'EST', 'MST', 'HST',
  // the same names in another letter case (Intl takes zone names case-insensitively)
  'utc', 'etc/gmt+6',
];

test('ROW-136.control.setup-with-a-daylight-saving-zone-finishes', async () => {
  const run = await runSetup(setupArgs(freshSpec(DAYLIGHT_SAVING_ZONE)), 'fresh');
  expect(run.exit, `ROW-136 control: setup with every argument and ${DAYLIGHT_SAVING_ZONE} finishes (stderr: ${run.stderr.slice(0, 300)})`).toBe(0);
  expect(run.stdout, `ROW-136 control: the output shown to the admin names the chosen zone ${DAYLIGHT_SAVING_ZONE}`).toContain(DAYLIGHT_SAVING_ZONE);
});

test('ROW-136.CON-003.setup-refuses-every-fixed-offset-zone-by-name', async () => {
  test.setTimeout(600_000);
  const pre = await runSetup(setupArgs(freshSpec(DAYLIGHT_SAVING_ZONE)), 'fresh');
  if (pre.exit !== 0) {
    throw new Error(`SETUP: the setup command did not finish with every argument and ${DAYLIGHT_SAVING_ZONE} (exit ${pre.exit}): ${pre.stderr.slice(0, 300)}`);
  }
  const finished: string[] = [];
  for (const name of FIXED_OFFSET_NAMES) {
    const run = await runSetup(setupArgs(freshSpec(name)), 'fresh');
    if (run.exit === 0) finished.push(name);
    expect.soft(run.exit, `ROW-136 setup with the fixed-offset name ${JSON.stringify(name)} does not finish (stdout: ${run.stdout.slice(0, 200)})`).not.toBe(0);
    expect.soft(run.exit, `ROW-136 setup with ${JSON.stringify(name)} ends with an exit code`).not.toBeNull();
  }
  expect(finished, 'ROW-136: no fixed-offset zone name finished setup').toEqual([]);
});

test('ROW-136.CON-003.setup-accepts-named-zones-without-daylight-saving', async () => {
  for (const zone of NO_DAYLIGHT_SAVING_ZONES) {
    const run = await runSetup(setupArgs(freshSpec(zone)), 'fresh');
    expect.soft(run.exit, `ROW-136 setup with ${zone} (no daylight saving) finishes (stderr: ${run.stderr.slice(0, 300)})`).toBe(0);
    expect.soft(run.stdout, `ROW-136 the output shown to the admin names the chosen zone ${zone}`).toContain(zone);
  }
});
