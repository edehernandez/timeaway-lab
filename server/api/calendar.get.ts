// Purpose: GET /api/calendar?year&month (D-029, D-027, REQ-009 arm 4) — who is away on each day of one month, by
// display name and account id only (RULE-002: no kind of absence is ever sent).
import { requireSession } from '~~/server/domain/accounts'
import { calendarForViewer } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const me = requireSession(event)
  const q = getQuery(event)
  return calendarForViewer(me, { year: q.year, month: q.month })
})
