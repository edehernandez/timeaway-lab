// Purpose: POST /api/admin/requests/:id/reject {token, note} (D-029, REQ-008 arm 5, REQ-009, REQ-025 step two) — the
// admin rejects a pending request with an optional note of at most 200 characters, only with the token of the
// confirmation shown; a stale token is refused 409 (RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { rejectRequest } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  return rejectRequest(admin, getRouterParam(event, 'id'), body)
})
