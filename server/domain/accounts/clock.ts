// Purpose: the team clock (RULE-005, D-007, D-031) — the ONE place server code reads the current time. It honours
// the test harness's injected instant only when the test control door is on (DIF-001), and turns an instant into
// the team's calendar date in the team time zone (D-013).

/** True only in the test profile: VID_TEST=1 and TIMEAWAY_TEST_CONTROL=1 (DIF-001, DIF-002). */
export function testControlEnabled(): boolean {
  return process.env.VID_TEST === '1' && process.env.TIMEAWAY_TEST_CONTROL === '1'
}

let injected: number | null = null

/** Sets the instant the clock reports (ISO 8601), or null for the real clock again. Test profile only (DIF-001). */
export function setInjectedNow(iso: string | null): void {
  if (!testControlEnabled()) throw new Error('the clock override is honoured only in the test profile (DIF-001)')
  if (iso === null) {
    injected = null
    return
  }
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`not an ISO 8601 instant: ${iso}`)
  injected = ms
}

/** The current instant in epoch milliseconds: the injected instant in the test profile when one is set, else the system clock. */
export function nowMs(): number {
  if (injected !== null && testControlEnabled()) return injected
  return new Date().getTime()
}

/** The current instant as an ISO 8601 string (UTC). */
export function nowIso(): string {
  return new Date(nowMs()).toISOString()
}

/** True when `zone` is a time zone name this runtime knows (e.g. "Pacific/Auckland"). */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * CON-003, ROW-136, A-054 (D-054): the zone names that are a fixed offset by name, upper-cased — the UTC and GMT
 * aliases and the legacy fixed names. The Etc/ zones and the offset spellings are refused by their shape below.
 */
const FIXED_OFFSET_NAMES = new Set(['UTC', 'UCT', 'UT', 'GMT', 'GMT0', 'GMT+0', 'GMT-0', 'GREENWICH', 'UNIVERSAL', 'ZULU', 'EST', 'MST', 'HST', 'FACTORY'])

/** CON-003, ROW-136, A-054: true when `name` (as given, or as the runtime resolved it) is a fixed offset by name, in any letter case. */
function isFixedOffsetName(name: string): boolean {
  const upper = name.toUpperCase()
  if (FIXED_OFFSET_NAMES.has(upper)) return true
  if (upper.startsWith('ETC/')) return true
  // An offset spelling: "+05:30", "-06:00", "UTC-6", "GMT+2", "UTC-06:00", "Z+1".
  return /^(UTC|GMT|UT|Z)?[+-]/.test(upper)
}

/**
 * CON-003, D-013, ROW-136, A-054 (D-054): true when `zone` is a NAMED geographic time zone this runtime knows
 * ("Pacific/Auckland", "America/Guatemala"), with or without daylight saving — never a fixed offset, which Intl would
 * also take: an offset spelling ("+05:30", "UTC+2", "GMT-3", "GMT+0"), an Etc/ zone ("Etc/GMT+6", "Etc/UTC"), a UTC or
 * GMT alias (UTC, UCT, GMT, GMT0, Greenwich, Universal, Zulu) or a legacy fixed name (EST, MST, HST), in any letter
 * case, and whether the name is refused as given or as the runtime resolves it. The rule is by name, never by
 * watching the offset over a year, so a geographic zone that keeps one offset all year is accepted.
 */
export function isNamedTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone !== zone.trim()) return false
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z][A-Za-z0-9_+-]*)*$/.test(zone)) return false
  if (isFixedOffsetName(zone)) return false
  try {
    const resolved = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).resolvedOptions().timeZone
    return typeof resolved === 'string' && resolved !== '' && !isFixedOffsetName(resolved)
  } catch {
    return false
  }
}

/**
 * CON-003, ROW-136: the reason this runtime cannot work out a date in a named time zone (it has no time-zone data),
 * or null when it can. Checked against instants whose dates are known: 2021-01-01 12:00 UTC is 2 January in
 * Auckland and 1 January in Los Angeles, which a runtime that falls back to UTC or refuses the names gets wrong.
 */
export function timeZoneDataProblem(): string | null {
  const instant = Date.UTC(2021, 0, 1, 12, 0, 0)
  for (const [zone, want] of [
    ['Pacific/Auckland', '2021-01-02'],
    ['America/Los_Angeles', '2021-01-01'],
  ] as const) {
    try {
      const got = dateInZone(instant, zone)
      if (got !== want) return `the time zone ${zone} reads ${got} where ${want} is right`
    } catch (e) {
      return `the time zone ${zone} cannot be read (${e instanceof Error ? e.message : String(e)})`
    }
  }
  return null
}

/** The calendar date (YYYY-MM-DD) that the wall clock in `zone` shows at the instant `ms` (D-007). */
export function dateInZone(ms: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(ms),
  )
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
