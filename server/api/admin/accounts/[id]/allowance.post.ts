// Purpose: POST /api/admin/accounts/:id/allowance {allowance, startsNextYear} (D-029) — the admin sets an allowance,
// kept as a change by starting year (REQ-011, D-025; RULE-003).
import { accountIdFrom, requireAdmin, setAllowance } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  setAllowance(admin, id, body)
  return { ok: true }
})
