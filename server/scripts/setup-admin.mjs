// Purpose: the one-time setup command (D-011, CON-001, CON-003): creates the one admin account and sets the team's
// named time zone before anyone signs in. Usage, after `pnpm build`:
//   node server/scripts/setup-admin.mjs --name <display name> --email <email> --password <password>
//        --allowance <whole days> --time-zone <named zone, e.g. Pacific/Auckland>
// It starts the built server in setup mode: the accounts module's start-up step (server/domain/accounts/startup.ts)
// runs the setup on the database TIMEAWAY_DB names and ends the process before the server would listen, so the
// command uses the product's own rules and store and opens no database itself. It refuses, changing nothing, on a
// database that is already set up, and without an explicitly chosen named zone.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const entry = process.env.TIMEAWAY_SERVER_ENTRY ?? resolve(here, '../../.output/server/index.mjs')
if (!existsSync(entry)) {
  console.error(`TimeAway setup refused: the built server is missing at ${entry}; run pnpm build first.`)
  process.exit(1)
}

process.env.TIMEAWAY_SETUP_ARGS = JSON.stringify(process.argv.slice(2))
await import(pathToFileURL(entry).href)

// The start-up step ends the process with the setup's own exit code; reaching here means it did not run.
console.error('TimeAway setup failed: the built server did not run the setup step.')
process.exit(1)
