// Purpose: GET /api/admin/people/:id/requests (D-029, REQ-021 data) — every request of one person as the admin's
// person page lists them, each saying whether the admin's cancel applies to it now (RULE-003).
import { accountIdFrom, requireAdmin } from '~~/server/domain/accounts'
import { personRequests } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return personRequests(accountIdFrom(getRouterParam(event, 'id')))
})
