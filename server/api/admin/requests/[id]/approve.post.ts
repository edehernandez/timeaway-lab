// Purpose: POST /api/admin/requests/:id/approve {token} (D-029, REQ-009, REQ-025 step two) — the admin approves a
// pending request, only with the token of the confirmation shown; a stale token is refused 409 (RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { approveRequest } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  return approveRequest(admin, getRouterParam(event, 'id'), body)
})
