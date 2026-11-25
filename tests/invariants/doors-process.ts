// Purpose: the process doors of D-048 as the ledger drives them — restart the product (optionally under another process time zone, or once without time-zone data) and wait for it to come back, run the one-time setup command with arguments, read the server's own output, and start the built server in its production profile.
// Provenance: hand-authored (test-author pass, slice 1, batch test-author-16), from DECISIONS.md D-048 (the doors), D-011 (the setup command) and D-029 (the test gate); a public harness boundary beside harness.ts, imported by ledger tests only.
//
// This module drives doors; it asserts nothing about any row. It reaches the product only over HTTP at
// VID_PRODUCT_URL through harness.ts, opens no database and reads no application code. A door that does not answer
// as read here throws a SetupError ("SETUP: …") naming the door and the status, so a missing door reads as setup.
//
// Readings of D-048 where it gives no shape (stated here once, used by every test that imports this module):
//   - restart: POST /api/__test/restart {timeZone?, withoutTzData?} answers 2xx, then the server ends and the image's
//     supervisor starts it again on the same database. timeZone is the process time zone (TZ) of the start that
//     follows; omitted, the image's own default. withoutTzData: true makes the ONE start that follows run without
//     time-zone data; when that start ends by itself the supervisor starts the server again as usual (no option), so
//     the product is reachable again after it. "Back" is: GET /api/health was seen failing after the door answered
//     (the server did end) and then answering 2xx.
//   - setup: POST /api/__test/setup {args, database} runs the setup command (server/scripts/setup-admin.mjs) as a child
//     with `args` (an array of strings) and answers {exit, stdout, stderr}: exit the child's exit code. database
//     "existing" runs it against the product's own database; "fresh" against a new, empty one.
//   - The setup command's arguments, as setupArgs writes them: --name <display name> --email <email>
//     --password <password> --allowance <whole days> --time-zone <zone>. A command that reads other flags fails the
//     tests' own precondition (setup with every argument on a fresh database finishes), never a row's refusal.
//   - logs: GET /api/__test/logs?since=<n> answers the server's output lines captured since line n (0 the first),
//     as {lines: string[]} or a bare array of strings, optionally with `next` (the cursor after them). The capture
//     is the supervisor's: it runs across the restarts the restart door makes.
//   - production-start: POST /api/__test/production-start {env} starts the built server in its production profile
//     (VID_TEST unset) as a child with `env` and answers {exit, output}: exit the child's exit code when it ended by
//     itself within the door's bound, null when it was still running at that bound (the door then stops it).
import { anonymousApi, requireOk, SetupError } from './harness';

// ---------------------------------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------------------------------

async function healthy(): Promise<boolean> {
  const api = await anonymousApi();
  try {
    const res = await api.get('/api/health', { timeout: 2_000 });
    return res.ok();
  } catch {
    return false;
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits (bounded poll) until GET /api/health answers 2xx; throws a SetupError naming `why` when it does not within `timeoutMs`. */
export async function waitForHealth(why: string, timeoutMs = 120_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await healthy()) return;
    await pause(100);
  }
  throw new SetupError(`GET /api/health did not answer 2xx within ${timeoutMs / 1000} s ${why}`);
}

// ---------------------------------------------------------------------------------------------------
// The restart door
// ---------------------------------------------------------------------------------------------------

export interface RestartOptions {
  /** The process time zone (TZ) of the start that follows; omitted, the image's default. */
  timeZone?: string;
  /** The one start that follows runs without time-zone data. */
  withoutTzData?: boolean;
}

/**
 * Restarts the product on the same database through POST /api/__test/restart, then waits until it is back: the
 * health route seen failing (the server ended) and then answering 2xx. Throws a SetupError when the door does not
 * answer 2xx, when the server is never seen ending, or when it does not come back.
 */
export async function restartProduct(opts: RestartOptions = {}): Promise<void> {
  const data: Record<string, unknown> = {};
  if (opts.timeZone !== undefined) data.timeZone = opts.timeZone;
  if (opts.withoutTzData !== undefined) data.withoutTzData = opts.withoutTzData;
  const api = await anonymousApi();
  try {
    await requireOk(await api.post('/api/__test/restart', { data }), `POST /api/__test/restart ${JSON.stringify(data)}`);
  } finally {
    await api.dispose().catch(() => undefined);
  }
  const downBy = Date.now() + 30_000;
  let wentDown = false;
  while (Date.now() < downBy) {
    if (!(await healthy())) {
      wentDown = true;
      break;
    }
    await pause(50);
  }
  if (!wentDown) throw new SetupError(`the server did not end within 30 s after POST /api/__test/restart ${JSON.stringify(data)} answered`);
  await waitForHealth(`after POST /api/__test/restart ${JSON.stringify(data)}`);
}

