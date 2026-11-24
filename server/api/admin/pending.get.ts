// Purpose: GET /api/admin/pending (D-029, REQ-008, REQ-022) — the admin's pending requests page data: every pending
// request of every person, oldest sent first, with the figures the requests module computes (RULE-001, RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { listPending } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return listPending()
})
