// Purpose: the accounts module's public surface (ARCHITECTURE.md server/domain/accounts): accounts, sign-in,
// sessions, passwords, names, per-year allowances, switching, the admin marker and the team clock.
// The skeleton holds only readiness and the team clock's contract; each slice adds what its rows need.
import { db } from '~~/server/db'

/** Opens the database (running its migrations); throws when it cannot. Used by the readiness route. */
export function ready(): void {
  db()
}

/** Today in the team's time zone as YYYY-MM-DD (D-007, RULE-005). Built by the slice that builds the clock. */
export function todayInTeamZone(): string {
  throw new Error('not built yet: the team clock (RULE-005)')
}
