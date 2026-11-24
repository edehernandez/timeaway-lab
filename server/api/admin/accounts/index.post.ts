// Purpose: POST /api/admin/accounts with D-029's body → 201 {id} — the admin creates an account (REQ-013, REQ-024);
// only the admin (RULE-003, REQ-013 arm 4). The fields are checked by the accounts module's createAccount.
import { createAccount, requireAdmin } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const admin = requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const created = await createAccount(admin, body)
  setResponseStatus(event, 201)
  return created
})
