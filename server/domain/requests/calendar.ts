// Purpose: the month calendar's read of approved days (REQ-009 arm 4, REQ-010, REQ-019, D-027, RULE-002): for each day
// of one month, who is away — the people with an approved request whose Monday to Friday day in effect it is — by
// display name and account id only, never the kind of absence.
import { and, eq, gte, lte } from 'drizzle-orm'
import { db, schema } from '~~/server/db'
import { listPeople, todayInTeamZone, type Actor } from '~~/server/domain/accounts'
import { addDays } from './days'
import { daysInEffect, refuse } from './requests'

const { requests } = schema

/** One calendar day: the date and who is away on it (D-027: name and account id, nothing else). */
export interface CalendarDay {
  date: string
  people: { name: string; accountId: number }[]
}

function monthFrom(rawYear: unknown, rawMonth: unknown): { year: number; month: number } {
  if (rawYear === undefined && rawMonth === undefined) {
    const today = todayInTeamZone()
    return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
  }
  const year = typeof rawYear === 'string' && /^[0-9]{4}$/.test(rawYear) ? Number(rawYear) : NaN
  const month = typeof rawMonth === 'string' && /^[0-9]{1,2}$/.test(rawMonth) ? Number(rawMonth) : NaN
  if (!(year >= 1000 && year <= 9999) || !(month >= 1 && month <= 12)) refuse(400, 'Give the month as a year and a month number from 1 to 12.')
  return { year, month }
}

/**
 * GET /api/calendar?year&month data, the same for every viewer (RULE-002): every day of the month, each with the
 * people away on it. A person is away on a day of an approved request's days in effect (a partly cancelled request
 * up to the day before its cancel day; Saturdays and Sundays never, REQ-001 arm 2).
 */
export function calendarForViewer(_viewer: Actor, query: { year?: unknown; month?: unknown }): { year: number; month: number; days: CalendarDay[] } {
  const { year, month } = monthFrom(query.year, query.month)
  const mm = String(month).padStart(2, '0')
  const first = `${year}-${mm}-01`
  const last = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`, -1)
  const rows = db()
    .select({ accountId: requests.accountId, firstDay: requests.firstDay, lastDay: requests.lastDay, cancelFrom: requests.cancelFrom })
    .from(requests)
    .where(and(eq(requests.state, 'approved'), lte(requests.firstDay, last), gte(requests.lastDay, first)))
    .all()
  const names = new Map(listPeople().map((p) => [p.id, p.name]))
  const away = new Map<string, Set<number>>()
  for (const r of rows) {
    for (const d of daysInEffect(r)) {
      if (d < first || d > last) continue
      let set = away.get(d)
      if (!set) away.set(d, (set = new Set()))
      set.add(r.accountId)
    }
  }
  const days: CalendarDay[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const people = [...(away.get(d) ?? [])]
      .map((accountId) => ({ name: names.get(accountId) ?? '', accountId }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.accountId - b.accountId)
    days.push({ date: d, people })
  }
  return { year, month, days }
}
