// Purpose: POST /api/admin/accounts/:id/email {email} (D-029) — the admin changes an account's email (REQ-027; RULE-003).
import { accountIdFrom, changeEmail, requireAdmin } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  changeEmail(admin, id, body)
  return { ok: true }
})
