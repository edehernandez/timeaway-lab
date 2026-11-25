// Purpose: GET /api/admin/people/:id/history (D-029) — who changed what and when on an account (RULE-003).
// ROW-138 / REQ-006: `timeZone` is the team's (D-007), so the page shows each change's instant on the team's day.
import { accountIdFrom, personHistory, requireAdmin, teamTimeZone } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return { timeZone: teamTimeZone(), history: personHistory(accountIdFrom(getRouterParam(event, 'id'))) }
})
