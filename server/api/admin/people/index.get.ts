// Purpose: GET /api/admin/people (D-029) — the admin's people list: every account with its email, state, this
// year's allowance, and the allowance and balanceFor's figures for the current and the next year (REQ-020, REQ-023;
// RULE-001, RULE-003).
import { requireAdmin } from '~~/server/domain/accounts'
import { peopleWithYears } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return peopleWithYears()
})
