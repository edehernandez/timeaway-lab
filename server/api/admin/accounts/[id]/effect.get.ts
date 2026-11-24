// Purpose: GET /api/admin/accounts/:id/effect?action=switch-off (D-029, REQ-016, REQ-025 step one) — what switching
// this account off would change now, as {token, summary}; reading it changes nothing (RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { effectOf } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const admin = requireAdmin(event)
  return effectOf(admin, 'account', getRouterParam(event, 'id'), getQuery(event).action)
})
