// Purpose: POST /api/admin/accounts/:id/password {password} (D-029) — the admin sets another account's password
// (REQ-015 arms 1, 4, 5, 6; REQ-026; RULE-003).
import { accountIdFrom, requireAdmin, setPassword } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  await setPassword(admin, id, body)
  return { ok: true }
})
