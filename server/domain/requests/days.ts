// Purpose: calendar-day arithmetic for requests (REQ-001, REQ-004, D-007) — the one strict reading of a YYYY-MM-DD day
// from a client, and the Monday to Friday days of a range. Pure date arithmetic on day strings in UTC terms: it never
// reads the clock (RULE-005) and never turns a day into an instant in any time zone.

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function msOf(day: string): number {
  const m = DAY_SHAPE.exec(day)
  if (!m) throw new Error(`not a YYYY-MM-DD day: ${day}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * ROW-131, ROW-132, D-007: the day a client sent, read strictly — a string written exactly YYYY-MM-DD (no spaces, no
 * time, no other order) naming a real calendar date; 2027-02-30 or 2027-13-03 is no day (never rolled over). Null
 * when it is not one.
 */
export function strictDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = DAY_SHAPE.exec(raw)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return null
  const t = Date.UTC(y, mo - 1, d)
  // A real date survives the round trip unchanged; a lenient constructor would have rolled it into the next month.
  return dayOf(t) === raw ? raw : null
}

/** The day `n` calendar days after `day` (n may be negative). */
export function addDays(day: string, n: number): string {
  return dayOf(msOf(day) + n * DAY_MS)
}

/** REQ-001 (A-017): Monday to Friday are the weekdays. */
export function isWeekday(day: string): boolean {
  const w = new Date(msOf(day)).getUTCDay()
  return w >= 1 && w <= 5
}

/** REQ-001: every Monday to Friday day from `first` to `last`, both included (none when last is before first). */
export function weekdaysIn(first: string, last: string): string[] {
  const out: string[] = []
  const end = msOf(last)
  for (let t = msOf(first); t <= end; t += DAY_MS) {
    const d = dayOf(t)
    if (isWeekday(d)) out.push(d)
  }
  return out
}

/** REQ-001 arm 2, ROW-242: the counted days of a range — its Monday to Friday days, both ends included. */
export function countWeekdays(first: string, last: string): number {
  return weekdaysIn(first, last).length
}
