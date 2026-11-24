// Purpose: GET /api/admin/people (D-029) — the admin's people list: every account with its email, state and this
// year's allowance (REQ-020; RULE-003).
import { listPeople, requireAdmin } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return listPeople()
})
