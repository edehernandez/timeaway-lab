// Purpose: the accounts module's public surface (ARCHITECTURE.md server/domain/accounts): accounts, sign-in,
// sessions, passwords, names, per-year allowances, switching, the admin marker and the team clock.
import { db } from '~~/server/db'

export {
  accountIdFrom,
  allowanceChangesOf,
  allowanceFor,
  changeEmail,
  changeOwnPassword,
  createAccount,
  listPeople,
  MAX_SWITCHED_ON,
  personHistory,
  personOf,
  renameAccount,
  requireLiveIn,
  resetForTest,
  setAllowance,
  setPassword,
  switchAccount,
  switchOffIn,
  switchOffTarget,
  teamTimeZone,
  teamYear,
  todayInTeamZone,
  type Actor,
  type Setup,
} from './accounts'
export { nowIso, nowMs, setInjectedNow, testControlEnabled } from './clock'
export { armFault, faultPoint, type FaultAction } from './faults'
export { logsDoor, productionStartDoor, restartDoor, setupDoor, storeDoor } from './test-doors'
export {
  isFormPost,
  requireAdmin,
  requireSession,
  SESSION_COOKIE,
  signIn,
  signOut,
  type SessionUser,
} from './sessions'

/** Opens the database (running its migrations); throws when it cannot. Used by the readiness route. */
export function ready(): void {
  db()
}
