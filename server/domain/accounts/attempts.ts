// Purpose: the wrong-password bound (D-026, ROW-237, ROW-238): wrong attempts at sign-in and at the current-password
// check are counted per normalised submitted email, whether or not an account holds it; 5 within 15 minutes start a
// 15-minute wait, never a permanent lock. Times come from the team clock (RULE-005). The count lives in the server
// process's memory (D-033): a restart or the test reset clears it.
import { nowMs } from './clock'

const WINDOW_MS = 15 * 60 * 1000
const WAIT_MS = 15 * 60 * 1000
const LIMIT = 5

const wrongAt = new Map<string, number[]>()
const waitUntil = new Map<string, number>()

/** True while `emailKey` (a normalised email) is in its 15-minute wait. */
export function inWait(emailKey: string): boolean {
  const until = waitUntil.get(emailKey)
  if (until === undefined) return false
  if (nowMs() < until) return true
  waitUntil.delete(emailKey)
  return false
}

/** Records one wrong attempt for `emailKey`; the 5th within 15 minutes starts the 15-minute wait. */
export function recordWrongAttempt(emailKey: string): void {
  const t = nowMs()
  if (wrongAt.size > 10_000) {
    // Keep the memory bounded: forget emails with no wrong attempt inside the window.
    for (const [key, times] of wrongAt) if (!times.some((x) => x > t - WINDOW_MS)) wrongAt.delete(key)
  }
  const recent = (wrongAt.get(emailKey) ?? []).filter((x) => x > t - WINDOW_MS && x <= t)
  recent.push(t)
  if (recent.length >= LIMIT) {
    waitUntil.set(emailKey, t + WAIT_MS)
    wrongAt.delete(emailKey)
    return
  }
  wrongAt.set(emailKey, recent)
}

/** Forgets every count and wait (the test reset, DIF-002). */
export function forgetAttempts(): void {
  wrongAt.clear()
  waitUntil.clear()
}