// ---------------------------------------------------------------------------------------------------
// The setup door
// ---------------------------------------------------------------------------------------------------

export interface SetupRun {
  exit: number | null;
  stdout: string;
  stderr: string;
}

/** The setup command's fields; timeZone omitted leaves --time-zone out of the arguments. */
export interface SetupSpec {
  name: string;
  email: string;
  password: string;
  allowance: number;
  timeZone?: string;
}

/** The setup command's arguments for `spec`, in the reading stated at the head of this module. */
export function setupArgs(spec: SetupSpec): string[] {
  const args = ['--name', spec.name, '--email', spec.email, '--password', spec.password, '--allowance', String(spec.allowance)];
  if (spec.timeZone !== undefined) args.push('--time-zone', spec.timeZone);
  return args;
}

/** Runs the setup command with `args` through POST /api/__test/setup {args, database} and answers {exit, stdout, stderr}, unjudged. */
export async function runSetup(args: string[], database: 'existing' | 'fresh'): Promise<SetupRun> {
  const api = await anonymousApi();
  try {
    const what = `POST /api/__test/setup (database ${database})`;
    const res = await requireOk(await api.post('/api/__test/setup', { data: { args, database }, timeout: 120_000 }), what);
    const body = (await res.json().catch(() => null)) as Partial<SetupRun> | null;
    if (!body || typeof body !== 'object' || !(typeof body.exit === 'number' || body.exit === null)) {
      throw new SetupError(`${what} answered without {exit, stdout, stderr}`);
    }
    return { exit: body.exit, stdout: String(body.stdout ?? ''), stderr: String(body.stderr ?? '') };
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------
// The logs door
// ---------------------------------------------------------------------------------------------------

export interface LogRead {
  lines: string[];
  /** The cursor after these lines: pass it as `since` to read only what comes later. */
  next: number;
}

/** The server's own output lines captured since line `since`: GET /api/__test/logs?since=<n>. */
export async function readLogs(since = 0): Promise<LogRead> {
  const api = await anonymousApi();
  try {
    const route = `/api/__test/logs?since=${since}`;
    const res = await requireOk(await api.get(route), `GET ${route}`);
    const body = (await res.json().catch(() => null)) as unknown;
    const lines = Array.isArray(body) ? body : (body as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(lines)) throw new SetupError(`GET ${route} answered without lines`);
    const next = (body as { next?: unknown } | null)?.next;
    return { lines: lines.map(String), next: typeof next === 'number' ? next : since + lines.length };
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

/** The cursor at the end of the server's output so far (read every line once). */
export async function logMark(): Promise<number> {
  let since = 0;
  for (;;) {
    const read = await readLogs(since);
    if (read.lines.length === 0 || read.next <= since) return since;
    since = read.next;
  }
}

// ---------------------------------------------------------------------------------------------------
// The production-start door
// ---------------------------------------------------------------------------------------------------

export interface ProductionStart {
  /** The child's exit code when it ended by itself within the door's bound; null when it was still running then. */
  exit: number | null;
  output: string;
}

/** Starts the built server in its production profile with `env` (POST /api/__test/production-start {env}) and answers {exit, output}, unjudged. */
export async function productionStart(env: Record<string, string>): Promise<ProductionStart> {
  const api = await anonymousApi();
  try {
    const what = `POST /api/__test/production-start ${JSON.stringify(Object.keys(env))}`;
    const res = await requireOk(await api.post('/api/__test/production-start', { data: { env }, timeout: 120_000 }), what);
    const body = (await res.json().catch(() => null)) as Partial<ProductionStart> | null;
    if (!body || typeof body !== 'object' || !(typeof body.exit === 'number' || body.exit === null)) {
      throw new SetupError(`${what} answered without {exit, output}`);
    }
    return { exit: body.exit, output: String(body.output ?? '') };
  } finally {
    await api.dispose().catch(() => undefined);
  }
}
