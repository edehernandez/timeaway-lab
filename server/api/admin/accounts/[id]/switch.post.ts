// Purpose: POST /api/admin/accounts/:id/switch {on, token} (D-029) — switching an account on and off (REQ-016). Built
// by a later step; until then the admin's call is refused, and anyone else's is refused first (RULE-003).
import { accountIdFrom, requireAdmin, switchAccount } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  return switchAccount(admin, id, body)
})
