// Purpose: the product image's start command (Dockerfile target product, D-048): it starts the built server, starts
// it again whenever it ends (on the same database), and keeps the server's own output lines in one capture file that
// spans those starts. The test-only restart door (POST /api/__test/restart) tells it, before the server ends, how the
// next start runs: under another process time zone (TZ), or once without time-zone data. Stopping the supervisor
// (SIGTERM, SIGINT) stops the server and starts nothing again.
import { fork } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const entry = process.env.TIMEAWAY_SERVER_ENTRY ?? resolve('.output/server/index.mjs')
const logFile = process.env.TIMEAWAY_LOG_FILE ?? join(tmpdir(), 'timeaway-server.log')
mkdirSync(dirname(logFile), { recursive: true })
writeFileSync(logFile, '')

const baseEnv = { ...process.env, TIMEAWAY_LOG_FILE: logFile, TIMEAWAY_SERVER_ENTRY: entry }
delete baseEnv.TIMEAWAY_SETUP_ARGS

let child = null
let stopping = false
let next = {}

function note(text) {
  process.stdout.write(`supervisor: ${text}\n`)
}

/** A folder whose time-zone data files cannot be read: ICU, pointed at it, knows no named zone (ROW-136). */
function noTimeZoneData() {
  const dir = mkdtempSync(join(tmpdir(), 'timeaway-no-tzdata-'))
  for (const f of ['zoneinfo64.res', 'timezoneTypes.res', 'metaZones.res', 'windowsZones.res']) writeFileSync(join(dir, f), 'no time-zone data')
  return dir
}

/** Copies one output stream of the server line by line into the capture file and to this process's own output. */
function capture(stream, out) {
  let partial = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    out.write(chunk)
    const parts = (partial + chunk).split('\n')
    partial = parts.pop() ?? ''
    if (parts.length > 0) appendFileSync(logFile, parts.map((l) => `${l}\n`).join(''))
  })
  stream.on('end', () => {
    if (partial !== '') appendFileSync(logFile, `${partial}\n`)
    partial = ''
  })
}

function start() {
  const opts = next
  next = {}
  const env = { ...baseEnv }
  if (typeof opts.timeZone === 'string' && opts.timeZone !== '') env.TZ = opts.timeZone
  if (opts.withoutTzData === true) env.ICU_TIMEZONE_FILES_DIR = noTimeZoneData()
  note(`starting the server${env.TZ ? ` (TZ=${env.TZ})` : ''}${opts.withoutTzData ? ' without time-zone data' : ''}`)
  const started = performance.now() // elapsed time only, never the date
  child = fork(entry, [], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  capture(child.stdout, process.stdout)
  capture(child.stderr, process.stderr)
  child.on('message', (msg) => {
    if (msg && typeof msg === 'object' && msg.type === 'timeaway-restart') {
      next = { timeZone: msg.timeZone, withoutTzData: msg.withoutTzData === true }
    }
  })
  child.on('exit', (code, signal) => {
    child = null
    note(`the server ended (${signal ?? `exit ${code}`})`)
    if (stopping) process.exit(code ?? 0)
    // A start that ends by itself at once is not retried in a tight loop.
    const wait = performance.now() - started < 2000 && Object.keys(next).length === 0 ? 1000 : 0
    setTimeout(start, wait)
  })
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    stopping = true
    if (child) child.kill(sig)
    else process.exit(0)
  })
}

start()
