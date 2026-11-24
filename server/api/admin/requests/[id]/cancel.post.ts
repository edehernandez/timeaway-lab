// Purpose: POST /api/admin/requests/:id/cancel {token} (D-029, REQ-010, REQ-019, REQ-025 step two) — the admin cancels
// an approved request's Monday to Friday days from today on, only with the token of the confirmation shown; a stale
// token is refused 409 (RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { adminCancel } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  return adminCancel(admin, getRouterParam(event, 'id'), body)
})
