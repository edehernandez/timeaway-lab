// Purpose: the test harness doors of D-048 as D-049 reads them — the store door (one statement past the product's
// routes), the log door (the server's own output lines, captured by the image's supervisor across restarts), the
// restart door, the setup door (the one-time setup command run as a child) and the production-start door (the built
// server started in its production profile as a child). Reached only through /api/__test routes, which answer 404
// outside the test profile (DIF-001).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runStatement } from '~~/server/db'
import { fieldsOf } from './accounts'
import { refuse } from './refusals'

// ---------------------------------------------------------------------------------------------------
// The store door
// ---------------------------------------------------------------------------------------------------

/** POST /api/__test/store {sql, params}: the statement's rows and changes, or the store's refusal in `error` (D-049). */
export function storeDoor(body: unknown): { rows: unknown[]; changes: number; error: string | null } {
  const f = fieldsOf(body)
  if (typeof f.sql !== 'string' || f.sql.trim() === '') refuse(400, 'sql must be one statement.')
  if (f.params !== undefined && !Array.isArray(f.params)) refuse(400, 'params must be a list.')
  const params = ((f.params as unknown[] | undefined) ?? []).map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p))
  try {
    return { ...runStatement(f.sql, params), error: null }
  } catch (e) {
    return { rows: [], changes: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------------------------------------------------------------------------------------------------
// The log door
// ---------------------------------------------------------------------------------------------------

/** GET /api/__test/logs?since=<n>: the server's complete output lines from line n on, and the line count after them. */
export function logsDoor(sinceParam: unknown): { lines: string[]; next: number } {
  const file = process.env.TIMEAWAY_LOG_FILE
  if (!file) refuse(503, 'This server runs without the supervisor, so its output is not captured.')
  const raw = Number(sinceParam ?? 0)
  const since = Number.isInteger(raw) && raw > 0 ? raw : 0
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const all = text.split('\n')
  all.pop() // the part after the last newline: empty, or a line still being written
  return { lines: all.slice(since), next: all.length }
}

// ---------------------------------------------------------------------------------------------------
// The restart door
// ---------------------------------------------------------------------------------------------------

/**
 * POST /api/__test/restart {timeZone?, withoutTzData?}: tells the image's supervisor how the next start runs and
 * answers the function that ends this server, which the route calls once its answer has been sent.
 */
export function restartDoor(body: unknown): () => void {
  const f = fieldsOf(body)
  if (f.timeZone !== undefined && (typeof f.timeZone !== 'string' || f.timeZone.trim() === '')) refuse(400, 'timeZone must be a time zone name.')
  if (f.withoutTzData !== undefined && typeof f.withoutTzData !== 'boolean') refuse(400, 'withoutTzData must be true or false.')
  const send = process.send?.bind(process)
  if (!send) refuse(503, 'This server runs without the supervisor, so it cannot be restarted.')
  let told = false
  let asked = false
  const end = () => {
    if (told && asked) process.exit(0)
  }
  send({ type: 'timeaway-restart', timeZone: f.timeZone, withoutTzData: f.withoutTzData === true }, undefined, {}, () => {
    told = true
    end()
  })
  return () => {
    asked = true
    setTimeout(end, 20)
  }
}

// ---------------------------------------------------------------------------------------------------
// Child processes: the setup command and the production start
// ---------------------------------------------------------------------------------------------------

interface ChildRun {
  exit: number | null
  stdout: string
  stderr: string
  output: string
}

/** Runs node `args` with `env`; answers when it ends, or at `boundMs` (exit null, the child then stopped). */
function runChild(args: string[], env: NodeJS.ProcessEnv, boundMs: number): Promise<ChildRun> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const run: ChildRun = { exit: null, stdout: '', stderr: '', output: '' }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c: string) => {
      run.stdout += c
      run.output += c
    })
    child.stderr.on('data', (c: string) => {
      run.stderr += c
      run.output += c
    })
    let bounded = false
    const timer = setTimeout(() => {
      bounded = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    }, boundMs)
    child.on('error', (e) => {
      run.stderr += String(e)
      run.output += String(e)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      run.exit = bounded ? null : (code ?? (signal ? 128 : 1))
      done(run)
    })
  })
}

function serverEntry(): string {
  return process.env.TIMEAWAY_SERVER_ENTRY ?? resolve('.output/server/index.mjs')
}

/** The environment of a child that is not this test server: no test gate, no capture, no setup mode. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of ['TIMEAWAY_SETUP_ARGS', 'TIMEAWAY_LOG_FILE']) delete env[k]
  return env
}

/**
 * POST /api/__test/setup {args, database}: runs the setup command (server/scripts/setup-admin.mjs) with `args`,
 * against the product's own database ("existing") or a new, empty one ("fresh"), and answers {exit, stdout, stderr}.
 */
export async function setupDoor(body: unknown): Promise<{ exit: number | null; stdout: string; stderr: string }> {
  const f = fieldsOf(body)
  if (!Array.isArray(f.args) || !f.args.every((a) => typeof a === 'string')) refuse(400, 'args must be a list of words.')
  if (f.database !== 'existing' && f.database !== 'fresh') refuse(400, 'database must be "existing" or "fresh".')
  const env = childEnv()
  env.TIMEAWAY_SERVER_ENTRY = serverEntry()
  let dir: string | null = null
  if (f.database === 'fresh') {
    dir = mkdtempSync(join(tmpdir(), 'timeaway-setup-'))
    env.TIMEAWAY_DB = join(dir, 'timeaway.sqlite')
  } else {
    env.TIMEAWAY_DB = process.env.TIMEAWAY_DB ?? resolve('.data/timeaway.sqlite')
  }
  const script = process.env.TIMEAWAY_SETUP_SCRIPT ?? resolve('server/scripts/setup-admin.mjs')
  try {
    const run = await runChild([script, ...(f.args as string[])], env, 60_000)
    return { exit: run.exit, stdout: run.stdout, stderr: run.stderr }
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

/** How long a production start is watched before it counts as started (D-049: exit null). */
const PRODUCTION_START_BOUND_MS = 6000

/**
 * POST /api/__test/production-start {env}: starts the built server in its production profile (VID_TEST and the test
 * control switch unset, on its own port and an empty database) with `env` added, and answers {exit, output}: the
 * exit code when it ended by itself within the bound, null when it was still running then (it is stopped).
 */
export async function productionStartDoor(body: unknown): Promise<{ exit: number | null; output: string }> {
  const given = fieldsOf(fieldsOf(body).env)
  if (!Object.values(given).every((v) => typeof v === 'string')) refuse(400, 'env must map names to text.')
  const dir = mkdtempSync(join(tmpdir(), 'timeaway-production-'))
  const env = childEnv()
  for (const k of ['VID_TEST', 'TIMEAWAY_TEST_CONTROL', 'TIMEAWAY_SERVER_ENTRY', 'TIMEAWAY_SETUP_SCRIPT']) delete env[k]
  Object.assign(env, { NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1', TIMEAWAY_DB: join(dir, 'timeaway.sqlite') }, given)
  try {
    const run = await runChild([serverEntry()], env, PRODUCTION_START_BOUND_MS)
    return { exit: run.exit, output: run.output }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
