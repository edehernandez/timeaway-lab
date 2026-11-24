// Purpose: POST /api/admin/accounts/:id/name {name} (D-029) — the admin renames an account (REQ-020, REQ-024; RULE-003).
import { accountIdFrom, renameAccount, requireAdmin } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const id = accountIdFrom(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => ({}))
  renameAccount(admin, id, body)
  return { ok: true }
})
