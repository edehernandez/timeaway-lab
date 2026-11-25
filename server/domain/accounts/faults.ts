// Purpose: the fault door's armed step (D-048, D-049, ROW-199) — the test harness arms "<action>:after-first-write"
// and the next such multi-record action throws inside its write transaction after its first write, so the
// transaction rolls back and the route answers no success. Honoured only in the test profile (DIF-001).
import { testControlEnabled } from './clock'

/** The multi-record actions the fault door can make fail part-way (D-049). */
export const FAULT_ACTIONS = ['switch-off', 'partial-cancel', 'password-set', 'password-change', 'allowance-change', 'approve', 'reject'] as const
export type FaultAction = (typeof FAULT_ACTIONS)[number]

let armed: FaultAction | null = null

/** Arms the fault named `at` ("<action>:after-first-write"); answers false for a step the door does not know. */
export function armFault(at: unknown): boolean {
  if (!testControlEnabled() || typeof at !== 'string') return false
  const m = /^([a-z-]+):after-first-write$/.exec(at)
  const action = m?.[1] as FaultAction | undefined
  if (!action || !FAULT_ACTIONS.includes(action)) return false
  armed = action
  return true
}

/** Forgets an armed fault (the test reset). */
export function disarmFault(): void {
  armed = null
}

/**
 * Called by each multi-record action right after its first write, inside its write transaction: when the fault door
 * armed this action, it is disarmed and the action fails here, before anything commits.
 */
export function faultPoint(action: FaultAction): void {
  if (armed !== action || !testControlEnabled()) return
  armed = null
  throw new Error(`test fault: ${action} failed after its first write (POST /api/__test/fault)`)
}
