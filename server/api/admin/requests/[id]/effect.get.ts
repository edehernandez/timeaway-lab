// Purpose: GET /api/admin/requests/:id/effect?action=approve|reject|cancel (D-029, REQ-025 step one) — what the
// admin's act would change on this request now, as {token, summary}; reading it changes nothing (RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { effectOf } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const admin = requireAdmin(event)
  return effectOf(admin, 'request', getRouterParam(event, 'id'), getQuery(event).action)
})
