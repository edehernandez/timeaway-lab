// Purpose: the accounts module's start-up step, a Nitro plugin (nuxt.config.ts nitro.plugins) that runs before the
// built server listens: it refuses to start a runtime that has no time-zone data (CON-003, ROW-136), and, when the
// process was started as the one-time setup command (server/scripts/setup-admin.mjs, D-011), it runs the setup and
// ends the process with its exit code instead of serving.
import { writeSync } from 'node:fs'
import { setupInstall, type SetupOutcome } from './accounts'
import { timeZoneDataProblem } from './clock'

export default defineNitroPlugin(() => {
  // CON-003, ROW-136: every date the product decides is read in the team's named zone; a runtime that cannot read a
  // named zone would silently work out today in UTC, so it does not start.
  const problem = timeZoneDataProblem()
  if (problem !== null) {
    writeSync(
      2,
      `TimeAway refuses to start: this runtime has no time-zone data (${problem}), so today could not be worked out in the team's time zone.\n`,
    )
    process.exit(1)
  }

  // D-011: the setup command. Everything here is synchronous, so it ends before the server would listen.
  const raw = process.env.TIMEAWAY_SETUP_ARGS
  if (raw === undefined) return
  let outcome: SetupOutcome
  try {
    const args: unknown = JSON.parse(raw)
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) throw new Error('the setup arguments are not a list of words')
    outcome = setupInstall(args)
  } catch (e) {
    outcome = { exit: 1, out: '', err: `TimeAway setup failed: ${e instanceof Error ? e.message : String(e)}\n` }
  }
  if (outcome.out !== '') writeSync(1, outcome.out)
  if (outcome.err !== '') writeSync(2, outcome.err)
  process.exit(outcome.exit)
})
