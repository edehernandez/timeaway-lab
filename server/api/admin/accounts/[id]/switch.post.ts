// Purpose: POST /api/admin/accounts/:id/switch {on, token} (D-029, REQ-016) — switching an account off, with the token
// of the confirmation shown (REQ-025: the requests module cancels its requests in the same step), or back on {on: true}
// (RULE-003: the admin check comes first).
import { accountIdFrom, requireAdmin, switchAccount } from '~~/server/domain/accounts'
import { switchOffAccount } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  const on = body !== null && typeof body === 'object' ? (body as { on?: unknown }).on : undefined
  if (on === false) return switchOffAccount(admin, id, body)
  return switchAccount(admin, id, body)
})
