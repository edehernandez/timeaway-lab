// Purpose: GET /api/admin/people/:id/history (D-029) — who changed what and when on an account (RULE-003).
import { accountIdFrom, personHistory, requireAdmin } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return { history: personHistory(accountIdFrom(getRouterParam(event, 'id'))) }
})
